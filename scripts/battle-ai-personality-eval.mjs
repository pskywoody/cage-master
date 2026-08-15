// ============================================================
// battle-ai-personality-eval.mjs — CM4 Battle AI Personality Statistical Evaluation
// 只读统计验证：6 人格是否产生稳定、可重复、可解释的行为差异。
// 不改人格参数 / StrategySelector / Director / TechRater / 规则 / 胜率 / mistake 模型。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { AIPlayerCore } from '../core/ai-player-core.js';
import { Director } from '../core/director.js';
import { HeadlessEngine } from '../core/headless-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'battle-ai-personality-evaluation');
fs.mkdirSync(OUT, { recursive: true });

const LEVEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'levels', 'level-109.json'), 'utf8'));
const SIZE = LEVEL.gridSize;
const SOLUTION = LEVEL.solution;

const PERSONALITIES = ['blind', 'expert', 'mentor', 'prober', 'average', 'reckless'];
const SCENARIOS = {
  balanced: { isLeading: false, selfHubCount: 1, opponentHubCount: 1, progress: 0.5, consecutiveErrors: 0, consecutiveCorrect: 0 },
  losing:   { isLeading: false, selfHubCount: 0, opponentHubCount: 2, progress: 0.4, consecutiveErrors: 1, consecutiveCorrect: 0 },
  leading:  { isLeading: true,  selfHubCount: 2, opponentHubCount: 0, progress: 0.6, consecutiveErrors: 0, consecutiveCorrect: 2 },
};
const RUNS = 50; // 6 x 3 x 50 = 900 decisions

function freshBoard() {
  const engine = new HeadlessEngine(SIZE);
  engine.loadLevel({ boardData: LEVEL.boardData, cages: LEVEL.cages, gridSize: LEVEL.gridSize });
  return engine.getBoard();
}

function classify(step) {
  if (!step) return 'none';
  if (step.isNote || step.type === 'note') return 'note';
  if (step.technique === 'guess') return 'guess';
  if (step.technique === 'misread') return 'misread';
  return 'solve';
}

const decisions = [];
for (const p of PERSONALITIES) {
  for (const sName of Object.keys(SCENARIOS)) {
    const state = SCENARIOS[sName];
    for (let run = 0; run < RUNS; run++) {
      try {
        const board = freshBoard();
        const ai = new AIPlayerCore(board, p, null, true, true);
        ai.setDirector(new Director({ personality: p }), false);
        ai.setGameState(state);
        const step = ai.think();
        const strategy = ai.getStrategy().strategy;
        const d = ai.getDirectorDecision();
        const intent = d ? (d.strategy || d.intent || null) : null;
        const correct = step && typeof step.num === 'number' ? (step.num === SOLUTION[step.row][step.col]) : null;
        decisions.push({
          personality: p,
          scenario: sName,
          run,
          strategy,
          intent,
          actionClass: classify(step),
          technique: (step && !step.isNote && step.technique) ? step.technique : null,
          correct,
        });
      } catch (e) {
        decisions.push({ personality: p, scenario: sName, run, error: String(e && e.message || e) });
      }
    }
  }
}

fs.writeFileSync(path.join(OUT, 'decisions.jsonl'), decisions.map((r) => JSON.stringify(r)).join('\n') + '\n');

// ---- 统计：personality × dimension 列联表 + χ² + Cramér's V ----
function chiSquareAndV(rows, dimKey, categories) {
  const n = rows.length;
  const rc = {}; // personality -> count
  const cc = {}; // category -> count
  const joint = {}; // p|cat -> count
  for (const r of rows) {
    const cat = categories.has(r[dimKey]) ? r[dimKey] : '__other__';
    rc[r.personality] = (rc[r.personality] || 0) + 1;
    cc[cat] = (cc[cat] || 0) + 1;
    const k = r.personality + '|' + cat;
    joint[k] = (joint[k] || 0) + 1;
  }
  const colKeys = Object.keys(cc);
  let chi = 0;
  for (const p of Object.keys(rc)) {
    for (const c of colKeys) {
      const o = joint[p + '|' + c] || 0;
      const e = rc[p] * cc[c] / n;
      if (e > 0) chi += (o - e) * (o - e) / e;
    }
  }
  const df = (Object.keys(rc).length - 1) * (colKeys.length - 1);
  const cramersV = df > 0 ? Math.sqrt(chi / (n * Math.min(Object.keys(rc).length - 1, colKeys.length - 1))) : 0;
  return { n, df, chi2: +chi.toFixed(3), cramersV: +cramersV.toFixed(4), colKeys };
}

const categoriesAll = new Set(['none', 'note', 'solve', 'guess', 'misread']);
const intentCats = new Set(['test_player_response', 'contest_hub', 'protect_owned_hubs', 'convert_advantage', 'bait_player']);
const strategyCats = new Set(['attack', 'defend', 'global', 'counter']);

const stats = {
  dim_actorClass: chiSquareAndV(decisions.filter((r) => !r.error), 'actionClass', categoriesAll),
  dim_strategy: chiSquareAndV(decisions.filter((r) => !r.error), 'strategy', strategyCats),
  dim_intent: chiSquareAndV(decisions.filter((r) => !r.error), 'intent', intentCats),
};

// intent / strategy / actionClass distribution per personality（池化）
const dist = {};
for (const dim of ['intent', 'strategy', 'actionClass']) {
  dist[dim] = {};
  for (const p of PERSONALITIES) {
    dist[dim][p] = {};
  }
  for (const r of decisions) {
    if (r.error) continue;
    const k = r[dim] || 'null';
    dist[dim][r.personality][k] = (dist[dim][r.personality][k] || 0) + 1;
  }
}

// technique 发现分布 per personality
const techDist = {};
for (const r of decisions) {
  if (r.error || !r.technique) continue;
  techDist[r.personality] = techDist[r.personality] || {};
  techDist[r.personality][r.technique] = (techDist[r.personality][r.technique] || 0) + 1;
}

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ stats, dist, techDist }, null, 2));

console.log('decisions:', decisions.length, '| errors:', decisions.filter((r) => r.error).length);
for (const [dim, s] of Object.entries(stats)) {
  console.log(`${dim}: chi2=${s.chi2} df=${s.df} cramersV=${s.cramersV}`);
}
console.log('intent distribution per personality:');
for (const p of PERSONALITIES) console.log(`  ${p}: ${JSON.stringify(dist.intent[p])}`);
console.log('strategy distribution per personality:');
for (const p of PERSONALITIES) console.log(`  ${p}: ${JSON.stringify(dist.strategy[p])}`);
console.log('actionClass distribution per personality:');
for (const p of PERSONALITIES) console.log(`  ${p}: ${JSON.stringify(dist.actionClass[p])}`);
console.log('technique discovery per personality:');
for (const p of PERSONALITIES) console.log(`  ${p}: ${JSON.stringify(techDist[p] || {})}`);