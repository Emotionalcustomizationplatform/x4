// 语言切换逻辑
function switchLanguage(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    const elements = document.querySelectorAll(`[data-${lang}]`);

    // 显示/隐藏语言切换按钮
    const enBtns = document.querySelectorAll('.lang-switch-btn[data-target-lang="en"]');
    const zhBtns = document.querySelectorAll('.lang-switch-btn[data-target-lang="zh"]');

    if (lang === 'en') {
        enBtns.forEach(btn => btn.style.display = 'none');
        zhBtns.forEach(btn => btn.style.display = 'inline-block');
    } else {
        enBtns.forEach(btn => btn.style.display = 'inline-block');
        zhBtns.forEach(btn => btn.style.display = 'none');
    }

    elements.forEach(el => {
        const text = el.getAttribute(`data-${lang}`);
        if (text) {
            if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'OPTION') {
                el.textContent = text;
            }
            if (el.tagName === 'OPTION') {
                el.textContent = text;
            }
            if (el.tagName === 'INPUT' && el.type === 'submit') {
                el.value = text;
            }
        }
    });
}

// 绑定语言切换事件
function bindLanguageSwitch() {
    const langBtns = document.querySelectorAll('.lang-switch-btn');
    if (langBtns) {
        langBtns.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const targetLang = e.target.getAttribute('data-target-lang');
                if (targetLang) switchLanguage(targetLang);
            });
        });
    }
}

// 初始化语言
document.addEventListener("DOMContentLoaded", () => {
    const initialLang = document.documentElement.getAttribute('data-lang') || 'en';
    switchLanguage(initialLang);
    bindLanguageSwitch();
});
