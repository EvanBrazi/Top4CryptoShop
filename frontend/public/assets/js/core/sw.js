/**
 * @file sw.js
 * @description Service Worker مبسط مع التركيز على التخزين المؤقت للأيقونات
 * @version 3.0.0
 */

import { getIconSystem } from './assets/js/core/unified-icon-system.js';

const CACHE_NAME = 'top4crypto-v3';
const PRECACHE_URLS = [
    '/icons/apps/default.png',
    '/assets/images/logo.png',
    '/assets/images/favicon.ico'
];

const iconSystem = getIconSystem();

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

// معالجة الطلبات
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // معالجة طلبات الأيقونات بشكل خاص
    if (url.pathname.startsWith('/icons/')) {
        event.respondWith(this.handleIconRequest(event.request));
    } else {
        event.respondWith(this.handleNormalRequest(event.request));
    }
});

// معالجة طلبات الأيقونات
async function handleIconRequest(request) {
    const iconUrl = request.url;
    
    try {
        // محاولة الحصول من الكاش أولاً
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }

        // استخدام نظام الأيقونات الموحد
        const objectUrl = await iconSystem.getIcon(iconUrl);
        const response = await fetch(objectUrl);
        
        // تخزين في كاش المتصفح
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
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        return new Response('Service unavailable', { status: 503 });
    }
}
