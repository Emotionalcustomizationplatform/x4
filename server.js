// 1. 引入依赖
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Resend } = require('resend');
require('dotenv').config();

// 2. 初始化
const app = express();
const PORT = process.env.PORT || 3000;

// 3. 环境变量校验
if (!process.env.RESEND_API_KEY) throw new Error('❌ 缺少 RESEND_API_KEY');
if (!process.env.RECEIVE_EMAIL) throw new Error('❌ 缺少 RECEIVE_EMAIL');

const resend = new Resend(process.env.RESEND_API_KEY);
const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL;
const RESEND_FROM = 'onboarding@resend.dev';

// 4. 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./'));

// ===== 防刷：IP + 时间 =====
const rateLimitMap = new Map();

// 5. 表单提交接口
app.post('/api/submit-form', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      program,
      startDate,
      source,
      company // honeypot
    } = req.body;

    const clientIP = req.ip;
    const userAgent = req.get('User-Agent');

    // ===== Honeypot =====
    if (company) {
      return res.status(400).json({ success: false });
    }

    // ===== 限流（1 分钟 2 次）=====
    const now = Date.now();
    const record = rateLimitMap.get(clientIP) || [];
    const recent = record.filter(ts => now - ts < 60 * 1000);

    if (recent.length >= 2) {
      return res.status(429).json({
        success: false,
        msg: 'Too many submissions. Please wait.'
      });
    }

    recent.push(now);
    rateLimitMap.set(clientIP, recent);

    // ===== 基础校验 =====
    if (!name || !email || !phone || !program || !startDate || !source) {
      return res.status(400).json({ success: false, msg: 'Missing fields' });
    }

    if (name.length < 2 || !email.includes('@')) {
      return res.status(400).json({ success: false, msg: 'Invalid data' });
    }

    const programText =
      program === 'program1' ? '定制专属伴侣' :
      program === 'program2' ? '学习中文' : '未选择';

    const sourceText =
      source === 'socialMedia' ? '社交媒体' :
      source === 'friend' ? '朋友推荐' : '其他';

    // ===== 发邮件 =====
    const { data, error } = await resend.emails.send({
      from: `New Lead <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '🔔 新客户表单提交',
      html: `
        <h3>客户信息</h3>
        <table>
          <tr><td>姓名</td><td>${name}</td></tr>
          <tr><td>邮箱</td><td>${email}</td></tr>
          <tr><td>电话</td><td>${phone}</td></tr>
          <tr><td>项目</td><td>${programText}</td></tr>
          <tr><td>开始时间</td><td>${startDate}</td></tr>
          <tr><td>来源</td><td>${sourceText}</td></tr>
          <tr><td>IP</td><td>${clientIP}</td></tr>
          <tr><td>UA</td><td>${userAgent}</td></tr>
          <tr><td>时间</td><td>${new Date().toLocaleString()}</td></tr>
        </table>
      `
    });

    if (error) {
      console.error('❌ 邮件失败：', error);
      return res.status(500).json({ success: false });
    }

    res.json({ success: true, msg: 'Submitted successfully' });

  } catch (err) {
    console.error('❌ 表单异常：', err);
    res.status(500).json({ success: false });
  }
});

// 6. 测试接口
app.get('/test-email', async (req, res) => {
  const { data, error } = await resend.emails.send({
    from: `Test <${RESEND_FROM}>`,
    to: YOUR_RECEIVE_EMAIL,
    subject: 'Resend OK',
    text: '邮件配置正常'
  });

  if (error) return res.send('❌ 失败');
  res.send('✅ 邮件正常');
});

// 7. 启动
app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});