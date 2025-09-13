const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const User = require('../models/User');
const { notifyAdmin } = require('../utils/notifyAdmin');

// وظيفة مساعدة لتسجيل حالة النسخ الاحتياطي
function logBackupStatus(status, source, message = '') {
  // Ensure logs directory exists
  const logDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

  // Log file path
  const logPath = path.join(logDir, 'backup-log.txt');
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${source}] ${status} ${message}\n`;

  // Append log entry to the file
  fs.appendFileSync(logPath, entry);
}

/**
 * حفظ نسخة احتياطية من المستخدمين في مجلد خارجي
 */
async function backupUsers() {
  try {
    const users = await User.find().lean();
    const backupDir = 'C:/Users/DELL/Top4Crypto_Backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const filePath = path.join(backupDir, `users-backup-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

    logBackupStatus('✅ SUCCESS', 'Local', `Saved to ${filePath}`);
    await notifyAdmin({
      message: `✅ تم حفظ نسخة احتياطية محلية بنجاح في ${filePath}`,
      status: 'success',
      source: 'Local Backup'
    });

    console.log(`🗂️ تم حفظ نسخة احتياطية من المستخدمين في ${filePath}`);
  } catch (error) {
    logBackupStatus('❌ FAILED', 'Local', error.message);
    await notifyAdmin({
      message: `❌ فشل النسخ الاحتياطي المحلي: ${error.message}`,
      status: 'error',
      source: 'Local Backup'
    });

    console.error('❌ خطأ أثناء حفظ النسخة الاحتياطية:', error);
  }
}

// إعدادات Google Drive API
const KEYFILEPATH = path.join(__dirname, '..', 'config', 'gdrive-key.json'); // ملف المصادقة
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function backupUsersToDrive() {
  try {
    const users = await User.find().lean();
    const tempFilePath = path.join(__dirname, `users-backup-${Date.now()}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(users, null, 2));

    const auth = new google.auth.GoogleAuth({
      keyFile: KEYFILEPATH,
      scopes: SCOPES,
    });

    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: path.basename(tempFilePath),
      parents: ['1ZyAdZdXrD3JmTDO1MbQxHYfme47lAVWG'] // ✅ استخدم ID فقط وليس رابط كامل
    };

    const media = {
      mimeType: 'application/json',
      body: fs.createReadStream(tempFilePath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    logBackupStatus('✅ SUCCESS', 'Drive', `Saved to Google Drive (ID: ${response.data.id})`);
    await notifyAdmin({
      message: `✅ تم رفع النسخة الاحتياطية إلى Google Drive بنجاح (ID: ${response.data.id})`,
      status: 'success',
      source: 'Drive Backup'
    });

    console.log(`✅ تم رفع النسخة الاحتياطية إلى Google Drive: ${response.data.id}`);
    fs.unlinkSync(tempFilePath);
  } catch (error) {
    logBackupStatus('❌ FAILED', 'Drive', error.message);
    await notifyAdmin({
      message: `❌ فشل النسخ الاحتياطي إلى Google Drive: ${error.message}`,
      status: 'error',
      source: 'Drive Backup'
    });

    console.error('❌ فشل رفع النسخة إلى Google Drive:', error);
  }
}

module.exports = { backupUsers, backupUsersToDrive, logBackupStatus };
