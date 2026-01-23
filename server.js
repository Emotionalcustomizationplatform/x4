require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const mkdirp = require('mkdirp'); // 确保安装了 npm install mkdirp

const app = express();
// ★★★ 关键修改 1: Render 会自动注入 PORT 环境变量，必须使用它 ★★★
const port = process.env.PORT || 3000;

// === 0. 基础配置与检查 ===
if (!process.env.RESEND_API_KEY) {
    console.error("❌ FATAL: RESEND_API_KEY missing in .env");
    // 在生产环境不要直接退出，防止不断重启，而是打印错误
}
const resend = new Resend(process.env.RESEND_API_KEY);

// 定义允许的来源 (请把您的真实域名加进去)
const ALLOWED_ORIGINS = [
    'https://customcompanion.xyz', 
    'https://www.customcompanion.xyz',
    'http://localhost:3000'
];

// === 1. 工具函数：日志管理 ===
const LOG_DIR = path.join(__dirname, 'logs');
// 使用 mkdirp 确保目录存在 (兼容性更好)
mkdirp.sync(LOG_DIR);

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

// === 2. 中间件 ===
app.use(cors({
    origin: (origin, callback) => {
        // 允许无 origin (如服务器间调用) 或在白名单内的
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            // 生产环境建议开启严格检查，测试时可暂时放宽
            console.warn(`CORS Warn: Blocked origin ${origin}`);
            callback(null, true); 
        }
    }
}));
app.use(bodyParser.json());

// ★★★ 关键修改 2: 托管静态网页 (HTML/CSS/JS) ★★★
// 这行代码会让 public 文件夹里的文件可以通过浏览器访问
app.use(express.static(path.join(__dirname, 'public')));

// 限流配置
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    handler: (req, res) => res.status(429).json({ status: 'error', message: "Too many requests." })
});

// === 3. 核心 API 接口 ===
app.post('/api/submit', limiter, async (req, res) => {
    // A. 简单的来源检查
    const origin = req.get('origin');
    // 在这里如果不匹配可以做拦截，视情况而定

    const serverTime = new Date().toISOString();
    const { name, email, phone, selected_plan, support_type, referrer, website_url } = req.body;

    // B. 蜜罐检测
    if (website_url) {
        await appendLog('bots', { ip: req.ip, payload: req.body });
        return res.status(200).json({ status: 'ignored', message: 'Received' });
    }

    // C. 基础验证
    if (!name || !email || !validator.isEmail(email)) {
        return res.status(400).json({ status: 'error', message: 'Invalid input' });
    }

    // D. 消毒
    const safeData = {
        name: validator.escape(name.trim()),
        email: validator.normalizeEmail(email),
        phone: validator.escape((phone || '').trim()),
        plan: validator.escape((selected_plan || '').trim()),
        focus: validator.escape((support_type || '').trim()),
        ref: validator.escape((referrer || 'Direct').trim()),
        ip: req.ip,
        timestamp: serverTime
    };

    // E. 备份
    let backupStatus = 'success';
    try {
        await appendLog('leads', safeData);
    } catch (diskErr) {
        backupStatus = 'failed';
        console.error('Local backup failed:', diskErr);
    }

    // F. 发送邮件
    try {
        const { data } = await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@Gmail.com'], 
            subject: `New App: ${safeData.name}`,
            reply_to: safeData.email,
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h3>New Application</h3>
                    <p>Name: ${safeData.name}</p>
                    <p>Email: ${safeData.email}</p>
                    <p>Ref: ${safeData.ref}</p>
                    <small>Backup: ${backupStatus}</small>
                </div>
            `
        });
        return res.status(201).json({ status: 'success', id: data.id });

    } catch (emailError) {
        await appendLog('server_errors', { type: 'EmailFailed', msg: emailError.message });
        if (backupStatus === 'success') {
            return res.status(202).json({ status: 'warning', message: 'Saved locally' });
        } else {
            return res.status(500).json({ status: 'error', message: 'System error' });
        }
    }
});

// ★★★ 关键修改 3: 处理所有未匹配的路由，返回 index.html ★★★
// 这样当用户访问主页时，会自动显示 public/index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ★★★ 关键修改 4: 监听 0.0.0.0 和动态端口 ★★★
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${port}`);
});
