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
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

// ★★★ 修复 1: 必须信任 Render 的反向代理，否则 Rate Limit 会报错 ★★★
app.set('trust proxy', 1);

// 1. 初始化 Resend
if (!process.env.RESEND_API_KEY) {
    console.error("❌ ERROR: RESEND_API_KEY is missing.");
}
const resend = new Resend(process.env.RESEND_API_KEY);

// 2. 基础中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(publicPath));

// 3. 原生日志系统
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const writeLog = async (type, data) => {
    const file = path.join(LOG_DIR, `${type}_${new Date().toISOString().split('T')[0]}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try { await fs.promises.appendFile(file, line); } catch (e) { console.error('Disk Write Error:', e); }
};

// 4. 提交接口
app.post('/api/submit', rateLimit({ windowMs: 60*60*1000, max: 20 }), async (req, res) => {
    const { name, email, phone, selected_plan, support_type, referrer, website_url } = req.body;

    if (website_url) return res.json({ status: 'ignored' });
    if (!name || !email) return res.status(400).json({ status: 'error', message: 'Missing fields' });

    const cleanData = {
        name: validator.escape(name),
        email: validator.normalizeEmail(email),
        phone: validator.escape(phone || ''),
        plan: selected_plan,
        focus: support_type,
        ref: referrer,
        ip: req.ip
    };

    let backup = 'success';
    try { await writeLog('leads', cleanData); } catch (e) { backup = 'failed'; }

    // 发送邮件
    try {
        const { data, error } = await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            // ★★★ 修复 2: 严格使用小写，匹配 Resend 报错提示中的地址 ★★★
            to: ['dpx204825@gmail.com'], 
            subject: `New Lead: ${cleanData.name}`,
            reply_to: cleanData.email,
            html: `
                <h3>New Application</h3>
                <p><strong>Name:</strong> ${cleanData.name}</p>
                <p><strong>Email:</strong> ${cleanData.email}</p>
                <p><strong>Phone:</strong> ${cleanData.phone}</p>
                <hr>
                <p><strong>Plan:</strong> ${cleanData.plan}</p>
                <p><strong>Focus:</strong> ${cleanData.focus}</p>
                <p><strong>Referrer:</strong> ${cleanData.ref}</p>
                <br>
                <small>System Backup: ${backup}</small>
            `
        });

        if (error) {
            console.error('❌ Resend API Error:', JSON.stringify(error, null, 2));
            throw error; 
        }

        console.log(`✅ Email sent successfully to dpx204825@gmail.com`);
        return res.status(201).json({ status: 'success', id: data.id });

    } catch (err) {
        console.error('❌ Sending Failed:', err.message);
        const status = backup === 'success' ? 202 : 500;
        // 如果是 403 错误（账号限制），在前端稍微提示一下（仅用于调试，生产环境可以去掉）
        return res.status(status).json({ status: backup === 'success' ? 'warning' : 'error' });
    }
});

// 5. 兜底路由
app.get('*', (req, res) => {
    const index = path.join(publicPath, 'index.html');
    if (fs.existsSync(index)) res.sendFile(index);
    else res.status(404).send('System Error: index.html missing');
});

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
