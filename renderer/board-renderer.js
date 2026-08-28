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

    /** @type {Map<string,Set<number>>} 教学浮显笔记 "r,c" -> 数字集合（showNote/showNotes） */
    this._lessonNotes = new Map();

    // ---- Boss 战幽灵格（V4.3.18，对齐 V3 手册 3.6.1/3.6.7） ----
    /** @type {string|null} Boss 主题色（非战斗时为 null，不绘制幽灵格） */
    this._bossGhostColor = null;
    this._shakeCells = new Map(); // key 'r,c' -> until(ms)：错误摇晃动画（15°×3×400ms）
    // Q5：错误即时高亮——填错立即红色视觉。false 时错误格不显示红色，
    // 但错误记录（cell.isError）仍保留，不影响胜利判定（防错误通关）。
    this._instantErrorCheck = true;

    // ---- 颜色方案（P1：书卷色板——朱砂/黄铜/青墨淡染，去 Material 高亮；错误红加深达 AA） ----
    this.COLORS = {
      background: '#f5f0e8',
      gridLine: '#666666',
      boxLine: '#1a1a1a',
      outerLine: '#1a1a1a',
      fixedNum: '#333333',   // 笔记本主题：加深淡墨（原 #5a5a5a 对比度不足），Q5 可读性
      playerNum: '#1a5be0',   // Q#2：玩家填入改鲜亮的蓝（原 #1a3a5c 与 fixedNum #333333 同为极暗色，
                              // 字体又统一后肉眼难以区分）。鲜蓝与出厂近黑形成强烈对比。
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
      sameNoteHighlight: '#d01818', // Q#2：同数字高亮的匹配笔记数字（醒目红，替换原紫 #8b3adc）
      cageBorder: '#c98a60',
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
      // Q#2 修复：渲染器需持有本次渲染状态，供候选数绘制按 highlights 给笔记数字着色。
      // 此前 _drawCandidates 读取 this._state 但从未赋值，导致 sameNumberNum 恒为 null，紫色标注失效。
      this._state = state;

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

      // 4.5 CM4-R6.5B-1：据点污染层（冲突热度 → 闪烁/扭曲，Ghost 前置预警）
      if (state.pollution && state.pollution.cells) {
        this._drawPollution(this._ctx, state, cellSize, padding);
      }

      // 4.6 CM4-Battlefield：战场表观层（归属格角标 / 落子轨迹 / 争夺残影 / 连线 / 压力 / 据点状态 / 爆发）
      if (state.battlefield) {
        this._drawBattlefieldViz(this._ctx, state, cellSize, padding);
      }

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

      // 8.4 密文抽取（extract）——密文字格右下角琥珀角标
      if (this._extract && this._extract.marked && this._extract.marked.size > 0) {
        this._drawExtractMarks(this._ctx, state, cellSize, padding);
      }

      // 8.5 铃铛（黄·潜伏档）——铃铛格左上角青色环标记（未落=描边，已落=实心）
      if (this._bells && this._bells.marked && this._bells.marked.size > 0) {
        this._drawBellMarks(this._ctx, state, cellSize, padding);
      }

      // 8.6 分区撤离（507）——锁定区空格置灰（给定格保留可读）
      this._drawEvacuationLock(this._ctx, state, cellSize, padding);

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
      if (this._instantErrorCheck && cell && (cell.isError || cell.isCageSumError)) {
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
   * 设置/清除教学浮显笔记（showNote/showNotes 的"数字浮现"）
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number|string} num - 笔记数字
   * @param {boolean} on - true 显示 / false 移除
   */
  setLessonNote(r, c, num, on) {
    const key = r + ',' + c;
    if (on) {
      let set = this._lessonNotes.get(key);
      if (!set) { set = new Set(); this._lessonNotes.set(key, set); }
      set.add(String(num));
    } else if (this._lessonNotes.has(key)) {
      this._lessonNotes.get(key).delete(String(num));
      if (this._lessonNotes.get(key).size === 0) this._lessonNotes.delete(key);
    }
  }

  /**
   * 清除全部教学浮显笔记
   */
  clearLessonNotes() {
    this._lessonNotes.clear();
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
        if (this._instantErrorCheck && cell && (cell.isError || cell.isCageSumError)) {
          const x = c * cellSize + padding;
          const y = r * cellSize + padding;
          ctx.fillStyle = this.COLORS.errorBg;
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }
  }

  /**
   * CM4-R6.5B-1：据点污染层 —— 把冲突热度翻译成"战场被污染"的视觉。
   * 由 getPresentation().pollution.cells（"r,c"→stage）驱动：
   *   stage 1：中心格轻微闪烁（淡紫呼吸底色）——"这里要出事"
   *   stage 2：整宫外溢 + 边缘波纹（更强底色 + 宫格边缘光）——"战场被污染"
   * 仅画在空格上（不受玩家格/固定格影响），是 Ghost 出现前的前置预警。
   * @private
   */
  _drawPollution(ctx, state, cellSize, padding) {
    const cellsMap = state.pollution.cells || {};
    if (!cellsMap || Object.keys(cellsMap).length === 0) return;
    const now = Date.now();
    const wave = (phase) => 0.5 + 0.5 * Math.sin((now % 1000) / 1000 * Math.PI * 2 + phase);
    const size = state.size || state.gridSize || this._gridSize;

    ctx.save();
    // 污染格底色会盖住下面的宫/笼线，先垫一层透明让其浮在网格上，描边用更粗光晕
    for (const key in cellsMap) {
      const stage = cellsMap[key];
      if (!stage) continue;
      const parts = key.split(',');
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const x = c * cellSize + padding;
      const y = r * cellSize + padding;

      if (stage === 1) {
        // stage 1：中心格轻微闪烁（低透明度呼吸底色）
        const a = 0.05 + 0.05 * wave(r * 0.7 + c * 0.3);
        ctx.fillStyle = 'rgba(168, 85, 247, ' + a.toFixed(3) + ')';
        ctx.fillRect(x, y, cellSize, cellSize);
      } else {
        // stage 2：整宫外溢——更强底染 + 宫格边缘波纹
        const a = 0.10 + 0.08 * wave(r + c);
        ctx.fillStyle = 'rgba(180, 60, 120, ' + a.toFixed(3) + ')';
        ctx.fillRect(x, y, cellSize, cellSize);
        const edgeA = 0.22 + 0.18 * wave(r * 1.3 + c);
        ctx.strokeStyle = 'rgba(196, 96, 168, ' + edgeA.toFixed(3) + ')';
        ctx.lineWidth = 1.5 + 0.6 * wave(c);
        ctx.strokeRect(x + 0.75, y + 0.75, cellSize - 1.5, cellSize - 1.5);
      }
    }
    ctx.restore();
  }

  /**
   * CM4-Battlefield：战场表观层 —— 把三点连线对战从"棋盘"变成"战场"。
   * 由状态对象 state.battlefield（BattlefieldViz.build 产出）驱动，纯视觉、无逻辑：
   *   1. 格子状态：永久归属格（玩家青墨 / 敌方黄铜）左上角小角标
   *   2. AI 轨迹：敌方最近落子残影轨迹（黄铜，淡出）
   *   3. 玩家轨迹：己方反击路径轨迹（青墨，淡出）
   *   4. 争夺残影：争夺据点核心格的"残影"（偏移 ghost 徽记）
   *   5. 连线形成：三个据点核心格连成三角形，归属边点亮
   *   6. 接近三连压力：某方占 2 据点 → 缺失点红压脉动
   *   7. 据点状态：占领(扩张环)/争夺(双色叉)/失守(红闪环)
   *   8. 爆发：连线绝杀的扩张三角爆发
   * @private
   */
  _drawBattlefieldViz(ctx, state, cellSize, padding) {
    const viz = state.battlefield;
    if (!viz) return;
    try {
      const now = Date.now();
      const px = (c) => c * cellSize + padding + cellSize / 2;
      const py = (r) => r * cellSize + padding + cellSize / 2;

      // ---- 1. 格子状态：永久归属格角标（左上角小三角） ----
      this._drawOwnedCorners(ctx, viz, cellSize, padding);

      // ---- 2+3. 落子轨迹（连线段 + 端点光点，淡出） ----
      this._drawTrail(ctx, viz.trails.ai, 'rgba(212, 168, 83,', px, py, cellSize);
      this._drawTrail(ctx, viz.trails.player, 'rgba(90, 158, 110,', px, py, cellSize);

      // ---- 4. 争夺残影：争夺据点核心格偏移 ghost 徽记 ----
      this._drawContestGhost(ctx, viz, cellSize, padding, now);

      // ---- 5. 连线形成反馈（三角形边） ----
      this._drawLineEdges(ctx, viz, cellSize, padding, now);

      // ---- 6. 接近三连压力提示 ----
      this._drawNearTriple(ctx, viz, cellSize, padding, now);

      // ---- 7. 据点状态变化（占领/争夺/失守） ----
      this._drawHubFx(ctx, viz, cellSize, padding, now);

      // ---- 8. 连线爆发（扩张三角 + 光晕） ----
      this._drawBurst(ctx, viz, cellSize, padding, now);

      // ---- 9. 绝杀就绪：核心格金色脉动光环（玩家占满3据点后点亮） ----
      this._drawLineReadyGlow(ctx, viz, cellSize, padding, now);

      // ---- 10. 拖拽划线进度：金色连线 + 进度指示 ----
      this._drawDragLine(ctx, viz, cellSize, padding, now);
    } catch (e) {
      console.warn('[BoardRenderer] _drawBattlefieldViz error:', e);
    }
  }

  /** 归属格角标：左上角小三角（玩家青墨 / 敌方黄铜） */
  _drawOwnedCorners(ctx, viz, cellSize, padding) {
    const owned = viz.ownedCells;
    if (!owned || !Object.keys(owned).length) return;
    const s = Math.max(5, cellSize * 0.22);
    ctx.save();
    for (const key in owned) {
      const side = owned[key];
      const parts = key.split(',');
      const r = Number(parts[0]), c = Number(parts[1]);
      const x = c * cellSize + padding;
      const y = r * cellSize + padding;
      ctx.fillStyle = side === 'player'
        ? 'rgba(90, 158, 110, 0.85)'
        : 'rgba(212, 168, 83, 0.85)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** 落子轨迹：连接最近落子点成淡化折线 + 端点光点 */
  _drawTrail(ctx, trail, colorPrefix, px, py, cellSize) {
    if (!trail || trail.length < 2) return;
    const pts = trail.filter((p) => p.alpha > 0.02);
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 连线：按最旧点 alpha 淡出
    const baseA = pts[0].alpha;
    ctx.strokeStyle = colorPrefix + (0.28 * baseA).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1.5, cellSize * 0.06);
    ctx.beginPath();
    ctx.moveTo(px(pts[0].c), py(pts[0].r));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i].c), py(pts[i].r));
    ctx.stroke();
    // 端点光点：最新点最亮
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i].alpha;
      ctx.fillStyle = colorPrefix + (0.5 * a).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(px(pts[i].c), py(pts[i].r), Math.max(1.5, cellSize * 0.05 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 争夺残影：争夺据点核心格的偏移 ghost 徽记（残影/运动模糊感） */
  _drawContestGhost(ctx, viz, cellSize, padding, now) {
    const idxs = viz.contested || [];
    if (!idxs.length) return;
    const cores = viz.cores || [];
    const t = now / 1000;
    ctx.save();
    for (const i of idxs) {
      const core = cores[i];
      if (!core) continue;
      const cx = core.c * cellSize + padding + cellSize / 2;
      const cy = core.r * cellSize + padding + cellSize / 2;
      const drift = Math.sin(t * 2 + i * 1.7) * cellSize * 0.12;
      const rad = cellSize * 0.34;
      const a = 0.16 + 0.10 * Math.abs(Math.sin(t * 3 + i));
      // 偏移的菱形（残影）
      ctx.fillStyle = 'rgba(184, 134, 11, ' + (a * 0.5).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(cx + drift, cy - rad);
      ctx.lineTo(cx + rad + drift, cy);
      ctx.lineTo(cx + drift, cy + rad);
      ctx.lineTo(cx - rad + drift, cy);
      ctx.closePath();
      ctx.fill();
      // 主菱形（青墨，轻微残影双影）
      ctx.fillStyle = 'rgba(62, 110, 90, ' + (a * 0.6).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(cx - drift, cy - rad);
      ctx.lineTo(cx + rad - drift, cy);
      ctx.lineTo(cx - drift, cy + rad);
      ctx.lineTo(cx - rad - drift, cy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** 连线形成：三个据点核心格连成三角形，归属边点亮 / 相争边闪烁 */
  _drawLineEdges(ctx, viz, cellSize, padding, now) {
    const line = viz.line;
    if (!line || !line.edges) return;
    const px = (c) => c * cellSize + padding + cellSize / 2;
    const py = (r) => r * cellSize + padding + cellSize / 2;
    const t = now / 1000;
    ctx.save();
    ctx.lineCap = 'round';
    for (const e of line.edges) {
      const x1 = px(e.a.c), y1 = py(e.a.r), x2 = px(e.b.c), y2 = py(e.b.r);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      if (e.state === 'owned') {
        // 同方占领：点亮该边
        ctx.strokeStyle = (e.side === 'player')
          ? 'rgba(90, 158, 110, 0.55)'
          : 'rgba(212, 168, 83, 0.55)';
        ctx.lineWidth = Math.max(2, cellSize * 0.09);
        ctx.stroke();
      } else if (e.state === 'clash') {
        // 双方各占一端：红金相争闪烁
        const a = 0.35 + 0.25 * Math.abs(Math.sin(t * 4));
        ctx.strokeStyle = 'rgba(239, 68, 68, ' + a.toFixed(3) + ')';
        ctx.setLineDash([cellSize * 0.18, cellSize * 0.12]);
        ctx.lineWidth = Math.max(1.5, cellSize * 0.05);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // 开放边：极淡引导线
        ctx.strokeStyle = 'rgba(120, 120, 120, 0.16)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  /** 接近三连：某方占 2 据点 → 缺失点红压脉动 + 汇聚箭头 */
  _drawNearTriple(ctx, viz, cellSize, padding, now) {
    const line = viz.line;
    const nt = line && line.nearTriple;
    if (!nt) return;
    const core = nt.missing;
    if (!core) return;
    const cx = core.c * cellSize + padding + cellSize / 2;
    const cy = core.r * cellSize + padding + cellSize / 2;
    const t = now / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const color = nt.side === 'player'
      ? 'rgba(90, 158, 110,'
      : 'rgba(212, 168, 83,';
    ctx.save();
    // 缺失点红/青压环（呼吸放大）
    const rad = cellSize * (0.35 + 0.18 * pulse);
    ctx.strokeStyle = color + (0.5 + 0.3 * pulse).toFixed(3) + ')';
    ctx.lineWidth = 2 + pulse * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    // 中心警示点
    ctx.fillStyle = color + '0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, cellSize * 0.09), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 据点状态变化：占领(扩张环) / 迁移失守(红闪环) / 显现(亮相光晕) */
  _drawHubFx(ctx, viz, cellSize, padding, now) {
    const fx = viz.hubFx;
    if (!fx || !Object.keys(fx).length) return;
    const cores = viz.cores || [];
    ctx.save();
    for (const k in fx) {
      const i = Number(k);
      const core = cores[i];
      const f = fx[i];
      if (!core || !f) continue;
      const cx = core.c * cellSize + padding + cellSize / 2;
      const cy = core.r * cellSize + padding + cellSize / 2;
      const prog = 1 - f.alpha;
      if (f.type === 'capture') {
        // 占领：扩张环（青墨/黄铜）
        const color = f.side === 'boss'
          ? 'rgba(212, 168, 83,'
          : 'rgba(90, 158, 110,';
        const rad = cellSize * (0.3 + prog * 0.7);
        ctx.strokeStyle = color + (f.alpha * 0.8).toFixed(3) + ')';
        ctx.lineWidth = 3 * f.alpha;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.type === 'loss') {
        // 失守：红闪环
        const rad = cellSize * (0.3 + prog * 0.6);
        ctx.strokeStyle = 'rgba(239, 68, 68, ' + (f.alpha * 0.85).toFixed(3) + ')';
        ctx.lineWidth = 2.5 * f.alpha;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(239, 68, 68, ' + (f.alpha * 0.25).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 显现：淡金光晕
        const rad = cellSize * (0.4 + prog * 0.5);
        ctx.strokeStyle = 'rgba(245, 197, 66, ' + (f.alpha * 0.7).toFixed(3) + ')';
        ctx.lineWidth = 2 * f.alpha;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** 连线爆发：扩张三角 + 顶点光晕（绝杀完成） */
  _drawBurst(ctx, viz, cellSize, padding, now) {
    const burst = viz.burst;
    if (!burst || !burst.cells || burst.cells.length < 3) return;
    const px = (c) => c * cellSize + padding + cellSize / 2;
    const py = (r) => r * cellSize + padding + cellSize / 2;
    const agePts = burst.ts !== undefined ? (now - burst.ts) / 1500 : 1;
    if (agePts <= 0 || agePts >= 1) return;
    const prog = agePts; // 0→1
    const pts = burst.cells.map((c) => ({ x: px(c.c), y: py(c.r) }));
    const color = burst.side === 'player'
      ? '90, 158, 110' : '212, 168, 83';
    const sx = (pts[0].x + pts[1].x + pts[2].x) / 3;
    const sy = (pts[0].y + pts[1].y + pts[2].y) / 3;
    // 两段式：0→0.45 收缩凝聚，0.45→1 向外爆发
    const gather = Math.min(1, prog / 0.45);
    const boom = prog < 0.45 ? 0 : (prog - 0.45) / 0.55;
    const eff = prog < 0.45 ? (1.6 - 1.25 * gather) : (0.35 + boom * 2.6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 凝聚期：顶点向中心汇聚的能量流
    if (gather < 1) {
      const glowA = (1 - gather) * 0.55;
      ctx.strokeStyle = 'rgba(255,255,255,' + glowA.toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, cellSize * 0.035);
      for (const p of pts) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
    }
    // 三角区域（凝聚收拢 → 爆发扩张）
    ctx.fillStyle = 'rgba(' + color + ', ' + (0.5 * (1 - prog) + 0.04).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(sx + (pts[0].x - sx) * eff, sy + (pts[0].y - sy) * eff);
    ctx.lineTo(sx + (pts[1].x - sx) * eff, sy + (pts[1].y - sy) * eff);
    ctx.lineTo(sx + (pts[2].x - sx) * eff, sy + (pts[2].y - sy) * eff);
    ctx.closePath();
    ctx.fill();
    // 三角描边（固定三点）
    ctx.strokeStyle = 'rgba(' + color + ', ' + (0.95 * (1 - prog)).toFixed(3) + ')';
    ctx.lineWidth = 2 + (1 - prog) * 4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath();
    ctx.stroke();
    // 顶点光晕
    for (const p of pts) {
      const r = cellSize * (0.5 + boom * 1.6);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, 'rgba(' + color + ', ' + (0.8 * (1 - prog)).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + color + ', 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 爆发期：中心白热核
    if (boom > 0) {
      const coreA = 0.9 * (1 - boom);
      const r = cellSize * (0.3 + boom * 1.8);
      const gc = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gc.addColorStop(0, 'rgba(255,255,255,' + coreA.toFixed(3) + ')');
      gc.addColorStop(0.4, 'rgba(' + color + ', ' + (coreA * 0.55).toFixed(3) + ')');
      gc.addColorStop(1, 'rgba(' + color + ', 0)');
      ctx.fillStyle = gc;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      // 爆发放射碎屑（短射线）
      const rays = 12;
      const angBase = now / 220;
      ctx.lineWidth = Math.max(1, cellSize * 0.03);
      for (let i = 0; i < rays; i++) {
        const a = angBase + (i / rays) * Math.PI * 2;
        const r0 = cellSize * (0.4 + boom * 1.4);
        const r1 = r0 + cellSize * (0.9 * (1 - boom) + 0.2);
        ctx.strokeStyle = 'rgba(' + color + ', ' + (0.55 * (1 - boom)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
        ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    ctx.restore();
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
      ctx.lineWidth = isSelected ? 2.5 : 1.5;

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
   * 构建"笼子左上角格（有和值标签）"的 Map：key="r,c"，value=标签白底宽度（px）
   * 候选数绘制时需要根据实际标签宽度避让第 1 行
   * @private
   */
  _buildCageLabelSet(state) {
    this._cageLabelCellSet = new Map(); // key: "r,c", value: labelBgWidth
    const cages = state.cages;
    if (!cages || !Array.isArray(cages) || cages.length === 0) return;

    const size = state.size || state.gridSize || this._gridSize;
    // 用临时 canvas 上下文测量标签文字宽度（与 _drawCageSumLabels 使用相同字体）
    const gridDim = this._gridSize <= 4 ? 2 : 3;
    const subCellSize = this._cellSize / gridDim;
    const labelFontSize = Math.max(11, Math.floor(this._cellSize * 0.30));
    const testCtx = this._ctx;
    const oldFont = testCtx.font;
    testCtx.font = '700 ' + labelFontSize + 'px "Fira Code", "Cascadia Code", Consolas, monospace';

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
        const tw = testCtx.measureText(String(cage.sum)).width;
        const bgWidth = tw + 4; // 左右边距各 2px（与 _drawCageSumLabels 一致）
        this._cageLabelCellSet.set(minR + ',' + minC, bgWidth);
      }
    }
    testCtx.font = oldFont;
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
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Q5 可读性：笼和值标签加大加粗（LogicWiz 风格），
    // 字号约为格子宽度的 30%，醒目但不越界，与第 1 行候选数水平并排
    const gridDim = this._gridSize <= 4 ? 2 : 3;
    const subCellSize = cellSize / gridDim;
    const labelFontSize = Math.max(11, Math.floor(cellSize * 0.30));
    ctx.font = '700 ' + labelFontSize + 'px "Fira Code", "Cascadia Code", Consolas, monospace';

    // 标签白底高度（紧凑边距，尽量不超过第 1 行子格高度）
    const labelCapH = labelFontSize * 0.78;
    const labelPadV = 1;
    const labelBgH = labelCapH + labelPadV * 2;
    // 垂直对齐：标签顶部与格子顶部留 1px 间隙
    const labelYOffset = 1;

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
      const labelY = minR * cellSize + padding + labelYOffset + labelBgH / 2;
      const text = String(cage.sum);

      const metrics = ctx.measureText(text);
      const tw = metrics.width;

      // 白底
      ctx.fillStyle = this.COLORS.cageLabelBg;
      ctx.fillRect(labelX - 1, labelY - labelBgH / 2, tw + 4, labelBgH);

      // 深棕字（与笼边框同色系，不抢数字的注意力）
      ctx.fillStyle = this.COLORS.cageLabelText;
      ctx.fillText(text, labelX + 1, labelY);
    }

    ctx.restore();
  }

  // 密文抽取（extract）：外部在关卡加载/填数后调用，同步"哪些格是密文字 / 哪些已抽对"
  setExtract(cells, doneKeys) {
    const marked = new Set();
    (cells || []).forEach(([r, c]) => { if (r !== undefined && c !== undefined) marked.add(r + ',' + c); });
    const done = new Set();
    (doneKeys || []).forEach((k) => done.add(String(k)));
    this._extract = { marked, done };
  }

  // 铃铛（黄·潜伏档）：外部同步"哪些格是铃铛 / 哪些已自动落数"
  setBells(cells, resolvedKeys) {
    const marked = new Set();
    (cells || []).forEach((k) => { if (k) marked.add(String(k)); });
    const done = new Set();
    (resolvedKeys || []).forEach((k) => done.add(String(k)));
    this._bells = { marked, done };
  }

  // 铃铛（黄·潜伏档）：标记引信最短（最紧迫）的铃铛，渲染层闪烁/摇晃示警
  setBellCritical(key) {
    this._bellCritical = key ? String(key) : null;
  }

  // 密文映射（504）：同步"哪些给定格是密文符号 + 数字→符号id 映射"
  setCipher(cells, index) {
    if (!cells || !cells.length) { this._cipher = null; return; }
    const cellSet = new Set();
    (cells || []).forEach(([r, c]) => { if (r !== undefined && c !== undefined) cellSet.add(r + ',' + c); });
    const valueToSym = {};
    (index || []).forEach((symId, i) => { valueToSym[i + 1] = symId; }); // 顺序即 1~9 映射
    this._cipher = { cells: cellSet, valueToSym: valueToSym };
  }

  // 分区撤离（507）：锁定区格子置灰（给定格保留可读）
  setEvacuationLocked(keys) {
    this._evacLocked = keys instanceof Set ? keys : (keys ? new Set(keys) : null);
  }

  _drawEvacuationLock(ctx, state, cellSize, padding) {
    if (!this._evacLocked || !this._evacLocked.size) return;
    ctx.save();
    this._evacLocked.forEach((k) => {
      const p = String(k).split(',');
      const r = Number(p[0]), c = Number(p[1]);
      if (isNaN(r) || isNaN(c)) return;
      const cell = state.cells && state.cells[r] && state.cells[r][c];
      if (cell && cell.fixedNum) return; // 给定格保留可读
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(c * cellSize + padding, r * cellSize + padding, cellSize, cellSize);
    });
    ctx.restore();
  }

  // 密文符号：canvas 自绘 9 种易区分图形（金色），索引面板与盘面共用
  _drawCipherGlyph(ctx, sym, x, y, s) {
    ctx.save();
    ctx.fillStyle = this.COLORS.cipherGold || '#ffd9a0';
    ctx.strokeStyle = '#ffd9a0';
    ctx.lineWidth = Math.max(1.5, s * 0.09);
    const R = s * 0.5;
    const half = s * 0.5;
    switch (sym) {
      case 0: // 实心圆
        ctx.beginPath(); ctx.arc(x, y, R * 0.72, 0, Math.PI * 2); ctx.fill(); break;
      case 1: // 实心三角
        ctx.beginPath();
        ctx.moveTo(x, y - R * 0.8); ctx.lineTo(x + R * 0.8, y + R * 0.6); ctx.lineTo(x - R * 0.8, y + R * 0.6);
        ctx.closePath(); ctx.fill(); break;
      case 2: // 实心方
        ctx.fillRect(x - R * 0.7, y - R * 0.7, R * 1.4, R * 1.4); break;
      case 3: // 菱形
        ctx.beginPath();
        ctx.moveTo(x, y - R * 0.85); ctx.lineTo(x + R * 0.6, y); ctx.lineTo(x, y + R * 0.85); ctx.lineTo(x - R * 0.6, y);
        ctx.closePath(); ctx.fill(); break;
      case 4: // 五角星
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const rad = i % 2 === 0 ? R * 0.85 : R * 0.38;
          const a = -Math.PI / 2 + i * Math.PI / 5;
          const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); break;
      case 5: // 圆环
        ctx.beginPath(); ctx.arc(x, y, R * 0.7, 0, Math.PI * 2); ctx.stroke(); break;
      case 6: // 十字
        ctx.lineWidth = Math.max(2, s * 0.13);
        ctx.beginPath();
        ctx.moveTo(x - R * 0.7, y); ctx.lineTo(x + R * 0.7, y);
        ctx.moveTo(x, y - R * 0.7); ctx.lineTo(x, y + R * 0.7);
        ctx.stroke(); break;
      case 7: // 六边形
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 3;
          const px = x + Math.cos(a) * R * 0.75, py = y + Math.sin(a) * R * 0.75;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke(); break;
      default: // 8 空心方
        ctx.strokeRect(x - R * 0.7, y - R * 0.7, R * 1.4, R * 1.4); break;
    }
    ctx.restore();
  }

  _drawBellMarks(ctx, state, cellSize, padding) {
    if (!this._bells || !this._bells.marked || !this._bells.marked.size) return;
    ctx.save();
    const now = Date.now();
    this._bells.marked.forEach((key) => {
      const p = String(key).split(',');
      const r = Number(p[0]), c = Number(p[1]);
      if (isNaN(r) || isNaN(c)) return;
      if (this._bells.done && this._bells.done.has(key)) return; // 落数后铃铛消失
      const s = Math.max(10, cellSize * 0.34); // 铃铛整体尺寸
      const x = c * cellSize + padding + cellSize * 0.5; // 格子正中央
      const y = r * cellSize + padding + cellSize * 0.5;
      // 引信最短铃铛：闪烁 + 左右摇晃示警
      const crit = this._bellCritical === key;
      const rock = crit ? Math.sin(now / 160) * 0.16 : 0;
      const blink = crit && (now % 500) < 250;
      const bodyAlpha = blink ? 0.30 : 0.88;
      const dark = 'rgba(20,40,60,0.9)';
      if (crit) { ctx.save(); ctx.translate(x, y); ctx.rotate(rock); ctx.translate(-x, -y); }
      // 铃身：穹顶 + 喇叭口
      ctx.beginPath();
      ctx.moveTo(x - s * 0.34, y - s * 0.30);
      ctx.quadraticCurveTo(x - s * 0.30, y - s * 0.48, x, y - s * 0.48);
      ctx.quadraticCurveTo(x + s * 0.30, y - s * 0.48, x + s * 0.34, y - s * 0.30);
      ctx.lineTo(x + s * 0.26, y + s * 0.02);
      ctx.lineTo(x + s * 0.40, y + s * 0.34);
      ctx.lineTo(x - s * 0.40, y + s * 0.34);
      ctx.lineTo(x - s * 0.26, y + s * 0.02);
      ctx.closePath();
      ctx.fillStyle = 'rgba(150,215,255,' + bodyAlpha + ')';
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // 底部开口线
      ctx.beginPath();
      ctx.moveTo(x - s * 0.30, y + s * 0.34);
      ctx.quadraticCurveTo(x, y + s * 0.42, x + s * 0.30, y + s * 0.34);
      ctx.stroke();
      // 铃舌（clapper）
      ctx.beginPath();
      ctx.arc(x, y + s * 0.45, s * 0.10, 0, Math.PI * 2);
      ctx.fillStyle = dark;
      ctx.fill();
      // 顶部挂环
      ctx.beginPath();
      ctx.arc(x, y - s * 0.50, s * 0.07, 0, Math.PI * 2);
      ctx.stroke();
      if (crit) ctx.restore();
    });
    ctx.restore();
  }

  _drawExtractMarks(ctx, state, cellSize, padding) {
    if (!this._extract || !this._extract.marked || !this._extract.marked.size) return;
    ctx.save();
    this._extract.marked.forEach((key) => {
      const p = String(key).split(',');
      const r = Number(p[0]), c = Number(p[1]);
      if (r === undefined || c === undefined || isNaN(r) || isNaN(c)) return;
      const done = this._extract.done && this._extract.done.has(key);
      const s = Math.max(8, cellSize * 0.28);
      const ox = c * cellSize + padding + cellSize - s;
      const oy = r * cellSize + padding + cellSize - s;
      // 撑满右下角的小三角角标：抽对=实心琥珀，未抽=透明琥珀描边
      ctx.beginPath();
      ctx.moveTo(ox, oy - 0.5);
      ctx.lineTo(ox + s, oy - 0.5);
      ctx.lineTo(ox + s, oy + s);
      ctx.closePath();
      ctx.fillStyle = done ? 'rgba(217,164,65,0.95)' : 'rgba(217,164,65,0.20)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(217,164,65,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
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

      // ---- 主内容：Boss 专属色填充标记 + 玩家笔记（CM4-R9）----
      // AI 落格只用 Boss 专属色识别（圆点/三角），绝不显示 AI 填了什么数字（防作弊）；
      // 玩家仍可在其上写高对比笔记（白字黑描边），AI 填写后笔记不消失。
      const cands = (cell.candidates && cell.candidates.size)
        ? Array.from(cell.candidates).sort((a, b) => a - b) : [];
      ctx.save();
      if (cands.length === 0) {
        if (isMistake) {
          const wobble = Math.sin(Date.now() / 180) * cellSize * 0.035;
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold ' + Math.round(cellSize * 0.46) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✕', cx + wobble, cy);
        } else {
          // Boss 专属色圆点填充（不显示数字）——玩家不知道 AI 填了什么
          const dotR = Math.max(2.5, cellSize * 0.09);
          ctx.fillStyle = this._hexToRgba(bossColor, 0.85);
          ctx.beginPath();
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // 有玩家笔记：左上角小 Boss 色三角标识 AI 占（不露数字），主体画高对比笔记
        ctx.fillStyle = this._hexToRgba(bossColor, 0.9);
        ctx.beginPath();
        const sz = cellSize * 0.15;
        ctx.moveTo(x, y);
        ctx.lineTo(x + sz, y);
        ctx.lineTo(x, y + sz);
        ctx.closePath();
        ctx.fill();
        this._drawAICellNotes(ctx, cands, r, c, cellSize, padding);
      }
      ctx.restore();
      return; // AI 格不显示数字（Boss 专属色识别 + 高对比玩家笔记）
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
      // ---- 固定数字：加深淡墨印刷体（Fira Code，规格 3.2）----
      shakeWrap(() => {
        ctx.save();
        // V4.3.40：密文映射——该固定格是密文格时，画金色符号而非数字
        const sym = (this._cipher && this._cipher.cells && this._cipher.cells.has(r + ',' + c))
          ? this._cipher.valueToSym[cell.fixedNum] : null;
        if (sym !== undefined && sym !== null) {
          this._drawCipherGlyph(ctx, sym, cx, cy, Math.round(cellSize * 0.52));
          ctx.restore();
          return;
        }
        ctx.fillStyle = this.COLORS.fixedNum;
        // Q#2 区分：出厂数字更重（800）
        ctx.font = '800 ' + Math.round(cellSize * 0.6) + 'px "Fira Code", "Cascadia Code", Consolas, monospace';
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
        ctx.fillStyle = (this._instantErrorCheck && isError) ? this.COLORS.errorNum : this.COLORS.playerNum;
        // Q5 统一：玩家填入数字改用与固定数字相同的等宽印刷体（原 Caveat 手写体
        // 与题目数字字体不一致，用户反馈"填进去的数字字体不一样"）
        // Q#2 区分：玩家数字字重更轻（600）+ 鲜蓝色，出厂数字 800 近黑——色彩+粗细双重区分
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
      // 该格若有笼和值标签，取标签白底宽度（像素），供第 1 行候选数水平避让
      const labelWidth = (this._cageLabelCellSet && this._cageLabelCellSet.get(r + ',' + c)) || 0;
      this._drawCandidates(ctx, cell.candidates, r, c, cellSize, padding, labelWidth);
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

    // ---- 教学浮显笔记（showNote/showNotes：数字浮现在格右上角，区别于真实候选数）----
    if (this._lessonNotes && this._lessonNotes.has(r + ',' + c)) {
      const nums = Array.from(this._lessonNotes.get(r + ',' + c)).sort().join('');
      const x0 = c * cellSize + padding;
      const y0 = r * cellSize + padding;
      ctx.save();
      ctx.font = '700 ' + Math.max(10, Math.round(cellSize * 0.3)) + 'px "Fira Code", "Cascadia Code", Consolas, monospace';
      ctx.fillStyle = 'rgba(236, 181, 72, 0.95)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(nums, x0 + cellSize - 3, y0 + 2);
      ctx.restore();
    }

    // ---- CM4-R10：AI 预告窗口——目标格"即将落子"蓄力警示（呼吸红框 + 四角 + 读秒）----
    if (cell._telegraphUntil && Date.now() < cell._telegraphUntil) {
      const remain = cell._telegraphUntil - Date.now();
      const x0 = c * cellSize + padding;
      const y0 = r * cellSize + padding;
      const wave = Math.sin((Date.now() % 360) * Math.PI / 180);
      const bossColor = this._bossGhostColor || '#e8b46a';
      ctx.save();
      // 呼吸红/金框：随正弦波脉动加粗
      ctx.strokeStyle = this._hexToRgba('#ff5b5b', 0.55 + 0.45 * ((wave + 1) / 2));
      ctx.lineWidth = Math.max(2, (cellSize * 0.055) * (0.6 + 0.4 * ((wave + 1) / 2)));
      ctx.strokeRect(x0 + 1.5, y0 + 1.5, cellSize - 3, cellSize - 3);
      // 四角警示三角（红）
      ctx.fillStyle = this._hexToRgba('#ff5b5b', 0.85);
      const t = Math.round(cellSize * 0.17);
      const tri = (ax, ay, dx, dy, hz) => {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + dx * t, ay);
        ctx.lineTo(ax, ay + dy * t);
        ctx.closePath();
        ctx.fill();
      };
      tri(x0, y0, 1, 1); tri(x0 + cellSize - t, y0, -1, 1);
      tri(x0, y0 + cellSize - t, 1, -1); tri(x0 + cellSize - t, y0 + cellSize - t, -1, -1);
      // 右上角读秒圈（剩余秒数）
      const cxs = x0 + cellSize - 11, cys = y0 + 11;
      ctx.fillStyle = this._hexToRgba(bossColor, 0.92);
      ctx.beginPath();
      ctx.arc(cxs, cys, Math.max(7, cellSize * 0.09), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14100b';
      ctx.font = '800 ' + Math.max(9, Math.round(cellSize * 0.15)) + 'px "Fira Code", "Cascadia Code", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.max(1, Math.ceil(remain / 1000))), cxs, cys + 0.5);
      ctx.restore();
    }
  }

  /**
   * CM4-R9：画 AI 占格上的玩家笔记（高对比：白字 + 黑描边）。
   * 独立于普通候选，确保在 Boss 底色上清晰可读。
   */
  _drawAICellNotes(ctx, cands, r, c, cellSize, padding) {
    const gridDim = this._gridSize <= 4 ? 2 : 3;
    const sub = cellSize / gridDim;
    const fs = Math.max(10, Math.round(sub * 0.6));
    const x0 = c * cellSize + padding;
    const y0 = r * cellSize + padding;
    ctx.save();
    ctx.font = '700 ' + fs + 'px "Fira Code", "Cascadia Code", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, Math.round(fs * 0.26));
    ctx.lineJoin = 'round';
    for (let i = 0; i < cands.length; i++) {
      const px = x0 + (i % gridDim) * sub + sub / 2;
      const py = y0 + Math.floor(i / gridDim) * sub + sub / 2;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(String(cands[i]), px, py);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(cands[i]), px, py);
    }
    ctx.restore();
  }

  /**
   * 绘制候选数笔记（格子内按 3x3 或 2x2 排列）
   * @private
   */
  _drawCandidates(ctx, candidates, r, c, cellSize, padding, labelWidth) {
    // 候选数排列维度：9x9 用 3x3，4x4 用 2x2
    const gridDim = this._gridSize <= 4 ? 2 : 3;
    const subCellSize = cellSize / gridDim;

    // Q5 可读性：笼标签避让改为 LogicWiz 式——
    // 有笼标签的格子，第 1 行候选数（1、2、3）与标签水平并排（标签在左，数字在右），
    // 第 2、3 行（4-9）保持正常 3 列布局。不再垂直压缩行高，保证字号一致。
    const hasCageLabel = labelWidth > 0;
    const labelW = labelWidth + 2; // 额外 2px 安全间距，避免文字与标签边缘紧贴
    const firstRowAvail = cellSize - labelW;  // 第 1 行剩余宽度
    const firstRowSubW = firstRowAvail / gridDim; // 第 1 行每个数字的可用宽度

    // 字号：候选数字号占子格宽度的 82%（原 72%），对齐 LogicWiz 视觉大小
    // 第 1 行如果因笼标签太挤会适当缩小，但有标签的格子字号以基准字号为准（整体放大）
    const baseFontSize = Math.max(11, Math.round(subCellSize * 0.82));
    const firstRowFontSize = hasCageLabel
      ? Math.max(10, Math.round(firstRowSubW * 0.82))
      : baseFontSize;
    const fontSize = hasCageLabel ? Math.min(baseFontSize, firstRowFontSize) : baseFontSize;

    // AI 笔记（Boss 思考时写的候选）：不再绘制到棋盘。玩家只知对手在"写笔记"，
    // 但看不到具体写了哪些数字、也分辨不出真/假笔记
    const cells = this._state ? this._state.cells : null;
    const isAiNote = !!(cells && cells[r] && cells[r][c] && cells[r][c]._aiNote);
    if (isAiNote) return;
    const noteColor = this.COLORS.candidateNum;

    // 格子边界（留出半个字宽/字高的安全边距，防止被裁剪）
    const halfChar = fontSize * 0.62;
    const cellX = c * cellSize + padding;
    const cellY = r * cellSize + padding;
    const minX = cellX + halfChar;
    const maxX = cellX + cellSize - halfChar;
    const minY = cellY + halfChar;
    const maxY = cellY + cellSize - halfChar;

    // Q#2：同数字高亮时，与匹配数字相同的"那一个笔记数字"用醒目紫色显示，
    // 其余笔记数字不受影响（仅当该数字正被同数字高亮时生效）
    const sameNum = (this._state && this._state.highlights && this._state.highlights.sameNumberNum) || null;
    const sameNumColor = this.COLORS.sameNoteHighlight || 'rgba(139, 58, 220, 1)'; // 紫 #8b3adc

    ctx.save();
    ctx.font = '600 ' + fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 按数字升序排列
    for (let i = 0; i < candidates.length; i++) {
      const num = candidates[i];
      const idx = num - 1; // 0-based
      const subR = Math.floor(idx / gridDim);
      const subC = idx % gridDim;

      let px, py;
      if (hasCageLabel && subR === 0) {
        // 第 1 行：从标签右侧开始，均分剩余宽度
        px = cellX + labelW + subC * firstRowSubW + firstRowSubW / 2;
      } else {
        // 第 2、3 行：正常 3 列布局
        px = cellX + subC * subCellSize + subCellSize / 2;
      }
      py = cellY + subR * subCellSize + subCellSize / 2;

      // 钳制在格子边界内，保证任何数字都完整显示
      px = Math.min(Math.max(px, minX), maxX);
      py = Math.min(Math.max(py, minY), maxY);
      // 笔记是玩家的私有工作区：对错由后台掌握，不在棋盘上做任何标记（如删除线/淡化）。
      // 保持笔记视觉纯净，玩家自主决定是否保留某条笔记。
      // 例外：Q#2 同数字高亮时，把与匹配数字相同的笔记数字单独染成醒目紫色，
      // 让玩家一眼看出"这条笔记对应的数字正被高亮"。
      ctx.fillStyle = (sameNum && num === sameNum) ? sameNumColor : noteColor;
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

  /**
   * 绝杀就绪：核心格金色脉动光环（玩家占满3据点后点亮）
   * 提示玩家"拖拽划过这些格即可连线处决"
   * @private
   */
  _drawLineReadyGlow(ctx, viz, cellSize, padding, now) {
    if (!viz.lineReady) return;
    const cores = viz.cores || [];
    if (!cores.length) return;
    const t = now / 1000;
    ctx.save();
    for (const core of cores) {
      const cx = core.c * cellSize + padding + cellSize / 2;
      const cy = core.r * cellSize + padding + cellSize / 2;
      const pulse = 0.4 + 0.3 * Math.sin(t * 3 + core.r * 1.7 + core.c * 2.3);
      const rad = cellSize * 0.55 + cellSize * 0.08 * Math.sin(t * 2.5 + core.r + core.c);
      // 外发光径向渐变光环
      const gradient = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
      gradient.addColorStop(0, 'rgba(255, 215, 0, ' + (0.25 * pulse).toFixed(3) + ')');
      gradient.addColorStop(0.5, 'rgba(218, 165, 32, ' + (0.12 * pulse).toFixed(3) + ')');
      gradient.addColorStop(1, 'rgba(218, 165, 32, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      // 金色脉动光晕边框
      ctx.strokeStyle = 'rgba(255, 215, 0, ' + (0.35 * pulse).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1.5, cellSize * 0.04);
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      // 核心光点（最亮层）
      ctx.fillStyle = 'rgba(255, 215, 0, ' + (0.15 * pulse).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * 拖拽划线进度：金色连线 + 进度指示
   * 玩家拖拽划过核心格时，实时绘制已触达的连接线
   * @private
   */
  _drawDragLine(ctx, viz, cellSize, padding, now) {
    const dragCores = viz.dragCores;
    if (!dragCores || !dragCores.length) return;
    const px = (c) => c * cellSize + padding + cellSize / 2;
    const py = (r) => r * cellSize + padding + cellSize / 2;
    const t = now / 1000;
    ctx.save();
    // ---- 连接线 ----
    if (dragCores.length >= 2) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const a = 0.55 + 0.35 * Math.abs(Math.sin(t * 3));
      ctx.strokeStyle = 'rgba(255, 215, 0, ' + a.toFixed(3) + ')';
      ctx.lineWidth = Math.max(3, cellSize * 0.08);
      ctx.setLineDash([cellSize * 0.1, cellSize * 0.06]);
      ctx.beginPath();
      ctx.moveTo(px(dragCores[0].c), py(dragCores[0].r));
      for (let i = 1; i < dragCores.length; i++) {
        ctx.lineTo(px(dragCores[i].c), py(dragCores[i].r));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // ---- 端点光点 ----
    for (let i = 0; i < dragCores.length; i++) {
      const dc = dragCores[i];
      const isLast = i === dragCores.length - 1;
      const bright = isLast ? 0.95 : 0.65;
      // 外光晕
      ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
      ctx.beginPath();
      ctx.arc(px(dc.c), py(dc.r), Math.max(4, cellSize * 0.12), 0, Math.PI * 2);
      ctx.fill();
      // 光点
      ctx.fillStyle = 'rgba(255, 215, 0, ' + bright.toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(px(dc.c), py(dc.r), Math.max(3, cellSize * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }
    // ---- 进度文字 ----
    const total = viz.cores ? viz.cores.length : 3;
    const progress = dragCores.length + '/' + total;
    ctx.font = 'bold ' + Math.max(10, cellSize * 0.22) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const last = dragCores[dragCores.length - 1];
    const lx = px(last.c);
    const ly = py(last.r) - cellSize * 0.45;
    const textA = 0.7 + 0.3 * Math.abs(Math.sin(t * 4));
    ctx.fillStyle = 'rgba(255, 215, 0, ' + textA.toFixed(2) + ')';
    ctx.fillText(progress, lx, ly);
    ctx.restore();
  }
}

export default BoardRenderer;