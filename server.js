// server.js (v4.0 - Final Complete Version)
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
// 如果没有配置发件人邮箱，默认使用 Resend 的测试邮箱，但建议在 .env 配置 SENDER_EMAIL
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'onboarding@resend.dev'; 

// --- 3. 中间件 ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('./')); // 托管当前目录下的静态文件 (index.html, form.html)

// --- 4. AI 分析接口 (用于 Stress Test) ---
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

// --- 5. 表单提交接口 (含智能标题 & 邀请码支持) ---
app.post('/api/submit-form', async (req, res) => {
  try {
    // 解构前端传来的数据
    const { name, email, phone, referrer, selected_plan, support_type, current_situation } = req.body;
    
    // 简单校验
    if (!name || !email || !selected_plan) {
      return res.status(400).json({ success: false, msg: 'Client info missing' });
    }

    console.log(`✅ 收到提交: ${name} | ${selected_plan}`);

    // ★★★ 智能标题逻辑 ★★★
    // 自动判断是 "免费咨询" 还是 "付费意向"
    let emailSubject = `💰 新订单: ${name}`;
    if (selected_plan && selected_plan.includes('Free')) {
        emailSubject = `🆓 免费咨询申请: ${name}`;
    }

    // 发送邮件给你自己
    await resend.emails.send({
      from: `Private Counsel Admin <${SENDER_EMAIL}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: emailSubject,
      html: `
        <h1>新客户申请详情</h1>
        <p><strong>姓名:</strong> ${name}</p>
        <p><strong>邮箱:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>电话:</strong> ${phone || '未填写'}</p>
        <p><strong>介绍人/邀请码:</strong> <span style="color: #D4AF37; font-weight: bold;">${referrer || '无'}</span></p>
        <hr>
        <p><strong>已选套餐:</strong> <span style="font-size:1.1em; font-weight:bold;">${selected_plan}</span></p>
        <p><strong>核心诉求:</strong> ${support_type}</p>
        <p><strong>当前现状:</strong> ${current_situation}</p>
        <br>
        <p style="color:#888; font-size:0.8em;">来自 Private Counsel 官网表单 (v4.0)</p>
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
