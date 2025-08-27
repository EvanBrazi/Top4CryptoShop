(function injectGlobalLoader() {
  /**
   * ✅ إنشاء عنصر التحميل وإدراجه في بداية <body>
   * يحتوي على صورة GIF يتم عرضها أثناء التحميل
   */
  const loaderHTML = `
    <div id="global-loader">
      <img src="/assets/images/loading.gif" alt="جاري التحميل..." id="global-loader-img" />
    </div>
  `;
  document.body.insertAdjacentHTML('afterbegin', loaderHTML);

  /**
   * 🎨 إنشاء ستايل مخصص لمؤشر التحميل
   * يتم حقنه مباشرة داخل <head> لتجنب الحاجة إلى ملف CSS خارجي
   */
  const style = document.createElement('style');
  style.textContent = `
    /* ✅ الحاوية الأساسية لمؤشر التحميل */
    #global-loader {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background-color: rgba(255, 255, 255, 0.95); /* خلفية شبه شفافة */
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2; /* فوق كل العناصر */
      transition: opacity 0.3s ease;
    }

    /* 🖼️ صورة التحميل (GIF) مع تكبير بسيط وظل ناعم */
    #global-loader img {
      width: 120px; /* حجم أكبر من الافتراضي */
      height: auto;
      transform: scale(1.1); /* تكبير بنسبة 10% */
      filter: drop-shadow(0 0 5px rgba(0, 0, 0, 0.2)); /* ظل خفيف */
      transition: transform 0.3s ease;
    }
  `;
  document.head.appendChild(style);

  /**
   * 🕓 إخفاء مؤشر التحميل تلقائيًا بعد تحميل الصفحة بالكامل
   * يضمن عدم بقاء المؤشر ظاهرًا بعد انتهاء التحميل
   */
  window.addEventListener('load', () => {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
  });

  /**
   * 🧩 دوال تحكم عامة يمكن استخدامها في أي مكان في المشروع
   * showLoader(): لعرض المؤشر يدويًا
   * hideLoader(): لإخفائه يدويًا
   */
  window.showLoader = () => {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'flex';
  };

  window.hideLoader = () => {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
  };
})();
