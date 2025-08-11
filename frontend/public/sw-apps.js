/**
 * Service Worker - Caching Icons
 * يقوم بتخزين الأيقونات في الكاش عند التثبيت، ويخدمها لاحقًا من الكاش
 */

const CACHE_NAME = 'apps-cache-v5';
const ICONS_TO_CACHE = [
  '/icons/apps/default.png',
  '/icons/apps/icon1.png',
  '/icons/apps/icon2.png'
  // أضف أي أيقونات شائعة هنا
];

// تثبيت Service Worker وتخزين الأيقونات الأساسية
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ICONS_TO_CACHE.map(url =>
          cache.add(url).catch(err => console.warn(`❌ فشل تخزين ${url}`, err))
        )
      );
    })
  );
});

// جلب الموارد من الكاش أو الشبكة وتحديث الكاش عند الحاجة
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      if (response) return response;

      return fetch(e.request).then(fetchResponse => {
        // تخزين الأيقونات الجديدة فقط
        if (e.request.url.includes('/icons/apps/')) {
          const cacheCopy = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, cacheCopy);
          });
        }
        return fetchResponse;
      }).catch(err => {
        console.error(`❌ فشل تحميل ${e.request.url}`, err);
        return new Response('Network error', { status: 408 });
      });
    })
  );
});

// حذف الكاش القديم عند التحديث
self.addEventListener('activate', (e) => {
  e.waitUntil(
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