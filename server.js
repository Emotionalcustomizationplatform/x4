// server.js - Final Fixed Version
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Resend } = require('resend');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 检查环境变量
const requiredEnv = ['RESEND_API_KEY', 'RECEIVE_EMAIL', 'OPENAI_API_KEY'];
for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`❌ 致命错误: 环境变量 ${key} 未设置！`);
        process.exit(1);
    }
}

const resend = new Resend(process.env.RESEND_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'onboarding@resend.dev';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('./')); // 托管静态文件

// AI 分析接口
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No input provided.' });
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: `You are 'ATHENA', a high-end psychological consultant. Analyze the user's input concisely. Format: \n**Core Issue:** [One sentence]\n**Strategic Insight:** [2-3 sentences]. Keep it professional and empathetic.`
                },
                { role: "user", content: text }
            ],
            temperature: 0.5,
            max_tokens: 200,
        });
        res.json({ analysis: completion.choices[0].message.content });
    } catch (error) {
        console.error('AI Error:', error.message);
        res.status(500).json({ error: 'AI unavailable.' });
    }
});

// 表单提交接口 (已修复，确保邮件包含所有信息)
app.post('/api/submit-form', async (req, res) => {
  try {
    // 接收前端发来的所有字段
    const { name, email, phone, referrer, selected_plan, support_type, current_situation } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, msg: 'Missing contact info' });
    }

    console.log(`✅ 新提交: ${name} | ${email}`);

    // 邮件标题逻辑
    let emailSubject = `💰 新订单 ($710): ${name}`;
    if (selected_plan && selected_plan.includes('Initial Dialogue')) {
        emailSubject = `🆓 免费咨询申请: ${name}`;
    }

    // 发送邮件
    await resend.emails.send({
      from: `Private Counsel System <${SENDER_EMAIL}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: emailSubject,
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; color: #333; max-width: 600px;">
          <h2 style="color: #444; border-bottom: 2px solid #eee; padding-bottom: 10px;">New Client Application</h2>
          
          <h3 style="background: #f4f4f4; padding: 10px;">📋 Client Details</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <p><strong>Referrer:</strong> ${referrer || 'None'}</p>

          <h3 style="background: #f4f4f4; padding: 10px;">🎯 Service Preference</h3>
          <p><strong>Plan:</strong> ${selected_plan}</p>
          <p><strong>Focus:</strong> ${support_type}</p>

          <h3 style="background: #f4f4f4; padding: 10px;">📝 Situation / Problem</h3>
          <p style="white-space: pre-wrap; font-style: italic; color: #555;">${current_situation || 'User did not provide details.'}</p>
        </div>
      `
    });

    res.json({ success: true, msg: 'Email sent' });
  } catch (err) {
    console.error('❌ Server Error:', err.message);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running: http://localhost:${PORT}`);
});
