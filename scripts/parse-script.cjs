/**
 * parse-script.js - 剧本解析器
 * 
 * 将 cagemaster3-new/docs/完整剧本_v5/ 下的三个 markdown 剧本文件解析为结构化 JSON。
 * 
 * 用法: node scripts/parse-script.cjs
 * 
 * 输出: d:\killersudoku\cagemaster4\data\scripts\scripts.json
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 配置
// ============================================================

const INPUT_DIR = path.resolve(__dirname, '../../cagemaster3-new/docs/完整剧本_v5');
const OUTPUT_DIR = path.resolve(__dirname, '../data/scripts');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'scripts.json');

const INPUT_FILES = [
  'Cagemaster3_v5_01_第一周目前两章.md',
  'Cagemaster3_v5_02_第一周目3-7章.md',
  'Cagemaster3_v5_03_第二三周目与真结局.md'
];

// ============================================================
// 工具函数
// ============================================================

function log(msg) {
  console.log('[parse-script] ' + msg);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log('创建目录: ' + dir);
  }
}

function readLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split(/\r?\n/);
}

// ============================================================
// 正则表达式
// ============================================================

const RE_CHAPTER = /^##\s+第(\d+)章\s*[-\u00b7\u30fb\u00d7\s]?\s*(.+)$/;
const RE_CYCLE_CHAPTER = /^##\s+第(\d+(?:[-\u2013]+\d+)?)章\s*[-\u00b7\u30fb\u00d7\s]?\s*(.*)$/;
const RE_CYCLE_PROLOGUE = /^##\s+(二周目|三周目)\s*[-\u00b7\u30fb\u00d7\s]?\s*(楔子|开场|序章)?/;
const RE_LEVEL = /^###\s+第[^关]+关\s*[-\u00b7\u30fb\u00d7\s]?\s*(.+?)\s*[（(](\d+)[）)]?\s*$/;
const RE_CHAPTER_END = /^###\s+第([^章]+)章结尾\s*[-\u00b7\u30fb\u00d7\s]?\s*(.+)$/;
const RE_SCENE = /^###\s+(楔子|开场|第[^章]+章结尾|尾声)\s*[-\u00b7\u30fb\u00d7\s]?\s*(.*)$/;
const RE_CYCLE = /^#\s+第(\d+)周目\s*[：:]\s*(.+)$/;
const RE_SECOND_CYCLE = /^#\s+第二周目/;
const RE_THIRD_CYCLE = /^#\s+第三周目/;
const RE_TRUE_ENDING = /^#\s+真结局/;
const RE_DIALOG_MARKER = /^【(关前|通关后)】(?:【SFX:\s*([^\]]+)】)?$/;
const RE_DIALOG_LINE = /^([^：\n]+?)：(.+)$/;
const RE_VO = /【VO:\s*([^】]+)】/g;
const RE_EMOTION = /【EMOTION:\s*([^】]+)】/g;
const RE_SFX = /【SFX:\s*([^】]+)】/g;
const RE_BGM = /【BGM:\s*([^】]+)】/g;
const RE_PAUSE = /【停顿:\s*([\d.]+)】/g;
const RE_STANDALONE_DIRECTOR = /^【导演：\s*([^】]*?)】\s*$/;
const RE_STANDALONE_SCENE = /^【SCENE:\s*([^】]+)】\s*$/;
const RE_STANDALONE_BGM = /^【BGM:\s*([^】]+)】\s*$/;
const RE_STANDALONE_SFX = /^【SFX:\s*([^】]+)】\s*$/;
const RE_STANDALONE_PROP = /^【道具：\s*([^】]+)】\s*$/;
const RE_STANDALONE_PAUSE = /^【停顿:\s*([\d.]+)】\s*$/;
const RE_ACTION = /（([^）]*)）/g;
const RE_SEPARATOR = /^---\s*$/;

// 中文数字转阿拉伯数字
function cnToNum(cn) {
  const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  return map[cn] || parseInt(cn) || 0;
}

// ============================================================
// 解析函数
// ============================================================

function extractTags(text) {
  const tags = {};
  let m;
  RE_VO.lastIndex = 0; m = RE_VO.exec(text); if (m) tags.vo = m[1].trim();
  RE_EMOTION.lastIndex = 0; m = RE_EMOTION.exec(text); if (m) tags.emotion = m[1].trim();
  RE_SFX.lastIndex = 0; m = RE_SFX.exec(text); if (m) tags.sfx = m[1].trim();
  RE_BGM.lastIndex = 0; m = RE_BGM.exec(text); if (m) tags.bgm = m[1].trim();
  RE_PAUSE.lastIndex = 0; m = RE_PAUSE.exec(text); if (m) tags.pause = parseFloat(m[1]);
  return tags;
}

function removeTags(text) {
  return text
    .replace(/【VO:\s*[^】]+】/g, '')
    .replace(/【EMOTION:\s*[^】]+】/g, '')
    .replace(/【SFX:\s*[^】]+】/g, '')
    .replace(/【BGM:\s*[^】]+】/g, '')
    .replace(/【停顿:\s*[.\d]+】/g, '')
    .replace(/【导演：\s*[^】]*?】/g, '')
    .replace(/【SCENE:\s*[^】]+】/g, '')
    .replace(/【道具：\s*[^】]+】/g, '')
    .trim();
}

function parseDialogLine(line) {
  const match = line.match(RE_DIALOG_LINE);
  if (!match) return null;
  let speaker = match[1].trim();
  let text = match[2].trim();
  const tags = extractTags(text);
  const cleanText = removeTags(text);
  let actions = [];
  let actionMatch;
  RE_ACTION.lastIndex = 0;
  let aText = cleanText;
  while ((actionMatch = RE_ACTION.exec(aText)) !== null) {
    actions.push(actionMatch[1].trim());
  }
  const _action = actions.length > 0 ? actions.join('；') : null;
  let finalText = cleanText.replace(RE_ACTION, '').trim();
  if (!finalText && !tags.vo) return null;
  const dialog = { speaker: speaker, text: finalText || '' };
  if (tags.emotion) dialog.emotion = tags.emotion;
  if (tags.vo) dialog.vo = tags.vo;
  if (tags.sfx) dialog.sfx = tags.sfx;
  if (tags.bgm) dialog.bgm = tags.bgm;
  if (tags.pause !== undefined) dialog.pause = tags.pause;
  if (_action) dialog._action = _action;
  return dialog;
}

function parseStandaloneLine(line) {
  const t = line.trim();
  let m;
  m = t.match(RE_STANDALONE_DIRECTOR); if (m) return { type: 'director', value: m[1].trim() };
  m = t.match(RE_STANDALONE_SCENE); if (m) return { type: 'scene', value: m[1].trim() };
  m = t.match(RE_STANDALONE_BGM); if (m) return { type: 'bgm', value: m[1].trim() };
  m = t.match(RE_STANDALONE_SFX); if (m) return { type: 'sfx', value: m[1].trim() };
  m = t.match(RE_STANDALONE_PROP); if (m) return { type: 'prop', value: m[1].trim() };
  m = t.match(RE_STANDALONE_PAUSE); if (m) return { type: 'pause', value: parseFloat(m[1]) };
  return null;
}

function isStandaloneInstruction(line) {
  const t = line.trim();
  return RE_STANDALONE_DIRECTOR.test(t) || RE_STANDALONE_SCENE.test(t) || RE_STANDALONE_BGM.test(t) || RE_STANDALONE_SFX.test(t) || RE_STANDALONE_PROP.test(t) || RE_STANDALONE_PAUSE.test(t);
}

function isDialogLine(line) {
  if (isStandaloneInstruction(line)) return false;
  if (RE_DIALOG_MARKER.test(line.trim())) return false;
  return RE_DIALOG_LINE.test(line.trim());
}

function hasTagOnly(line) {
  return /【(VO|EMOTION|停顿|SFX|BGM):/.test(line.trim());
}

function pushDialog(dialog, section, chapter, level) {
  if (section === 'prologue' && chapter) chapter.prologue.push(dialog);
  else if (section === 'epilogue' && chapter) chapter.epilogue.push(dialog);
  else if (section === 'preDialog' && level) level.preDialog.push(dialog);
  else if (section === 'clearDialog' && level) level.clearDialog.push(dialog);
  else if (chapter && !level) chapter.prologue.push(dialog);
  else if (level) level.preDialog.push(dialog);
}

function parseFile(lines, fileIndex) {
  const result = { cycles: [] };
  let currentChapter = null;
  let currentLevel = null;
  let currentSection = 'none';
  let pendingTags = { director: null, scene: null, bgm: null, sfx: null, prop: null, pause: null, vo: null, emotion: null };
  let lastDialog = null;
  let inSecondCycle = false;
  let inThirdCycle = false;
  if (fileIndex === 2) inSecondCycle = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('<!--')) continue;
    if (trimmed.startsWith('# 《笼')) continue;
    if (trimmed.startsWith('>')) continue;
    if (trimmed.startsWith('|')) continue;
    if (trimmed.startsWith('**')) continue;
    if (trimmed.startsWith('## 格式规范')) continue;
    if (trimmed.startsWith('## MiniMax')) continue;
    if (trimmed.startsWith('## W角色')) continue;
    if (trimmed.startsWith('### 格式规范')) continue;
    if (RE_SEPARATOR.test(trimmed)) continue;

    if (RE_SECOND_CYCLE.test(trimmed)) { inSecondCycle = true; inThirdCycle = false; currentChapter = null; currentLevel = null; continue; }
    if (RE_THIRD_CYCLE.test(trimmed)) { inSecondCycle = false; inThirdCycle = true; currentChapter = null; currentLevel = null; continue; }
    if (RE_TRUE_ENDING.test(trimmed)) { inThirdCycle = true; continue; }

    // 处理"二周目·楔子"或"三周目·楔子"
    const prologueMatch = trimmed.match(RE_CYCLE_PROLOGUE);
    if (prologueMatch) {
      const cycleText = prologueMatch[1];
      let cycleId, cycleName;
      if (cycleText === '二周目') { cycleId = 2; cycleName = '第二周目·阿妍视角——重叠的棋局'; }
      else { cycleId = 3; cycleName = '第三周目·莹莹视角——父亲的痕迹'; }
      let cycle = result.cycles.find(c => c.cycleId === cycleId);
      if (!cycle) { cycle = { cycleId: cycleId, name: cycleName, chapters: [] }; result.cycles.push(cycle); }
      currentChapter = { chapterId: 0, title: cycleText + '·楔子', prologue: [], epilogue: [], levels: [] };
      cycle.chapters.push(currentChapter);
      currentLevel = null; currentSection = 'prologue';
      pendingTags = { director: null, scene: null, bgm: null, sfx: null, prop: null, pause: null, vo: null, emotion: null };
      continue;
    }

    let chapterMatch = trimmed.match(RE_CHAPTER);
    if (chapterMatch) {
      const chapterNum = parseInt(chapterMatch[1]);
      const chapterTitle = chapterMatch[2].trim();
      let cycleId, cycleName;
      if (fileIndex === 0 || fileIndex === 1) { cycleId = 1; cycleName = '第一周目·沈墨视角——寻局者'; }
      else if (inSecondCycle) { cycleId = 2; cycleName = '第二周目·阿妍视角——重叠的棋局'; }
      else if (inThirdCycle) { cycleId = 3; cycleName = '第三周目·莹莹视角——父亲的痕迹'; }
      else { cycleId = 1; cycleName = '第一周目·沈墨视角——寻局者'; }
      let cycle = result.cycles.find(c => c.cycleId === cycleId);
      if (!cycle) { cycle = { cycleId: cycleId, name: cycleName, chapters: [] }; result.cycles.push(cycle); }
      currentChapter = cycle.chapters.find(ch => ch.chapterId === chapterNum);
      if (!currentChapter) { currentChapter = { chapterId: chapterNum, title: chapterTitle, prologue: [], epilogue: [], levels: [] }; cycle.chapters.push(currentChapter); }
      currentLevel = null; currentSection = 'none';
      pendingTags = { director: null, scene: null, bgm: null, sfx: null, prop: null, pause: null, vo: null, emotion: null };
      continue;
    }

    if (fileIndex === 2 && !chapterMatch) {
      const ccMatch = trimmed.match(RE_CYCLE_CHAPTER);
      if (ccMatch) {
        const chapterNumStr = ccMatch[1];
        const chapterTitle = ccMatch[2].trim();
        // 处理范围格式如 "2-6" → 取第一个数字
        let chapterNum = parseInt(chapterNumStr.split(/[-–]/)[0]);
        let cycleId, cycleName;
        if (inSecondCycle) { cycleId = 2; cycleName = '第二周目·阿妍视角——重叠的棋局'; }
        else { cycleId = 3; cycleName = '第三周目·莹莹视角——父亲的痕迹'; }
        let cycle = result.cycles.find(c => c.cycleId === cycleId);
        if (!cycle) { cycle = { cycleId: cycleId, name: cycleName, chapters: [] }; result.cycles.push(cycle); }
        currentChapter = cycle.chapters.find(ch => ch.chapterId === chapterNum);
        if (!currentChapter) { currentChapter = { chapterId: chapterNum, title: chapterTitle, prologue: [], epilogue: [], levels: [] }; cycle.chapters.push(currentChapter); }
        currentLevel = null; currentSection = 'none';
        pendingTags = { director: null, scene: null, bgm: null, sfx: null, prop: null, pause: null, vo: null, emotion: null };
        continue;
      }
    }

    const levelMatch = trimmed.match(RE_LEVEL);
    if (levelMatch) {
      const levelId = parseInt(levelMatch[2]);
      if (currentChapter) {
        currentLevel = { levelId: levelId, title: levelMatch[1].trim(), preDialog: [], clearDialog: [] };
        currentChapter.levels.push(currentLevel);
        currentSection = 'none';
        pendingTags = { director: null, scene: null, bgm: null, sfx: null, prop: null, pause: null };
      }
      continue;
    }

    const endMatch = trimmed.match(RE_CHAPTER_END);
    if (endMatch) {
      const chapterNum = cnToNum(endMatch[1]);
      let endLevelId = chapterNum * 100 + 99;
      if (chapterNum === 1) endLevelId = 199;
      else if (chapterNum === 7) endLevelId = 799;
      if (currentChapter) {
        currentLevel = { levelId: endLevelId, title: '第' + chapterNum + '章结尾·' + endMatch[2].trim(), preDialog: [], clearDialog: [] };
        currentChapter.levels.push(currentLevel);
        currentSection = 'none';
        pendingTags = { director: null, scene: null, bgm: null, sfx: null, prop: null, pause: null };
      }
      continue;
    }

    const sceneMatch = trimmed.match(RE_SCENE);
    if (sceneMatch) {
      const sceneType = sceneMatch[1];
      // 如果当前没有章节，创建临时章节（用于二周目/三周目的楔子）
      if (!currentChapter && (fileIndex === 2)) {
        let cycleId = inSecondCycle ? 2 : 3;
        let cycleName = inSecondCycle ? '第二周目·阿妍视角——重叠的棋局' : '第三周目·莹莹视角——父亲的痕迹';
        let cycle = result.cycles.find(c => c.cycleId === cycleId);
        if (!cycle) { cycle = { cycleId: cycleId, name: cycleName, chapters: [] }; result.cycles.push(cycle); }
        currentChapter = { chapterId: 0, title: '楔子', prologue: [], epilogue: [], levels: [] };
        cycle.chapters.push(currentChapter);
      }
      currentLevel = null;
      currentSection = (sceneType === '楔子' || sceneType === '开场') ? 'prologue' : (sceneType === '尾声' ? 'epilogue' : 'scene');
      pendingTags = { director: null, scene: null, bgm: null, sfx: null, prop: null, pause: null };
      continue;
    }

    if (fileIndex === 2 && /^###\s+/.test(trimmed)) {
      const specialMatch = trimmed.match(/^###\s+(.+)$/);
      if (specialMatch) {
        const title = specialMatch[1].trim();
        if (title === '父女重逢' || title === '传承' || title === '告别' || title === '尾声·新的开始') {
          currentSection = 'prologue'; currentLevel = null;
          pendingTags = { director: null, scene: null, bgm: null, sfx: null, prop: null, pause: null };
          continue;
        }
        continue;
      }
    }

    const markerMatch = trimmed.match(RE_DIALOG_MARKER);
    if (markerMatch) {
      currentSection = markerMatch[1] === '关前' ? 'preDialog' : 'clearDialog';
      if (markerMatch[2]) pendingTags.sfx = markerMatch[2].trim();
      continue;
    }

    const standalone = parseStandaloneLine(trimmed);
    if (standalone) {
      switch (standalone.type) {
        case 'director': pendingTags.director = standalone.value; break;
        case 'scene': pendingTags.scene = standalone.value; break;
        case 'bgm': pendingTags.bgm = standalone.value; break;
        case 'sfx': pendingTags.sfx = standalone.value; break;
        case 'prop': pendingTags.prop = standalone.value; break;
        case 'pause': pendingTags.pause = standalone.value; break;
      }
      continue;
    }

    const isTagOnly = hasTagOnly(trimmed);
    const isDialog = isDialogLine(trimmed);

    if (isTagOnly && !isDialog) {
      // 纯标签行（如【VO: xxx】【EMOTION: yyy】）
      const tags = extractTags(trimmed);
      if (lastDialog) {
        // 应用到上一个待提交的对话行
        if (tags.vo && !lastDialog.vo) lastDialog.vo = tags.vo;
        if (tags.emotion && !lastDialog.emotion) lastDialog.emotion = tags.emotion;
        if (tags.sfx && !lastDialog.sfx) lastDialog.sfx = tags.sfx;
        if (tags.bgm && !lastDialog.bgm) lastDialog.bgm = tags.bgm;
        if (tags.pause !== undefined && lastDialog.pause === undefined) lastDialog.pause = tags.pause;
      } else {
        // 存储为待处理标签，用于下一个对话
        if (tags.vo) pendingTags.vo = tags.vo;
        if (tags.emotion) pendingTags.emotion = tags.emotion;
        if (tags.sfx) pendingTags.sfx = tags.sfx;
        if (tags.bgm) pendingTags.bgm = tags.bgm;
        if (tags.pause !== undefined) pendingTags.pause = tags.pause;
      }
      continue;
    }

    if (isDialog) {
      // 先提交上一个待处理的对话
      if (lastDialog) {
        pushDialog(lastDialog, lastDialog._section, lastDialog._chapter, lastDialog._level);
        delete lastDialog._section;
        delete lastDialog._chapter;
        delete lastDialog._level;
        lastDialog = null;
      }

      const dialog = parseDialogLine(trimmed);
      if (dialog) {
        // 应用待处理标签
        if (pendingTags.director) {
          dialog._action = dialog._action ? pendingTags.director + '；' + dialog._action : pendingTags.director;
          pendingTags.director = null;
        }
        if (pendingTags.vo && !dialog.vo) { dialog.vo = pendingTags.vo; pendingTags.vo = null; }
        if (pendingTags.emotion && !dialog.emotion) { dialog.emotion = pendingTags.emotion; pendingTags.emotion = null; }
        if (pendingTags.scene && !dialog.scene) { dialog.scene = pendingTags.scene; pendingTags.scene = null; }
        if (pendingTags.bgm && !dialog.bgm) { dialog.bgm = pendingTags.bgm; pendingTags.bgm = null; }
        if (pendingTags.sfx && !dialog.sfx) { dialog.sfx = pendingTags.sfx; pendingTags.sfx = null; }
        if (pendingTags.pause !== null && dialog.pause === undefined) { dialog.pause = pendingTags.pause; pendingTags.pause = null; }

        // 暂存为待处理对话（等待后续标签行）
        lastDialog = dialog;
        lastDialog._section = currentSection;
        lastDialog._chapter = currentChapter;
        lastDialog._level = currentLevel;
      }
    }
  }

  // 提交最后一个待处理对话
  if (lastDialog) {
    pushDialog(lastDialog, lastDialog._section, lastDialog._chapter, lastDialog._level);
    delete lastDialog._section;
    delete lastDialog._chapter;
    delete lastDialog._level;
    lastDialog = null;
  }

  return result;
}

function mergeResults(results) {
  const merged = { version: '5.1', cycles: [] };
  const cycle1 = { cycleId: 1, name: '第一周目·沈墨视角——寻局者', chapters: [] };
  for (const result of results) {
    for (const cycle of result.cycles) {
      if (cycle.cycleId === 1) {
        for (const chapter of cycle.chapters) {
          const existing = cycle1.chapters.find(ch => ch.chapterId === chapter.chapterId);
          if (existing) {
            if (chapter.prologue && chapter.prologue.length > 0) existing.prologue = chapter.prologue;
            if (chapter.epilogue && chapter.epilogue.length > 0) existing.epilogue = chapter.epilogue;
            for (const level of chapter.levels) {
              const existingLevel = existing.levels.find(l => l.levelId === level.levelId);
              if (existingLevel) {
                if (level.preDialog && level.preDialog.length > 0) existingLevel.preDialog = level.preDialog;
                if (level.clearDialog && level.clearDialog.length > 0) existingLevel.clearDialog = level.clearDialog;
              } else { existing.levels.push(level); }
            }
          } else { cycle1.chapters.push(chapter); }
        }
      } else {
        const existingCycle = merged.cycles.find(c => c.cycleId === cycle.cycleId);
        if (existingCycle) {
          for (const chapter of cycle.chapters) {
            const existing = existingCycle.chapters.find(ch => ch.chapterId === chapter.chapterId);
            if (existing) {
              if (chapter.prologue && chapter.prologue.length > 0) existing.prologue = chapter.prologue;
              if (chapter.epilogue && chapter.epilogue.length > 0) existing.epilogue = chapter.epilogue;
            } else { existingCycle.chapters.push(chapter); }
          }
        } else { merged.cycles.push(cycle); }
      }
    }
  }
  merged.cycles.unshift(cycle1);
  merged.cycles.sort((a, b) => a.cycleId - b.cycleId);
  for (const cycle of merged.cycles) {
    cycle.chapters.sort((a, b) => a.chapterId - b.chapterId);
    for (const chapter of cycle.chapters) {
      chapter.levels.sort((a, b) => a.levelId - b.levelId);
    }
  }
  return merged;
}

function postProcess(data) {
  for (const cycle of data.cycles) {
    for (const chapter of cycle.chapters) {
      if (chapter.prologue && chapter.prologue.length === 0) delete chapter.prologue;
      if (chapter.epilogue && chapter.epilogue.length === 0) delete chapter.epilogue;
      for (const level of chapter.levels) {
        if (level.preDialog && level.preDialog.length === 0) delete level.preDialog;
        if (level.clearDialog && level.clearDialog.length === 0) delete level.clearDialog;
      }
    }
  }
  return data;
}

function main() {
  console.log('========================================');
  console.log('  剧本解析器 v1.1');
  console.log('========================================\n');
  log('输入目录: ' + INPUT_DIR);
  log('输出目录: ' + OUTPUT_DIR);
  ensureDir(OUTPUT_DIR);
  const results = [];
  for (let i = 0; i < INPUT_FILES.length; i++) {
    const fileName = INPUT_FILES[i];
    const filePath = path.join(INPUT_DIR, fileName);
    log('\n[' + (i + 1) + '/' + INPUT_FILES.length + '] 读取文件: ' + fileName);
    if (!fs.existsSync(filePath)) { log('  错误: 文件不存在: ' + filePath); process.exit(1); }
    const lines = readLines(filePath);
    log('  行数: ' + lines.length);
    const result = parseFile(lines, i);
    results.push(result);
    for (const cycle of result.cycles) {
      log('  周目: ' + cycle.name + ' (ID: ' + cycle.cycleId + ')');
      for (const chapter of cycle.chapters) {
        log('    第' + chapter.chapterId + '章: ' + chapter.title + ' (' + chapter.levels.length + ' 关)');
      }
    }
  }
  log('\n合并解析结果...');
  const merged = mergeResults(results);
  const final = postProcess(merged);
  log('写入输出文件: ' + OUTPUT_FILE);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(final, null, 2), 'utf-8');
  let totalDialogs = 0;
  for (const cycle of final.cycles) {
    for (const chapter of cycle.chapters) {
      if (chapter.prologue) totalDialogs += chapter.prologue.length;
      if (chapter.epilogue) totalDialogs += chapter.epilogue.length;
      for (const level of chapter.levels) {
        if (level.preDialog) totalDialogs += level.preDialog.length;
        if (level.clearDialog) totalDialogs += level.clearDialog.length;
      }
    }
  }
  const totalChapters = final.cycles.reduce(function(s, c) { return s + c.chapters.length; }, 0);
  const totalLevels = final.cycles.reduce(function(s, c) { return s + c.chapters.reduce(function(s2, ch) { return s2 + ch.levels.length; }, 0); }, 0);
  console.log('\n========================================');
  log('解析完成!');
  console.log('========================================');
  log('总周目数: ' + final.cycles.length);
  log('总章节数: ' + totalChapters);
  log('总关卡数: ' + totalLevels);
  log('总对话行数: ' + totalDialogs);
  log('输出文件: ' + OUTPUT_FILE);
  console.log('========================================\n');
  for (const cycle of final.cycles) {
    console.log('\n周目 ' + cycle.cycleId + ': ' + cycle.name);
    for (const chapter of cycle.chapters) {
      var pLen = chapter.prologue ? chapter.prologue.length : 0;
      var eLen = chapter.epilogue ? chapter.epilogue.length : 0;
      console.log('  第' + chapter.chapterId + '章 "' + chapter.title + '": ' + chapter.levels.length + '关, 序言' + pLen + ', 尾声' + eLen);
      for (const level of chapter.levels) {
        var preLen = level.preDialog ? level.preDialog.length : 0;
        var clearLen = level.clearDialog ? level.clearDialog.length : 0;
        console.log('    关卡 ' + level.levelId + ': ' + level.title + ' (前:' + preLen + ', 后:' + clearLen + ')');
      }
    }
  }
}

main();