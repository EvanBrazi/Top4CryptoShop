/**
 * @file appmanager.js
 * @description نقطة البداية لتحميل بيانات التطبيقات وقائمة الأيقونات وربطها بكلاس AppsTab
 * @author Top-Al9mh
 */
import { HomeTab } from "./tabs/hometab.js";
import { AppsTab } from "./tabs/appstab.js";
import ApiService from './services/apiService.js';

const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.overlay');
const backBtn = document.getElementById('back-btn');

export async function cacheIcon(url) {
  const cache = await caches.open('icons-cache');
  const match = await cache.match(url);
  console.log('CacheIcon: ' + url);

  if (match) return match;

  const response = await fetch(url);
  cache.put(url, response.clone());
  return response;
}

const localStorageIconCache = {
  get: async (url) => {
    const cachedData = localStorage.getItem(url);
    if (!cachedData) return null;

    console.log('LocalStorageIconCache: ' + url);
    
    // تحويل base64 مرة أخرى إلى Blob
    const byteString = atob(cachedData.split(',')[1]);
    const mimeString = cachedData.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  },
  set: async (url, blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        localStorage.setItem(url, reader.result);  // سلسلة بترميز base64
        resolve();
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};

/**
 * @function transformAppsData
 * @description تنظف وتحول بيانات التطبيقات دفعة واحدة
 * @param {Array} rawData - مصفوفة التطبيقات الخام من JSON
 * @returns {Array} - مصفوفة التطبيقات بعد التنظيف
 */
export function transformAppsData(rawData) {
  return Array.isArray(rawData) ? rawData.map(app => {
    const price = parseFloat(app.price);
    const safeName = typeof app.name === 'string' ? app.name.trim() : 'بدون اسم';
    const safeIcon = isValidImage(app.icon) ? app.icon.trim() : null;
    const safeCategory = typeof app.category === 'string' ? app.category.trim() : 'غير مصنف';
    const safeAvailable = Boolean(app.available);

    return {
      id: Number.isInteger(app.id) ? app.id : null,
      name: safeName || 'بدون اسم',
      icon: safeIcon || '/icons/apps/default.png',
      category: safeCategory,
      price: isNaN(price) ? null : price,
      available: safeAvailable
    };
  }) : [];
}

/**
 * @function isValidImage
 * @description تتحقق من صلاحية اسم الصورة
 * @param {string} filename - اسم ملف الصورة
 * @returns {boolean}
 */
function isValidImage(filename) {
  if (typeof filename !== 'string') return false;
  const allowedExtensions = /\.(png|jpg|jpeg|svg|webp)$/i;
  const isSafePath = !/^https?:\/\//i.test(filename);
  return allowedExtensions.test(filename) && isSafePath;
}


/**
 * @class AppManager
 * @description تهيئة تطبيق عرض التطبيقات بتحميل البيانات وربطها بالكلاس
 * @returns {new appmanager}
 */
export class AppManager {
  constructor(taberInstance) {
    // حفظ المرجع إلى taber
    this.taber = taberInstance;
    this.api = new ApiService(); // ربط الخدمة هنا
    // تهيئة التابات
    this.tabs = {};
    this.initTabs();
    this.setupBackButton();
    this.api.clearOldCache(); // ينظف الكاش القديم عند التشغيل
  }

  async initTabs() {
    this.tabs.home = new HomeTab({
      taber: this.taber/**تمرير المرجع */,
      containerId: 'home-tab-cards-container',
      whichCardClick: this.whichCardClick,
      options: {
        useCookies: true,
        enableAnimations: true,
        apiEndpoint: '/api/cards', // رابط JSON فقط
        iconBasePath: '/icons/apps/', // مجلد الأيقونات
        logoBasePath: '/assets/images/' // مجلد الشعارات (اختياري)
      }
    });

    (async () => {
      try {
        // 🧠 إنشاء خدمة API
        const api = new ApiService();

        // 📦 تحميل بيانات التطبيقات من السيرفر
        const rawAppsData = await api.fetchData('/api/apps', 'appsData');
        const appsData = transformAppsData(rawAppsData);

        // 📦 تحميل قائمة الأيقونات من السيرفر
        const iconsListResponse = await api.fetchData('/api/icons-list', 'iconsList');
        const iconsList = Array.isArray(iconsListResponse.icons) ? iconsListResponse.icons : [];


        // 🎯 إنشاء كائن AppsTab وربط البيانات
        new AppsTab({
          containerId: 'apps-tab-container',
          options: {
            appsData,
            iconsBasePath: '/icons/apps/',
            iconsList,
            cacheIcon: fetch,
            iconCache: localStorageIconCache,
            themeColor: '#6a5acd',
            dialogBgColor: '#ffffff'
          }
        });
      } catch (error) {
        console.error('❌ فشل تهيئة مدير التطبيقات:', error);
        const container = document.getElementById('apps-tab-container');
        if (container) {
          container.innerHTML = `<div class="apps-error">حدث خطأ أثناء تحميل التطبيقات. يرجى تحديث الصفحة.</div>`;
        }
      }
    })();



    /**
     * registerTab(name, instance) {
     * this.tabs[name] = instance;
     * }
     */
  }

  setupBackButton() {
    this.taber.onTabChange((tabId, link, pane) => {
      // يمكنك هنا إضافة أي تأثيرات إضافية عند تغيير التاب
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      //updateBackButton();
      backBtn.style.display = (tabId === 'home' && pane.id === 'home-tab') ? 'none' : 'block';
    });
  }

  whichCardClick(index, card) {
    console.log(`Which card click: ${index}\n${card.title} : I am clicked!`);
  }
}