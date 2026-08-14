// ============================================================
//  drama-pollution.js - 污染驱动的幽灵触发规划（CM4-R7 DramaEvent Active）
// ============================================================
//  定位：把 Ghost 从"AI 犯错/随机事件"升级为"战场进入危险状态的视觉化"。
//  幽灵不再随机出现，只出现在**被污染（冲突/决胜）的据点**里。
//
//  触发链（与 R6.5 污染分级对齐）：
//    heat 0/1 → stage 0  无污染（单纯热度，不出幽灵）
//    heat 2   → stage 1  中心格闪烁（unstable 预警，为幽灵铺垫）
//    heat 3   → stage 2  整宫污染 → 触发幽灵（ghost 落地）
//
//  设计约束（对齐 CM4-D1 硬性禁令）：
//    - 幽灵 100% 来自冲突（只选污染据点），不随机制造
//    - 幽灵只在空格生成，不覆盖玩家格/已有资源
//    - 纯函数、确定性选据点；具体空格由候选选择器在冲突据点内随机
//    - 无 DOM、可 headless 测试
//
//  本模块只负责"选哪个据点该出幽灵"，不负责生命周期（DramaEventManager 管）。
// ============================================================

/**
 * 选择当前应触发冲突幽灵的据点（确定性）。
 * 规则：从污染活跃据点里，选 stage 最高、heat 最高且未被排除的一个。
 *
 * @param {Object} params
 * @param {Object} params.pollution - computePollution 返回值 { stages, cells, active:[{hubIndex,stage,heat}] }
 * @param {number} [params.minStage=2] - 触发幽灵所需的最低污染级（默认 stage2=整宫污染）
 * @param {number[]} [params.avoidHubs=[]] - 排除的据点（如已绝杀/已结束的据点）
 * @returns {Object|null} { hubIndex, stage, heat }；无符合条件的据点返回 null
 */
export function planPollutionGhost({ pollution, minStage = 2, avoidHubs = [] }) {
  const active = (pollution && Array.isArray(pollution.active)) ? pollution.active : [];
  if (active.length === 0) return null;
  const avoid = new Set(avoidHubs || []);
  let best = null;
  for (const a of active) {
    if (a == null || a.hubIndex == null) continue;
    if (avoid.has(a.hubIndex)) continue;
    if (a.stage < minStage) continue;
    // 确定性选优：stage 优先，其次 heat
    if (!best
        || a.stage > best.stage
        || (a.stage === best.stage && (a.heat || 0) > (best.heat || 0))) {
      best = a;
    }
  }
  return best
    ? { hubIndex: best.hubIndex, stage: best.stage, heat: best.heat || 0 }
    : null;
}

/**
 * 污染幽灵调度器——管理每个据点的"连续争夺回合"累加器。
 * 只有据点持续处于决胜级污染（stage≥minStage）达到 minTurns 回合，才准出幽灵，
 * 让污染感是"持续失控"而非"一次性闪烁"。
 * 轻包装：状态在类内，选据点逻辑委托 planPollutionGhost 纯函数。
 */
export class PollutionGhostDriver {
  /**
   * @param {Object} [options]
   * @param {number} [options.minStage=2] - 触发所需最低污染级
   * @param {number} [options.minTurns=3] - 连续处于该污染级的回合数阈值
   * @param {number[]} [options.avoidHubs=[]] - 永久排除据点
   */
  constructor(options = {}) {
    this._minStage = options.minStage || 2;
    this._minTurns = options.minTurns || 3;
    this._avoidHubs = options.avoidHubs || [];
    this._streak = {}; // hubIndex → 连续污染回合数
  }

  /**
   * 每步调用：喂入当前污染状态，返回是否应在本步出幽灵 + 目标据点。
   * 内部维护连续回合累加器；据点脱离决胜污染时自动复位。
   * @param {Object} pollution - computePollution 返回值
   * @returns {Object|null} { hubIndex, stage, turns } 当达到连续阈值时返回；否则 null
   */
  tick(pollution) {
    const target = planPollutionGhost({ pollution, minStage: this._minStage, avoidHubs: this._avoidHubs });

    // 复位：当前处于决胜污染的据点集合
    const decisive = new Set();
    if (pollution && Array.isArray(pollution.active)) {
      for (const a of pollution.active) {
        if (a && a.hubIndex != null && a.stage >= this._minStage) decisive.add(a.hubIndex);
      }
    }
    for (const k of Object.keys(this._streak)) {
      if (!decisive.has(Number(k))) delete this._streak[k];
    }

    if (!target) return null;

    const hub = target.hubIndex;
    this._streak[hub] = (this._streak[hub] || 0) + 1;
    if (this._streak[hub] < this._minTurns) return null;
    return { hubIndex: hub, stage: target.stage, turns: this._streak[hub] };
  }

  /** 当前各据点连续污染回合数（副本） */
  getStreaks() { return { ...this._streak }; }

  /** 复位（开战/重置时调用） */
  reset() { this._streak = {}; }
}

export default { planPollutionGhost, PollutionGhostDriver };