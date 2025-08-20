/**
 * @file appstab.js
 * @class AppsTab
 * @description تبويب التطبيقات باستخدام نظام الأيقونات الموحد
 * @version 8.0.0
 */

import { getIconSystem } from '../core/unified-icon-system.js';

export class AppsTab {
    constructor({ containerId, options = {} }) {
        this.container = document.getElementById(containerId);
        this.iconSystem = getIconSystem({
            basePath: options.iconsBasePath || '/icons/apps/'
        });

        this.config = {
            appsData: options.appsData || [],
            themeColor: options.themeColor || '#6a5acd',
            onCardClick: options.onCardClick || (() => {})
        };

        this.init();
    }

    async init() {
        this.renderSkeleton();
        await this.renderAppsGrid();
        this.setupIntersectionObserver();
    }

    async renderAppsGrid() {
        const grid = document.createElement('div');
        grid.className = 'apps-grid';

        const fragment = document.createDocumentFragment();
        
        for (const app of this.config.appsData) {
            const card = await this.createAppCard(app);
            fragment.appendChild(card);
        }

        grid.appendChild(fragment);
        this.container.innerHTML = '';
        this.container.appendChild(grid);
    }

    async createAppCard(app) {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.innerHTML = `
            <div class="app-icon-container">
                <img class="app-icon" alt="${app.name}" loading="lazy">
            </div>
            <div class="app-name">${app.name}</div>
        `;

        // تحميل الأيقونة باستخدام النظام الموحد
        const iconElement = card.querySelector('.app-icon');
        try {
            const iconUrl = await this.iconSystem.getIcon(app.icon);
            iconElement.src = iconUrl;
        } catch (error) {
            iconElement.src = this.iconSystem._getDefaultIcon();
        }

        card.addEventListener('click', () => this.config.onCardClick(app));
        return card;
    }

    setupIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target.querySelector('.app-icon');
                    if (img && !img.src) {
                        const appId = entry.target.dataset.appId;
                        this.loadIconForCard(entry.target, appId);
                    }
                }
            });
        }, { threshold: 0.1 });

        this.container.querySelectorAll('.app-card').forEach(card => {
            observer.observe(card);
        });
    }

    renderSkeleton() {
        this.container.innerHTML = `
            <div class="skeleton-grid">
                ${Array(12).fill('<div class="skeleton-card"></div>').join('')}
            </div>
        `;
    }
}
