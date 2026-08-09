// ==========================================
// BoardRenderer - 数独棋盘 Canvas 2D 渲染器
// ==========================================
// 功能：
//   - 绘制棋盘网格线（3x3 宫粗线，普通格细线）
//   - 绘制固定数字（粗体深色）和玩家填入数字（标准字体蓝色）
//   - 绘制候选数笔记（小号字体，格子内按 3x3/2x2 排列）
//   - 绘制笼子虚线边框和左上角和值标签
//   - 高亮显示：选中格（金色边框）、错误格（红色背景和数字）、行/列/宫高亮
//   - devicePixelRatio 自适应
//   - 支持单格增量重绘（性能优化）
// ==========================================

export class BoardRenderer {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement} [options.canvas] - 目标 canvas 元素
   * @param {PerformanceMonitor} [options.performanceMonitor] - 性能监控实例
   * @param {number} [options.gridSize=9] - 棋盘尺寸（9=标准数独，4=4x4）
   */
  constructor(options) {
    options = options || {};

    /** @type {HTMLCanvasElement|null} */
    this._canvas = options.canvas || null;

    /** @type {CanvasRenderingContext2D|null} */
    this._ctx = this._canvas ? this._canvas.getContext('2d') : null;

    /** @type {PerformanceMonitor|null} */
    this._pm = options.performanceMonitor || null;

    /** @type {number} */
    this._gridSize = options.gridSize || 9;

    /** @type {number} 每个 3x3 宫的大小（sqrt(gridSize)） */
    this._boxSize = Math.round(Math.sqrt(this._gridSize));

    /** @type {number} 画布 CSS 像素宽度 */
    this._width = 0;

    /** @type {number} 画布 CSS 像素高度 */
    this._height = 0;

    /** @type {number} 每格 CSS 像素大小 */
    this._cellSize = 0;

    // 行列标外缘留白（2026-08-03）：左行标 A-I / 顶列标 1-9
    // Q2：标号缩小后同步收窄留白（26→14），棋盘实际可用区变大
    this._padL = 14;
    this._padT = 14;
    this._padR = 8;
    this._padB = 8;

    // ---- 高亮/选中状态 ----
    /** @type {{r:number,c:number}|null} 当前选中格坐标 */
    this._selectedCell = null;

    /** @type {Map<string,string>} 自定义高亮格 "r,c" -> type */
    this._highlightedCells = new Map();

    /** @type {Set<string>} 微型教学 eliminate 标记 "r,c"（红叉） */
    this._eliminateCells = new Set();

    // ---- Boss 战幽灵格（V4.3.18，对齐 V3 手册 3.6.1/3.6.7） ----
    /** @type {string|null} Boss 主题色（非战斗时为 null，不绘制幽灵格） */
    this._bossGhostColor = null;
    this._shakeCells = new Map(); // key 'r,c' -> until(ms)：错误摇晃动画（15°×3×400ms）

    // ---- 颜色方案（P1：书卷色板——朱砂/黄铜/青墨淡染，去 Material 高亮；错误红加深达 AA） ----
    this.COLORS = {
      background: '#f5f0e8',
      gridLine: '#666666',
      boxLine: '#1a1a1a',
      outerLine: '#1a1a1a',
      fixedNum: '#5a5a5a',   // 笔记本主题：淡墨印刷体（规格 #5a5a5a）
      playerNum: '#1a3a5c',   // 笔记本主题：钢笔水（设局人）深蓝黑
      whatIfNum: '#8b5cf6',   // v2.0：假设模式填入数字（紫罗兰，P3 再书化）
      errorBg: 'rgba(163, 53, 42, 0.12)',  // P1：淡朱砂晕（原 #ffebee 粉红）
      errorNum: '#8e2c21',    // P1：深朱砂（原 #d32f2f 仅 4.39:1，加深后 ~5.5:1 达 AA）
      selectedBorder: '#a3352a',  // P1：朱砂描边（原 #ff9800 橙）
      rowHighlight: 'rgba(184, 134, 11, 0.14)',   // P1：黄铜淡染（原 Material 黄）
      colHighlight: 'rgba(26, 58, 92, 0.14)',      // P1：钢笔水淡染（原 Material 蓝）
      boxHighlight: 'rgba(107, 78, 120, 0.14)',    // P1：淡紫墨（原 Material 紫）
      cageSelectedFill: 'rgba(62, 110, 90, 0.20)', // P1：青墨淡染（原翠绿 #10b981 0.28）
      cageSelectedBorder: '#3e6e5a',               // P1：青墨（原 #10b981）
      candidateNum: '#404040',
      cageBorder: '#b34700',
      cageLabelBg: '#ffffff',
      cageLabelText: '#000000',
    };
  }

  // ================================================================
  //  公共方法
  // ================================================================

  /**
   * 获取渲染缩放比例（devicePixelRatio * quality.resolutionScale）
   * @returns {number}
   */
  getRenderScale() {
    if (this._pm && typeof this._pm.getRenderScale === 'function') {
      return this._pm.getRenderScale();
    }
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  }

  /**
   * 设置 Boss 战幽灵格主题色（战斗开始时调用）
   * @param {string} color - Boss 主题色（如 '#22c55e'）
   */
  setBossGhost(color) {
    this._bossGhostColor = color || null;
  }

  /**
   * 清除 Boss 战幽灵格配置（战斗结束时调用）
   */
  clearBossGhost() {
    this._bossGhostColor = null;
  }

  /**
   * 完整绘制棋盘
   * @param {Object} state - getState() 返回的状态对象，可附加 cages/size/highlights
   */
  render(state) {
    if (!this._ctx || !this._canvas) return;

    try {
      const scale = this.getRenderScale();
      this._ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const size = state.size || state.gridSize || this._gridSize;
      // 2026-08-04 修复：4x4 等非 9x9 关卡的宫尺寸必须随 state.size 同步，
      // 否则 _boxSize 固定在 sqrt(9)=3，宫粗线/高亮会画错位置
      if (this._gridSize !== size) this._gridSize = size;
      this._boxSize = Math.round(Math.sqrt(size));
      // v2.0：WhatIf 假设模式——记录根快照已填数字位置集合（假设中填入的数字用紫色异色）
      this._whatIf = state.whatIf || null;
      const cellSize = this._cellSize ||
        Math.min(this._width - this._padL - this._padR, this._height - this._padT - this._padB) / size;
      const padding = 0;

      // 0. 构建笼标签格集合（候选数绘制时避开）
      this._buildCageLabelSet(state);

      // 1. 清除画布 + 绘制背景（含行列标留白区）
      this._ctx.clearRect(0, 0, this._width, this._height);
      this._ctx.fillStyle = this.COLORS.background;
      this._ctx.fillRect(0, 0, this._width, this._height);

      // 2. 棋盘区域坐标变换（外缘留白给行列标）
      this._ctx.save();
      this._ctx.translate(this._padL, this._padT);

      // 3. 绘制行/列/宫高亮
      this._drawHighlights(this._ctx, state, cellSize, padding);

      // 3.5 V4.3.23（Spec v1.2）：影响力热区（v2.0 整合：高影响格蓝框标记，随热区开关显示）
      if (state.heatmap && state.heatmap.length > 0 && state.heatmapVisible !== false) {
        this._drawHeatmap(this._ctx, state, cellSize, padding);
      }

      // v2.0：难度热区（Heatmap）——绿/黄/红三色难度覆盖层，透明度 0.35，
      // 普通关卡与 Boss 关通用，由 TechRater 难度模型计算；与影响力蓝框同受热区开关控制
      if (state.difficultyHeatmap && state.difficultyHeatmap.length > 0 && state.heatmapVisible !== false) {
        this._drawDifficultyHeatmap(this._ctx, state, cellSize, padding);
      }

      // 4. 绘制错误格背景
      this._drawErrorBackground(this._ctx, state, cellSize, padding);

      // 5. 绘制细网格线（普通格分隔线）
      this._drawThinGridLines(this._ctx, state, cellSize, padding);

      // 6. 绘制笼子虚线边框（先画笼子线，作为底色层）
      this._drawCageBorders(this._ctx, state, cellSize, padding);

      // 7. 绘制宫粗线 + 外框（最后画，确保"粗线围成宫"清晰可见，不被笼子虚线覆盖）
      this._drawBoxLines(this._ctx, state, cellSize, padding);

      // 8. 绘制所有格子内容（数字/候选数）
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          this._drawCellContent(this._ctx, r, c, state, cellSize, padding);
        }
      }

      // 8. 绘制笼子和值标签
      this._drawCageSumLabels(this._ctx, state, cellSize, padding);

      // 9. 绘制选中格金色边框
      this._drawSelection(this._ctx, cellSize, padding);

      // 9.5 V4.3.23（Spec v1.2）：关键格金色脉动边框 + ★3 标签
      if (state.hotspots && state.hotspots.length > 0) {
        this._drawHotspots(this._ctx, state, cellSize, padding);
      }

      // 9.6 V4.3.24（Spec v1.3）：异步要塞防守——AI 蓄力格暗色脉动 + 招架窗口光环
      if (state.underSiege) {
        this._drawSiege(this._ctx, state.underSiege, cellSize, padding);
      }

      // 9.7 V4.3.25（Spec v1.4）：AI 注意力——淡红外发光（AI 正在看玩家笔记多的格）
      if (state.aiAttention && state.aiAttention.length > 0) {
        this._drawAiAttention(this._ctx, state.aiAttention, cellSize, padding);
      }

      // 9.8 Q18：提示动画高亮格（pulse 金色脉冲 / success 青墨绿）——
      // 必须走主渲染路径（原加在 renderCell 里，而主 render() 不调用 renderCell，高亮永不显示）
      this._drawHintHighlights(this._ctx, cellSize, padding);

      this._ctx.restore();

      // 10. 行列标（外缘留白区）
      this._drawAxisLabels(size, cellSize);

      // 记录帧（性能监控）
      if (this._pm && typeof this._pm.recordFrame === 'function') {
        this._pm.recordFrame();
      }
    } catch (e) {
      console.error('[BoardRenderer] render error:', e);
    }
  }

  /**
   * 只重绘单个格子（性能优化用）
   * @param {number} r - 行索引
   * @param {number} c - 列索引
   * @param {Object} state - 状态对象
   */
  renderCell(r, c, state) {
    if (!this._ctx || !this._canvas) return;
    const _sz = (state && (state.size || state.gridSize)) || this._gridSize;
    this._boxSize = Math.round(Math.sqrt(_sz));
    if (r < 0 || r >= this._gridSize || c < 0 || c >= this._gridSize) return;

    try {
      const scale = this.getRenderScale();
      this._ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const size = state.size || state.gridSize || this._gridSize;
      const cellSize = this._cellSize ||
        Math.min(this._width, this._height) / size;
      const padding = 0;
      const boxSize = this._boxSize;

      // 单格重绘时也确保笼标签集合可用
      if (!this._cageLabelCellSet) {
        this._buildCageLabelSet(state);
      }

      this._ctx.save();
      this._ctx.translate(this._padL, this._padT);
      const x = c * cellSize + padding;
      const y = r * cellSize + padding;

      // ---- 清除格子区域 ----
      this._ctx.clearRect(x, y, cellSize, cellSize);

      // ---- 绘制背景 ----
      this._ctx.fillStyle = this.COLORS.background;
      this._ctx.fillRect(x, y, cellSize, cellSize);

      // ---- 绘制行/列/宫高亮（只影响当前格子的部分） ----
      this._drawCellHighlights(this._ctx, r, c, state, cellSize, padding);

      // ---- 绘制错误背景 ----
      const cell = state.cells[r] && state.cells[r][c];
      if (cell && (cell.isError || cell.isCageSumError)) {
        this._ctx.fillStyle = this.COLORS.errorBg;
        this._ctx.fillRect(x, y, cellSize, cellSize);
      }

      // ---- 绘制格子内容 ----
      this._drawCellContent(this._ctx, r, c, state, cellSize, padding);

      // ---- 绘制网格线（4 条边） ----
      this._drawCellGridLines(this._ctx, r, c, cellSize, padding, size, boxSize);

      // ---- 绘制选中边框 ----
      if (this._selectedCell &&
          this._selectedCell.r === r &&
          this._selectedCell.c === c) {
        this._ctx.save();
        this._ctx.strokeStyle = this.COLORS.selectedBorder;
        this._ctx.lineWidth = 3;
        this._ctx.strokeRect(x, y, cellSize, cellSize);
        this._ctx.restore();
      }

      // Q18：绘制提示动画高亮格（_highlightedCells）——pulse=金色脉冲边框，
      // success=青墨绿填充+边框。原实现只存 Map 从不绘制，教学动画只有讲解词
      // 没有视觉（玩家全靠脑补"这个数在哪"）
      if (this._highlightedCells && this._highlightedCells.has(r + ',' + c)) {
        const now = Date.now();
        const pulse = 0.5 + 0.5 * Math.sin((now / 900) * Math.PI * 2); // 0.9s 周期
        this._ctx.save();
        const type = this._highlightedCells.get(r + ',' + c);
        if (type === 'success') {
          this._ctx.fillStyle = 'rgba(90, 158, 110, 0.25)';
          this._ctx.fillRect(x, y, cellSize, cellSize);
          this._ctx.strokeStyle = 'rgba(90, 158, 110, 0.95)';
          this._ctx.lineWidth = 3;
          this._ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
        } else {
          // pulse / highlighted：金色呼吸边框 + 极淡填充
          this._ctx.fillStyle = 'rgba(255, 215, 0, ' + (0.06 + 0.06 * pulse).toFixed(3) + ')';
          this._ctx.fillRect(x, y, cellSize, cellSize);
          this._ctx.strokeStyle = 'rgba(255, 215, 0, ' + (0.65 + 0.35 * pulse).toFixed(2) + ')';
          this._ctx.lineWidth = 2 + pulse * 1.5;
          this._ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }
        this._ctx.restore();
      }

      this._ctx.restore();

      // 记录帧（性能监控）
      if (this._pm && typeof this._pm.recordFrame === 'function') {
        this._pm.recordFrame();
      }
    } catch (e) {
      console.error('[BoardRenderer] renderCell error:', e);
    }
  }

  /**
   * 清除画布
   */
  clear() {
    if (!this._ctx || !this._canvas) return;
    this._ctx.clearRect(0, 0, this._width, this._height);
  }

  /**
   * 调整画布大小
   * @param {number} width  - CSS 像素宽度
   * @param {number} height - CSS 像素高度
   */
  resize(width, height) {
    this._width = width;
    this._height = height;
    if (!this._canvas) return;

    const scale = this.getRenderScale();
    this._canvas.width = Math.round(width * scale);
    this._canvas.height = Math.round(height * scale);
    this._canvas.style.width = width + 'px';
    this._canvas.style.height = height + 'px';

    // 棋盘区域 = 画布减外缘留白（行列标）
    const innerW = width - this._padL - this._padR;
    const innerH = height - this._padT - this._padB;
    this._cellSize = Math.max(10, Math.min(innerW, innerH)) / this._gridSize;
  }

  /**
   * 获取行列标外缘留白（ui 层点击坐标对齐用）
   * @returns {{left:number, top:number, right:number, bottom:number}}
   */
  getPadding() {
    return { left: this._padL, top: this._padT, right: this._padR, bottom: this._padB };
  }

  /**
   * 更新性能监控引用
   * @param {PerformanceMonitor} pm
   */
  setPerformanceMonitor(pm) {
    this._pm = pm;
  }

  /**
   * 设置高亮类型
   * @param {number|null} r - 行索引（null 则清除高亮）
   * @param {number|null} c - 列索引
   * @param {string} [type='selected'] - 高亮类型：'selected' | 'error' | 'highlighted'
   */
  setHighlight(r, c, type) {
    if (r === null || r === undefined || c === null || c === undefined) {
      this._selectedCell = null;
      this._highlightedCells.clear();
      this._eliminateCells.clear();
      return;
    }

    type = type || 'selected';

    if (type === 'selected') {
      this._selectedCell = { r: r, c: c };
    } else {
      this._highlightedCells.set(r + ',' + c, type);
    }
  }

  /**
   * Q18：清除全部提示高亮格（pulse 步骤逐个替换用——来源格讲解不累积）
   */
  clearHighlightedCells() {
    this._highlightedCells.clear();
  }

  /**
   * 设置/清除排除标记（微型教学 eliminate：红色斜线）
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {boolean} on - true 标记 / false 清除
   */
  setEliminateMark(r, c, on) {
    const key = r + ',' + c;
    if (on) {
      this._eliminateCells.add(key);
    } else {
      this._eliminateCells.delete(key);
    }
  }

  /**
   * 清除全部排除标记
   */
  clearEliminateMarks() {
    this._eliminateCells.clear();
  }

  /**
   * V4.3.23（Spec v1.2）：绘制影响力热力图
   * 整合热区标记（v2.0）：不画色块（避免与难度热区色块叠加混淆）——
   * 仅对高影响力格（influence ≥ 0.7）画深蓝色边框（AI 进攻目标标记），
   * 与难度热区（红黄绿色块）同时显示互不干扰：色块=解题难度，蓝框=AI 目标
   * @private
   */
  _drawHeatmap(ctx, state, cellSize, padding) {
    for (const item of state.heatmap) {
      if (typeof item.row !== 'number' || typeof item.col !== 'number') continue;
      const inf = item.influence || 0;
      if (inf < 0.7) continue; // 只标记高影响力格，避免视觉噪音
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.85)';
      ctx.lineWidth = Math.max(2, Math.round(cellSize * 0.05));
      const x = item.col * cellSize;
      const y = item.row * cellSize;
      ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    }
  }

  /**
   * Q6：热力图实时推算层——只标记"当前盘面真的能推出的格"（与提示系统同源）。
   * difficulty <0.2：高影响可推格（深绿 + 边框强调）；0.2-0.35：普通可推格（亮绿）。
   * 不再显示红/黄（静态整盘难度已移除，避免误导"绿格当前可填"）。
   * @private
   */
  _drawDifficultyHeatmap(ctx, state, cellSize, padding) {
    for (const item of state.difficultyHeatmap) {
      if (typeof item.row !== 'number' || typeof item.col !== 'number') continue;
      const d = item.difficulty || 0;
      if (d < 0.2) {
        // 高影响可推格：深绿 + 亮绿边框
        ctx.fillStyle = 'rgba(76, 175, 80, 0.28)';
        ctx.fillRect(item.col * cellSize, item.row * cellSize, cellSize, cellSize);
        ctx.strokeStyle = 'rgba(76, 175, 80, 0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(item.col * cellSize + 1, item.row * cellSize + 1, cellSize - 2, cellSize - 2);
      } else if (d < 0.35) {
        // 普通可推格：亮绿
        ctx.fillStyle = 'rgba(76, 175, 80, 0.22)';
        ctx.fillRect(item.col * cellSize, item.row * cellSize, cellSize, cellSize);
      }
    }
  }

  /**
   * Q18：绘制提示动画高亮格（_highlightedCells）——pulse=金色呼吸边框+极淡填充，
   * success=青墨绿填充+边框。主渲染路径调用（renderCell 不是主路径，高亮加在那永不显示）
   * @private
   */
  _drawHintHighlights(ctx, cellSize, padding) {
    try {
      if (!this._highlightedCells || this._highlightedCells.size === 0) return;
      const now = Date.now();
      const pulse = 0.5 + 0.5 * Math.sin((now / 900) * Math.PI * 2); // 0.9s 周期
      this._highlightedCells.forEach((type, key) => {
        const parts = key.split(',');
        const r = parseInt(parts[0], 10);
        const c = parseInt(parts[1], 10);
        if (isNaN(r) || isNaN(c) || r < 0 || r >= this._gridSize || c < 0 || c >= this._gridSize) return;
        const x = c * cellSize + padding;
        const y = r * cellSize + padding;
        ctx.save();
        if (type === 'success') {
          ctx.fillStyle = 'rgba(90, 158, 110, 0.28)';
          ctx.fillRect(x, y, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(90, 158, 110, 0.95)';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3);
        } else {
          // pulse / highlighted：金色呼吸边框 + 极淡填充
          ctx.fillStyle = 'rgba(255, 215, 0, ' + (0.07 + 0.07 * pulse).toFixed(3) + ')';
          ctx.fillRect(x, y, cellSize, cellSize);
          ctx.strokeStyle = 'rgba(255, 215, 0, ' + (0.7 + 0.3 * pulse).toFixed(2) + ')';
          ctx.lineWidth = 2 + pulse * 1.5;
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        }
        ctx.restore();
      });
    } catch (e) {
      console.warn('[BoardRenderer] _drawHintHighlights error:', e);
    }
  }

  /**
   * V4.3.23（Spec v1.2）：绘制关键格金色脉动边框 + ★3 标签
   * 2px 金色 #FFD700，1.5s 周期呼吸脉冲
   * @private
   */
  _drawHotspots(ctx, state, cellSize, padding) {
    const now = Date.now();
    const pulse = 0.55 + 0.45 * Math.sin((now / 1500) * Math.PI * 2); // 1.5s 周期
    const lineWidth = 1.5 + pulse * 1.5;
    ctx.strokeStyle = 'rgba(255, 215, 0, ' + (0.55 + pulse * 0.45).toFixed(2) + ')';
    ctx.lineWidth = lineWidth;
    ctx.font = 'bold ' + Math.max(9, Math.floor(cellSize * 0.22)) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    for (const h of state.hotspots) {
      if (typeof h.r !== 'number' || typeof h.c !== 'number') continue;
      const x = h.c * cellSize;
      const y = h.r * cellSize;
      ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, cellSize - lineWidth, cellSize - lineWidth);
      // ★3 标签（右上角）
      ctx.fillStyle = 'rgba(255, 215, 0, ' + (0.6 + pulse * 0.4).toFixed(2) + ')';
      ctx.fillText('★3', x + cellSize - 2, y + 2);
    }
  }

  /**
   * V4.3.24（Spec v1.3）：AI 蓄力锁定关键格——暗色脉动底 + 招架窗口淡蓝光环
   * @private
   */
  _drawSiege(ctx, siege, cellSize, padding) {
    if (typeof siege.r !== 'number' || typeof siege.c !== 'number') return;
    const x = siege.c * cellSize;
    const y = siege.r * cellSize;
    const now = Date.now();
    const phase = (now % 1000) / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);

    // 暗色脉动底（AI 锁定状态，暗红/暗紫呼吸）
    ctx.save();
    ctx.fillStyle = 'rgba(60, 10, 30, ' + (0.25 + pulse * 0.2).toFixed(2) + ')';
    ctx.fillRect(x, y, cellSize, cellSize);
    ctx.restore();

    // 招架窗口光环（淡蓝，呼吸放大）
    ctx.save();
    ctx.strokeStyle = 'rgba(96, 165, 250, ' + (0.45 + pulse * 0.4).toFixed(2) + ')';
    ctx.lineWidth = 2 + pulse * 1.5;
    const inset = 2 + pulse * 3;
    ctx.strokeRect(x + inset / 2, y + inset / 2, cellSize - inset, cellSize - inset);
    ctx.restore();

    // 左上角"招架窗口"小标签
    ctx.save();
    ctx.fillStyle = 'rgba(96, 165, 250, ' + (0.55 + pulse * 0.45).toFixed(2) + ')';
    ctx.font = 'bold ' + Math.max(8, Math.floor(cellSize * 0.18)) + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('招架', x + 3, y + 3);
    ctx.restore();
  }

  /**
   * V4.3.25（Spec v1.4）：AI 注意力外发光——极淡红色（AI 正在观察的格子）
   * level 2（笔记≥3）→ 较亮；level 1（笔记1-2）→ 极淡
   * @private
   */
  _drawAiAttention(ctx, attention, cellSize, padding) {
    const now = Date.now();
    const breathe = 0.5 + 0.5 * Math.sin((now % 1600) / 1600 * Math.PI * 2);
    for (const a of attention) {
      if (typeof a.r !== 'number' || typeof a.c !== 'number') continue;
      const level = a.level || 1;
      const x = a.c * cellSize;
      const y = a.r * cellSize;
      const alpha = (level >= 2 ? 0.28 : 0.12) * (0.7 + breathe * 0.3);
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = level >= 2 ? 2 : 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      ctx.restore();
    }
  }

  // ================================================================
  //  私有绘制方法
  // ================================================================

  /**
   * 绘制行/列/宫高亮
   * @private
   */
  _drawHighlights(ctx, state, cellSize, padding) {
    // 确定要高亮的行/列/宫
    let selRow = null;
    let selCol = null;
    let selBox = null;

    if (state.highlights) {
      if (state.highlights.selectedRow !== undefined) selRow = state.highlights.selectedRow;
      if (state.highlights.selectedCol !== undefined) selCol = state.highlights.selectedCol;
      if (state.highlights.selectedBox !== undefined) selBox = state.highlights.selectedBox;

      if (state.highlights.selectedCell) {
        const sr = state.highlights.selectedCell.r;
        const sc = state.highlights.selectedCell.c;
        // Q17：提示动画中不从 selectedCell 回填行列宫高亮——main.js 动画中已不设
        // selectedRow/Col/Box，但这里回填导致整行黄铜色高亮照画（玩家反复看到的"黄色坨"）
        if (!(window.CM && window.CM.hintPlaying)) {
          if (selRow === null) selRow = sr;
          if (selCol === null) selCol = sc;
          if (selBox === null) {
            selBox = Math.floor(sr / this._boxSize) * this._boxSize + Math.floor(sc / this._boxSize);
          }
        }
      }
    } else if (this._selectedCell) {
      selRow = this._selectedCell.r;
      selCol = this._selectedCell.c;
      selBox = Math.floor(this._selectedCell.r / this._boxSize) * this._boxSize +
               Math.floor(this._selectedCell.c / this._boxSize);
    }

    const size = this._gridSize;
    const totalSize = size * cellSize;

    // 绘制行高亮
    if (selRow !== null) {
      ctx.fillStyle = this.COLORS.rowHighlight;
      ctx.fillRect(padding, selRow * cellSize + padding, totalSize, cellSize);
    }

    // 绘制列高亮
    if (selCol !== null) {
      ctx.fillStyle = this.COLORS.colHighlight;
      ctx.fillRect(selCol * cellSize + padding, padding, cellSize, totalSize);
    }

    // 绘制宫高亮
    if (selBox !== null) {
      const boxR = Math.floor(selBox / this._boxSize) * this._boxSize;
      const boxC = (selBox % this._boxSize) * this._boxSize;
      ctx.fillStyle = this.COLORS.boxHighlight;
      ctx.fillRect(boxC * cellSize + padding, boxR * cellSize + padding,
                   this._boxSize * cellSize, this._boxSize * cellSize);
    }

    // Q13/Q15：教学行/列高亮（highlights.rows/cols 数组，hiddenSingle 等讲解"某区域"时用）
    // 只细描边不填充——整行填充（哪怕 0.06）在玩家眼里仍是一坨横贯棋盘的颜色块，
    // 证据应靠逐个红叉 + 文案呈现，区域只给一个"看这里"的锚点
    if (state.highlights && Array.isArray(state.highlights.rows) && state.highlights.rows.length > 0) {
      ctx.strokeStyle = 'rgba(245, 197, 66, 0.9)';
      ctx.lineWidth = 2;
      for (const rr of state.highlights.rows) {
        const ry = rr * cellSize + padding;
        ctx.strokeRect(padding + 1, ry + 1, totalSize - 2, cellSize - 2);
      }
    }
    if (state.highlights && Array.isArray(state.highlights.cols) && state.highlights.cols.length > 0) {
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
      ctx.lineWidth = 2;
      for (const cc of state.highlights.cols) {
        const cx = cc * cellSize + padding;
        ctx.strokeRect(cx + 1, padding + 1, cellSize - 2, totalSize - 2);
      }
    }

    // 教学高亮宫（highlights.boxes 数组，2026-08-04）：紫色填充 + 金色粗描边，讲解"宫"时醒目
    if (state.highlights && Array.isArray(state.highlights.boxes) && state.highlights.boxes.length > 0) {
      const bs = this._boxSize;
      for (const boxIdx of state.highlights.boxes) {
        const bR = Math.floor(boxIdx / bs) * bs;
        const bC = (boxIdx % bs) * bs;
        const bx = bC * cellSize + padding;
        const by = bR * cellSize + padding;
        const bw = bs * cellSize;
        // Q13：教学宫降噪——原紫色填充 0.22 + 金色 5px 粗描边叠成"一坨"，改克制淡染 + 细描边
        ctx.fillStyle = 'rgba(156, 39, 176, 0.08)';
        ctx.fillRect(bx, by, bw, bw);
        ctx.strokeStyle = 'rgba(245, 197, 66, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bw);
      }
    }

    // 选中笼子整体高亮（淡金色背景，2026-08-03）
    if (state.highlights && state.highlights.selectedCage) {
      const sc = state.highlights.selectedCage;
      const scCells = (sc && Array.isArray(sc.cells)) ? sc.cells : [];
      // 教学笼只传 id 时回退到关卡笼数据匹配（2026-08-04）
      let cageCells = scCells;
      if (cageCells.length === 0 && sc && sc.id !== undefined && sc.id !== null &&
          state.cages && Array.isArray(state.cages)) {
        const found = state.cages.find((cg) => String(cg.id) === String(sc.id));
        if (found && Array.isArray(found.cells)) cageCells = found.cells;
      }
      // 2026-08-04：笼选中填充（P3：青墨淡染）
      // Q15：提示动画中的教学笼填充降到 0.05——聚光灯暗化下整笼 0.20 填充
      // 就是玩家反复看到的"黄色一大坨"（如 cageUnique 高亮 4 格笼#17）。
      // 普通选中（非动画）保持原交互反馈强度
      const cageAnim = !!(window.CM && window.CM.hintPlaying);
      ctx.fillStyle = cageAnim
        ? 'rgba(62, 110, 90, 0.05)'
        : (this.COLORS.cageSelectedFill || 'rgba(62, 110, 90, 0.20)');
      for (let i = 0; i < cageCells.length; i++) {
        const coord = cageCells[i];
        const cr = Array.isArray(coord) ? coord[0] : (coord && coord.row);
        const cc = Array.isArray(coord) ? coord[1] : (coord && coord.col);
        if (cr === undefined || cc === undefined || cr < 0 || cr >= this._gridSize || cc < 0 || cc >= this._gridSize) continue;
        ctx.fillRect(cc * cellSize + padding, cr * cellSize + padding, cellSize, cellSize);
      }
    }

    // V4.3.19：同数字格高亮（点击已填数字格 / 长按数字键 → 所有同数字格淡金色）
    // V4.3.32：提高可见度——填充加深 + 金色描边
    // P1：黄铜淡染（原 Material 淡金 #f5c542）
    if (state.highlights && state.highlights.sameNumberCells && state.highlights.sameNumberCells.length > 0 &&
        state.cells) {
      const cells = state.cells;
      ctx.save();
      ctx.fillStyle = 'rgba(184, 134, 11, 0.20)'; // 黄铜淡染
      ctx.strokeStyle = 'rgba(184, 134, 11, 0.55)';
      ctx.lineWidth = 1.5;
      for (const coord of state.highlights.sameNumberCells) {
        const sr = Array.isArray(coord) ? coord[0] : (coord && coord.row);
        const sc = Array.isArray(coord) ? coord[1] : (coord && coord.col);
        if (sr === undefined || sc === undefined || sr < 0 || sr >= this._gridSize || sc < 0 || sc >= this._gridSize) continue;
        const x0 = sc * cellSize + padding + 1;
        const y0 = sr * cellSize + padding + 1;
        const w = cellSize - 2;
        ctx.fillRect(x0, y0, w, w);
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, w - 1);
      }
      ctx.restore();
    }

    // V4.3.32：拖拽多选高亮（半透明青绿填充 + 边框，直观显示框选范围）
    // P1：青墨淡染（原翠绿 #34d399）
    if (state.highlights && state.highlights.multiSelectCells && state.highlights.multiSelectCells.length > 1) {
      ctx.save();
      ctx.fillStyle = 'rgba(62, 110, 90, 0.14)';
      ctx.strokeStyle = 'rgba(62, 110, 90, 0.55)';
      ctx.lineWidth = 1.5;
      for (const coord of state.highlights.multiSelectCells) {
        const sr = Array.isArray(coord) ? coord[0] : (coord && coord.row);
        const sc = Array.isArray(coord) ? coord[1] : (coord && coord.col);
        if (sr === undefined || sc === undefined || sr < 0 || sr >= this._gridSize || sc < 0 || sc >= this._gridSize) continue;
        const x0 = sc * cellSize + padding + 1;
        const y0 = sr * cellSize + padding + 1;
        const w = cellSize - 2;
        ctx.fillRect(x0, y0, w, w);
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, w - 1);
      }
      ctx.restore();
    }

    // V4.3.32：tpl 三点连线据点标记（三个据点宫边框 + 中心点 + 城堡 ♛）
    // "三个点"是 tpl 标志性视觉：三个据点宫各画一个中心点，归属后变主题色
    this._drawTplHubs(ctx, state, cellSize, padding);
  }

  /**
   * v2.0：绘制 tpl 据点标记（核心格定位 + 四维争夺）
   * 每个已显现据点：核心格画据点徽记（菱形底 + 中心点 + 归属色 + 维度角标 + 城堡♛）
   * 隐藏据点未显现时不绘制（位置保密）
   * @private
   */
  _drawTplHubs(ctx, state, cellSize, padding) {
    const hubs = state.highlights && state.highlights.tplHubs;
    if (!Array.isArray(hubs) || hubs.length === 0) return;

    for (const h of hubs) {
      if (!h.visible || !h.coreCell) continue; // 隐藏据点不显示
      const r = h.coreCell.r;
      const c = h.coreCell.c;
      if (r == null || c == null || r < 0 || r >= this._gridSize || c < 0 || c >= this._gridSize) continue;
      const cx = c * cellSize + padding + cellSize / 2;
      const cy = r * cellSize + padding + cellSize / 2;

      let stroke, fill, dotColor;
      if (h.occupiedBy === 'player') {
        stroke = 'rgba(90, 158, 110, 0.9)';   // P3：青墨
        fill = 'rgba(62, 110, 90, 0.18)';
        dotColor = '#5a9e6e';
      } else if (h.occupiedBy === 'boss') {
        stroke = 'rgba(184, 134, 11, 0.9)';   // P3：黄铜
        fill = 'rgba(184, 134, 11, 0.18)';
        dotColor = '#d4a853';
      } else {
        stroke = 'rgba(245, 197, 66, 0.75)';
        fill = 'rgba(245, 197, 66, 0.12)';
        dotColor = 'rgba(245, 197, 66, 0.8)';
      }

      ctx.save();
      // 菱形底（据点徽记）
      const rad = cellSize * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx, cy - rad);
      ctx.lineTo(cx + rad, cy);
      ctx.lineTo(cx, cy + rad);
      ctx.lineTo(cx - rad, cy);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 中心点（tpl 标志性"三个点"）
      ctx.fillStyle = dotColor;
      const dotR = Math.max(3, cellSize * 0.09);
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fill();

      // 城堡据点：♛（P3：黄铜 ♛）
      if (h.castle) {
        ctx.fillStyle = '#d4a853';
        ctx.font = 'bold ' + Math.round(cellSize * 0.30) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♛', cx + rad * 0.55, cy - rad * 0.55);
      }

      // 维度角标（playerDims:bossDims，如 2:1）
      const pDims = h.dims ? Object.values(h.dims).filter(d => d.owner === 'player').length : 0;
      const bDims = h.dims ? Object.values(h.dims).filter(d => d.owner === 'boss').length : 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold ' + Math.max(8, Math.round(cellSize * 0.16)) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(pDims + ':' + bDims, cx, cy - rad - 2);
      ctx.restore();
    }
  }

  /**
   * 绘制单个格子的高亮部分（renderCell 用）
   * @private
   */
  _drawCellHighlights(ctx, r, c, state, cellSize, padding) {
    let selRow = null;
    let selCol = null;
    let selBox = null;

    if (state.highlights) {
      if (state.highlights.selectedRow !== undefined) selRow = state.highlights.selectedRow;
      if (state.highlights.selectedCol !== undefined) selCol = state.highlights.selectedCol;
      if (state.highlights.selectedBox !== undefined) selBox = state.highlights.selectedBox;

      if (state.highlights.selectedCell) {
        const sr = state.highlights.selectedCell.r;
        const sc = state.highlights.selectedCell.c;
        if (selRow === null) selRow = sr;
        if (selCol === null) selCol = sc;
        if (selBox === null) {
          selBox = Math.floor(sr / this._boxSize) * this._boxSize + Math.floor(sc / this._boxSize);
        }
      }
    } else if (this._selectedCell) {
      selRow = this._selectedCell.r;
      selCol = this._selectedCell.c;
      selBox = Math.floor(this._selectedCell.r / this._boxSize) * this._boxSize +
               Math.floor(this._selectedCell.c / this._boxSize);
    }

    const x = c * cellSize + padding;
    const y = r * cellSize + padding;

    // 行高亮
    if (selRow === r) {
      ctx.fillStyle = this.COLORS.rowHighlight;
      ctx.fillRect(x, y, cellSize, cellSize);
    }

    // 列高亮
    if (selCol === c) {
      ctx.fillStyle = this.COLORS.colHighlight;
      ctx.fillRect(x, y, cellSize, cellSize);
    }

    // 宫高亮
    if (selBox !== null) {
      const boxR = Math.floor(selBox / this._boxSize) * this._boxSize;
      const boxC = (selBox % this._boxSize) * this._boxSize;
      if (r >= boxR && r < boxR + this._boxSize &&
          c >= boxC && c < boxC + this._boxSize) {
        ctx.fillStyle = this.COLORS.boxHighlight;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  /**
   * 绘制错误格背景
   * @private
   */
  _drawErrorBackground(ctx, state, cellSize, padding) {
    const size = state.size || state.gridSize || this._gridSize;
    const cells = state.cells;
    if (!cells) return;

    for (let r = 0; r < size; r++) {
      const row = cells[r];
      if (!row) continue;
      for (let c = 0; c < size; c++) {
        const cell = row[c];
        if (cell && (cell.isError || cell.isCageSumError)) {
          const x = c * cellSize + padding;
          const y = r * cellSize + padding;
          ctx.fillStyle = this.COLORS.errorBg;
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }
  }

  /**
   * 绘制笼子虚线边框
   * @private
   */
  _drawCageBorders(ctx, state, cellSize, padding) {
    const cages = state.cages;
    if (!cages || !Array.isArray(cages) || cages.length === 0) return;

    const size = state.size || state.gridSize || this._gridSize;

    ctx.save();

    // 选中笼子判断（2026-08-03：点击格子高亮整笼）
    const selCage = (state.highlights && state.highlights.selectedCage) ? state.highlights.selectedCage : null;

    // 2026-08-04：笼虚线内移量（px，从格子外缘向笼内缩，避免与宫粗线/网格线重叠）
    const inset = 3;

    for (let ci = 0; ci < cages.length; ci++) {
      const cage = cages[ci];
      if (!cage || !cage.cells || !Array.isArray(cage.cells) || cage.cells.length === 0) continue;

      // 选中笼子：实线醒目翠绿加粗边框
      let isSelected = false;
      if (selCage) {
        if (selCage.id !== undefined && selCage.id !== null && cage.id !== undefined && cage.id !== null &&
            String(selCage.id) === String(cage.id)) {
          isSelected = true;
        } else if (Array.isArray(selCage.cells) && selCage.cells.length === cage.cells.length) {
          isSelected = JSON.stringify(selCage.cells) === JSON.stringify(cage.cells);
        }
      }
      ctx.strokeStyle = isSelected ? this.COLORS.cageSelectedBorder : this.COLORS.cageBorder;
      ctx.setLineDash(isSelected ? [] : [5, 3]);
      ctx.lineWidth = isSelected ? 3 : 2.5;

      // 构建格子集合用于快速查找
      const cellSet = new Set();
      for (let i = 0; i < cage.cells.length; i++) {
        const cellCoord = cage.cells[i];
        if (Array.isArray(cellCoord) && cellCoord.length >= 2) {
          cellSet.add(cellCoord[0] + ',' + cellCoord[1]);
        }
      }

      ctx.beginPath();
      for (let i = 0; i < cage.cells.length; i++) {
        const cellCoord = cage.cells[i];
        if (!Array.isArray(cellCoord) || cellCoord.length < 2) continue;
        const cr = cellCoord[0];
        const cc = cellCoord[1];
        if (cr < 0 || cr >= size || cc < 0 || cc >= size) continue;

        const x = cc * cellSize + padding;
        const y = cr * cellSize + padding;
        // 虚线内移：向笼内缩 inset 像素（选中时也内移，保持一致性）
        const ix = x + inset;
        const iy = y + inset;
        const ixe = x + cellSize - inset;
        const iye = y + cellSize - inset;

        // 上边（内移）
        if (!cellSet.has((cr - 1) + ',' + cc)) {
          ctx.moveTo(ix, iy);
          ctx.lineTo(ixe, iy);
        }
        // 右边（内移）
        if (!cellSet.has(cr + ',' + (cc + 1))) {
          ctx.moveTo(ixe, iy);
          ctx.lineTo(ixe, iye);
        }
        // 下边（内移）
        if (!cellSet.has((cr + 1) + ',' + cc)) {
          ctx.moveTo(ix, iye);
          ctx.lineTo(ixe, iye);
        }
        // 左边（内移）
        if (!cellSet.has(cr + ',' + (cc - 1))) {
          ctx.moveTo(ix, iy);
          ctx.lineTo(ix, iye);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 触发错误摇晃（规格：格子摇晃 15°，3 次，400ms）
   * @param {number} r
   * @param {number} c
   */
  shakeCell(r, c, durMs = 400) {
    this._shakeCells.set(r + ',' + c, Date.now() + durMs);
  }

  /**
   * 当前摇晃偏移角（度）；无摇晃返回 0
   * @private
   */
  _shakeDeg(r, c, now) {
    const key = r + ',' + c;
    const until = this._shakeCells.get(key);
    if (!until) return 0;
    if (now >= until) { this._shakeCells.delete(key); return 0; }
    const elapsed = until - now; // 剩余 ms
    // 3 个周期（周期 133ms），振幅 15° 线性衰减
    const t = elapsed / 400;
    return Math.sin(elapsed / 133 * Math.PI * 2) * 15 * t;
  }

  /**
   * 确定性伪随机（手绘抖动）：同一种子每次结果一致（不随帧跳变）
   * @private
   */
  _handJitter(seed) {
    const h = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return (h - Math.floor(h)) - 0.5; // [-0.5, 0.5]
  }

  /**
   * 手绘线段：直线拆成 6 段折线，端点加确定性微抖动（模拟钢笔手绘非等宽）
   * @private
   */
  _handStroke(ctx, x1, y1, x2, y2, seed, mag) {
    const segs = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      ctx.lineTo(
        x1 + (x2 - x1) * t + this._handJitter(seed + s * 3.7) * mag,
        y1 + (y2 - y1) * t + this._handJitter(seed + s * 5.9 + 1.3) * mag
      );
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /**
   * 绘制网格线
   * @private
   */
  _drawThinGridLines(ctx, state, cellSize, padding) {
    const size = state.size || state.gridSize || this._gridSize;
    const boxSize = this._boxSize;
    const totalSize = size * cellSize;

    ctx.save();

    // ---- 普通细线（跳过宫粗线位置）手绘抖动 ----
    ctx.strokeStyle = this.COLORS.gridLine;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 1; i < size; i++) {
      // 跳过 3x3 宫线位置
      if (i % boxSize === 0) continue;

      // 竖线
      this._handStroke(ctx, i * cellSize + padding, padding, i * cellSize + padding, totalSize + padding, i * 31, 0.5);
      // 横线
      this._handStroke(ctx, padding, i * cellSize + padding, totalSize + padding, i * cellSize + padding, i * 47 + 5, 0.5);
    }

    ctx.restore();
  }

  /**
   * 绘制宫粗线 + 外层粗边框
   * 放在笼子虚线之后绘制，确保"粗线围成宫"清晰可见（2026-08-04 修复）
   * @private
   */
  _drawBoxLines(ctx, state, cellSize, padding) {
    const size = state.size || state.gridSize || this._gridSize;
    const boxSize = this._boxSize;
    const totalSize = size * cellSize;

    ctx.save();

    // ---- 宫粗线（内部宫边界）：手绘双细线（规格：宫格线略粗·双线） ----
    ctx.strokeStyle = this.COLORS.boxLine;
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    for (let i = boxSize; i < size; i += boxSize) {
      // 双线：在宫边界两侧各 1.2px 画一条
      for (const d of [-1.2, 1.2]) {
        // 竖线
        this._handStroke(ctx, i * cellSize + padding + d, padding, i * cellSize + padding + d, totalSize + padding, i * 63 + d * 7, 0.6);
        // 横线
        this._handStroke(ctx, padding, i * cellSize + padding + d, totalSize + padding, i * cellSize + padding + d, i * 79 + d * 11, 0.6);
      }
    }

    // ---- 外层粗边框（微抖保持手绘感） ----
    ctx.strokeStyle = this.COLORS.outerLine;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    const o = padding;
    this._handStroke(ctx, o, o, o + totalSize, o, 1.1, 0.3);
    this._handStroke(ctx, o + totalSize, o, o + totalSize, o + totalSize, 2.2, 0.3);
    this._handStroke(ctx, o, o + totalSize, o + totalSize, o + totalSize, 3.3, 0.3);
    this._handStroke(ctx, o, o, o, o + totalSize, 4.4, 0.3);

    ctx.restore();
  }

  /**
   * 绘制单个格子的 4 条网格线（renderCell 用）
   * @private
   */
  /**
   * 绘制单个格子的 4 条网格线（renderCell 用）：手绘抖动版
   * @private
   */
  _drawCellGridLines(ctx, r, c, cellSize, padding, size, boxSize) {
    const x = c * cellSize + padding;
    const y = r * cellSize + padding;

    ctx.save();
    ctx.lineCap = 'round';

    // ---- 上边 ----
    if (r === 0) {
      // 外边框
      ctx.strokeStyle = this.COLORS.outerLine;
      ctx.lineWidth = 2;
    } else if (r % boxSize === 0) {
      ctx.strokeStyle = this.COLORS.boxLine;
      ctx.lineWidth = 1.7;
    } else {
      ctx.strokeStyle = this.COLORS.gridLine;
      ctx.lineWidth = 1;
    }
    if (r % boxSize === 0 && r !== 0) {
      // 宫线：双线
      for (const d of [-1.2, 1.2]) {
        this._handStroke(ctx, x + d, y, x + cellSize + d, y, r * 101 + c * 7 + d, 0.6);
      }
    } else {
      this._handStroke(ctx, x, y, x + cellSize, y, r * 101 + c * 7, r === 0 ? 0.3 : 0.5);
    }

    // ---- 下边 ----
    if (r + 1 === size) {
      ctx.strokeStyle = this.COLORS.outerLine;
      ctx.lineWidth = 2;
    } else if ((r + 1) % boxSize === 0) {
      ctx.strokeStyle = this.COLORS.boxLine;
      ctx.lineWidth = 1.7;
    } else {
      ctx.strokeStyle = this.COLORS.gridLine;
      ctx.lineWidth = 1;
    }
    if ((r + 1) % boxSize === 0 && r + 1 !== size) {
      for (const d of [-1.2, 1.2]) {
        this._handStroke(ctx, x + d, y + cellSize, x + cellSize + d, y + cellSize, r * 103 + c * 11 + d, 0.6);
      }
    } else {
      this._handStroke(ctx, x, y + cellSize, x + cellSize, y + cellSize, r * 103 + c * 11, r + 1 === size ? 0.3 : 0.5);
    }

    // ---- 左边 ----
    if (c === 0) {
      ctx.strokeStyle = this.COLORS.outerLine;
      ctx.lineWidth = 2;
    } else if (c % boxSize === 0) {
      ctx.strokeStyle = this.COLORS.boxLine;
      ctx.lineWidth = 1.7;
    } else {
      ctx.strokeStyle = this.COLORS.gridLine;
      ctx.lineWidth = 1;
    }
    if (c % boxSize === 0 && c !== 0) {
      for (const d of [-1.2, 1.2]) {
        this._handStroke(ctx, x, y + d, x, y + cellSize + d, r * 107 + c * 13 + d, 0.6);
      }
    } else {
      this._handStroke(ctx, x, y, x, y + cellSize, r * 107 + c * 13, c === 0 ? 0.3 : 0.5);
    }

    // ---- 右边 ----
    if (c + 1 === size) {
      ctx.strokeStyle = this.COLORS.outerLine;
      ctx.lineWidth = 2;
    } else if ((c + 1) % boxSize === 0) {
      ctx.strokeStyle = this.COLORS.boxLine;
      ctx.lineWidth = 1.7;
    } else {
      ctx.strokeStyle = this.COLORS.gridLine;
      ctx.lineWidth = 1;
    }
    if ((c + 1) % boxSize === 0 && c + 1 !== size) {
      for (const d of [-1.2, 1.2]) {
        this._handStroke(ctx, x + cellSize, y + d, x + cellSize, y + cellSize + d, r * 109 + c * 17 + d, 0.6);
      }
    } else {
      this._handStroke(ctx, x + cellSize, y, x + cellSize, y + cellSize, r * 109 + c * 17, c + 1 === size ? 0.3 : 0.5);
    }

    ctx.restore();
  }


  /**
   * 构建"笼子左上角格（有和值标签）"的坐标集合
   * 候选数绘制时需要避开这些格子的左上角区域
   * @private
   */
  _buildCageLabelSet(state) {
    this._cageLabelCellSet = new Set();
    const cages = state.cages;
    if (!cages || !Array.isArray(cages) || cages.length === 0) return;

    const size = state.size || state.gridSize || this._gridSize;
    for (let ci = 0; ci < cages.length; ci++) {
      const cage = cages[ci];
      if (!cage || !cage.cells || !Array.isArray(cage.cells) || cage.cells.length === 0) continue;
      if (cage.sum === null || cage.sum === undefined) continue;

      // 找到笼子中左上角（最小行、最小列）的格子
      let minR = size;
      let minC = size;
      for (let i = 0; i < cage.cells.length; i++) {
        const cellCoord = cage.cells[i];
        if (!Array.isArray(cellCoord) || cellCoord.length < 2) continue;
        const cr = cellCoord[0];
        const cc = cellCoord[1];
        if (cr < minR || (cr === minR && cc < minC)) {
          minR = cr;
          minC = cc;
        }
      }
      if (minR < size && minC < size) {
        this._cageLabelCellSet.add(minR + ',' + minC);
      }
    }
  }

  /**
   * 绘制笼子和值标签（白底黑字，位于笼子左上角格子的左上角）
   * @private
   */
  _drawCageSumLabels(ctx, state, cellSize, padding) {
    const cages = state.cages;
    if (!cages || !Array.isArray(cages) || cages.length === 0) return;

    const size = state.size || state.gridSize || this._gridSize;

    ctx.save();
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let ci = 0; ci < cages.length; ci++) {
      const cage = cages[ci];
      if (!cage || !cage.cells || !Array.isArray(cage.cells) || cage.cells.length === 0) continue;
      if (cage.sum === null || cage.sum === undefined) continue;

      // 找到笼子中左上角（最小行、最小列）的格子
      let minR = size;
      let minC = size;
      for (let i = 0; i < cage.cells.length; i++) {
        const cellCoord = cage.cells[i];
        if (!Array.isArray(cellCoord) || cellCoord.length < 2) continue;
        const cr = cellCoord[0];
        const cc = cellCoord[1];
        if (cr < minR || (cr === minR && cc < minC)) {
          minR = cr;
          minC = cc;
        }
      }
      if (minR >= size || minC >= size) continue;

      const labelX = minC * cellSize + padding + 2;
      const labelY = minR * cellSize + padding + 2;
      const text = String(cage.sum);

      const metrics = ctx.measureText(text);
      const tw = metrics.width;
      const th = 12;

      // 白底
      ctx.fillStyle = this.COLORS.cageLabelBg;
      ctx.fillRect(labelX - 1, labelY - 1, tw + 4, th + 2);

      // 黑字
      ctx.fillStyle = this.COLORS.cageLabelText;
      ctx.fillText(text, labelX + 1, labelY + 1);
    }

    ctx.restore();
  }

  /**
   * 绘制格子内容（数字或候选数）
   * @private
   */
  _drawCellContent(ctx, r, c, state, cellSize, padding) {
    const cells = state.cells;
    if (!cells || !cells[r] || !cells[r][c]) return;
    const cell = cells[r][c];

    const cx = c * cellSize + padding + cellSize / 2;
    const cy = r * cellSize + padding + cellSize / 2;

    // ---- Boss 战幽灵格（V4.3.18，对齐 V3 手册 3.6.1/3.6.7） ----
    // AI 占领的格子不显示数字：淡色底色 + 呼吸边框 + 中心标记（对=圆点/错=问号）
    // V4.3.26：兜底保护——格子已有数字时绝不画幽灵格（杜绝"黄点+数字"并存残留）
    if (cell.isAiFilled && this._bossGhostColor && !cell.fillNum && !cell.fixedNum) {
      const isMistake = !!cell._aiMistake;
      const bossColor = this._bossGhostColor;
      const x = c * cellSize + padding;
      const y = r * cellSize + padding;

      // 底色：Boss 主题色（淡）；AI 填错用更淡的灰
      ctx.save();
      if (isMistake) {
        // V4.3.24（Spec v1.3）：异步破绽格——红光微动（周期 1.5s），提示可看破
        const redPulse = (Date.now() % 1500) / 1500;
        const redAlpha = 0.08 + 0.10 * Math.abs(Math.sin(redPulse * Math.PI * 2));
        ctx.fillStyle = 'rgba(239, 68, 68, ' + redAlpha.toFixed(3) + ')';
      } else {
        ctx.fillStyle = this._hexToRgba(bossColor, 0.16);
      }
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.restore();

      // 边框：对=主题色实线呼吸 / 错=灰虚线（覆盖普通网格线）
      ctx.save();
      const phase2 = (Date.now() % 800) / 800;
      const breathe2 = 0.55 + 0.45 * Math.sin(phase2 * Math.PI * 2);
      if (isMistake) {
        ctx.strokeStyle = 'rgba(138, 138, 138, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + 0.75, y + 0.75, cellSize - 1.5, cellSize - 1.5);
      } else {
        ctx.strokeStyle = this._hexToRgba(bossColor, 0.35 + 0.45 * breathe2);
        ctx.lineWidth = 1.5 + breathe2;
        ctx.strokeRect(x + 0.75, y + 0.75, cellSize - 1.5, cellSize - 1.5);
      }
      ctx.restore();

      // 中心标记：对=实心圆点（Boss 色呼吸），错=问号 + 轻微晃动
      ctx.save();
      const phase = (Date.now() % 800) / 800; // 0~1 呼吸相位
      const breathe = 0.55 + 0.45 * Math.sin(phase * Math.PI * 2);
      if (isMistake) {
        // V5 4.3：错误格显示红叉（原为灰色问号）+ 轻微晃动
        const wobble = Math.sin(Date.now() / 180) * cellSize * 0.035;
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold ' + Math.round(cellSize * 0.46) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', cx + wobble, cy);
      } else {
        const dotR = Math.max(2.5, cellSize * 0.085 * breathe);
        ctx.fillStyle = this._hexToRgba(bossColor, 0.75);
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return; // 幽灵格不画数字/候选数
    }

    // 错误摇晃：旋转 15° 衰减（仅数字部分，格子底色不动）
    const shakeDeg = this._shakeDeg(r, c, Date.now());
    const shakeWrap = (fn) => {
      if (shakeDeg) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(shakeDeg * Math.PI / 180);
        ctx.translate(-cx, -cy);
        fn();
        ctx.restore();
      } else {
        fn();
      }
    };

    if (cell.fixedNum) {
      // ---- 固定数字：淡墨印刷体（Fira Code，规格 3.2） ----
      shakeWrap(() => {
        ctx.save();
        ctx.fillStyle = this.COLORS.fixedNum;
        ctx.font = '600 ' + Math.round(cellSize * 0.6) + 'px "Fira Code", "Cascadia Code", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(cell.fixedNum), cx, cy);
        ctx.restore();
      });
    } else if (cell.fillNum) {
      // ---- 玩家填入数字 ----
      const isError = cell.isError || cell.isCageSumError;
      // v2.0：WhatIf 假设模式——非根快照已有的填入数字 = 假设中填的 →
      // 紫罗兰色 + 斜体 + 发光（与正常数字区分，避免误认作正确答案）
      const whatIfCell = !isError && this._whatIf && this._whatIf.active &&
        !this._whatIf.rootFilled.has(r + ',' + c);
      ctx.save();
      if (whatIfCell) {
        ctx.fillStyle = this.COLORS.whatIfNum;                 // 紫罗兰 #8b5cf6
        ctx.font = 'italic ' + Math.round(cellSize * 0.62) + 'px Caveat, "Segoe Script", cursive'; // 斜体手写
        ctx.shadowColor = 'rgba(139, 92, 246, 0.6)';
        ctx.shadowBlur = Math.max(4, Math.round(cellSize * 0.15)); // 发光
      } else {
        ctx.fillStyle = isError ? this.COLORS.errorNum : this.COLORS.playerNum;
        // Q5 统一：玩家填入数字改用与固定数字相同的等宽印刷体（原 Caveat 手写体
        // 与题目数字字体不一致，用户反馈"填进去的数字字体不一样"）
        ctx.font = '600 ' + Math.round(cellSize * 0.6) + 'px "Fira Code", "Cascadia Code", Consolas, monospace';
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      shakeWrap(() => {
        ctx.fillText(String(cell.fillNum), cx, cy);
      });
      ctx.restore();
    } else if (cell.candidates && cell.candidates.length > 0) {
      // ---- 候选数笔记 ----
      // 该格若有笼和值标签，候选数整体向右下偏移，避免被标签遮挡
      const hasCageLabel = this._cageLabelCellSet &&
        this._cageLabelCellSet.has(r + ',' + c);
      this._drawCandidates(ctx, cell.candidates, r, c, cellSize, padding, hasCageLabel);
    }

    // ---- 排除标记（微型教学 eliminate：红色斜线叉）----
    if (this._eliminateCells && this._eliminateCells.has(r + ',' + c)) {
      const x0 = c * cellSize + padding;
      const y0 = r * cellSize + padding;
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.lineWidth = Math.max(2, Math.round(cellSize * 0.06));
      ctx.lineCap = 'round';
      const m = cellSize * 0.2;
      ctx.beginPath();
      ctx.moveTo(x0 + m, y0 + m);
      ctx.lineTo(x0 + cellSize - m, y0 + cellSize - m);
      ctx.moveTo(x0 + cellSize - m, y0 + m);
      ctx.lineTo(x0 + m, y0 + cellSize - m);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 绘制候选数笔记（格子内按 3x3 或 2x2 排列）
   * @private
   */
  _drawCandidates(ctx, candidates, r, c, cellSize, padding, hasCageLabel) {
    // 候选数排列维度：9x9 用 3x3，4x4 用 2x2
    const gridDim = this._gridSize <= 4 ? 2 : 3;
    const subCellSize = cellSize / gridDim;

    // v2.0 修复：笼和值标签（白底 ~14px 高，位于格子左上角）会遮挡候选数
    // 数字 1。0.3 子格的偏移远不足以避开。改为：有标签的格子，候选数网格
    // Y 方向从标签下方开始（压缩行高），数字 1-3 完整显示在标签下方；
    // X 方向保持原网格 + 微移。3 行候选数 4-9 依次下移，与相邻格不重叠。
    const labelH = 14; // 标签白底高度（_drawCageSumLabels：th=12 + 上下边距 2）
    const subH = hasCageLabel ? Math.max(6, (cellSize - labelH) / gridDim) : subCellSize;
    // Q5：笔记字号提升——原 Math.max(8, sub*0.55)：9x9 手机格子 40px → 子格 13.3px → 8px 兜底，
    // 笔记数字太小看不清。0.62→0.72 比例 + 10px 兜底，格子 40px 时字号 ≈10px（3x3 排列仍放得下）
    const fontSize = Math.max(10, Math.round((hasCageLabel ? subH : subCellSize) * 0.72));

    // v2.0：AI 笔记用 Boss 主题色淡渲染（cell._aiNote 标记）——低透明度，
    // 明显区别于真实数字（玩家不会把 AI 笔记误认成"AI 填的数"）
    const cells = this._state ? this._state.cells : null;
    const isAiNote = !!(cells && cells[r] && cells[r][c] && cells[r][c]._aiNote);
    const noteColor = isAiNote && this._bossGhostColor
      ? this._hexToRgba(this._bossGhostColor, 0.32)
      : this.COLORS.candidateNum;

    // 有笼和标签时，候选数 X 方向微移（0.3 子格）避让标签左缘；
    // Y 方向由压缩网格处理（从标签下方开始），无需额外偏移
    const offsetX = hasCageLabel ? subCellSize * 0.3 : 0;
    const offsetY = 0;

    // 格子边界（留出半个字宽/字高的安全边距，防止被裁剪）
    const halfChar = fontSize * 0.62;
    const cellX = c * cellSize + padding;
    const cellY = r * cellSize + padding;
    const originY = hasCageLabel ? cellY + labelH : cellY;
    const minX = cellX + halfChar;
    const maxX = cellX + cellSize - halfChar;
    const minY = hasCageLabel ? cellY + labelH + 2 : cellY + halfChar;
    const maxY = cellY + cellSize - halfChar;

    ctx.save();
    ctx.font = fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 按数字升序排列
    for (let i = 0; i < candidates.length; i++) {
      const num = candidates[i];
      const idx = num - 1; // 0-based
      const subR = Math.floor(idx / gridDim);
      const subC = idx % gridDim;
      let px = cellX + subC * subCellSize + subCellSize / 2 + offsetX;
      let py = originY + subR * subH + subH / 2 + offsetY;
      // 钳制在格子边界内，保证任何数字都完整显示
      px = Math.min(Math.max(px, minX), maxX);
      py = Math.min(Math.max(py, minY), maxY);
      // 笔记是玩家的私有工作区：对错由后台掌握，不在棋盘上做任何标记（如删除线/淡化）。
      // 保持笔记视觉纯净，玩家自主决定是否保留某条笔记。
      ctx.fillStyle = noteColor;
      ctx.fillText(String(num), px, py);
    }

    ctx.restore();
  }

  /**
   * 绘制行列标：左侧行标 A-I（4x4: A-D），顶部列标 1-9
   * @private
   */
  _drawAxisLabels(size, cellSize) {
    try {
      const ctx = this._ctx;
      const padL = this._padL;
      const padT = this._padT;
      ctx.save();
      // Q5：行列标字号再降一档（0.14→0.12，兜底 8→7）+ 提高对比度——
      // 用户要求"尽可能小但能被看见"：小字号不抢眼，颜色加深保证可读
      ctx.font = 'bold ' + Math.max(7, Math.round(cellSize * 0.12)) + 'px sans-serif';
      ctx.fillStyle = 'rgba(110, 82, 55, 0.95)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 行标：左侧字母 A-I
      for (let r = 0; r < size; r++) {
        const y = padT + r * cellSize + cellSize / 2;
        const label = String.fromCharCode(65 + r);
        ctx.fillText(label, padL * 0.5, y);
      }

      // 列标：顶部数字 1-9
      for (let c = 0; c < size; c++) {
        const x = padL + c * cellSize + cellSize / 2;
        ctx.fillText(String(c + 1), x, padT * 0.5);
      }

      ctx.restore();
    } catch (e) {
      console.error('[BoardRenderer] _drawAxisLabels error:', e);
    }
  }

  /**
   * 绘制选中格金色边框
   * @private
   */
  _drawSelection(ctx, cellSize, padding) {
    if (!this._selectedCell) return;

    const selR = this._selectedCell.r;
    const selC = this._selectedCell.c;
    if (selR < 0 || selR >= this._gridSize || selC < 0 || selC >= this._gridSize) return;

    const x = selC * cellSize + padding;
    const y = selR * cellSize + padding;

    ctx.save();
    ctx.strokeStyle = this.COLORS.selectedBorder;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, cellSize, cellSize);
    ctx.restore();
  }

  /**
   * hex 颜色转 rgba 字符串（幽灵格底色/圆点用）
   * @param {string} hex - '#rrggbb'
   * @param {number} alpha - 0~1
   * @returns {string}
   * @private
   */
  _hexToRgba(hex, alpha) {
    if (!hex) return 'rgba(0,0,0,' + alpha + ')';
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    if (h.length !== 6) return 'rgba(0,0,0,' + alpha + ')';
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
}

export default BoardRenderer;