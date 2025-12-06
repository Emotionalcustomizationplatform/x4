// 替换原来的server.js内容
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // 适配Vercel的端口

// 解析表单数据
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 【关键修复】托管前端静态文件（指定根目录下的所有文件）
app.use(express.static(__dirname, {
  extensions: ['html'] // 自动补全.html后缀，比如访问/会找index.html
}));

// 处理表单提交接口
app.post('/api/submit-form', (req, res) => {
  try {
    const formData = req.body;
    formData.submitTime = new Date().toLocaleString();
    const dataPath = path.join(__dirname, 'form-submissions.json');
    let submissions = [];
    if (fs.existsSync(dataPath)) {
      submissions = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    }
    submissions.push(formData);
    fs.writeFileSync(dataPath, JSON.stringify(submissions, null, 2));
    res.json({ success: true, message: '表单提交成功！' });
  } catch (error) {
    res.status(500).json({ success: false, message: '提交失败：' + error.message });
  }
});

// 【关键修复】处理所有未匹配的路由，返回index.html（适配前端路由）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`服务已启动：http://localhost:${PORT}`);
});