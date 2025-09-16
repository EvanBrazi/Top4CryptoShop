// استيراد رقم الدعم من ملف الأدوات
import { SUPPORT_PHONE } from "./appUtils.js";

/**
 * قائمة الإعلانات التي سيتم عرضها بالتناوب.
 * كل إعلان يحتوي على عنوان، نص، صورة، ووظيفة تنفيذية عند النقر.
 */
const ADS = [
  {
    title: "مجتمع القمة",
    text: `📢 تواصل معنا على الرقم ${SUPPORT_PHONE}`,
    image: "/assets/images/favicon.ico",
    cta: "أنضم إلينا",
    action: () => AdsManager.openWhatsApp(SUPPORT_PHONE)
  },
  {
    title: "جديد في السوق!",
    text: "💎 اكتشف أحدث العملات الرقمية المتاحة الآن.",
    image: "/assets/images/favicon.ico",
    cta: "إكتشف الآن",
    action: () => document.dispatchEvent(new CustomEvent('switchTab', { detail: 'cryptos' }))
  },
  {
    title: "نصيحة أمان",
    text: "🔒 تأكد من تحديث إعدادات الأمان الخاصة بك.",
    image: "/assets/images/favicon.ico",
    cta: "إنتقل الآن",
    action: () => document.dispatchEvent(new CustomEvent('switchTab', { detail: 'security' }))
  },
  {
    title: "🚀 نافذة الأحصائيات",
    text: "إطلع على آخر التحليلات عبر مشوارك معنا",
    image: "/assets/images/favicon.ico",
    cta: "إنتقل الآن",
    action: () => document.dispatchEvent(new CustomEvent('switchTab', { detail: 'portfolio' }))
  }
];

/**
 * مدير الإعلانات الديناميكية - مسؤول عن عرض الإعلانات بشكل متناوب داخل عنصر محدد.
 */
export class AdsManager {
  constructor(wrapperSelector, ads) {
    this.currentIndex = 0;
    this.wrapper = document.querySelector(wrapperSelector);
    if (!this.wrapper) return console.warn("⚠️ لم يتم العثور على العنصر:", wrapperSelector);
    this.ads = ads || ADS;
    this.wrapper.style.position = "relative";
    this.wrapper.style.overflow = "hidden";
    this.startRotation();
  }

  /**
   * تهيئة العنصر الحاوي للإعلانات وتفعيل التدوير التلقائي.
   * @param {string} wrapperSelector - محدد العنصر الذي سيتم عرض الإعلانات داخله.
   */
  init(wrapperSelector) {
    this.wrapper = document.querySelector(wrapperSelector);

  }

  /**
   * بدء تدوير الإعلانات بشكل دوري.
   */
  startRotation() {
    this.showAd(this.ads[this.currentIndex]);
    setInterval(() => {
      this.currentIndex = (this.currentIndex + 1) % this.ads.length;
      this.showAd(this.ads[this.currentIndex]);
    }, 4000); // 0.8 دخول + 3 ثواني ثبات + 0.2 خروج
  }

  /**
   * عرض إعلان معين داخل العنصر الحاوي مع حركة دخول وخروج.
   * @param {Object} ad - كائن الإعلان يحتوي على النص والصورة والوظيفة.
   */
  showAd(ad) {
    const slide = document.createElement("div");
    slide.className = "ad-slide";
    slide.innerHTML = `
      <img src="${ad.image}" alt="Ad Image" class="ad-image"/>
      <div class="ads-content">
        <h1 class="ad-title">${ad.title}</h1>
        <p class="ad-text">${ad.text}</p>
        <h2 class="ad-cta">${ad.cta}</h2>
      </div>
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

  /**
   * فتح رابط واتساب بناءً على رقم الهاتف.
   * @param {string} phone - رقم الهاتف المطلوب فتحه في واتساب.
   */
  static openWhatsApp(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    } else {
      console.warn("⚠️ رقم غير صالح لواتساب:", phone);
    }
  }
}
