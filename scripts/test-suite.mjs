// scripts/test-suite.mjs
// 统一自动化测试入口：聚合核心校验/评估脚本，跑一遍并汇总 PASS/FAIL。
// 用法：
//   node scripts/test-suite.mjs            跑全部（blocking 失败则 exit 1）
//   node scripts/test-suite.mjs --quick    只跑核心 gate
//   node scripts/test-suite.mjs --list     列出所有 gate
// 设计：blocking gate 失败 → 整体非零退出；advisory gate 只报告不阻断。
// 评估类脚本统一输出到临时目录，避免污染已入库产物。

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO = path.resolve('.');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm4-test-'));

// 每个 gate：name / cmd / args / blocking / outDir(可选，写入临时目录)
const GATES = [
  { name: 'levels',            cmd: 'scripts/validate-levels.js',                 blocking: true,  quick: true },
  { name: 'chapter-arc',       cmd: 'scripts/validate-chapter-arc.js',            blocking: true,  quick: true },
  { name: 'teaching-demo',     cmd: 'scripts/validate-teaching-demo.js',          blocking: true,  quick: true },
  { name: 'teaching-demo-prod',cmd: 'scripts/validate-teaching-demo-production.js', blocking: true, quick: true, args: [path.join(tmp, 'tdp-traces')] },
  { name: 'boss-solutions',    cmd: 'scripts/validate-boss-solutions.js',         blocking: true,  quick: true },
  { name: 'i18n',              cmd: 'scripts/validate-i18n.js',                   blocking: true,  quick: true },
  { name: 'references',        cmd: 'scripts/validate-references.js',             blocking: true,  quick: true },
  { name: 'solvability',       cmd: 'scripts/indep-verify-levels.mjs',            blocking: true,  quick: true },
  { name: 'free-mode-levels',  cmd: 'scripts/validate-free-mode-levels.mjs',      blocking: false },
  { name: 'learner-model',     cmd: 'scripts/validate-learner-model.js',          blocking: false },
  { name: 'learner-state-eval',cmd: 'scripts/learner-state-eval.mjs',             blocking: false, args: [path.join(tmp, 'lsc')] },
  { name: 'boundary-eval',     cmd: 'scripts/learner-state-boundary-eval.mjs',    blocking: false, args: [path.join(tmp, 'lsb')] },
  { name: 'experiment-eval',   cmd: 'scripts/evaluate-experiment.js',             blocking: false, args: ['samples/experiment/experiment-events.jsonl', path.join(tmp, 'exp-report.json')] },
  { name: 'runtime-replay',    cmd: 'scripts/experiment-runtime-replay.js',       blocking: false, args: ['samples/learner-events-sample.jsonl', 'data/teaching-ai-shadow/shadow-decisions.jsonl', path.join(tmp, 'rt-events.jsonl'), path.join(tmp, 'rt-report.json')] },
  { name: 'calibration-replay',cmd: 'scripts/teaching-ai-calibration-replay.mjs', blocking: false, args: ['samples/learner-events-sample.jsonl', path.join(tmp, 'calib')] },
];

const mode = process.argv[2] || '';
if (mode === '--list') {
  for (const g of GATES) console.log(`${g.blocking ? '[blocking]' : '[advisory]'} ${g.name.padEnd(20)} ${g.cmd}`);
  process.exit(0);
}
const onlyQuick = mode === '--quick';

function run(g) {
  const args = [...(g.args || [])];
  const res = spawnSync('node', [g.cmd, ...args], { cwd: REPO, encoding: 'utf8', timeout: 120000 });
  const out = (res.stdout || '') + (res.stderr || '');
  let status;
  if (res.error) status = 'ERROR';
  else if (res.status === 0) status = 'PASS';
  else status = 'FAIL';
  // 失败摘要：取最后一行非空输出
  const lastLine = out.trim().split('\n').filter(Boolean).slice(-1)[0] || '';
  return { status, code: res.status, note: status === 'PASS' ? '' : lastLine.slice(0, 120) };
}

const results = [];
let blockingFail = 0;
console.log(`CM4 test-suite → ${onlyQuick ? 'QUICK' : 'FULL'}  (临时输出: ${tmp})\n`);
for (const g of GATES) {
  if (onlyQuick && !g.quick) continue;
  const r = run(g);
  results.push({ name: g.name, blocking: g.blocking, ...r });
  const tag = r.status.padEnd(5);
  const mark = r.status === 'PASS' ? '✓' : (g.blocking ? '✗' : '!');
  console.log(`  ${mark} ${g.name.padEnd(20)} ${tag}${r.note ? '  ' + r.note : ''}`);
  if (r.status !== 'PASS' && g.blocking) blockingFail++;
}

const passed = results.filter((x) => x.status === 'PASS').length;
console.log(`\n汇总：${passed}/${results.length} 通过；blocking 失败 ${blockingFail}`);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

process.exit(blockingFail > 0 ? 1 : 0);