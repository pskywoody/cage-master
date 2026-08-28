// ============================================================
//  validate-references.js - 引用完整性校验（Layer1: 数据/规则测试）
// ============================================================
//  校验 63 关的跨层引用，聚焦 validate-levels / validate-chapter-arc
//  均未覆盖的语义一致性：
//    1) lessonPlan.technique ∈ 合法技巧集（techniqueAliases ∪ specialTechniques）
//    2) lessonPlan.newSkill ∈ newSkillTechniques（存在性）
//    3) newSkill ∈ 映射到 technique（口径一致）
//    4) guided.targetCell 必须是给定空格（boardData==0）且 correctValue==solution
//    5) 关卡 teaching technique 必须属于其章节 expectedTechniques ∪ specialTechniques
//    6) 章节 bossLevel 对应的关卡文件必须存在
//  用: node scripts/validate-references.js （退出码 0=通过 / 1=有 error）
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LEVELS_DIR = path.join(ROOT, 'data', 'levels');
const ARC_PATH = path.join(ROOT, 'config', 'chapter-arc.json');
const CONTENT_DIR = path.join(ROOT, 'content');

const arc = JSON.parse(fs.readFileSync(ARC_PATH, 'utf8'));
const validTech = new Set([
  ...Object.keys(arc.techniqueAliases || {}),
  ...Object.keys(arc.specialTechniques || {}),
]);
const newSkillMap = arc.newSkillTechniques || {};
const specialTech = new Set(Object.keys(arc.specialTechniques || {}));

const errors = [];
const warnings = [];

function chapterOf(levelId) { return Math.floor(levelId / 100); }

const levelFiles = fs.readdirSync(LEVELS_DIR).filter((f) => /^level-\d+\.json$/.test(f));
for (const f of levelFiles) {
  const L = JSON.parse(fs.readFileSync(path.join(LEVELS_DIR, f), 'utf8'));
  const id = L.levelId;
  const tag = `level-${id}`;
  if (L.puzzleType === 'traitor_hunt_6x6') continue; // 非数独，无 lessonPlan

  const lp = L.lessonPlan || {};
  const t = lp.technique;
  const ns = lp.newSkill;
  const phases = lp.phases || {};

  // 1) technique 合法性
  if (t != null && !validTech.has(t)) {
    errors.push(`[${tag}] lessonPlan.technique「${t}」不在合法技巧集 {${[...validTech].join(',')}} 内`);
  }

  // 2) newSkill 存在性
  if (ns != null && !(ns in newSkillMap)) {
    errors.push(`[${tag}] lessonPlan.newSkill「${ns}」未在 chapter-arc.newSkillTechniques 中登记`);
  }

  // 3) newSkill ↔ technique 口径一致
  if (ns != null && ns in newSkillMap && t != null) {
    const declared = newSkillMap[ns];
    if (declared !== t) {
      errors.push(`[${tag}] newSkill「${ns}」声明映射为 ${declared}，但 lessonPlan.technique 是 ${t}（不一致）`);
    }
  }

  // 4) guided.targetCell 语义
  const g = phases.guided;
  if (g && Array.isArray(g.targetCell) && g.interactionType !== 'WHAT_IF_ENTRY') {
    const [r, c] = g.targetCell;
    const givens = (L.boardData || [])[r] && (L.boardData[r][c]);
    if (givens !== 0) {
      errors.push(`[${tag}] guided.targetCell (${r},${c}) 不是空格（boardData=${givens}），引导应指向待填格`);
    }
    const sol = (L.solution || [])[r] && (L.solution[r][c]);
    if (g.correctValue != null && sol !== g.correctValue) {
      errors.push(`[${tag}] guided.correctValue(${g.correctValue}) !== solution[${r}][${c}](${sol})`);
    }
  }

  // 5) 关卡 technique ∈ 章节预期 ∪ 特殊技巧
  //    仅对"无已注册 newSkill"的关卡做归属校验——有注册 newSkill 的关卡其技巧
  //    已被 newSkillTechniques 权威映射背书（如 108 用 rule_of_ten 教 rule45、401 用 note_system_401 教 nakedSingle，
  //    均属章节内合法复习/铺垫），避免误报。
  const chapter = (arc.chapters || []).find((ch) => ch.chapterId === chapterOf(id));
  if (t != null && chapter && !(ns != null && ns in newSkillMap)) {
    const allowed = new Set([...chapter.expectedTechniques, ...specialTech]);
    if (!allowed.has(t)) {
      errors.push(`[${tag}] 关卡无注册 newSkill，却教学的技巧「${t}」不在第${chapter.chapterId}章预期 {${[...allowed].join(',')}} 内`);
    }
  }
}

// 6) 章节 bossLevel 文件存在性
for (const chapter of arc.chapters || []) {
  if (!chapter.bossLevel) continue;
  const p = path.join(LEVELS_DIR, `level-${chapter.bossLevel}.json`);
  if (!fs.existsSync(p)) {
    errors.push(`第${chapter.chapterId}章 bossLevel=${chapter.bossLevel} 对应的关卡文件缺失`);
  }
}
if (!fs.existsSync(path.join(CONTENT_DIR, 'boss-content.js'))) {
  errors.push('content/boss-content.js 缺失（Boss 内容包引用）');
}

console.log('引用完整性校验（技巧 / newSkill / guided 语义 / 章节契约 / Boss 内容包）\n');
console.log(`  level 文件: ${levelFiles.length} | 合法技巧集: ${validTech.size} 个`);
console.log(`  newSkillTechniques: ${Object.keys(newSkillMap).length} 个 | chapters: ${(arc.chapters || []).length} 章\n`);
if (errors.length) {
  console.error('[ERROR] ' + errors.length + ' 处：');
  for (const e of errors) console.error('  - ' + e);
}
if (warnings.length) {
  console.log('[WARNING] ' + warnings.length + ' 条：');
  for (const w of warnings) console.log('  ~ ' + w);
}
console.log(`\n结果: errors=${errors.length} warnings=${warnings.length}`);
process.exit(errors.length ? 1 : 0);