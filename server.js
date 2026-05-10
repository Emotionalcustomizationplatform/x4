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
const publicPath = path.join(__dirname, 'public');
const dataPath = path.join(__dirname, 'data');

// 创建数据目录
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

// 简易 JSON 数据库
const DB = {
  users: JSON.parse(fs.readFileSync(path.join(dataPath, 'users.json'), 'utf-8') || '[]'),
  orders: JSON.parse(fs.readFileSync(path.join(dataPath, 'orders.json'), 'utf-8') || '[]'),
  saveUsers() { fs.writeFileSync(path.join(dataPath, 'users.json'), JSON.stringify(this.users, null, 2)); },
  saveOrders() { fs.writeFileSync(path.join(dataPath, 'orders.json'), JSON.stringify(this.orders, null, 2)); }
};

app.set('trust proxy', 1);
app.use(cors());
app.use(bodyParser.json());

// Resend 邮件服务
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const JWT_SECRET = process.env.JWT_SECRET || 'luna-secret-change-me';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'your@email.com';

async function sendEmail(to, subject, html) {
  if (!resend) return;
  try {
    await resend.emails.send({ from: 'Luna Whisper <no-reply@lunawhisper.com>', to, subject, html });
  } catch (e) { console.error('邮件失败:', e.message); }
}

// ==================== 注册 ====================
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: '邮箱和密码必填' });
  if (DB.users.find(u => u.email === email)) return res.status(400).json({ error: '该邮箱已注册' });
  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    email,
    password: hashed,
    name: name || email.split('@')[0],
    balance: 0,
    rechargeCount: 0,
    createdAt: new Date()
  };
  DB.users.push(user);
  DB.saveUsers();
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { name: user.name, email: user.email, balance: user.balance } });
});

// ==================== 登录 ====================
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = DB.users.find(u => u.email === email);
  if (!user) return res.status(400).json({ error: '账号不存在' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: '密码错误' });
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { name: user.name, email: user.email, balance: user.balance } });
});

// ==================== 获取用户信息 ====================
app.get('/api/user', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = DB.users.find(u => u.id === decoded.userId);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    res.json({ name: user.name, email: user.email, balance: user.balance, rechargeCount: user.rechargeCount });
  } catch (e) { res.status(401).json({ error: '登录过期' }); }
});

// ==================== 充值（生成 PayPal 链接） ====================
app.post('/api/recharge', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '请先登录' });
  let userId;
  try { userId = jwt.verify(token, JWT_SECRET).userId; } catch (e) { return res.status(401).json({ error: '登录过期' }); }
  const { amount } = req.body;
  const amt = parseFloat(amount);
  if (!amt || amt < 5) return res.status(400).json({ error: '最低充值 $5' });
  const user = DB.users.find(u => u.id === userId);
  if (!user) return res.status(400).json({ error: '用户不存在' });
  const order = {
    id: crypto.randomUUID().slice(0, 8).toUpperCase(),
    userId,
    email: user.email,
    amount: amt,
    isFirst: user.rechargeCount === 0,
    bonus: user.rechargeCount === 0 ? amt : 0,
    status: 'pending',
    createdAt: new Date()
  };
  DB.orders.push(order);
  DB.saveOrders();
  const paypalLink = `https://paypal.me/dpx710/${amt}USD?memo=RECHARGE_${order.id}`;
  res.json({ orderId: order.id, paypalLink, isFirst: order.isFirst, bonus: order.bonus, message: `充值 $${amt}，首充额外送 $${order.bonus}` });
});

// ==================== 用户通知管理员已支付 ====================
app.post('/api/recharge/confirm/:orderId', async (req, res) => {
  const order = DB.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(400).json({ error: '订单不存在' });
  await sendEmail(
    ADMIN_EMAIL,
    `💰 充值待确认 - ${order.amount} USD (${order.id})`,
    `<h2>充值待确认</h2><p>订单: ${order.id}</p><p>用户: ${order.email}</p><p>金额: $${order.amount}</p><p>首充: ${order.isFirst ? '是（赠送 $'+order.bonus+'）' : '否'}</p><p><a href="http://localhost:${port}/api/admin/confirm-recharge/${order.id}?key=${ADMIN_KEY}">点击确认到账</a></p>`
  );
  res.json({ success: true, message: '已通知管理员' });
});

// ==================== 管理员确认充值 ====================
app.get('/api/admin/confirm-recharge/:orderId', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).send('无权操作');
  const order = DB.orders.find(o => o.id === req.params.orderId);
  if (!order || order.status === 'completed') return res.send('已完成或不存在');
  const user = DB.users.find(u => u.id === order.userId);
  if (!user) return res.send('用户不存在');
  user.balance += order.amount;
  if (order.isFirst && order.bonus > 0) {
    user.balance += order.bonus;
    user.rechargeCount = 1;
  }
  order.status = 'completed';
  DB.saveUsers();
  DB.saveOrders();
  res.send(`✅ 充值成功！用户 ${user.email} 余额增加 $${order.amount + order.bonus}，当前余额 $${user.balance}`);
});

// ==================== 预约提交（$10 固定价格） ====================
app.post('/api/submit', async (req, res) => {
  const { name, email, session_type, preferred_time, special_request, referrer, honeypot } = req.body;
  if (honeypot) return res.json({ status: 'success' });
  if (!name || !email || !session_type) return res.status(400).json({ error: '缺少必填项' });
  const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase();
  const logEntry = {
    id: submissionId, name, email, amount: 10, session_type, preferred_time, special_request, ref: referrer, ip: req.ip, ts: new Date()
  };
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
  fs.appendFileSync(path.join(logDir, `leads_${new Date().toISOString().split('T')[0]}.jsonl`), JSON.stringify(logEntry) + '\n');
  await sendEmail(ADMIN_EMAIL, `🌙 新预约 - ${name}`, `<h2>新预约</h2><p>姓名: ${name}</p><p>邮箱: ${email}</p><p>类型: ${session_type}</p><p>时间: ${preferred_time}</p>`);
  res.json({ status: 'success', submission_id: submissionId, redirect_url: `https://paypal.me/dpx710/10USD?memo=LW_${submissionId}` });
});

// 静态文件 & SPA 回退
app.use(express.static(publicPath));
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`🌙 Luna Whisper 已启动：http://localhost:${port}`));