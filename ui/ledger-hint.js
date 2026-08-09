// 45 法则账本提示卡（行/列/宫/笼恒和与组合）— 重构阶段 1 拆分（事故后重建）
// 共享状态经 window.CM（CM.gameApp）；hookLedgerHint 由 game.html 在 gameApp 构造后调用
const CM = window.CM || (window.CM = {});

/** 显示/隐藏 45 账本提示卡 */
/** Q5：隐藏时清零 --ffh-h（棋盘下移让位恢复原状） */
function showLedgerHintCard(show) {
  const el = document.getElementById('fortyFiveHint');
  if (!el) return;
  el.style.display = show ? 'block' : 'none';
  if (!show) {
    const root = document.documentElement;
    if (root.style.getPropertyValue('--ffh-h')) {
      root.style.setProperty('--ffh-h', '0px');
      try { if (typeof window.layout === 'function') window.layout(); } catch (eL) {}
    }
  }
}

/** 提示卡定位：固定在 header 之下，水平居中 */
/** Q5：自动检测是否遮挡棋盘——若账本卡底缘越过棋盘顶缘，设置 --ffh-h
 *   使盘面下移让位（竖屏空间足够）；不遮挡时保持 0 */
function positionLedgerHintCard() {
  try {
    const el = document.getElementById('fortyFiveHint');
    const board = document.getElementById('board-container');
    const root = document.documentElement;
    if (!el || !board) return;
    const br = board.getBoundingClientRect();
    if (br.width <= 0) return;
    // 固定：top = header(56px) + 8px，水平居中由 CSS 负责
    const topH = 64;
    el.style.top = topH + 'px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.bottom = 'auto';

    // Q5：遮挡检测——账本卡可见（display block）且底缘越过棋盘顶缘 → 盘面下移。
    // 关键：棋盘顶 br.top 已含 --ffh-h 自身造成的偏移（margin-top 递归），
    // 检测前先减去当前 --ffh-h，得到"无让位时的理想棋盘顶"，避免二次计算震荡。
    const visible = el.style.display !== 'none';
    // Q19：固定让位高度 = 账本最大高度 112px + 呼吸 8px —— 账本内容变化（1-5 行）
    // 让位值恒定，棋盘一关内完全不动（原 64px 在高度放宽后不足）
    const elH = visible ? 120 : 0;
    const cardBottom = topH + elH;
    const curFfh = parseFloat(root.style.getPropertyValue('--ffh-h')) || 0;
    const idealBoardTop = br.top - curFfh;
    let ffhH = 0;
    if (visible && cardBottom > idealBoardTop + 2) {
      // 需要下移的距离 = 卡底 - 理想棋盘顶 + 8px 呼吸
      ffhH = Math.round(cardBottom - idealBoardTop + 8);
    }
    const cur = root.style.getPropertyValue('--ffh-h') || '0px';
    const next = ffhH + 'px';
    if (cur !== next) {
      root.style.setProperty('--ffh-h', next);
      // 布局变化后棋盘位置改变，重算棋盘尺寸（一屏可见）
      try { if (typeof window.layout === 'function') window.layout(); } catch (eL) {}
    }
  } catch (e) { console.warn('[FFH] position error:', e); }
}

/** 笼格子坐标解析（兼容 {row:'a',col:1} / [r,c] / 'r c'） */
function parseCageCell(cc) {
  if (Array.isArray(cc)) return { r: cc[0], c: cc[1] };
  if (typeof cc === 'string') {
    const p = cc.split(/\s+/).map(Number);
    return { r: p[0], c: p[1] };
  }
  if (cc && typeof cc === 'object') {
    const rowVal = cc.row !== undefined ? cc.row : cc.r;
    let r = -1;
    if (typeof rowVal === 'number') r = rowVal;
    else if (typeof rowVal === 'string' && rowVal.length === 1) r = rowVal.toLowerCase().charCodeAt(0) - 97;
    return { r: r, c: (cc.col !== undefined ? cc.col : cc.c) - 1 };
  }
  return null;
}

/** 1..size 中取 k 个互异数字、和为 target 的所有组合（剪枝） */
function combosSum(target, k, size) {
  const out = [];
  const cur = [];
  function dfs(start, sum) {
    if (cur.length === k) {
      if (sum === target) out.push(cur.slice());
      return;
    }
    if (cur.length + (size - start + 1) < k) return; // 剩余数不足
    for (let n = start; n <= size; n++) {
      if (sum + n > target) break;
      cur.push(n);
      dfs(n + 1, sum + n);
      cur.pop();
    }
  }
  dfs(1, 0);
  return out;
}

/**
 * DFS 完备匹配：给剩余格分配组合数字（每格候选 ∩ 组合中不同数字），
 * 任一完整分配即可行。原实现为贪心（按候选少优先），会漏掉部分可行解
 * 误报"无组合"——玩家明明没填错却被提示"前面可能填错"（Q11 修复）
 */
function comboFeasible(combo, cellCands) {
  const k = cellCands.length;
  const used = new Array(combo.length).fill(false);
  // 候选少的格先试（加速剪枝），记录顺序
  const order = cellCands.map((cand, i) => ({ i, cand }))
    .sort((a, b) => a.cand.size - b.cand.size);
  function dfs(idx) {
    if (idx === k) return true;
    const { cand } = order[idx];
    for (let j = 0; j < combo.length; j++) {
      if (used[j]) continue;
      if (cand.has(combo[j])) {
        used[j] = true;
        if (dfs(idx + 1)) return true;
        used[j] = false;
      }
    }
    return false;
  }
  return dfs(0);
}

/** 渲染提示卡内容——全宽横条，尽量 3 行：
 *  行1，n/9 x/45 差y | 列c n/9 x/45 差y | 宫2 n/9 x/45 差y
 *  笼#2 n/Z x/和 差y
 *  可能的笼组合：[1,2,5][1,3,4]
 *  n=已知数个数，x=已知数和，y=剩余差（括号解释不显示）
 */
function updateLedgerHintCard() {
  const el = document.getElementById('fortyFiveHint');
  if (!el) return;
  if (!CM.gameApp || !CM.gameApp.isLevelLoaded()) { showLedgerHintCard(false); return; }

  // v2.0：45账本仅 9x9 关卡显示（4x4/6x6 是 10/21 法则，无 45 恒和，账本无意义）
  let size = 9;
  try { size = CM.gameApp._getGridSize ? CM.gameApp._getGridSize() : 9; } catch (e) {}
  if (size !== 9) { showLedgerHintCard(false); return; }

  // v2.0：教学时 chibi 显示 → 提示卡保持隐藏（不遮挡 chibi）
  // Q17：删除此隐藏逻辑——账本卡在顶部（top 64px）、chibi 在底部，位置不冲突。
  // 原逻辑导致提示/教学后 chibi 一直在场 → 账本永远不出现（用户反馈"点空格账本消失"）
  // 常驻显示——进入关卡即显示（无选中格时显示引导）
  const sel = CM.gameApp.getSelectedCell ? CM.gameApp.getSelectedCell() : null;
  if (!sel) {
    el.style.display = 'block';
    el.innerHTML = '<div class="ffh-guide">点选格子查看：行/列/宫/笼的已知数、和值与剩余差</div>';
    try { positionLedgerHintCard(); } catch (ePos) {}
    return;
  }
  el.style.display = 'block';
  try { positionLedgerHintCard(); } catch (ePos) {}

  let cells = null, cages = null;
  try {
    cells = CM.gameApp.getEngine().getState().cells;
    cages = (CM.gameApp._levelData && CM.gameApp._levelData.cages) || [];
  } catch (e) {
    el.innerHTML = '<div class="ffh-empty">棋盘数据不可用</div>';
    return;
  }
  if (!cells) { el.innerHTML = '<div class="ffh-empty">棋盘数据不可用</div>'; return; }

  const r = sel.r, c = sel.c;
  const total = size * (size + 1) / 2;
  const val = (rr, cc) => {
    const cell = cells[rr] && cells[rr][cc];
    if (!cell) return 0;
    return cell.fillNum || cell.fixedNum || 0;
  };
  const hasVal = (rr, cc) => {
    const cell = cells[rr] && cells[rr][cc];
    return !!(cell && (cell.fillNum || cell.fixedNum));
  };
  const boxSize = (size === 4) ? { boxW: 2, boxH: 2 }
    : (size === 6) ? { boxW: 3, boxH: 2 }
    : { boxW: 3, boxH: 3 };
  const boxR = Math.floor(r / boxSize.boxH) * boxSize.boxH;
  const boxC = Math.floor(c / boxSize.boxW) * boxSize.boxW;

  // 行：已知数个数/总格数、已知数和/恒和、差（规格 4.7.2 公式式：数字序列求和）
  let rowKnown = 0, rowSum = 0;
  const rowNums = [];
  for (let cc = 0; cc < size; cc++) { if (hasVal(r, cc)) { rowKnown++; rowSum += val(r, cc); rowNums.push(val(r, cc)); } }
  // 列
  let colKnown = 0, colSum = 0;
  const colNums = [];
  for (let rr = 0; rr < size; rr++) { if (hasVal(rr, c)) { colKnown++; colSum += val(rr, c); colNums.push(val(rr, c)); } }
  // 宫
  let boxKnown = 0, boxSum = 0;
  const boxNums = [];
  for (let rr = boxR; rr < boxR + boxSize.boxH; rr++) {
    for (let cc = boxC; cc < boxC + boxSize.boxW; cc++) {
      if (hasVal(rr, cc)) { boxKnown++; boxSum += val(rr, cc); boxNums.push(val(rr, cc)); }
    }
  }
  const boxIndex = Math.floor(boxR / boxSize.boxH) * (size / boxSize.boxW) + Math.floor(boxC / boxSize.boxW);

  // Q11：账本紧凑格式（用户指定）——
  //   行2: 9/45 空36   列8: 18/45 空27   （已知和/恒和 + 空余，不再展开数字序列）
  //   宫3: 17/45 空26  笼#0: 4/24 空20
  //   可能的笼组合：[3,9][4,8]（醒目金色）  无解 → 醒目红色
  // 不需要"本行和值 45，已知 X"单独提示行（信息已并入第一行）
  const segF = (k, sum, total, empty) =>
    '<span class="ffh-seg"><span class="ffh-k">' + k + ':</span> <b class="ffh-num">' + sum + '</b>/' + total +
    ' <span class="ffh-diff">空 ' + empty + '</span></span>';
  const row1 = '<div class="ffh-row1">' +
    segF('行' + (r + 1), rowSum, total, total - rowSum) +
    segF('列' + (c + 1), colSum, total, total - colSum) +
    '</div>';

  let row2 = '';
  let comboHtml = '';
  // 所在笼
  const myCage = (cages || []).find((cg) => {
    return (cg.cells || []).some((cc) => {
      const p = parseCageCell(cc);
      return p && p.r === r && p.c === c;
    });
  });
  if (myCage) {
    // 笼内所有格（含当前格）的已填和值；当前格未填时参与"剩余组合"
    const cageCells = (myCage.cells || []).map(parseCageCell).filter((p) => p && p.r >= 0 && p.c >= 0);
    let cageKnown = 0, cageSum = 0, cageEmpty = 0;
    const cellCands = []; // 每个空格的可选数字（排除行/列/宫已用）
    for (const p of cageCells) {
      const v = val(p.r, p.c);
      if (v) { cageKnown++; cageSum += v; }
      else {
        cageEmpty++;
        const used = new Set();
        for (let i = 0; i < size; i++) {
          if (val(p.r, i)) used.add(val(p.r, i));
          if (val(i, p.c)) used.add(val(i, p.c));
        }
        const br = Math.floor(p.r / boxSize.boxH) * boxSize.boxH;
        const bc = Math.floor(p.c / boxSize.boxW) * boxSize.boxW;
        for (let rr = br; rr < br + boxSize.boxH; rr++) {
          for (let cc2 = bc; cc2 < bc + boxSize.boxW; cc2++) {
            if (val(rr, cc2)) used.add(val(rr, cc2));
          }
        }
        const cand = new Set();
        for (let n = 1; n <= size; n++) if (!used.has(n)) cand.add(n);
        cellCands.push(cand);
      }
    }
    const remain = (myCage.sum || 0) - cageSum;
    // Q7：第二行 = 宫 + 笼 并排（规格：宫笼一排）；原实现有笼时只渲染笼、丢了宫
    row2 = '<div class="ffh-row2">' +
      segF('宫' + (boxIndex + 1), boxSum, total, total - boxSum) +
      segF('笼#' + (myCage.id != null ? myCage.id : ''), cageSum, (myCage.sum || 0), Math.max(0, remain)) +
      '</div>';
    // 组合可行性：剩余格从 1..size 选互异数字，和为 remain，且每个数字都出现在对应格的候选中
    if (cageEmpty > 0 && remain > 0 && remain <= size * cageEmpty) {
      const allCombos = combosSum(remain, cageEmpty, size);
      const feas = allCombos.filter((comb) => comboFeasible(comb, cellCands));
      if (feas.length === 0) {
        // Q11：DFS 完备匹配确认后仍无解 = 盘面存在逻辑冲突（和值未超范围但分配无解，
        // 可能跨笼/跨行填入导致候选被占）。文案改为准确提示 + 醒目红色
        comboHtml = '<div class="ffh-combo ffh-combo-none">可能的笼组合：无解</div>' +
          '<div class="ffh-combo-why">盘面有冲突（撤销上一步 / 检查红叉）</div>';
      } else {
        const shown = feas.slice(0, 4).map((comb) => '[' + comb.join(',') + ']').join('');
        const more = feas.length > 4 ? ' 等' + feas.length + '组' : '';
        comboHtml = '<div class="ffh-combo">可能的笼组合：<b class="ffh-combo-nums">' + shown + '</b>' + more + '</div>';
      }
    }
  } else {
    // 无笼信息时第二行只显示宫
    row2 = '<div class="ffh-row1">' + segF('宫' + (boxIndex + 1), boxNums, boxSum, total - boxSum) + '</div>';
  }

  el.innerHTML = row1 + row2 + comboHtml;
  // 4.7.2 45法则笔记本页翻页过渡：内容切换时旧页淡出、新页从右滑入
  try { flashLedgerFlip(); } catch (e) {}
  // Q5：内容/显隐变化后重定位——检测账本卡是否遮挡棋盘，遮挡则盘面下移
  try { positionLedgerHintCard(); } catch (ePos) {}
}

/** 4.7.2 45法则笔记本页翻页过渡：切换行/列/宫时旧页淡出、新页从右滑入 */
function flashLedgerFlip() {
  try {
    const el = document.getElementById('fortyFiveHint');
    if (!el) return;
    el.classList.remove('ffh-flip');
    void el.offsetWidth;
    el.classList.add('ffh-flip');
  } catch (e) {}
}

/** 刷新提示卡（选中/填数/擦除后调用） */
/** Q5：先 update（内容+显隐）再 position（重叠检测基于最终可见状态） */
function refreshLedgerHintCard() {
  try { updateLedgerHintCard(); } catch (e) {}
  try { positionLedgerHintCard(); } catch (e) {}
}

/**
 * 挂钩：包装 handleCellClick / handleNumberInput / handleErase / startLevel，
 * 选中/操作后刷新提示卡。必须在 gameApp 构造后调用。
 */
function hookLedgerHint() {
  if (!CM.gameApp) return;
  // Q8：防重复挂钩——hookLedgerHint 每次关卡加载都会被调用，
  // 无保护会导致 handleCellClick/handleErase 被层层包装（堆栈出现 3 次）
  if (CM.gameApp.__ledgerHookDone) return;
  CM.gameApp.__ledgerHookDone = true;
  const origClick = CM.gameApp.handleCellClick;
  if (typeof origClick === 'function') {
    CM.gameApp.handleCellClick = function (rr, cc) {
      const ret = origClick.call(this, rr, cc);
      try { updateLedgerHintCard(); } catch (e) {}
      return ret;
    };
  }
  const origNum = CM.gameApp.handleNumberInput;
  if (typeof origNum === 'function') {
    CM.gameApp.handleNumberInput = function (nn) {
      const ret = origNum.call(this, nn);
      try { updateLedgerHintCard(); } catch (e) {}
      return ret;
    };
  }
  const origErase = CM.gameApp.handleErase;
  if (typeof origErase === 'function') {
    CM.gameApp.handleErase = function () {
      const ret = origErase.call(this);
      try { updateLedgerHintCard(); } catch (e) {}
      return ret;
    };
  }
  // v2.0：关卡加载后刷新提示卡（进入关卡即常驻显示；startLevel 为 async）
  if (typeof CM.gameApp.startLevel === 'function') {
    const origStart = CM.gameApp.startLevel;
    CM.gameApp.startLevel = function (levelId) {
      try {
        const ret = origStart.call(this, levelId);
        if (ret && typeof ret.then === 'function') {
          ret.then(() => { try { refreshLedgerHintCard(); } catch (e) {} });
        } else {
          try { refreshLedgerHintCard(); } catch (e) {}
        }
        return ret;
      } catch (e) {
        try { refreshLedgerHintCard(); } catch (e2) {}
        throw e;
      }
    };
  }
  // 初始状态（无选中格也显示引导）
  try { refreshLedgerHintCard(); } catch (e) {}
}

// 布局变化（含 chibi 显示/隐藏）后重定位提示卡
window.addEventListener('resize', () => {
  try { positionLedgerHintCard(); } catch (e) {}
});

export { showLedgerHintCard, positionLedgerHintCard, updateLedgerHintCard, refreshLedgerHintCard, flashLedgerFlip, hookLedgerHint };
