// ==========================================
// LMD + SudokuPad Crawler v3
// 支持fpuz和scl两种格式解码
// ==========================================

const { fetch, sleep, isValidSudoku, saveJson } = require('./lib');
const LZString = require('lz-string');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
const LMD_BASE = 'https://logic-masters.de/Raetselportal/';
const SUDOKUPAD_API = 'https://sudokupad.app/api/puzzle/';
const TAG_KILLER = 9201; // Killer Sudoku tag
const PAGES_TO_FETCH = 10;

/**
 * 解码SudokuPad返回的谜题数据（支持fpuz和scl两种格式）
 */
function decodeSudokuPad(rawText) {
  const text = rawText.trim();
  
  // 格式1: fpuz (f-puzzles格式) - "fpuz" + LZ-Base64
  if (text.startsWith('fpuz')) {
    try {
      const jsonStr = LZString.decompressFromBase64(text.substring(4));
      if (jsonStr) return { format: 'fpuz', data: JSON.parse(jsonStr) };
    } catch(e) {}
  }
  
  // 格式2: scl (SudokuPad格式) - "scl" + LZ-Base64
  if (text.startsWith('scl')) {
    try {
      const jsonStr = LZString.decompressFromBase64(text.substring(3));
      if (jsonStr) return { format: 'scl', data: JSON.parse(jsonStr) };
    } catch(e) {}
  }
  
  // 直接JSON
  try {
    return { format: 'json', data: JSON.parse(text) };
  } catch(e) {}
  
  return null;
}

/**
 * 统一转换为我们的标准格式
 */
function toStandardFormat(decoded, meta) {
  if (!decoded || !decoded.data) return null;
  const { format, data } = decoded;
  const size = data.size || 9;
  let boardData, solution, cages, title, author, ruleset;
  
  if (format === 'fpuz') {
    // f-puzzles格式
    title = data.title || meta.title;
    author = data.author || meta.author;
    ruleset = data.ruleset || '';
    
    // solution: 扁平字符串数组
    solution = [];
    if (data.solution) {
      for (let r = 0; r < size; r++) {
        solution[r] = [];
        for (let c = 0; c < size; c++) {
          const v = data.solution[r * size + c];
          solution[r][c] = typeof v === 'string' ? parseInt(v) : (v || 0);
        }
      }
    }
    
    // boardData
    boardData = Array.from({length: size}, () => Array(size).fill(0));
    
    // cages
    const rawCages = data.killercage || data.cages || data.killercages || [];
    cages = rawCages.map((cage, idx) => {
      const cells = cage.cells.map(cellStr => {
        const m = cellStr.match(/R(\d+)C(\d+)/i);
        return m ? [parseInt(m[1])-1, parseInt(m[2])-1] : [0,0];
      });
      let sum = parseInt(cage.value) || parseInt(cage.sum) || 0;
      if (solution && sum > 0) {
        const actual = cells.reduce((s, [r,c]) => s + solution[r][c], 0);
        if (actual === sum) sum = actual;
        else sum = actual;
      }
      return { id: idx+1, sum, cells };
    });
    
  } else if (format === 'scl') {
    // SudokuPad scl格式
    const md = data.metadata || {};
    title = md.title || meta.title;
    author = md.author || meta.author;
    ruleset = md.rules || '';
    
    // solution在metadata.solution中，是81位字符串
    if (md.solution && typeof md.solution === 'string' && md.solution.length === size*size) {
      solution = [];
      for (let r = 0; r < size; r++) {
        solution[r] = [];
        for (let c = 0; c < size; c++) {
          solution[r][c] = parseInt(md.solution[r * size + c]) || 0;
        }
      }
    }
    
    // boardData
    boardData = Array.from({length: size}, () => Array(size).fill(0));
    if (data.cells) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = data.cells[r]?.[c];
          if (cell && typeof cell === 'object' && cell.value) {
            boardData[r][c] = parseInt(cell.value) || 0;
          } else if (typeof cell === 'number') {
            boardData[r][c] = cell;
          }
        }
      }
    }
    
    // cages - 已经是[r,c]数组格式（0-indexed!）
    cages = (data.cages || []).map((cage, idx) => {
      const cells = cage.cells.map(([r, c]) => [r, c]); // 已经是0-indexed数组
      let sum = parseInt(cage.value) || 0;
      if (solution && sum > 0) {
        const actual = cells.reduce((s, [r,c]) => s + solution[r][c], 0);
        sum = actual || sum;
      }
      return { id: idx+1, sum, cells, unique: !!cage.unique };
    });
    
  } else {
    return null;
  }
  
  // 验证：纯杀手数独没有given digits是正常的
  const givenCount = boardData.flat().filter(v => v !== 0).length;
  if (givenCount > 0 && !isValidSudoku(boardData)) return null;
  
  // 必须有cages才是杀手数独
  if (!cages || cages.length === 0) return null;
  
  // 验证cage sum
  if (solution) {
    for (const cage of cages) {
      const actual = cage.cells.reduce((s, [r,c]) => s + solution[r][c], 0);
      cage.sum = actual;
    }
  }
  
  return {
    gridSize: size,
    boardData,
    solution,
    cages,
    title,
    author,
    ruleset,
    givenCount,
    cageCount: cages.length
  };
}

/**
 * 从LMD列表页提取谜题
 */
async function fetchLMDList(page) {
  const url = `${LMD_BASE}Suche/erweitert.php?tag_id=${TAG_KILLER}&seite=${page}`;
  const html = await fetch(url);
  
  const puzzles = [];
  const seen = new Set();
  
  // 提取谜题ID和标题
  const regex = /zeigen\.php\?id=([A-Z0-9]{6})[^>]*>([^<]+)</g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    puzzles.push({
      lmdId: id,
      title: m[2].trim(),
      url: `${LMD_BASE}Raetsel/zeigen.php?id=${id}`
    });
  }
  return puzzles;
}

/**
 * 从LMD详情页提取SudokuPad链接和元数据
 */
async function fetchLMDDetail(puzzle) {
  const html = await fetch(puzzle.url);
  
  // 找SudokuPad/f-puzzles链接
  const padIds = new Set();
  const padRegex = /(?:sudokupad\.app|f-puzzles\.com\/\?id=)\/?([a-zA-Z0-9_-]{6,})/g;
  let m;
  while ((m = padRegex.exec(html)) !== null) {
    const id = m[1];
    // 过滤掉明显不是ID的（如JS变量名）
    if (id.length >= 6 && !/^[a-z]+$/.test(id) || id.length > 8) {
      padIds.add(id);
    }
  }
  
  // 也用更宽松的正则
  const looseRegex = /sudokupad\.app\/([a-zA-Z0-9_-]+)/g;
  while ((m = looseRegex.exec(html)) !== null) {
    if (m[1] !== 'embed' && m[1].length >= 6) padIds.add(m[1]);
  }
  
  // 难度
  let difficulty = 0;
  const starMatch = html.match(/(\d)\s*Stern/i) || html.match(/alt="(\d)/);
  if (starMatch) difficulty = parseInt(starMatch[1]);
  
  // 作者
  let author = 'Unknown';
  const authorMatch = html.match(/von\s+<[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)</) ||
                      html.match(/title="[^"]*von\s+([^"]+)"/);
  if (authorMatch) author = authorMatch[1].trim();
  
  puzzle.padIds = [...padIds];
  puzzle.difficulty = difficulty;
  puzzle.author = author;
  return puzzle;
}

/**
 * 从SudokuPad获取并解码单个谜题
 */
async function fetchAndDecode(padId) {
  try {
    const text = await fetch(SUDOKUPAD_API + padId);
    return decodeSudokuPad(text);
  } catch(e) {
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('  LMD Killer Sudoku Crawler v3');
  console.log('  Supports fpuz + scl formats');
  console.log('========================================\n');
  
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  
  // 获取多页列表
  const allPuzzles = [];
  for (let page = 0; page < PAGES_TO_FETCH; page++) {
    try {
      const puzzles = await fetchLMDList(page);
      allPuzzles.push(...puzzles);
      console.log(`Page ${page+1}/${PAGES_TO_FETCH}: ${puzzles.length} puzzles (total: ${allPuzzles.length})`);
    } catch(e) {
      console.log(`Page ${page+1}: failed - ${e.message}`);
    }
    await sleep(600 + Math.random() * 400);
  }
  
  // 去重
  const unique = [];
  const seenIds = new Set();
  for (const p of allPuzzles) {
    if (!seenIds.has(p.lmdId)) { seenIds.add(p.lmdId); unique.push(p); }
  }
  console.log(`\n📊 Unique puzzles: ${unique.length}`);
  
  // 获取详情并下载
  const seeds = [];
  let success = 0, failNoLink = 0, failDecode = 0, failNoCages = 0;
  
  for (let i = 0; i < unique.length; i++) {
    const puzzle = unique[i];
    const titleShort = puzzle.title.substring(0, 30).padEnd(30);
    
    try {
      await fetchLMDDetail(puzzle);
      await sleep(300 + Math.random() * 200);
      
      if (!puzzle.padIds || puzzle.padIds.length === 0) {
        process.stdout.write(`\r[${i+1}/${unique.length}] ${titleShort} ⚠ no link     `);
        failNoLink++;
        continue;
      }
      
      let got = false;
      for (const padId of puzzle.padIds) {
        const decoded = await fetchAndDecode(padId);
        await sleep(150);
        
        if (decoded) {
          const std = toStandardFormat(decoded, { title: puzzle.title, author: puzzle.author });
          if (std && std.cages.length > 0) {
            seeds.push({
              id: `lmd_${puzzle.lmdId}`,
              source: 'lmd-sudokupad',
              format: decoded.format,
              title: std.title,
              author: std.author,
              difficulty: puzzle.difficulty,
              lmdId: puzzle.lmdId,
              sudokuPadId: padId,
              gridSize: std.gridSize,
              boardData: std.boardData,
              solution: std.solution,
              cages: std.cages,
              givenCount: std.givenCount,
              cageCount: std.cageCount,
              ruleset: std.ruleset
            });
            process.stdout.write(`\r[${i+1}/${unique.length}] ${titleShort} ✓ cages=${std.cageCount} givens=${std.givenCount} by=${std.author.substring(0,12).padEnd(12)}`);
            success++;
            got = true;
            break;
          } else if (std) {
            failNoCages++;
            got = true;
            break;
          }
        }
      }
      
      if (!got) {
        process.stdout.write(`\r[${i+1}/${unique.length}] ${titleShort} ✗ decode fail  `);
        failDecode++;
      }
    } catch(e) {
      process.stdout.write(`\r[${i+1}/${unique.length}] ${titleShort} ✗ error: ${e.message.substring(0,20)}`);
      failDecode++;
    }
  }
  
  console.log(`\n\n========================================`);
  console.log(`  Results:`);
  console.log(`    ✓ Success:     ${success}`);
  console.log(`    ⚠ No link:     ${failNoLink}`);
  console.log(`    ⚠ No cages:    ${failNoCages}`);
  console.log(`    ✗ Decode fail: ${failDecode}`);
  
  // 保存
  if (seeds.length > 0) {
    const filepath = path.join(OUT_DIR, 'lmd-killer-sudoku.json');
    saveJson(filepath, {
      source: 'lmd-sudokupad',
      type: 'killer-sudoku',
      count: seeds.length,
      crawledAt: new Date().toISOString(),
      puzzles: seeds
    });
  }
  
  return seeds;
}

if (require.main === module) {
  main().then(() => {
    console.log('\n✅ Done!');
  }).catch(console.error);
}

module.exports = { decodeSudokuPad, toStandardFormat, fetchAndDecode };
