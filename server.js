// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = process.env.PORT || 3000;

// ====================== 安全中间件 ======================
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));

// 速率限制
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 120 }));
const authLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 12, message: { error: '操作太频繁，请稍后再试' } });

// ====================== 配置 ======================
const publicPath = path.join(__dirname, 'public');
const dataPath = path.join(__dirname, 'data');
const logPath = path.join(__dirname, 'logs');

[dataPath, logPath].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const usersFile = path.join(dataPath, 'users.json');
const ordersFile = path.join(dataPath, 'orders.json');

if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
if (!fs.existsSync(ordersFile)) fs.writeFileSync(ordersFile, '[]');

const DB = {
  users: JSON.parse(fs.readFileSync(usersFile, 'utf-8')),
  orders: JSON.parse(fs.readFileSync(ordersFile, 'utf-8')),
  saveUsers() { fs.writeFileSync(usersFile, JSON.stringify(this.users, null, 2)); },
  saveOrders() { fs.writeFileSync(ordersFile, JSON.stringify(this.orders, null, 2)); }
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(32).toString('hex');

console.log('✅ JWT_SECRET 已加载');

// ====================== JWT 中间件 ======================
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '请先登录' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
};

// ====================== 邮件函数 ======================
async function sendEmail(to, subject, html) {
  if (!resend) {
    console.log(`[邮件模拟] ${subject}`);
    return;
  }
  try {
    await resend.emails.send({
      from: 'Luna Whisper <no-reply@lunawhisper.com>',
      to,
      subject,
      html
    });
  } catch (e) {
    console.error('邮件发送失败:', e.message);
  }
}

// ====================== API 路由 ======================

// 注册
app.post('/api/register', authLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: '邮箱和密码必填' });
  if (DB.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: '该邮箱已被注册' });
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    password: hashed,
    name: name || email.split('@')[0],
    balance: 0,
    rechargeCount: 0,
    createdAt: new Date().toISOString()
  };

  DB.users.push(user);
  DB.saveUsers();

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { name: user.name, email: user.email, balance: 0 } });
});

// 登录
app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = DB.users.find(u => u.email === email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: '邮箱或密码错误' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { name: user.name, email: user.email, balance: user.balance || 0 } });
});

// 用户信息
app.get('/api/user', authenticateToken, (req, res) => {
  const user = DB.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ name: user.name, email: user.email, balance: user.balance || 0, rechargeCount: user.rechargeCount || 0 });
});

// 充值
app.post('/api/recharge', authenticateToken, (req, res) => {
  const { amount } = req.body;
  const amt = parseFloat(amount);
  if (!amt || amt < 5) return res.status(400).json({ error: '最低充值金额为 $5' });

  const user = DB.users.find(u => u.id === req.user.userId);
  const isFirst = user.rechargeCount === 0;

  const order = {
    id: 'R' + Date.now().toString(36).toUpperCase(),
    userId: user.id,
    email: user.email,
    amount: amt,
    bonus: isFirst ? amt : 0,
    isFirst,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  DB.orders.push(order);
  DB.saveOrders();

  const paypalLink = `https://paypal.me/dpx710/${amt}USD?memo=RECHARGE_${order.id}`;

  res.json({ orderId: order.id, paypalLink, isFirst, bonus: order.bonus });
});

// 预约提交
app.post('/api/submit', async (req, res) => {
  const { name, email, session_type, preferred_time, special_request, honeypot } = req.body;
  if (honeypot) return res.json({ status: 'success' });

  if (!name || !email || !session_type || !preferred_time) {
    return res.status(400).json({ error: '请填写完整信息' });
  }

  const submissionId = 'LW' + crypto.randomUUID().slice(0, 8).toUpperCase();

  const logEntry = { id: submissionId, name, email, session_type, preferred_time, special_request: special_request || '无', ip: req.ip, ts: new Date().toISOString() };

  const logFile = path.join(logPath, `leads_${new Date().toISOString().split('T')[0]}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

  await sendEmail(process.env.ADMIN_EMAIL, `🌙 新预约 #${submissionId}`, `
    <h2>新预约</h2>
    <p><strong>姓名：</strong>${name}</p>
    <p><strong>邮箱：</strong>${email}</p>
    <p><strong>类型：</strong>${session_type}</p>
    <p><strong>时间：</strong>${preferred_time}</p>
    <p><strong>要求：</strong>${special_request || '无'}</p>
  `);

  res.json({ 
    status: 'success', 
    submission_id: submissionId,
    redirect_url: `https://paypal.me/dpx710/10USD?memo=${submissionId}`
  });
});

app.use(express.static(publicPath));
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`🌙 Luna Whisper 服务已启动 → http://localhost:${port}`);
});