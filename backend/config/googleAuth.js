const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User') // تأكد من المسار الصحيح

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            // تحقق إن كان المستخدم موجود مسبقًا
            let user = await User.findOne({ googleId: profile.id });

            if (!user) {
                user = await User.create({
                    googleId: profile.id,
                    provider: 'google',
                    username: profile.displayName.replace(/\s+/g, '_').toLowerCase(), // توليد اسم مستخدم مؤقت
                    email: profile.emails?.[0]?.value,
                    avatar: profile.photos?.[0]?.value,
                    activatedAt: new Date()
                });

                console.log('🆕 مستخدم جديد تم حفظه:', user);
            } else {
                console.log('🔁 مستخدم موجود تم تسجيل دخوله:', user);
            }

            return done(null, user);
        } catch (err) {
            console.error('❌ خطأ أثناء حفظ المستخدم:', err);
            return done(err, null);
        }
    }));

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