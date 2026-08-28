// scripts/validate-teaching-demo.js
// TeachingDemoResolver 的 E2E 校验（Node，只读，不修改生产数据）。
// 运行：node scripts/validate-teaching-demo.js

import fs from 'fs';
import '../core/tech-rater.js';
import { HeadlessEngine } from '../core/headless-engine.js';
import { resolveTeachingDemo } from '../core/lesson-demo-builder.js';

const base = 'data/levels/';
let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log('  ✓', name);
  } else {
    console.log('  ✗', name);
    failures++;
  }
}

function load(id) {
  const levelData = JSON.parse(fs.readFileSync(`${base}level-${id}.json`, 'utf8'));
  const engine = new HeadlessEngine(levelData.gridSize || 9);
  engine.loadLevel(levelData);
  return { engine, levelData };
}

console.log('E2E: Teaching Demo Necessity Alignment');

// Case 1: 目标技巧可用 → 选中目标技巧，无 fallback，证据完整
{
  const { engine, levelData } = load(305); // nakedPair
  const r = resolveTeachingDemo({ engine, levelData });
  check('Case1 305 目标 nakedPair 被选中', r.resolvedTechnique === 'nakedPair' && r.fallback === false);
  check('Case1 305 证据完整', r.evidenceComplete === true);
}

// Case 2: nakedSingle 抢占 —— 目标 hiddenPair 可用时选中 hiddenPair，而非 nakedSingle
{
  const { engine, levelData } = load(403); // hiddenPair
  const r = resolveTeachingDemo({ engine, levelData });
  check('Case2 403 目标 hiddenPair 被选中（不降级 nakedSingle）', r.resolvedTechnique === 'hiddenPair' && r.fallback === false);
}

// Case 3: 目标技巧不可用 → fallback + 明确原因
{
  const { engine, levelData } = load(404); // nakedTriplet，开局不可用
  const r = resolveTeachingDemo({ engine, levelData });
  check('Case3 404 nakedTriplet 回退且原因明确', r.fallback === true && r.fallbackReason === 'technique_unavailable');
}

// Case 4: rule45 目标有真实 evidence 时如实产出（不伪造）
// 注：原 204 关已改为「找内鬼」(traitor_hunt_6x6，无 boardData)，改用 203 作为 rule45 样本
{
  const { engine, levelData } = load(203); // rule45
  const r = resolveTeachingDemo({ engine, levelData });
  check('Case4 203 rule45 有真实 evidence（evidenceComplete 只随真实证据为真）', r.fallback === false && r.evidenceComplete === true && r.deduction && r.deduction.evidence);
}

// Case 5: 复杂 cage/rule45 → TechRater 事实 → Resolver → actions
{
  const { engine, levelData } = load(504); // rule45 多宫星衡
  const r = resolveTeachingDemo({ engine, levelData });
  check('Case5 504 rule45 产出 demo actions', r.resolvedTechnique === 'rule45' && Array.isArray(r.actions) && r.actions.length > 0);
}

// Case 6: 手写叙事关（composite）保留作者意图，不强制 auto
{
  const { engine, levelData } = load(109); // composite
  const r = resolveTeachingDemo({ engine, levelData });
  check('Case6 109 composite 回退手写（no_target_technique）', r.fallback === true && r.fallbackReason === 'no_target_technique' && !r.actions);
}

console.log('');
if (failures > 0) {
  console.log(`FAILED: ${failures} assertions`);
  process.exit(1);
} else {
  console.log('PASS: all teaching-demo E2E assertions');
}