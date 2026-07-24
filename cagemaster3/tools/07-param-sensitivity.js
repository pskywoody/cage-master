#!/usr/bin/env node
/**
 * ============================================================
 *  07-param-sensitivity.js - 参数敏感性分析脚本
 * ============================================================
 *
 *  分析心理学加权参数（SPATIAL_FILL_THRESHOLD、CAGE_EXTREME_SUM_LOW/HIGH、
 *  CANDIDATE_DENSITY_LIMIT）对三色分类结果的影响程度，评估是否需要调优。
 *
 *  分析内容：
 *    1. 基准线分析：当前参数下的三色分布
 *    2. 空间聚集效应分析：SPATIAL_FILL_THRESHOLD 的影响
 *    3. 笼子显著性效应分析：CAGE_EXTREME_SUM_LOW/HIGH 的影响
 *    4. 候选数密度兜底分析：CANDIDATE_DENSITY_LIMIT 的影响
 *    5. 参数敏感性总结与调优建议
 *
 *  输出：
 *    - 控制台详细分析表格
 *    - output/param_sensitivity_report.json
 */

const fs = require('fs');
const path = require('path');
const { TechRater, TechRaterAdapter, createBoardFromLevel, PROJECT_ROOT } = require('./_loader.js');

// ========================================================
//  路径配置
// ========================================================

const LEVELS_PATH = path.join(PROJECT_ROOT, 'data', 'all_levels.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'param_sensitivity_report.json');

// ========================================================
//  工具函数
// ========================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function pad(str, len, align = 'left') {
  str = String(str);
  if (str.length >= len) return str.slice(0, len);
  const p = ' '.repeat(len - str.length);
  return align === 'right' ? p + str : str + p;
}

function popcount(mask) {
  let count = 0;
  while (mask) {
    mask &= mask - 1;
    count++;
  }
  return count;
}

/**
 * 判断关卡类型
 */
function getLevelCategory(level) {
  if (level.gridSize === 4 || level.difficultyLevel <= 1) {
    return 'beginner'; // 新手关
  }
  if (level.difficultyLevel >= 2 && level.difficultyLevel <= 3) {
    return 'mid'; // 中盘关
  }
  return 'endgame'; // 收官关
}

function categoryLabel(cat) {
  const map = { beginner: '新手关', mid: '中盘关', endgame: '收官关' };
  return map[cat] || cat;
}

// ========================================================
//  核心：自定义分类器（支持参数调整）
// ========================================================

/**
 * 使用自定义参数对单个关卡进行三色分类
 * @param {Object} level - 关卡数据
 * @param {Object} customWeights - 自定义心理学加权参数（覆盖默认）
 * @returns {Object} { gridMeta, stats, stepMap, adapter }
 */
function classifyWithParams(level, customWeights = {}) {
  const board = createBoardFromLevel(level);
  const adapter = new TechRaterAdapter(board);

  // 合并自定义参数
  const weights = {
    ...TechRaterAdapter.CONFIG.PSYCHOLOGY_WEIGHTS,
    ...customWeights,
  };

  // 构建 stepMap（使用 adapter 内部方法）
  const stepMap = adapter._buildStepMap();

  // 手动分类（使用自定义参数）
  const size = adapter.size;
  const gridMeta = new Array(size);
  const initialGrid = adapter._initialGrid;
  const initialCandidates = adapter._initialCandidates;
  const rater = adapter.rater;

  const boxH = rater.boxH || 3;
  const boxW = rater.boxW || 3;

  for (let r = 0; r < size; r++) {
    gridMeta[r] = new Array(size);
    for (let c = 0; c < size; c++) {
      // 已填格
      const isFilled = initialGrid[r][c] !== 0;
      if (isFilled) {
        gridMeta[r][c] = { category: 'filled' };
        continue;
      }

      const key = `${r},${c}`;
      const stepInfo = stepMap.get(key);
      const score = stepInfo
        ? (stepInfo.difficultyScore !== undefined ? stepInfo.difficultyScore : (stepInfo.depth || 0))
        : 0;

      const initMask = initialCandidates?.[r]?.[c] ?? 0;
      const initCandCount = popcount(initMask);

      // 基础分类
      let category = 'core';
      if (score >= TechRaterAdapter.CONFIG.GATE_DEPTH_THRESHOLD) {
        category = 'gate';
      } else if (score <= TechRaterAdapter.CONFIG.SIMPLE_SCORE_MAX) {
        category = 'simple';
      }

      // 心理学加权（使用自定义参数）

      // 规则1：空间聚集
      let rowFilled = 0;
      for (let cc = 0; cc < size; cc++) {
        if (initialGrid[r][cc] !== 0) rowFilled++;
      }
      let colFilled = 0;
      for (let rr = 0; rr < size; rr++) {
        if (initialGrid[rr][c] !== 0) colFilled++;
      }
      const br = Math.floor(r / boxH) * boxH;
      const bc = Math.floor(c / boxW) * boxW;
      let boxFilled = 0;
      for (let dr = 0; dr < boxH; dr++) {
        for (let dc = 0; dc < boxW; dc++) {
          if (initialGrid[br + dr][bc + dc] !== 0) boxFilled++;
        }
      }
      const spatiallySalient =
        rowFilled >= weights.SPATIAL_FILL_THRESHOLD ||
        colFilled >= weights.SPATIAL_FILL_THRESHOLD ||
        boxFilled >= weights.SPATIAL_FILL_THRESHOLD;

      // 规则2：笼子显著性
      const cage = rater.cellCage ? rater.cellCage[r * size + c] : null;
      let cageSalient = false;
      if (cage && cage.cells.length === 2) {
        cageSalient =
          cage.sum <= weights.CAGE_EXTREME_SUM_LOW ||
          cage.sum >= weights.CAGE_EXTREME_SUM_HIGH;
      }

      // 应用加权规则
      if (spatiallySalient) {
        category = 'simple';
      } else if (cageSalient) {
        category = 'simple';
      } else if (initCandCount === 1) {
        category = 'simple';
      } else if (category === 'gate' && initCandCount <= weights.CANDIDATE_DENSITY_LIMIT) {
        category = 'core';
      }

      gridMeta[r][c] = {
        category,
        score,
        initCandCount,
        spatiallySalient,
        cageSalient,
      };
    }
  }

  // 统计
  let simple = 0, core = 0, gate = 0, totalEmpty = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const meta = gridMeta[r][c];
      if (meta.category === 'filled') continue;
      totalEmpty++;
      if (meta.category === 'simple') simple++;
      else if (meta.category === 'core') core++;
      else if (meta.category === 'gate') gate++;
    }
  }

  return {
    gridMeta,
    stats: { simple, core, gate, totalEmpty },
    stepMap,
    adapter,
    initialGrid,
    initialCandidates,
    weights,
  };
}

/**
 * 计算两次分类之间的差异
 * @returns {Object} { changedCells, simpleDelta, coreDelta, gateDelta }
 */
function diffClassifications(baseline, modified) {
  const size = baseline.gridMeta.length;
  const changedCells = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const base = baseline.gridMeta[r][c];
      const mod = modified.gridMeta[r][c];
      if (base.category !== mod.category) {
        changedCells.push({
          row: r,
          col: c,
          from: base.category,
          to: mod.category,
        });
      }
    }
  }

  return {
    changedCells,
    changeCount: changedCells.length,
    simpleDelta: modified.stats.simple - baseline.stats.simple,
    coreDelta: modified.stats.core - baseline.stats.core,
    gateDelta: modified.stats.gate - baseline.stats.gate,
  };
}

// ========================================================
//  分析模块 1：基准线分析
// ========================================================

function analyzeBaseline(levels, levelResults) {
  console.log();
  console.log('━'.repeat(70));
  console.log('  【1/5】基准线分析：当前参数下的三色分布');
  console.log('━'.repeat(70));
  console.log();

  const currentParams = TechRaterAdapter.CONFIG.PSYCHOLOGY_WEIGHTS;
  console.log('  当前心理学加权参数：');
  console.log(`    SPATIAL_FILL_THRESHOLD  = ${currentParams.SPATIAL_FILL_THRESHOLD}  (行/列/宫已填 >= N 升格 simple)`);
  console.log(`    CAGE_EXTREME_SUM_LOW    = ${currentParams.CAGE_EXTREME_SUM_LOW}  (2格笼和 <= N 升格 simple)`);
  console.log(`    CAGE_EXTREME_SUM_HIGH   = ${currentParams.CAGE_EXTREME_SUM_HIGH} (2格笼和 >= N 升格 simple)`);
  console.log(`    CANDIDATE_DENSITY_LIMIT = ${currentParams.CANDIDATE_DENSITY_LIMIT}  (gate 候选数 <= N 降级 core)`);
  console.log();

  // 按类别分组
  const categories = { beginner: [], mid: [], endgame: [] };
  for (const lr of levelResults) {
    const cat = getLevelCategory(lr.level);
    categories[cat].push(lr);
  }

  // 打印汇总表
  const header =
    pad('类别', 10) +
    pad('关卡数', 8, 'right') +
    pad('平均空格', 10, 'right') +
    pad('simple均数', 12, 'right') +
    pad('simple占比', 12, 'right') +
    pad('core均数', 10, 'right') +
    pad('gate均数', 10, 'right');
  console.log(header);
  console.log('─'.repeat(header.length));

  const catStats = {};
  for (const cat of ['beginner', 'mid', 'endgame']) {
    const items = categories[cat];
    if (items.length === 0) continue;

    const avgEmpty = items.reduce((s, x) => s + x.baseline.stats.totalEmpty, 0) / items.length;
    const avgSimple = items.reduce((s, x) => s + x.baseline.stats.simple, 0) / items.length;
    const avgSimplePct = items.reduce((s, x) => s + (x.baseline.stats.simple / x.baseline.stats.totalEmpty * 100), 0) / items.length;
    const avgCore = items.reduce((s, x) => s + x.baseline.stats.core, 0) / items.length;
    const avgGate = items.reduce((s, x) => s + x.baseline.stats.gate, 0) / items.length;

    catStats[cat] = {
      count: items.length,
      avgEmpty: +avgEmpty.toFixed(1),
      avgSimple: +avgSimple.toFixed(1),
      avgSimplePct: +avgSimplePct.toFixed(1),
      avgCore: +avgCore.toFixed(1),
      avgGate: +avgGate.toFixed(1),
    };

    console.log(
      pad(categoryLabel(cat), 10) +
      pad(items.length, 8, 'right') +
      pad(avgEmpty.toFixed(1), 10, 'right') +
      pad(avgSimple.toFixed(1), 12, 'right') +
      pad(avgSimplePct.toFixed(1) + '%', 12, 'right') +
      pad(avgCore.toFixed(1), 10, 'right') +
      pad(avgGate.toFixed(1), 10, 'right')
    );
  }

  // 全部平均
  const allValid = levelResults.filter(lr => lr.baseline.stats.totalEmpty > 0);
  const allAvgEmpty = allValid.reduce((s, x) => s + x.baseline.stats.totalEmpty, 0) / allValid.length;
  const allAvgSimple = allValid.reduce((s, x) => s + x.baseline.stats.simple, 0) / allValid.length;
  const allAvgSimplePct = allValid.reduce((s, x) => s + (x.baseline.stats.simple / x.baseline.stats.totalEmpty * 100), 0) / allValid.length;
  const allAvgCore = allValid.reduce((s, x) => s + x.baseline.stats.core, 0) / allValid.length;
  const allAvgGate = allValid.reduce((s, x) => s + x.baseline.stats.gate, 0) / allValid.length;

  console.log('─'.repeat(header.length));
  console.log(
    pad('总计', 10) +
    pad(allValid.length, 8, 'right') +
    pad(allAvgEmpty.toFixed(1), 10, 'right') +
    pad(allAvgSimple.toFixed(1), 12, 'right') +
    pad(allAvgSimplePct.toFixed(1) + '%', 12, 'right') +
    pad(allAvgCore.toFixed(1), 10, 'right') +
    pad(allAvgGate.toFixed(1), 10, 'right')
  );

  return {
    currentParams,
    catStats,
    overall: {
      count: allValid.length,
      avgEmpty: +allAvgEmpty.toFixed(1),
      avgSimple: +allAvgSimple.toFixed(1),
      avgSimplePct: +allAvgSimplePct.toFixed(1),
      avgCore: +allAvgCore.toFixed(1),
      avgGate: +allAvgGate.toFixed(1),
    },
  };
}

// ========================================================
//  分析模块 2：空间聚集效应分析
// ========================================================

function analyzeSpatialEffect(levels, levelResults) {
  console.log();
  console.log('━'.repeat(70));
  console.log('  【2/5】空间聚集效应分析：SPATIAL_FILL_THRESHOLD');
  console.log('━'.repeat(70));
  console.log();

  // 统计基准线中有多少 simple 格是因为空间聚集规则被升格的
  let totalSpatialSimple = 0;
  let totalSimple = 0;
  const perLevelSpatial = [];

  for (const lr of levelResults) {
    const { gridMeta, stats } = lr.baseline;
    const size = gridMeta.length;
    let spatialCount = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const meta = gridMeta[r][c];
        if (meta.category === 'simple' && meta.spatiallySalient) {
          spatialCount++;
        }
      }
    }

    totalSpatialSimple += spatialCount;
    totalSimple += stats.simple;

    perLevelSpatial.push({
      levelId: lr.level.levelId,
      title: lr.level.title,
      category: getLevelCategory(lr.level),
      spatialSimple: spatialCount,
      totalSimple: stats.simple,
      spatialPct: stats.simple > 0 ? (spatialCount / stats.simple * 100) : 0,
    });
  }

  console.log('  2.1 空间聚集规则升格为 simple 的格子统计：');
  console.log();
  console.log(`    总 simple 格数: ${totalSimple}`);
  console.log(`    空间聚集升格:   ${totalSpatialSimple} (${totalSimple > 0 ? (totalSpatialSimple / totalSimple * 100).toFixed(1) : 0}% 的 simple 格)`);
  console.log();

  // 阈值调参分析
  const thresholds = [6, 7, 8];
  const thresholdResults = {};

  for (const th of thresholds) {
    const modifiedWeights = { SPATIAL_FILL_THRESHOLD: th };
    let totalSimpleTh = 0;
    let totalCoreTh = 0;
    let totalGateTh = 0;
    let totalEmptyTh = 0;
    const perLevelChanges = [];

    for (const lr of levelResults) {
      const modified = classifyWithParams(lr.level, modifiedWeights);
      const diff = diffClassifications(lr.baseline, modified);

      totalSimpleTh += modified.stats.simple;
      totalCoreTh += modified.stats.core;
      totalGateTh += modified.stats.gate;
      totalEmptyTh += modified.stats.totalEmpty;

      perLevelChanges.push({
        levelId: lr.level.levelId,
        title: lr.level.title,
        category: getLevelCategory(lr.level),
        changeCount: diff.changeCount,
        simpleDelta: diff.simpleDelta,
      });
    }

    thresholdResults[th] = {
      totalSimple: totalSimpleTh,
      totalCore: totalCoreTh,
      totalGate: totalGateTh,
      simplePct: totalEmptyTh > 0 ? +(totalSimpleTh / totalEmptyTh * 100).toFixed(2) : 0,
      perLevelChanges,
    };
  }

  console.log('  2.2 阈值调整对 simple 占比的影响：');
  console.log();

  const thHeader =
    pad('阈值', 8) +
    pad('simple总数', 12, 'right') +
    pad('simple占比', 12, 'right') +
    pad('相对基准变化', 14, 'right') +
    pad('受影响关卡', 12, 'right') +
    pad('平均变化格数', 14, 'right');
  console.log(thHeader);
  console.log('─'.repeat(thHeader.length));

  const baselineSimplePct = thresholdResults[7].simplePct;
  for (const th of thresholds) {
    const tr = thresholdResults[th];
    const affectedLevels = tr.perLevelChanges.filter(x => x.changeCount > 0).length;
    const avgChange = affectedLevels > 0
      ? (tr.perLevelChanges.reduce((s, x) => s + x.changeCount, 0) / affectedLevels).toFixed(1)
      : '0';
    const deltaStr = th === 7 ? '基准线' :
      (tr.simplePct - baselineSimplePct > 0 ? '+' : '') + (tr.simplePct - baselineSimplePct).toFixed(2) + '%';

    console.log(
      pad(th, 8) +
      pad(tr.totalSimple, 12, 'right') +
      pad(tr.simplePct.toFixed(2) + '%', 12, 'right') +
      pad(deltaStr, 14, 'right') +
      pad(affectedLevels, 12, 'right') +
      pad(avgChange, 14, 'right')
    );
  }
  console.log();

  // 阈值 = 6 时受影响最大的关卡
  console.log('  2.3 阈值调至 6 时受影响最大的关卡 (TOP 10)：');
  console.log();
  const th6Affected = thresholdResults[6].perLevelChanges
    .filter(x => x.changeCount > 0)
    .sort((a, b) => b.changeCount - a.changeCount)
    .slice(0, 10);

  if (th6Affected.length > 0) {
    const topHeader =
      pad('ID', 6) +
      pad('标题', 16) +
      pad('类别', 8) +
      pad('变化格数', 10, 'right') +
      pad('simple增量', 12, 'right');
    console.log(topHeader);
    console.log('─'.repeat(topHeader.length));
    for (const item of th6Affected) {
      console.log(
        pad(item.levelId, 6) +
        pad(item.title || '', 16) +
        pad(categoryLabel(item.category), 8) +
        pad(item.changeCount, 10, 'right') +
        pad('+' + item.simpleDelta, 12, 'right')
      );
    }
  } else {
    console.log('    （无受影响关卡）');
  }
  console.log();

  // 阈值 = 8 时受影响的关卡
  console.log('  2.4 阈值调至 8 时受影响最大的关卡 (TOP 10)：');
  console.log();
  const th8Affected = thresholdResults[8].perLevelChanges
    .filter(x => x.changeCount > 0)
    .sort((a, b) => b.changeCount - a.changeCount)
    .slice(0, 10);

  if (th8Affected.length > 0) {
    const topHeader =
      pad('ID', 6) +
      pad('标题', 16) +
      pad('类别', 8) +
      pad('变化格数', 10, 'right') +
      pad('simple变化', 12, 'right');
    console.log(topHeader);
    console.log('─'.repeat(topHeader.length));
    for (const item of th8Affected) {
      const deltaStr = item.simpleDelta >= 0 ? '+' + item.simpleDelta : item.simpleDelta;
      console.log(
        pad(item.levelId, 6) +
        pad(item.title || '', 16) +
        pad(categoryLabel(item.category), 8) +
        pad(item.changeCount, 10, 'right') +
        pad(deltaStr, 12, 'right')
      );
    }
  } else {
    console.log('    （无受影响关卡）');
  }

  return {
    spatialSimpleCount: totalSpatialSimple,
    spatialSimplePct: totalSimple > 0 ? +(totalSpatialSimple / totalSimple * 100).toFixed(2) : 0,
    perLevelSpatial,
    thresholdResults,
  };
}

// ========================================================
//  分析模块 3：笼子显著性效应分析
// ========================================================

function analyzeCageSalienceEffect(levels, levelResults) {
  console.log();
  console.log('━'.repeat(70));
  console.log('  【3/5】笼子显著性效应分析：CAGE_EXTREME_SUM_LOW/HIGH');
  console.log('━'.repeat(70));
  console.log();

  // 统计基准线中有多少 simple 格是因为笼子显著性被升格的
  let totalCageSimple = 0;
  let totalSimple = 0;
  let total2CellCages = 0;
  const cageSumHistogram = {}; // 2格笼和值分布
  const salientCageHistogram = {}; // 被标记为显著的2格笼和值分布

  for (const lr of levelResults) {
    const { gridMeta, stats } = lr.baseline;
    const size = gridMeta.length;
    const adapter = lr.baseline.adapter;
    const rater = adapter.rater;
    const seenCages = new Set();

    let cageSimpleCount = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const meta = gridMeta[r][c];
        if (meta.category === 'filled') continue;

        const cage = rater.cellCage ? rater.cellCage[r * size + c] : null;
        if (cage && cage.cells.length === 2) {
          const cageKey = cage.id;
          if (!seenCages.has(cageKey)) {
            seenCages.add(cageKey);
            total2CellCages++;
            const sum = cage.sum;
            cageSumHistogram[sum] = (cageSumHistogram[sum] || 0) + 1;

            if (meta.cageSalient) {
              salientCageHistogram[sum] = (salientCageHistogram[sum] || 0) + 1;
            }
          }

          if (meta.category === 'simple' && meta.cageSalient) {
            cageSimpleCount++;
          }
        }
      }
    }

    totalCageSimple += cageSimpleCount;
    totalSimple += stats.simple;
  }

  console.log('  3.1 笼子显著性规则升格为 simple 的格子统计：');
  console.log();
  console.log(`    总 simple 格数:  ${totalSimple}`);
  console.log(`    笼子显著性升格:  ${totalCageSimple} (${totalSimple > 0 ? (totalCageSimple / totalSimple * 100).toFixed(2) : 0}% 的 simple 格)`);
  console.log(`    2 格笼总数:      ${total2CellCages}`);
  console.log(`    显著 2 格笼数:   ${Object.values(salientCageHistogram).reduce((s, v) => s + v, 0)}`);
  console.log();

  // 2格笼和值分布直方图
  console.log('  3.2 2 格笼和值分布直方图：');
  console.log();

  const sums = Object.keys(cageSumHistogram).map(Number).sort((a, b) => a - b);
  const maxCount = Math.max(...Object.values(cageSumHistogram));
  const barWidth = 30;

  const low = TechRaterAdapter.CONFIG.PSYCHOLOGY_WEIGHTS.CAGE_EXTREME_SUM_LOW;
  const high = TechRaterAdapter.CONFIG.PSYCHOLOGY_WEIGHTS.CAGE_EXTREME_SUM_HIGH;

  const histHeader = pad('和值', 6) + pad('数量', 8, 'right') + '  分布';
  console.log(histHeader);
  console.log('─'.repeat(histHeader.length + barWidth));

  for (const sum of sums) {
    const count = cageSumHistogram[sum];
    const barLen = Math.round(count / maxCount * barWidth);
    const bar = '█'.repeat(barLen) + '░'.repeat(barWidth - barLen);
    const marker = (sum <= low || sum >= high) ? ' ← 显著' : '';
    console.log(
      pad(sum, 6) +
      pad(count, 8, 'right') +
      '  ' + bar +
      marker
    );
  }
  console.log();
  console.log(`    （LOW=${low}, HIGH=${high}，超出范围的为显著笼）`);
  console.log();

  // LOW 参数调整分析
  const lowValues = [4, 5, 6];
  const lowResults = {};

  for (const lv of lowValues) {
    const modifiedWeights = { CAGE_EXTREME_SUM_LOW: lv };
    let totalSimpleTh = 0;
    let totalEmptyTh = 0;
    const perLevelChanges = [];

    for (const lr of levelResults) {
      const modified = classifyWithParams(lr.level, modifiedWeights);
      const diff = diffClassifications(lr.baseline, modified);

      totalSimpleTh += modified.stats.simple;
      totalEmptyTh += modified.stats.totalEmpty;

      perLevelChanges.push({
        levelId: lr.level.levelId,
        title: lr.level.title,
        category: getLevelCategory(lr.level),
        changeCount: diff.changeCount,
        simpleDelta: diff.simpleDelta,
      });
    }

    lowResults[lv] = {
      totalSimple: totalSimpleTh,
      simplePct: totalEmptyTh > 0 ? +(totalSimpleTh / totalEmptyTh * 100).toFixed(2) : 0,
      perLevelChanges,
    };
  }

  // HIGH 参数调整分析
  const highValues = [16, 17, 18];
  const highResults = {};

  for (const hv of highValues) {
    const modifiedWeights = { CAGE_EXTREME_SUM_HIGH: hv };
    let totalSimpleTh = 0;
    let totalEmptyTh = 0;
    const perLevelChanges = [];

    for (const lr of levelResults) {
      const modified = classifyWithParams(lr.level, modifiedWeights);
      const diff = diffClassifications(lr.baseline, modified);

      totalSimpleTh += modified.stats.simple;
      totalEmptyTh += modified.stats.totalEmpty;

      perLevelChanges.push({
        levelId: lr.level.levelId,
        title: lr.level.title,
        category: getLevelCategory(lr.level),
        changeCount: diff.changeCount,
        simpleDelta: diff.simpleDelta,
      });
    }

    highResults[hv] = {
      totalSimple: totalSimpleTh,
      simplePct: totalEmptyTh > 0 ? +(totalSimpleTh / totalEmptyTh * 100).toFixed(2) : 0,
      perLevelChanges,
    };
  }

  console.log('  3.3 LOW 值调整对 simple 占比的影响：');
  console.log();
  const lowHeader =
    pad('LOW值', 8) +
    pad('simple总数', 12, 'right') +
    pad('simple占比', 12, 'right') +
    pad('相对基准变化', 14, 'right') +
    pad('受影响关卡', 12, 'right');
  console.log(lowHeader);
  console.log('─'.repeat(lowHeader.length));

  const baselinePct = lowResults[5].simplePct;
  for (const lv of lowValues) {
    const lr = lowResults[lv];
    const affected = lr.perLevelChanges.filter(x => x.changeCount > 0).length;
    const deltaStr = lv === 5 ? '基准线' :
      (lr.simplePct - baselinePct > 0 ? '+' : '') + (lr.simplePct - baselinePct).toFixed(2) + '%';
    console.log(
      pad(lv, 8) +
      pad(lr.totalSimple, 12, 'right') +
      pad(lr.simplePct.toFixed(2) + '%', 12, 'right') +
      pad(deltaStr, 14, 'right') +
      pad(affected, 12, 'right')
    );
  }
  console.log();

  console.log('  3.4 HIGH 值调整对 simple 占比的影响：');
  console.log();
  const highHeader =
    pad('HIGH值', 8) +
    pad('simple总数', 12, 'right') +
    pad('simple占比', 12, 'right') +
    pad('相对基准变化', 14, 'right') +
    pad('受影响关卡', 12, 'right');
  console.log(highHeader);
  console.log('─'.repeat(highHeader.length));

  const baselineHighPct = highResults[17].simplePct;
  for (const hv of highValues) {
    const hr = highResults[hv];
    const affected = hr.perLevelChanges.filter(x => x.changeCount > 0).length;
    const deltaStr = hv === 17 ? '基准线' :
      (hr.simplePct - baselineHighPct > 0 ? '+' : '') + (hr.simplePct - baselineHighPct).toFixed(2) + '%';
    console.log(
      pad(hv, 8) +
      pad(hr.totalSimple, 12, 'right') +
      pad(hr.simplePct.toFixed(2) + '%', 12, 'right') +
      pad(deltaStr, 14, 'right') +
      pad(affected, 12, 'right')
    );
  }

  return {
    cageSimpleCount: totalCageSimple,
    cageSimplePct: totalSimple > 0 ? +(totalCageSimple / totalSimple * 100).toFixed(2) : 0,
    total2CellCages,
    cageSumHistogram,
    salientCageHistogram,
    lowResults,
    highResults,
  };
}

// ========================================================
//  分析模块 4：候选数密度兜底分析
// ========================================================

function analyzeCandidateDensityEffect(levels, levelResults) {
  console.log();
  console.log('━'.repeat(70));
  console.log('  【4/5】候选数密度兜底分析：CANDIDATE_DENSITY_LIMIT');
  console.log('━'.repeat(70));
  console.log();

  // 统计有多少 gate 格因为候选数 <= 2 被降级为 core
  let totalGateDegraded = 0;
  let totalGateBaseline = 0;
  const perLevelDegraded = [];

  // 方法：把 CANDIDATE_DENSITY_LIMIT 设为 0（即禁用降级规则），对比差异
  const disabledWeights = { CANDIDATE_DENSITY_LIMIT: 0 };

  for (const lr of levelResults) {
    const modified = classifyWithParams(lr.level, disabledWeights);
    // 当禁用降级时，gate 数量会增加（原本被降级为 core 的恢复为 gate）
    const diff = diffClassifications(lr.baseline, modified);

    // 基准线 gate 数
    totalGateBaseline += lr.baseline.stats.gate;

    // 被降级的 gate 数 = 禁用后的 gate 增量
    const degradedCount = diff.gateDelta; // 应为正数（禁用后 gate 变多）
    totalGateDegraded += degradedCount;

    perLevelDegraded.push({
      levelId: lr.level.levelId,
      title: lr.level.title,
      category: getLevelCategory(lr.level),
      baselineGate: lr.baseline.stats.gate,
      degradedCount: degradedCount,
      degradedPct: lr.baseline.stats.gate > 0 ? (degradedCount / (lr.baseline.stats.gate + degradedCount) * 100) : 0,
    });
  }

  console.log('  4.1 候选数密度兜底规则影响统计：');
  console.log();
  console.log(`    基准线 gate 格总数:  ${totalGateBaseline}`);
  console.log(`    被降级为 core 的 gate 数: ${totalGateDegraded}`);
  const totalGateOriginal = totalGateBaseline + totalGateDegraded;
  console.log(`    无兜底时 gate 总数:    ${totalGateOriginal}`);
  console.log(`    降级比例:              ${totalGateOriginal > 0 ? (totalGateDegraded / totalGateOriginal * 100).toFixed(2) : 0}% 的原始 gate 被降级`);
  console.log();

  // 不同阈值的影响
  const limitValues = [1, 2, 3];
  const limitResults = {};

  for (const lim of limitValues) {
    const modifiedWeights = { CANDIDATE_DENSITY_LIMIT: lim };
    let totalGateTh = 0;
    let totalCoreTh = 0;
    let totalEmptyTh = 0;
    const perLevelChanges = [];

    for (const lr of levelResults) {
      const modified = classifyWithParams(lr.level, modifiedWeights);
      const diff = diffClassifications(lr.baseline, modified);

      totalGateTh += modified.stats.gate;
      totalCoreTh += modified.stats.core;
      totalEmptyTh += modified.stats.totalEmpty;

      perLevelChanges.push({
        levelId: lr.level.levelId,
        title: lr.level.title,
        category: getLevelCategory(lr.level),
        changeCount: diff.changeCount,
        gateDelta: diff.gateDelta,
      });
    }

    limitResults[lim] = {
      totalGate: totalGateTh,
      totalCore: totalCoreTh,
      gatePct: totalEmptyTh > 0 ? +(totalGateTh / totalEmptyTh * 100).toFixed(2) : 0,
      perLevelChanges,
    };
  }

  console.log('  4.2 不同 CANDIDATE_DENSITY_LIMIT 值的影响：');
  console.log();
  const limHeader =
    pad('阈值', 8) +
    pad('gate总数', 12, 'right') +
    pad('gate占比', 12, 'right') +
    pad('相对基准变化', 14, 'right') +
    pad('受影响关卡', 12, 'right');
  console.log(limHeader);
  console.log('─'.repeat(limHeader.length));

  const baselineGatePct = limitResults[2].gatePct;
  for (const lim of limitValues) {
    const lr = limitResults[lim];
    const affected = lr.perLevelChanges.filter(x => x.changeCount > 0).length;
    const deltaStr = lim === 2 ? '基准线' :
      (lr.gatePct - baselineGatePct > 0 ? '+' : '') + (lr.gatePct - baselineGatePct).toFixed(2) + '%';
    console.log(
      pad(lim, 8) +
      pad(lr.totalGate, 12, 'right') +
      pad(lr.gatePct.toFixed(2) + '%', 12, 'right') +
      pad(deltaStr, 14, 'right') +
      pad(affected, 12, 'right')
    );
  }
  console.log();

  // 受影响最大的关卡
  console.log('  4.3 受兜底规则影响最大的关卡 (TOP 10)：');
  console.log();
  const topAffected = perLevelDegraded
    .filter(x => x.degradedCount > 0)
    .sort((a, b) => b.degradedCount - a.degradedCount)
    .slice(0, 10);

  if (topAffected.length > 0) {
    const topHeader =
      pad('ID', 6) +
      pad('标题', 16) +
      pad('类别', 8) +
      pad('基准gate', 10, 'right') +
      pad('被降级数', 10, 'right') +
      pad('降级比例', 10, 'right');
    console.log(topHeader);
    console.log('─'.repeat(topHeader.length));
    for (const item of topAffected) {
      console.log(
        pad(item.levelId, 6) +
        pad(item.title || '', 16) +
        pad(categoryLabel(item.category), 8) +
        pad(item.baselineGate, 10, 'right') +
        pad(item.degradedCount, 10, 'right') +
        pad(item.degradedPct.toFixed(1) + '%', 10, 'right')
      );
    }
  } else {
    console.log('    （无受影响关卡）');
  }

  return {
    gateDegradedCount: totalGateDegraded,
    gateDegradedPct: totalGateOriginal > 0 ? +(totalGateDegraded / totalGateOriginal * 100).toFixed(2) : 0,
    perLevelDegraded,
    limitResults,
  };
}

// ========================================================
//  分析模块 5：参数敏感性总结与调优建议
// ========================================================

function analyzeSensitivitySummary(baselineResult, spatialResult, cageResult, candidateResult, levelResults) {
  console.log();
  console.log('━'.repeat(70));
  console.log('  【5/5】参数敏感性总结与调优建议');
  console.log('━'.repeat(70));
  console.log();

  // 计算各参数对 simple 占比的绝对影响
  const spatialImpact6 = Math.abs(spatialResult.thresholdResults[6].simplePct - spatialResult.thresholdResults[7].simplePct);
  const spatialImpact8 = Math.abs(spatialResult.thresholdResults[8].simplePct - spatialResult.thresholdResults[7].simplePct);
  const spatialMaxImpact = Math.max(spatialImpact6, spatialImpact8);

  const lowImpact4 = Math.abs(cageResult.lowResults[4].simplePct - cageResult.lowResults[5].simplePct);
  const lowImpact6 = Math.abs(cageResult.lowResults[6].simplePct - cageResult.lowResults[5].simplePct);
  const lowMaxImpact = Math.max(lowImpact4, lowImpact6);

  const highImpact16 = Math.abs(cageResult.highResults[16].simplePct - cageResult.highResults[17].simplePct);
  const highImpact18 = Math.abs(cageResult.highResults[18].simplePct - cageResult.highResults[17].simplePct);
  const highMaxImpact = Math.max(highImpact16, highImpact18);

  const cageMaxImpact = Math.max(lowMaxImpact, highMaxImpact);

  const candImpactGate1 = Math.abs(candidateResult.limitResults[1].gatePct - candidateResult.limitResults[2].gatePct);
  const candImpactGate3 = Math.abs(candidateResult.limitResults[3].gatePct - candidateResult.limitResults[2].gatePct);
  const candMaxImpact = Math.max(candImpactGate1, candImpactGate3);

  console.log('  5.1 各参数敏感性排名（对 simple/gate 占比的绝对影响）：');
  console.log();

  const impacts = [
    { param: 'SPATIAL_FILL_THRESHOLD (±1)', impact: spatialMaxImpact, metric: 'simple%', unit: '%' },
    { param: 'CAGE_EXTREME_SUM_LOW (±1)', impact: lowMaxImpact, metric: 'simple%', unit: '%' },
    { param: 'CAGE_EXTREME_SUM_HIGH (±1)', impact: highMaxImpact, metric: 'simple%', unit: '%' },
    { param: 'CANDIDATE_DENSITY_LIMIT (±1)', impact: candMaxImpact, metric: 'gate%', unit: '%' },
  ].sort((a, b) => b.impact - a.impact);

  const impHeader =
    pad('排名', 6) +
    pad('参数', 32) +
    pad('影响幅度', 12, 'right') +
    pad('影响指标', 12, 'right');
  console.log(impHeader);
  console.log('─'.repeat(impHeader.length));

  for (let i = 0; i < impacts.length; i++) {
    console.log(
      pad('#' + (i + 1), 6) +
      pad(impacts[i].param, 32) +
      pad(impacts[i].impact.toFixed(2) + impacts[i].unit, 12, 'right') +
      pad(impacts[i].metric, 12, 'right')
    );
  }
  console.log();

  // 最敏感参数
  const mostSensitive = impacts[0];
  console.log(`  最敏感参数: ${mostSensitive.param}（影响幅度 ${mostSensitive.impact.toFixed(2)}${mostSensitive.unit}）`);
  console.log();

  // 合理性评估
  console.log('  5.2 分类合理性评估（基于目标区间）：');
  console.log();

  const standards = {
    beginner: { simpleMin: 70, simpleMax: 100, label: '新手关 simple 70%+' },
    mid: { simpleMin: 35, simpleMax: 60, label: '中盘关 simple 35-60%' },
    endgame: { simpleMin: 30, simpleMax: 55, label: '收官关 simple 30-55%' },
  };

  const evalHeader =
    pad('关卡类型', 10) +
    pad('simple均值', 12, 'right') +
    pad('目标区间', 16) +
    pad('达标率', 10, 'right') +
    pad('偏低数', 8, 'right') +
    pad('偏高数', 8, 'right') +
    pad('评估', 10);
  console.log(evalHeader);
  console.log('─'.repeat(evalHeader.length));

  const catEval = {};
  for (const cat of ['beginner', 'mid', 'endgame']) {
    const catResults = levelResults.filter(lr => getLevelCategory(lr.level) === cat);
    if (catResults.length === 0) continue;

    const std = standards[cat];
    let belowCount = 0;
    let aboveCount = 0;
    let passCount = 0;

    for (const lr of catResults) {
      const simplePct = lr.baseline.stats.totalEmpty > 0
        ? (lr.baseline.stats.simple / lr.baseline.stats.totalEmpty * 100)
        : 0;
      if (simplePct < std.simpleMin) belowCount++;
      else if (simplePct > std.simpleMax) aboveCount++;
      else passCount++;
    }

    const passRate = (passCount / catResults.length * 100).toFixed(1);
    const avgSimplePct = catResults.reduce((s, lr) => {
      const pct = lr.baseline.stats.totalEmpty > 0
        ? (lr.baseline.stats.simple / lr.baseline.stats.totalEmpty * 100) : 0;
      return s + pct;
    }, 0) / catResults.length;

    let evaluation = '合理';
    if (passCount / catResults.length < 0.6) evaluation = '需调优';
    else if (belowCount > aboveCount * 2) evaluation = '偏难';
    else if (aboveCount > belowCount * 2) evaluation = '偏易';

    catEval[cat] = {
      count: catResults.length,
      avgSimplePct: +avgSimplePct.toFixed(1),
      passCount,
      passRate: +passRate,
      belowCount,
      aboveCount,
      evaluation,
    };

    console.log(
      pad(categoryLabel(cat), 10) +
      pad(avgSimplePct.toFixed(1) + '%', 12, 'right') +
      pad(`${std.simpleMin}-${std.simpleMax}%`, 16) +
      pad(passRate + '%', 10, 'right') +
      pad(belowCount, 8, 'right') +
      pad(aboveCount, 8, 'right') +
      pad(evaluation, 10)
    );
  }
  console.log();

  // 调优建议
  console.log('  5.3 参数调优建议：');
  console.log();

  const suggestions = [];

  // 基于空间聚集规则的建议
  if (spatialResult.spatialSimplePct < 5) {
    suggestions.push({
      param: 'SPATIAL_FILL_THRESHOLD',
      current: 7,
      suggestion: '降低到 6',
      reason: `空间聚集规则仅影响 ${spatialResult.spatialSimplePct}% 的 simple 格，作用较弱。降低阈值可增强空间聚集效应，让行/列/宫已填 6 个的格子也被视为 simple，更符合人类直觉。`,
      impact: `simple 占比预计 +${spatialImpact6.toFixed(2)}%`,
    });
  } else if (spatialResult.spatialSimplePct > 30) {
    suggestions.push({
      param: 'SPATIAL_FILL_THRESHOLD',
      current: 7,
      suggestion: '提高到 8',
      reason: `空间聚集规则影响 ${spatialResult.spatialSimplePct}% 的 simple 格，作用过强。提高阈值可减少误判。`,
      impact: `simple 占比预计 ${-spatialImpact8.toFixed(2)}%`,
    });
  } else {
    suggestions.push({
      param: 'SPATIAL_FILL_THRESHOLD',
      current: 7,
      suggestion: '保持不变',
      reason: `空间聚集规则影响 ${spatialResult.spatialSimplePct}% 的 simple 格，作用适度。`,
      impact: '无',
    });
  }

  // 基于笼子显著性的建议
  if (cageResult.cageSimplePct < 1) {
    suggestions.push({
      param: 'CAGE_EXTREME_SUM_LOW/HIGH',
      current: '5 / 17',
      suggestion: '扩大范围 (LOW=6, HIGH=16)',
      reason: `笼子显著性规则仅影响 ${cageResult.cageSimplePct}% 的 simple 格，作用很弱。扩大范围可让更多 2 格笼被识别为显著。`,
      impact: `simple 占比预计 +${(lowImpact6 + highImpact16).toFixed(2)}%`,
    });
  } else if (cageResult.cageSimplePct > 15) {
    suggestions.push({
      param: 'CAGE_EXTREME_SUM_LOW/HIGH',
      current: '5 / 17',
      suggestion: '收窄范围 (LOW=4, HIGH=18)',
      reason: `笼子显著性规则影响 ${cageResult.cageSimplePct}% 的 simple 格，作用较强。收窄范围可提高精准度。`,
      impact: `simple 占比预计 ${-(lowImpact4 + highImpact18).toFixed(2)}%`,
    });
  } else {
    suggestions.push({
      param: 'CAGE_EXTREME_SUM_LOW/HIGH',
      current: '5 / 17',
      suggestion: '保持不变',
      reason: `笼子显著性规则影响 ${cageResult.cageSimplePct}% 的 simple 格，作用适度。`,
      impact: '无',
    });
  }

  // 基于候选数密度的建议
  if (candidateResult.gateDegradedPct < 5) {
    suggestions.push({
      param: 'CANDIDATE_DENSITY_LIMIT',
      current: 2,
      suggestion: '提高到 3',
      reason: `仅 ${candidateResult.gateDegradedPct}% 的 gate 被降级，兜底作用较弱。提高阈值可让更多候选数少的 gate 被降级为 core，减少红色误标。`,
      impact: `gate 占比预计 ${-candImpactGate3.toFixed(2)}%`,
    });
  } else if (candidateResult.gateDegradedPct > 30) {
    suggestions.push({
      param: 'CANDIDATE_DENSITY_LIMIT',
      current: 2,
      suggestion: '降低到 1',
      reason: `${candidateResult.gateDegradedPct}% 的 gate 被降级，兜底作用过强，可能掩盖了真实的破局点。`,
      impact: `gate 占比预计 +${candImpactGate1.toFixed(2)}%`,
    });
  } else {
    suggestions.push({
      param: 'CANDIDATE_DENSITY_LIMIT',
      current: 2,
      suggestion: '保持不变',
      reason: `${candidateResult.gateDegradedPct}% 的 gate 被降级，兜底作用适度。`,
      impact: '无',
    });
  }

  const sugHeader =
    pad('参数', 32) +
    pad('当前值', 12) +
    pad('建议', 24) +
    pad('预计影响', 14, 'right');
  console.log(sugHeader);
  console.log('─'.repeat(sugHeader.length));

  for (const sug of suggestions) {
    console.log(
      pad(sug.param, 32) +
      pad(String(sug.current), 12) +
      pad(sug.suggestion, 24) +
      pad(sug.impact, 14, 'right')
    );
  }
  console.log();

  // 详细理由
  for (const sug of suggestions) {
    console.log(`    • ${sug.param}: ${sug.reason}`);
  }
  console.log();

  // 总体评估
  const overallPassRate = Object.values(catEval).reduce((s, c) => s + c.passRate, 0) / Object.keys(catEval).length;
  console.log(`  总体评估: 平均达标率 ${overallPassRate.toFixed(1)}%`);
  if (overallPassRate >= 70) {
    console.log('  结论: 当前参数设置合理，分类结果基本符合预期，无需大调。');
  } else if (overallPassRate >= 50) {
    console.log('  结论: 当前参数基本可用，但建议进行微调以提升达标率。');
  } else {
    console.log('  结论: 当前参数需要重点优化，建议按上述建议调整。');
  }

  return {
    sensitivityRanking: impacts,
    mostSensitive,
    catEval,
    suggestions,
    overallPassRate: +overallPassRate.toFixed(1),
  };
}

// ========================================================
//  主流程
// ========================================================

function main() {
  console.log('╔'.repeat(70).replace(/╔/g, '═'));
  console.log('║'.padEnd(68) + '║');
  console.log('║' + '  Killer Sudoku 参数敏感性分析'.padEnd(68) + '║');
  console.log('║'.padEnd(68) + '║');
  console.log('╚'.repeat(70).replace(/╚/g, '═'));

  // 1. 读取关卡数据
  console.log();
  console.log('[0/5] 读取关卡数据...');
  const levels = JSON.parse(fs.readFileSync(LEVELS_PATH, 'utf-8'));
  console.log(`      共 ${levels.length} 个关卡`);
  console.log();

  // 2. 计算每个关卡的基准线分类
  console.log('[准备] 计算所有关卡基准线分类...');
  const startTime = Date.now();

  const levelResults = [];
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    try {
      const baseline = classifyWithParams(level, {});
      levelResults.push({ level, baseline });
    } catch (err) {
      console.log(`      [错误] L${level.levelId}: ${err.message}`);
    }
    const pct = ((i + 1) / levels.length * 100).toFixed(0);
    process.stdout.write(`      进度: ${i + 1}/${levels.length} (${pct}%)\r`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log();
  console.log(`      完成！有效关卡: ${levelResults.length}, 耗时: ${elapsed}s`);

  // 3. 执行各项分析
  const baselineResult = analyzeBaseline(levels, levelResults);
  const spatialResult = analyzeSpatialEffect(levels, levelResults);
  const cageResult = analyzeCageSalienceEffect(levels, levelResults);
  const candidateResult = analyzeCandidateDensityEffect(levels, levelResults);
  const summaryResult = analyzeSensitivitySummary(
    baselineResult, spatialResult, cageResult, candidateResult, levelResults
  );

  // 4. 写入 JSON 报告
  console.log();
  console.log('─'.repeat(70));
  console.log('  写入分析报告...');

  const report = {
    generatedAt: new Date().toISOString(),
    totalLevels: levels.length,
    analyzedLevels: levelResults.length,
    elapsedSeconds: +elapsed,
    currentParams: baselineResult.currentParams,
    baseline: {
      catStats: baselineResult.catStats,
      overall: baselineResult.overall,
    },
    spatialEffect: {
      spatialSimpleCount: spatialResult.spatialSimpleCount,
      spatialSimplePct: spatialResult.spatialSimplePct,
      thresholdResults: Object.fromEntries(
        Object.entries(spatialResult.thresholdResults).map(([k, v]) => [
          k,
          {
            totalSimple: v.totalSimple,
            totalCore: v.totalCore,
            totalGate: v.totalGate,
            simplePct: v.simplePct,
            affectedLevels: v.perLevelChanges.filter(x => x.changeCount > 0).length,
          },
        ])
      ),
    },
    cageSalienceEffect: {
      cageSimpleCount: cageResult.cageSimpleCount,
      cageSimplePct: cageResult.cageSimplePct,
      total2CellCages: cageResult.total2CellCages,
      cageSumHistogram: cageResult.cageSumHistogram,
      salientCageHistogram: cageResult.salientCageHistogram,
      lowResults: Object.fromEntries(
        Object.entries(cageResult.lowResults).map(([k, v]) => [
          k,
          { totalSimple: v.totalSimple, simplePct: v.simplePct },
        ])
      ),
      highResults: Object.fromEntries(
        Object.entries(cageResult.highResults).map(([k, v]) => [
          k,
          { totalSimple: v.totalSimple, simplePct: v.simplePct },
        ])
      ),
    },
    candidateDensityEffect: {
      gateDegradedCount: candidateResult.gateDegradedCount,
      gateDegradedPct: candidateResult.gateDegradedPct,
      limitResults: Object.fromEntries(
        Object.entries(candidateResult.limitResults).map(([k, v]) => [
          k,
          { totalGate: v.totalGate, gatePct: v.gatePct },
        ])
      ),
    },
    sensitivitySummary: {
      sensitivityRanking: summaryResult.sensitivityRanking,
      mostSensitive: summaryResult.mostSensitive,
      catEval: summaryResult.catEval,
      suggestions: summaryResult.suggestions,
      overallPassRate: summaryResult.overallPassRate,
    },
    perLevelDetails: levelResults.map(lr => ({
      levelId: lr.level.levelId,
      title: lr.level.title,
      gridSize: lr.level.gridSize,
      difficultyLevel: lr.level.difficultyLevel,
      category: getLevelCategory(lr.level),
      baseline: {
        simple: lr.baseline.stats.simple,
        core: lr.baseline.stats.core,
        gate: lr.baseline.stats.gate,
        totalEmpty: lr.baseline.stats.totalEmpty,
        simplePct: lr.baseline.stats.totalEmpty > 0
          ? +(lr.baseline.stats.simple / lr.baseline.stats.totalEmpty * 100).toFixed(1)
          : 0,
      },
    })),
  };

  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`  报告已写入: output/param_sensitivity_report.json`);

  console.log();
  console.log('═'.repeat(70));
  console.log('  分析完成！详细数据请查看 output/param_sensitivity_report.json');
  console.log('═'.repeat(70));
}

// ========================================================
//  启动
// ========================================================

if (require.main === module) {
  main();
}

module.exports = { main, classifyWithParams, diffClassifications };
