// ==========================================
// 章节 → 技巧 → 叙事钩子 弧线校验脚本
// ==========================================
// 依据 config/chapter-arc.json 的权威契约，
// 校验 data/levels/*.json 的关卡序列是否满足：
//   1) 每章预期技巧在 teachingGoal 中被覆盖（缺失 = error）
//   2) 和值法则文案与盘面尺寸一致（10→4 / 21→6 / 45→9，不一致 = error）
//   3) 每章关卡尺寸序列符合预期（不符 = warning，供人工复核）
//   4) 带教学目标的关卡应有 preDialog/clearDialog 叙事钩子（缺失 = warning）
//   5) 章末 Boss 关应带 isBoss 标记（缺失 = warning）
//
// 使用: node scripts/validate-chapter-arc.js
// 退出码: 0 = 无 error；1 = 存在 error（可作为 CI 回归门槛）
// ==========================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LEVEL_DIR = path.join(ROOT, 'data', 'levels');
const ARC_PATH = path.join(ROOT, 'config', 'chapter-arc.json');

const arc = JSON.parse(fs.readFileSync(ARC_PATH, 'utf8'));

// 剧本数据（data/scripts/scripts.json）是进关/过关对话的权威来源，
// 关卡 JSON 的 preDialog/clearDialog 仅在其缺失时作为回退。
// 叙事钩子校验需两处皆缺才算缺失，避免把"仅剧本提供对话"的关卡误报。
const SCRIPT_PATH = path.join(ROOT, 'data', 'scripts', 'scripts.json');
const scriptHooks = { pre: new Set(), clear: new Set() };
if (fs.existsSync(SCRIPT_PATH)) {
  const scripts = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
  for (const cycle of scripts.cycles || []) {
    for (const chapter of cycle.chapters || []) {
      for (const level of chapter.levels || []) {
        const id = level.levelId;
        if (id === undefined || id === null) continue;
        if (Array.isArray(level.preDialog) && level.preDialog.length > 0) scriptHooks.pre.add(id);
        if (Array.isArray(level.clearDialog) && level.clearDialog.length > 0) scriptHooks.clear.add(id);
      }
    }
  }
}

// 关卡 ID → 所属章节（101 → 1，209 → 2）
function chapterOf(levelId) {
  return Math.floor(levelId / 100);
}

function loadLevels() {
  const levels = {};
  const files = fs.readdirSync(LEVEL_DIR).filter((f) => /^level-\d+\.json$/.test(f));
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(LEVEL_DIR, file), 'utf8'));
    levels[data.levelId] = data;
  }
  return levels;
}

function hasAny(text, keywords) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function techniqueCovered(level, techId) {
  const aliases = arc.techniqueAliases[techId] || [];
  if (!aliases.length) return false;
  // 教学目标或章节注释合并检测，覆盖 308/309 这类无 teachingGoal 但可能写在标题的情况
  const text = [level.teachingGoal, level.title].filter(Boolean).join(' ');
  return hasAny(text, aliases);
}

const levels = loadLevels();
const errors = [];
const warnings = [];

for (const chapter of arc.chapters) {
  const ids = Array.from({ length: 9 }, (_, i) => chapter.chapterId * 100 + (i + 1));
  const chLevels = ids.map((id) => ({ id, level: levels[id] }));

  if (chLevels.some((x) => !x.level)) {
    errors.push(`第${chapter.chapterId}章：存在缺失关卡文件`);
    continue;
  }

  // 1) 预期尺寸序列
  ids.forEach((id, i) => {
    const level = levels[id];
    const expected = chapter.expectedSizes[i];
    if (level.gridSize !== expected) {
      warnings.push(
        `[第${chapter.chapterId}章 ${id}] 尺寸为 ${level.gridSize}，预期 ${expected}（章节尺寸契约：${chapter.expectedSizes.join(',')}）`
      );
    }
  });

  // 2) 预期技巧覆盖
  for (const techId of chapter.expectedTechniques) {
    const covered = ids.some((id) => techniqueCovered(levels[id], techId));
    if (!covered) {
      errors.push(`[第${chapter.chapterId}章] 预期技巧「${techId}」在 teachingGoal/标题中未找到任何别名命中`);
    }
  }

  // 3) 和值法则文案与尺寸一致性（全局检查，不限于本章预期技巧）
  //    2026-08-28 扩展：除 teachingGoal/标题外，同时扫描 preDialog/clearDialog/triggers 的文本，
  //    防止「十则/10法则」等 4×4 口径残留出现在 6×6/9×9 关卡的剧情与提示里（109 类回归）。
  for (const id of ids) {
    const level = levels[id];
    const texts = [
      level.teachingGoal || '',
      level.title || '',
      ...((Array.isArray(level.preDialog) && level.preDialog) || []).map((d) => d && d.text || ''),
      ...((Array.isArray(level.clearDialog) && level.clearDialog) || []).map((d) => d && d.text || ''),
      ...((Array.isArray(level.triggers) && level.triggers) || []).map((t) => t && t.text || ''),
    ].filter(Boolean);
    for (const rule of arc.sumLawSizeRules) {
      if (texts.some((txt) => hasAny(txt, [rule.keyword])) && level.gridSize !== rule.gridSize) {
        errors.push(
          `[第${chapter.chapterId}章 ${id}] 剧情/提示/教学目标含「${rule.keyword}」但盘面为 ${level.gridSize}×${level.gridSize}，预期应为 ${rule.gridSize}×${rule.gridSize}`
        );
      }
    }
  }

  // 4) 带教学目标的关卡应有叙事钩子（preDialog + clearDialog）
  //    剧本数据（scripts.json）为权威来源，关卡 JSON 仅作回退；两处皆缺才算缺失。
  for (const { id, level } of chLevels) {
    if (level.teachingGoal && level.teachingGoal.trim()) {
      const pre = (Array.isArray(level.preDialog) && level.preDialog.length > 0) || scriptHooks.pre.has(id);
      const clear = (Array.isArray(level.clearDialog) && level.clearDialog.length > 0) || scriptHooks.clear.has(id);
      if (!pre || !clear) {
        warnings.push(`[第${chapter.chapterId}章 ${id}] 教学关缺少 ${!pre ? 'preDialog' : 'clearDialog'} 叙事钩子（关卡 JSON 与剧本数据均无）`);
      }
    }
  }

  // 5) 章末 Boss 标记
  const boss = levels[chapter.bossLevel];
  if (boss && !boss.isBoss) {
    warnings.push(`[第${chapter.chapterId}章 ${chapter.bossLevel}] 契约标注为 Boss 关，但缺少 isBoss 标记`);
  }
}

// 6) lessonPlan 质量门：有 teachingGoal 且有 lessonPlan 的关卡，
//    guided 阶段必须有 methodText（原理讲解）或 hintText（提示）其一，
//    否则属于"答案直给、教学闭环弱"的弱引导关。
for (const [id, level] of Object.entries(levels)) {
  const goal = level.teachingGoal && level.teachingGoal.trim();
  const lp = level.lessonPlan;
  if (!goal || !lp || !lp.phases) continue;
  const guided = lp.phases.guided;
  if (!guided) continue;
  const hasGuideText = !!(guided.methodText || guided.hintText);
  if (!hasGuideText) {
    warnings.push(`[第${chapterOf(id)}章 ${id}] lessonPlan 教学关 guided 缺 methodText/hintText 原理讲解（教学闭环弱）`);
  }
}

// 7) lessonPlan 技巧绑定门：有 teachingGoal 且有 lessonPlan 的关卡，
//    必须能从 lessonPlan.technique 或 newSkillTechniques 契约归一化到一个技巧 id。
//    合法技巧 = 核心技巧别名 + specialTechniques（综合应用/假设模式等特殊机制）。
const validTechIds = new Set([
  ...Object.keys(arc.techniqueAliases || {}),
  ...Object.keys(arc.specialTechniques || {}),
]);
for (const [id, level] of Object.entries(levels)) {
  const goal = level.teachingGoal && level.teachingGoal.trim();
  const lp = level.lessonPlan;
  if (!goal || !lp) continue;
  const direct = lp.technique;
  const viaNewSkill = arc.newSkillTechniques && (lp.newSkill ? arc.newSkillTechniques[lp.newSkill] : null);
  const viaSkillName = arc.newSkillTechniques && (lp.skillName ? arc.newSkillTechniques[lp.skillName] : null);
  const bound = direct || viaNewSkill || viaSkillName;
  if (!bound) {
    warnings.push(`[第${chapterOf(id)}章 ${id}] lessonPlan 未绑定技巧（缺 technique 且 newSkill「${lp.newSkill || lp.skillName || '?'}」无契约）`);
  } else if (!validTechIds.has(bound)) {
    warnings.push(`[第${chapterOf(id)}章 ${id}] lessonPlan 绑定的技巧「${bound}」不在 TECHNIQUES 契约中`);
  }
}

// 8) 显式 technique 与契约基线漂移门（阶段 4）：
//    一旦关卡物化了 lessonPlan.technique，它必须与 newSkillTechniques 契约一致，
//    防止后续手改关卡时 teachingGoal 与 technique 悄悄脱节。
for (const [id, level] of Object.entries(levels)) {
  const lp = level.lessonPlan;
  if (!lp || !lp.newSkill && !lp.skillName) continue;
  const contract = arc.newSkillTechniques && (arc.newSkillTechniques[lp.newSkill] || arc.newSkillTechniques[lp.skillName]);
  if (!contract || !lp.technique) continue;
  if (lp.technique !== contract) {
    warnings.push(`[第${chapterOf(id)}章 ${id}] lessonPlan.technique「${lp.technique}」与契约「${contract}」不一致`);
  }
}

// 9) guided 三层语义门：方向/技巧/答案应分离。
//    methodText 是技巧层，不应出现"直接填入"这类揭示指令；
//    hintText 是方向层，不应直接给出答案数字（NUMBER 交互时对照 correctValue）。
const revealCommandRe = /直接填入|自动填入|正确答案是|答案是|直接填|只能填|填入数字/;
function hintRevealsAnswer(text, value) {
  if (!text || value === null || value === undefined) return false;
  const v = String(value);
  // 只匹配"明确揭示答案"的措辞，避免把"候选只剩 3 和 9""不能填 2"这类列举/排除误判为剧透。
  const patterns = [
    new RegExp('(?:仅剩|只能填|答案是|答案就是|就是)\\s*' + v + '(?![0-9])'),
    new RegExp('(?:只剩)\\s*' + v + '(?!\\s*[0-9和与、])'),
    new RegExp('(?:等于|\\=)\\s*' + v + '(?![0-9])'),
  ];
  return patterns.some((re) => re.test(text));
}
for (const [id, level] of Object.entries(levels)) {
  const goal = level.teachingGoal && level.teachingGoal.trim();
  const lp = level.lessonPlan;
  if (!goal || !lp || !lp.phases || !lp.phases.guided) continue;
  const guided = lp.phases.guided;
  if (guided.methodText && revealCommandRe.test(guided.methodText)) {
    warnings.push(`[第${chapterOf(id)}章 ${id}] methodText 疑似含揭示指令（应属于答案层而非技巧层）`);
  }
  if (guided.interactionType === 'NUMBER' && guided.correctValue !== undefined && guided.correctValue !== null) {
    if (guided.hintText && hintRevealsAnswer(guided.hintText, guided.correctValue)) {
      warnings.push(`[第${chapterOf(id)}章 ${id}] hintText 疑似直接给出答案 ${guided.correctValue}（应只给方向）`);
    }
  }
}

// 输出
function formatList(items, symbol) {
  return items.length ? items.map((x) => `  ${symbol} ${x}`).join('\n') : `  （无）`;
}

console.log('章节弧线校验结果');
console.log('==================');
console.log(`总关卡数: ${Object.keys(levels).length}`);
console.log(`ERROR: ${errors.length}`);
console.log(`WARNING: ${warnings.length}\n`);

if (errors.length) {
  console.log('ERRORS:');
  console.log(formatList(errors, '✗'));
  console.log('');
}
if (warnings.length) {
  console.log('WARNINGS:');
  console.log(formatList(warnings, '⚠'));
}

process.exit(errors.length ? 1 : 0);