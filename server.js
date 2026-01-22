// server.js (v4.1 - Cleaned up for Simplified Form)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Resend } = require('resend');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. 启动检查 ---
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

// --- 4. AI 分析接口 ---
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No input provided.' });

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: `You are 'ATHENA', a psychological analysis AI. Analyze the user's input. Format:\n\n**Stress Score:** [Score/10]\n\n**Key Stressors:**\n* [Item 1]\n* [Item 2]\n\n**Insight:**\n[Brief empathetic insight].`
                },
                { role: "user", content: text }
            ],
            temperature: 0.5,
            max_tokens: 250,
        });
        res.json({ analysis: completion.choices[0].message.content });
    } catch (error) {
        console.error('AI Error:', error.message);
        res.status(500).json({ error: 'AI unavailable.' });
    }
});

// --- 5. 表单提交接口 (已清理) ---
app.post('/api/submit-form', async (req, res) => {
  try {
    // ★★★ 这里去掉了 current_situation，因为前端不传了 ★★★
    const { name, email, phone, referrer, selected_plan, support_type } = req.body;
    
    if (!name || !email || !selected_plan) {
      return res.status(400).json({ success: false, msg: 'Client info missing' });
    }

    console.log(`✅ 新提交: ${name} | ${support_type}`);

    // 智能标题: 免费咨询 vs 付费
    let emailSubject = `💰 新订单: ${name}`;
    if (selected_plan && selected_plan.includes('Free')) {
        emailSubject = `🆓 免费咨询申请: ${name}`;
    }

    await resend.emails.send({
      from: `Private Counsel Admin <${SENDER_EMAIL}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: emailSubject,
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2 style="color: #D4AF37;">New Client Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <p><strong>Referrer Code:</strong> ${referrer || 'None'}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p><strong>Selected Plan:</strong> <br><span style="font-size:1.1em; font-weight:bold;">${selected_plan}</span></p>
          <p><strong>Primary Focus:</strong> <br><span style="background: #eee; padding: 4px 8px; border-radius: 4px;">${support_type}</span></p>
        </div>
      `
    });

    res.json({ success: true, msg: 'Application received' });

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// --- 6. 启动 ---
app.listen(PORT, () => {
  console.log(`🚀 Server running: http://localhost:${PORT}`);
});
