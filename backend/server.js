const express = require('express');
const User = require('./models/User');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
  try {
    const userId = await User.register(req.body);
    res.status(201).json({ success: true, userId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.login(email, password);
    
    const token = jwt.sign(
      { userId: user.userId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({ token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ نظام المستخدمين يعمل على http://localhost:${PORT}`);
});
