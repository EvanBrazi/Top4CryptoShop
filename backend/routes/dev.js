// routes/dev.js أو أي ملف مناسب
const express = require('express');
const router = express.Router();
const { notify } = require('../utils/notifications'); // تأكد من استيراد دالة notify

/**
 * @route POST /dev/simulate-notification
 * @desc إرسال إشعار وهمي لأي مستخدم أو دور
 */
router.post('/simulate-notification', (req, res) => {
  const { type, payload, targetRole, targetUserId } = req.body;

  if (!type || !payload) {
    return res.status(400).json({ error: 'النوع والمحتوى مطلوبان' });
  }
  console.log('✅ تم إرسال الإشعار التجريبي بنجاح', type, payload);
  notify({ type, ...payload }, targetRole, targetUserId);
  res.json({ success: true, message: '✅ تم إرسال الإشعار التجريبي بنجاح' });
});

module.exports = router;
