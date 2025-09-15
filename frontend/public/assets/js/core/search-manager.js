import { DialogPurchase } from '../dialogs/purchaseDialog.js';
import { SUPPORT_PHONE } from '../utils/appUtils.js';

export class SearchManager {
    constructor(appManager) {
        this.appManager = appManager;
        this.searchInput = document.getElementById('main-search-input');
        this.suggestionsContainer = document.getElementById('search-suggestions');
        this.originalContents = new Map();
        this.backButton = null;

        this.init();
    }

    init() {
        this.storeOriginalContents();

        this.searchInput.addEventListener('input', this.handleSearch.bind(this));
        this.searchInput.addEventListener('focus', () => {
            const query = this.searchInput.value.trim();
            this.showSuggestions(query);
        });

        document.addEventListener('click', (e) => {
            if (!this.searchInput.contains(e.target) && !this.suggestionsContainer.contains(e.target)) {
                this.hideSuggestions();
            }
        });

        this.setupTabObserver();
        console.log('🔍 SearchManager initialized');
    }

    storeOriginalContents() {
        const sections = ['home', 'apps', 'games', 'cryptos', 'balances'];
        sections.forEach(section => {
            const container = document.getElementById(`${section}-tab-container`);
            if (container) {
                this.originalContents.set(section, container.innerHTML);
            }
        });
    }

    restoreOriginalContents() {
        this.originalContents.forEach(async (content, section) => {
            const container = document.getElementById(`${section}-tab-container`);
            if (container) {
                //container.innerHTML = content;
                await this.reinitializeIcons(section);
            }
        });
        this.removeBackButton();
        this.appManager.updateBackBtnVisibility();
    }

    async reinitializeIcons(section) {
        console.log(`♻️ إعادة تهيئة الأيقونات في قسم: ${section}`);
        /**
         * استخدام طريقة عامة لإعادة عرض الشبكة بدلاً من الاعتماد على طريقة خاصة بالتحميل الكسول
         * والتي قد لا تكون موجودة في جميع التبويبات
         */
        const tab = this.appManager.tabs[section];
        if (tab && typeof tab.refresh === 'function') {
            setTimeout(async () => await tab.refresh(), 100);
        }
    }

    setupTabObserver() {
        const searchContainer = document.querySelector('.search-container');
        if (!searchContainer) return;
        const allowedTabs = ['home', 'apps', 'games', 'cryptos', 'balances'];
        //if (!this.isHomeTabActive()) {
        //    searchContainer.style.display = 'none';
        //}
        this.appManager.taber.onTabChange((tabId) => {
            if (allowedTabs.includes(tabId)) {
                searchContainer.style.display = 'block';
            } else {
                searchContainer.style.display = 'none';
                this.clearSearch();
            }
        });
    }

    isHomeTabActive() {
        return document.getElementById('home-tab')?.classList.contains('active');
    }

    handleSearch(e) {
        const query = e.target.value.trim();
        if (query.length === 0) {
            this.restoreOriginalContents();
            this.hideSuggestions();
            return;
        }

        const allItems = this.getAllItems();
        const matched = allItems.filter(item =>
            item.name && item.name.toLowerCase().includes(query.toLowerCase())
        );

        if (matched.length === 1) {
            this.displaySingleResult(matched[0]);
            this.hideSuggestions();
        } else if (matched.length > 1) {
            this.showSuggestions(query);
        } else {
            this.showNoResultsAllSections();
            this.hideSuggestions();
        }
    }

    displaySingleResult(item) {
        this.clearAllSections();
        console.log('🔍 عرض نتيجة واحدة:', item, ' في:', this.appManager.getActiveTabId());
        const container = document.getElementById(`${this.appManager.getActiveTabId()}-tab-container`);
        if (!container) return;
        // إنشاء شبكة لعرض النتيجة
        const grid = document.createElement('div');
        grid.className = 'grid-layout';

        const card = document.createElement('div');
        card.className = 'card-result';
        card.innerHTML = `
            <img class="icon" src="/assets/images/loading.gif" alt="${item.name}">
            <div class="title">${item.name}</div>
        `;
        card.addEventListener('click', () => this.handleCardClick(item, item.category));
        grid.appendChild(card);

        container.appendChild(grid);
        this.loadCardIcon(card, item, item.category);
        this.addBackButton();
    }

    clearAllSections() {
        const sections = ['home', 'apps', 'games', 'cryptos', 'balances'];
        sections.forEach(section => {
            const container = document.getElementById(`${section}-tab-container`);
            if (container) container.innerHTML = '';
        });
        this.appManager.hideBackBtn();
    }

    addBackButton() {
        if (this.backButton) return;

        this.backButton = document.createElement('button');
        this.backButton.textContent = 'عودة';
        this.backButton.className = 'back-button';
        this.backButton.onclick = () => {
            this.searchInput.value = '';
            this.restoreOriginalContents();
            this.hideSuggestions();
        };

        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.appendChild(this.backButton);
        }
    }

    removeBackButton() {
        if (this.backButton && this.backButton.parentNode) {
            this.backButton.parentNode.removeChild(this.backButton);
            this.backButton = null;
        }
    }

    handleCardClick(item, sectionType) {
        const dialogPurchase = new DialogPurchase(item, {
            iconsBasePath: '/assets/images/',
            cssPath: '/assets/css/purchase-dialog.css',
            supportPhone: SUPPORT_PHONE
        });
        dialogPurchase.open();
    }

    showSuggestions(query = '') {
        if (!query) {
            this.showPopularSuggestions();
            return;
        }

        if (typeof query !== 'string') {
            query = String(query || '').trim();
        }

        const allItems = this.getAllItems();
        const suggestions = allItems
            .filter(item => item.name && item.name.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 5);

        if (suggestions.length > 0) {
            this.suggestionsContainer.innerHTML = '';

            suggestions.forEach(item => {
                const suggestionItem = this.createSuggestionElement(item);
                this.suggestionsContainer.appendChild(suggestionItem);
            });

            this.suggestionsContainer.style.display = 'block';
        } else {
            this.hideSuggestions();
        }
    }

    showPopularSuggestions() {
        const popularItems = this.getPopularItems().slice(0, 5);
        this.suggestionsContainer.innerHTML = '';

        popularItems.forEach(item => {
            const suggestionItem = this.createSuggestionElement(item);
            this.suggestionsContainer.appendChild(suggestionItem);
        });

        this.suggestionsContainer.style.display = 'block';
    }

    createSuggestionElement(item) {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'search-suggestion-item';

        const img = document.createElement('img');
        img.src = '/assets/images/loading.gif';
        img.alt = item.name;

        const realSrc = `/icons/${item.category}/${item.icon}`;
        const tempImage = new Image();
        tempImage.src = realSrc;

        tempImage.onload = () => {
            img.src = realSrc;
        };

        tempImage.onerror = () => {
            img.src = `/icons/${item.category}/default.png`;
        };

        const span = document.createElement('span');
        span.textContent = item.name;

        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.appendChild(img);
        card.appendChild(span);

        suggestionItem.appendChild(card);

        suggestionItem.addEventListener('click', () => {
            this.searchInput.value = item.name;
            this.displaySingleResult(item);
            this.hideSuggestions();
        });

        return suggestionItem;
    }

    getAllItems() {
        return [
            ...(this.appManager.appsData || []),
            ...(this.appManager.gamesData || []),
            ...(this.appManager.cryptosData || []),
            ...(this.appManager.balancesData || [])
        ];
    }

    /**
     * جلب عناصر عشوائية لعرضها كمقترحات شائعة
     * @returns {Array} - مصفوفة من العناصر العشوائية
     */
    getPopularItems() {
        const allItems = this.getAllItems();
        return allItems.sort(() => Math.random() - 0.5);
    }

    /**
     * تحميل أيقونة البطاقة باستخدام محمل الأيقونات المناسب لكل قسم
     * 
     * @param {HTMLElement} cardElement - عنصر البطاقة
     * @param {Object} item - بيانات العنصر
     * @param {String} sectionType - نوع القسم (apps, games, cryptos, balances)
     */
    loadCardIcon(cardElement, item, sectionType) {
        const img = cardElement.querySelector('.icon');
        const iconName = item.icon || 'default.png';

        let iconLoader;
        switch (sectionType) {
            case 'apps': iconLoader = this.appManager.appsIconLoader; break;
            case 'games': iconLoader = this.appManager.gamesIconLoader; break;
            case 'cryptos': iconLoader = this.appManager.cryptosIconLoader; break;
            case 'balances': iconLoader = this.appManager.balancesIconLoader; break;
        }

        if (iconLoader) {
            iconLoader.render(iconName, img, '!').catch(() => {
                img.src = `/icons/${sectionType}/default.png`;
            });
        }
    }

    hideSuggestions() {
        this.suggestionsContainer.classList.add('fade-out');
        setTimeout(() => {
            this.suggestionsContainer.style.display = 'none';
            this.suggestionsContainer.classList.remove('fade-out');
        }, 200);
    }

    clearSearch() {
        this.searchInput.value = '';
        this.restoreOriginalContents();
        this.hideSuggestions();
    }

    showNoResultsAllSections() {
        const sections = ['home', 'apps', 'games', 'cryptos', 'balances'];
        sections.forEach(section => {
            const container = document.getElementById(`${section}-tab-container`);
            if (container) {
                container.innerHTML = `<div class="no-results-message">🚫 لا توجد نتائج مطابقة لبحثك</div>`;
            }
        });
        this.addBackButton();
    }
}
