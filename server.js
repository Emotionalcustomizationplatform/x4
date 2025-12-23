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
app.use(express.static('./')); // 托管当前目录下的静态文件

// 5. 表单提交接口
app.post('/api/submit-form', async (req, res) => {
  try {
    // 解构前端传来的字段，包括新增的 selected_plan (套餐选择)
    const { name, email, phone, program, source, selected_plan } = req.body;
    const clientIP = req.ip;
    const userAgent = req.get('User-Agent');

    console.log('✅ 收到新申请：', name, "| 套餐选择：", selected_plan || "未明确选择");

    // 验证必填字段
    if (!name || !email || !program || !source) {
      return res.status(400).json({ success: false, msg: '请填写所有必填字段' });
    }

    // 转换项目名称为中文
    const programText = program.includes('program1') ? '定制专属伴侣 (Bespoke)' :
                        program.includes('program2') ? '学习中文 (Language)' : program;
    
    // 转换来源渠道为中文
    const sourceText = source === 'socialMedia' ? '社交媒体' :
                       source === 'friend' ? '朋友推荐' : '其他';

    // 发送邮件通知
    const { data, error } = await resend.emails.send({
      from: `报名通知 <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: `🔔 新客户报名: ${name} [${selected_plan || '未选套餐'}]`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
          <h2 style="color:#2c3e50; border-bottom: 2px solid #C5A059; padding-bottom: 10px;">新客户申请详情 (2025)</h2>
          
          <table style="border-collapse: collapse; width: 100%; margin-top: 10px;">
            <!-- ✅ 套餐选择 - 高亮显示 -->
            <tr style="background-color: #fff9e6;">
              <td style="padding: 12px; border: 1px solid #ddd; width: 30%;"><strong>📍 预订套餐：</strong></td>
              <td style="padding: 12px; border: 1px solid #ddd; color: #d35400; font-size: 20px;">
                <strong>${selected_plan || '未选择套餐'}</strong>
              </td>
            </tr>
            
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>客户姓名：</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${name}</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>电子邮箱：</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${email}</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>联系方式：</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${phone || '-'}</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>项目意向：</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${programText}</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>了解渠道：</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${sourceText}</td></tr>
            <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>提交时间：</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${new Date().toLocaleString()}</td></tr>
            
            <tr style="color: #999; font-size: 12px;">
              <td style="padding: 10px; border: 1px solid #ddd;"><strong>技术参数：</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">IP: ${clientIP}<br>UA: ${userAgent}</td>
            </tr>
          </table>
          
          <p style="font-size: 12px; color: #bbb; margin-top: 20px; text-align: center;">
            来自 Customized Companion 2025 自动化系统
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Resend邮件发送失败：', error.message);
      return res.status(500).json({ success: false, msg: '提交成功，但邮件通知发送失败' });
    }

    console.log('✅ 邮件发送成功，ID：', data.id);
    res.json({ success: true, msg: '提交成功，我们会尽快联系您' });

  } catch (err) {
    console.error('❌ 处理异常：', err.message);
    res.status(500).json({ success: false, msg: '服务器异常，请重试' });
  }
});

// 6. 测试邮件接口
app.get('/test-email', async (req, res) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `系统测试 <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '✅ 后端配置正常',
      text: '如果你收到这封邮件，说明 Resend 接口已调通！'
    });

    if (error) return res.send(`❌ 测试失败：${error.message}`);
    res.send(`✅ 测试成功！请查收邮箱 ${YOUR_RECEIVE_EMAIL}`);
  } catch (err) {
    res.send(`❌ 异常：${err.message}`);
  }
});

// 7. 启动服务
app.listen(PORT, () => {
  console.log(`🚀 后端运行中：http://localhost:${PORT}`);
  console.log(`📧 通知邮箱：${YOUR_RECEIVE_EMAIL}`);
});
