/**
 * 为已有关卡生成 threeAct 元数据
 * 用法: node tools/add-threeact-to-levels.js --chapter 1 --output data/chapters/chapter-01-with-3act.json
 * 
 * 流程：
 * 1. 读取章节 JSON
 * 2. 对每个关卡，用 TechRaterAdapter 生成 heatmap
 * 3. 从 heatmap 提取 opening/breakthrough/avalanche 序列
 * 4. 将 threeAct 写入关卡数据
 * 5. 输出新的章节 JSON
 */

const fs = require('fs');
const path = require('path');

// ========================================================
//  加载依赖
// ========================================================

// 模拟浏览器环境
global.window = global;

// 加载 board.js
const boardPath = path.join(__dirname, '..', 'game', 'board.js');
eval(fs.readFileSync(boardPath, 'utf-8'));
const Board = global.Board;

// 加载 tech-rater.js
const techRaterPath = path.join(__dirname, '..', 'game', 'tech-rater.js');
const techRaterModule = require(techRaterPath);
const TechRater = techRaterModule.TechRater || techRaterModule;

// 加载 tech-rater-adapter.js
const adapterPath = path.join(__dirname, '..', 'game', 'tech-rater-adapter.js');
eval(fs.readFileSync(adapterPath, 'utf-8'));
const TechRaterAdapter = global.TechRaterAdapter;

// ========================================================
//  命令行参数解析
// ========================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    chapter: 1,
    input: null,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--chapter':
      case '-c':
        options.chapter = parseInt(args[++i], 10);
        break;
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  if (!options.input) {
    options.input = path.join(__dirname, '..', 'data', 'chapters', `chapter-${String(options.chapter).padStart(2, '0')}.json`);
  }
  if (!options.output) {
    const ext = path.extname(options.input);
    const base = options.input.slice(0, -ext.length);
    options.output = `${base}-with-3act${ext}`;
  }

  return options;
}

function printHelp() {
  console.log(`
为已有关卡生成 threeAct 元数据

用法:
  node tools/add-threeact-to-levels.js [选项]

选项:
  -c, --chapter <num>     章节号 (默认: 1)
  -i, --input <file>      输入章节 JSON 文件
  -o, --output <file>     输出文件路径 (默认: 输入文件名-with-3act.json)
  -h, --help              显示帮助

示例:
  # 为第1章生成 threeAct
  node tools/add-threeact-to-levels.js --chapter 1

  # 指定输入输出
  node tools/add-threeact-to-levels.js -i data/chapters/chapter-01.json -o output.json
`);
}

// ========================================================
//  关卡类型推断（与 guide.js 保持一致）
// ========================================================

function getLevelType(levelData, isBossLevel) {
  const LEVEL_TYPES = { NOVICE: 'novice', MIDGAME: 'midgame', ENDGAME: 'endgame', BOSS: 'boss' };

  if (!levelData) return LEVEL_TYPES.MIDGAME;

  if (levelData.winCondition && levelData.winCondition.type) {
    const customType = levelData.winCondition.type;
    if (Object.values(LEVEL_TYPES).includes(customType)) {
      return customType;
    }
  }

  if (isBossLevel) return LEVEL_TYPES.BOSS;

  const levelId = parseInt(levelData.levelId) || 0;
  const gridSize = levelData.gridSize || 9;
  const difficultyLevel = levelData.difficultyLevel || _inferDifficultyLevel(levelData);

  if (gridSize <= 4 || (levelId >= 101 && levelId <= 109) || difficultyLevel <= 1) {
    return LEVEL_TYPES.NOVICE;
  }

  if ((levelId >= 501 && levelId <= 706) || difficultyLevel >= 4) {
    return LEVEL_TYPES.ENDGAME;
  }

  return LEVEL_TYPES.MIDGAME;
}

function _inferDifficultyLevel(levelData) {
  const diffStr = levelData.difficulty || '';
  const diffMap = { '入门': 1, '简单': 2, '普通': 3, '困难': 4, '专家': 5, '大师': 5 };
  return diffMap[diffStr] || 3;
}

// ========================================================
//  为单个关卡生成 threeAct
// ========================================================

function generateThreeActForLevel(levelData, isBossLevel) {
  const size = levelData.gridSize || 9;
  const levelType = getLevelType(levelData, isBossLevel);

  // 创建 board
  const board = new Board(size);
  try {
    board.loadLevel({
      cells: levelData.boardData,
      cages: levelData.cages || [],
    });
  } catch (e) {
    console.error(`  [ERROR] 加载关卡失败: ${e.message}`);
    return null;
  }

  // 用 TechRaterAdapter 生成 heatmap
  let adapter;
  try {
    adapter = new TechRaterAdapter(board);
  } catch (e) {
    console.error(`  [ERROR] 创建 TechRaterAdapter 失败: ${e.message}`);
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
    console.error(`  [ERROR] heatmap 格式无效`);
    return null;
  }

  // 从 heatmap 提取 threeAct
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

  return {
    opening: opening,
    breakthrough: breakthrough,
    avalanche: avalanche,
  };
}

// ========================================================
//  主流程
// ========================================================

function main() {
  const options = parseArgs();

  console.log('=== 为已有关卡生成 threeAct 元数据 ===\n');
  console.log(`输入: ${options.input}`);
  console.log(`输出: ${options.output}`);
  console.log('');

  // 读取章节 JSON
  let chapterData;
  try {
    chapterData = JSON.parse(fs.readFileSync(options.input, 'utf-8'));
  } catch (e) {
    console.error(`[ERROR] 读取输入文件失败: ${e.message}`);
    process.exit(1);
  }

  const levels = chapterData.levels || [];
  console.log(`共 ${levels.length} 个关卡\n`);

  let successCount = 0;
  let failCount = 0;

  // 为每个关卡生成 threeAct
  levels.forEach((level, idx) => {
    const levelId = level.levelId || `#${idx + 1}`;
    const isBoss = idx === levels.length - 1; // 最后一关是 Boss 关

    process.stdout.write(`处理关卡 ${levelId} (${idx + 1}/${levels.length})... `);

    const threeAct = generateThreeActForLevel(level, isBoss);

    if (threeAct) {
      level.threeAct = threeAct;
      const emptyCount = (level.boardData || []).reduce(
        (sum, row) => sum + row.filter(v => v === 0).length, 0
      );
      console.log(`✓ simple=${threeAct.opening.length}, gate=${threeAct.breakthrough.length}, core=${threeAct.avalanche.length} (空格=${emptyCount})`);
      successCount++;
    } else {
      console.log(`✗ 失败`);
      failCount++;
    }
  });

  // 写入输出文件
  try {
    fs.writeFileSync(options.output, JSON.stringify(chapterData, null, 2), 'utf-8');
    console.log(`\n✅ 完成: 成功 ${successCount}, 失败 ${failCount}`);
    console.log(`输出文件: ${options.output}`);
  } catch (e) {
    console.error(`[ERROR] 写入输出文件失败: ${e.message}`);
    process.exit(1);
  }
}

main();
