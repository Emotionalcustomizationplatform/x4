// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // 新增：基础安全头
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const crypto = require('crypto'); // 新增：用于生成唯一ID

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

// 1. 安全配置
app.set('trust proxy', 1);
app.use(helmet()); 
app.use(cors({ origin: process.env.SITE_URL || '*' })); // 建议生产环境指定域名
app.use(bodyParser.json({ limit: '10kb' })); // 限制包大小，防止DoS

const resend = new Resend(process.env.RESEND_API_KEY);

// 2. 日志系统 (增强版)
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const writeLog = async (type, data) => {
    const file = path.join(LOG_DIR, `${type}_${new Date().toISOString().split('T')[0]}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    await fs.promises.appendFile(file, line); // 让错误抛出，不要吞掉
};

// 3. 提交接口 (重构)
const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 10, // 降低频率，防刷
    message: { status: 'error', message: 'Too many requests' }
});

app.post('/api/submit', submitLimiter, async (req, res) => {
    try {
        const { 
            name, email, phone, 
            plan_id, // 改为 ID: 'free' | 'continuous'
            focus, 
            referrer, 
            honeypot, // 前端传来的蜜罐字段
            csrf_token // 简单校验
        } = req.body;

        // --- 安全校验 ---
        // 1. 蜜罐检测 (Bot 陷阱)
        if (honeypot) {
            console.log(`🤖 Bot detected: ${req.ip}`);
            return res.json({ status: 'success' }); // 欺骗 Bot 成功
        }

        // 2. 必填校验
        if (!name || !email || !plan_id) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields' });
        }

        // 3. 数据清洗 & 结构化
        const submissionId = crypto.randomUUID(); // 生成唯一订单号/提交号
        
        // 定义套餐结构 (解决价格不统一问题)
        const PLANS = {
            'free': { name: 'Initial Dialogue', price: 0, currency: 'USD' },
            'continuous': { name: 'Continuous Counsel', price: 710, currency: 'USD' }
        };

        const selectedPlan = PLANS[plan_id];
        if (!selectedPlan) {
            return res.status(400).json({ status: 'error', message: 'Invalid plan' });
        }

        const cleanData = {
            id: submissionId,
            name: validator.escape(name),
            email: validator.normalizeEmail(email),
            phone: validator.escape(phone || ''),
            plan: {
                id: plan_id,
                name: selectedPlan.name,
                amount: selectedPlan.price,
                currency: selectedPlan.currency
            },
            focus: validator.escape(focus || ''),
            ref: validator.escape(referrer || 'direct'),
            ip: req.ip,
            status: 'pending_payment' // 初始状态
        };

        // --- 核心业务逻辑 ---
        
        // 1. 写入本地日志 (作为数据库备份)
        try {
            await writeLog('leads', cleanData);
        } catch (diskErr) {
            console.error('❌ Disk Write Failed:', diskErr);
            // 硬盘写不进去是严重错误，但为了业务连贯性，如果邮件能发也行
            // 这里选择保守策略：如果存不下来，报错
            return res.status(500).json({ status: 'error', message: 'System busy' });
        }

        // 2. 发送通知邮件
        try {
            await resend.emails.send({
                from: 'Private Counsel <onboarding@resend.dev>',
                to: ['dpx204825@gmail.com'],
                reply_to: cleanData.email,
                subject: `[${selectedPlan.name}] New App: ${cleanData.name}`,
                html: `
                    <h3>New Application (${cleanData.plan.name})</h3>
                    <p><strong>ID:</strong> ${cleanData.id}</p>
                    <p><strong>Name:</strong> ${cleanData.name}</p>
                    <p><strong>Email:</strong> ${cleanData.email}</p>
                    <p><strong>Phone:</strong> ${cleanData.phone}</p>
                    <hr>
                    <p><strong>Focus:</strong> ${cleanData.focus}</p>
                    <p><strong>Ref:</strong> ${cleanData.ref}</p>
                    <p><strong>Price:</strong> $${cleanData.plan.amount}</p>
                `
            });
        } catch (emailErr) {
            console.error('❌ Email Failed:', emailErr);
            // 只要数据存下来了，可以返回成功，但标记警告
        }

        // 3. 构建返回数据 (包含支付链接)
        let paymentUrl = null;
        if (selectedPlan.price > 0) {
            // ★★★ 解决 PayPal 对账问题 ★★★
            // 在 PayPal 链接中带上我们的 submissionId 作为 custom 字段
            // 格式: https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=YOUR_EMAIL&amount=710&item_name=Continuous+Counsel&custom=ORDER_ID
            // 这里暂时用 paypal.me 做演示，但建议升级为标准链接
            paymentUrl = `https://paypal.me/dpx710/${selectedPlan.price}USD?memo=${submissionId}`;
        }

        return res.status(201).json({ 
            status: 'success', 
            submission_id: submissionId,
            redirect_url: paymentUrl 
        });

    } catch (err) {
        console.error('🔥 Critical Error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// 4. 静态文件兜底
app.use(express.static(publicPath));
app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
