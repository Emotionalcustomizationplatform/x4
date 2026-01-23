require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const mkdirp = require('mkdirp');

const app = express();
const port = process.env.PORT || 3000;

// === 1. 绝对路径定义 (最关键的一步) ===
// 强制获取 public 文件夹的绝对路径
const publicPath = path.resolve(__dirname, 'public');

// === 2. 基础中间件 ===
app.use(cors());
app.use(bodyParser.json());

// === 3. 静态资源托管 (优先处理) ===
// 告诉服务器：public 文件夹里的东西，直接发给用户，不要拦着
app.use(express.static(publicPath));

// === 4. 核心 API 业务 (保留完整功能) ===
// 检查 API Key
if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ Warning: RESEND_API_KEY is not set.");
}
const resend = new Resend(process.env.RESEND_API_KEY);

// 日志工具
const LOG_DIR = path.resolve(__dirname, 'logs');
mkdirp.sync(LOG_DIR);

const appendLog = async (type, data) => {
    const filePath = path.join(LOG_DIR, `${type}_${new Date().toISOString().split('T')[0]}.jsonl`);
    const entry = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try { await fs.promises.appendFile(filePath, entry); } catch (e) { console.error('Log Error:', e); }
};

// 提交接口
app.post('/api/submit', rateLimit({ windowMs: 60*60*1000, max: 20 }), async (req, res) => {
    const { name, email, phone, selected_plan, support_type, referrer, website_url } = req.body;
    
    // 1. 蜜罐拦截
    if (website_url) return res.status(200).json({ status: 'ignored' });

    // 2. 验证
    if (!name || !email) return res.status(400).json({ status: 'error', message: 'Missing fields' });

    // 3. 备份
    const safeData = {
        name: validator.escape(name),
        email: validator.normalizeEmail(email),
        plan: selected_plan, focus: support_type, ref: referrer,
        ip: req.ip
    };
    
    let backupStatus = 'success';
    try { await appendLog('leads', safeData); } catch (e) { backupStatus = 'failed'; }

    // 4. 发邮件
    try {
        await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@Gmail.com'], 
            subject: `New Lead: ${safeData.name}`,
            reply_to: safeData.email,
            html: `<p>Name: ${safeData.name}</p><p>Email: ${safeData.email}</p><p>Plan: ${safeData.plan}</p><p>Ref: ${safeData.ref}</p><small>Backup: ${backupStatus}</small>`
        });
        res.status(201).json({ status: 'success' });
    } catch (e) {
        console.error('Email Error:', e);
        // 只要备份成功就算成功
        res.status(backupStatus === 'success' ? 202 : 500).json({ status: backupStatus === 'success' ? 'warning' : 'error' });
    }
});

// === 5. 前端路由兜底 (最后一道防线) ===
// 如果上面的静态托管没找到文件，这里的逻辑会生效
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    
    // 再次确认文件是否存在
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // 如果真的找不到，返回纯文本错误，而不是 express 默认的 404
        res.status(404).type('txt').send(`CRITICAL ERROR: File not found at ${indexPath}. Please verify GitHub repository structure.`);
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📂 Serving static files from: ${publicPath}`);
});
