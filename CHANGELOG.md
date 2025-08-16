# 📦 CHANGELOG.md

## [صيانة عاجلة] - 2025-08-16

### 🔐 تحسينات الأمان
- ✅ حماية مسار `/icons/:id/retry` باستخدام `verifyToken` و `checkAdmin` في `routes/icons.js`
- ✅ تفعيل حماية CSRF في مسار تعديل الرصيد عبر `doubleCsrfProtection` في `routes/admin.js`
- ✅ تفعيل التحقق من مدخلات تسجيل الدخول باستخدام `validateLogin` و `handleValidationErrors` في `routes/auth.js`

### 🧹 تنظيف المشروع
- 🗑️ حذف ملف `test.js` الذي يحتوي بيانات اتصال مباشرة
- 📁 نقل السكريبتات غير النشطة (`updateUsers.js`, `seed.js`, `addProduct.js`) إلى `scripts/archive/`
- 🔄 توحيد الاتصال بقاعدة البيانات عبر `db.js` فقط

### 💡 تحسين تجربة المستخدم
- 💾 حفظ التبويب النشط في `localStorage` داخل `homepage.js` لتذكر آخر تبويب مفتوح
- 🔍 إضافة دعم البحث في `homeTab.js` لتمكين تصفية البطاقات حسب العنوان
- 🖼️ تفعيل fallback ذكي للأيقونات في `iconmanager.js` عند فشل التحميل

### 🚀 تحسين الأداء
- 📦 تفعيل الكاش الذكي للطلبات في `apiService.js` و `sw.js`
- 🎨 دمج وتنظيف ملفات CSS (`card-grid.css` و `homepage.css`) لتقليل الحجم وتحسين التحميل

---

## 📌 ملاحظات إضافية
- جميع التعديلات تمت وفقًا لسياسات الأمان الحديثة (CSP)
- تم توثيق كل تعديل داخل الكود بتعليقات واضحة
- التعديلات قابلة للتتبع عبر Git باستخدام commit messages مثل:  
  `feat: protect icon retry route with auth middleware`  
  `refactor: unify MongoDB connection via db.js`

---

## 🧪 الخطوة التالية
- اختبار شامل لكل المسارات بعد التعديلات
- تحديث التوثيق الداخلي للمشروع (`README.md` وملفات التكوين)
- تجهيز خطة تحسين لاحقة تشمل دعم الترجمة وتوسيع لوحة التحكم