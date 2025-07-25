const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken, checkAdmin } = require('../middlewares/authMiddleware');


router.put('/update-balance/:userId', verifyToken, checkAdmin, async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { 
        $set: { 
          balance: req.body.balance,
          tokenVersion: req.user.tokenVersion + 1
        }
      },
      { new: true }
    );

    res.json({
      success: true,
      newBalance: updatedUser.balance
    });
  } catch (err) {
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

module.exports = router;
