/**
 * @file sw.js
 * @description Service Worker لتخزين الأيقونات والصور الأساسية في الكاش
 * @version 4.1.0
 * @license MIT
 */

import { IconManager } from './core/iconmanager.js';

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

// 📦 عند التثبيت
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ICONS_TO_CACHE))
  );
});

// 🔄 عند التفعيل
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.map(name => name !== CACHE_NAME && caches.delete(name)))
    )
  );
});

// 🧠 تخمين نوع الصورة
function guessMimeType(path) {
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

// 🛰️ عند الطلب
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/assets')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return res;
        })
      )
    );
  } else if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        try {
          const objectUrl = await iconManager.getIcon(event.request.url);
          const blobResponse = await fetch(objectUrl);
          const blob = await blobResponse.blob();
          const contentType = blobResponse.headers.get('Content-Type') || guessMimeType(url.pathname);

          return new Response(blob, {
            status: 200,
            headers: { 'Content-Type': contentType }
          });
        } catch (error) {
          console.warn(`Fallback icon used: ${url.pathname}`);
          return caches.match('/icons/apps/default.png');
        }
      })()
    );
  } else {
    event.respondWith(fetch(event.request));
  }
});
