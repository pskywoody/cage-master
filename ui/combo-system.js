// ==========================================
// ComboSystem - 连击系统（逻辑 + 视觉）
// 迁移自 cagemaster3/game/combo-system.js，ES Module 格式
// 已适配 V4：#board-container 容器、globalThis、Node 无 DOM 降级
// ==========================================
'use strict';

import I18n from '../i18n/i18n.js';

  // 连击里程碑定义（标准 9x9 模式）
  const MILESTONES = {
    3:  { key: 'combo_3',  label: '妙手',  sfx: 'combo_3' },
    5:  { key: 'combo_5',  label: '连韵',  sfx: 'combo_3' },
    8:  { key: 'eureka',   label: 'EUREKA!', sfx: 'eureka' },
    10: { key: 'combo_max', label: 'MAX连击', sfx: 'combo_max' },
  };

  // 新手保护里程碑（4x4 模式）
  const MILESTONES_NOVICE = {
    2: { key: 'combo_3',   label: '连韵',  sfx: 'combo_3' },
    4: { key: 'eureka',    label: 'EUREKA!', sfx: 'eureka' },
    6: { key: 'combo_max', label: 'MAX连击', sfx: 'combo_max' },
  };

  class ComboSystem {
    /**
     * @param {Object} config
     * @param {number} config.gridSize - 盘面尺寸（4/6/9），用于动态阈值
     * @param {boolean} config.isNewPlayer - 是否新手保护
     * @param {Function} config.onComboChange - 连击数变化回调 (count) => {}
     * @param {Function} config.onMilestone - 达到里程碑回调 (level, milestone) => {}
     * @param {Function} config.onEureka - EUREKA 触发回调 (type) => {}  type: 'combo' | 'insight'
     * @param {Function} config.onBreak - 断连回调 () => {}
     * @param {number} config.comboWindowMs - 连击窗口时间（默认 10 秒）
     * @param {number} config.insightStuckMs - 灵感型 EUREKA 卡顿阈值（默认 30 秒）
     */
    constructor(config = {}) {
      // Node 环境（无 DOM）降级：跳过视觉初始化
      this._hasDom = (typeof document !== 'undefined' && typeof window !== 'undefined');

      this.gridSize = config.gridSize || 9;
      this.isNewPlayer = config.isNewPlayer || false;

      // 回调
      this.onComboChange = config.onComboChange || null;
      this.onMilestone = config.onMilestone || null;
      this.onEureka = config.onEureka || null;
      this.onBreak = config.onBreak || null;
      this.onFlowStateChange = config.onFlowStateChange || null; // 心流状态变化回调 (state, depth) => {}

      // 时间参数
      this.comboWindowMs = config.comboWindowMs || 10000;     // 10 秒连击窗口
      this.insightStuckMs = config.insightStuckMs || 30000;   // 30 秒灵感型阈值

      // 状态
      this.count = 0;                     // 当前连击数
      this._lastCorrectTime = 0;          // 上次正确填数时间
      this._lastActionTime = 0;           // 上次任何操作时间（用于灵感型检测）
      this._maxComboThisLevel = 0;        // 本局最高连击
      this._triggeredMilestones = new Set(); // 已触发的里程碑（避免重复）
      this._eurekaTriggered = false;      // EUREKA 是否已触发（本局内）
      this._isEurekaReady = false;        // 是否即将 EUREKA（差一步）
      this._stuckStartTime = 0;           // 卡顿开始时间（灵感型用）

      // 视觉 DOM 元素（延迟创建）
      this._comboEl = null;
      this._eurekaFlashEl = null;
      this._particlesContainer = null;
      this._flowGlowEl = null;          // 棋盘边缘心流光晕
      this._currentFlowState = 'cold';  // cold / stale / flow / eureka

      this._initMilestones();
    }

    // === 根据盘面尺寸和新手状态计算里程碑 ===
    _initMilestones() {
      if (this.isNewPlayer || this.gridSize <= 4) {
        this._milestones = MILESTONES_NOVICE;
      } else if (this.gridSize === 6) {
        // 6x6：适度降低
        this._milestones = {
          3: { key: 'combo_3',  label: '妙手',  sfx: 'combo_3' },
          5: { key: 'combo_5',  label: '连韵',  sfx: 'combo_3' },
          6: { key: 'eureka',   label: 'EUREKA!', sfx: 'eureka' },
          8: { key: 'combo_max', label: 'MAX连击', sfx: 'combo_max' },
        };
      } else {
        this._milestones = MILESTONES;
      }

      // 计算 EUREKA 阈值
      const levels = Object.keys(this._milestones).map(Number).sort((a, b) => a - b);
      this._eurekaLevel = levels.find(l => this._milestones[l].key === 'eureka') || 8;
      this._maxLevel = levels[levels.length - 1] || 10;
    }

    /**
     * 设置盘面尺寸（动态调整阈值）
     * @param {number} size
     */
    setGridSize(size) {
      this.gridSize = size;
      this._initMilestones();
    }

    /**
     * 设置是否新手保护
     * @param {boolean} isNew
     */
    setNewPlayer(isNew) {
      this.isNewPlayer = isNew;
      this._initMilestones();
    }

    // === 事件方法 ===

    /**
     * 正确填数
     * @param {number} r
     * @param {number} c
     * @param {number} num
     */
    onCorrectFill(r, c, num) {
      const now = Date.now();
      const timeSinceLast = now - this._lastCorrectTime;

      // 检查是否在连击窗口内
      if (this._lastCorrectTime > 0 && timeSinceLast <= this.comboWindowMs) {
        this.count++;
      } else {
        // 超时后重新开始连击
        this.count = 1;
        this._triggeredMilestones.clear();
      }

      this._lastCorrectTime = now;
      this._lastActionTime = now;
      this._stuckStartTime = 0; // 有正确填数，重置卡顿计时

      // 更新最高连击
      if (this.count > this._maxComboThisLevel) {
        this._maxComboThisLevel = this.count;
      }

      // 检查灵感型 EUREKA
      // 如果之前卡了很久（超过 insightStuckMs），这次填对就是灵感突破
      if (!this._eurekaTriggered && this._insightStuckDuration > this.insightStuckMs) {
        this._triggerEureka('insight');
      }

      // 检查里程碑
      this._checkMilestones();

      // 检查是否即将 EUREKA
      this._isEurekaReady = (this.count === this._eurekaLevel - 1);

      // 回调
      if (this.onComboChange) {
        try { this.onComboChange(this.count); } catch (e) {}
      }

      // 更新心流状态
      this._updateFlowState();

      // 视觉反馈
      this._updateComboUI();
    }

    /**
     * 错误填数
     * @param {number} r
     * @param {number} c
     * @param {number} num
     */
    onWrongFill(r, c, num) {
      this._lastActionTime = Date.now();

      if (this.isNewPlayer) {
        // 新手保护：错误只减连击数，不归零
        if (this.count > 0) {
          this.count = Math.max(0, this.count - 1);
          if (this.onComboChange) {
            try { this.onComboChange(this.count); } catch (e) {}
          }
          this._updateFlowState();
          this._updateComboUI();
        }
      } else {
        // 正常模式：错误归零
        this._breakCombo('wrong');
      }
    }

    /**
     * 擦除数字
     */
    onErase() {
      this._lastActionTime = Date.now();
      // 擦除断连
      if (this.count > 0) {
        this._breakCombo('erase');
      }
    }

    /**
     * 时间推进（检测超时断连）
     * @param {number} deltaTime - 经过的毫秒数
     */
    update(deltaTime) {
      if (this.count === 0 || this._lastCorrectTime === 0) {
        // 无连击时，记录卡顿时间（用于灵感型 EUREKA）
        if (this._stuckStartTime === 0 && this._lastActionTime > 0) {
          const idleSince = Date.now() - this._lastActionTime;
          if (idleSince > 5000) { // 5秒以上才开始算卡顿
            this._stuckStartTime = this._lastActionTime;
          }
        }
        return;
      }

      const now = Date.now();
      const elapsed = now - this._lastCorrectTime;

      // 超过连击窗口 → 断连
      if (elapsed > this.comboWindowMs) {
        this._breakCombo('timeout');
      }
    }

    /**
     * 重置（新关卡/新游戏）
     */
    reset() {
      this.count = 0;
      this._lastCorrectTime = 0;
      this._lastActionTime = 0;
      this._maxComboThisLevel = 0;
      this._triggeredMilestones.clear();
      this._eurekaTriggered = false;
      this._isEurekaReady = false;
      this._stuckStartTime = 0;
      this._currentFlowState = 'cold';
      this._hideComboUI();
      this._hideFlowGlow();
    }

    /**
     * 销毁连击系统，移除所有 DOM 元素和定时器
     */
    destroy() {
      // 移除连击显示元素
      if (this._comboEl && this._comboEl.parentNode) {
        this._comboEl.parentNode.removeChild(this._comboEl);
      }
      this._comboEl = null;
      // 移除 eureka 闪光元素
      if (this._eurekaFlashEl && this._eurekaFlashEl.parentNode) {
        this._eurekaFlashEl.parentNode.removeChild(this._eurekaFlashEl);
      }
      this._eurekaFlashEl = null;
      // 移除粒子容器
      if (this._particlesContainer && this._particlesContainer.parentNode) {
        this._particlesContainer.parentNode.removeChild(this._particlesContainer);
      }
      this._particlesContainer = null;
      // 移除心流光晕
      if (this._flowGlowEl && this._flowGlowEl.parentNode) {
        this._flowGlowEl.parentNode.removeChild(this._flowGlowEl);
      }
      this._flowGlowEl = null;
      // 移除动画样式
      const styleEl = document.getElementById('combo-keyframes');
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
      // 清理状态
      this.count = 0;
      this._eurekaTriggered = false;
      this._isEurekaReady = false;
    }

    /**
     * 是否即将 EUREKA
     */
    get isEurekaReady() {
      return this._isEurekaReady;
    }

    /**
     * 获取当前灵感卡顿时长（毫秒）
     */
    get _insightStuckDuration() {
      if (this._stuckStartTime === 0) return 0;
      return Date.now() - this._stuckStartTime;
    }

    /**
     * 获取本局最高连击
     */
    get maxCombo() {
      return this._maxComboThisLevel;
    }

    // === 内部方法 ===

    _breakCombo(reason) {
      if (this.count === 0) return;
      const oldCount = this.count;
      this.count = 0;
      this._isEurekaReady = false;
      this._triggeredMilestones.clear();

      if (this.onComboChange) {
        try { this.onComboChange(0); } catch (e) {}
      }
      if (this.onBreak) {
        try { this.onBreak(reason, oldCount); } catch (e) {}
      }

      // 更新心流状态（断连后回到 cold/stale）
      this._updateFlowState();

      this._updateComboUI();
    }

    _checkMilestones() {
      const count = this.count;
      const milestone = this._milestones[count];
      if (!milestone) return;

      // 避免重复触发同一档
      if (this._triggeredMilestones.has(count)) return;
      this._triggeredMilestones.add(count);

      // 里程碑回调
      if (this.onMilestone) {
        try { this.onMilestone(count, milestone); } catch (e) {}
      }

      // EUREKA 特殊处理
      if (milestone.key === 'eureka') {
        this._eurekaTriggered = true;
        if (this.onEureka) {
          try { this.onEureka('combo'); } catch (e) {}
        }
        this._triggerEurekaVisual();
      } else {
        this._triggerMilestoneVisual(count, milestone);
      }
    }

    _triggerEureka(type) {
      this._eurekaTriggered = true;
      if (this.onEureka) {
        try { this.onEureka(type); } catch (e) {}
      }
      this._triggerEurekaVisual();
    }

    // === 视觉反馈 ===

    _ensureComboEl() {
      if (this._comboEl) return;

      // 连击数字显示（CSS 实现，非 canvas）
      const el = document.createElement('div');
      el.id = 'combo-display';
      el.style.cssText = `
        position: fixed;
        top: 72px;
        right: 20px;
        z-index: 12000;
        pointer-events: none;
        text-align: right;
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      `;
      el.innerHTML = `
        <div class="combo-number" style="
          font-size: 40px;
          font-weight: 700;
          color: #3d2a1a;
          text-shadow: 0 1px 0 rgba(255,255,255,0.10), 0 2px 4px rgba(0,0,0,0.28);
          font-family: 'Caveat', 'ZCOOL XiaoWei', 'KaiTi', '楷体', cursive;
          letter-spacing: 1px;
          line-height: 1.1;
          transform: rotate(-2deg);
          display: inline-block;
        ">0</div>
        <div class="combo-seal" style="
          display: none;
          margin: 3px 0 0 auto;
          width: 40px; height: 40px;
          border: 2px solid #a3352a;
          border-radius: 4px;
          color: #a3352a;
          font-size: 15px;
          font-weight: 700;
          font-family: 'ZCOOL XiaoWei', 'KaiTi', '楷体', serif;
          line-height: 36px;
          text-align: center;
          transform: rotate(-6deg);
          opacity: 0.92;
          box-shadow: 0 1px 3px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.08);
        "></div>
        <div class="combo-label" style="
          font-size: 13px;
          font-weight: 700;
          color: #6b5a42;
          font-family: 'Caveat', 'KaiTi', '楷体', cursive;
          letter-spacing: 3px;
          margin-top: 3px;
          opacity: 0.9;
        ">连击</div>
      `;
      document.body.appendChild(el);
      this._comboEl = el;
    }

    _ensureEurekaFlashEl() {
      if (this._eurekaFlashEl) return;

      const el = document.createElement('div');
      el.id = 'eureka-flash';
      el.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: radial-gradient(circle, rgba(212, 168, 83, 0.16) 0%, rgba(180, 140, 80, 0.06) 40%, rgba(120, 90, 50, 0.02) 70%, transparent 85%);
        z-index: 11000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.25s ease;
      `;
      document.body.appendChild(el);
      this._eurekaFlashEl = el;

      // 粒子容器
      const particles = document.createElement('div');
      particles.id = 'eureka-particles';
      particles.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        z-index: 11500;
        pointer-events: none;
        overflow: hidden;
      `;
      document.body.appendChild(particles);
      this._particlesContainer = particles;
    }

    _updateComboUI() {
      if (this.count <= 1) {
        this._hideComboUI();
        return;
      }

      const wasHidden = this._comboEl && this._comboEl.style.opacity !== '1';

      this._ensureComboEl();
      const numEl = this._comboEl.querySelector('.combo-number');
      const labelEl = this._comboEl.querySelector('.combo-label');
      const sealEl = this._comboEl.querySelector('.combo-seal');

      numEl.textContent = this.count;

      // 显示
      this._comboEl.style.opacity = '1';
      this._comboEl.style.transform = 'translateY(0)';

      // 首次出现：整体弹入动画
      if (wasHidden) {
        this._comboEl.classList.remove('combo-appear');
        void this._comboEl.offsetWidth;
        this._comboEl.classList.add('combo-appear');
      }

      // 弹跳动画 + 颜色闪烁（去霓虹：仅微缩放，无 brightness/saturate）
      numEl.style.animation = 'none';
      // 强制重排
      numEl.offsetHeight;
      numEl.style.animation = 'comboPopFlash 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)';

      // 连击等级色（旧墨/烛金/朱砂体系，无霓虹）
      let color = '#3d2a1a';  // 默认墨
      let shadow = '0 1px 0 rgba(255,255,255,0.10), 0 2px 4px rgba(0,0,0,0.28)';
      if (this.count >= this._maxLevel) {
        color = '#3d2a1a'; shadow = '0 1px 0 rgba(255,255,255,0.10), 0 3px 6px rgba(0,0,0,0.35)'; // 墨黑（最高）
      } else if (this.count >= this._eurekaLevel) {
        color = '#a3352a'; shadow = '0 1px 0 rgba(255,255,255,0.12), 0 2px 5px rgba(80,30,20,0.30)'; // 朱砂
      } else if (this.count >= 5) {
        color = '#5c4510'; shadow = '0 1px 0 rgba(255,255,255,0.10), 0 2px 4px rgba(60,40,10,0.25)'; // 旧金棕墨
      }
      numEl.style.color = color;
      numEl.style.textShadow = shadow;
      labelEl.style.color = '#6b5a42';
      if (sealEl) {
        // 朱砂小印：连击 ≥5 时显现（批注"盖印"隐喻）
        const showSeal = this.count >= 5;
        sealEl.style.display = showSeal ? 'block' : 'none';
      }

      // 添加关键帧动画（如果还没有）
      if (!document.getElementById('combo-keyframes')) {
        const style = document.createElement('style');
        style.id = 'combo-keyframes';
        style.textContent = `
          @keyframes comboBounce {
            0%   { transform: scale(1); }
            50%  { transform: scale(1.25); }
            100% { transform: scale(1); }
          }
          @keyframes comboPopFlash {
            0% {
              transform: scale(1);
            }
            40% {
              transform: scale(1.2);
            }
            70% {
              transform: scale(0.96);
            }
            100% {
              transform: scale(1);
            }
          }
          /* P1：朱砂印盖下（下压 + 轻微回弹，无发光） */
          @keyframes sealStampDown {
            0%   { transform: rotate(-6deg) scale(0.4); opacity: 0; }
            55%  { transform: rotate(-4deg) scale(1.15); opacity: 1; }
            75%  { transform: rotate(-6deg) scale(0.92); opacity: 1; }
            100% { transform: rotate(-6deg) scale(1); opacity: 0.92; }
          }
          @keyframes eurekaShake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-3px); }
            75% { transform: translateX(3px); }
          }
          /* P0+：落印纸面震屏（轻微物理抖动，补足霓虹削弱后的手感） */
          @keyframes eurekaStampShake {
            0%   { transform: translate(0, 0) rotate(0deg); }
            15%  { transform: translate(-2px, 1px) rotate(-0.15deg); }
            35%  { transform: translate(2px, -1px) rotate(0.15deg); }
            55%  { transform: translate(-1px, 0) rotate(-0.1deg); }
            75%  { transform: translate(1px, 1px) rotate(0.1deg); }
            100% { transform: translate(0, 0) rotate(0deg); }
          }
          .eureka-stamp-shake {
            animation: eurekaStampShake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
          }
          @keyframes particleFloat {
            0% { transform: translate(0, 0) scale(1); opacity: 1; }
            100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }
    }

    _hideComboUI() {
      if (this._comboEl) {
        this._comboEl.style.opacity = '0';
        this._comboEl.style.transform = 'translateY(-10px)';
      }
    }

    _triggerMilestoneVisual(level, milestone) {
      this._ensureComboEl();
      const labelEl = this._comboEl.querySelector('.combo-label');
      const sealEl = this._comboEl.querySelector('.combo-seal');
      labelEl.textContent = I18n.t('ui.combo.milestone.' + milestone.key);
      labelEl.style.animation = 'none';
      labelEl.offsetHeight;
      labelEl.style.animation = 'comboBounce 0.5s ease';
      // 朱砂印盖字：里程碑对应单字印（妙/韵/悟/极）
      if (sealEl) {
        const sealKey = 'ui.combo.seal.' + milestone.key;
        const sealChar = I18n.t(sealKey);
        const sealText = (sealChar && sealChar !== sealKey) ? sealChar : '';
        sealEl.textContent = sealText;
        sealEl.style.display = sealText ? 'block' : 'none';
        sealEl.style.animation = 'none';
        sealEl.offsetHeight;
        sealEl.style.animation = 'sealStampDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
      }
    }

    _triggerEurekaVisual() {
      this._ensureEurekaFlashEl();
      this._ensureComboEl();

      // P0+：朱砂印落印——清脆落印音效 + 纸张物理震屏（听觉/物理补足霓虹削弱后的爽感）
      try {
        if (typeof window !== 'undefined' && window.AudioService) {
          if (typeof window.AudioService.play === 'function') {
            window.AudioService.play('seal_stamp');
          } else if (window.AudioService.sfx && typeof window.AudioService.sfx.play === 'function') {
            window.AudioService.sfx.play('seal_stamp');
          }
        }
      } catch (e) {}
      this._stampShakeBoard();

      // [FEEL-LOG] EUREKA 节奏：触发（含当前连击数）
      if (typeof window !== 'undefined' && window.__feelLogEnabled) {
        console.log('[FEEL] eureka_trigger', JSON.stringify({
          ts: Date.now(),
          count: this.count,
          flashDurationMs: 350,
          shakeDurationMs: 500,
          flowDecayMs: 2000,
        }));
      }

      // 全屏闪光
      this._eurekaFlashEl.style.opacity = '1';
      // [FEEL-LOG] EUREKA 节奏：闪光显示
      if (typeof window !== 'undefined' && window.__feelLogEnabled) {
        console.log('[FEEL] eureka_flash_show', JSON.stringify({ ts: Date.now(), flashDurationMs: 350 }));
      }
      setTimeout(() => {
        if (this._eurekaFlashEl) {
          this._eurekaFlashEl.style.opacity = '0';
          // [FEEL-LOG] EUREKA 节奏：闪光隐藏（显示到隐藏实际停留）
          if (typeof window !== 'undefined' && window.__feelLogEnabled) {
            console.log('[FEEL] eureka_flash_hide', JSON.stringify({ ts: Date.now() }));
          }
        }
      }, 350); // 手感审计：400→350ms，全屏闪光略收敛避免眩目

      // 连击数字抖动
      const numEl = this._comboEl.querySelector('.combo-number');
      numEl.style.animation = 'eurekaShake 0.5s ease';
      // [FEEL-LOG] EUREKA 节奏：数字抖动开始
      if (typeof window !== 'undefined' && window.__feelLogEnabled) {
        console.log('[FEEL] eureka_shake_start', JSON.stringify({ ts: Date.now(), durationMs: 500 }));
      }

      // 生成粒子
      this._spawnParticles(30);

      // 更新 label
      const labelEl = this._comboEl.querySelector('.combo-label');
      labelEl.textContent = I18n.t('ui.combo.milestone.eureka');

      // 显示大文字 EUREKA!
      this._showEurekaText();

      // EUREKA 心流光晕爆发
      this._ensureFlowGlowEl();
      this._setFlowState('eureka');
      // 2 秒后衰减回 flow 状态（如果连击还在）或 cold
      setTimeout(() => {
        if (this.count >= 3) {
          this._setFlowState('flow');
        } else if (this.count >= 1) {
          this._setFlowState('stale');
        } else {
          this._setFlowState('cold');
        }
      }, 2000);
    }

    _showEurekaText() {
      // 移除旧的
      const old = document.getElementById('eureka-text-overlay');
      if (old && old.parentNode) old.parentNode.removeChild(old);

      const el = document.createElement('div');
      el.id = 'eureka-text-overlay';
      el.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        z-index: 11600;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s ease;
      `;
      el.innerHTML = `<div style="
        font-size: 56px;
        font-weight: 700;
        font-family: 'ZCOOL XiaoWei', 'KaiTi', '楷体', serif;
        color: #8a3d2a;
        text-shadow:
          0 -1px 0 rgba(0,0,0,0.35),
          0 0 20px rgba(180,140,80,0.10);
        letter-spacing: 12px;
        transform: scale(0.5);
        transition: transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
        writing-mode: vertical-rl;
        text-orientation: upright;
      ">悟</div>`;
      document.body.appendChild(el);

      // 动画：淡入+弹出
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        const textDiv = el.querySelector('div');
        if (textDiv) textDiv.style.transform = 'scale(1)';
      });

      // 1.2秒后淡出（如墨迹渗入纸中，缓缓隐去）
      setTimeout(() => {
        el.style.opacity = '0';
        const textDiv = el.querySelector('div');
        if (textDiv) textDiv.style.transform = 'scale(1.1)';
        setTimeout(() => {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 500);
      }, 1200);
    }

    // P0+：朱砂印下压的纸张物理震屏（轻量，模拟落印瞬间的纸面抖动）
    _stampShakeBoard() {
      try {
        if (typeof document === 'undefined') return;
        const target = document.getElementById('board-container') || document.body;
        // 复用动画类，避免重复叠加
        target.classList.remove('eureka-stamp-shake');
        void target.offsetWidth;
        target.classList.add('eureka-stamp-shake');
        setTimeout(() => {
          try { target.classList.remove('eureka-stamp-shake'); } catch (e) {}
        }, 420);
      } catch (e) {}
    }

    // === 心流状态与光晕 ===

    /**
     * 根据当前连击数计算心流状态
     * cold: 0 连击
     * stale: 1-2 连击（微弱活跃）
     * flow: 3 连击及以上（未到 EUREKA）
     * eureka: EUREKA 触发瞬间（由 _triggerEurekaVisual 控制）
     */
    _updateFlowState() {
      let newState = this._currentFlowState;

      if (this._eurekaTriggered && this.count >= this._eurekaLevel) {
        // EUREKA 刚触发后保持 eureka 状态由 _triggerEurekaVisual 控制
        // 这里不覆盖，等定时器衰减
        return;
      }

      if (this.count === 0) {
        newState = 'cold';
      } else if (this.count <= 2) {
        newState = 'stale';
      } else if (this.count < this._eurekaLevel) {
        newState = 'flow';
      } else {
        newState = 'flow'; // EUREKA 级别也属于 flow，视觉上由 eureka 爆发态覆盖
      }

      if (newState !== this._currentFlowState) {
        this._setFlowState(newState);
      } else if (newState === 'flow') {
        // flow 状态下根据连击深度调整强度
        this._updateFlowIntensity();
      }
    }

    _setFlowState(state) {
      this._currentFlowState = state;
      this._ensureFlowGlowEl();

      const el = this._flowGlowEl;
      // 清除所有状态 class
      el.classList.remove('flow-cold', 'flow-stale', 'flow-flow', 'flow-eureka');
      el.classList.add('flow-' + state);

      // 更新连击数字的光晕效果
      this._updateComboGlow();

      // 回调
      if (this.onFlowStateChange) {
        try { this.onFlowStateChange(state, this.count); } catch (e) {}
      }
    }

    _updateFlowIntensity() {
      // flow 状态下，根据连击数占比计算强度（15% - 30%）
      const el = this._flowGlowEl;
      if (!el) return;
      const flowRange = this._eurekaLevel - 3; // flow 范围
      const progress = Math.min(1, Math.max(0, (this.count - 3) / Math.max(1, flowRange)));
      const intensity = 15 + progress * 15; // 15% - 30%
      el.style.setProperty('--flow-intensity', intensity + '%');
    }

    _hideFlowGlow() {
      if (this._flowGlowEl) {
        this._flowGlowEl.classList.remove('flow-cold', 'flow-stale', 'flow-flow', 'flow-eureka');
        this._flowGlowEl.classList.add('flow-cold');
      }
    }

    _ensureFlowGlowEl() {
      if (this._flowGlowEl) return;

      // 尝试在棋盘容器内创建光晕层（V4 使用 #board-container）
      const boardArea = document.getElementById('board-container') || document.getElementById('board-area');
      if (!boardArea) return;

      const el = document.createElement('div');
      el.id = 'flow-glow';
      el.className = 'flow-glow flow-cold';
      boardArea.appendChild(el);
      this._flowGlowEl = el;

      // 注入心流光晕 CSS（如果还没有）
      if (!document.getElementById('flow-glow-keyframes')) {
        const style = document.createElement('style');
        style.id = 'flow-glow-keyframes';
        style.textContent = `
          /* ===== 心流墨晕效果（P1：去外发光，改纸面浸润式内阴影） ===== */
          .flow-glow {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            border-radius: 8px;
            z-index: 5;
            opacity: 0;
            transition: opacity 0.6s ease;
            --flow-intensity: 15%;
          }
          /* cold: 无墨晕 */
          .flow-glow.flow-cold {
            opacity: 0;
            box-shadow: none;
          }
          /* stale: 淡暖墨微呼吸（内阴影，无外发光） */
          .flow-glow.flow-stale {
            opacity: 1;
            box-shadow: inset 0 0 18px 2px rgba(150, 120, 80, 0.06);
            animation: flowStalePulse 4s ease-in-out infinite;
          }
          @keyframes flowStalePulse {
            0%, 100% { box-shadow: inset 0 0 14px 2px rgba(150, 120, 80, 0.05); }
            50%      { box-shadow: inset 0 0 24px 4px rgba(150, 120, 80, 0.09); }
          }
          /* flow: 烛金墨晕（暖调纸面浸润），强度随连击递增 */
          .flow-glow.flow-flow {
            opacity: 1;
            animation: flowPulse 2.5s ease-in-out infinite;
          }
          @keyframes flowPulse {
            0%, 100% {
              box-shadow: inset 0 0 24px 5px rgba(201, 149, 106, calc(var(--flow-intensity, 15%) * 0.7));
            }
            50% {
              box-shadow: inset 0 0 42px 9px rgba(201, 149, 106, var(--flow-intensity, 15%));
            }
          }
          /* eureka: 朱砂墨晕爆发（内阴影扩张，无外发光） */
          .flow-glow.flow-eureka {
            opacity: 1;
            animation: flowEurekaBurst 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          @keyframes flowEurekaBurst {
            0% {
              box-shadow: inset 0 0 18px 4px rgba(163, 53, 42, 0.20);
            }
            20% {
              box-shadow: inset 0 0 70px 18px rgba(163, 53, 42, 0.35);
            }
            100% {
              box-shadow: inset 0 0 34px 7px rgba(163, 53, 42, 0.14);
            }
          }
          /* 连击数字心流墨色（无发光） */
          .combo-number.flow-glow-warm {
            text-shadow:
              0 1px 0 rgba(255,255,255,0.10),
              0 2px 5px rgba(60, 40, 10, 0.30) !important;
            color: #5c4510 !important;
          }
          .combo-number.flow-glow-gold {
            text-shadow:
              0 1px 0 rgba(255,255,255,0.12),
              0 2px 5px rgba(80, 30, 20, 0.28) !important;
            color: #a3352a !important;
            animation: eurekaGoldFlash 0.5s ease-in-out infinite alternate !important;
          }
          @keyframes eurekaGoldFlash {
            from { transform: rotate(-2deg) scale(1); }
            to   { transform: rotate(-2deg) scale(1.05); }
          }
        `;
        document.head.appendChild(style);
      }
    }

    _updateComboGlow() {
      if (!this._comboEl) return;
      const numEl = this._comboEl.querySelector('.combo-number');
      if (!numEl) return;

      numEl.classList.remove('flow-glow-warm', 'flow-glow-gold');

      if (this._currentFlowState === 'eureka') {
        numEl.classList.add('flow-glow-gold');
      } else if (this._currentFlowState === 'flow') {
        numEl.classList.add('flow-glow-warm');
      }
    }

    _spawnParticles(count) {
      if (!this._particlesContainer) return;

      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        const isInk = Math.random() < 0.6; // 60% 墨点，40% 纸屑
        const size = 3 + Math.random() * 8;
        const colors = ['#3d2a1a', '#2d1f10', '#4a3520', '#5a4030', '#8a6d3b'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const startX = 45 + (Math.random() - 0.5) * 30;
        const startY = 35 + Math.random() * 25;
        const tx = (Math.random() - 0.5) * 250;
        const ty = -80 - Math.random() * 200;

        if (isInk) {
          // 墨点：不规则形状，无光泽
          const rx = size;
          const ry = size * (0.4 + Math.random() * 0.6);
          const skew = (Math.random() - 0.5) * 30;
          p.style.cssText = `
            position: absolute;
            left: ${startX}%;
            top: ${startY}%;
            width: ${rx}px;
            height: ${ry}px;
            background: ${color};
            border-radius: ${40 + Math.random() * 60}% ${20 + Math.random() * 40}% ${50 + Math.random() * 30}% ${30 + Math.random() * 50}%;
            transform: rotate(${Math.random() * 360}deg) skew(${skew}deg);
            opacity: ${0.3 + Math.random() * 0.4};
            --tx: ${tx}px;
            --ty: ${ty}px;
            animation: particleFloat 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
          `;
        } else {
          // 纸屑：小矩形碎片，淡米色
          const w = 3 + Math.random() * 6;
          const h = 2 + Math.random() * 4;
          p.style.cssText = `
            position: absolute;
            left: ${startX}%;
            top: ${startY}%;
            width: ${w}px;
            height: ${h}px;
            background: ${['#e8dcc8', '#dcd0b8', '#f0e8d4', '#d4c8a8'][Math.floor(Math.random() * 4)]};
            border-radius: 1px;
            transform: rotate(${Math.random() * 360}deg);
            opacity: ${0.4 + Math.random() * 0.3};
            --tx: ${tx}px;
            --ty: ${ty}px;
            animation: particleFloat 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
          `;
        }
        this._particlesContainer.appendChild(p);

        // 动画结束后移除
        setTimeout(() => {
          if (p.parentNode) p.parentNode.removeChild(p);
        }, 2000);
      }
    }
  }

export { ComboSystem };
