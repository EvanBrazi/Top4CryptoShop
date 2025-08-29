// ./backend/routes/orders.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

function generateOrderId() {
    return 'ord-' + Math.random().toString(36).substr(2, 9);
}

// إنشاء طلب جديد
router.post('/', async (req, res) => {
    try {
        const { userId, amount, method, service } = req.body;
        const orderId = generateOrderId();

        const order = new Order({
            orderId,
            userId,
            amount,
            method,
            service
        });

        await order.save();
        res.json({ status: 'success', orderId });
    } catch (err) {
        console.error('❌ خطأ في إنشاء الطلب:', err);
        res.status(500).json({ error: 'فشل في إنشاء الطلب' });
    }
});

// جلب الطلبات حسب المستخدم
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;
        const userOrders = await Order.find({ userId }).sort({ createdAt: -1 });
        res.json(userOrders);
    } catch (err) {
        console.error('❌ خطأ في جلب الطلبات:', err);
        res.status(500).json({ error: 'فشل في جلب الطلبات' });
    }
});

module.exports = router;
