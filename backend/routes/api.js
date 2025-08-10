const express = require('express');
const router = express.Router();

// مسارات API الأساسية
router.get('/', (req, res) => {
  res.json({ message: 'API جاهز للعمل' });
});

module.exports = router;