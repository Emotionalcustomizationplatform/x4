// server.js (已集成“雅典娜”AI分析引擎)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Resend } = require('resend');
const OpenAI = require('openai'); // ✅ 引入 OpenAI
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- 环境变量校验 ---
if (!process.env.RESEND_API_KEY) throw new Error('❌ 缺少 RESEND_API_KEY');
if (!process.env.RECEIVE_EMAIL) throw new Error('❌ 缺少 RECEIVE_EMAIL');
if (!process.env.OPENAI_API_KEY) throw new Error('❌ 缺少 OPENAI_API_KEY'); // ✅ 检查 OpenAI Key

const resend = new Resend(process.env.RESEND_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // ✅ 初始化 OpenAI
const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL;
const RESEND_FROM = 'onboarding@resend.dev'; 

app.use(cors()); 
app.use(bodyParser.json());
app.use(express.static('./')); 

// ... (翻译字典和函数保持不变) ...
const TRANSLATIONS = {"Discovery Session": "单次体验咨询", "Monthly Membership": "包月私教会员", "Private Membership": "包月私教会员", "Navigating Stress": "应对高压与焦虑", "Career Clarity": "职业发展与领导力迷茫", "Relationships": "人际/亲密关系困扰", "Just Talking": "纯倾诉/寻找树洞", "Overwhelmed": "压力过大/濒临崩溃", "Isolated": "高处不胜寒/感到孤独", "Stuck": "卡住了/急需突破", "Curious": "好奇/仅想体验",};
function translate(text) { if (!text) return "未填写"; if (TRANSLATIONS[text]) return `${TRANSLATIONS[text]} <span style="color:#999;">(${text})</span>`; for (const [key, value] of Object.entries(TRANSLATIONS)) { if (text.includes(key)) { return `${value} <span style="color:#999; font-size:12px;">(${key})</span>`; } } return text; }

// --- ✅ 新增：AI 分析接口 ---
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'No input text provided.' });
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                {
                    role: "system",
                    content: `You are 'ATHENA', the proprietary psychological analysis AI for Private Counsel, specializing in the stress patterns of founders, executives, and high-achievers. Your tone is empathetic, insightful, and highly professional. Analyze the user's input and provide a structured analysis.

Your response MUST be in this exact Markdown format:

**Stress Score:** [A numerical score out of 10, e.g., 8.5/10. Be critical.]

**Key Stressors Identified:**
* [Identify the main source of pressure from the user's text]
* [Identify a second source of pressure or a consequence]

**Potential Underlying Emotions:**
* [Suggest a likely emotion, e.g., Isolation, Impostor Syndrome, Burnout]
* [Suggest another likely emotion, e.g., Decision Fatigue, Anxiety]

**Professional Insight:**
[A concluding, empathetic paragraph (2-3 sentences). Acknowledge their struggle and validate their feelings. Subtly hint at the value of talking to a human expert without directly selling.]`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.5,
            max_tokens: 250,
        });

        const analysis = completion.choices[0].message.content;
        res.json({ analysis });

    } catch (error) {
        console.error('OpenAI API error:', error);
        res.status(500).json({ error: 'Failed to get analysis from AI.' });
    }
});


// --- 原有的表单提交接口 (保持稳定) ---
app.post('/api/submit-form', async (req, res) => {
  try {
    const { name, email, phone, selected_plan, support_type, current_situation } = req.body;
    console.log(`✅ 新订单: ${name} | 邮箱: ${email}`);
    if (!name || !email || !selected_plan) { return res.status(400).json({ success: false, msg: 'Info missing' }); }
    const cn_plan = translate(selected_plan);
    const cn_support = translate(support_type);
    const cn_situation = translate(current_situation);
    await resend.emails.send({
      from: `Private Counsel Admin <${RESEND_FROM}>`, to: YOUR_RECEIVE_EMAIL, subject: `💰 新订单: ${name} [${cn_plan.split('<')[0]}]`,
      html: `<div style="font-family: 'Microsoft YaHei', sans-serif; padding: 20px; border: 1px solid #ddd; max-width:600px;"><h2 style="color:#D4AF37; margin-top:0;">新客户申请</h2><div style="background:#fff9e6; padding:10px; margin-bottom:15px; border-left:4px solid #D4AF37;"><strong>套餐:</strong> ${cn_plan}</div><p><strong>姓名:</strong> ${name}</p><p><strong>邮箱:</strong> <a href="mailto:${email}">${email}</a></p><p><strong>电话:</strong> ${phone || '未填写'}</p><hr style="border:0; border-top:1px solid #eee;"><p><strong>核心痛点:</strong> ${cn_support}</p><p><strong>当前现状:</strong> ${cn_situation}</p><div style="font-size:12px; color:#999; margin-top:20px; text-align:right;">提交时间: ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}</div></div>`
    });
    // 暂时注释掉自动回复，等域名验证后再开启
    res.json({ success: true, msg: 'Application received' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 服务启动: http://localhost:${PORT}`);
});
