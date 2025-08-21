/**
 * @file sw.js
 * @description Service Worker لتخزين الأيقونات والصور الأساسية + مراقبة الأداء والأخطاء
 * @version 4.2.0
 * @license MIT
 */
const CACHE_NAME = 'top4crypto-v3';
const PRECACHE_URLS = [
  '/icons/apps/default.png',
  '/assets/images/logo.png',
  '/assets/images/favicon.ico'
];

// التثبيت: تخزين الموارد الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// التفعيل: تنظيف الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => key !== CACHE_NAME && caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// 📤 إرسال تقرير إلى لوحة التحكم
function reportToAdmin(data) {
  // إرسال داخلي للصفحة (اختياري)
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'SW_REPORT', payload: data });
    });
  });
  // إرسال خارجي إلى Web Service
  fetch('http://localhost:10000/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

async function handleIconRequest(request) {
  const iconUrl = request.url;
  try {
    // محاولة الحصول من الكاش أولاً
    const cached = await caches.match(request);
    if (cached) return cached;
    // التحقق من أن الرابط صالح
    if (!iconUrl || typeof iconUrl !== 'string') {
      throw new Error('Invalid icon URL from iconSystem');
    }
    const response = await fetch(iconUrl);
    // إذا لم تكن الاستجابة ناجحة، استخدم fallback
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    // تخزين في الكاش
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());

    return response;
  } catch (error) {
    console.warn('Icon fetch failed, returning default:', error);
    return caches.match('/icons/apps/default.png');
  }
}

// معالجة الطلبات العادية
async function handleNormalRequest(request) {
  try {
    // استراتيجية Network First مع fallback إلى Cache
    const response = await fetch(request);
    // ✅ فقط تخزين طلبات GET
    if (request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response('Service unavailable', { status: 503 });
  }
}

// معالجة الطلبات
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  //console.log('🔍 Blob:', blob);
  console.trace('📍 تتبع مصدر الـ Blob',event);
  // معالجة طلبات الأيقونات بشكل خاص
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(handleIconRequest(event.request));
  } else {
    event.respondWith(handleNormalRequest(event.request));
  }
});

// 📦 مراقبة التخزين كل 30 ثانية (اختياري ويمكن تفعيله من الصفحة)
setInterval(() => {
  navigator.storage?.estimate?.().then(({ usage, quota }) => {
    reportToAdmin({
      type: 'storage',
      usage: (usage / 1024 / 1024).toFixed(2) + ' MB',
      quota: (quota / 1024 / 1024).toFixed(2) + ' MB'
    });
  });
}, 30000);
