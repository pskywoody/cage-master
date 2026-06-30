// ==========================================
// LMD + SudokuPad Crawler v4
// 修复: 分页参数(start=N*20)、正则匹配、padId提取、cage验证、质量过滤
// 支持fpuz和scl两种格式解码
// ==========================================

const { fetch, sleep, isValidSudoku, solveSudoku, saveJson } = require('./lib');
const LZString = require('lz-string');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
const LMD_BASE = 'https://logic-masters.de/Raetselportal/';
const SUDOKUPAD_API = 'https://sudokupad.app/api/puzzle/';
const TAG_KILLER = 9201; // Killer Sudoku tag on LMD
const PER_PAGE = 20;     // LMD每页显示20题
const PAGES_TO_FETCH = 20; // 爬取20页 = 400题列表
const MIN_CAGES = 8;     // 至少8个笼子
const MIN_COVERAGE = 60; // 笼子至少覆盖60/81格（未覆盖格子会被补全为单格笼）
const PURE_COVERAGE = 78; // 覆盖>=78格视为"纯杀手数独"
const REQUEST_DELAY = 800;  // 列表页请求延迟
const DETAIL_DELAY = 500;  // 详情页请求延迟
const API_DELAY = 300;     // API请求延迟

/**
 * 解码SudokuPad返回的谜题数据（支持fpuz和scl两种格式）
 */
function decodeSudokuPad(rawText) {
  const text = (rawText || '').trim();
  if (!text) return null;

  // 格式1: fpuz (f-puzzles格式) - "fpuz" + LZ-Base64
  if (text.startsWith('fpuz')) {
    try {
      const jsonStr = LZString.decompressFromBase64(text.substring(4));
      if (jsonStr) {
        const data = JSON.parse(jsonStr);
        return { format: 'fpuz', data };
      }
    } catch(e) { /* fallthrough */ }
  }

  // 格式2: scl (SudokuPad格式) - "scl" + LZ-Base64
  if (text.startsWith('scl')) {
    try {
      const jsonStr = LZString.decompressFromBase64(text.substring(3));
      if (jsonStr) {
        const data = JSON.parse(jsonStr);
        return { format: 'scl', data };
      }
    } catch(e) { /* fallthrough */ }
  }

  // 直接JSON（少见）
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

  // 推断size: 优先data.size，其次从cells/grid推断，默认9
  let size = data.size || 9;
  if (format === 'scl' && !data.size && data.cells && Array.isArray(data.cells)) {
    size = data.cells.length;
    // 必须是正方形网格，且是9x9
    if (size !== 9 || !data.cells[0] || data.cells[0].length !== 9) return null;
  } else if (format === 'fpuz' && !data.size && data.grid && Array.isArray(data.grid)) {
    size = data.grid.length;
    if (size !== 9 || !data.grid[0] || data.grid[0].length !== 9) return null;
  }
  // 只处理9x9
  if (size !== 9) return null;

  let boardData, solution, cages, title, author, ruleset;
  let givenCount = 0;

  if (format === 'fpuz') {
    title = data.title || meta.title;
    author = data.author || meta.author;
    ruleset = data.ruleset || '';

    // solution: 扁平数组
    solution = null;
    if (data.solution && Array.isArray(data.solution) && data.solution.length >= size*size) {
      solution = [];
      for (let r = 0; r < size; r++) {
        solution[r] = [];
        for (let c = 0; c < size; c++) {
          const v = data.solution[r * size + c];
          solution[r][c] = typeof v === 'string' ? parseInt(v) : (v || 0);
        }
      }
    }

    boardData = Array.from({length: size}, () => Array(size).fill(0));
    // f-puzzles givens 在 data.given 或 data.grid
    if (data.grid && Array.isArray(data.grid)) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = data.grid[r]?.[c];
          if (cell && typeof cell === 'object') {
            if (cell.value) boardData[r][c] = parseInt(cell.value) || 0;
            else if (cell.given) boardData[r][c] = parseInt(cell.given) || 0;
          } else if (typeof cell === 'number') {
            boardData[r][c] = cell;
          }
        }
      }
    }

    // cages: 检查所有可能的字段名
    const rawCages = data.killercage || data.cages || data.killercages || data['cage'] || [];
    if (!Array.isArray(rawCages) || rawCages.length === 0) return null;

    cages = [];
    for (let i = 0; i < rawCages.length; i++) {
      const cage = rawCages[i];
      if (!cage || !cage.cells || !Array.isArray(cage.cells)) continue;
      const cells = cage.cells.map(cellStr => {
        if (typeof cellStr === 'string') {
          const m = cellStr.match(/R(\d+)C(\d+)/i);
          return m ? [parseInt(m[1])-1, parseInt(m[2])-1] : null;
        } else if (Array.isArray(cellStr) && cellStr.length === 2) {
          return [cellStr[0], cellStr[1]];
        }
        return null;
      }).filter(Boolean);
      if (cells.length === 0) continue;
      let sum = parseInt(cage.value) || parseInt(cage.sum) || 0;
      cages.push({ id: i+1, sum, cells });
    }

  } else if (format === 'scl') {
    const md = data.metadata || {};
    title = md.title || meta.title;
    author = md.author || meta.author;
    ruleset = md.rules || '';

    // solution在metadata.solution中，是81位字符串
    solution = null;
    if (md.solution && typeof md.solution === 'string' && md.solution.length === size*size) {
      solution = [];
      for (let r = 0; r < size; r++) {
        solution[r] = [];
        for (let c = 0; c < size; c++) {
          solution[r][c] = parseInt(md.solution[r * size + c]) || 0;
        }
      }
    }

    // boardData - 预填数字
    boardData = Array.from({length: size}, () => Array(size).fill(0));
    if (data.cells) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = data.cells[r]?.[c];
          if (cell) {
            if (typeof cell === 'object' && (cell.value || cell.given)) {
              boardData[r][c] = parseInt(cell.value || cell.given) || 0;
            } else if (typeof cell === 'number') {
              boardData[r][c] = cell;
            }
          }
        }
      }
    }

    // cages - scl格式中cages是[[r,c],...]数组格式
    if (!Array.isArray(data.cages) || data.cages.length === 0) return null;
    cages = [];
    for (let i = 0; i < data.cages.length; i++) {
      const cage = data.cages[i];
      if (!cage || !Array.isArray(cage.cells) || cage.cells.length === 0) continue;
      // scl cells can be [r,c] arrays or objects {r,c}
      const cells = cage.cells.map(cc => {
        if (Array.isArray(cc) && cc.length === 2) return [cc[0], cc[1]];
        if (cc && typeof cc === 'object' && cc.r != null && cc.c != null) return [cc.r, cc.c];
        return null;
      }).filter(Boolean);
      if (cells.length === 0) continue;
      let sum = parseInt(cage.value) || parseInt(cage.sum) || 0;
      cages.push({ id: i+1, sum, cells });
    }

  } else {
    return null;
  }

  // 必须有足够的cages才算杀手数独
  if (!cages || cages.length < MIN_CAGES) return null;

  // 验证cage覆盖完整性（所有格子恰好被一个cage覆盖）
  const covered = new Set();
  for (const cage of cages) {
    for (const [r, c] of cage.cells) {
      if (r < 0 || r >= size || c < 0 || c >= size) return null; // 越界
      const key = r * size + c;
      if (covered.has(key)) return null; // 重叠
      covered.add(key);
    }
  }
  // 覆盖格数 < MIN_COVERAGE，笼子太少，不适合我们的游戏
  if (covered.size < MIN_COVERAGE) return null;

  // 用solution计算/验证cage sum
  if (solution) {
    let sumOk = true;
    for (const cage of cages) {
      const actual = cage.cells.reduce((s, [r,c]) => s + (solution[r]?.[c] || 0), 0);
      if (cage.sum === 0) {
        cage.sum = actual;
      } else if (cage.sum !== actual) {
        cage.sum = actual;
      }
      if (actual < cage.cells.length * 1 || actual > cage.cells.length * size) sumOk = false;
    }
    if (!sumOk) return null;

    // 补全未覆盖的格子为单格cage（sum=答案值，相当于预填提示）
    let nextId = cages.length + 1;
    let autoFillCount = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const key = r * size + c;
        if (!covered.has(key)) {
          const val = solution[r][c];
          cages.push({ id: nextId++, sum: val, cells: [[r, c]], autoFill: true });
          boardData[r][c] = val; // 同时作为预填数字
          autoFillCount++;
        }
      }
    }
    if (autoFillCount > 0) {
      // 重新计算givenCount
      givenCount = boardData.flat().filter(v => v !== 0).length;
    }
  } else {
    // 没有solution时无法补全未覆盖格子，要求必须覆盖全部格子
    if (covered.size < size * size) return null;
    for (const cage of cages) {
      if (cage.sum === 0) return null;
      const minSum = cage.cells.length * (cage.cells.length + 1) / 2;
      const maxSum = cage.cells.length * (2*size - cage.cells.length + 1) / 2;
      if (cage.sum < minSum || cage.sum > maxSum) return null;
    }
  }

  const isPure = (covered.size >= PURE_COVERAGE) && (covered.size === size * size);
  const coverage = size * size; // 补全后覆盖100%

  // 验证givens合法性
  givenCount = boardData.flat().filter(v => v !== 0).length;
  if (givenCount > 0 && !isValidSudoku(boardData, size)) return null;

  return {
    gridSize: size,
    boardData,
    solution,
    cages,
    title,
    author,
    ruleset,
    givenCount,
    cageCount: cages.length,
    coverage,
    originalCoverage: covered.size,
    isPure
  };
}

/**
 * 从LMD列表页提取谜题
 */
async function fetchLMDList(page) {
  const start = page * PER_PAGE;
  const url = `${LMD_BASE}Suche/erweitert.php?tag_id=${TAG_KILLER}&start=${start}`;
  const html = await fetch(url);

  const puzzles = [];
  const seen = new Set();

  // 提取谜题链接：zeigen.php?id=XXXXXX">Title</a>
  // LMD ID格式: 6位大写字母数字（如000TI5, 000T77）
  const regex = /zeigen\.php\?id=([A-Za-z0-9]{4,10})["'][^>]*>([^<]+)</g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1].toUpperCase();
    if (seen.has(id)) continue;
    // 过滤非谜题链接（如skip nav等）
    if (id.length < 4) continue;
    seen.add(id);
    puzzles.push({
      lmdId: id,
      title: m[2].trim().replace(/\s+/g, ' '),
      url: `${LMD_BASE}Raetsel/zeigen.php?id=${id}`
    });
  }
  return puzzles;
}

/**
 * 从LMD详情页提取SudokuPad/f-puzzles链接和元数据
 * 支持SudokuPad两种URL格式:
 *   1. sudokupad.app/{puzzleId} (10位左右的随机字符串)
 *   2. sudokupad.app/{username}/{puzzleName} (用户发布路径)
 */
async function fetchLMDDetail(puzzle) {
  const html = await fetch(puzzle.url);

  const padLinks = []; // {type: 'direct'|'user', id: string, path: string}

  // 1. 匹配 sudokupad.app/{id} 直接ID格式 (ID是6-20位字母数字)
  //    但要排除后面还有 / 的情况（那是user/puzzle格式）
  const directRegex = /https?:\/\/(?:www\.)?sudokupad\.app\/(?!puzzle\/)([a-zA-Z0-9]{6,20})(?![a-zA-Z0-9\/])(?:[?#"'<).]|$)/gm;
  let m;
  while ((m = directRegex.exec(html)) !== null) {
    const id = m[1];
    if (!['embed','create','puzzle','puzzles','about','help','api','app','docs','index','api'].includes(id)) {
      padLinks.push({ type: 'direct', id, apiPath: id });
    }
  }

  // 2. 匹配 sudokupad.app/{username}/{puzzlename} 用户路径格式
  //    格式: https://sudokupad.app/username/puzzle-name
  const userRegex = /https?:\/\/(?:www\.)?sudokupad\.app\/([a-zA-Z0-9_-]{3,30})\/([a-zA-Z0-9_-]{3,50})(?:[?#"'<).]|$)/gm;
  while ((m = userRegex.exec(html)) !== null) {
    const username = m[1];
    const puzzlename = m[2];
    // 过滤非puzzle路径
    if (!['embed','create','puzzle','puzzles','about','help','api','app','docs','index','images','js','css'].includes(username)) {
      padLinks.push({ type: 'user', id: `${username}/${puzzlename}`, apiPath: `${username}/${puzzlename}` });
    }
  }

  // 3. 匹配 f-puzzles.com/?id=XXXXX
  const fpRegex = /https?:\/\/(?:www\.)?f-puzzles\.com\/\?id=([a-zA-Z0-9]{6,20})/gm;
  while ((m = fpRegex.exec(html)) !== null) {
    padLinks.push({ type: 'fpuzzles', id: m[1], apiPath: m[1] });
  }

  // 去重
  const seen = new Set();
  puzzle.padLinks = padLinks.filter(l => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
  puzzle.padIds = puzzle.padLinks.map(l => l.id); // 兼容旧代码

  // 难度星级
  let difficulty = 0;
  // 匹配 level1.png ~ level5.png 或 ulevel5.png
  const starMatch = html.match(/level(\d)\.png/) || html.match(/ulevel(\d)\.png/);
  if (starMatch) difficulty = parseInt(starMatch[1]);

  // 作者: von <a ...>name</a>
  let author = 'Unknown';
  const authorRegex = /von\s+<a[^>]*>([^<]+)<\/a>/;
  const am = html.match(authorRegex);
  if (am) author = am[1].trim();

  // 标题
  const titleMatch = html.match(/<h2>([^<]+)<\/h2>/);
  if (titleMatch) puzzle.title = titleMatch[1].trim();

  puzzle.difficulty = difficulty;
  puzzle.author = author;
  return puzzle;
}

/**
 * 从SudokuPad获取并解码单个谜题
 * @param {string} apiPath - 谜题路径，可以是 puzzleId 或 username/puzzlename
 */
async function fetchAndDecode(apiPath) {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const text = await fetch(SUDOKUPAD_API + apiPath, {
        accept: '*/*',
        referer: `https://sudokupad.app/${apiPath}`,
        headers: {
          'Origin': 'https://sudokupad.app',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        },
        timeout: 15000,
        retries: 2
      });
      const decoded = decodeSudokuPad(text);
      if (decoded) return decoded;
      // 解码失败，返回null（不重试，因为数据格式问题重试也没用）
      return null;
    } catch(e) {
      if (attempt < maxRetries) {
        await sleep(2000 + Math.random() * 2000);
        continue;
      }
      // 404是正常的（题目已删除），其他错误向上抛出
      if (e.message && e.message.includes('HTTP 404')) return null;
      throw e;
    }
  }
  return null;
}

/**
 * 主函数
 */
async function main(options = {}) {
  const pages = options.pages || PAGES_TO_FETCH;
  const verbose = options.verbose !== false;

  if (verbose) {
    console.log('========================================');
    console.log('  LMD Killer Sudoku Crawler v4');
    console.log(`  Pages: ${pages}, MinCages: ${MIN_CAGES}`);
    console.log('========================================\n');
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. 获取多页列表
  const allPuzzles = [];
  for (let page = 0; page < pages; page++) {
    try {
      const puzzles = await fetchLMDList(page);
      allPuzzles.push(...puzzles);
      if (verbose) console.log(`Page ${page+1}/${pages}: ${puzzles.length} puzzles (total: ${allPuzzles.length})`);
      if (puzzles.length < PER_PAGE) break; // 最后一页
    } catch(e) {
      if (verbose) console.log(`Page ${page+1}: failed - ${e.message}`);
    }
    await sleep(REQUEST_DELAY + Math.random() * 500);
  }

  // 2. 去重
  const unique = [];
  const seenIds = new Set();
  for (const p of allPuzzles) {
    if (!seenIds.has(p.lmdId)) { seenIds.add(p.lmdId); unique.push(p); }
  }
  if (verbose) console.log(`\n📊 Unique puzzles found: ${unique.length}`);

  // 3. 获取详情并下载解码
  const seeds = [];
  const failReasons = { noLink: 0, notFound: 0, decodeFail: 0, noCages: 0, tooFewCages: 0, invalidCages: 0, httpError: 0 };

  for (let i = 0; i < unique.length; i++) {
    const puzzle = unique[i];
    const titleShort = (puzzle.title || '').substring(0, 35).padEnd(35);

    try {
      await fetchLMDDetail(puzzle);
      await sleep(DETAIL_DELAY + Math.random() * 300);

      if (!puzzle.padLinks || puzzle.padLinks.length === 0) {
        if (verbose) process.stdout.write(`\r[${i+1}/${unique.length}] ${titleShort} ⚠ no pad link  `);
        failReasons.noLink++;
        continue;
      }

      let got = false;
      for (const link of puzzle.padLinks) {
        try {
          const decoded = await fetchAndDecode(link.apiPath);
          await sleep(API_DELAY + Math.random() * 200);

          if (decoded) {
            const std = toStandardFormat(decoded, { title: puzzle.title, author: puzzle.author });
            if (std && std.cageCount >= MIN_CAGES) {
              seeds.push({
                id: `lmd_${puzzle.lmdId}`,
                source: 'lmd-sudokupad',
                linkType: link.type,
                format: decoded.format,
                title: std.title || puzzle.title,
                author: std.author || puzzle.author,
                difficulty: puzzle.difficulty,
                lmdId: puzzle.lmdId,
                sudokuPadId: link.id,
                gridSize: std.gridSize,
                boardData: std.boardData,
                solution: std.solution,
                cages: std.cages,
                givenCount: std.givenCount,
                cageCount: std.cageCount,
                coverage: std.coverage,
                originalCoverage: std.originalCoverage,
                isPure: std.isPure,
                ruleset: std.ruleset || ''
              });
              if (verbose) process.stdout.write(`\r[${i+1}/${unique.length}] ${titleShort} ✓ cages=${std.cageCount} cov=${std.originalCoverage} givens=${std.givenCount} pure=${std.isPure?'Y':'N'} diff=${puzzle.difficulty || '?'}`);
              got = true;
              break;
            } else if (std) {
              if (std.cageCount < MIN_CAGES) failReasons.tooFewCages++;
              else failReasons.invalidCages++;
              got = true;
              break;
            } else {
              // decoded but toStandardFormat returned null (bad data)
              failReasons.decodeFail++;
            }
          } else {
            // fetchAndDecode returned null (404 or decode fail)
            // 404s are handled silently, decode fails too
            failReasons.notFound++;
          }
        } catch(e) {
          // HTTP errors (503, timeout, etc after retries)
          failReasons.httpError++;
        }
      }

      if (!got) {
        // Already counted in loop above
      }
    } catch(e) {
      if (verbose) process.stdout.write(`\r[${i+1}/${unique.length}] ${titleShort} ✗ error: ${(e.message||'').substring(0,25).padEnd(25)}`);
      failReasons.httpError++;
    }
  }

  if (verbose) {
    console.log(`\n\n========================================`);
    console.log(`  Crawl Results:`);
    console.log(`    ✓ Success:       ${seeds.length}`);
    console.log(`    ⚠ No pad link:   ${failReasons.noLink}`);
    console.log(`    ⚠ 404 Not found: ${failReasons.notFound}`);
    console.log(`    ⚠ Too few cages: ${failReasons.tooFewCages} (hybrid variants)`);
    console.log(`    ⚠ Invalid cages: ${failReasons.invalidCages}`);
    console.log(`    ⚠ Decode error:  ${failReasons.decodeFail}`);
    console.log(`    ✗ HTTP error:    ${failReasons.httpError}`);
  }

  // 4. 保存
  if (seeds.length > 0) {
    const filepath = path.join(OUT_DIR, 'lmd-killer-sudoku.json');
    saveJson(filepath, {
      source: 'lmd-sudokupad',
      type: 'killer-sudoku',
      count: seeds.length,
      minCages: MIN_CAGES,
      crawledAt: new Date().toISOString(),
      puzzles: seeds
    });
  }

  return { seeds, failReasons };
}

if (require.main === module) {
  main().then(({ seeds }) => {
    console.log(`\n✅ Crawler done! Got ${seeds.length} killer sudoku puzzles.`);
  }).catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { decodeSudokuPad, toStandardFormat, fetchAndDecode, fetchLMDList, fetchLMDDetail, main };
