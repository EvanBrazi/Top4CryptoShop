/**
 * @file sw.js
 * Service Worker لتخزين الأيقونات والصور الأساسية في الكاش
 */

const { iconManager } = require("./core/iconmanager.js");

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
  if (event.request.url.includes('/assets')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          const cacheCopy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cacheCopy));
          // إذا وُجد الملف في الكاش، أعده، وإلا حمّله من الشبكة
          return res;
        })
      )
    );
  } else if (event.request.url.includes('/icons/')) {
    event.respondWith(iconManager.getIcon(event.request.url));
  } else {
    event.respondWith(fetch(event.request));
  }
});