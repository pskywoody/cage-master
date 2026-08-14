// ============================================================
//  test-r7-content-pipeline.mjs - CM4-R7 Boss 内容生产层验证
// ============================================================
//  验证：
//    A. 内容包完整性（3 主力 Boss + 通用兜底）
//       - 每个 Boss 有 4 阶段 / 事件 / 4 策略 / 3 反馈
//       - 每行台词含 key + zh + ja + en（多语言格式）
//       - getBossPack 已知回正确包、未知回通用包
//    B. 台词选择器（selectBossLine）
//       - 阶段台词按语言取对应文本
//       - 语言缺失回退 zh-CN
//       - 游标 round-robin 去重
//       - 未知事件 → null
//    C. 控制器接入（Boss 台词气泡）
//       - 阶段切换发台词
//       - 策略切换发台词
//       - 污染事件发台词
//  用法：node scripts/test-r7-content-pipeline.mjs
// ============================================================
import { BOSS_PACKS, DEFAULT_BOSS_PACK, getBossPack } from '../content/boss-content.js';
import { selectBossLine, pickLine } from '../core/boss-line-selector.js';
import { TplBattleController } from '../core/tpl-battle-controller.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const PHASES = ['opening', 'development', 'crisis', 'climax'];
const STRATS = ['attack', 'defend', 'global', 'counter'];
const EVENTS = ['pollution', 'line_win', 'line_steal', 'pressure_incoming'];
const FEEDBACK = ['playerWin', 'playerLose', 'draw'];

// ---------- A. 内容包完整性 ----------
console.log('A) 内容包完整性');
const named = ['yingying', 'yan', 'shenmo'];
for (const id of named) {
  const pack = BOSS_PACKS[id];
  assert(`${id}: 存在`, !!pack);
  if (!pack) continue;
  assert(`${id}: 4 阶段台词池`, PHASES.every(p => Array.isArray(pack.phaseLines[p]) && pack.phaseLines[p].length > 0));
  assert(`${id}: 事件池齐全`, EVENTS.every(e => Array.isArray(pack.eventLines[e]) && pack.eventLines[e].length > 0));
  assert(`${id}: 4 策略台词`, STRATS.every(s => pack.strategyLines[s] && pack.strategyLines[s].zh));
  assert(`${id}: 3 反馈`, FEEDBACK.every(f => Array.isArray(pack.feedback[f]) && pack.feedback[f].length > 0));
}
// 每行多语言 + key
let keyOk = true, langOk = true;
for (const id of named) {
  const pack = BOSS_PACKS[id];
  const all = [
    ...pack.phaseLines.opening, ...pack.phaseLines.development,
    ...pack.phaseLines.crisis, ...pack.phaseLines.climax,
    ...pack.eventLines.pollution, ...Object.values(pack.strategyLines),
    ...pack.feedback.playerWin, ...pack.feedback.playerLose, ...pack.feedback.draw,
  ];
  for (const line of all) {
    if (!line.key || !/^boss\./.test(line.key)) keyOk = false;
    if (!line.zh || !line.ja || !line.en) langOk = false;
  }
}
assert('所有台词含规范 key', keyOk);
assert('所有台词含 zh/ja/en 三语', langOk);

// 兜底包
assert('getBossPack(shenmo) 返回沈墨', getBossPack('shenmo').id === 'shenmo');
assert('getBossPack(未知) 返回通用包', getBossPack('nonexistent').id === 'default');
assert('通用包存在', DEFAULT_BOSS_PACK && DEFAULT_BOSS_PACK.phaseLines.opening.length > 0);

// ---------- B. 台词选择器 ----------
console.log('B) 台词选择器');
const shenmo = getBossPack('shenmo');
const zhPhase = selectBossLine({ pack: shenmo, event: 'phase', phase: 'opening', locale: 'zh-CN' });
assert('沈墨 opening 中文台词', zhPhase && zhPhase.text === '左边很安全，对吗？', `actual=${zhPhase && zhPhase.text}`);
const enPhase = selectBossLine({ pack: shenmo, event: 'phase', phase: 'opening', locale: 'en-US' });
assert('沈墨 opening 英文台词', enPhase && enPhase.text === 'The left is safe. Isn’t it?', `actual=${enPhase && enPhase.text}`);
const jaPhase = selectBossLine({ pack: shenmo, event: 'phase', phase: 'opening', locale: 'ja-JP' });
assert('沈墨 opening 日文台词', jaPhase && jaPhase.text === '左は安全だと思っている？', `actual=${jaPhase && jaPhase.text}`);

// 语言缺失回退 zh
assert('缺失语言回退 zh', pickLine([{ key: 't', zh: '中文', ja: '日本語' }], { locale: 'en-US' }).text === '中文');

// 游标 round-robin 去重
const pool = [
  { key: 'a', zh: 'A' }, { key: 'b', zh: 'B' }, { key: 'c', zh: 'C' },
];
const p0 = pickLine(pool, { cursor: 0 });
const p1 = pickLine(pool, { cursor: p0.next });
const p2 = pickLine(pool, { cursor: p1.next });
assert('游标轮转 A→B→C', p0.key === 'a' && p1.key === 'b' && p2.key === 'c');

// 策略事件
const atk = selectBossLine({ pack: shenmo, event: 'strategy', strategy: 'attack', locale: 'zh-CN' });
assert('策略台词', atk && atk.text === '这个据点，我收下了。', `actual=${atk && atk.text}`);

// 未知事件
assert('未知事件 → null', selectBossLine({ pack: shenmo, event: 'nope', locale: 'zh-CN' }) === null);

// ---------- C. 控制器接入 ----------
console.log('C) 控制器接入');
const bubbles = [];
const ctrl = new TplBattleController({ onEvent: () => {}, directorShadow: true });
const origOnEvent = ctrl._onEvent;
ctrl._onEvent = (t, d) => { if (t === 'tpl_boss_bubble') bubbles.push(d); origOnEvent(t, d); };
ctrl._bossPack = getBossPack('shenmo');
ctrl._lineLocale = 'zh-CN';
ctrl._lineCursors = {};
ctrl._opponent = { id: 'shenmo', name: '沈墨' };

// 阶段切换
ctrl._context = { drama: { phase: 'crisis' } };
ctrl._checkPhaseChange();
assert('阶段切换发频台台词', bubbles.length === 1 && bubbles[0].text === '中央空出来了。', `actual=${bubbles[0] && bubbles[0].text}`);
const afterPhase1 = bubbles.length;
ctrl._checkPhaseChange();
assert('同阶段不重复发', bubbles.length === afterPhase1);
ctrl._context.drama.phase = 'climax';
ctrl._checkPhaseChange();
assert('阶段升级发新台词', bubbles.length === afterPhase1 + 1 && ['最后一步，你确定吗？', '尘埃落定之前，一切都未可知。'].includes(bubbles[afterPhase1].text), `actual=${bubbles[afterPhase1] && bubbles[afterPhase1].text}`);

// 策略切换
const sB = bubbles.length;
ctrl._ai = { getStrategy: () => ({ strategy: 'attack', label: '进攻', targetHub: 0 }) };
ctrl._lastStrategy = null;
ctrl._checkStrategyChange();
assert('策略切换发台词', bubbles.length === sB + 1 && bubbles[sB].text === '这个据点，我收下了。', `actual=${bubbles[sB] && bubbles[sB].text}`);

// 污染事件（复用 R7 stub 驱动）
const pB = bubbles.length;
const conflictCtx = {
  tpl: {
    hubs: [
      { playerDims: 3, bossDims: 2, visible: true },
      { playerDims: 0, bossDims: 0, visible: true },
      { playerDims: 0, bossDims: 0, visible: true },
    ],
    hubBlocks: [0, 4, 8],
    castleHubIdx: 1,
  },
  drama: { phase: 'crisis' },
};
const size = 9; const cells = [];
for (let r = 0; r < size; r++) { const row = []; for (let c = 0; c < size; c++) row.push({}); cells.push(row); }
ctrl._board = { size, cells };
ctrl._tpl = { getHubBlocks: () => [0, 4, 8] };
ctrl.getContext = () => conflictCtx;
const { DramaEventManager } = (await import('../core/drama-event-manager.js'));
const { PollutionGhostDriver } = (await import('../core/drama-pollution.js'));
const dm = new DramaEventManager({ addGhost: () => {}, removeGhost: () => {}, onEvent: () => {}, cooldown: 0, maxGhosts: 5 });
dm.setEnabled(true);
ctrl._drama = dm;
ctrl._pollutionDriver = new PollutionGhostDriver({ minStage: 2, minTurns: 3 });
ctrl._drivePollutionGhost(); ctrl._drivePollutionGhost(); ctrl._drivePollutionGhost();
assert('污染只发一次台词（3 步累计后）', bubbles.length === pB + 1, `actual=${bubbles.length - pB}`);
if (bubbles[pB]) assert('污染台词为沈墨', bubbles[pB].text === '污染侵蚀了那个据点。你能守住吗？', `actual=${bubbles[pB].text}`);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);