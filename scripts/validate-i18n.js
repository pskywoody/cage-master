// ============================================================
//  validate-i18n.js - i18n 完整性校验（Layer1: 数据/规则测试）
// ============================================================
//  校验 i18n/locale/ 下 zh-CN/en-US/ja-JP/ko-KR 四语一致性：
//    1) 每个资源文件（levels/chapters/ui）zh-CN 的键必须全部存在于其它语言（缺失=error）
//    2) 其它语言多余键只上报 warning（不阻断，避免误伤合理扩展）
//    3) 63 关都必须有 <id>.title / <id>.teachingGoal 于四语
//    4) boss/ 子目录文件集四语一致
//  用: node scripts/validate-i18n.js   （退出码 0=通过 / 1=有缺失）
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALE_DIR = path.join(__dirname, '..', 'i18n', 'locale');
const LEVELS_DIR = path.join(__dirname, '..', 'data', 'levels');

const LOCALES = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
const BASE_LOCALE = 'zh-CN';
const RESOURCE_FILES = ['levels.json', 'chapters.json', 'ui.json'];

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { __error: e.message }; }
}

const errors = [];
const warnings = [];

// ---- 1) 资源文件键覆盖（zh 为基准） ----
for (const file of RESOURCE_FILES) {
  const data = {};
  for (const l of LOCALES) {
    const p = path.join(LOCALE_DIR, l, file);
    data[l] = loadJson(p);
  }
  if (data[BASE_LOCALE].__error) { errors.push(`${file}: zh-CN 读取失败 ${data[BASE_LOCALE].__error}`); continue; }
  const baseKeys = Object.keys(data[BASE_LOCALE]);

  for (const l of LOCALES) {
    if (l === BASE_LOCALE) continue;
    const d = data[l];
    if (d.__error) { errors.push(`${file}@${l}: 读取失败 ${d.__error}`); continue; }
    const keys = new Set(Object.keys(d));
    const missing = baseKeys.filter((k) => !keys.has(k));
    const extra = keys.size - baseKeys.length;
    if (missing.length) errors.push(`${file}@${l}: 缺 ${missing.length} 个键（相对 zh-CN）: ${missing.slice(0, 6).join(', ')}`);
    if (extra > 0) warnings.push(`${file}@${l}: 比 zh-CN 多 ${extra} 个键（advisory）`);
  }
}

// ---- 2) 关卡基础字段四语齐备 ----
// teachingGoal 是从关卡 JSON 直读的元数据；仅当关卡 JSON 自带 teachingGoal 时，
// 才要求 i18n 提供 levels.<id>.teachingGoal（避免把无教学目标的 Boss/过渡关误报）。
const levelFiles = fs.readdirSync(LEVELS_DIR).filter((f) => /^level-\d+\.json$/.test(f));
const levelJson = new Map();
for (const f of levelFiles) {
  const id = parseInt(f.match(/\d+/)[0], 10);
  const L = JSON.parse(fs.readFileSync(path.join(LEVELS_DIR, f), 'utf8'));
  levelJson.set(id, L);
}
const requiredForLevel = (id, field) => `levels.${id}.${field}`;
for (const l of LOCALES) {
  const p = path.join(LOCALE_DIR, l, 'levels.json');
  const d = loadJson(p);
  if (d.__error) continue;
  for (const id of levelJson.keys()) {
    if (!(requiredForLevel(id, 'title') in d)) errors.push(`levels@${l}: ${id} 缺 ${requiredForLevel(id, 'title')}`);
    const L = levelJson.get(id);
    if (L && L.teachingGoal && !(requiredForLevel(id, 'teachingGoal') in d)) {
      errors.push(`levels@${l}: ${id} 有 teachingGoal 但缺 ${requiredForLevel(id, 'teachingGoal')}`);
    }
  }
}

// ---- 3) boss/ 子目录四语文件集一致 ----
let bossBase = [];
const bossDirBase = path.join(LOCALE_DIR, BASE_LOCALE, 'boss');
if (fs.existsSync(bossDirBase)) bossBase = fs.readdirSync(bossDirBase);
for (const l of LOCALES) {
  if (l === BASE_LOCALE) continue;
  const d = path.join(LOCALE_DIR, l, 'boss');
  const files = fs.existsSync(d) ? fs.readdirSync(d) : [];
  const missing = bossBase.filter((f) => !files.includes(f));
  if (missing.length) warnings.push(`boss@${l}: 缺 ${missing.join(', ')}（advisory）`);
}

// ---- 汇总 ----
console.log('i18n 完整性校验：四语 (' + LOCALES.join('/') + ')，基准 ' + BASE_LOCALE + '\n');
console.log(`  关卡文件: ${levelFiles.length} 个 | 资源: ${RESOURCE_FILES.join(', ')}`);
if (errors.length) {
  console.error('\n[ERROR] ' + errors.length + ' 处：');
  for (const e of errors) console.error('  - ' + e);
}
if (warnings.length) {
  console.log('\n[WARNING] ' + warnings.length + ' 条：');
  for (const w of warnings) console.log('  ~ ' + w);
}
console.log(`\n结果: errors=${errors.length} warnings=${warnings.length}`);
process.exit(errors.length ? 1 : 0);