#!/usr/bin/env node
/**
 * ============================================================
 *  03-apply.js - 应用优化方案
 * ============================================================
 *
 *  读取 all_levels.json 和 optimization_plan.json，
 *  对需要优化的关卡应用优化方案（增加预填数字），
 *  验证优化后仍然可解且 solution 不变，
 *  生成 output/all_levels_v2.json。
 */

const fs = require('fs');
const path = require('path');
const { TechRater, TechRaterAdapter, createBoardFromLevel, analyzeLevel, PROJECT_ROOT } = require('./_loader.js');

// ========================================================
//  路径配置
// ========================================================

const LEVELS_PATH = path.join(PROJECT_ROOT, 'data', 'all_levels.json');
const PLAN_PATH = path.join(PROJECT_ROOT, 'output', 'optimization_plan.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'all_levels_v2.json');

// ========================================================
//  工具函数
// ========================================================

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ========================================================
//  应用优化
// ========================================================

/**
 * 对单个关卡应用优化方案
 * @param {Object} level - 原始关卡数据
 * @param {Object} plan - 优化方案
 * @returns {Object} { level: 新关卡数据, applied: boolean, iterations: [...] }
 */
function applyOptimization(level, plan) {
  const size = level.gridSize || 9;
  let currentLevel = deepClone(level);
  const iterationResults = [];
  let totalAdded = 0;

  for (const iteration of plan.iterations) {
    const cellsToFill = iteration.cellsToFill || [];
    const actuallyAdded = [];

    for (const cell of cellsToFill) {
      const { row, col, value } = cell;

      // 安全检查：确保格子当前是空的
      if (currentLevel.cells[row][col] !== 0) {
        continue;
      }

      // 安全检查：确保填入的值与 solution 一致
      if (value !== currentLevel.solution[row][col]) {
        console.warn(`      [警告] L${level.levelId} 格(${row},${col}): 方案值${value}与答案${currentLevel.solution[row][col]}不符，跳过`);
        continue;
      }

      // 应用预填
      currentLevel.cells[row][col] = value;
      actuallyAdded.push({ row, col, value, reason: cell.reason || '' });
      totalAdded++;
    }

    // 验证这一轮后仍然可解
    const validation = validateLevel(currentLevel);

    iterationResults.push({
      round: iteration.round,
      targetCount: cellsToFill.length,
      actuallyAdded: actuallyAdded.length,
      cells: actuallyAdded,
      valid: validation.valid,
      solvable: validation.solvable,
      simplePct: validation.simplePct,
      gate: validation.gate,
    });

    // 如果不可解了，回退这一轮
    if (!validation.solvable) {
      console.warn(`      [警告] L${level.levelId} 第${iteration.round}轮后不可解，回退`);
      for (const cell of actuallyAdded) {
        currentLevel.cells[cell.row][cell.col] = 0;
      }
      iterationResults[iterationResults.length - 1].rolledBack = true;
      break; // 停止后续迭代
    }
  }

  return {
    level: currentLevel,
    applied: totalAdded > 0,
    totalAdded,
    iterations: iterationResults,
  };
}

/**
 * 验证关卡是否可解且答案一致
 */
function validateLevel(level) {
  try {
    const board = createBoardFromLevel(level);
    const rater = new TechRater(board);
    const result = rater.solve(500);

    if (!result.solvable) {
      return { valid: false, solvable: false, simplePct: 0, gate: 0 };
    }

    // 验证解与 solution 一致
    const size = level.gridSize || 9;
    let matchesSolution = true;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (rater.grid[r][c] !== level.solution[r][c]) {
          matchesSolution = false;
          break;
        }
      }
      if (!matchesSolution) break;
    }

    // 计算三色分布
    const adapter = new TechRaterAdapter(createBoardFromLevel(level));
    const heatmap = adapter.generateHeatmap();
    const stats = heatmap.stats || { simple: 0, core: 0, gate: 0, totalEmpty: 0 };
    const simplePct = stats.totalEmpty > 0 ? +(stats.simple / stats.totalEmpty * 100).toFixed(1) : 0;

    return {
      valid: matchesSolution && heatmap.status === 'valid',
      solvable: result.solvable,
      matchesSolution,
      simplePct,
      gate: stats.gate,
      simple: stats.simple,
      core: stats.core,
      totalEmpty: stats.totalEmpty,
    };
  } catch (err) {
    return { valid: false, solvable: false, error: err.message, simplePct: 0, gate: 0 };
  }
}

// ========================================================
//  主流程
// ========================================================

function main() {
  console.log('='.repeat(70));
  console.log('  Killer Sudoku 应用优化方案');
  console.log('='.repeat(70));
  console.log();

  // 1. 读取数据
  console.log('[1/5] 读取关卡数据和优化方案...');
  const levels = JSON.parse(fs.readFileSync(LEVELS_PATH, 'utf-8'));
  const planData = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf-8'));
  const plans = planData.plans || [];
  console.log(`      关卡总数: ${levels.length}`);
  console.log(`      优化方案: ${plans.length} 个`);
  console.log();

  // 2. 应用优化
  console.log('[2/5] 应用优化方案...');
  const newLevels = [];
  const applyResults = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const plan = plans.find(p => p.levelId === level.levelId);

    if (!plan) {
      // 不需要优化的关卡，直接复制
      newLevels.push(deepClone(level));
      continue;
    }

    // 应用优化
    const result = applyOptimization(level, plan);
    newLevels.push(result.level);

    applyResults.push({
      levelId: level.levelId,
      title: level.title,
      totalAdded: result.totalAdded,
      iterations: result.iterations,
      applied: result.applied,
    });

    if (result.applied) {
      successCount++;
    } else {
      failCount++;
    }

    const pct = ((i + 1) / levels.length * 100).toFixed(0);
    process.stdout.write(`      进度: ${i + 1}/${levels.length} (${pct}%)\r`);
  }

  console.log();
  console.log(`      完成！成功应用: ${successCount}, 未应用: ${failCount}`);
  console.log();

  // 3. 验证所有关卡
  console.log('[3/5] 验证优化后关卡...');
  const validationResults = [];
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < newLevels.length; i++) {
    const level = newLevels[i];
    const v = validateLevel(level);

    validationResults.push({
      levelId: level.levelId,
      title: level.title,
      ...v,
    });

    if (v.valid && v.solvable) {
      validCount++;
    } else {
      invalidCount++;
    }

    const pct = ((i + 1) / newLevels.length * 100).toFixed(0);
    process.stdout.write(`      进度: ${i + 1}/${newLevels.length} (${pct}%)  ${v.solvable ? 'OK' : 'FAIL'}\r`);
  }

  console.log();
  console.log(`      有效: ${validCount}, 无效: ${invalidCount}`);
  console.log();

  // 4. 写入输出
  console.log('[4/5] 写入优化后的关卡数据...');
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(newLevels, null, 2), 'utf-8');
  console.log(`      已写入: output/all_levels_v2.json`);
  console.log();

  // 5. 汇总输出
  console.log('[5/5] 优化汇总:');
  console.log();

  if (applyResults.length > 0) {
    console.log(
      pad('ID', 6) +
      pad('标题', 14) +
      pad('新增预填', 10, 'right') +
      pad('迭代轮数', 10, 'right') +
      pad('优化后simple%', 14, 'right') +
      pad('优化后gate', 10, 'right') +
      pad('状态', 8)
    );
    console.log('-'.repeat(70));

    for (const r of applyResults) {
      const v = validationResults.find(v => v.levelId === r.levelId);
      const simplePct = v ? v.simplePct + '%' : '-';
      const gate = v ? v.gate : '-';
      const status = v ? (v.valid ? 'valid' : 'invalid') : '-';

      console.log(
        pad(r.levelId, 6) +
        pad(r.title || '', 14) +
        pad(r.totalAdded, 10, 'right') +
        pad(r.iterations.length, 10, 'right') +
        pad(simplePct, 14, 'right') +
        pad(gate, 10, 'right') +
        pad(status, 8)
      );
    }
  } else {
    console.log('  没有需要优化的关卡。');
  }

  console.log();
  console.log('='.repeat(70));
  console.log('  优化应用完成！输出文件: output/all_levels_v2.json');
  console.log('='.repeat(70));
}

function pad(str, len, align = 'left') {
  str = String(str);
  if (str.length >= len) return str.slice(0, len);
  const p = ' '.repeat(len - str.length);
  return align === 'right' ? p + str : str + p;
}

// ========================================================
//  启动
// ========================================================

if (require.main === module) {
  main();
}

module.exports = { main, applyOptimization, validateLevel };
