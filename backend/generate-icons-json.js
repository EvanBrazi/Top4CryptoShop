/**
 * Script to generate icons-list.json from /public/icons/apps/
 * Author: شادي & Copilot
 */

const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'public', 'icons', 'apps');
const outputFile = path.join(__dirname, 'public', 'icons-list.json');

fs.readdir(iconsDir, (err, files) => {
  if (err) {
    console.error('❌ فشل قراءة مجلد الأيقونات:', err);
    return;
  }

  const icons = files
    .filter(file => file.endsWith('.png'))
    .map(file => file.trim());

  fs.writeFile(outputFile, JSON.stringify(icons, null, 2), (err) => {
    if (err) {
      console.error('❌ فشل كتابة ملف JSON:', err);
    } else {
      console.log(`✅ تم إنشاء ${outputFile} بنجاح (${icons.length} أيقونة)`);
    }
  });
});