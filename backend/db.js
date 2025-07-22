const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بـ MongoDB'))
  .catch(err => console.error('❌ فشل الاتصال:', err));
