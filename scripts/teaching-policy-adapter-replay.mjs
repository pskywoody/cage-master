// ============================================================
// scripts/teaching-policy-adapter-replay.mjs — P1 验证回放
// CM4 PRODUCT VALIDATION PHASE · 第一步（P1）
//
// 读 learner 事件流 → 经 core/teaching-policy-adapter.js#propose
//   → 输出 TeachingDecisionProposal.jsonl + summary.json
//   → 判定 TEACHING_POLICY_ADAPTER_READY
//
// 用法：
//   node scripts/teaching-policy-adapter-replay.mjs [outDir] [eventsFile]
//   - outDir   : 输出目录（默认 data/teaching-policy-adapter）
//   - eventsFile: 可选，真实 learner 事件文件（JSON 数组 [{sessionId,events}]）。
//                 缺省则跑 5 类合成场景（覆盖 BOUNDARY_STATES 全部 5 态）。
//
// 影子纪律：不接生产、不执行教学、不改任何生产文件。
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { propose, POLICY_VERSION, BOUNDARY_STATES } from '../core/teaching-policy-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, process.argv[2] || 'data/teaching-policy-adapter');
fs.mkdirSync(OUT, { recursive: true });

// UA-v2 期望动作（与 adapter contract §4 一致）
const EXPECTED = {
  novice_exploration: 'observe',
  temporary_error: 'question',
  persistent_struggle: 'partial_hint',
  guided: 'backoff',
  independent: 'backoff',
};

// ---- 合成场景事件生成（覆盖全部 5 个 BOUNDARY_STATE）----
// 设计约束见 core/teaching-policy-adapter.js + contract §2（coarseForRefiner 翻写逻辑）。
function ev(technique, type, extra = {}) {
  return { technique, type, ts: Date.now(), ...extra };
}
const T = 'lone_star';

function genSyntheticSessions() {
  const scenarios = [
    {
      truth: 'novice_exploration',
      sessionId: 'p1-session-novice_exploration',
      events: [
        ev(T, 'encounter'),
        ev(T, 'error'),
        ev(T, 'correct', { independent: false }),
        ev(T, 'correct', { independent: false }),
      ],
    },
    {
      truth: 'temporary_error',
      sessionId: 'p1-session-temporary_error',
      events: [
        ev(T, 'encounter'),
        ev(T, 'correct', { independent: false }), // 先成功 → previousSkillMastery=true
        ev(T, 'error'),
        ev(T, 'correct', { independent: false }), // 自纠 → recoveryAttempts=1
      ],
    },
    {
      truth: 'persistent_struggle',
      sessionId: 'p1-session-persistent_struggle',
      events: [
        ev(T, 'encounter'),
        ev(T, 'correct', { independent: false }), // prev=true
        ev(T, 'error'), // f=1
        ev(T, 'hint'), // h=1
        ev(T, 'error'), // f=2, 无 recovery → recoveryAttempts=0（触发 guided→struggling 翻写）
      ],
    },
    {
      truth: 'guided',
      sessionId: 'p1-session-guided',
      events: [
        ev(T, 'encounter'),
        ev(T, 'correct', { independent: false }),
        ev(T, 'hint'),
        ev(T, 'hint'),
        ev(T, 'hint'),
        ev(T, 'correct', { independent: false }), // 全程低失败、靠 hint 推进 → 真 guided（透传）
      ],
    },
    {
      truth: 'independent',
      sessionId: 'p1-session-independent',
      events: [
        ev(T, 'encounter'),
        ev(T, 'correct', { independent: true }),
        ev(T, 'correct', { independent: true }),
        ev(T, 'correct', { independent: true }),
        ev(T, 'correct', { independent: true }),
        ev(T, 'correct', { independent: true }), // 独立做对 5 次 → MASTERED → independent（透传）
      ],
    },
  ];
  return scenarios;
}

// ---- 加载 sessions（真实或合成）----
let sessions;
const eventsFile = process.argv[3];
if (eventsFile && fs.existsSync(path.join(ROOT, eventsFile))) {
  sessions = JSON.parse(fs.readFileSync(path.join(ROOT, eventsFile), 'utf8'));
  console.log(`[replay] 使用真实事件文件: ${eventsFile} (${sessions.length} sessions)`);
} else {
  sessions = genSyntheticSessions();
  console.log(`[replay] 合成场景: ${sessions.length} sessions（覆盖 BOUNDARY_STATES 全 5 态）`);
}

// ---- 回放 ----
const proposals = [];
const checks = [];
for (const s of sessions) {
  const proposal = propose({ sessionId: s.sessionId, events: s.events, technique: s.technique });
  proposals.push(proposal);

  const truth = s.truth || proposal.learnerState;
  const stateMatch = proposal.learnerState === truth;
  const actionMatch = proposal.suggestedAction === EXPECTED[truth];
  const shadowOk = proposal.shadowOnly === true;
  checks.push({
    sessionId: s.sessionId,
    truth,
    learnerState: proposal.learnerState,
    confidence: proposal.confidence,
    suggestedAction: proposal.suggestedAction,
    expectedAction: EXPECTED[truth],
    stateMatch,
    actionMatch,
    shadowOnly: shadowOk,
    pass: stateMatch && actionMatch && shadowOk,
  });
}

// ---- 写 TeachingDecisionProposal.jsonl ----
const jsonlPath = path.join(OUT, 'proposals.jsonl');
fs.writeFileSync(jsonlPath, proposals.map((p) => JSON.stringify(p)).join('\n') + '\n');

// ---- 验收 ----
const allBoundaryCovered = BOUNDARY_STATES.every((st) => checks.some((c) => c.truth === st));
const allPass = checks.every((c) => c.pass);
const TEACHING_POLICY_ADAPTER_READY = allBoundaryCovered && allPass;

const summary = {
  policyVersion: POLICY_VERSION,
  generatedAt: new Date().toISOString(),
  sessionCount: sessions.length,
  boundaryStatesCovered: [...new Set(checks.map((c) => c.truth))],
  checks,
  acceptance: {
    TEACHING_POLICY_ADAPTER_READY,
    allBoundaryStatesCovered: allBoundaryCovered,
    allProposalsAligned: allPass,
    note: 'TEACHING_POLICY_ADAPTER_READY !== TEACHING_AI_ENABLED（影子提案就绪，未接入生产执行）',
  },
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

// ---- 输出 ----
console.log('===== P1 Teaching Policy Adapter Replay =====');
for (const c of checks) {
  console.log(
    `  [${c.pass ? 'OK ' : '-- '}] ${c.truth.padEnd(20)} ` +
    `state=${c.learnerState}(${c.confidence}) action=${c.suggestedAction} ` +
    `(expect ${c.expectedAction}) shadow=${c.shadowOnly}`
  );
}
console.log('---------------------------------------------');
console.log(`  boundaryStatesCovered: ${summary.boundaryStatesCovered.join(', ')}`);
console.log(`  TEACHING_POLICY_ADAPTER_READY = ${TEACHING_POLICY_ADAPTER_READY}`);
console.log(`  output: ${jsonlPath}`);
console.log(`  summary: ${path.join(OUT, 'summary.json')}`);

process.exit(TEACHING_POLICY_ADAPTER_READY ? 0 : 1);
