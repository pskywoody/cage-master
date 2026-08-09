// ==========================================
// AnimationController - 动画控制器
// ==========================================
// 功能：
//   - 缓动函数（easeInOutQuad, easeOutCubic, easeOutBounce, easeInElastic）
//   - 工具方法（lerp, clamp）
//   - 动画队列（串行执行）
//   - 教学演示动画（高亮格子/行/列/宫/按钮，聚焦/抖动/脉冲/聚光灯/冻结）
//   - 高阶技术重播（X-Wing, Swordfish）
//   - requestAnimationFrame 动画循环
//   - 帧率记录与性能监控集成
// ==========================================

export class AnimationController {
  /**
   * @param {Object} options
   * @param {BoardRenderer} [options.boardRenderer] - 棋盘渲染器实例
   * @param {EffectRenderer} [options.effectRenderer] - 特效渲染器实例
   * @param {PerformanceMonitor} [options.performanceMonitor] - 性能监控实例
   */
  constructor(options) {
    options = options || {};

    /** @type {BoardRenderer|null} */
    this._boardRenderer = options.boardRenderer || null;

    /** @type {EffectRenderer|null} */
    this._effectRenderer = options.effectRenderer || null;

    /** @type {PerformanceMonitor|null} */
    this._performanceMonitor = options.performanceMonitor || null;

    // ---- 动画队列 ----
    /** @type {Array<Object>} */
    this._queue = [];

    /** @type {boolean} */
    this._isProcessing = false;

    /** @type {Object|null} 当前正在执行的动画 */
    this._currentAnimation = null;

    /** @type {number} 当前动画已耗时（毫秒） */
    this._currentAnimElapsed = 0;

    // ---- 活跃动画（并行） ----
    /** @type {Array<Object>} */
    this._activeAnimations = [];

    // ---- 动画循环 ----
    /** @type {number|null} requestAnimationFrame ID */
    this._rafId = null;

    /** @type {boolean} 循环是否正在运行 */
    this._loopRunning = false;

    /** @type {number} 上一帧时间戳 */
    this._lastFrameTime = 0;

    /** @type {number} 循环累计时间 */
    this._elapsed = 0;

    // ---- 演示状态 ----
    /** @type {Array<Object>|null} 待播放的演示步骤列表 */
    this._demoSteps = null;

    /** @type {number} 当前演示步骤索引 */
    this._demoIndex = 0;

    /** @type {Function|null} 演示完成回调 */
    this._demoOnComplete = null;

    /** @type {boolean} 是否跳过演示 */
    this._demoSkipped = false;

    // ---- 微型教学（Hint Loop）状态 ----
    /** @type {Array<Object>|null} 待播放的提示动作序列 */
    this._hintSteps = null;
    /** @type {number} 当前提示步骤索引 */
    this._hintIndex = 0;
    /** @type {Function|null} 提示完成回调 */
    this._hintOnComplete = null;
    /** @type {Function|null} 提示动作应用回调（onAction 管道） */
    this._hintOnAction = null;
    /** @type {boolean} 是否跳过提示演示 */
    this._hintSkipped = false;
    /** @type {number|null} 提示步骤定时器 */
    this._hintTimer = null;
    /** @type {number} 提示步骤间隔（毫秒） */
    this._hintStepInterval = 600;

    // ---- 聚光灯状态 ----
    /** @type {boolean} */
    this._spotlightEnabled = false;

    /** @type {number} */
    this._spotlightIntensity = 0;

    // ---- 冻结状态 ----
    /** @type {boolean} */
    this._frozen = false;

    // ---- 帧率统计 ----
    /** @type {number} 帧计数器 */
    this._frameCount = 0;

    /** @type {number} 累计帧时间 */
    this._accumulatedTime = 0;

    // 自动启动动画循环
    this.startLoop();
  }

  // ================================================================
  //  缓动函数
  // ================================================================

  /**
   * easeInOutQuad - 平滑加速减速
   * @param {number} t - 进度 0~1
   * @returns {number}
   */
  easeInOutQuad(t) {
    try {
      const v = this.clamp(t, 0, 1);
      return v < 0.5 ? 2 * v * v : -1 + (4 - 2 * v) * v;
    } catch (e) {
      console.error('[AnimationController] easeInOutQuad error:', e);
      return t;
    }
  }

  /**
   * easeOutCubic - 快速减速
   * @param {number} t - 进度 0~1
   * @returns {number}
   */
  easeOutCubic(t) {
    try {
      const v = this.clamp(t, 0, 1);
      return 1 - Math.pow(1 - v, 3);
    } catch (e) {
      console.error('[AnimationController] easeOutCubic error:', e);
      return t;
    }
  }

  /**
   * easeOutBounce - 弹跳效果
   * @param {number} t - 进度 0~1
   * @returns {number}
   */
  easeOutBounce(t) {
    try {
      const v = this.clamp(t, 0, 1);
      const n1 = 7.5625;
      const d1 = 2.75;
      if (v < 1 / d1) {
        return n1 * v * v;
      } else if (v < 2 / d1) {
        return n1 * (v -= 1.5 / d1) * v + 0.75;
      } else if (v < 2.5 / d1) {
        return n1 * (v -= 2.25 / d1) * v + 0.9375;
      } else {
        return n1 * (v -= 2.625 / d1) * v + 0.984375;
      }
    } catch (e) {
      console.error('[AnimationController] easeOutBounce error:', e);
      return t;
    }
  }

  /**
   * easeInElastic - 弹性进入效果
   * @param {number} t - 进度 0~1
   * @returns {number}
   */
  easeInElastic(t) {
    try {
      const v = this.clamp(t, 0, 1);
      if (v === 0 || v === 1) return v;
      const c4 = (2 * Math.PI) / 3;
      return -Math.pow(2, 10 * v - 10) * Math.sin((v * 10 - 10.75) * c4);
    } catch (e) {
      console.error('[AnimationController] easeInElastic error:', e);
      return t;
    }
  }

  // ================================================================
  //  工具方法
  // ================================================================

  /**
   * lerp - 线性插值
   * @param {number} a - 起始值
   * @param {number} b - 结束值
   * @param {number} t - 插值因子 0~1
   * @returns {number}
   */
  lerp(a, b, t) {
    try {
      return a + (b - a) * this.clamp(t, 0, 1);
    } catch (e) {
      console.error('[AnimationController] lerp error:', e);
      return a;
    }
  }

  /**
   * clamp - 数值裁剪
   * @param {number} val - 输入值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {number}
   */
  clamp(val, min, max) {
    try {
      return Math.min(Math.max(val, min), max);
    } catch (e) {
      console.error('[AnimationController] clamp error:', e);
      return val;
    }
  }

  // ================================================================
  //  动画队列
  // ================================================================

  /**
   * enqueue - 添加动画到队列
   * @param {Object} animation - 动画对象
   * @param {string} animation.type - 动画类型
   * @param {number} [animation.duration=300] - 动画时长（毫秒）
   * @param {Function} [animation.easing] - 缓动函数
   * @param {Function} [animation.onStart] - 动画开始回调
   * @param {Function} [animation.onUpdate] - 动画更新回调(progress, t)
   * @param {Function} [animation.onComplete] - 动画完成回调
   */
  enqueue(animation) {
    try {
      if (!animation) return;
      this._queue.push({
        type: animation.type || 'generic',
        duration: animation.duration || 300,
        easing: animation.easing || this.easeInOutQuad.bind(this),
        onStart: animation.onStart || null,
        onUpdate: animation.onUpdate || null,
        onComplete: animation.onComplete || null,
      });
      // 如果队列未在处理中，开始处理
      if (!this._isProcessing) {
        this._processQueue();
      }
    } catch (e) {
      console.error('[AnimationController] enqueue error:', e);
    }
  }

  /**
   * dequeue - 取出下一个动画
   * @returns {Object|null}
   */
  dequeue() {
    try {
      return this._queue.length > 0 ? this._queue.shift() : null;
    } catch (e) {
      console.error('[AnimationController] dequeue error:', e);
      return null;
    }
  }

  /**
   * clear - 清空队列
   */
  clear() {
    try {
      this._queue = [];
      this._currentAnimation = null;
      this._currentAnimElapsed = 0;
      this._isProcessing = false;
    } catch (e) {
      console.error('[AnimationController] clear error:', e);
    }
  }

  /**
   * _processQueue - 处理队列中的下一个动画
   * @private
   */
  _processQueue() {
    try {
      if (this._isProcessing) return;
      if (this._queue.length === 0) {
        this._isProcessing = false;
        return;
      }

      this._isProcessing = true;
      this._currentAnimation = this.dequeue();
      this._currentAnimElapsed = 0;

      // 触发 onStart
      if (this._currentAnimation && typeof this._currentAnimation.onStart === 'function') {
        this._currentAnimation.onStart();
      }
    } catch (e) {
      console.error('[AnimationController] _processQueue error:', e);
      this._isProcessing = false;
    }
  }

  /**
   * _updateQueueAnimation - 更新当前队列动画进度
   * @param {number} deltaMs - 上一帧到当前帧的毫秒数
   * @private
   */
  _updateQueueAnimation(deltaMs) {
    try {
      if (!this._currentAnimation) return;

      this._currentAnimElapsed += deltaMs;
      const duration = this._currentAnimation.duration || 300;
      const progress = duration > 0 ? this.clamp(this._currentAnimElapsed / duration, 0, 1) : 1;
      const t = this._currentAnimation.easing ? this._currentAnimation.easing(progress) : progress;

      // 触发 onUpdate
      if (typeof this._currentAnimation.onUpdate === 'function') {
        this._currentAnimation.onUpdate(progress, t);
      }

      // 动画完成
      if (progress >= 1) {
        if (typeof this._currentAnimation.onComplete === 'function') {
          this._currentAnimation.onComplete();
        }
        this._currentAnimation = null;
        this._currentAnimElapsed = 0;
        this._isProcessing = false;

        // 处理下一个队列动画
        if (this._queue.length > 0) {
          this._processQueue();
        }
      }
    } catch (e) {
      console.error('[AnimationController] _updateQueueAnimation error:', e);
      // 出错时强制完成当前动画，继续下一个
      this._currentAnimation = null;
      this._currentAnimElapsed = 0;
      this._isProcessing = false;
      if (this._queue.length > 0) {
        this._processQueue();
      }
    }
  }

  // ================================================================
  //  教学演示动画
  // ================================================================

  /**
   * playDemoStep - 执行单个教学演示步骤
   * @param {Object} step - 演示步骤对象
   */
  playDemoStep(step) {
    try {
      if (!step || !step.type) return;

      switch (step.type) {
        case 'highlightCell':
          this._demoHighlightCell(step);
          break;
        case 'highlightRow':
          this._demoHighlightRow(step);
          break;
        case 'highlightCol':
          this._demoHighlightCol(step);
          break;
        case 'highlightBox':
          this._demoHighlightBox(step);
          break;
        case 'highlightButton':
          this._demoHighlightButton(step);
          break;
        case 'focusCell':
          this._demoFocusCell(step);
          break;
        case 'shakeCell':
          this._demoShakeCell(step);
          break;
        case 'pulseCell':
          this._demoPulseCell(step);
          break;
        case 'spotlight':
          this._demoSpotlight(step);
          break;
        case 'freeze':
          this._demoFreeze(step);
          break;
        default:
          console.warn('[AnimationController] Unknown demo step type:', step.type);
      }
    } catch (e) {
      console.error('[AnimationController] playDemoStep error:', e);
    }
  }

  /**
   * playDemoSteps - 播放完整演示步骤序列
   * @param {Array<Object>} steps - 演示步骤数组
   * @param {Function} [onComplete] - 全部完成回调
   */
  playDemoSteps(steps, onComplete) {
    try {
      if (!steps || !Array.isArray(steps) || steps.length === 0) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      this._demoSteps = steps.slice();
      this._demoIndex = 0;
      this._demoOnComplete = onComplete || null;
      this._demoSkipped = false;

      this._playNextDemoStep();
    } catch (e) {
      console.error('[AnimationController] playDemoSteps error:', e);
    }
  }

  /**
   * skipDemo - 跳过当前演示
   */
  skipDemo() {
    try {
      this._demoSkipped = true;
      this._demoSteps = null;
      this._demoIndex = 0;

      // 清空队列中的演示相关动画
      this.clear();

      // 重置状态
      this._spotlightEnabled = false;
      this._spotlightIntensity = 0;
      this._frozen = false;

      // 重置棋盘高亮
      if (this._boardRenderer && typeof this._boardRenderer.setHighlight === 'function') {
        this._boardRenderer.setHighlight(null, null);
      }

      // 重置特效
      if (this._effectRenderer && typeof this._effectRenderer.resetAnimation === 'function') {
        this._effectRenderer.resetAnimation();
      }

      if (typeof this._demoOnComplete === 'function') {
        const cb = this._demoOnComplete;
        this._demoOnComplete = null;
        cb();
      }
    } catch (e) {
      console.error('[AnimationController] skipDemo error:', e);
    }
  }

  /**
   * playHintSteps - 播放微型教学提示动作序列（2026-08-03）
   * 复用 LessonPlayer 的 onAction 渲染管道：每个动作通过 onAction 回调
   * 交给 GameApp._applyLessonAction（或 applyHintAction）驱动渲染。
   * 每步间隔 600ms，支持 skipHintSteps() 跳过，播放结束调 onComplete。
   * @param {Array<Object>} actions - 提示动作序列（hint-adapter 输出）
   * @param {Function} [onAction] - 每步应用回调 (action) => void
   * @param {Function} [onComplete] - 全部完成回调
   */
  playHintSteps(actions, onAction, onComplete) {
    try {
      this.skipHintSteps(true); // 静默清理旧序列
      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      this._hintSteps = actions.slice();
      this._hintIndex = 0;
      this._hintOnComplete = onComplete || null;
      this._hintOnAction = (typeof onAction === 'function') ? onAction : null;
      this._hintSkipped = false;
      this._playNextHintStep();
    } catch (e) {
      console.error('[AnimationController] playHintSteps error:', e);
    }
  }

  /**
   * skipHintSteps - 跳过当前提示演示（点击跳过）
   * @param {boolean} [silent] - true 则静默清理（不触发完成回调）
   */
  skipHintSteps(silent) {
    try {
      this._hintSkipped = true;
      this._hintSteps = null;
      this._hintIndex = 0;
      this._hintWaitingTap = false; // Q5：点击推进——跳过时清除等待
      if (this._hintTimer !== null) {
        clearTimeout(this._hintTimer);
        this._hintTimer = null;
      }
      if (silent !== true) {
        // 非静默：触发完成回调（进入锁定模式）
        if (typeof this._hintOnComplete === 'function') {
          const cb = this._hintOnComplete;
          this._hintOnComplete = null;
          cb();
        }
      } else {
        this._hintOnComplete = null;
      }
      this._hintOnAction = null;
    } catch (e) {
      console.error('[AnimationController] skipHintSteps error:', e);
    }
  }

  /**
   * _playNextHintStep - 播放下一个提示动作
   * @private
   */
  _playNextHintStep() {
    try {
      if (this._hintSkipped || !this._hintSteps || this._hintIndex >= this._hintSteps.length) {
        const done = this._hintSkipped;
        this._hintSteps = null;
        this._hintIndex = 0;
        if (!done && typeof this._hintOnComplete === 'function') {
          const cb = this._hintOnComplete;
          this._hintOnComplete = null;
          this._hintOnAction = null;
          cb();
        }
        return;
      }

      const action = this._hintSteps[this._hintIndex];
      this._hintIndex++;

      // 通过 onAction 回调应用动作（复用 LessonPlayer 渲染管道）
      if (this._hintOnAction) {
        try { this._hintOnAction(action); } catch (e) { console.warn('[AnimationController] hint onAction error:', e); }
      }
      // 内置特效补充：eliminate/success 粒子
      this._hintSpawnFx(action);

      // Q5：点击推进——动作带 text（触发讲解气泡）时暂停，等玩家点击气泡
      // 后再播下一步；无 text 的动作（纯高亮/聚光灯）按 600ms 自动推进
      if (action && action.text) {
        this._hintWaitingTap = true;
        return;
      }

      // 定时播放下一步
      this._hintTimer = setTimeout(() => {
        this._hintTimer = null;
        if (!this._hintSkipped) {
          this._playNextHintStep();
        }
      }, this._hintStepInterval);
    } catch (e) {
      console.error('[AnimationController] _playNextHintStep error:', e);
    }
  }

  /**
   * Q5：继续播放下一步（玩家点击讲解气泡后调用）
   * 由页面层气泡 onComplete 回调触发；无等待时忽略
   */
  continueHintSteps() {
    try {
      if (!this._hintWaitingTap) return false;
      this._hintWaitingTap = false;
      this._playNextHintStep();
      return true;
    } catch (e) {
      console.error('[AnimationController] continueHintSteps error:', e);
      return false;
    }
  }

  /**
   * _hintSpawnFx - 提示动作的粒子特效补充
   * @param {Object} action
   * @private
   */
  _hintSpawnFx(action) {
    // Q17：提示动画粒子特效已移除——pulse 金色粒子、success 青墨绿粒子、eliminate 红粒子
    // 在聚光灯暗化下是玩家反复看到的"黄/绿坨坨"；红叉、高亮、逐格文案已足以表达教学，
    // 粒子是纯噪音。此方法保留签名（调用方不变），内部不再生成任何粒子。
    return;
    // (原实现已停用)
  }

  /**
   * _playNextDemoStep - 播放下一个演示步骤
   * @private
   */
  _playNextDemoStep() {
    try {
      if (this._demoSkipped || !this._demoSteps || this._demoIndex >= this._demoSteps.length) {
        this._demoSteps = null;
        this._demoIndex = 0;
        if (typeof this._demoOnComplete === 'function') {
          const cb = this._demoOnComplete;
          this._demoOnComplete = null;
          cb();
        }
        return;
      }

      const step = this._demoSteps[this._demoIndex];
      this._demoIndex++;

      // 将演示步骤包装为队列动画，完成后自动播放下一个
      const duration = step.duration || 500;
      const easing = this.easeInOutQuad.bind(this);

      this.enqueue({
        type: 'demoStep',
        duration: duration,
        easing: easing,
        onStart: () => {
          this.playDemoStep(step);
        },
        onUpdate: (progress, t) => {
          // 某些步骤需要持续更新（如脉冲、抖动）
          this._updateDemoStep(step, progress, t);
        },
        onComplete: () => {
          this._cleanupDemoStep(step);
          // 检查是否需要跳过
          if (this._demoSkipped) return;
          // 延迟一小段时间再播放下一个，让视觉效果有间隔
          setTimeout(() => {
            if (!this._demoSkipped) {
              this._playNextDemoStep();
            }
          }, 50);
        },
      });
    } catch (e) {
      console.error('[AnimationController] _playNextDemoStep error:', e);
    }
  }

  /**
   * _demoHighlightCell - 高亮单个格子
   * @param {Object} step
   * @private
   */
  _demoHighlightCell(step) {
    try {
      if (!this._boardRenderer) return;
      const [r, c] = step.target || [0, 0];
      const color = step.color || 'selected';
      this._boardRenderer.setHighlight(r, c, color);
      // 触发特效粒子
      if (this._effectRenderer && typeof this._effectRenderer.spawnParticles === 'function') {
        this._effectRenderer.spawnParticles(c, r, '#ffa726', 10);
      }
    } catch (e) {
      console.error('[AnimationController] _demoHighlightCell error:', e);
    }
  }

  /**
   * _demoHighlightRow - 高亮整行
   * @param {Object} step
   * @private
   */
  _demoHighlightRow(step) {
    try {
      if (!this._boardRenderer) return;
      const row = step.target;
      if (row === undefined || row === null) return;
      this._boardRenderer.setHighlight(row, 0, 'selected');
    } catch (e) {
      console.error('[AnimationController] _demoHighlightRow error:', e);
    }
  }

  /**
   * _demoHighlightCol - 高亮整列
   * @param {Object} step
   * @private
   */
  _demoHighlightCol(step) {
    try {
      if (!this._boardRenderer) return;
      const col = step.target;
      if (col === undefined || col === null) return;
      this._boardRenderer.setHighlight(0, col, 'selected');
    } catch (e) {
      console.error('[AnimationController] _demoHighlightCol error:', e);
    }
  }

  /**
   * _demoHighlightBox - 高亮整个宫
   * @param {Object} step
   * @private
   */
  _demoHighlightBox(step) {
    try {
      if (!this._boardRenderer) return;
      const boxIndex = step.target;
      if (boxIndex === undefined || boxIndex === null) return;
      // 将宫索引转换为格子坐标
      const boxSize = 3;
      const r = Math.floor(boxIndex / boxSize) * boxSize;
      const c = (boxIndex % boxSize) * boxSize;
      this._boardRenderer.setHighlight(r, c, 'selected');
    } catch (e) {
      console.error('[AnimationController] _demoHighlightBox error:', e);
    }
  }

  /**
   * _demoHighlightButton - 高亮 UI 按钮
   * @param {Object} step
   * @private
   */
  _demoHighlightButton(step) {
    try {
      // 按钮高亮通过 DOM 操作实现
      const buttonId = step.target;
      if (!buttonId) return;
      const btn = typeof document !== 'undefined' ? document.getElementById(buttonId) : null;
      if (btn) {
        btn.style.boxShadow = '0 0 12px 4px rgba(255, 167, 38, 0.8)';
        btn.style.transition = 'box-shadow 0.3s ease';
      }
    } catch (e) {
      console.error('[AnimationController] _demoHighlightButton error:', e);
    }
  }

  /**
   * _demoFocusCell - 聚焦格子（放大或高亮边框）
   * @param {Object} step
   * @private
   */
  _demoFocusCell(step) {
    try {
      if (!this._boardRenderer) return;
      const [r, c] = step.target || [0, 0];
      this._boardRenderer.setHighlight(r, c, 'selected');
    } catch (e) {
      console.error('[AnimationController] _demoFocusCell error:', e);
    }
  }

  /**
   * _demoShakeCell - 抖动格子
   * @param {Object} step
   * @private
   */
  _demoShakeCell(step) {
    try {
      const [r, c] = step.target || [0, 0];
      const duration = (step.duration || 500) / 1000;

      // 创建一个活跃动画用于抖动
      this._activeAnimations.push({
        type: 'shakeCell',
        target: [r, c],
        elapsed: 0,
        duration: duration,
      });
    } catch (e) {
      console.error('[AnimationController] _demoShakeCell error:', e);
    }
  }

  /**
   * _demoPulseCell - 脉冲格子
   * @param {Object} step
   * @private
   */
  _demoPulseCell(step) {
    try {
      const [r, c] = step.target || [0, 0];
      const duration = (step.duration || 800) / 1000;

      this._activeAnimations.push({
        type: 'pulseCell',
        target: [r, c],
        elapsed: 0,
        duration: duration,
      });
    } catch (e) {
      console.error('[AnimationController] _demoPulseCell error:', e);
    }
  }

  /**
   * _demoSpotlight - 聚光灯效果
   * @param {Object} step
   * @private
   */
  _demoSpotlight(step) {
    try {
      this._spotlightEnabled = step.enabled === true || step.enabled === undefined ? true : false;
      this._spotlightIntensity = step.intensity !== undefined ? step.intensity : 0.5;
    } catch (e) {
      console.error('[AnimationController] _demoSpotlight error:', e);
    }
  }

  /**
   * _demoFreeze - 冻结/解冻
   * @param {Object} step
   * @private
   */
  _demoFreeze(step) {
    try {
      this._frozen = step.enabled === true;
    } catch (e) {
      console.error('[AnimationController] _demoFreeze error:', e);
    }
  }

  /**
   * _updateDemoStep - 更新演示步骤的持续效果
   * @param {Object} step
   * @param {number} progress
   * @param {number} t
   * @private
   */
  _updateDemoStep(step, progress, t) {
    try {
      if (!step) return;
      // 部分步骤通过 _activeAnimations 处理，无需额外更新
    } catch (e) {
      console.error('[AnimationController] _updateDemoStep error:', e);
    }
  }

  /**
   * _cleanupDemoStep - 清理演示步骤的副作用
   * @param {Object} step
   * @private
   */
  _cleanupDemoStep(step) {
    try {
      if (!step) return;
      switch (step.type) {
        case 'highlightCell':
        case 'focusCell':
          if (this._boardRenderer && typeof this._boardRenderer.setHighlight === 'function') {
            this._boardRenderer.setHighlight(null, null);
          }
          break;
        case 'highlightRow':
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(null, null);
          }
          break;
        case 'highlightCol':
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(null, null);
          }
          break;
        case 'highlightBox':
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(null, null);
          }
          break;
        case 'highlightButton': {
          const buttonId = step.target;
          if (buttonId) {
            const btn = typeof document !== 'undefined' ? document.getElementById(buttonId) : null;
            if (btn) {
              btn.style.boxShadow = '';
            }
          }
          break;
        }
        case 'shakeCell':
        case 'pulseCell':
          // 动画会自动结束
          break;
        default:
          break;
      }
    } catch (e) {
      console.error('[AnimationController] _cleanupDemoStep error:', e);
    }
  }

  // ================================================================
  //  高阶技术重播
  // ================================================================

  /**
   * replayXWing - 重播 X-Wing 发现过程
   * @param {number[]} rows - 两行行号 [r1, r2]
   * @param {number[]} cols - 两列列号 [c1, c2]
   * @param {Function} [onComplete] - 完成回调
   */
  replayXWing(rows, cols, onComplete) {
    try {
      if (!rows || !cols || rows.length < 2 || cols.length < 2) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      const [r1, r2] = rows;
      const [c1, c2] = cols;
      const color = '#ff6b6b';

      // 阶段 1: 高亮两行
      this.enqueue({
        type: 'xwing_highlightRows',
        duration: 400,
        easing: this.easeInOutQuad.bind(this),
        onStart: () => {
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(r1, 0, 'selected');
          }
        },
        onUpdate: (progress, t) => {
          this._xwingState = {
            phase: 'highlightRows',
            rows: rows,
            cols: cols,
            color: color,
            progress: progress,
            t: t,
          };
        },
        onComplete: () => {
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(null, null);
          }
        },
      });

      // 阶段 2: 高亮两列
      this.enqueue({
        type: 'xwing_highlightCols',
        duration: 400,
        easing: this.easeInOutQuad.bind(this),
        onStart: () => {
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(0, c1, 'selected');
          }
        },
        onUpdate: (progress, t) => {
          this._xwingState = {
            phase: 'highlightCols',
            rows: rows,
            cols: cols,
            color: color,
            progress: progress,
            t: t,
          };
        },
        onComplete: () => {
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(null, null);
          }
        },
      });

      // 阶段 3: 绘制连线
      this.enqueue({
        type: 'xwing_drawLines',
        duration: 600,
        easing: this.easeOutCubic.bind(this),
        onUpdate: (progress, t) => {
          this._xwingState = {
            phase: 'drawLines',
            rows: rows,
            cols: cols,
            color: color,
            progress: progress,
            t: t,
          };
        },
        onComplete: () => {
          // 连线阶段完成
        },
      });

      // 阶段 4: 排除标记
      this.enqueue({
        type: 'xwing_exclusion',
        duration: 500,
        easing: this.easeOutCubic.bind(this),
        onUpdate: (progress, t) => {
          this._xwingState = {
            phase: 'exclusion',
            rows: rows,
            cols: cols,
            color: color,
            progress: progress,
            t: t,
          };
        },
        onComplete: () => {
          this._xwingState = null;
        },
      });

      // 阶段 5: 完成
      this.enqueue({
        type: 'xwing_complete',
        duration: 300,
        easing: this.easeInOutQuad.bind(this),
        onStart: () => {
          // 粒子庆祝
          if (this._effectRenderer) {
            this._effectRenderer.spawnParticles(c1, r1, '#ff6b6b', 15);
            this._effectRenderer.spawnParticles(c2, r1, '#ff6b6b', 15);
            this._effectRenderer.spawnParticles(c1, r2, '#ff6b6b', 15);
            this._effectRenderer.spawnParticles(c2, r2, '#ff6b6b', 15);
          }
        },
        onComplete: () => {
          if (typeof onComplete === 'function') onComplete();
        },
      });
    } catch (e) {
      console.error('[AnimationController] replayXWing error:', e);
      if (typeof onComplete === 'function') onComplete();
    }
  }

  /**
   * replaySwordfish - 重播 Swordfish 发现过程
   * @param {number[]} rows - 三行行号 [r1, r2, r3]
   * @param {number[]} cols - 三列列号 [c1, c2, c3]
   * @param {Function} [onComplete] - 完成回调
   */
  replaySwordfish(rows, cols, onComplete) {
    try {
      if (!rows || !cols || rows.length < 3 || cols.length < 3) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      const color = '#4fc3f7';

      // 阶段 1: 高亮三行
      this.enqueue({
        type: 'swordfish_highlightRows',
        duration: 400,
        easing: this.easeInOutQuad.bind(this),
        onStart: () => {
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(rows[0], 0, 'selected');
          }
        },
        onUpdate: (progress, t) => {
          this._swordfishState = {
            phase: 'highlightRows',
            rows: rows,
            cols: cols,
            color: color,
            progress: progress,
            t: t,
          };
        },
        onComplete: () => {
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(null, null);
          }
        },
      });

      // 阶段 2: 高亮三列
      this.enqueue({
        type: 'swordfish_highlightCols',
        duration: 400,
        easing: this.easeInOutQuad.bind(this),
        onStart: () => {
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(0, cols[0], 'selected');
          }
        },
        onUpdate: (progress, t) => {
          this._swordfishState = {
            phase: 'highlightCols',
            rows: rows,
            cols: cols,
            color: color,
            progress: progress,
            t: t,
          };
        },
        onComplete: () => {
          if (this._boardRenderer) {
            this._boardRenderer.setHighlight(null, null);
          }
        },
      });

      // 阶段 3: 绘制鱼骨连线
      this.enqueue({
        type: 'swordfish_drawLines',
        duration: 700,
        easing: this.easeOutCubic.bind(this),
        onUpdate: (progress, t) => {
          this._swordfishState = {
            phase: 'drawLines',
            rows: rows,
            cols: cols,
            color: color,
            progress: progress,
            t: t,
          };
        },
        onComplete: () => {
          // 连线阶段完成
        },
      });

      // 阶段 4: 排除标记
      this.enqueue({
        type: 'swordfish_exclusion',
        duration: 500,
        easing: this.easeOutCubic.bind(this),
        onUpdate: (progress, t) => {
          this._swordfishState = {
            phase: 'exclusion',
            rows: rows,
            cols: cols,
            color: color,
            progress: progress,
            t: t,
          };
        },
        onComplete: () => {
          this._swordfishState = null;
        },
      });

      // 阶段 5: 完成
      this.enqueue({
        type: 'swordfish_complete',
        duration: 300,
        easing: this.easeInOutQuad.bind(this),
        onStart: () => {
          if (this._effectRenderer) {
            for (let ri = 0; ri < rows.length; ri++) {
              for (let ci = 0; ci < cols.length; ci++) {
                this._effectRenderer.spawnParticles(cols[ci], rows[ri], '#4fc3f7', 8);
              }
            }
          }
        },
        onComplete: () => {
          if (typeof onComplete === 'function') onComplete();
        },
      });
    } catch (e) {
      console.error('[AnimationController] replaySwordfish error:', e);
      if (typeof onComplete === 'function') onComplete();
    }
  }

  // ================================================================
  //  X-Wing / Swordfish 渲染状态
  // ================================================================

  /**
   * _renderXWingState - 渲染 X-Wing 动画状态
   * @private
   */
  _renderXWingState() {
    try {
      if (!this._xwingState || !this._effectRenderer) return;
      const s = this._xwingState;
      const { rows, cols, color } = s;

      if (s.phase === 'drawLines' || s.phase === 'exclusion') {
        const state = {
          effects: {
            xwing: {
              rows: rows,
              cols: cols,
              color: color,
            },
          },
          size: 9,
        };
        this._effectRenderer.renderEffects(state);
      }
    } catch (e) {
      console.error('[AnimationController] _renderXWingState error:', e);
    }
  }

  /**
   * _renderSwordfishState - 渲染 Swordfish 动画状态
   * @private
   */
  _renderSwordfishState() {
    try {
      if (!this._swordfishState || !this._effectRenderer) return;
      const s = this._swordfishState;
      const { rows, cols, color } = s;

      if (s.phase === 'drawLines' || s.phase === 'exclusion') {
        const state = {
          effects: {
            swordfish: {
              rows: rows,
              cols: cols,
              color: color,
            },
          },
          size: 9,
        };
        this._effectRenderer.renderEffects(state);
      }
    } catch (e) {
      console.error('[AnimationController] _renderSwordfishState error:', e);
    }
  }

  // ================================================================
  //  动画循环
  // ================================================================

  /**
   * startLoop - 启动 requestAnimationFrame 循环
   */
  startLoop() {
    try {
      if (this._loopRunning) return;
      this._loopRunning = true;
      this._lastFrameTime = 0;
      this._frameCount = 0;
      this._accumulatedTime = 0;

      // 兼容 Node.js 环境
      const raf = typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : (typeof global !== 'undefined' && global.requestAnimationFrame
            ? global.requestAnimationFrame.bind(global)
            : this._nodeRaf.bind(this));

      this._rafId = raf(this._tick.bind(this));
    } catch (e) {
      console.error('[AnimationController] startLoop error:', e);
    }
  }

  /**
   * stopLoop - 停止循环
   */
  stopLoop() {
    try {
      this._loopRunning = false;
      if (this._rafId !== null) {
        const caf = typeof window !== 'undefined' && window.cancelAnimationFrame
          ? window.cancelAnimationFrame.bind(window)
          : (typeof global !== 'undefined' && global.cancelAnimationFrame
              ? global.cancelAnimationFrame.bind(global)
              : this._nodeCaf.bind(this));
        caf(this._rafId);
        this._rafId = null;
      }
    } catch (e) {
      console.error('[AnimationController] stopLoop error:', e);
    }
  }

  /**
   * resumeLoop - 恢复循环
   */
  resumeLoop() {
    try {
      if (this._loopRunning) return;
      this._lastFrameTime = 0;
      this.startLoop();
    } catch (e) {
      console.error('[AnimationController] resumeLoop error:', e);
    }
  }

  /**
   * _tick - 动画循环 tick
   * @param {number} timestamp - requestAnimationFrame 提供的时间戳
   * @private
   */
  _tick(timestamp) {
    try {
      if (!this._loopRunning) return;

      // 计算 deltaTime，上限 50ms 防止大跳帧
      if (this._lastFrameTime === 0) {
        this._lastFrameTime = timestamp;
      }
      const deltaMs = Math.min(timestamp - this._lastFrameTime, 50);
      this._lastFrameTime = timestamp;

      // 累计时间
      this._elapsed += deltaMs;
      this._frameCount++;
      this._accumulatedTime += deltaMs;

      // 更新所有动画
      const deltaSeconds = deltaMs / 1000;
      this.update(deltaSeconds);

      // 渲染
      this.render();

      // 记录帧（性能监控）
      if (this._performanceMonitor && typeof this._performanceMonitor.recordFrame === 'function') {
        this._performanceMonitor.recordFrame();
      }

      // 继续下一帧
      if (this._loopRunning) {
        const raf = typeof window !== 'undefined' && window.requestAnimationFrame
          ? window.requestAnimationFrame.bind(window)
          : this._nodeRaf.bind(this);
        this._rafId = raf(this._tick.bind(this));
      }
    } catch (e) {
      console.error('[AnimationController] _tick error:', e);
      // 出错时尝试继续循环
      if (this._loopRunning) {
        const raf = typeof window !== 'undefined' && window.requestAnimationFrame
          ? window.requestAnimationFrame.bind(window)
          : this._nodeRaf.bind(this);
        this._rafId = raf(this._tick.bind(this));
      }
    }
  }

  /**
   * _nodeRaf - Node.js 环境下的 requestAnimationFrame 兼容
   * @param {Function} callback
   * @returns {number}
   * @private
   */
  _nodeRaf(callback) {
    try {
      return setTimeout(() => {
        callback(typeof performance !== 'undefined' ? performance.now() : Date.now());
      }, 16);
    } catch (e) {
      console.error('[AnimationController] _nodeRaf error:', e);
      return 0;
    }
  }

  /**
   * _nodeCaf - Node.js 环境下的 cancelAnimationFrame 兼容
   * @param {number} id
   * @private
   */
  _nodeCaf(id) {
    try {
      clearTimeout(id);
    } catch (e) {
      console.error('[AnimationController] _nodeCaf error:', e);
    }
  }

  // ================================================================
  //  公共方法
  // ================================================================

  /**
   * update - 更新所有活跃动画
   * @param {number} deltaTime - 帧间隔时间（秒）
   */
  update(deltaTime) {
    try {
      if (this._frozen) return;

      const deltaMs = deltaTime * 1000;

      // 更新队列动画
      this._updateQueueAnimation(deltaMs);

      // 更新活跃动画（并行）
      this._updateActiveAnimations(deltaTime);

      // 更新粒子系统
      if (this._effectRenderer && typeof this._effectRenderer.updateParticles === 'function') {
        this._effectRenderer.updateParticles(deltaTime);
      }
    } catch (e) {
      console.error('[AnimationController] update error:', e);
    }
  }

  /**
   * _updateActiveAnimations - 更新活跃动画列表
   * @param {number} deltaTime - 秒
   * @private
   */
  _updateActiveAnimations(deltaTime) {
    try {
      for (let i = this._activeAnimations.length - 1; i >= 0; i--) {
        const anim = this._activeAnimations[i];
        anim.elapsed += deltaTime;

        if (anim.elapsed >= anim.duration) {
          this._activeAnimations.splice(i, 1);
        }
      }
    } catch (e) {
      console.error('[AnimationController] _updateActiveAnimations error:', e);
    }
  }

  /**
   * render - 触发 BoardRenderer 和 EffectRenderer 的渲染
   */
  render() {
    try {
      // 渲染棋盘
      if (this._boardRenderer && typeof this._boardRenderer.render === 'function') {
        const state = this._buildRenderState();
        this._boardRenderer.render(state);
      }

      // 渲染 X-Wing 和 Swordfish 特效
      if (this._effectRenderer) {
        this._renderXWingState();
        this._renderSwordfishState();
      }

      // 渲染聚光灯效果
      if (this._spotlightEnabled && this._spotlightIntensity > 0 && this._effectRenderer) {
        const ctx = this._effectRenderer._ctx;
        if (ctx && this._effectRenderer._canvas) {
          const w = this._effectRenderer._width;
          const h = this._effectRenderer._height;
          ctx.save();
          ctx.fillStyle = 'rgba(0, 0, 0, ' + (this._spotlightIntensity * 0.5) + ')';
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }
    } catch (e) {
      console.error('[AnimationController] render error:', e);
    }
  }

  /**
   * _buildRenderState - 构建传递给 BoardRenderer 的状态对象
   * @returns {Object}
   * @private
   */
  _buildRenderState() {
    try {
      const state = {
        size: 9,
        gridSize: 9,
        cells: [],
        highlights: {},
      };

      // 添加活跃动画中的高亮信息
      for (let i = 0; i < this._activeAnimations.length; i++) {
        const anim = this._activeAnimations[i];
        if (anim.type === 'pulseCell' || anim.type === 'focusCell') {
          const [r, c] = anim.target;
          if (!state.highlights.selectedCell) {
            state.highlights.selectedCell = { r: r, c: c };
          }
        }
      }

      return state;
    } catch (e) {
      console.error('[AnimationController] _buildRenderState error:', e);
      return { size: 9, gridSize: 9, cells: [], highlights: {} };
    }
  }

  /**
   * resize - 调整内部渲染器大小
   * @param {number} width - CSS 像素宽度
   * @param {number} height - CSS 像素高度
   */
  resize(width, height) {
    try {
      if (this._boardRenderer && typeof this._boardRenderer.resize === 'function') {
        this._boardRenderer.resize(width, height);
      }
      if (this._effectRenderer && typeof this._effectRenderer.resize === 'function') {
        this._effectRenderer.resize(width, height);
      }
    } catch (e) {
      console.error('[AnimationController] resize error:', e);
    }
  }

  /**
   * setPerformanceMonitor - 更新性能监控
   * @param {PerformanceMonitor} pm
   */
  setPerformanceMonitor(pm) {
    try {
      this._performanceMonitor = pm;
      if (this._boardRenderer && typeof this._boardRenderer.setPerformanceMonitor === 'function') {
        this._boardRenderer.setPerformanceMonitor(pm);
      }
      if (this._effectRenderer && typeof this._effectRenderer.setPerformanceMonitor === 'function') {
        this._effectRenderer.setPerformanceMonitor(pm);
      }
    } catch (e) {
      console.error('[AnimationController] setPerformanceMonitor error:', e);
    }
  }

  /**
   * destroy - 清理资源
   */
  destroy() {
    try {
      // 停止动画循环
      this.stopLoop();

      // 清空队列
      this.clear();

      // 清空活跃动画
      this._activeAnimations = [];

      // 重置演示状态
      this._demoSteps = null;
      this._demoIndex = 0;
      this._demoOnComplete = null;
      this._demoSkipped = false;

      // 重置微型教学状态
      if (this._hintTimer !== null) {
        clearTimeout(this._hintTimer);
        this._hintTimer = null;
      }
      this._hintSteps = null;
      this._hintIndex = 0;
      this._hintOnComplete = null;
      this._hintOnAction = null;
      this._hintSkipped = false;

      // 重置特效
      if (this._effectRenderer && typeof this._effectRenderer.resetAnimation === 'function') {
        this._effectRenderer.resetAnimation();
      }

      // 清除 X-Wing / Swordfish 状态
      this._xwingState = null;
      this._swordfishState = null;

      // 重置状态
      this._spotlightEnabled = false;
      this._spotlightIntensity = 0;
      this._frozen = false;
      this._elapsed = 0;
      this._frameCount = 0;
      this._accumulatedTime = 0;

      // 释放引用
      this._boardRenderer = null;
      this._effectRenderer = null;
      this._performanceMonitor = null;
    } catch (e) {
      console.error('[AnimationController] destroy error:', e);
    }
  }
}

export default AnimationController;