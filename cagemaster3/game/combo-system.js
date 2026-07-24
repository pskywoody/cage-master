// ==========================================
//  ComboSystem - 连击系统
// ==========================================
//  连续正确填数触发连击，达到里程碑触发奖励反馈
//  支持双路径 EUREKA：连击型 + 灵感型
//  支持新手保护（低难度盘面阈值降低）
// ==========================================

;(function(global) {
  'use strict';

  // 连击里程碑定义（标准 9x9 模式）
  const MILESTONES = {
    3:  { key: 'combo_3',  label: '3连击',  sfx: 'combo_3' },
    5:  { key: 'combo_5',  label: '5连击',  sfx: 'combo_3' },
    8:  { key: 'eureka',   label: 'EUREKA!', sfx: 'eureka' },
    10: { key: 'combo_max', label: 'MAX连击', sfx: 'combo_max' },
  };

  // 新手保护里程碑（4x4 模式）
  const MILESTONES_NOVICE = {
    2: { key: 'combo_3',   label: '2连击',  sfx: 'combo_3' },
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
      this.gridSize = config.gridSize || 9;
      this.isNewPlayer = config.isNewPlayer || false;

      // 回调
      this.onComboChange = config.onComboChange || null;
      this.onMilestone = config.onMilestone || null;
      this.onEureka = config.onEureka || null;
      this.onBreak = config.onBreak || null;

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

      this._initMilestones();
    }

    // === 根据盘面尺寸和新手状态计算里程碑 ===
    _initMilestones() {
      if (this.isNewPlayer || this.gridSize <= 4) {
        this._milestones = MILESTONES_NOVICE;
      } else if (this.gridSize === 6) {
        // 6x6：适度降低
        this._milestones = {
          3: { key: 'combo_3',  label: '3连击',  sfx: 'combo_3' },
          5: { key: 'combo_5',  label: '5连击',  sfx: 'combo_3' },
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
      this._hideComboUI();
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
        top: 80px;
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
          font-size: 48px;
          font-weight: 900;
          color: #f59e0b;
          text-shadow: 0 2px 8px rgba(245, 158, 11, 0.5), 0 0 20px rgba(245, 158, 11, 0.3);
          font-family: 'Impact', 'Arial Black', sans-serif;
          letter-spacing: 2px;
          line-height: 1;
        ">0</div>
        <div class="combo-label" style="
          font-size: 14px;
          font-weight: 700;
          color: #fbbf24;
          text-transform: uppercase;
          letter-spacing: 3px;
          margin-top: 4px;
          opacity: 0.8;
        ">COMBO</div>
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
        background: radial-gradient(circle, rgba(251, 191, 36, 0.6) 0%, rgba(251, 191, 36, 0) 70%);
        z-index: 11000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
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

      this._ensureComboEl();
      const numEl = this._comboEl.querySelector('.combo-number');
      const labelEl = this._comboEl.querySelector('.combo-label');

      numEl.textContent = this.count;

      // 显示
      this._comboEl.style.opacity = '1';
      this._comboEl.style.transform = 'translateY(0)';

      // 弹跳动画
      numEl.style.animation = 'none';
      // 强制重排
      numEl.offsetHeight;
      numEl.style.animation = 'comboBounce 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';

      // 根据连击等级变色
      let color = '#f59e0b'; // 默认琥珀
      let glow = 'rgba(245, 158, 11, 0.5)';
      if (this.count >= this._maxLevel) {
        color = '#ef4444'; glow = 'rgba(239, 68, 68, 0.6)'; // 红
      } else if (this.count >= this._eurekaLevel) {
        color = '#a855f7'; glow = 'rgba(168, 85, 247, 0.6)'; // 紫
      } else if (this.count >= 5) {
        color = '#3b82f6'; glow = 'rgba(59, 130, 246, 0.5)'; // 蓝
      }
      numEl.style.color = color;
      numEl.style.textShadow = `0 2px 8px ${glow}, 0 0 20px ${glow}`;
      labelEl.style.color = color;

      // 添加关键帧动画（如果还没有）
      if (!document.getElementById('combo-keyframes')) {
        const style = document.createElement('style');
        style.id = 'combo-keyframes';
        style.textContent = `
          @keyframes comboBounce {
            0%   { transform: scale(1); }
            50%  { transform: scale(1.4); }
            100% { transform: scale(1); }
          }
          @keyframes eurekaShake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
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
      labelEl.textContent = milestone.label;
      labelEl.style.animation = 'none';
      labelEl.offsetHeight;
      labelEl.style.animation = 'comboBounce 0.5s ease';
    }

    _triggerEurekaVisual() {
      this._ensureEurekaFlashEl();
      this._ensureComboEl();

      // 全屏闪光
      this._eurekaFlashEl.style.opacity = '1';
      setTimeout(() => {
        if (this._eurekaFlashEl) {
          this._eurekaFlashEl.style.opacity = '0';
        }
      }, 300);

      // 连击数字抖动
      const numEl = this._comboEl.querySelector('.combo-number');
      numEl.style.animation = 'eurekaShake 0.5s ease';

      // 生成粒子
      this._spawnParticles(20);

      // 更新 label
      const labelEl = this._comboEl.querySelector('.combo-label');
      labelEl.textContent = 'EUREKA!';
    }

    _spawnParticles(count) {
      if (!this._particlesContainer) return;

      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        const size = 6 + Math.random() * 10;
        const colors = ['#fbbf24', '#f59e0b', '#a855f7', '#ec4899', '#3b82f6'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const startX = 50 + (Math.random() - 0.5) * 20; // 中心附近
        const startY = 30 + Math.random() * 20;
        const tx = (Math.random() - 0.5) * 400;
        const ty = -100 - Math.random() * 300;

        p.style.cssText = `
          position: absolute;
          left: ${startX}%;
          top: ${startY}%;
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          border-radius: 50%;
          --tx: ${tx}px;
          --ty: ${ty}px;
          animation: particleFloat 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
          box-shadow: 0 0 6px ${color};
        `;
        this._particlesContainer.appendChild(p);

        // 动画结束后移除
        setTimeout(() => {
          if (p.parentNode) p.parentNode.removeChild(p);
        }, 1300);
      }
    }
  }

  global.ComboSystem = ComboSystem;
})(typeof window !== 'undefined' ? window : this);
