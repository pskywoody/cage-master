// ==========================================
// Sudoku Coach Crawler
// 爬取 sudoku.coach 的教学谜题和每日谜题
// ==========================================

const { fetch, sleep, str81ToGrid, isValidSudoku, solveSudoku, saveJson, loadJson } = require('./lib');
const fs = require('fs');
const path = require('path');

const BASE = 'https://sudoku.coach';
const OUT_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');

// 要爬取的技巧教学页面
const TECHNIQUES = [
  { slug: 'naked-single',     name: 'Naked Single',     difficulty: 1 },
  { slug: 'hidden-single',    name: 'Hidden Single',    difficulty: 1 },
  { slug: 'naked-pair',       name: 'Naked Pair',       difficulty: 2 },
  { slug: 'hidden-pair',      name: 'Hidden Pair',      difficulty: 2 },
  { slug: 'naked-groups',     name: 'Naked Triple',     difficulty: 3 },
  { slug: 'hidden-groups',    name: 'Hidden Triple',    difficulty: 3 },
  { slug: 'x-wing',           name: 'X-Wing',           difficulty: 4 },
  { slug: 'swordfish',        name: 'Swordfish',        difficulty: 4 },
  { slug: 'y-wing',           name: 'Y-Wing (XY-Wing)', difficulty: 5 },
  { slug: 'skyscraper',       name: 'Skyscraper',       difficulty: 4 },
  { slug: 'two-string-kite',  name: 'Two-String Kite',  difficulty: 4 },
  { slug: 'finned-x-wing',    name: 'Finned X-Wing',    difficulty: 5 },
  { slug: 'xyz-wing',         name: 'XYZ-Wing',         difficulty: 5 },
  { slug: 'w-wing',           name: 'W-Wing',           difficulty: 5 },
  { slug: 'jellyfish',        name: 'Jellyfish',        difficulty: 6 },
  { slug: 'empty-rectangle',  name: 'Empty Rectangle',  difficulty: 6 },
];

/**
 * SCv2解码器 - 尝试从SCv2编码字符串中提取初始盘面
 * 
 * SCv2格式分析:
 * - 格式: SCv2_{grid}_{highlights}_{candidates}_{extras}__{result}
 * - 第一段是盘面编码：数字0-9表示固定数字，a/b表示特殊标记
 * - 数字1-9直接表示给定数字
 * - 0表示空格，但0后面可能跟有候选数编码
 */
function decodeSCv2(encoded) {
  try {
    if (!encoded.startsWith('SCv2_')) return null;
    const data = encoded.substring(5); // 去掉SCv2_前缀
    
    // 分割各段（用_分隔，但__是特殊分隔符）
    const parts = data.split('__');
    const mainPart = parts[0];
    const segments = mainPart.split('_');
    
    // 第一段通常包含盘面数字
    // 尝试提取连续的数字序列（81个数字表示一个完整盘面）
    const gridSegment = segments[0];
    
    // 提取数字：直接的1-9是给定数字，0是空格
    // 格式中 a,b 等小写字母可能是颜色/高亮标记
    let digits = [];
    let i = 0;
    while (i < gridSegment.length && digits.length < 81) {
      const ch = gridSegment[i];
      if (ch >= '1' && ch <= '9') {
        digits.push(parseInt(ch));
        i++;
      } else if (ch === '0') {
        digits.push(0);
        i++;
        // 0后面可能跟有小写字母+数字（候选数标记），跳过直到下一个数字或a/b
        while (i < gridSegment.length) {
          const next = gridSegment[i];
          if ((next >= '0' && next <= '9') || next === 'a' || next === 'b') break;
          i++;
        }
      } else if (ch === 'a' || ch === 'b') {
        // a/b标记 - 可能是颜色标记，不影响数字提取
        i++;
        // a/b后面可能跟数字
        while (i < gridSegment.length && gridSegment[i] >= '0' && gridSegment[i] <= '9') {
          // 这些是标记的参数，跳过
          i++;
        }
      } else {
        i++;
      }
    }
    
    if (digits.length !== 81) {
      // 如果提取不到81个数字，尝试更简单的方法：只取数字
      digits = [];
      for (const ch of gridSegment) {
        if (ch >= '0' && ch <= '9') {
          digits.push(parseInt(ch));
        }
        if (digits.length >= 81) break;
      }
    }
    
    if (digits.length < 81) return null;
    
    // 截取前81个数字作为盘面
    const grid = [];
    for (let r = 0; r < 9; r++) {
      grid[r] = [];
      for (let c = 0; c < 9; c++) {
        grid[r][c] = digits[r * 9 + c];
      }
    }
    
    // 验证是否是合法数独盘面
    if (!isValidSudoku(grid)) return null;
    
    // 求解
    const solutions = solveSudoku(grid);
    if (solutions.length === 0) return null;
    
    return {
      boardData: grid,
      solution: solutions[0],
      givenCount: grid.flat().filter(v => v !== 0).length
    };
  } catch (e) {
    return null;
  }
}

/**
 * 从HTML中提取所有SCv2编码的盘面
 */
function extractSCv2Puzzles(html) {
  const regex = /data-suco-init="(SCv2_[^"]+)"/g;
  const puzzles = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const encoded = match[1];
    const decoded = decodeSCv2(encoded);
    if (decoded) {
      puzzles.push({ encoded, ...decoded });
    }
  }
  return puzzles;
}

/**
 * 从HTML中提取81位数字字符串谜题
 */
function extractStr81Puzzles(html) {
  const puzzles = [];
  // 匹配81位连续数字（标准数独格式，0或.表示空格）
  const regex = /["']([0-9.]{81})["']/g;
  let match;
  const seen = new Set();
  while ((match = regex.exec(html)) !== null) {
    let str81 = match[1];
    if (seen.has(str81)) continue;
    seen.add(str81);
    
    str81 = str81.replace(/\./g, '0');
    const grid = str81ToGrid(str81);
    if (!isValidSudoku(grid)) continue;
    
    const solutions = solveSudoku(grid);
    if (solutions.length === 0) continue;
    
    puzzles.push({
      str81,
      boardData: grid,
      solution: solutions[0],
      givenCount: grid.flat().filter(v => v !== 0).length
    });
  }
  return puzzles;
}

/**
 * 获取每日一题
 */
async function fetchDailyPuzzle() {
  console.log('📅 Fetching daily puzzle...');
  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const url = `${BASE}/beapi/get-sudoku-of-the-day/en/${today}/0`;
    const data = await fetch(url, { accept: 'application/json' });
    console.log('  Daily puzzle response:', data.substring(0, 200));
    return data;
  } catch (e) {
    console.log('  Failed to fetch daily puzzle:', e.message);
    return null;
  }
}

/**
 * 获取单个技巧教学页面
 */
async function fetchTechniquePage(tech) {
  console.log(`\n📖 Fetching ${tech.name} (${tech.slug})...`);
  try {
    const url = `${BASE}/beapi/get-page/en/learn/${tech.slug}`;
    const html = await fetch(url);
    
    // 提取SCv2谜题
    const scv2Puzzles = extractSCv2Puzzles(html);
    console.log(`  Found ${scv2Puzzles.length} SCv2 puzzles`);
    
    // 提取81位字符串谜题
    const str81Puzzles = extractStr81Puzzles(html);
    console.log(`  Found ${str81Puzzles.length} 81-char puzzles`);
    
    // 去重（按solution去重）
    const allPuzzles = [...scv2Puzzles, ...str81Puzzles];
    const unique = [];
    const seenSols = new Set();
    for (const p of allPuzzles) {
      const solKey = p.solution.flat().join('');
      if (seenSols.has(solKey)) continue;
      seenSols.add(solKey);
      unique.push(p);
    }
    
    console.log(`  Unique valid puzzles: ${unique.length}`);
    
    return {
      technique: tech,
      puzzles: unique.map((p, i) => ({
        id: `sc_${tech.slug}_${i+1}`,
        source: 'sudoku-coach',
        technique: tech.slug,
        techniqueName: tech.name,
        difficulty: tech.difficulty,
        boardData: p.boardData,
        solution: p.solution,
        givenCount: p.givenCount,
        gridSize: 9
      }))
    };
  } catch (e) {
    console.log(`  Failed: ${e.message}`);
    return { technique: tech, puzzles: [] };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('  Sudoku Coach Crawler');
  console.log('========================================\n');
  
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  
  // 1. 获取每日一题
  await fetchDailyPuzzle();
  await sleep(500);
  
  // 2. 获取所有技巧教学页面
  const allSeeds = [];
  for (const tech of TECHNIQUES) {
    const result = await fetchTechniquePage(tech);
    allSeeds.push(...result.puzzles);
    await sleep(800); // 礼貌延迟
  }
  
  // 3. 保存种子题
  console.log(`\n========================================`);
  console.log(`  Total seeds collected: ${allSeeds.length}`);
  
  // 按技巧分类保存
  const byTechnique = {};
  for (const p of allSeeds) {
    if (!byTechnique[p.technique]) byTechnique[p.technique] = [];
    byTechnique[p.technique].push(p);
  }
  
  for (const [techSlug, puzzles] of Object.entries(byTechnique)) {
    const filepath = path.join(OUT_DIR, `sudoku-coach-${techSlug}.json`);
    saveJson(filepath, {
      source: 'sudoku-coach',
      technique: techSlug,
      techniqueName: puzzles[0].techniqueName,
      difficulty: puzzles[0].difficulty,
      count: puzzles.length,
      puzzles
    });
  }
  
  // 保存完整索引
  const indexPath = path.join(OUT_DIR, '..', 'seed-index.json');
  const existing = fs.existsSync(indexPath) ? loadJson(indexPath) : { seeds: [] };
  const existingIds = new Set(existing.seeds.map(s => s.id));
  for (const p of allSeeds) {
    if (!existingIds.has(p.id)) {
      existing.seeds.push({
        id: p.id,
        source: p.source,
        technique: p.technique,
        techniqueName: p.techniqueName,
        difficulty: p.difficulty,
        givenCount: p.givenCount,
        file: `seeds/sudoku-coach-${p.technique}.json`
      });
    }
  }
  saveJson(indexPath, existing);
  
  console.log(`\n✅ Done! Seeds saved to ${OUT_DIR}`);
}

main().catch(console.error);
