/**
 * @file iconmanager.js
 * @class IconManager
 * @description نظام متكامل لإدارة تحميل الأيقونات مع التحكم في الطلبات المتزامنة
 * @version 2.0.0
 * @license MIT
 */

import LRUCache from 'lru-cache';

export class IconManager {
  constructor(options = {}) {
    this.cache = new LRUCache({
      max: options.cacheSize || 30,
      maxSize: 30 * 1024 * 1024,
      sizeCalculation: (value, key) => {
        return value.size || 1024;
      },
      ttl: 24 * 60 * 60 * 1000,
      updateAgeOnGet: true,
      ttlRefreshOnGet: true
    });
  }

  async getIcon(url) {
    //
    if (this.cache.has(url)) return this.cache.get(url);
    //
    const iconData = await this._fetchIcon(url);
    //
    this.cache.set(url, iconData);
    return iconData;
  }

  _fetchIcon(url) {
    return new Promise((resolve, reject) => {
      fetch(url).then(res => res.blob()).then(blob => {
        resolve({
          url: URL.createObjectURL(blob),
          size: blob.size,
          lastUsed: Date.now()
        });
      }).catch(reject);
    });
  }

  preloadIcons(iconUrls) {
    return Promise.all(
      iconUrls.map(url => this.getIcon(url))
    );
  }
}
