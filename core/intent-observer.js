// ============================================================
//  intent-observer.js - 意图观察器（CM4-R4）
// ============================================================
//  定位：把 OpponentObserver 的低层信号（targetHub/tempo/aggression/...）
//  翻译成高层玩家意图（attackingHub/defendingHub/chasingLine/riskLevel）。
//
//  输入：OpponentObserver.getAnalysis() 结果 + BattleContext（据点归属/进度）
//  输出：
//    {
//      attackingHub:  number,    // 玩家主攻据点索引 (-1=无)
//      defendingHub:  number,    // 玩家主守据点索引 (-1=无)
//      chasingLine:   boolean,   // 是否在冲三点连线
//      riskLevel:     number,    // 0-1 玩家行动的激进程度
//      confidence:    number,    // 0-1 推断置信度
//      strategy:      string,    // 'pressure' | 'fortify' | 'probe' | 'finish'
//    }
//
//  设计原则：
//    1. 纯推理，不持有状态（输入驱动输出）
//    2. 不依赖渲染/DOM，可 headless 测试
//    3. 与 OpponentObserver 解耦：输入是 analysis 对象，不关心来源
// ============================================================

/**
 * 从低层观察信号 + 战斗上下文推断玩家意图。
 * @param {Object} analysis - OpponentObserver.getAnalysis() 返回
 * @param {Object} ctx      - BattleContext（含 hubOwnership/selfHubCount/opponentHubCount/progress）
 * @param {Object} [options]
 * @returns {Object} intent 对象
 */
export function inferIntent(analysis, ctx, options = {}) {
  analysis = analysis || {};
  ctx = ctx || {};

  const targetHub = analysis.targetHub != null ? analysis.targetHub : -1;
  const aggression = analysis.aggression != null ? analysis.aggression : 0;
  const tempo = analysis.tempo || 'steady';
  const strategy = analysis.strategy || 'balanced';
  const intensity = analysis.intensity || 1.0;

  const hubOwnership = ctx.hubOwnership || [];
  const selfHubCount = ctx.selfHubCount || 0;
  const oppHubCount = ctx.opponentHubCount || 0;
  const progress = ctx.progress || 0;

  // ---- 1. attackingHub：玩家正在攻哪个据点 ----
  //    规则：targetHub 明确 且 该据点不属于玩家（或归属不明确）→ 判定为进攻
  let attackingHub = -1;
  let attackingConf = 0;
  if (targetHub >= 0) {
    const owner = hubOwnership[targetHub];
    if (owner !== 'player') {
      // 攻的是己方/中立/对方据点
      attackingHub = targetHub;
      // 置信度：aggression 越高越确定
      attackingConf = 0.4 + aggression * 0.5;
      if (strategy === 'aggressive') attackingConf += 0.1;
      if (tempo === 'accelerating') attackingConf += 0.1;
      attackingConf = Math.min(1, attackingConf * intensity);
    }
  }

  // ---- 2. defendingHub：玩家正在守哪个据点 ----
  //    规则：targetHub 是玩家已占据点 或 strategy=defensive → 判定为防守
  let defendingHub = -1;
  let defendingConf = 0;
  if (targetHub >= 0 && hubOwnership[targetHub] === 'player') {
    defendingHub = targetHub;
    defendingConf = 0.5 + (1 - aggression) * 0.3;
    if (strategy === 'defensive') defendingConf += 0.15;
    defendingConf = Math.min(1, defendingConf);
  } else if (strategy === 'defensive') {
    // 防守策略但目标不明确 → 选玩家拥有的、维度最少的据点（最可能在巩固）
    let best = -1, bestScore = Infinity;
    const counts = ctx.hubCounts || [];
    for (let i = 0; i < hubOwnership.length; i++) {
      if (hubOwnership[i] !== 'player') continue;
      const cnt = counts[i] ? (counts[i].player || 0) : 0;
      if (cnt < bestScore) { bestScore = cnt; best = i; }
    }
    if (best >= 0) {
      defendingHub = best;
      defendingConf = 0.35; // 低置信度（目标不明确）
    }
  }

  // ---- 3. chasingLine：玩家是否在冲三点连线 ----
  //    规则：玩家已占 2 个据点 + 进度 >50% + 策略激进 → 可能在冲线
  let chasingLine = false;
  let chasingConf = 0;
  if (oppHubCount >= 2) {
    chasingLine = true;
    chasingConf = 0.5 + progress * 0.4;
    if (strategy === 'aggressive') chasingConf += 0.1;
    if (tempo === 'accelerating') chasingConf += 0.1;
    chasingConf = Math.min(1, chasingConf);
  } else if (oppHubCount >= 1 && selfHubCount === 0 && progress > 0.3) {
    // 玩家占 1 个、对方 0 个、进度推进中 → 低概率在冲线（早期）
    chasingLine = false;
    chasingConf = 0.2;
  }

  // ---- 4. riskLevel：玩家行动的激进程度（0-1）----
  //    综合 aggression + tempo + strategy
  let riskLevel = 0;
  riskLevel += aggression * 0.4;
  if (tempo === 'accelerating') riskLevel += 0.25;
  else if (tempo === 'decelerating') riskLevel -= 0.1;
  if (strategy === 'aggressive') riskLevel += 0.25;
  else if (strategy === 'defensive') riskLevel -= 0.15;
  // 阶段修正：crisis/climax 玩家普遍更激进
  if (progress > 0.5) riskLevel += 0.1;
  riskLevel = Math.max(0, Math.min(1, riskLevel));

  // ---- 5. 总置信度 ----
  const sampleSize = (analysis._sampleSize) || 0;
  let confidence = 0.3; // 基础置信度
  if (targetHub >= 0) confidence += 0.2;
  if (strategy !== 'balanced') confidence += 0.15;
  if (tempo !== 'steady') confidence += 0.1;
  confidence = Math.min(1, confidence * intensity);

  // ---- 6. 高层策略标签 ----
  let intentStrategy = 'probe';
  if (chasingLine && chasingConf > 0.6) {
    intentStrategy = 'finish';
  } else if (attackingHub >= 0 && attackingConf > 0.5 && riskLevel > 0.5) {
    intentStrategy = 'pressure';
  } else if (defendingHub >= 0 && defendingConf > 0.4) {
    // 有明确防守目标才判 fortify
    intentStrategy = 'fortify';
  } else if (riskLevel > 0.7) {
    intentStrategy = 'pressure';
  } else if (targetHub < 0 && strategy === 'balanced' && riskLevel < 0.4) {
    // 无明确目标 + 平衡策略 + 低风险 → 试探
    intentStrategy = 'probe';
  } else if (riskLevel > 0.5) {
    intentStrategy = 'pressure';
  } else if (strategy === 'defensive') {
    intentStrategy = 'fortify';
  }
  // 其余保持 probe（默认）

  return {
    attackingHub,
    defendingHub,
    chasingLine,
    riskLevel,
    confidence,
    strategy: intentStrategy,
    // 保留原始分析，供调试/降级使用
    _raw: {
      targetHub,
      aggression,
      tempo,
      rawStrategy: strategy,
      isBeingTargeted: analysis.isBeingTargeted,
    },
    // 各维度置信度（用于 Director 调参）
    _conf: {
      attacking: attackingConf,
      defending: defendingConf,
      chasing: chasingConf,
    },
  };
}

/**
 * IntentObserver 类——包装 inferIntent，持有最近一次分析结果。
 * 设计为"轻包装"：核心逻辑在 inferIntent 纯函数里，类只负责缓存和接口兼容。
 */
export class IntentObserver {
  constructor(options = {}) {
    this._intensity = options.intensity || 1.0;
    this._lastIntent = null;
  }

  /**
   * 从观察信号 + 上下文推断意图。
   * @param {Object} analysis - OpponentObserver.getAnalysis() 返回
   * @param {Object} ctx      - BattleContext
   * @returns {Object} intent
   */
  infer(analysis, ctx) {
    const intent = inferIntent(analysis, ctx, { intensity: this._intensity });
    this._lastIntent = intent;
    return intent;
  }

  /** 获取最近一次推断结果 */
  getIntent() {
    return this._lastIntent;
  }

  /** 运行时调整强度 */
  setIntensity(v) {
    if (v > 0) this._intensity = v;
  }

  /**
   * 兼容旧接口：返回类 OpponentObserver.analysis 结构的对象，
   * 让下游（Director / AIPlayerCore._applyObserverAnalysis）无需改动即可消费。
   * 新增字段通过 _intent 属性暴露。
   */
  toAnalysisCompat(intent) {
    const i = intent || this._lastIntent;
    if (!i) return { targetHub: -1, isBeingTargeted: false };
    return {
      targetHub: i.attackingHub >= 0 ? i.attackingHub : i.defendingHub,
      isBeingTargeted: i.attackingHub >= 0 && i._conf.attacking > 0.4,
      tempo: i._raw?.tempo || 'steady',
      aggression: i.riskLevel,
      strategy: i._raw?.rawStrategy || 'balanced',
      intensity: this._intensity,
      // 新增：高层意图
      _intent: i,
    };
  }
}

export default { inferIntent, IntentObserver };