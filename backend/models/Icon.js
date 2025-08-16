const mongoose = require('mongoose');

const iconSchema = new mongoose.Schema({
  url: { type: String, required: true },
  status: { type: String, enum: ['success', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  duration: Number,
  preview: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Icon', iconSchema);