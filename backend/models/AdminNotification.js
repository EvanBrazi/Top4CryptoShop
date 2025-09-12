// models/AdminNotification.js
const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
  type: { type: String, default: 'backup' },
  message: String,
  status: { type: String, enum: ['success', 'error'], default: 'success' },
  source: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
