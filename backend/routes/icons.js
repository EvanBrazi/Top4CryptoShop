/**
 * ملف routes/icons.js
 * إصدار: 2.0
 * وصف: مسارات إدارة الأيقونات (معدل لاستخدام الأيقونات المحلية فقط)
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

// مسار تخزين الأيقونات المحلية
const ICONS_DIR = path.join(__dirname, '../public/icons/apps');

/**
 * @route GET /apps/icons/status
 * @description التحقق من حالة الأيقونات المحلية
 * @returns {Object} {downloaded: boolean}
 */
router.get('/apps/icons/status', async (req, res) => {
  try {
    const files = await fs.readdir(ICONS_DIR);
    const hasIcons = files.some(file => file.endsWith('.png'));
    res.json({ downloaded: hasIcons });
  } catch (error) {
    res.json({ downloaded: false });
  }
});

/**
 * @route POST /apps/icons
 * @description جلب الأيقونات (معدل لاستخدام الأيقونات المحلية فقط)
 * @returns {Object} {message: string, localIcons: boolean}
 */
router.post('/apps/icons', async (req, res) => {
  res.json({ 
    message: 'يتم استخدام الأيقونات المحلية فقط',
    localIcons: true
  });
});

/**
 * @route POST /apps/icons/download-all
 * @description تحميل الأيقونات (معدل لتعطيل التحميل التلقائي)
 * @returns {Object} {message: string, disabled: boolean}
 */
router.post('/apps/icons/download-all', async (req, res) => {
  res.json({ 
    message: 'تم تعطيل التحميل التلقائي للأيقونات',
    disabled: true
  });
});

module.exports = router;