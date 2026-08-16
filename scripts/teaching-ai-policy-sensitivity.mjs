// ============================================================
// teaching-ai-policy-sensitivity.mjs — Teaching AI Phase 4.5
// Policy Identifiability & Sensitivity Study（SHADOW 实验）。
//
// 严格：不改正式 core/teaching-learner-simulator.js；不改 Phase 4 数据；
// 不接生产/真实用户；所有变体均为 shadow，不据此重定义 Phase 4 结论。
// 目的：判断 A/B/C 差异来自 policy 本身，还是 simulator 奖励结构。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-policy-sensitivity');
fs.mkdirSync(OUT, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'teaching-ai-policy-catalog.json'), 'utf8')).policies;
const TECHNIQUE = 'hiddenPair';
const EPISODES = 10;
const HINT_ACTIONS = new Set(['hint_step', 'ease_hint', 'guided_question', 'surface_mistake', 'reveal']);

const LEVELS = ['struggling', 'novice', 'guided', 'independent', 'fluent'];

function actionType(action) {
  if (['demo', 'show_optimal', 'show_trajectory', 'reference'].includes(action)) return 'demo';
  if (action === 'reveal') return 'reveal';
  if (['challenge', 'pose_challenge', 'probe_weakness', 'edge_case'].includes(action)) return 'challenge';
  return 'guided';
}

function matchRule(rule, level, errorPattern) {
  const w = rule.when || {};
  if (w.level) {
    const ok = Array.isArray(w.level) ? w.level.includes(level) : w.level === level;
    if (!ok) return false;
  }
  if (w.errorPattern && w.errorPattern !== errorPattern) return false;
  return true;
}
function selectAction(rules, level, errorPattern) {
  for (const r of rules) if (matchRule(r, level, errorPattern)) return r.action;
  return 'hint_step';
}

// SHADOW 变体：只扰动 masteryDelta（正是压平 A/C 的因素），success/frustration 固定。
const SHARED_SUCCESS = { demo: 0.80, reveal: 0.95, guided: 0.70, challenge: 0.55 };
const SHARED_FRUSTRATION = { demo: -0.08, reveal: -0.03, guided: -0.10, challenge: 0.15 };

const VARIANTS = {
  B0_formal_like: { // 复刻正式 simulator 的 masteryDelta 轮廓
    demo: [1, 1, 0, 0, 0],
    guided: [1, 1, 1, 0, 0],
    reveal: [0, 0, 0, 0, 0],
    challenge: [0, 0, 1, 1, 0],
  },
  S1_demo_dominant: {
    demo: [1, 1, 0, 0, 0], guided: [0, 0, 0, 0, 0], reveal: [0, 0, 0, 0, 0], challenge: [0, 0, 1, 1, 0],
  },
  S2_guided_dominant: {
    demo: [0, 0, 0, 0, 0], guided: [1, 1, 1, 0, 0], reveal: [0, 0, 0, 0, 0], challenge: [0, 0, 1, 1, 0],
  },
  S3_recovery_bonus: {
    demo: [1, 1, 0, 0, 0], guided: [2, 1, 1, 0, 0], reveal: [0, 0, 0, 0, 0], challenge: [0, 0, 1, 1, 0],
  },
  S4_transfer_bonus: {
    demo: [1, 1, 0, 0, 0], guided: [1, 1, 1, 0, 0], reveal: [0, 0, 0, 0, 0], challenge: [0, 0, 0, 2, 0],
  },
};

function shadowStep(state, action, technique, variant) {
  const type = actionType(action);
  const idx = LEVELS.indexOf(state.mastery[technique] ?? 'novice');
  const delta = variant[type][Math.max(0, idx)] || 0;
  const success = SHARED_SUCCESS[type] + 0.04 * idx;
  const frustDelta = SHARED_FRUSTRATION[type];
  const engDelta = (type === 'challenge' ? (idx >= 2 ? 0.05 : -0.06) : (type === 'reveal' ? -0.01 : 0.04));
  const newIdx = Math.max(0, Math.min(LEVELS.length - 1, idx + delta));
  const nxt = { ...state, mastery: { ...state.mastery, [technique]: LEVELS[newIdx] } };
  nxt.frustration = Math.max(0, Math.min(1, (state.frustration ?? 0.3) + frustDelta));
  nxt.engagement = Math.max(0, Math.min(1, (state.engagement ?? 0.6) + engDelta));
  return { nextMasteryLevel: LEVELS[newIdx], successProbability: success, nextLearnerState: nxt };
}

// 30 个 learner（与 Phase 4 一致）
function buildPopulation() {
  const pop = [];
  for (let i = 0; i < 30; i++) {
    const level = i < 8 ? 'struggling' : i < 18 ? 'novice' : i < 26 ? 'guided' : 'independent';
    const errorPattern = ['omission', 'misread', 'guess', 'weak'][i % 4];
    pop.push({ id: 'L' + String(i + 1).padStart(3, '0'), level, errorPattern, frustration: 0.2 + (i % 5) * 0.15, engagement: 0.5 + (i % 4) * 0.1 });
  }
  return pop;
}
const POP = buildPopulation();

const results = [];
for (const vName of Object.keys(VARIANTS)) {
  const v = VARIANTS[vName];
  for (const policy of Object.keys(catalog)) {
    const gains = [];
    for (const L of POP) {
      let state = { mastery: { [TECHNIQUE]: L.level }, frustration: L.frustration, engagement: L.engagement };
      const beforeIdx = LEVELS.indexOf(L.level);
      for (let ep = 0; ep < EPISODES; ep++) {
        const lvl = state.mastery[TECHNIQUE];
        const action = selectAction(catalog[policy].rules, lvl, L.errorPattern);
        const r = shadowStep(state, action, TECHNIQUE, v);
        state = r.nextLearnerState;
      }
      gains.push(LEVELS.indexOf(state.mastery[TECHNIQUE]) - beforeIdx);
    }
    results.push({ variant: vName, policy, mean_skill_gain: +(gains.reduce((a, b) => a + b, 0) / gains.length).toFixed(3) });
  }
}

fs.writeFileSync(path.join(OUT, 'sensitivity-results.json'), JSON.stringify(results, null, 2));

function gap(variant, p1, p2) {
  const a = results.find((r) => r.variant === variant && r.policy === p1)?.mean_skill_gain ?? 0;
  const b = results.find((r) => r.variant === variant && r.policy === p2)?.mean_skill_gain ?? 0;
  return +(a - b).toFixed(3);
}

console.log('variant | A | B | C | C-A gap');
for (const vName of Object.keys(VARIANTS)) {
  const A = results.find((r) => r.variant === vName && r.policy === 'A_static_lesson')?.mean_skill_gain;
  const B = results.find((r) => r.variant === vName && r.policy === 'B_hint_aligned')?.mean_skill_gain;
  const C = results.find((r) => r.variant === vName && r.policy === 'C_learner_adaptive')?.mean_skill_gain;
  const ca = gap(vName, 'C_learner_adaptive', 'A_static_lesson');
  console.log(`${vName} | ${A} | ${B} | ${C} | ${ca}`);
}
console.log('written:', path.join(OUT, 'sensitivity-results.json'));