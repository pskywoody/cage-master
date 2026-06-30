// ==========================================
// 笼的暗号 - 喜剧桥段触发系统
// ==========================================
// 一本正经地胡说八道：守笼人毒舌/设局人打脸/阿岩吐槽
// 在三个节点触发：填错失败 / Boss战 / 通关结算
// ==========================================

const ComedySystem = {
  // ---------- 状态 ----------
  state: {
    consecutiveWrong: 0,        // 连续填错次数
    totalWrong: 0,              // 本局总错误
    totalCorrect: 0,            // 本局总正确
    hintsUsed: 0,               // 使用提示次数
    resets: 0,                  // 重置次数
    levelId: null,              // 当前关卡ID
    levelMode: 'free',          // free/guide/battle
    isBossLevel: false,         // 是否Boss关
    startTime: 0,               // 本局开始时间
    lastActionTime: 0,          // 上次操作时间
    idleTimer: null,            // 闲置计时器
    idleStage: 0,               // 闲置阶段(0-5)
    wrongCellsThisTurn: new Set(), // 本轮填错格子(避免同一错误重复计数)
    tripleWrongCells: new Set(),   // 三个不同格子都填错的彩蛋检测
    cheatSheetUsed: false,      // 是否使用过小抄
    cheatSheetOpens: 0,         // 小抄打开次数
    nakedPairWrongCount: 0,     // 并蒂锁关连续出错
    lastKeeperLineTime: 0,      // 守笼人上次说话时间(防刷屏)
    lastTriggerKey: null,       // 上次触发的台词key(防重复)
    perfectRun: true,           // 是否0失误
    fastClearThreshold: 60,     // Boss战速通阈值(秒)
    levelCompleted: false,
  },

  // ---------- 初始化 ----------
  init(options = {}) {
    this.state.levelId = options.levelId || null;
    this.state.levelMode = options.mode || 'free';
    this.state.isBossLevel = options.isBoss || false;
    this.state.startTime = Date.now();
    this.state.lastActionTime = Date.now();
    this.state.consecutiveWrong = 0;
    this.state.totalWrong = 0;
    this.state.totalCorrect = 0;
    this.state.hintsUsed = 0;
    this.state.resets = 0;
    this.state.idleStage = 0;
    this.state.wrongCellsThisTurn.clear();
    this.state.tripleWrongCells.clear();
    this.state.cheatSheetUsed = false;
    this.state.cheatSheetOpens = 0;
    this.state.nakedPairWrongCount = 0;
    this.state.lastKeeperLineTime = 0;
    this.state.lastTriggerKey = null;
    this.state.perfectRun = true;
    this.state.levelCompleted = false;
    this._ensureBubbleContainer();
    this._startIdleTimer();
  },

  // ---------- 台词气泡容器（非Story模式的轻量气泡） ----------
  _ensureBubbleContainer() {
    if (document.getElementById('comedy-bubble-container')) return;
    const container = document.createElement('div');
    container.id = 'comedy-bubble-container';
    container.style.cssText = [
      'position:fixed', 'top:80px', 'right:20px', 'z-index:400',
      'display:flex', 'flex-direction:column', 'gap:10px',
      'pointer-events:none', 'max-width:320px'
    ].join(';');
    document.body.appendChild(container);
  },

  // ---------- 轻量气泡显示（类似battle模式的showDialogue） ----------
  _showBubble(speaker, text, color, emoji) {
    // 防刷屏：同一句话3秒内不重复
    const now = Date.now();
    if (now - this.state.lastKeeperLineTime < 2500) return;
    if (this.state.lastTriggerKey === text && now - this.state.lastKeeperLineTime < 8000) return;
    this.state.lastKeeperLineTime = now;
    this.state.lastTriggerKey = text;

    this._ensureBubbleContainer();
    const container = document.getElementById('comedy-bubble-container');

    const bubble = document.createElement('div');
    bubble.className = 'comedy-bubble';
    bubble.style.cssText = [
      'background:' + color,
      'color:#fff', 'padding:12px 16px', 'border-radius:16px',
      'font-size:14px', 'line-height:1.6',
      'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
      'animation:comedyBubbleIn 0.4s ease-out',
      'position:relative', 'pointer-events:auto', 'cursor:pointer',
      'max-width:320px', 'word-break:break-word'
    ].join(';');

    bubble.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:8px;">
        <span style="font-size:24px;flex-shrink:0;line-height:1;">${emoji}</span>
        <div>
          <div style="font-weight:bold;font-size:12px;opacity:0.85;margin-bottom:3px;">${speaker}</div>
          <div>${text}</div>
        </div>
      </div>
    `;

    // 点击立即消失
    bubble.addEventListener('click', () => this._removeBubble(bubble));

    container.appendChild(bubble);

    // 最多同时3个气泡
    while (container.children.length > 3) {
      container.removeChild(container.firstChild);
    }

    // 自动移除
    const duration = text.length > 40 ? 6000 : 4500;
    setTimeout(() => this._removeBubble(bubble), duration);
  },

  _removeBubble(bubble) {
    if (!bubble.parentNode) return;
    bubble.style.animation = 'comedyBubbleOut 0.3s ease-in forwards';
    setTimeout(() => { if (bubble.parentNode) bubble.parentNode.removeChild(bubble); }, 300);
  },

  // ---------- 守笼人说话（毒舌师傅） ----------
  keeperSays(key) {
    const lines = this._t('comedy.keeper.' + key);
    if (!lines || !lines.length) return;
    const line = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
    this._showBubble('守笼人', line, 'linear-gradient(135deg,#6366f1,#4f46e5)', '🧙');
  },

  // ---------- 设局人说话（Boss战打脸） ----------
  setterSays(key, extra) {
    const lines = this._t('comedy.setter.' + key);
    if (!lines || !lines.length) return;
    const line = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
    // 如果是guide-battle环境，使用boss对话系统；否则用通用气泡
    if (typeof window._bossSay === 'function') {
      window._bossSay(line);
    } else {
      this._showBubble('设局人', line, 'linear-gradient(135deg,#dc2626,#991b1b)', '🎭');
    }
    // 系统提示
    if (extra && extra.systemMsg) {
      setTimeout(() => this._systemMsg(extra.systemMsg), 800);
    }
  },

  // ---------- 阿岩说话（活泼小徒弟） ----------
  ayanSays(key) {
    const lines = this._t('comedy.ayan.' + key);
    if (!lines || !lines.length) return;
    const line = Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines;
    if (typeof window._ayanSay === 'function') {
      window._ayanSay(line);
    } else {
      this._showBubble('阿岩', line, 'linear-gradient(135deg,#22c55e,#15803d)', '🍃');
    }
  },

  // ---------- 系统提示 ----------
  _systemMsg(text) {
    this._ensureBubbleContainer();
    const container = document.getElementById('comedy-bubble-container');
    const msg = document.createElement('div');
    msg.style.cssText = [
      'background:rgba(139,92,246,0.9)', 'color:#fff',
      'padding:8px 14px', 'border-radius:12px', 'font-size:12px',
      'text-align:center', 'animation:comedyBubbleIn 0.4s ease-out',
      'box-shadow:0 2px 8px rgba(139,92,246,0.4)'
    ].join(';');
    msg.textContent = text;
    container.appendChild(msg);
    setTimeout(() => {
      msg.style.animation = 'comedyBubbleOut 0.3s ease-in forwards';
      setTimeout(() => { if (msg.parentNode) msg.parentNode.removeChild(msg); }, 300);
    }, 5000);
  },

  // ---------- StoryModal 大段对话（重要剧情用） ----------
  _storyDialogue(dialogues, onDone) {
    if (typeof window.StoryModal !== 'undefined' && window.StoryModal) {
      window.StoryModal.show(dialogues, onDone);
    } else {
      // fallback: 依次弹气泡
      let i = 0;
      const next = () => {
        if (i >= dialogues.length) { if (onDone) onDone(); return; }
        const d = dialogues[i++];
        const charMap = {
          '守笼人': { color: 'linear-gradient(135deg,#6366f1,#4f46e5)', emoji: '🧙' },
          '设局人': { color: 'linear-gradient(135deg,#dc2626,#991b1b)', emoji: '🎭' },
          '阿岩': { color: 'linear-gradient(135deg,#22c55e,#15803d)', emoji: '🍃' },
          '系统': { color: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', emoji: '📢' }
        };
        const ch = charMap[d.character] || charMap['守笼人'];
        this._showBubble(d.character, d.text, ch.color, ch.emoji);
        setTimeout(next, 3000);
      };
      next();
    }
  },

  // ---------- i18n 辅助 ----------
  _t(key) {
    if (typeof window !== 'undefined' && window.I18N && typeof window.I18N.getRaw === 'function') {
      return window.I18N.getRaw(key);
    }
    if (typeof window !== 'undefined' && window.t) {
      // t()对数组返回key，需fallback到深层查找
      const parts = key.split('.');
      let obj = (window.I18N && window.I18N.messages) || null;
      for (const part of parts) {
        if (obj && typeof obj === 'object' && part in obj) obj = obj[part];
        else { obj = null; break; }
      }
      return obj;
    }
    return null;
  },

  // ---------- 事件：填对 ----------
  onCorrect(r, c, num) {
    this.state.lastActionTime = Date.now();
    this.state.totalCorrect++;
    this.state.consecutiveWrong = 0;
    this.state.wrongCellsThisTurn.clear();
    this._resetIdleTimer();
  },

  // ---------- 事件：填错 ----------
  onWrong(r, c, num) {
    this.state.lastActionTime = Date.now();
    this.state.totalWrong++;
    this.state.consecutiveWrong++;
    this.state.perfectRun = false;
    this._resetIdleTimer();

    const cellKey = `${r},${c}`;
    if (!this.state.wrongCellsThisTurn.has(cellKey)) {
      this.state.wrongCellsThisTurn.add(cellKey);
      this.state.tripleWrongCells.add(cellKey);
    }

    // 连续填错触发
    const cw = this.state.consecutiveWrong;
    if (cw === 3) {
      this.keeperSays('mistake3');
    } else if (cw === 5) {
      this.keeperSays('mistake5');
    } else if (cw >= 7 && cw % 2 === 1) {
      // 7次以后每2次说一句
      const pool = ['mistake7', 'selfDestruct'];
      this.keeperSays(pool[Math.floor(Math.random() * pool.length)]);
    }

    // 三个不同格子都填错（5%概率彩蛋）
    if (this.state.tripleWrongCells.size >= 3 && Math.random() < 0.05) {
      this.keeperSays('tripleWrong');
      this.state.tripleWrongCells.clear();
    }
  },

  // ---------- 事件：使用提示 ----------
  onHint(hintLevel) {
    this.state.hintsUsed++;
    this.state.lastActionTime = Date.now();
    this._resetIdleTimer();
  },

  // ---------- 事件：提示后还错 ----------
  onHintThenWrong() {
    this.keeperSays('hintUsedThenWrong');
  },

  // ---------- 事件：删除/擦除 ----------
  onErase(r, c) {
    this.state.lastActionTime = Date.now();
    this._resetIdleTimer();
  },

  // ---------- 事件：重置关卡 ----------
  onReset() {
    this.state.resets++;
    this.state.lastActionTime = Date.now();
    this.state.consecutiveWrong = 0;
    this.state.wrongCellsThisTurn.clear();
    this._resetIdleTimer();
    // 彩蛋：解出答案后立刻重置
    if (this._nearlyComplete() && Math.random() < 0.02) {
      setTimeout(() => this.keeperSays('solveThenReset'), 500);
    }
  },

  _nearlyComplete() {
    if (typeof gameBoard === 'undefined') return false;
    let filled = 0;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (gameBoard.cells[r][c].fillNum || gameBoard.cells[r][c].fixedNum) filled++;
    return filled >= 75;
  },

  // ---------- 事件：删除唯一候选(自绝后路) ----------
  onDeleteOnlySolution() {
    this.keeperSays('deleteOnlySolution');
  },

  // ---------- 事件：候选数死局 ----------
  onCandidateDeadend() {
    if (Math.random() < 0.3) this.keeperSays('selfDestruct');
  },

  // ---------- 事件：孤星关填错 ----------
  onLoneStarWrong() {
    if (Math.random() < 0.4) this.keeperSays('loneStarWrong');
  },

  // ---------- 事件：并蒂锁关出错 ----------
  onNakedPairWrong() {
    this.state.nakedPairWrongCount++;
    if (this.state.nakedPairWrongCount === 1) {
      this.keeperSays('nakedPairWrong');
    } else if (this.state.nakedPairWrongCount >= 3 && Math.random() < 0.08) {
      this.keeperSays('nakedPairHate');
    }
  },

  // ---------- 事件：二连纵横阵出错 ----------
  onXwingWrong() {
    if (Math.random() < 0.3) this.keeperSays('xwingWrong');
  },

  // ---------- 事件：三才游鱼阵出错 ----------
  onSwordfishWrong() {
    if (Math.random() < 0.3) this.keeperSays('swordfishWrong');
  },

  // ---------- 闲置计时器 ----------
  _startIdleTimer() {
    this._stopIdleTimer();
    this.state.idleTimer = setInterval(() => this._checkIdle(), 5000);
  },

  _stopIdleTimer() {
    if (this.state.idleTimer) {
      clearInterval(this.state.idleTimer);
      this.state.idleTimer = null;
    }
  },

  _resetIdleTimer() {
    this.state.idleStage = 0;
    this._startIdleTimer();
  },

  _checkIdle() {
    if (this.state.levelCompleted) return;
    const idle = (Date.now() - this.state.lastActionTime) / 1000;
    const stages = [
      { at: 30, stage: 1, key: 'idle30' },
      { at: 60, stage: 2, key: 'idle60' },
      { at: 90, stage: 3, key: 'idle90' },
      { at: 120, stage: 4, key: 'idle120' },
      { at: 180, stage: 5, key: 'idle180' },
      { at: 300, stage: 6, key: 'idle300' }
    ];
    for (const s of stages) {
      if (idle >= s.at && this.state.idleStage < s.stage) {
        this.state.idleStage = s.stage;
        this.keeperSays(s.key);
        // 10分钟彩蛋：蹭BGM
        if (s.at === 300 && Math.random() < 0.15) {
          setTimeout(() => this.keeperSays('bgmLover'), 3000);
        }
        // 5分钟吐槽策划
        if (s.at === 300 && this.state.levelMode === 'guide' && Math.random() < 0.2) {
          setTimeout(() => this.keeperSays('tooHardForPlanner'), 6000);
        }
        break;
      }
    }
  },

  // ---------- 计算星级评分 ----------
  calculateStars(elapsedSec, mistakes, expectedSec) {
    const ratio = elapsedSec / expectedSec;
    let stars = 1;
    let grade = 'C';
    if (ratio < 0.4 && mistakes === 0) { stars = 3; grade = 'SSS'; }
    else if (ratio < 0.7 && mistakes <= 3) { stars = 3; grade = 'S'; }
    else if (ratio <= 1.0 && mistakes <= 5) { stars = 3; grade = 'A'; }
    else if (ratio <= 1.5 || mistakes <= 8) { stars = 2; grade = 'B'; }
    else { stars = 1; grade = 'C'; }
    return { stars, grade, ratio };
  },

  // ---------- 事件：通关 ----------
  onComplete(options = {}) {
    this.state.levelCompleted = true;
    this._stopIdleTimer();

    const elapsed = (Date.now() - this.state.startTime) / 1000;
    const expected = options.expectedSec || this._estimateExpectedTime();
    const mistakes = this.state.totalWrong;
    const { stars, grade, ratio } = this.calculateStars(elapsed, mistakes, expected);

    // 延迟一点显示评语，让通关动画先播
    setTimeout(() => {
      this._showGradeComment(grade, stars, { elapsed, mistakes, ratio, expected });
    }, 1200);

    return { stars, grade, elapsed, mistakes };
  },

  _estimateExpectedTime() {
    // 根据关卡类型估算基准时间
    if (this.state.levelMode === 'guide') {
      const id = String(this.state.levelId || '');
      if (id.startsWith('1')) return 120;   // 第1章4x4
      if (id.startsWith('2')) return 240;   // 第2章6x6
      return 420;                            // 第3-7章9x9
    }
    return 360; // 自由模式默认6分钟
  },

  _showGradeComment(grade, stars, stats) {
    const isFirstClear = !this._hasCleared();
    const usedAllHints = this.state.hintsUsed >= 3;
    const speedrun = stats.ratio < 0.3;
    const bossWin = this.state.isBossLevel;

    let commentKey = 'grade' + grade;

    // 特殊评语覆盖
    if (speedrun && stats.mistakes === 0) {
      commentKey = 'tooFast';
    } else if (stats.mistakes === 0 && grade !== 'SSS') {
      commentKey = 'perfectClear';
    } else if (usedAllHints) {
      commentKey = 'allHintsUsed';
    } else if (isFirstClear) {
      commentKey = 'firstClear';
    } else if (bossWin) {
      commentKey = 'bossDefeated';
    }

    this.keeperSays(commentKey);
  },

  _hasCleared() {
    try {
      if (typeof Storage !== 'undefined' && Storage.isLevelComplete) {
        return Storage.isLevelComplete(this.state.levelId);
      }
    } catch(e) {}
    return false;
  },

  // ---------- Boss战专用 ----------
  onBossStart(isHard) {
    setTimeout(() => {
      this.setterSays(isHard ? 'bossIntroHard' : 'bossIntroNormal');
    }, 800);
  },

  onBossWin(elapsedSec, mistakes) {
    const fast = elapsedSec < 60;
    const perfect = mistakes === 0;

    setTimeout(() => {
      if (perfect) {
        this.setterSays('perfectClear');
      } else if (fast) {
        this.setterSays('fastClear', { systemMsg: this._t('comedy.system.bossRetractFail') });
        setTimeout(() => this.ayanSays('bossSpeedrun'), 3500);
      } else if (elapsedSec > 300) {
        this.setterSays('slowClear', { systemMsg: this._t('comedy.system.bossLearned') });
      } else {
        this.setterSays('fastClear');
      }
    }, 1500);

    setTimeout(() => {
      this.ayanSays(Math.random() < 0.5 ? 'bossWin' : 'bossGone');
    }, 4500);
  },

  onBossHintUsed() {
    this.setterSays('usedHint');
  },

  // Boss战中使用孤星技巧彩蛋
  onBossLoneStarUsed() {
    if (Math.random() < 0.03) {
      setTimeout(() => this.setterSays('loneStarUsed'), 2000);
    }
  },

  // 连5关S级以上彩蛋（静态方法，在ComedySystem对象外挂载）

  // ---------- 小抄系统 ----------
  showCheatSheet(container) {
    // 创建小抄UI
    let sheet = document.getElementById('cheat-sheet-widget');
    if (sheet) {
      sheet.style.display = 'block';
      return;
    }

    sheet = document.createElement('div');
    sheet.id = 'cheat-sheet-widget';
    sheet.innerHTML = `
      <div class="cheat-sheet-scroll" id="cheat-sheet-scroll">
        <div class="cheat-sheet-header" id="cheat-sheet-header">
          📜 <span data-i18n="comedy.cheatSheet.title">作弊小抄</span>
          <span class="cheat-sheet-hint" data-i18n="comedy.cheatSheet.clickToExpand">（点击展开）</span>
        </div>
        <div class="cheat-sheet-body" id="cheat-sheet-body" style="display:none;">
          <div class="cheat-sheet-formula" id="cheat-sheet-formula">
            三取一二　四取一三<br>六取二四　七取三四
          </div>
          <div class="cheat-sheet-footer" id="cheat-sheet-footer" data-i18n="comedy.cheatSheet.autoCollapse">（5秒后自动收起）</div>
        </div>
      </div>
    `;

    const targetContainer = container || document.body;
    if (targetContainer === document.body) {
      sheet.style.cssText = 'position:fixed;top:70px;left:16px;z-index:350;';
    }
    targetContainer.appendChild(sheet);

    const header = sheet.querySelector('#cheat-sheet-header');
    const body = sheet.querySelector('#cheat-sheet-body');
    let expanded = false;
    let collapseTimer = null;

    header.addEventListener('click', () => {
      expanded = !expanded;
      body.style.display = expanded ? 'block' : 'none';
      this.state.cheatSheetOpens++;
      if (this.state.cheatSheetOpens === 1) {
        this.state.cheatSheetUsed = true;
        setTimeout(() => this.keeperSays('cheatSheetComplaint'), 500);
      } else if (this.state.cheatSheetOpens >= 3 && Math.random() < 0.3) {
        this.keeperSays('cheatSheetAgain');
      }

      if (expanded) {
        clearTimeout(collapseTimer);
        collapseTimer = setTimeout(() => {
          body.style.display = 'none';
          expanded = false;
          if (Math.random() < 0.15) this.keeperSays('cheatSheetClosed');
        }, 5000);
      }
    });

    return sheet;
  },

  // 第104关教学小抄场景（StoryModal对话）
  showCheatSheetStory(onDone) {
    const dlg = (ch, txt) => ({ character: ch, text: txt });
    this._storyDialogue([
      dlg('守笼人', this._t('comedy.keeper.memorizeMnemonic') || '这四句口诀，乃老夫毕生心血所聚，你要铭记于心——三取一二，四取一三，六取二四，七取三四。'),
      dlg('守笼人', this._t('comedy.keeper.mnemonicTooLong') || '怎么？没记住？'),
      dlg('守笼人', this._t('comedy.keeper.cheatSheetGive') || '……给你。'),
      dlg('系统', this._t('comedy.system.cheatSheetGet') || '【系统提示】获得道具【作弊小抄·卷轴】')
    ], () => {
      // 显示小抄组件
      this.showCheatSheet();
      setTimeout(() => this.keeperSays('cheatSheetComplaint'), 1000);
      if (onDone) onDone();
    });
  },

  // 小抄教学：正确使用反馈
  onCheatSheetCorrect(streak) {
    if (streak === 1) {
      this.keeperSays('cheatSheetGood');
    } else if (streak >= 5) {
      this.keeperSays('cheatSheetStreak5');
    }
  },
  onCheatSheetWrong() {
    this.keeperSays('cheatSheetBad');
  },
  onCheatSheetComplete() {
    this.keeperSays('cheatSheetComplete');
  },

  // ---------- 销毁 ----------
  destroy() {
    this._stopIdleTimer();
    const container = document.getElementById('comedy-bubble-container');
    if (container) container.innerHTML = '';
  }
};

// 注入CSS动画
(function injectCSS() {
  if (document.getElementById('comedy-system-css')) return;
  const style = document.createElement('style');
  style.id = 'comedy-system-css';
  style.textContent = `
    @keyframes comedyBubbleIn {
      0% { opacity: 0; transform: translateX(40px) scale(0.8); }
      60% { opacity: 1; transform: translateX(-5px) scale(1.02); }
      100% { opacity: 1; transform: translateX(0) scale(1); }
    }
    @keyframes comedyBubbleOut {
      0% { opacity: 1; transform: translateX(0) scale(1); }
      100% { opacity: 0; transform: translateX(40px) scale(0.8); }
    }
    .comedy-bubble:hover {
      transform: scale(1.03);
      transition: transform 0.2s;
    }

    /* 小抄卷轴样式 */
    #cheat-sheet-widget {
      font-family: 'Noto Serif SC', 'STKaiti', 'KaiTi', serif;
      pointer-events: auto;
    }
    .cheat-sheet-scroll {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%);
      border: 2px solid #d97706;
      border-radius: 8px;
      padding: 8px 14px;
      box-shadow: 0 4px 12px rgba(180,83,9,0.3), inset 0 0 20px rgba(255,255,255,0.5);
      cursor: pointer;
      max-width: 220px;
      position: relative;
    }
    .cheat-sheet-scroll::before,
    .cheat-sheet-scroll::after {
      content: '📜';
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      font-size: 16px;
    }
    .cheat-sheet-scroll::before { left: -14px; }
    .cheat-sheet-scroll::after { right: -14px; transform: translateY(-50%) scaleX(-1); }
    .cheat-sheet-header {
      font-size: 13px;
      font-weight: bold;
      color: #92400e;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cheat-sheet-hint {
      font-size: 10px;
      font-weight: normal;
      color: #b45309;
      opacity: 0.7;
    }
    .cheat-sheet-body {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #d97706;
    }
    .cheat-sheet-formula {
      font-size: 16px;
      font-weight: bold;
      color: #78350f;
      text-align: center;
      line-height: 1.8;
      letter-spacing: 2px;
    }
    .cheat-sheet-footer {
      font-size: 10px;
      color: #b45309;
      text-align: center;
      margin-top: 6px;
      opacity: 0.7;
    }
    .cheat-sheet-scroll:hover {
      box-shadow: 0 6px 20px rgba(180,83,9,0.4);
      transform: translateY(-1px);
      transition: all 0.2s;
    }

    /* 结算评语区 */
    .complete-comment {
      background: linear-gradient(135deg, #eef2ff, #e0e7ff);
      border-left: 4px solid #6366f1;
      border-radius: 12px;
      padding: 14px 16px;
      margin: 16px 0;
      position: relative;
    }
    .complete-comment-speaker {
      font-size: 12px;
      font-weight: bold;
      color: #4f46e5;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .complete-comment-text {
      font-size: 14px;
      color: #312e81;
      line-height: 1.7;
    }
    .complete-grade-badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 20px;
      margin: 8px 0;
    }
    .grade-SSS { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    .grade-S { background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; }
    .grade-A { background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; }
    .grade-B { background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; }
    .grade-C { background: linear-gradient(135deg, #94a3b8, #64748b); color: #fff; }

    .complete-stars {
      font-size: 28px;
      margin: 8px 0;
      letter-spacing: 4px;
    }
    .complete-stars .star-on { color: #f59e0b; text-shadow: 0 0 8px rgba(245,158,11,0.5); }
    .complete-stars .star-off { color: #d1d5db; }
  `;
  document.head.appendChild(style);
})();

if (typeof window !== 'undefined') {
  window.ComedySystem = ComedySystem;
}

// 连5关S级以上彩蛋（静态工具方法）
ComedySystem.__sGradeStreak = 0;
ComedySystem.onSGradeStreak = function(grade) {
  if (grade === 'S' || grade === 'SSS') {
    ComedySystem.__sGradeStreak++;
    if (ComedySystem.__sGradeStreak >= 5 && Math.random() < 0.05) {
      setTimeout(() => ComedySystem.setterSays('streak5S'), 2000);
      ComedySystem.__sGradeStreak = 0;
    }
  } else {
    ComedySystem.__sGradeStreak = 0;
  }
};

if (typeof module !== 'undefined') {
  module.exports = ComedySystem;
}
