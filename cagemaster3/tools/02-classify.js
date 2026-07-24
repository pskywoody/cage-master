#!/usr/bin/env node
/**
 * ============================================================
 *  02-classify.js - 关卡分类 & 优化方案生成
 * ============================================================
 *
 *  读取 analysis_report.json，按规则判断每个关卡是否需要优化，
 *  并为需要优化的关卡生成具体的优化方案。
 *
 *  分类规则：
 *  - 新手关 (gridSize=4 或 difficultyLevel<=1): simple < 60% → 需要优化
 *  - 中盘关 (difficultyLevel 2-3): simple < 25% 或 > 40% 或 gate < 1 或 > 5 → 需要优化
 *  - 收官关 (difficultyLevel >= 4): simple < 20% 或 > 35% 或 gate < 1 或 > 5 → 需要优化
 *
 *  优化策略：
 *  - simple 不足: 从 solution 中选取高影响力的空格作为新增预填
 *  - gate 过多: 从 gate 格所属笼子的其他空格中选择新增预填
 *  - 新增预填数量: 每次 3-8 个，迭代 2-3 轮
 */

const fs = require('fs');
const path = require('path');
const { TechRater, createBoardFromLevel, PROJECT_ROOT } = require('./_loader.js');

// ========================================================
//  路径配置
// ========================================================

const ANALYSIS_PATH = path.join(PROJECT_ROOT, 'output', 'analysis_report.json');
const LEVELS_PATH = path.join(PROJECT_ROOT, 'data', 'all_levels.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'optimization_plan.json');

// ========================================================
//  分类规则
// ========================================================

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

/**
 * 判断关卡是否需要优化
 * @returns {Object} { needsOptimization: boolean, reasons: string[], category: string }
 */
function checkNeedsOptimization(analysis) {
  const category = getLevelCategory(analysis);
  const reasons = [];

  if (analysis.status !== 'valid') {
    return {
      needsOptimization: true,
      reasons: [`关卡不可解或分析失败 (status: ${analysis.status})`],
      category,
    };
  }

  const simplePct = analysis.simplePct;
  const gate = analysis.gate;

  switch (category) {
    case 'beginner': // 新手关
      if (simplePct < 70) {
        reasons.push(`simple 占比 ${simplePct}% < 70% (新手关目标)`);
      }
      if (gate > 2) {
        reasons.push(`gate 数量 ${gate} > 2 (新手关上限)`);
      }
      break;

    case 'mid': // 中盘关
      if (simplePct < 35) {
        reasons.push(`simple 占比 ${simplePct}% < 35% (中盘关下限)`);
      }
      if (simplePct > 60) {
        reasons.push(`simple 占比 ${simplePct}% > 60% (中盘关上限)`);
      }
      if (gate < 3) {
        reasons.push(`gate 数量 ${gate} < 3 (中盘关下限)`);
      }
      if (gate > 12) {
        reasons.push(`gate 数量 ${gate} > 12 (中盘关上限)`);
      }
      break;

    case 'endgame': // 收官关
    default:
      if (simplePct < 30) {
        reasons.push(`simple 占比 ${simplePct}% < 30% (收官关下限)`);
      }
      if (simplePct > 55) {
        reasons.push(`simple 占比 ${simplePct}% > 55% (收官关上限)`);
      }
      if (gate < 5) {
        reasons.push(`gate 数量 ${gate} < 5 (收官关下限)`);
      }
      if (gate > 16) {
        reasons.push(`gate 数量 ${gate} > 16 (收官关上限)`);
      }
      break;
  }

  return {
    needsOptimization: reasons.length > 0,
    reasons,
    category,
  };
}

// ========================================================
//  优化方案生成
// ========================================================

/**
 * 为单个关卡生成优化方案
 * @param {Object} level - 原始关卡数据
 * @param {Object} analysis - 分析结果
 * @param {Object} classification - 分类结果
 * @returns {Object} 优化方案
 */
function generateOptimizationPlan(level, analysis, classification) {
  const plan = {
    levelId: level.levelId,
    title: level.title,
    category: classification.category,
    reasons: classification.reasons,
    iterations: [],
  };

  // 如果关卡不可解，尝试通过增加预填来修复
  if (analysis.status !== 'valid') {
    plan.iterations.push(generateFixPlan(level));
    return plan;
  }

  // 根据不同问题类型生成优化方案
  const hasSimpleLow = classification.reasons.some(r => r.includes('simple 占比') && r.includes('<'));
  const hasSimpleHigh = classification.reasons.some(r => r.includes('simple 占比') && r.includes('>'));
  const hasGateLow = classification.reasons.some(r => r.includes('gate 数量') && r.includes('<'));
  const hasGateHigh = classification.reasons.some(r => r.includes('gate 数量') && r.includes('>'));

  // 决定迭代轮数和每轮新增数量
  const rounds = hasSimpleLow && hasGateHigh ? 3 : 2;
  const perRound = Math.min(8, Math.max(3, Math.floor(analysis.totalEmpty * 0.08)));

  for (let i = 0; i < rounds; i++) {
    const iteration = {
      round: i + 1,
      addedCount: perRound,
      targetIssues: [],
      cellsToFill: [],
    };

    if (hasSimpleLow) iteration.targetIssues.push('simple不足');
    if (hasSimpleHigh) iteration.targetIssues.push('simple过多');
    if (hasGateLow) iteration.targetIssues.push('gate不足');
    if (hasGateHigh) iteration.targetIssues.push('gate过多');

    // 选择要预填的格子
    iteration.cellsToFill = selectCellsToFill(level, analysis, classification, perRound, i);
    plan.iterations.push(iteration);
  }

  return plan;
}

/**
 * 为不可解关卡生成修复方案
 */
function generateFixPlan(level) {
  const size = level.gridSize || 9;
  const solution = level.solution;

  // 找 5-8 个空格作为预填（均匀分布）
  const emptyCells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (level.cells[r][c] === 0) {
        emptyCells.push({ row: r, col: c, value: solution[r][c] });
      }
    }
  }

  // 均匀选择（每隔 N 个选一个）
  const targetCount = Math.min(8, Math.max(5, Math.floor(emptyCells.length * 0.1)));
  const step = Math.floor(emptyCells.length / targetCount);
  const selected = [];
  for (let i = 0; i < targetCount && i * step < emptyCells.length; i++) {
    selected.push(emptyCells[i * step]);
  }

  return {
    round: 1,
    addedCount: selected.length,
    targetIssues: ['修复不可解关卡'],
    cellsToFill: selected,
  };
}

/**
 * 选择要新增预填的格子
 * @param {Object} level - 关卡数据
 * @param {Object} analysis - 分析结果
 * @param {Object} classification - 分类结果
 * @param {number} count - 要选择的数量
 * @param {number} round - 当前轮次
 * @returns {Array} [{row, col, value, reason}]
 */
function selectCellsToFill(level, analysis, classification, count, round) {
  const size = level.gridSize || 9;
  const solution = level.solution;
  const board = createBoardFromLevel(level);
  const rater = new TechRater(board);

  // 收集所有空格及其影响力
  const cells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (level.cells[r][c] === 0) {
        const influence = rater._calcInfluence ? rater._calcInfluence(r, c) : 0.5;

        // 判断这个格子在三色分类中的类别
        let cellCategory = 'unknown';
        // 如果有 gridMeta，直接用
        if (analysis._gridMeta && analysis._gridMeta[r] && analysis._gridMeta[r][c]) {
          cellCategory = analysis._gridMeta[r][c].category;
        }

        // 计算该格所属笼子
        const cage = rater.cellCage[r * size + c];
        const cageSize = cage ? cage.cells.length : 0;

        cells.push({
          row: r,
          col: c,
          value: solution[r][c],
          influence: influence,
          category: cellCategory,
          cageSize: cageSize,
          cageId: cage ? cage.id : -1,
        });
      }
    }
  }

  const hasSimpleLow = classification.reasons.some(r => r.includes('simple 占比') && r.includes('<'));
  const hasGateHigh = classification.reasons.some(r => r.includes('gate 数量') && r.includes('>'));
  const hasGateLow = classification.reasons.some(r => r.includes('gate 数量') && r.includes('<'));
  const hasSimpleHigh = classification.reasons.some(r => r.includes('simple 占比') && r.includes('>'));

  // 根据问题类型选择策略
  let selected = [];

  if (hasSimpleLow || hasGateHigh) {
    // simple 不足 或 gate 过多: 选择高影响力的 simple/core 格
    // 优先选 gate 格（减少gate数量），其次选 core 格（增加simple比例）
    const gateCells = cells.filter(c => c.category === 'gate')
      .sort((a, b) => b.influence - a.influence);
    const coreCells = cells.filter(c => c.category === 'core')
      .sort((a, b) => b.influence - a.influence);
    const simpleCells = cells.filter(c => c.category === 'simple')
      .sort((a, b) => b.influence - a.influence);
    const unknownCells = cells.filter(c => c.category === 'unknown')
      .sort((a, b) => b.influence - a.influence);

    // 先选 gate 格（减少 gate 数量）
    let remaining = count;
    const gatePick = Math.min(Math.ceil(count * 0.5), gateCells.length);
    selected.push(...gateCells.slice(0, gatePick).map(c => ({ ...c, reason: 'gate格: 降低破局点数量' })));
    remaining -= gatePick;

    // 再选 core 格（增加 simple 比例）
    if (remaining > 0 && coreCells.length > 0) {
      const corePick = Math.min(remaining, coreCells.length);
      selected.push(...coreCells.slice(0, corePick).map(c => ({ ...c, reason: 'core格: 提升simple占比' })));
      remaining -= corePick;
    }

    // 再选 simple 格中影响力高的（进一步增加简单度）
    if (remaining > 0 && simpleCells.length > 0) {
      const simplePick = Math.min(remaining, simpleCells.length);
      selected.push(...simpleCells.slice(0, simplePick).map(c => ({ ...c, reason: 'simple格: 高影响力预填' })));
      remaining -= simplePick;
    }

    // 最后用 unknown 补齐
    if (remaining > 0 && unknownCells.length > 0) {
      selected.push(...unknownCells.slice(0, remaining).map(c => ({ ...c, reason: '补充预填' })));
    }
  } else if (hasSimpleHigh) {
    // simple 过多: 选择影响力最低的 simple 格（移除？不，我们只能增加预填）
    // 实际上 simple 过多时增加预填会让 simple 更多，所以这种情况应该选 gate 附近的格
    // 策略：选择影响力低的格子作为预填，尽量不改变整体难度结构
    const lowInfluenceCells = [...cells].sort((a, b) => a.influence - b.influence);
    selected = lowInfluenceCells.slice(0, count).map(c => ({ ...c, reason: '低影响力预填: 减少simple占比' }));
  } else if (hasGateLow) {
    // gate 不足: 这个比较难通过增加预填来增加 gate
    // 策略：选择与 gate 格同笼子的其他空格
    const gateCells = cells.filter(c => c.category === 'gate');
    const gateCageIds = new Set(gateCells.map(c => c.cageId));
    const gateCageCells = cells.filter(c => gateCageIds.has(c.cageId) && c.category !== 'gate')
      .sort((a, b) => b.influence - a.influence);

    if (gateCageCells.length > 0) {
      selected = gateCageCells.slice(0, count).map(c => ({ ...c, reason: '同笼格: 增加gate关联' }));
    } else {
      // 没有 gate 格就选高影响力的
      const highInfCells = [...cells].sort((a, b) => b.influence - a.influence);
      selected = highInfCells.slice(0, count).map(c => ({ ...c, reason: '高影响力格: 增加解题深度' }));
    }
  } else {
    // 默认：按影响力从高到低选
    const sorted = [...cells].sort((a, b) => b.influence - a.influence);
    selected = sorted.slice(0, count).map(c => ({ ...c, reason: '高影响力预填' }));
  }

  // 去重（防止重复选）
  const seen = new Set();
  const unique = [];
  for (const cell of selected) {
    const key = `${cell.row},${cell.col}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(cell);
    }
  }

  return unique;
}

// ========================================================
//  主流程
// ========================================================

function main() {
  console.log('='.repeat(70));
  console.log('  Killer Sudoku 关卡分类 & 优化方案生成');
  console.log('='.repeat(70));
  console.log();

  // 1. 读取数据
  console.log('[1/4] 读取分析报告和关卡数据...');
  const analysisReport = JSON.parse(fs.readFileSync(ANALYSIS_PATH, 'utf-8'));
  const levels = JSON.parse(fs.readFileSync(LEVELS_PATH, 'utf-8'));
  console.log(`      分析报告: ${analysisReport.levels.length} 个关卡`);
  console.log(`      关卡数据: ${levels.length} 个关卡`);
  console.log();

  // 2. 分类所有关卡
  console.log('[2/4] 分类关卡...');
  const classifications = [];
  let beginnerCount = 0, midCount = 0, endgameCount = 0;
  let needsOptCount = 0;

  for (const analysis of analysisReport.levels) {
    const cls = checkNeedsOptimization(analysis);
    classifications.push({
      levelId: analysis.levelId,
      title: analysis.title,
      gridSize: analysis.gridSize,
      difficultyLevel: analysis.difficultyLevel,
      ...cls,
    });

    if (cls.category === 'beginner') beginnerCount++;
    else if (cls.category === 'mid') midCount++;
    else endgameCount++;

    if (cls.needsOptimization) needsOptCount++;
  }

  console.log(`      新手关: ${beginnerCount}, 中盘关: ${midCount}, 收官关: ${endgameCount}`);
  console.log(`      需要优化: ${needsOptCount} / ${analysisReport.levels.length}`);
  console.log();

  // 3. 生成优化方案
  console.log('[3/4] 生成优化方案...');
  const plans = [];

  for (const analysis of analysisReport.levels) {
    const cls = classifications.find(c => c.levelId === analysis.levelId);
    if (!cls || !cls.needsOptimization) continue;

    const level = levels.find(l => l.levelId === analysis.levelId);
    if (!level) continue;

    try {
      const plan = generateOptimizationPlan(level, analysis, cls);
      plans.push(plan);
      process.stdout.write(`      生成方案: L${analysis.levelId} ${analysis.title}\r`);
    } catch (err) {
      console.log(`      [错误] L${analysis.levelId}: ${err.message}`);
    }
  }

  console.log();
  console.log(`      共生成 ${plans.length} 个优化方案`);
  console.log();

  // 4. 输出结果
  console.log('[4/4] 写入优化方案文件...');

  const output = {
    generatedAt: new Date().toISOString(),
    totalLevels: analysisReport.levels.length,
    needsOptimization: needsOptCount,
    categories: {
      beginner: beginnerCount,
      mid: midCount,
      endgame: endgameCount,
    },
    classifications: classifications.map(c => ({
      levelId: c.levelId,
      title: c.title,
      category: c.category,
      needsOptimization: c.needsOptimization,
      reasons: c.reasons,
    })),
    plans: plans,
  };

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`      方案已写入: output/optimization_plan.json`);
  console.log();

  // 打印需要优化的关卡列表
  if (plans.length > 0) {
    console.log('需要优化的关卡:');
    console.log();
    console.log(
      pad('ID', 6) +
      pad('标题', 14) +
      pad('类别', 10) +
      pad('simple%', 10) +
      pad('gate', 6) +
      '原因'
    );
    console.log('-'.repeat(70));

    for (const plan of plans) {
      const analysis = analysisReport.levels.find(a => a.levelId === plan.levelId);
      const reasonStr = plan.reasons.slice(0, 2).join('; ');
      console.log(
        pad(plan.levelId, 6) +
        pad(plan.title || '', 14) +
        pad(categoryLabel(plan.category), 10) +
        pad((analysis?.simplePct ?? 0) + '%', 10) +
        pad((analysis?.gate ?? 0), 6) +
        reasonStr
      );
    }
  } else {
    console.log('所有关卡均符合标准，无需优化。');
  }

  console.log();
  console.log('='.repeat(70));
  console.log('  分类完成！详细方案请查看 output/optimization_plan.json');
  console.log('='.repeat(70));
}

function pad(str, len, align = 'left') {
  str = String(str);
  if (str.length >= len) return str.slice(0, len);
  const p = ' '.repeat(len - str.length);
  return align === 'right' ? p + str : str + p;
}

function categoryLabel(cat) {
  const map = { beginner: '新手关', mid: '中盘关', endgame: '收官关' };
  return map[cat] || cat;
}

// ========================================================
//  启动
// ========================================================

if (require.main === module) {
  main();
}

module.exports = { main, checkNeedsOptimization, getLevelCategory };
