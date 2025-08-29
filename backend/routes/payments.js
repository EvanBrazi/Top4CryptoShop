/**
 * @file payments.js
 * @module routes/payments
 * @description
 *  - إدارة عمليات الدفع: إنشاء دفعة جديدة وجلب دفعات المستخدم
 *  - يدعم رفع صورة إشعار الدفع باستخدام multer
 *  - يتحقق من صحة البيانات قبل الحفظ
 *  - يرسل إشعار لحظي إلى الأدمن عبر WebSocket
 *
 * @author Evan Brazi
 * @version 1.1.0
 * @lastModified 2025-08-28
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User'); // تأكد من وجود النموذج
const Payment = require('../models/Payment');
const { verifyToken, checkAdmin } = require('../middlewares/auth');
const { notifyAdmins, notifyUsers } = require('../utils/notifications');// ✅ دالة إرسال موجهة للأدمن فقط

// 🧠 توليد معرف فريد للدفعة
function generatePaymentId() {
  return 'pay-' + Math.random().toString(36).substr(2, 9);
}

// 📦 إعداد تخزين الصور باستخدام multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.body.userId;
    if (!userId || typeof userId !== 'string') {
      return cb(new Error('معرف المستخدم مفقود أو غير صالح'), null);
    }

    const userFolder = path.join('uploads/payments', userId);
    if (!fs.existsSync(userFolder)) {
      fs.mkdirSync(userFolder, { recursive: true });
    }

    cb(null, userFolder);
  },
  filename: (req, file, cb) => {
    const uniqueName = 'receipt-' + Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

// ✅ إعداد رفع الملفات مع التحقق من النوع والحجم
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // الحد الأقصى 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

/**
 * @route POST /api/payments
 * @desc إنشاء دفعة جديدة مع صورة إشعار وملاحظة
 * @access عام (مع تحقق لاحق من المستخدم)
 */
router.post('/', upload.single('receipt'), async (req, res) => {
  try {
    const { userId, amount, method, note } = req.body;
    console.log('@desc إنشاء دفعة جديدة مع صورة إشعار وملاحظة : ', userId);
    const receiptImage = `${userId}/${req.file?.filename}`;

    // ✅ تحقق من البيانات الأساسية
    if (!userId || typeof userId !== 'string' || userId.trim() === '' || !amount || !method || !receiptImage) {
      return res.status(400).json({ error: 'البيانات غير مكتملة أو لم يتم رفع الصورة' });
    }
    const paymentId = generatePaymentId();

    // 🧾 إنشاء كائن الدفع وتخزينه في قاعدة البيانات
    const payment = new Payment({
      paymentId,
      userId,
      amount,
      method,
      receiptImage,
      note,
      status: 'pending' // ← مهم لعرضها لاحقًا
    });
    await payment.save();

    // 📡 إرسال إشعار لحظي إلى الأدمن عبر WebSocket
    notifyAdmins({
      type: 'newPayment',
      paymentId,
      userId,
      amount,
      method,
      note,
      receiptImage: `/images/payments/${receiptImage}`
    });
    // إرسال إشعار لحظي للمستخدم
    notifyUsers({
      type: 'newPayment',
      userId: payment.userId,
      newAmount: payment.amount
    });

    res.json({ status: 'success', paymentId });
  } catch (err) {
    console.error('❌ خطأ في إنشاء دفعة:', err);
    res.status(500).json({
      error: 'فشل في إنشاء دفعة جديدة',
      details: err.message
    });
  }
});

/**
 * @route GET /api/payments?userId=...
 * @desc جلب جميع دفعات مستخدم معين حسب معرفه
 * @access عام (مع تحقق لاحق من المستخدم)
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.query.userId;

    // ✅ تحقق من وجود معرف المستخدم
    if (!userId) {
      return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
    }

    // 📥 جلب الدفعات من قاعدة البيانات وترتيبها تنازليًا حسب التاريخ
    const payments = await Payment.find({ userId }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    console.error('❌ خطأ في جلب الدفعات:', err);
    res.status(500).json({
      error: 'فشل في جلب الدفعات',
      details: err.message
    });
  }
});

router.get('/admin', verifyToken, checkAdmin, async (req, res) => {
  try {
    const payments = await Payment.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'فشل في جلب دفعات الأدمن' });
  }
});

router.put('/:id/accept', async (req, res) => {
  try {
    const payment = await Payment.findOneAndUpdate(
      { paymentId: req.params.id },
      { status: 'accepted' },
      { new: true }
    );

    if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة' });

    // تعديل رصيد المستخدم
    await User.findByIdAndUpdate(payment.userId, {
      $inc: { balance: payment.amount }
    });

    // إرسال إشعار لحظي للمستخدم
    notifyUsers({
      type: 'paymentAccepted',
      userId: payment.userId,
      newAmount: payment.amount
    });

    res.json({ status: 'accepted' });
  } catch (err) {
    console.error('❌ خطأ في قبول الدفعة:', err);
    res.status(500).json({ error: 'فشل في قبول الدفعة' });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const payment = await Payment.findOneAndUpdate(
      { paymentId: req.params.id },
      { status: 'rejected' },
      { new: true }
    );
    if (!payment) return res.status(404).json({ error: 'الدفعة غير موجودة' });
    notifyUsers({
      type: 'paymentRejected',
      userId: payment.userId,
      paymentId: payment.paymentId
    }, payment.userId); // ← إذا كنت تستخدم التوجيه حسب المستخدم
    res.json({ status: 'rejected' });
  } catch (err) {
    console.error('❌ خطأ في رفض الدفعة:', err);
    res.status(500).json({ error: 'فشل في رفض الدفعة' });
  }
});

module.exports = router;
