/**
 * update-level701.js
 *
 * 替换 chapters.json 中 levelId=701 关卡的 boardData / cages，
 * 添加 breakthroughCell / pairCells / pairNums 字段，
 * 更新 triggers 中 onFillCountReached 的 count 值。
 *
 * 用法: node tools/update-level701.js
 */

const fs = require('fs');
const path = require('path');

// ---------- 路径配置 ----------
const CHAPTERS_PATH = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json');
const LEVEL701_PATH = path.join(__dirname, 'level701-final.json');
const BACKUP_PATH   = CHAPTERS_PATH + '.bak701';

// ---------- 1. 读取源文件 ----------
console.log('[1/5] 读取 chapters.json ...');
const chaptersRaw = fs.readFileSync(CHAPTERS_PATH, 'utf-8');
console.log(`      chapters.json 大小: ${(Buffer.byteLength(chaptersRaw) / 1024).toFixed(1)} KB`);

console.log('[2/5] 读取 level701-final.json ...');
const level701 = JSON.parse(fs.readFileSync(LEVEL701_PATH, 'utf-8'));
console.log(`      levelId=${level701.levelId}, boardData 行数=${level701.boardData.length}, cages 数=${level701.cages.length}`);

// ---------- 2. 解析 JSON ----------
console.log('[3/5] 解析 chapters.json ...');
let chapters;
try {
  chapters = JSON.parse(chaptersRaw);
} catch (e) {
  console.error('      解析 chapters.json 失败:', e.message);
  process.exit(1);
}

// ---------- 3. 定位 levelId=701 的关卡 ----------
let targetLevel = null;
let targetChapterIdx = -1;
let targetLevelIdx = -1;

for (let ci = 0; ci < chapters.length; ci++) {
  const chapter = chapters[ci];
  if (!Array.isArray(chapter.levels)) continue;
  for (let li = 0; li < chapter.levels.length; li++) {
    if (chapter.levels[li].levelId === 701) {
      targetLevel = chapter.levels[li];
      targetChapterIdx = ci;
      targetLevelIdx = li;
      break;
    }
  }
  if (targetLevel) break;
}

if (!targetLevel) {
  console.error('      未找到 levelId=701 的关卡!');
  process.exit(1);
}
console.log(`      找到关卡: chapter[${targetChapterIdx}].levels[${targetLevelIdx}] => "${targetLevel.title}"`);

// ---------- 4. 执行替换 / 新增 / 更新 ----------
console.log('[4/5] 执行数据替换与字段更新 ...');

// 4a. 替换 boardData 和 cages
targetLevel.boardData = level701.boardData;
targetLevel.cages     = level701.cages;

// 4b. 添加新字段
targetLevel.breakthroughCell = [3, 2];
targetLevel.pairCells        = [[3, 0], [3, 5]];
targetLevel.pairNums         = [6, 9];

// 4c. 更新 triggers 中 onFillCountReached 的 count
//     第一个 count:15 -> 27 (breakthrough 阶段触发)
//     第二个 count:30 -> 60 (finishing 收官阶段)
let fillCountTriggersFound = 0;
if (Array.isArray(targetLevel.triggers)) {
  for (const trigger of targetLevel.triggers) {
    if (trigger.condition === 'onFillCountReached') {
      fillCountTriggersFound++;
      if (fillCountTriggersFound === 1) {
        const old = trigger.count;
        trigger.count = 27;
        console.log(`      triggers: 第一个 onFillCountReached count ${old} -> ${trigger.count}`);
      } else if (fillCountTriggersFound === 2) {
        const old = trigger.count;
        trigger.count = 60;
        console.log(`      triggers: 第二个 onFillCountReached count ${old} -> ${trigger.count}`);
      }
    }
  }
}
console.log(`      共找到 ${fillCountTriggersFound} 个 onFillCountReached 触发器`);

// ---------- 5. 备份 + 写回 ----------
console.log('[5/5] 备份原文件并写回 chapters.json ...');

// 备份
fs.copyFileSync(CHAPTERS_PATH, BACKUP_PATH);
console.log(`      原文件已备份到: ${BACKUP_PATH}`);

// 序列化（保持缩进2空格，与原文件风格一致）
const output = JSON.stringify(chapters, null, 2);
fs.writeFileSync(CHAPTERS_PATH, output, 'utf-8');

const newSize = (Buffer.byteLength(output) / 1024).toFixed(1);
console.log(`      写入完成! 新文件大小: ${newSize} KB`);

// ---------- 6. 验证 ----------
console.log('\n===== 验证 =====');
const verify = JSON.parse(fs.readFileSync(CHAPTERS_PATH, 'utf-8'));
let vLevel = null;
for (const ch of verify) {
  if (!Array.isArray(ch.levels)) continue;
  for (const lv of ch.levels) {
    if (lv.levelId === 701) { vLevel = lv; break; }
  }
  if (vLevel) break;
}

if (!vLevel) {
  console.error('验证失败: 写回后找不到 levelId=701!');
  process.exit(1);
}

console.log('levelId       :', vLevel.levelId);
console.log('title         :', vLevel.title);
console.log('boardData[0]  :', JSON.stringify(vLevel.boardData[0]));
console.log('boardData[3]  :', JSON.stringify(vLevel.boardData[3]));
console.log('cages.length  :', vLevel.cages.length);
console.log('cages[0].sum  :', vLevel.cages[0].sum, '(期望 45)');
console.log('breakthroughCell:', JSON.stringify(vLevel.breakthroughCell), '(期望 [3,2])');
console.log('pairCells     :', JSON.stringify(vLevel.pairCells), '(期望 [[3,0],[3,5]])');
console.log('pairNums      :', JSON.stringify(vLevel.pairNums), '(期望 [6,9])');

const fillTrigs = vLevel.triggers.filter(t => t.condition === 'onFillCountReached');
fillTrigs.forEach((t, i) => {
  console.log(`trigger onFillCountReached #${i+1}: count=${t.count}, phase=${t.phase}`);
});

console.log('\n✓ 全部完成!');
