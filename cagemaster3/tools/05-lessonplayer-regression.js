#!/usr/bin/env node
/**
 * ============================================================
 *  05-lessonplayer-regression.js - LessonPlayer 教学引导回归测试
 * ============================================================
 *
 *  对比原始关卡 (data/all_levels.json) 和优化后关卡 (output/all_levels_v2.json)，
 *  检查教学引导 (lessonPlan) 中引用的格子是否在优化后被预填，
 *  导致教学引导失效。
 *
 *  检查范围：
 *  - guided.targetCell：手把手阶段的目标格
 *  - semiAuto.watchCells：半自主阶段的观察格
 *  - demo.steps 中所有涉及格子坐标的步骤 (focusCell, highlightCell 等)
 *
 *  支持两种 lessonPlan 格式：
 *  1. 旧格式：phases 是对象 (intro/demo/guided/semiAuto/free)
 *  2. 新格式：phases 是数组 (每个 phase 有 phase 字段和 steps)
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('./_loader.js');

// ========================================================
//  路径配置
// ========================================================

const ORIGINAL_LEVELS_PATH = path.join(PROJECT_ROOT, 'data', 'all_levels.json');
const OPTIMIZED_LEVELS_PATH = path.join(PROJECT_ROOT, 'output', 'all_levels_v2.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'lessonplayer_regression_report.json');

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
 * 判断一个值是否为 [row, col] 坐标对
 */
function isCellCoord(val) {
  return Array.isArray(val)
    && val.length === 2
    && typeof val[0] === 'number'
    && typeof val[1] === 'number'
    && Number.isInteger(val[0])
    && Number.isInteger(val[1])
    && val[0] >= 0 && val[1] >= 0;
}

/**
 * 判断一个值是否为坐标数组 [[r,c], [r,c], ...]
 */
function isCellCoordArray(val) {
  return Array.isArray(val)
    && val.length > 0
    && val.every(item => isCellCoord(item));
}

/**
 * 获取关卡中新增的预填格集合 (原始为0，优化后为数字)
 * @returns {Map<string, number>} key: "r,c" -> value: 预填值
 */
function getNewlyFilledCells(originalLevel, optimizedLevel) {
  const size = originalLevel.gridSize || 9;
  const map = new Map();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const origVal = originalLevel.cells[r]?.[c] ?? 0;
      const optVal = optimizedLevel.cells[r]?.[c] ?? 0;
      if (origVal === 0 && optVal !== 0) {
        map.set(`${r},${c}`, optVal);
      }
    }
  }

  return map;
}

// ========================================================
//  教学引导格子坐标提取
// ========================================================

/**
 * 从 lessonPlan 中提取所有涉及格子坐标的引用
 * 返回结构化的问题列表
 *
 * @param {Object} lessonPlan - 关卡的 lessonPlan 对象
 * @param {Map<string, number>} newlyFilled - 新增预填格 Map
 * @param {number} gridSize - 网格大小
 * @returns {Array<Object>} 问题列表
 */
function extractLessonCellRefs(lessonPlan, newlyFilled, gridSize) {
  const issues = [];

  if (!lessonPlan || !lessonPlan.phases) return issues;

  const phases = lessonPlan.phases;

  // 处理旧格式：phases 是对象
  if (!Array.isArray(phases) && typeof phases === 'object') {
    scanPhasesObjectFormat(phases, newlyFilled, gridSize, issues);
  }
  // 处理新格式：phases 是数组
  else if (Array.isArray(phases)) {
    scanPhasesArrayFormat(phases, newlyFilled, gridSize, issues);
  }

  return issues;
}

/**
 * 扫描旧格式 phases (对象形式)
 */
function scanPhasesObjectFormat(phases, newlyFilled, gridSize, issues) {
  // 1. guided.targetCell
  if (phases.guided && phases.guided.targetCell) {
    const cell = phases.guided.targetCell;
    if (isCellCoord(cell)) {
      checkCellRef(cell, 'guided.targetCell', `phases.guided.targetCell`, newlyFilled, gridSize, issues);
    }
  }

  // 2. semiAuto.watchCells
  if (phases.semiAuto && phases.semiAuto.watchCells) {
    const cells = phases.semiAuto.watchCells;
    if (isCellCoordArray(cells)) {
      cells.forEach((cell, idx) => {
        checkCellRef(cell, 'semiAuto.watchCells', `phases.semiAuto.watchCells[${idx}]`, newlyFilled, gridSize, issues);
      });
    }
  }

  // 3. demo.steps 中的格子引用
  if (phases.demo && Array.isArray(phases.demo.steps)) {
    scanSteps(phases.demo.steps, 'phases.demo.steps', newlyFilled, gridSize, issues);
  }

  // 4. 其他 phase 也检查（防御性：如果有未知的 phase 也扫描）
  for (const phaseName of Object.keys(phases)) {
    if (['guided', 'semiAuto', 'demo'].includes(phaseName)) continue;
    const phase = phases[phaseName];
    if (!phase || typeof phase !== 'object') continue;

    // 检查 phase 级别的格子字段（如 free 阶段等）
    scanPhaseLevelCells(phase, `phases.${phaseName}`, newlyFilled, gridSize, issues);

    // 检查 steps
    if (Array.isArray(phase.steps)) {
      scanSteps(phase.steps, `phases.${phaseName}.steps`, newlyFilled, gridSize, issues);
    }
  }
}

/**
 * 扫描新格式 phases (数组形式)
 */
function scanPhasesArrayFormat(phases, newlyFilled, gridSize, issues) {
  phases.forEach((phase, phaseIdx) => {
    const phaseName = phase.phase || phase.name || `phase_${phaseIdx}`;
    const phasePath = `phases[${phaseIdx}](${phaseName})`;

    // 检查 phase 级别的格子字段
    scanPhaseLevelCells(phase, phasePath, newlyFilled, gridSize, issues);

    // 检查 steps
    if (Array.isArray(phase.steps)) {
      scanSteps(phase.steps, `${phasePath}.steps`, newlyFilled, gridSize, issues);
    }
  });
}

/**
 * 扫描单个 phase 对象级别的格子坐标字段（非 steps 内的字段）
 */
function scanPhaseLevelCells(phase, phasePath, newlyFilled, gridSize, issues) {
  if (!phase || typeof phase !== 'object') return;

  for (const key of Object.keys(phase)) {
    if (key === 'steps') continue;

    const val = phase[key];

    // 单个坐标
    if (isCellCoord(val)) {
      checkCellRef(val, `phase.${key}`, `${phasePath}.${key}`, newlyFilled, gridSize, issues);
    }
    // 坐标数组
    else if (isCellCoordArray(val)) {
      val.forEach((cell, idx) => {
        checkCellRef(cell, `phase.${key}[]`, `${phasePath}.${key}[${idx}]`, newlyFilled, gridSize, issues);
      });
    }
  }
}

/**
 * 扫描步骤数组中的格子坐标引用
 */
function scanSteps(steps, stepsPath, newlyFilled, gridSize, issues) {
  steps.forEach((step, stepIdx) => {
    if (!step || typeof step !== 'object') return;

    const stepAction = step.action || 'unknown';

    for (const key of Object.keys(step)) {
      const val = step[key];

      // 跳过非坐标相关字段（文本、时长等）
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') continue;
      if (val === null || val === undefined) continue;

      // 单个坐标 [r, c]
      if (isCellCoord(val)) {
        checkCellRef(
          val,
          `step.${stepAction}.${key}`,
          `${stepsPath}[${stepIdx}].${key} (action: ${stepAction})`,
          newlyFilled,
          gridSize,
          issues
        );
      }
      // 坐标数组 [[r,c], ...]
      else if (isCellCoordArray(val)) {
        val.forEach((cell, cellIdx) => {
          checkCellRef(
            cell,
            `step.${stepAction}.${key}[]`,
            `${stepsPath}[${stepIdx}].${key}[${cellIdx}] (action: ${stepAction})`,
            newlyFilled,
            gridSize,
            issues
          );
        });
      }
      // 嵌套对象 - 递归扫描（防御性）
      else if (typeof val === 'object' && !Array.isArray(val)) {
        scanNestedObject(val, `${stepsPath}[${stepIdx}].${key}`, stepAction, newlyFilled, gridSize, issues);
      }
    }
  });
}

/**
 * 递归扫描嵌套对象中的格子坐标
 */
function scanNestedObject(obj, objPath, action, newlyFilled, gridSize, issues) {
  if (!obj || typeof obj !== 'object') return;

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') continue;
    if (val === null || val === undefined) continue;

    if (isCellCoord(val)) {
      checkCellRef(val, `step.${action}.${key}`, `${objPath}.${key} (action: ${action})`, newlyFilled, gridSize, issues);
    } else if (isCellCoordArray(val)) {
      val.forEach((cell, idx) => {
        checkCellRef(cell, `step.${action}.${key}[]`, `${objPath}.${key}[${idx}] (action: ${action})`, newlyFilled, gridSize, issues);
      });
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      scanNestedObject(val, `${objPath}.${key}`, action, newlyFilled, gridSize, issues);
    }
  }
}

/**
 * 检查单个格子引用是否与新增预填格冲突
 */
function checkCellRef(cell, refType, refPath, newlyFilled, gridSize, issues) {
  const [r, c] = cell;
  const key = `${r},${c}`;

  // 检查坐标是否越界（附加验证）
  if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) {
    issues.push({
      type: 'out_of_bounds',
      severity: 'warning',
      refType: refType,
      refPath: refPath,
      cell: [r, c],
      message: `坐标 [${r}, ${c}] 超出网格范围 (gridSize=${gridSize})`,
    });
    return;
  }

  // 检查是否被新增预填
  if (newlyFilled.has(key)) {
    const filledValue = newlyFilled.get(key);
    issues.push({
      type: 'prefilled_conflict',
      severity: 'error',
      refType: refType,
      refPath: refPath,
      cell: [r, c],
      filledValue: filledValue,
      message: `教学引导引用的格子 [${r}, ${c}] 在优化后被预填为 ${filledValue}，引导可能失效`,
    });
  }
}

// ========================================================
//  主流程
// ========================================================

function main() {
  console.log('='.repeat(70));
  console.log('  LessonPlayer 教学引导回归测试');
  console.log('='.repeat(70));
  console.log();

  // 1. 读取数据
  console.log('[1/4] 读取原始关卡和优化后关卡...');
  const originalLevels = JSON.parse(fs.readFileSync(ORIGINAL_LEVELS_PATH, 'utf-8'));
  const optimizedLevels = JSON.parse(fs.readFileSync(OPTIMIZED_LEVELS_PATH, 'utf-8'));

  console.log(`      原始关卡数: ${originalLevels.length}`);
  console.log(`      优化后关卡数: ${optimizedLevels.length}`);

  // 筛选有 lessonPlan 的关卡
  const lessonLevels = originalLevels.filter(l => l.lessonPlan);
  console.log(`      含教学引导的关卡: ${lessonLevels.length}`);
  console.log();

  if (lessonLevels.length === 0) {
    console.log('未找到含 lessonPlan 的关卡，测试结束。');
    return;
  }

  // 2. 逐个检查
  console.log('[2/4] 检查教学引导格子引用与预填格冲突...');
  const startTime = Date.now();
  const results = [];
  let totalIssues = 0;
  let levelsWithIssues = 0;
  let totalCellRefs = 0;

  for (let i = 0; i < lessonLevels.length; i++) {
    const origLevel = lessonLevels[i];
    const optLevel = optimizedLevels.find(l => l.levelId === origLevel.levelId);

    const levelResult = {
      levelId: origLevel.levelId,
      title: origLevel.title,
      gridSize: origLevel.gridSize || 9,
      lessonPlanFormat: Array.isArray(origLevel.lessonPlan.phases) ? 'array' : 'object',
      foundInOptimized: !!optLevel,
      newFilledCount: 0,
      newFilledCells: [],
      issues: [],
    };

    if (!optLevel) {
      levelResult.issues.push({
        type: 'missing_level',
        severity: 'error',
        message: `优化后关卡中未找到 levelId=${origLevel.levelId}`,
      });
      results.push(levelResult);
      levelsWithIssues++;
      totalIssues++;
      continue;
    }

    // 获取新增预填格
    const newlyFilled = getNewlyFilledCells(origLevel, optLevel);
    levelResult.newFilledCount = newlyFilled.size;
    newlyFilled.forEach((value, key) => {
      const [r, c] = key.split(',').map(Number);
      levelResult.newFilledCells.push({ row: r, col: c, value });
    });

    // 提取教学引导格子引用并检查冲突
    const issues = extractLessonCellRefs(
      origLevel.lessonPlan,
      newlyFilled,
      origLevel.gridSize || 9
    );
    levelResult.issues = issues;

    // 统计格子引用总数（用于报告信息）
    totalCellRefs += countCellRefs(origLevel.lessonPlan);

    if (issues.length > 0) {
      levelsWithIssues++;
      totalIssues += issues.length;
    }

    results.push(levelResult);

    const pct = ((i + 1) / lessonLevels.length * 100).toFixed(0);
    process.stdout.write(`      进度: ${i + 1}/${lessonLevels.length} (${pct}%)\r`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log();
  console.log(`      完成！耗时: ${elapsed}s`);
  console.log(`      总计格子引用数: ${totalCellRefs}`);
  console.log(`      冲突问题数: ${totalIssues}`);
  console.log(`      有问题的关卡: ${levelsWithIssues} / ${lessonLevels.length}`);
  console.log();

  // 3. 生成报告
  console.log('[3/4] 生成回归测试报告...');

  // 按严重程度分类
  const errorIssues = results.flatMap(r => r.issues.filter(i => i.severity === 'error'));
  const warningIssues = results.flatMap(r => r.issues.filter(i => i.severity === 'warning'));

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedSeconds: +elapsed,
    summary: {
      totalLessonLevels: lessonLevels.length,
      totalOptimizedLevels: optimizedLevels.length,
      totalCellReferences: totalCellRefs,
      levelsWithIssues: levelsWithIssues,
      totalIssues: totalIssues,
      errorCount: errorIssues.length,
      warningCount: warningIssues.length,
      prefilledConflictCount: errorIssues.filter(i => i.type === 'prefilled_conflict').length,
      outOfBoundsCount: warningIssues.filter(i => i.type === 'out_of_bounds').length,
      missingLevelCount: errorIssues.filter(i => i.type === 'missing_level').length,
    },
    results: results,
  };

  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`      报告已写入: output/lessonplayer_regression_report.json`);
  console.log();

  // 4. 打印汇总表格
  console.log('[4/4] 汇总结果:');
  console.log();

  // 总览统计
  console.log('  总览:');
  console.log(`    教学关卡总数: ${lessonLevels.length}`);
  console.log(`    有问题的关卡: ${levelsWithIssues}`);
  console.log(`    问题总数: ${totalIssues} (错误: ${errorIssues.length}, 警告: ${warningIssues.length})`);
  console.log();

  // 详细表格
  console.log(
    pad('ID', 6) +
    pad('标题', 14) +
    pad('格式', 8) +
    pad('新增预填', 10, 'right') +
    pad('错误数', 8, 'right') +
    pad('警告数', 8, 'right') +
    pad('状态', 10)
  );
  console.log('-'.repeat(64));

  for (const r of results) {
    const errorCount = r.issues.filter(i => i.severity === 'error').length;
    const warningCount = r.issues.filter(i => i.severity === 'warning').length;
    const status = errorCount > 0 ? 'FAIL' : (warningCount > 0 ? 'WARN' : 'PASS');

    console.log(
      pad(r.levelId, 6) +
      pad(r.title || '', 14) +
      pad(r.lessonPlanFormat, 8) +
      pad(r.newFilledCount, 10, 'right') +
      pad(errorCount, 8, 'right') +
      pad(warningCount, 8, 'right') +
      pad(status, 10)
    );

    // 如果有问题，打印具体问题
    if (r.issues.length > 0) {
      for (const issue of r.issues) {
        const sev = issue.severity === 'error' ? '  [ERROR]' : '  [WARN] ';
        console.log(`${sev} ${issue.refPath || issue.message}`);
        if (issue.cell) {
          console.log(`          格子: [${issue.cell[0]}, ${issue.cell[1]}]${issue.filledValue ? ` 预填值: ${issue.filledValue}` : ''}`);
        }
      }
    }
  }

  console.log();
  console.log('='.repeat(70));
  if (totalIssues === 0) {
    console.log('  全部通过！教学引导引用的格子均未被新增预填。');
  } else {
    console.log(`  发现 ${totalIssues} 个问题，请查看 output/lessonplayer_regression_report.json`);
  }
  console.log('='.repeat(70));
}

/**
 * 统计 lessonPlan 中的格子引用总数（用于信息展示）
 */
function countCellRefs(lessonPlan) {
  let count = 0;
  if (!lessonPlan || !lessonPlan.phases) return 0;

  const phases = lessonPlan.phases;

  function countInSteps(steps) {
    if (!Array.isArray(steps)) return;
    for (const step of steps) {
      if (!step || typeof step !== 'object') continue;
      for (const key of Object.keys(step)) {
        const val = step[key];
        if (isCellCoord(val)) count++;
        else if (isCellCoordArray(val)) count += val.length;
        else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          countInObject(val);
        }
      }
    }
  }

  function countInObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (isCellCoord(val)) count++;
      else if (isCellCoordArray(val)) count += val.length;
      else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        countInObject(val);
      }
    }
  }

  function countInPhase(phase) {
    if (!phase || typeof phase !== 'object') return;
    countInObject(phase);
    if (Array.isArray(phase.steps)) {
      countInSteps(phase.steps);
    }
  }

  if (Array.isArray(phases)) {
    for (const phase of phases) {
      countInPhase(phase);
    }
  } else if (typeof phases === 'object') {
    for (const key of Object.keys(phases)) {
      countInPhase(phases[key]);
    }
  }

  return count;
}

// ========================================================
//  启动
// ========================================================

if (require.main === module) {
  main();
}

module.exports = { main, extractLessonCellRefs, getNewlyFilledCells, isCellCoord, isCellCoordArray };
