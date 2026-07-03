// ==========================================
// Canvas 渲染器 - 章节主题系统
// ==========================================

// ===== 章节主题配色 =====
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
    bgColor: '#1e1b24',           // 深紫灰底（阴森但不刺眼）
    gridLine: '#353040',          // 暗紫灰细线
    boxLine: '#4a3d52',           // 暗紫红宫线
    outerBorder: '#6d4c7a',       // 紫红边框
    cageDash: '#7c5a88',          // 紫红笼虚线
    cageBadgeBg: '#8b5cf6',       // 紫罗兰和值徽章
    cageBadgeText: '#ffffff',
    selectedBg: 'rgba(139,92,246,0.25)',
    selectedBorder: '#a78bfa',
    rowColHighlight: 'rgba(109,76,122,0.25)',
    cageHighlight: 'rgba(139,92,246,0.1)',
    sameNumHighlight: 'rgba(167,139,250,0.15)',
    fixedNum: '#c4b5d0',          // 淡紫灰预填
    playerNum: '#c4b5fd',         // 淡紫玩家数
    errorNum: '#fbbf24',          // 金色错误
    candidateNum: '#6b5e7a',      // 暗紫灰候选
    hintBorder: '#fbbf24',
    hintBg: 'rgba(251,191,36,0.12)',
    candidateBorder: '#a78bfa',
    candidateText: '#c4b5fd',
    playerOwned: 'rgba(139,92,246,0.2)',
    highlight45: 'rgba(167,139,250,0.2)',
    hintNumColor: '#fbbf24',
    accent: '#8b5cf6',
    accentDark: '#6d28d9',
    accentLight: '#ddd6fe',
    bgPage: '#17141c',
    numPadBg: '#2a2432',
    numPadText: '#c4b5fd',
    numPadDoneBg: '#353040',
    numPadDoneText: '#5a5068',
    toolBarBg: '#231f2a',
    toolBarText: '#c4b5d0',
    fogColor: 'rgba(40,20,60,',     // 紫雾
    fogTexColor: 'rgba(100,80,140,',
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

  // 第6章 大师之路 · 设局人本体 - 终局决战风格：深黑金底+赤金+暗橙红
  6: {
    name: '大师之路',
    bgColor: '#14110f',           // 深褐黑底（比纯黑柔和）
    gridLine: '#2a2318',          // 暗金细线
    boxLine: '#92400e',           // 深赤宫线
    outerBorder: '#b45309',       // 赤金边框
    cageDash: '#a16207',          // 金色笼虚线
    cageBadgeBg: '#b45309',       // 暗橙红和值徽章（降低红色饱和度）
    cageBadgeText: '#fef3c7',
    selectedBg: 'rgba(180,83,9,0.3)',
    selectedBorder: '#fbbf24',    // 金色选中边框
    rowColHighlight: 'rgba(146,64,14,0.2)',
    cageHighlight: 'rgba(251,191,36,0.1)',
    sameNumHighlight: 'rgba(180,83,9,0.18)',
    fixedNum: '#d4a850',          // 暗金预填
    playerNum: '#fbbf24',         // 金色玩家数（红改金，更和谐）
    errorNum: '#60a5fa',          // 蓝色错误
    candidateNum: '#5a4a30',
    hintBorder: '#fbbf24',
    hintBg: 'rgba(251,191,36,0.15)',
    candidateBorder: '#b45309',
    candidateText: '#fbbf24',
    playerOwned: 'rgba(180,83,9,0.25)',
    highlight45: 'rgba(251,191,36,0.2)',
    hintNumColor: '#fbbf24',
    accent: '#b45309',
    accentDark: '#78350f',
    accentLight: '#fef3c7',
    accentGold: '#fbbf24',
    bgPage: '#0c0a08',
    numPadBg: '#1a140c',
    numPadText: '#fbbf24',
    numPadDoneBg: '#2a2318',
    numPadDoneText: '#5a4a30',
    toolBarBg: '#15110c',
    toolBarText: '#d4a850',
    fogColor: 'rgba(40,20,5,',
    fogTexColor: 'rgba(160,100,30,',
  },

  // ===== 第7章 秘术档案 · 设局人秘术 — 星辰秘术风格：深紫黑底+秘银紫+幻彩强调 =====
  7: {
    name: '秘术档案',
    bgColor: '#0f0a1a',           // 深紫黑底
    gridLine: '#2a1f4a',          // 暗紫细线
    boxLine: '#7c3aed',           // 紫色宫线
    outerBorder: '#a855f7',       // 亮紫边框
    cageDash: '#8b5cf6',          // 紫色笼虚线
    cageBadgeBg: '#a855f7',       // 紫晶和值徽章
    cageBadgeText: '#ffffff',
    selectedBg: 'rgba(168,85,247,0.28)',
    selectedBorder: '#c084fc',
    rowColHighlight: 'rgba(147,51,234,0.2)',
    cageHighlight: 'rgba(168,85,247,0.12)',
    sameNumHighlight: 'rgba(192,132,252,0.18)',
    fixedNum: '#d8b4fe',          // 淡紫预填
    playerNum: '#e9d5ff',         // 亮紫玩家数
    errorNum: '#fbbf24',          // 金色错误
    candidateNum: '#6b5b8a',
    hintBorder: '#22d3ee',
    hintBg: 'rgba(34,211,238,0.12)',
    candidateBorder: '#a855f7',
    candidateText: '#c084fc',
    playerOwned: 'rgba(168,85,247,0.25)',
    highlight45: 'rgba(192,132,252,0.25)',
    hintNumColor: '#22d3ee',
    accent: '#a855f7',
    accentDark: '#7e22ce',
    accentLight: '#e9d5ff',
    bgPage: '#0a0615',
    numPadBg: '#1f1035',
    numPadText: '#e9d5ff',
    numPadDoneBg: '#2a1f4a',
    numPadDoneText: '#6b5b8a',
    toolBarBg: '#150d25',
    toolBarText: '#d8b4fe',
    fogColor: 'rgba(20,5,35,',    // 秘术紫雾
    fogTexColor: 'rgba(90,40,140,',
  },
};

// 默认主题（第1章）
const DEFAULT_THEME = CHAPTER_THEMES[1];

// 章节背景图映射
const CHAPTER_BG_IMAGES = {
  1: 'assets/images/bg/bg_chapter_1.jpg',
  2: 'assets/images/bg/bg_chapter_2.jpg',
  3: 'assets/images/bg/bg_chapter_3.jpg',
  4: 'assets/images/bg/bg_chapter_4.jpg',
  5: 'assets/images/bg/bg_chapter_5.jpg',
  6: 'assets/images/bg/bg_chapter_6.jpg',
  7: 'assets/images/bg/bg_chapter_7.jpg',
};

// 预加载背景图
const bgImageCache = {};
function preloadBgImages() {
  Object.entries(CHAPTER_BG_IMAGES).forEach(([ch, src]) => {
    const img = new Image();
    img.src = src;
    bgImageCache[ch] = img;
  });
}
preloadBgImages();

class Renderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.cellSize = 60;
    this.padding = 12;
    this.themeId = 1;
    this.theme = DEFAULT_THEME;
    // 尺寸缓存（避免每帧重置canvas尺寸）
    this._canvasSize = 0;
    this._dpr = 0;
    this._lastSize = 0;
    // 离屏缓存层
    this._staticCache = null;       // 背景+网格+宫线+外边框
    this._staticCacheKey = '';      // 缓存key：themeId+canvasSize+dpr
    this._boardCache = null;        // 笼子+预填数
    this._boardCacheKey = '';       // 缓存key：levelId+themeId+canvasSize+dpr
    this._currentLevelId = null;    // 当前关卡ID
  }

  /**
   * 更新Canvas尺寸（仅在尺寸/DPR变化时调用）
   */
  _updateCanvasSize(canvasSize) {
    const dpr = window.devicePixelRatio || 1;
    if (canvasSize === this._lastSize && dpr === this._dpr) return false;
    this._lastSize = canvasSize;
    this._dpr = dpr;
    this.canvas.width = canvasSize * dpr;
    this.canvas.height = canvasSize * dpr;
    this.canvas.style.width = canvasSize + 'px';
    this.canvas.style.height = canvasSize + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 尺寸变化，缓存失效
    this._staticCacheKey = '';
    this._boardCacheKey = '';
    return true;
  }

  /**
   * 创建或获取离屏Canvas
   */
  _getOffscreenCanvas(cacheProp, width, height) {
    if (!this[cacheProp]) {
      this[cacheProp] = document.createElement('canvas');
    }
    const canvas = this[cacheProp];
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }

  /**
   * 绘制静态缓存层（背景+网格+宫线+外边框）
   */
  _drawStaticCache(board, canvasSize) {
    const cache = this._getOffscreenCanvas('_staticCache', canvasSize * this._dpr, canvasSize * this._dpr);
    const ctx = cache.getContext('2d');
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const { cellSize, padding, theme } = this;
    const size = board.size;

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // 章节背景图（如果已加载）
    const bgImg = bgImageCache[this.themeId];
    if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.save();
      const imgRatio = bgImg.naturalWidth / bgImg.naturalHeight;
      const canvasRatio = canvasSize / canvasSize;
      let sx, sy, sw, sh;
      if (imgRatio > canvasRatio) {
        sh = bgImg.naturalHeight;
        sw = sh * canvasRatio;
        sx = (bgImg.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        sw = bgImg.naturalWidth;
        sh = sw / canvasRatio;
        sx = 0;
        sy = (bgImg.naturalHeight - sh) / 2;
      }
      ctx.globalAlpha = theme.isDark ? 0.35 : 0.5;
      ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, canvasSize, canvasSize);
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.bgColor;
      ctx.globalAlpha = theme.isDark ? 0.7 : 0.55;
      ctx.fillRect(0, 0, canvasSize, canvasSize);
      ctx.globalAlpha = 1;
      ctx.restore();
    } else {
      ctx.fillStyle = theme.bgColor;
      ctx.fillRect(0, 0, canvasSize, canvasSize);
    }

    ctx.save();
    ctx.translate(padding, padding);

    // 网格
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

    // 宫线
    const { boxW, boxH } = this.getBoxSize(size);
    ctx.strokeStyle = theme.boxLine;
    ctx.lineWidth = 2;
    for (let i = 1; i < size / boxW; i++) {
      ctx.beginPath();
      ctx.moveTo(i * boxW * cellSize, 0);
      ctx.lineTo(i * boxW * cellSize, size * cellSize);
      ctx.stroke();
    }
    for (let i = 1; i < size / boxH; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * boxH * cellSize);
      ctx.lineTo(size * cellSize, i * boxH * cellSize);
      ctx.stroke();
    }

    // 外边框
    ctx.strokeStyle = theme.outerBorder;
    ctx.lineWidth = 3;
    const r = Math.min(cellSize * 0.15, 10);
    const w = size * cellSize;
    const h = size * cellSize;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();

    this._staticCacheKey = `${this.themeId}-${canvasSize}-${this._dpr}`;
  }

  /**
   * 绘制盘面缓存层（笼子+预填数）
   */
  _drawBoardCache(board, canvasSize) {
    const cache = this._getOffscreenCanvas('_boardCache', canvasSize * this._dpr, canvasSize * this._dpr);
    const ctx = cache.getContext('2d');
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const { cellSize, padding, theme } = this;
    const size = board.size;

    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.save();
    ctx.translate(padding, padding);

    // 笼子
    if (board.cages && board.cages.length > 0) {
      const sumFontSize = Math.max(9, Math.floor(cellSize * 0.22));
      ctx.font = `bold ${sumFontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.strokeStyle = theme.cageBorder;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);

      board.cages.forEach(cage => {
        const cellSet = new Set(cage.cells.map(([r, c]) => `${r},${c}`));
        const sumText = String(cage.sum);
        const textWidth = ctx.measureText(sumText).width;
        const badgeW = textWidth + 8;
        const badgeH = Math.max(14, sumFontSize + 4);

        cage.cells.forEach(([r, c]) => {
          const x = c * cellSize;
          const y = r * cellSize;
          // 顶边
          if (!cellSet.has(`${r - 1},${c}`)) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + cellSize, y);
            ctx.stroke();
          }
          // 底边
          if (!cellSet.has(`${r + 1},${c}`)) {
            ctx.beginPath();
            ctx.moveTo(x, y + cellSize);
            ctx.lineTo(x + cellSize, y + cellSize);
            ctx.stroke();
          }
          // 左边
          if (!cellSet.has(`${r},${c - 1}`)) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + cellSize);
            ctx.stroke();
          }
          // 右边
          if (!cellSet.has(`${r},${c + 1}`)) {
            ctx.beginPath();
            ctx.moveTo(x + cellSize, y);
            ctx.lineTo(x + cellSize, y + cellSize);
            ctx.stroke();
          }
        });

        // 和值徽章
        const [tr, tc] = cage.cells[0];
        const tx = tc * cellSize + 3;
        const ty = tr * cellSize + 2;
        ctx.setLineDash([]);
        ctx.fillStyle = theme.cageBadgeBg || 'rgba(255,255,255,0.85)';
        const br = 4;
        ctx.beginPath();
        ctx.moveTo(tx + br, ty);
        ctx.lineTo(tx + badgeW - br, ty);
        ctx.quadraticCurveTo(tx + badgeW, ty, tx + badgeW, ty + br);
        ctx.lineTo(tx + badgeW, ty + badgeH - br);
        ctx.quadraticCurveTo(tx + badgeW, ty + badgeH, tx + badgeW - br, ty + badgeH);
        ctx.lineTo(tx + br, ty + badgeH);
        ctx.quadraticCurveTo(tx, ty + badgeH, tx, ty + badgeH - br);
        ctx.lineTo(tx, ty + br);
        ctx.quadraticCurveTo(tx, ty, tx + br, ty);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = theme.cageSumText || theme.fixedNum;
        ctx.fillText(sumText, tx + 4, ty + 2);
        ctx.setLineDash([4, 3]);
      });

      ctx.setLineDash([]);
    }

    // 预填数字
    const fontSize = Math.floor(cellSize * 0.45);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = theme.fixedNum;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.fixedNum) {
          ctx.fillText(cell.fixedNum, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
        }
      }
    }

    ctx.restore();

    const levelId = board.levelId || this._currentLevelId || 'unknown';
    this._boardCacheKey = `${levelId}-${this.themeId}-${canvasSize}-${this._dpr}`;
  }

  /**
   * 设置章节主题
   */
  setTheme(chapterId) {
    const id = parseInt(chapterId) || 1;
    this.themeId = id;
    this.theme = CHAPTER_THEMES[id] || DEFAULT_THEME;
    // 自动判断是否暗色主题
    if (this.theme.isDark === undefined) {
      const hex = this.theme.bgColor.replace('#', '');
      const r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
      this.theme.isDark = (r*0.299 + g*0.587 + b*0.114) < 128;
    }
    // 同时更新CSS变量
    this._applyThemeCSS();
    // 设置页面背景图
    this._applyPageBg(id);
    // 主题变化，缓存失效
    this._staticCacheKey = '';
    this._boardCacheKey = '';
  }

  _applyPageBg(chapterId) {
    const bgSrc = CHAPTER_BG_IMAGES[chapterId];
    if (bgSrc) {
      document.body.style.backgroundImage = `url('${bgSrc}')`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    }
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

    // 仅在尺寸/DPR变化时更新canvas尺寸（避免每帧重置状态）
    this._updateCanvasSize(canvasSize);

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // ===== 静态层缓存（背景+网格+宫线+外边框）=====
    const staticKey = `${this.themeId}-${canvasSize}-${this._dpr}`;
    if (this._staticCacheKey !== staticKey) {
      this._drawStaticCache(board, canvasSize);
    }
    ctx.drawImage(this._staticCache, 0, 0, canvasSize, canvasSize);

    // ===== 盘面层缓存（笼子+预填数）=====
    const levelId = board.levelId || this._currentLevelId || 'unknown';
    if (board.levelId) this._currentLevelId = board.levelId;
    const boardKey = `${levelId}-${this.themeId}-${canvasSize}-${this._dpr}`;
    if (this._boardCacheKey !== boardKey) {
      this._drawBoardCache(board, canvasSize);
    }
    ctx.drawImage(this._boardCache, 0, 0, canvasSize, canvasSize);

    ctx.save();
    ctx.translate(padding, padding);

    // ===== 动态层：高亮、选中、玩家数字、候选数等 =====
    this._drawHighlightMask(board);
    this._drawRowColBoxHighlight(board);
    this._drawCageHighlight(board);
    this._drawHintRegion(board);
    this._drawHintPair(board);
    this._drawSameNumberHighlight(board);
    this._drawSelectedCell(board);
    this._drawHintHighlight(board);
    this._drawBattlePlayerOwned(board);
    this._drawPlayerNumbers(board);
    this._drawLockMask(board);
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
    if (!board.cages || board.cages.length === 0) return;
    
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

  // ---------- 5.5 残局教学关锁定格遮罩 ----------
  _drawLockMask(board) {
    const { ctx, cellSize } = this;
    const size = board.size;
    let hasLocked = false;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (board.cells[r][c].isLocked) { hasLocked = true; break; }
    if (!hasLocked) return;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isLocked) {
          // 半透明灰色遮罩，让已填数字变暗
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2);
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

  // ---------- 7.5 提示关联区域高亮（第二层提示） ----------
  _drawHintRegion(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    let has = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board.cells[r][c].isHintRegion) {
          ctx.fillStyle = theme.hintBg;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          has = true;
        }
      }
    }
    return has;
  }

  // ---------- 7.7 数对关键格高亮（第二层提示 - 数对格特殊颜色） ----------
  _drawHintPair(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const pairColor = '#a78bfa'; // 紫色表示数对格
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board.cells[r][c].isHintPair) {
          ctx.fillStyle = 'rgba(167,139,250,0.2)';
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          ctx.strokeStyle = pairColor;
          ctx.lineWidth = 3;
          ctx.strokeRect(c * cellSize + 3, r * cellSize + 3, cellSize - 6, cellSize - 6);
        }
      }
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

  // 只画玩家填的数字（预填数已在缓存层中）
  _drawPlayerNumbers(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    const fontSize = Math.floor(cellSize * 0.45);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${fontSize}px sans-serif`;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (!cell.fillNum) continue;

        if (cell.isError && board.settings.conflictRed) {
          ctx.fillStyle = theme.errorNum;
        } else {
          ctx.fillStyle = theme.playerNum;
        }
        ctx.fillText(cell.fillNum, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
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

    const fontSize = Math.floor(cellSize * 0.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = theme.hintNumColor;
    ctx.shadowColor = theme.hintNumColor;
    ctx.shadowBlur = 8;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isHintCell && cell.hintNumber !== null) {
          ctx.fillText(
            String(cell.hintNumber),
            c * cellSize + cellSize / 2,
            r * cellSize + cellSize / 2 + 2
          );
        }
      }
    }
    ctx.shadowBlur = 0;
  }
}
