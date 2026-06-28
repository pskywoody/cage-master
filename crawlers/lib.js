// ==========================================
// Crawler Utility Library
// 爬虫工具库 - HTTP请求、数据解码、格式转换
// ==========================================

const https = require('https');
const http = require('http');
const zlib = require('zlib');
const pako = require('pako');
const fs = require('fs');
const path = require('path');

// 自定义User-Agent，避免被拦截
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * 发送HTTP/HTTPS GET请求，返回文本内容
 */
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': options.accept || 'text/html,application/json,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        ...options.headers
      },
      timeout: options.timeout || 15000
    }, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        return fetch(redirectUrl, options).then(resolve, reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buffer = Buffer.concat(chunks);
        // 处理gzip
        if (res.headers['content-encoding'] === 'gzip') {
          try { buffer = zlib.gunzipSync(buffer); } catch(e) {}
        }
        resolve(buffer.toString('utf-8'));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * 发送HTTP/HTTPS GET请求，返回Buffer（二进制）
 */
function fetchBuffer(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': UA,
        ...options.headers
      },
      timeout: options.timeout || 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        return fetchBuffer(redirectUrl, options).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * 延迟（礼貌爬取，避免给服务器造成压力）
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 将81位数字字符串转为9x9二维数组
 */
function str81ToGrid(str81) {
  const grid = [];
  for (let r = 0; r < 9; r++) {
    grid[r] = [];
    for (let c = 0; c < 9; c++) {
      const ch = str81[r * 9 + c];
      grid[r][c] = ch === '.' || ch === '0' ? 0 : parseInt(ch);
    }
  }
  return grid;
}

/**
 * 将9x9二维数组转为81位字符串
 */
function gridToStr81(grid) {
  let s = '';
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      s += grid[r][c] === 0 ? '0' : grid[r][c].toString();
  return s;
}

/**
 * 标准数独合法性验证（仅行列宫，不含cage）
 */
function isValidSudoku(grid, size = 9, boxW = 3, boxH = 3) {
  for (let r = 0; r < size; r++) {
    const seen = new Set();
    for (let c = 0; c < size; c++) {
      const v = grid[r][c];
      if (v === 0) continue;
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  for (let c = 0; c < size; c++) {
    const seen = new Set();
    for (let r = 0; r < size; r++) {
      const v = grid[r][c];
      if (v === 0) continue;
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  for (let br = 0; br < size / boxH; br++) {
    for (let bc = 0; bc < size / boxW; bc++) {
      const seen = new Set();
      for (let dr = 0; dr < boxH; dr++) {
        for (let dc = 0; dc < boxW; dc++) {
          const v = grid[br * boxH + dr][bc * boxW + dc];
          if (v === 0) continue;
          if (seen.has(v)) return false;
          seen.add(v);
        }
      }
    }
  }
  return true;
}

/**
 * 回溯求解器 - 验证唯一解并返回完整解
 */
function solveSudoku(grid, size = 9, boxW = 3, boxH = 3, maxSolutions = 2) {
  const g = grid.map(row => [...row]);
  let solutions = [];

  function getCands(r, c) {
    const used = new Set();
    for (let i = 0; i < size; i++) {
      if (g[r][i] !== 0) used.add(g[r][i]);
      if (g[i][c] !== 0) used.add(g[i][c]);
    }
    const br = Math.floor(r / boxH) * boxH;
    const bc = Math.floor(c / boxW) * boxW;
    for (let dr = 0; dr < boxH; dr++)
      for (let dc = 0; dc < boxW; dc++)
        if (g[br+dr][bc+dc] !== 0) used.add(g[br+dr][bc+dc]);
    const cands = [];
    for (let n = 1; n <= size; n++) if (!used.has(n)) cands.push(n);
    return cands;
  }

  function backtrack() {
    if (solutions.length >= maxSolutions) return;
    // 找候选数最少的格子
    let bestR = -1, bestC = -1, bestCands = null, bestLen = size + 1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (g[r][c] !== 0) continue;
        const cands = getCands(r, c);
        if (cands.length === 0) return;
        if (cands.length < bestLen) {
          bestLen = cands.length;
          bestR = r; bestC = c; bestCands = cands;
          if (bestLen === 1) break;
        }
      }
      if (bestLen === 1) break;
    }
    if (bestR === -1) {
      solutions.push(g.map(row => [...row]));
      return;
    }
    for (const n of bestCands) {
      g[bestR][bestC] = n;
      backtrack();
      g[bestR][bestC] = 0;
      if (solutions.length >= maxSolutions) return;
    }
  }

  backtrack();
  return solutions;
}

/**
 * 将f-puzzles/SudokuPad格式的cages转为我们的格式
 * f-puzzles: cells是"R1C1"格式字符串，value是cage和
 * 我们的格式: cells是[r,c]数组，sum是和
 */
function convertCages(fpCages) {
  if (!fpCages || !Array.isArray(fpCages)) return [];
  return fpCages.map((cage, idx) => {
    let cells;
    if (typeof cage.cells[0] === 'string') {
      // R1C1 格式
      cells = cage.cells.map(cellStr => {
        const m = cellStr.match(/R(\d+)C(\d+)/i);
        if (!m) return [0, 0];
        return [parseInt(m[1]) - 1, parseInt(m[2]) - 1];
      });
    } else {
      // 已经是[r,c]格式
      cells = cage.cells;
    }
    return {
      id: idx + 1,
      sum: cage.value || cage.sum || 0,
      cells
    };
  });
}

/**
 * 保存JSON数据到文件
 */
function saveJson(filepath, data) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  ✓ Saved: ${filepath}`);
}

/**
 * 加载JSON文件
 */
function loadJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

module.exports = {
  fetch,
  fetchBuffer,
  sleep,
  str81ToGrid,
  gridToStr81,
  isValidSudoku,
  solveSudoku,
  convertCages,
  saveJson,
  loadJson
};
