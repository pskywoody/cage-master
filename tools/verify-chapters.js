const fs = require('fs');
const path = require('path');

const CHAPTERS_PATH = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json');

// 预期配置
const EXPECTED_CHAPTER_COUNT = 7;
const EXPECTED_LEVELS = {
  1: { count: 9, ids: [100, 101, 102, 103, 104, 105, 106, 107, 108] },
  2: { count: 8, ids: [201, 202, 203, 204, 205, 206, 207, 208] },
  3: { count: 7, ids: [301, 302, 303, 304, 305, 306, 307] },
  4: { count: 6, ids: [401, 402, 403, 404, 405, 406] },
  5: { count: 6, ids: [501, 502, 503, 504, 505, 506] },
  6: { count: 6, ids: [601, 602, 603, 604, 605, 606] },
  7: { count: 6, ids: [701, 702, 703, 704, 705, 706] }
};

const REQUIRED_LEVEL_FIELDS = ['levelId', 'title', 'gridSize', 'mode', 'features', 'triggers', 'boardData', 'cages', 'solution'];

// 预期mode规则
function getExpectedMode(chapterId, levelId) {
  if (chapterId === 1) {
    if (levelId === 103 || levelId === 106) return 'endgame';
    if (levelId === 108) return 'comprehensive';
    return 'full';
  }
  if (chapterId >= 2 && chapterId <= 6) {
    const ids = EXPECTED_LEVELS[chapterId].ids;
    const lastId = ids[ids.length - 1];
    if (levelId === lastId) return 'comprehensive';
    return 'full';
  }
  if (chapterId === 7) {
    return 'endgame';
  }
  return null;
}

// 报告收集
const errors = [];
const warnings = [];
const passed = [];

function addError(msg) {
  errors.push(msg);
}
function addWarning(msg) {
  warnings.push(msg);
}
function addPass(msg) {
  passed.push(msg);
}

// 读取文件
console.log('='.repeat(60));
console.log('  章节数据质量验证报告');
console.log('='.repeat(60));
console.log();

let rawData;
try {
  rawData = fs.readFileSync(CHAPTERS_PATH, 'utf-8');
  addPass('JSON文件读取成功');
} catch (e) {
  addError(`无法读取文件: ${e.message}`);
  printReport();
  process.exit(1);
}

// 验证1: JSON格式
let chapters;
try {
  chapters = JSON.parse(rawData);
  addPass('JSON格式合法');
} catch (e) {
  addError(`JSON格式错误: ${e.message}`);
  printReport();
  process.exit(1);
}

// 验证2: 总共有7个章节，chapterId 1-7
if (!Array.isArray(chapters)) {
  addError('根元素不是数组');
  printReport();
  process.exit(1);
}

if (chapters.length !== EXPECTED_CHAPTER_COUNT) {
  addError(`章节数量错误: 期望${EXPECTED_CHAPTER_COUNT}章，实际${chapters.length}章`);
} else {
  addPass(`章节数量正确: ${EXPECTED_CHAPTER_COUNT}章`);
}

const chapterIds = chapters.map(c => c.chapterId);
for (let i = 1; i <= EXPECTED_CHAPTER_COUNT; i++) {
  if (!chapterIds.includes(i)) {
    addError(`缺少第${i}章 (chapterId=${i})`);
  }
}
if (errors.filter(e => e.includes('缺少第')).length === 0) {
  addPass('chapterId 1-7 完整');
}

// 按chapterId排序处理
const chapterMap = {};
chapters.forEach(c => {
  chapterMap[c.chapterId] = c;
});

// 逐章验证
for (let chId = 1; chId <= EXPECTED_CHAPTER_COUNT; chId++) {
  const chapter = chapterMap[chId];
  if (!chapter) continue;

  console.log(`\n--- 第${chId}章验证 ---`);

  // 验证9: badge对象
  if (!chapter.badge) {
    addError(`第${chId}章缺少badge对象`);
  } else {
    const badgeFields = ['id', 'name', 'icon', 'description'];
    const missingBadgeFields = badgeFields.filter(f => !chapter.badge[f]);
    if (missingBadgeFields.length > 0) {
      addError(`第${chId}章badge缺少字段: ${missingBadgeFields.join(', ')}`);
    } else {
      addPass(`第${chId}章badge完整 (${chapter.badge.name})`);
    }
  }

  // 验证8: 第3章introStory/endingStory位置检查
  if (chId === 3) {
    const chapterStr = JSON.stringify(chapter);
    const levelsIdx = chapterStr.indexOf('"levels"');
    const introIdx = chapterStr.indexOf('"introStory"');
    const endingIdx = chapterStr.indexOf('"endingStory"');
    
    if (introIdx === -1) {
      addError('第3章缺少introStory');
    } else if (introIdx > levelsIdx) {
      addError('第3章introStory在levels之后（应在levels之前）');
    } else {
      addPass('第3章introStory位置正确（在levels之前）');
    }
    
    if (endingIdx === -1) {
      addError('第3章缺少endingStory');
    } else if (endingIdx > levelsIdx) {
      addError('第3章endingStory在levels之后（应在levels之前）');
    } else {
      addPass('第3章endingStory位置正确（在levels之前）');
    }
  } else {
    // 其他章节也检查introStory/endingStory是否存在
    if (chapter.introStory && !Array.isArray(chapter.introStory)) {
      addWarning(`第${chId}章introStory格式异常`);
    }
    if (chapter.endingStory && !Array.isArray(chapter.endingStory)) {
      addWarning(`第${chId}章endingStory格式异常`);
    }
  }

  // 验证3: 关卡数量和ID
  const levels = chapter.levels;
  if (!levels || !Array.isArray(levels)) {
    addError(`第${chId}章缺少levels数组`);
    continue;
  }

  const expected = EXPECTED_LEVELS[chId];
  if (levels.length !== expected.count) {
    addError(`第${chId}章关卡数量错误: 期望${expected.count}关，实际${levels.length}关`);
  } else {
    addPass(`第${chId}章关卡数量正确: ${expected.count}关`);
  }

  const levelIds = levels.map(l => l.levelId);
  const missingIds = expected.ids.filter(id => !levelIds.includes(id));
  const extraIds = levelIds.filter(id => !expected.ids.includes(id));
  if (missingIds.length > 0) {
    addError(`第${chId}章缺少关卡ID: ${missingIds.join(', ')}`);
  }
  if (extraIds.length > 0) {
    addError(`第${chId}章存在多余关卡ID: ${extraIds.join(', ')}`);
  }
  if (missingIds.length === 0 && extraIds.length === 0) {
    addPass(`第${chId}章关卡ID完整 (${expected.ids.join(', ')})`);
  }

  // 逐关验证
  for (const level of levels) {
    const lid = level.levelId;
    const levelLabel = `第${chId}章-关卡${lid}`;

    // 验证4: 必须字段
    const missingFields = REQUIRED_LEVEL_FIELDS.filter(f => level[f] === undefined || level[f] === null);
    if (missingFields.length > 0) {
      addError(`${levelLabel} 缺少必须字段: ${missingFields.join(', ')}`);
    } else {
      addPass(`${levelLabel} 必须字段完整`);
    }

    // 验证5: mode字段
    const expectedMode = getExpectedMode(chId, lid);
    if (expectedMode && level.mode !== expectedMode) {
      addError(`${levelLabel} mode错误: 期望"${expectedMode}"，实际"${level.mode}"`);
    } else if (expectedMode) {
      addPass(`${levelLabel} mode正确 (${level.mode})`);
    }

    // 验证6: features必须包含autoFillCandidates
    if (level.features) {
      if (level.features.autoFillCandidates === undefined) {
        addError(`${levelLabel} features缺少autoFillCandidates字段`);
      } else if (level.features.autoFillCandidates !== true) {
        addWarning(`${levelLabel} features.autoFillCandidates不是true (值: ${level.features.autoFillCandidates})`);
      } else {
        addPass(`${levelLabel} features.autoFillCandidates正确`);
      }
    }

    // 验证7: triggers检查（第1章不强制检查）
    if (level.triggers && Array.isArray(level.triggers)) {
      const triggers = level.triggers;

      // 至少一个onLevelStart
      const hasOnLevelStart = triggers.some(t => t.condition === 'onLevelStart');
      if (!hasOnLevelStart && chId !== 1) {
        addError(`${levelLabel} 缺少onLevelStart触发器`);
      } else if (hasOnLevelStart) {
        addPass(`${levelLabel} 包含onLevelStart触发器`);
      }

      // 至少一个onStuckForSeconds
      const hasOnStuck = triggers.some(t => t.condition === 'onStuckForSeconds');
      if (!hasOnStuck && chId !== 1) {
        addError(`${levelLabel} 缺少onStuckForSeconds触发器`);
      } else if (hasOnStuck) {
        addPass(`${levelLabel} 包含onStuckForSeconds触发器`);
      }

      // 必须有2个enter_phase触发器（breakthrough和finishing）
      const enterPhaseTriggers = triggers.filter(t => t.type === 'enter_phase');
      const phases = enterPhaseTriggers.map(t => t.phase);
      const hasBreakthrough = phases.includes('breakthrough');
      const hasFinishing = phases.includes('finishing');
      
      if (chId !== 1) {
        if (enterPhaseTriggers.length < 2) {
          addError(`${levelLabel} enter_phase触发器数量不足: 期望2个，实际${enterPhaseTriggers.length}个`);
        }
        if (!hasBreakthrough) {
          addError(`${levelLabel} 缺少breakthrough阶段的enter_phase触发器`);
        }
        if (!hasFinishing) {
          addError(`${levelLabel} 缺少finishing阶段的enter_phase触发器`);
        }
        if (enterPhaseTriggers.length >= 2 && hasBreakthrough && hasFinishing) {
          addPass(`${levelLabel} enter_phase触发器完整 (breakthrough + finishing)`);
        }
      } else {
        // 第1章只检查，不报错
        if (enterPhaseTriggers.length >= 2 && hasBreakthrough && hasFinishing) {
          addPass(`${levelLabel} enter_phase触发器完整 (breakthrough + finishing)`);
        } else if (enterPhaseTriggers.length < 2 || !hasBreakthrough || !hasFinishing) {
          addWarning(`${levelLabel} enter_phase触发器可能不完整 (第1章保持原样，仅提示)`);
        }
      }
    } else if (chId !== 1) {
      addError(`${levelLabel} 缺少triggers数组或格式错误`);
    }

    // 额外检查: cages和solution是否为数组
    if (level.cages && !Array.isArray(level.cages)) {
      addError(`${levelLabel} cages不是数组`);
    }
    if (level.solution !== undefined) {
      if (!Array.isArray(level.solution)) {
        addError(`${levelLabel} solution不是数组`);
      }
    }
    if (level.boardData && !Array.isArray(level.boardData)) {
      addError(`${levelLabel} boardData不是数组`);
    }
    if (level.gridSize && typeof level.gridSize !== 'number') {
      addError(`${levelLabel} gridSize不是数字`);
    }
  }
}

// 输出报告
function printReport() {
  console.log('\n' + '='.repeat(60));
  console.log('  验证结果汇总');
  console.log('='.repeat(60));
  console.log();

  console.log(`✅ 通过项: ${passed.length}`);
  console.log(`⚠️  警告项: ${warnings.length}`);
  console.log(`❌ 错误项: ${errors.length}`);
  console.log();

  if (warnings.length > 0) {
    console.log('--- 警告 ---');
    warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    console.log();
  }

  if (errors.length > 0) {
    console.log('--- 错误 ---');
    errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log();
  }

  // 关键检查项判定（错误中排除第1章相关的triggers问题不算关键？不，按要求）
  // 关键检查：JSON合法、章节数正确、关卡数量正确、必须字段、mode正确、badge存在、autoFillCandidates、triggers(2-7章)
  const criticalErrors = errors.filter(e => {
    // 第1章triggers相关不视为关键错误（因为规则说"第1章保持原样"）
    if (e.includes('第1章-关卡') && (e.includes('onLevelStart') || e.includes('onStuckForSeconds') || e.includes('enter_phase'))) {
      return false;
    }
    return true;
  });

  if (criticalErrors.length === 0) {
    console.log('✅ 章节数据质量验证通过');
    if (warnings.length > 0) {
      console.log(`   (存在${warnings.length}个警告，请关注)`);
    }
  } else {
    console.log(`❌ 章节数据质量验证未通过，存在${criticalErrors.length}个关键错误`);
  }
  console.log();
}

printReport();
