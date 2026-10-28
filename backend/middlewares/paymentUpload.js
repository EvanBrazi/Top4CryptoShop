'use strict';

const { randomUUID } = require('node:crypto');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('../config/cloudinary');
const PaymentError = require('../utils/paymentError');
const MAX_BYTES = 5 * 1024 * 1024;
const owned = id => typeof id === 'string' && /^private_payment_receipts\/[a-f\d-]{36}$/.test(id) && !/\s/.test(id);
const upload = multer({ storage: multer.memoryStorage(),
  // Busboy emits partsLimit at the boundary of the Nth part, so allow the closing boundary too.
  limits: { fileSize: MAX_BYTES, files: 1, fields: 3, parts: 5, fieldSize: 2048, fieldNameSize: 64 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new PaymentError(400, 'INVALID_RECEIPT', 'Unsupported receipt type'));
    }
    callback(null, true);
  }
});
async function cleanupReceipt(receipt) {
  if (!owned(receipt?.publicId)) return;
  try { await cloudinary.uploader.destroy(receipt.publicId, { resource_type: 'image', type: 'authenticated', invalidate: true }); }
  catch (_) { /* Best effort only; never compensate financial outcomes with storage effects. */ }
}
async function storeReceipt(file) {
  if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0 || file.buffer.length > MAX_BYTES) {
    throw new PaymentError(400, 'INVALID_RECEIPT', 'A bounded receipt image is required');
  }
  let buffer;
  try {
    const options = { limitInputPixels: 16000000, animated: false };
    const metadata = await sharp(file.buffer, options).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Invalid image content');
    buffer = await sharp(file.buffer, options).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch (_) { throw new PaymentError(400, 'INVALID_RECEIPT', 'Invalid receipt image content'); }
  const receipt = { publicId: `private_payment_receipts/${randomUUID()}`, format: 'jpg', deliveryType: 'authenticated' };
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ public_id: receipt.publicId, resource_type: 'image',
        type: 'authenticated', format: 'jpg', overwrite: false }, (error, result) => error ? reject(error) : resolve(result));
      stream.once('error', reject);
      stream.end(buffer);
    });
    if (result?.public_id !== receipt.publicId || result.format !== 'jpg' || result.type !== 'authenticated' || result.resource_type !== 'image') {
      throw new Error('Unexpected receipt storage response');
    }
    return receipt;
  } catch (error) { await cleanupReceipt(receipt); throw error; }
}
function receiptLink(receipt) {
  if (!owned(receipt?.publicId) || receipt.format !== 'jpg' || receipt.deliveryType !== 'authenticated') {
    throw new PaymentError(410, 'LEGACY_RECEIPT_UNAVAILABLE', 'Legacy receipt requires migration');
  }
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const url = cloudinary.utils.private_download_url(receipt.publicId, 'jpg', {
    resource_type: 'image', type: 'authenticated', expires_at: expiresAt, attachment: true
  });
  return { url, expiresAt: expiresAt * 1000 };
}
module.exports = { upload, storeReceipt, cleanupReceipt, receiptLink };
