/**
 * ============================================================
 *  SettingsPanel - 游戏设置面板
 * ============================================================
 *
 *  从底部弹出的 Bottom Sheet 设置面板，包含：
 *    - 快捷音量控制（总音量、音效、背景音乐）
 *    - 常用游戏设置（2x2 网格：冲突高亮、即时错误检查、自动清除候选数、震动反馈）
 *    - 高级设置（折叠区：错误数字保留、显示笼子和值、高亮同数字、显示候选数、数据管理）
 *
 *  依赖：
 *    - AudioService（音量控制）
 *    - Board（游戏设置，可选）
 *    - localStorage（持久化存储）
 *
 *  用法：
 *    const panel = new SettingsPanel(options);
 *    panel.show();
 *    panel.hide();
 *    panel.toggle();
 *    panel.save();
 *    panel.load();
 *
 * ============================================================
 */

class SettingsPanel {
  /**
   * @param {Object} [options] - 配置项
   * @param {HTMLElement} [options.container] - 面板容器父元素，默认 document.body
   * @param {string} [options.panelId] - 面板 DOM ID
   * @param {Board} [options.board] - 棋盘实例（用于应用游戏设置）
   * @param {Renderer} [options.renderer] - 渲染器实例
   * @param {Function} [options.onSettingsChange] - 设置变更回调
   * @param {Function} [options.onResetProgress] - 重置进度回调
   */
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.panelId = options.panelId || 'settings-panel';
    this.board = options.board || null;
    this.renderer = options.renderer || null;
    this.onSettingsChange = options.onSettingsChange || null;
    this.onResetProgress = options.onResetProgress || null;

    this.visible = false;
    this.el = null;
    this.overlay = null;

    // 下拉关闭相关状态
    this._dragStartY = 0;
    this._dragCurrentY = 0;
    this._isDragging = false;

    // 默认设置
    this.defaults = {
      // 音量 (0-100)
      volume: {
        master: 70,
        sfx: 60,
        voice: 85,
        bgm: 40,
      },
      // 游戏设置
      game: {
        conflictRed: true,
        instantErrorCheck: true,
        autoClearCandidates: false,  // 自动清除关联候选（默认关闭）
        autoFillCandidates: false,   // 自动填充候选数（默认关闭）
        vibration: true,
        keepWrongNumber: false,  // 错误数字保留（关闭=300ms闪烁后清除，开启=800ms后清除）
      },
      // 显示设置
      display: {
        showCageSum: true,
        highlightSameNumber: true,
        showCandidates: true,
      },
    };

    this.settings = this._deepClone(this.defaults);

    this._build();
  }

  // === 公共 API ===

  show() {
    if (this.visible) return;
    this.visible = true;
    if (this.overlay) this.overlay.classList.add('show');
    if (this.el) {
      this.el.classList.add('show');
      // 重置拖拽偏移
      this.el.style.transform = '';
    }
    if (typeof AudioService !== 'undefined') {
      AudioService.sfx.play('paper_flip');
    }
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    if (this.overlay) this.overlay.classList.remove('show');
    if (this.el) {
      // 确保移除拖拽内联样式，回到 CSS 过渡
      this.el.style.transform = '';
      this.el.style.transition = '';
      this.el.classList.remove('show');
    }
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  save() {
    try {
      localStorage.setItem('game_settings', JSON.stringify(this.settings));
      return true;
    } catch (e) {
      console.warn('[SettingsPanel] Save failed:', e);
      return false;
    }
  }

  load() {
    try {
      const saved = localStorage.getItem('game_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = this._mergeDeep(this._deepClone(this.defaults), parsed);
        this._applyAll();
        this._updateUI();
      } else {
        this._applyAll();
      }
      return true;
    } catch (e) {
      console.warn('[SettingsPanel] Load failed:', e);
      return false;
    }
  }

  get(key) {
    const parts = key.split('.');
    let obj = this.settings;
    for (const part of parts) {
      if (obj == null) return undefined;
      obj = obj[part];
    }
    return obj;
  }

  set(key, value) {
    const parts = key.split('.');
    const last = parts.pop();
    let obj = this.settings;
    for (const part of parts) {
      if (!obj[part]) obj[part] = {};
      obj = obj[part];
    }
    obj[last] = value;
    this._applySetting(key, value);
    this.save();
    if (this.onSettingsChange) {
      this.onSettingsChange(key, value);
    }
  }

  resetSettings() {
    this.settings = this._deepClone(this.defaults);
    this._applyAll();
    this._updateUI();
    this.save();
  }

  setBoard(board) {
    this.board = board;
    this._applyGameSettings();
    this._applyDisplaySettings();
  }

  setRenderer(renderer) {
    this.renderer = renderer;
  }

  // === 构建 DOM ===

  _build() {
    // 遮罩层
    this.overlay = document.createElement('div');
    this.overlay.id = this.panelId + '-overlay';
    this.overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.6);
      z-index: 19000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(4px);
    `;
    this.overlay.addEventListener('click', () => this.hide());

    // 面板主体 — Bottom Sheet 样式
    this.el = document.createElement('div');
    this.el.id = this.panelId;
    this.el.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%) translateY(100%);
      width: 100%;
      max-width: 480px;
      max-height: 80vh;
      background: linear-gradient(180deg, #1a1d24 0%, #0f1115 100%);
      border-radius: 20px 20px 0 0;
      z-index: 20000;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    `;

    this.el.innerHTML = `
      <!-- 顶部手柄条 -->
      <div class="settings-handle" style="
        padding: 8px 0 4px 0;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-shrink: 0;
        cursor: grab;
        touch-action: none;
      ">
        <div style="
          width: 36px;
          height: 4px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.3);
        "></div>
      </div>

      <!-- 头部 -->
      <div class="settings-header" style="
        padding: 0 16px 8px 16px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      ">
        <span style="font-size: 16px; font-weight: 700; color: #e8eaed;">设置</span>
        <button class="settings-close-btn" style="
          width: 32px; height: 32px;
          border: 1px solid #2a2f3a;
          background: #1a1d24;
          color: #8b92a0;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
          padding: 0;
        ">✕</button>
      </div>

      <!-- 内容区（可滚动） -->
      <div class="settings-content" style="
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 4px 16px 16px 16px;
      ">
        <!-- 快捷音量控制 -->
        <div class="settings-section">
          <!-- 总音量 — 整行 -->
          <div class="settings-item" data-setting="volume.master">
            <div class="settings-item-label" style="
              display: flex; justify-content: space-between; align-items: center;
              margin-bottom: 4px;
            ">
              <span style="color: #e8eaed; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 14px;">🔊</span>总音量
              </span>
              <span class="settings-value" style="color: #6366f1; font-size: 12px; font-weight: 600; min-width: 30px; text-align: right;">70</span>
            </div>
            <input type="range" class="settings-slider" min="0" max="100" value="70" data-volume="master" style="
              width: 100%; height: 4px;
              -webkit-appearance: none; appearance: none;
              background: #2a2f3a;
              border-radius: 2px;
              outline: none;
              cursor: pointer;
            ">
          </div>

          <!-- 音效 + BGM — 双列并排 -->
          <div style="display: flex; gap: 12px; margin-top: 10px;">
            <div class="settings-item" data-setting="volume.sfx" style="flex: 1; min-width: 0;">
              <div class="settings-item-label" style="
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 4px;
              ">
                <span style="color: #e8eaed; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 12px;">🔔</span>音效
                </span>
                <span class="settings-value" style="color: #6366f1; font-size: 11px; font-weight: 600; min-width: 26px; text-align: right;">60</span>
              </div>
              <input type="range" class="settings-slider" min="0" max="100" value="60" data-volume="sfx" style="
                width: 100%; height: 4px;
                -webkit-appearance: none; appearance: none;
                background: #2a2f3a;
                border-radius: 2px;
                outline: none;
                cursor: pointer;
              ">
            </div>

            <div class="settings-item" data-setting="volume.bgm" style="flex: 1; min-width: 0;">
              <div class="settings-item-label" style="
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 4px;
              ">
                <span style="color: #e8eaed; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 12px;">🎵</span>音乐
                </span>
                <span class="settings-value" style="color: #6366f1; font-size: 11px; font-weight: 600; min-width: 26px; text-align: right;">40</span>
              </div>
              <input type="range" class="settings-slider" min="0" max="100" value="40" data-volume="bgm" style="
                width: 100%; height: 4px;
                -webkit-appearance: none; appearance: none;
                background: #2a2f3a;
                border-radius: 2px;
                outline: none;
                cursor: pointer;
              ">
            </div>
          </div>
        </div>

        <!-- 常用开关 — 2x2 网格 -->
        <div class="settings-section" style="margin-top: 14px;">
          <div class="settings-toggle-grid" style="
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          ">
            <div class="settings-item settings-toggle-item settings-toggle-card" data-setting="game.conflictRed">
              <div class="settings-toggle" data-toggle="game.conflictRed" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 12px 8px;
                background: rgba(42, 47, 58, 0.5);
                border: 1px solid #2a2f3a;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
              ">
                <span class="toggle-icon" style="font-size: 20px;">⚡</span>
                <span style="color: #e8eaed; font-size: 12px; font-weight: 500;">冲突高亮</span>
                <div class="toggle-switch" style="
                  width: 36px; height: 20px;
                  background: #2a2f3a;
                  border-radius: 10px;
                  position: relative;
                  transition: background 0.2s;
                ">
                  <div class="toggle-knob" style="
                    position: absolute; top: 2px; left: 2px;
                    width: 16px; height: 16px;
                    background: #8b92a0;
                    border-radius: 50%;
                    transition: all 0.2s;
                  "></div>
                </div>
              </div>
            </div>

            <div class="settings-item settings-toggle-item settings-toggle-card" data-setting="game.instantErrorCheck">
              <div class="settings-toggle" data-toggle="game.instantErrorCheck" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 12px 8px;
                background: rgba(42, 47, 58, 0.5);
                border: 1px solid #2a2f3a;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
              ">
                <span class="toggle-icon" style="font-size: 20px;">✓</span>
                <span style="color: #e8eaed; font-size: 12px; font-weight: 500;">即时检查</span>
                <div class="toggle-switch" style="
                  width: 36px; height: 20px;
                  background: #2a2f3a;
                  border-radius: 10px;
                  position: relative;
                  transition: background 0.2s;
                ">
                  <div class="toggle-knob" style="
                    position: absolute; top: 2px; left: 2px;
                    width: 16px; height: 16px;
                    background: #8b92a0;
                    border-radius: 50%;
                    transition: all 0.2s;
                  "></div>
                </div>
              </div>
            </div>

            <div class="settings-item settings-toggle-item settings-toggle-card" data-setting="game.autoClearCandidates">
              <div class="settings-toggle" data-toggle="game.autoClearCandidates" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 12px 8px;
                background: rgba(42, 47, 58, 0.5);
                border: 1px solid #2a2f3a;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
              ">
                <span class="toggle-icon" style="font-size: 20px;">🧹</span>
                <span style="color: #e8eaed; font-size: 12px; font-weight: 500;">自动清除</span>
                <div class="toggle-switch" style="
                  width: 36px; height: 20px;
                  background: #2a2f3a;
                  border-radius: 10px;
                  position: relative;
                  transition: background 0.2s;
                ">
                  <div class="toggle-knob" style="
                    position: absolute; top: 2px; left: 2px;
                    width: 16px; height: 16px;
                    background: #8b92a0;
                    border-radius: 50%;
                    transition: all 0.2s;
                  "></div>
                </div>
              </div>
            </div>

            <div class="settings-item settings-toggle-item settings-toggle-card" data-setting="game.autoFillCandidates">
              <div class="settings-toggle" data-toggle="game.autoFillCandidates" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 12px 8px;
                background: rgba(42, 47, 58, 0.5);
                border: 1px solid #2a2f3a;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
              ">
                <span class="toggle-icon" style="font-size: 20px;">✏️</span>
                <span style="color: #e8eaed; font-size: 12px; font-weight: 500;">自动填候</span>
                <div class="toggle-switch" style="
                  width: 36px; height: 20px;
                  background: #2a2f3a;
                  border-radius: 10px;
                  position: relative;
                  transition: background 0.2s;
                ">
                  <div class="toggle-knob" style="
                    position: absolute; top: 2px; left: 2px;
                    width: 16px; height: 16px;
                    background: #8b92a0;
                    border-radius: 50%;
                    transition: all 0.2s;
                  "></div>
                </div>
              </div>
            </div>

            <div class="settings-item settings-toggle-item settings-toggle-card" data-setting="game.vibration">
              <div class="settings-toggle" data-toggle="game.vibration" style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 12px 8px;
                background: rgba(42, 47, 58, 0.5);
                border: 1px solid #2a2f3a;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
              ">
                <span class="toggle-icon" style="font-size: 20px;">📳</span>
                <span style="color: #e8eaed; font-size: 12px; font-weight: 500;">震动反馈</span>
                <div class="toggle-switch" style="
                  width: 36px; height: 20px;
                  background: #2a2f3a;
                  border-radius: 10px;
                  position: relative;
                  transition: background 0.2s;
                ">
                  <div class="toggle-knob" style="
                    position: absolute; top: 2px; left: 2px;
                    width: 16px; height: 16px;
                    background: #8b92a0;
                    border-radius: 50%;
                    transition: all 0.2s;
                  "></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 高级设置折叠区 -->
        <div class="settings-advanced" style="margin-top: 14px;">
          <button class="settings-advanced-toggle" style="
            width: 100%;
            padding: 10px 12px;
            background: rgba(42, 47, 58, 0.3);
            border: 1px solid #2a2f3a;
            color: #94a3b8;
            border-radius: 10px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.15s;
          ">
            <span>高级设置</span>
            <span class="settings-advanced-arrow" style="transition: transform 0.2s;">▾</span>
          </button>

          <div class="settings-advanced-content" style="
            display: none;
            padding-top: 12px;
          ">
            <!-- 高级开关 -->
            <div class="settings-item settings-toggle-item" data-setting="game.keepWrongNumber" style="
              display: flex; justify-content: space-between; align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #1e222a;
            ">
              <div>
                <span style="color: #e8eaed; font-size: 13px;">错误数字保留</span>
                <div style="color: #64748b; font-size: 11px; margin-top: 2px;">关闭：300ms闪烁后立即清除</div>
              </div>
              <div class="settings-toggle" data-toggle="game.keepWrongNumber" style="
                width: 40px; height: 22px;
                background: #2a2f3a;
                border-radius: 11px;
                position: relative;
                cursor: pointer;
                transition: background 0.2s;
                flex-shrink: 0;
              ">
                <div class="toggle-knob" style="
                  position: absolute; top: 2px; left: 2px;
                  width: 18px; height: 18px;
                  background: #8b92a0;
                  border-radius: 50%;
                  transition: all 0.2s;
                "></div>
              </div>
            </div>

            <div class="settings-item settings-toggle-item" data-setting="display.showCageSum" style="
              display: flex; justify-content: space-between; align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #1e222a;
            ">
              <span style="color: #e8eaed; font-size: 13px;">显示笼子和值</span>
              <div class="settings-toggle" data-toggle="display.showCageSum" style="
                width: 40px; height: 22px;
                background: #2a2f3a;
                border-radius: 11px;
                position: relative;
                cursor: pointer;
                transition: background 0.2s;
                flex-shrink: 0;
              ">
                <div class="toggle-knob" style="
                  position: absolute; top: 2px; left: 2px;
                  width: 18px; height: 18px;
                  background: #8b92a0;
                  border-radius: 50%;
                  transition: all 0.2s;
                "></div>
              </div>
            </div>

            <div class="settings-item settings-toggle-item" data-setting="display.highlightSameNumber" style="
              display: flex; justify-content: space-between; align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #1e222a;
            ">
              <span style="color: #e8eaed; font-size: 13px;">高亮同数字</span>
              <div class="settings-toggle" data-toggle="display.highlightSameNumber" style="
                width: 40px; height: 22px;
                background: #2a2f3a;
                border-radius: 11px;
                position: relative;
                cursor: pointer;
                transition: background 0.2s;
                flex-shrink: 0;
              ">
                <div class="toggle-knob" style="
                  position: absolute; top: 2px; left: 2px;
                  width: 18px; height: 18px;
                  background: #8b92a0;
                  border-radius: 50%;
                  transition: all 0.2s;
                "></div>
              </div>
            </div>

            <div class="settings-item settings-toggle-item" data-setting="display.showCandidates" style="
              display: flex; justify-content: space-between; align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #1e222a;
            ">
              <span style="color: #e8eaed; font-size: 13px;">显示候选数</span>
              <div class="settings-toggle" data-toggle="display.showCandidates" style="
                width: 40px; height: 22px;
                background: #2a2f3a;
                border-radius: 11px;
                position: relative;
                cursor: pointer;
                transition: background 0.2s;
                flex-shrink: 0;
              ">
                <div class="toggle-knob" style="
                  position: absolute; top: 2px; left: 2px;
                  width: 18px; height: 18px;
                  background: #8b92a0;
                  border-radius: 50%;
                  transition: all 0.2s;
                "></div>
              </div>
            </div>

            <!-- 数据管理 -->
            <div style="margin-top: 16px;">
              <div style="
                font-size: 11px;
                font-weight: 600;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                margin-bottom: 10px;
              ">数据管理</div>

              <button class="settings-btn settings-btn-reset-all" style="
                width: 100%;
                padding: 10px;
                margin-bottom: 8px;
                background: rgba(248, 113, 113, 0.1);
                border: 1px solid rgba(248, 113, 113, 0.3);
                color: #f87171;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.15s;
              ">重置所有进度</button>

              <button class="settings-btn settings-btn-reset-settings" style="
                width: 100%;
                padding: 10px;
                margin-bottom: 8px;
                background: rgba(100, 116, 139, 0.1);
                border: 1px solid rgba(100, 116, 139, 0.3);
                color: #94a3b8;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.15s;
              ">重置设置为默认</button>

              <div style="display: flex; gap: 8px;">
                <button class="settings-btn settings-btn-export" style="
                  flex: 1;
                  padding: 9px;
                  background: rgba(99, 102, 241, 0.1);
                  border: 1px solid rgba(99, 102, 241, 0.3);
                  color: #818cf8;
                  border-radius: 8px;
                  cursor: pointer;
                  font-size: 12px;
                  transition: all 0.15s;
                ">导出进度</button>
                <button class="settings-btn settings-btn-import" style="
                  flex: 1;
                  padding: 9px;
                  background: rgba(34, 211, 238, 0.1);
                  border: 1px solid rgba(34, 211, 238, 0.3);
                  color: #22d3ee;
                  border-radius: 8px;
                  cursor: pointer;
                  font-size: 12px;
                  transition: all 0.15s;
                ">导入进度</button>
              </div>
            </div>
          </div>
        </div>

        <div style="height: 8px;"></div>
      </div>
    `;

    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
      #${this.panelId}.show { transform: translateX(-50%) translateY(0) !important; }
      #${this.panelId}-overlay.show { opacity: 1 !important; pointer-events: auto !important; }

      /* 滑块样式 */
      #${this.panelId} .settings-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #6366f1;
        cursor: pointer;
        box-shadow: 0 0 6px rgba(99, 102, 241, 0.5);
        transition: transform 0.15s;
      }
      #${this.panelId} .settings-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
      }
      #${this.panelId} .settings-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #6366f1;
        cursor: pointer;
        border: none;
        box-shadow: 0 0 6px rgba(99, 102, 241, 0.5);
      }

      /* 普通行内开关样式 */
      #${this.panelId} .settings-toggle.active {
        background: rgba(99, 102, 241, 0.6) !important;
      }
      #${this.panelId} .settings-toggle.active .toggle-knob {
        left: 20px !important;
        background: #fff !important;
      }

      /* 网格卡片开关样式 */
      #${this.panelId} .settings-toggle-card .settings-toggle.active {
        background: rgba(99, 102, 241, 0.15) !important;
        border-color: rgba(99, 102, 241, 0.5) !important;
      }
      #${this.panelId} .settings-toggle-card .settings-toggle.active .toggle-switch {
        background: rgba(99, 102, 241, 0.6) !important;
      }
      #${this.panelId} .settings-toggle-card .settings-toggle.active .toggle-switch .toggle-knob {
        left: 18px !important;
        background: #fff !important;
      }

      /* 按钮 hover 效果 */
      #${this.panelId} .settings-btn:hover {
        transform: translateY(-1px);
      }
      #${this.panelId} .settings-btn:active {
        transform: translateY(0);
      }
      #${this.panelId} .settings-btn-reset-all:hover {
        background: rgba(248, 113, 113, 0.2);
        border-color: rgba(248, 113, 113, 0.5);
      }
      #${this.panelId} .settings-btn-reset-settings:hover {
        background: rgba(100, 116, 139, 0.2);
      }
      #${this.panelId} .settings-btn-export:hover {
        background: rgba(99, 102, 241, 0.2);
      }
      #${this.panelId} .settings-btn-import:hover {
        background: rgba(34, 211, 238, 0.2);
      }
      #${this.panelId} .settings-close-btn:hover {
        background: #2a2f3a;
        color: #e8eaed;
      }

      /* 高级设置按钮 */
      #${this.panelId} .settings-advanced-toggle:hover {
        background: rgba(42, 47, 58, 0.5);
        color: #e8eaed;
      }
      #${this.panelId} .settings-advanced-toggle.open .settings-advanced-arrow {
        transform: rotate(180deg);
      }

      /* 滚动条 */
      #${this.panelId} .settings-content::-webkit-scrollbar {
        width: 4px;
      }
      #${this.panelId} .settings-content::-webkit-scrollbar-track {
        background: transparent;
      }
      #${this.panelId} .settings-content::-webkit-scrollbar-thumb {
        background: #2a2f3a;
        border-radius: 2px;
      }

      /* 手柄拖拽态 */
      #${this.panelId} .settings-handle:active {
        cursor: grabbing;
      }
    `;
    document.head.appendChild(style);

    this.container.appendChild(this.overlay);
    this.container.appendChild(this.el);

    this._bindEvents();
    this._updateUI();
  }

  _bindEvents() {
    // 关闭按钮
    this.el.querySelector('.settings-close-btn').addEventListener('click', () => {
      if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
      this.hide();
    });

    // 音量滑块
    this.el.querySelectorAll('.settings-slider[data-volume]').forEach(slider => {
      const type = slider.dataset.volume;
      slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        this.set('volume.' + type, value);
        // 更新显示
        const item = e.target.closest('.settings-item');
        const valueEl = item.querySelector('.settings-value');
        if (valueEl) valueEl.textContent = value;
      });
      slider.addEventListener('change', () => {
        if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
      });
    });

    // 开关按钮（包含行内和卡片式）
    this.el.querySelectorAll('.settings-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const key = toggle.dataset.toggle;
        const current = this.get(key);
        this.set(key, !current);
        this._updateToggleUI(key, !current);
        if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
      });
    });

    // 高级设置折叠
    const advancedToggle = this.el.querySelector('.settings-advanced-toggle');
    const advancedContent = this.el.querySelector('.settings-advanced-content');
    advancedToggle.addEventListener('click', () => {
      const isOpen = advancedContent.style.display === 'block';
      if (isOpen) {
        advancedContent.style.display = 'none';
        advancedToggle.classList.remove('open');
      } else {
        advancedContent.style.display = 'block';
        advancedToggle.classList.add('open');
      }
      if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
    });

    // 重置设置
    this.el.querySelector('.settings-btn-reset-settings').addEventListener('click', () => {
      if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
      if (confirm('确定要重置所有设置为默认值吗？')) {
        this.resetSettings();
        if (typeof AudioService !== 'undefined') AudioService.sfx.play('success');
      }
    });

    // 重置所有进度
    this.el.querySelector('.settings-btn-reset-all').addEventListener('click', () => {
      if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
      if (confirm('确定要重置所有游戏进度吗？此操作不可撤销！\n\n所有关卡进度、评分、成就将被清除。')) {
        if (confirm('再次确认：你真的要清除所有进度吗？')) {
          this._resetAllProgress();
        }
      }
    });

    // 导出进度
    this.el.querySelector('.settings-btn-export').addEventListener('click', () => {
      if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
      this._exportProgress();
    });

    // 导入进度
    this.el.querySelector('.settings-btn-import').addEventListener('click', () => {
      if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
      this._importProgress();
    });

    // 手柄下拉关闭（支持触摸和鼠标）
    const handle = this.el.querySelector('.settings-handle');
    const panel = this.el;

    const onDragStart = (clientY) => {
      if (!this.visible) return;
      this._isDragging = true;
      this._dragStartY = clientY;
      this._dragCurrentY = clientY;
      panel.style.transition = 'none';
    };

    const onDragMove = (clientY) => {
      if (!this._isDragging) return;
      this._dragCurrentY = clientY;
      const delta = clientY - this._dragStartY;
      if (delta > 0) {
        // 下拉时添加阻尼感
        const dampened = delta * 0.6;
        panel.style.transform = `translateX(-50%) translateY(${dampened}px)`;
        // 遮罩透明度跟随
        const opacity = Math.max(0, 1 - delta / 300);
        this.overlay.style.opacity = opacity;
      }
    };

    const onDragEnd = () => {
      if (!this._isDragging) return;
      this._isDragging = false;
      const delta = this._dragCurrentY - this._dragStartY;

      // 恢复过渡动画
      panel.style.transition = '';
      this.overlay.style.opacity = '';

      if (delta > 60) {
        // 下拉超过阈值，关闭面板
        this.hide();
      } else {
        // 回弹
        panel.style.transform = '';
      }
    };

    // 触摸事件
    handle.addEventListener('touchstart', (e) => {
      onDragStart(e.touches[0].clientY);
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      onDragMove(e.touches[0].clientY);
    }, { passive: true });

    handle.addEventListener('touchend', () => {
      onDragEnd();
    });

    handle.addEventListener('touchcancel', () => {
      onDragEnd();
    });

    // 鼠标事件（桌面端也支持拖拽）
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onDragStart(e.clientY);

      const onMouseMove = (ev) => onDragMove(ev.clientY);
      const onMouseUp = () => {
        onDragEnd();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) {
        this.hide();
      }
    });
  }

  _updateUI() {
    // 更新音量滑块（master、sfx、bgm 在界面上；voice 保留在数据中）
    for (const type of ['master', 'sfx', 'voice', 'bgm']) {
      const slider = this.el.querySelector(`.settings-slider[data-volume="${type}"]`);
      if (slider) slider.value = this.settings.volume[type];
      const valueEl = this.el.querySelector(`[data-setting="volume.${type}"] .settings-value`);
      if (valueEl) valueEl.textContent = this.settings.volume[type];
    }

    // 更新开关状态
    for (const key of ['game.conflictRed', 'game.instantErrorCheck', 'game.autoClearCandidates', 'game.autoFillCandidates', 'game.vibration', 'game.keepWrongNumber',
                        'display.showCageSum', 'display.highlightSameNumber', 'display.showCandidates']) {
      this._updateToggleUI(key, this.get(key));
    }
  }

  _updateToggleUI(key, value) {
    const toggle = this.el.querySelector(`.settings-toggle[data-toggle="${key}"]`);
    if (toggle) {
      if (value) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
    }
  }

  _applyAll() {
    this._applyVolumeSettings();
    this._applyGameSettings();
    this._applyDisplaySettings();
  }

  _applySetting(key, value) {
    if (key.startsWith('volume.')) {
      const type = key.split('.')[1];
      this._applyVolume(type, value);
    } else if (key.startsWith('game.')) {
      this._applyGameSetting(key.split('.')[1], value);
    } else if (key.startsWith('display.')) {
      this._applyDisplaySetting(key.split('.')[1], value);
    }
  }

  _applyVolumeSettings() {
    for (const type of ['master', 'sfx', 'voice', 'bgm']) {
      this._applyVolume(type, this.settings.volume[type]);
    }
  }

  _applyVolume(type, value) {
    if (typeof AudioService !== 'undefined') {
      AudioService.setVolume(type, value / 100);
    }
  }

  _applyGameSettings() {
    if (!this.board) return;
    this.board.settings.conflictRed = this.settings.game.conflictRed;
    this.board.settings.instantErrorCheck = this.settings.game.instantErrorCheck;
    this.board.settings.autoClearCandidates = this.settings.game.autoClearCandidates;
    this.board.settings.autoFillCandidates = this.settings.game.autoFillCandidates;
    this.board.settings.vibration = this.settings.game.vibration;
    this.board.settings.keepWrongNumber = this.settings.game.keepWrongNumber;
  }

  _applyGameSetting(key, value) {
    if (!this.board) return;
    if (key === 'conflictRed') {
      this.board.settings.conflictRed = value;
    } else if (key === 'instantErrorCheck') {
      this.board.settings.instantErrorCheck = value;
    } else if (key === 'autoClearCandidates') {
      this.board.settings.autoClearCandidates = value;
    } else if (key === 'autoFillCandidates') {
      this.board.settings.autoFillCandidates = value;
      // 如果开启，立即自动填充一次
      if (value && typeof autoFillCandidates === 'function') {
        autoFillCandidates();
      }
    } else if (key === 'vibration') {
      this.board.settings.vibration = value;
    } else if (key === 'keepWrongNumber') {
      this.board.settings.keepWrongNumber = value;
    }
    // 重新渲染
    if (this.renderer && typeof this.renderer.render === 'function') {
      this.renderer.render(this.board);
    }
  }

  _applyDisplaySettings() {
    if (!this.board) return;
    if (this.board.highlightSettings) {
      this.board.highlightSettings.sameNumber = this.settings.display.highlightSameNumber;
    }
    // showCageSum 和 showCandidates 可能影响渲染
    if (this.renderer && typeof this.renderer.render === 'function') {
      this.renderer.render(this.board);
    }
  }

  _applyDisplaySetting(key, value) {
    if (!this.board) return;
    if (key === 'highlightSameNumber' && this.board.highlightSettings) {
      this.board.highlightSettings.sameNumber = value;
    }
    // showCageSum 和 showCandidates：标记后重渲染
    if (this.renderer && typeof this.renderer.render === 'function') {
      this.renderer.render(this.board);
    }
  }

  // === 数据管理 ===

  _resetAllProgress() {
    try {
      // 清除进度相关的 localStorage 项
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('progress') || key.includes('level_') ||
                    key.includes('completed') || key.includes('achievement') ||
                    key.includes('star') || key.includes('score'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));

      // 也调用外部回调
      if (this.onResetProgress) {
        this.onResetProgress();
      }

      if (typeof AudioService !== 'undefined') AudioService.sfx.play('success');
      alert('所有进度已重置。页面将刷新。');
      window.location.reload();
    } catch (e) {
      console.warn('[SettingsPanel] Reset progress failed:', e);
      alert('重置失败：' + e.message);
    }
  }

  _exportProgress() {
    try {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) data[key] = localStorage.getItem(key);
      }
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'killersudoku_save_' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      if (typeof AudioService !== 'undefined') AudioService.sfx.play('success');
    } catch (e) {
      console.warn('[SettingsPanel] Export failed:', e);
      alert('导出失败：' + e.message);
    }
  }

  _importProgress() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (confirm('导入将覆盖当前所有进度，确定继续吗？')) {
              for (const key in data) {
                if (data.hasOwnProperty(key)) {
                  localStorage.setItem(key, data[key]);
                }
              }
              if (typeof AudioService !== 'undefined') AudioService.sfx.play('success');
              alert('导入成功！页面将刷新。');
              window.location.reload();
            }
          } catch (err) {
            alert('导入失败：文件格式错误');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    } catch (e) {
      console.warn('[SettingsPanel] Import failed:', e);
      alert('导入失败：' + e.message);
    }
  }

  // === 工具函数 ===

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _mergeDeep(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this._mergeDeep(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.SettingsPanel = SettingsPanel;
}
