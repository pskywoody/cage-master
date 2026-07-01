/**
 * 杀手数独关卡生成器
 * 生成第3-6章的有效关卡数据，验证唯一解
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 通用杀手数独求解器（支持 6x6 和 9x9，带节点/时间限制）
// ============================================================
class KillerSudokuSolverGeneric {
  constructor(grid, cages, size, boxH, boxW) {
    this.size = size;
    this.boxH = boxH;
    this.boxW = boxW;
    this.grid = grid.map(row => row.slice());
    this.cages = cages;
    this.solutions = [];
    this.maxSolutions = 2;
    this.nodeCount = 0;
    this.nodeLimit = 500000; // 最多搜索节点数
    this.timeLimit = 10000; // 最多10秒
    this.startTime = 0;
    this.aborted = false;

    // 笼子索引
    this.cageIdMap = Array.from({ length: size }, () => Array(size).fill(null));
    this.cageMap = {};
    cages.forEach(cage => {
      this.cageMap[cage.id] = cage;
      cage.cells.forEach(([r, c]) => {
        this.cageIdMap[r][c] = cage.id;
      });
    });

    // 笼子状态
    this.cageState = {};
    cages.forEach(cage => {
      this.cageState[cage.id] = { sum: 0, filled: 0, nums: new Set() };
    });

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const val = this.grid[r][c];
        if (val !== 0) {
          const cageId = this.cageIdMap[r][c];
          if (cageId !== null) {
            const state = this.cageState[cageId];
            state.sum += val;
            state.filled += 1;
            state.nums.add(val);
          }
        }
      }
    }
  }

  isValid(r, c, num) {
    // 行检查
    for (let i = 0; i < this.size; i++) {
      if (this.grid[r][i] === num) return false;
    }
    // 列检查
    for (let i = 0; i < this.size; i++) {
      if (this.grid[i][c] === num) return false;
    }
    // 宫检查
    const boxR = Math.floor(r / this.boxH) * this.boxH;
    const boxC = Math.floor(c / this.boxW) * this.boxW;
    for (let i = boxR; i < boxR + this.boxH; i++) {
      for (let j = boxC; j < boxC + this.boxW; j++) {
        if (this.grid[i][j] === num) return false;
      }
    }
    // 笼子检查
    const cageId = this.cageIdMap[r][c];
    if (cageId !== null) {
      const state = this.cageState[cageId];
      const cage = this.cageMap[cageId];
      if (state.nums.has(num)) return false;
      if (state.sum + num > cage.sum) return false;
      if (state.filled + 1 === cage.cells.length && state.sum + num !== cage.sum) {
        return false;
      }
    }
    return true;
  }

  place(r, c, num) {
    this.grid[r][c] = num;
    const cageId = this.cageIdMap[r][c];
    if (cageId !== null) {
      const state = this.cageState[cageId];
      state.sum += num;
      state.filled += 1;
      state.nums.add(num);
    }
  }

  remove(r, c, num) {
    this.grid[r][c] = 0;
    const cageId = this.cageIdMap[r][c];
    if (cageId !== null) {
      const state = this.cageState[cageId];
      state.sum -= num;
      state.filled -= 1;
      state.nums.delete(num);
    }
  }

  findBestEmpty() {
    let bestR = -1, bestC = -1;
    let bestCount = this.size + 1;
    let bestCandidates = null;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] === 0) {
          const cands = [];
          for (let n = 1; n <= this.size; n++) {
            if (this.isValid(r, c, n)) cands.push(n);
          }
          if (cands.length < bestCount) {
            bestCount = cands.length;
            bestR = r;
            bestC = c;
            bestCandidates = cands;
            if (bestCount <= 1) return [r, c, cands];
          }
        }
      }
    }
    if (bestR === -1) return null;
    return [bestR, bestC, bestCandidates];
  }

  solve(maxSolutions = 2, timeLimitMs = 10000, nodeLimit = 500000) {
    this.maxSolutions = maxSolutions;
    this.solutions = [];
    this.nodeCount = 0;
    this.nodeLimit = nodeLimit;
    this.timeLimit = timeLimitMs;
    this.startTime = Date.now();
    this.aborted = false;
    this._backtrack();
    return this.solutions.length > 0;
  }

  _backtrack() {
    if (this.aborted) return;
    this.nodeCount++;
    if (this.nodeCount > this.nodeLimit) { this.aborted = true; return; }
    if (Date.now() - this.startTime > this.timeLimit) { this.aborted = true; return; }
    if (this.solutions.length >= this.maxSolutions) return;

    const best = this.findBestEmpty();
    if (!best) {
      this.solutions.push(this.grid.map(row => row.slice()));
      return;
    }
    const [r, c, candidates] = best;
    if (candidates.length === 0) return;

    for (const num of candidates) {
      this.place(r, c, num);
      this._backtrack();
      this.remove(r, c, num);
      if (this.solutions.length >= this.maxSolutions) return;
      if (this.aborted) return;
    }
  }

  getResult() {
    return {
      solved: this.solutions.length > 0,
      unique: this.solutions.length === 1,
      solutionCount: this.solutions.length,
      solution: this.solutions.length > 0 ? this.solutions[0] : null,
      aborted: this.aborted,
      nodes: this.nodeCount
    };
  }
}

// ============================================================
// 数独解生成器（回溯法随机填充完整解）
// ============================================================
function generateFullSolution(size, boxH, boxW) {
  const grid = Array.from({ length: size }, () => Array(size).fill(0));

  function isValidPlacement(r, c, num) {
    for (let i = 0; i < size; i++) {
      if (grid[r][i] === num) return false;
      if (grid[i][c] === num) return false;
    }
    const bR = Math.floor(r / boxH) * boxH;
    const bC = Math.floor(c / boxW) * boxW;
    for (let i = bR; i < bR + boxH; i++) {
      for (let j = bC; j < bC + boxW; j++) {
        if (grid[i][j] === num) return false;
      }
    }
    return true;
  }

  function fillCell(index) {
    if (index >= size * size) return true;
    const r = Math.floor(index / size);
    const c = index % size;
    const nums = [];
    for (let n = 1; n <= size; n++) nums.push(n);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    for (const num of nums) {
      if (isValidPlacement(r, c, num)) {
        grid[r][c] = num;
        if (fillCell(index + 1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  fillCell(0);
  return grid;
}

// ============================================================
// 笼子分组算法（改进版：确保相邻连通、笼内数字不重复、形状自然）
// ============================================================
function generateCages(solution, size) {
  const covered = Array.from({ length: size }, () => Array(size).fill(false));
  const cages = [];
  let cageId = 1;

  function getUncoveredNeighbors(r, c) {
    const neighbors = [];
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !covered[nr][nc]) {
        neighbors.push([nr, nc]);
      }
    }
    return neighbors;
  }

  // 目标笼子大小分布
  function pickCageSize() {
    const r = Math.random();
    if (r < 0.08) return 1;
    if (r < 0.45) return 2;
    if (r < 0.78) return 3;
    return 4;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (covered[r][c]) continue;

      let targetSize = pickCageSize();
      const cells = [[r, c]];
      const values = new Set([solution[r][c]]); // 跟踪笼内已有数字
      covered[r][c] = true;

      // 贪心扩展：从前沿选邻居加入，确保数字不重复
      while (cells.length < targetSize) {
        // 收集所有合法前沿（值不重复的邻居）
        const frontier = [];
        for (const [cr, cc] of cells) {
          const nbrs = getUncoveredNeighbors(cr, cc);
          for (const n of nbrs) {
            const [nr, nc] = n;
            // 检查：邻居不能重复（同一位置不重复加入frontier）
            if (frontier.some(f => f[0] === nr && f[1] === nc)) continue;
            // 关键检查：笼内数字不能重复
            if (values.has(solution[nr][nc])) continue;
            frontier.push(n);
          }
        }
        if (frontier.length === 0) break;

        // 优先水平方向扩展
        let pick;
        if (Math.random() < 0.6) {
          const rightNbrs = frontier.filter(([fr, fc]) => {
            return cells.some(([cr, cc]) => fr === cr && fc === cc + 1);
          });
          if (rightNbrs.length > 0) {
            pick = rightNbrs[Math.floor(Math.random() * rightNbrs.length)];
          } else {
            pick = frontier[Math.floor(Math.random() * frontier.length)];
          }
        } else {
          pick = frontier[Math.floor(Math.random() * frontier.length)];
        }
        cells.push(pick);
        values.add(solution[pick[0]][pick[1]]);
        covered[pick[0]][pick[1]] = true;
      }

      let sum = 0;
      for (const [cr, cc] of cells) {
        sum += solution[cr][cc];
      }
      cages.push({ id: cageId++, sum, cells });
    }
  }

  return cages;
}

// ============================================================
// 智能挖洞：逐步挖除并验证，确保唯一解
// ============================================================
function digHolesSmart(solution, cages, size, boxH, boxW, fillRatio) {
  const totalCells = size * size;
  const targetFilled = Math.round(totalCells * fillRatio);
  const board = solution.map(row => row.slice());

  // 生成所有位置的随机排列
  const positions = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      positions.push([r, c]);
    }
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  let filled = totalCells;
  let digIndex = 0;

  // 逐步挖洞：每次挖一个，快速检查（用较短的时间限制）
  while (filled > targetFilled && digIndex < positions.length) {
    const [r, c] = positions[digIndex++];
    if (board[r][c] === 0) continue;

    board[r][c] = 0;
    filled--;

    // 每次挖洞后快速验证（短时间限制，判断是否明显多解/无解）
    // 对于接近目标的阶段，做完整验证
    const remainingRatio = filled / totalCells;
    let timeLim = 2000;
    let nodeLim = 50000;
    if (remainingRatio <= fillRatio + 0.05) {
      timeLim = 5000;
      nodeLim = 200000;
    }

    const solver = new KillerSudokuSolverGeneric(board, cages, size, boxH, boxW);
    solver.solve(2, timeLim, nodeLim);
    const result = solver.getResult();

    if (result.aborted) {
      // 搜索超时，可能太难或多解，回填这个格子
      board[r][c] = solution[r][c];
      filled++;
      continue;
    }

    if (!result.unique) {
      // 多解或无解，回填
      board[r][c] = solution[r][c];
      filled++;
    }
  }

  return board;
}

// ============================================================
// 验证关卡唯一解（完整版，更长的时间限制）
// ============================================================
function verifyUnique(board, cages, size, boxH, boxW) {
  const solver = new KillerSudokuSolverGeneric(board, cages, size, boxH, boxW);
  const startTime = Date.now();
  solver.solve(2, 15000, 1000000);
  const elapsed = Date.now() - startTime;
  const result = solver.getResult();
  return { ...result, elapsedMs: elapsed };
}

// ============================================================
// 生成单个关卡
// ============================================================
function generateLevel(size, boxH, boxW, fillRatio, maxAttempts = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1. 生成完整解
    const solution = generateFullSolution(size, boxH, boxW);

    // 2. 生成笼子
    const cages = generateCages(solution, size);

    // 验证笼子覆盖
    const cellSet = new Set();
    let cagesValid = true;
    for (const cage of cages) {
      for (const [r, c] of cage.cells) {
        const key = `${r},${c}`;
        if (cellSet.has(key)) { cagesValid = false; break; }
        cellSet.add(key);
      }
      if (!cagesValid) break;
    }
    if (!cagesValid || cellSet.size !== size * size) continue;

    // 3. 智能挖洞（逐步验证）
    const board = digHolesSmart(solution, cages, size, boxH, boxW, fillRatio);

    // 统计预填
    let prefilled = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] !== 0) prefilled++;
      }
    }

    // 4. 完整验证唯一解
    const verifyResult = verifyUnique(board, cages, size, boxH, boxW);

    if (verifyResult.unique && !verifyResult.aborted) {
      // 验证解匹配
      let matches = true;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (verifyResult.solution[r][c] !== solution[r][c]) {
            matches = false;
            break;
          }
        }
        if (!matches) break;
      }
      if (matches) {
        return {
          boardData: board,
          cages,
          solution,
          prefilled,
          totalCells: size * size,
          cageCount: cages.length,
          verifyMs: verifyResult.elapsedMs,
          attempt: attempt + 1
        };
      }
    }

    const status = verifyResult.aborted ? 'timeout' :
                   verifyResult.solutionCount === 0 ? 'no-solution' :
                   `${verifyResult.solutionCount}-solutions`;
    console.log(`    尝试 ${attempt + 1}/${maxAttempts} 失败 (${status}, nodes=${verifyResult.nodes}, time=${verifyResult.elapsedMs}ms, filled=${prefilled}/${size*size})`);
  }

  throw new Error(`Failed to generate level after ${maxAttempts} attempts`);
}

// ============================================================
// 主函数
// ============================================================
function main() {
  const chaptersPath = path.join(__dirname, 'game-src', 'data', 'chapters.json');
  const backupPath = path.join(__dirname, 'game-src', 'data', 'chapters.json.bak');

  console.log('📖 读取 chapters.json...');
  const rawData = fs.readFileSync(chaptersPath, 'utf-8');
  const chapters = JSON.parse(rawData);

  // 备份
  console.log('💾 创建备份 chapters.json.bak...');
  fs.writeFileSync(backupPath, rawData, 'utf-8');

  // 找到各章节
  const chapter2 = chapters.find(ch => ch.chapterId === 2);
  const chapter3 = chapters.find(ch => ch.chapterId === 3);
  const chapter4 = chapters.find(ch => ch.chapterId === 4);
  const chapter5 = chapters.find(ch => ch.chapterId === 5);
  const chapter6 = chapters.find(ch => ch.chapterId === 6);

  // ---- 第2章关卡数量检查 ----
  console.log(`\n📋 第2章当前关卡数: ${chapter2.levels.length}`);
  if (chapter2.levels.length > 8) {
    console.log(`⚠️  第2章有 ${chapter2.levels.length} 关，移除多余关卡...`);
    chapter2.levels = chapter2.levels.filter(lv => lv.levelId >= 201 && lv.levelId <= 208);
    console.log(`✅ 第2章修复后关卡数: ${chapter2.levels.length}`);
  } else if (chapter2.levels.length === 8) {
    console.log('✅ 第2章关卡数量正确（8关）');
  } else {
    console.log(`⚠️  第2章只有 ${chapter2.levels.length} 关，少于8关`);
  }

  // ---- 移除第4章多余关卡 ----
  console.log(`\n📋 第4章当前关卡数: ${chapter4.levels.length}`);
  if (chapter4.levels.length > 6) {
    console.log(`⚠️  第4章有 ${chapter4.levels.length} 关，移除多余关卡(407)...`);
    chapter4.levels = chapter4.levels.filter(lv => lv.levelId >= 401 && lv.levelId <= 406);
    console.log(`✅ 第4章修复后关卡数: ${chapter4.levels.length}`);
  }

  // ---- 移除第5章多余关卡 ----
  console.log(`\n📋 第5章当前关卡数: ${chapter5.levels.length}`);
  if (chapter5.levels.length > 6) {
    console.log(`⚠️  第5章有 ${chapter5.levels.length} 关，移除多余关卡(507)...`);
    chapter5.levels = chapter5.levels.filter(lv => lv.levelId >= 501 && lv.levelId <= 506);
    console.log(`✅ 第5章修复后关卡数: ${chapter5.levels.length}`);
  }

  // ---- 定义需要生成的关卡 ----
  // 注意：第1章全4x4（已有），第2章前3关6x6后5关9x9（已有），第3-6章全9x9
  // 从较容易的开始，逐步增加难度（填充率递减）
  const levelsToGenerate = [
    // 第3章：7关 (全9x9, 21/45法则进阶)
    { chapter: chapter3, levelId: 301, size: 9, boxH: 3, boxW: 3, fillRatio: 0.50, desc: '九域星图·45法则入门' },
    { chapter: chapter3, levelId: 302, size: 9, boxH: 3, boxW: 3, fillRatio: 0.47, desc: '单格推演·45法则推单格' },
    { chapter: chapter3, levelId: 303, size: 9, boxH: 3, boxW: 3, fillRatio: 0.45, desc: '差值之术·多格差值' },
    { chapter: chapter3, levelId: 304, size: 9, boxH: 3, boxW: 3, fillRatio: 0.43, desc: '内外差值·笼格伸展' },
    { chapter: chapter3, levelId: 305, size: 9, boxH: 3, boxW: 3, fillRatio: 0.41, desc: '组合锁定·双格组合' },
    { chapter: chapter3, levelId: 306, size: 9, boxH: 3, boxW: 3, fillRatio: 0.39, desc: '交叉排除·多笼交互' },
    { chapter: chapter3, levelId: 307, size: 9, boxH: 3, boxW: 3, fillRatio: 0.38, desc: '星衡试炼·第三章结业' },
    // 第4章：6关 (9x9, 候选数与组合推理)
    { chapter: chapter4, levelId: 401, size: 9, boxH: 3, boxW: 3, fillRatio: 0.40, desc: '候选笔记·标记可能性' },
    { chapter: chapter4, levelId: 402, size: 9, boxH: 3, boxW: 3, fillRatio: 0.38, desc: '隐性唯一·候选排除' },
    { chapter: chapter4, levelId: 403, size: 9, boxH: 3, boxW: 3, fillRatio: 0.37, desc: '数对占位·双候选锁定' },
    { chapter: chapter4, levelId: 404, size: 9, boxH: 3, boxW: 3, fillRatio: 0.36, desc: '三数连锁·三链数删减法' },
    { chapter: chapter4, levelId: 405, size: 9, boxH: 3, boxW: 3, fillRatio: 0.35, desc: '笼内排除·笼候选交集' },
    { chapter: chapter4, levelId: 406, size: 9, boxH: 3, boxW: 3, fillRatio: 0.34, desc: '十字交叉·行列宫笼联动' },
    // 第5章：6关 (9x9, 高级技巧)
    { chapter: chapter5, levelId: 501, size: 9, boxH: 3, boxW: 3, fillRatio: 0.36, desc: 'X翼删减法·矩形顶点' },
    { chapter: chapter5, levelId: 502, size: 9, boxH: 3, boxW: 3, fillRatio: 0.35, desc: '剑鱼构型·三行联动' },
    { chapter: chapter5, levelId: 503, size: 9, boxH: 3, boxW: 3, fillRatio: 0.34, desc: ' XY翼·三格链式' },
    { chapter: chapter5, levelId: 504, size: 9, boxH: 3, boxW: 3, fillRatio: 0.33, desc: '色彩标记·双色盘查' },
    { chapter: chapter5, levelId: 505, size: 9, boxH: 3, boxW: 3, fillRatio: 0.32, desc: '强制链·反证推演' },
    { chapter: chapter5, levelId: 506, size: 9, boxH: 3, boxW: 3, fillRatio: 0.31, desc: '高级综合·多法并用' },
    // 第6章：6关 (9x9, 大师挑战)
    { chapter: chapter6, levelId: 601, size: 9, boxH: 3, boxW: 3, fillRatio: 0.34, desc: '嵌套笼·内外重叠' },
    { chapter: chapter6, levelId: 602, size: 9, boxH: 3, boxW: 3, fillRatio: 0.33, desc: '大笼和·多笼联动' },
    { chapter: chapter6, levelId: 603, size: 9, boxH: 3, boxW: 3, fillRatio: 0.32, desc: '极限推理·少提示开局' },
    { chapter: chapter6, levelId: 604, size: 9, boxH: 3, boxW: 3, fillRatio: 0.31, desc: '设局人迷题·第一层' },
    { chapter: chapter6, levelId: 605, size: 9, boxH: 3, boxW: 3, fillRatio: 0.30, desc: '设局人迷题·第二层' },
    { chapter: chapter6, levelId: 606, size: 9, boxH: 3, boxW: 3, fillRatio: 0.29, desc: '终极笼局·大师之路' },
  ];

  const results = [];

  for (const spec of levelsToGenerate) {
    const { chapter, levelId, size, boxH, boxW, fillRatio, desc } = spec;
    console.log(`\n🎲 生成关卡 ${levelId} (${size}x${size}, ${desc}, 目标填充率${Math.round(fillRatio*100)}%)...`);

    try {
      const result = generateLevel(size, boxH, boxW, fillRatio);

      // 找到对应关卡对象并更新
      const levelObj = chapter.levels.find(lv => lv.levelId === levelId);
      if (!levelObj) {
        console.error(`❌ 找不到关卡 ${levelId}!`);
        continue;
      }

      // 更新 boardData, cages, solution, gridSize, title（保留其他字段如triggers/features）
      levelObj.boardData = result.boardData;
      levelObj.cages = result.cages;
      levelObj.solution = result.solution;
      levelObj.gridSize = size;
      // 更新标题
      const levelNum = levelId % 100;
      const chapterNum = Math.floor(levelId / 100);
      const chapterTitles = {
        3: ['九域星图', '单格推演', '差值之术', '内外差值', '组合锁定', '交叉排除', '星衡试炼'],
        4: ['候选笔记', '隐性唯一', '数对占位', '三数连锁', '笼内排除', '十字交叉'],
        5: ['X翼删减', '剑鱼构型', 'XY翼', '色彩标记', '强制链', '高级综合'],
        6: ['嵌套笼', '大笼和', '极限推理', '设局人谜题·一', '设局人谜题·二', '终极笼局']
      };
      if (chapterTitles[chapterNum] && chapterTitles[chapterNum][levelNum - 1]) {
        levelObj.title = `第${levelNum}关：${chapterTitles[chapterNum][levelNum - 1]}`;
      }
      // 确保features正确
      if (!levelObj.features) {
        levelObj.features = { allowDraft: true, assistant45: true, showHints: true };
      }

      const actualRatio = Math.round(result.prefilled / result.totalCells * 100);
      console.log(`✅ 关卡 ${levelId} 生成成功! 预填: ${result.prefilled}/${result.totalCells} (${actualRatio}%), 笼子数: ${result.cageCount}, 验证耗时: ${result.verifyMs}ms, 尝试次数: ${result.attempt}`);
      results.push({ levelId, ...result });
    } catch (err) {
      console.error(`❌ 关卡 ${levelId} 生成失败: ${err.message}`);
    }
  }

  // ---- 保存文件 ----
  console.log('\n💾 保存 chapters.json...');
  fs.writeFileSync(chaptersPath, JSON.stringify(chapters, null, 2), 'utf-8');
  console.log('✅ 保存成功!');

  // ---- 输出汇总 ----
  console.log('\n📊 ===== 生成结果汇总 =====');
  console.log('关卡ID | 尺寸 | 预填/总数 | 预填率 | 笼子数 | 验证耗时 | 尝试次数');
  console.log('-'.repeat(80));
  for (const r of results) {
    const ratio = Math.round(r.prefilled / r.totalCells * 100);
    const size = Math.sqrt(r.totalCells);
    console.log(`${r.levelId}    | ${size}x${size} | ${String(r.prefilled).padStart(2)}/${r.totalCells}    | ${ratio}%   | ${String(r.cageCount).padStart(2)}     | ${String(r.verifyMs).padStart(5)}ms | ${r.attempt}`);
  }

  console.log('\n📋 各章节关卡数:');
  console.log('  第1章:', chapters.find(ch => ch.chapterId === 1).levels.length);
  console.log('  第2章:', chapter2.levels.length);
  console.log('  第3章:', chapter3.levels.length);
  console.log('  第4章:', chapter4.levels.length);
  console.log('  第5章:', chapter5.levels.length);
  console.log('  第6章:', chapter6.levels.length);
}

main();
