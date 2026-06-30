/**
 * 教学模式章末Boss战系统 — 幽灵迷雾 v1.0
 *
 * 核心规则：
 * - 同盘竞速：玩家和AI在同一棋盘上解题
 * - 幽灵格：AI填的格子显示为淡色色块（不显示数字）
 * - 抢格子：玩家可以填AI已填的格子，抢过来变成自己的
 * - 迷雾系统：玩家只能看到距离自己已填格子≤2（曼哈顿距离）范围内的AI幽灵
 * - 胜负判定：先填到总空格数75%的赢
 * - 终局预警：到60%时屏幕边缘发红+角色台词
 * - 遭遇事件：AI从四个方向接近时触发不同强度的反馈
 */

const GuideBattle = {
  // ========== 状态 ==========
  active: false,
  ended: false,
  result: null,       // 'win' | 'lose' | null
  raceStarted: false,

  // 对手配置
  opponent: null,

  // 棋盘基础数据
  solution: null,
  initialBoard: null,
  size: 9,
  fixedMask: null,    // 题目预填数字（不算任何一方）

  // 归属：谁填了哪个格子
  aiOwned: null,      // 2D: 0=未被AI填, 数字=AI填了且未被抢
  playerOwned: null,  // 2D: 0=玩家没填, 数字=玩家填了（包括抢来的）
  aiCount: 0,
  playerCount: 0,
  totalEmpty: 0,
  winTarget: 0,       // 75%的格子数

  // AI填数顺序
  aiOrder: [],
  aiIndex: 0,
  aiTimer: null,
  aiStartDelay: 1500,   // 开赛1.5秒后AI开始（给玩家抢先起步的窗口）

  // 迷雾系统
  visionRange: 1,     // 视野范围（曼哈顿距离），启动时根据盘面大小自适应
  visible: null,      // 2D boolean: 该格子是否在玩家视野内
  fogOpacity: null,   // 2D float: 迷雾透明度（动画用，0=清晰，1=全雾）
  aiPulse: null,      // 2D float: AI填格脉冲动画（0→1衰减）
  ghostFlicker: 0,    // 幽灵格呼吸动画时间

  // 引导提示系统
  shownTips: null,    // Set: 已显示过的提示id
  tipTimers: null,    // 提示定时器列表

  // 抢格子动画
  stealFlash: null,   // 2D float: 抢格子闪光动画进度（0=无，1=最亮）
  stealFlashTime: 400, // ms

  // 60%预警
  warning60Shown: { ai: false, player: false },
  warningEdge: null,  // DOM元素：屏幕边缘红光

  // 遭遇事件系统
  encounterTriggered: null, // 2D: 每个方向每个距离档是否已触发 {up:{far,mid,near}, down:..., left:..., right:...}
  lastEncounterCheck: 0,    // 上次检测遭遇的时间戳

  // 回调
  onEnd: null,
  onEvent: null,      // 事件回调 (type, data) — 用于遭遇事件、预警等通知guide.js播台词/震动

  // DOM缓存
  dom: null,

  // ========== 启动 ==========
  start(config) {
    if (this.active) {
      console.warn('⚠️ Boss战已在进行中');
      return;
    }

    if (!config.solution || !config.initialBoard) {
      console.error('❌ Boss战启动失败：缺少solution或initialBoard');
      return;
    }

    this.active = true;
    this.ended = false;
    this.result = null;
    this.raceStarted = false;
    this.warning60Shown = { ai: false, player: false };
    this.encounterTriggered = {
      up: { far: false, mid: false, near: false },
      down: { far: false, mid: false, near: false },
      left: { far: false, mid: false, near: false },
      right: { far: false, mid: false, near: false }
    };
    this.lastEncounterCheck = 0;

    this.solution = config.solution;
    this.initialBoard = config.initialBoard;
    this.size = config.size || 9;

    // 根据盘面大小自适应视野范围（4x4用1格避免全图可见，6x6/9x9用2格）
    if (this.size <= 4) {
      this.visionRange = 1;
    } else {
      this.visionRange = 2;
    }

    this.opponent = Object.assign({
      name: '神秘对手',
      avatar: '👤',
      color: '#ef4444',
      speedMin: 3500,
      speedMax: 6000,
      mistakeChance: 0,
      personality: 'normal', // 'random'|'normal'|'surround' 对应三种AI风格
      fillStyle: 'normal'
    }, config.opponent || {});
    this.onEnd = config.onEnd || null;
    this.onEvent = config.onEvent || null;

    // 初始化归属与迷雾数组
    this.fixedMask = Array(this.size).fill().map(() => Array(this.size).fill(false));
    this.revealedFixed = Array(this.size).fill().map(() => Array(this.size).fill(false)); // 已发现的预填数字
    this.aiOwned = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.playerOwned = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.visible = Array(this.size).fill().map(() => Array(this.size).fill(false));
    this.fogOpacity = Array(this.size).fill().map(() => Array(this.size).fill(1)); // 初始全雾（开场有迷雾涌入/退散动画）
    this.discoverFlash = Array(this.size).fill().map(() => Array(this.size).fill(0)); // 发现新预填数的闪光
    this.stealFlash = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.aiPulse = Array(this.size).fill().map(() => Array(this.size).fill(0)); // AI填格脉冲
    this.aiCount = 0;
    this.playerCount = 0;
    this.totalEmpty = 0;
    this.ghostFlicker = 0;
    this.initialAiPreFilled = false; // AI开局预填标记
    this.shownTips = new Set();
    this.tipTimers = [];

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const row = this.initialBoard[r];
        if (row && row[c] !== 0 && row[c] != null) {
          this.fixedMask[r][c] = true;
        } else {
          this.totalEmpty++;
        }
      }
    }

    // 75%胜利阈值（至少1格）
    this.winTarget = Math.max(1, Math.ceil(this.totalEmpty * 0.75));

    console.log(`⚔️ Boss战启动: ${this.opponent.name} | size=${this.size} | 总空格=${this.totalEmpty} | 目标=${this.winTarget}(75%)`);

    // 计算AI填数顺序（根据AI风格）
    this._computeFillOrder();
    this.aiIndex = 0;

    // 视野范围：所有大小统一为1格（锚点+上下左右相邻）
    this.visionRange = 1;

    // 初始视野：所有预填数字都是锚点（能看到数字，可以推理）
    // 但笼子信息（边框+和值）只有靠近才能看到——这才是探索的核心
    this._updateVisibility();
    // 迷雾初始全雾，由_fogAnimationLoop负责动画散开（开场仪式感）
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.fogOpacity[r][c] = 1;
      }
    }

    // 创建UI
    try {
      this._createUI();
      this._createWarningEdge();
    } catch (e) {
      console.error('❌ 创建Boss战UI失败:', e);
    }

    this._updateUI();
    this._startFogAnimation();

    // 喜剧系统：暴露boss/ayan对话接口
    const self = this;
    window._guideBossSay = function(text) { self._say('boss', text); self._setEmotion('boss', 'taunt', 'bounce'); };
    window._guideAyanSay = function(text) { self._say('player', text); };
    this._bossStartTime = Date.now();

    // 喜剧系统：Boss开场凡尔赛台词
    if (typeof ComedySystem !== 'undefined') {
      const isHard = this.level >= 6; // 高章节Boss视为高难
      ComedySystem.onBossStart(isHard);
    }
  },

  /**
   * 倒计时结束，正式开赛
   */
  beginRace() {
    if (!this.active || this.ended || this.raceStarted) return;
    this.raceStarted = true;

    // AI开局预填：在初始视野的边缘（半雾区域）放1-2个幽灵格，让玩家立刻感知对手存在
    this._preFillAiEdgeGhosts();

    // 触发开赛事件（全屏闪+音效+震动）
    if (this.onEvent) {
      this.onEvent('raceStart', {});
    }

    // ===== 角色表演：开赛 =====
    setTimeout(() => {
      this._setEmotion('boss', 'menacing', 'bounce');
      this._say('boss', this._pickLine(this._bossLines.raceStart));
      setTimeout(() => {
        this._say('system', this._pickLine(this._systemLines.raceStart));
      }, 600);
      setTimeout(() => {
        this._setEmotion('player', 'determined', 'determined');
        this._say('player', this._pickLine(this._playerLines.raceStart));
        // Boss保持威胁表情
        setTimeout(() => this._setEmotion('boss', 'menacing', 'menacing'), 500);
      }, 1400);
    }, 400);

    this.aiTimer = setTimeout(() => this._aiStep(), this.aiStartDelay);
    console.log('🏁 幽灵迷雾对战开始！');

    // ===== 引导提示（按时间顺序触发）=====
    // 提示1：开赛后2秒，指引玩家注意笼子信息才是关键
    this._scheduleTip('start', 2000, {
      icon: '🔦',
      title: '探索笼子线索',
      text: '所有数字都清晰可见！但笼子的虚线边框和蓝色和值徽章被迷雾遮住了。填对数字扩展视野，才能看到笼子线索来解题！'
    });
    // 提示2：开赛后7秒，提醒AI幽灵格
    this._scheduleTip('ghost', 7000, {
      icon: '👻',
      title: '注意对手！',
      text: '看到闪烁的红色方块了吗？那是' + this.opponent.name + '填的幽灵格。填对同一格就能抢过来！'
    });
  },

  /**
   * 安排一个延迟提示
   */
  _scheduleTip(id, delay, content) {
    if (this.shownTips.has(id)) return;
    const timer = setTimeout(() => {
      if (!this.active || this.ended) return;
      // 如果玩家已经填了3格以上，说明已经理解玩法了，跳过基础提示
      if (id === 'start' && this.playerCount >= 2) return;
      if (id === 'ghost' && this.playerCount >= 4) return;
      this.shownTips.add(id);
      if (this.onEvent) {
        this.onEvent('tip', { id, ...content });
      }
    }, delay);
    this.tipTimers.push(timer);
  },

  /**
   * 立即显示一个提示（事件触发型）
   */
  _showTipNow(id, content) {
    if (this.shownTips.has(id)) return;
    if (!this.raceStarted) return; // 开赛前不显示提示
    this.shownTips.add(id);
    if (this.onEvent) {
      this.onEvent('tip', { id, ...content });
    }
  },

  /**
   * AI开局预填：在视野边缘（fogLevel=0.25区域）放1-2个幽灵格
   * 选最靠近盘中心的空格，让玩家开局就能看到对手
   */
  _preFillAiEdgeGhosts() {
    const size = this.size;
    const candidates = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.fixedMask[r][c]) continue;
        if (this.playerOwned[r][c] > 0) continue;
        // 选边缘区域（距离锚点1格），这样幽灵格更显眼
        if (this.fogLevel && this.fogLevel[r] && this.fogLevel[r][c] === 0.25) {
          // 评分：靠近盘中心的格子优先（让玩家注意到）
          const centerDist = Math.abs(r - (size-1)/2) + Math.abs(c - (size-1)/2);
          candidates.push({ r, c, score: -centerDist });
        }
      }
    }

    // 按分数排序（中心优先）
    candidates.sort((a, b) => b.score - a.score);

    // 预填1-2个（4x4填1个，6x6/9x9填2个）
    const preFillCount = this.size <= 4 ? 1 : 2;
    let filled = 0;
    for (const cand of candidates) {
      if (filled >= preFillCount) break;
      const { r, c } = cand;
      const num = this.solution[r][c];
      this.aiOwned[r][c] = num;
      this.aiCount++;
      this.aiPulse[r][c] = 1;
      filled++;
    }

    // 更新UI显示
    if (filled > 0) {
      this._updateUI();
      if (this.onEvent) {
        this.onEvent('aiFill', { preFilled: true });
      }
      console.log(`👻 AI开局预填了${filled}个边缘幽灵格`);
    }
  },

  /**
   * 停止并清理
   */
  stop() {
    this.active = false;
    this.ended = false;
    this.result = null;
    this.raceStarted = false;
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this._fogAnimFrame) { cancelAnimationFrame(this._fogAnimFrame); this._fogAnimFrame = null; }
    // 清理所有提示定时器
    if (this.tipTimers) {
      this.tipTimers.forEach(t => clearTimeout(t));
      this.tipTimers = [];
    }
    this._removeWarningEdge();
    this._removeUI();
    // 清除所有提示气泡
    const tips = document.querySelectorAll('.battle-tip-bubble');
    tips.forEach(t => t.remove());
  },

  // ========== 玩家操作回调 ==========

  /**
   * 玩家填数
   * @returns {boolean} 对战是否因此结束
   */
  onPlayerFill(r, c, num, isCorrect) {
    if (!this.active || this.ended) return false;
    if (this.fixedMask[r] && this.fixedMask[r][c]) return false;

    if (isCorrect && num > 0) {
      // 抢格子：如果AI已经填了这格，抢过来
      const wasAi = this.aiOwned[r][c] > 0;
      if (wasAi) {
        this.aiOwned[r][c] = 0;
        this.aiCount--;
        this.stealFlash[r][c] = 1; // 触发抢格子闪光
        if (this.onEvent) this.onEvent('steal', { r, c });
        // 第一次抢格提示
        this._showTipNow('steal', {
          icon: '⚡',
          title: '抢过来了！',
          text: '干得漂亮！你抢先填对了这格，从' + this.opponent.name + '手中抢了过来。继续抢占更多格子！'
        });

        // ===== 角色表演：抢格成功 =====
        this._charState.aiComboCount = 0;
        this._setEmotion('player', 'happy', 'attack');
        this._say('player', this._pickLine(this._playerLines.steal));
        setTimeout(() => {
          this._setEmotion('boss', 'angry', 'hurt');
          this._say('boss', this._pickLine(this._bossLines.stolen));
        }, 500);
        this._charState.comboCount++;
      } else {
        // ===== 角色表演：普通填对 =====
        this._charState.comboCount++;
        this._charState.aiComboCount = 0;
        const combo = this._charState.comboCount;

        // 玩家表情
        if (combo >= 5) {
          this._setEmotion('player', 'happy', 'bounce');
          this._say('player', this._pickLine(this._playerLines.combo5));
        } else if (combo >= 3) {
          this._setEmotion('player', 'happy', 'bounce');
          this._say('player', this._pickLine(this._playerLines.combo3));
        } else if (combo >= 2) {
          if (Math.random() < 0.5) {
            this._setEmotion('player', 'happy');
            this._say('player', this._pickLine(this._playerLines.combo2));
          }
        } else {
          if (Math.random() < 0.35) {
            this._setEmotion('player', 'happy');
            this._say('player', this._pickLine(this._playerLines.correct));
          }
        }

        // Boss反应
        setTimeout(() => {
          const playerPct = this.playerCount / this.totalEmpty;
          const aiPct = this.aiCount / this.totalEmpty;
          if (playerPct > aiPct + 0.15) {
            // 玩家大幅领先，Boss紧张
            this._setEmotion('boss', 'scared', 'shake');
            if (Math.random() < 0.5) this._say('boss', this._pickLine(this._bossLines.playerWarning));
          } else if (combo >= 3) {
            // Boss对玩家连击感到惊讶
            this._setEmotion('boss', 'surprised', 'shake');
            if (combo >= 5) this._say('boss', this._pickLine(this._bossLines.playerWarning));
          } else if (Math.random() < 0.25) {
            this._setEmotion('boss', 'hurt');
            this._say('boss', this._pickLine(this._bossLines.wrong));
          }
        }, 400);
      }

      this.playerOwned[r][c] = num;
      this.playerCount++;

      // 更新视野（新填的格子也是视野锚点）
      this._updateVisibility();

      // 第一次填对数字提示
      if (this.playerCount === 1) {
        this._showTipNow('firstFill', {
          icon: '💡',
          title: '迷雾散开了！',
          text: '填对数字后附近笼子的虚线和和值显露出来了。继续填数，揭开更多笼子线索来解题！'
        });
        // 触发迷雾散开音效
        if (this.onEvent) this.onEvent('discover', { r, c, first: true });
      }

      // 检测遭遇事件
      this._checkEncounters();

      this._updateUI();

      // 检查60%预警
      this._checkWarning();

      // 检查玩家是否赢了
      if (this.playerCount >= this.winTarget) {
        this._endBattle('win');
        return true;
      }
    } else if (!isCorrect && num > 0) {
      // 填错闪红（由renderer处理，这里只触发事件）
      if (this.onEvent) this.onEvent('wrong', { r, c });

      // ===== 角色表演：填错 =====
      this._charState.comboCount = 0;
      this._setEmotion('player', 'hurt', 'shake');
      if (Math.random() < 0.5) this._say('player', this._pickLine(this._playerLines.wrong));
      setTimeout(() => {
        this._setEmotion('boss', 'taunt', 'bounce');
        if (Math.random() < 0.4) this._say('boss', this._pickLine(this._bossLines.wrong));
        setTimeout(() => this._setEmotion('boss', 'confident', 'thinking'), 800);
      }, 400);
    }
    // 填错不散雾、不计入
    return false;
  },

  /**
   * 玩家擦除
   */
  onPlayerErase(r, c) {
    if (!this.active || this.ended) return;
    if (this.fixedMask[r] && this.fixedMask[r][c]) return;

    // 如果擦除的是玩家已填正确的格子，需要归还视野
    if (this.playerOwned[r][c] > 0) {
      this.playerOwned[r][c] = 0;
      this.playerCount--;
      // 擦除后视野收缩
      this._updateVisibility();
    }
  },

  // ========== 迷雾视野系统 ==========

  /**
   * 更新视野可见性：收集所有玩家锚点，计算每个格子到最近锚点的曼哈顿距离
   * 设计原则：
   * - 预填数字始终是锚点（数字始终可读，保证推理可能）
   * - 玩家填对的格子也是锚点（扩展视野）
   * - 迷雾只影响"笼子信息"的可见度和视觉氛围，不隐藏数字本身
   * - 四级迷雾：清晰(0)→边缘(0.25)→雾中(0.5)→浓雾(0.7)
   */
  _updateVisibility() {
    // 所有预填数字 + 玩家已填正确格子都是锚点
    const anchors = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.fixedMask[r][c] || this.playerOwned[r][c] > 0) {
          anchors.push({ r, c });
        }
      }
    }

    if (!this.fogLevel) this.fogLevel = Array(this.size).fill().map(() => Array(this.size).fill(1));

    // visionRange=0：只有锚点格子本身是"清晰"区
    // 相邻格是"边缘"，距离2-3是"雾中"，更远是"浓雾"
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        let minDist = Infinity;
        for (const a of anchors) {
          const d = Math.abs(r - a.r) + Math.abs(c - a.c);
          if (d < minDist) minDist = d;
        }

        this.visible[r][c] = (minDist <= this.visionRange);
        // 四级迷雾
        if (minDist <= this.visionRange) {
          this.fogLevel[r][c] = 0;      // 清晰：笼子完全可见
        } else if (minDist === this.visionRange + 1) {
          this.fogLevel[r][c] = 0.25;   // 边缘：笼子边框隐约可见，和值隐藏
        } else if (minDist <= this.visionRange + 3) {
          this.fogLevel[r][c] = 0.5;    // 雾中：笼子隐藏，空格被迷雾覆盖
        } else {
          this.fogLevel[r][c] = 0.7;    // 浓雾：笼子隐藏，空格被浓雾覆盖
        }
      }
    }
  },

  /**
   * 迷雾动画：每帧渐变fogOpacity向目标值靠近
   */
  _startFogAnimation() {
    // 迷雾在开赛之后才开始散开（倒计时期间保持全雾）
    let fogRevealDelay = 800; // 开赛后800ms迷雾开始散开
    let fogRevealStart = 0;

    const animate = (now) => {
      if (!this.active) return;
      let needsRender = false;

      // 幽灵呼吸动画（每帧更新，倒计时期间也动，增加氛围）
      this.ghostFlicker = (Math.sin(now / 800) + 1) / 2; // 0~1呼吸

      // 确定是否应该开始散开迷雾
      if (this.raceStarted && fogRevealStart === 0) {
        fogRevealStart = now + fogRevealDelay;
      }

      // 倒计时期间：所有格子保持全雾（fogOpacity=1），只做幽灵呼吸不扩散
      const fogClearing = this.raceStarted && now >= fogRevealStart && fogRevealStart > 0;

      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const cur = this.fogOpacity[r][c];

          if (fogClearing) {
            // 使用三级迷雾目标值
            const target = (this.fogLevel && this.fogLevel[r]) ? this.fogLevel[r][c] : (this.visible[r][c] ? 0 : 0.92);
            const rate = 0.06;
            if (Math.abs(cur - target) > 0.01) {
              this.fogOpacity[r][c] = cur + (target - cur) * rate;
              needsRender = true;
            } else {
              this.fogOpacity[r][c] = target;
            }
          } else if (!this.raceStarted) {
            // 倒计时期间：保持全雾
            if (cur < 0.99) {
              this.fogOpacity[r][c] = Math.min(1, cur + 0.05);
              needsRender = true;
            } else {
              this.fogOpacity[r][c] = 1;
            }
          }

          // 抢格子闪光衰减
          if (this.stealFlash[r][c] > 0) {
            this.stealFlash[r][c] -= 16 / this.stealFlashTime;
            if (this.stealFlash[r][c] < 0) this.stealFlash[r][c] = 0;
            needsRender = true;
          }

          // AI填格脉冲衰减
          if (this.aiPulse[r][c] > 0) {
            this.aiPulse[r][c] -= 16 / 600; // 600ms脉冲
            if (this.aiPulse[r][c] < 0) this.aiPulse[r][c] = 0;
            needsRender = true;
          }
        }
      }
      if (needsRender && typeof refreshBoard === 'function') {
        refreshBoard();
      }
      this._fogAnimFrame = requestAnimationFrame(animate);
    };
    this._fogAnimFrame = requestAnimationFrame(animate);
  },

  // ========== 遭遇事件系统 ==========

  /**
   * 检测AI与玩家区域的遭遇（四个方向）
   * 规则：
   * - 找玩家已填格子的"前沿"（边界）
   * - 找视野边缘附近的AI格子
   * - 按方向判定远(3-4格)/中(2格)/近(1格)遭遇
   */
  _checkEncounters() {
    const now = Date.now();
    if (now - this.lastEncounterCheck < 800) return; // 节流，避免频繁触发
    this.lastEncounterCheck = now;

    if (!this.raceStarted) return;

    const size = this.size;

    // 找玩家区域的边界中心（用于判定方向）
    let playerMinR = size, playerMaxR = -1, playerMinC = size, playerMaxC = -1;
    let playerCenterR = 0, playerCenterC = 0, playerCountTemp = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.playerOwned[r][c] > 0 || this.fixedMask[r][c]) {
          playerMinR = Math.min(playerMinR, r);
          playerMaxR = Math.max(playerMaxR, r);
          playerMinC = Math.min(playerMinC, c);
          playerMaxC = Math.max(playerMaxC, c);
          playerCenterR += r;
          playerCenterC += c;
          playerCountTemp++;
        }
      }
    }

    if (playerCountTemp === 0) return;
    playerCenterR = Math.round(playerCenterR / playerCountTemp);
    playerCenterC = Math.round(playerCenterC / playerCountTemp);

    // 找所有视野内/边缘的AI格子，计算到玩家区域的距离
    const aiCells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.aiOwned[r][c] > 0 && this.playerOwned[r][c] === 0) {
          // 计算这个AI格子到最近玩家锚点的距离
          let minDist = Infinity;
          for (let pr = 0; pr < size; pr++) {
            for (let pc = 0; pc < size; pc++) {
              if (this.playerOwned[pr][pc] > 0 || this.fixedMask[pr][pc]) {
                const d = Math.abs(r - pr) + Math.abs(c - pc);
                if (d < minDist) minDist = d;
              }
            }
          }
          if (minDist <= 4) { // 只关注4格以内的
            aiCells.push({ r, c, dist: minDist });
          }
        }
      }
    }

    // 对每个方向找最近的AI格子
    const directions = ['up', 'down', 'left', 'right'];
    for (const dir of directions) {
      let closestDist = Infinity;
      let closestCell = null;

      for (const cell of aiCells) {
        let inDir = false;
        switch (dir) {
          case 'up':    inDir = cell.r < playerCenterR - 0 && Math.abs(cell.c - playerCenterC) <= 2; break;
          case 'down':  inDir = cell.r > playerCenterR + 0 && Math.abs(cell.c - playerCenterC) <= 2; break;
          case 'left':  inDir = cell.c < playerCenterC - 0 && Math.abs(cell.r - playerCenterR) <= 2; break;
          case 'right': inDir = cell.c > playerCenterC + 0 && Math.abs(cell.r - playerCenterR) <= 2; break;
        }
        if (inDir && cell.dist < closestDist) {
          closestDist = cell.dist;
          closestCell = cell;
        }
      }

      if (!closestCell) continue;

      // 判定距离档位并触发（每个方向每个档只触发一次）
      let level = null;
      let lineKey = null;
      if (closestDist === 1 && !this.encounterTriggered[dir].near) {
        level = 'near';
        this.encounterTriggered[dir].near = true;
        this.encounterTriggered[dir].mid = true; // 近距触发时中距也算触发过
        this.encounterTriggered[dir].far = true;
      } else if (closestDist === 2 && !this.encounterTriggered[dir].mid) {
        level = 'mid';
        this.encounterTriggered[dir].mid = true;
        this.encounterTriggered[dir].far = true;
      } else if (closestDist >= 3 && closestDist <= 4 && !this.encounterTriggered[dir].far) {
        level = 'far';
        this.encounterTriggered[dir].far = true;
      }

      if (level && this.onEvent) {
        const dirNames = { up: '上', down: '下', left: '左', right: '右' };
        this.onEvent('encounter', {
          direction: dir,
          dirName: dirNames[dir],
          level: level,
          distance: closestDist,
          cell: closestCell
        });

        // ===== 角色表演：遭遇 =====
        if (level === 'near') {
          this._setEmotion('boss', 'taunt', 'attack');
          this._say('boss', this._pickLine(this._bossLines.encounterNear));
          setTimeout(() => {
            this._setEmotion('player', 'scared', 'shake');
            this._say('player', this._pickLine(this._playerLines.encounter));
            this._say('system', this._pickLine(this._systemLines.encounter));
          }, 400);
        } else if (level === 'mid') {
          this._setEmotion('boss', 'menacing', 'menacing');
          if (Math.random() < 0.6) this._say('boss', this._pickLine(this._bossLines.encounterMid));
          setTimeout(() => {
            this._setEmotion('player', 'surprised');
          }, 300);
        } else if (level === 'far') {
          if (Math.random() < 0.4) this._say('boss', this._pickLine(this._bossLines.encounterFar));
        }
      }
    }
  },

  // ========== 60%终局预警 ==========
  _checkWarning() {
    const aiPct = this.aiCount / this.totalEmpty;
    const playerPct = this.playerCount / this.totalEmpty;

    if (aiPct >= 0.6 && !this.warning60Shown.ai) {
      this.warning60Shown.ai = true;
      this._flashWarningEdge();
      if (this.onEvent) this.onEvent('warning', { who: 'ai', pct: aiPct });

      // ===== 角色表演：AI 60%预警 =====
      this._setEmotion('boss', 'confident', 'bounce');
      this._say('boss', this._pickLine(this._bossLines.aiWarning));
      this._say('system', '⚠️ 对手已占据60%！');
      setTimeout(() => {
        this._setEmotion('player', 'scared', 'scared');
        this._say('player', this._pickLine(this._playerLines.aiWarning));
      }, 600);
    }
    if (playerPct >= 0.6 && !this.warning60Shown.player) {
      this.warning60Shown.player = true;
      // 玩家到60%时不震自己，但可以有正向提示
      if (this.onEvent) this.onEvent('warning', { who: 'player', pct: playerPct });

      // ===== 角色表演：玩家60% =====
      this._setEmotion('player', 'determined', 'determined');
      this._say('player', this._pickLine(this._playerLines.playerWarning));
      this._say('system', '🔥 你已掌握60%！最后冲刺！');
      setTimeout(() => {
        this._setEmotion('boss', 'scared', 'shake');
        this._say('boss', this._pickLine(this._bossLines.playerWarning));
      }, 600);
    }

    // 终局冲刺（双方都超过60%）
    if (aiPct >= 0.6 && playerPct >= 0.6 && !this._charState.finalStretchShown) {
      this._charState.finalStretchShown = true;
      this._say('system', this._pickLine(this._systemLines.finalStretch));
    }

    // 势均力敌提示（差距<10%且双方都>30%）
    if (!this._charState.closeShown && aiPct > 0.3 && playerPct > 0.3 && Math.abs(aiPct - playerPct) < 0.1) {
      this._charState.closeShown = true;
      if (Math.random() < 0.5) this._say('system', this._pickLine(this._systemLines.close));
    }
  },

  _flashWarningEdge() {
    if (!this.warningEdge) return;
    this.warningEdge.style.opacity = '1';
    this.warningEdge.style.animation = 'none';
    // 触发重排
    void this.warningEdge.offsetWidth;
    this.warningEdge.style.animation = 'boss-warning-pulse 0.6s ease-out 4';
    setTimeout(() => {
      if (this.warningEdge) this.warningEdge.style.opacity = '0';
    }, 2800);
  },

  _createWarningEdge() {
    const edge = document.createElement('div');
    edge.id = 'boss-warning-edge';
    document.body.appendChild(edge);
    this.warningEdge = edge;
  },

  _removeWarningEdge() {
    if (this.warningEdge && this.warningEdge.parentNode) {
      this.warningEdge.parentNode.removeChild(this.warningEdge);
    }
    this.warningEdge = null;
  },

  // ========== Canvas渲染 ==========

  /**
   * 在数字下层渲染：玩家格子深蓝色底色
   * 必须在guideRenderer.render()之前调用
   */
  renderPlayerOwned(ctx, cellSize, padding) {
    if (!this.active) return;
    const cs = cellSize;
    ctx.save();
    ctx.translate(padding, padding);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.fixedMask[r][c]) continue;
        if (this.playerOwned[r][c] > 0) {
          const x = c * cs;
          const y = r * cs;
          ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
          ctx.fillRect(x, y, cs, cs);
        }
      }
    }

    ctx.restore();
  },

  /**
   * 在数字上层渲染：幽灵格+迷雾+抢格子闪光
   * 必须在guideRenderer.render()之后调用
   */
  renderFogAndGhosts(ctx, cellSize, padding) {
    if (!this.active) return;

    // 获取当前章节主题（如果可用）
    let fogBase = 'rgba(15, 23, 42, ';
    let fogTex = 'rgba(100, 116, 139, ';
    let stealColor = 'rgba(34, 197, 94, ';
    if (typeof guideRenderer !== 'undefined' && guideRenderer && guideRenderer.theme) {
      const t = guideRenderer.theme;
      fogBase = t.fogColor || fogBase;
      fogTex = t.fogTexColor || fogTex;
      // 抢格子闪光用accent色
      stealColor = t.accent ? t.accent + '' : stealColor;
      // 将hex转rgba前缀
      if (stealColor.startsWith('#')) {
        const r = parseInt(stealColor.slice(1,3),16);
        const g = parseInt(stealColor.slice(3,5),16);
        const b = parseInt(stealColor.slice(5,7),16);
        stealColor = `rgba(${r}, ${g}, ${b}, `;
      }
    }

    const cs = cellSize;
    ctx.save();
    ctx.translate(padding, padding);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const x = c * cs;
        const y = r * cs;
        const fog = this.fogOpacity[r][c];
        const flick = this.ghostFlicker;

        // === 固定数字（预填数）处理 ===
        if (this.fixedMask[r][c]) {
          // 预填数字：不画任何深色迷雾覆盖！数字必须100%清晰可读
          // 迷雾效果只体现在笼子信息隐藏上（虚线边框+和值徽章在雾中不显示）
          continue;
        }

        const isAi = this.aiOwned[r][c] > 0;
        const isPlayerOwned = this.playerOwned[r][c] > 0;
        const pulse = this.aiPulse[r][c];
        const cellFogL = (this.fogLevel && this.fogLevel[r]) ? this.fogLevel[r][c] : fog;

        // 玩家已填正确的格子：玩家领地，不画迷雾覆盖（保持清晰）
        if (isPlayerOwned) {
          // 玩家格子清晰可见，只处理抢格子闪光
          const flash = this.stealFlash[r][c];
          if (flash > 0) {
            ctx.fillStyle = stealColor + (flash * 0.4) + ')';
            ctx.fillRect(x, y, cs, cs);
            ctx.strokeStyle = stealColor + flash + ')';
            ctx.lineWidth = 2 + flash * 3;
            ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
            const expand = (1 - flash) * cs * 0.6;
            ctx.strokeStyle = stealColor + (flash * 0.6) + ')';
            ctx.lineWidth = 2;
            this._roundRect(ctx, x + 1 - expand, y + 1 - expand, cs - 2 + expand * 2, cs - 2 + expand * 2, 8);
            ctx.stroke();
          }
          continue;
        }

        // 1. 迷雾层：先画深色迷雾底色（隐藏笼子边框和和值，营造雾感）
        //    注意：预填数和玩家已填格子已经在前面continue了，这里只处理空格和AI格
        let isSelectedCell = false;
        if (cellFogL > 0.01) {
          // 检查是否是当前选中格（雾中选中有特殊窥视效果）
          if (typeof guideBoard !== 'undefined' && guideBoard) {
            const cell = guideBoard.cells[r] && guideBoard.cells[r][c];
            isSelectedCell = cell && (cell.isSelected || (guideBoard.selectedCell && guideBoard.selectedCell.r === r && guideBoard.selectedCell.c === c));
          }

          // 迷雾alpha：边缘区薄，雾中/浓雾区厚
          let fogAlpha = cellFogL * fog;
          if (isSelectedCell) fogAlpha *= 0.5; // 选中格迷雾更浅，方便操作
          fogAlpha = Math.min(0.88, fogAlpha);
          ctx.fillStyle = fogBase + fogAlpha + ')';
          ctx.fillRect(x, y, cs, cs);

          // 迷雾纹理：雾气流动效果（只在雾中以上区域）
          if (cellFogL > 0.3) {
            const t = Date.now() / 2000;
            const texAlpha = cellFogL * fog * 0.12;
            ctx.fillStyle = fogTex + texAlpha + ')';
            ctx.beginPath();
            ctx.moveTo(x, y + cs * (0.3 + Math.sin(t + r + c) * 0.1));
            ctx.lineTo(x + cs * (0.3 + Math.cos(t + r) * 0.1), y);
            ctx.lineTo(x + cs, y + cs * (0.7 + Math.sin(t + c) * 0.1));
            ctx.lineTo(x + cs * (0.7 + Math.cos(t + c) * 0.1), y + cs);
            ctx.closePath();
            ctx.fill();
          }
        }

        // 2. AI幽灵格：画在迷雾层之上，确保在雾中也能看到
        if (isAi && !isPlayerOwned) {
          // 2a. 浓雾中也能看到极淡的幽灵轮廓（始终让玩家感知AI存在）
          if (cellFogL >= 0.5) {
            const ghostAlpha = 0.15 + flick * 0.1;
            ctx.strokeStyle = this.opponent.color + Math.round(ghostAlpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            this._roundRect(ctx, x + 3, y + 3, cs - 6, cs - 6, 3);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // 2b. 视野内/边缘/雾中：更明显的幽灵格
          if (cellFogL < 0.7) {
            const ghostAlpha = 1 - cellFogL * 0.6; // 越清晰越明显，雾中也保留一定可见度

            // 幽灵格底色（对手色半透明）
            ctx.fillStyle = this.opponent.color + Math.round(0.3 * ghostAlpha * 255).toString(16).padStart(2, '0');
            this._roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, 4);
            ctx.fill();

            // 幽灵格边框（呼吸效果）
            const borderAlpha = 0.5 + flick * 0.25;
            ctx.strokeStyle = this.opponent.color + Math.round(borderAlpha * ghostAlpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 2;
            this._roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, 4);
            ctx.stroke();

            // 幽灵格中心圆点（呼吸放大缩小）
            const dotR = cs * (0.12 + flick * 0.05);
            ctx.fillStyle = this.opponent.color + Math.round(0.8 * ghostAlpha * 255).toString(16).padStart(2, '0');
            ctx.beginPath();
            ctx.arc(x + cs / 2, y + cs / 2, dotR, 0, Math.PI * 2);
            ctx.fill();
          }

          // 2c. AI填格脉冲动画（刚填时的扩散波）
          if (pulse > 0) {
            const expand = (1 - pulse) * cs * 0.5;
            ctx.strokeStyle = this.opponent.color + Math.round(pulse * 200).toString(16).padStart(2, '0');
            ctx.lineWidth = 2 + pulse * 2;
            this._roundRect(ctx, x + 2 - expand, y + 2 - expand, cs - 4 + expand * 2, cs - 4 + expand * 2, 6);
            ctx.stroke();
          }
        }

        // 3. 雾中选中格：主题色虚线边框（画在最上层，确保可见）
        if (isSelectedCell && cellFogL > 0.2) {
          // 使用主题accent色
          let selBorderColor = `rgba(59, 130, 246, ${0.6 + flick * 0.2})`;
          if (typeof guideRenderer !== 'undefined' && guideRenderer && guideRenderer.theme) {
            const tc = guideRenderer.theme.selectedBorder;
            if (tc) {
              // hex转rgba
              const r = parseInt(tc.slice(1,3),16);
              const g = parseInt(tc.slice(3,5),16);
              const b = parseInt(tc.slice(5,7),16);
              selBorderColor = `rgba(${r}, ${g}, ${b}, ${0.7 + flick * 0.2})`;
            }
          }
          ctx.strokeStyle = selBorderColor;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 3]);
          this._roundRect(ctx, x + 3, y + 3, cs - 6, cs - 6, 4);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    ctx.restore();
  },

  /**
   * 工具：圆角矩形
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // ========== AI逻辑 ==========

  /**
   * 根据AI风格计算填数顺序
   * - random（阿岩）：跳着填，东一榔头西一棒子，随机打乱
   * - normal（守笼人）：从左到右从上到下，规规矩矩按线索数填
   * - surround（设局人）：从四周往中间包抄
   */
  _computeFillOrder() {
    const order = [];
    const size = this.size;
    let boxH, boxW;
    if (size === 4) { boxH = 2; boxW = 2; }
    else if (size === 6) { boxH = 2; boxW = 3; }
    else { boxH = 3; boxW = 3; }

    const style = this.opponent.fillStyle || 'normal';
    const center = (size - 1) / 2;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!this.fixedMask[r][c]) {
          let clues = 0;
          for (let cc = 0; cc < size; cc++) {
            if (this.fixedMask[r][cc]) clues++;
          }
          for (let rr = 0; rr < size; rr++) {
            if (this.fixedMask[rr][c]) clues++;
          }
          const br = Math.floor(r / boxH) * boxH;
          const bc = Math.floor(c / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++) {
            for (let dc = 0; dc < boxW; dc++) {
              const nr = br + dr, nc = bc + dc;
              if (nr < size && nc < size && this.fixedMask[nr][nc]) clues++;
            }
          }

          // 计算优先级分数
          let priority = clues; // 基础：线索越多越先填

          if (style === 'surround') {
            // 从四周往中间包抄：距离中心越远越先填
            const distToCenter = Math.abs(r - center) + Math.abs(c - center);
            priority += distToCenter * 3;
          } else if (style === 'random') {
            // 随机风格：加入大量随机扰动
            priority += Math.random() * 20 - 10;
          }
          // normal风格：按线索数+轻微随机

          order.push({ r, c, clues, priority });
        }
      }
    }

    order.sort((a, b) => {
      const diff = b.priority - a.priority;
      if (Math.abs(diff) <= 2) return Math.random() - 0.5;
      return diff;
    });

    this.aiOrder = order;
  },

  _aiStep() {
    if (!this.active || this.ended || !this.raceStarted) return;

    while (this.aiIndex < this.aiOrder.length) {
      const { r, c } = this.aiOrder[this.aiIndex];
      this.aiIndex++;

      // 玩家已填（包括抢来的）就跳过
      if (this.playerOwned[r][c] > 0) continue;
      // AI已经填了也跳过
      if (this.aiOwned[r][c] > 0) continue;

      // AI偶尔"失误"（不填，跳过，但不算错）— 模拟阿岩的风格
      if (this.opponent.mistakeChance > 0 && Math.random() < this.opponent.mistakeChance) {
        // 失误：把这格放到队列末尾，晚些再填
        this.aiOrder.push({ r, c, clues: 0, priority: -100 });
        continue;
      }

      const num = this.solution[r][c];
      this.aiOwned[r][c] = num;
      this.aiCount++;

      // AI填格脉冲动画（幽灵浮现效果）
      this.aiPulse[r][c] = 1;

      // ===== 角色表演：AI填格 =====
      this._charState.aiComboCount = (this._charState.aiComboCount || 0) + 1;
      this._charState.comboCount = 0;
      const aiCombo = this._charState.aiComboCount;
      const aiPct = this.aiCount / this.totalEmpty;
      const playerPctNow = this.playerCount / this.totalEmpty;

      if (aiCombo >= 4) {
        this._setEmotion('boss', 'confident', 'bounce');
        if (Math.random() < 0.6) this._say('boss', this._pickLine(this._bossLines.combo3 || this._bossLines.combo2));
      } else if (aiCombo >= 2) {
        this._setEmotion('boss', 'thinking', 'thinking');
        if (Math.random() < 0.35) this._say('boss', this._pickLine(this._bossLines.combo2));
      } else {
        this._setEmotion('boss', 'thinking', 'thinking');
        if (Math.random() < 0.2) this._say('boss', this._pickLine(this._bossLines.correct));
      }

      // 玩家对AI填格的反应
      setTimeout(() => {
        if (aiPct > playerPctNow + 0.15) {
          // AI大幅领先，玩家紧张
          this._setEmotion('player', 'scared', 'scared');
        } else if (aiCombo >= 3) {
          this._setEmotion('player', 'surprised', 'shake');
        }
      }, 300);

      // 触发AI填格事件（音效+轻微震动）
      if (this.onEvent) {
        this.onEvent('aiFill', { r, c });
      }

      // AI进度条脉冲
      const aiFillEl = document.getElementById('boss-progress-fill');
      if (aiFillEl && aiFillEl.parentElement) {
        aiFillEl.parentElement.classList.add('ai-step');
        setTimeout(() => aiFillEl.parentElement.classList.remove('ai-step'), 500);
      }

      // 检测遭遇事件
      this._checkEncounters();

      this._updateUI();
      this._checkWarning();

      if (this.aiCount >= this.winTarget) {
        this._endBattle('lose');
        return;
      }
      break;
    }

    if (this.active && !this.ended && this.aiIndex < this.aiOrder.length) {
      const baseDelay = this.opponent.speedMin + Math.random() * (this.opponent.speedMax - this.opponent.speedMin);
      // AI动态速度曲线：开局慢30%，中期正常，后期快20%
      const progress = this.aiCount / this.totalEmpty;
      let speedMul = 1;
      if (progress < 0.25) speedMul = 1.3;     // 开局慢（delay变大）
      else if (progress > 0.75) speedMul = 0.8; // 后期快（delay变小）
      // 棋盘大小自适应：小棋盘格子少，AI需要更快才能形成竞速压力
      // 4x4: 0.38x（约2.3-4.2秒/格），6x6: 0.65x（约3.9-7.2秒/格），9x9: 1x
      const sizeMul = this.size <= 4 ? 0.38 : (this.size <= 6 ? 0.65 : 1.0);
      this.aiTimer = setTimeout(() => this._aiStep(), baseDelay * speedMul * sizeMul);
    }
  },

  // ========== UI ==========

  _createUI() {
    const bar = document.createElement('div');
    bar.id = 'boss-battle-bar';
    bar.innerHTML = `
      <div class="boss-info">
        <div class="q-avatar-wrap" id="boss-avatar-wrap">
          <div class="boss-avatar" id="boss-avatar"></div>
          <div class="q-emotion" id="boss-emotion"></div>
        </div>
        <div class="boss-detail">
          <div class="boss-name" id="boss-name"></div>
          <div class="boss-progress-bar">
            <div class="boss-progress-fill" id="boss-progress-fill"></div>
            <span class="boss-progress-text" id="boss-progress-text">0%</span>
          </div>
        </div>
      </div>
      <div class="boss-dialogue-zone" id="boss-dialogue-zone"></div>
      <div class="player-info">
        <div class="player-detail">
          <div class="player-name">侦探</div>
          <div class="player-progress-bar">
            <div class="player-progress-fill" id="player-progress-fill"></div>
            <span class="player-progress-text" id="player-progress-text">0%</span>
          </div>
        </div>
        <div class="q-avatar-wrap" id="player-avatar-wrap">
          <div class="player-avatar" id="player-avatar">🕵️</div>
          <div class="q-emotion" id="player-emotion"></div>
        </div>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.id = 'boss-result-overlay';
    overlay.style.display = 'none';

    document.body.appendChild(bar);
    document.body.appendChild(overlay);
    this.dom = { bar, overlay };

    const avatarEl = document.getElementById('boss-avatar');
    const nameEl = document.getElementById('boss-name');
    if (avatarEl) {
      if (this.opponent.avatar && (this.opponent.avatar.endsWith('.png') || this.opponent.avatar.endsWith('.jpg') || this.opponent.avatar.endsWith('.webp'))) {
        avatarEl.innerHTML = `<img src="${this.opponent.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        avatarEl.textContent = this.opponent.avatar || '👤';
      }
    }
    if (nameEl) {
      nameEl.textContent = this.opponent.name;
      nameEl.style.color = this.opponent.color;
    }

    // 初始化角色表演系统
    this._initCharSystem();
  },

  /**
   * 角色表演系统：Q版头像表情 + 台词飘过
   */
  _initCharSystem() {
    this._charState = {
      boss: 'idle',
      player: 'focus',
      lastDialogueTime: 0,
      comboCount: 0,
      lastPlayerCorrect: 0,
      lastAiCorrect: 0,
    };

    // Boss表情映射：状态→emoji
    this._bossExpressions = {
      idle: '',
      menacing: '😈',
      thinking: '💭',
      confident: '😏',
      surprised: '😲',
      angry: '💢',
      hurt: '💫',
      taunt: '👻',
      scared: '😰',
      victory: '👑',
      defeated: '💀',
    };

    // 玩家表情映射
    this._playerExpressions = {
      idle: '',
      focus: '',
      thinking: '🤔',
      happy: '✨',
      surprised: '❗',
      determined: '💪',
      hurt: '😣',
      scared: '😱',
      victory: '🎉',
      defeated: '😵',
    };

    // Boss台词库（根据对手性格定制）
    const bossLines = this._getBossDialogueLines();
    this._bossLines = bossLines;
    this._playerLines = {
      correct: ['找到了！', '这里！', '真相浮出水面！', '就是这个数！', '好，推进一格！', '证据确凿！'],
      combo2: ['手感来了！', '节奏不错！', '继续推进！'],
      combo3: ['乘胜追击！', '一气呵成！', '看我连破数关！'],
      combo5: ['无人能挡！', '这就是侦探的直觉！', '真相只有一个！'],
      wrong: ['唔...不对', '糟糕，判断失误', '这个数有问题...', '可恶，看错了'],
      encounter: ['什么动静？！', '谁在那里？', '有什么东西...'],
      steal: ['抢回来了！', '休想抢走我的线索！', '这格是我的！'],
      stolen: ['我的线索！', '被抢先了！', '可恶！'],
      aiWarning: ['糟糕，它要赢了！', '必须加快速度！', '不能输在这里！', '加油啊！'],
      playerWarning: ['还差一点！', '坚持住！', '最后冲刺！'],
      raceStart: ['开始了！集中精神！', '迷雾中的对决，我不会输！', '真相一定由我揭开！'],
      win: ['我赢了！迷雾散去！', '真相大白！', '档案解封！'],
      lose: ['可恶...再来一次！', '就差一点...', '不能在这里放弃！'],
      near: ['有东西靠近了...', '感觉到了...', '小心...'],
      far: ['...那里有动静', '它在那里...'],
    };
    this._systemLines = {
      encounter: ['【警告：幽灵逼近！】', '【迷雾中传来声响...】', '【对手正在窥视你的线索！】'],
      raceStart: ['⚡ 竞赛开始！填满75%盘面者获胜！', '🔍 迷雾中的追逐战打响了！', '👻 小心！幽灵正在窃取线索！'],
      playerLead: ['🔥 侦探取得领先！', '💨 节奏在你手中！'],
      bossLead: ['⚠️ 幽灵占了上风！', '😱 它在吞噬盘面！'],
      close: ['⚔️ 势均力敌！激战正酣！'],
      finalStretch: ['🏁 终局冲刺！谁将揭开真相？'],
    };
  },

  /**
   * 根据Boss配置获取台词库
   */
  _getBossDialogueLines() {
    const bossName = this.opponent.name || '';
    // 根据Boss名字/特征定制性格
    if (bossName.includes('影') || bossName.includes('黑影')) {
      return {
        start: ['哼哼哼...又一个不自量力的侦探...', '迷雾之中，你什么也看不见...', '你的线索，都是我的~', '在黑暗中挣扎吧...'],
        correct: ['又一格...', '黑暗在扩张...', '嘻嘻...', '你的棋盘在消失...'],
        combo2: ['你追不上我的~', '太慢了太慢了', '迷雾会吞噬一切'],
        combo3: ['绝望吧...', '没有人能赢过黑暗', '呵呵呵...'],
        combo5: ['游戏结束了，侦探~', '你已经输了！', '沉入迷雾吧！'],
        wrong: ['切...', '无聊的抵抗', '挣扎是没用的'],
        steal: ['这格我收下了~', '你的线索，归我了', '嘻嘻，抢来的线索最香了'],
        stolen: ['！', '你...', '别得意...'],
        aiWarning: ['我马上就要赢了~', '放弃吧，侦探！', '你赢不了黑暗的！', '哈哈哈！'],
        playerWarning: ['别、别过来！', '可恶...怎么会...', '你怎么还在追？'],
        encounterNear: ['我就在你身后哦~', '找到你了...侦探', 'Boo! 吓到了吗？'],
        encounterMid: ['感受到我的存在了吗？', '我在看着你呢...'],
        encounterFar: ['...', '......'],
        win: ['哼哼哼...我说过的，你赢不了', '沉入永恒的迷雾吧~', '又一个倒下的侦探...'],
        lose: ['不可能...黑暗怎么会被驱散...', '可恶的侦探...我还会回来的...', '光...竟然这么刺眼...'],
        raceStart: ['来吧，在迷雾中捉迷藏吧~'],
      };
    }
    if (bossName.includes('算') || bossName.includes('数') || bossName.includes('教授')) {
      return {
        start: ['愚蠢的凡人，你以为能胜过计算？', '概率上你胜率不足3%', '让我教教你什么是杀手数独', '你的每一步都在我的预料之中'],
        correct: ['正确。', '符合预期。', '概率+1。', '最优解。'],
        combo2: ['你的失败已被计算', '误差收敛中...', '效率低下'],
        combo3: ['QED，证明完毕', '你没有胜算', '这就是数学的力量'],
        combo5: ['结论：你必败无疑。', '数据不会说谎。'],
        wrong: ['错误。', '概率0%。', '不合逻辑。', '重新计算吧。'],
        steal: ['这格在我的最优路径上。', '逻辑上属于我。', '推导正确。'],
        stolen: ['异常值。', '...计算偏差', '需要修正参数'],
        aiWarning: ['98%胜率。', '收敛完成。', '你已经无力回天。'],
        playerWarning: ['不可能...概率低于0.1%', '变量异常！', '哪里出错了？'],
        encounterNear: ['我算到你会在这里。', '你逃不出我的公式。', '纳什均衡，你必输。'],
        encounterMid: ['你的位置可计算。', '我已经预测了你的行动。'],
        encounterFar: ['处理中...', '...'],
        win: ['结果和计算完全一致。', '数学证明：你输了。', '在逻辑面前，凡人毫无机会。'],
        lose: ['计算错误...不可能...', '我的模型...有缺陷？', '数据异常...需要重写算法...'],
        raceStart: ['开始计算最优解。'],
      };
    }
    if (bossName.includes('小丑') || bossName.includes('Joker') || bossName.includes('笑')) {
      return {
        start: ['哇哈哈哈哈！欢迎来到我的游戏！', '侦探先生，来玩个游戏吧~', '规则很简单：你输，我赢！', 'Let the game begin! 🎭'],
        correct: [' Bingo! ', ' 答对了~（虽然没用）', ' 啦啦啦~', ' 🎪'],
        combo2: ['嘿！你还挺会玩的嘛！', '有趣有趣！', '🎯 中中中！'],
        combo3: ['游戏越来越好玩了！', '哈哈哈！刺激！', '这才像话！'],
        combo5: ['SURPRISE! 你完了！', '🎉 游戏结束倒计时！', '好戏才刚刚开始~'],
        wrong: ['哎呀呀~错啦错啦！', 'Boom! 答错了！', '哈哈哈！你真菜！'],
        steal: ['不好意思~这格归我啦！', '嘿嘿，手快有手慢无~', 'Mine! 🃏'],
        stolen: ['哎？！', '你作弊！', '哼！'],
        aiWarning: ['HAHAHA! 我要赢了我要赢了！', '认输吧笨蛋侦探！', '🎊 胜利在向我招手！'],
        playerWarning: ['Wait wait wait!', '你你你你开挂了吧！', '不要啊！'],
        encounterNear: ['🎭 Peek-a-boo!', '猜猜我在哪里？~', '我就在你身边哦！😈'],
        encounterMid: ['感觉到了吗？我的视线~', '找呀找呀找朋友~'],
        encounterFar: ['嘻嘻嘻...', '...'],
        win: ['WAHAHAHA! 我就说我会赢！', '游戏结束！你输了！🎉', '谢谢参与~下次再来玩哦！'],
        lose: ['呜哇！你竟然赢了！', '不公平不公平！', '下次...下次一定赢你！😭'],
        raceStart: ['Let\'s play! 🎪'],
      };
    }
    // 默认Boss台词
    return {
      start: ['来吧，侦探...', '你不可能赢的...', '迷雾中的对决...', '试试揭开真相？'],
      correct: ['...', '一格。', '推进。', '...对了'],
      combo2: ['你太慢了', '我领先了', '差距在拉大'],
      combo3: ['放弃吧', '你追不上的', '胜负已分'],
      combo5: ['结束了。', '你输了。'],
      wrong: ['...', '无聊', '没用的'],
      steal: ['这格是我的。', '抢下。', '归我。'],
      stolen: ['！', '可恶', '...'],
      aiWarning: ['我马上就赢了！', '认输吧！', '你已经没有机会了！'],
      playerWarning: ['怎么可能...', '不...', '等等！'],
      encounterNear: ['我在你旁边...', '找到了你...', '来面对我吧！'],
      encounterMid: ['...越来越近了', '感受到了吗？'],
      encounterFar: ['...', '......'],
      win: ['我说过的，你赢不了', '真相永远被迷雾笼罩...', '...你输了'],
      lose: ['不可能...迷雾被驱散了...', '你...赢了...', '下次...我不会输...'],
      raceStart: ['开始吧。'],
    };
  },

  /**
   * 设置头像情绪状态
   * @param {string} who 'boss' | 'player'
   * @param {string} emotion 情绪状态id
   * @param {string} anim 可选动画class: bounce/shake/attack/hurt/thinking/menacing/scared/victory/defeated/determined
   */
  _setEmotion(who, emotion, anim) {
    const wrap = document.getElementById(who === 'boss' ? 'boss-avatar-wrap' : 'player-avatar-wrap');
    const emoEl = document.getElementById(who === 'boss' ? 'boss-emotion' : 'player-emotion');
    if (!wrap || !emoEl) return;

    const expr = who === 'boss' ? this._bossExpressions[emotion] : this._playerExpressions[emotion];
    emoEl.textContent = expr || '';
    emoEl.style.animation = 'none';
    requestAnimationFrame(() => {
      emoEl.style.animation = '';
    });

    // 清除旧动画class
    wrap.classList.remove('bounce', 'shake', 'attack', 'hurt', 'thinking', 'menacing', 'scared', 'victory', 'defeated', 'determined');
    if (anim) {
      wrap.classList.add(anim);
      // 一次性动画结束后移除
      if (['bounce', 'shake', 'attack', 'hurt', 'victory', 'defeated', 'determined'].includes(anim)) {
        setTimeout(() => wrap.classList.remove(anim), 700);
      }
    }

    this._charState[who] = emotion;
  },

  /**
   * 显示台词气泡
   * @param {string} who 'boss' | 'player' | 'system'
   * @param {string} text
   */
  _say(who, text) {
    const zone = document.getElementById('boss-dialogue-zone');
    if (!zone) return;

    const now = Date.now();
    if (now - this._charState.lastDialogueTime < 500) return; // 防刷屏
    this._charState.lastDialogueTime = now;

    const bubble = document.createElement('div');
    bubble.className = 'boss-dialogue-bubble ' + (who === 'boss' ? 'boss-line' : who === 'player' ? 'player-line' : 'system-line');
    bubble.textContent = text;

    // 随机垂直位置偏移
    const vOffset = Math.random() * 20 - 10;
    bubble.style.marginTop = vOffset + 'px';

    zone.appendChild(bubble);

    // 动画结束后移除
    setTimeout(() => {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 2800);
  },

  /**
   * 随机选择一条台词
   */
  _pickLine(arr) {
    if (!arr || arr.length === 0) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  },

  _updateUI() {
    const aiPct = Math.floor((this.aiCount / this.totalEmpty) * 100);
    const playerPct = Math.floor((this.playerCount / this.totalEmpty) * 100);

    const aiFill = document.getElementById('boss-progress-fill');
    const aiText = document.getElementById('boss-progress-text');
    const playerFill = document.getElementById('player-progress-fill');
    const playerText = document.getElementById('player-progress-text');

    if (aiFill) {
      aiFill.style.width = Math.min(100, aiPct) + '%';
      aiFill.style.background = `linear-gradient(90deg, ${this.opponent.color}, ${this.opponent.color}cc)`;
    }
    if (aiText) aiText.textContent = aiPct + '%';
    if (playerFill) {
      playerFill.style.width = Math.min(100, playerPct) + '%';
      // 玩家进度条脉冲动画（通过_lastUiUpdatePlayerCount判断是否刚更新）
      if (this._charState && this._charState.lastPlayerCount !== this.playerCount) {
        playerFill.parentElement?.classList.add('player-step');
        setTimeout(() => playerFill.parentElement?.classList.remove('player-step'), 500);
      }
    }
    if (this._charState) this._charState.lastPlayerCount = this.playerCount;
    if (playerText) playerText.textContent = playerPct + '%';

    const bar = document.getElementById('boss-battle-bar');
    if (bar) {
      if (aiPct > playerPct + 20) {
        bar.classList.add('boss-leading');
      } else {
        bar.classList.remove('boss-leading');
      }
    }

    // 领先变化提示
    if (this._charState && this.raceStarted) {
      const wasPlayerLead = this._charState.playerLeading;
      const isPlayerLead = playerPct > aiPct;
      if (wasPlayerLead !== undefined && wasPlayerLead !== isPlayerLead && playerPct > 10 && aiPct > 10) {
        if (isPlayerLead && !this._charState.leadAnnounced) {
          this._charState.leadAnnounced = true;
          this._say('system', this._pickLine(this._systemLines.playerLead));
        } else if (!isPlayerLead && !this._charState.leadAnnouncedBoss) {
          this._charState.leadAnnouncedBoss = true;
          this._say('system', this._pickLine(this._systemLines.bossLead));
        }
      }
      this._charState.playerLeading = isPlayerLead;
    }
  },

  _showResult(result) {
    const overlay = document.getElementById('boss-result-overlay');
    if (!overlay) return;

    const isWin = result === 'win';
    const aiFinalPct = Math.floor((this.aiCount / this.totalEmpty) * 100);
    const playerFinalPct = Math.floor((this.playerCount / this.totalEmpty) * 100);

    overlay.innerHTML = `
      <div class="boss-result-content ${isWin ? 'win' : 'lose'}">
        <div class="boss-result-icon">${isWin ? '🏆' : '💀'}</div>
        <div class="boss-result-title">${isWin ? '胜 利！' : '败 北'}</div>
        <div class="boss-result-sub">
          ${isWin
            ? `你击败了${this.opponent.name}！`
            : `${this.opponent.name}抢先达到了75%……`}
        </div>
        <div class="boss-result-stats">
          <div class="stat-row">
            <span>你的进度</span>
            <span style="color:#2563eb;font-weight:700;">${playerFinalPct}%</span>
          </div>
          <div class="stat-row">
            <span>${this.opponent.name}的进度</span>
            <span style="color:${this.opponent.color};font-weight:700;">${aiFinalPct}%</span>
          </div>
        </div>
        <button class="boss-result-btn" id="boss-result-continue">
          ${isWin ? '继续剧情' : '再试一次'}
        </button>
      </div>
    `;
    overlay.style.display = 'flex';

    const btn = document.getElementById('boss-result-continue');
    if (btn) {
      btn.addEventListener('click', () => {
        overlay.style.display = 'none';
        if (result === 'lose') {
          this._restartBattle();
        } else {
          if (this.onEnd) this.onEnd('win');
        }
      });
    }
  },

  _endBattle(result) {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    // 注意：不在这里设置active=false，让onEnd回调先执行stop()清理UI
    // active会在stop()中设为false
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this._fogAnimFrame) { cancelAnimationFrame(this._fogAnimFrame); this._fogAnimFrame = null; }

    // ===== 角色表演：胜负 =====
    if (result === 'win') {
      this._setEmotion('player', 'victory', 'victory');
      this._say('player', this._pickLine(this._playerLines.win));
      setTimeout(() => {
        this._setEmotion('boss', 'defeated', 'defeated');
        this._say('boss', this._pickLine(this._bossLines.lose));
        // 喜剧系统：Boss战打脸吐槽
        if (typeof ComedySystem !== 'undefined' && this._bossStartTime) {
          const elapsed = (Date.now() - this._bossStartTime) / 1000;
          const mistakes = ComedySystem.state ? ComedySystem.state.totalWrong : 0;
          const perfect = mistakes === 0;
          const fast = elapsed < 60;
          const slow = elapsed > 300;
          setTimeout(() => {
            if (perfect) {
              ComedySystem.setterSays('perfectClear');
            } else if (fast) {
              ComedySystem.setterSays('fastClear', { systemMsg: ComedySystem._t('comedy.system.bossRetractFail') });
            } else if (slow) {
              ComedySystem.setterSays('slowClear', { systemMsg: ComedySystem._t('comedy.system.bossLearned') });
            } else {
              ComedySystem.setterSays('fastClear');
            }
            setTimeout(() => ComedySystem.ayanSays(fast ? 'bossSpeedrun' : 'bossWin'), 3500);
          }, 1500);
        }
      }, 500);
    } else {
      this._setEmotion('boss', 'victory', 'victory');
      this._say('boss', this._pickLine(this._bossLines.win));
      setTimeout(() => {
        this._setEmotion('player', 'defeated', 'defeated');
        this._say('player', this._pickLine(this._playerLines.lose));
      }, 500);
    }

    this._showResult(result);
  },

  _restartBattle() {
    if (typeof guideBoard !== 'undefined' && guideBoard) {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const cell = guideBoard.cells[r][c];
          if (!this.fixedMask[r][c]) {
            cell.fillNum = null;
            cell.candidates = new Set();
            cell.isError = false;
          }
        }
      }
      guideBoard.history = [];
      if (typeof refreshBoard === 'function') refreshBoard();
    }

    this.ended = false;
    this.result = null;
    this.active = true;
    this.raceStarted = false;
    this.warning60Shown = { ai: false, player: false };
    this.encounterTriggered = {
      up: { far: false, mid: false, near: false },
      down: { far: false, mid: false, near: false },
      left: { far: false, mid: false, near: false },
      right: { far: false, mid: false, near: false }
    };
    this.aiOwned = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.playerOwned = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.visible = Array(this.size).fill().map(() => Array(this.size).fill(false));
    this.fogOpacity = Array(this.size).fill().map(() => Array(this.size).fill(1));
    this.stealFlash = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.aiPulse = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.discoverFlash = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.revealedFixed = Array(this.size).fill().map(() => Array(this.size).fill(false));
    // 清理旧的提示定时器并重置
    if (this.tipTimers) {
      this.tipTimers.forEach(t => clearTimeout(t));
    }
    this.tipTimers = [];
    this.shownTips = new Set();
    // 清除残留提示气泡
    document.querySelectorAll('.battle-tip-bubble').forEach(t => t.remove());
    this.aiCount = 0;
    this.playerCount = 0;
    this.aiIndex = 0;

    this._computeFillOrder();
    // 重试也重新选择起点
    this._chooseStartAnchors();
    this._updateVisibility();
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.fogOpacity[r][c] = 1; // 重试也是全雾开始
      }
    }
    this._updateUI();

    const overlay = document.getElementById('boss-result-overlay');
    if (overlay) overlay.style.display = 'none';
    this._removeWarningEdge();
    this._createWarningEdge();

    this._startFogAnimation();

    // 通知guide.js显示倒计时（而非直接开赛）
    if (this.onEvent) {
      this.onEvent('restart', {});
    }
  },

  _removeUI() {
    if (this.dom) {
      if (this.dom.bar && this.dom.bar.parentNode) this.dom.bar.parentNode.removeChild(this.dom.bar);
      if (this.dom.overlay && this.dom.overlay.parentNode) this.dom.overlay.parentNode.removeChild(this.dom.overlay);
      this.dom = null;
    }
  }
};

// ========== Boss配置表 ==========
const BOSS_CONFIGS = {
  // ===== 第1章：阿岩（活泼冒失的学弟侦探）=====
  109: {
    name: '阿岩',
    avatar: 'assets/images/ayan-avatar.png',
    color: '#22c55e',
    speedMin: 6000,
    speedMax: 11000,
    mistakeChance: 0.15,
    fillStyle: 'random',
    personality: '新手侦探，东一榔头西一棒子，冒失但不服输',
    preDialog: [
      { speaker: '阿岩', text: '等等！这关学完你就要离开第一章了，先和我比一场再说！' },
      { speaker: '阿岩', text: '规则很简单——我们解同一道题，谁先填到75%谁赢！迷雾里你只能看到自己周围哦，小心我偷偷超车！' }
    ],
    winDialog: [
      { speaker: '阿岩', text: '哇！你好快！我还有好多格子没填呢……可恶，下次一定赢你！' },
      { speaker: '守笼人', text: '基本功扎实，速度也不错。你已经准备好进入第二章了。' }
    ],
    warningLines: [
      '他快赢了！加油啊！',
      '不好，阿岩要超了！冲！'
    ],
    encounterLines: {
      far:  [
        { text: '（阿岩在远处哼着歌）啦啦啦~这个简单！', intensity: 'light' },
        { text: '嗯？好像听到阿岩在念叨什么……', intensity: 'light' }
      ],
      mid:  [
        { text: '阿岩：嘿！被你发现了！看招！', intensity: 'medium' },
        { text: '阿岩：嘿嘿，这边这边~', intensity: 'medium' }
      ],
      near: [
        { text: '阿岩：哇靠！脸贴脸了！这个我先填！', intensity: 'strong' },
        { text: '阿岩：别抢别抢！这格是我的！', intensity: 'strong' }
      ]
    }
  },

  // ===== 第2章：守笼人（沉稳古风的档案馆守护者）=====
  208: {
    name: '守笼人',
    avatar: 'assets/images/keeper-avatar.png',
    color: '#6366f1',
    speedMin: 3500,
    speedMax: 6000,
    mistakeChance: 0.05,
    fillStyle: 'normal',
    personality: '沉稳从容的导师，古风措辞，不疾不徐',
    preDialog: [
      { speaker: '守笼人', text: '星衡法已全部教完。按照传统，结业需与守笼人对弈一局。' },
      { speaker: '阿岩', text: '加油！守笼人平时看起来慢吞吞的，其实解题可快了！注意迷雾里他的动向！' }
    ],
    winDialog: [
      { speaker: '守笼人', text: '……不错。你的星衡法已超越我预期。档案之道，你已入门。' },
      { speaker: '设局人', text: '哼，这就满足了？真正的挑战还在档案室深层等着你。' }
    ],
    warningLines: [
      '守笼人推进很快，集中注意力！',
      '守笼人的星衡推演不可小觑！'
    ],
    encounterLines: {
      far:  [
        { text: '（远处传来翻书声）……第四行，和为二十一。', intensity: 'light' },
        { text: '守笼人（低语）：此宫尚缺一子……', intensity: 'light' }
      ],
      mid:  [
        { text: '守笼人：你来了。不错，视野拓展得挺快。', intensity: 'medium' },
        { text: '守笼人：星衡之法，切记静观其变。', intensity: 'medium' }
      ],
      near: [
        { text: '守笼人：近在咫尺了。这一子，你我同争。', intensity: 'strong' },
        { text: '守笼人：好。最后几格，各凭本事。', intensity: 'strong' }
      ]
    }
  },

  // ===== 第3章：设局人残影（阴森冷酷的幻影）=====
  307: {
    name: '设局人残影',
    avatar: 'assets/images/shadow-avatar.jpg',
    color: '#ef4444',
    speedMin: 2500,
    speedMax: 4500,
    mistakeChance: 0.03,
    fillStyle: 'surround',
    personality: '冷酷阴森的残影，从四面包抄，语气嘲讽',
    preDialog: [
      { speaker: '设局人', text: '区块排除学得不错嘛。但在迷雾中，你还能找到方向吗？' },
      { speaker: '设局人', text: '让我看看——你到底是真的懂了，还是只是在照猫画虎。' }
    ],
    winDialog: [
      { speaker: '设局人', text: '……你的区块逻辑，确实比我预想的要纯熟。但残影只是残影。' },
      { speaker: '守笼人', text: '不要得意。第四章的残局逆向推导，才是真正的考验。' }
    ],
    warningLines: [
      '残影从四面逼近，不能再犹豫了！',
      '包围圈在缩小！快！'
    ],
    encounterLines: {
      far:  [
        { text: '（阴冷的笑声）呵……找到我了？', intensity: 'light' },
        { text: '设局人：你以为那是迷雾？不，那是我的笼。', intensity: 'light' }
      ],
      mid:  [
        { text: '设局人：左……右……你猜我在哪边？', intensity: 'medium' },
        { text: '设局人：区块排除？在我面前，你什么都排除不了。', intensity: 'medium' }
      ],
      near: [
        { text: '设局人：太晚了。这一片，已经是我的了。', intensity: 'strong' },
        { text: '设局人：看着你的视野被吞噬吧……', intensity: 'strong' }
      ]
    }
  },

  // ===== 第4章：残局守护者（哀伤追忆的笔记残魂）=====
  406: {
    name: '残局守护者',
    avatar: 'assets/images/guardian-avatar.jpg',
    color: '#f97316',
    speedMin: 2000,
    speedMax: 3800,
    mistakeChance: 0.02,
    fillStyle: 'normal',
    personality: '旧笔记中沉睡的残留意念，哀伤、追忆、不属于这个时代',
    preDialog: [
      { speaker: '阿岩', text: '笔记上的字迹在发光……这是怎么回事？！' },
      { speaker: '守笼人', text: '这是当年对决的残留意念。在迷雾中它不会手下留情。' }
    ],
    winDialog: [
      { speaker: '阿岩', text: '（笔记上的字迹慢慢褪去）「……后来者，你比当年的他更有勇气。」' },
      { speaker: '守笼人', text: '你看到了当年的真相。但星辰梭的秘密，还在更深的地方。' }
    ],
    warningLines: [
      '笔记上的字迹越来越亮，它在加速！',
      '守护者的执念太深了，快阻止它！'
    ],
    encounterLines: {
      far:  [
        { text: '（泛黄的纸页沙沙声）……三十年前……也是这样的雾……', intensity: 'light' },
        { text: '守护者：残局……尚未终了……', intensity: 'light' }
      ],
      mid:  [
        { text: '守护者：你也来解这残局吗……和当年那个人一样……', intensity: 'medium' },
        { text: '守护者：逆向……推导……回到原点……', intensity: 'medium' }
      ],
      near: [
        { text: '守护者：这一格……是他当年填错的地方……你呢？', intensity: 'strong' },
        { text: '守护者：不要重蹈覆辙……不要像他一样……', intensity: 'strong' }
      ]
    }
  },

  // ===== 第5章：星辰梭（冰冷机械的推演机器）=====
  506: {
    name: '星辰梭',
    avatar: 'assets/images/starshuttle-avatar.jpg',
    color: '#a855f7',
    speedMin: 1500,
    speedMax: 2800,
    mistakeChance: 0.01,
    fillStyle: 'surround',
    personality: '冰冷的自动推演机器，无感情，机械运转，数据化措辞',
    preDialog: [
      { speaker: '设局人', text: '你走到了星辰梭的核心。它会自动迎击任何入侵者。' },
      { speaker: '阿岩', text: '它……它不是人？那它解题岂不是——' },
      { speaker: '守笼人', text: '星辰梭推演笼局的速度远超人类。在迷雾中你几乎看不到它的动向，必须全神贯注。' }
    ],
    winDialog: [
      { speaker: '设局人', text: '你居然赢过了星辰梭的自动推演……有意思。' },
      { speaker: '守笼人', text: '最后一章，终局笼局。设局人在那里等你。' }
    ],
    warningLines: [
      '警告：推演进度80%，建议立即加速。',
      '星辰梭推演速度飙升，快！'
    ],
    encounterLines: {
      far:  [
        { text: '【机械运转声】咔嗒……咔嗒……推演中……', intensity: 'light' },
        { text: '星辰梭：检测到入侵者。启动笼局推演协议。', intensity: 'light' }
      ],
      mid:  [
        { text: '星辰梭：区块扫描完成。目标方向锁定。', intensity: 'medium' },
        { text: '星辰梭：当前推演效率：人类的4.7倍。', intensity: 'medium' }
      ],
      near: [
        { text: '星辰梭：接触。交集格判定中……此方归属：争夺。', intensity: 'strong' },
        { text: '星辰梭：警告——入侵者速度超出预期阈值。', intensity: 'strong' }
      ]
    }
  },

  // ===== 第6章：设局人本体（终局之敌，深不可测）=====
  606: {
    name: '设局人',
    avatar: 'assets/images/setter-avatar.png',
    color: '#dc2626',
    speedMin: 1000,
    speedMax: 2000,
    mistakeChance: 0.005,
    fillStyle: 'surround',
    personality: '终局之敌，深不可测，从容优雅，一切尽在掌握的压迫感',
    preDialog: [
      { speaker: '设局人', text: '你来了。三十年来，你是第一个走到这里的人。' },
      { speaker: '守笼人', text: '……' },
      { speaker: '阿岩', text: '最后一战了吧？来吧！' },
      { speaker: '设局人', text: '终局笼局，二十三提示数。迷雾中你什么也看不清——让我看看，你到底值不值得我等这三十年。' }
    ],
    winDialog: [
      { speaker: '设局人', text: '……哈。哈哈哈。' },
      { speaker: '设局人', text: '三十年了。终于有人，亲手破了我的笼局。' },
      { speaker: '守笼人', text: '老家伙……你等的不就是这一天吗。' },
      { speaker: '阿岩', text: '所以……一切都结束了？' },
      { speaker: '设局人', text: '档案侦探，恭喜你——笼中密码，已被你解开。' }
    ],
    warningLines: [
      '「笼局即将闭合——你，还剩几格？」',
      '设局人已经快到终局了！拼了！'
    ],
    encounterLines: {
      far:  [
        { text: '设局人：我布下的迷雾，好看吗？', intensity: 'light' },
        { text: '设局人：三十年布局，一子未落错。你呢？', intensity: 'light' }
      ],
      mid:  [
        { text: '设局人：你比我想象中走得更远。但也仅此而已。', intensity: 'medium' },
        { text: '设局人：四面都是我的笼，你往哪里逃？', intensity: 'medium' }
      ],
      near: [
        { text: '设局人：来。最后几格，让我看看你三十年等待的价值。', intensity: 'strong' },
        { text: '设局人：终局面前，你我平等。填吧。', intensity: 'strong' }
      ]
    }
  },

  // 第706关：秘术大师 - 设局人完全体
  706: {
    name: '设局人·秘术',
    avatar: 'assets/images/setter-avatar.png',
    color: '#a855f7',
    speedMin: 800,
    speedMax: 1600,
    mistakeChance: 0.003,
    fillStyle: 'surround',
    personality: '秘术全开的设局人，运用X-Wing、剑鱼等高级技巧，速度极快但仍保持大师的优雅',
    preDialog: [
      { speaker: '设局人（秘术）', text: '看来你已经读过了全部六卷秘术。' },
      { speaker: '阿岩', text: '他的气场变了……比终局时还要强！' },
      { speaker: '设局人（秘术）', text: '这一次，我不会留手。数对、三链数、X翼、剑鱼——我会全部用出来。' },
      { speaker: '守笼人', text: '小心！这是他真正的实力！' },
      { speaker: '设局人（秘术）', text: '秘术迷雾，展开。让我看看——你是否真的理解了星辰梭的奥义。' }
    ],
    winDialog: [
      { speaker: '设局人（秘术）', text: '……' },
      { speaker: '设局人（秘术）', text: '好。好！你不仅学会了秘术——你已经能在实战中运用它们了。' },
      { speaker: '阿岩', text: '我们……赢了？我们真的赢了设局人完全体？！' },
      { speaker: '设局人（秘术）', text: '从今天起，「秘术大师」的称号属于你。星辰梭的传承，正式交到你手中。' },
      { speaker: '守笼人', text: '（微微点头）恭喜你，真正的大师。' }
    ],
    warningLines: [
      '设局人秘术全开了！X-Wing和剑鱼接连出手，快追！',
      '他在使用剑鱼构型！不能让他完成！'
    ],
    encounterLines: {
      far:  [
        { text: '设局人：看到那个数对了吗？我看到了。', intensity: 'light' },
        { text: '设局人：三链数……你还没发现吗？', intensity: 'light' },
        { text: '设局人：我用X-Wing删去了你的可能性。', intensity: 'light' }
      ],
      mid:  [
        { text: '设局人：剑鱼已经布下，你逃不掉了。', intensity: 'medium' },
        { text: '设局人：你的每一步，都在我的计算之中。', intensity: 'medium' },
        { text: '设局人：秘术推演……比你想象得更快。', intensity: 'medium' }
      ],
      near: [
        { text: '设局人：这就是……秘术的尽头。来吧，最后几格！', intensity: 'strong' },
        { text: '设局人：你让我想起了年轻时的自己。不要让我失望。', intensity: 'strong' }
      ]
    }
  }
};
