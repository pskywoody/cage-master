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

    // 选择初始起点：找一个角落的预填数字集群作为唯一初始锚点
    this._chooseStartAnchors();

    // 初始视野（只有起点锚点可见）
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

    this.aiTimer = setTimeout(() => this._aiStep(), this.aiStartDelay);
    console.log('🏁 幽灵迷雾对战开始！');

    // ===== 引导提示（按时间顺序触发）=====
    // 提示1：开赛后2秒，指引玩家从可见区域开始
    this._scheduleTip('start', 2000, {
      icon: '🔦',
      title: '从光亮处开始',
      text: '你只能看到一小片区域。点击可见的空格，填入正确数字来揭开迷雾！'
    });
    // 提示2：开赛后7秒，提醒AI幽灵格
    this._scheduleTip('ghost', 7000, {
      icon: '👻',
      title: '注意对手！',
      text: '看到边缘闪烁的幽灵格了吗？那是' + this.opponent.name + '填的。填对同一格就能抢过来！'
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
   * AI开局预填：在初始可见区域边界附近放1-2个幽灵格
   * 选半雾区域(fogLevel=0.5)中最靠近左上角(AI方向)的空格子
   */
  _preFillAiEdgeGhosts() {
    const size = this.size;
    const candidates = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.fixedMask[r][c]) continue;
        if (this.playerOwned[r][c] > 0) continue;
        // 选半雾区域（视野边缘）
        if (this.fogLevel && this.fogLevel[r] && this.fogLevel[r][c] === 0.5) {
          // 评分：越靠近左上角（AI方向）分数越高，越靠近可见区边缘越好
          const score = (size - r) * size + (size - c);
          candidates.push({ r, c, score });
        }
      }
    }

    // 按分数排序（AI从左上方向逼近）
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
          text: '填对数字后周围迷雾散开了。注意雾中的金色光点——那是隐藏的预填数字，靠近就能发现！'
        });
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
   * 更新视野可见性：收集所有玩家锚点，计算每个空格到最近锚点的曼哈顿距离
   * 返回三级可见度：0=完全可见，0.5=半雾边缘，1=全雾
   */
  _updateVisibility() {
    // 收集锚点：已发现的固定数字 + 玩家已填正确格子（抢来的也算）
    // 注意：未发现的固定数字不作为锚点！玩家必须探索到它们附近才能"发现"
    const anchors = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if ((this.fixedMask[r][c] && this.revealedFixed[r][c]) || this.playerOwned[r][c] > 0) {
          anchors.push({ r, c });
        }
      }
    }

    // 没有锚点（极端情况）时全雾
    if (anchors.length === 0) {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          this.visible[r][c] = false;
        }
      }
      if (!this.fogLevel) this.fogLevel = Array(this.size).fill().map(() => Array(this.size).fill(1));
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          this.fogLevel[r][c] = 1;
        }
      }
      return;
    }

    if (!this.fogLevel) this.fogLevel = Array(this.size).fill().map(() => Array(this.size).fill(1));

    // 对每个格子计算最近锚点距离
    const newDiscovered = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        let minDist = Infinity;
        for (const a of anchors) {
          const d = Math.abs(r - a.r) + Math.abs(c - a.c);
          if (d < minDist) minDist = d;
        }
        this.visible[r][c] = (minDist <= this.visionRange);
        // 三级迷雾：距离内=清晰(0)，距离+1=半雾(0.5)，更远=全雾(0.92)
        if (minDist <= this.visionRange) {
          this.fogLevel[r][c] = 0;
        } else if (minDist === this.visionRange + 1) {
          this.fogLevel[r][c] = 0.5;
        } else {
          this.fogLevel[r][c] = 0.92;
        }

        // 自动发现：只有当视野真正扩展到预填数字位置（距离≤visionRange，清晰可见区）时才"发现"它
        // 半雾区（visionRange+1）只能看到淡点暗示，必须再填一格才能看清数字
        if (this.fixedMask[r][c] && !this.revealedFixed[r][c] && minDist <= this.visionRange) {
          this.revealedFixed[r][c] = true;
          newDiscovered.push({ r, c });
        }
      }
    }

    // 如果发现了新的预填数字，它们成为新锚点，需要重新计算视野（连锁发现）
    if (newDiscovered.length > 0) {
      // 给新发现的格子加闪光效果
      for (const { r, c } of newDiscovered) {
        this.discoverFlash[r][c] = 1;
      }
      // 触发发现事件
      if (this.onEvent) {
        this.onEvent('discover', { cells: newDiscovered });
      }
      // 第一次发现预填数时，提示"发现了新线索"
      this._showTipNow('discover', {
        icon: '✨',
        title: '发现了新线索！',
        text: '金光闪烁的格子是预填的提示数字，它们会帮你推理。继续填数来揭开更多区域！'
      });
      // 递归更新视野（新锚点可能揭开更多区域和更多预填数字）
      this._updateVisibility();
    }
  },

  /**
   * 选择初始起点锚点：找右下角附近预填数字最密集的小区域
   * 这样玩家从角落开始，向AI方向（左上角）推进
   */
  _chooseStartAnchors() {
    const size = this.size;
    // 收集所有预填数字位置
    const fixedCells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.fixedMask[r][c]) {
          fixedCells.push({ r, c });
        }
      }
    }
    if (fixedCells.length === 0) return;

    // 策略：选择右下角区域的预填数字（玩家从右下出发，AI从左上方向推进）
    // 找到右下角（r+c最大）的预填数字作为起点
    let startCell = fixedCells[0];
    let maxScore = -1;
    for (const cell of fixedCells) {
      // 评分：越靠近右下角分数越高（r*size + c 越大越好）
      const score = cell.r * size + cell.c;
      if (score > maxScore) {
        maxScore = score;
        startCell = cell;
      }
    }

    // 标记起点及其紧邻的1个预填数字（形成最小启动区域，刚好能看到1-2个笼子线索）
    this.revealedFixed[startCell.r][startCell.c] = true;

    // 找一个紧邻的预填数字（曼哈顿距离=1），一起揭开，形成最小可解区域
    for (const cell of fixedCells) {
      if (cell.r === startCell.r && cell.c === startCell.c) continue;
      const d = Math.abs(cell.r - startCell.r) + Math.abs(cell.c - startCell.c);
      if (d <= 1) {
        this.revealedFixed[cell.r][cell.c] = true;
        break; // 只多揭一个
      }
    }

    console.log(`🎯 初始起点: (${startCell.r},${startCell.c}), 已发现锚点数: ${this.revealedFixed.flat().filter(Boolean).length}`);
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

          // 发现预填数闪光衰减
          if (this.discoverFlash[r][c] > 0) {
            this.discoverFlash[r][c] -= 16 / 800; // 800ms
            if (this.discoverFlash[r][c] < 0) this.discoverFlash[r][c] = 0;
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
    }
    if (playerPct >= 0.6 && !this.warning60Shown.player) {
      this.warning60Shown.player = true;
      // 玩家到60%时不震自己，但可以有正向提示
      if (this.onEvent) this.onEvent('warning', { who: 'player', pct: playerPct });
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

    const cs = cellSize;
    ctx.save();
    ctx.translate(padding, padding);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const x = c * cs;
        const y = r * cs;
        const fog = this.fogOpacity[r][c];
        const flick = this.ghostFlicker;

        // === 固定数字处理 ===
        if (this.fixedMask[r][c]) {
          const isRevealed = this.revealedFixed[r][c];
          const dFlash = this.discoverFlash[r][c];

          if (isRevealed) {
            // 已发现的预填数字：迷雾正常覆盖（数字由renderer绘制）
            if (fog > 0.01) {
              ctx.fillStyle = `rgba(15, 23, 42, ${Math.min(0.95, fog * 0.95)})`;
              ctx.fillRect(x, y, cs, cs);
            }
            // 发现闪光动画
            if (dFlash > 0) {
              const expand = (1 - dFlash) * cs * 0.8;
              ctx.strokeStyle = `rgba(251, 191, 36, ${dFlash * 0.8})`;
              ctx.lineWidth = 2 + dFlash * 2;
              this._roundRect(ctx, x + 2 - expand, y + 2 - expand, cs - 4 + expand * 2, cs - 4 + expand * 2, 6);
              ctx.stroke();
              // 金色填充闪光
              ctx.fillStyle = `rgba(251, 191, 36, ${dFlash * 0.2})`;
              ctx.fillRect(x, y, cs, cs);
            }
          } else {
            // 未发现的预填数字：完全遮盖数字，只在半雾区显示淡点暗示"这里有线索"
            // 始终用厚迷雾遮盖（不管fog值多少，未发现就不显示数字）
            ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
            ctx.fillRect(x, y, cs, cs);

            // 在半雾区（离已发现区域不远）显示淡金色圆点，暗示"这里有线索"
            const fogLevel = (this.fogLevel && this.fogLevel[r]) ? this.fogLevel[r][c] : 0.92;
            if (fogLevel < 0.9) {
              const dotAlpha = (0.92 - fogLevel) * 0.6; // 越近越亮
              const dotR = cs * (0.08 + flick * 0.02);
              ctx.fillStyle = `rgba(251, 191, 36, ${dotAlpha})`;
              ctx.beginPath();
              ctx.arc(x + cs / 2, y + cs / 2, dotR, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          continue;
        }

        const isAi = this.aiOwned[r][c] > 0;
        const isPlayerOwned = this.playerOwned[r][c] > 0;
        const pulse = this.aiPulse[r][c];

        // 1. 幽灵格：AI填的格子
        if (isAi && !isPlayerOwned) {
          // 1a. 迷雾中也能看到极淡的幽灵轮廓（神秘感+知道AI存在）
          if (fog >= 0.5) {
            // 迷雾中：极淡的呼吸边框，暗示AI存在
            const ghostAlpha = 0.12 + flick * 0.08;
            ctx.strokeStyle = this.opponent.color + Math.round(ghostAlpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            this._roundRect(ctx, x + 3, y + 3, cs - 6, cs - 6, 3);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // 1b. 视野内（或半雾中）：明显的幽灵格
          if (fog < 0.7) {
            const ghostAlpha = 1 - fog; // 越清晰越明显

            // 幽灵格底色（对手色半透明，更饱和）
            ctx.fillStyle = this.opponent.color + Math.round(0.28 * ghostAlpha * 255).toString(16).padStart(2, '0');
            this._roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, 4);
            ctx.fill();

            // 幽灵格边框（呼吸效果）
            const borderAlpha = 0.5 + flick * 0.2;
            ctx.strokeStyle = this.opponent.color + Math.round(borderAlpha * ghostAlpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 1.5;
            this._roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, 4);
            ctx.stroke();

            // 幽灵格中心圆点（呼吸放大缩小）
            const dotR = cs * (0.12 + flick * 0.04);
            ctx.fillStyle = this.opponent.color + Math.round(0.8 * ghostAlpha * 255).toString(16).padStart(2, '0');
            ctx.beginPath();
            ctx.arc(x + cs / 2, y + cs / 2, dotR, 0, Math.PI * 2);
            ctx.fill();

            // 幽灵格问号（半雾中显示?提示有东西但看不清数字）
            if (fog > 0.2 && fog < 0.7) {
              ctx.fillStyle = this.opponent.color + '88';
              ctx.font = `bold ${Math.round(cs * 0.35)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('?', x + cs / 2, y + cs / 2);
            }
          }

          // 1c. AI填格脉冲动画（刚填时的扩散波）
          if (pulse > 0) {
            const expand = (1 - pulse) * cs * 0.5;
            ctx.strokeStyle = this.opponent.color + Math.round(pulse * 200).toString(16).padStart(2, '0');
            ctx.lineWidth = 2 + pulse * 2;
            this._roundRect(ctx, x + 2 - expand, y + 2 - expand, cs - 4 + expand * 2, cs - 4 + expand * 2, 6);
            ctx.stroke();
          }
        }

        // 2. 迷雾层：真正遮住数字的暗色蒙版
        let isSelectedCell = false;
        if (fog > 0.01) {
          // 检查是否是当前选中格（雾中选中有特殊窥视效果）
          if (typeof guideBoard !== 'undefined' && guideBoard) {
            const cell = guideBoard.cells[r] && guideBoard.cells[r][c];
            isSelectedCell = cell && (cell.isSelected || (guideBoard.selectedCell && guideBoard.selectedCell.r === r && guideBoard.selectedCell.c === c));
          }

          // 迷雾主色——深色蒙版。选中格的迷雾稍浅，让玩家知道选中了
          const fogAlpha = isSelectedCell ? Math.min(0.95, fog * 0.65) : Math.min(0.95, fog * 0.95);
          ctx.fillStyle = `rgba(15, 23, 42, ${fogAlpha})`;
          ctx.fillRect(x, y, cs, cs);

          // 迷雾纹理：雾气流动效果（使用正弦波模拟）
          if (fog > 0.3) {
            const t = Date.now() / 2000;
            const fogAlpha2 = fog * 0.12;
            ctx.fillStyle = `rgba(100, 116, 139, ${fogAlpha2})`;
            // 两层交错三角形模拟雾气
            ctx.beginPath();
            ctx.moveTo(x, y + cs * (0.3 + Math.sin(t + r + c) * 0.1));
            ctx.lineTo(x + cs * (0.3 + Math.cos(t + r) * 0.1), y);
            ctx.lineTo(x + cs, y + cs * (0.7 + Math.sin(t + c) * 0.1));
            ctx.lineTo(x + cs * (0.7 + Math.cos(t + c) * 0.1), y + cs);
            ctx.closePath();
            ctx.fill();
          }

          // 雾中选中格：显示一个淡蓝色边框+问号，提示"你选中了这个位置"
          if (isSelectedCell && fog > 0.3) {
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.5 + flick * 0.2})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            this._roundRect(ctx, x + 3, y + 3, cs - 6, cs - 6, 4);
            ctx.stroke();
            ctx.setLineDash([]);
            // 问号提示
            ctx.fillStyle = 'rgba(147, 197, 253, 0.7)';
            ctx.font = `bold ${Math.round(cs * 0.32)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', x + cs / 2, y + cs / 2);
          }
        }

        // 3. 抢格子闪光（增强：绿色波环扩散）
        const flash = this.stealFlash[r][c];
        if (flash > 0) {
          // 底色闪光
          ctx.fillStyle = `rgba(34, 197, 94, ${flash * 0.4})`;
          ctx.fillRect(x, y, cs, cs);
          // 边框加粗
          ctx.strokeStyle = `rgba(34, 197, 94, ${flash})`;
          ctx.lineWidth = 2 + flash * 3;
          ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
          // 扩散波环
          const expand = (1 - flash) * cs * 0.6;
          ctx.strokeStyle = `rgba(34, 197, 94, ${flash * 0.6})`;
          ctx.lineWidth = 2;
          this._roundRect(ctx, x + 1 - expand, y + 1 - expand, cs - 2 + expand * 2, cs - 2 + expand * 2, 8);
          ctx.stroke();
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

      // 触发AI填格事件（音效+轻微震动）
      if (this.onEvent) {
        this.onEvent('aiFill', { r, c });
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
        <div class="boss-avatar" id="boss-avatar"></div>
        <div class="boss-detail">
          <div class="boss-name" id="boss-name"></div>
          <div class="boss-progress-bar">
            <div class="boss-progress-fill" id="boss-progress-fill"></div>
          </div>
        </div>
        <span class="boss-progress-text" id="boss-progress-text">0%</span>
      </div>
      <div class="vs-divider">VS</div>
      <div class="player-info">
        <span class="player-progress-text" id="player-progress-text">0%</span>
        <div class="player-detail">
          <div class="player-name">你</div>
          <div class="player-progress-bar">
            <div class="player-progress-fill" id="player-progress-fill"></div>
          </div>
        </div>
        <div class="player-avatar">🔍</div>
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
  },

  _updateUI() {
    const aiPct = Math.min(100, Math.floor((this.aiCount / this.winTarget) * 100));
    const playerPct = Math.min(100, Math.floor((this.playerCount / this.winTarget) * 100));

    const aiFill = document.getElementById('boss-progress-fill');
    const aiText = document.getElementById('boss-progress-text');
    const playerFill = document.getElementById('player-progress-fill');
    const playerText = document.getElementById('player-progress-text');

    if (aiFill) {
      aiFill.style.width = Math.min(100, aiPct) + '%';
      aiFill.style.background = `linear-gradient(90deg, ${this.opponent.color}, ${this.opponent.color}cc)`;
      // AI进度条脉冲动画
      aiFill.parentElement?.classList.add('ai-step');
      setTimeout(() => aiFill.parentElement?.classList.remove('ai-step'), 500);
    }
    if (aiText) aiText.textContent = Math.floor(this.aiCount / this.totalEmpty * 100) + '%';
    if (playerFill) playerFill.style.width = Math.min(100, playerPct) + '%';
    if (playerText) playerText.textContent = Math.floor(this.playerCount / this.totalEmpty * 100) + '%';

    const bar = document.getElementById('boss-battle-bar');
    if (bar) {
      if (aiPct > playerPct + 20) {
        bar.classList.add('boss-leading');
      } else {
        bar.classList.remove('boss-leading');
      }
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
    avatar: '👦',
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
    avatar: '🧙',
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
    avatar: '👤',
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
    avatar: '📜',
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
    avatar: '⚙️',
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
    avatar: '🎭',
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
  }
};
