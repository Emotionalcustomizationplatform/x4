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

app.set('trust proxy', 1);
app.use(cors());
app.use(bodyParser.json());

if (!process.env.RESEND_API_KEY) console.error("❌ 错误: 缺少 RESEND_API_KEY");
const resend = new Resend(process.env.RESEND_API_KEY);

const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const writeLog = async (data) => {
    const file = path.join(LOG_DIR, `luna_whisper_leads_${new Date().toISOString().split('T')[0]}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try { await fs.promises.appendFile(file, line); } catch (e) { console.error('Log Error:', e); }
};

app.post('/api/submit', async (req, res) => {
    try {
        let { 
            name, 
            email, 
            whatsapp, 
            session_plan, 
            session_type, 
            preferred_time, 
            special_request, 
            referrer, 
            honeypot 
        } = req.body;

        if (honeypot) return res.json({ status: 'success' });

        if (!name || !email || !session_plan) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields' });
        }

        // ==================== 价格映射（单次付费）====================
        let price = 0;
        let planName = 'Unknown';

        switch (session_plan) {
            case '30min':
                price = 69;
                planName = '30 Minutes Session ($69)';
                break;
            case '60min':
                price = 119;
                planName = '60 Minutes Deep Session ($119)';
                break;
            case 'premium':
                price = 199;
                planName = 'Premium 90 Minutes ($199)';
                break;
            default:
                price = 119;
                planName = '60 Minutes Session ($119)';
        }

        const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase();
        const safeText = (str) => (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const cleanData = {
            id: submissionId,
            name: safeText(name),
            email: safeText(email),
            whatsapp: safeText(whatsapp),
            plan: planName,
            amount: price,
            session_type: safeText(session_type || 'Not specified'),
            preferred_time: safeText(preferred_time),
            special_request: safeText(special_request),
            ref: safeText(referrer),
            ip: req.ip
        };

        await writeLog(cleanData);

        // ==================== 邮件通知 ====================
        const subject = `🌙 New Booking - ${cleanData.name} (${planName})`;

        await resend.emails.send({
            from: 'Luna Whisper <no-reply@yourdomain.com>',   // 建议改成你自己的域名
            to: ['dpx204825@gmail.com'],                     // 你的接收邮箱
            reply_to: cleanData.email,
            subject: subject,
            html: `
                <h2>🌙 新预约通知</h2>
                <p><strong>客户姓名：</strong> ${cleanData.name}</p>
                <p><strong>邮箱：</strong> ${cleanData.email}</p>
                <p><strong>WhatsApp：</strong> ${cleanData.whatsapp || '未提供'}</p>
                <p><strong>预约时长：</strong> ${cleanData.plan}</p>
                <p><strong>陪伴类型：</strong> ${cleanData.session_type}</p>
                <p><strong>期望时间：</strong> ${cleanData.preferred_time}</p>
                <hr>
                <p><strong>特殊需求：</strong><br>${cleanData.special_request || '无'}</p>
                <p><strong>推荐来源：</strong> ${cleanData.ref || '直接访问'}</p>
                <p><strong>提交ID：</strong> ${cleanData.id}</p>
                
                <p style="margin-top:25px; color:#888;">
                    请及时与客户确认时间安排。
                </p>
            `
        });

        // 返回成功 + 支付链接（PayPal）
        let responseData = { 
            status: 'success', 
            submission_id: submissionId 
        };

        responseData.redirect_url = `https://paypal.me/dpx710/${price}USD?memo=LW_${submissionId}`;

        return res.status(201).json(responseData);

    } catch (err) {
        console.error('Server Error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

// 静态文件服务
app.use(express.static(publicPath));

// SPA 支持（所有路由返回 index.html）
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Page not found');
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌙 Luna Whisper Server running on port ${port}`);
});