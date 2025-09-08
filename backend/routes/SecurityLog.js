// routes/SecurityLog.js
const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  action: String, // enable_2fa, disable_2fa, verify_email
  ip: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now }
});
module.exports = mongoose.model('SecurityLog', logSchema);
