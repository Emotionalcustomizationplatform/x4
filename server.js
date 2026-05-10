// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = process.env.PORT || 3000;

// ====================== 中间件 ======================
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '10mb' }));

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

// 默认使用你的邮箱
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'dpx204825@gmail.com';

console.log(`🌙 Luna Whisper 已启动 | 管理员邮箱: ${ADMIN_EMAIL}`);

// ====================== JWT 中间件 ======================
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期' });
  }
};

// ====================== 发送邮件 ======================
async function sendEmail(to, subject, html) {
  if (!resend) {
    console.log(`[邮件模拟] 发给 ${to} | 主题: ${subject}`);
    return;
  }
  try {
    await resend.emails.send({
      from: 'Luna Whisper <no-reply@lunawhisper.com>',
      to,
      subject,
      html
    });
    console.log(`✅ 邮件已发送至 ${to}`);
  } catch (e) {
    console.error('邮件发送失败:', e.message);
  }
}

// ====================== API 路由 ======================

// 注册
app.post('/api/register', async (req, res) => {
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
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = DB.users.find(u => u.email === email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: '邮箱或密码错误' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { name: user.name, email: user.email, balance: user.balance || 0 } });
});

// 获取用户信息
app.get('/api/user', authenticateToken, (req, res) => {
  const user = DB.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ name: user.name, email: user.email, balance: user.balance || 0, rechargeCount: user.rechargeCount || 0 });
});

// 充值
app.post('/api/recharge', authenticateToken, (req, res) => {
  const { amount } = req.body;
  const amt = parseFloat(amount);
  if (!amt || amt < 5) return res.status(400).json({ error: '最低充值 $5' });

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

// 预约提交（支持余额支付）
app.post('/api/submit', authenticateToken, async (req, res) => {
  const { name, session_type, preferred_time, special_request, useBalance } = req.body;
  const user = DB.users.find(u => u.id === req.user.userId);

  if (!user) return res.status(401).json({ error: '请先登录' });
  if (!name || !session_type || !preferred_time) {
    return res.status(400).json({ error: '请填写完整信息' });
  }

  const amount = 10;

  if (useBalance === true) {
    if (user.balance < amount) return res.status(400).json({ error: '余额不足，请充值' });
    user.balance -= amount;
    DB.saveUsers();
  }

  const submissionId = 'LW' + crypto.randomUUID().slice(0, 8).toUpperCase();

  // 发送邮件给你
  await sendEmail(ADMIN_EMAIL, `🌙 新预约 #${submissionId} - ${name}`, `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #c8b6ff;">🌙 新预约通知</h2>
      <p><strong>预约编号：</strong>${submissionId}</p>
      <p><strong>客户姓名：</strong>${name}</p>
      <p><strong>客户邮箱：</strong>${user.email}</p>
      <p><strong>服务类型：</strong>${session_type}</p>
      <p><strong>期望时间：</strong>${preferred_time}</p>
      <p><strong>特殊要求：</strong>${special_request || '无'}</p>
      <p><strong>支付方式：</strong>${useBalance ? '✅ 余额支付' : '💰 PayPal支付'}</p>
      <hr>
      <p>请及时确认并安排陪伴师。</p>
      <small>${new Date().toLocaleString('zh-CN')}</small>
    </div>
  `);

  res.json({
    status: 'success',
    submission_id: submissionId,
    redirect_url: useBalance ? null : `https://paypal.me/dpx710/10USD?memo=${submissionId}`
  });
});

// 静态文件服务
app.use(express.static(publicPath));
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`🌙 Luna Whisper 服务成功运行在端口 ${port}`);
  console.log(`📧 预约通知将发送至: ${ADMIN_EMAIL}`);
});