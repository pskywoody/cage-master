// ============================================================
//  drama-planner.js - 戏剧节拍规划器（CM4-R7-A Drama Director）
// ============================================================
//  定位：Director 不只是"选一条对抗叙事"，还要决定"这一拍演什么冲突局面"。
//  本模块是 Director 的第二个规划源（Drama Planner），产出**戏剧指令**：
//  检测玩家行为模式 → 决定制造哪种战场节奏（Threat/Pressure/Recovery）→
//  Director 据此选择冲突剧本，冲突自然产生幽灵/压力（不是导演直接制造事件）。
//
//  设计约束（对齐 CM4-D1 硬性禁令）：
//    - 不直接指定落子，只输出"目标据点偏好 + 压力强度"（目标偏好，非新权重轴）
//    - 不制造会让 AI 输的动作，只在玩家过度集中于单翼时"转移压力"
//    - 纯逻辑、无 DOM、可 headless 确定性测试
//
//  当前版本（R7-A 第一个切片）：
//    Pressure 节拍 —— 检测玩家连续防守/进攻同一据点（单翼胶着）→
//    输出 shift_pressure 指令，把 AI 施压目标转移到另一翼冲突据点。
//    Threat/Recovery/Ghost 节拍留到 R7-A 后半段。
// ============================================================

/**
 * 纯函数：Pressure 节拍检测。
 * 当玩家最近连续 N 次聚焦同一据点（单翼胶着），判定"玩家过度投入一翼"，
 * 建议把 AI 施压目标转移到另一个非己方已占领的据点（另一翼冲突点）。
 *
 * @param {Object} params
 * @param {Array<{hub:number,kind:'attack'|'defend'}>} params.focusHistory - 最近玩家聚焦历史（最新在后）
 * @param {number} [params.hubCount=3] - 据点总数
 * @param {Array<'player'|'boss'|null>} [params.hubOwnership=[]] - 各据点归属
 * @param {number} [params.threshold=3] - 触发连续聚焦次数阈值
 * @returns {Object|null} 戏剧指令 { beat, fromHub, targetHub, pressure, streak }；未触发返回 null
 */
export function planPressureBeat({ focusHistory, hubCount, hubOwnership, threshold }) {
  if (!Array.isArray(focusHistory) || focusHistory.length === 0) return null;
  const th = threshold || 3;
  const hubs = hubCount || 3;

  const last = focusHistory[focusHistory.length - 1];
  if (!last || last.hub == null || last.hub < 0) return null;

  // 统计尾部连续相同据点的聚焦次数（玩家单翼胶着）
  let streak = 0;
  for (let i = focusHistory.length - 1; i >= 0; i--) {
    const e = focusHistory[i];
    if (e && e.hub === last.hub) streak++;
    else break;
  }
  if (streak < th) return null;
  const fromHub = last.hub;

  // 选一个"非 AI 已占领"且非 fromHub 的据点作为施压目标（另一翼冲突点）
  const owned = hubOwnership || [];
  let targetHub = -1;
  for (let i = 0; i < hubs; i++) {
    if (i === fromHub) continue;
    if (owned[i] === 'boss') continue; // 已归我方，非冲突点
    targetHub = i;
    break;
  }
  if (targetHub < 0) return null; // 无处施压（全部已占/只有单翼）

  const pressure = Math.min(1, streak / (th + 1));
  return { beat: 'shift_pressure', fromHub, targetHub, pressure, streak };
}

/**
 * DramaPlanner 类——持有玩家聚焦滚动历史，逐step 调用 plan() 产出戏剧指令。
 * 轻包装：核心逻辑在 planPressureBeat 纯函数里，类只负责状态累积与接口。
 */
export class DramaPlanner {
  /**
   * @param {Object} [options]
   * @param {number} [options.threshold=3] - 触发连续聚焦次数阈值
   * @param {number} [options.historyCap=8] - 聚焦历史最大长度（滚动窗口）
   */
  constructor(options = {}) {
    this._threshold = options.threshold || 3;
    this._historyCap = options.historyCap || 8;
    this._focusHistory = [];
    this._lastDirective = null;
  }

  /**
   * 记录一次玩家焦点（由 IntentObserver 高层意图喂入）。
   * 优先防守焦点；无防守焦点则取进攻焦点；两者皆无则不追踪。
   * @param {Object} intent - IntentObserver 输出（含 defendingHub/attackingHub）
   */
  recordFocus(intent) {
    if (!intent) return;
    const def = intent.defendingHub != null ? intent.defendingHub : -1;
    const atk = intent.attackingHub != null ? intent.attackingHub : -1;
    const hub = def >= 0 ? def : (atk >= 0 ? atk : -1);
    if (hub < 0) return;
    this._focusHistory.push({ hub, kind: def >= 0 ? 'defend' : 'attack' });
    if (this._focusHistory.length > this._historyCap) this._focusHistory.shift();
  }

  /**
   * 记录本次焦点并计算戏剧指令。
   * @param {Object} intent - IntentObserver 输出
   * @param {Object} ctx    - BattleContext（含 hubOwnership）
   * @returns {Object|null} 戏剧指令或 null
   */
  plan(intent, ctx) {
    this.recordFocus(intent);
    const hubOwnership = (ctx && ctx.hubOwnership) || [];
    const hubCount = hubOwnership.length || (ctx && ctx.hubCount) || 3;
    this._lastDirective = planPressureBeat({
      focusHistory: this._focusHistory,
      hubCount,
      hubOwnership,
      threshold: this._threshold,
    });
    return this._lastDirective;
  }

  /** 最近一次戏剧指令 */
  getDirective() { return this._lastDirective; }

  /** 当前聚焦历史（副本） */
  getHistory() { return this._focusHistory.slice(); }

  /** 清空状态（开战/重置时调用） */
  reset() {
    this._focusHistory = [];
    this._lastDirective = null;
  }
}

export default { planPressureBeat, DramaPlanner };