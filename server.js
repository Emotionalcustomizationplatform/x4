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

// === 0. 基础配置与检查 ===
if (!process.env.RESEND_API_KEY) {
    console.error("❌ FATAL: RESEND_API_KEY missing in .env");
    process.exit(1);
}
const resend = new Resend(process.env.RESEND_API_KEY);

// 定义允许的来源 (生产环境请换成真实域名)
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:5500'];

// === 1. 工具函数：日志管理 (按日期自动切割) ===
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const getLogPath = (type) => {
    // 生成文件名: logs/leads_2023-10-27.jsonl
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
        // 这里不抛出异常，防止日志系统故障导致业务中断
    }
};

// === 2. 安全中间件 ===
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

// 限流: 1小时20次
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    handler: (req, res) => res.status(429).json({ 
        status: 'error', 
        message: "Too many requests. Please try again later." 
    })
});

// === 3. 核心业务接口 ===
app.post('/api/submit', limiter, async (req, res) => {
    // A. 来源强校验 (CSRF 防护)
    const origin = req.get('origin');
    const referer = req.get('referer');
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden Origin' });
    }

    // B. 数据提取与服务端时间戳
    const serverTime = new Date().toISOString();
    const { name, email, phone, selected_plan, support_type, referrer, website_url } = req.body;

    // C. Honeypot 蜜罐检测 (持久化记录)
    if (website_url) {
        await appendLog('bots', { ip: req.ip, payload: req.body });
        console.warn(`🤖 Bot blocked: ${req.ip}`);
        // 返回统一的 bot 状态，迷惑爬虫
        return res.status(200).json({ status: 'ignored', message: 'Received' });
    }

    // D. 输入校验 (Validation)
    if (!name || !email || !validator.isEmail(email)) {
        return res.status(400).json({ status: 'error', message: 'Invalid input format' });
    }

    // E. 消毒 (Sanitization)
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

    // F. 核心逻辑: 备份优先 (Backup First)
    let backupStatus = 'success';
    try {
        await appendLog('leads', safeData);
    } catch (diskErr) {
        backupStatus = 'failed';
        console.error('CRITICAL: Local backup failed, attempting email anyway.');
        await appendLog('server_errors', { error: 'BackupWriteFailed', stack: diskErr.stack });
    }

    // G. 发送邮件 (Resend)
    try {
        // SDK v2+ 会直接抛出异常，而不是返回 { error }
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

        // 完美成功 (201 Created)
        return res.status(201).json({ 
            status: 'success', 
            message: 'Application secured.',
            id: data.id 
        });

    } catch (emailError) {
        // 记录严重错误
        await appendLog('server_errors', { 
            type: 'EmailSendFailed', 
            msg: emailError.message, 
            lead: safeData.email 
        });

        // H. 降级响应
        // 如果备份成功但邮件失败，告诉前端 "warning" 状态
        if (backupStatus === 'success') {
            return res.status(202).json({ 
                status: 'warning', 
                message: 'Application saved locally, but notification delayed.',
                details: 'EMAIL_SERVICE_DOWN'
            });
        } else {
            // 备份和邮件都失败 (极低概率灾难)
            return res.status(500).json({ 
                status: 'error', 
                message: 'System critical failure. Please contact support via WhatsApp.' 
            });
        }
    }
});

app.listen(port, () => {
    console.log(`🛡️  Server running on port ${port}`);
    console.log(`📂 Logging to: ${LOG_DIR}/`);
});
