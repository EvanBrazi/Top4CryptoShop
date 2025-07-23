const mongoose = require('mongoose');
const uri = "mongodb+srv://leporejamesw0:JJhVie5dhZsFis0v@cluster0.qatrhhk.mongodb.net/Top4CryptoShop?retryWrites=true&w=majority";

mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('✅ الاتصال ناجح'))
.catch(err => console.error('❌ فشل الاتصال:', err.message));
