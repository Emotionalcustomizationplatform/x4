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
    const file = path.join(LOG_DIR, `sourcing_leads_${new Date().toISOString().split('T')[0]}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try { await fs.promises.appendFile(file, line); } catch (e) { console.error('Log Error:', e); }
};

app.post('/api/submit', async (req, res) => {
    try {
        // 接收前端发来的新字段：product_type (产品类型)
        let { name, email, phone, plan_id, focus, product_type, referrer, honeypot } = req.body;

        if (honeypot) return res.json({ status: 'success' });

        if (!name || !email) return res.status(400).json({ status: 'error', message: 'Missing fields' });

        // ★★★ 重新定义采购助手的价格档位 ★★★
        let price = 0;
        let planName = 'Discovery Call (Free)';

        if (plan_id === 'full_partner') {
            price = 899;
            planName = 'Business Retainer ($899/mo)';
        } else if (plan_id === 'single_product') {
            price = 199;
            planName = 'Single Sourcing Project ($199)';
        }

        const isPaid = price > 0;
        const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase();
        const safeText = (str) => (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const cleanData = {
            id: submissionId,
            name: safeText(name),
            email: safeText(email),
            phone: safeText(phone),
            product: safeText(product_type),
            plan: planName,
            amount: price,
            focus: safeText(focus || 'General Sourcing'),
            ref: safeText(referrer),
            ip: req.ip
        };

        await writeLog(cleanData);

        // [邮件模板] 针对采购业务优化的邮件通知
        const subjectPrefix = isPaid ? `[💰 $${price} PENDING]` : '[☕ FREE]';
        
        const warningHtml = isPaid ? `
            <div style="background: #fff3cd; color: #856404; padding: 15px; border: 1px solid #ffeeba; border-radius: 5px; margin-bottom: 25px;">
                <strong>⚠️ 待确认付款 / PAYMENT PENDING</strong><br><br>
                项目金额: <strong>$${price}</strong> (${planName})<br>
                请检查 PayPal 是否收到款项 (订单ID: ${cleanData.id})。
            </div>
        ` : `
            <div style="background: #d4edda; color: #155724; padding: 15px; border: 1px solid #c3e6cb; border-radius: 5px; margin-bottom: 25px;">
                <strong>✅ 免费咨询预约</strong><br>客户正在寻求初步建议。
            </div>
        `;

        await resend.emails.send({
            from: 'Sourcing Pro <onboarding@resend.dev>',
            to: ['dpx204825@gmail.com'], // 你的接收邮箱
            reply_to: cleanData.email,
            subject: `${subjectPrefix} New Inquiry: ${cleanData.name} (${cleanData.product})`,
            html: `
                ${warningHtml}
                <h3>Project Details</h3>
                <p><strong>Ref ID:</strong> ${cleanData.id}</p>
                <p><strong>Client Name:</strong> ${cleanData.name}</p>
                <p><strong>Target Product:</strong> <span style="font-size:1.2em; color:#E5C359;">${cleanData.product}</span></p>
                <p><strong>Email:</strong> ${cleanData.email}</p>
                <p><strong>WhatsApp/Phone:</strong> ${cleanData.phone}</p>
                <hr>
                <p><strong>Selected Plan:</strong> ${cleanData.plan}</p>
                <p><strong>Current Challenge:</strong> ${cleanData.focus}</p>
                <p><strong>Source:</strong> ${cleanData.ref}</p>
            `
        });

        let responseData = { status: 'success', submission_id: submissionId };
        if (isPaid) {
            // ★★★ 自动计算金额并生成支付链接 ★★★
            responseData.redirect_url = `https://paypal.me/dpx710/${price}USD?memo=${submissionId}_${cleanData.product}`;
        }

        return res.status(201).json(responseData);

    } catch (err) {
        console.error('Server Error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal Error' });
    }
});

app.use(express.static(publicPath));
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('System Error');
});

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
