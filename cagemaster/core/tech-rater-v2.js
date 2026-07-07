// ==========================================
// Killer Sudoku 技巧评级求解器 v2
// ==========================================
// 核心原则：取"最低可用技巧"，而非"最快可解路径"
//
// v2改进：
// - 完整的星衡法则：行/列/宫的Innie/Outie检测
// - 笼子唯一组合：某数字只能出现在笼子的某一格
// - 并蒂锁检测（先排除再找孤星）
// ==========================================

const SIZE = 9;
const BOX = 3;

const TECHNIQUES = {
  nakedSingle:      { id: 'nakedSingle',      name: '孤星',       level: 1,  depth: 0 },
  cageUnique:       { id: 'cageUnique',       name: '唯一组合',    level: 2,  depth: 1 },
  hiddenSingle:     { id: 'hiddenSingle',     name: '隐曜',       level: 3,  depth: 1 },
  rule45:           { id: 'rule45',           name: '星衡法则',     level: 4,  depth: 2 },
  nakedPair:        { id: 'nakedPair',        name: '并蒂锁',   level: 5,  depth: 2 },
  hiddenPair:       { id: 'hiddenPair',       name: '双曜',   level: 6,  depth: 3 },
  pointingClaiming: { id: 'pointingClaiming', name: '区块排除',   level: 7,  depth: 3 },
  nakedTriplet:     { id: 'nakedTriplet',     name: '三子法',     level: 8,  depth: 3 },
  xWing:            { id: 'xWing',            name: '二连纵横阵',     level: 9,  depth: 4 },
  swordfish:        { id: 'swordfish',        name: '三才游鱼阵',   level: 10, depth: 5 },
  guess:            { id: 'guess',            name: '试数',       level: 11, depth: 6 }
};

const TECH_PRIORITY = [
  'nakedSingle',
  'cageUnique',
  'hiddenSingle',
  'rule45',
  'nakedPair',
  'hiddenPair',
  'pointingClaiming',
  'nakedTriplet',
  'xWing',
  'swordfish'
];

class TechRaterSolverV2 {
  constructor(board, cages) {
    this.grid = board.map(row => [...row]);
    this.cages = cages.map(c => ({
      id: c.id,
      sum: c.sum,
      cells: c.cells.map(([r, c]) => [r, c])
    }));
    
    this.cellCage = new Array(SIZE * SIZE);
    for (const cage of this.cages) {
      for (const [r, c] of cage.cells) {
        this.cellCage[r * SIZE + c] = cage;
      }
    }
    
    this.candidates = Array.from({length: SIZE}, () =>
      Array.from({length: SIZE}, () => new Set())
    );
    this._initCandidates();
    
    this.steps = [];
    this.cellTech = {};
  }
  
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
    this._applyBasicConstraints();
    this._applyCageConstraints();
  }
  
  _applyBasicConstraints() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0) continue;
        const v = this.grid[r][c];
        for (let cc = 0; cc < SIZE; cc++)
          if (cc !== c && this.grid[r][cc] === 0) this.candidates[r][cc].delete(v);
        for (let rr = 0; rr < SIZE; rr++)
          if (rr !== r && this.grid[rr][c] === 0) this.candidates[rr][c].delete(v);
        const br = Math.floor(r / BOX) * BOX, bc = Math.floor(c / BOX) * BOX;
        for (let dr = 0; dr < BOX; dr++)
          for (let dc = 0; dc < BOX; dc++) {
            const rr = br + dr, cc = bc + dc;
            if ((rr !== r || cc !== c) && this.grid[rr][cc] === 0)
              this.candidates[rr][cc].delete(v);
          }
      }
    }
  }
  
  _applyCageConstraints() {
    for (const cage of this.cages) {
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
      
      for (const [r, c] of emptyCells) {
        for (const v of placed) this.candidates[r][c].delete(v);
      }
      
      const possibleNums = this._getPossibleNumbers(remaining, emptyCount, placed);
      for (const [r, c] of emptyCells) {
        const toRemove = [];
        for (const v of this.candidates[r][c]) {
          if (!possibleNums.has(v)) toRemove.push(v);
        }
        for (const v of toRemove) this.candidates[r][c].delete(v);
      }
    }
  }
  
  _getPossibleNumbers(targetSum, count, excludeSet) {
    const result = new Set();
    this._combosHelper(targetSum, count, 1, new Set(), excludeSet, result);
    return result;
  }
  
  _combosHelper(target, count, start, current, exclude, result) {
    if (count === 0) {
      if (target === 0) for (const v of current) result.add(v);
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
  
  _canFillSum(target, candSets, exclude) {
    if (target < 0) return false;
    if (candSets.length === 0) return target === 0;
    const [first, ...rest] = candSets;
    for (const v of first) {
      if (exclude.has(v)) continue;
      const newExclude = new Set(exclude);
      newExclude.add(v);
      if (this._canFillSum(target - v, rest, newExclude)) return true;
    }
    return false;
  }
  
  // ==========================================
  // 主求解循环
  // ==========================================
  solve(maxSteps = 500) {
    let steps = 0;
    
    while (steps < maxSteps) {
      let madeProgress = false;
      
      // 按优先级顺序遍历所有技巧（保持原有的"最低可用技巧"策略）
      for (const techId of TECH_PRIORITY) {
        // 记录调用前的笔记总数（用于检测排除效果）
        const beforeCount = this._countTotalCandidates();
        
        const results = this._findAllByTechnique(techId);
        
        if (results.length > 0) {
          // 找到可填的格子 → 填数，记为 fill 步骤
          const result = results[0];
          this._fillCell(result.row, result.col, result.num, techId);
          this.steps.push({
            row: result.row,
            col: result.col,
            num: result.num,
            technique: techId,
            type: 'fill',
            depth: TECHNIQUES[techId].depth,
            evidence: result.evidence || null
          });
          this.cellTech[result.row * 9 + result.col] = techId;
          madeProgress = true;
          steps++;
          break;
        }
        
        // 没找到填数 → 检查是否有笔记被排除（排除类技巧的副作用）
        const afterCount = this._countTotalCandidates();
        const eliminated = beforeCount - afterCount;
        
        if (eliminated > 0) {
          // 有排除发生 → 记为 elimination 步骤
          this.steps.push({
            technique: techId,
            type: 'elimination',
            depth: TECHNIQUES[techId].depth,
            eliminatedCandidates: eliminated,
            evidence: { eliminatedCount: eliminated },
          });
          madeProgress = true;
          steps++;
          break; // 排除一步后立即 break，下一轮从最低级技巧重新开始
        }
      }
      
      if (!madeProgress) break; // 真的卡住了
      
      let emptyCount = 0;
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (this.grid[r][c] === 0) emptyCount++;
      if (emptyCount === 0) return { complete: true, steps: this.steps };
    }
    
    let emptyCount = 0;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.grid[r][c] === 0) emptyCount++;
    
    return { complete: false, steps: this.steps, remaining: emptyCount };
  }

  /**
   * 计算单个空格的影响力分数
   * 分数越高，填完这个格后对盘面的推动作用越大
   *
   * 维度及权重：
   * - 笼子剩余空格数倒数 (×0.35)：笼子越接近完成，填完越可能完成整个笼子
   * - 宫/行/列空白数倒数 (×0.25)：空白越少，填完后连锁反应越大
   * - 笔记倒数 (×0.15)：笔记越少越容易确定
   * - 是否涉及多个笼子交叉 (×0.15)：交叉点能同时推进多个笼子
   * - 是否触发星衡法则 (×0.10)：填完能让跨宫笼子的差值显现
   */
  _calcInfluence(r, c) {
    // 1. 笔记
    const candCount = Math.max(this.candidates[r][c].size, 1);
    const candScore = 1 / candCount;

    // 2. 行/列/宫空白数（取三者中最小的，即"最接近完成"的维度）
    let rowEmpty = 0, colEmpty = 0, boxEmpty = 0;
    for (let i = 0; i < SIZE; i++) {
      if (this.grid[r][i] === 0) rowEmpty++;
      if (this.grid[i][c] === 0) colEmpty++;
    }
    const br = Math.floor(r / BOX) * BOX;
    const bc = Math.floor(c / BOX) * BOX;
    for (let dr = 0; dr < BOX; dr++) {
      for (let dc = 0; dc < BOX; dc++) {
        if (this.grid[br + dr][bc + dc] === 0) boxEmpty++;
      }
    }
    const minEmpty = Math.min(rowEmpty, colEmpty, boxEmpty);
    const emptyScore = 1 / Math.max(minEmpty, 1);

    // 3. 笼子相关
    let cageScore = 0;
    let cageCrossScore = 0;
    let rule45Score = 0;

    const cage = this.cellCage[r * SIZE + c];
    if (cage) {
      // 计算笼子剩余空格数
      let cageEmpty = 0;
      let cageBoxSet = new Set();
      for (const [cr, cc] of cage.cells) {
        if (this.grid[cr][cc] === 0) cageEmpty++;
        const cbr = Math.floor(cr / BOX);
        const cbc = Math.floor(cc / BOX);
        cageBoxSet.add(`${cbr},${cbc}`);
      }
      cageScore = 1 / Math.max(cageEmpty, 1);

      // 星衡法则触发：跨宫笼子，且接近完成（只剩1-2格）
      if (cageBoxSet.size > 1 && cageEmpty <= 2) {
        rule45Score = 0.5 + (2 - cageEmpty) * 0.25;
      }

      // 多笼子交叉点（嵌套笼）
      // 检查是否有其他笼子也包含这个格子
      let cageCount = 0;
      for (const cg of this.cages) {
        for (const [cr, cc] of cg.cells) {
          if (cr === r && cc === c) {
            cageCount++;
            break;
          }
        }
      }
      cageCrossScore = cageCount > 1 ? 1 : 0;
    }

    // 加权求和
    const total =
      cageScore * 0.35 +
      emptyScore * 0.25 +
      candScore * 0.15 +
      cageCrossScore * 0.15 +
      rule45Score * 0.10;

    return total;
  }

  /**
   * 从多个提示结果中选影响力最高的
   */
  _pickMostInfluential(results) {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];

    let best = results[0];
    let bestScore = this._calcInfluence(best.row, best.col);

    for (let i = 1; i < results.length; i++) {
      const score = this._calcInfluence(results[i].row, results[i].col);
      if (score > bestScore) {
        bestScore = score;
        best = results[i];
      }
    }

    return best;
  }

  /**
   * 只查找下一步，不填入盘面
   * 返回 { row, col, num, technique, evidence } 或 null
   */
  findNextStep() {
    for (const techId of TECH_PRIORITY) {
      const allResults = this._findAllByTechnique(techId);
      if (allResults.length > 0) {
        const best = this._pickMostInfluential(allResults);
        return {
          row: best.row,
          col: best.col,
          num: best.num,
          technique: techId,
          depth: TECHNIQUES[techId].depth,
          evidence: best.evidence || null
        };
      }
    }
    return null;
  }

  /**
   * 收集某个技巧的所有结果
   * 返回结果数组（每个元素是 { row, col, num, evidence }）
   * 对于能确定答案的技巧（孤星、隐曜），收集所有结果后按影响力排序
   * 对于其他技巧，暂时返回第一个找到的（单元素数组）
   */
  _findAllByTechnique(techId) {
    switch (techId) {
      case 'nakedSingle':     return this._findAllNakedSingles();
      case 'cageUnique': {
        const r = this._findCageUnique();
        return r ? [r] : [];
      }
      case 'hiddenSingle': {
        const r = this._findHiddenSingle();
        return r ? [r] : [];
      }
      case 'rule45': {
        const r = this._findRule45();
        return r ? [r] : [];
      }
      case 'nakedPair': {
        const r = this._findNakedPair();
        return r ? [r] : [];
      }
      case 'hiddenPair': {
        const r = this._findHiddenPair();
        return r ? [r] : [];
      }
      case 'pointingClaiming': {
        const r = this._findPointingClaiming();
        return r ? [r] : [];
      }
      case 'nakedTriplet': {
        const r = this._findNakedTriplet();
        return r ? [r] : [];
      }
      case 'xWing': {
        const r = this._findXWing();
        return r ? [r] : [];
      }
      case 'swordfish': {
        const r = this._findSwordfish();
        return r ? [r] : [];
      }
      default: return [];
    }
  }

  /**
   * [v5.0] 统计当前盘面上所有格子的笔记总数
   * 用于检测排除类技巧是否产生了实际效果
   */
  _countTotalCandidates() {
    let count = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0) {
          count += this.candidates[r][c].size;
        }
      }
    }
    return count;
  }

  /**
   * 收集所有孤星（笔记=1的格子）
   * 返回完整提示对象数组
   */
  _findAllNakedSingles() {
    const results = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 1) {
          const num = [...this.candidates[r][c]][0];

          // 收集行/列/宫中已有的数字
          const rowNumbers = [];
          const colNumbers = [];
          const boxNumbers = [];

          for (let cc = 0; cc < SIZE; cc++) {
            if (cc !== c && this.grid[r][cc] !== 0) rowNumbers.push({ r, c: cc, v: this.grid[r][cc] });
          }
          for (let rr = 0; rr < SIZE; rr++) {
            if (rr !== r && this.grid[rr][c] !== 0) colNumbers.push({ r: rr, c, v: this.grid[rr][c] });
          }
          const br = Math.floor(r / BOX) * BOX, bc = Math.floor(c / BOX) * BOX;
          for (let dr = 0; dr < BOX; dr++) {
            for (let dc = 0; dc < BOX; dc++) {
              const rr = br + dr, cc = bc + dc;
              if ((rr !== r || cc !== c) && this.grid[rr][cc] !== 0) {
                boxNumbers.push({ r: rr, c: cc, v: this.grid[rr][cc] });
              }
            }
          }

          const allSeen = new Set([
            ...rowNumbers.map(x => x.v),
            ...colNumbers.map(x => x.v),
            ...boxNumbers.map(x => x.v)
          ]);
          const eliminated = [];
          for (let n = 1; n <= 9; n++) {
            if (allSeen.has(n) && n !== num) eliminated.push(n);
          }

          // 收集笼子信息
          let cageInfo = null;
          const cage = this.cellCage[r * SIZE + c];
          if (cage) {
            const cageCells = cage.cells;
            const filledNums = [];
            const emptyCells = [];
            let filledSum = 0;
            for (const [cr, cc] of cageCells) {
              const v = this.grid[cr][cc];
              if (v > 0) {
                filledNums.push(v);
                filledSum += v;
              } else {
                emptyCells.push([cr, cc]);
              }
            }
            const remain = cage.sum - filledSum;

            const cageCombos = [];
            const filledSet = new Set(filledNums);
            this._findAllCombos(remain, emptyCells.length, 1, new Set(), filledSet, emptyCells, cageCombos);
            const cageCombosArr = cageCombos.map(s => [...s].sort((a, b) => a - b));

            cageInfo = {
              id: cage.id,
              sum: cage.sum,
              cells: cageCells,
              filledNums,
              filledSum,
              emptyCells,
              emptyCount: emptyCells.length,
              remain,
              combos: cageCombosArr
            };
          }

          results.push({
            row: r, col: c, num,
            evidence: {
              type: 'nakedSingle',
              targetCell: [r, c],
              targetValue: num,
              candidates: [...this.candidates[r][c]],
              rowNumbers,
              colNumbers,
              boxNumbers,
              eliminated,
              allSeenCount: allSeen.size,
              cage: cageInfo
            }
          });
        }
      }
    }
    return results;
  }

  // 1. 孤星
  _findNakedSingle() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 1) {
          const num = [...this.candidates[r][c]][0];
          
          // 收集行/列/宫中已有的数字（用于展示推导过程）
          const rowNumbers = [];
          const colNumbers = [];
          const boxNumbers = [];
          
          for (let cc = 0; cc < SIZE; cc++) {
            if (cc !== c && this.grid[r][cc] !== 0) rowNumbers.push({ r, c: cc, v: this.grid[r][cc] });
          }
          for (let rr = 0; rr < SIZE; rr++) {
            if (rr !== r && this.grid[rr][c] !== 0) colNumbers.push({ r: rr, c, v: this.grid[rr][c] });
          }
          const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
          for (let dr = 0; dr < 3; dr++) {
            for (let dc = 0; dc < 3; dc++) {
              const rr = br + dr, cc = bc + dc;
              if ((rr !== r || cc !== c) && this.grid[rr][cc] !== 0) {
                boxNumbers.push({ r: rr, c: cc, v: this.grid[rr][cc] });
              }
            }
          }
          
          // 计算被排除的笔记
          const allSeen = new Set([
            ...rowNumbers.map(x => x.v),
            ...colNumbers.map(x => x.v),
            ...boxNumbers.map(x => x.v)
          ]);
          const eliminated = [];
          for (let n = 1; n <= 9; n++) {
            if (allSeen.has(n) && n !== num) eliminated.push(n);
          }
          
          // 收集笼子信息（用于展示推导过程）
          let cageInfo = null;
          const cage = this.cellCage[r * SIZE + c];
          if (cage) {
            const cageCells = cage.cells;
            const filledNums = [];
            const emptyCells = [];
            let filledSum = 0;
            for (const [cr, cc] of cageCells) {
              const v = this.grid[cr][cc];
              if (v > 0) {
                filledNums.push(v);
                filledSum += v;
              } else {
                emptyCells.push([cr, cc]);
              }
            }
            const remain = cage.sum - filledSum;
            
            // 计算笼子的可能组合
            const cageCombos = [];
            const filledSet = new Set(filledNums);
            this._findAllCombos(remain, emptyCells.length, 1, new Set(), filledSet, emptyCells, cageCombos);
            // 转换为排序后的数组格式
            const cageCombosArr = cageCombos.map(s => [...s].sort((a, b) => a - b));
            
            cageInfo = {
              id: cage.id,
              sum: cage.sum,
              cells: cageCells,
              filledNums,
              filledSum,
              emptyCells,
              emptyCount: emptyCells.length,
              remain,
              combos: cageCombosArr
            };
          }
          
          return {
            row: r, col: c, num,
            evidence: {
              type: 'nakedSingle',
              targetCell: [r, c],
              targetValue: num,
              candidates: [...this.candidates[r][c]],
              rowNumbers,      // 行中已有的数字 [{r,c,v}]
              colNumbers,      // 列中已有的数字
              boxNumbers,      // 宫中已有的数字
              eliminated,      // 被排除的数字列表
              allSeenCount: allSeen.size,  // 总共看到了几个不同的数字
              cage: cageInfo   // 笼子信息
            }
          };
        }
    return null;
  }
  
  // 2. 笼子唯一组合
  _findCageUnique() {
    for (const cage of this.cages) {
      const emptyCells = [];
      const placed = new Set();
      let placedSum = 0;
      const placedNums = [];
      
      for (const [r, c] of cage.cells) {
        if (this.grid[r][c] !== 0) {
          placed.add(this.grid[r][c]);
          placedSum += this.grid[r][c];
          placedNums.push(this.grid[r][c]);
        } else {
          emptyCells.push([r, c]);
        }
      }
      
      if (emptyCells.length <= 1) continue;
      
      const remaining = cage.sum - placedSum;
      const count = emptyCells.length;
      
      // 找出所有可能的数字组合（考虑候选约束）
      const allCombos = [];
      this._findAllCombos(remaining, count, 1, new Set(), placed, emptyCells, allCombos);
      
      if (allCombos.length === 0) continue;
      
      // 找出"必须出现"的数字（在所有组合中都出现）
      const mustHave = new Set();
      for (let num = 1; num <= 9; num++) {
        if (placed.has(num)) continue;
        let inAll = true;
        for (const combo of allCombos) {
          if (!combo.has(num)) { inAll = false; break; }
        }
        if (inAll) mustHave.add(num);
      }
      
      // 对于每个"必须出现"的数字，检查它只在一个格子的候选中出现
      for (const num of mustHave) {
        let posCount = 0;
        let pos = null;
        const otherEmptyCells = [];
        for (const [r, c] of emptyCells) {
          if (this.candidates[r][c].has(num)) {
            posCount++;
            pos = [r, c];
          } else {
            otherEmptyCells.push([r, c]);
          }
        }
        if (posCount === 1) {
          // 收集组合数组（转为排序数组格式，便于展示）
          const combosArray = allCombos.map(s => {
            const arr = Array.from(s);
            arr.sort((a, b) => a - b);
            return arr;
          });
          
          // 收集目标格的行/列/宫已填数字（用于解释为什么这格能放而其他格不能放）
          const [tr, tc] = pos;
          const rowNumbers = [];
          const colNumbers = [];
          const boxNumbers = [];
          const boxW = 3, boxH = 3;
          const boxR = Math.floor(tr / boxH) * boxH;
          const boxC = Math.floor(tc / boxW) * boxW;
          
          for (let i = 0; i < SIZE; i++) {
            if (this.grid[tr][i] !== 0) rowNumbers.push({ r: tr, c: i, v: this.grid[tr][i] });
            if (this.grid[i][tc] !== 0) colNumbers.push({ r: i, c: tc, v: this.grid[i][tc] });
          }
          for (let dr = 0; dr < boxH; dr++) {
            for (let dc = 0; dc < boxW; dc++) {
              const r = boxR + dr, c = boxC + dc;
              if (this.grid[r][c] !== 0) boxNumbers.push({ r, c, v: this.grid[r][c] });
            }
          }
          
          // 收集其他空格为什么不能放num的原因
          const otherCellReasons = [];
          for (const [r, c] of otherEmptyCells) {
            const reasons = [];
            // 检查行排除
            let inRow = false;
            for (let i = 0; i < SIZE; i++) {
              if (this.grid[r][i] === num) { inRow = true; break; }
            }
            if (inRow) reasons.push('行');
            // 检查列排除
            let inCol = false;
            for (let i = 0; i < SIZE; i++) {
              if (this.grid[i][c] === num) { inCol = true; break; }
            }
            if (inCol) reasons.push('列');
            // 检查宫排除
            const br = Math.floor(r / boxH) * boxH;
            const bc = Math.floor(c / boxW) * boxW;
            let inBox = false;
            for (let dr = 0; dr < boxH; dr++) {
              for (let dc = 0; dc < boxW; dc++) {
                if (this.grid[br + dr][bc + dc] === num) { inBox = true; break; }
              }
              if (inBox) break;
            }
            if (inBox) reasons.push('宫');
            
            otherCellReasons.push({
              cell: [r, c],
              reasons: reasons.length > 0 ? reasons : ['候选约束']
            });
          }
          
          return {
            row: pos[0], col: pos[1], num,
            evidence: {
              type: 'cageUnique',
              cageId: cage.id,
              cageSum: cage.sum,
              cageCells: cage.cells.slice(),
              targetCell: pos,
              targetValue: num,
              mustHaveNum: num,
              comboCount: allCombos.length,
              combos: combosArray,
              filledNums: placedNums,
              filledSum: placedSum,
              remain: remaining,
              emptyCount: count,
              rowNumbers,
              colNumbers,
              boxNumbers,
              otherEmptyCells,
              otherCellReasons
            }
          };
        }
      }
    }
    return null;
  }
  
  // 找出笼子所有可能的数字组合（考虑候选约束）
  _findAllCombos(target, count, start, current, exclude, cells, result) {
    if (count === 0) {
      if (target === 0) {
        result.push(new Set(current));
      }
      return;
    }
    if (target <= 0 || start > 9) return;
    
    // 当前选哪个数字
    for (let v = start; v <= 9; v++) {
      if (exclude.has(v)) continue;
      if (v > target) break;
      
      // 检查是否有格子可以放v
      let canPlace = false;
      for (const [r, c] of cells) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
          canPlace = true;
          break;
        }
      }
      if (!canPlace) continue;
      
      current.add(v);
      this._findAllCombos(target - v, count - 1, v + 1, current, exclude, cells, result);
      current.delete(v);
    }
  }
  
  // 3. 隐曜
  _findHiddenSingle() {
    const boxW = 3, boxH = 3;
    
    // 行
    for (let r = 0; r < SIZE; r++) {
      for (let n = 1; n <= 9; n++) {
        let count = 0, pos = null;
        const possiblePositions = [];
        const eliminatedPositions = [];
        let alreadyPlaced = false;
        for (let c = 0; c < SIZE; c++) {
          if (this.grid[r][c] === n) { alreadyPlaced = true; break; }
          if (this.grid[r][c] === 0) {
            if (this.candidates[r][c].has(n)) {
              count++;
              pos = [r, c];
              possiblePositions.push([r, c]);
            } else {
              // 记录排除原因
              const reasons = [];
              // 列排除
              for (let rr = 0; rr < SIZE; rr++) {
                if (this.grid[rr][c] === n) { reasons.push('列'); break; }
              }
              // 宫排除
              const br = Math.floor(r / boxH) * boxH;
              const bc = Math.floor(c / boxW) * boxW;
              let inBox = false;
              for (let dr = 0; dr < boxH; dr++) {
                for (let dc = 0; dc < boxW; dc++) {
                  if (this.grid[br + dr][bc + dc] === n) { inBox = true; break; }
                }
                if (inBox) break;
              }
              if (inBox) reasons.push('宫');
              // 笼子和值排除（候选里没有但行列宫都没有的，就是笼子约束）
              if (reasons.length === 0) reasons.push('笼');
              
              eliminatedPositions.push({ cell: [r, c], reasons });
            }
          }
        }
        if (!alreadyPlaced && count === 1) {
          const rowFilled = [];
          for (let cc = 0; cc < SIZE; cc++) {
            if (this.grid[r][cc] !== 0) rowFilled.push({ r, c: cc, v: this.grid[r][cc] });
          }
          const scopeCells = [];
          for (let cc = 0; cc < SIZE; cc++) scopeCells.push([r, cc]);
          return {
            row: pos[0], col: pos[1], num: n,
            evidence: {
              type: 'hiddenSingle',
              scopeType: 'row',
              scopeIndex: r,
              targetCell: pos,
              targetValue: n,
              possiblePositions,
              eliminatedPositions,
              rowFilled,
              scopeCells,
              reason: `数字${n}在第${r+1}行只有一个可能位置`
            }
          };
        }
      }
    }
    // 列
    for (let c = 0; c < SIZE; c++) {
      for (let n = 1; n <= 9; n++) {
        let count = 0, pos = null;
        const possiblePositions = [];
        const eliminatedPositions = [];
        let alreadyPlaced = false;
        for (let r = 0; r < SIZE; r++) {
          if (this.grid[r][c] === n) { alreadyPlaced = true; break; }
          if (this.grid[r][c] === 0) {
            if (this.candidates[r][c].has(n)) {
              count++;
              pos = [r, c];
              possiblePositions.push([r, c]);
            } else {
              const reasons = [];
              // 行排除
              for (let cc = 0; cc < SIZE; cc++) {
                if (this.grid[r][cc] === n) { reasons.push('行'); break; }
              }
              // 宫排除
              const br = Math.floor(r / boxH) * boxH;
              const bc = Math.floor(c / boxW) * boxW;
              let inBox = false;
              for (let dr = 0; dr < boxH; dr++) {
                for (let dc = 0; dc < boxW; dc++) {
                  if (this.grid[br + dr][bc + dc] === n) { inBox = true; break; }
                }
                if (inBox) break;
              }
              if (inBox) reasons.push('宫');
              if (reasons.length === 0) reasons.push('笼');
              
              eliminatedPositions.push({ cell: [r, c], reasons });
            }
          }
        }
        if (!alreadyPlaced && count === 1) {
          const colFilled = [];
          for (let rr = 0; rr < SIZE; rr++) {
            if (this.grid[rr][c] !== 0) colFilled.push({ r: rr, c, v: this.grid[rr][c] });
          }
          const scopeCells = [];
          for (let rr = 0; rr < SIZE; rr++) scopeCells.push([rr, c]);
          return {
            row: pos[0], col: pos[1], num: n,
            evidence: {
              type: 'hiddenSingle',
              scopeType: 'col',
              scopeIndex: c,
              targetCell: pos,
              targetValue: n,
              possiblePositions,
              eliminatedPositions,
              colFilled,
              scopeCells,
              reason: `数字${n}在第${c+1}列只有一个可能位置`
            }
          };
        }
      }
    }
    // 宫
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
      for (let n = 1; n <= 9; n++) {
        let count = 0, pos = null;
        const possiblePositions = [];
        const eliminatedPositions = [];
        let alreadyPlaced = false;
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            const r = br + dr, c = bc + dc;
            if (this.grid[r][c] === n) { alreadyPlaced = true; dr = 3; dc = 3; break; }
            if (this.grid[r][c] === 0) {
              if (this.candidates[r][c].has(n)) {
                count++;
                pos = [r, c];
                possiblePositions.push([r, c]);
              } else {
                const reasons = [];
                // 行排除
                for (let cc = 0; cc < SIZE; cc++) {
                  if (this.grid[r][cc] === n) { reasons.push('行'); break; }
                }
                // 列排除
                for (let rr = 0; rr < SIZE; rr++) {
                  if (this.grid[rr][c] === n) { reasons.push('列'); break; }
                }
                if (reasons.length === 0) reasons.push('笼');
                
                eliminatedPositions.push({ cell: [r, c], reasons });
              }
            }
          }
        }
        if (!alreadyPlaced && count === 1) {
          const boxFilled = [];
          for (let dr = 0; dr < 3; dr++) {
            for (let dc = 0; dc < 3; dc++) {
              const r = br + dr, c = bc + dc;
              if (this.grid[r][c] !== 0) boxFilled.push({ r, c, v: this.grid[r][c] });
            }
          }
          const scopeCells = [];
          for (let dr = 0; dr < 3; dr++) {
            for (let dc = 0; dc < 3; dc++) {
              scopeCells.push([br + dr, bc + dc]);
            }
          }
          return {
            row: pos[0], col: pos[1], num: n,
            evidence: {
              type: 'hiddenSingle',
              scopeType: 'box',
              scopeIndex: b,
              targetCell: pos,
              targetValue: n,
              possiblePositions,
              eliminatedPositions,
              boxFilled,
              boxTopLeft: [br, bc],
              scopeCells,
              reason: `数字${n}在第${b+1}宫只有一个可能位置`
            }
          };
        }
      }
    }
    return null;
  }
  
  // 4. 真正的星衡法则（行/列/宫 + Innie/Outie）
  _findRule45() {
    // 行
    for (let r = 0; r < SIZE; r++) {
      const res = this._rule45ForScope(
        Array.from({length: SIZE}, (_, c) => [r, c]),
        'row', r
      );
      if (res) return res;
    }
    // 列
    for (let c = 0; c < SIZE; c++) {
      const res = this._rule45ForScope(
        Array.from({length: SIZE}, (_, r) => [r, c]),
        'col', c
      );
      if (res) return res;
    }
    // 宫
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
      const cells = [];
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
          cells.push([br + dr, bc + dc]);
      const res = this._rule45ForScope(cells, 'box', b);
      if (res) return res;
    }
    return null;
  }

  /**
   * 对一组9格的scope（行/列/宫）应用星衡法则。
   *
   * 原理：
   * - scope内9格之和 = 45
   * - 所有与scope相交的笼子的笼子和之和 = totalCageSum
   * - 这些笼子覆盖了：scope内全部9格 + scope外的一些格（outsides）
   * - 因此 totalCageSum = 45 + sum(outside格子的值)
   * - 即 sum(outside_values) = totalCageSum - 45
   *
   * Outie（单格外突）：
   * - 如果outside格中恰好1个空格 → 该格的值 = sum(outside_values) - outside已填和
   *
   * Innie（单格内突）：
   * - 另一种等价视角：考虑"完全在scope内的笼子"
   * - sum(完全在scope内的笼子) + sum(innie格的值) = 45
   * - innie格 = scope内不在"完全在scope内的笼子"中的格子
   * - 如果innie格中恰好1个空格 → 该格的值 = 45 - sum(完全在内的笼子) - innie已填和
   */
  _rule45ForScope(scopeCells, scopeType, scopeIndex) {
    const scopeKey = new Set(scopeCells.map(([r, c]) => r * SIZE + c));

    // 收集所有与scope相交的笼子
    const intersectingCages = new Set();
    for (const [r, c] of scopeCells) {
      const cage = this.cellCage[r * SIZE + c];
      if (cage) intersectingCages.add(cage);
    }

    // 计算 totalCageSum，并收集 allOutside（所有在scope外的相交笼子的格子）
    let totalCageSum = 0;
    const allOutside = []; // [[r,c], ...]
    const fullyInsideCages = []; // 笼子完全在scope内

    for (const cage of intersectingCages) {
      totalCageSum += cage.sum;
      let allInside = true;
      const outs = [];
      for (const [r, c] of cage.cells) {
        if (!scopeKey.has(r * SIZE + c)) {
          outs.push([r, c]);
          allInside = false;
        }
      }
      if (allInside) {
        fullyInsideCages.push(cage);
      } else {
        for (const cell of outs) allOutside.push(cell);
      }
    }

    // --- Outie 检测 ---
    // sum(outside_values) = totalCageSum - 45
    const sumOutsideValues = totalCageSum - 45;

    // 统计outside格中已填和、未填数
    let outsideFilledSum = 0;
    const outsideEmpty = [];
    for (const [r, c] of allOutside) {
      if (this.grid[r][c] !== 0) {
        outsideFilledSum += this.grid[r][c];
      } else {
        outsideEmpty.push([r, c]);
      }
    }

    // 恰好1个空格在outside → 单格Outie
    if (outsideEmpty.length === 1) {
      const value = sumOutsideValues - outsideFilledSum;
      const [r, c] = outsideEmpty[0];
      if (value >= 1 && value <= 9 && this.grid[r][c] === 0 &&
          this.candidates[r][c].has(value)) {
        return {
          row: r, col: c, num: value,
          evidence: {
            type: 'rule45',
            subtype: 'outie',
            scopeType: scopeType,
            scopeIndex: scopeIndex,
            scopeCells: scopeCells.slice(),
            intersectingCages: [...intersectingCages].map(c => c.id),
            totalCageSum: totalCageSum,
            sumOutsideValues: sumOutsideValues,
            outsideFilledSum: outsideFilledSum,
            outsideCells: allOutside.slice(),
            targetCell: [r, c],
            targetValue: value,
            formula: `${totalCageSum} - 45 - ${outsideFilledSum} = ${value}`
          }
        };
      }
    }

    // --- Innie 检测 ---
    // innie格 = scope中不在"完全在scope内的笼子"里的格子
    // 等价于：scope中属于"部分在scope外的笼子"的格子
    const fullyInsideCellKeys = new Set();
    for (const cage of fullyInsideCages) {
      for (const [r, c] of cage.cells) {
        fullyInsideCellKeys.add(r * SIZE + c);
      }
    }
    const innieCells = [];
    for (const [r, c] of scopeCells) {
      if (!fullyInsideCellKeys.has(r * SIZE + c)) {
        innieCells.push([r, c]);
      }
    }

    // sum(innie_values) = 45 - sum(完全在内的笼子)
    let sumFullyInside = 0;
    for (const cage of fullyInsideCages) sumFullyInside += cage.sum;
    const sumInnieValues = 45 - sumFullyInside;

    // 统计innie格中已填和、未填数
    let innieFilledSum = 0;
    const innieEmpty = [];
    for (const [r, c] of innieCells) {
      if (this.grid[r][c] !== 0) {
        innieFilledSum += this.grid[r][c];
      } else {
        innieEmpty.push([r, c]);
      }
    }

    // 恰好1个空格在innie → 单格Innie
    if (innieEmpty.length === 1) {
      const value = sumInnieValues - innieFilledSum;
      const [r, c] = innieEmpty[0];
      if (value >= 1 && value <= 9 && this.grid[r][c] === 0 &&
          this.candidates[r][c].has(value)) {
        return {
          row: r, col: c, num: value,
          evidence: {
            type: 'rule45',
            subtype: 'innie',
            scopeType: scopeType,
            scopeIndex: scopeIndex,
            scopeCells: scopeCells.slice(),
            fullyInsideCages: fullyInsideCages.map(c => c.id),
            sumFullyInside: sumFullyInside,
            sumInnieValues: sumInnieValues,
            innieFilledSum: innieFilledSum,
            innieCells: innieCells.slice(),
            targetCell: [r, c],
            targetValue: value,
            formula: `45 - ${sumFullyInside} - ${innieFilledSum} = ${value}`
          }
        };
      }
    }

    return null;
  }
  
  // 5. 并蒂锁
  _findNakedPair() {
    // 策略：找并蒂锁 → 真正从同区域其他格子的候选中删除这两个数字
    // 删除后，如果某个格子的笔记变为1，返回该格子作为填数结果（技巧标记为nakedPair）
    // 即使没有产生孤星，候选也已实际修改，下一轮的低级技巧也可能受益

    // 收集2笔记格子
    const twoCands = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 2)
          twoCands.push([r, c]);

    // 辅助：对一组格子，尝试用数对排除，返回第一个产生孤星的格子
    const eliminateFromCells = (cells, pairVals, pairCellsKey) => {
      let nakedSingleResult = null;
      let anyEliminated = false;

      for (const [r, c] of cells) {
        if (pairCellsKey.has(r * SIZE + c)) continue;
        if (this.grid[r][c] !== 0) continue;

        const cands = this.candidates[r][c];
        const beforeSize = cands.size;

        if (cands.has(pairVals[0])) cands.delete(pairVals[0]);
        if (cands.has(pairVals[1])) cands.delete(pairVals[1]);

        if (cands.size < beforeSize) {
          anyEliminated = true;
          if (cands.size === 1 && !nakedSingleResult) {
            nakedSingleResult = { row: r, col: c, num: [...cands][0] };
          }
        }
      }

      return { nakedSingleResult, anyEliminated };
    };

    // 行内检查
    for (let r = 0; r < SIZE; r++) {
      const rowPairs = twoCands.filter(([rr]) => rr === r);
      for (let i = 0; i < rowPairs.length; i++) {
        for (let j = i + 1; j < rowPairs.length; j++) {
          const [, c1] = rowPairs[i];
          const [, c2] = rowPairs[j];
          const cands1 = this.candidates[r][c1];
          const cands2 = this.candidates[r][c2];

          // 检查是否相同的2个候选
          if (cands1.size === 2 && cands2.size === 2 &&
              cands1.has([...cands2][0]) && cands1.has([...cands2][1])) {
            const pairVals = [...cands1];
            const pairKey = new Set([r * SIZE + c1, r * SIZE + c2]);
            const rowCells = Array.from({length: SIZE}, (_, cc) => [r, cc]);

            const result = eliminateFromCells(rowCells, pairVals, pairKey);
            if (result.nakedSingleResult) {
              return result.nakedSingleResult;
            }
          }
        }
      }
    }

    // 列内检查
    for (let c = 0; c < SIZE; c++) {
      const colPairs = twoCands.filter(([,cc]) => cc === c);
      for (let i = 0; i < colPairs.length; i++) {
        for (let j = i + 1; j < colPairs.length; j++) {
          const [r1] = colPairs[i];
          const [r2] = colPairs[j];
          const cands1 = this.candidates[r1][c];
          const cands2 = this.candidates[r2][c];

          if (cands1.size === 2 && cands2.size === 2 &&
              cands1.has([...cands2][0]) && cands1.has([...cands2][1])) {
            const pairVals = [...cands1];
            const pairKey = new Set([r1 * SIZE + c, r2 * SIZE + c]);
            const colCells = Array.from({length: SIZE}, (_, rr) => [rr, c]);

            const result = eliminateFromCells(colCells, pairVals, pairKey);
            if (result.nakedSingleResult) {
              return result.nakedSingleResult;
            }
          }
        }
      }
    }

    // 宫内检查
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
      const boxPairs = twoCands.filter(([r, c]) =>
        r >= br && r < br + 3 && c >= bc && c < bc + 3
      );

      for (let i = 0; i < boxPairs.length; i++) {
        for (let j = i + 1; j < boxPairs.length; j++) {
          const [r1, c1] = boxPairs[i];
          const [r2, c2] = boxPairs[j];
          const cands1 = this.candidates[r1][c1];
          const cands2 = this.candidates[r2][c2];

          if (cands1.size === 2 && cands2.size === 2 &&
              cands1.has([...cands2][0]) && cands1.has([...cands2][1])) {
            const pairVals = [...cands1];
            const pairKey = new Set([r1 * SIZE + c1, r2 * SIZE + c2]);
            const boxCells = [];
            for (let dr = 0; dr < 3; dr++)
              for (let dc = 0; dc < 3; dc++)
                boxCells.push([br + dr, bc + dc]);

            const result = eliminateFromCells(boxCells, pairVals, pairKey);
            if (result.nakedSingleResult) {
              return result.nakedSingleResult;
            }
          }
        }
      }
    }

    return null;
  }

  // 7. 双曜（Hidden Pair）
  // 在某行/列/宫中，某两个数字只出现在相同的两格中
  // 则这两格只能是这两个数字，可以排除其他候选
  _findHiddenPair() {
    const eliminateFromCells = (cells, pairVals, pairCellsKey) => {
      let nakedSingleResult = null;
      let anyEliminated = false;

      for (const [r, c] of cells) {
        if (!pairCellsKey.has(r * SIZE + c)) continue; // 只处理数对所在的格子
        if (this.grid[r][c] !== 0) continue;

        const cands = this.candidates[r][c];
        const beforeSize = cands.size;

        // 保留pairVals，删除其他所有候选
        for (const v of [...cands]) {
          if (v !== pairVals[0] && v !== pairVals[1]) {
            cands.delete(v);
          }
        }

        if (cands.size < beforeSize) {
          anyEliminated = true;
          if (cands.size === 1 && !nakedSingleResult) {
            nakedSingleResult = { row: r, col: c, num: [...cands][0] };
          }
        }
      }

      return { nakedSingleResult, anyEliminated };
    };

    // 行内检查
    for (let r = 0; r < SIZE; r++) {
      // 统计每个数字在该行出现的格子
      const numCells = {};
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] !== 0) continue;
        for (const n of this.candidates[r][c]) {
          if (!numCells[n]) numCells[n] = [];
          numCells[n].push([r, c]);
        }
      }

      // 找恰好出现在2格的数字
      const twoCellNums = Object.entries(numCells)
        .filter(([, cells]) => cells.length === 2)
        .map(([num, cells]) => ({ num: parseInt(num), cells }));

      // 找两个数字出现在相同的两格
      for (let i = 0; i < twoCellNums.length; i++) {
        for (let j = i + 1; j < twoCellNums.length; j++) {
          const a = twoCellNums[i];
          const b = twoCellNums[j];
          // 用Set比较是否是相同的两格
          const aSet = new Set(a.cells.map(([r, c]) => r * SIZE + c));
          const bSet = new Set(b.cells.map(([r, c]) => r * SIZE + c));
          let same = true;
          for (const k of aSet) if (!bSet.has(k)) { same = false; break; }
          if (same && aSet.size === 2) {
            const pairVals = [a.num, b.num];
            const pairKey = aSet;
            const rowCells = Array.from({length: SIZE}, (_, cc) => [r, cc]);

            const result = eliminateFromCells(rowCells, pairVals, pairKey);
            if (result.nakedSingleResult) {
              return result.nakedSingleResult;
            }
          }
        }
      }
    }

    // 列内检查
    for (let c = 0; c < SIZE; c++) {
      const numCells = {};
      for (let r = 0; r < SIZE; r++) {
        if (this.grid[r][c] !== 0) continue;
        for (const n of this.candidates[r][c]) {
          if (!numCells[n]) numCells[n] = [];
          numCells[n].push([r, c]);
        }
      }

      const twoCellNums = Object.entries(numCells)
        .filter(([, cells]) => cells.length === 2)
        .map(([num, cells]) => ({ num: parseInt(num), cells }));

      for (let i = 0; i < twoCellNums.length; i++) {
        for (let j = i + 1; j < twoCellNums.length; j++) {
          const a = twoCellNums[i];
          const b = twoCellNums[j];
          const aSet = new Set(a.cells.map(([r, c]) => r * SIZE + c));
          const bSet = new Set(b.cells.map(([r, c]) => r * SIZE + c));
          let same = true;
          for (const k of aSet) if (!bSet.has(k)) { same = false; break; }
          if (same && aSet.size === 2) {
            const pairVals = [a.num, b.num];
            const pairKey = aSet;
            const colCells = Array.from({length: SIZE}, (_, rr) => [rr, c]);

            const result = eliminateFromCells(colCells, pairVals, pairKey);
            if (result.nakedSingleResult) {
              return result.nakedSingleResult;
            }
          }
        }
      }
    }

    // 宫内检查
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;

      const numCells = {};
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const r = br + dr, c = bc + dc;
          if (this.grid[r][c] !== 0) continue;
          for (const n of this.candidates[r][c]) {
            if (!numCells[n]) numCells[n] = [];
            numCells[n].push([r, c]);
          }
        }
      }

      const twoCellNums = Object.entries(numCells)
        .filter(([, cells]) => cells.length === 2)
        .map(([num, cells]) => ({ num: parseInt(num), cells }));

      for (let i = 0; i < twoCellNums.length; i++) {
        for (let j = i + 1; j < twoCellNums.length; j++) {
          const a = twoCellNums[i];
          const b = twoCellNums[j];
          // 检查是否是相同的两格
          const aSet = new Set(a.cells.map(([r, c]) => r * SIZE + c));
          const bSet = new Set(b.cells.map(([r, c]) => r * SIZE + c));
          let same = true;
          for (const k of aSet) if (!bSet.has(k)) { same = false; break; }
          if (same && aSet.size === 2) {
            const pairVals = [a.num, b.num];
            const pairKey = aSet;
            const boxCells = [];
            for (let dr = 0; dr < 3; dr++)
              for (let dc = 0; dc < 3; dc++)
                boxCells.push([br + dr, bc + dc]);

            const result = eliminateFromCells(boxCells, pairVals, pairKey);
            if (result.nakedSingleResult) {
              return result.nakedSingleResult;
            }
          }
        }
      }
    }

    return null;
  }

  // 8. 区块排除法（Pointing & Claiming）
  // Pointing: 某数字在某宫只出现在同一行/列 → 从该行/列其他宫排除
  // Claiming: 某数字在某行/列只出现在同一宫 → 从该宫其他行/列排除
  _findPointingClaiming() {
    let anyEliminated = false;
    let nakedSingleResult = null;

    const eliminateFromCell = (r, c, val) => {
      if (this.grid[r][c] !== 0) return;
      const cands = this.candidates[r][c];
      if (cands.has(val)) {
        cands.delete(val);
        anyEliminated = true;
        if (cands.size === 1 && !nakedSingleResult) {
          nakedSingleResult = { row: r, col: c, num: [...cands][0] };
        }
      }
    };

    // Pointing Pair（宫→行/列）
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3;
      const bc = (b % 3) * 3;

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

      for (const n of Object.keys(numRows)) {
        const val = parseInt(n);
        // Pointing Row：数字在宫中只出现在同一行
        if (numRows[n].size === 1) {
          const r = [...numRows[n]][0];
          // 从该行的其他宫中移除
          for (let c = 0; c < 9; c++) {
            if (c >= bc && c < bc + 3) continue;
            eliminateFromCell(r, c, val);
          }
          if (nakedSingleResult) return nakedSingleResult;
        }
        // Pointing Column：数字在宫中只出现在同一列
        if (numCols[n].size === 1) {
          const c = [...numCols[n]][0];
          for (let r = 0; r < 9; r++) {
            if (r >= br && r < br + 3) continue;
            eliminateFromCell(r, c, val);
          }
          if (nakedSingleResult) return nakedSingleResult;
        }
      }
    }

    // Claiming Pair（行/列→宫）
    // 行→宫
    for (let r = 0; r < SIZE; r++) {
      const numBoxes = {};
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] !== 0) continue;
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        for (const n of this.candidates[r][c]) {
          if (!numBoxes[n]) numBoxes[n] = new Set();
          numBoxes[n].add(b);
        }
      }

      for (const n of Object.keys(numBoxes)) {
        const val = parseInt(n);
        if (numBoxes[n].size === 1) {
          const b = [...numBoxes[n]][0];
          const br = Math.floor(b / 3) * 3;
          const bc = (b % 3) * 3;
          // 从该宫的其他行移除
          for (let dr = 0; dr < 3; dr++) {
            const rr = br + dr;
            if (rr === r) continue;
            for (let dc = 0; dc < 3; dc++) {
              const cc = bc + dc;
              eliminateFromCell(rr, cc, val);
            }
          }
          if (nakedSingleResult) return nakedSingleResult;
        }
      }
    }

    // 列→宫
    for (let c = 0; c < SIZE; c++) {
      const numBoxes = {};
      for (let r = 0; r < SIZE; r++) {
        if (this.grid[r][c] !== 0) continue;
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        for (const n of this.candidates[r][c]) {
          if (!numBoxes[n]) numBoxes[n] = new Set();
          numBoxes[n].add(b);
        }
      }

      for (const n of Object.keys(numBoxes)) {
        const val = parseInt(n);
        if (numBoxes[n].size === 1) {
          const b = [...numBoxes[n]][0];
          const br = Math.floor(b / 3) * 3;
          const bc = (b % 3) * 3;
          // 从该宫的其他列移除
          for (let dc = 0; dc < 3; dc++) {
            const cc = bc + dc;
            if (cc === c) continue;
            for (let dr = 0; dr < 3; dr++) {
              const rr = br + dr;
              eliminateFromCell(rr, cc, val);
            }
          }
          if (nakedSingleResult) return nakedSingleResult;
        }
      }
    }

    return null;
  }

  // 9. 三子法（Naked Triplet）
  // 在某行/列/宫中，三个格子的笔记恰好是三个数字的子集
  // 则这三个数字只能在这三格中，可以从其他格子排除
  _findNakedTriplet() {
    const eliminateFromCells = (cells, tripletVals, tripletCellsKey) => {
      let nakedSingleResult = null;
      let anyEliminated = false;

      for (const [r, c] of cells) {
        if (tripletCellsKey.has(r * SIZE + c)) continue;
        if (this.grid[r][c] !== 0) continue;

        const cands = this.candidates[r][c];
        const beforeSize = cands.size;

        for (const v of tripletVals) {
          cands.delete(v);
        }

        if (cands.size < beforeSize) {
          anyEliminated = true;
          if (cands.size === 1 && !nakedSingleResult) {
            nakedSingleResult = { row: r, col: c, num: [...cands][0] };
          }
        }
      }

      return { nakedSingleResult, anyEliminated };
    };

    // 检查三个格子的候选是否是某三个数字的子集
    const isTriplet = (cands1, cands2, cands3) => {
      const union = new Set([...cands1, ...cands2, ...cands3]);
      return union.size === 3;
    };

    // 行内检查
    for (let r = 0; r < SIZE; r++) {
      const rowCands = [];
      for (let c = 0; c < SIZE; c++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size >= 2 && this.candidates[r][c].size <= 3) {
          rowCands.push([r, c]);
        }
      }

      for (let i = 0; i < rowCands.length; i++) {
        for (let j = i + 1; j < rowCands.length; j++) {
          for (let k = j + 1; k < rowCands.length; k++) {
            const [, c1] = rowCands[i];
            const [, c2] = rowCands[j];
            const [, c3] = rowCands[k];
            const cands1 = this.candidates[r][c1];
            const cands2 = this.candidates[r][c2];
            const cands3 = this.candidates[r][c3];

            if (isTriplet(cands1, cands2, cands3)) {
              const tripletVals = [...new Set([...cands1, ...cands2, ...cands3])];
              const tripletKey = new Set([r * SIZE + c1, r * SIZE + c2, r * SIZE + c3]);
              const rowCells = Array.from({length: SIZE}, (_, cc) => [r, cc]);

              const result = eliminateFromCells(rowCells, tripletVals, tripletKey);
              if (result.nakedSingleResult) {
                return result.nakedSingleResult;
              }
            }
          }
        }
      }
    }

    // 列内检查
    for (let c = 0; c < SIZE; c++) {
      const colCands = [];
      for (let r = 0; r < SIZE; r++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size >= 2 && this.candidates[r][c].size <= 3) {
          colCands.push([r, c]);
        }
      }

      for (let i = 0; i < colCands.length; i++) {
        for (let j = i + 1; j < colCands.length; j++) {
          for (let k = j + 1; k < colCands.length; k++) {
            const [r1] = colCands[i];
            const [r2] = colCands[j];
            const [r3] = colCands[k];
            const cands1 = this.candidates[r1][c];
            const cands2 = this.candidates[r2][c];
            const cands3 = this.candidates[r3][c];

            if (isTriplet(cands1, cands2, cands3)) {
              const tripletVals = [...new Set([...cands1, ...cands2, ...cands3])];
              const tripletKey = new Set([r1 * SIZE + c, r2 * SIZE + c, r3 * SIZE + c]);
              const colCells = Array.from({length: SIZE}, (_, rr) => [rr, c]);

              const result = eliminateFromCells(colCells, tripletVals, tripletKey);
              if (result.nakedSingleResult) {
                return result.nakedSingleResult;
              }
            }
          }
        }
      }
    }

    // 宫内检查
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
      const boxCands = [];
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const r = br + dr, c = bc + dc;
          if (this.grid[r][c] === 0 && this.candidates[r][c].size >= 2 && this.candidates[r][c].size <= 3) {
            boxCands.push([r, c]);
          }
        }
      }

      for (let i = 0; i < boxCands.length; i++) {
        for (let j = i + 1; j < boxCands.length; j++) {
          for (let k = j + 1; k < boxCands.length; k++) {
            const [r1, c1] = boxCands[i];
            const [r2, c2] = boxCands[j];
            const [r3, c3] = boxCands[k];
            const cands1 = this.candidates[r1][c1];
            const cands2 = this.candidates[r2][c2];
            const cands3 = this.candidates[r3][c3];

            if (isTriplet(cands1, cands2, cands3)) {
              const tripletVals = [...new Set([...cands1, ...cands2, ...cands3])];
              const tripletKey = new Set([r1 * SIZE + c1, r2 * SIZE + c2, r3 * SIZE + c3]);
              const boxCells = [];
              for (let dr = 0; dr < 3; dr++)
                for (let dc = 0; dc < 3; dc++)
                  boxCells.push([br + dr, bc + dc]);

              const result = eliminateFromCells(boxCells, tripletVals, tripletKey);
              if (result.nakedSingleResult) {
                return result.nakedSingleResult;
              }
            }
          }
        }
      }
    }

    return null;
  }
  
  // 10. 二连纵横阵
  // 对于某个数字，如果在两行中该数字都只出现在相同的两个列上，
  // 则这4个格子构成二连纵横阵。该数字可以从这两列的其他行中排除（列二连纵横阵）。
  // 反之亦然（行二连纵横阵）。
  _findXWing() {
    // 辅助：从一组格子中排除指定数字
    const eliminateFromCells = (cells, num, excludeKey) => {
      let nakedSingleResult = null;
      let anyEliminated = false;

      for (const [r, c] of cells) {
        if (excludeKey.has(r * SIZE + c)) continue;
        if (this.grid[r][c] !== 0) continue;

        const cands = this.candidates[r][c];
        const beforeSize = cands.size;

        if (cands.has(num)) cands.delete(num);

        if (cands.size < beforeSize) {
          anyEliminated = true;
          if (cands.size === 1 && !nakedSingleResult) {
            nakedSingleResult = { row: r, col: c, num: [...cands][0] };
          }
        }
      }

      return { nakedSingleResult, anyEliminated };
    };

    // === 列二连纵横阵 ===
    // 数字n在某两行都只出现在相同的两列 → 从这两列的其他行排除n
    for (let n = 1; n <= 9; n++) {
      // 每行中n出现在哪些列
      const rowCols = {};
      for (let r = 0; r < SIZE; r++) {
        const cols = [];
        for (let c = 0; c < SIZE; c++) {
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
            cols.push(c);
          }
        }
        if (cols.length === 2) {
          rowCols[r] = cols.sort((a, b) => a - b);
        }
      }

      const rowEntries = Object.entries(rowCols);
      for (let i = 0; i < rowEntries.length; i++) {
        for (let j = i + 1; j < rowEntries.length; j++) {
          const r1 = parseInt(rowEntries[i][0]);
          const cols1 = rowEntries[i][1];
          const r2 = parseInt(rowEntries[j][0]);
          const cols2 = rowEntries[j][1];

          // 两行共享完全相同的两列
          if (cols1[0] === cols2[0] && cols1[1] === cols2[1]) {
            const [c1, c2] = cols1;
            // 二连纵横阵的4个格子不参与排除
            const excludeKey = new Set([
              r1 * SIZE + c1, r1 * SIZE + c2,
              r2 * SIZE + c1, r2 * SIZE + c2
            ]);

            // 从列c1的其他行排除n
            const col1Cells = Array.from({length: SIZE}, (_, rr) => [rr, c1]);
            const res1 = eliminateFromCells(col1Cells, n, excludeKey);
            if (res1.nakedSingleResult) return res1.nakedSingleResult;

            // 从列c2的其他行排除n
            const col2Cells = Array.from({length: SIZE}, (_, rr) => [rr, c2]);
            const res2 = eliminateFromCells(col2Cells, n, excludeKey);
            if (res2.nakedSingleResult) return res2.nakedSingleResult;
          }
        }
      }
    }

    // === 行二连纵横阵 ===
    // 数字n在某两列都只出现在相同的两行 → 从这两行的其他列排除n
    for (let n = 1; n <= 9; n++) {
      // 每列中n出现在哪些行
      const colRows = {};
      for (let c = 0; c < SIZE; c++) {
        const rows = [];
        for (let r = 0; r < SIZE; r++) {
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
            rows.push(r);
          }
        }
        if (rows.length === 2) {
          colRows[c] = rows.sort((a, b) => a - b);
        }
      }

      const colEntries = Object.entries(colRows);
      for (let i = 0; i < colEntries.length; i++) {
        for (let j = i + 1; j < colEntries.length; j++) {
          const c1 = parseInt(colEntries[i][0]);
          const rows1 = colEntries[i][1];
          const c2 = parseInt(colEntries[j][0]);
          const rows2 = colEntries[j][1];

          // 两列共享完全相同的两行
          if (rows1[0] === rows2[0] && rows1[1] === rows2[1]) {
            const [r1, r2] = rows1;
            // 二连纵横阵的4个格子不参与排除
            const excludeKey = new Set([
              r1 * SIZE + c1, r2 * SIZE + c1,
              r1 * SIZE + c2, r2 * SIZE + c2
            ]);

            // 从行r1的其他列排除n
            const row1Cells = Array.from({length: SIZE}, (_, cc) => [r1, cc]);
            const res1 = eliminateFromCells(row1Cells, n, excludeKey);
            if (res1.nakedSingleResult) return res1.nakedSingleResult;

            // 从行r2的其他列排除n
            const row2Cells = Array.from({length: SIZE}, (_, cc) => [r2, cc]);
            const res2 = eliminateFromCells(row2Cells, n, excludeKey);
            if (res2.nakedSingleResult) return res2.nakedSingleResult;
          }
        }
      }
    }

    return null;
  }
  
  // 11. Swordfish（三才游鱼阵）
  // 二连纵横阵 的三行三列推广：对于某个数字，如果在三行中该数字都只出现在相同的三列上，
  // 则这 9 个格子构成 Swordfish。该数字可以从这三列的其他行中排除（列 Swordfish）。
  // 反之亦然（行 Swordfish）。
  // 注意：每行/每列中该数字不一定出现在全部 3 个位置，只要都限制在这 3 列/行内即可（2 或 3 个位置）。
  _findSwordfish() {
    // 辅助：从一组格子中排除指定数字
    const eliminateFromCells = (cells, num, excludeKey) => {
      let nakedSingleResult = null;
      let anyEliminated = false;

      for (const [r, c] of cells) {
        if (excludeKey.has(r * SIZE + c)) continue;
        if (this.grid[r][c] !== 0) continue;

        const cands = this.candidates[r][c];
        const beforeSize = cands.size;

        if (cands.has(num)) cands.delete(num);

        if (cands.size < beforeSize) {
          anyEliminated = true;
          if (cands.size === 1 && !nakedSingleResult) {
            nakedSingleResult = { row: r, col: c, num: [...cands][0] };
          }
        }
      }

      return { nakedSingleResult, anyEliminated };
    };

    // 生成组合（从 arr 中选 k 个的所有组合）
    const combinations = (arr, k) => {
      const result = [];
      const combo = [];
      const helper = (start) => {
        if (combo.length === k) {
          result.push([...combo]);
          return;
        }
        for (let i = start; i < arr.length; i++) {
          combo.push(arr[i]);
          helper(i + 1);
          combo.pop();
        }
      };
      helper(0);
      return result;
    };

    // === 列 Swordfish ===
    // 数字 n 在某三行中都只出现在相同的三列（或其子集）→ 从这三列的其他行排除 n
    for (let n = 1; n <= 9; n++) {
      // 每行中 n 出现在哪些列
      const rowColsMap = {};
      for (let r = 0; r < SIZE; r++) {
        const cols = [];
        for (let c = 0; c < SIZE; c++) {
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
            cols.push(c);
          }
        }
        // Swordfish 要求每行候选位置数在 2-3 之间，且都属于同一 3 列集合
        if (cols.length >= 2 && cols.length <= 3) {
          rowColsMap[r] = cols.sort((a, b) => a - b);
        }
      }

      const rowsWithFew = Object.keys(rowColsMap).map(Number);
      if (rowsWithFew.length < 3) continue;

      // 枚举所有 3 行组合
      const rowCombos = combinations(rowsWithFew, 3);
      for (const [r1, r2, r3] of rowCombos) {
        const cols1 = rowColsMap[r1];
        const cols2 = rowColsMap[r2];
        const cols3 = rowColsMap[r3];

        // 合并所有出现的列，看是否恰好为 3 列
        const allCols = new Set([...cols1, ...cols2, ...cols3]);
        if (allCols.size !== 3) continue;

        const colArr = [...allCols].sort((a, b) => a - b);
        const [c1, c2, c3] = colArr;

        // Swordfish 的 9 个格子不参与排除（实际只有有候选的那些）
        const excludeKey = new Set();
        for (const r of [r1, r2, r3]) {
          for (const c of colArr) {
            if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
              excludeKey.add(r * SIZE + c);
            }
          }
        }

        // 从这三列的其他行排除 n
        let foundSingle = null;
        for (const cc of colArr) {
          const colCells = Array.from({ length: SIZE }, (_, rr) => [rr, cc]);
          const res = eliminateFromCells(colCells, n, excludeKey);
          if (res.nakedSingleResult) {
            foundSingle = res.nakedSingleResult;
            break;
          }
        }
        if (foundSingle) return foundSingle;
      }
    }

    // === 行 Swordfish ===
    // 数字 n 在某三列中都只出现在相同的三行（或其子集）→ 从这三行的其他列排除 n
    for (let n = 1; n <= 9; n++) {
      // 每列中 n 出现在哪些行
      const colRowsMap = {};
      for (let c = 0; c < SIZE; c++) {
        const rows = [];
        for (let r = 0; r < SIZE; r++) {
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
            rows.push(r);
          }
        }
        if (rows.length >= 2 && rows.length <= 3) {
          colRowsMap[c] = rows.sort((a, b) => a - b);
        }
      }

      const colsWithFew = Object.keys(colRowsMap).map(Number);
      if (colsWithFew.length < 3) continue;

      // 枚举所有 3 列组合
      const colCombos = combinations(colsWithFew, 3);
      for (const [c1, c2, c3] of colCombos) {
        const rows1 = colRowsMap[c1];
        const rows2 = colRowsMap[c2];
        const rows3 = colRowsMap[c3];

        // 合并所有出现的行，看是否恰好为 3 行
        const allRows = new Set([...rows1, ...rows2, ...rows3]);
        if (allRows.size !== 3) continue;

        const rowArr = [...allRows].sort((a, b) => a - b);
        const [r1, r2, r3] = rowArr;

        // Swordfish 的格子不参与排除
        const excludeKey = new Set();
        for (const c of [c1, c2, c3]) {
          for (const r of rowArr) {
            if (this.grid[r][c] === 0 && this.candidates[r][c].has(n)) {
              excludeKey.add(r * SIZE + c);
            }
          }
        }

        // 从这三行的其他列排除 n
        let foundSingle = null;
        for (const rr of rowArr) {
          const rowCells = Array.from({ length: SIZE }, (_, cc) => [rr, cc]);
          const res = eliminateFromCells(rowCells, n, excludeKey);
          if (res.nakedSingleResult) {
            foundSingle = res.nakedSingleResult;
            break;
          }
        }
        if (foundSingle) return foundSingle;
      }
    }

    return null;
  }
  
  // ==========================================
  // 填数并更新
  // ==========================================
  _fillCell(row, col, num) {
    this.grid[row][col] = num;
    this.candidates[row][col] = new Set([num]);
    
    // 同行
    for (let c = 0; c < SIZE; c++) {
      if (c !== col && this.grid[row][c] === 0) {
        this.candidates[row][c].delete(num);
      }
    }
    // 同列
    for (let r = 0; r < SIZE; r++) {
      if (r !== row && this.grid[r][col] === 0) {
        this.candidates[r][col].delete(num);
      }
    }
    // 同宫
    const br = Math.floor(row / BOX) * BOX, bc = Math.floor(col / BOX) * BOX;
    for (let dr = 0; dr < BOX; dr++) {
      for (let dc = 0; dc < BOX; dc++) {
        const r = br + dr, c = bc + dc;
        if ((r !== row || c !== col) && this.grid[r][c] === 0) {
          this.candidates[r][c].delete(num);
        }
      }
    }
    
    // 笼子约束
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
      if (emptyCells.length > 0) {
        const possibleNums = this._getPossibleNumbers(remaining, emptyCells.length, placed);
        for (const [r, c] of emptyCells) {
          const toRemove = [];
          for (const v of this.candidates[r][c]) {
            if (!possibleNums.has(v)) toRemove.push(v);
          }
          for (const v of toRemove) this.candidates[r][c].delete(v);
        }
      }
    }
  }
  
  // ==========================================
  // 获取评级结果
  // ==========================================
  getRating() {
    const techCount = {};
    let maxLevel = 0;
    let totalDepth = 0;
    
    for (const step of this.steps) {
      const tech = step.technique;
      techCount[tech] = (techCount[tech] || 0) + 1;
      maxLevel = Math.max(maxLevel, TECHNIQUES[tech].level);
      totalDepth += step.depth;
    }
    
    // 剩余空格数
    let remainingCells = 0;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (this.grid[r][c] === 0) remainingCells++;
    
    // 非孤星比例
    const totalSteps = this.steps.length;
    const nakedSingleCount = techCount.nakedSingle || 0;
    const nonTrivialCount = totalSteps - nakedSingleCount;
    const nonTrivialRatio = totalSteps > 0 ? nonTrivialCount / totalSteps : 0;
    
    // === 综合难度分计算 (0-1000) ===
    
    // 1. 最高技巧等级基础分
    const baseScore = maxLevel * 100;
    
    // 2. 剩余空格修正因子
    let remainingFactor;
    if (remainingCells === 0) {
      remainingFactor = -1.0;       // 全解
    } else if (remainingCells <= 20) {
      remainingFactor = 0;          // 1~20
    } else if (remainingCells <= 40) {
      remainingFactor = 0.5;        // 21~40
    } else if (remainingCells <= 60) {
      remainingFactor = 1.0;        // 41~60
    } else {
      remainingFactor = 1.5;        // 61+
    }
    
    // 3. 技巧密度修正因子（非孤星比例）
    let densityFactor;
    if (nonTrivialRatio < 0.10) {
      densityFactor = -1.0;         // < 10%
    } else if (nonTrivialRatio < 0.20) {
      densityFactor = 0;            // 10% ~ 20%
    } else if (nonTrivialRatio < 0.30) {
      densityFactor = 0.5;          // 20% ~ 30%
    } else {
      densityFactor = 1.0;          // > 30%
    }
    
    // 综合难度分
    const score = Math.round(
      baseScore
      + remainingFactor * 100
      + densityFactor * 50
    );
    
    // === 5级难度划分 ===
    // 基于实际分数分布校准（分数范围100~700）
    let level;
    if (score < 250) {
      level = '1星';     // 入门：孤星为主，几乎不需要技巧
    } else if (score < 400) {
      level = '2星';     // 简单：需要基本笼子推理
    } else if (score < 525) {
      level = '3星';     // 进阶：需要隐曜/星衡法则等中级技巧
    } else if (score < 600) {
      level = '4星';     // 困难：需要数对技巧，有明显卡点
    } else {
      level = '5星';     // 专家：技巧密度高，卡点多
    }
    
    return {
      solvable: remainingCells === 0,
      level,
      score,
      maxTechLevel: maxLevel,
      totalSteps,
      remainingCells,
      nonTrivialRatio: Math.round(nonTrivialRatio * 1000) / 1000,
      techCount,
      totalDepth,
      cellTech: this.cellTech
    };
  }

  /**
   * [v5.0] 生成三阶段戏剧演出剧本（开局-破局-收官）
   * 
   * 顺水推舟策略：
   * 从 steps 中提取最高级技巧作为破局点（不管是 fill 还是 elimination），
   * 破局点之后的所有 fill 步骤就是天然的多米诺级联序列。
   * 多米诺不需要算，它就是高级技巧破局后引发的雪崩现象。
   * 
   * @returns {Object|null} 三阶段剧本，无高级技巧则返回 null
   */
  getTriPhaseScript() {
    const steps = this.steps;
    if (!steps || steps.length === 0) return null;

    // 1. 找到最高级的步骤（技术卡点 / 破局点）
    //    取深度最高的第一步（如果有多个同深度，取第一个出现的）
    let breakPointIndex = -1;
    let breakStep = null;
    let maxDepth = -1;

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.depth > maxDepth) {
        maxDepth = s.depth;
        breakPointIndex = i;
        breakStep = s;
      }
    }

    // 深度为0（只有孤星）→ 纯基础技巧题，不生成三阶段剧本
    if (breakPointIndex === -1 || !breakStep || maxDepth <= 0) {
      return null;
    }

    // 2. 确定核心破局格和级联序列
    let coreMove;
    let cascadeStartIndex;

    if (breakStep.type === 'fill') {
      // 破局点本身就是 fill（如 nakedPair 排除后直接产生孤星）
      // → 这步就是"雪崩的第一块骨牌"，级联从下一步开始
      coreMove = { row: breakStep.row, col: breakStep.col, value: breakStep.num };
      cascadeStartIndex = breakPointIndex + 1;
    } else {
      // 破局点是 elimination（纯排除类技巧，如纯 二连纵横阵 排除）
      // → 核心格是之后第一个被填的格子，级联从再下一步开始
      const firstFillAfter = steps.slice(breakPointIndex + 1).find(s => s.type === 'fill');
      if (firstFillAfter) {
        coreMove = { row: firstFillAfter.row, col: firstFillAfter.col, value: firstFillAfter.num };
        cascadeStartIndex = breakPointIndex + 2; // 跳过 elimination 和第一个 fill
      } else {
        // 排除后没有可填的？不应该，说明题有问题
        return null;
      }
    }

    // 3. 破局点之后的所有 fill 步骤 → 天然多米诺级联序列
    const cascadeSteps = steps.slice(cascadeStartIndex).filter(s => s.type === 'fill');
    const cascadeSequence = cascadeSteps.map(s => ({
      row: s.row,
      col: s.col,
      value: s.num,
      cellId: s.row * 9 + s.col,
    }));

    // 4. 计算技巧关联高亮区域
    const highlightAxes = this._calcSkillHighlightAxes(breakStep.technique, coreMove);

    return {
      targetSkill: breakStep.technique,
      skillLevel: TECHNIQUES[breakStep.technique]?.level || 5,
      skillName: TECHNIQUES[breakStep.technique]?.name || breakStep.technique,
      breakPointIndex: breakPointIndex,
      breakPointType: breakStep.type, // 'fill' 或 'elimination'
      coreMove: {
        row: coreMove.row,
        col: coreMove.col,
        value: coreMove.value,
        cascadeCount: cascadeSequence.length,
        cascadeSequence: cascadeSequence,
      },
      highlightAxes: highlightAxes,
      totalCascadeCount: cascadeSequence.length,
    };
  }

  /**
   * [v5.0] 计算技巧关联的高亮轴线/区域
   * 用于被动教学模式下框选提示范围
   */
  _calcSkillHighlightAxes(skill, coreMove) {
    if (!coreMove) return null;
    const { row, col } = coreMove;
    const axes = { rows: [], cols: [], cages: [] };
    const s = skill.toLowerCase();

    switch (s) {
      case 'rule45':
        axes.rows.push(row);
        axes.cols.push(col);
        break;
      case 'hiddensingle':
        axes.rows.push(row);
        break;
      case 'nakedpair':
        axes.rows.push(row);
        axes.cols.push(col);
        break;
      case 'hiddenpair':
        axes.rows.push(row);
        axes.cols.push(col);
        break;
      case 'pointingclaiming':
        axes.rows.push(row);
        axes.cols.push(col);
        break;
      case 'cageuniquecombo':
        axes.cages.push('current');
        break;
      case 'nakedtriplet':
        axes.rows.push(row);
        break;
      case '二连纵横阵':
        axes.rows = [row, (row + 3) % 9];
        axes.cols = [col, (col + 4) % 9];
        break;
      default:
        axes.rows.push(row);
        axes.cols.push(col);
    }
    return axes;
  }
}

function ratePuzzle(board, cages) {
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  const solver = new TechRaterSolverV2(board, normCages);
  solver.solve(500);
  return solver.getRating();
}

// Node.js环境：模块导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TechRaterSolver: TechRaterSolverV2,
    ratePuzzle,
    TECHNIQUES,
    TECH_PRIORITY
  };
}

// 浏览器环境：暴露到全局window
if (typeof window !== 'undefined') {
  window.TechRaterSolverV2 = TechRaterSolverV2;
  window.ratePuzzle = ratePuzzle;
  window.TECHNIQUES = TECHNIQUES;
  window.TECH_PRIORITY = TECH_PRIORITY;
}
