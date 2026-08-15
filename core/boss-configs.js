// 纯结构拆分（Phase 1）：BATTLE_EVENTS + BOSS_CONFIGS，内容与原 battle-manager.js L88–L415 逐字一致。
// ---------------------------------------------------------------------------
// 2. 事件类型常量（UI 层通过 onEvent(eventType, data) 消费）
// ---------------------------------------------------------------------------
export const BATTLE_EVENTS = Object.freeze({
  BATTLE_START: 'battle_start',             // data: { opponent, size, totalEmpty, winTarget }
  BATTLE_END: 'battle_end',                 // data: { result, playerCount, aiCount, winTarget }
  BOSS_BUBBLE: 'boss_bubble',               // data: { text, emotion, name, color }
  WARNING_OVERLAY: 'warning_overlay',       // data: { color, duration }
  COMBO_FEEDBACK: 'combo_feedback',         // data: { count, text, color, wasStolen }
  COMBO_FLOATING: 'combo_floating',         // data: { count, text, color }
  COUNTER: 'counter',                       // V4.3.22：看破——玩家纠正 AI 犯错格 { r, c }
  SCORE_FLOAT: 'score_float',               // V4.3.23（Spec v1.2）：得分飘字 { r, c, text, color }
  HOTSPOT_REFRESH: 'hotspot_refresh',       // V4.3.23：关键格刷新 { hotspots, phase }
  BOSS_QUIP: 'boss_quip',                   // V4.3.23：AI 头顶台词 { key }（台词池在 UI 层）
  FOCUS_UPDATE: 'focus_update',             // V4.3.24（Spec v1.3）：专注值变化 { player, ai }
  DEATHBLOW: 'deathblow',                   // V4.3.24：忍杀触发 { side: 'player'|'ai', duration }
  PARRY: 'parry',                           // V4.3.24：招架成功 { r, c }
  SIEGE_START: 'siege_start',               // V4.3.24：AI 蓄力锁定关键格 { r, c, duration }
  SIEGE_END: 'siege_end',                   // V4.3.24：蓄力结束 { r, c, result: 'auto'|'parried'|'cancelled' }
  NOTE_FAKE: 'note_fake',                   // V4.3.25（Spec v1.4）：玩家写了假笔记（不可能候选）{ r, c, num }
  NOTE_MISLEAD: 'note_mislead',             // V4.3.25：AI 被假笔记误导（填了别处）{ r, c }
  NOTE_DISTRACT: 'note_distract',           // V4.3.25：声东击西（清笔记后填对）{ r, c }
  BOARD_CHANGED: 'board_changed',           // data: { board }
  PARTICLES: 'particles',                   // data: { col, row, type, count }
  SFX: 'sfx',                               // data: { name, volume }
  GATE_ALERT: 'gate_alert',                 // data: { r, c, duration }
  LOCK_RELEASED: 'lock_released',           // data: { cageId, releaseEvent }
  ALL_LOCKS_OPEN: 'all_locks_open',         // data: {}
  REGION_LOCK_PRIMED: 'region_lock_primed', // data: { lockId }
  REGION_LOCKS_RELEASED: 'region_locks_released', // data: {}
  CAGE_COLLAPSE_STAGE: 'cage_collapse_stage', // data: { stageIndex, stage }
  FAKE_CELL_EXPOSED: 'fake_cell_exposed',   // data: { r, c }
  FAKE_CELL_FAIL: 'fake_cell_fail',         // data: { r, c }
  GUANJU_HIGHLIGHT: 'guanju_highlight',     // data: { targets }
  GUANJU_HIGHLIGHT_CLEAR: 'guanju_highlight_clear', // data: {}
  COMEBACK_INDICATOR: 'comeback_indicator', // data: { show }
  ACHIEVEMENT: 'achievement',               // data: { name }
  BOSS_BATTLE_STATE: 'boss_battle_state',   // data: { active }
  BOSS_STATS_UPDATED: 'boss_stats_updated', // data: { bossId, stats }
});

// ---------------------------------------------------------------------------
// 3. BOSS_CONFIGS - 全部 8 章 Boss 配置（含 battleData、lockCells、
//    preDialog、winDialog、warningLines、battleTuning 等）
// ---------------------------------------------------------------------------
export const BOSS_CONFIGS = {
  // 第1章：薇拉 - 冷静疏离的旧书铺店主，出题如设局
  // 试炼石Boss战：6×6杀手数独 + 机关锁格机制
  // V4.3.21：Boss 定为薇拉——旧书铺店主、情报网联络员，
  // 第1章作为新手章用"试探布局"的薇拉（blind 人格：低技巧+随机犯错+看错行+盲盒猜格），
  // 给玩家留出错空间，也更有戏剧张力
  1: {
    id: 'yingying',
    name: '薇拉',
    portrait: 'ch1_vera_default.png',
    color: '#f59e0b',
    speedMin: 5500,
    speedMax: 10000,
    mistakeChance: 0.18,
    personality: '冷静疏离的旧书铺店主，出题如设局，言语克制',

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
      { speaker: '薇拉', text: '想进这扇门，先解我一道题。', emotion: 'serious' },
      { speaker: '薇拉', text: '出题如设局——你最好跟得上。', emotion: 'confident' },
    ],
    winDialog: [
      { speaker: '薇拉', text: '……解开了。你比我想象的更快。', emotion: 'surprised' },
      { speaker: '薇拉', text: '这道题，算你过了。', emotion: 'smile' },
    ],
    warningLines: [
      { speaker: '薇拉', text: '别急。题，还没解完。', emotion: 'serious' },
    ],
    // V4.3.20：杀手数独适配（薇拉沿用）——
    // isKiller=true：连击阈值 2、震慑基础 2000ms 上限 4s、拦截冷却 8s，适配 6×6 心算节奏。
    battleTuning: {
      isKiller: true,              // 标记为杀手数独关卡
      interceptCooldown: 3000,     // 扫描调参：8s→3s（冷却越低 AI 拦截越频繁，贴近 FunScore 甜区）
      focusGain: 5,                // 扫描最优(FOCUS_GAINS=5)：专注累积加速，忍杀触发局占比 80-100%
      ultTriggerAt: 0.85,          // 必杀技触发延后到 85%
      warningPhase1At: 0.70,       // 第一阶段预警 70%
      warningPhase2At: 0.85,       // 第二阶段预警 85%
      fadeCagesInBattle: true,     // 淡化笼子虚线，降低视觉负载
      pulseEnabled: true,          // 候选数脉冲机制
    },
  },
  // 第2章：伊藤 - 特高课警官，与父亲相识，冷静克制
  // 杀手数独专属配置：大幅降低节奏，给玩家留足心算空间
  2: {
    id: 'cagekeeper',
    name: '伊藤',
    portrait: 'ito_default.png',
    color: '#6366f1',
    speedMin: 5500,        // 杀手数独：大幅增加基础思考时间
    speedMax: 8500,        // 给玩家留足心算和组合拆分的时间
    mistakeChance: 0.08,
    personality: '特高课警官，与父亲相识，言语克制冷静，暗中观察',
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
      interceptCooldown: 3000,     // 扫描调参：8s→3s（冷却越低 AI 拦截越频繁，贴近 FunScore 甜区）
      focusGain: 5,                // 扫描最优(FOCUS_GAINS=5)：专注累积加速，忍杀触发局占比 80-100%
      ultTriggerAt: 0.85,          // 必杀技触发从70%延后到85%
      warningPhase1At: 0.70,       // 第一阶段预警从60%延后到70%
      warningPhase2At: 0.85,       // 第二阶段预警从70%延后到85%
      fadeCagesInBattle: true,     // Boss战中淡化笼子虚线，降低视觉负载
      pulseEnabled: true,          // 启用候选数脉冲机制
    },
    preDialog: [
      { speaker: '伊藤', text: '藏书楼地下，不是谁都能进来的。', emotion: 'serious' },
      { speaker: '伊藤', text: '让我看看，你配不配走这条路。', emotion: 'serious' },
    ],
    winDialog: [
      { speaker: '伊藤', text: '……不错。你父亲当年，也是这个走法。', emotion: 'default' },
      { speaker: '伊藤', text: '这条路，你走得下去。', emotion: 'serious' },
    ],
    warningLines: [
      { speaker: '伊藤', text: '稳一点。别急。', emotion: 'serious' },
    ],
  },
  // 第3章：伊藤 - 特高课警官，在暗门与密室间布下考题
  3: {
    id: 'plotterShadow',
    name: '伊藤',
    portrait: 'ito_default.png',
    color: '#ef4444',
    speedMin: 2500,
    speedMax: 4500,
    mistakeChance: 0.03,
    personality: '特高课警官，在暗门与密室间布下考题，冷静逼人',
    // 幻影格机制配置
    battleTuning: {
      focusGain: 5,                // 扫描最优(FOCUS_GAINS=5)：忍杀触发局占比 80-100%
      fakeCellsEnabled: true,
      // 2个幻影格：位置 + 假数字 + 真数字
      fakeCells: [
        { r: 0, c: 7, fakeNum: 6, realNum: 8 },
        { r: 3, c: 1, fakeNum: 4, realNum: 7 },
      ],
    },
    preDialog: [
      { speaker: '伊藤', text: '暗门之后，每一道题都是一道门。', emotion: 'serious' },
      { speaker: '伊藤', text: '你能推开几扇？', emotion: 'serious' },
    ],
    winDialog: [
      { speaker: '伊藤', text: '……七道题，你全解了。', emotion: 'default' },
      { speaker: '伊藤', text: '最深处的门，你有资格推开。', emotion: 'serious' },
    ],
    warningLines: [
      { speaker: '伊藤', text: '门后还有门。你走不完的。', emotion: 'serious' },
    ],
  },
  // 第4章：伊藤 - 特高课警官，补全终题之人，言语间藏着深意
  4: {
    id: 'remnant',
    name: '伊藤',
    portrait: 'ito_default.png',
    color: '#f97316',
    speedMin: 2000,
    speedMax: 3800,
    mistakeChance: 0.02,
    personality: '特高课警官，补全终题之人，言语间藏着深意',
    // 三人联动锁机制：三区并蒂锁同步解锁 + 笔记浮现
    battleTuning: {
      focusGain: 5,                // 扫描最优(FOCUS_GAINS=5)：忍杀触发局占比 80-100%
      regionLocksEnabled: true,
      regionLocks: [
        { id: 'lock_a', region: 'left', condition: 'all_filled', cells: [[0,0],[0,1],[1,0],[1,1]], revealNotes: [{r:0,c:2,notes:[3,5,7]}] },
        { id: 'lock_b', region: 'center', condition: 'all_filled', cells: [[4,4],[4,5],[5,4],[5,5]], revealNotes: [{r:3,c:3,notes:[2,4,8]}] },
        { id: 'lock_c', region: 'right', condition: 'all_filled', cells: [[7,7],[7,8],[8,7],[8,8]], revealNotes: [{r:6,c:6,notes:[1,6,9]}] },
      ],
    },
    preDialog: [
      { speaker: '伊藤', text: '你所有的题，我都看过了。', emotion: 'default' },
      { speaker: '伊藤', text: '这道，是我补的。', emotion: 'serious' },
    ],
    winDialog: [
      { speaker: '伊藤', text: '……你解开了。', emotion: 'default' },
      { speaker: '伊藤', text: '三条路，在你这里对齐了。', emotion: 'serious' },
    ],
    warningLines: [
      { speaker: '伊藤', text: '对齐，不是那么容易的事。', emotion: 'serious' },
    ],
  },
  // 第5章：山田 - 特高课搜查官，率测向车布控，冷硬紧逼
  5: {
    id: 'weaver',
    name: '山田',
    portrait: 'yamada_default.png',
    color: '#a855f7',
    speedMin: 1500,
    speedMax: 2800,
    mistakeChance: 0.01,
    personality: '特高课搜查官，率测向车布控，言语冷硬，步步紧逼',
    // 嵌套笼坍缩机制：笼边界收缩 + 释放隐藏和值
    battleTuning: {
      focusGain: 5,                // 扫描最优(FOCUS_GAINS=5)：忍杀触发局占比 80-100%
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
      { speaker: '山田', text: '藏书楼上方，测向车已经就位。', emotion: 'serious' },
      { speaker: '山田', text: '你发不出去的。', emotion: 'serious' },
    ],
    winDialog: [
      { speaker: '山田', text: '……信号消失了。', emotion: 'angry' },
      { speaker: '山田', text: '你赢了这一局。但别以为结束了。', emotion: 'serious' },
    ],
    warningLines: [
      { speaker: '山田', text: '六分钟。你只有六分钟。', emotion: 'serious' },
    ],
  },
  // 第6章：山田 - 特高课搜查官，追查沈墨至茶馆，言语压迫
  6: {
    id: 'plotter',
    name: '山田',
    portrait: 'yamada_default.png',
    color: '#dc2626',
    speedMin: 1000,
    speedMax: 2000,
    mistakeChance: 0.005,
    personality: '特高课搜查官，追查沈墨至茶馆，言语压迫，深不可测',
    preDialog: [
      { speaker: '山田', text: '你的名字，在这份档案里。', emotion: 'serious' },
      { speaker: '山田', text: '第三页。', emotion: 'serious' },
    ],
    winDialog: [
      { speaker: '山田', text: '……我来确认你不值得抓。', emotion: 'serious' },
      { speaker: '山田', text: '你确实，不值得。', emotion: 'default' },
    ],
    warningLines: [
      { speaker: '山田', text: '我手下有人替你改过这一条。我没查出是谁。', emotion: 'serious' },
    ],
    battleTuning: {
      focusGain: 5,                // 扫描最优(FOCUS_GAINS=5)：忍杀触发局占比 80-100%
    },
  },
  // 第7章：伊藤 - 特高课警官，终局现身，言语平静如海面
  7: {
    id: 'setterSecret',
    name: '伊藤',
    portrait: 'ito_default.png',
    color: '#a855f7',
    speedMin: 800,
    speedMax: 1600,
    mistakeChance: 0.003,
    personality: '特高课警官，终局现身，言语平静，如海面般深不可测',
    preDialog: [
      { speaker: '伊藤', text: '你走完了。', emotion: 'default' },
      { speaker: '伊藤', text: '我走得比你早。但我没有停下来过。', emotion: 'serious' },
    ],
    winDialog: [
      { speaker: '伊藤', text: '你留了短横，我留了竖线。三代人。三种刻法。', emotion: 'default' },
      { speaker: '伊藤', text: '你走到了最后。而我只是经过。', emotion: 'serious' },
    ],
    warningLines: [
      { speaker: '伊藤', text: '下一站，我下船。', emotion: 'default' },
    ],
    battleTuning: {
      focusGain: 5,                // 扫描最优(FOCUS_GAINS=5)：忍杀触发局占比 80-100%
    },
  },
};
