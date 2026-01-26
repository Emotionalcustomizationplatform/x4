require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
// 移除了 helmet, rate-limit, validator 等所有可能报错的库
// 只用 Node.js 自带的原生 crypto 库
const crypto = require('crypto'); 

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

// 1. 基础配置
app.set('trust proxy', 1);
app.use(cors()); // 允许跨域
app.use(bodyParser.json()); // 解析 JSON

// 初始化邮件
if (!process.env.RESEND_API_KEY) {
    console.error("❌ 错误: .env 文件中缺少 RESEND_API_KEY");
}
const resend = new Resend(process.env.RESEND_API_KEY);

// 2. 简易日志 (存硬盘)
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const writeLog = async (data) => {
    const file = path.join(LOG_DIR, `leads_${new Date().toISOString().split('T')[0]}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try { await fs.promises.appendFile(file, line); } catch (e) { console.error('Log Error:', e); }
};

// 3. 提交接口 (删繁就简，只留核心)
app.post('/api/submit', async (req, res) => {
    try {
        const { name, email, phone, plan_id, focus, referrer, honeypot } = req.body;

        // Bot 陷阱
        if (honeypot) return res.json({ status: 'success' });

        // 简单的必填校验
        if (!name || !email) {
            return res.status(400).json({ status: 'error', message: 'Missing fields' });
        }

        // 简单的 HTML 转义 (代替 validator 库)
        const safeText = (str) => (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // 套餐定义
        const isPaid = (plan_id === 'continuous');
        const price = isPaid ? 710 : 0;
        const planName = isPaid ? 'Continuous Counsel' : 'Initial Dialogue';

        // 生成 ID
        const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase();

        const cleanData = {
            id: submissionId,
            name: safeText(name),
            email: safeText(email),
            phone: safeText(phone),
            plan: planName,
            amount: price,
            focus: safeText(focus),
            ref: safeText(referrer),
            ip: req.ip
        };

        // 写日志
        await writeLog(cleanData);

        // 发邮件 (保留您的黄色警告功能)
        const subjectPrefix = isPaid ? '[💰 PAYMENT PENDING]' : '[✅ FREE]';
        
        const warningHtml = isPaid ? `
            <div style="background: #fff3cd; color: #856404; padding: 15px; border: 1px solid #ffeeba; margin-bottom: 20px;">
                <strong>⚠️ 待付款预警 / PAYMENT PENDING</strong><br>
                此订单需支付 $710。<br>
                请务必核对 PayPal 是否到账 (ID: ${cleanData.id}) 再联系客户。
            </div>
        ` : `
            <div style="background: #d4edda; color: #155724; padding: 15px; border: 1px solid #c3e6cb; margin-bottom: 20px;">
                <strong>✅ 免费咨询</strong> - 无需付款，可直接跟进。
            </div>
        `;

        await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@gmail.com'],
            reply_to: cleanData.email,
            subject: `${subjectPrefix} New Lead: ${cleanData.name}`,
            html: `
                ${warningHtml}
                <p><strong>ID:</strong> ${cleanData.id}</p>
                <p><strong>Name:</strong> ${cleanData.name}</p>
                <p><strong>Email:</strong> ${cleanData.email}</p>
                <p><strong>Referrer:</strong> ${cleanData.ref}</p>
                <hr>
                <p><strong>Plan:</strong> ${cleanData.plan} ($${cleanData.amount})</p>
            `
        });

        // 返回成功
        let responseData = { status: 'success', submission_id: submissionId };
        if (isPaid) {
            responseData.redirect_url = `https://paypal.me/dpx710/${price}USD?memo=${submissionId}`;
        }

        return res.status(201).json(responseData);

    } catch (err) {
        console.error('Server Error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal Error' });
    }
});

// 4. 静态文件兜底
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('Not Found');
});

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
