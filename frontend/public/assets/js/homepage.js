document.addEventListener('DOMContentLoaded', function() {
    // العناصر الأساسية
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.querySelector('.toggle-sidebar');
    const overlay = document.querySelector('.overlay');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const body = document.body;
    const backBtn = document.getElementById('back-btn');
    const currentPageIndicator = document.getElementById('current-page-indicator');
    
    // عناصر البروفايل
    const profileImg = document.getElementById('profile-img');
    const usernameDisplay = document.getElementById('username-display');
    const balanceDisplay = document.getElementById('balance-display');
    const topBalanceDisplay = document.getElementById('top-balance-display');
    
    // أزرار الاختبار
    const testUser1Btn = document.getElementById('test-user1-btn');
    const testUser2Btn = document.getElementById('test-user2-btn');
    
    // عناصر الفوتر والنوافذ المنبثقة
    const termsBtn = document.getElementById('terms-btn');
    const privacyBtn = document.getElementById('privacy-btn');
    const termsModal = document.getElementById('terms-modal');
    const privacyModal = document.getElementById('privacy-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');
    
    // بيانات المستخدم الافتراضية
    let currentUser = {
        name: 'زائر',
        email: null,
        balance: 0.00,
        theme: 0,
        isHomePage: true
    };
    
    // ------ وظائف التحكم الأساسية ------
    
    // فتح/إغلاق الدرج
    toggleBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', toggleSidebar);
    
    function toggleSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
    
    // تبديل الثيم
    themeToggleBtn.addEventListener('click', toggleTheme);
    
    function toggleTheme() {
        body.classList.toggle('day-theme');
        body.classList.toggle('night-theme');
        currentUser.theme = body.classList.contains('night-theme') ? 1 : 0;
        updateThemeButton();
        localStorage.setItem('theme', currentUser.theme === 1 ? 'night' : 'day');
    }
    
    function updateThemeButton() {
        if (currentUser.theme === 1) {
            themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i> تبديل الثيم';
        } else {
            themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i> تبديل الثيم';
        }
    }
    
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'night') {
            body.classList.add('night-theme');
            body.classList.remove('day-theme');
            currentUser.theme = 1;
        } else {
            body.classList.add('day-theme');
            body.classList.remove('night-theme');
            currentUser.theme = 0;
        }
        updateThemeButton();
    }
    
    // تحديث زر الرجوع
    function updateBackButton() {
        if (currentUser.isHomePage) {
            backBtn.classList.remove('visible');
            currentPageIndicator.textContent = 'الصفحة الرئيسية';
        } else {
            backBtn.classList.add('visible');
            currentPageIndicator.textContent = 'صفحة أخرى';
        }
    }
    
    // ------ إدارة بيانات المستخدم ------
    
    // اختبار المستخدم 1 (وضع ليلي)
    testUser1Btn.addEventListener('click', function() {
        loadUser({
            name: 'أحمد محمد',
            email: 'ahmed.mohamed@example.com',
            balance: 1250.50,
            theme: 1,
            isHomePage: false
        });
    });
    
    // اختبار المستخدم 2 (وضع نهاري)
    testUser2Btn.addEventListener('click', function() {
        loadUser({
            name: 'نورا أحمد',
            email: 'nora.ahmed@test.com',
            balance: 850.75,
            theme: 0,
            isHomePage: true
        });
    });
    
    function loadUser(userData) {
        currentUser = userData;
        updateUserProfile();
        
        // تطبيق الثيم
        if (userData.theme === 1) {
            body.classList.add('night-theme');
            body.classList.remove('day-theme');
        } else {
            body.classList.add('day-theme');
            body.classList.remove('night-theme');
        }
        
        updateThemeButton();
        updateBackButton();
    }
    
    function updateUserProfile() {
        // تحديث الاسم والرصيد
        usernameDisplay.textContent = currentUser.name;
        balanceDisplay.textContent = currentUser.balance.toFixed(2);
        topBalanceDisplay.textContent = currentUser.balance.toFixed(2);
        
        // إعداد معالج الخطأ للصورة
        profileImg.onerror = function() {
            this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDExQzE0LjIwOTEgMTEgMTYgOS4yMDkxIDE2IDdDMTYgNC43OTA4NiAxNC4yMDkxIDMgMTIgM0M5Ljc5MDg2IDMgOCA0Ljc5MDg2IDggN0M4IDkuMjA5MTQgOS43OTA4NiAxMSAxMiAxMVoiIGZpbGw9IiNjY2MiLz4KPHBhdGggZD0iTTEyIDIxQzE2Ljk3MDYgMjEgMjEgMTYuOTcwNiAyMSAxMkMyMSA3LjAyOTQ0IDE2Ljk3MDYgMyAxMiAzQzcuMDI5NDQgMyAzIDcuMDI5NDQgMyAxMkMzIDE2Ljk3MDYgNy4wMjk0NCAyMSAxMiAyMVoiIHN0cm9rZT0iI2NjYyIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjwvc3ZnPg==';
            this.onerror = null;
        };
        
        // تحديث صورة البروفايل
        if (currentUser.email) {
            const emailHash = md5(currentUser.email.trim().toLowerCase());
            profileImg.src = `https://www.gravatar.com/avatar/${emailHash}?d=404&s=160`;
        } else {
            profileImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=random`;
        }
    }
    
    // ------ نظام التبويبات الجديد ------
    
    const tabPanes = document.querySelectorAll('.tab-pane');
    const sidebarLinks = document.querySelectorAll('.sidebar-menu a');
    
    // وظيفة تبديل التبويب
    function switchTab(tabId) {
        // إخفاء كل التبويبات
        tabPanes.forEach(pane => {
            pane.classList.remove('active');
        });
        
        // إظهار التبويب المحدد
        const activePane = document.getElementById(`${tabId}-tab`);
        if (activePane) {
            activePane.classList.add('active');
        }
        
        // تحديث مؤشر الصفحة الحالية
        const activeLink = document.querySelector(`.sidebar-menu a[data-tab="${tabId}"]`);
        if (activeLink) {
            currentPageIndicator.textContent = activeLink.textContent.trim();
        }
        
        // تحديث حالة الصفحة الرئيسية
        currentUser.isHomePage = tabId === 'home';
        updateBackButton();
    }
    
    // إضافة أحداث النقر لروابط القائمة الجانبية
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.dataset.tab;
            if (tabId) {
                switchTab(tabId);
                
                // إغلاق الدرج الجانبي على الأجهزة الصغيرة
                if (window.innerWidth < 992) {
                    sidebar.classList.remove('active');
                    overlay.classList.remove('active');
                }
            }
        });
    });
    
    // ------ إدارة الفوتر والنوافذ المنبثقة ------
    
    termsBtn.addEventListener('click', function() {
        termsModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    });
    
    privacyBtn.addEventListener('click', function() {
        privacyModal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    });
    
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            termsModal.style.display = 'none';
            privacyModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });
    });
    
    window.addEventListener('click', function(event) {
        if (event.target === termsModal) {
            termsModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        if (event.target === privacyModal) {
            privacyModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    });
    
    // ------ الأحداث الإضافية ------
    backBtn.addEventListener('click', function(e) {
        e.preventDefault();
        currentUser.isHomePage = true;
        updateBackButton();
        switchTab('home');
    });
    
    
    // التحكم في ظهور/اختفاء الفوتر عند التمرير
    let lastScrollPosition = 0;
    const footer = document.querySelector('.site-footer');
    
    window.addEventListener('scroll', function() {
        const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        
        if (currentScrollPosition > lastScrollPosition) {
        // التمرير لأسفل - إخفاء الفوتر
            footer.classList.add('hidden');
        } else {
        // التمرير لأعلى - إظهار الفوتر
            footer.classList.remove('hidden');
        }
    
    // إذا كان المستخدم في أعلى الصفحة، تأكد من إظهار الفوتر
    
        if (currentScrollPosition <= 0) {
            footer.classList.remove('hidden');
        }
        
        lastScrollPosition = currentScrollPosition;
    });
    
    // التهيئة الأولية
    initTheme();
    updateUserProfile();
    updateBackButton();
    switchTab('home');
    
    console.log('تم تحميل النظام بنجاح وجاهز للاختبار');
});