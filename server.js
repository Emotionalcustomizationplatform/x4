const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// 初始化Express应用（和你的项目根目录绑定）
const app = express();
// 适配Vercel的端口（本地运行用3000，部署后用Vercel分配的端口）
const PORT = process.env.PORT || 3000;

// 1. 解析表单提交的数据（和你的form.js接口完全匹配）
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 2. 托管项目根目录下的所有静态文件
// （包含：index.html、styles.css、script.js、carousel文件夹等）
app.use(express.static(path.join(__dirname)));

// 3. 【强制保障】单独处理carousel图片的访问（防止路径匹配异常）
app.get('/carousel/*', (req, res) => {
  // 拼接图片的绝对路径（根目录/carousel/xxx.jpg）
  const imgAbsolutePath = path.join(__dirname, req.path);
  // 检查图片是否存在
  if (fs.existsSync(imgAbsolutePath)) {
    res.sendFile(imgAbsolutePath); // 存在则返回图片
  } else {
    res.status(404).send(`图片不存在：${req.path}`); // 不存在则提示
  }
});

// 4. 表单提交接口（和你的form.js里的/api/submit-form完全对应）
app.post('/api/submit-form', (req, res) => {
  try {
    // 收集前端提交的表单数据
    const formData = req.body;
    formData.submitTime = new Date().toLocaleString();

    // 把数据存到根目录的form-submissions.json里
    const submissionsPath = path.join(__dirname, 'form-submissions.json');
    let submissions = [];
    // 如果文件已存在，读取已有数据
    if (fs.existsSync(submissionsPath)) {
      submissions = JSON.parse(fs.readFileSync(submissionsPath, 'utf8'));
    }
    // 新增本次提交的数据
    submissions.push(formData);
    // 写入文件
    fs.writeFileSync(submissionsPath, JSON.stringify(submissions, null, 2));

    // 返回成功响应给前端
    res.json({ success: true, message: '表单提交成功！' });
  } catch (error) {
    // 出错时返回错误信息
    res.status(500).json({ success: false, message: '提交失败：' + error.message });
  }
});

// 5. 所有页面请求都返回index.html（适配前端导航跳转）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务
app.listen(PORT, () => {
  console.log(`服务已绑定到项目根目录，可访问：http://localhost:${PORT}`);
  console.log(`carousel图片路径示例：http://localhost:${PORT}/carousel/slide-img-1.jpg`);
});