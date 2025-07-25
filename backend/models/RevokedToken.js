const mongoose = require('mongoose');

const revokedTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now, expires: '1h' }
});

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
