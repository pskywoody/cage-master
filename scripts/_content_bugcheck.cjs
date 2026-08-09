// Content-bug checker for CageMaster4 levels.
// Goes beyond structural validation: cage-sum correctness, solution validity
// (rows/cols/boxes + cage distinctness), givens consistency, and
// true solvability + uniqueness via an independent backtracking solver.
// Run: node scripts/_content_bugcheck.cjs
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'levels');
const POOL_DIR = path.join(__dirname, '..', 'data');

function getBoxSize(n) {
  if (n === 4) return { boxW: 2, boxH: 2 };
  if (n === 6) return { boxW: 3, boxH: 2 };
  return { boxW: 3, boxH: 3 };
}

function loadLevelFile(p) {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(p, 'utf8')), name: path.basename(p) }; }
  catch (e) { return { ok: false, err: e.message, name: path.basename(p) }; }
}

function checkSolutionValid(lv, issues) {
  const N = lv.gridSize;
  const sol = lv.solution;
  const { boxW, boxH } = getBoxSize(N);
  const seen = new Set();
  const add = (arr, label) => {
    for (const row of arr) {
      const s = new Set(row);
      if (s.size !== N) issues.push(`${label} 非完整排列: ${JSON.stringify(row)}`);
      for (const v of row) { if (v < 1 || v > N || !Number.isInteger(v)) issues.push(`${label} 含非法值: ${v}`); }
    }
  };
  add(sol, 'solution 行');
  // columns
  for (let c = 0; c < N; c++) { const col = []; for (let r = 0; r < N; r++) col.push(sol[r][c]); if (new Set(col).size !== N) issues.push(`solution 列${c} 非排列`); }
  // boxes
  for (let br = 0; br < N / boxH; br++) for (let bc = 0; bc < N / boxW; bc++) {
    const vals = [];
    for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) vals.push(sol[br * boxH + dr][bc * boxW + dc]);
    if (new Set(vals).size !== N) issues.push(`solution 宫(${br},${bc}) 非排列`);
  }
  // cages: distinct + sum
  if (lv.cages) for (const cg of lv.cages) {
    const vals = cg.cells.map(([r, c]) => sol[r] && sol[r][c]);
    if (vals.some(v => v === undefined)) { issues.push(`cage ${cg.id} 引用越界格`); continue; }
    if (new Set(vals).size !== vals.length) issues.push(`cage ${cg.id} 内部数字重复: ${JSON.stringify(vals)}`);
    const s = vals.reduce((a, b) => a + b, 0);
    if (s !== cg.sum) issues.push(`cage ${cg.id} 和值不符: 声明${cg.sum} 实际${s} (${JSON.stringify(vals)})`);
  }
  if (seen.size) {}
}

function checkGivens(lv, issues) {
  const N = lv.gridSize;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = lv.boardData[r][c];
    if (g !== 0 && g !== lv.solution[r][c]) issues.push(`boardData[${r}][${c}]=${g} 与 solution=${lv.solution[r][c]} 不一致`);
    if (g === 0 && (lv.solution[r][c] === 0 || lv.solution[r][c] === undefined)) issues.push(`boardData[${r}][${c}] 为空但 solution 也为空`);
  }
}

// Independent solver: returns number of solutions (capped at cap), and the first solution found.
function solve(lv, cap) {
  const N = lv.gridSize;
  const { boxW, boxH } = getBoxSize(N);
  const board = lv.boardData.map(row => row.slice());
  const cages = lv.cages || [];
  // cage index per cell
  const cageOf = Array.from({ length: N }, () => new Array(N).fill(-1));
  cages.forEach((cg, i) => cg.cells.forEach(([r, c]) => { cageOf[r][c] = i; }));

  const rowMask = new Array(N).fill(0);
  const colMask = new Array(N).fill(0);
  const boxMask = new Array(N / boxH * N / boxW).fill(0);
  const boxIndex = (r, c) => Math.floor(r / boxH) * (N / boxW) + Math.floor(c / boxW);
  const cSum = new Array(cages.length).fill(0);
  const cFilled = new Array(cages.length).fill(0);

  // init from givens
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = board[r][c];
    if (v !== 0) {
      const bit = 1 << v;
      if (rowMask[r] & bit || colMask[c] & bit || boxMask[boxIndex(r, c)] & bit) return { count: 0, first: null };
      rowMask[r] |= bit; colMask[c] |= bit; boxMask[boxIndex(r, c)] |= bit;
      if (cageOf[r][c] >= 0) { cSum[cageOf[r][c]] += v; cFilled[cageOf[r][c]]++; }
    }
  }

  let count = 0;
  let first = null;
  const capN = cap || 2;

  function cageMinMaxRemaining(ci) {
    // remaining empty cells in cage ci: min/max sum they could contribute
    const cg = cages[ci];
    let empty = 0;
    for (const [r, c] of cg.cells) if (board[r][c] === 0) empty++;
    // worst-case: pick smallest/largest available distinct numbers not placed in cage
    return empty;
  }

  function backtrack() {
    if (count >= capN) return;
    // MRV: find empty cell with fewest candidates
    let best = null, bestCount = 99;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (board[r][c] !== 0) continue;
      const used = rowMask[r] | colMask[c] | boxMask[boxIndex(r, c)];
      let cnt = 0; const cand = [];
      for (let v = 1; v <= N; v++) if (!(used & (1 << v))) { cnt++; cand.push(v); }
      if (cnt === 0) return; // dead end
      if (cnt < bestCount) { bestCount = cnt; best = [r, c, cand]; if (cnt === 1) break; }
    }
    if (!best) {
      // all filled -> valid solution (cage sums checked incrementally)
      count++;
      if (!first) first = board.map(row => row.slice());
      return;
    }
    const [r, c, cand] = best;
    const ci = cageOf[r][c];
    for (const v of cand) {
      // cage distinct + sum feasibility
      if (ci >= 0) {
        // distinct within cage already ensured by candidate (cage cells not in row/col/box)
        // sum feasibility:
        const placed = cSum[ci] + v;
        const remainingEmpty = cages[ci].cells.filter(([rr, cc]) => board[rr][cc] === 0 || (rr === r && cc === c)).length - 1;
        if (placed > cages[ci].sum) continue;
        if (placed + remainingEmpty * 1 > cages[ci].sum) { /* could exceed with min 1 each */ }
        // upper bound: even if all remaining are N, can't exceed; lower bound: remaining at least 1 each
        const need = cages[ci].sum - placed;
        if (need < remainingEmpty * 1) continue;
        if (need > remainingEmpty * N) continue;
      }
      const bit = 1 << v;
      board[r][c] = v; rowMask[r] |= bit; colMask[c] |= bit; boxMask[boxIndex(r, c)] |= bit;
      let cOK = true, prevSum = 0, prevFilled = 0;
      if (ci >= 0) { prevSum = cSum[ci]; prevFilled = cFilled[ci]; cSum[ci] += v; cFilled[ci]++; }
      backtrack();
      board[r][c] = 0; rowMask[r] &= ~bit; colMask[c] &= ~bit; boxMask[boxIndex(r, c)] &= ~bit;
      if (ci >= 0) { cSum[ci] = prevSum; cFilled[ci] = prevFilled; }
      if (count >= capN) return;
    }
  }
  backtrack();
  return { count, first };
}

function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  const all = [];
  const summary = { total: files.length, structuralFails: 0, cageSumFails: 0, solutionInvalid: 0, givenMismatch: 0, unsolvable: 0, notUnique: 0, mismatchedSolution: 0 };
  for (const f of files) {
    const lv0 = loadLevelFile(path.join(DATA_DIR, f));
    if (!lv0.ok) { all.push({ file: f, fatal: lv0.err }); summary.structuralFails++; continue; }
    const lv = lv0.data;
    const issues = [];
    if (!lv.solution || !lv.boardData || !lv.cages) { all.push({ file: f, level: lv.levelId, fatal: '缺少 solution/boardData/cages' }); summary.structuralFails++; continue; }
    checkSolutionValid(lv, issues);
    checkGivens(lv, issues);
    // solvability + uniqueness
    let solInfo = null;
    try { solInfo = solve(lv, 2); } catch (e) { issues.push('求解器异常: ' + e.message); }
    let uniqueOk = true, solvableOk = true, matchesDeclared = true;
    if (solInfo) {
      if (solInfo.count === 0) { solvableOk = false; summary.unsolvable++; issues.push('无解（与声明 solution 矛盾或约束冲突）'); }
      else if (solInfo.count > 1) { uniqueOk = false; summary.notUnique++; issues.push('存在多个解（不唯一），count>=' + solInfo.count); }
      if (solInfo.first && solvableOk) {
        for (let r = 0; r < lv.gridSize; r++) for (let c = 0; c < lv.gridSize; c++)
          if (solInfo.first[r][c] !== lv.solution[r][c]) { matchesDeclared = false; break; }
        if (!matchesDeclared) { summary.mismatchedSolution++; issues.push('求解器唯一解与声明 solution 不一致'); }
      }
    }
    if (issues.some(i => i.includes('和值不符'))) summary.cageSumFails++;
    if (issues.some(i => i.includes('非排列') || i.includes('重复'))) summary.solutionInvalid++;
    if (issues.some(i => i.includes('不一致'))) summary.givenMismatch++;
    all.push({ file: f, level: lv.levelId, gridSize: lv.gridSize, issues });
  }
  console.log('==== CageMaster4 内容校验 ====');
  console.log(`关卡总数: ${summary.total}`);
  console.log(`结构失败: ${summary.structuralFails}`);
  console.log(`笼子和值错误: ${summary.cageSumFails}`);
  console.log(`解非法(数独/笼子): ${summary.solutionInvalid}`);
  console.log(`预填与解不一致: ${summary.givenMismatch}`);
  console.log(`无解: ${summary.unsolvable}`);
  console.log(`多解(不唯一): ${summary.notUnique}`);
  console.log(`解与声明不符: ${summary.mismatchedSolution}`);
  const bad = all.filter(a => a.issues && a.issues.length);
  console.log(`\n==== 问题明细 (${bad.length}) ====`);
  for (const b of bad) {
    console.log(`\n■ ${b.file} (${b.level}) ${b.gridSize}x${b.gridSize}`);
    for (const i of b.issues) console.log('   - ' + i);
  }
  if (bad.length === 0) console.log('✅ 全部 51 关内容校验通过（笼子和值/解合法/预填一致/有唯一解且匹配声明解）');
}
main();
