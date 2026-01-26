require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // 安全模块
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const crypto = require('crypto'); // 用于生成唯一订单号

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

// --- 1. 安全配置 ---
app.set('trust proxy', 1); // 信任反向代理 (Render 需要)
app.use(helmet()); // 自动设置安全头
app.use(cors()); // 允许跨域
app.use(bodyParser.json({ limit: '10kb' })); // 限制包大小，防爆破

// 初始化邮件服务
if (!process.env.RESEND_API_KEY) {
    console.error("❌ CRITICAL: RESEND_API_KEY is missing in .env");
}
const resend = new Resend(process.env.RESEND_API_KEY);

// --- 2. 日志系统 (本地备份) ---
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const writeLog = async (type, data) => {
    const file = path.join(LOG_DIR, `${type}_${new Date().toISOString().split('T')[0]}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try { await fs.promises.appendFile(file, line); } 
    catch (e) { console.error('Disk Write Error:', e); }
};

// --- 3. 提交接口 ---
// 限制：1小时内最多15次提交 (防刷)
const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 15, 
    message: { status: 'error', message: 'Too many requests, please try again later.' }
});

app.post('/api/submit', submitLimiter, async (req, res) => {
    try {
        const { 
            name, email, phone, 
            plan_id, // 前端传 'free' 或 'continuous'
            focus, 
            referrer, 
            honeypot 
        } = req.body;

        // [安全] 蜜罐检测：如果有值，说明是机器人
        if (honeypot) {
            console.log(`🤖 Bot blocked: ${req.ip}`);
            return res.json({ status: 'success' }); // 假装成功，迷惑机器人
        }

        // [校验] 必填项
        if (!name || !email || !plan_id) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields' });
        }

        // [逻辑] 套餐定义
        const PLANS = {
            'free': { name: 'Initial Dialogue', price: 0, currency: 'USD' },
            'continuous': { name: 'Continuous Counsel', price: 710, currency: 'USD' }
        };
        const selectedPlan = PLANS[plan_id];
        
        if (!selectedPlan) {
            return res.status(400).json({ status: 'error', message: 'Invalid Plan ID' });
        }

        // [数据] 生成唯一 ID 并清洗数据
        const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase(); // 8位短ID，方便核对
        
        const cleanData = {
            id: submissionId,
            name: validator.escape(name),
            email: validator.normalizeEmail(email),
            phone: validator.escape(phone || 'Not Provided'),
            plan: selectedPlan,
            focus: validator.escape(focus || 'General'),
            ref: validator.escape(referrer || 'Direct'),
            ip: req.ip
        };

        // [备份] 先存硬盘
        await writeLog('leads', cleanData);

        // [邮件] 发送通知给管理员 (核心修改部分)
        // ----------------------------------------------------
        const isPaid = selectedPlan.price > 0;
        
        // 邮件标题前缀
        const subjectPrefix = isPaid ? '[💰 PAYMENT PENDING]' : '[✅ FREE CONSULTATION]';
        
        // 邮件内的警告横幅
        const warningHtml = isPaid ? `
            <div style="background: #fff3cd; color: #856404; padding: 20px; border: 1px solid #ffeeba; border-radius: 5px; margin-bottom: 25px; font-size: 16px;">
                <strong>⚠️ STOP / 待处理预警</strong><br><br>
                此客户申请了付费服务 ($${selectedPlan.price})。<br>
                在回复客户之前，请务必打开 PayPal App 核对是否收到款项。<br>
                <strong>核对暗号 (ID): ${cleanData.id}</strong>
            </div>
        ` : `
            <div style="background: #d4edda; color: #155724; padding: 15px; border: 1px solid #c3e6cb; border-radius: 5px; margin-bottom: 25px;">
                <strong>✅ 免费咨询申请</strong><br>
                这是免费的初次沟通申请，无需核对付款。
            </div>
        `;

        await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@gmail.com'], // 您的接收邮箱
            reply_to: cleanData.email,
            subject: `${subjectPrefix} New Lead: ${cleanData.name}`,
            html: `
                ${warningHtml}

                <h3>👤 Candidate Details</h3>
                <p><strong>Ref ID:</strong> <span style="font-family:monospace; background:#eee; padding:2px 5px;">${cleanData.id}</span></p>
                <p><strong>Name:</strong> ${cleanData.name}</p>
                <p><strong>Email:</strong> <a href="mailto:${cleanData.email}">${cleanData.email}</a></p>
                <p><strong>Phone:</strong> ${cleanData.phone}</p>
                
                <hr style="border:0; border-top:1px solid #eee; margin: 20px 0;">
                
                <h3>📋 Application Info</h3>
                <p><strong>Plan:</strong> ${cleanData.plan.name}</p>
                <p><strong>Price:</strong> $${cleanData.plan.price}</p>
                <p><strong>Focus:</strong> ${cleanData.focus}</p>
                <p><strong>Referrer:</strong> ${cleanData.ref}</p>
                
                <br>
                <p style="color:#999; font-size:12px;">System Timestamp: ${new Date().toISOString()}</p>
            `
        });
        // ----------------------------------------------------

        // [返回] 构建响应
        let responseData = { 
            status: 'success', 
            submission_id: submissionId 
        };

        // 如果是付费版，生成 PayPal 链接
        if (isPaid) {
            // 在链接里加上 memo，方便用户付款时带上 ID
            // 注意：PayPal Me 对 memo 的支持有限，但这是目前无需 API 开发的最快方式
            responseData.redirect_url = `https://paypal.me/dpx710/${selectedPlan.price}USD?memo=${submissionId}`;
        }

        return res.status(201).json(responseData);

    } catch (err) {
        console.error('🔥 Server Error:', err);
        // 即使出错，如果是邮件发送失败，也尽量返回成功给前端（因为我们已经存了日志）
        return res.status(500).json({ status: 'error', message: 'Internal Processing Error' });
    }
});

// --- 4. 前端文件兜底 ---
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('System Error: index.html not found');
});

app.listen(port, '0.0.0.0', () => console.log(`✅ Server running on port ${port}`));
