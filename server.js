// ... 前面的代码不变 ...

// 3. 提交接口 (智能兼容版)
app.post('/api/submit', async (req, res) => {
    try {
        let { name, email, phone, plan_id, selected_plan, focus, support_type, referrer, honeypot } = req.body;

        // 1. Bot 拦截
        if (honeypot) return res.json({ status: 'success' });

        // 2. ★★★ 核心修复：智能判断套餐 (兼容旧版前端) ★★★
        // 如果前端没传 plan_id，就去检查旧版的 selected_plan
        if (!plan_id && selected_plan) {
            // 只要旧版里包含 '710' 或 'Continuous'，就认为是付费
            if (selected_plan.includes('710') || selected_plan.toLowerCase().includes('continuous')) {
                plan_id = 'continuous';
            } else {
                plan_id = 'free';
            }
        }

        // 3. 必填校验
        if (!name || !email) {
            return res.status(400).json({ status: 'error', message: 'Missing fields' });
        }

        // 4. 判断是否付费
        const isPaid = (plan_id === 'continuous'); // 只要是 continuous 就是付费
        const price = isPaid ? 710 : 0;
        const planName = isPaid ? 'Continuous Counsel ($710)' : 'Initial Dialogue (Free)';

        // 5. 兼容 focus 字段 (旧版叫 support_type)
        const finalFocus = focus || support_type || 'General';

        // 生成 ID
        const submissionId = crypto.randomUUID().slice(0, 8).toUpperCase();
        const safeText = (str) => (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const cleanData = {
            id: submissionId,
            name: safeText(name),
            email: safeText(email),
            phone: safeText(phone),
            plan: planName,
            amount: price,
            focus: safeText(finalFocus),
            ref: safeText(referrer),
            ip: req.ip
        };

        // 写日志
        await writeLog(cleanData);

        // 发邮件 (保留警告功能)
        const subjectPrefix = isPaid ? '[💰 PAYMENT PENDING]' : '[✅ FREE]';
        const warningHtml = isPaid ? `
            <div style="background: #fff3cd; color: #856404; padding: 15px; border: 1px solid #ffeeba; margin-bottom: 20px;">
                <strong>⚠️ 待付款预警 / PAYMENT PENDING</strong><br>
                此订单需支付 $710。<br>
                请务必核对 PayPal 是否到账 (ID: ${cleanData.id}) 再联系客户。
            </div>
        ` : `
            <div style="background: #d4edda; color: #155724; padding: 15px; border: 1px solid #c3e6cb; margin-bottom: 20px;">
                <strong>✅ 免费咨询</strong> - 无需付款，可直接跟进。
            </div>
        `;

        await resend.emails.send({
            from: 'Private Counsel <onboarding@resend.dev>',
            to: ['dpx204825@gmail.com'],
            reply_to: cleanData.email,
            subject: `${subjectPrefix} New Lead: ${cleanData.name}`,
            html: `
                ${warningHtml}
                <p><strong>Submission ID:</strong> ${cleanData.id}</p>
                <p><strong>Name:</strong> ${cleanData.name}</p>
                <p><strong>Email:</strong> ${cleanData.email}</p>
                <p><strong>Referrer:</strong> ${cleanData.ref}</p>
                <hr>
                <p><strong>Plan:</strong> ${cleanData.plan}</p>
                <p><strong>Focus:</strong> ${cleanData.focus}</p>
            `
        });

        // 返回结果
        let responseData = { status: 'success', submission_id: submissionId };
        if (isPaid) {
            // 付费版：返回 PayPal 链接
            responseData.redirect_url = `https://paypal.me/dpx710/${price}USD?memo=${submissionId}`;
        }
        
        return res.status(201).json(responseData);

    } catch (err) {
        console.error('Server Error:', err);
        return res.status(500).json({ status: 'error', message: 'Internal Error' });
    }
});

// ... 后面的代码不变 ...
