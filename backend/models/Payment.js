const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  amount: { type: Number, required: true },
  amountInUSD: {type: Number, require: true},
  method: { type: String, required: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'cancelled'], default: 'pending' },
  notified: { type: Boolean, default: false },
  notificationSentAt: Date,
  notificationAttempts: { type: Number, default: 0 },
  receiptImage: { type: String }, // اسم أو مسار الصورة
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
