/**
 * @file purchaseDialog.js
 * @class PurchaseDialog
 * @description نظام متكامل لإدارة عمليات الشراء عبر مربعات حوار تفاعلية
 * @version 1.0.0
 * @license MIT
 */

export class PurchaseDialog {
  constructor(options = {}) {
    this.options = {
      themeColor: options.themeColor || '#6a5acd',
      onPurchase: options.onPurchase || (() => {})
    };

    this.dialogElement = null;
    this.overlayElement = null;
    this.currentApp = null;

    this._initStyles();
  }

  _initStyles() {
    const styleId = 'purchase-dialog-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .purchase-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        -webkit-backdrop-filter: blur(3px);
        backdrop-filter: blur(3px);
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
      }

      .purchase-dialog-overlay.active {
        opacity: 1;
        visibility: visible;
      }

      .purchase-dialog {
        background: white;
        border-radius: 12px;
        width: 90%;
        max-width: 350px;
        padding: 20px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        transform: translateY(20px);
        transition: transform 0.3s ease;
        direction: rtl;
      }

      .purchase-dialog-overlay.active .purchase-dialog {
        transform: translateY(0);
      }

      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
      }

      .dialog-close {
        background: none;
        border: none;
        font-size: 1.3rem;
        cursor: pointer;
        color: #999;
      }

      .dialog-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 15px;
        display: block;
        object-fit: contain;
      }

      .dialog-input-group {
        margin-bottom: 15px;
      }

      .dialog-input-group label {
        display: block;
        margin-bottom: 6px;
        font-size: 0.9rem;
        color: #555;
      }

      .dialog-input-group input {
        width: 100%;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 5px;
        font-size: 1rem;
      }

      .dialog-actions {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-top: 20px;
      }

      .dialog-btn {
        padding: 10px 15px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 1rem;
        flex: 1;
        transition: all 0.2s;
      }

      .dialog-btn-buy {
        background: ${this.options.themeColor};
        color: white;
      }

      .dialog-btn-cancel {
        background: #f0f0f0;
        color: #333;
      }
    `;
    document.head.appendChild(style);
  }

  open(app) {
    this.currentApp = app;
    this._createDialog();
    this._showDialog();
  }

  close() {
    if (this.overlayElement) {
      this.overlayElement.classList.remove('active');
      setTimeout(() => {
        if (this.overlayElement && this.overlayElement.parentNode) {
          this.overlayElement.parentNode.removeChild(this.overlayElement);
        }
      }, 300);
    }
  }

  _createDialog() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'purchase-dialog-overlay';

    this.dialogElement = document.createElement('div');
    this.dialogElement.className = 'purchase-dialog';
    this.dialogElement.innerHTML = this._getDialogHTML();

    this.overlayElement.appendChild(this.dialogElement);
    document.body.appendChild(this.overlayElement);

    this._setupEventListeners();
  }

  _showDialog() {
    setTimeout(() => {
      this.overlayElement.classList.add('active');
    }, 10);
  }

  _getDialogHTML() {
    return `
      <div class="dialog-header">
        <h3>${this.currentApp.name}</h3>
        <button class="dialog-close">&times;</button>
      </div>
      <img src="${this.options.iconsBasePath || '/icons/apps/'}${this.currentApp.icon || 'default.png'}" 
           alt="${this.currentApp.name}" 
           class="dialog-icon"
           onerror="this.src='${this.options.iconsBasePath || '/icons/apps/'}default.png'">
      <div class="dialog-price">السعر: $${this.currentApp.price.toFixed(2)}</div>
      
      <div class="dialog-input-group">
        <label for="quantity">الكمية:</label>
        <input type="number" id="quantity" min="1" value="1" class="quantity-input">
      </div>
      
      <div class="dialog-input-group">
        <label for="user-id">معرف المستخدم:</label>
        <input type="text" id="user-id" placeholder="أدخل معرفك" class="user-id-input">
      </div>
      
      <div class="dialog-total">المجموع: $${this.currentApp.price.toFixed(2)}</div>
      
      <div class="dialog-actions">
        <button class="dialog-btn dialog-btn-cancel">إلغاء</button>
        <button class="dialog-btn dialog-btn-buy">شراء</button>
      </div>
    `;
  }

  _setupEventListeners() {
    this.overlayElement.querySelector('.dialog-close').addEventListener('click', () => this.close());
    this.overlayElement.querySelector('.dialog-btn-cancel').addEventListener('click', () => this.close());

    this.overlayElement.querySelector('.dialog-btn-buy').addEventListener('click', () => {
      const quantity = parseInt(this.overlayElement.querySelector('.quantity-input').value) || 1;
      const userId = this.overlayElement.querySelector('.user-id-input').value.trim();

      if (!userId) {
        alert('الرجاء إدخال معرف المستخدم');
        return;
      }

      this.options.onPurchase(this.currentApp, quantity, userId);
    });

    this.overlayElement.querySelector('.quantity-input').addEventListener('input', (e) => {
      const quantity = parseInt(e.target.value) || 1;
      const total = (this.currentApp.price * quantity).toFixed(2);
      this.overlayElement.querySelector('.dialog-total').textContent = `المجموع: $${total}`;
    });
  }

  destroy() {
    this.close();
    const style = document.getElementById('purchase-dialog-styles');
    if (style) style.remove();
  }
}
