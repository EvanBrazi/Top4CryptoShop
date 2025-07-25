const RevokedToken = require('../models/RevokedToken');

const checkTokenRevocation = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return next();
    
    const isRevoked = await RevokedToken.findOne({ token });
    if (isRevoked) return res.status(401).json({ error: 'الجلسة منتهية' });
    
    next();
};

module.exports = { checkTokenRevocation };
