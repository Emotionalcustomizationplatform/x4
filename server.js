// server.js (v3.1 - Referral Enabled)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Resend } = require('resend');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. 严格检查环境变量 ---
const requiredEnv = ['RESEND_API_KEY', 'RECEIVE_EMAIL', 'OPENAI_API_KEY'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ 致命错误: 环境变量 ${key} 未设置！`);
    process.exit(1);
  }
}

// --- 2. 初始化 ---
const resend = new Resend(process.env.RESEND_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'onboarding@resend.dev';

// --- 3. 中间件 ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('./'));

// --- 4. AI 分析接口（保持不变） ---
app.post('/api/analyze', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No input provided.' });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are 'ATHENA', a psychological analysis AI for Private Counsel. Your tone is empathetic, insightful, and professional.`
        },
        { role: "user", content: text }
      ],
      temperature: 0.5,
      max_tokens: 250,
    });

    res.json({ analysis: completion.choices[0].message.content });
  } catch (err) {
    console.error('❌ OpenAI Error:', err.message);
    res.status(500).json({ error: 'AI unavailable' });
  }
});

// --- 5. 表单提交接口（支持推荐人） ---
app.post('/api/submit-form', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      selected_plan,
      support_type,
      current_situation,
      referred_by
    } = req.body;

    if (!name || !email || !selected_plan) {
      return res.status(400).json({ success: false, msg: 'Client info missing' });
    }

    console.log(`✅ 新申请: ${name} | ${email} | Ref: ${referred_by || 'Direct'}`);

    await resend.emails.send({
      from: `Private Counsel Admin <${SENDER_EMAIL}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: `💰 新订单: ${name}`,
      html: `
        <h1>新客户申请</h1>
        <p><strong>姓名:</strong> ${name}</p>
        <p><strong>邮箱:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>电话:</strong> ${phone || '未填写'}</p>
        <hr>
        <p><strong>套餐:</strong> ${selected_plan}</p>
        <p><strong>核心诉求:</strong> ${support_type}</p>
        <p><strong>当前现状:</strong> ${current_situation}</p>
        <hr>
        <p><strong>Introduced By:</strong> ${referred_by || 'Direct / No referral'}</p>
      `
    });

    res.json({ success: true, msg: 'Application received' });
  } catch (err) {
    console.error('❌ 表单处理错误:', err.message);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// --- 6. 启动 ---
app.listen(PORT, () => {
  console.log(`🚀 Private Counsel 后端已启动: http://localhost:${PORT}`);
});