// ==========================================
// 游戏入口 + 交互绑定
// ==========================================

// 降级用的默认关卡（接口异常时使用，保证不白屏）
const fallbackPuzzle = {
  cells: [
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0]
  ],
  cages: [
    { id: 1, sum: 15, cells: [[0,0],[0,1],[1,0]] },
    { id: 2, sum: 9,  cells: [[0,2],[1,2]] },
    { id: 3, sum: 12, cells: [[0,3],[0,4]] },
    { id: 4, sum: 8,  cells: [[0,5],[1,5]] },
    { id: 5, sum: 14, cells: [[0,6],[0,7]] },
    { id: 6, sum: 10, cells: [[0,8],[1,8]] },
    { id: 7, sum: 11, cells: [[1,1],[2,1]] },
    { id: 8, sum: 13, cells: [[1,3],[1,4]] },
    { id: 9, sum: 16, cells: [[1,6],[2,6]] },
    { id: 10, sum: 7,  cells: [[2,0],[3,0]] },
    { id: 11, sum: 18, cells: [[2,2],[2,3]] },
    { id: 12, sum: 9,  cells: [[2,4],[3,4]] },
    { id: 13, sum: 12, cells: [[2,5],[2,6]] },
    { id: 14, sum: 14, cells: [[2,7],[2,8]] },
    { id: 15, sum: 10, cells: [[3,1],[3,2]] },
    { id: 16, sum: 15, cells: [[3,3],[4,3]] },
    { id: 17, sum: 8,  cells: [[3,5],[4,5]] },
    { id: 18, sum: 13, cells: [[3,6],[3,7]] },
    { id: 19, sum: 11, cells: [[3,8],[4,8]] },
    { id: 20, sum: 16, cells: [[4,0],[4,1]] },
    { id: 21, sum: 9,  cells: [[4,2],[5,2]] },
    { id: 22, sum: 12, cells: [[4,4],[5,4]] },
    { id: 23, sum: 15, cells: [[4,6],[4,7]] },
    { id: 24, sum: 14, cells: [[5,0],[6,0]] },
    { id: 25, sum: 8,  cells: [[5,1],[5,2]] },
    { id: 26, sum: 13, cells: [[5,3],[5,4]] },
    { id: 27, sum: 11, cells: [[5,5],[6,5]] },
    { id: 28, sum: 17, cells: [[5,6],[5,7]] },
    { id: 29, sum: 9,  cells: [[5,8],[6,8]] },
    { id: 30, sum: 12, cells: [[6,1],[6,2]] },
    { id: 31, sum: 10, cells: [[6,3],[7,3]] },
    { id: 32, sum: 14, cells: [[6,4],[6,5]] },
    { id: 33, sum: 16, cells: [[6,6],[7,6]] },
    { id: 34, sum: 7,  cells: [[7,0],[8,0]] },
    { id: 35, sum: 15, cells: [[7,1],[7,2]] },
    { id: 36, sum: 9,  cells: [[7,4],[8,4]] },
    { id: 37, sum: 12, cells: [[7,5],[7,6]] },
    { id: 38, sum: 13, cells: [[7,7],[8,7]] },
    { id: 39, sum: 11, cells: [[7,8],[8,8]] },
    { id: 40, sum: 18, cells: [[8,1],[8,2],[8,3]] },
    { id: 41, sum: 10, cells: [[8,5],[8,6]] }
  ]
};

// 当前关卡 ID（从 URL 参数读取）
let currentLevelId = 1;
let currentLevelDifficulty = '简单';

// 计时器
let timerInterval = null;
let elapsedSeconds = 0;
let isPaused = false;
let isCompleted = false;

// 45法则计算器状态
let rule45MustNums = new Set();
let rule45ExcludeNums = new Set();
let rule45Initialized = false;

window.onload = function() {
  console.log('🔍 笼镇档案 - 杀手数独 启动中...');

  // 1. 初始化渲染器（默认主题1：温暖侦探风，后续可通过?skin=N切换皮肤）
  window.renderer = new Renderer('gameCanvas');
  const params = new URLSearchParams(window.location.search);
  const skinParam = params.get('skin');
  if (skinParam) {
    window.renderer.setTheme(parseInt(skinParam) || 1);
  } else {
    window.renderer.setTheme(1);
  }

  // 2. 从 URL 读取关卡 ID（兼容 ?id= 和 ?levelId= 两种参数）
  const idParam = params.get('id') || params.get('levelId');
  if (idParam) {
    currentLevelId = parseInt(idParam) || 1;
  }
  const diffParam = params.get('difficulty');
  if (diffParam) {
    const diffMap = { easy: '简单', medium: '中等', hard: '困难' };
    currentLevelDifficulty = diffMap[diffParam] || diffParam;
  }

  // 3. 加载用户设置
  loadSettings();

  // 4. 从后端加载关卡（带降级容错）
  loadLevel(currentLevelId).then(puzzle => {
    gameBoard.loadLevel(puzzle);
    console.log('✅ 关卡加载完成');

    // 5. 开始埋点会话
    Storage.startSession(currentLevelId);

    // 6. 尝试读取本地存档
    loadSavedProgress(currentLevelId);

    // 7. 首次渲染
    renderer.render(gameBoard);
    gameBoard.checkConflicts();
    renderer.render(gameBoard);
    console.log('✅ 首次渲染完成');

    // 8. 启动计时器
    startTimer();

    // 9. 绑定交互
    bindCanvasClick();
    bindNumPad();
    bindToolbar();
    bindKeyboard();
    bindTimerAndPause();
    bindCompleteOverlay();
    initSettingsBindings();

    // 页面离开时保存埋点（未完成的情况）
    window.addEventListener('beforeunload', () => {
      if (!isCompleted) {
        Storage.endSession(false);
      }
    });
  });
};

// ---------- 加载关卡：优先从后端接口获取，失败则降级 ----------
async function loadLevel(id) {
  try {
    const res = await fetch('/api/level/' + id);
    const json = await res.json();
    if (json.code === 0 && json.data) {
      const titleEl = document.getElementById('level-title');
      if (titleEl && json.data.name) {
        titleEl.textContent = json.data.name;
      }
      currentLevelDifficulty = json.data.difficulty || '简单';
      return { cells: json.data.cells, cages: json.data.cages };
    }
    console.warn('⚠️ 接口返回异常，使用降级关卡');
  } catch (e) {
    console.warn('⚠️ 网络异常，使用降级关卡：', e.message);
  }
  return fallbackPuzzle;
}

// ---------- 读取本地存档 ----------
function loadSavedProgress(levelId) {
  if (typeof Storage === 'undefined') return;
  const save = Storage.loadProgress(levelId);
  if (!save) return;

  // 恢复填数
  if (save.fillNums) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = save.fillNums[r][c];
        if (val && !gameBoard.cells[r][c].fixedNum) {
          gameBoard.cells[r][c].fillNum = val;
        }
      }
    }
  }

  // 恢复候选数
  if (save.candidates) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cands = save.candidates[r][c] || [];
        cands.forEach(n => gameBoard.cells[r][c].candidates.add(n));
      }
    }
  }

  // 恢复用时
  if (save.time && !isNaN(save.time)) {
    elapsedSeconds = save.time;
    updateTimerDisplay();
  }

  console.log('📂 已读取存档，用时 ' + formatTime(elapsedSeconds));
}

// ---------- 保存本地存档 ----------
function saveProgress() {
  if (isCompleted) return;
  if (typeof Storage === 'undefined') return;

  const fillNums = [];
  const candidates = [];
  for (let r = 0; r < 9; r++) {
    fillNums[r] = [];
    candidates[r] = [];
    for (let c = 0; c < 9; c++) {
      const cell = gameBoard.cells[r][c];
      fillNums[r][c] = cell.fillNum || 0;
      candidates[r][c] = Array.from(cell.candidates);
    }
  }

  Storage.saveProgress(currentLevelId, {
    fillNums,
    candidates,
    time: elapsedSeconds
  });
}

// ---------- 计时器 ----------
function startTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    if (!isPaused && !isCompleted) {
      elapsedSeconds++;
      updateTimerDisplay();
      // 每 10 秒自动存一次时间
      if (elapsedSeconds % 10 === 0) {
        saveProgress();
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.textContent = formatTime(elapsedSeconds);
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ---------- 暂停 / 继续 ----------
function togglePause() {
  if (isCompleted) return;
  isPaused = !isPaused;
  const overlay = document.getElementById('pause-overlay');
  const timerEl = document.getElementById('timer');

  if (isPaused) {
    overlay.classList.add('active');
    timerEl.classList.add('paused');
    saveProgress();
  } else {
    overlay.classList.remove('active');
    timerEl.classList.remove('paused');
  }
}

// ---------- 计时与暂停绑定 ----------
function bindTimerAndPause() {
  // 点击计时器切换暂停
  document.getElementById('timer').addEventListener('click', togglePause);
  // 暂停蒙层的继续按钮
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  // 返回按钮
  document.getElementById('btn-back').addEventListener('click', () => {
    saveProgress();
    // 根据来源决定返回位置
    const params = new URLSearchParams(window.location.search);
    const fromMode = params.get('from') || params.get('difficulty');
    if (fromMode) {
      // 从自由模式选关页来，返回自由模式
      window.location.href = 'free-play.html';
    } else {
      // 默认返回主菜单
      window.location.href = 'menu.html';
    }
  });
}

// ---------- 统一的操作后刷新（检测冲突 + 重绘 + 保存 + 检查通关）----------
function refreshBoard() {
  // 操作后清除提示状态
  if (hintStep > 0) {
    gameBoard.clearHints();
    hintStep = 0;
    currentHint = null;
  }
  gameBoard.checkConflicts();
  renderer.render(gameBoard);
  saveProgress();
  updateNumberButtons();
  checkComplete();
}

// 更新底部数字按钮状态：填满 9 个的数字变灰不可点
function updateNumberButtons() {
  const board = gameBoard;
  if (!board) return;
  
  const count = Array(10).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
      if (val) count[val]++;
    }
  }
  
  for (let n = 1; n <= 9; n++) {
    const btn = document.querySelector('.num-btn[data-num="' + n + '"]');
    if (!btn) continue;
    if (count[n] >= 9) {
      btn.classList.add('completed');
    } else {
      btn.classList.remove('completed');
    }
  }
}

// ---------- 检查是否通关 ----------
function checkComplete() {
  // 已通关不再重复检测
  if (isCompleted) return;

  // 检查所有格子是否填满且无冲突
  let allFilled = true;
  let hasError = false;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = gameBoard.cells[r][c];
      if (!cell.fixedNum && !cell.fillNum) {
        allFilled = false;
      }
      if (cell.isError) {
        hasError = true;
      }
    }
  }

  if (allFilled && !hasError) {
    // 调用后端校验（可选，失败则不标记通关）
    verifyWithServer();
  }
}

// ---------- 后端校验确认通关 ----------
async function verifyWithServer() {
  const answer = [];
  for (let r = 0; r < 9; r++) {
    answer[r] = [];
    for (let c = 0; c < 9; c++) {
      const cell = gameBoard.cells[r][c];
      answer[r][c] = cell.fixedNum || cell.fillNum || 0;
    }
  }

  let verified = false;
  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levelId: currentLevelId, answer })
    });
    const json = await res.json();
    if (json.code === 0 && json.data && json.data.correct) {
      verified = true;
    }
  } catch (e) {
    // 后端校验失败时，以前端检测为准（降级）
    console.warn('⚠️ 后端校验失败，以前端检测为准');
    verified = true;
  }

  if (verified) {
    markComplete();
  }
}

// ---------- 标记通关 ----------
function markComplete() {
  isCompleted = true;
  clearInterval(timerInterval);

  // 保存通关记录
  if (typeof Storage !== 'undefined') {
    Storage.markComplete(currentLevelId, {
      time: elapsedSeconds,
      difficulty: currentLevelDifficulty
    });
    // 结束埋点会话（已完成）
    Storage.endSession(true);
    // 清除进度存档
    Storage.clearProgress(currentLevelId);
  }

  // 显示通关弹窗
  const overlay = document.getElementById('complete-overlay');
  const timeEl = document.getElementById('complete-time');
  timeEl.textContent = '用时 ' + formatTime(elapsedSeconds);
  overlay.classList.add('active');
}

// ---------- 通关弹窗按钮绑定 ----------
function bindCompleteOverlay() {
  document.getElementById('btn-complete-back').addEventListener('click', () => {
    const params = new URLSearchParams(window.location.search);
    const fromMode = params.get('from') || params.get('difficulty');
    if (fromMode) {
      window.location.href = 'free-play.html';
    } else {
      window.location.href = 'menu.html';
    }
  });

  document.getElementById('btn-complete-next').addEventListener('click', () => {
    const params = new URLSearchParams(window.location.search);
    const diff = params.get('difficulty');
    const nextId = parseInt(currentLevelId) + 1;
    let url = 'index.html?id=' + nextId;
    if (diff) url += '&difficulty=' + diff;
    window.location.href = url;
  });
}

// 长按相关状态
let longPressTimer = null;
let longPressTriggered = false;
let longPressStartPos = null;
let touchBoxSelectTriggered = false;
let touchStartPos = null;
const LONG_PRESS_DURATION = 650; // 长按650ms触发（500ms太容易误触候选模式）

// ---------- 画布点击：选中格子 ----------
function bindCanvasClick() {
  const canvas = renderer.canvas;
  let isMouseDown = false;
  let mouseMoved = false;
  let mouseStartPos = null;

  // 鼠标按下 - 准备框选
  canvas.addEventListener('mousedown', function(e) {
    if (isPaused) return;
    isMouseDown = true;
    mouseMoved = false;
    mouseStartPos = { x: e.clientX, y: e.clientY };
  });

  // 鼠标移动 - 框选
  canvas.addEventListener('mousemove', function(e) {
    if (isPaused || !isMouseDown) return;

    const dx = Math.abs(e.clientX - mouseStartPos.x);
    const dy = Math.abs(e.clientY - mouseStartPos.y);

    // 移动超过5像素才认为是框选（区别于单击）
    if (dx > 5 || dy > 5) {
      mouseMoved = true;
      if (!gameBoard.isBoxSelecting) {
        const { r, c } = getCellFromPos(mouseStartPos.x, mouseStartPos.y);
        gameBoard.startBoxSelect(r, c);
      }
      const { r, c } = getCellFromPos(e.clientX, e.clientY);
      gameBoard.updateBoxSelect(r, c);
      refreshBoard();
    }
  });

  // 鼠标释放
  canvas.addEventListener('mouseup', function(e) {
    if (isPaused) return;
    // 只在mousedown之后才处理mouseup（防止移动端touch事件后的合成mouse事件）
    if (!isMouseDown) {
      return;
    }
    isMouseDown = false;

    if (mouseMoved && gameBoard.isBoxSelecting) {
      // 框选结束
      const count = gameBoard.selectedCells.length;
      gameBoard.endBoxSelect();
      Storage.logAction('useBoxSelect', { count });
      mouseMoved = false;
      mouseStartPos = null;
      refreshBoard();
    } else {
      // 普通单击
      handleCanvasTap(e.clientX, e.clientY);
    }
  });

  // 鼠标离开canvas
  canvas.addEventListener('mouseleave', function(e) {
    if (isMouseDown && gameBoard.isBoxSelecting) {
      gameBoard.endBoxSelect();
      refreshBoard();
    }
    isMouseDown = false;
    mouseMoved = false;
    mouseStartPos = null;
  });

  // 触摸开始
  canvas.addEventListener('touchstart', function(e) {
    if (isPaused) return;
    e.preventDefault();
    const touch = e.touches[0];
    longPressTriggered = false;
    longPressStartPos = { x: touch.clientX, y: touch.clientY };
    touchBoxSelectTriggered = false;
    touchStartPos = { x: touch.clientX, y: touch.clientY };

    // 清除之前的定时器
    if (longPressTimer) clearTimeout(longPressTimer);

    // 设置长按定时器
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      handleLongPress(touch.clientX, touch.clientY);
    }, LONG_PRESS_DURATION);
  }, { passive: false });

  // 触摸移动
  canvas.addEventListener('touchmove', function(e) {
    if (isPaused) return;
    e.preventDefault();
    const touch = e.touches[0];

    if (longPressStartPos) {
      const dx = Math.abs(touch.clientX - longPressStartPos.x);
      const dy = Math.abs(touch.clientY - longPressStartPos.y);
      // 移动超过一定距离取消长按
      if (dx > 10 || dy > 10) {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    }

    // 触摸移动超过阈值，进入框选模式
    if (touchStartPos && !longPressTriggered) {
      const dx = Math.abs(touch.clientX - touchStartPos.x);
      const dy = Math.abs(touch.clientY - touchStartPos.y);
      if (dx > 15 || dy > 15) {
        // 取消长按
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        // 进入框选
        if (!gameBoard.isBoxSelecting && !touchBoxSelectTriggered) {
          touchBoxSelectTriggered = true;
          const { r, c } = getCellFromPos(touchStartPos.x, touchStartPos.y);
          gameBoard.startBoxSelect(r, c);
        }
        if (gameBoard.isBoxSelecting) {
          const { r, c } = getCellFromPos(touch.clientX, touch.clientY);
          gameBoard.updateBoxSelect(r, c);
          refreshBoard();
        }
      }
    }
  }, { passive: false });

  // 触摸结束
  canvas.addEventListener('touchend', function(e) {
    if (isPaused) return;
    e.preventDefault();

    // 清除长按定时器
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // 如果是框选模式，结束框选
    if (gameBoard.isBoxSelecting) {
      gameBoard.endBoxSelect();
      touchBoxSelectTriggered = false;
      touchStartPos = null;
      longPressTriggered = false;
      longPressStartPos = null;
      refreshBoard();
      return;
    }

    // 如果已经触发了长按，不处理点击
    if (longPressTriggered) {
      longPressTriggered = false;
      longPressStartPos = null;
      touchStartPos = null;
      return;
    }

    const touch = e.changedTouches[0];
    handleCanvasTap(touch.clientX, touch.clientY);
    longPressStartPos = null;
    touchStartPos = null;
  }, { passive: false });
}

/**
 * 根据屏幕坐标获取格子行列
 */
function getCellFromPos(clientX, clientY) {
  const rect = renderer.canvas.getBoundingClientRect();
  const size = gameBoard.size;
  const pad = renderer.padding;
  
  // 使用canvas实际显示尺寸计算（不依赖DPR手动缩放）
  const boardDisplayW = rect.width - pad * 2;
  const boardDisplayH = rect.height - pad * 2;
  const cellW = boardDisplayW / size;
  const cellH = boardDisplayH / size;
  
  let x = clientX - rect.left - pad;
  let y = clientY - rect.top - pad;
  
  let c = Math.floor(x / cellW);
  let r = Math.floor(y / cellH);
  
  // 边界clamp
  r = Math.max(0, Math.min(size - 1, r));
  c = Math.max(0, Math.min(size - 1, c));
  
  return { r, c };
}

/**
 * 处理画布点击/轻触
 */
function handleCanvasTap(clientX, clientY) {
  const { r, c } = getCellFromPos(clientX, clientY);
  gameBoard.selectCell(r, c);
  // 快捷填入
  if (quickFillModeSingle && quickFillNumSingle) {
    const cell = gameBoard.cells[r][c];
    if (!cell.fixedNum && !cell.fillNum) {
      tryQuickFillSingle(r, c);
      return;
    }
  }
  refreshBoard();
}

/**
 * 处理长按：切换到候选模式
 */
function handleLongPress(clientX, clientY) {
  // 振动反馈（如果支持）
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  // 先选中格子，统一使用普通点击的坐标换算逻辑，避免高分屏下偏移
  const { r, c } = getCellFromPos(clientX, clientY);

  gameBoard.selectCell(r, c);

  // 切换到候选模式
  const candidateBtn = document.getElementById('btn-candidate');
  if (gameBoard.inputMode !== 'candidate') {
    gameBoard.toggleInputMode();
    candidateBtn.style.backgroundColor = '#3b82f6';
    candidateBtn.style.color = 'white';
  }

  refreshBoard();
}

// ---------- 数字键盘：填数 / 候选 ----------
function bindNumPad() {
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      if (isPaused) return;
      const num = parseInt(this.dataset.num);
      if (quickFillModeSingle && !gameBoard.getActiveCell()) {
        selectQuickFillNumSingle(num);
      } else {
        handleNumberInput(num);
      }
    });
  });
}

// ---------- 安全获取选中格（支持 direct 引用 + isSelected 双重查找）----------
function getSelectedCellSafely() {
  let selectedCell = gameBoard.selectedCell;
  if (!selectedCell) {
    // fallback：遍历棋盘找 isSelected 的格子
    for (let r = 0; r < gameBoard.size; r++) {
      for (let c = 0; c < gameBoard.size; c++) {
        if (gameBoard.cells[r][c].isSelected) {
          selectedCell = { r, c };
          gameBoard.selectedCell = selectedCell;
          break;
        }
      }
      if (selectedCell) break;
    }
  }
  return selectedCell;
}

// ---------- 数字输入处理（兼容正式填数和候选模式）----------
function handleNumberInput(num) {
  // 多选时，默认批量切换候选数（框选主要用于批量写候选）
  if (gameBoard.selectedCells.length > 1) {
    gameBoard.toggleCandidateForSelection(num);
    Storage.logAction('toggleCandidate', { num, batch: true, count: gameBoard.selectedCells.length });
  } else if (gameBoard.inputMode === 'candidate') {
    const activeCell = gameBoard.getActiveCell();
    if (!activeCell) return;
    const { r, c } = activeCell;
    gameBoard.toggleCandidate(num);
    Storage.logAction('toggleCandidate', { num, r, c });
  } else {
    const activeCell = gameBoard.getActiveCell();
    if (!activeCell) {
      showToast('请先选中一个格子，或点击“⚡ 连填”后选择数字');
      return;
    }
    const { r, c } = activeCell;
    gameBoard.setNumber(num);
    Storage.logAction('setNumber', { num, r, c });
  }
  gameBoard.checkConflicts();
  refreshBoard();
}

// 提示相关状态
let hintStep = 0;
let currentHint = null;

/**
 * 处理提示按钮点击（三层递进式）
 * 第1次：仅高亮目标格
 * 第2次：技巧名称+关联区域高亮+详细说明
 * 第3次：显示答案数字
 * 第4次：清除提示
 */
function handleHint() {
  hintStep++;

  if (hintStep === 1) {
    currentHint = gameBoard.showHint(1);
    if (!currentHint) {
      hintStep = 0;
      showToast('🔍 当前盘面没有明显的可推进步骤，试试其他方法，或者用45法则计算器');
      return;
    }
    showToast('💡 第一层提示：仔细看看这个格子（绿框标记），它有什么特别之处？');
  } else if (hintStep === 2) {
    currentHint = gameBoard.showHint(2);
    if (currentHint) {
      const techMsg = buildTechniqueMessage(currentHint);
      showToast(techMsg, 4000);
    }
  } else if (hintStep === 3) {
    currentHint = gameBoard.showHint(3);
    if (currentHint) {
      if (currentHint.num !== null && currentHint.num !== undefined) {
        showToast(`🎯 答案是 ${currentHint.num}，填入后会自动排除相关候选数`);
      } else {
        showToast(`📖 这一步需要用到「${currentHint.techniqueName}」技巧，仔细观察高亮区域中的紫色标记格`, 4000);
      }
    }
  } else {
    gameBoard.clearHints();
    hintStep = 0;
    currentHint = null;
  }

  _renderBoardForHint();
}

/** 提示系统专用的轻量渲染（不触发refreshBoard的自动清提示逻辑） */
function _renderBoardForHint() {
  gameBoard.checkConflicts();
  renderer.render(gameBoard);
  updateNumberButtons();
}

/**
 * 根据hint对象构建第二层技巧说明消息
 */
function buildTechniqueMessage(hint) {
  const tech = hint.technique;
  const num = hint.num;
  const labels = 'ABCDEFGHI';
  const cellName = `${labels[hint.r]}${hint.c + 1}`;

  switch (tech) {
    case 'nakedSingle':
      return `📘 第二层：【显性唯一（裸单）】\n${cellName}格所在的行、列、宫、笼里已经出现了其他所有数字，只有 ${num} 没出现过，所以只能填 ${num}。\n👉 看金色高亮区域：里面已有的数字凑齐了，只剩这一个数。`;
    case 'hiddenSingle':
      return `📘 第二层：【隐性唯一（隐单）】\n${hint.description}。仔细看相关区域，你会发现数字${num}只能放在${cellName}。`;
    case 'nakedPair':
      if (hint.pairCells && hint.pairNums) {
        const [p1, p2] = hint.pairCells;
        const p1Name = `${labels[p1[0]]}${p1[1]+1}`;
        const p2Name = `${labels[p2[0]]}${p2[1]+1}`;
        let msg = `📘 第二层：【显性数对】\n${p1Name}和${p2Name}都只能填 ${hint.pairNums[0]} 或 ${hint.pairNums[1]}（紫色标记）。这两个数被"锁定"了，可以排除同区域其他格子的这两个数字。`;
        if (num) msg += `\n排除后，${cellName}就只剩 ${num}！`;
        return msg;
      }
      return `📘 ${hint.techniqueName}：${hint.description}`;
    default:
      return `📘 ${hint.techniqueName}：${hint.description}`;
  }
}

/**
 * 简单的 toast 提示
 */
let toastTimer = null;
function showToast(message, duration = 2500) {
  let toast = document.getElementById('game-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'game-toast';
    toast.className = 'game-toast';
    toast.style.whiteSpace = 'pre-line';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ---------- 工具栏按钮 ----------
function bindToolbar() {
  document.getElementById('btn-undo').addEventListener('click', () => {
    if (isPaused) return;
    gameBoard.undo();
    Storage.logAction('undo');
    refreshBoard();
  });

  document.getElementById('btn-erase').addEventListener('click', () => {
    if (isPaused) return;
    // 多选时批量擦除
    if (gameBoard.selectedCells.length > 1) {
      gameBoard.eraseSelection();
      Storage.logAction('erase', { batch: true, count: gameBoard.selectedCells.length });
    } else {
      const selectedCell = getSelectedCellSafely();
      if (!selectedCell) return;
      const { r, c } = selectedCell;
      gameBoard.eraseNumber();
      Storage.logAction('erase', { r, c });
    }
    gameBoard.checkConflicts();
    refreshBoard();
  });

  // 候选模式切换按钮
  const candidateBtn = document.getElementById('btn-candidate');
  candidateBtn.addEventListener('click', () => {
    if (isPaused) return;
    const mode = gameBoard.toggleInputMode();
    if (mode === 'candidate') {
      candidateBtn.style.backgroundColor = '#3b82f6';
      candidateBtn.style.color = 'white';
    } else {
      candidateBtn.style.backgroundColor = '';
      candidateBtn.style.color = '';
    }
  });

  // 自动填充候选数（新手辅助）
  const autoCandsBtn = document.getElementById('btn-auto-cands');
  if (autoCandsBtn) {
    autoCandsBtn.addEventListener('click', () => {
      if (isPaused) return;
      const count = gameBoard.autoFillCandidates();
      if (count > 0) {
        showToast(`🔢 已自动为 ${count} 个空格填入理论候选数`);
        // 确保切换到候选模式显示候选数
        if (gameBoard.inputMode !== 'candidate') {
          gameBoard.inputMode = 'candidate';
          if (candidateBtn) {
            candidateBtn.style.backgroundColor = '#3b82f6';
            candidateBtn.style.color = 'white';
          }
        }
        gameBoard.checkConflicts();
        refreshBoard();
        Storage.logAction('autoFillCandidates', { count });
      } else {
        showToast('🔢 没有需要填充候选的空格');
      }
    });
  }

  // 提示按钮
  document.getElementById('btn-hint').addEventListener('click', () => {
    if (isPaused) return;
    handleHint();
    Storage.logAction('hint', { step: hintStep });
  });

  // 45法则计算器
  document.getElementById('btn-45rule').addEventListener('click', () => {
    if (isPaused) return;
    toggleRule45Calculator();
    Storage.logAction('useRule45');
  });

  // 设置按钮
  document.getElementById('btn-setting').addEventListener('click', () => {
    if (isPaused) return;
    toggleSettings();
  });

  // 快捷填入
  document.getElementById('btn-quick-fill').addEventListener('click', () => {
    if (isPaused) return;
    toggleQuickFill();
  });

  // 重来
  document.getElementById('btn-restart').addEventListener('click', () => {
    if (isPaused) return;
    confirmRestartSingle();
  });
}

// ==========================================
// 快捷填入模式（单人模式）
// ==========================================
let quickFillModeSingle = false;
let quickFillNumSingle = null;

function toggleQuickFill() {
  const btn = document.getElementById('btn-quick-fill');
  quickFillModeSingle = !quickFillModeSingle;
  if (!quickFillModeSingle) {
    quickFillNumSingle = null;
    btn.classList.remove('active');
    clearQuickFillNumHighlightSingle();
  } else {
    btn.classList.add('active');
  }
}

function clearQuickFillNumHighlightSingle() {
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.classList.remove('quick-fill-num');
  });
}

function selectQuickFillNumSingle(num) {
  if (isNumberCompleteSingle(num)) return;
  clearQuickFillNumHighlightSingle();
  if (quickFillNumSingle === num) {
    quickFillNumSingle = null;
  } else {
    quickFillNumSingle = num;
    document.querySelector('.num-btn[data-num="' + num + '"]').classList.add('quick-fill-num');
  }
}

function isNumberCompleteSingle(num) {
  if (!gameBoard) return false;
  let count = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = gameBoard.cells[r][c].fixedNum || gameBoard.cells[r][c].fillNum;
      if (val === num) count++;
    }
  }
  return count >= 9;
}

function tryQuickFillSingle(r, c) {
  if (!quickFillModeSingle || !quickFillNumSingle) return false;
  const cell = gameBoard.cells[r][c];
  if (cell.fixedNum || cell.fillNum) return false;

  gameBoard.selectCell(r, c);
  handleNumberInput(quickFillNumSingle);

  if (isNumberCompleteSingle(quickFillNumSingle)) {
    quickFillNumSingle = null;
    clearQuickFillNumHighlightSingle();
    quickFillModeSingle = false;
    document.getElementById('btn-quick-fill').classList.remove('active');
  }
  return true;
}

// ==========================================
// 重来（单人模式）
// ==========================================
function confirmRestartSingle() {
  if (!currentLevelId) return;
  if (!confirm('确定要重来这关吗？所有已填的数字将被清空。')) return;
  // 清除存档然后刷新页面
  Storage.clearProgress(currentLevelId);
  window.location.reload();
}

// ---------- 物理键盘 ----------
function bindKeyboard() {
  document.addEventListener('keydown', function(e) {
    if (isPaused && e.key !== 'Escape' && e.key !== ' ') {
      // 暂停状态下只响应空格/ESC恢复
      return;
    }

    // 数字键 1-9
    if (e.key >= '1' && e.key <= '9') {
      const num = parseInt(e.key);
      if (quickFillModeSingle && !getSelectedCellSafely()) {
        selectQuickFillNumSingle(num);
      } else {
        handleNumberInput(num);
      }
      e.preventDefault();
      return;
    }

    // 退格 / Delete：擦除
    if (e.key === 'Backspace' || e.key === 'Delete') {
      // 多选时批量擦除
      if (gameBoard.selectedCells.length > 1) {
        gameBoard.eraseSelection();
      } else {
        gameBoard.eraseNumber();
      }
      gameBoard.checkConflicts();
      refreshBoard();
      e.preventDefault();
      return;
    }

    // 方向键
    if (e.key === 'ArrowUp') {
      gameBoard.moveSelection(-1, 0);
      refreshBoard();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      gameBoard.moveSelection(1, 0);
      refreshBoard();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft') {
      gameBoard.moveSelection(0, -1);
      refreshBoard();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight') {
      gameBoard.moveSelection(0, 1);
      refreshBoard();
      e.preventDefault();
      return;
    }

    // Z / Ctrl+Z：撤销
    if (e.key === 'z' || e.key === 'Z') {
      if (e.ctrlKey || e.metaKey) {
        gameBoard.undo();
        refreshBoard();
        e.preventDefault();
        return;
      }
    }

    // 空格 / C：切换候选模式
    if (e.key === ' ' || e.key === 'c' || e.key === 'C') {
      const candidateBtn = document.getElementById('btn-candidate');
      const mode = gameBoard.toggleInputMode();
      if (mode === 'candidate') {
        candidateBtn.style.backgroundColor = '#3b82f6';
        candidateBtn.style.color = 'white';
      } else {
        candidateBtn.style.backgroundColor = '';
        candidateBtn.style.color = '';
      }
      refreshBoard();
      e.preventDefault();
      return;
    }

    // K：一键清空所有候选
    if (e.key === 'k' || e.key === 'K') {
      gameBoard.clearAllCandidates();
      Storage.logAction('useClearCandidates');
      refreshBoard();
      e.preventDefault();
      return;
    }

    // R：打开/关闭45法则计算器
    if (e.key === 'r' || e.key === 'R') {
      toggleRule45Calculator();
      e.preventDefault();
      return;
    }

    // S：打开/关闭设置
    if (e.key === 's' || e.key === 'S') {
      toggleSettings();
      e.preventDefault();
      return;
    }

    // H：提示
    if (e.key === 'h' || e.key === 'H') {
      handleHint();
      e.preventDefault();
      return;
    }

    // ESC / P：暂停
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      togglePause();
      e.preventDefault();
      return;
    }
  });
}

// ==========================================
// 45法则计算器
// ==========================================

/**
 * 打开/关闭45法则计算器
 */
function toggleRule45Calculator() {
  const overlay = document.getElementById('rule45-overlay');
  if (!overlay) return;

  if (overlay.classList.contains('active')) {
    overlay.classList.remove('active');
  } else {
    if (!rule45Initialized) {
      initRule45Calculator();
    }
    overlay.classList.add('active');
    calcRule45Combinations();
  }
}

/**
 * 初始化45法则计算器UI
 */
function initRule45Calculator() {
  // 关闭按钮
  document.getElementById('btn-rule45-close').addEventListener('click', () => {
    toggleRule45Calculator();
  });

  // 点击蒙层关闭
  document.getElementById('rule45-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'rule45-overlay') {
      toggleRule45Calculator();
    }
  });

  // 数字选择器 - 必含
  const mustPicker = document.getElementById('rule45-must');
  const excludePicker = document.getElementById('rule45-exclude');

  for (let i = 1; i <= 9; i++) {
    // 必含按钮
    const mustBtn = document.createElement('button');
    mustBtn.className = 'rule45-num-btn';
    mustBtn.textContent = i;
    mustBtn.dataset.num = i;
    mustBtn.addEventListener('click', () => toggleRule45Num(i, 'must'));
    mustPicker.appendChild(mustBtn);

    // 排除按钮
    const exclBtn = document.createElement('button');
    exclBtn.className = 'rule45-num-btn';
    exclBtn.textContent = i;
    exclBtn.dataset.num = i;
    exclBtn.addEventListener('click', () => toggleRule45Num(i, 'exclude'));
    excludePicker.appendChild(exclBtn);
  }

  // 输入框变化
  document.getElementById('rule45-cellcount').addEventListener('input', calcRule45Combinations);
  document.getElementById('rule45-targetsum').addEventListener('input', calcRule45Combinations);

  rule45Initialized = true;
}

/**
 * 切换必含/排除数字
 */
function toggleRule45Num(num, type) {
  if (type === 'must') {
    if (rule45MustNums.has(num)) {
      rule45MustNums.delete(num);
    } else {
      rule45MustNums.add(num);
      rule45ExcludeNums.delete(num); // 必含了就不能排除
    }
  } else {
    if (rule45ExcludeNums.has(num)) {
      rule45ExcludeNums.delete(num);
    } else {
      rule45ExcludeNums.add(num);
      rule45MustNums.delete(num); // 排除了就不能必含
    }
  }
  updateRule45NumButtons();
  calcRule45Combinations();
}

/**
 * 更新数字按钮的选中状态
 */
function updateRule45NumButtons() {
  const mustPicker = document.getElementById('rule45-must');
  const excludePicker = document.getElementById('rule45-exclude');

  mustPicker.querySelectorAll('.rule45-num-btn').forEach(btn => {
    const num = parseInt(btn.dataset.num);
    if (rule45MustNums.has(num)) {
      btn.classList.add('active-must');
    } else {
      btn.classList.remove('active-must');
    }
  });

  excludePicker.querySelectorAll('.rule45-num-btn').forEach(btn => {
    const num = parseInt(btn.dataset.num);
    if (rule45ExcludeNums.has(num)) {
      btn.classList.add('active-exclude');
    } else {
      btn.classList.remove('active-exclude');
    }
  });
}

/**
 * 计算45法则的所有可能组合
 * 使用回溯法枚举所有 k 个不同数字的组合，和为 targetSum
 */
function calcRule45Combinations() {
  const cellCount = parseInt(document.getElementById('rule45-cellcount').value) || 0;
  const targetSum = parseInt(document.getElementById('rule45-targetsum').value) || 0;

  const resultEl = document.getElementById('rule45-combinations');
  const countEl = document.getElementById('rule45-count');

  // 边界检查
  if (cellCount < 1 || cellCount > 9 || targetSum < 1) {
    resultEl.innerHTML = '<div class="rule45-no-result">请输入有效的格子数和目标和</div>';
    countEl.textContent = '0 种';
    return;
  }

  // 必含数字数量不能超过格子数
  if (rule45MustNums.size > cellCount) {
    resultEl.innerHTML = '<div class="rule45-no-result">必含数字数量不能超过格子数</div>';
    countEl.textContent = '0 种';
    return;
  }

  // 可用数字池：1-9，去掉排除的
  const availableNums = [];
  for (let i = 1; i <= 9; i++) {
    if (!rule45ExcludeNums.has(i)) {
      availableNums.push(i);
    }
  }

  // 必含数字必须都在可用数字中
  const mustArray = Array.from(rule45MustNums);
  for (const m of mustArray) {
    if (!availableNums.includes(m)) {
      resultEl.innerHTML = '<div class="rule45-no-result">必含数字不能同时被排除</div>';
      countEl.textContent = '0 种';
      return;
    }
  }

  // 需要从可用数字中选的数量
  const remainingCount = cellCount - mustArray.length;
  // 必含数字的和
  const mustSum = mustArray.reduce((a, b) => a + b, 0);
  // 剩余需要凑的和
  const remainingSum = targetSum - mustSum;

  // 从可用数字中去掉必含数字，得到候选池
  const candidatePool = availableNums.filter(n => !rule45MustNums.has(n));

  // 回溯找组合
  const combinations = [];
  findCombinations(candidatePool, remainingCount, remainingSum, 0, [], combinations);

  // 把必含数字加到每个组合前面并排序
  const fullCombinations = combinations.map(combo => {
    const full = [...mustArray, ...combo].sort((a, b) => a - b);
    return full;
  });

  // 按数字大小排序组合
  fullCombinations.sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });

  // 渲染结果
  if (fullCombinations.length === 0) {
    resultEl.innerHTML = '<div class="rule45-no-result">没有符合条件的组合</div>';
  } else {
    resultEl.innerHTML = '';
    fullCombinations.forEach(combo => {
      const comboEl = document.createElement('div');
      comboEl.className = 'rule45-combo';
      combo.forEach(n => {
        const numEl = document.createElement('span');
        numEl.className = 'rule45-combo-num';
        numEl.textContent = n;
        comboEl.appendChild(numEl);
      });
      const sumEl = document.createElement('span');
      sumEl.className = 'rule45-combo-sum';
      sumEl.textContent = '= ' + combo.reduce((a, b) => a + b, 0);
      comboEl.appendChild(sumEl);
      resultEl.appendChild(comboEl);
    });
  }

  countEl.textContent = fullCombinations.length + ' 种';
}

/**
 * 回溯法找组合
 * @param {number[]} pool - 候选数字池（已排序）
 * @param {number} k - 需要选多少个数字
 * @param {number} target - 目标和
 * @param {number} start - 从 pool 的哪个索引开始
 * @param {number[]} current - 当前已选数字
 * @param {number[][]} result - 结果数组
 */
function findCombinations(pool, k, target, start, current, result) {
  if (k === 0) {
    if (target === 0) {
      result.push([...current]);
    }
    return;
  }

  // 剪枝：剩余数字不够了
  if (start + k > pool.length) return;

  for (let i = start; i < pool.length; i++) {
    const num = pool[i];
    // 剪枝：当前数字已经超过剩余目标和，后面的更大，直接跳过
    if (num > target) break;
    // 剪枝：最小可能的和已经超过target
    const minRemainingSum = num + sumFirstK(pool, i + 1, k - 1);
    if (minRemainingSum > target) break;
    // 剪枝：最大可能的和还不够target
    const maxRemainingSum = num + sumLastK(pool, pool.length - 1, k - 1);
    if (maxRemainingSum < target) continue;

    current.push(num);
    findCombinations(pool, k - 1, target - num, i + 1, current, result);
    current.pop();
  }
}

/**
 * 从 start 开始取 k 个最小的数的和
 */
function sumFirstK(pool, start, k) {
  let sum = 0;
  for (let i = 0; i < k && start + i < pool.length; i++) {
    sum += pool[start + i];
  }
  return sum;
}

/**
 * 从 end 往前取 k 个最大的数的和
 */
function sumLastK(pool, end, k) {
  let sum = 0;
  for (let i = 0; i < k && end - i >= 0; i++) {
    sum += pool[end - i];
  }
  return sum;
}

// ==========================================
// 设置弹窗
// ==========================================

/**
 * 打开/关闭设置弹窗
 */
function toggleSettings() {
  const overlay = document.getElementById('settings-overlay');
  if (!overlay) return;

  if (overlay.classList.contains('active')) {
    overlay.classList.remove('active');
  } else {
    loadSettingsToUI();
    overlay.classList.add('active');
  }
}

/**
 * 初始化设置UI绑定
 */
function initSettingsBindings() {
  // 关闭按钮
  document.getElementById('btn-settings-close').addEventListener('click', () => {
    toggleSettings();
  });

  // 点击蒙层关闭
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'settings-overlay') {
      toggleSettings();
    }
  });

  // 各个设置开关
  document.getElementById('setting-conflict-red').addEventListener('change', (e) => {
    gameBoard.settings.conflictRed = e.target.checked;
    saveSettings();
    refreshBoard();
  });

  document.getElementById('setting-highlight-rowcolbox').addEventListener('change', (e) => {
    gameBoard.highlightSettings.sameRow = e.target.checked;
    gameBoard.highlightSettings.sameCol = e.target.checked;
    gameBoard.highlightSettings.sameBox = e.target.checked;
    saveSettings();
    refreshBoard();
  });

  document.getElementById('setting-highlight-samenum').addEventListener('change', (e) => {
    gameBoard.highlightSettings.sameNumber = e.target.checked;
    saveSettings();
    refreshBoard();
  });

  document.getElementById('setting-highlight-samecage').addEventListener('change', (e) => {
    gameBoard.highlightSettings.sameCage = e.target.checked;
    saveSettings();
    refreshBoard();
  });

  document.getElementById('setting-auto-clear').addEventListener('change', (e) => {
    gameBoard.settings.autoClearCandidates = e.target.checked;
    saveSettings();
  });
}

/**
 * 从本地存储加载设置
 */
function loadSettings() {
  if (typeof Storage === 'undefined') return;
  const saved = Storage.getSettings();
  if (!saved) return;

  if (saved.conflictRed !== undefined) gameBoard.settings.conflictRed = saved.conflictRed;
  if (saved.autoClearCandidates !== undefined) gameBoard.settings.autoClearCandidates = saved.autoClearCandidates;
  if (saved.highlightRowColBox !== undefined) {
    gameBoard.highlightSettings.sameRow = saved.highlightRowColBox;
    gameBoard.highlightSettings.sameCol = saved.highlightRowColBox;
    gameBoard.highlightSettings.sameBox = saved.highlightRowColBox;
  }
  if (saved.highlightRow !== undefined) gameBoard.highlightSettings.sameRow = saved.highlightRow;
  if (saved.highlightCol !== undefined) gameBoard.highlightSettings.sameCol = saved.highlightCol;
  if (saved.highlightBox !== undefined) gameBoard.highlightSettings.sameBox = saved.highlightBox;
  if (saved.highlightSameNumber !== undefined) gameBoard.highlightSettings.sameNumber = saved.highlightSameNumber;
  if (saved.highlightSameCage !== undefined) gameBoard.highlightSettings.sameCage = saved.highlightSameCage;
}

/**
 * 保存设置到本地存储
 */
function saveSettings() {
  if (typeof Storage === 'undefined') return;
  Storage.saveSettings({
    conflictRed: gameBoard.settings.conflictRed,
    autoClearCandidates: gameBoard.settings.autoClearCandidates,
    highlightRowColBox: gameBoard.highlightSettings.sameRow && gameBoard.highlightSettings.sameCol && gameBoard.highlightSettings.sameBox,
    highlightRow: gameBoard.highlightSettings.sameRow,
    highlightCol: gameBoard.highlightSettings.sameCol,
    highlightBox: gameBoard.highlightSettings.sameBox,
    highlightSameNumber: gameBoard.highlightSettings.sameNumber,
    highlightSameCage: gameBoard.highlightSettings.sameCage
  });
}

/**
 * 把当前设置同步到UI
 */
function loadSettingsToUI() {
  document.getElementById('setting-conflict-red').checked = gameBoard.settings.conflictRed;
  document.getElementById('setting-highlight-rowcolbox').checked =
    gameBoard.highlightSettings.sameRow && gameBoard.highlightSettings.sameCol && gameBoard.highlightSettings.sameBox;
  document.getElementById('setting-highlight-samenum').checked = gameBoard.highlightSettings.sameNumber;
  document.getElementById('setting-highlight-samecage').checked = gameBoard.highlightSettings.sameCage;
  document.getElementById('setting-auto-clear').checked = gameBoard.settings.autoClearCandidates;
}
