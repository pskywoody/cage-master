// ============================================================
//  batch-analyze.js - 教学有效性批量汇总（2026-08-04）
// ============================================================
//  读取 novice-teach-drive.js 输出（含 results 数组），逐关生成
//  教学分析报告，汇总为 Markdown（每关评分/阻滞点/共性问题/建议/通过率）。
//
//  用法：
//    node scripts/batch-analyze.js --input reports/novice-101-108.json --output reports/summary-report.md
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateReport } from './analyze-teach.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const opt = { input: null, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input') opt.input = args[++i];
    else if (args[i] === '--output') opt.output = args[++i];
  }
  return opt;
}

function esc(v) { return String(v == null ? '—' : v); }

function buildMarkdown(driver, reports) {
  const lines = [];
  lines.push('# 教学有效性总结报告');
  lines.push('');
  lines.push(`> 数据源：${driver.driver || 'novice-teach-drive'} · 生成时间：${driver.timestamp || new Date().toISOString()}`);
  lines.push(`> 参数：accuracy=${driver.accuracy} drift=${driver.drift}`);
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push('| 关卡 | 目标合理性 | 完成度 | 合法性 | 总分 | 阻滞数 | 错误模式 | 结论 |');
  lines.push('|------|-----------|--------|--------|------|--------|---------|------|');

  const commonBlockages = new Map();
  const commonErrorReasons = new Map();
  let pass = 0, warn = 0, fail = 0;

  for (const g of reports) {
    const s = g.summary;
    const blockCount = g.blockages.length;
    if (s.totalScore >= 85) pass++;
    else if (s.totalScore >= 65) warn++;
    else fail++;
    const err = g.errors || { blockers: 0, confusions: 0, explorations: 0 };
    const errStr = `阻${err.blockers}/混${err.confusions}/探${err.explorations}`;
    lines.push(`| ${g.levelId} | ${s.targetScore} | ${s.completionScore} | ${s.legalityScore} | ${s.totalScore} | ${blockCount} | ${errStr} | ${g.verdict} |`);
    for (const b of g.blockages) {
      const k = b.type + ':' + b.suggestion;
      commonBlockages.set(k, (commonBlockages.get(k) || 0) + 1);
    }
    for (const d of (err.details || [])) {
      if (d.severity === 'high') {
        const k = d.reason;
        commonErrorReasons.set(k, (commonErrorReasons.get(k) || 0) + 1);
      }
    }
  }

  lines.push('');
  lines.push('## 共性问题');
  lines.push('');
  const common = Array.from(commonBlockages.entries()).sort((a, b) => b[1] - a[1]);
  if (common.length === 0) lines.push('无跨关共性阻滞点。');
  else {
    common.forEach(([k, n]) => {
      const [type, suggestion] = k.split(':');
      lines.push(`- **${type}**（${n} 关）：${suggestion}`);
    });
  }
  if (commonErrorReasons.size > 0) {
    lines.push('');
    lines.push('### 高严重错误模式（blocker）');
    Array.from(commonErrorReasons.entries()).sort((a, b) => b[1] - a[1]).forEach(([reason, n]) => {
      lines.push(`- 🔴 ${reason}（${n} 关）`);
    });
  }

  lines.push('');
  lines.push('## 建议修复');
  lines.push('');
  const allRecs = new Set();
  reports.forEach((g) => g.recommendations.forEach((r) => allRecs.add(r)));
  if (allRecs.size === 0) lines.push('无建议。');
  else Array.from(allRecs).forEach((r) => lines.push(`- ${r}`));

  lines.push('');
  lines.push('## 整体评分');
  lines.push('');
  const total = reports.length || 1;
  lines.push(`- 通过：${pass}/${reports.length}`);
  lines.push(`- 警告：${warn}/${reports.length}`);
  lines.push(`- 不通过：${fail}/${reports.length}`);
  const avgTotal = Math.round(reports.reduce((s, g) => s + g.summary.totalScore, 0) / total);
  lines.push(`- **教学系统有效性：${avgTotal}%**`);
  lines.push('');
  return lines.join('\n');
}

// ---- 主流程 ----
const opt = parseArgs();
if (!opt.input) {
  console.error('用法: node scripts/batch-analyze.js --input <novice-report.json> --output <summary.md>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.resolve(opt.input), 'utf8'));
const results = data.results || [];
const reports = results
  .filter((r) => r.record)
  .map((r) => generateReport(Object.assign({ status: r.status }, r.record)));

const md = buildMarkdown(data, reports);
if (opt.output) {
  const out = path.resolve(opt.output);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, md, 'utf8');
  console.log('汇总报告已保存: ' + out);
} else {
  console.log(md);
}
