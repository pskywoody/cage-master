// ============================================================
//  HintAdapter - 提示 -> 微型教学 onAction 序列适配器（2026-08-03）
// ============================================================
//  输入：HintSystem.getHint() 返回对象
//  输出：与 AnimationController.playHintSteps 兼容的 onAction 序列
//        （渲染管道与 LessonPlayer 的 onAction 同一套：highlightCell/Row/Col/Box）
//
//  映射规则：
//    evidence.regionType === 'row' -> { type:'highlightRow', row, enabled }
//    evidence.regionType === 'col' -> { type:'highlightCol', col, enabled }
//    evidence.regionType === 'box' -> { type:'highlightBox', box, enabled }
//    focus    -> { type:'highlightCell', r, c, mode:'pulse' }
//    eliminate-> { type:'highlightCell', r, c, mode:'eliminate' }
//    reveal   -> { type:'highlightCell', r, c, mode:'success' }
//
//  支持技巧：nakedSingle / hiddenSingle / cageUnique / rule45 / pointingClaiming / nakedTriplet / xWing / swordfish
//
//  双区域动画（2026-08-03）：xWing / swordfish 生成"多行+多列"高亮序列 +
//  逐格叙事模板（每步带 text 文案），由 LessonPlayer 渲染管道逐句播放。
// ============================================================

'use strict';

const SUPPORTED_TECHNIQUES = new Set([
  'nakedSingle',
  'hiddenSingle',
  'cageUnique',
  'rule45',
  'pointingClaiming',
  'nakedTriplet',
  'xWing',
  'swordfish',
]);

class HintAdapter {
  constructor() {
    this._supported = SUPPORTED_TECHNIQUES;
  }

  /**
   * 将 HintSystem 提示数据转换为 onAction 序列
   * @param {Object} hint - HintSystem.getHint() 返回对象
   * @returns {{actions: Array, targetCell: Array<number>|null, technique: string|null, explanation: string|null, characterName: string|null, dialogue: string|null}}
   */
  convert(hint) {
    const empty = {
      actions: [],
      targetCell: null,
      technique: null,
      explanation: null,
      characterName: null,
      dialogue: null,
    };
    if (!hint || typeof hint !== 'object') return empty;

    const technique = hint.technique || null;
    // 双区域动画：xWing/swordfish 有 rows+cols 双区域结构
    if (technique === 'xWing' || technique === 'swordfish') {
      const conv = this._convertDualRegion(hint);
      if (conv) return conv;
      // 结构不完整时降级到通用逻辑
    }
    const actions = [];

    // ---- 目标格：target.row/col > targetCells[0] > evidence.targetCell ----
    let targetCell = null;
    if (hint.target && typeof hint.target.row === 'number' && typeof hint.target.col === 'number') {
      targetCell = [hint.target.row, hint.target.col];
    } else if (Array.isArray(hint.targetCells) && hint.targetCells.length > 0) {
      const first = hint.targetCells[0];
      if (first && typeof first.row === 'number') {
        targetCell = [first.row, (typeof first.col === 'number' ? first.col : 0)];
      }
    } else if (hint.evidence && Array.isArray(hint.evidence.targetCell) && hint.evidence.targetCell.length >= 2) {
      const [er, ec] = hint.evidence.targetCell;
      if (typeof er === 'number' && typeof ec === 'number') {
        targetCell = [er, ec];
      }
    }
    if (!targetCell) return empty;

    // ---- 证据字段（已由 HintSystem 归一化，或在此防御性推导）----
    const evidence = hint.evidence || {};
    let regionType = evidence.regionType || null;
    let regionIndex = (evidence.regionIndex !== undefined && evidence.regionIndex !== null)
      ? evidence.regionIndex : null;
    // 防御性推导：target.region
    if (!regionType && hint.target && hint.target.region && hint.target.region.type) {
      regionType = hint.target.region.type;
      regionIndex = (hint.target.region.index !== undefined) ? hint.target.region.index : regionIndex;
    }
    // 防御性推导：scopeType/scopeIndex
    if (!regionType && evidence.scopeType) {
      regionType = evidence.scopeType;
      regionIndex = (evidence.scopeIndex !== undefined) ? evidence.scopeIndex : regionIndex;
    }

    // 排除位置（用于 eliminate 标记）
    // Q14：兼容 {cell:[r,c], reasons}（tech-rater 原结构）与 {row,col}（hint-system 归一化后）
    let eliminatedPositions = [];
    if (Array.isArray(evidence.eliminatedPositions)) {
      eliminatedPositions = evidence.eliminatedPositions
        .map(p => {
          if (p && Array.isArray(p.cell) && p.cell.length >= 2 && typeof p.cell[0] === 'number') {
            return { row: p.cell[0], col: p.cell[1], reasons: p.reasons || [] };
          }
          return p;
        })
        .filter(p => p && typeof p.row === 'number' && typeof p.col === 'number');
    }

    // ---- 构建动作序列 ----
    // V4.3.15：通用路径补逐格叙事（每步带 text），与 xWing/swordfish 双区域
    // 路径对齐——用户要求高阶 hint（nakedPair/pointingClaiming 等）也要逐步讲解。
    const narrative = this._buildStepTexts(technique, evidence, targetCell, eliminatedPositions, hint);

    // 1. 聚光灯：棋盘变暗（观察阶段）
    actions.push({ type: 'spotlight', enabled: true, intensity: 0.5, text: narrative.intro });

    // Q7：45法则逐步求和——先逐个高亮相交笼子（25 → 11 → 16 → 合计 52），
    // 玩家看清 52 从哪来，再高亮宫（45），最后聚焦外突格（7）
    if (technique === 'rule45') {
      const cageActions = this._buildRule45SumSteps(evidence, narrative);
      if (cageActions && cageActions.length > 0) {
        actions.push(...cageActions);
      }
    }

    // 2. 区域高亮（observe：行/列/宫/笼）
    if (regionType === 'row' && typeof regionIndex === 'number') {
      actions.push({ type: 'highlightRow', row: regionIndex, enabled: true, text: narrative.region });
    } else if (regionType === 'col' && typeof regionIndex === 'number') {
      actions.push({ type: 'highlightCol', col: regionIndex, enabled: true, text: narrative.region });
    } else if (regionType === 'box' && typeof regionIndex === 'number') {
      actions.push({ type: 'highlightBox', box: regionIndex, enabled: true, text: narrative.region });
    } else if (regionType === 'cage' || (technique === 'cageUnique' && evidence.cageId !== undefined)) {
      // 笼子唯一组合：高亮整个笼子（2026-08-03）
      actions.push({ type: 'highlightCage', cageId: (evidence.cageId !== undefined ? evidence.cageId : regionIndex), enabled: true, text: narrative.region });
    } else if (technique === 'nakedPair' || technique === 'hiddenPair' || technique === 'nakedTriplet') {
      // 数对/三数组：逐格高亮锁定格（pairCells/tripletCells）
      const lockCells = this._lockCellsFromEvidence(evidence, technique);
      if (lockCells.length > 0) {
        lockCells.forEach((cell, i) => {
          actions.push({ type: 'highlightCell', r: cell[0], c: cell[1], mode: 'default', text: narrative.lockTexts[i] || narrative.region });
        });
      }
    }

    // 3. 聚焦（pulse）——Q18：裸单结论后置（先逐个排除展示证据，再聚焦结论）
    const focusAction = { type: 'highlightCell', r: targetCell[0], c: targetCell[1], mode: 'pulse', text: narrative.focus };
    if (technique === 'nakedSingle') {
      const srcSteps = this._buildNakedSingleSourceSteps(evidence, narrative);
      if (srcSteps.length > 0) actions.push(...srcSteps);
      actions.push(focusAction);
    } else {
      actions.push(focusAction);

      // 4. 排除标记（eliminate：红叉）
      eliminatedPositions.forEach((p, i) => {
        actions.push({ type: 'highlightCell', r: p.row, c: p.col, mode: 'eliminate', text: narrative.eliminateTexts[i] || narrative.eliminate });
      });
    }

    // 5. 揭示（reveal：成功闪光）
    actions.push({ type: 'highlightCell', r: targetCell[0], c: targetCell[1], mode: 'success', text: narrative.reveal });

    // 6. 保持聚光灯（进入锁定模式前的视觉状态）
    actions.push({ type: 'spotlight', enabled: true, intensity: 0.35, text: null });

    return {
      actions: actions,
      targetCell: targetCell,
      technique: technique,
      explanation: hint.explanation || null,
      characterName: hint.characterName || null,
      dialogue: hint.dialogue || null,
    };
  }

  /**
   * Q18：裸单"来源格高亮"步骤——逐个高亮同行/列/宫已填的该数字格，
   * 配合逐数字排除文案，让玩家看到每个候选为什么被排除
   * @private
   */
  _buildNakedSingleSourceSteps(evidence, narrative) {
    const out = [];
    try {
      const rowNums = Array.isArray(evidence.rowNumbers) ? evidence.rowNumbers : [];
      const colNums = Array.isArray(evidence.colNumbers) ? evidence.colNumbers : [];
      const boxNums = Array.isArray(evidence.boxNumbers) ? evidence.boxNumbers : [];
      const eliminated = Array.isArray(evidence.eliminated) ? evidence.eliminated : [];
      eliminated.forEach((n, i) => {
        let src = null;
        for (const x of rowNums) if (x && x.v === n) { src = { r: x.r, c: x.c }; break; }
        if (!src) for (const x of colNums) if (x && x.v === n) { src = { r: x.r, c: x.c }; break; }
        if (!src) for (const x of boxNums) if (x && x.v === n) { src = { r: x.r, c: x.c }; break; }
        if (src) {
          out.push({
            type: 'highlightCell',
            r: src.r, c: src.c,
            mode: 'pulse',
            text: (narrative.eliminateTexts && narrative.eliminateTexts[i]) || null,
          });
        }
      });
    } catch (e) {
      console.warn('[HintAdapter] _buildNakedSingleSourceSteps error:', e);
    }
    return out;
  }

  /**
   * 从证据提取锁定格坐标（nakedPair/hiddenPair/nakedTriplet）
   * @private
   */
  _lockCellsFromEvidence(evidence, technique) {
    const cells = evidence.pairCells || evidence.tripletCells || null;
    if (!cells) return [];
    return cells
      .filter(c => Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number')
      .map(c => [c[0], c[1]]);
  }

  /**
   * Q15：查找某格所在的笼（读 window.CM.gameApp._levelData.cages）
   * @returns {Object|null} { id, sum, cells }
   * @private
   */
  _findCageAt(r, c) {
    try {
      const app = (typeof window !== 'undefined' && window.CM) ? window.CM.gameApp : null;
      const cages = app && app._levelData ? app._levelData.cages : null;
      if (!Array.isArray(cages)) return null;
      for (const cg of cages) {
        const cells = (cg.cells || []);
        for (const cc of cells) {
          let cr = -1, ccIdx = -1;
          if (Array.isArray(cc)) { cr = cc[0]; ccIdx = cc[1]; }
          else if (cc && typeof cc === 'object') {
            const rv = cc.row !== undefined ? cc.row : cc.r;
            cr = typeof rv === 'number' ? rv : (typeof rv === 'string' && rv.length === 1 ? rv.toLowerCase().charCodeAt(0) - 97 : -1);
            ccIdx = (cc.col !== undefined ? cc.col : cc.c) - 1;
          }
          if (cr === r && ccIdx === c) {
            return { id: cg.id, sum: cg.sum, cells: cells };
          }
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Q7：45法则"逐笼求和"动画步骤——逐个高亮相交笼子并报出各笼和，
   * 让玩家看清 totalCageSum（如 52）由哪些笼子和相加而来，杜绝"52 哪来的"困惑。
   * outie：逐个高亮 intersectingCages；innie：逐个高亮 fullyInsideCages。
   * @private
   */
  _buildRule45SumSteps(evidence, narrative) {
    try {
      const out = [];
      const isOutie = evidence.subtype === 'outie';
      const ids = isOutie
        ? (Array.isArray(evidence.intersectingCages) ? evidence.intersectingCages : [])
        : (Array.isArray(evidence.fullyInsideCages) ? evidence.fullyInsideCages : []);
      if (ids.length < 2) return out; // 少于 2 个笼无需逐步讲解

      // 从关卡数据解析各笼子和
      let cagesData = null;
      try {
        if (typeof window !== 'undefined' && window.CM && window.CM.gameApp) {
          cagesData = (window.CM.gameApp._levelData && window.CM.gameApp._levelData.cages) || null;
        }
      } catch (eC) { cagesData = null; }
      const cageSumOf = (id) => {
        if (cagesData && Array.isArray(cagesData)) {
          const found = cagesData.find((cg) => String(cg.id) === String(id));
          if (found && typeof found.sum === 'number') return found.sum;
        }
        return null;
      };

      // 逐个笼子高亮 + 报和（累计求和文案）
      let acc = 0;
      for (let i = 0; i < ids.length; i++) {
        const cid = ids[i];
        const csum = cageSumOf(cid);
        acc += (typeof csum === 'number' ? csum : 0);
        const sumTxt = (typeof csum === 'number') ? ' = ' + csum : '';
        // 累计括号只在第 2 个笼起显示（第 1 个笼的"25 = 25"多余）
        const accTxt = (typeof csum === 'number' && i > 0)
          ? '（' + ids.slice(0, i + 1).map((id2) => cageSumOf(id2)).join(' + ') + ' = ' + acc + '）'
          : '';
        out.push({
          type: 'highlightCage',
          cageId: cid,
          enabled: true,
          text: (isOutie ? '外突笼' : '内笼') + '#' + cid + sumTxt + accTxt,
        });
      }
      // 结尾汇总步骤：所有相交笼子和 = totalCageSum
      if (typeof evidence.totalCageSum === 'number' || typeof evidence.sumFullyInside === 'number') {
        const total = isOutie ? evidence.totalCageSum : evidence.sumFullyInside;
        if (typeof total === 'number') {
          out.push({
            type: 'highlightCage',
            cageId: ids[ids.length - 1],
            enabled: true,
            text: (isOutie ? '相交笼子和 ' : '完全在内笼和 ') + '= ' + total,
          });
        }
      }
      return out;
    } catch (e) {
      console.warn('[HintAdapter] _buildRule45SumSteps error:', e);
      return [];
    }
  }

  /**
   * 通用路径逐格叙事文案生成（V4.3.15）
   * 按技巧类型生成 intro/region/lockTexts/focus/eliminate/eliminateTexts/reveal
   * @private
   */
  _buildStepTexts(technique, evidence, targetCell, eliminatedPositions, hint) {
    evidence = evidence || {};
    const targetName = this._cellName(targetCell[0], targetCell[1]);
    const num = (hint.target && hint.target.value) || evidence.targetValue || evidence.num || 0;
    const defaultTexts = {
      intro: '看好了，我演示一遍。',
      region: null,
      lockTexts: [],
      focus: targetName ? targetName + ' 格只剩一个数——填 ' + num + '！' : '这里只剩一个数，填 ' + num + '！',
      eliminate: '这里可以排除 ' + num + '。',
      eliminateTexts: [],
      reveal: '就是它！' + num + '。',
    };

    switch (technique) {
      case 'nakedSingle': {
        // Q18：裸单讲解补全证据链——原文案只有"只剩一个数"，玩家看不到为什么。
        // evidence 有 eliminated（被排除数字）+ rowNumbers/colNumbers/boxNumbers（行列宫已填），
        // 据此生成逐数字排除文案，配合来源格高亮动画（见 convert）
        const rowNums = Array.isArray(evidence.rowNumbers) ? evidence.rowNumbers : [];
        const colNums = Array.isArray(evidence.colNumbers) ? evidence.colNumbers : [];
        const boxNums = Array.isArray(evidence.boxNumbers) ? evidence.boxNumbers : [];
        const findSrc = (n) => {
          for (const x of rowNums) if (x && x.v === n) return { r: x.r, c: x.c, unit: '第' + ((evidence.rowIndex !== undefined ? evidence.rowIndex : x.r) + 1) + '行' };
          for (const x of colNums) if (x && x.v === n) return { r: x.r, c: x.c, unit: '第' + ((evidence.colIndex !== undefined ? evidence.colIndex : x.c) + 1) + '列' };
          for (const x of boxNums) if (x && x.v === n) return { r: x.r, c: x.c, unit: '同宫' };
          return null;
        };
        defaultTexts.region = targetName + ' 的候选只剩一个数';
        defaultTexts.focus = targetName + ' 里 1-9 逐个看过：只有 ' + num + ' 没被行/列/宫排除——填 ' + num + '！';
        defaultTexts.eliminate = '这格排除了其他数字，只剩 ' + num + '。';
        if (Array.isArray(evidence.eliminated) && evidence.eliminated.length > 0) {
          defaultTexts.eliminateTexts = evidence.eliminated.map((n) => {
            const src = findSrc(n);
            if (src) {
              const cn = this._cellName(src.r, src.c);
              return targetName + ' 排除 ' + n + '：' + src.unit + '已有 ' + n + '（' + cn + '）';
            }
            return targetName + ' 排除 ' + n + '。';
          });
        }
        break;
      }
      case 'pointingClaiming': {
        const dir = evidence.pointingDirection === 'row' ? '行' : (evidence.pointingDirection === 'col' ? '列' : '');
        const idx = (evidence.pointingIndex !== undefined ? evidence.pointingIndex + 1 : '');
        const nums = (evidence.excludedNumbers && evidence.excludedNumbers.length) ? evidence.excludedNumbers.join('、') : num;
        defaultTexts.region = '区块排除：数字 ' + nums + ' 被锁定在这' + dir + idx;
        defaultTexts.eliminate = '顺着这条' + dir + '，其他格可以排除 ' + nums + '。';
        break;
      }
      case 'nakedPair': {
        const vals = (evidence.pairValues || []).join('和');
        const cellDesc = (evidence.pairCells || []).map(c => this._cellName(c[0], c[1])).join('、');
        defaultTexts.region = '裸数对：数字 ' + vals + ' 锁定了 ' + (cellDesc || '这两格');
        defaultTexts.lockTexts = (evidence.pairCells || []).map(c => this._cellName(c[0], c[1]) + ' 只能填 ' + vals);
        defaultTexts.eliminate = '这两个位置占住了 ' + vals + '，别的格排除它们。';
        // Q19：nakedPair 无单一 targetValue（num 恒 0）——原默认 focus/reveal 用裸单
        // 模板生成"填 0！/就是它！0。"，玩家看到荒谬文案。改讲锁定事实
        defaultTexts.focus = (cellDesc || '这两格') + ' 就是 ' + vals + '——确定后排除其他格的 ' + vals;
        defaultTexts.reveal = '就是它们！' + vals + ' 锁定完成。';
        break;
      }
      case 'hiddenPair': {
        const vals = (evidence.pairValues || []).join('和');
        defaultTexts.region = '隐数对：数字 ' + vals + ' 只出现在这两个位置';
        defaultTexts.lockTexts = (evidence.pairCells || []).map(c => this._cellName(c[0], c[1]) + ' 藏着数字 ' + vals);
        defaultTexts.eliminate = '这两个位置只放 ' + vals + '，排除其他数字。';
        // Q19：同上——hiddenPair 无单一值，focus/reveal 不能套裸单模板
        defaultTexts.focus = '数字 ' + vals + ' 只可能在 ' + (cellDesc || '这两格') + '——确定后排除其他数字';
        defaultTexts.reveal = '就是它们！' + vals + ' 锁定完成。';
        break;
      }
      case 'nakedTriplet': {
        const vals = (evidence.tripletValues || []).join('、');
        defaultTexts.region = '裸三数组：数字 ' + vals + ' 锁定在三个位置';
        defaultTexts.lockTexts = (evidence.tripletCells || []).map(c => this._cellName(c[0], c[1]) + ' 只能填 ' + vals);
        defaultTexts.eliminate = '这三个位置占住了 ' + vals + '，别的格排除它们。';
        break;
      }
      case 'rule45': {
        // Q6/Q7：45 法则讲解分两步——先逐笼求和（_buildRule45SumSteps 动画），
        // 再此区域文案承接结论；避免原文案直接抛"52"让玩家困惑
        const scopeLabel = evidence.scopeType ? (evidence.scopeType + (evidence.scopeIndex !== undefined ? (evidence.scopeIndex + 1) : '')) : '';
        const scopeName = evidence.scopeType === 'row' ? '第' + ((evidence.scopeIndex || 0) + 1) + '行'
          : evidence.scopeType === 'col' ? '第' + ((evidence.scopeIndex || 0) + 1) + '列'
          : evidence.scopeType === 'box' ? '第' + ((evidence.scopeIndex || 0) + 1) + '宫' : scopeLabel;
        const isOutie = evidence.subtype === 'outie';
        const formulaStr = evidence.formula || (
          isOutie
            ? ((evidence.totalCageSum || '?') + ' - 45 - ' + (evidence.outsideFilledSum || 0) + ' = ' + num)
            : ('45 - ' + (evidence.sumFullyInside || '?') + ' - ' + (evidence.innieFilledSum || 0) + ' = ' + num)
        );
        // region：高亮 scope（宫/行/列）时说明"本区域 9 格恒和 45"
        defaultTexts.region = scopeName + ' 的 9 格之和恒为 45';
        if (isOutie) {
          // focus：承接求和步骤，直接给出最终算式
          defaultTexts.focus = '相交笼子和 - 45 = 外突格：' + formulaStr + ' → ' + targetName + ' = ' + num;
        } else {
          defaultTexts.focus = '45 - 完全在内笼和 = 内突格：' + formulaStr + ' → ' + targetName + ' = ' + num;
        }
        defaultTexts.eliminate = '确定 ' + num + ' 后，这里可以排除它。';
        break;
      }
      case 'hiddenSingle': {
        // Q13/Q14：隐数单文案——"数字 X 在某个区域只剩一个位置"。
        // 排除步骤逐个讲解原因（evidence.eliminatedPositions[].reasons 由 hint-system 归一化，
        // 如 ['列']/['笼']）——玩家必须看到"每格为什么不能放"，否则只看结论不理解
        const scopeTxt = evidence.scopeType === 'row' ? ('第' + ((evidence.scopeIndex || 0) + 1) + '行')
          : evidence.scopeType === 'col' ? ('第' + ((evidence.scopeIndex || 0) + 1) + '列')
          : evidence.scopeType === 'box' ? ('第' + ((evidence.scopeIndex || 0) + 1) + '宫') : '本区域';
        defaultTexts.region = '数字 ' + num + ' 在' + scopeTxt + '只剩一个位置';
        defaultTexts.focus = scopeTxt + '里 9 格都看过了：数字 ' + num + ' 只可能放在 ' + targetName + '——填 ' + num + '！';
        defaultTexts.eliminate = '这格确定了 ' + num + '，其他格排除它。';
        // Q14/Q15：逐格排除原因（reasons 标注：列/行/宫里已有该数，或笼和限制）。
        // "笼"原因具体化：查所在笼的格数与笼和，算出单格最大可能——
        // 例：f5 在 3 格笼和 10，单格最大 10-1-2=7，放不下 9
        if (eliminatedPositions && eliminatedPositions.length > 0) {
          defaultTexts.eliminateTexts = eliminatedPositions.map((p) => {
            const cn = this._cellName(p.row, p.col);
            const rs = Array.isArray(p.reasons) && p.reasons.length ? p.reasons : null;
            if (rs) {
              const why = rs.map((r) => {
                if (r === '列') return '同列已有 ' + num;
                if (r === '行') return '同行已有 ' + num;
                if (r === '宫') return '同宫已有 ' + num;
                if (r === '笼') {
                  const cg = this._findCageAt(p.row, p.col);
                  if (cg && typeof cg.sum === 'number' && Array.isArray(cg.cells) && cg.cells.length >= 2) {
                    const n = cg.cells.length;
                    const maxCell = cg.sum - (n - 1) * n / 2; // 单格最大可能 = 笼和 - 最小 n-1 数和
                    return '所在' + n + '格笼和' + cg.sum + '，单格最大' + maxCell + '，放不下 ' + num;
                  }
                  return '笼和限制';
                }
                return r;
              }).join('、');
              return cn + ' 排除 ' + num + '（' + why + '）';
            }
            return cn + ' 排除 ' + num + '。';
          });
        }
        break;
      }
      case 'cageUnique': {
        // Q10/Q14：cageUnique 讲解补全推理链——"笼和 → 唯一组合 → 另一格被排除 → 目标格锁定"。
        // 补充其他格的具体排除依据（evidence.otherCellReasons，逐格带原因）
        const cageSum = evidence.cageSum;
        const combos = Array.isArray(evidence.combos) ? evidence.combos : null;
        const cageCellCnt = (Array.isArray(evidence.cageCells) ? evidence.cageCells.length : 0);
        // 组合字符串：[3,9] 或 3+9
        let comboStr = '';
        if (combos && combos.length === 1 && Array.isArray(combos[0])) {
          comboStr = combos[0].join('+');
        } else if (combos && combos.length > 0) {
          comboStr = (combos[0] || []).join('+');
        }
        if (cageSum && cageCellCnt > 1 && comboStr) {
          defaultTexts.region = '笼子和 ' + cageSum + '，' + cageCellCnt + ' 格唯一组合只能是 ' + comboStr;
          // Q14：具体指出另一格是谁、为什么被排除（有数据时）；否则通用文案
          const ocr = Array.isArray(evidence.otherCellReasons) ? evidence.otherCellReasons : [];
          if (ocr.length > 0) {
            const parts = ocr.map((o) => {
              // Q14：otherCellReasons 格子坐标可能是 {cell:[r,c]}（tech-rater）或 {row,col}（归一化后）
              let or = o.row, oc = o.col;
              if (typeof or !== 'number' && Array.isArray(o.cell) && o.cell.length >= 2) {
                or = o.cell[0]; oc = o.cell[1];
              }
              const cn = (typeof or === 'number' && typeof oc === 'number') ? this._cellName(or, oc) : '另一格';
              const rs = Array.isArray(o.reasons) && o.reasons.length ? o.reasons : null;
              const why = rs ? rs.map((r) => {
                if (r === '行') return '同行已有 ' + num;
                if (r === '列') return '同列已有 ' + num;
                if (r === '宫') return '同宫已有 ' + num;
                if (r === '候选约束') return '候选被排除';
                return r;
              }).join('、') : '';
              return cn + (why ? '（' + why + '）' : '');
            }).join('、');
            defaultTexts.focus = '另一格 ' + parts + ' 被排除，所以 ' + targetName + ' 锁定 ' + num + '（' + comboStr + '）';
          } else {
            defaultTexts.focus = '另一格被行/列/宫排除，所以 ' + targetName + ' 锁定 ' + num + '（' + comboStr + '）';
          }
        } else {
          defaultTexts.region = '笼子唯一组合：和为 ' + (cageSum || '?') + ' 的笼子';
          defaultTexts.focus = targetName + ' 只能填 ' + num + '（笼子唯一组合）';
        }
        break;
      }
      default:
        break;
    }

    // eliminateTexts：逐格或统一
    if (eliminatedPositions && eliminatedPositions.length > 0 && defaultTexts.eliminateTexts.length === 0) {
      const per = defaultTexts.eliminate;
      defaultTexts.eliminateTexts = eliminatedPositions.map(() => per);
    }
    return defaultTexts;
  }

  /**
   * 双区域动画：xWing / swordfish（2026-08-03）
   * 生成多行+多列高亮 + 逐格叙事（每步带 text）的动作序列
   * @param {Object} hint - HintSystem.getHint() 返回对象
   * @returns {Object|null}
   * @private
   */
  _convertDualRegion(hint) {
    const evidence = hint.evidence || {};
    const rows = Array.isArray(evidence.rows) ? evidence.rows : [];
    const cols = Array.isArray(evidence.cols) ? evidence.cols : [];
    const cells = Array.isArray(evidence.cells) ? evidence.cells : [];
    const eliminated = Array.isArray(evidence.eliminatedCells)
      ? evidence.eliminatedCells
      : (Array.isArray(evidence.eliminatedPositions) ? evidence.eliminatedPositions : []);
    if (rows.length === 0 && cols.length === 0) return null;

    // 目标格
    let targetCell = null;
    if (hint.target && typeof hint.target.row === 'number') {
      targetCell = [hint.target.row, hint.target.col];
    } else if (hint.targetCells && hint.targetCells.length > 0) {
      const t = hint.targetCells[0];
      targetCell = [t.row, t.col];
    }
    if (!targetCell) targetCell = [0, 0];

    const num = evidence.num || (hint.target && hint.target.value) || 0;
    const techName = hint.techniqueName || '高级技巧';
    const targetValue = (hint.target && hint.target.value) || 0;
    const actions = [];

    // 0. 开场聚光灯
    actions.push({ type: 'spotlight', enabled: true, intensity: 0.5, text: null });

    if (rows.length > 0 && cols.length > 0) {
      const rowDesc = rows.map(r => '第' + (r + 1) + '行').join('、');
      const colDesc = cols.map(cc => '第' + (cc + 1) + '列').join('、');

      // 1. 开场叙事
      actions.push({
        type: 'narration',
        text: '看「' + techName + '」：数字 ' + num + ' 在 ' + rowDesc + ' 里，都只出现在相同的 ' + colDesc + '。',
        enabled: true,
      });
      // 2. 逐行高亮
      rows.forEach((r) => {
        actions.push({ type: 'highlightRow', row: r, enabled: true, text: '先看第' + (r + 1) + '行：' + num + ' 只能放在这 ' + colDesc + '。' });
      });
      // 3. 逐列高亮
      cols.forEach((cc) => {
        actions.push({ type: 'highlightCol', col: cc, enabled: true, text: '再看第' + (cc + 1) + '列：' + num + ' 也限制在这里。' });
      });
      // 4. 角格逐个标记
      cells.forEach((cell, i) => {
        actions.push({ type: 'highlightCell', r: cell[0], c: cell[1], mode: 'default', text: '这是第' + (i + 1) + '个角格：' + num + ' 的候选位置。' });
      });
      // 5. 排除红叉（逐格）
      eliminated.forEach((e) => {
        actions.push({ type: 'highlightCell', r: e.row, c: e.col, mode: 'eliminate', text: '这里可以排除 ' + (e.num !== undefined ? e.num : num) + '。' });
      });
      // 6. 结论聚焦
      actions.push({
        type: 'highlightCell', r: targetCell[0], c: targetCell[1], mode: 'pulse',
        text: '排除之后，' + this._cellName(targetCell[0], targetCell[1]) + ' 格就只剩一个数——填 ' + targetValue + '！',
      });
      actions.push({ type: 'highlightCell', r: targetCell[0], c: targetCell[1], mode: 'success', text: null });
      // 7. 收尾聚光灯
      actions.push({ type: 'spotlight', enabled: true, intensity: 0.35, text: null });
    }

    return {
      actions: actions,
      targetCell: targetCell,
      technique: hint.technique || null,
      explanation: hint.explanation || null,
      characterName: hint.characterName || null,
      dialogue: hint.dialogue || null,
    };
  }

  /**
   * 格子坐标名：b1 格式（行字母+列数字）
   * @param {number} r
   * @param {number} c
   * @returns {string}
   * @private
   */
  _cellName(r, c) {
    if (typeof r !== 'number' || typeof c !== 'number' || r < 0 || c < 0) return '';
    return String.fromCharCode(97 + r) + (c + 1);
  }

  /**
   * 判断某技巧是否被微型教学支持
   * @param {string} technique
   * @returns {boolean}
   */
  isSupported(technique) {
    return !!technique && this._supported.has(technique);
  }
}

export { HintAdapter };
export default new HintAdapter();
