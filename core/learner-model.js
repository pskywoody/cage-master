// core/learner-model.js
// 轻量玩家认知状态模型 v1（研究版，只读可重放）。
// 消费 LessonPlayer 遥测事件 + TeachingSystem 状态，输出技能状态/遗忘曲线/推荐。
// 不接 UI、不改 solver，仅作可观测层与后续推荐引擎的参考实现。

export const SKILL_STATES = Object.freeze({
  UNKNOWN: 'unknown',
  EXPOSED: 'exposed',
  GUIDED: 'guided',
  INDEPENDENT: 'independent',
  MASTERED: 'mastered',
});

const TAU = 7 * 24 * 3600 * 1000; // 遗忘时间常数（7 天初值，待实验平台校准）

export class LearnerModel {
  constructor(options = {}) {
    options = options || {};
    this.tau = options.tau || TAU;
    this._skills = new Map(); // technique -> {encounters, correct, guided, hinted, errors, lastSeen, successAt:[], errorAt:[]}
    this._seed(options.seed || {});
  }

  _seed(seed) {
    for (const [tech, d] of Object.entries(seed)) {
      this._skills.set(tech, {
        encounters: d.encounterCount || 0,
        correct: d.correctCount || 0,
        guided: d.guided || 0,
        hinted: d.hinted || 0,
        errors: d.errors || 0,
        lastSeen: d.lastEncounteredAt || 0,
        successAt: Array.isArray(d.successAt) ? d.successAt.slice() : [],
        errorAt: Array.isArray(d.errorAt) ? d.errorAt.slice() : [],
      });
    }
  }

  /**
   * 观察一条归一化事件：
   * @param {Object} e - { technique, type, ts, independent?, hintLevel? }
   *   type: encounter | correct | hint | error
   */
  observe(e) {
    if (!e || !e.technique) return;
    const t = e.technique;
    if (!this._skills.has(t)) this._skills.set(t, { encounters: 0, correct: 0, guided: 0, hinted: 0, errors: 0, lastSeen: 0, successAt: [], errorAt: [] });
    const s = this._skills.get(t);
    const ts = e.ts || Date.now();
    s.lastSeen = Math.max(s.lastSeen, ts);
    switch (e.type) {
      case 'encounter': s.encounters++; break;
      case 'hint': s.hinted++; break;
      case 'correct':
        s.correct++;
        if (e.independent === false || (e.hintLevel && e.hintLevel >= 2)) s.guided++;
        s.successAt.push(ts);
        break;
      case 'error':
        s.errors++;
        s.errorAt.push(ts);
        break;
      default: break;
    }
  }

  /**
   * 技能状态 + 置信 + 趋势（规则打分，可解释）。
   * @returns {{state:string, confidence:number, trend:string}}
   */
  skillState(technique) {
    const s = this._skills.get(technique);
    if (!s || s.encounters === 0) return { state: SKILL_STATES.UNKNOWN, confidence: s ? 0.0 : 0.0, trend: 'flat' };
    const independent = s.correct - s.guided;
    const recent = this._recentSuccessRatio(technique, 3);
    const hintRatio = s.correct + s.errors > 0 ? s.hinted / Math.max(1, s.correct + s.errors) : 0;
    const repeated = this._recentErrorRatio(technique, 3);

    let state;
    if (independent <= 0) {
      state = hintRatio > 0 ? SKILL_STATES.GUIDED : SKILL_STATES.EXPOSED;
    } else if (recent >= 0.66 && repeated <= 0.25) {
      state = SKILL_STATES.MASTERED;
    } else {
      state = independent >= 1 ? SKILL_STATES.INDEPENDENT : SKILL_STATES.GUIDED;
    }

    const n = Math.min(10, s.encounters);
    const confidence = Math.min(0.95, 0.30 + n * 0.06 + (recent >= 0.5 ? 0.1 : -0.1));

    const trend = recent > this._recentSuccessRatio(technique, 6) ? 'improving'
      : (repeated > 0.5 ? 'struggling' : 'flat');

    return { state, confidence: Math.max(0.0, confidence), trend };
  }

  /**
   * 遗忘曲线 mastery(now)，范围 0..1，近期成功按指数衰减。
   */
  mastery(technique, now = Date.now()) {
    const s = this._skills.get(technique);
    if (!s) return 0;
    const decayed = s.successAt.reduce((acc, t) => acc + Math.exp(-(now - t) / (this.tau || TAU)), 0);
    return Math.min(1, decayed / 3); // 近期 3 次成功 ≈ 1.0
  }

  /**
   * 下一关推荐：优先"目标技巧当前较弱且近期未练"的关卡。
   * @param {Array} levels - [{levelId, techniques:[string]}]
   * @param {number} [now]
   * @returns {Array<{levelId, score, reasons:string[]}>}
   */
  recommend(levels, now = Date.now()) {
    return levels
      .map((lv) => {
        let score = 0;
        const reasons = [];
        (Array.isArray(lv.techniques) ? lv.techniques : []).forEach((t) => {
          const st = this.skillState(t);
          const m = this.mastery(t, now);
          if (st.state === SKILL_STATES.UNKNOWN || st.state === SKILL_STATES.GUIDED) { score += 2; reasons.push(`${t}=${st.state}`); }
          else if (m < 0.4) { score += 1.5; reasons.push(`${t}=需复测(mastery ${m.toFixed(2)})`); }
          else if (m < 0.7) { score += 0.5; reasons.push(`${t}=巩固`); }
        });
        const s = this._skills;
        const lastSeen = (Array.isArray(lv.techniques) ? lv.techniques : []).reduce((mx, t) => (s.has(t) ? Math.max(mx, s.get(t).lastSeen) : mx), 0);
        const idleDays = lastSeen ? (now - lastSeen) / 86400000 : 999;
        score += Math.min(1, idleDays / 7);
        return { levelId: lv.levelId, score: Math.round(score * 100) / 100, reasons };
      })
      .sort((a, b) => b.score - a.score);
  }

  _recentSuccessRatio(technique, k) {
    const s = this._skills.get(technique);
    if (!s || s.successAt.length === 0) return 0;
    const recent = s.successAt.slice(-k);
    return recent.length / Math.max(k, s.successAt.length);
  }

  _recentErrorRatio(technique, k) {
    const s = this._skills.get(technique);
    if (!s || s.errorAt.length === 0) return 0;
    const recent = s.errorAt.slice(-k);
    return recent.length / Math.max(k, s.errorAt.length);
  }

  toJSON() {
    const out = {};
    for (const [k, v] of this._skills.entries()) {
      out[k] = { encounterCount: v.encounters, correctCount: v.correct, guided: v.guided, hinted: v.hinted, errors: v.errors, lastEncounteredAt: v.lastSeen };
    }
    return out;
  }
}