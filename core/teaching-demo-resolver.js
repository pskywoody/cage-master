// core/teaching-demo-resolver.js
// 生产态 TeachingDemoResolver：把已验证的 resolveTeachingDemo 包装成生产契约
// { levelId, technique, confidence, demoSteps, fallback, trace }。
// 只读；不改 solver、不改 Experiment Platform / LearnerModel / Teaching AI policy。

import { resolveTeachingDemo } from './lesson-demo-builder.js';

function cellList(target) {
  if (Array.isArray(target) && target.length === 2 && typeof target[0] === 'number') return [target];
  if (Array.isArray(target) && Array.isArray(target[0])) return target.map((c) => c);
  return [];
}

const STEP_ACTION = {
  highlightCell: 'highlight',
  highlightCells: 'highlight',
  showNote: 'note',
  showNotes: 'note',
  strikeNote: 'eliminate',
  concludeCell: 'conclude',
};

function toRenderableStep(step) {
  if (!step) return null;
  const cells = cellList(step.target);
  if (STEP_ACTION[step.action]) {
    return {
      action: STEP_ACTION[step.action],
      cells,
      ...(step.num !== undefined ? { number: step.num } : {}),
      ...(step.text ? { reason: step.text } : {}),
    };
  }
  // region 类动作
  switch (step.action) {
    case 'highlightRow': return { action: 'highlight', region: 'row', index: step.target, cells: [], ...(step.text ? { reason: step.text } : {}) };
    case 'highlightCol': return { action: 'highlight', region: 'col', index: step.target, cells: [], ...(step.text ? { reason: step.text } : {}) };
    case 'highlightBox': return { action: 'highlight', region: 'box', index: step.target, cells: [], ...(step.text ? { reason: step.text } : {}) };
    case 'highlightCage': return { action: 'highlight', region: 'cage', id: step.target, cells: [], ...(step.text ? { reason: step.text } : {}) };
    case 'showSumBadge': return { action: 'badge', cage: step.target, cells: [] };
    case 'spotlightOn': return { action: 'spotlight', enabled: true };
    case 'spotlightOff': return { action: 'spotlight', enabled: false };
    default: return { action: step.action, cells };
  }
}

function computeConfidence(r) {
  if (r.fallback) return 0.0;
  let c = 0.88;
  if (r.evidenceComplete) c += 0.05;
  if (r.deduction && Array.isArray(r.deduction.targetCells) && r.deduction.targetCells.length > 0) c += 0.02;
  if (r.targetCell && r.deduction && Array.isArray(r.deduction.targetCells)) {
    const hit = r.deduction.targetCells.some((tc) => tc && tc.row === r.targetCell[0] && tc.col === r.targetCell[1]);
    if (hit) c += 0.03;
  }
  return Number(Math.min(0.98, c).toFixed(2));
}

/**
 * 生产态解析：输出合同 + runtime trace。
 * @param {{levelId:number, engine:object, levelData:object}} input
 * @returns {object}
 */
export function resolveTeachingDemoProduction({ levelId, engine, levelData } = {}) {
  const t0 = Date.now();
  const trace = [{ step: 'resolve_start', ts: t0 }];

  const r = resolveTeachingDemo({ engine, levelData });
  trace.push({ step: 'technique_selected', technique: r.plannedTechnique || null, ts: Date.now() });

  const renderable = Array.isArray(r.actions) ? r.actions.map(toRenderableStep).filter(Boolean) : [];
  trace.push({ step: 'steps_generated', count: renderable.length, ts: Date.now() });
  trace.push({ step: 'validation', valid: !r.fallback, evidenceComplete: r.evidenceComplete, ts: Date.now() });

  const confidence = computeConfidence(r);
  const fallback = r.fallback ? 'manual' : 'auto';

  trace.push({ step: 'renderable', renderable: renderable.length > 0, ts: Date.now() });
  trace.push({ step: 'fallback', fallback, reason: r.fallbackReason || null, ts: Date.now() });

  return {
    levelId: levelId || null,
    technique: r.plannedTechnique || null,
    resolvedTechnique: r.resolvedTechnique || null,
    confidence,
    demoSteps: renderable,
    fallback,
    fallbackReason: r.fallbackReason || null,
    trace,
  };
}