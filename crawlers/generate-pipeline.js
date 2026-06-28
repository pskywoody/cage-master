// ==========================================
// Puzzle Generation Pipeline
// 从种子题批量生成变体，整合到游戏关卡库
// ==========================================

const fs = require('fs');
const path = require('path');
const Transformer = require('./puzzle-transformer-node');
const { saveJson, loadJson, isValidSudoku } = require('./lib');

const SEEDS_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
const OUT_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'generated');

/**
 * 验证一个变体题目的合法性
 */
function validateVariant(v, sourceSeed) {
  // 1. 验证solution是合法数独
  if (!v.solution) return false;
  if (!isValidSudoku(v.solution)) return false;
  
  // 2. 验证boardData非零格与solution一致
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (v.boardData[r][c] !== 0 && v.boardData[r][c] !== v.solution[r][c]) {
        return false;
      }
    }
  }
  
  // 3. 验证cage和
  if (v.cages) {
    for (const cage of v.cages) {
      const actual = cage.cells.reduce((s, [r, c]) => s + v.solution[r][c], 0);
      if (actual !== cage.sum) return false;
    }
  }
  
  return true;
}

/**
 * 处理单个种子文件，生成变体
 */
function processSeedFile(filepath, variantsPerSeed = 20) {
  const data = loadJson(filepath);
  const filename = path.basename(filepath, '.json');
  console.log(`\nProcessing: ${filename} (${data.count || data.puzzles?.length || 0} seeds)`);
  
  const allVariants = [];
  
  const puzzles = data.puzzles || (Array.isArray(data) ? data : [data]);
  const validSeeds = puzzles.filter(p => p.solution && p.cages && p.cages.length >= 5);
  
  console.log(`  Valid seeds (with solution + ≥5 cages): ${validSeeds.length}/${puzzles.length}`);
  
  for (const seed of validSeeds) {
    const boxH = seed.gridSize === 9 ? 3 : seed.gridSize === 6 ? 2 : 2;
    const boxW = seed.gridSize === 9 ? 3 : seed.gridSize === 6 ? 3 : 2;
    
    const variants = Transformer.generateVariants(seed, variantsPerSeed, { boxH, boxW });
    
    let validCount = 0;
    for (const v of variants) {
      if (validateVariant(v, seed)) {
        allVariants.push({
          id: `${seed.id}_v${validCount}`,
          sourceSeedId: seed.id,
          source: seed.source || data.source,
          title: seed.title,
          author: seed.author,
          difficulty: seed.difficulty || 2,
          gridSize: v.gridSize,
          boardData: v.boardData,
          solution: v.solution,
          cages: v.cages,
          givenCount: v.boardData.flat().filter(x => x !== 0).length,
          cageCount: v.cages.length
        });
        validCount++;
      }
    }
    console.log(`  "${seed.title.substring(0, 25)}": ${validCount}/${variants.length} valid variants`);
  }
  
  return {
    source: data.source,
    type: data.type || 'killer-sudoku',
    seedFile: filename,
    seedCount: validSeeds.length,
    variantCount: allVariants.length,
    generatedAt: new Date().toISOString(),
    puzzles: allVariants
  };
}

/**
 * 也处理handcrafted经典数独种子（无cages）
 */
function processClassicSeeds(filepath, variantsPerSeed = 10) {
  const data = loadJson(filepath);
  const filename = path.basename(filepath, '.json');
  console.log(`\nProcessing classic: ${filename}`);
  
  const allVariants = [];
  const puzzles = data.puzzles || [];
  const validSeeds = puzzles.filter(p => p.solution);
  
  for (const seed of validSeeds) {
    if (!seed.boardData || !seed.solution) continue;
    // 验证seed本身
    if (!isValidSudoku(seed.solution)) continue;
    
    // 检查givenCount是否合理（不能太少也不能太多）
    const givens = seed.boardData.flat().filter(x => x !== 0).length;
    if (givens < 17) continue; // 数独最少需要17个已知数才有唯一解
    
    const variants = Transformer.generateVariants(seed, variantsPerSeed);
    
    let validCount = 0;
    for (const v of variants) {
      if (validateVariant(v, seed)) {
        allVariants.push({
          id: `${seed.id}_v${validCount}`,
          sourceSeedId: seed.id,
          source: seed.source || data.source,
          technique: seed.technique || data.technique,
          techniqueName: seed.techniqueName || data.techniqueName,
          difficulty: seed.difficulty || data.difficulty || 2,
          gridSize: v.gridSize,
          boardData: v.boardData,
          solution: v.solution,
          cages: [],
          givenCount: v.boardData.flat().filter(x => x !== 0).length,
          teachingGoal: seed.teachingGoal || seed.techniqueName || ''
        });
        validCount++;
      }
    }
    console.log(`  "${seed.id}": ${validCount}/${variants.length} valid variants`);
  }
  
  return {
    source: data.source,
    type: 'classic-sudoku',
    technique: data.technique,
    seedFile: filename,
    seedCount: validSeeds.length,
    variantCount: allVariants.length,
    generatedAt: new Date().toISOString(),
    puzzles: allVariants
  };
}

/**
 * 主函数
 */
function main() {
  console.log('========================================');
  console.log('  Puzzle Generation Pipeline');
  console.log('========================================');
  
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  
  const allGenerated = [];
  
  // 1. 处理LMD杀手数独种子
  const lmdFile = path.join(SEEDS_DIR, 'lmd-killer-sudoku.json');
  if (fs.existsSync(lmdFile)) {
    const result = processSeedFile(lmdFile, 25);
    const outPath = path.join(OUT_DIR, 'lmd-killer-variants.json');
    saveJson(outPath, result);
    allGenerated.push(result);
  }
  
  // 2. 处理手工经典数独种子
  const seedFiles = fs.readdirSync(SEEDS_DIR).filter(f => f.startsWith('handcrafted-') && f.endsWith('.json'));
  for (const sf of seedFiles) {
    const result = processClassicSeeds(path.join(SEEDS_DIR, sf), 15);
    const outPath = path.join(OUT_DIR, sf.replace('handcrafted-', 'classic-').replace('.json', '-variants.json'));
    saveJson(outPath, result);
    allGenerated.push(result);
  }
  
  // 3. 生成统一索引
  const totalVariants = allGenerated.reduce((s, r) => s + r.variantCount, 0);
  const totalSeeds = allGenerated.reduce((s, r) => s + r.seedCount, 0);
  
  const index = {
    version: '1.1.0',
    generatedAt: new Date().toISOString(),
    totalSeeds,
    totalVariants,
    sources: allGenerated.map(r => ({
      source: r.source,
      type: r.type,
      technique: r.technique,
      seedCount: r.seedCount,
      variantCount: r.variantCount,
      file: path.basename(path.join(OUT_DIR, r.seedFile.replace('handcrafted-', 'classic-').replace('.json', '-variants.json')))
    }))
  };
  
  saveJson(path.join(OUT_DIR, '..', 'generated-index.json'), index);
  
  console.log(`\n========================================`);
  console.log(`  Generation Complete!`);
  console.log(`  Total seeds: ${totalSeeds}`);
  console.log(`  Total variants generated: ${totalVariants}`);
  console.log(`========================================`);
}

main();
