#!/usr/bin/env node
/**
 * ============================================================
 *  validate-all-levels.js - 批量验证所有关卡
 * ============================================================
 *
 *  用法：
 *    node tools/validate-all-levels.js
 *
 *  功能：
 *    1. 加载 chapters.json
 *    2. 对每一关调用 LevelValidator
 *    3. 控制台输出摘要
 *    4. 生成 logs/level-validation-report.md 详细报告
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ---- 路径配置 ----
const ROOT_DIR = path.resolve(__dirname, '..');
const CHAPTERS_PATH = path.join(ROOT_DIR, 'data', 'chapters.json');
const BOARD_PATH = path.join(ROOT_DIR, 'game', 'board.js');
const TECH_RATER_PATH = path.join(ROOT_DIR, 'game', 'tech-rater.js');
const LEVEL_VALIDATOR_PATH = path.join(ROOT_DIR, 'game', 'level-validator.js');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const REPORT_PATH = path.join(LOGS_DIR, 'level-validation-report.md');

// ---- 浏览器环境 Shim（兼容 board.js 的 window 直接赋值）----
if (typeof window === 'undefined') {
  global.window = global;
}

// ---- 加载依赖 ----
// board.js 直接赋值 window.Board，tech-rater.js 用 IIFE 模式
require(BOARD_PATH);
require(TECH_RATER_PATH);
const LevelValidator = require(LEVEL_VALIDATOR_PATH);

// ---- 加载关卡数据 ----
console.log('加载关卡数据...');
const chaptersData = JSON.parse(fs.readFileSync(CHAPTERS_PATH, 'utf-8'));
const chapters = chaptersData.chapters || chaptersData;

// ---- 统计所有关卡数 ----
let totalLevelCount = 0;
for (const ch of chapters) {
  totalLevelCount += (ch.levels || []).length;
}
console.log('共 ' + chapters.length + ' 章，' + totalLevelCount + ' 关');

// ---- 创建验证器 ----
const validator = new LevelValidator();
validator.setDependencies({
  Board: global.Board,
  TechRater: global.TechRater
});

// ---- 开始验证 ----
console.log('\n开始验证...\n');

const startTime = Date.now();
const report = validator.validateAll(chapters);
const elapsed = Date.now() - startTime;

// ---- 控制台输出摘要 ----
printConsoleSummary(report, elapsed);

// ---- 生成 Markdown 报告 ----
ensureDir(LOGS_DIR);
const mdReport = generateMarkdownReport(report, elapsed);
fs.writeFileSync(REPORT_PATH, mdReport, 'utf-8');
console.log('\n详细报告已生成: ' + REPORT_PATH);

// ============================================================
//  控制台摘要
// ============================================================

function printConsoleSummary(report, elapsed) {
  const line = '─'.repeat(60);
  console.log(line);
  console.log('  关卡验证报告摘要');
  console.log(line);
  console.log('  总关卡数:      ' + report.totalLevels);
  console.log('  通过关卡数:    ' + report.totalPassed + ' / ' + report.totalLevels +
    ' (' + report.passRate + '%)');
  console.log('  可解关卡数:    ' + report.totalSolvable + ' / ' + report.totalLevels +
    ' (' + report.solvableRate + '%)');
  console.log('  错误关卡数:    ' + report.totalErrors);
  console.log('  警告关卡数:    ' + report.totalWarnings);
  console.log('  验证耗时:      ' + elapsed + ' ms');
  console.log(line);

  console.log('\n  难度分布:');
  for (const level of ['1星', '2星', '3星', '4星', '5星']) {
    const count = report.levelDistribution[level] || 0;
    const bar = '█'.repeat(Math.round(count / report.totalLevels * 30));
    console.log('    ' + level + ': ' + String(count).padStart(3) + ' 关  ' + bar);
  }

  console.log('\n  技巧使用统计:');
  const techEntries = Object.entries(report.techCount).sort((a, b) => b[1] - a[1]);
  const maxTechCount = techEntries.length > 0 ? techEntries[0][1] : 1;
  const techNames = {
    nakedSingle: '孤星',
    cageUnique: '唯一组合',
    hiddenSingle: '隐曜',
    rule45: '星衡法则',
    nakedPair: '并蒂锁',
    hiddenPair: '双曜',
    pointingClaiming: '区块排除',
    nakedTriplet: '三子法',
    xWing: '二连纵横阵',
    swordfish: '三才游鱼阵'
  };
  for (const [tech, count] of techEntries) {
    const name = techNames[tech] || tech;
    const bar = '█'.repeat(Math.round(count / maxTechCount * 25));
    console.log('    ' + String(name).padEnd(8, '　') + count.toString().padStart(5) + '  ' + bar);
  }

  if (report.errorLevels.length > 0) {
    console.log('\n  错误关卡 (' + report.errorLevels.length + '):');
    for (const err of report.errorLevels) {
      console.log('    [' + err.levelId + '] ' + err.title);
      for (const e of err.errors) {
        console.log('      - ' + e);
      }
    }
  }

  if (report.unsolvableLevels.length > 0) {
    console.log('\n  未完全解出的关卡 (' + report.unsolvableLevels.length + '):');
    for (const lv of report.unsolvableLevels) {
      console.log('    [' + lv.levelId + '] ' + lv.title +
        ' (剩余 ' + lv.remainingCells + ' 格)');
    }
  }

  if (report.warningLevels.length > 0) {
    console.log('\n  警告关卡 (' + report.warningLevels.length + '):');
    for (const w of report.warningLevels.slice(0, 10)) {
      console.log('    [' + w.levelId + '] ' + w.title);
      for (const warn of w.warnings) {
        console.log('      - ' + warn);
      }
    }
    if (report.warningLevels.length > 10) {
      console.log('    ... 还有 ' + (report.warningLevels.length - 10) + ' 个警告关卡');
    }
  }

  console.log(line);
}

// ============================================================
//  生成 Markdown 报告
// ============================================================

function generateMarkdownReport(report, elapsed) {
  const lines = [];
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  lines.push('# 关卡验证报告');
  lines.push('');
  lines.push('> 生成时间: ' + now);
  lines.push('> 验证工具: LevelValidator + TechRater');
  lines.push('> 验证耗时: ' + elapsed + ' ms');
  lines.push('');

  // --- 一、总览 ---
  lines.push('## 一、总览');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push('| 总关卡数 | ' + report.totalLevels + ' |');
  lines.push('| 通过关卡数 | ' + report.totalPassed + ' (' + report.passRate + '%) |');
  lines.push('| 可解关卡数 | ' + report.totalSolvable + ' (' + report.solvableRate + '%) |');
  lines.push('| 错误关卡数 | ' + report.totalErrors + ' |');
  lines.push('| 警告关卡数 | ' + report.totalWarnings + ' |');
  lines.push('');

  // --- 二、按章节统计 ---
  lines.push('## 二、按章节统计');
  lines.push('');
  lines.push('| 章节 | 标题 | 关卡数 | 通过 | 可解 | 错误 | 警告 | 平均难度分 | 最高技巧等级 |');
  lines.push('|------|------|--------|------|------|------|------|------------|-------------|');
  for (const ch of report.chapterResults) {
    const passRate = ch.total > 0 ? Math.round(ch.passed / ch.total * 100) : 0;
    const solvRate = ch.total > 0 ? Math.round(ch.solvables / ch.total * 100) : 0;
    lines.push(
      '| ' + ch.chapterId +
      ' | ' + ch.title +
      ' | ' + ch.total +
      ' | ' + ch.passed + ' (' + passRate + '%)' +
      ' | ' + ch.solvables + ' (' + solvRate + '%)' +
      ' | ' + ch.errors +
      ' | ' + ch.warnings +
      ' | ' + ch.avgScore +
      ' | Lv.' + ch.maxTechLevel +
      ' |'
    );
  }
  lines.push('');

  // --- 三、难度分布 ---
  lines.push('## 三、难度分布');
  lines.push('');
  lines.push('| 难度 | 关卡数 | 占比 |');
  lines.push('|------|--------|------|');
  for (const level of ['1星', '2星', '3星', '4星', '5星']) {
    const count = report.levelDistribution[level] || 0;
    const pct = report.totalLevels > 0
      ? Math.round(count / report.totalLevels * 1000) / 10
      : 0;
    lines.push('| ' + level + ' | ' + count + ' | ' + pct + '% |');
  }
  lines.push('');

  // --- 四、技巧使用统计 ---
  lines.push('## 四、技巧使用统计');
  lines.push('');
  lines.push('| 技巧 | 总使用次数 | 出现关数 |');
  lines.push('|------|-----------|----------|');
  const techNames = {
    nakedSingle: '孤星 (Naked Single)',
    cageUnique: '唯一组合 (Cage Unique)',
    hiddenSingle: '隐曜 (Hidden Single)',
    rule45: '星衡法则 (45 Rule)',
    nakedPair: '并蒂锁 (Naked Pair)',
    hiddenPair: '双曜 (Hidden Pair)',
    pointingClaiming: '区块排除 (Pointing/Claiming)',
    nakedTriplet: '三子法 (Naked Triplet)',
    xWing: '二连纵横阵 (X-Wing)',
    swordfish: '三才游鱼阵 (Swordfish)'
  };

  // 统计每个技巧出现在多少关
  const techLevelCount = {};
  for (const ch of report.chapterResults) {
    for (const lr of ch.levelResults) {
      if (lr.rating && lr.rating.techCount) {
        for (const tech of Object.keys(lr.rating.techCount)) {
          techLevelCount[tech] = (techLevelCount[tech] || 0) + 1;
        }
      }
    }
  }

  const sortedTechs = Object.entries(report.techCount).sort((a, b) => b[1] - a[1]);
  for (const [tech, count] of sortedTechs) {
    const name = techNames[tech] || tech;
    const levelCount = techLevelCount[tech] || 0;
    lines.push('| ' + name + ' | ' + count + ' | ' + levelCount + ' |');
  }
  lines.push('');

  // --- 五、错误列表 ---
  lines.push('## 五、错误列表');
  lines.push('');
  if (report.errorLevels.length === 0) {
    lines.push('_无错误关卡_');
  } else {
    for (const err of report.errorLevels) {
      lines.push('### ' + err.levelId + ' - ' + err.title);
      lines.push('');
      lines.push('**章节**: 第' + err.chapterId + '章 ' + err.chapterTitle);
      lines.push('');
      lines.push('**错误**:');
      for (const e of err.errors) {
        lines.push('- ' + e);
      }
      lines.push('');
    }
  }
  lines.push('');

  // --- 六、警告列表 ---
  lines.push('## 六、警告列表');
  lines.push('');
  if (report.warningLevels.length === 0) {
    lines.push('_无警告关卡_');
  } else {
    for (const w of report.warningLevels) {
      lines.push('### ' + w.levelId + ' - ' + w.title);
      lines.push('');
      lines.push('**章节**: 第' + w.chapterId + '章 ' + w.chapterTitle);
      lines.push('');
      lines.push('**警告**:');
      for (const warn of w.warnings) {
        lines.push('- ' + warn);
      }
      lines.push('');
    }
  }
  lines.push('');

  // --- 七、未完全解出的关卡 ---
  lines.push('## 七、未完全解出的关卡');
  lines.push('');
  if (report.unsolvableLevels.length === 0) {
    lines.push('_所有关卡均可完全解出_');
  } else {
    lines.push('以下关卡使用现有 10 种技巧无法完全解出：');
    lines.push('');
    lines.push('| 关卡ID | 标题 | 章节 | 盘面尺寸 | 剩余空格 |');
    lines.push('|--------|------|------|----------|----------|');
    for (const lv of report.unsolvableLevels) {
      lines.push(
        '| ' + lv.levelId +
        ' | ' + lv.title +
        ' | 第' + lv.chapterId + '章 ' + lv.chapterTitle +
        ' | ' + lv.gridSize + '×' + lv.gridSize +
        ' | ' + lv.remainingCells +
        ' |'
      );
    }
  }
  lines.push('');

  // --- 八、各关卡详细结果 ---
  lines.push('## 八、各关卡详细结果');
  lines.push('');
  for (const ch of report.chapterResults) {
    lines.push('### 第' + ch.chapterId + '章 ' + ch.title);
    lines.push('');
    lines.push('| 关卡ID | 标题 | 尺寸 | 难度标签 | 评级 | 分数 | 最高技巧 | 步数 | 可解 | 状态 |');
    lines.push('|--------|------|------|----------|------|------|----------|------|------|------|');
    for (const lr of ch.levelResults) {
      const rating = lr.rating || {};
      const level = rating.level || '-';
      const score = rating.score !== undefined ? rating.score : '-';
      const maxTech = rating.maxTechLevel ? 'Lv.' + rating.maxTechLevel : '-';
      const steps = rating.totalSteps !== undefined ? rating.totalSteps : '-';
      const solvable = lr.solvable ? '是' : '否';
      let status = '通过';
      if (lr.errors.length > 0) status = '错误';
      else if (lr.warnings.length > 0) status = '警告';
      lines.push(
        '| ' + lr.levelId +
        ' | ' + lr.title +
        ' | ' + lr.gridSize + '×' + lr.gridSize +
        ' | ' + (lr.difficulty || '-') +
        ' | ' + level +
        ' | ' + score +
        ' | ' + maxTech +
        ' | ' + steps +
        ' | ' + solvable +
        ' | ' + status +
        ' |'
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*报告由 LevelValidator 自动生成*');

  return lines.join('\n');
}

// ============================================================
//  工具函数
// ============================================================

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
