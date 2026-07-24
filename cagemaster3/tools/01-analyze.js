#!/usr/bin/env node
/**
 * ============================================================
 *  01-analyze.js - 基线分析脚本
 * ============================================================
 *
 *  读取 data/all_levels.json，对每个关卡运行 TechRater + TechRaterAdapter，
 *  输出统计信息到 output/analysis_report.json，并在控制台打印汇总表格。
 */

const fs = require('fs');
const path = require('path');
const { analyzeLevel, PROJECT_ROOT } = require('./_loader.js');

// ========================================================
//  路径配置
// ========================================================

const LEVELS_PATH = path.join(PROJECT_ROOT, 'data', 'all_levels.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'analysis_report.json');

// ========================================================
//  工具函数
// ========================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ========================================================
//  主流程
// ========================================================

function main() {
  console.log('='.repeat(70));
  console.log('  Killer Sudoku 关卡基线分析');
  console.log('='.repeat(70));
  console.log();

  // 1. 读取关卡数据
  console.log('[1/4] 读取关卡数据...');
  const levels = JSON.parse(fs.readFileSync(LEVELS_PATH, 'utf-8'));
  console.log(`      共 ${levels.length} 个关卡`);
  console.log();

  // 2. 分析每个关卡
  console.log('[2/4] 运行 TechRater + Adapter 分析...');
  const startTime = Date.now();

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const result = analyzeLevel(level);

    // 去除内部附加字段，只保留对外数据
    const cleanResult = {};
    for (const key of Object.keys(result)) {
      if (!key.startsWith('_')) {
        cleanResult[key] = result[key];
      }
    }
    results.push(cleanResult);

    if (result.status === 'valid') {
      successCount++;
    } else {
      failCount++;
    }

    const pct = ((i + 1) / levels.length * 100).toFixed(0);
    process.stdout.write(`      进度: ${i + 1}/${levels.length} (${pct}%)  ${result.status === 'valid' ? 'OK' : 'FAIL'}\r`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log();
  console.log(`      完成！成功: ${successCount}, 失败: ${failCount}, 耗时: ${elapsed}s`);
  console.log();

  // 3. 生成报告数据
  console.log('[3/4] 生成分析报告...');

  const validResults = results.filter(r => r.status === 'valid');
  const invalidResults = results.filter(r => r.status !== 'valid');

  const avgSimplePct = validResults.length > 0
    ? +(validResults.reduce((s, r) => s + r.simplePct, 0) / validResults.length).toFixed(1)
    : 0;
  const avgGate = validResults.length > 0
    ? +(validResults.reduce((s, r) => s + r.gate, 0) / validResults.length).toFixed(1)
    : 0;
  const avgSteps = validResults.length > 0
    ? +(validResults.reduce((s, r) => s + r.solveSteps, 0) / validResults.length).toFixed(1)
    : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    totalLevels: levels.length,
    validLevels: successCount,
    invalidLevels: failCount,
    elapsedSeconds: +elapsed,
    summary: {
      avgSimplePct: avgSimplePct,
      avgGate: avgGate,
      avgSolveSteps: avgSteps,
    },
    levels: results,
  };

  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`      报告已写入: output/analysis_report.json`);
  console.log();

  // 4. 控制台汇总表格
  console.log('[4/4] 汇总表格:');
  console.log();
  printSummaryTable(results);

  console.log();
  console.log('='.repeat(70));
  console.log('  分析完成！详细数据请查看 output/analysis_report.json');
  console.log('='.repeat(70));
}

// ========================================================
//  表格输出
// ========================================================

function pad(str, len, align = 'left') {
  str = String(str);
  if (str.length >= len) return str.slice(0, len);
  const pad = ' '.repeat(len - str.length);
  return align === 'right' ? pad + str : str + pad;
}

function printSummaryTable(results) {
  // 表头
  const header =
    pad('ID', 6) +
    pad('标题', 14) +
    pad('尺寸', 6, 'right') +
    pad('难度', 6) +
    pad('空格', 6, 'right') +
    pad('simple', 8, 'right') +
    pad('占比', 8, 'right') +
    pad('core', 6, 'right') +
    pad('gate', 6, 'right') +
    pad('步数', 6, 'right') +
    pad('状态', 8);

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of results) {
    const line =
      pad(r.levelId, 6) +
      pad(r.title || '', 14) +
      pad(r.gridSize, 6, 'right') +
      pad(r.difficulty || '', 6) +
      pad(r.totalEmpty, 6, 'right') +
      pad(r.simple, 8, 'right') +
      pad(r.simplePct + '%', 8, 'right') +
      pad(r.core, 6, 'right') +
      pad(r.gate, 6, 'right') +
      pad(r.solveSteps, 6, 'right') +
      pad(r.status, 8);
    console.log(line);
  }

  console.log('-'.repeat(header.length));

  // 汇总行
  const validResults = results.filter(r => r.status === 'valid');
  const avgSimplePct = validResults.length > 0
    ? (validResults.reduce((s, r) => s + r.simplePct, 0) / validResults.length).toFixed(1)
    : '0.0';
  const avgGate = validResults.length > 0
    ? (validResults.reduce((s, r) => s + r.gate, 0) / validResults.length).toFixed(1)
    : '0.0';

  const summaryLine =
    pad('合计/平均', 20) +
    pad('', 6) +
    pad('', 6) +
    pad('', 6) +
    pad('', 8) +
    pad(avgSimplePct + '%', 8, 'right') +
    pad('', 6) +
    pad(avgGate, 6, 'right') +
    pad('', 6) +
    pad(`${results.filter(r => r.status === 'valid').length}/${results.length}`, 8);
  console.log(summaryLine);
}

// ========================================================
//  启动
// ========================================================

if (require.main === module) {
  main();
}

module.exports = { main };
