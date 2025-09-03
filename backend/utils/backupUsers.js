const fs = require('fs');
const path = require('path');
const User = require('../models/User');

/**
 * حفظ نسخة احتياطية من المستخدمين في ملف JSON
 */
async function backupUsers() {
  try {
    const users = await User.find().lean();
    const filePath = path.join(__dirname, '..', 'backups', `users-backup-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    console.log(`🗂️ تم حفظ نسخة احتياطية من المستخدمين في ${filePath}`);
  } catch (error) {
    console.error('❌ خطأ أثناء حفظ النسخة الاحتياطية:', error);
  }
}

module.exports = { backupUsers };
