<!DOCTYPE html>
<html lang="en" data-lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Customize Your Companion | Form</title>
    <link rel="stylesheet" href="/styles.css" />
    <link rel="preload" href="./Creepster-Regular.ttf" as="font" type="font/truetype" crossorigin>
    <style>
        /* 返回键样式（不破坏原有布局） */
        .back-btn {
            font-size: 1rem;
            text-transform: none;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
    </style>
</head>
<body>
    <!-- 导航栏：将“工作室”改为返回键（保留首页跳转） -->
    <nav>
        <div class="logo">
            <a href="index.html" class="back-btn" data-en="Back" data-zh="返回">← 返回</a>
        </div>
        <div class="nav-links">
            <a href="#" class="lang-switch-btn" data-target-lang="zh">中文</a>
            <a href="#" class="lang-switch-btn" data-target-lang="en">English</a>
            <a href="form.html" class="to-form-btn active" data-en="Enroll Now" data-zh="立即报名">Enroll Now</a>
            <a href="projects.html" data-en="Our Services" data-zh="我们的服务">Our Services</a>
            <a href="about.html" data-en="About Us" data-zh="关于我们">About Us</a>
        </div>
    </nav>

    <!-- 表单区域：保留所有原有内容（含左侧、所有字段） -->
    <section class="registration-form-section">
        <div class="form-container">
            <h2 data-en="Fill out the form below to customize your companion." data-zh="填写以下表单定制你的专属服务">Fill out the form below to customize your companion.</h2>
            
            <form id="registrationForm">
                <fieldset>
                    <legend data-en="BASIC INFORMATION" data-zh="基础信息">BASIC INFORMATION</legend>
                    <div class="form-group">
                        <label for="name" data-en="Your Name" data-zh="你的姓名">Your Name</label>
                        <input type="text" id="name" name="name" required placeholder="Enter your full name">
                    </div>
                    <div class="form-group">
                        <label for="email" data-en="Email" data-zh="电子邮箱">Email</label>
                        <input type="email" id="email" name="email" required placeholder="Enter your email">
                    </div>
                    <div class="form-group">
                        <label for="age" data-en="Age" data-zh="年龄">Age</label>
                        <input type="number" id="age" name="age" required placeholder="Enter your age">
                    </div>
                </fieldset>

                <!-- 保留所有其他表单字段（若有） -->
                <button type="submit" data-en="Submit" data-zh="提交">Submit</button>
            </form>
        </div>
    </section>

    <!-- 底部：删除所有多余文字（清空footer） -->
    <footer>
    </footer>

    <script>
        // 保留原有表单提交逻辑
        document.getElementById('registrationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/api/submit-form', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                });

                const result = await response.json();
                alert(result.message);
                if (result.success) {
                    e.target.reset();
                }
            } catch (error) {
                alert('提交失败，请稍后再试');
                console.error(error);
            }
        });

        // 保留原有语言切换逻辑
        document.querySelectorAll('.lang-switch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = btn.getAttribute('data-target-lang');
                document.documentElement.setAttribute('data-lang', lang);
                
                document.querySelectorAll('[data-en], [data-zh]').forEach(el => {
                    el.textContent = el.getAttribute(`data-${lang}`);
                });
            });
        });
    </script>
</body>
</html>