// server.js (v3.1 - Update: Referrer Field Added & Syntax Fixed)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Resend } = require('resend');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. 启动前，严格检查所有环境变量！---
const requiredEnv = ['RESEND_API_KEY', 'RECEIVE_EMAIL', 'OPENAI_API_KEY'];
for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`❌ 致命错误: 环境变量 ${key} 未设置！`);
        process.exit(1); // 直接退出，防止带病运行
    }
}

// --- 2. 初始化服务 ---
const resend = new Resend(process.env.RESEND_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'onboarding@resend.dev'; // 优先用您自己的域名邮箱

// --- 3. 中间件 ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('./')); // 托管当前目录下的静态文件 (index.html, form.html)

// --- 4. AI 分析接口 ---
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'No input provided.' });
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: `You are 'ATHENA', a psychological analysis AI for Private Counsel. Your tone is empathetic, insightful, and professional. Analyze the user's input and provide a structured analysis in Markdown. Your response MUST be in this exact format:\n\n**Stress Score:** [Score/10]\n\n**Key Stressors:**\n* [Stressor 1]\n* [Stressor 2]\n\n**Potential Underlying Emotions:**\n* [Emotion 1]\n* [Emotion 2]\n\n**Professional Insight:**\n[A concluding, empathetic paragraph (2-3 sentences).]`
                },
                { role: "user", content: text }
            ],
            temperature: 0.5,
            max_tokens: 250,
        });

        const analysis = completion.choices[0].message.content;
        res.json({ analysis });

    } catch (error) {
        console.error('❌ OpenAI API Error:', error.message);
        res.status(500).json({ error: 'AI engine is currently unavailable. Please try again later.' });
    }
});

// --- 5. 表单提交接口 (已更新，支持 referrer) ---
app.post('/api/submit-form', async (req, res) => {
  try {
    // ★★★ 在这里从 req.body 中解构出 referrer 字段 ★★★
    const { name, email, phone, referrer, selected_plan, support_type, current_situation } = req.body;
    
    if (!name || !email || !selected_plan) {
      return res.status(400).json({ success: false, msg: 'Client info missing' });
    }

    console.log(`✅ 收到新表单: ${name} | ${email}`);

    // 为了稳定，我们只发邮件给您，不再尝试给客户发自动回复
    await resend.emails.send({
      from: `Private Counsel Admin <${SENDER_EMAIL}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: `💰 新订单: ${name}`,
      html: `
        <h1>新客户申请</h1>
        <p><strong>姓名:</strong> ${name}</p>
        <p><strong>邮箱:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>电话:</strong> ${phone || '未填写'}</p>
        <p><strong>介绍人/邀请码:</strong> <span style="color: #D4AF37; font-weight: bold;">${referrer || '无'}</span></p>
        <hr>
        <p><strong>套餐:</strong> ${selected_plan}</p>
        <p><strong>核心诉求:</strong> ${support_type}</p>
        <p><strong>当前现状:</strong> ${current_situation}</p>
      `
    });

    res.json({ success: true, msg: 'Application received' });

  } catch (err) {
    console.error('❌ 表单提交处理错误:', err.message);
    res.status(500).json({ success: false, msg: 'Server-side error while processing the form.' });
  }
});

// --- 6. 启动服务器 ---
app.listen(PORT, () => {
  console.log(`🚀 Private Counsel 后端已启动: http://localhost:${PORT}`);
});
