// ============================================================
// teaching-action-observability-gap.mjs — Teaching AI Phase 13
// Action Observability Gap Analysis（shadow/research only）。
// 交叉「当前动作空间证据」与「证据字段注册表」，确定性生成缺口地图。
// 不改生产教学、不改实验协议、不扩展 Goal Engine。
//
// 产出（data/teaching-action-observability/）：gap-map.json
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-action-observability');
fs.mkdirSync(OUT, { recursive: true });

const COV = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'teaching-action-space', 'action-coverage.json'), 'utf8'));
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'schemas', 'teaching-evidence-registry.v1.json'), 'utf8'));

const covMap = {};
for (const a of COV.per_action) covMap[a.action] = a;

const rows = [];
for (const g of REG.gaps) {
  for (const action of g.actions) {
    const c = covMap[action];
    const runtimeEvidence = (c?.observed_system_evidence || 0) > 0;
    rows.push({
      action,
      evidence_group: g.group,
      schema: true,
      generator: c?.shadow_can_generate ?? false,
      runtime_evidence: runtimeEvidence,
      missing_evidence_fields: runtimeEvidence ? [] : g.required_evidence_fields.map((f) => f.field),
    });
  }
}
// 补上已可观测动作（无缺口字段）
for (const a of COV.per_action) {
  if (!rows.find((r) => r.action === a.action)) {
    rows.push({
      action: a.action,
      evidence_group: null,
      schema: true,
      generator: a.shadow_can_generate,
      runtime_evidence: a.observed_system_evidence > 0,
      missing_evidence_fields: [],
    });
  }
}

const ORDER = ['hint', 'demo', 'guided', 'question', 'partial_hint', 'difficulty_down', 'difficulty_up'];
rows.sort((a, b) => ORDER.indexOf(a.action) - ORDER.indexOf(b.action));

const out = {
  generated_by: 'scripts/teaching-action-observability-gap.mjs',
  schema_source: 'docs/schemas/teaching-evidence-registry.v1.json',
  evidence_source: 'data/teaching-action-space/action-coverage.json',
  rows,
  summary: {
    total_canonical_actions: ORDER.length,
    with_runtime_evidence: rows.filter((r) => r.runtime_evidence).length,
    missing_runtime_evidence: rows.filter((r) => !r.runtime_evidence).map((r) => r.action),
    registry_fields: REG.gaps.map((g) => ({ group: g.group, required: g.required_evidence_fields.map((f) => f.field) })),
  },
};
fs.writeFileSync(path.join(OUT, 'gap-map.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.summary, null, 2));