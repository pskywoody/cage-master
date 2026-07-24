/**
 * ============================================================
 *  GalleryPanel - 剧情图鉴面板
 * ============================================================
 *
 *  底部弹窗（Bottom Sheet）面板，包含三个 Tab：
 *    - 角色图鉴：已解锁角色列表 + 详情（立绘/表情）
 *    - 剧情回顾：已通关关卡的剧情回放
 *    - CG/背景图鉴：已见过的背景图收集
 *
 *  数据存储：
 *    - 角色解锁：localStorage 的 progress.galleryUnlock.characters
 *    - 剧情已读：story-engine 的 READ_STORAGE_KEY
 *    - 背景解锁：localStorage 的 progress.galleryUnlock.backgrounds
 *
 *  依赖：
 *    - localStorage（持久化存储）
 *    - StoryEngine（剧情回放，可选）
 *    - chapters.json 数据（角色/关卡信息）
 *
 *  用法：
 *    const gallery = new GalleryPanel(options);
 *    gallery.show();
 *    gallery.hide();
 *    gallery.toggle();
 *    gallery.unlockCharacter(charId);
 *    gallery.markSceneRead(chapterId, levelId, sceneType);
 *    gallery.refresh();
 *
 * ============================================================
 */

;(function(global) {
  'use strict';

  const PROGRESS_KEY = 'cagedcipher_progress';
  const STORY_READ_KEY = 'cagedcipher_story_read';

  // Tab 定义
  const TABS = [
    { id: 'characters', name: '角色', icon: '👤' },
    { id: 'story', name: '剧情', icon: '📖' },
    { id: 'cg', name: 'CG', icon: '🖼' },
  ];

  // 角色基础定义（从 chapters.json 读取，这里做备用）
  const DEFAULT_CHARACTERS = {
    cagekeeper: {
      id: 'cagekeeper',
      name: '守笼人',
      nameEn: 'Cagekeeper',
      description: '数字档案馆的守护者，沉稳寡言，精通所有笼锁规则。',
      portraits: {
        default: 'CK_01_庄重.png',
        smile: 'CK_02_欣慰.png',
        surprised: 'CK_03_复杂.png',
      },
      unlocked: false,
    },
    yan: {
      id: 'yan',
      name: '阿妍',
      nameEn: 'Yan',
      description: '冷静理智的侦探，比主角早三周来到档案馆。',
      portraits: {
        default: 'R_01_冷静.png',
        serious: 'R_02_审视.png',
        smile: 'R_03_轻笑.png',
        surprised: 'R_05_动容.png',
        cold: 'R_06_孤独.png',
      },
      unlocked: false,
    },
    ying: {
      id: 'ying',
      name: '莹莹',
      nameEn: 'Yingying',
      description: '活泼开朗的少女，比主角早两个月来到档案馆。',
      portraits: {
        default: 'J_03_认真.png',
        smile: 'J_01_发光.png',
        surprised: 'J_04_被逗到.png',
        think: 'J_02_低头.png',
        energetic: 'J_06_握着.png',
      },
      unlocked: false,
    },
    shenmo: {
      id: 'shenmo',
      name: '沈墨',
      nameEn: 'Shen Mo',
      description: '主角。循着一封匿名信来到数字档案馆的青年。',
      portraits: {
        default: 'SM_01_沉静.png',
        think: 'SM_03_犹豫.png',
        serious: 'SM_02_坚定.png',
      },
      unlocked: false,
    },
    plotter: {
      id: 'plotter',
      name: '设局人',
      nameEn: 'Plotter',
      description: '神秘的幕后人物，一切笼锁的设计者。',
      portraits: {
        default: 'P_01_常态.png',
        angry: 'P_03_真身.png',
      },
      unlocked: false,
    },
    plotterShadow: {
      id: 'plotterShadow',
      name: '设局人残影',
      nameEn: 'Plotter Shadow',
      description: '设局人的残影形态，出现在某些特殊关卡。',
      portraits: {
        default: 'P_02_残影态.png',
      },
      unlocked: false,
    },
    weaver: {
      id: 'weaver',
      name: '星辰梭',
      nameEn: 'Weaver',
      description: '传说中的神器，拥有编织时空的力量。',
      portraits: {
        default: 'weaver_default.png',
      },
      unlocked: false,
    },
    remnant: {
      id: 'remnant',
      name: '残局守护者',
      nameEn: 'Remnant',
      description: '守护着档案馆最深层秘密的存在。',
      portraits: {
        default: 'remnant_default.png',
      },
      unlocked: false,
    },
    setterSecret: {
      id: 'setterSecret',
      name: '设局人（秘术）',
      nameEn: 'Plotter (Secret)',
      description: '使用秘术的设局人，拥有更强的力量。',
      portraits: {
        default: 'setter_secret_default.png',
      },
      unlocked: false,
    },
  };

  class GalleryPanel {
    /**
     * @param {Object} [options] - 配置项
     * @param {HTMLElement} [options.container] - 面板容器父元素
     * @param {Function} [options.onClose] - 关闭回调
     * @param {Object} [options.chaptersData] - 章节数据（可选，从 localStorage/全局读取）
     */
    constructor(options = {}) {
      this.container = options.container || document.body;
      this._onClose = options.onClose || null;
      this._chaptersData = options.chaptersData || null;

      this._isVisible = false;
      this._currentTab = 'characters';
      this._selectedCharacter = null;
      this._selectedScene = null;

      this._overlay = null;
      this._panel = null;

      // 加载解锁数据
      this._unlockData = this._loadUnlockData();
    }

    // === 公共 API ===

    show() {
      if (this._isVisible) return;
      this._isVisible = true;

      if (!this._overlay) {
        this._buildDOM();
      }

      this.refresh();
      this._overlay.style.display = 'flex';
      requestAnimationFrame(() => {
        this._overlay.style.opacity = '1';
        this._panel.style.transform = 'translateX(-50%) translateY(0)';
      });
    }

    hide() {
      if (!this._isVisible) return;
      this._isVisible = false;

      if (this._overlay) {
        this._overlay.style.opacity = '0';
        this._panel.style.transform = 'translateX(-50%) translateY(100%)';
        setTimeout(() => {
          if (this._overlay) {
            this._overlay.style.display = 'none';
          }
        }, 350);
      }

      if (this._onClose) {
        try { this._onClose(); } catch (e) {}
      }
    }

    toggle() {
      if (this._isVisible) {
        this.hide();
      } else {
        this.show();
      }
    }

    refresh() {
      if (!this._panel) return;
      this._unlockData = this._loadUnlockData();
      this._renderTabContent();
    }

    /**
     * 解锁角色
     * @param {string} charId - 角色ID
     */
    unlockCharacter(charId) {
      if (!charId) return;
      if (!this._unlockData.characters) {
        this._unlockData.characters = {};
      }
      if (this._unlockData.characters[charId]) return; // 已解锁

      this._unlockData.characters[charId] = {
        unlockedAt: Date.now(),
      };
      this._saveUnlockData();
      this.refresh();
    }

    /**
     * 标记场景已读（剧情回放用）
     * @param {number|string} chapterId - 章节ID
     * @param {number|string} levelId - 关卡ID
     * @param {string} sceneType - 场景类型（pre/clear/prologue）
     */
    markSceneRead(chapterId, levelId, sceneType) {
      try {
        const raw = localStorage.getItem(STORY_READ_KEY);
        const readScenes = raw ? JSON.parse(raw) : {};
        const key = chapterId + '_' + levelId + '_' + sceneType;
        readScenes[key] = true;
        localStorage.setItem(STORY_READ_KEY, JSON.stringify(readScenes));
      } catch (e) {
        console.warn('[GalleryPanel] markSceneRead failed:', e);
      }
      this.refresh();
    }

    /**
     * 解锁背景图
     * @param {string} bgName - 背景图名称
     */
    unlockBackground(bgName) {
      if (!bgName) return;
      if (!this._unlockData.backgrounds) {
        this._unlockData.backgrounds = [];
      }
      if (this._unlockData.backgrounds.indexOf(bgName) !== -1) return;

      this._unlockData.backgrounds.push(bgName);
      this._saveUnlockData();
      this.refresh();
    }

    // === DOM 构建 ===

    _buildDOM() {
      // 遮罩层
      const overlay = document.createElement('div');
      overlay.id = 'gallery-panel-overlay';
      overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(15,23,42,0.7);z-index:23000;display:none;' +
        'opacity:0;transition:opacity 0.3s ease;backdrop-filter:blur(4px);';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.hide();
      });

      // 主面板（底部弹窗 Bottom Sheet）
      const panel = document.createElement('div');
      panel.id = 'gallery-panel';
      panel.style.cssText =
        'position:fixed;bottom:0;left:50%;width:100%;max-width:480px;' +
        'max-height:85vh;background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%);' +
        'border-radius:20px 20px 0 0;' +
        'z-index:23001;transform:translateX(-50%) translateY(100%);' +
        'transition:transform 0.35s cubic-bezier(0.4,0,0.2,1);' +
        'display:flex;flex-direction:column;overflow:hidden;';
      panel.addEventListener('click', (e) => e.stopPropagation());

      // 拖拽手柄（drag handle）
      const handle = document.createElement('div');
      handle.id = 'gp-drag-handle';
      handle.style.cssText =
        'flex-shrink:0;display:flex;justify-content:center;padding:8px 0 4px;' +
        'cursor:grab;user-select:none;';
      handle.innerHTML =
        '<div style="width:36px;height:4px;border-radius:2px;' +
        'background:#334155;"></div>';
      handle.addEventListener('click', (e) => e.stopPropagation());

      // 头部
      const header = document.createElement('div');
      header.style.cssText =
        'padding:20px 20px 12px;flex-shrink:0;' +
        'border-bottom:1px solid rgba(251,191,36,0.1);';
      header.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
        '<div style="font-size:20px;font-weight:900;color:#f1f5f9;letter-spacing:3px;">📚 图鉴</div>' +
        '<div id="gp-subtitle" style="font-size:12px;color:#64748b;margin-top:4px;letter-spacing:1px;">剧情 & 角色收集</div>' +
        '</div>' +
        '<button id="gp-close-btn" style="width:36px;height:36px;border:1px solid #334155;' +
        'background:#1e293b;color:#94a3b8;border-radius:10px;cursor:pointer;' +
        'font-size:16px;transition:all 0.2s;display:flex;align-items:center;justify-content:center;">✕</button>' +
        '</div>';

      // Tab 栏
      const tabBar = document.createElement('div');
      tabBar.id = 'gp-tab-bar';
      tabBar.style.cssText =
        'display:flex;gap:4px;padding:12px 20px 0;flex-shrink:0;' +
        'border-bottom:1px solid rgba(251,191,36,0.08);';

      TABS.forEach((tab, index) => {
        const tabBtn = document.createElement('div');
        tabBtn.dataset.tab = tab.id;
        tabBtn.style.cssText =
          'flex:1;padding:10px 8px;text-align:center;cursor:pointer;' +
          'font-size:13px;font-weight:600;color:#64748b;' +
          'border-bottom:2px solid transparent;transition:all 0.2s;' +
          'border-radius:8px 8px 0 0;';
        tabBtn.innerHTML =
          '<span style="margin-right:4px;">' + tab.icon + '</span>' + tab.name;

        if (index === 0) {
          tabBtn.style.color = '#fbbf24';
          tabBtn.style.borderBottomColor = '#fbbf24';
        }

        tabBtn.addEventListener('click', () => {
          this._switchTab(tab.id);
        });
        tabBtn.addEventListener('mouseenter', () => {
          if (tab.id !== this._currentTab) {
            tabBtn.style.color = '#94a3b8';
          }
        });
        tabBtn.addEventListener('mouseleave', () => {
          if (tab.id !== this._currentTab) {
            tabBtn.style.color = '#64748b';
          }
        });

        tabBar.appendChild(tabBtn);
      });

      // 内容区
      const content = document.createElement('div');
      content.id = 'gp-content';
      content.style.cssText =
        'flex:1;overflow-y:auto;padding:16px 20px 24px;';

      panel.appendChild(handle);
      panel.appendChild(header);
      panel.appendChild(tabBar);
      panel.appendChild(content);
      overlay.appendChild(panel);
      this.container.appendChild(overlay);

      this._overlay = overlay;
      this._panel = panel;

      // 绑定关闭按钮
      const closeBtn = document.getElementById('gp-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide());
        closeBtn.addEventListener('mouseenter', () => {
          closeBtn.style.background = '#334155';
          closeBtn.style.color = '#f1f5f9';
        });
        closeBtn.addEventListener('mouseleave', () => {
          closeBtn.style.background = '#1e293b';
          closeBtn.style.color = '#94a3b8';
        });
      }

      // ESC 键关闭
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isVisible) {
          this.hide();
        }
      });

      // 注入样式
      this._injectStyles();
    }

    _injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        #gp-content::-webkit-scrollbar { width: 4px; }
        #gp-content::-webkit-scrollbar-track { background: transparent; }
        #gp-content::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }

        .gp-char-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .gp-char-card {
          aspect-ratio: 1;
          border-radius: 12px;
          background: rgba(30,41,59,0.6);
          border: 1px solid #334155;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          overflow: hidden;
          position: relative;
        }
        .gp-char-card:hover {
          border-color: rgba(251,191,36,0.4);
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }
        .gp-char-card.locked {
          cursor: default;
          opacity: 0.5;
        }
        .gp-char-card.locked:hover {
          transform: none;
          border-color: #334155;
        }
        .gp-char-avatar {
          font-size: 32px;
          margin-bottom: 6px;
        }
        .gp-char-name {
          font-size: 12px;
          color: #e2e8f0;
          font-weight: 600;
          text-align: center;
        }
        .gp-char-card.locked .gp-char-name {
          color: #475569;
        }

        /* 角色详情 */
        .gp-char-detail {
          animation: gpFadeIn 0.3s ease;
        }
        .gp-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          background: rgba(51,65,85,0.5);
          border: 1px solid #334155;
          border-radius: 8px;
          color: #94a3b8;
          font-size: 12px;
          cursor: pointer;
          margin-bottom: 16px;
          transition: all 0.2s;
        }
        .gp-back-btn:hover {
          background: #334155;
          color: #e2e8f0;
        }
        .gp-char-detail-header {
          text-align: center;
          margin-bottom: 20px;
        }
        .gp-char-detail-avatar {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(251,191,36,0.2), rgba(99,102,241,0.2));
          border: 2px solid rgba(251,191,36,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          margin: 0 auto 12px;
        }
        .gp-char-detail-name {
          font-size: 20px;
          font-weight: 700;
          color: #f1f5f9;
          margin-bottom: 4px;
        }
        .gp-char-detail-name-en {
          font-size: 12px;
          color: #64748b;
          letter-spacing: 2px;
        }
        .gp-char-detail-desc {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.7;
          padding: 12px;
          background: rgba(30,41,59,0.5);
          border-radius: 10px;
          margin-bottom: 16px;
        }
        .gp-char-detail-section-title {
          font-size: 12px;
          font-weight: 600;
          color: #fbbf24;
          letter-spacing: 2px;
          margin-bottom: 10px;
        }
        .gp-expression-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .gp-expression-item {
          aspect-ratio: 1;
          border-radius: 8px;
          background: rgba(30,41,59,0.6);
          border: 1px solid #334155;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }
        .gp-expression-item:hover {
          border-color: rgba(251,191,36,0.4);
        }
        .gp-expression-item.locked {
          opacity: 0.3;
          cursor: default;
        }
        .gp-expression-item.locked:hover {
          border-color: #334155;
        }
        .gp-expression-label {
          position: absolute;
          bottom: 2px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 10px;
          color: #64748b;
        }

        /* 剧情列表 */
        .gp-chapter-group {
          margin-bottom: 20px;
        }
        .gp-chapter-title {
          font-size: 13px;
          font-weight: 700;
          color: #fbbf24;
          letter-spacing: 2px;
          margin-bottom: 10px;
          padding-left: 8px;
          border-left: 3px solid #fbbf24;
        }
        .gp-scene-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: rgba(30,41,59,0.4);
          border: 1px solid #1e293b;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 6px;
        }
        .gp-scene-item:hover {
          background: rgba(30,41,59,0.8);
          border-color: rgba(251,191,36,0.2);
        }
        .gp-scene-item.locked {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .gp-scene-item.locked:hover {
          background: rgba(30,41,59,0.4);
          border-color: #1e293b;
        }
        .gp-scene-icon {
          font-size: 20px;
          flex-shrink: 0;
          width: 32px;
          text-align: center;
        }
        .gp-scene-info {
          flex: 1;
          min-width: 0;
        }
        .gp-scene-name {
          font-size: 13px;
          font-weight: 600;
          color: #e2e8f0;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gp-scene-meta {
          font-size: 11px;
          color: #64748b;
        }
        .gp-scene-badges {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .gp-scene-badge {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(99,102,241,0.15);
          color: #818cf8;
          border: 1px solid rgba(99,102,241,0.3);
        }
        .gp-scene-badge.cleared {
          background: rgba(34,197,94,0.15);
          color: #4ade80;
          border-color: rgba(34,197,94,0.3);
        }

        /* CG 图鉴 */
        .gp-cg-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .gp-cg-item {
          aspect-ratio: 16/10;
          border-radius: 10px;
          background: rgba(30,41,59,0.6);
          border: 1px solid #334155;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          overflow: hidden;
          position: relative;
        }
        .gp-cg-item:hover {
          border-color: rgba(251,191,36,0.4);
          transform: scale(1.02);
        }
        .gp-cg-item.locked {
          opacity: 0.4;
          cursor: default;
        }
        .gp-cg-item.locked:hover {
          transform: none;
          border-color: #334155;
        }
        .gp-cg-icon {
          font-size: 28px;
        }
        .gp-cg-name {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 6px 8px;
          font-size: 11px;
          color: #e2e8f0;
          background: linear-gradient(transparent, rgba(0,0,0,0.7));
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .gp-empty {
          text-align: center;
          padding: 40px 20px;
          color: #475569;
          font-size: 13px;
        }
        .gp-empty-icon {
          font-size: 48px;
          margin-bottom: 12px;
          opacity: 0.5;
        }

        @keyframes gpFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    // === Tab 切换 ===

    _switchTab(tabId) {
      if (tabId === this._currentTab) return;
      this._currentTab = tabId;
      this._selectedCharacter = null;
      this._selectedScene = null;

      // 更新 tab 样式
      const tabBtns = this._panel.querySelectorAll('#gp-tab-bar > div');
      tabBtns.forEach((btn) => {
        if (btn.dataset.tab === tabId) {
          btn.style.color = '#fbbf24';
          btn.style.borderBottomColor = '#fbbf24';
        } else {
          btn.style.color = '#64748b';
          btn.style.borderBottomColor = 'transparent';
        }
      });

      this._renderTabContent();
    }

    // === 渲染 ===

    _renderTabContent() {
      const content = document.getElementById('gp-content');
      if (!content) return;

      switch (this._currentTab) {
        case 'characters':
          this._renderCharactersTab(content);
          break;
        case 'story':
          this._renderStoryTab(content);
          break;
        case 'cg':
          this._renderCGTab(content);
          break;
      }
    }

    _renderCharactersTab(content) {
      if (this._selectedCharacter) {
        this._renderCharacterDetail(content);
        return;
      }

      const chars = this._getAllCharacters();
      const charIds = Object.keys(chars);
      const unlockedCount = charIds.filter(
        (id) => this._isCharacterUnlocked(id)
      ).length;

      // 更新副标题
      const subtitle = document.getElementById('gp-subtitle');
      if (subtitle) {
        subtitle.textContent = '角色 ' + unlockedCount + ' / ' + charIds.length;
      }

      let html = '<div class="gp-char-grid">';

      charIds.forEach((charId) => {
        const char = chars[charId];
        const isUnlocked = this._isCharacterUnlocked(charId);

        html +=
          '<div class="gp-char-card ' + (isUnlocked ? '' : 'locked') + '" data-char="' + charId + '">' +
          '<div class="gp-char-avatar">' + (isUnlocked ? this._getCharEmoji(charId) : '🔒') + '</div>' +
          '<div class="gp-char-name">' + (isUnlocked ? char.name : '???') + '</div>' +
          '</div>';
      });

      html += '</div>';

      content.innerHTML = html;
      content.scrollTop = 0;

      // 绑定点击事件
      content.querySelectorAll('.gp-char-card').forEach((card) => {
        card.addEventListener('click', () => {
          const charId = card.dataset.char;
          if (this._isCharacterUnlocked(charId)) {
            this._selectedCharacter = charId;
            this._renderCharacterDetail(content);
          }
        });
      });
    }

    _renderCharacterDetail(content) {
      const charId = this._selectedCharacter;
      const chars = this._getAllCharacters();
      const char = chars[charId];
      if (!char) return;

      const portraits = char.portraits || {};
      const portraitKeys = Object.keys(portraits);

      let portraitHtml = '';
      if (portraitKeys.length > 0) {
        portraitHtml =
          '<div class="gp-char-detail-section-title">立绘 / 表情</div>' +
          '<div class="gp-expression-grid">';
        portraitKeys.forEach((key) => {
          portraitHtml +=
            '<div class="gp-expression-item" title="' + key + '">' +
            this._getCharEmoji(charId) +
            '<div class="gp-expression-label">' + key + '</div>' +
            '</div>';
        });
        portraitHtml += '</div>';
      }

      content.innerHTML =
        '<div class="gp-char-detail">' +
        '<div class="gp-back-btn" id="gp-back-to-list">← 返回列表</div>' +
        '<div class="gp-char-detail-header">' +
        '<div class="gp-char-detail-avatar">' + this._getCharEmoji(charId) + '</div>' +
        '<div class="gp-char-detail-name">' + char.name + '</div>' +
        '<div class="gp-char-detail-name-en">' + (char.nameEn || '') + '</div>' +
        '</div>' +
        '<div class="gp-char-detail-desc">' + (char.description || '暂无介绍。') + '</div>' +
        portraitHtml +
        '</div>';

      content.scrollTop = 0;

      const backBtn = document.getElementById('gp-back-to-list');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this._selectedCharacter = null;
          this._renderCharactersTab(content);
        });
      }
    }

    _renderStoryTab(content) {
      const chapters = this._getChaptersData();
      const readScenes = this._getReadScenes();
      let totalRead = 0;
      let totalScenes = 0;

      let html = '';

      chapters.forEach((chapter) => {
        const chapterId = chapter.chapterId;
        const levels = chapter.levels || [];
        const normalLevels = levels.filter((lvl) => !lvl.isHidden);

        html += '<div class="gp-chapter-group">';
        html +=
          '<div class="gp-chapter-title">第' + chapterId + '章 · ' +
          (chapter.title || chapter.name || '') + '</div>';

        normalLevels.forEach((level) => {
          const levelId = level.levelId;
          const hasPre = !!(level.preDialog && level.preDialog.length > 0);
          const hasClear = !!(level.clearDialog && level.clearDialog.length > 0);
          const preRead = readScenes[chapterId + '_' + levelId + '_pre'];
          const clearRead = readScenes[chapterId + '_' + levelId + '_clear'];

          const isCleared = this._isLevelCleared(levelId);
          const isUnlocked = isCleared || preRead || clearRead;

          totalScenes += (hasPre ? 1 : 0) + (hasClear ? 1 : 0);
          if (preRead) totalRead++;
          if (clearRead) totalRead++;

          let badges = '';
          if (hasPre) {
            badges +=
              '<span class="gp-scene-badge ' + (preRead ? 'cleared' : '') + '">' +
              (preRead ? '✓ ' : '') + '前置</span>';
          }
          if (hasClear) {
            badges +=
              '<span class="gp-scene-badge ' + (clearRead ? 'cleared' : '') + '">' +
              (clearRead ? '✓ ' : '') + '通关</span>';
          }

          html +=
            '<div class="gp-scene-item ' + (isUnlocked ? '' : 'locked') +
            '" data-level="' + levelId + '" data-chapter="' + chapterId + '">' +
            '<div class="gp-scene-icon">' + (isUnlocked ? '📖' : '🔒') + '</div>' +
            '<div class="gp-scene-info">' +
            '<div class="gp-scene-name">' + (isUnlocked ? level.title : '??? 未解锁') + '</div>' +
            '<div class="gp-scene-meta">第' + (levelId % 100) + '关</div>' +
            '</div>' +
            '<div class="gp-scene-badges">' + badges + '</div>' +
            '</div>';
        });

        html += '</div>';
      });

      // 更新副标题
      const subtitle = document.getElementById('gp-subtitle');
      if (subtitle) {
        subtitle.textContent = '剧情 ' + totalRead + ' / ' + totalScenes;
      }

      if (totalScenes === 0) {
        html =
          '<div class="gp-empty">' +
          '<div class="gp-empty-icon">📖</div>' +
          '暂无剧情数据' +
          '</div>';
      }

      content.innerHTML = html;
      content.scrollTop = 0;

      // 绑定点击事件
      content.querySelectorAll('.gp-scene-item').forEach((item) => {
        item.addEventListener('click', () => {
          if (item.classList.contains('locked')) return;
          const levelId = parseInt(item.dataset.level);
          const chapterId = parseInt(item.dataset.chapter);
          this._playScene(chapterId, levelId);
        });
      });
    }

    _renderCGTab(content) {
      const backgrounds = this._unlockData.backgrounds || [];

      // 更新副标题
      const subtitle = document.getElementById('gp-subtitle');
      if (subtitle) {
        subtitle.textContent = 'CG 已收集 ' + backgrounds.length + ' 张';
      }

      if (backgrounds.length === 0) {
        content.innerHTML =
          '<div class="gp-empty">' +
          '<div class="gp-empty-icon">🖼</div>' +
          '通关更多关卡来解锁CG吧' +
          '</div>';
        return;
      }

      let html = '<div class="gp-cg-grid">';

      // 已解锁的背景
      backgrounds.forEach((bg) => {
        const name = bg.replace(/\.[^.]+$/, '').replace(/^bg_scene\d+_/, '');
        const bgPath = 'assets/images/backgrounds/' + bg;
        html +=
          '<div class="gp-cg-item" data-bg="' + bg + '">' +
          '<img src="' + bgPath + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
          '<div class="gp-cg-icon" style="display:none;width:100%;height:100%;align-items:center;justify-content:center;">🖼</div>' +
          '<div class="gp-cg-name">' + name + '</div>' +
          '</div>';
      });

      html += '</div>';

      content.innerHTML = html;
      content.scrollTop = 0;

      // 绑定点击事件
      content.querySelectorAll('.gp-cg-item:not(.locked)').forEach((item) => {
        item.addEventListener('click', () => {
          // 点击查看大图（简单起见，用 alert 显示）
          const bg = item.dataset.bg;
          this._showCGViewer(bg);
        });
      });
    }

    _showCGViewer(bgName) {
      // CG 查看器 - 显示真实背景图
      const viewer = document.createElement('div');
      viewer.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.92);z-index:25000;' +
        'display:flex;align-items:center;justify-content:center;' +
        'cursor:pointer;backdrop-filter:blur(8px);';

      // 尝试加载真实图片
      const bgPath = 'assets/images/backgrounds/' + bgName;
      const imgContainer = document.createElement('div');
      imgContainer.style.cssText =
        'max-width:90%;max-height:90%;text-align:center;';

      const img = document.createElement('img');
      img.src = bgPath;
      img.style.cssText =
        'max-width:100%;max-height:85vh;border-radius:12px;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.5);';
      img.onerror = function() {
        // 图片加载失败时显示占位
        imgContainer.innerHTML =
          '<div style="font-size:64px;margin-bottom:20px;">🖼</div>' +
          '<div style="color:#e2e8f0;font-size:16px;">' + bgName + '</div>' +
          '<div style="font-size:12px;margin-top:8px;color:#475569;">图片加载失败</div>';
      };

      const caption = document.createElement('div');
      const displayName = bgName.replace(/\.[^.]+$/, '').replace(/^bg_scene\d+_/, '');
      caption.style.cssText =
        'color:#94a3b8;font-size:13px;margin-top:12px;letter-spacing:1px;';
      caption.textContent = displayName;

      const hint = document.createElement('div');
      hint.style.cssText =
        'color:#475569;font-size:11px;margin-top:6px;';
      hint.textContent = '点击任意处关闭';

      imgContainer.appendChild(img);
      imgContainer.appendChild(caption);
      imgContainer.appendChild(hint);
      viewer.appendChild(imgContainer);

      viewer.addEventListener('click', () => {
        viewer.remove();
      });

      document.body.appendChild(viewer);
    }

    // === 剧情回放 ===

    _playScene(chapterId, levelId) {
      // 找到关卡数据
      let levelData = null;
      let chapterData = null;
      const chapters = this._getChaptersData();
      for (const ch of chapters) {
        if (ch.chapterId === chapterId) {
          chapterData = ch;
          for (const lvl of ch.levels) {
            if (lvl.levelId === levelId) {
              levelData = lvl;
              break;
            }
          }
          break;
        }
      }

      if (!levelData) {
        alert('未找到关卡数据。\n\n关卡：第' + chapterId + '章 第' + (levelId % 100) + '关');
        return;
      }

      const hasPre = !!(levelData.preDialog && levelData.preDialog.length > 0);
      const hasClear = !!(levelData.clearDialog && levelData.clearDialog.length > 0);
      const readScenes = this._getReadScenes();
      const preRead = readScenes[chapterId + '_' + levelId + '_pre'];
      const clearRead = readScenes[chapterId + '_' + levelId + '_clear'];

      // 如果有 StoryEngine，尝试用它回放
      if (global.StoryEngine) {
        // 场景选择：如果两个都有，让用户选择；否则播放有内容的那个
        let sceneType = null;
        let dialogLines = null;

        if (hasPre && hasClear) {
          // 两个都有，询问用户
          const choice = confirm(
            '选择要回放的剧情：\n\n' +
            '【确定】前置剧情\n' +
            '【取消】通关剧情'
          );
          sceneType = choice ? 'pre' : 'clear';
          dialogLines = choice ? levelData.preDialog : levelData.clearDialog;
        } else if (hasPre) {
          sceneType = 'pre';
          dialogLines = levelData.preDialog;
        } else if (hasClear) {
          sceneType = 'clear';
          dialogLines = levelData.clearDialog;
        }

        if (dialogLines && dialogLines.length > 0) {
          this._playDialogWithStoryEngine(chapterId, levelId, sceneType, dialogLines);
          return;
        }
      }

      // 回退：显示对话文本
      this._showDialogText(levelData, chapterId, levelId);
    }

    _playDialogWithStoryEngine(chapterId, levelId, sceneType, dialogLines) {
      const engine = global.StoryEngine;

      // 如果正在播放，先中断
      if (engine._isPlaying) {
        engine.interrupt();
      }

      // 设置场景键
      engine.setSceneKey(chapterId + '_' + levelId + '_' + sceneType + '_replay');

      // 隐藏图鉴面板
      this.hide();

      // 尝试隐藏游戏 UI（如果有 setUIVisible 函数）
      if (typeof global.setUIVisible === 'function') {
        try { global.setUIVisible(false); } catch (e) {}
      }

      // 播放对话
      engine.sayLines(dialogLines, () => {
        // 播放完成，恢复游戏 UI
        if (typeof global.setUIVisible === 'function') {
          try { global.setUIVisible(true); } catch (e) {}
        }
        if (typeof global.setInteractionLocked === 'function') {
          try { global.setInteractionLocked(false); } catch (e) {}
        }
      });
    }

    _showDialogText(levelData, chapterId, levelId) {
      // 简单的文本查看器（回退方案）
      const hasPre = !!(levelData.preDialog && levelData.preDialog.length > 0);
      const hasClear = !!(levelData.clearDialog && levelData.clearDialog.length > 0);

      let html = '';
      html += '<div style="position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.85);z-index:25000;' +
        'display:flex;align-items:center;justify-content:center;' +
        'cursor:pointer;">';
      html += '<div style="max-width:500px;width:90%;max-height:80vh;overflow-y:auto;' +
        'background:linear-gradient(180deg,#1e293b,#0f172a);' +
        'border:1px solid rgba(251,191,36,0.3);border-radius:16px;' +
        'padding:24px;cursor:default;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
      html += '<div style="font-size:18px;font-weight:700;color:#f1f5f9;">' +
        '第' + chapterId + '章 第' + (levelId % 100) + '关 · ' + (levelData.title || '') + '</div>';
      html += '<button id="gp-text-close" style="width:32px;height:32px;border:1px solid #334155;' +
        'background:#1e293b;color:#94a3b8;border-radius:8px;cursor:pointer;' +
        'font-size:14px;">✕</button>';
      html += '</div>';

      if (hasPre) {
        html += '<div style="font-size:14px;font-weight:600;color:#fbbf24;margin-bottom:8px;margin-top:8px;">📖 前置剧情</div>';
        html += this._dialogLinesToHtml(levelData.preDialog);
      }
      if (hasClear) {
        html += '<div style="font-size:14px;font-weight:600;color:#fbbf24;margin-bottom:8px;margin-top:16px;">🏆 通关剧情</div>';
        html += this._dialogLinesToHtml(levelData.clearDialog);
      }

      html += '<div style="text-align:center;margin-top:20px;font-size:12px;color:#475569;">点击关闭按钮或背景关闭</div>';
      html += '</div></div>';

      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const overlay = wrapper.firstChild;
      document.body.appendChild(overlay);

      const close = () => { overlay.remove(); };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
      const closeBtn = document.getElementById('gp-text-close');
      if (closeBtn) closeBtn.addEventListener('click', close);
    }

    _dialogLinesToHtml(lines) {
      if (!lines || !lines.length) return '<div style="color:#64748b;font-size:13px;">暂无内容</div>';
      let html = '';
      lines.forEach((line) => {
        if (typeof line === 'string') {
          html += '<div style="font-size:13px;color:#e2e8f0;line-height:1.7;margin-bottom:8px;' +
            'padding:8px 12px;background:rgba(30,41,59,0.5);border-radius:8px;' +
            'font-style:italic;">' + this._escapeHtml(line) + '</div>';
        } else if (line.isNarration || !line.speaker) {
          html += '<div style="font-size:13px;color:#94a3b8;line-height:1.7;margin-bottom:8px;' +
            'padding:8px 12px;background:rgba(30,41,59,0.3);border-radius:8px;' +
            'font-style:italic;text-align:center;">' + this._escapeHtml(line.text || '') + '</div>';
        } else {
          html += '<div style="margin-bottom:8px;">';
          html += '<div style="font-size:12px;font-weight:600;color:#fbbf24;margin-bottom:2px;">' +
            this._escapeHtml(line.speaker || '') + '</div>';
          html += '<div style="font-size:13px;color:#e2e8f0;line-height:1.7;' +
            'padding:8px 12px;background:rgba(30,41,59,0.6);border-radius:8px;' +
            'border-left:3px solid rgba(251,191,36,0.4);">' + this._escapeHtml(line.text || '') + '</div>';
          html += '</div>';
        }
      });
      return html;
    }

    _escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // === 数据访问 ===

    _loadUnlockData() {
      try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        if (raw) {
          const progress = JSON.parse(raw);
          return progress.galleryUnlock || { characters: {}, backgrounds: [] };
        }
      } catch (e) {}
      return { characters: {}, backgrounds: [] };
    }

    _saveUnlockData() {
      try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        const progress = raw ? JSON.parse(raw) : {};
        progress.galleryUnlock = this._unlockData;
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
      } catch (e) {
        console.warn('[GalleryPanel] Save failed:', e);
      }
    }

    _isCharacterUnlocked(charId) {
      if (!this._unlockData.characters) return false;
      return !!this._unlockData.characters[charId];
    }

    _isLevelCleared(levelId) {
      try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        if (raw) {
          const progress = JSON.parse(raw);
          return !!(progress.levelScores && progress.levelScores[levelId]);
        }
      } catch (e) {}
      return false;
    }

    _getReadScenes() {
      try {
        const raw = localStorage.getItem(STORY_READ_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return {};
    }

    _getAllCharacters() {
      // 优先从 chapters.json 读取角色定义
      if (global.CHAPTER_DATA && global.CHAPTER_DATA.characters) {
        return global.CHAPTER_DATA.characters;
      }
      return DEFAULT_CHARACTERS;
    }

    _getChaptersData() {
      if (this._chaptersData) return this._chaptersData;
      if (global.CHAPTER_DATA && global.CHAPTER_DATA.chapters) {
        return global.CHAPTER_DATA.chapters;
      }
      return [];
    }

    _getCharEmoji(charId) {
      const emojiMap = {
        cagekeeper: '🔒',
        yan: '🌸',
        ying: '✨',
        shenmo: '📖',
        plotter: '🎭',
        plotterShadow: '👤',
        weaver: '⭐',
        remnant: '🛡️',
        setterSecret: '🔮',
      };
      return emojiMap[charId] || '👤';
    }
  }

  global.GalleryPanel = GalleryPanel;

})(window);
