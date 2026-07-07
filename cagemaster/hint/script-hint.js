// ==========================================
// 三步剧本式动画提示系统 v2
// ==========================================
// 基于求解器返回的 evidence 证据链，分三步展示推理过程
// 每一步都有具体的视觉元素和推导逻辑，不是空话
//
// 第1幕：锁定观察范围 - 告诉玩家"我们看哪里"，高亮相关区域
// 第2幕：推演过程 - 具体展示推导过程（排除了什么、怎么算的）
// 第3幕：锁定答案 - 高亮目标格，给出最终答案

const _scriptHint = {
  active: false,
  currentStep: 0,
  currentEvidence: null,
  overlayEl: null,
  canvas: null,
  ctx: null,
  timer: null,
  autoPlay: false,
  onClose: null,
  animFrame: null
};

// 全局提示激活状态，供其他模块（如角色台词系统）检测
window._scriptHintActive = false;
window.isHintActive = function() {
  return _scriptHint.active || window._scriptHintActive;
};

const SCRIPT_STEPS = [
  { name: '锁定观察范围', duration: 1800 },
  { name: '推演过程', duration: 3500 },
  { name: '锁定答案', duration: 0 }
];

// ==========================================
// 初始化
// ==========================================
function initScriptHint() {
  if (_scriptHint.overlayEl) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'script-hint-overlay';
  overlay.className = 'script-hint-overlay hidden';
  overlay.innerHTML = `
    <canvas id="script-hint-canvas"></canvas>
    <div class="script-hint-info">
      <div class="script-step-indicator">
        <span class="step-dot active" data-step="1"></span>
        <span class="step-line"></span>
        <span class="step-dot" data-step="2"></span>
        <span class="step-line"></span>
        <span class="step-dot" data-step="3"></span>
      </div>
      <div class="script-tech-name">技巧名称</div>
      <div class="script-step-title">第1幕 · 锁定观察范围</div>
      <div class="script-step-content">内容</div>
      <div class="script-hint-controls">
        <button class="script-btn script-prev">◀ 上一步</button>
        <button class="script-btn script-play">▶ 自动播放</button>
        <button class="script-btn script-next">下一步 ▶</button>
        <button class="script-btn script-close">✕ 关闭</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  _scriptHint.overlayEl = overlay;
  
  overlay.querySelector('.script-prev').addEventListener('click', () => prevScriptStep());
  overlay.querySelector('.script-next').addEventListener('click', () => nextScriptStep());
  overlay.querySelector('.script-play').addEventListener('click', () => toggleScriptAutoPlay());
  overlay.querySelector('.script-close').addEventListener('click', () => closeScriptHint());
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeScriptHint();
  });
  
  const canvas = overlay.querySelector('#script-hint-canvas');
  _scriptHint.canvas = canvas;
  _scriptHint.ctx = canvas.getContext('2d');
}

// ==========================================
// 公开API
// ==========================================
function showScriptHint(evidence, onClose) {
  if (!evidence) return;
  
  initScriptHint();
  
  _scriptHint.active = true;
  window._scriptHintActive = true;
  _scriptHint.currentStep = 0;
  _scriptHint.currentEvidence = evidence;
  _scriptHint.onClose = onClose || null;
  
  _scriptHint.overlayEl.classList.remove('hidden');
  
  // 暂停环境台词播放，避免打扰
  if (typeof StoryEngine !== 'undefined') {
    StoryEngine.hideBubble();
    StoryEngine.interrupt();
  }
  // 暂停计时器（如果有）
  if (typeof pauseTimer === 'function') {
    pauseTimer();
  }
  
  // 根据目标格子位置动态调整弹窗位置，避免遮挡目标格
  const infoEl = _scriptHint.overlayEl.querySelector('.script-hint-info');
  const gameCanvas = document.getElementById('gameCanvas');
  if (evidence.targetCell && gameCanvas) {
    const [targetRow] = evidence.targetCell;
    const gameRect = gameCanvas.getBoundingClientRect();
    const cellHeight = gameRect.height / 9;
    const targetY = gameRect.top + targetRow * cellHeight + cellHeight / 2;
    const windowHeight = window.innerHeight;
    
    // 如果目标格在屏幕下半部分，弹窗显示在上面
    // 如果目标格在屏幕上半部分，弹窗显示在下面
    if (targetY > windowHeight * 0.55) {
      infoEl.style.marginTop = '0';
      infoEl.style.marginBottom = 'auto';
      infoEl.style.alignSelf = 'flex-start';
      infoEl.style.marginTop = '10vh';
    } else {
      infoEl.style.marginTop = '';
      infoEl.style.marginBottom = '';
      infoEl.style.alignSelf = '';
    }
  } else {
    // 没有目标格时，默认在下方
    infoEl.style.marginTop = '';
    infoEl.style.marginBottom = '';
    infoEl.style.alignSelf = '';
  }
  
  _resizeScriptCanvas();
  
  // 更新技巧名称（走i18n）
  const techNames = {
    nakedSingle: t('technique.names.nakedSingle'),
    cageUnique: t('technique.names.cageUnique') || '笼子唯一组合',
    hiddenSingle: t('technique.names.hiddenSingle'),
    rule45: t('ui.rule45.ruleName') || '星衡法则',
    nakedPair: t('technique.names.nakedPair'),
    hiddenPair: t('technique.names.hiddenPair'),
    pointingClaiming: t('technique.names.pointingClaiming') || '区块排除',
    nakedTriplet: t('technique.names.nakedTriple'),
    xWing: t('technique.names.xwing')
  };
  const techEl = _scriptHint.overlayEl.querySelector('.script-tech-name');
  techEl.textContent = techNames[evidence.type] || '推理';
  
  goToScriptStep(1);
}

function closeScriptHint() {
  if (!_scriptHint.active) return;
  
  _scriptHint.active = false;
  window._scriptHintActive = false;
  _scriptHint.autoPlay = false;
  
  if (_scriptHint.timer) {
    clearTimeout(_scriptHint.timer);
    _scriptHint.timer = null;
  }
  if (_scriptHint.animFrame) {
    cancelAnimationFrame(_scriptHint.animFrame);
    _scriptHint.animFrame = null;
  }
  
  _scriptHint.overlayEl.classList.add('hidden');
  
  if (_scriptHint.onClose) {
    _scriptHint.onClose();
    _scriptHint.onClose = null;
  }
  
  if (typeof refreshBoard === 'function') refreshBoard();
}

function goToScriptStep(step) {
  if (step < 1 || step > 3) return;
  
  _scriptHint.currentStep = step;
  
  // 更新指示器
  const dots = _scriptHint.overlayEl.querySelectorAll('.step-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i < step);
    dot.classList.toggle('current', i === step - 1);
  });
  
  // 更新标题和内容
  const stepInfo = _getStepInfo(step);
  _scriptHint.overlayEl.querySelector('.script-step-title').textContent = 
    `第${step}幕 · ${stepInfo.title}`;
  _scriptHint.overlayEl.querySelector('.script-step-content').innerHTML = stepInfo.content;
  
  // 更新按钮状态
  const playBtn = _scriptHint.overlayEl.querySelector('.script-play');
  playBtn.textContent = _scriptHint.autoPlay ? '⏸ 暂停' : '▶ 自动播放';
  _scriptHint.overlayEl.querySelector('.script-prev').disabled = step === 1;
  _scriptHint.overlayEl.querySelector('.script-next').disabled = step === 3;
  
  // 绘制
  _drawScriptStep(step);
  
  // 自动播放
  if (_scriptHint.autoPlay && step < 3) {
    const duration = SCRIPT_STEPS[step - 1].duration;
    if (_scriptHint.timer) clearTimeout(_scriptHint.timer);
    _scriptHint.timer = setTimeout(() => {
      if (_scriptHint.autoPlay && _scriptHint.active) {
        nextScriptStep();
      }
    }, duration);
  }
}

function nextScriptStep() {
  if (_scriptHint.currentStep < 3) {
    goToScriptStep(_scriptHint.currentStep + 1);
  }
}

function prevScriptStep() {
  if (_scriptHint.currentStep > 1) {
    goToScriptStep(_scriptHint.currentStep - 1);
  }
}

function toggleScriptAutoPlay() {
  _scriptHint.autoPlay = !_scriptHint.autoPlay;
  
  const playBtn = _scriptHint.overlayEl.querySelector('.script-play');
  playBtn.textContent = _scriptHint.autoPlay ? '⏸ 暂停' : '▶ 自动播放';
  
  if (_scriptHint.autoPlay && _scriptHint.currentStep < 3) {
    nextScriptStep();
  } else if (_scriptHint.timer) {
    clearTimeout(_scriptHint.timer);
    _scriptHint.timer = null;
  }
}

// ==========================================
// 步骤文案（按技巧类型定制）
// ==========================================
function _getStepInfo(step) {
  const ev = _scriptHint.currentEvidence;
  const type = ev.type || 'unknown';
  
  const generators = {
    nakedSingle: _getNakedSingleInfo,
    hiddenSingle: _getHiddenSingleInfo,
    cageUnique: _getCageUniqueInfo,
    rule45: _getRule45Info,
    default: _getDefaultInfo
  };
  
  const gen = generators[type] || generators.default;
  return gen(ev, step);
}

// --- 孤星 ---
function _getNakedSingleInfo(ev, step) {
  const targetVal = ev.targetValue || ev.num;
  const [tr, tc] = ev.targetCell;
  const candidates = ev.candidates || [targetVal];
  const cage = ev.cage;
  
  // 计算纯和值约束下的组合数（不考虑候选，只看和值+空格数）
  function _getPureCombos(targetSum, count) {
    const results = [];
    function helper(start, remaining, countLeft, current) {
      if (countLeft === 0) {
        if (remaining === 0) results.push([...current]);
        return;
      }
      for (let v = start; v <= 9; v++) {
        if (v > remaining) break;
        current.push(v);
        helper(v + 1, remaining - v, countLeft - 1, current);
        current.pop();
      }
    }
    helper(1, targetSum, count, []);
    return results;
  }
  
  if (step === 1) {
    return {
      title: '锁定观察范围',
      content: `我们来看 <b>第${tr+1}行第${tc+1}列</b> 这一格。<br>
        <span style="font-size:12px;color:#94a3b8;">
          一步步排除，看看最后剩下谁
        </span>`
    };
  } else if (step === 2) {
    const rowNums = ev.rowNumbers?.map(x => x.v) || [];
    const colNums = ev.colNumbers?.map(x => x.v) || [];
    const boxNums = ev.boxNumbers?.map(x => x.v) || [];
    
    const rowSet = new Set(rowNums);
    const colSet = new Set(colNums);
    const boxSet = new Set(boxNums);
    
    // 如果有笼子，且纯和值约束下就是唯一组合，直接用笼子约束解释
    if (cage && cage.emptyCount >= 2 && cage.remain !== undefined) {
      const pureCombos = _getPureCombos(cage.remain, cage.emptyCount);
      
      if (pureCombos.length === 1) {
        // 纯和值就是唯一组合
        const onlyCombo = pureCombos[0];
        const comboStr = onlyCombo.join('');
        
        let cageDesc = '';
        if (cage.filledNums && cage.filledNums.length > 0) {
          cageDesc = `同笼和为 <b>${cage.sum}</b>，已填 ${cage.filledNums.join('+')} = ${cage.filledSum}<br>
            剩余 <b>${cage.emptyCount}</b> 格，需凑 <b style="color:#f59e0b;">${cage.remain}</b>`;
        } else {
          cageDesc = `同笼和为 <b style="color:#f59e0b;">${cage.sum}</b>，共 ${cage.emptyCount} 格`;
        }
        
        // 分析：为什么目标格是 targetVal 而不是组合里的其他数？
        const otherNums = onlyCombo.filter(n => n !== targetVal);
        let reasonLines = [];
        
        // 检查1：组合里的其他数字是否被目标格所在的行/列/宫排除了
        const rowSet = new Set((ev.rowNumbers || []).map(x => x.v));
        const colSet = new Set((ev.colNumbers || []).map(x => x.v));
        const boxSet = new Set((ev.boxNumbers || []).map(x => x.v));
        const allSeen = new Set([...rowSet, ...colSet, ...boxSet]);
        
        const excludedByBasic = otherNums.filter(n => allSeen.has(n));
        if (excludedByBasic.length > 0) {
          const reasons = [];
          for (const n of excludedByBasic) {
            const r = [];
            if (rowSet.has(n)) r.push('行');
            if (colSet.has(n)) r.push('列');
            if (boxSet.has(n)) r.push('宫');
            reasons.push(`${n}（同${r.join('/')}已有）`);
          }
          reasonLines.push(`这一格不能填 <b style="color:#ef4444;">${excludedByBasic.join('、')}</b>：${reasons.join('，')}`);
        }
        
        // 检查2：笼子里的其他空格是否已经确定了数字（或者说只能填某个数）
        // 简化处理：如果组合里只有2个数，且其中一个被排除了，那目标格就是剩下的那个
        let conclusionReason = '';
        if (onlyCombo.length === 2) {
          const otherNum = otherNums[0];
          if (allSeen.has(otherNum)) {
            conclusionReason = `排除 ${otherNum} 后，只剩 ${targetVal} 可选`;
          } else {
            // 可能是另一格的位置约束导致另一格只能填那个数
            conclusionReason = `笼子里两格各取一个数字，这一格就是 ${targetVal}`;
          }
        } else {
          conclusionReason = `组合中只有 ${targetVal} 能放在这一格`;
        }
        
        return {
          title: '笼子唯一组合',
          content: `
            <div style="text-align:left;font-size:13px;line-height:1.9;">
              <div>${cageDesc}</div>
              <div style="margin-top:8px;">
                唯一组合：<b style="font-family:monospace;font-size:18px;color:#3b82f6;">${comboStr}</b>
              </div>
              <div style="margin-top:4px;font-size:12px;color:#64748b;">
                ${cage.emptyCount}个不重复数字，和为${cage.remain}，只有这一种可能
              </div>
              <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
                ${reasonLines.length > 0 ? reasonLines.map(l => `<div>${l}</div>`).join('') : ''}
                <div style="margin-top:6px;">
                  这一格只能是 <b style="color:#22c55e;font-size:16px;">${targetVal}</b>
                </div>
                <div style="margin-top:4px;font-size:12px;color:#64748b;">
                  ${conclusionReason}
                </div>
              </div>
            </div>
          `
        };
      }
    }
    
    // 如果有笼子信息，从笼子组合开始分析
    if (cage && cage.combos && cage.combos.length > 0 && cage.emptyCount >= 2) {
      const comboCount = cage.combos.length;
      const comboStr = cage.combos.slice(0, 6).map(c => c.join('')).join(' ');
      const moreText = cage.combos.length > 6 ? ` 等${cage.combos.length}种` : '';
      
      // 从所有组合中提取这一格可能的数字（组合中出现过的所有数字）
      const allCageNums = new Set();
      for (const combo of cage.combos) {
        for (const num of combo) {
          allCageNums.add(num);
        }
      }
      
      // 行/列/宫排除的数字（只排除这一格不能有的，不排除整个组合）
      const allSeenBasic = new Set([...rowSet, ...colSet, ...boxSet]);
      
      // 这一格在笼子约束下的候选 = 所有组合数字 - 行/列/宫排除的数字
      const cellCandidates = [];
      const eliminatedFromCage = [];
      for (const num of allCageNums) {
        if (allSeenBasic.has(num)) {
          eliminatedFromCage.push(num);
        } else {
          cellCandidates.push(num);
        }
      }
      cellCandidates.sort((a, b) => a - b);
      eliminatedFromCage.sort((a, b) => a - b);
      
      let cageFirstLine = '';
      if (cage.filledNums && cage.filledNums.length > 0) {
        cageFirstLine = `<div>同笼和为 <b>${cage.sum}</b>，已填 ${cage.filledNums.join('+')} = ${cage.filledSum}</div>
          <div>剩余 <b>${cage.emptyCount}</b> 格，需凑 <b style="color:#f59e0b;">${cage.remain}</b></div>`;
      } else {
        cageFirstLine = `<div>同笼和为 <b style="color:#f59e0b;">${cage.sum}</b>，共 ${cage.emptyCount} 格</div>`;
      }
      
      const allCageStr = [...allCageNums].sort((a,b)=>a-b).join('、');
      const elimStr = eliminatedFromCage.length > 0 ? eliminatedFromCage.join('、') : '无';
      const candStr = cellCandidates.length > 0 ? cellCandidates.join('、') : '无';
      
      return {
        title: '笼子约束',
        content: `
          <div style="text-align:left;font-size:13px;line-height:1.9;">
            ${cageFirstLine}
            <div style="margin-top:6px;">可能组合：<span style="font-family:monospace;font-weight:600;color:#3b82f6;">${comboStr}${moreText}</span></div>
            <div style="margin-top:4px;font-size:12px;color:#64748b;">
              组合中出现的数字：${allCageStr}
            </div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;">
              <div>这一格不能有：<b style="color:#ef4444;">${elimStr}</b></div>
              <div style="font-size:12px;color:#94a3b8;">
                （同行${rowSet.size}个 + 同列${colSet.size}个 + 同宫${boxSet.size}个）
              </div>
            </div>
            <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;">
              <div>这格可能是：<b style="color:#22c55e;font-size:15px;">${candStr}</b></div>
              <div style="margin-top:4px;font-size:12px;color:#64748b;">
                笼子候选 ${allCageNums.size} 个 − 排除 ${eliminatedFromCage.length} 个 = 剩 ${cellCandidates.length} 个
              </div>
            </div>
          </div>
        `
      };
    }
    
    // 没有笼子信息时，退回到原来的逐步排除方式
    const basicEliminated = new Set([...rowSet, ...colSet, ...boxSet]);
    const finalCands = candidates.length;
    const otherEliminationCount = 9 - basicEliminated.size - finalCands;
    const hasOtherConstraints = otherEliminationCount > 0;
    
    const rowStr = rowSet.size > 0 ? [...rowSet].sort((a,b)=>a-b).join('、') : '（无）';
    const colStr = colSet.size > 0 ? [...colSet].sort((a,b)=>a-b).join('、') : '（无）';
    const boxStr = boxSet.size > 0 ? [...boxSet].sort((a,b)=>a-b).join('、') : '（无）';
    
    let extraLine = '';
    if (hasOtherConstraints) {
      extraLine = `
        <div style="margin-top:6px;">笼子和值等约束：再排除 <b style="color:#ef4444;">${otherEliminationCount}</b> 个</div>
      `;
    }
    
    const candStr = candidates.length > 0 ? candidates.sort((a,b)=>a-b).join('、') : String(targetVal);
    
    return {
      title: '逐步排除',
      content: `
        <div style="text-align:left;font-size:13px;line-height:2;">
          <div>初始：1~9 都有可能 <span style="color:#94a3b8;">（9个）</span></div>
          <div>同行排除：<b style="color:#ef4444;">${rowStr}</b> <span style="color:#94a3b8;">（${rowSet.size}个）</span></div>
          <div>同列排除：<b style="color:#ef4444;">${colStr}</b> <span style="color:#94a3b8;">（${colSet.size}个）</span></div>
          <div>同宫排除：<b style="color:#ef4444;">${boxStr}</b> <span style="color:#94a3b8;">（${boxSet.size}个）</span></div>
          ${extraLine}
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;">
            <div>最后只剩：<b style="color:#22c55e;font-size:15px;">${candStr}</b></div>
            <div style="margin-top:4px;font-size:12px;color:#64748b;">
              每一格只能填一个数字，所以答案就是它
            </div>
          </div>
        </div>
      `
    };
  } else {
    return {
      title: '锁定答案',
      content: `所以这一格只能填 <span class="target-num">${targetVal}</span><br>
        <span style="font-size:12px;color:#94a3b8;">
          第${tr+1}行第${tc+1}列 = ${targetVal}
        </span>
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;text-align:left;">
          <div style="font-size:12px;color:#64748b;font-weight:600;">📝 复盘</div>
          <div style="font-size:12px;color:#475569;margin-top:4px;">
            这是<b>孤星（Naked Single）</b>：一格的笔记被行、列、宫、笼子排除到只剩一个数字。
          </div>
        </div>`
    };
  }
}

// --- 隐曜 ---
function _getHiddenSingleInfo(ev, step) {
  const targetVal = ev.targetValue || ev.num;
  const scopeNames = { row: '行', col: '列', box: '宫' };
  const scopeName = scopeNames[ev.scopeType] || '区域';
  const scopeNum = (ev.scopeIndex || 0) + 1;
  const posCount = ev.possiblePositions?.length || 0;
  const totalCells = 9;
  const [tr, tc] = ev.targetCell;
  
  if (step === 1) {
    return {
      title: '锁定观察范围',
      content: `我们来看 <b>第${scopeNum}${scopeName}</b>。<br>
        <span style="font-size:12px;color:#94a3b8;">
          找找数字 ${targetVal} 应该放在哪里
        </span>`
    };
  } else if (step === 2) {
    // 统计各类排除原因
    const elimByRow = [];
    const elimByCol = [];
    const elimByBox = [];
    const elimByCage = [];
    
    if (ev.eliminatedPositions) {
      for (const item of ev.eliminatedPositions) {
        const [r, c] = item.cell;
        const label = `第${r+1}行第${c+1}列`;
        if (item.reasons.includes('行')) elimByRow.push(label);
        if (item.reasons.includes('列')) elimByCol.push(label);
        if (item.reasons.includes('宫')) elimByBox.push(label);
        if (item.reasons.includes('笼')) elimByCage.push(label);
      }
    }
    
    let reasonLines = '';
    
    if (elimByCol.length > 0 && ev.scopeType === 'row') {
      reasonLines += `<div style="font-size:12px;color:#ef4444;">
        <span style="font-weight:bold;">❌ 同列已有 ${targetVal}：</span>${elimByCol.length} 格被排除
      </div>`;
    }
    if (elimByRow.length > 0 && ev.scopeType === 'col') {
      reasonLines += `<div style="font-size:12px;color:#ef4444;">
        <span style="font-weight:bold;">❌ 同行已有 ${targetVal}：</span>${elimByRow.length} 格被排除
      </div>`;
    }
    if (elimByBox.length > 0) {
      reasonLines += `<div style="font-size:12px;color:#ef4444;">
        <span style="font-weight:bold;">❌ 同宫已有 ${targetVal}：</span>${elimByBox.length} 格被排除
      </div>`;
    }
    if (elimByCage.length > 0) {
      reasonLines += `<div style="font-size:12px;color:#ef4444;">
        <span style="font-weight:bold;">❌ 笼子约束排除：</span>${elimByCage.length} 格被排除
      </div>`;
    }
    // 行隐曜也可能有宫排除
    if (elimByBox.length > 0 && ev.scopeType === 'row') {
      // 已经加过了
    }
    
    const eliminatedCount = ev.eliminatedPositions?.length || (totalCells - posCount);
    
    return {
      title: '推演过程',
      content: `
        <div style="text-align:left;font-size:13px;line-height:1.8;">
          <div>数字 <b style="color:#f59e0b;">${targetVal}</b> 在这一${scopeName}中：</div>
          <div>共 ${totalCells} 格，<b style="color:#ef4444;">${eliminatedCount} 格</b>被排除，只剩 <b style="color:#22c55e;">${posCount}</b> 个可能位置</div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #e2e8f0;">
            ${reasonLines}
          </div>
          <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #e2e8f0;">
            <div style="font-size:12px;color:#64748b;">
              💡 数独规则：每行/列/宫必须包含 1~9 各一次
            </div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;">
              既然 ${targetVal} 只能放这一格，那它就是答案
            </div>
          </div>
        </div>
      `
    };
  } else {
    return {
      title: '锁定答案',
      content: `所以 <span class="target-num">${targetVal}</span> 就在这里！<br>
        <span style="font-size:12px;color:#94a3b8;">
          第${tr+1}行第${tc+1}列 = ${targetVal}
        </span>
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;text-align:left;">
          <div style="font-size:12px;color:#64748b;font-weight:600;">📝 复盘</div>
          <div style="font-size:12px;color:#475569;margin-top:4px;">
            这是<b>隐曜（Hidden Single）</b>：在某一${scopeName}中，数字 ${targetVal} 只有这一个位置可放，虽然这格还有其他笔记，但 ${targetVal} 只能在这里。
          </div>
        </div>`
    };
  }
}

// --- 笼子唯一组合 ---
function _getCageUniqueInfo(ev, step) {
  const targetVal = ev.targetValue || ev.num;
  const cageSum = ev.cageSum || 0;
  const comboCount = ev.comboCount || 0;
  const cellCount = ev.cageCells?.length || 0;
  const combos = ev.combos || [];
  const [tr, tc] = ev.targetCell;
  
  if (step === 1) {
    let cageDesc = '';
    if (ev.filledNums && ev.filledNums.length > 0) {
      cageDesc = `已填 ${ev.filledNums.join('+')} = ${ev.filledSum}，<br>
        剩余 <b>${ev.emptyCount}</b> 格，需凑 <b style="color:#f59e0b;">${ev.remain}</b>`;
    } else {
      cageDesc = `共 <b>${ev.emptyCount || cellCount}</b> 个空格`;
    }
    
    return {
      title: '锁定观察范围',
      content: `我们来看这个和为 <b style="color:#f59e0b;">${cageSum}</b> 的笼子。<br>
        <span style="font-size:12px;color:#94a3b8;">
          ${cageDesc}
        </span>`
    };
  } else if (step === 2) {
    // 列出所有组合
    let comboList = '';
    if (combos.length > 0) {
      const comboStrs = combos.map(c => 
        `<span style="font-family:monospace;background:#eff6ff;color:#1d4ed8;padding:2px 6px;border-radius:4px;margin:2px;display:inline-block;">${c.join('')}</span>`
      );
      comboList = `<div style="margin-top:6px;">${comboStrs.join('')}</div>`;
    }
    
    // 解释：为什么 targetVal 在每一种组合中都出现（必现）
    let mustAppearReason = '';
    if (combos.length === 1) {
      // 只有唯一组合
      mustAppearReason = `
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
          <div>💡 这是<b>唯一组合</b>：笼子里只能是这 ${combos[0].length} 个数字</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">
            ${ev.emptyCount} 个不同数字，和为 ${ev.remain}，只有这一种可能
          </div>
        </div>
      `;
    } else {
      // 多种组合，但目标值必现
      mustAppearReason = `
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
          <div>💡 关键发现：<b style="color:#22c55e;">${targetVal}</b> 在每一种组合里都出现</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">
            不管是哪种组合，${targetVal} 都一定在这个笼子里
          </div>
        </div>
      `;
    }
    
    // 解释：为什么只有目标格能放 targetVal
    let placementReason = '';
    if (ev.otherCellReasons && ev.otherCellReasons.length > 0) {
      const reasonLines = ev.otherCellReasons.map(item => {
        const [r, c] = item.cell;
        const reasonStr = item.reasons.map(rName => 
          rName === '候选约束' ? '笔记不含' : `同${rName}已有${targetVal}`
        ).join('、');
        return `<div style="font-size:12px;color:#ef4444;">
          · 第${r+1}行第${c+1}列：${reasonStr}
        </div>`;
      }).join('');
      
      placementReason = `
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
          <div>🔍 那 ${targetVal} 放在笼子的哪一格呢？</div>
          <div style="margin-top:4px;">
            ${reasonLines}
          </div>
          <div style="margin-top:6px;font-size:13px;">
            所以 <b style="color:#22c55e;">第${tr+1}行第${tc+1}列</b> 是唯一能放 ${targetVal} 的位置
          </div>
        </div>
      `;
    } else {
      placementReason = `
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
          <div>🔍 笼子里只有这一格能放 ${targetVal}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">
            其他格子的笔记中都不含 ${targetVal}
          </div>
        </div>
      `;
    }
    
    return {
      title: '推演过程',
      content: `
        <div style="text-align:left;font-size:13px;line-height:1.8;">
          <div>${ev.emptyCount}格不重复数字，和为 <b style="color:#f59e0b;">${ev.remain}</b></div>
          <div>可能的组合共 <b style="color:#3b82f6;">${comboCount}</b> 种：</div>
          ${comboList}
          ${mustAppearReason}
          ${placementReason}
        </div>
      `
    };
  } else {
    const uniqueType = combos.length === 1 ? '唯一组合' : '必现数字';
    return {
      title: '锁定答案',
      content: `所以这一格填 <span class="target-num">${targetVal}</span><br>
        <span style="font-size:12px;color:#94a3b8;">
          第${tr+1}行第${tc+1}列 = ${targetVal}
        </span>
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;text-align:left;">
          <div style="font-size:12px;color:#64748b;font-weight:600;">📝 复盘</div>
          <div style="font-size:12px;color:#475569;margin-top:4px;">
            这是<b>笼子唯一组合</b>（${uniqueType}）：根据笼子的和值约束，${targetVal} 一定在这个笼子里，而且只有这一格能放。
          </div>
        </div>`
    };
  }
}

// --- 星衡法则 ---
function _getRule45Info(ev, step) {
  const scopeNames = { row: '行', col: '列', box: '宫' };
  const scopeName = scopeNames[ev.scopeType] || '区域';
  const scopeNum = (ev.scopeIndex || 0) + 1;
  const isOutie = ev.subtype === 'outie';
  const targetVal = ev.targetValue || ev.num;
  const [tr, tc] = ev.targetCell;
  
  if (step === 1) {
    return {
      title: '锁定观察范围',
      content: `我们来观察 <b>第${scopeNum}${scopeName}</b>。<br>
        <span style="font-size:12px;color:#94a3b8;">
          💡 星衡法则：每一${scopeName}的9个数字之和一定是 45
        </span>`
    };
  } else if (step === 2) {
    if (isOutie) {
      // Outie 解释：从"笼子覆盖了哪些格子"的角度讲
      const outsideEmptyCount = (ev.outsideCells || []).filter(([r,c]) => {
        if (!gameBoard?.cells?.[r]?.[c]) return true;
        return !(gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum);
      }).length;
      const outsideFilledCount = (ev.outsideCells || []).length - outsideEmptyCount;
      
      return {
        title: '推演过程',
        content: `
          <div style="text-align:left;font-size:13px;line-height:1.9;">
            <div><b style="color:#6366f1;">第一步：理解原理</b></div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;">
              与这一${scopeName}相交的笼子，覆盖了：
              <br>· ${scopeName}内全部 9 格（和为 45）
              <br>· ${scopeName}外的 ${ev.outsideCells?.length || 0} 格（伸出部分）
            </div>
            
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
              <div><b style="color:#6366f1;">第二步：计算伸出部分的总和</b></div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">
                所有相交笼子的和 = ${ev.totalCageSum}
              </div>
              <div style="font-family:monospace;color:#3b82f6;font-size:14px;margin-top:4px;background:#eff6ff;padding:6px 10px;border-radius:6px;display:inline-block;">
                ${ev.totalCageSum} − 45 = <b>${ev.sumOutsideValues}</b>
              </div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">
                伸出的 ${ev.outsideCells?.length || 0} 格之和 = ${ev.sumOutsideValues}
              </div>
            </div>
            
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
              <div><b style="color:#6366f1;">第三步：求出目标格</b></div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">
                伸出部分中：
                ${outsideFilledCount > 0 ? `<br>· 已填 ${outsideFilledCount} 格，和为 ${ev.outsideFilledSum || 0}` : ''}
                <br>· 只剩 <b>1 个空格</b>
              </div>
              <div style="font-family:monospace;color:#3b82f6;font-size:14px;margin-top:4px;background:#eff6ff;padding:6px 10px;border-radius:6px;display:inline-block;">
                ${ev.sumOutsideValues} − ${ev.outsideFilledSum || 0} = <b style="color:#22c55e;">${targetVal}</b>
              </div>
            </div>
          </div>
        `
      };
    } else {
      // Innie 解释
      const innieEmptyCount = (ev.innieCells || []).filter(([r,c]) => {
        if (!gameBoard?.cells?.[r]?.[c]) return true;
        return !(gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum);
      }).length;
      const innieFilledCount = (ev.innieCells || []).length - innieEmptyCount;
      
      return {
        title: '推演过程',
        content: `
          <div style="text-align:left;font-size:13px;line-height:1.9;">
            <div><b style="color:#6366f1;">第一步：理解原理</b></div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;">
              完全在${scopeName}内的笼子，已经占据了一部分格子。
              <br>剩下的格子 = ${scopeName}内 9 格 − 完全在内的笼子格子
            </div>
            
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
              <div><b style="color:#6366f1;">第二步：计算剩余格子的总和</b></div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">
                完全在内的笼子和 = ${ev.sumFullyInside}
              </div>
              <div style="font-family:monospace;color:#3b82f6;font-size:14px;margin-top:4px;background:#eff6ff;padding:6px 10px;border-radius:6px;display:inline-block;">
                45 − ${ev.sumFullyInside} = <b>${ev.sumInnieValues}</b>
              </div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">
                剩余 ${ev.innieCells?.length || 0} 格之和 = ${ev.sumInnieValues}
              </div>
            </div>
            
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;">
              <div><b style="color:#6366f1;">第三步：求出目标格</b></div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">
                剩余格子中：
                ${innieFilledCount > 0 ? `<br>· 已填 ${innieFilledCount} 格，和为 ${ev.innieFilledSum || 0}` : ''}
                <br>· 只剩 <b>1 个空格</b>
              </div>
              <div style="font-family:monospace;color:#3b82f6;font-size:14px;margin-top:4px;background:#eff6ff;padding:6px 10px;border-radius:6px;display:inline-block;">
                ${ev.sumInnieValues} − ${ev.innieFilledSum || 0} = <b style="color:#22c55e;">${targetVal}</b>
              </div>
            </div>
          </div>
        `
      };
    }
  } else {
    const outieInnie = isOutie ? '外突（Outie）' : '内突（Innie）';
    const keyIdea = isOutie 
      ? `相交笼子的和 = 45 + 伸出部分的和，反推出伸出格的值`
      : `45 - 完全在内的笼子和 = 剩余格子的和，反推出内缩格的值`;
    return {
      title: '锁定答案',
      content: `所以这一格就是 <span class="target-num">${targetVal}</span>！<br>
        <span style="font-size:12px;color:#94a3b8;">
          第${tr+1}行第${tc+1}列 = ${targetVal}
        </span>
        <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;text-align:left;">
          <div style="font-size:12px;color:#64748b;font-weight:600;">📝 复盘</div>
          <div style="font-size:12px;color:#475569;margin-top:4px;">
            这是<b>星衡法则 · ${outieInnie}</b>：利用"每行/列/宫的和为45"，${keyIdea}。
          </div>
        </div>`
    };
  }
}

// --- 默认 ---
function _getDefaultInfo(ev, step)  {
  const targetVal = ev.targetValue || ev.num;
  if (step === 1) {
    return { title: '锁定观察范围', content: '我们来看看这道题...' };
  } else if (step === 2) {
    return { title: '推演过程', content: '根据已知条件进行推理...' };
  } else {
    const [tr, tc] = ev.targetCell || [0, 0];
    return { 
      title: '锁定答案', 
      content: `所以这一格填 <span class="target-num">${targetVal}</span><br>
        <span style="font-size:12px;color:#94a3b8;">
          第${tr+1}行第${tc+1}列 = ${targetVal}
        </span>` 
    };
  }
}

// ==========================================
// 绘制逻辑
// ==========================================
function _drawScriptStep(step) {
  const canvas = _scriptHint.canvas;
  const ctx = _scriptHint.ctx;
  const ev = _scriptHint.currentEvidence;
  
  if (!canvas || !ctx || !ev) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const gameCanvas = document.getElementById('gameCanvas');
  if (!gameCanvas) return;
  
  const gameRect = gameCanvas.getBoundingClientRect();
  const overlayRect = _scriptHint.overlayEl.getBoundingClientRect();
  
  const offsetX = gameRect.left - overlayRect.left;
  const offsetY = gameRect.top - overlayRect.top;
  
  const boardSize = Math.min(gameRect.width, gameRect.height);
  const cellSize = boardSize / 9;
  
  // 第1步：锁定观察范围
  if (step >= 1) {
    _drawStep1Scope(ctx, ev, offsetX, offsetY, cellSize);
  }
  
  // 第2步：推演过程
  if (step >= 2) {
    _drawStep2Reasoning(ctx, ev, offsetX, offsetY, cellSize);
  }
  
  // 第3步：锁定答案
  if (step >= 3) {
    _drawStep3Target(ctx, ev, offsetX, offsetY, cellSize);
  }
}

// --- 第1步：锁定观察范围 ---
function _drawStep1Scope(ctx, ev, offsetX, offsetY, cellSize) {
  const type = ev.type;
  
  if (type === 'nakedSingle') {
    // 高亮目标格所在的行、列、宫
    const [r, c] = ev.targetCell;
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    
    // 行
    for (let cc = 0; cc < 9; cc++) {
      ctx.fillRect(offsetX + cc * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    }
    // 列
    for (let rr = 0; rr < 9; rr++) {
      ctx.fillRect(offsetX + c * cellSize, offsetY + rr * cellSize, cellSize, cellSize);
    }
    // 宫
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        ctx.fillRect(
          offsetX + (bc + dc) * cellSize,
          offsetY + (br + dr) * cellSize,
          cellSize, cellSize
        );
      }
    }
    
    // 目标格标记（稍深一点）
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    
    // 目标格边框
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(
      offsetX + c * cellSize + 1,
      offsetY + r * cellSize + 1,
      cellSize - 2,
      cellSize - 2
    );
    
  } else if (type === 'hiddenSingle') {
    // 高亮整个区域（行/列/宫）
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    
    if (ev.scopeType === 'row') {
      const r = ev.scopeIndex;
      for (let c = 0; c < 9; c++) {
        ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
      }
      // 边框
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(offsetX, offsetY + r * cellSize, cellSize * 9, cellSize);
      
    } else if (ev.scopeType === 'col') {
      const c = ev.scopeIndex;
      for (let r = 0; r < 9; r++) {
        ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
      }
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(offsetX + c * cellSize, offsetY, cellSize, cellSize * 9);
      
    } else if (ev.scopeType === 'box') {
      const br = Math.floor(ev.scopeIndex / 3) * 3;
      const bc = (ev.scopeIndex % 3) * 3;
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          ctx.fillRect(
            offsetX + (bc + dc) * cellSize,
            offsetY + (br + dr) * cellSize,
            cellSize, cellSize
          );
        }
      }
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(offsetX + bc * cellSize, offsetY + br * cellSize, cellSize * 3, cellSize * 3);
    }
    
  } else if (type === 'cageUnique') {
    // 高亮整个笼子
    if (ev.cageCells && gameBoard?.cages) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      for (const [r, c] of ev.cageCells) {
        ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
      }
      // 笼子外边框
      _drawCageBorder(ctx, ev.cageCells, offsetX, offsetY, cellSize, 'rgba(245, 158, 11, 0.7)', 2.5);
    }
    
  } else if (type === 'rule45' && ev.scopeCells) {
    // 高亮整个scope区域
    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
    for (const [r, c] of ev.scopeCells) {
      ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
    }
    
    // scope边框
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
    ctx.lineWidth = 3;
    const minR = Math.min(...ev.scopeCells.map(c => c[0]));
    const maxR = Math.max(...ev.scopeCells.map(c => c[0]));
    const minC = Math.min(...ev.scopeCells.map(c => c[1]));
    const maxC = Math.max(...ev.scopeCells.map(c => c[1]));
    ctx.strokeRect(
      offsetX + minC * cellSize,
      offsetY + minR * cellSize,
      (maxC - minC + 1) * cellSize,
      (maxR - minR + 1) * cellSize
    );
  }
}

// --- 第2步：推演过程 ---
function _drawStep2Reasoning(ctx, ev, offsetX, offsetY, cellSize) {
  const type = ev.type;
  
  if (type === 'nakedSingle') {
    // 高亮行/列/宫中已有的数字（用金色标记排除数字）
    const allNumbers = [
      ...(ev.rowNumbers || []),
      ...(ev.colNumbers || []),
      ...(ev.boxNumbers || [])
    ];
    
    // 去重显示
    const seen = new Set();
    for (const { r, c, v } of allNumbers) {
      const key = r + ',' + c;
      if (seen.has(key)) continue;
      seen.add(key);
      
      // 金色背景标记"已被排除的数字"
      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.fillRect(offsetX + c * cellSize + 2, offsetY + r * cellSize + 2, cellSize - 4, cellSize - 4);
      
      // 数字
      ctx.fillStyle = '#d97706';
      ctx.font = `bold ${cellSize * 0.55}px -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v, offsetX + c * cellSize + cellSize / 2, offsetY + r * cellSize + cellSize / 2);
    }
    
    // 目标格：显示"？"
    const [tr, tc] = ev.targetCell;
    ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
    ctx.fillRect(offsetX + tc * cellSize + 2, offsetY + tr * cellSize + 2, cellSize - 4, cellSize - 4);
    ctx.fillStyle = '#15803d';
    ctx.font = `bold ${cellSize * 0.6}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', offsetX + tc * cellSize + cellSize / 2, offsetY + tr * cellSize + cellSize / 2);
    
  } else if (type === 'hiddenSingle') {
    const targetVal = ev.targetValue || ev.num;
    
    // 先画被排除的格子（红色叉号）
    if (ev.eliminatedPositions && ev.eliminatedPositions.length > 0) {
      for (const item of ev.eliminatedPositions) {
        const [r, c] = item.cell;
        // 淡红色背景
        ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
        ctx.fillRect(offsetX + c * cellSize + 2, offsetY + r * cellSize + 2, cellSize - 4, cellSize - 4);
        
        // 红色叉号
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 2;
        const pad = cellSize * 0.25;
        ctx.beginPath();
        ctx.moveTo(offsetX + c * cellSize + pad, offsetY + r * cellSize + pad);
        ctx.lineTo(offsetX + c * cellSize + cellSize - pad, offsetY + r * cellSize + cellSize - pad);
        ctx.moveTo(offsetX + c * cellSize + cellSize - pad, offsetY + r * cellSize + pad);
        ctx.lineTo(offsetX + c * cellSize + pad, offsetY + r * cellSize + cellSize - pad);
        ctx.stroke();
      }
    }
    
    // 再画可能的位置（蓝色标记）
    if (ev.possiblePositions && ev.possiblePositions.length > 0) {
      for (const [r, c] of ev.possiblePositions) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.fillRect(offsetX + c * cellSize + 2, offsetY + r * cellSize + 2, cellSize - 4, cellSize - 4);
        
        // 显示笔记数字
        ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
        ctx.font = `bold ${cellSize * 0.5}px -apple-system, "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(targetVal, offsetX + c * cellSize + cellSize / 2, offsetY + r * cellSize + cellSize / 2);
      }
    }
    
  } else if (type === 'cageUnique') {
    // 高亮笼子 + 标记目标格
    if (ev.cageCells) {
      // 笼子背景
      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      for (const [r, c] of ev.cageCells) {
        ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
      }
      _drawCageBorder(ctx, ev.cageCells, offsetX, offsetY, cellSize, 'rgba(245, 158, 11, 0.8)', 2.5);
      
      // 目标格（绿色标记）
      const [tr, tc] = ev.targetCell;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      ctx.fillRect(offsetX + tc * cellSize + 3, offsetY + tr * cellSize + 3, cellSize - 6, cellSize - 6);
    }
    
  } else if (type === 'rule45') {
    // 高亮参与计算的笼子
    if (ev.intersectingCages && gameBoard?.cages) {
      const cageIds = new Set(ev.intersectingCages);
      
      for (const cage of gameBoard.cages) {
        if (cageIds.has(cage.id)) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
          for (const [r, c] of cage.cells) {
            ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
          }
          _drawCageBorder(ctx, cage.cells, offsetX, offsetY, cellSize, 'rgba(245, 158, 11, 0.7)', 2);
        }
      }
    }
    
    // 标记伸出/内缩格
    const outsideCells = ev.outsideCells || ev.innieCells || [];
    if (outsideCells.length > 0) {
      for (const [r, c] of outsideCells) {
        // 只标记空格（目标格）
        const val = gameBoard?.cells?.[r]?.[c]?.fillNum || gameBoard?.cells?.[r]?.[c]?.fixedNum || 0;
        if (val === 0) {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
          ctx.fillRect(offsetX + c * cellSize + 2, offsetY + r * cellSize + 2, cellSize - 4, cellSize - 4);
        }
      }
    }
  }
}

// --- 第3步：锁定答案 ---
function _drawStep3Target(ctx, ev, offsetX, offsetY, cellSize) {
  if (!ev.targetCell) return;
  
  const [r, c] = ev.targetCell;
  const x = offsetX + c * cellSize;
  const y = offsetY + r * cellSize;
  const targetVal = ev.targetValue || ev.num;
  
  // 呼吸光效果
  const time = Date.now() / 1000;
  const pulse = 0.3 + 0.2 * Math.sin(time * 3);
  
  // 光晕
  ctx.fillStyle = `rgba(34, 197, 94, ${pulse + 0.25})`;
  ctx.fillRect(x - cellSize * 0.1, y - cellSize * 0.1, cellSize * 1.2, cellSize * 1.2);
  
  // 目标格
  ctx.fillStyle = 'rgba(34, 197, 94, 0.5)';
  ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
  
  // 边框
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
  
  // 数字
  ctx.fillStyle = '#15803d';
  ctx.font = `bold ${cellSize * 0.65}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(targetVal, x + cellSize / 2, y + cellSize / 2);
  
  // 继续动画
  if (_scriptHint.active && _scriptHint.currentStep === 3) {
    _scriptHint.animFrame = requestAnimationFrame(() => {
      if (_scriptHint.active && _scriptHint.currentStep === 3) {
        _drawScriptStep(3);
      }
    });
  }
}

// ==========================================
// 辅助函数
// ==========================================
function _drawCageBorder(ctx, cells, offsetX, offsetY, cellSize, color, lineWidth) {
  const cellSet = new Set(cells.map(([r, c]) => r + ',' + c));
  
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'square';
  
  for (const [r, c] of cells) {
    const x = offsetX + c * cellSize;
    const y = offsetY + r * cellSize;
    
    if (!cellSet.has((r - 1) + ',' + c)) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cellSize, y);
      ctx.stroke();
    }
    if (!cellSet.has((r + 1) + ',' + c)) {
      ctx.beginPath();
      ctx.moveTo(x, y + cellSize);
      ctx.lineTo(x + cellSize, y + cellSize);
      ctx.stroke();
    }
    if (!cellSet.has(r + ',' + (c - 1))) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + cellSize);
      ctx.stroke();
    }
    if (!cellSet.has(r + ',' + (c + 1))) {
      ctx.beginPath();
      ctx.moveTo(x + cellSize, y);
      ctx.lineTo(x + cellSize, y + cellSize);
      ctx.stroke();
    }
  }
}

function _resizeScriptCanvas() {
  const overlay = _scriptHint.overlayEl;
  const canvas = _scriptHint.canvas;
  if (!overlay || !canvas) return;
  
  canvas.width = overlay.clientWidth;
  canvas.height = overlay.clientHeight;
}

window.addEventListener('resize', () => {
  if (_scriptHint.active) {
    _resizeScriptCanvas();
    _drawScriptStep(_scriptHint.currentStep);
  }
});
