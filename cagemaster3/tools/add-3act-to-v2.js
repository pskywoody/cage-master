/**
 * 为 all_levels_v2.json 添加 threeAct 元数据
 * V2 格式：cells 而非 boardData
 */

const fs = require('fs');
const path = require('path');

// 模拟浏览器环境
global.window = global;

// 加载 board.js
eval(fs.readFileSync(path.join(__dirname, '..', 'game', 'board.js'), 'utf-8'));
const Board = global.Board;

// 加载 tech-rater.js
const techRaterModule = require(path.join(__dirname, '..', 'game', 'tech-rater.js'));
global.TechRater = techRaterModule.TechRater || techRaterModule;

// 加载 tech-rater-adapter.js
eval(fs.readFileSync(path.join(__dirname, '..', 'game', 'tech-rater-adapter.js'), 'utf-8'));
const TechRaterAdapter = global.TechRaterAdapter;

// ========================================================
// 关卡类型推断
// ========================================================

function getLevelType(levelData, isBossLevel) {
  const LEVEL_TYPES = { NOVICE: 'novice', MIDGAME: 'midgame', ENDGAME: 'endgame', BOSS: 'boss' };
  if (!levelData) return LEVEL_TYPES.MIDGAME;
  if (levelData.winCondition && levelData.winCondition.type) {
    const customType = levelData.winCondition.type;
    if (Object.values(LEVEL_TYPES).includes(customType)) return customType;
  }
  if (isBossLevel) return LEVEL_TYPES.BOSS;
  const levelId = parseInt(levelData.levelId) || 0;
  const gridSize = levelData.gridSize || 9;
  const difficultyLevel = levelData.difficultyLevel || 3;
  if (gridSize <= 4 || (levelId >= 101 && levelId <= 109) || difficultyLevel <= 1) {
    return LEVEL_TYPES.NOVICE;
  }
  if ((levelId >= 501 && levelId <= 706) || difficultyLevel >= 4) {
    return LEVEL_TYPES.ENDGAME;
  }
  return LEVEL_TYPES.MIDGAME;
}

// ========================================================
// 为单个关卡生成 threeAct
// ========================================================

function generateThreeAct(levelData, isBossLevel) {
  const size = levelData.gridSize || 9;
  const levelType = getLevelType(levelData, isBossLevel);
  const boardData = levelData.cells || levelData.boardData;

  const board = new Board(size);
  try {
    board.loadLevel({
      cells: boardData,
      cages: levelData.cages || [],
    });
  } catch (e) {
    console.error(`  [ERROR] 加载关卡失败: ${e.message}`);
    return null;
  }

  let adapter;
  try {
    adapter = new TechRaterAdapter(board);
  } catch (e) {
    console.error(`  [ERROR] 创建 Adapter 失败: ${e.message}`);
    return null;
  }

  let heatmap;
  try {
    heatmap = adapter.generateHeatmap(levelType);
  } catch (e) {
    console.error(`  [ERROR] 生成 heatmap 失败: ${e.message}`);
    return null;
  }

  if (!heatmap || !heatmap.rhythmTimeline || !heatmap.rhythmTimeline.phases) {
    return null;
  }

  const phases = heatmap.rhythmTimeline.phases;
  const opening = (phases.opening?.cellKeys || []).map(key => {
    const [r, c] = key.split(',').map(Number);
    return [r, c];
  });
  const breakthrough = (phases.breakthrough?.gateCells || []).map(key => {
    const [r, c] = key.split(',').map(Number);
    return [r, c];
  });
  const avalanche = (phases.avalanche?.dominoSequence || []).map(key => {
    const [r, c] = key.split(',').map(Number);
    return [r, c];
  });

  return { opening, breakthrough, avalanche };
}

// ========================================================
// 主流程
// ========================================================

function main() {
  const inputFile = path.join(__dirname, '..', 'data', 'all_levels_v2.json');
  const outputFile = path.join(__dirname, '..', 'data', 'all_levels_v2_with_3act.json');
  const backupFile = path.join(__dirname, '..', 'data', 'all_levels_v2.bak.json');

  console.log('=== 为 V2 关卡数据添加 threeAct ===\n');
  console.log(`输入: ${inputFile}`);
  console.log(`输出: ${outputFile}`);
  console.log('');

  // 读取数据
  let levels;
  try {
    levels = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  } catch (e) {
    console.error(`[ERROR] 读取输入文件失败: ${e.message}`);
    process.exit(1);
  }

  console.log(`共 ${levels.length} 个关卡\n`);

  // 备份
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, JSON.stringify(levels, null, 2), 'utf-8');
    console.log('已备份原始文件\n');
  }

  let successCount = 0;
  let failCount = 0;

  // 为每个关卡生成 threeAct
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const levelId = level.levelId || `#${i + 1}`;
    const isBoss = false; // V2 数据里没有 Boss 概念

    process.stdout.write(`关卡 ${levelId} (${i + 1}/${levels.length})... `);

    const threeAct = generateThreeAct(level, isBoss);

    if (threeAct) {
      level.threeAct = threeAct;
      const emptyCount = (level.cells || level.boardData || []).reduce(
        (s, r) => s + r.filter(v => v === 0).length, 0
      );
      console.log(`✓ simple=${threeAct.opening.length}, gate=${threeAct.breakthrough.length}, core=${threeAct.avalanche.length} (空格=${emptyCount})`);
      successCount++;
    } else {
      console.log(`✗ 失败`);
      failCount++;
    }
  }

  // 写入输出
  try {
    fs.writeFileSync(outputFile, JSON.stringify(levels, null, 2), 'utf-8');
    console.log(`\n✅ 完成: 成功 ${successCount}, 失败 ${failCount}`);
    console.log(`输出文件: ${outputFile}`);
  } catch (e) {
    console.error(`[ERROR] 写入输出失败: ${e.message}`);
    process.exit(1);
  }
}

main();
