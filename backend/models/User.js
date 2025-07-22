const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs'); // إلى
require('dotenv').config();

const SALT_ROUNDS = 10;

class User {
  constructor() {
    this.client = new MongoClient(process.env.MONGO_URI);
    this.collection = null;
  }

  async connect() {
    await this.client.connect();
    this.collection = this.client.db('Top4CryptoShop').collection('users');
    await this._createIndexes();
  }

  async _createIndexes() {
    await this.collection.createIndex({ email: 1 }, { unique: true });
  }

  async register(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);
    const result = await this.collection.insertOne({
      ...userData,
      password: hashedPassword,
      createdAt: new Date()
    });
    return result.insertedId;
  }

  async login(email, password) {
    const user = await this.collection.findOne({ email });
    if (!user) throw new Error('المستخدم غير موجود');
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('كلمة المرور غير صحيحة');
    
    return { userId: user._id, email: user.email };
  }
}

module.exports = new User();
