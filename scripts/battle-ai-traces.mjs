// ============================================================
// battle-ai-traces.mjs — CM4 Battle AI Research Sprint
// 决策 trace / 状态化验证：在不改生产逻辑的前提下，用公开内省面
// （getStrategy / getDirectorDecision / getGameState / think 的返回）
// 采样「给定状态 → AI 策略与决策」。
// 纯研究脚本，不改 TechRater / Solver / 关卡 / 人格参数。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { AIPlayerCore } from '../core/ai-player-core.js';
import { Director } from '../core/director.js';
import { HeadlessEngine } from '../core/headless-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const LEVEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'levels', 'level-109.json'), 'utf8'));
const SIZE = LEVEL.gridSize;

const PERSONALITIES = ['blind', 'expert', 'mentor', 'prober', 'average', 'reckless'];

const STATES = [
  { name: 'leading',   isLeading: true,  selfHubCount: 2, opponentHubCount: 0, progress: 0.6, consecutiveErrors: 0, consecutiveCorrect: 2 },
  { name: 'losing',    isLeading: false, selfHubCount: 0, opponentHubCount: 2, progress: 0.4, consecutiveErrors: 1, consecutiveCorrect: 0 },
  { name: 'neutral',   isLeading: false, selfHubCount: 1, opponentHubCount: 1, progress: 0.5, consecutiveErrors: 0, consecutiveCorrect: 0 },
  { name: 'hot-streak',isLeading: true,  selfHubCount: 2, opponentHubCount: 0, progress: 0.7, consecutiveErrors: 0, consecutiveCorrect: 4 },
  { name: 'cold-streak',isLeading:false, selfHubCount: 1, opponentHubCount: 1, progress: 0.3, consecutiveErrors: 4, consecutiveCorrect: 0 },
];

function freshBoard() {
  const engine = new HeadlessEngine(SIZE);
  engine.loadLevel({ boardData: LEVEL.boardData, cages: LEVEL.cages, gridSize: LEVEL.gridSize });
  return engine.getBoard();
}

function probe(personality, stateName, state) {
  try {
    const board = freshBoard();
    const ai = new AIPlayerCore(board, personality, null, true, true);
    const director = new Director({ personality });
    ai.setDirector(director, false); // 激活调制模式（对齐生产 directorShadow:false）
    ai.setGameState(state);
    const step = ai.think();
    const strategy = ai.getStrategy();
    const directorDecision = ai.getDirectorDecision();
    return {
      personality,
      state: stateName,
      strategy: strategy ? strategy.strategy : null,
      targetHub: strategy ? strategy.targetHub : null,
      directorStrategy: directorDecision ? (directorDecision.strategy || directorDecision.intent || null) : null,
      stepType: step ? (step.isNote || step.type === 'note' ? 'note' : 'fill') : 'none',
      technique: step && !step.isNote ? (step.technique || null) : null,
      note: step && step.isNote ? true : false,
      moveCount: ai.getMoveCount(),
      gameState: ai.getGameState(),
    };
  } catch (e) {
    return { personality, state: stateName, error: String(e && e.message || e) };
  }
}

const rows = [];
for (const p of PERSONALITIES) {
  for (const s of STATES) {
    rows.push(probe(p, s.name, s));
  }
}

const outDir = path.join(ROOT, 'data', 'battle-ai-traces');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'decisions.jsonl');
fs.writeFileSync(outPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

// 内置聚合：strategy 分布 × 状态 × 人格
const agg = {};
for (const r of rows) {
  if (r.error) continue;
  const key = `${r.personality}|${r.state}`;
  agg[key] = agg[key] || { strategy: {}, director: {}, note: 0, fill: 0, techniques: {} };
  agg[key].strategy[r.strategy] = (agg[key].strategy[r.strategy] || 0) + 1;
  if (r.directorStrategy) agg[key].director[r.directorStrategy] = (agg[key].director[r.directorStrategy] || 0) + 1;
  if (r.stepType === 'note') agg[key].note++; else if (r.stepType === 'fill') agg[key].fill++;
  if (r.technique) agg[key].techniques[r.technique] = (agg[key].techniques[r.technique] || 0) + 1;
}

const summary = { rows, agg };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('traces written:', outPath, '| probes:', rows.length, '| errors:', rows.filter((r) => r.error).length);
console.log('strategy by (personality|state):');
for (const [k, v] of Object.entries(agg)) {
  console.log(`  ${k} -> strategy=${JSON.stringify(v.strategy)} director=${JSON.stringify(v.director)} note=${v.note} fill=${v.fill} tech=${JSON.stringify(v.techniques)}`);
}