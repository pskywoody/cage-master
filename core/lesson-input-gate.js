// =========================================================
// LessonInputGate — 教学输入门控的纯决策（单一数据源）
// 由 game.html 与 脚本（lesson-gate-behavior.test.mjs）共用：
// 讲解期全锁定 / 引导只许指定盘 / semiAuto 许格子+盘 / 填对即锁。
// 本模块不触碰 DOM、不读写 CM，仅依据 LessonPlayer 状态返回门控。
// =========================================================

/**
 * 依据当前教学状态机推导门控。
 * @param {object|null} lp LessonPlayer 实例（或其接口近似体）
 * @returns {{state:string, advance:boolean, pad:string, cells:boolean, wt:boolean, itype:string}}
 *  state:  'open'            非教学/自由 → 全部开放
 *          'locked'          讲解/旁白    → 全锁定，advance=true（点屏推进教案）
 *          'wait-cell-locked' 引导等输入   → 格子锁，仅 pad 指定盘可用
 *          'cell-open'        semiAuto    → 格子+指定盘可用
 *  pad:    'none' | 'digit' | 'candidate' | 'both'
 *  cells:  棋盘格是否可点（教学强引导时仍由 canSelectCell/canInteractCell 兜底）
 */
export function resolveLessonInputGate(lp) {
  try {
    if (!lp || !lp.isActive) {
      return { state: 'open', advance: false, pad: 'both', cells: true, wt: false, itype: 'NUMBER' };
    }
    const ph = lp.currentPhase;
    const waiting = !!lp.isWaitingInput;
    const itype = (typeof lp.getInteractionType === 'function') ? lp.getInteractionType() : 'NUMBER';

    if (ph === 'intro' || ph === 'demo') {
      return { state: 'locked', advance: true, pad: 'none', cells: false, wt: waiting, itype };
    }
    if (ph === 'guided' || ph === 'noteToFill') {
      // guided 渐进揭示（L1/L2）未到输入点 → 仍是讲解锁定；noteToFill 恒为等输入
      const explaining = (ph === 'guided' && !waiting);
      if (explaining) {
        return { state: 'locked', advance: true, pad: 'none', cells: false, wt: waiting, itype };
      }
      const pad = (itype === 'NOTE_ONLY') ? 'candidate' : 'digit';
      return { state: 'wait-cell-locked', advance: false, pad, cells: false, wt: waiting, itype };
    }
    if (ph === 'semiAuto') {
      const pad = (itype === 'NOTE_ONLY') ? 'candidate' : 'digit';
      return { state: 'cell-open', advance: false, pad, cells: true, wt: waiting, itype };
    }
    // free / 未知 → 放行
    return { state: 'open', advance: false, pad: 'both', cells: true, wt: waiting, itype };
  } catch (e) {
    return { state: 'open', advance: false, pad: 'both', cells: true, wt: false, itype: 'NUMBER' };
  }
}

export default resolveLessonInputGate;