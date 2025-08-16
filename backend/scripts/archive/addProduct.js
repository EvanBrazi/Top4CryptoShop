const productService = require('./models/Product');

async function addSampleProducts() {
  const sampleProducts = [
    { name: "Bitcoin", price: 50000, category: "crypto" },
    { name: "Ethereum", price: 3000, category: "crypto" }
  ];

  try {
    await productService.connect();
    const result = await productService.collection.insertMany(sampleProducts);
    console.log(`✅ تمت إضافة ${result.insertedCount} منتجات`);
  } catch (err) {
    console.error('❌ خطأ في الإضافة:', err);
  }
}

addSampleProducts();
