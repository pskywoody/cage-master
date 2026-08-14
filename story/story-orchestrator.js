// ============================================================
//  StoryOrchestrator - 剧情编排器
// ============================================================
//  负责关卡/章节层面的剧情播放编排
//  - 前置对话 (preDialog) —— 优先从 ScriptData 查找
//  - 章节序章 (prologue)
//  - 通关对话 (clearDialog)
//  - 章节尾声 (epilogue)
//  - 首次技巧教学对话 (first-encounter teaching)
//  - 图鉴解锁（角色、背景）
// ============================================================
//  支持三周目剧本：通过 ScriptData 模块加载 scripts.json
//  降级策略：ScriptData 无数据时回退到 levelData 的对话字段
// ============================================================

'use strict';

const log = {
  info: (...args) => console.log('[StoryOrchestrator]', ...args),
  warn: (...args) => console.warn('[StoryOrchestrator]', ...args),
  error: (...args) => console.error('[StoryOrchestrator]', ...args),
};

const NAME_TO_CHAR = {
  '苏晚': 'suwan',
  '沈墨': 'shenmo',
  '薇拉': 'vera',
  '周太太': 'zhou_taotai',
  '潘汉年': 'pan_hanian',
  '伊藤': 'ito',
  '山田': 'yamada',
  '老师': 'teacher',
  '父亲': 'father',
};

// 章节默认剧情背景（2026-08-14 新剧本《笼局·三岔口》逐章美术库）
// 1信/2屋/3门/4绳/5电/6网/7终幕；1-7章已生成 chapter{N} 专属背景
const CHAPTER_DEFAULT_BG = {
  1: 'assets/images/chapter1/backgrounds/BG-CH1-01_accounting_room_night.jpg',
  2: 'assets/images/chapter2/backgrounds/BG-CH2-01_b1_corridor.jpg',
  3: 'assets/images/chapter3/backgrounds/BG-CH3-01_secret_door.jpg',
  4: 'assets/images/chapter4/backgrounds/BG-CH4-01_unit94_backalley.jpg',
  5: 'assets/images/chapter5/backgrounds/BG-CH5-01_telegraph_room.jpg',
  6: 'assets/images/chapter6/backgrounds/BG-CH6-01_accounting.jpg',
  7: 'assets/images/chapter7/backgrounds/BG-CH7-01_west_warehouse.jpg',
};

class StoryOrchestrator {
  constructor() {
    this.storyEngine = null;
    this.galleryPanel = null;
    this.renderer = null;
    this.board = null;
    this.AudioService = null;
    this.ScriptData = null;

    this._getCurrentLevelData = null;
    this._getCurrentChapterData = null;
    this._getCurrentLevelId = null;

    this._setUIVisible = null;
    this._setInteractionLocked = null;

    // 当前周目（新剧本《笼局·三岔口》仅单周目：沈墨视角）
    this._currentCycle = 1;
  }

  init(options) {
    this.storyEngine = options.storyEngine || null;
    this.galleryPanel = options.galleryPanel || null;
    this.renderer = options.renderer || null;
    this.board = options.board || null;
    this.AudioService = options.AudioService || null;
    this.ScriptData = options.ScriptData || null;

    this._getCurrentLevelData = options.getCurrentLevelData || (() => null);
    this._getCurrentChapterData = options.getCurrentChapterData || (() => null);
    this._getCurrentLevelId = options.getCurrentLevelId || (() => 0);

    this._setUIVisible = options.setUIVisible || (() => {});
    this._setInteractionLocked = options.setInteractionLocked || (() => {});

    log.info('StoryOrchestrator initialized');
  }

  setStoryEngine(eng) { this.storyEngine = eng; }
  setGalleryPanel(panel) { this.galleryPanel = panel; }
  setRenderer(r) { this.renderer = r; }
  setBoard(b) { this.board = b; }
  setScriptData(sd) { this.ScriptData = sd; }

  setCurrentCycle(cycleId) {
    this._currentCycle = cycleId;
    log.info('Current cycle set to:', cycleId);
  }

  getCurrentCycle() {
    return this._currentCycle;
  }

  // ============================================================
  //  剧本数据查找
  // ============================================================

  _getScriptPreDialog(levelId) {
    if (!this.ScriptData || !this.ScriptData.isLoaded()) return null;
    const dialog = this.ScriptData.getPreDialog(levelId);
    return dialog && dialog.length > 0 ? dialog : null;
  }

  _getScriptClearDialog(levelId) {
    if (!this.ScriptData || !this.ScriptData.isLoaded()) return null;
    const dialog = this.ScriptData.getClearDialog(levelId);
    return dialog && dialog.length > 0 ? dialog : null;
  }

  _getScriptPrologue(cycleId, chapterId) {
    if (!this.ScriptData || !this.ScriptData.isLoaded()) return null;
    const dialog = this.ScriptData.getChapterPrologue(cycleId, chapterId);
    return dialog && dialog.length > 0 ? dialog : null;
  }

  _getScriptEpilogue(cycleId, chapterId) {
    if (!this.ScriptData || !this.ScriptData.isLoaded()) return null;
    const dialog = this.ScriptData.getChapterEpilogue(cycleId, chapterId);
    return dialog && dialog.length > 0 ? dialog : null;
  }

  _getBestDialog(levelId, type) {
    if (type === 'pre') {
      const scriptDialog = this._getScriptPreDialog(levelId);
      if (scriptDialog) return scriptDialog;
    } else {
      const scriptDialog = this._getScriptClearDialog(levelId);
      if (scriptDialog) return scriptDialog;
    }
    const levelData = this._getCurrentLevelData();
    if (levelData) {
      const dialog = type === 'pre' ? levelData.preDialog : levelData.clearDialog;
      if (dialog && dialog.length > 0) return dialog;
    }
    return [];
  }

  // 获取最终对话（含道具分支前置插入）
  _getBranchDialog(levelId, type) {
    const base = this._getBestDialog(levelId, type);
    return this.buildPropBranchLines(levelId, base);
  }

  _getChapterBgm(levelId) {
    if (!this.ScriptData || !this.ScriptData.isLoaded()) return null;
    const ctx = this.ScriptData.getLevelScriptContext(levelId);
    if (!ctx) return null;
    return this.ScriptData.getChapterBgm(ctx.cycleId, ctx.chapterId);
  }

  // ============================================================
  //  图鉴解锁辅助
  // ============================================================

  unlockCharactersFromDialog(dialogLines) {
    if (!this.galleryPanel || !dialogLines || !Array.isArray(dialogLines)) return;
    dialogLines.forEach(line => {
      if (!line.speaker) return;
      const charId = NAME_TO_CHAR[line.speaker];
      if (charId) {
        this.galleryPanel.unlockCharacter(charId);
      }
    });
  }

  unlockBackgroundsFromDialog(dialogLines) {
    if (!this.galleryPanel || !dialogLines || !Array.isArray(dialogLines)) return;
    dialogLines.forEach(line => {
      if (line.bg) {
        this._unlockBackgroundPath(line.bg);
      }
    });
  }

  _unlockBackgroundPath(bgPath) {
    if (!this.galleryPanel || !bgPath) return;
    let bgName = bgPath;
    if (bgName.startsWith('assets/')) {
      bgName = bgName.substring(bgName.lastIndexOf('/') + 1);
    }
    this.galleryPanel.unlockBackground(bgName);
  }

  unlockBackground(bgPath) {
    this._unlockBackgroundPath(bgPath);
  }

  // ============================================================
  //  剧情播放编排
  // ============================================================

  playPreDialog(levelId) {
    return new Promise((resolve) => {
      const currentLevelId = levelId || this._getCurrentLevelId();
      const currentChapterData = this._getCurrentChapterData();

      if (!this.storyEngine) {
        resolve();
        return;
      }

      const preDialog = this._getBranchDialog(currentLevelId, 'pre');
      if (preDialog.length === 0) {
        resolve();
        return;
      }

      this.unlockCharactersFromDialog(preDialog);
      this.unlockBackgroundsFromDialog(preDialog);

      const chapterId = currentChapterData ? currentChapterData.chapterId
        // Q5 修复：onSelectLevel 在 startLevel 之前调用 playPreDialog，此时 CM.currentLevelId
        // 尚未设置 → getCurrentChapterData 返回 null → chapterId 回退 0 → 播放不存在的
        // chapter_0.mp3 报错。优先用 ScriptData 关卡上下文里的章节号。
        : (this.ScriptData && typeof this.ScriptData.getLevelScriptContext === 'function'
          ? ((this.ScriptData.getLevelScriptContext(currentLevelId) || {}).chapterId)
          : 0);
      this.storyEngine.setSceneKey('cycle' + this._currentCycle + '_ch' + chapterId + '_' + currentLevelId + '_pre');

      const hasBgInDialog = preDialog.some(line => line.bg);
      const hasCurrentBg = this.storyEngine._currentBg;
      if (!hasBgInDialog && !hasCurrentBg && CHAPTER_DEFAULT_BG[chapterId]) {
        this.storyEngine._changeBg(CHAPTER_DEFAULT_BG[chapterId]);
        this._unlockBackgroundPath(CHAPTER_DEFAULT_BG[chapterId]);
      }

      let bgm = this._getChapterBgm(currentLevelId);
      if (!bgm && this._currentCycle != null && chapterId != null) {
        // 2026-08-03 fallback：章节未配置 bgm 时统一用 chapter_{n}
        bgm = 'chapter_' + chapterId + '.mp3';
      }
      if (bgm && this.AudioService) {
        this.AudioService.bgm.playFile(bgm);
      }

      this._setUIVisible(false);
      this._setInteractionLocked(true);

      log.info('Playing pre-dialog (%d lines) from script data', preDialog.length);
      this.storyEngine.sayLines(preDialog, () => {
        this._setUIVisible(true);
        this._setInteractionLocked(false);
        if (this.galleryPanel) {
          this.galleryPanel.markSceneRead(chapterId, currentLevelId, 'pre');
        }
        resolve();
      });
    });
  }

  playPrologue(chapterId) {
    return new Promise((resolve) => {
      if (!this.storyEngine) {
        resolve();
        return;
      }

      let prologue = [];
      let actualChapterId = chapterId;

      // 如果传入了chapterId，直接从ScriptData获取
      if (chapterId != null && this.ScriptData && this.ScriptData.isLoaded()) {
        prologue = this.ScriptData.getChapterPrologue(this._currentCycle, chapterId);
      } else {
        // 否则从回调获取当前章节数据
        const currentChapterData = this._getCurrentChapterData();
        if (this.ScriptData && this.ScriptData.isLoaded()) {
          const cid = currentChapterData ? currentChapterData.chapterId : 0;
          actualChapterId = cid;
          prologue = this.ScriptData.getChapterPrologue(this._currentCycle, cid);
        }
        if (prologue.length === 0 && currentChapterData) {
          prologue = currentChapterData.prologue || currentChapterData.introStory || [];
        }
      }

      if (prologue.length === 0) {
        resolve();
        return;
      }

      this.unlockCharactersFromDialog(prologue);
      this.unlockBackgroundsFromDialog(prologue);

      this.storyEngine.setSceneKey('cycle' + this._currentCycle + '_ch' + actualChapterId + '_prologue');

      this._setUIVisible(false);

      if (this.ScriptData && this.ScriptData.isLoaded()) {
        const bgm = this.ScriptData.getChapterBgm(this._currentCycle, actualChapterId);
        // 2026-08-03 fallback：无配置时第1章楔子用 intro.mp3，其余章节用 chapter_{n}
        const fallbackBgm = (actualChapterId === 1)
          ? 'intro.mp3'
          : 'chapter_' + actualChapterId + '.mp3';
        const playBgm = bgm || fallbackBgm;
        if (playBgm && this.AudioService) {
          this.AudioService.bgm.playFile(playBgm);
        }
      } else if (this.AudioService) {
        this.AudioService.bgm.playFile('intro.mp3');
      }

      log.info('Playing prologue (%d lines) from script data', prologue.length);
      this.storyEngine.sayLines(prologue, () => {
        this._setUIVisible(true);
        this._setInteractionLocked(false);
        if (this.galleryPanel) {
          this.galleryPanel.markSceneRead(actualChapterId, 0, 'prologue');
        }
        resolve();
      });
    });
  }

  playClearDialog(callback) {
    const currentLevelId = this._getCurrentLevelId();
    const currentChapterData = this._getCurrentChapterData();

    if (!this.storyEngine) {
      if (callback) callback();
      return;
    }

    const clearDialog = this._getBranchDialog(currentLevelId, 'clear');
    if (clearDialog.length === 0) {
      if (callback) callback();
      return;
    }

    this.unlockCharactersFromDialog(clearDialog);
    this.unlockBackgroundsFromDialog(clearDialog);

    // 碎片收集：通关解锁对应关卡碎片（101-109 → 图鉴 9 枚）
    if (this.galleryPanel && typeof this.galleryPanel.unlockFragmentByLevel === 'function') {
      try {
        this.galleryPanel.unlockFragmentByLevel(currentLevelId);
      } catch (e) {
        log.warn('unlockFragmentByLevel error:', e);
      }
    }

    // 里程碑碎片：集齐前 N 枚 / 通关最终关 等里程碑触发额外碎片解锁
    if (this.galleryPanel && typeof this.galleryPanel.unlockMilestoneFragments === 'function') {
      try {
        const chId = currentChapterData ? currentChapterData.chapterId : 0;
        if (chId) this.galleryPanel.unlockMilestoneFragments(chId, currentLevelId);
      } catch (e) {
        log.warn('unlockMilestoneFragments error:', e);
      }
    }

    // 关键道具收集：通关解锁对应关卡道具（108 → 黄铜钥匙·编号3）
    if (this.galleryPanel && typeof this.galleryPanel.unlockKeyItemByLevel === 'function') {
      try {
        this.galleryPanel.unlockKeyItemByLevel(currentLevelId);
      } catch (e) {
        log.warn('unlockKeyItemByLevel error:', e);
      }
    }

    const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
    this.storyEngine.setSceneKey('cycle' + this._currentCycle + '_ch' + chapterId + '_' + currentLevelId + '_clear');

    this._setUIVisible(false);
    log.info('Playing clear dialog (%d lines) from script data', clearDialog.length);
    // v2.0：关后剧情跳过由长按触发（无跳过按钮），与开场/尾声统一
    this.storyEngine.sayLines(clearDialog, () => {
      this._setUIVisible(true);
      if (this.galleryPanel) {
        this.galleryPanel.markSceneRead(chapterId, currentLevelId, 'clear');
      }
      // 隐藏叙事：本章最后关卡通关且碎片集齐时，在通关对白后插播
      const isLastInChapter = currentChapterData && currentChapterData.levelIds &&
        Array.isArray(currentChapterData.levelIds) &&
        currentChapterData.levelIds[currentChapterData.levelIds.length - 1] === currentLevelId;
      if (isLastInChapter) {
        this.playChapterHiddenStory(chapterId, callback);
        return;
      }
      if (callback) callback();
    });
  }

  // ============================================================
  //  隐藏叙事（集齐本章碎片解锁）
  // ============================================================
  //  调用时机：本章最后一道关卡通关后。仅当该章碎片已集齐（9/9）
  //  且剧本中存在 hiddenStory 且尚未播放过时，才插播一段隐藏叙事。
  //  防重复：用 storyEngine 的 sceneKey 读取记录（..._hidden）判断。
  playChapterHiddenStory(chapterId, callback) {
    if (!this.storyEngine) { if (callback) callback(); return; }

    let hidden = [];
    if (this.ScriptData && this.ScriptData.isLoaded()) {
      hidden = this.ScriptData.getChapterHiddenStory(this._currentCycle, chapterId);
    }

    // 1) 无隐藏剧本 → 直接继续
    if (!hidden || hidden.length === 0) { if (callback) callback(); return; }

    // 2) 本章碎片未集齐 → 跳过
    if (!this.galleryPanel || typeof this.galleryPanel.hasAllChapterFragments !== 'function'
      || !this.galleryPanel.hasAllChapterFragments(chapterId)) {
      connectAndContinue();
      return;
    }

    // 3) 防重复：该隐藏叙事已读则不再播放
    const sceneKey = 'cycle' + this._currentCycle + '_ch' + chapterId + '_hidden';
    if (this.storyEngine.isSceneRead(sceneKey)) { if (callback) callback(); return; }

    log.info('Chapter %d hidden story unlocked (%d lines)', chapterId, hidden.length);
    this.unlockCharactersFromDialog(hidden);
    this.unlockBackgroundsFromDialog(hidden);

    this._setUIVisible(false);
    this.storyEngine.setSceneKey(sceneKey);
    this.storyEngine.sayLines(hidden, () => {
      this._setUIVisible(true);
      if (this.galleryPanel) {
        this.galleryPanel.markSceneRead(chapterId, 0, 'hidden');
      }
      if (callback) callback();
    });

    // 内部辅助：碎片未集齐时的兜底（保持一致的回调查用）
    function connectAndContinue() { if (callback) callback(); }
  }

  // ============================================================
  //  道具分支：持有特定关键道具时，向对话头部插入额外台词
  // ============================================================
  //  用于「持有道具触发额外对话分支」：在播放 pre/clear 对话前，
  //  依据当前持有道具查表，将对应的分支台词前置插入。
  //  实现约定：读过的关卡不再重复插入（用 ..._branch_<item> 场景键）。
  buildPropBranchLines(levelId, baseLines) {
    if (!this.galleryPanel || !this.ScriptData || !this.ScriptData.isLoaded()) return baseLines || [];
    baseLines = baseLines || [];

    // 关卡 → 触发分支所需道具 的映射（后续按剧本扩展）
    const PROP_BRANCH_BY_LEVEL = {
      // 例：持有 钥匙·编号4 时，第 501 关开场多一句台词
      // 501: { item: 'key4_94', lines: [...] }
    };

    const rule = PROP_BRANCH_BY_LEVEL[Number(levelId)];
    if (!rule || !rule.item || !rule.lines || rule.lines.length === 0) return baseLines;

    try {
      if (!this.galleryPanel.hasItem(rule.item)) return baseLines;
      const sceneKey = 'cycle' + this._currentCycle + '_ch' +
        (this._getCurrentChapterData() ? this._getCurrentChapterData().chapterId : 0) +
        '_' + levelId + '_branch_' + rule.item;
      if (this.storyEngine.isSceneRead(sceneKey)) return baseLines;

      // 前置插入分支台词
      const branchMapped = (this.ScriptData.mapLines ? this.ScriptData.mapLines(rule.lines) : rule.lines);
      return branchMapped.concat(baseLines);
    } catch (e) {
      log.warn('buildPropBranchLines error:', e);
      return baseLines;
    }
  }

  playChapterEpilogue(callback) {
    const currentChapterData = this._getCurrentChapterData();

    if (!this.storyEngine) {
      if (callback) callback();
      return;
    }

    let epilogue = [];

    if (this.ScriptData && this.ScriptData.isLoaded()) {
      const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
      epilogue = this.ScriptData.getChapterEpilogue(this._currentCycle, chapterId);
    }

    if (epilogue.length === 0 && currentChapterData) {
      epilogue = currentChapterData.epilogue || currentChapterData.endingStory || [];
    }

    if (epilogue.length === 0) {
      if (callback) callback();
      return;
    }

    this.unlockCharactersFromDialog(epilogue);
    this.unlockBackgroundsFromDialog(epilogue);

    const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
    this.storyEngine.setSceneKey('cycle' + this._currentCycle + '_ch' + chapterId + '_epilogue');

    const overlay = document.getElementById('complete-overlay');
    if (overlay) overlay.style.display = 'none';
    this._setUIVisible(false);

    log.info('Playing chapter epilogue (%d lines) from script data', epilogue.length);
    this.storyEngine.sayLines(epilogue, () => {
      if (this.galleryPanel) {
        this.galleryPanel.markSceneRead(chapterId, 0, 'epilogue');
      }
      if (callback) callback();
    });
  }

  // ============================================================
  //  首次技巧教学对话
  // ============================================================

  playFirstEncounterTeaching(dialogLines, characterId, techniqueName, targetCells) {
    if (!this.storyEngine || !dialogLines || dialogLines.length === 0) return;

    log.info('Playing first encounter teaching:', techniqueName, characterId);

    this._setInteractionLocked(true);
    this._showTeachingBadge(techniqueName);

    const shortLines = dialogLines.slice(0, Math.min(3, dialogLines.length));

    setTimeout(() => {
      const currentChapterData = this._getCurrentChapterData();
      const currentLevelId = this._getCurrentLevelId();
      const chapterId = currentChapterData ? currentChapterData.chapterId : 0;
      const techKey = (techniqueName || 'unknown').replace(/\s+/g, '_');
      this.storyEngine.setSceneKey('cycle' + this._currentCycle + '_ch' + chapterId + '_' + currentLevelId + '_tech_' + techKey);

      this.storyEngine.sayLines(shortLines, () => {
        if (this.renderer && typeof this.renderer.clearHintHighlights === 'function') {
          this.renderer.clearHintHighlights('hint');
          if (targetCells && targetCells.length > 0 && typeof this.renderer.highlightHintCells === 'function') {
            this.renderer.highlightHintCells(targetCells, 'hint', 'hint');
          }
          this.renderer.render(this.board);
        }
        this._setInteractionLocked(false);
        log.info('First encounter teaching complete:', techniqueName);
      });
    }, 800);
  }

  _showTeachingBadge(techniqueName) {
    const badge = document.createElement('div');
    // P2：新技巧发现徽章 = 朱砂印章卡（去毛玻璃/金色霓虹）
    badge.style.cssText = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%) scale(0.8);' +
      'background-color:#f5f0e0;' +
      'background-image:repeating-linear-gradient(45deg, rgba(200,190,170,0.04) 0px, rgba(200,190,170,0.04) 1px, transparent 1px, transparent 3px);' +
      'border:2px solid #a3352a;border-radius:8px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.3), inset 0 0 18px rgba(120,100,70,0.15);' +
      'padding:20px 40px;z-index:9998;text-align:center;' +
      'opacity:0;transition:all 0.5s cubic-bezier(0.4,0,0.2,1);' +
      'pointer-events:none;';
    badge.innerHTML =
      '<div style="font-size:12px;color:#a3352a;letter-spacing:4px;margin-bottom:8px;font-weight:700;">✦ 新技巧发现 ✦</div>' +
      '<div style="font-size:24px;font-weight:700;color:#3d2a1a;font-family:\'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif;">' +
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

  // ============================================================
  //  涂黑文字手动触发（第12/13句）
  // ============================================================

  /**
   * 内部：通过 InkText 模块解锁并显示涂黑文字揭示动画
   * @param {number} id - 句子 id
   * @param {string} flagKey - 防重复标记的 key（如 '_line12Triggered'）
   */
  _showTimeline(id, flagKey) {
    const CM = window.CM || {};
    // 防重复
    if (CM[flagKey]) return;
    CM[flagKey] = true;

    if (!CM.inkText) {
      log.warn('_showTimeline: CM.inkText not available');
      return;
    }

    // 解锁
    const sentence = CM.inkText.unlock(id);
    if (!sentence) {
      log.warn('_showTimeline: sentence %d already unlocked or not found', id);
      return;
    }

    log.info('_showTimeline: unlocked sentence %d', id);

    // 显示揭示动画
    CM.inkText.showReveal(sentence, () => {
      log.info('_showTimeline: reveal animation complete for sentence %d', id);
    });
  }

  /**
   * 第12句触发：三周目进入游戏时
   * 条件：this._currentCycle === 3
   */
  triggerLine12() {
    if (this._currentCycle !== 3) return;
    this._showTimeline(12, '_line12Triggered');
  }

  /**
   * 第13句触发：三周目全部完成后
   * 条件：this._currentCycle === 3
   */
  triggerLine13() {
    if (this._currentCycle !== 3) return;
    this._showTimeline(13, '_line13Triggered');
  }
}

export default new StoryOrchestrator();