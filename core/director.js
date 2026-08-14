// ============================================================
//  director.js - 对抗戏剧导演引擎（CM4-D1/D2）
// ============================================================
//  定位：Director 不决定"怎么走"（那是 Tactical Solver），只决定
//        "为什么走 + 走哪条对抗叙事 + 锁多久"。它对现有 Solver 旋钮
//        输出"数据化意图"，禁止 switch(name) 行为分支。
//
//  设计约束（CM4-D1 §14 硬性禁令）：
//    - 不主动制造会让 AI 输的动作（Finite 只在近硬优势时）
//    - 不做戏剧性随机错误
//    - 不另起与 hubWeight/stealPriority/selectionStrategy 平行的新权重轴
//    - 只改 AI 决策层，不改 TPL 规则判定
//
//  Shadow Mode：decide(shadow=true) 只计算并记录建议，不产生任何调制，
//  用于校准双级 ε（策略级粗 / 候选级精确）。
// ============================================================

// -------------------------------------------------------------------
// 1. 剧情状态机（Phase Detector）
// -------------------------------------------------------------------
// 状态由对局指标推导（可复现、可测试）：
//   Opening(step<15%) / Development(15-50%) / Crisis(50-80%) / Climax(80%+)
// 用 hubDiff、wrongCount 对 phase 做精调修正。
// -------------------------------------------------------------------
export function detectPhase(gameState) {
  const progress = gameState.progress || 0;
  const selfHub = gameState.selfHubCount || 0;
  const oppHub = gameState.opponentHubCount || 0;
  const hubDiff = selfHub - oppHub;

  let phase;
  if (progress < 0.15) {
    phase = 'opening';
  } else if (progress < 0.50) {
    phase = 'development';
  } else if (progress < 0.80) {
    phase = 'crisis';
  } else {
    phase = 'climax';
  }

  // 精调：据点劣势把 phase 推前（更紧绷），优势把王朝 Climax 更接近收束
  if (phase === 'development' && hubDiff <= -1) phase = 'crisis';
  if (phase === 'crisis' && hubDiff >= 2) phase = 'climax';
  return phase;
}

// 各 phase 的笔记导演语言基调（步骤4 使用）
export const PHASE_NOTE_CADENCE = Object.freeze({
  opening: { noteRate: 0.55, fakeRate: 0.05 },   // 大量真笔记，建立可信度
  development: { noteRate: 0.35, fakeRate: 0.15 },
  crisis: { noteRate: 0.25, fakeRate: 0.40 },    // 增假笔记，制造心理压力
  climax: { noteRate: 0.0, fakeRate: 0.0 },      // 突然停止笔记，制造「它准备好了吗」
});

/**
 * 解析当前策略 + phase 的最终笔记基调。
 * 以 phase 三态为基线，策略级 noteCadence 覆盖其声明字段（如 trap 只覆盖 fakeRate）。
 * @returns {{noteRate:number, fakeRate:number}}
 */
export function resolveNoteCadence(strategyId, phase) {
  const base = PHASE_NOTE_CADENCE[phase] || PHASE_NOTE_CADENCE.opening;
  const cadence = { ...base };
  const strat = STRATEGY_POOL[strategyId];
  if (strat && strat.noteCadence) Object.assign(cadence, strat.noteCadence);
  return cadence;
}

// -------------------------------------------------------------------
// 2. Strategy Pool（七条对抗叙事模板）
// -------------------------------------------------------------------
// 每条策略 = 数据化意图（对现有旋钮的参数化），不是代码分支。
// 参数含义：
//   hubWeight   据点权重系数（相对 Solver 基线的倍数）
//   stealLevel  抢格激进度 0-1（映射到 stealPriority 方向）
//   targetSource 'weakest'|'contested'|'owned'|'none' 目标据点选择
//   noteCadence 笔记基调覆盖（null=用 phase 默认）
//   risk        策略整体风险 0-1（供 ε Gate 校验）
// -------------------------------------------------------------------
export const STRATEGY_POOL = Object.freeze({
  probe: {
    id: 'probe', name: 'Probe 试探',
    intent: 'test_player_response',
    hubWeight: 0.9, stealLevel: 0.2, targetSource: 'weakest', noteCadence: null,
    risk: 0.05, trigger: 'always',
    winValue: 0.3,    // 低风险但目标模糊，胜率贡献小
    dramaValue: 0.2,  // 开场氛围营造，戏剧张力低
  },
  pressure: {
    id: 'pressure', name: 'Pressure 施压',
    intent: 'contest_hub',
    hubWeight: 1.35, stealLevel: 0.5, targetSource: 'contested', noteCadence: null,
    risk: 0.18, trigger: 'development|crisis',
    winValue: 0.7,    // 明确争夺据点，胜率贡献中等偏上
    dramaValue: 0.6,  // 拉锯战核心，戏剧张力中等
  },
  steal: {
    id: 'steal', name: 'Steal 夺取',
    intent: 'capture_enemy_error',
    hubWeight: 1.1, stealLevel: 0.85, targetSource: 'contested', noteCadence: null,
    risk: 0.22, trigger: 'player_mistake',
    winValue: 0.85,   // 抓失误直接夺点，胜率贡献高
    dramaValue: 0.8,  // 转折点，戏剧张力高
  },
  fortify: {
    id: 'fortify', name: 'Fortify 巩固',
    intent: 'protect_owned_hubs',
    hubWeight: 1.0, stealLevel: 0.15, targetSource: 'owned', noteCadence: null,
    risk: 0.08, trigger: 'leading',
    winValue: 0.75,   // 守住领先优势，胜率贡献高
    dramaValue: 0.3,  // 防守叙事，张力较低
  },
  gamble: {
    id: 'gamble', name: 'Gamble 赌博',
    intent: 'create_high_variance',
    hubWeight: 1.45, stealLevel: 0.9, targetSource: 'contested', noteCadence: null,
    risk: 0.20, trigger: 'behind',
    winValue: 0.4,    // 高风险可能翻盘也可能崩，期望胜率低
    dramaValue: 0.95, // 孤注一掷，戏剧张力顶格
  },
  trap: {
    id: 'trap', name: 'Trap 诱导',
    intent: 'bait_player',
    hubWeight: 0.85, stealLevel: 0.3, targetSource: 'weakest', noteCadence: { fakeRate: 0.5 },
    risk: 0.15, trigger: 'prober',
    winValue: 0.5,    // 心理战，效果不确定，胜率贡献中等
    dramaValue: 0.7,  // 设局/识破，戏剧张力高
  },
  finish: {
    id: 'finish', name: 'Finish 收束',
    intent: 'convert_advantage',
    hubWeight: 1.2, stealLevel: 0.4, targetSource: 'weakest', noteCadence: null,
    risk: 0.10, trigger: 'advantage',
    winValue: 0.95,   // 优势收束，胜率贡献最高
    dramaValue: 0.5,  // 收束阶段，张力中等（期待结局）
  },
});

// 人格 → 策略倾向权重（选枚举，非新增数值轴）
export const PERSONALITY_STRATEGY_BIAS = Object.freeze({
  blind:   { gamble: 2.0, steal: 1.5, pressure: 1.2, probe: 1.0, fortify: 0.5, trap: 0.5, finish: 1.0 },  // 薇拉 冒险型
  expert:  { fortify: 2.0, pressure: 1.5, probe: 1.0, finish: 1.3, steal: 0.8, gamble: 0.4, trap: 0.5 },  // 山田 冷静型
  prober:  { trap: 2.0, probe: 1.5, gamble: 1.2, pressure: 1.0, steal: 0.8, fortify: 0.6, finish: 0.8 },  // 沈墨 心理型
  steady:  { probe: 1.0, pressure: 1.0, steal: 1.0, fortify: 1.0, gamble: 1.0, trap: 1.0, finish: 1.0 },
  mentor:  { probe: 1.5, fortify: 1.3, pressure: 0.7, steal: 0.4, gamble: 0.3, trap: 0.5, finish: 0.8 },  // 伊藤 教学陪练
  surround: { steal: 1.6, trap: 1.4, pressure: 1.2, probe: 0.8, gamble: 1.0, fortify: 0.6, finish: 0.9 }, // 老师
  reckless: { gamble: 2.0, steal: 1.6, pressure: 1.3, probe: 0.6, fortify: 0.4, trap: 0.6, finish: 0.8 },
  average: { probe: 1.0, pressure: 1.0, steal: 1.0, fortify: 1.0, gamble: 0.8, trap: 0.8, finish: 1.0 },
});

// -------------------------------------------------------------------
// 3. Director 主类
// -------------------------------------------------------------------
export class Director {
  /**
   * @param {Object} options
   * @param {string} [options.personality='steady'] 人格 id（取 bias 表）
   * @param {number} [options.epsStrategy=0.15] 策略级 ε：激进度最大允许上浮
   * @param {number} [options.lockMin=3] 策略锁最小步
   * @param {number} [options.lockMax=8] 策略锁最大步
   */
  constructor(options = {}) {
    this._personality = options.personality || 'steady';
    this._bias = PERSONALITY_STRATEGY_BIAS[this._personality] || PERSONALITY_STRATEGY_BIAS.steady;
    this._eps = options.epsStrategy ?? 0.15;
    this._lockMin = options.lockMin ?? 3;
    this._lockMax = options.lockMax ?? 8;

    // CM4-R3：四维策略评分权重（默认各 0.25，总和=1）
    const sw = options.strategyWeights || {};
    this._strategyWeights = {
      win: sw.win != null ? sw.win : 0.25,
      drama: sw.drama != null ? sw.drama : 0.25,
      person: sw.person != null ? sw.person : 0.25,
      intent: sw.intent != null ? sw.intent : 0.25,
    };
    // 是否启用 scored 模式（默认开启；可设置 useScoredPick:false 回退旧版）
    this._useScoredPick = options.useScoredPick !== false;

    this._phase = 'opening';
    this._active = null;          // { id, name, lockLeft, risk }
    this._lastDecision = null;
    this._shadowLog = [];         // shadow 模式记录：{ step, phase, recommendedId, actualId?, hubDiff }
    this._shadow = false;
  }

  _clearLock() {
    this._active = null;
  }

  /**
   * 判断某策略在 ε Gate 下是否可放行。
   * 规则：策略激进度相对"最小干预基线(probe)"的上浮量 ≤ ε，否则拒绝。
   * 例外：finish 只在近硬优势时放行（L1 硬目标覆盖戏剧选择）。
   * @returns {boolean}
   */
  _passGate(strategy, gameState) {
    const baselineRisk = STRATEGY_POOL.probe.risk;
    const delta = strategy.risk - baselineRisk;
    if (strategy.id === 'finish') {
      return (gameState.selfHubCount || 0) >= 2 && (gameState.selfHubCount || 0) > (gameState.opponentHubCount || 0);
    }
    return delta <= this._eps;
  }

  /**
   * 依据触发条件过滤候选策略。
   * @returns {string[]} 候选策略 id 列表（未加权）
   */
  _eligibleStrategies(gameState, observer) {
    const phase = this._phase;
    const selfHub = gameState.selfHubCount || 0;
    const oppHub = gameState.opponentHubCount || 0;
    const playerMistake = (gameState.consecutiveErrors || 0) >= 2;
    const advantage = selfHub > oppHub;
    const behind = selfHub < oppHub;

    return Object.values(STRATEGY_POOL).filter((s) => {
      const t = s.trigger;
      if (t === 'always') return true;   // 审计修复：'always' 不匹配任何 phase 子串，需显式放行
      if (t.includes(phase)) return true;
      if (t === 'player_mistake' && playerMistake) return true;
      if (t === 'leading' && advantage) return true;
      if (t === 'behind' && behind) return true;
      if (t === 'advantage' && advantage) return true;
      if (t === 'prober' && this._personality === 'prober') return true;
      return false;
    }).map((s) => s.id);
  }

  /**
   * 加权随机选策略（人格 bias 参与）——旧版，作为 fallback 保留。
   */
  _weightedPick(eligible) {
    const weights = eligible.map((id) => this._bias[id] || 1.0);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < eligible.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return eligible[i];
    }
    return eligible[eligible.length - 1];
  }

  /**
   * CM4-R3：四维策略评分模型。
   *
   * score =
   *   wWin       * winValue(strategy)
   *   + wDrama   * dramaValue(strategy) * phaseDramaMultiplier(phase)
   *   + wPerson  * normalizedPersonalityBias(strategy)
   *   + wIntent  * intentMatch(strategy, observer)
   *
   * 四维权重可通过 options.strategyWeights 覆盖（默认各 0.25）。
   * playerIntentMatch 预留接入点——R4 IntentObserver 上线后填充。
   *
   * @param {string} strategyId
   * @param {Object} gameState
   * @param {Object} observer  - { analysis: { targetHub, isBeingTargeted, ... } }
   * @returns {number} 综合得分（0-1 区间近似）
   */
  _scoreStrategy(strategyId, gameState, observer) {
    const s = STRATEGY_POOL[strategyId];
    if (!s) return 0;

    const w = this._strategyWeights;

    // 1. winValue：策略的胜率价值（已在 STRATEGY_POOL 定义）
    const win = s.winValue != null ? s.winValue : 0.5;

    // 2. dramaValue：戏剧价值 × 阶段倍率
    //    Opening 偏试探，drama 权重低；Crisis/Climax 权重高
    const phaseDramaMult = {
      opening: 0.5,
      development: 0.8,
      crisis: 1.2,
      climax: 1.0,
    };
    const phaseMult = phaseDramaMult[this._phase] != null ? phaseDramaMult[this._phase] : 1.0;
    const dramaBase = s.dramaValue != null ? s.dramaValue : 0.5;
    const drama = Math.min(1.0, dramaBase * phaseMult);

    // 3. personalityBias：人格偏置归一化（0-1）
    //    取 bias / maxBias（max=2.0）
    const bias = this._bias[strategyId] != null ? this._bias[strategyId] : 1.0;
    const person = Math.min(1.0, bias / 2.0);

    // 4. intentMatch：玩家意图匹配（R4 前默认 0.5，即"不偏不倚"）
    //    R4 升级 IntentObserver 后，这里会根据 attackingHub/defendingHub 等计算
    let intentMatch = 0.5;
    const analysis = observer && observer.analysis;
    if (analysis && analysis.targetHub != null && analysis.targetHub >= 0) {
      // 已有 targetHub 时，根据策略 targetSource 做简单匹配：
      //   - contested 类策略（pressure/steal/gamble）匹配度高（玩家在攻）
      //   - owned 类（fortify）匹配度高（玩家在攻我方据点）
      //   - weakest 类（probe/trap/finish）匹配度中等
      const target = s.targetSource;
      if (target === 'contested' && analysis.isBeingTargeted) intentMatch = 0.8;
      else if (target === 'contested') intentMatch = 0.6;
      else if (target === 'owned' && analysis.isBeingTargeted) intentMatch = 0.9;
      else if (target === 'owned') intentMatch = 0.3;
      else intentMatch = 0.5;
    }
    // CM4-R7-A：Drama 指令介入——导演决定"转移施压"时，抬高"争夺型"策略
    // （pressure/steal/gamble）的意图匹配，让 Director 偏向选择去执行这场施压。
    // 只改选枚举的倾向，不新增权重轴、不直接指定落子。
    const dramaDir = this._dramaDirective;
    if (dramaDir && dramaDir.targetHub != null && Number.isInteger(dramaDir.targetHub)) {
      if (target === 'contested') intentMatch = Math.min(0.95, intentMatch + 0.2);
    }

    const score = w.win * win + w.drama * drama + w.person * person + w.intent * intentMatch;
    return score;
  }

  /**
   * CM4-R3：基于四维评分的加权随机选择。
   * 分数映射为选择权重（score → 1 + score * 2），保证低分配仍有保底概率。
   * @param {string[]} eligible  - 候选策略 id 列表
   * @param {Object} gameState
   * @param {Object} observer
   * @returns {{ id: string, scores: Object.<string, number> }} 选中 id + 各候选得分（用于 shadow 日志）
   */
  _scoredPick(eligible, gameState, observer) {
    const scores = {};
    for (const id of eligible) {
      scores[id] = this._scoreStrategy(id, gameState, observer);
    }
    // 得分 → 权重：保底 1.0 + 得分 × 放大系数
    const weights = eligible.map((id) => 1.0 + scores[id] * 3.0);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    let chosen = eligible[eligible.length - 1];
    for (let i = 0; i < eligible.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { chosen = eligible[i]; break; }
    }
    return { id: chosen, scores };
  }

  /**
   * 打破条件——策略锁可提前解锁。
   * @returns {boolean}
   */
  _shouldReleaseLock(gameState, prevDecision) {
    if (!prevDecision) return false;
    // 据点归属翻转：selfHubCount 变化即解锁。用 selfHubCount 而非 hubOwnership 计数
    // （hubOwnership 用 'boss'/'player' 固定标签，与 self 侧不符会导致玩家侧锁恒失效）
    if (prevDecision.selfHubCount !== undefined
        && (gameState.selfHubCount || 0) !== (prevDecision.selfHubCount || 0)) return true;
    // 玩家失误尖峰
    if (prevDecision.consecutiveErrors !== undefined
        && (gameState.consecutiveErrors || 0) >= prevDecision.consecutiveErrors + 2) return true;
    return false;
  }

  /**
   * 决策入口。
   * @param {Object} gameState  - { progress, selfHubCount, opponentHubCount, hubOwnership, consecutiveErrors, ... }
   * @param {Object} observer   - { analysis: { targetHub, isBeingTargeted, ... } }
   * @param {Object} [context]  - { stepCount, shadow, actualStrategyId }
   * @returns {Object} director 决策：{ phase, strategyId, strategyName, params, lock, released, gatedRejected }
   */
  decide(gameState = {}, observer = {}, context = {}) {
    this._phase = detectPhase(gameState);
    // CM4-R7-A：Drama 指令输入（Drama Planner 产出的冲突剧本方向）
    this._dramaDirective = (context && context.drama) || null;

    let decision = null;
    let released = false;
    let gatedRejected = null;

    // 若处于策略锁内且未到打破条件，继续原策略
    if (this._active && this._active.lockLeft > 0) {
      if (this._shouldReleaseLock(gameState, this._active)) {
        this._clearLock();
        released = true;
      } else {
        const cur = STRATEGY_POOL[this._active.id];
        this._active.lockLeft--;
        decision = this._buildDecision(cur, gameState, this._active.lockLeft);
      }
    }

    // 否则重新选策略
    if (!decision) {
      const eligible = this._eligibleStrategies(gameState, observer);
      // ε Gate（粗）：过滤超阈值策略
      const gated = eligible.filter((id) => this._passGate(STRATEGY_POOL[id], gameState));
      let chosenId = null;
      let scoredScores = null;
      if (gated.length === 0) {
        // 全部被 gate 拒绝 → 回退最小干预 probe（同样建立策略锁，避免锁期恒 0）
        gatedRejected = eligible;
        chosenId = 'probe';
      } else if (this._useScoredPick) {
        // CM4-R3：四维评分模型选择策略
        const result = this._scoredPick(gated, gameState, observer);
        chosenId = result.id;
        scoredScores = result.scores;
      } else {
        // 旧版：纯人格 bias 加权
        chosenId = this._weightedPick(gated);
      }
      const s = STRATEGY_POOL[chosenId];
      const lockLen = this._lockMin + Math.floor(Math.random() * (this._lockMax - this._lockMin + 1));
      this._active = { id: chosenId, lockLeft: lockLen, risk: s.risk, selfHubCount: gameState.selfHubCount, consecutiveErrors: gameState.consecutiveErrors };
      decision = this._buildDecision(s, gameState, lockLen);
      // shadow 日志附加得分（用于校准分析）
      if (scoredScores) decision._scores = scoredScores;
      if (gatedRejected) decision._gatedRejected = gatedRejected;
    }

    // Shadow 记录（不改行为）
    if (context.shadow === true || this._shadow) {
      this._shadowLog.push({
        step: context.stepCount ?? this._shadowLog.length,
        phase: this._phase,
        recommendedId: decision.strategyId,
        recommendedName: decision.strategyName,
        actualId: context.actualStrategyId ?? null,
        hubDiff: (gameState.selfHubCount || 0) - (gameState.opponentHubCount || 0),
        gatedRejected,
        // CM4-R3：各候选策略得分（四维评分模型输出，用于 ε 校准）
        scores: decision._scores || null,
      });
    }

    // 审计修复：released 由 decide 显式计算（本步是否打破旧锁），而非 _buildDecision 内部状态推导
    decision.released = released;

    // CM4-R7-A：Drama 指令并入决策——只携带"目标据点偏好"（非新权重轴），
    // 下游 AIPlayerCore 据此把 AI 施压目标转移到对立翼。
    const dramaDir = this._dramaDirective;
    if (dramaDir && dramaDir.targetHub != null && Number.isInteger(dramaDir.targetHub)) {
      decision.params = Object.assign({}, decision.params, { targetHub: dramaDir.targetHub });
      decision.drama = {
        beat: dramaDir.beat || 'shift_pressure',
        targetHub: dramaDir.targetHub,
        pressure: dramaDir.pressure || 0,
      };
    }

    this._lastDecision = decision;
    return decision;
  }

  _buildDecision(strategy, gameState, lockLen) {
    const params = {
      hubWeightMult: strategy.hubWeight,
      stealLevel: strategy.stealLevel,
      targetSource: strategy.targetSource,
      noteCadence: resolveNoteCadence(strategy.id, this._phase),
    };
    return {
      phase: this._phase,
      strategyId: strategy.id,
      strategyName: strategy.name,
      intent: strategy.intent,
      params,
      lock: lockLen,
      released: false, // released 由 decide 显式覆盖
    };
  }

  getPhase() { return this._phase; }
  getActive() { return this._active; }
  enableShadow() { this._shadow = true; }
  disableShadow() { this._shadow = false; }
  getShadowLog() { return this._shadowLog; }

  /**
   * 汇总 shadow 统计（供校准 ε）。
   * @returns {Object} { total, recommendVsActual, gatedCount, phaseDist, perStrategy, strategyScores }
   */
  summarizeShadow() {
    const total = this._shadowLog.length;
    const phaseDist = {};
    const perStrategy = {};
    let recommendVsActual = { same: 0, diff: 0 };
    let gatedCount = 0;
    // CM4-R3：各策略平均得分统计（四维评分模型校准）
    const strategyScores = {}; // { [id]: { count, sum, avg } }
    for (const e of this._shadowLog) {
      phaseDist[e.phase] = (phaseDist[e.phase] || 0) + 1;
      perStrategy[e.recommendedId] = (perStrategy[e.recommendedId] || 0) + 1;
      if (e.actualId == null) {
        recommendVsActual.diff++;
      } else if (e.actualId === e.recommendedId) {
        recommendVsActual.same++;
      } else {
        recommendVsActual.diff++;
      }
      if (e.gatedRejected && e.gatedRejected.length) gatedCount++;
      if (e.scores) {
        for (const id in e.scores) {
          const v = e.scores[id];
          if (!strategyScores[id]) strategyScores[id] = { count: 0, sum: 0, min: Infinity, max: -Infinity };
          strategyScores[id].count++;
          strategyScores[id].sum += v;
          if (v < strategyScores[id].min) strategyScores[id].min = v;
          if (v > strategyScores[id].max) strategyScores[id].max = v;
        }
      }
    }
    // 计算平均分
    for (const id in strategyScores) {
      const s = strategyScores[id];
      s.avg = s.count > 0 ? s.sum / s.count : 0;
    }
    return { total, phaseDist, perStrategy, recommendVsActual, gatedCount, strategyScores };
  }
}