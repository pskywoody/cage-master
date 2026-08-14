// ============================================================
//  drama-metrics.js - 戏剧质量指标采样（CM4-D1 §11）
// ============================================================
//  不以 AI 胜率为唯一判据，补充戏剧质量指标：
//    - Threat Readability  玩家能否发现 AI 意图（据点格集中度代理）
//    - Comeback Window     每局反击窗口数（落后方追平次数）
//    - Climax Density      后期（progress≥0.8）高潮事件占比
//    - Emotional Swing     领先变化次数（hubDiff 符号翻转）
//  AI vs AI 只能测结构代理（窗口存在性、领先摆动），测不出"玩家觉得爽"，
//  真人试玩采样需补一块（见规格 §11）。
// ============================================================

export class DramaTracker {
  constructor() {
    this._steps = [];            // { step, progress, hubDiff, phase }
    this._events = [];           // 决定性事件 { progress }
    this._hubMovesBySide = {};   // side -> { 0:n, 1:n, 2:n, total }
  }

  /**
   * 每步采样（duel harness 每回合调用）。
   * @param {Object} o
   * @param {number} o.step
   * @param {number} o.progress        0-1 盘面进度
   * @param {number} o.selfHubCount    本侧领先据点数
   * @param {number} o.opponentHubCount
   * @param {string} o.phase           opening|development|crisis|climax
   */
  recordStep({ step, progress, selfHubCount, opponentHubCount, phase }) {
    this._steps.push({
      step,
      progress: progress || 0,
      hubDiff: (selfHubCount || 0) - (opponentHubCount || 0),
      phase,
    });
  }

  /**
   * 记录某侧一次据点宫填数（用于计算 Threat Readability 集中度）。
   * @param {string} side 'player'|'boss'
   * @param {number} hubIdx 据点索引 0-2；非据点格传 -1 忽略
   */
  recordHubMove(side, hubIdx) {
    if (hubIdx == null || hubIdx < 0) return;
    if (!this._hubMovesBySide[side]) this._hubMovesBySide[side] = { 0: 0, 1: 0, 2: 0, total: 0 };
    this._hubMovesBySide[side][hubIdx] = (this._hubMovesBySide[side][hubIdx] || 0) + 1;
    this._hubMovesBySide[side].total++;
  }

  /**
   * 记录决定性事件（据点占领/连线威胁/绝杀等 TPL 事件）。
   * @param {number} progress 事件发生时的盘面进度
   */
  recordEvent(progress) {
    this._events.push({ progress: progress || 0 });
  }

  /**
   * 汇总戏剧指标。
   * @returns {Object} { steps, emotionalSwing, comebackWindow, climaxDensity, decisiveEvents, climaxEvents, threatReadability }
   */
  finalize() {
    // ---- Emotional Swing：hubDiff 符号变化次数（忽略 0） ----
    let swings = 0, lastSign = 0;
    for (const s of this._steps) {
      const sign = Math.sign(s.hubDiff);
      if (sign !== 0) {
        if (lastSign !== 0 && sign !== lastSign) swings++;
        lastSign = sign;
      }
    }

    // ---- Comeback Window：落后方（hubDiff≠0）追平到 0 的次数 ----
    let comebacks = 0, state = 0; // state: 1=领先(本侧) -1=落后(本侧) 0=持平
    for (const s of this._steps) {
      const st = s.hubDiff > 0 ? 1 : s.hubDiff < 0 ? -1 : 0;
      if (st !== state) {
        if (state !== 0 && st === 0) comebacks++;
        state = st;
      }
    }

    // ---- Climax Density：决定性事件在 progress≥0.8 的比例 ----
    const decisiveEvents = this._events.length;
    const climaxEvents = this._events.filter((e) => e.progress >= 0.8).length;
    const climaxDensity = decisiveEvents > 0 ? climaxEvents / decisiveEvents : 0;

    // ---- Threat Readability：每侧据点格集中度 maxHub/total（越高意图越清晰） ----
    const threatReadability = {};
    for (const side of Object.keys(this._hubMovesBySide)) {
      const m = this._hubMovesBySide[side];
      const maxHub = Math.max(m[0] || 0, m[1] || 0, m[2] || 0);
      threatReadability[side] = m.total > 0 ? Number((maxHub / m.total).toFixed(3)) : 0;
    }

    return {
      steps: this._steps.length,
      emotionalSwing: swings,
      comebackWindow: comebacks,
      climaxDensity: Number(climaxDensity.toFixed(3)),
      decisiveEvents,
      climaxEvents,
      threatReadability,
    };
  }
}