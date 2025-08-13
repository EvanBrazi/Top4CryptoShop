/**
 * @file sw.js
 * Service Worker لتخزين الأيقونات والصور الأساسية في الكاش
 */

const CACHE_NAME = 'static-cache-v1';
const ICONS_TO_CACHE = [
  '/icons/apps/default.png',
  '/assets/images/logo.png',
  '/assets/images/favicon.ico'
];

// 📦 عند التثبيت: خزّن الملفات الأساسية
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ICONS_TO_CACHE);
    })
  );
});

// 🔄 عند الطلب: أعد الملفات من الكاش إن وجدت
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // إذا وُجد الملف في الكاش، أعده، وإلا حمّله من الشبكة
      return response || fetch(event.request);
    })
  );
});