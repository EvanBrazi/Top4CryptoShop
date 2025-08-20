/**
 * @file config.js
 * @description تكوين موحد للتطبيق
 * @version 1.0.0
 */

export const APP_CONFIG = {
    // إعدادات النظام الموحد للأيقونات
    ICON_SYSTEM: {
        BASE_PATH: '/icons/apps/',
        DEFAULT_ICON: 'default.png',
        MAX_CACHE_SIZE: 50 * 1024 * 1024, // 50MB
        MAX_CONCURRENT_LOADS: 4,
        TTL: 24 * 60 * 60 * 1000 // 24 hours
    },

    // إعدادات التخزين المؤقت
    CACHE: {
        NAME: 'top4crypto-v3',
        VERSION: '3.0.0',
        PRECACHE_URLS: [
            '/icons/apps/default.png',
            '/assets/images/logo.png',
            '/assets/images/favicon.ico'
        ]
    },

    // إعدادات API
    API: {
        BASE_URL: '/api',
        ENDPOINTS: {
            APPS: '/apps',
            ESSENTIAL: '/essential',
            ICONS: '/icons-list'
        },
        TIMEOUT: 10000,
        RETRY_ATTEMPTS: 2
    },

    // إعدادات الواجهة
    UI: {
        THEME_COLOR: '#6a5acd',
        CARD_SIZE: 120,
        ANIMATION_DURATION: 300
    }
};

export default APP_CONFIG;
