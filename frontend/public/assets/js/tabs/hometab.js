/**
 * Class representing a Home Tab with interactive cards grid
 * @class
 */
class HomeTab {
  /**
   * Create a HomeTab instance
   * @constructor
   * @param {Object} config - Configuration object
   * @param {Object} config.taber - The Taber instance for tab management
   * @param {string} config.containerId - The ID of the container element
   * @param {Function} config.whichCardClick - Callback when card is clicked
   * @param {Object} [config.options={}] - Additional options
   * @param {Array} [config.options.cardsData] - Array of card data objects
   * @param {string} [config.options.CSSLink="card-grid.css"] - Path to CSS file
   * @param {boolean} [config.options.useCookies=false] - Whether to use cookies
   * @throws {Error} If container element is not found or taber instance is missing
   */
  constructor({ taber, containerId, whichCardClick, options = {} }) {
    // Validate and set taber instance
    if (!taber) {
      throw new Error('Taber instance is required');
    }
    this.taber = taber;

    // Get container element
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container element with ID "${containerId}" not found`);
    }

    if (typeof whichCardClick === 'function') this.whichCardClick = whichCardClick;
    //Get card listener
    //if (typeof _whichCardClickedListener === 'function') this._whichCardClickedListener = _whichCardClickedListener;
    // Set options with defaults
    this.options = {
      cardsData: options.cardsData || this._defaultCards(),
      CSSLink: options.CSSLink || "card-grid.css",
      useCookies: options.useCookies || false,
      enableAnimations: options.enableAnimations !== false, // true by default
      apiEndpoint: options.apiEndpoint || null,
      logoBasePath: options.logoBasePath || '/assets/images/',
      iconBasePath: options.iconBasePath || '/icons/apps/'
    };
    // Initialize
    this._initializeComponent();
  }

  /**
   * Initialize the component
   * @private
   */
  _initializeComponent() {
    this.loadCSS()
      .then(() => this._loadCardsDataFromAPI())
      .catch(error => {
        console.warn('Initialization warning:', error);
        // يمكنك إضافة رسالة للمستخدم هنا إذا أردت
      })
      .finally(() => {
        this.render();
        this.setupEventListeners();
      });
  }

  /**
   * يبني المسار الكامل للصور بناءً على قاعدة المجلد
   * @private
   */
  _resolveAsset(src, basePath) {
    if (!src) return null;
    const isAbsolute = /^(https?:)?\/\//i.test(src) || src.startsWith('/') || src.startsWith('data:') || src.startsWith('./') || src.startsWith('../');
    if (isAbsolute) return src;
    const base = basePath?.endsWith('/') ? basePath : `${basePath}/`;
    return `${base}${src}`;
  }



  /**
   * Load required CSS file
   * @private
   * @returns {Promise} Promise that resolves when CSS is loaded
   */
  loadCSS() {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`link[href*="${this.options.CSSLink}"]`)) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = this.options.CSSLink;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`Failed to load CSS: ${this.options.CSSLink}`));
      document.head.appendChild(link);
    });
  }

  /**
   * Load cards data from API endpoint
   * @private
   * @returns {Promise} Promise that resolves when data is loaded
   */
  _loadCardsDataFromAPI() {
    if (!this.options.apiEndpoint) return Promise.resolve();

    return fetch(this.options.apiEndpoint)
      .then(response => {
        if (!response.ok) throw new Error(`API not ok: ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data)) {
          console.warn('API لم يرجع مصفوفة، سيتم تجاهله');
          return;
        }
        this.options.cardsData = data.map(item => {
          const whichTab = item.whichTab ?? item.whitchTab;
          const icon = this._resolveAsset(item.icon, this.options.iconBasePath);
          const logo = this._resolveAsset(item.logo, this.options.logoBasePath);
          return { ...item, whichTab, icon, logo };
        });
      })
      .catch(error => {
        console.warn('تعذر تحميل بيانات البطاقات من API:', error);
      });
  }


  /**
   * Show error state in the UI
   * @private
   */
  _showErrorState() {
    this.container.innerHTML = `
      <div class="cards-error-state">
        <i class="error-icon">⚠️</i>
        <p>حدث خطأ في تحميل البطاقات. يرجى المحاولة لاحقاً.</p>
        <button class="retry-button">إعادة المحاولة</button>
      </div>
    `;

    this.container.querySelector('.retry-button').addEventListener('click', () => {
      this._initializeComponent();
    });
  }

  /**
   * Render cards grid
   * @public
   */
  render() {
    // Clear previous content
    this.container.innerHTML = '';

    // Create document fragment for better performance
    const fragment = document.createDocumentFragment();
    const gridContainer = document.createElement('div');
    gridContainer.className = 'card-grid-container';

    // Create and append cards
    this.options.cardsData.forEach((card, index) => {
      const cardElement = this._createCardElement(card, index);
      gridContainer.appendChild(cardElement);
    });

    fragment.appendChild(gridContainer);
    this.container.appendChild(fragment);
    this._adjustCardsToScreenSize();
  }

  /**
   * Create individual card element with all enhancements
   * @private
   * @param {Object} card - Card data
   * @param {number} index - Card index
   * @returns {HTMLElement} The created card element
   */
  _createCardElement(card, index) {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';
    cardElement.dataset.index = index;
    cardElement.setAttribute('role', 'button');
    cardElement.setAttribute('aria-label', card.title || 'Card');
    cardElement.setAttribute('tabindex', '0');

    // Add color splash effect
    const colorSplash = document.createElement('div');
    colorSplash.className = 'color-splash';
    cardElement.appendChild(colorSplash);

    // Add main icon if available
    if (card.icon) {
      const icon = document.createElement('img');
      icon.className = 'card-icon';
      icon.src = this._resolveAsset(card.icon, this.options.iconBasePath);
      icon.alt = card.title || 'Card Icon';
      icon.loading = 'lazy';
      cardElement.appendChild(icon);
    }

    // Add logo if available
    if (card.logo) {
      const logo = document.createElement('img');
      logo.className = 'card-logo';
      logo.src = this._resolveAsset(card.logo, this.options.logoBasePath);
      logo.alt = 'Site Logo';
      logo.loading = 'lazy';
      cardElement.appendChild(logo);
    }

    // Add title container
    const titleContainer = document.createElement('div');
    titleContainer.className = 'card-title-container';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = card.title || 'Card Title';
    titleContainer.appendChild(title);

    cardElement.appendChild(titleContainer);

    // Add barcode
    const barcode = document.createElement('div');
    barcode.className = 'card-barcode';
    barcode.textContent = '✻✻✻';
    //cardElement.appendChild(barcode);

    // Add hover animations if enabled
    if (this.options.enableAnimations) {
      cardElement.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
      cardElement.addEventListener('mouseenter', () => {
        cardElement.style.transform = 'translateY(-5px) scale(1.02)';
        cardElement.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)';
      });
      cardElement.addEventListener('mouseleave', () => {
        cardElement.style.transform = '';
        cardElement.style.boxShadow = '';
      });
    }

    // Keyboard accessibility
    cardElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._handleCardClick(index, card);
      }
    });

    return cardElement;
  }

  /**
   * Handle card click event
   * @private
   * @param {number} index - Card index
   * @param {Object} card - Card data
   */
  _handleCardClick(index, card) {
    if (this.taber) this.taber.activateTab(card.whichTab);
    // Trigger card click callback if exists
    this.whichCardClick(index, card);
  }

  /**
 * ضبط أحجام البطاقات بناءً على حجم الشاشة
 */
  _adjustCardsToScreenSize() {
    const cardWidth = window.innerWidth * 0.4;
    const cardHeight = window.innerHeight * 0.3;

    this.container.querySelectorAll('.card').forEach(card => {
      card.style.width = `${cardWidth}px`;
      card.style.height = `${cardHeight}px`;
    });
  }


  /**
   * Set up event listeners for cards
   * @private
   */
  setupEventListeners() {
    this.container.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        const index = e.currentTarget.dataset.index;
        const cardData = this.options.cardsData[index];
        this._handleCardClick(index, cardData);
      });
    });
  }

  /**
   * Set callback for card click event
   * @public
   * @param {Function} callback - Callback function
   */
  whichCardClick(callback) {
    if (typeof callback === 'function') {
      this.whichCardClick = callback;
    }
  }

  /**
   * Update cards data and re-render
   * @public
   * @param {Array} newCardsData - New cards data array
   */
  updateCards(newCardsData) {
    if (!Array.isArray(newCardsData)) {
      console.error('Invalid cards data provided');
      return;
    }

    this.options.cardsData = newCardsData;
    this.render();
  }

  /**
   * Get default cards data
   * @private
   * @returns {Array} Default cards data
   */
  _defaultCards() {
    return [
      {
        /** @private {index[0]} Just select which tab for activate*/whichTab: "apps",
        title: "التطبيقات",
        icon: "./assets/images/favicon.ico",
        logo: "./assets/images/logo.png"
      },
      {
        whichTab: "smallCards",
        title: "الألعاب",
        icon: "./assets/images/logo.png",
        logo: "./assets/images/favicon.ico"
      },
      {
        whichTab: "smallCards",
        title: "العملات الرقمية",
        icon: "./assets/images/logo.png",
        logo: "./assets/images/favicon.ico"
      },
      {
        whichTab: "smallCards",
        title: "تعبئة رصيد",
        icon: "./assets/images/logo.png",
        logo: "./assets/images/favicon.ico"
      }
    ];
  }
}

export { HomeTab };
