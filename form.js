// 表单提交逻辑
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById('companion-form');
    const successMsg = document.getElementById('form-success');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 禁用提交按钮，防止重复提交
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = submitBtn.getAttribute(`data-${document.documentElement.getAttribute('data-lang') || 'en'}`) || 'Submitting...';

            // 收集表单数据
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            try {
                // 后端接口请求（替换为你的实际接口地址）
                const response = await fetch('/api/submit-form', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    // 提交成功，显示成功信息
                    form.style.display = 'none';
                    successMsg.style.display = 'block';
                } else {
                    throw new Error(result.message || '提交失败，请重试');
                }
            } catch (error) {
                alert(error.message);
                // 恢复提交按钮状态
                submitBtn.disabled = false;
