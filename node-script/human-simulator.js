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
      nakedPair: 0,        // 裸数对
      hiddenPair: 0,       // 隐数对
      pointingClaiming: 0, // 区块排除法
      rule45: 0,           // 45法则
      elimination: 0       // 摒除（候选数移除）
    };

    // 初始化笼子状态（从初始数字）—— 必须在初始化候选数之前！
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] !== 0) {
          this._updateCageStateOnPlace(r, c, this.grid[r][c]);
        }
      }
    }

    // 初始化候选数（依赖笼子状态）
    this._initCandidates();
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

  // ---------- 技巧3：裸数对（Naked Pair）----------
  // 某行/列/宫/笼中，有两个格子恰好有相同的两个候选数
  // 则这两个数字一定在这两个格子里，可以从同行/列/宫/笼的其他格子中移除这两个候选
  _findNakedPair() {
    // 检查行
    for (let r = 0; r < 9; r++) {
      const result = this._findNakedPairInScope('row', r);
      if (result) return result;
    }
    // 检查列
    for (let c = 0; c < 9; c++) {
      const result = this._findNakedPairInScope('col', c);
      if (result) return result;
    }
    // 检查宫
    for (let b = 0; b < 9; b++) {
      const result = this._findNakedPairInScope('box', b);
      if (result) return result;
    }
    return null;
  }

  _findNakedPairInScope(scope, id) {
    let cells = [];
    if (scope === 'row') {
      for (let c = 0; c < 9; c++) {
        if (this.grid[id][c] === 0) cells.push([id, c]);
      }
    } else if (scope === 'col') {
      for (let r = 0; r < 9; r++) {
        if (this.grid[r][id] === 0) cells.push([r, id]);
      }
    } else if (scope === 'box') {
      const br = Math.floor(id / 3) * 3;
      const bc = (id % 3) * 3;
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          if (this.grid[br+dr][bc+dc] === 0) cells.push([br+dr, bc+dc]);
        }
      }
    }

    // 找出所有候选数为2的格子
    const twoCandCells = cells.filter(([r, c]) => this.candidates[r][c].size === 2);
    if (twoCandCells.length < 2) return null;

    // 两两比较，找候选数完全相同的对
    for (let i = 0; i < twoCandCells.length; i++) {
      for (let j = i + 1; j < twoCandCells.length; j++) {
        const [r1, c1] = twoCandCells[i];
        const [r2, c2] = twoCandCells[j];
        const cands1 = this.candidates[r1][c1];
        const cands2 = this.candidates[r2][c2];
        
        if (cands1.size === cands2.size && cands1.size === 2) {
          let same = true;
          for (const n of cands1) {
            if (!cands2.has(n)) { same = false; break; }
          }
          if (same) {
            // 找到了裸数对！检查能否移除其他格子的候选
            const pairNums = Array.from(cands1).sort((a,b)=>a-b);
            let eliminated = false;
            
            for (const [r, c] of cells) {
              if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
              for (const n of pairNums) {
                if (this.candidates[r][c].has(n)) {
                  this.candidates[r][c].delete(n);
                  eliminated = true;
                }
              }
            }
            
            if (eliminated) {
              return { eliminated: true, technique: 'nakedPair', scope, scopeId: id, pair: pairNums };
            }
          }
        }
      }
    }
    return null;
  }

  // ---------- 技巧4：隐数对（Hidden Pair）----------
  // 某行/列/宫/笼中，有两个数字恰好只出现在两个格子的候选里
  // 则这两个格子只能是这两个数字，可以移除这两个格子的其他候选
  _findHiddenPair() {
    // 检查行
    for (let r = 0; r < 9; r++) {
      const result = this._findHiddenPairInScope('row', r);
      if (result) return result;
    }
    // 检查列
    for (let c = 0; c < 9; c++) {
      const result = this._findHiddenPairInScope('col', c);
      if (result) return result;
    }
    // 检查宫
    for (let b = 0; b < 9; b++) {
      const result = this._findHiddenPairInScope('box', b);
      if (result) return result;
    }
    return null;
  }

  _findHiddenPairInScope(scope, id) {
    // 收集每个数字出现的位置
    const numPositions = {}; // num -> [[r,c], ...]
    
    const collectCell = (r, c) => {
      if (this.grid[r][c] !== 0) return;
      for (const n of this.candidates[r][c]) {
        if (!numPositions[n]) numPositions[n] = [];
        numPositions[n].push([r, c]);
      }
    };
    
    if (scope === 'row') {
      for (let c = 0; c < 9; c++) collectCell(id, c);
    } else if (scope === 'col') {
      for (let r = 0; r < 9; r++) collectCell(r, id);
    } else if (scope === 'box') {
      const br = Math.floor(id / 3) * 3;
      const bc = (id % 3) * 3;
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          collectCell(br+dr, bc+dc);
        }
      }
    }

    // 找出恰好出现在2个位置的数字
    const twoPosNums = [];
    for (const n of Object.keys(numPositions)) {
      if (numPositions[n].length === 2) {
        twoPosNums.push({ num: parseInt(n), positions: numPositions[n] });
      }
    }
    
    if (twoPosNums.length < 2) return null;

    // 两两比较，找位置完全相同的数字对
    for (let i = 0; i < twoPosNums.length; i++) {
      for (let j = i + 1; j < twoPosNums.length; j++) {
        const a = twoPosNums[i];
        const b = twoPosNums[j];
        
        // 检查两个数字是否出现在相同的两个位置
        const samePositions = 
          ((a.positions[0][0] === b.positions[0][0] && a.positions[0][1] === b.positions[0][1] &&
            a.positions[1][0] === b.positions[1][0] && a.positions[1][1] === b.positions[1][1]) ||
           (a.positions[0][0] === b.positions[1][0] && a.positions[0][1] === b.positions[1][1] &&
            a.positions[1][0] === b.positions[0][0] && a.positions[1][1] === b.positions[0][1]));
        
        if (samePositions) {
          // 找到了隐数对！移除这两个格子的其他候选
          const pairNums = [a.num, b.num].sort((x,y)=>x-y);
          const pos1 = a.positions[0];
          const pos2 = a.positions[1];
          let eliminated = false;
          
          for (const [r, c] of [pos1, pos2]) {
            const toRemove = [];
            for (const n of this.candidates[r][c]) {
              if (n !== pairNums[0] && n !== pairNums[1]) {
                toRemove.push(n);
              }
            }
            for (const n of toRemove) {
              this.candidates[r][c].delete(n);
              eliminated = true;
            }
          }
          
          if (eliminated) {
            return { eliminated: true, technique: 'hiddenPair', scope, scopeId: id, pair: pairNums };
          }
        }
      }
    }
    return null;
  }

  // ---------- 技巧5：区块排除法（Locked Candidates / Pointing & Claiming）----------
  // Pointing Pair（宫→行/列）：某数字在某宫中只出现在同一行/列 → 该行/列其他宫移除该数字
  // Claiming Pair（行/列→宫）：某数字在某行/列中只出现在同一宫 → 该宫其他行/列移除该数字
  _findPointingClaiming() {
    let eliminated = false;

    // 1. Pointing Pair（宫→行/列）
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3;
      const bc = (b % 3) * 3;
      
      // 统计每个数字在宫中出现的行和列
      const numRows = {};
      const numCols = {};
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const r = br + dr, c = bc + dc;
          if (this.grid[r][c] !== 0) continue;
          for (const n of this.candidates[r][c]) {
            if (!numRows[n]) numRows[n] = new Set();
            if (!numCols[n]) numCols[n] = new Set();
            numRows[n].add(r);
            numCols[n].add(c);
          }
        }
      }
      
      // 检查每个数字：如果只出现在同一行 → Pointing Row
      for (const n of Object.keys(numRows)) {
        const rows = numRows[n];
        if (rows.size === 1) {
          const r = [...rows][0];
          // 从该行的其他宫中移除n
          for (let c = 0; c < 9; c++) {
            if (c >= bc && c < bc + 3) continue; // 跳过当前宫
            if (this.grid[r][c] === 0 && this.candidates[r][c].has(parseInt(n))) {
              this.candidates[r][c].delete(parseInt(n));
              eliminated = true;
            }
          }
        }
        // 只出现在同一列 → Pointing Column
        const cols = numCols[n];
        if (cols.size === 1) {
          const c = [...cols][0];
          for (let r = 0; r < 9; r++) {
            if (r >= br && r < br + 3) continue; // 跳过当前宫
            if (this.grid[r][c] === 0 && this.candidates[r][c].has(parseInt(n))) {
              this.candidates[r][c].delete(parseInt(n));
              eliminated = true;
            }
          }
        }
      }
    }

    // 2. Claiming Pair（行/列→宫）
    // 行→宫
    for (let r = 0; r < 9; r++) {
      const numBoxes = {}; // num -> Set of box indices
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] !== 0) continue;
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        for (const n of this.candidates[r][c]) {
          if (!numBoxes[n]) numBoxes[n] = new Set();
          numBoxes[n].add(b);
        }
      }
      for (const n of Object.keys(numBoxes)) {
        const boxes = numBoxes[n];
        if (boxes.size === 1) {
          const b = [...boxes][0];
          const br = Math.floor(b / 3) * 3;
          const bc = (b % 3) * 3;
          // 从该宫的其他行移除n
          for (let dr = 0; dr < 3; dr++) {
            const rr = br + dr;
            if (rr === r) continue;
            for (let dc = 0; dc < 3; dc++) {
              const cc = bc + dc;
              if (this.grid[rr][cc] === 0 && this.candidates[rr][cc].has(parseInt(n))) {
                this.candidates[rr][cc].delete(parseInt(n));
                eliminated = true;
              }
            }
          }
        }
      }
    }
    
    // 列→宫
    for (let c = 0; c < 9; c++) {
      const numBoxes = {};
      for (let r = 0; r < 9; r++) {
        if (this.grid[r][c] !== 0) continue;
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        for (const n of this.candidates[r][c]) {
          if (!numBoxes[n]) numBoxes[n] = new Set();
          numBoxes[n].add(b);
        }
      }
      for (const n of Object.keys(numBoxes)) {
        const boxes = numBoxes[n];
        if (boxes.size === 1) {
          const b = [...boxes][0];
          const br = Math.floor(b / 3) * 3;
          const bc = (b % 3) * 3;
          // 从该宫的其他列移除n
          for (let dc = 0; dc < 3; dc++) {
            const cc = bc + dc;
            if (cc === c) continue;
            for (let dr = 0; dr < 3; dr++) {
              const rr = br + dr;
              if (this.grid[rr][cc] === 0 && this.candidates[rr][cc].has(parseInt(n))) {
                this.candidates[rr][cc].delete(parseInt(n));
                eliminated = true;
              }
            }
          }
        }
      }
    }

    if (eliminated) {
      return { eliminated: true, technique: 'pointingClaiming' };
    }
    return null;
  }

  // ---------- 技巧6：45法则 ----------
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
      // 注意：只有当该格原来有多个候选时，才算"45法则确定的数字"
      // 如果本来只有1个候选，那是裸单，不算45法则
      for (let i = 0; i < count; i++) {
        const possibleNums = new Set(combinations.map(c => c[i]));
        if (possibleNums.size === 1) {
          const num = Array.from(possibleNums)[0];
          const [r, c] = emptyCells[i];
          // 关键：只有当候选数>1时，才算45法则的功劳
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(num) && cellCandidates[i].length > 1) {
            return { r, c, num, scope, scopeId, rule45: true, comboCount: combinations.length, candBefore: cellCandidates[i].length };
          }
        }
      }
    }

    // 情况2：某个数字在所有组合中都出现在同一个格子 → 确定该格
    // 同样，只有当该格原来有多个候选时才算45法则
    for (let i = 0; i < count; i++) {
      const [r, c] = emptyCells[i];
      const possibleNums = new Set(combinations.map(combo => combo[i]));
      if (possibleNums.size === 1) {
        const num = Array.from(possibleNums)[0];
        if (this.grid[r][c] === 0 && this.candidates[r][c].has(num) && cellCandidates[i].length > 1) {
          return { r, c, num, scope, scopeId, rule45: true, comboCount: combinations.length, candBefore: cellCandidates[i].length };
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

  // 做一轮全面候选摒除（45法则 + 笼子约束 + 数对法）
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

    // 裸数对（Naked Pair）
    const nakedPairResult = this._findNakedPair();
    if (nakedPairResult && nakedPairResult.eliminated) {
      this.techniques.nakedPair++;
      anyEliminated = true;
    }

    // 隐数对（Hidden Pair）
    const hiddenPairResult = this._findHiddenPair();
    if (hiddenPairResult && hiddenPairResult.eliminated) {
      this.techniques.hiddenPair++;
      anyEliminated = true;
    }

    // 区块排除法（Pointing & Claiming）
    const pointingResult = this._findPointingClaiming();
    if (pointingResult && pointingResult.eliminated) {
      this.techniques.pointingClaiming++;
      anyEliminated = true;
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

  // 获取难度评级（v2）
  getDifficultyRating() {
    const t = this.techniques;
    const total = this.steps.length;
    const emptyCells = this._countEmpty();
    const fillRate = 1 - emptyCells / 81;

    let score = 0;

    // 1. 完成度分（最多25分）
    // 能完全解出的题，根据难度来定；解不出的题，完成度越低越难
    if (this._isComplete()) {
      // 完全解出：基础分20分，剩余5分由技巧难度决定
      score += 20;
    } else {
      // 未完成：按完成度给分（完成越少分越高=越难）
      score += 25 + (1 - fillRate) * 25; // 25~50分
    }

    // 2. 总步数（最多20分）
    // 步数越多说明题越复杂
    // 参考：入门约30步，简单约45步，中等约55步，困难约65步，地狱约80步
    score += Math.min(20, total * 0.3);

    // 3. 技巧加权分（最多35分）
    // 裸单：基础技巧，权重最低（最多6分）
    score += Math.min(6, t.nakedSingle * 0.1);
    // 隐单：中级技巧（最多6分）
    score += Math.min(6, t.hiddenSingle * 0.5);
    // 裸数对：中高级技巧（最多6分）
    score += Math.min(6, t.nakedPair * 0.8);
    // 隐数对：高级技巧（最多6分）
    score += Math.min(6, t.hiddenPair * 1.2);
    // 区块排除法：中高级技巧（最多6分）
    score += Math.min(6, t.pointingClaiming * 1.0);
    // 45法则摒除：核心技巧（最多3分）
    score += Math.min(3, t.elimination * 0.05);
    // 45法则直接确定数字：少见但高级（额外加分）
    score += t.rule45 * 1.0;

    // 4. 卡壳惩罚/加分（最多20分）
    // 解不完的题，空格越多说明需要越高级的技巧
    if (!this._isComplete()) {
      score += Math.min(20, emptyCells * 0.8);
    }

    score = Math.min(100, Math.max(0, Math.round(score)));

    // 五级难度评级
    let level = '入门';
    if (score >= 75) level = '地狱';
    else if (score >= 60) level = '困难';
    else if (score >= 45) level = '中等';
    else if (score >= 25) level = '简单';

    return {
      score,
      level,
      techniques: { ...t },
      totalSteps: total,
      solvable: this._isComplete(),
      emptyCells,
      fillRate: Math.round(fillRate * 100) / 100
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
