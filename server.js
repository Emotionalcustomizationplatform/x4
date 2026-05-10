require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

app.use(cors());
app.use(bodyParser.json());

const resend = new Resend(process.env.RESEND_API_KEY);

const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

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
        await resend.emails.send({
            from: 'Luna Whisper <noreply@resend.dev>',     // 建议改成你验证过的域名
            to: ['dpx204825@gmail.com'],                   // 你的收件邮箱
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

        // 返回支付链接
        res.json({ 
            status: 'success', 
            redirect_url: `https://paypal.me/dpx710/${price}USD` 
        });

    } catch (err) {
        console.error("错误:", err);
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