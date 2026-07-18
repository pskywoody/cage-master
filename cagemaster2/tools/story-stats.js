/**
 * 剧情数据统计工具
 */

const fs = require('fs');
const path = require('path');

const CHAPTERS_PATH = path.join(__dirname, '..', 'data', 'chapters.json');

const data = JSON.parse(fs.readFileSync(CHAPTERS_PATH, 'utf-8'));

let totalLevels = 0;
let totalPreDialog = 0;
let totalClearDialog = 0;
let totalIntro = 0;
let totalEnding = 0;
let totalVo = 0;
let characters = {};

function countVo(dialogue) {
  if (!dialogue || !Array.isArray(dialogue)) return 0;
  let count = 0;
  dialogue.forEach(entry => {
    if (entry.voiceId) {
      count++;
      if (!characters[entry.speaker]) characters[entry.speaker] = 0;
      characters[entry.speaker]++;
    }
  });
  return count;
}

console.log('=== 剧情数据统计 ===\n');

data.chapters.forEach(ch => {
  const chapterId = ch.chapterId;
  const levels = ch.levels || [];
  const intro = ch.introStory || [];
  const ending = ch.endingStory || [];
  
  let chPre = 0, chClear = 0, chVo = 0;
  
  levels.forEach(level => {
    if (level.preDialog && level.preDialog.length > 0) chPre++;
    if (level.clearDialog && level.clearDialog.length > 0) chClear++;
    chVo += countVo(level.preDialog);
    chVo += countVo(level.clearDialog);
  });
  
  chVo += countVo(intro);
  chVo += countVo(ending);
  
  totalLevels += levels.length;
  totalPreDialog += chPre;
  totalClearDialog += chClear;
  totalIntro += intro.length;
  totalEnding += ending.length;
  totalVo += chVo;
  
  console.log(`第${chapterId}章 ${ch.title}:`);
  console.log(`  关卡: ${levels.length}, preDialog: ${chPre}, clearDialog: ${chClear}`);
  console.log(`  intro: ${intro.length}, ending: ${ending.length}, VO: ${chVo}`);
  console.log('');
});

console.log('=== 总计 ===');
console.log(`章节数: ${data.chapters.length}`);
console.log(`关卡数: ${totalLevels}`);
console.log(`有 preDialog 的关卡: ${totalPreDialog}`);
console.log(`有 clearDialog 的关卡: ${totalClearDialog}`);
console.log(`introStory 总条数: ${totalIntro}`);
console.log(`endingStory 总条数: ${totalEnding}`);
console.log(`VO 配音台词数: ${totalVo}`);
console.log('');
console.log('各角色 VO 数量:');
Object.entries(characters).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
  console.log(`  ${name}: ${count} 条`);
});
