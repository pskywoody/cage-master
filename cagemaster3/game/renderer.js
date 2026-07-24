// ==========================================
// Canvas 渲染器 - 章节主题系统
// ==========================================

/**
 * 将 hex 颜色转换为 rgba 字符串
 */
function _hexToRgbaStatic(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 加深颜色（降低亮度）
 */
function _darkenHex(hex, amount) {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.max(0, Math.floor(r * (1 - amount)));
  g = Math.max(0, Math.floor(g * (1 - amount)));
  b = Math.max(0, Math.floor(b * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 变亮颜色（提高亮度）
 */
function _lightenHex(hex, amount) {
  const h = hex.replace('#', '');
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);
  r = Math.min(255, Math.floor(r + (255 - r) * amount));
  g = Math.min(255, Math.floor(g + (255 - g) * amount));
  b = Math.min(255, Math.floor(b + (255 - b) * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 从核心样式参数构建完整主题对象
 * 将 5 个核心参数（primary/secondary/accent/bgGradient/texture）
 * 推算为渲染器所需的全部 40+ 个主题字段
 */
function _buildThemeFromStyle(style) {
  const c = style.colors;
  const primary = c.primary;
  const secondary = c.secondary;
  const accent = c.accent;
  const bgStart = c.bgGradient[0];
  const bgEnd = c.bgGradient[1];
  // 取渐变中间值作为棋盘底色
  const bgColor = bgStart;

  // 计算 accent 的深浅变体
  const accentDark = _darkenHex(accent, 0.3);
  const accentLight = _lightenHex(accent, 0.4);

  // 计算页面背景色（比棋盘底色稍深/稍暗，形成层次感）
  const bgPage = _darkenHex(bgEnd, 0.05);

  // 计算数字键背景
  const numPadBg = _lightenHex(bgStart, 0.03);
  const numPadDoneBg = bgEnd;

  return {
    name: style.name || 'Unknown',
    isDark: false, // 明朗学术风全部为亮色主题

    // ===== 结构层 =====
    bgColor: bgColor,
    gridLine: _hexToRgbaStatic(primary, 0.15),   // 单元格细线：primary + 15% 不透明度
    boxLine: primary,                            // 宫格粗线：primary
    outerBorder: primary,                        // 外框：primary
    cageDash: _hexToRgbaStatic(accent, 0.65),     // 杀手虚线框：accent + 65% 不透明度

    // ===== 和值徽章 =====
    cageBadgeBg: accent,                         // 和值徽章背景：accent
    cageBadgeText: '#ffffff',                    // 和值文字：白色（保证在彩色徽章上可读）

    // ===== 状态高亮层 =====
    selectedBg: _hexToRgbaStatic(accent, 0.25),       // 选中格：accent + 25%
    selectedBorder: accent,                           // 选中边框：accent
    rowColHighlight: _hexToRgbaStatic(accent, 0.08),  // 同行列宫：accent + 8%
    cageHighlight: _hexToRgbaStatic(accent, 0.10),    // 同笼高亮：accent + 10%
    sameNumHighlight: _hexToRgbaStatic(accent, 0.12), // 同数字高亮：accent + 12%

    // ===== 数字层 =====
    fixedNum: primary,                           // 给定数字：primary
    playerNum: secondary,                        // 玩家数字：secondary
    errorNum: '#dc2626',                         // 冲突数字：固定朱砂红
    candidateNum: _hexToRgbaStatic(secondary, 0.8), // 笔记候选：secondary + 80%（提高可见性）

    // ===== 提示系统 =====
    hintBorder: accent,
    hintBg: _hexToRgbaStatic(accent, 0.15),
    hintNumColor: accent,

    // ===== 多类型高亮（提示/错误/正确）=====
    hintHighlightBg: _hexToRgbaStatic(accent, 0.20),      // 提示高亮背景
    hintHighlightBorder: accent,                          // 提示高亮边框
    errorHighlightBg: 'rgba(220, 38, 38, 0.20)',          // 错误高亮背景（朱砂红）
    errorHighlightBorder: '#dc2626',                      // 错误高亮边框
    successHighlightBg: 'rgba(22, 163, 74, 0.20)',        // 正确高亮背景（翠绿）
    successHighlightBorder: '#16a34a',                    // 正确高亮边框

    // ===== 候选/排除模式 =====
    candidateBorder: accent,
    candidateText: accent,

    // ===== 玩家相关 =====
    playerOwned: _hexToRgbaStatic(accent, 0.18),
    highlight45: _hexToRgbaStatic(accent, 0.35),

    // ===== 强调色系列 =====
    accent: accent,
    accentDark: accentDark,
    accentLight: accentLight,
    accentGold: accent, // 金色也用 accent 统一

    // ===== 页面与 UI =====
    bgPage: bgPage,
    numPadBg: numPadBg,
    numPadText: secondary,
    numPadDoneBg: numPadDoneBg,
    numPadDoneText: _hexToRgbaStatic(secondary, 0.4),
    toolBarBg: _lightenHex(bgStart, 0.02),
    toolBarText: primary,

    // ===== 迷雾（故事模式） =====
    fogColor: `rgba(20, 20, 30, `,  // 深色迷雾，在亮色主题上形成对比
    fogTexColor: `rgba(100, 100, 120, `,

    // ===== 纹理标识 =====
    texture: c.texture || 'none',
    bgGradient: c.bgGradient,
  };
}

// ===== 从 CHAPTER_STYLES 构建所有主题 =====
const CHAPTER_THEMES = {};

function _buildAllThemes() {
  if (typeof CHAPTER_STYLES === 'undefined') return;
  for (const key in CHAPTER_STYLES) {
    if (CHAPTER_STYLES.hasOwnProperty(key)) {
      CHAPTER_THEMES[key] = _buildThemeFromStyle(CHAPTER_STYLES[key]);
    }
  }
}

// 尝试从全局读取 CHAPTER_STYLES（浏览器环境）
if (typeof window !== 'undefined' && window.CHAPTER_STYLES) {
  _buildAllThemes();
}

/**
 * 从单一 accent 颜色自动推算完整 style 配置
 * 用于从 chapters.json 的 color 字段快速生成主题
 * @param {string} accentHex - 主题色（accent）
 * @param {string} name - 主题名称
 * @returns {Object} 完整的 style 配置对象
 */
function _deriveStyleFromAccent(accentHex, name) {
  // 用 accent 作为主色调，推算出和谐的 primary 和 secondary
  // 策略：accent 决定情绪色，primary 用深灰保证文字可读性，secondary 用中灰
  const primary = '#1a1a1a';   // 深炭灰，文字与主线条
  const secondary = '#4a4a4a'; // 中灰，玩家数字

  // 根据 accent 的明度调整背景色基调，确保视觉协调
  const h = accentHex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

  // 背景渐变色：暖米色基调，混入少量 accent 色调
  // 明度高的 accent 让背景偏暖，明度低的 accent 让背景偏米白
  const tintAmount = 0.06; // 混入比例
  const bgBaseR = Math.round(245 + (r - 245) * tintAmount);
  const bgBaseG = Math.round(237 + (g - 237) * tintAmount);
  const bgBaseB = Math.round(224 + (b - 224) * tintAmount);
  const bgStart = `#${bgBaseR.toString(16).padStart(2, '0')}${bgBaseG.toString(16).padStart(2, '0')}${bgBaseB.toString(16).padStart(2, '0')}`;

  const endR = Math.round(232 + (r - 232) * tintAmount * 1.5);
  const endG = Math.round(221 + (g - 221) * tintAmount * 1.5);
  const endB = Math.round(208 + (b - 208) * tintAmount * 1.5);
  const bgEnd = `#${endR.toString(16).padStart(2, '0')}${endG.toString(16).padStart(2, '0')}${endB.toString(16).padStart(2, '0')}`;

  // 纹理选择：根据主题色的冷暖倾向选择纹理
  // 冷色（蓝/紫）用 stone 纹理，暖色（红/橙/黄）用 paper 纹理
  const isCool = (b > r && b > g) || (Math.abs(r - g) < 30 && b > r);
  const texture = isCool ? 'stone-rub' : 'paper-noise';

  return {
    name: name || 'Chapter Theme',
    colors: {
      primary: primary,
      secondary: secondary,
      accent: accentHex,
      bgGradient: [bgStart, bgEnd],
      texture: texture,
    },
  };
}

/**
 * 从 chapters.json 数据中提取章节颜色并构建所有主题
 * 当 CHAPTER_STYLES 未定义时使用此方法作为回退
 * @param {Object} chaptersData - chapters.json 的数据对象
 */
function buildThemesFromChaptersData(chaptersData) {
  if (!chaptersData || !chaptersData.chapters) return;
  for (const ch of chaptersData.chapters) {
    const id = ch.chapterId;
    if (!id || CHAPTER_THEMES[id]) continue; // 已有则不覆盖
    const style = _deriveStyleFromAccent(ch.color || '#a23939', ch.title || `Chapter ${id}`);
    CHAPTER_THEMES[id] = _buildThemeFromStyle(style);
  }
}

// 尝试从全局读取 chaptersData（浏览器环境，由外部脚本加载）
if (typeof window !== 'undefined' && window.chaptersData) {
  buildThemesFromChaptersData(window.chaptersData);
}

// 默认主题（第1章）
const DEFAULT_THEME = CHAPTER_THEMES[1] || {
  name: 'Default',
  isDark: false,
  bgColor: '#f5ede0',
  gridLine: 'rgba(26, 26, 26, 0.15)',
  boxLine: '#1a1a1a',
  outerBorder: '#1a1a1a',
  cageDash: 'rgba(162, 57, 57, 0.4)',
  cageBadgeBg: '#a23939',
  cageBadgeText: '#ffffff',
  selectedBg: 'rgba(162, 57, 57, 0.25)',
  selectedBorder: '#a23939',
  rowColHighlight: 'rgba(162, 57, 57, 0.08)',
  cageHighlight: 'rgba(162, 57, 57, 0.10)',
  sameNumHighlight: 'rgba(162, 57, 57, 0.12)',
  fixedNum: '#1a1a1a',
  playerNum: '#4a4a4a',
  errorNum: '#dc2626',
  candidateNum: 'rgba(74, 74, 74, 0.8)', // 提高透明度从0.5到0.8，增强可见性
  hintBorder: '#a23939',
  hintBg: 'rgba(162, 57, 57, 0.15)',
  hintNumColor: '#a23939',
  hintHighlightBg: 'rgba(162, 57, 57, 0.20)',
  hintHighlightBorder: '#a23939',
  errorHighlightBg: 'rgba(220, 38, 38, 0.20)',
  errorHighlightBorder: '#dc2626',
  successHighlightBg: 'rgba(22, 163, 74, 0.20)',
  successHighlightBorder: '#16a34a',
  candidateBorder: '#a23939',
  candidateText: '#a23939',
  playerOwned: 'rgba(162, 57, 57, 0.18)',
  highlight45: 'rgba(162, 57, 57, 0.35)',
  accent: '#a23939',
  accentDark: '#722727',
  accentLight: '#d47575',
  accentGold: '#a23939',
  bgPage: '#ddd0c0',
  numPadBg: '#f8f0e3',
  numPadText: '#4a4a4a',
  numPadDoneBg: '#e8ddd0',
  numPadDoneText: 'rgba(74, 74, 74, 0.4)',
  toolBarBg: '#f7efe2',
  toolBarText: '#1a1a1a',
  fogColor: 'rgba(20, 20, 30, ',
  fogTexColor: 'rgba(100, 100, 120, ',
  texture: 'paper-noise',
  bgGradient: ['#f5ede0', '#e8ddd0'],
};

// 章节背景图映射（使用 backgrounds 目录中的场景图）
const CHAPTER_BG_IMAGES = {
  1: 'assets/images/backgrounds/bg_scene1_archive_gate.jpg',
  2: 'assets/images/backgrounds/bg_scene2_archive_hall.jpg',
  3: 'assets/images/backgrounds/bg_scene3_wooden_desk.jpg',
  4: 'assets/images/backgrounds/bg_scene4_second_room.jpg',
  5: 'assets/images/backgrounds/bg_scene5_third_room.jpg',
  6: 'assets/images/backgrounds/bg_scene6_fourth_room.jpg',
  7: 'assets/images/backgrounds/bg_scene7_fifth_room.jpg',
  8: 'assets/images/backgrounds/bg_scene11_ninth_room.jpg',
};

// 章节背景图 JPG 回退（与主路径相同，都是 JPG）
const CHAPTER_BG_IMAGES_FALLBACK = {
  1: 'assets/images/backgrounds/bg_scene1_archive_gate.jpg',
  2: 'assets/images/backgrounds/bg_scene2_archive_hall.jpg',
  3: 'assets/images/backgrounds/bg_scene3_wooden_desk.jpg',
  4: 'assets/images/backgrounds/bg_scene4_second_room.jpg',
  5: 'assets/images/backgrounds/bg_scene5_third_room.jpg',
  6: 'assets/images/backgrounds/bg_scene6_fourth_room.jpg',
  7: 'assets/images/backgrounds/bg_scene7_fifth_room.jpg',
  8: 'assets/images/backgrounds/bg_scene11_ninth_room.jpg',
};

// 预加载背景图（WebP 优先，失败回退 JPG）
const bgImageCache = {};
function preloadBgImages() {
  Object.entries(CHAPTER_BG_IMAGES).forEach(([ch, src]) => {
    const img = new Image();
    img.onerror = function() {
      // WebP 加载失败，回退到 JPG
      img.src = CHAPTER_BG_IMAGES_FALLBACK[ch];
      img.onerror = null;
    };
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
    this._padding = 8;
    this._paddingTop = 10;
    this._paddingBottom = 8;
    this._paddingLeft = 10;
    this._paddingRight = 8;
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
    // 笼子数据缓存（避免每帧重复计算嵌套深度）
    this._cageDepthCache = null;    // { cageDepths, cageCellSets, maxDepth }
    this._cageDepthCacheKey = '';   // 缓存key：levelId
    // 笼子悬停状态
    this._hoveredCageId = null;     // 当前鼠标悬停的笼子ID
    this._hoverCageEnabled = true;  // 是否启用笼子悬停高亮
    // 自定义高亮（提示/错误/正确多类型）
    this._customHighlights = [];    // [{ cells: [{r,c}], type: 'hint'|'error'|'success', key: string }]
    // 三色热力图
    this._heatmapEnabled = false;   // 是否启用三色热力图
    this._heatmapData = null;       // HeatmapResult 对象
    this._heatmapOpacity = 0.35;    // 热力图透明度
    // 三幕模式：'simple' | 'gate' | 'core' | 'all'
    this._threeActMode = 'all';
    // 三幕边框动画启用
    this._threeActBordersEnabled = true;
    // Combo 燃烧效果
    this._comboCount = 0;              // 当前连击数
    this._comboGlowEnabled = true;     // 是否启用 Combo 燃烧效果
    // 填数动画
    this._fillAnimations = new Map(); // key: "r,c", value: { startTime: number, duration: number }
    this._fillAnimationEnabled = true; // 是否启用填数动画
    this._animFrameId = null;          // requestAnimationFrame ID
    this._currentBoard = null;         // 当前 board 引用（用于动画循环）
    // 笔记系统引用（可显式设置，也可从全局读取）
    this._noteSystem = null;
    // Boss战系统
    this._bossBattle = null;
    this._bossBattleActive = false;

    // 机关锁渲染（第1章Boss战）
    this._lockReleases = new Map();  // cageId -> {startTime, phase}
    this._allLocksOpenTime = 0;     // 三锁齐开时间
    this._allLocksOpen = false;     // 是否已全部打开
    // ---- 幻影格特效（第3章Boss战） ----
    this._fakeCellExposures = new Map();  // "r,c" -> {startTime, phase}
    this._fakeCellFails = new Map();      // "r,c" -> {startTime, phase}
    // ---- 联动锁特效（第4章Boss战） ----
    this._regionLockEffects = new Map();  // lockId -> {startTime, phase: 'primed'|'released'}
    this._revealedNotes = new Map();      // "r,c" -> {notes:[], startTime}
    // ---- 嵌套笼坍缩特效（第5章Boss战） ----
    this._collapseAnimations = new Map(); // cageId -> {startTime, stage}
    this._collapseActive = false;
    this._collapseStage = 0;
    // 粒子特效系统
    this._particles = [];     // 活跃粒子列表
    this._particleEnabled = true;
    // 红格预警（Boss战 gate 格闪烁）
    this._gateAlertCells = new Map();  // "r,c" -> { startTime, duration }
    // 教学高亮系统（LessonPlayer）
    this._lessonHighlights = {
      rows: new Set(),
      cols: new Set(),
      boxes: new Set(),
      cages: new Set(),
      cells: new Map(),  // key: "r,c" -> {r, c, mode, startTime}
      shakes: new Map(), // key: "r,c" -> {r, c, startTime}
      spotlight: false,  // 聚光灯模式：非高亮区域变暗
      spotlightIntensity: 0.45, // 聚光灯暗度 0~1
      freezeCells: new Set(), // 冻结的格子 key: "r,c"
      freezeAll: false,  // 全部冻结（配合 spotlight 高亮区例外）
      highlightNumber: null, // 连填模式下高亮的数字
    };

    // 提示播放动画状态（HintAnimationPlayer）
    this._hintAnimState = {
      active: false,          // 是否正在播放
      steps: [],              // 动画步骤数组
      currentIndex: 0,        // 当前步骤索引
      startTime: 0,           // 当前步骤开始时间
      duration: 0,            // 当前步骤持续时间
      progress: 0,            // 当前步骤进度 0~1
      onStepComplete: null,   // 单步完成回调
      onComplete: null,       // 全部完成回调
    };

    // 高亮选项（用于关卡功能渐进式解锁）
    this._highlightOptions = {
      highlightRow: true,
      highlightCol: true,
      highlightBox: true,
      highlightNumber: true,
      highlightCage: true,
    };
  }

  /**
   * 设置高亮选项（用于关卡功能渐进式解锁）
   * @param {Object} options - 高亮配置
   * @param {boolean} [options.highlightRow=true] - 行高亮
   * @param {boolean} [options.highlightCol=true] - 列高亮
   * @param {boolean} [options.highlightBox=true] - 宫高亮
   * @param {boolean} [options.highlightNumber=true] - 同数字高亮
   * @param {boolean} [options.highlightCage=true] - 同笼子高亮
   */
  setHighlightOptions(options) {
    if (!options) return;
    this._highlightOptions = {
      ...this._highlightOptions,
      ...options,
    };
  }

  // ---------- 三色热力图控制 ----------

  /**
   * 设置三色热力图数据
   * @param {Object|null} heatmapData - TechRaterAdapter.generateHeatmap() 的结果
   */
  setHeatmapData(heatmapData) {
    this._heatmapData = heatmapData;
    // 如果有待应用的三幕模式（数据加载前就调用了 setThreeActMode），现在应用
    if (this._pendingThreeActMode !== undefined) {
      this._threeActMode = this._pendingThreeActMode;
      this._pendingThreeActMode = undefined;
    }
  }

  /**
   * 启用/禁用三色热力图
   * @param {boolean} enabled
   * @param {number} opacity - 透明度 (0~1)
   */
  setHeatmapEnabled(enabled, opacity = 0.35) {
    this._heatmapEnabled = enabled;
    this._heatmapOpacity = opacity;
  }

  /**
   * 更新热力图透明度
   */
  setHeatmapOpacity(opacity) {
    this._heatmapOpacity = opacity;
  }

  /**
   * 设置三幕显示模式，控制哪类格子被高亮
   * @param {string} mode - 'simple' | 'gate' | 'core' | 'all'
   */
  setThreeActMode(mode) {
    this._threeActMode = mode;
    // 如果热力图数据尚未加载，暂存模式，等 setHeatmapData 时自动应用
    if (!this._heatmapData) {
      this._pendingThreeActMode = mode;
    }
    this.forceRender = true;
  }

  /**
   * 设置三幕边框是否启用
   */
  setThreeActBordersEnabled(enabled) {
    this._threeActBordersEnabled = enabled;
    this.forceRender = true;
  }

  /**
   * 设置当前连击数，用于控制燃烧效果强度
   * @param {number} count - 连击数
   */
  setComboCount(count) {
    this._comboCount = Math.max(0, count | 0);
    if (this._comboGlowEnabled && this._comboCount >= 3) {
      this._ensureAnimLoop();
    }
    this.forceRender = true;
  }

  /**
   * 设置 Combo 燃烧效果是否启用
   */
  setComboGlowEnabled(enabled) {
    this._comboGlowEnabled = enabled;
    this.forceRender = true;
  }

  // padding getter/setter：保持向后兼容，同时支持四个方向独立设置
  get padding() { return this._padding; }
  set padding(val) {
    this._padding = val;
    this._paddingTop = val;
    this._paddingBottom = val;
    this._paddingLeft = val;
    this._paddingRight = val;
  }
  get paddingTop() { return this._paddingTop; }
  set paddingTop(val) { this._paddingTop = val; }
  get paddingBottom() { return this._paddingBottom; }
  set paddingBottom(val) { this._paddingBottom = val; }
  get paddingLeft() { return this._paddingLeft; }
  set paddingLeft(val) { this._paddingLeft = val; }
  get paddingRight() { return this._paddingRight; }
  set paddingRight(val) { this._paddingRight = val; }

  /**
   * 更新Canvas尺寸（仅在尺寸/DPR变化时调用）
   */
  _updateCanvasSize(canvasSize) {
    return this._updateCanvasSizeRect(canvasSize, canvasSize);
  }

  _updateCanvasSizeRect(canvasW, canvasH) {
    const dpr = window.devicePixelRatio || 1;
    if (canvasW === this._lastWidth && canvasH === this._lastHeight && dpr === this._dpr) return false;
    this._lastWidth = canvasW;
    this._lastHeight = canvasH;
    this._dpr = dpr;
    this.canvas.width = canvasW * dpr;
    this.canvas.height = canvasH * dpr;
    this.canvas.style.width = canvasW + 'px';
    this.canvas.style.height = canvasH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Re-apply opaque background after canvas reset
    this.canvas.style.background = '#f5ede0';
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
  _drawStaticCache(board, canvasW, canvasH) {
    if (canvasH === undefined) { canvasH = canvasW; }
    const cache = this._getOffscreenCanvas('_staticCache', canvasW * this._dpr, canvasH * this._dpr);
    const ctx = cache.getContext('2d');
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const { cellSize, theme } = this;
    const size = board.size;
    const padL = this.paddingLeft;
    const padR = this.paddingRight;
    const padT = this.paddingTop;
    const padB = this.paddingBottom;

    ctx.clearRect(0, 0, canvasW, canvasH);

    // 构建渐变背景（明朗学术风：双色线性渐变）
    const bgGradient = ctx.createLinearGradient(0, 0, canvasW, canvasH);
    if (theme.bgGradient && theme.bgGradient.length >= 2) {
      bgGradient.addColorStop(0, theme.bgGradient[0]);
      bgGradient.addColorStop(1, theme.bgGradient[1]);
    } else {
      bgGradient.addColorStop(0, theme.bgColor);
      bgGradient.addColorStop(1, theme.bgColor);
    }

    // 始终使用不透明背景，隔绝背景干扰
    ctx.fillStyle = bgGradient;
    ctx.globalAlpha = 1.0;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.globalAlpha = 1;

    // 纹理层叠加（正片叠底效果）
    if (theme.texture && theme.texture !== 'none') {
      ctx.save();
      ctx.globalAlpha = 0.18; // 调整纹理可见度，更精致
      ctx.globalCompositeOperation = 'multiply';
      this._drawTextureRect(ctx, theme.texture, canvasW, canvasH);
      ctx.restore();
    }

    // 棋盘内阴影效果（增加深度感）
    ctx.save();
    ctx.beginPath();
    const boardR = Math.min(cellSize * 0.08, 6);
    const boardW = size * cellSize;
    const boardH = size * cellSize;
    // 绘制圆角矩形路径作为裁剪区域
    ctx.moveTo(boardR, 0);
    ctx.lineTo(boardW - boardR, 0);
    ctx.quadraticCurveTo(boardW, 0, boardW, boardR);
    ctx.lineTo(boardW, boardH - boardR);
    ctx.quadraticCurveTo(boardW, boardH, boardW - boardR, boardH);
    ctx.lineTo(boardR, boardH);
    ctx.quadraticCurveTo(0, boardH, 0, boardH - boardR);
    ctx.lineTo(0, boardR);
    ctx.quadraticCurveTo(0, 0, boardR, 0);
    ctx.closePath();
    ctx.clip();

    // 内阴影（四周渐变暗化）
    const innerShadowSize = Math.max(8, cellSize * 0.12);
    // 顶部
    const topGrad = ctx.createLinearGradient(0, 0, 0, innerShadowSize);
    topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.08)');
    topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, boardW, innerShadowSize);
    // 底部
    const bottomGrad = ctx.createLinearGradient(0, boardH, 0, boardH - innerShadowSize);
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0.06)');
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, boardH - innerShadowSize, boardW, innerShadowSize);
    ctx.restore();

    ctx.save();
    ctx.translate(padL, padT);

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

    // 外边框（简洁单线条）
    ctx.strokeStyle = theme.outerBorder;
    ctx.lineWidth = 2;
    const r = Math.min(cellSize * 0.08, 6);
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

    // 极淡的行列坐标编号（棋盘外缘，不覆盖内部）
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = 'rgba(120, 90, 60, 0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 行编号：左侧外缘，显示 1-9
    for (let i = 0; i < size; i++) {
      const y = i * cellSize + cellSize / 2;
      ctx.fillText(String(i + 1), -padL * 0.5, y);
    }

    // 列编号：顶部外缘，显示 A-I
    const colLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    for (let i = 0; i < size; i++) {
      const x = i * cellSize + cellSize / 2;
      ctx.fillText(colLabels[i] || String(i + 1), x, -padT * 0.5);
    }

    ctx.restore();

    ctx.restore();

    this._staticCacheKey = `${this.themeId}-${canvasW}x${canvasH}-${this._dpr}`;
  }

  /**
   * 计算响应式尺寸参数（基于 cellSize）
   * 返回：缩进量、内框线宽、和值字号、徽章内边距、圆角半径
   */
  _getCageScaleParams() {
    const cs = this.cellSize;
    // 判断是否为移动端布局
    const isMobile = document.body && document.body.classList && document.body.classList.contains('layout-mobile');
    // 缩进：相对格子外框向内缩进的像素数
    const inset = Math.max(2, Math.floor(cs * 0.04));
    // 内框线宽
    const innerLineWidth = Math.max(1.5, cs * 0.045);
    // 和值字号：格子尺寸的 20%（PC）/ 16%（移动端），相对比例更合理
    let sumFontSize = Math.floor(cs * 0.20);
    sumFontSize = Math.max(8, Math.min(18, sumFontSize));
    // 移动端：更小的字号，避免遮挡笔记
    if (isMobile) {
      sumFontSize = Math.floor(cs * 0.16);
      sumFontSize = Math.max(7, Math.min(14, sumFontSize));
    }
    // 徽章内边距：更紧凑，占格子比例降低
    let badgePaddingX = Math.max(1.5, Math.floor(cs * 0.04));
    let badgePaddingY = Math.max(1, Math.floor(cs * 0.02));
    if (isMobile) {
      badgePaddingX = Math.max(1, Math.floor(badgePaddingX * 0.7));
      badgePaddingY = Math.max(1, Math.floor(badgePaddingY * 0.7));
    }
    // 徽章圆角
    const badgeRadius = Math.max(2, Math.floor(cs * 0.05));
    // 外框线宽（格子边界）
    const outerLineWidth = 1;
    return {
      cellSize: cs,
      inset,
      innerLineWidth,
      sumFontSize,
      badgePaddingX,
      badgePaddingY,
      badgeRadius,
      outerLineWidth,
    };
  }

  /**
   * 绘制圆角矩形路径
   */
  _roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * 将十六进制颜色转换为 rgba
   */
  _hexToRgba(hex, alpha = 1) {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
      if (hex.startsWith('rgba')) return hex;
      return hex.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.substr(0, 2), 16);
    const g = parseInt(full.substr(2, 2), 16);
    const b = parseInt(full.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * 调整颜色的透明度（支持 hex、rgb、rgba 格式）
   * @param {string} color - 颜色字符串
   * @param {number} alpha - 新的透明度 (0~1)
   * @returns {string} rgba颜色字符串
   */
  _adjustColorAlpha(color, alpha) {
    if (!color) return `rgba(0, 0, 0, ${alpha})`;

    // 已经是 rgba 格式：替换 alpha 值
    if (color.startsWith('rgba')) {
      return color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
    }
    // rgb 格式：转 rgba
    if (color.startsWith('rgb')) {
      return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }
    // hex 格式
    return this._hexToRgba(color, alpha);
  }

  /**
   * 绘制纹理层（程序化生成，无需外部图片资源）
   * 支持的纹理类型：paper-noise, xuan-paper, stone-rub, wood-grain, draft-noise
   */
  _drawTexture(ctx, textureType, size) {
    // 使用伪随机生成，确保每次纹理一致
    let seed = 0;
    for (let i = 0; i < textureType.length; i++) {
      seed = (seed * 31 + textureType.charCodeAt(i)) & 0xffffffff;
    }
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    ctx.save();

    switch (textureType) {
      case 'paper-noise': {
        // 轻微纸张噪点
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const v = 200 + Math.floor(rand() * 40);
          data[i] = v;     // R
          data[i + 1] = v; // G
          data[i + 2] = v - 5; // B (微微偏黄)
          data[i + 3] = Math.floor(rand() * 30); // 极低透明度
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      case 'xuan-paper': {
        // 极细宣纸纹理（竖向纤维感）
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        for (let y = 0; y < size; y++) {
          const fiberVar = Math.sin(y * 0.3) * 0.5 + 0.5;
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const noise = rand() * 20;
            const v = 210 + fiberVar * 15 + noise;
            data[i] = v;
            data[i + 1] = v - 3;
            data[i + 2] = v - 10;
            data[i + 3] = Math.floor(rand() * 25);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      case 'stone-rub': {
        // 石纹拓片质感（颗粒粗糙感）
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const v = 180 + Math.floor(rand() * 50);
          data[i] = v;
          data[i + 1] = v - 5;
          data[i + 2] = v - 10;
          data[i + 3] = Math.floor(rand() * 35);
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      case 'wood-grain': {
        // 木质纹理（水平波浪纹）
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        for (let y = 0; y < size; y++) {
          const grain = Math.sin(y * 0.08 + Math.sin(y * 0.03) * 2) * 0.5 + 0.5;
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const noise = rand() * 15;
            const v = 190 + grain * 30 + noise;
            data[i] = v + 10;
            data[i + 1] = v - 5;
            data[i + 2] = v - 25;
            data[i + 3] = Math.floor(rand() * 30);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      case 'draft-noise': {
        // 草稿纸/牛皮纸噪点
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const v = 220 + Math.floor(rand() * 30);
          data[i] = v;
          data[i + 1] = v - 8;
          data[i + 2] = v - 20;
          data[i + 3] = Math.floor(rand() * 25);
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      default:
        // 无纹理
        break;
    }

    ctx.restore();
  }

  _drawTextureRect(ctx, textureType, width, height) {
    // 使用伪随机生成，确保每次纹理一致
    let seed = 0;
    for (let i = 0; i < textureType.length; i++) {
      seed = (seed * 31 + textureType.charCodeAt(i)) & 0xffffffff;
    }
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }

    ctx.save();

    switch (textureType) {
      case 'paper-noise': {
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const v = 200 + Math.floor(rand() * 40);
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v - 5;
          data[i + 3] = Math.floor(rand() * 30);
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      case 'xuan-paper': {
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        for (let y = 0; y < height; y++) {
          const fiberVar = Math.sin(y * 0.3) * 0.5 + 0.5;
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const noise = rand() * 20;
            const v = 210 + fiberVar * 15 + noise;
            data[i] = v;
            data[i + 1] = v - 3;
            data[i + 2] = v - 10;
            data[i + 3] = Math.floor(rand() * 25);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      case 'stone-rub': {
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const v = 180 + Math.floor(rand() * 50);
          data[i] = v;
          data[i + 1] = v - 5;
          data[i + 2] = v - 10;
          data[i + 3] = Math.floor(rand() * 35);
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      case 'wood-grain': {
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        for (let y = 0; y < height; y++) {
          const grain = Math.sin(y * 0.08 + Math.sin(y * 0.03) * 2) * 0.5 + 0.5;
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const noise = rand() * 15;
            const v = 190 + grain * 30 + noise;
            data[i] = v + 10;
            data[i + 1] = v - 5;
            data[i + 2] = v - 25;
            data[i + 3] = Math.floor(rand() * 30);
          }
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      case 'draft-noise': {
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const v = 220 + Math.floor(rand() * 30);
          data[i] = v;
          data[i + 1] = v - 8;
          data[i + 2] = v - 20;
          data[i + 3] = Math.floor(rand() * 25);
        }
        ctx.putImageData(imageData, 0, 0);
        break;
      }
      default:
        break;
    }

    ctx.restore();
  }

  /**
   * 计算笼子的边界矩形（以格子坐标为单位）
   * 返回 { minR, minC, maxR, maxC }
   */
  _getCageBounds(cage) {
    let minR = 99, minC = 99, maxR = -1, maxC = -1;
    for (const [r, c] of cage.cells) {
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
    return { minR, minC, maxR, maxC };
  }

  /**
   * 获取笼子和值标签的锚点格子（笼子内部最靠上、最靠左的格子）
   * 用于避免L形等异形笼子的标签显示在其他笼子的格子上
   */
  _getCageSumAnchor(cage) {
    // 先按行排序，取最上面一行的格子
    let minR = 99;
    for (const [r, c] of cage.cells) {
      if (r < minR) minR = r;
    }
    // 在最上面一行中，取最左边的格子
    let minC = 99;
    for (const [r, c] of cage.cells) {
      if (r === minR && c < minC) minC = c;
    }
    return { r: minR, c: minC };
  }

  /**
   * 计算嵌套笼深度（每个笼子被多少其他笼子包含）
   * 带缓存：同一关卡只计算一次
   */
  _computeCageDepths(cages, levelId) {
    const cacheKey = levelId || 'unknown';
    if (this._cageDepthCache && this._cageDepthCacheKey === cacheKey) {
      return this._cageDepthCache;
    }

    const cageDepths = new Map();
    const cageCellSets = new Map();

    for (const cage of cages) {
      const cellSet = new Set(cage.cells.map(([r, c]) => `${r},${c}`));
      cageCellSets.set(cage.id, cellSet);
    }

    for (const cage of cages) {
      const myCells = cageCellSets.get(cage.id);
      let depth = 0;
      for (const other of cages) {
        if (other.id === cage.id) continue;
        const otherCells = cageCellSets.get(other.id);
        let contains = true;
        for (const cell of myCells) {
          if (!otherCells.has(cell)) { contains = false; break; }
        }
        if (contains && myCells.size < otherCells.size) depth++;
      }
      cageDepths.set(cage.id, depth);
    }

    const result = {
      cageDepths,
      cageCellSets,
      maxDepth: Math.max(0, ...cageDepths.values())
    };

    this._cageDepthCache = result;
    this._cageDepthCacheKey = cacheKey;
    return result;
  }

  /**
   * 绘制笼子的一条边（支持缩进）
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} side - 'top'|'bottom'|'left'|'right'
   * @param {number} r, c - 格子坐标
   * @param {number} inset - 缩进量
   */
  _drawCageEdge(ctx, side, r, c, inset) {
    const { cellSize } = this;
    const x = c * cellSize;
    const y = r * cellSize;
    const inX = x + inset;
    const inY = y + inset;
    const inX2 = x + cellSize - inset;
    const inY2 = y + cellSize - inset;

    ctx.beginPath();
    switch (side) {
      case 'top':
        ctx.moveTo(inX, y + inset);
        ctx.lineTo(inX2, y + inset);
        break;
      case 'bottom':
        ctx.moveTo(inX, y + cellSize - inset);
        ctx.lineTo(inX2, y + cellSize - inset);
        break;
      case 'left':
        ctx.moveTo(x + inset, inY);
        ctx.lineTo(x + inset, inY2);
        break;
      case 'right':
        ctx.moveTo(x + cellSize - inset, inY);
        ctx.lineTo(x + cellSize - inset, inY2);
        break;
    }
    ctx.stroke();
  }

  /**
   * 获取笼和徽章的状态（三幕联动）
   * @param {Object} cage - 笼子对象
   * @param {Set} cellSet - 笼子格子集合
   * @returns {string} 'normal' | 'satisfied' | 'error' | 'gate-target'
   */
  _getCageSumState(cage, cellSet) {
    const board = this._currentBoard;
    if (!board) return 'normal';

    // 1. 检查是否为破局目标笼（第二幕 gate-target）
    if (this._heatmapEnabled && this._heatmapData && this._threeActMode === 'gate') {
      const gridMeta = this._heatmapData.gridMeta;
      if (gridMeta && cellSet) {
        for (const key of cellSet) {
          const [r, c] = key.split(',').map(Number);
          const meta = gridMeta[r]?.[c];
          if (meta && meta.category === 'gate') {
            // 至少有一个 gate 格的笼子就是目标笼
            return 'gate-target';
          }
        }
      }
    }

    // 2. 检查笼子是否已填满且和值正确/错误
    let filledCount = 0;
    let totalCells = 0;
    let sum = 0;

    if (cellSet) {
      for (const key of cellSet) {
        const [r, c] = key.split(',').map(Number);
        const cell = board.cells[r]?.[c];
        if (!cell) continue;
        totalCells++;
        if (cell.fillNum > 0) {
          filledCount++;
          sum += cell.fillNum;
        }
      }
    }

    // 3. 满足状态：已填满且和值正确
    if (filledCount === totalCells && totalCells > 0 && !cage.hiddenSum) {
      if (sum === cage.sum) return 'satisfied';
      // 填满但和值错误 → 错误
      return 'error';
    }

    return 'normal';
  }

  /**
   * 绘制和值徽章（高对比度侦探 HUD 风格 - 规格书 v1.1）
   * 深海蓝黑背景 + 纯白文字 + 微光边框 + 三幕联动状态
   */
  _drawCageSumBadge(ctx, cage, cellSet, params, isInner) {
    const { cellSize, theme } = this;
    const { sumFontSize, badgePaddingX, badgePaddingY, badgeRadius, inset } = params;
    // 使用笼子内部最左上的格子作为锚点，避免L形笼子的标签显示在其他笼子上
    const anchor = this._getCageSumAnchor(cage);
    const { r: anchorR, c: anchorC } = anchor;

    const sumText = cage.hiddenSum ? '?' : String(cage.sum);

    // 计算徽章状态（三幕联动）
    let cageState = 'normal';
    try {
      cageState = this._getCageSumState(cage, cellSet);
    } catch (e) {
      cageState = 'normal';
    }

    ctx.font = `700 ${sumFontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(sumText).width;
    const badgeW = textWidth + badgePaddingX * 2;
    const badgeH = sumFontSize + badgePaddingY * 2;

    // 定位：锚点格子左上角内
    const badgeX = anchorC * cellSize + Math.max(3, inset);
    const badgeY = anchorR * cellSize + Math.max(2, inset * 0.6);

    // ===== 根据状态确定配色 =====
    let badgeBg, badgeTextColor, badgeBorderColor;

    if (cageState === 'satisfied') {
      // 达成态：绿色底白字
      badgeBg = '#22c55e';
      badgeTextColor = '#ffffff';
      badgeBorderColor = 'rgba(34, 197, 94, 0.8)';
    } else if (cageState === 'error') {
      // 错误态：红色底白字
      badgeBg = '#ef4444';
      badgeTextColor = '#ffffff';
      badgeBorderColor = 'rgba(239, 68, 68, 0.8)';
    } else if (cageState === 'gate-target') {
      // 关门目标态：金色底深字
      badgeBg = '#fbbf24';
      badgeTextColor = '#1a1a1a';
      badgeBorderColor = 'rgba(251, 191, 36, 0.9)';
    } else {
      // 普通态：白底黑字，高对比度
      badgeBg = 'rgba(255, 255, 255, 0.95)';
      badgeTextColor = '#1a1a1a';
      badgeBorderColor = 'rgba(0, 0, 0, 0.15)';
    }

    // 徽章背景（白底）
    ctx.save();
    ctx.fillStyle = badgeBg;
    this._roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, badgeRadius);
    ctx.fill();

    // 徽章边框
    ctx.strokeStyle = badgeBorderColor;
    ctx.lineWidth = 1;
    this._roundRectPath(ctx, badgeX + 0.5, badgeY + 0.5, badgeW - 1, badgeH - 1, badgeRadius - 0.5);
    ctx.stroke();

    // 文字（黑字，高对比度）
    ctx.fillStyle = badgeTextColor;
    ctx.fillText(sumText, badgeX + badgePaddingX, badgeY + badgeH / 2);
    ctx.restore();
  }

  /**
   * 动态绘制笼和徽章（状态变化时重绘）
   * 只绘制状态非 normal 的徽章（satisfied/error/gate-target）
   * 在静态缓存层之上覆盖绘制，保证状态实时更新
   */
  _drawCageSumBadgesDynamic(board) {
    if (!board.cages || board.cages.length === 0) return;

    const { ctx, cellSize, theme } = this;
    const params = this._getCageScaleParams();
    const { inset } = params;

    // 计算嵌套笼深度（带缓存）
    const levelIdForCache = board.levelId || this._currentLevelId || 'unknown';
    const { cageDepths, cageCellSets, maxDepth } = this._computeCageDepths(board.cages, levelIdForCache);

    // 从最外层画到最内层（内层在上）
    for (let depth = 0; depth <= maxDepth; depth++) {
      const layerCages = board.cages.filter(c => cageDepths.get(c.id) === depth);
      const isInner = depth > 0;

      // 内层笼和值需要向下偏移，避免重叠
      const depthOffsetY = depth * (params.sumFontSize * 0.6 + 2);

      for (const cage of layerCages) {
        const cellSet = cageCellSets.get(cage.id);

        // 获取当前状态
        let cageState = 'normal';
        try {
          cageState = this._getCageSumState(cage, cellSet);
        } catch (e) {
          cageState = 'normal';
        }

        // 只绘制非 normal 状态的徽章（覆盖在静态缓存之上）
        if (cageState === 'normal') continue;

        ctx.save();
        ctx.translate(0, depthOffsetY);
        this._drawCageSumBadge(ctx, cage, cellSet, params, isInner);
        ctx.restore();
      }
    }
  }

  /**
   * 绘制盘面缓存层（三层分离笼子 + 预填数）
   * 第1层：格子外框（实线） - 已在 staticCache 中绘制网格线
   * 第2层：笼子内框（虚线，缩进）
   * 第3层：和值标签徽章
   */
  _drawBoardCache(board, canvasW, canvasH) {
    if (canvasH === undefined) { canvasH = canvasW; }
    const cache = this._getOffscreenCanvas('_boardCache', canvasW * this._dpr, canvasH * this._dpr);
    const ctx = cache.getContext('2d');
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const { cellSize, theme } = this;
    const size = board.size;
    const padL = this.paddingLeft;
    const padT = this.paddingTop;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.save();
    ctx.translate(padL, padT);

    // ========== 三层分离：笼子渲染 ==========
    if (board.cages && board.cages.length > 0) {
      const params = this._getCageScaleParams();
      const { inset, innerLineWidth, sumFontSize } = params;

      // 计算嵌套笼深度（带缓存）
      const levelIdForCache = board.levelId || this._currentLevelId || 'unknown';
      const { cageDepths, cageCellSets, maxDepth } = this._computeCageDepths(board.cages, levelIdForCache);

      // ---- 第2层：笼子内框（简洁虚线，缩进2px）----
      // 从最外层画到最内层
      for (let depth = 0; depth <= maxDepth; depth++) {
        const layerCages = board.cages.filter(c => cageDepths.get(c.id) === depth);
        const isInner = depth > 0;

        // 内层笼：细实线 + 强调色；外层笼：细虚线 + 柔和色
        ctx.lineWidth = isInner ? Math.max(0.8, innerLineWidth * 0.6) : Math.max(1, innerLineWidth * 0.8);
        ctx.setLineDash(isInner ? [] : [5, 3]);
        
        // 统一使用高对比度的淡金色/米色虚线，去除阴影减少视觉噪点
        ctx.strokeStyle = isInner ? theme.accent : this._hexToRgba(theme.cageDash || '#8b7355', 0.85);
        ctx.lineCap = 'round';

        for (const cage of layerCages) {
          const cellSet = cageCellSets.get(cage.id);

          for (const [r, c] of cage.cells) {
            // 顶边
            if (!cellSet.has(`${r - 1},${c}`)) {
              this._drawCageEdge(ctx, 'top', r, c, inset);
            }
            // 底边
            if (!cellSet.has(`${r + 1},${c}`)) {
              this._drawCageEdge(ctx, 'bottom', r, c, inset);
            }
            // 左边
            if (!cellSet.has(`${r},${c - 1}`)) {
              this._drawCageEdge(ctx, 'left', r, c, inset);
            }
            // 右边
            if (!cellSet.has(`${r},${c + 1}`)) {
              this._drawCageEdge(ctx, 'right', r, c, inset);
            }
          }
        }
      }
      
      // 移动端：重置阴影，避免影响后续绘制
      const isMobileForReset = document.body && document.body.classList && document.body.classList.contains('layout-mobile');
      if (isMobileForReset) {
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowColor = 'transparent';
      }

      // 恢复 lineCap
      ctx.lineCap = 'butt';
      ctx.setLineDash([]);

      // ---- 第3层：和值标签徽章 ----
      // 从最外层画到最内层（内层在上）
      for (let depth = 0; depth <= maxDepth; depth++) {
        const layerCages = board.cages.filter(c => cageDepths.get(c.id) === depth);
        const isInner = depth > 0;

        // 内层笼和值需要向下偏移，避免重叠
        const depthOffsetY = depth * (sumFontSize * 0.6 + 2);

        for (const cage of layerCages) {
          const cellSet = cageCellSets.get(cage.id);
          // 临时调整 params 的偏移，这里通过保存/恢复坐标系实现
          ctx.save();
          ctx.translate(0, depthOffsetY);
          this._drawCageSumBadge(ctx, cage, cellSet, params, isInner);
          // 机关锁图标（第1章Boss战）
          if (this._bossBattleActive && this._bossBattle) {
            this._drawLockIndicator(ctx, cage, params.cellSize);
          }
          ctx.restore();
        }
      }
    }

    // 预填数字
    const fixedFontSize = Math.floor(cellSize * 0.62);  // 给定数字：62%
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fixedFontSize}px sans-serif`;
    ctx.fillStyle = theme.fixedNum;
    // 轻微文字阴影增强质感
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.fixedNum) {
          ctx.fillText(cell.fixedNum, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
        }
      }
    }
    // 清除阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.restore();

    const levelId = board.levelId || this._currentLevelId || 'unknown';
    this._boardCacheKey = `${levelId}-${this.themeId}-${canvasW}x${canvasH}-${this._dpr}`;
  }

  /**
   * 设置章节主题
   */
  setTheme(chapterId) {
    const id = parseInt(chapterId) || 1;
    this.themeId = id;

    // 优先从预构建的 CHAPTER_THEMES 中取
    let theme = CHAPTER_THEMES[id];
    // 如果没有，尝试从 CHAPTER_STYLES 动态构建
    if (!theme && typeof CHAPTER_STYLES !== 'undefined' && CHAPTER_STYLES[id]) {
      theme = _buildThemeFromStyle(CHAPTER_STYLES[id]);
      CHAPTER_THEMES[id] = theme;
    }
    // 如果还没有，尝试从全局 chaptersData 中按章节 color 字段推算
    if (!theme && typeof window !== 'undefined' && window.chaptersData && window.chaptersData.chapters) {
      const ch = window.chaptersData.chapters.find(c => c.chapterId === id);
      if (ch && ch.color) {
        const style = _deriveStyleFromAccent(ch.color, ch.title || `Chapter ${id}`);
        theme = _buildThemeFromStyle(style);
        CHAPTER_THEMES[id] = theme;
      }
    }
    // 最后回退到默认主题
    this.theme = theme || DEFAULT_THEME;

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

  /**
   * 设置当前悬停的笼子ID（鼠标悬停高亮用）
   * @param {string|null} cageId - 笼子ID，null 表示清除悬停
   */
  setHoveredCage(cageId) {
    if (this._hoveredCageId === cageId) return;
    this._hoveredCageId = cageId;
    this.forceRender = true;
  }

  /**
   * 启用/禁用笼子悬停高亮
   * @param {boolean} enabled
   */
  setHoverCageEnabled(enabled) {
    this._hoverCageEnabled = enabled;
    if (!enabled) {
      this._hoveredCageId = null;
    }
  }

  /**
   * 高亮一组提示目标格子（多类型高亮公共 API）
   * 支持叠加在现有渲染上，可同时存在多个不同 key 的高亮
   * @param {Array<{r:number,c:number}>} cells - 要高亮的格子坐标数组
   * @param {string} type - 高亮类型：'hint' | 'error' | 'success'
   * @param {string} key - 高亮标识（用于清除时区分），默认 'default'
   */
  highlightHintCells(cells, type = 'hint', key = 'default') {
    if (!cells || cells.length === 0) {
      this.clearHintHighlights(key);
      return;
    }
    // 验证类型
    const validTypes = ['hint', 'error', 'success'];
    if (!validTypes.includes(type)) {
      console.warn('[Renderer] 未知高亮类型:', type, '，使用 hint 代替');
      type = 'hint';
    }
    // 移除同 key 的旧高亮
    this._customHighlights = this._customHighlights.filter(h => h.key !== key);
    // 添加新高亮
    this._customHighlights.push({
      cells: cells.map(cell => ({ r: cell.r, c: cell.c })),
      type: type,
      key: key,
    });
    this.forceRender = true;
  }

  /**
   * 清除指定 key 的高亮
   * @param {string} key - 高亮标识，不传则清除所有
   */
  clearHintHighlights(key = null) {
    if (key === null) {
      if (this._customHighlights.length === 0) return;
      this._customHighlights = [];
    } else {
      const before = this._customHighlights.length;
      this._customHighlights = this._customHighlights.filter(h => h.key !== key);
      if (this._customHighlights.length === before) return;
    }
    this.forceRender = true;
  }

  // ==================== HintAnimationPlayer 提示动画播放器 ====================

  /**
   * 启动提示播放动画序列
   * @param {Array} steps - 动画步骤数组
   * @param {Function} [onStepComplete] - 单步完成回调 (stepIndex) => void
   * @param {Function} [onComplete] - 全部完成回调 () => void
   */
  playHintAnimation(steps, onStepComplete = null, onComplete = null) {
    if (!steps || steps.length === 0) return;

    const state = this._hintAnimState;
    state.steps = steps;
    state.currentIndex = 0;
    state.startTime = Date.now();
    state.duration = steps[0].duration || 600;
    state.progress = 0;
    state.onStepComplete = onStepComplete;
    state.onComplete = onComplete;
    state.active = true;

    this._ensureAnimLoop();
    this.forceRender = true;
  }

  /**
   * 跳过当前步，立即进入下一步
   */
  skipHintStep() {
    const state = this._hintAnimState;
    if (!state.active) return;

    // 触发当前步完成回调
    if (state.onStepComplete) {
      state.onStepComplete(state.currentIndex);
    }

    state.currentIndex++;
    if (state.currentIndex >= state.steps.length) {
      // 全部完成
      state.active = false;
      if (state.onComplete) {
        state.onComplete();
      }
    } else {
      // 进入下一步
      state.startTime = Date.now();
      state.duration = state.steps[state.currentIndex].duration || 600;
      state.progress = 0;
      this._ensureAnimLoop();
    }
    this.forceRender = true;
  }

  /**
   * 停止提示动画
   */
  stopHintAnimation() {
    const state = this._hintAnimState;
    if (!state.active) return;
    state.active = false;
    state.steps = [];
    state.currentIndex = 0;
    state.progress = 0;
    state.onStepComplete = null;
    state.onComplete = null;
    this.forceRender = true;
  }

  /**
   * 是否正在播放提示动画
   * @returns {boolean}
   */
  isHintAnimating() {
    return this._hintAnimState.active;
  }

  // ==================== LessonPlayer 教学高亮系统 ====================

  /**
   * 设置教学高亮行
   * @param {number} row - 行索引
   * @param {boolean} enabled - 是否启用
   */
  setHighlightRow(row, enabled) {
    if (enabled) {
      this._lessonHighlights.rows.add(row);
    } else {
      this._lessonHighlights.rows.delete(row);
    }
    this.forceRender = true;
  }

  /**
   * 设置教学高亮列
   */
  setHighlightCol(col, enabled) {
    if (enabled) {
      this._lessonHighlights.cols.add(col);
    } else {
      this._lessonHighlights.cols.delete(col);
    }
    this.forceRender = true;
  }

  /**
   * 设置教学高亮宫
   */
  setHighlightBox(box, enabled) {
    if (enabled) {
      this._lessonHighlights.boxes.add(box);
    } else {
      this._lessonHighlights.boxes.delete(box);
    }
    this.forceRender = true;
  }

  /**
   * 设置教学高亮笼子
   */
  setHighlightCage(cageId, enabled) {
    if (enabled) {
      this._lessonHighlights.cages.add(String(cageId));
    } else {
      this._lessonHighlights.cages.delete(String(cageId));
    }
    this.forceRender = true;
  }

  /**
   * 设置教学高亮格子
   * @param {number} r
   * @param {number} c
   * @param {boolean} enabled
   * @param {string} mode - 'normal' | 'pulse' | 'success' | 'shake'
   */
  setHighlightCell(r, c, enabled, mode = 'normal') {
    const key = r + ',' + c;
    if (enabled) {
      this._lessonHighlights.cells.set(key, { r, c, mode, startTime: Date.now() });
    } else {
      this._lessonHighlights.cells.delete(key);
    }
    this.forceRender = true;
  }

  /**
   * 触发某格抖动（错误反馈）
   */
  shakeCell(r, c) {
    const key = r + ',' + c;
    this._lessonHighlights.shakes.set(key, { r, c, startTime: Date.now() });
    this.forceRender = true;
  }

  /**
   * 设置聚光灯模式
   * @param {boolean} enabled - 是否启用聚光灯
   * @param {number} [intensity=0.45] - 暗度 0~1
   */
  setSpotlight(enabled, intensity = 0.45) {
    this._lessonHighlights.spotlight = enabled;
    this._lessonHighlights.spotlightIntensity = intensity;
    this.forceRender = true;
  }

  /**
   * 冻结指定格子（不可交互+灰色遮罩）
   * @param {number} r
   * @param {number} c
   * @param {boolean} frozen
   */
  setCellFrozen(r, c, frozen) {
    const key = r + ',' + c;
    if (frozen) {
      this._lessonHighlights.freezeCells.add(key);
    } else {
      this._lessonHighlights.freezeCells.delete(key);
    }
    this.forceRender = true;
  }

  /**
   * 设置全局冻结（除了高亮区域外全部冻结）
   * @param {boolean} frozen
   */
  setFreezeAll(frozen) {
    this._lessonHighlights.freezeAll = frozen;
    this.forceRender = true;
  }

  /**
   * 设置高亮数字（连填模式下高亮所有相同数字）
   * @param {number|null} num - 要高亮的数字，null 表示清除
   * @param {boolean} enabled - 是否启用
   */
  setHighlightNumber(num, enabled) {
    if (enabled && num !== null && num !== undefined) {
      this._lessonHighlights.highlightNumber = num;
    } else {
      this._lessonHighlights.highlightNumber = null;
    }
    this.forceRender = true;
  }

  /**
   * 清除所有教学高亮
   */
  clearAllLessonHighlights() {
    this._lessonHighlights.rows.clear();
    this._lessonHighlights.cols.clear();
    this._lessonHighlights.boxes.clear();
    this._lessonHighlights.cages.clear();
    this._lessonHighlights.cells.clear();
    this._lessonHighlights.shakes.clear();
    this._lessonHighlights.spotlight = false;
    this._lessonHighlights.freezeCells.clear();
    this._lessonHighlights.freezeAll = false;
    this._lessonHighlights.highlightNumber = null;
    this.forceRender = true;
  }

  // ==================== 教学高亮绘制 ====================

  _drawLessonHighlights(board) {
    if (!this._lessonHighlights) return;
    const lh = this._lessonHighlights;
    const hasAny = lh.rows.size > 0 || lh.cols.size > 0 || lh.boxes.size > 0
      || lh.cages.size > 0 || lh.cells.size > 0 || lh.shakes.size > 0
      || lh.highlightNumber !== null;
    if (!hasAny) return;

    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const now = Date.now();

    // 0. 数字高亮（连填模式下高亮所有相同数字的格子）
    if (lh.highlightNumber !== null) {
      const num = lh.highlightNumber;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board.cells[r][c];
          if (cell.fillNum === num || cell.fixedNum === num) {
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    // 1. 行高亮（半透明底色）
    if (lh.rows.size > 0) {
      ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
      lh.rows.forEach(r => {
        if (r >= 0 && r < size) {
          ctx.fillRect(0, r * cellSize, size * cellSize, cellSize);
        }
      });
    }

    // 2. 列高亮
    if (lh.cols.size > 0) {
      ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
      lh.cols.forEach(c => {
        if (c >= 0 && c < size) {
          ctx.fillRect(c * cellSize, 0, cellSize, size * cellSize);
        }
      });
    }

    // 3. 宫高亮
    if (lh.boxes.size > 0) {
      const boxSize = Math.sqrt(size);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
      ctx.lineWidth = 2;
      lh.boxes.forEach(box => {
        const br = Math.floor(box / boxSize);
        const bc = box % boxSize;
        const x = bc * boxSize * cellSize;
        const y = br * boxSize * cellSize;
        const w = boxSize * cellSize;
        const h = boxSize * cellSize;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      });
    }

    // 4. 笼子高亮（描边+底色）
    if (lh.cages.size > 0 && board.cages) {
      for (const cage of board.cages) {
        if (lh.cages.has(String(cage.id))) {
          ctx.fillStyle = 'rgba(139, 92, 246, 0.18)';
          for (const cell of cage.cells) {
            ctx.fillRect(cell.c * cellSize, cell.r * cellSize, cellSize, cellSize);
          }
          // 描边
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.6)';
          ctx.lineWidth = 2.5;
          this._strokeCageBorder(ctx, cage, cellSize);
        }
      }
    }

    // 5. 格子高亮（聚光灯/脉冲）
    if (lh.cells.size > 0) {
      lh.cells.forEach((cell, key) => {
        const { r, c, mode, startTime } = cell;
        if (r < 0 || r >= size || c < 0 || c >= size) return;
        const elapsed = now - startTime;

        let opacity = 1;
        let scale = 1;
        let color = 'rgba(16, 185, 129, 0.9)';
        let lineWidth = 3;

        if (mode === 'pulse') {
          // 脉冲动画
          const pulse = Math.sin(elapsed / 300 * Math.PI) * 0.5 + 0.5;
          opacity = 0.5 + pulse * 0.5;
          lineWidth = 2 + pulse * 2;
          color = `rgba(251, 191, 36, ${opacity})`;
          // 外发光
          ctx.save();
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 8 + pulse * 8;
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.strokeRect(c * cellSize + 3, r * cellSize + 3, cellSize - 6, cellSize - 6);
          ctx.restore();
        } else if (mode === 'success') {
          color = 'rgba(16, 185, 129, 0.8)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
          // 底色
          ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        } else {
          // normal
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
        }
      });
    }

    // 6. 抖动效果
    if (lh.shakes.size > 0) {
      lh.shakes.forEach((shake, key) => {
        const { r, c, startTime } = shake;
        const elapsed = now - startTime;
        if (elapsed > 500) {
          lh.shakes.delete(key);
          return;
        }
        const progress = elapsed / 500;
        const shakeOffset = Math.sin(progress * Math.PI * 8) * 4 * (1 - progress);

        // 红色边框 + 水平抖动
        ctx.save();
        ctx.translate(shakeOffset, 0);
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.9 * (1 - progress)})`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
        ctx.restore();
      });
      if (lh.shakes.size > 0) {
        this.forceRender = true;
      }
    }

    // 7. 聚光灯遮罩（非高亮区域变暗）
    if (lh.spotlight) {
      const boardW = size * cellSize;
      const boardH = size * cellSize;
      const intensity = lh.spotlightIntensity;

      // 收集所有"亮区"格子（rows + cols + boxes + cages + cells 并集）
      const brightCells = new Set();

      // 行
      lh.rows.forEach(r => {
        for (let c = 0; c < size; c++) brightCells.add(r + ',' + c);
      });
      // 列
      lh.cols.forEach(c => {
        for (let r = 0; r < size; r++) brightCells.add(r + ',' + c);
      });
      // 宫
      if (lh.boxes.size > 0) {
        const boxSize = Math.floor(Math.sqrt(size));
        lh.boxes.forEach(box => {
          const br = Math.floor(box / boxSize);
          const bc = box % boxSize;
          for (let r = br * boxSize; r < (br + 1) * boxSize; r++) {
            for (let c = bc * boxSize; c < (bc + 1) * boxSize; c++) {
              brightCells.add(r + ',' + c);
            }
          }
        });
      }
      // 笼子
      if (lh.cages.size > 0 && board.cages) {
        for (const cage of board.cages) {
          if (lh.cages.has(String(cage.id))) {
            for (const cell of cage.cells) {
              brightCells.add(cell.r + ',' + cell.c);
            }
          }
        }
      }
      // 单格
      lh.cells.forEach((cell, key) => {
        brightCells.add(key);
      });

      // 如果没有亮区，就不画遮罩
      if (brightCells.size > 0 && brightCells.size < size * size) {
        // 先画全屏暗色
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${intensity})`;
        ctx.fillRect(0, 0, boardW, boardH);

        // 用 destination-out 挖亮亮区
        ctx.globalCompositeOperation = 'destination-out';
        brightCells.forEach(key => {
          const [r, c] = key.split(',').map(Number);
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        });
        ctx.restore();
      }
    }

    // 8. 冻结遮罩
    if (lh.freezeAll || lh.freezeCells.size > 0) {
      const brightCells = new Set();
      // 聚光灯亮区不算冻结
      if (lh.freezeAll && lh.spotlight) {
        lh.rows.forEach(r => {
          for (let c = 0; c < size; c++) brightCells.add(r + ',' + c);
        });
        lh.cols.forEach(c => {
          for (let r = 0; r < size; r++) brightCells.add(r + ',' + c);
        });
        if (lh.boxes.size > 0) {
          const boxSize = Math.floor(Math.sqrt(size));
          lh.boxes.forEach(box => {
            const br = Math.floor(box / boxSize);
            const bc = box % boxSize;
            for (let r = br * boxSize; r < (br + 1) * boxSize; r++) {
              for (let c = bc * boxSize; c < (bc + 1) * boxSize; c++) {
                brightCells.add(r + ',' + c);
              }
            }
          });
        }
        if (lh.cages.size > 0 && board.cages) {
          for (const cage of board.cages) {
            if (lh.cages.has(String(cage.id))) {
              for (const cell of cage.cells) {
                brightCells.add(cell.r + ',' + cell.c);
              }
            }
          }
        }
        lh.cells.forEach((cell, key) => brightCells.add(key));
      }

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const key = r + ',' + c;
          const isFrozen = lh.freezeAll
            ? !brightCells.has(key)
            : lh.freezeCells.has(key);
          if (isFrozen) {
            ctx.fillStyle = 'rgba(30, 30, 40, 0.35)';
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
      }
    }
  }

  /**
   * 辅助：描边笼子边界（只画外边框）
   */
  _strokeCageBorder(ctx, cage, cellSize) {
    const cellSet = new Set(cage.cells.map(c => c.r + ',' + c.c));
    for (const cell of cage.cells) {
      const { r, c } = cell;
      const x = c * cellSize;
      const y = r * cellSize;
      // 上
      if (!cellSet.has((r - 1) + ',' + c)) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellSize, y);
        ctx.stroke();
      }
      // 下
      if (!cellSet.has((r + 1) + ',' + c)) {
        ctx.beginPath();
        ctx.moveTo(x, y + cellSize);
        ctx.lineTo(x + cellSize, y + cellSize);
        ctx.stroke();
      }
      // 左
      if (!cellSet.has(r + ',' + (c - 1))) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cellSize);
        ctx.stroke();
      }
      // 右
      if (!cellSet.has(r + ',' + (c + 1))) {
        ctx.beginPath();
        ctx.moveTo(x + cellSize, y);
        ctx.lineTo(x + cellSize, y + cellSize);
        ctx.stroke();
      }
    }
  }

  /**
   * 触发某格的填数动画（淡入 + 微缩放）
   * @param {number} r - 行号
   * @param {number} c - 列号
   * @param {number} duration - 动画时长（毫秒），默认 200ms
   */
  triggerFillAnimation(r, c, duration = 200) {
    if (!this._fillAnimationEnabled) return;
    const key = `${r},${c}`;
    this._fillAnimations.set(key, {
      startTime: Date.now(),
      duration: duration,
    });
    this.forceRender = true;
  }

  /**
   * 启用/禁用填数动画
   * @param {boolean} enabled
   */
  setFillAnimationEnabled(enabled) {
    this._fillAnimationEnabled = enabled;
    if (!enabled) {
      this._fillAnimations.clear();
    }
  }

  /**
   * 计算某格填数动画的当前进度（0~1，1表示完成）
   * @param {number} r
   * @param {number} c
   * @returns {number} 0~1
   * @private
   */
  _getFillAnimProgress(r, c) {
    const key = `${r},${c}`;
    const anim = this._fillAnimations.get(key);
    if (!anim) return 1;
    const elapsed = Date.now() - anim.startTime;
    const progress = Math.min(1, elapsed / anim.duration);
    if (progress >= 1) {
      this._fillAnimations.delete(key);
    }
    return progress;
  }

  /**
   * 确保动画循环正在运行
   * @private
   */
  _ensureAnimLoop() {
    if (!this._animFrameId) {
      this._animFrameId = requestAnimationFrame(() => {
        this._animFrameId = null;
        if (this._currentBoard) {
          this.render(this._currentBoard);
        }
      });
    }
  }

  /**
   * 停止动画循环
   * @private
   */
  _stopAnimLoop() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  /**
   * 设置笔记系统引用（替代全局 window.gameNoteSystem）
   * @param {NoteSystem|null} noteSystem
   */
  setNoteSystem(noteSystem) {
    this._noteSystem = noteSystem || null;
  }

  /**
   * 设置Boss战系统
   * @param {boolean} active - 是否激活Boss战
   * @param {object} battle - GuideBattle实例
   */
  setBossBattle(active, battle) {
    this._bossBattleActive = active;
    this._bossBattle = battle || null;
    // 兼容旧的 _battleActive / _battleCtx 接口
    this._battleActive = active;
    if (active && battle) {
      this._battleCtx = {
        playerOwned: battle.playerOwned,
        fixedMask: null,
      };
    } else {
      this._battleCtx = null;
    }
    // 重置观局高亮
    this._guanJuHighlights = null;
    // 重置红格预警
    this._gateAlertCells.clear();
  }

  /**
   * 触发红格（gate 分类）预警闪烁
   * 只在 Boss 战中生效，用于提醒玩家这是胜负手格子
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} [duration=1500] - 持续时间（毫秒）
   */
  triggerGateAlert(r, c, duration = 1500) {
    if (!this._bossBattleActive) return;
    const key = `${r},${c}`;
    this._gateAlertCells.set(key, {
      startTime: Date.now(),
      duration: duration,
    });
    this._ensureAnimLoop();
  }

  /**
   * 清除红格预警
   * @param {number} r - 行
   * @param {number} c - 列
   */
  clearGateAlert(r, c) {
    const key = `${r},${c}`;
    this._gateAlertCells.delete(key);
  }

  /**
   * 清除所有红格预警
   */
  clearAllGateAlerts() {
    this._gateAlertCells.clear();
  }

  /**
   * 设置「观局」高亮格子（阿妍必杀技效果）
   * @param {Array<Object>} targets - [{row, col, num}]
   */
  setGuanJuHighlight(targets) {
    this._guanJuHighlights = targets || null;
    if (this._board) {
      this.render(this._board);
    }
  }

  /**
   * 清除「观局」高亮
   */
  clearGuanJuHighlight() {
    this._guanJuHighlights = null;
    if (this._board) {
      this.render(this._board);
    }
  }

  // ======================================================
  //  第1章：机关锁格 视觉渲染
  // ======================================================

  /**
   * 触发单个机关锁解锁动画
   * @param {string} cageId - 笼子ID
   */
  triggerLockRelease(cageId) {
    this._lockReleases.set(cageId, {
      startTime: Date.now(),
      phase: 0,
    });
    this.forceRender = true;
    // 播放齿轮粒子
    const board = this._board;
    if (board && board.cages) {
      const cage = board.cages.find(c => c.id === cageId);
      if (cage && cage.cells && cage.cells.length > 0) {
        const [r, c] = cage.cells[0];
        if (typeof this.emitParticles === 'function') {
          this.emitParticles(c, r, 'gear', 12);
        }
      }
    }
  }

  /**
   * 触发三锁齐开（石门打开）
   */
  triggerAllLocksOpen() {
    this._allLocksOpen = true;
    this._allLocksOpenTime = Date.now();
    this.forceRender = true;
  }

  /**
   * 绘制机关锁的视觉效果
   * @private
   */
  _drawLockIndicator(ctx, cage, cellSize) {
    const lockStates = this._bossBattle && this._bossBattle.getLockStates
      ? this._bossBattle.getLockStates()
      : null;
    if (!lockStates) return false;

    const lockState = lockStates.get(cage.id);
    if (!lockState) return false;

    const firstCell = cage.cells[0];
    if (!firstCell) return false;
    const [r, c] = firstCell;
    const x = c * cellSize;
    const y = r * cellSize;
    const now = Date.now();

    if (lockState.released) {
      // 已解锁：齿轮旋转 + 金色光晕
      const release = this._lockReleases.get(cage.id);
      const elapsed = release ? now - release.startTime : 9999;
      const progress = Math.min(1, elapsed / 800);

      // 金色发光边框
      ctx.save();
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 8 * (0.3 + 0.4 * progress);
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.6 + 0.4 * progress})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      ctx.restore();

      // 齿轮图标
      const gearSize = cellSize * 0.28;
      const gearX = x + cellSize * 0.18;
      const gearY = y + cellSize * 0.18;
      const rotation = progress * Math.PI * 2;

      ctx.save();
      ctx.translate(gearX, gearY);
      ctx.rotate(rotation);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const r2 = i % 2 === 0 ? gearSize / 2 : gearSize / 3;
        const px = Math.cos(angle) * r2;
        const py = Math.sin(angle) * r2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      return true;
    } else {
      // 未解锁：小锁图标
      const lockSize = cellSize * 0.24;
      const lockX = x + cellSize * 0.2;
      const lockY = y + cellSize * 0.18;

      ctx.save();
      // 锁身
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.fillRect(lockX - lockSize/3, lockY, lockSize * 0.66, lockSize * 0.6);
      // 锁梁
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lockX, lockY, lockSize/3, Math.PI, 0, false);
      ctx.stroke();
      ctx.restore();

      return true;
    }
  }

  /**
   * 触发幻影格证伪成功（碎裂动画）
   */
  triggerFakeCellExpose(r, c) {
    const key = r + ',' + c;
    this._fakeCellExposures.set(key, {
      startTime: Date.now(),
      phase: 0,
    });
    this.forceRender = true;
    // 碎裂粒子
    if (typeof this.emitParticles === 'function') {
      this.emitParticles(c, r, 'shard', 16);
    }
  }

  /**
   * 触发幻影格证伪失败（抖动+红光）
   */
  triggerFakeCellFail(r, c) {
    const key = r + ',' + c;
    this._fakeCellFails.set(key, {
      startTime: Date.now(),
      phase: 0,
    });
    this.forceRender = true;
  }

  // ======================================================
  //  第4章：联动锁 视觉渲染
  // ======================================================

  /**
   * 触发联动锁进入待激活状态（条件已满足，等待同步释放）
   * @param {string} lockId - 锁ID
   */
  triggerRegionLockPrimed(lockId) {
    this._regionLockEffects.set(lockId, {
      startTime: Date.now(),
      phase: 'primed',
    });
    this.forceRender = true;
  }

  /**
   * 触发联动锁释放
   * @param {string} lockId - 锁ID
   */
  triggerRegionLockRelease(lockId) {
    const existing = this._regionLockEffects.get(lockId);
    this._regionLockEffects.set(lockId, {
      startTime: Date.now(),
      phase: 'released',
      prevPhase: existing ? existing.phase : null,
    });
    this.forceRender = true;
  }

  /**
   * 触发所有联动锁同步释放
   */
  triggerAllRegionLocksReleased() {
    const now = Date.now();
    for (const [lockId, effect] of this._regionLockEffects) {
      this._regionLockEffects.set(lockId, {
        startTime: now,
        phase: 'released',
        prevPhase: effect.phase,
      });
    }
    this.forceRender = true;
  }

  /**
   * 触发笔记浮现效果（联动锁释放后揭示候选数）
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {Array<number>} notes - 浮现的候选数数组
   */
  triggerNoteReveal(r, c, notes) {
    const key = r + ',' + c;
    this._revealedNotes.set(key, {
      notes: notes || [],
      startTime: Date.now(),
    });
    this.forceRender = true;
  }

  /**
   * 绘制联动锁视觉效果
   * locked：淡蓝色边框微闪
   * primed：金色呼吸灯快速闪烁
   * released：碎裂消失 + 金色光晕扩散
   * @private
   */
  _drawRegionLocks(ctx, cellSize) {
    const bossBattle = this._bossBattle;
    if (!bossBattle || typeof bossBattle.getRegionLockStates !== 'function') return;

    const lockStates = bossBattle.getRegionLockStates();
    if (!lockStates) return;

    // 统一转换为 [lockId, lockState] 数组进行迭代
    // 支持 Map、普通对象、数组三种格式
    let entries;
    if (lockStates instanceof Map) {
      if (lockStates.size === 0) return;
      entries = Array.from(lockStates.entries());
    } else if (Array.isArray(lockStates)) {
      if (lockStates.length === 0) return;
      entries = lockStates;
    } else if (typeof lockStates === 'object') {
      const keys = Object.keys(lockStates);
      if (keys.length === 0) return;
      entries = keys.map(k => [k, lockStates[k]]);
    } else {
      return;
    }

    const now = Date.now();
    const board = this._currentBoard;
    if (!board) return;

    // 构建笼子ID到cage对象的映射
    const cageMap = new Map();
    if (board.cages) {
      for (const cage of board.cages) {
        cageMap.set(cage.id, cage);
      }
    }

    for (const [lockId, lockState] of entries) {
      const cage = cageMap.get(lockId);
      if (!cage || !cage.cells || cage.cells.length === 0) continue;

      const effect = this._regionLockEffects.get(lockId);
      const phase = effect ? effect.phase : (lockState.released ? 'released' : 'locked');
      const startTime = effect ? effect.startTime : now;
      const elapsed = now - startTime;

      // 计算每个锁覆盖的格子的边界
      let minR = 99, minC = 99, maxR = -1, maxC = -1;
      for (const [r, c] of cage.cells) {
        if (r < minR) minR = r;
        if (c < minC) minC = c;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
      const x = minC * cellSize;
      const y = minR * cellSize;
      const w = (maxC - minC + 1) * cellSize;
      const h = (maxR - minR + 1) * cellSize;

      if (phase === 'locked') {
        // 普通锁定：淡蓝色边框微闪
        const pulse = 0.5 + 0.3 * Math.sin(now / 1200);
        ctx.save();
        ctx.strokeStyle = `rgba(96, 165, 250, ${0.4 + 0.2 * pulse})`;
        ctx.lineWidth = Math.max(2, cellSize * 0.06);
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.restore();

      } else if (phase === 'primed') {
        // 待激活：金色呼吸灯快速闪烁
        const breath = 0.5 + 0.5 * Math.sin(elapsed / 150);
        const glowIntensity = 0.4 + 0.6 * breath;

        ctx.save();
        // 外发光
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 12 * glowIntensity;
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.6 + 0.4 * breath})`;
        ctx.lineWidth = Math.max(2.5, cellSize * 0.08);
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

        // 内层高亮
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(253, 224, 71, ${0.3 + 0.3 * breath})`;
        ctx.lineWidth = Math.max(1, cellSize * 0.03);
        ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
        ctx.restore();

      } else if (phase === 'released') {
        // 已释放：碎裂消失 + 金色光晕扩散
        const progress = Math.min(1, elapsed / 900);
        if (progress >= 1) {
          this._regionLockEffects.delete(lockId);
          continue;
        }

        const easeOut = 1 - Math.pow(1 - progress, 3);

        ctx.save();
        // 金色光晕扩散
        const glowSize = easeOut * cellSize * 0.8;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = glowSize;
        ctx.strokeStyle = `rgba(251, 191, 36, ${(1 - progress) * 0.8})`;
        ctx.lineWidth = Math.max(3, cellSize * 0.1) * (1 - progress * 0.5);
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

        // 碎裂效果：多段虚线向外扩散
        ctx.shadowBlur = 0;
        const shardCount = 8;
        ctx.strokeStyle = `rgba(253, 224, 71, ${(1 - progress) * 0.6})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < shardCount; i++) {
          const angle = (i / shardCount) * Math.PI * 2;
          const dist = easeOut * cellSize * 0.5;
          const sx = x + w / 2 + Math.cos(angle) * (w * 0.3 + dist);
          const sy = y + h / 2 + Math.sin(angle) * (h * 0.3 + dist);
          const len = cellSize * 0.15 * (1 - progress);
          ctx.beginPath();
          ctx.moveTo(sx - len / 2, sy);
          ctx.lineTo(sx + len / 2, sy);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  /**
   * 绘制浮现的笔记（联动锁释放后揭示候选数）
   * 从中心扩散出现的动画，金色/青色发光效果
   * @private
   */
  _drawRevealedNotes(ctx, board, cellSize) {
    if (this._revealedNotes.size === 0) return;

    const now = Date.now();
    const size = board.size;
    const { boxW, boxH } = this.getBoxSize(size);

    const paddingTop = Math.max(6, cellSize * 0.22);
    const paddingLeft = Math.max(5, cellSize * 0.12);
    const paddingBottom = 2;
    const paddingRight = 2;
    const availW = cellSize - paddingLeft - paddingRight;
    const availH = cellSize - paddingTop - paddingBottom;
    const subW = availW / boxW;
    const subH = availH / boxH;

    const fontSize = Math.max(9, Math.floor(cellSize * 0.3));

    const toDelete = [];

    for (const [key, reveal] of this._revealedNotes) {
      const [r, c] = key.split(',').map(Number);
      const elapsed = now - reveal.startTime;
      const totalDuration = 1200;

      if (elapsed > totalDuration) {
        toDelete.push(key);
        continue;
      }

      // 动画进度：0~1 扩散出现，之后保持显示
      const appearProgress = Math.min(1, elapsed / 400);
      const appearEase = 1 - Math.pow(1 - appearProgress, 2);
      const scale = 0.5 + 0.5 * appearEase;

      // 发光强度
      const glowPulse = 0.6 + 0.4 * Math.sin(elapsed / 300);
      const glowIntensity = appearEase * glowPulse;

      const cx = c * cellSize + cellSize / 2;
      const cy = r * cellSize + cellSize / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;

      // 发光效果
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 8 * glowIntensity;
      ctx.fillStyle = `rgba(34, 211, 238, ${0.85 * appearEase})`;

      for (const num of reveal.notes) {
        const subR = Math.floor((num - 1) / boxW);
        const subC = (num - 1) % boxW;
        const baseX = c * cellSize + paddingLeft + subC * subW + subW / 2;
        const baseY = r * cellSize + paddingTop + subR * subH + subH / 2;

        // 从中心扩散：根据进度向目标位置移动
        const x = cx + (baseX - cx) * appearEase;
        const y = cy + (baseY - cy) * appearEase;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillText(num, 0, 0);
        ctx.restore();
      }

      // 中心扩散圆环
      if (appearProgress < 1) {
        ctx.strokeStyle = `rgba(34, 211, 238, ${(1 - appearProgress) * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.1 + appearEase * cellSize * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 清理已完成的动画
    for (const key of toDelete) {
      this._revealedNotes.delete(key);
    }
  }

  // ======================================================
  //  第5章：嵌套笼坍缩 视觉渲染
  // ======================================================

  /**
   * 触发嵌套笼坍缩阶段变化
   * 阶段0：正常显示
   * 阶段1：开始收缩，边框向内收缩，透明度降低，和值显示"？？"
   * 阶段2：和值模糊显现
   * 阶段3：完全坍缩，边框消失
   * @param {number} stageIndex - 坍缩阶段 (0~3)
   */
  triggerCollapseStage(stageIndex) {
    this._collapseActive = true;
    this._collapseStage = stageIndex;
    const now = Date.now();

    const board = this._currentBoard;
    if (board && board.cages) {
      // 找出外层笼（深度为0的笼子）
      const { cageDepths } = this._computeCageDepths(board.cages, board.levelId || 'collapse');
      for (const [cageId, depth] of cageDepths) {
        if (depth === 0) {
          const existing = this._collapseAnimations.get(cageId);
          this._collapseAnimations.set(cageId, {
            startTime: now,
            stage: stageIndex,
            prevStage: existing ? existing.stage : 0,
          });
        }
      }
    }

    this.forceRender = true;
  }

  /**
   * 获取笼子坍缩透明度（供笼子渲染时调用）
   * @param {string} cageId - 笼子ID
   * @param {number} depth - 笼子嵌套深度
   * @returns {number} 透明度 (0~1)
   */
  getCollapseCageOpacity(cageId, depth) {
    if (!this._collapseActive) return 1;

    const anim = this._collapseAnimations.get(cageId);
    const stage = anim ? anim.stage : this._collapseStage;
    const startTime = anim ? anim.startTime : Date.now();
    const elapsed = Date.now() - startTime;
    const duration = 800;
    const progress = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - progress, 2);

    // 内层笼（depth > 0）在坍缩后变得更清晰明亮
    if (depth > 0) {
      if (stage >= 3) {
        // 完全坍缩后内层笼亮度提升
        return 1 + 0.15 * ease;
      }
      return 1;
    }

    // 外层笼：根据阶段调整透明度
    switch (stage) {
      case 0:
        return 1;
      case 1:
        // 阶段1：透明度降低到0.7
        return 1 - 0.3 * ease;
      case 2:
        // 阶段2：透明度降低到0.4
        return 0.7 - 0.3 * ease;
      case 3:
        // 阶段3：完全透明
        return 0.4 * (1 - ease);
      default:
        return 1;
    }
  }

  /**
   * 获取笼子坍缩的边框收缩量（inset增加值）
   * @param {string} cageId - 笼子ID
   * @returns {number} 收缩像素量
   */
  getCollapseCageInset(cageId) {
    if (!this._collapseActive) return 0;

    const anim = this._collapseAnimations.get(cageId);
    const stage = anim ? anim.stage : this._collapseStage;
    const startTime = anim ? anim.startTime : Date.now();
    const elapsed = Date.now() - startTime;
    const duration = 800;
    const progress = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - progress, 2);

    // 仅外层笼收缩
    if (!this._collapseAnimations.has(cageId)) return 0;

    switch (stage) {
      case 0:
        return 0;
      case 1:
        return 3 * ease;
      case 2:
        return 3 + 5 * ease;
      case 3:
        return 8 + 10 * ease;
      default:
        return 0;
    }
  }

  /**
   * 获取坍缩阶段的和值显示文本
   * @param {string} cageId - 笼子ID
   * @param {number} originalSum - 原始和值
   * @returns {string|number} 显示的和值文本
   */
  getCollapseSumText(cageId, originalSum) {
    if (!this._collapseActive) return originalSum;

    const anim = this._collapseAnimations.get(cageId);
    if (!anim) return originalSum;

    const stage = anim.stage;
    const startTime = anim.startTime;
    const elapsed = Date.now() - startTime;
    const duration = 800;
    const progress = Math.min(1, elapsed / duration);

    switch (stage) {
      case 1:
        // 阶段1：和值显示"？？"
        return '？？';
      case 2: {
        // 阶段2：和值模糊显现
        if (progress < 0.5) {
          return '？？';
        }
        return originalSum;
      }
      case 3:
        // 阶段3：和值消失
        return '';
      default:
        return originalSum;
    }
  }

  /**
   * 绘制嵌套笼坍缩特效
   * 粒子效果：笼子边框碎片向内坍缩
   * 光晕效果：内层笼在坍缩后发出光芒
   * @private
   */
  _drawCollapseEffects(ctx, cellSize) {
    if (!this._collapseActive || this._collapseAnimations.size === 0) return;

    const now = Date.now();
    const board = this._currentBoard;
    if (!board || !board.cages) return;

    const { cageDepths, cageCellSets } = this._computeCageDepths(
      board.cages, board.levelId || 'collapse'
    );

    for (const [cageId, anim] of this._collapseAnimations) {
      const cellSet = cageCellSets.get(cageId);
      if (!cellSet) continue;

      const depth = cageDepths.get(cageId) || 0;
      if (depth > 0) continue; // 只处理外层笼

      const stage = anim.stage;
      if (stage === 0) continue;

      const elapsed = now - anim.startTime;
      const duration = 800;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 2);

      // 计算笼子边界
      let minR = 99, minC = 99, maxR = -1, maxC = -1;
      for (const key of cellSet) {
        const [r, c] = key.split(',').map(Number);
        if (r < minR) minR = r;
        if (c < minC) minC = c;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
      const cx = (minC + maxC + 1) / 2 * cellSize;
      const cy = (minR + maxR + 1) / 2 * cellSize;
      const w = (maxC - minC + 1) * cellSize;
      const h = (maxR - minR + 1) * cellSize;

      ctx.save();

      if (stage === 1 || stage === 2) {
        // 收缩阶段：向内坍缩的粒子碎片
        const particleCount = 12;
        for (let i = 0; i < particleCount; i++) {
          const angle = (i / particleCount) * Math.PI * 2;
          // 粒子从边缘向中心移动
          const startDist = Math.min(w, h) * 0.4;
          const currentDist = startDist * (1 - ease * 0.6);
          const px = cx + Math.cos(angle) * currentDist;
          const py = cy + Math.sin(angle) * currentDist;

          const alpha = (1 - ease) * 0.6;
          const size = cellSize * 0.06 * (1 - ease * 0.5);

          ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (stage === 3) {
        // 完全坍缩阶段：中心光点 + 扩散的光晕
        const glowSize = ease * cellSize * 1.5;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = glowSize;
        ctx.fillStyle = `rgba(251, 191, 36, ${(1 - ease) * 0.8})`;
        ctx.beginPath();
        ctx.arc(cx, cy, cellSize * 0.2 * (1 - ease * 0.5), 0, Math.PI * 2);
        ctx.fill();

        // 内层笼光晕（坍缩后释放光芒）
        if (progress > 0.5) {
          const innerGlow = (progress - 0.5) * 2;
          ctx.shadowBlur = innerGlow * cellSize * 2;
          ctx.strokeStyle = `rgba(251, 191, 36, ${innerGlow * 0.4})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(
            minC * cellSize + cellSize * 0.2,
            minR * cellSize + cellSize * 0.2,
            w - cellSize * 0.4,
            h - cellSize * 0.4
          );
        }
      }

      ctx.restore();
    }

    // 动画完成后清理
    if (this._collapseStage === 3) {
      let allDone = true;
      for (const [cageId, anim] of this._collapseAnimations) {
        if (now - anim.startTime < 1200) {
          allDone = false;
          break;
        }
      }
      if (allDone) {
        // 保留状态但停止主动动画循环
        this._collapseActive = false;
      }
    }
  }

  /**
   * 绘制幻影格视觉效果
   * 未暴露的幻影格：虚框 + 轻微闪烁
   * 证伪成功：碎裂 + 真实数字浮现
   * 证伪失败：红光 + 抖动
   * @private
   */
  _drawFakeCellEffects(ctx, cellSize) {
    const bossBattle = this._bossBattle;
    if (!bossBattle || typeof bossBattle.getFakeCells !== 'function') return;

    const fakeCells = bossBattle.getFakeCells();
    if (!fakeCells || fakeCells.length === 0) return;

    const now = Date.now();

    for (const fc of fakeCells) {
      const { r, c, fakeNum, realNum, exposed } = fc;
      const x = c * cellSize;
      const y = r * cellSize;
      const key = r + ',' + c;

      if (exposed) {
        // 已暴露：碎裂后稳定状态 - 真实数字 + 金色光晕
        const exposure = this._fakeCellExposures.get(key);
        const elapsed = exposure ? now - exposure.startTime : 9999;
        const progress = Math.min(1, elapsed / 800);

        // 金色光晕
        ctx.save();
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 6 * progress;
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.5 + 0.3 * progress})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        ctx.restore();
      } else {
        // 未暴露：虚框 + 轻微闪烁（玩家看不出来哪个是幻影格）
        // 只有 Boss 战内部知道哪些是幻影格，渲染上不做区分
        // 这里只渲染证伪失败的抖动效果
        const fail = this._fakeCellFails.get(key);
        if (fail) {
          const elapsed = now - fail.startTime;
          if (elapsed > 600) {
            this._fakeCellFails.delete(key);
            continue;
          }
          const progress = elapsed / 600;
          const shake = Math.sin(progress * Math.PI * 6) * 3 * (1 - progress);

          ctx.save();
          ctx.translate(shake, 0);
          // 红色闪烁边框
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.7 * (1 - progress)})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          ctx.restore();
        }
      }
    }
  }

  /**
   * 获取笔记系统引用（优先实例引用，回退到全局）
   * @returns {NoteSystem|null}
   * @private
   */
  _getNoteSystem() {
    if (this._noteSystem) return this._noteSystem;
    if (typeof window !== 'undefined' && window.gameNoteSystem) return window.gameNoteSystem;
    return null;
  }

  _applyPageBg(chapterId) {
    // 移动端布局：使用 scenes 目录下的竖屏场景图片
    const isMobile = document.body.classList.contains('layout-mobile');
    if (isMobile) {
      const sceneBgMap = {
        1: 'assets/images/scenes/scene_entrance_portrait.jpg',
        2: 'assets/images/scenes/scene_hall_portrait.jpg',
        3: 'assets/images/scenes/scene_bookshelf_portrait.jpg',
        4: 'assets/images/scenes/scene_desk_portrait.jpg',
        5: 'assets/images/scenes/scene_deep_entrance_portrait.jpg',
        6: 'assets/images/scenes/scene_six_doors_portrait.jpg',
        7: 'assets/images/scenes/scene_secret_chamber_portrait.jpg',
        8: 'assets/images/scenes/scene_starshuttle_core_portrait.jpg',
        9: 'assets/images/scenes/scene_endgame_archive_portrait.jpg',
        10: 'assets/images/scenes/scene_hidden_farewell_portrait.jpg',
        11: 'assets/images/scenes/scene_hidden_hesitation_portrait.jpg',
        12: 'assets/images/scenes/scene_hidden_letter_portrait.jpg',
        13: 'assets/images/scenes/scene_hidden_k734_portrait.jpg',
        14: 'assets/images/scenes/scene_hidden_path_portrait.jpg',
      };
      const sceneBg = sceneBgMap[chapterId] || 'assets/images/scenes/scene_desk_portrait.jpg';
      const testImg = new Image();
      testImg.onload = function() {
        document.body.style.setProperty('background-image', `url('${sceneBg}')`, 'important');
      };
      testImg.onerror = function() {
        // 场景图加载失败，回退到原背景
        const fallback = CHAPTER_BG_IMAGES_FALLBACK[chapterId] || CHAPTER_BG_IMAGES_FALLBACK[1];
        document.body.style.setProperty('background-image', `url('${fallback}')`, 'important');
      };
      testImg.src = sceneBg;
      document.body.style.setProperty('background-size', 'cover', 'important');
      document.body.style.setProperty('background-position', 'center', 'important');
      document.body.style.setProperty('background-attachment', 'fixed', 'important');
      return;
    }

    // PC/平板端：使用原章节背景图（优先使用预加载缓存）
    const bgSrc = CHAPTER_BG_IMAGES[chapterId];
    const bgFallback = CHAPTER_BG_IMAGES_FALLBACK[chapterId];
    if (bgSrc) {
      const cachedImg = bgImageCache[chapterId];
      if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
        // 预加载已完成，直接设置背景
        document.body.style.setProperty('background-image', `url('${bgSrc}')`, 'important');
      } else if (cachedImg) {
        // 预加载中，等待加载完成
        cachedImg.onload = function() {
          document.body.style.setProperty('background-image', `url('${bgSrc}')`, 'important');
        };
        cachedImg.onerror = function() {
          document.body.style.setProperty('background-image', `url('${bgFallback}')`, 'important');
        };
      } else {
        // 无缓存，兜底加载
        const testImg = new Image();
        testImg.onload = function() {
          document.body.style.setProperty('background-image', `url('${bgSrc}')`, 'important');
        };
        testImg.onerror = function() {
          document.body.style.setProperty('background-image', `url('${bgFallback}')`, 'important');
        };
        testImg.src = bgSrc;
      }
      document.body.style.setProperty('background-size', 'cover', 'important');
      document.body.style.setProperty('background-position', 'center', 'important');
      document.body.style.setProperty('background-attachment', 'fixed', 'important');
    }
  }

  /**
   * 按关卡设置背景图（每关一张独立背景）
   * 映射规则：第1关(101)→scene3，依次递增，超过63则循环
   * @param {number|string} levelId - 关卡ID
   */
  setLevelBackground(levelId) {
    const id = parseInt(levelId) || 101;
    // 计算场景编号：从scene3开始，每关+1，scene3-scene63共61张循环使用
    // 101→3, 102→4, ... 161→63, 162→3, ...
    const totalScenes = 61; // scene3 到 scene63
    const offset = id - 101; // 101关对应偏移0
    const sceneNum = 3 + ((offset % totalScenes) + totalScenes) % totalScenes;
    const bgSrc = this._getSceneBgPath(sceneNum);
    
    // 设置背景
    const testImg = new Image();
    testImg.onload = function() {
      document.body.style.setProperty('background-image', `url('${bgSrc}')`, 'important');
    };
    testImg.onerror = function() {
      // 加载失败，回退到章节背景
      const chapterId = Math.floor(id / 100);
      const fallback = CHAPTER_BG_IMAGES_FALLBACK[chapterId] || CHAPTER_BG_IMAGES_FALLBACK[1];
      document.body.style.setProperty('background-image', `url('${fallback}')`, 'important');
    };
    testImg.src = bgSrc;
    document.body.style.setProperty('background-size', 'cover', 'important');
    document.body.style.setProperty('background-position', 'center', 'important');
    document.body.style.setProperty('background-attachment', 'fixed', 'important');
  }

  /**
   * 获取场景背景图的实际文件路径
   * scene1-scene12 有描述性后缀，scene13-scene63 直接编号
   * @param {number} sceneNum - 场景编号
   * @returns {string} 背景图路径
   */
  _getSceneBgPath(sceneNum) {
    const namedScenes = {
      1: 'bg_scene1_archive_gate.jpg',
      2: 'bg_scene2_archive_hall.jpg',
      3: 'bg_scene3_wooden_desk.jpg',
      4: 'bg_scene4_second_room.jpg',
      5: 'bg_scene5_third_room.jpg',
      6: 'bg_scene6_fourth_room.jpg',
      7: 'bg_scene7_fifth_room.jpg',
      8: 'bg_scene8_sixth_room.jpg',
      9: 'bg_scene9_seventh_room.jpg',
      10: 'bg_scene10_eighth_room.jpg',
      11: 'bg_scene11_ninth_room.jpg',
      12: 'bg_scene12_stairwell.jpg',
    };
    const fileName = namedScenes[sceneNum] || `bg_scene${sceneNum}.jpg`;
    return `assets/images/backgrounds/${fileName}`;
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
   * 根据棋盘尺寸和容器宽高计算合适的 cellSize
   * 同时考虑宽度和高度，取较小值以确保完整显示
   */
  recalcCellSize(board) {
    // 多重 fallback 获取可用宽度和高度
    let cssWidth = this.canvas.clientWidth;
    let cssHeight = this.canvas.clientHeight;
    if (!cssWidth || cssWidth < 10) {
      cssWidth = this.canvas.width || 0;
    }
    if (!cssHeight || cssHeight < 10) {
      cssHeight = this.canvas.height || 0;
    }
    if (!cssWidth || cssWidth < 10) {
      const container = this.canvas.parentElement;
      if (container && container.clientWidth > 10) {
        cssWidth = container.clientWidth;
      }
    }
    if (!cssHeight || cssHeight < 10) {
      const container = this.canvas.parentElement;
      if (container && container.clientHeight > 10) {
        cssHeight = container.clientHeight;
      }
    }
    if (!cssWidth || cssWidth < 10) {
      cssWidth = 400;
    }
    if (!cssHeight || cssHeight < 10) {
      cssHeight = 400;
    }
    const size = board.size;
    // 同时考虑宽高，取较小值确保棋盘完整显示且不变形
    const availableWidth = cssWidth - this.paddingLeft - this.paddingRight;
    const availableHeight = cssHeight - this.paddingTop - this.paddingBottom;
    const cellSizeByW = Math.floor(availableWidth / size);
    const cellSizeByH = Math.floor(availableHeight / size);
    this.cellSize = Math.min(cellSizeByW, cellSizeByH);
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
    try {
      this._doRender(board);
    } catch (e) {
      console.error('[Renderer] render error:', e);
      // 降级：基础渲染，保证不白屏
      try {
        this._renderFallback(board);
      } catch (e2) {
        console.error('[Renderer] fallback also failed:', e2);
      }
    }
  }

  _doRender(board) {
    this.recalcCellSize(board);
    this._currentBoard = board;

    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const canvasW = size * cellSize + this.paddingLeft + this.paddingRight;
    const canvasH = size * cellSize + this.paddingTop + this.paddingBottom;

    // 仅在尺寸/DPR变化时更新canvas尺寸（避免每帧重置状态）
    this._updateCanvasSizeRect(canvasW, canvasH);

    ctx.clearRect(0, 0, canvasW, canvasH);

    // ===== 静态层缓存（背景+网格+宫线+外边框）=====
    const staticKey = `${this.themeId}-${canvasW}x${canvasH}-${this._dpr}`;
    if (this._staticCacheKey !== staticKey || !this._staticCache) {
      this._drawStaticCache(board, canvasW, canvasH);
    }
    ctx.drawImage(this._staticCache, 0, 0, canvasW, canvasH);

    // ===== 盘面层缓存（笼子+预填数）=====
    const levelId = board.levelId || this._currentLevelId || 'unknown';
    if (board.levelId) this._currentLevelId = board.levelId;
    const boardKey = `${levelId}-${this.themeId}-${canvasW}x${canvasH}-${this._dpr}`;
    if (this._boardCacheKey !== boardKey || !this._boardCache) {
      this._drawBoardCache(board, canvasW, canvasH);
    }
    ctx.drawImage(this._boardCache, 0, 0, canvasW, canvasH);

    ctx.save();
    ctx.translate(this.paddingLeft, this.paddingTop);

    // ===== 动态层：高亮、选中、玩家数字、笔记等 =====
    this._drawHeatmap(board);
    this._drawThreeActBorders(board);
    this._drawHighlightMask(board);
    this._drawRowColBoxHighlight(board);
    this._drawCageHighlight(board);
    this._drawHoveredCageHighlight(board);
    this._drawHintRegion(board);
    this._drawHintEliminations(board);
    this._drawHintPair(board);
    this._drawSameNumberHighlight(board);
    this._drawSelectedCell(board);
    this._drawGateAlerts(board);
    this._drawSelectedCageHighlight(board);
    this._drawHintHighlight(board);
    this._drawHintAnimation(board);
    this._drawCustomHighlights(board);
    this._drawLessonHighlights(board);
    this._drawBattlePlayerOwned(board);
    // 动态笼和徽章（状态变化时覆盖绘制：satisfied / error / gate-target）
    this._drawCageSumBadgesDynamic(board);
    this._drawPlayerNumbers(board);
    this._drawLockMask(board);
    this._drawCandidates(board);
    this._drawEliminations(board);
    this._drawHintNumber(board);
    
    // 星衡法则提示高亮
    if (typeof drawRule45Highlights === 'function') {
      drawRule45Highlights(ctx, cellSize, 0, 0);
    }

    // 粒子特效（在棋盘坐标内）
    if (this._particleEnabled && this._particles.length > 0) {
      this._updateAndDrawParticles(16); // 约60fps的帧时间
    }

    // Combo 燃烧效果（棋盘边缘红光）
    this._drawComboGlow(board);

    // Boss战幻影格特效
    this._drawFakeCellEffects(ctx, cellSize);

    // 第4章：联动锁视觉效果
    this._drawRegionLocks(ctx, cellSize);

    // 第4章：浮现笔记效果
    this._drawRevealedNotes(ctx, board, cellSize);

    // 第5章：嵌套笼坍缩特效
    this._drawCollapseEffects(ctx, cellSize);

    ctx.restore();

    // 动画循环管理：如果还有活跃的填数动画或粒子，继续下一帧
    const hasActiveAnimations = this._fillAnimationEnabled && this._fillAnimations.size > 0;
    const hasParticles = this._particleEnabled && this._particles.length > 0;
    const hasFakeCellEffects = this._fakeCellExposures.size > 0 || this._fakeCellFails.size > 0;
    const hasLockEffects = this._lockReleases.size > 0;
    const hasRegionLockEffects = this._regionLockEffects.size > 0;
    const hasRevealedNotes = this._revealedNotes.size > 0;
    const hasCollapseEffects = this._collapseActive && this._collapseAnimations.size > 0;
    const hasGateAlerts = this._gateAlertCells.size > 0;
    // 三幕边框呼吸动画需要持续重绘
    const hasThreeActBorders = this._heatmapEnabled && this._threeActBordersEnabled &&
      this._threeActMode && this._threeActMode !== 'all';
    // Combo 燃烧效果需要持续重绘（呼吸动画）
    const hasComboGlow = this._comboGlowEnabled && this._comboCount >= 3;
    // 提示播放动画需要持续重绘
    const hasHintAnimation = this._hintAnimState.active;
    if (hasActiveAnimations || hasParticles || hasFakeCellEffects || hasLockEffects ||
        hasRegionLockEffects || hasRevealedNotes || hasCollapseEffects || hasGateAlerts ||
        hasThreeActBorders || hasComboGlow || hasHintAnimation) {
      this._ensureAnimLoop();
    } else {
      this._stopAnimLoop();
    }
  }

  /**
   * 降级渲染：最基础的棋盘+数字，保证不白屏
   */
  _renderFallback(board) {
    this.recalcCellSize(board);
    this._currentBoard = board;
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const canvasW = size * cellSize + this.paddingLeft + this.paddingRight;
    const canvasH = size * cellSize + this.paddingTop + this.paddingBottom;
    
    this._updateCanvasSizeRect(canvasW, canvasH);
    ctx.clearRect(0, 0, canvasW, canvasH);
    
    // 绘制基础背景
    ctx.fillStyle = theme.bgColor || '#f5f0e8';
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    ctx.save();
    ctx.translate(this.paddingLeft, this.paddingTop);
    
    // 绘制网格线
    ctx.strokeStyle = theme.gridLine || '#ccc';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, size * cellSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(size * cellSize, i * cellSize);
      ctx.stroke();
    }
    
    // 绘制宫线（粗线）
    const boxSize = this.getBoxSize(size);
    ctx.strokeStyle = theme.boxLine || theme.outerBorder || '#333';
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += boxSize.boxW) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, size * cellSize);
      ctx.stroke();
    }
    for (let i = 0; i <= size; i += boxSize.boxH) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(size * cellSize, i * cellSize);
      ctx.stroke();
    }
    
    // 绘制预填数字和玩家数字
    const fixedFontSize = Math.floor(cellSize * 0.55);
    ctx.font = `600 ${fixedFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.fixedNum > 0) {
          ctx.fillStyle = theme.fixedNum || '#333';
          ctx.fillText(cell.fixedNum, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
        } else if (cell.fillNum > 0) {
          ctx.fillStyle = theme.playerNum || '#2563eb';
          ctx.fillText(cell.fillNum, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
        }
      }
    }
    
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

    // ---- 嵌套笼分层：计算每个笼子的"深度" ----
    // 深度=被多少个其他笼子完全包含（从0开始，0是最外层）
    const cageDepths = new Map(); // cageId -> depth
    const cageCellSets = new Map(); // cageId -> Set of "r,c"

    for (const cage of board.cages) {
      const cellSet = new Set(cage.cells.map(([r, c]) => `${r},${c}`));
      cageCellSets.set(cage.id, cellSet);
    }

    for (const cage of board.cages) {
      const myCells = cageCellSets.get(cage.id);
      let depth = 0;
      for (const other of board.cages) {
        if (other.id === cage.id) continue;
        const otherCells = cageCellSets.get(other.id);
        // 如果other完全包含cage（cage的所有格子都在other里），则深度+1
        let contains = true;
        for (const cell of myCells) {
          if (!otherCells.has(cell)) { contains = false; break; }
        }
        if (contains && myCells.size < otherCells.size) depth++;
      }
      cageDepths.set(cage.id, depth);
    }

    const maxDepth = Math.max(0, ...cageDepths.values());

    // ---- 嵌套笼坍缩状态（第5章Boss战）----
    const collapseActive = this._collapseActive && this._collapseAnimations.size > 0;

    // ---- 分层绘制：从最外层画到最内层 ----
    for (let depth = 0; depth <= maxDepth; depth++) {
      const layerCages = board.cages.filter(c => cageDepths.get(c.id) === depth);

      // 不同层的样式：外层=粗虚线+主题色，内层=细实线+强调色（偏亮）
      const isInner = depth > 0;

      // Boss战中杀手数独关卡：淡化笼子虚线，降低视觉负载
      const isKillerBattle = this._bossBattleActive &&
        this._bossBattle?.opponent?.battleTuning?.fadeCagesInBattle;

      let lineWidth = isInner
        ? Math.max(1, cellSize * 0.035)
        : Math.max(1.5, cellSize * 0.055);
      let dashLen = Math.max(3, cellSize * 0.12);
      let gapLen = Math.max(2, cellSize * 0.08);
      const dashStyle = isInner ? [] : [dashLen, gapLen];
      let strokeColor = isInner ? theme.accent : theme.cageDash;
      const badgeBg = isInner ? theme.accentDark : theme.cageBadgeBg;
      const badgeText = theme.cageBadgeText;

      // 杀手数独Boss战：笼子变淡、变细
      if (isKillerBattle && !isInner) {
        lineWidth *= 0.6;  // 线宽变细
        strokeColor = this._adjustColorAlpha(strokeColor, 0.4);  // 透明度降低
      }

      // 内层笼在坍缩后变亮（第5章效果）
      if (collapseActive && isInner) {
        const innerGlow = this._collapseStage >= 3 ? 1 : 0;
        if (innerGlow > 0) {
          strokeColor = _lightenHex(strokeColor, 0.2 * innerGlow);
        }
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dashStyle);

      layerCages.forEach(cage => {
        const cellSet = cageCellSets.get(cage.id);

        let minR = size, minC = size;
        cage.cells.forEach(([r, c]) => {
          if (r < minR) { minR = r; minC = c; }
          else if (r === minR && c < minC) { minC = c; }
        });

        const anyVisible = cage.cells.some(([r, c]) => isVisible(r, c));
        if (!anyVisible) return;

        // 坍缩透明度（第5章效果）
        const collapseOpacity = collapseActive
          ? this.getCollapseCageOpacity(cage.id, depth)
          : 1;
        if (collapseOpacity <= 0) return;

        // 坍缩边框收缩量
        const collapseInset = collapseActive
          ? this.getCollapseCageInset(cage.id)
          : 0;

        // 应用坍缩透明度
        ctx.save();
        ctx.globalAlpha = collapseOpacity;

        // 绘制笼子边框
        cage.cells.forEach(([r, c]) => {
          if (!isVisible(r, c)) return;
          const x = c * cellSize + collapseInset;
          const y = r * cellSize + collapseInset;
          const edgeW = cellSize - collapseInset * 2;
          const edgeH = cellSize - collapseInset * 2;

          if (!cellSet.has(`${r - 1},${c}`) && r !== 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + edgeW, y);
            ctx.stroke();
          }
          if (!cellSet.has(`${r + 1},${c}`) && r !== size - 1) {
            ctx.beginPath();
            ctx.moveTo(x, y + edgeH);
            ctx.lineTo(x + edgeW, y + edgeH);
            ctx.stroke();
          }
          if (!cellSet.has(`${r},${c - 1}`) && c !== 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + edgeH);
            ctx.stroke();
          }
          if (!cellSet.has(`${r},${c + 1}`) && c !== size - 1) {
            ctx.beginPath();
            ctx.moveTo(x + edgeW, y);
            ctx.lineTo(x + edgeW, y + edgeH);
            ctx.stroke();
          }
        });

        // 绘制和值文字（浅色圆角徽章 + 深色字体，高对比度）
        if (isSumVisible(minR, minC)) {
          // 坍缩和值文本（第5章效果）
          let sumText = cage.hiddenSum ? '?' : String(cage.sum);
          if (collapseActive && depth === 0) {
            const collapseSum = this.getCollapseSumText(cage.id, cage.sum);
            sumText = String(collapseSum);
            if (sumText === '') {
              // 和值完全消失
              ctx.restore();
              return;
            }
          }

          ctx.setLineDash([]);
          const sumFontSize = Math.max(10, Math.floor(cellSize * 0.24));
          ctx.font = `700 ${sumFontSize}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';

          // 内层笼的和值向下偏移
          const offsetY = depth * (sumFontSize * 0.5 + 1);

          // 计算文字宽度
          const textW = ctx.measureText(sumText).width;
          const badgePadX = Math.max(3, Math.floor(cellSize * 0.06));
          const badgePadY = Math.max(2, Math.floor(cellSize * 0.03));
          const badgeW = textW + badgePadX * 2;
          const badgeH = sumFontSize + badgePadY * 2;
          const badgeRadius = Math.max(2, badgeH * 0.35);

          let badgeX, badgeY;
          if (minR === 0) {
            // 第0行笼子：放在格子内部左上角
            badgeX = minC * cellSize + 2 + collapseInset;
            badgeY = 2 + offsetY + collapseInset;
          } else {
            // 非第0行：放在笼子上边框的上方（外部）
            badgeX = minC * cellSize + 2 + collapseInset;
            badgeY = minR * cellSize - badgeH - 1 + offsetY + collapseInset;
          }

          // 徽章背景（浅色，高对比度）
          ctx.fillStyle = '#f8fafc';  // 接近白色的浅灰
          ctx.beginPath();
          const bx = badgeX;
          const by = badgeY;
          const br = badgeRadius;
          // 圆角矩形
          ctx.moveTo(bx + br, by);
          ctx.lineTo(bx + badgeW - br, by);
          ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + br);
          ctx.lineTo(bx + badgeW, by + badgeH - br);
          ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - br, by + badgeH);
          ctx.lineTo(bx + br, by + badgeH);
          ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - br);
          ctx.lineTo(bx, by + br);
          ctx.quadraticCurveTo(bx, by, bx + br, by);
          ctx.closePath();
          ctx.fill();

          // 徽章边框（淡淡的笼子同色系，增加辨识度）
          ctx.strokeStyle = badgeBg;
          ctx.lineWidth = 1;
          ctx.stroke();

          // 文字主体（深色字体，保证清晰）
          ctx.fillStyle = '#0f172a';  // 深蓝黑
          ctx.fillText(sumText, badgeX + badgePadX, badgeY + badgeH / 2);
          ctx.setLineDash(dashStyle);
        }

        ctx.restore();
      });
    }

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
    const opts = this._highlightOptions;
    // 如果行/列/宫高亮全部关闭，直接返回
    if (!opts.highlightRow && !opts.highlightCol && !opts.highlightBox) return;

    const { ctx, cellSize, theme } = this;
    const hs = board.highlightSettings;
    if (!hs) return;

    // 分别判断行/列/宫，根据选项开关控制
    const showRow = opts.highlightRow && hs.sameRow;
    const showCol = opts.highlightCol && hs.sameCol;
    const showBox = opts.highlightBox && hs.sameBox;

    if (!showRow && !showCol && !showBox) return;
    if (!board.selectedCell) return;

    const { r: selR, c: selC } = board.selectedCell;
    const size = board.size;
    const { boxW, boxH } = board.getBoxSize();
    const boxR = Math.floor(selR / boxH) * boxH;
    const boxC = Math.floor(selC / boxW) * boxW;

    const seen = new Set();
    ctx.fillStyle = theme.rowColHighlight;

    // 行高亮
    if (showRow) {
      for (let c = 0; c < size; c++) {
        if (c === selC) continue;
        const key = `${selR},${c}`;
        if (!seen.has(key)) {
          seen.add(key);
          ctx.fillRect(c * cellSize, selR * cellSize, cellSize, cellSize);
        }
      }
    }
    // 列高亮
    if (showCol) {
      for (let r = 0; r < size; r++) {
        if (r === selR) continue;
        const key = `${r},${selC}`;
        if (!seen.has(key)) {
          seen.add(key);
          ctx.fillRect(selC * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
    // 宫高亮
    if (showBox) {
      for (let r = boxR; r < boxR + boxH; r++) {
        for (let c = boxC; c < boxC + boxW; c++) {
          if (r === selR && c === selC) continue;
          const key = `${r},${c}`;
          if (!seen.has(key)) {
            seen.add(key);
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
      }
    }
  }

  // ---------- 7. 同笼高亮 ----------
  _drawCageHighlight(board) {
    if (!this._highlightOptions.highlightCage) return;
    const cells = board.getSameCageHighlightCells();
    if (cells.length === 0) return;
    const { ctx, cellSize, theme } = this;

    ctx.fillStyle = theme.cageHighlight;
    for (const { r, c } of cells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  // ---------- 7.2 笼子悬停高亮 ----------
  _drawHoveredCageHighlight(board) {
    if (!this._hoverCageEnabled) return;
    if (!this._hoveredCageId) return;
    if (!board.cages || board.cages.length === 0) return;

    // 找到悬停的笼子（排除选中的笼子，避免与选中高亮重复）
    const selectedIds = new Set();
    if (board.selectedCageIds && board.selectedCageIds.length > 0) {
      board.selectedCageIds.forEach(id => selectedIds.add(id));
    } else if (board.selectedCageId) {
      selectedIds.add(board.selectedCageId);
    }
    if (selectedIds.has(this._hoveredCageId)) return;

    const cage = board.cages.find(c => c.id === this._hoveredCageId);
    if (!cage) return;

    const { ctx, cellSize, theme } = this;
    const params = this._getCageScaleParams();
    const { inset } = params;

    // 悬停高亮：半透明底色 + 虚线边框
    ctx.fillStyle = this._hexToRgba(theme.accent, 0.06);
    for (const [r, c] of cage.cells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }

    // 悬停边框：稍深的虚线，缩进与笼子内框一致
    const cellSet = new Set(cage.cells.map(([r, c]) => `${r},${c}`));
    ctx.save();
    ctx.strokeStyle = this._hexToRgba(theme.accent, 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.lineCap = 'round';

    for (const [r, c] of cage.cells) {
      // 顶边
      if (!cellSet.has(`${r - 1},${c}`)) {
        this._drawCageEdge(ctx, 'top', r, c, inset);
      }
      // 底边
      if (!cellSet.has(`${r + 1},${c}`)) {
        this._drawCageEdge(ctx, 'bottom', r, c, inset);
      }
      // 左边
      if (!cellSet.has(`${r},${c - 1}`)) {
        this._drawCageEdge(ctx, 'left', r, c, inset);
      }
      // 右边
      if (!cellSet.has(`${r},${c + 1}`)) {
        this._drawCageEdge(ctx, 'right', r, c, inset);
      }
    }
    ctx.restore();
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

  // ---------- 7.6 排除过程可视标记（红色斜线+被排除数字） ----------
  _drawHintEliminations(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    let hasAny = false;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (!cell.isHintEliminated) continue;
        hasAny = true;

        const x = c * cellSize;
        const y = r * cellSize;

        // 半透明红底
        ctx.fillStyle = 'rgba(220, 38, 38, 0.15)';
        ctx.fillRect(x, y, cellSize, cellSize);

        // 红色斜线（从左上到右下）
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 4);
        ctx.lineTo(x + cellSize - 4, y + cellSize - 4);
        ctx.stroke();

        // 被排除的数字（红色小字，右上角
        if (cell.hintEliminatedNum !== null) {
          const fontSize = Math.max(10, Math.floor(cellSize * 0.28));
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
          ctx.fillText(String(cell.hintEliminatedNum), x + cellSize - 3, y + 2);
        }
      }
    }
    return hasAny;
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
    if (!this._highlightOptions.highlightNumber) return;
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
    const selectedCells = board.selectedCells || [];
    const isMultiSelect = selectedCells.length > 1;
    const cornerRadius = Math.max(4, cellSize * 0.08);

    // 先画背景高亮
    let hasSelection = false;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isSelected) {
          hasSelection = true;
          const x = c * cellSize;
          const y = r * cellSize;
          if (isMultiSelect) {
            // 多选：金色半透明背景
            ctx.fillStyle = 'rgba(200, 154, 75, 0.15)';
          } else {
            ctx.fillStyle = theme.selectedBg;
          }
          this._roundRectPath(ctx, x + 1, y + 1, cellSize - 2, cellSize - 2, cornerRadius);
          ctx.fill();
        }
      }
    }

    if (!hasSelection) return;

    // 多选：每个选中格子单独画边框（滑动路径选择效果）
    if (isMultiSelect) {
      ctx.save();
      ctx.shadowColor = 'rgba(200, 154, 75, 0.4)';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = '#c89a4b';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board.cells[r][c];
          if (cell.isSelected) {
            const x = c * cellSize + 2.5;
            const y = r * cellSize + 2.5;
            this._roundRectPath(ctx, x, y, cellSize - 5, cellSize - 5, cornerRadius);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    } else {
      // 单选：根据输入模式显示不同颜色边框
      let borderColor = theme.selectedBorder;
      if (board.inputMode === 'candidate') {
        borderColor = theme.candidateBorder || '#8b5cf6';
      } else if (board.inputMode === 'elimination') {
        borderColor = '#e06050';
      }
      ctx.save();
      // 外发光效果
      ctx.shadowColor = this._hexToRgba(borderColor, 0.5);
      ctx.shadowBlur = 8;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board.cells[r][c];
          if (cell.isSelected) {
            const x = c * cellSize + 2.5;
            const y = r * cellSize + 2.5;
            this._roundRectPath(ctx, x, y, cellSize - 5, cellSize - 5, cornerRadius);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }

  // ---------- 9.2 红格预警闪烁（Boss战 gate 格）----------
  _drawGateAlerts(board) {
    if (!this._bossBattleActive) return;
    if (this._gateAlertCells.size === 0) return;

    const { ctx, cellSize } = this;
    const now = Date.now();
    const cornerRadius = Math.max(4, cellSize * 0.08);

    // 每帧只计算一次 sin 值，用于 2Hz 闪烁
    // sin 周期 = 2π，2Hz = 每秒2次，即周期 500ms
    // 我们用 sin(now / 250) 来获得 2Hz 的闪烁频率（0.25s 半个周期）
    // 但为了更"警示"的感觉，使用绝对值让它更像频闪
    const sinVal = Math.sin(now / 125); // 4Hz 基础，取绝对值后约 2Hz 闪烁
    const baseAlpha = 0.4 + 0.6 * Math.abs(sinVal); // 透明度 0.4~1.0 波动

    ctx.save();
    ctx.shadowColor = '#F44336';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(244, 67, 54, ${baseAlpha})`;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';

    const toRemove = [];

    for (const [key, alert] of this._gateAlertCells) {
      const [r, c] = key.split(',').map(Number);
      const cell = board.cells[r]?.[c];
      if (!cell) {
        toRemove.push(key);
        continue;
      }

      // 如果格子已经被填入（有玩家数字或AI数字），清除预警
      const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
      const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
      const hasAiFill = cell.isAiFilled;
      if (hasFilled || hasFixed || hasAiFill) {
        toRemove.push(key);
        continue;
      }

      // 检查是否超时
      if (now - alert.startTime >= alert.duration) {
        toRemove.push(key);
        continue;
      }

      // 绘制红色闪烁边框
      const x = c * cellSize + 1.5;
      const y = r * cellSize + 1.5;
      this._roundRectPath(ctx, x, y, cellSize - 3, cellSize - 3, cornerRadius);
      ctx.stroke();
    }

    // 清理过期的预警
    for (const key of toRemove) {
      this._gateAlertCells.delete(key);
    }

    ctx.restore();
  }

  // ---------- 9.5 选中笼子高亮（金色脉动 + 选中格外框）----------
  _drawSelectedCageHighlight(board) {
    if (!board.cages || board.cages.length === 0) return;

    // 获取当前选中的笼子ID（支持嵌套笼：多个）
    let selectedCageIds = [];
    if (board.selectedCageIds && board.selectedCageIds.length > 0) {
      selectedCageIds = board.selectedCageIds;
    } else if (board.selectedCageId) {
      selectedCageIds = [board.selectedCageId];
    }
    if (selectedCageIds.length === 0) return;

    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const params = this._getCageScaleParams();
    const { inset, sumFontSize, badgePaddingX, badgePaddingY, badgeRadius } = params;

    // 脉动动画 alpha：0.7 ~ 1.0，周期 0.5s
    const pulse = 0.5 * Math.sin(Date.now() / 250) + 0.5; // 0 ~ 1
    const pulseAlpha = 0.7 + 0.3 * pulse; // 0.7 ~ 1.0

    // 选中高亮金色（优先从主题读取）
    const goldColor = theme.accentGold || theme.selectedBorder || '#f5a623';
    const goldGlow = this._hexToRgba(goldColor, 0.4);

    // 计算嵌套深度（带缓存，避免每帧重复计算）
    const levelIdForCache = board.levelId || this._currentLevelId || 'unknown';
    const { cageDepths, cageCellSets, maxDepth } = this._computeCageDepths(board.cages, levelIdForCache);

    // 找到选中的笼子对象
    const selectedCages = board.cages.filter(c => selectedCageIds.includes(c.id));
    if (selectedCages.length === 0) return;

    // ---- 1. 选中格子的金色实线外框（2px，格子边界）----
    // 收集所有选中笼子中的所有格子
    const selectedCellSet = new Set();
    for (const cage of selectedCages) {
      for (const [r, c] of cage.cells) {
        selectedCellSet.add(`${r},${c}`);
      }
    }

    // 只绘制最外层选中格子的外框（即与非选中格子相邻的边）
    ctx.save();
    ctx.strokeStyle = goldColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.setLineDash([]);

    for (const key of selectedCellSet) {
      const [r, c] = key.split(',').map(Number);
      const x = c * cellSize;
      const y = r * cellSize;

      // 顶边
      if (!selectedCellSet.has(`${r - 1},${c}`)) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellSize, y);
        ctx.stroke();
      }
      // 底边
      if (!selectedCellSet.has(`${r + 1},${c}`)) {
        ctx.beginPath();
        ctx.moveTo(x, y + cellSize);
        ctx.lineTo(x + cellSize, y + cellSize);
        ctx.stroke();
      }
      // 左边
      if (!selectedCellSet.has(`${r},${c - 1}`)) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cellSize);
        ctx.stroke();
      }
      // 右边
      if (!selectedCellSet.has(`${r},${c + 1}`)) {
        ctx.beginPath();
        ctx.moveTo(x + cellSize, y);
        ctx.lineTo(x + cellSize, y + cellSize);
        ctx.stroke();
      }
    }
    ctx.restore();

    // ---- 2. 选中笼子的内框：金色虚线，3px，脉动动画 ----
    // 从最外层到最内层绘制
    for (let depth = 0; depth <= maxDepth; depth++) {
      const layerCages = selectedCages.filter(c => cageDepths.get(c.id) === depth);
      if (layerCages.length === 0) continue;

      const isInner = depth > 0;
      ctx.save();
      ctx.strokeStyle = isInner ? goldColor : this._hexToRgba(goldColor, pulseAlpha);
      ctx.lineWidth = isInner ? 2 : 3;
      ctx.setLineDash(isInner ? [] : [6, 4]);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 外发光效果（仅外层）
      if (!isInner) {
        ctx.shadowColor = goldGlow;
        ctx.shadowBlur = 6;
      }

      for (const cage of layerCages) {
        const cellSet = cageCellSets.get(cage.id);

        for (const [r, c] of cage.cells) {
          if (!cellSet.has(`${r - 1},${c}`)) {
            this._drawCageEdge(ctx, 'top', r, c, inset);
          }
          if (!cellSet.has(`${r + 1},${c}`)) {
            this._drawCageEdge(ctx, 'bottom', r, c, inset);
          }
          if (!cellSet.has(`${r},${c - 1}`)) {
            this._drawCageEdge(ctx, 'left', r, c, inset);
          }
          if (!cellSet.has(`${r},${c + 1}`)) {
            this._drawCageEdge(ctx, 'right', r, c, inset);
          }
        }
      }
      ctx.restore();
    }

    // ---- 3. 选中笼子的和值标签：白底黑字，高对比度 ----
    for (let depth = 0; depth <= maxDepth; depth++) {
      const layerCages = selectedCages.filter(c => cageDepths.get(c.id) === depth);
      if (layerCages.length === 0) continue;

      const depthOffsetY = depth * (sumFontSize * 0.6 + 2);
      const scale = 1.1;

      for (const cage of layerCages) {
        // 使用笼子内部最左上的格子作为锚点，与静态层保持一致
        const anchor = this._getCageSumAnchor(cage);
        const { r: anchorR, c: anchorC } = anchor;
        const sumText = cage.hiddenSum ? '?' : String(cage.sum);

        // 放大后的字号
        const scaledFontSize = Math.floor(sumFontSize * scale);
        ctx.font = `700 ${scaledFontSize}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const textWidth = ctx.measureText(sumText).width;
        const badgeW = textWidth + badgePaddingX * 2 * scale;
        const badgeH = scaledFontSize + badgePaddingY * 2 * scale;

        // 徽章位置（与静态层相同基准 + 深度偏移）
        const baseBadgeX = anchorC * cellSize + Math.max(3, inset);
        let baseBadgeY = anchorR * cellSize + Math.max(2, inset * 0.6);
        const badgeX = baseBadgeX;
        const badgeY = baseBadgeY + depthOffsetY;

        ctx.save();
        // 徽章背景：纯白
        ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        this._roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, badgeRadius * scale);
        ctx.fill();

        // 金色边框（选中态标识）
        ctx.shadowBlur = 0;
        ctx.strokeStyle = goldColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 黑色文字（高对比度）
        ctx.fillStyle = '#1a1a1a';
        ctx.fillText(sumText, badgeX + badgePaddingX * scale, badgeY + badgeH / 2);

        ctx.restore();
      }
    }
  }

  // ---------- 10. 数字渲染 ----------
  _drawNumbers(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    const fixedFontSize = Math.floor(cellSize * 0.65);  // 给定数字：65%
    const playerFontSize = Math.floor(cellSize * 0.62); // 玩家数字：62%（加粗放大）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        const num = cell.fixedNum || cell.fillNum;
        if (!num) {
          // 临时错误数字（不写入正式 fillNum）
          if (cell.tempWrongNum !== null && cell.tempWrongNum !== undefined) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.font = `700 ${playerFontSize}px sans-serif`;
            ctx.fillStyle = theme.errorNum;
            // 抖动效果（轻微偏移）
            const shake = (Date.now() % 100) < 50 ? 1 : -1;
            ctx.fillText(
              cell.tempWrongNum,
              c * cellSize + cellSize / 2 + shake,
              r * cellSize + cellSize / 2
            );
            ctx.restore();
          }
          continue;
        }

        if (cell.isError && board.settings.conflictRed) {
          ctx.font = `700 ${playerFontSize}px sans-serif`;
          ctx.fillStyle = theme.errorNum;
        } else if (cell.fixedNum) {
          ctx.font = `700 ${fixedFontSize}px sans-serif`;
          ctx.fillStyle = theme.fixedNum;
        } else {
          ctx.font = `700 ${playerFontSize}px sans-serif`;
          ctx.fillStyle = theme.playerNum;
        }
        ctx.globalAlpha = 1;
        ctx.fillText(num, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 只画玩家填的数字（预填数已在缓存层中）
  _drawPlayerNumbers(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    const playerFontSize = Math.floor(cellSize * 0.60); // 玩家数字：60%
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${playerFontSize}px sans-serif`;

    const hasAnimations = this._fillAnimationEnabled && this._fillAnimations.size > 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];

        // 临时错误数字（优先绘制，半透明红色 + 抖动）
        if (cell.tempWrongNum !== null && cell.tempWrongNum !== undefined) {
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.font = `700 ${playerFontSize}px sans-serif`;
          ctx.fillStyle = theme.errorNum;
          const shake = (Date.now() % 100) < 50 ? 1 : -1;
          ctx.fillText(
            cell.tempWrongNum,
            c * cellSize + cellSize / 2 + shake,
            r * cellSize + cellSize / 2
          );
          ctx.restore();
          continue;
        }

        // AI填的格子：不显示数字（幽灵格效果，信息不对称）
        // 只在 _drawBattlePlayerOwned 中显示底色块
        if (cell.isAiFilled && this._bossBattle && this._bossBattle.active) {
          continue;
        }

        if (!cell.fillNum) continue;

        // 计算动画进度（0~1）
        let progress = 1;
        if (hasAnimations) {
          progress = this._getFillAnimProgress(r, c);
        }

        // 基础颜色和字体
        let baseColor;
        let fontWeight = '700';
        if (cell.isError && board.settings.conflictRed) {
          baseColor = theme.errorNum;
          fontWeight = '700';
        } else if (cell.isAiFilled && this._bossBattle && this._bossBattle.opponent) {
          // AI填的数字用对手颜色
          baseColor = this._bossBattle.opponent.color || '#ef4444';
          fontWeight = '700';
        } else {
          baseColor = theme.playerNum;
        }

        // 动画效果：淡入（opacity 0→1）+ 微缩放（0.8→1.0，缓出）
        if (progress < 1) {
          // 缓出函数：easeOutCubic
          const ease = 1 - Math.pow(1 - progress, 3);
          const scale = 0.8 + 0.2 * ease;
          const alpha = ease;

          ctx.save();
          ctx.globalAlpha = alpha;
          const centerX = c * cellSize + cellSize / 2;
          const centerY = r * cellSize + cellSize / 2;
          ctx.translate(centerX, centerY);
          ctx.scale(scale, scale);
          ctx.font = `${fontWeight} ${playerFontSize}px sans-serif`;
          ctx.fillStyle = baseColor;
          // 文字阴影：深色投影，增强可读性
          ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillText(cell.fillNum, 0, 0);
          ctx.restore();
        } else {
          ctx.font = `${fontWeight} ${playerFontSize}px sans-serif`;
          ctx.fillStyle = baseColor;
          // 文字阴影：深色投影，增强可读性
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillText(cell.fillNum, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          ctx.restore();
        }
      }
    }
  }

  // ---------- 12. 笔记渲染 ----------
  _drawCandidates(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const { boxW, boxH } = this.getBoxSize(size);

    // 笔记区域：左上角留出空间给笼子和值标签
    // 增加顶部留白，避免笼和徽章遮挡第1行笔记数字
    const paddingTop = Math.max(6, cellSize * 0.22);
    const paddingLeft = Math.max(5, cellSize * 0.12);
    const paddingBottom = 2;
    const paddingRight = 2;
    const availW = cellSize - paddingLeft - paddingRight;
    const availH = cellSize - paddingTop - paddingBottom;
    const subW = availW / boxW;
    const subH = availH / boxH;

    const fontSize = Math.max(9, Math.floor(cellSize * 0.3));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${fontSize}px sans-serif`;

    // 如果有笔记系统，使用它来控制每格的显示状态
    const noteSys = this._getNoteSystem();

    // Boss战脉冲透明度（全局影响候选数）
    let pulseOpacity = 1;
    const bossBattle = this._bossBattle;
    if (bossBattle && typeof bossBattle.getPulseOpacity === 'function') {
      pulseOpacity = bossBattle.getPulseOpacity();
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.fixedNum || cell.fillNum) continue;
        if (cell.candidates.size === 0) continue;

        // 笔记系统控制：是否显示、透明度多少
        // 始终交给笔记系统决定显示逻辑，与输入模式无关
        // （输入模式只影响"怎么输入"，不影响"怎么显示"）
        let show = false;
        let opacity = 1;
        if (noteSys) {
          const result = noteSys.shouldShowCandidate(r, c);
          show = result.show;
          opacity = result.opacity;
        } else {
          // 没有笔记系统时，候选/排除模式下显示，否则隐藏
          show = (board.inputMode === 'candidate' || board.inputMode === 'elimination');
          opacity = 1;
        }

        // 应用Boss战脉冲透明度
        opacity *= pulseOpacity;

        if (!show || opacity <= 0) continue;

        // 检查是否是浮现笔记（第4章联动锁效果）
        const key = r + ',' + c;
        const revealedNote = this._revealedNotes.get(key);
        const isRevealed = !!revealedNote;

        ctx.globalAlpha = opacity;

        if (isRevealed) {
          // 浮现笔记：金色/青色发光效果
          const now = Date.now();
          const elapsed = now - revealedNote.startTime;
          const glowPulse = 0.6 + 0.4 * Math.sin(elapsed / 300);

          ctx.save();
          ctx.shadowColor = '#22d3ee';
          ctx.shadowBlur = 6 * glowPulse;
          ctx.fillStyle = `rgba(34, 211, 238, ${Math.min(1, opacity)})`;

          cell.candidates.forEach(num => {
            const subR = Math.floor((num - 1) / boxW);
            const subC = (num - 1) % boxW;
            const x = c * cellSize + paddingLeft + subC * subW + subW / 2;
            const y = r * cellSize + paddingTop + subR * subH + subH / 2;
            ctx.fillText(num, x, y);
          });

          ctx.restore();
        } else {
          ctx.fillStyle = theme.candidateNum;

          cell.candidates.forEach(num => {
            const subR = Math.floor((num - 1) / boxW);
            const subC = (num - 1) % boxW;
            const x = c * cellSize + paddingLeft + subC * subW + subW / 2;
            const y = r * cellSize + paddingTop + subR * subH + subH / 2;
            ctx.fillText(num, x, y);
          });
        }
      }
    }

    ctx.globalAlpha = 1; // 恢复
  }

  // ---------- 9.5 排除标记渲染 ----------
  _drawEliminations(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;
    const { boxW, boxH } = this.getBoxSize(size);

    // 与候选笔记使用相同的网格布局
    const paddingTop = Math.max(6, cellSize * 0.22);
    const paddingLeft = Math.max(5, cellSize * 0.12);
    const paddingBottom = 2;
    const paddingRight = 2;
    const availW = cellSize - paddingLeft - paddingRight;
    const availH = cellSize - paddingTop - paddingBottom;
    const subW = availW / boxW;
    const subH = availH / boxH;

    const fontSize = Math.max(8, Math.floor(cellSize * 0.25));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${fontSize}px sans-serif`;

    const eliminationColor = '#e06050'; // 红色排除标记
    const noteSys = this._getNoteSystem();

    // Boss战脉冲透明度
    let pulseOpacity = 1;
    const bossBattle = this._bossBattle;
    if (bossBattle && typeof bossBattle.getPulseOpacity === 'function') {
      pulseOpacity = bossBattle.getPulseOpacity();
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.fixedNum || cell.fillNum) continue;
        if (!cell.eliminations || cell.eliminations.size === 0) continue;

        // 显示条件：交给笔记系统统一决定（与输入模式无关）
        let show = false;
        let opacity = 1;
        if (noteSys) {
          const result = noteSys.shouldShowCandidate(r, c);
          show = result.show;
          opacity = result.opacity * 0.85;
        } else {
          // 没有笔记系统时，候选/排除模式下显示
          show = (board.inputMode === 'candidate' || board.inputMode === 'elimination');
          opacity = 0.85;
        }

        // 应用Boss战脉冲透明度
        opacity *= pulseOpacity;

        if (!show || opacity <= 0) continue;

        ctx.globalAlpha = opacity;

        cell.eliminations.forEach(num => {
          const subR = Math.floor((num - 1) / boxW);
          const subC = (num - 1) % boxW;
          const x = c * cellSize + paddingLeft + subC * subW + subW / 2;
          const y = r * cellSize + paddingTop + subR * subH + subH / 2;

          // 绘制红色排除数字
          ctx.fillStyle = eliminationColor;
          ctx.fillText(num, x, y);

          // 绘制斜杠（划掉效果）
          const slashW = subW * 0.55;
          const slashH = subH * 0.15;
          ctx.strokeStyle = eliminationColor;
          ctx.lineWidth = Math.max(1.5, fontSize * 0.12);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x - slashW / 2, y + slashH);
          ctx.lineTo(x + slashW / 2, y - slashH);
          ctx.stroke();
        });
      }
    }

    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
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

  // ---------- 10.1 提示播放动画绘制 ----------
  _drawHintAnimation(board) {
    const state = this._hintAnimState;
    if (!state.active || state.currentIndex >= state.steps.length) return;

    const { ctx, cellSize } = this;
    const size = board.size;
    const step = state.steps[state.currentIndex];
    const now = Date.now();
    const progress = Math.min(1, (now - state.startTime) / state.duration);
    state.progress = progress;

    // 检查步骤是否完成
    if (progress >= 1) {
      this._hintAnimStepComplete();
      if (!state.active) return;
    }

    const data = step.data || {};

    switch (step.type) {
      case 'observe':
        this._drawHintAnimObserve(ctx, cellSize, size, data, progress, board);
        break;
      case 'focus':
        this._drawHintAnimFocus(ctx, cellSize, size, data, progress);
        break;
      case 'eliminate':
        this._drawHintAnimEliminate(ctx, cellSize, size, data, progress);
        break;
      case 'reveal':
        this._drawHintAnimReveal(ctx, cellSize, size, data, progress);
        break;
      case 'complete':
        // 完成步骤不做额外绘制，仅作为时间占位
        break;
    }
  }

  /**
   * 单步完成内部处理
   * @private
   */
  _hintAnimStepComplete() {
    const state = this._hintAnimState;
    if (!state.active) return;

    const finishedIndex = state.currentIndex;
    if (state.onStepComplete) {
      state.onStepComplete(finishedIndex);
    }

    state.currentIndex++;
    if (state.currentIndex >= state.steps.length) {
      state.active = false;
      if (state.onComplete) {
        state.onComplete();
      }
    } else {
      state.startTime = Date.now();
      state.duration = state.steps[state.currentIndex].duration || 600;
      state.progress = 0;
    }
  }

  /**
   * 绘制 observe 类型：行/列/宫/笼子/格子高亮
   * @private
   */
  _drawHintAnimObserve(ctx, cellSize, size, data, progress, board) {
    // 淡入效果：前 20% 时间淡入
    const fadeIn = Math.min(1, progress / 0.2);

    // 1. 行高亮
    if (data.rows && data.rows.length > 0) {
      ctx.fillStyle = `rgba(96, 165, 250, ${0.12 * fadeIn})`;
      for (const r of data.rows) {
        if (r >= 0 && r < size) {
          ctx.fillRect(0, r * cellSize, size * cellSize, cellSize);
        }
      }
    }

    // 2. 列高亮
    if (data.cols && data.cols.length > 0) {
      ctx.fillStyle = `rgba(96, 165, 250, ${0.12 * fadeIn})`;
      for (const c of data.cols) {
        if (c >= 0 && c < size) {
          ctx.fillRect(c * cellSize, 0, cellSize, size * cellSize);
        }
      }
    }

    // 3. 宫高亮
    if (data.boxes && data.boxes.length > 0) {
      const boxSize = Math.sqrt(size);
      ctx.fillStyle = `rgba(96, 165, 250, ${0.12 * fadeIn})`;
      for (const box of data.boxes) {
        const br = Math.floor(box / boxSize);
        const bc = box % boxSize;
        const x = bc * boxSize * cellSize;
        const y = br * boxSize * cellSize;
        const w = boxSize * cellSize;
        const h = boxSize * cellSize;
        ctx.fillRect(x, y, w, h);
      }
    }

    // 4. 笼子高亮（底色 + 金色虚线边框）
    if (data.cageIds && data.cageIds.length > 0 && board.cages) {
      const cageIdSet = new Set(data.cageIds.map(id => String(id)));
      for (const cage of board.cages) {
        if (cageIdSet.has(String(cage.id))) {
          // 底色
          ctx.fillStyle = `rgba(251, 191, 36, ${0.15 * fadeIn})`;
          for (const cell of cage.cells) {
            ctx.fillRect(cell.c * cellSize, cell.r * cellSize, cellSize, cellSize);
          }
          // 金色虚线边框
          ctx.save();
          ctx.strokeStyle = `rgba(251, 191, 36, ${0.8 * fadeIn})`;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          this._strokeCageBorder(ctx, cage, cellSize);
          ctx.restore();
        }
      }
    }

    // 5. 格子高亮
    if (data.cells && data.cells.length > 0) {
      ctx.fillStyle = `rgba(96, 165, 250, ${0.12 * fadeIn})`;
      for (const cell of data.cells) {
        const r = cell[0];
        const c = cell[1];
        if (r >= 0 && r < size && c >= 0 && c < size) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  /**
   * 绘制 focus 类型：目标格聚焦（金色边框 + 呼吸脉动）
   * @private
   */
  _drawHintAnimFocus(ctx, cellSize, size, data, progress) {
    if (!data.targetCell) return;
    const r = data.targetCell[0];
    const c = data.targetCell[1];
    if (r < 0 || r >= size || c < 0 || c >= size) return;

    // 呼吸脉动效果：使用 sin 函数
    const pulse = Math.sin(progress * Math.PI * 4) * 0.5 + 0.5; // 0~1 之间脉动两次
    const scale = 0.92 + pulse * 0.08; // 0.92 ~ 1.0
    const opacity = 0.6 + pulse * 0.4;

    const cx = c * cellSize + cellSize / 2;
    const cy = r * cellSize + cellSize / 2;
    const halfSize = (cellSize / 2) * scale;

    ctx.save();

    // 外发光
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 8 + pulse * 10;

    // 金色边框
    ctx.strokeStyle = `rgba(251, 191, 36, ${opacity})`;
    ctx.lineWidth = 3 + pulse * 2;
    ctx.strokeRect(
      cx - halfSize + 2,
      cy - halfSize + 2,
      halfSize * 2 - 4,
      halfSize * 2 - 4
    );

    // 底色
    ctx.fillStyle = `rgba(251, 191, 36, ${0.10 + pulse * 0.10})`;
    ctx.fillRect(cx - halfSize, cy - halfSize, halfSize * 2, halfSize * 2);

    ctx.restore();
  }

  /**
   * 绘制 eliminate 类型：排除数字（红色 + 斜线划掉 + 淡出）
   * @private
   */
  _drawHintAnimEliminate(ctx, cellSize, size, data, progress) {
    if (!data.cell || !data.numbers || data.numbers.length === 0) return;
    const r = data.cell[0];
    const c = data.cell[1];
    if (r < 0 || r >= size || c < 0 || c >= size) return;

    const boxSize = Math.sqrt(size);
    const boxW = boxSize;
    const boxH = boxSize;

    // 与候选笔记使用相同的网格布局
    const paddingTop = Math.max(6, cellSize * 0.22);
    const paddingLeft = Math.max(5, cellSize * 0.12);
    const paddingBottom = 2;
    const paddingRight = 2;
    const availW = cellSize - paddingLeft - paddingRight;
    const availH = cellSize - paddingTop - paddingBottom;
    const subW = availW / boxW;
    const subH = availH / boxH;

    const fontSize = Math.max(8, Math.floor(cellSize * 0.25));

    // 动画：前 30% 淡入显示，中间保持，最后 30% 淡出
    let opacity;
    if (progress < 0.3) {
      opacity = progress / 0.3;
    } else if (progress > 0.7) {
      opacity = (1 - progress) / 0.3;
    } else {
      opacity = 1;
    }
    opacity = Math.max(0, Math.min(1, opacity));

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fontSize}px sans-serif`;

    const elimColor = '#ef4444';

    for (const num of data.numbers) {
      if (num < 1 || num > size) continue;
      const subR = Math.floor((num - 1) / boxW);
      const subC = (num - 1) % boxW;
      const x = c * cellSize + paddingLeft + subC * subW + subW / 2;
      const y = r * cellSize + paddingTop + subR * subH + subH / 2;

      // 红色数字
      ctx.fillStyle = elimColor;
      ctx.fillText(num, x, y);

      // 斜线划掉效果
      const slashW = subW * 0.6;
      const slashH = subH * 0.15;
      ctx.strokeStyle = elimColor;
      ctx.lineWidth = Math.max(1.5, fontSize * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - slashW / 2, y + slashH);
      ctx.lineTo(x + slashW / 2, y - slashH);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 绘制 reveal 类型：揭示数字（从中心放大 + 金色闪光）
   * @private
   */
  _drawHintAnimReveal(ctx, cellSize, size, data, progress) {
    if (!data.cell || data.number == null) return;
    const r = data.cell[0];
    const c = data.cell[1];
    if (r < 0 || r >= size || c < 0 || c >= size) return;

    const cx = c * cellSize + cellSize / 2;
    const cy = r * cellSize + cellSize / 2;

    // 缩放动画：0.8 -> 1.0
    const scale = 0.8 + progress * 0.2;
    // 透明度：淡入
    const opacity = Math.min(1, progress / 0.3);

    // 闪光强度：中间最亮
    const glowProgress = progress < 0.5 ? progress / 0.5 : (1 - progress) / 0.5;
    const glowIntensity = glowProgress;

    const fontSize = Math.floor(cellSize * 0.65);

    ctx.save();

    // 金色闪光背景
    if (glowIntensity > 0) {
      const glowSize = cellSize * (0.5 + glowIntensity * 0.3);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
      gradient.addColorStop(0, `rgba(251, 191, 36, ${0.5 * glowIntensity})`);
      gradient.addColorStop(0.5, `rgba(251, 191, 36, ${0.2 * glowIntensity})`);
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - glowSize, cy - glowSize, glowSize * 2, glowSize * 2);
    }

    // 数字：缩放 + 淡入
    ctx.globalAlpha = opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fontSize * scale}px sans-serif`;

    // 金色外发光文字效果
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 8 + glowIntensity * 12;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(String(data.number), cx, cy);

    ctx.restore();
  }

  // ---------- 10.2 自定义多类型高亮（hint/error/success）----------
  _drawCustomHighlights(board) {
    if (!this._customHighlights || this._customHighlights.length === 0) return;

    const { ctx, cellSize, theme } = this;
    const size = board.size;

    for (const highlight of this._customHighlights) {
      let bgColor, borderColor;
      switch (highlight.type) {
        case 'error':
          bgColor = theme.errorHighlightBg;
          borderColor = theme.errorHighlightBorder;
          break;
        case 'success':
          bgColor = theme.successHighlightBg;
          borderColor = theme.successHighlightBorder;
          break;
        case 'hint':
        default:
          bgColor = theme.hintHighlightBg;
          borderColor = theme.hintHighlightBorder;
          break;
      }

      // 绘制底色
      ctx.fillStyle = bgColor;
      for (const cell of highlight.cells) {
        if (cell.r < 0 || cell.r >= size || cell.c < 0 || cell.c >= size) continue;
        ctx.fillRect(cell.c * cellSize, cell.r * cellSize, cellSize, cellSize);
      }

      // 绘制边框（内侧2px的描边）
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2.5;
      for (const cell of highlight.cells) {
        if (cell.r < 0 || cell.r >= size || cell.c < 0 || cell.c >= size) continue;
        ctx.strokeRect(
          cell.c * cellSize + 2,
          cell.r * cellSize + 2,
          cellSize - 4,
          cellSize - 4
        );
      }
    }
  }

  // ---------- 10.6 三色热力图渲染 ----------
  _drawHeatmap(board) {
    if (!this._heatmapEnabled || !this._heatmapData) return;
    if (!this._heatmapData.gridMeta) return;

    const { ctx, cellSize } = this;
    const size = board.size || 9;
    const gridMeta = this._heatmapData.gridMeta;
    const mode = this._threeActMode || 'all';

    // 透明度分级：第一幕淡，第二幕稍深，第三幕更深（渐进式呈现）
    const opacityMap = { simple: 0.18, gate: 0.22, core: 0.25, all: 0.15 };
    const opacity = opacityMap[mode] !== undefined ? opacityMap[mode] : 0.15;

    ctx.save();
    ctx.globalAlpha = opacity;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const meta = gridMeta[r]?.[c];
        if (!meta) continue;
        if (meta.category === 'filled') continue; // 已填格不绘制

        // 模式过滤：非 all 模式下只绘制当前幕次对应类别
        if (mode !== 'all' && meta.category !== mode) continue;

        const x = c * cellSize;
        const y = r * cellSize;

        // 绘制底色
        ctx.fillStyle = meta.color;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }

    ctx.restore();
  }

  /**
   * 绘制三幕彩色呼吸边框
   * 在当前幕次对应的类别格子上绘制彩色边框，形成视觉锚定
   */
  _drawThreeActBorders(board) {
    if (!this._heatmapEnabled || !this._heatmapData) return;
    if (!this._threeActBordersEnabled) return;
    if (!this._threeActMode || this._threeActMode === 'all') return;
    if (!this._heatmapData.gridMeta) return;

    const { ctx, cellSize } = this;
    const size = board.size || 9;
    const gridMeta = this._heatmapData.gridMeta;
    const mode = this._threeActMode;

    const colorMap = { simple: '#22c55e', gate: '#ef4444', core: '#fbbf24' };
    const borderColor = colorMap[mode];
    if (!borderColor) return;

    // 呼吸脉冲：0.6 ~ 1.0
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 600);

    ctx.save();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4 + 0.4 * pulse;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const meta = gridMeta[r]?.[c];
        if (!meta || meta.category !== mode) continue;

        const x = c * cellSize + 1;
        const y = r * cellSize + 1;
        ctx.strokeRect(x, y, cellSize - 2, cellSize - 2);
      }
    }

    ctx.restore();
  }

  /**
   * 绘制 Combo 燃烧效果（棋盘边缘红光）
   * 连击 3+ 开始出现，强度随连击数递增
   */
  _drawComboGlow(board) {
    if (!this._comboGlowEnabled) return;
    const combo = this._comboCount;
    if (combo < 3) return;

    const { ctx, cellSize } = this;
    const size = board.gridSize || board.size || 9;
    const boardW = size * cellSize;
    const boardH = size * cellSize;

    // 强度计算：3连击为起点，13连击达到最大强度
    const intensity = Math.min(1, (combo - 3) / 10);

    // 边缘光晕：从外向内渐变的红色
    const glowSize = cellSize * (0.3 + intensity * 0.7); // 0.3~1.0 格大小

    // 渐变红色：#ff6a00 → #ef4444 → 金色高光在高连击时
    const innerColor = intensity > 0.7
      ? `rgba(255, 200, 50, 0)`
      : `rgba(255, 100, 20, 0)`;
    const outerColor = intensity > 0.7
      ? `rgba(255, 140, 0, ${0.15 + intensity * 0.25})`
      : `rgba(255, 80, 30, ${0.08 + intensity * 0.22})`;

    // 呼吸脉动效果
    const pulse = 0.85 + 0.15 * Math.sin(Date.now() / (300 - intensity * 150));

    ctx.save();

    // 四边渐变光晕
    const gradTop = ctx.createLinearGradient(0, 0, 0, glowSize);
    gradTop.addColorStop(0, outerColor);
    gradTop.addColorStop(1, innerColor);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = gradTop;
    ctx.fillRect(0, 0, boardW, glowSize);

    const gradBottom = ctx.createLinearGradient(0, boardH, 0, boardH - glowSize);
    gradBottom.addColorStop(0, outerColor);
    gradBottom.addColorStop(1, innerColor);
    ctx.fillStyle = gradBottom;
    ctx.fillRect(0, boardH - glowSize, boardW, glowSize);

    const gradLeft = ctx.createLinearGradient(0, 0, glowSize, 0);
    gradLeft.addColorStop(0, outerColor);
    gradLeft.addColorStop(1, innerColor);
    ctx.fillStyle = gradLeft;
    ctx.fillRect(0, 0, glowSize, boardH);

    const gradRight = ctx.createLinearGradient(boardW, 0, boardW - glowSize, 0);
    gradRight.addColorStop(0, outerColor);
    gradRight.addColorStop(1, innerColor);
    ctx.fillStyle = gradRight;
    ctx.fillRect(boardW - glowSize, 0, glowSize, boardH);

    // 高连击时：四角放射状光效
    if (intensity > 0.5) {
      const cornerSize = glowSize * 1.5;
      const cornerAlpha = (intensity - 0.5) * 2 * 0.5 * pulse;

      // 左上角
      const gradTL = ctx.createRadialGradient(0, 0, 0, 0, 0, cornerSize);
      gradTL.addColorStop(0, `rgba(255, 180, 50, ${cornerAlpha})`);
      gradTL.addColorStop(1, 'rgba(255, 100, 20, 0)');
      ctx.fillStyle = gradTL;
      ctx.fillRect(0, 0, cornerSize, cornerSize);

      // 右上角
      const gradTR = ctx.createRadialGradient(boardW, 0, 0, boardW, 0, cornerSize);
      gradTR.addColorStop(0, `rgba(255, 180, 50, ${cornerAlpha})`);
      gradTR.addColorStop(1, 'rgba(255, 100, 20, 0)');
      ctx.fillStyle = gradTR;
      ctx.fillRect(boardW - cornerSize, 0, cornerSize, cornerSize);

      // 左下角
      const gradBL = ctx.createRadialGradient(0, boardH, 0, 0, boardH, cornerSize);
      gradBL.addColorStop(0, `rgba(255, 180, 50, ${cornerAlpha})`);
      gradBL.addColorStop(1, 'rgba(255, 100, 20, 0)');
      ctx.fillStyle = gradBL;
      ctx.fillRect(0, boardH - cornerSize, cornerSize, cornerSize);

      // 右下角
      const gradBR = ctx.createRadialGradient(boardW, boardH, 0, boardW, boardH, cornerSize);
      gradBR.addColorStop(0, `rgba(255, 180, 50, ${cornerAlpha})`);
      gradBR.addColorStop(1, 'rgba(255, 100, 20, 0)');
      ctx.fillStyle = gradBR;
      ctx.fillRect(boardW - cornerSize, boardH - cornerSize, cornerSize, cornerSize);
    }

    ctx.restore();
  }

  // ---------- 10.5 Boss战：玩家归属底色 ----------
  _drawBattlePlayerOwned(board) {
    if (!this._bossBattleActive || !this._bossBattle) return;
    const battle = this._bossBattle;
    const { ctx, cellSize } = this;
    const size = board.gridSize || board.size || 9;
    const opponentColor = battle.opponent ? battle.opponent.color : '#ef4444';
    const playerColor = '#22c55e';

    // 呼吸动画因子（0.6 ~ 1.0 之间波动）
    const breath = 0.7 + 0.3 * Math.sin(Date.now() / 900);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell && cell.fixedNum) continue;

        const x = c * cellSize;
        const y = r * cellSize;

        // AI归属格（幽灵格：淡色底色 + 呼吸边框 + 中心圆点）
        if (battle.aiOwned && battle.aiOwned[r] && battle.aiOwned[r][c]) {
          const isMistake = cell._aiMistake === true;

          if (isMistake) {
            // AI填错的格子：更淡更灰 + 问号标记 + 微微晃动
            const mistakeAlpha = 0.07 + 0.03 * Math.sin(Date.now() / 400 + r + c);
            ctx.fillStyle = _hexToRgbaStatic('#9ca3af', mistakeAlpha); // 灰色
            ctx.fillRect(x, y, cellSize, cellSize);

            // 虚线边框（灰色，不稳定感）
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = _hexToRgbaStatic('#6b7280', 0.35 + 0.1 * Math.sin(Date.now() / 350));
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
            ctx.setLineDash([]);

            // 问号标记（暗示"这格AI可能填错了"）
            ctx.save();
            const shakeX = Math.sin(Date.now() / 250 + r) * 1.5;
            const shakeY = Math.cos(Date.now() / 300 + c) * 1;
            ctx.font = `700 ${Math.floor(cellSize * 0.28)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = _hexToRgbaStatic('#6b7280', 0.5 + 0.2 * Math.sin(Date.now() / 400));
            ctx.fillText('?', x + cellSize / 2 + shakeX, y + cellSize / 2 + shakeY);
            ctx.restore();
          } else {
            // AI填对的格子：正常幽灵格效果
            // 底色（淡色）
            ctx.fillStyle = _hexToRgbaStatic(opponentColor, 0.12);
            ctx.fillRect(x, y, cellSize, cellSize);

            // 呼吸边框
            ctx.strokeStyle = _hexToRgbaStatic(opponentColor, 0.4 * breath);
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

            // 中心小圆点（暗示"这里有东西，但不知道是什么"）
            ctx.fillStyle = _hexToRgbaStatic(opponentColor, 0.3 + 0.2 * breath);
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.08, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 玩家归属格（淡色半透明）
        if (battle.playerOwned && battle.playerOwned[r] && battle.playerOwned[r][c]) {
          ctx.fillStyle = _hexToRgbaStatic(playerColor, 0.2);
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }

    // 「观局」高亮效果（阿妍必杀技：闪烁的金色边框）
    if (this._guanJuHighlights && this._guanJuHighlights.length > 0) {
      const pulse = 0.5 * Math.sin(Date.now() / 200) + 0.5;
      const highlightColor = '#fbbf24'; // 金色

      ctx.save();
      for (const target of this._guanJuHighlights) {
        const { row, col } = target;
        // 跳过已被占的格子
        if (battle.aiOwned?.[row]?.[col] || battle.playerOwned?.[row]?.[col]) continue;

        const x = col * cellSize;
        const y = row * cellSize;

        // 闪烁金色边框
        ctx.strokeStyle = _hexToRgbaStatic(highlightColor, 0.6 + 0.4 * pulse);
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

        // 内部发光
        ctx.fillStyle = _hexToRgbaStatic(highlightColor, 0.08 + 0.05 * pulse);
        ctx.fillRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
      }
      ctx.restore();
    }

    // 假动作格子（设局人专属：比真幽灵格更虚、更不稳定、有"闪烁"感）
    const fakeMoves = battle.getFakeMoves ? battle.getFakeMoves() : [];
    if (fakeMoves && fakeMoves.length > 0) {
      const now = Date.now();
      for (const fake of fakeMoves) {
        const x = fake.c * cellSize;
        const y = fake.r * cellSize;
        const timeLeft = fake.expireTime - now;
        const totalDuration = 7000; // 估算总时长
        // 不稳定的透明度（快速闪烁，制造"虚假"感）
        const flicker = 0.5 + 0.5 * Math.sin(now / 120 + fake.r * 3 + fake.c * 2);
        const baseAlpha = 0.08 + 0.06 * flicker;

        // 非常淡的底色（比真幽灵格淡很多）
        ctx.fillStyle = _hexToRgbaStatic(opponentColor, baseAlpha);
        ctx.fillRect(x, y, cellSize, cellSize);

        // 虚线边框（快速闪烁，不稳定感）
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = _hexToRgbaStatic(opponentColor, 0.2 + 0.15 * flicker);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
        ctx.setLineDash([]);

        // 中心一个很淡的问号（暗示"这格不确定"）
        ctx.save();
        ctx.font = `400 ${Math.floor(cellSize * 0.22)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = _hexToRgbaStatic(opponentColor, 0.15 + 0.1 * flicker);
        ctx.fillText('?', x + cellSize / 2, y + cellSize / 2);
        ctx.restore();
      }
    }
  }

  // ---------- 13. 粒子特效系统 ----------

  /**
   * 发射粒子
   * @param {number} col - 格子列
   * @param {number} row - 格子行
   * @param {string} type - 粒子类型：'correct'|'steal'|'intercept'|'error'
   * @param {number} count - 粒子数量
   */
  emitParticles(col, row, type, count) {
    if (!this._particleEnabled) return;

    const cellSize = this.cellSize;
    const x = col * cellSize + cellSize / 2;
    const y = row * cellSize + cellSize / 2;

    const configs = {
      correct: { color: '#22c55e', speed: 2, size: 3, life: 600, spread: cellSize * 0.6 },
      steal:   { color: '#fbbf24', speed: 3.5, size: 4, life: 800, spread: cellSize * 0.8 },
      intercept: { color: '#ef4444', speed: 2.5, size: 3, life: 500, spread: cellSize * 0.5 },
      error:   { color: '#ef4444', speed: 1.5, size: 2, life: 400, spread: cellSize * 0.3 },
      combo:   { color: '#f97316', speed: 3, size: 3.5, life: 700, spread: cellSize * 0.7 },
    };

    const config = configs[type] || configs.correct;
    const num = count || (type === 'steal' ? 12 : 8);

    for (let i = 0; i < num; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = config.speed * (0.5 + Math.random());
      const dist = Math.random() * config.spread * 0.3;
      this._particles.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1, // 略微向上
        size: config.size * (0.7 + Math.random() * 0.6),
        color: config.color,
        life: config.life,
        maxLife: config.life,
        gravity: 0.05,
      });
    }
  }

  /**
   * 更新并绘制粒子
   */
  _updateAndDrawParticles(dt) {
    if (this._particles.length === 0) return;

    const ctx = this.ctx;
    const alive = [];

    for (const p of this._particles) {
      p.life -= dt;
      if (p.life <= 0) continue;

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.98;
      p.vy *= 0.98;

      const alpha = p.life / p.maxLife;
      ctx.fillStyle = _hexToRgbaStatic(p.color, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();

      alive.push(p);
    }

    this._particles = alive;
  }

  // ---------- 14. 提示数字角标 ----------
  _drawHintNumber(board) {
    const { ctx, cellSize, theme } = this;
    const size = board.size;

    const fontSize = Math.floor(cellSize * 0.55);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px sans-serif`;
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

// Global export
window.Renderer = Renderer;
