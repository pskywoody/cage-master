// ==========================================
// 教学模式游戏入口 + 交互绑定
// ==========================================

// 当前关卡信息
let currentLevelId = null;
let currentLevelData = null;
let currentGridSize = 9;
let currentChapterId = 1;

// 游戏状态
let guideBoard = null;
let guideRenderer = null;
let timerInterval = null;
let elapsedSeconds = 0;
let isPaused = false;
let isCompleted = false;

// 功能配置
let features = {
  allowDraft: true,
  assistant45: true,
  showHints: true,
  perspectiveMode: false
};

// 45法则计算器状态
let rule45MustNums = new Set();
let rule45ExcludeNums = new Set();
let rule45Initialized = false;

// 连填模式状态
let quickFillMode = false;
let quickFillNum = null;

// 提示相关
let hintStep = 0;
let currentHint = null;

// 引导管理器
let guideManager = null;
// 上次检测是否有冲突（用于onConflict去重）
let lastHadConflict = false;

// 剧情管理器
let storyManager = null;
// 当前章节数据（含剧情、徽章等）
let currentChapterData = null;
// 是否强制播放剧情（URL参数 story=1）
let forcePlayStory = false;

window.onload = function() {
  console.log('📚 教学模式启动中...');

  // 1. 从 URL 读取关卡 ID
  const params = new URLSearchParams(window.location.search);
  const levelIdParam = params.get('levelId');
  if (levelIdParam) {
    currentLevelId = levelIdParam;
  }

  // 1.5 检查是否强制播放剧情（测试用）
  forcePlayStory = params.get('story') === '1';

  // 2. 加载关卡数据
  loadTeachingLevel(currentLevelId).then(levelData => {
    if (!levelData) {
      alert('关卡加载失败，请返回重试');
      return;
    }

    currentLevelData = levelData;
    currentGridSize = levelData.gridSize || levelData.size || 9;

    // 提取章节ID（假设 levelId 格式为 101, 201, 301...）
    currentChapterId = Math.floor(parseInt(currentLevelId) / 100);

    // 3. 初始化棋盘（根据 gridSize）
    guideBoard = new Board(currentGridSize);
    window.guideBoard = guideBoard;

    // 4. 初始化渲染器
    guideRenderer = new Renderer('gameCanvas');
    window.guideRenderer = guideRenderer;

    // 5. 先加载用户设置（作为默认值）
    loadSettings();

    // 6. 加载关卡配置
    features = {
      allowDraft: levelData.features?.allowDraft !== false,
      assistant45: levelData.features?.assistant45 !== false,
      showHints: levelData.features?.showHints !== false,
      perspectiveMode: levelData.features?.perspectiveMode === true
    };

    // 6.5 教学关卡的高亮约束（由关卡配置决定，覆盖用户设置，用于递进式教学）
    if (levelData.features?.highlightRow !== undefined) {
      guideBoard.highlightSettings.sameRow = levelData.features.highlightRow;
    }
    if (levelData.features?.highlightCol !== undefined) {
      guideBoard.highlightSettings.sameCol = levelData.features.highlightCol;
    }
    if (levelData.features?.highlightBox !== undefined) {
      guideBoard.highlightSettings.sameBox = levelData.features.highlightBox;
    }
    if (levelData.features?.highlightNumber !== undefined) {
      guideBoard.highlightSettings.sameNumber = levelData.features.highlightNumber;
    }
    if (levelData.features?.highlightCage !== undefined) {
      guideBoard.highlightSettings.sameCage = levelData.features.highlightCage;
    }

    // 7. 应用功能配置到UI
    applyFeatureConfig();

    // 7. 设置关卡标题
    const titleEl = document.getElementById('level-title');
    if (titleEl) {
      titleEl.textContent = levelData.name || levelData.title || `教学关卡 ${currentLevelId}`;
    }
    const goalEl = document.getElementById('level-goal');
    if (goalEl && levelData.teachingGoal) {
      goalEl.textContent = '🎯 ' + levelData.teachingGoal;
    }

    // 8. 加载关卡盘面数据
    const puzzle = extractPuzzleData(levelData);
    guideBoard.loadLevel(puzzle);

    // 10. 动态生成数字键盘
    generateNumPad(currentGridSize);
    setupQuickFillLongPress();

    // 11. 尝试读取本地存档
    loadSavedProgress(currentLevelId);

    // 12. 首次渲染
    guideRenderer.render(guideBoard);
    guideBoard.checkConflicts();
    guideRenderer.render(guideBoard);
    console.log(`✅ 教学关卡加载完成，尺寸: ${currentGridSize}x${currentGridSize}`);

    // 12.3 加载章节数据（含剧情）
    console.log('📖 开始加载章节数据...');
    loadChapterData(currentChapterId).then(chapter => {
      currentChapterData = chapter;
      console.log('📖 章节数据加载完成:', chapter ? chapter.title : 'null');

      // 12.5 初始化剧情管理器
      if (window.StoryManager) {
        storyManager = new StoryManager();
        window.storyManager = storyManager;
        console.log('📖 StoryManager 初始化完成');
      } else {
        console.warn('⚠️ StoryManager 未定义，跳过剧情系统');
      }

      // 12.7 检查是否需要播放章节开场剧情
      const shouldPlay = storyManager && currentChapterData &&
        (forcePlayStory || storyManager.shouldPlayIntro(currentChapterData, currentLevelId));
      if (shouldPlay) {
        console.log('📖 播放章节开场剧情');
        storyManager.playChapterIntro(currentChapterData, () => {
          // 章节开场播完，播放关卡前置对话
          playLevelPreDialog(() => {
            onPreDialogComplete();
          });
        });
      } else {
        console.log('📖 跳过开场剧情');
        // 播放关卡前置对话
        playLevelPreDialog(() => {
          onPreDialogComplete();
        });
      }
    }).catch(err => {
      console.error('❌ 加载章节数据失败:', err);
      initGuideManager(); // 失败也继续
    });

    // 13. 启动计时器
    startTimer();

    // 14. 绑定交互
    bindCanvasClick();
    bindNumPad();
    bindToolbar();
    bindKeyboard();
    bindTimerAndPause();
    bindCompleteOverlay();
    initSettingsBindings();

    // 页面离开时保存
    window.addEventListener('beforeunload', () => {
      if (!isCompleted) {
        saveProgress();
      }
    });
  });
};

// ---------- 加载章节数据（含剧情、徽章） ----------
async function loadChapterData(chapterId) {
  try {
    const res = await fetch('data/chapters.json');
    const chapters = await res.json();
    const chapter = chapters.find(c => String(c.chapterId) === String(chapterId));
    return chapter || null;
  } catch (e) {
    console.warn('加载章节数据失败：', e.message);
    return null;
  }
}

// ---------- 加载教学关卡 ----------
async function loadTeachingLevel(levelId) {
  // 优先从后端接口获取
  try {
    const res = await fetch('/api/teaching-level/' + levelId);
    const json = await res.json();
    if (json.code === 0 && json.data) {
      return json.data;
    }
    console.warn('⚠️ 教学关卡接口返回异常');
  } catch (e) {
    console.warn('⚠️ 网络异常，尝试本地数据：', e.message);
  }

  // 降级：从本地教学关卡数据文件加载
  const localData = await loadLocalTeachingLevel(levelId);
  if (localData) return localData;

  // 最终降级：生成一个简单的测试关卡
  console.warn('⚠️ 使用最终降级关卡');
  return getFallbackTeachingLevel(levelId);
}

// 从本地文件加载教学关卡
async function loadLocalTeachingLevel(levelId) {
  const numId = parseInt(levelId);
  const chapterId = Math.floor(numId / 100);

  // 尝试从 chapters.json 中找
  try {
    const res = await fetch('data/chapters.json');
    const chapters = await res.json();
    const chapter = chapters.find(c => c.chapterId === chapterId);
    if (chapter && chapter.levels) {
      const level = chapter.levels.find(l => String(l.levelId) === String(levelId));
      if (level && level.boardData && level.cages) {
        return {
          ...level,
          size: level.gridSize,
          cells: level.boardData,
          gridSize: level.gridSize
        };
      }
    }
  } catch (e) {
    console.warn('本地章节数据加载失败：', e.message);
  }

  // 尝试从教学关卡数据文件加载
  const dataFiles = [
    'data/teaching-levels-chapter1.json',
    'data/teaching-levels-ch2-3.json',
    'data/teaching-levels-ch4-6.json'
  ];

  for (const file of dataFiles) {
    try {
      const res = await fetch(file);
      const levels = await res.json();
      if (Array.isArray(levels)) {
        const level = levels.find(l => String(l.id) === String(levelId));
        if (level) {
          return {
            ...level,
            gridSize: level.size,
            title: level.title || `第${numId % 100}关`,
            teachingGoal: level.teachingGoal || '完成这道题',
            features: {
              allowDraft: true,
              assistant45: true,
              showHints: true
            }
          };
        }
      }
    } catch (e) {
      // 继续尝试下一个文件
    }
  }

  return null;
}

// 生成降级用的教学关卡（最后手段：当所有数据源都失败时使用）
function getFallbackTeachingLevel(levelId) {
  const numId = parseInt(levelId) || 101;
  const chapterId = Math.floor(numId / 100);
  const levelNum = numId % 100;

  // 根据章节和关卡号确定盘面大小（更精确的启发式）
  let size = 9;
  if (chapterId <= 1) {
    size = 4;
  } else if (chapterId === 2) {
    // 第2章：前3关6x6，后5关9x9
    size = levelNum <= 3 ? 6 : 9;
  } else {
    // 第3-6章全是9x9
    size = 9;
  }

  console.warn(`⚠️ 使用降级关卡 ${levelId}（${size}x${size}），所有数据源均加载失败`);

  // 生成一个简单的棋盘
  const cells = [];
  for (let r = 0; r < size; r++) {
    cells[r] = [];
    for (let c = 0; c < size; c++) {
      cells[r][c] = 0;
    }
  }

  // 生成简单的单格笼子（每个格子一个笼子，和值就是该位置的解）
  const cages = [];
  let cageId = 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // 用简单的规律生成和值（不是真正的解，只是用于测试）
      const sum = ((r + c) % size) + 1;
      cages.push({
        id: cageId++,
        sum: sum,
        cells: [[r, c]]
      });
    }
  }

  return {
    id: numId,
    levelId: numId,
    title: `第${levelNum}关：教学练习`,
    gridSize: size,
    size: size,
    difficulty: '入门',
    teachingGoal: `完成${size}x${size}教学练习（降级数据，请检查数据源）`,
    features: {
      allowDraft: levelNum > 2,
      assistant45: levelNum > 5,
      showHints: true
    },
    cells: cells,
    cages: cages
  };
}

// 从关卡数据中提取盘面数据
function extractPuzzleData(levelData) {
  // 兼容不同的数据格式
  const cells = levelData.cells || levelData.boardData || [];
  const cages = levelData.cages || [];
  return { cells, cages };
}

// ---------- 应用功能配置 ----------
function applyFeatureConfig() {
  // 候选数按钮
  const candidateBtn = document.getElementById('btn-candidate');
  if (candidateBtn) {
    candidateBtn.style.display = features.allowDraft ? '' : 'none';
  }

  // 45法则按钮
  const rule45Btn = document.getElementById('btn-45rule');
  if (rule45Btn) {
    rule45Btn.style.display = features.assistant45 ? '' : 'none';
  }

  // 提示按钮
  const hintBtn = document.getElementById('btn-hint');
  if (hintBtn) {
    hintBtn.style.display = features.showHints ? '' : 'none';
  }
}

// ---------- 动态生成数字键盘 ----------
function generateNumPad(size) {
  const numPad = document.getElementById('num-pad');
  if (!numPad) return;

  numPad.innerHTML = '';

  for (let i = 1; i <= size; i++) {
    const btn = document.createElement('button');
    btn.className = 'num-btn';
    btn.dataset.num = i;
    btn.textContent = i;
    numPad.appendChild(btn);
  }

  // 调整网格布局
  if (size <= 4) {
    numPad.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  } else if (size <= 6) {
    numPad.style.gridTemplateColumns = 'repeat(3, 1fr)';
  } else {
    // 9个数字用默认的3x3布局（移动端）
    numPad.style.gridTemplateColumns = '';
  }
}

// ---------- 读取本地存档 ----------
function loadSavedProgress(levelId) {
  if (typeof Storage === 'undefined') return;
  const save = Storage.loadTeachingProgress(levelId);
  if (!save) return;

  const size = currentGridSize;

  // 恢复填数
  if (save.fillNums) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const val = save.fillNums[r]?.[c];
        if (val && !guideBoard.cells[r][c].fixedNum) {
          guideBoard.cells[r][c].fillNum = val;
        }
      }
    }
  }

  // 恢复候选数
  if (save.candidates) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cands = save.candidates[r]?.[c] || [];
        cands.forEach(n => guideBoard.cells[r][c].candidates.add(n));
      }
    }
  }

  // 恢复用时
  if (save.time && !isNaN(save.time)) {
    elapsedSeconds = save.time;
    updateTimerDisplay();
  }

  console.log('📂 教学存档已读取，用时 ' + formatTime(elapsedSeconds));
}

// ---------- 保存本地存档 ----------
function saveProgress() {
  if (isCompleted) return;
  if (typeof Storage === 'undefined') return;

  const size = currentGridSize;
  const fillNums = [];
  const candidates = [];

  for (let r = 0; r < size; r++) {
    fillNums[r] = [];
    candidates[r] = [];
    for (let c = 0; c < size; c++) {
      const cell = guideBoard.cells[r][c];
      fillNums[r][c] = cell.fillNum || 0;
      candidates[r][c] = Array.from(cell.candidates);
    }
  }

  Storage.saveTeachingProgress(currentLevelId, {
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
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.addEventListener('click', togglePause);
  }

  // 暂停蒙层的继续按钮
  const resumeBtn = document.getElementById('btn-resume');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', togglePause);
  }

  // 返回关卡按钮
  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      saveProgress();
      // 返回到对应章节的关卡列表
      window.location.href = 'chapter-levels.html?id=' + currentChapterId;
    });
  }
}

// ---------- 统一的操作后刷新 ----------
function refreshBoard() {
  // 操作后清除提示状态
  if (hintStep > 0) {
    guideBoard.clearHints();
    hintStep = 0;
    currentHint = null;
  }

  // Boss战：同步擦除状态（玩家撤销/擦除了已填格子）
  if (typeof GuideBattle !== 'undefined' && GuideBattle.active && !GuideBattle.ended) {
    const solution = currentLevelData && currentLevelData.solution;
    if (solution) {
      for (let r = 0; r < GuideBattle.size; r++) {
        for (let c = 0; c < GuideBattle.size; c++) {
          if (GuideBattle.playerOwned[r][c] > 0) {
            const cell = guideBoard.cells[r][c];
            const stillCorrect = cell.fillNum && solution[r][c] === cell.fillNum;
            if (!stillCorrect) {
              GuideBattle.onPlayerErase(r, c);
            }
          }
        }
      }
    }
  }

  guideBoard.checkConflicts();

  // Boss战：在数字下层绘制玩家归属底色
  if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
    GuideBattle.renderPlayerOwned(guideRenderer.ctx, guideRenderer.cellSize, guideRenderer.padding);
  }

  guideRenderer.render(guideBoard);

  // Boss战：渲染迷雾+幽灵格+抢格子闪光（在棋盘之上绘制）
  if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
    GuideBattle.renderFogAndGhosts(guideRenderer.ctx, guideRenderer.cellSize, guideRenderer.padding);
  }

  checkAndNotifyConflict();
  saveProgress();
  updateNumberButtons();
  checkComplete();
}

// ---------- 检测冲突并通知引导系统 ----------
function checkAndNotifyConflict() {
  if (!guideManager) return;
  const size = currentGridSize;
  let hasConflict = false;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (guideBoard.cells[r][c].isError) {
        hasConflict = true;
        break;
      }
    }
    if (hasConflict) break;
  }

  // 只在从无冲突变成有冲突时触发
  if (hasConflict && !lastHadConflict) {
    console.log('⚠️ 检测到冲突，触发引导');
    guideManager.onConflict();
  }
  lastHadConflict = hasConflict;
}

// 更新底部数字按钮状态
function updateNumberButtons() {
  if (!guideBoard) return;

  const size = currentGridSize;
  const count = Array(size + 1).fill(0);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = guideBoard.cells[r][c].fixedNum || guideBoard.cells[r][c].fillNum;
      if (val) count[val]++;
    }
  }

  for (let n = 1; n <= size; n++) {
    const btn = document.querySelector('.num-btn[data-num="' + n + '"]');
    if (!btn) continue;
    if (count[n] >= size) {
      btn.classList.add('completed');
    } else {
      btn.classList.remove('completed');
    }
  }
}

// ---------- 检查是否通关 ----------
function checkComplete() {
  if (isCompleted) return;

  // Boss战进行中或刚结束（结果弹窗显示中）时，不自动触发通关
  // 由Boss战系统的"继续"按钮触发通关流程
  if (typeof GuideBattle !== 'undefined' && (GuideBattle.active || GuideBattle.ended)) {
    return;
  }

  const size = currentGridSize;
  let allFilled = true;
  let hasError = false;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = guideBoard.cells[r][c];
      if (!cell.fixedNum && !cell.fillNum) {
        allFilled = false;
      }
      if (cell.isError) {
        hasError = true;
      }
    }
  }

  if (allFilled && !hasError) {
    // 教学关卡前端直判通关（4x4/6x6 无需后端校验）
    console.log('🎉 检测到通关！');
    markComplete();
  }
}

// ---------- 关卡剧情对话系统 ----------

/**
 * 将用户剧情格式（{speaker, text}）转换为 StoryModal 格式（{character, avatar, color, text}）
 * 支持两种格式混用
 */
function normalizeDialogues(dialogues) {
  if (!dialogues || !Array.isArray(dialogues)) return [];
  const chars = window.CHARACTERS || {};
  return dialogues.map(d => {
    if (!d || typeof d !== 'object') return d;
    // 如果是标题卡，直接返回
    if (d.type === 'title') return d;
    // 已经是标准格式（有character/avatar/color），直接返回
    if (d.character || d.avatar || d.color) return d;
    // 用户格式：{speaker, text} -> 映射到角色预设
    const speaker = d.speaker || '';
    let preset = null;
    if (speaker === '守笼人') preset = chars.keeper;
    else if (speaker === '阿岩') preset = chars.ayan;
    else if (speaker === '设局人') preset = chars.setter;
    else if (speaker === '旁白') preset = chars.narrator;
    if (preset) {
      return { ...preset, text: d.text || '' };
    }
    // 未知角色，用emoji作为fallback
    return {
      character: speaker,
      icon: '👤',
      color: '#64748b',
      text: d.text || ''
    };
  });
}

/**
 * preDialog播放完成后的处理：检查是否为Boss关卡，是则启动Boss战
 */
function onPreDialogComplete() {
  // 检查是否为Boss关卡
  const bossConfig = (typeof BOSS_CONFIGS !== 'undefined') ? BOSS_CONFIGS[currentLevelId] : null;
  if (bossConfig) {
    startBossBattle(bossConfig);
  } else {
    initGuideManager();
  }
}

/**
 * 启动Boss战
 */
function startBossBattle(bossConfig) {
  if (!storyManager || !storyManager.modal) {
    // StoryModal不可用，直接开始
    _initBattleAndStart(bossConfig);
    return;
  }

  // 播放Boss战前对话
  const preBattleDialog = bossConfig.preDialog || [
    { speaker: bossConfig.name, text: '来吧，和我一决高下！' }
  ];

  storyManager.modal.play(preBattleDialog, () => {
    _initBattleAndStart(bossConfig);
  });
}

/**
 * 初始化并启动Boss战
 */
function _initBattleAndStart(bossConfig) {
  // 确保有正解数据
  if (!currentLevelData.solution) {
    console.warn('⚠️ Boss关卡缺少solution数据，跳过对战');
    initGuideManager();
    return;
  }

  // 标记Boss战激活
  document.body.classList.add('boss-battle-active');

  GuideBattle.start({
    solution: currentLevelData.solution,
    initialBoard: currentLevelData.cells || currentLevelData.boardData || currentLevelData.puzzle,
    size: currentGridSize,
    opponent: bossConfig,
    onEnd: (result) => {
      _onBossBattleEnd(result, bossConfig);
    },
    onEvent: (type, data) => {
      _handleBattleEvent(type, data, bossConfig);
    }
  });

  // 统计玩家已填入的正确数字（从存档恢复的情况）
  const solution = currentLevelData.solution;
  for (let r = 0; r < currentGridSize; r++) {
    for (let c = 0; c < currentGridSize; c++) {
      const cell = guideBoard.cells[r][c];
      if (!cell.fixedNum && cell.fillNum && solution[r] && solution[r][c] === cell.fillNum) {
        GuideBattle.playerOwned[r][c] = cell.fillNum;
        GuideBattle.playerCount++;
      }
    }
  }
  // 恢复后重新计算视野
  GuideBattle._updateVisibility();
  for (let r = 0; r < GuideBattle.size; r++) {
    for (let c = 0; c < GuideBattle.size; c++) {
      GuideBattle.fogOpacity[r][c] = GuideBattle.visible[r][c] ? 0 : 1;
    }
  }

  // Boss战期间不初始化GuideManager（引导弹窗会遮挡操作）
  // Boss战前对话已经替代了引导提示
  // initGuideManager();  // 跳过，Boss战结束后再处理

  // 更新UI显示初始进度
  if (GuideBattle._updateUI) GuideBattle._updateUI();

  // 显示"准备开始"提示
  _showBattleCountdown();
}

/**
 * 处理Boss战事件（遭遇、预警、抢格子等）
 */
function _handleBattleEvent(type, data, bossConfig) {
  switch (type) {
    case 'encounter':
      _showEncounterToast(data, bossConfig);
      _vibrate(data.level === 'strong' ? [80, 40, 80] : data.level === 'mid' ? [40] : [15]);
      break;
    case 'warning':
      if (data.who === 'ai') {
        const lines = bossConfig.warningLines || ['对手快赢了！'];
        const line = lines[Math.floor(Math.random() * lines.length)];
        _showBattleToast(line, 'strong', 2500);
        _vibrate([100, 50, 100, 50, 100]);
      } else {
        _showBattleToast('你快赢了，加油！', 'medium', 2000);
      }
      break;
    case 'steal':
      _showBattleToast('抢到一格！', 'light', 1000);
      _vibrate([30, 20, 30]);
      break;
    case 'wrong':
      _vibrate([50, 30, 50]);
      break;
  }
}

/**
 * 显示遭遇事件台词气泡
 */
function _showEncounterToast(data, bossConfig) {
  const lines = bossConfig.encounterLines;
  if (!lines || !lines[data.level]) return;

  const line = lines[data.level];
  const toast = document.createElement('div');
  toast.className = `battle-encounter-toast ${data.level}`;

  // 根据方向决定位置
  let topPos, vertClass;
  switch (data.direction) {
    case 'up':    topPos = '70px'; break;
    case 'down':  topPos = 'auto'; toast.style.bottom = '120px'; break;
    case 'left':  topPos = '50%'; toast.style.left = '20px'; toast.style.right = 'auto'; toast.style.transform = 'translateY(-50%)'; break;
    case 'right': topPos = '50%'; toast.style.right = '20px'; toast.style.left = 'auto'; toast.style.transform = 'translateY(-50%)'; break;
    default:      topPos = '100px';
  }
  if (topPos && data.direction !== 'down' && data.direction !== 'left' && data.direction !== 'right') {
    toast.style.top = topPos;
  }

  toast.textContent = line.text;
  document.body.appendChild(toast);

  // 动画显示
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // 自动消失
  const duration = data.level === 'strong' ? 2200 : data.level === 'mid' ? 1800 : 1400;
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * 显示通用战斗提示
 */
function _showBattleToast(text, intensity, duration) {
  const toast = document.createElement('div');
  toast.className = `battle-encounter-toast ${intensity || 'light'}`;
  toast.style.top = '50%';
  toast.style.left = '50%';
  toast.style.transform = 'translate(-50%, -50%) scale(0.9)';
  toast.textContent = text;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
    toast.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration || 1500);
}

/**
 * 设备震动（如果支持）
 */
function _vibrate(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

/**
 * 显示Boss战倒计时提示
 */
function _showBattleCountdown() {
  const overlay = document.createElement('div');
  overlay.id = 'boss-countdown-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:600;display:flex;align-items:center;justify-content:center;flex-direction:column;';
  overlay.innerHTML = `
    <div style="font-size:48px;margin-bottom:16px;" id="countdown-num">3</div>
    <div style="font-size:18px;color:#ccc;">准备好...</div>
  `;
  document.body.appendChild(overlay);

  let count = 3;
  const numEl = overlay.querySelector('#countdown-num');
  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
    } else if (count === 0) {
      numEl.textContent = '开始！';
      numEl.style.color = '#22c55e';
    } else {
      clearInterval(interval);
      overlay.style.transition = 'opacity 0.3s';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
      // 倒计时结束，正式开始比赛（AI开始填数）
      if (GuideBattle && GuideBattle.active) {
        GuideBattle.beginRace();
      }
    }
  }, 1000);
}

/**
 * Boss战结束处理
 */
function _onBossBattleEnd(result, bossConfig) {
  // 先停止Boss战，移除进度条等UI
  if (GuideBattle && GuideBattle.active) {
    GuideBattle.stop();
  }
  document.body.classList.remove('boss-battle-active');

  if (result === 'win') {
    // 胜利：播放胜利对话，然后进入正常通关流程
    const winDialog = bossConfig.winDialog || [
      { speaker: '阿岩', text: '赢了！' }
    ];
    if (storyManager && storyManager.modal) {
      storyManager.modal.play(winDialog, () => {
        // 继续到markComplete
        // 此时isCompleted检查会通过，因为玩家已经填满了
        markComplete();
      });
    } else {
      markComplete();
    }
  }
  // 败北：GuideBattle内部处理重试逻辑，不走到这里
}

/**
 * 播放关卡前置对话（preDialog）
 * 首次进入关卡时播放，重进不重复播（URL加?story=1可强制重播）
 */
function playLevelPreDialog(onComplete) {
  const preDialog = currentLevelData && (currentLevelData.preDialog || currentLevelData.preStory);
  if (!preDialog || !Array.isArray(preDialog) || preDialog.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  const preDialogKey = `killersudoku_level_dialog_pre_${currentLevelId}`;
  if (!forcePlayStory && localStorage.getItem(preDialogKey)) {
    if (onComplete) onComplete();
    return;
  }
  localStorage.setItem(preDialogKey, '1');
  const dialogues = normalizeDialogues(preDialog);
  if (storyManager && storyManager.modal) {
    storyManager.modal.play(dialogues, onComplete);
  } else {
    if (onComplete) onComplete();
  }
}

// ---------- 标记通关 ----------
function markComplete() {
  isCompleted = true;
  clearInterval(timerInterval);

  // 引导系统：通关触发
  guide_onLevelComplete();

  // 计算星星数（根据用时）
  const stars = calculateStars(elapsedSeconds, currentGridSize);

  // 保存通关记录
  if (typeof Storage !== 'undefined') {
    Storage.markTeachingComplete(currentLevelId, {
      time: elapsedSeconds,
      stars: stars
    });
    // 清除进度存档
    Storage.clearTeachingProgress(currentLevelId);

    // 更新章节进度
    updateChapterProgress();
  }

  // 显示通关弹窗
  const overlay = document.getElementById('complete-overlay');
  const timeEl = document.getElementById('complete-time');
  const starsEl = document.getElementById('complete-stars');

  if (timeEl) timeEl.textContent = '用时 ' + formatTime(elapsedSeconds);
  if (starsEl) starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);

  // 检查是否需要播放章末剧情
  const shouldPlayEnding = forcePlayStory || storyManager.shouldPlayEnding(currentChapterData, currentLevelId);

  // 检查是否有关卡通关对话
  const clearDialog = currentLevelData && (currentLevelData.clearDialog || currentLevelData.clearStory);
  const clearDialogKey = `killersudoku_level_dialog_clear_${currentLevelId}`;
  const shouldPlayClear = clearDialog && clearDialog.length > 0 &&
    (forcePlayStory || !localStorage.getItem(clearDialogKey));

  // 播放流程：关卡通关对话 → 章末剧情 → 通关弹窗
  const showOverlay = () => { if (overlay) overlay.classList.add('active'); };

  const playEndingThenOverlay = () => {
    if (storyManager && currentChapterData && shouldPlayEnding) {
      setTimeout(() => {
        if (overlay) overlay.classList.remove('active');
        storyManager.playChapterEnding(currentChapterData, showOverlay);
      }, 600);
    } else {
      showOverlay();
    }
  };

  const playClearThenEnding = () => {
    if (shouldPlayClear) {
      localStorage.setItem(clearDialogKey, '1');
      setTimeout(() => {
        if (overlay) overlay.classList.remove('active');
        const dialogues = normalizeDialogues(clearDialog);
        storyManager.modal.play(dialogues, playEndingThenOverlay);
      }, 600);
    } else {
      playEndingThenOverlay();
    }
  };

  if (shouldPlayClear || shouldPlayEnding) {
    if (overlay) overlay.classList.add('active');
    setTimeout(playClearThenEnding, 800);
  } else {
    showOverlay();
  }
}

// 计算星星数
function calculateStars(seconds, size) {
  // 基准时间：4x4=60秒，6x6=180秒，9x9=360秒
  const baseTime = size === 4 ? 60 : size === 6 ? 180 : 360;
  if (seconds <= baseTime) return 3;
  if (seconds <= baseTime * 2) return 2;
  return 1;
}

// 更新章节进度
function updateChapterProgress() {
  // 章节进度由 Storage 自动管理，这里触发一次保存
  // 实际的章节进度统计在 chapter-levels 页面计算
}

// 检查并解锁徽章
function checkAndUnlockBadge() {
  // 这里可以根据不同条件解锁徽章
  // 简化：通关第一章所有关卡后解锁对应徽章
}

// ---------- 通关弹窗按钮绑定 ----------
function bindCompleteOverlay() {
  const backBtn = document.getElementById('btn-complete-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'chapter-levels.html?id=' + currentChapterId;
    });
  }

  const nextBtn = document.getElementById('btn-complete-next');
  if (nextBtn) {
    // 检查下一关是否存在
    const nextId = parseInt(currentLevelId) + 1;
    const hasNextLevel = checkNextLevelExists(nextId);
    
    if (!hasNextLevel) {
      // 最后一关：改为"返回章节"
      nextBtn.textContent = '🏁 返回章节';
      nextBtn.addEventListener('click', () => {
        window.location.href = 'chapter-levels.html?id=' + currentChapterId;
      });
    } else {
      nextBtn.addEventListener('click', () => {
        window.location.href = 'guide.html?levelId=' + nextId;
      });
    }
  }
}

// 检查下一关是否存在
function checkNextLevelExists(levelId) {
  try {
    // 从当前章节数据中查找
    if (currentChapterData && currentChapterData.levels) {
      return currentChapterData.levels.some(l => String(l.levelId) === String(levelId));
    }
    // 降级：根据章节ID推算最大关卡数
    const chapterId = Math.floor(levelId / 100);
    const levelNum = levelId % 100;
    // 各章实际关卡数：第1章9关，第2章8关，第3章7关，第4-6章各6关
    const maxLevels = { 1: 9, 2: 8, 3: 7, 4: 6, 5: 6, 6: 6 };
    const max = maxLevels[chapterId] || 9;
    return levelNum >= 1 && levelNum <= max;
  } catch (e) {
    // 出错时保守处理
    return false;
  }
}

// ---------- 画布点击 ----------
function bindCanvasClick() {
  const canvas = guideRenderer.canvas;
  let isMouseDown = false;
  let mouseMoved = false;
  let mouseStartPos = null;

  canvas.addEventListener('mousedown', function(e) {
    if (isPaused) return;
    isMouseDown = true;
    mouseMoved = false;
    mouseStartPos = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mousemove', function(e) {
    if (isPaused || !isMouseDown) return;
    const dx = Math.abs(e.clientX - mouseStartPos.x);
    const dy = Math.abs(e.clientY - mouseStartPos.y);
    if (dx > 5 || dy > 5) {
      mouseMoved = true;
      if (!guideBoard.isBoxSelecting) {
        const { r, c } = getCellFromPos(mouseStartPos.x, mouseStartPos.y);
        guideBoard.startBoxSelect(r, c);
      }
      const { r, c } = getCellFromPos(e.clientX, e.clientY);
      guideBoard.updateBoxSelect(r, c);
      refreshBoard();
    }
  });

  canvas.addEventListener('mouseup', function(e) {
    if (isPaused) return;
    // 只在mousedown之后才处理mouseup（防止移动端touch事件后的合成mouse事件）
    if (!isMouseDown) {
      return;
    }
    isMouseDown = false;
    if (mouseMoved && guideBoard.isBoxSelecting) {
      guideBoard.endBoxSelect();
      mouseMoved = false;
      mouseStartPos = null;
      refreshBoard();
    } else {
      handleCanvasTap(e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('mouseleave', function(e) {
    if (isMouseDown && guideBoard.isBoxSelecting) {
      guideBoard.endBoxSelect();
      refreshBoard();
    }
    isMouseDown = false;
    mouseMoved = false;
    mouseStartPos = null;
  });

  // 触摸事件
  let touchStartPos = null;
  let touchBoxSelectTriggered = false;
  let longPressTimer = null;
  let longPressTriggered = false;
  let longPressStartPos = null;
  const LONG_PRESS_DURATION = 650; // 长按650ms触发（500ms太容易误触）

  canvas.addEventListener('touchstart', function(e) {
    if (isPaused) return;
    e.preventDefault();
    const touch = e.touches[0];
    longPressTriggered = false;
    longPressStartPos = { x: touch.clientX, y: touch.clientY };
    touchBoxSelectTriggered = false;
    touchStartPos = { x: touch.clientX, y: touch.clientY };

    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      handleLongPress(touch.clientX, touch.clientY);
    }, LONG_PRESS_DURATION);
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    if (isPaused) return;
    e.preventDefault();
    const touch = e.touches[0];

    if (longPressStartPos) {
      const dx = Math.abs(touch.clientX - longPressStartPos.x);
      const dy = Math.abs(touch.clientY - longPressStartPos.y);
      if (dx > 10 || dy > 10) {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    }

    if (touchStartPos && !longPressTriggered) {
      const dx = Math.abs(touch.clientX - touchStartPos.x);
      const dy = Math.abs(touch.clientY - touchStartPos.y);
      if (dx > 15 || dy > 15) {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (!guideBoard.isBoxSelecting && !touchBoxSelectTriggered) {
          touchBoxSelectTriggered = true;
          const { r, c } = getCellFromPos(touchStartPos.x, touchStartPos.y);
          guideBoard.startBoxSelect(r, c);
        }
        if (guideBoard.isBoxSelecting) {
          const { r, c } = getCellFromPos(touch.clientX, touch.clientY);
          guideBoard.updateBoxSelect(r, c);
          refreshBoard();
        }
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    if (isPaused) return;
    e.preventDefault();

    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (guideBoard.isBoxSelecting) {
      guideBoard.endBoxSelect();
      touchBoxSelectTriggered = false;
      touchStartPos = null;
      longPressTriggered = false;
      longPressStartPos = null;
      refreshBoard();
      return;
    }

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

function getCellFromPos(clientX, clientY) {
  const rect = guideRenderer.canvas.getBoundingClientRect();
  const size = guideBoard.size;
  const pad = guideRenderer.padding;
  
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

function handleCanvasTap(clientX, clientY) {
  const { r, c } = getCellFromPos(clientX, clientY);
  
  // 连填模式：点击空格直接填入选中的数字
  if (tryQuickFill(r, c)) {
    return;
  }
  
  guideBoard.selectCell(r, c);
  // 验证选中是否成功，使用getActiveCell()双重检查
  const active = guideBoard.getActiveCell();
  if (active) {
    guide_onCellSelect(active.r, active.c);
  }
  refreshBoard();
}

function handleLongPress(clientX, clientY) {
  if (!features.allowDraft) return;

  if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  // 使用和getCellFromPos一致的坐标计算
  const { r, c } = getCellFromPos(clientX, clientY);

  guideBoard.selectCell(r, c);

  const candidateBtn = document.getElementById('btn-candidate');
  if (guideBoard.inputMode !== 'candidate') {
    guideBoard.toggleInputMode();
    if (candidateBtn) {
      candidateBtn.style.backgroundColor = '#3b82f6';
      candidateBtn.style.color = 'white';
    }
  }

  refreshBoard();
}

// ---------- 数字键盘 ----------
function bindNumPad() {
  document.getElementById('num-pad').addEventListener('click', function(e) {
    const btn = e.target.closest('.num-btn');
    if (!btn) return;
    if (isPaused) return;
    if (btn.classList.contains('completed')) return;

    const num = parseInt(btn.dataset.num);
    
    // 长按触发连填后，跳过本次click（防止刚激活就被取消）
    if (_skipNextClick) {
      _skipNextClick = false;
      return;
    }
    
    // 连填模式激活时
    if (quickFillMode && quickFillNum) {
      // 如果已经选中了空白格子 → 直接填数（优先于切换连填）
      const activeCell = guideBoard.getActiveCell();
      if (activeCell) {
        const { r, c } = activeCell;
        const cell = guideBoard.cells[r][c];
        if (!cell.fixedNum && !cell.fillNum) {
          handleNumberInput(num);
          return;
        }
      }
      // 没有选中格子 → 切换连填数字
      if (num === quickFillNum) {
        // 点同一个数字 → 退出连填
        exitQuickFill();
      } else {
        // 点不同数字 → 切换到新数字
        selectQuickFillNum(num);
      }
      return;
    }
    
    handleNumberInput(num);
  });
}

// 全局：长按后跳过下一次click
let _skipNextClick = false;

function handleNumberInput(num) {
  // 多选时，批量切换候选数
  if (guideBoard.selectedCells.length > 1) {
    if (features.allowDraft) {
      guideBoard.toggleCandidateForSelection(num);
    }
  } else if (guideBoard.inputMode === 'candidate' && features.allowDraft) {
    // 候选模式：使用getActiveCell()可靠获取选中格
    const selectedCell = guideBoard.getActiveCell();
    if (!selectedCell) {
      // 候选模式下没有选中格子，提示用户并切回普通模式
      showGameToast('💡 先点一个空格，再填数字');
      guideBoard.inputMode = 'normal';
      const candidateBtn = document.getElementById('btn-candidate');
      if (candidateBtn) {
        candidateBtn.style.backgroundColor = '';
        candidateBtn.style.color = '';
      }
      guideBoard.checkConflicts();
      refreshBoard();
      return;
    }
    const { r, c } = selectedCell;
    guideBoard.toggleCandidate(num);
  } else {
    // 普通模式：使用getActiveCell()可靠获取选中格
    const selectedCell = guideBoard.getActiveCell();
    
    if (!selectedCell) {
      // 没有选中格子 → 自动开启连填模式
      if (guideBoard.inputMode !== 'candidate' && !isNumberComplete(num)) {
        selectQuickFillNum(num);
      }
      return;
    }
    const { r, c } = selectedCell;
    const oldVal = guideBoard.cells[r][c].fillNum;

    // 填数前：检查所在宫/行/列是否只剩1个空格（当前格子算空的）
    const beforeState = {
      boxEmpty: countEmptyInBox(r, c),
      rowEmpty: countEmptyInRow(r),
      colEmpty: countEmptyInCol(c)
    };

    guideBoard.setNumber(num);
    const newVal = guideBoard.cells[r][c].fillNum;
    // 只有真正填入了新数字才触发
    if (newVal && newVal !== oldVal) {
      guide_onNumberFilled(r, c, newVal);

      // Boss战：追踪玩家填数进度
      if (typeof GuideBattle !== 'undefined' && GuideBattle.active && !GuideBattle.ended) {
        const solution = currentLevelData && currentLevelData.solution;
        const isCorrect = solution && solution[r] && solution[r][c] === newVal;
        GuideBattle.onPlayerFill(r, c, newVal, !!isCorrect);
      }

      // 检查"最后一格"引导
      checkLastCellGuidance(r, c, newVal, beforeState);
    }
  }
  guideBoard.checkConflicts();
  refreshBoard();
}

// ---------- 计算某行空格数 ----------
function countEmptyInRow(r) {
  if (!guideBoard) return 0;
  const size = currentGridSize;
  let count = 0;
  for (let c = 0; c < size; c++) {
    const cell = guideBoard.cells[r][c];
    if (!cell.fixedNum && !cell.fillNum) count++;
  }
  return count;
}

// ---------- 计算某列空格数 ----------
function countEmptyInCol(c) {
  if (!guideBoard) return 0;
  const size = currentGridSize;
  let count = 0;
  for (let r = 0; r < size; r++) {
    const cell = guideBoard.cells[r][c];
    if (!cell.fixedNum && !cell.fillNum) count++;
  }
  return count;
}

// ---------- 计算某宫空格数 ----------
function countEmptyInBox(r, c) {
  if (!guideBoard) return 0;
  const size = currentGridSize;
  // 计算宫尺寸
  const boxRows = size <= 4 ? 2 : 3;
  const boxCols = size <= 6 ? (size === 4 ? 2 : 3) : 3;
  const boxR = Math.floor(r / boxRows) * boxRows;
  const boxC = Math.floor(c / boxCols) * boxCols;

  let count = 0;
  for (let i = 0; i < boxRows; i++) {
    for (let j = 0; j < boxCols; j++) {
      const rr = boxR + i;
      const cc = boxC + j;
      if (rr >= size || cc >= size) continue;
      const cell = guideBoard.cells[rr][cc];
      if (!cell.fixedNum && !cell.fillNum) count++;
    }
  }
  return count;
}

// ---------- 检查最后一格引导 ----------
function checkLastCellGuidance(r, c, num, beforeState) {
  if (!guideManager) return;

  // 判断填的数字是否正确（和答案对比）
  const solution = currentLevelData && currentLevelData.solution;
  const isCorrect = solution && solution[r] && solution[r][c] === num;

  console.log(`🔍 checkLastCellGuidance: ${r},${c}=${num} 正确=${isCorrect} 宫空格=${beforeState.boxEmpty} 行空格=${beforeState.rowEmpty} 列空格=${beforeState.colEmpty}`);

  // 宫格只剩1格时（填数前空格数为1，说明这是最后一个空格）
  if (beforeState.boxEmpty === 1) {
    console.log(`📦 宫格最后一格填数: ${r},${c}=${num} 正确=${isCorrect}`);
    guideManager.onBoxLastCellFill(r, c, num, isCorrect);
  }

  // 行只剩1格时
  if (beforeState.rowEmpty === 1) {
    console.log(`➡️ 行最后一格填数: ${r},${c}=${num} 正确=${isCorrect}`);
    guideManager.onRowLastCellFill(r, c, num, isCorrect);
  }

  // 列只剩1格时
  if (beforeState.colEmpty === 1) {
    console.log(`⬇️ 列最后一格填数: ${r},${c}=${num} 正确=${isCorrect}`);
    guideManager.onColLastCellFill(r, c, num, isCorrect);
  }
}

// ---------- 工具栏按钮 ----------
function bindToolbar() {
  // 撤销
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      if (isPaused) return;
      guideBoard.undo();
      refreshBoard();
    });
  }

  // 擦除
  const eraseBtn = document.getElementById('btn-erase');
  if (eraseBtn) {
    eraseBtn.addEventListener('click', () => {
      if (isPaused) return;
      if (guideBoard.selectedCells.length > 1) {
        guideBoard.eraseSelection();
      } else if (guideBoard.selectedCell) {
        guideBoard.eraseNumber();
      }
      guideBoard.checkConflicts();
      refreshBoard();
    });
  }

  // 候选模式切换
  const candidateBtn = document.getElementById('btn-candidate');
  if (candidateBtn) {
    candidateBtn.addEventListener('click', () => {
      if (isPaused) return;
      if (!features.allowDraft) return;
      const mode = guideBoard.toggleInputMode();
      if (mode === 'candidate') {
        candidateBtn.style.backgroundColor = '#3b82f6';
        candidateBtn.style.color = 'white';
      } else {
        candidateBtn.style.backgroundColor = '';
        candidateBtn.style.color = '';
      }
    });
  }

  // 提示
  const hintBtn = document.getElementById('btn-hint');
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      if (isPaused) return;
      if (!features.showHints) return;
      handleHint();
    });
  }

  // 45法则
  const rule45Btn = document.getElementById('btn-45rule');
  if (rule45Btn) {
    rule45Btn.addEventListener('click', () => {
      if (isPaused) return;
      if (!features.assistant45) return;
      toggleRule45Calculator();
    });
  }

  // 设置
  const settingBtn = document.getElementById('btn-setting');
  if (settingBtn) {
    settingBtn.addEventListener('click', () => {
      if (isPaused) return;
      toggleSettings();
    });
  }

  // 重来
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (isPaused) return;
      confirmRestart();
    });
  }
}

// ---------- 提示 ----------
function handleHint() {
  hintStep++;

  if (hintStep === 1) {
    currentHint = guideBoard.showHint(false);
    if (!currentHint) {
      hintStep = 0;
      showToast('暂时没有可用的提示');
      return;
    }
    showToast(`💡 ${currentHint.techniqueName}：${currentHint.description}`);
  } else if (hintStep === 2) {
    currentHint = guideBoard.showHint(true);
    if (currentHint) {
      showToast(`答案是 ${currentHint.num}`);
    }
  } else {
    guideBoard.clearHints();
    hintStep = 0;
    currentHint = null;
  }

  refreshBoard();
}

// ---------- Toast ----------
let toastTimer = null;
function showToast(message) {
  let toast = document.getElementById('game-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'game-toast';
    toast.className = 'game-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// ---------- 45法则计算器 ----------
// 获取当前盘面的规则总和（4×4=10, 6×6=21, 9×9=45）
function getRuleSum(gridSize) {
  const size = gridSize || currentGridSize;
  let sum = 0;
  for (let i = 1; i <= size; i++) sum += i;
  return sum;
}

// 获取当前盘面的规则名称
function getRuleName(gridSize) {
  const size = gridSize || currentGridSize;
  if (size <= 4) return '10法则';
  if (size <= 6) return '21法则';
  return '45法则';
}

function toggleRule45Calculator() {
  const overlay = document.getElementById('rule45-overlay');
  if (!overlay) return;

  if (overlay.classList.contains('active')) {
    overlay.classList.remove('active');
  } else {
    if (!rule45Initialized) {
      initRule45Calculator();
    }
    // 更新UI适配当前盘面大小
    updateRule45ForGridSize();
    overlay.classList.add('active');
    calcRule45Combinations();
  }
}

function updateRule45ForGridSize() {
  const size = currentGridSize;
  const ruleSum = getRuleSum(size);
  const ruleName = getRuleName(size);

  // 更新标题
  const titleEl = document.querySelector('#rule45-overlay h3');
  if (titleEl) {
    titleEl.textContent = `🧮 ${ruleName}计算器`;
  }

  // 更新目标和的最大值
  const targetSumInput = document.getElementById('rule45-targetsum');
  if (targetSumInput) {
    targetSumInput.max = ruleSum;
    if (parseInt(targetSumInput.value) > ruleSum) {
      targetSumInput.value = Math.min(10, ruleSum);
    }
  }

  // 更新格子数的最大值
  const cellCountInput = document.getElementById('rule45-cellcount');
  if (cellCountInput) {
    cellCountInput.max = size;
    if (parseInt(cellCountInput.value) > size) {
      cellCountInput.value = Math.min(2, size);
    }
  }

  // 更新必含/排除数字选择器的显示
  const mustPicker = document.getElementById('rule45-must');
  const excludePicker = document.getElementById('rule45-exclude');

  if (mustPicker) {
    mustPicker.querySelectorAll('.rule45-num-btn').forEach(btn => {
      const num = parseInt(btn.dataset.num);
      btn.style.display = num <= size ? '' : 'none';
    });
  }
  if (excludePicker) {
    excludePicker.querySelectorAll('.rule45-num-btn').forEach(btn => {
      const num = parseInt(btn.dataset.num);
      btn.style.display = num <= size ? '' : 'none';
    });
  }

  // 清理超出范围的必含/排除数字
  rule45MustNums.forEach(num => {
    if (num > size) rule45MustNums.delete(num);
  });
  rule45ExcludeNums.forEach(num => {
    if (num > size) rule45ExcludeNums.delete(num);
  });
  updateRule45NumButtons();
}

function initRule45Calculator() {
  const closeBtn = document.getElementById('btn-rule45-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', toggleRule45Calculator);
  }

  const overlay = document.getElementById('rule45-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'rule45-overlay') {
        toggleRule45Calculator();
      }
    });
  }

  const mustPicker = document.getElementById('rule45-must');
  const excludePicker = document.getElementById('rule45-exclude');

  if (mustPicker && excludePicker) {
    for (let i = 1; i <= 9; i++) {
      const mustBtn = document.createElement('button');
      mustBtn.className = 'rule45-num-btn';
      mustBtn.textContent = i;
      mustBtn.dataset.num = i;
      mustBtn.addEventListener('click', () => toggleRule45Num(i, 'must'));
      mustPicker.appendChild(mustBtn);

      const exclBtn = document.createElement('button');
      exclBtn.className = 'rule45-num-btn';
      exclBtn.textContent = i;
      exclBtn.dataset.num = i;
      exclBtn.addEventListener('click', () => toggleRule45Num(i, 'exclude'));
      excludePicker.appendChild(exclBtn);
    }
  }

  const cellCountInput = document.getElementById('rule45-cellcount');
  const targetSumInput = document.getElementById('rule45-targetsum');
  if (cellCountInput) cellCountInput.addEventListener('input', calcRule45Combinations);
  if (targetSumInput) targetSumInput.addEventListener('input', calcRule45Combinations);

  rule45Initialized = true;
}

function toggleRule45Num(num, type) {
  if (type === 'must') {
    if (rule45MustNums.has(num)) {
      rule45MustNums.delete(num);
    } else {
      rule45MustNums.add(num);
      rule45ExcludeNums.delete(num);
    }
  } else {
    if (rule45ExcludeNums.has(num)) {
      rule45ExcludeNums.delete(num);
    } else {
      rule45ExcludeNums.add(num);
      rule45MustNums.delete(num);
    }
  }
  updateRule45NumButtons();
  calcRule45Combinations();
}

function updateRule45NumButtons() {
  const mustPicker = document.getElementById('rule45-must');
  const excludePicker = document.getElementById('rule45-exclude');

  if (mustPicker) {
    mustPicker.querySelectorAll('.rule45-num-btn').forEach(btn => {
      const num = parseInt(btn.dataset.num);
      if (rule45MustNums.has(num)) {
        btn.classList.add('active-must');
      } else {
        btn.classList.remove('active-must');
      }
    });
  }

  if (excludePicker) {
    excludePicker.querySelectorAll('.rule45-num-btn').forEach(btn => {
      const num = parseInt(btn.dataset.num);
      if (rule45ExcludeNums.has(num)) {
        btn.classList.add('active-exclude');
      } else {
        btn.classList.remove('active-exclude');
      }
    });
  }
}

function calcRule45Combinations() {
  const cellCountEl = document.getElementById('rule45-cellcount');
  const targetSumEl = document.getElementById('rule45-targetsum');
  const cellCount = cellCountEl ? (parseInt(cellCountEl.value) || 0) : 0;
  const targetSum = targetSumEl ? (parseInt(targetSumEl.value) || 0) : 0;

  const resultEl = document.getElementById('rule45-combinations');
  const countEl = document.getElementById('rule45-count');

  if (!resultEl || !countEl) return;

  const size = currentGridSize;
  const ruleSum = getRuleSum(size);

  if (cellCount < 1 || cellCount > size || targetSum < 1 || targetSum > ruleSum) {
    resultEl.innerHTML = `<div class="rule45-no-result">请输入有效的格子数（1-${size}）和目标和（1-${ruleSum}）</div>`;
    countEl.textContent = '0 种';
    return;
  }

  if (rule45MustNums.size > cellCount) {
    resultEl.innerHTML = '<div class="rule45-no-result">必含数字数量不能超过格子数</div>';
    countEl.textContent = '0 种';
    return;
  }

  const availableNums = [];
  for (let i = 1; i <= size; i++) {
    if (!rule45ExcludeNums.has(i)) {
      availableNums.push(i);
    }
  }

  const mustArray = Array.from(rule45MustNums);
  for (const m of mustArray) {
    if (!availableNums.includes(m)) {
      resultEl.innerHTML = '<div class="rule45-no-result">必含数字不能同时被排除</div>';
      countEl.textContent = '0 种';
      return;
    }
  }

  const remainingCount = cellCount - mustArray.length;
  const mustSum = mustArray.reduce((a, b) => a + b, 0);
  const remainingSum = targetSum - mustSum;

  const candidatePool = availableNums.filter(n => !rule45MustNums.has(n));

  const combinations = [];
  findCombinations(candidatePool, remainingCount, remainingSum, 0, [], combinations);

  const fullCombinations = combinations.map(combo => {
    return [...mustArray, ...combo].sort((a, b) => a - b);
  });

  fullCombinations.sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });

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

function findCombinations(pool, k, target, start, current, result) {
  if (k === 0) {
    if (target === 0) {
      result.push([...current]);
    }
    return;
  }

  if (start + k > pool.length) return;

  for (let i = start; i < pool.length; i++) {
    const num = pool[i];
    if (num > target) break;
    const minRemainingSum = num + sumFirstK(pool, i + 1, k - 1);
    if (minRemainingSum > target) break;
    const maxRemainingSum = num + sumLastK(pool, pool.length - 1, k - 1);
    if (maxRemainingSum < target) continue;

    current.push(num);
    findCombinations(pool, k - 1, target - num, i + 1, current, result);
    current.pop();
  }
}

function sumFirstK(pool, start, k) {
  let sum = 0;
  for (let i = 0; i < k && start + i < pool.length; i++) {
    sum += pool[start + i];
  }
  return sum;
}

function sumLastK(pool, end, k) {
  let sum = 0;
  for (let i = 0; i < k && end - i >= 0; i++) {
    sum += pool[end - i];
  }
  return sum;
}

// ---------- 连填模式（长按数字键激活，同时高亮盘面同数字格子） ----------
function clearQuickFillNumHighlight() {
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.classList.remove('quick-fill-num');
  });
}

// 长按数字键激活连填（只用 pointer 事件，避免移动端 touchstart+pointerdown 双重触发）
function setupQuickFillLongPress() {
  document.querySelectorAll('.num-btn').forEach(btn => {
    let longPressTimer = null;
    let longPressTriggered = false;

    btn.addEventListener('pointerdown', () => {
      const num = parseInt(btn.dataset.num);
      // 长按数字键优先级高于候选模式——即使在候选模式下也能激活连填
      if (isNumberComplete(num)) return;
      
      // 如果这个数字已经是连填状态，直接取消（Toggle）
      if (quickFillMode && quickFillNum === num) {
        exitQuickFill();
        return;
      }
      
      longPressTriggered = false;
      btn.classList.add('long-pressing'); // 绿色进度条动画

      longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        btn.classList.remove('long-pressing');
        selectQuickFillNum(num);           // 变绿 + 高亮盘面
        if (navigator.vibrate) navigator.vibrate(50);
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
          // 短按（<500ms）但没选中格子 → 点数字行为由 bindNumPad 处理
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

function selectQuickFillNum(num) {
  if (isNumberComplete(num)) return;
  clearQuickFillNumHighlight();
  if (quickFillNum === num) {
    exitQuickFill();
    return;
  }
  quickFillMode = true;
  quickFillNum = num;
  // 高亮键盘数字
  const btn = document.querySelector('.num-btn[data-num="' + num + '"]');
  if (btn) btn.classList.add('quick-fill-num');
  // 高亮盘面同数字格子
  if (guideBoard) guideBoard._quickFillHighlightNum = num;
  refreshBoard();
  // 隐藏提示
  const hint = document.getElementById('quick-fill-hint');
  if (hint) hint.classList.add('hidden');
  showGameToast('⚡ 连填' + num + '：直接点空格快速填入');
}

function exitQuickFill() {
  quickFillNum = null;
  quickFillMode = false;
  clearQuickFillNumHighlight();
  if (guideBoard) guideBoard._quickFillHighlightNum = null;
  refreshBoard();
}

function isNumberComplete(num) {
  if (!guideBoard) return false;
  let count = 0;
  const size = currentGridSize;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = guideBoard.cells[r][c].fixedNum || guideBoard.cells[r][c].fillNum;
      if (val === num) count++;
    }
  }
  return count >= size;
}

function tryQuickFill(r, c) {
  if (!quickFillMode || !quickFillNum) return false;
  // 连填优先级高于候选模式——激活连填后点击空格直接填入
  const cell = guideBoard.cells[r][c];
  if (cell.fixedNum || cell.fillNum) return false;

  guideBoard.selectCell(r, c);
  handleNumberInput(quickFillNum);

  if (isNumberComplete(quickFillNum)) {
    showGameToast('✅ ' + quickFillNum + ' 已填满，连填自动关闭');
    exitQuickFill();
  } else {
    // 刷新高亮（新填的格子也要高亮上）
    if (guideBoard) guideBoard._quickFillHighlightNum = quickFillNum;
  }
  return true;
}

// ---------- Toast 消息 ----------
let _toastTimer = null;
function showGameToast(msg) {
  const existing = document.querySelector('.game-toast');
  if (existing) existing.remove();
  clearTimeout(_toastTimer);

  const toast = document.createElement('div');
  toast.className = 'game-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ---------- 重来 ----------
function confirmRestart() {
  if (!currentLevelId) return;
  if (!confirm('确定要重来这关吗？所有已填的数字将被清空。')) return;
  Storage.clearTeachingProgress(currentLevelId);
  window.location.reload();
}

// ==========================================
// GuideManager 引导系统集成
// ==========================================

function initGuideManager() {
  if (!window.GuideManager) {
    console.warn('⚠️ GuideManager 未加载');
    return;
  }

  const triggers = (currentLevelData && currentLevelData.triggers) || [];
  if (triggers.length === 0) {
    console.log('📚 本关无引导配置');
    return;
  }

  // 清除该关卡旧的历史触发记录（保证每次重进都能看到引导）
  try {
    const oldKey = 'killersudoku_guide_triggered_' + currentLevelId;
    localStorage.removeItem(oldKey);
  } catch (e) { /* ignore */ }

  guideManager = new GuideManager({
    triggers: triggers,
    levelId: currentLevelId,
    board: guideBoard,
    renderer: guideRenderer,
    canvas: document.getElementById('gameCanvas'),
    storageKey: 'killersudoku_guide_triggered'
  });

  // 暴露到全局方便调试
  window.guideManager = guideManager;

  // 关卡开始触发
  setTimeout(() => {
    if (guideManager) {
      guideManager.onLevelStart();
    }
  }, 500);

  // 启动卡壳计时器
  startStuckTimer();

  console.log('✅ GuideManager 初始化完成，触发器数量:', triggers.length);
}

// 卡壳计时器
let stuckTimerInterval = null;
let lastActionTime = Date.now();

function startStuckTimer() {
  if (stuckTimerInterval) return;
  lastActionTime = Date.now();

  stuckTimerInterval = setInterval(() => {
    if (!guideManager || isPaused || isCompleted) return;
    const elapsed = (Date.now() - lastActionTime) / 1000;
    guideManager.update(elapsed);
  }, 1000);
}

function recordAction() {
  lastActionTime = Date.now();
}

// ---------- 事件回调：填数 ----------
function guide_onNumberFilled(r, c, num) {
  if (!guideManager) { console.log('❌ guide_onNumberFilled: guideManager 不存在'); return; }
  recordAction();
  console.log(`🔢 guide_onNumberFilled(r=${r}, c=${c}, num=${num}) → guideManager.onNumberFilled`);
  guideManager.onNumberFilled(r, c, num);

  // 填数后更新透视面板（如果当前选中的就是这个格子）
  if (guideBoard && guideBoard.selectedCell &&
      guideBoard.selectedCell.r === r && guideBoard.selectedCell.c === c) {
    updatePerspectivePanel(r, c);
  }
}

// ---------- 事件回调：选中格子 ----------
function guide_onCellSelect(r, c) {
  if (!guideManager) { console.log('❌ guide_onCellSelect: guideManager 不存在'); return; }
  recordAction();
  console.log(`👆 guide_onCellSelect(r=${r}, c=${c})`);
  guideManager.onCellSelect(r, c);

  // 检查选中的笼子
  if (guideBoard && guideBoard.cages) {
    const cell = guideBoard.cells[r]?.[c];
    if (cell && cell.cageId !== undefined) {
      const cage = guideBoard.cages.find(cg => cg.id === cell.cageId);
      if (cage) {
        guideManager.onCageSelect(cage);
      }
    }
  }

  // 更新透视面板
  updatePerspectivePanel(r, c);
}

// ---------- 更新透视面板 ----------
function updatePerspectivePanel(r, c) {
  const panel = document.getElementById('perspective-panel');
  if (!panel) return;

  // 检查是否开启透视镜功能
  if (!features.perspectiveMode) {
    panel.style.display = 'none';
    return;
  }

  // 如果选中的是固定数字且已填，也可以显示
  const cell = guideBoard.cells[r]?.[c];
  if (!cell) return;

  panel.style.display = 'block';

  const seen = guideBoard.getSeenNumbers(r, c);

  const formatNums = (set, max) => {
    if (set.size === 0) return '<span style="color:#cbd5e1;">-</span>';
    const arr = [];
    for (let i = 1; i <= max; i++) {
      if (set.has(i)) arr.push(i);
    }
    return arr.join(' ');
  };

  const size = guideBoard.size;
  const rowNums = document.getElementById('persp-row-nums');
  const colNums = document.getElementById('persp-col-nums');
  const boxNums = document.getElementById('persp-box-nums');
  if (rowNums) rowNums.innerHTML = formatNums(seen.row, size);
  if (colNums) colNums.innerHTML = formatNums(seen.col, size);
  if (boxNums) boxNums.innerHTML = formatNums(seen.box, size);

  // 根据高亮设置显示/隐藏对应分组（null安全检查）
  const rowEl = document.getElementById('persp-row');
  const colEl = document.getElementById('persp-col');
  const boxEl = document.getElementById('persp-box');
  if (rowEl) rowEl.style.display = guideBoard.highlightSettings.sameRow ? '' : 'none';
  if (colEl) colEl.style.display = guideBoard.highlightSettings.sameCol ? '' : 'none';
  if (boxEl) boxEl.style.display = guideBoard.highlightSettings.sameBox ? '' : 'none';
}

// ---------- 事件回调：通关 ----------
function guide_onLevelComplete() {
  if (!guideManager) return;
  guideManager.onLevelComplete();
}

// ---------- 物理键盘 ----------
function bindKeyboard() {
  document.addEventListener('keydown', function(e) {
    if (isPaused && e.key !== 'Escape' && e.key !== ' ') {
      return;
    }

    const size = currentGridSize;
    const maxNum = size;

    // 数字键 1-size
    if (e.key >= '1' && e.key <= String(maxNum)) {
      const num = parseInt(e.key);
      handleNumberInput(num);
      e.preventDefault();
      return;
    }

    // 退格 / Delete：擦除
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (guideBoard.selectedCells.length > 1) {
        guideBoard.eraseSelection();
      } else {
        guideBoard.eraseNumber();
      }
      guideBoard.checkConflicts();
      refreshBoard();
      e.preventDefault();
      return;
    }

    // 方向键
    if (e.key === 'ArrowUp') {
      guideBoard.moveSelection(-1, 0);
      refreshBoard();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      guideBoard.moveSelection(1, 0);
      refreshBoard();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft') {
      guideBoard.moveSelection(0, -1);
      refreshBoard();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight') {
      guideBoard.moveSelection(0, 1);
      refreshBoard();
      e.preventDefault();
      return;
    }

    // Z / Ctrl+Z：撤销
    if (e.key === 'z' || e.key === 'Z') {
      if (e.ctrlKey || e.metaKey) {
        guideBoard.undo();
        refreshBoard();
        e.preventDefault();
        return;
      }
    }

    // 空格 / C：切换候选模式
    if ((e.key === ' ' || e.key === 'c' || e.key === 'C') && features.allowDraft) {
      const candidateBtn = document.getElementById('btn-candidate');
      const mode = guideBoard.toggleInputMode();
      if (candidateBtn) {
        if (mode === 'candidate') {
          candidateBtn.style.backgroundColor = '#3b82f6';
          candidateBtn.style.color = 'white';
        } else {
          candidateBtn.style.backgroundColor = '';
          candidateBtn.style.color = '';
        }
      }
      refreshBoard();
      e.preventDefault();
      return;
    }

    // H：提示
    if ((e.key === 'h' || e.key === 'H') && features.showHints) {
      handleHint();
      e.preventDefault();
      return;
    }

    // R：45法则
    if ((e.key === 'r' || e.key === 'R') && features.assistant45) {
      toggleRule45Calculator();
      e.preventDefault();
      return;
    }

    // S：设置
    if (e.key === 's' || e.key === 'S') {
      toggleSettings();
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
// 设置弹窗
// ==========================================

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

function initSettingsBindings() {
  const closeBtn = document.getElementById('btn-settings-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', toggleSettings);
  }

  const overlay = document.getElementById('settings-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'settings-overlay') {
        toggleSettings();
      }
    });
  }

  const conflictRed = document.getElementById('setting-conflict-red');
  if (conflictRed) {
    conflictRed.addEventListener('change', (e) => {
      guideBoard.settings.conflictRed = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightRow = document.getElementById('setting-highlight-row');
  if (highlightRow) {
    highlightRow.addEventListener('change', (e) => {
      guideBoard.highlightSettings.sameRow = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightCol = document.getElementById('setting-highlight-col');
  if (highlightCol) {
    highlightCol.addEventListener('change', (e) => {
      guideBoard.highlightSettings.sameCol = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightBox = document.getElementById('setting-highlight-box');
  if (highlightBox) {
    highlightBox.addEventListener('change', (e) => {
      guideBoard.highlightSettings.sameBox = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightSameNum = document.getElementById('setting-highlight-samenum');
  if (highlightSameNum) {
    highlightSameNum.addEventListener('change', (e) => {
      guideBoard.highlightSettings.sameNumber = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightSameCage = document.getElementById('setting-highlight-samecage');
  if (highlightSameCage) {
    highlightSameCage.addEventListener('change', (e) => {
      guideBoard.highlightSettings.sameCage = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const autoClear = document.getElementById('setting-auto-clear');
  if (autoClear) {
    autoClear.addEventListener('change', (e) => {
      guideBoard.settings.autoClearCandidates = e.target.checked;
      saveSettings();
    });
  }
}

function loadSettings() {
  if (typeof Storage === 'undefined') return;
  const saved = Storage.getSettings();
  if (!saved) return;

  if (saved.conflictRed !== undefined) guideBoard.settings.conflictRed = saved.conflictRed;
  if (saved.autoClearCandidates !== undefined) guideBoard.settings.autoClearCandidates = saved.autoClearCandidates;
  if (saved.highlightRow !== undefined) guideBoard.highlightSettings.sameRow = saved.highlightRow;
  if (saved.highlightCol !== undefined) guideBoard.highlightSettings.sameCol = saved.highlightCol;
  if (saved.highlightBox !== undefined) guideBoard.highlightSettings.sameBox = saved.highlightBox;
  if (saved.highlightSameNumber !== undefined) guideBoard.highlightSettings.sameNumber = saved.highlightSameNumber;
  if (saved.highlightSameCage !== undefined) guideBoard.highlightSettings.sameCage = saved.highlightSameCage;
}

function saveSettings() {
  if (typeof Storage === 'undefined') return;
  Storage.saveSettings({
    conflictRed: guideBoard.settings.conflictRed,
    autoClearCandidates: guideBoard.settings.autoClearCandidates,
    highlightRow: guideBoard.highlightSettings.sameRow,
    highlightCol: guideBoard.highlightSettings.sameCol,
    highlightBox: guideBoard.highlightSettings.sameBox,
    highlightSameNumber: guideBoard.highlightSettings.sameNumber,
    highlightSameCage: guideBoard.highlightSettings.sameCage
  });
}

function loadSettingsToUI() {
  const conflictRed = document.getElementById('setting-conflict-red');
  if (conflictRed) conflictRed.checked = guideBoard.settings.conflictRed;

  const highlightRow = document.getElementById('setting-highlight-row');
  if (highlightRow) highlightRow.checked = guideBoard.highlightSettings.sameRow;

  const highlightCol = document.getElementById('setting-highlight-col');
  if (highlightCol) highlightCol.checked = guideBoard.highlightSettings.sameCol;

  const highlightBox = document.getElementById('setting-highlight-box');
  if (highlightBox) highlightBox.checked = guideBoard.highlightSettings.sameBox;

  const highlightSameNum = document.getElementById('setting-highlight-samenum');
  if (highlightSameNum) highlightSameNum.checked = guideBoard.highlightSettings.sameNumber;

  const highlightSameCage = document.getElementById('setting-highlight-samecage');
  if (highlightSameCage) highlightSameCage.checked = guideBoard.highlightSettings.sameCage;

  const autoClear = document.getElementById('setting-auto-clear');
  if (autoClear) autoClear.checked = guideBoard.settings.autoClearCandidates;
}
