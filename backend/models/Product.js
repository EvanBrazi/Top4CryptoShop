const { MongoClient } = require('mongodb');
require('dotenv').config();

// استخدم class expression بدلاً من declaration لتجنب التكرار
const Product = class {
  constructor() {
    this.client = new MongoClient(process.env.MONGO_URI);
    this.collection = null;
  }

  async connect() {
    if (!this.collection) {
      await this.client.connect();
      this.collection = this.client.db('Top4CryptoShop').collection('products');
    }
    return this;
  }

  async getAll() {
    await this.connect();
    return await this.collection.find().toArray();
  }
};

// استخدم module.exports مباشرة
module.exports = new Product();
