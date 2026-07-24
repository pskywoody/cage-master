// ==========================================
// 笔记系统 · 三层呼吸态 + 三视角差异化
// ==========================================
//
// 三层状态：
//   hidden  - 隐藏态（默认，棋盘干净）
//   single  - 单格态（点击/悬停某格时显示该格笔记）
//   full    - 全览态（全盘显示笔记）
//
// 三视角配置：
//   hero    - 主角：全手动，无自动展开
//   yan     - 阿妍：微光态（关键格淡显）+ 全览手动开关
//   ying    - 莹莹：隐藏态 + 限次全览爆发
//
// 经典模式（向后兼容）：
//   和原来一样，笔记模式下常开，不自动收回
// ==========================================

class NoteSystem {
  /**
   * @param {Board} board - 棋盘实例
   * @param {Renderer} renderer - 渲染器实例
   * @param {Object} options - 配置
   */
  constructor(board, renderer, options = {}) {
    this.board = board;
    this.renderer = renderer;

    // 当前视角：hero / yan / ying
    this.perspective = options.perspective || 'hero';

    // 笔记模式：breathing（呼吸模式）/ classic（经典模式）
    this.mode = options.mode || 'breathing';

    // 当前显示状态：hidden / single / full / glow（微光，仅阿妍）
    this.displayState = 'hidden';

    // 单格态的目标格子
    this.singleCell = null; // { r, c }

    // 全览态计时器
    this._fullTimer = null;

    // 莹莹视角：本关已使用的全览次数
    this.yingFullExpandsUsed = 0;

    // 视角配置
    this.perspectiveConfigs = {
      hero: {
        defaultState: 'hidden',
        allowFullExpand: false,
        fullExpandDuration: 0,
        maxFullExpandsPerLevel: 0,
        smartGlow: false,
        glowCandidateThreshold: 0,
      },
      yan: {
        defaultState: 'glow',     // 微光态
        allowFullExpand: true,    // 允许全览
        fullExpandDuration: 0,    // 0 = 不自动收回
        maxFullExpandsPerLevel: 999, // 无限次
        smartGlow: true,          // 智能微光
        glowCandidateThreshold: 2, // 笔记<=2的格子淡显
        glowOpacity: 0.25,        // 微光透明度
      },
      ying: {
        defaultState: 'hidden',
        allowFullExpand: true,
        fullExpandDuration: 5000, // 5秒自动收回
        maxFullExpandsPerLevel: 1, // 每关限1次
        smartGlow: false,
      },
    };

    // 事件回调
    this.onStateChange = options.onStateChange || (() => {});
    this.onYingExpandUsed = options.onYingExpandUsed || (() => {});
  }

  // ---------- 视角切换 ----------

  /**
   * 设置视角
   * @param {string} perspective - hero / yan / ying
   */
  setPerspective(perspective) {
    if (!this.perspectiveConfigs[perspective]) {
      console.warn('[NoteSystem] 未知视角:', perspective);
      return;
    }
    this.perspective = perspective;
    this._resetToDefaultState();

    // 阿妍视角：自动填入所有理论笔记（被动技能）
    // 注意：此技能仅在二周目及以上生效
    if (perspective === 'yan' && this._isNewGamePlus()) {
      this._autoFillTheoreticalCandidates();
    }

    this.renderer.forceRender = true;
  }

  /**
   * 判断是否为二周目及以上（新游戏+）
   * @returns {boolean}
   */
  _isNewGamePlus() {
    try {
      if (typeof ProgressManager !== 'undefined' && 
          typeof ProgressManager.getCurrentCycle === 'function') {
        return ProgressManager.getCurrentCycle() >= 2;
      }
      if (global.ProgressManager && 
          typeof global.ProgressManager.getCurrentCycle === 'function') {
        return global.ProgressManager.getCurrentCycle() >= 2;
      }
    } catch (e) {
      console.warn('[NoteSystem] 获取周目信息失败:', e);
    }
    return false; // 默认一周目，不启用被动技能
  }

  /**
   * 自动填入所有理论笔记（阿妍被动技能）
   */
  _autoFillTheoreticalCandidates() {
    if (typeof this.board.autoFillCandidates === 'function') {
      this.board.autoFillCandidates();
    }
  }

  /**
   * 玩家填数后，更新阿妍视角的笔记（保持同步）
   * 注意：此被动技能仅在二周目及以上生效
   */
  onNumberFilled() {
    if (this.perspective === 'yan' && this.mode === 'breathing' && this._isNewGamePlus()) {
      this._autoFillTheoreticalCandidates();
      this.renderer.forceRender = true;
    }
  }

  /**
   * 设置笔记模式
   * @param {string} mode - breathing / classic
   */
  setMode(mode) {
    this.mode = mode;
    this.renderer.forceRender = true;
  }

  /**
   * 获取当前视角配置
   */
  getConfig() {
    return this.perspectiveConfigs[this.perspective] || this.perspectiveConfigs.hero;
  }

  // ---------- 状态切换 ----------

  /**
   * 重置为视角默认状态
   */
  _resetToDefaultState() {
    const cfg = this.getConfig();
    this.displayState = cfg.defaultState;
    this.singleCell = null;
    this._clearFullTimer();
    this.onStateChange(this.displayState);
  }

  /**
   * 新关卡初始化
   */
  initNewLevel() {
    this.yingFullExpandsUsed = 0;
    this._resetToDefaultState();
  }

  /**
   * 进入单格态（点击/悬停某格）
   * @param {number} r
   * @param {number} c
   */
  showSingleCell(r, c) {
    if (this.mode === 'classic') return;
    if (this.displayState === 'full') return; // 全览态下不切单格

    const cell = this.board.cells[r]?.[c];
    if (!cell || cell.fixedNum || cell.fillNum) return;

    this.singleCell = { r, c };
    if (this.displayState !== 'single') {
      this.displayState = 'single';
      this.onStateChange(this.displayState);
    }
    this.renderer.forceRender = true;
  }

  /**
   * 隐藏单格（鼠标移走）
   */
  hideSingleCell() {
    if (this.mode === 'classic') return;
    if (this.displayState !== 'single') return;

    this.singleCell = null;
    const cfg = this.getConfig();
    this.displayState = cfg.defaultState;
    this.onStateChange(this.displayState);
    this.renderer.forceRender = true;
  }

  /**
   * 触发全览态
   * @returns {boolean} 是否成功触发
   */
  triggerFullExpand() {
    const cfg = this.getConfig();

    // 经典模式：交给原来的笔记模式处理
    if (this.mode === 'classic') return false;

    // 不允许全览
    if (!cfg.allowFullExpand) return false;

    // 莹莹视角：检查次数
    if (this.perspective === 'ying') {
      if (this.yingFullExpandsUsed >= cfg.maxFullExpandsPerLevel) {
        return false; // 次数用完了
      }
      this.yingFullExpandsUsed++;
      this.onYingExpandUsed(this.yingFullExpandsUsed, cfg.maxFullExpandsPerLevel);
    }

    // 如果已经是全览态，收回去
    if (this.displayState === 'full') {
      this._collapseFromFull();
      return true;
    }

    // 展开全览
    this.displayState = 'full';
    this.onStateChange(this.displayState);
    this.renderer.forceRender = true;

    // 设置自动收回（仅当 duration > 0 时）
    if (cfg.fullExpandDuration > 0) {
      this._clearFullTimer();
      this._fullTimer = setTimeout(() => {
        this._collapseFromFull();
      }, cfg.fullExpandDuration);
    }

    return true;
  }

  /**
   * 从全览态收回
   */
  _collapseFromFull() {
    this._clearFullTimer();
    const cfg = this.getConfig();
    this.displayState = cfg.defaultState;
    this.singleCell = null;
    this.onStateChange(this.displayState);
    this.renderer.forceRender = true;
  }

  _clearFullTimer() {
    if (this._fullTimer) {
      clearTimeout(this._fullTimer);
      this._fullTimer = null;
    }
  }

  // ---------- 渲染辅助 ----------

  /**
   * 判断某格是否应该显示笔记（供渲染器调用）
   * @param {number} r
   * @param {number} c
   * @returns {{ show: boolean, opacity: number }}
   */
  shouldShowCandidate(r, c) {
    // 经典模式：始终显示已有的候选数，与输入模式无关
    // （输入模式只影响"怎么输入"，不影响"怎么显示"）
    if (this.mode === 'classic') {
      return { show: true, opacity: 1 };
    }

    // 呼吸模式
    switch (this.displayState) {
      case 'full':
        // 全览态：所有空格都显示
        return { show: true, opacity: 1 };

      case 'single':
        // 单格态：只显示选中的那格
        if (this.singleCell && this.singleCell.r === r && this.singleCell.c === c) {
          return { show: true, opacity: 1 };
        }
        // 微光态叠加（阿妍视角下，单格态时其他关键格仍然微亮）
        if (this.perspective === 'yan') {
          const cell = this.board.cells[r]?.[c];
          if (cell && !cell.fixedNum && !cell.fillNum) {
            const cands = cell.candidates.size;
            const cfg = this.getConfig();
            if (cands > 0 && cands <= cfg.glowCandidateThreshold) {
              return { show: true, opacity: cfg.glowOpacity };
            }
          }
        }
        return { show: false, opacity: 0 };

      case 'glow':
        // 微光态：只显示笔记少的关键格
        if (this.perspective === 'yan') {
          const cell = this.board.cells[r]?.[c];
          if (cell && !cell.fixedNum && !cell.fillNum) {
            const cands = cell.candidates.size;
            const cfg = this.getConfig();
            if (cands > 0 && cands <= cfg.glowCandidateThreshold) {
              return { show: true, opacity: cfg.glowOpacity };
            }
          }
        }
        return { show: false, opacity: 0 };

      case 'hidden':
      default:
        return { show: false, opacity: 0 };
    }
  }

  /**
   * 获取莹莹视角剩余次数
   */
  getYingRemainingExpands() {
    const cfg = this.getConfig();
    return Math.max(0, cfg.maxFullExpandsPerLevel - this.yingFullExpandsUsed);
  }

  /**
   * 销毁
   */
  destroy() {
    this._clearFullTimer();
  }
}

// 暴露到全局
if (typeof window !== 'undefined') {
  window.NoteSystem = NoteSystem;
}
