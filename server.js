require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.resolve(__dirname, 'public');

// =============================
// Security
// =============================
app.use(helmet({
    contentSecurityPolicy: false,  // 关闭 CSP，允许加载外部图片和字体
    crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));

// =============================
// Rate Limit
// =============================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { status: 'error', message: 'Too many requests' }
});
app.use('/api/', limiter);

// =============================
// Environment Check
// =============================
if (!process.env.RESEND_API_KEY) {
    console.error('❌ Missing RESEND_API_KEY');
    process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);
console.log('✅ Resend initialized');

// =============================
// Logs
// =============================
const LOG_DIR = path.resolve(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}
const ORDER_LOG = path.join(LOG_DIR, 'orders.txt');

// =============================
// Helpers
// =============================
function escapeHtml(str = '') {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getPlanData(plan) {
    switch (plan) {
        case '30min':
            return { name: '30 Minutes', price: 10 };
        case '60min':
            return { name: '60 Minutes', price: 29 };
        case '90min':
            return { name: '90 Minutes Premium', price: 59 };
        default:
            return null;
    }
}

// =============================
// Request Logger
// =============================
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// =============================
// Booking API
// =============================
app.post('/api/submit', async (req, res) => {
    try {
        const {
            name,
            email,
            whatsapp,
            session_plan,
            preferred_time,
            special_request,
            session_price_usd,
            session_price_cny,
            order_id,
            payment_method,
            website
        } = req.body;

        // =============================
        // Honeypot Anti-Spam
        // =============================
        if (website) {
            return res.status(400).json({
                status: 'error',
                message: 'Spam detected'
            });
        }

        // =============================
        // Validation
        // =============================
        if (!name || !email || !whatsapp || !preferred_time) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields'
            });
        }

        const planData = getPlanData(session_plan);
        if (!planData) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid plan'
            });
        }

        // =============================
        // Safe Values
        // =============================
        const safeName = escapeHtml(name);
        const safeEmail = escapeHtml(email);
        const safeWhatsapp = escapeHtml(whatsapp);
        const safeTime = escapeHtml(preferred_time);
        const safeRequest = escapeHtml(special_request || '');
        const finalOrderId = order_id || `LW-${Date.now()}`;
        const usdPrice = session_price_usd || planData.price;
        const cnyPrice = session_price_cny || 'N/A';
        const payMethod = payment_method || 'paypal';

        // =============================
        // Save Local Log
        // =============================
        const orderLogText = `
====================================
Order ID: ${finalOrderId}
Name: ${safeName}
Email: ${safeEmail}
WhatsApp: ${safeWhatsapp}
Plan: ${planData.name}
Price: $${usdPrice} (≈ ¥${cnyPrice})
Payment Method: ${payMethod}
Preferred Time: ${safeTime}
Special Request: ${safeRequest}
Created: ${new Date().toISOString()}
====================================
`;

        fs.appendFileSync(ORDER_LOG, orderLogText);

        // =============================
        // Send Email
        // =============================
        try {
            const emailResult = await resend.emails.send({
                from: 'Luna Whisper <noreply@resend.dev>',
                to: ['dpx204825@gmail.com'],
                reply_to: safeEmail,
                subject: `🌙 ${finalOrderId} - ${safeName} - ${planData.name}`,
                html: `
                <div style="font-family:Arial;padding:20px;">
                    <h2>🌙 New Luna Whisper Booking</h2>
                    <hr>
                    <p><strong>Order ID:</strong> ${finalOrderId}</p>
                    <p><strong>Name:</strong> ${safeName}</p>
                    <p><strong>Email:</strong> ${safeEmail}</p>
                    <p><strong>WhatsApp:</strong> ${safeWhatsapp}</p>
                    <p><strong>Session:</strong> ${planData.name}</p>
                    <p><strong>Price:</strong> $${usdPrice} (≈ ¥${cnyPrice})</p>
                    <p><strong>Payment Method:</strong> ${payMethod}</p>
                    <p><strong>Preferred Time:</strong> ${safeTime}</p>
                    <p><strong>Special Request:</strong> ${safeRequest || 'None'}</p>
                </div>
                `
            });
            console.log('📧 Email sent:', emailResult?.id);
        } catch (emailErr) {
            console.error('❌ Email failed:', emailErr);
        }

        // =============================
        // Payment Redirect
        // =============================
        const memo = encodeURIComponent(finalOrderId);
        // 确认你的 PayPal 用户名是 dpx710，如果是其他用户名请修改
        const payLink = `https://www.paypal.com/paypalme/dpx710/${usdPrice}?memo=${memo}`;

        // =============================
        // Success Response
        // =============================
        return res.json({
            status: 'success',
            order_id: finalOrderId,
            redirect_url: payLink
        });

    } catch (err) {
        console.error('❌ Server Error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
});

// =============================
// Static Files
// =============================
app.use(express.static(publicPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// =============================
// Start Server
// =============================
app.listen(port, '0.0.0.0', () => {
    console.log(`🌙 Luna Whisper running on http://localhost:${port}`);
});