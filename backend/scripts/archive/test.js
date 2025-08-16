const mongoose = require('mongoose');
const uri = 'mongodb://127.0.0.1:27017/Top4CryptoShop';

mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('✅ الاتصال ناجح'))
.catch(err => console.error('❌ فشل الاتصال:', err.message));
