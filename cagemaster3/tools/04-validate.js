#!/usr/bin/env node
/**
 * ============================================================
 *  04-validate.js - 验证报告
 * ============================================================
 *
 *  读取 all_levels_v2.json，重新运行所有关卡的分析，
 *  与基线（analysis_report.json）对比，生成验证报告。
 *
 *  对比内容：
 *  - simple 占比变化
 *  - gate 数量变化
 *  - 可解性验证
 *  - solution 一致性验证
 */

const fs = require('fs');
const path = require('path');
const { TechRater, TechRaterAdapter, createBoardFromLevel, analyzeLevel, PROJECT_ROOT } = require('./_loader.js');

// ========================================================
//  路径配置
// ========================================================

const BASELINE_PATH = path.join(PROJECT_ROOT, 'output', 'analysis_report.json');
const NEW_LEVELS_PATH = path.join(PROJECT_ROOT, 'output', 'all_levels_v2.json');
const ORIGINAL_LEVELS_PATH = path.join(PROJECT_ROOT, 'data', 'all_levels.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'validation_report.json');

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

// ========================================================
//  验证函数
// ========================================================

/**
 * 验证 solution 一致性
 */
function verifySolutionConsistency(originalLevel, newLevel) {
  const size = originalLevel.gridSize || 9;
  const origSol = originalLevel.solution;
  const newSol = newLevel.solution;

  if (!origSol || !newSol) return { consistent: false, reason: '缺少 solution 数据' };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (origSol[r][c] !== newSol[r][c]) {
        return {
          consistent: false,
          reason: `位置(${r},${c})答案不一致: 原值${origSol[r][c]}, 新值${newSol[r][c]}`,
        };
      }
    }
  }

  return { consistent: true };
}

/**
 * 验证预填数字与 solution 一致
 */
function verifyFilledMatchSolution(level) {
  const size = level.gridSize || 9;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (level.cells[r][c] !== 0 && level.cells[r][c] !== level.solution[r][c]) {
        return {
          valid: false,
          reason: `预填格(${r},${c})值${level.cells[r][c]}与答案${level.solution[r][c]}不一致`,
        };
      }
    }
  }
  return { valid: true };
}

/**
 * 统计新增预填数量
 */
function countNewFilled(originalLevel, newLevel) {
  const size = originalLevel.gridSize || 9;
  let newFilled = 0;
  const newCells = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (originalLevel.cells[r][c] === 0 && newLevel.cells[r][c] !== 0) {
        newFilled++;
        newCells.push({ row: r, col: c, value: newLevel.cells[r][c] });
      }
    }
  }

  return { count: newFilled, cells: newCells };
}

// ========================================================
//  主流程
// ========================================================

function main() {
  console.log('='.repeat(70));
  console.log('  Killer Sudoku 验证报告');
  console.log('='.repeat(70));
  console.log();

  // 1. 读取数据
  console.log('[1/5] 读取基线数据和优化后关卡...');
  const baselineReport = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
  const newLevels = JSON.parse(fs.readFileSync(NEW_LEVELS_PATH, 'utf-8'));
  const originalLevels = JSON.parse(fs.readFileSync(ORIGINAL_LEVELS_PATH, 'utf-8'));

  console.log(`      基线关卡数: ${baselineReport.levels.length}`);
  console.log(`      新关卡数: ${newLevels.length}`);
  console.log(`      原始关卡数: ${originalLevels.length}`);
  console.log();

  // 2. 重新分析新关卡
  console.log('[2/5] 重新分析优化后关卡...');
  const startTime = Date.now();
  const newAnalyses = [];

  for (let i = 0; i < newLevels.length; i++) {
    const level = newLevels[i];
    const result = analyzeLevel(level);

    // 去除内部字段
    const cleanResult = {};
    for (const key of Object.keys(result)) {
      if (!key.startsWith('_')) {
        cleanResult[key] = result[key];
      }
    }
    newAnalyses.push(cleanResult);

    const pct = ((i + 1) / newLevels.length * 100).toFixed(0);
    process.stdout.write(`      进度: ${i + 1}/${newLevels.length} (${pct}%)\r`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log();
  console.log(`      完成！耗时: ${elapsed}s`);
  console.log();

  // 3. 验证 solution 一致性
  console.log('[3/5] 验证 solution 一致性...');
  const solutionChecks = [];
  let solutionConsistentCount = 0;

  for (let i = 0; i < newLevels.length; i++) {
    const newLevel = newLevels[i];
    const origLevel = originalLevels.find(l => l.levelId === newLevel.levelId);
    if (!origLevel) continue;

    const solCheck = verifySolutionConsistency(origLevel, newLevel);
    const fillCheck = verifyFilledMatchSolution(newLevel);
    const filledInfo = countNewFilled(origLevel, newLevel);

    solutionChecks.push({
      levelId: newLevel.levelId,
      title: newLevel.title,
      solutionConsistent: solCheck.consistent,
      solutionReason: solCheck.reason || '',
      filledMatchSolution: fillCheck.valid,
      filledReason: fillCheck.reason || '',
      newFilledCount: filledInfo.count,
      newFilledCells: filledInfo.cells,
    });

    if (solCheck.consistent && fillCheck.valid) {
      solutionConsistentCount++;
    }
  }

  console.log(`      solution 一致: ${solutionConsistentCount} / ${newLevels.length}`);
  console.log();

  // 4. 生成对比数据
  console.log('[4/5] 生成对比数据...');
  const comparisons = [];

  for (let i = 0; i < newAnalyses.length; i++) {
    const newA = newAnalyses[i];
    const baseline = baselineReport.levels.find(b => b.levelId === newA.levelId);
    const solCheck = solutionChecks.find(s => s.levelId === newA.levelId);

    const comparison = {
      levelId: newA.levelId,
      title: newA.title,
      gridSize: newA.gridSize,
      difficultyLevel: newA.difficultyLevel,
      baseline: baseline ? {
        simplePct: baseline.simplePct,
        gate: baseline.gate,
        simple: baseline.simple,
        core: baseline.core,
        totalEmpty: baseline.totalEmpty,
        solveSteps: baseline.solveSteps,
        status: baseline.status,
        solvable: baseline.solvable,
      } : null,
      optimized: {
        simplePct: newA.simplePct,
        gate: newA.gate,
        simple: newA.simple,
        core: newA.core,
        totalEmpty: newA.totalEmpty,
        solveSteps: newA.solveSteps,
        status: newA.status,
        solvable: newA.solvable,
      },
      changes: {
        simplePctDelta: baseline ? +(newA.simplePct - baseline.simplePct).toFixed(1) : 0,
        gateDelta: baseline ? newA.gate - baseline.gate : 0,
        simpleDelta: baseline ? newA.simple - baseline.simple : 0,
        coreDelta: baseline ? newA.core - baseline.core : 0,
        totalEmptyDelta: baseline ? newA.totalEmpty - baseline.totalEmpty : 0,
        solveStepsDelta: baseline ? newA.solveSteps - baseline.solveSteps : 0,
      },
      newFilledCount: solCheck ? solCheck.newFilledCount : 0,
      solutionConsistent: solCheck ? solCheck.solutionConsistent : false,
      filledMatchSolution: solCheck ? solCheck.filledMatchSolution : false,
    };

    comparisons.push(comparison);
  }

  // 汇总统计
  const changedLevels = comparisons.filter(c => c.newFilledCount > 0);
  const improvedSimple = comparisons.filter(c => c.changes.simplePctDelta > 0);
  const reducedGate = comparisons.filter(c => c.changes.gateDelta < 0);
  const stillValid = comparisons.filter(c => c.optimized.solvable && c.optimized.status === 'valid');

  console.log(`      有变化的关卡: ${changedLevels.length}`);
  console.log(`      simple 占比提升: ${improvedSimple.length}`);
  console.log(`      gate 数量减少: ${reducedGate.length}`);
  console.log(`      仍然可解: ${stillValid.length} / ${comparisons.length}`);
  console.log();

  // 5. 写入报告
  console.log('[5/5] 写入验证报告...');
  const report = {
    generatedAt: new Date().toISOString(),
    elapsedSeconds: +elapsed,
    totalLevels: newLevels.length,
    summary: {
      changedLevels: changedLevels.length,
      solutionConsistentCount,
      stillValidCount: stillValid.length,
      improvedSimpleCount: improvedSimple.length,
      reducedGateCount: reducedGate.length,
    },
    comparisons: comparisons,
    solutionChecks: solutionChecks.map(s => ({
      levelId: s.levelId,
      title: s.title,
      solutionConsistent: s.solutionConsistent,
      solutionReason: s.solutionReason,
      filledMatchSolution: s.filledMatchSolution,
      filledReason: s.filledReason,
      newFilledCount: s.newFilledCount,
    })),
  };

  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`      报告已写入: output/validation_report.json`);
  console.log();

  // 打印对比表格
  console.log('对比汇总表:');
  console.log();
  console.log(
    pad('ID', 6) +
    pad('标题', 14) +
    pad('新增预填', 10, 'right') +
    pad('基线simple%', 12, 'right') +
    pad('优化simple%', 12, 'right') +
    pad('simple变化', 10, 'right') +
    pad('基线gate', 10, 'right') +
    pad('优化gate', 10, 'right') +
    pad('gate变化', 10, 'right') +
    pad('可解', 6) +
    pad('答案一致', 8)
  );
  console.log('-'.repeat(100));

  // 只打印有变化的关卡
  const changed = comparisons.filter(c => c.newFilledCount > 0);
  if (changed.length === 0) {
    console.log('  （无关卡发生变化）');
  } else {
    for (const c of changed) {
      const baseSimple = c.baseline ? c.baseline.simplePct + '%' : '-';
      const optSimple = c.optimized.simplePct + '%';
      const simpleDelta = (c.changes.simplePctDelta > 0 ? '+' : '') + c.changes.simplePctDelta + '%';
      const baseGate = c.baseline ? c.baseline.gate : '-';
      const optGate = c.optimized.gate;
      const gateDelta = (c.changes.gateDelta > 0 ? '+' : '') + c.changes.gateDelta;

      console.log(
        pad(c.levelId, 6) +
        pad(c.title || '', 14) +
        pad(c.newFilledCount, 10, 'right') +
        pad(baseSimple, 12, 'right') +
        pad(optSimple, 12, 'right') +
        pad(simpleDelta, 10, 'right') +
        pad(baseGate, 10, 'right') +
        pad(optGate, 10, 'right') +
        pad(gateDelta, 10, 'right') +
        pad(c.optimized.solvable ? 'OK' : 'FAIL', 6) +
        pad(c.solutionConsistent ? '是' : '否', 8)
      );
    }
  }

  console.log();
  console.log('='.repeat(70));
  console.log('  验证完成！详细报告请查看 output/validation_report.json');
  console.log('='.repeat(70));
}

// ========================================================
//  启动
// ========================================================

if (require.main === module) {
  main();
}

module.exports = { main, verifySolutionConsistency };
