import Cookies from 'https://cdn.jsdelivr.net/npm/js-cookie@3.0.1/dist/js.cookie.min.mjs';
class Taber {
    /**
     * @constructor
     * @param {HTMLElement} sidebarContianer - حاوية القائمة الجانبية
     * @param {HTMLElement} tabsContentContainer - حاوية محتويات التابات
     * @param {Object} options - خيارات إضافية
     * @param {string} options.tabClass - كلاس CSS لعناصر التاب (افتراضي: 'tab')
     * @param {string} options.activeClass - كلاس CSS للتاب النشط (افتراضي: 'active')
     * @param {string} options.defaultTab - الفهرس الافتراضي للتاب النشط (افتراضي: 'home')
     * @param {string} options.storageKey - مفتاح حفظ التاب النشط في ذاكرة المتصفح المحلية (افتراضي 'activeTab')
     * @param {boolean} options.useCookies - الإذن لحفظ التاب النشط في كوكيز (افتراضي false)
     */
    constructor(sidebarContianer, tabsContentContainer, options = {}) {
        if (Taber._instance) {
            console.trace('Taber instance already created!');
            return Taber._instance;
        }
        this.sidebarContianer = sidebarContianer;
        this.tabsContentContainer = tabsContentContainer;
        this.options = {
            menuItemSelector: options.menuItemSelector || '.sidebar-menu li',
            tabLinkSelector: options.tabLinkSelector || '.sidebar-menu li a',
            tabPaneSelector: options.tabPaneSelector || '.tab-pane',
            activeClass: options.activeClass || 'active',
            defaultTab: options.defaultTab || 'home', // بدلاً من الفهرس نستخدم قيمة data_tab
            storageKey: options.storageKey || 'activeTab',
            useCookies: options.useCookies || false // لا تحفظ معرف التاب في كوكيز
        };

        this.tabLinks = [];
        this.tabPanes = [];
        this.activeTabId = null;
        this.eventListeners = {
            tabChange: []
        };

        Taber._instance = this;
        this._initialize();
    }

    /**
     * تهيئة التابات وجمعها من الدرج الجانبي
     */
    _initialize() {
        // جمع عناصر التاب في السايدبار
        // جمع محتويات التاب
        this._refreshElements();
        // إضافة event listeners لكل تاب
        this.tabLinks.forEach(link => {
            link.addEventListener('click', (e) => { // ربط الأحداث
                e.preventDefault();
                const tabId = link.getAttribute('data-tab');
                this.activateTab(tabId);
            });
        });

        // إستعيد التاب الآخير || إذهب للإفتراضي
        this.activateTab(this._restoreActiveTab());
    }

    /**
     * معالجة حدث النقر على التاب
     * @param {number} tabIndex - فهرس التاب الذي تم النقر عليه
     */
    _handleTabClick(tabIndex) {
        this.activateTab(tabIndex);

        // استدعاء جميع الـ listeners المسجلة لحدث النقر
        this.eventListeners.tabClick.forEach(listener => {
            listener(tabIndex, this.tabs[tabIndex]);
        });
    }

    /**
     * 
     * @param {string} tabId 
     * @param {HTMLElement} link 
     * @param {*HTMLElement} pane 
     */
    _triggerTabChange(tabId, link, pane) {
        this._saveActiveTab(tabId);

        this.eventListeners.tabChange.forEach(listener => {
            listener(tabId, link, pane);
        })
    }

    /**
     * حذف تاب معين
     * @param {string} tabId - معرف التاب المطلوب حفظه
     * Save active tab in { localStorage,
     *                      cookeisStorage,
     *                      sissionStorge
     *                  }
     */
    _saveActiveTab(tabId) {
        if (!this.options.storageKey) {
            console.error('storageKey not defined!');
            return;
        }
        // Save into localStorage
        try {
            localStorage.setItem(this.options.storageKey, tabId);
            if (this.options.useCookies && typeof Cookies !== 'undefined') {
                // Save into cookies
                Cookies.set(this.options.storageKey, tabId, {
                    expires: 7,
                    path: '/',
                    sameSite: 'Lax'
                });
            }
        } catch (e) {
            console.warn('Failed to save active tab: ', e);
        }
    }

    _restoreActiveTab() {
        // Restore active tab from localStorage
        let savedTab = null;
        try {
            savedTab = localStorage.getItem(this.options.storageKey);
        } catch (e) {
            console.warn('LocalStorage not available, using sessionStorage', e);
            savedTab = sessionStorage.getItem(this.options.storageKey);
        }
        // 2. إذا لم يوجد في localStorage، جرب cookies
        if (!savedTab) {
            try {
                savedTab = Cookies.get(this.options.storageKey); // إذا كنت تستخدم js-cookie
                // أو باستخدام API المتصفح:
                // savedTab = document.cookie.split('; ').find(row => row.startsWith(`${this.storageKey}=`))?.split('=')[1];
            } catch (e) {
                console.warn('Failed to read from cookies:', e);
            }
        }
        // 3. التحقق من وجود التاب قبل التفعيل
        if (savedTab && this._validateTabExists(savedTab)) {
            // @TODO: Update back button when reload;
            return savedTab;
        } else {
            console.log('Error while Restored Tab:\t' + savedTab + '\t!\tGo to default: ' + this.options.defaultTab);
            // إذا كان التاب المحفوظ غير موجود، نستخدم الافتراضي
        }
        return this.options.defaultTab;
    }

    onTabChange(callback) {
        if (typeof callback === 'function') {
            this.eventListeners.tabChange.push(callback);
        }
    }

    /**
     * تفعيل تاب معين
     * @param {string} tabId - فهرس التاب المراد تفعيله
     */
    activateTab(tabId) {
        // البحث عن التاب المطلوب
        const targetLink = this.tabLinks.find(link => link.getAttribute('data-tab') === tabId);
        const targetPane = this.tabPanes.find(pane => pane.id === `${tabId}-tab`);

        if (!targetLink || !targetPane) {
            if (targetPane) {
                console.log('Catch outSideBar Tab: ' + tabId);
                this.tabPanes.forEach(pane => pane.classList.remove(this.options.activeClass));
                targetPane.classList.add(this.options.activeClass);
            } else {
                console.error(`Tab with id "${tabId}" not found`);
                return;
            }
        } else {
            // إزالة الحالة النشطة للعناصر المحددة
            this.tabLinks.forEach(link => link.parentElement.classList.remove(this.options.activeClass));
            this.tabPanes.forEach(pane => pane.classList.remove(this.options.activeClass));

            // إضافة الحالة النشطة للعناصر المحددة
            targetLink.parentElement.classList.add(this.options.activeClass);
            targetPane.classList.add(this.options.activeClass);
        }
        this.activeTabId = tabId;

        // إطلاق حدث تغيير التاب
        this._triggerTabChange(tabId, targetLink, targetPane);
    }

    /**
   * إضافة تاب جديد ديناميكياً
   * @param {Object} tabData - بيانات التاب الجديد
   * @param {string} tabData.id - المعرف الفريد للتاب (يستخدم في data-tab)
   * @param {string} tabData.title - نص التاب
   * @param {string} tabData.icon - أيقونة التاب (اختياري)
   * @param {string} tabData.content - محتوى التاب
   */
    addTab(tabData) {
        // 1. التحقق من عدم وجود التبويب مسبقاً
        if (this.tabLinks.some(link => link.dataset.tab === tabData.id)) {
            console.warn(`Tab ${tabData.id} already exists!`);
            return;
        }
        // 2. إنشاء عنصر التاب في السايدبار
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#';
        a.setAttribute('data-tab', tabData.id);

        if (tabData.icon) {
            const icon = document.createElement('i');
            icon.className = tabData.icon;
            a.appendChild(icon);
            a.appendChild(document.createTextNode(' ' + tabData.title));
        } else {
            a.textContent = tabData.title;
        }

        li.appendChild(a);
        this.sidebarContianer.querySelector('.sidebar-menu').appendChild(li);

        // 3. إنشاء محتوى التاب
        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.id = `${tabData.id}-tab`;
        pane.innerHTML = tabData.content;
        this.tabsContentContainer.querySelector('.tabs-content').appendChild(pane);

        // 4. إعادة تهيئة التابات لتشمل الجديدة
        this._refreshElements();

        // 5. Add listener to new tab
        a.addEventListener('click', (e) => {
            e.preventDefault();
            this.activateTab(tabData.id);
        });

        // 6. تفعيل التاب الجديد إذا كان الأول
        if (this.tabLinks.length === 1) {
            this.activateTab(tabData.id);
        }

        // 7. (Optional) Shot flag to tell system new tab added
        this._dispatchEvent('tabAdded', { tabId: tabData.id });
    }

    /**
     * حذف تاب معين
     * @param {string} tabId - معرف التاب المطلوب حذفه
     */
    removeTab(tabId) {
        // 1. حذف عنصر التاب من السايدبار
        const tabLink = this.tabLinks.find(link => link.getAttribute('data-tab') === tabId);
        if (tabLink) {
            tabLink.parentElement.remove();
        }

        // 2. حذف محتوى التاب
        const pane = this.tabPanes.find(pane => pane.id === `${tabId}-tab`);
        if (pane) {
            pane.remove();
        }

        // 3. إعادة تهيئة التابات
        this._refreshElements();

        // 4. إذا كان التاب المحذوف هو النشط، ننشط التاب الأول
        if (this.activeTabId === tabId && this.tabLinks.length > 0) {
            const newTabId = this.tabLinks[0].getAttribute('data-tab');
            this.activateTab(newTabId);
        }
    }

    /**
     * تسجيل listener لحدث النقر على التاب
     * @param {Function} callback - دالة الـ callback التي سيتم استدعاؤها عند النقر على تاب
     */
    onTabClick(callback) {
        if (typeof callback === 'function') {
            this.eventListeners.tabClick.push(callback);
        }
    }

    // Add special Action
    _dispatchEvent(eventName, detail) {
        this.sidebarContianer.dispatchEvent(new CustomEvent(`taber:${eventName}`, { detail }));
    }

    // Refresh elements directly
    _refreshElements() {
        this.tabLinks = Array.from(this.sidebarContianer.querySelectorAll(this.options.tabLinkSelector));
        this.tabPanes = Array.from(this.tabsContentContainer.querySelectorAll(this.options.tabPaneSelector));
    }

    /**
     * فحص حالة تاب معين
     * @param {string} tabId - معرف التاب المطلوب فحصه
     * ترجع حالة منطيقة صح صح او صح خطأ اذا كان موجود فالنتيجة صحيح
     * ترجع خطأ خطأ إذا كان غير موجود فالنتيجة خطأ
     */
    _validateTabExists(tabId) {
        // التحقق من وجود التاب في السايدبار
        // التحقق من وجود المحتوى المقابل
        // Like smallCards-tab
        return this.tabLinks.find(link => link.getAttribute('data-tab') === tabId) || this.tabPanes.find(pane => pane.id === `${tabId}-tab`);
    }

    /**
     * الحصول على عدد التابات الحالي
     * @returns {number} عدد التابات
     */
    getTabCount() {
        return this.tabs.length;
    }

    /**
     * الحصول على الفهرس الحالي للتاب النشط
     * @returns {number} فهرس التاب النشط
     */
    getActiveTabIndex() {
        return this.activeTabIndex;
    }

    /**
     * الحصول على عنصر التاب النشط
     * @returns {HTMLElement} عنصر التاب النشط
     */
    getActiveTab() {
        return {
            id: this.activeTabId,
            link: this.tabLinks.find(link => link.getAttribute('data-tab') === this.activeTabId),
            pane: this.tabPanes.find(pane => pane.id === `${this.activeTabId}-tab`)
        };
    }
}
export { Taber };
