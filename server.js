require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

const app = express();
const port = 3000;

// === 0. 基础配置检查 ===
if (!process.env.RESEND_API_KEY) {
    console.error("❌ FATAL: RESEND_API_KEY missing in .env");
    process.exit(1);
}
const resend = new Resend(process.env.RESEND_API_KEY);

// === 1. 静态首页支持 ===
app.use(express.static(path.join(__dirname, 'public')));

// === 2. 安全中间件 ===
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:5500'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(bodyParser.json());

// === 3. 限流配置 ===
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    handler: (req, res) => res.status(429).json({
        status: 'error',
        message: "Too many requests. Please try again later."
    })
});

// === 4. 日志工具 ===
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const getLogPath = (type) => {
    const dateStr = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `${type}_${dateStr}.jsonl`);
};

const appendLog = async (type, data) => {
    const filePath = getLogPath(type);
    const logEntry = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try {
        await fs.promises.appendFile(filePath, logEntry);
    } catch (e) {
        console.error(`❌ DISK ERROR: Could not write to ${type} log.`, e);
    }
};

// === 5. 核心接口 ===
app.post('/api/submit', limiter, async (req, res) => {
    const serverTime = new Date().toISOString();
    const { name, email, phone, selected_plan, support_type, referrer, website_url } = req.body;

    // Honeypot 蜜罐检测
    if (website_url) {
        await appendLog('bots', { ip: req.ip, payload: req.body });
        console.warn(`🤖 Bot blocked: ${req.ip}`);
        return res.status(200).json({ status: 'ignored', message: 'Received' });
    }

    // 输入校验
    if (!name || !email || !validator.isEmail(email)) {
        return res.status(400).json({ status: 'error', message: 'Invalid input format' });
    }

    // 消毒
    const safeData = {
        name: validator.escape(name.trim()),
        email: validator.normalizeEmail(email),
        phone: validator.escape((phone || '').trim()),
        plan: validator.escape((selected_plan || '').trim()),
        focus: validator.escape((support_type || '').trim()),
        ref: validator.escape((referrer || 'Direct').trim()),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: serverTime
    };

    // 本地备份
    let backupStatus = 'success';
    try {
        await appendLog('leads', safeData);
    } catch (diskErr) {
        backupStatus = 'failed';
        await appendLog('server_errors', { error: 'BackupWriteFailed', stack: diskErr.stack });
    }

    // 邮件发送
    try {
        const { data } = await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@Gmail.com'],
            subject: `New App: ${safeData.name}`,
            reply_to: safeData.email,
            html: `
                <div style="font-family: sans-serif; color: #333; padding: 20px;">
                    <h2 style="color: #E5C359;">New Application</h2>
                    <p><strong>Ref Code:</strong> ${safeData.ref}</p>
                    <hr>
                    <p><strong>Name:</strong> ${safeData.name}</p>
                    <p><strong>Email:</strong> ${safeData.email}</p>
                    <p><strong>Phone:</strong> ${safeData.phone}</p>
                    <p><strong>Plan:</strong> ${safeData.plan}</p>
                    <p><strong>Focus:</strong> ${safeData.focus}</p>
                    <br>
                    <small style="color: #999;">
                        Server Time: ${safeData.timestamp}<br>
                        Backup Status: ${backupStatus === 'success' ? '✅ Saved' : '❌ FAILED (Check Logs)'}
                    </small>
                </div>
            `
        });

        return res.status(201).json({
            status: 'success',
            message: 'Application secured.',
            id: data.id
        });

    } catch (emailError) {
        await appendLog('server_errors', {
            type: 'EmailSendFailed',
            msg: emailError.message,
            lead: safeData.email
        });

        if (backupStatus === 'success') {
            return res.status(202).json({
                status: 'warning',
                message: 'Application saved locally, but notification delayed.',
                details: 'EMAIL_SERVICE_DOWN'
            });
        } else {
            return res.status(500).json({
                status: 'error',
                message: 'System critical failure. Please contact support.'
            });
        }
    }
});

// === 6. 启动服务 ===
app.listen(port, () => {
    console.log(`🛡️  Server running on http://localhost:${port}`);
    console.log(`📂 Logs: ${LOG_DIR}/`);
});