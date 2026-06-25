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

window.onload = function() {
  console.log('🔍 笼镇档案 - 杀手数独 启动中...');

  // 1. 初始化渲染器
  window.renderer = new Renderer('gameCanvas');

  // 2. 从 URL 读取关卡 ID
  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id');
  if (idParam) {
    currentLevelId = parseInt(idParam) || 1;
  }

  // 3. 从后端加载关卡（带降级容错）
  loadLevel(currentLevelId).then(puzzle => {
    gameBoard.loadLevel(puzzle);
    console.log('✅ 关卡加载完成');

    // 4. 尝试读取本地存档
    loadSavedProgress(currentLevelId);

    // 5. 首次渲染
    renderer.render(gameBoard);
    gameBoard.checkConflicts();
    renderer.render(gameBoard);
    console.log('✅ 首次渲染完成');

    // 6. 启动计时器
    startTimer();

    // 7. 绑定交互
    bindCanvasClick();
    bindNumPad();
    bindToolbar();
    bindKeyboard();
    bindTimerAndPause();
    bindCompleteOverlay();
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
  // 返回关卡按钮
  document.getElementById('btn-back').addEventListener('click', () => {
    saveProgress();
    window.location.href = 'levels.html';
  });
}

// ---------- 统一的操作后刷新（检测冲突 + 重绘 + 保存 + 检查通关）----------
function refreshBoard() {
  gameBoard.checkConflicts();
  renderer.render(gameBoard);
  saveProgress();
  checkComplete();
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
    window.location.href = 'levels.html';
  });

  document.getElementById('btn-complete-next').addEventListener('click', () => {
    window.location.href = 'index.html?id=' + (currentLevelId + 1);
  });
}

// ---------- 画布点击：选中格子 ----------
function bindCanvasClick() {
  const canvas = renderer.canvas;

  canvas.addEventListener('click', function(e) {
    if (isPaused) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX - renderer.padding;
    const y = (e.clientY - rect.top) * scaleY - renderer.padding;

    const r = Math.floor(y / renderer.cellSize);
    const c = Math.floor(x / renderer.cellSize);

    gameBoard.selectCell(r, c);
    refreshBoard();
  });
}

// ---------- 数字键盘：填数 / 候选 ----------
function bindNumPad() {
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      if (isPaused) return;
      const num = parseInt(this.dataset.num);
      handleNumberInput(num);
    });
  });
}

// ---------- 数字输入处理（兼容正式填数和候选模式）----------
function handleNumberInput(num) {
  if (gameBoard.inputMode === 'candidate') {
    gameBoard.toggleCandidate(num);
  } else {
    gameBoard.setNumber(num);
  }
  refreshBoard();
}

// ---------- 工具栏按钮 ----------
function bindToolbar() {
  document.getElementById('btn-undo').addEventListener('click', () => {
    if (isPaused) return;
    gameBoard.undo();
    refreshBoard();
  });

  document.getElementById('btn-erase').addEventListener('click', () => {
    if (isPaused) return;
    gameBoard.eraseNumber();
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
      handleNumberInput(parseInt(e.key));
      e.preventDefault();
      return;
    }

    // 退格 / Delete：擦除
    if (e.key === 'Backspace' || e.key === 'Delete') {
      gameBoard.eraseNumber();
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

    // ESC / P：暂停
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      togglePause();
      e.preventDefault();
      return;
    }
  });
}
