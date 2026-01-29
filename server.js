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
    const file = path.join(LOG_DIR, `leads_${new Date().toISOString().split('T')[0]}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try { await fs.promises.appendFile(file, line); } catch (e) { console.error('Log Error:', e); }
};

app.post('/api/submit', async (req, res) => {
    try {
        let { name, email, phone, plan_id, selected_plan, focus, support_type, referrer, honeypot } = req.body;

        if (honeypot) return res.json({ status: 'success' });

        // [兼容旧版 & 智能识别]
        if (!plan_id && selected_plan) {
            if (selected_plan.includes('710') || selected_plan.toLowerCase().includes('continuous')) {
                plan_id = 'continuous';
            } else if (selected_plan.includes('500') || selected_plan.toLowerCase().includes('core')) {
                // ★★★ 新增识别 $500 套餐 ★★★
                plan_id = 'hsk_core';
            } else {
                plan_id = 'free';
            }
        }

        if (!name || !email) return res.status(400).json({ status: 'error', message: 'Missing fields' });

        // ★★★ 定义三个档位的价格 ★★★
        let price = 0;
        let planName = 'Initial Dialogue (Free)';

        if (plan_id === 'continuous') {
            price = 710;
            planName = 'Strategic Retainer ($710)'; // 高级版
        } else if (plan_id === 'hsk_core') {
            price = 500;
            planName = 'Language Core ($500)';      // 新增中级版
        }

        const isPaid = price > 0;
        const finalFocus = focus || support_type || 'General Inquiry';
        const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase();
        const safeText = (str) => (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const cleanData = {
            id: submissionId,
            name: safeText(name),
            email: safeText(email),
            phone: safeText(phone),
            plan: planName,
            amount: price,
            focus: safeText(finalFocus),
            ref: safeText(referrer),
            ip: req.ip
        };

        await writeLog(cleanData);

        // [邮件模板] 动态显示金额
        const subjectPrefix = isPaid ? `[💰 $${price} PENDING]` : '[✅ FREE]';
        
        const warningHtml = isPaid ? `
            <div style="background: #fff3cd; color: #856404; padding: 15px; border: 1px solid #ffeeba; border-radius: 5px; margin-bottom: 25px;">
                <strong>⚠️ 待付款预警 / PAYMENT PENDING</strong><br><br>
                订单金额: <strong>$${price}</strong> (${planName})<br>
                请务必核对 PayPal 是否到账 (ID: ${cleanData.id})。
            </div>
        ` : `
            <div style="background: #d4edda; color: #155724; padding: 15px; border: 1px solid #c3e6cb; border-radius: 5px; margin-bottom: 25px;">
                <strong>✅ 免费咨询申请</strong><br>无需核对付款。
            </div>
        `;

        await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@gmail.com'],
            reply_to: cleanData.email,
            subject: `${subjectPrefix} Lead: ${cleanData.name}`,
            html: `
                ${warningHtml}
                <h3>Candidate Profile</h3>
                <p><strong>Ref ID:</strong> ${cleanData.id}</p>
                <p><strong>Name:</strong> ${cleanData.name}</p>
                <p><strong>Email:</strong> ${cleanData.email}</p>
                <p><strong>Phone:</strong> ${cleanData.phone}</p>
                <hr>
                <p><strong>Selected Plan:</strong> ${cleanData.plan}</p>
                <p><strong>Primary Focus:</strong> ${cleanData.focus}</p>
                <p><strong>Referrer:</strong> ${cleanData.ref}</p>
            `
        });

        let responseData = { status: 'success', submission_id: submissionId };
        if (isPaid) {
            // ★★★ 动态生成链接：根据 price 自动变 ($500 或 $710) ★★★
            responseData.redirect_url = `https://paypal.me/dpx710/${price}USD?memo=${submissionId}`;
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
