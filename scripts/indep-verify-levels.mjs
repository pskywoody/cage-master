// ============================================================
//  indep-verify-levels.mjs - 独立全量关卡核验（不依赖任何报告）
// ============================================================
//  对 data/levels/ 下全部关卡做真正从源码出发的验证：
//    1. 结构：gridSize / boardData / solution 尺寸一致
//    2. solution 合法性：行/列/宫各含 1..N 恰好一次
//    3. boardData 固定格 与 solution 一致
//    4. 笼子和：每笼 solution 内和 == cage.sum（含越界/重复覆盖统计）
//    5. 独立回溯求解器：数解个数（0=无解 / 1=唯一 / 2+=多解）
//       并核对声明的 solution 是否等于求解器解出的唯一解
//    6. TechRater 纯逻辑求解：remainingCells（>0 表示该关必须靠猜）
//  用: node scripts/indep-verify-levels.mjs
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEVELS = path.join(__dirname, '..', 'data', 'levels');

await import('../core/tech-rater.js');
if (!globalThis.TechRater) {
  console.error('TechRater 未挂载到全局');
  process.exit(1);
}
const { HeadlessEngine } = await import('../core/headless-engine.js');

// ---------- 独立回溯求解器（不依赖 TechRater 逻辑链） ----------
// 返回 { count, solutions }；count 上限为 limit
function solveCount(levelData, limit = 2) {
  const n = levelData.gridSize;
  const boxH = n === 9 ? 3 : (n === 6 ? 2 : 2);
  const boxW = n / boxH;
  const givens = levelData.boardData.map((row) => row.slice());
  const cages = (levelData.cages || []).map((c) => ({ sum: c.sum, cells: c.cells.map(([r, cc]) => [r, cc]) }));

  const cellCages = Array.from({ length: n }, () => Array.from({ length: n }, () => []));
  for (let ci = 0; ci < cages.length; ci++) {
    for (const [r, c] of cages[ci].cells) {
      if (r < 0 || r >= n || c < 0 || c >= n) continue; // 越界格在笼校验阶段单独报
      cellCages[r][c].push(ci);
    }
  }

  const grid = givens.map((row) => row.slice());
  const rowUsed = Array.from({ length: n }, () => 0);
  const colUsed = Array.from({ length: n }, () => 0);
  const boxUsed = Array.from({ length: n }, () => 0);
  const cageFilled = cages.map(() => 0);
  const cageEmptyLeft = cages.map((c) => c.cells.length);

  // 预填固定格；先做基础一致性检查
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = givens[r][c];
      if (!v) continue;
      const b = Math.floor(r / boxH) * boxW + Math.floor(c / boxW);
      const mask = (1 << (v - 1));
      if ((rowUsed[r] | colUsed[c] | boxUsed[b]) & mask) return { count: 0, solutions: [] }; // 固定格自冲突
      rowUsed[r] |= mask;
      colUsed[c] |= mask;
      boxUsed[b] |= mask;
      for (const ci of cellCages[r][c]) {
        cageFilled[ci] += v;
        cageEmptyLeft[ci] -= 1;
      }
    }
  }
  for (let ci = 0; ci < cages.length; ci++) {
    let s = 0;
    for (const [r, cc] of cages[ci].cells) {
      if (r < 0 || r >= n || cc < 0 || cc >= n) continue;
      if (givens[r][cc]) s += givens[r][cc];
    }
    if (s > cages[ci].sum) return { count: 0, solutions: [] };
  }

  const empty = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!givens[r][c]) empty.push([r, c]);

  let found = 0;
  const solutions = [];

  function cageFeasible() {
    for (let ci = 0; ci < cages.length; ci++) {
      const sum = cages[ci].sum;
      const left = cageEmptyLeft[ci];
      if (left === 0) { if (cageFilled[ci] !== sum) return false; continue; }
      if (cageFilled[ci] + left * 1 > sum) return false; // 全填 1 都超
      if (cageFilled[ci] + left * n < sum) return false; // 全填 n 都不够
    }
    return true;
  }

  function pick() {
    let best = -1, bestCnt = Infinity;
    for (let i = 0; i < empty.length; i++) {
      const [r, c] = empty[i];
      const b = Math.floor(r / boxH) * boxW + Math.floor(c / boxW);
      const used = rowUsed[r] | colUsed[c] | boxUsed[b];
      let cnt = 0;
      for (let v = 1; v <= n; v++) if (!(used & (1 << (v - 1)))) cnt++;
      if (cnt < bestCnt) { bestCnt = cnt; best = i; if (cnt <= 1) break; }
    }
    return best;
  }

  // 深拷贝 empty 与 used 状态的迭代/递归：不共享可变数组，杜绝顺序污染
  function search() {
    if (found >= limit) return;
    if (empty.length === 0) {
      found++;
      if (solutions.length < 1) solutions.push(grid.map((row) => row.slice()));
      return;
    }
    if (!cageFeasible()) return;

    const i = pick();
    if (i < 0) return;
    const [r, c] = empty[i];
    const b = Math.floor(r / boxH) * boxW + Math.floor(c / boxW);
    const used = rowUsed[r] | colUsed[c] | boxUsed[b];
    const myCages = cellCages[r][c];

    const cands = [];
    for (let v = 1; v <= n; v++) {
      if (used & (1 << (v - 1))) continue;
      let ok = true;
      for (const ci of myCages) {
        const sum = cages[ci].sum;
        const left = cageEmptyLeft[ci];
        if (cageFilled[ci] + v > sum) { ok = false; break; }
        if (left === 1 && cageFilled[ci] + v !== sum) { ok = false; break; }
        if (cageFilled[ci] + v + (left - 1) * 1 > sum) { ok = false; break; }
        if (cageFilled[ci] + v + (left - 1) * n < sum) { ok = false; break; }
      }
      if (ok) cands.push(v);
    }

    // 取出该格（从 empty 中移除）
    [empty[i], empty[empty.length - 1]] = [empty[empty.length - 1], empty[i]];
    const picked = empty.pop();
    grid[r][c] = 0;

    for (let k = 0; k < cands.length; k++) {
      const v = cands[k];
      grid[r][c] = v;
      rowUsed[r] |= (1 << (v - 1));
      colUsed[c] |= (1 << (v - 1));
      boxUsed[b] |= (1 << (v - 1));
      for (const ci of myCages) { cageFilled[ci] += v; cageEmptyLeft[ci] -= 1; }

      search();

      for (const ci of myCages) { cageFilled[ci] -= v; cageEmptyLeft[ci] += 1; }
      boxUsed[b] &= ~(1 << (v - 1));
      colUsed[c] &= ~(1 << (v - 1));
      rowUsed[r] &= ~(1 << (v - 1));
      if (found >= limit) break;
    }
    grid[r][c] = 0;
    empty.push(picked);
  }

  search(0);
  return { count: found, solutions };
}

// ---------- solution 合法性 ----------
function checkSolutionValid(L) {
  const n = L.gridSize;
  const sol = L.solution;
  const boxH = n === 9 ? 3 : (n === 6 ? 2 : 2);
  const boxW = n / boxH;
  const boxRows = n / boxH;
  const boxCols = n / boxW;
  const errs = [];
  if (!Array.isArray(sol) || sol.length !== n) return [`solution 非 ${n} 行`];
  for (let r = 0; r < n; r++) {
    const row = sol[r];
    if (!Array.isArray(row) || row.length !== n) { errs.push(`行${r} 长度非 ${n}`); continue; }
    const set = new Set(row);
    if (set.size !== n || row.some((x) => !Number.isInteger(x) || x < 1 || x > n)) errs.push(`行${r} 数值非法或重复`);
  }
  for (let c = 0; c < n; c++) {
    const set = new Set();
    for (let r = 0; r < n; r++) if (sol[r] && sol[r][c]) set.add(sol[r][c]);
    if (set.size !== n) errs.push(`列${c} 重复或非法`);
  }
  for (let br = 0; br < boxRows; br++) {
    for (let bc = 0; bc < boxCols; bc++) {
      const set = new Set();
      for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) {
        const v = sol[br * boxH + dr][bc * boxW + dc];
        if (v === undefined || v === null) { errs.push(`宫(${br},${bc}) 越界取到 undefined`); continue; }
        set.add(v);
      }
      if (set.size !== boxH * boxW) errs.push(`宫(${br},${bc}) 重复或非法`);
    }
  }
  return errs;
}

// ---------- 主流程 ----------
const files = fs.readdirSync(LEVELS).filter((f) => /^level-\d+\.json$/.test(f)).sort((a, b) => {
  return parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10);
});

let bad = 0, skipped = 0;
const guessLevels = [];
const multiLevels = [];

for (const f of files) {
  const id = f.match(/\d+/)[0];
  const L = JSON.parse(fs.readFileSync(path.join(LEVELS, f), 'utf8'));
  const name = `level-${id}「${L.title || '?'}」`;

  if (L.puzzleType === 'traitor_hunt_6x6') {
    console.log(`[SKIP] ${name} 非数独（找内鬼），跳过求解核验`);
    skipped++;
    continue;
  }

  const errs = [];
  const warns = [];

  const n = L.gridSize;
  if (!Array.isArray(L.boardData) || L.boardData.length !== n) errs.push(`boardData 非 ${n}x${n}`);
  if (!Array.isArray(L.solution) || L.solution.length !== n) errs.push(`solution 非 ${n}x${n}`);
  for (let r = 0; r < n && Array.isArray(L.boardData) && r < L.boardData.length; r++) {
    if (!Array.isArray(L.boardData[r]) || L.boardData[r].length !== n) { errs.push(`boardData[${r}] 长度非 ${n}`); break; }
  }

  const solErrs = checkSolutionValid(L);
  errs.push(...solErrs.map((e) => 'solution:' + e));

  let fixedMismatch = 0;
  for (let r = 0; r < n && Array.isArray(L.solution) && L.solution[r]; r++) {
    for (let c = 0; c < n; c++) {
      if (L.boardData[r][c] !== 0 && L.boardData[r][c] !== L.solution[r][c]) fixedMismatch++;
    }
  }
  if (fixedMismatch) errs.push(`boardData 与 solution 不一致固定格 ${fixedMismatch} 处`);

  let cageBad = 0, uncovered = 0, overlapCells = 0;
  const cellOwner = Array.from({ length: n }, () => Array(n).fill(0));
  if (Array.isArray(L.cages)) {
    for (const cage of L.cages) {
      let s = 0, oob = 0;
      for (const [r, c] of cage.cells) {
        if (r < 0 || r >= n || c < 0 || c >= n) { oob++; cageBad++; continue; }
        if (L.solution[r] && L.solution[r][c] !== undefined) s += L.solution[r][c];
        cellOwner[r][c]++;
        if (cellOwner[r][c] > 1) overlapCells++;
      }
      if (oob) errs.push(`笼${cage.id} 含 ${oob} 个越界格`);
      if (cage.sum !== s) { cageBad++; errs.push(`笼${cage.id} 和=${s} != 声明 ${cage.sum}`); }
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (cellOwner[r][c] === 0) uncovered++;
    if (uncovered) warns.push(`未覆盖格子 ${uncovered} 处（无笼格）`);
    if (overlapCells) warns.push(`多笼重叠格子 ${overlapCells} 处（若为嵌套笼设计则属预期）`);
  }

  let res = null;
  try {
    res = solveCount(L, 2);
  } catch (e) {
    errs.push('求解器异常: ' + e.message);
    res = null;
  }
  if (res) {
    if (res.count === 0) errs.push('无解（回溯求解器 0 个解）');
    else if (res.count > 1) { multiLevels.push(id); warns.push(`多解（找到 ${res.count} 个解）`); }
    else {
      const found = res.solutions[0];
      const decl = L.solution;
      let mismatch = 0;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (found[r][c] !== decl[r][c]) mismatch++;
      if (mismatch) errs.push(`声明的 solution 与求解器解不一致（差 ${mismatch} 格）`);
    }
  }

  let remaining = null;
  try {
    const engine = new HeadlessEngine();
    engine.loadLevel(L);
    const rater = new globalThis.TechRater(engine.getBoard());
    const rr = rater.solve(2000);
    remaining = rr.remainingCells;
    if (remaining > 0) guessLevels.push({ id, remaining });
  } catch (e) {
    warns.push('TechRater 求解异常: ' + e.message);
  }

  if (errs.length) {
    bad++;
    console.log(`[BUG] ${name} ${errs.length}处：`);
    for (const e of errs) console.log(`      - ${e}`);
    if (warns.length) for (const w of warns) console.log(`      ~ ${w}`);
  } else {
    const extra = remaining > 0 ? ` (纯逻辑剩 ${remaining} 空格, 需猜)` : '';
    const extra2 = res && res.count > 1 ? ` (多解 ${res.count})` : '';
    console.log(`[OK]  ${name}  解数=${res ? res.count : '?'}${extra2}  逻辑剩余=${remaining}${extra}${warns.length ? '  ~' + warns.join(';') : ''}`);
  }
}

console.log('\n================ 汇总 ================');
console.log(`关卡总数=${files.length}  跳过(找内鬼)=${skipped}  有问题=${bad}  多解=${multiLevels.length}`);
if (multiLevels.length) console.log('多解关卡:', multiLevels.join(', '));
if (guessLevels.length) {
  console.log(`纯逻辑不可解（需猜）关卡 ${guessLevels.length} 个:`);
  for (const g of guessLevels) console.log(`  - level-${g.id}: 剩 ${g.remaining} 空格`);
}
process.exit(bad ? 1 : 0);
