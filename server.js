// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// 解析表单数据
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 托管前端静态文件（让前端页面能通过后端访问）
app.use(express.static(__dirname));

// 处理表单提交的接口（对应前端form.js里的 /api/submit-form）
app.post('/api/submit-form', (req, res) => {
  try {
    // 收集前端提交的表单数据
    const formData = req.body;
    // 给数据加个时间戳
    formData.submitTime = new Date().toLocaleString();

    // 把数据存到本地文件（也可以改成存数据库，比如MySQL/MongoDB）
    const dataPath = path.join(__dirname, 'form-submissions.json');
    let submissions = [];
    // 如果文件已存在，读取现有数据
    if (fs.existsSync(dataPath)) {
      submissions = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
    // 新增数据
    submissions.push(formData);
    // 写入文件
    fs.writeFileSync(dataPath, JSON.stringify(submissions, null, 2));

    // 返回成功响应给前端
    res.json({ success: true, message: '表单提交成功！' });
  } catch (error) {
    res.status(500).json({ success: false, message: '提交失败：' + error.message });
  }
});

// 启动服务
app.listen(PORT, () => {
  console.log(`后端服务已启动：http://localhost:${PORT}`);
});
