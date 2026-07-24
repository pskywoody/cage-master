/**
 * MenuSheet - 统一菜单底部弹出层
 * 集中展示：章节选择 / 成就 / 图鉴 / 设置 等入口
 * 符合 Bottom Sheet 交互范式：底部上滑、圆角、手柄、下拉关闭
 *
 * 使用方式：
 *   const menu = new MenuSheet({ onAction: (action) => {} });
 *   menu.show();
 *   menu.hide();
 */
(function(global) {
  'use strict';

  class MenuSheet {
    constructor(options = {}) {
      this.onAction = options.onAction || (() => {});
      this._visible = false;
      this._overlay = null;
      this._panel = null;
      this._dragStartY = 0;
      this._dragCurrentY = 0;
      this._isDragging = false;

      this._init();
    }

    _init() {
      // 注入样式
      this._injectStyles();

      // 创建遮罩
      this._overlay = document.createElement('div');
      this._overlay.id = 'menu-sheet-overlay';
      this._overlay.className = 'menu-sheet-overlay';
      this._overlay.addEventListener('click', () => this.hide());

      // 创建面板
      this._panel = document.createElement('div');
      this._panel.id = 'menu-sheet';
      this._panel.className = 'menu-sheet';

      // 手柄
      const handle = document.createElement('div');
      handle.className = 'menu-sheet-handle';
      this._panel.appendChild(handle);

      // 头部
      const header = document.createElement('div');
      header.className = 'menu-sheet-header';
      header.innerHTML = '<span class="menu-sheet-title">菜单</span>';
      this._panel.appendChild(header);

      // 菜单项网格
      const grid = document.createElement('div');
      grid.className = 'menu-sheet-grid';

      const items = [
        { icon: '📚', label: '章节选择', action: 'chapter', desc: '选择关卡' },
        { icon: '🏆', label: '成就', action: 'achievement', desc: '收集进度' },
        { icon: '📖', label: '图鉴', action: 'gallery', desc: '角色剧情' },
        { icon: '⚙', label: '设置', action: 'settings', desc: '偏好设置' },
      ];

      items.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'menu-sheet-item';
        btn.dataset.action = item.action;
        btn.innerHTML = `
          <span class="menu-sheet-item-icon">${item.icon}</span>
          <span class="menu-sheet-item-label">${item.label}</span>
          <span class="menu-sheet-item-desc">${item.desc}</span>
        `;
        btn.addEventListener('click', () => {
          this._handleAction(item.action);
        });
        grid.appendChild(btn);
      });

      this._panel.appendChild(grid);

      // 底部取消按钮
      const footer = document.createElement('div');
      footer.className = 'menu-sheet-footer';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'menu-sheet-cancel';
      cancelBtn.textContent = '取消';
      cancelBtn.addEventListener('click', () => this.hide());
      footer.appendChild(cancelBtn);
      this._panel.appendChild(footer);

      // 拖拽关闭
      this._setupDrag(handle);
      this._setupDrag(this._panel);

      // ESC 关闭
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._visible) {
          e.stopPropagation();
          this.hide();
        }
      });

      document.body.appendChild(this._overlay);
      document.body.appendChild(this._panel);
    }

    _injectStyles() {
      if (document.getElementById('menu-sheet-styles')) return;
      const style = document.createElement('style');
      style.id = 'menu-sheet-styles';
      style.textContent = `
        .menu-sheet-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 25000;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .menu-sheet-overlay.show {
          opacity: 1;
          visibility: visible;
        }

        .menu-sheet {
          position: fixed;
          left: 50%;
          bottom: 0;
          transform: translateX(-50%) translateY(100%);
          width: 100%;
          max-width: 480px;
          max-height: 80vh;
          background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
          border-radius: 20px 20px 0 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-bottom: none;
          z-index: 25001;
          display: flex;
          flex-direction: column;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
          touch-action: none;
        }
        .menu-sheet.show {
          transform: translateX(-50%) translateY(0);
        }

        .menu-sheet-handle {
          width: 36px;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          margin: 8px auto 4px;
          flex-shrink: 0;
          cursor: grab;
        }
        .menu-sheet-handle:active {
          cursor: grabbing;
        }

        .menu-sheet-header {
          padding: 4px 20px 12px;
          flex-shrink: 0;
          text-align: center;
        }
        .menu-sheet-title {
          font-size: 15px;
          font-weight: 600;
          color: #e2e8f0;
        }

        .menu-sheet-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          padding: 0 16px 8px;
          overflow-y: auto;
          flex: 1;
        }

        .menu-sheet-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 18px 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          color: #e2e8f0;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
          min-height: 90px;
        }
        .menu-sheet-item:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.12);
          transform: translateY(-1px);
        }
        .menu-sheet-item:active {
          transform: translateY(0);
          background: rgba(255, 255, 255, 0.06);
        }

        .menu-sheet-item-icon {
          font-size: 26px;
          line-height: 1;
        }
        .menu-sheet-item-label {
          font-size: 14px;
          font-weight: 600;
        }
        .menu-sheet-item-desc {
          font-size: 11px;
          color: #64748b;
        }

        .menu-sheet-footer {
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
          flex-shrink: 0;
        }
        .menu-sheet-cancel {
          width: 100%;
          height: 44px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #94a3b8;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
        }
        .menu-sheet-cancel:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
        }
        .menu-sheet-cancel:active {
          background: rgba(255, 255, 255, 0.06);
        }

        /* 横屏适配 */
        @media (orientation: landscape) and (max-height: 520px) {
          .menu-sheet {
            max-width: 360px;
          }
          .menu-sheet-item {
            min-height: 70px;
            padding: 12px 8px;
          }
          .menu-sheet-item-icon {
            font-size: 22px;
          }
        }
      `;
      document.head.appendChild(style);
    }

    _setupDrag(element) {
      const startDrag = (e) => {
        // 只在垂直方向开始拖拽
        this._isDragging = true;
        this._dragStartY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        this._dragCurrentY = this._dragStartY;
        this._panel.style.transition = 'none';
        this._overlay.style.transition = 'none';
        e.preventDefault();
      };

      const moveDrag = (e) => {
        if (!this._isDragging) return;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const deltaY = clientY - this._dragStartY;
        this._dragCurrentY = clientY;

        if (deltaY > 0) {
          // 向下拖拽（带阻尼）
          const damped = deltaY * 0.8;
          this._panel.style.transform = `translateX(-50%) translateY(${damped}px)`;
          // 遮罩透明度联动
          const progress = Math.min(deltaY / 200, 1);
          this._overlay.style.opacity = 1 - progress * 0.6;
        }
        e.preventDefault();
      };

      const endDrag = (e) => {
        if (!this._isDragging) return;
        this._isDragging = false;
        this._panel.style.transition = '';
        this._overlay.style.transition = '';

        const deltaY = this._dragCurrentY - this._dragStartY;
        if (deltaY > 60) {
          // 下拉超过阈值，关闭
          this.hide();
        } else {
          // 回弹
          this._panel.style.transform = '';
          this._overlay.style.opacity = '';
        }
      };

      element.addEventListener('touchstart', startDrag, { passive: false });
      element.addEventListener('touchmove', moveDrag, { passive: false });
      element.addEventListener('touchend', endDrag);
      element.addEventListener('mousedown', startDrag);
      document.addEventListener('mousemove', moveDrag);
      document.addEventListener('mouseup', endDrag);
    }

    _handleAction(action) {
      this.hide();
      // 延迟一点，等关闭动画开始后再触发
      setTimeout(() => {
        this.onAction(action);
      }, 150);
    }

    show() {
      if (this._visible) return;
      this._visible = true;
      this._overlay.classList.add('show');
      // 强制重绘
      this._panel.offsetHeight;
      this._panel.classList.add('show');
    }

    hide() {
      if (!this._visible) return;
      this._visible = false;
      this._overlay.classList.remove('show');
      this._panel.classList.remove('show');
    }

    toggle() {
      if (this._visible) {
        this.hide();
      } else {
        this.show();
      }
    }

    isVisible() {
      return this._visible;
    }
  }

  global.MenuSheet = MenuSheet;

})(typeof window !== 'undefined' ? window : this);
