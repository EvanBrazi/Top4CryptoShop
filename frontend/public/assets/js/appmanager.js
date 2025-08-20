/**
 * @file appmanager.js
 * @class AppManager
 * @description مدير التطبيقات المبسط مع النظام الموحد
 * @version 6.0.0
 */

import { HomeTab } from "./tabs/hometab.js";
import { AppsTab } from "./tabs/appstab.js";
import { getIconSystem } from './core/unified-icon-system.js';

export class AppManager {
    constructor(taberInstance, config = {}) {
        this.taber = taberInstance;
        this.iconSystem = getIconSystem(config.iconSystemOptions);
        
        this.initComponents();
    }

    async initComponents() {
        // تهيئة النظام الموحد أولاً
        await this.preloadEssentialIcons();

        // ثم تهيئة التبويبات
        this.initTabs();
    }

    async preloadEssentialIcons() {
        const essentialIcons = [
            'default.png',
            'chat_saya.png',
            'com_taka_vhgyk.png'
        ];
        
        await this.iconSystem.preloadIcons(essentialIcons);
    }

    initTabs() {
        this.tabs = {
            home: new HomeTab({
                taber: this.taber,
                containerId: 'home-tab-cards-container'
            }),
            apps: new AppsTab({
                containerId: 'apps-tab-container',
                options: {
                    iconsBasePath: '/icons/apps/',
                    onCardClick: (app) => this.handleAppClick(app)
                }
            })
        };
    }

    handleAppClick(app) {
        // معالجة النقر على التطبيق
        console.log('App clicked:', app.name);
    }

    destroy() {
        // تنظيف الموارد
        this.iconSystem.clearCache();
    }
}
