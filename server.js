const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

// 解析表单数据（必须加，否则拿不到客户信息）
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// -------------------------- 只改这3处 --------------------------
const YOUR_GMAIL = '你的Gmail邮箱@gmail.com'; // 比如xxx@gmail.com
const APP_PASSWORD = '你的16位应用专用密码'; // 之前生成的，去掉空格
const YOUR_RECEIVE_EMAIL = '你的接收邮箱@gmail.com'; // 可以和上面一样，也能填其他邮箱
// ----------------------------------------------------------------

// Gmail专属配置（兼容465/587端口，不怕被挡）
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465, // 优先用465，不通就改成587
  secure: true, // 465端口填true，587端口填false
  auth: { user: YOUR_GMAIL, pass: APP_PASSWORD },
  tls: { rejectUnauthorized: false } // 解决证书报错问题
});

// 表单提交接口（客户提交后直接发邮件）
app.post('/api/submit-form', (req, res) => {
  try {
    const { name, email, service, message } = req.body; // 客户填写的字段（和你表单对应）
    console.log('客户提交的数据：', req.body); // 终端也能看，双重保障

    // 邮件内容（会显示客户所有信息）
    const mailOptions = {
      from: `"客户表单" <${YOUR_GMAIL}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '✅ 新客户提交表单啦！',
      html: `
        <h3>客户信息：</h3>
        <p>姓名：${name || '未填写'}</p>
        <p>邮箱：${email || '未填写'}</p>
        <p>选择服务：${service || '未选择'}</p>
        <p>留言：${message || '无'}</p>
        <p>提交时间：${new Date().toLocaleString()}</p>
      `
    };

    // 发送邮件+终端提示
    transporter.sendMail(mailOptions, (err) => {
      if (err) {
        console.log('❌ 邮件发送失败：', err.message);
        res.json({ success: false, message: '提交成功，但邮件未发送' });
      } else {
        console.log('✅ 邮件已发你Gmail！');
        res.json({ success: true, message: '提交成功，工作人员已收到' });
      }
    });
  } catch (err) {
    console.log('❌ 接口出错：', err.message);
    res.json({ success: false, message: '提交失败' });
  }
});

// 启动服务（终端会显示状态）
app.listen(PORT, () => {
  console.log(`服务启动成功！端口：${PORT}`);
  console.log(`等待客户提交，数据会发去：${YOUR_RECEIVE_EMAIL}`);
});