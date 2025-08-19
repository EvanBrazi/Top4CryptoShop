/**
 * @file sw.js
 * @description Service Worker لتخزين الأيقونات والصور الأساسية + مراقبة الأداء والأخطاء
 * @version 4.2.0
 * @license MIT
 */

import { IconManager } from './assets/js/core/iconmanager.js';

const CACHE_NAME = 'static-cache-v2';
const ICONS_TO_CACHE = [
  '/icons/apps/default.png',
  '/assets/images/logo.png',
  '/assets/images/favicon.ico'
];

const iconManager = new IconManager({
  maxItems: 500,
  maxConcurrent: 4,
  defaultIconUrl: '/icons/apps/default.png'
});

// 📦 عند التثبيت: تخزين الموارد الأساسية
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ICONS_TO_CACHE))
  );
});

// 🔄 عند التفعيل: حذف الكاش القديم
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.map(name => name !== CACHE_NAME && caches.delete(name)))
    )
  );
});

// 🧠 تخمين نوع الصورة حسب الامتداد
function guessMimeType(path) {
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

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

// 🛰️ عند الطلب: مراقبة وتحليل الأداء
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const start = performance.now();

  // 🧩 التعامل مع ملفات /assets
  if (url.pathname.startsWith('/assets')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          const duration = performance.now() - start;
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));

          reportToAdmin({
            url: url.href,
            status: res.status,
            duration: duration.toFixed(2),
            size: res.headers.get('Content-Length') || 'unknown'
          });

          return res;
        }).catch(error => {
          reportToAdmin({
            url: url.href,
            error: error.message,
            type: 'fetch-failure'
          });
          throw error;
        })
      )
    );

    // 🧩 التعامل مع الأيقونات
  } else if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        try {
          const objectUrl = await iconManager.getIcon(event.request.url);
          const blobResponse = await fetch(objectUrl);
          const blob = await blobResponse.blob();
          const contentType = blobResponse.headers.get('Content-Type') || guessMimeType(url.pathname);
          const duration = performance.now() - start;

          reportToAdmin({
            url: url.href,
            status: blobResponse.status,
            duration: duration.toFixed(2),
            size: blob.size + ' bytes'
          });

          return new Response(blob, {
            status: 200,
            headers: { 'Content-Type': contentType }
          });
        } catch (error) {
          console.warn(`Fallback icon used: ${url.pathname}`);
          reportToAdmin({
            url: url.href,
            error: error.message,
            type: 'icon-failure'
          });
          return caches.match('/icons/apps/default.png');
        }
      })()
    );

    // 🧩 الطلبات الأخرى
  } else {
    event.respondWith(
      fetch(event.request).then(res => {
        const duration = performance.now() - start;
        reportToAdmin({
          url: url.href,
          status: res.status,
          duration: duration.toFixed(2)
        });
        return res;
      }).catch(error => {
        reportToAdmin({
          url: url.href,
          error: error.message,
          type: 'general-failure'
        });
        return new Response('Service Worker fetch error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
    );
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
