const { MongoClient } = require('mongodb');
require('dotenv').config();

async function seedProducts() {
  const client = new MongoClient(process.env.MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db('Top4CryptoShop');
    const products = db.collection('products');

    // إضافة منتج اختباري
    const result = await products.insertOne({
      name: "Bitcoin",
      price: 50000,
      category: "Cryptocurrency",
      createdAt: new Date()
    });

    console.log(`✅ تمت إضافة المنتج بنجاح بـ ID: ${result.insertedId}`);
  } catch (err) {
    console.error('❌ خطأ في إضافة المنتج:', err.message);
  } finally {
    await client.close();
  }
}

seedProducts();
