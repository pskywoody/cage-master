/**
 * ============================================================
 *  TechRaterAdapter - 三色节奏适配层
 * ============================================================
 *
 *  将 TechRater 的纯数学求解结果，转化为三色节奏元数据，
 *  并注入心理学加权规则。
 *
 *  三色系统：
 *    🟢 simple (绿色) - 开局·心流速填：低认知负荷
 *    🔴 gate   (红色) - 破局·顿悟攻坚：必须引入新技巧
 *    🟡 core   (黄色) - 收官·掌控雪崩：破局后连锁填出
 *
 *  公共 API:
 *    - new TechRaterAdapter(board)   从 Board 创建适配层
 *    - adapter.generateHeatmap()     生成三色热力图元数据
 *    - adapter.recomputeHeatmap()    重新计算（玩家填/擦后）
 *    - TechRaterAdapter.CONFIG       配置调参入口
 *
 * ============================================================
 */

(function(global) {

  'use strict';

  // ========================================================
  //  配置调参入口
  // ========================================================

  const ADAPTER_CONFIG = {
    // 破局点深度阈值（综合难度分 >= 此值视为 gate）
    GATE_DEPTH_THRESHOLD: 3,

    // simple 格的最大难度分（<= 此值视为 simple）
    SIMPLE_SCORE_MAX: 1,

    // 被归类为 simple 的技巧（保留用于参考，不再直接决定分类）
    SIMPLE_TECHNIQUES: ['nakedSingle', 'cageUnique'],

    // 颜色定义
    COLORS: {
      simple: '#4CAF50',   // 绿
      core:   '#FFC107',   // 黄
      gate:   '#F44336',   // 红
      filled: '#2a2a2a',   // 已填
      unknown: '#555555',  // 未知
    },

    // ===== 尺寸自适应配置（核心：阈值随盘面大小缩放） =====
    // 以 9x9 为基准，按比例缩放到当前尺寸
    SIZE_ADAPTIVE: {
      baseSize: 9,
      // 空间聚集：行/列/宫已填数 >= 此值时，升格为 simple
      // 按规格书精确值：4×4→2, 6×6→4, 9×9→7
      // （人类对行/列/宫的"快填满了"的感知阈值）
      spatialFillThreshold_4x4: 2,
      spatialFillThreshold_6x6: 4,
      spatialFillThreshold_9x9: 7,
      // 笼子显著性：2格笼极值和值占两格最大和的比例
      // 9x9 两格最大和 = 9+8 = 17，最小和 = 1+2 = 3
      // 低极值阈值比例: 5/45 ≈ 11%, 高极值阈值比例: 17/45 ≈ 38%
      // 注意：用 cageSum / maxPossibleSum 作为比例基准
      cageExtremeSumLowRatio: 0.18,    // 低极值：笼和 / 最大可能和 <= 此值 → simple
      cageExtremeSumHighRatio: 0.82,   // 高极值：笼和 / 最大可能和 >= 此值 → simple
      // 候选数密度比例：候选数 / 盘面尺寸 <= 此值 → 视为低密度
      candidateDensityRatio: 0.22,
    },

    // ===== simple 格占比保底机制 =====
    // 确保不同类型关卡有足够的 simple 格供玩家操作，防止"填1个就过关"
    SIMPLE_FLOOR: {
      // 新手关：simple 占总空格 >= 60% 且不少于 3 个
      novice: { minRatio: 0.60, minCount: 3 },
      // 中盘关：simple 占总空格 >= 40% 且不少于 5 个
      midgame: { minRatio: 0.40, minCount: 5 },
      // 收官关：simple 占总空格 >= 30% 且不少于 8 个
      endgame: { minRatio: 0.30, minCount: 8 },
      // 默认值（无法判断类型时）
      default: { minRatio: 0.40, minCount: 3 },
    },

    // 心理学加权阈值（9x9 基准，小尺寸自动通过 SIZE_ADAPTIVE 缩放）
    PSYCHOLOGY_WEIGHTS: {
      // 行/列/宫已填 >= 此值，升格为 simple（空间聚集效应）
      SPATIAL_FILL_THRESHOLD: 7,

      // 2格笼，和值 <= 此值 或 >= 此值，升格为 simple（笼子显著性）
      CAGE_EXTREME_SUM_LOW: 5,
      CAGE_EXTREME_SUM_HIGH: 17,

      // 候选数 <= 此值，且原为 gate → 降级为 core（避免红色误标）
      CANDIDATE_DENSITY_LIMIT: 2,

      // 初始候选数密度阈值：用于估算格子的"认知深度"
      // 候选数越少，说明初始约束已经帮你排除了很多，深度越高
      SIMPLE_CANDIDATE_MAX: 3,  // 候选数 <= 3 视为 simple
      CORE_CANDIDATE_MAX: 5,    // 候选数 <= 5 视为 core
      // 候选数 > 5 视为 gate
    }
  };

  // ========================================================
  //  Bitmask 工具函数（与 TechRater 保持一致）
  // ========================================================

  const BIT = (num) => 1 << (num - 1);

  function popcount(mask) {
    let count = 0;
    while (mask) {
      mask &= mask - 1;
      count++;
    }
    return count;
  }

  // ========================================================
  //  TechRaterAdapter 主类
  // ========================================================

  class TechRaterAdapter {
    /**
     * @param {Board|Object} board - Board 实例或其 clone() 结果
     */
    constructor(board) {
      this.board = board;
      this.size = board.size || 9;

      // 获取 TechRater 类
      const TechRaterClass = typeof TechRater !== 'undefined'
        ? TechRater
        : (global.TechRater || window.TechRater);

      if (!TechRaterClass) {
        console.error('[TechRaterAdapter] TechRater not found!');
        return;
      }

      // 创建独立的 TechRater 实例（深拷贝隔离）
      // ⚠️ 避坑：必须使用 clone 或新实例，不能直接用主棋盘
      this.rater = new TechRaterClass(board);

      // 保存初始状态（求解前），用于心理学加权判断
      this._initialGrid = this._cloneGrid(this.rater.grid);
      this._initialCandidates = this._cloneCandidates(this.rater.candidates);

      // 执行求解
      this.solveResult = this.rater.solve(500);

      // 获取三阶段剧本（如果有）
      this.triPhase = this.rater.getTriPhaseScript
        ? this.rater.getTriPhaseScript()
        : null;

      // 预计算尺寸自适应阈值
      this._adaptive = this._calcSizeAdaptiveThresholds();
    }

    // ======================================================
    //  尺寸自适应阈值计算
    // ======================================================

    /**
     * 根据当前盘面尺寸，计算各心理学加权的自适应阈值
     * 以 9x9 为基准，按比例缩放到当前尺寸
     */
    _calcSizeAdaptiveThresholds() {
      const size = this.size;
      const sa = ADAPTER_CONFIG.SIZE_ADAPTIVE;
      const pw = ADAPTER_CONFIG.PSYCHOLOGY_WEIGHTS;

      // 空间聚集阈值：按尺寸精确匹配（规格书标定值）
      let spatialThreshold;
      if (size <= 4) spatialThreshold = sa.spatialFillThreshold_4x4;
      else if (size <= 6) spatialThreshold = sa.spatialFillThreshold_6x6;
      else spatialThreshold = sa.spatialFillThreshold_9x9;

      // 2格笼的最大可能和值：size + (size-1)
      const max2CageSum = size + (size - 1);
      const min2CageSum = 1 + 2;

      // 笼子显著性阈值：按最大和值比例计算
      const cageLowSum = Math.max(
        Math.ceil(max2CageSum * sa.cageExtremeSumLowRatio),
        min2CageSum
      );
      const cageHighSum = Math.min(
        Math.floor(max2CageSum * sa.cageExtremeSumHighRatio),
        max2CageSum
      );

      // 候选数密度阈值：按尺寸比例
      const candDensityLimit = Math.max(
        Math.ceil(size * sa.candidateDensityRatio),
        2  // 至少 2 个
      );

      return {
        spatialThreshold,     // 空间聚集：行/列/宫已填数 >= 此值
        cageLowSum,           // 2格笼低极值：和 <= 此值
        cageHighSum,          // 2格笼高极值：和 >= 此值
        candDensityLimit,     // 候选数密度：<= 此值且原为gate → 降级core
      };
    }

    // ======================================================
    //  主入口：生成三色热力图
    // ======================================================

    /**
     * 生成完整的三色热力图元数据
     * @param {string} [levelType='default'] - 关卡类型 (novice/midgame/endgame)
     *   用于确定 simple 格占比保底阈值
     * @returns {HeatmapResult}
     */
    generateHeatmap(levelType) {
      // 1. 无解/冲突容错
      if (!this.solveResult || this.solveResult.solvable === false) {
        return this._generateFallbackResult();
      }

      const type = levelType || 'default';
      this._lastLevelType = type;

      // 2. 构建步骤索引（格 → 难度信息）
      const stepMap = this._buildStepMap();

      // 3. 执行分类（难度分基准 + 心理学加权修正）
      let gridMeta = this._classifyCells(stepMap);

      // 4. 🔥 simple 格占比保底：确保玩家有足够的操作量
      gridMeta = this._applySimpleFloor(gridMeta, stepMap, type);

      // 5. 生成统计与节奏剧本
      const stats = this._calcStats(gridMeta);
      const rhythmTimeline = this._buildTimeline(gridMeta, stepMap);

      return {
        status: 'valid',
        gridMeta: gridMeta,
        stats: stats,
        rhythmTimeline: rhythmTimeline,
        levelType: type,
      };
    }

    /**
     * 重新计算热力图（玩家填/擦数后调用）
     * @returns {HeatmapResult}
     */
    recomputeHeatmap() {
      // 重新创建 rater 并重算
      const TechRaterClass = typeof TechRater !== 'undefined'
        ? TechRater
        : (global.TechRater || window.TechRater);
      if (!TechRaterClass) return this._generateFallbackResult();

      this.rater = new TechRaterClass(this.board);
      this.solveResult = this.rater.solve(500);
      this.triPhase = this.rater.getTriPhaseScript
        ? this.rater.getTriPhaseScript()
        : null;

      return this.generateHeatmap(this._lastLevelType || 'default');
    }

    /**
     * 深拷贝候选数二维数组（bitmask 版）
     */
    _cloneCandidates(candidates) {
      const size = this.size;
      const result = new Array(size);
      for (let r = 0; r < size; r++) {
        result[r] = new Array(size);
        for (let c = 0; c < size; c++) {
          result[r][c] = candidates[r][c];
        }
      }
      return result;
    }

    /**
     * 深拷贝数值 grid 二维数组
     */
    _cloneGrid(grid) {
      const size = this.size;
      const result = new Array(size);
      for (let r = 0; r < size; r++) {
        result[r] = grid[r].slice();
      }
      return result;
    }

    // ======================================================
    //  内部：构建步骤索引
    // ======================================================

    /**
     * 构建格 → 步骤信息的映射
     * ⚠️ 核心算法：相对难度分（Relative Difficulty Score）
     *
     * 为什么不用简单的技巧深度？
     *   在 Killer Sudoku 中，由于笼子约束很强，大多数格子最终都是
     *   通过 nakedSingle（深度 0）填入的。但这不代表所有格子都简单。
     *
     * 相对难度分的计算维度：
     *   1. 求解顺序（solveOrder）：越早解出越简单，越晚解出越难
     *      - 前 30% 解出的 → 基础分 0
     *      - 中间 40% 解出的 → 基础分 1
     *      - 后 30% 解出的 → 基础分 2
     *
     *   2. 初始候选数密度（initialCandidates）：候选数越多，说明初始约束越弱，越难
     *      - 1~2 个候选 → +0 分
     *      - 3~5 个候选 → +1 分
     *      - 6+ 个候选 → +2 分
     *
     *   3. 技巧深度（techniqueDepth）：填数时使用的技巧本身的深度
     *      - nakedSingle → +0
     *      - cageUnique/hiddenSingle → +1
     *      - rule45/nakedPair → +2
     *      - 更高 → +3
     *
     * 综合难度分 = 求解顺序分 + 候选数分 + 技巧深度
     *   0~1 → simple（绿）
     *   2~3 → core（黄）
     *   4+  → gate（红）
     *
     * ⚠️ 避坑：同一个格子可能被推导多次，保留难度分最高的记录
     */
    _buildStepMap() {
      const stepMap = new Map();

      if (!this.solveResult || !this.solveResult.steps) {
        return stepMap;
      }

      // 1. 收集所有填数步骤
      const fillSteps = [];
      for (let i = 0; i < this.solveResult.steps.length; i++) {
        const step = this.solveResult.steps[i];
        if (step.type === 'fill') {
          fillSteps.push({ ...step, stepIndex: i });
        }
      }

      const totalFills = fillSteps.length;
      if (totalFills === 0) return stepMap;

      // 2. 计算每个步骤的相对难度分
      const initialCands = this._initialCandidates;
      const candThresholds = ADAPTER_CONFIG.PSYCHOLOGY_WEIGHTS;

      for (let i = 0; i < fillSteps.length; i++) {
        const step = fillSteps[i];
        const key = `${step.row},${step.col}`;

        // 维度1：求解顺序分
        const orderRatio = i / totalFills;
        let orderScore = 0;
        if (orderRatio >= 0.7) orderScore = 2;       // 后 30%
        else if (orderRatio >= 0.3) orderScore = 1;  // 中间 40%

        // 维度2：初始候选数密度分（真实数据，从初始候选数获取）
        const initMask = initialCands?.[step.row]?.[step.col] ?? 0;
        const initCandCount = popcount(initMask);
        let candScore = 0;
        if (initCandCount >= 6) candScore = 2;
        else if (initCandCount >= 3) candScore = 1;

        // 维度3：技巧深度分（直接用 depth，但限制上限）
        const techDepth = step.depth !== undefined ? step.depth : 0;
        const techScore = Math.min(techDepth, 3);

        // 综合难度分
        const difficultyScore = orderScore + candScore + techScore;

        const newInfo = {
          technique: step.technique,
          depth: techDepth,                  // 原始技巧深度
          difficultyScore: difficultyScore,  // 综合难度分（用于分类）
          stepIndex: i,
          orderRatio: orderRatio,
        };

        // 保留难度分最高的记录
        if (!stepMap.has(key)) {
          stepMap.set(key, newInfo);
        } else {
          const existing = stepMap.get(key);
          if (newInfo.difficultyScore > existing.difficultyScore ||
              (newInfo.difficultyScore === existing.difficultyScore && newInfo.stepIndex < existing.stepIndex)) {
            stepMap.set(key, newInfo);
          }
        }
      }

      return stepMap;
    }

    // ======================================================
    //  内部：收集破局点
    // ======================================================

    _collectBreakPoints(stepMap) {
      const breakPoints = new Set();
      const threshold = ADAPTER_CONFIG.GATE_DEPTH_THRESHOLD;

      // 1. 从 stepMap 中收集综合难度分 >= 阈值的格子
      for (const [key, info] of stepMap) {
        // 使用综合难度分（difficultyScore）判断，若没有则回退到 depth
        const effectiveScore = info.difficultyScore !== undefined
          ? info.difficultyScore
          : (info.depth || 0);
        if (effectiveScore >= threshold) {
          breakPoints.add(key);
        }
      }

      // 2. 如果有 triPhase，核心破局格也加入
      if (this.triPhase && this.triPhase.coreMove) {
        const { row, col } = this.triPhase.coreMove;
        breakPoints.add(`${row},${col}`);
      }

      return breakPoints;
    }

    // ======================================================
    //  内部：单元格分类（核心逻辑）
    // ======================================================

    /**
     * 对所有单元格进行三色分类
     *
     * 核心逻辑：以综合难度分为基准，心理学加权做修正
     *
     * 基础分类（基于 difficultyScore）：
     *   score <= 1  → simple（绿）
     *   score 2~3   → core（黄）
     *   score >= 4  → gate（红）
     *
     * 心理学加权（优先级从高到低）：
     *   1. 空间聚集 → 强制 simple（无论分数多高）
     *   2. 笼子显著性 → 强制 simple
     *   3. 候选数 = 1 → 强制 simple
     *   4. 候选数 <= 2 且原为 gate → 降级为 core
     */
    _classifyCells(stepMap, breakPointCandidates) {
      const gridMeta = new Array(this.size);

      for (let r = 0; r < this.size; r++) {
        gridMeta[r] = new Array(this.size);
        for (let c = 0; c < this.size; c++) {
          gridMeta[r][c] = this._classifyCell(r, c, stepMap);
        }
      }

      return gridMeta;
    }

    _classifyCell(r, c, stepMap) {
      const key = `${r},${c}`;

      // 已填格
      const cell = this.board.cells?.[r]?.[c];
      const isFilled = cell
        ? (cell.fixedNum > 0 || cell.fillNum > 0)
        : (this.rater.grid[r][c] !== 0);

      if (isFilled) {
        return {
          category: 'filled',
          color: ADAPTER_CONFIG.COLORS.filled,
          technique: null,
          depth: null,
        };
      }

      const stepInfo = stepMap.get(key);
      // 综合难度分
      const score = stepInfo
        ? (stepInfo.difficultyScore !== undefined ? stepInfo.difficultyScore : (stepInfo.depth || 0))
        : 0;

      // 使用初始候选数（求解前的状态）来评估
      const initMask = this._initialCandidates?.[r]?.[c] ?? 0;
      const initCandCount = popcount(initMask);

      // ============== 基础分类（基于难度分） ==============
      let category = 'core';
      let color = ADAPTER_CONFIG.COLORS.core;

      if (score >= ADAPTER_CONFIG.GATE_DEPTH_THRESHOLD) {
        category = 'gate';
        color = ADAPTER_CONFIG.COLORS.gate;
      } else if (score <= ADAPTER_CONFIG.SIMPLE_SCORE_MAX) {
        category = 'simple';
        color = ADAPTER_CONFIG.COLORS.simple;
      }

      // ============== 心理学加权（优先级从高到低） ==============

      // 🟢 规则1：空间聚集加权（最高优先级 - 强制 simple）
      if (this._isSpatiallySalient(r, c)) {
        category = 'simple';
        color = ADAPTER_CONFIG.COLORS.simple;
      }
      // 🟢 规则2：笼子显著性加权（强制 simple）
      else if (this._isCageSalient(r, c)) {
        category = 'simple';
        color = ADAPTER_CONFIG.COLORS.simple;
      }
      // 🟢 规则3：初始候选数 = 1（开局就能直接确定的，强制 simple）
      else if (initCandCount === 1) {
        category = 'simple';
        color = ADAPTER_CONFIG.COLORS.simple;
      }
      // 🟡 规则4：初始候选数 <= 自适应阈值 且原为 gate → 降级 core（避免红色误标）
      else if (category === 'gate' && initCandCount <= this._adaptive.candDensityLimit) {
        category = 'core';
        color = ADAPTER_CONFIG.COLORS.core;
      }

      return {
        category: category,
        color: color,
        technique: stepInfo?.technique || null,
        depth: score,
      };
    }

    // ======================================================
    //  内部：心理学加权判断
    // ======================================================

    /**
     * 空间聚集效应：行/列/宫已填数 >= 自适应阈值 → 升格为 simple
     * 人类直觉：某行/列/宫快填满了，剩余空格自然"一眼就看出来"
     * 尺寸自适应：9x9→7, 6x6→5, 4x4→3（约 78% 填充率）
     */
    _isSpatiallySalient(r, c) {
      const threshold = this._adaptive.spatialThreshold;
      const size = this.size;
      const grid = this._initialGrid || this.rater.grid;

      // 计算行已填数（基于初始盘面）
      let rowFilled = 0;
      for (let cc = 0; cc < size; cc++) {
        if (grid[r][cc] !== 0) rowFilled++;
      }
      if (rowFilled >= threshold) return true;

      // 计算列已填数
      let colFilled = 0;
      for (let rr = 0; rr < size; rr++) {
        if (grid[rr][c] !== 0) colFilled++;
      }
      if (colFilled >= threshold) return true;

      // 计算宫已填数
      const boxH = this.rater.boxH || 3;
      const boxW = this.rater.boxW || 3;
      const br = Math.floor(r / boxH) * boxH;
      const bc = Math.floor(c / boxW) * boxW;
      let boxFilled = 0;
      for (let dr = 0; dr < boxH; dr++) {
        for (let dc = 0; dc < boxW; dc++) {
          if (grid[br + dr][bc + dc] !== 0) boxFilled++;
        }
      }
      if (boxFilled >= threshold) return true;

      return false;
    }

    /**
     * 笼子显著性：2格笼，和值极小或极大 → 升格为 simple
     * 人类直觉：2格和=3 只能是 1+2，一眼就知道
     * 尺寸自适应：9x9→≤5或≥17, 6x6→≤3或≥9, 4x4→≤2或≥6（约18%/82%分位）
     */
    _isCageSalient(r, c) {
      const cage = this.rater.cellCage
        ? this.rater.cellCage[r * this.size + c]
        : null;

      if (!cage) return false;

      // 只考虑 2 格笼
      if (cage.cells.length !== 2) return false;

      const sum = cage.sum;
      const { cageLowSum, cageHighSum } = this._adaptive;

      return sum <= cageLowSum || sum >= cageHighSum;
    }

    // ======================================================
    //  内部：统计计算
    // ======================================================

    _calcStats(gridMeta) {
      let simple = 0;
      let core = 0;
      let gate = 0;
      let totalEmpty = 0;

      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const meta = gridMeta[r][c];
          if (meta.category === 'filled') continue;
          totalEmpty++;
          if (meta.category === 'simple') simple++;
          else if (meta.category === 'core') core++;
          else if (meta.category === 'gate') gate++;
        }
      }

      return { simple, core, gate, totalEmpty };
    }

    // ======================================================
    //  内部：simple 格占比保底机制
    // ======================================================

    /**
     * 确保 simple 格占比不低于最小阈值
     * 防止"填1个就过关"的极端情况
     *
     * 策略：从 core 格中选择难度最低的（最容易的），升格为 simple
     * 优先选择：求解顺序早、候选数少、空间邻近已simple格的
     *
     * @param {Array} gridMeta - 当前分类结果
     * @param {Map} stepMap - 步骤信息映射
     * @param {string} levelType - 关卡类型 (novice/midgame/endgame)
     * @returns {Array} 修改后的 gridMeta
     */
    _applySimpleFloor(gridMeta, stepMap, levelType) {
      const stats = this._calcStats(gridMeta);
      const floor = ADAPTER_CONFIG.SIMPLE_FLOOR[levelType] || ADAPTER_CONFIG.SIMPLE_FLOOR.default;

      const targetSimple = Math.max(
        Math.ceil(stats.totalEmpty * floor.minRatio),
        floor.minCount
      );

      // 如果已经满足保底要求，直接返回
      if (stats.simple >= targetSimple) {
        return gridMeta;
      }

      const needMore = targetSimple - stats.simple;

      // 收集所有 core 格，按"易度"排序（越容易越先升格）
      // 易度排序：求解顺序早 → 候选数少 → 难度分低
      const coreCandidates = [];
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const meta = gridMeta[r][c];
          if (meta.category !== 'core') continue;

          const key = `${r},${c}`;
          const stepInfo = stepMap.get(key);
          const score = stepInfo?.difficultyScore ?? (meta.depth || 0);
          const stepIndex = stepInfo?.stepIndex ?? 999;

          // 初始候选数
          const initMask = this._initialCandidates?.[r]?.[c] ?? 0;
          const initCand = popcount(initMask);

          coreCandidates.push({
            r, c,
            score,        // 难度分越低越容易
            stepIndex,    // 求解顺序越早越容易
            initCand,    // 候选数越少越容易
          });
        }
      }

      // 按易度排序：先选最容易的升格为 simple
      coreCandidates.sort((a, b) => {
        // 优先级：难度分 → 候选数 → 求解顺序
        if (a.score !== b.score) return a.score - b.score;
        if (a.initCand !== b.initCand) return a.initCand - b.initCand;
        return a.stepIndex - b.stepIndex;
      });

      // 取前 N 个升格为 simple
      const toPromote = coreCandidates.slice(0, needMore);
      for (const { r, c } of toPromote) {
        gridMeta[r][c].category = 'simple';
        gridMeta[r][c].color = ADAPTER_CONFIG.COLORS.simple;
        if (!gridMeta[r][c].floorPromoted) {
          gridMeta[r][c].floorPromoted = true;
        }
      }

      return gridMeta;
    }

    // ======================================================
    //  内部：构建节奏时间线
    // ======================================================

    /**
     * 构建三幕式节奏时间线
     * ⚠️ 关键：dominoSequence 必须严格按求解链顺序排列，而非坐标顺序
     *
     * 三阶段说明：
     *   🟢 opening（开局）     — simple 格：低认知负荷，心流速填
     *   🔴 breakthrough（破局）— gate 格：必须引入新技巧的破局点
     *   🟡 avalanche（雪崩）   — core 格：破局后连锁填出的格子
     *
     * 分类阈值（基于综合难度分 difficultyScore）：
     *   score <= 1  → simple（绿）
     *   score = 2   → core（黄）
     *   score >= 3  → gate（红）
     */
    _buildTimeline(gridMeta, stepMap) {
      if (!this.solveResult || !this.solveResult.steps) {
        return null;
      }

      const steps = this.solveResult.steps;
      const size = this.size;

      // 收集各阶段的格子（全部使用手动去重，保留首次出现的求解顺序）
      const simpleCells = [];   // 开局
      const simpleSet = new Set();
      const gateCells = [];     // 破局
      const gateSet = new Set();
      const dominoSequence = []; // 雪崩（按求解顺序）
      const dominoSet = new Set();
      const requiredTechniques = new Set();

      // 1. 按求解链顺序遍历 fill steps（核心：顺序来自 solveResult.steps）
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.type !== 'fill') continue;

        const r = step.row;
        const c = step.col;
        const key = `${r},${c}`;
        const meta = gridMeta[r]?.[c];

        if (!meta) continue;

        if (meta.category === 'simple') {
          if (!simpleSet.has(key)) {
            simpleSet.add(key);
            simpleCells.push(key);
          }
        } else if (meta.category === 'gate') {
          if (!gateSet.has(key)) {
            gateSet.add(key);
            gateCells.push(key);
          }
          if (step.technique) {
            requiredTechniques.add(step.technique);
          }
        } else if (meta.category === 'core') {
          // ⚠️ 关键：按求解顺序加入雪崩序列（手动去重，保留首次出现顺序）
          if (!dominoSet.has(key)) {
            dominoSet.add(key);
            dominoSequence.push(key);
          }
        }
      }

      // 2. 补充：没有出现在 fill steps 中的空格（按坐标顺序追加到末尾）
      //    （理论上求解器应该覆盖所有空格，此处为兜底）
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const meta = gridMeta[r][c];
          if (!meta || meta.category === 'filled') continue;
          const key = `${r},${c}`;

          if (meta.category === 'simple' && !simpleSet.has(key)) {
            simpleSet.add(key);
            simpleCells.push(key);
          } else if (meta.category === 'gate' && !gateSet.has(key)) {
            gateSet.add(key);
            gateCells.push(key);
          } else if (meta.category === 'core' && !dominoSet.has(key)) {
            dominoSet.add(key);
            dominoSequence.push(key);
          }
        }
      }

      const totalSteps = simpleCells.length + gateCells.length + dominoSequence.length;

      const timeline = {
        totalSteps: totalSteps,
        phases: {
          opening: {
            cellKeys: simpleCells,
            count: simpleCells.length,
          },
          breakthrough: {
            gateCells: gateCells,
            count: gateCells.length,
            requiredTechniques: Array.from(requiredTechniques),
          },
          avalanche: {
            dominoSequence: dominoSequence,
            count: dominoSequence.length,
          },
        },
      };

      // 3. 数据完整性验证（开发环境下输出警告）
      if (typeof console !== 'undefined' && console.warn) {
        const validation = this._validateTimeline(timeline, gridMeta);
        if (!validation.valid) {
          console.warn('[TechRaterAdapter] rhythmTimeline 数据不一致:', validation.errors);
        }
      }

      return timeline;
    }

    /**
     * 验证 rhythmTimeline 数据完整性
     * 检查：三阶段格子数之和 = 总空格数，且无重复、无遗漏
     * @param {Object} timeline - _buildTimeline 的输出
     * @param {Array} gridMeta - 分类后的格子元数据
     * @returns {{valid: boolean, errors: string[]}}
     */
    _validateTimeline(timeline, gridMeta) {
      const errors = [];
      const size = this.size;

      if (!timeline || !timeline.phases) {
        return { valid: false, errors: ['timeline 为空'] };
      }

      const { opening, breakthrough, avalanche } = timeline.phases;
      const simpleKeys = opening.cellKeys || [];
      const gateKeys = breakthrough.gateCells || [];
      const dominoKeys = avalanche.dominoSequence || [];

      // 1. 检查重复（同阶段内）
      const checkDuplicates = (arr, name) => {
        const seen = new Set();
        for (const key of arr) {
          if (seen.has(key)) {
            errors.push(`${name} 存在重复格子: ${key}`);
          }
          seen.add(key);
        }
      };
      checkDuplicates(simpleKeys, 'opening.simpleCells');
      checkDuplicates(gateKeys, 'breakthrough.gateCells');
      checkDuplicates(dominoKeys, 'avalanche.dominoSequence');

      // 2. 检查跨阶段重叠
      const allKeys = new Set();
      const checkOverlap = (arr, name) => {
        for (const key of arr) {
          if (allKeys.has(key)) {
            errors.push(`格子 ${key} 同时出现在多个阶段（已在 ${name} 之前出现）`);
          }
          allKeys.add(key);
        }
      };
      checkOverlap(simpleKeys, 'opening');
      checkOverlap(gateKeys, 'breakthrough');
      checkOverlap(dominoKeys, 'avalanche');

      // 3. 统计总空格数
      let totalEmpty = 0;
      let simpleCount = 0;
      let gateCount = 0;
      let coreCount = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const meta = gridMeta[r][c];
          if (meta.category === 'filled') continue;
          totalEmpty++;
          if (meta.category === 'simple') simpleCount++;
          else if (meta.category === 'gate') gateCount++;
          else if (meta.category === 'core') coreCount++;
        }
      }

      // 4. 验证数量一致性
      if (simpleKeys.length !== simpleCount) {
        errors.push(`simple 格数量不一致: timeline=${simpleKeys.length}, gridMeta=${simpleCount}`);
      }
      if (gateKeys.length !== gateCount) {
        errors.push(`gate 格数量不一致: timeline=${gateKeys.length}, gridMeta=${gateCount}`);
      }
      if (dominoKeys.length !== coreCount) {
        errors.push(`core 格数量不一致: timeline=${dominoKeys.length}, gridMeta=${coreCount}`);
      }
      if (timeline.totalSteps !== totalEmpty) {
        errors.push(`总格子数不一致: timeline.totalSteps=${timeline.totalSteps}, totalEmpty=${totalEmpty}`);
      }

      // 5. 验证每个 key 都有对应分类且匹配
      for (const key of simpleKeys) {
        const [r, c] = key.split(',').map(Number);
        if (gridMeta[r]?.[c]?.category !== 'simple') {
          errors.push(`opening 中的格子 ${key} 分类不是 simple: ${gridMeta[r]?.[c]?.category}`);
        }
      }
      for (const key of gateKeys) {
        const [r, c] = key.split(',').map(Number);
        if (gridMeta[r]?.[c]?.category !== 'gate') {
          errors.push(`breakthrough 中的格子 ${key} 分类不是 gate: ${gridMeta[r]?.[c]?.category}`);
        }
      }
      for (const key of dominoKeys) {
        const [r, c] = key.split(',').map(Number);
        if (gridMeta[r]?.[c]?.category !== 'core') {
          errors.push(`avalanche 中的格子 ${key} 分类不是 core: ${gridMeta[r]?.[c]?.category}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors: errors,
      };
    }

    // ======================================================
    //  内部：降级结果（无解时）
    // ======================================================

    _generateFallbackResult() {
      const gridMeta = new Array(this.size);
      for (let r = 0; r < this.size; r++) {
        gridMeta[r] = new Array(this.size);
        for (let c = 0; c < this.size; c++) {
          const cell = this.board.cells?.[r]?.[c];
          const isFilled = cell
            ? (cell.fixedNum > 0 || cell.fillNum > 0)
            : false;
          gridMeta[r][c] = {
            category: isFilled ? 'filled' : 'unknown',
            color: isFilled ? ADAPTER_CONFIG.COLORS.filled : ADAPTER_CONFIG.COLORS.unknown,
            technique: null,
            depth: null,
          };
        }
      }

      return {
        status: 'invalid',
        gridMeta: gridMeta,
        stats: { simple: 0, core: 0, gate: 0, totalEmpty: 0 },
        rhythmTimeline: null,
      };
    }

    // ======================================================
    //  工具方法
    // ======================================================

    /**
     * 获取某格的分类信息
     */
    getCellCategory(r, c) {
      if (!this._cachedHeatmap) {
        this._cachedHeatmap = this.generateHeatmap();
      }
      return this._cachedHeatmap.gridMeta[r]?.[c] || null;
    }

    /**
     * 清除缓存（棋盘变化后调用）
     */
    clearCache() {
      this._cachedHeatmap = null;
    }
  }

  // ========================================================
  //  静态配置暴露
  // ========================================================

  TechRaterAdapter.CONFIG = ADAPTER_CONFIG;

  // ========================================================
  //  导出
  // ========================================================

  global.TechRaterAdapter = TechRaterAdapter;

})(typeof window !== 'undefined' ? window : this);
