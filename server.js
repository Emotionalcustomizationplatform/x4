// 1. 引入依赖
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
// 新增：加载环境变量（本地开发用）
require('dotenv').config();

// 2. 初始化Express
const app = express();
const PORT = process.env.PORT || 3000;

// 3. 解析表单数据+托管前端静态文件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./')); // 托管项目根目录文件

// -------------------------- 从环境变量读取密钥（无明文） --------------------------
const YOUR_GMAIL = process.env.GMAIL_ACCOUNT;
const APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL;
// ----------------------------------------------------------------------

// 4. Gmail邮件配置
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: YOUR_GMAIL, pass: APP_PASSWORD },
  tls: { rejectUnauthorized: false }
});

// 5. 表单提交接口（适配你的form.html）
app.post('/api/submit-form', (req, res) => {
  try {
    const { name, email, phone, program, startDate, source } = req.body;
    console.log('✅ 收到客户提交：', req.body);

    const mailContent = {
      from: `"语言学习报名" <${YOUR_GMAIL}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '🔔 新客户报名表单提交',
      html: `
        <h3 style="color:#2c3e50;">客户报名信息：</h3>
        <p><strong>姓名：</strong>${name || '未填写'}</p>
        <p><strong>邮箱：</strong>${email || '未填写'}</p>
        <p><strong>手机号码：</strong>${phone || '未填写'}</p>
        <p><strong>选择项目：</strong>${
          program === 'program1' ? '定制语言' : 
          program === 'program2' ? '倾听陪聊' : 
          program === 'program3' ? '角色扮演' : '未选择'
        }</p>
        <p><strong>预计开始时间：</strong>${startDate || '未填写'}</p>
        <p><strong>了解渠道：</strong>${
          source === 'socialMedia' ? '社交媒体' : 
          source === 'friend' ? '朋友推荐' : 
          source === 'other' ? '其他' : '未选择'
        }</p>
        <p><strong>提交时间：</strong>${new Date().toLocaleString()}</p>
      `
    };

    transporter.sendMail(mailContent, (err) => {
      if (err) {
        console.log('❌ 邮件发送失败：', err.message);
        res.json({ success: false, msg: '提交成功，工作人员将尽快联系你' });
      } else {
        console.log('✅ 邮件已发至你的邮箱！');
        res.json({ success: true, msg: '提交成功，工作人员将尽快联系你' });
      }
    });
  } catch (error) {
    console.log('❌ 接口出错：', error.message);
    res.json({ success: false, msg: '提交失败，请重试' });
  }
});

// 测试邮件接口
app.get('/test-email', (req, res) => {
  const testMail = {
    from: `"测试邮件" <${YOUR_GMAIL}>`,
    to: YOUR_RECEIVE_EMAIL,
    subject: '测试：邮件配置正常',
    text: '收到这封邮件说明邮件功能可正常使用！'
  };

  transporter.sendMail(testMail, (err) => {
    err ? res.send(`❌ 测试失败：${err.message}`) : res.send(`✅ 测试邮件已发送！`);
  });
});

// 6. 启动服务
app.listen(PORT, () => {
  console.log(`🚀 服务启动成功！端口：${PORT}`);
  console.log(`📧 新报名会发至：${YOUR_RECEIVE_EMAIL}`);
  console.log(`🌐 访问地址：https://你的Render链接`);
});