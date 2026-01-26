require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // 仅使用 Node.js 原生库

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

// --- 1. 基础配置 ---
app.set('trust proxy', 1); // 适配 Render 平台
app.use(cors()); // 允许前端跨域调用
app.use(bodyParser.json()); // 允许接收 JSON 数据

// 初始化邮件服务
if (!process.env.RESEND_API_KEY) {
    console.error("❌ 错误: 请在 .env 文件中设置 RESEND_API_KEY");
}
const resend = new Resend(process.env.RESEND_API_KEY);

// --- 2. 简易日志系统 (本地备份) ---
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const writeLog = async (data) => {
    // 按天生成日志文件，防止单个文件过大
    const file = path.join(LOG_DIR, `leads_${new Date().toISOString().split('T')[0]}.jsonl`);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...data }) + '\n';
    try { await fs.promises.appendFile(file, line); } 
    catch (e) { console.error('Log Write Error:', e); }
};

// --- 3. 核心提交接口 ---
app.post('/api/submit', async (req, res) => {
    try {
        // 接收所有可能的参数 (兼容新旧版本前端)
        let { name, email, phone, plan_id, selected_plan, focus, support_type, referrer, honeypot } = req.body;

        // [反爬] 蜜罐陷阱：如果机器人填了这个字段，直接假装成功
        if (honeypot) return res.json({ status: 'success' });

        // [兼容] 智能判断套餐类型
        // 逻辑：如果没有传 plan_id (新版)，就去检查 selected_plan (旧版)
        if (!plan_id && selected_plan) {
            // 只要旧版字符串里包含 '710' 或 'Continuous'，就判定为付费
            if (selected_plan.includes('710') || selected_plan.toLowerCase().includes('continuous')) {
                plan_id = 'continuous';
            } else {
                plan_id = 'free';
            }
        }

        // [校验] 简单检查必填项
        if (!name || !email) {
            return res.status(400).json({ status: 'error', message: 'Name and Email are required' });
        }

        // [逻辑] 定义套餐详情
        const isPaid = (plan_id === 'continuous'); 
        const price = isPaid ? 710 : 0;
        const planName = isPaid ? 'Continuous Counsel ($710)' : 'Initial Dialogue (Free)';
        
        // [兼容] 统一 Focus 字段
        const finalFocus = focus || support_type || 'General Inquiry';

        // [数据] 生成唯一订单号 & 清洗数据
        const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase();
        const safeText = (str) => (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;"); // 防止 XSS

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

        // [备份] 写入本地日志
        await writeLog(cleanData);

        // [邮件] 发送通知 (含防白嫖警告)
        const subjectPrefix = isPaid ? '[💰 PAYMENT PENDING]' : '[✅ FREE CONSULTATION]';
        
        // 只有付费订单才显示黄色警告框
        const warningHtml = isPaid ? `
            <div style="background: #fff3cd; color: #856404; padding: 15px; border: 1px solid #ffeeba; border-radius: 5px; margin-bottom: 25px; font-size: 16px;">
                <strong>⚠️ 待付款预警 / STOP & CHECK</strong><br><br>
                此订单涉及金额 <strong>$710</strong>。<br>
                请务必打开 PayPal App，核对是否收到对应款项。<br>
                <strong>核对暗号 (ID): ${cleanData.id}</strong>
            </div>
        ` : `
            <div style="background: #d4edda; color: #155724; padding: 15px; border: 1px solid #c3e6cb; border-radius: 5px; margin-bottom: 25px;">
                <strong>✅ 免费咨询申请</strong><br>
                无需核对付款，可直接跟进。
            </div>
        `;

        await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@gmail.com'], // 接收通知的邮箱
            reply_to: cleanData.email,   // 直接回复邮件给客户
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
                <p><strong>Plan:</strong> ${cleanData.plan}</p>
                <p><strong>Focus:</strong> ${cleanData.focus}</p>
                <p><strong>Referrer:</strong> ${cleanData.ref}</p>
                
                <br>
                <p style="color:#999; font-size:12px;">System Timestamp: ${new Date().toISOString()}</p>
            `
        });

        // [响应] 返回结果给前端
        let responseData = { 
            status: 'success', 
            submission_id: submissionId 
        };

        if (isPaid) {
            // 付费版：返回带有 memo (ID) 的 PayPal 链接
            responseData.redirect_url = `https://paypal.me/dpx710/${price}USD?memo=${submissionId}`;
        }

        return res.status(201).json(responseData);

    } catch (err) {
        console.error('🔥 Server Error:', err);
        // 即使出错，也尽量不让前端崩掉 (500错误)
        return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// --- 4. 前端页面托管 ---
app.use(express.static(publicPath));

// 兜底路由：所有未知的请求都返回首页
app.get('*', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('System Error: index.html missing');
});

// 启动服务器
app.listen(port, '0.0.0.0', () => console.log(`✅ Server running on port ${port}`));
