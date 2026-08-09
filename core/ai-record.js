// ============================================================
//  ai-record.js - AI 调试记录快照构建（共用模块，2026-08-04）
// ============================================================
//  浏览器端 GameApp（ui/main.js）与 Node 端测试驱动脚本
//  （scripts/novice-teach-drive.js）共用本模块生成 record 静态快照，
//  保证「测试 JSON」与「玩家实机 JSON」结构完全一致。
//
//  依赖规则：core/ 零 DOM 依赖，Node/浏览器双环境可用。
// ============================================================

/**
 * 构建教学计划摘要（AI 对照「引导目标 vs 实际完成」用）
 * 坐标与 lessonEvents 一致使用 [r, c] 二维数组
 * @param {Object|null} lessonPlan - 关卡 lessonPlan（可为 null）
 * @returns {Object} { guided, semiAuto }（均为 null 时表示无教学计划）
 */
export function buildLessonPlanSummary(lessonPlan) {
  const phases = (lessonPlan && lessonPlan.phases) || null;
  const guided = (phases && phases.guided) || null;
  const semi = (phases && phases.semiAuto) || null;
  const ntf = (phases && phases.noteToFill) || null;   // V4.3.32：补齐 noteToFill（401 笔记教学）
  return {
    guided: guided ? {
      targetCell: (Array.isArray(guided.targetCell) && guided.targetCell.length === 2) ? guided.targetCell.slice() : null,
      correctValue: (guided.correctValue != null) ? guided.correctValue : null,
      maxAttempts: guided.maxAttempts || 2,
      interactionType: guided.interactionType || 'NUMBER',
      expectedNote: (Array.isArray(guided.expectedNote) ? guided.expectedNote : []).slice(),
      successNext: (Array.isArray(guided.successNext) ? guided.successNext : [])
        .map((item) => (item && Array.isArray(item.cell) && item.cell.length === 2) ? item.cell.slice() : null)
        .filter((v) => v !== null),
    } : null,
    semiAuto: semi ? {
      enabled: !!semi.enabled,
      watchCells: (Array.isArray(semi.watchCells) ? semi.watchCells : []).map((w) => (Array.isArray(w) ? w.slice() : null)).filter((v) => v !== null),
      targetCount: semi.targetCount || 3,
      interactionType: semi.interactionType || 'NUMBER',
    } : null,
    noteToFill: ntf ? {
      targetCell: (Array.isArray(ntf.targetCell) && ntf.targetCell.length === 2) ? ntf.targetCell.slice() : null,
      expectedNote: (Array.isArray(ntf.expectedNote) ? ntf.expectedNote : []).slice(),
      interactionType: 'NOTE_ONLY',
    } : null,
  };
}

/**
 * 归一化对话行（preDialog/clearDialog）
 * @param {Array} lines
 * @returns {Array<{speaker, text, side, isNarration}>}
 */
export function normalizeDialogLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((l) => ({
    speaker: l.speaker || null,
    text: l.text || '',
    side: l.side || null,
    isNarration: !!l.isNarration,
  }));
}

/**
 * 构建关卡记录静态快照（meta / preDialog / clearDialog / lessonPlan / initialBoard / cages）
 * @param {Object} levelData - 关卡 JSON
 * @returns {Object} 快照对象（与 getAIReadableState 的 record 静态字段一致）
 */
export function buildRecordSnapshot(levelData) {
  const gridSize = levelData.gridSize || 9;

  // 初始盘面（预填格含数字）
  const bd = Array.isArray(levelData.boardData) ? levelData.boardData : [];
  const initialBoard = bd.map((row) =>
    (Array.isArray(row) ? row : []).map((v) => {
      const val = (typeof v === 'number') ? v : 0;
      return { value: val, fixed: val > 0 };
    })
  );

  // 笼子结构（和值 + 格子，a3 坐标格式）
  const cages = (Array.isArray(levelData.cages) ? levelData.cages : []).map((cg, i) => {
    const cellsArr = (cg.cells || []).map((p) => {
      const pr = Array.isArray(p) ? p[0] : (p && p.row);
      const pc = Array.isArray(p) ? p[1] : (p && p.col);
      return { row: String.fromCharCode(97 + pr), col: pc + 1 };
    });
    return {
      id: (cg.id !== undefined && cg.id !== null) ? cg.id : i,
      sum: cg.sum || cg.target || cg.value || 0,
      cells: cellsArr,
    };
  });

  // 关卡元信息
  const meta = {
    title: levelData.title || null,
    teachingGoal: levelData.teachingGoal || null,
    difficulty: levelData.difficulty || null,
    mode: levelData.mode || null,
    newSkill: (levelData.lessonPlan && levelData.lessonPlan.newSkill) || null,
    skillName: (levelData.lessonPlan && levelData.lessonPlan.skillName) || null,
  };

  return {
    gridSize,
    meta,
    preDialog: normalizeDialogLines(levelData.preDialog),
    clearDialog: normalizeDialogLines(levelData.clearDialog),
    lessonPlan: buildLessonPlanSummary(levelData.lessonPlan || null),
    initialBoard,
    cages,
  };
}
