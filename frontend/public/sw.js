/**
 * @file sw.js
 * @description Service Worker لتخزين الأيقونات والصور الأساسية، مع دعم fallback، وتحسين الأداء
 * @version 5.0.0
 * @license MIT
 * @author Evan Brazi
 * @updated 2025-08-22
 */

const CACHE_NAME = 'top4crypto-v5';
const PRECACHE_URLS = [
  '/icons/apps/default.png',
  '/assets/images/logo.png',
  '/assets/images/favicon.ico'
];

// تنظيف الأيقونات المنتهية الصلاحية
async function cleanOldIcons(ttl = 24 * 60 * 60 * 1000) {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const now = Date.now();

  for (const request of keys) {
    const response = await cache.match(request);
    if (!response) continue;
    
    const dateHeader = response.headers.get('X-Timestamp');
    if (dateHeader && now - Number(dateHeader) > ttl) {
      await cache.delete(request);
      console.log(`🧹 حذف أيقونة منتهية الصلاحية: ${request.url}`);
    }
  }
}

// تثبيت الموارد الأساسية مسبقًا
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// تفعيل الخدمة وتنظيف الكاشات القديمة
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => key !== CACHE_NAME && caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => cleanOldIcons())
  );
});

// معالجة طلبات الأيقونات المشفرة
async function handleIconRequest(request) {
  const url = new URL(request.url);
  const cacheKey = url.pathname;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) return cachedResponse;

    // استخراج اسم الأيقونة من المفتاح المشفر
    const encodedName = cacheKey.replace('/cache/', '');
    const iconName = atob(encodedName);
    const iconUrl = `/icons/${iconName}`;
    console.warn('SW: handleIconRequest iconName: ', iconUrl);

    const response = await fetch(iconUrl);
    if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);

    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error('❌ المحتوى ليس صورة');
    }

    // إنشاء نسخة مخصصة من الاستجابة مع توثيق إضافي
    const versionedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'X-Icon-Version': '1.0.0',
        'X-Cache-Source': 'sw',
        'X-Timestamp': Date.now().toString()
      }
    });

    await cache.put(cacheKey, versionedResponse.clone());
    return versionedResponse;
  } catch (error) {
    console.warn('Icon fetch failed, returning default:', error);
    return caches.match('/icons/apps/default.png');
  }
}

// معالجة الطلبات العامة باستراتيجية Network First
async function handleNormalRequest(request) {
  try {
    const response = await fetch(request);

    // تخزين فقط طلبات GET التي تحتوي على صور
    if (request.method === 'GET') {
      const contentType = response.headers.get('Content-Type');
      if (contentType?.startsWith('image/')) {
        const cache = await caches.open(CACHE_NAME);
        const versionedResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            ...Object.fromEntries(response.headers.entries()),
            'X-Timestamp': Date.now().toString()
          }
        });
        await cache.put(request, versionedResponse.clone());
        return versionedResponse;
      }
    }

    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Service unavailable', { status: 503 });
  }
}

// تحديد نوع الطلب ومعالجته
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/cache/')) {
    event.respondWith(handleIconRequest(event.request));
  } else {
    event.respondWith(handleNormalRequest(event.request));
  }
});
