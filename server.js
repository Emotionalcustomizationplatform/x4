// 1. 引入依赖
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

// 2. 初始化Express
const app = express();
const PORT = 3000;

// 3. 解析表单数据
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// -------------------------- 已填好你的信息 --------------------------
const YOUR_GMAIL = 'xinc2529@gmail.com'; // 你的Gmail邮箱
const APP_PASSWORD = 'hjvgiuvyacnljtdd'; // 应用专用密码（已去掉空格）
const YOUR_RECEIVE_EMAIL = 'xinc2529@gmail.com'; // 接收提醒的邮箱
// ----------------------------------------------------------------------

// 4. Gmail邮件配置
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: YOUR_GMAIL, pass: APP_PASSWORD },
  tls: { rejectUnauthorized: false }
});

// 5. 表单提交接口
app.post('/api/submit-form', (req, res) => {
  try {
    const { name, email, service, message } = req.body;
    console.log('✅ 收到客户提交：', req.body);

    const mailContent = {
      from: `"客户表单" <${YOUR_GMAIL}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '🔔 新客户提交表单',
      html: `
        <h3>客户信息：</h3>
        <p>姓名：${name || '未填写'}</p>
        <p>邮箱：${email || '未填写'}</p>
        <p>选择服务：${service || '未选择'}</p>
        <p>留言：${message || '无'}</p>
        <p>提交时间：${new Date().toLocaleString()}</p>
      `
    };

    transporter.sendMail(mailContent, (err) => {
      if (err) {
        console.log('❌ 邮件发送失败：', err.message);
        res.json({ success: false, msg: '提交成功，邮件待发送' });
      } else {
        console.log('✅ 邮件已发至你的邮箱！');
        res.json({ success: true, msg: '提交成功，工作人员已收到' });
      }
    });
  } catch (error) {
    console.log('❌ 接口出错：', error.message);
    res.json({ success: false, msg: '提交失败，请重试' });
  }
});

// 6. 启动服务
app.listen(PORT, () => {
  console.log(`🚀 服务启动成功！端口：${PORT}`);
  console.log(`📧 新表单会发至：${YOUR_RECEIVE_EMAIL}`);
});