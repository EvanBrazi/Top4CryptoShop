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
const { markNotificationSent, notify } = require('../utils/notifications');

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
        notify({ type: 'newOrder', ...order.toObject() }, 'user', userId);
        await markNotificationSent('Order', order._id);
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
        await markNotificationSent('Order', order._id);
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
        await markNotificationSent('Order', order._id);
        res.json({ status: 'rejected' });
    } catch (err) {
        console.error('❌ خطأ في رفض الطلب:', err);
        res.status(500).json({ error: 'فشل في رفض الطلب' });
    }
});

/**
 * @route GET /api/orders/summary?userId=...
 * @desc جلب ملخص الطلبات لمستخدم معين (إجمالي الدفع والكمية والحالات)
 * @access عام
 */
router.get('/summary', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ error: 'معرف المستخدم مطلوب' });

        const orders = await Order.find({ userId });

        const summary = {
            totalAmount: 0,
            totalQuantity: 0,
            totalAccepted: 0,
            totalPending: 0,
            totalRejected: 0
        };

        orders.forEach(order => {
            summary.totalAmount += parseFloat(order.amount) || 0;
            summary.totalQuantity += parseInt(order.quantity) || 0;

            if (order.status === 'accepted') summary.totalAccepted++;
            else if (order.status === 'pending') summary.totalPending++;
            else if (order.status === 'rejected') summary.totalRejected++;
        });

        summary.totalAmount = parseFloat(summary.totalAmount.toFixed(2));

        res.json(summary);
    } catch (err) {
        console.error('❌ خطأ في جلب ملخص الطلبات:', err);
        res.status(500).json({ error: 'فشل في جلب ملخص الطلبات' });
    }
});

/**
 * @route GET /api/orders/all
 * @desc جلب جميع طلبات الشراء لجميع المستخدمين
 * @access إداري أو داخلي
 */
router.get('/all', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        console.error('❌ خطأ في جلب جميع الطلبات:', err);
        res.status(500).json({ error: 'فشل في جلب جميع الطلبات' });
    }
});

/**
 * @route GET /api/orders/summary/all
 * @desc جلب ملخص الطلبات لجميع المستخدمين
 * @access إداري أو داخلي
 */
router.get('/summary/all', async (req, res) => {
    try {
        const orders = await Order.find();

        const summary = {
            totalAmount: 0,
            totalQuantity: 0,
            totalPending: 0,
            totalProcessing: 0,
            totalCompleted: 0,
            totalCancelled: 0
        };

        orders.forEach(order => {
            summary.totalAmount += parseFloat(order.amount) || 0;
            summary.totalQuantity += parseInt(order.quantity) || 0;

            switch (order.status) {
                case 'pending': summary.totalPending++; break;
                case 'processing': summary.totalProcessing++; break;
                case 'completed': summary.totalCompleted++; break;
                case 'cancelled': summary.totalCancelled++; break;
            }
        });

        summary.totalAmount = parseFloat(summary.totalAmount.toFixed(2));

        res.json(summary);
    } catch (err) {
        console.error('❌ خطأ في جلب ملخص الطلبات:', err);
        res.status(500).json({ error: 'فشل في جلب ملخص الطلبات' });
    }
});

module.exports = router;
