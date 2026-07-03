/**
 * 关卡质量评估（修正版）
 * 1. 500道杀手数独题：唯一解验证 + 人类模拟器难度评级
 * 2. 剧情教学关卡：是否达到教学目标
 */

const fs = require('fs');
const path = require('path');

// 加载人类模拟器
const HumanSimulator = require(path.join(__dirname, '..', 'node-script', 'human-simulator.js')).HumanSimulator;

// 加载回溯求解器（验证唯一解）
const { createSolver } = require(path.join(__dirname, '..', 'crawlers', 'killer-generator.js'));

// ============================================================
// 工具函数
// ============================================================

function loadKillerLevels() {
  const data = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json'),
    'utf-8'
  ));
  return data;
}

function loadTeachingLevels() {
  const files = [
    'teaching-levels-chapter1.json',
    'teaching-levels-ch2-3.json',
    'teaching-levels-ch4-6.json',
  ];
  const all = [];
  for (const f of files) {
    const p = path.join(__dirname, '..', 'game-src', 'data', f);
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      all.push(...data);
    }
  }
  return all;
}

// ============================================================
// 唯一解验证
// ============================================================

function checkUniqueSolution(grid, cages) {
  try {
    const solver = createSolver(cages);
    const result = solver(grid, 2, 8000);
    return {
      unique: result.count === 1,
      solutionCount: result.count,
      timeout: result.timeout,
      solutions: result.solutions
    };
  } catch (e) {
    return { unique: false, solutionCount: -1, error: e.message };
  }
}

// ============================================================
// 人类模拟器评估
// ============================================================

function evaluateWithHumanSim(grid, cages) {
  try {
    const sim = new HumanSimulator(grid, cages);
    const result = sim.solve(500);
    const rating = sim.getDifficultyRating();
    return {
      solvableByHuman: result.complete,
      fillRate: 1 - (rating.emptyCells / 81),
      totalSteps: result.totalSteps,
      techniques: { ...result.techniques },
      difficultyScore: rating.score,
      difficultyLevel: rating.level,
      emptyCells: rating.emptyCells
    };
  } catch (e) {
    return { error: e.message };
  }
}

// ============================================================
// 评估 500 道杀手题
// ============================================================

function evaluateKillerLevels(sampleSize = 30) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 杀手数独题库质量评估');
  console.log('='.repeat(70));

  const levels = loadKillerLevels();
  console.log(`\n总题量: ${levels.length} 道`);

  // 按难度分组
  const byDiff = {};
  for (const lv of levels) {
    const d = lv.difficulty || '未知';
    if (!byDiff[d]) byDiff[d] = [];
    byDiff[d].push(lv);
  }
  console.log('\n难度分布:');
  for (const d of Object.keys(byDiff)) {
    console.log(`  ${d}: ${byDiff[d].length} 道`);
  }

  console.log(`\n抽样评估: 每个难度抽 ${sampleSize} 道`);
  console.log('-'.repeat(70));

  const allResults = [];

  for (const diff of Object.keys(byDiff)) {
    const group = byDiff[diff];
    const sample = group.slice(0, Math.min(sampleSize, group.length));

    console.log(`\n【${diff}】(${sample.length}/${group.length} 道)`);

    let uniqueCount = 0;
    let multiSolCount = 0;
    let humanSolvable = 0;
    let avgScore = 0;
    let scoreDistribution = { '简单': 0, '中等': 0, '困难': 0, '未完成': 0 };
    let techTotals = { nakedSingle: 0, hiddenSingle: 0, rule45: 0, elimination: 0 };
    let knownCount = 0;
    let errors = [];

    for (let i = 0; i < sample.length; i++) {
      const lv = sample[i];
      const grid = lv.cells.map(row => row.slice());
      const cages = lv.cages.map((c, idx) => ({
        id: c.id !== undefined ? c.id : idx,
        sum: c.sum,
        cells: c.cells.map(([r, c]) => [r, c])
      }));

      knownCount += grid.flat().filter(n => n > 0).length;

      // 1. 唯一解验证
      const uniqueCheck = checkUniqueSolution(grid, cages);
      if (uniqueCheck.unique) uniqueCount++;
      else if (uniqueCheck.solutionCount > 1) multiSolCount++;
      else if (uniqueCheck.error) errors.push({ id: lv.id, error: uniqueCheck.error });

      // 2. 人类模拟器评估
      const evalResult = evaluateWithHumanSim(grid, cages);
      if (!evalResult.error) {
        if (evalResult.solvableByHuman) humanSolvable++;
        avgScore += evalResult.difficultyScore;
        const lvl = evalResult.solvableByHuman ? evalResult.difficultyLevel : '未完成';
        scoreDistribution[lvl] = (scoreDistribution[lvl] || 0) + 1;
        techTotals.nakedSingle += evalResult.techniques.nakedSingle;
        techTotals.hiddenSingle += evalResult.techniques.hiddenSingle;
        techTotals.rule45 += evalResult.techniques.rule45;
        techTotals.elimination += evalResult.techniques.elimination;
      } else {
        errors.push({ id: lv.id, error: evalResult.error });
      }

      allResults.push({
        id: lv.id,
        name: lv.name,
        difficulty: diff,
        unique: uniqueCheck.unique,
        solCount: uniqueCheck.solutionCount,
        ...evalResult
      });

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`  进度: ${i + 1}/${sample.length}\r`);
      }
    }

    const n = sample.length;
    console.log(`\n  唯一解率: ${uniqueCount}/${n} (${(uniqueCount/n*100).toFixed(1)}%)`);
    if (multiSolCount > 0) console.log(`  多解题: ${multiSolCount} 道`);
    console.log(`  人类可解率: ${humanSolvable}/${n} (${(humanSolvable/n*100).toFixed(1)}%)`);
    console.log(`  平均已知数: ${Math.round(knownCount/n)} 格`);
    console.log(`  平均难度分: ${(avgScore/n).toFixed(1)}`);
    console.log(`  难度分布: 简单=${scoreDistribution['简单']} 中等=${scoreDistribution['中等']} 困难=${scoreDistribution['困难']} 未完成=${scoreDistribution['未完成']}`);
    console.log(`  平均技巧用量: 裸单=${(techTotals.nakedSingle/n).toFixed(1)} 隐单=${(techTotals.hiddenSingle/n).toFixed(1)} 45法则=${(techTotals.rule45/n).toFixed(1)} 摒除=${(techTotals.elimination/n).toFixed(0)}轮`);
    if (errors.length > 0) {
      console.log(`  ⚠️ 错误: ${errors.length} 道`);
      errors.slice(0, 3).forEach(e => console.log(`    #${e.id}: ${e.error}`));
    }
  }

  return allResults;
}

// ============================================================
// 评估剧情教学关卡
// ============================================================

function evaluateTeachingLevels() {
  console.log('\n\n' + '='.repeat(70));
  console.log('📚 剧情教学关卡质量评估');
  console.log('='.repeat(70));

  const levels = loadTeachingLevels();
  console.log(`\n教学关卡总数: ${levels.length} 关`);

  // 按章节分组
  const byChapter = {};
  for (const lv of levels) {
    const ch = lv.chapter || (lv.id >= 600 ? 6 : lv.id >= 500 ? 5 : lv.id >= 400 ? 4 : lv.id >= 300 ? 3 : lv.id >= 200 ? 2 : lv.id >= 100 ? 1 : 0);
    if (!byChapter[ch]) byChapter[ch] = [];
    byChapter[ch].push(lv);
  }

  console.log('\n章节分布:');
  for (const ch of Object.keys(byChapter).sort((a,b)=>a-b)) {
    console.log(`  第${ch}章: ${byChapter[ch].length} 关`);
  }

  console.log('\n逐关评估:');
  console.log('-'.repeat(70));

  const allResults = [];
  let totalUnique = 0;
  let totalSolvable = 0;
  let total9x9 = 0;

  for (const ch of Object.keys(byChapter).sort((a,b)=>a-b)) {
    const chapterLevels = byChapter[ch];
    console.log(`\n【第${ch}章】(${chapterLevels.length}关)`);

    let chUnique = 0;
    let chSolvable = 0;
    let ch9 = 0;

    for (const lv of chapterLevels) {
      // 处理不同格式
      let grid, cages;
      if (lv.cells && lv.cages) {
        grid = lv.cells.map(row => row.slice());
        cages = lv.cages;
      } else if (lv.board && lv.cages) {
        grid = lv.board.map(row => row.slice());
        cages = lv.cages;
      } else {
        console.log(`  ⚠️ #${lv.id} 格式不支持，跳过`);
        allResults.push({ id: lv.id, name: lv.name, error: '格式不支持' });
        continue;
      }

      const size = grid.length;
      const known = grid.flat().filter(n => n > 0).length;

      // 归一化笼子格式
      const normCages = cages.map((c, i) => ({
        id: c.id !== undefined ? c.id : i,
        sum: c.sum,
        cells: c.cells.map(([r, c]) => [r, c])
      }));

      // 唯一解验证（只9x9）
      let uniqueCheck = { unique: true };
      if (size === 9) {
        ch9++;
        total9x9++;
        uniqueCheck = checkUniqueSolution(grid, normCages);
        if (uniqueCheck.unique) { chUnique++; totalUnique++; }
      }

      // 人类模拟器（只9x9）
      let evalResult = { solvableByHuman: true, difficultyScore: 0, difficultyLevel: '入门', techniques: {} };
      if (size === 9) {
        evalResult = evaluateWithHumanSim(grid, normCages);
        if (evalResult.solvableByHuman) { chSolvable++; totalSolvable++; }
      }

      const techInfo = size === 9 && !evalResult.error
        ? `裸单${evalResult.techniques.nakedSingle} 隐单${evalResult.techniques.hiddenSingle} 45法${evalResult.techniques.rule45}`
        : `(${size}x${size})`;

      const uniqueStatus = size === 9 ? (uniqueCheck.unique ? '✅' : '❌多解') : '➖';
      const solStatus = size === 9 ? (evalResult.solvableByHuman ? '可解' : '卡壳') : '';
      const scoreInfo = size === 9 ? `${evalResult.difficultyScore}分(${evalResult.difficultyLevel})` : '';

      console.log(`  ${uniqueStatus} #${lv.id} ${lv.name || ''} ${solStatus} ${scoreInfo} ${techInfo}`);

      allResults.push({
        id: lv.id,
        name: lv.name,
        chapter: ch,
        size,
        known,
        unique: uniqueCheck.unique,
        ...evalResult
      });
    }

    if (ch9 > 0) {
      console.log(`  小结: 唯一解 ${chUnique}/${ch9} (${(chUnique/ch9*100).toFixed(0)}%), 人类可解 ${chSolvable}/${ch9} (${(chSolvable/ch9*100).toFixed(0)}%)`);
    }
  }

  console.log(`\n【9x9关卡总结】共 ${total9x9} 道`);
  console.log(`  唯一解率: ${total9x9 > 0 ? (totalUnique/total9x9*100).toFixed(1) : 'N/A'}%`);
  console.log(`  人类可解率: ${total9x9 > 0 ? (totalSolvable/total9x9*100).toFixed(1) : 'N/A'}%`);

  return allResults;
}

// ============================================================
// 主程序
// ============================================================

console.log('🧩 笼中密码 - 关卡质量全面评估');
console.log('='.repeat(70));

const t0 = Date.now();

// 1. 杀手题库评估
const killerResults = evaluateKillerLevels(30);

// 2. 教学关卡评估
const teachingResults = evaluateTeachingLevels();

// 3. 总评
console.log('\n\n' + '='.repeat(70));
console.log('🏆 总评');
console.log('='.repeat(70));

const killerValid = killerResults.filter(r => !r.error);
const killerUnique = killerValid.filter(r => r.unique).length;
const killerSolvable = killerValid.filter(r => r.solvableByHuman).length;

console.log(`\n【杀手数独题库】(抽样 ${killerValid.length} 道)`);
console.log(`  唯一解率: ${(killerUnique/killerValid.length*100).toFixed(1)}%`);
console.log(`  人类可解率: ${(killerSolvable/killerValid.length*100).toFixed(1)}%`);

const teach9 = teachingResults.filter(r => r.size === 9 && !r.error);
const teachUnique = teach9.filter(r => r.unique).length;
const teachSolvable = teach9.filter(r => r.solvableByHuman).length;

console.log(`\n【教学关卡】(9x9 共 ${teach9.length} 道)`);
console.log(`  唯一解率: ${teach9.length > 0 ? (teachUnique/teach9.length*100).toFixed(1) : 'N/A'}%`);
console.log(`  人类可解率: ${teach9.length > 0 ? (teachSolvable/teach9.length*100).toFixed(1) : 'N/A'}%`);

console.log(`\n⏱️ 评估耗时: ${((Date.now()-t0)/1000).toFixed(1)}s`);
console.log('='.repeat(70));
