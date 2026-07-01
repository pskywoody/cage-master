// Fast generation of 250 easy puzzles (30-35 cages, solves quickly)
const generator = require('d:/killersudoku/crawlers/killer-generator');
const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');

console.log('========================================');
console.log('  Generating 250 Easy Killer Sudokus');
console.log('  (30-35 cages, fast solving)');
console.log('========================================\n');

const all = [];

// Level 1 (easy): 33-35 cages, mostly 2-cell cages
console.log('--- Level 1 (★) ---');
const l1 = generator.generateBatch(100, { targetCages: 34, timeLimitMs: 500, maxLayoutAttempts: 15 });
l1.forEach(p => p.difficulty = 1);
all.push(...l1);

// Level 2 (easy-medium): 30-33 cages
console.log('\n--- Level 2 (★★) ---');
const l2 = generator.generateBatch(100, { targetCages: 32, timeLimitMs: 800, maxLayoutAttempts: 15 });
l2.forEach(p => p.difficulty = 2);
all.push(...l2);

// Level 3 (medium): 29-31 cages
console.log('\n--- Level 3 (★★★) ---');
const l3 = generator.generateBatch(50, { targetCages: 30, timeLimitMs: 1000, maxLayoutAttempts: 10 });
l3.forEach(p => p.difficulty = 3);
all.push(...l3);

all.forEach((p, i) => {
  p.id = `gen_${String(i + 1).padStart(4, '0')}`;
  p.title = `Killer Sudoku #${i + 1}`;
  p.author = 'Generator';
  p.source = 'generated';
});

const byDiff = {};
for (const p of all) byDiff[p.difficulty] = (byDiff[p.difficulty] || 0) + 1;
console.log('\n========================================');
console.log('Generation Complete!');
for (let d = 1; d <= 5; d++) console.log(`  Level ${d} (${'★'.repeat(d)}): ${byDiff[d] || 0}`);
console.log(`Total: ${all.length}`);

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
const outFile = path.join(outputDir, 'generated-killers.json');
fs.writeFileSync(outFile, JSON.stringify({
  source: 'generator',
  type: 'killer-sudoku',
  count: all.length,
  generatedAt: new Date().toISOString(),
  puzzles: all
}, null, 2));
console.log(`\nSaved to ${outFile}`);
process.exit(0);
