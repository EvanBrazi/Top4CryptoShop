const cron = require('node-cron');
const { cleanOldNotifications } = require('../utils/cleanupNotifications');
const { backupUsers } = require('../utils/backupUsers');

// تنظيف الإشعارات المؤقتة يوميًا الساعة 3 صباحًا
cron.schedule('0 3 * * *', () => {
  cleanOldNotifications(7);
});

// حفظ نسخة احتياطية من المستخدمين يوميًا الساعة 4 صباحًا
cron.schedule('0 4 * * *', () => {
  backupUsers();
});

console.log('✅ تم تفعيل المهام المجدولة (node-cron)');
