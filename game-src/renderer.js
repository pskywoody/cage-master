// ==========================================
// Canvas 渲染器 - 章节主题系统
// ==========================================

// ===== 6章主题配色 =====
const CHAPTER_THEMES = {
  // 第1章 加密来信 · 阿岩 - 温暖侦探事务所风格：米白底+暖棕线+翠绿强调
  1: {
    name: '加密来信',
    bgColor: '#fdfaf3',           // 温暖米白底
    gridLine: '#e8dcc8',          // 暖米色细线
    boxLine: '#8b6f47',           // 深棕宫线
    outerBorder: '#8b6f47',       // 深棕外框
    cageDash: '#a08060',          // 棕色笼虚线
    cageBadgeBg: '#22c55e',       // 翠绿和值徽章（阿岩色）
    cageBadgeText: '#ffffff',
    selectedBg: 'rgba(34,197,94,0.25)',   // 翠绿选中
    selectedBorder: '#16a34a',
    rowColHighlight: 'rgba(134,196,148,0.18)',
    cageHighlight: 'rgba(34,197,94,0.12)',
    sameNumHighlight: 'rgba(22,163,74,0.15)',
    fixedNum: '#5c4a2a',          // 深棕预填数
    playerNum: '#15803d',         // 深绿玩家数
    errorNum: '#dc2626',
    candidateNum: '#a09070',      // 暖灰候选
    hintBorder: '#ca8a04',
    hintBg: 'rgba(234,179,8,0.15)',
    candidateBorder: '#16a34a',
    candidateText: '#16a34a',
    playerOwned: 'rgba(22,163,74,0.18)',
    highlight45: 'rgba(134,196,148,0.35)',
    hintNumColor: '#ca8a04',
    accent: '#22c55e',
    accentDark: '#15803d',
    accentLight: '#bbf7d0',
    bgPage: '#f5f0e6',            // 页面背景暖米色
    numPadBg: '#ecfdf5',          // 浅绿数字键
    numPadText: '#15803d',
    numPadDoneBg: '#e8dcc8',
    numPadDoneText: '#a09070',
    toolBarBg: '#fef9f0',
    toolBarText: '#8b6f47',
    // 迷雾主题色（对战用）
    fogColor: 'rgba(20,30,15,',   // 暗绿迷雾
    fogTexColor: 'rgba(80,100,60,',
  },

  // 第2章 双重线索 · 守笼人 - 古典档案馆风格：象牙白+靛蓝线+靛蓝强调
  2: {
    name: '双重线索',
    bgColor: '#f8faff',           // 象牙白底
    gridLine: '#d4ddf0',          // 浅蓝灰细线
    boxLine: '#3b4a8a',           // 靛蓝宫线
    outerBorder: '#3b4a8a',
    cageDash: '#5b6abf',          // 靛蓝笼虚线
    cageBadgeBg: '#6366f1',       // 靛蓝和值徽章（守笼人色）
    cageBadgeText: '#ffffff',
    selectedBg: 'rgba(99,102,241,0.22)',
    selectedBorder: '#4f46e5',
    rowColHighlight: 'rgba(165,180,252,0.2)',
    cageHighlight: 'rgba(99,102,241,0.12)',
    sameNumHighlight: 'rgba(79,70,229,0.15)',
    fixedNum: '#2a3560',          // 深蓝灰预填
    playerNum: '#4338ca',         // 靛蓝玩家数
    errorNum: '#dc2626',
    candidateNum: '#94a3d0',
    hintBorder: '#d97706',
    hintBg: 'rgba(217,119,6,0.15)',
    candidateBorder: '#8b5cf6',
    candidateText: '#8b5cf6',
    playerOwned: 'rgba(79,70,229,0.18)',
    highlight45: 'rgba(165,180,252,0.35)',
    hintNumColor: '#d97706',
    accent: '#6366f1',
    accentDark: '#4338ca',
    accentLight: '#c7d2fe',
    bgPage: '#eef2ff',
    numPadBg: '#eef2ff',
    numPadText: '#4338ca',
    numPadDoneBg: '#d4ddf0',
    numPadDoneText: '#94a3d0',
    toolBarBg: '#f5f7ff',
    toolBarText: '#3b4a8a',
    fogColor: 'rgba(15,20,50,',
    fogTexColor: 'rgba(60,80,140,',
  },

  // 第3章 谜案追踪 · 设局人残影 - 阴森迷雾风格：暗灰底+暗红+血红强调
  3: {
    name: '谜案追踪',
    bgColor: '#1a1a1f',           // 暗灰底（阴森）
    gridLine: '#2d2d3a',          // 暗灰细线
    boxLine: '#5a2020',           // 暗红宫线
    outerBorder: '#7f1d1d',       // 深红边框
    cageDash: '#8b3030',          // 暗红笼虚线
    cageBadgeBg: '#ef4444',       // 血红和值徽章
    cageBadgeText: '#ffffff',
    selectedBg: 'rgba(239,68,68,0.25)',
    selectedBorder: '#dc2626',
    rowColHighlight: 'rgba(120,40,40,0.25)',
    cageHighlight: 'rgba(239,68,68,0.1)',
    sameNumHighlight: 'rgba(220,38,38,0.15)',
    fixedNum: '#c9b8b8',          // 灰白预填（暗色背景要亮）
    playerNum: '#f87171',         // 亮红玩家数
    errorNum: '#fbbf24',          // 金色错误（暗底上红配红看不清）
    candidateNum: '#6b6070',      // 暗紫灰候选
    hintBorder: '#fbbf24',
    hintBg: 'rgba(251,191,36,0.12)',
    candidateBorder: '#f97316',
    candidateText: '#f97316',
    playerOwned: 'rgba(220,38,38,0.2)',
    highlight45: 'rgba(239,68,68,0.2)',
    hintNumColor: '#fbbf24',
    accent: '#ef4444',
    accentDark: '#b91c1c',
    accentLight: '#fecaca',
    bgPage: '#15151a',
    numPadBg: '#2a1a1a',
    numPadText: '#f87171',
    numPadDoneBg: '#2d2d3a',
    numPadDoneText: '#5a5060',
    toolBarBg: '#252028',
    toolBarText: '#c9b8b8',
    fogColor: 'rgba(30,5,5,',     // 血红迷雾
    fogTexColor: 'rgba(100,20,20,',
  },

  // 第4章 密码破译 · 残局守护者 - 古老羊皮纸风格：羊皮黄+深棕+琥珀金强调
  4: {
    name: '密码破译',
    bgColor: '#f5ecd7',           // 羊皮纸黄底
    gridLine: '#d4c4a0',          // 浅棕细线
    boxLine: '#7a5c30',           // 深棕宫线
    outerBorder: '#7a5c30',
    cageDash: '#9a7a48',          // 棕色笼虚线
    cageBadgeBg: '#d97706',       // 琥珀金和值徽章（守护者色）
    cageBadgeText: '#fffbeb',
    selectedBg: 'rgba(217,119,6,0.22)',
    selectedBorder: '#b45309',
    rowColHighlight: 'rgba(180,140,60,0.18)',
    cageHighlight: 'rgba(217,119,6,0.1)',
    sameNumHighlight: 'rgba(180,83,9,0.15)',
    fixedNum: '#5c4020',          // 深棕预填
    playerNum: '#92400e',         // 深琥珀玩家数
    errorNum: '#dc2626',
    candidateNum: '#a89060',
    hintBorder: '#7c3aed',
    hintBg: 'rgba(124,58,237,0.12)',
    candidateBorder: '#b45309',
    candidateText: '#b45309',
    playerOwned: 'rgba(180,83,9,0.18)',
    highlight45: 'rgba(217,119,6,0.25)',
    hintNumColor: '#7c3aed',
    accent: '#d97706',
    accentDark: '#92400e',
    accentLight: '#fde68a',
    bgPage: '#ede0c4',
    numPadBg: '#fef3c7',
    numPadText: '#92400e',
    numPadDoneBg: '#d4c4a0',
    numPadDoneText: '#a89060',
    toolBarBg: '#faf3e0',
    toolBarText: '#7a5c30',
    fogColor: 'rgba(40,25,10,',   // 棕褐迷雾
    fogTexColor: 'rgba(120,80,30,',
  },

  // 第5章 终极考验 · 星辰梭 - 机械科幻风格：深紫黑+银紫+紫晶强调
  5: {
    name: '终极考验',
    bgColor: '#1a1530',           // 深紫黑底
    gridLine: '#2d2550',          // 暗紫细线
    boxLine: '#6d28d9',           // 紫色宫线
    outerBorder: '#7c3aed',       // 亮紫边框
    cageDash: '#7c3aed',          // 紫色笼虚线
    cageBadgeBg: '#a855f7',       // 紫晶和值徽章（星辰梭色）
    cageBadgeText: '#ffffff',
    selectedBg: 'rgba(168,85,247,0.25)',
    selectedBorder: '#9333ea',
    rowColHighlight: 'rgba(124,58,237,0.2)',
    cageHighlight: 'rgba(168,85,247,0.1)',
    sameNumHighlight: 'rgba(147,51,234,0.15)',
    fixedNum: '#c4b5fd',          // 淡紫预填（暗底要亮）
    playerNum: '#c084fc',         // 亮紫玩家数
    errorNum: '#fbbf24',          // 金色错误
    candidateNum: '#6b5b8a',
    hintBorder: '#22d3ee',
    hintBg: 'rgba(34,211,238,0.12)',
    candidateBorder: '#06b6d4',
    candidateText: '#22d3ee',
    playerOwned: 'rgba(147,51,234,0.22)',
    highlight45: 'rgba(168,85,247,0.2)',
    hintNumColor: '#22d3ee',
    accent: '#a855f7',
    accentDark: '#7e22ce',
    accentLight: '#e9d5ff',
    bgPage: '#120f25',
    numPadBg: '#2a1f4a',
    numPadText: '#c084fc',
    numPadDoneBg: '#2d2550',
    numPadDoneText: '#6b5b8a',
    toolBarBg: '#201a3a',
    toolBarText: '#c4b5fd',
    fogColor: 'rgba(20,10,40,',   // 深紫迷雾
    fogTexColor: 'rgba(80,50,140,',
  },

  // 第6章 大师之路 · 设局人本体 - 终局决战风格：黑金底+赤金+深红
  6: {
    name: '大师之路',
    bgColor: '#0d0d0d',           // 纯黑底
    gridLine: '#2a2010',          // 暗金细线
    boxLine: '#92400e',           // 深赤宫线
    outerBorder: '#b45309',       // 赤金边框
    cageDash: '#a16207',          // 金色笼虚线
    cageBadgeBg: '#dc2626',       // 深红和值徽章（设局人色）
    cageBadgeText: '#fef3c7',
    selectedBg: 'rgba(220,38,38,0.3)',
    selectedBorder: '#fbbf24',    // 金色选中边框！
    rowColHighlight: 'rgba(185,28,28,0.2)',
    cageHighlight: 'rgba(251,191,36,0.1)',
    sameNumHighlight: 'rgba(220,38,38,0.18)',
    fixedNum: '#d4a850',          // 暗金预填（黑底要亮）
    playerNum: '#f87171',         // 亮红玩家数
    errorNum: '#60a5fa',          // 蓝色错误（红黑底上需对比）
    candidateNum: '#5a4a30',
    hintBorder: '#fbbf24',
    hintBg: 'rgba(251,191,36,0.15)',
    candidateBorder: '#dc2626',
    candidateText: '#fbbf24',
    playerOwned: 'rgba(220,38,38,0.25)',
    highlight45: 'rgba(251,191,36,0.2)',
    hintNumColor: '#fbbf24',
    accent: '#dc2626',
    accentDark: '#991b1b',
    accentLight: '#fecaca',
    accentGold: '#fbbf24',       // 特殊金色accent
    bgPage: '#080808',
    numPadBg: '#1a1008',
    numPadText: '#f87171',
    numPadDoneBg: '#2a2010',
    numPadDoneText: '#5a4a30',
    toolBarBg: '#150f0a',
    toolBarText: '#d4a850',
    fogColor: 'rgba(30,5,5,',
    fogTexColor: 'rgba(100,20,20,',
  },
};

// 默认主题（第1章）
const DEFAULT_THEME = CHAPTER_THEMES[1];

class Renderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.cellSize = 60;
    this.padding = 12;
    this.themeId = 1;
    this.theme = DEFAULT_THEME;
  }

  /**
   * 设置章节主题
   */
  setTheme(chapterId) {
    const id = parseInt(chapterId) || 1;
    this.themeId = id;
    this.theme = CHAPTER_THEMES[id] || DEFAULT_THEME;
    // 同时更新CSS变量
    this._applyThemeCSS();
  }

  /**
   * 将主题色应用到CSS变量（影响数字键盘、UI等）
   */
  _applyThemeCSS() {
    const t = this.theme;
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty('--theme-accent', t.accent);
    root.style.setProperty('--theme-accent-dark', t.accentDark);
    root.style.setProperty('--theme-accent-light', t.accentLight);
    root.style.setProperty('--theme-bg', t.bgPage);
    root.style.setProperty('--theme-board-bg', t.bgColor);
    root.style.setProperty('--theme-num-pad-bg', t.numPadBg);
    root.style.setProperty('--theme-num-pad-text', t.numPadText);
    root.style.setProperty('--theme-num-pad-done-bg', t.numPadDoneBg);
    root.style.setProperty('--theme-num-pad-done-text', t.numPadDoneText);
    // 计算按下态（mix accent with bg）
    root.style.setProperty('--theme-num-pad-active', t.accentLight);
    root.style.setProperty('--theme-toolbar-bg', t.toolBarBg);
    root.style.setProperty('--theme-toolbar-text', t.toolBarText);
    root.style.setProperty('--theme-candidate', t.candidateText);
    root.style.setProperty('--theme-player-num', t.playerNum);
    root.style.setProperty('--theme-fixed-num', t.fixedNum);
    root.style.setProperty('--theme-header-text', t.toolBarText);
    root.style.setProperty('--theme-header-bg', t.toolBarBg);
  }

  /**
   * 根据棋盘尺寸和容器宽度计算合适的 cellSize
   */
  recalcCellSize(board) {
    const cssWidth = this.canvas.clientWidth || 400;
    const size = board.size;
    const availableWidth = cssWidth - this.padding * 2;
    this.cellSize = Math.floor(availableWidth / size);
    if (this.cellSize < 30) this.cellSize = 30;
  }

  getBoxSize(size) {
    if (size === 4) return { boxW: 2, boxH: 2 };
    if (size === 6) return { boxW: 3, boxH: 2 };
    return { boxW: 3, boxH: 3 };
  }

  /**
   * 主渲染入口
   */
  render(board) {
    this.recalcCellSize(board);

    const { ctx, cellSize, padding, theme } = this;
    const size = board.size;
    const canvasSize = size * cellSize + padding * 2;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = canvasSize * dpr;
    this.canvas.height = canvasSize * dpr;
    this.canvas.style.width = canvasSize + 'px';
    this.canvas.style.height = canvasSize + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // 主题背景色
    ctx.fillStyle = theme.bgColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    ctx.save();
    ctx.translate(padding, padding);

    this._drawInnerGrid(size);
    this._drawInnerBoxLines(size);
    this._drawRoundOuterBorder(size, board);
    this._drawCages(board);
    this._drawHighlightMask(board);
    this._drawRowColBoxHighlight(board);
    this._drawCageHighlight(board);
    this._drawSameNumberHighlight(board);
    this._drawSelectedCell(board);
    this._drawHintHighlight(board);
    this._drawBattlePlayerOwned(board);
    this._drawNumbers(board);
    this._drawCandidates(board);
    this._drawHintNumber(board);

    ctx.restore();
  }

  // ---------- 1. 内部网格细线 ----------
  _drawInnerGrid(size) {
    const { ctx, cellSize, theme } = this;
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;

    for (let i = 1; i < size; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, size * cellSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(size * cellSize, i * cellSize);
      ctx.stroke();
    }
  }

  // ---------- 2. 内部粗宫线 ----------
  _drawInnerBoxLines(size) {
    const { ctx, cellSize, theme } = this;
    ctx.strokeStyle = theme.boxLine;
    ctx.lineWidth = 2;

    let boxW = 3, boxH = 3;
    if (size === 6) { boxW = 3; boxH = 2; }
    if (size === 4) { boxW = 2; boxH = 2; }

    for (let i = boxW; i < size; i += boxW) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, size * cellSize);
      ctx.stroke();
    }
    for (let i = boxH; i < size; i += boxH) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(size * cellSize, i * cellSize);
      ctx.stroke();
    }
  }

  // ---------- 3. 圆角外边框 ----------
  _drawRoundOuterBorder(size, board) {
    const { ctx, cellSize, theme } = this;
    const w = size * cellSize;
    const h = size * cellSize;
    const radius = 8;

    const isCandidate = board && board.inputMode === 'candidate';
    ctx.strokeStyle = isCandidate ? theme.candidateBorder : theme.outerBorder;
    ctx.lineWidth = isCandidate ? 3.5 : 2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.stroke();

    if (isCandidate) {
      ctx.fillStyle = theme.candidateText;
      ctx.font = `bold ${Math.max(10, Math.floor(cellSize * 0.22))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('✏️候选', 4, 4);
    }
  }

  // ---------- 4. 笼子渲染 ----------
  _drawCages(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const battle = this._battleActive ? this._battleCtx : null;
    ctx.strokeStyle = theme.cageDash;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 3]);

    board.cages.forEach(cage => {
      const cellSet = new Set(cage.cells.map(([r, c]) => `${r},${c}`));

      let minR = size, minC = size;
      cage.cells.forEach(([r, c]) => {
        if (r < minR) { minR = r; minC = c; }
        else if (r === minR && c < minC) { minC = c; }
      });

      const isVisible = (r, c) => {
        if (!battle || !battle.active) return true;
        if (!battle.fogLevel || !battle.fogLevel[r] || battle.fogLevel[r][c] == null) return true;
        return battle.fogLevel[r][c] < 0.4;
      };

      const isSumVisible = (r, c) => {
        if (!battle || !battle.active) return true;
        if (!battle.fogLevel || !battle.fogLevel[r] || battle.fogLevel[r][c] == null) return true;
        return battle.fogLevel[r][c] < 0.1;
      };

      const anyVisible = cage.cells.some(([r, c]) => isVisible(r, c));
      if (!anyVisible) return;

      cage.cells.forEach(([r, c]) => {
        if (!isVisible(r, c)) return;
        const x = c * cellSize;
        const y = r * cellSize;

        if (!cellSet.has(`${r - 1},${c}`) && r !== 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + cellSize, y);
          ctx.stroke();
        }
        if (!cellSet.has(`${r + 1},${c}`) && r !== size - 1) {
          ctx.beginPath();
          ctx.moveTo(x, y + cellSize);
          ctx.lineTo(x + cellSize, y + cellSize);
          ctx.stroke();
        }
        if (!cellSet.has(`${r},${c - 1}`) && c !== 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + cellSize);
          ctx.stroke();
        }
        if (!cellSet.has(`${r},${c + 1}`) && c !== size - 1) {
          ctx.beginPath();
            ctx.moveTo(x + cellSize, y);
            ctx.lineTo(x + cellSize, y + cellSize);
            ctx.stroke();
        }
      });

      if (isSumVisible(minR, minC)) {
        ctx.setLineDash([]);
        const sumFontSize = Math.max(8, Math.floor(cellSize * 0.16));
        ctx.font = `bold ${sumFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const sumText = String(cage.sum);
        const textWidth = ctx.measureText(sumText).width;
        const badgePadding = Math.max(3, Math.floor(cellSize * 0.04));
        const badgeW = textWidth + badgePadding * 2;
        const badgeH = sumFontSize + badgePadding * 2 - 2;
        const badgeX = minC * cellSize + 2;
        const badgeY = minR * cellSize + 2;
        const badgeR = Math.min(badgeH / 2, 4);

        // 主题色和值徽章
        ctx.fillStyle = theme.cageBadgeBg;
        ctx.beginPath();
        const bx = badgeX;
        const by = badgeY;
        ctx.moveTo(bx + badgeR, by);
        ctx.lineTo(bx + badgeW - badgeR, by);
        ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + badgeR);
        ctx.lineTo(bx + badgeW, by + badgeH - badgeR);
        ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - badgeR, by + badgeH);
        ctx.lineTo(bx + badgeR, by + badgeH);
        ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - badgeR);
        ctx.lineTo(bx, by + badgeR);
        ctx.quadraticCurveTo(bx, by, bx + badgeR, by);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = theme.cageBadgeText;
        ctx.fillText(sumText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);
        ctx.setLineDash([5, 3]);
      }
    });

    ctx.setLineDash([]);
  }

  // ---------- 5. 高亮蒙版 ----------
  _drawHighlightMask(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isHighlightMask) {
          // 解析主题highlight45颜色（可能是rgba或纯色）
          ctx.fillStyle = theme.highlight45;
          // 如果是半透明色需要用opacity
          if (theme.highlight45.startsWith('rgba')) {
            ctx.fillStyle = theme.highlight45.replace(/[\d.]+\)$/, `${cell.highlightOpacity})`);
          } else {
            ctx.globalAlpha = cell.highlightOpacity;
          }
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // ---------- 6. 同行列宫高亮 ----------
  _drawRowColBoxHighlight(board) {
    const cells = board.getRowColBoxHighlightCells();
    if (cells.length === 0) return;
    const { ctx, cellSize, theme } = this;

    ctx.fillStyle = theme.rowColHighlight;
    for (const { r, c } of cells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  // ---------- 7. 同笼高亮 ----------
  _drawCageHighlight(board) {
    const cells = board.getSameCageHighlightCells();
    if (cells.length === 0) return;
    const { ctx, cellSize, theme } = this;

    ctx.fillStyle = theme.cageHighlight;
    for (const { r, c } of cells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  // ---------- 8. 同数字高亮 ----------
  _drawSameNumberHighlight(board) {
    const cells = board.getSameNumberHighlightCells();
    if (cells.length === 0) return;
    const { ctx, cellSize, theme } = this;

    ctx.fillStyle = theme.sameNumHighlight;
    for (const { r, c } of cells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  // ---------- 9. 选中格高亮 ----------
  _drawSelectedCell(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    let hasSelection = false;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isSelected) {
          hasSelection = true;
          ctx.fillStyle = theme.selectedBg;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }

    if (!hasSelection) return;

    ctx.strokeStyle = theme.selectedBorder;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isSelected) {
          ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
        }
      }
    }
  }

  // ---------- 10. 数字渲染 ----------
  _drawNumbers(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    const fontSize = Math.floor(cellSize * 0.45);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        const num = cell.fixedNum || cell.fillNum;
        if (!num) continue;

        ctx.font = cell.fixedNum ? `bold ${fontSize}px sans-serif` : `${fontSize}px sans-serif`;
        ctx.globalAlpha = 1;
        if (cell.isError && board.settings.conflictRed) {
          ctx.fillStyle = theme.errorNum;
        } else if (cell.fixedNum) {
          ctx.fillStyle = theme.fixedNum;
        } else {
          ctx.fillStyle = theme.playerNum;
        }
        ctx.fillText(num, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------- 12. 候选数渲染 ----------
  _drawCandidates(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const { boxW, boxH } = this.getBoxSize(size);

    const subW = cellSize / boxW;
    const subH = cellSize / boxH;

    const fontSize = Math.max(8, Math.floor(cellSize * 0.18));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fontSize + 'px sans-serif';
    ctx.fillStyle = theme.candidateNum;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.fixedNum || cell.fillNum) continue;
        if (cell.candidates.size === 0) continue;

        cell.candidates.forEach(num => {
          const subR = Math.floor((num - 1) / boxW);
          const subC = (num - 1) % boxW;
          const x = c * cellSize + subC * subW + subW / 2;
          const y = r * cellSize + subR * subH + subH / 2;
          ctx.fillText(num, x, y);
        });
      }
    }
  }

  // ---------- 10. 提示格子高亮 ----------
  _drawHintHighlight(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isHintCell) {
          ctx.strokeStyle = theme.hintBorder;
          ctx.lineWidth = 3;
          ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);

          ctx.fillStyle = theme.hintBg;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // ---------- 10.5 Boss战：玩家归属底色 ----------
  _drawBattlePlayerOwned(board) {
    if (!this._battleActive || !this._battleCtx) return;
    const battle = this._battleCtx;
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (battle.fixedMask && battle.fixedMask[r][c]) continue;
        if (battle.playerOwned && battle.playerOwned[r][c] > 0) {
          ctx.fillStyle = theme.playerOwned;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // ---------- 13. 提示数字角标 ----------
  _drawHintNumber(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = theme.hintNumColor;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isHintCell && cell.hintNumber !== null) {
          ctx.fillText(
            '?' + cell.hintNumber,
            (c + 1) * cellSize - 3,
            r * cellSize + 2
          );
        }
      }
    }
  }
}
