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
let carousel, carouselImages, prevBtn, nextBtn;
let currentIndex = 0;
let carouselTextElements = [];
let splitTextInstances = [];
let isAnimating = false;
let touchStartX = 0; // 触摸起始X坐标

// 3. 自定义缓动函数
if (typeof CustomEase !== "undefined" && !window.GSAP_LOAD_ERROR) {
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

    // 如果关键元素不存在，防止报错
    if (!carousel || !carouselImages) return;

    // 预加载轮播图图片
    preloadCarouselImages();

    createCarouselTitles();
    createInitialSlide();
    bindCarouselControls();
    bindLanguageSwitch();
    bindTouchEvents(); // 绑定触摸事件（移动端滑动）

    // 监听窗口大小变化，重新适配
    window.addEventListener('resize', debounce(() => {
        if (currentIndex >= 0 && carouselTextElements[currentIndex]) {
            const currentWords = carouselTextElements[currentIndex].querySelectorAll(".word");
            gsap.set(currentWords, { filter: "blur(0px)", opacity: 1 });
        }
    }, 300));

    // 等待字体加载完成后执行文本相关的操作
    document.fonts.ready.then(() => {
        if (window.GSAP_LOAD_ERROR) {
            // GSAP加载失败，降级显示文字
            carouselTextElements.forEach((slide, index) => {
                const words = slide.querySelectorAll(".word");
                words.forEach(word => {
                    word.style.filter = "blur(0px)";
                    word.style.opacity = index === 0 ? "1" : "0";
                });
            });
            return;
        }
        splitTitles();
        initFirstSlide();
        // 初始化语言显示
        const initialLang = document.documentElement.getAttribute('data-lang') || 'en';
        switchLanguage(initialLang);
    });
}

// 5. 图片预加载
function preloadCarouselImages() {
    carouselSlides.forEach(slide => {
        const img = new Image();
        img.src = slide.image;
        img.onload = () => {
            console.log(`Image preloaded: ${slide.image}`);
        };
        img.onerror = () => {
            console.error(`Failed to preload image: ${slide.image}`);
            // 加载失败时使用备用图片
            slide.image = "/carousel/fallback.jpg";
        };
    });
}

// 6. 创建所有幻灯片标题的 DOM 元素
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

// 7. 创建初始图片幻灯片的 DOM 元素
function createInitialSlide() {
    const initialSlideImgContainer = document.createElement("div");
    initialSlideImgContainer.classList.add("img");

    const initialSlideImg = document.createElement("img");
    initialSlideImg.src = carouselSlides[0].image;

    initialSlideImgContainer.appendChild(initialSlideImg);
    carouselImages.appendChild(initialSlideImgContainer);
}

// 8. 使用 SplitText 拆分标题为单词
function splitTitles() {
    if (window.GSAP_LOAD_ERROR) return;
    carouselTextElements.forEach((slide) => {
        const slideTitle = slide.querySelector(".title");
        const splitText = new SplitText(slideTitle, {
            type: "words",
            wordsClass: "word",
        });
        splitTextInstances.push(splitText);
    });
}

// 9. 绑定导航按钮事件监听器
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

    // 键盘方向键控制
    document.addEventListener("keydown", (e) => {
        if (isAnimating) return;
        if (e.key === "ArrowRight") animateSlide("right");
        if (e.key === "ArrowLeft") animateSlide("left");
    });
}

// 10. 绑定移动端触摸事件
function bindTouchEvents() {
    carousel.addEventListener("touchstart", (e) => {
        touchStartX = e.touches[0].clientX;
    });

    carousel.addEventListener("touchend", (e) => {
        if (isAnimating) return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchDelta = touchEndX - touchStartX;

        // 滑动距离超过50px才触发切换
        if (touchDelta > 50) {
            animateSlide("left");
        } else if (touchDelta < -50) {
            animateSlide("right");
        }
    });
}

// 11. 初始化第一张幻灯片的文字动画
function initFirstSlide() {
    if (window.GSAP_LOAD_ERROR) return;
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

// 12. 文本切换动画
function updateActiveTextSlide(prevIndex) {
    if (window.GSAP_LOAD_ERROR) {
        // 降级方案：直接显示/隐藏
        const prevWords = carouselTextElements[prevIndex].querySelectorAll(".word");
        prevWords.forEach(word => word.style.opacity = "0");

        const currentWords = carouselTextElements[currentIndex].querySelectorAll(".word");
        currentWords.forEach(word => {
            word.style.filter = "blur(0px)";
            word.style.opacity = "1";
        });
        return;
    }

    // 隐藏前一个幻灯片的文字
    const prevWords = carouselTextElements[prevIndex].querySelectorAll(".word");
    gsap.to(prevWords, {
        opacity: 0,
        duration: 0.5,
        ease: "power1.out",
        overwrite: true
    });

    // 显示当前幻灯片的文字（从模糊到清晰）
    const currentWords = carouselTextElements[currentIndex].querySelectorAll(".word");
    gsap.fromTo(currentWords,
        { filter: "blur(75px)", opacity: 0 },
        {
            filter: "blur(0px)",
            opacity: 1,
            duration: 2,
            ease: "power3.out",
            overwrite: true,
        }
    );
}

// 13. 核心幻灯片切换动画
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
    const easeType = window.GSAP_LOAD_ERROR ? "power1.out" : "hop";
    gsap.to(currentSlideImage, {
        x: direction === "left" ? slideOffset : -slideOffset,
        duration: window.GSAP_LOAD_ERROR ? 0.8 : 1.5,
        ease: easeType,
    });

    // 3. 动画新幻灯片容器 (剪裁路径展开)
    gsap.fromTo(newSlideImgContainer, {
        clipPath:
            direction === "left"
                ? "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)"
                : "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
    }, {
        clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
        duration: window.GSAP_LOAD_ERROR ? 0.8 : 1.5,
        ease: easeType,
        onComplete: () => {
            cleanupCarouselSlides();
            isAnimating = false;
        },
    });

    // 4. 动画新图片 (移入中心)
    gsap.to(newSlideImg, {
        x: 0,
        duration: window.GSAP_LOAD_ERROR ? 0.8 : 1.5,
        ease: easeType,
    });

    // 5. 动画文字
    updateActiveTextSlide(prevIndex);
}

// 14. 清理旧幻灯片
function cleanupCarouselSlides() {
    const imgElements = carouselImages.querySelectorAll(".img");
    if (imgElements.length > 1) {
        for (let i = 0; i < imgElements.length - 1; i++) {
            imgElements[i].remove();
        }
    }
}

// 15. 语言切换逻辑
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

// 16. 绑定语言切换事件
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

// 17. 防抖函数（优化窗口resize事件）
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// 18. DOM 加载完成事件监听
document.addEventListener("DOMContentLoaded", initCarousel);
