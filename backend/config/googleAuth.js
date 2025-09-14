require('dotenv').config();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User'); // تأكد من المسار الصحيح

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
},
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const googleId = profile.id;

      if (!email || !googleId) {
        throw new Error('بيانات Google غير مكتملة');
      }

      // ✅ تحقق من وجود المستخدم بالبريد أولًا
      let user = await User.findOne({ email });

      if (!user) {
        // ✅ إنشاء مستخدم جديد
        user = await User.create({
          googleId,
          provider: 'google',
          username: profile.displayName.replace(/\s+/g, '_').toLowerCase(),
          email,
          avatar: profile.photos?.[0]?.value,
          activatedAt: new Date()
        });

        console.log('🆕 مستخدم جديد تم حفظه:', user);
      } else {
        // ✅ تحديث googleId إذا لم يكن مرتبطًا مسبقًا
        if (!user.googleId) {
          user.googleId = googleId;
          user.provider = 'google';
          await user.save();
          console.log('🔗 تم ربط حساب Google بالمستخدم الحالي:', user);
        } else {
          console.log('🔁 مستخدم موجود تم تسجيل دخوله عبر Google:', user);
        }
      }

      return done(null, user);
    } catch (err) {
      console.error('❌ خطأ أثناء معالجة Google OAuth:', err);
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id); // حفظ ID فقط
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
