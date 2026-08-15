// ============================================================
//  LessonDemoBuilder - 教学关 demo 复用提示动作（阶段 1）
// ============================================================
//  从 HintSystem + HintAdapter 的既有推理链路，生成 lesson-player
//  可直接消费的 demo steps；LessonPlayer 优先使用它，失败则回退到
//  关卡里手写的 demo.steps。
//
//  用法（由 ui/main.js 注入 LessonPlayer）：
//    new LessonPlayer({ engine, levelData, demoStepsBuilder: buildLessonDemoSteps, ... })
// ============================================================

import { HintSystem } from '../expert/hint-system.js';
import { HintAdapter } from '../renderer/hint-adapter.js';

/**
 * 把 HintAdapter.convert 的动作映射为 LessonPlayer.demo 步骤格式。
 * @param {Object} action - hint-adapter 输出的单个动作
 * @returns {Object|null} - { action, target, text } 兼容步骤，或不支持时返回 null
 */
function mapHintAction(action) {
  if (!action || typeof action.type !== 'string') return null;

  const base = {};
  if (action.text) base.text = action.text;

  switch (action.type) {
    case 'spotlight':
      if (action.enabled === false) return { action: 'spotlightOff' };
      return { ...base, action: 'spotlightOn', target: typeof action.intensity === 'number' ? action.intensity : 0.45 };
    case 'highlightRow':
      return { ...base, action: 'highlightRow', target: action.row };
    case 'highlightCol':
      return { ...base, action: 'highlightCol', target: action.col };
    case 'highlightBox':
      return { ...base, action: 'highlightBox', target: action.box };
    case 'highlightCage':
      return { ...base, action: 'highlightCage', target: action.cageId };
    case 'highlightCell': {
      // 证据一等公民：eliminate 红叉、success 结论、其余累积高亮。
      if (action.mode === 'eliminate') {
        return { ...base, action: 'strikeNote', target: [action.r, action.c], num: (action.num !== undefined ? action.num : action.value) };
      }
      if (action.mode === 'success') {
        return { ...base, action: 'concludeCell', target: [action.r, action.c], num: (action.num !== undefined ? action.num : action.value) };
      }
      // pulse/普通：累积展示（不再清空上一格），统一等 guided 填对后清除。
      return { ...base, action: 'highlightCell', target: [action.r, action.c] };
    }
    case 'pulseCageSum':
      return { ...base, action: 'showSumBadge', target: action.cageId };
    default:
      return null;
  }
}

/**
 * 精简 demo 步骤：去掉无教学价值的纯聚光灯步骤，合并相邻重复高亮。
 * @param {Array} steps
 * @returns {Array}
 */
export function minimizeDemoSteps(steps) {
  if (!Array.isArray(steps)) return steps;
  const out = [];
  for (const s of steps) {
    if (!s) continue;
    if ((s.action === 'spotlightOn' || s.action === 'spotlightOff') && !s.text) continue;
    if (out.length) {
      const prev = out[out.length - 1];
      if (prev.action === s.action && JSON.stringify(prev.target) === JSON.stringify(s.target)) continue;
    }
    out.push(s);
  }
  return out;
}

/**
 * 教学 Demo 必要性解析器（TeachingDemoResolver 的轻量实现）。
 * 核心：不靠 preferredTechnique 的"数学必要"判定，直接用 TechRater 问
 * "目标教学技巧在当前盘面是否可用/可演示"，可用则产出该技巧的 demo 动作，
 * 不可用则明确回退（不再被 nakedSingle 无心抢走）。
 * @param {Object} ctx - { engine, levelData }
 * @returns {Object} 结构化解析结果（供 buildLessonDemoSteps 与 48 关评估共用）
 */
export function resolveTeachingDemo({ engine, levelData } = {}) {
  const base = {
    plannedTechnique: null,
    targetCell: null,
    resolvedTechnique: null,
    fallback: true,
    fallbackReason: 'no_setup',
    evidenceComplete: false,
    deduction: null,
    actions: null,
  };
  try {
    const board = engine && typeof engine.getBoard === 'function' ? engine.getBoard() : null;
    const solution = levelData && levelData.solution;
    if (!board || !solution) return Object.assign({}, base, { fallbackReason: 'no_board_or_solution' });

    const lp = levelData.lessonPlan || levelData.lesson || null;
    const technique = lp && lp.technique ? lp.technique : null;
    const guided = lp && lp.phases && lp.phases.guided ? lp.phases.guided : null;
    const targetCell = guided && Array.isArray(guided.targetCell) && guided.targetCell.length === 2 ? guided.targetCell : null;
    const planned = technique && technique !== 'composite' ? technique : null;

    if (!planned) {
      return Object.assign({}, base, {
        plannedTechnique: technique,
        targetCell,
        fallbackReason: 'no_target_technique',
      });
    }

    const hintSystem = new HintSystem(board, solution, {});
    const adapter = new HintAdapter();
    base.plannedTechnique = planned;
    base.targetCell = targetCell;

    const deduction = hintSystem.getDeductionFor(planned, targetCell);
    if (!deduction || !Array.isArray(deduction.targetCells) || deduction.targetCells.length === 0) {
      return Object.assign({}, base, { fallbackReason: 'technique_unavailable' });
    }

    const first = deduction.targetCells[0];
    const hint = {
      technique: deduction.technique,
      techniqueName: deduction.techniqueName,
      targetCells: deduction.targetCells,
      target: { row: first.row, col: first.col, value: first.value },
      evidence: deduction.evidence,
      explanation: deduction.explanation,
      hintLevel: 3,
      dialogue: '',
      characterName: null,
    };
    const converted = adapter.convert(hint);
    const actions = minimizeDemoSteps((converted && Array.isArray(converted.actions)) ? converted.actions.map(mapHintAction).filter(Boolean) : []);
    return {
      plannedTechnique: planned,
      targetCell: targetCell,
      resolvedTechnique: deduction.technique,
      fallback: false,
      fallbackReason: null,
      evidenceComplete: !!deduction.evidence,
      deduction: deduction,
      actions: actions.length ? actions : null,
    };
  } catch (err) {
    console.warn('[TeachingDemoResolver] 解析失败:', err);
    return Object.assign({}, base, { fallbackReason: 'error' });
  }
}

/**
 * 生成当前关卡的 demo 步骤（复用提示系统的三级推理 + 证据链）。
 * @param {Object} ctx
 * @param {Object} ctx.engine - HeadlessEngine 实例
 * @param {Object} ctx.levelData - 关卡数据（含 lessonPlan/solution）
 * @returns {Array|null} - lesson-player demo steps；失败回退旧 demo.steps
 */
export function buildLessonDemoSteps({ engine, levelData } = {}) {
  try {
    const board = engine && typeof engine.getBoard === 'function' ? engine.getBoard() : null;
    const solution = levelData && levelData.solution;
    if (!board || !solution) return null;
    const resolved = resolveTeachingDemo({ engine, levelData });
    return (resolved && Array.isArray(resolved.actions) && resolved.actions.length) ? resolved.actions : null;
  } catch (err) {
    console.warn('[LessonDemoBuilder] 生成失败，回退手写 demo.steps:', err);
    return null;
  }
}

/**
 * 生成 semiAuto 阶段的渐进提示（Level 1 / 2 / 3 文案）。
 * 与 demo 复用同一条 HintSystem 推理链路，供 LessonPlayer.semiAutoHint() 调用。
 * @param {Object} ctx - { engine, levelData, level }
 * @returns {Object|null} - { level, technique, targetCell, text }
 */
export function buildSemiAutoHint({ engine, levelData, level = 1 } = {}) {
  try {
    const board = engine && typeof engine.getBoard === 'function' ? engine.getBoard() : null;
    const solution = levelData && levelData.solution;
    if (!board || !solution) return null;

    const lp = levelData.lessonPlan || levelData.lesson || null;
    const technique = lp && lp.technique ? lp.technique : null;
    const preferred = technique && technique !== 'composite' ? technique : null;
    const want = Math.max(1, Math.min(3, level || 1));

    const hintSystem = new HintSystem(board, solution, { preferredTechnique: preferred });
    let hint = null;
    for (let i = 0; i < want; i++) {
      hintSystem.lastHintTime = 0;
      const h = hintSystem.getHint();
      if (h && h.hintType === 'deduction') hint = h;
    }

    if (!hint) return null;
    let targetCell = null;
    if (hint.target && typeof hint.target.row === 'number' && typeof hint.target.col === 'number') {
      targetCell = [hint.target.row, hint.target.col];
    }
    return {
      level: want,
      technique: hint.technique || null,
      targetCell: targetCell,
      text: hint.dialogue || hint.explanation || null,
    };
  } catch (err) {
    console.warn('[SemiAutoHint] 生成失败:', err);
    return null;
  }
}

/**
 * 为 guided 成功后的 successNext 目标格生成"来源高亮"动作。
 * 方案 2：把目标格所在行/列/宫里已填的来源格全部高亮，让提示里说的数字看得见，
 * 再由 LessonPlayer 用 concludeCell 揭晓目标格。
 * @param {Object} ctx - { engine, levelData, targetCell }
 * @returns {Object|null} - { actions: [{type:'highlightCell',r,c,enabled:true}, ...], value }
 */
export function buildGuidedNextActions({ engine, levelData, targetCell } = {}) {
  try {
    if (!engine || !targetCell || !Array.isArray(targetCell) || targetCell.length !== 2) return null;
    const state = engine && typeof engine.getState === 'function' ? engine.getState() : null;
    const cells = state && state.cells;
    if (!Array.isArray(cells) || cells.length === 0) return null;

    const [r, c] = targetCell;
    const size = cells.length;
    const seen = new Set();
    const actions = [];
    const add = (rr, cc) => {
      const cell = cells[rr] && cells[rr][cc];
      const v = cell && (cell.fixedNum || cell.fillNum);
      if (!v) return;
      const key = rr + ',' + cc;
      if (seen.has(key)) return;
      seen.add(key);
      actions.push({ type: 'highlightCell', r: rr, c: cc, enabled: true });
    };

    // 目标格所在行
    for (let i = 0; i < size; i++) add(r, i);
    // 目标格所在列
    for (let i = 0; i < size; i++) add(i, c);
    // 目标格所在宫
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
      for (let cc = bc; cc < bc + 3; cc++) add(rr, cc);
    }

    return { actions: actions, value: (cells[r] && cells[r][c]) ? (cells[r][c].fillNum || cells[r][c].fixedNum) : null };
  } catch (err) {
    console.warn('[GuidedNext] 生成失败:', err);
    return null;
  }
}