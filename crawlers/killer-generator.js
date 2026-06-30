// ==========================================
// Killer Sudoku Generator v3 - with cage combination tables
// 使用cage组合表加速求解
// ==========================================

const fs = require('fs');
const path = require('path');

const SIZE = 9;
const BOX = 3;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---- Cage组合表：size=2,3格的所有可能数字组合(sum -> 数字集合) ----
const CAGE_COMBOS = {};
function initCageCombos() {
  // 枚举所有不重复的1-9数字组合
  function genCombos(size, start = 1, current = []) {
    if (current.length === size) {
      const sum = current.reduce((a, b) => a + b, 0);
      const key = `${size}_${sum}`;
      if (!CAGE_COMBOS[key]) CAGE_COMBOS[key] = [];
      CAGE_COMBOS[key].push(new Set(current));
      return;
    }
    for (let n = start; n <= 9; n++) {
      current.push(n);
      genCombos(size, n + 1, current);
      current.pop();
    }
  }
  for (let s = 1; s <= 7; s++) genCombos(s);
}
initCageCombos();

function getCageCombos(size, sum) {
  return CAGE_COMBOS[`${size}_${sum}`] || null;
}

// ---- 生成完整数独解 ----
function generateSolution() {
  const grid = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  function isValid(r, c, n) {
    for (let i = 0; i < SIZE; i++) {
      if (grid[r][i] === n || grid[i][c] === n) return false;
    }
    const br = Math.floor(r / BOX) * BOX, bc = Math.floor(c / BOX) * BOX;
    for (let dr = 0; dr < BOX; dr++)
      for (let dc = 0; dc < BOX; dc++)
        if (grid[br+dr][bc+dc] === n) return false;
    return true;
  }
  function fill(idx) {
    if (idx === SIZE * SIZE) return true;
    const r = Math.floor(idx / SIZE), c = idx % SIZE;
    const nums = shuffle([1,2,3,4,5,6,7,8,9]);
    for (const n of nums) {
      if (isValid(r, c, n)) {
        grid[r][c] = n;
        if (fill(idx + 1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }
  fill(0);
  return grid;
}

// ---- 快速求解器 ----
function createSolver(cages) {
  const cellCage = new Array(SIZE * SIZE);
  for (const cage of cages) {
    for (const [r, c] of cage.cells) {
      cellCage[r * SIZE + c] = cage;
    }
  }

  // 预计算每个笼子的可能组合
  const cageCombos = cages.map(cage => {
    const combos = getCageCombos(cage.cells.length, cage.sum);
    return combos || null; // null means no precomputed combos (large cages or unusual sums)
  });

  return function solve(board, maxSols = 2, timeLimitMs = 3000) {
    const g = board.map(row => [...row]);
    let solutions = [];
    const startTime = Date.now();
    let aborted = false;

    function getCands(r, c) {
      const used = new Set();
      for (let i = 0; i < SIZE; i++) {
        if (g[r][i]) used.add(g[r][i]);
        if (g[i][c]) used.add(g[i][c]);
      }
      const br = Math.floor(r / BOX) * BOX, bc = Math.floor(c / BOX) * BOX;
      for (let dr = 0; dr < BOX; dr++)
        for (let dc = 0; dc < BOX; dc++)
          if (g[br+dr][bc+dc]) used.add(g[br+dr][bc+dc]);

      const cage = cellCage[r * SIZE + c];
      if (!cage) {
        const cands = [];
        for (let n = 1; n <= SIZE; n++) if (!used.has(n)) cands.push(n);
        return cands;
      }

      const cageIdx = cages.indexOf(cage);
      const combos = cageCombos[cageIdx];

      // 找出cage中已填入的数字和位置
      let placedSum = 0, placedMask = 0, emptyCount = 0;
      const emptyPositions = [];
      for (const [cr, cc] of cage.cells) {
        const v = g[cr][cc];
        if (v === 0) { emptyCount++; emptyPositions.push([cr, cc]); }
        else { placedSum += v; placedMask |= (1 << v); }
      }

      const cands = [];
      const rem = cage.sum - placedSum;

      if (combos) {
        // 用组合表过滤
        for (const combo of combos) {
          // 检查combo是否包含所有已放置的数字
          let ok = true;
          for (let v = 1; v <= 9; v++) {
            if ((placedMask & (1 << v)) && !combo.has(v)) { ok = false; break; }
          }
          if (!ok) continue;
          // 找当前位置可以填什么数字
          for (const n of combo) {
            if (used.has(n)) continue;
            if (placedMask & (1 << n)) continue; // already placed in cage
            // 检查剩余可行性
            const remSum = rem - n;
            const remEmpty = emptyCount - 1;
            if (remSum < 0) continue;
            if (remEmpty === 0 && remSum !== 0) continue;
            if (remEmpty > 0) {
              const minS = remEmpty * (remEmpty + 1) / 2;
              const maxS = remEmpty * (19 - remEmpty) / 2;
              if (remSum < minS || remSum > maxS) continue;
            }
            if (!cands.includes(n)) cands.push(n);
          }
        }
      } else {
        // 无组合表，用基本约束
        for (let n = 1; n <= SIZE; n++) {
          if (used.has(n)) continue;
          if (placedMask & (1 << n)) continue;
          const remSum = rem - n;
          const remEmpty = emptyCount - 1;
          if (remSum < 0) continue;
          if (remEmpty === 0 && remSum !== 0) continue;
          if (remEmpty > 0) {
            const minS = remEmpty * (remEmpty + 1) / 2;
            const maxS = remEmpty * (19 - remEmpty) / 2;
            if (remSum < minS || remSum > maxS) continue;
          }
          cands.push(n);
        }
      }

      return cands;
    }

    function backtrack() {
      if (aborted) return;
      if (solutions.length >= maxSols) return;
      if (Date.now() - startTime > timeLimitMs) { aborted = true; return; }

      let bestR = -1, bestC = -1, bestCands = null, bestLen = SIZE + 1;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (g[r][c] !== 0) continue;
          const cands = getCands(r, c);
          if (cands.length === 0) return;
          if (cands.length < bestLen) {
            bestLen = cands.length;
            bestR = r; bestC = c; bestCands = cands;
            if (bestLen === 1) break;
          }
        }
        if (bestLen === 1) break;
      }

      if (bestR === -1) {
        solutions.push(g.map(row => [...row]));
        return;
      }

      for (const n of bestCands) {
        g[bestR][bestC] = n;
        backtrack();
        g[bestR][bestC] = 0;
        if (solutions.length >= maxSols || aborted) return;
      }
    }

    backtrack();
    return { count: solutions.length, solutions, timeout: aborted };
  };
}

// ---- Cage布局生成 ----
function generateCageLayout(targetCageCount) {
  const assigned = Array.from({length: SIZE}, () => Array(SIZE).fill(-1));
  const cages = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const id = cages.length;
      cages.push({ id, cells: [[r, c]] });
      assigned[r][c] = id;
    }
  }

  const targetMerges = 81 - targetCageCount;
  let merges = 0, attempts = 0;

  while (merges < targetMerges && attempts < targetMerges * 30) {
    attempts++;
    const cageId = randInt(0, cages.length - 1);
    const cage = cages[cageId];
    if (!cage || cage.cells.length === 0) continue;
    if (cage.cells.length >= 5) continue; // 最多5格，加快求解

    const adjCages = new Set();
    for (const [r, c] of cage.cells) {
      for (const [nr, nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
          const nid = assigned[nr][nc];
          if (nid !== cageId && cages[nid] && cages[nid].cells.length + cage.cells.length <= 5) {
            adjCages.add(nid);
          }
        }
      }
    }
    if (adjCages.size === 0) continue;

    const mergeId = choice([...adjCages]);
    const mergeCage = cages[mergeId];
    for (const [r, c] of mergeCage.cells) {
      cage.cells.push([r, c]);
      assigned[r][c] = cageId;
    }
    cages[mergeId] = null;
    merges++;
  }

  return cages.filter(c => c !== null).map((c, i) => ({ id: i + 1, cells: c.cells }));
}

// ---- 主生成函数 ----
function generateOne(options = {}) {
  const targetCages = options.targetCages || randInt(26, 36);
  const timeLimitMs = options.timeLimitMs || 2000;
  const maxLayoutAttempts = options.maxLayoutAttempts || 50;

  const solution = generateSolution();

  for (let layoutAttempt = 0; layoutAttempt < maxLayoutAttempts; layoutAttempt++) {
    const cages0 = generateCageLayout(targetCages);
    const cages = cages0.map((c, idx) => ({
      id: idx + 1,
      sum: c.cells.reduce((s, [r,c2]) => s + solution[r][c2], 0),
      cells: c.cells
    }));

    const solve = createSolver(cages);
    const emptyBoard = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
    const t0 = Date.now();
    const result = solve(emptyBoard, 2, timeLimitMs);
    const solveTime = Date.now() - t0;

    if (result.timeout) continue;
    if (result.count === 1) {
      const matches = result.solutions[0].every((row, r) =>
        row.every((v, c) => v === solution[r][c])
      );
      if (matches) {
        const avgSize = 81 / cages.length;
        let diff;
        if (avgSize < 2.6) diff = 1;
        else if (avgSize < 3.0) diff = 2;
        else if (avgSize < 3.5) diff = 3;
        else if (solveTime < 500) diff = 3;
        else if (solveTime < 1500) diff = 4;
        else diff = 5;
        diff = Math.max(1, Math.min(5, diff));

        return {
          gridSize: SIZE,
          boardData: Array.from({length: SIZE}, () => Array(SIZE).fill(0)),
          solution, cages,
          givenCount: 0,
          cageCount: cages.length,
          isPure: true,
          originalCoverage: SIZE * SIZE,
          difficulty: diff,
          solveTimeMs: solveTime
        };
      }
    }
  }
  return null;
}

function generateBatch(count, options = {}) {
  const puzzles = [];
  const t0 = Date.now();
  let totalAttempts = 0;

  console.log(`Generating ${count} killer sudoku puzzles...`);

  while (puzzles.length < count) {
    totalAttempts++;
    const p = generateOne(options);
    if (p) {
      p.id = `gen_${String(puzzles.length + 1).padStart(4, '0')}`;
      p.title = `Killer Sudoku #${puzzles.length + 1}`;
      p.author = 'Generator';
      p.source = 'generated';
      puzzles.push(p);
      const stars = '★'.repeat(p.difficulty);
      process.stdout.write(`\r[${puzzles.length}/${count}] cages=${p.cageCount} diff=${stars} time=${p.solveTimeMs}ms    `);
    }
    if (totalAttempts % 50 === 0) {
      process.stdout.write(`\r[${puzzles.length}/${count}] attempts=${totalAttempts}...    `);
    }
  }

  console.log(`\nDone in ${((Date.now()-t0)/1000).toFixed(1)}s (${totalAttempts} attempts)`);
  return puzzles;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const count = parseInt(args[0]) || 300;
  const outputDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');

  console.log('========================================');
  console.log(`  Killer Sudoku Generator v3`);
  console.log(`  Target: ${count} puzzles`);
  console.log('========================================\n');

  // 生成不同难度的题目
  const all = [];

  // 简单: 30-36 cages, 大量2格笼
  console.log('--- Easy (★~★★) ---');
  const easy = generateBatch(Math.floor(count * 0.3), { targetCages: 32, timeLimitMs: 1000 });
  all.push(...easy);

  // 中等: 26-32 cages
  console.log('\n--- Medium (★★★) ---');
  const medium = generateBatch(Math.floor(count * 0.4), { targetCages: 28, timeLimitMs: 2000 });
  all.push(...medium);

  // 困难: 24-28 cages
  console.log('\n--- Hard (★★★★~★★★★★) ---');
  const hard = generateBatch(count - all.length, { targetCages: 26, timeLimitMs: 3000 });
  all.push(...hard);

  // 重新编号
  all.forEach((p, i) => {
    p.id = `gen_${String(i + 1).padStart(4, '0')}`;
    p.title = `Killer Sudoku #${i + 1}`;
  });

  const byDiff = {};
  for (const p of all) byDiff[p.difficulty] = (byDiff[p.difficulty] || 0) + 1;
  console.log('\n========================================');
  console.log('Final Difficulty Distribution:');
  for (let d = 1; d <= 5; d++) console.log(`  Level ${d} (${'★'.repeat(d)}): ${byDiff[d] || 0}`);
  console.log(`Total: ${all.length}`);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outFile = path.join(outputDir, 'generated-killers.json');
  fs.writeFileSync(outFile, JSON.stringify({
    source: 'generator',
    type: 'killer-sudoku',
    count: all.length,
    generatedAt: new Date().toISOString(),
    puzzles: all
  }, null, 2));
  console.log(`\nSaved to ${outFile}`);
}

module.exports = { generateOne, generateBatch, createSolver, generateSolution, generateCageLayout };
