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

// 检查 Resend API Key
if (!process.env.RESEND_API_KEY) {
    console.error("❌ 错误: 缺少 RESEND_API_KEY，邮件发送将不可用");
}
const resend = new Resend(process.env.RESEND_API_KEY);

// 日志目录
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 写入每日日志
const writeLog = async (data) => {
    const dateStr = new Date().toISOString().split('T')[0];
    const file = path.join(LOG_DIR, `luna_whisper_leads_${dateStr}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try {
        await fs.promises.appendFile(file, line);
    } catch (e) {
        console.error('日志写入失败:', e.message);
    }
};

// ---------- 核心提交接口 ----------
app.post('/api/submit', async (req, res) => {
    try {
        const {
            name,
            email,
            whatsapp,
            session_plan,   // 前端传 "single"
            session_type,
            preferred_time,
            special_request,
            referrer,
            honeypot
        } = req.body;

        // 1. 反垃圾：honeypot 有值直接返回成功，不处理
        if (honeypot) {
            return res.json({ status: 'success' });
        }

        // 2. 必填字段验证
        if (!name || !email || !session_type) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: name, email, session_type'
            });
        }

        // 3. 价格统一 $10
        const price = 10;
        const planName = 'Single Session ($10)';

        // 4. 生成唯一提交ID
        const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase();

        // 5. 安全过滤
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

        // 6. 写入日志
        await writeLog(cleanData);

        // 7. 发送邮件通知
        const subject = `🌙 New Booking - ${cleanData.name} (${planName})`;

        await resend.emails.send({
            from: 'Luna Whisper <no-reply@yourdomain.com>',  // 改成你自己验证过的域名
            to: ['dpx204825@gmail.com'],                     // 你的接收邮箱
            reply_to: cleanData.email,
            subject: subject,
            html: `
                <h2>🌙 新预约通知</h2>
                <p><strong>客户姓名：</strong> ${cleanData.name}</p>
                <p><strong>邮箱：</strong> ${cleanData.email}</p>
                <p><strong>WhatsApp：</strong> ${cleanData.whatsapp || '未提供'}</p>
                <p><strong>预约类型：</strong> ${cleanData.plan}</p>
                <p><strong>陪伴选择：</strong> ${cleanData.session_type}</p>
                <p><strong>期望时间：</strong> ${cleanData.preferred_time}</p>
                <hr>
                <p><strong>特殊需求：</strong><br>${cleanData.special_request || '无'}</p>
                <p><strong>推荐来源：</strong> ${cleanData.ref || '直接访问'}</p>
                <p><strong>提交ID：</strong> ${cleanData.id}</p>
                <p style="margin-top:25px; color:#888;">请及时与客户确认时间安排。</p>
            `
        });

        // 8. 返回 PayPal 支付链接
        const redirectUrl = `https://paypal.me/dpx710/${price}USD?memo=LW_${submissionId}`;

        return res.status(201).json({
            status: 'success',
            submission_id: submissionId,
            redirect_url: redirectUrl
        });

    } catch (err) {
        console.error('服务器内部错误:', err);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// 静态文件服务（前端页面）
app.use(express.static(publicPath));

// SPA 回退到 index.html
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Page not found');
    }
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {
    console.log(`🌙 Luna Whisper 服务器运行在端口 ${port}`);
});