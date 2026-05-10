require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

app.use(cors());
app.use(bodyParser.json());

// ---------- 1. 检查必要的环境变量 ----------
if (!process.env.RESEND_API_KEY) {
    console.error('❌ 致命错误：环境变量 RESEND_API_KEY 未设置！');
    process.exit(1);
}
const resend = new Resend(process.env.RESEND_API_KEY);
console.log('✅ Resend 客户端初始化成功');

const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ---------- 2. 请求日志中间件（可选，但强烈推荐） ----------
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ---------- 3. 核心预约接口 ----------
app.post('/api/submit', async (req, res) => {
    try {
        const { name, email, whatsapp, session_plan, preferred_time, special_request } = req.body;

        if (!name || !email) {
            return res.status(400).json({ status: 'error', message: 'Missing name or email' });
        }

        // 价格映射
        let price = session_plan === '30min' ? 69 : session_plan === '60min' ? 119 : 199;
        const planName = session_plan === '30min' ? '30 Minutes' :
                        session_plan === '60min' ? '60 Minutes' : '90 Minutes Premium';

        // 发送邮件
        const emailResult = await resend.emails.send({
            from: 'Luna Whisper <noreply@resend.dev>',
            to: ['dpx204825@gmail.com'],   // 可以后续改成环境变量 process.env.TO_EMAIL
            reply_to: email,
            subject: `🌙 新预约 - ${name} - ${planName}`,
            html: `
                <h2>🌙 新预约通知</h2>
                <p><strong>姓名：</strong> ${name}</p>
                <p><strong>邮箱：</strong> ${email}</p>
                <p><strong>WhatsApp：</strong> ${whatsapp || '未提供'}</p>
                <p><strong>时长：</strong> ${planName} ($${price})</p>
                <p><strong>期望时间：</strong> ${preferred_time || '未指定'}</p>
                <p><strong>特殊要求：</strong> ${special_request || '无'}</p>
                <hr>
                <p>请尽快联系客户确认时间。</p>
            `
        });

        // ---------- 关键：打印完整结果 ----------
        console.log('📧 Resend API 返回:', JSON.stringify(emailResult, null, 2));

        // 返回支付链接（如果邮件发送失败，这里依然会返回，你可以根据 emailResult 做判断）
        if (emailResult && emailResult.id) {
            res.json({
                status: 'success',
                redirect_url: `https://paypal.me/dpx710/${price}USD`
            });
        } else {
            // 如果 Resend 返回但没有 id，可能是失败
            console.error('⚠️ Resend 返回异常，缺少 id');
            res.status(500).json({ status: 'error', message: '邮件服务异常，请稍后再试' });
        }
    } catch (err) {
        console.error("❌ 错误:", err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 静态文件 + SPA 支持
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌙 Luna Whisper Server running on http://localhost:${port}`);
});