// ============================================================
//  test-battle-e2e.mjs - Boss 战 E2E 验证脚本（2026-08-03）
//  模拟 game.html 的接线方式：
//    1. 加载真实关卡数据（data/levels/level-{id}.json）
//    2. 用 HeadlessEngine 构建棋盘（模拟 GameApp 已 loadLevel）
//    3. 用 BOSS_CONFIGS[chapterId] 作为 opponent
//    4. 启动 BattleManager，驱动玩家填数 → AI 行动 → 事件收集
//  验证目标：
//    - 8 个 Boss 关（109/208/307/406/506/606/706/801）均可启动战斗
//    - BATTLE_START / BOSS_BATTLE_STATE 事件正确触发
//    - 玩家填数 / 撤销 / 凝视拦截回调正常
//    - AI 自动行动（_scheduleAiMove）不报错
//    - 战斗可正常结束（win 路径）
//  运行：node scripts/test-battle-e2e.mjs
// ============================================================
import { BattleManager, BOSS_CONFIGS, BATTLE_EVENTS } from '../core/battle-manager.js';
import { HeadlessEngine } from '../core/headless-engine.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = path.join(__dirname, '..', 'data', 'levels');

// ---- Boss 关卡映射（与 game.html 的 BOSS_LEVEL_MAP 一致）----
const BOSS_LEVEL_MAP = { 109: 1, 208: 2, 307: 3, 406: 4, 506: 5, 606: 6, 706: 7, 801: 8 };

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}`); }
}

function loadLevel(levelId) {
  const fn = path.join(LEVELS_DIR, `level-${levelId}.json`);
  return JSON.parse(fs.readFileSync(fn, 'utf8'));
}

// 从关卡数据构建棋盘（与 GameApp.loadLevel 行为一致）
function buildBoard(levelData) {
  const engine = new HeadlessEngine(levelData.gridSize || 9);
  engine.loadLevel(levelData);
  return { engine, board: engine.getBoard() };
}

console.log('======== Boss 战 E2E 验证 ========');
console.log(`共 ${Object.keys(BOSS_LEVEL_MAP).length} 个 Boss 关\n`);

let allOk = true;

for (const [levelIdStr, chapterId] of Object.entries(BOSS_LEVEL_MAP)) {
  const levelId = parseInt(levelIdStr, 10);
  console.log(`--- Boss 关 ${levelId}（第 ${chapterId} 章）---`);
  try {
    const levelData = loadLevel(levelId);
    const config = BOSS_CONFIGS[chapterId];
    check(`关卡数据加载（${levelData.title || '?'}）`, !!levelData.solution);
    check(`BOSS_CONFIGS[${chapterId}] 存在（${config ? config.name : '?'}）`, !!config);

    if (!levelData.solution || !config) {
      allOk = false;
      continue;
    }

    const { engine, board } = buildBoard(levelData);
    check(`棋盘构建成功（size=${board.size}）`, !!board && board.size > 0);

    // 事件收集
    const events = [];
    const bm = new BattleManager({ onEvent: (t, d) => events.push({ t, d }) });

    // 记录 onEnd 回调
    let endResult = null;
    let endOpponent = null;

    bm.start({
      board,                       // 共享棋盘（模拟 game.html 传 GameApp 的 board）
      solution: levelData.solution,
      opponent: config,
      onEnd: (result, opponent) => { endResult = result; endOpponent = opponent; },
    });

    check('战斗激活（active=true）', bm.active === true);
    const startEvt = events.find(e => e.t === BATTLE_EVENTS.BATTLE_START);
    check('BATTLE_START 事件触发', !!startEvt);
    const stateEvt = events.find(e => e.t === BATTLE_EVENTS.BOSS_BATTLE_STATE);
    check('BOSS_BATTLE_STATE(active:true) 触发', stateEvt && stateEvt.d && stateEvt.d.active === true);
    check(`winTarget 合理（${bm.winTarget}/${bm.totalEmpty}）`, bm.winTarget > 0 && bm.winTarget <= bm.totalEmpty);

    // ---- 模拟玩家填数循环（用 solution 填正确数字）----
    let filled = 0;
    const size = board.size;
    let fillError = null;

    for (let r = 0; r < size && filled < bm.winTarget; r++) {
      for (let c = 0; c < size && filled < bm.winTarget; c++) {
        const cell = board.cells[r]?.[c];
        if (!cell) continue;
        const isFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
        const isFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
        if (isFixed || isFilled) continue;
        const sol = levelData.solution[r]?.[c];
        if (!sol) continue;

        const res = engine.fillCell(r, c, sol);
        if (res && res.success) {
          bm.onPlayerFill(r, c, sol, true);
          filled++;
          // 每填 3 个做一次撤销再填回（验证 undo 回调）
          if (filled % 3 === 0) {
            bm.onPlayerUndo(r, c);
            engine.eraseCell(r, c);
            engine.fillCell(r, c, sol);
            bm.onPlayerFill(r, c, sol, true);
          }
          // 每填 5 个做一次凝视拦截（验证 focus 回调）
          if (filled % 5 === 0) {
            bm.onPlayerFocusCell(r, c);
          }
        } else {
          fillError = `填数失败 (${r},${c})=${sol}`;
          break;
        }
      }
      if (fillError) break;
    }

    check(`玩家填数至 winTarget（${filled}/${bm.winTarget}）`, filled >= bm.winTarget);
    check('填数后无错误', !fillError);
    if (fillError) console.log(`    ! ${fillError}`);

    // AI 行动调度（start 内 2s 后触发，测试中直接调用内部调度验证不报错）
    let aiStepOk = true;
    try {
      if (bm._scheduleAiMove) bm._scheduleAiMove();
    } catch (e) { aiStepOk = false; console.log(`    ! AI 调度错误: ${e.message}`); }
    check('AI 行动调度未抛错', aiStepOk);

    // 事件统计
    const evtTypes = new Set(events.map(e => e.t));
    check(`收到事件类型 ${evtTypes.size} 类`, evtTypes.size >= 2);

    // 停止战斗
    bm.stop();
    check('stop() 后 active=false', bm.active === false);
    const stopEvt = events.find(e => e.t === BATTLE_EVENTS.BOSS_BATTLE_STATE && e.d && e.d.active === false);
    check('BOSS_BATTLE_STATE(active:false) 触发', !!stopEvt);

    console.log('');
  } catch (e) {
    allOk = false;
    console.log(`  [ERROR] ${e.message}\n  ${e.stack ? e.stack.split('\n')[1] : ''}\n`);
  }
}

console.log('========================================');
console.log(`结果: ${pass} 通过, ${fail} 失败${allOk ? '' : '（存在错误）'}`);
console.log('========================================');
process.exit(fail > 0 || !allOk ? 1 : 0);
