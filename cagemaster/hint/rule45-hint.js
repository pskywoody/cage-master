// ==========================================
// 星衡法则简化提示面板
// ==========================================
// 点击格子后显示：行/列/宫/笼 的和值信息
// 同时高亮相关区域

const _rule45Hint = {
  active: false,
  cell: null,    // {r, c}
  panelEl: null,
  highlights: {
    row: [],
    col: [],
    box: [],
    cage: [],
    outie: []
  }
};

// 颜色方案
const R45_COLORS = {
  highlight: 'rgba(99, 102, 241, 0.05)',    // 行/列/宫高亮 - 淡紫（更淡，不抢戏）
  cageFill: 'rgba(251, 146, 60, 0.35)',      // 笼子背景 - 橙（加深，更突出）
  cageSelected: 'rgba(251, 146, 60, 0.5)',  // 点击的格子 - 稍深一点（不再用强边框）
  cageGlow: 'rgba(249, 115, 22, 0.6)',       // 笼子外发光
  cageBorder: 'rgba(249, 115, 22, 0.5)',     // 笼子虚线边框
  outie: 'rgba(16, 185, 129, 0.25)',
  outieBorder: 'rgba(16, 185, 129, 0.7)',
  smart: '#f59e0b'
};

/**
 * 初始化：创建面板DOM
 */
function initRule45Hint() {
  if (_rule45Hint.panelEl) return;
  
  const panel = document.createElement('div');
  panel.id = 'rule45-hint-panel';
  panel.className = 'rule45-hint-panel hidden';
  panel.innerHTML = `
    <div class="r45-main">
      <div class="r45-dims">
        <div class="r45-item" data-type="box">
          <span class="r45-label">宫</span>
          <span class="r45-val"><span class="r45-cur">0</span><span class="r45-sep">/</span>45</span>
          <span class="r45-diff">+0</span>
        </div>
        <div class="r45-item" data-type="row">
          <span class="r45-label">行</span>
          <span class="r45-val"><span class="r45-cur">0</span><span class="r45-sep">/</span>45</span>
          <span class="r45-diff">+0</span>
        </div>
        <div class="r45-item" data-type="col">
          <span class="r45-label">列</span>
          <span class="r45-val"><span class="r45-cur">0</span><span class="r45-sep">/</span>45</span>
          <span class="r45-diff">+0</span>
        </div>
      </div>
      <div class="r45-cage">
        <span class="r45-cage-label">笼</span>
        <span class="r45-cage-sum"><b>0</b></span>
        <span class="r45-cage-info">已填0 剩0</span>
        <span class="r45-cage-combos">--</span>
      </div>
      <span class="r45-close" onclick="hideRule45Hint()" title="关闭">×</span>
    </div>
    <div class="r45-reason hidden">
      <span class="r45-reason-icon">💡</span>
      <span class="r45-reason-text"></span>
    </div>
  `;
  
  // 插入到 board-area 内部，canvas 前面
  const boardArea = document.getElementById('board-area');
  if (boardArea) {
    boardArea.insertBefore(panel, boardArea.firstChild);
  } else {
    document.body.appendChild(panel);
  }
  _rule45Hint.panelEl = panel;
  
  // ESC键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _rule45Hint.active) {
      hideRule45Hint();
    }
  });
}

/**
 * 显示星衡法则提示（点击格子时调用）
 */
function showRule45Hint(r, c) {
  if (!gameBoard.cages || gameBoard.cages.length === 0) return;
  if (gameBoard.size !== 9) return;
  
  initRule45Hint();
  
  _rule45Hint.active = true;
  _rule45Hint.cell = { r, c };
  
  // 计算数据
  const data = _calcRule45Data(r, c);
  
  // 更新面板内容
  _updatePanelContent(data);
  
  // 更新高亮
  _updateHighlights(data);
  
  // 显示面板
  const panel = _rule45Hint.panelEl;
  panel.classList.remove('hidden');
  
  refreshBoard();
}

/**
 * 隐藏星衡法则提示
 */
function hideRule45Hint() {
  if (!_rule45Hint.active) return;
  
  _rule45Hint.active = false;
  _rule45Hint.cell = null;
  
  if (_rule45Hint.panelEl) {
    _rule45Hint.panelEl.classList.add('hidden');
  }
  
  // 清除高亮
  _clearHighlights();
  
  refreshBoard();
}

/**
 * 计算星衡法则数据
 */
function _calcRule45Data(r, c) {
  const result = {
    row: { index: r, sum: 0, filled: 0, empty: 0 },
    col: { index: c, sum: 0, filled: 0, empty: 0 },
    box: { index: Math.floor(r/3)*3 + Math.floor(c/3), sum: 0, filled: 0, empty: 0 },
    cage: null,
    smartType: null   // 最有价值的维度类型
  };
  
  // 行
  for (let cc = 0; cc < 9; cc++) {
    const v = gameBoard.cells[r][cc].fillNum || gameBoard.cells[r][cc].fixedNum || 0;
    if (v > 0) {
      result.row.sum += v;
      result.row.filled++;
    } else {
      result.row.empty++;
    }
  }
  
  // 列
  for (let rr = 0; rr < 9; rr++) {
    const v = gameBoard.cells[rr][c].fillNum || gameBoard.cells[rr][c].fixedNum || 0;
    if (v > 0) {
      result.col.sum += v;
      result.col.filled++;
    } else {
      result.col.empty++;
    }
  }
  
  // 宫
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const rr = br + dr, cc = bc + dc;
      const v = gameBoard.cells[rr][cc].fillNum || gameBoard.cells[rr][cc].fixedNum || 0;
      if (v > 0) {
        result.box.sum += v;
        result.box.filled++;
      } else {
        result.box.empty++;
      }
    }
  }
  
  // 笼子
  const cage = _getCageAt(r, c);
  if (cage) {
    result.cage = {
      id: cage.id,
      sum: cage.sum,
      cells: cage.cells,
      filled: 0,
      filledSum: 0,
      empty: 0,
      emptyCount: 0
    };
    
    for (const [cr, cc] of cage.cells) {
      const v = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
      if (v > 0) {
        result.cage.filled++;
        result.cage.filledSum += v;
      } else {
        result.cage.empty++;
        result.cage.emptyCount++;
      }
    }
    result.cage.remain = cage.sum - result.cage.filledSum;
    
    // 收集笼子里已填的数字（组合中不能再出现这些数字）
    const filledNums = new Set();
    for (const [cr, cc] of cage.cells) {
      const v = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
      if (v > 0) {
        filledNums.add(v);
      }
    }
    
    // 计算可能组合（只排除笼子内已填数字，行/列/宫约束由玩家自行判断）
    result.cage.combos = _getCageCombos(cage.sum - result.cage.filledSum, result.cage.empty, filledNums);
    
    // 如果只剩1格，验证这个数字在目标格是否合法
    if (result.cage.empty === 1 && result.cage.remain >= 1 && result.cage.remain <= 9) {
      // 找到那个空格子
      let emptyCell = null;
      for (const [cr, cc] of cage.cells) {
        const v = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
        if (v === 0) {
          emptyCell = [cr, cc];
          break;
        }
      }
      
      if (emptyCell) {
        const [er, ec] = emptyCell;
        const remainVal = result.cage.remain;
        let conflict = false;
        const conflictReasons = [];
        
        // 检查行是否已有该数字
        for (let i = 0; i < 9; i++) {
          const v = gameBoard.cells[er][i].fillNum || gameBoard.cells[er][i].fixedNum || 0;
          if (v === remainVal) {
            conflict = true;
            conflictReasons.push('同行已有');
            break;
          }
        }
        
        // 检查列是否已有该数字
        for (let i = 0; i < 9; i++) {
          const v = gameBoard.cells[i][ec].fillNum || gameBoard.cells[i][ec].fixedNum || 0;
          if (v === remainVal) {
            conflict = true;
            if (!conflictReasons.some(r => r.includes('列'))) conflictReasons.push('同列已有');
            break;
          }
        }
        
        // 检查宫是否已有该数字
        const boxW = 3, boxH = 3;
        const br = Math.floor(er / boxH) * boxH;
        const bc = Math.floor(ec / boxW) * boxW;
        for (let dr = 0; dr < boxH; dr++) {
          for (let dc = 0; dc < boxW; dc++) {
            const v = gameBoard.cells[br + dr][bc + dc].fillNum || gameBoard.cells[br + dr][bc + dc].fixedNum || 0;
            if (v === remainVal) {
              conflict = true;
              if (!conflictReasons.some(r => r.includes('宫'))) conflictReasons.push('同宫已有');
              break;
            }
          }
          if (conflictReasons.some(r => r.includes('宫'))) break;
        }
        
        // 额外检查：笔记中是否包含这个值（更全面的约束检查）
        if (!conflict && gameBoard.cells[er][ec].candidates && gameBoard.cells[er][ec].candidates.size > 0) {
          if (!gameBoard.cells[er][ec].candidates.has(remainVal)) {
            conflict = true;
            conflictReasons.push('笔记排除');
          }
        }
        
        result.cage.singleRemainValid = !conflict;
        result.cage.singleRemainCell = emptyCell;
        result.cage.singleRemainConflict = conflict ? conflictReasons : null;
      }
    }
  }
  
  // 智能推荐：找"最接近出答案"的维度
  // 评分：空位数越少、差值越明确越好
  const scores = {
    row: _calcSmartScore(result.row, 'row', r, c),
    col: _calcSmartScore(result.col, 'col', r, c),
    box: _calcSmartScore(result.box, 'box', r, c)
  };
  
  let bestType = 'box';
  let bestScore = -Infinity;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  result.smartType = bestType;
  
  return result;
}

/**
 * 计算智能推荐分数
 */
function _calcSmartScore(dimData, type, r, c) {
  let score = 0;
  
  // 空位数越少越好（越接近完成）
  score += (9 - dimData.empty) * 2;
  
  // 差值越接近0越好
  const diff = Math.abs(45 - dimData.sum);
  score -= diff * 0.1;
  
  // 如果只有1个空位，直接出答案，加分最多
  if (dimData.empty === 1) {
    score += 100;
  }
  
  return score;
}

/**
 * 获取某个格子所在的笼子
 */
function _getCageAt(r, c) {
  if (!gameBoard.cages) return null;
  for (const cage of gameBoard.cages) {
    for (const [cr, cc] of cage.cells) {
      if (cr === r && cc === c) return cage;
    }
  }
  return null;
}

/**
 * 获取笼子可能的数字组合（考虑排除数字）
 */
function _getCageCombos(targetSum, count, excludedNums) {
  if (count <= 0 || targetSum <= 0) return [];
  if (count > 9) return [];
  if (targetSum < count * (count + 1) / 2) return [];  // 最小可能和
  if (targetSum > (45 - (9-count) * (10-count) / 2)) return []; // 最大可能和
  
  const excluded = excludedNums || new Set();
  const results = [];
  _comboHelper(targetSum, count, 1, [], results, excluded);
  return results.slice(0, 6); // 最多返回6个
}

function _comboHelper(target, count, start, current, results, excluded) {
  if (count === 0) {
    if (target === 0) {
      results.push([...current]);
    }
    return;
  }
  if (target <= 0 || start > 9) return;
  
  for (let v = start; v <= 9; v++) {
    if (v > target) break;
    if (excluded && excluded.has(v)) continue; // 跳过被排除的数字
    current.push(v);
    _comboHelper(target - v, count - 1, v + 1, current, results, excluded);
    current.pop();
    if (results.length >= 6) break;
  }
}

/**
 * 更新面板内容
 */
function _updatePanelContent(data) {
  const panel = _rule45Hint.panelEl;
  
  // 更新三个维度
  const items = panel.querySelectorAll('.r45-item');
  const types = ['box', 'row', 'col'];
  
  items.forEach((item, i) => {
    const type = types[i];
    const dim = data[type];
    const diff = 45 - dim.sum;
    const isSmart = type === data.smartType;
    
    item.querySelector('.r45-cur').textContent = dim.sum;
    const diffEl = item.querySelector('.r45-diff');
    
    // 如果只剩1格，直接显示答案！
    if (dim.empty === 1 && diff > 0 && diff <= 9) {
      diffEl.textContent = `= ${diff}`;
      diffEl.className = 'r45-diff answer';
    } else {
      diffEl.textContent = diff > 0 ? `+${diff}` : (diff < 0 ? `${diff}` : '✓');
      diffEl.className = 'r45-diff ' + (diff === 0 ? 'success' : (diff < 0 ? 'error' : ''));
    }
    
    item.classList.toggle('smart', isSmart);
  });
  
  // 更新笼子
  const cageEl = panel.querySelector('.r45-cage');
  const reasonEl = panel.querySelector('.r45-reason');
  const reasonTextEl = panel.querySelector('.r45-reason-text');
  let reasonText = '';
  
  if (data.cage) {
    cageEl.style.display = '';
    cageEl.querySelector('.r45-cage-sum b').textContent = data.cage.sum;
    
    const infoEl = cageEl.querySelector('.r45-cage-info');
    const combosEl = cageEl.querySelector('.r45-cage-combos');
    
    // 单格笼：直接说答案，说明原因
    if (data.cage.cells.length === 1) {
      if (data.cage.filled === 0) {
        infoEl.textContent = `单格笼，和就是答案`;
        infoEl.className = 'r45-cage-info answer';
        combosEl.textContent = `= ${data.cage.sum}`;
        combosEl.className = 'r45-cage-combos answer';
        reasonText = `杀手数独规则：笼子里所有数字的和等于笼子标的数。这笼子只有1格，所以这格 = ${data.cage.sum}`;
      } else {
        infoEl.textContent = '✓ 已填';
        infoEl.className = 'r45-cage-info success';
        combosEl.textContent = '';
        combosEl.className = 'r45-cage-combos';
      }
    }
    // 只剩1格：检查是否与行/列/宫冲突
    else if (data.cage.empty === 1) {
      const remainVal = data.cage.remain;
      const isValid = data.cage.singleRemainValid !== false; // 默认认为有效（兼容旧数据）
      
      if (isValid && remainVal >= 1 && remainVal <= 9) {
        // 没有冲突，可以直接填
        infoEl.textContent = `剩1格 = ${remainVal}`;
        infoEl.className = 'r45-cage-info answer';
        combosEl.textContent = '直接填';
        combosEl.className = 'r45-cage-combos answer';
        reasonText = `笼子和为${data.cage.sum}，已填${data.cage.filled}格共${data.cage.filledSum}，剩1格 = ${data.cage.sum} - ${data.cage.filledSum} = ${remainVal}`;
      } else {
        // 有冲突，不能直接填
        const conflictReasons = data.cage.singleRemainConflict || [];
        const conflictStr = conflictReasons.join('、');
        infoEl.textContent = `剩1格 = ${remainVal}？`;
        infoEl.className = 'r45-cage-info';
        combosEl.textContent = '有冲突';
        combosEl.className = 'r45-cage-combos';
        reasonText = `笼子和值算出剩1格=${remainVal}，但${conflictStr || '存在冲突'}，不能直接填。需要结合其他条件进一步排除。`;
      }
    }
    // 一般情况
    else {
      infoEl.textContent = `${data.cage.filled}/${data.cage.cells.length}格 差${data.cage.remain}`;
      infoEl.className = 'r45-cage-info';
      
      if (data.cage.combos && data.cage.combos.length > 0) {
        const count = data.cage.combos.length;
        const comboStr = data.cage.combos.map(c => c.join('')).join(' ');
        // 如果只有1种组合，强调显示
        if (count === 1) {
          combosEl.textContent = `唯一组合 ${comboStr}`;
          combosEl.className = 'r45-cage-combos answer';
          reasonText = `${data.cage.empty}格凑${data.cage.remain}，只有1种可能：${comboStr}`;
        } else {
          combosEl.textContent = `${count}种 ${comboStr}`;
          combosEl.className = 'r45-cage-combos';
        }
      } else if (data.cage.empty === 0) {
        combosEl.textContent = '✓';
        combosEl.className = 'r45-cage-combos success';
      } else {
        combosEl.textContent = '--';
        combosEl.className = 'r45-cage-combos';
      }
    }
  } else {
    cageEl.style.display = 'none';
  }
  
  // 更新"为什么"解释区域
  if (reasonText) {
    reasonTextEl.textContent = reasonText;
    reasonEl.classList.remove('hidden');
  } else {
    reasonEl.classList.add('hidden');
  }
}

/**
 * 更新高亮
 */
function _updateHighlights(data) {
  // 清除旧高亮
  _clearHighlights();
  
  const { r, c } = _rule45Hint.cell;
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  
  // 行高亮
  for (let cc = 0; cc < 9; cc++) {
    _addHighlight('row', r, cc);
  }
  
  // 列高亮
  for (let rr = 0; rr < 9; rr++) {
    _addHighlight('col', rr, c);
  }
  
  // 宫高亮
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      _addHighlight('box', br + dr, bc + dc);
    }
  }
  
  // 笼子高亮
  if (data.cage) {
    for (const [cr, cc] of data.cage.cells) {
      _addHighlight('cage', cr, cc);
    }
  }
}

/**
 * 添加高亮标记
 */
function _addHighlight(type, r, c) {
  if (!_rule45Hint.highlights[type]) {
    _rule45Hint.highlights[type] = [];
  }
  const key = r + ',' + c;
  if (!_rule45Hint.highlights[type].includes(key)) {
    _rule45Hint.highlights[type].push(key);
  }
}

/**
 * 清除所有高亮
 */
function _clearHighlights() {
  _rule45Hint.highlights = {
    row: [],
    col: [],
    box: [],
    cage: [],
    outie: []
  };
}

/**
 * 绘制星衡法则高亮（在renderer中调用）
 */
function drawRule45Highlights(ctx, cellSize, offsetX, offsetY) {
  if (!_rule45Hint.active) return;
  
  const allCells = new Set();
  
  // 1. 绘制行/列/宫背景高亮（淡紫色，最底层）
  const highlightTypes = ['row', 'col', 'box'];
  ctx.fillStyle = R45_COLORS.highlight;
  
  for (const type of highlightTypes) {
    for (const key of _rule45Hint.highlights[type]) {
      if (allCells.has(key)) continue;
      allCells.add(key);
      
      const [r, c] = key.split(',').map(Number);
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      ctx.fillRect(x, y, cellSize, cellSize);
    }
  }
  
  // 2. 绘制笼子高亮（橙色背景）
  if (_rule45Hint.highlights.cage.length > 0) {
    // 笼子背景填充
    ctx.fillStyle = R45_COLORS.cageFill;
    for (const key of _rule45Hint.highlights.cage) {
      const [r, c] = key.split(',').map(Number);
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      ctx.fillRect(x, y, cellSize, cellSize);
    }
    
    // 3. 给笼子整体画一个虚线外边框（关键！让玩家一眼看出笼子范围）
    _drawCageOutline(ctx, cellSize, offsetX, offsetY);
    
    // 4. 点击的格子：轻微加深标记（不再用强边框抢戏）
    if (_rule45Hint.cell) {
      const { r, c } = _rule45Hint.cell;
      const x = offsetX + c * cellSize;
      const y = offsetY + r * cellSize;
      ctx.fillStyle = R45_COLORS.cageSelected;
      ctx.fillRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
    }
  }
}

/**
 * 给笼子画整体虚线外边框
 * 思路：对每个格子，检查上下左右四个方向，如果相邻格不在笼子里，就画那条边
 */
function _drawCageOutline(ctx, cellSize, offsetX, offsetY) {
  const cageSet = new Set(_rule45Hint.highlights.cage);
  
  ctx.strokeStyle = R45_COLORS.cageBorder;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 3]); // 虚线
  
  for (const key of cageSet) {
    const [r, c] = key.split(',').map(Number);
    const x = offsetX + c * cellSize;
    const y = offsetY + r * cellSize;
    
    // 上边：上面没有同笼格子
    if (!cageSet.has(`${r-1},${c}`)) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cellSize, y);
      ctx.stroke();
    }
    // 下边
    if (!cageSet.has(`${r+1},${c}`)) {
      ctx.beginPath();
      ctx.moveTo(x, y + cellSize);
      ctx.lineTo(x + cellSize, y + cellSize);
      ctx.stroke();
    }
    // 左边
    if (!cageSet.has(`${r},${c-1}`)) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + cellSize);
      ctx.stroke();
    }
    // 右边
    if (!cageSet.has(`${r},${c+1}`)) {
      ctx.beginPath();
      ctx.moveTo(x + cellSize, y);
      ctx.lineTo(x + cellSize, y + cellSize);
      ctx.stroke();
    }
  }
  
  ctx.setLineDash([]); // 恢复实线
}

/**
 * 更新提示（填数后调用）
 */
function updateRule45Hint() {
  if (!_rule45Hint.active || !_rule45Hint.cell) return;
  showRule45Hint(_rule45Hint.cell.r, _rule45Hint.cell.c);
}
