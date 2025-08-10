import { HomeTab } from "./tabs/hometab.js";
import { AppsTab } from "./tabs/appstab.js";

const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.overlay');
const backBtn = document.getElementById('back-btn');

class AppManager {
  constructor(taberInstance) {
    // حفظ المرجع إلى taber
    this.taber = taberInstance;
    // تهيئة التابات
    this.tabs = {
      /**تمرير المرجع */ // في AppManager أو مكان إنشاء التابات
      home: new HomeTab({
        taber: this.taber,
        containerId: 'home-tab-cards-container',
        whichCardClick: this.whichCardClick,
        options: {
          useCookies: true,
          enableAnimations: true,
          apiEndpoint: '/api/cards', // رابط JSON فقط
          iconBasePath: '/icons/apps/', // مجلد الأيقونات
          logoBasePath: '/assets/images/' // مجلد الشعارات (اختياري)
        }
      }),
      apps: new AppsTab({
        taber: this.taber,
        containerId: 'apps-tab-container',
        options: {
          themeColor: '#6a5acd',
          dialogBgColor: '#ffffff'
        }
      })
    }
    /**smallCards: new SmallCardsTab({
      containerId: 'smallCards-tab',
      taber: this.taber
    })
  };*/
    this.setupBackButton();
  }

  setupBackButton() {
    this.taber.onTabChange((tabId, link, pane) => {
      // يمكنك هنا إضافة أي تأثيرات إضافية عند تغيير التاب
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      //updateBackButton();
      (tabId === 'home' && pane.id === 'home-tab') ? backBtn.style.display = 'none' : backBtn.style.display = 'block';
    });
  };

  whichCardClick(index, card) {
    console.log('Which card click: ' + index + '\n' + card.title + ' : I am clicked!');

  }
}
export { AppManager };