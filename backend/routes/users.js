const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/', async (req, res) => {
  const users = await User.find();
  res.json(users);
});

router.put('/users/:id/activate', async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    if (user.accountStatus === 'active') {
      return res.status(400).json({ message: 'الحساب مفعل بالفعل' });
    }

    user.accountStatus = 'active';
    user.loginAttempts = 0; // إعادة تعيين المحاولات
    await user.save();

    res.json({ message: 'تم تفعيل المستخدم بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'حدث خطأ أثناء التفعيل' });
  }
});


router.put('/:id/balance', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, {
      balance: req.body.balance
    }, { new: true });
    res.json({ message: 'تم التحديث بنجاح', user });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في التحديث' });
  }
});

router.delete('/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'تم حذف المستخدم' });
});

module.exports = router;