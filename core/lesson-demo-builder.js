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
      // 阶段 4：demo 高亮改为累积展示（不再对 pulse 单独映射 focusCell，
      // 避免每个来源格都清空上一格），统一等 guided 填对后再清除。
      return { ...base, action: 'highlightCell', target: [action.r, action.c] };
    }
    case 'pulseCageSum':
      return { ...base, action: 'showSumBadge', target: action.cageId };
    default:
      return null;
  }
}

/**
 * 生成当前关卡的 demo 步骤（复用提示系统的三级推理 + 证据链）。
 * @param {Object} ctx
 * @param {Object} ctx.engine - HeadlessEngine 实例
 * @param {Object} ctx.levelData - 关卡数据（含 lessonPlan/solution）
 * @returns {Array|null} - lesson-player demo steps；失败返回 null 以回退旧 demo.steps
 */
export function buildLessonDemoSteps({ engine, levelData } = {}) {
  try {
    const board = engine && typeof engine.getBoard === 'function' ? engine.getBoard() : null;
    const solution = levelData && levelData.solution;
    if (!board || !solution) return null;

    const lp = levelData.lessonPlan || levelData.lesson || null;
    const technique = lp && lp.technique ? lp.technique : null;
    const preferred = technique && technique !== 'composite' ? technique : null;

    const hintSystem = new HintSystem(board, solution, { preferredTechnique: preferred });
    const adapter = new HintAdapter();

    let hint = null;
    // 连续取三次把同一目标推进到 Level 3（完整答案 + 证据链），每次都重置冷却。
    for (let i = 0; i < 3; i++) {
      hintSystem.lastHintTime = 0;
      const h = hintSystem.getHint();
      if (h && h.hintType === 'deduction') hint = h;
      if (h && h.hintLevel === 3) break;
    }

    if (!hint) return null;
    const converted = adapter.convert(hint);
    if (!converted || !Array.isArray(converted.actions) || converted.actions.length === 0) return null;

    const steps = converted.actions.map(mapHintAction).filter(Boolean);
    return steps.length > 0 ? steps : null;
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