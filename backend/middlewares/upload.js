const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'payments_receipts',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'bmp', 'tiff'],
    transformation: [{ format: 'jpg', width: 800, height: 800, crop: 'limit' }]
  }
});

const upload = multer({ storage });

module.exports = upload;
