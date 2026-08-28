/**
 * ============================================================
 *  CageCompositionAnalyzer - 杀手数独笼结构美学评价器
 * ============================================================
 *
 *  只读分析器，不修改生产代码。
 *
 *  笼子是 Killer Sudoku 的视觉语言。此模块评价棋盘"看起来是否像
 *  人工设计过的作品"，而不只是随机分笼。
 *
 *  评分维度：
 *    1. symmetryScore    对称性（中心/旋转/镜像/类对称）
 *    2. patternScore     图案契合度（与 cage-pattern-library 相似度）
 *    3. topologyScore    拓扑优雅度（跨宫程度、复杂笼占比、形状多样性）
 *    4. balanceScore     布局均衡（笼尺寸分布、区域覆盖均匀）
 *
 *  笼数据格式：{ id, sum, cells: [[r,c], ...] }
 *
 * ============================================================
 */

(function(global) {
  'use strict';

  // ========================================================
  //  对称性检测
  // ========================================================

  function _centerSymPairs(size) {
    const cells = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        cells.push([r, c, size - 1 - r, size - 1 - c]);
    return cells;
  }

  /**
   * 中心对称（180°旋转）
   * 统计：有多少格与它 180° 对称格同属一个笼中。
   * 用笼 ID 的"对称匹配袋"近似：计算 cageMap 的自对偶匹配率。
   */
  function _centerSymmetry(cageMap, size) {
    const cells = _centerSymPairs(size);
    let match = 0;
    for (let i = 0; i < cells.length; i++) {
      const [r, c, symR, symC] = cells[i];
      // 跳过主对角线对称配对自身的情况会重复计数，中心对称每条边对应对被数两次，
      // 这里只统计 (r,c) 字典序 <= (symR,symC) 的一侧，且 r*size+c 与 symR*size+symC 非对称交换
      if (r * size + c > symR * size + symC) continue;
      const id1 = cageMap.get(r + ',' + c);
      const id2 = cageMap.get(symR + ',' + symC);
      if (id1 !== undefined && id1 === id2) match++;
    }
    const total = (size * size) / 2;
    return total > 0 ? match / total : 0;
  }

  /**
   * 类对称性（cage 构成旋 180° 后与自身-不同笼的边界重合度）
   */
  function _rotationalSymmetry(cageMap, size) {
    // 对每个笼，检查其旋转后的 cell 集是否落回同一笼（近似）
    const cageCells = new Map();
    for (const [key, cid] of cageMap) {
      if (!cageCells.has(cid)) cageCells.set(cid, []);
      cageCells.get(cid).push(key);
    }
    let totalCages = 0;
    let selfSymmetric = 0;
    for (const [cid, cellKeys] of cageCells) {
      totalCages++;
      const rotatedAllSame = cellKeys.every(k => {
        const [r, c] = k.split(',').map(Number);
        const symKey = (size - 1 - r) + ',' + (size - 1 - c);
        return cageMap.get(symKey) === cid;
      });
      if (rotatedAllSame) selfSymmetric++;
    }
    return totalCages > 0 ? selfSymmetric / totalCages : 0;
  }

  // ========================================================
  //  图案契合度（与 pattern library 的相似度）
  // ========================================================

  /**
   * 计算某个 pattern 的 cell 集合与棋盘笼的一致性。
   * 理想："pattern 图案本身的区域恰好是一个笼"。
   * 简化：对每个 pattern，统计其 pattern mask 所占单元格
   * 是否属于同一个笼（连通一致），并奖励大 pattern（有设计含量）。
   */
  function _patternFit(patterns, cageMap, size) {
    if (!patterns || patterns.length === 0) {
      return { score: 0.5, matched: null, best: 0 };
    }

    let bestScore = 0;
    let matchedPattern = null;

    for (const pat of patterns) {
      const cells = pat.cells || [];
      if (cells.length < 3) continue;

      // 判定 pattern 区域内，笼 id 的一致性（散度）
      const idCounts = new Map();
      let validCount = 0;
      for (const [r, c] of cells) {
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const cid = cageMap.get(r + ',' + c);
        if (cid === undefined) continue;
        const k = typeof cid === 'string' ? cid : String(cid);
        idCounts.set(k, (idCounts.get(k) || 0) + 1);
        validCount++;
      }
      if (validCount === 0) continue;
      const maxShare = Math.max(...idCounts.values()) / validCount;

      // 一致性 × 图案规模权重
      const sizeWeight = Math.min(1, validCount / 9); // 图案越大越有含量
      const fit = maxShare * sizeWeight;
      if (fit > bestScore) {
        bestScore = fit;
        matchedPattern = pat.name || null;
      }
    }

    return { score: bestScore, matched: matchedPattern, best: bestScore };
  }

  // ========================================================
  //  拓扑优雅度
  // ========================================================

  function getBoxDimensions(size) {
    if (size === 4) return { boxW: 2, boxH: 2 };
    if (size === 6) return { boxW: 3, boxH: 2 };
    return { boxW: 3, boxH: 3 };
  }

  /**
   * 跨宫程度：有多少笼跨多个 3x3 宫。
   * 完全单宫笼太多 → 视觉单调；完全跨宫 → 乱。
   * 理想：15%-45% 的笼跨宫。
   */
  function _crossBoxScore(cages, size) {
    const dim = getBoxDimensions(size);
    let cross = 0;
    let total = 0;
    const boxCounts = {};
    let maxBoxesPerCage = 0;
    for (const cage of cages) {
      const boxes = new Set();
      for (const [r, c] of cage.cells) {
        const br = Math.floor(r / dim.boxH);
        const bc = Math.floor(c / dim.boxW);
        const key = br + ',' + bc;
        boxes.add(key);
        boxCounts[key] = (boxCounts[key] || 0) + 1;
      }
      total++;
      if (boxes.size > 1) cross++;
      maxBoxesPerCage = Math.max(maxBoxesPerCage, boxes.size);
    }
    if (total === 0) return { ratio: 0, balanced: 0 };
    const ratio = cross / total;
    // 跨宫占比 0.15~0.45 为理想
    const inBand = ratio >= 0.15 && ratio <= 0.45;
    const distFromIdeal = Math.abs(ratio - 0.30);
    const balanced = inBand ? (1 - distFromIdeal / 0.30) * 0.9 + 0.1 : Math.max(0, 0.5 - Math.abs(ratio - 0.30));
    return { ratio, balanced, maxBoxesPerCage, boxCoverage: Object.keys(boxCounts).length };
  }

  /**
   * 笼尺寸分布均衡性。
   * 理想：尺寸多样（2-6 混合），没有畸形超大/超小笼主导。
   */
  function _sizeBalance(cages, size) {
    const sizes = cages.map(c => c.cells.length);
    if (sizes.length === 0) return 0.5;
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const distinct = new Set(sizes).size;
    const sizeDiversity = Math.min(1, distinct / 5);
    // 方差（标准差 / 均值）衡量均衡，0.3~0.6 为佳
    const variance = sizes.reduce((a, b) => a + (b - avg) ** 2, 0) / sizes.length;
    const cv = Math.sqrt(variance) / (avg || 1);
    let dispersionScore;
    if (cv < 0.2) dispersionScore = 0.4;      // 太均匀→单调
    else if (cv < 0.6) dispersionScore = 1.0; // 适中
    else dispersionScore = Math.max(0.3, 1 - (cv - 0.6) * 0.7); // 太分散
    return { score: sizeDiversity * 0.5 + dispersionScore * 0.5, avg, cv, distinct };
  }

  // ========================================================
  //  主入口
  // ========================================================

  /**
   * 评估笼子布局的整体美学。
   *
   * @param {Array} cages        - 笼数组 [{id, cells:[[r,c],...]}]
   * @param {number} size        - 盘面尺寸
   * @param {Array} patterns     - 可选的图案库（用于图案契合度）
   * @returns {Object} 笼形美学评分
   */
  function evaluate(cages, size, patterns) {
    size = size || 9;
    if (!cages || cages.length === 0) {
      return { symmetry: 0.5, patternFit: 0.5, topology: 0.5, balance: 0.5, overall: 0.5 };
    }

    const cageMap = new Map();
    for (const cage of cages) {
      for (const [r, c] of cage.cells) {
        cageMap.set(r + ',' + c, cage.id !== undefined ? cage.id : cage.cageId || r + '-' + c);
      }
    }

    const center = _centerSymmetry(cageMap, size);
    const rot = _rotationalSymmetry(cageMap, size);
    const crossBox = _crossBoxScore(cages, size);
    const sizeBal = _sizeBalance(cages, size);
    const pattern = _patternFit(patterns, cageMap, size);

    // 对称性综合（中心 + 旋转，取强项）
    const symmetry = Math.max(center, rot);

    // 拓扑优雅度：跨宫适中 + 均衡盒覆盖
    const topology = crossBox.balanced * 0.7 + (Math.min(1, (sizeBal.distinct + 2) / 6)) * 0.3;

    // 图案契合度：与图案库一致性（无图案库时以对称性代偿）
    const patternFit = pattern.best > 0 ? pattern.score : symmetry * 0.5 + 0.25;

    // 布局均衡
    const balance = sizeBal.score;

    const overall =
      symmetry * 0.30 +
      patternFit * 0.30 +
      topology * 0.25 +
      balance * 0.15;

    return {
      symmetry: Math.round(symmetry * 1000) / 1000,
      rotationalSymmetry: Math.round(rot * 1000) / 1000,
      centerSymmetry: Math.round(center * 1000) / 1000,
      patternFit: Math.round(patternFit * 1000) / 1000,
      matchedPattern: pattern.matched,
      topology: Math.round(topology * 1000) / 1000,
      crossBoxRatio: Math.round(crossBox.ratio * 1000) / 1000,
      balance: Math.round(balance * 1000) / 1000,
      sizeAvg: Math.round(sizeBal.avg * 10) / 10,
      cageCount: cages.length,
      overall: Math.round(overall * 1000) / 1000
    };
  }

  const CageCompositionAnalyzer = { evaluate };

  // 兼容 Node require：既导出 module.exports，也注册到 global（与 tech-rater 一致）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CageCompositionAnalyzer };
  }
  if (typeof global !== 'undefined') {
    global.CageCompositionAnalyzer = CageCompositionAnalyzer;
  }
  if (typeof window !== 'undefined') {
    window.CageCompositionAnalyzer = CageCompositionAnalyzer;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));