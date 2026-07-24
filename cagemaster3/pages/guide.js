// Guide.js - Main game controller (clean version)
// Expert system driven, modular, maintainable

;(function(global) {
  'use strict';

  const log = new Logger('Guide');

  // === chapters.json 缓存 ===
  let _cachedChapterData = null;
  let _chapterDataPromise = null;
  let _chapterIndex = null; // 章节索引
  let _loadedChapters = {}; // 已加载的章节缓存 {chapterId: chapterData}

  function getChapterData() {
    if (_cachedChapterData) {
      return Promise.resolve(_cachedChapterData);
    }
    if (_chapterDataPromise) {
      return _chapterDataPromise;
    }
    // 优先尝试加载章节索引（拆分模式）
    _chapterDataPromise = _loadChapterIndex()
      .then(index => {
        if (index) {
          // 拆分模式：返回延迟加载的包装对象
          _chapterIndex = index;
          const wrapper = {
            chapters: [],
            _lazy: true,
            _index: index
          };
          // 提供 getChapter 方法
          wrapper.getChapter = function(chapterId) {
            return _loadChapter(chapterId);
          };
          // 获取所有章节（按需加载）
          wrapper.getAllChapters = function() {
            return _loadAllChapters();
          };
          _cachedChapterData = wrapper;
          _chapterDataPromise = null;
          return wrapper;
        } else {
          // 回退到旧格式
          return _loadLegacyChapters();
        }
      })
      .catch(err => {
        console.warn('[Guide] 章节索引加载失败，回退到旧格式:', err);
        return _loadLegacyChapters();
      });
    return _chapterDataPromise;
  }

  // 加载章节索引
  function _loadChapterIndex() {
    return fetch('data/chapters/chapters-index.json')
      .then(res => {
        if (!res.ok) return null;
        return res.json();
      })
      .catch(() => null);
  }

  // 加载单个章节
  function _loadChapter(chapterId) {
    if (_loadedChapters[chapterId]) {
      return Promise.resolve(_loadedChapters[chapterId]);
    }
    // 从索引中查找文件名
    const info = _chapterIndex?.chapters?.find(c => c.chapterId === chapterId);
    if (!info) {
      return Promise.reject(new Error('章节不存在: ' + chapterId));
    }
    return fetch('data/chapters/' + info.file)
      .then(res => res.json())
      .then(data => {
        _loadedChapters[chapterId] = data;
        return data;
      });
  }

  // 加载所有章节（用于需要遍历所有章节的场景）
  function _loadAllChapters() {
    if (!_chapterIndex || !_chapterIndex.chapters) {
      return Promise.resolve([]);
    }
    const promises = _chapterIndex.chapters.map(ch => _loadChapter(ch.chapterId));
    return Promise.all(promises);
  }

  // 旧格式加载（向后兼容）
  function _loadLegacyChapters() {
    return fetch('data/chapters.json')
      .then(res => res.json())
      .then(data => {
        _cachedChapterData = data;
        _chapterDataPromise = null;
        return data;
      })
      .catch(err => {
        _chapterDataPromise = null;
        throw err;
      });
  }

  // === 优化版关卡数据（v2）===
  // 开关：是否使用优化后的关卡数据（可手动切换）
  const USE_OPTIMIZED_LEVELS = true;

  // v2 关卡数据缓存（按 levelId 索引）
  let _v2LevelsCache = null;
  let _v2LevelsPromise = null;
  let _v2LevelsAvailable = false;

  /**
   * 加载优化版关卡数据（all_levels_v2.json）
   * 带缓存，只加载一次
   * @returns {Promise<Map<number, Object>|null>} levelId -> levelData 映射，失败返回 null
   */
  function _loadV2Levels() {
    if (!USE_OPTIMIZED_LEVELS) {
      return Promise.resolve(null);
    }
    if (_v2LevelsCache) {
      return Promise.resolve(_v2LevelsCache);
    }
    if (_v2LevelsPromise) {
      return _v2LevelsPromise;
    }
    _v2LevelsPromise = fetch('data/all_levels_v2.json')
      .then(res => {
        if (!res.ok) {
          log.warn('[V2Levels] v2 关卡数据文件不存在，回退到原始关卡数据');
          _v2LevelsAvailable = false;
          _v2LevelsCache = null;
          _v2LevelsPromise = null;
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (!data || !Array.isArray(data)) {
          log.warn('[V2Levels] v2 关卡数据格式无效，回退到原始关卡数据');
          _v2LevelsAvailable = false;
          _v2LevelsCache = null;
          _v2LevelsPromise = null;
          return null;
        }
        // 转成 Map 方便按 levelId 查找
        const map = new Map();
        for (const lvl of data) {
          if (lvl.levelId != null) {
            map.set(parseInt(lvl.levelId), lvl);
          }
        }
        _v2LevelsCache = map;
        _v2LevelsAvailable = true;
        _v2LevelsPromise = null;
        log.info('[V2Levels] 优化版关卡数据加载完成，共 ' + map.size + ' 关');
        return map;
      })
      .catch(err => {
        log.warn('[V2Levels] 加载 v2 关卡数据失败，回退到原始关卡数据:', err);
        _v2LevelsAvailable = false;
        _v2LevelsCache = null;
        _v2LevelsPromise = null;
        return null;
      });
    return _v2LevelsPromise;
  }

  /**
   * 将 v2 格式的关卡数据转换为游戏内部格式
   * v2 格式差异：
   *   - cells 字段 → boardData
   *   - cage.cells 是字符串数组（"r c"）→ 二维数组（[[r,c], ...]）
   * @param {Object} v2Level - v2 格式的关卡数据
   * @returns {Object} 转换后的关卡数据
   */
  function _convertV2Level(v2Level) {
    if (!v2Level) return null;

    const converted = { ...v2Level };

    // cells -> boardData
    if (converted.cells && !converted.boardData) {
      converted.boardData = converted.cells;
    }

    // cage cells: 字符串 "r c" -> 数组 [r, c]
    if (converted.cages && Array.isArray(converted.cages)) {
      converted.cages = converted.cages.map(cage => {
        const newCage = { ...cage };
        if (newCage.cells && Array.isArray(newCage.cells)) {
          newCage.cells = newCage.cells.map(cell => {
            if (typeof cell === 'string') {
              const parts = cell.trim().split(/\s+/);
              return [parseInt(parts[0]), parseInt(parts[1])];
            }
            return cell;
          });
        }
        return newCage;
      });
    }

    return converted;
  }

  /**
   * 用 v2 数据覆盖/增强章节中的关卡数据
   * 保留章节中的剧情/教学数据，用 v2 中的棋盘/笼子数据替换
   * @param {Object} chapterLevel - 章节中的原始关卡数据
   * @param {Object} v2Level - v2 格式的关卡数据
   * @returns {Object} 合并后的关卡数据
   */
  function _mergeV2Level(chapterLevel, v2Level) {
    if (!chapterLevel) return v2Level ? _convertV2Level(v2Level) : null;
    if (!v2Level) return chapterLevel;

    const convertedV2 = _convertV2Level(v2Level);
    const merged = { ...chapterLevel };

    // v2 优先覆盖的字段（棋盘核心数据）
    const v2OverrideFields = [
      'boardData', 'cages', 'solution', 'gridSize',
      'difficulty', 'difficultyLevel',
      'threeAct',  // 三幕结构元数据
    ];
    for (const field of v2OverrideFields) {
      if (convertedV2[field] !== undefined) {
        merged[field] = convertedV2[field];
      }
    }

    // 如果 v2 有 lessonPlan 且章节没有，使用 v2 的
    if (convertedV2.lessonPlan && !merged.lessonPlan) {
      merged.lessonPlan = convertedV2.lessonPlan;
    }

    // 如果 v2 有 features 且章节没有，使用 v2 的
    if (convertedV2.features && !merged.features) {
      merged.features = convertedV2.features;
    }

    // 如果 v2 有 threeActDialog 且章节没有，使用 v2 的
    if (convertedV2.threeActDialog && !merged.threeActDialog) {
      merged.threeActDialog = convertedV2.threeActDialog;
    }

    return merged;
  }

  // === State ===
  let board = null;
  let renderer = null;
  let expertSystem = null;
  let comboSystem = null;
  let storyEngine = null;
  let currentLevelData = null;
  let currentChapterData = null;
  let currentLevelId = 101;
  let isCompleted = false;
  let startTime = 0;
  let noteMode = false;
  let hintSystem = null;
  let hintCount = 0;
  let lessonPlayer = null;       // 教学引导播放器
  let lessonBubble = null;      // 教学气泡元素
  let lessonSkipBtn = null;      // 跳过教学按钮

  let errorCount = 0;
  let chapterSelect = null;
  let startedFromSelect = false;
  let achievementPanel = null;
  let settingsPanel = null;
  let galleryPanel = null;
  let techMatrix = null;
  let gameTimer = null;
  let isPaused = false;
  let pauseElapsedTime = 0;
  let noHintStreak = 0; // 连续不使用提示的关卡数（用于 no_hint_run 成就）
  let lastHintTechnique = null; // 最近一次提示使用的技巧名（用于技巧类成就判定）
  let usedNotes = false; // 本关是否使用了笔记（用于岩之印记判定）

  // 开发调试模式
  let _debugMode = false;
  let _heatmapVisible = false; // 热力图是否显示（仅调试用）

  // 连填模式状态
  let quickFillMode = false;  // 是否处于连填模式
  let quickFillNum = null;    // 当前连填的数字
  let numBtnStartX = 0;       // 数字键按下时的X坐标
  let numBtnStartY = 0;       // 数字键按下时的Y坐标
  let _numBtnPressed = null;  // 当前按下的数字按钮元素（防止拖动误触）
  let _numBtnHandled = false; // 当前按下是否已处理（防止pointerleave重复触发）
  let longPressTimer = null;  // 长按定时器
  let longPressTriggered = false; // 是否已触发长按
  let swipeUpThreshold = 30;  // 上划触发阈值（像素）

  // UI elements to hide during story
  const UI_SELECTORS = ['#game-container', '#num-pad', '#toolbar'];

  // Character bubble state
  let _characterBubbleEl = null;
  let _characterBubbleTimer = null;
  let _characterBubbleVisible = false;

  // Character portrait emoji mapping (fallback if image not available)
  const CHAR_EMOJI = {
    ayan: '🌸',
    cagekeeper: '🔒',
    ying: '✨',
    shenmo: '📖',
    plotter: '🎭',
    plotterShadow: '👤',
    setterSecret: '🔮',
    weaver: '⭐',
    remnant: '🛡️',
  };

  // Character name to ID mapping
  const NAME_TO_CHAR = {
    '阿妍': 'ayan',
    '守笼人': 'cagekeeper',
    '莹莹': 'ying',
    '沈墨': 'shenmo',
    '设局人': 'plotter',
    '设局人残影': 'plotterShadow',
    '设局人（残影）': 'plotterShadow',
    '设局人（秘术）': 'setterSecret',
    '星辰梭': 'weaver',
    '残局守护者': 'remnant',
  };

  // === Init ===
  window.onload = async function() {
    log.info('Guide mode starting...');

    // Init audio
    AudioService.init();

    // Init settings panel
    if (typeof SettingsPanel !== 'undefined') {
      settingsPanel = new SettingsPanel({
        onResetProgress: () => {
          if (global.ProgressManager) ProgressManager.reset();
        },
      });
      settingsPanel.load();
    }

    // Init expert system
    expertSystem = new ExpertSystem();
    expertSystem.init({
      thresholds: { stuckMs: 45000 },
      onFeedback: (msg, level) => showToast(msg),
    });
    global.ExpertSystem = expertSystem;

    // Register character-based feedback handlers
    registerExpertCharacterHandlers();

    // Get story engine
    storyEngine = global.StoryEngine;

    // Global click to advance story + unlock audio
    document.addEventListener('click', (e) => {
      if (typeof AudioService !== 'undefined') {
        AudioService.unlock();
      }
      if (storyEngine && storyEngine._isPlaying) {
        if (e.target.closest('button, .num-btn, #num-pad, #chapter-select-overlay')) return;
        storyEngine.nextDialogue();
      }
    });

    // Init progress
    if (global.ProgressManager) {
      ProgressManager.load();
    }

    // Read level ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');

    // 检测调试模式（?debug=1）
    _debugMode = urlParams.get('debug') === '1';
    if (_debugMode) {
      log.info('[Debug] 调试模式已启用');
    }

    // Setup chapter select
    setupChapterSelect();

    if (idParam) {
      // Direct level load (backward compatible)
      currentLevelId = parseInt(idParam) || currentLevelId;
      await startLevel(currentLevelId);
    } else {
      // Show chapter select screen
      if (chapterSelect) {
        await chapterSelect.loadChapters();
        chapterSelect.show();
      } else {
        // Fallback: start at level 101
        await startLevel(101);
      }
    }
  };

  // === Level Loading ===
  async function loadLevel(levelId) {
    try {
      const data = await getChapterData();

      // 支持延迟加载模式：加载所有章节到 chapters 数组，保持向后兼容
      if (data._lazy && typeof data.getAllChapters === 'function') {
        const allChapters = await data.getAllChapters();
        data.chapters = allChapters; // 填充到 chapters 字段，兼容旧代码
      }

      global.CHAPTER_DATA = data;

      // Find level in chapter data
      let foundLevel = null;
      let foundChapter = null;
      for (const ch of data.chapters) {
        for (const lvl of ch.levels) {
          if (lvl.levelId === levelId) {
            foundLevel = lvl;
            foundChapter = ch;
            break;
          }
        }
        if (foundLevel) break;
      }

      if (!foundLevel) {
        log.warn('Level not found in chapter data:', levelId);
        return;
      }

      currentChapterData = foundChapter;

      // 尝试加载 v2 优化关卡数据并合并
      if (USE_OPTIMIZED_LEVELS) {
        try {
          const v2Map = await _loadV2Levels();
          if (v2Map && v2Map.has(parseInt(levelId))) {
            const v2Level = v2Map.get(parseInt(levelId));
            currentLevelData = _mergeV2Level(foundLevel, v2Level);
            log.info('[V2Levels] 使用优化版关卡数据:', levelId);
            if (currentLevelData.threeAct) {
              log.info('[ThreeAct] 使用原生三幕数据: opening=' +
                currentLevelData.threeAct.opening.length +
                ', breakthrough=' + currentLevelData.threeAct.breakthrough.length +
                ', avalanche=' + currentLevelData.threeAct.avalanche.length);
            } else {
              log.info('[ThreeAct] 无原生三幕数据，将使用分类器兜底');
            }
            return;
          }
        } catch (v2Err) {
          log.warn('[V2Levels] 加载 v2 数据失败，使用原始关卡数据:', v2Err);
        }
      }

      // 回退：使用章节中的原始数据
      currentLevelData = foundLevel;
      if (currentLevelData && currentLevelData.threeAct) {
        log.info('[ThreeAct] 使用章节三幕数据: opening=' +
          currentLevelData.threeAct.opening.length +
          ', breakthrough=' + currentLevelData.threeAct.breakthrough.length +
          ', avalanche=' + currentLevelData.threeAct.avalanche.length);
      }
    } catch(e) {
      log.error('Failed to load level:', e);
    }
  }

  /**
   * 根据levelId查找关卡数据（不改变当前状态）
   * @param {number|string} levelId - 关卡ID
   * @returns {object|null} 关卡数据
   */
  function _findLevelData(levelId) {
    if (!global.CHAPTER_DATA) return null;
    const numId = parseInt(levelId);
    for (const ch of global.CHAPTER_DATA.chapters) {
      for (const lvl of ch.levels) {
        if (parseInt(lvl.levelId) === numId) {
          return lvl;
        }
      }
    }
    return null;
  }

  /**
   * 用当前currentLevelData重新初始化棋盘（用于对战关卡切换）
   */
  function _reinitBoardForBattle() {
    if (!currentLevelData) return;

    // 重新创建Board
    const gridSize = currentLevelData.gridSize || 9;
    board = new Board(gridSize);
    board.loadLevel({
      cells: currentLevelData.boardData,
      cages: currentLevelData.cages || [],
      levelId: currentLevelId,
      // Boss战机制数据
      lockCells: currentLevelData.lockCells,
      fakeCells: currentLevelData.fakeCells,
      regionLocks: currentLevelData.regionLocks,
      cageCollapse: currentLevelData.cageCollapse,
      dualPath: currentLevelData.dualPath,
      phases: currentLevelData.phases,
    });

    // 重新初始化渲染器
    if (renderer) {
      // 清除缓存，强制重绘
      renderer._staticCache = null;
      renderer._staticCacheKey = null;
      renderer._boardCache = null;
      renderer._boardCacheKey = null;
      renderer._cageDepthCache = null;
      renderer.recalcCellSize(board);
      renderer.render(board);
    }

    // 重新初始化笔记系统
    if (typeof NoteSystem !== 'undefined' && renderer) {
      const noteSys = new NoteSystem(board, renderer, {
        perspective: 'hero',
        mode: 'classic',
        maxGlimpseCount: 3,
        glimpseDuration: 3000,
      });
      window.gameNoteSystem = noteSys;
      if (typeof renderer.setNoteSystem === 'function') {
        renderer.setNoteSystem(noteSys);
      }
      global.guideNoteSystem = noteSys;
    }

    log.info('[Boss] 棋盘已重新初始化为对战关卡');
  }

  // === Start Level (full flow) ===
  /**
   * 关卡切换时清理所有运行时状态和定时器，防止内存泄漏和状态残留
   */
  function _cleanupLevelState() {
    // 清理长按定时器
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressTriggered = false;

    // 清理拖拽状态
    isDragging = false;
    dragStartCell = null;
    _swipeStartPos = null;

    // 清理激活数字
    activeNumber = null;
    quickFillMode = false;
    quickFillNum = null;
    numBtnStartX = 0;
    numBtnStartY = 0;
    if (typeof updateNumBtnActiveState === 'function') {
      updateNumBtnActiveState();
    }

    // 清理笔记模式状态
    noteMode = false;
    if (board) {
      board.setInputMode('normal');
    }
    if (typeof updateNoteButtonState === 'function') {
      updateNoteButtonState();
    }

    // 清理笔记系统
    if (window.gameNoteSystem) {
      window.gameNoteSystem = null;
    }
    if (global.guideNoteSystem) {
      global.guideNoteSystem = null;
    }
    if (renderer && typeof renderer.setNoteSystem === 'function') {
      renderer.setNoteSystem(null);
    }

    // 清理角色气泡定时器
    if (_characterBubbleTimer) {
      clearTimeout(_characterBubbleTimer);
      _characterBubbleTimer = null;
    }
    if (_characterBubbleEl) {
      _characterBubbleEl.remove();
      _characterBubbleEl = null;
    }
    _characterBubbleVisible = false;

    // 清理完成状态标志
    isPaused = false;
    lastHintTechnique = null;

    // 清理连击系统
    if (comboSystem) {
      if (comboSystem._updateInterval) {
        clearInterval(comboSystem._updateInterval);
        comboSystem._updateInterval = null;
      }
      if (typeof comboSystem.destroy === 'function') {
        comboSystem.destroy();
      }
      comboSystem = null;
    }

    // 清理Boss战系统
    if (typeof GuideBattle !== 'undefined' && (GuideBattle.active || GuideBattle.ended)) {
      GuideBattle.stop();
    }
    bossBattleStarted = false;
    const bossHud = document.getElementById('boss-battle-hud');
    if (bossHud) bossHud.classList.remove('visible');
    const bossBubble = document.getElementById('boss-bubble');
    if (bossBubble) bossBubble.remove();
    if (GuideBattle && GuideBattle._hudInterval) {
      clearInterval(GuideBattle._hudInterval);
      GuideBattle._hudInterval = null;
    }

    // 清理教学引导系统
    if (lessonPlayer) {
      lessonPlayer.destroy();
      lessonPlayer = null;
    }
    _hideLessonBubble();
    _hideLessonSkipBtn();

    // 隐藏暂停菜单
    const pauseOverlay = document.getElementById('pause-overlay');
    if (pauseOverlay) {
      pauseOverlay.style.display = 'none';
      pauseOverlay.style.opacity = '0';
    }

    // 清理分层过关系统缓存
    if (typeof WinConditionManager !== 'undefined') {
      try { WinConditionManager.clearPristineCache(); } catch(e) {}
    }

    // 清理三幕式引导
    if (typeof ThreeActGuide !== 'undefined') {
      try { ThreeActGuide.cleanup(); } catch(e) {}
    }
  }

  // ============================================================
  // LessonPlayer - 教学引导系统
  // ============================================================

  function _startLessonPlayer() {
    if (typeof LessonPlayer === 'undefined') return;
    if (!currentLevelData?.lessonPlan) return;

    // 创建 LessonPlayer 实例
    lessonPlayer = new LessonPlayer({
      board: board,
      renderer: renderer,
      levelData: currentLevelData,
    });

    // 注册回调
    lessonPlayer
      .onComplete(() => {
        log.info('[LessonPlayer] 教学完成');
        _hideLessonSkipBtn();
        _hideLessonBubble();
        _hideLessonTapHint();
        _clearAllButtonHighlights();
      })
      .onSkip(() => {
        log.info('[LessonPlayer] 玩家跳过教学');
        _hideLessonSkipBtn();
        _hideLessonBubble();
        _hideLessonTapHint();
        _clearAllButtonHighlights();
      })
      .onNeedInput((phase, data) => {
        log.info('[LessonPlayer] 等待输入:', phase, data);
        // NOTE_ONLY 模式：自动切换到笔记模式，并选中目标格
        if (data?.interactionType === 'NOTE_ONLY') {
          if (!noteMode) {
            toggleNoteMode(true); // 强制开启笔记模式
          }
          // 自动选中目标格
          if (data.cell && board) {
            board.selectCell(data.cell[0], data.cell[1]);
            if (renderer) renderer.render(board);
          }
        }
      })
      .onPhaseChange((phase, prev) => {
        // 根据阶段更新跳过按钮显示
        if (phase === 'free' || phase === 'done') {
          _hideLessonSkipBtn();
        } else {
          _showLessonSkipBtn();
        }
        // guided 及之后阶段隐藏"点击继续"提示
        if (phase === 'guided' || phase === 'semiAuto' || phase === 'free' || phase === 'done') {
          _hideLessonTapHint();
        }
      });

    // 监听气泡事件
    document.addEventListener('lesson-bubble', _onLessonBubble);

    // 监听按钮高亮事件
    document.addEventListener('lesson-highlight-button', _onLessonHighlightButton);

    // 启动
    const started = lessonPlayer.start();
    if (started) {
      _showLessonSkipBtn();
      log.info('[LessonPlayer] 已启动:', currentLevelData.lessonPlan.newSkill);
    }
  }

  function _onLessonBubble(e) {
    const { text, speaker, voiceId } = e.detail;
    // intro/demo 阶段显示"点击继续"提示
    const phase = lessonPlayer ? lessonPlayer.currentPhase : null;
    const showTapHint = (phase === 'intro' || phase === 'demo');
    _showLessonBubble(text, speaker, voiceId, showTapHint);
  }

  // --- 教学按钮高亮 ---
  const _highlightedButtons = new Set(); // 当前高亮的按钮
  let _buttonPulseTimer = null;

  function _onLessonHighlightButton(e) {
    const { button, highlight } = e.detail;
    const btnId = 'btn-' + button; // 如 btn-note
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (highlight) {
      _highlightedButtons.add(btnId);
      // 添加脉冲高亮样式
      btn.style.transition = 'box-shadow 0.3s, transform 0.3s';
      btn.style.boxShadow = '0 0 0 3px rgba(251, 191, 36, 0.6), 0 0 20px rgba(251, 191, 36, 0.4)';
      btn.style.transform = 'scale(1.1)';
      // 脉冲动画
      _startButtonPulse(btn);
    } else {
      _highlightedButtons.delete(btnId);
      btn.style.boxShadow = '';
      btn.style.transform = '';
      _stopButtonPulse(btn);
    }
  }

  function _startButtonPulse(btn) {
    if (btn._pulseInterval) return;
    let scaleUp = true;
    btn._pulseInterval = setInterval(() => {
      scaleUp = !scaleUp;
      btn.style.transform = scaleUp ? 'scale(1.1)' : 'scale(1.05)';
    }, 600);
  }

  function _stopButtonPulse(btn) {
    if (btn._pulseInterval) {
      clearInterval(btn._pulseInterval);
      btn._pulseInterval = null;
    }
  }

  function _clearAllButtonHighlights() {
    _highlightedButtons.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.style.boxShadow = '';
        btn.style.transform = '';
        _stopButtonPulse(btn);
      }
    });
    _highlightedButtons.clear();
  }

  // --- 教学气泡 ---
  function _showLessonBubble(text, speaker, voiceId, showTapHint) {
    if (!lessonBubble) {
      lessonBubble = document.createElement('div');
      lessonBubble.id = 'lesson-bubble';
      lessonBubble.style.cssText = `
        position: absolute;
        bottom: 90px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
        color: #fff;
        padding: 12px 20px;
        border-radius: 14px;
        font-size: 14px;
        line-height: 1.5;
        max-width: 85%;
        box-shadow: 0 4px 20px rgba(139, 92, 246, 0.4);
        z-index: 100;
        text-align: center;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
        white-space: pre-wrap;
      `;
      const gameContainer = document.getElementById('game-container') || document.body;
      gameContainer.appendChild(lessonBubble);
    }

    lessonBubble.textContent = text;
    lessonBubble.style.opacity = '1';

    // 显示/隐藏"点击继续"提示
    if (showTapHint) {
      _showLessonTapHint();
    } else {
      _hideLessonTapHint();
    }

    // 自动消失（根据文字长度计算时间）
    if (lessonBubble._hideTimer) clearTimeout(lessonBubble._hideTimer);
    const duration = Math.max(2000, text.length * 180); // 每字180ms，最少2秒
    lessonBubble._hideTimer = setTimeout(() => {
      if (lessonBubble) lessonBubble.style.opacity = '0';
      _hideLessonTapHint();
    }, duration);
  }

  // "点击屏幕继续"闪烁提示
  let _lessonTapHint = null;
  let _lessonTapBlinkTimer = null;

  function _showLessonTapHint() {
    if (!_lessonTapHint) {
      _lessonTapHint = document.createElement('div');
      _lessonTapHint.style.cssText = `
        position: absolute;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%);
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        padding: 6px 14px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 20px;
        z-index: 99;
        pointer-events: none;
        animation: lesson-tap-blink 1.5s ease-in-out infinite;
      `;
      _lessonTapHint.textContent = '👆 点击屏幕继续';
      // 添加动画样式
      if (!document.getElementById('lesson-tap-animation')) {
        const style = document.createElement('style');
        style.id = 'lesson-tap-animation';
        style.textContent = `
          @keyframes lesson-tap-blink {
            0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
            50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
          }
        `;
        document.head.appendChild(style);
      }
      const gameContainer = document.getElementById('game-container') || document.body;
      gameContainer.appendChild(_lessonTapHint);
    }
    _lessonTapHint.style.opacity = '1';
  }

  function _hideLessonTapHint() {
    if (_lessonTapHint) {
      _lessonTapHint.style.opacity = '0';
    }
  }

  function _hideLessonBubble() {
    if (lessonBubble) {
      lessonBubble.style.opacity = '0';
    }
  }

  // --- 跳过按钮 ---
  function _showLessonSkipBtn() {
    if (!lessonSkipBtn) {
      lessonSkipBtn = document.createElement('button');
      lessonSkipBtn.id = 'lesson-skip-btn';
      lessonSkipBtn.textContent = '跳过教学 →';
      lessonSkipBtn.style.cssText = `
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(255, 255, 255, 0.9);
        color: #6b7280;
        border: 1px solid #e5e7eb;
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 13px;
        cursor: pointer;
        z-index: 101;
        backdrop-filter: blur(10px);
        transition: all 0.2s;
      `;
      lessonSkipBtn.addEventListener('mouseenter', () => {
        lessonSkipBtn.style.background = '#f3f4f6';
        lessonSkipBtn.style.color = '#374151';
      });
      lessonSkipBtn.addEventListener('mouseleave', () => {
        lessonSkipBtn.style.background = 'rgba(255, 255, 255, 0.9)';
        lessonSkipBtn.style.color = '#6b7280';
      });
      lessonSkipBtn.addEventListener('click', () => {
        if (lessonPlayer) {
          lessonPlayer.skip();
        }
      });
      const gameContainer = document.getElementById('game-container') || document.body;
      gameContainer.appendChild(lessonSkipBtn);
    }
    lessonSkipBtn.style.display = 'block';
  }

  function _hideLessonSkipBtn() {
    if (lessonSkipBtn) {
      lessonSkipBtn.style.display = 'none';
    }
  }

  // --- 玩家输入拦截（用于 guided 阶段） ---
  function _lessonHandleCellFill(r, c, num) {
    if (!lessonPlayer || !lessonPlayer.isActive) return null;
    if (!lessonPlayer.isWaitingInput) return null;

    const result = lessonPlayer.handleCellFill(r, c, num);
    if (!result.handled) return null;

    if (result.correct === true) {
      // 正确：额外播正确音效（填数本身由后面的通用逻辑处理）
      AudioService.sfx.play('fill_correct');
      if (renderer && typeof renderer.triggerFillAnimation === 'function') {
        renderer.triggerFillAnimation(r, c, 300);
      }
      updateNumBtnCompletedState();
      // 不在这里 checkCompletion，等通用逻辑处理
    } else if (result.correct === false) {
      // 错误：额外播错误音效 + 教学提示（填数本身由后面的通用逻辑处理）
      AudioService.sfx.play('fill_wrong');
      errorCount++;
    }

    return result;
  }

  async function startLevel(levelId) {
    // ===== 关卡切换：清理所有运行时状态和定时器 =====
    _cleanupLevelState();

    currentLevelId = levelId;
    isCompleted = false;
    errorCount = 0;
    hintCount = 0;
    usedNotes = false;

    // Load level data
    await loadLevel(levelId);

    // Find chapter data
    findChapter();

    // 剧情播放期间暂停计时器
    if (gameTimer) gameTimer.pauseForDialog();

    // Play prologue (first level of chapter only)
    if (isFirstLevelOfChapter()) {
      await playPrologue();
    }

    // Play pre-dialog (level-specific teaching dialogue)
    await playPreDialog();

    // 三幕式引导·钩子1：第一幕引子（棋盘前的纯对话）
    if (typeof ThreeActGuide !== 'undefined') {
      try { await ThreeActGuide.playAct1Intro(); } catch(e) {}
    }

    // 剧情结束，恢复计时器
    if (gameTimer) gameTimer.resumeFromDialog();

    // 切换BGM：序章用intro，正式关卡用对应章节BGM，Boss关用boss战音乐
    const chapterId = currentChapterData ? currentChapterData.chapterId : 1;
    if (isLastLevelOfChapter()) {
      // 每章最后一关是Boss战，播放Boss战音乐
      AudioService.bgm.playFile('boss_battle.mp3');
    } else {
      // 普通关卡播放章节BGM（如 chapter_1.mp3）
      AudioService.bgm.play(chapterId);
    }

    // Init board
    initBoard();

    // 三幕式引导·钩子2：第一幕揭盘（棋盘渲染后，高亮 + 对话）
    if (typeof ThreeActGuide !== 'undefined') {
      try { await ThreeActGuide.playAct1BoardReveal(); } catch(e) {}
    }

    // 异步预加载关卡关键音效（不阻塞主流程）
    try {
      if (typeof AudioService !== 'undefined' && AudioService.sfx && AudioService.sfx.preloadLevelSfx) {
        AudioService.sfx.preloadLevelSfx(currentLevelId, currentLevelData);
      }
    } catch(e) {
      log.debug('preloadLevelSfx failed:', e);
    }

    // 启动Boss战（如果是章节最后一关）
    if (typeof GuideBattle !== 'undefined' && isLastLevelOfChapter()) {
      startBossBattle();
    }

    // Setup next level button
    setupNextLevel();

    // 兜底：确保交互是解锁状态
    setInteractionLocked(false);
    // 确保棋盘 pointer-events 正常
    const canvas = document.getElementById('gameCanvas');
    if (canvas) canvas.style.pointerEvents = '';
    // 确保数字键和工具栏可点击
    document.querySelectorAll('.num-btn, #toolbar button').forEach(el => {
      el.style.pointerEvents = '';
    });
    // 确保技术矩阵是关闭的
    if (techMatrix && typeof techMatrix.hide === 'function') {
      techMatrix.hide();
    }

    // Start level
    if (gameTimer) {
      gameTimer.start();
    } else {
      startTime = Date.now();
    }
    hintCount = 0;
    expertSystem.onLevelStart();

    // 保存上次游玩关卡
    if (global.ProgressManager && typeof ProgressManager.setLastPlayedLevel === 'function') {
      ProgressManager.setLastPlayedLevel(currentLevelId);
    }

    // 启动教学引导（如果有 lessonPlan）
    _startLessonPlayer();

    log.info('Level started:', currentLevelId);
  }

  // === Chapter Select Setup ===
  function setupChapterSelect() {
    if (!global.ChapterSelect) return;

    // 设置成就解锁回调
    if (global.ProgressManager) {
      ProgressManager.onAchievementUnlock(function(achievement) {
        showAchievementToast(achievement);
        // 刷新成就面板
        if (achievementPanel) {
          try { achievementPanel.refresh(); } catch (e) {}
        }
      });
    }

    // 初始化成就面板
    if (global.AchievementPanel) {
      achievementPanel = new AchievementPanel();
    }

    // 初始化图鉴面板
    if (global.GalleryPanel) {
      galleryPanel = new GalleryPanel();
      // 暴露 UI 控制函数到全局，供图鉴剧情回放使用
      global.setUIVisible = setUIVisible;
      global.setInteractionLocked = setInteractionLocked;
    }

    chapterSelect = new ChapterSelect({
      onSelectLevel: function(levelId) {
        startedFromSelect = true;
        startLevel(levelId);
      },
    });

    // Toolbar chapter button
    const btnChapter = document.getElementById('btn-chapter');
    if (btnChapter) {
      btnChapter.addEventListener('click', () => {
        AudioService.sfx.play('click');
        if (chapterSelect) {
          if (chapterSelect._isVisible) {
            chapterSelect.hide();
          } else {
            chapterSelect.show();
          }
        }
      });
    }

    // 初始化游戏计时器
    initGameTimer();
  }

  // === 游戏计时器初始化 ===
  function initGameTimer() {
    if (typeof GameTimer === 'undefined') return;

    // 查找或创建计时器显示元素
    let timerEl = document.getElementById('game-timer-display');
    if (!timerEl) {
      // 兼容旧布局：动态创建并插入到 toolbar 中
      const toolbar = document.getElementById('toolbar');
      if (toolbar) {
        timerEl = document.createElement('div');
        timerEl.id = 'game-timer-display';
        timerEl.style.cssText =
          'display:flex;align-items:center;justify-content:center;' +
          'min-width:64px;height:36px;padding:0 12px;' +
          'background:rgba(15,23,42,0.6);border:1px solid rgba(251,191,36,0.2);' +
          'border-radius:8px;font-size:14px;font-weight:700;' +
          'color:#fbbf24;letter-spacing:2px;font-family:monospace;' +
          'user-select:none;';
        timerEl.textContent = '00:00';
        timerEl.title = '游戏时间（点击暂停/继续）';
        toolbar.insertBefore(timerEl, toolbar.firstChild);
      }
    }
    // 绑定点击事件
    if (timerEl) {
      timerEl.addEventListener('click', () => {
        if (gameTimer && gameTimer.isRunning) {
          gameTimer.toggle();
          timerEl.style.opacity = gameTimer.isPaused ? '0.5' : '1';
        }
      });
    }

    // 创建计时器实例
    gameTimer = new GameTimer({
      onTick: (seconds) => {
        const timerEl = document.getElementById('game-timer-display');
        if (timerEl) {
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          timerEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }
        // 累计游戏时长（用于 persistent 成就）
        if (global.ProgressManager && seconds > 0 && seconds % 60 === 0) {
          ProgressManager.addPlayTime(60);
          // 检查 persistent 成就
          if (ProgressManager.getTotalPlayTime() >= 3600) {
            ProgressManager.unlockAchievement('persistent');
          }
        }
      },
      onPause: () => {
        const timerEl = document.getElementById('game-timer-display');
        if (timerEl) timerEl.style.opacity = '0.5';
      },
      onResume: () => {
        const timerEl = document.getElementById('game-timer-display');
        if (timerEl) timerEl.style.opacity = '1';
      },
      autoPauseOnHide: true,
    });
  }

  // === Find Chapter ===
  function findChapter() {
    if (!currentLevelData || !global.CHAPTER_DATA) return;
    const numId = parseInt(currentLevelId);
    const chapterId = Math.floor(numId / 100);
    for (const ch of global.CHAPTER_DATA.chapters) {
      if (ch.chapterId === chapterId) {
        currentChapterData = ch;
        return;
      }
    }
  }

  // === Unlock Characters from Dialog ===
  function unlockCharactersFromDialog(dialogLines) {
    if (!galleryPanel || !dialogLines || !Array.isArray(dialogLines)) return;

    dialogLines.forEach(line => {
      if (!line.speaker) return;
      const charId = NAME_TO_CHAR[line.speaker];
      if (charId) {
        galleryPanel.unlockCharacter(charId);
      }
    });
  }

  // === Unlock Backgrounds from Dialog ===
  function unlockBackgroundsFromDialog(dialogLines) {
    if (!galleryPanel || !dialogLines || !Array.isArray(dialogLines)) return;

    dialogLines.forEach(line => {
      if (line.bg) {
        // 提取背景文件名（去掉路径和扩展名）
        let bgName = line.bg;
        if (bgName.startsWith('assets/')) {
          bgName = bgName.substring(bgName.lastIndexOf('/') + 1);
        }
        galleryPanel.unlockBackground(bgName);
      }
    });
  }

  // === Unlock Single Background ===
  function unlockBackground(bgPath) {
    if (!galleryPanel || !bgPath) return;
    let bgName = bgPath;
    if (bgName.startsWith('assets/')) {
      bgName = bgName.substring(bgName.lastIndexOf('/') + 1);
    }
    galleryPanel.unlockBackground(bgName);
  }

  // === Play Pre-Dialog ===
  // 各章节默认背景图（用于preDialog没有设置bg时的兜底）
  const CHAPTER_DEFAULT_BG = {
    1: 'assets/images/backgrounds/bg_scene1_single_door_v2.jpg',
    2: 'assets/images/backgrounds/bg_scene13.jpg',
    3: 'assets/images/backgrounds/bg_scene23.jpg',
    4: 'assets/images/backgrounds/bg_scene32.jpg',
    5: 'assets/images/backgrounds/bg_scene40.jpg',
    6: 'assets/images/backgrounds/bg_scene48.jpg',
    7: 'assets/images/backgrounds/bg_scene56.jpg',
    8: 'assets/images/backgrounds/bg_scene63.jpg',
  };

  function playPreDialog() {
    return new Promise((resolve) => {
      if (!storyEngine || !currentLevelData) {
        resolve();
        return;
      }

      const preDialog = currentLevelData.preDialog || [];
      if (preDialog.length === 0) {
        resolve();
        return;
      }

      // 解锁出现的角色
      unlockCharactersFromDialog(preDialog);

      // 解锁对话中出现的背景
      unlockBackgroundsFromDialog(preDialog);

      // 设置场景键，用于已读剧情记录
      const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
      storyEngine.setSceneKey(chapterId + '_' + currentLevelId + '_pre');

      // 如果对话中没有设置背景，且当前没有背景，则设置章节默认背景
      const hasBgInDialog = preDialog.some(line => line.bg);
      const hasCurrentBg = storyEngine._currentBg;
      if (!hasBgInDialog && !hasCurrentBg && CHAPTER_DEFAULT_BG[chapterId]) {
        storyEngine._changeBg(CHAPTER_DEFAULT_BG[chapterId]);
        // 解锁章节默认背景
        unlockBackground(CHAPTER_DEFAULT_BG[chapterId]);
      }

      // Hide game UI during story
      setUIVisible(false);

      log.info('Playing pre-dialog (%d lines)', preDialog.length);
      storyEngine.sayLines(preDialog, () => {
        setUIVisible(true);
        setInteractionLocked(false);
        // 标记剧情已读（图鉴用）
        if (galleryPanel) {
          galleryPanel.markSceneRead(chapterId, currentLevelId, 'pre');
        }
        resolve();
      });
    });
  }

  // === Play Prologue ===
  function playPrologue() {
    return new Promise((resolve) => {
      if (!storyEngine || !currentChapterData) {
        resolve();
        return;
      }

      const prologue = currentChapterData.prologue || currentChapterData.introStory || [];
      if (prologue.length === 0) {
        resolve();
        return;
      }

      // 解锁出现的角色
      unlockCharactersFromDialog(prologue);

      // 解锁对话中出现的背景
      unlockBackgroundsFromDialog(prologue);

      // 设置场景键，用于已读剧情记录
      const chapterId = currentChapterData.chapterId;
      storyEngine.setSceneKey(chapterId + '_prologue');

      // Hide game UI during story
      setUIVisible(false);

      // Start BGM - intro.mp3 for prologue
      AudioService.bgm.playFile('intro.mp3');

      log.info('Playing prologue (%d lines)', prologue.length);
      storyEngine.sayLines(prologue, () => {
        // Show game UI after story
        setUIVisible(true);
        setInteractionLocked(false);
        // 标记剧情已读（图鉴用）
        if (galleryPanel) {
          galleryPanel.markSceneRead(chapterId, 0, 'prologue');
        }
        resolve();
      });
    });
  }

  function isFirstLevelOfChapter() {
    if (!currentChapterData || !currentChapterData.levels) return false;
    const levels = currentChapterData.levels;
    // 只考虑普通关卡（非隐藏关）作为章节的第一关
    const normalLevels = levels.filter(function(lvl) { return !lvl.isHidden; });
    return normalLevels.length > 0 && normalLevels[0].levelId === currentLevelId;
  }

  // === Boss战系统 ===
  let bossBattleStarted = false;
  let currentBossConfig = null;
  let currentDifficulty = 'normal'; // easy / normal / hard

  // 难度倍率配置
  const DIFFICULTY_MULTIPLIERS = {
    easy:   { speed: 1.8, mistake: 1.8, intercept: 0.5, discovery: 0.6 },  // 简单：AI慢，失误多
    normal: { speed: 1.0, mistake: 1.0, intercept: 1.0, discovery: 1.0 },  // 普通：基准
    hard:   { speed: 0.7, mistake: 0.5, intercept: 1.5, discovery: 1.2 },  // 困难：AI快，失误少
  };

  function startBossBattle() {
    if (typeof GuideBattle === 'undefined' || !currentChapterData) return;

    const chapterId = currentChapterData.chapterId;
    const bossConfig = GuideBattle.getBossConfig(chapterId);
    if (!bossConfig) {
      console.warn('[Boss] No boss config for chapter', chapterId);
      return;
    }

    currentBossConfig = bossConfig;
    bossBattleStarted = true;
    log.info('[Boss] Starting battle vs', bossConfig.name, '难度:', currentDifficulty);

    // 更新HUD
    const bossNameEl = document.getElementById('boss-hud-boss-name');
    if (bossNameEl) bossNameEl.textContent = bossConfig.name;

    // 更新Boss头像
    const portraitEl = document.getElementById('boss-hud-portrait');
    if (portraitEl && bossConfig.portrait) {
      portraitEl.src = 'assets/images/portraits/' + bossConfig.portrait;
      portraitEl.onerror = function() {
        this.style.display = 'none';
      };
    }

    // 更新头像边框颜色为Boss主题色
    const portraitRing = document.querySelector('.boss-hud-portrait-ring');
    if (portraitRing && bossConfig.color) {
      portraitRing.style.borderTopColor = bossConfig.color;
      portraitRing.style.borderRightColor = bossConfig.color + '66';
    }
    const portraitImg = document.querySelector('.boss-hud-portrait');
    if (portraitImg && bossConfig.color) {
      portraitImg.style.borderColor = bossConfig.color + '99';
    }

    const hud = document.getElementById('boss-battle-hud');
    if (hud) hud.classList.add('visible');

    // 绑定重试按钮
    const retryBtn = document.getElementById('boss-hud-retry');
    if (retryBtn) {
      retryBtn.onclick = function() {
        retryBossBattle();
      };
    }

    // 绑定难度按钮
    const diffBtn = document.getElementById('boss-hud-difficulty');
    if (diffBtn) {
      diffBtn.onclick = function(e) {
        e.stopPropagation();
        toggleDifficultyPanel();
      };
    }

    // 绑定难度选项
    document.querySelectorAll('.boss-diff-btn').forEach(function(btn) {
      btn.onclick = function() {
        const diff = this.getAttribute('data-diff');
        setDifficulty(diff);
      };
    });

    // 点击外部关闭难度面板
    document.addEventListener('click', function(e) {
      const panel = document.getElementById('boss-difficulty-panel');
      const diffBtn = document.getElementById('boss-hud-difficulty');
      if (panel && panel.classList.contains('show') &&
          !panel.contains(e.target) && e.target !== diffBtn) {
        panel.classList.remove('show');
      }

      // 右侧浮条面板：点击外部关闭
      const floatBar = document.getElementById('right-floating-bar');
      if (floatBar && floatBar.classList.contains('panel-open')) {
        const tab = document.getElementById('float-bar-tab');
        const floatPanel = floatBar.querySelector('.float-bar-panel');
        if (!floatBar.contains(e.target)) {
          floatBar.classList.remove('panel-open');
        }
      }
    });

    // 更新难度按钮状态
    updateDifficultyUI();

    // 应用难度到Boss配置
    const adjustedConfig = applyDifficultyToBoss(bossConfig, currentDifficulty);

    // 播放战前对话（如果有）
    if (adjustedConfig.preDialog && adjustedConfig.preDialog.length > 0 && storyEngine) {
      setInteractionLocked(true);
      const dialogLines = adjustedConfig.preDialog.map(line => ({
        speaker: line.speaker,
        text: line.text,
        emotion: line.emotion || 'default',
      }));
      storyEngine.sayLines(dialogLines, () => {
        setInteractionLocked(false);
        _initBossBattle(adjustedConfig);
      });
    } else {
      _initBossBattle(adjustedConfig);
    }
  }

  /**
   * 重试Boss战
   */
  function retryBossBattle() {
    if (!currentBossConfig) return;

    log.info('[Boss] Retry battle');

    // 停止当前战斗
    if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
      GuideBattle.stop();
    }

    // 重置棋盘
    if (currentLevelData && board) {
      board.loadLevel({
        cells: currentLevelData.boardData,
        cages: currentLevelData.cages || [],
        levelId: currentLevelId,
      });
      if (renderer) {
        renderer.render(board);
      }
    }

    // 关闭难度面板
    const panel = document.getElementById('boss-difficulty-panel');
    if (panel) panel.classList.remove('show');

    // 重新开始（用当前难度）
    bossBattleStarted = false;
    setTimeout(function() {
      startBossBattle();
    }, 300);
  }

  /**
   * 切换难度面板显示
   */
  function toggleDifficultyPanel() {
    const panel = document.getElementById('boss-difficulty-panel');
    if (panel) {
      panel.classList.toggle('show');
    }
  }

  /**
   * 设置难度
   */
  function setDifficulty(diff) {
    if (!DIFFICULTY_MULTIPLIERS[diff]) return;
    currentDifficulty = diff;
    updateDifficultyUI();
    log.info('[Boss] 难度切换为:', diff);

    // 保存到本地存储
    try {
      localStorage.setItem('boss_difficulty', diff);
    } catch(e) {}

    // 如果战斗进行中，自动重开
    if (bossBattleStarted && GuideBattle.active) {
      setTimeout(function() {
        retryBossBattle();
      }, 300);
    }
  }

  /**
   * 更新难度UI状态
   */
  function updateDifficultyUI() {
    document.querySelectorAll('.boss-diff-btn').forEach(function(btn) {
      const diff = btn.getAttribute('data-diff');
      if (diff === currentDifficulty) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * 将难度倍率应用到Boss配置
   */
  function applyDifficultyToBoss(bossConfig, difficulty) {
    const mult = DIFFICULTY_MULTIPLIERS[difficulty] || DIFFICULTY_MULTIPLIERS.normal;

    // 深拷贝配置
    const adjusted = JSON.parse(JSON.stringify(bossConfig));

    // 调整基础速度
    adjusted.speedMin = Math.round(bossConfig.speedMin * mult.speed);
    adjusted.speedMax = Math.round(bossConfig.speedMax * mult.speed);

    // 调整基础失误率
    adjusted.mistakeChance = Math.min(0.5, bossConfig.mistakeChance * mult.mistake);

    // 调整AI难度
    if (!adjusted.aiDifficulty) {
      adjusted.aiDifficulty = {};
    }
    const baseDiff = bossConfig.aiDifficulty || {};
    adjusted.aiDifficulty.speedMultiplier = (baseDiff.speedMultiplier || 1.0) * mult.speed;
    adjusted.aiDifficulty.mistakeMultiplier = (baseDiff.mistakeMultiplier || 1.0) * mult.mistake;
    adjusted.aiDifficulty.interceptMultiplier = (baseDiff.interceptMultiplier !== undefined ? baseDiff.interceptMultiplier : 1.0) * mult.intercept;
    adjusted.aiDifficulty.discoveryMultiplier = (baseDiff.discoveryMultiplier || 1.0) * mult.discovery;

    return adjusted;
  }

  // 初始化：从本地存储读取难度设置
  try {
    const savedDiff = localStorage.getItem('boss_difficulty');
    if (savedDiff && DIFFICULTY_MULTIPLIERS[savedDiff]) {
      currentDifficulty = savedDiff;
    }
  } catch(e) {}

  function _initBossBattle(bossConfig) {
    if (!board || !currentLevelData) return;

    // 切换到Boss战专属BGM（支持Boss自定义BGM）
    try {
      if (typeof AudioService !== 'undefined' && AudioService.bgm && AudioService.bgm.playBoss) {
        AudioService.bgm.playBoss(bossConfig.id, { bgmFile: bossConfig.bgm });
      } else {
        AudioService.bgm.playFile('boss_battle.mp3');
      }
    } catch(e) {
      log.warn('[Boss] Boss BGM play failed, fallback to default:', e);
      try { AudioService.bgm.playFile('boss_battle.mp3'); } catch(e2) {}
    }

    // 对战专用关卡：优先使用 battleData（内嵌数据），其次用 battleLevelId 从章节数据查
    if (bossConfig.battleData) {
      log.info('[Boss] 使用内嵌对战关卡:', bossConfig.battleData.levelId, bossConfig.battleData.title);
      // 保存原始关卡数据（战斗结束后恢复）
      bossConfig._originalLevelData = currentLevelData;
      bossConfig._originalLevelId = currentLevelId;
      // 用对战关卡数据
      currentLevelData = bossConfig.battleData;
      currentLevelId = bossConfig.battleData.levelId;
      // 重新初始化棋盘
      _reinitBoardForBattle();
    } else if (bossConfig.battleLevelId && bossConfig.battleLevelId !== currentLevelId) {
      const battleLevel = _findLevelData(bossConfig.battleLevelId);
      if (battleLevel) {
        log.info('[Boss] 使用对战专用关卡:', battleLevel.levelId, battleLevel.name);
        // 保存原始关卡数据（战斗结束后恢复）
        bossConfig._originalLevelData = currentLevelData;
        bossConfig._originalLevelId = currentLevelId;
        // 用对战关卡重新初始化棋盘
        currentLevelData = battleLevel;
        currentLevelId = battleLevel.levelId;
        // 重新初始化棋盘
        _reinitBoardForBattle();
      }
    }

    // 启动Boss战
    GuideBattle.start({
      board: board,
      renderer: renderer,
      solution: currentLevelData.solution,
      opponent: bossConfig,
      onEnd: onBossBattleEnd,
    });

    // 启动HUD更新
    _startBossHudUpdate();
  }

  function _startBossHudUpdate() {
    if (!GuideBattle._hudInterval) {
      clearInterval(GuideBattle._hudInterval);
    }
    GuideBattle._hudInterval = setInterval(() => {
      if (!GuideBattle.active && !GuideBattle.ended) {
        clearInterval(GuideBattle._hudInterval);
        return;
      }
      _updateBossHud();
    }, 200);
  }

  function _updateBossHud() {
    if (!GuideBattle || !GuideBattle.winTarget) return;

    // 支持加权得分模式
    const isWeighted = GuideBattle.isWeightedScoreEnabled && GuideBattle.isWeightedScoreEnabled();

    let playerPct, aiPct;
    if (isWeighted) {
      const progress = GuideBattle.getScoreProgress();
      playerPct = progress.playerPercent;
      aiPct = progress.aiPercent;
    } else {
      playerPct = Math.min(100, (GuideBattle.playerCount / GuideBattle.winTarget) * 100);
      aiPct = Math.min(100, (GuideBattle.aiCount / GuideBattle.winTarget) * 100);
    }

    const playerFill = document.getElementById('boss-hud-player-fill');
    const aiFill = document.getElementById('boss-hud-ai-fill');
    if (playerFill) playerFill.style.width = playerPct + '%';
    if (aiFill) aiFill.style.width = aiPct + '%';

    // 更新得分文字（加权模式下显示三色得分明细）
    const playerScoreEl = document.getElementById('boss-hud-player-score');
    const aiScoreEl = document.getElementById('boss-hud-ai-score');

    if (isWeighted) {
      const progress = GuideBattle.getScoreProgress();
      if (playerScoreEl) {
        playerScoreEl.textContent = Math.round(progress.playerScore) + ' / ' + Math.round(progress.winScore);
      }
      if (aiScoreEl) {
        aiScoreEl.textContent = Math.round(progress.aiScore) + ' / ' + Math.round(progress.winScore);
      }
    } else {
      if (playerScoreEl) {
        playerScoreEl.textContent = GuideBattle.playerCount + ' / ' + GuideBattle.winTarget;
      }
      if (aiScoreEl) {
        aiScoreEl.textContent = GuideBattle.aiCount + ' / ' + GuideBattle.winTarget;
      }
    }
  }

  /**
   * 显示对战结算面板
   * @param {string} result - 'win' | 'lose'
   * @param {Object} bossConfig - Boss配置
   */
  function _showBattleResultOverlay(result, bossConfig) {
    const overlay = document.getElementById('battle-result-overlay');
    if (!overlay) return;

    const isWin = result === 'win';
    const titleEl = document.getElementById('battle-result-title');
    const iconEl = document.getElementById('battle-result-icon');
    const opponentEl = document.getElementById('battle-result-opponent');
    const playerScoreEl = document.getElementById('battle-result-player-score');
    const aiScoreEl = document.getElementById('battle-result-ai-score');
    const playerBarEl = document.getElementById('battle-result-player-bar');
    const aiBarEl = document.getElementById('battle-result-ai-bar');
    const durationEl = document.getElementById('battle-result-duration').querySelector('span');
    const breakdownEl = document.getElementById('battle-result-breakdown');

    // 设置标题和图标
    if (isWin) {
      titleEl.textContent = '胜利';
      titleEl.style.color = '#4ade80';
      titleEl.style.textShadow = '0 0 30px rgba(74, 222, 128, 0.5)';
      iconEl.textContent = '🏆';
    } else {
      titleEl.textContent = '失败';
      titleEl.style.color = '#f87171';
      titleEl.style.textShadow = '0 0 30px rgba(248, 113, 113, 0.5)';
      iconEl.textContent = '💔';
    }

    // 设置对手名称
    opponentEl.textContent = `VS ${bossConfig?.name || '对手'}`;

    // 获取得分明细
    const breakdown = GuideBattle.getScoreBreakdown();
    const playerTotal = breakdown.player.total;
    const aiTotal = breakdown.ai.total;
    const maxScore = breakdown.maxScore || breakdown.totalCells;

    // 设置对战时长
    const durationMs = Date.now() - (GuideBattle._startTime || Date.now());
    const durationSec = Math.floor(durationMs / 1000);
    const min = Math.floor(durationSec / 60);
    const sec = durationSec % 60;
    durationEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

    // 如果未启用加权得分，隐藏三色明细
    if (!breakdown.weightedEnabled) {
      breakdownEl.style.display = 'none';
    } else {
      breakdownEl.style.display = 'block';

      // 兼容新旧两种 getScoreBreakdown 返回格式
      const isNewFormat = typeof breakdown.player.simple === 'number';
      const pSimple = isNewFormat ? { count: breakdown.playerCount?.simple ?? breakdown.player.simple, score: breakdown.player.simple } : breakdown.player.simple;
      const aSimple = isNewFormat ? { count: breakdown.aiCount?.simple ?? breakdown.ai.simple,     score: breakdown.ai.simple }     : breakdown.ai.simple;
      const pCore   = isNewFormat ? { count: breakdown.playerCount?.core ?? breakdown.player.core,     score: breakdown.player.core }   : breakdown.player.core;
      const aCore   = isNewFormat ? { count: breakdown.aiCount?.core ?? breakdown.ai.core,             score: breakdown.ai.core }       : breakdown.ai.core;
      const pGate   = isNewFormat ? { count: breakdown.playerCount?.gate ?? breakdown.player.gate,     score: breakdown.player.gate }   : breakdown.player.gate;
      const aGate   = isNewFormat ? { count: breakdown.aiCount?.gate ?? breakdown.ai.gate,             score: breakdown.ai.gate }       : breakdown.ai.gate;

      // 设置三色明细文字
      document.getElementById('battle-result-simple').textContent =
        `你 ${pSimple.count} / 对手 ${aSimple.count}  ×1 = ${(pSimple.score + aSimple.score).toFixed(1)}`;
      document.getElementById('battle-result-core').textContent =
        `你 ${pCore.count} / 对手 ${aCore.count}  ×1.5 = ${(pCore.score + aCore.score).toFixed(1)}`;
      document.getElementById('battle-result-gate').textContent =
        `你 ${pGate.count} / 对手 ${aGate.count}  ×2 = ${(pGate.score + aGate.score).toFixed(1)}`;

      // 设置三色进度条
      const totalSimple = pSimple.score + aSimple.score || 1;
      const totalCore = pCore.score + aCore.score || 1;
      const totalGate = pGate.score + aGate.score || 1;

      setTimeout(() => {
        document.getElementById('battle-result-simple-player').style.width =
          (pSimple.score / totalSimple * 100) + '%';
        document.getElementById('battle-result-simple-ai').style.width =
          (aSimple.score / totalSimple * 100) + '%';
        document.getElementById('battle-result-core-player').style.width =
          (pCore.score / totalCore * 100) + '%';
        document.getElementById('battle-result-core-ai').style.width =
          (aCore.score / totalCore * 100) + '%';
        document.getElementById('battle-result-gate-player').style.width =
          (pGate.score / totalGate * 100) + '%';
        document.getElementById('battle-result-gate-ai').style.width =
          (aGate.score / totalGate * 100) + '%';
      }, 100);
    }

    // 数字滚动动画
    const animateNumber = (el, target, duration = 300) => {
      const start = 0;
      const startTime = Date.now();
      const isFloat = target % 1 !== 0;
      const step = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + (target - start) * easeOut;
        el.textContent = isFloat ? current.toFixed(1) : Math.round(current);
        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };
      step();
    };

    // 显示面板（淡入 + 卡片弹出）
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      overlay.classList.add('show');
    });

    // 延迟启动进度条和数字动画
    setTimeout(() => {
      const playerPct = Math.min((playerTotal / maxScore) * 100, 100);
      const aiPct = Math.min((aiTotal / maxScore) * 100, 100);
      playerBarEl.style.width = playerPct + '%';
      aiBarEl.style.width = aiPct + '%';
      animateNumber(playerScoreEl, playerTotal);
      animateNumber(aiScoreEl, aiTotal);
    }, 200);

    // 播放音效
    if (isWin) {
      AudioService.sfx.play('victory_short');
    } else {
      AudioService.sfx.play('error');
    }

    // 按钮事件
    const retryBtn = document.getElementById('btn-battle-retry');
    const backBtn = document.getElementById('btn-battle-back');

    const hideOverlay = () => {
      overlay.classList.remove('show');
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 200);
    };

    // 胜利时右侧按钮改为"继续"（进入通关结算），失败时为"返回关卡"
    if (backBtn) {
      backBtn.textContent = isWin ? '继续' : '返回关卡';
    }

    const proceedToComplete = () => {
      hideOverlay();
      setTimeout(() => {
        isCompleted = true;
        _showCompleteOverlay();
      }, 200);
    };

    if (retryBtn) {
      retryBtn.onclick = () => {
        hideOverlay();
        setTimeout(() => {
          restartLevel();
        }, 200);
      };
    }

    if (backBtn) {
      backBtn.onclick = () => {
        if (isWin) {
          // 胜利：进入通关结算
          proceedToComplete();
        } else {
          // 失败：返回关卡选择
          hideOverlay();
          setTimeout(() => {
            if (typeof chapterSelect !== 'undefined' && chapterSelect) {
              chapterSelect.show();
            } else {
              goToChapterSelect();
            }
          }, 200);
        }
      };
    }

    // 点击背景关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (isWin) {
          // 胜利时点击背景继续正常通关流程
          proceedToComplete();
        } else {
          // 失败时点击背景仅关闭面板
          hideOverlay();
        }
      }
    });

    // ESC 键关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        if (isWin) {
          proceedToComplete();
        } else {
          hideOverlay();
        }
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function onBossBattleEnd(result, bossConfig) {
    log.info('[Boss] Battle ended:', result);
    try {
    // 如果使用了对战专用关卡，战斗结束后恢复原始关卡
    if (bossConfig._originalLevelData) {
      currentLevelData = bossConfig._originalLevelData;
      currentLevelId = bossConfig._originalLevelId;
      bossConfig._originalLevelData = null;
      bossConfig._originalLevelId = null;
      log.info('[Boss] 恢复原始关卡:', currentLevelId);
    }

    // 隐藏HUD
    const hud = document.getElementById('boss-battle-hud');
    if (hud) hud.classList.remove('visible');

    // 清除HUD更新定时器
    if (GuideBattle._hudInterval) {
      clearInterval(GuideBattle._hudInterval);
      GuideBattle._hudInterval = null;
    }

    // 停止Boss战系统（保留得分数据用于结算面板）
    GuideBattle.stop();
    bossBattleStarted = false;
    setInteractionLocked(false);

    // 停止BGM
    try {
      if (AudioService.bgm && AudioService.bgm.stopBoss) {
        AudioService.bgm.stopBoss(result === 'win' ? 800 : 500);
      } else {
        AudioService.bgm.stop();
      }
    } catch(e) {
      try { AudioService.bgm.stop(); } catch(e2) {}
    }

    // 胜利时切换到楼梯间背景 + 播放胜利BGM
    if (result === 'win') {
      const stairwellBg = 'assets/images/backgrounds/bg_scene12_stairwell.jpg';
      // 解锁背景图鉴
      unlockBackground(stairwellBg);
      const testImg = new Image();
      testImg.onload = function() {
        document.body.style.setProperty('background-image', `url('${stairwellBg}')`, 'important');
        document.body.style.setProperty('background-size', 'cover', 'important');
        document.body.style.setProperty('background-position', 'center', 'important');
        document.body.style.setProperty('background-attachment', 'fixed', 'important');
      };
      testImg.src = stairwellBg;

      setTimeout(() => {
        AudioService.bgm.playFile('victory.wav');
      }, 300);
    }

    // 获取得分明细
    const breakdown = GuideBattle.getScoreBreakdown();
    const playerScore = breakdown.player.total;
    const aiScore = breakdown.ai.total;

    // 计算对战时长（秒）
    const durationMs = Date.now() - (GuideBattle._startTime || Date.now());
    const durationSec = Math.floor(durationMs / 1000);

    // 构造对话数据（面板显示后由组件播放）
    let dialogLines = null;
    if (result === 'win' && bossConfig.winDialog && bossConfig.winDialog.length > 0) {
      dialogLines = bossConfig.winDialog.map(line => ({
        speaker: line.speaker,
        text: line.text,
        emotion: line.emotion || 'default',
        voiceId: line.voiceId,
      }));
    } else if (result === 'lose' && bossConfig.loseDialog && bossConfig.loseDialog.length > 0) {
      dialogLines = bossConfig.loseDialog.map(line => ({
        speaker: line.speaker,
        text: line.text,
        emotion: line.emotion || 'default',
        voiceId: line.voiceId,
      }));
    }

    // 调用独立组件显示对战结算面板
    if (typeof BattleResultOverlay !== 'undefined') {
      BattleResultOverlay.show({
        result: result,
        bossName: bossConfig?.name || '对手',
        bossPortrait: bossConfig?.portrait ? ('assets/images/portraits/' + bossConfig.portrait) : '',
        playerScore: playerScore,
        aiScore: aiScore,
        winTarget: breakdown.winScore,
        isWeighted: breakdown.isWeighted || breakdown.weightedEnabled || false,
        scoreBreakdown: {
          // 传入 { count, score } 格式，组件可正确显示格数和得分
          player: {
            simple: { count: (breakdown.playerCount?.simple ?? breakdown.player.simple), score: breakdown.player.simple },
            core:   { count: (breakdown.playerCount?.core   ?? breakdown.player.core),   score: breakdown.player.core },
            gate:   { count: (breakdown.playerCount?.gate   ?? breakdown.player.gate),   score: breakdown.player.gate },
          },
          ai: {
            simple: { count: (breakdown.aiCount?.simple ?? breakdown.ai.simple), score: breakdown.ai.simple },
            core:   { count: (breakdown.aiCount?.core   ?? breakdown.ai.core),   score: breakdown.ai.core },
            gate:   { count: (breakdown.aiCount?.gate   ?? breakdown.ai.gate),   score: breakdown.ai.gate },
          },
        },
        duration: durationSec,
        dialog: dialogLines,
        onRetry: () => {
          BattleResultOverlay.hide();
          setTimeout(() => {
            restartLevel();
          }, 250);
        },
        onContinue: () => {
          // 胜利：关闭面板，进入普通通关结算
          BattleResultOverlay.hide();
          setTimeout(() => {
            isCompleted = true;
            _showCompleteOverlay();
          }, 250);
        },
        onBackToLevel: () => {
          // 失败：返回章节选择
          BattleResultOverlay.hide();
          setTimeout(() => {
            if (typeof chapterSelect !== 'undefined' && chapterSelect) {
              chapterSelect.show();
            } else {
              goToChapterSelect();
            }
          }, 250);
        },
      });
    } else {
      // 兜底：组件未加载时使用旧函数
      log.warn('[Boss] BattleResultOverlay not found, fallback to _showBattleResultOverlay');
      _showBattleResultOverlay(result, bossConfig);
    }
    } catch (e) {
      log.error('[Boss] onBossBattleEnd error:', e);
      // 兜底：直接触发通关结算
      try {
        if (result === 'win') {
          isCompleted = true;
          _showCompleteOverlay();
        }
      } catch (e2) {
        log.error('[Boss] fallback completion also failed:', e2);
      }
    }
  }

  // 显示通关遮罩（复用checkCompletion中的通关逻辑）
  function _showCompleteOverlay() {
    // Stop BGM
    AudioService.bgm.stop();

    // Get expert report
    const report = expertSystem.onLevelEnd();
    // 用 gameTimer 获取时间（如果可用），否则回退到 startTime 计算
    const elapsed = gameTimer ? gameTimer.getTime() : Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    // 暂停计时器
    if (gameTimer) gameTimer.pause();

    // Calculate grade
    const grade = calculateGrade(elapsed, report.totalWrong || errorCount || 0, hintCount);

    // Save progress
    saveProgress(elapsed, report.totalWrong || errorCount || 0, hintCount, grade.letter);

    // Play victory BGM
    AudioService.bgm.playFile('victory_full.wav');

    // Play clear dialog first, then show overlay
    playClearDialog(() => {
      // Show completion overlay
      const overlay = document.getElementById('complete-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.opacity = '0';
        requestAnimationFrame(() => {
          overlay.style.transition = 'opacity 0.5s ease';
          overlay.style.opacity = '1';
        });

        const gradeEl = document.getElementById('complete-grade');
        if (gradeEl) {
          gradeEl.textContent = grade.letter;
          gradeEl.style.color = grade.color;
        }

        document.getElementById('complete-time').textContent = '用时 ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        document.getElementById('complete-errors').textContent = '错误 ' + (report.totalWrong || 0) + ' 次';

        // Add hints display
        const hintsEl = document.getElementById('complete-hints');
        if (hintsEl) {
          hintsEl.textContent = '提示 ' + hintCount + ' 次';
        }

        const learning = expertSystem.getLearning();
        const insight = learning.generateComment({
          nonTrivialRatio: 0.3,
          maxTechLevel: 5,
          score: 500,
        });
        document.getElementById('complete-insight').textContent = insight;

        // Update next level button text based on position
        updateNextLevelButton();
      }

      // Play victory sound
      AudioService.sfx.play('victory');
      log.info('Level completed:', currentLevelId, 'grade:', grade.letter);
    });
  }

  // === UI Visibility ===
  function setUIVisible(visible) {
    const opacity = visible ? '1' : '0';
    const pointerEvents = visible ? 'auto' : 'none';
    UI_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.opacity = opacity;
        el.style.pointerEvents = pointerEvents;
        el.style.transition = 'opacity 0.5s ease';
      });
    });

    // Preserve scene background during gameplay: add/remove game-scene-bg class on body
    if (visible) {
      document.body.classList.add('game-scene-bg');
    } else {
      document.body.classList.remove('game-scene-bg');
    }
  }

  // === Pristine Heatmap Preload ===
  /**
   * 预加载初始热力图到 WinConditionManager 缓存
   * 使用 TechRaterAdapter 生成，延迟一帧执行避免阻塞 UI 渲染
   */
  function _preloadPristineHeatmap() {
    if (!board || !currentLevelData) return;
    if (typeof WinConditionManager === 'undefined') return;
    if (typeof TechRaterAdapter === 'undefined') return;

    // 延迟到下一帧执行，避免阻塞初始渲染
    requestAnimationFrame(() => {
      // 再延迟一帧，确保 UI 完全渲染
      requestAnimationFrame(() => {
        try {
          // 用 WinConditionManager 的 getPristineHeatmap 生成并缓存
          // 它内部有缓存机制，同一关卡只会生成一次
          const isBoss = typeof isLastLevelOfChapter === 'function' ? isLastLevelOfChapter() : false;
          const heatmap = WinConditionManager.getPristineHeatmap(board, currentLevelData, isBoss);
          if (heatmap) {
            log.info('[Heatmap] 初始热力图预加载完成:', currentLevelId);
            // 设置到 renderer 并启用三色显示
            if (renderer && typeof renderer.setHeatmapData === 'function') {
              renderer.setHeatmapData(heatmap);
              // 启用热力图
              // 如果启用了三幕引导，默认第一幕（simple）模式；否则全显
              const threeActEnabled = currentLevelData.features &&
                currentLevelData.features.threeActGuide === true;
              renderer.setHeatmapEnabled(true, 0.15);
              renderer.setThreeActMode(threeActEnabled ? 'simple' : 'all');
              renderer.render(board);
            }
          }
        } catch (e) {
          log.warn('[Heatmap] 预加载初始热力图失败:', e);
        }
      });
    });
  }

  /**
   * 切换热力图显示（调试用）
   * 仅在 debug 模式下可用，通过 Shift+H 触发
   */
  function _toggleHeatmapDisplay() {
    if (!renderer) return;
    if (typeof renderer.setHeatmapEnabled !== 'function') return;

    _heatmapVisible = !_heatmapVisible;

    if (_heatmapVisible) {
      // 如果还没有热力图数据，尝试获取
      if (!renderer._heatmapData) {
        try {
          const isBoss = typeof isLastLevelOfChapter === 'function' ? isLastLevelOfChapter() : false;
          const heatmap = WinConditionManager.getPristineHeatmap(board, currentLevelData, isBoss);
          if (heatmap) {
            renderer.setHeatmapData(heatmap);
          }
        } catch (e) {
          log.warn('[Heatmap] 获取热力图数据失败:', e);
        }
      }
      renderer.setHeatmapEnabled(true, 0.4);
      showToast('热力图：开');
    } else {
      renderer.setHeatmapEnabled(false);
      showToast('热力图：关');
    }

    // 触发重绘
    if (renderer && board) {
      renderer.render(board);
    }
  }

  // === Board Init ===
  function initBoard() {
    if (!currentLevelData) return;

    board = new Board(currentLevelData.gridSize || 9);
    board.loadLevel({
      cells: currentLevelData.boardData,
      cages: currentLevelData.cages || [],
      levelId: currentLevelId,
      // Boss战机制数据（普通关卡没有这些字段，loadLevel 会自动设为 null）
      lockCells: currentLevelData.lockCells,
      fakeCells: currentLevelData.fakeCells,
      regionLocks: currentLevelData.regionLocks,
      cageCollapse: currentLevelData.cageCollapse,
      dualPath: currentLevelData.dualPath,
      phases: currentLevelData.phases,
    });

    renderer = new Renderer('gameCanvas');
    // Set theme for chapter
    const chapterId = currentChapterData ? currentChapterData.chapterId : 1;
    renderer.setTheme(chapterId);
    // 设置关卡专属背景（每关一张独立背景图）
    if (typeof renderer.setLevelBackground === 'function') {
      renderer.setLevelBackground(currentLevelId);
    }
    renderer.recalcCellSize(board);
    renderer.render(board);

    // Initialize Note System (candidate display)
    if (typeof NoteSystem !== 'undefined') {
      const noteSys = new NoteSystem(board, renderer, {
        perspective: 'hero', // hero/yan/ying - default hero mode
        mode: 'classic',     // 经典模式：笔记模式下全显
        maxGlimpseCount: 3,
        glimpseDuration: 3000,
      });
      window.gameNoteSystem = noteSys;
      renderer.setNoteSystem(noteSys);
      global.guideNoteSystem = noteSys;
    }

    // Initialize hint system
    // Initialize teaching system (role-guided learning)
    let teachingSys = null;
    if (typeof TeachingSystem !== 'undefined') {
      teachingSys = new TeachingSystem();
      teachingSys.load();
      global.guideTeachingSystem = teachingSys;
    }

    // Initialize hint system with teaching integration
    hintSystem = new HintSystem(board, currentLevelData.solution, {
      teachingSystem: teachingSys
    });

    // Initialize Rule45 banner (顶部常驻 HUD，仅 9x9 显示)
    const banner = document.getElementById('rule45-banner');
    if (typeof Rule45 !== 'undefined' && board.cages.length > 0 && board.size === 9) {
      if (banner) banner.style.display = 'block';
      initRule45Banner();
      updateRule45Banner(null);
    } else {
      if (banner) banner.style.display = 'none';
      _rule45BannerInited = false;
    }

    // Initialize TechMatrix (技术矩阵)
    if (typeof TechMatrix !== 'undefined') {
      if (techMatrix) {
        // 更新现有实例
        techMatrix.setBoard(board);
        techMatrix.setRenderer(renderer);
      } else {
        techMatrix = new TechMatrix({
          board: board,
          techRater: typeof TechRater !== 'undefined' ? TechRater : null,
          renderer: renderer,
          onClose: () => {
            // 关闭时清理高亮
          },
        });
        global.guideTechMatrix = techMatrix;
      }
    }

    global.guideBoard = board;
    global.guideRenderer = renderer;

    // Configure expert system with board (enables replay system and dynamic thresholds)
    if (expertSystem && typeof expertSystem.init === 'function') {
      let levelsCompleted = 0;
      if (global.ProgressManager && ProgressManager._data && ProgressManager._data.levelScores) {
        levelsCompleted = Object.keys(ProgressManager._data.levelScores).length;
      }
      expertSystem.init({
        board: board,
        dynamicThresholds: true,
        levelsCompleted: levelsCompleted,
        onFeedback: (msg, level) => showToast(msg),
      });
      // 设置盘面尺寸，动态调整心流/EUREKA 阈值
      const gridSize = currentLevelData.gridSize || 9;
      if (typeof expertSystem.setGridSize === 'function') {
        expertSystem.setGridSize(gridSize);
      }
    }

    // Initialize Combo System (连击系统)
    if (typeof ComboSystem !== 'undefined') {
      const gridSize = currentLevelData.gridSize || 9;
      const chapterId = currentChapterData ? currentChapterData.chapterId : 1;
      const isNewPlayer = chapterId <= 1 && gridSize <= 4; // 第1章4x4为新手保护
      comboSystem = new ComboSystem({
        gridSize: gridSize,
        isNewPlayer: isNewPlayer,
        onComboChange: (count) => {
          // 同步连击数到渲染器（燃烧效果）
          if (renderer && typeof renderer.setComboCount === 'function') {
            renderer.setComboCount(count);
          }
        },
        onMilestone: (level, milestone) => {
          // 里程碑音效
          if (milestone.sfx && typeof AudioService !== 'undefined') {
            AudioService.sfx.play(milestone.sfx);
          }
          // 5连击时显示角色鼓励气泡
          if (milestone.key === 'combo_5' && expertSystem && expertSystem.expression) {
            expertSystem.expression.enqueue({
              action: 'SHOW_TOAST',
              payload: { message: '手感火热！继续保持~' },
              priority: 50,
            });
          }
          // 10连击 MAX 祝贺
          if (milestone.key === 'combo_max') {
            showToast('MAX 连击！太强了！', 2000);
          }
        },
        onEureka: (type) => {
          // EUREKA 音效
          if (typeof AudioService !== 'undefined') {
            AudioService.sfx.play('eureka');
          }
          const msg = type === 'insight'
            ? '灵感迸发！想通了关键的一步！'
            : 'EUREKA！连击爆发！';
          showToast(msg, 2500);
          // 角色反馈
          if (expertSystem && expertSystem.expression) {
            expertSystem.expression.enqueue({
              action: 'EUREKA',
              payload: { level: 3, message: msg },
              priority: 80,
            });
          }
        },
      });
      global.guideComboSystem = comboSystem;

      // 启动连击系统的时间推进（检测超时断连 + 灵感型EUREKA）
      if (comboSystem._updateInterval) clearInterval(comboSystem._updateInterval);
      comboSystem._updateInterval = setInterval(() => {
        if (comboSystem && !isCompleted) {
          comboSystem.update(1000);
        }
      }, 1000);
    }

    bindEvents();

    // 应用关卡功能配置（渐进式解锁）
    applyLevelFeatures();

    // Connect settings panel to board
    if (settingsPanel) {
      settingsPanel.setBoard(board);
      settingsPanel.setRenderer(renderer);
    }

    // Initialize UI state
    updateNoteButtonState();
    updateNumBtnCompletedState();
    updateMultiSelectHint();
    updateNumPad();

    // 更新顶部关卡标题（含编号和名称）
    const levelTitleEl = document.getElementById('level-title');
    const landscapeTitleEl = document.getElementById('landscape-level-title');
    if (currentLevelData) {
      const titleText = currentLevelData.title || '';
      const fullTitle = `第${currentLevelId}关 · ${titleText}`;
      const tooltip = `关卡 ${currentLevelId}：${titleText}`;
      if (levelTitleEl) {
        levelTitleEl.textContent = fullTitle;
        levelTitleEl.title = tooltip;
      }
      if (landscapeTitleEl) {
        landscapeTitleEl.textContent = fullTitle;
        landscapeTitleEl.title = tooltip;
      }
    }

    // 预加载初始热力图到 WinConditionManager 缓存（异步，不阻塞 UI）
    _preloadPristineHeatmap();
  }

  // === Apply Level Features (渐进式功能解锁) ===
  function applyLevelFeatures() {
    if (!currentLevelData || !currentLevelData.features) return;
    const f = currentLevelData.features;

    // 1. 控制工具栏按钮显隐
    // 笔记按钮
    const btnNote = document.getElementById('btn-note');
    if (btnNote) {
      if (f.allowDraft === false) {
        btnNote.style.display = 'none';
        // 隐藏时退出笔记模式
        if (noteMode) {
          noteMode = false;
          updateNoteButtonState();
        }
      } else {
        btnNote.style.display = '';
      }
    }

    // 提示按钮
    const btnHint = document.getElementById('btn-hint');
    if (btnHint) {
      btnHint.style.display = (f.showHints === false) ? 'none' : '';
    }

    // 45法则按钮
    const btnRule45 = document.getElementById('btn-rule45');
    if (btnRule45) {
      btnRule45.style.display = (f.assistant45 === false) ? 'none' : '';
    }

    // 2. 控制高亮（调用 renderer.setHighlightOptions）
    if (renderer && typeof renderer.setHighlightOptions === 'function') {
      renderer.setHighlightOptions({
        highlightRow: f.highlightRow !== false,
        highlightCol: f.highlightCol !== false,
        highlightBox: f.highlightBox !== false,
        highlightNumber: f.highlightNumber !== false,
        highlightCage: f.highlightCage !== false,
      });
    }

    // 3. 控制自动填充候选数（受全局设置控制，默认关闭）
    // 忽略关卡级 autoFillCandidates 特性，统一由玩家在设置中手动开启
    const shouldAutoFill = settingsPanel && settingsPanel.get
      ? settingsPanel.get('game.autoFillCandidates')
      : false;

    if (shouldAutoFill === true) {
      const noteSys = window.gameNoteSystem || global.guideNoteSystem;
      if (noteSys) {
        if (typeof noteSys._autoFillTheoreticalCandidates === 'function') {
          noteSys._autoFillTheoreticalCandidates();
        } else if (typeof noteSys.autoFill === 'function') {
          noteSys.autoFill();
        }
      } else if (board && typeof board.autoFillCandidates === 'function') {
        board.autoFillCandidates();
      } else if (typeof autoFillCandidates === 'function') {
        autoFillCandidates();
      }
      // 触发重绘
      if (renderer) {
        renderer.forceRender = true;
        renderer.render(board);
      }
    }
  }

  // === Interaction State ===
  let isDragging = false;
  let dragStartCell = null;
  let activeNumber = null; // 长按数字键激活的数字
  let eventsBound = false; // 防止重复绑定

  // 移动端触控优化
  const EDGE_DEAD_ZONE = 8; // 边缘死区（像素）
  let _swipeStartPos = null; // 滑动起始位置 {x, y, time}
  const SWIPE_FAST_THRESHOLD_MS = 200; // 快速滑动时间阈值
  const SWIPE_DISTANCE_THRESHOLD = 30; // 滑动距离阈值（判定为滑动而非点击）

  // === Event Binding ===
  function bindEvents() {
    if (eventsBound) return; // 只绑定一次
    eventsBound = true;

    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      // --- Canvas 交互 ---
      canvas.addEventListener('pointerdown', onCanvasPointerDown);
      canvas.addEventListener('pointermove', onCanvasPointerMove);
      canvas.addEventListener('pointerup', onCanvasPointerUp);
      canvas.addEventListener('pointercancel', onCanvasPointerUp);
      canvas.addEventListener('pointerleave', onCanvasPointerUp);
    }

    // --- Number pad 交互 ---
    document.querySelectorAll('.num-btn').forEach(btn => {
      btn.addEventListener('pointerdown', onNumBtnPointerDown);
      btn.addEventListener('pointermove', onNumBtnPointerMove);
      btn.addEventListener('pointerup', onNumBtnPointerUp);
      btn.addEventListener('pointercancel', onNumBtnPointerUp);
      btn.addEventListener('pointerleave', onNumBtnPointerLeave);
    });

    // --- Keyboard ---
    document.addEventListener('keydown', onKeyDown);

    // --- Toolbar buttons ---
    const btnNote = document.getElementById('btn-note');
    if (btnNote) {
      btnNote.addEventListener('click', () => {
        AudioService.sfx.play('click');
        toggleNoteMode();
      });
    }

    // Window resize
    window.addEventListener('resize', () => {
      if (renderer && board) {
        renderer.recalcCellSize(board);
        renderer.render(board);
      }
    });

    // Orientation change (mobile)
    window.addEventListener('orientationchange', () => {
      // 延迟等待布局完成后重新计算
      setTimeout(() => {
        if (renderer && board) {
          renderer.recalcCellSize(board);
          renderer.render(board);
        }
      }, 200);
    });

    // Popstate 拦截：安卓返回键优先退出 What If 模式
    window.addEventListener('popstate', (e) => {
      if (WhatIfState && WhatIfState.active) {
        e.preventDefault();
        if (WhatIfState.snapshots.length > 0) {
          if (confirm('退出假设模式？未采纳的更改将丢失。')) {
            exitWhatIfMode(false);
          } else {
            // 用户取消，重新推入状态
            history.pushState({ whatIf: true }, '');
          }
        } else {
          exitWhatIfMode(false);
        }
      }
    });

    // Toolbar buttons
    document.getElementById('btn-undo')?.addEventListener('click', () => { AudioService.sfx.play('click'); undo(); });
    document.getElementById('btn-erase')?.addEventListener('click', () => { AudioService.sfx.play('click'); eraseCell(); });
    document.getElementById('btn-hint')?.addEventListener('click', () => { AudioService.sfx.play('click'); showHint(); });
    document.getElementById('btn-whatif')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      toggleWhatIfMode();
    });

    // What If 浮条按钮
    document.getElementById('btn-whatif-accept')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      adoptWhatIfChanges();
    });
    document.getElementById('btn-whatif-undo')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      undoWhatIfStep();
    });
    document.getElementById('btn-whatif-reset')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      resetWhatIfToRoot();
    });

    // 右侧浮条拉扣头
    document.getElementById('float-bar-tab')?.addEventListener('click', (e) => {
      e.stopPropagation();
      AudioService.sfx.play('click');
      toggleFloatBarPanel();
    });

    document.getElementById('btn-rule45')?.addEventListener('click', () => { 
      AudioService.sfx.play('click'); 
      // 45法则已改为顶部常驻HUD显示
      showToast('45法则仪表盘已显示在棋盘上方');
    });
    document.getElementById('btn-techniques')?.addEventListener('click', () => { AudioService.sfx.play('click'); toggleTechniqueEncyclopedia(); });
    document.getElementById('btn-tech-matrix')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (techMatrix) techMatrix.toggle();
    });
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (settingsPanel) {
        settingsPanel.toggle();
      }
    });
    document.getElementById('btn-achievement')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (achievementPanel) {
        achievementPanel.toggle();
      }
    });
    document.getElementById('btn-gallery')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (galleryPanel) {
        galleryPanel.toggle();
      }
    });
    document.getElementById('btn-chapter')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (chapterSelect) chapterSelect.show();
    });
    document.getElementById('btn-pause')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      togglePause();
    });

    // 暂停菜单按钮
    document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      togglePause();
    });
    document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      restartLevel();
    });
    document.getElementById('btn-pause-chapter')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      goToChapterSelect();
    });
    document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      goToMainMenu();
    });
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
      AudioService.sfx.play('click');
      if (settingsPanel) settingsPanel.show();
    });

    // 顶部Header菜单按钮（统一菜单 Bottom Sheet）
    const menuBtn = document.querySelector('.header-menu');
    if (menuBtn && typeof MenuSheet !== 'undefined') {
      const menuSheet = new MenuSheet({
        onAction: (action) => {
          AudioService.sfx.play('click');
          switch (action) {
            case 'chapter':
              document.getElementById('btn-chapter')?.click();
              break;
            case 'achievement':
              document.getElementById('btn-achievement')?.click();
              break;
            case 'gallery':
              // 图鉴按钮可能在工具栏，尝试调用
              if (typeof galleryPanel !== 'undefined' && galleryPanel) {
                galleryPanel.show();
              } else {
                document.getElementById('btn-gallery')?.click();
              }
              break;
            case 'settings':
              document.getElementById('btn-settings')?.click();
              break;
          }
        }
      });
      window._guideMenuSheet = menuSheet;

      menuBtn.addEventListener('click', () => {
        AudioService.sfx.play('click');
        menuSheet.toggle();
      });
    }

    // 页面隐藏时自动暂停
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !isPaused && !isCompleted && board) {
        showPauseMenu();
      }
    });
  }

  // === Canvas Pointer Handlers ===
  function getCellFromEvent(e) {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas || !renderer || !board) return null;
    
    // 确保 cellSize 和尺寸是最新的（窗口变化、布局变化后可能过时）
    renderer.recalcCellSize(board);
    
    if (!renderer.cellSize || renderer.cellSize <= 0) return null;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 使用实际显示尺寸和渲染尺寸双向校准，确保点击位置准确
    // 理论渲染尺寸
    const renderW = board.size * renderer.cellSize + renderer.paddingLeft + renderer.paddingRight;
    const renderH = board.size * renderer.cellSize + renderer.paddingTop + renderer.paddingBottom;
    // 实际显示尺寸
    const actualW = rect.width;
    const actualH = rect.height;
    
    // 如果实际尺寸和渲染尺寸差异较大（比如被CSS缩放了），使用比例换算
    const scaleX = actualW / renderW;
    const scaleY = actualH / renderH;
    
    // 换算到渲染坐标系
    const renderX = x / scaleX;
    const renderY = y / scaleY;
    
    const col = Math.floor((renderX - renderer.paddingLeft) / renderer.cellSize);
    const row = Math.floor((renderY - renderer.paddingTop) / renderer.cellSize);
    
    if (row >= 0 && row < board.size && col >= 0 && col < board.size) {
      return { r: row, c: col };
    }
    return null;
  }

  function onCanvasPointerDown(e) {
    if (storyEngine && storyEngine._isPlaying) return;
    if (isCompleted) return;
    e.preventDefault();

    // === 提示动画：点击跳过当前步 ===
    if (HintPlayerState && HintPlayerState.playing) {
      skipHintStep();
      return;
    }

    // === 教学引导：点击快进 demo 步骤 ===
    if (lessonPlayer && lessonPlayer.isActive) {
      const phase = lessonPlayer.currentPhase;
      if (phase === 'intro' || phase === 'demo') {
        const advanced = lessonPlayer.advance();
        if (advanced) {
          return; // 快进成功，不继续选择格子
        }
      }
    }

    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 边缘死区检测：距离画布边缘8px内不触发棋盘交互
    if (x < EDGE_DEAD_ZONE || x > rect.width - EDGE_DEAD_ZONE ||
        y < EDGE_DEAD_ZONE || y > rect.height - EDGE_DEAD_ZONE) {
      return;
    }

    const cell = getCellFromEvent(e);
    if (!cell) return;

    // === 教学引导：冻结遮罩拦截 ===
    if (lessonPlayer && lessonPlayer.isActive && !lessonPlayer.canInteractCell(cell.r, cell.c)) {
      // 被冻结的格子，点击无效（轻微抖动反馈）
      if (renderer && typeof renderer.shakeCell === 'function') {
        renderer.shakeCell(cell.r, cell.c);
      }
      return;
    }

    isDragging = false;
    longPressTriggered = false;
    dragStartCell = cell;
    _swipeStartPos = { x, y, time: Date.now() };

    // 长按检测（500ms）
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      handleBoardLongPress(cell);
    }, 500);

    // 如果处于连填模式，直接填入数字
    if (quickFillMode && quickFillNum !== null) {
      handleNumberInput(quickFillNum, cell);
      _checkQuickFillComplete();
      return;
    }

    // 单选：先选中格子
    if (board.selectedCells.length > 0) {
      board.clearMultiSelect();
    }
    board.selectCell(cell.r, cell.c);
    AudioService.sfx.play('select');
    renderer.render(board);

    // 更新45法则HUD
    if (board.size === 9 && typeof updateRule45Banner === 'function') {
      updateRule45Banner(cell);
    }

    // Boss战：红格预警 - 如果选中的是 gate 分类格子，立即触发预警
    if (typeof GuideBattle !== 'undefined' && GuideBattle.active && !GuideBattle.ended) {
      const cat = GuideBattle.getCellCategory(cell.r, cell.c);
      if (cat === 'gate' && renderer && typeof renderer.triggerGateAlert === 'function') {
        renderer.triggerGateAlert(cell.r, cell.c, 1500);
        AudioService.sfx.play('breakthrough', { volume: 0.5 });
      }
    }

    // Boss战：凝视拦截检测（玩家选中格子时，AI有概率抢先占领）
    if (typeof GuideBattle !== 'undefined' && GuideBattle.active && !GuideBattle.ended) {
      setTimeout(() => {
        GuideBattle.onPlayerFocusCell(cell.r, cell.c);
      }, 150); // 略微延迟，模拟AI"反应时间"
    }
  }

  function onCanvasPointerMove(e) {
    if (storyEngine && storyEngine._isPlaying) return;
    if (isCompleted) return;
    if (!dragStartCell) return;
    e.preventDefault();

    const cell = getCellFromEvent(e);
    if (!cell) return;

    // 清除长按定时器（移动了就不是长按了）
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // 如果移动距离超过阈值，开始多选
    if (!isDragging && (cell.r !== dragStartCell.r || cell.c !== dragStartCell.c)) {
      isDragging = true;
      // 自动进入笔记模式
      if (!noteMode) {
        noteMode = true;
        updateNoteButtonState();
      }
      // 确保board处于候选输入模式，保证笔记可见
      if (board.inputMode !== 'candidate' && board.inputMode !== 'elimination') {
        board.setInputMode('candidate');
      }
      board.clearMultiSelect();
      // 将起始格子加入选中列表
      const startCell = board.cells[dragStartCell.r][dragStartCell.c];
      if (startCell && !startCell.isLocked) {
        startCell.isSelected = true;
        board.selectedCells.push({ r: dragStartCell.r, c: dragStartCell.c });
      }
      // 初始化框选显示范围
      board.boxStart = { r: dragStartCell.r, c: dragStartCell.c };
      board.boxEnd = { r: dragStartCell.r, c: dragStartCell.c };
    }

    if (isDragging) {
      // 拖拽多选：精确记录鼠标滑过的格子（不是矩形框选）
      const cellKey = `${cell.r},${cell.c}`;
      const alreadySelected = board.selectedCells.some(s => s.r === cell.r && s.c === cell.c);
      
      if (!alreadySelected && !board.cells[cell.r][cell.c].isLocked) {
        board.cells[cell.r][cell.c].isSelected = true;
        board.selectedCells.push({ r: cell.r, c: cell.c });
      }
      
      // 更新框选显示范围（用于绘制选区外框）
      if (!board.boxStart) {
        board.boxStart = { r: cell.r, c: cell.c };
        board.boxEnd = { r: cell.r, c: cell.c };
      } else {
        board.boxStart.r = Math.min(board.boxStart.r, cell.r);
        board.boxStart.c = Math.min(board.boxStart.c, cell.c);
        board.boxEnd.r = Math.max(board.boxEnd.r, cell.r);
        board.boxEnd.c = Math.max(board.boxEnd.c, cell.c);
      }
      updateMultiSelectHint();
      renderer.render(board);
    }
  }

  function onCanvasPointerUp(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (storyEngine && storyEngine._isPlaying) return;
    if (isCompleted) return;

    // 快速滑动检测：如果是快速滑动（短时间内移动距离大），不触发填数
    let isFastSwipe = false;
    if (_swipeStartPos) {
      const canvas = document.getElementById('gameCanvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dx = (e.clientX - rect.left) - _swipeStartPos.x;
        const dy = (e.clientY - rect.top) - _swipeStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dt = Date.now() - _swipeStartPos.time;
        if (dt < SWIPE_FAST_THRESHOLD_MS && dist > SWIPE_DISTANCE_THRESHOLD) {
          isFastSwipe = true;
        }
      }
      _swipeStartPos = null;
    }

    const cell = getCellFromEvent(e);

    // 长按已触发，不处理点击
    if (longPressTriggered) {
      longPressTriggered = false;
      isDragging = false;
      dragStartCell = null;
      return;
    }

    // 拖拽多选结束
    if (isDragging && board.selectedCells.length > 1) {
      isDragging = false;
      dragStartCell = null;
      // 保持多选状态，等待输入
      return;
    }

    // 快速滑动：不触发填数，仅作为选择
    if (isFastSwipe && (activeNumber !== null || quickFillMode)) {
      isDragging = false;
      dragStartCell = null;
      updateMultiSelectHint();
      return;
    }

    // 单选点击
    isDragging = false;
    dragStartCell = null;
    updateMultiSelectHint();
  }

  function handleBoardLongPress(cell) {
    const cellData = board.cells[cell.r][cell.c];
    const num = cellData.fillNum || cellData.fixedNum;

    // Boss战幻影格机制：长按已填数字 → 质疑该格子
    if (typeof GuideBattle !== 'undefined' && GuideBattle.active && GuideBattle.hasFakeCells && GuideBattle.hasFakeCells()) {
      if (num > 0) {
        const result = GuideBattle.tryAccuseFakeCell(cell.r, cell.c);
        if (result.success) {
          if (result.isFake) {
            showToast('证伪成功！这是一个幻影格');
          } else {
            showToast('这个格子是真实的，不是幻影格');
          }
        }
        return;
      }
    }

    if (num > 0) {
      // 长按已填数字：高亮所有同数格子
      highlightAllSameNumber(num);
      showToast(`长按高亮：数字 ${num} 的所有位置`);
    } else if (techMatrix) {
      // 长按空格：钉选到技术矩阵演算区
      techMatrix.pinCell(cell.r, cell.c, 'observation');
      if (typeof AudioService !== 'undefined') AudioService.sfx.play('click');
      showToast(`已钉选 R${cell.r + 1}C${cell.c + 1} 到演算区（M 键打开技术矩阵）`);
    }
  }

  function highlightAllSameNumber(num) {
    const cells = [];
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const cell = board.cells[r][c];
        if ((cell.fillNum === num || cell.fixedNum === num) && num > 0) {
          cells.push({ row: r, col: c });
        }
      }
    }
    if (renderer && typeof renderer.highlightHintCells === 'function') {
      renderer.clearHintHighlights('longpress');
      renderer.highlightHintCells(cells, 'hint', 'longpress');
      renderer.render(board);
      // 3秒后自动清除
      setTimeout(() => {
        if (renderer && typeof renderer.clearHintHighlights === 'function') {
          renderer.clearHintHighlights('longpress');
          renderer.render(board);
        }
      }, 3000);
    }
  }

  // === Number Pad Pointer Handlers ===
  function onNumBtnPointerDown(e) {
    if (storyEngine && storyEngine._isPlaying) return;
    if (isCompleted) return;
    e.preventDefault();

    const btn = e.currentTarget;
    const num = parseInt(btn.dataset.num);
    if (isNaN(num) || num > board.size) return;

    // 如果数字已全部填完，不响应
    if (_isNumberComplete(num)) return;

    // 记录当前按下的按钮（防止拖动到其他按钮上误触）
    _numBtnPressed = btn;
    _numBtnHandled = false;
    longPressTriggered = false;

    // 教学 NOTE_ONLY 模式：禁用连填，直接输入笔记
    const isNoteLesson = lessonPlayer && lessonPlayer.isActive && lessonPlayer.isWaitingInput
      && lessonPlayer.getInteractionType() === 'NOTE_ONLY';

    if (isNoteLesson) {
      // 笔记教学模式：如果没有选中格子，自动选中目标格
      if (!board.selectedCell && board.selectedCells.length === 0) {
        const target = lessonPlayer.getGuidedTarget();
        if (target && target.cell) {
          board.selectCell(target.cell[0], target.cell[1]);
          if (renderer) renderer.render(board);
        }
      }
      // 点击数字键直接切换笔记
      handleNumberInput(num);
      _numBtnHandled = true; // 标记已处理，防止pointerleave/up重复触发
      return;
    }

    // 如果已经是连填状态，再次点击则取消（toggle）
    if (quickFillMode && quickFillNum === num) {
      exitQuickFillMode();
      _numBtnHandled = true;
      longPressTriggered = true; // 标记防止up时再触发
      return;
    }

    numBtnStartY = e.clientY;
    numBtnStartX = e.clientX;

    // 添加长按蓄力视觉效果
    btn.classList.add('long-pressing');

    // 长按检测：650ms 后激活连填模式
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      _numBtnHandled = true;
      btn.classList.remove('long-pressing');
      enterQuickFillMode(num);
    }, 650);
  }

  function onNumBtnPointerMove(e) {
    if (storyEngine && storyEngine._isPlaying) return;
    if (isCompleted) return;

    const btn = e.currentTarget;

    // 如果不是按下的那个按钮，不处理（防止拖动误触）
    if (_numBtnPressed !== btn) return;
    if (_numBtnHandled) return;

    const num = parseInt(btn.dataset.num);
    if (isNaN(num)) return;

    const deltaY = numBtnStartY - e.clientY; // 上划为正

    // 移动超过阈值则取消长按
    if (Math.abs(deltaY) > 15 || Math.abs(e.clientX - numBtnStartX) > 15) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      btn.classList.remove('long-pressing');
    }

    // 上划检测：填入笔记
    if (deltaY > swipeUpThreshold && !longPressTriggered) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      btn.classList.remove('long-pressing');
      // 上划：在选中格子/多选格子中切换笔记
      handleSwipeUpNote(num);
      longPressTriggered = true; // 标记为已处理，防止up时再触发
      _numBtnHandled = true;
    }
  }

  function onNumBtnPointerUp(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    const btn = e.currentTarget;
    btn.classList.remove('long-pressing');

    // 如果松开的按钮不是按下的按钮，说明是拖动过来的，不处理
    if (_numBtnPressed !== btn) {
      return;
    }

    // 如果已经处理过（长按触发、上划笔记、NOTE_ONLY模式等），不再重复处理
    if (_numBtnHandled) {
      _numBtnPressed = null;
      _numBtnHandled = false;
      longPressTriggered = false;
      return;
    }

    _numBtnPressed = null;
    _numBtnHandled = false;

    if (storyEngine && storyEngine._isPlaying) return;
    if (isCompleted) return;

    const num = parseInt(btn.dataset.num);
    if (isNaN(num) || num > board.size) return;

    // 长按已触发（连填模式激活），不处理普通点击
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }

    // 普通点击逻辑
    if (quickFillMode) {
      // 连填模式下：点击其他数字 → 切换连填数字
      if (quickFillNum !== num) {
        enterQuickFillMode(num);
      }
      // 点击同一数字 → 已在down时处理取消
    } else if (board.selectedCell || board.selectedCells.length > 0) {
      // 有选中格子 → 直接填入数字
      handleNumberInput(num);
    } else {
      // 没有选中格子 → 进入连填模式
      enterQuickFillMode(num);
    }
  }

  // 数字按钮 pointerleave：只清理状态，不触发点击（防止拖动误触）
  function onNumBtnPointerLeave(e) {
    const btn = e.currentTarget;

    // 清除长按状态
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    btn.classList.remove('long-pressing');

    // 如果离开的不是当前按下的按钮，直接忽略
    if (_numBtnPressed !== btn) return;

    // 如果已经处理过，不需要再做什么
    if (_numBtnHandled) return;

    // 注意：pointerleave 时不触发点击逻辑
    // 只有真正的 pointerup 才会触发点击
    // 这样拖动划过其他按钮时不会误输入
  }

  function handleSwipeUpNote(num) {
    // 上划：切换笔记候选数
    const hasSelection = board.selectedCells.length > 0;
    const hasSingle = board.selectedCell;

    if (hasSelection && board.selectedCells.length > 1) {
      // 多选模式：使用内置的批量切换笔记方法
      board.toggleCandidateForSelection(num);
    } else if (hasSingle) {
      // 单选模式：切换笔记
      board.toggleCandidate(num);
    } else if (hasSelection) {
      // 只有一个selectedCell时也用toggleCandidate
      board.toggleCandidate(num);
    }

    // 更新笔记系统
    if (window.gameNoteSystem && typeof window.gameNoteSystem.onNumberFilled === 'function') {
      window.gameNoteSystem.onNumberFilled();
    }

    renderer.render(board);

    // 震动反馈（如果支持）
    if (navigator.vibrate) navigator.vibrate(10);
  }

  // === 连填模式 ===
  function enterQuickFillMode(num) {
    if (_isNumberComplete(num)) return;

    quickFillMode = true;
    quickFillNum = num;

    // 更新按钮样式
    document.querySelectorAll('.num-btn').forEach(btn => {
      const btnNum = parseInt(btn.dataset.num);
      btn.classList.toggle('quick-fill-num', btnNum === num);
    });

    // 高亮盘面上所有相同数字
    if (renderer && typeof renderer.setHighlightNumber === 'function') {
      renderer.setHighlightNumber(num, true);
      renderer.forceRender = true;
      renderer.render(board);
    }

    // 显示提示（第一次使用时显示更详细）
    showToast(`连填模式：数字 ${num}，点击格子自动填入`, 1500);

    // 显示连填提示条
    const hintEl = document.getElementById('quick-fill-hint');
    if (hintEl) {
      hintEl.classList.add('show');
      // 3秒后隐藏
      setTimeout(() => {
        if (hintEl) hintEl.classList.remove('show');
      }, 3000);
    }

    AudioService.sfx.play('click');
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function exitQuickFillMode() {
    const prevNum = quickFillNum;
    quickFillMode = false;
    quickFillNum = null;

    // 清除按钮样式
    document.querySelectorAll('.num-btn').forEach(btn => {
      btn.classList.remove('quick-fill-num');
    });

    // 清除数字高亮
    if (renderer && typeof renderer.setHighlightNumber === 'function') {
      renderer.setHighlightNumber(prevNum, false);
      renderer.forceRender = true;
      renderer.render(board);
    }

    AudioService.sfx.play('click');
  }

  function _isNumberComplete(num) {
    if (!board) return false;
    let count = 0;
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const cell = board.cells[r][c];
        if (cell.fillNum === num || cell.fixedNum === num) count++;
      }
    }
    return count >= board.size;
  }

  function _checkQuickFillComplete() {
    if (!quickFillMode || quickFillNum === null) return;
    if (_isNumberComplete(quickFillNum)) {
      showToast(`数字 ${quickFillNum} 已全部填完，连填自动关闭`, 1500);
      exitQuickFillMode();
    }
  }

  function updateNumBtnActiveState() {
    document.querySelectorAll('.num-btn').forEach(btn => {
      const num = parseInt(btn.dataset.num);
      btn.classList.toggle('active', num === activeNumber);
    });
  }

  function checkAndClearActiveNumber() {
    // 检查该数字是否已填满（每宫/每行/每列都有了）
    if (activeNumber === null) return;

    let count = 0;
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const cell = board.cells[r][c];
        if (cell.fillNum === activeNumber || cell.fixedNum === activeNumber) {
          count++;
        }
      }
    }

    if (count >= board.size) {
      activeNumber = null;
      updateNumBtnActiveState();
      updateNumBtnCompletedState();
      showToast(`数字 ${count === board.size ? count : ''}已全部填完`);
    }
  }

  function updateNumBtnCompletedState() {
    for (let n = 1; n <= board.size; n++) {
      let count = 0;
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          if (cell.fillNum === n || cell.fixedNum === n) count++;
        }
      }
      const btn = document.querySelector(`.num-btn[data-num="${n}"]`);
      if (btn) {
        btn.classList.toggle('completed', count >= board.size);
        // 更新候选数小数字
        const countEl = btn.querySelector('.num-count');
        if (countEl) {
          countEl.textContent = board.size - count;
        }
      }
    }
    // 更新45法则HUD
    if (board && board.size === 9 && typeof updateRule45Banner === 'function') {
      const cell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
      updateRule45Banner(cell);
    }
  }

  // === Keyboard Handler ===
  function onKeyDown(e) {
    // 输入框/文本域焦点时，不响应游戏快捷键
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;
    if (document.activeElement && document.activeElement.isContentEditable) return;

    // Space key: always toggle pause (even when paused)
    if (e.key === ' ') {
      if (board && !isCompleted) {
        togglePause();
      }
      e.preventDefault();
      return;
    }

    if (storyEngine && storyEngine._isPlaying) return;
    if (isCompleted) return;
    if (isPaused) return;

    // Ctrl/meta key combos first (undo/redo)
    // Z / Ctrl+Z: undo
    if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      undo();
      e.preventDefault();
      return;
    }

    // Y / Ctrl+Shift+Z / Ctrl+Y: redo
    if ((e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) && (e.ctrlKey || e.metaKey)) {
      if (board && typeof board.redo === 'function') {
        board.redo();
        renderer.render(board);
        if (window.gameNoteSystem && typeof window.gameNoteSystem.onNumberFilled === 'function') {
          window.gameNoteSystem.onNumberFilled();
        }
        AudioService.sfx.play('click');
      }
      e.preventDefault();
      return;
    }

    // Number keys 1-9
    if (e.key >= '1' && e.key <= '9') {
      const num = parseInt(e.key);
      if (num <= board.size) {
        // 教学 NOTE_ONLY 模式：确保笔记模式开启，并自动选中目标格
        const isNoteLesson = lessonPlayer && lessonPlayer.isActive && lessonPlayer.isWaitingInput
          && lessonPlayer.getInteractionType() === 'NOTE_ONLY';

        if (isNoteLesson) {
          // 确保笔记模式开启
          if (!noteMode) {
            toggleNoteMode(true);
          }
          // 确保选中目标格
          if (!board.selectedCell && board.selectedCells.length === 0) {
            const target = lessonPlayer.getGuidedTarget();
            if (target && target.cell) {
              board.selectCell(target.cell[0], target.cell[1]);
              if (renderer) renderer.render(board);
            }
          }
        }

        handleNumberInput(num);
      }
      e.preventDefault();
      return;
    }

    // 0 / Backspace / Delete: erase
    // What If 模式下 Backspace 回退快照
    if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
      if (WhatIfState && WhatIfState.active && e.key === 'Backspace') {
        undoWhatIfStep();
      } else {
        handleErase();
      }
      e.preventDefault();
      return;
    }

    // Arrow keys: navigate / extend selection
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // === 教学引导：冻结期间禁止方向键移动 ===
      if (lessonPlayer && lessonPlayer.isActive && lessonPlayer._freezeEnabled) {
        e.preventDefault();
        return;
      }
      const dirs = { ArrowUp: [-1,0], ArrowDown: [1,0], ArrowLeft: [0,-1], ArrowRight: [0,1] };
      const [dr, dc] = dirs[e.key];
      if (e.shiftKey) {
        // Shift+方向键：扩展多选
        board.extendSelection(dr, dc);
        updateMultiSelectHint();
      } else {
        // 普通方向键：移动选中
        if (board.selectedCells.length > 0) {
          board.clearMultiSelect();
          updateMultiSelectHint();
        }
        board.moveSelection(dr, dc);
      }
      renderer.render(board);
      e.preventDefault();
      return;
    }

    // Esc: 按优先级关闭面板 / 取消
    if (e.key === 'Escape') {
      const handled = handleEscKey();
      if (handled) {
        e.preventDefault();
      }
      return;
    }

    // N: note mode
    if (e.key === 'n' || e.key === 'N') {
      toggleNoteMode();
      e.preventDefault();
      return;
    }

    // H: hint
    // Shift+H (debug mode only): toggle heatmap display
    if (e.key === 'h' || e.key === 'H') {
      // 调试模式下 Shift+H 切换热力图显示
      if (_debugMode && e.shiftKey) {
        _toggleHeatmapDisplay();
        e.preventDefault();
        return;
      }
      // What If 模式下提示不可用
      if (WhatIfState && WhatIfState.active) {
        showToast('假设模式下提示不可用');
        e.preventDefault();
        return;
      }
      showHint();
      e.preventDefault();
      return;
    }

    // W: What If 假设模式
    if (e.key === 'w' || e.key === 'W') {
      toggleWhatIfMode();
      e.preventDefault();
      return;
    }

    // Enter: What If 模式下采纳
    if (e.key === 'Enter' && WhatIfState && WhatIfState.active) {
      adoptWhatIfChanges();
      e.preventDefault();
      return;
    }

    // R: Rule45 (顶部常驻HUD，无开关功能)
    if (e.key === 'r' || e.key === 'R') {
      // 45法则已改为顶部常驻HUD显示
      showToast('45法则仪表盘已显示在棋盘上方');
      e.preventDefault();
      return;
    }

    // M: TechMatrix (技术矩阵)
    if (e.key === 'm' || e.key === 'M') {
      if (techMatrix) techMatrix.toggle();
      e.preventDefault();
      return;
    }

    // T: Technique encyclopedia
    if (e.key === 't' || e.key === 'T') {
      toggleTechniqueEncyclopedia();
      e.preventDefault();
      return;
    }

    // S: Settings panel
    if (e.key === 's' || e.key === 'S') {
      if (settingsPanel) settingsPanel.toggle();
      e.preventDefault();
      return;
    }

    // G: Gallery panel
    if (e.key === 'g' || e.key === 'G') {
      if (galleryPanel) galleryPanel.toggle();
      e.preventDefault();
      return;
    }

    // C: Check / validate answer
    if (e.key === 'c' || e.key === 'C') {
      checkBoardAnswer();
      e.preventDefault();
      return;
    }

    // A: Auto-fill candidates
    if (e.key === 'a' || e.key === 'A') {
      autoFillCandidates();
      e.preventDefault();
      return;
    }

    // + / = : increment selected cell number
    if (e.key === '+' || e.key === '=') {
      adjustSelectedNumber(1);
      e.preventDefault();
      return;
    }

    // - / _ : decrement selected cell number
    if (e.key === '-' || e.key === '_') {
      adjustSelectedNumber(-1);
      e.preventDefault();
      return;
    }
  }

  // === Esc 键处理（按优先级逐层关闭）===
  function handleEscKey() {
    // 优先级 1：设置面板
    if (settingsPanel && settingsPanel.visible) {
      settingsPanel.hide();
      return true;
    }
    // 优先级 1.5：技术矩阵面板
    if (techMatrix && techMatrix.visible) {
      techMatrix.hide();
      return true;
    }
    // 优先级 2：成就面板
    if (achievementPanel && achievementPanel._isVisible) {
      achievementPanel.hide();
      return true;
    }
    // 优先级 2.5：图鉴面板
    if (galleryPanel && galleryPanel._isVisible) {
      galleryPanel.hide();
      return true;
    }
    // 优先级 3：技巧图鉴
    if (_techniquePanelVisible) {
      hideTechniqueEncyclopedia();
      return true;
    }
    // 优先级 4：退出 What If 模式
    if (WhatIfState && WhatIfState.active) {
      if (WhatIfState.snapshots.length > 0) {
        // 有未采纳更改，确认退出
        if (confirm('退出假设模式？未采纳的更改将丢失。')) {
          exitWhatIfMode(false);
        }
      } else {
        exitWhatIfMode(false);
      }
      return true;
    }
    // 优先级 5：退出连填模式
    if (quickFillMode) {
      exitQuickFillMode();
      showToast('已退出连填模式', 1000);
      return true;
    }
    // 优先级 5b：取消数字激活
    if (activeNumber !== null) {
      activeNumber = null;
      updateNumBtnActiveState();
      showToast('已取消数字激活', 1000);
      return true;
    }
    // 优先级 6：清除多选
    if (board.selectedCells.length > 0) {
      board.clearMultiSelect();
      updateMultiSelectHint();
      renderer.render(board);
      return true;
    }
    // 优先级 7：清除选中
    if (board.selectedCell) {
      board.clearBoxSelection();
      renderer.render(board);
      return true;
    }
    return false;
  }

  // === 检查答案 ===
  function checkBoardAnswer() {
    if (!board) return;
    const result = validateBoard();
    if (!result.filled) {
      showToast('盘面还没有填满', 1500);
      return;
    }
    if (result.valid) {
      showToast('全部正确！恭喜通关~', 2000);
    } else {
      const count = result.errors.length;
      showToast(`发现 ${count} 处错误`, 2000);
      // 高亮错误
      highlightAllErrors();
    }
  }

  // === 自动填充候选数 ===
  function autoFillCandidates() {
    if (!board) return;
    const size = board.size;
    const { boxW, boxH } = board.getBoxSize();
    let filledCount = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.fixedNum || cell.fillNum) continue;
        if (cell.candidates.size > 0) continue; // 已经有候选数的跳过

        // 计算可用数字
        const used = new Set();
        // 行
        for (let i = 0; i < size; i++) {
          const v = board.cells[r][i].fixedNum || board.cells[r][i].fillNum;
          if (v) used.add(v);
        }
        // 列
        for (let i = 0; i < size; i++) {
          const v = board.cells[i][c].fixedNum || board.cells[i][c].fillNum;
          if (v) used.add(v);
        }
        // 宫
        const boxR = Math.floor(r / boxH) * boxH;
        const boxC = Math.floor(c / boxW) * boxW;
        for (let i = boxR; i < boxR + boxH; i++) {
          for (let j = boxC; j < boxC + boxW; j++) {
            const v = board.cells[i][j].fixedNum || board.cells[i][j].fillNum;
            if (v) used.add(v);
          }
        }
        // 笼（杀手数独）
        const cageIds = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
        for (const cageId of cageIds) {
          if (board.cageIdToCells && board.cageIdToCells[cageId]) {
            for (const [cr, cc] of board.cageIdToCells[cageId]) {
              const v = board.cells[cr][cc].fixedNum || board.cells[cr][cc].fillNum;
              if (v) used.add(v);
            }
          }
        }

        // 添加候选数
        for (let n = 1; n <= size; n++) {
          if (!used.has(n)) {
            cell.candidates.add(n);
            filledCount++;
          }
        }
      }
    }

    if (window.gameNoteSystem && typeof window.gameNoteSystem.onNumberFilled === 'function') {
      window.gameNoteSystem.onNumberFilled();
    }
    renderer.render(board);
    if (filledCount > 0) {
      showToast(`已自动填充 ${filledCount} 个候选数`, 1500);
    } else {
      showToast('所有空格都已有候选数', 1500);
    }
    AudioService.sfx.play('note_toggle');
  }

  // === 增减选中格数字 ===
  function adjustSelectedNumber(delta) {
    if (!board) return;
    const cell = board.getActiveCell();
    if (!cell) {
      board.selectCell(0, 0);
      renderer.render(board);
      return;
    }
    const { r, c } = cell;
    const targetCell = board.cells[r][c];
    if (targetCell.fixedNum) return;

    let current = targetCell.fillNum || 0;
    let next = current + delta;

    // 循环：超过最大值回到 1，低于 1 回到最大值
    if (next > board.size) next = 1;
    if (next < 1) next = board.size;

    if (next === 0) {
      handleErase();
    } else {
      handleNumberInput(next);
    }
  }

  function updateMultiSelectHint() {
    const hint = document.getElementById('multi-select-hint');
    if (!hint) return;
    const count = board.selectedCells.length;
    if (count > 1) {
      hint.textContent = `已选中 ${count} 格 · 笔记模式`;
      hint.classList.add('show');
    } else {
      hint.textContent = '';
      hint.classList.remove('show');
    }
    // 更新45法则HUD
    if (board && board.size === 9 && typeof updateRule45Banner === 'function') {
      const cell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
      updateRule45Banner(cell);
    }
  }

  function updateNoteButtonState() {
    const btn = document.getElementById('btn-note');
    if (btn) btn.classList.toggle('active', noteMode);
  }

  function handleErase() {
    AudioService.sfx.play('erase');
    if (board.selectedCells.length > 1) {
      // 多选模式：使用内置的批量擦除方法
      board.eraseSelection();
    } else if (board.selectedCell || (board.selectedCells.length === 1)) {
      board.eraseNumber();
    }
    // 连击系统：擦除断连
    if (comboSystem) {
      comboSystem.onErase();
    }
    if (window.gameNoteSystem && typeof window.gameNoteSystem.onNumberFilled === 'function') {
      window.gameNoteSystem.onNumberFilled();
    }
    renderer.render(board);
    updateNumBtnCompletedState();
    // 更新45法则HUD
    if (board && board.size === 9 && typeof updateRule45Banner === 'function') {
      const updateCell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
      updateRule45Banner(updateCell);
    }

    // What If 模式：擦除后自动生成快照
    if (WhatIfState && WhatIfState.active) {
      const cell = board.selectedCell || board.selectedCells[0];
      const label = cell ? `R${cell.r + 1}C${cell.c + 1}=∅` : 'erase';
      addWhatIfSnapshot(label);
    }
  }

  // === Undo ===
  function undo() {
    if (!board) return;
    // Boss战：记录撤销的位置
    let undoR = -1, undoC = -1;
    if (typeof GuideBattle !== 'undefined' && GuideBattle.active && board.selectedCell) {
      undoR = board.selectedCell.r;
      undoC = board.selectedCell.c;
    }
    board.undo();
    // Boss战：通知撤销
    if (typeof GuideBattle !== 'undefined' && GuideBattle.active && undoR >= 0) {
      GuideBattle.onPlayerUndo(undoR, undoC);
    }
    renderer.render(board);
    EventLogger.log('game:undo');
    // 更新45法则HUD
    if (board && board.size === 9 && typeof updateRule45Banner === 'function') {
      const updateCell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
      updateRule45Banner(updateCell);
    }
  }

  // === Erase ===
  function eraseCell() {
    handleErase();
    EventLogger.log('game:erase');
  }

  // === Note Mode ===
  function toggleNoteMode(forceValue) {
    const newMode = (forceValue !== undefined) ? !!forceValue : !noteMode;
    if (newMode === noteMode) return; // 状态未变化，不重复触发
    noteMode = newMode;
    AudioService.sfx.play('note_toggle');
    // 切换笔记模式时清除多选
    if (board && board.selectedCells.length > 0) {
      board.clearMultiSelect();
      updateMultiSelectHint();
    }
    // 同步 board.inputMode（控制候选数显示）
    if (board) {
      const targetMode = noteMode ? 'candidate' : 'normal';
      board.setInputMode(targetMode);
      // 双重保险：直接设置确保同步
      if (board.inputMode !== targetMode) {
        board.inputMode = targetMode;
      }
    }
    updateNoteButtonState();
    EventLogger.log('game:noteMode', { enabled: noteMode });
    showToast(noteMode ? '笔记模式：点击数字填入候选数' : '填数模式：点击数字填入答案', 1200);
    // 重新渲染（强制重绘，确保笔记显示状态正确）
    if (renderer && board) {
      renderer.forceRender = true;
      // 延迟一帧再渲染一次，确保状态同步
      renderer.render(board);
      requestAnimationFrame(() => {
        if (renderer && board) {
          renderer.forceRender = true;
          renderer.render(board);
        }
      });
    }
  }

  // === Hint ===
  function showHint() {
    if (!hintSystem) return;

    // What If 模式下提示不可用
    if (WhatIfState && WhatIfState.active) {
      showToast('假设模式下提示不可用');
      return;
    }

    // Check hint limit for current cycle
    if (!canUseHint()) {
      showToast('本周目提示次数已用完，请凭实力解谜');
      return;
    }

    const hint = hintSystem.getHint();
    if (!hint) {
      showToast('提示冷却中，请稍后再试');
      return;
    }

    AudioService.sfx.play('hint');

    if (hint.hintType === 'complete') {
      showToast(hint.dialogue);
      return;
    }

    const { character, characterName, dialogue, target, targetCells, techniqueName, isFirstEncounter, teachingDialog } = hint;

    // 记录本次提示使用的技巧（用于正确填数时触发技巧类成就）
    lastHintTechnique = techniqueName || null;

    // Clear previous hint highlights
    if (renderer && typeof renderer.clearHintHighlights === 'function') {
      renderer.clearHintHighlights('hint');
    }

    // Also select the primary target cell for backward compatibility
    // Safely extract row/col from target (supports {row,col}, {r,c}, {cells:[...]}, and region-only formats)
    if (target && board) {
      let tRow, tCol;
      if (target.row !== undefined && target.col !== undefined) {
        tRow = target.row;
        tCol = target.col;
      } else if (target.r !== undefined && target.c !== undefined) {
        tRow = target.r;
        tCol = target.c;
      } else if (target.cells && target.cells.length > 0) {
        const first = target.cells[0];
        if (first.row !== undefined && first.col !== undefined) {
          tRow = first.row;
          tCol = first.col;
        } else if (first.r !== undefined && first.c !== undefined) {
          tRow = first.r;
          tCol = first.c;
        }
      }
      if (tRow !== undefined && tCol !== undefined) {
        board.selectCell(tRow, tCol);
      }
    }

    renderer.render(board);

    hintCount++;
    expertSystem.onHint();
    // 累计总提示次数（用于真结局判定）
    if (global.ProgressManager) {
      ProgressManager.addHintCount(1);
    }
    EventLogger.log('game:hint', { character: characterName, target, targetCells, technique: techniqueName });

    // First encounter: play full teaching dialogue via StoryEngine
    if (isFirstEncounter && teachingDialog && teachingDialog.length > 0 && storyEngine) {
      playFirstEncounterTeaching(teachingDialog, character, techniqueName, targetCells);
      return;
    }

    // 使用动画播放器（如果可用）
    if (renderer && typeof renderer.playHintAnimation === 'function'
        && hint.hintType === 'deduction' && hint.hintLevel >= 2) {
      playHintAnimation(hint);
      return;
    }

    // Fallback: 旧版高亮 + 气泡方式
    // Highlight target cells (new multi-cell support)
    if (targetCells && targetCells.length > 0 && renderer && typeof renderer.highlightHintCells === 'function') {
      renderer.highlightHintCells(targetCells, 'hint', 'hint');
    }

    // 更新技术矩阵的证据链
    if (techMatrix && hint.hintType === 'deduction') {
      techMatrix.showEvidence(hint);
    }

    // Regular hint: show character bubble
    const prefix = techniqueName ? `【${techniqueName}】` : '';
    showCharacterBubble(character || NAME_TO_CHAR[characterName] || 'ayan', {
      text: prefix + dialogue,
      speakerName: characterName,
      duration: 4500,
      type: 'hint',
    });
  }

  /**
   * Play first-encounter teaching dialogue with full StoryEngine presentation.
   * Shows character portrait + typewriter dialogue, then re-highlights target.
   */
  function playFirstEncounterTeaching(dialogLines, characterId, techniqueName, targetCells) {
    if (!storyEngine || !dialogLines || dialogLines.length === 0) return;

    log.info('Playing first encounter teaching:', techniqueName, characterId);

    // Disable interaction during teaching
    setInteractionLocked(true);

    // Show teaching badge/title briefly
    showTeachingBadge(techniqueName);

    // Use StoryEngine for full dialogue experience
    // Shorten to 2-3 lines for first encounter (keep it snappy)
    const shortLines = dialogLines.slice(0, Math.min(3, dialogLines.length));

    setTimeout(() => {
      // 设置场景键，用于已读剧情记录
      const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
      const techKey = (techniqueName || 'unknown').replace(/\s+/g, '_');
      storyEngine.setSceneKey(chapterId + '_' + currentLevelId + '_tech_' + techKey);

      storyEngine.sayLines(shortLines, () => {
        // Re-highlight hint target after teaching ends
        if (renderer && typeof renderer.clearHintHighlights === 'function') {
          renderer.clearHintHighlights('hint');
          if (targetCells && targetCells.length > 0 && typeof renderer.highlightHintCells === 'function') {
            renderer.highlightHintCells(targetCells, 'hint', 'hint');
          }
          renderer.render(board);
        }
        setInteractionLocked(false);
        log.info('First encounter teaching complete:', techniqueName);
      });
    }, 800);
  }

  /**
   * Show a brief "new technique discovered" badge.
   */
  function showTeachingBadge(techniqueName) {
    const badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%) scale(0.8);' +
      'background:linear-gradient(135deg,rgba(251,191,36,0.2),rgba(15,23,42,0.95));' +
      'border:2px solid rgba(251,191,36,0.6);border-radius:16px;' +
      'padding:20px 40px;z-index:9998;text-align:center;' +
      'opacity:0;transition:all 0.5s cubic-bezier(0.4,0,0.2,1);' +
      'pointer-events:none;backdrop-filter:blur(4px);';
    badge.innerHTML =
      '<div style="font-size:12px;color:#fbbf24;letter-spacing:4px;margin-bottom:8px;">✦ 新技巧发现 ✦</div>' +
      '<div style="font-size:24px;font-weight:900;color:#fef3c7;text-shadow:0 0 20px rgba(251,191,36,0.5);">' +
      (techniqueName || '新技巧') + '</div>';
    document.body.appendChild(badge);

    requestAnimationFrame(() => {
      badge.style.opacity = '1';
      badge.style.transform = 'translate(-50%,-50%) scale(1)';
    });
    setTimeout(() => {
      badge.style.opacity = '0';
      badge.style.transform = 'translate(-50%,-50%) scale(0.9)';
      setTimeout(() => badge.remove(), 500);
    }, 700);
  }

  /**
   * Lock/unlock game interaction (used during teaching dialogues).
   */
  function setInteractionLocked(locked) {
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.pointerEvents = locked ? 'none' : '';
    }
    document.querySelectorAll('.num-btn, #toolbar button').forEach(el => {
      el.style.pointerEvents = locked ? 'none' : '';
    });
  }

  // === Rule45 Banner (顶部常驻 HUD) ===
  let _rule45BannerInited = false;

  function initRule45Banner() {
    if (_rule45BannerInited) return;
    const banner = document.getElementById('rule45-banner');
    if (!banner) return;
    _rule45BannerInited = true;
    banner.style.display = 'block';
  }

  function showRule45Banner() {
    const banner = document.getElementById('rule45-banner');
    if (banner) {
      banner.style.display = 'block';
    }
  }

  function hideRule45Banner() {
    const banner = document.getElementById('rule45-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  function updateRule45Banner(cell) {
    const banner = document.getElementById('rule45-banner');
    if (!banner || !board || board.size !== 9) return;

    let row = 0, col = 0;
    if (cell) {
      row = cell.r !== undefined ? cell.r : cell.row;
      col = cell.c !== undefined ? cell.c : cell.col;
    } else if (board.selectedCell) {
      row = board.selectedCell.r;
      col = board.selectedCell.c;
    } else if (board.selectedCells && board.selectedCells.length > 0) {
      row = board.selectedCells[0].r;
      col = board.selectedCells[0].c;
    }

    // 计算行信息
    let rowSum = 0, rowEmpty = 0;
    for (let c = 0; c < board.size; c++) {
      const cell = board.cells[row][c];
      if (cell.fillNum || cell.fixedNum) {
        rowSum += cell.fillNum || cell.fixedNum;
      } else {
        rowEmpty++;
      }
    }
    const rowDiff = 45 - rowSum;

    // 计算列信息
    let colSum = 0, colEmpty = 0;
    for (let r = 0; r < board.size; r++) {
      const cell = board.cells[r][col];
      if (cell.fillNum || cell.fixedNum) {
        colSum += cell.fillNum || cell.fixedNum;
      } else {
        colEmpty++;
      }
    }
    const colDiff = 45 - colSum;

    // 计算宫信息
    const boxW = 3, boxH = 3;
    const boxRow = Math.floor(row / boxH);
    const boxCol = Math.floor(col / boxW);
    let boxSum = 0, boxEmpty = 0;
    for (let r = boxRow * boxH; r < (boxRow + 1) * boxH; r++) {
      for (let c = boxCol * boxW; c < (boxCol + 1) * boxW; c++) {
        const cell = board.cells[r][c];
        if (cell.fillNum || cell.fixedNum) {
          boxSum += cell.fillNum || cell.fixedNum;
        } else {
          boxEmpty++;
        }
      }
    }
    const boxDiff = 45 - boxSum;

    // 更新行/列/宫数据
    document.getElementById('r45-row-label').textContent = `行${row + 1}·剩${rowEmpty}`;
    document.getElementById('r45-row-data').innerHTML = `${rowSum}<span class="r45-diff">/45</span> <span class="r45-remain">差${rowDiff}</span>`;

    document.getElementById('r45-col-label').textContent = `列${col + 1}·剩${colEmpty}`;
    document.getElementById('r45-col-data').innerHTML = `${colSum}<span class="r45-diff">/45</span> <span class="r45-remain">差${colDiff}</span>`;

    const boxNum = boxRow * 3 + boxCol + 1;
    document.getElementById('r45-box-label').textContent = `宫${boxNum}·剩${boxEmpty}`;
    document.getElementById('r45-box-data').innerHTML = `${boxSum}<span class="r45-diff">/45</span> <span class="r45-remain">差${boxDiff}</span>`;

    // 计算当前选中格子所在笼子的信息
    const cageTitleEl = document.getElementById('r45-cage-title');
    const cageCombosEl = document.getElementById('r45-cage-combos');
    
    if (board.cages && board.cages.length > 0 && (cell || (board.selectedCells && board.selectedCells.length > 0))) {
      // 找到包含当前格子的笼子（最外层）
      let currentCage = null;
      for (const cage of board.cages) {
        if (cage.cells.some(cc => cc[0] === row && cc[1] === col)) {
          currentCage = cage;
          break;
        }
      }

      if (currentCage) {
        // 计算笼子当前和
        let cageSum = 0;
        let cageEmpty = 0;
        const usedNums = [];
        for (const cc of currentCage.cells) {
          const c = board.cells[cc[0]][cc[1]];
          if (c.fillNum || c.fixedNum) {
            const num = c.fillNum || c.fixedNum;
            cageSum += num;
            if (!usedNums.includes(num)) usedNums.push(num);
          } else {
            cageEmpty++;
          }
        }
        const remain = currentCage.sum - cageSum;

        cageTitleEl.textContent = `笼 ${currentCage.sum}·${cageSum} (剩${remain})`;

        // 计算可能的组合（排除已使用的数字）
        if (cageEmpty > 0 && typeof Rule45 !== 'undefined' && Rule45.findCombinations) {
          try {
            const combos = Rule45.findCombinations(cageEmpty, remain, null, [], usedNums);
            cageCombosEl.innerHTML = '';
            const displayCombos = combos.slice(0, 8); // 最多显示8个
            for (const combo of displayCombos) {
              const pill = document.createElement('span');
              pill.className = 'r45-combo-pill';
              pill.textContent = '[' + combo.join(',') + ']';
              cageCombosEl.appendChild(pill);
            }
            if (combos.length > 8) {
              const more = document.createElement('span');
              more.style.cssText = 'font-size:11px;color:#6b7280;margin-left:4px;';
              more.textContent = `+${combos.length - 8}种`;
              cageCombosEl.appendChild(more);
            }
            if (combos.length === 0) {
              const none = document.createElement('span');
              none.style.cssText = 'font-size:11px;color:#ef4444;margin-left:4px;';
              none.textContent = '无解';
              cageCombosEl.appendChild(none);
            }
          } catch (e) {
            cageCombosEl.innerHTML = '<span style="font-size:11px;color:#6b7280;">组合计算中...</span>';
          }
        } else {
          cageCombosEl.innerHTML = '<span style="font-size:11px;color:#6b7280;">已填满</span>';
        }
      } else {
        cageTitleEl.textContent = '未选中笼子';
        cageCombosEl.innerHTML = '<span style="font-size:11px;color:#6b7280;">点击格子查看笼子组合</span>';
      }
    } else {
      cageTitleEl.textContent = '选择格子查看';
      cageCombosEl.innerHTML = '<span style="font-size:11px;color:#6b7280;">点击任意格子查看行列宫及笼子信息</span>';
    }
  }

  // ============================================================
  //  提示播放器（Hint Player）- 动画式推理展示
  // ============================================================
  const HintPlayerState = {
    playing: false,
    currentHint: null,
    totalSteps: 0,
    currentStep: 0,
  };

  /**
   * 从 hint 对象构建动画步骤序列
   */
  function _buildHintAnimationSteps(hint) {
    const steps = [];
    const { target, targetCells, technique, evidence, hintLevel } = hint;

    // 提取目标格子
    let targetCell = null;
    if (target) {
      if (target.row !== undefined && target.col !== undefined) {
        targetCell = [target.row, target.col];
      } else if (target.r !== undefined && target.c !== undefined) {
        targetCell = [target.r, target.c];
      } else if (target.cells && target.cells.length > 0) {
        const first = target.cells[0];
        targetCell = [first.row !== undefined ? first.row : first.r, first.col !== undefined ? first.col : first.c];
      }
    }

    // 相关格子数组（用于观察高亮）
    const observeCells = targetCells ? targetCells.map(c => {
      if (c.row !== undefined) return [c.row, c.col];
      if (c.r !== undefined) return [c.r, c.c];
      return c;
    }) : (targetCell ? [targetCell] : []);

    // 步骤 1: 观察 - 高亮相关区域
    const observeData = { cells: observeCells };

    // 如果有 evidence，提取行/列/宫/笼子信息
    if (evidence) {
      if (evidence.type === 'nakedSingle') {
        observeData.rows = targetCell ? [targetCell[0]] : [];
        observeData.cols = targetCell ? [targetCell[1]] : [];
      } else if (evidence.type === 'hiddenSingle') {
        observeData.rows = evidence.row !== undefined ? [evidence.row] : [];
        observeData.cols = evidence.col !== undefined ? [evidence.col] : [];
        observeData.boxes = evidence.box !== undefined ? [evidence.box] : [];
      } else if (evidence.type === 'cageUnique' || evidence.type === 'rule45') {
        observeData.cageIds = evidence.cageId ? [evidence.cageId] : [];
      } else if (evidence.type === 'nakedPair' || evidence.type === 'hiddenPair') {
        observeData.cells = evidence.pairCells || observeCells;
      }
    }

    steps.push({
      type: 'observe',
      duration: 600,
      data: observeData,
    });

    // 步骤 2: 聚焦 - 目标格子脉动
    if (targetCell) {
      steps.push({
        type: 'focus',
        duration: 800,
        data: { targetCell },
      });
    }

    // 步骤 3: 排除（仅 Level 2/3 且有排除信息时显示）
    if (hintLevel >= 2 && evidence && evidence.type === 'nakedSingle' && evidence.candidates) {
      const targetNum = evidence.targetValue;
      const eliminated = evidence.candidates.filter(n => n !== targetNum);
      if (eliminated.length > 0 && targetCell) {
        steps.push({
          type: 'eliminate',
          duration: Math.min(400 * eliminated.length, 1600),
          data: {
            cell: targetCell,
            numbers: eliminated,
          },
        });
      }
    }

    // 步骤 4: 揭示 - 目标数字填入（仅 Level 3）
    if (hintLevel >= 3 && targetCell && evidence && evidence.targetValue !== undefined) {
      steps.push({
        type: 'reveal',
        duration: 500,
        data: {
          cell: targetCell,
          number: evidence.targetValue,
        },
      });
    } else if (hintLevel >= 3 && targetCell && target.num !== undefined) {
      steps.push({
        type: 'reveal',
        duration: 500,
        data: {
          cell: targetCell,
          number: target.num,
        },
      });
    }

    // 步骤 5: 完成 - 微闪
    steps.push({
      type: 'complete',
      duration: 300,
      data: {},
    });

    return steps;
  }

  /**
   * 播放提示动画
   */
  function playHintAnimation(hint) {
    if (!renderer || typeof renderer.playHintAnimation !== 'function') return;
    if (!hint) return;

    const steps = _buildHintAnimationSteps(hint);
    if (steps.length === 0) return;

    HintPlayerState.playing = true;
    HintPlayerState.currentHint = hint;
    HintPlayerState.totalSteps = steps.length;
    HintPlayerState.currentStep = 0;

    // 显示右侧浮条进度
    const hintProg = document.getElementById('hint-progress-indicator');
    const stack = document.getElementById('whatif-snapshot-stack');
    if (!WhatIfState.active) {
      showFloatBar(false); // 显示拉扣头
    }
    if (hintProg) {
      hintProg.style.display = 'flex';
      document.getElementById('hint-current-step').textContent = '1';
      document.getElementById('hint-total-steps').textContent = String(steps.length);
    }
    if (stack && !WhatIfState.active) stack.style.display = 'none';
    _updateFloatBarTabIcon();

    // 启动动画
    renderer.playHintAnimation(
      steps,
      (stepIndex) => {
        // 每步完成回调
        HintPlayerState.currentStep = stepIndex + 1;
        const curEl = document.getElementById('hint-current-step');
        if (curEl) curEl.textContent = String(Math.min(stepIndex + 2, steps.length));
      },
      () => {
        // 全部完成回调
        _onHintAnimationComplete(hint);
      }
    );
  }

  /**
   * 提示动画完成后的处理
   */
  function _onHintAnimationComplete(hint) {
    HintPlayerState.playing = false;

    // 隐藏进度指示器（延迟一点，让完成感更强）
    setTimeout(() => {
      const hintProg = document.getElementById('hint-progress-indicator');
      if (hintProg) hintProg.style.display = 'none';
      // 如果 What If 模式未激活，隐藏浮条
      if (!WhatIfState.active) {
        hideFloatBar();
      }
      _updateFloatBarTabIcon();
    }, 500);

    // 显示角色气泡对话
    const { character, characterName, dialogue, techniqueName } = hint;
    const prefix = techniqueName ? `【${techniqueName}】` : '';
    showCharacterBubble(character || 'ayan', {
      text: prefix + dialogue,
      speakerName: characterName,
      duration: 4500,
      type: 'hint',
    });

    // 更新技术矩阵证据链
    if (techMatrix && hint.hintType === 'deduction') {
      techMatrix.showEvidence(hint);
    }
  }

  /**
   * 跳过当前提示步骤
   */
  function skipHintStep() {
    if (!renderer || !HintPlayerState.playing) return;
    if (typeof renderer.skipHintStep === 'function') {
      renderer.skipHintStep();
    }
  }

  /**
   * 停止提示动画
   */
  function stopHintAnimation() {
    if (!renderer) return;
    if (typeof renderer.stopHintAnimation === 'function') {
      renderer.stopHintAnimation();
    }
    HintPlayerState.playing = false;
    const hintProg = document.getElementById('hint-progress-indicator');
    if (hintProg) hintProg.style.display = 'none';
    if (!WhatIfState.active) {
      hideFloatBar();
    }
    _updateFloatBarTabIcon();
  }

  // ============================================================
  //  What If 假设模式（分支快照系统）
  // ============================================================
  const WhatIfState = {
    active: false,
    rootSnapshot: null,      // 根状态快照（进入时保存）
    snapshots: [],           // 快照栈（最多3个）
    maxSnapshots: 3,
    currentIndex: -1,        // 当前查看的快照索引（-1 表示最新状态）
    rootLevelTitle: '',      // 保存原关卡名
  };

  /**
   * 创建棋盘快照（深拷贝关键状态）
   */
  function _createWhatIfSnapshot(label) {
    if (!board) return null;
    const snapshot = {
      label: label || '',
      // 深拷贝格子数据
      cells: board.cells.map(row => row.map(cell => ({
        fillNum: cell.fillNum,
        fixedNum: cell.fixedNum,
        candidates: new Set(cell.candidates),
        eliminations: new Set(cell.eliminations),
        isError: cell.isError,
        tempWrongNum: cell.tempWrongNum,
        isLocked: cell.isLocked,
      }))),
      // 选中状态
      selectedCell: board.selectedCell ? { ...board.selectedCell } : null,
      selectedCells: board.selectedCells.map(c => ({ ...c })),
      selectedCageId: board.selectedCageId,
      selectedCageIds: [...(board.selectedCageIds || [])],
      // 历史记录
      history: board.history ? [...board.history] : [],
      redoStack: board.redoStack ? [...board.redoStack] : [],
      // 时间戳
      timestamp: Date.now(),
    };
    return snapshot;
  }

  /**
   * 从快照恢复棋盘状态
   */
  function _restoreWhatIfSnapshot(snapshot) {
    if (!board || !snapshot) return;

    // 恢复格子数据
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const src = snapshot.cells[r][c];
        const dst = board.cells[r][c];
        dst.fillNum = src.fillNum;
        dst.fixedNum = src.fixedNum;
        dst.candidates = new Set(src.candidates);
        dst.eliminations = new Set(src.eliminations);
        dst.isError = src.isError;
        dst.tempWrongNum = src.tempWrongNum;
        dst.isLocked = src.isLocked;
        dst.isSelected = false;
      }
    }

    // 恢复选中状态
    board.selectedCell = snapshot.selectedCell ? { ...snapshot.selectedCell } : null;
    board.selectedCells = snapshot.selectedCells.map(c => ({ ...c }));
    board.selectedCageId = snapshot.selectedCageId;
    board.selectedCageIds = [...(snapshot.selectedCageIds || [])];

    // 重新设置选中标记
    if (board.selectedCell) {
      const { r, c } = board.selectedCell;
      if (board.cells[r] && board.cells[r][c]) {
        board.cells[r][c].isSelected = true;
      }
    }
    for (const sc of board.selectedCells) {
      if (board.cells[sc.r] && board.cells[sc.r][sc.c]) {
        board.cells[sc.r][sc.c].isSelected = true;
      }
    }

    // 恢复历史
    board.history = snapshot.history ? [...snapshot.history] : [];
    board.redoStack = snapshot.redoStack ? [...snapshot.redoStack] : [];

    // 重绘
    if (renderer) {
      renderer.forceRender = true;
      renderer.render(board);
    }

    // 更新45法则HUD
    if (board.size === 9 && typeof updateRule45Banner === 'function') {
      updateRule45Banner(board.selectedCell || board.selectedCells[0]);
    }
  }

  /**
   * 生成快照缩略图（使用离屏canvas）
   */
  function _createSnapshotThumbnail(snapshot, index) {
    if (!board || !renderer) return '';
    try {
      const size = 56;
      const offscreen = document.createElement('canvas');
      offscreen.width = size * board.size;
      offscreen.height = size * board.size;
      const ctx = offscreen.getContext('2d');

      // 简化渲染：只画格子和数字
      const cellSize = size;
      // 背景
      ctx.fillStyle = '#0f1115';
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);

      // 网格线
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= board.size; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, offscreen.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(offscreen.width, i * cellSize);
        ctx.stroke();
      }

      // 宫线
      const boxW = board.size === 9 ? 3 : (board.size === 6 ? 3 : 2);
      const boxH = board.size === 9 ? 3 : (board.size === 6 ? 2 : 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= board.size; i += boxW) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, offscreen.height);
        ctx.stroke();
      }
      for (let i = 0; i <= board.size; i += boxH) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(offscreen.width, i * cellSize);
        ctx.stroke();
      }

      // 数字
      ctx.font = `600 ${Math.floor(cellSize * 0.6)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          const cell = snapshot.cells[r][c];
          const num = cell.fillNum || cell.fixedNum;
          if (num > 0) {
            ctx.fillStyle = cell.fixedNum ? '#e8eaed' : '#60a5fa';
            ctx.fillText(String(num), c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
          }
        }
      }

      return offscreen.toDataURL();
    } catch (e) {
      return '';
    }
  }

  /**
   * 渲染快照卡片到右侧浮条（扑克牌式堆叠）
   */
  function _renderWhatIfSnapshots() {
    const container = document.getElementById('snapshot-cards');
    if (!container) return;

    container.innerHTML = '';

    WhatIfState.snapshots.forEach((snap, index) => {
      const card = document.createElement('div');
      card.className = 'snapshot-card';
      if (index === WhatIfState.snapshots.length - 1 && WhatIfState.currentIndex === -1) {
        card.classList.add('active');
      } else if (index === WhatIfState.currentIndex) {
        card.classList.add('active');
      }

      // 缩略图
      if (snap.thumbnail) {
        const img = document.createElement('img');
        img.src = snap.thumbnail;
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
        card.appendChild(img);
      }

      // 索引徽章
      const indexBadge = document.createElement('div');
      indexBadge.className = 'snapshot-index';
      indexBadge.textContent = String(index + 1);
      card.appendChild(indexBadge);

      // 标签
      const label = document.createElement('div');
      label.className = 'snapshot-label';
      label.textContent = snap.label || `#${index + 1}`;
      card.appendChild(label);

      // 点击跳转
      card.addEventListener('click', () => {
        AudioService.sfx.play?.('click');
        jumpToWhatIfSnapshot(index);
      });

      container.appendChild(card);
    });

    // 更新拉扣头徽章数量
    _updateFloatBarBadge();
  }

  /**
   * 更新拉扣头上的徽章数量
   */
  function _updateFloatBarBadge() {
    const badge = document.getElementById('float-bar-tab-badge');
    const count = WhatIfState.snapshots.length;
    if (badge) {
      if (count > 0 && WhatIfState.active) {
        badge.style.display = 'flex';
        badge.textContent = String(count);
      } else {
        badge.style.display = 'none';
      }
    }
  }

  /**
   * 切换右侧浮条面板的展开/收起
   */
  function toggleFloatBarPanel() {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    const isOpen = bar.classList.contains('panel-open');
    if (isOpen) {
      bar.classList.remove('panel-open');
    } else {
      bar.classList.add('panel-open');
    }
  }

  /**
   * 显示右侧浮条（拉扣头）
   */
  function showFloatBar(showPanel = false) {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    bar.style.display = 'flex';
    if (showPanel) {
      bar.classList.add('panel-open');
    }
  }

  /**
   * 隐藏右侧浮条
   */
  function hideFloatBar() {
    const bar = document.getElementById('right-floating-bar');
    if (!bar) return;
    bar.style.display = 'none';
    bar.classList.remove('panel-open');
  }

  /**
   * 更新拉扣头图标（根据当前模式）
   */
  function _updateFloatBarTabIcon() {
    const icon = document.getElementById('float-bar-tab-icon');
    if (!icon) return;
    if (HintPlayerState && HintPlayerState.playing) {
      icon.textContent = '💡';
    } else if (WhatIfState && WhatIfState.active) {
      icon.textContent = '🧪';
    } else {
      icon.textContent = '💡';
    }
  }

  /**
   * 进入 What If 模式
   */
  function enterWhatIfMode() {
    if (WhatIfState.active || !board) return;
    if (storyEngine && storyEngine._isPlaying) return;
    if (isCompleted) return;

    // 如果技术矩阵已打开，先关闭它（平滑过渡）
    const techMatrixVisible = techMatrix && techMatrix.visible;
    if (techMatrixVisible) {
      techMatrix.hide();
      // 等待技术矩阵滑出后再进入 What If 模式
      setTimeout(() => {
        _doEnterWhatIf();
      }, 300);
      return;
    }

    _doEnterWhatIf();
  }

  /**
   * 实际执行进入 What If 模式的逻辑
   */
  function _doEnterWhatIf() {
    // 保存根状态
    WhatIfState.rootSnapshot = _createWhatIfSnapshot('root');
    WhatIfState.snapshots = [];
    WhatIfState.currentIndex = -1;
    WhatIfState.active = true;

    // 保存原关卡名
    const titleEl = document.getElementById('level-title');
    if (titleEl) {
      WhatIfState.rootLevelTitle = titleEl.textContent;
    }

    // 添加视觉标记
    document.body.classList.add('whatif-mode');

    // 显示右侧浮条（拉扣头 + 快照面板）
    const stack = document.getElementById('whatif-snapshot-stack');
    const hintProg = document.getElementById('hint-progress-indicator');
    showFloatBar(false); // 显示拉扣头，面板默认收起
    if (stack) stack.style.display = 'flex';
    if (hintProg) hintProg.style.display = 'none';
    _updateFloatBarTabIcon();
    _updateFloatBarBadge();

    // 更新按钮状态
    const btn = document.getElementById('btn-whatif');
    if (btn) {
      btn.style.color = '#60a5fa';
      btn.style.background = 'rgba(96, 165, 250, 0.15)';
    }

    // 更新提示按钮（禁用）
    const hintBtn = document.getElementById('btn-hint');
    if (hintBtn) {
      hintBtn.style.opacity = '0.4';
      hintBtn.style.pointerEvents = 'none';
      hintBtn.title = '假设模式下提示不可用';
    }

    // 阻止安卓返回键（popstate 拦截）
    try {
      history.pushState({ whatIf: true }, '');
    } catch (e) {}

    AudioService.sfx.play?.('select');
    showToast('已进入假设模式，最多保存 3 个分支快照');
  }

  /**
   * 退出 What If 模式（回到根状态）
   */
  function exitWhatIfMode(adoptChanges) {
    if (!WhatIfState.active) return;

    if (!adoptChanges) {
      // 回退到根状态
      if (WhatIfState.rootSnapshot) {
        _restoreWhatIfSnapshot(WhatIfState.rootSnapshot);
      }
    }

    WhatIfState.active = false;
    WhatIfState.rootSnapshot = null;
    WhatIfState.snapshots = [];
    WhatIfState.currentIndex = -1;

    // 移除视觉标记
    document.body.classList.remove('whatif-mode');

    // 恢复关卡名
    const titleEl = document.getElementById('level-title');
    if (titleEl && WhatIfState.rootLevelTitle) {
      titleEl.textContent = WhatIfState.rootLevelTitle;
      WhatIfState.rootLevelTitle = '';
    }

    // 隐藏右侧浮条
    const stack = document.getElementById('whatif-snapshot-stack');
    hideFloatBar();
    if (stack) stack.style.display = 'none';

    // 恢复按钮状态
    const btn = document.getElementById('btn-whatif');
    if (btn) {
      btn.style.color = '';
      btn.style.background = '';
    }

    // 恢复提示按钮
    const hintBtn = document.getElementById('btn-hint');
    if (hintBtn) {
      hintBtn.style.opacity = '';
      hintBtn.style.pointerEvents = '';
      hintBtn.title = '提示 (H)';
    }

    // 清理历史状态
    try {
      if (history.state && history.state.whatIf) {
        history.back();
      }
    } catch (e) {}

    AudioService.sfx.play?.('click');
  }

  /**
   * 切换 What If 模式
   */
  function toggleWhatIfMode() {
    if (WhatIfState.active) {
      // 退出时询问是否采纳
      if (WhatIfState.snapshots.length > 0 || WhatIfState.rootSnapshot) {
        // 简单处理：直接回退（长按或菜单可以有采纳选项）
        exitWhatIfMode(false);
        showToast('已退出假设模式，更改已撤销');
      } else {
        exitWhatIfMode(false);
      }
    } else {
      enterWhatIfMode();
    }
  }

  /**
   * 添加一个快照（填数后自动调用）
   */
  function addWhatIfSnapshot(label) {
    if (!WhatIfState.active || !board) return;

    const snap = _createWhatIfSnapshot(label);
    if (!snap) return;

    // 生成缩略图
    snap.thumbnail = _createSnapshotThumbnail(snap, WhatIfState.snapshots.length);

    // 滚动覆盖：超过上限时移除最旧的
    if (WhatIfState.snapshots.length >= WhatIfState.maxSnapshots) {
      WhatIfState.snapshots.shift();
      showToast('已覆盖最早的分支快照');
    }

    WhatIfState.snapshots.push(snap);
    WhatIfState.currentIndex = -1; // -1 表示当前是最新状态

    _renderWhatIfSnapshots();

    // 快照生成闪光效果
    if (renderer && board.selectedCell) {
      renderer.triggerFillAnimation?.(board.selectedCell.r, board.selectedCell.c, 200);
    }
  }

  /**
   * 跳转到指定快照
   */
  function jumpToWhatIfSnapshot(index) {
    if (!WhatIfState.active || !WhatIfState.snapshots[index]) return;

    const snap = WhatIfState.snapshots[index];
    WhatIfState.currentIndex = index;

    // 淡入淡出效果
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.style.opacity = '0.3';
      setTimeout(() => {
        _restoreWhatIfSnapshot(snap);
        canvas.style.opacity = '1';
        canvas.style.transition = 'opacity 0.3s ease';
        setTimeout(() => { canvas.style.transition = ''; }, 300);
      }, 200);
    } else {
      _restoreWhatIfSnapshot(snap);
    }

    _renderWhatIfSnapshots();
    AudioService.sfx.play?.('select');
  }

  /**
   * 回退一步（弹出栈顶快照）
   */
  function undoWhatIfStep() {
    if (!WhatIfState.active) return;

    if (WhatIfState.snapshots.length === 0) {
      // 没有快照了，退出 What If
      exitWhatIfMode(false);
      showToast('已退出假设模式');
      return;
    }

    // 弹出最新快照
    WhatIfState.snapshots.pop();

    if (WhatIfState.snapshots.length > 0) {
      // 恢复到上一个快照
      const prevSnap = WhatIfState.snapshots[WhatIfState.snapshots.length - 1];
      WhatIfState.currentIndex = WhatIfState.snapshots.length - 1;
      _restoreWhatIfSnapshot(prevSnap);
    } else {
      // 回到根状态
      WhatIfState.currentIndex = -1;
      if (WhatIfState.rootSnapshot) {
        _restoreWhatIfSnapshot(WhatIfState.rootSnapshot);
      }
    }

    _renderWhatIfSnapshots();
    AudioService.sfx.play?.('erase');
  }

  /**
   * 采纳当前假设（写入正式棋盘）
   */
  function adoptWhatIfChanges() {
    if (!WhatIfState.active) return;
    exitWhatIfMode(true);
    showToast('已采纳假设，更改已保存');
  }

  /**
   * 彻底回退（回到根状态，不退出模式）
   */
  function resetWhatIfToRoot() {
    if (!WhatIfState.active || !WhatIfState.rootSnapshot) return;

    _restoreWhatIfSnapshot(WhatIfState.rootSnapshot);
    WhatIfState.snapshots = [];
    WhatIfState.currentIndex = -1;
    _renderWhatIfSnapshots();
    AudioService.sfx.play?.('erase');
    showToast('已重置到假设起点');
  }

  // === Technique Encyclopedia ===
  let _techniquePanelEl = null;
  let _techniquePanelVisible = false;

  function toggleTechniqueEncyclopedia() {
    if (_techniquePanelVisible) {
      hideTechniqueEncyclopedia();
    } else {
      showTechniqueEncyclopedia();
    }
  }

  function showTechniqueEncyclopedia() {
    if (_techniquePanelVisible) return;
    _techniquePanelVisible = true;

    // Get teaching system data
    const teachingSys = global.guideTeachingSystem;
    const learned = teachingSys ? teachingSys.getLearnedTechniques() : [];
    const allTechniques = teachingSys ? teachingSys.getAllTechniques() : [];

    // Create panel
    const panel = document.createElement('div');
    panel.id = 'technique-encyclopedia';
    _techniquePanelEl = panel;

    panel.style.cssText =
      'position:fixed;top:0;right:0;width:100%;max-width:420px;height:100%;' +
      'background:rgba(15,23,42,0.98);' +
      'border-left:1px solid rgba(251,191,36,0.3);' +
      'z-index:20000;' +
      'transform:translateX(100%);' +
      'transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);' +
      'display:flex;flex-direction:column;' +
      'backdrop-filter:blur(12px);';

    // Category labels
    const categoryNames = {
      basic: '基础技巧',
      intermediate: '进阶技巧',
      killer: '杀手数独',
    };

    // Mastery labels
    const masteryLabels = ['未学习', '初次见面', '略有印象', '基本掌握', '熟练运用', '融会贯通'];
    const masteryColors = ['#64748b', '#94a3b8', '#3b82f6', '#22c55e', '#f59e0b', '#fbbf24'];

    // Build technique list
    let techniquesHTML = '';
    const categories = { basic: [], intermediate: [], killer: [] };

    if (teachingSys) {
      for (const techId of allTechniques) {
        const info = teachingSys.getTechniqueInfo(techId);
        if (info && categories[info.category]) {
          categories[info.category].push(info);
        }
      }
    }

    for (const [cat, list] of Object.entries(categories)) {
      if (list.length === 0) continue;
      techniquesHTML +=
        '<div style="margin-bottom:20px;">' +
        '<div style="font-size:11px;color:#fbbf24;letter-spacing:3px;margin-bottom:8px;padding-left:4px;">' +
        (categoryNames[cat] || cat) + '</div>';
      for (const tech of list) {
        const level = tech.masteryLevel || 0;
        const pct = Math.min(100, level * 20);
        const isLocked = !tech.learned;
        techniquesHTML +=
          '<div style="' +
            'background:rgba(30,41,59,0.8);' +
            'border:1px solid ' + (isLocked ? 'rgba(100,116,139,0.2)' : 'rgba(251,191,36,0.2)') + ';' +
            'border-radius:10px;' +
            'padding:12px;' +
            'margin-bottom:8px;' +
            'opacity:' + (isLocked ? '0.5' : '1') + ';' +
          '">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
              '<span style="font-size:14px;font-weight:700;color:' + (isLocked ? '#64748b' : '#fef3c7') + ';">' +
                (isLocked ? '🔒 ' + '???' : tech.name) + '</span>' +
              '<span style="font-size:10px;color:' + masteryColors[level] + ';letter-spacing:1px;">' +
                masteryLabels[level] + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-bottom:8px;">' +
              (isLocked ? '尚未发现此技巧' : tech.description) +
            '</div>' +
            (isLocked ? '' :
              '<div style="height:4px;background:rgba(100,116,139,0.2);border-radius:2px;overflow:hidden;">' +
                '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,' + masteryColors[level] + ',' + masteryColors[Math.min(5, level + 1)] + ');border-radius:2px;transition:width 0.3s;"></div>' +
              '</div>' +
              '<div style="font-size:9px;color:#64748b;margin-top:4px;text-align:right;">' +
                '遇见 ' + tech.encounterCount + ' 次 · 正确 ' + (tech.correctCount || 0) + ' 次' +
              '</div>'
            ) +
          '</div>';
      }
      techniquesHTML += '</div>';
    }

    if (learned.length === 0 && allTechniques.length === 0) {
      techniquesHTML =
        '<div style="text-align:center;color:#64748b;padding:40px 20px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">📖</div>' +
        '<div style="font-size:14px;">教学系统未加载</div>' +
        '</div>';
    } else if (learned.length === 0) {
      techniquesHTML =
        '<div style="text-align:center;color:#64748b;padding:40px 20px;">' +
        '<div style="font-size:48px;margin-bottom:16px;">🔍</div>' +
        '<div style="font-size:14px;margin-bottom:8px;">还没有发现任何技巧</div>' +
        '<div style="font-size:11px;">点击提示按钮，在解谜中学习新技巧吧！</div>' +
        '</div>';
    }

    panel.innerHTML =
      // Header
      '<div style="padding:20px 20px 16px;border-bottom:1px solid rgba(251,191,36,0.2);display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-size:18px;font-weight:900;color:#fef3c7;letter-spacing:2px;">📖 技巧图鉴</div>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">' +
            '已掌握 ' + learned.length + ' / ' + allTechniques.length + ' 种技巧' +
          '</div>' +
        '</div>' +
        '<div id="tech-panel-close" style="font-size:20px;color:#64748b;cursor:pointer;padding:4px 8px;" title="关闭">✕</div>' +
      '</div>' +
      // Content
      '<div style="flex:1;overflow-y:auto;padding:16px 20px;">' +
        techniquesHTML +
      '</div>';

    document.body.appendChild(panel);

    // Animate in
    requestAnimationFrame(() => {
      panel.style.transform = 'translateX(0)';
    });

    // Close button
    panel.querySelector('#tech-panel-close').addEventListener('click', () => {
      hideTechniqueEncyclopedia();
    });

    EventLogger.log('game:techniques', { visible: true });
  }

  function hideTechniqueEncyclopedia() {
    if (!_techniquePanelVisible || !_techniquePanelEl) return;
    _techniquePanelVisible = false;

    const panel = _techniquePanelEl;
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (panel.parentNode) panel.remove();
    }, 300);
    _techniquePanelEl = null;

    EventLogger.log('game:techniques', { visible: false });
  }

  // === Hint Limit (per cycle) ===
  function getMaxHints() {
    // Base hints based on grid size
    const gridSize = currentLevelData ? (currentLevelData.gridSize || 9) : 9;
    let baseHints = gridSize <= 4 ? 5 : gridSize <= 6 ? 8 : 12;

    // Apply cycle multiplier
    if (global.ProgressManager) {
      const mods = ProgressManager.getCycleModifiers();
      baseHints = Math.max(1, Math.floor(baseHints * mods.hintMultiplier));
    }

    return baseHints;
  }

  function canUseHint() {
    return hintCount < getMaxHints();
  }

  // === Update Number Pad ===
  function updateNumPad() {
    const maxNum = board ? board.size : 9;
    document.querySelectorAll('.num-btn').forEach(btn => {
      const num = parseInt(btn.dataset.num);
      btn.style.display = num <= maxNum ? '' : 'none';
    });
    // 动态调整 grid 列数，确保按钮居中（4x4=4列，6x6=6列，9x9=9列）
    const numPad = document.getElementById('num-pad');
    if (numPad) {
      numPad.style.gridTemplateColumns = `repeat(${maxNum}, 1fr)`;
    }
  }

  // === Number Input ===
  function handleNumberInput(num, targetCell) {
    if (!board) return;
    const solution = currentLevelData.solution;

    // === 教学引导：guided 阶段输入反馈 ===
    if (lessonPlayer && lessonPlayer.isWaitingInput) {
      // NOTE_ONLY 模式下，填数逻辑不触发教学反馈（由笔记切换逻辑处理）
      const interactionType = lessonPlayer.getInteractionType();
      if (interactionType !== 'NOTE_ONLY') {
        let targetR, targetC;
        if (targetCell) {
          targetR = targetCell.r;
          targetC = targetCell.c;
        } else if (board.selectedCell) {
          targetR = board.selectedCell.r;
          targetC = board.selectedCell.c;
        } else {
          return;
        }

        const lessonResult = _lessonHandleCellFill(targetR, targetC, num);
        // 注意：即使教学系统处理了，数字也照常填入
        // 教学系统只负责额外的反馈（成功动画、失败提示等）
        // 自动揭示的情况由教学系统直接填入正确答案，不走这里
        if (lessonResult && lessonResult.handled && lessonResult.autoRevealed) {
          return; // 自动揭示了，不重复填
        }
      }
    }

    // 多选模式：批量操作（普通模式填数 / 笔记模式切换候选）
    if (board.selectedCells.length > 1) {
      if (noteMode) {
        // 笔记模式：批量切换候选数
        board.toggleCandidateForSelection(num);
        usedNotes = true;
        if (window.gameNoteSystem && typeof window.gameNoteSystem.onNumberFilled === 'function') {
          window.gameNoteSystem.onNumberFilled();
        }
      } else {
        // 普通模式 / 连填模式：批量填数
        const solution = currentLevelData?.solution;
        let correctCount = 0;
        let wrongCount = 0;
        const cells = board.selectedCells.slice();

        for (const { r, c } of cells) {
          const cell = board.cells[r][c];
          if (cell.fixedNum > 0 || cell.isLocked) continue;
          if (cell.fillNum === num) continue;

          if (solution && solution[r] && solution[r][c] === num) {
            // 正确填数
            board.setNumberAt(r, c, num);
            correctCount++;
            // Combo 系统
            if (comboSystem && typeof comboSystem.onCorrectFill === 'function') {
              comboSystem.onCorrectFill(r, c, num);
            }
            // Boss战：通知玩家正确填数
            if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
              GuideBattle.onPlayerFill(r, c, num, true);
            }
            // 填数动画
            if (renderer && typeof renderer.triggerFillAnimation === 'function') {
              renderer.triggerFillAnimation(r, c, 200);
            }
          } else {
            // 错误填数
            wrongCount++;
            errorCount++;
            // Boss战：通知玩家错误填数
            if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
              GuideBattle.onPlayerFill(r, c, num, false);
            }
            if (!board.settings.keepWrongNumber) {
              // 临时显示错误，300ms 后清除
              cell.tempWrongNum = num;
              cell.isError = true;
              setTimeout(() => {
                cell.tempWrongNum = null;
                cell.isError = false;
                if (renderer) renderer.render(board);
              }, 300);
            } else {
              board.setNumberAt(r, c, num);
              cell.isError = true;
              setTimeout(() => {
                cell.isError = false;
                if (renderer) renderer.render(board);
              }, 800);
            }
          }
        }

        // 播放音效（取多数）
        if (correctCount > 0 || wrongCount > 0) {
          if (correctCount >= wrongCount) {
            AudioService.sfx.play('fill_correct');
          } else {
            AudioService.sfx.play('fill_wrong');
          }
          updateNumBtnCompletedState();
          checkCompletion();
        }
      }
      renderer.render(board);
      return;
    }

    // 单选模式
    let targetR, targetC;
    if (targetCell) {
      targetR = targetCell.r;
      targetC = targetCell.c;
      board.selectCell(targetR, targetC);
    } else if (board.selectedCell) {
      targetR = board.selectedCell.r;
      targetC = board.selectedCell.c;
    } else if (board.selectedCells.length > 0) {
      // 兼容：只有selectedCells但没有selectedCell时，用第一个选中格
      const first = board.selectedCells[0];
      targetR = first.r;
      targetC = first.c;
      board.selectCell(targetR, targetC);
    } else {
      return;
    }

    const { r, c } = { r: targetR, c: targetC };

    // 不能修改固定数字
    const cell = board.cells[r][c];
    if (cell.fixedNum > 0) return;
    if (cell.isLocked) return;

    // Note mode: toggle candidate
    if (noteMode) {
      // 确保格子处于可编辑状态
      if (cell.fillNum) return;
      // 确保inputMode是candidate（控制候选数显示）
      if (board.inputMode !== 'candidate' && board.inputMode !== 'elimination') {
        board.setInputMode('candidate');
      }
      board.toggleCandidate(num);
      usedNotes = true;

      // === 教学引导：笔记输入检测 ===
      if (lessonPlayer && lessonPlayer.isActive) {
        // 检查切换后这个数字是否还在候选里（toggle 是添加还是移除）
        const wasAdded = cell.candidates.has(num);
        const noteResult = lessonPlayer.handleNoteToggle(r, c, num, wasAdded);
        if (noteResult && noteResult.handled && noteResult.noteComplete) {
          // 笔记完成，播放成功反馈
          AudioService.sfx.play('fill_correct');
          if (renderer && typeof renderer.triggerFillAnimation === 'function') {
            renderer.triggerFillAnimation(r, c, 300);
          }
        }
      }

      if (window.gameNoteSystem && typeof window.gameNoteSystem.onNumberFilled === 'function') {
        window.gameNoteSystem.onNumberFilled();
      }
      // 强制重绘（确保笔记更新可见）
      if (renderer) {
        renderer.forceRender = true;
        renderer.render(board);
      }
      EventLogger.log('game:note', { row: r, col: c, num });
      return;
    }

    EventLogger.log('game:fill', { row: r, col: c, num });

    if (solution && solution[r][c] === num) {
      // 正确
      board.setNumber(num);
      AudioService.sfx.play('fill_correct');
      expertSystem.onFillCorrect(r, c, num);
      // 连击系统：正确填数
      if (comboSystem) {
        comboSystem.onCorrectFill(r, c, num);
      }
      // Boss战：通知玩家正确填数
      if (typeof GuideBattle !== 'undefined' && GuideBattle.active) {
        GuideBattle.onPlayerFill(r, c, num, true);
      }
      EventLogger.log('game:fill_correct', { row: r, col: c, num });

      // 技巧类成就检测：如果玩家刚看过某个技巧的提示后正确填数，记录该技巧使用
      if (lastHintTechnique && global.ProgressManager) {
        recordTechniqueUsage(lastHintTechnique);
        // 使用后清除，避免一次提示多次计数
        lastHintTechnique = null;
      }
      // Trigger fill animation
      if (renderer && typeof renderer.triggerFillAnimation === 'function') {
        renderer.triggerFillAnimation(r, c, 200);
      }
      updateNumBtnCompletedState();
      checkCompletion();
    } else {
      // 错误填入
      const keepWrong = board.settings.keepWrongNumber;

      if (keepWrong) {
        // 旧行为：错误数字写入 fillNum，800ms 后清除
        board.setNumber(num);
        cell.isError = true;
        AudioService.sfx.play('fill_wrong');
        // 错误高亮
        if (renderer && typeof renderer.highlightHintCells === 'function') {
          renderer.clearHintHighlights('error');
          renderer.highlightHintCells([{ row: r, col: c }], 'error', 'error');
          setTimeout(() => {
            if (renderer && typeof renderer.clearHintHighlights === 'function') {
              renderer.clearHintHighlights('error');
              cell.isError = false;
              renderer.render(board);
            }
          }, 800);
        }
      } else {
        // 新行为：错误数字不写入 fillNum，用 tempWrongNum 临时显示，300ms 后清除
        cell.tempWrongNum = num;
        AudioService.sfx.play('fill_wrong');
        // 红色边框高亮（闪烁效果）
        if (renderer && typeof renderer.highlightHintCells === 'function') {
          renderer.clearHintHighlights('error');
          renderer.highlightHintCells([{ row: r, col: c }], 'error', 'error');
        }
        // 启动闪烁动画循环（为了抖动效果，需要多次重绘）
        let flashCount = 0;
        const flashInterval = setInterval(() => {
          flashCount++;
          if (flashCount >= 3) {
            clearInterval(flashInterval);
          }
          if (renderer) renderer.render(board);
        }, 80);
        // 300ms 后清除临时错误数字
        setTimeout(() => {
          clearInterval(flashInterval);
          cell.tempWrongNum = null;
          cell.isError = false;
          if (renderer && typeof renderer.clearHintHighlights === 'function') {
            renderer.clearHintHighlights('error');
          }
          if (renderer) renderer.render(board);
        }, 300);
      }
      // 震动反馈
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      errorCount++;
      expertSystem.onFillWrong(r, c, num);
      // 连击系统：错误填数
      if (comboSystem) {
        comboSystem.onWrongFill(r, c, num);
      }
      // 角色错误反馈（通过 expression 层触发 ERROR_FEEDBACK）
      if (expertSystem && expertSystem.expression) {
        expertSystem.expression.enqueue({
          action: 'ERROR_FEEDBACK',
          payload: {
            message: '小心，这格不对哦。再想想看~',
            character: 'cagekeeper',
            speakerName: '守笼人',
          },
          priority: 40,
        });
      }
      EventLogger.log('game:fill_wrong', { row: r, col: c, num });
    }

    renderer.render(board);

    // 更新45法则HUD
    if (board && board.size === 9 && typeof updateRule45Banner === 'function') {
      const updateCell = board.selectedCell || (board.selectedCells && board.selectedCells[0]);
      updateRule45Banner(updateCell);
    }

    // What If 模式：填数后自动生成快照
    if (WhatIfState && WhatIfState.active) {
      const label = `R${r + 1}C${c + 1}=${num}`;
      addWhatIfSnapshot(label);
    }
  }

  // === Three-Act Guide (三幕式引导) v2 ===

  /**
   * ThreeActGuide - 三幕式节奏引导系统（升级版）
   *
   * 触发时机：
   *   - 第一幕·引子（钩子1）：playPreDialog 之后、initBoard 之前，纯 StoryEngine 对话
   *   - 第一幕·揭盘（钩子2）：initBoard 渲染完成后，高亮 simple 格 + StoryEngine 对话
   *   - 第二幕·破局（运行时）：填完所有 simple 格时，高亮 gate 格 + StoryEngine 对话
   *   - 第三幕·雪崩（运行时）：填完所有 gate 格时，快速气泡飘过 + 雪崩音效
   *
   * 启用条件：
   *   - features.threeActGuide === true
   *   - 或：新手关（101~109）且 difficultyLevel >= 2
   *   - 有 lessonPlan 的关卡不启用（优先使用 LessonPlayer）
   *
   * 使用 localStorage 记录每关各幕的显示状态，首次进入才显示。
   */
  const ThreeActGuide = (function() {
    const STORAGE_KEY = 'cagemaster3_three_act_shown';
    const ACTS = {
      ACT1: 'act1',       // 第一幕（引子 + 揭盘）
      ACT2: 'act2',       // 第二幕·破局
      ACT3: 'act3',       // 第三幕·雪崩
    };

    // 默认台词（如果关卡没有配置 threeActDialog）
    const DEFAULT_DIALOG = {
      act1Intro: [
        { speaker: '阿妍', text: '这一关的节奏分三步走~' },
        { speaker: '阿妍', text: '第一步：先把这些绿色格子填了，都是送分题！' },
        { speaker: '阿妍', text: '快速建立节奏，后面就顺了~' },
      ],
      act1Reveal: [
        { speaker: '阿妍', text: '看，这些绿色的都是开局就能秒填的~' },
        { speaker: '守笼人', text: '等你把绿色都填完，红色破局点就会出现啦！' },
      ],
      act2: [
        { speaker: '阿妍', text: '绿色清完了！现在看这些红色格子~' },
        { speaker: '守笼人', text: '它们是破局关键，填对一个就能连锁解锁好多！' },
        { speaker: '阿妍', text: '试试用你学过的技巧突破吧~' },
      ],
      act3: '进入雪崩阶段啦~',
    };

    // 运行时状态
    let _enabled = false;
    let _act1Started = false;
    let _act2Triggered = false;
    let _act3Triggered = false;
    let _lastSimpleCompleted = false;
    let _lastGateCompleted = false;
    let _highlightTimer = null;
    let _firstCellClickListener = null;

    /**
     * 读取存储的显示记录
     */
    function _loadShownMap() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch(e) {}
      return {};
    }

    /**
     * 保存显示记录
     */
    function _saveShownMap(map) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      } catch(e) {}
    }

    /**
     * 检查某关某幕是否已显示过
     */
    function _hasShown(levelId, act) {
      const map = _loadShownMap();
      return !!(map[levelId] && map[levelId][act]);
    }

    /**
     * 标记某关某幕为已显示
     */
    function _markShown(levelId, act) {
      const map = _loadShownMap();
      if (!map[levelId]) map[levelId] = {};
      map[levelId][act] = true;
      _saveShownMap(map);
    }

    // ============================================================
    // 启用条件判断
    // ============================================================

    /**
     * 判断三幕引导是否对当前关卡启用
     */
    function isEnabled(levelData) {
      if (!levelData) return false;

      // 有 lessonPlan 的关卡不显示三幕引导（优先使用 LessonPlayer）
      if (levelData.lessonPlan) return false;

      // 检查 features 显式开关
      if (levelData.features && levelData.features.threeActGuide === true) {
        return true;
      }

      // 新手关（101~109）且 difficultyLevel >= 2 时默认启用
      const levelId = parseInt(levelData.levelId) || 0;
      const difficultyLevel = levelData.difficultyLevel || 1;
      if (levelId >= 101 && levelId <= 109 && difficultyLevel >= 2) {
        return true;
      }

      return false;
    }

    // ============================================================
    // 格子获取
    // ============================================================

    function _getCellsByCategory(category) {
      if (!board || typeof WinConditionManager === 'undefined') return [];
      const isBoss = typeof isLastLevelOfChapter === 'function' ? isLastLevelOfChapter() : false;
      const heatmap = WinConditionManager.getPristineHeatmap(board, currentLevelData, isBoss);
      if (!heatmap || !heatmap.gridMeta) return [];

      const cells = [];
      const size = board.size;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const meta = heatmap.gridMeta[r]?.[c];
          if (meta && meta.category === category) {
            cells.push({ r, c });
          }
        }
      }
      return cells;
    }

    // ============================================================
    // 对话配置获取
    // ============================================================

    function _getDialog(key) {
      const custom = currentLevelData && currentLevelData.threeActDialog;
      if (custom && custom[key] && Array.isArray(custom[key]) && custom[key].length > 0) {
        return custom[key];
      }
      return DEFAULT_DIALOG[key] || [];
    }

    function _getAct3Line() {
      const custom = currentLevelData && currentLevelData.threeActDialog;
      if (custom && custom.act3) {
        if (Array.isArray(custom.act3) && custom.act3.length > 0) {
          return custom.act3[0].text || DEFAULT_DIALOG.act3;
        }
        if (typeof custom.act3 === 'string') return custom.act3;
        if (custom.act3.text) return custom.act3.text;
      }
      return DEFAULT_DIALOG.act3;
    }

    // ============================================================
    // 高亮工具
    // ============================================================

    function _highlightCells(cells, type, key) {
      if (!renderer || typeof renderer.highlightHintCells !== 'function') return;
      if (!cells || cells.length === 0) return;
      try {
        renderer.highlightHintCells(cells, type, key);
      } catch(e) {}
    }

    function _clearHighlight(key) {
      if (!renderer || typeof renderer.clearHintHighlights !== 'function') return;
      try {
        renderer.clearHintHighlights(key);
      } catch(e) {}
    }

    function _clearHighlightTimer() {
      if (_highlightTimer) {
        clearTimeout(_highlightTimer);
        _highlightTimer = null;
      }
    }

    /**
     * 设置首次点击格子时清除高亮
     * 绑定到 canvas 的 pointerdown 事件，检测是否点击了有效格子
     */
    function _setupFirstClickClear(key) {
      // 移除之前的监听器
      if (_firstCellClickListener) {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          canvas.removeEventListener('pointerdown', _firstCellClickListener);
        }
        _firstCellClickListener = null;
      }

      _firstCellClickListener = function() {
        // 只要玩家点击了棋盘区域就清除高亮
        _clearHighlight(key);
        _clearHighlightTimer();
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          canvas.removeEventListener('pointerdown', _firstCellClickListener);
        }
        _firstCellClickListener = null;
      };

      // 延迟一点再绑定，避免对话结束的点击误触发
      setTimeout(() => {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          canvas.addEventListener('pointerdown', _firstCellClickListener, { once: true });
        }
      }, 300);
    }

    // ============================================================
    // 第一幕·引子（钩子1）—— initBoard 之前，纯对话
    // ============================================================

    /**
     * 播放第一幕引子对话（棋盘还没初始化，只有对话）
     * @returns {Promise} 对话结束后 resolve
     */
    function playAct1Intro() {
      return new Promise((resolve) => {
        if (!currentLevelData) { resolve(); return; }

        // 初始化启用状态
        _enabled = isEnabled(currentLevelData);
        _act1Started = false;
        _act2Triggered = false;
        _act3Triggered = false;
        _lastSimpleCompleted = false;
        _lastGateCompleted = false;

        if (!_enabled) { resolve(); return; }
        if (!storyEngine) { resolve(); return; }

        const levelId = currentLevelData.levelId;
        if (_hasShown(levelId, ACTS.ACT1)) { resolve(); return; }

        _act1Started = true;

        // 设置场景键用于已读记录
        const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
        storyEngine.setSceneKey(chapterId + '_' + levelId + '_act1_intro');

        const dialog = _getDialog('act1Intro');
        log.info('[ThreeActGuide] 播放第一幕·引子 (%d 句)', dialog.length);

        // 对话期间锁定交互
        setInteractionLocked(true);
        storyEngine.sayLines(dialog, () => {
          setInteractionLocked(false);
          resolve();
        });
      });
    }

    // ============================================================
    // 第一幕·揭盘（钩子2）—— initBoard 之后，高亮 + 对话
    // ============================================================

    /**
     * 播放第一幕揭盘（棋盘渲染好后，高亮 simple 格 + 对话）
     * @returns {Promise} 对话结束后 resolve
     */
    function playAct1BoardReveal() {
      return new Promise((resolve) => {
        if (!_enabled || !_act1Started) { resolve(); return; }
        if (!storyEngine || !renderer) { resolve(); return; }
        if (!currentLevelData) { resolve(); return; }

        const levelId = currentLevelData.levelId;
        if (_hasShown(levelId, ACTS.ACT1)) { resolve(); return; }

        // 高亮所有 simple 格（绿色调）
        const simpleCells = _getCellsByCategory('simple');
        if (simpleCells.length > 0) {
          _highlightCells(simpleCells, 'hint', 'three_act_act1');
        }

        // 切换渲染器到第一幕模式（simple 绿）
        if (typeof renderer.setThreeActMode === 'function') {
          renderer.setThreeActMode('simple');
          renderer.render(board);
        }

        // 初始化幕次指示器
        if (typeof WinConditionManager !== 'undefined') {
          const stats = WinConditionManager.getProgress(board, currentLevelData, false).stats;
          _updateActIndicator(stats);
        }

        // 设置场景键
        const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
        storyEngine.setSceneKey(chapterId + '_' + levelId + '_act1_reveal');

        const dialog = _getDialog('act1Reveal');
        log.info('[ThreeActGuide] 播放第一幕·揭盘 (%d 句, %d simple 格)', dialog.length, simpleCells.length);

        setInteractionLocked(true);
        storyEngine.sayLines(dialog, () => {
          setInteractionLocked(false);

          // 标记第一幕已显示
          _markShown(levelId, ACTS.ACT1);

          // 2 秒后自动清除高亮，或玩家点击第一个格子时清除
          _clearHighlightTimer();
          _highlightTimer = setTimeout(() => {
            _clearHighlight('three_act_act1');
            _highlightTimer = null;
          }, 2000);

          _setupFirstClickClear('three_act_act1');

          resolve();
        });
      });
    }

    // ============================================================
    // 第二幕·破局（运行时触发）—— simple 填完后
    // ============================================================

    function _playAct2Breakthrough() {
      if (!_enabled) return;
      if (!storyEngine || !renderer) return;
      if (!currentLevelData) return;

      const levelId = currentLevelData.levelId;
      if (_hasShown(levelId, ACTS.ACT2)) return;
      if (_act2Triggered) return;

      _act2Triggered = true;
      _markShown(levelId, ACTS.ACT2);

      // 高亮所有 gate 格（红色调，用 error 类型）
      const gateCells = _getCellsByCategory('gate');
      if (gateCells.length > 0) {
        _highlightCells(gateCells, 'error', 'three_act_act2');
      }

      // 切换渲染器到第二幕模式（gate 红）
      if (typeof renderer.setThreeActMode === 'function') {
        renderer.setThreeActMode('gate');
        renderer.render(board);
      }

      // 播放破局专属音效
      try {
        if (typeof AudioService !== 'undefined' && AudioService.synth) {
          if (typeof AudioService.synth.playActBreakthrough === 'function') {
            AudioService.synth.playActBreakthrough();
          }
        }
      } catch(e) {
        console.debug('[ThreeActGuide] breakthrough sfx failed:', e);
      }

      // 设置场景键
      const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
      storyEngine.setSceneKey(chapterId + '_' + levelId + '_act2');

      const dialog = _getDialog('act2');
      log.info('[ThreeActGuide] 播放第二幕·破局 (%d 句, %d gate 格)', dialog.length, gateCells.length);

      setInteractionLocked(true);
      storyEngine.sayLines(dialog, () => {
        setInteractionLocked(false);

        // 3 秒后清除高亮，或玩家选中 gate 格时清除
        _clearHighlightTimer();
        _highlightTimer = setTimeout(() => {
          _clearHighlight('three_act_act2');
          _highlightTimer = null;
        }, 3000);

        _setupFirstClickClear('three_act_act2');
      });
    }

    // ============================================================
    // 第三幕·雪崩（运行时触发）—— gate 填完后
    // ============================================================

    function _playAct3Avalanche() {
      if (!_enabled) return;
      if (!currentLevelData) return;

      const levelId = currentLevelData.levelId;
      if (_hasShown(levelId, ACTS.ACT3)) return;
      if (_act3Triggered) return;

      _act3Triggered = true;
      _markShown(levelId, ACTS.ACT3);

      // 切换渲染器到第三幕模式（core 金）
      if (typeof renderer.setThreeActMode === 'function') {
        renderer.setThreeActMode('core');
        renderer.render(board);
      }

      const line = _getAct3Line();
      log.info('[ThreeActGuide] 第三幕·雪崩:', line);

      // 快速飘过气泡，不阻塞
      try {
        showCharacterBubble('ayan', {
          text: line,
          speakerName: '阿妍',
          type: 'eureka',
          duration: 2500,
        });
      } catch(e) {
        console.warn('[ThreeActGuide] showCharacterBubble failed:', e);
      }

      // 雪崩音效
      try {
        if (typeof AudioService !== 'undefined') {
          if (AudioService.synth && typeof AudioService.synth.playAvalancheStart === 'function') {
            AudioService.synth.playAvalancheStart();
          } else {
            AudioService.sfx.play('eureka');
          }
        }
      } catch(e) {}
    }

    // ============================================================
    // 填数检测（运行时）
    // ============================================================

    /**
     * 更新顶部幕次指示器（文本 + 进度条）
     */
    function _updateActIndicator(stats) {
      const indicator = document.getElementById('act-indicator');
      const textEl = document.getElementById('act-indicator-text');
      const fillEl = document.getElementById('act-indicator-fill');
      if (!indicator || !textEl || !fillEl) return;

      if (!_enabled || !stats) {
        indicator.style.display = 'none';
        return;
      }

      indicator.style.display = 'flex';

      // 判断当前幕次
      const simpleDone = stats.simple.total > 0 && stats.simple.filled >= stats.simple.total;
      const gateDone = stats.gate.total > 0 && stats.gate.filled >= stats.gate.total;

      let actName, actColor, current, total;

      if (!simpleDone && stats.simple.total > 0) {
        // 第一幕
        actName = '第一幕·速填';
        actColor = '#22c55e';
        current = stats.simple.filled;
        total = stats.simple.total;
      } else if (!gateDone && stats.gate.total > 0) {
        // 第二幕
        actName = '第二幕·破局';
        actColor = '#ef4444';
        current = stats.gate.filled;
        total = stats.gate.total;
      } else if (stats.core.total > 0) {
        // 第三幕
        actName = '第三幕·雪崩';
        actColor = '#fbbf24';
        current = stats.core.filled;
        total = stats.core.total;
      } else {
        indicator.style.display = 'none';
        return;
      }

      textEl.textContent = actName;
      textEl.style.color = actColor;
      fillEl.style.background = actColor;
      const progress = total > 0 ? (current / total) * 100 : 0;
      fillEl.style.width = progress + '%';
    }

    /**
     * 每次填数后检查阶段切换（在 checkCompletion 中调用）
     * 检测 simple 完成 → 第二幕·破局
     * 检测 gate 完成 → 第三幕·雪崩
     */
    function onFillCheck() {
      if (!_enabled) return;
      if (!board || !currentLevelData) return;
      if (typeof WinConditionManager === 'undefined') return;

      const stats = WinConditionManager.getProgress(board, currentLevelData, false).stats;
      if (!stats) return;

      // 更新幕次指示器
      _updateActIndicator(stats);

      // 检测 simple 完成状态切换 → 第二幕
      const simpleCompleted = stats.simple.total > 0 && stats.simple.filled >= stats.simple.total;
      if (simpleCompleted && !_lastSimpleCompleted) {
        _playAct2Breakthrough();
      }
      _lastSimpleCompleted = simpleCompleted;

      // 检测 gate 完成状态切换 → 第三幕
      const gateCompleted = stats.gate.total > 0 && stats.gate.filled >= stats.gate.total;
      if (gateCompleted && !_lastGateCompleted) {
        _playAct3Avalanche();
      }
      _lastGateCompleted = gateCompleted;
    }

    // ============================================================
    // 兼容 API：旧的 onLevelStart（保留用于兼容，不再做实际工作）
    // ============================================================

    function onLevelStart() {
      // v2 系统使用两阶段钩子（playAct1Intro + playAct1BoardReveal）
      // 此函数保留用于向后兼容，实际引导在 startLevel 的钩子中触发
      if (!currentLevelData) return;
      _enabled = isEnabled(currentLevelData);
      _act1Started = false;
      _act2Triggered = false;
      _act3Triggered = false;
      _lastSimpleCompleted = false;
      _lastGateCompleted = false;

      // 初始化幕次指示器
      if (_enabled && board && typeof WinConditionManager !== 'undefined') {
        try {
          const stats = WinConditionManager.getProgress(board, currentLevelData, false).stats;
          _updateActIndicator(stats);
        } catch (e) {
          // 忽略初始化错误
        }
      } else {
        // 未启用三幕引导，隐藏指示器
        const indicator = document.getElementById('act-indicator');
        if (indicator) indicator.style.display = 'none';
      }
    }

    // ============================================================
    // 清理
    // ============================================================

    function cleanup() {
      _clearHighlightTimer();
      _clearHighlight('three_act_act1');
      _clearHighlight('three_act_act2');

      if (_firstCellClickListener) {
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
          canvas.removeEventListener('pointerdown', _firstCellClickListener);
        }
        _firstCellClickListener = null;
      }

      _enabled = false;
      _act1Started = false;
      _act2Triggered = false;
      _act3Triggered = false;
      _lastSimpleCompleted = false;
      _lastGateCompleted = false;
    }

    // ============================================================
    // 公开 API
    // ============================================================

    return {
      ACTS,
      isEnabled,
      playAct1Intro,
      playAct1BoardReveal,
      onLevelStart,
      onFillCheck,
      cleanup,
    };

  })();

  // === Win Condition Manager (分层过关系统) ===

  /**
   * WinConditionManager - 分层过关逻辑管理器
   *
   * 关卡类型与通关条件：
   *   - 新手关 (novice):   填完所有 simple 格
   *   - 中盘关 (midgame):  填完所有 simple + 至少 1 个 gate
   *   - 收官关 (endgame):  填完所有 simple + 所有 gate
   *   - Boss 关 (boss):    填完所有空格 (100%) —— 由 Boss 战系统接管
   *
   * 通关后表现：
   *   - 新手关/中盘关：剩余 core/gate 自动补全
   *   - 收官关：剩余 core 自动补全，播放"雪崩"动画
   *   - Boss 关：完整胜利动画（现有逻辑）
   */
  const WinConditionManager = (function() {

    // 关卡类型枚举
    const LEVEL_TYPES = {
      NOVICE: 'novice',     // 新手关
      MIDGAME: 'midgame',   // 中盘关
      ENDGAME: 'endgame',   // 收官关
      BOSS: 'boss',         // Boss 关
    };

    // pristine heatmap 缓存（每关只生成一次）
    let _pristineCache = {
      levelId: null,
      heatmap: null,
    };

    /**
     * 判断关卡类型
     * @param {Object} levelData - 当前关卡数据
     * @param {boolean} isBossLevel - 是否为 Boss 关（章节最后一关）
     * @returns {string} 关卡类型 LEVEL_TYPES.*
     */
    function getLevelType(levelData, isBossLevel) {
      if (!levelData) return LEVEL_TYPES.MIDGAME;

      // 优先使用关卡数据中自定义的 winCondition 类型
      if (levelData.winCondition && levelData.winCondition.type) {
        const customType = levelData.winCondition.type;
        if (Object.values(LEVEL_TYPES).includes(customType)) {
          return customType;
        }
      }

      // Boss 关（每章最后一关）
      if (isBossLevel) {
        return LEVEL_TYPES.BOSS;
      }

      const levelId = parseInt(levelData.levelId) || 0;
      const gridSize = levelData.gridSize || 9;
      const difficultyLevel = levelData.difficultyLevel || _inferDifficultyLevel(levelData);

      // 新手关：gridSize=4 或 levelId 101~109 或 difficultyLevel<=1
      if (gridSize <= 4 ||
          (levelId >= 101 && levelId <= 109) ||
          difficultyLevel <= 1) {
        return LEVEL_TYPES.NOVICE;
      }

      // 收官关：levelId 501~706 或 difficultyLevel 4-5
      if ((levelId >= 501 && levelId <= 706) ||
          difficultyLevel >= 4) {
        return LEVEL_TYPES.ENDGAME;
      }

      // 中盘关：levelId 204~406 或 difficultyLevel 2-3（默认）
      return LEVEL_TYPES.MIDGAME;
    }

    /**
     * 从关卡数据推断难度等级 (1~5)
     * 没有 difficultyLevel 字段时，根据 difficulty 字符串推断
     */
    function _inferDifficultyLevel(levelData) {
      const diffStr = levelData.difficulty || '';
      const diffMap = {
        '入门': 1,
        '简单': 1,
        '初级': 2,
        '中等': 3,
        '中等偏难': 4,
        '困难': 5,
        '极难': 5,
        '终极': 5,
      };
      return diffMap[diffStr] || 3; // 默认中等
    }

    /**
     * 从 board 和 solution 获取玩家已正确填入的格子信息
     * @param {Object} board - Board 实例
     * @param {Array} solution - 正确答案二维数组
     * @returns {Object} { filledCorrect: Set<"r,c">, filledWrong: Set<"r,c"> }
     */
    function _getFilledCells(board, solution) {
      const filledCorrect = new Set();
      const filledWrong = new Set();
      const size = board.size;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board.cells[r][c];
          const val = cell.fillNum; // 只算玩家填的，不算 fixedNum
          if (val > 0) {
            if (solution && solution[r] && solution[r][c] === val) {
              filledCorrect.add(`${r},${c}`);
            } else {
              filledWrong.add(`${r},${c}`);
            }
          }
        }
      }

      return { filledCorrect, filledWrong };
    }

    /**
     * 获取初始（原始）热力图（基于只有固定数字，无玩家填入）
     * 用于获取关卡初始状态下各格子的分类（simple/gate/core）
     * 带缓存：同一关卡只生成一次
     * 
     * 优先级：levelData.threeAct（生成器原生三幕） > TechRaterAdapter（运行时分类）
     * 
     * @param {Object} board - 当前 Board 实例
     * @param {Object} levelData - 关卡数据
     * @param {boolean} [isBossLevel=false] - 是否 Boss 关
     * @returns {Object|null} PristineHeatmapResult
     */
    function getPristineHeatmap(board, levelData, isBossLevel) {
      if (!board || !levelData) {
        return null;
      }

      const levelId = levelData.levelId;

      // 缓存命中
      if (_pristineCache.levelId === levelId && _pristineCache.heatmap) {
        return _pristineCache.heatmap;
      }

      try {
        const size = board.size;
        const levelType = getLevelType(levelData, isBossLevel);

        // ===== 优先路径：关卡有 threeAct 原生元数据 =====
        if (levelData.threeAct && _isValidThreeAct(levelData.threeAct)) {
          const heatmap = _buildHeatmapFromThreeAct(
            levelData.threeAct, size, levelType,
            levelData.boardData  // 传入初始盘面，标记预填格为 filled
          );
          if (heatmap) {
            _pristineCache.levelId = levelId;
            _pristineCache.heatmap = heatmap;
            return heatmap;
          }
        }

        // ===== 回退路径：用 TechRaterAdapter 分类 =====
        if (typeof TechRaterAdapter === 'undefined') {
          return null;
        }

        // 从 levelData.boardData 创建一个只有固定数字的"干净"board
        const BoardClass = board.constructor;
        const pristineBoard = new BoardClass(size);
        pristineBoard.loadLevel({
          cells: levelData.boardData,
          cages: levelData.cages || [],
        });

        const adapter = new TechRaterAdapter(pristineBoard);
        const heatmap = adapter.generateHeatmap(levelType);

        // 存入缓存
        _pristineCache.levelId = levelId;
        _pristineCache.heatmap = heatmap;

        return heatmap;
      } catch (e) {
        log.error('[WinConditionManager] getPristineHeatmap error:', e);
        return null;
      }
    }

    /**
     * 校验 threeAct 数据是否有效
     */
    function _isValidThreeAct(threeAct) {
      if (!threeAct) return false;
      const { opening, breakthrough, avalanche } = threeAct;
      if (!Array.isArray(opening) || opening.length === 0) return false;
      if (!Array.isArray(breakthrough)) return false;
      if (!Array.isArray(avalanche)) return false;
      // 至少有 opening 格
      return opening.length > 0;
    }

    /**
     * 从 threeAct 元数据构建 heatmap（生成器原生三幕优先）
     * threeAct 映射：opening → simple, breakthrough → gate, avalanche → core
     * @param {Object} threeAct - 三幕元数据
     * @param {number} size - 盘面大小
     * @param {string} levelType - 关卡类型
     * @param {number[][]} [boardData] - 初始盘面数据，用于标记预填格
     */
    function _buildHeatmapFromThreeAct(threeAct, size, levelType, boardData) {
      const { opening, breakthrough, avalanche } = threeAct;

      // boardData 防御性浅拷贝（防止外部引用修改导致热力图数据不同步）
      const board = boardData ? boardData.map(row => row.slice()) : null;

      // 构建分类映射表
      const categoryMap = {}; // key: "r,c" → { category, orderIndex }
      // 全局递增索引（跨三幕连续计数，用于整体顺序判断）
      let globalOrder = 0;

      // opening → simple（全局顺序 0 ~ N-1）
      opening.forEach((cell) => {
        categoryMap[cell[0] + ',' + cell[1]] = { category: 'simple', orderIndex: globalOrder++ };
      });

      // breakthrough → gate（接在 simple 后面）
      breakthrough.forEach((cell) => {
        categoryMap[cell[0] + ',' + cell[1]] = { category: 'gate', orderIndex: globalOrder++ };
      });

      // avalanche → core（接在 gate 后面）
      avalanche.forEach((cell) => {
        categoryMap[cell[0] + ',' + cell[1]] = { category: 'core', orderIndex: globalOrder++ };
      });

      // 构建 gridMeta
      const gridMeta = new Array(size);
      const COLORS = {
        simple: '#4CAF50',
        gate: '#FF9800',
        core: '#9E9E9E',
        filled: '#2196F3',
      };

      // 统计各类别数量（只统计空格，即非预填格）
      const stats = {
        simple: { total: 0, filled: 0, ratio: 0 },
        gate: { total: 0, filled: 0, ratio: 0 },
        core: { total: 0, filled: 0, ratio: 0 },
        total: { total: 0, filled: 0, ratio: 0 },
      };

      for (let r = 0; r < size; r++) {
        gridMeta[r] = new Array(size);
        for (let c = 0; c < size; c++) {
          const key = r + ',' + c;
          const info = categoryMap[key];

          // 检查是否是预填格
          const isPreFilled = board && board[r] && board[r][c] !== 0;

          let category;
          if (isPreFilled) {
            category = 'filled';
          } else {
            category = info ? info.category : 'core';
          }

          gridMeta[r][c] = {
            category: category,
            color: COLORS[category] || COLORS.core,
            depth: info ? info.orderIndex : 999,
            difficultyScore: info ? info.orderIndex * 10 : 9999,
            fromThreeAct: true,
          };

          // 统计非预填格（即玩家需要填的空格）
          if (!isPreFilled && category !== 'filled') {
            stats.total.total++;
            if (stats[category]) {
              stats[category].total++;
            }
          }
        }
      }

      // 构建 rhythmTimeline（从 threeAct 顺序直接映射，排除预填格）
      // 格式与 TechRaterAdapter 的 _buildTimeline 保持一致
      const openingKeys = opening
        .filter(([r, c]) => !board || !board[r] || board[r][c] === 0)
        .map(([r, c]) => r + ',' + c);
      const gateKeys = breakthrough
        .filter(([r, c]) => !board || !board[r] || board[r][c] === 0)
        .map(([r, c]) => r + ',' + c);
      const dominoKeys = avalanche
        .filter(([r, c]) => !board || !board[r] || board[r][c] === 0)
        .map(([r, c]) => r + ',' + c);

      const rhythmTimeline = {
        totalSteps: openingKeys.length + gateKeys.length + dominoKeys.length,
        phases: {
          opening: {
            cellKeys: openingKeys,
            count: openingKeys.length,
          },
          breakthrough: {
            gateCells: gateKeys,
            count: gateKeys.length,
          },
          avalanche: {
            dominoSequence: dominoKeys,
            count: dominoKeys.length,
          },
        },
      };

      return {
        status: 'valid',
        gridMeta: gridMeta,
        stats: stats,
        rhythmTimeline: rhythmTimeline,
        levelType: levelType,
        fromThreeAct: true,
      };
    }

    /**
     * 清除 pristine 缓存（关卡切换时调用）
     */
    function clearPristineCache() {
      _pristineCache.levelId = null;
      _pristineCache.heatmap = null;
    }

    /**
     * 统计各类格子的总数和已正确填入数
     * 使用原始（初始状态）heatmap 进行分类，用当前 board 统计填入数
     * @param {Object} board - 当前 Board 实例
     * @param {Object} pristineHeatmap - 初始状态的 HeatmapResult（分类基准）
     * @param {Array} solution - 正确答案
     * @returns {Object} 各类别统计 { simple:{total,filled}, gate:{...}, core:{...}, total:{...} }
     */
    function _countByCategory(board, pristineHeatmap, solution) {
      const stats = {
        simple: { total: 0, filled: 0 },
        gate: { total: 0, filled: 0 },
        core: { total: 0, filled: 0 },
        total: { total: 0, filled: 0 },
      };

      if (!pristineHeatmap || !pristineHeatmap.gridMeta) return stats;

      const size = board.size;
      const gridMeta = pristineHeatmap.gridMeta;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const meta = gridMeta[r]?.[c];
          if (!meta) continue;

          const category = meta.category;
          // 只统计非 filled 类（即玩家需要填的空格）
          // 注意：这里用的是 pristine heatmap，初始状态的空格分类
          if (category === 'filled' || category === 'unknown') continue;

          stats.total.total++;

          if (stats[category]) {
            stats[category].total++;
          }

          // 检查玩家是否已正确填入该格（用当前 board）
          const cell = board.cells[r]?.[c];
          if (!cell) continue;
          const val = cell.fillNum; // 只算玩家填入的，不算 fixedNum 已在 pristine 中被排除
          if (val > 0 && solution && solution[r] && solution[r][c] === val) {
            stats.total.filled++;
            if (stats[category]) {
              stats[category].filled++;
            }
          }
        }
      }

      return stats;
    }

    /**
     * 检查是否满足通关条件
     * 使用初始（pristine）heatmap 进行分类判断
     * @param {Object} board - Board 实例
     * @param {Object} levelData - 关卡数据
     * @param {boolean} isBossLevel - 是否 Boss 关
     * @returns {boolean} 是否通关
     */
    function checkWinCondition(board, levelData, isBossLevel) {
      if (!board || !levelData) return false;

      const levelType = getLevelType(levelData, isBossLevel);
      const solution = levelData.solution;

      // Boss 关：100% 填满且正确（由 Boss 战系统接管，这里返回 false 让原逻辑处理）
      if (levelType === LEVEL_TYPES.BOSS) {
        return false;
      }

      // 获取初始热力图（用于分类基准）
      const pristineHeatmap = getPristineHeatmap(board, levelData, isBossLevel);
      if (!pristineHeatmap) return false;

      const stats = _countByCategory(board, pristineHeatmap, solution);

      // 有错误填入时不能算通关
      const { filledWrong } = _getFilledCells(board, solution);
      if (filledWrong.size > 0) return false;

      // ===== 通关阈值配置（百分比 + 绝对最小数 双保险） =====
      // 防止"填1个就过关"：即使百分比到了，也要满足最小填数
      // 按规格书 v3.0 精确值
      const THRESHOLDS = {
        novice: {
          simpleRatio: 0.50,   // simple 格填 50% 即达标
          minFill: 3,          // 至少填 3 个 simple 格
        },
        midgame: {
          simpleRatio: 0.40,   // simple 格填 40%
          minSimpleFill: 4,    // 至少填 4 个 simple
          gateRequired: 1,     // 至少 1 个 gate
        },
        endgame: {
          totalRatio: 0.30,    // (simple+gate) 填 30%
          minTotalFill: 5,     // 至少填 5 个
          gateRequired: 'all', // 所有 gate 必须填完
        },
      };

      switch (levelType) {
        case LEVEL_TYPES.NOVICE: {
          // 新手关：simple 格填 60% 且至少 3 个
          if (stats.simple.total === 0) return false;
          const ratio = stats.simple.filled / stats.simple.total;
          return ratio >= THRESHOLDS.novice.simpleRatio &&
                 stats.simple.filled >= THRESHOLDS.novice.minFill;
        }

        case LEVEL_TYPES.MIDGAME: {
          // 中盘关：simple 填 50% 且至少 5 个 + 至少 1 个 gate
          if (stats.simple.total === 0) return false;
          const simpleRatio = stats.simple.filled / stats.simple.total;
          if (simpleRatio < THRESHOLDS.midgame.simpleRatio) return false;
          if (stats.simple.filled < THRESHOLDS.midgame.minSimpleFill) return false;
          // 如果没有 gate 格，只看 simple
          if (stats.gate.total === 0) {
            return true;
          }
          return stats.gate.filled >= THRESHOLDS.midgame.gateRequired;
        }

        case LEVEL_TYPES.ENDGAME: {
          // 收官关：simple+gate 填 40% 且至少 8 个 + 所有 gate 填完
          const totalTarget = stats.simple.total + stats.gate.total;
          if (totalTarget === 0) return false;
          const totalFilled = stats.simple.filled + stats.gate.filled;
          const totalRatio = totalFilled / totalTarget;
          if (totalRatio < THRESHOLDS.endgame.totalRatio) return false;
          if (totalFilled < THRESHOLDS.endgame.minTotalFill) return false;
          // 所有 gate 必须填完
          if (stats.gate.total > 0 && stats.gate.filled < stats.gate.total) {
            return false;
          }
          return true;
        }

        default:
          return false;
      }
    }

    /**
     * 获取当前进度
     * 使用初始（pristine）heatmap 进行分类判断
     * @param {Object} board - Board 实例
     * @param {Object} levelData - 关卡数据
     * @param {boolean} isBossLevel - 是否 Boss 关
     * @returns {Object} { current, total, percent, type, description }
     */
    function getProgress(board, levelData, isBossLevel) {
      if (!board || !levelData) {
        return { current: 0, total: 0, percent: 0, type: 'unknown', description: '' };
      }

      const levelType = getLevelType(levelData, isBossLevel);
      const solution = levelData.solution;

      // 获取初始热力图（用于分类基准）
      const pristineHeatmap = getPristineHeatmap(board, levelData, isBossLevel);
      if (!pristineHeatmap) {
        return { current: 0, total: 0, percent: 0, type: levelType, description: '' };
      }

      const stats = _countByCategory(board, pristineHeatmap, solution);

      let current = 0;
      let total = 0;
      let description = '';

      // ===== 进度目标按新阈值计算（不是 total，而是 threshold target） =====
      // 与 checkWinCondition 的阈值保持一致
      const THRESHOLDS = {
        novice: { simpleRatio: 0.50, minFill: 3 },
        midgame: { simpleRatio: 0.40, minSimpleFill: 4, gateRequired: 1 },
        endgame: { totalRatio: 0.30, minTotalFill: 5, gateRequired: 'all' },
      };

      switch (levelType) {
        case LEVEL_TYPES.NOVICE: {
          // 目标：max(simple总数*60%, 最少3个)
          const target = Math.max(
            Math.ceil(stats.simple.total * THRESHOLDS.novice.simpleRatio),
            THRESHOLDS.novice.minFill
          );
          current = Math.min(stats.simple.filled, target);
          total = target;
          description = `心流速填 ${stats.simple.filled}/${stats.simple.total}（目标 ${target}）`;
          break;
        }

        case LEVEL_TYPES.MIDGAME: {
          const simpleTarget = Math.max(
            Math.ceil(stats.simple.total * THRESHOLDS.midgame.simpleRatio),
            THRESHOLDS.midgame.minSimpleFill
          );
          const gateTarget = stats.gate.total > 0 ? THRESHOLDS.midgame.gateRequired : 0;
          current = Math.min(stats.simple.filled, simpleTarget) +
                    Math.min(stats.gate.filled, gateTarget);
          total = simpleTarget + gateTarget;
          description = `开局 ${stats.simple.filled}/${stats.simple.total}，破局 ${stats.gate.filled}/${stats.gate.total}`;
          break;
        }

        case LEVEL_TYPES.ENDGAME: {
          const totalTargetRaw = stats.simple.total + stats.gate.total;
          const totalTarget = Math.max(
            Math.ceil(totalTargetRaw * THRESHOLDS.endgame.totalRatio),
            THRESHOLDS.endgame.minTotalFill
          );
          // endgame 还要求所有 gate 填完
          const gateFilledOk = stats.gate.total === 0 || stats.gate.filled >= stats.gate.total;
          current = Math.min(stats.simple.filled + stats.gate.filled, totalTarget);
          total = totalTarget;
          description = `收官 ${stats.simple.filled + stats.gate.filled}/${totalTargetRaw}（破局 ${stats.gate.filled}/${stats.gate.total}）`;
          break;
        }

        case LEVEL_TYPES.BOSS:
          current = stats.total.filled;
          total = stats.total.total;
          description = `Boss战 ${current}/${total}`;
          break;
      }

      const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

      return { current, total, percent, type: levelType, description, stats };
    }

    /**
     * 获取通关后需要自动补全的格子列表
     * 返回按求解顺序排列的格子，用于动画播放
     * 使用初始（pristine）heatmap 进行分类和排序
     * @param {Object} board - Board 实例
     * @param {Object} levelData - 关卡数据
     * @param {boolean} isBossLevel - 是否 Boss 关
     * @returns {Array<{r: number, c: number, value: number, category: string}>}
     */
    function getAutoFillCells(board, levelData, isBossLevel) {
      if (!board || !levelData || !levelData.solution) return [];

      const levelType = getLevelType(levelData, isBossLevel);
      const solution = levelData.solution;
      const size = board.size;

      // Boss 关不自动补全
      if (levelType === LEVEL_TYPES.BOSS) return [];

      // 获取初始热力图（用于分类和雪崩顺序）
      const pristineHeatmap = getPristineHeatmap(board, levelData, isBossLevel);
      if (!pristineHeatmap) return [];

      const autoFillCells = [];
      const timeline = pristineHeatmap?.rhythmTimeline;

      // ============================================================
      // 构建完整的求解顺序索引（从 rhythmTimeline 的三个阶段合并）
      // 顺序：opening.simpleCells → breakthrough.gateCells → avalanche.dominoSequence
      // 这确保了补全顺序严格遵循求解链的时间顺序
      // ============================================================
      const solveOrder = new Map(); // key → 全局顺序索引
      let orderIdx = 0;

      // 1. 开局阶段（simple 格）的求解顺序
      const openingKeys = timeline?.phases?.opening?.cellKeys || [];
      for (const key of openingKeys) {
        if (!solveOrder.has(key)) {
          solveOrder.set(key, orderIdx++);
        }
      }

      // 2. 破局阶段（gate 格）的求解顺序
      const gateKeys = timeline?.phases?.breakthrough?.gateCells || [];
      for (const key of gateKeys) {
        if (!solveOrder.has(key)) {
          solveOrder.set(key, orderIdx++);
        }
      }

      // 3. 雪崩阶段（core 格）的求解顺序（核心：dominoSequence）
      const dominoKeys = timeline?.phases?.avalanche?.dominoSequence || [];
      for (const key of dominoKeys) {
        if (!solveOrder.has(key)) {
          solveOrder.set(key, orderIdx++);
        }
      }

      // 收集需要自动补全的格子
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = board.cells[r][c];
          // 跳过已填格（包括固定数字和玩家填入）
          if (cell.fixedNum > 0 || cell.fillNum > 0) continue;

          const meta = pristineHeatmap?.gridMeta?.[r]?.[c];
          const category = meta?.category || 'core';

          // 根据关卡类型决定哪些格自动补全
          let shouldFill = false;

          switch (levelType) {
            case LEVEL_TYPES.NOVICE:
              // 新手关：所有 core 和 gate 都自动补全
              shouldFill = (category === 'core' || category === 'gate');
              break;

            case LEVEL_TYPES.MIDGAME:
              // 中盘关：所有 core 和未填的 gate 都自动补全
              shouldFill = (category === 'core' || category === 'gate');
              break;

            case LEVEL_TYPES.ENDGAME:
              // 收官关：只有 core 自动补全（gate 需要玩家全部填完）
              shouldFill = (category === 'core');
              break;
          }

          if (shouldFill) {
            const key = `${r},${c}`;
            autoFillCells.push({
              r,
              c,
              value: solution[r][c],
              category,
              order: solveOrder.has(key) ? solveOrder.get(key) : 9999,
            });
          }
        }
      }

      // 按求解顺序排序（雪崩效果），没有顺序信息的按坐标排序
      autoFillCells.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        if (a.r !== b.r) return a.r - b.r;
        return a.c - b.c;
      });

      return autoFillCells;
    }

    /**
     * 从当前 board 生成 heatmap
     * @param {Object} board - Board 实例
     * @returns {Object|null} HeatmapResult
     */
    function generateHeatmapFromBoard(board) {
      if (!board || typeof TechRaterAdapter === 'undefined') {
        return null;
      }
      try {
        const adapter = new TechRaterAdapter(board);
        return adapter.generateHeatmap();
      } catch (e) {
        log.error('[WinConditionManager] generateHeatmap error:', e);
        return null;
      }
    }

    /**
     * 直接设置 pristine heatmap 缓存（用于预加载）
     * 在关卡初始化时提前生成并缓存，避免首次调用时的延迟
     * @param {number} levelId - 关卡ID
     * @param {Object} heatmap - HeatmapResult 对象
     */
    function setPristineCache(levelId, heatmap) {
      if (!levelId || !heatmap) return;
      _pristineCache.levelId = parseInt(levelId);
      _pristineCache.heatmap = heatmap;
    }

    // 公开 API
    return {
      LEVEL_TYPES,
      getLevelType,
      checkWinCondition,
      getProgress,
      getAutoFillCells,
      getPristineHeatmap,
      setPristineCache,
      clearPristineCache,
      generateHeatmapFromBoard,
    };

  })();

  // === Completion Check ===

  /**
   * 独立规则校验：不依赖 solution 数组，验证数独所有规则
   * 包括：每行/列/宫 1-size 不重复，每个笼子和值正确，没有空格子
   * @returns {Object} { valid: boolean, filled: boolean, errors: [{r, c, type}] }
   */
  function validateBoard() {
    if (!board) return { valid: false, filled: false, errors: [] };

    const size = board.size;
    const errors = [];
    let filled = true;

    // 检查是否所有格子都填了
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        const val = cell.fixedNum || cell.fillNum;
        if (!val) {
          filled = false;
        }
      }
    }

    // 行校验：每行 1-size 不重复
    for (let r = 0; r < size; r++) {
      const seen = new Set();
      for (let c = 0; c < size; c++) {
        const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
        if (!val) continue;
        if (seen.has(val)) {
          // 找到冲突的两个格子
          for (let cc = 0; cc < c; cc++) {
            const pv = board.cells[r][cc].fixedNum || board.cells[r][cc].fillNum;
            if (pv === val) {
              errors.push({ r, c, type: 'row' });
              errors.push({ r, c: cc, type: 'row' });
              break;
            }
          }
        } else {
          seen.add(val);
        }
      }
    }

    // 列校验：每列 1-size 不重复
    for (let c = 0; c < size; c++) {
      const seen = new Set();
      for (let r = 0; r < size; r++) {
        const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
        if (!val) continue;
        if (seen.has(val)) {
          for (let rr = 0; rr < r; rr++) {
            const pv = board.cells[rr][c].fixedNum || board.cells[rr][c].fillNum;
            if (pv === val) {
              errors.push({ r, c, type: 'col' });
              errors.push({ r: rr, c, type: 'col' });
              break;
            }
          }
        } else {
          seen.add(val);
        }
      }
    }

    // 宫校验：每宫 1-size 不重复
    const { boxW, boxH } = board.getBoxSize ? board.getBoxSize() : { boxW: 3, boxH: 3 };
    const boxRows = Math.ceil(size / boxH);
    const boxCols = Math.ceil(size / boxW);
    for (let boxR = 0; boxR < boxRows; boxR++) {
      for (let boxC = 0; boxC < boxCols; boxC++) {
        const seen = new Map();
        for (let r = boxR * boxH; r < boxR * boxH + boxH && r < size; r++) {
          for (let c = boxC * boxW; c < boxC * boxW + boxW && c < size; c++) {
            const val = board.cells[r][c].fixedNum || board.cells[r][c].fillNum;
            if (!val) continue;
            if (seen.has(val)) {
              const prev = seen.get(val);
              errors.push({ r, c, type: 'box' });
              errors.push({ r: prev.r, c: prev.c, type: 'box' });
            } else {
              seen.set(val, { r, c });
            }
          }
        }
      }
    }

    // 笼和校验：每个笼子和值正确（仅当所有格子都填了时才校验）
    if (board.cages && board.cages.length > 0) {
      for (const cage of board.cages) {
        if (!cage.cells || cage.hiddenSum || typeof cage.sum !== 'number') continue;
        let sum = 0;
        let allFilled = true;
        const seen = new Set();
        let hasDup = false;
        for (const [r, c] of cage.cells) {
          const val = board.cells[r]?.[c]?.fixedNum || board.cells[r]?.[c]?.fillNum;
          if (!val) {
            allFilled = false;
            break;
          }
          sum += val;
          if (seen.has(val)) {
            hasDup = true;
          }
          seen.add(val);
        }
        if (!allFilled) continue;
        // 笼内数字重复
        if (hasDup) {
          for (const [r, c] of cage.cells) {
            errors.push({ r, c, type: 'cage_dup' });
          }
        }
        // 笼和错误
        if (sum !== cage.sum) {
          for (const [r, c] of cage.cells) {
            errors.push({ r, c, type: 'cage_sum' });
          }
        }
      }
    }

    // 去重错误格子
    const uniqueErrors = [];
    const seenErrors = new Set();
    for (const err of errors) {
      const key = `${err.r},${err.c}`;
      if (!seenErrors.has(key)) {
        seenErrors.add(key);
        uniqueErrors.push(err);
      }
    }

    const valid = filled && uniqueErrors.length === 0;
    return { valid, filled, errors: uniqueErrors };
  }

  /**
   * 判断棋盘是否完成：以规则校验为主，答案比对为辅
   */
  function isBoardComplete() {
    if (!board || !currentLevelData) return false;

    // 主校验：独立规则校验
    const result = validateBoard();
    if (!result.valid) return false;

    // 辅助校验：与 solution 比对（双重保险）
    const solution = currentLevelData.solution;
    if (solution) {
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          const filled = cell.fixedNum || cell.fillNum;
          if (filled !== solution[r][c]) return false;
        }
      }
    }

    return true;
  }

  /**
   * 高亮所有错误格子（当棋盘填满但有错误时）
   */
  function highlightAllErrors() {
    if (!board) return;
    const result = validateBoard();
    if (!result.filled) return false;

    // 标记所有错误格子
    for (const err of result.errors) {
      const cell = board.cells[err.r]?.[err.c];
      if (cell) {
        cell.isError = true;
      }
    }

    if (renderer) {
      renderer.render(board);
    }

    return result.errors.length > 0;
  }

  function checkCompletion() {
    // Boss战中，由Boss战系统控制胜负，不自动通关
    if (typeof GuideBattle !== 'undefined' && (GuideBattle.active || GuideBattle.ended)) {
      return;
    }
    // 已经通关的不重复触发
    if (isCompleted) return;

    try {
      const isBossLvl = isLastLevelOfChapter();

      // === 1. 检查是否100%完成（Boss关必须100%，非Boss关也可能玩家手动填完） ===
      if (isBoardComplete()) {
        _triggerLevelComplete();
        return;
      }

      // === 2. 非Boss关：检查分层过关条件 ===
      if (!isBossLvl && currentLevelData && board) {
        // 三幕式引导：检测阶段切换（simple→gate→avalanche）
        if (typeof ThreeActGuide !== 'undefined') {
          try { ThreeActGuide.onFillCheck(); } catch(e) {}
        }

        // 检查是否满足分层通关条件（内部使用 pristine heatmap）
        const won = WinConditionManager.checkWinCondition(
          board, currentLevelData, isBossLvl
        );

        if (won) {
          // 满足通关条件：先自动补全，再触发通关
          const autoFillCells = WinConditionManager.getAutoFillCells(
            board, currentLevelData, isBossLvl
          );

          const levelType = WinConditionManager.getLevelType(currentLevelData, isBossLvl);
          log.info('[WinCondition] 分层通关触发:', levelType, '自动补全', autoFillCells.length, '格');

          _playAutoFillAnimation(autoFillCells, levelType, () => {
            _triggerLevelComplete();
          });
          return;
        }
      }

      // === 3. 未通关：检查是否填满但有错误（原逻辑） ===
      _checkFilledWithErrors();

    } catch(e) {
      log.error('checkCompletion error:', e);
    }
  }

  /**
   * 检查棋盘是否填满但有错误（原 checkCompletion 中的错误检测逻辑）
   */
  function _checkFilledWithErrors() {
    const result = validateBoard();
    if (result.filled && result.errors.length > 0) {
      try { highlightAllErrors(); } catch(e) {}
      showToast('还有地方不对哦~');
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    }
  }

  /**
   * 播放自动补全动画（逐格填入，带雪崩加速效果）
   * @param {Array} autoFillCells - 需要自动补全的格子列表 [{r, c, value, category, order}]
   * @param {string} levelType - 关卡类型（决定动画速度和加速曲线）
   * @param {Function} onComplete - 完成回调
   *
   * 动画速度设计：
   *   - 新手关 (novice)：较慢，让玩家看清楚，轻度加速
   *   - 中盘关 (midgame)：中等速度，中度加速
   *   - 收官关 (endgame)：雪崩效果，明显加速（越往后越快）
   *
   * 加速曲线：使用 ease-in 曲线，后段速度提升更明显
   *   delay(progress) = baseDelay * (1 - acceleration * progress^2)
   *   最终速度 = baseDelay * (1 - acceleration)
   */
  function _playAutoFillAnimation(autoFillCells, levelType, onComplete) {
    if (!autoFillCells || autoFillCells.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    isCompleted = true; // 标记为已通关，防止重复触发
    // 暂停计时器（通关时刻开始算）
    if (gameTimer) try { gameTimer.pause(); } catch(e) {}

    const total = autoFillCells.length;

    // ============================================================
    // 速度配置（根据关卡类型）
    // ============================================================
    let baseDelay;      // 初始延迟（ms）
    let minDelay;       // 最小延迟（ms）— 防止太快看不清
    let acceleration;   // 加速度系数（0~1，越大加速越猛）

    switch (levelType) {
      case 'novice':
        // 新手关：慢节奏，轻度加速（让玩家理解发生了什么）
        baseDelay = 80;
        minDelay = 40;
        acceleration = 0.4;  // 最快到 60% 速度
        break;

      case 'midgame':
        // 中盘关：中等节奏，中度加速
        baseDelay = 65;
        minDelay = 25;
        acceleration = 0.55; // 最快到 45% 速度
        break;

      case 'endgame':
      default:
        // 收官关（雪崩）：快节奏，强力加速（越往后越快的爽感）
        baseDelay = 50;
        minDelay = 12;
        acceleration = 0.75; // 最快到 25% 速度
        break;
    }

    // 格子很多时整体提速（避免动画太长）
    if (total > 50) {
      const scaleFactor = Math.max(0.5, 1 - (total - 50) * 0.01);
      baseDelay = Math.max(minDelay, baseDelay * scaleFactor);
    }

    let index = 0;

    // 雪崩开始音效（仅 endgame 类型播放完整雪崩音效）
    if (levelType === 'endgame') {
      try { AudioService.synth.playAvalancheStart(); } catch(e) {}
    } else {
      // novice/midgame 用简单的 success 音效
      try { AudioService.sfx.play('success'); } catch(e) {}
    }

    function fillNext() {
      if (index >= total) {
        // 动画完成：确保最后一帧完整渲染
        updateNumBtnCompletedState();
        if (renderer) {
          try { renderer.render(board); } catch(e) {}
        }

        // 雪崩结束音效（仅 endgame 类型）
        if (levelType === 'endgame') {
          try { AudioService.synth.playAvalancheEnd(); } catch(e) {}
        }

        if (onComplete) onComplete();
        return;
      }

      const cellInfo = autoFillCells[index];
      const { r, c, value, category } = cellInfo;

      // 填入数字（不记入历史，因为是自动补全）
      try {
        board.setNumberAt(r, c, value, {
          recordHistory: false,
          autoClear: true,
        });
      } catch (e) {
        // 兜底：直接设置 fillNum
        const cell = board.cells[r]?.[c];
        if (cell && !cell.fixedNum) {
          cell.fillNum = value;
        }
      }

      // 触发填数动画
      if (renderer && typeof renderer.triggerFillAnimation === 'function') {
        try {
          renderer.triggerFillAnimation(r, c, 200);
        } catch(e) {}
      }

      // 渲染策略：每 N 格重绘一次（格子越多，间隔越大，保证流畅）
      // 收官关（雪崩）渲染间隔更大，强化"飞速填满"的视觉感
      let renderInterval;
      if (levelType === 'endgame') {
        renderInterval = total > 40 ? 5 : (total > 20 ? 4 : 3);
      } else {
        renderInterval = total > 40 ? 4 : 3;
      }

      if (index % renderInterval === 0 || index === total - 1) {
        if (renderer) {
          try { renderer.render(board); } catch(e) {}
        }
      }

      // 播放音效
      // 雪崩阶段（endgame）：使用合成器的渐进式音阶音效
      // 其他阶段：使用普通 fill_correct 音效
      if (levelType === 'endgame') {
        // 雪崩音效：使用合成器，音高随进度上升
        // 控制播放频率：前半段间隔稍长，后半段更密集
        const progress = index / total;
        let sfxInterval;
        if (progress < 0.5) {
          // 前半段：间隔稍大（约每3-4格播一次）
          sfxInterval = 3;
        } else {
          // 后半段：更密集（约每2格播一次），配合加速感
          sfxInterval = 2;
        }

        if (index % sfxInterval === 0) {
          try {
            // 用当前已填入的数量作为"tick"索引，音高随进度上升
            AudioService.synth.playAvalancheTick(index, total);
          } catch(e) {}
        }
      } else {
        // 非雪崩关卡：使用普通 fill_correct 音效，固定间隔
        const sfxInterval = 4;
        if (index % sfxInterval === 0) {
          try { AudioService.sfx.play('fill_correct'); } catch(e) {}
        }
      }

      index++;

      // ============================================================
      // 雪崩加速：使用 ease-in 二次曲线
      // delay = baseDelay * (1 - acceleration * progress^2)
      // 特点：开始慢，后面越来越快，符合"雪崩"的感觉
      // ============================================================
      let delay = baseDelay;
      if (total > 10 && acceleration > 0) {
        const progress = index / total;
        // 二次方曲线：前半段平缓加速，后半段猛烈加速
        const speedFactor = 1 - acceleration * progress * progress;
        delay = baseDelay * speedFactor;
        delay = Math.max(minDelay, delay);
      }

      setTimeout(fillNext, delay);
    }

    // 开始动画
    fillNext();
  }

  /**
   * 触发关卡完成（统一通关逻辑，供 checkCompletion 和自动补全完成后调用）
   */
  function _triggerLevelComplete() {
    isCompleted = true;

    // Stop BGM
    try { AudioService.bgm.stop(); } catch(e) { log.warn('BGM stop error:', e); }

    // Get expert report
    let report = { totalWrong: 0 };
    try {
      report = expertSystem.onLevelEnd();
    } catch(e) {
      log.error('expertSystem.onLevelEnd error:', e);
    }
    // 用 gameTimer 获取时间（如果可用），否则回退到 startTime 计算
    const elapsed = gameTimer ? gameTimer.getTime() : Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    // 暂停计时器（如果还没暂停）
    if (gameTimer) try { gameTimer.pause(); } catch(e) {}

    // Calculate grade
    let grade = { letter: 'C', color: '#ffc107' };
    try {
      grade = calculateGrade(elapsed, report.totalWrong || errorCount || 0, hintCount);
    } catch(e) { log.error('calculateGrade error:', e); }

    // Save progress
    try {
      saveProgress(elapsed, report.totalWrong || errorCount || 0, hintCount, grade.letter);
    } catch(e) { log.error('saveProgress error:', e); }

    // Play victory BGM
    try { AudioService.bgm.playFile('victory_full.wav'); } catch(e) {}

    // Play clear dialog first, then show overlay
    const showOverlay = () => {
      try {
        // Show completion overlay
        const overlay = document.getElementById('complete-overlay');
        if (overlay) {
          overlay.style.display = 'flex';
          overlay.style.opacity = '0';
          requestAnimationFrame(() => {
            overlay.style.transition = 'opacity 0.5s ease';
            overlay.style.opacity = '1';
          });

          const gradeEl = document.getElementById('complete-grade');
          if (gradeEl) {
            gradeEl.textContent = grade.letter;
            gradeEl.style.color = grade.color;
          }

          document.getElementById('complete-time').textContent = '用时 ' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
          document.getElementById('complete-errors').textContent = '错误 ' + (report.totalWrong || 0) + ' 次';

          // Add hints display
          const hintsEl = document.getElementById('complete-hints');
          if (hintsEl) {
            hintsEl.textContent = '提示 ' + hintCount + ' 次';
          }

          let insight = '';
          try {
            const learning = expertSystem.getLearning();
            insight = learning.generateComment({
              nonTrivialRatio: 0.3,
              maxTechLevel: 5,
              score: 500,
            });
          } catch(e) { log.error('learning.generateComment error:', e); }
          document.getElementById('complete-insight').textContent = insight;

          // Update next level button text based on position
          try { updateNextLevelButton(); } catch(e) {}
        }

        // Play victory sound
        try { AudioService.sfx.play('victory'); } catch(e) {}
        log.info('Level completed:', currentLevelId, 'grade:', grade.letter);
      } catch(e) {
        log.error('Show completion overlay error:', e);
        // 最后兜底：直接显示结算画面
        const overlay = document.getElementById('complete-overlay');
        if (overlay) overlay.style.display = 'flex';
      }
    };

    // Play clear dialog first, then show overlay
    try {
      playClearDialog(showOverlay);
    } catch(e) {
      log.error('playClearDialog error:', e);
      showOverlay();
    }
  }

  // === Save Progress ===
  function saveProgress(timeSeconds, errors, hints, grade) {
    if (!global.ProgressManager) return;

    // Save level score
    const isNewBest = ProgressManager.setLevelScore(currentLevelId, {
      time: timeSeconds,
      errors: errors,
      hints: hints,
      grade: grade,
    });

    // 检查成就
    checkAchievements(timeSeconds, errors, hints, grade);

    // 刷新成就面板
    if (achievementPanel) {
      try { achievementPanel.refresh(); } catch (e) {}
    }

    // Unlock next chapter if this is the last level of current chapter
    if (isLastLevelOfChapter() && currentChapterData) {
      const nextChapterId = currentChapterData.chapterId + 1;
      if (findChapterById(nextChapterId)) {
        ProgressManager.unlockChapter(nextChapterId);
        log.info('Unlocked chapter:', nextChapterId);
      }
    }

    // 检查隐藏关解锁
    if (currentChapterData && chapterSelect && chapterSelect.chaptersData) {
      const newUnlocked = ProgressManager.checkAndUnlockHiddenLevels(
        currentChapterData.chapterId,
        chapterSelect.chaptersData
      );
      if (newUnlocked.length > 0) {
        showToast('✨ 新的隐藏关已解锁！');
        // 检查 all_hidden 成就
        if (ProgressManager.getUnlockedHiddenCount() >=
            ProgressManager.getTotalHiddenCount(chapterSelect.chaptersData)) {
          ProgressManager.unlockAchievement('all_hidden');
        }
      }
      // 检查真结局解锁
      if (ProgressManager.checkTrueEndingUnlock(chapterSelect.chaptersData)) {
        showToast('🌟 真结局已解锁！');
      }
    }
  }

  // === 成就检查 ===
  function checkAchievements(timeSeconds, errors, hints, grade) {
    if (!global.ProgressManager) return;

    // first_clear: 首次通关
    ProgressManager.unlockAchievement('first_clear');

    // === 进度类成就 ===

    // 各章节通关成就
    if (currentChapterData && chapterSelect && chapterSelect.chaptersData) {
      const chId = currentChapterData.chapterId;

      // chapter1_s: 第一章全S级
      if (ProgressManager.isChapterAllS(1, chapterSelect.chaptersData)) {
        ProgressManager.unlockAchievement('chapter1_s');
      }

      // 检查各章通关成就
      const chapterAchievements = {
        2: 'chapter2_clear',
        3: 'chapter3_clear',
        4: 'chapter4_clear',
        5: 'chapter5_clear',
      };
      for (const [chapId, achId] of Object.entries(chapterAchievements)) {
        if (ProgressManager.isChapterCleared(parseInt(chapId), chapterSelect.chaptersData)) {
          ProgressManager.unlockAchievement(achId);
        }
      }

      // all_chapters_clear: 全部章节通关
      if (ProgressManager.isAllChaptersCleared(chapterSelect.chaptersData)) {
        ProgressManager.unlockAchievement('all_chapters_clear');
      }
    }

    // === 挑战类成就 ===

    // speed_demon: 2分钟内完成
    if (timeSeconds <= 120 && grade === 'S') {
      ProgressManager.unlockAchievement('speed_demon');
    }

    // speed_5min: 5分钟内通关任意9×9关卡
    const gridSize = currentLevelData ? (currentLevelData.gridSize || 9) : 9;
    if (gridSize === 9 && timeSeconds <= 300 && !currentLevelData.isHidden) {
      ProgressManager.unlockAchievement('speed_5min');
    }

    // flawless_victory: 单关零错误通关
    if (errors === 0 && !currentLevelData.isHidden) {
      ProgressManager.unlockAchievement('flawless_victory');
    }

    // no_hint_ch1: 第一章某关不使用提示通关
    if (hints === 0 && currentLevelId >= 100 && currentLevelId < 200 &&
        !currentLevelData.isHidden) {
      ProgressManager.unlockAchievement('no_hint_ch1');
    }

    // no_hint_run: 连续3关不使用提示通关
    if (hints === 0 && !currentLevelData.isHidden) {
      const streak = ProgressManager.incrementNoHintStreak();
      if (streak >= 3) {
        ProgressManager.unlockAchievement('no_hint_run');
      }
    } else {
      // 使用了提示，重置连击
      ProgressManager.resetNoHintStreak();
    }

    // persistent: 累计游戏时长超过1小时（在 tick 中检查，这里补一次检查）
    if (ProgressManager.getTotalPlayTime() >= 3600) {
      ProgressManager.unlockAchievement('persistent');
    }

    // === 技巧类成就 ===

    // note_master: 单关标记超过50个候选数（在 toggleCandidate 中计数，这里检查）
    checkNoteMasterAchievement();

    // === 印记系统 ===
    checkSealsOnComplete(timeSeconds, errors, hints);
  }

  // 检查 note_master 成就
  function checkNoteMasterAchievement() {
    if (!global.ProgressManager || !board) return;
    if (ProgressManager.hasAchievement('note_master')) return;

    let noteCount = 0;
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        noteCount += board.cells[r][c].candidates.size;
      }
    }
    if (noteCount >= 50) {
      ProgressManager.unlockAchievement('note_master');
    }
  }

  // === 印记系统：通关检查 ===
  function checkSealsOnComplete(timeSeconds, errors, hints) {
    if (!global.ProgressManager) return;
    if (!currentLevelData || !currentLevelData.isHidden) return;

    const levelId = currentLevelData.levelId;
    const sealDef = ProgressManager.getSealDefByLevel(levelId);
    if (!sealDef) return;
    if (ProgressManager.isSealUnlocked(sealDef.id)) return;

    const stats = {
      errors: errors || 0,
      hints: hints || 0,
      timeSeconds: timeSeconds || 0,
      usedNotes: usedNotes,
      levelId: levelId
    };

    if (ProgressManager.checkSealCondition(sealDef.id, stats)) {
      const levelScore = {
        time: timeSeconds,
        errors: errors,
        hints: hints,
        grade: 'S'
      };
      ProgressManager.unlockSeal(sealDef.id, levelScore);
      showSealUnlockAnimation(sealDef);
      log.info('Seal unlocked:', sealDef.id, sealDef.name);
    }
  }

  // === 印记解锁动画 ===
  function showSealUnlockAnimation(sealDef) {
    // 播放特殊音效
    try {
      AudioService.sfx.play('seal_unlock');
    } catch (e) {}

    // 创建全屏动画容器
    const overlay = document.createElement('div');
    overlay.id = 'seal-unlock-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'z-index:30000;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);' +
      'opacity:0;transition:opacity 0.5s ease;pointer-events:auto;cursor:pointer;';

    // 粒子/光晕效果层
    const glow = document.createElement('div');
    glow.style.cssText = 'position:absolute;width:300px;height:300px;border-radius:50%;' +
      'background:radial-gradient(circle,' + sealDef.color + '40 0%,transparent 70%);' +
      'filter:blur(20px);animation:seal-pulse 2s ease-in-out infinite;' +
      'pointer-events:none;';
    overlay.appendChild(glow);

    // 印记图标
    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:100px;margin-bottom:24px;' +
      'text-shadow:0 0 40px ' + sealDef.color + 'cc;' +
      'transform:scale(0);animation:seal-pop 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards;' +
      'position:relative;z-index:1;';
    icon.textContent = sealDef.icon;
    overlay.appendChild(icon);

    // 印记名称
    const name = document.createElement('div');
    name.style.cssText = 'font-size:28px;font-weight:900;color:' + sealDef.color + ';' +
      'letter-spacing:8px;margin-bottom:8px;' +
      'text-shadow:0 0 20px ' + sealDef.color + '80;' +
      'opacity:0;transform:translateY(20px);animation:seal-fade-up 0.6s ease 0.8s forwards;' +
      'position:relative;z-index:1;';
    name.textContent = sealDef.name;
    overlay.appendChild(name);

    // 副标题
    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:14px;color:#94a3b8;letter-spacing:4px;' +
      'opacity:0;transform:translateY(20px);animation:seal-fade-up 0.6s ease 1s forwards;' +
      'position:relative;z-index:1;';
    subtitle.textContent = '✦ SEAL AWAKENED ✦';
    overlay.appendChild(subtitle);

    // 描述
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:13px;color:#64748b;max-width:320px;text-align:center;' +
      'line-height:1.8;margin-top:20px;' +
      'opacity:0;transform:translateY(20px);animation:seal-fade-up 0.6s ease 1.2s forwards;' +
      'position:relative;z-index:1;';
    desc.textContent = sealDef.desc;
    overlay.appendChild(desc);

    // 点击提示
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;color:#475569;margin-top:32px;' +
      'letter-spacing:2px;' +
      'opacity:0;animation:seal-blink 1.5s ease-in-out 1.8s infinite;' +
      'position:relative;z-index:1;';
    hint.textContent = '点 击 继 续';
    overlay.appendChild(hint);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes seal-pulse {
        0%, 100% { transform: scale(1); opacity: 0.6; }
        50% { transform: scale(1.3); opacity: 1; }
      }
      @keyframes seal-pop {
        0% { transform: scale(0) rotate(-180deg); opacity: 0; }
        60% { transform: scale(1.2) rotate(10deg); }
        100% { transform: scale(1) rotate(0deg); opacity: 1; }
      }
      @keyframes seal-fade-up {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes seal-blink {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(overlay);

    // 淡入
    requestAnimationFrame(function() {
      overlay.style.opacity = '1';
    });

    // 点击关闭
    function closeOverlay() {
      overlay.style.opacity = '0';
      setTimeout(function() {
        overlay.remove();
        style.remove();
      }, 500);
    }

    overlay.addEventListener('click', closeOverlay);

    // 自动关闭（最长 8 秒）
    setTimeout(closeOverlay, 8000);
  }

  // === 技巧使用记录（用于技巧类成就） ===
  // 将提示系统中的 techniqueName 映射到进度统计中的键名
  // 与 TechRater / HintSystem 的 10 种技巧对齐
  const TECHNIQUE_TO_STAT_KEY = {
    // 基础技巧
    '裸单法': 'nakedSingle',
    '隐单法': 'hiddenSingle',
    '笼子唯一组合': 'cageSum',
    // 杀手数独技巧
    '45法则': 'rule45',
    '笼和推导': 'cageSum',
    '笼和数对': 'cageSum',
    // 进阶技巧
    '裸数对': 'nakedPair',
    '隐数对': 'hiddenPair',
    '区块排除': 'pointingPair',
    '裸三数组': 'nakedTriplet',
    // 高阶技巧
    '二连纵横阵': 'xWing',
    '三才游鱼阵': 'swordfish',
  };

  function recordTechniqueUsage(techniqueName) {
    if (!global.ProgressManager || !techniqueName) return;

    const statKey = TECHNIQUE_TO_STAT_KEY[techniqueName];
    if (!statKey) return;

    // 累计技巧使用次数
    ProgressManager.addSkillCount(statKey, 1);

    const count = ProgressManager.getSkillCount(statKey);

    // 检查各技巧类成就
    if (statKey === 'rule45' && count >= 1) {
      ProgressManager.unlockAchievement('first_rule45');
    }
    if (statKey === 'nakedPair' && count >= 10) {
      ProgressManager.unlockAchievement('naked_pair_master');
    }
    if (statKey === 'pointingPair' && count >= 10) {
      ProgressManager.unlockAchievement('pointing_pair_pro');
    }
    if (statKey === 'cageSum' && count >= 20) {
      ProgressManager.unlockAchievement('cage_sum_expert');
    }
    // 高阶技巧成就
    if (statKey === 'xWing' && count >= 1) {
      ProgressManager.unlockAchievement('xwing_discovery');
    }
    if (statKey === 'swordfish' && count >= 1) {
      ProgressManager.unlockAchievement('swordfish_mastery');
    }
    if (statKey === 'hiddenPair' && count >= 5) {
      ProgressManager.unlockAchievement('hidden_pair_finder');
    }
    if (statKey === 'nakedTriplet' && count >= 5) {
      ProgressManager.unlockAchievement('triplet_hunter');
    }
  }

  // === 成就解锁Toast ===
  function showAchievementToast(achievement) {
    const existing = document.querySelector('.achievement-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.style.cssText = 'position:fixed;top:80px;right:20px;' +
      'background:linear-gradient(135deg,rgba(251,191,36,0.15),rgba(30,41,59,0.95));' +
      'border:1px solid rgba(251,191,36,0.5);border-radius:12px;' +
      'padding:16px 20px;z-index:25000;min-width:240px;' +
      'box-shadow:0 4px 20px rgba(251,191,36,0.2);' +
      'transform:translateX(400px);transition:transform 0.5s cubic-bezier(0.4,0,0.2,1);';
    toast.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;">' +
      '<div style="font-size:32px;">' + achievement.icon + '</div>' +
      '<div style="flex:1;">' +
      '<div style="font-size:11px;color:#fbbf24;letter-spacing:2px;margin-bottom:2px;">成就解锁</div>' +
      '<div style="font-size:15px;font-weight:700;color:#fef3c7;">' + achievement.name + '</div>' +
      '<div style="font-size:12px;color:#94a3b8;margin-top:2px;">' + achievement.desc + '</div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(toast);

    requestAnimationFrame(function() {
      toast.style.transform = 'translateX(0)';
    });
    setTimeout(function() {
      toast.style.transform = 'translateX(400px)';
      setTimeout(function() { toast.remove(); }, 500);
    }, 3500);
  }

  // === Grade Calculation ===
  function calculateGrade(elapsedSeconds, errors, hints) {
    // Estimate expected time based on grid size and difficulty
    const gridSize = currentLevelData ? (currentLevelData.gridSize || 9) : 9;
    const baseTime = gridSize <= 4 ? 60 : gridSize <= 6 ? 180 : 360;

    // Apply cycle difficulty modifiers
    let timeMultiplier = 1.0;
    let errorPenaltyMult = 1.0;
    if (global.ProgressManager) {
      const mods = ProgressManager.getCycleModifiers();
      timeMultiplier = mods.timeMultiplier;
      errorPenaltyMult = mods.errorPenalty / 0.15;
    }

    // Penalty factors
    const timeRatio = elapsedSeconds / (baseTime * timeMultiplier);
    const errorPenalty = errors * 0.15 * errorPenaltyMult;
    const hintPenalty = hints * 0.1;

    // Score: 100 base, subtract penalties
    let score = 100;
    score -= Math.max(0, (timeRatio - 0.5) * 40); // More than 50% of base time starts penalty
    score -= errorPenalty * 100;
    score -= hintPenalty * 100;

    let letter, color;
    if (score >= 90) { letter = 'S'; color = '#fbbf24'; }
    else if (score >= 75) { letter = 'A'; color = '#22c55e'; }
    else if (score >= 60) { letter = 'B'; color = '#3b82f6'; }
    else if (score >= 40) { letter = 'C'; color = '#a855f7'; }
    else { letter = 'D'; color = '#ef4444'; }

    return { letter, color, score: Math.max(0, Math.min(100, score)) };
  }

  // === Play Clear Dialog ===
  function playClearDialog(callback) {
    if (!storyEngine || !currentLevelData) {
      if (callback) callback();
      return;
    }

    const clearDialog = currentLevelData.clearDialog || [];
    if (clearDialog.length === 0) {
      if (callback) callback();
      return;
    }

    // 解锁出现的角色
    unlockCharactersFromDialog(clearDialog);

    // 解锁对话中出现的背景
    unlockBackgroundsFromDialog(clearDialog);

    // 设置场景键，用于已读剧情记录
    const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
    storyEngine.setSceneKey(chapterId + '_' + currentLevelId + '_clear');

    setUIVisible(false);
    log.info('Playing clear dialog (%d lines)', clearDialog.length);
    storyEngine.sayLines(clearDialog, () => {
      setUIVisible(true);
      // 标记剧情已读（图鉴用）
      if (galleryPanel) {
        galleryPanel.markSceneRead(chapterId, currentLevelId, 'clear');
      }
      if (callback) callback();
    });
  }

  // === Next Level ===
  function setupNextLevel() {
    const btn = document.getElementById('btn-next-level');
    if (btn) {
      btn.addEventListener('click', () => {
        handleNextLevel();
      });
    }
  }

  function updateNextLevelButton() {
    const btn = document.getElementById('btn-next-level');
    if (!btn) return;

    const isHiddenLevel = currentLevelData && currentLevelData.isHidden;
    const isLastLevel = isLastLevelOfChapter();
    const isLastChapter = isLastChapterOfGame();

    if (isHiddenLevel) {
      btn.textContent = '返回章节选择';
    } else if (isLastLevel && isLastChapter) {
      btn.textContent = '查看结局';
    } else if (isLastLevel) {
      btn.textContent = '进入结局';
    } else {
      btn.textContent = '下一关';
    }
  }

  function isLastLevelOfChapter() {
    if (!currentChapterData || !currentChapterData.levels) return false;
    const levels = currentChapterData.levels;
    // 只考虑普通关卡（非隐藏关）作为章节的最后一关
    const normalLevels = levels.filter(function(lvl) { return !lvl.isHidden; });
    if (normalLevels.length === 0) return false;
    const lastNormalLevel = normalLevels[normalLevels.length - 1];
    return parseInt(lastNormalLevel.levelId) === parseInt(currentLevelId);
  }

  function isLastChapterOfGame() {
    if (!global.CHAPTER_DATA || !global.CHAPTER_DATA.chapters) return false;
    const chapters = global.CHAPTER_DATA.chapters;
    // 真结局章如果已解锁则视为最后一章，否则只考虑普通章节
    const normalChapters = chapters.filter(function(ch) {
      if (global.ProgressManager && ProgressManager.isTrueEndingUnlocked()) {
        return true;
      }
      return !ch.isTrueEnding;
    });
    return normalChapters.length > 0 &&
      normalChapters[normalChapters.length - 1].chapterId === currentChapterData.chapterId;
  }

  function handleNextLevel() {
    const isLast = isLastLevelOfChapter();
    const isHiddenLevel = currentLevelData && currentLevelData.isHidden;

    // 隐藏关通关后返回章节选择
    if (isHiddenLevel) {
      const overlay = document.getElementById('complete-overlay');
      if (overlay) overlay.style.display = 'none';
      if (chapterSelect) {
        chapterSelect._render();
        chapterSelect.show();
      }
      return;
    }

    if (isLast) {
      // Chapter end: play epilogue then transition
      playChapterEpilogue(() => {
        if (isLastChapterOfGame()) {
          showGameEnding();
        } else {
          showChapterTransition(() => {
            goToNextChapter();
          });
        }
      });
    } else {
      // Normal next level: 从当前章节中找到下一个非隐藏关卡
      const nextLevelId = _findNextLevelId(currentLevelId);
      if (nextLevelId) {
        if (startedFromSelect && chapterSelect) {
          // Use in-page navigation when coming from chapter select
          startLevel(nextLevelId);
          // Hide completion overlay
          const overlay = document.getElementById('complete-overlay');
          if (overlay) overlay.style.display = 'none';
        } else {
          window.location.href = 'guide.html?id=' + nextLevelId;
        }
      } else {
        // Fallback: try currentLevelId + 1
        const fallbackId = currentLevelId + 1;
        if (startedFromSelect && chapterSelect) {
          startLevel(fallbackId);
        } else {
          window.location.href = 'guide.html?id=' + fallbackId;
        }
      }
    }
  }

  /**
   * 在当前章节中查找下一个非隐藏关卡的ID
   * @param {number} currentId - 当前关卡ID
   * @returns {number|null} 下一关的ID，如果没有则返回null
   */
  function _findNextLevelId(currentId) {
    if (!currentChapterData || !currentChapterData.levels) return null;
    const levels = currentChapterData.levels;
    const numId = parseInt(currentId);
    const currentIndex = levels.findIndex(lvl => parseInt(lvl.levelId) === numId);
    if (currentIndex === -1) return null;

    // 从下一个关卡开始找，跳过隐藏关
    for (let i = currentIndex + 1; i < levels.length; i++) {
      if (!levels[i].isHidden) {
        return parseInt(levels[i].levelId);
      }
    }
    return null; // 没有更多非隐藏关卡
  }

  // === Chapter Epilogue ===
  function playChapterEpilogue(callback) {
    if (!storyEngine || !currentChapterData) {
      if (callback) callback();
      return;
    }

    const epilogue = currentChapterData.epilogue || currentChapterData.endingStory || [];
    if (epilogue.length === 0) {
      if (callback) callback();
      return;
    }

    // 解锁对话中出现的角色和背景
    unlockCharactersFromDialog(epilogue);
    unlockBackgroundsFromDialog(epilogue);

    // 设置场景键，用于已读剧情记录
    const chapterId = currentChapterData.chapterId;
    storyEngine.setSceneKey(chapterId + '_epilogue');

    // Hide completion overlay and game UI
    const overlay = document.getElementById('complete-overlay');
    if (overlay) overlay.style.display = 'none';
    setUIVisible(false);

    log.info('Playing chapter epilogue (%d lines)', epilogue.length);
    storyEngine.sayLines(epilogue, () => {
      // 标记剧情已读（图鉴用）
      if (galleryPanel) {
        galleryPanel.markSceneRead(chapterId, 0, 'epilogue');
      }
      if (callback) callback();
    });
  }

  // === Chapter Transition Screen ===
  function showChapterTransition(callback) {
    const transition = document.getElementById('chapter-transition');
    if (!transition) {
      if (callback) callback();
      return;
    }

    const nextChapterId = currentChapterData.chapterId + 1;
    const nextChapter = findChapterById(nextChapterId);

    if (nextChapter) {
      document.getElementById('ct-title').textContent = nextChapter.title || '';
      document.getElementById('ct-subtitle').textContent = nextChapter.subtitle || '';
    }

    transition.style.display = 'flex';
    transition.style.opacity = '0';
    requestAnimationFrame(() => {
      transition.style.transition = 'opacity 0.8s ease';
      transition.style.opacity = '1';
    });

    setTimeout(() => {
      transition.style.opacity = '0';
      setTimeout(() => {
        transition.style.display = 'none';
        if (callback) callback();
      }, 800);
    }, 3000);
  }

  function findChapterById(chapterId) {
    if (!global.CHAPTER_DATA || !global.CHAPTER_DATA.chapters) return null;
    for (const ch of global.CHAPTER_DATA.chapters) {
      if (ch.chapterId === chapterId) return ch;
    }
    return null;
  }

  function goToNextChapter() {
    const nextChapterId = currentChapterData.chapterId + 1;
    const nextChapter = findChapterById(nextChapterId);
    if (nextChapter && nextChapter.levels && nextChapter.levels.length > 0) {
      // 找到第一个非隐藏关卡
      const firstNormalLevel = nextChapter.levels.find(function(lvl) { return !lvl.isHidden; });
      const firstLevelId = firstNormalLevel ? parseInt(firstNormalLevel.levelId) : parseInt(nextChapter.levels[0].levelId);
      if (startedFromSelect && chapterSelect) {
        // In-page navigation
        startLevel(firstLevelId);
      } else {
        window.location.href = 'guide.html?id=' + firstLevelId;
      }
    } else {
      // Fallback: try currentLevelId + 1
      if (startedFromSelect && chapterSelect) {
        startLevel(parseInt(currentLevelId) + 1);
      } else {
        window.location.href = 'guide.html?id=' + (parseInt(currentLevelId) + 1);
      }
    }
  }

  // === Game Ending ===
  function showGameEnding() {
    const overlay = document.getElementById('complete-overlay');
    if (overlay) overlay.style.display = 'none';

    // 检查是否是真结局章
    const isTrueEndingChapter = currentChapterData && currentChapterData.isTrueEnding;

    if (isTrueEndingChapter) {
      showTrueEnding();
      return;
    }

    const ending = document.getElementById('game-ending');
    if (!ending) {
      // Fallback: just show a final message
      if (overlay) {
        overlay.style.display = 'flex';
        document.getElementById('complete-grade').textContent = '终';
        document.getElementById('complete-insight').textContent = '全剧终 — 感谢你的游玩';
        const btn = document.getElementById('btn-next-level');
        if (btn) btn.style.display = 'none';
      }
      return;
    }

    ending.style.display = 'flex';
    ending.style.opacity = '0';
    requestAnimationFrame(() => {
      ending.style.transition = 'opacity 1.5s ease';
      ending.style.opacity = '1';
    });

    // Add "back to chapter select" button after a delay
    setTimeout(() => {
      addEndingReturnButton();
    }, 4000);
  }

  // === True Ending ===
  function showTrueEnding() {
    if (global.ProgressManager) {
      ProgressManager.setTrueEndingCleared();
    }

    const trueEnding = document.getElementById('true-ending');
    if (!trueEnding) {
      // Fallback: use normal ending with modified text
      const ending = document.getElementById('game-ending');
      if (ending) {
        const titleEl = ending.querySelector('div > div:nth-child(2)');
        if (titleEl) titleEl.textContent = '真 · 星辰归途';
        const subEl = ending.querySelector('div > div:nth-child(1)');
        if (subEl) subEl.textContent = '— 真结局 —';
      }
      showGameEnding();
      return;
    }

    trueEnding.style.display = 'flex';
    trueEnding.style.opacity = '0';
    requestAnimationFrame(function() {
      trueEnding.style.transition = 'opacity 2s ease';
      trueEnding.style.opacity = '1';
    });

    // Add return button after delay
    setTimeout(function() {
      addTrueEndingReturnButton();
    }, 5000);
  }

  function addTrueEndingReturnButton() {
    const ending = document.getElementById('true-ending');
    if (!ending) return;
    if (document.getElementById('btn-true-ending-return')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-true-ending-return';
    btn.textContent = '返回章节选择';
    btn.style.cssText = 'margin-top:40px;padding:14px 36px;font-size:16px;' +
      'background:transparent;border:1px solid #fbbf24;color:#fbbf24;' +
      'border-radius:8px;cursor:pointer;letter-spacing:3px;transition:all 0.3s;' +
      'text-shadow:0 0 10px rgba(251,191,36,0.5);';
    btn.addEventListener('mouseenter', function() {
      btn.style.background = 'rgba(251,191,36,0.15)';
      btn.style.boxShadow = '0 0 20px rgba(251,191,36,0.3)';
    });
    btn.addEventListener('mouseleave', function() {
      btn.style.background = 'transparent';
      btn.style.boxShadow = 'none';
    });
    btn.addEventListener('click', function() {
      ending.style.opacity = '0';
      setTimeout(function() {
        ending.style.display = 'none';
        if (chapterSelect) {
          chapterSelect._render();
          chapterSelect.show();
        }
      }, 1000);
    });

    const content = ending.querySelector('div');
    if (content) content.appendChild(btn);
  }

  function addEndingReturnButton() {
    const ending = document.getElementById('game-ending');
    if (!ending) return;
    if (document.getElementById('btn-ending-return')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-ending-return';
    btn.textContent = '返回章节选择';
    btn.style.cssText = 'margin-top:40px;padding:12px 32px;font-size:16px;' +
      'background:transparent;border:1px solid #64748b;color:#94a3b8;' +
      'border-radius:8px;cursor:pointer;letter-spacing:2px;transition:all 0.3s;';
    btn.addEventListener('mouseenter', () => {
      btn.style.borderColor = '#fbbf24';
      btn.style.color = '#fbbf24';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.borderColor = '#64748b';
      btn.style.color = '#94a3b8';
    });
    btn.addEventListener('click', () => {
      ending.style.opacity = '0';
      setTimeout(() => {
        ending.style.display = 'none';
        if (chapterSelect) {
          chapterSelect._render();
          chapterSelect.show();
        }
      }, 800);
    });

    const content = ending.querySelector('div');
    if (content) content.appendChild(btn);
  }

  // === Character Bubble ===
  /**
   * Show a lightweight character speech bubble.
   * Used for hints, encouragement, eureka moments, error feedback.
   * Position: top-right area near the board, with character avatar + text.
   *
   * @param {string} characterId - character ID (ayan, cagekeeper, ying, etc.)
   * @param {Object} options - { text, speakerName, duration, type, onClick }
   */
  function showCharacterBubble(characterId, options) {
    options = options || {};
    const text = options.text || '';
    const speakerName = options.speakerName || '';
    const duration = options.duration || 3000;
    const type = options.type || 'info'; // info, hint, eureka, encourage, error

    // Remove existing bubble
    if (_characterBubbleEl) {
      _characterBubbleEl.remove();
      _characterBubbleEl = null;
    }
    if (_characterBubbleTimer) {
      clearTimeout(_characterBubbleTimer);
      _characterBubbleTimer = null;
    }

    _characterBubbleVisible = true;

    // Create bubble element
    const bubble = document.createElement('div');
    bubble.className = 'char-bubble char-bubble-' + type;
    _characterBubbleEl = bubble;

    // Type-specific styles
    const typeStyles = {
      hint: {
        borderColor: 'rgba(251,191,36,0.5)',
        bgColor: 'rgba(15,23,42,0.92)',
        shadowColor: 'rgba(251,191,36,0.2)',
      },
      eureka: {
        borderColor: 'rgba(34,197,94,0.6)',
        bgColor: 'rgba(15,23,42,0.95)',
        shadowColor: 'rgba(34,197,94,0.3)',
      },
      encourage: {
        borderColor: 'rgba(147,51,234,0.4)',
        bgColor: 'rgba(15,23,42,0.9)',
        shadowColor: 'rgba(147,51,234,0.2)',
      },
      error: {
        borderColor: 'rgba(239,68,68,0.5)',
        bgColor: 'rgba(15,23,42,0.92)',
        shadowColor: 'rgba(239,68,68,0.2)',
      },
      info: {
        borderColor: 'rgba(148,163,184,0.3)',
        bgColor: 'rgba(15,23,42,0.9)',
        shadowColor: 'rgba(148,163,184,0.1)',
      },
    };

    const style = typeStyles[type] || typeStyles.info;
    const emoji = CHAR_EMOJI[characterId] || '💬';

    bubble.style.cssText =
      'position:fixed;top:70px;right:16px;' +
      'max-width:280px;min-width:180px;' +
      'background:' + style.bgColor + ';' +
      'border:1px solid ' + style.borderColor + ';' +
      'border-radius:14px;' +
      'padding:12px 14px 12px 12px;' +
      'z-index:9500;' +
      'box-shadow:0 4px 20px ' + style.shadowColor + ';' +
      'backdrop-filter:blur(8px);' +
      'opacity:0;' +
      'transform:translateX(20px);' +
      'transition:all 0.3s cubic-bezier(0.4,0,0.2,1);' +
      'cursor:pointer;' +
      'display:flex;gap:10px;align-items:flex-start;';

    // Build inner HTML with avatar + text
    bubble.innerHTML =
      '<div class="char-bubble-avatar" style="' +
        'flex-shrink:0;width:36px;height:36px;' +
        'border-radius:50%;' +
        'background:linear-gradient(135deg,rgba(251,191,36,0.2),rgba(15,23,42,0.8));' +
        'border:1px solid ' + style.borderColor + ';' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:20px;' +
      '">' + emoji + '</div>' +
      '<div class="char-bubble-content" style="flex:1;min-width:0;">' +
        (speakerName ? '<div class="char-bubble-name" style="font-size:11px;color:#fbbf24;font-weight:700;margin-bottom:4px;letter-spacing:1px;">' + speakerName + '</div>' : '') +
        '<div class="char-bubble-text" style="font-size:13px;color:#e2e8f0;line-height:1.5;word-break:break-word;">' +
          formatBubbleText(text, type) +
        '</div>' +
      '</div>' +
      '<div class="char-bubble-close" style="flex-shrink:0;font-size:10px;color:#64748b;cursor:pointer;padding:2px 4px;" title="点击关闭">✕</div>';

    document.body.appendChild(bubble);

    // Animate in
    requestAnimationFrame(() => {
      bubble.style.opacity = '1';
      bubble.style.transform = 'translateX(0)';
    });

    // Click to dismiss
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      hideCharacterBubble();
    });

    // Auto-dismiss
    _characterBubbleTimer = setTimeout(() => {
      hideCharacterBubble();
    }, duration);
  }

  /**
   * Format bubble text with technique name highlighting.
   */
  function formatBubbleText(text, type) {
    // Highlight technique name in 【brackets】
    return text.replace(/【([^】]+)】/g,
      '<span style="color:#fbbf24;font-weight:700;">【$1】</span>');
  }

  /**
   * Hide the current character bubble.
   */
  function hideCharacterBubble() {
    if (!_characterBubbleEl) return;
    const bubble = _characterBubbleEl;
    _characterBubbleEl = null;
    _characterBubbleVisible = false;

    if (_characterBubbleTimer) {
      clearTimeout(_characterBubbleTimer);
      _characterBubbleTimer = null;
    }

    bubble.style.opacity = '0';
    bubble.style.transform = 'translateX(20px)';
    setTimeout(() => {
      if (bubble.parentNode) bubble.remove();
    }, 300);
  }

  // === Expert System Character Handlers ===
  /**
   * Register character-based feedback handlers for the expert system.
   * Replaces plain toast feedback with character dialogue bubbles.
   */
  function registerExpertCharacterHandlers() {
    if (!expertSystem || !expertSystem.expression) return;

    // Override EUREKA with character bubble + effects
    expertSystem.expression.registerActionHandler('EUREKA', (params) => {
      const msg = params.message || '漂亮！连击爆发！';
      showCharacterBubble('ayan', {
        text: msg,
        speakerName: '阿妍',
        duration: 2500,
        type: 'eureka',
      });
      if (typeof global.Effects !== 'undefined' && typeof global.Effects.triggerLevel === 'function') {
        global.Effects.triggerLevel(params.level || 3);
      }
      if (typeof global.AudioManager !== 'undefined' && typeof global.AudioManager.playEureka === 'function') {
        global.AudioManager.playEureka();
      }
    });

    // Override SHOW_DIALOG with character bubble
    expertSystem.expression.registerActionHandler('SHOW_DIALOG', (params) => {
      const dialogId = params.dialogId || 'default';
      const text = params.text || _getExpertDialogText(dialogId);
      const charId = params.character || 'cagekeeper';
      const charName = params.speakerName || (charId === 'cagekeeper' ? '守笼人' : '阿妍');
      showCharacterBubble(charId, {
        text: text,
        speakerName: charName,
        duration: 3500,
        type: 'encourage',
      });
    });

    // Override SHOW_TOAST - keep for ambient/info, use character bubble for feedback
    expertSystem.expression.registerActionHandler('SHOW_TOAST', (params) => {
      const msg = params.message || '';
      const level = params.level || 'info';
      // Use character bubble for game-relevant feedback
      if (level === 'encourage' || params.character) {
        const charId = params.character || 'cagekeeper';
        const charName = params.speakerName || (charId === 'cagekeeper' ? '守笼人' : '阿妍');
        showCharacterBubble(charId, {
          text: msg,
          speakerName: charName,
          duration: 3000,
          type: 'encourage',
        });
      } else {
        // Fallback to regular toast for system messages
        showToast(msg, params.duration || 2500);
      }
    });

    // Register ENCOURAGE action (new)
    expertSystem.expression.registerActionHandler('ENCOURAGE', (params) => {
      const msg = params.message || '别急，慢慢来。';
      const charId = params.character || 'ying';
      const charName = params.speakerName || '莹莹';
      showCharacterBubble(charId, {
        text: msg,
        speakerName: charName,
        duration: 3000,
        type: 'encourage',
      });
    });

    // Register ERROR_FEEDBACK action (new)
    let _lastErrorFeedbackTime = 0;
    expertSystem.expression.registerActionHandler('ERROR_FEEDBACK', (params) => {
      const now = Date.now();
      // Cooldown: don't repeat error feedback within 5 seconds
      if (now - _lastErrorFeedbackTime < 5000) return;
      _lastErrorFeedbackTime = now;

      const msg = params.message || '小心，这格不对哦。';
      const charId = params.character || 'cagekeeper';
      const charName = params.speakerName || '守笼人';
      showCharacterBubble(charId, {
        text: msg,
        speakerName: charName,
        duration: 2000,
        type: 'error',
      });
    });

    log.info('Expert character handlers registered');
  }

  function _getExpertDialogText(id) {
    const dialogs = {
      stuck_guide: '试试换个角度看盘面，或者用笔记标记候选数。',
      ambient_encouragement: '继续保持，你做得很好。',
    };
    return dialogs[id] || '';
  }

  // === Pause Menu ===

  function togglePause() {
    if (isPaused) {
      hidePauseMenu();
    } else {
      showPauseMenu();
    }
  }

  function showPauseMenu() {
    if (isCompleted || isPaused) return;
    if (!board) return; // 棋盘未初始化时不暂停

    isPaused = true;

    // 暂停计时器
    if (gameTimer && typeof gameTimer.pause === 'function') {
      gameTimer.pause();
    }

    // 暂停 BGM
    if (typeof AudioService !== 'undefined' && AudioService.bgm) {
      AudioService.bgm.pause();
    }

    // 暂停专家系统
    if (expertSystem && typeof expertSystem.pause === 'function') {
      expertSystem.pause();
    }

    // 更新暂停菜单时间显示
    updatePauseTime();

    // 显示暂停菜单
    const overlay = document.getElementById('pause-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '1';
      });
    }
  }

  function hidePauseMenu() {
    if (!isPaused) return;
    isPaused = false;

    const overlay = document.getElementById('pause-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
      }, 300);
    }

    // 恢复计时器
    if (gameTimer && typeof gameTimer.resume === 'function') {
      gameTimer.resume();
    }

    // 恢复 BGM
    if (typeof AudioService !== 'undefined' && AudioService.bgm) {
      AudioService.bgm.resume();
    }

    // 恢复专家系统
    if (expertSystem && typeof expertSystem.resume === 'function') {
      expertSystem.resume();
    }
  }

  function updatePauseTime() {
    const timeEl = document.getElementById('pause-time');
    if (!timeEl) return;

    let elapsed = 0;
    if (gameTimer && typeof gameTimer.getTime === 'function') {
      elapsed = gameTimer.getTime();
    } else {
      elapsed = Math.floor((Date.now() - startTime) / 1000);
    }

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timeEl.textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function restartLevel() {
    hidePauseMenu();
    // 延迟一下再开始，让暂停菜单有时间消失
    setTimeout(() => {
      startLevel(currentLevelId);
    }, 300);
  }

  function goToChapterSelect() {
    hidePauseMenu();
    if (chapterSelect) {
      chapterSelect.show();
    }
  }

  function goToMainMenu() {
    hidePauseMenu();
    // 保存当前进度
    if (global.ProgressManager && currentLevelId) {
      ProgressManager.setLastPlayedLevel(currentLevelId);
    }
    // 跳转到主菜单
    window.location.href = 'menu.html';
  }

  // === Toast ===
  function showToast(msg, duration) {
    const existing = document.querySelector('.game-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'game-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration || 2500);
  }

  // === 调试工具集（在控制台使用）
  // ============================================================
  const DEBUG_TOOLS = {
    // 1. 渲染状态检查
    checkRender: function() {
      console.log('=== [Debug] cellSize:', renderer ? renderer.cellSize : 'renderer not found');
      console.log('[Debug] board size:', board ? board.size : 'board not found');
      console.log('[Debug] selectedCell:', board && board.selectedCell ? `(${board.selectedCell.r},${board.selectedCell.c})` : 'none');
      console.log('[Debug] history length:', board ? board.history.length : 0);
      if (board && board.history.length > 0) {
        const last = board.history[board.history.length - 1];
        console.log('[Debug] last action:', last.type, last.r !== undefined ? `(${last.r},${last.c})` : '', last.value !== undefined ? '=' + last.value : '');
      }
      console.log('[Debug] bossBattleStarted:', bossBattleStarted);
      console.log('[Debug] GuideBattle.active:', GuideBattle ? GuideBattle.active : 'N/A');
      if (GuideBattle && GuideBattle.active) {
        console.log('[Debug] playerCount:', GuideBattle.playerCount, '/', GuideBattle.winTarget);
        console.log('[Debug] aiCount:', GuideBattle.aiCount, '/', GuideBattle.winTarget);
      }
    },

    // 2. 棋盘快照
    snapshot: function() {
      if (!board) return;
      console.log('=== [Debug] Board Snapshot ===');
      for (let r = 0; r < board.size; r++) {
        let row = '';
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          const v = cell.fixedNum || cell.fillNum || 0;
          const ai = cell.isAiFilled ? '*' : ' ';
          row += v + ai + ' ';
        }
        console.log(row);
      }
    },

    // 3. AI状态追踪
    traceAI: function() {
      if (!GuideBattle || !GuideBattle.active) {
        console.log('[Debug] No active boss battle');
        return;
      }
      console.log('=== [Debug] AI State ===');
      console.log('AI personality:', GuideBattle._aiPlayer ? GuideBattle._aiPlayer.getPersonality().name : 'N/A');
      console.log('AI move count:', GuideBattle._aiPlayer ? GuideBattle._aiPlayer.getMoveCount() : 0);
      console.log('AI thinking:', GuideBattle._aiThinking);
      if (GuideBattle._aiPlayer) {
        const step = GuideBattle._aiPlayer.think();
        if (step) {
          console.log('AI next would fill:', `(${step.row},${step.col})=${step.num}`, 'tech:', step.techniqueName, 'thinkTime:', Math.round(step.thinkTime) + 'ms');
        } else {
          console.log('AI has no move (stuck!)');
        }
      }
    },

    // 4. 强制AI立刻走一步
    forceAIMove: function() {
      if (GuideBattle && GuideBattle.active) {
        GuideBattle._aiMove();
        console.log('[Debug] Forced AI move');
      }
    },

    // 5. 重置当前关卡
    reload: function() {
      restartLevel();
      console.log('[Debug] Level reloaded');
    },

    // 6. 开启AI详细日志
    toggleAILog: function(enabled) {
      window.DEBUG_AI = enabled !== false;
      console.log('[Debug] AI debug logging:', window.DEBUG_AI ? 'ON' : 'OFF');
    },

    // 7. 显示AI所有数字（作弊模式，调试用）
    revealAINumbers: function() {
      if (!board || !GuideBattle.active) return;
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          if (cell.isAiFilled && cell._aiNum) {
            cell.fillNum = cell._aiNum;
          }
        }
      }
      if (renderer) renderer.render(board);
      console.log('[Debug] AI numbers revealed');
    },

    // 8. 隐藏AI数字（恢复正常）
    hideAINumbers: function() {
      if (!board) return;
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          if (cell.isAiFilled) {
            cell.fillNum = null;
          }
        }
      }
      if (renderer) renderer.render(board);
      console.log('[Debug] AI numbers hidden');
    },
  };

  // 挂到window上，方便控制台直接调用
  global.DEBUG = DEBUG_TOOLS;

  // Expose
  global.guideInit = initBoard;
  global.showToast = showToast;
  global.showCharacterBubble = showCharacterBubble;
  global.hideCharacterBubble = hideCharacterBubble;

  // ============================================================
  //  自动化测试外部接口（方案A：JS API 直连，非 DOM 模拟）
  //  供 Playwright / Node.js 通过 page.evaluate 调用
  // ============================================================

  /**
   * 读取当前棋盘数字
   * @returns {number[][]} 9×9 二维数组，0 表示空白格，1~9 为数字（含固定题目数字和玩家填入数字）
   */
  global.getBoard = function () {
    if (!board || !board.cells) {
      console.warn('[AutoTest] getBoard: board not ready');
      return Array(9).fill(null).map(() => Array(9).fill(0));
    }
    const size = board.size || 9;
    const result = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        row.push(cell.fixedNum || cell.fillNum || 0);
      }
      result.push(row);
    }
    return result;
  };

  /**
   * 读取当前棋盘所有笼子数据（杀手数独求解必需）
   * @returns {Array<{sum: number, cells: Array<[number, number]>}>} 笼子数组，每个笼子包含和值和格子坐标列表
   */
  global.getCages = function () {
    if (!board || !board.cages) {
      return [];
    }
    return board.cages.map(function (cage) {
      return {
        sum: cage.sum,
        cells: cage.cells ? cage.cells.map(function (c) { return [c[0], c[1]]; }) : [],
      };
    });
  };

  /**
   * 在指定位置填入数字（同步触发 UI 渲染和冲突校验）
   * @param {number} row - 行号 (0~8)
   * @param {number} col - 列号 (0~8)
   * @param {number} num - 数字 (1~9)，传 0 表示擦除
   * @returns {{success: boolean, reason?: string}} 操作结果
   */
  global.setCell = function (row, col, num) {
    if (!board || !board.cells) {
      return { success: false, reason: 'board not ready' };
    }
    const size = board.size || 9;
    if (row < 0 || row >= size || col < 0 || col >= size) {
      return { success: false, reason: 'index out of range' };
    }
    const cell = board.cells[row][col];
    // 保护固定数字：题目预置数字禁止修改
    if (cell.fixedNum) {
      return { success: false, reason: 'fixed cell, cannot modify' };
    }
    if (cell.isLocked) {
      return { success: false, reason: 'cell is locked' };
    }
    if (num === 0 || num === null || num === undefined) {
      // 擦除
      cell.fillNum = null;
      cell.candidates.clear();
      cell.eliminations.clear();
    } else {
      if (num < 1 || num > size) {
        return { success: false, reason: 'num out of range' };
      }
      // 使用 board.setNumberAt，会触发冲突检测、自动清除笔记等
      const ok = board.setNumberAt(row, col, num, { recordHistory: false, autoClear: false });
      if (!ok) {
        return { success: false, reason: 'setNumberAt failed' };
      }
    }
    // 重新计算全棋盘错误标记
    if (typeof board._recomputeAllErrors === 'function') {
      board._recomputeAllErrors();
    } else {
      // 降级：逐格校验
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cc = board.cells[r][c];
          if (cc.fillNum) {
            const v = board._validateCell(r, c);
            cc.isError = v.hasConflict;
          }
        }
      }
    }
    // 触发渲染
    if (renderer) {
      renderer.forceRender = true;
      renderer.render(board);
    }
    return { success: true };
  };

  /**
   * 异步创建一局新题目（自动化测试专用，跳过剧情/对话/BGM）
   * @param {number|string} level - 关卡 ID 或难度标识
   * @returns {Promise<{success: boolean, levelId: number, reason?: string}>}
   */
  global.createNewGame = function (level) {
    return new Promise(async function (resolve) {
      try {
        const levelId = typeof level === 'number' ? level : (parseInt(level, 10) || 101);

        // 清理上一局的运行时状态
        try { _cleanupLevelState(); } catch (e) { /* ignore */ }

        currentLevelId = levelId;
        isCompleted = false;
        errorCount = 0;
        hintCount = 0;
        usedNotes = false;

        // 加载关卡数据
        await loadLevel(levelId);

        // 查找章节数据
        findChapter();

        // 直接初始化棋盘（跳过剧情、对话、BGM、Boss战等）
        initBoard();

        // 确保交互解锁
        setInteractionLocked(false);
        const canvas = document.getElementById('gameCanvas');
        if (canvas) canvas.style.pointerEvents = '';

        // 启动计时器
        if (gameTimer) {
          gameTimer.start();
        } else {
          startTime = Date.now();
        }

        // 保存上次游玩关卡
        if (global.ProgressManager && typeof ProgressManager.setLastPlayedLevel === 'function') {
          ProgressManager.setLastPlayedLevel(currentLevelId);
        }

        // 等待下一帧确保渲染完成
        requestAnimationFrame(() => {
          resolve({ success: true, levelId: levelId });
        });
      } catch (e) {
        resolve({ success: false, levelId: levelId, reason: String(e) });
      }
    });
  };

  /**
   * 校验当前棋盘完整性和规则合法性
   * @returns {{isComplete: boolean, errors: Array<{row: number, col: number, type: string}>}}
   */
  global.verifyAll = function () {
    if (!board || !board.cells) {
      return { isComplete: false, errors: [{ row: -1, col: -1, type: 'board_not_ready' }] };
    }
    const result = validateBoard();
    // 转换格式：errors 中的 r/c 改为 row/col
    const errors = (result.errors || []).map(e => ({
      row: e.r,
      col: e.c,
      type: e.type || 'unknown',
    }));
    return {
      isComplete: !!result.valid,
      errors: errors,
    };
  };

  // === 自动化测试专用接口 ===

  /**
   * 测试专用：直接启动Boss战（跳过所有对话）
   * @param {number} chapterId - 章节ID（默认当前章节）
   * @returns {{success: boolean, reason?: string}}
   */
  global.__testStartBossBattle = function (chapterId) {
    try {
      if (typeof GuideBattle === 'undefined') {
        return { success: false, reason: 'GuideBattle not loaded' };
      }
      const chId = chapterId || (currentChapterData?.chapterId);
      if (!chId) {
        return { success: false, reason: 'No chapterId' };
      }
      const bossConfig = GuideBattle.getBossConfig(chId);
      if (!bossConfig) {
        return { success: false, reason: 'No boss config for chapter ' + chId };
      }
      // 直接初始化Boss战，跳过对话
      _initBossBattle(bossConfig);
      return { success: true };
    } catch (e) {
      return { success: false, reason: String(e) };
    }
  };

  // 标记接口已就绪，供外部轮询检测
  global.__autoTestReady = true;

})(window);
