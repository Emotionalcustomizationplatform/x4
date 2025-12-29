// server.js

// 1. 引入依赖
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Resend } = require('resend');
require('dotenv').config();

// 2. 初始化
const app = express();
const PORT = process.env.PORT || 3000;

// 3. 环境变量校验
if (!process.env.RESEND_API_KEY) throw new Error('❌ 缺少 RESEND_API_KEY 环境变量！');
if (!process.env.RECEIVE_EMAIL) throw new Error('❌ 缺少 RECEIVE_EMAIL 环境变量！');

const resend = new Resend(process.env.RESEND_API_KEY);
const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL;
// 发件人地址 (建议配置您的域名邮箱，例如 concierge@privatecounsel.com，没有的话先用默认的)
const RESEND_FROM = 'onboarding@resend.dev'; 

// 4. 中间件
app.use(cors()); 
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./')); 

// --- 翻译字典 (适配新表单的 Short Codes) ---
const TRANSLATIONS = {
    "Discovery Session": "单次体验咨询",
    "Monthly Membership": "包月私教会员",
    "Private Membership": "包月私教会员",
    
    // Support Type
    "Navigating Stress": "应对高压与焦虑",
    "Career Clarity": "职业发展与领导力迷茫",
    "Relationships": "人际/亲密关系困扰",
    "Just Talking": "纯倾诉/寻找树洞",
    
    // Current Situation
    "Overwhelmed": "压力过大/濒临崩溃",
    "Isolated": "高处不胜寒/感到孤独",
    "Stuck": "卡住了/急需突破",
    "Curious": "好奇/仅想体验",
};

// 辅助函数：翻译
function translate(text) {
    if (!text) return "未填写";
    if (TRANSLATIONS[text]) return `${TRANSLATIONS[text]} <span style="color:#999;">(${text})</span>`;
    for (const [key, value] of Object.entries(TRANSLATIONS)) {
        if (text.includes(key)) {
            return `${value} <span style="color:#999; font-size:12px;">(${key})</span>`;
        }
    }
    return text;
}

// 5. 表单提交接口
app.post('/api/submit-form', async (req, res) => {
  try {
    const { 
      name, email, phone, selected_plan, 
      support_type, current_situation, source 
    } = req.body;

    console.log(`✅ 新订单: ${name} | 邮箱: ${email}`);

    if (!name || !email || !selected_plan) {
      return res.status(400).json({ success: false, msg: 'Info missing' });
    }

    // --- 翻译数据 ---
    const cn_plan = translate(selected_plan);
    const cn_support = translate(support_type);
    const cn_situation = translate(current_situation);

    // ==========================================
    // 邮件 1：发给您自己 (中文通知)
    // ==========================================
    await resend.emails.send({
      from: `Private Counsel Admin <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: `💰 新订单: ${name} [${cn_plan.split('<')[0]}]`,
      html: `
        <div style="font-family: 'Microsoft YaHei', sans-serif; padding: 20px; border: 1px solid #ddd; max-width:600px;">
          <h2 style="color:#D4AF37; margin-top:0;">新客户申请</h2>
          <div style="background:#fff9e6; padding:10px; margin-bottom:15px; border-left:4px solid #D4AF37;">
            <strong>套餐:</strong> ${cn_plan}
          </div>
          <p><strong>姓名:</strong> ${name}</p>
          <p><strong>邮箱:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>电话:</strong> ${phone || '未填写'}</p>
          <hr style="border:0; border-top:1px solid #eee;">
          <p><strong>核心痛点:</strong> ${cn_support}</p>
          <p><strong>当前现状:</strong> ${cn_situation}</p>
          <div style="font-size:12px; color:#999; margin-top:20px; text-align:right;">
             提交时间: ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}
          </div>
        </div>
      `
    });

    // ==========================================
    // 邮件 2：发给客户 (英文确认函 - Auto Reply)
    // ==========================================
    await resend.emails.send({
      from: `Private Counsel Concierge <${RESEND_FROM}>`,
      to: email, 
      subject: `Application Received: Private Counsel`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, serif; max-width: 600px; color: #333; line-height: 1.6;">
          <div style="text-align:center; margin-bottom:30px;">
            <h2 style="font-family: 'Georgia', serif; color: #000; letter-spacing: 2px; text-transform:uppercase; font-size:18px;">Private Counsel</h2>
          </div>
          <hr style="border: 0; border-top: 1px solid #D4AF37; margin: 20px 0;">
          
          <p>Dear ${name},</p>
          
          <p>We have successfully received your application for the <strong>${selected_plan}</strong>.</p>
          
          <p>Because we maintain a strictly limited client roster to ensure quality, our team reviews each request personally. You can expect to hear from us within the next 24 hours regarding the next steps and scheduling.</p>
          
          <p>Rest assured, all information provided is encrypted and strictly confidential.</p>
          
          <br>
          <p style="font-size: 14px; color: #666;">
            <em>"Calm in the Chaos."</em>
          </p>
          
          <div style="margin-top: 40px; font-size: 11px; color: #999; text-align:center;">
            © 2025 Private Counsel. New York.<br>
            Please do not reply to this automated message.
          </div>
        </div>
      `
    });

    res.json({ success: true, msg: 'Application received' });

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 服务启动: http://localhost:${PORT}`);
});
