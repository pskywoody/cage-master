// ============================================================
// battle-ai-closed-loop-trace.mjs — CM4 Battle AI Phase 2
// 验证闭环：state → decision → action → result → next state
// 只读实验：不改生产逻辑，只记录行为状态，不记录内部 reasoning。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { AIPlayerCore } from '../core/ai-player-core.js';
import { Director } from '../core/director.js';
import { HeadlessEngine } from '../core/headless-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'battle-ai-closed-loop-traces');
fs.mkdirSync(OUT, { recursive: true });

const LEVEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'levels', 'level-109.json'), 'utf8'));
const SIZE = LEVEL.gridSize;
const SOLUTION = LEVEL.solution;
const TOTAL_EMPTY = (() => {
  let n = 0;
  for (const row of LEVEL.boardData) for (const v of row) if (v === 0) n++;
  return n;
})();

function freshBoard() {
  const engine = new HeadlessEngine(SIZE);
  engine.loadLevel({ boardData: LEVEL.boardData, cages: LEVEL.cages, gridSize: LEVEL.gridSize });
  return { engine, board: engine.getBoard() };
}

function makeAI(board, personality) {
  const ai = new AIPlayerCore(board, personality, null, true, true);
  ai.setDirector(new Director({ personality }), false);
  return ai;
}

// ---- 行为状态快照（只记录行为，不记录 reasoning） ----
function snapshot(state, strategy) {
  return {
    score: { ai: state.aiScore, opp: state.oppScore },
    strategy: strategy,
    momentum: {
      isLeading: !!state.isLeading,
      consecutiveCorrect: state.consecutiveCorrect,
      consecutiveErrors: state.consecutiveErrors,
      progress: Math.round(state.progress * 100) / 100,
    },
  };
}

// ============================================================
// Phase 2 — Same State, Different History
// ============================================================
const CONTROL = { isLeading: false, selfHubCount: 1, opponentHubCount: 1, progress: 0.5 };
const historyResults = [];
for (const p of ['blind', 'expert', 'mentor', 'prober', 'average', 'reckless']) {
  const ba = freshBoard();
  const A = makeAI(ba.board, p);
  A.setGameState({ ...CONTROL, consecutiveCorrect: 2, consecutiveErrors: 0 });
  const da = A.think();
  const sigA = `${A.getStrategy().strategy}|${A.getDirectorDecision()?.strategy || A.getDirectorDecision()?.intent || ''}|${da?.isNote ? 'note' : (da?.technique || 'fill')}`;

  const bb = freshBoard();
  const B = makeAI(bb.board, p);
  B.setGameState({ ...CONTROL, consecutiveCorrect: 0, consecutiveErrors: 2 });
  const db = B.think();
  const sigB = `${B.getStrategy().strategy}|${B.getDirectorDecision()?.strategy || B.getDirectorDecision()?.intent || ''}|${db?.isNote ? 'note' : (db?.technique || 'fill')}`;

  historyResults.push({ personality: p, historySuccess: sigA, historyFailure: sigB, differs: sigA !== sigB });
}
fs.writeFileSync(path.join(OUT, 'phase2-same-state-diff-history.json'), JSON.stringify(historyResults, null, 2));

// ============================================================
// Phase 3 — Multi-turn simulation
// ============================================================
function runScenario(name, personality, turns, oppPolicy) {
  const { engine, board } = freshBoard();
  const ai = makeAI(board, personality);
  const state = {
    progress: 0, consecutiveCorrect: 0, consecutiveErrors: 0,
    isLeading: false, selfHubCount: 1, opponentHubCount: 1,
    aiScore: 0, oppScore: 0, correctFills: 0,
  };
  const trace = [];
  for (let t = 0; t < turns; t++) {
    ai.setGameState({ ...state, selfHubCount: state.selfHubCount, opponentHubCount: state.opponentHubCount });
    const beforeState = snapshot(state, ai.getStrategy().strategy);
    const step = ai.think();

    const decision = {
      strategy: ai.getStrategy().strategy,
      intent: ai.getDirectorDecision()?.strategy || ai.getDirectorDecision()?.intent || null,
      technique: step && !step.isNote ? (step.technique || null) : null,
      note: !!(step && (step.isNote || step.type === 'note')),
    };

    let action = { type: 'none', success: null };
    let result = { scoreDelta: {}, mistake: false };
    if (step && decision.note) {
      action = { type: 'note', success: null };
      result = { scoreDelta: { ai: 0, opp: 0 }, mistake: false };
    } else if (step && typeof step.num === 'number') {
      const correct = step.num === SOLUTION[step.row][step.col];
      engine.fillCell(step.row, step.col, step.num); // 推进 board（行为层）
      action = { type: 'fill', success: correct };
      if (correct) {
        state.consecutiveCorrect++; state.consecutiveErrors = 0; state.aiScore++; state.correctFills++;
      } else {
        state.consecutiveErrors++; state.consecutiveCorrect = 0;
      }
      result = { scoreDelta: { ai: correct ? 1 : 0, opp: 0 }, mistake: !correct };
    }
    // opponent progression (deterministic policy)
    state.oppScore += oppPolicy(t, state);
    state.progress = state.correctFills / TOTAL_EMPTY;
    state.isLeading = state.aiScore >= state.oppScore;

    const afterState = snapshot(state, ai.getStrategy().strategy);
    trace.push({ turn: t + 1, beforeState, decision, action, result, afterState });
  }
  return trace;
}

const scenarios = {
  consecutiveSuccess: runScenario('consecutiveSuccess', 'expert', 5, (t) => (t === 2 ? 1 : 0)),
  consecutiveFailure: runScenario('consecutiveFailure', 'blind', 5, (t) => 0),
  leadingThenLosing: runScenario('leadingThenLosing', 'average', 6, (t) => (t >= 3 ? 2 : 0)),
};

for (const [name, trace] of Object.entries(scenarios)) {
  fs.writeFileSync(path.join(OUT, `multi-turn-${name}.jsonl`), trace.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

console.log('Phase2 same-state-diff-history:', JSON.stringify(historyResults.map((r) => `${r.personality}:${r.differs ? 'DIFF' : 'SAME'}`), null, 0));
console.log('scenarios written');
console.log('multi-turn consecutiveSuccess:');
for (const r of scenarios.consecutiveSuccess) console.log(`  t${r.turn} ${r.beforeState.strategy} -> ${r.decision.strategy}/${r.decision.intent}/${r.decision.technique} action=${r.action.type}:${r.action.success} | after=${r.afterState.strategy}`);
console.log('multi-turn consecutiveFailure:');
for (const r of scenarios.consecutiveFailure) console.log(`  t${r.turn} ${r.beforeState.strategy} -> ${r.decision.strategy}/${r.decision.intent}/${r.decision.technique}${r.decision.note ? '(note)' : ''} action=${r.action.type}:${r.action.success} | after=${r.afterState.strategy}`);
console.log('multi-turn leadingThenLosing:');
for (const r of scenarios.leadingThenLosing) console.log(`  t${r.turn} lead=${r.beforeState.momentum.isLeading} ${r.beforeState.strategy} -> ${r.decision.strategy}/${r.decision.intent} action=${r.action.type}:${r.action.success} | after=${r.afterState.strategy}`);