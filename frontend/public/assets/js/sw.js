/**
 * @file sw.js
 * Service Worker لتخزين الأيقونات والصور الأساسية في الكاش
 */

import { IconManager } from './core/iconmanager.js';

const CACHE_NAME = 'static-cache-v2';
const ICONS_TO_CACHE = [
  '/icons/apps/default.png',
  '/assets/images/logo.png',
  '/assets/images/favicon.ico'
];

// تهيئة IconManager
const iconManager = new IconManager({
  maxItems: 100,
  maxConcurrent: 4,
  defaultIconUrl: '/icons/apps/default.png'
});

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
  const url = new URL(event.request.url);
  
  // معالجة طلبات الأصول
  if (url.pathname.startsWith('/assets')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          const cacheCopy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cacheCopy));
          return res;
        })
      )
    );
  } 
  // معالجة طلبات الأيقونات
  else if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        try {
          const objectUrl = await iconManager.getIcon(event.request.url);
          return Response.redirect(objectUrl, 307);
        } catch (error) {
          return caches.match('/icons/apps/default.png');
        }
      })()
    );
  } 
  // معالجة الطلبات الأخرى
  else {
    event.respondWith(fetch(event.request));
  }
});

// تنظيف الكاش القديم عند التفعيل
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});
