// 纯结构拆分（Phase 1）：AI_PERSONALITIES + AIPlayerCore。
import { StrategySelector } from './strategy-selector.js';
import { OpponentObserver } from './opponent-observer.js';

const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

// ---------------------------------------------------------------------------
// 1. TechRater 引导
//    V4 core/tech-rater.js 是 CJS 全局脚本（IIFE）。Node 环境无法直接
//    import 其命名导出，故仿照 headless-engine.js 的方式在模块加载时
//    通过 eval 执行，使其挂载到 global.TechRater。
//    浏览器环境：页面应已按 <script> 引入 tech-rater.js，globalThis.TechRater 可用。
//    注意：浏览器原生 ESM 无法解析静态 import 'fs'，此处改为动态 import，
//    仅 Node 环境执行，浏览器环境安全加载。
// ---------------------------------------------------------------------------
let TechRaterClass = (typeof globalThis.TechRater !== 'undefined') ? globalThis.TechRater : null;

if (!TechRaterClass && IS_NODE) {
  try {
    const [fsMod, pathMod, urlMod] = await Promise.all([
      import('fs'),
      import('path'),
      import('url'),
    ]);
    const __dirname = pathMod.dirname(urlMod.fileURLToPath(import.meta.url));
    const techRaterCode = fsMod.readFileSync(pathMod.join(__dirname, 'tech-rater.js'), 'utf8');
    // eslint-disable-next-line no-eval
    eval(techRaterCode);
    TechRaterClass = (typeof globalThis.TechRater !== 'undefined') ? globalThis.TechRater : null;
  } catch (e) {
    // 忽略：若 TechRater 已由外部注入则无需加载
    console.warn('[BattleManager] TechRater 加载失败（Node 环境）:', e);
  }
} else if (!TechRaterClass) {
  console.warn('[BattleManager] 浏览器环境未找到全局 TechRater：请先在页面以 <script> 引入 core/tech-rater.js。');
}


// ---------------------------------------------------------------------------
// 4. 内部 AI 性格预设（迁移自 V3 ai-player.js 的三种性格）
//    作为纯逻辑常驻数据，不导出
// ---------------------------------------------------------------------------
export const AI_PERSONALITIES = {
  // V4.3.35：六人格体系（完整配置）
  //  薇拉=试探布局（blind）、山田=全局控场（expert）、伊藤=冷静观察（mentor）
  //  沈墨=后发爆发（prober）、伊藤=假笔记误导（surround）、平均玩家=基准对照（average）
  // 原 reckless/steady 保留历史兼容

  // 试探/布局型：薇拉 —— 高失误、冲城堡、莽
  blind: {
    name: 'blind',
    displayName: '薇拉·试探布局',
    maxTechLevel: 4,
    discoveryRate: { 1: 1.0, 2: 0.7, 3: 0.4, 4: 0.2 },
    selectionStrategy: 'humanLike',
    techDirection: 'lowest',
    baseErrorRate: 0.18,
    interceptProbability: 0.25,   // 扫描调参：0.15→0.25（提升 AI 主动围攻频率，贴近 FunScore intercept 甜区 20-30%）
    speedCurve: 'erratic',
    speedMultiplier: { min: 0.5, max: 1.6 },
    baseThinkTime: { 1: 90, 2: 150, 3: 240, 4: 400 },
    blindBoxChance: 0.30,
    misreadChance: 0.40,
    siegeTime: 5000,
    stealPriority: 0.3,
    stealErrorRatePenalty: 0.3,
    // V4.3.35：三点连线人格参数
    noteRate: 0.25,               // v2.0：0.10→0.25（AI 更常写可见笔记）
    fakeNoteRate: 0.10,           // 假笔记概率 10%（低）
    noteTarget: 'random',         // 随机区域写笔记
    hubWeight: 0.95,              // v2.0：0.80→0.95（更莽——进攻时死磕目标据点）
    castlePreference: 'veryHigh', // 城堡偏好极高
    hubStrategy: 'rush',          // 开局直奔城堡据点
    leadErrorMult: 0.7,           // V5：领先时失误率 ×0.7
    behindErrorMult: 1.5,         // V5：落后时失误率 ×1.5
    speedUpOnStreak: true,        // 连错后提速
    speedUpAmount: 0.10,          // 提速 10%
    fillInterval: { min: 1.2, max: 1.8 }, // 填数间隔 1.2–1.8s
    burstInterval: 1.0,           // 爆发期间隔 1.0s
    burstThreshold: null,         // 无爆发阈值
  },
  // 全局控场型：山田 —— 精准、低失误、双路径
  expert: {
    name: 'expert',
    displayName: '山田·全局控场',
    maxTechLevel: 10,
    discoveryRate: {
      1: 0.9, 2: 0.95, 3: 1.0, 4: 1.0, 5: 1.0, 6: 0.95, 7: 0.9, 8: 0.85, 9: 0.75, 10: 0.65,
    },
    selectionStrategy: 'influence',
    techDirection: 'highest',
    baseErrorRate: 0.02,
    interceptProbability: 0.45,
    speedCurve: 'accelerating',
    speedMultiplier: { min: 0.6, max: 1.2 },
    baseThinkTime: {
      1: 60, 2: 100, 3: 160, 4: 250, 5: 360, 6: 500, 7: 650, 8: 840, 9: 1080, 10: 1350,
    },
    siegeTime: 5000,              // 扫描最优(SIEGE_MS=5000)：Boss 围攻时长
    stealPriority: 0.55,          // 扫描调参：0.7→0.55（压低抢格成功率，stealRate 朝 60-80% 甜区回拉）
    stealErrorRatePenalty: 0.15,  // 扫描调参：0.05→0.15（抢格时增加失误，stealRate 朝甜区回拉）
    // V4.3.35：三点连线人格参数
    noteRate: 0.15,               // v2.0：0.05→0.15（山田也写可见笔记，只写高阶关联格）
    fakeNoteRate: 0,              // 0% 假笔记
    noteTarget: 'nonHub',         // 只写高阶关联格
    hubWeight: 0.50,              // 开局 50/50 据点/全局
    castlePreference: 'medium',   // 中等城堡偏好
    hubStrategy: 'balanced',      // 劣势时据点权重拉到 80%
    // v2.0：expert 劣势拉 0.80→0.90（更凶——落后时集中火力抢据点）
    leadErrorMult: 0.7,           // V5：领先时失误率 ×0.7
    behindErrorMult: 1.5,         // V5：落后时失误率 ×1.5
    speedUpOnStreak: false,       // 连错后不提速
    speedUpAmount: 0,
    fillInterval: { min: 1.5, max: 2.2 },
    burstInterval: 1.4,
    burstThreshold: null,
  },
  // 冷静观察型：伊藤 —— 慢、放水、示范
  mentor: {
    name: 'mentor',
    displayName: '伊藤·冷静观察',
    maxTechLevel: 8,
    discoveryRate: {
      1: 1.0, 2: 1.0, 3: 0.95, 4: 0.9, 5: 0.85, 6: 0.8, 7: 0.7, 8: 0.6,
    },
    selectionStrategy: 'humanLike',
    techDirection: 'lowest',
    baseErrorRate: 0.08,          // 8% 失误率（比之前的 0.05 高，符合 spec 要求）
    interceptProbability: 0.35,   // 扫描调参：0.25→0.35（提升围攻频率，贴近 intercept 甜区）
    speedCurve: 'steady',
    speedMultiplier: { min: 0.9, max: 1.3 },
    baseThinkTime: {
      1: 70, 2: 120, 3: 200, 4: 320, 5: 460, 6: 620, 7: 800, 8: 1000,
    },
    siegeTime: 5000,              // 扫描最优(SIEGE_MS=5000)：Boss 围攻时长
    stealPriority: 0.5,
    stealErrorRatePenalty: 0.15,
    // V4.3.35：三点连线人格参数
    noteRate: 0.30,               // 笔记频率 30%
    fakeNoteRate: 0,              // 0% 假笔记
    noteTarget: 'hub',            // 据点宫写完整候选
    hubWeight: 0.15,              // v2.0：0.30→0.15（更放水——教学陪练少抢据点）
    castlePreference: 'low',      // 城堡偏好低
    hubStrategy: 'avoid',         // 前 20 秒不碰据点
    leadErrorMult: 0.7,           // V5：领先时失误率 ×0.7
    behindErrorMult: 1.5,         // V5：落后时失误率 ×1.5
    speedUpOnStreak: false,       // 不提速
    speedUpAmount: 0,
    fillInterval: { min: 2.5, max: 3.5 }, // 最慢 2.5–3.5s
    burstInterval: null,          // 无爆发期
    burstThreshold: null,
  },
  // 后发爆发型：沈墨 —— 前期装弱、后期爆发
  prober: {
    name: 'prober',
    displayName: '沈墨·后发爆发',
    maxTechLevel: 8,
    discoveryRate: {
      1: 1.0, 2: 0.95, 3: 0.9, 4: 0.85, 5: 0.8, 6: 0.75, 7: 0.7, 8: 0.65,
    },
    selectionStrategy: 'humanLike',
    techDirection: 'lowest',
    baseErrorRate: 0.12,          // 12% 失误率（比之前的 0.06 高，符合 spec 要求）
    interceptProbability: 0.3,    // 扫描调参：0.2→0.3（提升围攻频率，贴近 intercept 甜区）
    speedCurve: 'accelerating',
    speedMultiplier: { min: 0.7, max: 1.5 },
    baseThinkTime: {
      1: 80, 2: 140, 3: 230, 4: 350, 5: 500, 6: 680, 7: 880, 8: 1120,
    },
    siegeTime: 5000,              // 扫描最优(SIEGE_MS=5000)：Boss 围攻时长
    stealPriority: 0.4,
    stealErrorRatePenalty: 0.2,
    // V4.3.35：三点连线人格参数
    noteRate: 0.50,               // 前期 50% 笔记频率
    fakeNoteRate: 0.40,           // 40% 假笔记（前期钓鱼）
    noteTarget: 'random',         // 前期随机写
    hubWeight: 0.10,              // v2.0：0.20→0.10（前期更收敛——潜伏观察）
    castlePreference: 'low',      // 城堡偏好低
    hubStrategy: 'probe',         // 前期不碰据点，中期试探
    // v2.0：prober 爆发 hubWeight 0.70→0.85（见 _getHubWeightFactor）
    leadErrorMult: 0.7,           // V5：领先时失误率 ×0.7
    behindErrorMult: 1.5,         // V5：落后时失误率 ×1.5
    speedUpOnStreak: true,        // 连错后提速
    speedUpAmount: 0.30,          // 提速 30%（爆发）
    fillInterval: { min: 2.5, max: 3.5 }, // 前期慢
    burstInterval: 1.0,           // 爆发期 1.0s
    burstThreshold: 0.40,         // 40% 盘面进度时触发爆发
  },
  // 平均玩家型 —— 基准对照组，无极端特征
  average: {
    name: 'average',
    displayName: '平均玩家型',
    maxTechLevel: 6,
    discoveryRate: {
      1: 1.0, 2: 0.95, 3: 0.9, 4: 0.8, 5: 0.7, 6: 0.55,
    },
    selectionStrategy: 'humanLike',
    techDirection: 'lowest',
    baseErrorRate: 0.08,
    interceptProbability: 0.3,
    speedCurve: 'steady',
    speedMultiplier: { min: 0.8, max: 1.3 },
    baseThinkTime: {
      1: 70, 2: 120, 3: 190, 4: 300, 5: 430, 6: 580,
    },
    blindBoxChance: 0.05,
    misreadChance: 0.2,
    siegeTime: 3000,
    stealPriority: 0.5,
    stealErrorRatePenalty: 0.15,
    // V4.3.35：三点连线人格参数
    noteRate: 0.30,               // 笔记频率 30%
    fakeNoteRate: 0,              // 0% 假笔记
    noteTarget: 'hub',            // 据点宫写完整候选
    hubWeight: 0.55,              // v2.0：0.50→0.55（平均玩家略偏据点）
    castlePreference: 'medium',   // 中等城堡偏好
    hubStrategy: 'average',       // 均衡分配，无极端偏好
    leadErrorMult: 0.7,           // V5：领先时失误率 ×0.7
    behindErrorMult: 1.5,         // V5：落后时失误率 ×1.5
    speedUpOnStreak: false,       // 不提速
    speedUpAmount: 0,
    fillInterval: { min: 1.5, max: 2.0 },
    burstInterval: null,
    burstThreshold: null,
  },

  // 冒失型（保留，历史兼容）
  reckless: {
    name: 'reckless',
    displayName: '冒失型',
    maxTechLevel: 5,
    discoveryRate: { 1: 1.0, 2: 0.95, 3: 0.85, 4: 0.7, 5: 0.5 },
    selectionStrategy: 'humanLike',
    techDirection: 'lowest',
    baseErrorRate: 0.12,
    interceptProbability: 0.25,
    speedCurve: 'erratic',
    speedMultiplier: { min: 0.6, max: 1.5 },
    baseThinkTime: { 1: 80, 2: 140, 3: 220, 4: 360, 5: 520 },
    // V4.3.34：AI睁眼——抢对手格配置
    stealPriority: 0.4,
    stealErrorRatePenalty: 0.25,
  },
  // 稳健型（保留，历史兼容）
  steady: {
    name: 'steady',
    displayName: '稳健型',
    maxTechLevel: 10,
    discoveryRate: {
      1: 1.0, 2: 1.0, 3: 1.0, 4: 0.98, 5: 0.95, 6: 0.9, 7: 0.85, 8: 0.8, 9: 0.7, 10: 0.6,
    },
    selectionStrategy: 'humanLike',
    techDirection: 'lowest',
    baseErrorRate: 0.02,
    interceptProbability: 0.4,
    speedCurve: 'steady',
    speedMultiplier: { min: 0.8, max: 1.2 },
    baseThinkTime: {
      1: 60, 2: 110, 3: 180, 4: 280, 5: 400, 6: 560, 7: 720, 8: 920, 9: 1200, 10: 1500,
    },
    // V4.3.34：AI睁眼——抢对手格配置
    stealPriority: 0.6,
    stealErrorRatePenalty: 0.08,
    siegeTime: 5000,              // 扫描最优(SIEGE_MS=5000)：Boss 围攻时长
  },
  // 假笔记误导型：伊藤 —— 假笔记、声东击西
  surround: {
    name: 'surround',
    displayName: '伊藤·假笔记误导',
    maxTechLevel: 8,
    discoveryRate: {
      1: 1.0, 2: 0.98, 3: 0.95, 4: 0.9, 5: 0.85, 6: 0.8, 7: 0.75, 8: 0.7,
    },
    selectionStrategy: 'humanLike',
    techDirection: 'lowest',
    baseErrorRate: 0.06,
    interceptProbability: 0.65,
    speedCurve: 'accelerating',
    speedMultiplier: { min: 0.6, max: 1.4 },
    baseThinkTime: {
      1: 70, 2: 130, 3: 210, 4: 320, 5: 460, 6: 640, 7: 840, 8: 1080,
    },
    stealPriority: 0.55,          // 扫描调参：0.8→0.55（压低 Boss 抢格成功率，stealRate 朝 60-80% 甜区回拉）
    stealErrorRatePenalty: 0.2,   // 扫描调参：0.1→0.2（抢格时增加失误，stealRate 朝甜区回拉）
    // V4.3.35：三点连线人格参数
    noteRate: 0.60,               // 笔记频率 60%（最高）
    fakeNoteRate: 0.80,           // 80% 假笔记（最高；仅对真实玩家生效——AI 对战对手看不见笔记内容）
    noteTarget: 'nonHub',         // 非据点宫写假笔记
    hubWeight: 0.80,              // v2.0：0.70→0.80（更阴——专攻玩家防守最弱据点）
    castlePreference: 'medium',   // 中等城堡偏好
    hubStrategy: 'surround',      // 专攻玩家防守最弱据点
    leadErrorMult: 0.7,           // V5：领先时失误率 ×0.7
    behindErrorMult: 1.5,         // V5：落后时失误率 ×1.5
    speedUpOnStreak: true,        // 连错后提速
    speedUpAmount: 0.10,          // 提速 10%
    fillInterval: { min: 1.2, max: 1.8 }, // 中速 1.2–1.8s
    burstInterval: 1.3,           // 爆发期间隔 1.3s
    siegeTime: 5000,              // 扫描最优(SIEGE_MS=5000)：Boss 围攻时长
    burstThreshold: null,
  },
};

const TECH_LEVEL_MAP = {
  nakedSingle: 1,
  cageUnique: 2,
  hiddenSingle: 3,
  rule45: 4,
  nakedPair: 5,
  hiddenPair: 6,
  pointingClaiming: 7,
  nakedTriplet: 8,
  xWing: 9,
  swordfish: 10,
};


// ---------------------------------------------------------------------------
// 5. AIPlayerCore - 内部推理型对战AI（不导出）
//    迁移自 V3 ai-player.js 的核心逻辑，直接基于 TechRater 选格。
//    纯逻辑，无 DOM/渲染依赖。
// ---------------------------------------------------------------------------
// V4.3.30：导出 AIPlayerCore 供双 AI 对战/测试驱动（玩家侧 AI 复用同一推理核心）
export class AIPlayerCore {
  /**
   * @param {Board} board - 棋盘引用（HeadlessEngine 的 Board 实例）
   * @param {string|object} personality - 性格ID或自定义性格配置
   * @param {Function|null} getCellCategory - 可选三色分类回调 (r,c)=>category|null
   * @param {boolean} colorWeightEnabled - 是否启用三色加权
   */
  constructor(board, personality = 'steady', getCellCategory = null, colorWeightEnabled = true, enableObserver = true) {
    this._board = board;
    this._size = board.size;
    this._personality = (typeof personality === 'string')
      ? (AI_PERSONALITIES[personality] || AI_PERSONALITIES.steady)
      : Object.assign({}, AI_PERSONALITIES.steady, personality);
    this._rater = null;
    this._moveCount = 0;
    this._lastStep = null;
    this._getCellCategory = (typeof getCellCategory === 'function') ? getCellCategory : null;
    this._colorWeightEnabled = !!colorWeightEnabled;
    // V4.3.40：对手观察器（可关闭——A/B 测试 --noObserver）
    this._observerEnabled = !!enableObserver;
    this._observer = this._observerEnabled ? new OpponentObserver(board.size) : null;
    this._opponentAnalysis = null;
    // V4.3.40：观察器驱动的临时决策变量（think() 开头刷新）
    this._tempHubPenalty = -1;      // 对手热区据点索引（-1 无）
    this._tempSpeedScale = 1.0;     // 节奏速度缩放
    this._tempDefenseWeight = 1.0;  // 对抗性防守权重
    this._tempHubWeight = 1.0;      // 策略模式据点权重系数
    // V4.3.42（V2）：人格差异化临时变量
    this._tempFakeBoost = 1.0;      // 假笔记率强化系数（伊藤·误导）
    this._tempObserveOnly = false;  // 观察不利用（伊藤·放水）/沈墨前期不响应
    // CM4-D1 步骤4：Director 笔记导演语言——phase 三态调制 noteCadence（null=用人格默认）
    this._tempNoteRate = null;      // 覆盖人格 noteRate（调制模式下由 Director 决策下发）
    this._tempFakeRate = null;      // 覆盖人格 fakeNoteRate
    // V4.3.23（Spec v1.2）：关键格抢格偏好（由 BattleManager 注入）
    this._hotspotPriority = 0;
    this._getHotspots = null;
    // V4.3.25（Spec v1.4）：笔记心理战——AI 注意力图 + 假笔记检测
    this._noteAttentionMap = new Map();   // 'r,c' -> 1(留意)/2(高度关注)
    // V4.3.33：AI睁眼——对手 ownership 感知（由 BattleManager 注入）
    this._playerOwned = null;  // 2D boolean grid: 对手占领格
    this._aiOwned = null;      // 2D boolean grid: 自己占领格
    // V4.3.35：三点连线人格系统——游戏状态
    this._gameState = {
      isLeading: null,        // 是否领先（据点数比较）
      leaderHubCount: 0,      // 领先方据点数
      selfHubCount: 0,        // 自己据点数
      opponentHubCount: 0,    // 对方据点数
      progress: 0,            // 盘面进度 0-1
      consecutiveErrors: 0,   // 连续失误次数
      consecutiveCorrect: 0,  // v2.0：连续填对数（动态错误率连对3次×0.8）
      isBurst: false,         // 是否处于爆发期
      hubBlocks: [],          // 据点宫索引 [3]
      castleHubIdx: -1,       // 城堡宫索引
      hubOwnership: [],       // 据点归属 ['player'|'boss'|null]
      playerDefense: {},      // 玩家各据点防守强度
    };
    // v2.0：AI 策略状态机——从"概率机器"升级为"有战略意图的对手"
    this._currentStrategy = 'attack';  // 'attack' | 'defend' | 'global' | 'counter'
    this._targetHubIdx = -1;           // 当前聚焦的据点索引（0,1,2）
    this._strategyCooldown = 0;        // 策略切换冷却（防抖）
    this._hubStateCounts = [];         // 各据点维度计数 [{id, player, boss, visible, occupiedBy}]
    this._migrationFailed = false;     // 迁移失败（全局解题策略触发条件）
    // CM4-D1：对抗戏剧导演引擎（默认 Shadow 模式，不改行为）
    this._director = null;             // Director 实例（可选注入）
    this._directorShadow = true;       // 默认 Shadow：只记录建议，不改行为
    this._directorDecision = null;     // 最近一次 Director 决策（供 HUD/调试）
    this._dramaDirective = null;       // CM4-R7-A：Drama 指令（目标据点偏好，供 Director 消费）
    // CM4-R6：Strategy Activation Layer——把 Director 意图安全钳制为 Solver 旋钮
    this._strategySelector = new StrategySelector();
    // V4.3.35：笔记行为计数器
    this._noteWritten = 0;
    this._lastNoteStep = -10; // 最近写笔记的步数（初始设为负值避免限制）
    // V4.3.35：AI 专属笔记管理（不依赖 board.candidates，避免污染棋盘）
    this._aiNotes = new Map(); // 'r,c' -> Set<number> AI 自己的笔记
    this._initRater();

    // CM4-R8：DifficultyProfile → AI 执行层的人类化失误模型。
    // 只改"执行/观察"层，不改 Director / StrategySelector / Solver 算法本身。
    //   maxTech        搜索/解析深度上限（candidateDepth）
    //   mistakeRate    人类化失误率（baseErrorRate 目标）
    //   perceptionNoise 认知偏差：偶尔误判哪个据点更危险
    //   fixationRate   贪心固化：少一回合才切换进攻路线
    //   reactionDelay  响应延迟：玩家换路后 AI 观察 N 步才调整
    this._human = null;
    this._observedKey = null;   // 反应延迟：最近一次观察键
    this._switchLagLeft = 0;    // 反应延迟剩余步数
    this._prevFixate = null;    // 贪心固化：上一策略快照
  }

  /**
   * CM4-R8：运行时注入难度档的人类化失误模型（由 TplBattleController 在合成 AI 后调用）。
   * 不改人格/Solver，仅叠加"人类直觉偏差"层。
   * @param {Object|null} profile - { maxTech, mistakeRate, perceptionNoise, fixationRate, reactionDelay }
   */
  setDifficultyProfile(profile) {
    if (!profile || profile.mistakeRate == null) { this._human = null; return; }
    this._human = {
      maxTech: profile.maxTech != null ? profile.maxTech : 8,
      mistakeRate: profile.mistakeRate != null ? profile.mistakeRate : 0,
      perceptionNoise: profile.perceptionNoise != null ? profile.perceptionNoise : 0,
      fixationRate: profile.fixationRate != null ? profile.fixationRate : 0,
      reactionDelay: profile.reactionDelay != null ? profile.reactionDelay : 0,
    };
    // 同步到人格：maxTech 深度 + baseErrorRate（人类化失误率）
    if (this._personality) {
      this._personality = Object.assign({}, this._personality);
      const curTech = this._personality.maxTechLevel;
      this._personality.maxTechLevel = Math.max(0, Math.min((curTech != null ? curTech : 8), this._human.maxTech));
      this._personality.baseErrorRate = Math.min(0.5, this._human.mistakeRate);
    }
    // 切换难度后重置状态机缓存
    this._observedKey = null;
    this._switchLagLeft = 0;
    this._prevFixate = null;
  }

  /**
   * CM4-R8：认知偏差——把观察器判定的"最危险据点"换成另一个"看起来也可疑"的据点。
   * 不是随机乱下：换的是 AI 主观判断有危胁的据点，让它"慢半拍守错路"而非送分。
   */
  _applyPerceptionNoise(a) {
    if (!this._human || !a || a.targetHub < 0 || this._human.perceptionNoise <= 0) return a;
    if (Math.random() >= this._human.perceptionNoise) return a;
    const hubs = (this._gameState && this._gameState.hubBlocks) || [];
    if (hubs.length < 2) return a;
    let alt = a.targetHub;
    for (let i = 0; i < 6; i++) {
      const cand = hubs[Math.floor(Math.random() * hubs.length)];
      if (cand !== a.targetHub) { alt = cand; break; }
    }
    if (alt === a.targetHub) return a;
    const out = Object.assign({}, a);
    out.targetHub = alt;
    out._misjudged = true; // 供对白层反馈
    return out;
  }

  /**
   * CM4-R8：反应延迟——玩家换了打法后，AI "再观察 N 步"才把观察器结论落到临时权重。
   * 让玩家感觉"我骗到了它"，而不是"它每次都知道"。
   */
  _applyReactionGate(prevTemp) {
    const h = this._human;
    const lag = h ? (h.reactionDelay || 0) : 0;
    if (lag <= 0) return;
    const a = this._opponentAnalysis || {};
    const key = (a.targetHub != null ? a.targetHub : -1) + '|' + (a.strategy || '') + '|' + (a.aggression > 0.4 ? 1 : 0);
    if (key !== this._observedKey) { this._observedKey = key; this._switchLagLeft = lag; }
    if (this._switchLagLeft > 0) {
      this._switchLagLeft--;
      // 滞后期：沿用上一帧生效的观察权重（慢半拍反应）
      if (prevTemp) {
        this._tempHubPenalty = prevTemp.hubPenalty;
        this._tempSpeedScale = prevTemp.speedScale;
        this._tempDefenseWeight = prevTemp.defenseWeight;
        this._tempHubWeight = prevTemp.hubWeight;
        this._tempFakeBoost = prevTemp.fakeBoost;
      }
    }
  }

  /**
   * CM4-R8：贪心固化——AI 偶尔"贪着眼前的肉"，晚一个决策周期才切换进攻路线。
   * 守卫：涉及反击（counter）时永不固化（人类也会优先救自己已占的据点）。
   */
  _applyFixation() {
    const h = this._human;
    if (!h || !(h.fixationRate > 0)) return;
    const cur = this._currentStrategy;
    if (cur === 'counter') return;
    const prev = this._prevFixate;
    if (!prev) { this._prevFixate = { s: cur, h: this._targetHubIdx }; return; }
    if (prev.s !== 'counter' && cur !== prev.s && Math.random() < h.fixationRate) {
      // 固守旧路线（旧据点），相当于"没注意到该换位"
      this._currentStrategy = prev.s;
      this._targetHubIdx = prev.h;
    }
    this._prevFixate = { s: this._currentStrategy, h: this._targetHubIdx };
  }

  /**
   * V4.3.23：注入关键格信息与抢格概率
   * @param {number} priority - 0-1 抢关键格概率（expert 0.8 / mentor 0.5 / blind 0）
   * @param {Function} getter - 返回当前关键格数组 [{r,c}]
   */
  setHotspotPriority(priority, getter) {
    this._hotspotPriority = priority || 0;
    this._getHotspots = (typeof getter === 'function') ? getter : null;
  }

  // ---- V4.3.34：AI睁眼——对手 ownership 感知 ----

  /**
   * 注入 ownership 网格（由 BattleManager 调用）
   * @param {boolean[][]} playerOwned - 2D 网格，true=对手已占领
   * @param {boolean[][]} aiOwned - 2D 网格，true=自己已占领
   */
  setOwnershipGrids(playerOwned, aiOwned) {
    this._playerOwned = playerOwned;
    this._aiOwned = aiOwned;
  }

  /**
   * 判断该格是否被对手占领（玩家侧）
   */
  _isPlayerOwned(r, c) {
    return this._playerOwned && this._playerOwned[r] && this._playerOwned[r][c] === true;
  }

  /**
   * 判断该格是否被自己（AI）占领
   */
  _isAiOwned(r, c) {
    return this._aiOwned && this._aiOwned[r] && this._aiOwned[r][c] === true;
  }

  // ---- CM4-D1：对抗戏剧导演引擎注入 ----

  /**
   * 注入 Director（对抗戏剧导演）。默认 Shadow 模式：只记录 Director 建议，
   * 不改 Solver 行为，用于校准双级 ε。
   * @param {Director} director
   * @param {boolean} [shadow=true] - true=只记录不改行为；false=启用调制
   */
  setDirector(director, shadow = true) {
    this._director = director;
    this._directorShadow = !!shadow;
    // CM4-R6：shadow → selector 同步（shadow=1 时 selector 禁用，不激活）
    if (this._strategySelector) this._strategySelector.setEnabled(!shadow);
  }

  /**
   * CM4-R7-A：注入 Drama 指令（Drama Planner 产出的目标据点偏好）。
   * 由控制器在 think() 前调用，Director 在 decide() 内消费。
   * @param {Object|null} directive - { beat, targetHub, pressure } 或 null
   */
  setDramaDirective(directive) {
    this._dramaDirective = directive || null;
  }

  /**
   * CM4-R6：查询 Strategy Activation Layer 运行统计（供校准/调试）。
   * @returns {{ enabled:boolean, activations:number, fallbacks:number, lastReason:string|null }}
   */
  getStrategySelectorStats() {
    if (!this._strategySelector) return null;
    const s = this._strategySelector;
    return {
      enabled: s.enabled,
      activations: s.getStats().activations,
      fallbacks: s.getStats().fallbacks,
      lastReason: s.getLastReason(),
    };
  }

  /**
   * 获取最近一次 Director 决策（供 HUD/调试）
   */
  getDirectorDecision() {
    return this._directorDecision ? { ...this._directorDecision } : null;
  }

  /**
   * 将 Solver 实际策略（attack/defend/global/counter）映射为 Director 叙事近似 id，
   * 供 Shadow 比对"建议 vs 实际"。
   * @returns {string|null}
   */
  _mapActualStrategyToDirector() {
    switch (this._currentStrategy) {
      case 'attack': return 'pressure';
      case 'defend': return 'fortify';
      case 'counter': return 'steal';
      case 'global': return 'probe';
      default: return null;
    }
  }

  /**
   * 每步调用 Director 决策（Shadow 或调制）。
   * 在 think() 开头由驱动链路调用。
   */
  _runDirector() {
    if (!this._director) return null;
    const decision = this._director.decide(
      this._gameState,
      { analysis: this._opponentAnalysis || null },
      { stepCount: this._moveCount, shadow: this._directorShadow, actualStrategyId: this._mapActualStrategyToDirector(), drama: this._dramaDirective || null }
    );
    this._directorDecision = decision;
    // Shadow 模式不下发调制参数
    if (!this._directorShadow) {
      this._applyDirectorParams(decision);
    }
    return decision;
  }

  /**
   * CM4-R6：将 Director 决策经 Strategy Activation Layer 安全映射到 Solver 旋钮。
   * 通过 StrategySelector 钳制到人格同源边界；若决策无效/越界 → 回退人格基线。
   * @param {Object} decision - Director.decide() 返回
   */
  _applyDirectorParams(decision) {
    if (!this._strategySelector) return;
    const profile = this._strategySelector.resolve(decision);
    if (!profile) return; // 回退：不覆盖任何旋钮，保持人格基线

    // targetSource → 策略方向（Director 只选剧本方向，不选格子）
    if (profile.targetStrategy) {
      this._currentStrategy = profile.targetStrategy;
    }
    // hubWeight 倍数调制 tempHubWeight（现有旋钮）
    if (profile.hubWeightMult != null) {
      this._tempHubWeight = profile.hubWeightMult;
    }
    // stealLevel → 防守权重代理（保留现有旋钮）
    if (profile.stealLevel != null) {
      this._tempDefenseWeight = 0.5 + profile.stealLevel;
    }
    // 笔记导演语言——phase 三态 + 策略基调下发 noteCadence
    if (profile.noteCadence) {
      if (typeof profile.noteCadence.noteRate === 'number') this._tempNoteRate = profile.noteCadence.noteRate;
      if (typeof profile.noteCadence.fakeRate === 'number') this._tempFakeRate = profile.noteCadence.fakeRate;
    }
    // CM4-R7-A：Drama 目标偏好——导演决定"施压哪一翼"，在进攻态势下覆盖目标据点。
    // 只改现有 _targetHubIdx（目标偏好），非新权重轴；压力策略才生效。
    if (decision.params && decision.params.targetHub != null && Number.isInteger(decision.params.targetHub)) {
      const inPressure = profile.targetStrategy === 'attack' || this._currentStrategy === 'attack'
        || this._currentStrategy === 'counter';
      if (inPressure) {
        this._targetHubIdx = decision.params.targetHub;
      }
    }
  }

  // ---- V4.3.35：三点连线人格系统 ----

  /**
   * 注入游戏状态（由 duel-ai-tpl.mjs 调用，供情绪/据点策略使用）
   * @param {Object} state - 游戏状态
   * @param {boolean} state.isLeading - 是否领先
   * @param {number} state.selfHubCount - 自己据点数
   * @param {number} state.opponentHubCount - 对方据点数
   * @param {number} state.progress - 盘面进度 0-1
   * @param {number} state.consecutiveErrors - 连续失误次数
   * @param {number[]} state.hubBlocks - 据点宫索引
   * @param {number} state.castleHubIdx - 城堡宫索引
   * @param {string[]} state.hubOwnership - 据点归属数组
   * @param {Object} state.playerDefense - 玩家各据点防守强度
   */
  setGameState(state) {
    if (!state) return;
    if (state.isLeading !== undefined) this._gameState.isLeading = state.isLeading;
    if (state.selfHubCount !== undefined) this._gameState.selfHubCount = state.selfHubCount;
    if (state.opponentHubCount !== undefined) this._gameState.opponentHubCount = state.opponentHubCount;
    if (state.progress !== undefined) this._gameState.progress = state.progress;
    if (state.consecutiveErrors !== undefined) this._gameState.consecutiveErrors = state.consecutiveErrors;
    if (state.consecutiveCorrect !== undefined) this._gameState.consecutiveCorrect = state.consecutiveCorrect;
    if (state.isBurst !== undefined) this._gameState.isBurst = state.isBurst;
    if (state.hubBlocks !== undefined) this._gameState.hubBlocks = state.hubBlocks;
    if (state.castleHubIdx !== undefined) this._gameState.castleHubIdx = state.castleHubIdx;
    if (state.hubOwnership !== undefined) this._gameState.hubOwnership = state.hubOwnership;
    if (state.playerDefense !== undefined) this._gameState.playerDefense = state.playerDefense;
    // v2.0：策略状态机输入——各据点维度计数 + 迁移失败标记
    if (state.hubCounts !== undefined) this._hubStateCounts = state.hubCounts;
    if (state.migrationFailed !== undefined) this._migrationFailed = !!state.migrationFailed;
  }

  /**
   * 获取当前游戏状态（供外部调试/渲染使用）
   */
  getGameState() {
    return { ...this._gameState };
  }

  // ======================================================
  //  v2.0：AI 策略状态机（进攻/防守/全局解题/反击）
  //  让 AI 从"每步独立选格"升级为"有阶段性目标的对手"
  // ======================================================

  /**
   * 获取当前策略（供 HUD 显示 / 驱动日志 / 策略切换检测）
   * @returns {{ strategy: string, targetHub: number, label: string }}
   */
  getStrategy() {
    const labels = {
      attack: '进攻',
      defend: '防守',
      global: '全局解题',
      counter: '反击',
    };
    return {
      strategy: this._currentStrategy,
      targetHub: this._targetHubIdx,
      label: labels[this._currentStrategy] || this._currentStrategy,
    };
  }

  /**
   * v2.0：根据游戏状态 + 观察器分析决定当前策略（每步在 think() 开头调用）
   * 优先级：紧急反击 > 全局解题 > 防守 > 进攻
   * @returns {string} 'attack' | 'defend' | 'global' | 'counter'
   */
  _determineStrategy() {
    const state = this._gameState;
    const analysis = this._opponentAnalysis || { targetHub: -1 };
    const selfHubs = state.selfHubCount || 0;
    const oppHubs = state.opponentHubCount || 0;
    const progress = state.progress || 0;
    const hubOwnership = state.hubOwnership || [];
    const counts = this._hubStateCounts || [];

    // 1. 紧急反击：对手正在冲 AI 已占领的据点（Observer 检测到热区）
    const myOwnedHubs = hubOwnership.map((o, i) => o === 'boss' ? i : -1).filter(i => i >= 0);
    if (analysis.targetHub >= 0 && myOwnedHubs.includes(analysis.targetHub)) {
      this._targetHubIdx = analysis.targetHub;
      this._currentStrategy = 'counter';
      return 'counter';
    }

    // 2. 全局解题：迁移失败 或 进度 >75% 且据点不领先
    if (this._migrationFailed) {
      this._currentStrategy = 'global';
      return 'global';
    }
    if (progress > 0.75 && selfHubs <= oppHubs) {
      this._currentStrategy = 'global';
      return 'global';
    }

    // 3. 防守：已占 ≥2 据点且领先 → 巩固己方最危险据点（计数最少）
    if (selfHubs >= 2 && selfHubs > oppHubs) {
      let minCount = Infinity;
      let target = myOwnedHubs[0] != null ? myOwnedHubs[0] : -1;
      for (let i = 0; i < hubOwnership.length; i++) {
        if (hubOwnership[i] === 'boss') {
          const cnt = counts[i] ? counts[i].boss : 0;
          if (cnt < minCount) { minCount = cnt; target = i; }
        }
      }
      this._targetHubIdx = target >= 0 ? target : (myOwnedHubs[0] != null ? myOwnedHubs[0] : 0);
      this._currentStrategy = 'defend';
      this._applyFixation();
      return this._currentStrategy;
    }

    // 4. 默认：进攻——选最薄弱据点（AI 计数低 + 对手防守弱）
    let worstScore = Infinity;
    let worstIdx = 0;
    const playerDefense = state.playerDefense || {};
    const hubCount = hubOwnership.length || 3;
    for (let i = 0; i < hubCount; i++) {
      // 已占领的据点无需再攻
      if (hubOwnership[i] === 'boss') continue;
      const aiCnt = counts[i] ? counts[i].boss : 0;
      const playerCnt = counts[i] ? counts[i].player : 0;
      const def = playerDefense[i] || 0;
      const score = (playerCnt - aiCnt) + def * 2; // 防守越强分越高（更难攻）
      if (score < worstScore) { worstScore = score; worstIdx = i; }
    }
    this._targetHubIdx = worstIdx;
    this._currentStrategy = 'attack';
    this._applyFixation();
    return this._currentStrategy;
  }

  /**
   * V4.3.40：记录对手的一步（由对战驱动在对方填数后调用）
   * @param {Object} opponentMove - { r, c, hubIdx, isGhostSteal }
   */
  updateObserver(opponentMove) {
    if (!this._observer) return;
    if (!opponentMove) return;
    this._observer.record(
      opponentMove.r,
      opponentMove.c,
      opponentMove.isGhostSteal || false,
      opponentMove.hubIdx
    );
  }

  /**
   * V4.3.40：获取对手分析结果（供调试/决策）
   */
  getOpponentAnalysis() {
    return this._observer ? this._observer.getAnalysis() : null;
  }

  /**
   * V4.3.40：当前是否启用观察器
   */
  isObserverEnabled() {
    return this._observerEnabled;
  }

  /**
   * V4.3.44：运行时设置观察窗口（历史记录长度）
   */
  setObserverWindow(window) {
    if (this._observer) this._observer.configure(window, undefined);
  }

  /**
   * V4.3.44：运行时设置观察响应强度（放大/缩小决策系数）
   */
  setObserverIntensity(intensity) {
    if (this._observer) this._observer.configure(undefined, intensity);
  }

  /**
   * 判断该格是否在据点宫（hub）内
   */
  _isInHubBlock(r, c) {
    const hubs = this._gameState.hubBlocks;
    if (!hubs || hubs.length === 0) return false;
    const size = this._size;
    const boxH = size <= 6 ? 2 : 3;
    const boxW = size / boxH;
    const br = Math.floor(r / boxH);
    const bc = Math.floor(c / boxW);
    const blockIdx = br * boxH + bc;
    return hubs.includes(blockIdx);
  }

  /**
   * 判断该格是否在城堡宫（castle hub）内
   */
  _isInCastleHub(r, c) {
    const castleIdx = this._gameState.castleHubIdx;
    if (castleIdx < 0) return false;
    const size = this._size;
    const boxH = size <= 6 ? 2 : 3;
    const boxW = size / boxH;
    const br = Math.floor(r / boxH);
    const bc = Math.floor(c / boxW);
    const blockIdx = br * boxH + bc;
    return blockIdx === castleIdx;
  }

  /**
   * 计算动态错误率（基于情绪参数调整）
   * @returns {number} 调整后的错误率
   */
  _calcDynamicErrorRate() {
    const p = this._personality;
    let rate = p.baseErrorRate || 0.05;

    // v2.0 5.2：动态错误率——领先 ×0.7（更稳），落后 ×1.5（更急）
    if (this._gameState.isLeading === true) {
      rate *= 0.7;
    } else if (this._gameState.isLeading === false) {
      rate *= 1.5;
    }

    // v2.0 5.2：连续 3 次填对 → ×0.8（进入状态）
    if ((this._gameState.consecutiveCorrect || 0) >= 3) {
      rate *= 0.8;
    }

    // v2.0 5.2：连续 2 次填错 → ×1.3（焦虑螺旋）
    if (this._gameState.consecutiveErrors >= 2) {
      rate *= 1.3;
    }

    return Math.min(rate, 0.95);
  }

  /**
   * 计算动态填数间隔（秒）
   * @returns {number} 填数间隔秒数
   */
  _calcDynamicInterval() {
    const p = this._personality;
    const interval = p.fillInterval || { min: 1.5, max: 2.0 };
    let base = interval.min + Math.random() * (interval.max - interval.min);

    // 爆发期提速
    if (this._gameState.isBurst && p.burstInterval != null) {
      base = Math.min(base, p.burstInterval);
    }

    // 连错后提速
    if (p.speedUpOnStreak && this._gameState.consecutiveErrors >= 2) {
      base *= (1 - p.speedUpAmount);
    }

    // 落后时提速（自然反应）
    if (this._gameState.isLeading === false) {
      base *= 0.85; // 落后时略快
    }

    // V4.3.40：节奏感知——对手加速则加快响应（×0.8），减速则放缓（×1.2）
    base *= this._tempSpeedScale;

    return Math.max(base, 0.5); // 最低 0.5s
  }

  /**
   * 判断是否应该写笔记（代替填数）
   * @returns {boolean}
   */
  _shouldWriteNote() {
    const p = this._personality;
    // CM4-D1 步骤4：Director 笔记导演语言优先于人格基准（调制模式下下发 _tempNoteRate/_tempFakeRate）
    const noteRate = this._tempNoteRate != null ? this._tempNoteRate : (p.noteRate || 0);
    const fakeRate = this._tempFakeRate != null ? this._tempFakeRate : (p.fakeNoteRate || 0);
    // V4.3.40：真/假笔记独立控制——fakeNoteRate>0 时也应写笔记（假笔记由 _isFakeNote 判定）
    if (noteRate <= 0 && fakeRate <= 0) return false;

    // 沈墨（prober）后期不写笔记
    if (p.name === 'prober' && this._gameState.progress > (p.burstThreshold || 0.4)) {
      return false;
    }

    // 避免连续写笔记（最多每隔 3 步写一次）
    if (this._noteWritten > 0 && this._moveCount - this._lastNoteStep < 3) {
      return false;
    }

    return Math.random() < Math.max(noteRate, fakeRate);
  }

  /**
   * 判断是否为假笔记
   * @returns {boolean}
   */
  _isFakeNote() {
    const p = this._personality;
    // CM4-D1 步骤4：Director 调制 _tempFakeRate（如 Crisis 增假笔记 / Trap 诱导）
    let fakeRate = this._tempFakeRate != null ? this._tempFakeRate : (p.fakeNoteRate || 0);
    if (fakeRate <= 0) return false;
    // V4.3.42（V2）：假笔记强化——热区检测到时假笔记率 ×1.5（误导对手）
    fakeRate *= this._tempFakeBoost;
    return Math.random() < fakeRate;
  }

  /**
   * 获取笔记目标格
   * @returns {{r: number, c: number}|null} 目标格坐标
   */
  _getNoteTarget() {
    const p = this._personality;
    const target = p.noteTarget || 'random';
    const empties = [];

    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (!cell) continue;
        if (cell.fixedNum || cell.fillNum) continue;
        // 已填的格不写笔记
        if (this._isPlayerOwned(r, c) || this._isAiOwned(r, c)) continue;

        const inHub = this._isInHubBlock(r, c);
        switch (target) {
          case 'hub':
            if (inHub) empties.push({ r, c });
            break;
          case 'nonHub':
            if (!inHub) empties.push({ r, c });
            break;
          case 'random':
          default:
            empties.push({ r, c });
            break;
        }
      }
    }

    // 如果目标区域没有空格，回退到任何空格
    if (empties.length === 0) {
      for (let r = 0; r < this._size; r++) {
        for (let c = 0; c < this._size; c++) {
          const cell = this._board.cells?.[r]?.[c];
          if (!cell) continue;
          if (cell.fixedNum || cell.fillNum) continue;
          if (this._isPlayerOwned(r, c) || this._isAiOwned(r, c)) continue;
          empties.push({ r, c });
        }
      }
    }

    if (empties.length === 0) return null;
    return empties[Math.floor(Math.random() * empties.length)];
  }

  /**
   * 生成假笔记的数字
   * 假笔记：随机选一个不可能的数字（行/列/宫已有该数字）
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {number[]} 假笔记数字数组
   */
  _generateFakeNotes(r, c) {
    const size = this._size;
    const grid = this._rater ? this._rater.grid : null;
    const impossible = [];
    const possible = [];

    for (let num = 1; num <= size; num++) {
      if (this._isImpossibleNote(r, c, num)) {
        impossible.push(num);
      } else {
        possible.push(num);
      }
    }

    // 假笔记：选 1-3 个不可能数字
    if (impossible.length === 0) {
      // 没有不可能数字，从可能数字中选（但标记为假笔记）
      const count = 1 + Math.floor(Math.random() * Math.min(2, possible.length));
      const shuffled = [...possible].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    }

    const count = 1 + Math.floor(Math.random() * Math.min(2, impossible.length));
    const shuffled = [...impossible].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * 生成真实笔记的数字
   * 真实笔记：从 TechRater 候选数中选，或随机删减
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {boolean} reduced - 是否随机删减（盲盒行为）
   * @returns {number[]} 笔记数字数组
   */
  _generateRealNotes(r, c, reduced = false) {
    const cell = this._board.cells?.[r]?.[c];
    if (!cell) return [];
    const candidates = cell.candidates instanceof Set
      ? Array.from(cell.candidates)
      : (Array.isArray(cell.candidates) ? [...cell.candidates] : []);

    if (candidates.length === 0) {
      // 没有候选数，返回所有可能数字
      const all = [];
      for (let n = 1; n <= this._size; n++) {
        if (!this._isImpossibleNote(r, c, n)) all.push(n);
      }
      return all;
    }

    if (reduced && candidates.length > 2) {
      // 随机删减（盲盒行为）
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const keep = 1 + Math.floor(Math.random() * Math.min(candidates.length - 1, 2));
      return shuffled.slice(0, keep);
    }

    return [...candidates];
  }

  /**
   * 执行写笔记操作
   * 写入 AI 自己的笔记存储（_aiNotes），不污染棋盘
   * @returns {{r: number, c: number, nums: number[], isFake: boolean}|null} 笔记操作结果
   */
  _writeNote() {
    const target = this._getNoteTarget();
    if (!target) return null;

    const { r, c } = target;
    const isFake = this._isFakeNote();

    let nums;
    if (isFake) {
      nums = this._generateFakeNotes(r, c);
    } else {
      // 盲盒：随机删减；其他人：完整候选
      const reduced = this._personality.name === 'blind' && Math.random() < 0.5;
      nums = this._generateRealNotes(r, c, reduced);
    }

    if (nums.length === 0) return null;

    // 写入 AI 专属笔记存储
    const key = `${r},${c}`;
    this._aiNotes.set(key, new Set(nums));
    this._noteWritten++;
    this._lastNoteStep = this._moveCount;

    // V4.4：AI 笔记仅存内部 _aiNotes（供 AI 自身推理/计分用），
    // 决不写回玩家可见的 cell.candidates——对战对手看不见笔记内容，假笔记更不能暴露。
    // （此前把 AI 笔记合并进候选区，导致玩家在己方已填格旁突然看到"蓝色数字"冒出，
    //   且假笔记把不可能数漏给玩家。已移除。）

    return { r, c, nums, isFake };
  }

  /**
   * 获取据点权重因子（用于 _calcHumanLikeScore 中偏好转折点格）
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {number} 权重因子
   */
  _getHubWeightFactor(r, c) {
    const p = this._personality;
    // V4.3.40：策略模式系数（对手防守型 → 主动进攻据点 ×1.4；进攻型 → 少对拼 ×0.6）
    let hubWeight = (p.hubWeight || 0.50) * this._tempHubWeight;
    // v2.0 5.1：人格差异化据点权重——expert 劣势拉到 90%，prober 爆发拉到 85%
    if (p.name === 'expert' && this._gameState.isLeading === false) {
      hubWeight = Math.max(hubWeight, 0.90 * this._tempHubWeight);
    }
    if (p.name === 'prober' && this._gameState.isBurst) {
      hubWeight = Math.max(hubWeight, 0.85 * this._tempHubWeight);
    }
    const inHub = this._isInHubBlock(r, c);
    const inCastle = this._isInCastleHub(r, c);
    const hubIdx = this._getHubBlockIndex(r, c);

    // 城堡偏好额外加成
    let castleBonus = 0;
    if (inCastle) {
      switch (p.castlePreference) {
        case 'veryHigh': castleBonus = 0.6; break;
        case 'high': castleBonus = 0.4; break;
        case 'medium': castleBonus = 0.2; break;
        case 'low': castleBonus = 0.0; break;
        default: castleBonus = 0.2;
      }
    }

    // ===== v2.0 策略权重修正（让 AI 有"区域聚焦"的意图感） =====
    const isTargetHub = (hubIdx === this._targetHubIdx && hubIdx >= 0);
    let strategyMult = 1.0;
    switch (this._currentStrategy) {
      case 'attack':
        if (isTargetHub) strategyMult = 2.5;          // 集中火力攻最薄弱据点
        else if (inHub) strategyMult = 0.2;           // 非目标据点格几乎不填
        break;
      case 'defend':
        if (inHub && hubIdx >= 0 && this._gameState.hubOwnership?.[hubIdx] === 'boss') {
          strategyMult = 1.8;                          // 巩固己方据点
        } else {
          strategyMult = 0.3;
        }
        break;
      case 'global':
        if (inHub) strategyMult = 0.1;                 // 放弃据点，全力填满全局
        else strategyMult = 1.8;
        break;
      case 'counter':
        if (isTargetHub) strategyMult = 2.0;           // 反击对手正在冲的据点
        break;
      default:
        strategyMult = 1.0;
    }

    // 基础据点权重（仅在据点宫生效）
    let base;
    if (inHub) {
      base = hubWeight * 0.8 + castleBonus;
    } else {
      base = (1 - hubWeight) * 0.5 + castleBonus * 0.3;
    }

    // 应用策略倍数 + 热区惩罚（V4.3.43）
    let result = base * strategyMult;
    // 对手热区据点惩罚——对手正在冲的据点，降低本格攻击优先级（防守避让）
    const penaltyHubIdx = this._tempHubPenalty;
    if (!this._tempObserveOnly && penaltyHubIdx >= 0 && hubIdx === penaltyHubIdx && this._currentStrategy !== 'counter') {
      result *= 0.4;
    }
    return Math.max(0.05, result);
  }

  /**
   * 获取该格所属宫的据点索引（-1 表示非据点宫）
   */
  _getHubBlockIndex(r, c) {
    const hubs = this._gameState.hubBlocks;
    if (!hubs || hubs.length === 0) return -1;
    const size = this._size;
    const boxH = size <= 6 ? 2 : 3;
    const boxW = size / boxH;
    const br = Math.floor(r / boxH);
    const bc = Math.floor(c / boxW);
    const blockIdx = br * boxH + bc;
    return hubs.indexOf(blockIdx);
  }

  // ---- V4.3.25（Spec v1.4）：笔记心理战 ----

  /**
   * 读取格子笔记（候选数）
   */
  _notesOf(r, c) {
    const cell = this._board.cells?.[r]?.[c];
    if (!cell) return [];
    if (cell.candidates instanceof Set) return Array.from(cell.candidates);
    return Array.isArray(cell.candidates) ? cell.candidates : [];
  }

  /**
   * 判断某数字在该格是否为"不可能候选"（行/列/宫已有该数字 → 假笔记信号）
   */
  _isImpossibleNote(r, c, num) {
    const grid = this._rater ? this._rater.grid : null;
    if (!grid) return false;
    const size = this._size;
    for (let i = 0; i < size; i++) {
      if (grid[r][i] === num || grid[i][c] === num) return true;
    }
    const br = Math.floor(r / this._rater.boxH) * this._rater.boxH;
    const bc = Math.floor(c / this._rater.boxW) * this._rater.boxW;
    for (let dr = 0; dr < this._rater.boxH; dr++) {
      for (let dc = 0; dc < this._rater.boxW; dc++) {
        if (grid[br + dr][bc + dc] === num) return true;
      }
    }
    return false;
  }

  /**
   * 该格含多少个"不可能候选"（假笔记数）
   */
  _fakeNoteCount(r, c) {
    let n = 0;
    for (const num of this._notesOf(r, c)) {
      if (this._isImpossibleNote(r, c, num)) n++;
    }
    return n;
  }

  /**
   * 构建笔记注意力图（供 UI 外发光）：笔记≥3 → 2（高度关注）/ 1-2 → 1（留意）
   */
  _buildNoteAttentionMap() {
    this._noteAttentionMap.clear();
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const n = this._notesOf(r, c).length;
        if (n >= 3) this._noteAttentionMap.set(r + ',' + c, 2);
        else if (n >= 1) this._noteAttentionMap.set(r + ',' + c, 1);
      }
    }
  }

  /**
   * 笔记权重因子：笔记数 × 0.1（决策层加分）
   * 含假笔记的格降低防守权重（-0.3，AI 放松警惕）
   */
  _noteScore(r, c) {
    const notes = this._notesOf(r, c);
    let score = notes.length * 0.1;
    if (this._fakeNoteCount(r, c) > 0) score -= 0.3;
    return score;
  }

  // ---- 初始化 ----
  _initRater() {
    if (!TechRaterClass || typeof TechRaterClass.fromBoard !== 'function') {
      return;
    }
    this._rater = TechRaterClass.fromBoard(this._board);
  }

  getPersonality() {
    return this._personality;
  }

  getMoveCount() {
    return this._moveCount;
  }

  getRater() {
    return this._rater;
  }

  getNoteAttentionMap() {
    return this._noteAttentionMap;
  }

  setColorWeightEnabled(enabled) {
    this._colorWeightEnabled = !!enabled;
  }

  // ---- 思考 ----
  /**
   * V4.4：最后的合法蒙格——技巧解析无可解格/全部被占时兜底，保证 AI 不哑火也不霸版。
   * 任选一个空格，按人格失误率决定填"可能数"还是"不可能数"（冲突数，给玩家看破回抢机会）。
   * @returns {object|null} step（与 think() 返回值同构）
   */
  _lastResortLegalGuess() {
    try {
      const empties = [];
      for (let r = 0; r < this._size; r++) {
        for (let c = 0; c < this._size; c++) {
          const cell = this._board.cells[r]?.[c];
          if (cell && !cell.fixedNum && !cell.fillNum) empties.push([r, c]);
        }
      }
      if (!empties.length) return null;
      const pick = empties[Math.floor(Math.random() * empties.length)];
      const rr = pick[0], cc = pick[1];
      const errRate = (typeof this._calcDynamicErrorRate === 'function') ? this._calcDynamicErrorRate() : 0.12;
      const isMistake = Math.random() < errRate;
      let num = 0;
      for (let d = 1; d <= 9; d++) {
        const impossible = this._isImpossibleNote(rr, cc, d);
        if ((isMistake && impossible) || (!isMistake && !impossible)) { num = d; break; }
      }
      if (!num) num = 1 + Math.floor(Math.random() * 9);
      return {
        row: rr, col: cc, num: num,
        technique: 'guess',
        techniqueName: '蒙',
        techLevel: 0,
        thinkTime: (typeof this._calcThinkTime === 'function') ? this._calcThinkTime(0) : 400,
        isMistake: isMistake,
      };
    } catch (e) { return null; }
  }

  think() {
    this._initRater();
    if (!this._rater) return null;

    // V4.3.40：对手观察器——每步刷新分析并换算临时决策变量
    this._applyObserverAnalysis();

    // v2.0：策略状态机——每步重估策略（进攻/防守/全局解题/反击），
    // 让 AI 具备"区域聚焦"的阶段性目标（权重修正见 _getHubWeightFactor）
    this._determineStrategy();

    // CM4-D1：对抗戏剧导演引擎——在 Solver 策略确定后运行。
    // Shadow 模式：只记录 Director 建议 vs Solver 实际，不改行为（校准 ε）。
    // 调制模式：将 Director 叙事意图映射到现有旋钮。
    this._runDirector();

    // V4.3.35：三点连线人格——先判断是否写笔记（代替填数）
    if (this._shouldWriteNote()) {
      const noteResult = this._writeNote();
      if (noteResult) {
        // 返回笔记操作（标记 type: 'note'，由外部驱动处理）
        return {
          type: 'note',
          r: noteResult.r,
          c: noteResult.c,
          nums: noteResult.nums,
          isFake: noteResult.isFake,
          technique: 'note',
          techniqueName: noteResult.isFake ? '假笔记' : '笔记',
          techLevel: 0,
          thinkTime: 200 + Math.random() * 300, // 写笔记很快
          isMistake: false,
          isNote: true,
        };
      }
    }

    // V4.3.21：盲盒莽撞型（薇拉）——按 blindBoxChance 概率跳过推理直接"蒙"一个
    if (this._personality.blindBoxChance && Math.random() < this._personality.blindBoxChance) {
      const guess = this._blindGuess();
      if (guess) return guess;
    }

    // V4.3.21：techDirection 决定找解方向——
    //   lowest（默认/教学/盲盒）从低技巧起找，highest（专家型）从高技巧起找
    const direction = this._personality.techDirection || 'lowest';
    const allResultsByLevel = this._findAllVisibleResults(direction);
    if (allResultsByLevel.length === 0) {
      // V4.4：无可见技巧解——不再返回 null（防 AI 哑火/控制器必对霸版），蒙一个合法格
      return this._lastResortLegalGuess();
    }
    // V4.3.30（双 AI 对战修复）：逐级回退选择——从目标方向第一级开始，
    // 过滤掉已实填格（AI 幽灵格 fillNum=null 可抢），该级全被占则回退下一级
    // （修复 expert 型 AI 后期最高级解格被抢后 think 返回 null 卡死）
    let chosen = null;
    let targetLevel = allResultsByLevel.length > 0 ? allResultsByLevel[0].level : 0;
    const levelsSeen = [];
    for (const r of allResultsByLevel) {
      if (levelsSeen.indexOf(r.level) < 0) levelsSeen.push(r.level);
    }
    for (const lv of levelsSeen) {
      const cands = allResultsByLevel.filter((r) => r.level === lv);
      const usable = cands.filter((r) => {
        const c2 = this._board.cells[r.row]?.[r.col];
        return c2 && !c2.fixedNum && !c2.fillNum;
      });
      if (usable.length > 0) {
        targetLevel = lv;
        chosen = this._selectStep(usable);
        break;
      }
    }
    if (!chosen) {
      // V4.4：可见级全部被占——蒙一个合法格（防 think 返回 null 卡死 AI）
      return this._lastResortLegalGuess();
    }

    // V4.3.30：hotspot/笔记心理战只在"可用格"（未被实填）中挑选，避免选中已被对方占据的格
    const usableResults = allResultsByLevel.filter((r) => {
      const c2 = this._board.cells[r.row]?.[r.col];
      return c2 && !c2.fixedNum && !c2.fillNum;
    });

    // V4.3.23（Spec v1.2）：人格抢关键格——expert 80% / mentor 50% / blind 0
    // 关键格若在当前可见解中，按人格概率优先抢
    if (this._hotspotPriority > 0 && typeof this._getHotspots === 'function') {
      const hs = this._getHotspots() || [];
      if (hs.length > 0) {
        const hotspotPick = usableResults.find((r) => hs.some((h) => h.r === r.row && h.c === r.col));
        if (hotspotPick && Math.random() < this._hotspotPriority) {
          chosen = hotspotPick;
        }
      }
    }

    // V4.3.25（Spec v1.4）：笔记心理战——AI 读取玩家笔记
    // 1) 构建注意力图（供 UI 外发光渲染）
    this._buildNoteAttentionMap();
    // 2) 高关注格（笔记≥3 且无假笔记）→ 40% 概率优先抢占
    if (Math.random() < 0.4) {
      const highNote = usableResults.find((r) => {
        return this._notesOf(r.row, r.col).length >= 3 && this._fakeNoteCount(r.row, r.col) === 0;
      });
      if (highNote) chosen = highNote;
    }
    // 3) 假笔记格（含不可能候选）→ 30% 概率避开（AI 被误导，放松防守）
    if (this._fakeNoteCount(chosen.row, chosen.col) > 0 && Math.random() < 0.3) {
      const alt = usableResults.find((r) => this._fakeNoteCount(r.row, r.col) === 0);
      if (alt) chosen = alt;
    }

    const chosenCategory = this._getCellCategory ? this._getCellCategory(chosen.row, chosen.col) : null;

    let thinkTime = this._calcThinkTime(targetLevel);
    if (chosenCategory) thinkTime *= this._getColorThinkTimeWeight(chosenCategory);

    let errorRate = this._calcDynamicErrorRate();
    if (chosenCategory) errorRate *= this._getColorErrorWeight(chosenCategory);
    // V4.3.34：AI睁眼——抢对手格时增加失误率（stealErrorRatePenalty 额外倍数）
    if (this._isPlayerOwned(chosen.row, chosen.col)) {
      errorRate *= (1 + (this._personality.stealErrorRatePenalty ?? 0));
    }
    const isMistake = Math.random() < errorRate;

    const result = {
      row: chosen.row,
      col: chosen.col,
      num: chosen.num,
      technique: chosen.technique,
      techniqueName: chosen.techniqueName,
      techLevel: targetLevel,
      thinkTime: thinkTime,
      isMistake: isMistake,
    };

    // V4.3.21：看错行——失误时按 misreadChance 概率把目标改成相邻空格（正确数字填错位）
    if (isMistake && this._personality.misreadChance && Math.random() < this._personality.misreadChance) {
      const adjacent = this._findAdjacentEmpty(chosen.row, chosen.col);
      if (adjacent) {
        result.row = adjacent.row;
        result.col = adjacent.col;
        result.isMisread = true;   // 数字对、位置错（玩家可"看破"捡漏）
        result.technique = 'misread';
        result.techniqueName = '看错行';
      }
    }

    if (chosenCategory) result.category = chosenCategory;
    this._lastStep = result;
    return result;
  }

  /**
   * V4.3.40：对手观察器——将分析结果换算为临时决策变量
   * V4.3.42（V2）：人格差异化响应——观察器是人格的放大器，而非统一模板
   *   blind(薇拉)   热区争夺型：不避让、更猛攻、抢更快
   *   expert(山田)  避让型：避开热区，但高阶技巧格（≥6）忽略避让"精准补刀"
   *   mentor(伊藤) 观察但不利用（放水）
   *   surround(伊藤) 假笔记强化：热区写假笔记误导（_tempFakeBoost）
   *   prober(沈墨)  观察但前期不响应（进度<50% 不动作），后期爆发
   *   average/其他  温和避让（0.8）
   */
  _applyObserverAnalysis() {
    // CM4-R8：反应延迟——先快照上一帧生效值（供滞后期沿用）
    const prevTemp = {
      hubPenalty: this._tempHubPenalty,
      speedScale: this._tempSpeedScale,
      defenseWeight: this._tempDefenseWeight,
      hubWeight: this._tempHubWeight,
      fakeBoost: this._tempFakeBoost,
    };
    // 重置临时变量
    this._tempHubPenalty = -1;
    this._tempSpeedScale = 1.0;
    this._tempDefenseWeight = 1.0;
    this._tempHubWeight = 1.0;
    this._tempFakeBoost = 1.0;
    this._tempObserveOnly = false;
    this._tempIgnoreHubPenalty = false;
    // CM4-D1 步骤4：每步重置 Director 笔记基调，由 _applyDirectorParams 决定是否覆盖
    this._tempNoteRate = null;
    this._tempFakeRate = null;
    if (!this._observer) return;

    const rawAnalysis = this._observer.getAnalysis();
    // CM4-R8：认知偏差——AI 偶尔误判"哪个据点更在危险中"（换路径防守，非乱下）
    this._opponentAnalysis = this._applyPerceptionNoise(rawAnalysis);
    const a = this._opponentAnalysis;
    if (!a) return;
    const pName = this._personality.name;
    // V4.3.44：强度插值——intensity=1.0 保持基准，>1 放大偏离，<1 收敛到中性
    const I = a.intensity ?? 1.0;
    const lerp = (base, neutral) => neutral + (base - neutral) * I;

    // 人格差异化响应
    switch (pName) {
      case 'blind':
        // 薇拉：热区争夺型——对手越抢我越抢，节奏加快
        if (a.targetHub >= 0) this._tempHubWeight = lerp(1.3, 1.0);
        if (a.tempo === 'accelerating') this._tempSpeedScale = lerp(0.85, 1.0);
        if (a.aggression > 0.4) this._tempDefenseWeight = lerp(1.2, 1.0);
        break;

      case 'expert':
        // 山田：避让型 + 高阶技巧补刀（_getHubWeightFactor 中按技巧等级覆盖）
        if (a.targetHub >= 0) {
          this._tempHubPenalty = a.targetHub;
          this._tempHubWeight = lerp(0.7, 1.0);
        }
        if (a.tempo === 'accelerating') this._tempSpeedScale = lerp(0.9, 1.0);
        if (a.strategy === 'aggressive') this._tempDefenseWeight = lerp(1.3, 1.0);
        break;

      case 'mentor':
        // 伊藤：观察但故意不利用（放水），保持教学陪练定位
        this._tempObserveOnly = true;
        break;

      case 'surround':
        // 伊藤：假笔记强化——热区写假笔记误导对手
        if (a.targetHub >= 0) this._tempFakeBoost = lerp(1.5, 1.0);
        if (a.tempo === 'decelerating') this._tempSpeedScale = lerp(0.85, 1.0); // 趁机提速
        break;

      case 'prober':
        // 沈墨：观察但前期不响应（进度 <0.5 不动作），后期爆发
        if ((this._gameState.progress || 0) < 0.5) {
          this._tempObserveOnly = true;
        } else {
          if (a.targetHub >= 0) this._tempHubWeight = lerp(1.3, 1.0);
          if (a.tempo === 'decelerating') this._tempSpeedScale = lerp(0.8, 1.0);
        }
        break;

      default:
        // average 等：温和争夺热区（V4.3.43 修复——不避让，略加强攻占据点）
        if (a.targetHub >= 0) {
          this._tempHubWeight = lerp(1.1, 1.0);   // 略微加强进攻
          this._tempHubPenalty = -1;   // 不避开热区
        } else {
          this._tempHubWeight = lerp(0.9, 1.0);
          this._tempHubPenalty = -1;
        }
        if (a.tempo === 'accelerating') this._tempSpeedScale = lerp(0.85, 1.0);
        if (a.aggression > 0.4) this._tempDefenseWeight = 1.15;
        break;
    }

    // CM4-R8：反应延迟——检测到玩家意图变化后，AI 观察 N 步才应用观察权重
    this._applyReactionGate(prevTemp);
  }

  // ---- 盲盒猜格（薇拉）：跳过推理直接蒙一个空格 ----
  _blindGuess() {
    const empties = [];
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells[r]?.[c];
        if (!cell) continue;
        const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
        const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
        if (!hasFixed && !hasFilled) empties.push({ row: r, col: c });
      }
    }
    if (empties.length === 0) return null;
    const target = empties[Math.floor(Math.random() * empties.length)];
    const num = 1 + Math.floor(Math.random() * this._size);
    return {
      row: target.row,
      col: target.col,
      num: num,
      technique: 'guess',
      techniqueName: '玄学盲猜',
      techLevel: 0,
      thinkTime: 120 + Math.random() * 200, // 猜得快
      isMistake: true,
      isGuess: true,
    };
  }

  // ---- 看错行辅助：找目标格相邻的空格（同行/同列/同宫优先） ----
  _findAdjacentEmpty(row, col) {
    const size = this._size;
    const candidates = [];
    const boxSize = Math.sqrt(size) | 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (r === row && c === col) continue;
        const sameRow = r === row;
        const sameCol = c === col;
        const sameBox = Math.floor(r / boxSize) === Math.floor(row / boxSize) &&
                        Math.floor(c / boxSize) === Math.floor(col / boxSize);
        if (!sameRow && !sameCol && !sameBox) continue;
        const cell = this._board.cells[r]?.[c];
        if (!cell) continue;
        const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
        const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
        if (!hasFixed && !hasFilled) candidates.push({ row: r, col: c });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ---- 执行（更新 AI 自身推理状态） ----
  execute(step) {
    if (!step || !this._rater || typeof this._rater._fillCell !== 'function') return;
    const { row, col, num } = step;
    this._rater._fillCell(row, col, num);
    this._moveCount++;
  }

  // ---- 拦截 ----
  tryIntercept(row, col) {
    if (!this._rater) return null;

    const targetCategory = this._getCellCategory ? this._getCellCategory(row, col) : null;

    let interceptProb = this._personality.interceptProbability ?? 0.3;
    if (targetCategory) interceptProb *= this._getColorInterceptWeight(targetCategory);
    interceptProb = Math.min(interceptProb, 0.95);
    if (Math.random() > interceptProb) return null;

    const allResults = this._findAllVisibleResults();
    const target = allResults.find(r => r.row === row && r.col === col);
    if (!target) return null;

    // 同频判定：高难度格 AI 也需要反应时间
    const techLevel = target.level || 1;
    const levelTolerance = this._personality.name === 'surround' ? 4 : 3;
    if (techLevel > levelTolerance) {
      if (Math.random() > 0.2) return null;
    }

    let errorRate = (this._personality.baseErrorRate ?? 0.05) * 0.5;
    if (targetCategory) errorRate *= this._getColorErrorWeight(targetCategory);
    const isMistake = Math.random() < errorRate;

    let thinkTime = Math.max(120, this._calcThinkTime(target.level) * 0.4);
    if (targetCategory) thinkTime *= this._getColorThinkTimeWeight(targetCategory);

    const step = {
      row: target.row,
      col: target.col,
      num: target.num,
      technique: target.technique,
      techniqueName: target.techniqueName,
      techLevel: target.level,
      thinkTime: thinkTime,
      isMistake: isMistake,
      isIntercept: true,
    };
    if (targetCategory) step.category = targetCategory;
    return step;
  }

  // ---- 必杀技 ----
  useGuanJu() {
    this._initRater();
    if (!this._rater) return [];
    const targets = [];
    const naked = this._rater._findAllByTechnique('nakedSingle') || [];
    const hidden = this._rater._findAllByTechnique('hiddenSingle') || [];
    [...naked, ...hidden].forEach(item => {
      targets.push({
        row: item.row,
        col: item.col,
        num: item.num,
        techniqueName: TechRaterClass ? TechRaterClass.getTechniqueName(item.technique || 'nakedSingle') : '孤星',
      });
    });
    return targets;
  }

  useDingShi(r, c) {
    this._initRater();
    if (!this._rater) return null;
    const techIds = this._getTechPriority();
    for (const techId of techIds) {
      const level = TECH_LEVEL_MAP[techId];
      if (level > this._personality.maxTechLevel) continue;
      const allResults = this._rater._findAllByTechnique(techId);
      if (allResults && allResults.length > 0) {
        const target = allResults.find(x => x.row === r && x.col === c);
        if (target) {
          const step = {
            row: r,
            col: c,
            num: target.num,
            technique: 'dingShi',
            techniqueName: '定式',
            techLevel: level,
            thinkTime: 0,
            isMistake: false,
            isSkill: true,
          };
          this.execute(step);
          return step;
        }
      }
    }
    return null;
  }

  useQuanTao(count = 3) {
    this._initRater();
    if (!this._rater) return [];
    const allResults = this._findAllVisibleResults();
    if (allResults.length === 0) return [];
    const center = (this._size - 1) / 2;
    const sorted = [...allResults].sort((a, b) => {
      const distA = Math.abs(a.row - center) + Math.abs(a.col - center);
      const distB = Math.abs(b.row - center) + Math.abs(b.col - center);
      return distB - distA;
    });
    return sorted.slice(0, Math.min(count, sorted.length)).map(item => {
      const step = {
        row: item.row,
        col: item.col,
        num: item.num,
        technique: 'quanTao',
        techniqueName: '圈套',
        techLevel: item.level,
        thinkTime: 0,
        isMistake: Math.random() < (this._personality.baseErrorRate ?? 0.05) * 0.3,
        isSkill: true,
      };
      this.execute(step);
      return step;
    });
  }

  // ---- 从主棋盘同步 ----
  syncFromBoard(board) {
    this._board = board;
    if (!this._rater) {
      this._initRater();
      return;
    }
    if (typeof this._rater._fillCell !== 'function') {
      this._initRater();
      return;
    }
    const size = board.size;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const boardCell = board.cells[r][c];
        const num = boardCell.fixedNum || boardCell.fillNum;
        if (num > 0) {
          const raterValue = this._rater.grid ? this._rater.grid[r][c] : 0;
          if (raterValue === 0 || raterValue !== num) {
            this._rater._fillCell(r, c, num);
            // I2（CM4-A2）：脚本驱动（tpl/duel）不调 execute()，_moveCount 恒为 0，
            // 导致笔记节流（_shouldWriteNote）与思考时间进度（_calcThinkTime）冻结。
            // 此处对"新同步的 AI 占领格"递增移动计数，解除冻结；只计 AI 格，避免把玩家落子算作 AI 步数。
            if (boardCell.isAiFilled || this._isAiOwned(r, c)) {
              this._moveCount++;
            }
          }
        }
      }
    }
  }

  // ---- 内部：可见结果 ----
  // V4.3.21：direction 参数——'lowest' 从低技巧起找（默认/教学/盲盒），
  // 'highest' 从高技巧起找（专家型，专挑高阶格解）
  _findAllVisibleResults(direction) {
    // 手感修复：think() 时间预算——主线程同步推理时 xWing/swordfish 全盘扫描
    // 可达数百 ms（AI 行动瞬间卡顿根因）。给整次收集设 28ms 预算：
    // 超预算即停止继续扫描高级技巧（低级结果已足够支撑本次决策），
    // 剩余技巧留到下一 AI 步再找，保证主线程不被长冻结。
    const _budgetDeadline = performance.now() + 28;
    const results = [];
    const techIds = this._getTechPriority();
    const ordered = (direction === 'highest') ? techIds.slice().reverse() : techIds;
    for (const techId of ordered) {
      if (performance.now() > _budgetDeadline) break; // 手感预算：超时停止扫描
      const level = TECH_LEVEL_MAP[techId] || 1;
      if (level > this._personality.maxTechLevel) continue;
      const discoveryRate = this._personality.discoveryRate ? (this._personality.discoveryRate[level] ?? 1.0) : 1.0;
      if (Math.random() > discoveryRate) continue;
      const allResults = this._rater._findAllByTechnique(techId);
      if (allResults && allResults.length > 0) {
        for (const r of allResults) {
          results.push({
            row: r.row,
            col: r.col,
            num: r.num,
            technique: techId,
            techniqueName: TechRaterClass ? TechRaterClass.getTechniqueName(techId) : techId,
            level: level,
            evidence: r.evidence || null,
          });
        }
        // V4.3.30（双 AI 对战修复）：不再 break——收集所有级别，让 think() 在最高级被占时
        // 能逐级回退到低级技巧（否则 expert 型 AI 后期只剩 1 个高阶解格被抢时 think 返回 null 卡死）
      }
    }
    return results;
  }

  _getTechPriority() {
    if (this._size === 4) {
      return ['nakedSingle', 'hiddenSingle', 'nakedPair'];
    } else if (this._size === 6) {
      return ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45', 'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet'];
    }
    return ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45', 'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet', 'xWing', 'swordfish'];
  }

  // ---- 内部：选择策略 ----
  _selectStep(candidates) {
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const strategy = this._personality.selectionStrategy;
    switch (strategy) {
      case 'random': return candidates[Math.floor(Math.random() * candidates.length)];
      case 'influence': return this._selectByInfluence(candidates);
      case 'perimeter': return this._selectByPerimeter(candidates);
      case 'humanLike':
      default: return this._selectByHumanLikeScore(candidates);
    }
  }

  _selectByInfluence(candidates) {
    let best = candidates[0];
    let bestScore = this._rater._calcInfluence(best.row, best.col);
    for (let i = 1; i < candidates.length; i++) {
      const score = this._rater._calcInfluence(candidates[i].row, candidates[i].col);
      const jitter = (Math.random() - 0.5) * 0.1;
      if (score + jitter > bestScore) {
        bestScore = score;
        best = candidates[i];
      }
    }
    return best;
  }

  _selectByPerimeter(candidates) {
    const center = (this._size - 1) / 2;
    let best = candidates[0];
    let bestDist = this._manhattanDist(best.row, best.col, center, center);
    for (let i = 1; i < candidates.length; i++) {
      const dist = this._manhattanDist(candidates[i].row, candidates[i].col, center, center);
      const jitter = (Math.random() - 0.5) * 0.5;
      if (dist + jitter > bestDist) {
        bestDist = dist;
        best = candidates[i];
      }
    }
    return best;
  }

  _manhattanDist(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2);
  }

  _selectByHumanLikeScore(candidates) {
    let best = candidates[0];
    let bestScore = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      let score = this._calcHumanLikeScore(candidates[i]);
      if (this._getCellCategory && this._colorWeightEnabled) {
        const category = this._getCellCategory(candidates[i].row, candidates[i].col);
        score *= this._getColorSelectWeight(category);
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidates[i];
      }
    }
    return best;
  }

  _calcHumanLikeScore(candidate) {
    const influence = this._rater._calcInfluence(candidate.row, candidate.col);
    const techLevel = candidate.level || 1;
    const difficultyPenalty = 1 / (1 + (techLevel - 1) * 0.35);
    const personalityBias = this._getPersonalityBias(techLevel, influence);
    const jitter = (Math.random() - 0.5) * 0.12;
    // V4.3.25（Spec v1.4）：笔记权重因子——笔记数 × 0.1（假笔记 -0.3）
    const noteBias = this._noteScore(candidate.row, candidate.col);
    // V4.3.34：AI睁眼——抢对手格加成（stealPriority × 0.5，对手格分数更高）
    // V4.3.40：对抗性 → 对手专抢自己格时提高防守权重（_tempDefenseWeight 1.3）
    const stealBonus = this._isPlayerOwned(candidate.row, candidate.col)
      ? (this._personality.stealPriority || 0) * 0.5 * this._tempDefenseWeight
      : 0;
    // V4.3.35：三点连线人格——据点权重因子（偏好/回避据点宫）
    let hubBonus = this._getHubWeightFactor(candidate.row, candidate.col);
    // V4.3.42（V2）：山田"高阶技巧补刀"——避让区域中若存在高阶技巧格（≥hiddenPair），
    // 覆盖避让决定，精准一击（该格推理价值高，值得冒险）
    if (this._personality.name === 'expert' && this._tempHubPenalty >= 0
        && this._getHubBlockIndex(candidate.row, candidate.col) === this._tempHubPenalty
        && techLevel >= 6) {
      hubBonus += 0.6;
    }
    return (influence * difficultyPenalty * personalityBias) + noteBias + stealBonus + hubBonus + jitter;
  }

  _getPersonalityBias(techLevel, influence) {
    const personalityName = this._personality.name;
    switch (personalityName) {
      case 'steady':
        return 0.8 + (1 / (1 + (techLevel - 1) * 0.2)) * 0.6;
      case 'surround':
        return 0.6 + (techLevel / 8) * 0.6 + influence * 0.3;
      case 'reckless':
      default:
        return 0.7 + Math.random() * 0.4;
    }
  }

  _calcThinkTime(techLevel) {
    const baseTime = this._personality.baseThinkTime[techLevel] || 1000;
    const speedCurve = this._personality.speedCurve;
    const speedMult = this._personality.speedMultiplier;
    let multiplier = speedMult.min + Math.random() * (speedMult.max - speedMult.min);
    const progress = this._moveCount / Math.max(this._countEmptyCells(), 1);
    switch (speedCurve) {
      case 'erratic':
        multiplier *= 0.7 + Math.random() * 0.8;
        break;
      case 'steady':
        if (progress > 0.6) multiplier *= 0.85;
        break;
      case 'accelerating': {
        const speedFactor = 1.3 - progress * 0.6;
        multiplier *= speedFactor;
        break;
      }
    }
    if (this._size === 4) multiplier *= 0.5;
    else if (this._size === 6) multiplier *= 0.7;
    // V4.3.40：节奏感知——对手加速则思考加快（×0.8），减速则放缓（×1.2）
    multiplier *= this._tempSpeedScale;
    return Math.max(40, baseTime * multiplier);
  }

  _countEmptyCells() {
    let count = 0;
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells[r][c];
        if (cell && !cell.fixedNum && !cell.fillNum) count++;
      }
    }
    return count;
  }

  // ---- 三色权重辅助 ----
  _getColorSelectWeight(category) {
    if (!this._colorWeightEnabled || !category) return 1.0;
    switch (category) {
      case 'gate': return 2.0;
      case 'core': return 1.5;
      case 'simple': return 1.0;
      default: return 1.0;
    }
  }

  _getColorInterceptWeight(category) {
    if (!this._colorWeightEnabled || !category) return 1.0;
    switch (category) {
      case 'gate': return 2.0;
      case 'core': return 1.0;
      case 'simple': return 0.5;
      default: return 1.0;
    }
  }

  _getColorErrorWeight(category) {
    if (!this._colorWeightEnabled || !category) return 1.0;
    return (category === 'gate') ? 0.5 : 1.0;
  }

  _getColorThinkTimeWeight(category) {
    if (!this._colorWeightEnabled || !category) return 1.0;
    return (category === 'gate') ? 1.5 : 1.0;
  }
}
