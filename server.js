// 1. 引入依赖（新增cors和resend）
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // 新增：解决跨域红色错误
const { Resend } = require('resend'); // 新增：替代SMTP的邮件服务
require('dotenv').config();

// 2. 初始化（新增Resend和CORS配置）
const app = express();
const PORT = process.env.PORT || 3000;

// 新增：环境变量校验（启动时提示缺失配置）
if (!process.env.RESEND_API_KEY) throw new Error('❌ 缺少 RESEND_API_KEY 环境变量！');
if (!process.env.RECEIVE_EMAIL) throw new Error('❌ 缺少 RECEIVE_EMAIL 环境变量！');

const resend = new Resend(process.env.RESEND_API_KEY); // 从环境变量读API Key

// 3. 关键：解决跨域红色错误（必须放在所有路由前）
app.use(cors()); // 允许所有跨域请求（测试/小型项目够用）
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./'));

// 4. 环境变量（只保留3个，新增RESEND_API_KEY）
const YOUR_RECEIVE_EMAIL = process.env.RECEIVE_EMAIL; // 你要收邮件的邮箱
const RESEND_FROM = 'onboarding@resend.dev'; // Resend默认发件邮箱（不用改）

// 5. 表单提交接口（核心：修复邮件发送状态判断+错误排查）
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

    // 关键：用Resend API发送邮件（新增错误捕获+状态判断）
    const { data, error } = await resend.emails.send({
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

    // 新增：判断邮件是否发送成功
    if (error) {
      console.error('❌ Resend邮件发送失败：', error.message);
      return res.status(500).json({ 
        success: false, 
        msg: '表单提交成功，但邮件通知发送失败，请查看服务器日志' 
      });
    }

    console.log('✅ 邮件已发至你的邮箱！Resend发送ID：', data.id);
    res.json({ 
      success: true, 
      msg: '提交成功，工作人员将尽快联系你' 
    });
  } catch (error) {
    console.error('❌ 表单处理失败：', error.message);
    res.status(500).json({ 
      success: false, 
      msg: '表单提交失败，请刷新页面重试' 
    });
  }
});

// 6. 测试邮件接口（验证Resend是否配置成功）
app.get('/test-email', async (req, res) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `测试 <${RESEND_FROM}>`,
      to: YOUR_RECEIVE_EMAIL,
      subject: '✅ Resend邮件配置成功',
      text: '收到这封邮件说明表单提交后能正常收通知！'
    });

    if (error) {
      return res.send(`❌ 测试失败：${error.message}（检查Resend API Key和接收邮箱）`);
    }

    res.send(`✅ 测试邮件已发送！Resend发送ID：${data.id}，去 ${YOUR_RECEIVE_EMAIL} 查收～`);
  } catch (error) {
    res.send(`❌ 测试失败：${error.message}`);
  }
});

// 7. 启动服务
app.listen(PORT, () => {
  console.log(`🚀 服务启动成功！端口：${PORT}`);
  console.log(`📧 新报名会发至：${YOUR_RECEIVE_EMAIL}`);
  console.log(`🌐 访问地址：https://x4-0ifr.onrender.com`);
  console.log(`🔍 测试邮件接口：https://x4-0ifr.onrender.com/test-email`);
});