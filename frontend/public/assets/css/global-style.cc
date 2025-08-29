/* ======== متغيرات النظام ======== */
:root {
  /* أحجام الخطوط */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;

  /* مسافات */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;

  /* أنصاف أقطار */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
  --radius-full: 9999px;
  --border-radius: 12px;

  /* ظلال */
  --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* ثوابت التنسيق */
  --topbar-height: 50px;
  --sidebar-width: 220px;
  --sidebar-header-height: 120px;

  /* ألوان الثيم النهاري */
  --day-bg: #f5f5f5;
  --day-text: #333;
  --day-primary: #d4a76a;
  --day-primary-hover: #c29555;
  --day-secondary: #e8d5b5;
  --day-card: #fff9f0;
  --day-border: #d8c8a8;
  --day-navbar: #5d4a36;
  --day-sidebar: #f1e8de;
  --day-shadow: rgba(93, 74, 54, 0.15);
  --day-accent: #e6b422;
  --day-footer: #8B4513;
  --day-navbar-text: #f5f5f5;
  --day-sidebar-header: #d4a76a;
  --day-sidebar-footer: #8B4513;
  --day-sidebar-content: #f8f8f8;
  --day-border-menu-link: 1px solid rgba(0, 0, 0, 0.1);
  --day-background-menu-l: rgba(255, 255, 255, 0.7);
  --day-border-left: 1px solid rgba(0, 0, 0, 0.1);

  /* ألوان الثيم الليلي */
  --night-bg: #1a1a2e;
  --night-text: #f0f0f0;
  --night-primary: #4a90e2;
  --night-primary-hover: #3a7bc8;
  --night-secondary: #5c6bc0;
  --night-card: #1e1e2a;
  --night-border: #333344;
  --night-navbar: #12121a;
  --night-sidebar: #1a1a22;
  --night-shadow: rgba(0, 0, 0, 0.4);
  --night-accent: #8a7cff;
  --night-footer: #0f3460;
  --night-navbar-text: #e0e0e0;
  --night-sidebar-header: #4a90e2;
  --night-sidebar-footer: #0f3460;
  --night-sidebar-content: #1e2a4a;
  --night-border-menu-link: 1px solid rgba(255, 255, 255, 0.1);
  --night-background-menu-l: rgba(0, 0, 0, 0.2);
  --night-border-left: 1px solid rgba(255, 255, 255, 0.1);

  /* قيم افتراضية (نهاري) */
  --bg-color: var(--day-bg);
  --text-color: var(--day-text);
  --primary-color: var(--day-primary);
  --primary-hover: var(--day-primary-hover);
  --secondary-color: var(--day-secondary);
  --card-color: var(--day-card);
  --border-color: var(--day-border);
  --navbar-color: var(--day-navbar);
  --sidebar-color: var(--day-sidebar);
  --sidebar-header-color: var(--day-sidebar-header);
  --sidebar-content-color: var(--day-sidebar-content);
  --sidebar-footer-color: var(--day-sidebar-footer);
  --shadow-color: var(--day-shadow);
  --accent-color: var(--day-accent);
  --bar-footer-color: var(--day-footer);
  --navbar-text: var(--day-navbar-text);
  --divider-color: rgba(0, 0, 0, 0.1);
  --social-icon-color: white;
  --border-menu-link: var(--day-border-menu-link);
  --background-menu-link: var(--day-background-menu-l);
  --sidebar-border-left: var(--day-border-left);
}

/* ======== ثيم الليل ======== */
.night-theme {
  --bg-color: var(--night-bg);
  --text-color: var(--night-text);
  --primary-color: var(--night-primary);
  --primary-hover: var(--night-primary-hover);
  --secondary-color: var(--night-secondary);
  --card-color: var(--night-card);
  --border-color: var(--night-border);
  --navbar-color: var(--night-navbar);
  --sidebar-color: var(--night-sidebar);
  --sidebar-header-color: var(--night-sidebar-header);
  --sidebar-content-color: var(--night-sidebar-content);
  --sidebar-footer-color: var(--night-sidebar-footer);
  --shadow-color: var(--night-shadow);
  --accent-color: var(--night-accent);
  --bar-footer-color: var(--night-footer);
  --navbar-text: var(--night-navbar-text);
  --divider-color: rgba(255, 255, 255, 0.1);
  --social-icon-color: white;
  --border-menu-link: var(--night-border-menu-link);
  --background-menu-link: var(--night-background-menu-l);
  --sidebar-border-left: var(--night-border-left);
}

/* ======== الأساسيات ======== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  transition: background-color 0.4s ease, color 0.4s ease, transform 0.3s ease, box-shadow 0.3s ease;
}

html {
  scroll-behavior: smooth;
}

body {
  font-family: 'Segoe UI', 'Arial', sans-serif;
  background-color: var(--bg-color);
  color: var(--text-color);
  margin: 0;
  padding: 0;
  direction: rtl;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* ======== الهيكل الرئيسي ======== */
header h1 {
  text-align: center;
  color: var(--primary-color);
  margin-bottom: var(--space-md);
}

.main-content {
  margin-top: var(--topbar-height);
  padding: var(--space-md);
  min-height: calc(100vh - var(--topbar-height));
  transition: all 0.3s;
  z-index: 1;
}

.content {
  padding: 0;
  max-width: 1200px;
  margin: 0 auto;
}

/* ======== البطاقات والعناصر ======== */
.card {
  background-color: var(--card-color);
  padding: var(--space-lg);
  margin-bottom: var(--space-xl);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-md);
  position: relative;
  overflow: hidden;
}

.card::after {
  content: '';
  position: absolute;
  top: -40%;
  left: -40%;
  width: 180%;
  height: 180%;
  background: radial-gradient(circle, rgba(var(--primary-color-rgb), 0.05), transparent);
  z-index: 0;
  pointer-events: none;
}

.notification-bar {
  background-color: var(--primary-color);
  color: white;
  padding: var(--space-md);
  text-align: center;
  display: none;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-lg);
}

/* ======== النماذج والإدخال ======== */
label {
  display: block;
  margin-top: var(--space-md);
  font-weight: bold;
  color: var(--text-color);
}

input, select, textarea {
  padding: var(--space-md);
  margin: var(--space-xs) 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  width: 100%;
  max-width: 300px;
  font-size: var(--text-base);
  background-color: var(--card-color);
  color: var(--text-color);
}

input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
}

/* ======== الأزرار ثلاثية الأبعاد ======== */
button, .btn {
  padding: var(--space-md) var(--space-lg);
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.2),
              inset 0 -2px 0 rgba(0, 0, 0, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transform-style: preserve-3d;
  font-size: var(--text-base);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
}

button:hover, .btn:hover {
  background-color: var(--primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.2),
              inset 0 -2px 0 rgba(0, 0, 0, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

button:active, .btn:active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
}

button::after, .btn::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0));
  pointer-events: none;
}

/* ======== الجداول ======== */
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: var(--space-md);
  background-color: var(--card-color);
  border-radius: var(--border-radius);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

th, td {
  padding: var(--space-md);
  border-bottom: 1px solid var(--border-color);
  text-align: center;
}

th {
  background-color: var(--secondary-color);
  font-weight: bold;
  color: var(--text-color);
}

/* ======== الشريط العلوي ======== */
.top-bar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  height: var(--topbar-height);
  background-color: var(--navbar-color);
  box-shadow: var(--shadow-sm);
  z-index: 1000;
  display: flex;
  align-items: center;
  color: var(--navbar-text);
}

.top-bar-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-lg);
}

.balance-container {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.balance-amount {
  font-weight: bold;
  font-size: var(--text-lg);
}

.add-balance-btn {
  background-color: var(--primary-color);
  color: white;
  border: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
}

.add-balance-btn:hover {
  background-color: var(--primary-hover);
  transform: scale(1.1);
}

.logo-back-container {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.back-btn {
  color: var(--navbar-text);
  font-size: var(--text-xl);
  display: none;
}

.back-btn.visible {
  display: block;
}

.site-logo {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 100px;
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.2),
              inset 0 -2px 0 rgba(0, 0, 0, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transform-style: preserve-3d;
}

/* ======== الشريط الجانبي ======== */
.sidebar {
  border-radius: var(--border-radius);
  width: var(--sidebar-width);
  height: 100%;
  position: fixed;
  right: calc(var(--sidebar-width) * -1);
  top: 0;
  transition: right 0.4s cubic-bezier(0.33, 1, 0.68, 1);
  border-left: var(--sidebar-border-left);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-md);
  background-color: var(--sidebar-color);
}

.sidebar.active {
  right: 0;
}

.sidebar-header {
  border-radius: var(--border-radius);
  margin-bottom: var(--space-sm);
  padding: var(--space-lg) var(--space-lg) var(--space-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  background-color: var(--sidebar-header-color);
  z-index: 0;
}

.sidebar-content {
  height: 100%;
  width: 100%;
  background: var(--sidebar-content-color);
  overflow-x: hidden;
}

.profile-header {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  height: 100%;
}

.user-avatar-container {
  margin-bottom: var(--space-sm);
}

.profile-sidebar-img {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--primary-color);
  box-shadow: var(--shadow-sm);
  transition: opacity 0.3s ease;
  background-color: var(--secondary-color);
}

.profile-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-sm);
}

.user-name {
  font-size: var(--text-lg);
  font-weight: bold;
  margin-bottom: var(--space-xs);
}

.user-balance {
  display: flex;
  align-items: center;
  font-size: var(--text-base);
  background-color: rgba(0, 0, 0, 0.2);
  padding: var(--space-xs) var(--space-md);
  border-radius: 20px;
}

.currency-icon {
  margin-right: var(--space-xs);
  font-size: var(--text-sm);
}

.profile-actions {
  display: flex;
  justify-content: space-between;
  width: 100%;
  background-color: var(--sidebar-header-color);
  position: sticky;
  top: 100%;
  bottom: 100%;
  z-index: 1;
}

.profile-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background-color: var(--primary-color);
  color: white;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
}

.profile-btn:hover {
  background-color: var(--primary-hover);
  transform: scale(1.1);
}

.header-divider {
  width: 100%;
  height: 1px;
  background-color: var(--divider-color);
  margin-bottom: var(--space-sm);
}

.menu-link {
  display: flex;
  align-items: center;
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
  color: var(--text-color);
  text-decoration: none;
  border-radius: var(--border-radius);
  transition: all 0.2s;
  border-bottom: var(--border-menu-link);
  background: var(--background-menu-link);
  gap: var(--space-md);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.2),
              inset 0 -2px 0 rgba(0, 0, 0, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transform-style: preserve-3d;
}

.menu-link:active {
  transform: translateY(4px);
  box-shadow: 0 1px rgba(0, 0, 0, 0.2);
}

.menu-link:hover {
  background: rgba(0, 0, 0, 0.05);
  transform: translateX(-5px);
}

.menu-link i {
  padding: var(--space-xs);
}

.sidebar-menu-container {
  position: fixed;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 100%;
}

.sidebar-menu {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
  height: 100%;
}

.sidebar-menu li {
  padding: 0;
  transition: all 0.2s;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar-menu li:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.sidebar-menu li a {
  color: var(--text-color);
  text-decoration: none;
  display: block;
  font-size: var(--text-base);
  font-weight: bold;
}

.sidebar-menu i {
  margin: 0 var(--space-md);
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--primary-color);
}

.sidebar-footer {
  border-radius: var(--border-radius);
  flex-shrink: 0;
  background-color: var(--sidebar-footer-color);
  border-top: 1px solid var(--divider-color);
  display: block;
  flex-direction: column;
}

.theme-container {
  margin-bottom: var(--space-sm);
  width: 100%;
  display: flex;
  justify-content: center;
}

.theme-toggle {
  background-color: var(--primary-color);
  color: white;
  border: none;
  padding: var(--space-xs) var(--space-sm);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--text-sm);
}

.theme-toggle:hover {
  background-color: var(--primary-hover);
}

.social-links {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);
  width: 100%;
  padding: 0 var(--space-md);
  flex-wrap: wrap;
}

.social-link {
  color: var(--social-icon-color);
  font-size: var(--text-sm);
  transition: all 0.3s;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--sidebar-header-color);
  gap: var(--space-md);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.2),
              inset 0 -2px 0 rgba(0, 0, 0, 0.1),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transform-style: preserve-3d;
}

.social-link:hover {
  transform: translateY(-3px);
  background-color: var(--primary-color);
  color: white;
}

/* ======== الفوتر ======== */
.site-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--bar-footer-color);
  color: var(--navbar-text);
  padding: var(--space-xs) 0;
  text-align: center;
  z-index: 100;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
  border-radius: var(--border-radius) var(--border-radius) 0 0;
}

.site-footer.hidden {
  transform: translateY(100%);
}

.footer-links {
  display: flex;
  justify-content: center;
  gap: var(--space-md);
  margin-bottom: var(--space-xs);
}

.footer-link {
  width: 150px;
  height: 40px;
  box-sizing: border-box;
  background: transparent;
  color: var(--navbar-text);
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: all 0.3s;
  padding: var(--space-md);
  border-radius: var(--radius-md);
}

.footer-link:hover {
  color: var(--accent-color);
  text-decoration: underline;
}

.footer-copyright {
  font-size: var(--text-xs);
  opacity: 0.8;
}

.copyright-icon {
  font-size: var(--text-xs);
}

/* ======== التبويبات ======== */
.tabs-container {
  margin-top: var(--space-lg);
}

.tabs-header {
  display: none !important;
}

.tabs-content {
  padding: 0;
}

.tab-pane {
  display: none;
  background-color: var(--card-color);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  margin-top: 0 auto;
  animation: fadeIn 0.3s ease;
  align-items: center;
  align-content: center;
  justify-content: center;
}

.tab-pane.active {
  display: block;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ======== النوافذ المنبثقة الشفافة ======== */
.modal {
  display: none;
  position: fixed;
  justify-content: center;
  align-items: center;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 2000;
  box-sizing: border-box;
  overflow-y: auto;
}

.modal.show {
  display: flex;
}

.modal-content {
  position: relative;
  background: rgba(255, 255, 255, 0.9);
  border-radius: var(--border-radius);
  padding: var(--space-lg);
  max-width: 90%;
  max-height: 90vh;
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.night-theme .modal-content {
  background: rgba(30, 30, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--divider-color);
}

.modal-header h2 {
  margin: 0;
  color: var(--primary-color);
  font-size: var(--text-xl);
  font-weight: bold;
}

.close-modal, .payments-close-btn {
  background: none;
  border: none;
  font-size: var(--text-2xl);
  cursor: pointer;
  color: var(--text-color);
}

.modal-body {
  line-height: 1.6;
  color: var(--text-color);
  padding: var(--space-md) 0;
  max-height: calc(90vh - 120px);
  overflow-y: auto;
}

.modal-body p {
  margin: 0;
  white-space: pre-line;
}

/* ======== شبكة البطاقات ======== */
.grid-layout {
  opacity: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(125px, 1fr));
  gap: var(--space-md);
  padding: var(--space-md);
  animation: fadeIn 0.6s ease-in;
}

.card-grid-item {
  position: relative;
  background: var(--card-color);
  border-radius: 15%;
  box-shadow: var(--shadow-md);
  cursor: pointer;
  text-align: center;
  padding: var(--space-md);
  transition: transform 0.3s ease;
  aspect-ratio: 1 / 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.card-grid-item:hover {
  transform: translateY(-5px) rotateX(2deg);
  box-shadow: var(--shadow-lg);
}

.card-icon {
  position: relative;
  width: 75%;
  height: 75%;
  margin-bottom: auto;
  border-radius: 100%;
  object-fit: cover;
  margin: 0 auto var(--space-sm);
  display: block;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  transition: transform 0.3s ease;
}

.card-grid-item:hover .card-icon {
  transform: scale(1.05);
}

.card-title {
  margin-top: auto;
  object-fit: cover;
  bottom: 0;
  width: 100%;
  height: 25%;
  padding: 1%;
  text-align: center;
  font-size: var(--text-sm);
  font-weight: bold;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  word-break: break-word;
  overflow: hidden;
  box-sizing: border-box;
}

/* ======== نماذج الدفع ======== */
.payment-form {
  background-color: var(--card-color);
  padding: var(--space-lg);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-md);
  max-width: 500px;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.payment-form label {
  font-weight: bold;
  color: var(--text-color);
  margin-bottom: var(--space-xs);
}

.payment-form select,
.payment-form input[type="number"],
.payment-form textarea,
.payment-form input[type="file"] {
  padding: var(--space-md);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  background-color: var(--bg-color);
  color: var(--text-color);
  transition: border-color 0.3s;
}

.payment-form input:focus,
.payment-form select:focus,
.payment-form textarea:focus {
  border-color: var(--primary-color);
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
}

.payment-form .preview-image {
  max-width: 100%;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  margin-top: var(--space-sm);
}

/* ======== التكيف مع الشاشات ======== */
@media (max-width: 768px) {
  input, select, button, .btn {
    width: 100%;
    max-width: 100%;
  }

  table, thead, tbody, th, td, tr {
    display: block;
    width: 100%;
  }

  th {
    background-color: transparent;
    font-weight: bold;
    text-align: right;
  }

  td {
    border: none;
    padding: var(--space-sm);
    text-align: right;
  }

  .grid-layout {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-sm);
  }

  .card-grid-item {
    max-width: 150px;
    padding: var(--space-sm);
  }

  .card-icon {
    height: 70%;
  }

  .card-title {
    font-size: var(--text-xs);
  }
}

@media (max-width: 480px) {
  .grid-layout {
    grid-template-columns: repeat(1, 1fr);
    gap: var(--space-xs);
  }

  .card-grid-item {
    max-width: 100%;
    padding: var(--space-xs);
  }

  .card-icon {
    height: 65%;
  }

  .card-title {
    font-size: var(--text-xs);
    margin-bottom: var(--space-xs);
  }

  .modal-content {
    padding: var(--space-md);
    max-width: 95%;
  }
}

/* ======== رسائل الحالة ======== */
.status-message {
  margin-top: var(--space-md);
  font-size: var(--text-sm);
  color: green;
}

.toast-message {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #323232;
  color: #fff;
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  box-shadow: var(--shadow-lg);
  z-index: 9999;
  opacity: 0;
  animation: fadeInOut 3s ease-in-out forwards;
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  10% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  90% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
}

.status.pending { color: orange; font-weight: bold; }
.status.accepted { color: green; font-weight: bold; }
.status.rejected { color: red; font-weight: bold; }

/* ======== أنيميشن التدوير ======== */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.spinner {
  display: none;
  width: 20px;
  height: 20px;
  border: 3px solid #fff;
  border-top: 3px solid #999;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
