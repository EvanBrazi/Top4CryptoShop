/**
 * @file cleanupNotifications.js
 * @module utils/cleanupNotifications
 * @description
 *  - وحدة تنظيف الإشعارات المؤقتة القديمة من قاعدة البيانات
 *  - تحذف الإشعارات التي مرّ عليها أكثر من X يومًا
 *  - قابلة للجدولة أو التشغيل اليدوي
 *
 * @author Evan Brazi
 * @version 1.0.0
 * @lastModified 2025-09-03
 */

const PendingNotification = require('../models/PendingNotification');

/**
 * تنظيف الإشعارات المؤقتة القديمة
 * @param {Number} maxAgeDays - عدد الأيام قبل اعتبار الإشعار قديمًا
 */
async function cleanOldNotifications(maxAgeDays = 7) {
  const threshold = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  const result = await PendingNotification.deleteMany({
    $or: [
      { notified: true, notificationSentAt: { $lt: threshold } },
      { notified: false, createdAt: { $lt: threshold } }
    ]
  });

  console.log(`🧹 تم حذف ${result.deletedCount} إشعارات مؤقتة أقدم من ${maxAgeDays} يومًا`);
}

module.exports = { cleanOldNotifications };
