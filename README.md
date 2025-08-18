# 🪙 Top4CryptoShop

تطبيق متجر العملات الرقمية مبني باستخدام Node.js وExpress وMongoDB، يوفر تجربة مستخدم تفاعلية وآمنة لإدارة المحافظ والمدفوعات.

---

## 🚀 الميزات

- تسجيل وتسجيل دخول المستخدمين مع تشفير آمن
- إدارة الجلسات باستخدام MongoDB
- حماية من هجمات Brute Force عبر Rate Limiting
- تصميم متجاوب مع تأثيرات ثلاثية الأبعاد
- دعم الوضع الداكن والفاتح
- واجهة شبكية ببطاقات ثلاثية الأبعاد
- إدارة الرصيد والمحفظة والمدفوعات
- تعليق الحساب تلقائيًا بعد محاولات دخول خاطئة
- حماية CSRF لجميع النماذج
- التحقق من حالة الجلسة عبر API

---

## 🧰 المتطلبات

- Node.js (الإصدار 14 أو أعلى)
- MongoDB (محلي أو سحابي)
- npm أو yarn

---

## ⚙️ التثبيت

1. استنساخ المستودع:
```bash
git clone <repository-url>
cd Top4CryptoShop
تثبيت تبعيات الخادم:

bash
cd backend
npm install
تثبيت تبعيات الواجهة الأمامية (إن وجدت):

bash
cd ../frontend
npm install
إنشاء ملف .env داخل مجلد backend:

env
NODE_ENV=development
PORT=10000
MONGODB_URI=mongodb://127.0.0.1:27017/Top4CryptoShop
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret
CSRF_SECRET=your-csrf-secret
▶️ تشغيل التطبيق
وضع التطوير
bash
npm run dev
وضع الإنتاج
bash
npm start
🗂️ هيكل المشروع
كتابة تعليمات برمجية
Top4CryptoShop/
├── backend/
│   ├── controllers/         # دوال التحكم مثل registerUser
│   ├── middlewares/         # حماية CSRF، التحقق من الجلسة، التحقق من الدور
│   ├── models/              # نماذج Mongoose مثل User وRevokedToken
│   ├── routes/              # مسارات المصادقة
│   ├── .env                 # متغيرات البيئة
│   ├── server.js            # نقطة تشغيل التطبيق
│   └── package.json
├── frontend/
│   ├── public/
│   │   ├── assets/          # صور وأيقونات
│   │   ├── index.html       # الصفحة الرئيسية
│   │   └── ...
│   └── ...
├── README.md
└── package.json
🔐 توثيق المصادقة
طرق تسجيل الدخول
تقليدي: اسم مستخدم + كلمة مرور

Google: زر "تسجيل الدخول عبر Google"

Apple: زر "تسجيل الدخول عبر Apple"

طرق التسجيل
تقليدي: تعبئة النموذج

Google: زر "التسجيل عبر Google"

Apple: زر "التسجيل عبر Apple"

عملية تسجيل الخروج
إلغاء التوكن وإضافته إلى القائمة السوداء

حذف الكوكيز من المتصفح

إنهاء الجلسة بأمان

🔌 نقاط نهاية الـ API
المسار	الوصف
POST /api/auth/register	تسجيل مستخدم جديد
POST /api/auth/login	تسجيل الدخول
POST /api/auth/logout	تسجيل الخروج
GET /api/auth/check-session	التحقق من حالة الجلسة
POST /api/admin/update-status	تحديث حالة الحساب (إدمن فقط)
🛡️ ميزات الأمان
تشفير كلمات المرور باستخدام bcrypt

إنشاء توكنات JWT مع توقيع آمن

حماية CSRF لجميع الطلبات

تحديد عدد المحاولات لتسجيل الدخول

إدارة الجلسات باستخدام MongoDB

إعدادات كوكيز آمنة (httpOnly, sameSite, secure)

تعليق الحساب تلقائيًا بعد 5 محاولات خاطئة

🤝 المساهمة
اعمل Fork للمستودع

أنشئ فرعًا جديدًا

نفّذ التعديلات

ادفع التغييرات إلى الفرع

أنشئ Pull Request

📄 الرخصة
هذا المشروع مرخص تحت رخصة MIT.