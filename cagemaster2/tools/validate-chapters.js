/**
 * chapters.json 数据验证工具
 * 检查：章节完整性、关卡数据、剧情数据格式
 */

const fs = require('fs');
const path = require('path');

const CHAPTERS_PATH = path.join(__dirname, '..', 'data', 'chapters.json');

let errors = 0;
let warnings = 0;

function logError(msg) {
  console.error('  ✗', msg);
  errors++;
}

function logWarn(msg) {
  console.warn('  ⚠', msg);
  warnings++;
}

function logInfo(msg) {
  console.log('  ✓', msg);
}

console.log('验证 chapters.json...\n');

try {
  const data = JSON.parse(fs.readFileSync(CHAPTERS_PATH, 'utf-8'));
  
  // 检查章节
  if (!data.chapters || !Array.isArray(data.chapters)) {
    logError('chapters 字段不存在或不是数组');
    process.exit(1);
  }
  
  console.log(`共 ${data.chapters.length} 章\n`);
  
  data.chapters.forEach(ch => {
    console.log(`第${ch.chapterId}章 "${ch.title}":`);
    
    // 基本字段
    if (!ch.chapterId) logError('缺少 chapterId');
    if (!ch.title) logError('缺少 title');
    if (!ch.levels || !Array.isArray(ch.levels)) {
      logError('缺少 levels 数组');
      return;
    }
    
    logInfo(`关卡数: ${ch.levels.length}`);
    
    // introStory
    if (ch.introStory && Array.isArray(ch.introStory)) {
      logInfo(`introStory: ${ch.introStory.length} 条`);
    } else {
      logWarn('缺少 introStory');
    }
    
    // endingStory
    if (ch.endingStory && Array.isArray(ch.endingStory)) {
      logInfo(`endingStory: ${ch.endingStory.length} 条`);
    } else {
      logWarn('缺少 endingStory');
    }
    
    // 检查每关
    let withPre = 0, withClear = 0;
    ch.levels.forEach(level => {
      if (!level.levelId) logError(`关卡缺少 levelId`);
      if (!level.title) logWarn(`关卡 ${level.levelId} 缺少 title`);
      if (!level.gridSize) logWarn(`关卡 ${level.levelId} 缺少 gridSize`);
      
      if (level.preDialog && Array.isArray(level.preDialog) && level.preDialog.length > 0) {
        withPre++;
      }
      if (level.clearDialog && Array.isArray(level.clearDialog) && level.clearDialog.length > 0) {
        withClear++;
      }
    });
    
    logInfo(`有 preDialog 的关卡: ${withPre}/${ch.levels.length}`);
    logInfo(`有 clearDialog 的关卡: ${withClear}/${ch.levels.length}`);
    
    console.log('');
  });
  
  console.log('---');
  console.log(`验证完成：${errors} 个错误，${warnings} 个警告`);
  
  process.exit(errors > 0 ? 1 : 0);
  
} catch (e) {
  console.error('解析失败:', e.message);
  process.exit(1);
}
