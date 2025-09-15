const AdsManager = {
  ads: [
    {
      text: "📢 خصم 20% على العملات الرقمية!",
      image: "/assets/images/favicon.ico",
      action: () => alert("فتح صفحة الخصومات")
    },
    {
      text: "🚀 تحليلات جديدة متاحة!",
      image: "/assets/images/favicon.ico",
      action: () => alert("فتح لوحة التحليلات")
    },
    {
      text: "🔐 فعّل الحماية الآن",
      image: "/assets/images/favicon.ico",
      action: () => alert("فتح إعدادات الأمان")
    }
  ],

  currentIndex: 0,
  wrapper: null,

  init(wrapperSelector) {
    this.wrapper = document.querySelector(wrapperSelector);
    this.wrapper.style.position = "relative";
    this.wrapper.style.overflow = "hidden";
    this.startRotation();
  },

  startRotation() {
    this.showAd(this.ads[this.currentIndex]);
    setInterval(() => {
      this.currentIndex = (this.currentIndex + 1) % this.ads.length;
      this.showAd(this.ads[this.currentIndex]);
    }, 4000); // 0.8 دخول + 3 ثواني ثبات + 0.2 خروج
  },

  showAd(ad) {
    const slide = document.createElement("div");
    slide.className = "ad-slide";
    slide.innerHTML = `
      <img src="${ad.image}" alt="Ad Image" />
      <div class="ad-text">${ad.text}</div>
    `;
    slide.onclick = () => ad.action();

    this.wrapper.appendChild(slide);

    // دخول من اليمين
    requestAnimationFrame(() => {
      slide.style.transform = "translateX(0%)";
    });

    // خروج بعد 3 ثواني
    setTimeout(() => {
      slide.style.transform = "translateX(-100%)";
    }, 3000);

    // إزالة العنصر بعد انتهاء الحركة
    setTimeout(() => {
      this.wrapper.removeChild(slide);
    }, 4000);
  }
};

export default AdsManager;
