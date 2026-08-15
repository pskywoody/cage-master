// core/experiment-analyzer.js
// 只读研究基础设施：离线实验分析器。输出指标、置信区间、样本量、缺失事件率、分流平衡。
// 不做显著性自动判决（只给 CI，由人判断）。

import { LearnerModel } from './learner-model.js';

function wilson(p, n, z = 1.96) {
  if (!n) return [0, 0];
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const rad = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - rad) / denom), Math.min(1, (centre + rad) / denom)];
}

function normalCI(mean, sd, n, z = 1.96) {
  if (!n || !sd) return [mean, mean];
  const se = sd / Math.sqrt(n);
  return [mean - z * se, mean + z * se];
}

function toObs(ev) {
  if (!ev.subject || !ev.subject.skill) return null;
  const t = ev.timestamp || 0;
  switch (ev.event) {
    case 'mistake': return { technique: ev.subject.skill, type: 'error', ts: t };
    case 'solve_success':
    case 'lesson_complete': return { technique: ev.subject.skill, type: 'correct', independent: true, ts: t };
    case 'hint_request':
    case 'hint_shown': {
      const o = { technique: ev.subject.skill, type: 'hint', ts: t };
      if (ev.metrics && ev.metrics.hint_level !== undefined) o.hintLevel = ev.metrics.hint_level;
      return o;
    }
    default: return null;
  }
}

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

/**
 * 分析一次实验。
 * @param {Object} experiment - registry 实验定义
 * @param {Array} events - 实验事件数组
 * @returns {Object} analysis
 */
export function analyzeExperiment(experiment, events) {
  events = Array.isArray(events) ? events.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)) : [];

  const required = ['event', 'variantId', 'sessionId', 'timestamp'];
  const missing = events.filter((e) => required.some((k) => e[k] === undefined || e[k] === null)).length;
  const missingEventRate = events.length ? missing / events.length : 0;

  const variantIds = new Set((experiment.variants || []).map((v) => v.id));
  const now = events.length ? events[events.length - 1].timestamp : Date.now();
  const variants = {};

  for (const vid of variantIds) {
    const evs = events.filter((e) => e.variantId === vid);
    const sessions = new Set(evs.map((e) => e.sessionId).filter(Boolean));
    const completed = new Set(evs.filter((e) => e.event === 'solve_success' || e.event === 'lesson_complete').map((e) => e.sessionId).filter(Boolean));
    const exposed = evs.filter((e) => e.event === 'experiment_exposed' || e.event === 'variant_seen' || e.event === 'lesson_started').length;
    const behavior = {
      hint_request: evs.filter((e) => e.event === 'hint_request' || e.event === 'hint_shown').length,
      mistake: evs.filter((e) => e.event === 'mistake').length,
      attempt: evs.filter((e) => e.event === 'attempt').length,
      solve_step: evs.filter((e) => e.event === 'solve_step').length,
    };
    const completes = evs.filter((e) => (e.event === 'lesson_complete' || e.event === 'solve_success') && e.metrics);
    const times = completes.map((e) => e.metrics && e.metrics.time_ms).filter((n) => typeof n === 'number');
    const steps = completes.map((e) => e.metrics && e.metrics.steps).filter((n) => typeof n === 'number');
    const completionRate = sessions.size ? completed.size / sessions.size : 0;

    const lm = new LearnerModel();
    evs.forEach((e) => { const o = toObs(e); if (o) lm.observe(o); });
    const skills = new Set(evs.map((e) => e.subject && e.subject.skill).filter(Boolean));
    const masteries = Array.from(skills).map((s) => lm.mastery(s, now));

    const n = sessions.size;
    variants[vid] = {
      sessions: n,
      completed: completed.size,
      completion_rate: Number(completionRate.toFixed(3)),
      completion_rate_ci: wilson(completionRate, n).map((x) => Number(x.toFixed(3))),
      exposure_events: exposed,
      behavior,
      avg_time_ms: mean(times) !== null ? Number(mean(times).toFixed(1)) : null,
      avg_time_ms_ci: mean(times) !== null ? normalCI(mean(times), sd(times), times.length).map((x) => Number(x.toFixed(1))) : null,
      avg_steps: mean(steps) !== null ? Number(mean(steps).toFixed(2)) : null,
      avg_steps_ci: mean(steps) !== null ? normalCI(mean(steps), sd(steps), steps.length).map((x) => Number(x.toFixed(2))) : null,
      hint_per_session: n ? Number((behavior.hint_request / n).toFixed(2)) : 0,
      mastery: masteries.length ? Number((masteries.reduce((a, b) => a + b, 0) / masteries.length).toFixed(3)) : 0,
    };
  }

  const allSessions = new Set(events.map((e) => e.sessionId).filter(Boolean)).size;
  const balance = {};
  const vCount = variantIds.size || 1;
  for (const vid of variantIds) {
    const v = variants[vid];
    balance[vid] = {
      sessions: v.sessions,
      share: Number((v.sessions / (allSessions || 1)).toFixed(3)),
      expected_share: Number((1 / vCount).toFixed(3)),
    };
  }

  const deltas = {};
  const ids = Array.from(variantIds);
  if (ids.length >= 2) {
    const A = variants[ids[0]];
    const B = variants[ids[1]];
    const num = (k) => (A[k] != null && B[k] != null ? Number((B[k] - A[k]).toFixed(3)) : null);
    deltas.completion_rate_delta = num('completion_rate');
    deltas.avg_time_ms_delta = num('avg_time_ms');
    deltas.avg_steps_delta = num('avg_steps');
    deltas.hint_per_session_delta = num('hint_per_session');
    deltas.mastery_delta = num('mastery');
  }

  return {
    experimentId: experiment.experimentId,
    sample_size: { total_sessions: allSessions, per_variant: balance },
    missing_event_rate: Number(missingEventRate.toFixed(3)),
    variant_balance: balance,
    variants,
    deltas,
    significance_judged: false, // 不做自动判决
  };
}