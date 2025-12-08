// 1. 引入依赖（新增cors和resend）
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // 新增：解决跨域红色错误
const { Resend } = require('resend'); // 新增：替代SMTP的邮件服务
require('dotenv').config();

// 2. 初始化（新增Resend和CORS配置）
const app = express();
const PORT = process.env.PORT || 3000;
const resend = new Resend(process.env.RESEND_API_KEY); // 从环境变量读API Key

// 3. 关键：解决跨域红色错误（必须放在所有路由前）
app.use(cors()); // 允许所有跨域请求（测试/小型项目够用）
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./'));

// 4. 环境变量（只保留3个，新增RESEND_API_KEY）
const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL; // 你要收邮件的邮箱
const RESEND_FROM = 'onboarding@resend.dev'; // Resend默认发件邮箱（不用改）

// 5. 表单提交接口（核心：替换邮件发送逻辑）
app.post('/api/submit-form', async (req, res) => {
  try {
    const { name, email, phone, program, startDate, source } = req.body;
    console.log('✅ 收到客户提交：', req.body);

    // 整理邮件内容（和之前一样，只改发送方式）
    const programText = program === 'program1' ? '定制语言' : 
                        program === 'program2' ? '倾听陪聊' : 
                        program === 'program3' ? '角色扮演' : '未选择';
    const sourceText = source === 'socialMedia' ? '社交媒体' : 
                       source === 'friend' ? '朋友推荐' : 
                       source === 'other' ? '其他' : '未选择';

    // 关键：用Resend API发送邮件（替代SMTP）
    await resend.emails.send({
      from: `语言学习报名 <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL, // 发给你自己（也可以加客户邮箱：[YOUR_RECEIVE_EMAIL, email]）
      subject: '🔔 新客户报名表单提交',
      html: `
        <h3 style="color:#2c3e50;">客户报名信息：</h3>
        <p><strong>姓名：</strong>${name || '未填写'}</p>
        <p><strong>邮箱：</strong>${email || '未填写'}</p>
        <p><strong>手机号码：</strong>${phone || '未填写'}</p>
        <p><strong>选择项目：</strong>${programText}</p>
        <p><strong>预计开始时间：</strong>${startDate || '未填写'}</p>
        <p><strong>了解渠道：</strong>${sourceText}</p>
        <p><strong>提交时间：</strong>${new Date().toLocaleString()}</p>
      `
    });

    console.log('✅ 邮件已发至你的邮箱！');
    res.json({ success: true, msg: '提交成功，工作人员将尽快联系你' });
  } catch (error) {
    console.error('❌ 错误：', error.message);
    res.json({ success: false, msg: '提交成功，工作人员将尽快联系你' });
  }
});

// 6. 测试邮件接口（验证Resend是否配置成功）
app.get('/test-email', async (req, res) => {
  try {
    await resend.emails.send({
      from: `测试 <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '✅ Resend邮件配置成功',
      text: '收到这封邮件说明表单提交后能正常收通知！'
    });
    res.send('✅ 测试邮件已发送，去邮箱查收～');
  } catch (error) {
    res.send(`❌ 测试失败：${error.message}`);
  }
});

// 7. 启动服务
app.listen(PORT, () => {
  console.log(`🚀 服务启动成功！端口：${PORT}`);
  console.log(`📧 新报名会发至：${YOUR_RECEIVE_EMAIL}`);
  console.log(`🌐 访问地址：https://x4-0ifr.onrender.com`);
});