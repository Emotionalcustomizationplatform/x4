require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

app.use(cors());
app.use(bodyParser.json());

// ---------- 1. 检查必要的环境变量 ----------
if (!process.env.RESEND_API_KEY) {
    console.error('❌ 致命错误：环境变量 RESEND_API_KEY 未设置！');
    process.exit(1);
}
const resend = new Resend(process.env.RESEND_API_KEY);
console.log('✅ Resend 客户端初始化成功');

const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ---------- 2. 请求日志中间件 ----------
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ---------- 3. 核心预约接口 ----------
app.post('/api/submit', async (req, res) => {
    try {
        const { name, email, whatsapp, session_plan, preferred_time, special_request } = req.body;

        if (!name || !email) {
            return res.status(400).json({ status: 'error', message: 'Missing name or email' });
        }

        // 价格映射
        let price = session_plan === '30min' ? 69 : session_plan === '60min' ? 119 : 199;
        const planName = session_plan === '30min' ? '30 Minutes' :
                        session_plan === '60min' ? '60 Minutes' : '90 Minutes Premium';

        // 发送邮件（可能失败，但不影响付款流程）
        let emailResult;
        try {
            emailResult = await resend.emails.send({
                from: 'Luna Whisper <noreply@resend.dev>',
                to: ['dpx204825@gmail.com'],
                reply_to: email,
                subject: `🌙 新预约 - ${name} - ${planName}`,
                html: `
                    <h2>🌙 新预约通知</h2>
                    <p><strong>姓名：</strong> ${name}</p>
                    <p><strong>邮箱：</strong> ${email}</p>
                    <p><strong>WhatsApp：</strong> ${whatsapp || '未提供'}</p>
                    <p><strong>时长：</strong> ${planName} ($${price})</p>
                    <p><strong>期望时间：</strong> ${preferred_time || '未指定'}</p>
                    <p><strong>特殊要求：</strong> ${special_request || '无'}</p>
                    <hr />
                    <p>请尽快联系客户确认时间。</p>
                `
            });
            console.log('📧 Resend API 返回:', JSON.stringify(emailResult, null, 2));
            if (!emailResult || !emailResult.id) {
                console.warn('⚠️ 邮件可能未成功发送，但继续返回支付链接');
            }
        } catch (emailErr) {
            console.error('❌ 邮件发送异常:', emailErr);
            // 不中断业务
        }

        // 生成带备注的 PayPal 链接，方便对账
        const memo = `LunaWhisper_${encodeURIComponent(name)}_${Date.now()}`;
        const payLink = `https://www.paypal.com/paypalme/dpx710/${price}?memo=${memo}`;

        // 无论邮件是否成功，都返回支付链接
        res.json({
            status: 'success',
            redirect_url: payLink
        });

    } catch (err) {
        console.error("❌ 错误:", err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 静态文件 + SPA 支持
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌙 Luna Whisper Server running on http://localhost:${port}`);
});