// ==========================================
// 人类解题模拟器
// 模拟人类用逻辑技巧逐步解题，用于难度评级和生成引导路径
// ==========================================

class HumanSimulator {
  /**
   * @param {number[][]} grid - 9x9 初始盘面（0 表示空）
   * @param {Array} cages - 笼子数组 [{id, sum, cells:[[r,c]]}]
   */
  constructor(grid, cages) {
    this.size = 9;
    this.grid = grid.map(row => row.slice());
    this.cages = cages;

    // 预建索引
    this.cageIdMap = Array.from({ length: 9 }, () => Array(9).fill(null));
    this.cageMap = {};
    cages.forEach(cage => {
      this.cageMap[cage.id] = cage;
      cage.cells.forEach(([r, c]) => {
        this.cageIdMap[r][c] = cage.id;
      });
    });

    // 笼子运行时状态
    this.cageState = {};
    cages.forEach(cage => {
      this.cageState[cage.id] = {
        sum: 0,
        filled: 0,
        nums: new Set(),
        emptyCells: cage.cells.map(([r, c]) => [r, c])
      };
    });

    // 候选数：9x9 的 Set
    this.candidates = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );

    // 解题路径（每一步的记录）
    this.steps = [];

    // 技巧使用统计
    this.techniques = {
      nakedSingle: 0,      // 显单
      hiddenSingle: 0,     // 隐单
      rule45: 0,           // 45法则
      elimination: 0       // 摒除（候选数移除）
    };

    // 初始化候选数
    this._initCandidates();

    // 初始化笼子状态（从初始数字）
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] !== 0) {
          this._updateCageStateOnPlace(r, c, this.grid[r][c]);
        }
      }
    }
  }

  // ---------- 初始化候选数 ----------
  _initCandidates() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] === 0) {
          for (let num = 1; num <= 9; num++) {
            if (this._canPlace(r, c, num)) {
              this.candidates[r][c].add(num);
            }
          }
        }
      }
    }
  }

  // 判断 num 能否放在 (r,c)（仅检查已填入的数字，不检查候选）
  _canPlace(r, c, num) {
    // 行检查
    for (let i = 0; i < 9; i++) {
      if (this.grid[r][i] === num) return false;
    }
    // 列检查
    for (let i = 0; i < 9; i++) {
      if (this.grid[i][c] === num) return false;
    }
    // 宫检查
    const boxR = Math.floor(r / 3) * 3;
    const boxC = Math.floor(c / 3) * 3;
    for (let i = boxR; i < boxR + 3; i++) {
      for (let j = boxC; j < boxC + 3; j++) {
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

  // 放置数字后更新笼子状态
  _updateCageStateOnPlace(r, c, num) {
    const cageId = this.cageIdMap[r][c];
    if (cageId !== null) {
      const state = this.cageState[cageId];
      state.sum += num;
      state.filled += 1;
      state.nums.add(num);
      state.emptyCells = state.emptyCells.filter(([er, ec]) => !(er === r && ec === c));
    }
  }

  // 填入数字，并更新所有关联候选
  _placeNumber(r, c, num, stepInfo) {
    this.grid[r][c] = num;
    this.candidates[r][c].clear();
    this._updateCageStateOnPlace(r, c, num);

    // 移除同行候选
    for (let i = 0; i < 9; i++) {
      if (i !== c && this.grid[r][i] === 0) {
        this.candidates[r][i].delete(num);
      }
    }
    // 移除同列候选
    for (let i = 0; i < 9; i++) {
      if (i !== r && this.grid[i][c] === 0) {
        this.candidates[i][c].delete(num);
      }
    }
    // 移除同宫候选
    const boxR = Math.floor(r / 3) * 3;
    const boxC = Math.floor(c / 3) * 3;
    for (let i = boxR; i < boxR + 3; i++) {
      for (let j = boxC; j < boxC + 3; j++) {
        if ((i !== r || j !== c) && this.grid[i][j] === 0) {
          this.candidates[i][j].delete(num);
        }
      }
    }
    // 移除同笼候选
    const cageId = this.cageIdMap[r][c];
    if (cageId !== null) {
      const cage = this.cageMap[cageId];
      cage.cells.forEach(([cr, cc]) => {
        if ((cr !== r || cc !== c) && this.grid[cr][cc] === 0) {
          this.candidates[cr][cc].delete(num);
        }
      });

      // 笼子和值约束：更新剩余候选
      this._applyCageSumConstraint(cageId);
    }

    // 记录步骤
    this.steps.push({
      row: r,
      col: c,
      num,
      ...stepInfo
    });
  }

  // 应用笼子和值约束：移除不可能的候选
  _applyCageSumConstraint(cageId) {
    const state = this.cageState[cageId];
    const cage = this.cageMap[cageId];
    const remainingSum = cage.sum - state.sum;
    const remainingCells = state.emptyCells.length;

    if (remainingCells === 0) return;

    // 对每个空格子，检查每个候选是否可能
    for (const [r, c] of state.emptyCells) {
      const toRemove = [];
      for (const num of this.candidates[r][c]) {
        // 剩下的 sum 减去这个数字后，其余格子能否用不同数字填满？
        const restSum = remainingSum - num;
        const restCount = remainingCells - 1;
        if (!this._canSumBeFormed(restSum, restCount, num)) {
          toRemove.push(num);
        }
      }
      toRemove.forEach(num => this.candidates[r][c].delete(num));
    }
  }

  // 判断 sum 能否由 count 个不同数字组成（不包含 excludeNum）
  _canSumBeFormed(sum, count, excludeNum = 0) {
    if (count === 0) return sum === 0;
    if (count < 0 || sum < 0) return false;

    // 最小可能和
    let minSum = 0;
    let added = 0;
    for (let n = 1; n <= 9 && added < count; n++) {
      if (n !== excludeNum) {
        minSum += n;
        added++;
      }
    }
    if (added < count) return false; // 数字不够
    if (sum < minSum) return false;

    // 最大可能和
    let maxSum = 0;
    added = 0;
    for (let n = 9; n >= 1 && added < count; n--) {
      if (n !== excludeNum) {
        maxSum += n;
        added++;
      }
    }
    if (sum > maxSum) return false;

    // 在范围内都可能（简化判断，不做精确组合枚举）
    return true;
  }

  // ---------- 技巧1：显单（Naked Single）----------
  // 某格只有一个候选数
  _findNakedSingle() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 1) {
          const num = Array.from(this.candidates[r][c])[0];
          return { r, c, num };
        }
      }
    }
    return null;
  }

  // ---------- 技巧2：隐单（Hidden Single）----------
  // 某行/列/宫/笼中，某个数字只出现在一个格子的候选里
  _findHiddenSingle() {
    // 行检查
    for (let r = 0; r < 9; r++) {
      const posMap = new Map(); // num -> [[r,c], ...]
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] === 0) {
          for (const num of this.candidates[r][c]) {
            if (!posMap.has(num)) posMap.set(num, []);
            posMap.get(num).push([r, c]);
          }
        }
      }
      for (const [num, positions] of posMap) {
        if (positions.length === 1) {
          return { r: positions[0][0], c: positions[0][1], num, scope: 'row', scopeId: r };
        }
      }
    }

    // 列检查
    for (let c = 0; c < 9; c++) {
      const posMap = new Map();
      for (let r = 0; r < 9; r++) {
        if (this.grid[r][c] === 0) {
          for (const num of this.candidates[r][c]) {
            if (!posMap.has(num)) posMap.set(num, []);
            posMap.get(num).push([r, c]);
          }
        }
      }
      for (const [num, positions] of posMap) {
        if (positions.length === 1) {
          return { r: positions[0][0], c: positions[0][1], num, scope: 'col', scopeId: c };
        }
      }
    }

    // 宫检查
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const posMap = new Map();
        for (let r = br * 3; r < br * 3 + 3; r++) {
          for (let c = bc * 3; c < bc * 3 + 3; c++) {
            if (this.grid[r][c] === 0) {
              for (const num of this.candidates[r][c]) {
                if (!posMap.has(num)) posMap.set(num, []);
                posMap.get(num).push([r, c]);
              }
            }
          }
        }
        for (const [num, positions] of posMap) {
          if (positions.length === 1) {
            return { r: positions[0][0], c: positions[0][1], num, scope: 'box', scopeId: br * 3 + bc };
          }
        }
      }
    }

    // 笼子检查
    for (const cage of this.cages) {
      const posMap = new Map();
      for (const [r, c] of cage.cells) {
        if (this.grid[r][c] === 0) {
          for (const num of this.candidates[r][c]) {
            if (!posMap.has(num)) posMap.set(num, []);
            posMap.get(num).push([r, c]);
          }
        }
      }
      for (const [num, positions] of posMap) {
        if (positions.length === 1) {
          return { r: positions[0][0], c: positions[0][1], num, scope: 'cage', scopeId: cage.id };
        }
      }
    }

    return null;
  }

  // ---------- 技巧3：45法则 ----------
  // 涵盖：行/列/宫剩余推导 + 笼子剩余和推导
  // 策略：先做全面候选摒除，再找能确定的数字
  _findRule45() {
    let anyEliminated = false;

    // 第一阶段：全面候选摒除（对所有行列宫笼做 45 法则候选移除）
    // 行
    for (let r = 0; r < 9; r++) {
      const result = this._rule45ForScope('row', r);
      if (result && result.eliminated) anyEliminated = true;
    }
    // 列
    for (let c = 0; c < 9; c++) {
      const result = this._rule45ForScope('col', c);
      if (result && result.eliminated) anyEliminated = true;
    }
    // 宫
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const result = this._rule45ForScope('box', br * 3 + bc);
        if (result && result.eliminated) anyEliminated = true;
      }
    }
    // 笼子（只处理 1-4 格）
    for (const cage of this.cages) {
      if (cage.cells.length <= 4) {
        const result = this._rule45ForScope('cage', cage.id);
        if (result && result.eliminated) anyEliminated = true;
      }
    }

    // 如果移除了候选，返回 eliminated，让主循环重新从显单开始
    if (anyEliminated) {
      return { eliminated: true };
    }

    // 第二阶段：找能确定的数字
    // 行
    for (let r = 0; r < 9; r++) {
      const result = this._rule45ForScope('row', r);
      if (result && result.r !== undefined) return result;
    }
    // 列
    for (let c = 0; c < 9; c++) {
      const result = this._rule45ForScope('col', c);
      if (result && result.r !== undefined) return result;
    }
    // 宫
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const result = this._rule45ForScope('box', br * 3 + bc);
        if (result && result.r !== undefined) return result;
      }
    }
    // 笼子
    for (const cage of this.cages) {
      if (cage.cells.length <= 4) {
        const result = this._rule45ForScope('cage', cage.id);
        if (result && result.r !== undefined) return result;
      }
    }

    return null;
  }

  _rule45ForScope(scope, id) {
    let emptyCells;
    let targetSum;

    if (scope === 'row') {
      emptyCells = [];
      let sum = 0;
      for (let c = 0; c < 9; c++) {
        if (this.grid[id][c] === 0) emptyCells.push([id, c]);
        else sum += this.grid[id][c];
      }
      targetSum = 45 - sum;
      // 剩余格数太多时 45 法则效果差，跳过
      if (emptyCells.length > 5) return null;
    } else if (scope === 'col') {
      emptyCells = [];
      let sum = 0;
      for (let r = 0; r < 9; r++) {
        if (this.grid[r][id] === 0) emptyCells.push([r, id]);
        else sum += this.grid[r][id];
      }
      targetSum = 45 - sum;
      if (emptyCells.length > 5) return null;
    } else if (scope === 'box') {
      const br = Math.floor(id / 3);
      const bc = id % 3;
      emptyCells = [];
      let sum = 0;
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) {
          if (this.grid[r][c] === 0) emptyCells.push([r, c]);
          else sum += this.grid[r][c];
        }
      }
      targetSum = 45 - sum;
      if (emptyCells.length > 5) return null;
    } else if (scope === 'cage') {
      const state = this.cageState[id];
      const cage = this.cageMap[id];
      if (!state || !cage) return null;
      emptyCells = state.emptyCells;
      targetSum = cage.sum - state.sum;
      // 笼子格数太多的话组合爆炸，跳过
      if (emptyCells.length > 4) return null;
    } else {
      return null;
    }

    return this._analyzeRemainingCells(emptyCells, targetSum, scope, id);
  }

  // 分析一组空格的剩余和，看能否确定某个格子的数字或缩小候选
  _analyzeRemainingCells(emptyCells, targetSum, scope, scopeId) {
    const count = emptyCells.length;
    if (count === 0) return null;

    // 获取每格的候选数
    const cellCandidates = emptyCells.map(([r, c]) =>
      Array.from(this.candidates[r][c]).sort((a, b) => a - b)
    );

    // 枚举所有可能的组合（不重复数字）
    const combinations = [];
    this._enumCombinations(cellCandidates, 0, targetSum, [], new Set(), combinations);

    if (combinations.length === 0) return null; // 无解（不应该发生）

    // 情况1：只有一种组合，且能唯一确定每格数字
    if (combinations.length === 1) {
      const combo = combinations[0];
      // 检查每格是否只有一个可能
      for (let i = 0; i < count; i++) {
        const possibleNums = new Set(combinations.map(c => c[i]));
        if (possibleNums.size === 1) {
          const num = Array.from(possibleNums)[0];
          const [r, c] = emptyCells[i];
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(num)) {
            return { r, c, num, scope, scopeId, rule45: true, comboCount: combinations.length };
          }
        }
      }
    }

    // 情况2：某个数字在所有组合中都出现在同一个格子 → 确定该格
    for (let i = 0; i < count; i++) {
      const [r, c] = emptyCells[i];
      const possibleNums = new Set(combinations.map(combo => combo[i]));
      if (possibleNums.size === 1) {
        const num = Array.from(possibleNums)[0];
        if (this.grid[r][c] === 0 && this.candidates[r][c].has(num)) {
          return { r, c, num, scope, scopeId, rule45: true, comboCount: combinations.length };
        }
      }
    }

    // 情况3：某格候选数中，有数字不在任何组合里 → 移除这些候选（摒除）
    let eliminated = false;
    for (let i = 0; i < count; i++) {
      const [r, c] = emptyCells[i];
      const possibleNums = new Set(combinations.map(combo => combo[i]));
      const currentCands = Array.from(this.candidates[r][c]);
      for (const num of currentCands) {
        if (!possibleNums.has(num)) {
          this.candidates[r][c].delete(num);
          eliminated = true;
        }
      }
    }
    if (eliminated) {
      this.techniques.elimination++;
      // 移除候选后，可能产生新的显单/隐单，返回 eliminated 标记
      return { eliminated: true };
    }

    return null;
  }

  // 枚举组合：从每格候选中选一个不同的数字，和为 targetSum
  _enumCombinations(cellCandidates, index, targetSum, current, used, results) {
    if (index === cellCandidates.length) {
      if (targetSum === 0) {
        results.push([...current]);
      }
      return;
    }

    // 剪枝：剩余最小和 > targetSum 或 剩余最大和 < targetSum
    const remaining = cellCandidates.length - index;
    let minPossible = 0, maxPossible = 0;
    let added = 0;
    for (let n = 1; n <= 9 && added < remaining; n++) {
      if (!used.has(n)) { minPossible += n; added++; }
    }
    added = 0;
    for (let n = 9; n >= 1 && added < remaining; n--) {
      if (!used.has(n)) { maxPossible += n; added++; }
    }
    if (minPossible > targetSum || maxPossible < targetSum) return;

    for (const num of cellCandidates[index]) {
      if (used.has(num)) continue;
      if (num > targetSum) continue; // 剪枝
      used.add(num);
      current.push(num);
      this._enumCombinations(cellCandidates, index + 1, targetSum - num, current, used, results);
      current.pop();
      used.delete(num);
    }
  }

  // ---------- 主循环：逐步求解 ----------
  solve(maxSteps = 500) {
    let steps = 0;
    let noProgressRounds = 0;

    while (steps < maxSteps && !this._isComplete()) {
      // 第一步：全面候选摒除（45法则 + 笼子和值约束）
      // 这一步不直接填数，但缩小候选范围，为显单/隐单创造条件
      const eliminated = this._doEliminationRound();

      // 第二步：找显单（最简单，优先）
      const naked = this._findNakedSingle();
      if (naked) {
        this.techniques.nakedSingle++;
        this._placeNumber(naked.r, naked.c, naked.num, { technique: 'nakedSingle' });
        steps++;
        noProgressRounds = 0;
        continue;
      }

      // 第三步：找隐单
      const hidden = this._findHiddenSingle();
      if (hidden) {
        this.techniques.hiddenSingle++;
        this._placeNumber(hidden.r, hidden.c, hidden.num, {
          technique: 'hiddenSingle',
          scope: hidden.scope,
          scopeId: hidden.scopeId
        });
        steps++;
        noProgressRounds = 0;
        continue;
      }

      // 第四步：用 45 法则直接确定数字
      const rule45Num = this._findRule45Placement();
      if (rule45Num) {
        this.techniques.rule45++;
        this._placeNumber(rule45Num.r, rule45Num.c, rule45Num.num, {
          technique: 'rule45',
          scope: rule45Num.scope,
          scopeId: rule45Num.scopeId,
          rule45: true
        });
        steps++;
        noProgressRounds = 0;
        continue;
      }

      // 没有任何进展
      noProgressRounds++;
      if (noProgressRounds >= 2) {
        break; // 连续两轮没进展，卡住了
      }
      // 如果这轮有摒除进展，再试一轮
      if (eliminated) {
        continue;
      }
      break;
    }

    return {
      complete: this._isComplete(),
      steps: this.steps,
      techniques: { ...this.techniques },
      totalSteps: this.steps.length,
      grid: this.grid.map(row => row.slice())
    };
  }

  // 做一轮全面候选摒除（45法则 + 笼子约束）
  _doEliminationRound() {
    let anyEliminated = false;

    // 笼子和值约束（1-4格笼）
    for (const cage of this.cages) {
      if (cage.cells.length <= 4) {
        const result = this._rule45ForScope('cage', cage.id);
        if (result && result.eliminated) anyEliminated = true;
      }
    }

    // 行 45 法则（剩余 ≤ 5 格）
    for (let r = 0; r < 9; r++) {
      const result = this._rule45ForScope('row', r);
      if (result && result.eliminated) anyEliminated = true;
    }

    // 列 45 法则
    for (let c = 0; c < 9; c++) {
      const result = this._rule45ForScope('col', c);
      if (result && result.eliminated) anyEliminated = true;
    }

    // 宫 45 法则
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const result = this._rule45ForScope('box', br * 3 + bc);
        if (result && result.eliminated) anyEliminated = true;
      }
    }

    if (anyEliminated) {
      this.techniques.elimination++;
    }
    return anyEliminated;
  }

  // 用 45 法则找可以直接确定的数字
  _findRule45Placement() {
    // 笼子
    for (const cage of this.cages) {
      if (cage.cells.length <= 4) {
        const result = this._rule45ForScope('cage', cage.id);
        if (result && result.r !== undefined) return result;
      }
    }
    // 行
    for (let r = 0; r < 9; r++) {
      const result = this._rule45ForScope('row', r);
      if (result && result.r !== undefined) return result;
    }
    // 列
    for (let c = 0; c < 9; c++) {
      const result = this._rule45ForScope('col', c);
      if (result && result.r !== undefined) return result;
    }
    // 宫
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const result = this._rule45ForScope('box', br * 3 + bc);
        if (result && result.r !== undefined) return result;
      }
    }
    return null;
  }

  _isComplete() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] === 0) return false;
      }
    }
    return true;
  }

  // 获取难度评级
  getDifficultyRating() {
    const t = this.techniques;
    const total = this.steps.length;

    // 按技巧占比和完成度综合评分
    let score = 0;

    // 基础分：能解到什么程度
    const emptyCells = this._countEmpty();
    const fillRate = 1 - emptyCells / 81;
    score += fillRate * 30; // 完成度最高 30 分

    // 技巧加权分（最高 70 分）
    score += Math.min(20, t.nakedSingle * 0.3);       // 显单最多 20 分
    score += Math.min(25, t.hiddenSingle * 1.0);      // 隐单最多 25 分
    score += Math.min(25, t.rule45 * 2.5);             // 45法则最多 25 分

    // 解不完的题，额外加分（说明需要更高级技巧）
    if (!this._isComplete()) {
      score += Math.min(20, emptyCells * 1.5);
    }

    score = Math.min(100, Math.round(score));

    let level = '简单';
    if (score >= 60) level = '困难';
    else if (score >= 30) level = '中等';

    return {
      score,
      level,
      techniques: { ...t },
      totalSteps: total,
      solvable: this._isComplete(),
      emptyCells
    };
  }

  _countEmpty() {
    let count = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] === 0) count++;
      }
    }
    return count;
  }
}

// ==========================================
// CLI 测试入口
// ==========================================

if (require.main === module) {
  const levels = require('../game-src/data/levels.json');

  console.log('🧠 人类解题模拟器测试\n');

  for (let i = 0; i < Math.min(3, levels.length); i++) {
    const level = levels[i];
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    const sim = new HumanSimulator(grid, level.cages);

    console.log(`=== 关卡 ${level.id}: ${level.name} ===`);
    console.time('  模拟耗时');
    const result = sim.solve();
    console.timeEnd('  模拟耗时');

    console.log(`  完成度: ${result.complete ? '✅ 完全解出' : '⚠️ 未完全解出'}`);
    console.log(`  总填数: ${result.totalSteps} | 候选摒除: ${result.techniques.elimination}轮`);
    console.log(`  技巧统计: 显单=${result.techniques.nakedSingle} 隐单=${result.techniques.hiddenSingle} 45法则=${result.techniques.rule45}`);

    const rating = sim.getDifficultyRating();
    console.log(`  难度评级: ${rating.level} (${rating.score}分)`);
    console.log('');
  }

  // 测试最难的一关
  const hardLevel = levels.find(l => l.difficulty === '困难');
  if (hardLevel) {
    console.log('=== 困难关测试 ===');
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    const sim = new HumanSimulator(grid, hardLevel.cages);
    const result = sim.solve();
    console.log(`  完成度: ${result.complete ? '✅' : '❌'}`);
    console.log(`  总填数: ${result.totalSteps} | 候选摒除: ${result.techniques.elimination}轮`);
    console.log(`  技巧统计: 显单=${result.techniques.nakedSingle} 隐单=${result.techniques.hiddenSingle} 45法则=${result.techniques.rule45}`);
    const rating = sim.getDifficultyRating();
    console.log(`  难度评级: ${rating.level} (${rating.score}分)`);

    if (!result.complete) {
      // 数一下还剩多少空格
      let empty = 0;
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (result.grid[r][c] === 0) empty++;
      console.log(`  剩余空格: ${empty}`);
    }
  }
}

module.exports = { HumanSimulator };
