// ============================================================
//  ai-tech-verify.js - 教学目标技巧验证脚本（2026-08-03 v2）
// ============================================================
//  对每个关卡，验证教学目标中指定的技巧是否：
//   1. 在初始棋盘上可检测到（静态检测）
//   2. 在步进求解过程中某步骤可检测到（核心改进）
//   3. 在求解路径中实际出现（动态验证）
//   4. 证据结构是否完整（可被 HintAdapter 使用）
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

// ---- 加载 HeadlessEngine ----
import { HeadlessEngine } from '../core/headless-engine.js';

// ============================================================
//  教学目标关键词 -> 技巧ID 映射
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

// ============================================================
//  各技巧的证据结构要求
// ============================================================
const EVIDENCE_SCHEMA = {
  nakedSingle:      { required: [], optional: ['eliminated'] },
  cageUnique:       { required: ['cageId'], optional: ['combos', 'cageCells'] },
  hiddenSingle:     { required: ['scopeType', 'scopeIndex'], optional: ['eliminatedCells'] },
  rule45:           { required: ['scopeType', 'scopeIndex'], optional: ['inwardValue', 'outwardValue', 'diff'] },
  nakedPair:        { required: ['pairValues', 'scopeType', 'scopeIndex'], optional: ['eliminatedCells'] },
  hiddenPair:       { required: ['pairValues', 'scopeType', 'scopeIndex'], optional: ['eliminatedCells'] },
  pointingClaiming: { required: ['scopeType', 'scopeIndex', 'eliminatedCells'], optional: ['direction', 'lineIndex'] },
  nakedTriplet:     { required: ['tripletValues', 'tripletCells', 'scopeType', 'scopeIndex'], optional: ['eliminatedCells'] },
  xWing:            { required: ['rows', 'cols', 'cells', 'num'], optional: ['eliminatedCells'] },
  swordfish:        { required: ['rows', 'cols', 'cells', 'num'], optional: ['eliminatedCells'] },
};

// ============================================================
//  各章节预期技巧
// ============================================================
const CHAPTER_TECH_MAP = {
  '1': ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45'],
  '2': ['rule45', 'nakedSingle'],
  '3': ['pointingClaiming', 'nakedPair', 'nakedSingle'],
  '4': ['hiddenSingle', 'hiddenPair', 'nakedTriplet', 'nakedSingle'],
  '5': ['cageUnique', 'rule45', 'nakedSingle'],
  '6': ['cageUnique', 'rule45', 'nakedSingle'],
  '7': ['nakedPair', 'hiddenPair', 'nakedTriplet', 'xWing', 'swordfish', 'nakedSingle'],
};

// ============================================================
//  工具函数
// ============================================================

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

function getChapterTechs(levelId) {
  const chapter = String(levelId).charAt(0);
  return CHAPTER_TECH_MAP[chapter] || null;
}

function validateEvidence(technique, evidence) {
  const schema = EVIDENCE_SCHEMA[technique];
  if (!schema) return { valid: true, missing: [], present: [] };
  const missing = schema.required.filter(f =>
    evidence === undefined || evidence === null ||
    evidence[f] === undefined || evidence[f] === null ||
    (Array.isArray(evidence[f]) && evidence[f].length === 0)
  );
  const present = schema.required.filter(f =>
    evidence && evidence[f] !== undefined && evidence[f] !== null &&
    !(Array.isArray(evidence[f]) && evidence[f].length === 0)
  );
  return { valid: missing.length === 0, missing, present };
}

// ============================================================
//  主验证函数
// ============================================================

async function verifyLevel(levelId) {
  const engine = new HeadlessEngine(9);
  const levelData = await loadLevel(levelId);
  if (!levelData) return null;

  const gridSize = levelData.gridSize || 9;
  engine.loadLevel(levelData);
  const board = engine.getBoard();
  const TR = globalThis.TechRater;
  const techRater = new TR(board);

  const goal = levelData.teachingGoal || '';
  const targetTechId = mapTeachingGoal(goal);
  const isReview = isReviewLevel(goal);
  const chapterTechs = getChapterTechs(levelId);

  // ---- 检查1：初始状态检测 ----
  let initialDetectable = null;
  if (targetTechId && !isReview) {
    try {
      const result = techRater._findAllByTechnique(targetTechId);
      initialDetectable = {
        detectable: result !== null && (Array.isArray(result) ? result.length > 0 : true),
        count: Array.isArray(result) ? result.length : (result ? 1 : 0),
      };
    } catch (e) {
      initialDetectable = { detectable: false, count: 0, error: e.message };
    }
  }

  // ---- 检查2：步进式重检测（核心改进） ----
  // 2026-08-03 v2：用 HeadlessEngine 逐步填数（正确的盘面推进），
  // 每步从 engine 取 Board 实例传给 TechRater 检测，elimination 步骤继续推进
  let stepByStepDetectable = null;
  if (targetTechId && !isReview) {
    const stepEngine = new HeadlessEngine(9);
    stepEngine.loadLevel(levelData);
    const checkResults = [];

    for (let s = 0; s < 500; s++) {
      const stepBoard = stepEngine.getBoard();
      const stepTR = new TR(stepBoard);

      // 检测当前盘面
      try {
        const result = stepTR._findAllByTechnique(targetTechId);
        const detectable = result !== null && (Array.isArray(result) ? result.length > 0 : true);
        const count = Array.isArray(result) ? result.length : (result ? 1 : 0);
        checkResults.push({
          step: s,
          detectable,
          count,
          boardState: s === 0 ? 'initial' : 'after_fill',
        });
      } catch (e) {
        checkResults.push({ step: s, detectable: false, count: 0, error: e.message });
      }

      // 下一步求解（用同一实例的 findNextStep 已修改候选，直接用 solve 步进）
      const next = stepTR.findNextStep();
      if (!next) break;

      // elimination 类型：不填数，下一轮重新检测（候选已由 findNextStep 应用）
      if (next.type === 'elimination') {
        // 排除类步骤也推进一步（重新从 engine 检测，模拟玩家手动排除后继续）
        continue;
      }

      // 填数推进 engine
      const res = stepEngine.fillCell(next.row, next.col, next.num);
      if (!res.success) {
        // 尝试用解答值修正（消除候选干扰）
        const solVal = levelData.solution && levelData.solution[next.row] ? levelData.solution[next.row][next.col] : null;
        if (solVal) {
          stepEngine.eraseCell(next.row, next.col);
          stepEngine.fillCell(next.row, next.col, solVal);
        } else {
          break;
        }
      }
    }

    const detectableSteps = checkResults.filter(d => d.detectable).map(d => d.step);
    stepByStepDetectable = {
      everDetectable: detectableSteps.length > 0,
      firstDetectableStep: detectableSteps.length > 0 ? detectableSteps[0] : -1,
      detectableSteps: detectableSteps.slice(0, 15),
      totalChecks: checkResults.length,
      // 初始不检测但后续某个步骤检测到：说明需要先填数
      delayedDetectable: (initialDetectable && !initialDetectable.detectable && detectableSteps.length > 0),
    };
  }

  // ---- 检查3：正常求解路径检测 ----
  const solveResult = techRater.solve(500);
  const steps = solveResult.steps || [];

  let techInSteps = null;
  if (targetTechId && !isReview) {
    const fillStep = steps.find(s => s.technique === targetTechId && s.type === 'fill');
    if (fillStep) {
      const evValid = validateEvidence(targetTechId, fillStep.evidence);
      techInSteps = {
        step: steps.indexOf(fillStep),
        row: fillStep.row,
        col: fillStep.col,
        num: fillStep.num,
        evidence: fillStep.evidence ? Object.keys(fillStep.evidence) : [],
        evidenceValid: evValid,
      };
    }
  }

  // ---- 检查4：技巧分布统计 ----
  const techDistribution = {};
  for (const step of steps) {
    if (step.type === 'fill') {
      techDistribution[step.technique] = (techDistribution[step.technique] || 0) + 1;
    }
  }

  // ---- 检查5：复习关卡检查各章节技巧 ----
  let reviewTechsFound = null;
  if (isReview && chapterTechs) {
    reviewTechsFound = [];
    for (const techId of chapterTechs) {
      const fillStep = steps.find(s => s.technique === techId && s.type === 'fill');
      reviewTechsFound.push({
        techId,
        techName: globalThis.TechRater.getTechniqueName(techId),
        found: !!fillStep,
        step: fillStep ? steps.indexOf(fillStep) : -1,
      });
    }
  }

  // ---- 检查6：所有关卡统一检查——初始棋盘上所有可检测技巧 ----
  const allInitialTechs = {};
  const allTechIds = ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45',
    'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet', 'xWing', 'swordfish'];
  for (const techId of allTechIds) {
    try {
      if (gridSize <= 4 && !TECH_PRIORITY_4.includes(techId)) continue;
      if (gridSize <= 6 && !TECH_PRIORITY_6.includes(techId)) continue;
      const result = techRater._findAllByTechnique(techId);
      const detectable = result !== null && (Array.isArray(result) ? result.length > 0 : true);
      const count = Array.isArray(result) ? result.length : (result ? 1 : 0);
      if (detectable) {
        allInitialTechs[techId] = { count };
      }
    } catch (e) {
      // 忽略未实现的技巧
    }
  }

  return {
    levelId,
    title: levelData.title || '',
    gridSize,
    difficulty: levelData.difficulty || '',
    teachingGoal: goal,
    targetTechId,
    isReview,
    initialDetectable,
    stepByStepDetectable,
    solveResult: {
      solvable: solveResult.solvable,
      totalSteps: steps.length,
      remainingCells: solveResult.remainingCells,
    },
    techInSteps,
    techDistribution,
    reviewTechsFound,
    allInitialTechs,
  };
}

async function loadLevel(levelId) {
  const filePath = path.join(__dirname, '../data/levels', `level-${levelId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const TECH_PRIORITY_4 = ['nakedSingle', 'hiddenSingle', 'nakedPair'];
const TECH_PRIORITY_6 = ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45', 'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet'];
const TECH_PRIORITY_9 = ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45', 'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet', 'xWing', 'swordfish'];

// ============================================================
//  主入口
// ============================================================

const args = process.argv.slice(2);
let levelRange = 'all';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--levels') levelRange = args[++i];
}

// 获取所有关卡
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

console.log('========================================');
console.log('  教学目标技巧验证 (v2 - 步进式检测)');
console.log('========================================');
console.log(`关卡数: ${levelIds.length}`);
console.log('');

const results = [];
for (const id of levelIds) {
  const res = await verifyLevel(id);
  if (res) results.push(res);
}

// ---- 打印详细报告 ----
console.log('='.repeat(100));
console.log('详细报告');
console.log('='.repeat(100));

let foundCount = 0;
let totalTargeted = 0;
let stepDetectableCount = 0;

for (const r of results) {
  const status = r.isReview ? '复习' : (r.techInSteps ? '✓' : '✗');
  const techName = r.targetTechId ? globalThis.TechRater.getTechniqueName(r.targetTechId) : '无';
  const initInfo = r.initialDetectable ?
    ` 初始:${r.initialDetectable.detectable ? '✓' : '✗'}(${r.initialDetectable.count})` : '';
  const solveInfo = r.techInSteps ?
    ` 第${r.techInSteps.step}步填(r${r.techInSteps.row},c${r.techInSteps.col})=${r.techInSteps.num}` : '';
  const evInfo = r.techInSteps?.evidenceValid ?
    (r.techInSteps.evidenceValid.valid ? ' 证据:✓' : ` 证据:✗(缺${r.techInSteps.evidenceValid.missing.join(',')})`) : '';
  const reviewInfo = r.reviewTechsFound ?
    ` 复习:${r.reviewTechsFound.filter(t=>t.found).length}/${r.reviewTechsFound.length}技巧` : '';
  const stepInfo = r.stepByStepDetectable ?
    ` 步进可检测:${r.stepByStepDetectable.everDetectable ? '✓' : '✗'}(首次第${r.stepByStepDetectable.firstDetectableStep}步,共${r.stepByStepDetectable.detectableSteps.length}次)` : '';
  const distInfo = Object.entries(r.techDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');

  console.log(`[${r.levelId}] ${r.title}`);
  console.log(`  目标:${techName}(${r.targetTechId||'无'}) | 求解路径:${status} | 求解:${r.solveResult.solvable ? '✓' : '✗'} | ${r.gridSize}x${r.gridSize} ${r.difficulty}`);
  console.log(`  ${initInfo}${stepInfo}${solveInfo}${evInfo}${reviewInfo}`);
  console.log(`  技巧分布: ${distInfo}`);
  console.log('');

  if (r.targetTechId && !r.isReview) {
    totalTargeted++;
    if (r.techInSteps) foundCount++;
    if (r.stepByStepDetectable && r.stepByStepDetectable.everDetectable) stepDetectableCount++;
  }
}

// ---- 打印汇总 ----
console.log('='.repeat(100));
console.log('汇总');
console.log('='.repeat(100));
console.log(`总关卡: ${results.length}`);
console.log(`有明确教学目标: ${totalTargeted}`);
console.log(`目标技巧在求解路径中出现: ${foundCount}/${totalTargeted} (${totalTargeted > 0 ? (foundCount/totalTargeted*100).toFixed(1) : 0}%)`);
console.log(`目标技巧在步进检测中可检测: ${stepDetectableCount}/${totalTargeted} (${totalTargeted > 0 ? (stepDetectableCount/totalTargeted*100).toFixed(1) : 0}%)`);

const reviewLevels = results.filter(r => r.isReview);
console.log(`复习关卡: ${reviewLevels.length}`);
for (const r of reviewLevels) {
  const found = r.reviewTechsFound ? r.reviewTechsFound.filter(t => t.found).length : 0;
  const total = r.reviewTechsFound ? r.reviewTechsFound.length : 0;
  console.log(`  [${r.levelId}] ${r.title}: ${found}/${total} 技巧覆盖`);
  if (r.reviewTechsFound) {
    for (const t of r.reviewTechsFound) {
      console.log(`    ${t.found ? '✓' : '✗'} ${t.techName}(${t.techId})${t.found ? ' 第'+t.step+'步' : ''}`);
    }
  }
}

// 失败的关卡列表
const failedTargeted = results.filter(r => r.targetTechId && !r.isReview && !r.techInSteps);
if (failedTargeted.length > 0) {
  console.log('\n未检测到目标技巧的关卡:');
  for (const r of failedTargeted) {
    const initInfo = r.initialDetectable ?
      `初始:${r.initialDetectable.detectable ? '✓' : '✗'}(${r.initialDetectable.count})` : '';
    const stepInfo = r.stepByStepDetectable ?
      ` 步进:${r.stepByStepDetectable.everDetectable ? '✓' : '✗'}(首次第${r.stepByStepDetectable.firstDetectableStep}步)` : '';
    console.log(`  [${r.levelId}] ${r.title} -> ${r.targetTechId} ${initInfo}${stepInfo}`);
  }
}

// 步进不可检测但初始可检测（说明求解器填充后目标技巧消失）
const stepFailButInitOK = results.filter(r =>
  r.targetTechId && !r.isReview && !r.techInSteps &&
  r.initialDetectable && r.initialDetectable.detectable &&
  r.stepByStepDetectable && !r.stepByStepDetectable.everDetectable
);
if (stepFailButInitOK.length > 0) {
  console.log('\n初始可检测但步进后消失的关卡（求解器填充过快导致技巧消失）:');
  for (const r of stepFailButInitOK) {
    console.log(`  [${r.levelId}] ${r.title} -> ${r.targetTechId}`);
  }
}

// 保存报告
const report = {
  timestamp: new Date().toISOString(),
  total: results.length,
  totalTargeted,
  foundCount,
  stepDetectableCount,
  passRate: totalTargeted > 0 ? foundCount / totalTargeted : 0,
  stepDetectableRate: totalTargeted > 0 ? stepDetectableCount / totalTargeted : 0,
  results: results.map(r => ({
    levelId: r.levelId,
    title: r.title,
    gridSize: r.gridSize,
    difficulty: r.difficulty,
    teachingGoal: r.teachingGoal,
    targetTechId: r.targetTechId,
    isReview: r.isReview,
    solvable: r.solveResult.solvable,
    totalSteps: r.solveResult.totalSteps,
    remainingCells: r.solveResult.remainingCells,
    initialDetectable: r.initialDetectable,
    stepByStepDetectable: r.stepByStepDetectable,
    foundInSolvePath: !!r.techInSteps,
    foundStep: r.techInSteps?.step ?? -1,
    evidenceValid: r.techInSteps?.evidenceValid?.valid ?? false,
    evidenceMissing: r.techInSteps?.evidenceValid?.missing ?? [],
    techDistribution: r.techDistribution,
    reviewTechsFound: r.reviewTechsFound,
    allInitialTechs: r.allInitialTechs,
  })),
  summary: {
    reviewLevels: reviewLevels.map(r => ({
      levelId: r.levelId,
      title: r.title,
      techCoverage: r.reviewTechsFound ? r.reviewTechsFound.filter(t => t.found).length + '/' + r.reviewTechsFound.length : 'N/A',
      details: r.reviewTechsFound,
    })),
  },
};
fs.writeFileSync(path.join(__dirname, '../reports/tech-verify-report.json'), JSON.stringify(report, null, 2));
console.log(`\n报告已保存: reports/tech-verify-report.json`);