/**
 * socket.js - WebSocket setup for real-time notifications
 * Enables broadcasting messages to connected clients with session validation
 *
 * @author: EVAN BRAZI
 * @version: 1.0.0
 * @lastModified: 2025-08-17
 * @description:
 * - يتحقق من الجلسة قبل قبول الاتصال
 * - يدعم تعريف المستخدم حسب الدور
 * - يرسل إشعارات موجهة حسب نوع الحساب
 * - يعالج الرسائل الواردة ويمنع الاتصالات غير المصرّح بها
 */

const WebSocket = require('ws');

// 🧠 دالة استخراج sessionId من الكوكيز
function extractSessionId(cookies) {
    if (!cookies) return null;
    const match = cookies.match(/sessionId=([^;]+)/);
    return match ? match[1] : null;
}

// 🔐 دالة تحقق من صلاحية الجلسة (مثال باستخدام ذاكرة مؤقتة)
const activeSessions = new Map(); // sessionId => { userId, role }

function isValidAdminSession(sessionId) {
    const session = activeSessions.get(sessionId);
    return session && session.role === 'admin';
}

// 🚀 إعداد WebSocket وربطه بالسيرفر
function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        const cookies = req.headers.cookie;
        const sessionId = extractSessionId(cookies);

        // ✅ تحقق من الجلسة قبل قبول الاتصال
        if (!isValidAdminSession(sessionId)) {
            ws.close(4001, 'Unauthorized session');
            return;
        }

        // 🟢 الاتصال مقبول
        console.log('🔌 WebSocket connection established');

        // تعريف المستخدم عند الاتصال
        const session = activeSessions.get(sessionId);
        ws.userType = session.role;
        ws.userId = session.userId;

        // 📩 استقبال الرسائل من العميل
        ws.on('message', msg => {
            try {
                const data = JSON.parse(msg);
                if (data.type === 'auth') {
                    ws.userType = data.role;
                    ws.userId = data.userId;
                }
            } catch (err) {
                console.error('❌ WebSocket message error:', err);
            }
        });

        // 👋 رسالة ترحيب أولية
        ws.send(JSON.stringify({
            type: 'welcome',
            message: `مرحباً بك في نظام الإشعارات المباشرة يا ${session.userId}`
        }));
    });

    /**
     * broadcast - إرسال إشعار لجميع العملاء أو حسب نوع الحساب
     * @param {Object} data - البيانات المرسلة
     * @param {String|null} targetRole - 'admin' أو 'user' أو null لإرسال للجميع
     */
    function broadcast(data, targetRole = null) {
        const payload = JSON.stringify(data);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                if (!targetRole || client.userType === targetRole) {
                    client.send(payload);
                }
            }
        });
    }

    return { broadcast };
}

module.exports = setupWebSocket;