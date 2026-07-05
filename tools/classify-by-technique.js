// ==========================================
//  按技巧分类整理题库
// ==========================================
// 从 V6 题库中按技巧维度筛选，生成技巧专项题集
// 输出：game-src/data/puzzles/by-technique/

const fs = require('fs');
const path = require('path');

const v6Dir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'v6');
const outDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'by-technique');

// 技巧定义（中文名称 + 描述）
const TECHNIQUES = {
  nakedSingle: {
    name: '裸单',
    nameEn: 'Naked Single',
    level: 1,
    description: '某格只有一个候选数，直接确定答案',
    difficulty: '入门',
  },
  cageUnique: {
    name: '笼子唯一组合',
    nameEn: 'Cage Unique Combination',
    level: 2,
    description: '笼子内某数字只能出现在一个格子',
    difficulty: '入门',
  },
  hiddenSingle: {
    name: '隐单',
    nameEn: 'Hidden Single',
    level: 3,
    description: '某数字在某行/列/宫只能出现在一个格子',
    difficulty: '简单',
  },
  rule45: {
    name: '45法则',
    nameEn: 'Rule of 45',
    level: 4,
    description: '利用行/列/宫总和为45推导单格数值（Innie/Outie）',
    difficulty: '中等',
  },
  nakedPair: {
    name: '显性数对',
    nameEn: 'Naked Pair',
    level: 5,
    description: '两格有相同的两个候选数，可排除同区其他格的这两个数',
    difficulty: '困难',
  },
  hiddenPair: {
    name: '隐性数对',
    nameEn: 'Hidden Pair',
    level: 6,
    description: '某两个数字只能出现在相同的两格，可排除这两格的其他候选',
    difficulty: '困难',
  },
  pointingClaiming: {
    name: '区块排除',
    nameEn: 'Pointing / Claiming',
    level: 7,
    description: '行列区块/宫区块摒除',
    difficulty: '困难',
  },
  nakedTriplet: {
    name: '三链数',
    nameEn: 'Naked Triplet',
    level: 8,
    description: '三格包含相同的三个候选数，可排除同区其他格',
    difficulty: '专家',
  },
  xWing: {
    name: 'X-Wing',
    nameEn: 'X-Wing',
    level: 9,
    description: 'X翼构型，两行/列中某数字只出现在相同两列/行',
    difficulty: '专家',
  },
};

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║           按技巧分类整理题库                              ║');
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

console.log('【第1步】加载 V6 题库...');
for (const file of v6Files) {
  const filePath = path.join(v6Dir, file);
  if (!fs.existsSync(filePath)) {
    console.log('  ⚠ 跳过不存在的文件: ' + file);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const puzzles = data.puzzles || [];
  allPuzzles.push(...puzzles);
  console.log('  ✓ ' + file + ': ' + puzzles.length + ' 道');
}
console.log('  总计: ' + allPuzzles.length + ' 道');

// 按技巧分类
console.log('\n【第2步】按技巧分类...');

const techniquePuzzles = {};
for (const tech of Object.keys(TECHNIQUES)) {
  techniquePuzzles[tech] = [];
}

let hasTechCount = 0;

for (const puzzle of allPuzzles) {
  if (!puzzle.techCount) continue;
  hasTechCount++;
  
  for (const tech of Object.keys(TECHNIQUES)) {
    if (puzzle.techCount[tech] && puzzle.techCount[tech] > 0) {
      techniquePuzzles[tech].push(puzzle);
    }
  }
}

console.log('  有 techCount 字段的题目: ' + hasTechCount + ' 道');
console.log('');

// 统计各技巧分布
console.log('【第3步】技巧分布统计:');
console.log('');
console.log('  技巧名称          题数    占比    最高技巧题数*');
console.log('  ' + '─'.repeat(55));

for (const [techId, techInfo] of Object.entries(TECHNIQUES)) {
  const count = techniquePuzzles[techId].length;
  const pct = (count / allPuzzles.length * 100).toFixed(1);
  
  // 统计"最高技巧就是这个"的题数（即这道题的瓶颈就是这个技巧）
  // maxTechLevel 对应等级
  const maxLevelCount = techniquePuzzles[techId].filter(p => p.maxTechLevel === techInfo.level).length;
  
  const name = techInfo.name.padEnd(12, ' ');
  const countStr = String(count).padStart(5, ' ');
  const pctStr = (pct + '%').padStart(6, ' ');
  const maxStr = String(maxLevelCount).padStart(6, ' ');
  
  console.log('  ' + name + countStr + '  ' + pctStr + '  ' + maxStr);
}

console.log('');
console.log('  *最高技巧题数：这道题的最难技巧就是该技巧（即"门槛"就是这个技巧）');

// 按难度细分各技巧的题目
console.log('\n【第4步】各技巧按难度细分:');
console.log('');

for (const [techId, techInfo] of Object.entries(TECHNIQUES)) {
  const puzzles = techniquePuzzles[techId];
  if (puzzles.length === 0) continue;
  
  const byDiff = { '1星': 0, '2星': 0, '3星': 0, '4星': 0, '5星': 0 };
  for (const p of puzzles) {
    const d = p.difficulty || '未知';
    if (byDiff[d] !== undefined) byDiff[d]++;
  }
  
  console.log('  ' + techInfo.name + ':');
  console.log('    1星:' + byDiff['1星'] + '  2星:' + byDiff['2星'] + 
              '  3星:' + byDiff['3星'] + '  4星:' + byDiff['4星'] + 
              '  5星:' + byDiff['5星']);
}

// 保存分类结果
console.log('\n【第5步】保存技巧专项题集...');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. 总览文件
const overview = {
  generatedAt: new Date().toISOString(),
  source: 'v6-pure-killer',
  totalPuzzles: allPuzzles.length,
  techniques: {},
};

for (const [techId, techInfo] of Object.entries(TECHNIQUES)) {
  const puzzles = techniquePuzzles[techId];
  
  // 只保存有题的技巧
  if (puzzles.length === 0) {
    overview.techniques[techId] = {
      ...techInfo,
      count: 0,
    };
    continue;
  }
  
  // 按 maxTechLevel 排序（"刚好"需要这个技巧的排在前面）
  const sorted = [...puzzles].sort((a, b) => {
    const aIsMax = a.maxTechLevel === techInfo.level ? 0 : 1;
    const bIsMax = b.maxTechLevel === techInfo.level ? 0 : 1;
    if (aIsMax !== bIsMax) return aIsMax - bIsMax;
    return (a.difficultyScore || 0) - (b.difficultyScore || 0);
  });
  
  // 保存精简版（去掉solution，减小体积）
  const compact = sorted.map(p => ({
    id: p.id,
    source: p.source,
    difficulty: p.difficulty,
    difficultyScore: p.difficultyScore,
    maxTechLevel: p.maxTechLevel,
    techCount: p.techCount,
    boardData: p.boardData,
    cages: p.cages,
    solution: p.solution,
  }));
  
  const outFile = path.join(outDir, 'technique-' + techId + '.json');
  fs.writeFileSync(outFile, JSON.stringify({
    technique: techId,
    ...techInfo,
    count: compact.length,
    puzzles: compact,
  }, null, 2));
  
  console.log('  ✓ ' + techInfo.name + ': ' + compact.length + ' 道 → technique-' + techId + '.json');
  
  overview.techniques[techId] = {
    ...techInfo,
    count: compact.length,
    file: 'technique-' + techId + '.json',
  };
}

// 保存总览
const overviewFile = path.join(outDir, 'overview.json');
fs.writeFileSync(overviewFile, JSON.stringify(overview, null, 2));
console.log('  ✓ 总览文件 → overview.json');

// 2. 生成"技巧分级练习"题集（每个技巧3个难度等级，每级20题）
console.log('\n【第6步】生成技巧分级练习题集...');

const practicePacks = {};

for (const [techId, techInfo] of Object.entries(TECHNIQUES)) {
  const puzzles = techniquePuzzles[techId];
  if (puzzles.length === 0) continue;
  
  // 找"最高技巧就是这个技巧"的题（这些题最适合专项练习）
  const corePuzzles = puzzles.filter(p => p.maxTechLevel === techInfo.level);
  
  if (corePuzzles.length === 0) continue;
  
  // 按难度分三档：入门（该技巧最简单的题）、进阶、挑战
  const sorted = [...corePuzzles].sort((a, b) => 
    (a.difficultyScore || 0) - (b.difficultyScore || 0)
  );
  
  const len = sorted.length;
  const easy = sorted.slice(0, Math.ceil(len / 3));
  const medium = sorted.slice(Math.ceil(len / 3), Math.ceil(len * 2 / 3));
  const hard = sorted.slice(Math.ceil(len * 2 / 3));
  
  // 每级取 20 题（如果有的话）
  const pick = (arr, n) => {
    if (arr.length <= n) return arr;
    // 均匀抽取
    const result = [];
    const step = arr.length / n;
    for (let i = 0; i < n; i++) {
      result.push(arr[Math.floor(i * step)]);
    }
    return result;
  };
  
  practicePacks[techId] = {
    ...techInfo,
    levels: {
      入门: pick(easy, 20).map(p => p.id),
      进阶: pick(medium, 20).map(p => p.id),
      挑战: pick(hard, 20).map(p => p.id),
    },
    total: Math.min(len, 60),
  };
}

const practiceFile = path.join(outDir, 'practice-packs.json');
fs.writeFileSync(practiceFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  description: '技巧分级练习题集，每个技巧分入门/进阶/挑战三档，每档约20题',
  techniques: practicePacks,
}, null, 2));
console.log('  ✓ 分级练习题集 → practice-packs.json');

// 统计
let availableCount = 0;
for (const tech of Object.keys(TECHNIQUES)) {
  if (techniquePuzzles[tech].length > 0) availableCount++;
}

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  完成！共 ' + availableCount + '/' + Object.keys(TECHNIQUES).length + ' 个技巧有可用题目');
console.log('║  输出目录: ' + outDir);
console.log('╚══════════════════════════════════════════════════════════╝');
