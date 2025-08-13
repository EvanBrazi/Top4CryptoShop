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
    // تحميل بيانات التطبيقات
    const appsData = await this.api.fetchData('/api/apps', 'appsData');

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

    this.tabs.apps = new AppsTab({
      taber: this.taber,
      containerId: 'apps-tab-container',
      options: {
        appsData,
        cacheIcon, // تمرير الدالة هنا
        iconCache: localStorageIconCache,
        themeColor: '#6a5acd',
        dialogBgColor: '#ffffff',
        enableServiceWorker: true,
        enableWebWorker: true,
        lazyLoadThreshold: 50
      }
    });


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