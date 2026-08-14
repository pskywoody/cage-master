// ============================================================
//  drama-event-manager.js - 戏剧事件管理器（CM4-R5）
// ============================================================
//  定位：把"幽灵格"从"AI犯错的副产品"升级为"冲突区域的戏剧事件"。
//  Director 决定"现在制造什么局面"，DramaEventManager 负责具体执行：
//  选择位置、管理生命周期、触发/过期。
//
//  核心事件类型（第一版仅 GhostThreat）：
//    - GhostThreat：冲突区域出现幽灵格，制造战场污染感
//
//  设计原则：
//    1. 独立于 TPL 错误机制——是第二条幽灵来源，不替代旧路径
//    2. 第一版不侵占玩家格——只在空格生成，避免玩家失控感
//    3. 窗口分阶段——越高潮，窗口越长，压力越大
//    4. 纯逻辑，无 DOM，可 headless 测试
//
//  与 TPL 的集成：通过 options.addGhost / removeGhost 回调挂到
//  TPL 的 ghost 集合里，复用现有渲染/抢占/自动修正逻辑。
// ============================================================

// 各阶段的幽灵窗口时长（毫秒）
export const GHOST_LIFETIME_BY_PHASE = Object.freeze({
  opening: 5000,
  development: 8000,
  crisis: 10000,
  climax: 12000,
});

// 幽灵事件类型
export const DRAMA_EVENTS = Object.freeze({
  GHOST_SPAWNED: 'drama_ghost_spawned',   // 戏剧幽灵生成 { r, c, side, phase, durationMs }
  GHOST_EXPIRED: 'drama_ghost_expired',   // 戏剧幽灵过期 { r, c, side }
});

export class DramaEventManager {
  /**
   * @param {Object} options
   * @param {Function} options.addGhost    - (r, c, side, durationMs) => void  挂到 TPL ghost 集合
   * @param {Function} options.removeGhost - (r, c, side) => void              从 TPL ghost 集合移除
   * @param {Function} options.onEvent     - (event, data) => void             事件回调
   * @param {Object}   [options.lifetime]  - 覆盖各阶段窗口时长（毫秒）
   * @param {number}   [options.maxGhosts=3] - 同时存在的最大戏剧幽灵数
   * @param {number}   [options.cooldown=3000] - 两次幽灵事件之间的最小间隔（ms）
   */
  constructor(options = {}) {
    this._addGhost = typeof options.addGhost === 'function' ? options.addGhost : () => {};
    this._removeGhost = typeof options.removeGhost === 'function' ? options.removeGhost : () => {};
    this._onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this._lifetime = options.lifetime || GHOST_LIFETIME_BY_PHASE;
    this._maxGhosts = options.maxGhosts != null ? options.maxGhosts : 3;
    this._cooldown = options.cooldown != null ? options.cooldown : 3000;

    this._activeGhosts = new Map(); // key "r,c,side" → { timeoutId, spawnAt }
    this._lastSpawnAt = 0;
    this._enabled = true;
  }

  /** 启用/禁用（shadow 模式下可禁用生成） */
  setEnabled(v) { this._enabled = !!v; }
  isEnabled() { return this._enabled; }

  /**
   * 尝试触发一次 GhostThreat 戏剧事件。
   * 由 Director 或 controller 在合适时机调用。
   *
   * @param {Object} params
   * @param {string} params.side      - 'player' | 'boss'  幽灵属于哪一方（供对方抢占）
   * @param {string} params.phase     - 当前阶段 'opening'|'development'|'crisis'|'climax'
   * @param {number[]} params.candidateCells - 候选格子 [{r, c}]，优先冲突区域的空格
   * @param {number} [params.durationMs] - 自定义时长（默认按阶段）
   * @returns {Object|null} 成功返回 { r, c, side, durationMs }，失败返回 null
   */
  trySpawnGhost({ side, phase, candidateCells, durationMs }) {
    if (!this._enabled) return null;
    if (!candidateCells || candidateCells.length === 0) return null;

    // 冷却检查
    const now = Date.now();
    if (now - this._lastSpawnAt < this._cooldown) return null;

    // 数量上限检查
    const sideGhosts = [...this._activeGhosts.keys()].filter(k => k.endsWith(',' + side));
    if (sideGhosts.length >= this._maxGhosts) return null;

    // 随机选一个候选格
    const cell = candidateCells[Math.floor(Math.random() * candidateCells.length)];
    const key = `${cell.r},${cell.c},${side}`;
    if (this._activeGhosts.has(key)) return null; // 已存在

    const duration = durationMs != null
      ? durationMs
      : (this._lifetime[phase] || GHOST_LIFETIME_BY_PHASE.development);

    // 挂到 TPL
    this._addGhost(cell.r, cell.c, side, duration);

    // 设置过期定时器
    const timeoutId = setTimeout(() => {
      this._expireGhost(cell.r, cell.c, side);
    }, duration);

    this._activeGhosts.set(key, { timeoutId, spawnAt: now, durationMs: duration });
    this._lastSpawnAt = now;

    this._onEvent(DRAMA_EVENTS.GHOST_SPAWNED, {
      r: cell.r, c: cell.c, side, phase, durationMs: duration,
    });

    return { r: cell.r, c: cell.c, side, durationMs: duration };
  }

  /**
   * 手动移除一个戏剧幽灵（例如被抢占了）。
   */
  removeGhost(r, c, side) {
    const key = `${r},${c},${side}`;
    const entry = this._activeGhosts.get(key);
    if (!entry) return false;
    clearTimeout(entry.timeoutId);
    this._activeGhosts.delete(key);
    this._removeGhost(r, c, side);
    this._onEvent(DRAMA_EVENTS.GHOST_EXPIRED, { r, c, side, reason: 'removed' });
    return true;
  }

  _expireGhost(r, c, side) {
    const key = `${r},${c},${side}`;
    this._activeGhosts.delete(key);
    this._removeGhost(r, c, side);
    this._onEvent(DRAMA_EVENTS.GHOST_EXPIRED, { r, c, side, reason: 'expired' });
  }

  /** 获取当前活跃的戏剧幽灵列表 */
  getActiveGhosts(side) {
    const result = [];
    for (const [key, entry] of this._activeGhosts) {
      const [r, c, s] = key.split(',');
      if (side && s !== side) continue;
      result.push({
        r: Number(r),
        c: Number(c),
        side: s,
        remainingMs: Math.max(0, entry.durationMs - (Date.now() - entry.spawnAt)),
      });
    }
    return result;
  }

  /** 活跃戏剧幽灵数 */
  getActiveCount(side) {
    if (!side) return this._activeGhosts.size;
    let n = 0;
    for (const key of this._activeGhosts.keys()) {
      if (key.endsWith(',' + side)) n++;
    }
    return n;
  }

  /** 清理所有定时器（战斗结束时调用） */
  clearAll() {
    for (const [key, entry] of this._activeGhosts) {
      clearTimeout(entry.timeoutId);
      const [r, c, side] = key.split(',');
      this._removeGhost(Number(r), Number(c), side);
    }
    this._activeGhosts.clear();
    this._lastSpawnAt = 0;
  }
}

/**
 * 基于据点冲突度选择幽灵候选格。
 * 规则：
 *   - 只选空格（不侵占玩家格）
 *   - 优先选冲突度最高的据点（双方维度最接近）
 *   - 每个据点最多返回 N 个候选
 *
 * @param {Object} tpl     - ThreePointLineManager 实例
 * @param {Object} board   - Board
 * @param {number} [topKHubs=1] - 选冲突度前 K 的据点
 * @param {number} [perHub=4]  - 每个据点选多少候选格
 * @returns {{r:number,c:number}[]} 候选格列表
 */
export function selectConflictCandidates(tpl, board, topKHubs = 1, perHub = 4) {
  const candidates = [];
  if (!tpl || !board || !board.cells) return candidates;

  const hubs = tpl.getHubProgress() || [];
  const hubBlocks = tpl.getHubBlocks() || [];
  const size = board.size;
  const boxH = size <= 6 ? 2 : 3;
  const boxW = size / boxH;

  // 计算各据点冲突度（双方维度的接近程度）
  const conflicts = hubs.map((h, i) => {
    const total = Math.max(1, h.playerDims + h.bossDims);
    const balance = 1 - Math.abs(h.playerDims - h.bossDims) / total; // 0-1，越高越胶着
    return { idx: i, balance, total };
  });

  // 按冲突度排序，取前 K
  conflicts.sort((a, b) => b.balance - a.balance);
  const topHubs = conflicts.slice(0, topKHubs);

  // 从每个据点的空格中随机选 perHub 个
  for (const top of topHubs) {
    const blockIdx = hubBlocks[top.idx];
    if (blockIdx == null || blockIdx < 0) continue;
    const blockR = Math.floor(blockIdx / boxH) * boxH;
    const blockC = (blockIdx % boxH) * boxW;
    const empties = [];
    for (let r = blockR; r < blockR + boxH && r < size; r++) {
      for (let c = blockC; c < blockC + boxW && c < size; c++) {
        const cell = board.cells[r]?.[c];
        if (cell && !cell.fixedNum && !cell.fillNum && !cell.isAiFilled) {
          empties.push({ r, c });
        }
      }
    }
    // 随机取
    for (let i = 0; i < perHub && empties.length > 0; i++) {
      const idx = Math.floor(Math.random() * empties.length);
      candidates.push(empties[idx]);
      empties.splice(idx, 1);
    }
  }

  return candidates;
}

/**
 * 为指定据点选择候选幽灵格（CM4-R7：污染驱动的幽灵）。
 * 只在该据点的宫内选空格（不覆盖玩家格/已有资源），供污染据点的幽灵落地。
 *
 * @param {Object} tpl     - ThreePointLineManager 实例
 * @param {Object} board   - Board
 * @param {number} hubIdx  - 目标据点索引
 * @param {number} [perHub=4] - 最多选多少候选格
 * @returns {{r:number,c:number}[]} 候选格列表
 */
export function selectCandidatesForHub(tpl, board, hubIdx, perHub = 4) {
  const candidates = [];
  if (!tpl || !board || !board.cells || hubIdx == null || hubIdx < 0) return candidates;
  const hubBlocks = tpl.getHubBlocks() || [];
  const blockIdx = hubBlocks[hubIdx];
  if (blockIdx == null || blockIdx < 0) return candidates;
  const size = board.size;
  const boxH = size <= 6 ? 2 : 3;
  const boxW = size / boxH;
  const blockR = Math.floor(blockIdx / boxH) * boxH;
  const blockC = (blockIdx % boxH) * boxW;
  const empties = [];
  for (let r = blockR; r < blockR + boxH && r < size; r++) {
    for (let c = blockC; c < blockC + boxW && c < size; c++) {
      const cell = board.cells[r]?.[c];
      if (cell && !cell.fixedNum && !cell.fillNum && !cell.isAiFilled) {
        empties.push({ r, c });
      }
    }
  }
  for (let i = 0; i < perHub && empties.length > 0; i++) {
    const idx = Math.floor(Math.random() * empties.length);
    candidates.push(empties[idx]);
    empties.splice(idx, 1);
  }
  return candidates;
}

export default { DramaEventManager, DRAMA_EVENTS, GHOST_LIFETIME_BY_PHASE, selectConflictCandidates, selectCandidatesForHub };