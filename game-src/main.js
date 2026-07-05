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
  
  // 3.5 应用音频设置
  applyAudioSettings();

  // 4. 从后端加载关卡（带降级容错）
  loadLevel(currentLevelId).then(puzzle => {
    gameBoard.loadLevel(puzzle);
    console.log('✅ 关卡加载完成');

    // 4.5 启动速度谜题BGM
    (function startPuzzleBGM() {
      const startBGM = () => {
        if (typeof BGMEngine !== 'undefined' && _gameMode === 'killer') {
          BGMEngine.playPuzzle();
        }
        document.removeEventListener('click', startBGM);
        document.removeEventListener('touchstart', startBGM);
        document.removeEventListener('keydown', startBGM);
      };
      document.addEventListener('click', startBGM, { once: true });
      document.addEventListener('touchstart', startBGM, { once: true });
      document.addEventListener('keydown', startBGM, { once: true });
    })();

    // 5. 开始埋点会话
    Storage.startSession(currentLevelId);

    // 6. 尝试读取本地存档
    loadSavedProgress(currentLevelId);

    // 7. 首次渲染
    renderer.render(gameBoard);
    gameBoard.checkConflicts();
    renderer.render(gameBoard);
    console.log('✅ 首次渲染完成');
    
    // RAHS: 初始更新目标格
    if (typeof ReasoningAndHintSystem !== 'undefined' && typeof _updateRahsTarget === 'function') {
      _updateRahsTarget();
    }

    // 7.5 初始化喜剧系统
    if (typeof ComedySystem !== 'undefined') {
      ComedySystem.init({
        levelId: currentLevelId,
        mode: 'free',
        isBoss: false
      });
    }

    // 7.6 初始化推理与提示联动系统 (RAHS)
    if (typeof ReasoningAndHintSystem !== 'undefined') {
      ReasoningAndHintSystem.init({
        enabled: true,
        autoCheck: true,
        checkInterval: 1500,
        onHintTriggered: function(result) {
          _showCharacterHint(result);
        }
      });
      ReasoningAndHintSystem.onLevelStart(
        String(currentLevelId),
        _getChapterId(),
        currentLevelDifficulty || '普通',
        false
      );
    }

    // 7.7 自由模式：不使用逆转裁判式演出（立绘/配音/BGM切换）
    // 演出系统仅在故事模式（guide.html）中启用
    // 喜剧系统（文字吐槽）已在上方初始化，保留轻量反馈

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
    
    // 9.1 旧的45法则账本面板已废弃，改用简化版提示（rule45-hint.js）
    // if (typeof initLedgerPanel === 'function') {
    //   initLedgerPanel();
    // }
    
    // 页面离开时保存埋点（未完成的情况）
    window.addEventListener('beforeunload', () => {
      if (!isCompleted) {
        Storage.endSession(false);
      }
    });
  });
};

// ---------- 加载关卡：优先后端API → 本地data/levels.json → 本地data/levels-killer.json → 降级关卡 ----------
let _localLevelsCache = null;
let _localKillerCache = null;
let _gameMode = 'classic'; // 'classic' | 'killer'

async function loadLevel(id) {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  _gameMode = (mode === 'killer') ? 'killer' : 'classic';

  // 1. 优先从后端接口获取（传递模式参数）
  try {
    const res = await fetch('/api/level/' + id + '?mode=' + _gameMode);
    const json = await res.json();
    if (json.code === 0 && json.data) {
      const titleEl = document.getElementById('level-title');
      if (titleEl && json.data.name) {
        titleEl.textContent = json.data.name;
      }
      currentLevelDifficulty = json.data.difficulty || '简单';
      return { cells: json.data.cells, cages: json.data.cages };
    }
    console.warn('⚠️ 接口返回异常，尝试本地数据');
  } catch (e) {
    console.warn('⚠️ 网络异常，尝试本地数据：', e.message);
  }

  // 2. 根据模式加载本地题库
  try {
    let cache, dataFile;
    if (_gameMode === 'killer') {
      // 杀手数独模式：从 levels.json 加载（2718道题）
      if (!_localLevelsCache) {
        const res = await fetch('data/levels.json?v=39');
        if (res.ok) {
          _localLevelsCache = await res.json();
        }
      }
      cache = _localLevelsCache;
      dataFile = 'levels.json';
    } else {
      // 经典数独模式：从 levels-classic.json 加载（330道，有预填）
      if (!_localLevelsCache) {
        const res = await fetch('data/levels-classic.json?v=1');
        if (res.ok) {
          _localLevelsCache = await res.json();
        }
      }
      cache = _localLevelsCache;
      dataFile = 'levels-classic.json';
    }

    if (cache && Array.isArray(cache)) {
      const puzzle = cache.find(p => p.id === id);
      if (puzzle) {
        const titleEl = document.getElementById('level-title');
        if (titleEl && puzzle.name) {
          titleEl.textContent = puzzle.name;
        }
        currentLevelDifficulty = puzzle.difficulty || '简单';
        // 确保cages有id字段（向后兼容）
        let cages = puzzle.cages || [];
        if (cages.length > 0 && cages[0].id === undefined) {
          cages = cages.map((c, i) => ({ id: i + 1, ...c }));
        }
        console.log(`✅ 从本地${dataFile}加载关卡 #${id} (${_gameMode}模式, cages=${cages.length})`);
        return { cells: puzzle.cells, cages: cages };
      }
      console.warn(`⚠️ 本地${dataFile}中未找到关卡 #${id}`);
    }
  } catch (e) {
    console.warn('⚠️ 本地题库加载失败：', e.message);
  }

  // 3. 最终降级
  console.warn('⚠️ 使用降级关卡（全空白）');
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
  document.getElementById('timer').addEventListener('click', () => {
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
    togglePause();
  });
  // 暂停蒙层的继续按钮
  document.getElementById('btn-resume').addEventListener('click', () => {
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
    togglePause();
  });
  // 返回按钮
  document.getElementById('btn-back').addEventListener('click', () => {
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
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

  // ---- 角色台词播放时暂停计时器 ----
  let _pausedByDialogue = false;
  document.addEventListener('story-dialogue-start', () => {
    if (!isPaused && !isCompleted) {
      _pausedByDialogue = true;
      isPaused = true;
      const timerEl = document.getElementById('timer');
      if (timerEl) timerEl.classList.add('paused');
    }
  });
  document.addEventListener('story-dialogue-end', () => {
    if (_pausedByDialogue && !isCompleted) {
      _pausedByDialogue = false;
      isPaused = false;
      const timerEl = document.getElementById('timer');
      if (timerEl) timerEl.classList.remove('paused');
    }
  });

  // ---- 页面不可见时暂停（离开页面/切后台）----
  let _pausedByVisibility = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 页面隐藏，暂停游戏
      if (!isPaused && !isCompleted) {
        _pausedByVisibility = true;
        isPaused = true;
        const overlay = document.getElementById('pause-overlay');
        const timerEl = document.getElementById('timer');
        if (overlay) overlay.classList.add('active');
        if (timerEl) timerEl.classList.add('paused');
        saveProgress();
      }
    } else {
      // 页面重新可见，如果是被可见性暂停的，保持暂停状态（需要手动点击恢复）
      // 不自动恢复，保持暂停画面等待用户确认
      if (_pausedByVisibility) {
        _pausedByVisibility = false;
        // 保持暂停状态，用户手动点击继续
      }
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

// ---------- 检测当前章节ID ----------
// 支持数字和字符串类型的levelId，每15关为一章
function _detectChapter(levelId) {
  const skinParam = new URLSearchParams(window.location.search).get('skin');
  if (skinParam) return parseInt(skinParam) || 1;
  // 字符串类型（如 "ch3_01"）
  if (typeof levelId === 'string') {
    const m = levelId.match(/ch(\d+)/i);
    if (m) return parseInt(m[1]);
  }
  // 数字类型（1-15=ch1, 16-30=ch2, ..., 91+=ch7）
  const num = parseInt(levelId);
  if (!isNaN(num) && num > 0) {
    return Math.min(7, Math.ceil(num / 15));
  }
  return 1;
}

// ---------- 章节开场剧情（自由模式已禁用，仅故事模式使用）----------
function triggerChapterIntro(levelId) {
  // 自由模式不使用逆转裁判式开场演出
  // 故事模式的开场剧情在 guide.js 的 _initStoryPerformance 中处理
  if (window.renderer) {
    const chapterId = _detectChapter(levelId);
    window.renderer.setTheme(chapterId);
    refreshBoard();
  }
}

// ---------- 连击计数（轻量反馈，无逆转裁判式演出）----------
let _comboCount = 0;
let _lastCorrectTime = 0;
function onCorrectPlacement(r, c, num) {
  // 自由模式：仅保留连击计数（供喜剧系统使用），不触发立绘/配音/破局特效
  const now = Date.now();
  if (now - _lastCorrectTime < 5000) {
    _comboCount++;
  } else {
    _comboCount = 1;
  }
  _lastCorrectTime = now;
  // 连击重置由喜剧系统负责反馈
  if (_comboCount >= 3) {
    _comboCount = 0;
  }
}

// 统计已填格子数
function _countFilledCells() {
  let count = 0;
  if (!gameBoard || !gameBoard.cells) return 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (gameBoard.cells[r][c].fixedNum || gameBoard.cells[r][c].fillNum) count++;
    }
  }
  return count;
}

// ---------- 标记通关 ----------
function markComplete() {
  isCompleted = true;
  clearInterval(timerInterval);

  // 自由模式：简单的通关音效
  if (typeof AudioManager !== 'undefined') {
    AudioManager.playWin();
  }

  // 保存通关记录
  if (typeof Storage !== 'undefined') {
    Storage.markComplete(currentLevelId, {
      time: elapsedSeconds,
      difficulty: currentLevelDifficulty
    });
    Storage.endSession(true);
    Storage.clearProgress(currentLevelId);
  }

  // 喜剧系统：计算评分
  let gradeInfo = { stars: 1, grade: 'C', mistakes: 0 };
  if (typeof ComedySystem !== 'undefined') {
    gradeInfo = ComedySystem.onComplete({ expectedSec: 360 });
    // S级连关彩蛋
    if (typeof ComedySystem.onSGradeStreak === 'function') {
      ComedySystem.onSGradeStreak(gradeInfo.grade);
    }
  }

  // 显示通关弹窗
  const overlay = document.getElementById('complete-overlay');
  const timeEl = document.getElementById('complete-time');
  timeEl.textContent = '用时 ' + formatTime(elapsedSeconds);

  // 星级
  const starsEl = document.getElementById('complete-stars');
  if (starsEl) {
    starsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.className = i < gradeInfo.stars ? 'star-on' : 'star-off';
      s.textContent = '★';
      starsEl.appendChild(s);
    }
  }

  // 等级徽章
  const gradeEl = document.getElementById('complete-grade');
  if (gradeEl) {
    gradeEl.textContent = gradeInfo.grade;
    gradeEl.className = 'complete-grade-badge grade-' + gradeInfo.grade;
  }

  // 守笼人评语（延迟显示，配合动画）
  const commentEl = document.getElementById('complete-comment');
  const commentText = document.getElementById('complete-comment-text');
  if (commentEl && commentText && typeof ComedySystem !== 'undefined') {
    setTimeout(() => {
      // 确定评语key（特殊评语优先于星级评语）
      const elapsed = elapsedSeconds;
      const mistakes = gradeInfo.mistakes || 0;
      const ratio = elapsed / 360;
      let commentKey = 'comedy.keeper.grade' + gradeInfo.grade;
      if (ratio < 0.3 && mistakes === 0) commentKey = 'comedy.keeper.tooFast';
      else if (mistakes === 0 && gradeInfo.grade !== 'SSS') commentKey = 'comedy.keeper.perfectClear';
      let lines = null;
      if (typeof I18N !== 'undefined' && I18N.getRaw) lines = I18N.getRaw(commentKey);
      else if (typeof t === 'function') lines = t(commentKey);
      if (Array.isArray(lines) && lines.length > 0) {
        commentText.textContent = lines[Math.floor(Math.random() * lines.length)];
      } else {
        commentText.textContent = '中规中矩，算你过关。';
      }
      commentEl.style.display = 'block';
    }, 800);
  }

  overlay.classList.add('active');
}

// ---------- 通关弹窗按钮绑定 ----------
function bindCompleteOverlay() {
  document.getElementById('btn-complete-back').addEventListener('click', () => {
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
    const params = new URLSearchParams(window.location.search);
    const fromMode = params.get('from') || params.get('difficulty');
    if (fromMode) {
      window.location.href = 'free-play.html';
    } else {
      window.location.href = 'menu.html';
    }
  });

  document.getElementById('btn-complete-next').addEventListener('click', () => {
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
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
let deepLongPressTimer = null;
let longPressTriggered = false;
let deepLongPressTriggered = false;
let longPressStartPos = null;
let lastTouchPos = null;
let touchBoxSelectTriggered = false;
let touchStartPos = null;
const LONG_PRESS_DURATION = 450;       // 短长按：触发45罗盘
const DEEP_LONG_PRESS_DURATION = 950;  // 超长按：切换候选模式

// ---------- 画布点击：选中格子 ----------
function bindCanvasClick() {
  const canvas = renderer.canvas;
  let isMouseDown = false;
  let mouseMoved = false;
  let mouseStartPos = null;
  let mouseLongPressTimer = null;
  let mouseDeepLongPressTimer = null;
  let mouseLongPressTriggered = false;
  let mouseDeepLongPressTriggered = false;
  let lastMousePos = null;
  const MOUSE_LONG_PRESS = 500;
  const MOUSE_DEEP_LONG_PRESS = 1000;
  
  function clearMouseLongPress() {
    if (mouseLongPressTimer) {
      clearTimeout(mouseLongPressTimer);
      mouseLongPressTimer = null;
    }
    if (mouseDeepLongPressTimer) {
      clearTimeout(mouseDeepLongPressTimer);
      mouseDeepLongPressTimer = null;
    }
  }

  // 鼠标按下 - 准备框选
  canvas.addEventListener('mousedown', function(e) {
    if (isPaused) return;
    isMouseDown = true;
    mouseMoved = false;
    mouseStartPos = { x: e.clientX, y: e.clientY };
    lastMousePos = { x: e.clientX, y: e.clientY };
    mouseLongPressTriggered = false;
    mouseDeepLongPressTriggered = false;
    
    // 设置长按定时器（仅杀手数独）
    if (gameBoard.size === 9 && gameBoard.cages && gameBoard.cages.length > 0) {
      clearMouseLongPress();
      mouseLongPressTimer = setTimeout(() => {
        mouseLongPressTriggered = true;
        handleLongPress(e.clientX, e.clientY);
        
        mouseDeepLongPressTimer = setTimeout(() => {
          mouseDeepLongPressTriggered = true;
          handleDeepLongPress(e.clientX, e.clientY);
        }, MOUSE_DEEP_LONG_PRESS - MOUSE_LONG_PRESS);
      }, MOUSE_LONG_PRESS);
    }
  });

  // 鼠标移动 - 框选
  canvas.addEventListener('mousemove', function(e) {
    if (isPaused || !isMouseDown) return;
    lastMousePos = { x: e.clientX, y: e.clientY };

    const dx = Math.abs(e.clientX - mouseStartPos.x);
    const dy = Math.abs(e.clientY - mouseStartPos.y);

    // 移动超过5像素才认为是框选（区别于单击）
    if (dx > 5 || dy > 5) {
      mouseMoved = true;
      // 取消长按
      clearMouseLongPress();
      // 如果罗盘已经显示了，隐藏
      if (mouseLongPressTriggered && !mouseDeepLongPressTriggered && _compassMode.longPressActive) {
        hideRule45Compass();
        _compassMode.longPressActive = false;
        _compassMode.lpCell = null;
      }
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
    clearMouseLongPress();
    
    // 如果是长按触发的罗盘（没到超长按），松手隐藏
    if (mouseLongPressTriggered && !mouseDeepLongPressTriggered && _compassMode.longPressActive) {
      hideRule45Compass();
      _compassMode.longPressActive = false;
      _compassMode.lpCell = null;
      mouseLongPressTriggered = false;
      mouseDeepLongPressTriggered = false;
      mouseStartPos = null;
      lastMousePos = null;
      return;
    }
    
    if (mouseLongPressTriggered || mouseDeepLongPressTriggered) {
      mouseLongPressTriggered = false;
      mouseDeepLongPressTriggered = false;
      mouseStartPos = null;
      lastMousePos = null;
      return;
    }

    if (mouseMoved && gameBoard.isBoxSelecting) {
      // 框选结束
      const count = gameBoard.selectedCells.length;
      gameBoard.endBoxSelect();
      Storage.logAction('useBoxSelect', { count });
      mouseMoved = false;
      mouseStartPos = null;
      lastMousePos = null;
      refreshBoard();
    } else {
      // 普通单击
      handleCanvasTap(e.clientX, e.clientY);
    }
    mouseStartPos = null;
    lastMousePos = null;
  });

  // 鼠标离开canvas
  canvas.addEventListener('mouseleave', function(e) {
    clearMouseLongPress();
    if (mouseLongPressTriggered && !mouseDeepLongPressTriggered && _compassMode.longPressActive) {
      hideRule45Compass();
      _compassMode.longPressActive = false;
      _compassMode.lpCell = null;
    }
    if (isMouseDown && gameBoard.isBoxSelecting) {
      gameBoard.endBoxSelect();
      refreshBoard();
    }
    isMouseDown = false;
    mouseMoved = false;
    mouseStartPos = null;
    lastMousePos = null;
    mouseLongPressTriggered = false;
    mouseDeepLongPressTriggered = false;
  });

  // 触摸开始
  canvas.addEventListener('touchstart', function(e) {
    if (isPaused) return;
    e.preventDefault();
    const touch = e.touches[0];
    longPressTriggered = false;
    deepLongPressTriggered = false;
    longPressStartPos = { x: touch.clientX, y: touch.clientY };
    lastTouchPos = { x: touch.clientX, y: touch.clientY };
    touchBoxSelectTriggered = false;
    touchStartPos = { x: touch.clientX, y: touch.clientY };

    // 清除之前的定时器
    if (longPressTimer) clearTimeout(longPressTimer);
    if (deepLongPressTimer) clearTimeout(deepLongPressTimer);

    // 设置长按定时器
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      handleLongPress(touch.clientX, touch.clientY);
      
      // 设置超长按定时器
      deepLongPressTimer = setTimeout(() => {
        deepLongPressTriggered = true;
        handleDeepLongPress(touch.clientX, touch.clientY);
      }, DEEP_LONG_PRESS_DURATION - LONG_PRESS_DURATION);
    }, LONG_PRESS_DURATION);
  }, { passive: false });

  // 触摸移动
  canvas.addEventListener('touchmove', function(e) {
    if (isPaused) return;
    e.preventDefault();
    const touch = e.touches[0];
    lastTouchPos = { x: touch.clientX, y: touch.clientY };

    if (longPressStartPos) {
      const dx = Math.abs(touch.clientX - longPressStartPos.x);
      const dy = Math.abs(touch.clientY - longPressStartPos.y);
      // 移动超过一定距离取消长按
      if (dx > 10 || dy > 10) {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (deepLongPressTimer) {
          clearTimeout(deepLongPressTimer);
          deepLongPressTimer = null;
        }
        // 如果罗盘已经显示了，移动时隐藏
        if (longPressTriggered && !deepLongPressTriggered && _compassMode.longPressActive) {
          hideRule45Compass();
          _compassMode.longPressActive = false;
          _compassMode.lpCell = null;
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
        if (deepLongPressTimer) {
          clearTimeout(deepLongPressTimer);
          deepLongPressTimer = null;
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
    if (deepLongPressTimer) {
      clearTimeout(deepLongPressTimer);
      deepLongPressTimer = null;
    }
    
    // 如果是长按触发的罗盘（没到超长按），松手隐藏
    if (longPressTriggered && !deepLongPressTriggered && _compassMode.longPressActive) {
      hideRule45Compass();
      _compassMode.longPressActive = false;
      _compassMode.lpCell = null;
      longPressTriggered = false;
      deepLongPressTriggered = false;
      longPressStartPos = null;
      touchStartPos = null;
      lastTouchPos = null;
      return;
    }

    // 如果是框选模式，结束框选
    if (gameBoard.isBoxSelecting) {
      gameBoard.endBoxSelect();
      touchBoxSelectTriggered = false;
      touchStartPos = null;
      longPressTriggered = false;
      deepLongPressTriggered = false;
      longPressStartPos = null;
      lastTouchPos = null;
      refreshBoard();
      return;
    }

    // 如果已经触发了长按/超长按，不处理点击
    if (longPressTriggered || deepLongPressTriggered) {
      longPressTriggered = false;
      deepLongPressTriggered = false;
      longPressStartPos = null;
      touchStartPos = null;
      lastTouchPos = null;
      return;
    }

    const touch = e.changedTouches[0];
    handleCanvasTap(touch.clientX, touch.clientY);
    longPressStartPos = null;
    touchStartPos = null;
    lastTouchPos = null;
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
  
  // 更新45法则提示面板（杀手数独）
  if (gameBoard.size === 9 && gameBoard.cages && gameBoard.cages.length > 0) {
    if (typeof _rule45Hint !== 'undefined' && _rule45Hint.active && _rule45Hint.cell
        && _rule45Hint.cell.r === r && _rule45Hint.cell.c === c) {
      // 点击同一个格子 → 关闭提示
      hideRule45Hint();
    } else {
      showRule45Hint(r, c);
    }
  }
  
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
 * 处理长按：切换候选模式
 */
function handleLongPress(clientX, clientY) {
  const { r, c } = getCellFromPos(clientX, clientY);
  
  // 杀手数独：直接切换候选模式
  _doSwitchToCandidate(r, c);
}

/**
 * 超长按：切换候选模式
 */
function handleDeepLongPress(clientX, clientY) {
  const { r, c } = getCellFromPos(clientX, clientY);
  _doSwitchToCandidate(r, c);
}

function _doSwitchToCandidate(r, c) {
  if (navigator.vibrate) {
    navigator.vibrate(80);
  }
  
  gameBoard.selectCell(r, c);
  
  const candidateBtn = document.getElementById('btn-candidate');
  if (gameBoard.inputMode !== 'candidate') {
    gameBoard.toggleInputMode();
    if (candidateBtn) {
      candidateBtn.style.backgroundColor = '#3b82f6';
      candidateBtn.style.color = 'white';
    }
  }
  
  refreshBoard();
}

// ---------- 数字键盘：填数 / 候选 / 长按连填 ----------
let _skipNextClick = false; // 长按后跳过下一次click

function bindNumPad() {
  document.getElementById('num-pad').addEventListener('click', function(e) {
    const btn = e.target.closest('.num-btn');
    if (!btn) return;
    if (isPaused) return;
    if (btn.classList.contains('completed')) return;
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playClick();
      AudioManager.vibrate('click');
    }

    const num = parseInt(btn.dataset.num);
    
    // 长按触发连填后，跳过本次click（防止刚激活就被取消）
    if (_skipNextClick) {
      _skipNextClick = false;
      return;
    }
    
    // 连填模式激活时
    if (quickFillModeSingle && quickFillNumSingle) {
      // 如果已经选中了空白格子 → 直接填数
      const activeCell = gameBoard.getActiveCell();
      if (activeCell) {
        const { r, c } = activeCell;
        const cell = gameBoard.cells[r][c];
        if (!cell.fixedNum && !cell.fillNum) {
          handleNumberInput(num);
          return;
        }
      }
      // 没有选中格子 → 切换连填数字
      if (num === quickFillNumSingle) {
        // 点同一个数字 → 退出连填
        exitQuickFillSingle();
      } else {
        // 点不同数字 → 切换到新数字
        selectQuickFillNumSingle(num);
      }
      return;
    }
    
    handleNumberInput(num);
  });
  
  // 设置长按连填
  setupQuickFillLongPress();
}

/**
 * 长按数字键激活连填模式（650ms）
 */
function setupQuickFillLongPress() {
  document.querySelectorAll('.num-btn').forEach(btn => {
    let longPressTimer = null;
    let longPressTriggered = false;

    btn.addEventListener('pointerdown', () => {
      const num = parseInt(btn.dataset.num);
      if (isNumberCompleteSingle(num)) return;
      
      // 如果这个数字已经是连填状态，直接取消
      if (quickFillModeSingle && quickFillNumSingle === num) {
        exitQuickFillSingle();
        return;
      }
      
      longPressTriggered = false;
      btn.classList.add('long-pressing');

      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        btn.classList.remove('long-pressing');
        selectQuickFillNumSingle(num);
        if (typeof AudioManager !== 'undefined') {
          AudioManager.vibrate('tap');
        } else if (navigator.vibrate) {
          navigator.vibrate(50);
        }
        _skipNextClick = true;
        longPressTimer = null;
      }, 650);
    });

    btn.addEventListener('pointerup', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        if (!longPressTriggered) {
          btn.classList.remove('long-pressing');
        }
      }
    });

    btn.addEventListener('pointerleave', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        if (!longPressTriggered) {
          btn.classList.remove('long-pressing');
        }
      }
    });
    
    // 阻止移动端默认浏览器长按菜单
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
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
    // RAHS: 记录笔记操作
    if (typeof ReasoningAndHintSystem !== 'undefined') {
      ReasoningAndHintSystem.onNote(r, c, num, 'toggle', 'manual', gameBoard);
    }
  } else {
    const activeCell = gameBoard.getActiveCell();
    if (!activeCell) {
      showToast('请先选中一个格子，或点击“⚡ 连填”后选择数字');
      return;
    }
    const { r, c } = activeCell;
    gameBoard.setNumber(num);
    Storage.logAction('setNumber', { num, r, c });
    // RAHS: 记录填数操作
    if (typeof ReasoningAndHintSystem !== 'undefined') {
      const isError = gameBoard.cells[r][c].isError;
      ReasoningAndHintSystem.onFill(r, c, num, isError, gameBoard);
      if (typeof _updateRahsTarget === 'function') _updateRahsTarget();
    }
  }
  gameBoard.checkConflicts();
  // 喜剧系统：检测填对/填错
  if (typeof ComedySystem !== 'undefined') {
    const active = gameBoard.getActiveCell();
    if (active) {
      const cell = gameBoard.cells[active.r][active.c];
      if (cell.isError) {
        ComedySystem.onWrong(active.r, active.c, num);
      } else if (cell.fillNum === num) {
        ComedySystem.onCorrect(active.r, active.c, num);
        onCorrectPlacement(active.r, active.c, num);
      }
    }
  }
  // 更新45法则提示面板
  if (typeof updateRule45Hint === 'function') updateRule45Hint();
  refreshBoard();
}

// 提示相关状态
let hintStep = 0;
let currentHint = null;
let currentEliminationIndex = -1; // -1 表示不在排除展示阶段
let eliminationTimer = null;      // 自动推进定时器

/**
 * 清除所有格子的排除标记
 */
function _clearEliminationMarks() {
  for (let r = 0; r < gameBoard.size; r++) {
    for (let c = 0; c < gameBoard.size; c++) {
      const cell = gameBoard.cells[r][c];
      cell.isHintEliminated = false;
      cell.hintEliminatedNum = null;
      cell.hintEliminationReason = '';
    }
  }
}

/**
 * 显示指定索引范围内的 elimination steps
 * @param {number} upToIndex - 显示到第几步（含）
 */
function _showEliminationSteps(upToIndex) {
  _clearEliminationMarks();
  if (!currentHint || !currentHint.eliminationSteps) return;
  const steps = currentHint.eliminationSteps;
  for (let i = 0; i <= upToIndex && i < steps.length; i++) {
    const step = steps[i];
    const cell = gameBoard.cells[step.r][step.c];
    cell.isHintEliminated = true;
    cell.hintEliminatedNum = step.eliminatedNum;
    cell.hintEliminationReason = step.reason;
  }
  _renderBoardForHint();
}

/**
 * 启动自动排除展示
 */
function _startEliminationAutoPlay() {
  if (eliminationTimer) {
    clearTimeout(eliminationTimer);
    eliminationTimer = null;
  }
  if (!currentHint || !currentHint.eliminationSteps || currentHint.eliminationSteps.length === 0) {
    // 没有排除步骤，直接跳到步骤3
    hintStep = 2; // 准备让用户下次点击到 step 3
    _showTechniqueStep();
    return;
  }

  // 逐条自动推进
  const totalSteps = currentHint.eliminationSteps.length;
  function advance() {
    if (currentEliminationIndex + 1 < totalSteps) {
      currentEliminationIndex++;
      _showEliminationSteps(currentEliminationIndex);
      // 显示当前排除的原因（用气泡指向被排除的格子）
      const step = currentHint.eliminationSteps[currentEliminationIndex];
      const msg = `❌ 这里不能填 ${step.eliminatedNum}\n因为${step.reason}`;
      showHintBubble(msg, step.r, step.c, 1400);
      eliminationTimer = setTimeout(advance, 1500);
    } else {
      // 所有排除步骤展示完毕，自动进入步骤3
      showHintBubble('✅ 全部排除完毕！\n\n再点提示看结论～', currentHint.r, currentHint.c, 1500);
      eliminationTimer = setTimeout(() => {
        eliminationTimer = null;
        currentEliminationIndex = -1;
        _clearEliminationMarks();
        _showTechniqueStep();
      }, 1600);
    }
  }
  eliminationTimer = setTimeout(advance, 1500);
}

/**
 * 显示技巧总结步骤（步骤3）
 */
function _showTechniqueStep() {
  hintStep = 3;
  currentHint = gameBoard.showHint(2);
  if (currentHint) {
    const techMsg = buildTechniqueMessage(currentHint);
    showHintBubble(techMsg, currentHint.r, currentHint.c, 6000);
  }
  _renderBoardForHint();
}

/**
 * 处理提示按钮点击（智能分级提示）
 * easy（简单）：   2步搞定 → 高亮 → 答案
 * medium（中等）： 3步 → 高亮 → 思路 → 答案
 * hard（困难）：   4步 → 观察 → 组合 → 推理 → 答案
 */
/**
 * 杀手数独提示：使用三步剧本式动画
 */
function _handleKillerHint() {
  // 构建当前盘面
  const board = [];
  for (let r = 0; r < 9; r++) {
    board[r] = [];
    for (let c = 0; c < 9; c++) {
      const cell = gameBoard.cells[r][c];
      board[r][c] = cell.fixedNum || cell.fillNum || 0;
    }
  }
  
  // 转换笼子格式
  const cages = gameBoard.cages.map(c => ({
    id: c.id,
    sum: c.sum,
    cells: c.cells.map(([r, col]) => [r, col])
  }));
  
  try {
    const solver = new TechRaterSolverV2(board, cages);
    const step = solver.findNextStep();
    
    if (!step || !step.row && step.row !== 0) {
      showToast(t('hint.noHint'));
      return;
    }
    
    // 使用三步剧本式动画
    if (typeof showScriptHint === 'function') {
      const targetRow = step.row;
      const targetCol = step.col;
      const targetNum = step.num;
      
      showScriptHint(step.evidence || {
        type: step.technique || 'unknown',
        targetCell: [step.row, step.col],
        targetValue: step.num,
        num: step.num
      }, () => {
        // 提示关闭后：自动填入答案并刷新候选数
        if (gameBoard.cells[targetRow][targetCol].fillNum) return; // 已经填了就跳过
        
        // 选中目标格
        gameBoard.selectCell(targetRow, targetCol);
        // 填入数字
        gameBoard.setNumber(targetNum);
        // 刷新盘面
        if (typeof refreshBoard === 'function') refreshBoard();
        // 检查是否完成
        if (typeof checkWin === 'function') checkWin();
      });
    }
  } catch (e) {
    console.error('Killer hint error:', e);
    showToast(t('hint.noHint'));
  }
}

function handleHint() {
  // RAHS: 记录使用了提示按钮
  if (typeof ReasoningAndHintSystem !== 'undefined') {
    ReasoningAndHintSystem.onHintButton();
  }
  // 杀手数独：使用三步剧本式动画提示
  if (gameBoard.cages && gameBoard.cages.length > 0 && typeof TechRaterSolverV2 !== 'undefined') {
    _handleKillerHint();
    return;
  }
  
  hintStep++;

  if (typeof ComedySystem !== 'undefined') ComedySystem.onHint(hintStep);

  if (hintStep === 1) {
    // 第1步：高亮目标格 + 关联区域
    currentHint = gameBoard.showHint(2);
    if (!currentHint) {
      hintStep = 0;
      showToast(t('hint.noHint'));
      return;
    }
    
    const difficulty = currentHint.difficulty || 'easy';
    const regionNames = { row: '这一行', col: '这一列', box: '这个宫', cage: '这个笼子' };
    const regionName = regionNames[currentHint.regionType] || '这个区域';
    
    if (difficulty === 'hard' && currentHint.regionType === 'cage') {
      const cageInfo = currentHint.cageInfo;
      showToast(`👀 观察这个笼子\n和为 ${cageInfo.sum}，共 ${cageInfo.size} 格\n（再点提示看组合分析）`, 4500);
    } else {
      showToast(`💡 看看金色高亮的${regionName}\n绿框格子有什么特别的？`, 3500);
    }
    
  } else if (hintStep === 2) {
    // 第2步：根据难度给不同提示
    if (!currentHint) currentHint = gameBoard.showHint(2);
    if (!currentHint) return;
    
    const difficulty = currentHint.difficulty || 'easy';
    
    if (difficulty === 'easy') {
      // 简单题直接给答案
      currentHint = gameBoard.showHint(3);
      if (currentHint && currentHint.num) {
        showToast(`✅ 答案：${currentHint.num}`, 3500);
      }
      hintStep = 3;
      
    } else if (difficulty === 'medium') {
      const techMsg = buildTechniqueMessage(currentHint);
      showToast(techMsg, 4500);
      
    } else if (difficulty === 'hard' && currentHint.regionType === 'cage') {
      showCageCombosHintFree(currentHint);
    } else {
      const techMsg = buildTechniqueMessage(currentHint);
      showToast(techMsg, 4500);
    }
    
  } else if (hintStep === 3) {
    // 第3步
    const difficulty = currentHint ? (currentHint.difficulty || 'easy') : 'easy';
    
    if (difficulty === 'easy') {
      _clearHintFree();
      return;
    }
    
    if (!currentHint) currentHint = gameBoard.showHint(2);
    if (!currentHint) return;
    
    if (difficulty === 'medium') {
      currentHint = gameBoard.showHint(3);
      if (currentHint && currentHint.num) {
        showToast(`✅ 答案：${currentHint.num}`, 3000);
      }
      hintStep = 4;
      
    } else if (difficulty === 'hard' && currentHint.regionType === 'cage') {
      showCageReasoningHintFree(currentHint);
    } else {
      currentHint = gameBoard.showHint(3);
      if (currentHint && currentHint.num) {
        showToast(`✅ 答案：${currentHint.num}`, 3000);
      }
      hintStep = 4;
    }
    
  } else if (hintStep === 4) {
    // 第4步：困难题给答案
    const difficulty = currentHint ? (currentHint.difficulty || 'easy') : 'easy';
    
    if (difficulty === 'hard') {
      currentHint = gameBoard.showHint(3);
      if (currentHint && currentHint.num) {
        showToast(`✅ 答案：${currentHint.num}`, 3000);
      }
      hintStep = 5;
    } else {
      _clearHintFree();
      return;
    }
    
  } else {
    _clearHintFree();
    return;
  }

  _renderBoardForHint();
}

/** 清除提示状态（自由模式） */
function _clearHintFree() {
  if (eliminationTimer) {
    clearTimeout(eliminationTimer);
    eliminationTimer = null;
  }
  currentEliminationIndex = -1;
  gameBoard.clearHints();
  hintStep = 0;
  currentHint = null;
  _renderBoardForHint();
}

/** 困难笼子题第2步：组合分析（自由模式） */
function showCageCombosHintFree(hint) {
  const cageInfo = hint.cageInfo;
  const num = hint.num;
  const combos = cageInfo.combos || [];
  
  if (combos.length === 0) {
    showToast('这个笼子暂时没有可用的组合信息', 3000);
    return;
  }
  
  const withNum = combos.filter(c => c.includes(num));
  
  let msg = `🔢 笼子组合分析\n和为 ${cageInfo.sum} 的 ${cageInfo.size} 格笼，共 ${combos.length} 种组合`;
  
  if (withNum.length > 0) {
    msg += `\n含 ${num} 的组合：${withNum.length} 种`;
    const showCount = Math.min(withNum.length, 2);
    for (let i = 0; i < showCount; i++) {
      msg += `\n  {${withNum[i].join(', ')}}`;
    }
    if (withNum.length > 2) msg += ` …还有${withNum.length - 2}种`;
  }
  
  msg += `\n（再点提示看推理思路）`;
  
  showToast(msg, 6000);
}

/** 困难笼子题第3步：推理思路（自由模式） */
function showCageReasoningHintFree(hint) {
  const cageInfo = hint.cageInfo;
  const num = hint.num;
  
  let msg = `💡 推理思路`;
  msg += `\n核心：数字 ${num} 在这个笼子里能放哪？`;
  
  // 检查是否能用45法则思路引导
  const { boxW, boxH } = gameBoard.getBoxSize();
  const boxR = Math.floor(hint.r / boxH) * boxH;
  const boxC = Math.floor(hint.c / boxW) * boxW;
  const cageCellsInBox = new Set();
  for (let r = boxR; r < boxR + boxH; r++) {
    for (let c = boxC; c < boxC + boxW; c++) {
      const cageId = gameBoard.cells[r][c].cageId;
      if (cageId !== null) cageCellsInBox.add(cageId);
    }
  }
  
  if (cageCellsInBox.size <= 4 && cageCellsInBox.size >= 2) {
    msg += `\n💡 试试45法则：这个宫总和一定是45`;
    msg += `\n看看宫里的笼子，能算出什么？`;
  }
  
  msg += `\n（再点提示看答案）`;
  
  showToast(msg, 6000);
}

/** 提示系统专用的轻量渲染（不触发refreshBoard的自动清提示逻辑） */
function _renderBoardForHint() {
  gameBoard.checkConflicts();
  renderer.render(gameBoard);
  updateNumberButtons();
}

/**
 * 根据hint对象构建第二层技巧说明消息（详细step-by-step）
 */
function buildTechniqueMessage(hint) {
  const tech = hint.technique;
  const num = hint.num;
  const labels = 'ABCDEFGHI';
  const cellName = `${labels[hint.r]}${hint.c + 1}`;

  // 根据排除步骤构建推理链摘要（最多显示前5条）
  let eliminationSummary = '';
  if (hint.eliminationSteps && hint.eliminationSteps.length > 0) {
    const steps = hint.eliminationSteps;
    const maxShow = Math.min(steps.length, 5);
    const details = [];
    for (let i = 0; i < maxShow; i++) {
      const s = steps[i];
      details.push(`  ${i+1}. (${s.r+1},${s.c+1})排除${s.eliminatedNum}→${s.reason}`);
    }
    eliminationSummary = '\n【推理步骤】\n' + details.join('\n');
    if (steps.length > maxShow) {
      eliminationSummary += `\n  ... 共${steps.length}步`;
    }
  }

  switch (tech) {
    case 'nakedSingle': {
      let msg = `💡 这个格子只能填 ${num}`;
      msg += `\n同行/列/宫里其他数字都齐了，就差 ${num}。`;
      return msg;
    }
    case 'hiddenSingle': {
      let regionName = '';
      if (hint.regionType === 'row') regionName = '这一行';
      else if (hint.regionType === 'col') regionName = '这一列';
      else if (hint.regionType === 'box') regionName = '这个宫';
      else if (hint.regionType === 'cage') regionName = '这个笼子';
      
      let msg = `💡 数字 ${num} 只能放这里`;
      msg += `\n换个角度：${regionName}里，数字 ${num} 没别的地方可去了。`;
      return msg;
    }
    case 'nakedPair': {
      if (hint.pairCells && hint.pairNums) {
        const num1 = hint.pairNums[0];
        const num2 = hint.pairNums[1];
        let msg = `💡 数对：${num1} 和 ${num2}`;
        msg += `\n这两个格子被 ${num1}、${num2} 包圆了，其他格子都不能有这俩数。`;
        if (num !== null) {
          msg += `\n划掉后，目标格就只剩 ${num} 了。`;
        }
        return msg;
      }
      return `💡 数对技巧\n${hint.description}`;
    }
    case 'xwing': {
      let msg = `💡 X-Wing 矩形法`;
      if (hint.xwingInfo) {
        const { num: xNum } = hint.xwingInfo;
        msg += ` · 数字${xNum}`;
        msg += `\n两行中 ${xNum} 刚好形成矩形，两列其他格都能排除。`;
      } else {
        msg += `\n${hint.description}`;
      }
      if (num !== null) {
        msg += `\n排除后，目标格 = ${num}。`;
      }
      return msg;
    }
    default:
      let msg = `💡 ${hint.techniqueName}`;
      msg += `\n${hint.description}`;
      if (num !== null && num !== undefined) {
        msg += `\n结论：${cellName} = ${num}`;
      }
      return msg;
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

// ---------- 气泡提示组件（指向目标格） ----------
let hintBubble = null;

function getHintBubble() {
  if (hintBubble) return hintBubble;
  
  const el = document.createElement('div');
  el.className = 'hint-bubble';
  el.style.cssText = `
    position: fixed;
    background: rgba(15, 23, 42, 0.95);
    color: white;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
    z-index: 150;
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
    max-width: 280px;
    pointer-events: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;
  
  const tail = document.createElement('div');
  tail.className = 'hint-bubble-tail';
  tail.style.cssText = `
    position: absolute;
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid rgba(15, 23, 42, 0.95);
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
  `;
  
  const text = document.createElement('div');
  text.className = 'hint-bubble-text';
  text.style.whiteSpace = 'pre-line';
  
  el.appendChild(tail);
  el.appendChild(text);
  document.body.appendChild(el);
  
  hintBubble = { el, tail, text, hideTimer: null };
  return hintBubble;
}

function showHintBubble(text, targetR, targetC, duration = 4000) {
  const bubble = getHintBubble();
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    showToast(text, duration);
    return;
  }
  
  bubble.text.textContent = text;
  bubble.el.style.opacity = '0';
  bubble.el.style.display = 'block';
  
  // 计算位置
  const rect = canvas.getBoundingClientRect();
  const cs = getComputedStyle(canvas);
  const cellSize = parseFloat(cs.getPropertyValue('--cell-size') || '40');
  const padding = parseFloat(cs.getPropertyValue('--padding') || '12');
  
  // 用 renderer 的实际值
  const actualCellSize = renderer.cellSize;
  const actualPadding = renderer.padding;
  
  // 目标格中心坐标（页面坐标）
  const scaleX = rect.width / (canvas.width / (window.devicePixelRatio || 1));
  const scaleY = rect.height / (canvas.height / (window.devicePixelRatio || 1));
  
  const cellCenterX = rect.left + actualPadding + (targetC + 0.5) * actualCellSize;
  const cellCenterY = rect.top + actualPadding + (targetR + 0.5) * actualCellSize;
  
  // 先显示一下让浏览器计算尺寸
  bubble.el.style.visibility = 'hidden';
  bubble.el.style.opacity = '1';
  
  requestAnimationFrame(() => {
    const bubbleW = bubble.el.offsetWidth;
    const bubbleH = bubble.el.offsetHeight;
    
    // 气泡显示在目标格上方
    let left = cellCenterX - bubbleW / 2;
    let top = cellCenterY - bubbleH - 16;
    
    // 尾巴居中
    bubble.tail.style.left = (bubbleW / 2 - 8) + 'px';
    bubble.tail.style.top = 'auto';
    bubble.tail.style.bottom = '-8px';
    bubble.tail.style.borderTop = '8px solid rgba(15, 23, 42, 0.95)';
    bubble.tail.style.borderBottom = 'none';
    
    // 边界检测
    const margin = 10;
    if (left < margin) left = margin;
    if (left + bubbleW > window.innerWidth - margin) left = window.innerWidth - bubbleW - margin;
    if (top < margin) {
      // 放不下就放下面
      top = cellCenterY + 16;
      bubble.tail.style.top = '-8px';
      bubble.tail.style.bottom = 'auto';
      bubble.tail.style.borderTop = 'none';
      bubble.tail.style.borderBottom = '8px solid rgba(15, 23, 42, 0.95)';
    }
    
    bubble.el.style.left = left + 'px';
    bubble.el.style.top = top + 'px';
    bubble.el.style.visibility = 'visible';
    bubble.el.style.opacity = '0';
    bubble.el.style.transform = 'translateY(4px)';
    
    requestAnimationFrame(() => {
      bubble.el.style.opacity = '1';
      bubble.el.style.transform = 'translateY(0)';
    });
  });
  
  // 自动隐藏
  if (bubble.hideTimer) clearTimeout(bubble.hideTimer);
  if (duration > 0) {
    bubble.hideTimer = setTimeout(() => {
      hideHintBubble();
    }, duration);
  }
}

function hideHintBubble() {
  const bubble = getHintBubble();
  if (bubble.hideTimer) {
    clearTimeout(bubble.hideTimer);
    bubble.hideTimer = null;
  }
  bubble.el.style.opacity = '0';
  bubble.el.style.transform = 'translateY(4px)';
  setTimeout(() => {
    bubble.el.style.display = 'none';
  }, 250);
}

// ---------- 工具栏按钮 ----------
function bindToolbar() {
  // 笔记回放按钮
  const playbackBtn = document.getElementById('btn-playback');
  if (playbackBtn && typeof NotePlayback !== 'undefined') {
    playbackBtn.addEventListener('click', function() {
      if (isPaused) return;
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      _togglePlaybackPanel();
    });
  }

  document.getElementById('btn-undo').addEventListener('click', () => {
    if (isPaused) return;
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
    gameBoard.undo();
    Storage.logAction('undo');
    if (typeof updateLedgerPanel === 'function') updateLedgerPanel();
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
    if (typeof ComedySystem !== 'undefined') ComedySystem.onErase();
    if (typeof updateLedgerPanel === 'function') updateLedgerPanel();
    refreshBoard();
  });

  // 重置按钮
  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      if (typeof ComedySystem !== 'undefined') ComedySystem.onReset();
    });
  }

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
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      const count = gameBoard.autoFillCandidates();
      // RAHS: 开启自动候选数模式
      if (typeof ReasoningAndHintSystem !== 'undefined') {
        ReasoningAndHintSystem.setAutoCandidates(true);
      }
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
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (isPaused) {
        togglePause();
      }
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      confirmRestartSingle();
    });
  }
}

// ==========================================
// 快捷填入模式（单人模式）
// ==========================================
let quickFillModeSingle = false;
let quickFillNumSingle = null;

function toggleQuickFill() {
  if (quickFillModeSingle) {
    exitQuickFillSingle();
  } else {
    quickFillModeSingle = true;
    const btn = document.getElementById('btn-quick-fill');
    if (btn) btn.classList.add('active');
  }
}

function clearQuickFillNumHighlightSingle() {
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.classList.remove('quick-fill-num');
  });
}

function exitQuickFillSingle() {
  quickFillModeSingle = false;
  quickFillNumSingle = null;
  const btn = document.getElementById('btn-quick-fill');
  if (btn) btn.classList.remove('active');
  clearQuickFillNumHighlightSingle();
  // 清除盘面高亮
  if (gameBoard) {
    gameBoard._quickFillHighlightNum = null;
    refreshBoard();
  }
}

function selectQuickFillNumSingle(num) {
  if (isNumberCompleteSingle(num)) return;
  clearQuickFillNumHighlightSingle();
  if (quickFillNumSingle === num) {
    quickFillNumSingle = null;
    quickFillModeSingle = false;
    if (gameBoard) {
      gameBoard._quickFillHighlightNum = null;
      refreshBoard();
    }
    return;
  }
  quickFillModeSingle = true;
  quickFillNumSingle = num;
  const btn = document.querySelector('.num-btn[data-num="' + num + '"]');
  if (btn) btn.classList.add('quick-fill-num');
  // 高亮盘面同数字格子
  if (gameBoard) {
    gameBoard._quickFillHighlightNum = num;
    refreshBoard();
  }
  // 提示
  if (typeof showGameToast === 'function') {
    showGameToast('⚡ 连填' + num + '：直接点空格快速填入');
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
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
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
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
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

  // 角色主动提示开关
  const charHintToggle = document.getElementById('setting-char-hint');
  if (charHintToggle) {
    charHintToggle.addEventListener('change', (e) => {
      if (typeof ReasoningAndHintSystem !== 'undefined') {
        if (e.target.checked) {
          ReasoningAndHintSystem.enable();
        } else {
          ReasoningAndHintSystem.disable();
        }
      }
      saveSettings();
    });
  }

  // 匿名数据分享开关
  const dataCollectToggle = document.getElementById('setting-data-collect');
  if (dataCollectToggle) {
    dataCollectToggle.addEventListener('change', (e) => {
      if (typeof DataCollector !== 'undefined') {
        if (e.target.checked) {
          DataCollector.enable();
        } else {
          DataCollector.disable();
        }
      }
      saveSettings();
    });
  }
  
  // ---------- 音频设置 ----------
  // 一键静音
  document.getElementById('setting-mute-all').addEventListener('change', (e) => {
    const muted = e.target.checked;
    gameBoard.settings.muteAll = muted;
    if (typeof AudioManager !== 'undefined') {
      AudioManager.setMuted(muted);
    }
    updateVolumeSlidersDisabled();
    saveSettings();
  });
  
  // BGM开关
  document.getElementById('setting-bgm').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    gameBoard.settings.bgm = enabled;
    if (typeof AudioManager !== 'undefined') {
      AudioManager.setBgmEnabled(enabled);
    }
    updateVolumeSlidersDisabled();
    saveSettings();
  });
  
  // BGM音量
  document.getElementById('setting-bgm-volume').addEventListener('input', (e) => {
    const vol = parseInt(e.target.value);
    gameBoard.settings.bgmVolume = vol;
    document.getElementById('setting-bgm-volume-value').textContent = vol + '%';
    if (typeof AudioManager !== 'undefined') {
      AudioManager.setBgmVolume(vol / 100);
    }
    saveSettings();
  });
  
  // 音效开关
  document.getElementById('setting-sfx').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    gameBoard.settings.sfx = enabled;
    if (typeof AudioManager !== 'undefined') {
      AudioManager.setSfxEnabled(enabled);
    }
    updateVolumeSlidersDisabled();
    saveSettings();
  });
  
  // 音效音量
  document.getElementById('setting-sfx-volume').addEventListener('input', (e) => {
    const vol = parseInt(e.target.value);
    gameBoard.settings.sfxVolume = vol;
    document.getElementById('setting-sfx-volume-value').textContent = vol + '%';
    if (typeof AudioManager !== 'undefined') {
      AudioManager.setSfxVolume(vol / 100);
    }
    saveSettings();
  });
}

/**
 * 更新音量滑块的禁用状态
 */
function updateVolumeSlidersDisabled() {
  const muted = gameBoard.settings.muteAll;
  
  const bgmRow = document.querySelector('#setting-bgm').closest('.setting-item').nextElementSibling;
  const sfxRow = document.querySelector('#setting-sfx').closest('.setting-item').nextElementSibling;
  
  if (bgmRow && bgmRow.classList.contains('setting-volume')) {
    bgmRow.classList.toggle('disabled', muted || !gameBoard.settings.bgm);
  }
  if (sfxRow && sfxRow.classList.contains('setting-volume')) {
    sfxRow.classList.toggle('disabled', muted || !gameBoard.settings.sfx);
  }
}

/**
 * 应用音频设置（页面初始化时调用）
 */
function applyAudioSettings() {
  if (typeof AudioManager === 'undefined') return;
  
  AudioManager.setMuted(gameBoard.settings.muteAll);
  AudioManager.setBgmEnabled(gameBoard.settings.bgm);
  AudioManager.setSfxEnabled(gameBoard.settings.sfx);
  AudioManager.setBgmVolume(gameBoard.settings.bgmVolume / 100);
  AudioManager.setSfxVolume(gameBoard.settings.sfxVolume / 100);
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
  
  // 音频设置
  if (saved.muteAll !== undefined) gameBoard.settings.muteAll = saved.muteAll;
  if (saved.bgm !== undefined) gameBoard.settings.bgm = saved.bgm;
  if (saved.sfx !== undefined) gameBoard.settings.sfx = saved.sfx;
  if (saved.bgmVolume !== undefined) gameBoard.settings.bgmVolume = saved.bgmVolume;
  if (saved.sfxVolume !== undefined) gameBoard.settings.sfxVolume = saved.sfxVolume;

  // 角色提示设置
  if (saved.charHintEnabled !== undefined && typeof ReasoningAndHintSystem !== 'undefined') {
    if (saved.charHintEnabled) {
      ReasoningAndHintSystem.enable();
    } else {
      ReasoningAndHintSystem.disable();
    }
  }
  if (saved.dataCollectEnabled !== undefined && typeof DataCollector !== 'undefined') {
    if (saved.dataCollectEnabled) {
      DataCollector.enable();
    } else {
      DataCollector.disable();
    }
  }
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
    highlightSameCage: gameBoard.highlightSettings.sameCage,
    muteAll: gameBoard.settings.muteAll,
    bgm: gameBoard.settings.bgm,
    sfx: gameBoard.settings.sfx,
    bgmVolume: gameBoard.settings.bgmVolume,
    sfxVolume: gameBoard.settings.sfxVolume,
    // 角色提示设置
    charHintEnabled: typeof ReasoningAndHintSystem !== 'undefined' ? ReasoningAndHintSystem.isEnabled() : true,
    dataCollectEnabled: typeof DataCollector !== 'undefined' ? DataCollector.isEnabled() : false
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

  // 角色提示设置
  const charHintEl = document.getElementById('setting-char-hint');
  if (charHintEl && typeof ReasoningAndHintSystem !== 'undefined') {
    charHintEl.checked = ReasoningAndHintSystem.isEnabled();
  }
  const dataCollectEl = document.getElementById('setting-data-collect');
  if (dataCollectEl && typeof DataCollector !== 'undefined') {
    dataCollectEl.checked = DataCollector.isEnabled();
  }
  
  // 音频设置
  document.getElementById('setting-mute-all').checked = gameBoard.settings.muteAll;
  document.getElementById('setting-bgm').checked = gameBoard.settings.bgm;
  document.getElementById('setting-sfx').checked = gameBoard.settings.sfx;
  document.getElementById('setting-bgm-volume').value = gameBoard.settings.bgmVolume;
  document.getElementById('setting-bgm-volume-value').textContent = gameBoard.settings.bgmVolume + '%';
  document.getElementById('setting-sfx-volume').value = gameBoard.settings.sfxVolume;
  document.getElementById('setting-sfx-volume-value').textContent = gameBoard.settings.sfxVolume + '%';
  
  updateVolumeSlidersDisabled();
}

// ==========================================
// 45法则罗盘（神兵利器：看破天机）
// ==========================================
let _compassMode = {
  active: false,          // 罗盘模式开关
  compassEl: null,
  laserEl: null,
  chainEl: null,
  particlesEl: null,
  hideTimer: null,
  longPressActive: false, // 长按是否已触发罗盘
  lpCell: null            // 长按起始格子
};

/**
 * 切换罗盘模式
 */
function toggleCompassMode() {
  _compassMode.active = !_compassMode.active;
  
  const btn = document.getElementById('btn-45rule');
  if (btn) {
    if (_compassMode.active) {
      btn.style.background = 'linear-gradient(135deg, #fbbf24, #f59e0b)';
      btn.style.color = '#1e293b';
      btn.style.boxShadow = '0 0 15px rgba(251, 191, 36, 0.5)';
      btn.style.fontWeight = 'bold';
      showToast('🧭 罗盘模式：点击任意宫查看45法则', 2000);
    } else {
      btn.style.background = '';
      btn.style.color = '';
      btn.style.boxShadow = '';
      btn.style.fontWeight = '';
      hideRule45Compass();
    }
  }
}

/**
 * 显示45法则罗盘
 */
function showRule45Compass(r, c) {
  if (gameBoard.size !== 9) return;
  if (!gameBoard.cages || gameBoard.cages.length === 0) return;
  
  const { boxW, boxH } = gameBoard.getBoxSize();
  const boxR = Math.floor(r / boxH) * boxH;
  const boxC = Math.floor(c / boxW) * boxW;
  const boxId = Math.floor(r / boxH) * 3 + Math.floor(c / boxW);
  
  const result = _calcRule45ForBox(boxR, boxC);
  
  const canvasRect = renderer.canvas.getBoundingClientRect();
  const pad = renderer.padding;
  const cellW = (canvasRect.width - pad * 2) / gameBoard.size;
  const cellH = (canvasRect.height - pad * 2) / gameBoard.size;
  
  const boxX = pad + boxC * cellW;
  const boxY = pad + boxR * cellH;
  const boxW_px = cellW * 3;
  const boxH_px = cellH * 3;
  const centerX = boxX + boxW_px / 2;
  const centerY = boxY + boxH_px / 2;
  
  if (!_compassMode.compassEl) {
    _compassMode.compassEl = document.createElement('div');
    _compassMode.compassEl.className = 'rule45-compass';
    document.body.appendChild(_compassMode.compassEl);
  }
  
  const compass = _compassMode.compassEl;
  const size = Math.max(boxW_px, boxH_px) * 1.3;
  
  compass.style.left = (canvasRect.left + centerX - size / 2) + 'px';
  compass.style.top = (canvasRect.top + centerY - size / 2) + 'px';
  compass.style.width = size + 'px';
  compass.style.height = size + 'px';
  
  compass.classList.remove('active', 'closing');
  void compass.offsetWidth;
  
  const totalSum = 45;
  const currentSum = result.insideSum;
  const remaining = totalSum - currentSum;
  
  let resultText = '';
  let resultClass = '';
  let targetCell = null;
  let targetValue = null;
  let targetType = '';
  
  if (result.outieCells && result.outieCells.length === 1 && result.outieValue !== null) {
    resultText = '✨ 锁定外突异数';
    resultClass = 'success';
    targetCell = result.outieCells[0];
    targetValue = result.outieValue;
    targetType = 'outie';
  } else if (result.innieCells && result.innieCells.length === 1 && result.innieValue !== null) {
    resultText = '✨ 锁定内突异数';
    resultClass = 'success';
    targetCell = result.innieCells[0];
    targetValue = result.innieValue;
    targetType = 'innie';
  } else if (result.outieCells && result.outieCells.length > 1) {
    resultText = `外突 ${result.outieCells.length} 格 · 和为 ${remaining}`;
    resultClass = 'warn';
  } else if (result.innieCells && result.innieCells.length > 1) {
    resultText = `内突 ${result.innieCells.length} 格 · 和为 ${remaining}`;
    resultClass = 'warn';
  } else {
    resultText = `还差 ${remaining} 点`;
    resultClass = 'warn';
  }
  
  let ticksHtml = '';
  for (let i = 0; i < 12; i++) {
    const angle = i * 30;
    ticksHtml += `<div class="rule45-tick" style="transform: rotate(${angle}deg) translateY(-${size * 0.45}px);"></div>`;
  }
  
  compass.innerHTML = `
    <div class="rule45-shockwave"></div>
    <div class="rule45-compass-ticks">${ticksHtml}</div>
    <div class="rule45-compass-ring" style="width:${size}px;height:${size}px;"></div>
    <div class="rule45-compass-ring r2" style="width:${size * 0.75}px;height:${size * 0.75}px;left:${size * 0.125}px;top:${size * 0.125}px;"></div>
    <div class="rule45-compass-center">
      <div class="rule45-compass-title">第${boxId + 1}宫 · 气场监测</div>
      <div class="rule45-compass-sum">${currentSum}<span class="total"> / ${totalSum}</span></div>
      <div class="rule45-compass-result ${resultClass}">${resultText}</div>
    </div>
  `;
  
  compass.classList.add('active');
  
  _spawnCompassParticles(
    canvasRect.left + centerX,
    canvasRect.top + centerY,
    12
  );
  
  if (targetCell && targetValue !== null) {
    _showCompassLaser(
      canvasRect.left + centerX,
      canvasRect.top + centerY,
      canvasRect.left + pad + (targetCell[1] + 0.5) * cellW,
      canvasRect.top + pad + (targetCell[0] + 0.5) * cellH,
      targetValue,
      targetType
    );
    
    _showDominoChain(
      result,
      targetCell,
      targetValue,
      targetType,
      canvasRect,
      pad,
      cellW,
      cellH
    );
  } else {
    _hideCompassLaser();
    _hideDominoChain();
  }
  
  if (_compassMode.hideTimer) {
    clearTimeout(_compassMode.hideTimer);
  }
}

/**
 * 隐藏罗盘
 */
function hideRule45Compass() {
  if (_compassMode.compassEl) {
    _compassMode.compassEl.classList.remove('active');
    _compassMode.compassEl.classList.add('closing');
    setTimeout(() => {
      if (_compassMode.compassEl) {
        _compassMode.compassEl.classList.remove('closing');
      }
    }, 300);
  }
  _hideCompassLaser();
  _hideDominoChain();
}

/**
 * 显示激光特效
 */
function _showCompassLaser(fromX, fromY, toX, toY, value, type) {
  if (!_compassMode.laserEl) {
    _compassMode.laserEl = document.createElement('div');
    _compassMode.laserEl.className = 'rule45-laser';
    document.body.appendChild(_compassMode.laserEl);
  }
  
  const laser = _compassMode.laserEl;
  laser.classList.remove('active');
  void laser.offsetWidth;
  
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  const label = type === 'outie' ? '异数' : (type === 'innie' ? '内数' : '');
  
  laser.innerHTML = `
    <div class="rule45-laser-line" style="width:${length}px;transform:rotate(${angle}deg);"></div>
    <div class="rule45-laser-target" style="left:${toX - fromX}px;top:${toY - fromY}px;">
      <div class="rule45-laser-value">
        ${label ? `<span class="label">${label}</span>` : ''}${value}
      </div>
    </div>
  `;
  
  laser.style.left = fromX + 'px';
  laser.style.top = fromY + 'px';
  laser.classList.add('active');
  
  setTimeout(() => {
    _spawnCompassParticles(toX, toY, 8);
  }, 650);
}

function _hideCompassLaser() {
  if (_compassMode.laserEl) {
    _compassMode.laserEl.classList.remove('active');
  }
}

/**
 * 粒子爆发特效
 */
function _spawnCompassParticles(centerX, centerY, count) {
  if (!_compassMode.particlesEl) {
    _compassMode.particlesEl = document.createElement('div');
    _compassMode.particlesEl.className = 'rule45-particles';
    document.body.appendChild(_compassMode.particlesEl);
  }
  
  const container = _compassMode.particlesEl;
  container.style.left = centerX + 'px';
  container.style.top = centerY + 'px';
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'rule45-particle';
    
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 30 + Math.random() * 50;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    
    particle.style.left = '0px';
    particle.style.top = '0px';
    particle.style.setProperty('--dx', dx + 'px');
    particle.style.setProperty('--dy', dy + 'px');
    particle.style.animationDelay = (Math.random() * 0.1) + 's';
    
    container.appendChild(particle);
    
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 900);
  }
}

/**
 * 多米诺连锁推理展示
 */
function _showDominoChain(result, targetCell, targetValue, targetType, canvasRect, pad, cellW, cellH) {
  const targetR = targetCell[0], targetC = targetCell[1];
  const cageId = gameBoard.cells[targetR][targetC].cageId;
  if (cageId === null || cageId === undefined) return;
  
  const cage = gameBoard.cages[cageId];
  if (!cage) return;
  
  let cageFilledSum = 0;
  let cageEmptyCells = [];
  for (const [r, c] of cage.cells) {
    const val = gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum || 0;
    if (val !== 0) {
      cageFilledSum += val;
    } else {
      if (r !== targetR || c !== targetC) {
        cageEmptyCells.push([r, c]);
      }
    }
  }
  
  cageFilledSum += targetValue;
  const remainingSum = cage.sum - cageFilledSum;
  
  const chainItems = [];
  chainItems.push({
    text: `${cage.sum} 笼 已填 ${cageFilledSum}，剩 ${remainingSum}`,
    cell: null
  });
  
  if (cageEmptyCells.length === 1 && remainingSum >= 1 && remainingSum <= 9) {
    chainItems.push({
      text: `唯一空格 = ${remainingSum} ✨`,
      cell: cageEmptyCells[0],
      highlight: true
    });
  } else if (cageEmptyCells.length > 0) {
    chainItems.push({
      text: `${cageEmptyCells.length} 格和为 ${remainingSum}`,
      cell: cageEmptyCells[0]
    });
  }
  
  if (chainItems.length < 2) return;
  
  if (!_compassMode.chainEl) {
    _compassMode.chainEl = document.createElement('div');
    _compassMode.chainEl.className = 'rule45-chain';
    document.body.appendChild(_compassMode.chainEl);
  }
  
  const chain = _compassMode.chainEl;
  chain.classList.remove('active');
  void chain.offsetWidth;
  
  const targetX = canvasRect.left + pad + (targetC + 0.5) * cellW;
  const targetY = canvasRect.top + pad + (targetR + 0.5) * cellH;
  
  let itemsHtml = '';
  let yOffset = 50;
  
  for (let i = 0; i < chainItems.length; i++) {
    const item = chainItems[i];
    const itemY = yOffset + i * 36;
    
    let itemStyle = `left:50%;top:${itemY}px;transform:translateX(-50%);`;
    if (item.highlight) {
      itemStyle += 'border-color:#22c55e;color:#22c55e;';
    }
    
    itemsHtml += `<div class="rule45-chain-item" style="${itemStyle}">${item.text}</div>`;
    
    if (i < chainItems.length - 1) {
      const arrowY = itemY + 28;
      itemsHtml += `<div class="rule45-chain-arrow" style="left:50%;top:${arrowY}px;transform:translateX(-50%);">↓</div>`;
    }
  }
  
  chain.innerHTML = itemsHtml;
  chain.style.left = targetX + 'px';
  chain.style.top = targetY + 'px';
  chain.classList.add('active');
}

function _hideDominoChain() {
  if (_compassMode.chainEl) {
    _compassMode.chainEl.classList.remove('active');
  }
}

/**
 * 计算某个宫的45法则数据
 */
function _calcRule45ForBox(boxR, boxC) {
  const size = gameBoard.size;
  const { boxW, boxH } = gameBoard.getBoxSize();
  
  const boxCells = [];
  const boxKeys = new Set();
  for (let dr = 0; dr < boxH; dr++) {
    for (let dc = 0; dc < boxW; dc++) {
      const r = boxR + dr, c = boxC + dc;
      boxCells.push([r, c]);
      boxKeys.add(r * size + c);
    }
  }
  
  const intersectingCages = new Set();
  for (const [r, c] of boxCells) {
    const cageId = gameBoard.cells[r][c].cageId;
    if (cageId !== null && cageId !== undefined) {
      intersectingCages.add(cageId);
    }
  }
  
  const fullyInside = [];
  const partiallyOutside = [];
  
  for (const cageId of intersectingCages) {
    const cage = gameBoard.cages[cageId];
    if (!cage) continue;
    
    let allInside = true;
    for (const [r, c] of cage.cells) {
      if (!boxKeys.has(r * size + c)) {
        allInside = false;
        break;
      }
    }
    
    if (allInside) {
      fullyInside.push(cage);
    } else {
      partiallyOutside.push(cage);
    }
  }
  
  let insideSum = 0;
  for (const cage of fullyInside) {
    insideSum += cage.sum;
  }
  
  const fullyInsideKeys = new Set();
  for (const cage of fullyInside) {
    for (const [r, c] of cage.cells) {
      fullyInsideKeys.add(r * size + c);
    }
  }
  
  let filledSum = 0;
  const innieCells = [];
  for (const [r, c] of boxCells) {
    if (!fullyInsideKeys.has(r * size + c)) {
      const val = gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum || 0;
      if (val !== 0) {
        filledSum += val;
      } else {
        innieCells.push([r, c]);
      }
    }
  }
  insideSum += filledSum;
  
  const outieCells = [];
  let outieFilledSum = 0;
  
  let totalCageSum = 0;
  for (const cageId of intersectingCages) {
    const cage = gameBoard.cages[cageId];
    if (cage) totalCageSum += cage.sum;
  }
  
  const outieKeySet = new Set();
  for (const cage of partiallyOutside) {
    for (const [r, c] of cage.cells) {
      if (!boxKeys.has(r * size + c)) {
        const key = r * size + c;
        if (!outieKeySet.has(key)) {
          outieKeySet.add(key);
          outieCells.push([r, c]);
          const val = gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum || 0;
          if (val !== 0) outieFilledSum += val;
        }
      }
    }
  }
  
  const sumOutsideValues = totalCageSum - 45;
  let outieValue = null;
  const outieEmpty = outieCells.filter(([r, c]) => 
    (gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum || 0) === 0
  );
  if (outieEmpty.length === 1) {
    const val = sumOutsideValues - outieFilledSum;
    if (val >= 1 && val <= 9) outieValue = val;
  }
  
  let innieValue = null;
  if (innieCells.length === 1) {
    const val = 45 - insideSum;
    if (val >= 1 && val <= 9) innieValue = val;
  }
  
  return {
    insideSum,
    fullyInsideCages: fullyInside.map(c => c.id),
    partiallyOutsideCages: partiallyOutside.map(c => c.id),
    totalCageSum,
    innieCells,
    innieValue,
    outieCells,
    outieValue,
    sumOutsideValues
  };
}

// ==========================================
// 45法则·实时账本面板（常驻盘面上方）
// ==========================================
let _ledger = {
  panelEl: null,
  hlContainer: null,
  currentTab: 'box',     // 当前标签：row/col/box/cage
  currentCell: null,     // 当前选中格子 [r, c]
  smartPick: 'box',      // 智能推荐的标签
  enabled: false,        // 是否启用（杀手数独才启用）
  data: {
    row: null,
    col: null,
    box: null,
    cage: null
  }
};

/**
 * 初始化账本面板
 */
function initLedgerPanel() {
  if (!gameBoard.cages || gameBoard.cages.length === 0 || gameBoard.size !== 9) {
    return; // 只在9x9杀手数独中启用
  }
  
  _ledger.enabled = true;
  
  const boardArea = document.getElementById('board-area');
  if (!boardArea) return;
  
  if (!_ledger.panelEl) {
    _ledger.panelEl = document.createElement('div');
    _ledger.panelEl.className = 'ledger-panel';
    // 插入到canvas前面（flex column布局中，面板在上方，canvas在下方）
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      boardArea.insertBefore(_ledger.panelEl, canvas);
    } else {
      boardArea.appendChild(_ledger.panelEl);
    }
  }
  
  if (!_ledger.hlContainer) {
    _ledger.hlContainer = document.createElement('div');
    _ledger.hlContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    boardArea.appendChild(_ledger.hlContainer);
  }
  
  // 默认隐藏，等有选中格子时再显示
  updateLedgerPanel();
}

/**
 * 更新账本面板（已废弃，改用简化版45提示 rule45-hint.js）
 */
function updateLedgerPanel() {
  return; // 永久禁用旧账本
  if (!_ledger.enabled) return;
  if (!gameBoard.selectedCell) {
    _hideLedgerPanel();
    return;
  }
  
  const { r, c } = gameBoard.selectedCell;
  _ledger.currentCell = [r, c];
  
  // 计算四个维度的数据
  _ledger.data.row = _calcLedgerRow(r, c);
  _ledger.data.col = _calcLedgerCol(r, c);
  _ledger.data.box = _calcLedgerBox(r, c);
  _ledger.data.cage = _calcLedgerCage(r, c);
  
  // 智能推荐
  _ledger.smartPick = _smartPickTab();
  
  // 如果当前标签不是手动选的（或第一次），用智能推荐
  if (!_ledger.manualTab) {
    _ledger.currentTab = _ledger.smartPick;
  }
  
  _renderLedgerPanel();
  _renderHighlights();
  _showLedgerPanel();
}

/**
 * 智能推荐：决定默认显示哪个标签
 */
function _smartPickTab() {
  const [r, c] = _ledger.currentCell || [0, 0];
  
  // 第0优先：检查用户点击的格子是不是某个维度的outie（伸出格）
  // 如果是，优先显示那个维度，让用户直观理解"从哪里伸出去"
  for (const dim of ['box', 'row', 'col']) {
    const d = _ledger.data[dim];
    if (!d || d.isComplete) continue;
    if (d.outieCells && d.outieCells.length > 0) {
      const isOutie = d.outieCells.some(([or, oc]) => or === r && oc === c);
      if (isOutie) return dim;
    }
  }
  
  // 第一优先：找有唯一可锁定异数格的维度（45法则直接出答案）
  let best45 = null;
  let bestGap = Infinity;
  
  for (const dim of ['box', 'row', 'col']) {
    const d = _ledger.data[dim];
    if (!d || d.isComplete) continue;
    if (d.targetValue !== null && d.targetValue >= 1 && d.targetValue <= 9) {
      const gap = 45 - d.insideSum;
      if (gap < bestGap) {
        bestGap = gap;
        best45 = dim;
      }
    }
  }
  
  if (best45) return best45;
  
  // 第二优先：笼子剩余空格 ≤ 3 个（信息量大）
  const cage = _ledger.data.cage;
  if (cage && !cage.isComplete && cage.emptyCount <= 3 && cage.emptyCount > 0) {
    return 'cage';
  }
  
  // 第三优先：在宫/行/列中，选已填数字最多的那个（信息量最大）
  let bestInfo = 'box';
  let bestFilled = 0;
  
  for (const dim of ['box', 'row', 'col']) {
    const d = _ledger.data[dim];
    if (d && !d.isComplete && d.filledCount > bestFilled) {
      bestFilled = d.filledCount;
      bestInfo = dim;
    }
  }
  
  // 如果连宫都填了少于2个，还是显示笼子（至少笼子有明确的目标和）
  if (bestFilled < 2 && cage && !cage.isComplete && cage.emptyCount > 0) {
    return 'cage';
  }
  
  return bestInfo;
}

/**
 * 计算行账本
 * 以选中格子所在的笼子为核心，计算该笼子相对于这一行的伸出关系
 */
function _calcLedgerRow(r, c) {
  const size = gameBoard.size;

  // ---- 基础统计：这一行的已填数字和 ----
  let filledSum = 0;
  let filledCount = 0;
  for (let col = 0; col < size; col++) {
    const val = gameBoard.cells[r][col].fillNum || gameBoard.cells[r][col].fixedNum || 0;
    if (val !== 0) {
      filledSum += val;
      filledCount++;
    }
  }

  const insideSum = filledSum;
  const remaining = 45 - insideSum;
  const isComplete = filledCount === size;
  const emptyCount = size - filledCount;

  // 错误检测
  let hasError = false;
  let errorType = null;
  if (isComplete && filledSum !== 45) {
    hasError = true;
    errorType = 'complete_mismatch';
  } else if (!isComplete && filledSum > 45) {
    hasError = true;
    errorType = 'overflow';
  }

  // ---- 45法则：以选中格子所在的笼子为核心 ----
  const selCageId = gameBoard.cells[r][c].cageId;
  let outieCells = [];       // 这个笼子伸出这一行的格子
  let outieFilledSum = 0;    // 伸出格中已填的和
  let cageInsideSum = 0;     // 这个笼子在这一行内已填的和
  let cageInsideCount = 0;   // 这个笼子在这一行内的格子数
  let cageInsideEmpty = 0;   // 这个笼子在这一行内的空格数
  let cageSum = 0;           // 笼子目标和
  let hasCage = false;       // 是否有笼子（杀手数独有，普通数独没有）

  if (selCageId !== null && selCageId !== undefined) {
    const cage = gameBoard.cages[selCageId];
    if (cage) {
      hasCage = true;
      cageSum = cage.sum;

      for (const [cr, cc] of cage.cells) {
        if (cr === r) {
          // 在这一行内
          cageInsideCount++;
          const val = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
          if (val !== 0) {
            cageInsideSum += val;
          } else {
            cageInsideEmpty++;
          }
        } else {
          // 在这一行外 → 伸出格
          outieCells.push([cr, cc]);
          const val = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
          if (val !== 0) outieFilledSum += val;
        }
      }
    }
  }

  // 异数计算：只有当这个笼子在这一行内的部分全部填完，且伸出格只有1个空时，才能直接出数
  // 公式：伸出格的和 = 笼子和 - 行内部分的和
  let targetValue = null;
  if (hasCage && outieCells.length > 0) {
    const outieEmpty = outieCells.filter(([or, oc]) =>
      (gameBoard.cells[or][oc].fillNum || gameBoard.cells[or][oc].fixedNum || 0) === 0
    );
    if (cageInsideEmpty === 0 && outieEmpty.length === 1) {
      // 行内部分全填了，伸出格只有1个空 → 可以直接算出
      const outieSumShouldBe = cageSum - cageInsideSum;
      const val = outieSumShouldBe - outieFilledSum;
      if (val >= 1 && val <= 9) targetValue = val;
    }
  }

  return {
    type: 'row',
    index: r,
    insideSum,
    filledSum,
    filledCount,
    emptyCount,
    total: 45,
    remaining,
    isComplete,
    hasError,
    errorType,
    // 45法则相关（以选中格子所在笼子为核心）
    outieCells,
    outieFilledSum,
    targetValue,
    cageSum,
    cageInsideSum,
    cageInsideCount,
    hasCage
  };
}

/**
 * 计算列账本
 * 以选中格子所在的笼子为核心，计算该笼子相对于这一列的伸出关系
 */
function _calcLedgerCol(r, c) {
  const size = gameBoard.size;

  // ---- 基础统计：这一列的已填数字和 ----
  let filledSum = 0;
  let filledCount = 0;
  for (let row = 0; row < size; row++) {
    const val = gameBoard.cells[row][c].fillNum || gameBoard.cells[row][c].fixedNum || 0;
    if (val !== 0) {
      filledSum += val;
      filledCount++;
    }
  }

  const insideSum = filledSum;
  const remaining = 45 - insideSum;
  const isComplete = filledCount === size;
  const emptyCount = size - filledCount;

  // 错误检测
  let hasError = false;
  let errorType = null;
  if (isComplete && filledSum !== 45) {
    hasError = true;
    errorType = 'complete_mismatch';
  } else if (!isComplete && filledSum > 45) {
    hasError = true;
    errorType = 'overflow';
  }

  // ---- 45法则：以选中格子所在的笼子为核心 ----
  const selCageId = gameBoard.cells[r][c].cageId;
  let outieCells = [];
  let outieFilledSum = 0;
  let cageInsideSum = 0;
  let cageInsideCount = 0;
  let cageInsideEmpty = 0;
  let cageSum = 0;
  let hasCage = false;

  if (selCageId !== null && selCageId !== undefined) {
    const cage = gameBoard.cages[selCageId];
    if (cage) {
      hasCage = true;
      cageSum = cage.sum;

      for (const [cr, cc] of cage.cells) {
        if (cc === c) {
          // 在这一列内
          cageInsideCount++;
          const val = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
          if (val !== 0) {
            cageInsideSum += val;
          } else {
            cageInsideEmpty++;
          }
        } else {
          // 在这一列外 → 伸出格
          outieCells.push([cr, cc]);
          const val = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
          if (val !== 0) outieFilledSum += val;
        }
      }
    }
  }

  // 异数计算：列内部分全填完 + 伸出格只有1个空 → 直接出数
  let targetValue = null;
  if (hasCage && outieCells.length > 0) {
    const outieEmpty = outieCells.filter(([or, oc]) =>
      (gameBoard.cells[or][oc].fillNum || gameBoard.cells[or][oc].fixedNum || 0) === 0
    );
    if (cageInsideEmpty === 0 && outieEmpty.length === 1) {
      const outieSumShouldBe = cageSum - cageInsideSum;
      const val = outieSumShouldBe - outieFilledSum;
      if (val >= 1 && val <= 9) targetValue = val;
    }
  }

  return {
    type: 'col',
    index: c,
    insideSum,
    filledSum,
    filledCount,
    emptyCount,
    total: 45,
    remaining,
    isComplete,
    hasError,
    errorType,
    outieCells,
    outieFilledSum,
    targetValue,
    cageSum,
    cageInsideSum,
    cageInsideCount,
    hasCage
  };
}

/**
 * 计算宫账本
 * 以选中格子所在的笼子为核心，计算该笼子相对于这一宫的伸出关系
 */
function _calcLedgerBox(r, c) {
  const size = gameBoard.size;
  const { boxW, boxH } = gameBoard.getBoxSize();
  const boxR = Math.floor(r / boxH) * boxH;
  const boxC = Math.floor(c / boxW) * boxW;
  const boxIndex = Math.floor(r / boxH) * 3 + Math.floor(c / boxW);

  // ---- 基础统计：这一宫的已填数字和 ----
  const boxKeys = new Set();
  let filledSum = 0;
  let filledCount = 0;

  for (let dr = 0; dr < boxH; dr++) {
    for (let dc = 0; dc < boxW; dc++) {
      const br = boxR + dr, bc = boxC + dc;
      boxKeys.add(br * size + bc);
      const val = gameBoard.cells[br][bc].fillNum || gameBoard.cells[br][bc].fixedNum || 0;
      if (val !== 0) {
        filledSum += val;
        filledCount++;
      }
    }
  }

  const insideSum = filledSum;
  const remaining = 45 - insideSum;
  const isComplete = filledCount === 9;
  const emptyCount = 9 - filledCount;

  // 错误检测
  let hasError = false;
  let errorType = null;
  if (isComplete && filledSum !== 45) {
    hasError = true;
    errorType = 'complete_mismatch';
  } else if (!isComplete && filledSum > 45) {
    hasError = true;
    errorType = 'overflow';
  }

  // ---- 45法则：以选中格子所在的笼子为核心 ----
  const selCageId = gameBoard.cells[r][c].cageId;
  let outieCells = [];       // 这个笼子伸出这一宫的格子
  let outieFilledSum = 0;    // 伸出格中已填的和
  let cageInsideSum = 0;     // 这个笼子在宫内已填的和
  let cageInsideCount = 0;   // 这个笼子在宫内的格子数
  let cageInsideEmpty = 0;   // 这个笼子在宫内的空格数
  let cageSum = 0;           // 笼子目标和
  let hasCage = false;

  if (selCageId !== null && selCageId !== undefined) {
    const cage = gameBoard.cages[selCageId];
    if (cage) {
      hasCage = true;
      cageSum = cage.sum;

      for (const [cr, cc] of cage.cells) {
        if (boxKeys.has(cr * size + cc)) {
          // 在宫内
          cageInsideCount++;
          const val = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
          if (val !== 0) {
            cageInsideSum += val;
          } else {
            cageInsideEmpty++;
          }
        } else {
          // 在宫外 → 伸出格
          outieCells.push([cr, cc]);
          const val = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
          if (val !== 0) outieFilledSum += val;
        }
      }
    }
  }

  // 异数计算：宫内部分全填完 + 伸出格只有1个空 → 直接出数
  // 公式：伸出格的和 = 笼子和 - 宫内部分的和
  let targetValue = null;
  if (hasCage && outieCells.length > 0) {
    const outieEmpty = outieCells.filter(([or, oc]) =>
      (gameBoard.cells[or][oc].fillNum || gameBoard.cells[or][oc].fixedNum || 0) === 0
    );
    if (cageInsideEmpty === 0 && outieEmpty.length === 1) {
      const outieSumShouldBe = cageSum - cageInsideSum;
      const val = outieSumShouldBe - outieFilledSum;
      if (val >= 1 && val <= 9) targetValue = val;
    }
  }

  return {
    type: 'box',
    index: boxIndex,
    boxR, boxC, boxW, boxH,
    insideSum,
    filledSum,
    filledCount,
    emptyCount,
    total: 45,
    remaining,
    isComplete,
    hasError,
    errorType,
    outieCells,
    outieFilledSum,
    targetValue,
    cageSum,
    cageInsideSum,
    cageInsideCount,
    hasCage
  };
}

/**
 * 计算笼子账本
 */
function _calcLedgerCage(r, c) {
  const cageId = gameBoard.cells[r][c].cageId;
  if (cageId === null || cageId === undefined) return null;
  
  const cage = gameBoard.cages[cageId];
  if (!cage) return null;
  
  let filledSum = 0;
  let filledCount = 0;
  let emptyCount = 0;
  const emptyCells = [];
  
  for (const [cr, cc] of cage.cells) {
    const val = gameBoard.cells[cr][cc].fillNum || gameBoard.cells[cr][cc].fixedNum || 0;
    if (val !== 0) {
      filledSum += val;
      filledCount++;
    } else {
      emptyCount++;
      emptyCells.push([cr, cc]);
    }
  }
  
  const remaining = cage.sum - filledSum;
  const isComplete = emptyCount === 0;
  let hasError = false;
  let errorType = null;
  if (isComplete && filledSum !== cage.sum) {
    hasError = true;
    errorType = 'complete_mismatch';
  } else if (!isComplete && filledSum > cage.sum) {
    hasError = true;
    errorType = 'overflow'; // 已填和已超过笼子目标和，必错
  }
  
  // 如果只剩1格且值合法，标记为可锁定
  let targetValue = null;
  if (emptyCount === 1 && remaining >= 1 && remaining <= 9) {
    targetValue = remaining;
  }
  
  return {
    type: 'cage',
    cageId,
    cageSum: cage.sum,
    cells: cage.cells,
    filledSum,
    filledCount,
    emptyCount,
    emptyCells,
    remaining,
    isComplete,
    hasError,
    targetValue
  };
}

/**
 * 渲染账本面板内容
 */
function _renderLedgerPanel() {
  const panel = _ledger.panelEl;
  if (!panel) return;
  
  const tab = _ledger.currentTab;
  const data = _ledger.data[tab];
  if (!data) return;
  
  const dimNames = { row: '行', col: '列', box: '宫', cage: '笼' };
  
  // 标签
  const tabs = ['row', 'col', 'box', 'cage'].map(t => {
    const isActive = t === tab;
    const isSmart = t === _ledger.smartPick;
    return `<div class="ledger-tab ${isActive ? 'active' : ''} ${isSmart && !isActive ? 'smart' : ''}" data-tab="${t}" onclick="_switchLedgerTab('${t}')">${dimNames[t]}</div>`;
  }).join('');
  
  // 主内容
  let mainLabel = '';
  let currentVal = 0;
  let totalVal = 0;
  let remainingVal = 0;
  let remainingClass = '';
  let detailHtml = '';
  let remainingLabel = '';
  
  if (data.type === 'row' || data.type === 'col' || data.type === 'box') {
    const dimLabel = data.type === 'row' ? `第 ${data.index + 1} 行` :
                     data.type === 'col' ? `第 ${data.index + 1} 列` :
                     `第 ${data.index + 1} 宫`;
    mainLabel = dimLabel + ' · 已填数字和';
    currentVal = data.insideSum;
    totalVal = 45;
    remainingVal = data.remaining;
    remainingLabel = '还缺';

    if (data.isComplete) {
      if (data.hasError) {
        remainingClass = 'error';
        if (data.errorType === 'complete_mismatch') {
          detailHtml = `<span class="red">⚠ 填完了，但加起来不等于45（${data.insideSum}），哪里错了</span>`;
        } else {
          detailHtml = `<span class="red">⚠ 填完了，但加起来不等于45，哪里错了</span>`;
        }
      } else {
        remainingClass = 'success';
        remainingLabel = '已完成';
        remainingVal = '✓';
        detailHtml = `<span class="green">这${data.type === 'row' ? '一行' : data.type === 'col' ? '一列' : '一宫'}已经填满了，没问题</span>`;
      }
    } else {
      if (data.hasError && data.errorType === 'overflow') {
        remainingClass = 'error';
        detailHtml = `<span class="red">⚠ 已填数字和（${data.insideSum}）已经超过45，肯定填错了</span>`;
      } else if (data.targetValue !== null) {
        remainingClass = 'success';
        const dimName = data.type === 'row' ? '行' : data.type === 'col' ? '列' : '宫';
        detailHtml = `🎯 <b>直接出答案！</b><br>
          绿框那格从这${dimName}伸出去，<br>
          笼子和(${data.cageSum}) - ${dimName}内已填(${data.cageInsideSum}) = <span class="highlight" style="font-size:18px">${data.targetValue}</span>`;
      } else if (data.outieCells && data.outieCells.length > 0) {
        remainingClass = 'warn';
        const dimName = data.type === 'row' ? '行' : data.type === 'col' ? '列' : '宫';
        const outieEmpty = data.outieCells.filter(([r, c]) =>
          (gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum || 0) === 0
        ).length;
        const cageInsideFilled = data.cageInsideCount - (data.cageInsideCount - (data.cageInsideSum ? 1 : 0)); // 占位，实际在下面算
        // 笼子和 - 维度内已知和 = 维度内未知 + 伸出格未知 的合计
        const remainingCage = data.cageSum - data.cageInsideSum - data.outieFilledSum;
        const insideEmpty = data.cageInsideCount - (data.cageInsideSum ? Math.floor(data.cageInsideSum / 5) : 0); // 粗略估算
        detailHtml = `🟩 这个笼子有 <b>${data.outieCells.length}</b> 格伸出这${dimName}<br>
          <span style="color:#94a3b8;font-size:11px;">笼子(${data.cageSum}) - ${dimName}内已知(${data.cageInsideSum + data.outieFilledSum}) = 还剩 <b>${remainingCage}</b> 待分配</span>`;
      } else {
        remainingClass = 'warn';
        detailHtml = `还差 <span class="highlight">${data.remaining}</span> 点才能凑够 45`;
      }
    }
  } else if (data.type === 'cage') {
    mainLabel = `这个笼子 · 目标和 ${data.cageSum}`;
    currentVal = data.filledSum;
    totalVal = data.cageSum;
    remainingVal = data.remaining;
    remainingLabel = '还差';
    
    if (data.isComplete) {
      if (data.hasError) {
        remainingClass = 'error';
        detailHtml = `<span class="red">⚠ 笼子和值不对，加起来是 ${data.filledSum}，应该是 ${data.cageSum}</span>`;
      } else {
        remainingClass = 'success';
        remainingLabel = '已完成';
        remainingVal = '✓';
        detailHtml = `<span class="green">这个笼子填完了，和值正确</span>`;
      }
    } else {
      if (data.targetValue !== null) {
        remainingClass = 'success';
        detailHtml = `💡 <b>只剩一格了！</b>这格只能填 <span class="highlight" style="font-size:16px">${data.targetValue}</span>`;
      } else {
        remainingClass = 'warn';
        detailHtml = `还有 <span class="orange">${data.emptyCount}</span> 个空格，加起来要等于 <span class="highlight">${data.remaining}</span>`;
      }
    }
  }
  
  panel.innerHTML = `
    <div class="ledger-card">
      <div class="ledger-tabs">
        ${tabs}
        <div class="ledger-help-btn" onclick="_showRule45Help()" title="什么是45法则？">?</div>
      </div>
      <div class="ledger-body">
        <div class="ledger-main">
          <div class="ledger-label">${mainLabel}</div>
          <div class="ledger-value-row">
            <span class="ledger-current">${currentVal}</span>
            <span class="ledger-divider">/</span>
            <span class="ledger-total">${totalVal}</span>
          </div>
        </div>
        <div class="ledger-remaining">
          <div class="ledger-remaining-label">${remainingLabel}</div>
          <div class="ledger-remaining-value ${remainingClass}">${remainingVal}</div>
        </div>
      </div>
      <div class="ledger-detail">${detailHtml}</div>
      ${data.outieCells && data.outieCells.length > 0 && data.type !== 'cage' && data.hasCage ? `
        <div class="ledger-math" onclick="this.classList.toggle('open')">
          <div class="ledger-math-header">
            <span>📐 怎么算的？</span>
            <span class="ledger-math-arrow">▼</span>
          </div>
          <div class="ledger-math-body">
            <p>这个笼子的目标和 = <b>${data.cageSum}</b></p>
            <p>笼子在${data.type === 'row' ? '行内' : data.type === 'col' ? '列内' : '宫内'}已填 = <b>${data.cageInsideSum}</b></p>
            <p>伸出格已填 = <b>${data.outieFilledSum}</b></p>
            <p class="math-result">未填的数 = ${data.cageSum} - ${data.cageInsideSum} - ${data.outieFilledSum} = <b>${data.cageSum - data.cageInsideSum - data.outieFilledSum}</b></p>
            <p style="font-size:10px;color:#64748b;margin-top:6px;">${data.targetValue !== null ? '✅ 因为行/列/宫内部分全填完了，伸出只剩1格空 → 直接锁定' : '⚠ 还有空格没填，暂时不能直接锁定数值'}</p>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * 显示45法则交互式教程
 */
function _showRule45Help() {
  // 创建教程弹窗
  let modal = document.getElementById('rule45-tutorial-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'rule45-tutorial-modal';
    modal.className = 'r45-modal';
    document.body.appendChild(modal);
  }
  
  const tutorialSteps = [
    {
      title: '什么是45法则？',
      content: `
        <div class="r45-tut-icon">🧮</div>
        <p>因为 <b>1+2+3+...+9 = 45</b></p>
        <p>所以在9x9数独中：</p>
        <p class="r45-highlight">每一行、每一列、每一宫<br>9个格子加起来一定等于 <b>45</b></p>
        <p style="font-size:12px;color:#94a3b8;">这是杀手数独最核心的解题技巧</p>
      `,
      highlight: null
    },
    {
      title: '最基础的用法',
      content: `
        <div class="r45-tut-icon">📊</div>
        <p>如果一行里已经填了8个数字：</p>
        <p>4 + 9 + 2 + 7 + 1 + 5 + 3 + 6 = <b>37</b></p>
        <p class="r45-highlight">剩下那格 = 45 - 37 = <b style="font-size:24px">8</b></p>
        <p style="font-size:12px;color:#94a3b8;">这个很简单，你早就会了</p>
      `,
      highlight: null
    },
    {
      title: '进阶：什么是"伸出格"？',
      content: `
        <div class="r45-tut-icon">🟩</div>
        <p>杀手数独里有<b>笼子</b>（虚线框）。</p>
        <p>有的笼子<b>完全在一宫里</b>，</p>
        <p>有的笼子<b>跨了两个宫</b>，</p>
        <p>伸出去的那几格，就叫 <span class="r45-badge-green">伸出格</span></p>
        <p style="font-size:12px;color:#94a3b8;">也叫 Outie，是45法则的灵魂</p>
      `,
      highlight: null
    },
    {
      title: '45法则的魔法',
      content: `
        <div class="r45-tut-icon">✨</div>
        <p>假设第5宫（中间那宫）：</p>
        <p>• 宫里的笼子加起来 = <b>41</b></p>
        <p>• 但一宫总和必须是 <b>45</b></p>
        <p class="r45-highlight">差的这 4 点在哪？<br>→ 在 <span class="r45-badge-green">伸出格</span> 里！</p>
        <p>伸出去的那格 = 45 - 41 = <b style="font-size:20px">4</b></p>
      `,
      highlight: null
    },
    {
      title: '反过来也成立',
      content: `
        <div class="r45-tut-icon">🔄</div>
        <p>有的笼子大部分在外面，</p>
        <p>只有一小截伸进一宫里（叫 <b>伸入格 / Innie</b>）。</p>
        <p>算法一样：</p>
        <p class="r45-highlight">45 - 宫内其他和 = 伸入格的和</p>
        <p style="font-size:12px;color:#94a3b8;">账本面板的绿框就是伸出/伸入格</p>
      `,
      highlight: null
    },
    {
      title: '账本面板怎么看？',
      content: `
        <div class="r45-tut-icon">📋</div>
        <p>点击任意格子，上方弹出账本：</p>
        <p><span style="display:inline-block;width:12px;height:12px;background:rgba(251,191,36,0.3);border:1px solid #fbbf24;border-radius:2px;vertical-align:middle;"></span> 金色区域 = 当前计算的宫/行/列</p>
        <p><span style="display:inline-block;width:12px;height:12px;border:2px solid #22c55e;border-radius:2px;vertical-align:middle;"></span> 绿框 = 伸出格（从金色区域伸出去）</p>
        <p><span style="display:inline-block;width:12px;height:12px;background:rgba(59,130,246,0.2);border:1px solid #3b82f6;border-radius:2px;vertical-align:middle;"></span> 蓝色 = 相关的笼子</p>
        <p style="font-size:12px;color:#94a3b8;">点上面的标签可以切换维度</p>
      `,
      highlight: null
    },
    {
      title: '开始用吧！',
      content: `
        <div class="r45-tut-icon">🎯</div>
        <p>记住口诀：</p>
        <p class="r45-highlight" style="font-size:16px;">一宫总和45<br>减完里面的<br>剩下的就在外面</p>
        <p>现在点一个格子试试，<br>看看账本面板能告诉你什么！</p>
      `,
      highlight: null
    }
  ];
  
  let currentStep = 0;
  
  function renderStep() {
    const step = tutorialSteps[currentStep];
    modal.innerHTML = `
      <div class="r45-modal-overlay" onclick="_closeRule45Tutorial()">
        <div class="r45-modal-content" onclick="event.stopPropagation()">
          <div class="r45-modal-close" onclick="_closeRule45Tutorial()">×</div>
          <div class="r45-modal-title">${step.title}</div>
          <div class="r45-modal-body">${step.content}</div>
          <div class="r45-modal-footer">
            <div class="r45-step-indicator">
              ${tutorialSteps.map((_, i) => `<span class="r45-dot ${i === currentStep ? 'active' : ''}"></span>`).join('')}
            </div>
            <div class="r45-modal-btns">
              ${currentStep > 0 ? '<button class="r45-btn r45-btn-secondary" onclick="_r45PrevStep()">上一步</button>' : '<span></span>'}
              <button class="r45-btn r45-btn-primary" onclick="_r45NextStep()">
                ${currentStep === tutorialSteps.length - 1 ? '我知道了' : '下一步 →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  }
  
  // 暴露全局函数
  window._closeRule45Tutorial = function() {
    modal.style.display = 'none';
  };
  
  window._r45NextStep = function() {
    if (currentStep < tutorialSteps.length - 1) {
      currentStep++;
      renderStep();
    } else {
      _closeRule45Tutorial();
    }
  };
  
  window._r45PrevStep = function() {
    if (currentStep > 0) {
      currentStep--;
      renderStep();
    }
  };
  
  renderStep();
}

/**
 * 切换标签
 */
function _switchLedgerTab(tab) {
  _ledger.currentTab = tab;
  _ledger.manualTab = true;
  _renderLedgerPanel();
  _renderHighlights();
}

/**
 * 渲染高亮效果
 */
function _renderHighlights() {
  const container = _ledger.hlContainer;
  if (!container) return;
  
  const canvas = renderer.canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const pad = renderer.padding;
  const cellW = (canvasRect.width - pad * 2) / gameBoard.size;
  const cellH = (canvasRect.height - pad * 2) / gameBoard.size;
  
  // canvas在容器中的偏移（含padding）
  const offsetX = pad + (canvasRect.left - containerRect.left);
  const offsetY = pad + (canvasRect.top - containerRect.top);
  
  container.innerHTML = '';
  
  const tab = _ledger.currentTab;
  const data = _ledger.data[tab];
  if (!data) return;
  
  // 判断是否有outie格子，如果有则主背景要更淡，突出绿色
  const hasOutie = data.outieCells && data.outieCells.length > 0;
  const dimClass = hasOutie ? ' hl-dimmed' : '';
  
  // 主高亮区域
  if (data.type === 'row') {
    const r = data.index;
    const glow = document.createElement('div');
    glow.className = 'ledger-highlight active hl-row-glow' + dimClass;
    glow.style.left = offsetX + 'px';
    glow.style.top = (offsetY + r * cellH) + 'px';
    glow.style.width = (cellW * 9) + 'px';
    glow.style.height = cellH + 'px';
    
    if (cellW > 35) {
      const label = document.createElement('div');
      label.className = 'hl-dim-label hl-label-gold';
      label.textContent = `第 ${r + 1} 行`;
      glow.appendChild(label);
    }
    
    container.appendChild(glow);
  } else if (data.type === 'col') {
    const c = data.index;
    const glow = document.createElement('div');
    glow.className = 'ledger-highlight active hl-col-glow' + dimClass;
    glow.style.left = (offsetX + c * cellW) + 'px';
    glow.style.top = offsetY + 'px';
    glow.style.width = cellW + 'px';
    glow.style.height = (cellH * 9) + 'px';
    
    if (cellW > 35) {
      const label = document.createElement('div');
      label.className = 'hl-dim-label hl-label-gold';
      label.style.writingMode = 'vertical-rl';
      label.textContent = `第 ${c + 1} 列`;
      glow.appendChild(label);
    }
    
    container.appendChild(glow);
  } else if (data.type === 'box') {
    const glow = document.createElement('div');
    glow.className = 'ledger-highlight active hl-box-glow' + dimClass;
    glow.style.left = (offsetX + data.boxC * cellW) + 'px';
    glow.style.top = (offsetY + data.boxR * cellH) + 'px';
    glow.style.width = (data.boxW * cellW) + 'px';
    glow.style.height = (data.boxH * cellH) + 'px';
    
    if (cellW > 35) {
      const label = document.createElement('div');
      label.className = 'hl-dim-label hl-label-gold';
      label.textContent = `第 ${data.index + 1} 宫`;
      // 当有outie格子时，把宫标签移到右上角，避免和笼子标签重叠
      if (hasOutie) {
        label.style.left = 'auto';
        label.style.right = '0';
        label.style.transform = 'none';
      }
      glow.appendChild(label);
    }
    
    container.appendChild(glow);
  } else if (data.type === 'cage') {
    // 计算笼子的包围盒
    let minR = 9, minC = 9, maxR = -1, maxC = -1;
    for (const [r, c] of data.cells) {
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
    const glow = document.createElement('div');
    glow.className = 'ledger-highlight active hl-cage-glow' + dimClass;
    glow.style.left = (offsetX + minC * cellW - 2) + 'px';
    glow.style.top = (offsetY + minR * cellH - 2) + 'px';
    glow.style.width = ((maxC - minC + 1) * cellW + 4) + 'px';
    glow.style.height = ((maxR - minR + 1) * cellH + 4) + 'px';
    
    // 笼子标签
    if (cellW > 35) {
      const label = document.createElement('div');
      label.className = 'hl-cage-label';
      label.innerHTML = `目标和 <b>${data.cageSum}</b>`;
      glow.appendChild(label);
    }
    
    container.appendChild(glow);
  }
  
  // 跨出格子（outie）绿边标记
  if (data.outieCells && data.outieCells.length > 0) {
    for (const [r, c] of data.outieCells) {
      const cell = document.createElement('div');
      cell.className = 'hl-outie-cell';
      cell.style.left = (offsetX + c * cellW + 1) + 'px';
      cell.style.top = (offsetY + r * cellH + 1) + 'px';
      cell.style.width = (cellW - 2) + 'px';
      cell.style.height = (cellH - 2) + 'px';
      
      // 只在格子足够大时显示标签
      if (cellW > 40) {
        const label = document.createElement('div');
        label.className = 'hl-outie-label';
        label.textContent = '伸出';
        cell.appendChild(label);
      }
      
      container.appendChild(cell);
    }
  }
  
  // 目标格子（可锁定值）金色标记
  if (data.targetValue !== null) {
    let targetCell = null;
    if (data.type === 'cage' && data.emptyCells && data.emptyCells.length === 1) {
      targetCell = data.emptyCells[0];
    } else if (data.outieCells) {
      const empty = data.outieCells.filter(([r, c]) =>
        (gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum || 0) === 0
      );
      if (empty.length === 1) targetCell = empty[0];
    }
    
    if (targetCell) {
      const [tr, tc] = targetCell;
      const target = document.createElement('div');
      target.className = 'hl-target-cell';
      target.style.left = (offsetX + (tc + 0.5) * cellW) + 'px';
      target.style.top = (offsetY + (tr + 0.5) * cellH) + 'px';
      target.style.width = (cellW - 4) + 'px';
      target.style.height = (cellH - 4) + 'px';
      target.style.marginLeft = -(cellW - 4) / 2 + 'px';
      target.style.marginTop = -(cellH - 4) / 2 + 'px';
      target.innerHTML = `<div class="hl-target-value">${data.targetValue}</div>`;
      container.appendChild(target);
    }
  }
}

function _showLedgerPanel() {
  if (_ledger.panelEl) {
    _ledger.panelEl.classList.add('active');
    // 面板显示时，canvas稍微缩小一点给面板腾空间
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.maxHeight = 'calc(100% - 56px)';
    }
  }
}

function _hideLedgerPanel() {
  if (_ledger.panelEl) {
    _ledger.panelEl.classList.remove('active');
    // 面板隐藏时，canvas恢复占满
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.maxHeight = '100%';
    }
  }
  if (_ledger.hlContainer) {
    _ledger.hlContainer.innerHTML = '';
  }
}

// ==========================================
// 45法则演示模式
// ==========================================
let _demoMode = {
  active: false,
  solver: null,
  allSteps: [],
  demoStep: 0,      // 当前演示到第几步
  autoTimer: null,
  playing: false
};

/**
 * 初始化演示模式（绑定按钮）
 */
function initDemoMode() {
  const btn = document.getElementById('btn-demo');
  if (!btn) return;
  
  // 只在杀手数独中显示
  if (!gameBoard.cages || gameBoard.cages.length === 0 || gameBoard.size !== 9) {
    btn.style.display = 'none';
    return;
  }
  
  btn.addEventListener('click', () => {
    if (isPaused) return;
    if (typeof AudioManager !== 'undefined') AudioManager.playClick();
    toggleDemoMode();
  });
}

/**
 * 切换演示模式
 */
function toggleDemoMode() {
  if (_demoMode.active) {
    exitDemoMode();
  } else {
    enterDemoMode();
  }
}

/**
 * 进入演示模式：用求解器算出完整解答，然后逐步填入展示45法则效果
 */
function enterDemoMode() {
  if (!gameBoard.cages || gameBoard.cages.length === 0) {
    showToast('只有杀手数独才有45法则演示哦', 2000);
    return;
  }
  
  // 构造求解器输入
  const board = [];
  for (let r = 0; r < 9; r++) {
    board[r] = [];
    for (let c = 0; c < 9; c++) {
      board[r][c] = gameBoard.cells[r][c].fixedNum || gameBoard.cells[r][c].fillNum || 0;
    }
  }
  
  // 转换笼子格式
  const cages = gameBoard.cages.map(c => ({
    id: c.id,
    sum: c.sum,
    cells: c.cells.slice()
  }));
  
  // 创建求解器并求解
  let solver;
  try {
    solver = new TechRaterSolverV2(board, cages);
  } catch (e) {
    console.error('求解器初始化失败:', e);
    showToast('演示模式加载失败', 2000);
    return;
  }
  
  const result = solver.solve(500);
  if (!result.complete && result.steps < 3) {
    showToast('这道题可解的步骤太少了，换一道题试试吧', 2000);
    return;
  }
  
  _demoMode.active = true;
  _demoMode.solver = solver;
  _demoMode.allSteps = solver.steps.slice();
  _demoMode.demoStep = 0;
  _demoMode.playing = false;
  
  // 清空当前填数（从固定数字重新开始）
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!gameBoard.cells[r][c].fixedNum) {
        gameBoard.cells[r][c].fillNum = null;
        gameBoard.cells[r][c].candidates = new Set([1,2,3,4,5,6,7,8,9]);
      }
    }
  }
  gameBoard.history = [];
  
  // 更新按钮状态
  const btn = document.getElementById('btn-demo');
  if (btn) {
    btn.textContent = '⏹ 退出演示';
    btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    btn.style.color = 'white';
    btn.style.fontWeight = 'bold';
  }
  
  // 显示演示说明
  showToast('🎯 45法则演示模式：点击"下一步"逐步填数，观察账本变化', 3000);
  
  // 找到第一个45法则的步骤，在那之前自动填入
  const firstRule45Index = _demoMode.allSteps.findIndex(s => s.technique === 'rule45');
  
  if (firstRule45Index > 0) {
    // 自动填入45法则之前的所有步骤（快速填充背景）
    const preSteps = Math.min(firstRule45Index, 15); // 最多先填15步
    for (let i = 0; i < preSteps; i++) {
      const step = _demoMode.allSteps[i];
      _demoFillCell(step.row, step.col, step.num);
    }
    _demoMode.demoStep = preSteps;
    
    // 选中45法则目标格附近的格子，展示账本效果
    const rule45Step = _demoMode.allSteps[firstRule45Index];
    if (rule45Step && rule45Step.evidence) {
      // 选中与45法则相关的格子（比如outie或innie）
      let targetCell = null;
      if (rule45Step.evidence.outieCells && rule45Step.evidence.outieCells.length > 0) {
        targetCell = rule45Step.evidence.outieCells[0];
      } else if (rule45Step.evidence.scopeCells && rule45Step.evidence.scopeCells.length > 0) {
        targetCell = rule45Step.evidence.scopeCells[0];
      }
      
      if (targetCell) {
        gameBoard.selectCell(targetCell[0], targetCell[1]);
      } else {
        gameBoard.selectCell(rule45Step.row, rule45Step.col);
      }
    } else {
      gameBoard.selectCell(rule45Step.row, rule45Step.col);
    }
    
    refreshBoard();
    if (typeof updateLedgerPanel === 'function') updateLedgerPanel();
    
    // 显示提示
    setTimeout(() => {
      showToast(`💡 已填 ${preSteps} 步背景数字，现在点击账本查看45法则效果！或点"下一步"继续`, 4000);
    }, 500);
  } else {
    // 没有45法则的题，就先填10步展示基本账本
    const preSteps = Math.min(10, _demoMode.allSteps.length);
    for (let i = 0; i < preSteps; i++) {
      const step = _demoMode.allSteps[i];
      _demoFillCell(step.row, step.col, step.num);
    }
    _demoMode.demoStep = preSteps;
    
    if (_demoMode.allSteps.length > 0) {
      const last = _demoMode.allSteps[preSteps - 1];
      gameBoard.selectCell(last.row, last.col);
    }
    
    refreshBoard();
    if (typeof updateLedgerPanel === 'function') updateLedgerPanel();
  }
  
  // 显示演示控制条
  _showDemoControls();
}

/**
 * 演示模式下填数（不记录历史，不走正常流程）
 */
function _demoFillCell(r, c, num) {
  const cell = gameBoard.cells[r][c];
  if (cell.fixedNum) return;
  
  cell.fillNum = num;
  cell.candidates.clear();
  
  // 简单清理同行列宫的候选
  for (let i = 0; i < 9; i++) {
    gameBoard.cells[r][i].candidates.delete(num);
    gameBoard.cells[i][c].candidates.delete(num);
  }
  const boxR = Math.floor(r / 3) * 3, boxC = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      gameBoard.cells[boxR + dr][boxC + dc].candidates.delete(num);
    }
  }
}

/**
 * 显示演示控制条
 */
function _showDemoControls() {
  // 创建浮动控制条
  let ctrl = document.getElementById('demo-controls');
  if (!ctrl) {
    ctrl = document.createElement('div');
    ctrl.id = 'demo-controls';
    ctrl.className = 'demo-controls';
    document.body.appendChild(ctrl);
  }
  
  ctrl.innerHTML = `
    <div class="demo-ctrl-inner">
      <div class="demo-ctrl-title">🎯 45法则演示</div>
      <div class="demo-ctrl-progress">
        <span id="demo-step-info">第 ${_demoMode.demoStep} / ${_demoMode.allSteps.length} 步</span>
      </div>
      <div class="demo-ctrl-btns">
        <button class="demo-btn demo-btn-primary" onclick="demoNextStep()">▶ 下一步</button>
        <button class="demo-btn" onclick="demoAutoPlay()">⏩ 自动</button>
        <button class="demo-btn" onclick="demoSkipToRule45()">🎯 跳到45法则</button>
        <button class="demo-btn demo-btn-danger" onclick="exitDemoMode()">退出</button>
      </div>
      <div class="demo-ctrl-tech" id="demo-tech-info">
        当前技巧：--
      </div>
    </div>
  `;
  
  ctrl.style.display = 'block';
  _updateDemoTechInfo();
}

/**
 * 更新当前技巧信息
 */
function _updateDemoTechInfo() {
  const el = document.getElementById('demo-tech-info');
  if (!el) return;
  
  if (_demoMode.demoStep > 0 && _demoMode.demoStep <= _demoMode.allSteps.length) {
    const step = _demoMode.allSteps[_demoMode.demoStep - 1];
    const techNames = {
      nakedSingle: '裸单',
      cageUnique: '笼子唯一组合',
      hiddenSingle: '隐单',
      rule45: '✨ 45法则',
      nakedPair: '显性数对',
      hiddenPair: '隐性数对',
      pointingClaiming: '区块排除'
    };
    el.innerHTML = `上一步技巧：<b style="color:${step.technique === 'rule45' ? '#fbbf24' : '#60a5fa'}">${techNames[step.technique] || step.technique}</b>`;
  }
}

/**
 * 演示：下一步
 */
function demoNextStep() {
  if (!_demoMode.active) return;
  if (_demoMode.demoStep >= _demoMode.allSteps.length) {
    showToast('🎉 已经演示完所有步骤了！', 2000);
    return;
  }
  
  const step = _demoMode.allSteps[_demoMode.demoStep];
  _demoFillCell(step.row, step.col, step.num);
  _demoMode.demoStep++;
  
  // 选中刚填的格子
  gameBoard.selectCell(step.row, step.col);
  
  refreshBoard();
  if (typeof updateLedgerPanel === 'function') updateLedgerPanel();
  
  // 更新进度
  const infoEl = document.getElementById('demo-step-info');
  if (infoEl) infoEl.textContent = `第 ${_demoMode.demoStep} / ${_demoMode.allSteps.length} 步`;
  _updateDemoTechInfo();
  
  // 如果是45法则的步骤，高亮提示
  if (step.technique === 'rule45') {
    showToast('🎯 这一步用了45法则！看账本面板的绿色格子', 3000);
  }
}

/**
 * 演示：自动播放
 */
function demoAutoPlay() {
  if (!_demoMode.active) return;
  
  if (_demoMode.playing) {
    // 暂停
    _demoMode.playing = false;
    if (_demoMode.autoTimer) {
      clearInterval(_demoMode.autoTimer);
      _demoMode.autoTimer = null;
    }
    const btns = document.querySelectorAll('.demo-btn');
    btns.forEach(b => { if (b.textContent.includes('自动')) b.textContent = '⏩ 自动'; });
    return;
  }
  
  // 开始自动播放
  _demoMode.playing = true;
  const btns = document.querySelectorAll('.demo-btn');
  btns.forEach(b => { if (b.textContent.includes('自动')) b.textContent = '⏸ 暂停'; });
  
  _demoMode.autoTimer = setInterval(() => {
    if (_demoMode.demoStep >= _demoMode.allSteps.length) {
      _demoMode.playing = false;
      clearInterval(_demoMode.autoTimer);
      _demoMode.autoTimer = null;
      btns.forEach(b => { if (b.textContent.includes('暂停')) b.textContent = '⏩ 自动'; });
      showToast('🎉 演示完成！', 2000);
      return;
    }
    demoNextStep();
  }, 800);
}

/**
 * 演示：跳到下一个45法则的步骤
 */
function demoSkipToRule45() {
  if (!_demoMode.active) return;
  
  // 找到下一个45法则步骤
  let targetStep = -1;
  for (let i = _demoMode.demoStep; i < _demoMode.allSteps.length; i++) {
    if (_demoMode.allSteps[i].technique === 'rule45') {
      targetStep = i;
      break;
    }
  }
  
  if (targetStep < 0) {
    showToast('后面没有45法则的步骤了', 2000);
    return;
  }
  
  // 快速填到目标步骤
  while (_demoMode.demoStep <= targetStep) {
    const step = _demoMode.allSteps[_demoMode.demoStep];
    _demoFillCell(step.row, step.col, step.num);
    _demoMode.demoStep++;
  }
  
  // 选中最后一步（45法则）的格子
  const lastStep = _demoMode.allSteps[targetStep];
  gameBoard.selectCell(lastStep.row, lastStep.col);
  
  refreshBoard();
  if (typeof updateLedgerPanel === 'function') updateLedgerPanel();
  
  const infoEl = document.getElementById('demo-step-info');
  if (infoEl) infoEl.textContent = `第 ${_demoMode.demoStep} / ${_demoMode.allSteps.length} 步`;
  _updateDemoTechInfo();
  
  showToast('🎯 已跳到45法则步骤！注意看绿色边框的异数格', 3000);
}

/**
 * 退出演示模式
 */
function exitDemoMode() {
  _demoMode.active = false;
  _demoMode.solver = null;
  _demoMode.allSteps = [];
  _demoMode.demoStep = 0;
  _demoMode.playing = false;
  
  if (_demoMode.autoTimer) {
    clearInterval(_demoMode.autoTimer);
    _demoMode.autoTimer = null;
  }
  
  // 移除控制条
  const ctrl = document.getElementById('demo-controls');
  if (ctrl) ctrl.style.display = 'none';
  
  // 恢复按钮
  const btn = document.getElementById('btn-demo');
  if (btn) {
    btn.textContent = '🎯 45演示';
    btn.style.background = '';
    btn.style.color = '';
    btn.style.fontWeight = '';
  }
  
  // 重置盘面：清空所有非固定数字
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!gameBoard.cells[r][c].fixedNum) {
        gameBoard.cells[r][c].fillNum = null;
        gameBoard.cells[r][c].candidates = new Set([1,2,3,4,5,6,7,8,9]);
        gameBoard.cells[r][c].isError = false;
      }
    }
  }
  gameBoard.history = [];
  
  // 重新应用基本约束
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (gameBoard.cells[r][c].fixedNum) {
        const v = gameBoard.cells[r][c].fixedNum;
        // 清除同行列宫候选
        for (let i = 0; i < 9; i++) {
          gameBoard.cells[r][i].candidates.delete(v);
          gameBoard.cells[i][c].candidates.delete(v);
        }
        const boxR = Math.floor(r / 3) * 3, boxC = Math.floor(c / 3) * 3;
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            gameBoard.cells[boxR + dr][boxC + dc].candidates.delete(v);
          }
        }
      }
    }
  }
  
  gameBoard.clearBoxSelection();
  refreshBoard();
  if (typeof updateLedgerPanel === 'function') updateLedgerPanel();
  
  showToast('已退出演示模式', 1500);
}


// ============================================================
//  推理与提示联动系统 (RAHS) - 辅助函数
// ============================================================

/**
 * 获取当前章节ID（从URL参数或关卡ID推断）
 */
function _getChapterId() {
  const params = new URLSearchParams(window.location.search);
  const ch = params.get('chapter');
  if (ch) return ch;
  // 从关卡ID推断（1xx=第1章，2xx=第2章...）
  if (currentLevelId >= 700) return '7';
  if (currentLevelId >= 600) return '6';
  if (currentLevelId >= 500) return '5';
  if (currentLevelId >= 400) return '4';
  if (currentLevelId >= 300) return '3';
  if (currentLevelId >= 200) return '2';
  if (currentLevelId >= 100) return '1';
  return 'free';
}

/**
 * 更新 RAHS 的目标格（影响力最高的格子）
 * 调用 TechRaterSolverV2 计算下一步最优提示
 */
function _updateRahsTarget() {
  if (typeof ReasoningAndHintSystem === 'undefined') return;
  if (typeof TechRaterSolverV2 === 'undefined') return;

  try {
    const step = TechRaterSolverV2.findNextStep(gameBoard);
    if (step && step.row !== undefined) {
      ReasoningAndHintSystem.setCurrentTarget({
        row: step.row,
        col: step.col,
        value: step.num,
        technique: step.technique || 'unknown',
      });
    }
  } catch (e) {
    // 静默失败，不影响游戏
  }
}

/**
 * 显示角色提示气泡
 * @param {Object} result - HintDispatchResult
 */
function _showCharacterHint(result) {
  if (!result || !result.shouldTrigger) return;

  const character = result.character;
  const dialogue = result.dialogue;
  const target = result.target;
  const hintType = dialogue.type || 'direction';

  if (!character || !dialogue) return;

  // 有目标格且是答案/策略类型的提示，显示带"查看详情"按钮的气泡
  const canShowDetail = target && target.row !== undefined && 
    (hintType === 'answer' || hintType === 'strategy' || hintType === 'direction');

  // 优先用 StoryEngine 的环境台词（立绘+打字机效果）
  if (typeof StoryEngine !== 'undefined' && typeof StoryEngine.sayAmbient === 'function') {
    const charMap = {
      ray: 'ray',
      keeper: 'cagekeeper',
      plotter: 'plotter',
    };
    const charId = charMap[character] || character;
    const emotion = _getEmotionForType(dialogue.type);
    const text = dialogue.text;

    try {
      StoryEngine.sayAmbient(charId, emotion, text);
      // StoryEngine 模式下也追加一个详情按钮
      if (canShowDetail) {
        setTimeout(function() { _addDetailButtonToStory(character); }, 2000);
      }
    } catch (e) {
      // 降级到自定义气泡
      _showHintBubbleWithDetail(character, dialogue.text, canShowDetail);
    }
  } else {
    // 用自定义气泡（带详情按钮）
    _showHintBubbleWithDetail(character, dialogue.text, canShowDetail);
  }

  // 高亮目标格
  if (target && target.row !== undefined && target.col !== undefined) {
    _highlightHintTarget(target.row, target.col);
  }
}

/**
 * 显示带"查看详情"按钮的角色提示气泡
 */
function _showHintBubbleWithDetail(character, text, showDetailButton) {
  const speakerMap = {
    ray: { name: '阿岩', color: 'linear-gradient(135deg,#22c55e,#15803d)', emoji: '🍃' },
    keeper: { name: '守笼人', color: 'linear-gradient(135deg,#6366f1,#4f46e5)', emoji: '🧙' },
    plotter: { name: '设局人', color: 'linear-gradient(135deg,#dc2626,#991b1b)', emoji: '🎭' },
  };
  const info = speakerMap[character] || speakerMap.keeper;
  const isMobile = window.innerWidth < 640 || ('ontouchstart' in window && window.innerWidth < 768);

  // 确保气泡容器存在
  let container = document.getElementById('rah-bubble-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'rah-bubble-container';
    container.style.cssText = [
      'position:fixed', 'top:70px', 'right:12px', 'z-index:1000',
      'display:flex', 'flex-direction:column', 'gap:8px',
      'max-width:' + (isMobile ? '280px' : '340px'),
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(container);
  }

  const bubble = document.createElement('div');
  bubble.style.cssText = [
    'background:' + info.color,
    'color:#fff',
    'padding:' + (isMobile ? '10px 12px' : '12px 16px'),
    'border-radius:16px',
    'font-size:' + (isMobile ? '13px' : '14px'),
    'line-height:1.5',
    'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
    'animation:comedyBubbleIn 0.4s ease-out',
    'position:relative', 'pointer-events:auto',
    'max-width:100%', 'word-break:break-word'
  ].join(';');

  var detailBtnHtml = showDetailButton
    ? '<div class="rah-detail-btn" style="margin-top:8px;display:inline-block;padding:4px 12px;background:rgba(255,255,255,0.2);border-radius:12px;font-size:12px;cursor:pointer;">🔍 查看详细推理</div>'
    : '';

  bubble.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:10px;">' +
      '<span style="font-size:28px;flex-shrink:0;line-height:1;">' + info.emoji + '</span>' +
      '<div style="flex:1;">' +
        '<div style="font-weight:bold;font-size:12px;opacity:0.85;margin-bottom:3px;">' + info.name + '</div>' +
        '<div class="rah-bubble-text"></div>' +
        detailBtnHtml +
      '</div>' +
    '</div>';

  // 打字机效果
  const textDiv = bubble.querySelector('.rah-bubble-text');
  let idx = 0;
  let typed = false;
  let typeTimer = null;
  const typeSpeed = 35;

  function typeChar() {
    if (idx >= text.length) {
      typed = true;
      typeTimer = null;
      return;
    }
    textDiv.textContent += text[idx];
    idx++;
    typeTimer = setTimeout(typeChar, typeSpeed);
  }
  typeChar();

  // 点击立即完成/关闭
  bubble.addEventListener('click', function(e) {
    if (e.target.classList.contains('rah-detail-btn')) return;
    if (!typed) {
      if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
      textDiv.textContent = text;
      typed = true;
      return;
    }
    _removeRahBubble(bubble);
  });

  // 详情按钮
  const detailBtn = bubble.querySelector('.rah-detail-btn');
  if (detailBtn) {
    detailBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      _removeRahBubble(bubble);
      // 触发三步剧本提示
      if (typeof handleHint === 'function') {
        handleHint();
      }
    });
  }

  container.appendChild(bubble);

  // 最多同时2个
  while (container.children.length > 2) {
    _removeRahBubble(container.firstChild);
  }

  // 自动消失
  const duration = Math.min(8000, 3000 + text.length * 50);
  setTimeout(function() { _removeRahBubble(bubble); }, duration);
}

/**
 * 移除 RAHS 气泡
 */
function _removeRahBubble(bubble) {
  if (!bubble || !bubble.parentNode) return;
  bubble.style.animation = 'comedyBubbleIn 0.3s ease-out reverse';
  setTimeout(function() {
    if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
  }, 300);
}

/**
 * 给 StoryEngine 模式添加详情按钮（简化版）
 */
function _addDetailButtonToStory(character) {
  // 简单处理：在右下角加一个浮动的"查看详情"按钮
  let btn = document.getElementById('rah-story-detail-btn');
  if (btn) return;
  
  btn = document.createElement('div');
  btn.id = 'rah-story-detail-btn';
  btn.textContent = '🔍 查看详细推理';
  btn.style.cssText = [
    'position:fixed', 'bottom:100px', 'right:16px', 'z-index:999',
    'padding:8px 16px', 'background:rgba(99,102,241,0.9)', 'color:#fff',
    'border-radius:20px', 'font-size:13px', 'cursor:pointer',
    'box-shadow:0 2px 12px rgba(0,0,0,0.3)',
    'animation:comedyBubbleIn 0.4s ease-out'
  ].join(';');
  
  btn.addEventListener('click', function() {
    document.body.removeChild(btn);
    if (typeof handleHint === 'function') {
      handleHint();
    }
  });
  
  document.body.appendChild(btn);
  
  // 5秒后自动消失
  setTimeout(function() {
    if (btn.parentNode) {
      btn.style.animation = 'comedyBubbleIn 0.3s ease-out reverse';
      setTimeout(function() { btn.parentNode && btn.parentNode.removeChild(btn); }, 300);
    }
  }, 5000);
}

/**
 * 根据台词类型获取表情
 */
function _getEmotionForType(type) {
  switch (type) {
    case 'eureka': return 'happy';
    case 'tease': return 'smirk';
    case 'answer': return 'default';
    case 'error': return 'surprised';
    case 'direction': return 'default';
    case 'strategy': return 'think';
    case 'note_guide': return 'default';
    default: return 'default';
  }
}

/**
 * 显示轻量气泡（降级方案）
 */
function _showLightweightBubble(character, text) {
  const speakerMap = {
    ray: { name: '阿岩', color: 'linear-gradient(135deg,#22c55e,#15803d)', emoji: '🍃' },
    keeper: { name: '守笼人', color: 'linear-gradient(135deg,#6366f1,#4f46e5)', emoji: '🧙' },
    plotter: { name: '设局人', color: 'linear-gradient(135deg,#dc2626,#991b1b)', emoji: '🎭' },
  };
  const info = speakerMap[character] || speakerMap.keeper;
  if (typeof ComedySystem !== 'undefined' && typeof ComedySystem._showBubble === 'function') {
    ComedySystem._showBubble(info.name, text, info.color, info.emoji, 'default');
  } else {
    showToast(info.name + '：' + text, 4000);
  }
}

/**
 * 高亮提示目标格
 */
function _highlightHintTarget(row, col) {
  if (!gameBoard || !gameBoard.cells) return;
  try {
    gameBoard.clearHints();
    const cell = gameBoard.cells[row][col];
    if (cell) {
      cell.isHintTarget = true;
    }
    if (typeof renderer !== 'undefined') {
      renderer.render(gameBoard);
    }
    // 3秒后清除高亮
    setTimeout(() => {
      if (cell) cell.isHintTarget = false;
      if (typeof renderer !== 'undefined') {
        renderer.render(gameBoard);
      }
    }, 3000);
  } catch (e) {
    // 静默失败
  }
}



// ==========================================
// 笔记回放面板 UI
// ==========================================

/**
 * 切换笔记回放面板显示
 */
function _togglePlaybackPanel() {
  let panel = document.getElementById('playback-panel');
  if (panel) {
    _closePlaybackPanel();
  } else {
    _openPlaybackPanel();
  }
}

/**
 * 打开笔记回放面板
 */
function _openPlaybackPanel() {
  if (document.getElementById('playback-panel')) return;
  
  var isMobile = window.innerWidth < 640 || ('ontouchstart' in window && window.innerWidth < 768);
  
  var panel = document.createElement('div');
  panel.id = 'playback-panel';
  panel.style.cssText = [
    'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
    'z-index:2000',
    'width:' + (isMobile ? '90vw' : '480px'),
    'max-height:80vh', 'overflow-y:auto',
    'background:#fff', 'border-radius:16px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.3)',
    'padding:20px'
  ].join(';');
  
  // 获取回放数据
  var recording = null;
  var stats = null;
  if (typeof NotePlayback !== 'undefined') {
    recording = NotePlayback.getRecording();
    stats = NotePlayback.getStats();
  }
  
  var noteCount = stats ? stats.totalNotes : 0;
  var fillCount = stats ? stats.totalFills : 0;
  var duration = stats ? Math.round(stats.duration / 1000) : 0;
  
  panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
      '<h3 style="margin:0;font-size:18px;color:#1e293b;">📝 笔记回放</h3>' +
      '<span id="playback-close" style="cursor:pointer;font-size:20px;color:#64748b;">✕</span>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">' +
      '<div style="text-align:center;padding:12px;background:#f1f5f9;border-radius:10px;">' +
        '<div style="font-size:24px;font-weight:bold;color:#3b82f6;">' + noteCount + '</div>' +
        '<div style="font-size:12px;color:#64748b;">笔记操作</div>' +
      '</div>' +
      '<div style="text-align:center;padding:12px;background:#f1f5f9;border-radius:10px;">' +
        '<div style="font-size:24px;font-weight:bold;color:#22c55e;">' + fillCount + '</div>' +
        '<div style="font-size:12px;color:#64748b;">填数操作</div>' +
      '</div>' +
      '<div style="text-align:center;padding:12px;background:#f1f5f9;border-radius:10px;">' +
        '<div style="font-size:24px;font-weight:bold;color:#f59e0b;">' + duration + 's</div>' +
        '<div style="font-size:12px;color:#64748b;">用时</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:16px;">' +
      '<button id="playback-start-btn" style="flex:1;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">▶ 开始回放</button>' +
      '<button id="playback-stop-btn" style="flex:1;padding:10px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;display:none;">⏹ 停止回放</button>' +
    '</div>' +
    '<div id="playback-status" style="text-align:center;font-size:13px;color:#64748b;margin-bottom:12px;">' +
      (noteCount > 0 ? '点击开始回放你的笔记轨迹' : '暂无笔记记录') +
    '</div>' +
    '<div id="playback-progress" style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;display:none;">' +
      '<div id="playback-progress-bar" style="height:100%;background:#3b82f6;width:0%;transition:width 0.1s;"></div>' +
    '</div>';
  
  document.body.appendChild(panel);
  
  // 关闭按钮
  panel.querySelector('#playback-close').addEventListener('click', _closePlaybackPanel);
  
  // 开始回放按钮
  var startBtn = panel.querySelector('#playback-start-btn');
  var stopBtn = panel.querySelector('#playback-stop-btn');
  var statusEl = panel.querySelector('#playback-status');
  var progressEl = panel.querySelector('#playback-progress');
  var progressBar = panel.querySelector('#playback-progress-bar');
  
  if (startBtn && typeof NotePlayback !== 'undefined') {
    startBtn.addEventListener('click', function() {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      progressEl.style.display = 'block';
      
      NotePlayback.startPlayback({
        onEvent: function(evt, idx, total) {
          statusEl.textContent = '回放中... (' + (idx + 1) + '/' + total + ')';
          progressBar.style.width = ((idx + 1) / total * 100) + '%';
          if (gameBoard && evt.row !== undefined) {
            gameBoard.selectCell(evt.row, evt.col);
            refreshBoard();
          }
        },
        onComplete: function() {
          statusEl.textContent = '✓ 回放完成';
          startBtn.style.display = 'block';
          stopBtn.style.display = 'none';
        },
        speed: 2
      });
    });
  }
  
  if (stopBtn) {
    stopBtn.addEventListener('click', function() {
      if (typeof NotePlayback !== 'undefined') {
        NotePlayback.stopPlayback();
      }
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      statusEl.textContent = '已停止回放';
    });
  }
  
  // 点击遮罩关闭
  var mask = document.createElement('div');
  mask.id = 'playback-mask';
  mask.style.cssText = [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.5)',
    'z-index:1999'
  ].join(';');
  mask.addEventListener('click', _closePlaybackPanel);
  document.body.appendChild(mask);
}

/**
 * 关闭笔记回放面板
 */
function _closePlaybackPanel() {
  var panel = document.getElementById('playback-panel');
  var mask = document.getElementById('playback-mask');
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
  if (typeof NotePlayback !== 'undefined') {
    NotePlayback.stopPlayback();
  }
}
