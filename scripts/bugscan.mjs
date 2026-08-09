// ============================================================
// 全量剧本/关卡 Bug 扫描器（深度版）
// 覆盖：情绪字段 / 说话人登记 / 对话结构 / 教学文案重复 /
//       关卡引用断层 / Boss映射缺失 / 叙事定位 / 伏笔关键词定位
// 用法: node scripts/bugscan.mjs
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'levels');
const SCRIPT_PATH = path.join(ROOT, 'data', 'scripts', 'scripts.json');
const ENGINE_PATH = path.join(ROOT, 'story', 'story-engine.js');

// ---------- 从 story-engine.js 提取对象字面量 ----------
function extractObject(src, name) {
  const start = src.indexOf('const ' + name + ' = {');
  if (start < 0) return null;
  const i = src.indexOf('{', start);
  let depth = 0, inStr = false, esc = false, q = '';
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === q) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; q = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const engineSrc = fs.readFileSync(ENGINE_PATH, 'utf8');
function evalObj(name) {
  const s = extractObject(engineSrc, name);
  if (!s) return {};
  try { return eval('(' + s + ')'); } catch (e) { return {}; }
}
const EMOTION_ZH_MAP = evalObj('EMOTION_ZH_MAP');
const PORTRAIT_MAP = evalObj('PORTRAIT_MAP');
const CHAR_SIDE = evalObj('CHAR_SIDE');
const SPEAKER_ALIASES = evalObj('SPEAKER_ALIASES');

// 所有 PORTRAIT_MAP 使用的 english 立绘 key 集合
const PORTRAIT_KEYS = new Set();
Object.values(PORTRAIT_MAP).forEach(m => Object.keys(m).forEach(k => PORTRAIT_KEYS.add(k)));

const findings = [];
function add(loc, sev, type, msg, fix) {
  findings.push({ loc, sev, type, msg, fix: fix || '' });
}

// ---------- 1. scripts.json 全量对话校验 ----------
const scripts = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
const cycleCharSpeakers = {}; // charId -> Set(cycleId)

function resolveCharId(speaker) {
  if (!speaker) return null;
  const sp = String(speaker).trim();
  if (sp in SPEAKER_ALIASES) return SPEAKER_ALIASES[sp];
  // 部分匹配（处理「X CHIBI」「X（旧友）」等）
  for (const [alias, cid] of Object.entries(SPEAKER_ALIASES)) {
    if (sp.includes(alias) || alias.includes(sp)) return cid;
  }
  return null;
}

function checkDialog(arr, loc, cycleId, chapterId, levelId) {
  if (!Array.isArray(arr)) {
    if (arr !== undefined) add(loc, '中', '对话结构', '应为数组但实际为 ' + typeof arr);
    return;
  }
  arr.forEach((line, idx) => {
    const l = `${loc}[${idx}]`;
    if (typeof line === 'string') return; // 旁白纯文本
    if (!line || typeof line !== 'object') { add(l, '高', '对话结构', '对话条目不是对象'); return; }
    const sp = line.speaker ? String(line.speaker).trim() : '';
    if (!sp) add(l, '中', '参数缺失', '缺少 speaker');
    if (line.text === undefined || line.text === null || String(line.text).trim() === '') add(l, '中', '参数缺失', '缺少 text');
    const cid = resolveCharId(sp);
    const isNarration = cid === 'narrator' || cid === 'system';
    // emotion（旁白无立绘，跳过）
    if (line.emotion !== undefined && !isNarration) {
      const em = line.emotion;
      if (!(em in EMOTION_ZH_MAP)) {
        add(l, '低', '情绪字段', `emotion「${em}」不在 EMOTION_ZH_MAP，将静默回退默认立绘/语速`, `在 story-engine EMOTION_ZH_MAP 增加「${em}」映射`);
      }
    }
    // speaker 登记
    if (sp && !cid && !isNarration) add(l, '中', '叙事定位', `说话人「${sp}」未在 SPEAKER_ALIASES 登记，将按未命名/旁白渲染`, `在 SPEAKER_ALIASES 增加映射`);
    if (cid) {
      (cycleCharSpeakers[cid] = cycleCharSpeakers[cid] || new Set()).add(cycleId);
      if (!(cid in CHAR_SIDE) && !isNarration) add(l, '低', '叙事定位', `角色「${cid}」(来自「${sp}」) 未在 CHAR_SIDE 登记站位（当前回退 right）`, `在 CHAR_SIDE 增加 '${cid}':'right'`);
    }
  });
}

const referencedLevels = new Set();
scripts.cycles.forEach(cyc => {
  const cycleId = cyc.cycleId;
  (cyc.chapters || []).forEach(ch => {
    const chapterId = ch.chapterId;
    if (ch.prologue) checkDialog(ch.prologue, `cyc${cycleId}/ch${chapterId}.prologue`, cycleId, chapterId, null);
    if (ch.epilogue) checkDialog(ch.epilogue, `cyc${cycleId}/ch${chapterId}.epilogue`, cycleId, chapterId, null);
    (ch.levels || []).forEach(lv => {
      const levelId = lv.levelId;
      referencedLevels.add(levelId);
      const base = `cyc${cycleId}/ch${chapterId}/L${levelId}`;
      if (!lv.title) add(base, '低', '参数缺失', 'level 缺少 title');
      checkDialog(lv.preDialog, base + '.preDialog', cycleId, chapterId, levelId);
      checkDialog(lv.clearDialog, base + '.clearDialog', cycleId, chapterId, levelId);
    });
  });
});

// ---------- 2. 关卡文件存在性 / 引用断层 ----------
const levelFiles = new Set(fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => parseInt(f.replace('level-', '').replace('.json', ''), 10)));
const missingReferenced = [...referencedLevels].filter(id => !levelFiles.has(id)).sort((a, b) => a - b);
missingReferenced.forEach(id => add(`scripts.json→L${id}`, '高', '关卡逻辑断层', `剧本引用关卡 ${id} 但 data/levels/ 无对应 boardData 文件（叙事有、盘面无）`, `补建 level-${id}.json 或移除剧本引用`));

// Boss 映射期望存在
const BOSS_EXPECT = [109, 208, 307, 406, 506, 606, 706, 801];
BOSS_EXPECT.forEach(id => { if (!levelFiles.has(id)) add(`BOSS_MAP→L${id}`, '高', '关卡逻辑断层', `BOSS_LEVEL_MAP 含 ${id} 但 level-${id}.json 不存在`, `补建缺失 Boss 关 boardData`); });

// ---------- 3. 教学文案重复检测 ----------
const hintIndex = []; // {levelId, text}
function walkHints(obj, levelId, key) {
  if (Array.isArray(obj)) { obj.forEach((it, i) => walkHints(it, levelId, key + '[' + i + ']')); return; }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if ((k === 'hintText' || k === 'text' || k === 'failHint' || k === 'successText') && typeof obj[k] === 'string' && obj[k].trim()) {
        hintIndex.push({ levelId, key: key + '.' + k, text: obj[k].trim() });
      }
      walkHints(obj[k], levelId, key + '.' + k);
    }
  }
}
for (const f of fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort()) {
  const id = parseInt(f.replace('level-', '').replace('.json', ''), 10);
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
  walkHints(data, id, f);
}
// 精确重复（跨关同文案）
const norm = t => t.replace(/\s+/g, '');
const groups = {};
hintIndex.forEach(h => { const n = norm(h.text); (groups[n] = groups[n] || []).push(h); });
const dupGroups = Object.values(groups).filter(g => g.length > 1);
dupGroups.forEach(g => {
  const levels = [...new Set(g.map(x => x.levelId))];
  if (levels.length > 1) {
    add('教学文案', '中', '教学文案重复', `完全相同的提示文案跨 ${levels.length} 关重复: 「${g[0].text.slice(0, 30)}…」 出现于 L${levels.join('/L')}`, `改为每关定制化引导文案`);
  }
});
// 高频短语（>=3 关出现，疑似模板化）
const phraseHits = {};
const PHRASES = ['再用星衡法则找两个格子', '用同样的方法，再找出两个数字', '再找出两个数字', '用同样的方法，再', '继续用', '再用组合技巧找两个格子', '综合运用本章全部技巧', '再确定两个数字'];
hintIndex.forEach(h => {
  PHRASES.forEach(p => { if (h.text.includes(p)) { (phraseHits[p] = phraseHits[p] || new Set()).add(h.levelId); } });
});
Object.entries(phraseHits).forEach(([p, set]) => {
  if (set.size >= 3) add('教学文案', '低', '教学文案重复', `模板化短语「${p}」在 ${set.size} 关重复出现 (L${[...set].sort((a,b)=>a-b).join('/L')})`, `替换为具体数字/格子坐标引导`);
});

// ---------- 4. 叙事定位：苏晚仅一週目 ----------
if (cycleCharSpeakers['suwan']) {
  const cyc = [...cycleCharSpeakers['suwan']];
  if (cyc.some(c => c !== 1)) add('叙事', '高', '叙事定位冲突', `苏晚(suwan) 出现在非第一周目周期: ${cyc.join(',')}`, `确认二/三周目是否需要苏晚，否则收敛到 cyc1`);
}

// ---------- 5. 伏笔关键词定位（供人工研判时间线矛盾） ----------
const FOOKW = ['12月6日', '12月7日', '12月8日', '12月9日', '昨夜', '断电', '截断', '电源线', '发报', '702', '铁盒', '薇拉', '伊藤', '苏晚', '《战争与和平》', '窗台', '桥洞'];
const fookHits = [];
function scanText(node, path) {
  if (typeof node === 'string') {
    FOOKW.forEach(kw => { if (node.includes(kw)) fookHits.push({ kw, path, snippet: node.slice(0, 60) }); });
  } else if (Array.isArray(node)) node.forEach((n, i) => scanText(n, path + '[' + i + ']'));
  else if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => scanText(v, path + '.' + k));
}
scanText(scripts, 'scripts.json');
const fookByKw = {};
fookHits.forEach(h => (fookByKw[h.kw] = fookByKw[h.kw] || []).push(h));

// ---------- 输出 ----------
const sevOrder = { 高: 0, 中: 1, 低: 2 };
findings.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev] || a.type.localeCompare(b.type));
const summary = { 高: 0, 中: 0, 低: 0 };
findings.forEach(f => summary[f.sev]++);
const byType = {};
findings.forEach(f => byType[f.type] = (byType[f.type] || 0) + 1);

console.log('========== 深度扫描结果 ==========');
console.log('情绪表条目:', Object.keys(EMOTION_ZH_MAP).length, '| 立绘 key:', PORTRAIT_KEYS.size, '| 角色:', Object.keys(CHAR_SIDE).length);
console.log('引用关卡数:', referencedLevels.size, '| 实际关卡文件:', levelFiles.size);
console.log('发现总数:', findings.length, '| 高', summary.高, '中', summary.中, '低', summary.低);
console.log('按类型:', JSON.stringify(byType));
console.log('\n----- 高/中风险明细 -----');
findings.filter(f => f.sev !== '低').forEach(f => {
  console.log(`[${f.sev}] ${f.type} @ ${f.loc}\n    ${f.msg}\n    修复: ${f.fix}`);
});
console.log('\n----- 伏笔关键词命中(供研判) -----');
Object.entries(fookByKw).forEach(([kw, arr]) => {
  console.log(`「${kw}」命中 ${arr.length} 处，示例: ${arr.slice(0, 3).map(a => a.path + ':"' + a.snippet + '"').join(' | ')}`);
});

fs.writeFileSync(path.join(ROOT, 'scripts', 'bugscan-output.json'), JSON.stringify({
  summary, byType,
  findings, fookByKw,
  missingReferenced, levelFileCount: levelFiles.size, referencedCount: referencedLevels.size,
}, null, 2), 'utf8');
console.log('\n详细 JSON: scripts/bugscan-output.json');
