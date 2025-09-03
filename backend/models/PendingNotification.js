// models/PendingNotification.js
const mongoose = require('mongoose');

const pendingNotificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String },
  payload: { type: Object, required: true },
  notified: { type: Boolean, default: false },
  notificationAttempts: { type: Number, default: 0 },
  notificationSentAt: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PendingNotification', pendingNotificationSchema);
