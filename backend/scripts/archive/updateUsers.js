require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../../models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🔁 جاري تحديث المستخدمين...');
    
    const result = await User.updateMany(
      { 
        $or: [
          { loginAttempts: { $exists: false } },
          { lastLogin: { $exists: false } }
        ]
      },
      {
        $set: {
          loginAttempts: 0,
          lastLogin: null
        }
      }
    );
    
    console.log(`🎉 تم تحديث ${result.modifiedCount} مستخدم بنجاح`);
    process.exit(0);
  } catch (err) {
    console.error('🔥 خطأ في التحديث:', err);
    process.exit(1);
  }
})();
