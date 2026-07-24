/**
 * GuideBattle - 章节Boss战系统
 * 参考 cagemaster2 的实现，提供玩家与AI角色同盘竞速的Boss战体验
 */

const BOSS_CONFIGS = {
  // 第1章：阿妍 - 新手侦探，冒失但不服输
  // 试炼石Boss战：6×6杀手数独 + 机关锁格机制
  1: {
    id: 'yan',
    name: '阿妍',
    portrait: 'R_01_冷静.png',
    color: '#22c55e',
    speedMin: 6000,
    speedMax: 11000,
    mistakeChance: 0.15,
    personality: '新手侦探，东一榔头西一棒子，冒失但不服输',

    // ---- 试炼石Boss战专用关卡（6×6杀手数独） ----
    battleData: {
      levelId: 109,
      title: '第9关：试炼石',
      gridSize: 6,
      difficulty: 2,
      isBoss: true,
      features: ['killer', 'lock_cells'],
      boardData: [
        [0,0,3,4,5,0],
        [0,0,6,0,0,0],
        [0,3,1,0,0,0],
        [5,6,0,0,3,0],
        [0,0,2,0,4,0],
        [6,4,5,3,0,2],
      ],
      cages: [
        { id: 'A', sum: 5,  cells: [[0,0],[1,0]] },
        { id: 'B', sum: 11, cells: [[0,1],[0,2],[1,2]] },
        { id: 'C', sum: 5,  cells: [[0,3],[1,3]] },
        { id: 'D', sum: 11, cells: [[0,4],[0,5]] },
        { id: 'E', sum: 8,  cells: [[1,1],[2,1]] },
        { id: 'F', sum: 8,  cells: [[1,4],[2,4]] },
        { id: 'G', sum: 7,  cells: [[1,5],[2,5]] },
        { id: 'H', sum: 7,  cells: [[2,0],[3,0]] },
        { id: 'I', sum: 10, cells: [[2,2],[2,3],[3,2]] },
        { id: 'J', sum: 7,  cells: [[3,1],[4,1]] },
        { id: 'K', sum: 8,  cells: [[3,3],[4,3]] },
        { id: 'L', sum: 4,  cells: [[3,4],[3,5]] },
        { id: 'M', sum: 9,  cells: [[4,0],[5,0]] },
        { id: 'N', sum: 7,  cells: [[4,2],[5,2]] },
        { id: 'O', sum: 5,  cells: [[4,4],[5,4]] },
        { id: 'P', sum: 7,  cells: [[4,5],[5,5]] },
        { id: 'Q', sum: 7,  cells: [[5,1],[5,3]] },
      ],
      solution: [
        [1,2,3,4,5,6],
        [4,5,6,1,2,3],
        [2,3,1,5,6,4],
        [5,6,4,2,3,1],
        [3,1,2,6,4,5],
        [6,4,5,3,1,2],
      ],
      // 机关锁配置（3个关键笼，填满解锁）
      lockCells: [
        { cageId: 'A', releaseEvent: 'gear_1' },
        { cageId: 'F', releaseEvent: 'gear_2' },
        { cageId: 'K', releaseEvent: 'gear_3' },
      ],
    },

    preDialog: [
      { speaker: '阿妍', text: '终于到这一关了！我可是准备了好久！', emotion: 'smile' },
      { speaker: '阿妍', text: '虽然我是新手，但我绝对不会输的！来比试比试吧！', emotion: 'confident' },
    ],
    winDialog: [
      { speaker: '阿妍', text: '唔……你好厉害啊……我输得心服口服。', emotion: 'lose' },
      { speaker: '阿妍', text: '不过我不会放弃的！下次我一定会赢回来！', emotion: 'serious' },
    ],
    warningLines: [
      { speaker: '阿妍', text: '哎呀，我快填完了哦~', emotion: 'smile' },
    ],
  },
  // 第2章：守笼人 - 沉稳导师，不疾不徐
  // 杀手数独专属配置：大幅降低节奏，给玩家留足心算空间
  2: {
    id: 'cagekeeper',
    name: '守笼人',
    portrait: 'CK_01_庄重.png',
    color: '#6366f1',
    speedMin: 5500,        // 杀手数独：大幅增加基础思考时间
    speedMax: 8500,        // 给玩家留足心算和组合拆分的时间
    mistakeChance: 0.08,
    personality: '沉稳从容的导师，古风措辞，不疾不徐',
    // 杀手数独Boss战特殊调整：大幅降低压迫感，适配心算节奏
    aiDifficulty: {
      maxTechLevel: 4,         // 降到4级（只用到星衡法则级别）
      discoveryMultiplier: 0.7,  // 发现率打7折，AI更"慢半拍"
      speedMultiplier: 1.5,     // 速度再慢50%（delay乘以1.5）
      mistakeMultiplier: 2.0,    // 失误率提高到2倍
      interceptMultiplier: 0.3,  // 拦截欲望降到30%，减少打断思路
    },
    // 杀手数独专属：Boss战机制调整
    battleTuning: {
      isKiller: true,              // 标记为杀手数独关卡
      interceptCooldown: 8000,     // 拦截冷却从3秒增加到8秒
      ultTriggerAt: 0.85,          // 必杀技触发从70%延后到85%
      warningPhase1At: 0.70,       // 第一阶段预警从60%延后到70%
      warningPhase2At: 0.85,       // 第二阶段预警从70%延后到85%
      fadeCagesInBattle: true,     // Boss战中淡化笼子虚线，降低视觉负载
      pulseEnabled: true,          // 启用候选数脉冲机制
    },
    preDialog: [
      { speaker: '守笼人', text: '能走到这里，说明你已初窥门径。', emotion: 'serious' },
      { speaker: '守笼人', text: '老夫便亲自下场，看看你的斤两。', emotion: 'serious' },
    ],
    winDialog: [
      { speaker: '守笼人', text: '后生可畏……你的进步，超乎老夫预期。', emotion: 'smile' },
      { speaker: '守笼人', text: '继续前行吧，更深处的谜题在等着你。', emotion: 'serious' },
    ],
    warningLines: [
      { speaker: '守笼人', text: '稳扎稳打，方为上策。', emotion: 'serious' },
    ],
  },
  // 第3章：设局人残影 - 冷酷阴森，四面包抄
  3: {
    id: 'plotterShadow',
    name: '设局人残影',
    portrait: 'P_02_残影态.png',
    color: '#ef4444',
    speedMin: 2500,
    speedMax: 4500,
    mistakeChance: 0.03,
    personality: '冷酷阴森的残影，从四面包抄，语气嘲讽',
    // 幻影格机制配置
    battleTuning: {
      fakeCellsEnabled: true,
      // 2个幻影格：位置 + 假数字 + 真数字
      fakeCells: [
        { r: 0, c: 7, fakeNum: 6, realNum: 8 },
        { r: 3, c: 1, fakeNum: 4, realNum: 7 },
      ],
    },
    preDialog: [
      { speaker: '设局人残影', text: '呵呵……又一个自以为是的挑战者。', emotion: 'smirk' },
      { speaker: '设局人残影', text: '让我看看，你能在我的阴影中撑多久。', emotion: 'smirk' },
    ],
    winDialog: [
      { speaker: '设局人残影', text: '不可能……区区人类……怎么可能……', emotion: 'angry' },
      { speaker: '设局人残影', text: '不过是残影罢了……真正的我，你还远远无法触及……', emotion: 'smirk' },
    ],
    warningLines: [
      { speaker: '设局人残影', text: '绝望吧……你逃不出我的阴影。', emotion: 'smirk' },
    ],
  },
  // 第4章：残局守护者 - 哀伤追忆的笔记残魂
  4: {
    id: 'remnant',
    name: '残局守护者',
    portrait: 'remnant_default.png',
    color: '#f97316',
    speedMin: 2000,
    speedMax: 3800,
    mistakeChance: 0.02,
    personality: '旧笔记中沉睡的残留意念，哀伤、追忆、不属于这个时代',
    // 三人联动锁机制：三区并蒂锁同步解锁 + 笔记浮现
    battleTuning: {
      regionLocksEnabled: true,
      regionLocks: [
        { id: 'lock_a', region: 'left', condition: 'all_filled', cells: [[0,0],[0,1],[1,0],[1,1]], revealNotes: [{r:0,c:2,notes:[3,5,7]}] },
        { id: 'lock_b', region: 'center', condition: 'all_filled', cells: [[4,4],[4,5],[5,4],[5,5]], revealNotes: [{r:3,c:3,notes:[2,4,8]}] },
        { id: 'lock_c', region: 'right', condition: 'all_filled', cells: [[7,7],[7,8],[8,7],[8,8]], revealNotes: [{r:6,c:6,notes:[1,6,9]}] },
      ],
    },
    preDialog: [
      { speaker: '残局守护者', text: '……又是来解谜的人吗。', emotion: 'default' },
      { speaker: '残局守护者', text: '这些残局……已经沉睡了很久很久……', emotion: 'stern' },
    ],
    winDialog: [
      { speaker: '残局守护者', text: '……你解开了。这么多年，你是第一个。', emotion: 'surprised' },
      { speaker: '残局守护者', text: '……也许，是时候让这些残局安息了。谢谢你。', emotion: 'default' },
    ],
    warningLines: [
      { speaker: '残局守护者', text: '……不要打扰这些沉睡的数字。', emotion: 'stern' },
    ],
  },
  // 第5章：星辰梭 - 冰冷的自动推演机器
  5: {
    id: 'weaver',
    name: '星辰梭',
    portrait: 'weaver_default.png',
    color: '#a855f7',
    speedMin: 1500,
    speedMax: 2800,
    mistakeChance: 0.01,
    personality: '冰冷的自动推演机器，无感情，机械运转，数据化措辞',
    // 嵌套笼坍缩机制：笼边界收缩 + 释放隐藏和值
    battleTuning: {
      cageCollapseEnabled: true,
      collapseConfig: {
        stages: [
          { progress: 0.3, revealOuterSum: false, description: '外层笼开始收缩' },
          { progress: 0.6, revealOuterSum: true, description: '外层笼和值显现' },
          { progress: 0.9, fullyCollapsed: true, description: '外层笼完全坍缩' },
        ],
        outerCageIds: ['cage_outer_1', 'cage_outer_2'],
      },
    },
    preDialog: [
      { speaker: '星辰梭', text: '检测到挑战者。开始推演。', emotion: 'default' },
      { speaker: '星辰梭', text: '胜率计算：玩家 12.7%。建议直接认输。', emotion: 'smirk' },
    ],
    winDialog: [
      { speaker: '星辰梭', text: '……错误。推演失败。玩家胜率超出计算范围。', emotion: 'angry' },
      { speaker: '星辰梭', text: '重新校准中……你是值得记录的异常值。', emotion: 'surprised' },
    ],
    warningLines: [
      { speaker: '星辰梭', text: '进度：70%。玩家胜率降至 5.3%。', emotion: 'default' },
    ],
  },
  // 第6章：设局人本体 - 终局之敌，深不可测
  6: {
    id: 'plotter',
    name: '设局人',
    portrait: 'P_01_常态.png',
    color: '#dc2626',
    speedMin: 1000,
    speedMax: 2000,
    mistakeChance: 0.005,
    personality: '终局之敌，深不可测，从容优雅，一切尽在掌握的压迫感',
    preDialog: [
      { speaker: '设局人', text: '你终于来了。我等这一天，已经等了很久。', emotion: 'smirk' },
      { speaker: '设局人', text: '让我看看，你是否有资格……与我对弈。', emotion: 'confident' },
    ],
    winDialog: [
      { speaker: '设局人', text: '……不错。你确实超出了我的预期。', emotion: 'surprised' },
      { speaker: '设局人', text: '但这还不是结束。真正的棋局，才刚刚开始。', emotion: 'smirk' },
    ],
    warningLines: [
      { speaker: '设局人', text: '怎么，就这点本事吗？我还没认真呢。', emotion: 'smirk' },
    ],
  },
  // 第7章：设局人·秘术 - 秘术全开完全体
  7: {
    id: 'setterSecret',
    name: '设局人·秘术',
    portrait: 'setter_secret_default.png',
    color: '#a855f7',
    speedMin: 800,
    speedMax: 1600,
    mistakeChance: 0.003,
    personality: '秘术全开的设局人，运用二连纵横阵、三才游鱼阵等高级技巧',
    preDialog: [
      { speaker: '设局人·秘术', text: '既然你能走到这里，那我便不再留手。', emotion: 'confident' },
      { speaker: '设局人·秘术', text: '见识一下吧，秘术全开的——真正的我。', emotion: 'smirk' },
    ],
    winDialog: [
      { speaker: '设局人·秘术', text: '……不可能。我的秘术……竟然被破解了？', emotion: 'angry' },
      { speaker: '设局人·秘术', text: '……你确实是特别的。也许，你能改变这一切。', emotion: 'surprised' },
    ],
    warningLines: [
      { speaker: '设局人·秘术', text: '二连纵横阵。三才游鱼阵。你能跟上吗？', emotion: 'smirk' },
    ],
  },
  // 第8章：沈墨 - 最终Boss
  8: {
    id: 'shenmo',
    name: '沈墨',
    portrait: 'SM_01_沉静.png',
    color: '#fbbf24',
    speedMin: 700,
    speedMax: 1400,
    mistakeChance: 0.002,
    personality: '沉静如水的最终对手，深不可测',
    preDialog: [
      { speaker: '沈墨', text: '你终于来了。', emotion: 'serious' },
      { speaker: '沈墨', text: '这最后一局，我等了很久。', emotion: 'confident' },
    ],
    winDialog: [
      { speaker: '沈墨', text: '……你赢了。', emotion: 'smile' },
      { speaker: '沈墨', text: '所有的谜题，都解开了。', emotion: 'sad' },
    ],
    warningLines: [
      { speaker: '沈墨', text: '专注。', emotion: 'serious' },
    ],
  },
};

const GuideBattle = {
  active: false,
  ended: false,
  result: null,
  opponent: null,
  solution: null,
  size: 9,
  aiOwned: null,
  playerOwned: null,
  aiCount: 0,
  playerCount: 0,
  totalEmpty: 0,
  winTarget: 0,

  // 三色加权得分系统
  _weightedScoreEnabled: false,  // 是否启用加权得分（需要TechRaterAdapter支持）
  _cellCategories: null,         // 初始空格分类二维数组: 'simple'|'core'|'gate'
  playerScore: 0,                // 玩家加权得分
  aiScore: 0,                    // AI加权得分
  maxScore: 0,                   // 满分（所有空格加权分总和）
  winScore: 0,                   // 胜利所需分数（= maxScore × 0.75）

  // 三色分值配置
  SCORE_WEIGHTS: {
    simple: 1,
    core: 1.5,
    gate: 2,
  },
  _aiTimer: null,
  _board: null,
  _renderer: null,
  _onEndCallback: null,
  _aiPlayer: null,
  _aiThinking: false,
  _warningTriggered: false,
  _correctCount: 0,

  // 连击系统相关
  _combo: {
    count: 0,           // 当前连击数
    bestCombo: 0,       // 最高连击
    stunActive: false,  // AI是否被震慑中
  },

  // 演出系统
  _events: [],          // 事件队列
  _eventPlaying: false, // 是否正在播放
  _eventTimer: null,    // 演出定时器

  // 事件优先级（数字越大优先级越高）
  EVENT_PRIORITY: {
    MISTAKE_LINE: 1,    // AI犯错台词（最低）
    SELF_CORRECT: 1,    // 自我修正台词
    INTERCEPT_LINE: 2,  // 拦截台词
    WARNING_LINE: 3,    // 预警台词
    COMBO: 3,           // 连击提示
    COMEBACK: 4,        // 翻盘提示
    SKILL_LINE: 5,      // 必杀技台词
    SKILL_EFFECT: 6,    // 必杀技特效
    WARNING_OVERLAY: 7, // 预警红光覆盖层（高）
    END_BATTLE: 99,     // 战斗结束（最高）
  },

  // 拦截系统相关
  _hoveredCell: null,
  _hoverStartTime: 0,
  _interceptCooldown: 0,

  // 假动作系统（设局人专属）
  _fakeMoves: [],        // [{r, c, expireTime}] 假幽灵格列表
  _fakeMoveTimer: null,  // 假动作定时器

  // 动态难度调节系统
  _difficulty: {
    enabled: true,
    // 当前AI速度倍率（1.0 = 基准速度，>1 = AI变慢，<1 = AI变快）
    speedMultiplier: 1.3,  // 开局AI慢30%，给玩家适应时间
    // 玩家填数记录 [{time, correct}]
    playerMoveTimes: [],
    // 玩家平均每格耗时（毫秒）
    playerAvgTime: 0,
    // 目标：AI速度 ≈ 玩家速度的 1.2~1.5倍（玩家略快，有优势）
    targetRatio: 1.3,
    // 最小/最大速度倍率（防止太极端）
    minMultiplier: 0.5,   // AI最快只能到基准速度的50%
    maxMultiplier: 2.5,   // AI最慢可以到基准速度的250%
    // 平滑系数（每次调整变化不超过这个比例）
    smoothFactor: 0.15,
    // 上次调整时间
    lastAdjustTime: 0,
    // 调整间隔（毫秒），避免频繁调整
    adjustInterval: 8000,
  },

  // ============================================================
  //  Boss战特殊机制扩展字段
  //  按需初始化，默认 null/空
  // ============================================================

  // ---- 第1章：机关锁格 ----
  _lockStates: new Map(),     // cageId -> {released: boolean, releaseTime: number}
  _allLocksReleased: false,   // 三锁是否全部打开

  // ---- 第2章：候选数脉冲 ----
  _pulseInterval: 45000,
  _pulseDuration: 3000,
  _pulseTimer: null,
  _isPulsing: false,

  // ---- 第3章：幻影格 ----
  _fakeCellsData: [],
  _fakeCellExposed: [],

  // ---- 第4章：联动锁 ----
  _regionLockStates: {},       // id -> {locked, primed, released, releaseTime, region, cells, condition, revealNotes}
  _allRegionLocksReleased: false,

  // ---- 第5章：坍缩 ----
  _collapseProgress: 0,        // 0~1
  _isCollapsing: false,
  _collapseStage: 0,           // 当前阶段索引
  _collapsedCages: null,       // 已完全坍缩的笼子ID集合（Set）

  // ---- 第6章：双解 ----
  _dualPathChosen: null,

  // ---- 第7章：三阶段 ----
  _currentPhase: 1,

  // ---- 难度保底系统 ----
  _stuckTimer: 0,
  _stuckThreshold: 180000, // 3分钟
  _aidUsed: false,

  /**
   * 启动Boss战
   */
  start(options) {
    if (!options.board || !options.solution) {
      console.error('[GuideBattle] Missing required options');
      return;
    }

    this.active = true;
    this._startTime = Date.now();
    this.ended = false;
    this.result = null;
    this._board = options.board;
    this._renderer = options.renderer;
    this.solution = options.solution;
    this.opponent = options.opponent;
    // 修正：使用 board.size 而非 gridSize（与 Board 类保持一致）
    this.size = options.board.size || 9;
    this._warningTriggered = false;
    this._correctCount = 0;
    this._warning60Triggered = false;
    this._warning70Triggered = false;
    this._interceptCooldown = 0;
    // 初始化假动作系统
    this._fakeMoves = [];
    if (this._fakeMoveTimer) {
      clearInterval(this._fakeMoveTimer);
      this._fakeMoveTimer = null;
    }
    // 初始化连击系统
    this._combo = {
      count: 0,
      bestCombo: 0,
      stunActive: false,
    };
    // 喜剧/成就计数器
    this._aiMistakeCount = 0;
    this._playerMistakeCount = 0;
    this._stealCount = 0;
    this._maxDeficit = 0; // 玩家最大落后格数
    // 初始化动态难度系统
    if (this._difficulty) {
      this._difficulty.speedMultiplier = 1.3; // 开局慢30%
      this._difficulty.playerMoveTimes = [];
      this._difficulty.playerAvgTime = 0;
      this._difficulty.lastAdjustTime = Date.now();
    }
    this._onEndCallback = options.onEnd || null;

    // ===== 初始化Boss战特殊机制 =====
    this._initBossMechanisms();

    // 初始化归属数组
    this.aiOwned = [];
    this.playerOwned = [];
    this.aiCount = 0;
    this.playerCount = 0;
    this.totalEmpty = 0;

    // 健壮性检查：确保cells是二维数组
    if (!options.board.cells || !Array.isArray(options.board.cells) || options.board.cells.length === 0) {
      console.error('[GuideBattle] Invalid board cells');
      this.size = 9;
      this.totalEmpty = 81;
    } else {
      for (let r = 0; r < this.size; r++) {
        this.aiOwned[r] = [];
        this.playerOwned[r] = [];
        for (let c = 0; c < this.size; c++) {
          this.aiOwned[r][c] = false;
          this.playerOwned[r][c] = false;
          const cell = options.board.cells[r]?.[c];
          if (cell) {
            // 使用更可靠的方式判断空格子：
            // fixedNum 是固定数字（数字或null），fillNum 是玩家填入的数字（数字或null）
            const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
            const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
            if (!hasFixed && !hasFilled) {
              this.totalEmpty++;
            }
          } else {
            // cell不存在，计为空
            this.totalEmpty++;
          }
        }
      }
    }

    // 胜利条件：先填到总空格数的75%
    // 最少3个（避免1-2个空格的极端情况导致游戏太快结束）
    // 最多不超过总空格数
    this.winTarget = Math.min(
      this.totalEmpty,
      Math.max(3, Math.ceil(this.totalEmpty * 0.75))
    );

    // ===== 初始化三色加权得分系统 =====
    this._initWeightedScoreSystem(options.board);

    console.log('[GuideBattle] Started vs', this.opponent.name,
      'size:', this.size,
      'totalEmpty:', this.totalEmpty,
      'winTarget:', this.winTarget,
      'weightedScore:', this._weightedScoreEnabled,
      'maxScore:', this.maxScore,
      'winScore:', this.winScore);

    // 初始化AI玩家（基于TechRater的推理AI）
    if (typeof AIPlayer !== 'undefined') {
      // 根据Boss ID选择性格
      let aiPersonality = this._getPersonalityForBoss(this.opponent.id);

      // 如果有AI难度调整配置，应用到性格上
      if (this.opponent.aiDifficulty) {
        const diff = this.opponent.aiDifficulty;
        // 复制基础性格并调整
        const adjusted = Object.assign({}, aiPersonality);

        // 调整技巧上限
        if (diff.maxTechLevel !== undefined) {
          adjusted.maxTechLevel = Math.min(adjusted.maxTechLevel, diff.maxTechLevel);
        }

        // 调整发现率（打折扣）
        if (diff.discoveryMultiplier !== undefined) {
          adjusted.discoveryRate = {};
          const baseRate = aiPersonality.discoveryRate;
          for (const level in baseRate) {
            adjusted.discoveryRate[level] = Math.max(0.2, baseRate[level] * diff.discoveryMultiplier);
          }
        }

        // 调整速度倍率（变慢）
        if (diff.speedMultiplier !== undefined) {
          adjusted.speedMultiplier = {
            min: (aiPersonality.speedMultiplier?.min ?? 0.8) * diff.speedMultiplier,
            max: (aiPersonality.speedMultiplier?.max ?? 1.2) * diff.speedMultiplier,
          };
        }

        // 调整失误率
        if (diff.mistakeMultiplier !== undefined) {
          adjusted.baseErrorRate = (aiPersonality.baseErrorRate ?? 0.05) * diff.mistakeMultiplier;
        }

        // 调整拦截欲望（变弱）
        if (diff.interceptMultiplier !== undefined) {
          adjusted.interceptProbability = (aiPersonality.interceptProbability ?? 0.4) * diff.interceptMultiplier;
        }

        aiPersonality = adjusted;
      }

      this._aiPlayer = new AIPlayer(this._board, aiPersonality);
      console.log('[GuideBattle] AIPlayer initialized, personality:', aiPersonality.name || aiPersonality);
    } else {
      console.warn('[GuideBattle] AIPlayer not found, falling back to old AI');
      this._aiPlayer = null;
    }

    // 通知renderer启用Boss战渲染
    if (this._renderer && typeof this._renderer.setBossBattle === 'function') {
      this._renderer.setBossBattle(true, this);
    }

    // 添加body类
    document.body.classList.add('boss-battle-active');

    // 延迟启动AI（给玩家一点准备时间）
    setTimeout(() => {
      if (this.active && !this.ended) {
        this._scheduleAiMove();
      }
    }, 2000);

    // 启动假动作系统（设局人/残影/秘术专属）
    const bossId = this.opponent?.id;
    if (bossId === 'plotter' || bossId === 'plotterShadow' || bossId === 'setterSecret') {
      this._startFakeMoveSystem();
    }
  },

  /**
   * 停止Boss战
   */
  stop() {
    this.active = false;
    this._aiThinking = false;
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
    // 清理AI玩家
    this._aiPlayer = null;
    // 清理假动作系统
    if (this._fakeMoveTimer) {
      clearInterval(this._fakeMoveTimer);
      this._fakeMoveTimer = null;
    }
    this._fakeMoves = [];
    // 清理脉冲定时器
    if (this._pulseTimer) {
      clearInterval(this._pulseTimer);
      this._pulseTimer = null;
    }
    this._isPulsing = false;
    // 清理事件队列
    this._clearEventQueue();
    if (this._renderer && typeof this._renderer.setBossBattle === 'function') {
      this._renderer.setBossBattle(false);
    }
    document.body.classList.remove('boss-battle-active');
    // 移除Boss对话气泡
    const bubble = document.getElementById('boss-bubble');
    if (bubble) bubble.remove();
    // 移除预警覆盖层
    const warning = document.getElementById('boss-warning-overlay');
    if (warning) warning.classList.remove('show');
    // 移除连击显示
    const comboDisplay = document.getElementById('boss-combo-display');
    if (comboDisplay) comboDisplay.remove();
    console.log('[GuideBattle] Stopped');
  },

  /**
   * 玩家填数回调
   */
  onPlayerFill(r, c, value, isCorrect) {
    if (!this.active || this.ended) return;

    if (isCorrect && !this.playerOwned[r][c]) {
      // 如果之前是AI的格子，玩家抢过来
      const wasStolen = this.aiOwned[r][c];
      if (wasStolen) {
        this.aiOwned[r][c] = false;
        this.aiCount--;
        // 加权得分：AI减去该格分数
        if (this._weightedScoreEnabled) {
          this.aiScore -= this._getCellWeight(r, c);
        }
        // 清除AI标记
        const cell = this._board.cells[r]?.[c];
        if (cell) {
          cell.isAiFilled = false;
          cell._aiNum = null;
          cell._aiMistake = false;
        }
        // 抢格粒子特效
        if (this._renderer && typeof this._renderer.emitParticles === 'function') {
          this._renderer.emitParticles(c, r, 'steal', 15);
        }
        this._stealCount++;
      } else {
        // 普通填对粒子特效
        if (this._renderer && typeof this._renderer.emitParticles === 'function') {
          this._renderer.emitParticles(c, r, 'correct', 8);
        }
      }
      this.playerOwned[r][c] = true;
      this.playerCount++;
      this._correctCount++;
      // 加权得分：玩家增加该格分数
      if (this._weightedScoreEnabled) {
        this.playerScore += this._getCellWeight(r, c);
      }

      // ========================================
      // 连击系统：连续正确触发AI震慑
      // ========================================
      this._combo.count++;
      if (this._combo.count > this._combo.bestCombo) {
        this._combo.bestCombo = this._combo.count;
      }

      // 连击阈值配置（杀手数独关卡阈值更低，更容易触发反击）
      const tuning = this.opponent?.battleTuning || {};
      const isKiller = tuning.isKiller || false;
      const comboThreshold = isKiller ? 2 : 3;  // 杀手数独2连击就触发
      const baseStunTime = isKiller ? 2000 : 1500; // 震慑基础时长
      const stunPerCombo = isKiller ? 800 : 500;  // 每多一连击增加的震慑时间

      if (this._combo.count >= comboThreshold && !this._combo.stunActive) {
        const extraCombos = this._combo.count - comboThreshold;
        const stunTime = baseStunTime + extraCombos * stunPerCombo;
        this._triggerComboStun(stunTime);
      }

      // 连击视觉反馈
      this._showComboFeedback(this._combo.count, wasStolen);

      // 记录玩家填数时间（用于动态难度调节）
      if (this._difficulty && this._difficulty.enabled) {
        const now = Date.now();
        this._difficulty.playerMoveTimes.push({ time: now, correct: true });
        // 只保留最近20次记录
        if (this._difficulty.playerMoveTimes.length > 20) {
          this._difficulty.playerMoveTimes.shift();
        }
        // 尝试调整难度
        this._adjustDifficulty();
      }

      // 同步AI的推理状态（AI看到玩家填了这个数）
      if (this._aiPlayer) {
        this._aiPlayer.syncFromBoard(this._board);
      }

      // 触发音效
      if (typeof AudioService !== 'undefined' && AudioService.sfx) {
        AudioService.sfx.play(wasStolen ? 'eureka' : 'click');
      }

      // 检查机关锁（第1章机制）
      this._checkLockCells(r, c);

      // 检查联动锁（第4章机制）
      this._checkRegionLocks(r, c);

      // 更新笼坍缩进度（第5章机制）
      const collapseProgress = this._weightedScoreEnabled
        ? (this.playerScore / this.winScore)
        : (this.playerCount / this.winTarget);
      this._updateCollapseProgress(collapseProgress);

      // 检查胜利
      this._checkWin();
    } else if (!isCorrect) {
      // 填错了，重置连击
      this._combo.count = 0;
      this._playerMistakeCount++;
    }
  },

  /**
   * 玩家撤销回调
   */
  onPlayerUndo(r, c) {
    if (!this.active || this.ended) return;

    if (this.playerOwned[r][c]) {
      this.playerOwned[r][c] = false;
      this.playerCount--;
      // 加权得分：玩家减去该格分数
      if (this._weightedScoreEnabled) {
        this.playerScore -= this._getCellWeight(r, c);
      }
    }
  },

  // ======================================================
  //  凝视拦截系统 v2.0
  // ======================================================

  /**
   * 玩家选中/凝视某个格子时调用，AI有概率拦截抢占
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {boolean} 是否触发了拦截
   */
  onPlayerFocusCell(r, c) {
    if (!this.active || this.ended || !this._aiPlayer) return false;
    if (this._aiThinking) return false; // AI思考中不额外触发
    if (this.aiOwned[r][c] || this.playerOwned[r][c]) return false; // 已被占的格子

    // 冷却中
    if (this._interceptCooldown > 0) return false;

    // 固定格子跳过
    const cell = this._board.cells[r]?.[c];
    if (!cell || cell.fixedNum) return false;

    // 红格预警：如果是 gate 分类格子，触发闪烁警示
    if (this._weightedScoreEnabled && this._cellCategories) {
      const cat = this._cellCategories[r]?.[c];
      if (cat === 'gate') {
        if (this._renderer && typeof this._renderer.triggerGateAlert === 'function') {
          this._renderer.triggerGateAlert(r, c, 1500);
        }
        // 播放警示音效（用 breakthrough 音效替代）
        if (typeof AudioService !== 'undefined' && AudioService.sfx) {
          AudioService.sfx.play('breakthrough', { volume: 0.5 });
        }
      }
    }

    // 尝试拦截
    const interceptStep = this._aiPlayer.tryIntercept(r, c);
    if (interceptStep) {
      // 设置冷却（杀手数独关卡冷却更长，给玩家留足心算空间）
      const tuning = this.opponent?.battleTuning;
      this._interceptCooldown = tuning?.interceptCooldown || 3000; // 默认3秒

      // 延迟执行拦截，给玩家一点"被抢"的反应时间
      const thinkTime = interceptStep.thinkTime || 300;
      this._aiThinking = true;

      setTimeout(() => {
        if (!this.active || this.ended) {
          this._aiThinking = false;
          return;
        }
        this._applyAiMove(interceptStep);
        this._aiThinking = false;
        // 继续正常AI循环
        this._scheduleAiMove();
      }, thinkTime);

      // 显示拦截提示
      this._showInterceptFeedback(r, c);
      return true;
    }

    return false;
  },

  // ======================================================
  //  连击震慑系统 v1.0
  // ======================================================

  /**
   * 触发连击震慑：让AI暂停思考，给玩家反击爽感
   * @param {number} stunTime - 震慑时长（毫秒）
   */
  _triggerComboStun(stunTime) {
    if (!this.active || this.ended) return;
    if (this._combo.stunActive) return;

    this._combo.stunActive = true;
    console.log('[GuideBattle] 连击震慑! AI被震慑', stunTime + 'ms');

    // 如果AI正在思考中，延迟后延下一步
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }

    // 震慑结束后恢复AI
    setTimeout(() => {
      if (!this.active || this.ended) return;
      this._combo.stunActive = false;
      // 重新调度AI下一步
      if (this._aiThinking) {
        // AI还在思考中，等思考完
      } else {
        this._scheduleAiMove();
      }
    }, stunTime);

    // 触发音效
    if (typeof AudioService !== 'undefined' && AudioService.sfx) {
      AudioService.sfx.play('eureka');
    }
  },

  /**
   * 显示连击视觉反馈
   * @param {number} comboCount - 当前连击数
   * @param {boolean} wasStolen - 是否是抢夺的格子
   */
  _showComboFeedback(comboCount, wasStolen) {
    // 低连击不显示
    if (comboCount < 2) return;

    // 更新HUD上的连击显示
    let comboEl = document.getElementById('boss-combo-display');
    if (!comboEl) {
      // 创建连击显示元素
      comboEl = document.createElement('div');
      comboEl.id = 'boss-combo-display';
      comboEl.style.cssText = `
        position: fixed;
        top: 50%;
        right: 20px;
        transform: translateY(-50%);
        font-size: 24px;
        font-weight: 900;
        color: #fbbf24;
        text-shadow: 0 0 10px rgba(251, 191, 36, 0.8), 0 2px 4px rgba(0,0,0,0.5);
        pointer-events: none;
        z-index: 1001;
        opacity: 0;
        transition: all 0.3s ease;
        text-align: center;
      `;
      document.body.appendChild(comboEl);
    }

    // 确定连击文案
    let comboText = '';
    let comboColor = '#fbbf24';
    if (comboCount >= 2) { comboText = '2 连击!'; comboColor = '#fbbf24'; }
    if (comboCount >= 3) { comboText = '3 连击!'; comboColor = '#f97316'; }
    if (comboCount >= 5) { comboText = '5 连击!!'; comboColor = '#ef4444'; }
    if (comboCount >= 7) { comboText = '7 连击!!!'; comboColor = '#a855f7'; }
    if (comboCount >= 10) { comboText = '10 连击!!!!'; comboColor = '#ec4899'; }

    if (wasStolen && comboCount >= 2) {
      comboText += '\n反抢!';
    }

    comboEl.innerHTML = comboText.replace(/\n/g, '<br>');
    comboEl.style.color = comboColor;
    comboEl.style.textShadow = `0 0 15px ${comboColor}80, 0 2px 4px rgba(0,0,0,0.5)`;

    // 动画：弹出
    comboEl.style.opacity = '1';
    comboEl.style.transform = 'translateY(-50%) scale(1.2)';

    setTimeout(() => {
      comboEl.style.transform = 'translateY(-50%) scale(1)';
    }, 150);

    // 2秒后消失
    clearTimeout(this._comboHideTimer);
    this._comboHideTimer = setTimeout(() => {
      if (comboEl) {
        comboEl.style.opacity = '0';
      }
    }, 2000);
  },

  /**
   * 显示拦截视觉反馈（红光闪烁 + 气泡）
   */
  _showInterceptFeedback(r, c) {
    // 红光闪烁
    const warning = document.getElementById('boss-warning-overlay');
    if (warning) {
      warning.classList.add('show');
      setTimeout(() => warning.classList.remove('show'), 400);
    }

    // 显示拦截台词气泡
    const interceptLines = this._getInterceptLines();
    if (interceptLines.length > 0) {
      const line = interceptLines[Math.floor(Math.random() * interceptLines.length)];
      this._showBossBubble(line, 'smirk', 1500);
    }
  },

  /**
   * 获取拦截台词（不同Boss不同风格）
   */
  _getInterceptLines() {
    const bossId = this.opponent?.id;
    const linesMap = {
      reckless: ['哈哈，被我抢先了！', '这格我先看到的~', '手快有手慢无！'],
      cagekeeper: ['此格已有定数。', '先一步。', '稳。'],
      plotter: ['你在看哪一格，我都知道。', '读心之术。', '被看穿了。'],
      weaver: ['预测：玩家将填写该格。反制执行。', '拦截成功。'],
      shenmo: ['...', '你的思路，我很熟悉。'],
    };
    return linesMap[bossId] || ['被抢先了！'];
  },

  // ======================================================
  //  必杀技系统 v2.0
  // ======================================================

  /**
   * 触发Boss必杀技
   * @param {string} skillType - 技能类型：'guanju' | 'dingshi' | 'quantao'
   */
  triggerSkill(skillType) {
    if (!this.active || this.ended || !this._aiPlayer) return;

    const bossId = this.opponent?.id;

    if (skillType === 'guanju' && bossId === 'yan') {
      this._skillGuanJu();
    } else if (skillType === 'dingshi' && bossId === 'cagekeeper') {
      this._skillDingShi();
    } else if (skillType === 'quantao' && (bossId === 'plotter' || bossId === 'setterSecret' || bossId === 'plotterShadow')) {
      this._skillQuanTao();
    } else if (skillType === 'zhuixu' && bossId === 'remnant') {
      this._skillZhuiXu();
    } else if (skillType === 'shijian' && bossId === 'weaver') {
      this._skillShiJianHuanLiu();
    } else if (skillType === 'tiandao' && bossId === 'shenmo') {
      this._skillTianDao();
    }
  },

  /**
   * 阿妍必杀：观局
   * 找出全盘所有唯一可填格，显示提示但不填数
   */
  _skillGuanJu() {
    if (!this._aiPlayer || typeof this._aiPlayer.useGuanJu !== 'function') return;

    const targets = this._aiPlayer.useGuanJu();
    console.log('[GuideBattle] 阿妍·观局 发现', targets.length, '个可填格');

    // 显示台词
    this._showBossBubble('让我看看全盘的局势…', 'thinking', 2000);

    // 在渲染器中高亮这些格子（观局提示效果）
    if (this._renderer && typeof this._renderer.setGuanJuHighlight === 'function') {
      this._renderer.setGuanJuHighlight(targets);
      // 3秒后清除高亮
      setTimeout(() => {
        if (this._renderer && typeof this._renderer.clearGuanJuHighlight === 'function') {
          this._renderer.clearGuanJuHighlight();
        }
      }, 3000);
    }

    // 触发音效
    if (typeof AudioService !== 'undefined' && AudioService.sfx) {
      AudioService.sfx.play('hint');
    }
  },

  /**
   * 守笼人必杀：定式
   * 直接推导并填入当前玩家凝视格子的答案
   */
  _skillDingShi() {
    if (!this._aiPlayer || typeof this._aiPlayer.useDingShi !== 'function') return;

    // 找一个玩家可能在思考的格子（随机选一个空格子，或者选影响力最大的）
    let targetR = -1, targetC = -1;
    const emptyCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.aiOwned[r][c] && !this.playerOwned[r][c]) {
          const cell = this._board.cells[r]?.[c];
          if (cell && !cell.fixedNum) {
            emptyCells.push({ r, c });
          }
        }
      }
    }

    if (emptyCells.length === 0) return;

    // 选中间的格子作为"定式"目标（更有视觉冲击力）
    const centerIdx = Math.floor(emptyCells.length / 2);
    const target = emptyCells[centerIdx];

    const result = this._aiPlayer.useDingShi(target.r, target.c);
    if (result) {
      // 直接应用到棋盘
      this._applyAiMove(result);

      // 显示台词
      this._showBossBubble('定式。', 'confident', 2000);

      // 红光效果
      const warning = document.getElementById('boss-warning-overlay');
      if (warning) {
        warning.classList.add('show');
        setTimeout(() => warning.classList.remove('show'), 600);
      }

      this._checkWin();
    }
  },

  /**
   * 设局人必杀：圈套
   * 瞬间抢占3个边缘格子，形成包围圈
   */
  _skillQuanTao() {
    if (!this._aiPlayer || typeof this._aiPlayer.useQuanTao !== 'function') return;

    // 暂停正常AI移动
    this._aiThinking = true;

    const results = this._aiPlayer.useQuanTao(3);
    console.log('[GuideBattle] 设局人·圈套 抢占', results.length, '格');

    // 逐个应用，制造连续抢占的视觉冲击
    let delay = 0;
    results.forEach((step, idx) => {
      setTimeout(() => {
        if (!this.active || this.ended) return;
        this._applyAiMove(step);
        if (idx === results.length - 1) {
          this._aiThinking = false;
          this._checkWin();
          this._scheduleAiMove();
        }
      }, delay);
      delay += 200; // 每个间隔200ms
    });

    // 显示台词
    this._showBossBubble('你已经在我的圈套里了。', 'smirk', 2500);

    // 红光效果
    const warning = document.getElementById('boss-warning-overlay');
    if (warning) {
      warning.classList.add('show');
      setTimeout(() => warning.classList.remove('show'), 800);
    }
  },

  /**
   * 残局守护者必杀：追忆（回溯）
   * 随机"回滚"玩家已占领的2个格子，让它们变回未占领状态
   * 主题契合：沉睡的记忆会模糊、会倒退
   */
  _skillZhuiXu() {
    if (!this._aiPlayer) return;

    // 找出玩家占领的格子
    const playerCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.playerOwned[r][c]) {
          playerCells.push({ r, c });
        }
      }
    }

    if (playerCells.length < 2) return; // 玩家格子太少就不触发了

    // 随机选2个回滚
    const shuffled = playerCells.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, 2);

    this._showBossBubble('……这些记忆……模糊了。', 'stern', 2500);

    // 紫光效果（哀伤的感觉）
    const warning = document.getElementById('boss-warning-overlay');
    if (warning) {
      warning.style.background = 'radial-gradient(circle, rgba(168,85,247,0.3) 0%, transparent 70%)';
      warning.classList.add('show');
      setTimeout(() => {
        warning.classList.remove('show');
        setTimeout(() => {
          warning.style.background = '';
        }, 500);
      }, 1000);
    }

    // 逐个回滚，制造"记忆消散"的视觉效果
    let delay = 0;
    targets.forEach((target, idx) => {
      setTimeout(() => {
        if (!this.active || this.ended) return;
        const cell = this._board.cells[target.r]?.[target.c];
        if (!cell) return;

        // 清除玩家占领
        this.playerOwned[target.r][target.c] = false;
        this.playerCount--;
        // 加权得分：玩家减去该格分数
        if (this._weightedScoreEnabled) {
          this.playerScore -= this._getCellWeight(target.r, target.c);
        }

        // 清除玩家填入的数字
        cell.fillNum = null;
        cell.isError = false;

        console.log(`[GuideBattle] 追忆·回滚玩家格子(${target.r},${target.c})`);

        // 触发渲染
        if (this._renderer && typeof this._renderer.render === 'function') {
          this._renderer.render(this._board);
        }
      }, delay);
      delay += 600;
    });
  },

  /**
   * 星辰梭必杀：时间缓流
   * 8秒内AI速度翻倍，连续快速填数，制造"机器超频"的压迫感
   */
  _skillShiJianHuanLiu() {
    if (!this._aiPlayer) return;

    this._showBossBubble('超频模式：时间流速×2。', 'default', 2000);

    // 蓝光效果（冰冷的科技感）
    const warning = document.getElementById('boss-warning-overlay');
    if (warning) {
      warning.style.background = 'radial-gradient(circle, rgba(59,130,246,0.35) 0%, transparent 70%)';
      warning.classList.add('show');
      setTimeout(() => {
        warning.classList.remove('show');
        setTimeout(() => {
          warning.style.background = '';
        }, 500);
      }, 1500);
    }

    // 保存原始速度倍率
    const originalMultiplier = this._difficulty.speedMultiplier;
    // 速度翻倍（倍率减半）
    this._difficulty.speedMultiplier = Math.max(0.3, originalMultiplier * 0.5);

    // 如果AI正在思考中，打断并立即执行
    if (this._aiThinking && this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
      this._aiThinking = false;
    }

    // 立即走一步
    this._scheduleAiMove();

    // 8秒后恢复
    setTimeout(() => {
      if (!this.active || this.ended) return;
      this._difficulty.speedMultiplier = originalMultiplier;
      console.log('[GuideBattle] 时间缓流结束，恢复正常速度');
    }, 8000);
  },

  /**
   * 沈墨必杀：天道推演
   * 终极技能：直接推演并填入4个关键格子，同时清除玩家连击
   * 主题：沉静如水的最终对手，深不可测
   */
  _skillTianDao() {
    if (!this._aiPlayer || typeof this._aiPlayer.useQuanTao !== 'function') return;

    this._showBossBubble('……天道。', 'serious', 2000);

    // 金光效果（沈墨的金色主题）
    const warning = document.getElementById('boss-warning-overlay');
    if (warning) {
      warning.style.background = 'radial-gradient(circle, rgba(251,191,36,0.35) 0%, transparent 70%)';
      warning.classList.add('show');
      setTimeout(() => {
        warning.classList.remove('show');
        setTimeout(() => {
          warning.style.background = '';
        }, 500);
      }, 1500);
    }

    // 清除玩家连击
    if (this._combo) {
      this._combo.count = 0;
    }

    // 暂停正常AI移动
    this._aiThinking = true;

    // 用圈套的方法找4个格子（设局人是3个，沈墨是4个）
    const results = this._aiPlayer.useQuanTao(4);
    console.log('[GuideBattle] 沈墨·天道推演 抢占', results.length, '格');

    // 逐个应用，慢速但有力（每步400ms，体现"沉稳"）
    let delay = 0;
    results.forEach((step, idx) => {
      setTimeout(() => {
        if (!this.active || this.ended) return;
        this._applyAiMove(step);
        if (idx === results.length - 1) {
          this._aiThinking = false;
          this._checkWin();
          this._scheduleAiMove();
        }
      }, delay);
      delay += 400;
    });
  },

  // ======================================================
  //  动态难度调节系统 v2.0
  // ======================================================

  /**
   * 根据玩家填数速度动态调整AI速度
   * 玩家快 → AI也加快（更有挑战）
   * 玩家慢 → AI变慢（给玩家喘息）
   */
  _adjustDifficulty() {
    if (!this._difficulty || !this._difficulty.enabled) return;

    const diff = this._difficulty;
    const now = Date.now();

    // 调整间隔限制
    if (now - diff.lastAdjustTime < diff.adjustInterval) return;

    // 需要至少5个样本才能统计
    if (diff.playerMoveTimes.length < 5) return;

    // 计算玩家平均每格耗时
    const times = diff.playerMoveTimes;
    let totalInterval = 0;
    let intervalCount = 0;
    for (let i = 1; i < times.length; i++) {
      totalInterval += times[i].time - times[i - 1].time;
      intervalCount++;
    }
    if (intervalCount === 0) return;

    diff.playerAvgTime = totalInterval / intervalCount;

    // 估算AI的平均每格时间
    // 基于Boss的speedMin/speedMax和棋盘大小修正
    const baseAiTime = (this.opponent.speedMin + this.opponent.speedMax) / 2;
    const currentAiTime = baseAiTime * diff.speedMultiplier;

    // 目标：AI速度 = 玩家速度 * targetRatio
    // targetRatio > 1 表示AI比玩家慢（玩家有优势）
    const targetAiTime = diff.playerAvgTime * diff.targetRatio;

    // 计算需要的倍率
    const targetMultiplier = targetAiTime / baseAiTime;

    // 平滑过渡（每次只调整一部分）
    const delta = (targetMultiplier - diff.speedMultiplier) * diff.smoothFactor;
    diff.speedMultiplier += delta;

    // 限制在合理范围内
    diff.speedMultiplier = Math.max(
      diff.minMultiplier,
      Math.min(diff.maxMultiplier, diff.speedMultiplier)
    );

    diff.lastAdjustTime = now;

    console.log('[GuideBattle] 动态难度调整:',
      '玩家平均:', Math.round(diff.playerAvgTime) + 'ms',
      'AI基准:', Math.round(baseAiTime) + 'ms',
      'AI当前:', Math.round(currentAiTime) + 'ms',
      '倍率:', diff.speedMultiplier.toFixed(2));
  },

  /**
   * 获取当前动态难度下的AI速度倍率
   * @returns {number} 速度倍率
   */
  getSpeedMultiplier() {
    return this._difficulty ? this._difficulty.speedMultiplier : 1.0;
  },

  // ======================================================
  //  多阶段预警系统 v2.0
  // ======================================================

  /**
   * 检查是否触发预警线
   */
  _checkWarningTriggers() {
    if (!this.opponent || !this.opponent.warningLines) return;

    // AI进度：加权得分模式用得分比，否则用格数比
    const aiProgress = this._weightedScoreEnabled
      ? (this.aiScore / this.winScore)
      : (this.aiCount / this.winTarget);
    const tuning = this.opponent?.battleTuning || {};

    // 第一阶段预警（默认60%，杀手数独延后）
    const phase1Threshold = tuning.warningPhase1At || 0.6;
    if (aiProgress >= phase1Threshold && !this._warning60Triggered) {
      this._warning60Triggered = true;
      this._triggerWarningPhase(1);
    }

    // 第二阶段预警 + 必杀技（默认70%，杀手数独延后）
    const phase2Threshold = tuning.warningPhase2At || 0.7;
    if (aiProgress >= phase2Threshold && !this._warning70Triggered) {
      this._warning70Triggered = true;
      this._triggerWarningPhase(2);
    }
  },

  _triggerWarningPhase(phase) {
    const lines = this.opponent.warningLines || [];
    if (lines.length === 0) return;

    // 选对应阶段的台词
    const lineIdx = Math.min(phase - 1, lines.length - 1);
    const line = lines[lineIdx];

    // 红光预警
    const warning = document.getElementById('boss-warning-overlay');
    if (warning) {
      warning.classList.add('show');
      setTimeout(() => warning.classList.remove('show'), 800 + phase * 400);
    }

    // 显示台词
    this._showBossBubble(line.text, line.emotion || 'stern', 2500);

    // 第2阶段（70%）触发必杀技
    if (phase === 2) {
      const bossId = this.opponent?.id;
      setTimeout(() => {
        if (bossId === 'yan') {
          this._skillGuanJu();
        } else if (bossId === 'cagekeeper') {
          this._skillDingShi();
        } else if (bossId === 'plotter' || bossId === 'setterSecret' || bossId === 'plotterShadow') {
          this._skillQuanTao();
        } else if (bossId === 'remnant') {
          this._skillZhuiXu();
        } else if (bossId === 'weaver') {
          this._skillShiJianHuanLiu();
        } else if (bossId === 'shenmo') {
          this._skillTianDao();
        }
      }, 1500);
    }
  },

  /**
   * 根据Boss ID返回对应的AI性格
   */
  _getPersonalityForBoss(bossId) {
    const map = {
      'yan': 'reckless',           // 阿妍：冒失型
      'cagekeeper': 'steady',      // 守笼人：稳健型
      'plotterShadow': 'surround', // 设局人残影：包围型
      'remnant': 'steady',         // 残局守护者：稳健型
      'weaver': 'steady',          // 星辰梭：稳健型
      'plotter': 'surround',       // 设局人：包围型
      'setterSecret': 'surround',  // 秘之设局人：包围型
      'shenmo': 'steady',          // 沈墨：稳健型
    };
    return map[bossId] || 'steady';
  },

  /**
   * AI走一步（使用AIPlayer推理驱动）
   */
  _aiMove() {
    if (!this.active || this.ended) return;
    if (this._aiThinking) return;

    this._aiThinking = true;

    // 使用AIPlayer推理（如果可用）
    if (this._aiPlayer) {
      this._aiMoveWithRater();
    } else {
      // 降级方案：旧的随机AI
      this._aiMoveLegacy();
    }
  },

  /**
   * 基于TechRater的AI走棋
   */
  _aiMoveWithRater() {
    // 先思考
    const step = this._aiPlayer.think();

    if (!step) {
      // AI找不到可填的了（可能卡住了），用降级方案找一个
      console.warn('[GuideBattle] AI think returned null, using fallback');
      this._aiThinking = false;
      this._aiMoveLegacy();
      return;
    }

    // 模拟思考时间后再执行
    setTimeout(() => {
      if (!this.active || this.ended) {
        this._aiThinking = false;
        return;
      }

      const applied = this._applyAiMove(step);
      this._aiThinking = false;

      // 安排下一步
      if (applied && this.active && !this.ended) {
        this._scheduleAiMove();
      } else if (this.active && !this.ended) {
        this._scheduleAiMove();
      }
    }, step.thinkTime);
  },

  /**
   * 应用AI走棋到棋盘（公共方法，供走棋/拦截/必杀技共用）
   * @param {Object} step - AI走棋步骤
   * @returns {boolean} 是否成功应用
   */
  _applyAiMove(step) {
    if (!step || !this.active || this.ended) return false;

    const { row, col, num, isMistake, techniqueName } = step;

    // 检查这个格子是否还空着
    const cell = this._board.cells[row]?.[col];
    if (!cell) return false;

    const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
    const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;

    if (hasFixed || hasFilled || this.playerOwned[row][col] || this.aiOwned[row][col]) {
      // 格子已经被占了，跳过
      return false;
    }

    // 红格预警：如果 AI 选的是 gate 分类格子，在填入前触发预警（营造紧张感）
    if (this._weightedScoreEnabled && this._cellCategories) {
      const cat = this._cellCategories[row]?.[col];
      if (cat === 'gate') {
        if (this._renderer && typeof this._renderer.triggerGateAlert === 'function') {
          this._renderer.triggerGateAlert(row, col, 1500);
        }
        // 播放警示音效
        if (typeof AudioService !== 'undefined' && AudioService.sfx) {
          AudioService.sfx.play('breakthrough', { volume: 0.5 });
        }
      }
    }

    // 执行填数
    const correctValue = this.solution[row][col];
    const actuallyCorrect = !isMistake;

    if (actuallyCorrect) {
      // AI填对了：只标记aiOwned，不显示数字（幽灵格效果）
      cell.isAiFilled = true;
      cell._aiNum = correctValue;
      this.aiOwned[row][col] = true;
      this.aiCount++;
      // 加权得分：AI增加该格分数
      if (this._weightedScoreEnabled) {
        this.aiScore += this._getCellWeight(row, col);
      }

      // 同步AI的推理状态
      if (this._aiPlayer) {
        this._aiPlayer.execute(step);
      }

      console.log(`[GuideBattle] AI填对(${row},${col})=${correctValue} 技巧:${techniqueName}`);
    } else {
      // AI填错了：也标记为AI占领（但数字是错的）
      cell.isAiFilled = true;
      cell._aiNum = num;
      cell._aiMistake = true;    // 标记：AI填错了
      this.aiOwned[row][col] = true;
      this.aiCount++;
      // 加权得分：AI增加该格分数（填错也算AI占领，后续玩家抢走会扣回）
      if (this._weightedScoreEnabled) {
        this.aiScore += this._getCellWeight(row, col);
      }

      // AI自己以为是对的，同步它的状态
      if (this._aiPlayer) {
        this._aiPlayer.execute(step);
      }

      console.log(`[GuideBattle] AI填错(${row},${col})=猜的${num},正确${correctValue}`);

      // 增加AI失误计数
      this._aiMistakeCount++;

      // AI犯错视觉/台词反馈（偶尔触发，避免太频繁）
      this._onAiMistake(row, col);
    }

    // 触发渲染更新
    if (this._renderer && typeof this._renderer.render === 'function') {
      this._renderer.render(this._board);
    }

    // 多阶段预警检查
    this._checkWarningTriggers();

    // 检查胜负
    this._checkWin();

    return true;
  },

  // ======================================================
  //  AI犯错系统 v1.0
  // ======================================================

  /**
   * AI填错时的反馈（台词 + 偶尔自我修正）
   */
  _onAiMistake(row, col) {
    // 30%概率显示犯错台词（避免太频繁）
    if (Math.random() < 0.3) {
      const lines = this._getMistakeLines();
      if (lines.length > 0) {
        const line = lines[Math.floor(Math.random() * lines.length)];
        this._showBossBubble(line, 'thinking', 1800);
      }
    }

    // AI有概率发现自己填错了，过一会儿擦掉重填
    // 不同Boss发现错误的概率不同
    const mistakeChance = this.opponent?.mistakeChance ?? 0.05;
    const selfCorrectChance = Math.min(0.6, mistakeChance * 3); // 最多60%概率自我修正
    if (Math.random() < selfCorrectChance) {
      const correctDelay = 4000 + Math.random() * 5000; // 4~9秒后发现并修正
      setTimeout(() => {
        if (!this.active || this.ended) return;
        const cell = this._board.cells[row]?.[col];
        if (!cell || !cell._aiMistake) return; // 已经被抢或修正了
        if (this.playerOwned[row][col]) return; // 被玩家抢了
        this._selfCorrectMistake(row, col);
      }, correctDelay);
    }
  },

  /**
   * AI自我修正：擦掉错误的，重新填对的
   */
  _selfCorrectMistake(row, col) {
    const cell = this._board.cells[row]?.[col];
    if (!cell || !cell._aiMistake) return;

    console.log(`[GuideBattle] AI自我修正(${row},${col})`);

    // 清除旧的错误标记
    cell._aiMistake = false;
    cell._aiNum = this.solution[row][col]; // 改成正确的

    // 触发渲染更新
    if (this._renderer && typeof this._renderer.render === 'function') {
      this._renderer.render(this._board);
    }

    // 显示修正台词
    const lines = this._getSelfCorrectLines();
    if (lines.length > 0) {
      const line = lines[Math.floor(Math.random() * lines.length)];
      this._showBossBubble(line, 'serious', 1500);
    }
  },

  /**
   * 获取AI犯错台词（不同Boss不同风格）
   */
  _getMistakeLines() {
    const bossId = this.opponent?.id;
    const linesMap = {
      yan: ['哎呀，好像算错了…', '唔，这格是不是不对？', '等等，让我再想想…'],
      cagekeeper: ['嗯？似有不妥。', '这一格…容老夫再算。', '差矣。'],
      plotter: ['哼，小失误罢了。', '故意试你的。', '你以为我算错了？'],
      plotterShadow: ['失误…是不可能的。', '哼。'],
      weaver: ['警告：计算偏差。', '重新校准中…'],
      remnant: ['……记错了吗。', '……岁月太久了。'],
      shenmo: ['……', '失手了。'],
    };
    return linesMap[bossId] || ['……'];
  },

  /**
   * 获取AI自我修正台词
   */
  _getSelfCorrectLines() {
    const bossId = this.opponent?.id;
    const linesMap = {
      yan: ['啊，改过来改过来~', '嘿嘿，发现了！', '果然是这里错了！'],
      cagekeeper: ['修正。', '果然如此。', '改之。'],
      plotter: ['说了是故意的。', '你看，我又改回来了。', '激将法罢了。'],
      weaver: ['修正完成。', '偏差已补偿。'],
      remnant: ['……想起来了。'],
      shenmo: ['……嗯。'],
    };
    return linesMap[bossId] || ['……'];
  },

  // ======================================================
  //  假动作/误导系统（设局人专属）
  // ======================================================

  /**
   * 启动假动作系统：每隔一段时间在随机空格子上显示假幽灵格
   * 误导玩家以为AI占领了那些格子
   */
  _startFakeMoveSystem() {
    if (this._fakeMoveTimer) return;

    // 每 6~10 秒来一波假动作
    const scheduleNext = () => {
      if (!this.active || this.ended) return;
      const delay = 6000 + Math.random() * 4000;
      this._fakeMoveTimer = setTimeout(() => {
        if (!this.active || this.ended) return;
        this._doFakeMoves();
        scheduleNext();
      }, delay);
    };

    // 开局5秒后第一次
    this._fakeMoveTimer = setTimeout(() => {
      if (!this.active || this.ended) return;
      this._doFakeMoves();
      scheduleNext();
    }, 5000);
  },

  /**
   * 执行一波假动作：在1~2个格子上显示假幽灵格
   */
  _doFakeMoves() {
    // 找未被占领的空格子
    const candidates = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.aiOwned[r][c] && !this.playerOwned[r][c]) {
          const cell = this._board.cells[r]?.[c];
          if (cell && !cell.fixedNum && !cell.fillNum) {
            candidates.push({ r, c });
          }
        }
      }
    }

    if (candidates.length < 3) return;

    // 随机选1~2个
    const count = Math.random() < 0.6 ? 1 : 2;
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, count);

    const now = Date.now();
    const duration = 4000 + Math.random() * 3000; // 假格持续4~7秒

    targets.forEach(t => {
      // 检查是否已经有假动作在这格
      const existing = this._fakeMoves.find(f => f.r === t.r && f.c === t.c);
      if (!existing) {
        this._fakeMoves.push({
          r: t.r,
          c: t.c,
          expireTime: now + duration,
          phase: 'in', // 'in' 渐入 / 'out' 渐出
        });
      }
    });

    console.log('[GuideBattle] 设局人·假动作', count, '格');

    // 触发渲染
    if (this._renderer && typeof this._renderer.render === 'function') {
      this._renderer.render(this._board);
    }

    // 设置过期清理
    setTimeout(() => {
      this._cleanupExpiredFakeMoves();
    }, duration + 500);
  },

  /**
   * 清理过期的假动作
   */
  _cleanupExpiredFakeMoves() {
    const now = Date.now();
    const before = this._fakeMoves.length;
    this._fakeMoves = this._fakeMoves.filter(f => f.expireTime > now);
    if (this._fakeMoves.length !== before) {
      if (this._renderer && typeof this._renderer.render === 'function') {
        this._renderer.render(this._board);
      }
    }
  },

  /**
   * 获取当前活跃的假动作列表（供渲染器使用）
   */
  getFakeMoves() {
    this._cleanupExpiredFakeMoves();
    return this._fakeMoves;
  },

  /**
   * 旧版AI走棋（降级方案：随机选空格）
   */
  _aiMoveLegacy() {
    // 找一个空格（优先找玩家附近的格子制造压迫感）
    const candidates = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this._board.cells[r]?.[c];
        if (!cell) continue;
        const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
        const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
        if (!hasFixed && !hasFilled && !this.aiOwned[r][c] && !this.playerOwned[r][c]) {
          let dist = 999;
          for (let pr = 0; pr < this.size; pr++) {
            for (let pc = 0; pc < this.size; pc++) {
              if (this.playerOwned[pr][pc]) {
                const d = Math.abs(r - pr) + Math.abs(c - pc);
                if (d < dist) dist = d;
              }
            }
          }
          candidates.push({ r, c, dist });
        }
      }
    }

    if (candidates.length === 0) {
      this._endBattle('draw');
      return;
    }

    // 按距离排序，选最近的（60%概率）或随机（40%概率）
    let chosen;
    if (Math.random() < 0.6) {
      candidates.sort((a, b) => a.dist - b.dist);
      const topN = Math.min(5, candidates.length);
      chosen = candidates[Math.floor(Math.random() * topN)];
    } else {
      chosen = candidates[Math.floor(Math.random() * candidates.length)];
    }

    // 检查是否出错
    const isMistake = Math.random() < this.opponent.mistakeChance;
    const correctValue = this.solution[chosen.r][chosen.c];

    if (!isMistake) {
      const cell = this._board.cells[chosen.r][chosen.c];
      if (cell) {
        cell.isAiFilled = true;
        cell._aiNum = correctValue;
      }
      this.aiOwned[chosen.r][chosen.c] = true;
      this.aiCount++;
      // 加权得分：AI增加该格分数
      if (this._weightedScoreEnabled) {
        this.aiScore += this._getCellWeight(chosen.r, chosen.c);
      }

      if (this._renderer && typeof this._renderer.render === 'function') {
        this._renderer.render(this._board);
      }

      const aiProgress = this._weightedScoreEnabled
        ? (this.aiScore / this.winScore)
        : (this.aiCount / this.winTarget);
      if (aiProgress >= 0.6 && !this._warningTriggered) {
        this._warningTriggered = true;
        this._triggerWarning();
      }

      this._checkWin();
    }

    this._aiThinking = false;
    this._scheduleAiMove();
  },

  /**
   * 安排AI下一步
   */
  _scheduleAiMove() {
    if (!this.active || this.ended) return;

    const { speedMin, speedMax } = this.opponent;
    const baseDelay = speedMin + Math.random() * (speedMax - speedMin);

    // AI动态速度曲线：开局慢30%，中期正常，后期快20%
    const progress = this.aiCount / this.totalEmpty;
    let speedMul = 1;
    if (progress < 0.25) speedMul = 1.3;     // 开局慢（delay变大）
    else if (progress > 0.75) speedMul = 0.8; // 后期快（delay变小）

    // 棋盘大小自适应：小棋盘格子少，AI需要更快才能形成竞速压力
    // 4x4: 0.38x（约2.3-4.2秒/格），6x6: 0.65x（约3.9-7.2秒/格），9x9: 1x
    const sizeMul = this.size <= 4 ? 0.38 : (this.size <= 6 ? 0.65 : 1.0);

    // 动态难度倍率：根据玩家速度实时调整
    const dynMul = this.getSpeedMultiplier();

    const delay = baseDelay * speedMul * sizeMul * dynMul;

    // 拦截冷却递减
    if (this._interceptCooldown > 0) {
      this._interceptCooldown = Math.max(0, this._interceptCooldown - delay);
    }

    this._aiTimer = setTimeout(() => {
      this._aiMove();
    }, delay);
  },

  /**
   * 触发预警
   */
  _triggerWarning() {
    // 显示预警边缘红光效果
    const overlay = document.getElementById('boss-warning-overlay');
    if (overlay) {
      overlay.classList.add('show');
      setTimeout(() => overlay.classList.remove('show'), 2000);
    }

    // 播放Boss台词
    if (this.opponent.warningLines && this.opponent.warningLines.length > 0) {
      const line = this.opponent.warningLines[Math.floor(Math.random() * this.opponent.warningLines.length)];
      this._showBossBubble(line.text, line.emotion);
    }

    // 音效
    if (typeof AudioService !== 'undefined' && AudioService.sfx) {
      AudioService.sfx.play('eureka');
    }
  },

  /**
   * 显示Boss对话气泡
   */
  _showBossBubble(text, emotion) {
    // 使用事件队列播放气泡台词（默认优先级：普通台词=1）
    this._queueEvent({
      type: 'bubble',
      priority: this.EVENT_PRIORITY.INTERCEPT_LINE,
      duration: 3000,
      data: { text, emotion },
    });
  },

  /**
   * 播放高优先级台词（预警/必杀等）
   */
  _showBossBubbleHigh(text, emotion, priorityLevel) {
    this._queueEvent({
      type: 'bubble',
      priority: priorityLevel || this.EVENT_PRIORITY.WARNING_LINE,
      duration: 2500,
      data: { text, emotion },
    });
  },

  /**
   * 事件队列：入队
   */
  _queueEvent(event) {
    if (!this.active && event.priority < this.EVENT_PRIORITY.END_BATTLE) return;

    this._events.push(event);
    // 按优先级排序（高优先级在前）
    this._events.sort((a, b) => b.priority - a.priority);

    // 如果没在播放，立即开始
    if (!this._eventPlaying) {
      this._playNextEvent();
    }
  },

  /**
   * 事件队列：播放下一个
   */
  _playNextEvent() {
    if (this._events.length === 0) {
      this._eventPlaying = false;
      return;
    }

    this._eventPlaying = true;
    const event = this._events.shift();

    switch (event.type) {
      case 'bubble':
        this._playBubbleEvent(event);
        break;
      case 'overlay':
        this._playOverlayEvent(event);
        break;
      case 'combo':
        this._playComboEvent(event);
        break;
      default:
        // 未知事件，直接跳过
        setTimeout(() => this._playNextEvent(), 100);
        break;
    }
  },

  /**
   * 播放气泡台词事件
   */
  _playBubbleEvent(event) {
    const { text, emotion } = event.data;
    let bubble = document.getElementById('boss-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'boss-bubble';
      bubble.style.cssText = `
        position: fixed;
        top: 60px;
        right: 16px;
        max-width: 220px;
        padding: 12px 16px;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid ${this.opponent.color};
        border-radius: 12px;
        color: #e8eaed;
        font-size: 13px;
        line-height: 1.5;
        z-index: 15000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        opacity: 0;
        transform: translateX(20px);
        transition: all 0.3s ease;
        pointer-events: none;
        backdrop-filter: blur(8px);
      `;
      document.body.appendChild(bubble);
    }

    bubble.innerHTML = `<div style="color:${this.opponent.color};font-weight:700;font-size:12px;margin-bottom:4px;">${this.opponent.name}</div>${text}`;
    bubble.style.opacity = '1';
    bubble.style.transform = 'translateX(0)';

    const duration = event.duration || 3000;
    this._eventTimer = setTimeout(() => {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translateX(20px)';
      // 等待淡出动画完成后播放下一个
      setTimeout(() => this._playNextEvent(), 300);
    }, duration);
  },

  /**
   * 播放覆盖层事件（预警红光等）
   */
  _playOverlayEvent(event) {
    const warning = document.getElementById('boss-warning-overlay');
    if (!warning) {
      this._playNextEvent();
      return;
    }

    const color = event.data?.color || 'rgba(239,68,68,0.3)';
    warning.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
    warning.classList.add('show');

    const duration = event.duration || 1000;
    this._eventTimer = setTimeout(() => {
      warning.classList.remove('show');
      setTimeout(() => {
        warning.style.background = '';
        this._playNextEvent();
      }, 400);
    }, duration);
  },

  /**
   * 播放连击事件
   */
  _playComboEvent(event) {
    // 连击是独立的浮动显示，不阻塞其他事件
    this._showComboText(event.data);
    setTimeout(() => this._playNextEvent(), 200);
  },

  /**
   * 清空事件队列（战斗结束时调用）
   */
  _clearEventQueue() {
    this._events = [];
    this._eventPlaying = false;
    if (this._eventTimer) {
      clearTimeout(this._eventTimer);
      this._eventTimer = null;
    }
  },

  /**
   * 检查胜负
   */
  // ======================================================
  //  三色加权得分系统
  // ======================================================

  /**
   * 初始化三色加权得分系统
   * 使用 TechRaterAdapter 生成初始 heatmap，保存每个空格的分类
   * 如果 TechRaterAdapter 不可用，回退到原始格子数计数方式
   * @param {Board} board - 棋盘实例
   */
  _initWeightedScoreSystem(board) {
    // 重置状态
    this._weightedScoreEnabled = false;
    this._cellCategories = null;
    this.playerScore = 0;
    this.aiScore = 0;
    this.maxScore = 0;
    this.winScore = 0;

    // 检查 TechRaterAdapter 是否可用
    const AdapterClass = typeof TechRaterAdapter !== 'undefined'
      ? TechRaterAdapter
      : (window.TechRaterAdapter || null);

    if (!AdapterClass) {
      console.log('[GuideBattle] TechRaterAdapter 不可用，使用原始格子数计数');
      return;
    }

    try {
      // 创建适配器并生成 heatmap
      const adapter = new AdapterClass(board);
      const heatmap = adapter.generateHeatmap();

      if (!heatmap || !heatmap.gridMeta || heatmap.status === 'invalid') {
        console.log('[GuideBattle] Heatmap 生成失败，回退到原始计数');
        return;
      }

      // 构建 _cellCategories：只存初始空白格的分类
      this._cellCategories = [];
      let totalScore = 0;

      for (let r = 0; r < this.size; r++) {
        this._cellCategories[r] = [];
        for (let c = 0; c < this.size; c++) {
          const meta = heatmap.gridMeta[r]?.[c];
          if (meta && meta.category && meta.category !== 'filled') {
            // 空格子：保存分类
            const cat = meta.category; // 'simple' | 'core' | 'gate'
            this._cellCategories[r][c] = cat;
            // 累加满分
            const weight = this.SCORE_WEIGHTS[cat] || 1;
            totalScore += weight;
          } else {
            // 已填格或无数据：不存分类（null 表示非初始空格）
            this._cellCategories[r][c] = null;
          }
        }
      }

      // 设置满分和胜利分数
      this.maxScore = totalScore;
      this.winScore = totalScore * 0.75;

      // 启用加权得分
      this._weightedScoreEnabled = true;

      // 统计各类格子数量
      let simpleCount = 0, coreCount = 0, gateCount = 0;
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const cat = this._cellCategories[r][c];
          if (cat === 'simple') simpleCount++;
          else if (cat === 'core') coreCount++;
          else if (cat === 'gate') gateCount++;
        }
      }

      console.log('[GuideBattle] 三色加权得分系统已启用',
        'simple:', simpleCount,
        'core:', coreCount,
        'gate:', gateCount,
        'maxScore:', this.maxScore,
        'winScore:', this.winScore.toFixed(2));

    } catch (e) {
      console.error('[GuideBattle] 初始化加权得分系统失败:', e);
      this._weightedScoreEnabled = false;
      this._cellCategories = null;
    }
  },

  /**
   * 获取指定格子的分类权重分
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {number} 权重分数（simple=1, core=1.5, gate=2，未知默认为1）
   */
  _getCellWeight(r, c) {
    if (!this._weightedScoreEnabled || !this._cellCategories) return 1;
    const cat = this._cellCategories[r]?.[c];
    return this.SCORE_WEIGHTS[cat] || 1;
  },

  // ======================================================
  //  三色加权得分 - 公共API
  // ======================================================

  /**
   * 获取玩家加权得分
   * @returns {number} 玩家当前加权得分
   */
  getPlayerScore() {
    if (this._weightedScoreEnabled) {
      return this.playerScore;
    }
    // 向后兼容：未启用时返回格子数
    return this.playerCount;
  },

  /**
   * 获取AI加权得分
   * @returns {number} AI当前加权得分
   */
  getAiScore() {
    if (this._weightedScoreEnabled) {
      return this.aiScore;
    }
    // 向后兼容：未启用时返回格子数
    return this.aiCount;
  },

  /**
   * 获取满分（所有空格加权分总和）
   * @returns {number} 满分
   */
  getMaxScore() {
    if (this._weightedScoreEnabled) {
      return this.maxScore;
    }
    // 向后兼容：未启用时返回总空格数
    return this.totalEmpty;
  },

  /**
   * 获取胜利所需分数
   * @returns {number} 胜利分数
   */
  getWinScore() {
    if (this._weightedScoreEnabled) {
      return this.winScore;
    }
    // 向后兼容：未启用时返回胜利目标格数
    return this.winTarget;
  },

  /**
   * 获取完整的得分进度信息
   * @returns {Object} 进度对象
   *   - playerScore: 玩家加权得分
   *   - aiScore: AI加权得分
   *   - maxScore: 满分
   *   - winScore: 胜利分数
   *   - playerPercent: 玩家进度百分比（0~1）
   *   - aiPercent: AI进度百分比（0~1）
   */
  getScoreProgress() {
    if (this._weightedScoreEnabled && this.maxScore > 0) {
      return {
        playerScore: this.playerScore,
        aiScore: this.aiScore,
        maxScore: this.maxScore,
        winScore: this.winScore,
        playerPercent: this.playerScore / this.maxScore,
        aiPercent: this.aiScore / this.maxScore,
      };
    }
    // 向后兼容：未启用时按格子数计算
    const max = this.totalEmpty || 1;
    return {
      playerScore: this.playerCount,
      aiScore: this.aiCount,
      maxScore: this.totalEmpty,
      winScore: this.winTarget,
      playerPercent: this.playerCount / max,
      aiPercent: this.aiCount / max,
    };
  },

  /**
   * 获取指定格子的分类
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {string|null} 'simple'|'core'|'gate'|null（已填格或无数据）
   */
  getCellCategory(r, c) {
    if (!this._weightedScoreEnabled || !this._cellCategories) return null;
    return this._cellCategories[r]?.[c] || null;
  },

  /**
   * 加权得分系统是否已启用
   * @returns {boolean}
   */
  isWeightedScoreEnabled() {
    return this._weightedScoreEnabled;
  },

  /**
   * 获取双方三色得分明细（用于结算面板）
   * @returns {Object} 得分明细对象
   *   - isWeighted: boolean           是否启用加权得分
   *   - weightedEnabled: boolean      旧字段别名（向后兼容）
   *   - player: { simple, core, gate, total }   玩家各档得分（加权后分数）
   *   - ai:     { simple, core, gate, total }   AI 各档得分（加权后分数）
   *   - playerCount: { simple, core, gate, total }  玩家各档格数
   *   - aiCount:     { simple, core, gate, total }  AI 各档格数
   *   - maxScore: number   满分
   *   - winScore: number   胜利所需分数
   *   - totalCells: number 总空格数
   */
  getScoreBreakdown() {
    if (!this._weightedScoreEnabled || !this._cellCategories) {
      // 向后兼容：未启用加权得分时，按格子数返回
      return {
        isWeighted: false,
        weightedEnabled: false,
        player: { simple: this.playerCount, core: 0, gate: 0, total: this.playerCount },
        ai:     { simple: this.aiCount,     core: 0, gate: 0, total: this.aiCount },
        playerCount: { simple: this.playerCount, core: 0, gate: 0, total: this.playerCount },
        aiCount:     { simple: this.aiCount,     core: 0, gate: 0, total: this.aiCount },
        totalCells: this.totalEmpty,
        maxScore: this.totalEmpty,
        winScore: this.winTarget || Math.ceil(this.totalEmpty / 2) + 1,
      };
    }

    const pCount = { simple: 0, core: 0, gate: 0, total: 0 };
    const aCount = { simple: 0, core: 0, gate: 0, total: 0 };
    const pScore = { simple: 0, core: 0, gate: 0, total: 0 };
    const aScore = { simple: 0, core: 0, gate: 0, total: 0 };

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cat = this._cellCategories[r]?.[c];
        if (!cat) continue; // 非初始空格跳过
        const weight = this.SCORE_WEIGHTS[cat] || 1;

        if (this.playerOwned[r]?.[c]) {
          pCount[cat]++;
          pCount.total++;
          pScore[cat] += weight;
          pScore.total += weight;
        } else if (this.aiOwned[r]?.[c]) {
          aCount[cat]++;
          aCount.total++;
          aScore[cat] += weight;
          aScore.total += weight;
        }
      }
    }

    return {
      isWeighted: true,
      weightedEnabled: true,
      player: pScore,
      ai:     aScore,
      playerCount: pCount,
      aiCount:     aCount,
      totalCells: this.totalEmpty,
      maxScore: this.maxScore,
      winScore: this.winScore,
    };
  },

  // ======================================================
  //  第1章：机关锁格机制
  // ======================================================

  /**
   * 初始化所有Boss战特殊机制
   * 从 board 中读取关卡配置的机制数据
   */
  _initBossMechanisms() {
    const board = this._board;
    if (!board) return;

    // ---- 第1章：机关锁格 ----
    this._lockStates.clear();
    this._allLocksReleased = false;
    if (board._lockCells && Array.isArray(board._lockCells)) {
      for (const lc of board._lockCells) {
        this._lockStates.set(lc.cageId, {
          released: false,
          releaseTime: 0,
          releaseEvent: lc.releaseEvent || 'gear_default',
        });
      }
    }

    // ---- 第2章：候选数脉冲 ----
    if (this._pulseTimer) {
      clearInterval(this._pulseTimer);
      this._pulseTimer = null;
    }
    this._isPulsing = false;
    this._pulsePhase = 'idle';  // idle | fading_out | hidden | fading_in
    this._pulseStartTime = 0;
    // 如果Boss配置启用了脉冲机制，启动定时器
    if (this.opponent?.battleTuning?.pulseEnabled) {
      this._startPulseTimer();
    }

    // ---- 第3章：幻影格 ----
    // 优先从 board 读取，其次从 opponent.battleTuning 读取
    let fakeCellsSource = board._fakeCells;
    if ((!fakeCellsSource || fakeCellsSource.length === 0) &&
        this.opponent?.battleTuning?.fakeCells) {
      fakeCellsSource = this.opponent.battleTuning.fakeCells;
    }
    if (fakeCellsSource && fakeCellsSource.length > 0) {
      this._fakeCellsData = fakeCellsSource.map(fc => ({
        r: fc.r,
        c: fc.c,
        fakeNum: fc.fakeNum,
        realNum: fc.realNum,
        exposed: false,
      }));
      // 把幻影格的数字替换成假数字
      for (const fc of this._fakeCellsData) {
        const cell = board.cells[fc.r]?.[fc.c];
        if (cell) {
          // 保存真实数字（从 solution 或 realNum 字段）
          if (!fc.realNum && cell.fixedNum) {
            fc.realNum = cell.fixedNum;
          }
          // 替换成假数字
          if (cell.fixedNum) {
            cell._originalFixedNum = cell.fixedNum;
            cell.fixedNum = fc.fakeNum;
          } else if (cell.fillNum) {
            cell._originalFillNum = cell.fillNum;
            cell.fillNum = fc.fakeNum;
          } else {
            // 空格子，直接填入假数字（模拟 AI 填的）
            cell.fillNum = fc.fakeNum;
            cell._isFake = true;
          }
        }
      }
      board._fakeCells = this._fakeCellsData;
    } else {
      this._fakeCellsData = [];
    }
    this._fakeCellExposed = [];

    // ---- 第4章：联动锁 ----
    this._regionLockStates = {};
    this._allRegionLocksReleased = false;
    // 优先从 board 读取，其次从 opponent.battleTuning 读取
    let regionLocksSource = null;
    if (board._regionLocks && Array.isArray(board._regionLocks) && board._regionLocks.length > 0) {
      regionLocksSource = board._regionLocks;
      console.log('[GuideBattle] 第4章联动锁：从 board 读取配置，共', board._regionLocks.length, '个锁');
    } else if (this.opponent?.battleTuning?.regionLocks &&
               Array.isArray(this.opponent.battleTuning.regionLocks) &&
               this.opponent.battleTuning.regionLocks.length > 0) {
      regionLocksSource = this.opponent.battleTuning.regionLocks;
      console.log('[GuideBattle] 第4章联动锁：从 opponent.battleTuning 读取配置，共',
        this.opponent.battleTuning.regionLocks.length, '个锁');
    }
    if (regionLocksSource) {
      for (const rl of regionLocksSource) {
        this._regionLockStates[rl.id] = {
          locked: true,
          primed: false,
          released: false,
          releaseTime: 0,
          region: rl.region,
          cells: rl.cells || [],
          condition: rl.condition || 'all_filled',
          revealNotes: rl.revealNotes || [],
        };
      }
      console.log('[GuideBattle] 第4章联动锁初始化完成，锁数量:', Object.keys(this._regionLockStates).length);
    }

    // ---- 第5章：坍缩 ----
    this._collapseProgress = 0;
    this._isCollapsing = false;
    this._collapseStage = 0;
    this._collapsedCages = new Set();
    // 优先从 board 读取，其次从 opponent.battleTuning 读取
    let collapseConfigSource = null;
    if (board._cageCollapse && typeof board._cageCollapse === 'object') {
      collapseConfigSource = board._cageCollapse;
      console.log('[GuideBattle] 第5章笼坍缩：从 board 读取配置');
    } else if (this.opponent?.battleTuning?.collapseConfig &&
               typeof this.opponent.battleTuning.collapseConfig === 'object') {
      collapseConfigSource = this.opponent.battleTuning.collapseConfig;
      console.log('[GuideBattle] 第5章笼坍缩：从 opponent.battleTuning 读取配置');
    }
    if (collapseConfigSource) {
      this._collapseConfig = collapseConfigSource;
      // 预先标记外层笼
      if (collapseConfigSource.outerCageIds) {
        this._outerCageIds = [...collapseConfigSource.outerCageIds];
        console.log('[GuideBattle] 第5章外层笼ID:', this._outerCageIds);
      }
      this._isCollapsing = true;
      console.log('[GuideBattle] 第5章笼坍缩初始化完成，阶段数:',
        collapseConfigSource.stages ? collapseConfigSource.stages.length : 0);
    } else {
      this._collapseConfig = null;
      this._outerCageIds = [];
    }

    // ---- 第6章：双解 ----
    this._dualPathChosen = null;

    // ---- 第7章：三阶段 ----
    this._currentPhase = board._phase || 1;

    // ---- 难度保底 ----
    this._aidUsed = false;
  },

  /**
   * 检查机关锁状态：当某个笼子被完全填满且和值正确时解锁
   * 在玩家每次填对数字后调用
   */
  _checkLockCells(r, c) {
    if (!this._board || !this._board._lockCells) return;
    if (this._allLocksReleased) return;

    const cell = this._board.cells[r]?.[c];
    if (!cell) return;

    // 检查当前格所属的所有笼子是否有机关锁
    const cageIds = cell.cageIds || [cell.cageId];
    for (const cageId of cageIds) {
      if (!cageId) continue;
      const lockState = this._lockStates.get(cageId);
      if (!lockState || lockState.released) continue;

      // 检查这个笼子是否全部填满且和值正确
      const cage = this._board.cages.find(cg => cg.id === cageId);
      if (!cage) continue;

      let allFilled = true;
      let sum = 0;
      for (const [cr, cc] of cage.cells) {
        const cageCell = this._board.cells[cr]?.[cc];
        if (!cageCell) { allFilled = false; break; }
        const num = cageCell.fillNum || cageCell.fixedNum;
        if (!num) { allFilled = false; break; }
        sum += num;
      }

      if (allFilled && sum === cage.sum) {
        // 解锁！
        lockState.released = true;
        lockState.releaseTime = Date.now();
        console.log(`[GuideBattle] 机关锁 ${cageId} 已解锁`);

        // 播放解锁特效和音效
        this._onLockReleased(cageId, lockState);

        // 检查是否所有锁都打开了
        let allReleased = true;
        for (const [, state] of this._lockStates) {
          if (!state.released) { allReleased = false; break; }
        }
        if (allReleased && this._lockStates.size > 0) {
          this._allLocksReleased = true;
          this._onAllLocksReleased();
        }
      }
    }
  },

  /**
   * 单个机关锁解锁时的反馈
   */
  _onLockReleased(cageId, lockState) {
    // 音效
    if (typeof AudioService !== 'undefined' && AudioService.sfx) {
      const eventToSfx = {
        'gear_1': 'click',
        'gear_2': 'click',
        'gear_3': 'click',
      };
      const sfx = eventToSfx[lockState.releaseEvent] || 'click';
      AudioService.sfx.play(sfx);
    }

    // 通知渲染器播放齿轮动画
    if (this._renderer && typeof this._renderer.triggerLockRelease === 'function') {
      this._renderer.triggerLockRelease(cageId);
    }

    // Boss 气泡台词
    const lines = {
      'gear_1': '第一道锁…开了。',
      'gear_2': '继续。机关在转动。',
      'gear_3': '最后一道锁了。',
    };
    const line = lines[lockState.releaseEvent] || '机关转动了。';
    this._showBossBubble(line, 'focus');
  },

  /**
   * 所有机关锁全部打开时的反馈（石门打开）
   */
  _onAllLocksReleased() {
    console.log('[GuideBattle] 全部机关锁已打开！石门开启');

    // 音效
    if (typeof AudioService !== 'undefined' && AudioService.sfx) {
      AudioService.sfx.play('eureka');
    }

    // 通知渲染器
    if (this._renderer && typeof this._renderer.triggerAllLocksOpen === 'function') {
      this._renderer.triggerAllLocksOpen();
    }

    // Boss 气泡
    this._showBossBubbleHigh('石门开了。你的试炼，才刚开始。', 'determined', 5);
  },

  /**
   * 获取机关锁状态（供渲染器使用）
   */
  getLockStates() {
    return this._lockStates;
  },

  // ======================================================
  //  第2章：候选数脉冲机制
  // ======================================================

  /**
   * 启动脉冲定时器
   * 每隔 _pulseInterval 毫秒触发一次脉冲
   */
  _startPulseTimer() {
    if (this._pulseTimer) return;
    this._pulseTimer = setInterval(() => {
      if (!this.active || this.ended) return;
      this._triggerPulse();
    }, this._pulseInterval);
    console.log('[GuideBattle] 候选数脉冲定时器启动，间隔=' + (this._pulseInterval/1000) + 's');
  },

  /**
   * 停止脉冲定时器
   */
  _stopPulseTimer() {
    if (this._pulseTimer) {
      clearInterval(this._pulseTimer);
      this._pulseTimer = null;
    }
    this._isPulsing = false;
    this._pulsePhase = 'idle';
  },

  /**
   * 触发一次脉冲：候选数隐去 → 持续 _pulseDuration 毫秒 → 恢复
   * 整个过程：淡出(0.3s) → 隐藏(_pulseDuration) → 淡入(0.3s)
   */
  _triggerPulse() {
    if (!this.active || this.ended) return;
    if (this._isPulsing) return;

    this._isPulsing = true;
    this._pulsePhase = 'fading_out';
    this._pulseStartTime = Date.now();
    this.forceRender = true;

    console.log('[GuideBattle] 候选数脉冲触发！');

    // Boss 气泡提示
    this._showBossBubble('凝神静气，方能看清。', 'focus');

    // 音效
    if (typeof AudioService !== 'undefined' && AudioService.sfx) {
      AudioService.sfx.play('hint');
    }

    // 淡出完成 → 进入隐藏阶段
    setTimeout(() => {
      if (!this.active || !this._isPulsing) return;
      this._pulsePhase = 'hidden';
      this.forceRender = true;

      // 隐藏阶段结束 → 开始淡入
      setTimeout(() => {
        if (!this.active || !this._isPulsing) return;
        this._pulsePhase = 'fading_in';
        this._pulseStartTime = Date.now(); // 重置时间用于淡入计算
        this.forceRender = true;

        // 淡入完成 → 恢复正常
        setTimeout(() => {
          this._isPulsing = false;
          this._pulsePhase = 'idle';
          this.forceRender = true;
        }, 300);
      }, this._pulseDuration);
    }, 300);
  },

  /**
   * 获取脉冲透明度（供渲染器使用）
   * @returns {number} 0~1 之间的透明度倍率
   */
  getPulseOpacity() {
    if (!this._isPulsing || this._pulsePhase === 'idle') return 1;

    const elapsed = Date.now() - this._pulseStartTime;

    switch (this._pulsePhase) {
      case 'fading_out':
        // 300ms 内从 1 降到 0
        return Math.max(0, 1 - elapsed / 300);
      case 'hidden':
        return 0;
      case 'fading_in':
        // 300ms 内从 0 升到 1
        return Math.min(1, elapsed / 300);
      default:
        return 1;
    }
  },

  /**
   * 是否正在脉冲中（供外部判断）
   */
  isPulsing() {
    return this._isPulsing;
  },

  // ======================================================
  //  第3章：幻影格证伪机制
  // ======================================================

  /**
   * 是否有幻影格机制
   */
  hasFakeCells() {
    return this._fakeCellsData && this._fakeCellsData.length > 0;
  },

  /**
   * 尝试质疑一个格子（玩家长按后调用）
   * @param {number} r
   * @param {number} c
   * @returns {{success: boolean, isFake: boolean, fakeData?: object, reason?: string}}
   */
  tryAccuseFakeCell(r, c) {
    if (!this.active || this.ended) {
      return { success: false, reason: 'battle_not_active' };
    }
    if (!this.hasFakeCells()) {
      return { success: false, reason: 'no_fake_cells' };
    }

    const cell = this._board.cells[r]?.[c];
    if (!cell) return { success: false, reason: 'invalid_cell' };

    const num = cell.fillNum || cell.fixedNum;
    if (!num) return { success: false, reason: 'empty_cell' };

    // 查找是否是幻影格
    const fakeData = this._fakeCellsData.find(fc => fc.r === r && fc.c === c);

    if (fakeData) {
      // 是幻影格
      if (fakeData.exposed) {
        return { success: false, reason: 'already_exposed' };
      }

      // 证伪成功
      fakeData.exposed = true;
      this._fakeCellExposed.push({ r, c });

      // 更新棋盘：显示真实数字
      if (this._board.cells[r][c]) {
        this._board.cells[r][c].fillNum = fakeData.realNum;
        this._board.cells[r][c]._isFakeExposed = true;
      }

      // 通知渲染器
      if (this._renderer && typeof this._renderer.triggerFakeCellExpose === 'function') {
        this._renderer.triggerFakeCellExpose(r, c);
      }

      // 音效
      if (typeof AudioService !== 'undefined' && AudioService.sfx) {
        AudioService.sfx.play('eureka');
      }

      // Boss 气泡
      this._showBossBubble('……被你发现了。', 'surprise');

      console.log('[GuideBattle] 幻影格证伪成功:', r, c, fakeData.fakeNum, '→', fakeData.realNum);
      return { success: true, isFake: true, fakeData };
    } else {
      // 不是幻影格，证伪失败
      // 惩罚：短暂的视觉干扰
      if (this._renderer && typeof this._renderer.triggerFakeCellFail === 'function') {
        this._renderer.triggerFakeCellFail(r, c);
      }

      // 音效
      if (typeof AudioService !== 'undefined' && AudioService.sfx) {
        AudioService.sfx.play('error');
      }

      // Boss 气泡
      this._showBossBubble('看走眼了。', 'taunt');

      console.log('[GuideBattle] 幻影格证伪失败:', r, c);
      return { success: true, isFake: false };
    }
  },

  /**
   * 获取幻影格数据（供渲染器使用）
   */
  getFakeCells() {
    return this._fakeCellsData || [];
  },

  /**
   * 获取已暴露的幻影格
   */
  getExposedFakeCells() {
    return this._fakeCellExposed || [];
  },

  // ======================================================
  //  第4章：三人联动锁机制
  // ======================================================

  /**
   * 检查联动锁状态：玩家每次填对数字后调用
   * 当某个锁的所有格子都填满且正确 -> 进入"待激活"(primed)状态
   * 当3个锁全部进入primed状态 -> 同步解锁（同时释放）
   * 解锁后：将每个锁的 revealNotes 添加到棋盘对应格子的候选数中
   */
  _checkRegionLocks(r, c) {
    if (!this.hasRegionLocks()) return;
    if (this._allRegionLocksReleased) return;

    const lockIds = Object.keys(this._regionLockStates);
    if (lockIds.length === 0) return;

    console.log('[GuideBattle] _checkRegionLocks 被调用，检查坐标:', r, c);

    // 遍历所有联动锁，检查每个锁的格子是否全部填满且正确
    for (const lockId of lockIds) {
      const lockState = this._regionLockStates[lockId];
      if (!lockState || lockState.released) continue;
      if (lockState.primed) continue; // 已经是待激活状态就跳过

      // 检查这个锁的所有格子是否都已填满且正确
      let allFilled = true;
      let allCorrect = true;
      for (const [cr, cc] of lockState.cells) {
        const cell = this._board.cells[cr]?.[cc];
        if (!cell) { allFilled = false; break; }
        const num = cell.fillNum || cell.fixedNum;
        if (!num) { allFilled = false; break; }
        // 检查数字是否正确（与 solution 对比）
        if (this.solution && this.solution[cr] && this.solution[cr][cc] !== undefined) {
          if (num !== this.solution[cr][cc]) {
            allCorrect = false;
          }
        }
      }

      if (allFilled && allCorrect) {
        // 该锁进入"待激活"(primed)状态
        lockState.primed = true;
        lockState.locked = false;
        console.log('[GuideBattle] 联动锁', lockId, '进入待激活(primed)状态');

        // 通知渲染器：锁闪烁提示
        if (this._renderer && typeof this._renderer.triggerRegionLockPrimed === 'function') {
          this._renderer.triggerRegionLockPrimed(lockId);
        }

        // 音效
        if (typeof AudioService !== 'undefined' && AudioService.sfx) {
          AudioService.sfx.play('hint');
        }

        // Boss 气泡
        const regionLines = {
          'left': '左区……封印松动了。',
          'center': '中区……共鸣了。',
          'right': '右区……也在回应。',
        };
        const line = regionLines[lockState.region] || '一道锁……亮起了。';
        this._showBossBubble(line, 'focus');
      }
    }

    // 检查是否所有锁都进入了 primed 状态
    let allPrimed = true;
    let primedCount = 0;
    for (const lockId of lockIds) {
      const lockState = this._regionLockStates[lockId];
      if (lockState.primed) {
        primedCount++;
      } else {
        allPrimed = false;
      }
    }

    console.log('[GuideBattle] 联动锁待激活数量:', primedCount, '/', lockIds.length);

    if (allPrimed && lockIds.length > 0) {
      // 所有锁都处于 primed 状态 -> 同步解锁
      console.log('[GuideBattle] 全部联动锁待激活完毕，开始同步解锁！');
      this._onRegionLocksReleased();
    }
  },

  /**
   * 同步解锁反馈：所有联动锁同时释放
   */
  _onRegionLocksReleased() {
    this._allRegionLocksReleased = true;
    const releaseTime = Date.now();

    // 标记所有锁为已释放
    for (const lockId of Object.keys(this._regionLockStates)) {
      const lockState = this._regionLockStates[lockId];
      lockState.released = true;
      lockState.primed = false;
      lockState.locked = false;
      lockState.releaseTime = releaseTime;
    }

    console.log('[GuideBattle] 三人联动锁同步解锁！三区并蒂，笔记浮现');

    // 浮现笔记：将每个锁的 revealNotes 添加到棋盘对应格子的候选数中
    for (const lockId of Object.keys(this._regionLockStates)) {
      const lockState = this._regionLockStates[lockId];
      if (!lockState.revealNotes || lockState.revealNotes.length === 0) continue;

      for (const noteInfo of lockState.revealNotes) {
        const { r, c, notes } = noteInfo;
        const cell = this._board.cells[r]?.[c];
        if (!cell) continue;

        // 确保 cell.notes 存在
        if (!cell.notes) {
          cell.notes = new Set();
        }
        // 将笔记数字添加到候选数中
        for (const n of notes) {
          cell.notes.add(n);
        }
        // 标记为联动锁浮现的笔记（供渲染器特殊显示）
        if (!cell._revealedNotes) {
          cell._revealedNotes = new Set();
        }
        for (const n of notes) {
          cell._revealedNotes.add(n);
        }
        console.log('[GuideBattle] 笔记浮现: 格(', r, ',', c, ') 添加候选数', notes);
      }
    }

    // 音效
    if (typeof AudioService !== 'undefined' && AudioService.sfx) {
      AudioService.sfx.play('eureka');
    }

    // 通知渲染器触发联动锁解锁动画
    if (this._renderer && typeof this._renderer.triggerRegionLocksReleased === 'function') {
      this._renderer.triggerRegionLocksReleased();
    }

    // Boss 气泡台词（高优先级）
    this._showBossBubbleHigh('三区同鸣……封印尽解。这些笔记……终于可以安息了。', 'surprised', 5);
  },

  /**
   * 返回联动锁状态供渲染器使用
   */
  getRegionLockStates() {
    return this._regionLockStates;
  },

  /**
   * 返回是否有联动锁机制
   */
  hasRegionLocks() {
    return this._regionLockStates && Object.keys(this._regionLockStates).length > 0;
  },

  /**
   * 返回已浮现的笔记供渲染
   * @returns {Array<{r: number, c: number, notes: Array<number>}>}
   */
  getRevealedNotes() {
    const result = [];
    if (!this._board || !this._board.cells) return result;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this._board.cells[r]?.[c];
        if (cell && cell._revealedNotes && cell._revealedNotes.size > 0) {
          result.push({ r, c, notes: [...cell._revealedNotes] });
        }
      }
    }
    return result;
  },

  // ======================================================
  //  第5章：嵌套笼坍缩机制
  // ======================================================

  /**
   * 更新坍缩进度：在每次玩家得分后调用
   * 更新笼坍缩进度
   * @param {number} progress - 进度比率（0~1），或兼容旧版的 playerCount
   * @param {number} [winTarget] - 兼容旧版的胜利目标数
   * 如果进度跨过新阶段阈值 -> 触发阶段变化
   */
  _updateCollapseProgress(progress, winTarget) {
    if (!this._collapseConfig) return;

    // 兼容旧版调用方式：_updateCollapseProgress(playerCount, winTarget)
    let newProgress;
    if (winTarget !== undefined) {
      if (!winTarget || winTarget <= 0) return;
      newProgress = progress / winTarget;
    } else {
      newProgress = progress;
    }
    const oldProgress = this._collapseProgress;

    // 更新进度
    this._collapseProgress = Math.min(1, newProgress);

    const stages = this._collapseConfig.stages;
    if (!stages || stages.length === 0) return;

    // 检查是否跨过新阶段阈值
    let newStage = this._collapseStage;
    for (let i = this._collapseStage; i < stages.length; i++) {
      if (newProgress >= stages[i].progress && oldProgress < stages[i].progress) {
        newStage = i + 1; // 阶段索引从 0 开始，触发后进入下一阶段
        console.log('[GuideBattle] 笼坍缩阶段变化:', this._collapseStage, '->', newStage,
          '进度:', oldProgress.toFixed(2), '->', newProgress.toFixed(2));
        this._collapseStage = newStage;
        this._onCollapseStageChange(i);
      }
    }
  },

  /**
   * 阶段变化反馈
   * @param {number} stageIndex - 刚触发的阶段索引（0-based）
   */
  _onCollapseStageChange(stageIndex) {
    const stage = this._collapseConfig.stages[stageIndex];
    if (!stage) return;

    console.log('[GuideBattle] 第5章笼坍缩进入阶段', stageIndex + 1, ':', stage.description);

    // 阶段 0（progress 0.3）：外层笼开始收缩动画，和值显示"？？"
    // 阶段 1（progress 0.6）：外层笼和值完全显现
    // 阶段 2（progress 0.9）：外层笼完全坍缩，露出内层笼
    if (stage.fullyCollapsed) {
      // 完全坍缩：将外层笼加入已坍缩集合
      if (this._outerCageIds) {
        for (const cageId of this._outerCageIds) {
          this._collapsedCages.add(cageId);
        }
      }
      console.log('[GuideBattle] 外层笼完全坍缩，已坍缩笼子:', [...this._collapsedCages]);
    }

    // 音效
    if (typeof AudioService !== 'undefined' && AudioService.sfx) {
      const sfxMap = {
        0: 'hint',
        1: 'click',
        2: 'eureka',
      };
      const sfx = sfxMap[stageIndex] || 'click';
      AudioService.sfx.play(sfx);
    }

    // 通知渲染器
    if (this._renderer && typeof this._renderer.triggerCageCollapseStage === 'function') {
      this._renderer.triggerCageCollapseStage(stageIndex, stage);
    }

    // Boss 气泡台词
    const stageLines = [
      '推演进度 30%。外层结构开始收缩。',
      '推演进度 60%。外层和值：显现。',
      '推演进度 90%。外层坍缩。内层核心暴露。',
    ];
    const line = stageLines[stageIndex] || '结构变化中。';
    this._showBossBubble(line, 'default');
  },

  /**
   * 返回坍缩进度（0~1）供渲染器使用
   */
  getCollapseProgress() {
    return this._collapseProgress;
  },

  /**
   * 返回当前坍缩阶段
   */
  getCollapseStage() {
    return this._collapseStage;
  },

  /**
   * 返回已完全坍缩的笼子集合
   */
  getCollapsedCages() {
    return this._collapsedCages || new Set();
  },

  _checkWin() {
    // 翻盘机制检测
    this._checkComeback();

    if (this._weightedScoreEnabled) {
      // 加权得分模式：按三色加权分判定胜负
      if (this.playerScore >= this.winScore) {
        this._endBattle('win');
      } else if (this.aiScore >= this.winScore) {
        this._endBattle('lose');
      }
    } else {
      // 原始模式：按格子数判定胜负（向后兼容）
      if (this.playerCount >= this.winTarget) {
        this._endBattle('win');
      } else if (this.aiCount >= this.winTarget) {
        this._endBattle('lose');
      }
    }
  },

  // ======================================================
  //  破局翻盘机制
  // ======================================================

  _comeback: {
    active: false,
    triggerDiff: 10,   // 落后10格以上触发
    releaseDiff: 5,    // 落后5格以内解除
    speedBonus: 1.4,   // AI额外减速40%
  },

  /**
   * 检测翻盘状态
   * 玩家落后较多时触发"破局模式"，给玩家喘息和反击的机会
   */
  _checkComeback() {
    const diff = this.aiCount - this.playerCount;

    // 记录最大落后格数
    if (diff > (this._maxDeficit || 0)) {
      this._maxDeficit = diff;
    }

    if (!this._comeback.active && diff >= this._comeback.triggerDiff) {
      // 触发破局模式
      this._comeback.active = true;
      console.log('[GuideBattle] 破局模式激活！玩家落后', diff, '格');

      // 显示提示
      this._showComebackIndicator(true);

      // AI变慢
      if (this._difficulty) {
        this._difficulty.speedMultiplier *= this._comeback.speedBonus;
      }
    } else if (this._comeback.active && diff <= this._comeback.releaseDiff) {
      // 解除破局模式
      this._comeback.active = false;
      console.log('[GuideBattle] 破局模式解除，差距缩小到', diff, '格');

      this._showComebackIndicator(false);

      // 恢复AI速度
      if (this._difficulty) {
        this._difficulty.speedMultiplier /= this._comeback.speedBonus;
      }
    }
  },

  /**
   * 显示/隐藏翻盘指示器
   */
  _showComebackIndicator(show) {
    let indicator = document.getElementById('comeback-indicator');
    if (show) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'comeback-indicator';
        indicator.style.cssText = `
          position: fixed;
          top: 60px;
          left: 50%;
          transform: translateX(-50%);
          padding: 4px 12px;
          background: linear-gradient(135deg, rgba(251,191,36,0.9), rgba(249,115,22,0.9));
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          border-radius: 12px;
          z-index: 200;
          letter-spacing: 1px;
          box-shadow: 0 2px 10px rgba(251,191,36,0.4);
          animation: comebackPulse 1.5s ease-in-out infinite;
          pointer-events: none;
        `;
        indicator.textContent = '⚡ 破局中 · AI减速';
        document.body.appendChild(indicator);

        // 添加动画样式
        if (!document.getElementById('comeback-style')) {
          const style = document.createElement('style');
          style.id = 'comeback-style';
          style.textContent = `
            @keyframes comebackPulse {
              0%, 100% { opacity: 0.85; transform: translateX(-50%) scale(1); }
              50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
            }
          `;
          document.head.appendChild(style);
        }
      }
      indicator.style.display = 'block';
    } else if (indicator) {
      indicator.style.display = 'none';
    }
  },

  /**
   * 结束战斗
   */
  _endBattle(result) {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    this.active = false;

    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }

    console.log('[GuideBattle] Ended, result:', result,
      'playerCount:', this.playerCount,
      'aiCount:', this.aiCount,
      'winTarget:', this.winTarget,
      'weightedScore:', this._weightedScoreEnabled,
      'playerScore:', this.playerScore?.toFixed?.(1) ?? this.playerScore,
      'aiScore:', this.aiScore?.toFixed?.(1) ?? this.aiScore,
      'winScore:', this.winScore?.toFixed?.(2) ?? this.winScore);

    // 通知渲染层更新（显示最终状态）
    if (this._renderer && typeof this._renderer.render === 'function') {
      try {
        this._renderer.render(this._board);
      } catch (e) {
        console.error('[GuideBattle] Render error on end:', e);
      }
    }

    // 清理翻盘指示器
    const comeback = document.getElementById('comeback-indicator');
    if (comeback) comeback.remove();

    // 记录战绩
    this._recordBattleStats(result);

    // 喜剧系统：特殊成就检测
    this._checkComedyAchievements(result);

    if (this._onEndCallback) {
      try {
        this._onEndCallback(result, this.opponent);
      } catch (e) {
        console.error('[GuideBattle] onEnd callback error:', e);
        // 即使回调出错，也要确保清理
        this.stop();
      }
    }
  },

  // ======================================================
  //  战绩统计系统
  // ======================================================

  STATS_KEY: 'cagemaster_battle_stats',

  /**
   * 记录本次战斗数据
   */
  _recordBattleStats(result) {
    try {
      const stats = this._loadStats();
      const bossId = this.opponent?.id || 'unknown';
      const now = Date.now();

      const record = {
        bossId: bossId,
        bossName: this.opponent?.name || '',
        result: result, // 'win' | 'lose' | 'draw'
        playerCount: this.playerCount,
        aiCount: this.aiCount,
        totalEmpty: this.totalEmpty,
        winTarget: this.winTarget,
        bestCombo: this._combo?.bestCombo || 0,
        size: this.size,
        timestamp: now,
        duration: now - (this._startTime || now),
        difficulty: this._currentDifficulty || 'normal',
        // 三色加权得分
        weightedScore: this._weightedScoreEnabled,
        playerScore: this.playerScore,
        aiScore: this.aiScore,
        maxScore: this.maxScore,
        winScore: this.winScore,
      };

      // 初始化Boss数据
      if (!stats.bosses[bossId]) {
        stats.bosses[bossId] = {
          wins: 0,
          losses: 0,
          draws: 0,
          bestCombo: 0,
          fastestWin: null,
          totalPlayed: 0,
        };
      }

      const bossStat = stats.bosses[bossId];
      bossStat.totalPlayed++;
      if (result === 'win') {
        bossStat.wins++;
        if (!bossStat.fastestWin || record.duration < bossStat.fastestWin) {
          bossStat.fastestWin = record.duration;
        }
      } else if (result === 'lose') {
        bossStat.losses++;
      } else {
        bossStat.draws++;
      }
      if (record.bestCombo > bossStat.bestCombo) {
        bossStat.bestCombo = record.bestCombo;
      }

      // 全局统计
      stats.total.battles++;
      if (result === 'win') stats.total.wins++;
      else if (result === 'lose') stats.total.losses++;
      if (record.bestCombo > stats.total.bestCombo) {
        stats.total.bestCombo = record.bestCombo;
      }

      // 最近记录（最多保留20条）
      stats.recent.unshift(record);
      if (stats.recent.length > 20) stats.recent = stats.recent.slice(0, 20);

      this._saveStats(stats);
      console.log('[GuideBattle] 战绩已记录:', result, 'vs', bossId);
    } catch (e) {
      console.warn('[GuideBattle] 战绩记录失败:', e);
    }
  },

  /**
   * 加载战绩数据
   */
  _loadStats() {
    try {
      const data = localStorage.getItem(this.STATS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {
      total: { battles: 0, wins: 0, losses: 0, bestCombo: 0 },
      bosses: {},
      recent: [],
    };
  },

  /**
   * 保存战绩数据
   */
  _saveStats(stats) {
    try {
      localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
    } catch (e) {
      console.warn('[GuideBattle] 战绩保存失败:', e);
    }
  },

  /**
   * 获取指定Boss的战绩
   */
  getBossStats(bossId) {
    const stats = this._loadStats();
    return stats.bosses[bossId] || null;
  },

  /**
   * 获取全局战绩
   */
  getTotalStats() {
    return this._loadStats().total;
  },

  /**
   * 重置所有战绩
   */
  resetStats() {
    try {
      localStorage.removeItem(this.STATS_KEY);
      console.log('[GuideBattle] 战绩已重置');
    } catch (e) {}
  },

  // ======================================================
  //  喜剧系统（彩蛋/成就）
  // ======================================================

  _comedyKey: 'cagemaster_comedy_achievements',

  /**
   * 检测喜剧成就（战斗结束时触发）
   */
  _checkComedyAchievements(result) {
    try {
      const achievements = this._loadComedyAchievements();
      const bossId = this.opponent?.id || 'unknown';
      const newAchievements = [];

      // 1. 【手滑了】AI单局失误5次以上
      if (this._aiMistakeCount && this._aiMistakeCount >= 5) {
        if (!achievements['hand_slippery']) {
          achievements['hand_slippery'] = {
            name: '手滑了',
            desc: '在一局中目睹AI失误5次以上',
            unlockedAt: Date.now(),
          };
          newAchievements.push('手滑了');
        }
      }

      // 2. 【盗圣】单局抢格10次以上
      if (this._stealCount && this._stealCount >= 10) {
        if (!achievements['thief_king']) {
          achievements['thief_king'] = {
            name: '盗圣',
            desc: '单局从AI手中抢走10个格子',
            unlockedAt: Date.now(),
          };
          newAchievements.push('盗圣');
        }
      }

      // 3. 【史诗翻盘】落后10格以上反败为胜
      if (result === 'win' && this._maxDeficit && this._maxDeficit >= 10) {
        if (!achievements['epic_comeback']) {
          achievements['epic_comeback'] = {
            name: '史诗翻盘',
            desc: '落后10格以上反败为胜',
            unlockedAt: Date.now(),
          };
          newAchievements.push('史诗翻盘');
        }
      }

      // 4. 【闪电战】60秒内击败Boss
      const duration = Date.now() - (this._startTime || Date.now());
      if (result === 'win' && duration < 60000) {
        if (!achievements['blitzkrieg']) {
          achievements['blitzkrieg'] = {
            name: '闪电战',
            desc: '60秒内击败Boss',
            unlockedAt: Date.now(),
          };
          newAchievements.push('闪电战');
        }
      }

      // 5. 【菜鸡互啄】双方失误加起来超过10次
      const playerMistakes = this._playerMistakeCount || 0;
      const aiMistakes = this._aiMistakeCount || 0;
      if (playerMistakes + aiMistakes >= 10) {
        if (!achievements['noob_battle']) {
          achievements['noob_battle'] = {
            name: '菜鸡互啄',
            desc: '双方加起来失误10次以上',
            unlockedAt: Date.now(),
          };
          newAchievements.push('菜鸡互啄');
        }
      }

      // 6. 【完美胜利】0失误击败Boss
      if (result === 'win' && playerMistakes === 0) {
        if (!achievements['perfect_win']) {
          achievements['perfect_win'] = {
            name: '完美胜利',
            desc: '零失误击败Boss',
            unlockedAt: Date.now(),
          };
          newAchievements.push('完美胜利');
        }
      }

      // 保存并弹出通知
      if (newAchievements.length > 0) {
        this._saveComedyAchievements(achievements);
        newAchievements.forEach((name, idx) => {
          setTimeout(() => {
            this._showAchievementPopup(name);
          }, idx * 2000);
        });
        console.log('[GuideBattle] 解锁喜剧成就:', newAchievements);
      }
    } catch (e) {
      console.warn('[GuideBattle] 喜剧成就检测失败:', e);
    }
  },

  /**
   * 显示成就解锁弹窗
   */
  _showAchievementPopup(name) {
    const popup = document.createElement('div');
    popup.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      padding: 8px 16px;
      background: linear-gradient(135deg, #fbbf24, #f97316);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      border-radius: 20px;
      z-index: 3000;
      box-shadow: 0 4px 20px rgba(251,191,36,0.5);
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: none;
      white-space: nowrap;
    `;
    popup.innerHTML = `🏆 成就解锁：${name}`;
    document.body.appendChild(popup);

    // 弹入
    requestAnimationFrame(() => {
      popup.style.opacity = '1';
      popup.style.transform = 'translateX(-50%) translateY(0)';
    });

    // 3秒后消失
    setTimeout(() => {
      popup.style.opacity = '0';
      popup.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => popup.remove(), 500);
    }, 3000);
  },

  _loadComedyAchievements() {
    try {
      const data = localStorage.getItem(this._comedyKey);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {};
  },

  _saveComedyAchievements(achievements) {
    try {
      localStorage.setItem(this._comedyKey, JSON.stringify(achievements));
    } catch (e) {}
  },

  /**
   * 获取所有已解锁喜剧成就
   */
  getComedyAchievements() {
    return this._loadComedyAchievements();
  },

  /**
   * 获取Boss配置
   */
  getBossConfig(chapterId) {
    return BOSS_CONFIGS[chapterId] || null;
  },

  /**
   * 判断是否为Boss关卡
   */
  isBossLevel(chapterId, levelId, chapterData) {
    if (!chapterData || !chapterData.levels) return false;
    const normalLevels = chapterData.levels.filter(l => !l.isHidden);
    if (normalLevels.length === 0) return false;
    const lastLevel = normalLevels[normalLevels.length - 1];
    return parseInt(lastLevel.levelId) === parseInt(levelId);
  },
};

// 暴露到全局
window.GuideBattle = GuideBattle;
window.BOSS_CONFIGS = BOSS_CONFIGS;
