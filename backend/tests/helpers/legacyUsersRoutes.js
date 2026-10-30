/** TEST ONLY: frozen pre-C1 Mongo users-route regressions.
 * Never used by the server. Current users routes are exercised over real HTTP/PG. */
/**
 * @file routes/users.js
 * @description واجهات REST لإدارة المستخدمين مع تحقق من الهوية وتحديث شامل
 * @version 3.0.0
 * @license MIT
 */
const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { verifyToken, checkAdmin, requireSelf, requireSelfOrAdmin } = require('../../middlewares/auth');
const { doubleCsrfProtection } = require('../../middlewares/csrfMiddleware');
const { activeSessions } = require('../../utils/sessionStore');
const upload = require('../../middlewares/upload');
const cloudinary = require('../../config/cloudinary');

// Step 1 uses the existing process-local session store; a shared store follows separately.
function invalidateUserSessions(userId) {
  for (const [sessionId, session] of activeSessions) {
    if (String(session.userId).toLowerCase() === String(userId).toLowerCase()) activeSessions.delete(sessionId);
  }
}
const projection = '_id username email phone balance theme avatar role accountStatus lastLogin activatedAt createdAt';
function fail(res, err) {
  if (err.code === 11000) return res.status(409).json({ success: false, error: 'Username/email/phone already in use' });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ success: false, error: 'Invalid profile values' });
  if (err.name === 'DocumentNotFoundError' || err.name === 'VersionError') return res.status(409).json({ success: false, error: 'User changed; reload and try again' });
  return res.status(500).json({ success: false, code: 'USER_UPDATE_FAILED', error: 'User operation failed' });
}
function allowFields(body, fields) {
  return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(key => fields.includes(key));
}
function validBalance(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}
function editableUserFilter(req) {
  return { _id: req.params.id, accountStatus: 'active', tokenVersion: req.user.tokenVersion };
}
function disabledFinancialEndpoint(req, res) {
  return res.status(410).json({ success: false, code: 'ENDPOINT_DISABLED', error: 'Balance reserve/restore endpoints have been disabled' });
}
async function discardUploadedAvatar(file) {
  if (typeof file?.filename === 'string' && file.filename.startsWith('payments_receipts/')) {
    await cloudinary.uploader.destroy(file.filename);
  }
}
function avatarPublicId(avatarUrl) {
  try {
    const url = new URL(avatarUrl);
    if (url.hostname !== 'res.cloudinary.com' ||
        !url.pathname.startsWith(`/${process.env.CLOUDINARY_NAME}/image/upload/`)) return null;
    return url.pathname.match(/\/(payments_receipts\/[^/]+)\.[a-z0-9]+$/i)?.[1] || null;
  } catch (_) { return null; }
}

// No authentication, database or financial side effects, regardless of HTTP method.
router.all('/:id/reserve', disabledFinancialEndpoint);
router.all('/:id/restore', disabledFinancialEndpoint);

// 📥 جلب جميع المستخدمين (للوحة التحكم)
router.get('/', verifyToken, checkAdmin, async (req, res) => {
  try {
    const users = await User.find().select(projection);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'فشل تحميل المستخدمين' });
  }
});

// ✅ نقطة جلب بيانات المستخدم الحالي
router.get('/me', verifyToken, (req, res) => res.json(req.user));

// 📥 جلب مستخدم واحد (لـ usermanager.js)
router.get('/:id', verifyToken, requireSelfOrAdmin(), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(projection);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'فشل تحميل المستخدم' });
  }
});

// 🔄 تحديث بيانات المستخدم بالكامل
router.put('/:id', verifyToken, requireSelf(), doubleCsrfProtection, async (req, res) => {
  const fields = ['username', 'email', 'phone', 'theme', 'password', 'currentPassword'];
  if (!allowFields(req.body, fields) || !Object.keys(req.body).length) return res.status(400).json({ success: false, error: 'Only editable profile fields are permitted' });
  const passwordChanged = Object.hasOwn(req.body, 'password');
  if ((passwordChanged && (typeof req.body.password !== 'string' || !req.body.password || typeof req.body.currentPassword !== 'string')) ||
      (!passwordChanged && Object.hasOwn(req.body, 'currentPassword'))) return res.status(400).json({ success: false, error: 'Password changes require currentPassword and a nonempty new password' });
  try {
    const user = await User.findById(req.params.id).select('+password');
    if (!user || user.accountStatus !== 'active' || user.tokenVersion !== req.user.tokenVersion) return res.status(403).json({ success: false, error: 'Account unavailable; sign in again' });
    if (passwordChanged && (user.provider !== 'local' || !user.password || !(await user.comparePassword(req.body.currentPassword)))) return res.status(403).json({ success: false, error: 'Current password is incorrect or local password change is unavailable' });
    for (const key of fields) {
      if (key !== 'currentPassword' && Object.hasOwn(req.body, key)) {
        if (key === 'theme' ? ![0, 1].includes(req.body[key]) : typeof req.body[key] !== 'string') return res.status(400).json({ success: false, error: 'Invalid profile field type' });
        user[key] = req.body[key];
      }
    }
    // Reject concurrent password/status changes without writing cached financial fields.
    user.$where = { tokenVersion: user.tokenVersion, accountStatus: 'active' };
    await user.save();
    if (passwordChanged) invalidateUserSessions(user._id);
    res.json({ success: true, message: 'Profile updated', user, requiresReauthentication: passwordChanged });
  } catch (err) { fail(res, err); }
});

// 💰 تعديل الرصيد فقط
router.put('/:id/balance', verifyToken, checkAdmin, requireSelfOrAdmin(), doubleCsrfProtection, async (req, res) => {
  try {
    if (!allowFields(req.body, ['balance', 'expectedBalance']) || !validBalance(req.body.balance) ||
        (Object.hasOwn(req.body, 'expectedBalance') && !validBalance(req.body.expectedBalance))) {
      return res.status(400).json({ success: false, error: 'Invalid balance adjustment fields or values' });
    }
    // Never fall back to a direct balance write while the audited financial service is missing.
    return res.status(503).json({ success: false, code: 'FINANCIAL_UNAVAILABLE', error: 'Balance adjustments are disabled until the financial service is available' });
  } catch (err) { fail(res, err); }
});

// 🎨 تحديث الثيم الخاص بالمستخدم
router.put('/:id/theme', verifyToken, requireSelf(), doubleCsrfProtection, async (req, res) => {
  try {
    if (!allowFields(req.body, ['theme']) || ![0, 1].includes(req.body.theme)) {
      return res.status(400).json({ message: 'قيمة الثيم يجب أن تكون 0 أو 1' });
    }
    const updatedUser = await User.findOneAndUpdate(
      editableUserFilter(req),
      { $set: { theme: req.body.theme } },
      { new: true, runValidators: true }
    );

    if (!updatedUser) return res.status(404).json({ message: 'المستخدم غير موجود' });

    res.json({ message: '✅ تم تحديث الثيم بنجاح', user: updatedUser });
  } catch (err) { fail(res, err); }
});


// 🔓 تفعيل المستخدم
router.put('/:id/activate', verifyToken, checkAdmin, requireSelfOrAdmin(), doubleCsrfProtection, async (req, res) => {
  if (!allowFields(req.body === undefined ? {} : req.body, [])) return res.status(400).json({ success: false, error: 'Activation does not accept editable fields' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    if (user.accountStatus === 'active') {
      return res.status(400).json({ message: 'الحساب مفعل بالفعل' });
    }

    user.accountStatus = 'active';
    user.loginAttempts = 0;
    user.activatedAt = new Date();
    user.tokenVersion += 1;
    await user.save();
    invalidateUserSessions(user._id);
    res.json({ message: '✅ تم تفعيل المستخدم', user });
  } catch (err) { fail(res, err); }
});

// 🗑️ حذف المستخدم
router.delete('/:id', verifyToken, checkAdmin, requireSelfOrAdmin(), doubleCsrfProtection, async (req, res) => {
  if (!allowFields(req.body === undefined ? {} : req.body, [])) return res.status(400).json({ success: false, error: 'Deletion does not accept editable fields' });
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    invalidateUserSessions(user._id);
    res.json({ message: '🗑️ تم حذف المستخدم' });
  } catch (err) { fail(res, err); }
});

// 📤 جلب رصيد المستخدم فقط
router.get('/:id/balance', verifyToken, requireSelfOrAdmin(), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('balance');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json({ balance: user.balance });
  } catch (err) {
    res.status(500).json({ message: '❌ خطأ أثناء جلب الرصيد' });
  }
});

/**
 * @route POST /api/users/:id/avatar
 * @desc رفع صورة شخصية للمستخدم وتحديث رابطها
 * @access خاص بالمستخدم
 */
router.post('/:id/avatar', verifyToken, requireSelf(), doubleCsrfProtection, upload.single('avatar'), async (req, res) => {
  let persisted = false;
  try {
    if (!allowFields(req.body === undefined ? {} : req.body, [])) {
      await discardUploadedAvatar(req.file);
      return res.status(400).json({ success: false, error: 'Avatar upload does not accept profile fields' });
    }
    const imageUrl = req.file?.path;
    if (typeof imageUrl !== 'string' || !imageUrl) return res.status(400).json({ error: 'لم يتم رفع الصورة' });

    const user = await User.findOneAndUpdate(
      editableUserFilter(req), { $set: { avatar: imageUrl } },
      { new: true, runValidators: true, projection: 'avatar' }
    );
    if (!user) {
      await discardUploadedAvatar(req.file);
      return res.status(404).json({ error: 'المستخدم غير موجود أو الجلسة تغيرت' });
    }
    persisted = true;
    res.json({ message: '✅ تم تحديث الصورة الشخصية', avatar: user.avatar });
  } catch (err) {
    if (!persisted) {
      try { await discardUploadedAvatar(req.file); } catch (_) { /* Do not expose storage errors. */ }
    }
    fail(res, err);
  }
});

/**
 * @route POST /api/users/:id/avatar/remove
 * @desc إزالة الصورة الشخصية من قاعدة البيانات وCloudinary
 * @access خاص بالمستخدم
 */
router.post('/:id/avatar/remove', verifyToken, requireSelf(), doubleCsrfProtection, async (req, res) => {
  if (!allowFields(req.body === undefined ? {} : req.body, [])) return res.status(400).json({ success: false, error: 'Avatar removal does not accept editable fields' });
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (user.accountStatus !== 'active' || user.tokenVersion !== req.user.tokenVersion) return res.status(403).json({ success: false, error: 'Account unavailable; sign in again' });

    const publicId = avatarPublicId(user.avatar);
    user.avatar = '';
    user.$where = { tokenVersion: user.tokenVersion, accountStatus: 'active' };
    await user.save();
    // Only delete an asset from this application's Cloudinary account after the guarded save succeeds.
    if (publicId) await cloudinary.uploader.destroy(publicId);
    res.json({ message: '✅ تم إزالة الصورة الشخصية', avatar: '' });
  } catch (err) { fail(res, err); }
});

module.exports = router;
