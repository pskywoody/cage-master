// ==========================================
//  按"最低必要技巧"分类题库
// ==========================================
// 基于 maxTechLevel（求解器必须用到的最高级技巧 = 最低必要技巧）
// 输出：按最低必要技巧分组的题库，每个技巧内再分难度等级

const fs = require('fs');
const path = require('path');

const v6Dir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'v6');
const outDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'by-min-tech');

// 技巧定义（按等级从低到高）
const TECHNIQUES = {
  1: {
    id: 'nakedSingle',
    name: '裸单',
    nameEn: 'Naked Single',
    description: '某格只有一个候选数，直接确定答案',
    difficulty: '入门',
    color: '#22c55e',
  },
  2: {
    id: 'cageUnique',
    name: '笼子唯一组合',
    nameEn: 'Cage Unique Combination',
    description: '笼子内某数字只能出现在一个位置',
    difficulty: '入门+',
    color: '#10b981',
  },
  3: {
    id: 'hiddenSingle',
    name: '隐单',
    nameEn: 'Hidden Single',
    description: '某数字在一行/列/宫中只能出现在一格',
    difficulty: '简单',
    color: '#3b82f6',
  },
  4: {
    id: 'rule45',
    name: '45法则',
    nameEn: 'Rule of 45',
    description: '利用行/列/宫总和为45推导单格数值',
    difficulty: '中等',
    color: '#8b5cf6',
  },
  5: {
    id: 'nakedPair',
    name: '显性数对',
    nameEn: 'Naked Pair',
    description: '两格有相同双候选，排除同区其他格的这两个数',
    difficulty: '困难',
    color: '#f59e0b',
  },
  6: {
    id: 'hiddenPair',
    name: '隐性数对',
    nameEn: 'Hidden Pair',
    description: '两数字只能出现在相同两格，排除这两格其他候选',
    difficulty: '困难+',
    color: '#ef4444',
  },
  7: {
    id: 'pointingClaiming',
    name: '区块排除',
    nameEn: 'Pointing / Claiming',
    description: '行列区块/宫区块摒除',
    difficulty: '专家',
    color: '#dc2626',
  },
  8: {
    id: 'nakedTriplet',
    name: '三链数',
    nameEn: 'Naked Triplet',
    description: '三格包含相同三候选，排除同区其他格',
    difficulty: '专家+',
    color: '#991b1b',
  },
  9: {
    id: 'xWing',
    name: 'X-Wing',
    nameEn: 'X-Wing',
    description: 'X翼构型，高级排除技巧',
    difficulty: '大师',
    color: '#7c2d12',
  },
};

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║        按「最低必要技巧」分类题库                          ║');
console.log('║  原理：求解器从最低技巧开始尝试，maxTechLevel 就是门槛       ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

// 加载所有 V6 纯杀手题库
const v6Files = [
  'killer-pure-1star.json',
  'killer-pure-2star.json',
  'killer-pure-3star.json',
  'killer-pure-4star.json',
  'killer-pure-5star.json',
];

const allPuzzles = [];

console.log('【1/5】加载 V6 题库...');
for (const file of v6Files) {
  const filePath = path.join(v6Dir, file);
  if (!fs.existsSync(filePath)) continue;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  allPuzzles.push(...(data.puzzles || []));
}
console.log('   总计: ' + allPuzzles.length + ' 道纯杀手题\n');

// 按 maxTechLevel 分组（最低必要技巧）
console.log('【2/5】按最低必要技巧分组...');

const byTechLevel = {};
for (let i = 1; i <= 9; i++) byTechLevel[i] = [];

let noLevelCount = 0;

for (const p of allPuzzles) {
  const level = p.maxTechLevel;
  if (level && level >= 1 && level <= 9) {
    byTechLevel[level].push(p);
  } else {
    noLevelCount++;
  }
}

// 打印分布
console.log('');
console.log('  最低必要技巧分布:');
console.log('  ' + '─'.repeat(60));
console.log('  等级  技巧名称           题数    占比     难度区间');
console.log('  ' + '─'.repeat(60));

for (let level = 1; level <= 9; level++) {
  const tech = TECHNIQUES[level];
  const puzzles = byTechLevel[level];
  const pct = (puzzles.length / allPuzzles.length * 100).toFixed(1);
  
  // 计算难度区间
  let minScore = Infinity, maxScore = -Infinity;
  let minStar = 99, maxStar = 0;
  for (const p of puzzles) {
    const s = p.difficultyScore || 0;
    if (s < minScore) minScore = s;
    if (s > maxScore) maxScore = s;
    if (p.difficulty) {
      const starNum = parseInt(p.difficulty);
      if (starNum && starNum < minStar) minStar = starNum;
      if (starNum && starNum > maxStar) maxStar = starNum;
    }
  }
  
  const levelStr = ('L' + level).padEnd(4, ' ');
  const nameStr = tech.name.padEnd(14, ' ');
  const countStr = String(puzzles.length).padStart(5, ' ');
  const pctStr = (pct + '%').padStart(6, ' ');
  const diffStr = puzzles.length > 0 
    ? (minStar + '~' + maxStar + '星 / ' + Math.round(minScore) + '~' + Math.round(maxScore) + '分')
    : '-';
  
  console.log('  ' + levelStr + nameStr + countStr + '  ' + pctStr + '  ' + diffStr);
}

console.log('  ' + '─'.repeat(60));
if (noLevelCount > 0) {
  console.log('  无等级标记: ' + noLevelCount + ' 道');
}

// 每个技巧内再按难度分三档：入门/进阶/挑战
console.log('\n【3/5】每个技巧内分难度等级（入门/进阶/挑战）...');

const result = {
  generatedAt: new Date().toISOString(),
  source: 'v6-pure-killer',
  totalPuzzles: allPuzzles.length,
  description: '按「最低必要技巧」分类。maxTechLevel 就是这道题的门槛技巧——不用到这个等级的技巧就解不出来。',
  techniques: {},
};

for (let level = 1; level <= 9; level++) {
  const tech = TECHNIQUES[level];
  const puzzles = byTechLevel[level];
  
  if (puzzles.length === 0) {
    result.techniques[tech.id] = {
      level: level,
      ...tech,
      count: 0,
      levels: { 入门: [], 进阶: [], 挑战: [] },
    };
    continue;
  }
  
  // 按 difficultyScore 排序
  const sorted = [...puzzles].sort((a, b) => 
    (a.difficultyScore || 0) - (b.difficultyScore || 0)
  );
  
  const len = sorted.length;
  const third = Math.ceil(len / 3);
  
  const easy = sorted.slice(0, third);
  const medium = sorted.slice(third, third * 2);
  const hard = sorted.slice(third * 2);
  
  // 精简输出字段（减小体积）
  const compact = (arr) => arr.map(p => ({
    id: p.id,
    source: p.source,
    difficulty: p.difficulty,
    difficultyScore: p.difficultyScore,
    maxTechLevel: p.maxTechLevel,
    totalSteps: p.totalSteps,
    nonTrivialRatio: p.nonTrivialRatio,
    techCount: p.techCount,
    boardData: p.boardData,
    cages: p.cages,
    solution: p.solution,
  }));
  
  result.techniques[tech.id] = {
    level: level,
    ...tech,
    count: puzzles.length,
    difficultyRange: {
      minScore: Math.round(sorted[0].difficultyScore || 0),
      maxScore: Math.round(sorted[sorted.length - 1].difficultyScore || 0),
    },
    levels: {
      入门: {
        count: easy.length,
        scoreRange: [Math.round(easy[0]?.difficultyScore || 0), Math.round(easy[easy.length-1]?.difficultyScore || 0)],
        puzzles: compact(easy),
      },
      进阶: {
        count: medium.length,
        scoreRange: [Math.round(medium[0]?.difficultyScore || 0), Math.round(medium[medium.length-1]?.difficultyScore || 0)],
        puzzles: compact(medium),
      },
      挑战: {
        count: hard.length,
        scoreRange: [Math.round(hard[0]?.difficultyScore || 0), Math.round(hard[hard.length-1]?.difficultyScore || 0)],
        puzzles: compact(hard),
      },
    },
  };
  
  console.log('  ' + tech.name + ': ' + puzzles.length + ' 道' +
    '（入门' + easy.length + '/进阶' + medium.length + '/挑战' + hard.length + '）');
}

// 保存总文件
console.log('\n【4/5】保存分类结果...');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 保存完整数据（大文件）
const fullFile = path.join(outDir, 'full-index.json');
fs.writeFileSync(fullFile, JSON.stringify(result, null, 2));
console.log('   ✓ 完整索引 → full-index.json (' + 
  (Math.round(fs.statSync(fullFile).size / 1024 / 1024 * 10) / 10) + ' MB)');

// 保存每个技巧的单独文件（方便按需加载）
let totalSize = 0;
for (const [techId, techData] of Object.entries(result.techniques)) {
  if (techData.count === 0) continue;
  
  const techFile = path.join(outDir, techId + '.json');
  fs.writeFileSync(techFile, JSON.stringify({
    technique: techId,
    level: techData.level,
    name: techData.name,
    nameEn: techData.nameEn,
    description: techData.description,
    difficulty: techData.difficulty,
    count: techData.count,
    difficultyRange: techData.difficultyRange,
    levels: techData.levels,
  }, null, 2));
  
  const size = fs.statSync(techFile).size;
  totalSize += size;
  console.log('   ✓ ' + techData.name + ' → ' + techId + '.json (' + 
    (Math.round(size / 1024) + ' KB)'));
}

// 保存轻量索引（不含题目数据，只有元数据，供前端展示用）
console.log('\n【5/5】生成轻量索引...');

const lightIndex = {
  generatedAt: result.generatedAt,
  source: result.source,
  totalPuzzles: result.totalPuzzles,
  description: result.description,
  techniques: {},
};

for (const [techId, techData] of Object.entries(result.techniques)) {
  lightIndex.techniques[techId] = {
    level: techData.level,
    name: techData.name,
    nameEn: techData.nameEn,
    description: techData.description,
    difficulty: techData.difficulty,
    color: techData.color,
    count: techData.count,
    difficultyRange: techData.difficultyRange,
    levels: {
      入门: { count: techData.levels.入门.count, scoreRange: techData.levels.入门.scoreRange },
      进阶: { count: techData.levels.进阶.count, scoreRange: techData.levels.进阶.scoreRange },
      挑战: { count: techData.levels.挑战.count, scoreRange: techData.levels.挑战.scoreRange },
    },
    file: techId + '.json',
  };
}

const lightFile = path.join(outDir, 'index.json');
fs.writeFileSync(lightFile, JSON.stringify(lightIndex, null, 2));
console.log('   ✓ 轻量索引 → index.json (' + Math.round(fs.statSync(lightFile).size / 1024) + ' KB)');

// 总结
const availableTechs = Object.values(result.techniques).filter(t => t.count > 0).length;
const totalPuzzlesWithLevel = Object.values(result.techniques).reduce((sum, t) => sum + t.count, 0);

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  完成！                                                  ║');
console.log('║  有题技巧: ' + availableTech + '/9                                ║');
console.log('║ 分类题数: ' + String(totalPuzzlesWithLevel).padEnd(5, ' ') + ' / ' + allPuzzles.length + ' 道                ║');
console.log('║ 输出目录: by-min-tech/                                  ║');
console.log('╚══════════════════════════════════════════════════════════╝');
