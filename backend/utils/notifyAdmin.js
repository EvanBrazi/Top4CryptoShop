/**
 * @file notifyAdmin.js
 * @module utils/notifyAdmin
 * @description
 *  - وحدة إرسال إشعارات إدارية للأدمن
 *  - تُستخدم لتسجيل إشعارات النسخ الاحتياطي أو النظام في قاعدة البيانات
 *  - ترسل نسخة مباشرة عبر WebSocket إلى جلسات الأدمن المتصلة
 *
 * @author Evan Brazi
 * @version 1.0.0
 * @lastModified 2025-09-12
 */

const AdminNotification = require('../models/AdminNotification');
const { notify } = require('./notifications');

/**
 * إرسال إشعار إداري للأدمن
 * @param {Object} options - تفاصيل الإشعار
 * @param {String} options.message - نص الإشعار
 * @param {'success'|'error'} [options.status='success'] - حالة الإشعار
 * @param {String} [options.source='System'] - مصدر الإشعار (مثل Local Backup أو Drive Backup)
 */
async function notifyAdmin({ message, status = 'success', source = 'System' }) {
  try {
    const payload = {
      type: 'backupStatus',     // نوع الإشعار (يمكن تغييره حسب الحاجة)
      message,                  // نص الإشعار
      status,                   // success أو error
      source,                   // مصدر النسخ الاحتياطي
      timestamp: new Date()     // وقت الإرسال
    };
    // ✅ حفظ الإشعار في قاعدة البيانات
    await AdminNotification.create(payload);
    // ✅ إرسال الإشعار عبر WebSocket إلى الأدمن
    await notify(payload, 'admin');
    console.log(`📬 إشعار إداري أُرسل إلى الأدمن: ${message}`);
  } catch (err) {
    console.error('❌ فشل إرسال إشعار النسخ الاحتياطي للأدمن:', err.message);
  }
}

module.exports = { notifyAdmin };
