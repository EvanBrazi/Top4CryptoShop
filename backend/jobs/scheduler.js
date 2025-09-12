const cron = require('node-cron');
const { cleanOldNotifications } = require('../utils/cleanupNotifications');
const { backupUsers, backupUsersToDrive } = require('../utils/backupUsers');
const { logBackupStatus } = require('../utils/backupUsers');
const { notifyAdmin } = require('../utils/notifyAdmin');

// 🧹 تنظيف الإشعارات المؤقتة يوميًا الساعة 3 صباحًا
cron.schedule('0 3 * * *', () => {
  cleanOldNotifications(7);
});

// 🗂️ حفظ نسخة احتياطية يوميًا الساعة 4 صباحًا
cron.schedule('0 4 * * *', async () => {
  try {
    await backupUsers();
    logBackupStatus('✅ SUCCESS', 'Local');
    await notifyAdmin({
      message: '✅ تم حفظ نسخة احتياطية محلية بنجاح',
      status: 'success',
      source: 'Local Backup'
    });
  } catch (err) {
    logBackupStatus('❌ FAILED', 'Local', err.message);
    await notifyAdmin({
      message: `❌ فشل النسخ الاحتياطي المحلي: ${err.message}`,
      status: 'error',
      source: 'Local Backup'
    });
  }

  try {
    await backupUsersToDrive();
    logBackupStatus('✅ SUCCESS', 'Drive');
    await notifyAdmin({
      message: '✅ تم رفع النسخة الاحتياطية إلى Google Drive بنجاح',
      status: 'success',
      source: 'Drive Backup'
    });
  } catch (err) {
    logBackupStatus('❌ FAILED', 'Drive', err.message);
    await notifyAdmin({
      message: `❌ فشل النسخ الاحتياطي إلى Google Drive: ${err.message}`,
      status: 'error',
      source: 'Drive Backup'
    });
  }
});

console.log('✅ تم تفعيل المهام المجدولة (node-cron)');
