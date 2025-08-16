/**
 * socket.js - WebSocket setup for real-time notifications
 * Enables broadcasting messages to connected clients
 *
 * @author: Evan Brazi
 */

const WebSocket = require('ws');

function setupWebSocket(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        const cookies = req.headers.cookie;
        const sessionId = extractSessionId(cookies); // تحتاج دالة استخراج

        // تحقق من الجلسة في قاعدة البيانات أو الذاكرة
        if (!isValidAdminSession(sessionId)) {
            ws.close();
            return;
        }

        // تابع الاتصال...
        console.log('🔌 WebSocket connection established');

        // تعريف المستخدم عند الاتصال
        ws.userType = null;
        ws.userId = null;

        ws.on('message', msg => {
            try {
                const data = JSON.parse(msg);
                if (data.type === 'auth') {
                    ws.userType = data.role; // 'admin' أو 'user'
                    ws.userId = data.userId;
                }
            } catch (err) {
                console.error('❌ WebSocket message error:', err);
            }
        });

        ws.send(JSON.stringify({
            type: 'welcome',
            message: 'مرحباً بك في نظام الإشعارات المباشرة يا ايفان'
        }));
    });

    // دالة إرسال إشعار لجميع العملاء أو حسب نوع الحساب
    function broadcast(data, targetRole = null) {
        const payload = JSON.stringify(data);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                if (!targetRole || client.userType === targetRole) {
                    client.send(payload);
                }
            }
        });
    };

    return { broadcast };
}

module.exports = setupWebSocket;