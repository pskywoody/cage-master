/**
 * 杀手数独教学关验证器 v1.0
 * 用于验证教学关卡是否满足：
 * 1. 数独规则合法性（行/列/宫/笼无重复）
 * 2. 笼和正确
 * 3. 初始裸单数量 ≤ maxInitialNaked
 * 4. 填完所有裸单+隐单后卡壳（需要高级技巧）
 * 5. 卡壳点存在目标技巧（如显性数对）
 * 6. 应用该技巧后，连锁裸单可通关（多米诺收官）
 */
const fs = require('fs');

class KillerSudokuValidator {
  constructor(size = 9, boxW = 3, boxH = 3) {
    this.size = size;
    this.boxW = boxW;
    this.boxH = boxH;
    this.labels = 'ABCDEFGHI';
  }

  /**
   * 验证一个完整关卡配置
   * @param {Object} level - {boardData, cages, solution, teachingTechnique}
   * @param {Object} opts - {maxInitialNaked, requireTechnique}
   */
  validate(level, opts = {}) {
    const { boardData, cages, solution } = level;
    const requireTechnique = opts.requireTechnique || 'nakedPair';
    const maxInitialNaked = opts.maxInitialNaked || 5;
    const report = {
      valid: true,
      errors: [],
      warnings: [],
      info: {},
      steps: []
    };

    // Step 1: Validate solution is a valid sudoku
    const solCheck = this._validateSudoku(solution);
    if (!solCheck.valid) {
      report.valid = false;
      report.errors.push(...solCheck.errors.map(e => `答案盘面: ${e}`));
    }

    // Step 2: Validate givens match solution
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (boardData[r][c] !== 0 && boardData[r][c] !== solution[r][c]) {
          report.valid = false;
          report.errors.push(`初始数字不匹配: ${this.labels[r]}${c+1} 初始=${boardData[r][c]} 答案=${solution[r][c]}`);
        }
      }
    }

    // Step 3: Validate cages
    const cageCheck = this._validateCages(cages, solution);
    if (!cageCheck.valid) {
      report.valid = false;
      report.errors.push(...cageCheck.errors);
    }
    report.info.cageCount = cages.length;

    // Build cage maps
    const cageIdToCells = {};
    const cellCageId = {};
    for (const cage of cages) {
      cageIdToCells[cage.id] = cage.cells;
      for (const [r, c] of cage.cells) {
        cellCageId[`${r},${c}`] = cage.id;
      }
    }
    this._cageIdToCells = cageIdToCells;
    this._cellCageId = cellCageId;

    // Step 4: Count initial naked singles
    const initialNS = this._findNakedSingles(boardData);
    report.info.initialNakedSingles = initialNS.length;
    if (initialNS.length > maxInitialNaked) {
      report.valid = false;
      report.errors.push(`初始裸单过多: ${initialNS.length}个（要求≤${maxInitialNaked}）`);
    }
    for (const n of initialNS) {
      if (n.num !== solution[n.r][n.c]) {
        report.valid = false;
        report.errors.push(`初始裸单错误: ${this.labels[n.r]}${n.c+1} 提示填${n.num} 正确答案${solution[n.r][n.c]}`);
      }
    }

    // Step 5: Simulate naked single + hidden single cascade
    const simResult = this._simulateBasicCascade(boardData);
    report.info.beforePairFilled = simResult.filled;
    report.info.beforePairEmpty = simResult.empty;
    report.steps.push(...simResult.log);

    if (simResult.empty === 0) {
      report.valid = false;
      report.errors.push(`裸单+隐单连锁直接填满全盘(${simResult.filled}个)，不需要任何高级技巧！教学目标落空。`);
      return report;
    }

    // Step 6: Check for naked pairs at stuck point
    const stuckGrid = simResult.grid;
    const pairs = this._findNakedPairs(stuckGrid);
    report.info.nakedPairsAtStuckPoint = pairs.length;

    if (requireTechnique === 'nakedPair' && pairs.length === 0) {
      report.valid = false;
      report.errors.push(`卡壳盘面未发现显性数对，无法用${requireTechnique}破局`);
      // Print candidates for debugging
      report.warnings.push('卡壳盘面候选数:');
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (stuckGrid[r][c] === 0) {
            const ca = this._getCandidates(stuckGrid, r, c);
            report.warnings.push(`  ${this.labels[r]}${c+1}: [${ca.join(',')}] (答案=${solution[r][c]})`);
          }
        }
      }
    }

    // Step 7: Apply naked pair elimination and check if cascade leads to completion
    if (pairs.length > 0) {
      // Find a pair whose elimination produces at least one naked single
      let bestPair = null;
      let bestAfterGrid = null;
      let bestEliminations = 0;

      for (const pair of pairs) {
        const {r1, c1, r2, c2, nums, unitType} = pair;
        // Apply elimination: remove nums from other cells in the same unit
        const testGrid = stuckGrid.map(row => [...row]);
        const eliminated = this._applyNakedPairElimination(testGrid, pair);
        
        if (eliminated > 0) {
          // Check if this creates naked singles
          const newNS = this._findNakedSingles(testGrid);
          if (newNS.length > 0) {
            bestPair = pair;
            bestAfterGrid = testGrid;
            bestEliminations = eliminated;
            break;
          }
        }
      }

      if (bestPair) {
        report.info.breakthroughPair = {
          cells: [`${this.labels[bestPair.r1]}${bestPair.c1+1}`, `${this.labels[bestPair.r2]}${bestPair.c2+1}`],
          nums: bestPair.nums,
          unit: bestPair.unitType,
          eliminations: bestEliminations
        };
        report.steps.push(`破局数对: ${this.labels[bestPair.r1]}${bestPair.c1+1}和${this.labels[bestPair.r2]}${bestPair.c2+1}={${bestPair.nums[0]},${bestPair.nums[1]}}，排除${bestEliminations}个候选`);

        // Continue cascade from after pair elimination
        const afterResult = this._simulateBasicCascade(bestAfterGrid);
        report.info.afterPairFilled = simResult.filled + afterResult.filled;
        report.info.afterPairEmpty = afterResult.empty;

        if (afterResult.empty === 0) {
          report.info.dominoComplete = true;
          report.steps.push(`数对破局后，连锁裸单填满全盘（多米诺收官成功）`);
        } else {
          // Check if the result matches solution
          let mismatch = false;
          for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
              if (afterResult.grid[r][c] !== 0 && afterResult.grid[r][c] !== solution[r][c]) {
                mismatch = true;
              }
            }
          }
          if (mismatch) {
            report.valid = false;
            report.errors.push(`数对排除后产生错误数字（与答案不符），盘面设计有问题`);
          } else {
            report.warnings.push(`数对破局后仍有${afterResult.empty}个空格，需要更多技巧（可能是双数对或其他高级技巧）`);
          }
        }
      } else {
        report.valid = false;
        report.errors.push(`发现${pairs.length}个数对，但数对排除后未产生新的裸单，无法破局`);
      }
    }

    return report;
  }

  /** Validate a sudoku grid (0=empty) for duplicates in rows/cols/boxes */
  _validateSudoku(grid) {
    const errors = [];
    // Rows
    for (let r = 0; r < this.size; r++) {
      const seen = new Map();
      for (let c = 0; c < this.size; c++) {
        const v = grid[r][c];
        if (v === 0) continue;
        if (seen.has(v)) errors.push(`行${this.labels[r]}: ${this.labels[r]}${seen.get(v)+1}和${this.labels[r]}${c+1}都是${v}`);
        seen.set(v, c);
      }
    }
    // Cols
    for (let c = 0; c < this.size; c++) {
      const seen = new Map();
      for (let r = 0; r < this.size; r++) {
        const v = grid[r][c];
        if (v === 0) continue;
        if (seen.has(v)) errors.push(`列${c+1}: ${this.labels[seen.get(v)]}${c+1}和${this.labels[r]}${c+1}都是${v}`);
        seen.set(v, r);
      }
    }
    // Boxes
    for (let br = 0; br < this.size/this.boxH; br++) {
      for (let bc = 0; bc < this.size/this.boxW; bc++) {
        const seen = new Map();
        for (let dr = 0; dr < this.boxH; dr++) for (let dc = 0; dc < this.boxW; dc++) {
          const r = br*this.boxH+dr, c = bc*this.boxW+dc;
          const v = grid[r][c];
          if (v === 0) continue;
          if (seen.has(`${v}`)) errors.push(`宫${br*3+bc+1}: 重复${v}`);
          seen.set(`${v}`, [r,c]);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /** Validate cages: no duplicates, sum matches */
  _validateCages(cages, solution) {
    const errors = [];
    for (const cage of cages) {
      let sum = 0;
      const seen = new Set();
      for (const [r, c] of cage.cells) {
        const v = solution[r][c];
        sum += v;
        if (seen.has(v)) {
          errors.push(`笼${cage.id}(sum=${cage.sum}): 数字${v}重复（违反杀手数独规则）`);
        }
        seen.add(v);
      }
      if (sum !== cage.sum) {
        errors.push(`笼${cage.id}: 答案和=${sum}，配置和=${cage.sum}，不一致`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /** Get candidates for a cell (row/col/box/cage exclusion) */
  _getCandidates(grid, r, c) {
    const used = new Set();
    for (let i = 0; i < this.size; i++) { if (grid[r][i] !== 0) used.add(grid[r][i]); }
    for (let i = 0; i < this.size; i++) { if (grid[i][c] !== 0) used.add(grid[i][c]); }
    const br = Math.floor(r/this.boxH)*this.boxH, bc = Math.floor(c/this.boxW)*this.boxW;
    for (let i = br; i < br+this.boxH; i++) for (let j = bc; j < bc+this.boxW; j++) { if (grid[i][j] !== 0) used.add(grid[i][j]); }
    const cid = this._cellCageId[`${r},${c}`];
    if (cid !== undefined && this._cageIdToCells[cid]) {
      for (const [cr, cc] of this._cageIdToCells[cid]) { if (grid[cr][cc] !== 0) used.add(grid[cr][cc]); }
    }
    const out = [];
    for (let n = 1; n <= this.size; n++) if (!used.has(n)) out.push(n);
    return out;
  }

  /** Find all naked singles in grid */
  _findNakedSingles(grid) {
    const results = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      if (grid[r][c] !== 0) continue;
      const ca = this._getCandidates(grid, r, c);
      if (ca.length === 1) results.push({r, c, num: ca[0]});
    }
    return results;
  }

  /** Find one hidden single in grid */
  _findHiddenSingle(grid) {
    // Rows
    for (let r = 0; r < this.size; r++) {
      const pm = new Map();
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c] !== 0) continue;
        for (const n of this._getCandidates(grid, r, c)) {
          if (!pm.has(n)) pm.set(n, []);
          pm.get(n).push(c);
        }
      }
      for (const [n, cs] of pm) if (cs.length === 1) return {r, c: cs[0], num: n, type: 'row'};
    }
    // Cols
    for (let c = 0; c < this.size; c++) {
      const pm = new Map();
      for (let r = 0; r < this.size; r++) {
        if (grid[r][c] !== 0) continue;
        for (const n of this._getCandidates(grid, r, c)) {
          if (!pm.has(n)) pm.set(n, []);
          pm.get(n).push(r);
        }
      }
      for (const [n, rs] of pm) if (rs.length === 1) return {r: rs[0], c, num: n, type: 'col'};
    }
    // Boxes
    for (let br = 0; br < this.size/this.boxH; br++) for (let bc = 0; bc < this.size/this.boxW; bc++) {
      const pm = new Map();
      for (let dr = 0; dr < this.boxH; dr++) for (let dc = 0; dc < this.boxW; dc++) {
        const r = br*this.boxH+dr, c = bc*this.boxW+dc;
        if (grid[r][c] !== 0) continue;
        for (const n of this._getCandidates(grid, r, c)) {
          if (!pm.has(n)) pm.set(n, []);
          pm.get(n).push([r,c]);
        }
      }
      for (const [n, ps] of pm) if (ps.length === 1) return {r: ps[0][0], c: ps[0][1], num: n, type: 'box'};
    }
    // Cages
    for (const cage of Object.values(this._cageIdToCells || {})) {
      const pm = new Map();
      for (const [r, c] of cage) {
        if (grid[r][c] !== 0) continue;
        for (const n of this._getCandidates(grid, r, c)) {
          if (!pm.has(n)) pm.set(n, []);
          pm.get(n).push([r,c]);
        }
      }
      for (const [n, ps] of pm) if (ps.length === 1) return {r: ps[0][0], c: ps[0][1], num: n, type: 'cage'};
    }
    return null;
  }

  /** Simulate filling all naked singles and hidden singles one by one */
  _simulateBasicCascade(startGrid) {
    const grid = startGrid.map(row => [...row]);
    let filled = 0;
    const log = [];
    let rounds = 0;

    while (true) {
      // Fill naked singles first (one at a time)
      let found = false;
      const ns = this._findNakedSingles(grid);
      if (ns.length > 0) {
        const n = ns[0];
        if (n.num === this._getCandidates(grid, n.r, n.c)[0]) {
          grid[n.r][n.c] = n.num;
          filled++;
          rounds++;
          log.push(`#${filled} ${this.labels[n.r]}${n.c+1}=${n.num}(裸单)`);
          found = true;
        }
      }
      if (found) continue;

      // Then hidden singles
      const hs = this._findHiddenSingle(grid);
      if (hs) {
        const ca = this._getCandidates(grid, hs.r, hs.c);
        if (ca.includes(hs.num)) {
          grid[hs.r][hs.c] = hs.num;
          filled++;
          rounds++;
          log.push(`#${filled} ${this.labels[hs.r]}${hs.c+1}=${hs.num}(隐单:${hs.type})`);
          found = true;
        }
      }
      if (!found) break;
    }

    let empty = 0;
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (grid[r][c] === 0) empty++;
    return { grid, filled, empty, log, rounds };
  }

  /** Find naked pairs in grid */
  _findNakedPairs(grid) {
    const pairs = [];
    const checkUnit = (cells, unitType) => {
      const biCandidates = [];
      for (const [r, c] of cells) {
        if (grid[r][c] !== 0) continue;
        const ca = this._getCandidates(grid, r, c);
        if (ca.length === 2) biCandidates.push({r, c, nums: ca});
      }
      for (let i = 0; i < biCandidates.length; i++) {
        for (let j = i+1; j < biCandidates.length; j++) {
          const a = biCandidates[i], b = biCandidates[j];
          if (a.nums[0] === b.nums[0] && a.nums[1] === b.nums[1]) {
            // Check this pair actually eliminates something
            pairs.push({
              r1: a.r, c1: a.c, r2: b.r, c2: b.c,
              nums: a.nums, unitType, cells
            });
          }
        }
      }
    };

    // Rows
    for (let r = 0; r < this.size; r++) {
      const cells = [];
      for (let c = 0; c < this.size; c++) cells.push([r, c]);
      checkUnit(cells, 'row');
    }
    // Cols
    for (let c = 0; c < this.size; c++) {
      const cells = [];
      for (let r = 0; r < this.size; r++) cells.push([r, c]);
      checkUnit(cells, 'col');
    }
    // Boxes
    for (let br = 0; br < this.size/this.boxH; br++) for (let bc = 0; bc < this.size/this.boxW; bc++) {
      const cells = [];
      for (let dr = 0; dr < this.boxH; dr++) for (let dc = 0; dc < this.boxW; dc++) cells.push([br*this.boxH+dr, bc*this.boxW+dc]);
      checkUnit(cells, 'box');
    }
    return pairs;
  }

  /** Apply naked pair elimination: remove pair.nums from other cells in the unit. Returns count of eliminations. */
  _applyNakedPairElimination(grid, pair) {
    const {r1, c1, r2, c2, nums, cells} = pair;
    let eliminated = 0;
    // This is a simulated elimination on the candidate level.
    // Since our grid only stores filled numbers (0=empty), we can't directly modify candidates.
    // Instead, we need to check: if we assume the pair locks {nums} to those two cells,
    // does removing nums from OTHER empty cells in the unit create a naked single?
    // We simulate this by creating a "restricted" candidate function.
    // Actually a simpler approach: mark those cells as "locked" and check if any other cell
    // in the unit now has only one candidate (excluding nums).
    // But since we work with grid (filled numbers), the elimination doesn't change grid state directly.
    // The pair's logical effect is: other cells in the unit CANNOT be nums.
    // For our simulation, we need to temporarily fill cells that become determined.
    // A cell becomes determined if after removing nums from its candidates, only 1 candidate remains.
    
    const otherCells = cells.filter(([r,c]) => !((r===r1&&c===c1)||(r===r2&&c===c2)));
    for (const [r, c] of otherCells) {
      if (grid[r][c] !== 0) continue;
      const ca = this._getCandidates(grid, r, c);
      const filtered = ca.filter(n => n !== nums[0] && n !== nums[1]);
      if (filtered.length === 1 && ca.length > 1) {
        // This cell is now determined!
        grid[r][c] = filtered[0];
        eliminated++;
      }
    }
    return eliminated;
  }

  /** Pretty print grid */
  printGrid(grid) {
    for (let r = 0; r < this.size; r++) {
      let row = this.labels[r] + ' ';
      for (let c = 0; c < this.size; c++) {
        if (c === 3 || c === 6) row += '| ';
        row += (grid[r][c] === 0 ? '.' : grid[r][c]) + ' ';
      }
      console.log(row);
      if (r === 2 || r === 5) console.log('  ------+-------+------');
    }
  }
}

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KillerSudokuValidator };
}

// CLI usage: node validator.js <level-json-path> [levelId]
if (require.main === module) {
  const v = new KillerSudokuValidator();
  
  // Load chapters.json and validate all levels
  const chaptersPath = 'd:/killersudoku/game-src/data/chapters.json';
  const raw = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));
  
  // Find target level or validate all
  const targetId = parseInt(process.argv[2]) || 701;
  
  let found = null;
  for (const key of Object.keys(raw)) {
    const ch = raw[key];
    if (ch.levels) {
      for (const lv of ch.levels) {
        if (lv.levelId === targetId) { found = {chapter: ch, level: lv}; break; }
      }
      if (found) break;
    }
  }
  
  if (!found) {
    console.log(`Level ${targetId} not found`);
    process.exit(1);
  }
  
  const {chapter, level} = found;
  console.log(`\n========== 验证关卡 ${level.levelId}: ${level.title} ==========\n`);
  console.log(`所属章节: ${chapter.title}`);
  console.log(`难度: ${level.difficulty}`);
  console.log(`尺寸: ${level.gridSize}x${level.gridSize}`);
  
  const empty = level.boardData.flat().filter(v => v === 0).length;
  console.log(`初始空格: ${empty}`);
  
  const report = v.validate(level, {maxInitialNaked: 5, requireTechnique: 'nakedPair'});
  
  console.log(`\n----- 验证结果 -----`);
  console.log(`合法性: ${report.valid ? '✅ 通过' : '❌ 不通过'}`);
  
  if (report.errors.length > 0) {
    console.log(`\n❌ 错误 (${report.errors.length}):`);
    for (const e of report.errors) console.log(`  - ${e}`);
  }
  
  if (report.warnings.length > 0) {
    console.log(`\n⚠️ 警告 (${report.warnings.length}):`);
    for (const w of report.warnings) console.log(`  - ${w}`);
  }
  
  console.log(`\n📊 盘面数据:`);
  console.log(`  初始裸单: ${report.info.initialNakedSingles}个`);
  console.log(`  基础技巧可填: ${report.info.beforePairFilled}个`);
  console.log(`  卡壳点空格: ${report.info.beforePairEmpty}个`);
  console.log(`  卡壳点数对: ${report.info.nakedPairsAtStuckPoint}个`);
  
  if (report.info.breakthroughPair) {
    const bp = report.info.breakthroughPair;
    console.log(`\n🔓 破局数对: ${bp.cells[0]}和${bp.cells[1]} = {${bp.nums[0]},${bp.nums[1]}} (${bp.unit})`);
    console.log(`   排除候选: ${bp.eliminations}个`);
    console.log(`   多米诺收官: ${report.info.dominoComplete ? '✅ 成功' : '❌ 未完成'}`);
  }
  
  console.log(`\n📝 推演步骤:`);
  for (const s of report.steps) console.log(`  ${s}`);
}
