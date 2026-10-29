'use strict';

const { randomUUID } = require('node:crypto');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const MAX_BYTES = 5 * 1024 * 1024;
const FORMATS = ['jpg', 'png', 'jpeg', 'webp', 'bmp', 'tiff'];
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/x-ms-bmp', 'image/tiff'];
const owned = id => typeof id === 'string' && /^payments_receipts\/[a-f\d-]{36}$/.test(id);
function failure(status = 502, code = 'AVATAR_UPLOAD_FAILED', message = 'Avatar upload failed') {
  return Object.assign(new Error(message), { status, code });
}
async function discard(publicId) {
  if (!owned(publicId)) return;
  try { await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'upload', invalidate: true, timeout: 5000 }); }
  catch (_) { /* Best effort; only the server-generated asset may be deleted. */ }
}
function validResult(result, publicId) {
  if (result?.public_id !== publicId || result.resource_type !== 'image' || result.type !== 'upload' ||
      result.format !== 'jpg' || !Number.isSafeInteger(result.bytes) || result.bytes <= 0) return false;
  try {
    const url = new URL(result.secure_url);
    const name = cloudinary.config().cloud_name;
    return typeof name === 'string' && !!name && url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      url.pathname.startsWith(`/${name}/image/upload/`) && url.pathname.endsWith(`/${publicId}.jpg`);
  } catch (_) { return false; }
}
// Parse the entire bounded multipart request before a provider write: malformed
// boundaries, extra fields/files and size limits cannot leave an uploaded avatar.
const parser = multer({ storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 2, fieldNameSize: 64 },
  fileFilter(req, file, callback) {
    callback(MIMES.includes(file.mimetype) ? null : failure(400, 'INVALID_AVATAR', 'Unsupported avatar type'), true);
  }
});
function sendAvatar(req, res, file) {
  const publicId = `payments_receipts/${randomUUID()}`;
  return new Promise((resolve, reject) => {
    let stream, settled = false, failed = false;
    const cleanListeners = () => {
      clearTimeout(timer);
      req.removeListener('aborted', abort);
      res.removeListener('close', closed);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      failed = true;
      cleanListeners();
      if (stream && !stream.destroyed) stream.destroy();
      void discard(publicId);
      reject(error);
    };
    const abort = () => fail(failure(400, 'AVATAR_UPLOAD_ABORTED', 'Avatar upload interrupted'));
    const closed = () => { if (!res.writableFinished) abort(); };
    const timer = setTimeout(() => fail(failure(504, 'AVATAR_UPLOAD_TIMEOUT', 'Avatar upload timed out')), 30000);
    timer.unref();
    req.once('aborted', abort);
    res.once('close', closed);
    if (req.aborted || res.destroyed) { abort(); return; }
    try {
      stream = cloudinary.uploader.upload_stream({ public_id: publicId, resource_type: 'image', type: 'upload',
        format: 'jpg', allowed_formats: FORMATS, overwrite: false, timeout: 30000,
        transformation: [{ format: 'jpg', width: 800, height: 800, crop: 'limit' }] }, (error, result) => {
        // A late successful response after interruption needs another owned cleanup.
        // Never delete an arbitrary ID returned in an unexpected provider response.
        if (settled) { if (failed && result?.public_id === publicId) void discard(publicId); return; }
        if (error || !validResult(result, publicId)) { fail(failure()); return; }
        settled = true;
        cleanListeners();
        resolve({ filename: publicId, path: result.secure_url, size: result.bytes });
      });
      stream.once('error', () => fail(failure()));
      if (settled) { if (!stream.destroyed) stream.destroy(); return; }
      stream.end(file.buffer);
    } catch (_) { fail(failure()); }
  });
}
module.exports = {
  single(field) {
    const parse = parser.single(field);
    return (req, res, next) => parse(req, res, error => {
      if (error) {
        if (error instanceof multer.MulterError) error.status = 400;
        else error = failure(400, 'INVALID_AVATAR', 'Invalid avatar upload');
        return next(error);
      }
      if (!req.file) return next(); // Preserve the route's missing-file response.
      const file = req.file;
      if (!Buffer.isBuffer(file.buffer) || !file.buffer.length || file.buffer.length > MAX_BYTES) {
        delete file.buffer;
        return next(failure(400, 'INVALID_AVATAR', 'A bounded avatar image is required'));
      }
      sendAvatar(req, res, file).then(result => {
        delete file.buffer;
        Object.assign(file, result);
        next();
      }, error => {
        delete file.buffer;
        next(error);
      });
    });
  }
};
