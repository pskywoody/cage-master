// ============================================================
//  battle-context.js - 统一战斗上下文（CM4-R1）
// ============================================================
//  目标：把 AI 战斗链路（Director / StrategyPool / Observer / Solver）
//  从"每层自己拼状态"收敛为"消费同一份 BattleContext"。
//
//  设计原则：
//    1. 单一数据面：controller 每步构建一次 context，所有模块只读它。
//    2. 兼容现有契约：内部保留 AIPlayerCore.setGameState / Director.decide
//       直接消费的扁平字段（isLeading/selfHubCount/...），外露嵌套视图
//       （board/player/ai/tpl/drama/meta）供新架构（IntentObserver 等）读取。
//    3. 纯函数：不持有状态，不依赖 renderer/DOM，可 headless 测试。
//
//  环境约束：纯 ES Module；core/ 不依赖 ui。
// ============================================================

import { detectPhase } from './director.js';

// 默认空上下文（各层可安全 read，避免 undefined 穿透）
export function emptyContext() {
  return {
    board: null,
    step: 0,
    player: { moves: [], ownedGrid: null, defense: {}, attackHub: -1, threatLevel: 0 },
    ai: { moves: 0, ownedGrid: null, strategy: 'attack', targetHub: -1, hubCounts: [] },
    tpl: { hubs: [], hubBlocks: [], castleHubIdx: -1, lines: [], ghostCells: [], stats: null },
    drama: { phase: 'opening', tension: 0, comeback: false },
    meta: { difficulty: null, personality: null, progress: 0 },
    // 扁平兼容视图（setGameState / decide 直接消费）
    isLeading: null,
    selfHubCount: 0,
    opponentHubCount: 0,
    progress: 0,
    consecutiveErrors: 0,
    consecutiveCorrect: 0,
    isBurst: false,
    hubBlocks: [],
    castleHubIdx: -1,
    hubOwnership: [],
    playerDefense: {},
    hubCounts: [],
    migrationFailed: false,
  };
}

/**
 * 从 tpl + board 构建统一战斗上下文。
 * @param {Object} src
 * @param {Object} src.tpl     - ThreePointLineManager 实例
 * @param {Object} src.board   - HeadlessEngine Board
 * @param {number[]} [src.solution] - 唯一解（用于判定 AI 落子对错）
 * @param {number} [src.totalEmpty] - 总空格数（进度计算）
 * @param {number} [src.aiConsecutiveCorrect=0] - AI 连续填对数
 * @param {Object} [src.opponent={}] - { id, name, personality, ... }
 * @param {number} [src.step=0] - 当前步数
 * @returns {Object} BattleContext（含嵌套视图 + 扁平兼容字段）
 */
export function createBattleContext(src) {
  const tpl = src.tpl;
  const board = src.board;
  const totalEmpty = src.totalEmpty || 0;
  const ctx = emptyContext();

  ctx.board = board;
  ctx.step = src.step || 0;
  ctx.meta.difficulty = src.opponent && src.opponent.difficulty != null ? src.opponent.difficulty : null;
  ctx.meta.personality = src.opponent && src.opponent.personality ? src.opponent.personality : null;

  if (!tpl) return ctx;

  // ---- tpl 视图 ----
  try {
    ctx.tpl.hubBlocks = tpl.getHubBlocks() || [];
    ctx.tpl.castleHubIdx = tpl.getCastleHubIdx != null ? tpl.getCastleHubIdx() : -1;
    ctx.tpl.hubs = tpl.getHubProgress() || [];
    ctx.tpl.stats = tpl.getStats ? tpl.getStats() : null;
    if (typeof tpl.getHubCounts === 'function') ctx.tpl.hubCounts = tpl.getHubCounts() || [];
  } catch (e) { /* 容错 */ }

  // ---- 据点归属 ----
  const hubOwnership = ctx.tpl.hubs.map((h) => h.occupiedBy || null);
  ctx.hubOwnership = hubOwnership;
  ctx.selfHubCount = hubOwnership.filter((o) => o === 'boss').length;
  ctx.opponentHubCount = hubOwnership.filter((o) => o !== null && o !== 'boss').length;
  ctx.isLeading = ctx.selfHubCount > ctx.opponentHubCount ? true
    : (ctx.selfHubCount < ctx.opponentHubCount ? false : null);

  // ---- 进度 ----
  let filled = 0;
  if (board && board.size && board.cells) {
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const cell = board.cells[r] && board.cells[r][c];
        if (cell && (cell.fillNum || cell.isAiFilled)) filled++;
      }
    }
  }
  ctx.progress = totalEmpty > 0 ? filled / totalEmpty : 0;
  ctx.meta.progress = ctx.progress;

  // ---- 连续正确/失误（由驱动传入，无法从 board 推导）----
  ctx.consecutiveCorrect = src.aiConsecutiveCorrect || 0;
  ctx.consecutiveErrors = src.aiConsecutiveErrors || 0;

  // ---- 玩家防守强度（各据点 player 维度占比）----
  const playerDefense = {};
  ctx.tpl.hubs.forEach((p, i) => {
    playerDefense[i] = p.playerDims / Math.max(p.playerDims + p.bossDims, 1);
  });
  ctx.playerDefense = playerDefense;
  ctx.player.defense = playerDefense;

  // ---- hubCounts / migrationFailed ----
  ctx.hubCounts = ctx.tpl.hubCounts || ctx.tpl.hubs;
  const hubOwnMap = hubOwnership;
  ctx.player.ownedGrid = hubOwnMap.map((o) => o !== null && o !== 'boss');
  ctx.ai.ownedGrid = hubOwnMap.map((o) => o === 'boss');
  ctx.ai.hubCounts = ctx.hubCounts;
  ctx.migrationFailed = (typeof tpl.isMigrationFailed === 'function') ? tpl.isMigrationFailed() : false;

  // ---- 戏剧视图（drives 由 controller 注入修正）----
  ctx.drama.phase = detectPhase(ctx);
  ctx.drama.tension = ctx.selfHubCount === ctx.opponentHubCount ? 0.5
    : (Math.abs(ctx.selfHubCount - ctx.opponentHubCount) >= 2 ? 0.2 : 0.4);
  ctx.drama.comeback = ctx.selfHubCount < ctx.opponentHubCount;

  // ---- 扁平兼容视图回填（供 setGameState / decide 直接消费）----
  ctx.hubBlocks = ctx.tpl.hubBlocks;
  ctx.castleHubIdx = ctx.tpl.castleHubIdx;
  ctx.consecutiveCorrect = src.aiConsecutiveCorrect || 0;
  ctx.isBurst = ctx.drama.tension >= 0.5;

  return ctx;
}

/**
 * 将 BattleContext 的扁平字段投影为 AIPlayerCore.setGameState 需要的对象。
 * 保持现有契约不变（controller._syncAiState 的调用方无需改动）。
 * @param {Object} ctx  - createBattleContext 返回值
 * @returns {Object} 扁平 gameState
 */
export function toGameState(ctx) {
  return {
    isLeading: ctx.isLeading,
    selfHubCount: ctx.selfHubCount,
    opponentHubCount: ctx.opponentHubCount,
    progress: ctx.progress,
    consecutiveErrors: ctx.consecutiveErrors,
    consecutiveCorrect: ctx.consecutiveCorrect,
    isBurst: ctx.isBurst,
    hubBlocks: ctx.hubBlocks,
    castleHubIdx: ctx.castleHubIdx,
    hubOwnership: ctx.hubOwnership,
    playerDefense: ctx.playerDefense,
    hubCounts: ctx.hubCounts,
    migrationFailed: ctx.migrationFailed,
  };
}

// ============================================================
//  CM4-R6.5-A：Hub Heat —— 据点冲突热度分级（0-3）
//  ============================================================
//  把 TPL 内部状态翻译成玩家能读的战场语言：
//    level 0 = ○ 无人关注
//    level 1 = 🔥 单方推进
//    level 2 = 🔥🔥 双方争夺
//    level 3 = 🔥🔥🔥 决定胜负
//  纯函数，可单测。UI 层据此渲染视觉。
// ============================================================
export function computeHubHeat(ctx) {
  const hubs = (ctx && ctx.tpl && ctx.tpl.hubs) || [];
  const castleIdx = (ctx && ctx.tpl && ctx.tpl.castleHubIdx) != null ? ctx.tpl.castleHubIdx : -1;
  const levels = hubs.map((h) => {
    if (!h || h.visible === false) return 0;          // 隐藏据点不泄露信息
    const p = h.playerDims || 0;
    const b = h.bossDims || 0;
    const total = p + b;
    if (total === 0) return 0;                        // 0 无人关注（城堡也无人关注时保持 ○）
    const contested = p > 0 && b > 0;                 // 双方争夺
    if (contested) {
      // 双方争夺：一方已逼近胜利（≥2 维）→ 3 决定胜负；否则 2
      return Math.max(p, b) >= 2 ? 3 : 2;
    }
    // 单方推进：一方占满（≥3 维）即决胜 → 3；否则 1
    return Math.max(p, b) >= 3 ? 3 : 1;
  });
  // 城堡据点不额外加热度（无人关注即 ○），仅通过 castleIndex 暴露供 UI 高亮胜负关键。
  let maxLevel = 0, maxIndex = -1;
  levels.forEach((l, i) => { if (l > maxLevel) { maxLevel = l; maxIndex = i; } });
  return { levels, max: { index: maxIndex, level: maxLevel }, castleIndex: castleIdx };
}

// ============================================================
//  CM4-R6.5-B：Threat Preview —— AI 连续聚焦据点的压力预警
//  ============================================================
//  输入最近 N 步 AI 落子所属据点（focusStreak），结合当前热度，
//  判断 AI 是否在持续施压某个据点（不提示具体格子，只提示战场方向）。
//  纯函数，可单测。
//  @param {Object} ctx  - createBattleContext 返回值
//  @param {Array<{hubIndex:number}>} focusStreak - 最近 N 步 AI 落子所在据点
//  @returns {Object|null} { hubIndex, streak, hubHeat, pressure, visible }
// ============================================================
export function detectAIPressure(ctx, focusStreak) {
  if (!Array.isArray(focusStreak) || focusStreak.length === 0) return null;
  const hubs = (ctx && ctx.tpl && ctx.tpl.hubs) || [];
  const counts = {};
  for (const f of focusStreak) {
    if (f && f.hubIndex >= 0) counts[f.hubIndex] = (counts[f.hubIndex] || 0) + 1;
  }
  const last = focusStreak[focusStreak.length - 1];
  const targetIdx = (last && last.hubIndex >= 0) ? last.hubIndex : -1;
  if (targetIdx < 0 || !hubs[targetIdx]) return null;
  const streak = counts[targetIdx] || 1;
  const heat = computeHubHeat(ctx);
  const hubHeat = heat.levels[targetIdx] || 0;
  // 压力等级 1-3：聚焦连续步数 + 当前热度 平均
  const pressure = Math.min(3, Math.max(1, Math.round((streak + hubHeat) / 2)));
  return {
    hubIndex: targetIdx,
    streak,
    hubHeat,
    pressure,
    visible: hubs[targetIdx].visible !== false,
  };
}

// ============================================================
//  CM4-R6.5B-1：Pollution —— 据点污染分级（把冲突热度翻译成视觉污染语言）
//  ============================================================
//  热度 ≠ 污染。单方推进（heat 1）只是热度，不是污染；
//  只有真正的争夺/决胜才进入污染链：
//    heat 0/1 → stage 0  无污染（单纯热度）
//    heat 2   → stage 1  中心格闪烁（"这里要出事"）
//    heat 3   → stage 2  整宫外溢/边缘扭曲（"战场被污染"）
//  规则：只污染空格，不覆盖玩家格/已有资源（放 Ghost 前的前置预警层）。
//  纯函数，可单测。
//  @param {Object} ctx  - createBattleContext 返回值
//  @param {Object} heat - computeHubHeat 返回值
//  @returns {Object} { stages:[per hub 0-2], cells:{ "r,c":stage }, active:[{hubIndex,stage,heat}] }
// ============================================================
export function computePollution(ctx, heat) {
  const levels = (heat && heat.levels) || [];
  const stages = levels.map(lv => lv >= 3 ? 2 : (lv >= 2 ? 1 : 0));
  const cells = {};
  const board = ctx && ctx.board;
  const hubBlocks = (ctx && ctx.tpl && ctx.tpl.hubBlocks) || [];
  if (board && levels.length) {
    const size = board.size;
    const boxH = size <= 6 ? 2 : 3;
    const boxW = size / boxH;
    for (let i = 0; i < levels.length; i++) {
      const stage = stages[i] || 0;
      if (stage < 1) continue;
      const blockIdx = hubBlocks[i];
      if (blockIdx == null || blockIdx < 0) continue;
      const br = Math.floor(blockIdx / boxH) * boxH;
      const bc = (blockIdx % boxH) * boxW;
      for (let r = br; r < br + boxH && r < size; r++) {
        for (let c = bc; c < bc + boxW && c < size; c++) {
          const cell = board.cells?.[r]?.[c];
          // 只污染空格：不覆盖已填/固定格（不碰玩家资源）
          if (!cell || cell.fixedNum || cell.fillNum) continue;
          const key = r + ',' + c;
          cells[key] = Math.max(cells[key] || 0, stage);
        }
      }
    }
  }
  const active = stages
    .map((s, i) => ({ hubIndex: i, stage: s, heat: levels[i] || 0 }))
    .filter((x) => x.stage > 0);
  return { stages, cells, active };
}

// 默认导出（兼容无命名导入的外部调用）
export default {
  createBattleContext, toGameState, emptyContext,
  computeHubHeat, detectAIPressure, computePollution,
};