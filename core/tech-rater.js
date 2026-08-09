/**
 * ============================================================
 *  TechRater - 杀手数独技巧评级求解引擎
 * ============================================================
 *
 *  移植自 cagemaster2/tech-rater-v2.js，适配 cagemaster3 的 Board/Cell 结构。
 *
 *  核心原则：取"最低可用技巧"，而非"最快可解路径"。
 *  模拟人类解题：排除一步后立即 break，下一轮从最低级技巧重新开始。
 *
 *  支持尺寸：4x4 / 6x6 / 9x9
 *    - 9x9: 全部 10 种技巧完整支持
 *    - 6x6: 支持基础到中级技巧（nakedSingle ~ nakedTriplet）
 *    - 4x4: 仅支持基础技巧（nakedSingle, hiddenSingle, nakedPair）
 *
 *  公共 API:
 *    - new TechRater(board)     从 Board 对象创建求解器
 *    - TechRater.fromBoard(board)  静态工厂方法
 *    - solver.findNextStep()    找下一步最优解
 *    - solver.solve(maxSteps)   完整求解
 *    - solver.getRating()       获取难度评级
 *    - solver.getTriPhaseScript()  获取三阶段剧本
 *    - TechRater.TECHNIQUES     技巧定义表
 *    - TechRater.getTechniqueName(id)  获取技巧中文名
 *
 * ============================================================
 */

(function(global) {

  // ========================================================
  //  技巧定义表
  // ========================================================

  const TECHNIQUES = {
    nakedSingle:      { id: 'nakedSingle',      name: '孤星',         alias: '裸单',         level: 1,  depth: 0 },
    cageUnique:       { id: 'cageUnique',       name: '唯一组合',      alias: '笼子唯一组合',  level: 2,  depth: 1 },
    hiddenSingle:     { id: 'hiddenSingle',     name: '隐曜',         alias: '隐单',         level: 3,  depth: 1 },
    rule45:           { id: 'rule45',           name: '星衡法则',      alias: '45法则',       level: 4,  depth: 2 },
    nakedPair:        { id: 'nakedPair',        name: '并蒂锁',        alias: '裸数对',       level: 5,  depth: 2 },
    hiddenPair:       { id: 'hiddenPair',       name: '双曜',         alias: '隐数对',       level: 6,  depth: 3 },
    pointingClaiming: { id: 'pointingClaiming', name: '区块排除',      alias: 'Pointing',     level: 7,  depth: 3 },
    nakedTriplet:     { id: 'nakedTriplet',     name: '三子法',        alias: '裸三数组',     level: 8,  depth: 3 },
    xWing:            { id: 'xWing',            name: '二连纵横阵',    alias: 'X-Wing',       level: 9,  depth: 4 },
    swordfish:        { id: 'swordfish',        name: '三才游鱼阵',    alias: 'Swordfish',    level: 10, depth: 5 },
    guess:            { id: 'guess',            name: '试数',         alias: 'Guess',        level: 11, depth: 6 }
  };

  // 9x9 完整技巧优先级
  const TECH_PRIORITY_9 = [
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

  // 6x6 可用技巧（不含 X-Wing / Swordfish 等大尺寸技巧）
  const TECH_PRIORITY_6 = [
    'nakedSingle',
    'cageUnique',
    'hiddenSingle',
    'rule45',
    'nakedPair',
    'hiddenPair',
    'pointingClaiming',
    'nakedTriplet'
  ];

  // 4x4 可用技巧（仅最基础）
  const TECH_PRIORITY_4 = [
    'nakedSingle',
    'hiddenSingle',
    'nakedPair'
  ];

  // ========================================================
  //  Bitmask 工具函数（候选数用 9 位二进制表示）
  //  bit 0 = 数字1, bit 1 = 数字2, ..., bit 8 = 数字9
  // ========================================================

  const BIT = (num) => 1 << (num - 1);
  const ALL_MASK = (size) => (1 << size) - 1;

  // 位计数（popcount），9位数足够用简单方法
  function popcount(mask) {
    // 使用 Brian Kernighan 算法
    let count = 0;
    while (mask) {
      mask &= mask - 1;
      count++;
    }
    return count;
  }

  // 当 popcount(mask) === 1 时，快速获取数字 1~9
  // 例如 0b000010000 (bit 4) → 5
  function maskToSingleNum(mask) {
    return 32 - Math.clz32(mask);
  }

  // 从 bitmask 提取所有数字为数组
  function maskToArray(mask, size = 9) {
    const result = [];
    for (let n = 1; n <= size; n++) {
      if (mask & BIT(n)) result.push(n);
    }
    return result;
  }

  // 从数组构建 bitmask
  function arrayToMask(arr) {
    let mask = 0;
    for (const n of arr) mask |= BIT(n);
    return mask;
  }

  // 尺寸辅助

  function getBoxDimensions(size) {
    if (size === 4) return { boxW: 2, boxH: 2, boxRows: 2, boxCols: 2 };
    if (size === 6) return { boxW: 3, boxH: 2, boxRows: 2, boxCols: 3 };
    return { boxW: 3, boxH: 3, boxRows: 3, boxCols: 3 }; // 9x9
  }

  function getTechPriority(size) {
    if (size <= 4) return TECH_PRIORITY_4;
    if (size <= 6) return TECH_PRIORITY_6;
    return TECH_PRIORITY_9;
  }

  function getRule45Sum(size) {
    // n x n 数独中，行/列/宫的数字和 = n*(n+1)/2
    return size * (size + 1) / 2;
  }

  // ========================================================
  //  TechRater 主类
  // ========================================================

  class TechRater {
    /**
     * 从 Board 对象创建求解器实例
     * @param {Board} board - cagemaster3 的 Board 实例
     */
    constructor(board) {
      this.size = board.size;
      const dim = getBoxDimensions(this.size);
      this.boxW = dim.boxW;
      this.boxH = dim.boxH;
      this.boxRows = dim.boxRows;
      this.boxCols = dim.boxCols;
      this.rule45Sum = getRule45Sum(this.size);

      // 提取 grid 数据（0 表示空，数字表示已填）
      this.grid = [];
      for (let r = 0; r < this.size; r++) {
        this.grid[r] = [];
        for (let c = 0; c < this.size; c++) {
          const cell = board.cells[r][c];
          const val = cell.fixedNum || cell.fillNum;
          this.grid[r][c] = val || 0;
        }
      }

      // 提取笼子数据
      this.cages = [];
      this.cellCage = new Array(this.size * this.size).fill(null);

      if (board.cages && Array.isArray(board.cages)) {
        for (let i = 0; i < board.cages.length; i++) {
          const cage = board.cages[i];
          const cageData = {
            id: cage.id !== undefined ? cage.id : i,
            sum: cage.sum,
            cells: cage.cells.map(([r, c]) => [r | 0, c | 0])
          };
          this.cages.push(cageData);
          for (const [r, c] of cageData.cells) {
            if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
              // 取第一个（最外层）笼子作为 cellCage 映射
              if (!this.cellCage[r * this.size + c]) {
                this.cellCage[r * this.size + c] = cageData;
              }
            }
          }
        }
      }

      // 候选集（内部维护，不修改 Board）
      // 使用 Bitmask：9 位二进制，bit 0 = 数字1, bit 8 = 数字9
      this.candidates = new Array(this.size);
      for (let r = 0; r < this.size; r++) {
        this.candidates[r] = new Array(this.size).fill(0);
      }

      // 求解步骤记录
      this.steps = [];
      this.cellTech = {}; // key: r*size+c, value: techniqueId

      // 上一次排除类技巧的证据（用于 elimination 步骤记录）
      this._lastEliminationEvidence = null;

      // 评级缓存（solve 后首次 getRating 时计算并缓存）
      this._cachedRating = null;

      // 技巧优先级表
      this.techPriority = getTechPriority(this.size);

      // 初始化候选
      this._initCandidates();
    }

    /**
     * 静态工厂方法：从 Board 创建
     */
    static fromBoard(board) {
      return new TechRater(board);
    }

    /**
     * 获取技巧中文名
     */
    static getTechniqueName(id) {
      const t = TECHNIQUES[id];
      return t ? t.name : id;
    }

    // ======================================================
    //  候选初始化
    // ======================================================

    _initCandidates() {
      const allMask = ALL_MASK(this.size);

      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] !== 0) {
            this.candidates[r][c] = BIT(this.grid[r][c]);
          } else {
            this.candidates[r][c] = allMask;
          }
        }
      }
      this._applyBasicConstraints();
      this._applyCageConstraints();
      // V4.3.11：记录初始候选总量（用于进度度量：progress = 1 - total/initial）
      this._initialCandidatesTotal = this._countTotalCandidates();
    }

    _applyBasicConstraints() {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] === 0) continue;
          const v = this.grid[r][c];
          const vBit = BIT(v);
          // 同行
          for (let cc = 0; cc < this.size; cc++)
            if (cc !== c && this.grid[r][cc] === 0) this.candidates[r][cc] &= ~vBit;
          // 同列
          for (let rr = 0; rr < this.size; rr++)
            if (rr !== r && this.grid[rr][c] === 0) this.candidates[rr][c] &= ~vBit;
          // 同宫
          const br = Math.floor(r / this.boxH) * this.boxH;
          const bc = Math.floor(c / this.boxW) * this.boxW;
          for (let dr = 0; dr < this.boxH; dr++)
            for (let dc = 0; dc < this.boxW; dc++) {
              const rr = br + dr, cc = bc + dc;
              if ((rr !== r || cc !== c) && this.grid[rr][cc] === 0)
                this.candidates[rr][cc] &= ~vBit;
            }
        }
      }
    }

    _applyCageConstraints() {
      for (const cage of this.cages) {
        this._applyCageConstraintsForCage(cage);
      }
    }

    /**
     * 对单个笼子应用约束（去重 + 和值约束）
     */
    _applyCageConstraintsForCage(cage) {
      let placedMask = 0;
      let placedSum = 0;
      const emptyCells = [];

      for (const [r, c] of cage.cells) {
        if (this.grid[r][c] !== 0) {
          placedMask |= BIT(this.grid[r][c]);
          placedSum += this.grid[r][c];
        } else {
          emptyCells.push([r, c]);
        }
      }

      const remaining = cage.sum - placedSum;
      const emptyCount = emptyCells.length;
      if (emptyCount === 0) return;

      // 笼子内数字不重复（移除已放置的数字
      for (const [r, c] of emptyCells) {
        this.candidates[r][c] &= ~placedMask;
      }

      // 笼子和值约束：找出所有可能的数字
      const possibleNums = this._getPossibleNumbers(remaining, emptyCount, placedMask);
      const possibleMask = arrayToMask(possibleNums);

      for (const [r, c] of emptyCells) {
        // 只保留可能的数字
        this.candidates[r][c] &= possibleMask;
      }
    }

    /**
     * 深拷贝候选集（用于保存/恢复状态）
     */
    _cloneCandidates() {
      const copy = new Array(this.size);
      for (let r = 0; r < this.size; r++) {
        copy[r] = new Array(this.size);
        for (let c = 0; c < this.size; c++) {
          copy[r][c] = this.candidates[r][c];
        }
      }
      return copy;
    }

    /**
     * 从深拷贝恢复候选集
     */
    _restoreCandidates(saved) {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          this.candidates[r][c] = saved[r][c];
        }
      }
    }

    _getPossibleNumbers(targetSum, count, excludeMask) {
      const result = new Set();
      this._combosHelper(targetSum, count, 1, new Set(), excludeMask, result);
      return result;
    }

    _combosHelper(target, count, start, current, excludeMask, result) {
      if (count === 0) {
        if (target === 0) for (const v of current) result.add(v);
        return;
      }
      if (target <= 0 || start > this.size) return;
      for (let v = start; v <= this.size; v++) {
        if (excludeMask & BIT(v)) continue;
        if (v > target) break;
        current.add(v);
        this._combosHelper(target - v, count - 1, v + 1, current, excludeMask, result);
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

    // ======================================================
    //  主求解循环
    // ======================================================

    /**
     * 完整求解盘面
     * @param {number} maxSteps - 最大步骤数
     * @returns {Object} { solvable, steps, remainingCells }
     */
    solve(maxSteps = 500) {
      let stepCount = 0;

      while (stepCount < maxSteps) {
        let madeProgress = false;

        // 按优先级顺序遍历所有技巧（保持"最低可用技巧"策略）
        for (const techId of this.techPriority) {
          // 记录调用前的笔记总数（用于检测排除效果）
          const beforeCount = this._countTotalCandidates();

          // 重置上一次排除证据
          this._lastEliminationEvidence = null;

          const results = this._findAllByTechnique(techId);

          if (results.length > 0) {
            const result = results[0];
            if (result.type === 'elimination') {
              // 2026-08-03：排除类结果（hiddenPair 等无裸单时）只记录排除，不填数
              const stepEvidence = Object.assign(
                { eliminatedCount: result.evidence && result.evidence.eliminatedCells ? result.evidence.eliminatedCells.length : 0 },
                result.evidence || {}
              );
              this.steps.push({
                technique: techId,
                techniqueName: TECHNIQUES[techId].name,
                type: 'elimination',
                depth: TECHNIQUES[techId].depth,
                // V4.3.15：elimination 步骤补 row/col/num（xWing/swordfish 等
                // 排除结果自带坐标，供 HintSystem 转 hint 时定位目标格与讲解）
                row: (result.row !== undefined ? result.row : null),
                col: (result.col !== undefined ? result.col : null),
                num: (result.num !== undefined ? result.num : null),
                eliminatedCandidates: result.evidence && result.evidence.eliminatedCells ? result.evidence.eliminatedCells.length : 0,
                evidence: stepEvidence,
              });
              madeProgress = true;
              stepCount++;
              break;
            }
            // 找到可填的格子 -> 填数，记为 fill 步骤
            // V4.3.11：填数前记录该格候选（教练级提示：为什么能填）
            const candBefore = maskToArray(this.candidates[result.row][result.col], this.size);
            this._fillCell(result.row, result.col, result.num);
            this.steps.push({
              row: result.row,
              col: result.col,
              num: result.num,
              technique: techId,
              techniqueName: TECHNIQUES[techId].name,
              type: 'fill',
              depth: TECHNIQUES[techId].depth,
              candidatesBefore: candBefore, // 填数前的候选（排除后剩 1 个）
              removedCandidates: candBefore.filter(n => n !== result.num), // 被排除的候选
              evidence: result.evidence || null
            });
            this.cellTech[result.row * this.size + result.col] = techId;
            madeProgress = true;
            stepCount++;
            break;
          }

          // 没找到填数 -> 检查是否有笔记被排除（排除类技巧的副作用）
          const afterCount = this._countTotalCandidates();
          const eliminated = beforeCount - afterCount;

          if (eliminated > 0) {
            // 有排除发生 -> 记为 elimination 步骤
            // 如果技巧设置了 _lastEliminationEvidence，合并到证据中
            const stepEvidence = { eliminatedCount: eliminated };
            if (this._lastEliminationEvidence) {
              Object.assign(stepEvidence, this._lastEliminationEvidence);
            }
            this.steps.push({
              technique: techId,
              techniqueName: TECHNIQUES[techId].name,
              type: 'elimination',
              depth: TECHNIQUES[techId].depth,
              eliminatedCandidates: eliminated,
              evidence: stepEvidence,
            });
            this._lastEliminationEvidence = null;
            madeProgress = true;
            stepCount++;
            break; // 排除一步后立即 break，下一轮从最低级技巧重新开始
          }
        }

        if (!madeProgress) break; // 真的卡住了

        if (this._countEmptyCells() === 0) {
          this._cachedRating = null; // 重置评级缓存
          return { solvable: true, steps: this.steps, remainingCells: 0 };
        }
      }

      this._cachedRating = null; // 重置评级缓存
      return {
        solvable: this._countEmptyCells() === 0,
        steps: this.steps,
        remainingCells: this._countEmptyCells()
      };
    }

    _countEmptyCells() {
      let count = 0;
      for (let r = 0; r < this.size; r++)
        for (let c = 0; c < this.size; c++)
          if (this.grid[r][c] === 0) count++;
      return count;
    }

    /**
     * 获取最优过关策略步骤（2026-08-04）
     * solve() 内部已生成 steps，此方法提供公开访问，
     * 供最优路径回放（strategy-replay）与用户路径对比使用。
     * @returns {Array} 求解步骤数组（fill: {row,col,num,technique,evidence} | elimination: {technique,evidence}）
     */
    getSteps() {
      return Array.isArray(this.steps) ? this.steps.slice() : [];
    }

    /**
     * 统计当前盘面上所有空格的笔记总数
     * 用于检测排除类技巧是否产生了实际效果
     */
    _countTotalCandidates() {
      let count = 0;
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] === 0) {
            count += popcount(this.candidates[r][c]);
          }
        }
      }
      return count;
    }

    // ======================================================
    //  影响力评分
    // ======================================================

    /**
     * 计算单个空格的影响力分数
     * 分数越高，填完这个格后对盘面的推动作用越大
     *
     * 维度及权重：
     * - 笼子剩余空格数倒数 (x0.35)
     * - 宫/行/列空白数倒数 (x0.25)
     * - 笔记倒数 (x0.15)
     * - 是否涉及多个笼子交叉 (x0.15)
     * - 是否触发星衡法则 (x0.10)
     */
    _calcInfluence(r, c) {
      // 1. 笔记
      const candCount = Math.max(popcount(this.candidates[r][c]), 1);
      const candScore = 1 / candCount;

      // 2. 行/列/宫空白数（取三者中最小的，即"最接近完成"的维度）
      let rowEmpty = 0, colEmpty = 0, boxEmpty = 0;
      for (let i = 0; i < this.size; i++) {
        if (this.grid[r][i] === 0) rowEmpty++;
        if (this.grid[i][c] === 0) colEmpty++;
      }
      const br = Math.floor(r / this.boxH) * this.boxH;
      const bc = Math.floor(c / this.boxW) * this.boxW;
      for (let dr = 0; dr < this.boxH; dr++) {
        for (let dc = 0; dc < this.boxW; dc++) {
          if (this.grid[br + dr][bc + dc] === 0) boxEmpty++;
        }
      }
      const minEmpty = Math.min(rowEmpty, colEmpty, boxEmpty);
      const emptyScore = 1 / Math.max(minEmpty, 1);

      // 3. 笼子相关
      let cageScore = 0;
      let cageCrossScore = 0;
      let rule45Score = 0;

      const cage = this.cellCage[r * this.size + c];
      if (cage) {
        // 计算笼子剩余空格数
        let cageEmpty = 0;
        let cageBoxSet = new Set();
        for (const [cr, cc] of cage.cells) {
          if (this.grid[cr][cc] === 0) cageEmpty++;
          const cbr = Math.floor(cr / this.boxH);
          const cbc = Math.floor(cc / this.boxW);
          cageBoxSet.add(cbr + ',' + cbc);
        }
        cageScore = 1 / Math.max(cageEmpty, 1);

        // 星衡法则触发：跨宫笼子，且接近完成（只剩1-2格）
        if (cageBoxSet.size > 1 && cageEmpty <= 2) {
          rule45Score = 0.5 + (2 - cageEmpty) * 0.25;
        }

        // 多笼子交叉点（嵌套笼）
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
     * V4.3.23（Spec v1.2 P0-1）：公开影响力接口
     * 返回 0-1 之间的影响力分数（综合笼子剩余空格、行/列/宫空白数、
     * 候选数、跨宫笼子、星衡法则触发等维度）
     * @param {number} r
     * @param {number} c
     * @returns {number} 0-1 影响力分数
     */
    getInfluence(r, c) {
      if (r < 0 || c < 0 || r >= this.size || c >= this.size) return 0;
      if (this.grid[r][c] !== 0) return 0; // 已填格无影响力
      return this._calcInfluence(r, c);
    }

    /**
     * V4.3.23（Spec v1.2 P0-1）：获取当前盘面所有空格的影响力映射
     * @returns {Array<{row:number,col:number,influence:number}>} 降序排列
     */
    getInfluenceMap() {
      const list = [];
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] !== 0) continue;
          list.push({ row: r, col: c, influence: this._calcInfluence(r, c) });
        }
      }
      list.sort((a, b) => b.influence - a.influence);
      return list;
    }

    // ======================================================
    //  查找下一步
    // ======================================================

    /**
     * 只查找下一步，不填入盘面
     * @returns {Object|null} { row, col, num, technique, techniqueName, depth, evidence }
     */
    findNextStep() {
      for (const techId of this.techPriority) {
        // Q19：记录调用前候选总数——纯排除型技巧（xWing/swordfish/pointingClaiming）
        // 会通过副作用排除候选而不产生填数结果（results 空），原实现直接跳过并
        // 污染候选后返回 null，导致 X-Wing 关卡的 hint 只能讲前面几步就降级
        const beforeCount = this._countTotalCandidates();
        this._lastEliminationEvidence = null;
        const allResults = this._findAllByTechnique(techId);
        if (allResults.length > 0) {
          const best = this._pickMostInfluential(allResults);
          return {
            row: best.row,
            col: best.col,
            num: best.num,
            technique: techId,
            techniqueName: TECHNIQUES[techId].name,
            depth: TECHNIQUES[techId].depth,
            evidence: best.evidence || null,
            type: best.type || 'fill',
            eliminationSteps: 0
          };
        }
        // 排除副作用检测：results 空但候选被排除 → 返回 elimination 步骤
        const afterCount = this._countTotalCandidates();
        const eliminated = beforeCount - afterCount;
        if (eliminated > 0) {
          const ev = this._lastEliminationEvidence || null;
          const evCells = (ev && Array.isArray(ev.eliminatedCells)) ? ev.eliminatedCells : [];
          return {
            technique: techId,
            techniqueName: TECHNIQUES[techId].name,
            depth: TECHNIQUES[techId].depth,
            type: 'elimination',
            row: (ev && typeof ev.row === 'number') ? ev.row : (evCells[0] ? evCells[0].row : null),
            col: (ev && typeof ev.col === 'number') ? ev.col : (evCells[0] ? evCells[0].col : null),
            num: (ev && typeof ev.num === 'number') ? ev.num : (evCells[0] ? evCells[0].num : null),
            evidence: Object.assign({ eliminatedCount: eliminated }, ev || {}),
            eliminationSteps: eliminated,
          };
        }
      }
      return null;
    }

    /**
     * Q6：找出当前盘面【当前最简单层级】所有可推的步骤。
     * 只收集"最高优先级且实际有结果"的技巧的全部结果——与 findNextStep 同源：
     * 提示给哪个技巧，热力图就标出该技巧能推的所有格（少而精，重点明确）。
     * @returns {Array<{row,col,num,technique,evidence,influence}>} 按影响力降序
     */
    findAllCurrentSteps() {
      const out = [];
      try {
        for (const techId of this.techPriority) {
          const allResults = this._findAllByTechnique(techId);
          if (allResults.length > 0) {
            // 只取当前最高优先级技巧的结果（与 findNextStep 同源）
            for (const res of allResults) {
              if (!res || typeof res.row !== 'number' || typeof res.col !== 'number') continue;
              out.push({
                row: res.row,
                col: res.col,
                num: res.num,
                technique: techId,
                techniqueName: (TECHNIQUES[techId] && TECHNIQUES[techId].name) || techId,
                depth: (TECHNIQUES[techId] && TECHNIQUES[techId].depth) || 0,
                evidence: res.evidence || null,
                type: res.type || 'fill',
                influence: this._calcInfluence(res.row, res.col),
              });
            }
            // 同一技巧内按影响力降序，保证"最有用的可推格"排前
            out.sort((a, b) => b.influence - a.influence);
            // 最多标 5 格（少而精：全部标绿会失去重点，玩家挑一个填即可）
            if (out.length > 5) out.length = 5;
            break; // 只取最高层级技巧
          }
        }
      } catch (e) {
        console.warn('[TechRater] findAllCurrentSteps error:', e);
      }
      return out;
    }

    /**
     * 收集某个技巧的所有结果
     * 返回结果数组（每个元素是 { row, col, num, evidence }）
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

    // ======================================================
    //  1. 孤星 (Naked Single)
    // ======================================================

    /**
     * 收集所有孤星（笔记=1的格子）
     * 返回完整提示对象数组
     */
    _findAllNakedSingles() {
      const results = [];
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] === 0 && popcount(this.candidates[r][c]) === 1) {
            const num = maskToSingleNum(this.candidates[r][c]);

            // 收集行/列/宫中已有的数字
            const rowNumbers = [];
            const colNumbers = [];
            const boxNumbers = [];

            for (let cc = 0; cc < this.size; cc++) {
              if (cc !== c && this.grid[r][cc] !== 0) rowNumbers.push({ r, c: cc, v: this.grid[r][cc] });
            }
            for (let rr = 0; rr < this.size; rr++) {
              if (rr !== r && this.grid[rr][c] !== 0) colNumbers.push({ r: rr, c, v: this.grid[rr][c] });
            }
            const br = Math.floor(r / this.boxH) * this.boxH;
            const bc = Math.floor(c / this.boxW) * this.boxW;
            for (let dr = 0; dr < this.boxH; dr++) {
              for (let dc = 0; dc < this.boxW; dc++) {
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
            for (let n = 1; n <= this.size; n++) {
              if (allSeen.has(n) && n !== num) eliminated.push(n);
            }

            // 收集笼子信息
            let cageInfo = null;
            const cage = this.cellCage[r * this.size + c];
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

              cageInfo = {
                id: cage.id,
                sum: cage.sum,
                cells: cageCells,
                filledNums,
                filledSum,
                emptyCells,
                emptyCount: emptyCells.length,
                remain
              };
            }

            results.push({
              row: r, col: c, num,
              evidence: {
                type: 'nakedSingle',
                targetCell: [r, c],
                targetValue: num,
                candidates: maskToArray(this.candidates[r][c], this.size),
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

    // ======================================================
    //  2. 笼子唯一组合 (Cage Unique)
    // ======================================================

    _findCageUnique() {
      for (const cage of this.cages) {
        const emptyCells = [];
        let placedMask = 0;
        let placedSum = 0;
        const placedNums = [];

        for (const [r, c] of cage.cells) {
          if (this.grid[r][c] !== 0) {
            placedMask |= BIT(this.grid[r][c]);
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
        this._findAllCombos(remaining, count, 1, 0, placedMask, emptyCells, allCombos);

        if (allCombos.length === 0) continue;

        // 找出"必须出现"的数字（在所有组合中都出现）
        let mustHaveMask = allCombos[0];
        for (let i = 1; i < allCombos.length; i++) {
          mustHaveMask &= allCombos[i];
        }
        mustHaveMask &= ~placedMask;

        // 对于每个"必须出现"的数字，检查它只在一个格子的候选中出现
        for (const num of maskToArray(mustHaveMask, this.size)) {
          let posCount = 0;
          let pos = null;
          const otherEmptyCells = [];
          for (const [r, c] of emptyCells) {
            if ((this.candidates[r][c] & BIT(num)) !== 0) {
              posCount++;
              pos = [r, c];
            } else {
              otherEmptyCells.push([r, c]);
            }
          }
          if (posCount === 1) {
            // 收集组合数组（转为排序数组格式，便于展示）
            const combosArray = allCombos.map(mask => {
              const arr = maskToArray(mask, this.size);
              arr.sort((a, b) => a - b);
              return arr;
            });

            // 收集目标格的行/列/宫已填数字
            const [tr, tc] = pos;
            const rowNumbers = [];
            const colNumbers = [];
            const boxNumbers = [];
            const boxR = Math.floor(tr / this.boxH) * this.boxH;
            const boxC = Math.floor(tc / this.boxW) * this.boxW;

            for (let i = 0; i < this.size; i++) {
              if (this.grid[tr][i] !== 0) rowNumbers.push({ r: tr, c: i, v: this.grid[tr][i] });
              if (this.grid[i][tc] !== 0) colNumbers.push({ r: i, c: tc, v: this.grid[i][tc] });
            }
            for (let dr = 0; dr < this.boxH; dr++) {
              for (let dc = 0; dc < this.boxW; dc++) {
                const r = boxR + dr, c = boxC + dc;
                if (this.grid[r][c] !== 0) boxNumbers.push({ r, c, v: this.grid[r][c] });
              }
            }

            // 收集其他空格为什么不能放num的原因
            const otherCellReasons = [];
            for (const [r, c] of otherEmptyCells) {
              const reasons = [];
              let inRow = false;
              for (let i = 0; i < this.size; i++) {
                if (this.grid[r][i] === num) { inRow = true; break; }
              }
              if (inRow) reasons.push('行');
              let inCol = false;
              for (let i = 0; i < this.size; i++) {
                if (this.grid[i][c] === num) { inCol = true; break; }
              }
              if (inCol) reasons.push('列');
              const br = Math.floor(r / this.boxH) * this.boxH;
              const bc = Math.floor(c / this.boxW) * this.boxW;
              let inBox = false;
              for (let dr = 0; dr < this.boxH; dr++) {
                for (let dc = 0; dc < this.boxW; dc++) {
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
    _findAllCombos(target, count, start, currentMask, excludeMask, cells, result) {
      if (count === 0) {
        if (target === 0) {
          result.push(currentMask);
        }
        return;
      }
      if (target <= 0 || start > this.size) return;

      for (let v = start; v <= this.size; v++) {
        if (excludeMask & BIT(v)) continue;
        if (v > target) break;

        // 检查是否有格子可以放v
        let canPlace = false;
        for (const [r, c] of cells) {
          if (this.grid[r][c] === 0 && (this.candidates[r][c] & BIT(v)) !== 0) {
            canPlace = true;
            break;
          }
        }
        if (!canPlace) continue;

        this._findAllCombos(target - v, count - 1, v + 1, currentMask | BIT(v), excludeMask, cells, result);
      }
    }

    // ======================================================
    //  3. 隐曜 (Hidden Single) - 行/列/宫 三个维度
    // ======================================================

    _findHiddenSingle() {
      // 行
      for (let r = 0; r < this.size; r++) {
        for (let n = 1; n <= this.size; n++) {
          let count = 0, pos = null;
          const possiblePositions = [];
          const eliminatedPositions = [];
          let alreadyPlaced = false;
          for (let c = 0; c < this.size; c++) {
            if (this.grid[r][c] === n) { alreadyPlaced = true; break; }
            if (this.grid[r][c] === 0) {
              if ((this.candidates[r][c] & BIT(n)) !== 0) {
                count++;
                pos = [r, c];
                possiblePositions.push([r, c]);
              } else {
                const reasons = [];
                // 列排除
                for (let rr = 0; rr < this.size; rr++) {
                  if (this.grid[rr][c] === n) { reasons.push('列'); break; }
                }
                // 宫排除
                const br = Math.floor(r / this.boxH) * this.boxH;
                const bc = Math.floor(c / this.boxW) * this.boxW;
                let inBox = false;
                for (let dr = 0; dr < this.boxH; dr++) {
                  for (let dc = 0; dc < this.boxW; dc++) {
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
            const rowFilled = [];
            for (let cc = 0; cc < this.size; cc++) {
              if (this.grid[r][cc] !== 0) rowFilled.push({ r, c: cc, v: this.grid[r][cc] });
            }
            const scopeCells = [];
            for (let cc = 0; cc < this.size; cc++) scopeCells.push([r, cc]);
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
                reason: '数字' + n + '在第' + (r+1) + '行只有一个可能位置'
              }
            };
          }
        }
      }
      // 列
      for (let c = 0; c < this.size; c++) {
        for (let n = 1; n <= this.size; n++) {
          let count = 0, pos = null;
          const possiblePositions = [];
          const eliminatedPositions = [];
          let alreadyPlaced = false;
          for (let r = 0; r < this.size; r++) {
            if (this.grid[r][c] === n) { alreadyPlaced = true; break; }
            if (this.grid[r][c] === 0) {
              if ((this.candidates[r][c] & BIT(n)) !== 0) {
                count++;
                pos = [r, c];
                possiblePositions.push([r, c]);
              } else {
                const reasons = [];
                for (let cc = 0; cc < this.size; cc++) {
                  if (this.grid[r][cc] === n) { reasons.push('行'); break; }
                }
                const br = Math.floor(r / this.boxH) * this.boxH;
                const bc = Math.floor(c / this.boxW) * this.boxW;
                let inBox = false;
                for (let dr = 0; dr < this.boxH; dr++) {
                  for (let dc = 0; dc < this.boxW; dc++) {
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
            for (let rr = 0; rr < this.size; rr++) {
              if (this.grid[rr][c] !== 0) colFilled.push({ r: rr, c, v: this.grid[rr][c] });
            }
            const scopeCells = [];
            for (let rr = 0; rr < this.size; rr++) scopeCells.push([rr, c]);
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
                reason: '数字' + n + '在第' + (c+1) + '列只有一个可能位置'
              }
            };
          }
        }
      }
      // 宫
      const totalBoxes = this.boxRows * this.boxCols;
      for (let b = 0; b < totalBoxes; b++) {
        const br = Math.floor(b / this.boxCols) * this.boxH;
        const bc = (b % this.boxCols) * this.boxW;
        for (let n = 1; n <= this.size; n++) {
          let count = 0, pos = null;
          const possiblePositions = [];
          const eliminatedPositions = [];
          let alreadyPlaced = false;
          for (let dr = 0; dr < this.boxH; dr++) {
            for (let dc = 0; dc < this.boxW; dc++) {
              const r = br + dr, c = bc + dc;
              if (this.grid[r][c] === n) { alreadyPlaced = true; dr = this.boxH; dc = this.boxW; break; }
              if (this.grid[r][c] === 0) {
                if ((this.candidates[r][c] & BIT(n)) !== 0) {
                  count++;
                  pos = [r, c];
                  possiblePositions.push([r, c]);
                } else {
                  const reasons = [];
                  for (let cc = 0; cc < this.size; cc++) {
                    if (this.grid[r][cc] === n) { reasons.push('行'); break; }
                  }
                  for (let rr = 0; rr < this.size; rr++) {
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
            for (let dr = 0; dr < this.boxH; dr++) {
              for (let dc = 0; dc < this.boxW; dc++) {
                const r = br + dr, c = bc + dc;
                if (this.grid[r][c] !== 0) boxFilled.push({ r, c, v: this.grid[r][c] });
              }
            }
            const scopeCells = [];
            for (let dr = 0; dr < this.boxH; dr++) {
              for (let dc = 0; dc < this.boxW; dc++) {
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
                reason: '数字' + n + '在第' + (b+1) + '宫只有一个可能位置'
              }
            };
          }
        }
      }
      return null;
    }

    // ======================================================
    //  4. 星衡法则 (Rule 45) - 行/列/宫的 Innie/Outie
    // ======================================================

    _findRule45() {
      const allResults = [];

      // 行
      for (let r = 0; r < this.size; r++) {
        const results = this._rule45ForScope(
          Array.from({ length: this.size }, (_, c) => [r, c]),
          'row', r
        );
        for (const res of results) allResults.push(res);
      }
      // 列
      for (let c = 0; c < this.size; c++) {
        const results = this._rule45ForScope(
          Array.from({ length: this.size }, (_, r) => [r, c]),
          'col', c
        );
        for (const res of results) allResults.push(res);
      }
      // 宫
      const totalBoxes = this.boxRows * this.boxCols;
      for (let b = 0; b < totalBoxes; b++) {
        const br = Math.floor(b / this.boxCols) * this.boxH;
        const bc = (b % this.boxCols) * this.boxW;
        const cells = [];
        for (let dr = 0; dr < this.boxH; dr++)
          for (let dc = 0; dc < this.boxW; dc++)
            cells.push([br + dr, bc + dc]);
        const results = this._rule45ForScope(cells, 'box', b);
        for (const res of results) allResults.push(res);
      }

      if (allResults.length === 0) return null;
      return this._pickMostInfluential(allResults);
    }

    /**
     * 对一组格的 scope（行/列/宫）应用星衡法则。
     *
     * 原理：
     * - scope内所有格之和 = rule45Sum (9x9时为45)
     * - 所有与scope相交的笼子的笼子和之和 = totalCageSum
     * - 这些笼子覆盖了：scope内全部格 + scope外的一些格（outsides）
     * - 因此 totalCageSum = rule45Sum + sum(outside格子的值)
     * - 即 sum(outside_values) = totalCageSum - rule45Sum
     *
     * Outie（单格外突）：
     * - 如果outside格中恰好1个空格 -> 该格的值 = sum(outside_values) - outside已填和
     *
     * Innie（单格内突）：
     * - sum(完全在scope内的笼子) + sum(innie格的值) = rule45Sum
     * - 如果innie格中恰好1个空格 -> 该格的值 = rule45Sum - sum(完全在内的笼子) - innie已填和
     */
    _rule45ForScope(scopeCells, scopeType, scopeIndex) {
      const results = [];
      const scopeKey = new Set(scopeCells.map(([r, c]) => r * this.size + c));

      // 收集所有与scope相交的笼子
      const intersectingCages = new Set();
      for (const [r, c] of scopeCells) {
        const cage = this.cellCage[r * this.size + c];
        if (cage) intersectingCages.add(cage);
      }

      // 计算 totalCageSum，并收集 allOutside（所有在scope外的相交笼子的格子）
      let totalCageSum = 0;
      const allOutside = [];
      const fullyInsideCages = []; // 笼子完全在scope内

      for (const cage of intersectingCages) {
        totalCageSum += cage.sum;
        let allInside = true;
        const outs = [];
        for (const [r, c] of cage.cells) {
          if (!scopeKey.has(r * this.size + c)) {
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
      const sumOutsideValues = totalCageSum - this.rule45Sum;

      let outsideFilledSum = 0;
      const outsideEmpty = [];
      for (const [r, c] of allOutside) {
        if (this.grid[r][c] !== 0) {
          outsideFilledSum += this.grid[r][c];
        } else {
          outsideEmpty.push([r, c]);
        }
      }

      // 恰好1个空格在outside -> 单格Outie
      if (outsideEmpty.length === 1) {
        const value = sumOutsideValues - outsideFilledSum;
        const [r, c] = outsideEmpty[0];
        if (value >= 1 && value <= this.size && this.grid[r][c] === 0 &&
            (this.candidates[r][c] & BIT(value)) !== 0) {
          results.push({
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
              formula: totalCageSum + ' - ' + this.rule45Sum + ' - ' + outsideFilledSum + ' = ' + value
            }
          });
        }
      }

      // --- Innie 检测 ---
      const fullyInsideCellKeys = new Set();
      for (const cage of fullyInsideCages) {
        for (const [r, c] of cage.cells) {
          fullyInsideCellKeys.add(r * this.size + c);
        }
      }
      const innieCells = [];
      for (const [r, c] of scopeCells) {
        if (!fullyInsideCellKeys.has(r * this.size + c)) {
          innieCells.push([r, c]);
        }
      }

      let sumFullyInside = 0;
      for (const cage of fullyInsideCages) sumFullyInside += cage.sum;
      const sumInnieValues = this.rule45Sum - sumFullyInside;

      let innieFilledSum = 0;
      const innieEmpty = [];
      for (const [r, c] of innieCells) {
        if (this.grid[r][c] !== 0) {
          innieFilledSum += this.grid[r][c];
        } else {
          innieEmpty.push([r, c]);
        }
      }

      // 恰好1个空格在innie -> 单格Innie
      if (innieEmpty.length === 1) {
        const value = sumInnieValues - innieFilledSum;
        const [r, c] = innieEmpty[0];
        if (value >= 1 && value <= this.size && this.grid[r][c] === 0 &&
            (this.candidates[r][c] & BIT(value)) !== 0) {
          results.push({
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
              formula: this.rule45Sum + ' - ' + sumFullyInside + ' - ' + innieFilledSum + ' = ' + value
            }
          });
        }
      }

      return results;
    }

    // ======================================================
    //  5. 并蒂锁 (Naked Pair)
    // ======================================================

    _findNakedPair() {
      // 收集2笔记格子
      const twoCands = [];
      for (let r = 0; r < this.size; r++)
        for (let c = 0; c < this.size; c++)
          if (this.grid[r][c] === 0 && popcount(this.candidates[r][c]) === 2)
            twoCands.push([r, c]);

      // 辅助：对一组格子，尝试用数对排除，返回第一个产生孤星的格子
      const eliminateFromCells = (cells, pairMask, pairCellsKey, pairCells, pairVals) => {
        let nakedSingleResult = null;
        let anyEliminated = false;
        const eliminatedCells = [];

        for (const [r, c] of cells) {
          if (pairCellsKey.has(r * this.size + c)) continue;
          if (this.grid[r][c] !== 0) continue;

          const beforeArr = maskToArray(this.candidates[r][c], this.size);
          this.candidates[r][c] &= ~pairMask;
          const afterArr = maskToArray(this.candidates[r][c], this.size);

          if (afterArr.length < beforeArr.length) {
            anyEliminated = true;
            // V4.3.11：记录被排除的候选坐标（笔记暴露）
            for (const n of beforeArr) {
              if (!afterArr.includes(n)) eliminatedCells.push({ row: r, col: c, num: n });
            }
            if (afterArr.length === 1 && !nakedSingleResult) {
              nakedSingleResult = { row: r, col: c, num: afterArr[0] };
            }
          }
        }

        if (anyEliminated) {
          // V4.3.11：设置排除证据，使 solve() 副作用路径能带上坐标
          this._lastEliminationEvidence = {
            pairValues: pairVals,
            pairCells: pairCells,
            eliminatedCells: eliminatedCells,
            eliminated: eliminatedCells.map(e => e.num),
          };
        }

        return { nakedSingleResult, anyEliminated, eliminatedCells };
      };

      // 行内检查
      for (let r = 0; r < this.size; r++) {
        const rowPairs = twoCands.filter(([rr]) => rr === r);
        for (let i = 0; i < rowPairs.length; i++) {
          for (let j = i + 1; j < rowPairs.length; j++) {
            const [, c1] = rowPairs[i];
            const [, c2] = rowPairs[j];
            const cands1 = this.candidates[r][c1];
            const cands2 = this.candidates[r][c2];

            if (cands1 === cands2) {
              const pairVals = maskToArray(cands1, this.size);
              const pairKey = new Set([r * this.size + c1, r * this.size + c2]);
              const rowCells = Array.from({ length: this.size }, (_, cc) => [r, cc]);

              const result = eliminateFromCells(rowCells, cands1, pairKey, [[r, c1], [r, c2]], pairVals);
              if (result.nakedSingleResult) {
                // Q14：裸数对 fill 结果必须携带数对证据（pairValues/pairCells/eliminatedCells），
                // 否则 getHint 拿到的是只有 {row,col,num} 的裸结果——玩家只看到"填X"没有任何依据
                return Object.assign({}, result.nakedSingleResult, {
                  technique: 'nakedPair',
                  evidence: {
                    technique: 'nakedPair',
                    scopeType: 'row',
                    scopeIndex: r,
                    pairValues: pairVals,
                    pairCells: [[r, c1], [r, c2]],
                    eliminatedCells: result.eliminatedCells ? result.eliminatedCells.slice() : [],
                    eliminated: (result.eliminatedCells || []).map(e => e.num),
                  },
                });
              }
            }
          }
        }
      }

      // 列内检查
      for (let c = 0; c < this.size; c++) {
        const colPairs = twoCands.filter(([, cc]) => cc === c);
        for (let i = 0; i < colPairs.length; i++) {
          for (let j = i + 1; j < colPairs.length; j++) {
            const [r1] = colPairs[i];
            const [r2] = colPairs[j];
            const cands1 = this.candidates[r1][c];
            const cands2 = this.candidates[r2][c];

            if (cands1 === cands2) {
              const pairVals = maskToArray(cands1, this.size);
              const pairKey = new Set([r1 * this.size + c, r2 * this.size + c]);
              const colCells = Array.from({ length: this.size }, (_, rr) => [rr, c]);

              const result = eliminateFromCells(colCells, cands1, pairKey, [[r1, c], [r2, c]], pairVals);
              if (result.nakedSingleResult) {
                // Q14：同上行分支——列内裸数对也必须携带证据
                return Object.assign({}, result.nakedSingleResult, {
                  technique: 'nakedPair',
                  evidence: {
                    technique: 'nakedPair',
                    scopeType: 'col',
                    scopeIndex: c,
                    pairValues: pairVals,
                    pairCells: [[r1, c], [r2, c]],
                    eliminatedCells: result.eliminatedCells ? result.eliminatedCells.slice() : [],
                    eliminated: (result.eliminatedCells || []).map(e => e.num),
                  },
                });
              }
            }
          }
        }
      }

      // 宫内检查
      const totalBoxes = this.boxRows * this.boxCols;
      for (let b = 0; b < totalBoxes; b++) {
        const br = Math.floor(b / this.boxCols) * this.boxH;
        const bc = (b % this.boxCols) * this.boxW;
        const boxPairs = twoCands.filter(([r, c]) =>
          r >= br && r < br + this.boxH && c >= bc && c < bc + this.boxW
        );

        for (let i = 0; i < boxPairs.length; i++) {
          for (let j = i + 1; j < boxPairs.length; j++) {
            const [r1, c1] = boxPairs[i];
            const [r2, c2] = boxPairs[j];
            const cands1 = this.candidates[r1][c1];
            const cands2 = this.candidates[r2][c2];

            if (cands1 === cands2) {
              const pairVals = maskToArray(cands1, this.size);
              const pairKey = new Set([r1 * this.size + c1, r2 * this.size + c2]);
              const boxCells = [];
              for (let dr = 0; dr < this.boxH; dr++)
                for (let dc = 0; dc < this.boxW; dc++)
                  boxCells.push([br + dr, bc + dc]);

              const result = eliminateFromCells(boxCells, cands1, pairKey, [[r1, c1], [r2, c2]], pairVals);
              if (result.nakedSingleResult) {
                return result.nakedSingleResult;
              }
            }
          }
        }
      }

      return null;
    }

    // ======================================================
    //  6. 双曜 (Hidden Pair)
    // ======================================================

    _findHiddenPair() {
      // 结果收集：fill 优先，elimination 兜底
      const results = [];
      const eliminations = [];

      // 辅助：对一组区域格应用隐数对排除（含完整证据链）
      const tryHiddenPair = (scopeType, scopeIndex, a, b) => {
        const aSet = new Set(a.cells.map(([r, c]) => r * this.size + c));
        const bSet = new Set(b.cells.map(([r, c]) => r * this.size + c));
        for (const k of aSet) if (!bSet.has(k)) return;
        if (aSet.size !== 2) return;

        const pairMask = BIT(a.num) | BIT(b.num);
        const pairCells = a.cells.map(([r, c]) => [r, c]);
        const pairVals = [a.num, b.num].sort((x, y) => x - y);

        let regionCells = [];
        if (scopeType === 'row') {
          regionCells = Array.from({ length: this.size }, (_, cc) => [scopeIndex, cc]);
        } else if (scopeType === 'col') {
          regionCells = Array.from({ length: this.size }, (_, rr) => [rr, scopeIndex]);
        } else if (scopeType === 'box') {
          const br = Math.floor(scopeIndex / this.boxCols) * this.boxH;
          const bc = (scopeIndex % this.boxCols) * this.boxW;
          for (let dr = 0; dr < this.boxH; dr++)
            for (let dc = 0; dc < this.boxW; dc++)
              regionCells.push([br + dr, bc + dc]);
        }

        let nakedSingleResult = null;
        let anyEliminated = false;
        const eliminatedCells = [];

        for (const [r, c] of regionCells) {
          if (!aSet.has(r * this.size + c)) continue;
          if (this.grid[r][c] !== 0) continue;
          const before = this.candidates[r][c];
          this.candidates[r][c] &= pairMask;
          const after = this.candidates[r][c];
          if (after !== before) {
            anyEliminated = true;
            // 记录被排除的数字
            const beforeArr = maskToArray(before, this.size);
            const afterArr = maskToArray(after, this.size);
            for (const n of beforeArr) {
              if (!afterArr.includes(n) && n !== a.num && n !== b.num) {
                eliminatedCells.push({ row: r, col: c, num: n });
              }
            }
            if (popcount(after) === 1 && !nakedSingleResult) {
              nakedSingleResult = { row: r, col: c, num: maskToSingleNum(after) };
            }
          }
        }

        const evidence = {
          pairValues: pairVals,
          pairCells: pairCells,
          scopeType: scopeType,
          scopeIndex: scopeIndex,
          eliminatedCells: eliminatedCells,
          eliminated: eliminatedCells.map(e => e.num),
        };

        if (nakedSingleResult) {
          results.push({
            row: nakedSingleResult.row,
            col: nakedSingleResult.col,
            num: nakedSingleResult.num,
            type: 'fill',
            evidence: evidence,
          });
        } else if (anyEliminated) {
          // 排除无裸单：返回 elimination 结果（与 X-Wing 一致）
          eliminations.push({
            row: pairCells[0][0],
            col: pairCells[0][1],
            num: pairVals[0],
            type: 'elimination',
            evidence: evidence,
          });
        }
      };

      // 行内检查
      for (let r = 0; r < this.size; r++) {
        const numCells = {};
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] !== 0) continue;
          for (const n of maskToArray(this.candidates[r][c], this.size)) {
            if (!numCells[n]) numCells[n] = [];
            numCells[n].push([r, c]);
          }
        }
        const twoCellNums = Object.entries(numCells)
          .filter(([, cells]) => cells.length === 2)
          .map(([num, cells]) => ({ num: parseInt(num), cells }));
        for (let i = 0; i < twoCellNums.length; i++) {
          for (let j = i + 1; j < twoCellNums.length; j++) {
            tryHiddenPair('row', r, twoCellNums[i], twoCellNums[j]);
          }
        }
      }

      // 列内检查
      for (let c = 0; c < this.size; c++) {
        const numCells = {};
        for (let r = 0; r < this.size; r++) {
          if (this.grid[r][c] !== 0) continue;
          for (const n of maskToArray(this.candidates[r][c], this.size)) {
            if (!numCells[n]) numCells[n] = [];
            numCells[n].push([r, c]);
          }
        }
        const twoCellNums = Object.entries(numCells)
          .filter(([, cells]) => cells.length === 2)
          .map(([num, cells]) => ({ num: parseInt(num), cells }));
        for (let i = 0; i < twoCellNums.length; i++) {
          for (let j = i + 1; j < twoCellNums.length; j++) {
            tryHiddenPair('col', c, twoCellNums[i], twoCellNums[j]);
          }
        }
      }

      // 宫内检查
      const totalBoxes = this.boxRows * this.boxCols;
      for (let b = 0; b < totalBoxes; b++) {
        const br = Math.floor(b / this.boxCols) * this.boxH;
        const bc = (b % this.boxCols) * this.boxW;
        const numCells = {};
        for (let dr = 0; dr < this.boxH; dr++) {
          for (let dc = 0; dc < this.boxW; dc++) {
            const r = br + dr, c = bc + dc;
            if (this.grid[r][c] !== 0) continue;
            for (const n of maskToArray(this.candidates[r][c], this.size)) {
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
            tryHiddenPair('box', b, twoCellNums[i], twoCellNums[j]);
          }
        }
      }

      // 优先返回 fill，其次 elimination
      if (results.length > 0) return results[0];
      if (eliminations.length > 0) return eliminations[0];
      return null;
    }

    // ======================================================
    //  7. 区块排除 (Pointing & Claiming)
    // ======================================================
    //  7. 区块排除 (Pointing & Claiming)
    // ======================================================

    _findPointingClaiming() {
      let anyEliminated = false;
      let nakedSingleResult = null;
      const eliminatedCells = [];

      const eliminateFromCell = (r, c, val) => {
        if (this.grid[r][c] !== 0) return;
        const valBit = BIT(val);
        if (this.candidates[r][c] & valBit) {
          this.candidates[r][c] &= ~valBit;
          eliminatedCells.push({ row: r, col: c, num: val });
          anyEliminated = true;
          if (popcount(this.candidates[r][c]) === 1 && !nakedSingleResult) {
            nakedSingleResult = { row: r, col: c, num: maskToSingleNum(this.candidates[r][c]) };
          }
        }
      };

      // Pointing Pair（宫->行/列）
      const totalBoxes = this.boxRows * this.boxCols;
      for (let b = 0; b < totalBoxes; b++) {
        const br = Math.floor(b / this.boxCols) * this.boxH;
        const bc = (b % this.boxCols) * this.boxW;

        const numRows = {};
        const numCols = {};
        for (let dr = 0; dr < this.boxH; dr++) {
          for (let dc = 0; dc < this.boxW; dc++) {
            const r = br + dr, c = bc + dc;
            if (this.grid[r][c] !== 0) continue;
            for (const n of maskToArray(this.candidates[r][c], this.size)) {
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
            const batchStart = eliminatedCells.length;
            for (let c = 0; c < this.size; c++) {
              if (c >= bc && c < bc + this.boxW) continue;
              eliminateFromCell(r, c, val);
            }
            if (nakedSingleResult) {
              return {
                row: nakedSingleResult.row,
                col: nakedSingleResult.col,
                num: nakedSingleResult.num,
                evidence: {
                  type: 'pointingClaiming',
                  direction: 'row',
                  boxIndex: b,
                  lineIndex: r,
                  eliminated: eliminatedCells.slice(batchStart)
                }
              };
            }
          }
          // Pointing Column：数字在宫中只出现在同一列
          if (numCols[n].size === 1) {
            const c = [...numCols[n]][0];
            const batchStart = eliminatedCells.length;
            for (let r = 0; r < this.size; r++) {
              if (r >= br && r < br + this.boxH) continue;
              eliminateFromCell(r, c, val);
            }
            if (nakedSingleResult) {
              return {
                row: nakedSingleResult.row,
                col: nakedSingleResult.col,
                num: nakedSingleResult.num,
                evidence: {
                  type: 'pointingClaiming',
                  direction: 'col',
                  boxIndex: b,
                  lineIndex: c,
                  eliminated: eliminatedCells.slice(batchStart)
                }
              };
            }
          }
        }
      }

      // Claiming Pair（行/列->宫）
      // 行->宫
      for (let r = 0; r < this.size; r++) {
        const numBoxes = {};
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] !== 0) continue;
          const b = Math.floor(r / this.boxH) * this.boxCols + Math.floor(c / this.boxW);
          for (const n of maskToArray(this.candidates[r][c], this.size)) {
            if (!numBoxes[n]) numBoxes[n] = new Set();
            numBoxes[n].add(b);
          }
        }

        for (const n of Object.keys(numBoxes)) {
          const val = parseInt(n);
          if (numBoxes[n].size === 1) {
            const b = [...numBoxes[n]][0];
            const br = Math.floor(b / this.boxCols) * this.boxH;
            const bc = (b % this.boxCols) * this.boxW;
            // 从该宫的其他行移除
            const batchStart = eliminatedCells.length;
            for (let dr = 0; dr < this.boxH; dr++) {
              const rr = br + dr;
              if (rr === r) continue;
              for (let dc = 0; dc < this.boxW; dc++) {
                const cc = bc + dc;
                eliminateFromCell(rr, cc, val);
              }
            }
            if (nakedSingleResult) {
              return {
                row: nakedSingleResult.row,
                col: nakedSingleResult.col,
                num: nakedSingleResult.num,
                evidence: {
                  type: 'pointingClaiming',
                  direction: 'box',
                  boxIndex: b,
                  lineIndex: r,
                  eliminated: eliminatedCells.slice(batchStart)
                }
              };
            }
          }
        }
      }

      // 列->宫
      for (let c = 0; c < this.size; c++) {
        const numBoxes = {};
        for (let r = 0; r < this.size; r++) {
          if (this.grid[r][c] !== 0) continue;
          const b = Math.floor(r / this.boxH) * this.boxCols + Math.floor(c / this.boxW);
          for (const n of maskToArray(this.candidates[r][c], this.size)) {
            if (!numBoxes[n]) numBoxes[n] = new Set();
            numBoxes[n].add(b);
          }
        }

        for (const n of Object.keys(numBoxes)) {
          const val = parseInt(n);
          if (numBoxes[n].size === 1) {
            const b = [...numBoxes[n]][0];
            const br = Math.floor(b / this.boxCols) * this.boxH;
            const bc = (b % this.boxCols) * this.boxW;
            // 从该宫的其他列移除
            const batchStart = eliminatedCells.length;
            for (let dc = 0; dc < this.boxW; dc++) {
              const cc = bc + dc;
              if (cc === c) continue;
              for (let dr = 0; dr < this.boxH; dr++) {
                const rr = br + dr;
                eliminateFromCell(rr, cc, val);
              }
            }
            if (nakedSingleResult) {
              return {
                row: nakedSingleResult.row,
                col: nakedSingleResult.col,
                num: nakedSingleResult.num,
                evidence: {
                  type: 'pointingClaiming',
                  direction: 'box',
                  boxIndex: b,
                  lineIndex: c,
                  eliminated: eliminatedCells.slice(batchStart)
                }
              };
            }
          }
        }
      }

      return null;
    }

    // ======================================================
    //  8. 三子法 (Naked Triplet)
    // ======================================================

    _findNakedTriplet() {
      const eliminateFromCells = (cells, tripletMask, tripletCellsKey) => {
        let nakedSingleResult = null;
        let anyEliminated = false;
        const eliminatedCells = [];

        for (const [r, c] of cells) {
          if (tripletCellsKey.has(r * this.size + c)) continue;
          if (this.grid[r][c] !== 0) continue;

          const beforeSize = popcount(this.candidates[r][c]);
          const removedMask = this.candidates[r][c] & tripletMask;
          this.candidates[r][c] &= ~tripletMask;
          const afterSize = popcount(this.candidates[r][c]);

          if (afterSize < beforeSize) {
            anyEliminated = true;
            for (const num of maskToArray(removedMask, this.size)) {
              eliminatedCells.push({ row: r, col: c, num });
            }
            if (afterSize === 1 && !nakedSingleResult) {
              nakedSingleResult = { row: r, col: c, num: maskToSingleNum(this.candidates[r][c]) };
            }
          }
        }

        return { nakedSingleResult, anyEliminated, eliminatedCells };
      };

      const isTriplet = (cands1, cands2, cands3) => {
        const union = cands1 | cands2 | cands3;
        return popcount(union) === 3;
      };

      // 行内检查
      for (let r = 0; r < this.size; r++) {
        const rowCands = [];
        for (let c = 0; c < this.size; c++) {
          const pc = popcount(this.candidates[r][c]);
          if (this.grid[r][c] === 0 && pc >= 2 && pc <= 3) {
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
                const tripletMask = cands1 | cands2 | cands3;
                const tripletKey = new Set([r * this.size + c1, r * this.size + c2, r * this.size + c3]);
                const rowCells = Array.from({ length: this.size }, (_, cc) => [r, cc]);

                const result = eliminateFromCells(rowCells, tripletMask, tripletKey);
                if (result.nakedSingleResult) {
                  return {
                    row: result.nakedSingleResult.row,
                    col: result.nakedSingleResult.col,
                    num: result.nakedSingleResult.num,
                    evidence: {
                      type: 'nakedTriplet',
                      tripletCells: [[r, c1], [r, c2], [r, c3]],
                      tripletValues: maskToArray(tripletMask, this.size),
                      eliminated: result.eliminatedCells,
                      scopeType: 'row',
                      scopeIndex: r
                    }
                  };
                }
              }
            }
          }
        }
      }

      // 列内检查
      for (let c = 0; c < this.size; c++) {
        const colCands = [];
        for (let r = 0; r < this.size; r++) {
          const pc = popcount(this.candidates[r][c]);
          if (this.grid[r][c] === 0 && pc >= 2 && pc <= 3) {
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
                const tripletMask = cands1 | cands2 | cands3;
                const tripletKey = new Set([r1 * this.size + c, r2 * this.size + c, r3 * this.size + c]);
                const colCells = Array.from({ length: this.size }, (_, rr) => [rr, c]);

                const result = eliminateFromCells(colCells, tripletMask, tripletKey);
                if (result.nakedSingleResult) {
                  return {
                    row: result.nakedSingleResult.row,
                    col: result.nakedSingleResult.col,
                    num: result.nakedSingleResult.num,
                    evidence: {
                      type: 'nakedTriplet',
                      tripletCells: [[r1, c], [r2, c], [r3, c]],
                      tripletValues: maskToArray(tripletMask, this.size),
                      eliminated: result.eliminatedCells,
                      scopeType: 'col',
                      scopeIndex: c
                    }
                  };
                }
              }
            }
          }
        }
      }

      // 宫内检查
      const totalBoxes = this.boxRows * this.boxCols;
      for (let b = 0; b < totalBoxes; b++) {
        const br = Math.floor(b / this.boxCols) * this.boxH;
        const bc = (b % this.boxCols) * this.boxW;
        const boxCands = [];
        for (let dr = 0; dr < this.boxH; dr++) {
          for (let dc = 0; dc < this.boxW; dc++) {
            const r = br + dr, c = bc + dc;
            const pc = popcount(this.candidates[r][c]);
            if (this.grid[r][c] === 0 && pc >= 2 && pc <= 3) {
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
                const tripletMask = cands1 | cands2 | cands3;
                const tripletKey = new Set([r1 * this.size + c1, r2 * this.size + c2, r3 * this.size + c3]);
                const boxCells = [];
                for (let dr = 0; dr < this.boxH; dr++)
                  for (let dc = 0; dc < this.boxW; dc++)
                    boxCells.push([br + dr, bc + dc]);

                const result = eliminateFromCells(boxCells, tripletMask, tripletKey);
                if (result.nakedSingleResult) {
                  return {
                    row: result.nakedSingleResult.row,
                    col: result.nakedSingleResult.col,
                    num: result.nakedSingleResult.num,
                    evidence: {
                      type: 'nakedTriplet',
                      tripletCells: [[r1, c1], [r2, c2], [r3, c3]],
                      tripletValues: maskToArray(tripletMask, this.size),
                      eliminated: result.eliminatedCells,
                      scopeType: 'box',
                      scopeIndex: b
                    }
                  };
                }
              }
            }
          }
        }
      }

      return null;
    }

    // ======================================================
    //  9. 二连纵横阵 (X-Wing)
    // ======================================================

    _findXWing() {
      // 第一步：收集所有 X-Wing 模式（不修改候选）
      const patterns = [];

      // === 列 X-Wing ===
      for (let n = 1; n <= this.size; n++) {
        const rowCols = {};
        for (let r = 0; r < this.size; r++) {
          const cols = [];
          for (let c = 0; c < this.size; c++) {
            if (this.grid[r][c] === 0 && (this.candidates[r][c] & BIT(n)) !== 0) {
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

            if (cols1[0] === cols2[0] && cols1[1] === cols2[1]) {
              const [c1, c2] = cols1;
              patterns.push({
                num: n,
                direction: 'col',
                rows: [r1, r2],
                cols: [c1, c2],
                cells: [[r1, c1], [r1, c2], [r2, c1], [r2, c2]],
                description: '列X-Wing：第 ' + c1 + '、' + c2 + ' 列的 ' + n + ' 只出现在第 ' + r1 + '、' + r2 + ' 行'
              });
            }
          }
        }
      }

      // === 行 X-Wing ===
      for (let n = 1; n <= this.size; n++) {
        const colRows = {};
        for (let c = 0; c < this.size; c++) {
          const rows = [];
          for (let r = 0; r < this.size; r++) {
            if (this.grid[r][c] === 0 && (this.candidates[r][c] & BIT(n)) !== 0) {
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

            if (rows1[0] === rows2[0] && rows1[1] === rows2[1]) {
              const [r1, r2] = rows1;
              patterns.push({
                num: n,
                direction: 'row',
                rows: [r1, r2],
                cols: [c1, c2],
                cells: [[r1, c1], [r1, c2], [r2, c1], [r2, c2]],
                description: '行X-Wing：第 ' + r1 + '、' + r2 + ' 行的 ' + n + ' 只出现在第 ' + c1 + '、' + c2 + ' 列'
              });
            }
          }
        }
      }

      if (patterns.length === 0) return null;

      // 第二步：保存当前候选状态
      const savedCandidates = this._cloneCandidates();

      // 第三步：逐个测试 X-Wing 模式，收集产生 nakedSingle 的结果
      const results = [];

      for (const pattern of patterns) {
        // 恢复候选
        this._restoreCandidates(savedCandidates);

        const { num, direction, rows, cols, cells, description } = pattern;
        const excludeKey = new Set(cells.map(([r, c]) => r * this.size + c));

        let nakedSingleResult = null;
        let anyEliminated = false;
        const eliminatedCells = [];

        const eliminateFromCells = (cellList) => {
          for (const [r, c] of cellList) {
            if (excludeKey.has(r * this.size + c)) continue;
            if (this.grid[r][c] !== 0) continue;
            const beforeSize = popcount(this.candidates[r][c]);
            this.candidates[r][c] &= ~BIT(num);
            const afterSize = popcount(this.candidates[r][c]);
            if (afterSize < beforeSize) {
              anyEliminated = true;
              eliminatedCells.push({ row: r, col: c, num });
              if (afterSize === 1 && !nakedSingleResult) {
                nakedSingleResult = { row: r, col: c, num: maskToSingleNum(this.candidates[r][c]) };
              }
            }
          }
        };

        if (direction === 'row') {
          for (const r of rows) {
            eliminateFromCells(Array.from({ length: this.size }, (_, cc) => [r, cc]));
          }
        } else {
          for (const c of cols) {
            eliminateFromCells(Array.from({ length: this.size }, (_, rr) => [rr, c]));
          }
        }

        if (nakedSingleResult) {
          results.push({
            row: nakedSingleResult.row,
            col: nakedSingleResult.col,
            num: nakedSingleResult.num,
            type: 'fill',
            evidence: {
              num: num,
              rows: rows.slice(),
              cols: cols.slice(),
              cells: cells.map(c => [c[0], c[1]]),
              direction: direction,
              description: description,
              eliminatedCells: eliminatedCells.slice()
            }
          });
        } else if (anyEliminated) {
          // 排除类结果：用 X-Wing 第一个角格作为影响力评估参考
          results.push({
            row: cells[0][0],
            col: cells[0][1],
            num: num,
            type: 'elimination',
            evidence: {
              num: num,
              rows: rows.slice(),
              cols: cols.slice(),
              cells: cells.map(c => [c[0], c[1]]),
              direction: direction,
              description: description,
              eliminatedCells: eliminatedCells.slice()
            }
          });
        }
      }

      if (results.length === 0) {
        // 没有产生任何排除（理论上不会出现），恢复状态并返回 null
        this._restoreCandidates(savedCandidates);
        return null;
      }

      // 第四步：选出影响力最高的结果
      // 优先选择 fill 类型的结果
      const fillResults = results.filter(r => r.type === 'fill');
      const best = fillResults.length > 0
        ? this._pickMostInfluential(fillResults)
        : this._pickMostInfluential(results);

      // 第五步：恢复原始状态，然后应用最优 X-Wing 的排除
      this._restoreCandidates(savedCandidates);

      const bestPattern = patterns.find(p =>
        p.num === best.evidence.num &&
        p.direction === best.evidence.direction &&
        p.rows[0] === best.evidence.rows[0] &&
        p.rows[1] === best.evidence.rows[1] &&
        p.cols[0] === best.evidence.cols[0] &&
        p.cols[1] === best.evidence.cols[1]
      );

      if (bestPattern) {
        const excludeKey = new Set(bestPattern.cells.map(([r, c]) => r * this.size + c));
        const cellList = bestPattern.direction === 'row'
          ? bestPattern.rows.flatMap(r => Array.from({ length: this.size }, (_, cc) => [r, cc]))
          : bestPattern.cols.flatMap(c => Array.from({ length: this.size }, (_, rr) => [rr, c]));

        for (const [r, c] of cellList) {
          if (excludeKey.has(r * this.size + c)) continue;
          if (this.grid[r][c] !== 0) continue;
          this.candidates[r][c] &= ~BIT(bestPattern.num);
        }
      }

      // 返回格式与原有兼容（仅 fill 类型返回结果，elimination 类型返回 null）
      // 但记录最后一次排除的证据，供 solve() 记录 elimination 步骤使用
      if (best.type === 'fill') {
        this._lastEliminationEvidence = null;
        return {
          row: best.row,
          col: best.col,
          num: best.num,
          type: best.type,
          evidence: best.evidence
        };
      } else {
        // elimination 类型：保存证据供后续使用，返回 null 保持向后兼容
        this._lastEliminationEvidence = best.evidence;
        return null;
      }
    }

    // ======================================================
    //  10. 三才游鱼阵 (Swordfish)
    // ======================================================

    _findSwordfish() {
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

      // 第一步：收集所有 Swordfish 模式（不修改候选）
      const patterns = [];

      // === 列 Swordfish ===
      for (let n = 1; n <= this.size; n++) {
        const rowColsMap = {};
        for (let r = 0; r < this.size; r++) {
          const cols = [];
          for (let c = 0; c < this.size; c++) {
            if (this.grid[r][c] === 0 && (this.candidates[r][c] & BIT(n)) !== 0) {
              cols.push(c);
            }
          }
          if (cols.length >= 2 && cols.length <= 3) {
            rowColsMap[r] = cols.sort((a, b) => a - b);
          }
        }

        const rowsWithFew = Object.keys(rowColsMap).map(Number);
        if (rowsWithFew.length < 3) continue;

        const rowCombos = combinations(rowsWithFew, 3);
        for (const [r1, r2, r3] of rowCombos) {
          const cols1 = rowColsMap[r1];
          const cols2 = rowColsMap[r2];
          const cols3 = rowColsMap[r3];

          const allCols = new Set([...cols1, ...cols2, ...cols3]);
          if (allCols.size !== 3) continue;

          const colArr = [...allCols].sort((a, b) => a - b);
          const [c1, c2, c3] = colArr;

          const cells = [];
          const excludeKey = new Set();
          for (const r of [r1, r2, r3]) {
            for (const c of colArr) {
              if (this.grid[r][c] === 0 && (this.candidates[r][c] & BIT(n)) !== 0) {
                cells.push([r, c]);
                excludeKey.add(r * this.size + c);
              }
            }
          }

          patterns.push({
            num: n,
            direction: 'col',
            rows: [r1, r2, r3],
            cols: [c1, c2, c3],
            cells: cells,
            description: '列Swordfish：第 ' + c1 + '、' + c2 + '、' + c3 + ' 列的 ' + n + ' 只出现在第 ' + r1 + '、' + r2 + '、' + r3 + ' 行'
          });
        }
      }

      // === 行 Swordfish ===
      for (let n = 1; n <= this.size; n++) {
        const colRowsMap = {};
        for (let c = 0; c < this.size; c++) {
          const rows = [];
          for (let r = 0; r < this.size; r++) {
            if (this.grid[r][c] === 0 && (this.candidates[r][c] & BIT(n)) !== 0) {
              rows.push(r);
            }
          }
          if (rows.length >= 2 && rows.length <= 3) {
            colRowsMap[c] = rows.sort((a, b) => a - b);
          }
        }

        const colsWithFew = Object.keys(colRowsMap).map(Number);
        if (colsWithFew.length < 3) continue;

        const colCombos = combinations(colsWithFew, 3);
        for (const [c1, c2, c3] of colCombos) {
          const rows1 = colRowsMap[c1];
          const rows2 = colRowsMap[c2];
          const rows3 = colRowsMap[c3];

          const allRows = new Set([...rows1, ...rows2, ...rows3]);
          if (allRows.size !== 3) continue;

          const rowArr = [...allRows].sort((a, b) => a - b);
          const [r1, r2, r3] = rowArr;

          const cells = [];
          const excludeKey = new Set();
          for (const c of [c1, c2, c3]) {
            for (const r of rowArr) {
              if (this.grid[r][c] === 0 && (this.candidates[r][c] & BIT(n)) !== 0) {
                cells.push([r, c]);
                excludeKey.add(r * this.size + c);
              }
            }
          }

          patterns.push({
            num: n,
            direction: 'row',
            rows: [r1, r2, r3],
            cols: [c1, c2, c3],
            cells: cells,
            description: '行Swordfish：第 ' + r1 + '、' + r2 + '、' + r3 + ' 行的 ' + n + ' 只出现在第 ' + c1 + '、' + c2 + '、' + c3 + ' 列'
          });
        }
      }

      if (patterns.length === 0) return null;

      // 第二步：保存当前候选状态
      const savedCandidates = this._cloneCandidates();

      // 第三步：逐个测试 Swordfish 模式，收集产生 nakedSingle 的结果
      const results = [];

      for (const pattern of patterns) {
        this._restoreCandidates(savedCandidates);

        const { num, direction, rows, cols, cells, description } = pattern;
        const excludeKey = new Set(cells.map(([r, c]) => r * this.size + c));

        let nakedSingleResult = null;
        let anyEliminated = false;
        const eliminatedCells = [];

        const eliminateFromCells = (cellList) => {
          for (const [r, c] of cellList) {
            if (excludeKey.has(r * this.size + c)) continue;
            if (this.grid[r][c] !== 0) continue;
            const beforeSize = popcount(this.candidates[r][c]);
            this.candidates[r][c] &= ~BIT(num);
            const afterSize = popcount(this.candidates[r][c]);
            if (afterSize < beforeSize) {
              anyEliminated = true;
              eliminatedCells.push({ row: r, col: c, num });
              if (afterSize === 1 && !nakedSingleResult) {
                nakedSingleResult = { row: r, col: c, num: maskToSingleNum(this.candidates[r][c]) };
              }
            }
          }
        };

        if (direction === 'row') {
          for (const r of rows) {
            eliminateFromCells(Array.from({ length: this.size }, (_, cc) => [r, cc]));
          }
        } else {
          for (const c of cols) {
            eliminateFromCells(Array.from({ length: this.size }, (_, rr) => [rr, c]));
          }
        }

        if (nakedSingleResult) {
          results.push({
            row: nakedSingleResult.row,
            col: nakedSingleResult.col,
            num: nakedSingleResult.num,
            type: 'fill',
            evidence: {
              num: num,
              rows: rows.slice(),
              cols: cols.slice(),
              cells: cells.map(c => [c[0], c[1]]),
              direction: direction,
              description: description,
              eliminatedCells: eliminatedCells.slice()
            }
          });
        } else if (anyEliminated) {
          results.push({
            row: cells[0][0],
            col: cells[0][1],
            num: num,
            type: 'elimination',
            evidence: {
              num: num,
              rows: rows.slice(),
              cols: cols.slice(),
              cells: cells.map(c => [c[0], c[1]]),
              direction: direction,
              description: description,
              eliminatedCells: eliminatedCells.slice()
            }
          });
        }
      }

      if (results.length === 0) {
        this._restoreCandidates(savedCandidates);
        return null;
      }

      // 第四步：选出影响力最高的结果
      const fillResults = results.filter(r => r.type === 'fill');
      const best = fillResults.length > 0
        ? this._pickMostInfluential(fillResults)
        : this._pickMostInfluential(results);

      // 第五步：恢复原始状态，然后应用最优 Swordfish 的排除
      this._restoreCandidates(savedCandidates);

      // 找到对应 pattern
      const bestPattern = patterns.find(p =>
        p.num === best.evidence.num &&
        p.direction === best.evidence.direction &&
        p.rows.length === best.evidence.rows.length &&
        p.rows[0] === best.evidence.rows[0] &&
        p.rows[1] === best.evidence.rows[1] &&
        p.rows[2] === best.evidence.rows[2] &&
        p.cols[0] === best.evidence.cols[0] &&
        p.cols[1] === best.evidence.cols[1] &&
        p.cols[2] === best.evidence.cols[2]
      );

      if (bestPattern) {
        const excludeKey = new Set(bestPattern.cells.map(([r, c]) => r * this.size + c));
        const cellList = bestPattern.direction === 'row'
          ? bestPattern.rows.flatMap(r => Array.from({ length: this.size }, (_, cc) => [r, cc]))
          : bestPattern.cols.flatMap(c => Array.from({ length: this.size }, (_, rr) => [rr, c]));

        for (const [r, c] of cellList) {
          if (excludeKey.has(r * this.size + c)) continue;
          if (this.grid[r][c] !== 0) continue;
          this.candidates[r][c] &= ~BIT(bestPattern.num);
        }
      }

      // 返回格式与原有兼容（仅 fill 类型返回结果，elimination 类型返回 null）
      if (best.type === 'fill') {
        this._lastEliminationEvidence = null;
        return {
          row: best.row,
          col: best.col,
          num: best.num,
          type: best.type,
          evidence: best.evidence
        };
      } else {
        this._lastEliminationEvidence = best.evidence;
        return null;
      }
    }

    // ======================================================
    //  填数并更新候选
    // ======================================================

    _fillCell(row, col, num) {
      this.grid[row][col] = num;
      this.candidates[row][col] = BIT(num);
      const numBit = BIT(num);

      // 同行
      for (let c = 0; c < this.size; c++) {
        if (c !== col && this.grid[row][c] === 0) {
          this.candidates[row][c] &= ~numBit;
        }
      }
      // 同列
      for (let r = 0; r < this.size; r++) {
        if (r !== row && this.grid[r][col] === 0) {
          this.candidates[r][col] &= ~numBit;
        }
      }
      // 同宫
      const br = Math.floor(row / this.boxH) * this.boxH;
      const bc = Math.floor(col / this.boxW) * this.boxW;
      for (let dr = 0; dr < this.boxH; dr++) {
        for (let dc = 0; dc < this.boxW; dc++) {
          const r = br + dr, c = bc + dc;
          if ((r !== row || c !== col) && this.grid[r][c] === 0) {
            this.candidates[r][c] &= ~numBit;
          }
        }
      }

      // 笼子约束（重新应用当前格所在笼子的完整约束：去重 + 和值）
      const cage = this.cellCage[row * this.size + col];
      if (cage) {
        this._applyCageConstraintsForCage(cage);
      }
    }

    // ======================================================
    //  难度评级
    // ======================================================

    /**
     * 获取难度评级
     * @returns {Object} { solvable, level, score, maxTechLevel, totalSteps, nonTrivialRatio, techCount, totalDepth, cellTech, remainingCells }
     */
    getRating() {
      // 使用缓存，避免重复计算
      if (this._cachedRating) return this._cachedRating;

      const techCount = {};
      let maxLevel = 0;
      let totalDepth = 0;

      for (const step of this.steps) {
        const tech = step.technique;
        techCount[tech] = (techCount[tech] || 0) + 1;
        maxLevel = Math.max(maxLevel, TECHNIQUES[tech].level);
        totalDepth += step.depth;
      }

      const remainingCells = this._countEmptyCells();
      const totalSteps = this.steps.length;
      const nakedSingleCount = techCount.nakedSingle || 0;
      const nonTrivialCount = totalSteps - nakedSingleCount;
      const nonTrivialRatio = totalSteps > 0 ? nonTrivialCount / totalSteps : 0;

      // === 综合难度分计算 (0-1000) ===

      // 1. 最高技巧等级基础分
      const baseScore = maxLevel * 100;

      // 2. 剩余空格修正因子（按比例适配不同尺寸）
      const totalCells = this.size * this.size;
      const remainingRatio = remainingCells / totalCells;
      let remainingFactor;
      if (remainingCells === 0) {
        remainingFactor = -1.0;       // 全解
      } else if (remainingRatio <= 0.25) {
        remainingFactor = 0;          // ~25% 以下
      } else if (remainingRatio <= 0.5) {
        remainingFactor = 0.5;        // 25% ~ 50%
      } else if (remainingRatio <= 0.75) {
        remainingFactor = 1.0;        // 50% ~ 75%
      } else {
        remainingFactor = 1.5;        // 75%+
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
      let level;
      if (score < 250) {
        level = '1星';     // 入门：孤星为主
      } else if (score < 400) {
        level = '2星';     // 简单：基本笼子推理
      } else if (score < 525) {
        level = '3星';     // 进阶：隐曜/星衡法则等
      } else if (score < 600) {
        level = '4星';     // 困难：数对技巧
      } else {
        level = '5星';     // 专家：技巧密度高
      }

      // 将 cellTech 从数字 key(r*size+c) 转换为字符串 key('r_c')
      const cellTechStr = {};
      for (const key in this.cellTech) {
        const idx = Number(key);
        const r = Math.floor(idx / this.size);
        const c = idx % this.size;
        cellTechStr[r + '_' + c] = this.cellTech[key];
      }

      const result = {
        solvable: remainingCells === 0,
        level,
        score,
        maxTechLevel: maxLevel,
        totalSteps,
        remainingCells,
        nonTrivialRatio: Math.round(nonTrivialRatio * 1000) / 1000,
        techCount,
        totalDepth,
        cellTech: cellTechStr,
        // V4.3.11：笔记暴露——候选总量（进度度量：progress = 1 - totalCandidates/initialCandidates）
        totalCandidates: this._countTotalCandidates(),
        initialCandidates: this._initialCandidatesTotal || 0
      };

      // 缓存结果
      this._cachedRating = result;
      return result;
    }

    // ======================================================
    //  三阶段剧本 (开局-破局-收官)
    // ======================================================

    /**
     * 生成三阶段戏剧演出剧本（开局-破局-收官）
     * 顺水推舟策略：从 steps 中提取最高级技巧作为破局点，
     * 破局点之后的所有 fill 步骤就是天然的多米诺级联序列。
     *
     * @returns {Object|null} 三阶段剧本，无高级技巧则返回 null
     */
    getTriPhaseScript() {
      const steps = this.steps;
      if (!steps || steps.length === 0) return null;

      // 1. 用 teachingBreakthroughScore 挑选破局点（技术卡点 / 教学价值最高的步骤）
      //    teachingBreakthroughScore = techLevel × eliminatedCandidates × cascadeLength × affectedCells
      //    相比纯 depth 判断：能排除候选多、引发的级联长、波及格子多的步骤胜出，
      //    更贴合"教学导演"挑选最能引发玩家顿悟的位置。
      let breakPointIndex = -1;
      let breakStep = null;
      let bestTeachingBreakdown = null;
      let maxTeachingBreakthroughScore = 0;

      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        // 只考虑非基础技巧步骤（depth>0），纯孤星题不生成三阶段剧本
        if (!s.depth || s.depth <= 0) continue;
        const breakdown = this._computeTeachingBreakthroughBreakdown(s, i);
        if (breakdown.score > maxTeachingBreakthroughScore) {
          maxTeachingBreakthroughScore = breakdown.score;
          breakPointIndex = i;
          breakStep = s;
          bestTeachingBreakdown = breakdown;
        }
      }

      // 没有非基础技巧步骤 -> 纯基础技巧题，不生成三阶段剧本
      if (breakPointIndex === -1 || !breakStep || maxTeachingBreakthroughScore <= 0) {
        return null;
      }

      // 2. 确定核心破局格和级联序列
      let coreMove;
      let cascadeStartIndex;

      if (breakStep.type === 'fill') {
        // 破局点本身就是 fill -> 这步就是"雪崩的第一块骨牌"
        coreMove = { row: breakStep.row, col: breakStep.col, value: breakStep.num };
        cascadeStartIndex = breakPointIndex + 1;
      } else {
        // 破局点是 elimination -> 核心格是之后第一个被填的格子
        const firstFillAfter = steps.slice(breakPointIndex + 1).find(s => s.type === 'fill');
        if (firstFillAfter) {
          coreMove = { row: firstFillAfter.row, col: firstFillAfter.col, value: firstFillAfter.num };
          cascadeStartIndex = breakPointIndex + 2;
        } else {
          return null;
        }
      }

      // 3. 破局点之后的所有 fill 步骤 -> 天然多米诺级联序列
      const cascadeSteps = steps.slice(cascadeStartIndex).filter(s => s.type === 'fill');
      const cascadeSequence = cascadeSteps.map(s => ({
        row: s.row,
        col: s.col,
        value: s.num,
        cellId: s.row * this.size + s.col,
      }));

      // 4. 计算技巧关联高亮区域
      const highlightAxes = this._calcSkillHighlightAxes(breakStep.technique, coreMove, breakStep.evidence);

      // 5. 划分三阶段
      const openingSteps = steps.slice(0, breakPointIndex);
      const openingFills = openingSteps.filter(s => s.type === 'fill').length;
      const endingSteps = steps.slice(cascadeStartIndex);
      const endingFills = endingSteps.filter(s => s.type === 'fill').length;

      return {
        targetSkill: breakStep.technique,
        targetSkillName: breakStep.techniqueName,
        skillLevel: TECHNIQUES[breakStep.technique] ? TECHNIQUES[breakStep.technique].level : 5,
        skillName: TECHNIQUES[breakStep.technique] ? TECHNIQUES[breakStep.technique].name : breakStep.technique,
        // 2026-08-09：教学破局分数——量化该破局点的教学价值（非难度）
        teachingBreakthroughScore: maxTeachingBreakthroughScore,
        teachingBreakthroughBreakdown: bestTeachingBreakdown,
        breakPointIndex: breakPointIndex,
        breakPointType: breakStep.type,
        coreMove: {
          row: coreMove.row,
          col: coreMove.col,
          value: coreMove.value,
          cascadeCount: cascadeSequence.length,
          cascadeSequence: cascadeSequence,
        },
        highlightAxes: highlightAxes,
        totalCascadeCount: cascadeSequence.length,
        opening: {
          stepCount: openingSteps.length,
          fillCount: openingFills,
          steps: openingSteps
        },
        breakthrough: {
          step: breakStep,
          coreMove: coreMove
        },
        ending: {
          stepCount: endingSteps.length,
          fillCount: endingFills,
          steps: endingSteps
        },
        cascades: cascadeSequence
      };
    }

    /**
     * 计算技巧关联的高亮轴线/区域
     * 用于被动教学模式下框选提示范围
     */
    _calcSkillHighlightAxes(skill, coreMove, evidence) {
      if (!coreMove) return null;
      const { row, col } = coreMove;
      const axes = { rows: [], cols: [], cages: [] };
      const s = skill.toLowerCase();

      // 优先从 evidence 中读取高亮行/列（X-Wing/Swordfish 等）
      if (evidence && evidence.rows && Array.isArray(evidence.rows)) {
        axes.rows = evidence.rows.slice();
      }
      if (evidence && evidence.cols && Array.isArray(evidence.cols)) {
        axes.cols = evidence.cols.slice();
      }
      // 如果 evidence 中已有行/列，直接返回（跳过下面的硬编码逻辑）
      if (evidence && evidence.rows && evidence.cols) {
        return axes;
      }

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
        case 'cageunique':
          axes.cages.push('current');
          break;
        case 'nakedtriplet':
          axes.rows.push(row);
          break;
        case 'xwing':
        case 'swordfish':
          // 2026-08-09：evidence 不完整时「宁可 return null」也不随机 fallback。
          // 教学游戏最怕"老师告诉学生看错地方"——没有可信的高亮轴线就干脆不高亮。
          return null;
        default:
          axes.rows.push(row);
          axes.cols.push(col);
      }
      return axes;
    }

    // ======================================================
    //  公共 API 方法
    // ======================================================

    /**
     * 公共执行接口：在指定格子填入数字，并更新候选集
     * @param {number} r - 行索引
     * @param {number} c - 列索引
     * @param {number} num - 填入的数字
     * @param {boolean} isSimulation - 是否为模拟（不记录步骤）
     * @returns {boolean} 是否成功填入
     */
    applyMove(r, c, num, isSimulation = false) {
      if (r < 0 || r >= this.size || c < 0 || c >= this.size) return false;
      if (num < 1 || num > this.size) return false;
      if (this.grid[r][c] !== 0) return false;
      if ((this.candidates[r][c] & BIT(num)) === 0) return false;

      this._fillCell(r, c, num);

      if (!isSimulation) {
        this.steps.push({
          row: r,
          col: c,
          num: num,
          technique: 'manual',
          techniqueName: '手动填入',
          type: 'fill',
          depth: 0,
          evidence: null
        });
      }

      return true;
    }

    /**
     * 冲突检测：检查当前盘面是否存在冲突
     * 检查内容：
     * - 行/列/宫内是否有重复数字
     * - 任意空格候选数是否为 0（死格）
     * - 笼子和是否违反约束
     * @returns {boolean} 是否存在冲突
     */
    hasConflict() {
      // 1. 检查行/列/宫重复
      for (let i = 0; i < this.size; i++) {
        let rowMask = 0, colMask = 0;
        for (let j = 0; j < this.size; j++) {
          const rv = this.grid[i][j];
          if (rv !== 0) {
            const rb = BIT(rv);
            if (rowMask & rb) return true;
            rowMask |= rb;
          }
          const cv = this.grid[j][i];
          if (cv !== 0) {
            const cb = BIT(cv);
            if (colMask & cb) return true;
            colMask |= cb;
          }
        }
      }

      // 检查宫重复
      for (let br = 0; br < this.boxRows; br++) {
        for (let bc = 0; bc < this.boxCols; bc++) {
          let boxMask = 0;
          const startR = br * this.boxH;
          const startC = bc * this.boxW;
          for (let dr = 0; dr < this.boxH; dr++) {
            for (let dc = 0; dc < this.boxW; dc++) {
              const v = this.grid[startR + dr][startC + dc];
              if (v !== 0) {
                const b = BIT(v);
                if (boxMask & b) return true;
                boxMask |= b;
              }
            }
          }
        }
      }

      // 2. 检查是否有空格候选数为 0
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] === 0 && this.candidates[r][c] === 0) {
            return true;
          }
        }
      }

      // 3. 检查笼子和约束
      for (const cage of this.cages) {
        let placedSum = 0;
        let emptyCount = 0;
        let minRemain = 0;
        let maxRemain = 0;
        for (const [r, c] of cage.cells) {
          if (this.grid[r][c] !== 0) {
            placedSum += this.grid[r][c];
          } else {
            emptyCount++;
            // 最小/最大剩余和
            const candArr = maskToArray(this.candidates[r][c], this.size);
            if (candArr.length === 0) return true; // 死格
            minRemain += candArr[0];
            maxRemain += candArr[candArr.length - 1];
          }
        }
        const remain = cage.sum - placedSum;
        if (emptyCount > 0) {
          if (remain < minRemain || remain > maxRemain) return true;
        } else {
          if (placedSum !== cage.sum) return true;
        }
      }

      return false;
    }

    /**
     * 获取指定格子的候选数 bitmask
     * @param {number} r - 行索引
     * @param {number} c - 列索引
     * @returns {number} 候选数 bitmask（0 表示无候选）
     */
    getCandidates(r, c) {
      if (r < 0 || r >= this.size || c < 0 || c >= this.size) return 0;
      return this.candidates[r][c];
    }

    /**
     * 获取全盘候选矩阵（数组形式）——笔记盘面公开 API（V4.3.11 新增）
     * 已填格返回 []，空格返回候选数字数组（升序）。
     * 按需计算，不缓存、不存快照，性能开销 O(size²)。
     * @returns {Array<Array<Array<number>>>} result[r][c] = [候选数字...]
     */
    getCandidatesGrid() {
      const result = [];
      for (let r = 0; r < this.size; r++) {
        result[r] = [];
        for (let c = 0; c < this.size; c++) {
          if (this.grid[r][c] !== 0) {
            result[r][c] = [];
          } else {
            result[r][c] = maskToArray(this.candidates[r][c], this.size);
          }
        }
      }
      return result;
    }

    /**
     * 获取当前盘面所有空格的候选总数——进度度量用（V4.3.11 新增）
     * @returns {number}
     */
    getTotalCandidates() {
      return this._countTotalCandidates();
    }

    /**
     * 获取初始候选总量（求解前）——进度度量分母（V4.3.11 新增）
     * @returns {number}
     */
    getInitialCandidates() {
      return this._initialCandidatesTotal || 0;
    }

    // ======================================================
    //  教学破局分数（teachingBreakthroughScore）— 教学导演核心指标
    //    teachingBreakthroughScore = techLevel × eliminatedCandidates
    //                                × cascadeLength × affectedCells
    //    用于挑选"教学价值最高"的破局点（替代纯 depth 判断）。
    //    注意：这是教学价值指标，不是难度指标。
    // ======================================================

    /**
     * 计算某一步骤的教学破局分数分解。
     * @param {Object} step - 步骤记录
     * @param {number} index - 步骤在 this.steps 中的下标
     * @returns {{techLevel:number, eliminatedCandidates:number, cascadeLength:number, affectedCells:number, score:number}}
     */
    _computeTeachingBreakthroughBreakdown(step, index) {
      const tech = step.technique;
      const techLevel = (TECHNIQUES[tech] && TECHNIQUES[tech].level) || 0;

      // --- eliminatedCandidates：本步消除的候选数 ---
      let eliminatedCandidates = 0;
      if (step.type === 'elimination') {
        eliminatedCandidates = step.eliminatedCandidates || 0;
      } else if (step.type === 'fill') {
        eliminatedCandidates = (step.removedCandidates && step.removedCandidates.length) || 0;
      }

      // --- affectedCells：受本步影响的格子数 ---
      let affectedCells = 0;
      if (step.evidence && Array.isArray(step.evidence.eliminatedCells)) {
        affectedCells = step.evidence.eliminatedCells.length;
      } else if (step.type === 'elimination') {
        affectedCells = eliminatedCandidates;
      } else if (step.type === 'fill') {
        affectedCells = this._countAffectedPeersAt(step, index);
      }

      // --- cascadeLength：本步之后"直接解锁"的填数级联长度 ---
      const cascadeLength = this._countCascadeAfter(step, index);

      return {
        techLevel,
        eliminatedCandidates,
        cascadeLength,
        affectedCells,
        score: techLevel * eliminatedCandidates * cascadeLength * affectedCells,
      };
    }

    /**
     * 统计 fill 步的"冲击波范围"：落子数字所能约束的格子数。
     * 取该格同行/同列/同宫/同笼中、在本步发生时仍为空格的全部格子（去重并集）。
     * 与本步之后才填上的级联（_countCascadeAfter）是两个不同维度：
     * 冲击波范围衡量"这一落子压住了多大区域"，级联衡量"随后解锁了几步"。
     */
    _countAffectedPeersAt(step, index) {
      if (step.row === undefined || step.col === undefined) return 0;
      const size = this.size;
      // 收集 index（含本步）之前已填的格子 —— 本步发生时这些格已非空格
      const filled = new Set();
      for (let i = 0; i <= index; i++) {
        const s = this.steps[i];
        if (s.type === 'fill' && s.row !== undefined && s.col !== undefined) {
          filled.add(s.row * size + s.col);
        }
      }
      const selfKey = step.row * size + step.col;
      const affected = new Set();
      const addPeer = (r, c) => {
        if (r < 0 || r >= size || c < 0 || c >= size) return;
        const key = r * size + c;
        if (key === selfKey || filled.has(key)) return;
        affected.add(key);
      };
      // 行
      for (let c = 0; c < size; c++) addPeer(step.row, c);
      // 列
      for (let r = 0; r < size; r++) addPeer(r, step.col);
      // 宫
      const br = Math.floor(step.row / this.boxH) * this.boxH;
      const bc = Math.floor(step.col / this.boxW) * this.boxW;
      for (let r = br; r < br + this.boxH; r++) {
        for (let c = bc; c < bc + this.boxW; c++) addPeer(r, c);
      }
      // 笼
      const cage = this.cellCage[step.row * size + step.col];
      if (cage && Array.isArray(cage.cells)) {
        for (const [r, c] of cage.cells) addPeer(r, c);
      }
      return affected.size;
    }

    /**
     * 统计本步之后的后续 fill 步数（多米诺链长度）。
     * - fill 步：后续与该格同区域（行/列/宫/笼）的 fill 步。
     * - elimination 步：后续落在其排除格集合内、或与其同区域的 fill 步。
     */
    _countCascadeAfter(step, index) {
      let count = 0;
      const eliminatedCells = (step.evidence && Array.isArray(step.evidence.eliminatedCells))
        ? step.evidence.eliminatedCells
        : null;

      // elimination 无坐标时，用其排除的最后一个格作为区域锚点
      let anchorRow = step.row;
      let anchorCol = step.col;
      if (step.type === 'elimination' && (step.row === undefined || step.col === undefined)) {
        if (eliminatedCells && eliminatedCells.length) {
          anchorRow = eliminatedCells[eliminatedCells.length - 1][0];
          anchorCol = eliminatedCells[eliminatedCells.length - 1][1];
        }
      }

      for (let i = index + 1; i < this.steps.length; i++) {
        const s = this.steps[i];
        if (s.type !== 'fill' || s.row === undefined || s.col === undefined) continue;
        // 落在排除格集合内
        if (eliminatedCells && eliminatedCells.some(([r, c]) => r === s.row && c === s.col)) {
          count++;
          continue;
        }
        // 与破局点在同一个区域
        if (anchorRow !== undefined && anchorCol !== undefined &&
            this._sameRegion(anchorRow, anchorCol, s.row, s.col)) {
          count++;
        }
      }
      return count;
    }

    /**
     * 判断两格是否同区域（同行/同列/同宫/同笼）
     */
    _sameRegion(r1, c1, r2, c2) {
      if (r1 === r2 || c1 === c2) return true;
      // 同宫
      const br1 = Math.floor(r1 / this.boxH) * this.boxH;
      const bc1 = Math.floor(c1 / this.boxW) * this.boxW;
      const br2 = Math.floor(r2 / this.boxH) * this.boxH;
      const bc2 = Math.floor(c2 / this.boxW) * this.boxW;
      if (br1 === br2 && bc1 === bc2) return true;
      // 同笼
      if (this.cellCage) {
        const cage1 = this.cellCage[r1 * this.size + c1];
        const cage2 = this.cellCage[r2 * this.size + c2];
        if (cage1 && cage2 && cage1 === cage2) return true;
      }
      return false;
    }

    // ======================================================
    //  关卡分析报告（关卡设计 / 管理工具）
    // ======================================================

    /**
     * 导出关卡分析报告：难度评级 + 教学价值 + 技巧分布。
     * 供关卡设计器 / 剧情编排使用，判断某关是否适合作为教学关卡。
     * @returns {Object}
     */
    exportLevelReport() {
      const rating = this.getRating();
      const triPhase = this.getTriPhaseScript();

      // 技巧分布：按技巧分组统计
      const techniqueProfile = {};
      for (const step of this.steps) {
        const tech = step.technique;
        if (!techniqueProfile[tech]) {
          const def = TECHNIQUES[tech];
          techniqueProfile[tech] = {
            name: def ? def.name : tech,
            level: def ? def.level : 0,
            fillCount: 0,
            eliminationCount: 0,
            cells: [],
          };
        }
        if (step.type === 'fill') {
          techniqueProfile[tech].fillCount++;
          if (step.row !== undefined && step.col !== undefined) {
            techniqueProfile[tech].cells.push([step.row, step.col]);
          }
        } else {
          techniqueProfile[tech].eliminationCount++;
        }
      }

      return {
        size: this.size,
        solvable: rating.solvable,
        remainingCells: rating.remainingCells,
        difficultyRating: {
          level: rating.level,
          score: rating.score,
          maxTechLevel: rating.maxTechLevel,
          totalSteps: rating.totalSteps,
          nonTrivialRatio: rating.nonTrivialRatio,
          totalDepth: rating.totalDepth,
          techCount: rating.techCount,
        },
        teaching: {
          hasBreakthrough: !!triPhase,
          targetSkill: triPhase ? triPhase.targetSkill : null,
          targetSkillName: triPhase ? triPhase.targetSkillName : null,
          skillLevel: triPhase ? triPhase.skillLevel : null,
          teachingBreakthroughScore: triPhase ? triPhase.teachingBreakthroughScore : null,
          teachingBreakthroughBreakdown: triPhase ? triPhase.teachingBreakthroughBreakdown : null,
          totalCascadeCount: triPhase ? triPhase.totalCascadeCount : 0,
          opening: triPhase ? { stepCount: triPhase.opening.stepCount, fillCount: triPhase.opening.fillCount } : null,
          ending: triPhase ? { stepCount: triPhase.ending.stepCount, fillCount: triPhase.ending.fillCount } : null,
        },
        techniqueProfile,
        cellTech: rating.cellTech,
      };
    }
  }

  // ========================================================
  //  静态属性
  // ========================================================

  TechRater.TECHNIQUES = TECHNIQUES;
  TechRater.TECH_PRIORITY_9 = TECH_PRIORITY_9;
  TechRater.TECH_PRIORITY_6 = TECH_PRIORITY_6;
  TechRater.TECH_PRIORITY_4 = TECH_PRIORITY_4;

  // ========================================================
  //  模块导出
  // ========================================================

  // Node.js / CommonJS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      TechRater,
      TECHNIQUES,
      TECH_PRIORITY_9,
      TECH_PRIORITY_6,
      TECH_PRIORITY_4
    };
  }

  // 浏览器环境：暴露到全局
  if (typeof window !== 'undefined') {
    window.TechRater = TechRater;
  }

  // 全局挂载（兼容其他环境）
  if (global) {
    global.TechRater = TechRater;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
