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

// 1. 初始化 Resend
if (!process.env.RESEND_API_KEY) {
    console.error("❌ ERROR: RESEND_API_KEY is missing.");
}
const resend = new Resend(process.env.RESEND_API_KEY);

// 2. 基础中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(publicPath));

// 3. 原生日志系统 (无第三方依赖)
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

    // 蜜罐拦截
    if (website_url) return res.json({ status: 'ignored' });

    // 基础验证
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

    // 优先本地备份
    let backup = 'success';
    try { await writeLog('leads', cleanData); } catch (e) { backup = 'failed'; }

    // 发送邮件
    try {
        const { data, error } = await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@Gmail.com'], 
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

        console.log(`✅ Email sent to dpx204825@Gmail.com for ${cleanData.email}`);
        return res.status(201).json({ status: 'success', id: data.id });

    } catch (err) {
        console.error('❌ Sending Failed:', err.message);
        // 如果备份成功，返回 202 让前端显示成功，否则返回 500
        const status = backup === 'success' ? 202 : 500;
        return res.status(status).json({ status: backup === 'success' ? 'warning' : 'error' });
    }
});

// 5. 兜底路由 (SPA支持)
app.get('*', (req, res) => {
    const index = path.join(publicPath, 'index.html');
    if (fs.existsSync(index)) res.sendFile(index);
    else res.status(404).send('System Error: index.html missing');
});

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
