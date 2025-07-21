require('dotenv').config();
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('مرحباً بكم في Top4CryptoShop!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`الخادم يعمل على http://localhost:${PORT}`);
});

app.get('/api/products', (req, res) => {
  res.json([{id: 1, name: 'Bitcoin', price: 50000}]);
});
