// ============================================================
//  strategy-replay.js - 最优过关策略回放（2026-08-04）
// ============================================================
//  过关后回放「最优路径」：用 TechRater 从初始盘面求解出
//  optimal 步骤序列（steps[]），逐条转成 onAction 动画序列，
//  复用现有 HintAdapter + AnimationController 播放管道讲解。
//
//  同时对比「用户实际路径 vs 最优路径」：找出用户比最优多
//  填/跳过的步骤，供 UI 展示异同。
//
//  依赖规则：core/ 零 DOM 依赖；TechRater 在 Node 下经
//  globalThis.TechRater 获取（headless-engine 同款机制），
//  浏览器下由 game.html 以全局脚本预加载。
// ============================================================

/**
 * 从关卡数据构建初始盘面（重置玩家填数）
 * @param {Object} levelData
 * @param {HeadlessEngine} engine - 复用引擎（loadLevel 会重置棋盘到初始态）
 * @returns {Object} board 实例（tech-rater 需要）
 */
export function buildInitialBoard(levelData, engine) {
  engine.loadLevel(levelData);
  return engine.getBoard();
}

/**
 * 求解最优策略步骤
 * @param {Object} levelData
 * @param {HeadlessEngine} engine - 复用的引擎实例（会被 loadLevel 重置，可接受）
 * @param {Object} techRaterRef - { getInstance(board) } 或直接传类
 * @returns {Array} steps[]
 */
export function solveOptimal(levelData, engine, TechRaterClass) {
  const board = buildInitialBoard(levelData, engine);
  const rater = TechRaterClass.fromBoard
    ? TechRaterClass.fromBoard(board)
    : new TechRaterClass(board);
  const result = rater.solve();
  return {
    solvable: result.solvable,
    steps: rater.getSteps(),
    remainingCells: result.remainingCells,
  };
}

/**
 * 把最优步骤转成 HintAdapter 可消费的 hint 对象
 * @param {Object} step - {row, col, num, technique, evidence}
 * @returns {Object} hint（technique/target/targetCells/evidence）
 */
export function stepToHint(step) {
  if (!step || step.type === 'elimination') {
    // elimination 步骤：无目标格，跳过讲解（或返回空）
    return null;
  }
  return {
    technique: step.technique || 'nakedSingle',
    techniqueName: step.techniqueName || null,
    target: { row: step.row, col: step.col },
    targetCells: [{ row: step.row, col: step.col }],
    evidence: step.evidence || null,
  };
}

/**
 * 对比用户路径与最优路径
 * @param {Array} optimalSteps - 最优 fill 步骤（{row,col,num}）
 * @param {Array} userMoves - 用户填数轨迹（{row,col,num,correct}，行=字母或索引）
 * @returns {Object} { optimalCount, userCount, followed, skipped, extra, diffDetails }
 */
export function comparePaths(optimalSteps, userMoves) {
  const optFills = (optimalSteps || []).filter((s) => s && s.type !== 'elimination' && typeof s.row === 'number');
  const userFills = (userMoves || []).filter((m) => m && m.type === 'fill');

  // 用户 move 的坐标提取：支持 {r,c,num} 或 {cell:{row:'a'|0,col:3|2}, num}
  const moveKey = (m) => {
    let r = typeof m.r === 'number' ? m.r : null;
    let c = typeof m.c === 'number' ? m.c : null;
    if (r === null && m.cell) {
      r = typeof m.cell.row === 'number' ? m.cell.row : (typeof m.cell.row === 'string' ? m.cell.row.charCodeAt(0) - 97 : null);
      c = typeof m.cell.col === 'number' ? m.cell.col - 1 : null;
    }
    if (r === null || c === null) return null;
    return r + ',' + c + ',' + m.num;
  };

  // 最优路径集合（r,c,num）
  const optSet = new Set(optFills.map((s) => `${s.row},${s.col},${s.num}`));
  // 用户正确填数集合
  const userCorrectSet = new Set(
    userFills.filter((m) => m.correct !== false).map((m) => moveKey(m)).filter((k) => k !== null)
  );

  // 最优中被用户正确采纳的步骤
  const followed = optFills.filter((s) => userCorrectSet.has(`${s.row},${s.col},${s.num}`)).length;
  // 最优中用户未采纳（按格匹配，用户填了别的值或没填）
  const skipped = optFills.filter((s) => !userCorrectSet.has(`${s.row},${s.col},${s.num}`)).length;
  // 用户额外步骤（最优中没有的格）
  const extra = userFills.filter((m) => {
    const k = moveKey(m);
    return k !== null && !optSet.has(k);
  });

  const diffDetails = {
    followedCells: optFills.filter((s) => userCorrectSet.has(`${s.row},${s.col},${s.num}`))
      .map((s) => ({ row: s.row, col: s.col, num: s.num, technique: s.technique })),
    skippedCells: optFills.filter((s) => !userCorrectSet.has(`${s.row},${s.col},${s.num}`))
      .map((s) => ({ row: s.row, col: s.col, num: s.num, technique: s.technique })),
    extraMoves: extra.map((m) => {
      const r = typeof m.r === 'number' ? m.r : (m.cell && (typeof m.cell.row === 'number' ? m.cell.row : m.cell.row.charCodeAt(0) - 97));
      const c = typeof m.c === 'number' ? m.c : (m.cell && m.cell.col - 1);
      return { row: r, col: c, num: m.num };
    }),
  };

  return {
    optimalCount: optFills.length,
    userCount: userFills.length,
    followed,
    skipped,
    extraCount: extra.length,
    diffDetails,
  };
}

/**
 * 把最优步骤转成 onAction 序列（HintAdapter 转换）
 * @param {Array} steps - 最优步骤
 * @param {Object} adapter - HintAdapter 实例
 * @returns {Array<{actions: Array, hint: Object}>} 序列（每步一组动作）
 */
export function stepsToActions(steps, adapter) {
  const out = [];
  for (const step of steps) {
    if (!step || step.type === 'elimination') continue; // elimination 无目标格，跳过讲解
    const hint = stepToHint(step);
    if (!hint) continue;
    try {
      const conv = adapter.convert(hint);
      if (conv && Array.isArray(conv.actions) && conv.actions.length > 0) {
        out.push({ actions: conv.actions, targetCell: conv.targetCell, hint });
      }
    } catch (e) {
      // 单个步骤转换失败不影响整体
    }
  }
  return out;
}
