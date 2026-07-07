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

// 星衡法则计算器状态
let rule45MustNums = new Set();
let rule45ExcludeNums = new Set();
let rule45Initialized = false;

// 连填模式状态
let quickFillMode = false;
let quickFillNum = null;

// 提示相关
let hintStep = 0;
let currentHint = null;
let _isHintShowing = false; // 防止refreshBoard清掉正在设置的提示

// ========== 三阶段状态管理 ==========
// opening（开局）→ breakthrough（破局）→ finishing（收官）→ complete
let gamePhase = 'opening';
let phaseOverlay = null;   // 暗化遮罩DOM
let phaseIndicator = null; // 阶段指示器DOM
let _stuckTimer = null;    // 停滞检测计时器
let _lastProgressTime = 0; // 上次有效填数时间
let _emptyAtPhaseStart = 0;// 阶段开始时的空格数
let _breakthroughWrongCount = 0; // 破局阶段连续猜错次数（用于防猜）

// ========== 残局教学关模式 ==========
let isEndgameMode = false;   // 是否为残局教学关
let endgameKeyCells = [];    // 关键格坐标 [[r,c],...]
let endgameKeyCellsFilled = 0; // 已正确填入的关键格数量

/**
 * 计算当前空格数（非初始数字且未填的格子）
 */
function getEmptyCount() {
  if (!guideBoard) return 0;
  const size = currentGridSize;
  let count = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = guideBoard.cells[r][c];
      if (!cell.fixedNum && !cell.fillNum) count++;
    }
  }
  return count;
}

/**
 * 计算初始空格数（关卡开始时）
 */
function getInitialEmptyCount() {
  if (!currentLevelData || !currentLevelData.puzzle) return 0;
  const p = currentLevelData.puzzle;
  if (Array.isArray(p) && Array.isArray(p[0])) {
    let count = 0;
    for (let r = 0; r < p.length; r++)
      for (let c = 0; c < p[r].length; c++)
        if (p[r][c] === 0) count++;
    return count;
  }
  // 降级：用cells
  if (p.cells) {
    let count = 0;
    for (let r = 0; r < p.cells.length; r++)
      for (let c = 0; c < p.cells[r].length; c++)
        if (p.cells[r][c] === 0) count++;
    return count;
  }
  return 0;
}

/**
 * 创建阶段UI元素（遮罩+指示器）
 */
function _ensurePhaseUI() {
  if (!phaseOverlay) {
    phaseOverlay = document.createElement('div');
    phaseOverlay.className = 'phase-vignette';
    document.body.appendChild(phaseOverlay);
  }
  if (!phaseIndicator) {
    phaseIndicator = document.createElement('div');
    phaseIndicator.className = 'phase-indicator';
    document.body.appendChild(phaseIndicator);
  }
}

/**
 * 进入破局阶段
 * @param {Object} opts - { auto: false, reason: '' }
 */
function enterBreakthrough(opts = {}) {
  if (gamePhase === 'breakthrough' || gamePhase === 'finishing') return;
  gamePhase = 'breakthrough';
  _emptyAtPhaseStart = getEmptyCount();
  _breakthroughWrongCount = 0; // 重置防猜计数
  console.log(`⚡ 进入破局阶段 (原因: ${opts.reason || '未知'})`);

  _ensurePhaseUI();

  // 暗化四周
  phaseOverlay.classList.add('active');
  document.body.classList.add('phase-breakthrough');

  // 阶段指示器
  phaseIndicator.textContent = t('story.phases.breakthrough');
  phaseIndicator.classList.remove('finishing');
  phaseIndicator.classList.add('show');
  setTimeout(() => phaseIndicator.classList.remove('show'), 3000);

  // 逆转裁判式破局特效（不播放"什么？！"等惊讶台词，除非是玩家自己突破的）
  if (!_storyBreakthroughDone) {
    _storyBreakthroughDone = true;
    // 只播放金色闪光效果，不显示"异议！"文字
    if (typeof StoryEngine !== 'undefined') {
      StoryEngine.breakthrough();
    } else if (typeof Effects !== 'undefined') {
      Effects.shake(10, 400);
      Effects.flash('#ffffff', 300, 0.3);
      Effects.vignette(0.5, 300);
    }
    // 仅在玩家实际操作触发破局时播放惊讶台词（非开局脚本触发）
    const isScriptedStart = opts.reason === 'scripted' || opts.skipDialogue;
    if (!isScriptedStart) {
      // 延迟播放破局台词
      setTimeout(() => {
        if (typeof StoryEngine !== 'undefined' && !StoryEngine.isPlaying) {
          const chId = _detectStoryChapter(currentLevelId);
          const breakScenes = {
            1: 'breakthrough', 2: 'advanced_tech',
            3: 'Yan_break', 4: 'remnant_break',
            5: 'weaver_seen', 6: 'plotter_broken',
            7: 'setter_broken'
          };
          const scene = breakScenes[chId];
          if (scene) StoryEngine.playScene(scene);
        }
      }, 1500);
    }
  }

  // BGM切换为紧张模式
  if (typeof BGMEngine !== 'undefined') {
    BGMEngine.setPhase('breakthrough');
  } else if (typeof MidiBGM !== 'undefined') {
    MidiBGM.setPhase('breakthrough');
  } else if (typeof AudioManager !== 'undefined' && AudioManager.bgmEnabled) {
    AudioManager.startBreakthroughBGM();
  }

  // 通知GuideManager
  if (guideManager) {
    guideManager.onPhaseChange && guideManager.onPhaseChange('breakthrough', opts);
  }
}

/**
 * 进入收官阶段
 */
function enterFinishing() {
  if (gamePhase === 'finishing') return;
  const wasBreakthrough = gamePhase === 'breakthrough';
  gamePhase = 'finishing';
  console.log('🏁 进入收官阶段');

  _ensurePhaseUI();

  // 移除暗化
  phaseOverlay.classList.remove('active');
  document.body.classList.remove('phase-breakthrough');
  document.body.classList.add('phase-finishing');

  // 阶段指示器
  phaseIndicator.textContent = t('story.phases.finishing');
  phaseIndicator.classList.add('finishing', 'show');
  setTimeout(() => phaseIndicator.classList.remove('show'), 3000);

  // 撒花特效
  if (wasBreakthrough) {
    _spawnSparkles(20);
  }

  // BGM切换为胜利感
  if (typeof BGMEngine !== 'undefined') {
    BGMEngine.setPhase('finishing');
  } else if (typeof MidiBGM !== 'undefined') {
    MidiBGM.setPhase('finishing');
  } else if (typeof AudioManager !== 'undefined' && AudioManager.bgmEnabled) {
    AudioManager.startFinishingBGM();
  }

  // 通知GuideManager
  if (guideManager) {
    guideManager.onPhaseChange && guideManager.onPhaseChange('finishing', {});
  }
}

/**
 * 重置阶段（新关卡）
 */
function resetPhase() {
  gamePhase = 'opening';
  _lastProgressTime = Date.now();
  _emptyAtPhaseStart = 0;
  _breakthroughWrongCount = 0;
  isEndgameMode = false;
  endgameKeyCells = [];
  endgameKeyCellsFilled = 0;
  // 重置故事演出状态
  _storyCorrectCount = 0;
  _storyComboCount = 0;
  _storyBreakthroughDone = false;
  _storyBossDefeatDone = false;
  _storyInitialized = false;
  if (phaseOverlay) phaseOverlay.classList.remove('active');
  if (phaseIndicator) phaseIndicator.classList.remove('show', 'finishing');
  document.body.classList.remove('phase-breakthrough', 'phase-finishing');
  if (_stuckTimer) { clearTimeout(_stuckTimer); _stuckTimer = null; }
  // 重置特效
  if (typeof Effects !== 'undefined') Effects.reset();
  if (typeof StoryEngine !== 'undefined') {
    StoryEngine.hideObjection();
    StoryEngine.interrupt();
  }
}

/**
 * 初始化残局教学关模式
 * - 标记非关键格为锁定（不可点击）
 * - 残局关直接进入破局阶段
 */
function initEndgameMode(levelData) {
  isEndgameMode = false;
  endgameKeyCells = [];
  endgameKeyCellsFilled = 0;

  if (!levelData) return;
  const mode = levelData.mode || 'full';
  if (mode !== 'endgame') return;

  const keyCells = levelData.keyCells;
  if (!keyCells || !Array.isArray(keyCells) || keyCells.length === 0) {
    console.warn('⚠️ 残局教学关缺少keyCells配置');
    return;
  }

  isEndgameMode = true;
  endgameKeyCells = keyCells.map(([r, c]) => ({ r, c }));
  endgameKeyCellsFilled = 0;

  const size = currentGridSize;
  const keySet = new Set(keyCells.map(([r, c]) => `${r},${c}`));

  // 锁定非关键格（已填的固定数字和非keyCell的空格）
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = guideBoard.cells[r][c];
      if (!keySet.has(`${r},${c}`)) {
        cell.isLocked = true;
      } else {
        cell.isLocked = false;
        // 关键格确保是空的
        if (cell.fixedNum) {
          console.warn(`⚠️ 关键格(${r},${c})是预填数字，已移除fixedNum`);
          cell.fixedNum = null;
        }
      }
    }
  }

  console.log(`🎯 残局教学关初始化: ${keyCells.length}个关键格`, keyCells);
}

/**
 * 残局关：检测关键格完成度
 */
function checkEndgameProgress() {
  if (!isEndgameMode || !guideBoard) return { filled: 0, total: endgameKeyCells.length, complete: false };
  const solution = currentLevelData && currentLevelData.solution;
  if (!solution) return { filled: 0, total: endgameKeyCells.length, complete: false };

  let filled = 0;
  for (const {r, c} of endgameKeyCells) {
    const cell = guideBoard.cells[r][c];
    if (cell.fillNum === solution[r][c]) filled++;
  }
  endgameKeyCellsFilled = filled;
  return { filled, total: endgameKeyCells.length, complete: filled === endgameKeyCells.length };
}

/**
 * 自动检测阶段转换（在每次refreshBoard后调用）
 */
function checkPhaseTransition() {
  if (isCompleted) return;
  const empty = getEmptyCount();
  const total = getInitialEmptyCount();
  if (total === 0) return;
  const filled = total - empty;
  const fillRatio = filled / total;

  _lastProgressTime = Date.now();

  if (gamePhase === 'opening') {
    // 开局→破局：填了40%以上空格，且没有简单提示（孤星/隐曜）时
    if (fillRatio >= 0.35) {
      const hint = guideBoard.getNextHint();
      if (!hint) {
        // 没有可直接填入的孤星/隐曜，需要高级技巧——破局时刻！
        enterBreakthrough({ auto: true, reason: '无孤星/隐曜可填' });
      }
    }
  } else if (gamePhase === 'breakthrough') {
    // 破局→收官：填入破局阶段的关键数字后，重新出现连续孤星
    if (_emptyAtPhaseStart > 0 && empty <= _emptyAtPhaseStart - 2) {
      // 破局后已填2格以上，且存在孤星（连锁反应开始）
      const hint = guideBoard.getNextHint();
      if (hint && hint.technique === 'nakedSingle') {
        // 再确认一下：连续3个孤星说明进入收官
        let cascadeCount = 0;
        const simGrid = [];
        for (let r = 0; r < currentGridSize; r++) {
          simGrid[r] = [];
          for (let c = 0; c < currentGridSize; c++) {
            const cell = guideBoard.cells[r][c];
            simGrid[r][c] = cell.fixedNum || cell.fillNum || 0;
          }
        }
        // 简单模拟：看看是否有连锁
        enterFinishing();
      }
    }
    // 兜底：空格少于20%直接收官
    if (empty / (currentGridSize * currentGridSize) < 0.15) {
      enterFinishing();
    }
  }
}

/**
 * 生成收官撒花粒子
 */
function _spawnSparkles(count) {
  const colors = ['#fbbf24', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fb923c'];
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'finish-sparkle';
    s.style.left = (rect.left + Math.random() * rect.width) + 'px';
    s.style.top = (rect.top + Math.random() * rect.height) + 'px';
    s.style.background = colors[Math.floor(Math.random() * colors.length)];
    s.style.animationDelay = (Math.random() * 0.5) + 's';
    s.style.width = s.style.height = (4 + Math.random() * 6) + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 2500);
  }
}

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

window.onload = async function() {
  console.log('📚 教学模式启动中...');

  // 初始化i18n多语言系统
  if (typeof I18N !== 'undefined') {
    await I18N.init();
    // 绑定语言切换按钮
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (typeof AudioManager !== 'undefined') AudioManager.playClick();
        const locale = btn.dataset.locale;
        await I18N.setLocale(locale);
        updateLangButtons();
        // 更新动态文本
        updateDynamicI18N();
      });
    });
    updateLangButtons();
  }

  /**
   * 更新语言按钮激活状态
   */
  function updateLangButtons() {
    const current = I18N ? I18N.getLocale() : 'zh-CN';
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.locale === current);
    });
    const langNames = { 'zh-CN': '简体中文', 'ja': '日本語', 'ko': '한국어', 'en': 'English' };
    const cur = document.getElementById('language-current');
    if (cur) cur.textContent = langNames[current] || current;
  }

  /**
   * 更新动态生成的i18n文本（JS中设置的textContent/innerHTML）
   */
  function updateDynamicI18N() {
    // 更新星衡法则标题（根据盘面大小动态变化）
    const rule45Title = document.getElementById('rule45-title');
    if (rule45Title && typeof getRule45Name === 'function') {
      rule45Title.textContent = t('ui.rule45.title', { ruleName: getRule45Name() });
    }
    // 更新通关时间
    const timeEl = document.getElementById('complete-time');
    if (timeEl && typeof formatTime !== 'undefined') {
      timeEl.textContent = t('ui.complete.timeUsed', { time: formatTime(elapsedSeconds || 0) });
    }
    // 更新笔记模式按钮文字
    const candBtn = document.getElementById('btn-candidate');
    if (candBtn) {
      const isCand = candBtn.classList.contains('active');
      candBtn.title = isCand ? t('ui.toolbar.candidateMode') : t('ui.toolbar.candidate');
    }
    // 更新返回按钮
    const backBtn = document.getElementById('btn-back');
    if (backBtn) backBtn.textContent = t('ui.common.backToChapter');
    // 更新暂停/通关弹窗
    const resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) resumeBtn.textContent = t('ui.common.resume');
    const compBack = document.getElementById('btn-complete-back');
    if (compBack) compBack.textContent = t('ui.common.returnToLevels');
    const compNext = document.getElementById('btn-complete-next');
    if (compNext) compNext.textContent = t('ui.common.nextLevel');
    const compTitle = document.querySelector('#complete-overlay h3');
    if (compTitle) compTitle.textContent = t('ui.complete.title');
    const pauseTitle = document.querySelector('#pause-overlay h3');
    if (pauseTitle) pauseTitle.textContent = t('ui.pause.title');
    const pauseDesc = document.querySelector('#pause-overlay p');
    if (pauseDesc) pauseDesc.textContent = t('ui.pause.desc');
    // 更新工具栏title
    const titles = {
      'btn-undo': 'ui.toolbar.undo', 'btn-erase': 'ui.toolbar.erase',
      'btn-candidate': 'ui.toolbar.candidate', 'btn-auto-cands': 'ui.toolbar.autoCands',
      'btn-hint': 'ui.toolbar.hint', 'btn-restart': 'ui.common.restart'
    };
    for (const [id, key] of Object.entries(titles)) {
      const el = document.getElementById(id);
      if (el) el.title = t(key);
    }
    // 更新设置面板中的关闭按钮
    document.querySelectorAll('.settings-close, .rule45-close').forEach(btn => {
      btn.textContent = t('ui.common.close');
    });
    // 更新45计算器标签
    const rule45Labels = {
      '格子数': 'ui.rule45.cellCount', '目标和': 'ui.rule45.targetSum',
      '必含数字': 'ui.rule45.mustInclude', '排除数字': 'ui.rule45.exclude',
      '可能的组合': 'ui.rule45.possibleCombinations'
    };
    document.querySelectorAll('.rule45-input-group label, .rule45-result-header span:first-child').forEach(el => {
      const key = rule45Labels[el.textContent.trim()];
      if (key) el.textContent = t(key);
    });
    // 更新设置面板各section标题和选项
    updateSettingsI18N();
    // 更新连填提示
    const qfHint = document.getElementById('quick-fill-hint');
    if (qfHint) qfHint.textContent = t('ui.canvas.quickFillHint');
    // 更新透视面板标签
    const perspRow = document.getElementById('persp-row');
    const perspCol = document.getElementById('persp-col');
    const perspBox = document.getElementById('persp-box');
    if (perspRow) perspRow.firstChild.textContent = t('ui.perspective.row');
    if (perspCol) perspCol.firstChild.textContent = t('ui.perspective.col');
    if (perspBox) perspBox.firstChild.textContent = t('ui.perspective.box');
  }

  /**
   * 更新设置面板的i18n文本
   */
  function updateSettingsI18N() {
    const settingsMap = {
      '🔊 音频': 'ui.settings.audioSection',
      '🔇 一键静音': 'ui.settings.muteAll',
      '关闭所有声音（BGM+音效）': 'ui.settings.muteAllDesc',
      '🎵 背景音乐': 'ui.settings.bgm',
      '游戏过程中的背景音乐': 'ui.settings.bgmDesc',
      '🔊 音效': 'ui.settings.sfx',
      '点击、填数等操作音效': 'ui.settings.sfxDesc',
      '显示': 'ui.settings.displaySection',
      '冲突标红': 'ui.settings.conflictRed',
      '填错数字时标红提示': 'ui.settings.conflictRedDesc',
      '同行高亮': 'ui.settings.highlightRow',
      '选中格子时高亮整行': 'ui.settings.highlightRowDesc',
      '同列高亮': 'ui.settings.highlightCol',
      '选中格子时高亮整列': 'ui.settings.highlightColDesc',
      '同宫高亮': 'ui.settings.highlightBox',
      '选中格子时高亮整宫': 'ui.settings.highlightBoxDesc',
      '同数字高亮': 'ui.settings.highlightSameNum',
      '选中数字时高亮所有相同数字': 'ui.settings.highlightSameNumDesc',
      '同笼高亮': 'ui.settings.highlightSameCage',
      '选中格子时高亮所属笼子': 'ui.settings.highlightSameCageDesc',
      '操作': 'ui.settings.operationSection',
      '自动清除关联候选': 'ui.settings.autoClearCands',
      '填数后自动清除行/列/宫/笼的关联候选': 'ui.settings.autoClearCandsDesc',
      '⚙️ 设置': 'ui.settings.title'
    };
    document.querySelectorAll('.settings-section h4, .setting-name, .setting-desc, .settings-header h3').forEach(el => {
      const text = el.textContent.trim();
      const key = settingsMap[text];
      if (key) el.textContent = t(key);
    });
  }

  // 初始化音频
  if (typeof AudioManager !== 'undefined') {
    AudioManager.init();
  }

  // 1. 从 URL 读取关卡 ID
  const params = new URLSearchParams(window.location.search);
  const levelIdParam = params.get('levelId') || params.get('id');
  if (levelIdParam) {
    currentLevelId = levelIdParam;
  }

  // 1.5 检查是否强制播放剧情（测试用）
  forcePlayStory = params.get('story') === '1';

  // 1.6 检查是否重置存档（验收测试用 ?reset=1）
  const shouldReset = params.get('reset') === '1';
  if (shouldReset && typeof Storage !== 'undefined') {
    try { Storage.clearTeachingProgress(currentLevelId || 701); } catch(e) {}
  }

  // 2. 加载关卡数据
  loadTeachingLevel(currentLevelId).then(levelData => {
    if (!levelData) {
      alert(t('error.levelLoadFailed'));
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
    // 设置章节主题（盘面+UI跟随章节变色）
    guideRenderer.setTheme(currentChapterId);

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
    guideBoard.levelId = currentLevelId;

    // 8.5 重置三阶段状态
    resetPhase();

    // 8.6 残局教学关初始化：锁定非关键格
    initEndgameMode(levelData);

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

    // 12.05 初始化喜剧系统
    if (typeof ComedySystem !== 'undefined') {
      const isBoss = levelData.isBoss === true || (typeof BOSS_CONFIGS !== 'undefined' && BOSS_CONFIGS[currentLevelId]);
      ComedySystem.init({
        levelId: currentLevelId,
        mode: 'guide',
        isBoss: isBoss
      });
      // 暴露boss/ayan对话接口给guide-battle使用
      window._bossSay = function(text) {
        // guide-battle自己的对话系统已在boss-dialogue-zone中处理
        if (typeof window._guideBossSay === 'function') {
          window._guideBossSay(text);
        } else if (typeof StoryEngine !== 'undefined' && StoryEngine.sayAmbient) {
          StoryEngine.sayAmbient('plotter', 'smirk', text);
        } else {
          ComedySystem._showBubble('设局人', text, 'linear-gradient(135deg,#dc2626,#991b1b)', '🎭');
        }
      };
      window._ayanSay = function(text) {
        if (typeof window._guideAyanSay === 'function') {
          window._guideAyanSay(text);
        } else if (typeof StoryEngine !== 'undefined' && StoryEngine.sayAmbient) {
          StoryEngine.sayAmbient('yan', 'smile', text);
        } else {
          ComedySystem._showBubble('阿岩', text, 'linear-gradient(135deg,#22c55e,#15803d)', '🍃');
        }
      };
    }

    // 12.06 初始化技巧识别反馈系统
    if (typeof TechniqueFeedback !== 'undefined') {
      TechniqueFeedback.init(guideBoard);
    }

    // 12.1 应用i18n动态文本
    updateDynamicI18N();

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
      // 第一章第一关使用全新的StoryEngine开场演出
      const numId = parseInt(currentLevelId);
      const isFirstLevelOfChapter = currentChapterData && currentChapterData.levels && currentChapterData.levels[0] && currentChapterData.levels[0].levelId === numId;
      const useNewStoryEngine = (numId === 101) && typeof StoryEngine !== 'undefined';

      if (useNewStoryEngine) {
        // 新StoryEngine开场：完整剧情（带立绘+打字机音效+配音）
        try {
          if (storyManager && storyManager.modal) {
            storyManager.modal.el.style.display = 'none';
            storyManager.modal.el.classList.remove('active');
          }
          StoryEngine.init();
          StoryEngine.preloadAll();
          StoryEngine.playScene('ch1_opening_full', () => {
            onPreDialogComplete();
          });
        } catch(e) {
          console.error('StoryEngine error:', e);
          onPreDialogComplete();
        }
      } else {
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

  // 优先从 chapters.json 中找（这是唯一正确的数据源）
  try {
    const res = await fetch('data/chapters.json');
    const chapters = await res.json();
    const chapter = chapters.find(c => c.chapterId === chapterId);
    if (chapter && chapter.levels) {
      const level = chapter.levels.find(l => String(l.levelId) === String(levelId));
      if (level && level.boardData) {
        // 确保cages字段存在（即使是空数组）
        const cages = level.cages || [];
        // 检查boardData是否有非0数字（防止空白题）
        const hasNumbers = level.boardData.some(row => row.some(v => v !== 0));
        if (hasNumbers) {
          console.log(`✅ 从chapters.json加载关卡 ${levelId}`);
          return {
            ...level,
            size: level.gridSize,
            cells: level.boardData,
            cages: cages,
            gridSize: level.gridSize
          };
        } else {
          console.warn(`⚠️ chapters.json中关卡 ${levelId} 的boardData全0，忽略`);
        }
      }
    }
  } catch (e) {
    console.warn('本地章节数据加载失败：', e.message);
  }

  // 不再使用旧的teaching-levels-*.json文件，因为它们是全0的测试数据
  // 直接返回null，让getFallbackTeachingLevel处理
  console.warn(`⚠️ 未找到关卡 ${levelId} 的有效数据`);
  return null;
}

// 生成降级用的教学关卡（最后手段：当所有数据源都失败时使用）
function getFallbackTeachingLevel(levelId) {
  const numId = parseInt(levelId) || 101;
  const chapterId = Math.floor(numId / 100);
  const levelNum = numId % 100;

  // 验证关卡ID是否在有效范围内
  // 各章实际关卡数：第1章10关(101-110)，第2章8关(201-208)，第3章7关(301-307)，第4-7章各6关
  const maxLevels = { 1: 10, 2: 8, 3: 7, 4: 6, 5: 6, 6: 6, 7: 6 };
  const minLevel = 1;
  const max = maxLevels[chapterId] || 9;
  if (levelNum < minLevel || levelNum > max) {
    console.warn(`⚠️ 关卡 ${levelId} 不存在，重定向到章节选择`);
    setTimeout(() => {
      window.location.href = 'chapter-levels.html?id=' + chapterId;
    }, 100);
    return null;
  }

  // 所有数据源都失败，直接重定向回章节选择页面
  console.error(`❌ 关卡 ${levelId} 数据加载失败，返回章节选择`);
  alert('关卡数据加载失败，请刷新页面重试');
  setTimeout(() => {
    window.location.href = 'chapter-levels.html?id=' + chapterId;
  }, 500);
  return null;
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
  // 笔记按钮
  const candidateBtn = document.getElementById('btn-candidate');
  if (candidateBtn) {
    candidateBtn.style.display = features.allowDraft ? '' : 'none';
  }

  // 星衡法则按钮
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

// ---------- 动态生成数字键盘（单行横向排列，最大化盘面空间） ----------
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

  // 单行布局：4/6/9列，给盘面留出最大空间
  numPad.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
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

  // 恢复笔记
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
    timerEl.addEventListener('click', () => {
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      togglePause();
    });
  }

  // 暂停蒙层的继续按钮
  const resumeBtn = document.getElementById('btn-resume');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      togglePause();
    });
  }

  // 返回关卡按钮
  const backBtn = document.getElementById('btn-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      saveProgress();
      // 返回到对应章节的关卡列表
      window.location.href = 'chapter-levels.html?id=' + currentChapterId;
    });
  }
}

// ---------- 统一的操作后刷新 ----------
// ===== 渲染节流（rAF合并，确保每帧最多一次渲染）=====
let _renderPending = false;
let _renderFrameId = null;

function scheduleRender() {
  if (_renderPending) return;
  _renderPending = true;
  _renderFrameId = requestAnimationFrame(() => {
    _renderPending = false;
    _doRender();
  });
}

function _doRender() {
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

  // 告知renderer是否在Boss战中（render内部在高亮层之后、数字之前绘制玩家归属底色）
  guideRenderer._battleActive = (typeof GuideBattle !== 'undefined' && GuideBattle.active);
  guideRenderer._battleCtx = (typeof GuideBattle !== 'undefined') ? GuideBattle : null;

  guideRenderer.render(guideBoard);

  // Boss战：渲染迷雾+幽灵格+抢格子闪光（在棋盘之上绘制）
  if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
    GuideBattle.renderFogAndGhosts(guideRenderer.ctx, guideRenderer.cellSize, guideRenderer.padding);
  }

  checkAndNotifyConflict();
}

function refreshBoard(immediate) {
  if (immediate) {
    // 立即渲染（取消待处理的rAF）
    if (_renderFrameId) {
      cancelAnimationFrame(_renderFrameId);
      _renderFrameId = null;
    }
    _renderPending = false;
    _doRender();
  } else {
    scheduleRender();
  }
  saveProgress();
  updateNumberButtons();

  // 三阶段状态检测
  checkPhaseTransition();

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

  // 残局教学关：关键格全部正确填入即通关
  if (isEndgameMode) {
    const prog = checkEndgameProgress();
    if (prog.complete) {
      // 检查关键格是否有错误
      let hasError = false;
      for (const {r, c} of endgameKeyCells) {
        if (guideBoard.cells[r][c].isError) hasError = true;
      }
      if (!hasError) {
        console.log(`🎉 残局教学关通关！关键格${prog.filled}/${prog.total}全部正确`);
        markComplete();
      }
    }
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
    else if (speaker === '设局人残影') preset = chars.shadow;
    else if (speaker === '设局人（秘术）') preset = chars.setterSecret;
    else if (speaker === '星辰梭' || speaker === '织网者') preset = chars.starshuttle;
    else if (speaker === '残局守护者' || speaker === '残局') preset = chars.guardian;
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

// ========== 逆转裁判式演出系统集成 ==========
let _storyInitialized = false;
let _storyCorrectCount = 0;
let _storyComboCount = 0;
let _storyBreakthroughDone = false;
let _storyBossDefeatDone = false;
let _isFinalChapter = false;

function _detectStoryChapter(levelId) {
  const id = parseInt(levelId);
  if (id >= 700) return 7;
  return Math.floor(id / 100);
}

function _getBossIdForChapter(chId) {
  const map = { 1: 'yan', 2: 'cagekeeper', 3: 'plotterShadow', 4: 'remnant', 5: 'weaver', 6: 'plotter', 7: 'setterSecret' };
  return map[chId] || null;
}

function _isBossLevel(levelId) {
  const id = parseInt(levelId);
  const chId = _detectStoryChapter(id);
  // Boss关为每章最后一关（110→守笼人测试关，307→阿岩，406→残局守护者，506→星辰梭，606→设局人，706→终章设局人）
  const bossLevels = { 1: 110, 2: 208, 3: 307, 4: 406, 5: 506, 6: 606, 7: 706 };
  return bossLevels[chId] === id || (currentLevelData && currentLevelData.isBoss === true);
}

function _initStoryPerformance() {
  if (_storyInitialized) return;
  _storyInitialized = true;

  // 初始化特效系统
  if (typeof Effects !== 'undefined') {
    Effects.init();
  }

  // 初始化剧情引擎
  if (typeof StoryEngine !== 'undefined') {
    StoryEngine.init();
    StoryEngine.preloadAll();
  }

  // 初始化章节BGM
  const chIdForBGM = _detectStoryChapter(currentLevelId);
  if (typeof BGMEngine !== 'undefined') {
    BGMEngine.playChapter(chIdForBGM);
  } else if (typeof MidiBGM !== 'undefined') {
    MidiBGM.load(chIdForBGM);
    const startBGM = () => {
      MidiBGM.setVolume(0.35);
      MidiBGM.play();
      document.removeEventListener('click', startBGM);
      document.removeEventListener('touchstart', startBGM);
      document.removeEventListener('keydown', startBGM);
    };
    document.addEventListener('click', startBGM);
    document.addEventListener('touchstart', startBGM);
    document.addEventListener('keydown', startBGM);
  } else if (typeof AudioManager !== 'undefined') {
    // 回退到AudioManager BGM
    const startBGM = () => {
      if (AudioManager.bgmEnabled && !AudioManager.bgmPlaying) {
        AudioManager.startBGM();
      }
      document.removeEventListener('click', startBGM);
      document.removeEventListener('touchstart', startBGM);
      document.removeEventListener('keydown', startBGM);
    };
    document.addEventListener('click', startBGM);
    document.addEventListener('touchstart', startBGM);
    document.addEventListener('keydown', startBGM);
  }

  // 绑定配音开关
  const voiceToggle = document.getElementById('setting-voice');
  if (voiceToggle && typeof StoryEngine !== 'undefined') {
    StoryEngine.setVoiceEnabled(voiceToggle.checked);
    voiceToggle.addEventListener('change', () => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      StoryEngine.setVoiceEnabled(voiceToggle.checked);
    });
  } else if (typeof StoryEngine !== 'undefined') {
    StoryEngine.setVoiceEnabled(true);
  }

  // Boss关开场：砸入演出
  const chId = _detectStoryChapter(currentLevelId);
  const bossId = _getBossIdForChapter(chId);
  if (_isBossLevel(currentLevelId) && bossId && typeof StoryEngine !== 'undefined') {
    setTimeout(() => {
      StoryEngine.bossEnter(bossId);
    }, 800);
  }
  // 注意：第101关的开场剧情已在loadChapterData流程中通过ch1_opening_full播放，此处不再重复触发
}

function _onStoryCorrect() {
  if (!_storyInitialized) return;
  _storyCorrectCount++;
  _storyComboCount++;

  // 5连击或累计15格正确：破局时刻！
  if (!_storyBreakthroughDone && (_storyComboCount >= 5 || _storyCorrectCount >= 15)) {
    _storyBreakthroughDone = true;
    if (typeof StoryEngine !== 'undefined') {
      StoryEngine.breakthrough();
    }
    // 延迟播放破局台词
    setTimeout(() => {
      if (typeof StoryEngine !== 'undefined' && !StoryEngine.isPlaying) {
        const chId = _detectStoryChapter(currentLevelId);
        const breakScenes = {
          1: 'breakthrough', 2: 'advanced_tech',
          3: 'Yan_break', 4: 'remnant_break',
          5: 'weaver_seen', 6: 'plotter_broken',
          7: 'setter_broken'
        };
        const scene = breakScenes[chId];
        if (scene) StoryEngine.playScene(scene);
      }
    }, 1500);
  }

  // Boss被逼入绝境（累计30格正确时）
  if (_isBossLevel(currentLevelId) && _storyCorrectCount >= 30 && !_storyBossDefeatDone) {
    const chId = _detectStoryChapter(currentLevelId);
    const cornerScenes = {
      3: 'Yan_tied', 4: 'remnant_reject',
      5: 'weaver_cornered', 6: 'plotter_broken2',
      7: 'setter_broken2'
    };
    const scene = cornerScenes[chId];
    if (scene && typeof StoryEngine !== 'undefined' && !StoryEngine.isPlaying) {
      StoryEngine.playScene(scene);
    }
  }
}

function _onStoryWrong() {
  _storyComboCount = 0;
}

function _onStoryComplete() {
  if (_storyBossDefeatDone) return;
  _storyBossDefeatDone = true;

  const chId = _detectStoryChapter(currentLevelId);
  const bossId = _getBossIdForChapter(chId);
  const isBoss = _isBossLevel(currentLevelId);

  if (chId === 7) {
    // 终章：finalVictory会自己处理结局演出+结局字幕+跳转
    if (typeof StoryEngine !== 'undefined') {
      StoryEngine.finalVictory(() => {
        // 结局演出结束后，颁发终章徽章
        if (currentChapterData && currentChapterData.badge) {
          const badgeData = currentChapterData.badge;
          if (typeof Storage !== 'undefined' && !Storage.hasBadge(badgeData.id)) {
            Storage.unlockBadge(badgeData.id, { name: badgeData.name });
            if (storyManager && storyManager.badgeAward) {
              storyManager.badgeAward.show(badgeData);
            }
          }
        }
      });
    }
    _isFinalChapter = true; // 标记终章，跳过普通弹窗
  } else if (isBoss && bossId && typeof StoryEngine !== 'undefined') {
    // Boss击败
    StoryEngine.bossDefeat(bossId, () => {
      setTimeout(() => StoryEngine.playScene('clear_level'), 300);
    });
  } else {
    // 普通关通关：只播放通关音效和金色闪光，不播放"恭喜通关"语音
    if (typeof StoryEngine !== 'undefined') {
      if (typeof Effects !== 'undefined') {
        Effects.triggerLevel(4, { type: 'flash' });
      }
    }
    if (typeof AudioManager !== 'undefined') AudioManager.playWin();
  }
}

/**
 * preDialog播放完成后的处理：检查是否为Boss关卡或技巧教学关
 */
function onPreDialogComplete() {
  // 检查是否为Boss关卡（通过BOSS_CONFIGS或关卡数据isBoss字段）
  const bossConfig = (typeof BOSS_CONFIGS !== 'undefined') ? BOSS_CONFIGS[currentLevelId] : null;
  const levelIsBoss = currentLevelData && currentLevelData.isBoss === true;
  if (bossConfig) {
    startBossBattle(bossConfig);
  } else if (levelIsBoss) {
    // 使用默认Boss配置
    startBossBattle({
      name: '神秘对手',
      avatar: 'assets/images/shadow-avatar.webp',
      color: '#a855f7',
      speedMin: 2000, speedMax: 4000,
      mistakeChance: 0.05,
      fillStyle: 'normal',
      personality: '未知的对手',
      preDialog: [{ speaker: '神秘对手', text: '来吧。' }],
      winDialog: [{ speaker: '神秘对手', text: '你赢了。' }],
      warningLines: ['对手快要完成了！'],
      encounterLines: {
        far: [{ text: '……', intensity: 'light' }],
        mid: [{ text: '你不错。', intensity: 'medium' }],
        near: [{ text: '最后一步了。', intensity: 'strong' }]
      }
    });
  } else {
    // 第104关：唯一组合口诀教学 - 触发小抄卷轴剧情
    const numId = parseInt(currentLevelId);
    if (numId === 104 && typeof ComedySystem !== 'undefined') {
      const cheatSeenKey = 'killersudoku_cheatsheet_104_seen';
      const hasSeenCheat = localStorage.getItem(cheatSeenKey) === '1';
      if (!hasSeenCheat) {
        localStorage.setItem(cheatSeenKey, '1');
        ComedySystem.showCheatSheetStory(() => {
          initGuideManager();
        });
        return;
      }
      // 已看过剧情，直接显示小抄
      ComedySystem.showCheatSheet();
    }

    // 检查是否为高级技巧教学关卡
    const tutorialKey = _getTutorialKey(currentLevelId);
    const tutorialSeenKey = `killersudoku_tutorial_seen_${currentLevelId}`;
    let hasSeenTutorial = false;
    try { hasSeenTutorial = localStorage.getItem(tutorialSeenKey) === 'true'; } catch(e) {}

    if (tutorialKey && !hasSeenTutorial && typeof TechniqueTutorial !== 'undefined' && TECHNIQUE_TUTORIALS[tutorialKey]) {
      // 首次进入技巧教学关，播放可视化教程
      try { localStorage.setItem(tutorialSeenKey, 'true'); } catch(e) {}
      const tutorial = new TechniqueTutorial();
      tutorial.start(TECHNIQUE_TUTORIALS[tutorialKey], () => {
        tutorial.destroy();
        initGuideManager();
      });
    } else {
      initGuideManager();
    }
  }
}

/**
 * 根据关卡ID获取对应的教程key
 */
function _getTutorialKey(levelId) {
  const id = parseInt(levelId);
  const tutorialMap = {
    701: 'naked_pair',
    702: 'hidden_pair',
    703: 'triple',
    704: '二连纵横阵',
    705: 'swordfish'
  };
  return tutorialMap[id] || null;
}

/**
 * 启动Boss战
 */
function startBossBattle(bossConfig) {
  // 播放Boss战前对话（使用StoryEngine大立绘演出）
  const preBattleDialog = bossConfig.preDialog || [
    { speaker: bossConfig.name, text: '来吧，和我一决高下！' }
  ];

  // 优先使用StoryEngine大立绘
  if (typeof StoryEngine !== 'undefined' && StoryEngine.sayLines) {
    StoryEngine.sayLines(preBattleDialog, () => {
      _initBattleAndStart(bossConfig);
    });
    return;
  }

  // 降级到StoryModal
  if (storyManager && storyManager.modal) {
    storyManager.modal.play(preBattleDialog, () => {
      _initBattleAndStart(bossConfig);
    });
    return;
  }

  // 都不可用，直接开始
  _initBattleAndStart(bossConfig);
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

  // 切换到Boss战悬疑BGM（优先使用MidiBGM引擎）
  if (typeof BGMEngine !== 'undefined') {
    BGMEngine.playBossBattle();
  } else if (typeof AudioManager !== 'undefined' && AudioManager.startBossBGM) {
    AudioManager.stopBGM();
    setTimeout(() => AudioManager.startBossBGM(), 300);
  }

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

  // 首次开局显示规则弹窗，之后显示倒计时
  _showBattleRules(bossConfig);
}

/**
 * 处理Boss战事件（遭遇、预警、抢格子等）
 */
function _handleBattleEvent(type, data, bossConfig) {
  const hasAudio = typeof AudioManager !== 'undefined';
  switch (type) {
    case 'raceStart':
      // 开赛！全屏闪白+强震动+音效
      _showRaceStartFlash();
      _vibrate([100, 50, 100, 50, 200]);
      if (hasAudio && AudioManager.playBattleStart) {
        AudioManager.playBattleStart();
      }
      break;
    case 'aiFill':
      // AI填了一格——极轻微震动+幽灵音效（感知对手在动）
      _vibrate(10);
      if (hasAudio && AudioManager.playAiFill) {
        AudioManager.playAiFill();
      }
      break;
    case 'restart':
      // 重试：显示倒计时
      setTimeout(() => _showBattleCountdown(), 300);
      break;
    case 'discover':
      // 保留事件兼容性，不再显示提示
      _vibrate(15);
      if (hasAudio && AudioManager.playFogReveal) {
        AudioManager.playFogReveal();
      }
      break;
    case 'tip':
      // 引导提示气泡
      _showBattleTip(data);
      break;
    case 'encounter':
      _showEncounterToast(data, bossConfig);
      _vibrate(data.level === 'near' ? [80, 40, 80] : data.level === 'mid' ? [40] : [15]);
      if (hasAudio && AudioManager.playEncounter) {
        AudioManager.playEncounter(data.level);
      }
      break;
    case 'warning':
      if (data.who === 'ai') {
        const lines = bossConfig.warningLines || ['对手快赢了！'];
        const line = lines[Math.floor(Math.random() * lines.length)];
        _showBattleToast(line, 'strong', 2500);
        _vibrate([100, 50, 100, 50, 100]);
        if (hasAudio && AudioManager.playWarning) {
          AudioManager.playWarning();
        }
      } else {
        _showBattleToast('你快赢了，加油！', 'medium', 2000);
      }
      break;
    case 'steal':
      _showBattleToast('抢到一格！', 'light', 1000);
      _vibrate([30, 20, 30]);
      if (hasAudio && AudioManager.playSteal) {
        AudioManager.playSteal();
      }
      break;
    case 'wrong':
      _vibrate([50, 30, 50]);
      if (hasAudio && AudioManager.playWrong) {
        AudioManager.playWrong();
      }
      break;
  }
}

/**
 * 开赛全屏闪白效果
 */
function _showRaceStartFlash() {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: white; z-index: 10000; pointer-events: none;
    opacity: 0; transition: opacity 0.15s ease-out;
  `;
  document.body.appendChild(flash);
  requestAnimationFrame(() => {
    flash.style.opacity = '0.6';
    requestAnimationFrame(() => {
      flash.style.transition = 'opacity 0.4s ease-out';
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 500);
    });
  });

  // 棋盘短暂震动
  const canvas = document.getElementById('gameCanvas');
  if (canvas) {
    canvas.style.transition = 'transform 0.1s';
    canvas.style.transform = 'scale(0.98)';
    setTimeout(() => { canvas.style.transform = 'scale(1)'; }, 100);
    setTimeout(() => { canvas.style.transition = ''; }, 300);
  }
}

/**
 * 显示对战引导提示气泡
 */
function _showBattleTip(data) {
  // 移除已有的提示气泡（最多同时显示1个）
  const existing = document.querySelector('.battle-tip-bubble');
  if (existing) existing.remove();

  const bubble = document.createElement('div');
  bubble.className = 'battle-tip-bubble';
  bubble.innerHTML = `
    <div class="tip-icon">${data.icon || '💡'}</div>
    <div class="tip-content">
      <div class="tip-title">${data.title || '提示'}</div>
      <div class="tip-text">${data.text || ''}</div>
    </div>
    <button class="tip-close">×</button>
  `;
  document.body.appendChild(bubble);

  // 入场动画
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bubble.classList.add('show');
    });
  });

  // 点击关闭
  const close = () => {
    bubble.classList.remove('show');
    bubble.classList.add('hide');
    setTimeout(() => bubble.remove(), 300);
  };
  bubble.querySelector('.tip-close').addEventListener('click', close);

  // 自动关闭（不同提示时长不同）
  const duration = data.duration || 5000;
  setTimeout(close, duration);
}

/**
 * 显示遭遇事件台词气泡
 */
function _showEncounterToast(data, bossConfig) {
  const lines = bossConfig.encounterLines;
  if (!lines || !lines[data.level]) return;

  // 支持数组（随机选一条）或单条对象
  const raw = lines[data.level];
  const line = Array.isArray(raw) ? raw[Math.floor(Math.random() * raw.length)] : raw;
  if (!line) return;
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
 * 优先使用 AudioManager.vibrate()，fallback 到本地 navigator.vibrate
 */
function _vibrate(pattern) {
  if (typeof AudioManager !== 'undefined' && typeof AudioManager.vibrate === 'function') {
    AudioManager.vibrate(pattern);
  } else if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

/**
 * 获取当前Boss配置
 */
function _getCurrentBossConfig() {
  return (typeof BOSS_CONFIGS !== 'undefined') ? BOSS_CONFIGS[currentLevelId] : null;
}

/**
 * 显示对战规则弹窗（首次开局前）
 */
function _showBattleRules(bossConfig) {
  const overlay = document.createElement('div');
  overlay.id = 'boss-rules-overlay';
  overlay.innerHTML = `
    <div class="battle-rules-card">
      <div class="rules-title">⚔️ 迷雾对战规则</div>
      <div class="rules-subtitle">vs ${bossConfig.avatar} ${bossConfig.name}</div>
      <div class="rules-list">
        <div class="rule-item">
          <div class="rule-icon">🌫️</div>
          <div class="rule-text">
            <div class="rule-name">迷雾遮笼</div>
            <div class="rule-desc">所有数字始终清晰可见！但笼子的虚线边框和蓝色和值徽章在雾中被隐藏，需要靠近才能看到笼子的形状和和值。用可见数字推理，填对数字扩展视野揭开笼子线索！</div>
          </div>
        </div>
        <div class="rule-item">
          <div class="rule-icon">🔦</div>
          <div class="rule-text">
            <div class="rule-name">拓荒揭笼</div>
            <div class="rule-desc">每填对一个数字，周围迷雾散开，露出附近笼子的边框和和值。填对越多，可见线索越多！</div>
          </div>
        </div>
        <div class="rule-item">
          <div class="rule-icon">👻</div>
          <div class="rule-text">
            <div class="rule-name">幽灵对手</div>
            <div class="rule-desc">${bossConfig.name}在雾中和你抢填！雾中闪烁的红色方块是TA的幽灵格，填对同一格就能抢过来。先填到75%者胜！</div>
          </div>
        </div>
        <div class="rule-item">
          <div class="rule-icon">⚠️</div>
          <div class="rule-text">
            <div class="rule-name">60%预警</div>
            <div class="rule-desc">当对方进度达到60%时，屏幕边缘会闪红警告——这是你最后的追赶机会！</div>
          </div>
        </div>
      </div>
      <button class="rules-start-btn" id="rules-start-btn">开始对战</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // 入场动画
  requestAnimationFrame(() => {
    overlay.classList.add('show');
  });

  const startBtn = overlay.querySelector('#rules-start-btn');
  const dismiss = () => {
    overlay.classList.add('hide');
    setTimeout(() => overlay.remove(), 400);
    _showBattleCountdown();
  };
  startBtn.addEventListener('click', dismiss);
}

/**
 * 显示Boss战倒计时提示
 */
function _showBattleCountdown() {
  const bossConfig = _getCurrentBossConfig();
  // 处理Boss头像：图片路径 vs emoji
  let bossAvatarHtml = '👤';
  if (bossConfig && bossConfig.avatar) {
    if (bossConfig.avatar.endsWith('.png') || bossConfig.avatar.endsWith('.jpg') || bossConfig.avatar.endsWith('.webp')) {
      bossAvatarHtml = `<img src="${bossConfig.avatar}" style="width:56px;height:56px;object-fit:cover;border-radius:50%;border:2px solid ${bossConfig.color || '#ef4444'}80;" onerror="if(!this._fb1){this._fb1=1;this.src=this.src.replace(/\\.webp$/,'.jpg');}else if(!this._fb2){this._fb2=1;this.src=this.src.replace(/\\.jpg$/,'.png').replace(/\\.webp$/,'.png');}else{this.style.display='none'}">`;
    } else {
      bossAvatarHtml = bossConfig.avatar;
    }
  }
  const overlay = document.createElement('div');
  overlay.id = 'boss-countdown-overlay';
  overlay.innerHTML = `
    <div class="countdown-vs">
      <div class="countdown-side countdown-player">
        <div class="countdown-avatar">🔍</div>
        <div class="countdown-name">你</div>
      </div>
      <div class="countdown-vs-text">VS</div>
      <div class="countdown-side countdown-boss">
        <div class="countdown-avatar">${bossAvatarHtml}</div>
        <div class="countdown-name" style="color:${bossConfig ? bossConfig.color : '#ef4444'}">${bossConfig ? bossConfig.name : '对手'}</div>
      </div>
    </div>
    <div class="countdown-number" id="countdown-num">3</div>
    <div class="countdown-hint">在迷雾中竞速，先填到75%者胜</div>
  `;
  document.body.appendChild(overlay);

  // 入场动画
  requestAnimationFrame(() => {
    overlay.classList.add('show');
  });

  let count = 3;
  const numEl = overlay.querySelector('#countdown-num');

  // 每个数字的弹跳动画
  const pulseNumber = () => {
    numEl.classList.remove('pulse');
    void numEl.offsetWidth; // 强制reflow
    numEl.classList.add('pulse');
    _vibrate(20);
  };
  pulseNumber();

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
      pulseNumber();
    } else if (count === 0) {
      numEl.textContent = '开始！';
      numEl.classList.add('go');
      numEl.classList.remove('pulse');
      _vibrate([50, 30, 100]);
    } else {
      clearInterval(interval);
      overlay.classList.add('hide');
      setTimeout(() => overlay.remove(), 400);
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
  // 先停止Boss战，移除进度条等UI（无论active状态，ended状态也清理）
  if (GuideBattle && (GuideBattle.active || GuideBattle.ended)) {
    GuideBattle.stop();
  }
  document.body.classList.remove('boss-battle-active');

  // 停止Boss战BGM，恢复章节BGM
  if (typeof BGMEngine !== 'undefined') {
    BGMEngine.stop();
    if (result === 'win') {
      setTimeout(() => BGMEngine.playVictory(), 500);
    }
  } else if (typeof AudioManager !== 'undefined' && AudioManager.stopBossBGM) {
    AudioManager.stopBossBGM();
  }

  if (result === 'win') {
    // 胜利：播放胜利对话，然后进入正常通关流程
    const winDialog = bossConfig.winDialog || [
      { speaker: '阿岩', text: '赢了！' }
    ];
    // 优先使用StoryEngine大立绘
    if (typeof StoryEngine !== 'undefined' && StoryEngine.sayLines) {
      StoryEngine.sayLines(winDialog, () => {
        markComplete();
      });
    } else if (storyManager && storyManager.modal) {
      storyManager.modal.play(winDialog, () => {
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
  // 使用新StoryEngine播放前置对话（带立绘+打字机效果）
  if (typeof StoryEngine !== 'undefined') {
    StoryEngine.sayLines(preDialog, onComplete);
  } else if (storyManager && storyManager.modal) {
    const dialogues = normalizeDialogues(preDialog);
    storyManager.modal.play(dialogues, onComplete);
  } else {
    if (onComplete) onComplete();
  }
}

// ---------- 标记通关 ----------
function markComplete() {
  isCompleted = true;
  clearInterval(timerInterval);

  // 逆转裁判式通关演出（会设置_isFinalChapter标志）
  _onStoryComplete();

  // 终章标志
  const isFinal = _isFinalChapter;

  // 引导系统：通关触发
  guide_onLevelComplete();

  // 计算星星数（根据用时）
  const stars = calculateStars(elapsedSeconds, currentGridSize);

  // 喜剧系统：评分
  let gradeInfo = { stars, grade: stars === 3 ? 'A' : stars === 2 ? 'B' : 'C' };
  if (typeof ComedySystem !== 'undefined') {
    const baseTime = currentGridSize === 4 ? 120 : currentGridSize === 6 ? 240 : 420;
    const mistakes = ComedySystem.state.totalWrong;
    const ratio = elapsedSeconds / baseTime;
    if (ratio < 0.4 && mistakes === 0) gradeInfo = { stars: 3, grade: 'SSS', mistakes };
    else if (ratio < 0.7 && mistakes <= 3) gradeInfo = { stars: 3, grade: 'S', mistakes };
    else if (ratio <= 1.0 && mistakes <= 5) gradeInfo = { stars: 3, grade: 'A', mistakes };
    else if (ratio <= 1.5 || mistakes <= 8) gradeInfo = { stars: 2, grade: 'B', mistakes };
    else gradeInfo = { stars: 1, grade: 'C', mistakes };

    const isBoss = currentLevelData && (currentLevelData.isBoss || (typeof BOSS_CONFIGS !== 'undefined' && BOSS_CONFIGS[currentLevelId]));
    ComedySystem.onComplete({
      expectedSec: currentGridSize === 4 ? 120 : currentGridSize === 6 ? 240 : 420
    });
    // S级连关彩蛋
    if (typeof ComedySystem.onSGradeStreak === 'function') {
      ComedySystem.onSGradeStreak(gradeInfo.grade);
    }
    // Boss战吐槽由guide-battle.js在战⽃结束回调中处理（时机更准）
  }

  // 保存通关记录
  if (typeof Storage !== 'undefined') {
    Storage.markTeachingComplete(currentLevelId, {
      time: elapsedSeconds,
      stars: stars
    });
    Storage.clearTeachingProgress(currentLevelId);
    updateChapterProgress();
  }

  // 显示通关弹窗
  const overlay = document.getElementById('complete-overlay');
  const timeEl = document.getElementById('complete-time');
  const starsEl = document.getElementById('complete-stars');
  const gradeEl = document.getElementById('complete-grade');

  if (timeEl) timeEl.textContent = t('ui.complete.timeUsed', { time: formatTime(elapsedSeconds) });
  if (starsEl) {
    starsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.className = i < gradeInfo.stars ? 'star-on' : 'star-off';
      s.textContent = '★';
      starsEl.appendChild(s);
    }
  }
  if (gradeEl) {
    gradeEl.textContent = gradeInfo.grade;
    gradeEl.className = 'complete-grade-badge grade-' + gradeInfo.grade;
  }

  // 档案碎片奖励（Boss关和首次通关关键关获得）
  const fragmentEl = document.getElementById('complete-fragment');
  const isBoss = currentLevelData && (currentLevelData.isBoss || (typeof BOSS_CONFIGS !== 'undefined' && BOSS_CONFIGS[currentLevelId]));
  const isKeyLevel = isBoss || (parseInt(currentLevelId) % 100 <= 3); // 每章前3关和Boss关给碎片
  if (fragmentEl && isKeyLevel) {
    fragmentEl.style.display = 'flex';
    // 存储碎片收集进度
    try {
      const fragments = JSON.parse(localStorage.getItem('killersudoku_fragments') || '{}');
      const chKey = 'ch' + _detectStoryChapter(currentLevelId);
      fragments[chKey] = (fragments[chKey] || 0) + 1;
      localStorage.setItem('killersudoku_fragments', JSON.stringify(fragments));
    } catch(e) {}
  } else if (fragmentEl) {
    fragmentEl.style.display = 'none';
  }

  // 守笼人评语
  const commentEl = document.getElementById('complete-comment');
  const commentText = document.getElementById('complete-comment-text');
  if (commentEl && commentText && typeof ComedySystem !== 'undefined') {
    setTimeout(() => {
      const baseTime = currentGridSize === 4 ? 60 : currentGridSize === 6 ? 180 : 360;
      const mistakes = (gradeInfo.mistakes != null) ? gradeInfo.mistakes : (ComedySystem.state ? ComedySystem.state.totalWrong : 0);
      const ratio = elapsedSeconds / baseTime;
      let commentKey = 'comedy.keeper.grade' + gradeInfo.grade;
      if (ratio < 0.3 && mistakes === 0) commentKey = 'comedy.keeper.tooFast';
      else if (mistakes === 0 && gradeInfo.grade !== 'SSS') commentKey = 'comedy.keeper.perfectClear';
      const isBoss = currentLevelData && (currentLevelData.isBoss || (typeof BOSS_CONFIGS !== 'undefined' && BOSS_CONFIGS[currentLevelId]));
      if (isBoss && gradeInfo.grade !== 'SSS' && gradeInfo.grade !== 'S') commentKey = 'comedy.keeper.bossDefeated';
      let lines = null;
      if (typeof I18N !== 'undefined' && I18N.getRaw) lines = I18N.getRaw(commentKey);
      else if (typeof t === 'function') lines = t(commentKey);
      if (Array.isArray(lines) && lines.length > 0) {
        commentText.textContent = lines[Math.floor(Math.random() * lines.length)];
      } else {
        commentText.textContent = '中规中矩，算你过关。';
      }
      commentEl.style.display = 'block';
    }, 1000);
  }

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
        // 使用新StoryEngine播放通关对话（带立绘+打字机效果）
        if (typeof StoryEngine !== 'undefined') {
          StoryEngine.sayLines(clearDialog, playEndingThenOverlay);
        } else {
          const dialogues = normalizeDialogues(clearDialog);
          storyManager.modal.play(dialogues, playEndingThenOverlay);
        }
      }, 600);
    } else {
      playEndingThenOverlay();
    }
  };

  // 终章：finalVictory自己处理结局演出+字幕+跳转，不弹普通通关弹窗
  if (isFinal) {
    // 但仍然需要保存通关记录
    if (typeof Storage !== 'undefined') {
      Storage.markTeachingComplete(currentLevelId, {
        time: elapsedSeconds,
        stars: gradeInfo.stars
      });
      Storage.clearTeachingProgress(currentLevelId);
      updateChapterProgress();
    }
    return;
  }

  if (shouldPlayClear || shouldPlayEnding) {
    if (overlay) overlay.classList.add('active');
    setTimeout(playClearThenEnding, 800);
  } else {
    showOverlay();
  }
}

// 计算星星数
function calculateStars(seconds, size) {
  // 基准时间与ComedySystem一致：4x4=120秒，6x6=240秒，9x9=420秒
  const baseTime = size === 4 ? 120 : size === 6 ? 240 : 420;
  const ratio = seconds / baseTime;
  if (ratio <= 1.0) return 3;
  if (ratio <= 1.5) return 2;
  return 1;
}

// 更新章节进度
function updateChapterProgress() {
  // 章节进度由 Storage 自动管理，这里触发一次保存
  // 实际的章节进度统计在 chapter-levels 页面计算
}

// 检查并解锁徽章
function checkAndUnlockBadge() {
  // 章末徽章由 playChapterEnding 在结局剧情后颁发
  // 这里做备用检查：如果当前章节的徽章尚未获得且已通关最后一关，则补发
  if (!currentChapterData || !currentChapterData.badge) return;
  const badgeData = currentChapterData.badge;
  if (typeof Storage === 'undefined' || Storage.hasBadge(badgeData.id)) return;

  // 检查是否通关了最后一关
  const levels = currentChapterData.levels || [];
  if (levels.length === 0) return;
  const lastLevel = levels[levels.length - 1];
  const lastLevelId = String(lastLevel.levelId);
  if (Storage.isTeachingLevelCompleted(lastLevelId)) {
    Storage.unlockBadge(badgeData.id, { name: badgeData.name });
  }
}

// ---------- 通关弹窗按钮绑定 ----------
function bindCompleteOverlay() {
  const backBtn = document.getElementById('btn-complete-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      window.location.href = 'chapter-levels.html?id=' + currentChapterId;
    });
  }

  // 微练习按钮：跳转到自由选关，根据当前章节自动匹配难度
  const practiceBtn = document.getElementById('btn-complete-practice');
  if (practiceBtn) {
    practiceBtn.addEventListener('click', () => {
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      const diffLevel = currentChapterId || 1;
      // 第1章→简单, 2-3→中等, 4-5→困难, 6-7→地狱
      const diffMap = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4 };
      window.location.href = `free-play.html?mode=killer&focus=${diffMap[diffLevel] || 1}`;
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
        if (typeof AudioManager !== 'undefined') AudioManager.playClick();
        window.location.href = 'chapter-levels.html?id=' + currentChapterId;
      });
    } else {
      nextBtn.addEventListener('click', () => {
        if (typeof AudioManager !== 'undefined') AudioManager.playClick();
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
    // 降级：根据章节ID推算最大关卡数（仅在currentChapterData未加载时使用）
    const chapterId = Math.floor(levelId / 100);
    const levelNum = levelId % 100;
    // 各章实际关卡数：第1章10关(100-109含教学0关和Boss)，第2章8关(201-208)，第3章7关(301-307)，第4-7章各6关
    const maxLevels = { 1: 9, 2: 8, 3: 7, 4: 6, 5: 6, 6: 6, 7: 6 };
    const minLevel = chapterId === 1 ? 0 : 1;
    const max = maxLevels[chapterId] || 9;
    return levelNum >= minLevel && levelNum <= max;
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

  canvas.addEventListener('mousedown', function(e) {
    if (isPaused) return;
    isMouseDown = true;
    mouseMoved = false;
    mouseStartPos = { x: e.clientX, y: e.clientY };
    lastMousePos = { x: e.clientX, y: e.clientY };
    mouseLongPressTriggered = false;
    mouseDeepLongPressTriggered = false;
    
    // 设置长按定时器（仅在杀手数独中触发罗盘）
    if (currentGridSize === 9 && guideBoard.cages && guideBoard.cages.length > 0 && features.allowDraft) {
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

  canvas.addEventListener('mousemove', function(e) {
    if (isPaused || !isMouseDown) return;
    lastMousePos = { x: e.clientX, y: e.clientY };
    const dx = Math.abs(e.clientX - mouseStartPos.x);
    const dy = Math.abs(e.clientY - mouseStartPos.y);
    if (dx > 5 || dy > 5) {
      mouseMoved = true;
      // 移动了就取消长按
      clearMouseLongPress();
      // 如果罗盘已经显示，隐藏它
      if (mouseLongPressTriggered && !mouseDeepLongPressTriggered && _compassMode.longPressActive) {
        hideRule45Compass();
        _compassMode.longPressActive = false;
        _compassMode.lpCell = null;
      }
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
    
    if (mouseMoved && guideBoard.isBoxSelecting) {
      guideBoard.endBoxSelect();
      mouseMoved = false;
      mouseStartPos = null;
      lastMousePos = null;
      refreshBoard();
    } else {
      handleCanvasTap(e.clientX, e.clientY);
    }
    mouseStartPos = null;
    lastMousePos = null;
  });

  canvas.addEventListener('mouseleave', function(e) {
    clearMouseLongPress();
    if (mouseLongPressTriggered && !mouseDeepLongPressTriggered && _compassMode.longPressActive) {
      hideRule45Compass();
      _compassMode.longPressActive = false;
      _compassMode.lpCell = null;
    }
    if (isMouseDown && guideBoard.isBoxSelecting) {
      guideBoard.endBoxSelect();
      refreshBoard();
    }
    isMouseDown = false;
    mouseMoved = false;
    mouseStartPos = null;
    lastMousePos = null;
    mouseLongPressTriggered = false;
    mouseDeepLongPressTriggered = false;
  });

  // 触摸事件
  let touchStartPos = null;
  let touchBoxSelectTriggered = false;
  let longPressTimer = null;
  let deepLongPressTimer = null;
  let longPressTriggered = false;
  let deepLongPressTriggered = false;
  let longPressStartPos = null;
  let lastTouchPos = null;
  const LONG_PRESS_DURATION = 450;       // 短长按：触发星衡法则罗盘
  const DEEP_LONG_PRESS_DURATION = 900;  // 超长按：切换笔记模式

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

    if (longPressTimer) clearTimeout(longPressTimer);
    if (deepLongPressTimer) clearTimeout(deepLongPressTimer);
    
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

  canvas.addEventListener('touchmove', function(e) {
    if (isPaused) return;
    e.preventDefault();
    const touch = e.touches[0];
    lastTouchPos = { x: touch.clientX, y: touch.clientY };

    if (longPressStartPos) {
      const dx = Math.abs(touch.clientX - longPressStartPos.x);
      const dy = Math.abs(touch.clientY - longPressStartPos.y);
      if (dx > 10 || dy > 10) {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (deepLongPressTimer) {
          clearTimeout(deepLongPressTimer);
          deepLongPressTimer = null;
        }
        // 如果长按罗盘已经显示但还没到超长按，移动手指时隐藏罗盘
        if (longPressTriggered && !deepLongPressTriggered && _compassMode.longPressActive) {
          hideRule45Compass();
          _compassMode.longPressActive = false;
          _compassMode.lpCell = null;
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
        if (deepLongPressTimer) {
          clearTimeout(deepLongPressTimer);
          deepLongPressTimer = null;
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
    if (deepLongPressTimer) {
      clearTimeout(deepLongPressTimer);
      deepLongPressTimer = null;
    }
    
    // 如果是长按触发的罗盘（还没到超长按），松手时隐藏罗盘
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

    if (guideBoard.isBoxSelecting) {
      guideBoard.endBoxSelect();
      touchBoxSelectTriggered = false;
      touchStartPos = null;
      longPressTriggered = false;
      deepLongPressTriggered = false;
      longPressStartPos = null;
      lastTouchPos = null;
      refreshBoard();
      return;
    }

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
  
  // 罗盘模式：点击宫/行/列显示星衡法则罗盘
  if (_compassMode.active) {
    showRule45Compass(r, c);
    return;
  }
  
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

  if (typeof AudioManager !== 'undefined') {
    AudioManager.vibrate('tap');
  } else if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  // 使用和getCellFromPos一致的坐标计算
  const { r, c } = getCellFromPos(clientX, clientY);

  // 如果是9x9杀手数独，第一阶段长按先触发星衡法则罗盘（神兵利器·快速看破）
  if (currentGridSize === 9 && guideBoard.cages && guideBoard.cages.length > 0) {
    _compassMode.longPressActive = true;
    _compassMode.lpCell = [r, c];
    showRule45Compass(r, c);
    return; // 先显示罗盘，更长的按才切换笔记模式
  }

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

/**
 * 超长按（更深的长按）：切换笔记模式
 * 当用户在罗盘显示后继续按住不放，达到更长时间后触发
 */
function handleDeepLongPress(clientX, clientY) {
  if (!features.allowDraft) return;
  
  const { r, c } = getCellFromPos(clientX, clientY);
  
  // 隐藏罗盘
  hideRule45Compass();
  _compassMode.longPressActive = false;
  _compassMode.lpCell = null;
  
  if (typeof AudioManager !== 'undefined') {
    AudioManager.vibrate('heavy');
  } else if (navigator.vibrate) {
    navigator.vibrate(80);
  }
  
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
  // 多选时，批量切换笔记
  if (guideBoard.selectedCells.length > 1) {
    if (features.allowDraft) {
      guideBoard.toggleCandidateForSelection(num);
    }
  } else if (guideBoard.inputMode === 'candidate' && features.allowDraft) {
    // 笔记模式：使用getActiveCell()可靠获取选中格
    const selectedCell = guideBoard.getActiveCell();
    if (!selectedCell) {
      // 笔记模式下没有选中格子，提示用户并切回普通模式
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

    // 填数前：记录技巧检测所需的状态
    if (typeof TechniqueFeedback !== 'undefined') {
      TechniqueFeedback.recordBeforeState(guideBoard, r, c);
    }

    guideBoard.setNumber(num);
    const newVal = guideBoard.cells[r][c].fillNum;
    // 只有真正填入了新数字才触发
    if (newVal && newVal !== oldVal) {
      guide_onNumberFilled(r, c, newVal);

      // 智能技巧识别反馈
      if (typeof TechniqueFeedback !== 'undefined') {
        TechniqueFeedback.onNumberFilled(guideBoard, r, c, newVal);
      }

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

  // 喜剧系统：检测填对/填错
  if (typeof ComedySystem !== 'undefined') {
    const selectedCell = guideBoard.getActiveCell();
    if (selectedCell) {
      const cell = guideBoard.cells[selectedCell.r][selectedCell.c];
      if (cell.isError) {
        ComedySystem.onWrong(selectedCell.r, selectedCell.c, num);
      } else if (cell.fillNum === num) {
        ComedySystem.onCorrect(selectedCell.r, selectedCell.c, num);
      }
    }
  }

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
      if (typeof AudioManager !== 'undefined') {
        AudioManager.playClick();
        if (typeof AudioManager.vibrate === 'function') AudioManager.vibrate('click');
      }
      guideBoard.undo();
      refreshBoard();
    });
  }

  // 擦除
  const eraseBtn = document.getElementById('btn-erase');
  if (eraseBtn) {
    eraseBtn.addEventListener('click', () => {
      if (isPaused) return;
      if (typeof AudioManager !== 'undefined') {
        AudioManager.playErase();
        AudioManager.vibrate('erase');
      }
      if (guideBoard.selectedCells.length > 1) {
        guideBoard.eraseSelection();
      } else if (guideBoard.selectedCell) {
        guideBoard.eraseNumber();
      }
      guideBoard.checkConflicts();
      if (typeof ComedySystem !== 'undefined') ComedySystem.onErase();
      refreshBoard();
    });
  }

  // 笔记模式切换
  const candidateBtn = document.getElementById('btn-candidate');
  if (candidateBtn) {
    candidateBtn.addEventListener('click', () => {
      if (isPaused) return;
      if (typeof AudioManager !== 'undefined') {
        AudioManager.playClick();
        if (typeof AudioManager.vibrate === 'function') AudioManager.vibrate('click');
      }
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

  // 自动填充笔记（新手辅助）
  const autoCandsBtn = document.getElementById('btn-auto-cands');
  if (autoCandsBtn) {
    autoCandsBtn.addEventListener('click', () => {
      if (isPaused) return;
      if (typeof AudioManager !== 'undefined') {
        AudioManager.playClick();
        if (typeof AudioManager.vibrate === 'function') AudioManager.vibrate('click');
      }
      if (!features.allowDraft) return;
      const count = guideBoard.autoFillCandidates();
      if (count > 0) {
        showToast(`🔢 已自动为 ${count} 个空格填入理论笔记`);
        // 确保切换到笔记模式显示笔记
        if (guideBoard.inputMode !== 'candidate') {
          guideBoard.inputMode = 'candidate';
          const candBtn = document.getElementById('btn-candidate');
          if (candBtn) {
            candBtn.style.backgroundColor = '#3b82f6';
            candBtn.style.color = 'white';
          }
        }
        guideBoard.checkConflicts();
        refreshBoard();
      } else {
        showToast('🔢 没有需要填笔记的空格');
      }
    });
  }

  // 提示
  const hintBtn = document.getElementById('btn-hint');
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      if (isPaused) return;
      if (typeof AudioManager !== 'undefined') {
        AudioManager.playClick();
        if (typeof AudioManager.vibrate === 'function') AudioManager.vibrate('click');
      }
      if (!features.showHints) return;
      handleHint();
    });
  }

  // 星衡法则
  const rule45Btn = document.getElementById('btn-45rule');
  if (rule45Btn) {
    rule45Btn.addEventListener('click', () => {
      if (isPaused) return;
      if (typeof AudioManager !== 'undefined') {
        AudioManager.playClick();
        if (typeof AudioManager.vibrate === 'function') AudioManager.vibrate('click');
      }
      if (!features.assistant45) return;
      // 切换罗盘模式
      toggleCompassMode();
    });
  }

  // 设置
  const settingBtn = document.getElementById('btn-setting');
  if (settingBtn) {
    settingBtn.addEventListener('click', () => {
      if (isPaused) return;
      if (typeof AudioManager !== 'undefined') {
        AudioManager.playClick();
        if (typeof AudioManager.vibrate === 'function') AudioManager.vibrate('click');
      }
      toggleSettings();
    });
  }

  // 重来
  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (isPaused) {
        togglePause();
      }
      if (typeof AudioManager !== 'undefined') {
        AudioManager.playClick();
        if (typeof AudioManager.vibrate === 'function') AudioManager.vibrate('click');
      }
      if (typeof ComedySystem !== 'undefined') ComedySystem.onReset();
      confirmRestart();
    });
  }
}

// ---------- 提示系统（智能分级） ----------
// 根据hint难度自动调整提示深度：
//   easy（简单）：   2步搞定 → 高亮 → 答案
//   medium（中等）： 3步 → 高亮 → 思路 → 答案
//   hard（困难）：   4步 → 观察 → 笼子组合 → 推理 → 答案
function handleHint() {
  hintStep++;
  _isHintShowing = true;
  if (typeof ComedySystem !== 'undefined') ComedySystem.onHint(hintStep);

  // 第1步：获取hint（所有难度的第1步都是高亮目标格+区域）
  if (hintStep === 1) {
    currentHint = guideBoard.showHint(2);
    if (!currentHint) {
      hintStep = 0;
      _isHintShowing = false;
      showToast(t('hint.noHint'));
      return;
    }
    
    const difficulty = currentHint.difficulty || 'easy';
    const regionNames = { row: '这一行', col: '这一列', box: '这个宫', cage: '这个笼子' };
    const regionName = regionNames[currentHint.regionType] || '这个区域';
    
    if (difficulty === 'hard' && currentHint.regionType === 'cage') {
      // 困难笼子题：第1步引导观察笼子基本信息
      const cageInfo = currentHint.cageInfo;
      const msg = `👀 观察这个笼子`
        + `\n和为 ${cageInfo.sum}，共 ${cageInfo.size} 格`
        + `\n绿色格子是我们要填的`
        + `\n（再点提示，看看笼子可能有哪些数字组合）`;
      showToast(msg, 5000);
    } else {
      // 简单/中等：标准引导
      const msg = `👀 看看金色高亮的${regionName}`
        + `\n绿框格子有什么特别之处？`
        + `\n（再点提示看思路）`;
      showToast(msg, 4000);
    }
    
  } else if (hintStep === 2) {
    // 第2步：根据难度给不同深度的提示
    currentHint = guideBoard.showHint(2);
    if (!currentHint) return;
    
    const difficulty = currentHint.difficulty || 'easy';
    
    if (difficulty === 'easy') {
      // 简单题第2步直接给答案
      currentHint = guideBoard.showHint(3);
      if (currentHint && currentHint.num) {
        showToast(`✅ 答案：${currentHint.num}`, 3500);
      }
      hintStep = 3; // 跳到最后一步
      
    } else if (difficulty === 'medium') {
      // 中等题第2步给思路
      const techMsg = buildTechniqueMessage(currentHint);
      showToast(techMsg, 5000);
      
    } else if (difficulty === 'hard' && currentHint.regionType === 'cage') {
      // 困难笼子题第2步：展示笼子组合
      showCageCombosHint(currentHint);
    } else {
      const techMsg = buildTechniqueMessage(currentHint);
      showToast(techMsg, 5000);
    }
    
  } else if (hintStep === 3) {
    // 第3步
    const difficulty = currentHint ? (currentHint.difficulty || 'easy') : 'easy';
    
    if (difficulty === 'easy') {
      // 简单题：清除
      _clearHint();
      return;
    }
    
    currentHint = guideBoard.showHint(2);
    if (!currentHint) return;
    
    if (difficulty === 'medium') {
      // 中等题第3步：给答案
      currentHint = guideBoard.showHint(3);
      if (currentHint && currentHint.num) {
        showToast(`✅ 答案：${currentHint.num}`, 3500);
      }
      hintStep = 4;
      
    } else if (difficulty === 'hard' && currentHint.regionType === 'cage') {
      // 困难笼子题第3步：详细推理思路
      showCageReasoningHint(currentHint);
    } else {
      currentHint = guideBoard.showHint(3);
      if (currentHint && currentHint.num) {
        showToast(`✅ 答案：${currentHint.num}`, 3500);
      }
      hintStep = 4;
    }
    
  } else if (hintStep === 4) {
    // 第4步：困难题给答案
    const difficulty = currentHint ? (currentHint.difficulty || 'easy') : 'easy';
    
    if (difficulty === 'hard') {
      currentHint = guideBoard.showHint(3);
      if (currentHint && currentHint.num) {
        showToast(`✅ 答案：${currentHint.num}`, 3500);
      }
      hintStep = 5;
    } else {
      _clearHint();
      return;
    }
    
  } else {
    // 清除提示
    _clearHint();
    return;
  }

  _renderBoardForHint();
}

/** 清除提示状态 */
function _clearHint() {
  guideBoard.clearHints();
  hintStep = 0;
  currentHint = null;
  _isHintShowing = false;
  _renderBoardForHint();
}

/**
 * 困难笼子题第2步：展示笼子组合
 */
function showCageCombosHint(hint) {
  const cageInfo = hint.cageInfo;
  const num = hint.num;
  const combos = cageInfo.combos || [];
  
  if (combos.length === 0) {
    showToast('这个笼子暂时没有可用的组合信息', 3000);
    return;
  }
  
  // 分成含num和不含num的组合
  const withNum = combos.filter(c => c.includes(num));
  const withoutNum = combos.filter(c => !c.includes(num));
  
  let msg = `🔢 笼子组合分析`
    + `\n和为 ${cageInfo.sum} 的 ${cageInfo.size} 格笼`
    + `\n共有 ${combos.length} 种可能组合`;
  
  if (withNum.length > 0) {
    msg += `\n\n含数字 ${num} 的组合有 ${withNum.length} 种：`;
    // 最多显示3种
    const showCount = Math.min(withNum.length, 3);
    for (let i = 0; i < showCount; i++) {
      msg += `\n  {${withNum[i].join(', ')}}`;
    }
    if (withNum.length > 3) {
      msg += `\n  …还有 ${withNum.length - 3} 种`;
    }
  }
  
  msg += `\n\n（再点提示，看看怎么推理）`;
  
  showToast(msg, 7000);
}

/**
 * 困难笼子题第3步：详细推理思路
 */
function showCageReasoningHint(hint) {
  const cageInfo = hint.cageInfo;
  const num = hint.num;
  
  // 计算目标格所在的宫，看看能不能用星衡法则
  const { boxW, boxH } = guideBoard.getBoxSize();
  const boxR = Math.floor(hint.r / boxH) * boxH;
  const boxC = Math.floor(hint.c / boxW) * boxW;
  
  // 检查这个宫里有哪些笼子
  const cageCellsInBox = new Map(); // cageId -> cells in box
  for (let r = boxR; r < boxR + boxH; r++) {
    for (let c = boxC; c < boxC + boxW; c++) {
      const cageId = guideBoard.cells[r][c].cageId;
      if (cageId !== null) {
        if (!cageCellsInBox.has(cageId)) cageCellsInBox.set(cageId, []);
        cageCellsInBox.get(cageId).push([r, c]);
      }
    }
  }
  
  let msg = `💡 推理思路`;
  msg += `\n这个笼子的和是 ${cageInfo.sum}，有 ${cageInfo.size} 格。`;
  msg += `\n\n核心思路：`;
  msg += `\n不要看格子能填什么，`;
  msg += `\n要想"数字 ${num} 在这个笼子里能放哪？"`;
  
  // 如果宫只有3个笼子，可能可以用星衡法则
  if (cageCellsInBox.size <= 4 && cageCellsInBox.size >= 2) {
    msg += `\n\n💡 进阶思路：星衡法则`;
    msg += `\n这个宫的总和一定是 45。`;
    msg += `\n看看宫里的笼子，能不能算出什么？`;
  }
  
  msg += `\n\n（再点提示看答案）`;
  
  showToast(msg, 8000);
}

/** 提示系统专用的轻量渲染（不触发refreshBoard的自动清提示逻辑） */
function _renderBoardForHint() {
  guideBoard.checkConflicts();
  guideRenderer._battleActive = (typeof GuideBattle !== 'undefined' && GuideBattle.active);
  guideRenderer._battleCtx = (typeof GuideBattle !== 'undefined') ? GuideBattle : null;
  guideRenderer.render(guideBoard);
  if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
    GuideBattle.renderFogAndGhosts(guideRenderer.ctx, guideRenderer.cellSize, guideRenderer.padding);
  }
  updateNumberButtons();
}

// ==========================================
// 星衡法则罗盘（神兵利器：看破天机）
// ==========================================
let _compassMode = {
  active: false,          // 罗盘模式开关（点击按钮进入）
  compassEl: null,
  laserEl: null,
  chainEl: null,
  particlesEl: null,
  hideTimer: null,
  longPressTimer: null,   // 长按触发计时器
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
      showToast('🧭 罗盘模式：点击任意宫查看星衡法则', 2000);
    } else {
      btn.style.background = '';
      btn.style.color = '';
      btn.style.boxShadow = '';
      hideRule45Compass();
    }
  }
  
  if (typeof AudioManager !== 'undefined') {
    if (_compassMode.active) {
      // 启动音效：一个上升的音调
      AudioManager.playClick();
    } else {
      AudioManager.playClick();
    }
  }
}

/**
 * 显示星衡法则罗盘（根据点击的格子，显示其所在宫的星衡法则信息）
 */
function showRule45Compass(r, c) {
  if (currentGridSize !== 9) return; // 只支持9x9
  
  const { boxW, boxH } = guideBoard.getBoxSize();
  const boxR = Math.floor(r / boxH) * boxH;
  const boxC = Math.floor(c / boxW) * boxW;
  const boxId = Math.floor(r / boxH) * 3 + Math.floor(c / boxW);
  
  // 计算这个宫的星衡法则数据
  const result = _calcRule45ForBox(boxR, boxC);
  
  // 获取宫的像素位置
  const canvasRect = guideRenderer.canvas.getBoundingClientRect();
  const pad = guideRenderer.padding;
  const cellW = (canvasRect.width - pad * 2) / guideBoard.size;
  const cellH = (canvasRect.height - pad * 2) / guideBoard.size;
  
  const boxX = pad + boxC * cellW;
  const boxY = pad + boxR * cellH;
  const boxW_px = cellW * 3;
  const boxH_px = cellH * 3;
  const centerX = boxX + boxW_px / 2;
  const centerY = boxY + boxH_px / 2;
  
  // 创建或更新罗盘
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
  
  // 重置动画（移除后重新添加以触发重放）
  compass.classList.remove('active', 'closing');
  // 强制重排
  void compass.offsetWidth;
  
  // 生成罗盘内容
  const totalSum = 45;
  const currentSum = result.insideSum;
  const remaining = totalSum - currentSum;
  
  let resultText = '';
  let resultClass = '';
  let targetCell = null;
  let targetValue = null;
  let targetType = ''; // 'outie' | 'innie'
  
  if (result.outieCells && result.outieCells.length === 1 && result.outieValue !== null) {
    resultText = `✨ 锁定外突异数`;
    resultClass = 'success';
    targetCell = result.outieCells[0];
    targetValue = result.outieValue;
    targetType = 'outie';
  } else if (result.innieCells && result.innieCells.length === 1 && result.innieValue !== null) {
    resultText = `✨ 锁定内突异数`;
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
  
  // 生成八卦刻度
  let ticksHtml = '';
  for (let i = 0; i < 12; i++) {
    const angle = i * 30;
    ticksHtml += `<div class="rule45-tick" style="transform: rotate(${angle}deg) translateY(-${size * 0.45}px);"></div>`;
  }
  
  compass.innerHTML = `
    <!-- 冲击波 -->
    <div class="rule45-shockwave"></div>
    <!-- 刻度环 -->
    <div class="rule45-compass-ticks">${ticksHtml}</div>
    <!-- 双环旋转 -->
    <div class="rule45-compass-ring" style="width:${size}px;height:${size}px;"></div>
    <div class="rule45-compass-ring r2" style="width:${size * 0.75}px;height:${size * 0.75}px;left:${size * 0.125}px;top:${size * 0.125}px;"></div>
    <!-- 中心数据面板 -->
    <div class="rule45-compass-center">
      <div class="rule45-compass-title">第${boxId + 1}宫 · 气场监测</div>
      <div class="rule45-compass-sum">${currentSum}<span class="total"> / ${totalSum}</span></div>
      <div class="rule45-compass-result ${resultClass}">${resultText}</div>
    </div>
  `;
  
  compass.classList.add('active');
  
  // 播放启动音效
  if (typeof AudioManager !== 'undefined') {
    if (AudioManager.playBell) {
      AudioManager.playBell();
    }
    if (AudioManager.playClick) {
      AudioManager.playClick();
    }
  }
  
  // 粒子爆发特效
  _spawnCompassParticles(
    canvasRect.left + centerX,
    canvasRect.top + centerY,
    12
  );
  
  // 如果有可解的异数，显示激光
  if (targetCell && targetValue !== null) {
    _showCompassLaser(
      canvasRect.left + centerX,
      canvasRect.top + centerY,
      canvasRect.left + pad + (targetCell[1] + 0.5) * cellW,
      canvasRect.top + pad + (targetCell[0] + 0.5) * cellH,
      targetValue,
      targetType
    );
    
    // 多米诺连锁推理
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
  
  // 清除之前的隐藏定时器
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
    // 动画结束后清理
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
  
  // 重置动画
  laser.classList.remove('active');
  void laser.offsetWidth;
  
  // 计算激光的长度和角度
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
  
  // 延迟后在目标点触发粒子爆炸
  setTimeout(() => {
    _spawnCompassParticles(toX, toY, 8);
  }, 650);
}

/**
 * 隐藏激光
 */
function _hideCompassLaser() {
  if (_compassMode.laserEl) {
    _compassMode.laserEl.classList.remove('active');
  }
}

/**
 * 生成粒子爆发特效
 */
function _spawnCompassParticles(centerX, centerY, count) {
  if (!_compassMode.particlesEl) {
    _compassMode.particlesEl = document.createElement('div');
    _compassMode.particlesEl.className = 'rule45-particles';
    document.body.appendChild(_compassMode.particlesEl);
  }
  
  const container = _compassMode.particlesEl;
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'rule45-particle';
    
    // 随机方向和距离
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 30 + Math.random() * 50;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    
    particle.style.left = '0px';
    particle.style.top = '0px';
    particle.style.setProperty('--dx', dx + 'px');
    particle.style.setProperty('--dy', dy + 'px');
    particle.style.animationDelay = (Math.random() * 0.1) + 's';
    
    container.style.left = centerX + 'px';
    container.style.top = centerY + 'px';
    
    container.appendChild(particle);
    
    // 动画结束后移除
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 900);
  }
}

/**
 * 显示多米诺连锁推理展示
 * 锁定异数后，继续推导出下一步可解的信息
 */
function _showDominoChain(result, targetCell, targetValue, targetType, canvasRect, pad, cellW, cellH) {
  // 找到目标格子所在的笼子
  const targetR = targetCell[0], targetC = targetCell[1];
  const cageId = guideBoard.cells[targetR][targetC].cageId;
  if (cageId === null) return;
  
  const cage = guideBoard.cages[cageId];
  if (!cage) return;
  
  // 计算笼子里还剩什么
  let cageFilledSum = 0;
  let cageEmptyCells = [];
  for (const [r, c] of cage.cells) {
    const val = guideBoard.cells[r][c].fillNum || guideBoard.cells[r][c].fixedNum || 0;
    if (val !== 0) {
      cageFilledSum += val;
    } else {
      // 排除目标格子（我们刚"算"出了它的值）
      if (r !== targetR || c !== targetC) {
        cageEmptyCells.push([r, c]);
      }
    }
  }
  
  // 加上刚算出的目标值
  cageFilledSum += targetValue;
  const remainingSum = cage.sum - cageFilledSum;
  
  // 生成连锁推理项
  const chainItems = [];
  
  // 第一步：笼子剩余
  chainItems.push({
    text: `${cage.sum} 笼 已填 ${cageFilledSum}，剩 ${remainingSum}`,
    cell: null
  });
  
  // 如果只剩一个空格，直接可以得出数值
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
  
  if (chainItems.length < 2) return; // 没有足够的推理链
  
  // 创建或更新连锁推理DOM
  if (!_compassMode.chainEl) {
    _compassMode.chainEl = document.createElement('div');
    _compassMode.chainEl.className = 'rule45-chain';
    document.body.appendChild(_compassMode.chainEl);
  }
  
  const chain = _compassMode.chainEl;
  chain.classList.remove('active');
  void chain.offsetWidth;
  
  // 计算位置（放在目标格子下方或旁边）
  const targetX = canvasRect.left + pad + (targetC + 0.5) * cellW;
  const targetY = canvasRect.top + pad + (targetR + 0.5) * cellH;
  
  let itemsHtml = '';
  let yOffset = 50; // 从目标格子下方开始
  
  for (let i = 0; i < chainItems.length; i++) {
    const item = chainItems[i];
    const itemY = yOffset + i * 36;
    
    let itemStyle = `left:50%;top:${itemY}px;transform:translateX(-50%);`;
    if (item.highlight) {
      itemStyle += 'border-color:#22c55e;color:#22c55e;';
    }
    
    itemsHtml += `<div class="rule45-chain-item" style="${itemStyle}">${item.text}</div>`;
    
    // 添加箭头（除了最后一个）
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

/**
 * 隐藏多米诺连锁推理
 */
function _hideDominoChain() {
  if (_compassMode.chainEl) {
    _compassMode.chainEl.classList.remove('active');
  }
}

/**
 * 计算某个宫的星衡法则数据
 */
function _calcRule45ForBox(boxR, boxC) {
  const size = guideBoard.size;
  const { boxW, boxH } = guideBoard.getBoxSize();
  
  // 收集宫内所有格子
  const boxCells = [];
  const boxKeys = new Set();
  for (let dr = 0; dr < boxH; dr++) {
    for (let dc = 0; dc < boxW; dc++) {
      const r = boxR + dr, c = boxC + dc;
      boxCells.push([r, c]);
      boxKeys.add(r * size + c);
    }
  }
  
  // 收集所有与宫相交的笼子
  const intersectingCages = new Set();
  for (const [r, c] of boxCells) {
    const cageId = guideBoard.cells[r][c].cageId;
    if (cageId !== null) {
      intersectingCages.add(cageId);
    }
  }
  
  // 分类：完全在宫内的笼子 / 部分在宫外的笼子
  const fullyInside = [];
  const partiallyOutside = [];
  
  for (const cageId of intersectingCages) {
    const cage = guideBoard.cages[cageId];
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
  
  // 计算完全在内的笼子和
  let insideSum = 0;
  for (const cage of fullyInside) {
    insideSum += cage.sum;
  }
  
  // 加上宫内已填数字（不在完全在内的笼子里的）
  const fullyInsideKeys = new Set();
  for (const cage of fullyInside) {
    for (const [r, c] of cage.cells) {
      fullyInsideKeys.add(r * size + c);
    }
  }
  
  let filledSum = 0;
  const innieCells = []; // 内突：宫内但不在完全在内的笼子里
  for (const [r, c] of boxCells) {
    if (!fullyInsideKeys.has(r * size + c)) {
      const val = guideBoard.cells[r][c].fillNum || guideBoard.cells[r][c].fixedNum || 0;
      if (val !== 0) {
        filledSum += val;
      } else {
        innieCells.push([r, c]);
      }
    }
  }
  insideSum += filledSum;
  
  // 计算outie：部分在宫外的笼子中，位于宫外的格子
  const outieCells = [];
  let outieFilledSum = 0;
  
  // 计算所有相交笼子的总和
  let totalCageSum = 0;
  for (const cageId of intersectingCages) {
    const cage = guideBoard.cages[cageId];
    if (cage) totalCageSum += cage.sum;
  }
  
  // 找outie格子（在相交笼子里，但不在宫里）
  const outieKeySet = new Set();
  for (const cage of partiallyOutside) {
    for (const [r, c] of cage.cells) {
      if (!boxKeys.has(r * size + c)) {
        const key = r * size + c;
        if (!outieKeySet.has(key)) {
          outieKeySet.add(key);
          outieCells.push([r, c]);
          const val = guideBoard.cells[r][c].fillNum || guideBoard.cells[r][c].fixedNum || 0;
          if (val !== 0) outieFilledSum += val;
        }
      }
    }
  }
  
  // 计算outie的值（如果只有一个空格）
  const sumOutsideValues = totalCageSum - 45;
  let outieValue = null;
  const outieEmpty = outieCells.filter(([r, c]) => 
    (guideBoard.cells[r][c].fillNum || guideBoard.cells[r][c].fixedNum || 0) === 0
  );
  if (outieEmpty.length === 1) {
    const val = sumOutsideValues - outieFilledSum;
    if (val >= 1 && val <= 9) outieValue = val;
  }
  
  // 计算innie的值（如果只有一个空格）
  const sumInnieValues = 45 - insideSum + filledSum;
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
// 求解动画播放器（正向求解演示）
// ==========================================
let _solutionPlayer = {
  steps: [],
  currentStep: -1,
  isPlaying: false,
  speed: 1.0, // 倍速：0.5x, 1x, 2x, 4x
  timer: null,
  playerEl: null,
  originalBoard: null // 保存初始盘面状态
};

/**
 * 启动求解动画播放器（使用 tech-rater-v2 正向求解器）
 */
function startSolutionPlayer() {
  // 构建初始盘面（只包含固定数字）
  const initialGrid = [];
  const cages = [];
  for (let r = 0; r < guideBoard.size; r++) {
    initialGrid[r] = [];
    for (let c = 0; c < guideBoard.size; c++) {
      initialGrid[r][c] = guideBoard.cells[r][c].fixedNum || 0;
    }
  }
  for (const cage of guideBoard.cages) {
    cages.push({
      id: cage.id,
      sum: cage.sum,
      cells: cage.cells.slice()
    });
  }
  
  // 使用 tech-rater-v2 求解
  let steps = [];
  try {
    if (typeof TechRaterSolverV2 !== 'undefined') {
      const solver = new TechRaterSolverV2(initialGrid, cages);
      const result = solver.solve(200);
      steps = solver.steps || [];
    } else {
      // 回退到旧的求解方法
      steps = guideBoard.generateSolutionSteps();
    }
  } catch(e) {
    console.error('求解器出错:', e);
    steps = guideBoard.generateSolutionSteps();
  }
  
  if (steps.length === 0) {
    showToast('这道题暂时无法自动求解', 3000);
    return;
  }
  
  // 保存当前盘面状态
  _solutionPlayer.originalBoard = [];
  for (let r = 0; r < guideBoard.size; r++) {
    _solutionPlayer.originalBoard[r] = [];
    for (let c = 0; c < guideBoard.size; c++) {
      _solutionPlayer.originalBoard[r][c] = guideBoard.cells[r][c].fillNum || 0;
    }
  }
  
  // 清空盘面（只保留固定数字）
  for (let r = 0; r < guideBoard.size; r++) {
    for (let c = 0; c < guideBoard.size; c++) {
      if (!guideBoard.cells[r][c].fixedNum) {
        guideBoard.cells[r][c].fillNum = 0;
        guideBoard.cells[r][c].notes = new Set();
      }
    }
  }
  
  // 转换步骤格式（统一字段名）
  _solutionPlayer.steps = steps.map(s => ({
    r: s.row !== undefined ? s.row : s.r,
    c: s.col !== undefined ? s.col : s.c,
    num: s.num,
    technique: s.technique,
    techniqueName: s.techniqueName || TECHNIQUE_NAMES[s.technique] || s.technique,
    description: s.description || '',
    highlightCells: s.highlightCells || [],
    regionType: s.regionType || '',
    evidence: s.evidence || null
  }));
  
  _solutionPlayer.currentStep = -1;
  _solutionPlayer.isPlaying = false;
  
  // 创建播放器UI
  _createSolutionPlayerUI();
  
  // 渲染
  _renderBoardForHint();
}

// 技巧名称映射
const TECHNIQUE_NAMES = {
  nakedSingle: '显性唯一（孤星）',
  cageUnique: '笼子唯一组合',
  hiddenSingle: '隐性唯一（隐曜）',
  rule45: '星衡法则',
  nakedPair: '并蒂锁',
  hiddenPair: '双曜',
  pointingClaiming: '区块排除',
  nakedTriplet: '三子法',
  xWing: '二连纵横阵'
};

/**
 * 创建播放器UI
 */
function _createSolutionPlayerUI() {
  // 移除旧的
  if (_solutionPlayer.playerEl) {
    _solutionPlayer.playerEl.remove();
  }
  
  const el = document.createElement('div');
  el.className = 'solution-player';
  el.innerHTML = `
    <button class="solution-player-btn close-btn" title="关闭">✕</button>
    <button class="solution-player-btn prev-btn" title="上一步">⏮</button>
    <button class="solution-player-btn play-btn" title="播放/暂停">▶</button>
    <button class="solution-player-btn next-btn" title="下一步">⏭</button>
    <div class="solution-player-info">
      <div><span class="step-count">0</span> / ${_solutionPlayer.steps.length} 步</div>
      <div class="step-tech">点击播放开始</div>
    </div>
    <div class="solution-player-speed">
      <div class="solution-player-speed-label">速度</div>
      <div class="solution-player-speed-value">1x</div>
    </div>
  `;
  
  document.body.appendChild(el);
  _solutionPlayer.playerEl = el;
  
  // 绑定事件
  el.querySelector('.close-btn').addEventListener('click', _closeSolutionPlayer);
  el.querySelector('.prev-btn').addEventListener('click', _prevSolutionStep);
  el.querySelector('.play-btn').addEventListener('click', _togglePlaySolution);
  el.querySelector('.next-btn').addEventListener('click', _nextSolutionStep);
  el.querySelector('.solution-player-speed').addEventListener('click', _cycleSolutionSpeed);
}

/**
 * 关闭播放器，恢复盘面
 */
function _closeSolutionPlayer() {
  if (_solutionPlayer.timer) {
    clearTimeout(_solutionPlayer.timer);
    _solutionPlayer.timer = null;
  }
  
  // 恢复盘面
  if (_solutionPlayer.originalBoard) {
    for (let r = 0; r < guideBoard.size; r++) {
      for (let c = 0; c < guideBoard.size; c++) {
        if (!guideBoard.cells[r][c].fixedNum) {
          guideBoard.cells[r][c].fillNum = _solutionPlayer.originalBoard[r][c];
        }
      }
    }
  }
  
  // 清除高亮
  for (let r = 0; r < guideBoard.size; r++) {
    for (let c = 0; c < guideBoard.size; c++) {
      guideBoard.cells[r][c].isHintCell = false;
      guideBoard.cells[r][c].isHintRegion = false;
    }
  }
  
  if (_solutionPlayer.playerEl) {
    _solutionPlayer.playerEl.remove();
    _solutionPlayer.playerEl = null;
  }
  
  _solutionPlayer.steps = [];
  _solutionPlayer.currentStep = -1;
  _solutionPlayer.isPlaying = false;
  
  _renderBoardForHint();
}

/**
 * 播放/暂停
 */
function _togglePlaySolution() {
  _solutionPlayer.isPlaying = !_solutionPlayer.isPlaying;
  
  const playBtn = _solutionPlayer.playerEl.querySelector('.play-btn');
  playBtn.textContent = _solutionPlayer.isPlaying ? '⏸' : '▶';
  
  if (_solutionPlayer.isPlaying) {
    _autoPlayNext();
  } else {
    if (_solutionPlayer.timer) {
      clearTimeout(_solutionPlayer.timer);
      _solutionPlayer.timer = null;
    }
  }
}

/**
 * 自动播放下一步
 */
function _autoPlayNext() {
  if (!_solutionPlayer.isPlaying) return;
  
  if (_solutionPlayer.currentStep >= _solutionPlayer.steps.length - 1) {
    // 播放完毕
    _solutionPlayer.isPlaying = false;
    const playBtn = _solutionPlayer.playerEl.querySelector('.play-btn');
    playBtn.textContent = '▶';
    return;
  }
  
  _nextSolutionStep();
  
  // 根据速度计算延迟
  const baseDelay = 1200; // 基础1.2秒一步
  const delay = baseDelay / _solutionPlayer.speed;
  
  _solutionPlayer.timer = setTimeout(_autoPlayNext, delay);
}

/**
 * 下一步
 */
function _nextSolutionStep() {
  if (_solutionPlayer.currentStep >= _solutionPlayer.steps.length - 1) return;
  
  _solutionPlayer.currentStep++;
  const step = _solutionPlayer.steps[_solutionPlayer.currentStep];
  
  // 清除之前的高亮
  for (let r = 0; r < guideBoard.size; r++) {
    for (let c = 0; c < guideBoard.size; c++) {
      guideBoard.cells[r][c].isHintCell = false;
      guideBoard.cells[r][c].isHintRegion = false;
    }
  }
  
  // 高亮关联区域
  if (step.highlightCells) {
    for (const [r, c] of step.highlightCells) {
      guideBoard.cells[r][c].isHintRegion = true;
    }
  }
  
  // 填入数字
  guideBoard.cells[step.r][step.c].fillNum = step.num;
  guideBoard.cells[step.r][step.c].isHintCell = true;
  
  // 更新UI
  _updatePlayerUI(step);
  
  _renderBoardForHint();
}

/**
 * 上一步
 */
function _prevSolutionStep() {
  if (_solutionPlayer.currentStep < 0) return;
  
  const step = _solutionPlayer.steps[_solutionPlayer.currentStep];
  
  // 移除这一步填的数字
  if (!guideBoard.cells[step.r][step.c].fixedNum) {
    guideBoard.cells[step.r][step.c].fillNum = 0;
  }
  
  _solutionPlayer.currentStep--;
  
  // 清除高亮
  for (let r = 0; r < guideBoard.size; r++) {
    for (let c = 0; c < guideBoard.size; c++) {
      guideBoard.cells[r][c].isHintCell = false;
      guideBoard.cells[r][c].isHintRegion = false;
    }
  }
  
  // 如果还有上一步，高亮上一步的关联区域
  if (_solutionPlayer.currentStep >= 0) {
    const prevStep = _solutionPlayer.steps[_solutionPlayer.currentStep];
    if (prevStep.highlightCells) {
      for (const [r, c] of prevStep.highlightCells) {
        guideBoard.cells[r][c].isHintRegion = true;
      }
    }
    guideBoard.cells[prevStep.r][prevStep.c].isHintCell = true;
    _updatePlayerUI(prevStep);
  } else {
    _updatePlayerUI(null);
  }
  
  _renderBoardForHint();
}

/**
 * 切换速度
 */
function _cycleSolutionSpeed() {
  const speeds = [0.5, 1.0, 2.0, 4.0];
  const idx = speeds.indexOf(_solutionPlayer.speed);
  const nextIdx = (idx + 1) % speeds.length;
  _solutionPlayer.speed = speeds[nextIdx];
  
  const speedEl = _solutionPlayer.playerEl.querySelector('.solution-player-speed-value');
  speedEl.textContent = _solutionPlayer.speed + 'x';
}

/**
 * 更新播放器UI信息
 */
function _updatePlayerUI(step) {
  if (!_solutionPlayer.playerEl) return;
  
  const stepCountEl = _solutionPlayer.playerEl.querySelector('.step-count');
  const stepTechEl = _solutionPlayer.playerEl.querySelector('.step-tech');
  
  stepCountEl.textContent = _solutionPlayer.currentStep + 1;
  
  if (step) {
    stepTechEl.textContent = step.techniqueName + '：填 ' + step.num;
  } else {
    stepTechEl.textContent = '准备开始';
  }
}

/**
 * 根据hint对象构建技巧说明（简短有力）
 */
function buildTechniqueMessage(hint) {
  const tech = hint.technique;
  const num = hint.num;

  // 根据区域类型生成通俗描述
  const regionNames = { row: '这一行', col: '这一列', box: '这个宫', cage: '这个笼子' };
  const regionName = regionNames[hint.regionType] || '这个区域';

  switch (tech) {
    case 'nakedSingle':
      return `💡 这个格子只能填 ${num}`
        + `\n${regionName}里其他数字都齐了，就差它。`;
    case 'hiddenSingle':
      return `💡 数字 ${num} 只能放这里`
        + `\n${regionName}里，${num} 没别的地方可去了。`;
    case 'nakedPair':
      if (hint.pairCells && hint.pairNums) {
        const num1 = hint.pairNums[0];
        const num2 = hint.pairNums[1];
        return `💡 数对：${num1} 和 ${num2}`
          + `\n这俩格子被 ${num1}、${num2} 包圆了，其他格都能排除。`;
      }
      return `💡 数对技巧`;
    default:
      return `💡 ${hint.techniqueName}`
        + `\n${hint.description}`;
  }
}

/** 获取区域中文名 */
function getRegionName(hint) {
  const labels = 'ABCDEFGHI';
  switch (hint.regionType) {
    case 'row': return `${labels[hint.regionIndex]}行`;
    case 'col': return `第${hint.regionIndex + 1}列`;
    case 'box': return `第${hint.regionIndex + 1}宫`;
    case 'cage': return '这个笼子';
    default: return '相关区域';
  }
}

/**
 * 根据technique获取对应的教程key（用于高级技巧联动）
 * 目前孤星/隐曜太基础不需要教程，返回null
 */
function getTutorialKeyForTechnique(technique) {
  const map = {
    nakedPair: 'naked_pair',
    hiddenPair: 'hidden_pair',
    triple: 'triple',
    二连纵横阵: '二连纵横阵',
    swordfish: 'swordfish',
  };
  return map[technique] || null;
}

// ---------- Toast ----------
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
  // 支持\n换行
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ---------- 星衡法则计算器 ----------
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
  if (size <= 6) return '星衡法则';
  return '星衡法则';
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
      // 长按数字键优先级高于笔记模式——即使在笔记模式下也能激活连填
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
  // 连填优先级高于笔记模式——激活连填后点击空格直接填入
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
  // 清除所有相关存档
  try {
    Storage.clearTeachingProgress(currentLevelId);
    Storage.clearTeachingProgress(String(currentLevelId));
    // 同时清除通用存档key
    const saveKey = 'killersudoku_save_' + currentLevelId;
    localStorage.removeItem(saveKey);
    const saveKey2 = 'killersudoku_save_' + String(currentLevelId);
    localStorage.removeItem(saveKey2);
  } catch(e) { console.warn('清除存档失败:', e); }
  // 强制重新加载，不使用缓存
  window.location.replace(window.location.pathname + '?levelId=' + currentLevelId + '&reset=1');
}

// ==========================================
// GuideManager 引导系统集成
// ==========================================

function initGuideManager() {
  // 初始化逆转裁判式演出系统
  _initStoryPerformance();

  if (!window.GuideManager) {
    console.warn('⚠️ GuideManager 未加载');
    return;
  }

  const triggers = (currentLevelData && currentLevelData.triggers) || [];

  // 残局教学关：自动注入"直接进入破局"触发器
  let effectiveTriggers = triggers;
  if (isEndgameMode) {
    const hasEnterBreakthrough = triggers.some(t =>
      t.type === 'enter_phase' && t.phase === 'breakthrough' &&
      (t.condition === 'onLevelStart' || (t.condition && t.condition.type === 'onLevelStart'))
    );
    if (!hasEnterBreakthrough) {
      effectiveTriggers = [
        { condition: 'onLevelStart', type: 'enter_phase', phase: 'breakthrough', once: true },
        ...triggers
      ];
    }
  }

  if (effectiveTriggers.length === 0) {
    console.log('📚 本关无引导配置');
    // 残局关即使没有触发器也要启动卡壳计时器
    if (isEndgameMode) startStuckTimer();
    return;
  }

  // 清除该关卡旧的历史触发记录（保证每次重进都能看到引导）
  try {
    const oldKey = 'killersudoku_guide_triggered_' + currentLevelId;
    localStorage.removeItem(oldKey);
  } catch (e) { /* ignore */ }

  guideManager = new GuideManager({
    triggers: effectiveTriggers,
    levelId: currentLevelId,
    board: guideBoard,
    renderer: guideRenderer,
    canvas: document.getElementById('gameCanvas'),
    storageKey: 'killersudoku_guide_triggered'
  });

  // 暴露到全局方便调试和GuideManager调用
  window.guideManager = guideManager;
  window.enterBreakthrough = enterBreakthrough;
  window.enterFinishing = enterFinishing;
  window.gamePhase = () => gamePhase;

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
    // 传递1秒作为deltaTime（定时器每1秒触发一次）
    guideManager.update(1);
  }, 1000);
}

function recordAction() {
  lastActionTime = Date.now();
}

// ---------- 事件回调：填数 ----------
function guide_onNumberFilled(r, c, num) {
  if (!guideManager) { console.log('❌ guide_onNumberFilled: guideManager 不存在'); return; }
  recordAction();

  // 判断填数是否正确（与solution对比）
  const solution = currentLevelData && currentLevelData.solution;
  const isCorrect = !!(solution && solution[r] && solution[r][c] === num);

  // 逆转裁判式演出：正确/错误回调
  if (isCorrect) {
    _onStoryCorrect();
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playCorrect();
      AudioManager.vibrate('correct');
    }
  } else {
    _onStoryWrong();
  }

  // ====== 防猜机制（破局阶段）======
  // 在破局阶段，填错数字立即闪红并清除，不给"猜"留空间
  if (!isCorrect && gamePhase === 'breakthrough') {
    _breakthroughWrongCount++;
    console.log(`🚫 破局阶段填错! 位置(${r},${c})填${num}，正确应为${solution[r][c]}，连续错误${_breakthroughWrongCount}次`);
    
    // 标记错误格
    const cell = guideBoard.cells[r][c];
    cell.isError = true;
    refreshBoard();
    
    // 播放错误音效
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playWrong();
      AudioManager.vibrate('wrong');
    }
    
    // 错误震动反馈
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.animation = 'none';
      canvas.offsetHeight; // 触发reflow
      canvas.style.animation = 'shake 0.4s ease-out';
    }
    
    // 延迟清除错误数字
    setTimeout(() => {
      if (guideBoard && guideBoard.cells[r][c]) {
        guideBoard.cells[r][c].fillNum = null;
        guideBoard.cells[r][c].isError = false;
        guideBoard.checkConflicts();
        refreshBoard();
      }
    }, 600);
    
    // 连续猜错3次，自动弹出提示
    if (_breakthroughWrongCount >= 3) {
      _breakthroughWrongCount = 0;
      setTimeout(() => {
        showGameToast(t('hint.breakthroughNoGuess'), 4000);
      }, 800);
    } else {
      const hints = ['再想想...', '这个不对哦', '仔细观察笔记', '试试排除法'];
      showGameToast('❌ ' + hints[Math.min(_breakthroughWrongCount-1, hints.length-1)], 1500);
    }
    
    // 不计入进度，不重置卡壳计时器
    return;
  }

  console.log(`🔢 guide_onNumberFilled(r=${r}, c=${c}, num=${num}) correct=${isCorrect} → guideManager.onNumberFilled`);
  guideManager.onNumberFilled(r, c, num, isCorrect);

  // 填数后更新透视面板（如果当前选中的就是这个格子）
  if (guideBoard && guideBoard.selectedCell &&
      guideBoard.selectedCell.r === r && guideBoard.selectedCell.c === c) {
    updatePerspectivePanel(r, c);
  }
}

// ---------- 事件回调：选中格子 ----------
function guide_onCellSelect(r, c) {
  if (!guideManager) { console.log('❌ guide_onCellSelect: guideManager 不存在'); return; }
  // 注意：纯选中格子不调用recordAction()，不重置卡壳计时器
  // 只有真正的填数/删数/候选操作才算"行动"
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

    // 空格 / C：切换笔记模式
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

    // R：星衡法则
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
    if (typeof AudioManager !== 'undefined') AudioManager.playPopupClose();
  } else {
    loadSettingsToUI();
    overlay.classList.add('active');
    if (typeof AudioManager !== 'undefined') AudioManager.playPopupOpen();
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
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      guideBoard.settings.conflictRed = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightRow = document.getElementById('setting-highlight-row');
  if (highlightRow) {
    highlightRow.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      guideBoard.highlightSettings.sameRow = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightCol = document.getElementById('setting-highlight-col');
  if (highlightCol) {
    highlightCol.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      guideBoard.highlightSettings.sameCol = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightBox = document.getElementById('setting-highlight-box');
  if (highlightBox) {
    highlightBox.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      guideBoard.highlightSettings.sameBox = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightSameNum = document.getElementById('setting-highlight-samenum');
  if (highlightSameNum) {
    highlightSameNum.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      guideBoard.highlightSettings.sameNumber = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const highlightSameCage = document.getElementById('setting-highlight-samecage');
  if (highlightSameCage) {
    highlightSameCage.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      guideBoard.highlightSettings.sameCage = e.target.checked;
      saveSettings();
      refreshBoard();
    });
  }

  const autoClear = document.getElementById('setting-auto-clear');
  if (autoClear) {
    autoClear.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      guideBoard.settings.autoClearCandidates = e.target.checked;
      saveSettings();
    });
  }

  // 触感反馈：振动开关
  const vibrationToggle = document.getElementById('setting-vibration');
  if (vibrationToggle) {
    vibrationToggle.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      guideBoard.settings.vibration = e.target.checked;
      saveSettings();
    });
  }

  // 音频设置：一键静音
  const muteAll = document.getElementById('setting-mute-all');
  if (muteAll) {
    muteAll.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      const muted = e.target.checked;
      guideBoard.settings.muteAll = muted;
      if (typeof AudioManager !== 'undefined') {
        if (muted) {
          AudioManager.setBgmEnabled(false);
          AudioManager.setSfxEnabled(false);
        } else {
          const bgmOn = document.getElementById('setting-bgm');
          const sfxOn = document.getElementById('setting-sfx');
          AudioManager.setBgmEnabled(bgmOn ? bgmOn.checked : true);
          AudioManager.setSfxEnabled(sfxOn ? sfxOn.checked : true);
        }
      }
      // 同步剧情配音
      if (typeof StoryEngine !== 'undefined' && typeof StoryEngine.setVoiceEnabled === 'function') {
        if (muted) {
          StoryEngine.setVoiceEnabled(false);
        } else {
          const voiceOn = document.getElementById('setting-voice');
          StoryEngine.setVoiceEnabled(voiceOn ? voiceOn.checked : true);
        }
      }
      // 同步 BGMEngine（通知菜单页静音）
      document.dispatchEvent(new CustomEvent('bgm-toggle', { detail: !muted }));
      saveSettings();
      // 刷新UI（禁用/启用子开关）
      loadSettingsToUI();
    });
  }

  // 音频设置：BGM开关
  const bgmToggle = document.getElementById('setting-bgm');
  if (bgmToggle) {
    bgmToggle.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      const bgmOn = e.target.checked;
      guideBoard.settings.bgm = bgmOn;
      if (typeof AudioManager !== 'undefined') {
        if (guideBoard.settings.muteAll) {
          AudioManager.setBgmEnabled(false);
        } else {
          AudioManager.setBgmEnabled(bgmOn);
        }
      }
      // 同步音量条禁用状态
      updateVolumeSlidersDisabled();
      saveSettings();
    });
  }

  // 音频设置：音效开关
  const sfxToggle = document.getElementById('setting-sfx');
  if (sfxToggle) {
    sfxToggle.addEventListener('change', (e) => {
      if (typeof AudioManager !== 'undefined') AudioManager.playToggle();
      const sfxOn = e.target.checked;
      guideBoard.settings.sfx = sfxOn;
      if (typeof AudioManager !== 'undefined') {
        if (guideBoard.settings.muteAll) {
          AudioManager.setSfxEnabled(false);
        } else {
          AudioManager.setSfxEnabled(sfxOn);
        }
      }
      // 同步音量条禁用状态
      updateVolumeSlidersDisabled();
      saveSettings();
    });
  }

  // 音频设置：BGM音量滑块
  const bgmVolumeSlider = document.getElementById('setting-bgm-volume');
  const bgmVolumeValue = document.getElementById('setting-bgm-volume-value');
  let _bgmSliderThrottle = 0;
  if (bgmVolumeSlider) {
    bgmVolumeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (bgmVolumeValue) bgmVolumeValue.textContent = val + '%';
      if (typeof AudioManager !== 'undefined') {
        // 将 0-100 映射到 0-1（BGM默认音量较低，用0.3作为最大值）
        AudioManager.setBgmVolume(val / 100 * 0.3);
        // slider 音效节流 100ms
        const now = Date.now();
        if (now - _bgmSliderThrottle >= 100) {
          _bgmSliderThrottle = now;
          if (typeof AudioManager.playSlider === 'function') AudioManager.playSlider();
        }
      }
      guideBoard.settings.bgmVolume = val;
    });
    bgmVolumeSlider.addEventListener('change', () => {
      saveSettings();
    });
  }

  // 音频设置：音效音量滑块
  const sfxVolumeSlider = document.getElementById('setting-sfx-volume');
  const sfxVolumeValue = document.getElementById('setting-sfx-volume-value');
  let _sfxSliderThrottle = 0;
  if (sfxVolumeSlider) {
    sfxVolumeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (sfxVolumeValue) sfxVolumeValue.textContent = val + '%';
      if (typeof AudioManager !== 'undefined') {
        // 将 0-100 映射到 0-1（音效默认音量适中，用0.6作为最大值）
        AudioManager.setSfxVolume(val / 100 * 0.6);
        // slider 音效节流 100ms
        const now = Date.now();
        if (now - _sfxSliderThrottle >= 100) {
          _sfxSliderThrottle = now;
          if (typeof AudioManager.playSlider === 'function') AudioManager.playSlider();
        }
      }
      guideBoard.settings.sfxVolume = val;
    });
    sfxVolumeSlider.addEventListener('change', () => {
      saveSettings();
      // 播放一个点击音作为反馈
      if (typeof AudioManager !== 'undefined' && guideBoard.settings.sfx !== false && !guideBoard.settings.muteAll) {
        AudioManager.playClick && AudioManager.playClick();
      }
    });
  }

  // 初始化音量条禁用状态
  updateVolumeSlidersDisabled();
  
  // 教学工具：自动演示求解过程
  const showSolutionBtn = document.getElementById('btn-show-solution');
  if (showSolutionBtn) {
    showSolutionBtn.addEventListener('click', () => {
      if (typeof AudioManager !== 'undefined') AudioManager.playClick();
      toggleSettings(); // 关闭设置菜单
      startSolutionPlayer();
    });
  }
}

function updateVolumeSlidersDisabled() {
  const isMuted = guideBoard.settings.muteAll;
  const bgmVolRow = document.getElementById('setting-bgm-volume')?.closest('.setting-volume');
  const sfxVolRow = document.getElementById('setting-sfx-volume')?.closest('.setting-volume');
  if (bgmVolRow) {
    bgmVolRow.classList.toggle('disabled', isMuted || guideBoard.settings.bgm === false);
  }
  if (sfxVolRow) {
    sfxVolRow.classList.toggle('disabled', isMuted || guideBoard.settings.sfx === false);
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
  // 音频设置
  if (saved.muteAll !== undefined) guideBoard.settings.muteAll = saved.muteAll;
  if (saved.bgm !== undefined) guideBoard.settings.bgm = saved.bgm;
  if (saved.sfx !== undefined) guideBoard.settings.sfx = saved.sfx;
  if (saved.bgmVolume !== undefined) guideBoard.settings.bgmVolume = saved.bgmVolume;
  if (saved.sfxVolume !== undefined) guideBoard.settings.sfxVolume = saved.sfxVolume;
  if (saved.vibration !== undefined) guideBoard.settings.vibration = saved.vibration;
  
  // 应用音频设置
  applyAudioSettings();
}

function applyAudioSettings() {
  if (typeof AudioManager === 'undefined') return;
  const s = guideBoard.settings;
  if (s.muteAll) {
    AudioManager.setBgmEnabled(false);
    AudioManager.setSfxEnabled(false);
  } else {
    AudioManager.setBgmEnabled(s.bgm !== false);
    AudioManager.setSfxEnabled(s.sfx !== false);
  }
  // 同步剧情配音
  if (typeof StoryEngine !== 'undefined' && typeof StoryEngine.setVoiceEnabled === 'function') {
    if (s.muteAll) {
      StoryEngine.setVoiceEnabled(false);
    } else {
      const voiceOn = document.getElementById('setting-voice');
      StoryEngine.setVoiceEnabled(voiceOn ? voiceOn.checked : true);
    }
  }
  // 应用音量设置（默认值：BGM 50%→0.15，音效 67%→0.4）
  if (s.bgmVolume !== undefined) {
    AudioManager.setBgmVolume(s.bgmVolume / 100 * 0.3);
  }
  if (s.sfxVolume !== undefined) {
    AudioManager.setSfxVolume(s.sfxVolume / 100 * 0.6);
  }
  // 同步 BGMEngine（通知菜单页静音）
  document.dispatchEvent(new CustomEvent('bgm-toggle', { detail: s.muteAll ? false : (s.bgm !== false) }));
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
    highlightSameCage: guideBoard.highlightSettings.sameCage,
    muteAll: guideBoard.settings.muteAll,
    bgm: guideBoard.settings.bgm,
    sfx: guideBoard.settings.sfx,
    bgmVolume: guideBoard.settings.bgmVolume,
    sfxVolume: guideBoard.settings.sfxVolume,
    vibration: guideBoard.settings.vibration
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

  // 触感反馈UI
  const vibrationToggle = document.getElementById('setting-vibration');
  if (vibrationToggle) vibrationToggle.checked = guideBoard.settings.vibration !== false;

  // 音频设置UI
  const muteAll = document.getElementById('setting-mute-all');
  const bgmToggle = document.getElementById('setting-bgm');
  const sfxToggle = document.getElementById('setting-sfx');
  const isMuted = guideBoard.settings.muteAll;
  if (muteAll) muteAll.checked = isMuted;
  if (bgmToggle) {
    bgmToggle.checked = guideBoard.settings.bgm !== false;
    bgmToggle.disabled = isMuted;
    bgmToggle.parentElement.style.opacity = isMuted ? '0.5' : '1';
  }
  if (sfxToggle) {
    sfxToggle.checked = guideBoard.settings.sfx !== false;
    sfxToggle.disabled = isMuted;
    sfxToggle.parentElement.style.opacity = isMuted ? '0.5' : '1';
  }

  // 音量滑块UI
  const bgmVolSlider = document.getElementById('setting-bgm-volume');
  const bgmVolValue = document.getElementById('setting-bgm-volume-value');
  const sfxVolSlider = document.getElementById('setting-sfx-volume');
  const sfxVolValue = document.getElementById('setting-sfx-volume-value');
  // 默认值：BGM 50（对应0.15），音效 67（对应0.4）
  const defaultBgmVol = 50;
  const defaultSfxVol = 67;
  if (bgmVolSlider) {
    const v = guideBoard.settings.bgmVolume !== undefined ? guideBoard.settings.bgmVolume : defaultBgmVol;
    bgmVolSlider.value = v;
    if (bgmVolValue) bgmVolValue.textContent = v + '%';
  }
  if (sfxVolSlider) {
    const v = guideBoard.settings.sfxVolume !== undefined ? guideBoard.settings.sfxVolume : defaultSfxVol;
    sfxVolSlider.value = v;
    if (sfxVolValue) sfxVolValue.textContent = v + '%';
  }

  // 更新音量条禁用状态
  updateVolumeSlidersDisabled();
}
