// ============================================================
//  duel-ai-tpl.mjs - 三点连线（Three Point Line）AI 对战驱动
//  （V2.0 替代旧的 duel-ai.mjs BattleManager 体系）
// ============================================================
//  设计目标：
//    用 ThreePointLineManager 替代 BattleManager 的 Focus/Parry/Interception，
//    成为 CM4 主线 Boss 战唯一调试器。
//
//  核心变更：
//    - 据点系统：3 宫争夺 → 三点连线获胜
//    - 连击势能：玩家连续填对加速据点进度（Combo 3→×1.5, 5→×2.0, 7→×2.5）
//    - 主权反击：玩家在已占领据点内填数获得 ×1.5 额外进度
//    - 城堡点：夺城堡者触发小忍杀 + 翻倍期
//    - 胜负路径：三点连线 / 全局解题 / 强制结算
//
//  用法：
//    node scripts/duel-ai-tpl.mjs [关卡] [局数] [--trace]
//    例：node scripts/duel-ai-tpl.mjs 109 12 --trace
//    可选参数：
//      --player=ying|average|yan  玩家侧 AI 人格（默认 ying）
//      --spawn=yan|ying|average    Boss 侧 AI 人格（默认 yan）
//      --fakeNoteRate=0.8          A/B 测试：覆盖 spawn 侧 AI 假笔记率（默认不覆盖）
//      --spawnNoteRate=0.8         A/B 测试：覆盖 spawn 侧 AI 真笔记率（默认不覆盖）
//      --playerNoteRate=0.8        A/B 测试：覆盖玩家侧 AI 真笔记率（默认不覆盖）
//      --hubLock=5000              据点锁定时间 ms（默认 5000）
//      --occupyThreshold=4         据点占领阈值（默认 4）
//      --transferThreshold=2       易手反超阈值（默认 2）
//      --noComboMomentum           禁用连击势能
//      --noHomeField               禁用主权反击
//      --noObserver                V4.3.40：关闭对手观察器（A/B 对比）
//      --observerWindow=48         V4.3.44：观察窗口（默认 24，极端测试 48）
//      --observerIntensity=2.0     V4.3.44：观察响应强度（默认 1.0，极端测试 2.0）
//      --autoLink                  v2.0：启用 AI 自动连线绝杀决策（默认开启；
//                                  领先→立即连线，落后→放弃连线，持平→50% 连线）
//      --noAutoLink                v2.0：关闭自动连线——占满 3 据点后一律放弃连线走全局解题
//
//  v2.0 备注：
//    - 假笔记（fakeNoteRate，设局人 80%）在 AI vs AI 对战中无效果——AI 对手
//      看不见对方的笔记内容；假笔记仅用于真实玩家对局中的人机误导。
//    - 绝杀判定在每次回合前检查：棋盘满 + 同一方占领全部 3 据点时，
//      按填数领先/落后/持平自动走对应分支（见 playOnce 循环）。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { AIPlayerCore } from '../core/battle-manager.js';
import { HeadlessEngine } from '../core/headless-engine.js';
import { ThreePointLineManager, TPL_EVENTS } from '../core/three-point-line-manager.js';
import { Director, detectPhase } from '../core/director.js';
import { DramaTracker } from '../core/drama-metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const LEVEL = Number(process.argv[2] || 109);
const ROUNDS = Number(process.argv[3] || 8);
const TRACE = process.argv.includes('--trace');
const PLAYER = (() => {
  const m = process.argv.find((a) => a.startsWith('--player='));
  return m ? m.split('=')[1] : 'ying';
})();
const SPAWN = (() => { const m = process.argv.find((a) => a.startsWith('--spawn=')); return m ? m.split('=')[1] : 'yan'; })();
const FAKE_NOTE_RATE = (() => { const m = process.argv.find((a) => a.startsWith('--fakeNoteRate=')); return m ? Number(m.split('=')[1]) : null; })();
const SPAWN_NOTE_RATE = (() => { const m = process.argv.find((a) => a.startsWith('--spawnNoteRate=')); return m ? Number(m.split('=')[1]) : null; })();
const PLAYER_NOTE_RATE = (() => { const m = process.argv.find((a) => a.startsWith('--playerNoteRate=')); return m ? Number(m.split('=')[1]) : null; })();
const HUB_LOCK = (() => { const m = process.argv.find((a) => a.startsWith('--hubLock=')); return m ? Number(m.split('=')[1]) : null; })();
const OCCUPY_THRESHOLD = (() => { const m = process.argv.find((a) => a.startsWith('--occupyThreshold=')); return m ? Number(m.split('=')[1]) : null; })();
const TRANSFER_THRESHOLD = (() => { const m = process.argv.find((a) => a.startsWith('--transferThreshold=')); return m ? Number(m.split('=')[1]) : null; })();
const NO_COMBO = process.argv.includes('--noComboMomentum');
const NO_HOME = process.argv.includes('--noHomeField');
const NO_OBSERVER = process.argv.includes('--noObserver'); // V4.3.40：关闭对手观察器（A/B 测试）
// V4.3.44：极端观察器参数——窗口/强度
const OBSERVER_WINDOW = (() => { const m = process.argv.find((a) => a.startsWith('--observerWindow=')); return m ? Number(m.split('=')[1]) : null; })();
const OBSERVER_INTENSITY = (() => { const m = process.argv.find((a) => a.startsWith('--observerIntensity=')); return m ? Number(m.split('=')[1]) : null; })();
// v2.0：AI 自动连线绝杀决策（默认开启；--noAutoLink 关闭）
const AUTO_LINK = !process.argv.includes('--noAutoLink');
// CM4-D1：Director Shadow Mode——注入 Director（只记录建议，不改行为），输出 ε 校准报告
const DIRECTOR_SHADOW = process.argv.includes('--directorShadow');
// CM4-R6：Director Active Mode——注入 Director 并启用 Strategy Activation Layer（调制 Solver 旋钮）
const DIRECTOR_ACTIVE = process.argv.includes('--directorActive');

// v2.0：命令行人格别名 → AI_PERSONALITIES 有效 key（'ying'/'yan' 在人格表不存在，会回退 steady 导致 noteRate=0）
const PERSONALITY_ALIASES = {
  ying: 'blind',   // 莹莹
  yan: 'expert',   // 阿妍
  yingying: 'blind',
};
const resolvePersonality = (name) => PERSONALITY_ALIASES[name] || name;

const rawLevel = JSON.parse(fs.readFileSync(path.join(ROOT, `data/levels/level-${LEVEL}.json`), 'utf8'));

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------
function findEmpty(board, heuristic) {
  const cands = [];
  for (let r = 0; r < board.size; r++) for (let c = 0; c < board.size; c++) {
    const cell = board.cells[r][c];
    if (cell && !cell.fixedNum && !cell.fillNum) cands.push({ r, c });
  }
  if (!cands.length) return null;
  if (heuristic === 'minCandidates') {
    let best = cands[0], bestN = 99;
    for (const t of cands) {
      const cell = board.cells[t.r][t.c];
      const n = cell.candidates instanceof Set ? cell.candidates.size : (Array.isArray(cell.candidates) ? cell.candidates.length : 9);
      if (n < bestN) { bestN = n; best = t; }
    }
    return best;
  }
  return cands[Math.floor(Math.random() * cands.length)];
}

function wrongNum(size, correct) {
  let n = correct;
  while (n === correct) n = 1 + Math.floor(Math.random() * size);
  return n;
}

function classifyThinkNull(ai, board) {
  let realAny = false;
  let allOccupied = true;
  const techIds = ai._getTechPriority();
  for (const techId of techIds) {
    try {
      const rs = ai._rater._findAllByTechnique(techId);
      if (rs && rs.length > 0) {
        realAny = true;
        for (const r of rs) {
          const cell = board.cells[r.row]?.[r.col];
          if (cell && !cell.fixedNum && !cell.fillNum) { allOccupied = false; break; }
        }
        if (!allOccupied) break;
      }
    } catch (e) { /* 跳过 */ }
  }
  if (!realAny) return 'noCandidates';
  if (allOccupied) return 'candidatesOccupied';
  return 'rngMiss';
}

/**
 * v2.0：计算格子所在宫是否为据点宫（观察器热度用，返回据点索引 -1 表示非据点宫）
 */
function _hubBlockIndexOf(tpl, board, r, c) {
  try {
    const blocks = tpl.getHubBlocks();
    if (!blocks || !blocks.length) return -1;
    const size = board.size || 9;
    const boxH = size <= 6 ? 2 : 3;
    const boxW = size / boxH;
    const blockIdx = Math.floor(r / boxH) * boxH + Math.floor(c / boxW);
    return blocks.indexOf(blockIdx);
  } catch (e) { return -1; }
}

/**
 * 将 TPL 据点状态转换为 AI 可用的游戏状态对象
 */
function buildGameState(tpl, side, progress, consecutiveErrors, consecutiveCorrect) {
  const progressArr = tpl.getHubProgress();
  const hubBlocks = tpl.getHubBlocks();
  const castleHubIdx = tpl.getCastleHubIdx();
  const hubOwnership = progressArr.map((p) => p.occupiedBy || null);
  const selfHubCount = hubOwnership.filter((o) => o === side).length;
  const opponentHubCount = hubOwnership.filter((o) => o !== null && o !== side).length;
  // 玩家防守强度：各据点中玩家占领维度数占比
  const playerDefense = {};
  for (let i = 0; i < progressArr.length; i++) {
    const p = progressArr[i];
    playerDefense[i] = p.playerDims / Math.max(p.playerDims + p.bossDims, 1);
  }

  return {
    isLeading: selfHubCount > opponentHubCount ? true : (selfHubCount < opponentHubCount ? false : null),
    selfHubCount,
    opponentHubCount,
    progress,
    consecutiveErrors,
    consecutiveCorrect: consecutiveCorrect || 0,
    isBurst: false,
    hubBlocks,
    castleHubIdx,
    hubOwnership,
    playerDefense,
    // v2.0：策略状态机输入——各据点维度计数 + 迁移失败
    hubCounts: typeof tpl.getHubCounts === 'function'
      ? tpl.getHubCounts()
      : progressArr.map((p) => ({ id: p.id, player: p.playerDims, boss: p.bossDims })),
    migrationFailed: typeof tpl.isMigrationFailed === 'function' ? tpl.isMigrationFailed() : false,
  };
}

// ---------------------------------------------------------------------------
// 单局对战
// ---------------------------------------------------------------------------
async function playOnce() {
  const levelData = JSON.parse(JSON.stringify(rawLevel));
  const engine = new HeadlessEngine();
  engine.loadLevel(levelData);
  const board = engine.getBoard();
  const solution = levelData.solution;

  // 事件计数器
  const evCount = {};
  // CM4-D1 步骤5：戏剧质量指标采样器
  const drama = new DramaTracker();
  let currentProgress = 0; // 供 onEvent 记录决定性事件发生时的进度

  // ---- 创建三点连线管理器 ----
  const tplOptions = {};
  if (HUB_LOCK !== null) tplOptions.hubLockDuration = HUB_LOCK;
  if (OCCUPY_THRESHOLD !== null) tplOptions.hubOccupyThreshold = OCCUPY_THRESHOLD;
  if (TRANSFER_THRESHOLD !== null) tplOptions.hubTransferThreshold = TRANSFER_THRESHOLD;
  tplOptions.enableComboMomentum = !NO_COMBO;
  tplOptions.enableHomeField = !NO_HOME;
  // 静默日志：只输出 JSON 到 stdout
  tplOptions.logger = () => {};
  // Headless 模式：跳过时间延迟，同步执行
  tplOptions.headless = true;
  tplOptions.onEvent = (event, data) => {
    evCount[event] = (evCount[event] || 0) + 1;
    // CM4-D1 步骤5：决定性事件采样（据点占领/迁移/连线威胁/绝杀——供 Climax Density）
    if ([TPL_EVENTS.HUB_OCCUPIED, TPL_EVENTS.HUB_MIGRATED, TPL_EVENTS.HUB_MIGRATE_FAIL,
      TPL_EVENTS.LINE_READY, TPL_EVENTS.THREE_POINT_LINE].indexOf(event) >= 0) {
      drama.recordEvent(currentProgress);
    }
    // 捕获连击里程碑事件（替代外部手动计算）
    if (event === TPL_EVENTS.COMBO_MILESTONE) {
      milestoneEvents.push({ step: stepN, ...data });
    }
    if (TRACE) {
      const ts = Date.now();
      console.log(JSON.stringify({ roundTrace: true, level: LEVEL, event, data, ts }));
    }
  };

  const tpl = new ThreePointLineManager(board, solution, tplOptions);

  // ---- 创建 AI ----
  // V4.3.40：--noObserver 关闭对手观察器（A/B 对比）
  const playerAI = new AIPlayerCore(board, resolvePersonality(PLAYER),
    (r, c) => {
      // 简化：getCellCategory 返回 null（不使用 BattleManager 的类别系统）
      return null;
    }, false, !NO_OBSERVER);
  const bossAI = new AIPlayerCore(board, resolvePersonality(SPAWN),
    (r, c) => null, false, !NO_OBSERVER);

  // CM4-D1：Director Shadow Mode——注入 Director（只记录建议，不改行为）
  // CM4-R6：directorActive 时 shadow=false，启用 Strategy Activation Layer（调制旋钮）
  let playerDir = null, bossDir = null;
  if (DIRECTOR_SHADOW || DIRECTOR_ACTIVE) {
    const shadow = DIRECTOR_SHADOW && !DIRECTOR_ACTIVE; // active 优先级高于 shadow
    playerDir = new Director({ personality: resolvePersonality(PLAYER) });
    bossDir = new Director({ personality: resolvePersonality(SPAWN) });
    if (typeof playerAI.setDirector === 'function') playerAI.setDirector(playerDir, shadow);
    if (typeof bossAI.setDirector === 'function') bossAI.setDirector(bossDir, shadow);
  }

  // V4.3.39：A/B 测试——运行时覆盖玩家/spawn 侧 AI 的笔记率与假笔记率
  if (typeof playerAI.getPersonality === 'function' && PLAYER_NOTE_RATE !== null) {
    playerAI.getPersonality().noteRate = PLAYER_NOTE_RATE;
  }
  if (typeof bossAI.getPersonality === 'function') {
    if (FAKE_NOTE_RATE !== null) bossAI.getPersonality().fakeNoteRate = FAKE_NOTE_RATE;
    if (SPAWN_NOTE_RATE !== null) bossAI.getPersonality().noteRate = SPAWN_NOTE_RATE;
  }

  // V4.3.44：极端观察器参数——窗口/强度（作用于双方）
  if (!NO_OBSERVER) {
    if (OBSERVER_WINDOW !== null && typeof playerAI.setObserverWindow === 'function') {
      playerAI.setObserverWindow(OBSERVER_WINDOW);
      bossAI.setObserverWindow(OBSERVER_WINDOW);
    }
    if (OBSERVER_INTENSITY !== null && typeof playerAI.setObserverIntensity === 'function') {
      playerAI.setObserverIntensity(OBSERVER_INTENSITY);
      bossAI.setObserverIntensity(OBSERVER_INTENSITY);
    }
  }

  // V4.3.34：AI睁眼——注入 ownership 网格
  if (typeof playerAI.setOwnershipGrids === 'function') {
    playerAI.setOwnershipGrids(tpl.getAIOwnedGrid(), tpl.getPlayerOwnedGrid());
  }
  if (typeof bossAI.setOwnershipGrids === 'function') {
    bossAI.setOwnershipGrids(tpl.getPlayerOwnedGrid(), tpl.getAIOwnedGrid());
  }

  // ---- 统计 ----
  const trace = [];
  const s = {
    player: { fills: 0, correct: 0, wrong: 0, fallback: 0, rejected: 0, notes: 0, fakeNotes: 0 },
    boss: { fills: 0, correct: 0, wrong: 0, fallback: 0, rejected: 0, notes: 0, fakeNotes: 0 },
  };
  const nullStats = {
    player: { noCandidates: 0, candidatesOccupied: 0, rngMiss: 0 },
    boss: { noCandidates: 0, candidatesOccupied: 0, rngMiss: 0 },
  };
  const milestoneEvents = []; // 连击里程碑记录（由 TPL 事件填充）

  let stepN = 0;
  let guard = 0;
  const MAX_STEPS = 500;

  // V4.3.35：定时回合系统——基于填数间隔的时间调度
  // 用虚拟时间（秒）模拟并行填数，速度快的 AI 获得更多行动机会
  const TIME = { player: 0, boss: 0 };
  const CONSECUTIVE_ERRORS = { player: 0, boss: 0 };
  const CONSECUTIVE_CORRECT = { player: 0, boss: 0 }; // v2.0：连续填对数（动态错误率）

  // 每局开始时同步 AI 棋盘状态
  playerAI.syncFromBoard(board);
  bossAI.syncFromBoard(board);

  // 初始化游戏状态
  const totalEmpty = (() => {
    let c = 0;
    for (let r = 0; r < board.size; r++) for (let cc = 0; cc < board.size; cc++) {
      const cell = board.cells[r][cc];
      if (cell && !cell.fixedNum && !cell.fillNum) c++;
    }
    return c;
  })();

  while (!tpl.isEnded() && guard++ < MAX_STEPS) {
    stepN++;

    // 计算当前盘面进度
    const filledSoFar = totalEmpty - (() => {
      let c = 0;
      for (let r = 0; r < board.size; r++) for (let cc = 0; cc < board.size; cc++) {
        const cell = board.cells[r][cc];
        if (cell && !cell.fixedNum && !cell.fillNum) c++;
      }
      return c;
    })();
    const progress = totalEmpty > 0 ? filledSoFar / totalEmpty : 0;
    currentProgress = progress;
    // CM4-D1 步骤5：每步采样戏剧指标（Emotional Swing / Comeback Window）
    {
      const hubNow = tpl.getHubProgress();
      const pHubs = hubNow.filter((h) => h.occupiedBy === 'player').length;
      const bHubs = hubNow.filter((h) => h.occupiedBy === 'boss').length;
      drama.recordStep({
        step: stepN, progress,
        selfHubCount: pHubs, opponentHubCount: bHubs,
        phase: detectPhase({ progress, selfHubCount: pHubs, opponentHubCount: bHubs }),
      });
    }

    // 更新双方 AI 的 ownership 和游戏状态
    if (typeof playerAI.setOwnershipGrids === 'function') {
      playerAI.setOwnershipGrids(tpl.getAIOwnedGrid(), tpl.getPlayerOwnedGrid());
    }
    if (typeof bossAI.setOwnershipGrids === 'function') {
      bossAI.setOwnershipGrids(tpl.getPlayerOwnedGrid(), tpl.getAIOwnedGrid());
    }
    if (typeof playerAI.setGameState === 'function') {
      const pState = buildGameState(tpl, 'player', progress, CONSECUTIVE_ERRORS.player, CONSECUTIVE_CORRECT.player);
      pState.isBurst = false; // 玩家 AI 无爆发模式
      playerAI.setGameState(pState);
    }
    if (typeof bossAI.setGameState === 'function') {
      const bState = buildGameState(tpl, 'boss', progress, CONSECUTIVE_ERRORS.boss, CONSECUTIVE_CORRECT.boss);
      // 沈墨爆发检测
      const bossPersonality = bossAI.getPersonality();
      if (bossPersonality.name === 'prober' && bossPersonality.burstThreshold != null) {
        bState.isBurst = progress >= bossPersonality.burstThreshold;
      }
      bossAI.setGameState(bState);
    }

    // 定时回合调度：选时间更早的一方行动
    const side = TIME.player <= TIME.boss ? 'player' : 'boss';
    const ai = side === 'player' ? playerAI : bossAI;
    const opponentAI = side === 'player' ? bossAI : playerAI;
    const stats = side === 'player' ? s.player : s.boss;
    const nullStat = side === 'player' ? nullStats.player : nullStats.boss;
    const consecErrorsKey = side === 'player' ? 'player' : 'boss';
    const tplFill = side === 'player' ? tpl.onPlayerFill.bind(tpl) : tpl.onAIFill.bind(tpl);

    // v2.0 6.1：AI 绝杀决策——占领全部 3 据点且棋盘满时
    // 己方归属格领先 → 立即连线；落后 → 放弃连线；持平 → 50% 连线
    // （--autoLink 默认开启；--noAutoLink 时一律放弃连线走全局解题）
    if (tpl.canLineWin(side)) {
      if (!AUTO_LINK) {
        // 关闭自动连线：AI 选择不绝杀 → 直接走全局解题（否则 _lineReady 悬空不结束）
        tpl.declineLine();
        break;
      }
      const st = tpl.getStats();
      const myOwned = side === 'player' ? st.playerOwned : st.aiOwned;
      const oppOwned = side === 'player' ? st.aiOwned : st.playerOwned;
      let doLine = false;
      if (myOwned > oppOwned) doLine = true;
      else if (myOwned < oppOwned) doLine = false;
      else doLine = Math.random() < 0.5;
      if (doLine) {
        tpl.triggerLineWin(side);
      } else {
        tpl.declineLine();
      }
      break;
    }

    let step = ai.think();
    if (!step) {
      const reason = classifyThinkNull(ai, board);
      nullStat[reason]++;
      const t = findEmpty(board, 'minCandidates');
      if (!t) {
        // v2.0：棋盘满 + 可绝杀等待 → 非己方绝杀权/落后方一律放弃连线走全局解题，
        // 避免 _lineReady 悬空不结束出 draw
        if (tpl.isLineReady && tpl.isLineReady()) {
          const ls = tpl.getLineReadySide && tpl.getLineReadySide();
          if (ls !== side) {
            tpl.declineLine();
            break;
          }
        }
        break;
      }
      const correct = solution[t.r][t.c];
      step = {
        row: t.r, col: t.c,
        num: Math.random() < 0.82 ? correct : wrongNum(board.size, correct),
        techniqueName: '降级盲猜',
        isFallback: true,
      };
      stats.fallback++;
      trace.push({ step: stepN, side, action: 'think_null', reason });
    }

    // V4.3.37：幽灵格抢占——AI 优先抢据点宫幽灵格（据点争夺更激烈），统一应用错误率
    // V5 平衡：抢格加概率闸门（65%）——否则每回合必抢导致格子无限易手、归属无法积累、
    // 游戏拖到步数上限出 draw。抢格是机会主义行为，不是回合默认动作。
    if (!step.isNote && step.type !== 'note' && Math.random() < 0.65) {
      const ghostCells = tpl.getGhostCells(side);
      if (ghostCells.length > 0) {
        // 检查 AI 当前选择的格子是否是幽灵格
        const aiChoosingGhost = ghostCells.some(g => g.r === step.row && g.c === step.col);
        let targetGhost = null;

        if (!aiChoosingGhost) {
          // V4.3.37：优先抢据点宫内的幽灵格（提高据点争夺强度），其次才抢任意幽灵格
          const inHubGhosts = ghostCells.filter(g => {
            const cell = board.cells[g.r]?.[g.c];
            if (!cell || cell.fixedNum) return false;
            return _hubBlockIndexOf(tpl, board, g.r, g.c) >= 0;
          });
          const pool = inHubGhosts.length > 0 ? inHubGhosts : ghostCells;
          targetGhost = pool.find(g => {
            const cell = board.cells[g.r]?.[g.c];
            // 幽灵格抢占：忽略 fillNum（TPL 会处理抢占逻辑）
            return cell && !cell.fixedNum;
          });
        } else {
          // AI 已选中幽灵格，使用当前格子
          targetGhost = { r: step.row, c: step.col };
        }

        if (targetGhost) {
          // V4.3.37：抢格更激进但更冒险——人格错误率 + 15% 抢格风险溢价
          const personality = ai.getPersonality();
          const ghostErrorRate = (personality.baseErrorRate ?? 0.05) * (1 + (personality.stealErrorRatePenalty ?? 0)) + 0.15;
          const isMistake = Math.random() < ghostErrorRate;
          const correct = solution[targetGhost.r][targetGhost.c];
          const num = isMistake ? wrongNum(board.size, correct) : correct;
          step = {
            row: targetGhost.r, col: targetGhost.c,
            num,
            techniqueName: 'ghost_steal',
          };
          trace.push({ step: stepN, side, action: 'ghost_steal', r: targetGhost.r, c: targetGhost.c, isMistake });
        }
      }
    }

    // ---- 处理笔记操作 ----
    if (step.isNote || step.type === 'note') {
      // 记笔记操作：不经过 TPL，直接记录统计
      stats.notes++;
      if (step.isFake) stats.fakeNotes++;
      trace.push({
        step: stepN, side, action: 'note',
        r: step.r, c: step.c, nums: step.nums,
        isFake: step.isFake,
      });
      // 笔记操作很快，几乎不消耗时间
      TIME[side] += 0.2;
      // 同步 AI（笔记不改变棋盘，但 sync 不影响）
      ai.syncFromBoard(board);
      opponentAI.syncFromBoard(board);
      continue;
    }

    // ---- 处理填数操作 ----
    const { row, col, num } = step;
    const cell = board.cells[row]?.[col];
    if (!cell || cell.fixedNum) {
      // 格子不存在或固定格，浪费一次行动
      TIME[side] += 0.5;
      continue;
    }
    // 幽灵格抢占：允许填已实填的格子（TPL 会处理抢占逻辑）
    const isGhostSteal = step.techniqueName === 'ghost_steal';
    if (cell.fillNum && !isGhostSteal) {
      // 非幽灵抢占的已占格子，浪费一次行动
      TIME[side] += 0.5;
      continue;
    }

    const isCorrect = num === solution[row][col];

    // 先通知 TPL
    const tplResult = tplFill(row, col, num);
    if (!tplResult.success) {
      // TPL 拒绝（如错误锁定/格子已占/游戏结束），不写入棋盘
      ai.syncFromBoard(board);
      opponentAI.syncFromBoard(board);
      stats.rejected = (stats.rejected || 0) + 1;
      // 被拒绝也消耗时间
      TIME[side] += 0.5;
      continue;
    }

    // TPL 接受后，通过引擎填数
    const res = engine.fillCell(row, col, num);
    stats.fills++;
    if (isCorrect || res.success) {
      stats.correct++;
      CONSECUTIVE_ERRORS[consecErrorsKey] = 0;
      // v2.0：连对跟踪（动态错误率）
      if (isCorrect) CONSECUTIVE_CORRECT[consecErrorsKey]++;
      else CONSECUTIVE_CORRECT[consecErrorsKey] = 0;
    } else {
      stats.wrong++;
      CONSECUTIVE_ERRORS[consecErrorsKey]++;
      CONSECUTIVE_CORRECT[consecErrorsKey] = 0;
    }

    // 同步 AI
    ai.syncFromBoard(board);
    opponentAI.syncFromBoard(board);

    // CM4-D1 步骤5：记录本侧据点宫填数（供 Threat Readability 集中度）
    drama.recordHubMove(side, _hubBlockIndexOf(tpl, board, row, col));

    trace.push({
      step: stepN, side, action: 'fill', r: row, c: col, num,
      correct: isCorrect, filled: tplResult.success,
      technique: step.techniqueName,
      consecutiveErrors: CONSECUTIVE_ERRORS[consecErrorsKey],
    });

    // V4.3.40：更新对方 AI 的对手观察器（对方"看到"了自己这一步填在哪）
    if (typeof opponentAI.updateObserver === 'function') {
      opponentAI.updateObserver({
        r: row, c: col,
        hubIdx: _hubBlockIndexOf(tpl, board, row, col),
        isGhostSteal: step.techniqueName === 'ghost_steal',
      });
    }

    // 计算实际填数间隔（秒），使用 AI 的动态间隔
    const interval = typeof ai._calcDynamicInterval === 'function'
      ? ai._calcDynamicInterval()
      : (ai.getPersonality().fillInterval?.min || 1.5);
    TIME[side] += interval;

    // 检查是否已结束
    if (tpl.isEnded()) break;
  }

  // ---- 收集结果 ----
  const winner = tpl.getWinner() || 'draw';
  const winPath = tpl.getWinPath();
  const stats = tpl.getStats();
  const hubState = tpl.getHubState();

  // 据点事件直接使用 evCount（不再过滤）
  return {
    winner,
    winPath,
    playerCount: stats.playerOwned,
    aiCount: stats.aiOwned,
    playerHubs: stats.playerHubs,
    aiHubs: stats.aiHubs,
    playerCombo: stats.playerCombo,
    aiCombo: stats.aiCombo,
    s,
    nullStats,
    events: evCount,
    milestoneEvents,
    hubState,
    traceLen: trace.length,
    steps: stepN,
    // CM4-D1 步骤5：戏剧质量指标（结构代理）
    dramaMetrics: drama.finalize(),
    // CM4-D1：Director Shadow 汇总
    directorShadow: DIRECTOR_SHADOW
      ? {
          player: playerDir ? playerDir.summarizeShadow() : null,
          boss: bossDir ? bossDir.summarizeShadow() : null,
        }
      : null,
    // CM4-R6：Strategy Activation Layer 运行统计（active 模式）
    strategyActivation: DIRECTOR_ACTIVE
      ? {
          player: (playerAI && typeof playerAI.getStrategySelectorStats === 'function')
            ? playerAI.getStrategySelectorStats() : null,
          boss: (bossAI && typeof bossAI.getStrategySelectorStats === 'function')
            ? bossAI.getStrategySelectorStats() : null,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
(async () => {
  const results = [];
  for (let i = 0; i < ROUNDS; i++) {
    const r = await playOnce();
    results.push(r);
  }

  // 聚合
  const agg = {
    win: { player: 0, boss: 0, draw: 0 },
    winPath: { three_point_line: 0, full_board: 0, force_settle: 0 },
    s: {
      player: { fills: 0, correct: 0, wrong: 0, rejected: 0, notes: 0, fakeNotes: 0 },
      boss: { fills: 0, correct: 0, wrong: 0, rejected: 0, notes: 0, fakeNotes: 0 },
    },
    nullStats: {
      player: { noCandidates: 0, candidatesOccupied: 0, rngMiss: 0 },
      boss: { noCandidates: 0, candidatesOccupied: 0, rngMiss: 0 },
    },
    events: {},
    milestoneTotal: 0,
    playerOwned: 0,
    aiOwned: 0,
    playerHubs: 0,
    aiHubs: 0,
    steps: 0,
  };

  for (const r of results) {
    agg.win[r.winner]++;
    if (r.winPath) agg.winPath[r.winPath] = (agg.winPath[r.winPath] || 0) + 1;
    agg.s.player.fills += r.s.player.fills;
    agg.s.player.correct += r.s.player.correct;
    agg.s.player.wrong += r.s.player.wrong;
    agg.s.player.notes += r.s.player.notes || 0;
    agg.s.player.fakeNotes += r.s.player.fakeNotes || 0;
    agg.s.boss.fills += r.s.boss.fills;
    agg.s.boss.correct += r.s.boss.correct;
    agg.s.boss.wrong += r.s.boss.wrong;
    agg.s.boss.notes += r.s.boss.notes || 0;
    agg.s.boss.fakeNotes += r.s.boss.fakeNotes || 0;
    agg.nullStats.player.noCandidates += r.nullStats.player.noCandidates;
    agg.nullStats.player.candidatesOccupied += r.nullStats.player.candidatesOccupied;
    agg.nullStats.player.rngMiss += r.nullStats.player.rngMiss;
    agg.nullStats.boss.noCandidates += r.nullStats.boss.noCandidates;
    agg.nullStats.boss.candidatesOccupied += r.nullStats.boss.candidatesOccupied;
    agg.nullStats.boss.rngMiss += r.nullStats.boss.rngMiss;
    for (const [k, v] of Object.entries(r.events)) {
      agg.events[k] = (agg.events[k] || 0) + v;
    }
    agg.milestoneTotal += r.milestoneEvents.length;
    agg.playerOwned += r.playerCount;
    agg.aiOwned += r.aiCount;
    agg.playerHubs += r.playerHubs;
    agg.aiHubs += r.aiHubs;
    agg.steps += r.steps;
  }

  const out = {
    level: LEVEL,
    rounds: ROUNDS,
    player: PLAYER,
    spawn: SPAWN,
    params: {
      hubLock: HUB_LOCK,
      occupyThreshold: OCCUPY_THRESHOLD,
      transferThreshold: TRANSFER_THRESHOLD,
      comboMomentum: !NO_COMBO,
      homeField: !NO_HOME,
      observer: !NO_OBSERVER, // V4.3.40：对手观察器开关
      observerWindow: OBSERVER_WINDOW,     // V4.3.44：观察窗口（null=默认24）
      observerIntensity: OBSERVER_INTENSITY, // V4.3.44：响应强度（null=1.0）
      autoLink: AUTO_LINK, // v2.0：AI 自动连线绝杀决策
    },
    win: agg.win,
    winPath: agg.winPath,
    fillStats: {
      player: {
        fills: agg.s.player.fills,
        correct: agg.s.player.correct,
        accuracy: agg.s.player.fills ? (agg.s.player.correct / agg.s.player.fills * 100).toFixed(1) + '%' : 'N/A',
        notes: agg.s.player.notes,
        fakeNotes: agg.s.player.fakeNotes,
      },
      boss: {
        fills: agg.s.boss.fills,
        correct: agg.s.boss.correct,
        accuracy: agg.s.boss.fills ? (agg.s.boss.correct / agg.s.boss.fills * 100).toFixed(1) + '%' : 'N/A',
        notes: agg.s.boss.notes,
        fakeNotes: agg.s.boss.fakeNotes,
      },
    },
    thinkNull: agg.nullStats,
    events: agg.events,
    // CM4-D1：Director Shadow 汇总（校准双级 ε）
    directorShadow: DIRECTOR_SHADOW ? (() => {
      const acc = (key) => {
        const total = results.reduce((a, r) => a + (r.directorShadow?.[key]?.total || 0), 0);
        const same = results.reduce((a, r) => a + (r.directorShadow?.[key]?.recommendVsActual?.same || 0), 0);
        const diff = results.reduce((a, r) => a + (r.directorShadow?.[key]?.recommendVsActual?.diff || 0), 0);
        const gatedCount = results.reduce((a, r) => a + (r.directorShadow?.[key]?.gatedCount || 0), 0);
        const perStrategy = {};
        const phaseDist = {};
        for (const r of results) {
          const sh = r.directorShadow?.[key];
          if (!sh) continue;
          for (const [id, c] of Object.entries(sh.perStrategy || {})) perStrategy[id] = (perStrategy[id] || 0) + c;
          for (const [ph, c] of Object.entries(sh.phaseDist || {})) phaseDist[ph] = (phaseDist[ph] || 0) + c;
        }
        return {
          total, same, diff,
          diffRatio: total ? ((diff / total) * 100).toFixed(1) + '%' : 'N/A',
          gatedCount, perStrategy, phaseDist,
        };
      };
      return { player: acc('player'), boss: acc('boss') };
    })() : null,
    // CM4-D1 步骤5：戏剧质量指标聚合（跨局均值）
    dramaAvg: (() => {
      const n = results.length;
      const avg = (k) => n ? Number((results.reduce((a, r) => a + (r.dramaMetrics?.[k] || 0), 0) / n).toFixed(2)) : 0;
      const threat = { player: 0, boss: 0 };
      for (const r of results) {
        const t = r.dramaMetrics?.threatReadability || {};
        threat.player += t.player || 0;
        threat.boss += t.boss || 0;
      }
      return {
        emotionalSwing: avg('emotionalSwing'),
        comebackWindow: avg('comebackWindow'),
        climaxDensity: avg('climaxDensity'),
        decisiveEventsPerRound: avg('decisiveEvents'),
        threatReadabilityMean: n ? {
          player: Number((threat.player / n).toFixed(3)),
          boss: Number((threat.boss / n).toFixed(3)),
        } : { player: 0, boss: 0 },
      };
    })(),
    milestoneAvg: (agg.milestoneTotal / ROUNDS).toFixed(1),
    avgOwned: {
      player: (agg.playerOwned / ROUNDS).toFixed(1),
      boss: (agg.aiOwned / ROUNDS).toFixed(1),
    },
    avgHubs: {
      player: (agg.playerHubs / ROUNDS).toFixed(1),
      boss: (agg.aiHubs / ROUNDS).toFixed(1),
    },
    avgSteps: (agg.steps / ROUNDS).toFixed(0),
    // V4.3.36：FunScore 计算
    funScore: (() => {
      const totalRounds = ROUNDS;

      // 1. Tempo（据点易手频率 + 占领频率）
      const transfers = agg.events[TPL_EVENTS.HUB_TRANSFERRED] || 0;
      const avgTransfers = transfers / totalRounds;
      const tempoScore = Math.min(100, Math.max(0, (avgTransfers / 1.5) * 100));

      // 2. Risk（红叉抢占成功率）
      const stealAttempts = agg.events[TPL_EVENTS.CELL_STEAL_ATTEMPT] || 0;
      const stealSuccess = agg.events[TPL_EVENTS.CELL_STEAL_SUCCESS] || 0;
      const stealRate = stealAttempts > 0 ? stealSuccess / stealAttempts : 0;
      // V4.3.38：Risk 方案 B——双侧扣分，理想成功率 85%（偏离越远分越低）
      const idealStealRate = 0.85;
      const deviation = Math.abs(stealRate - idealStealRate);
      const riskScore = Math.max(0, Math.min(100, 100 - deviation * 200));

      // 3. Climax（三点连线触发率 + 全局解题率）
      const threePointLineWins = agg.winPath.three_point_line || 0;
      const fullBoardWins = agg.winPath.full_board || 0;
      const totalEndings = totalRounds;
      const climaxRate = (threePointLineWins + fullBoardWins) / totalEndings;
      const climaxScore = Math.min(100, Math.max(0, climaxRate * 100));

      // 4. 总分
      const total = Math.round(0.35 * tempoScore + 0.35 * riskScore + 0.30 * climaxScore);

      return {
        tempo: Math.round(tempoScore),
        risk: Math.round(riskScore),
        climax: Math.round(climaxScore),
        total,
      };
    })(),
    perRound: results.map((r) =>
      `${r.winner}(${r.winPath || '?'}) 玩家${r.playerCount}:Boss${r.aiCount} 据点${r.playerHubs}:${r.aiHubs} 连击${r.playerCombo}:${r.aiCombo}`
    ),
    // CM4-R6：Strategy Activation Layer 聚合（active 模式）
    strategyActivation: DIRECTOR_ACTIVE ? (() => {
      const acc = (key) => {
        const items = results.map((r) => r.strategyActivation?.[key]).filter(Boolean);
        return {
          enabled: items[0]?.enabled ?? null,
          activations: items.reduce((a, r) => a + (r.activations || 0), 0),
          fallbacks: items.reduce((a, r) => a + (r.fallbacks || 0), 0),
          lastReason: items[0]?.lastReason ?? null,
          rounds: items.length,
        };
      };
      return { player: acc('player'), boss: acc('boss') };
    })() : null,
  };

  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();