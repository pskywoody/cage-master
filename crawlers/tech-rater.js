// ==========================================
// Killer Sudoku 技巧评级求解器
// ==========================================
// 核心原则：取"最低可用技巧"，而非"最快可解路径"
// 按技巧优先级从低到高依次尝试，首次成功即判定
//
// 技巧优先级（从低到高）：
// 1. nakedSingle     裸单        - 候选数只剩1个
// 2. cageUnique      唯一组合    - 笼子和值约束下唯一可能
// 3. hiddenSingle    隐单        - 某区域内某数字只出现在一格
// 4. rule45          45法则      - 利用行/列/宫和为45推导
// 5. nakedPair       显性数对    - 两格共享相同2个候选数
// 6. hiddenPair      隐性数对    - 两数字只出现在相同两格
// 7. pointingClaiming 区块排除   - 行列宫之间的对称排除
// 8. nakedTriplet    三链数      - 三格共享3个候选数
// 9. xWing           X-Wing      - 两行两列的矩形结构
// ==========================================

const SIZE = 9;
const BOX = 3;

// 技巧定义：ID, 名称, 等级(数字越大越难), 推理深度
const TECHNIQUES = {
  nakedSingle:      { id: 'nakedSingle',      name: '裸单',       level: 1,  depth: 0 },
  cageUnique:       { id: 'cageUnique',       name: '唯一组合',    level: 2,  depth: 1 },
  hiddenSingle:     { id: 'hiddenSingle',     name: '隐单',       level: 3,  depth: 1 },
  rule45:           { id: 'rule45',           name: '45法则',     level: 4,  depth: 2 },
  nakedPair:        { id: 'nakedPair',        name: '显性数对',   level: 5,  depth: 2 },
  hiddenPair:       { id: 'hiddenPair',       name: '隐性数对',   level: 6,  depth: 3 },
  pointingClaiming: { id: 'pointingClaiming', name: '区块排除',   level: 7,  depth: 3 },
  nakedTriplet:     { id: 'nakedTriplet',     name: '三链数',     level: 8,  depth: 3 },
  xWing:            { id: 'xWing',            name: 'X-Wing',     level: 9,  depth: 4 },
  guess:            { id: 'guess',            name: '试数',       level: 10, depth: 5 }
};

// 按优先级排序的技巧列表
const TECH_PRIORITY = [
  'nakedSingle',
  'cageUnique',
  'hiddenSingle',
  'rule45',
  'nakedPair',
  'hiddenPair',
  'pointingClaiming',
  'nakedTriplet',
  'xWing'
];

class TechRaterSolver {
  constructor(board, cages) {
    this.grid = board.map(row => [...row]);
    this.cages = cages.map(c => ({
      id: c.id,
      sum: c.sum,
      cells: c.cells.map(([r, c]) => [r, c])
    }));
    
    // 建立格子到笼子的映射
    this.cellCage = new Array(SIZE * SIZE);
    for (const cage of this.cages) {
      for (const [r, c] of cage.cells) {
        this.cellCage[r * SIZE + c] = cage;
      }
    }
    
    // 初始化候选数
    this.candidates = Array.from({length: SIZE}, () =>
      Array.from({length: SIZE}, () => new Set())
    );
    this._initCandidates();
    
    // 解题记录
    this.steps = []; // { row, col, num, technique, depth }
    this.cellTech = {}; // key: r*9+c -> techniqueId  每个格子的最低所需技巧
  }
  
  // 初始化候选数
  _initCandidates() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] !== 0) {
          this.candidates[r][c] = new Set([this.grid[r][c]]);
        } else {
          this.candidates[r][c] = new Set([1,2,3,4,5,6,7,8,9]);
        }
      }
    }
    
    // 应用行/列/宫约束
    this._applyBasicConstraints();
    
    // 应用笼子和值约束
    this._applyCageConstraints();
  }
  
  // 应用基本约束
  _applyBasicConstraints() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0) continue;
        const v = this.grid[r][c];
        
        // 同行
        for (let cc = 0; cc < SIZE; cc++) {
          if (cc !== c && this.grid[r][cc] === 0) {
            this.candidates[r][cc].delete(v);
          }
        }
        // 同列
        for (let rr = 0; rr < SIZE; rr++) {
          if (rr !== r && this.grid[rr][c] === 0) {
            this.candidates[rr][c].delete(v);
          }
        }
        // 同宫
        const br = Math.floor(r / BOX) * BOX;
        const bc = Math.floor(c / BOX) * BOX;
        for (let dr = 0; dr < BOX; dr++) {
          for (let dc = 0; dc < BOX; dc++) {
            const rr = br + dr, cc = bc + dc;
            if ((rr !== r || cc !== c) && this.grid[rr][cc] === 0) {
              this.candidates[rr][cc].delete(v);
            }
          }
        }
      }
    }
  }
  
  // 应用笼子约束（初始的和值+数字不重复约束）
  _applyCageConstraints() {
    for (const cage of this.cages) {
      // 收集已放置的数字
      const placed = new Set();
      let placedSum = 0;
      const emptyCells = [];
      
      for (const [r, c] of cage.cells) {
        if (this.grid[r][c] !== 0) {
          placed.add(this.grid[r][c]);
          placedSum += this.grid[r][c];
        } else {
          emptyCells.push([r, c]);
        }
      }
      
      const remaining = cage.sum - placedSum;
      const emptyCount = emptyCells.length;
      
      if (emptyCount === 0) continue;
      
      // 移除已放置的数字
      for (const [r, c] of emptyCells) {
        for (const v of placed) {
          this.candidates[r][c].delete(v);
        }
      }
      
      // 用和值约束过滤：计算剩余可能的数字组合
      const possibleNums = this._getPossibleNumbers(remaining, emptyCount, placed);
      
      for (const [r, c] of emptyCells) {
        const toRemove = [];
        for (const v of this.candidates[r][c]) {
          if (!possibleNums.has(v)) {
            toRemove.push(v);
          }
        }
        for (const v of toRemove) {
          this.candidates[r][c].delete(v);
        }
      }
    }
  }
  
  // 获取笼子剩余可能的数字集合
  _getPossibleNumbers(targetSum, count, excludeSet) {
    const result = new Set();
    this._combosHelper(targetSum, count, 1, new Set(), excludeSet, result);
    return result;
  }
  
  _combosHelper(target, count, start, current, exclude, result) {
    if (count === 0) {
      if (target === 0) {
        for (const v of current) result.add(v);
      }
      return;
    }
    if (target <= 0 || start > 9) return;
    
    for (let v = start; v <= 9; v++) {
      if (exclude.has(v)) continue;
      if (v > target) break;
      
      current.add(v);
      this._combosHelper(target - v, count - 1, v + 1, current, exclude, result);
      current.delete(v);
    }
  }
  
  // ==========================================
  // 主求解循环：按技巧优先级从低到高尝试
  // ==========================================
  solve(maxSteps = 500) {
    let steps = 0;
    
    while (steps < maxSteps) {
      let filled = false;
      
      // 按优先级从低到高尝试每种技巧
      for (const techId of TECH_PRIORITY) {
        const result = this._applyTechnique(techId);
        if (result) {
          // 找到了！填数
          this._fillCell(result.row, result.col, result.num, techId);
          this.steps.push({
            row: result.row,
            col: result.col,
            num: result.num,
            technique: techId,
            depth: TECHNIQUES[techId].depth
          });
          this.cellTech[result.row * 9 + result.col] = techId;
          
          filled = true;
          steps++;
          break; // 填了一个数，重新从最低级技巧开始检测
        }
      }
      
      if (!filled) {
        // 所有技巧都用完了，解不下去了
        break;
      }
      
      // 检查是否完成
      let emptyCount = 0;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (this.grid[r][c] === 0) emptyCount++;
        }
      }
      if (emptyCount === 0) {
        return { complete: true, steps };
      }
    }
    
    let emptyCount = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0) emptyCount++;
      }
    }
    
    return { complete: false, steps, remaining: emptyCount };
  }
  
  // 应用指定技巧，返回找到的第一个可填格子
  _applyTechnique(techId) {
    switch (techId) {
      case 'nakedSingle':     return this._findNakedSingle();
      case 'cageUnique':      return this._findCageUnique();
      case 'hiddenSingle':    return this._findHiddenSingle();
      case 'rule45':          return this._findRule45();
      case 'nakedPair':       return this._findNakedPair();
      case 'hiddenPair':      return this._findHiddenPair();
      case 'pointingClaiming': return this._findPointingClaiming();
      case 'nakedTriplet':    return this._findNakedTriplet();
      case 'xWing':           return this._findXWing();
      default: return null;
    }
  }
  
  // ==========================================
  // 1. 裸单
  // ==========================================
  _findNakedSingle() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] !== 0) continue;
        if (this.candidates[r][c].size === 1) {
          const num = [...this.candidates[r][c]][0];
          return { row: r, col: c, num };
        }
      }
    }
    return null;
  }
  
  // ==========================================
  // 2. 唯一组合（笼子约束下某个格子唯一可能）
  // ==========================================
  _findCageUnique() {
    // 遍历每个笼子
    for (const cage of this.cages) {
      // 找出空格子和它们的候选数
      const emptyCells = [];
      const placed = new Set();
      let placedSum = 0;
      
      for (const [r, c] of cage.cells) {
        if (this.grid[r][c] !== 0) {
          placed.add(this.grid[r][c]);
          placedSum += this.grid[r][c];
        } else {
          emptyCells.push([r, c]);
        }
      }
      
      if (emptyCells.length === 0) continue;
      
      const remaining = cage.sum - placedSum;
      const count = emptyCells.length;
      
      // 如果只剩一个空格，它的值就是确定的（这其实也是裸单，但可能候选数还没更新）
      if (count === 1) {
        const [r, c] = emptyCells[0];
        if (remaining >= 1 && remaining <= 9 && !placed.has(remaining)) {
          return { row: r, col: c, num: remaining };
        }
      }
      
      // 检查每个空格：如果某个数字只在一个空格的候选里出现，而且组合可行
      for (let i = 0; i < emptyCells.length; i++) {
        const [r, c] = emptyCells[i];
        for (const num of this.candidates[r][c]) {
          // 检查：如果这个格子填num，其他格子能否凑出remaining - num
          const otherCells = emptyCells.filter((_, j) => j !== i);
          const otherCands = otherCells.map(([rr, cc]) => this.candidates[rr][cc]);
          const canFill = this._canFillSum(remaining - num, otherCands, placed);
          
          if (!canFill) {
            // 这个格子不能填num？不对，应该反过来：
            // 检查num是否必须在这个格子里（其他格子都不能填num）
            let mustBeHere = true;
            for (let j = 0; j < emptyCells.length; j++) {
              if (j === i) continue;
              const [rr, cc] = emptyCells[j];
              if (this.candidates[rr][cc].has(num)) {
                mustBeHere = false;
                break;
              }
            }
            
            if (mustBeHere) {
              // 再验证一下：填了num之后，剩余和值是否能被其他格子凑出来
              const canRest = this._canFillSum(remaining - num, 
                otherCells.map(([rr, cc]) => {
                  const s = new Set(this.candidates[rr][cc]);
                  s.delete(num);
                  return s;
                }),
                placed
              );
              
              if (canRest) {
                return { row: r, col: c, num };
              }
            }
          }
        }
      }
    }
    return null;
  }
  
  // 检查一组格子能否凑出指定和值
  _canFillSum(target, candSets, exclude) {
    if (target < 0) return false;
    if (candSets.length === 0) return target === 0;
    
    const [first, ...rest] = candSets;
    for (const v of first) {
      if (exclude.has(v)) continue;
      const newExclude = new Set(exclude);
      newExclude.add(v);
      if (this._canFillSum(target - v, rest, newExclude)) {
        return true;
      }
    }
    return false;
  }
  
  // ==========================================
  // 3. 隐单
  // ==========================================
  _findHiddenSingle() {
    // 行
    for (let r = 0; r < SIZE; r++) {
      for (let n = 1; n <= 9; n++) {
        let count = 0;
        let pos = null;
        for (let c = 0; c < SIZE; c++) {
          if (this.grid[r][c] === n) { count = -1; break; }
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
            count++;
            pos = [r, c];
          }
        }
        if (count === 1) return { row: pos[0], col: pos[1], num: n };
      }
    }
    
    // 列
    for (let c = 0; c < SIZE; c++) {
      for (let n = 1; n <= 9; n++) {
        let count = 0;
        let pos = null;
        for (let r = 0; r < SIZE; r++) {
          if (this.grid[r][c] === n) { count = -1; break; }
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
            count++;
            pos = [r, c];
          }
        }
        if (count === 1) return { row: pos[0], col: pos[1], num: n };
      }
    }
    
    // 宫
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3;
      const bc = (b % 3) * 3;
      for (let n = 1; n <= 9; n++) {
        let count = 0;
        let pos = null;
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            const r = br + dr, c = bc + dc;
            if (this.grid[r][c] === n) { count = -1; dr = 3; dc = 3; break; }
            if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
              count++;
              pos = [r, c];
            }
          }
        }
        if (count === 1) return { row: pos[0], col: pos[1], num: n };
      }
    }
    
    return null;
  }
  
  // ==========================================
  // 4. 45法则
  // ==========================================
  _findRule45() {
    // 行溢出/不足
    for (let r = 0; r < SIZE; r++) {
      const rowCages = new Map(); // cage -> 该行中属于该笼子的格子数
      let rowSum = 0;
      
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] !== 0) {
          rowSum += this.grid[r][c];
        } else {
          const cage = this.cellCage[r * SIZE + c];
          if (cage) {
            if (!rowCages.has(cage)) rowCages.set(cage, []);
            rowCages.get(cage).push([r, c]);
          }
        }
      }
      
      // 找"突出"的笼子：只有一个格子在外面或里面
      // 简化版：找只有1个格子不在该行的笼子
      for (const [cage, cellsInRow] of rowCages) {
        const cellsOutOfRow = cage.cells.filter(([rr, cc]) => rr !== r);
        
        // 如果笼子只有1个格子在该行，其他都在外面
        if (cellsInRow.length === 1 && cellsOutOfRow.length > 0) {
          // 检查外面的格子是否都已填满
          let outSum = 0;
          let allFilled = true;
          for (const [rr, cc] of cellsOutOfRow) {
            if (this.grid[rr][cc] === 0) { allFilled = false; break; }
            outSum += this.grid[rr][cc];
          }
          if (!allFilled) continue;
          
          // 该行这格的值 = cage.sum - outSum
          const value = cage.sum - outSum;
          const [rr, cc] = cellsInRow[0];
          if (value >= 1 && value <= 9 && this.candidates[rr][cc].has(value)) {
            return { row: rr, col: cc, num: value };
          }
        }
      }
    }
    
    // 列同理
    for (let c = 0; c < SIZE; c++) {
      const colCages = new Map();
      
      for (let r = 0; r < SIZE; r++) {
        if (this.grid[r][c] === 0) {
          const cage = this.cellCage[r * SIZE + c];
          if (cage) {
            if (!colCages.has(cage)) colCages.set(cage, []);
            colCages.get(cage).push([r, c]);
          }
        }
      }
      
      for (const [cage, cellsInCol] of colCages) {
        const cellsOutOfCol = cage.cells.filter(([rr, cc]) => cc !== c);
        
        if (cellsInCol.length === 1 && cellsOutOfCol.length > 0) {
          let outSum = 0;
          let allFilled = true;
          for (const [rr, cc] of cellsOutOfCol) {
            if (this.grid[rr][cc] === 0) { allFilled = false; break; }
            outSum += this.grid[rr][cc];
          }
          if (!allFilled) continue;
          
          const value = cage.sum - outSum;
          const [rr, cc] = cellsInCol[0];
          if (value >= 1 && value <= 9 && this.candidates[rr][cc].has(value)) {
            return { row: rr, col: cc, num: value };
          }
        }
      }
    }
    
    // 宫同理
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3;
      const bc = (b % 3) * 3;
      const boxCages = new Map();
      
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const r = br + dr, c = bc + dc;
          if (this.grid[r][c] === 0) {
            const cage = this.cellCage[r * SIZE + c];
            if (cage) {
              if (!boxCages.has(cage)) boxCages.set(cage, []);
              boxCages.get(cage).push([r, c]);
            }
          }
        }
      }
      
      for (const [cage, cellsInBox] of boxCages) {
        const cellsOutOfBox = cage.cells.filter(([rr, cc]) => {
          return rr < br || rr >= br + 3 || cc < bc || cc >= bc + 3;
        });
        
        if (cellsInBox.length === 1 && cellsOutOfBox.length > 0) {
          let outSum = 0;
          let allFilled = true;
          for (const [rr, cc] of cellsOutOfBox) {
            if (this.grid[rr][cc] === 0) { allFilled = false; break; }
            outSum += this.grid[rr][cc];
          }
          if (!allFilled) continue;
          
          const value = cage.sum - outSum;
          const [rr, cc] = cellsInBox[0];
          if (value >= 1 && value <= 9 && this.candidates[rr][cc].has(value)) {
            return { row: rr, col: cc, num: value };
          }
        }
      }
    }
    
    return null;
  }
  
  // ==========================================
  // 5. 显性数对（只做候选数排除，不直接填数）
  // ==========================================
  _findNakedPair() {
    // 找出所有2候选的空格子
    const twoCands = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 2) {
          twoCands.push([r, c, [...this.candidates[r][c]].sort()]);
        }
      }
    }
    
    // 检查每行/列/宫中是否有相同的2候选对
    // 行
    for (let r = 0; r < SIZE; r++) {
      const rowPairs = twoCands.filter(([rr, cc]) => rr === r);
      for (let i = 0; i < rowPairs.length; i++) {
        for (let j = i + 1; j < rowPairs.length; j++) {
          const [, c1, cand1] = rowPairs[i];
          const [, c2, cand2] = rowPairs[j];
          if (cand1[0] === cand2[0] && cand1[1] === cand2[1]) {
            // 找到了显性数对！从该行其他格子移除这两个数字
            // 但我们的目标是填数，所以排除后检查有没有产生裸单/隐单
            // 这里简化：直接返回null，因为数对是排除技巧，不直接填数
            // 等等，我们需要先排除，然后重新从低级技巧检测
            // 但这个架构是"每次只填一个数"，所以数对排除后应该有后续步骤
            // 我们先实现排除，然后让外层循环重新检测
            
            // 但这里的设计是_applyTechnique返回一个可填的格子
            // 所以对于排除类技巧，我们应该：
            // 1. 执行排除
            // 2. 检查排除后是否产生了新的裸单/隐单
            // 3. 如果有，返回那个格子（但技巧还是标记为nakedPair）
            
            // 执行排除
            let eliminated = false;
            for (let cc = 0; cc < SIZE; cc++) {
              if (cc === c1 || cc === c2) continue;
              if (this.grid[r][cc] === 0) {
                if (this.candidates[r][cc].has(cand1[0])) {
                  this.candidates[r][cc].delete(cand1[0]);
                  eliminated = true;
                }
                if (this.candidates[r][cc].has(cand1[1])) {
                  this.candidates[r][cc].delete(cand1[1]);
                  eliminated = true;
                }
              }
            }
            
            if (eliminated) {
              // 排除后检查是否有新的裸单
              for (let cc = 0; cc < SIZE; cc++) {
                if (this.grid[r][cc] === 0 && this.candidates[r][cc].size === 1) {
                  const num = [...this.candidates[r][cc]][0];
                  return { row: r, col: cc, num };
                }
              }
            }
          }
        }
      }
    }
    
    // 列和宫同理，简化处理
    return null;
  }
  
  // ==========================================
  // 6. 隐性数对
  // ==========================================
  _findHiddenPair() {
    // 简化版：先不实现，返回null
    return null;
  }
  
  // ==========================================
  // 7. 区块排除
  // ==========================================
  _findPointingClaiming() {
    // 简化版：先不实现，返回null
    return null;
  }
  
  // ==========================================
  // 8. 三链数
  // ==========================================
  _findNakedTriplet() {
    return null;
  }
  
  // ==========================================
  // 9. X-Wing
  // ==========================================
  _findXWing() {
    return null;
  }
  
  // ==========================================
  // 填数并更新候选数
  // ==========================================
  _fillCell(row, col, num) {
    this.grid[row][col] = num;
    this.candidates[row][col] = new Set([num]);
    
    // 更新同行/列/宫的候选数
    for (let c = 0; c < SIZE; c++) {
      if (c !== col && this.grid[row][c] === 0) {
        this.candidates[row][c].delete(num);
      }
    }
    for (let r = 0; r < SIZE; r++) {
      if (r !== row && this.grid[r][col] === 0) {
        this.candidates[r][col].delete(num);
      }
    }
    const br = Math.floor(row / BOX) * BOX;
    const bc = Math.floor(col / BOX) * BOX;
    for (let dr = 0; dr < BOX; dr++) {
      for (let dc = 0; dc < BOX; dc++) {
        const r = br + dr, c = bc + dc;
        if ((r !== row || c !== col) && this.grid[r][c] === 0) {
          this.candidates[r][c].delete(num);
        }
      }
    }
    
    // 更新笼子约束
    const cage = this.cellCage[row * SIZE + col];
    if (cage) {
      const emptyCells = cage.cells.filter(([r, c]) => this.grid[r][c] === 0);
      const placed = new Set();
      let placedSum = 0;
      for (const [r, c] of cage.cells) {
        if (this.grid[r][c] !== 0) {
          placed.add(this.grid[r][c]);
          placedSum += this.grid[r][c];
        }
      }
      const remaining = cage.sum - placedSum;
      const count = emptyCells.length;
      
      if (count > 0) {
        const possibleNums = this._getPossibleNumbers(remaining, count, placed);
        for (const [r, c] of emptyCells) {
          const toRemove = [];
          for (const v of this.candidates[r][c]) {
            if (!possibleNums.has(v)) {
              toRemove.push(v);
            }
          }
          for (const v of toRemove) {
            this.candidates[r][c].delete(v);
          }
        }
      }
    }
  }
  
  // ==========================================
  // 获取评级结果
  // ==========================================
  getRating() {
    // 统计各技巧使用次数
    const techCount = {};
    let maxLevel = 0;
    let totalDepth = 0;
    
    for (const step of this.steps) {
      const tech = step.technique;
      techCount[tech] = (techCount[tech] || 0) + 1;
      maxLevel = Math.max(maxLevel, TECHNIQUES[tech].level);
      totalDepth += step.depth;
    }
    
    // 计算难度分数
    let score = 0;
    for (const tech of Object.keys(techCount)) {
      const count = techCount[tech];
      const level = TECHNIQUES[tech].level;
      score += count * level * 10;
    }
    
    // 加上推理深度加成
    score += totalDepth * 2;
    
    // 加上空格数基数
    const filledCount = this.steps.length;
    score += filledCount * 5;
    
    // 难度等级
    let level;
    if (maxLevel <= 1) level = '入门';
    else if (maxLevel <= 2) level = '简单';
    else if (maxLevel <= 3) level = '普通';
    else if (maxLevel <= 5) level = '困难';
    else if (maxLevel <= 7) level = '专家';
    else level = '地狱';
    
    // 检查是否完成
    let emptyCount = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0) emptyCount++;
      }
    }
    
    return {
      solvable: emptyCount === 0,
      level,
      score: Math.round(score),
      maxTechLevel: maxLevel,
      totalSteps: this.steps.length,
      remainingCells: emptyCount,
      techCount,
      totalDepth,
      cellTech: this.cellTech // 每个格子的最低所需技巧
    };
  }
}

// ==========================================
// 便捷函数：评级一道题
// ==========================================
function ratePuzzle(board, cages) {
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  const solver = new TechRaterSolver(board, normCages);
  solver.solve(500);
  return solver.getRating();
}

// ==========================================
// 计算残局的技巧密度
// ==========================================
function calcEndgameDensity(board, cages) {
  const result = ratePuzzle(board, cages);
  
  if (!result.solvable) return { ok: false, density: 0 };
  
  const empties = result.totalSteps; // 填了多少步 = 有多少空格
  
  // 计算"非裸单"技巧密度
  const nonTrivialSteps = this.steps.filter(s => s.technique !== 'nakedSingle').length;
  
  return {
    ok: true,
    density: nonTrivialSteps / empties,
    empties,
    techCount: result.techCount,
    maxLevel: result.maxTechLevel
  };
}

module.exports = {
  TechRaterSolver,
  ratePuzzle,
  calcEndgameDensity,
  TECHNIQUES,
  TECH_PRIORITY
};
