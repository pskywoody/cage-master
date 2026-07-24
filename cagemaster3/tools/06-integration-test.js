#!/usr/bin/env node
/**
 * ============================================================
 *  06-integration-test.js - 三色节奏系统集成测试
 * ============================================================
 *
 *  在 Node.js 环境下模拟浏览器端的核心流程，
 *  对 49 个关卡进行自动化集成测试，验证：
 *    1. 三色分类完整性
 *    2. rhythmTimeline 数据完整性
 *    3. WinCondition 通关条件计算
 *    4. 雪崩动画序列验证
 *    5. 边界与异常情况
 *
 *  输出：
 *    - 控制台输出测试进度和汇总
 *    - output/integration_test_report.json 详细报告
 */

const fs = require('fs');
const path = require('path');
const {
  TechRater,
  TechRaterAdapter,
  createBoardFromLevel,
  PROJECT_ROOT,
} = require('./_loader.js');

// ========================================================
//  路径配置
// ========================================================

const LEVELS_PATH = path.join(PROJECT_ROOT, 'data', 'all_levels.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'integration_test_report.json');

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

/**
 * 从关卡数据获取 solution
 */
function getSolution(level) {
  return level.solution || null;
}

// ========================================================
//  WinCondition 模拟实现（复刻 guide.js 中的 WinConditionManager 核心逻辑）
// ========================================================

const LEVEL_TYPES = {
  NOVICE: 'novice',
  MIDGAME: 'midgame',
  ENDGAME: 'endgame',
  BOSS: 'boss',
};

const WEIGHTS = {
  simple: 1,
  core: 1.5,
  gate: 2,
};

/**
 * 判断关卡类型（复刻 WinConditionManager.getLevelType 的单人模式逻辑）
 */
function getLevelType(levelData, isBossLevel = false) {
  if (!levelData) return LEVEL_TYPES.MIDGAME;

  // 自定义 winCondition 类型
  if (levelData.winCondition && levelData.winCondition.type) {
    const customType = levelData.winCondition.type;
    if (Object.values(LEVEL_TYPES).includes(customType)) {
      return customType;
    }
  }

  // Boss 关
  if (isBossLevel) {
    return LEVEL_TYPES.BOSS;
  }

  const levelId = parseInt(levelData.levelId) || 0;
  const gridSize = levelData.gridSize || 9;
  const difficultyLevel = levelData.difficultyLevel || _inferDifficultyLevel(levelData);

  // 新手关
  if (gridSize <= 4 ||
      (levelId >= 101 && levelId <= 109) ||
      difficultyLevel <= 1) {
    return LEVEL_TYPES.NOVICE;
  }

  // 收官关
  if ((levelId >= 501 && levelId <= 706) ||
      difficultyLevel >= 4) {
    return LEVEL_TYPES.ENDGAME;
  }

  // 中盘关（默认）
  return LEVEL_TYPES.MIDGAME;
}

function _inferDifficultyLevel(levelData) {
  const diffStr = levelData.difficulty || '';
  const diffMap = {
    '入门': 1,
    '简单': 1,
    '初级': 2,
    '中等': 3,
    '中等偏难': 4,
    '困难': 5,
    '极难': 5,
    '终极': 5,
  };
  return diffMap[diffStr] || 3;
}

/**
 * 统计各类格子的已填数（基于 filledSet: Set<"r,c">）
 */
function countByCategoryFromSet(gridMeta, filledCorrectSet) {
  const stats = {
    simple: { total: 0, filled: 0 },
    gate: { total: 0, filled: 0 },
    core: { total: 0, filled: 0 },
    total: { total: 0, filled: 0 },
  };

  const size = gridMeta.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const meta = gridMeta[r][c];
      if (!meta) continue;
      const category = meta.category;
      if (category === 'filled' || category === 'unknown') continue;

      stats.total.total++;
      if (stats[category]) stats[category].total++;

      const key = `${r},${c}`;
      if (filledCorrectSet.has(key)) {
        stats.total.filled++;
        if (stats[category]) stats[category].filled++;
      }
    }
  }

  return stats;
}

/**
 * 计算加权进度（simple×1, core×1.5, gate×2）
 */
function calcWeightedProgress(gridMeta, filledCorrectSet) {
  const size = gridMeta.length;
  let totalWeight = 0;
  let filledWeight = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const meta = gridMeta[r][c];
      if (!meta) continue;
      const cat = meta.category;
      if (cat === 'filled' || cat === 'unknown') continue;

      const weight = WEIGHTS[cat] || 1;
      totalWeight += weight;

      const key = `${r},${c}`;
      if (filledCorrectSet.has(key)) {
        filledWeight += weight;
      }
    }
  }

  return {
    totalWeight,
    filledWeight,
    percent: totalWeight > 0 ? (filledWeight / totalWeight) * 100 : 0,
  };
}

/**
 * 检查通关条件（复刻 WinConditionManager.checkWinCondition）
 */
function checkWinCondition(levelData, gridMeta, filledCorrectSet, filledWrongCount = 0, isBossLevel = false) {
  if (!levelData || !gridMeta) return false;

  const levelType = getLevelType(levelData, isBossLevel);

  // Boss 关：不由这里处理
  if (levelType === LEVEL_TYPES.BOSS) return false;

  const stats = countByCategoryFromSet(gridMeta, filledCorrectSet);

  // 有错误填入时不能通关
  if (filledWrongCount > 0) return false;

  switch (levelType) {
    case LEVEL_TYPES.NOVICE:
      // 新手关：填完所有 simple 格
      return stats.simple.total > 0 && stats.simple.filled >= stats.simple.total;

    case LEVEL_TYPES.MIDGAME:
      // 中盘关：填完所有 simple + 至少 1 个 gate
      if (stats.simple.total > 0 && stats.simple.filled < stats.simple.total) {
        return false;
      }
      if (stats.gate.total === 0) {
        return stats.simple.total > 0 && stats.simple.filled >= stats.simple.total;
      }
      return stats.gate.filled >= 1;

    case LEVEL_TYPES.ENDGAME:
      // 收官关：填完所有 simple + 所有 gate
      if (stats.simple.total > 0 && stats.simple.filled < stats.simple.total) {
        return false;
      }
      return stats.gate.filled >= stats.gate.total;

    default:
      return false;
  }
}

// ========================================================
//  测试框架
// ========================================================

class TestRunner {
  constructor() {
    this.results = [];      // 每关测试结果
    this.summary = {
      totalLevels: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      byTest: {},           // 按测试项统计
    };
    this.currentLevel = null;
    this.currentResult = null;
  }

  startLevel(levelId, title, gridSize) {
    this.currentLevel = { levelId, title, gridSize };
    this.currentResult = {
      levelId,
      title,
      gridSize,
      tests: {},
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };
  }

  /**
   * 执行一个测试断言
   */
  assert(testName, condition, expected, actual, detail = '') {
    const testResult = {
      name: testName,
      passed: !!condition,
      expected: expected,
      actual: actual,
      detail: detail,
    };

    this.currentResult.tests[testName] = testResult;

    if (condition) {
      this.currentResult.passed++;
    } else {
      this.currentResult.failed++;
      this.currentResult.errors.push({
        test: testName,
        expected,
        actual,
        detail,
      });
    }

    // 按测试项汇总
    if (!this.summary.byTest[testName]) {
      this.summary.byTest[testName] = { passed: 0, failed: 0, skipped: 0 };
    }
    if (condition) {
      this.summary.byTest[testName].passed++;
    } else {
      this.summary.byTest[testName].failed++;
    }
  }

  skip(testName, reason = '') {
    this.currentResult.tests[testName] = {
      name: testName,
      skipped: true,
      reason,
    };
    this.currentResult.skipped++;

    if (!this.summary.byTest[testName]) {
      this.summary.byTest[testName] = { passed: 0, failed: 0, skipped: 0 };
    }
    this.summary.byTest[testName].skipped++;
  }

  endLevel() {
    this.results.push(this.currentResult);
    this.summary.totalLevels++;

    if (this.currentResult.failed === 0) {
      // 0 失败即为通过（允许有跳过项，因边界测试仅适用于特定关卡）
      this.summary.passed++;
    } else {
      this.summary.failed++;
    }

    if (this.currentResult.skipped > 0) {
      this.summary.skipped++;
    }

    this.currentLevel = null;
    this.currentResult = null;
  }
}

// ========================================================
//  测试用例
// ========================================================

/**
 * 测试 1：三色分类完整性
 */
function testThreeColorClassification(runner, level, heatmap, board) {
  const size = level.gridSize || 9;
  const gridMeta = heatmap.gridMeta;
  const stats = heatmap.stats;

  // 1.1 验证 status
  runner.assert(
    '1.1 status 有效',
    heatmap.status === 'valid' || heatmap.status === 'invalid',
    'valid 或 invalid',
    heatmap.status,
  );

  // 1.2 验证 gridMeta 尺寸
  runner.assert(
    '1.2 gridMeta 尺寸正确',
    Array.isArray(gridMeta) && gridMeta.length === size &&
    gridMeta.every(row => Array.isArray(row) && row.length === size),
    `${size}x${size} 二维数组`,
    gridMeta ? `${gridMeta.length}x${gridMeta[0]?.length || 0}` : 'null',
  );

  if (!gridMeta || gridMeta.length !== size) {
    runner.skip('1.3 空格分类合法 (simple/core/gate)', 'gridMeta 尺寸错误');
    runner.skip('1.4 已填格分类为 filled', 'gridMeta 尺寸错误');
    runner.skip('1.5 stats 统计与 gridMeta 一致', 'gridMeta 尺寸错误');
    runner.skip('1.6 颜色值与分类对应正确', 'gridMeta 尺寸错误');
    return;
  }

  // 1.3 验证每个空格的 category 是 simple/core/gate 之一
  let allEmptyValid = true;
  let emptyCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const meta = gridMeta[r][c];
      const cell = board.cells[r][c];
      const isFilled = cell.fixedNum !== 0 || cell.fillNum !== 0;
      if (!isFilled) {
        emptyCount++;
        if (!['simple', 'core', 'gate', 'unknown'].includes(meta.category)) {
          allEmptyValid = false;
        }
      }
    }
  }
  runner.assert(
    '1.3 空格分类合法 (simple/core/gate)',
    allEmptyValid,
    '所有空格分类为 simple/core/gate',
    allEmptyValid ? '通过' : '存在非法分类',
    `空格数: ${emptyCount}`,
  );

  // 1.4 验证每个已填格的 category 是 'filled'
  let allFilledValid = true;
  let filledCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const meta = gridMeta[r][c];
      const cell = board.cells[r][c];
      const isFilled = cell.fixedNum !== 0 || cell.fillNum !== 0;
      if (isFilled) {
        filledCount++;
        if (meta.category !== 'filled') {
          allFilledValid = false;
        }
      }
    }
  }
  runner.assert(
    '1.4 已填格分类为 filled',
    allFilledValid,
    '所有已填格分类为 filled',
    allFilledValid ? '通过' : '存在已填格分类错误',
    `已填格数: ${filledCount}`,
  );

  // 1.5 验证 stats 统计与 gridMeta 实际计数一致
  let actualSimple = 0, actualCore = 0, actualGate = 0, actualTotalEmpty = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const meta = gridMeta[r][c];
      if (meta.category === 'filled' || meta.category === 'unknown') continue;
      actualTotalEmpty++;
      if (meta.category === 'simple') actualSimple++;
      else if (meta.category === 'core') actualCore++;
      else if (meta.category === 'gate') actualGate++;
    }
  }
  const statsMatch =
    stats.simple === actualSimple &&
    stats.core === actualCore &&
    stats.gate === actualGate &&
    stats.totalEmpty === actualTotalEmpty;
  runner.assert(
    '1.5 stats 统计与 gridMeta 一致',
    statsMatch,
    `simple=${actualSimple}, core=${actualCore}, gate=${actualGate}, totalEmpty=${actualTotalEmpty}`,
    `simple=${stats.simple}, core=${stats.core}, gate=${stats.gate}, totalEmpty=${stats.totalEmpty}`,
  );

  // 1.6 验证颜色值与分类对应正确
  const COLORS = TechRaterAdapter.CONFIG.COLORS;
  let colorMatch = true;
  let firstMismatch = null;
  for (let r = 0; r < size && colorMatch; r++) {
    for (let c = 0; c < size && colorMatch; c++) {
      const meta = gridMeta[r][c];
      const expectedColor = COLORS[meta.category] || COLORS.unknown;
      if (meta.color !== expectedColor) {
        colorMatch = false;
        firstMismatch = `(${r},${c}) category=${meta.category}, expected=${expectedColor}, actual=${meta.color}`;
      }
    }
  }
  runner.assert(
    '1.6 颜色值与分类对应正确',
    colorMatch,
    '每个格子的 color 与其 category 对应',
    colorMatch ? '通过' : firstMismatch,
  );
}

/**
 * 测试 2：rhythmTimeline 数据完整性
 */
function testRhythmTimeline(runner, level, heatmap, adapter) {
  const gridMeta = heatmap.gridMeta;
  const timeline = heatmap.rhythmTimeline;
  const size = level.gridSize || 9;

  // 2.1 验证 rhythmTimeline 不为 null（valid 的关卡必须有）
  if (heatmap.status === 'valid') {
    runner.assert(
      '2.1 rhythmTimeline 存在 (valid 关卡)',
      timeline !== null && timeline !== undefined,
      '非 null',
      timeline === null ? 'null' : '存在',
    );
  } else {
    runner.skip('2.1 rhythmTimeline 存在 (valid 关卡)', '关卡无效，跳过');
  }

  if (!timeline) {
    runner.skip('2.2 totalSteps 等于总空格数', 'timeline 不存在');
    runner.skip('2.3 三阶段格子数之和 = totalEmpty', 'timeline 不存在');
    runner.skip('2.4 三阶段格子无重叠', 'timeline 不存在');
    runner.skip('2.5 opening 格子都是 simple', 'timeline 不存在');
    runner.skip('2.6 breakthrough 格子都是 gate', 'timeline 不存在');
    runner.skip('2.7 avalanche 格子都是 core', 'timeline 不存在');
    runner.skip('2.8 dominoSequence 顺序与求解链一致', 'timeline 不存在');
    runner.skip('2.9 各 phase count 与数组长度一致', 'timeline 不存在');
    return;
  }

  const { opening, breakthrough, avalanche } = timeline.phases;
  const simpleKeys = opening.cellKeys || [];
  const gateKeys = breakthrough.gateCells || [];
  const dominoKeys = avalanche.dominoSequence || [];

  // 计算 gridMeta 中的实际分类数量
  let actualSimple = 0, actualGate = 0, actualCore = 0, actualTotalEmpty = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const meta = gridMeta[r][c];
      if (meta.category === 'filled' || meta.category === 'unknown') continue;
      actualTotalEmpty++;
      if (meta.category === 'simple') actualSimple++;
      else if (meta.category === 'gate') actualGate++;
      else if (meta.category === 'core') actualCore++;
    }
  }

  // 2.2 验证 totalSteps 等于总空格数
  runner.assert(
    '2.2 totalSteps 等于总空格数',
    timeline.totalSteps === actualTotalEmpty,
    actualTotalEmpty,
    timeline.totalSteps,
  );

  // 2.3 验证三个阶段的格子数之和 = totalEmpty
  const phaseSum = simpleKeys.length + gateKeys.length + dominoKeys.length;
  runner.assert(
    '2.3 三阶段格子数之和 = totalEmpty',
    phaseSum === actualTotalEmpty,
    actualTotalEmpty,
    phaseSum,
    `simple=${simpleKeys.length} + gate=${gateKeys.length} + core=${dominoKeys.length}`,
  );

  // 2.4 验证三个阶段没有重叠
  const allKeys = new Set();
  let hasOverlap = false;
  let overlapKey = null;
  for (const key of simpleKeys) {
    if (allKeys.has(key)) { hasOverlap = true; overlapKey = key; break; }
    allKeys.add(key);
  }
  if (!hasOverlap) {
    for (const key of gateKeys) {
      if (allKeys.has(key)) { hasOverlap = true; overlapKey = key; break; }
      allKeys.add(key);
    }
  }
  if (!hasOverlap) {
    for (const key of dominoKeys) {
      if (allKeys.has(key)) { hasOverlap = true; overlapKey = key; break; }
      allKeys.add(key);
    }
  }
  runner.assert(
    '2.4 三阶段格子无重叠',
    !hasOverlap,
    '无重叠',
    hasOverlap ? `重叠格子: ${overlapKey}` : '无重叠',
  );

  // 2.5 验证 opening.cellKeys 中的格子分类都是 simple
  let allSimple = true;
  let firstNonSimple = null;
  for (const key of simpleKeys) {
    const [r, c] = key.split(',').map(Number);
    if (gridMeta[r]?.[c]?.category !== 'simple') {
      allSimple = false;
      firstNonSimple = `${key}: ${gridMeta[r]?.[c]?.category}`;
      break;
    }
  }
  runner.assert(
    '2.5 opening 格子都是 simple',
    allSimple,
    '全部为 simple',
    allSimple ? '通过' : firstNonSimple,
    `共 ${simpleKeys.length} 个`,
  );

  // 2.6 验证 breakthrough.gateCells 中的格子分类都是 gate
  let allGate = true;
  let firstNonGate = null;
  for (const key of gateKeys) {
    const [r, c] = key.split(',').map(Number);
    if (gridMeta[r]?.[c]?.category !== 'gate') {
      allGate = false;
      firstNonGate = `${key}: ${gridMeta[r]?.[c]?.category}`;
      break;
    }
  }
  runner.assert(
    '2.6 breakthrough 格子都是 gate',
    allGate,
    '全部为 gate',
    allGate ? '通过' : firstNonGate,
    `共 ${gateKeys.length} 个`,
  );

  // 2.7 验证 avalanche.dominoSequence 中的格子分类都是 core
  let allCore = true;
  let firstNonCore = null;
  for (const key of dominoKeys) {
    const [r, c] = key.split(',').map(Number);
    if (gridMeta[r]?.[c]?.category !== 'core') {
      allCore = false;
      firstNonCore = `${key}: ${gridMeta[r]?.[c]?.category}`;
      break;
    }
  }
  runner.assert(
    '2.7 avalanche 格子都是 core',
    allCore,
    '全部为 core',
    allCore ? '通过' : firstNonCore,
    `共 ${dominoKeys.length} 个`,
  );

  // 2.8 验证 dominoSequence 顺序严格递增（按求解链顺序，没有回退）
  // 即 dominoSequence 中的格子在 solveResult.steps 中首次出现的顺序
  // 应该与 dominoSequence 数组顺序一致
  const solveResult = adapter ? adapter.solveResult : null;

  if (solveResult && solveResult.steps) {
    // 构建每个格子在 fill steps 中首次出现的索引
    const firstFillIndex = new Map();
    let fillIdx = 0;
    for (const step of solveResult.steps) {
      if (step.type === 'fill') {
        const key = `${step.row},${step.col}`;
        if (!firstFillIndex.has(key)) {
          firstFillIndex.set(key, fillIdx);
        }
        fillIdx++;
      }
    }

    // 检查 dominoSequence 顺序是否与求解顺序一致
    let strictlyIncreasing = true;
    let firstViolation = null;
    let prevIdx = -1;
    for (let i = 0; i < dominoKeys.length; i++) {
      const key = dominoKeys[i];
      const idx = firstFillIndex.has(key) ? firstFillIndex.get(key) : 99999;
      if (idx < prevIdx) {
        strictlyIncreasing = false;
        firstViolation = `位置 ${i}: ${key} (idx=${idx}) 前一个 idx=${prevIdx}`;
        break;
      }
      prevIdx = idx;
    }
    runner.assert(
      '2.8 dominoSequence 顺序与求解链一致',
      strictlyIncreasing,
      '严格按求解顺序递增',
      strictlyIncreasing ? '通过' : firstViolation,
    );
  } else {
    runner.skip('2.8 dominoSequence 顺序与求解链一致', '求解结果不可用');
  }

  // 2.9 验证每个 phase 的 count 字段与实际数组长度一致
  const countMatch =
    opening.count === simpleKeys.length &&
    breakthrough.count === gateKeys.length &&
    avalanche.count === dominoKeys.length;
  runner.assert(
    '2.9 各 phase count 与数组长度一致',
    countMatch,
    `opening=${simpleKeys.length}, breakthrough=${gateKeys.length}, avalanche=${dominoKeys.length}`,
    `opening=${opening.count}, breakthrough=${breakthrough.count}, avalanche=${avalanche.count}`,
  );
}

/**
 * 测试 3：WinCondition 通关条件计算
 */
function testWinCondition(runner, level, heatmap, adapter) {
  const gridMeta = heatmap.gridMeta;
  const timeline = heatmap.rhythmTimeline;
  const solution = level.solution;
  const size = level.gridSize || 9;

  if (heatmap.status !== 'valid' || !timeline || !solution) {
    runner.skip('3.1 路径A: core格逐个填入 加权进度单调递增', '关卡无效或缺少数据');
    runner.skip('3.2 路径B: 填完所有simple 新手关判定正确', '关卡无效或缺少数据');
    runner.skip('3.3 路径C: 填完simple+gate 通关判定正确', '关卡无效或缺少数据');
    runner.skip('3.4 calcWeightedProgress 加权计算正确', '关卡无效或缺少数据');
    runner.skip('3.5 单人模式分层条件判断正确', '关卡无效或缺少数据');
    return;
  }

  const { opening, breakthrough, avalanche } = timeline.phases;
  const simpleKeys = opening.cellKeys || [];
  const gateKeys = breakthrough.gateCells || [];
  const dominoKeys = avalanche.dominoSequence || [];
  const levelType = getLevelType(level);

  // 3.1 路径 A：按 dominoSequence 顺序逐个填入，验证进度逐步增加
  // 这里验证的是：随着 core 格逐个填入，加权进度单调递增
  const filledSet = new Set();
  // 先填所有 simple 和 gate
  for (const key of simpleKeys) filledSet.add(key);
  for (const key of gateKeys) filledSet.add(key);

  let prevProgress = -1;
  let monotonicallyIncreasing = true;
  let firstDecrease = null;

  for (let i = 0; i < dominoKeys.length; i++) {
    const key = dominoKeys[i];
    filledSet.add(key);
    const wp = calcWeightedProgress(gridMeta, filledSet);
    if (wp.percent < prevProgress - 0.001) {
      monotonicallyIncreasing = false;
      firstDecrease = `第 ${i} 步 (${key}): ${prevProgress.toFixed(2)}% -> ${wp.percent.toFixed(2)}%`;
      break;
    }
    prevProgress = wp.percent;
  }
  runner.assert(
    '3.1 路径A: core格逐个填入 加权进度单调递增',
    monotonicallyIncreasing,
    '单调递增',
    monotonicallyIncreasing ? '通过' : firstDecrease,
    `core 格数量: ${dominoKeys.length}`,
  );

  // 3.2 路径 B：先填完所有 simple，验证是否触发新手关通关
  const simpleFilledSet = new Set(simpleKeys);
  const noviceWin = checkWinCondition(level, gridMeta, simpleFilledSet, 0, false);
  const expectedNoviceWin = (levelType === LEVEL_TYPES.NOVICE) && simpleKeys.length > 0;

  runner.assert(
    '3.2 路径B: 填完所有simple 新手关判定正确',
    noviceWin === expectedNoviceWin,
    `关卡类型=${levelType}, 预期=${expectedNoviceWin}`,
    `实际通关=${noviceWin}`,
    `simple 数量: ${simpleKeys.length}`,
  );

  // 3.3 路径 C：填完 simple + 所有 gate，验证通关判定正确
  // 收官关：填完所有 simple + 所有 gate → 通关
  // 中盘关：填完所有 simple + 所有 gate → 也通关（超过中盘关条件）
  // 新手关：填完所有 simple → 已满足新手关条件
  const simpleGateFilledSet = new Set([...simpleKeys, ...gateKeys]);
  const pathCWin = checkWinCondition(level, gridMeta, simpleGateFilledSet, 0, false);

  // 根据关卡类型计算预期值
  let expectedPathCWin;
  if (levelType === LEVEL_TYPES.BOSS) {
    expectedPathCWin = false; // Boss 关不由这里处理
  } else if (levelType === LEVEL_TYPES.ENDGAME) {
    // 收官关：填完所有 simple + 所有 gate → 通关
    expectedPathCWin = (simpleKeys.length > 0 || gateKeys.length > 0);
  } else if (levelType === LEVEL_TYPES.MIDGAME) {
    // 中盘关：填完所有 simple + 至少 1 个 gate → 通关（已远超条件）
    if (simpleKeys.length > 0) {
      expectedPathCWin = true; // 所有 simple 已填 + 所有 gate 已填 → 远超中盘关条件
    } else {
      expectedPathCWin = gateKeys.length >= 1;
    }
  } else {
    // 新手关：填完所有 simple → 通关
    expectedPathCWin = simpleKeys.length > 0;
  }

  runner.assert(
    '3.3 路径C: 填完simple+gate 通关判定正确',
    pathCWin === expectedPathCWin,
    `关卡类型=${levelType}, 预期=${expectedPathCWin}`,
    `实际通关=${pathCWin}`,
    `simple=${simpleKeys.length}, gate=${gateKeys.length}`,
  );

  // 3.4 验证 calcWeightedProgress 加权计算正确（simple×1, core×1.5, gate×2）
  const allFilledSet = new Set([...simpleKeys, ...gateKeys, ...dominoKeys]);
  const fullProgress = calcWeightedProgress(gridMeta, allFilledSet);

  // 手动计算预期值
  let expectedTotalWeight = 0;
  let expectedFilledWeight = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const meta = gridMeta[r][c];
      const cat = meta.category;
      if (cat === 'filled' || cat === 'unknown') continue;
      const weight = WEIGHTS[cat] || 1;
      expectedTotalWeight += weight;
      const key = `${r},${c}`;
      if (allFilledSet.has(key)) {
        expectedFilledWeight += weight;
      }
    }
  }
  const expectedPercent = expectedTotalWeight > 0 ? (expectedFilledWeight / expectedTotalWeight) * 100 : 0;

  const weightMatch =
    Math.abs(fullProgress.totalWeight - expectedTotalWeight) < 0.001 &&
    Math.abs(fullProgress.filledWeight - expectedFilledWeight) < 0.001 &&
    Math.abs(fullProgress.percent - expectedPercent) < 0.01;

  runner.assert(
    '3.4 calcWeightedProgress 加权计算正确',
    weightMatch,
    `totalWeight=${expectedTotalWeight}, filledWeight=${expectedFilledWeight}, percent=${expectedPercent.toFixed(2)}%`,
    `totalWeight=${fullProgress.totalWeight}, filledWeight=${fullProgress.filledWeight}, percent=${fullProgress.percent.toFixed(2)}%`,
    '权重: simple×1, core×1.5, gate×2',
  );

  // 3.5 验证单人模式分层条件判断正确
  // 构造各种填入场景验证
  let layerLogicCorrect = true;
  let layerError = null;

  // 场景1：什么都不填，不应通关
  const emptySet = new Set();
  if (checkWinCondition(level, gridMeta, emptySet, 0, false)) {
    layerLogicCorrect = false;
    layerError = '空填入时不应通关';
  }

  // 场景2：有错误填入时，即使填完所有格子也不应通关
  if (layerLogicCorrect && levelType !== LEVEL_TYPES.BOSS) {
    const allCorrectSet = new Set([...simpleKeys, ...gateKeys, ...dominoKeys]);
    if (checkWinCondition(level, gridMeta, allCorrectSet, 1, false)) {
      layerLogicCorrect = false;
      layerError = '有错误填入时不应通关';
    }
  }

  // 场景3：新手关验证 - 填完 simple 应通关，不填 simple 不应通关
  if (layerLogicCorrect && levelType === LEVEL_TYPES.NOVICE && simpleKeys.length > 0) {
    // 填完所有 simple
    const allSimpleSet = new Set(simpleKeys);
    if (!checkWinCondition(level, gridMeta, allSimpleSet, 0, false)) {
      layerLogicCorrect = false;
      layerError = '新手关填完所有 simple 应通关';
    }
  }

  // 场景4：收官关验证 - 填完 simple+gate 应通关
  if (layerLogicCorrect && levelType === LEVEL_TYPES.ENDGAME && gateKeys.length > 0) {
    const sgSet = new Set([...simpleKeys, ...gateKeys]);
    if (!checkWinCondition(level, gridMeta, sgSet, 0, false)) {
      layerLogicCorrect = false;
      layerError = '收官关填完 simple+gate 应通关';
    }

    // 只填 simple 不填 gate 不应通关
    if (simpleKeys.length > 0) {
      const onlySimpleSet = new Set(simpleKeys);
      if (checkWinCondition(level, gridMeta, onlySimpleSet, 0, false)) {
        layerLogicCorrect = false;
        layerError = '收官关只填 simple 不应通关';
      }
    }
  }

  runner.assert(
    '3.5 单人模式分层条件判断正确',
    layerLogicCorrect,
    '所有场景判定正确',
    layerLogicCorrect ? '通过' : layerError,
    `关卡类型: ${levelType}`,
  );
}

/**
 * 测试 4：雪崩动画序列验证
 */
function testAvalancheSequence(runner, level, heatmap, adapter) {
  const gridMeta = heatmap.gridMeta;
  const timeline = heatmap.rhythmTimeline;
  const size = level.gridSize || 9;

  if (heatmap.status !== 'valid' || !timeline) {
    runner.skip('4.1 dominoSequence 格子都是 core', '关卡无效');
    runner.skip('4.2 dominoSequence 长度 = core 格数量', '关卡无效');
    runner.skip('4.3 顺序与求解链一致', '关卡无效');
    runner.skip('4.4 dominoSequence 无重复格子', '关卡无效');
    return;
  }

  const dominoKeys = timeline.phases.avalanche.dominoSequence || [];

  // 4.1 验证 dominoSequence 中的格子都是 core 格
  let allCore = true;
  let firstNonCore = null;
  for (const key of dominoKeys) {
    const [r, c] = key.split(',').map(Number);
    if (gridMeta[r]?.[c]?.category !== 'core') {
      allCore = false;
      firstNonCore = `${key}: ${gridMeta[r]?.[c]?.category}`;
      break;
    }
  }
  runner.assert(
    '4.1 dominoSequence 格子都是 core',
    allCore,
    '全部为 core 格',
    allCore ? '通过' : firstNonCore,
  );

  // 4.2 验证 dominoSequence 长度 = core 格数量
  let coreCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (gridMeta[r][c].category === 'core') coreCount++;
    }
  }
  runner.assert(
    '4.2 dominoSequence 长度 = core 格数量',
    dominoKeys.length === coreCount,
    coreCount,
    dominoKeys.length,
  );

  // 4.3 验证顺序一致性：dominoSequence 中的格子在 solveResult.steps 中
  //     的出现顺序与数组顺序一致
  if (adapter.solveResult && adapter.solveResult.steps) {
    const steps = adapter.solveResult.steps;
    const firstFillIndex = new Map();
    let fillIdx = 0;
    for (const step of steps) {
      if (step.type === 'fill') {
        const key = `${step.row},${step.col}`;
        if (!firstFillIndex.has(key)) {
          firstFillIndex.set(key, fillIdx);
        }
        fillIdx++;
      }
    }

    let orderConsistent = true;
    let firstInconsistent = null;
    let prevIdx = -1;
    for (let i = 0; i < dominoKeys.length; i++) {
      const key = dominoKeys[i];
      const idx = firstFillIndex.has(key) ? firstFillIndex.get(key) : 99999;
      if (idx < prevIdx) {
        orderConsistent = false;
        firstInconsistent = `第${i}个 ${key} (idx=${idx}) 小于前一个 idx=${prevIdx}`;
        break;
      }
      prevIdx = idx;
    }
    runner.assert(
      '4.3 顺序与求解链一致',
      orderConsistent,
      '按求解顺序排列',
      orderConsistent ? '通过' : firstInconsistent,
    );
  } else {
    runner.skip('4.3 顺序与求解链一致', '求解结果不可用');
  }

  // 4.4 验证没有重复格子
  const seen = new Set();
  let hasDuplicate = false;
  let dupKey = null;
  for (const key of dominoKeys) {
    if (seen.has(key)) {
      hasDuplicate = true;
      dupKey = key;
      break;
    }
    seen.add(key);
  }
  runner.assert(
    '4.4 dominoSequence 无重复格子',
    !hasDuplicate,
    '无重复',
    hasDuplicate ? `重复: ${dupKey}` : '无重复',
    `共 ${dominoKeys.length} 个`,
  );
}

/**
 * 测试 5：边界与异常情况
 */
function testEdgeCases(runner, level, heatmap, board) {
  const size = level.gridSize || 9;
  const levelId = parseInt(level.levelId) || 0;
  const gridMeta = heatmap.gridMeta;
  const stats = heatmap.stats;

  // 5.1 4x4 关卡尺寸验证
  if (size === 4) {
    runner.assert(
      '5.1 4x4 关卡尺寸正确',
      gridMeta && gridMeta.length === 4 && gridMeta[0].length === 4,
      '4x4 gridMeta',
      gridMeta ? `${gridMeta.length}x${gridMeta[0]?.length || 0}` : 'null',
    );
  } else if (size === 9) {
    runner.assert(
      '5.1 9x9 关卡尺寸正确',
      gridMeta && gridMeta.length === 9 && gridMeta[0].length === 9,
      '9x9 gridMeta',
      gridMeta ? `${gridMeta.length}x${gridMeta[0]?.length || 0}` : 'null',
    );
  } else {
    runner.assert(
      `5.1 ${size}x${size} 关卡尺寸正确`,
      gridMeta && gridMeta.length === size && gridMeta[0].length === size,
      `${size}x${size} gridMeta`,
      gridMeta ? `${gridMeta.length}x${gridMeta[0]?.length || 0}` : 'null',
    );
  }

  // 5.2 invalid 关卡 graceful degradation
  if (heatmap.status === 'invalid') {
    // 无效关卡应该有 gridMeta，但所有空格分类为 unknown
    let hasValidGridMeta = gridMeta && gridMeta.length === size;
    runner.assert(
      '5.2 invalid 关卡有 gridMeta (graceful degradation)',
      hasValidGridMeta,
      `${size}x${size} gridMeta`,
      hasValidGridMeta ? '存在' : '不存在',
    );

    // stats 应该全为 0
    const statsAllZero = stats.simple === 0 && stats.core === 0 && stats.gate === 0 && stats.totalEmpty === 0;
    runner.assert(
      '5.2 invalid 关卡 stats 全为 0',
      statsAllZero,
      'simple=0, core=0, gate=0, totalEmpty=0',
      `simple=${stats.simple}, core=${stats.core}, gate=${stats.gate}, totalEmpty=${stats.totalEmpty}`,
    );

    // rhythmTimeline 应该为 null
    runner.assert(
      '5.2 invalid 关卡 rhythmTimeline 为 null',
      heatmap.rhythmTimeline === null,
      'null',
      heatmap.rhythmTimeline === null ? 'null' : '存在',
    );
  } else {
    runner.skip('5.2 invalid 关卡 graceful degradation', '非 invalid 关卡');
  }

  // 5.3 0 gate 关卡：收官关判定不会报错
  if (stats.gate === 0 && heatmap.status === 'valid') {
    const levelType = getLevelType(level);
    let noError = true;
    try {
      const filledSet = new Set();
      // 填完所有 simple
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (gridMeta[r][c].category === 'simple') {
            filledSet.add(`${r},${c}`);
          }
        }
      }
      checkWinCondition(level, gridMeta, filledSet, 0, false);
      calcWeightedProgress(gridMeta, filledSet);
    } catch (e) {
      noError = false;
    }
    runner.assert(
      '5.3 0 gate 关卡 通关判定不报错',
      noError,
      '不报错',
      noError ? '通过' : '报错',
      `关卡类型: ${levelType}`,
    );
  } else if (heatmap.status === 'valid') {
    runner.skip('5.3 0 gate 关卡 通关判定不报错', '该关卡 gate > 0');
  } else {
    runner.skip('5.3 0 gate 关卡 通关判定不报错', '关卡无效');
  }

  // 5.4 高 gate 关卡：gate 数量统计正确
  if (heatmap.status === 'valid' && stats.gate >= 5) {
    // 手动统计 gate 数量验证
    let actualGate = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (gridMeta[r][c].category === 'gate') actualGate++;
      }
    }
    runner.assert(
      '5.4 高 gate 关卡 数量统计正确',
      stats.gate === actualGate,
      actualGate,
      stats.gate,
      `gate 数 >= 5`,
    );
  } else {
    runner.skip('5.4 高 gate 关卡 数量统计正确', 'gate < 5 或关卡无效');
  }
}

// ========================================================
//  主流程
// ========================================================

function main() {
  console.log('='.repeat(70));
  console.log('  Killer Sudoku 三色节奏系统 - 集成测试');
  console.log('='.repeat(70));
  console.log();

  // 1. 读取关卡数据
  console.log('[1/5] 加载关卡数据...');
  const levels = JSON.parse(fs.readFileSync(LEVELS_PATH, 'utf-8'));
  console.log(`      关卡数量: ${levels.length}`);
  console.log();

  // 2. 初始化测试运行器
  const runner = new TestRunner();
  const startTime = Date.now();

  console.log('[2/5] 运行集成测试...');
  console.log();

  // 3. 遍历每个关卡进行测试
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const levelId = level.levelId;
    const gridSize = level.gridSize || 9;

    runner.startLevel(levelId, level.title, gridSize);

    // 创建 board 和 adapter
    let board, adapter, heatmap;
    try {
      board = createBoardFromLevel(level);
      adapter = new TechRaterAdapter(board);
      heatmap = adapter.generateHeatmap();
    } catch (err) {
      // 处理致命错误
      runner.assert('初始化', false, '成功创建 adapter 和 heatmap', err.message);
      runner.endLevel();
      const pct = ((i + 1) / levels.length * 100).toFixed(0);
      process.stdout.write(
        `      [${pad(levelId, 5)}] ${pad(level.title || '', 12)} ` +
        `${pad('ERROR', 8)} (${i + 1}/${levels.length} ${pct}%)\r`
      );
      continue;
    }

    // 测试 1：三色分类完整性
    testThreeColorClassification(runner, level, heatmap, board);

    // 测试 2：rhythmTimeline 数据完整性
    testRhythmTimeline(runner, level, heatmap, adapter);

    // 测试 3：WinCondition 通关条件计算
    testWinCondition(runner, level, heatmap, adapter);

    // 测试 4：雪崩动画序列验证
    testAvalancheSequence(runner, level, heatmap, adapter);

    // 测试 5：边界与异常情况
    testEdgeCases(runner, level, heatmap, board);

    runner.endLevel();

    // 打印进度
    const result = runner.results[i];
    const status = result.failed > 0 ? 'FAIL' : (result.skipped > 0 ? 'SKIP' : 'PASS');
    const pct = ((i + 1) / levels.length * 100).toFixed(0);
    process.stdout.write(
      `      [${pad(levelId, 5)}] ${pad(level.title || '', 12)} ` +
      `${pad(status, 8)} ${pad(result.passed, 3, 'right')}/${pad(result.passed + result.failed + result.skipped, 3, 'right')} ` +
      `(${i + 1}/${levels.length} ${pct}%)\r`
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log();
  console.log(`      测试完成！耗时: ${elapsed}s`);
  console.log();

  // 4. 打印汇总
  console.log('[3/5] 测试汇总...');
  console.log();
  console.log(`  总关卡数: ${runner.summary.totalLevels}`);
  console.log(`  全部通过: ${runner.summary.passed}`);
  console.log(`  有失败:   ${runner.summary.failed}`);
  console.log(`  有跳过:   ${runner.summary.skipped}`);
  console.log(`  总耗时:   ${elapsed}s`);
  console.log();

  // 按测试项统计
  console.log('  按测试项统计:');
  console.log('  ' + '-'.repeat(60));
  const testNames = Object.keys(runner.summary.byTest).sort();
  for (const name of testNames) {
    const t = runner.summary.byTest[name];
    const total = t.passed + t.failed + t.skipped;
    const status = t.failed > 0 ? 'FAIL' : 'PASS';
    console.log(
      `    ${pad(status, 6)} ${pad(name, 38)} ` +
      `${pad(t.passed, 4, 'right')}/${pad(total, 4, 'right')} ` +
      `${t.skipped > 0 ? `(跳过 ${t.skipped})` : ''}`
    );
  }
  console.log();

  // 5. 打印失败详情
  if (runner.summary.failed > 0) {
    console.log('[4/5] 失败详情:');
    console.log();
    for (const result of runner.results) {
      if (result.failed === 0) continue;
      console.log(`  关卡 ${result.levelId} (${result.title}):`);
      for (const err of result.errors) {
        console.log(`    [FAIL] ${err.test}`);
        console.log(`           期望: ${err.expected}`);
        console.log(`           实际: ${err.actual}`);
        if (err.detail) console.log(`           说明: ${err.detail}`);
      }
      console.log();
    }
  } else {
    console.log('[4/5] 所有测试通过！');
    console.log();
  }

  // 6. 写入报告
  console.log('[5/5] 写入测试报告...');
  ensureDir(OUTPUT_DIR);

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedSeconds: +elapsed,
    summary: {
      totalLevels: runner.summary.totalLevels,
      passed: runner.summary.passed,
      failed: runner.summary.failed,
      skipped: runner.summary.skipped,
      byTest: runner.summary.byTest,
    },
    levels: runner.results.map(r => ({
      levelId: r.levelId,
      title: r.title,
      gridSize: r.gridSize,
      passed: r.passed,
      failed: r.failed,
      skipped: r.skipped,
      status: r.failed > 0 ? 'fail' : (r.skipped > 0 ? 'skip' : 'pass'),
      tests: r.tests,
      errors: r.errors,
    })),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`      报告已写入: output/integration_test_report.json`);
  console.log();

  console.log('='.repeat(70));
  console.log('  集成测试完成！');
  console.log('='.repeat(70));

  // 返回非零退出码如果有失败
  if (runner.summary.failed > 0) {
    process.exitCode = 1;
  }
}

// ========================================================
//  启动
// ========================================================

if (require.main === module) {
  main();
}

module.exports = {
  main,
  getLevelType,
  LEVEL_TYPES,
  WEIGHTS,
  calcWeightedProgress,
  checkWinCondition,
  countByCategoryFromSet,
};
