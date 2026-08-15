// scripts/generate-golden-demo-manifest.js
// 生成 golden_demo_manifest.json：48 关 AUTO_ENABLED / MANUAL_REVIEW 分类与 AUTO_SAFE 覆盖明细。
// 只读，不修改生产数据。运行：node scripts/generate-golden-demo-manifest.js

import fs from 'fs';
import '../core/tech-rater.js';
import { HeadlessEngine } from '../core/headless-engine.js';
import { resolveTeachingDemo } from '../core/lesson-demo-builder.js';

const base = 'data/levels/';
const manifest = {
  generated_at: new Date().toISOString(),
  status: 'PARTIAL',
  auto_enabled: [],
  manual_review: [],
  summary: { auto_enabled: 0, manual_review: 0 },
};

for (let c = 1; c <= 7; c++) {
  for (let i = 1; i <= 9; i++) {
    const id = c * 100 + i;
    const p = `${base}level-${id}.json`;
    if (!fs.existsSync(p)) continue;
    const levelData = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!(levelData.teachingGoal && levelData.teachingGoal.trim()) || !levelData.lessonPlan) continue;

    const engine = new HeadlessEngine(levelData.gridSize || 9);
    engine.loadLevel(levelData);
    const r = resolveTeachingDemo({ engine, levelData });

    const ev = (r.deduction && r.deduction.evidence) || {};
    const eliminated = Array.isArray(ev.eliminatedPositions) ? ev.eliminatedPositions.length : 0;

    const entry = {
      level_id: id,
      planned_technique: r.plannedTechnique || 'composite',
      resolved_technique: r.resolvedTechnique || null,
      demo_steps: r.actions ? r.actions.map((s) => s.action) : [],
      demo_step_count: r.actions ? r.actions.length : 0,
      deduction_source: r.resolvedTechnique
        ? { technique: r.resolvedTechnique, evidence_fields: Object.keys(ev).slice(0, 8) }
        : null,
      evidence_cells: eliminated,
      fallback_count: r.fallback ? 1 : 0,
      fallback_reason: r.fallbackReason || null,
      explanation_completeness: r.evidenceComplete ? 'complete' : 'incomplete',
    };

    if (!r.fallback && r.evidenceComplete && r.actions && r.actions.length > 0) {
      manifest.auto_enabled.push(entry);
    } else {
      manifest.manual_review.push(entry);
    }
  }
}

manifest.summary.auto_enabled = manifest.auto_enabled.length;
manifest.summary.manual_review = manifest.manual_review.length;
manifest.status = manifest.summary.manual_review === 13 ? 'PARTIAL' : 'READY';

// 机器生成的金标准清单：canonical 落在 data/（纳入版本控制、不可手改），reports/ 仅作临时副本。
const canonical = 'data/golden-demo-manifest.json';
const transient = 'reports/golden-demo-manifest.json';
const payload = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(canonical, payload);
fs.writeFileSync(transient, payload);
console.log('写入', canonical);
console.log('AUTO_ENABLED:', manifest.summary.auto_enabled);
console.log('MANUAL_REVIEW:', manifest.summary.manual_review);
console.log('manual_review ids:', manifest.manual_review.map((e) => e.level_id).join(','));