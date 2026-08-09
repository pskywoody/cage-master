// ============================================================
//  ai-free-solve.js - 无约束独立求解测试（2026-08-03）
// ============================================================
//  验证在没有教学约束的情况下，AI 是否能独立解出数独。
//  两种模式：
//    NATURAL: 使用 TechRater 默认优先级（最低技巧优先）
//    TARGET_FIRST: 先尝试教学目标技巧，再降级到自然求解
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- 预加载 TechRater ----
await import('../core/tech-rater.js');
if (!globalThis.TechRater) {
  console.error('TechRater 未挂载到全局');
  process.exit(1);
}

// ---- 加载模块 ----
import { HeadlessEngine } from '../core/headless-engine.js';
import { HintSystem } from '../expert/hint-system.js';

// ============================================================
//  教学目标关键词 -> 技巧ID 映射（与 ai-tech-verify.js 一致）
// ============================================================
const TECH_MAP = [
  { keyword: '二连纵横阵', techId: 'xWing' },
  { keyword: '三才游鱼阵', techId: 'swordfish' },
  { keyword: '区块排除', techId: 'pointingClaiming' },
  { keyword: '三数连锁', techId: 'nakedTriplet' },
  { keyword: '三链之阵', techId: 'nakedTriplet' },
  { keyword: '三子法', techId: 'nakedTriplet' },
  { keyword: '隐性唯一', techId: 'hiddenSingle' },
  { keyword: '隐曜', techId: 'hiddenSingle' },
  { keyword: '隐单', techId: 'hiddenSingle' },
  { keyword: '唯一组合', techId: 'cageUnique' },
  { keyword: '笼子唯一', techId: 'cageUnique' },
  { keyword: '笼内排除', techId: 'cageUnique' },
  { keyword: '嵌套笼', techId: 'cageUnique' },
  { keyword: '异形笼', techId: 'cageUnique' },
  { keyword: '复合笼', techId: 'cageUnique' },
  { keyword: '大笼', techId: 'cageUnique' },
  { keyword: '星衡法则', techId: 'rule45' },
  { keyword: '45法则', techId: 'rule45' },
  { keyword: '10法则', techId: 'rule45' },
  { keyword: '差值之术', techId: 'rule45' },
  { keyword: '内外玄机', techId: 'rule45' },
  { keyword: '并蒂锁', techId: 'nakedPair' },
  { keyword: '数对之锁', techId: 'nakedPair' },
  { keyword: '数对占位', techId: 'nakedPair' },
  { keyword: '数对', techId: 'nakedPair' },
  { keyword: '双曜', techId: 'hiddenPair' },
  { keyword: '隐性之钥', techId: 'hiddenPair' },
  { keyword: '隐数对', techId: 'hiddenPair' },
  { keyword: '裸单', techId: 'nakedSingle' },
  { keyword: '孤星', techId: 'nakedSingle' },
  { keyword: '笔记入门', techId: 'nakedSingle' },
  { keyword: '笔记', techId: 'nakedSingle' },
  { keyword: 'X-Wing', techId: 'xWing' },
  { keyword: 'Swordfish', techId: 'swordfish' },
  { keyword: '十字交叉', techId: 'xWing' },
  { keyword: '终局', techId: 'nakedSingle' },
  { keyword: '星衡', techId: 'rule45' },
];

function mapTeachingGoal(goal) {
  if (!goal) return null;
  for (const { keyword, techId } of TECH_MAP) {
    if (goal.includes(keyword)) return techId;
  }
  return null;
}

function isReviewLevel(goal) {
  if (!goal) return true;
  return goal.includes('综合') || goal.includes('试炼') || goal.includes('测试') || goal.includes('大师');
}

// ============================================================
//  模式1：NATURAL - 无约束自然求解
//  使用 TechRater 默认优先级，模拟玩家自然解题行为
// ============================================================
async function runNaturalSolve(levelId, levelData) {
  const engine = new HeadlessEngine(9);
  engine.loadLevel(levelData);
  const solution = levelData.solution;

  const techSequence = [];
  let step = 0;
  let errors = 0;
  const maxSteps = 500;

  while (step < maxSteps) {
    const state = engine.getState();
    // 检测是否完成
    if (state.validation && state.validation.isComplete) {
      return { status: 'passed', steps: step, errors, techSequence };
    }

    // 创建 TechRater 求解
    const board = engine.getBoard();
    const TR = globalThis.TechRater;
    const techRater = new TR(board);
    const next = techRater.findNextStep();

    if (!next) {
      return { status: 'stuck', steps: step, errors, techSequence, reason: '无可用技巧' };
    }

    // 记录技巧使用
    techSequence.push({
      step,
      technique: next.technique,
      techniqueName: next.techniqueName,
      row: next.row,
      col: next.col,
      num: next.num,
    });

    // 填数
    const result = engine.fillCell(next.row, next.col, next.num);
    if (!result.success) {
      errors++;
      const val = solution[next.row]?.[next.col];
      if (val !== undefined) {
        engine.eraseCell(next.row, next.col);
        const r2 = engine.fillCell(next.row, next.col, val);
        if (!r2.success) errors++;
      }
    }

    step++;
  }

  return { status: 'timeout', steps: step, errors, techSequence, reason: '达到最大步数' };
}

// ============================================================
//  模式2：TARGET_FIRST - 先尝试教学目标技巧
//  模拟"刚学会新技巧的玩家，优先尝试使用它"
// ============================================================
async function runTargetFirstSolve(levelId, levelData, targetTechId) {
  const engine = new HeadlessEngine(9);
  engine.loadLevel(levelData);
  const solution = levelData.solution;

  const techSequence = [];
  let step = 0;
  let errors = 0;
  let targetUsed = false;
  let targetFirstUsedStep = -1;
  let targetElimRecorded = false; // elimination 只展示一次，避免死循环
  const maxSteps = 500;

  while (step < maxSteps) {
    const state = engine.getState();
    if (state.validation && state.validation.isComplete) {
      return {
        status: 'passed', steps: step, errors, techSequence,
        targetUsed, targetFirstUsedStep,
      };
    }

    const board = engine.getBoard();
    const TR = globalThis.TechRater;
    const techRater = new TR(board);

    let next = null;

    // 先尝试目标技巧（如果还没用过，或者技巧可用）
    if (targetTechId) {
      const origPriority = techRater.techPriority;
      techRater.techPriority = [targetTechId];
      const targetStep = techRater.findNextStep();
      techRater.techPriority = origPriority;
      if (targetStep && targetStep.technique === targetTechId) {
        if (targetStep.type === 'elimination') {
          // elimination：首次展示记录一次（教学），之后降级自然求解避免死循环
          if (!targetElimRecorded) {
            targetElimRecorded = true;
            targetUsed = true;
            targetFirstUsedStep = step;
            techSequence.push({
              step,
              technique: targetStep.technique,
              techniqueName: targetStep.techniqueName,
              row: targetStep.row,
              col: targetStep.col,
              num: targetStep.num,
              isTargetTechnique: true,
              type: 'elimination',
            });
          }
          // 不设置 next，降级到自然求解
        } else {
          next = targetStep;
          if (!targetUsed) {
            targetUsed = true;
            targetFirstUsedStep = step;
          }
        }
      }
    }

    // 如果目标技巧不可用，降级到自然求解
    if (!next) {
      next = techRater.findNextStep();
    }

    if (!next) {
      return {
        status: 'stuck', steps: step, errors, techSequence,
        targetUsed, targetFirstUsedStep, reason: '无可用技巧',
      };
    }



    techSequence.push({
      step,
      technique: next.technique,
      techniqueName: next.techniqueName,
      row: next.row,
      col: next.col,
      num: next.num,
      isTargetTechnique: next.technique === targetTechId,
    });

    const result = engine.fillCell(next.row, next.col, next.num);
    if (!result.success) {
      errors++;
      const val = solution[next.row]?.[next.col];
      if (val !== undefined) {
        engine.eraseCell(next.row, next.col);
        engine.fillCell(next.row, next.col, val);
      }
    }

    step++;
  }

  return {
    status: 'timeout', steps: step, errors, techSequence,
    targetUsed, targetFirstUsedStep, reason: '达到最大步数',
  };
}

// ============================================================
//  加载关卡
// ============================================================
async function loadLevel(levelId) {
  const filePath = path.join(__dirname, '../data/levels', `level-${levelId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ============================================================
//  主入口
// ============================================================
const args = process.argv.slice(2);
let levelRange = 'all';
let mode = 'both'; // natural, target-first, both
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--levels') levelRange = args[++i];
  else if (args[i] === '--mode') mode = args[++i];
}

const allLevels = fs.readdirSync(path.join(__dirname, '../data/levels'))
  .filter(f => f.startsWith('level-') && f.endsWith('.json'))
  .map(f => parseInt(f.replace('level-', '').replace('.json', ''), 10))
  .filter(id => id >= 100 && id < 800)
  .sort((a, b) => a - b);

let levelIds = allLevels;
if (levelRange !== 'all') {
  const parts = levelRange.split('-').map(Number);
  if (parts.length === 1) levelIds = [parts[0]];
  else {
    levelIds = [];
    for (let i = parts[0]; i <= parts[1]; i++) levelIds.push(i);
  }
}

console.log('='.repeat(100));
console.log('  AI 无约束独立求解测试');
console.log('='.repeat(100));
console.log(`关卡数: ${levelIds.length}`);
console.log(`模式: ${mode}`);
console.log('');

const results = [];

for (const id of levelIds) {
  const levelData = await loadLevel(id);
  if (!levelData) {
    console.log(`[${id}] 关卡数据不存在`);
    continue;
  }

  const goal = levelData.teachingGoal || '';
  const targetTechId = mapTeachingGoal(goal);
  const isReview = isReviewLevel(goal);
  const TR = globalThis.TechRater;

  console.log(`[${id}] ${levelData.title || ''} (${levelData.gridSize||9}x${levelData.gridSize||9} ${levelData.difficulty||''})`);
  console.log(`  教学目标: ${targetTechId ? TR.getTechniqueName(targetTechId) + '(' + targetTechId + ')' : '无'}`);

  const levelResult = {
    levelId: id,
    title: levelData.title || '',
    gridSize: levelData.gridSize || 9,
    difficulty: levelData.difficulty || '',
    teachingGoal: goal,
    targetTechId,
    isReview,
  };

  // 模式1：自然求解
  if (mode === 'both' || mode === 'natural') {
    console.log(`  模式[NATURAL]...`);
    const naturalResult = await runNaturalSolve(id, levelData);
    levelResult.natural = naturalResult;
    const techDist = {};
    if (naturalResult.techSequence) {
      for (const t of naturalResult.techSequence) {
        techDist[t.technique] = (techDist[t.technique] || 0) + 1;
      }
    }
    const distStr = Object.entries(techDist)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    console.log(`    结果:${naturalResult.status} 步数:${naturalResult.steps} 错误:${naturalResult.errors}`);
    console.log(`    技巧分布: ${distStr}`);
  }

  // 模式2：目标技巧优先
  if ((mode === 'both' || mode === 'target-first') && targetTechId && !isReview) {
    console.log(`  模式[TARGET_FIRST]...`);
    const targetResult = await runTargetFirstSolve(id, levelData, targetTechId);
    levelResult.targetFirst = targetResult;
    const techDist = {};
    for (const t of targetResult.techSequence) {
      techDist[t.technique] = (techDist[t.technique] || 0) + 1;
    }
    const distStr = Object.entries(techDist)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    console.log(`    结果:${targetResult.status} 步数:${targetResult.steps} 错误:${targetResult.errors}`);
    console.log(`    目标技巧首次使用:${targetResult.targetFirstUsedStep >= 0 ? '第'+targetResult.targetFirstUsedStep+'步 ✓' : '从未使用 ✗'}`);
    console.log(`    技巧分布: ${distStr}`);
  }

  results.push(levelResult);
  console.log('');
}

// ===== 汇总 =====
console.log('='.repeat(100));
console.log('汇总');
console.log('='.repeat(100));

const naturalResults = results.filter(r => r.natural);
const targetResults = results.filter(r => r.targetFirst);

if (naturalResults.length > 0) {
  const passed = naturalResults.filter(r => r.natural.status === 'passed').length;
  const stuck = naturalResults.filter(r => r.natural.status === 'stuck').length;
  console.log(`\n[NATURAL] 自然求解模式:`);
  console.log(`  通过: ${passed}/${naturalResults.length} (${(passed/naturalResults.length*100).toFixed(1)}%)`);
  console.log(`  卡住: ${stuck}/${naturalResults.length}`);
  // 统计技巧使用
  const allTechs = {};
  for (const r of naturalResults) {
    for (const t of r.natural.techSequence || []) {
      allTechs[t.technique] = (allTechs[t.technique] || 0) + 1;
    }
  }
  console.log(`  技巧使用汇总:`);
  for (const [tech, count] of Object.entries(allTechs).sort((a, b) => b[1] - a[1])) {
    const name = globalThis.TechRater.getTechniqueName(tech);
    console.log(`    ${name}(${tech}): ${count}次`);
  }
}

if (targetResults.length > 0) {
  const passed = targetResults.filter(r => r.targetFirst.status === 'passed').length;
  const stuck = targetResults.filter(r => r.targetFirst.status === 'stuck').length;
  const targetUsed = targetResults.filter(r => r.targetFirst.targetUsed).length;
  console.log(`\n[TARGET_FIRST] 目标技巧优先模式:`);
  console.log(`  通过: ${passed}/${targetResults.length} (${(passed/targetResults.length*100).toFixed(1)}%)`);
  console.log(`  卡住: ${stuck}/${targetResults.length}`);
  console.log(`  目标技巧被使用: ${targetUsed}/${targetResults.length} (${(targetUsed/targetResults.length*100).toFixed(1)}%)`);

  // 列出未使用目标技巧的关卡
  const notUsed = targetResults.filter(r => !r.targetFirst.targetUsed);
  if (notUsed.length > 0) {
    console.log(`\n  目标技巧未使用的关卡:`);
    for (const r of notUsed) {
      const name = globalThis.TechRater.getTechniqueName(r.targetTechId);
      console.log(`    [${r.levelId}] ${r.title} -> ${name}(${r.targetTechId})`);
    }
  }
}

// 保存报告
const report = {
  timestamp: new Date().toISOString(),
  mode,
  totalLevels: results.length,
  results: results.map(r => ({
    levelId: r.levelId,
    title: r.title,
    gridSize: r.gridSize,
    difficulty: r.difficulty,
    teachingGoal: r.teachingGoal,
    targetTechId: r.targetTechId,
    isReview: r.isReview,
    natural: r.natural ? {
      status: r.natural.status,
      steps: r.natural.steps,
      errors: r.natural.errors,
      techDistribution: countTechs(r.natural.techSequence),
    } : null,
    targetFirst: r.targetFirst ? {
      status: r.targetFirst.status,
      steps: r.targetFirst.steps,
      errors: r.targetFirst.errors,
      targetUsed: r.targetFirst.targetUsed,
      targetFirstUsedStep: r.targetFirst.targetFirstUsedStep,
      techDistribution: countTechs(r.targetFirst.techSequence),
    } : null,
  })),
};
fs.writeFileSync(path.join(__dirname, '../reports/free-solve-report.json'), JSON.stringify(report, null, 2));
console.log(`\n报告已保存: reports/free-solve-report.json`);

function countTechs(seq) {
  if (!seq) return {};
  const dist = {};
  for (const t of seq) {
    dist[t.technique] = (dist[t.technique] || 0) + 1;
  }
  return dist;
}