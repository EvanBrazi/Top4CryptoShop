/**
 * @file orders.js
 * @module routes/orders
 * @description
 *  - إدارة طلبات الشراء: إنشاء طلب جديد وجلب طلبات المستخدم
 *  - يرسل إشعار لحظي إلى الأدمن عند إنشاء الطلب
 *  - يدعم قبول أو رفض الطلب من قبل الأدمن
 *  - يبلغ المستخدم بالرد فورًا عبر WebSocket
 *
 * @author Evan Brazi
 * @version 1.2.0
 * @lastModified 2025-08-31
 */

const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const { verifyToken, checkAdmin } = require('../middlewares/auth');
const { notify } = require('../utils/notifications');

// 🧠 توليد معرف فريد للطلب
function generateOrderId() {
    return 'ord-' + Math.random().toString(36).substr(2, 9);
}

/**
 * @route POST /api/orders
 * @desc إنشاء طلب شراء جديد
 * @access عام (مع تحقق لاحق من المستخدم)
 */
router.post('/', async (req, res) => {
    try {
        const { userId, playerId, quantity, amount, method, service } = req.body;
        console.log('Recive requiets: ', { userId, playerId, quantity, amount, method, service });

        if (!userId || !playerId || !quantity || !amount || !method || !service) {
            return res.status(400).json({ error: 'البيانات غير مكتملة' });
        }
        const orderId = generateOrderId();
        const order = new Order({
            orderId,
            userId,
            playerId,
            quantity,
            amount,
            method,
            service,
            status: 'pending'
        });
        await order.save();
        // 📡 إشعار لحظي للأدمن بوجود طلب جديد
        // في الخادم (orders.js)
        notify({ type: 'newOrder', ...order.toObject() }, 'admin');
        notify({ type: 'userOrder', ...order.toObject() }, 'user', userId);
        res.json({ status: 'success', orderId });
    } catch (err) {
        console.error('❌ خطأ في إنشاء الطلب:', err);
        res.status(500).json({ error: 'فشل في إنشاء الطلب' });
    }
});

/**
 * @route GET /api/orders?userId=...
 * @desc جلب جميع طلبات مستخدم معين
 * @access عام
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.query.userId;

        if (!userId) return res.status(400).json({ error: 'معرف المستخدم مطلوب' });

        const orders = await Order.find({ userId }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        console.error('❌ خطأ في جلب الطلبات:', err);
        res.status(500).json({ error: 'فشل في جلب الطلبات' });
    }
});

/**
 * @route GET /api/orders/admin
 * @desc جلب الطلبات المعلقة للأدمن
 * @access خاص بالأدمن
 */
router.get('/admin', verifyToken, checkAdmin, async (req, res) => {
    try {
        const orders = await Order.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: 'فشل في جلب طلبات الأدمن' });
    }
});

/**
 * @route PUT /api/orders/:id/accept
 * @desc قبول طلب شراء من قبل الأدمن
 * @access خاص بالأدمن
 */
router.put('/:id/accept', verifyToken, checkAdmin, async (req, res) => {
    try {
        const order = await Order.findOneAndUpdate(
            { orderId: req.params.id },
            { status: 'accepted' },
            { new: true }
        );

        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

        // 📡 إشعار لحظي للمستخدم بقبول الطلب
        notify({ type: 'orderAccepted', ...order.toObject() }, 'user', order.userId);
        res.json({ status: 'accepted' });
    } catch (err) {
        console.error('❌ خطأ في قبول الطلب:', err);
        res.status(500).json({ error: 'فشل في قبول الطلب' });
    }
});

/**
 * @route PUT /api/orders/:id/reject
 * @desc رفض طلب شراء من قبل الأدمن
 * @access خاص بالأدمن
 */
router.put('/:id/reject', verifyToken, checkAdmin, async (req, res) => {
    try {
        const order = await Order.findOneAndUpdate(
            { orderId: req.params.id },
            { status: 'rejected' },
            { new: true }
        );

        if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

        // 📡 إشعار لحظي للمستخدم برفض الطلب
        notify({ type: 'orderRejected', ...order.toObject() }, 'user', order.userId);
        res.json({ status: 'rejected' });
    } catch (err) {
        console.error('❌ خطأ في رفض الطلب:', err);
        res.status(500).json({ error: 'فشل في رفض الطلب' });
    }
});

module.exports = router;
