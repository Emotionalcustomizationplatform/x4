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
app.use(cors()); // 可以改成 { origin: 'https://你的前端域名' } 生产环境更安全
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./')); // 如果有前端静态文件可以放在根目录

// 5. 表单提交接口
app.post('/api/submit-form', async (req, res) => {
  try {
    const { name, email, phone, program, source } = req.body;
    const clientIP = req.ip;
    const userAgent = req.get('User-Agent');

    console.log('✅ 收到客户提交：', req.body);
    console.log('📌 来源IP：', clientIP, '| UA：', userAgent);

    // 验证必填字段
    if (!name || !email || !program || !source) {
      return res.status(400).json({ success: false, msg: '请填写所有必填字段' });
    }

    const programText = program === 'program1' ? '定制专属伴侣' :
                        program === 'program2' ? '学习中文' : '未选择';
    const sourceText = source === 'socialMedia' ? '社交媒体' :
                       source === 'friend' ? '朋友推荐' : '其他';

    // 发送邮件
    const { data, error } = await resend.emails.send({
      from: `报名通知 <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '🔔 新客户报名表单提交',
      html: `
        <h2 style="color:#2c3e50;">客户报名信息</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td><strong>姓名：</strong></td><td>${name}</td></tr>
          <tr><td><strong>邮箱：</strong></td><td>${email}</td></tr>
          <tr><td><strong>手机号码：</strong></td><td>${phone || '-'}</td></tr>
          <tr><td><strong>选择项目：</strong></td><td>${programText}</td></tr>
          <tr><td><strong>了解渠道：</strong></td><td>${sourceText}</td></tr>
          <tr><td><strong>提交时间：</strong></td><td>${new Date().toLocaleString()}</td></tr>
          <tr><td><strong>客户IP：</strong></td><td>${clientIP}</td></tr>
          <tr><td><strong>浏览器：</strong></td><td>${userAgent}</td></tr>
        </table>
      `
    });

    if (error) {
      console.error('❌ Resend邮件发送失败：', error.message);
      return res.status(500).json({
        success: false,
        msg: '表单提交成功，但邮件通知发送失败，请查看服务器日志'
      });
    }

    console.log('✅ 邮件发送成功，Resend ID：', data.id);
    res.json({ success: true, msg: '提交成功，工作人员将尽快联系你' });

  } catch (err) {
    console.error('❌ 表单处理异常：', err.message);
    res.status(500).json({ success: false, msg: '表单提交失败，请刷新页面重试' });
  }
});

// 6. 测试邮件接口
app.get('/test-email', async (req, res) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `测试 <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '✅ Resend邮件配置成功',
      text: '收到这封邮件说明表单提交后能正常收通知！'
    });

    if (error) return res.send(`❌ 测试失败：${error.message}`);
    res.send(`✅ 测试邮件已发送！Resend发送ID：${data.id}，请查收邮箱 ${YOUR_RECEIVE_EMAIL}`);
  } catch (err) {
    res.send(`❌ 测试失败：${err.message}`);
  }
});

// 7. 启动服务
app.listen(PORT, () => {
  console.log(`🚀 服务启动成功！端口：${PORT}`);
  console.log(`📧 新报名邮件将发送至：${YOUR_RECEIVE_EMAIL}`);
  console.log(`🌐 前端访问：http://localhost:${PORT}`);
  console.log(`🔍 测试邮件接口：http://localhost:${PORT}/test-email`);
});