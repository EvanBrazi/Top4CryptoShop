const { MongoClient } = require('mongodb');
require('dotenv').config();

async function test() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    console.log('✅ الاتصال يعمل بنجاح مع الإصدار الجديد!');
    const db = client.db('Top4CryptoShop');
    console.log('🔍 قواعد البيانات المتاحة:', await db.admin().listDatabases());
  } finally {
    await client.close();
  }
}

test().catch(console.error);
