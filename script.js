// 1. 数据定义
const carouselSlides = [
    {
        title: "Feast of Color",
        image: "/carousel/slide-img-1.jpg",
    },
    {
        title: "The Matador",
        image: "/carousel/slide-img-2.jpg",
    },
    {
        title: "Final Plea",
        image: "/carousel/slide-img-3.jpg",
    },
    {
        title: "Old Philosopher",
        image: "/carousel/slide-img-4.jpg",
    },
    {
        title: "Evening Waltz",
        image: "/carousel/slide-img-5.jpg",
    },
];

// 2. 全局变量
let carousel, carouselImages, prevBtn, nextBtn, toFormBtn, backBtn;
let registrationSection;

let currentIndex = 0;
let carouselTextElements = [];
let splitTextInstances = [];
let isAnimating = false;

// 3. 自定义缓动函数
if (typeof CustomEase !== "undefined") {
    CustomEase.create(
        "hop",
        "M0,0 C0.071,0.505 0.192,0.726 0.318,0.852 0.45,0.984 0.504,1 1,1"
    );
}

// 4. 初始化函数
function initCarousel() {
    // 获取 DOM 元素
    carousel = document.querySelector(".carousel");
    carouselImages = document.querySelector(".carousel-images");
    prevBtn = document.querySelector(".prev-btn");
    nextBtn = document.querySelector(".next-btn");
    toFormBtn = document.querySelector(".to-form-btn"); // 获取新的按钮
    backBtn = document.querySelector(".back-to-carousel-btn");
    registrationSection = document.querySelector(".registration-form-section"); // 获取表单区

    // 如果关键元素不存在，防止报错
    if (!carousel || !carouselImages) return;

    createCarouselTitles();
    createInitialSlide();
    bindCarouselControls();
    bindLanguageSwitch(); // 绑定语言切换
    bindFormTransition(); // 绑定表单切换
    bindBackToCarousel(); // 绑定返回事件

    // 等待字体加载完成后执行文本相关的操作
    document.fonts.ready.then(() => {
        // 确保 SplitText 插件已加载
        if (typeof SplitText === 'undefined') {
            console.error("GSAP SplitText plugin is not loaded.");
            return;
        }
        splitTitles();
        initFirstSlide();
        // 初始化语言显示
        const initialLang = document.documentElement.getAttribute('data-lang') || 'en';
        switchLanguage(initialLang);
    });
}

// 5. 创建所有幻灯片标题的 DOM 元素 (之前缺失的部分)
function createCarouselTitles() {
    carouselSlides.forEach((slide) => {
        const slideTitleContainer = document.createElement("div");
        slideTitleContainer.classList.add("slide-title-container");

        const slideTitle = document.createElement("h1");
        slideTitle.classList.add("title");
        slideTitle.textContent = slide.title;

        slideTitleContainer.appendChild(slideTitle);
        carousel.appendChild(slideTitleContainer);

        carouselTextElements.push(slideTitleContainer);
    });
}

// 新增函数：绑定返回轮播图的事件
function bindBackToCarousel() {
    if (!backBtn || !registrationSection) return;

    backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isAnimating) return;
        isAnimating = true;

        // 1. 隐藏表单区域 (淡出并下移)
        gsap.to(registrationSection, {
            opacity: 0,
            y: 50,
            duration: 0.8,
            ease: "power2.in",
            onComplete: () => {
                registrationSection.style.display = 'none';
                carousel.style.display = 'block';

                // 2. 恢复轮播图容器 (放大并展开 ClipPath)
                gsap.to(carousel, {
                    clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)", // 恢复全屏
                    scale: 1, // 恢复原始大小
                    opacity: 1,
                    duration: 1,
                    ease: "power3.out"
                });

                // 3. 恢复当前幻灯片的文字 (淡入并消除模糊)
                const currentWords = carouselTextElements[currentIndex].querySelectorAll(".word");
                gsap.to(currentWords, {
                    opacity: 1,
                    filter: "blur(0px)",
                    duration: 1.5,
                    delay: 0.3, // 稍微延迟一点，等画面展开再出文字
                    ease: "power3.out"
                });

                // 4. 恢复页脚和导航控制按钮
                const footer = document.querySelector('footer');
                if (prevBtn && prevBtn.parentElement) {
                    gsap.to(prevBtn.parentElement, { opacity: 1, duration: 0.5, delay: 0.5 });
                }
                if (footer) {
                    gsap.to(footer, { opacity: 1, duration: 0.5, delay: 0.5 });
                }

                isAnimating = false;
            }
        });
    });
}

// 6. 创建初始图片幻灯片的 DOM 元素 (之前缺失的部分)
function createInitialSlide() {
    const initialSlideImgContainer = document.createElement("div");
    initialSlideImgContainer.classList.add("img");

    const initialSlideImg = document.createElement("img");
    initialSlideImg.src = carouselSlides[0].image;

    initialSlideImgContainer.appendChild(initialSlideImg);
    carouselImages.appendChild(initialSlideImgContainer);
}

// 7. 使用 SplitText 拆分标题为单词 (之前缺失的部分)
function splitTitles() {
    carouselTextElements.forEach((slide) => {
        const slideTitle = slide.querySelector(".title");
        const splitText = new SplitText(slideTitle, {
            type: "words",
            wordsClass: "word",
        });
        splitTextInstances.push(splitText);
    });
}

// 8. 绑定导航按钮事件监听器 (之前缺失的部分)
function bindCarouselControls() {
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (isAnimating) return;
            animateSlide("right");
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (isAnimating) return;
            animateSlide("left");
        });
    }
}

// 9. 初始化第一张幻灯片的文字动画 (之前缺失的部分)
function initFirstSlide() {
    // 确保除了第一个之外的所有文字都设置为初始隐藏状态
    carouselTextElements.forEach((slide, index) => {
        if (index !== 0) {
            gsap.set(slide.querySelectorAll(".word"), { opacity: 0, filter: "blur(75px)" });
        }
    });

    const initialSlideWords = carouselTextElements[0].querySelectorAll(".word");

    gsap.to(initialSlideWords, {
        filter: "blur(0px)",
        opacity: 1,
        duration: 2,
        ease: "power3.out",
    });
}

// 10. 文本切换动画 (之前缺失的部分)
function updateActiveTextSlide(prevIndex) {
    // 隐藏前一个幻灯片的文字
    const prevWords = carouselTextElements[prevIndex].querySelectorAll(".word");

    gsap.to(prevWords, {
        opacity: 0,
        duration: 0.5, // 快速淡出
        ease: "power1.out",
        overwrite: true
    });

    // 显示当前幻灯片的文字（从模糊到清晰）
    const currentWords = carouselTextElements[currentIndex].querySelectorAll(".word");

    gsap.fromTo(currentWords,
        { filter: "blur(75px)", opacity: 0 }, // 初始状态
        {
            filter: "blur(0px)",
            opacity: 1,
            duration: 2,
            ease: "power3.out",
            overwrite: true,
        }
    );
}

// 11. 核心幻灯片切换动画
function animateSlide(direction) {
    if (isAnimating) return;
    isAnimating = true;

    const prevIndex = currentIndex;

    // 更新 currentIndex
    if (direction === "right") {
        currentIndex = (currentIndex + 1) % carouselSlides.length;
    } else {
        currentIndex = (currentIndex - 1 + carouselSlides.length) % carouselSlides.length;
    }

    const viewportWidth = window.innerWidth;
    const slideOffset = Math.min(viewportWidth * 0.5, 500);

    const currentSlide = carouselImages.querySelector(".img:last-child");
    const currentSlideImage = currentSlide.querySelector("img");

    // 1. 创建新幻灯片
    const newSlideImgContainer = document.createElement("div");
    newSlideImgContainer.classList.add("img");

    const newSlideImg = document.createElement("img");
    newSlideImg.src = carouselSlides[currentIndex].image;

    gsap.set(newSlideImg, {
        x: direction === "left" ? -slideOffset : slideOffset,
    });

    newSlideImgContainer.appendChild(newSlideImg);
    carouselImages.appendChild(newSlideImgContainer);

    // 2. 动画旧图片 (推出)
    gsap.to(currentSlideImage, {
        x: direction === "left" ? slideOffset : -slideOffset,
        duration: 1.5,
        ease: "hop",
    });

    // 3. 动画新幻灯片容器 (剪裁路径展开)
    gsap.fromTo(newSlideImgContainer, {
        clipPath:
            direction === "left"
                ? "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)"
                : "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
    }, {
        clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        duration: 1.5,
        ease: "hop",
        onComplete: () => {
            cleanupCarouselSlides();
            isAnimating = false;
        },
    });

    // 4. 动画新图片 (移入中心)
    gsap.to(newSlideImg, {
        x: 0,
        duration: 1.5,
        ease: "hop",
    });

    // 5. 动画文字
    updateActiveTextSlide(prevIndex);
}

// 12. 清理旧幻灯片
function cleanupCarouselSlides() {
    const imgElements = carouselImages.querySelectorAll(".img");
    if (imgElements.length > 1) {
        for (let i = 0; i < imgElements.length - 1; i++) {
            imgElements[i].remove();
        }
    }
}

// 13. 语言切换逻辑
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
            // 排除 H1 (因为 SplitText 处理了它) 和输入控件
            if (!el.classList.contains('title') && el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'OPTION') {
                el.textContent = text;
            }
            // 处理 input/select/option
            if (el.tagName === 'OPTION') {
                el.textContent = text;
            }
            if (el.tagName === 'INPUT' && el.type === 'submit') {
                el.value = text;
            }
            // 处理 placeholder
            if (el.tagName === 'INPUT' && el.getAttribute(`data-${lang}-placeholder`)) {
                el.placeholder = el.getAttribute(`data-${lang}-placeholder`);
            }
        }
    });
}

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

// 14. 轮播图到表单的过渡动画
function bindFormTransition() {
    if (!toFormBtn || !registrationSection) return;

    toFormBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isAnimating) return;
        isAnimating = true;

        // 1. 隐藏轮播图文本
        const currentWords = carouselTextElements[currentIndex].querySelectorAll(".word");
        gsap.to(currentWords, {
            opacity: 0,
            filter: "blur(75px)",
            duration: 0.8,
            ease: "power2.in",
        });

        // 2. 动画轮播图容器 (快速收缩/剪裁)
        gsap.to(carousel, {
            clipPath: "polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)", // 收缩到中心点
            scale: 1.1, // 略微放大
            opacity: 0.5,
            duration: 1,
            ease: "power3.inOut",
            onComplete: () => {
                // 3. 隐藏轮播，显示表单
                carousel.style.display = 'none';
                registrationSection.style.display = 'flex';

                // 4. 动画表单区域 (从隐藏状态滑入/淡入)
                gsap.fromTo(registrationSection,
                    { opacity: 0, y: 50 },
                    { opacity: 1, y: 0, duration: 1, ease: "power3.out" }
                );

                // 5. 重新设置轮播图为初始状态，为返回做准备 (虽然这里没做返回按钮，但这是好习惯)
                gsap.set(carousel, {
                    clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
                    scale: 1,
                    opacity: 1
                });

                isAnimating = false;
            }
        });

        // 隐藏轮播图控制和页脚
        const footer = document.querySelector('footer');
        if (prevBtn && prevBtn.parentElement) gsap.to(prevBtn.parentElement, { opacity: 0, duration: 0.5 });
        if (footer) gsap.to(footer, { opacity: 0, duration: 0.5 });
    });
}

// 15. DOM 加载完成事件监听
document.addEventListener("DOMContentLoaded", initCarousel);