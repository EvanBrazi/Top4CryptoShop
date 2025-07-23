// تأكد من تحميل DOM بالكامل
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard loaded');
    
    // تحقق من وجود token وإرسال الإحصاءات
    if (localStorage.getItem('authToken')) {
        try {
            fetch('/api/analytics', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                    'Content-Type': 'application/json'
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .catch(error => {
                console.error('Error sending analytics:', error);
            });
        } catch (error) {
            console.error('Analytics error:', error);
        }
    }

    // تهيئة عناصر الواجهة
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const aboutBtn = document.getElementById('aboutBtn');
    const contactBtn = document.getElementById('contactBtn');
    const closeAboutBtn = document.getElementById('closeAboutBtn');
    const closeContactBtn = document.getElementById('closeContactBtn');
    const aboutDialog = document.getElementById('aboutDialog');
    const contactDialog = document.getElementById('contactDialog');
    const themeBtn = document.getElementById('themeBtn');

    // وظائف فتح/إغلاق القائمة الجانبية
    menuBtn.addEventListener('click', () => {
        sidebar.classList.add('active');
        overlay.classList.add('active');
    });

    closeBtn.addEventListener('click', () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        aboutDialog.classList.remove('active');
        contactDialog.classList.remove('active');
    });

    // وظائف فتح/إغلاق نوافذ الحوار
    aboutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        aboutDialog.classList.add('active');
        overlay.classList.add('active');
    });

    contactBtn.addEventListener('click', (e) => {
        e.preventDefault();
        contactDialog.classList.add('active');
        overlay.classList.add('active');
    });

    closeAboutBtn.addEventListener('click', () => {
        aboutDialog.classList.remove('active');
        overlay.classList.remove('active');
    });

    closeContactBtn.addEventListener('click', () => {
        contactDialog.classList.remove('active');
        overlay.classList.remove('active');
    });

    // تبديل الثيم
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const icon = themeBtn.querySelector('i');
        if (document.body.classList.contains('dark-theme')) {
            icon.classList.replace('fa-moon', 'fa-sun');
            themeBtn.setAttribute('aria-label', 'تبديل إلى الثيم الفاتح');
        } else {
            icon.classList.replace('fa-sun', 'fa-moon');
            themeBtn.setAttribute('aria-label', 'تبديل إلى الثيم الداكن');
        }
    });
});
