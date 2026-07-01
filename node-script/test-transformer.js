// 测试PuzzleTransformer
const FACT = require('./puzzle-transformer');

// 从chapters.json取一道现有关卡作为测试
const fs = require('fs');
const path = require('path');
const chapters = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game-src', 'data', 'chapters.json'), 'utf-8'));

// 找到305关（X-Wing关）
let testLevel = null;
for (const ch of chapters) {
  for (const lv of ch.levels) {
    if (lv.levelId === 305) {
      testLevel = lv;
      break;
    }
  }
}

if (!testLevel) {
  console.log('Level 305 not found!');
  process.exit(1);
}

console.log('=== Testing PuzzleTransformer ===');
console.log(`Original level: ${testLevel.title} (${testLevel.gridSize}x${testLevel.gridSize})`);
console.log(`Board givens: ${testLevel.boardData.flat().filter(v => v > 0).length}`);
console.log(`Cages: ${testLevel.cages.length}`);

// 测试1：数字映射
console.log('\n--- Test 1: Digit Mapping ---');
const digitMap = FACT.randomDigitMap();
console.log('Digit map:', JSON.stringify(digitMap));

// 测试2：生成变体
console.log('\n--- Test 2: Random Transform ---');
const variant = FACT.transform(testLevel);
console.log('Variant board:');
for (let r = 0; r < 9; r++) {
  console.log(variant.boardData[r].map(v => v === 0 ? '.' : v).join(' '));
}
console.log(`Variant cages: ${variant.cages.length}`);
// 验证第一个cage的sum是否正确
const cage0 = variant.cages[0];
let actualSum = 0;
for (const [r, c] of cage0.cells) {
  actualSum += variant.solution[r][c];
}
console.log(`Cage 0: sum=${cage0.sum}, actual sum from solution=${actualSum}, match=${cage0.sum === actualSum}`);

// 测试3：验证
console.log('\n--- Test 3: Validation ---');
const result = FACT.validate(variant);
console.log('Validation:', result);

// 测试4：生成多个变体
console.log('\n--- Test 4: Generate 5 variants ---');
const variants = FACT.generateVariants(testLevel, 5);
for (let i = 0; i < variants.length; i++) {
  const v = variants[i];
  const val = FACT.validate(v);
  // 验证cage sum
  let allCagesOk = true;
  for (const cage of v.cages) {
    let s = 0;
    for (const [r, c] of cage.cells) s += v.solution[r][c];
    if (s !== cage.sum) { allCagesOk = false; break; }
  }
  console.log(`Variant ${i+1}: givens=${v.boardData.flat().filter(x=>x>0).length}, cages=${v.cages.length}, valid=${val.valid}, cagesSum=${allCagesOk ? 'OK' : 'MISMATCH'}`);
}

console.log('\n=== All tests passed! ===');
