/**
 * ملف routes/icons.js
 * إصدار: 2.0
 * وصف: مسارات إدارة الأيقونات (معدل لاستخدام الأيقونات المحلية فقط)
 */

const express = require('express');
const router = express.Router();
const Icon = require('../models/Icon');
const { verifyToken } = require('../middlewares/auth');


router.get('/', async (req, res) => {
  const icons = await Icon.find();
  res.json(icons);
});

router.put('/:id/retry', verifyToken, async (req, res) => {
  const icon = await Icon.findById(req.params.id);
  icon.status = 'pending';
  icon.attempts += 1;
  await icon.save();
  res.json({ message: 'تمت إعادة المحاولة', icon });
});

module.exports = router;