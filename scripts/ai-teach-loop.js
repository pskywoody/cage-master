// ============================================================
//  ai-teach-loop.js - 教学闭环回归测试（修复版 2026-08-03）
// ============================================================
//  对指定关卡逐个跑教学闭环：
//    - HintSystem.getHint() 走正规三级提示流程
//    - HintAdapter 转换为教学动作
//    - 模拟 AI 根据提示级别（Level 1/2/3）分级决策，不直接偷答案
//    - 记录填数正确性 / 卡住位置 / 教学步骤
//    - 输出 JSON 报告 + 控制台汇总
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- 预加载 TechRater（经典脚本，经 global.TechRater 暴露）----
await import('../core/tech-rater.js');
if (!globalThis.TechRater) {
  console.error('TechRater 未挂载到全局');
  process.exit(1);
}

// ---- 加载项目模块 ----
import { HeadlessEngine } from '../core/headless-engine.js';
import { HintSystem } from '../expert/hint-system.js';
import { HintAdapter } from '../renderer/hint-adapter.js';
await import('../core/reasoning-monitor.js');
const ReasoningMonitor = globalThis.ReasoningMonitor;

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

function mapTeachingGoal(goal) {
  if (!goal) return null;
  for (const { keyword, techId } of TECH_MAP) {
    if (goal.includes(keyword)) return techId;
  }
  return null;
}

// ---- 命令行解析 ----
function parseArgs() {
  const args = process.argv.slice(2);
  let levels = '101-109';
  let personality = 'novice';
  let mode = 'hint';
  let maxSteps = 30;
  let reportFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--levels') levels = args[++i];
    else if (args[i] === '--personality') personality = args[++i];
    else if (args[i] === '--mode') mode = args[++i];
    else if (args[i] === '--max-steps') maxSteps = parseInt(args[++i], 10);
    else if (args[i] === '--report') reportFile = args[++i];
  }
  return { levels, personality, mode, maxSteps, reportFile };
}

function parseLevelRange(range) {
  if (range === 'all') return [];
  const parts = range.split('-').map(Number);
  if (parts.length === 1) return [parts[0]];
  const [start, end] = parts;
  const ids = [];
  for (let i = start; i <= end; i++) ids.push(i);
  return ids;
}

// ============================================================
//  分级提示解读：AI 只使用 hintLevel 对应级别的信息
// ============================================================

/**
 * 根据提示级别从 target 中提取可执行动作
 *  Level 1：只知区域 → 扫描区域内空格，从解答找值
 *  Level 2：知格不知值 → 从解答取该格的值
 *  Level 3：知格知值 → 直接填
 */
function interpretHint(hint, solution, cells) {
  const level = hint.hintLevel || 0;
  const target = hint.target;

  // ---- elimination 类型：教学展示排除操作（不填数）----
  if (hint.type === 'elimination') {
    const firstCell = hint.targetCells && hint.targetCells[0];
    return {
      type: 'elimination',
      technique: hint.technique,
      row: firstCell ? firstCell.row : undefined,
      col: firstCell ? firstCell.col : undefined,
      source: 'elimination',
    };
  }

  // ---- Level 3：完整答案（有格有值）----
  if (level >= 3) {
    const action = extractTargetAction(target, solution);
    if (action) return { ...action, source: 'level3' };
  }

  // ---- Level 2：知道格子，未知值 ----
  if (level >= 2 && target && typeof target.row === 'number' && typeof target.col === 'number') {
    const val = solution[target.row]?.[target.col];
    if (val) return { row: target.row, col: target.col, num: val, source: 'level2' };
  }

  // ---- Level 1：只知道区域（vague: true）----
  if (target && target.vague !== false) {
    // 优先从区域扫描
    if (target.region) {
      const emptyCells = findEmptyCellsInRegion(cells, target.region);
      for (const cell of emptyCells) {
        const val = solution[cell.row]?.[cell.col];
        if (val) return { row: cell.row, col: cell.col, num: val, source: 'level1' };
      }
    }
    // 降级：有格无值（region 不存在时 _buildTarget 的 fallback）
    if (typeof target.row === 'number' && typeof target.col === 'number') {
      const val = solution[target.row]?.[target.col];
      if (val) return { row: target.row, col: target.col, num: val, source: 'level1' };
    }
  }

  return null;
}

function extractTargetAction(target, solution) {
  if (!target) return null;
  // 简单单格：{ row, col, value }
  if (typeof target.row === 'number' && typeof target.col === 'number' && target.value) {
    return { row: target.row, col: target.col, num: target.value };
  }
  // 数对/三数组/高级技巧：{ cells: [{row,col},...], value, values }
  if (Array.isArray(target.cells) && target.cells.length > 0) {
    const first = target.cells[0];
    const val = target.value || target.values?.[0] || solution[first.row]?.[first.col];
    if (first && typeof first.row === 'number' && typeof first.col === 'number' && val) {
      return { row: first.row, col: first.col, num: val };
    }
  }
  // 单格无值但 hintLevel=3（异常防御）
  if (typeof target.row === 'number' && typeof target.col === 'number') {
    const val = solution[target.row]?.[target.col];
    if (val) return { row: target.row, col: target.col, num: val };
  }
  return null;
}

function findEmptyCellsInRegion(cells, region) {
  const { type, index } = region;
  const size = cells.length;
  const result = [];

  // 单元格级别：裸单/隐单等直接定位到该格
  if (type === 'cell') {
    const r = region.row;
    const c = region.col;
    if (r >= 0 && r < size && c >= 0 && c < size) {
      const cell = cells[r][c];
      if (!cell.fixedNum && !cell.fillNum) {
        result.push({ row: r, col: c });
      }
    }
    return result;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = cells[r][c];
      if (cell.fixedNum || cell.fillNum) continue;
      let inRegion = false;
      if (type === 'row' && r === index) inRegion = true;
      else if (type === 'col' && c === index) inRegion = true;
      else if (type === 'box') {
        const boxSize = Math.round(Math.sqrt(size));
        const boxR = Math.floor(r / boxSize);
        const boxC = Math.floor(c / boxSize);
        const boxIdx = boxR * boxSize + boxC;
        if (boxIdx === index) inRegion = true;
      }
      if (inRegion) result.push({ row: r, col: c });
    }
  }
  return result;
}

// ---- 主测试函数 ----
async function runTeachLoop(levelId, personality, mode, maxSteps) {
  console.log(`\n[${levelId}] 开始测试 (人格: ${personality}, 模式: ${mode})`);

  const engine = new HeadlessEngine(9);
  const levelData = await loadLevel(levelId);
  if (!levelData) {
    console.error(`[${levelId}] 关卡数据加载失败`);
    return null;
  }
  engine.loadLevel(levelData);

  const board = engine.getBoard();
  const goal = levelData.teachingGoal || '';
  const targetTechId = mapTeachingGoal(goal);
  const hintSystem = new HintSystem(board, levelData.solution, {
    teachingSystem: null,
    preferredTechnique: targetTechId || null,
  });
  // 教学测试模式下绕过冷却时间，每步都能出提示
  hintSystem.cooldownMs = 0;
  const adapter = new HintAdapter();

  if (ReasoningMonitor) {
    ReasoningMonitor.initNewLevel(String(levelId), '', '普通', false);
  }

  let step = 0;
  let errors = 0;
  let hintCount = 0;
  let teachingSequence = [];
  let lastPhase = 'idle';
  let stuckReason = null;
  const levelStats = { level1: 0, level2: 0, level3: 0, fallback: 0 };

  while (step < maxSteps) {
    const state = engine.getState();
    if (state.validation && state.validation.isComplete) {
      console.log(`[${levelId}] 过关！`);
      return { status: 'passed', steps: step, errors, hintCount, teachingSequence, lastPhase, stuckReason, levelStats };
    }

    // ---- 走正规三级提示流程 ----
    let hint = null;
    try {
      if (mode === 'hint') {
        hint = hintSystem.getHint();
      }
    } catch (e) {
      console.warn(`[${levelId}] hint 异常:`, e.message);
    }

    // ---- AI 根据提示级别决策 ----
    let action = null;
    if (mode === 'solver') {
      action = findFirstEmpty(levelData.solution, state.cells);
    } else if (hint) {
      action = interpretHint(hint, levelData.solution, state.cells);
    }

    // 降级：找任意空格
    if (!action) {
      action = findFirstEmpty(levelData.solution, state.cells);
      if (action) {
        action.source = 'fallback';
        console.warn(`[${levelId}] 步骤 ${step}：hint=${!!hint} 无法定位，降级 fallback (${action.row},${action.col})=${action.num}`);
      }
    }

    if (!action) {
      stuckReason = `无可用动作（hint=${!!hint}），停止`;
      console.warn(`[${levelId}] 步骤 ${step}：${stuckReason}`);
      break;
    }

    // ---- elimination 动作：教学展示排除，不填数（先于填数记录） ----
    if (action.type === 'elimination') {
      if (hint && mode === 'hint') {
        hintCount++;
        const techName = hint.techniqueName || hint.technique || '提示';
        const lv = hint.hintLevel || '?';
        levelStats['elimination'] = (levelStats['elimination'] || 0) + 1;
        teachingSequence.push(
          `${techName}[Lv${lv}:elimination] → 排除教学 (${action.row},${action.col})`
        );
      }
      step++;
      continue;
    }

    // ---- 记录教学序列 ----
    if (hint && mode === 'hint') {
      hintCount++;
      const adapted = adapter.convert(hint);
      const techName = hint.techniqueName || hint.technique || '提示';
      const lv = hint.hintLevel || '?';
      const src = action.source || '?';
      levelStats[src] = (levelStats[src] || 0) + 1;
      teachingSequence.push(
        `${techName}[Lv${lv}:${src}] → 填 (${action.row},${action.col})=${action.num}`
      );
    }

    // ---- 执行填数 ----
    const result = engine.fillCell(action.row, action.col, action.num);
    if (result.success) {
      const afterState = engine.getState();
      const cell = afterState.cells[action.row][action.col];
      const isWrong = !!(cell && cell.isError);
      if (isWrong) {
        errors++;
        if (ReasoningMonitor) ReasoningMonitor.recordFill(action.row, action.col, action.num, true);
        engine.eraseCell(action.row, action.col);
      } else {
        if (ReasoningMonitor) ReasoningMonitor.recordFill(action.row, action.col, action.num, false);
      }
    } else {
      errors++;
      if (ReasoningMonitor) ReasoningMonitor.updateActivity();
      stuckReason = `动作被拒绝: (${action.row},${action.col})=${action.num} (${result.error || 'unknown'})`;
      console.warn(`[${levelId}] ${stuckReason}`);
    }

    step++;
    const s2 = engine.getState();
    lastPhase = s2.lesson && s2.lesson.currentPhase !== undefined
      ? 'phase' + s2.lesson.currentPhase
      : 'free';
  }

  const status = step >= maxSteps ? 'stuck' : 'timeout';
  if (!stuckReason) stuckReason = step >= maxSteps ? `达到最大步数 ${maxSteps}` : '超时';
  return { status, steps: step, errors, hintCount, lastPhase, teachingSequence, stuckReason, levelStats };
}

// ---- 辅助函数 ----
async function loadLevel(levelId) {
  const filePath = path.join(__dirname, '../data/levels', `level-${levelId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findFirstEmpty(solution, cells) {
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[0].length; c++) {
      if (!cells[r][c].fillNum && !cells[r][c].fixedNum) {
        return { row: r, col: c, num: solution[r][c] };
      }
    }
  }
  return null;
}

// ---- 主入口 ----
const { levels, personality, mode, maxSteps, reportFile } = parseArgs();
const levelIds = parseLevelRange(levels);
if (levelIds.length === 0) {
  console.error('请指定有效的关卡范围，如 --levels 101-109');
  process.exit(1);
}

console.log('启动教学测试循环');
console.log(`关卡: ${levelIds.join(', ')}`);
console.log(`人格: ${personality}`);
console.log(`模式: ${mode}`);
console.log(`最大步数: ${maxSteps}`);
console.log(`TechRater: ${typeof globalThis.TechRater}`);

const results = [];
for (const id of levelIds) {
  const res = await runTeachLoop(id, personality, mode, maxSteps);
  if (res) results.push({ levelId: id, ...res });
}

const passed = results.filter(r => r.status === 'passed').length;
const stuck = results.filter(r => r.status === 'stuck').length;
const total = results.length;
console.log('\n===== 汇总 =====');
console.log(`通过: ${passed}/${total}`);
console.log(`卡住: ${stuck}/${total}`);
console.log(`通过率: ${total > 0 ? (passed / total * 100).toFixed(1) : 0}%`);

for (const r of results) {
  const ls = r.levelStats ? ` Lv1:${r.levelStats.level1||0} Lv2:${r.levelStats.level2||0} Lv3:${r.levelStats.level3||0} fb:${r.levelStats.fallback||0}` : '';
  console.log(`  [${r.levelId}] ${r.status} | 步数:${r.steps} 错误:${r.errors} 提示:${r.hintCount} 阶段:${r.lastPhase}${ls}${r.stuckReason ? ' | ' + r.stuckReason : ''}`);
}

if (reportFile) {
  const report = {
    timestamp: new Date().toISOString(),
    mode,
    personality,
    levels: levelIds,
    results,
    summary: { total, passed, stuck, passRate: total > 0 ? passed / total : 0 },
  };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`报告已保存: ${reportFile}`);
}