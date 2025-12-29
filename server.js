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
const RESEND_FROM = 'onboarding@resend.dev'; 

// 4. 中间件
app.use(cors()); 
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./')); 

// --- 翻译字典 (配置英文到中文的映射) ---
const TRANSLATIONS = {
    // 套餐翻译
    "Discovery Session": "单次体验咨询",
    "Monthly Membership": "包月私教会员",
    
    // 客户需求翻译 (Support Type)
    "Navigating High-Pressure Stress": "应对高压与焦虑",
    "Career & Leadership Clarity": "职业发展与领导力迷茫",
    "Relationship Dynamics": "人际/亲密关系困扰",
    "General Emotional Decompression": "一般情绪疏导/解压",
    "Just need a private space to talk": "纯倾诉/寻找树洞",
    
    // 客户现状翻译 (Situation)
    "Overwhelmed / Burnout nearby": "压力过大/濒临崩溃",
    "Feeling isolated at the top": "高处不胜寒/感到孤独",
    "Stuck / Needing a breakthrough": "卡住了/急需突破",
    "Curious about the service": "好奇/仅想体验",
};

// 辅助函数：进行翻译，如果找不到对应中文，就显示原文
function translate(text) {
    if (!text) return "未填写";
    // 简单的模糊匹配，只要包含关键词就翻译
    for (const [key, value] of Object.entries(TRANSLATIONS)) {
        if (text.includes(key)) {
            return `${value} <span style="color:#999; font-size:12px;">(${key})</span>`;
        }
    }
    return text; // 没匹配到就直接回显英文
}

// 5. 表单提交接口
app.post('/api/submit-form', async (req, res) => {
  try {
    const { 
      name, email, phone, selected_plan, 
      support_type, current_situation, source, submittedAt 
    } = req.body;

    const clientIP = req.ip;
    console.log(`✅ 新客户: ${name} | 套餐: ${selected_plan}`);

    if (!name || !email || !selected_plan) {
      return res.status(400).json({ success: false, msg: '信息不完整' });
    }

    // --- 在这里进行翻译 ---
    const cn_plan = translate(selected_plan);
    const cn_support = translate(support_type);
    const cn_situation = translate(current_situation);

    // 发送中文邮件
    const { data, error } = await resend.emails.send({
      from: `客户报名提醒 <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: `💰 新订单: ${name} [${cn_plan.split('<')[0]}]`, // 标题只显示中文套餐名
      html: `
        <div style="font-family: 'Microsoft YaHei', sans-serif; max-width: 600px; color: #333; border: 1px solid #ddd; padding: 20px;">
          
          <h2 style="color:#2c3e50; border-bottom: 2px solid #D4AF37; padding-bottom: 15px; margin-top: 0;">
            新客户申请详情
          </h2>

          <!-- 套餐高亮 -->
          <div style="background-color: #fff8e1; border-left: 5px solid #D4AF37; padding: 15px; margin-bottom: 20px;">
            <p style="margin:0; font-size:12px; color:#888;">客户选择的套餐：</p>
            <div style="font-size: 20px; color: #d35400; font-weight: bold; margin-top: 5px;">
              ${cn_plan}
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse;">
            
            <!-- 痛点分析 -->
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; width: 80px; color: #888;">核心诉求</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: 500;">${cn_support}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #888;">当前状态</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${cn_situation}</td>
            </tr>

            <!-- 基本信息 -->
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #888;">客户姓名</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>${name}</strong></td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #888;">电子邮箱</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
                <a href="mailto:${email}" style="color: #D4AF37; text-decoration: none;">${email}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #888;">电话号码</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${phone || '未填写'}</td>
            </tr>
          </table>

          <div style="margin-top: 20px; font-size: 12px; color: #aaa; text-align: right;">
            提交时间: ${new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})} (北京时间)<br>
            来源: 官网表单
          </div>

        </div>
      `
    });

    if (error) {
      console.error('❌ 邮件发送失败:', error);
      return res.status(500).json({ success: false, msg: '邮件发送失败' });
    }

    console.log('✅ 邮件发送成功:', data.id);
    res.json({ success: true, msg: 'Application received' });

  } catch (err) {
    console.error('❌ 服务器错误:', err.message);
    res.status(500).json({ success: false, msg: 'Internal Server Error' });
  }
});

// 6. 测试接口
app.get('/test-email', async (req, res) => {
  // ... 保持不变 ...
  res.send('后端正常运行中...');
});

// 7. 启动
app.listen(PORT, () => {
  console.log(`🚀 服务已启动: http://localhost:${PORT}`);
  console.log(`📧 接收邮箱: ${YOUR_RECEIVE_EMAIL}`);
});
