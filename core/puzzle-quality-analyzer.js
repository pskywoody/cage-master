/**
 * ============================================================
 *  PuzzleQualityAnalyzer - 杀手数独精品关卡评价器
 * ============================================================
 *
 *  只读分析器，不修改任何游戏生产代码。
 *
 *  输入：TechRater 求解器的 steps + rating + board/cage 元数据
 *  输出：五维质量评分（SolveBeauty / TechniqueStory / CageComposition
 *                     / DifficultyCurve / Uniqueness）+ 综合评分
 *
 *  QualityScore = SolveBeauty 25% + TechniqueStory 20%
 *               + CageComposition 25%（核心）+ DifficultyCurve 15%
 *               + Uniqueness 15%
 *
 *  CageComposition（笼形美学）是 Killer Sudoku 的视觉主设计层，
 *  委托给 CageCompositionAnalyzer 计算。
 *
 *  Phase Q1 — Puzzle Aesthetic Research
 *  目标：验证 Analyzer 能否稳定挑出人类觉得漂亮的关卡。
 *
 *  用法：
 *    const solver = new TechRater(board);
 *    solver.solve();
 *    const report = PuzzleQualityAnalyzer.evaluate(solver, boardData, cages);
 *    // report = { overall, solveBeauty, techniqueStory, visualElegance,
 *    //            difficultyCurve, uniqueness, details }
 *
 * ============================================================
 */

(function(global) {
  'use strict';

  // ========================================================
  //  技巧深度映射（与 TechRater 一致）
  // ========================================================

  const TECH_DEPTH = {
    nakedSingle: 0,
    cageUnique: 1,
    hiddenSingle: 1,
    rule45: 2,
    nakedPair: 2,
    hiddenPair: 3,
    pointingClaiming: 3,
    nakedTriplet: 3,
    xWing: 4,
    swordfish: 5,
    guess: 6
  };

  const TECH_LEVEL = {
    nakedSingle: 1,
    cageUnique: 2,
    hiddenSingle: 3,
    rule45: 4,
    nakedPair: 5,
    hiddenPair: 6,
    pointingClaiming: 7,
    nakedTriplet: 8,
    xWing: 9,
    swordfish: 10,
    guess: 11
  };

  const ADVANCED_TECHS = new Set(['xWing', 'swordfish']);
  const PREP_TECHS = new Set(['nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet']);

  // ========================================================
  //  维度一：解题美感 SolveBeauty（权重 0.30）
  // ========================================================

  /**
   * 评估解题路径的流畅度和美感。
   * 好路径：铺垫 → 局部突破 → 核心技巧 → 快速收束
   * 差路径：频繁卡顿、技巧跳跃过大、收束拖沓
   */
  function scoreSolveBeauty(steps) {
    if (!steps || steps.length < 3) return 0.5;

    const depthSeq = steps.map(s => {
      const t = s.technique || s.techId;
      return TECH_DEPTH[t] !== undefined ? TECH_DEPTH[t] : 0;
    });

    const n = depthSeq.length;

    // 1. 技巧跃迁惩罚（跨 2 级以上为"跳跃"）
    let jumps = 0;
    let bigJumps = 0;
    for (let i = 1; i < n; i++) {
      const diff = depthSeq[i] - depthSeq[i - 1];
      if (diff > 2) jumps++;
      if (diff > 4) bigJumps++;
    }
    const jumpPenalty = bigJumps * 0.12 + (jumps - bigJumps) * 0.04;

    // 2. 卡顿检测（连续 5+ 步同一深度）
    let stallCount = 0;
    let currentRun = 1;
    for (let i = 1; i < n; i++) {
      if (depthSeq[i] === depthSeq[i - 1]) {
        currentRun++;
      } else {
        if (currentRun >= 5) stallCount++;
        currentRun = 1;
      }
    }
    if (currentRun >= 5) stallCount++;
    const stallPenalty = Math.min(stallCount * 0.08, 0.25);

    // 3. 收束质量（最后 20% 步数应使用低深度技巧）
    const finishStart = Math.floor(n * 0.80);
    const finishSteps = depthSeq.slice(finishStart);
    const finishEase = finishSteps.filter(d => d <= 1).length / finishSteps.length;
    const finishBonus = finishEase >= 0.6 ? 0.10 : (finishEase >= 0.4 ? 0.05 : 0);

    // 4. 峰值位置（核心技巧应在 40%-70% 处出现）
    const maxDepth = Math.max(...depthSeq);
    const peakIdx = depthSeq.indexOf(maxDepth);
    const peakPos = peakIdx / n;
    const peakBonus = (peakPos >= 0.35 && peakPos <= 0.75) ? 0.10 : 0;

    const raw = 1 - jumpPenalty - stallPenalty + finishBonus + peakBonus;
    return Math.max(0, Math.min(1, raw));
  }

  // ========================================================
  //  维度二：技巧叙事 TechniqueStory（权重 0.25）
  // ========================================================

  /**
   * 评估高级技巧出现时的"叙事感"。
   * 好：前置铺垫充分 → 技巧自然浮现 → 突破后快速收束
   * 差：技巧凭空出现、无铺垫、突破后还拖很久
   */
  function scoreTechniqueStory(steps, rating) {
    if (!steps || steps.length < 3) return 0.5;

    // 找出所有高级技巧步骤
    const advancedSteps = [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.type === 'fill' && ADVANCED_TECHS.has(s.technique)) {
        advancedSteps.push({ step: s, index: i });
      }
    }

    // 无高级技巧：中等偏上（不扣分，但也不高分）
    if (advancedSteps.length === 0) return 0.65;

    let totalClarity = 0;

    for (const { step, index } of advancedSteps) {
      // 前 15 步的铺垫窗口
      const prepWindow = steps.slice(Math.max(0, index - 15), index);

      // 铺垫技巧占比
      const prepCount = prepWindow.filter(s => PREP_TECHS.has(s.technique)).length;
      const prepRatio = prepWindow.length > 0 ? prepCount / prepWindow.length : 0;

      // 候选数收敛度（如果 steps 记录了 candidatesBefore）
      const candBefore = step.candidatesBefore;
      const candRatio = (candBefore && candBefore.length > 0)
        ? Math.min(1, candBefore.length / 9)
        : 0.5;
      const convergenceScore = 1 - candRatio;

      // 证据完整性
      const ev = step.evidence;
      const evidenceComplete = ev && (ev.rows || ev.cols || ev.cells || ev.eliminatedCells) ? 1 : 0;

      // 位置分数（越接近 40-60% 越好）
      const pos = index / steps.length;
      const posScore = (pos >= 0.35 && pos <= 0.70) ? 1.0
        : (pos >= 0.20 && pos <= 0.85) ? 0.6
        : 0.3;

      const clarity = prepRatio * 0.35 + convergenceScore * 0.25 + evidenceComplete * 0.20 + posScore * 0.20;
      totalClarity += clarity;
    }

    const avgClarity = totalClarity / advancedSteps.length;

    // 如果多个高级技巧，多样性加分
    const uniqueAdvanced = new Set(advancedSteps.map(a => a.step.technique));
    const diversityBonus = uniqueAdvanced.size > 1 ? 0.08 : 0;

    return Math.max(0, Math.min(1, avgClarity * 0.85 + diversityBonus));
  }

  // ========================================================
  //  维度三：视觉美感 VisualElegance（权重 0.20）
  // ========================================================

  /**
   * 评估谜题的视觉布局美感。
   * 检测：对称性、宫内密度分布、笼排列美感、初始数字图案
   */
  function scoreVisualElegance(boardData, cages, gridSize) {
    const size = gridSize || 9;
    if (!boardData || !cages) return 0.5;

    // 提取初始数字坐标
    const initialDigits = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (boardData[r] && boardData[r][c] > 0) {
          initialDigits.push({ r, c, v: boardData[r][c] });
        }
      }
    }
    const digitCount = initialDigits.length;
    if (digitCount === 0) return 0.5;

    // 1. 旋转对称性（180°，初始数字是否对称）
    let rotSym = 0;
    let rotTotal = 0;
    const digitSet = new Set(initialDigits.map(d => d.r + ',' + d.c));
    for (const d of initialDigits) {
      const symR = size - 1 - d.r;
      const symC = size - 1 - d.c;
      if (digitSet.has(symR + ',' + symC)) rotSym++;
      rotTotal++;
    }
    const rotSymScore = rotTotal > 0 ? rotSym / rotTotal : 0;

    // 2. 对角线对称性（主对角线）
    let diagSym = 0;
    let diagTotal = 0;
    for (const d of initialDigits) {
      if (d.r === d.c) continue; // 对角线上的格自动对称
      if (digitSet.has(d.c + ',' + d.r)) diagSym++;
      diagTotal++;
    }
    const diagSymScore = diagTotal > 0 ? diagSym / diagTotal : 0.5;

    // 3. 宫内密度均匀性
    const boxSize = Math.sqrt(size); // 3 for 9x9
    const boxCounts = new Array(size).fill(0);
    for (const d of initialDigits) {
      const br = Math.floor(d.r / boxSize);
      const bc = Math.floor(d.c / boxSize);
      boxCounts[br * boxSize + bc]++;
    }
    const avgPerBox = digitCount / size;
    const boxVariance = boxCounts.reduce((sum, c) => sum + (c - avgPerBox) ** 2, 0) / size;
    const normalizedVariance = Math.min(1, boxVariance / (avgPerBox + 1));
    const densityScore = 1 - normalizedVariance;

    // 4. 笼对称性
    let cageSymScore = 0.5;
    try {
      let cageSymHits = 0;
      let cageTotal = 0;
      const cageCells = new Map();
      for (let ci = 0; ci < cages.length; ci++) {
        const cage = cages[ci];
        const cells = cage.cells || cage;
        if (!cells || !Array.isArray(cells)) continue;
        for (const cell of cells) {
          const r = Array.isArray(cell) ? cell[0] : cell.r;
          const c = Array.isArray(cell) ? cell[1] : cell.c;
          cageCells.set(r + ',' + c, ci);
        }
      }
      for (const [key, ci] of cageCells) {
        const [r, c] = key.split(',').map(Number);
        const symR = size - 1 - r;
        const symC = size - 1 - c;
        const symKey = symR + ',' + symC;
        if (cageCells.get(symKey) === ci) cageSymHits++;
        cageTotal++;
      }
      cageSymScore = cageTotal > 0 ? cageSymHits / cageTotal : 0.5;
    } catch (e) {
      cageSymScore = 0.5;
    }

    // 综合视觉分
    const visualScore = (
      rotSymScore * 0.30 +
      Math.max(diagSymScore, 0.3) * 0.15 +
      densityScore * 0.25 +
      cageSymScore * 0.30
    );

    return Math.max(0, Math.min(1, visualScore));
  }

  // ========================================================
  //  维度四：难度曲线 DifficultyCurve（权重 0.15）
  // ========================================================

  /**
   * 评估技巧难度在整局中的分布曲线。
   * 好：低 → 中 → 高 → 中 → 低（山形）
   * 差：前高后低、中间塌陷、单调升降
   */
  function scoreDifficultyCurve(steps) {
    if (!steps || steps.length < 5) return 0.5;

    const depthSeq = steps.map(s => {
      const t = s.technique || s.techId;
      return TECH_LEVEL[t] !== undefined ? TECH_LEVEL[t] : 0;
    });

    const n = depthSeq.length;
    const segs = 5;
    const segSize = Math.floor(n / segs);
    const segMaxs = [];

    for (let i = 0; i < segs; i++) {
      const start = i * segSize;
      const end = i === segs - 1 ? n : (i + 1) * segSize;
      segMaxs.push(Math.max(...depthSeq.slice(start, end)));
    }

    // 理想山形：低 → 高 → 峰 → 中 → 低
    const ideal = (
      segMaxs[0] <= segMaxs[1] + 1 &&
      segMaxs[1] <= segMaxs[2] + 1 &&
      segMaxs[3] <= segMaxs[2] + 1 &&
      segMaxs[4] <= segMaxs[3] + 1
    );

    // 前高后低
    const frontLoaded = (
      segMaxs[0] > segMaxs[2] + 2 &&
      segMaxs[1] > segMaxs[3] + 1
    );

    // 中间塌陷（峰在两端）
    const dipInMiddle = (
      Math.min(segMaxs[1], segMaxs[2], segMaxs[3]) <= Math.min(segMaxs[0], segMaxs[4]) - 3
    );

    // 单调性检查
    const monotonicUp = segMaxs.every((v, i) => i === 0 || v >= segMaxs[i - 1] - 1);
    const monotonicDown = segMaxs.every((v, i) => i === 0 || v <= segMaxs[i - 1] + 1);

    if (ideal) return 0.92;
    if (frontLoaded) return 0.30;
    if (dipInMiddle) return 0.35;
    if (monotonicUp || monotonicDown) return 0.45;

    return 0.65;
  }

  // ========================================================
  //  维度五：唯一性 Uniqueness（权重 0.10）
  // ========================================================

  /**
   * 评估谜题是否有"aha moment"——一个让玩家记住的峰值瞬间。
   * 好：峰值技巧位置合理、技巧多样性高、峰值后快速收束
   */
  function scoreUniqueness(steps) {
    if (!steps || steps.length < 3) return 0.4;

    const depthSeq = steps.map(s => {
      const t = s.technique || s.techId;
      return TECH_LEVEL[t] !== undefined ? TECH_LEVEL[t] : 0;
    });
    const n = depthSeq.length;

    // 1. 峰值技巧检测
    const maxLevel = Math.max(...depthSeq);
    const peakSteps = steps.filter(s => {
      const t = s.technique || s.techId;
      return TECH_LEVEL[t] === maxLevel;
    });
    if (peakSteps.length === 0) return 0.3;

    // 2. 峰值位置
    const peakIndices = peakSteps.map(s => steps.indexOf(s)).filter(i => i >= 0);
    const peakPositions = peakIndices.map(i => i / n);
    const wellPlaced = peakPositions.some(p => p >= 0.35 && p <= 0.70);

    // 3. 技巧多样性
    const uniqueTechs = new Set(steps.map(s => {
      const t = s.technique || s.techId;
      if (t === 'guess') return null;
      return t;
    }).filter(Boolean));
    const techDiversity = Math.min(1, uniqueTechs.size / 7);

    // 4. 峰值后收束长度
    const lastPeakIdx = Math.max(...peakIndices);
    const postPeakSteps = n - lastPeakIdx;
    const cleanFinish = postPeakSteps < n * 0.35;

    // 5. 峰值技巧稀有度
    const rareTech = peakSteps.some(s => ADVANCED_TECHS.has(s.technique)) ? 0.15 : 0;

    return (
      (wellPlaced ? 0.25 : 0.05) +
      techDiversity * 0.25 +
      (cleanFinish ? 0.25 : 0.05) +
      rareTech +
      0.10 // base
    );
  }

  // ========================================================
  //  主入口
  // ========================================================

  /**
   * 对谜题进行完整质量评估。
   *
   * @param {Object} solver      - TechRater 求解器实例（已执行 solve()）
   * @param {Array}  boardData   - 2D 盘面数组（0=空格，1-9=预填数字）
   * @param {Array}  cages       - 笼定义数组
   * @param {number} gridSize    - 盘面尺寸（默认 9）
   * @param {Object} options     - 可选 { patterns: 图案库, enableDigitComposition: bool }
   * @returns {Object} 质量评估报告
   */
  function evaluate(solver, boardData, cages, gridSize, options) {
    gridSize = gridSize || 9;
    const steps = solver.getSteps ? solver.getSteps() : (solver.steps || []);
    const rating = solver.getRating ? solver.getRating() : (solver.rating || {});
    options = options || {};

    const sb = scoreSolveBeauty(steps);
    const ts = scoreTechniqueStory(steps, rating);

    // 笼形美学（核心维度）→ 委托 CageCompositionAnalyzer
    let cageComp;
    if (typeof CageCompositionAnalyzer !== 'undefined') {
      cageComp = CageCompositionAnalyzer.evaluate(cages, gridSize, options.patterns);
    } else {
      cageComp = { symmetry: 0.5, patternFit: 0.5, topology: 0.5, balance: 0.5, overall: 0.5 };
    }

    // 数字构图作为"隐藏彩蛋"副层（默认关闭，或用 cage 对称兜底）
    const digitComp = scoreVisualElegance(boardData, cages, gridSize);

    const cc = cageComp.overall;
    const dc = scoreDifficultyCurve(steps);
    const uq = scoreUniqueness(steps);

    // 新权重：25/20/25/15/15
    const overall =
      sb * 0.25 +
      ts * 0.20 +
      cc * 0.25 +
      dc * 0.15 +
      uq * 0.15;

    // 峰值时刻定位
    const depthSeq = steps.map(s => {
      const t = s.technique || s.techId;
      return TECH_LEVEL[t] !== undefined ? TECH_LEVEL[t] : 0;
    });
    const maxLevel = Math.max(...depthSeq, 0);
    const maxLevelTech = Object.keys(TECH_LEVEL).find(k => TECH_LEVEL[k] === maxLevel) || 'none';
    const peakStepIdx = steps.findIndex(s => {
      const t = s.technique || s.techId;
      return TECH_LEVEL[t] === maxLevel;
    });

    return {
      overall: Math.round(overall * 1000) / 1000,

      // 五维
      solveBeauty: Math.round(sb * 1000) / 1000,
      techniqueStory: Math.round(ts * 1000) / 1000,
      cageComposition: Math.round(cc * 1000) / 1000,
      difficultyCurve: Math.round(dc * 1000) / 1000,
      uniqueness: Math.round(uq * 1000) / 1000,

      // 视觉效果（笼形动图主层 + 数字彩蛋副层）
      visual: {
        cageComposition: cageComp,
        digitComposition: Math.round(digitComp * 1000) / 1000
      },

      // 元数据
      maxTechLevel: maxLevel,
      peakTechnique: maxLevelTech,
      peakStepIndex: peakStepIdx,
      peakPosition: steps.length > 0 ? Math.round((peakStepIdx / steps.length) * 1000) / 1000 : 0,
      totalSteps: steps.length,
      initialDigitCount: boardData ? boardData.reduce((sum, row) =>
        sum + row.reduce((s, v) => s + (v > 0 ? 1 : 0), 0), 0) : 0,
      difficultyLevel: rating.level || null,
      difficultyScore: rating.score || 0,
      nakedSingleRatio: rating.nonTrivialRatio !== undefined ? Math.round((1 - rating.nonTrivialRatio) * 1000) / 1000 : null,

      // 详细分解
      details: {
        solveBeauty: {
          jumpPenalty: null, // 仅在 analyze 时计算
          stallPenalty: null,
          finishBonus: null,
          peakBonus: null
        },
        visualElegance: {
          rotSymmetry: null,
          diagSymmetry: null,
          densityVariance: null,
          cageSymmetry: null
        }
      }
    };
  }

  /**
   * 批量分析（直接传入数据，无需 solver 实例）
   *
   * @param {Object} puzzle - 谜题对象 { boardData, cages, gridSize }
   * @param {Object} solver - TechRater 实例（已 solve）
   * @returns {Object} 质量评估报告
   */
  function analyze(puzzle, solver) {
    return evaluate(
      solver,
      puzzle.boardData || puzzle.grid,
      puzzle.cages || puzzle.cage,
      puzzle.gridSize || puzzle.size || 9
    );
  }

  // ========================================================
  //  导出
  // ========================================================

  const PuzzleQualityAnalyzer = {
    evaluate,
    analyze,
    scoreSolveBeauty,
    scoreTechniqueStory,
    scoreVisualElegance,
    scoreDifficultyCurve,
    scoreUniqueness
  };

  // 兼容 Node require：既导出 module.exports，也注册到 global（与 tech-rater 一致）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PuzzleQualityAnalyzer };
  }
  if (typeof global !== 'undefined') {
    global.PuzzleQualityAnalyzer = PuzzleQualityAnalyzer;
  }
  if (typeof window !== 'undefined') {
    window.PuzzleQualityAnalyzer = PuzzleQualityAnalyzer;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));