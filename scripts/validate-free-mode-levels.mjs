// 校验自由模式关卡导出：格式正确 + 关卡可玩性（Cage 和=解、预填=解、单元全覆盖）。
// 运行：node scripts/validate-free-mode-levels.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'data', 'free_mode_levels');
const KNOWN_SHAPES = new Set(['gentle_rise', 'late_peak', 'double_peak', 'early_peak', 'plateau']);

function fail(msg) { console.error('  ✗ ' + msg); return false; }
function ok(msg) { console.log('  ✓ ' + msg); return true; }

let levelFiles = [];
try {
  levelFiles = fs.readdirSync(outDir).filter((f) => /^V9-\d{3}\.json$/.test(f));
} catch (e) {
  console.error('无法读取目录', outDir, e.message);
  process.exit(1);
}

console.log(`=== 校验自由模式关卡 (${levelFiles.length} 个独立文件) ===`);
let allPass = true;
const seenIds = new Set();

for (const f of levelFiles) {
  const fp = path.join(outDir, f);
  let L;
  try { L = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) { allPass = fail(`${f}: JSON 解析失败 ${e.message}`) || allPass; continue; }
  const tag = L.id || f;
  let pass = true;

  // 基础字段
  if (!L.id) pass = fail(`${tag}: 缺 id`) && pass;
  if (seenIds.has(L.id)) pass = fail(`${tag}: id 重复`) && pass; else seenIds.add(L.id);

  // boardData / solution 9x9
  for (const key of ['boardData', 'solution']) {
    const m = L[key];
    if (!Array.isArray(m) || m.length !== 9 || !m.every((r) => Array.isArray(r) && r.length === 9)) {
      pass = fail(`${tag}: ${key} 非 9x9`) && pass;
    }
  }
  // cages
  if (!Array.isArray(L.cages) || L.cages.length === 0) pass = fail(`${tag}: cages 缺失/空`) && pass;

  // metadata 完整性
  const md = L.metadata || {};
  for (const k of ['source', 'batch', 'curator_score', 'maxTechLevel', 'journeyShape', 'scenicCells', 'goldBypass']) {
    if (!(k in md)) pass = fail(`${tag}: metadata.${k} 缺失`) && pass;
  }
  if (md.curator_score != null && typeof md.curator_score !== 'number') pass = fail(`${tag}: curator_score 非数值`) && pass;
  if (typeof md.maxTechLevel !== 'number') pass = fail(`${tag}: maxTechLevel 非数值`) && pass;
  if (typeof md.journeyShape !== 'string' || !KNOWN_SHAPES.has(md.journeyShape)) pass = fail(`${tag}: journeyShape 非法 (${md.journeyShape})`) && pass;
  if (typeof md.goldBypass !== 'boolean') pass = fail(`${tag}: goldBypass 非布尔`) && pass;
  if (!Array.isArray(md.scenicCells)) pass = fail(`${tag}: scenicCells 非数组`) && pass;

  // ---- 可玩性校验（仅当结构齐备时）----
  if (pass && Array.isArray(L.boardData) && Array.isArray(L.solution) && Array.isArray(L.cages)) {
    const S = L.solution;
    // Cage 和 = 解
    for (const c of L.cages) {
      let sum = 0, bad = false;
      for (const [r, cc] of (c.cells || [])) {
        if (!S[r] || S[r][cc] == null) { bad = true; break; }
        sum += S[r][cc];
      }
      if (bad || sum !== c.sum) { pass = fail(`${tag}: cage#${c.id} 和=${c.sum} 但解中cells和=${sum}`) && pass; }
    }
    // 预填 = 解
    let mismatch = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const g = L.boardData[r][c];
      if (g != null && g !== 0 && g !== S[r][c]) mismatch++;
    }
    if (mismatch) pass = fail(`${tag}: ${mismatch} 处预填与解冲突`) && pass;
    // 单元全覆盖 + 不重叠
    const cover = Array.from({ length: 9 }, () => new Array(9).fill(0));
    for (const c of L.cages) for (const [r, cc] of (c.cells || [])) if (r >= 0 && r < 9 && cc >= 0 && cc < 9) cover[r][cc]++;
    let uncovered = 0, overlap = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { if (cover[r][c] === 0) uncovered++; if (cover[r][c] > 1) overlap++; }
    if (uncovered) pass = fail(`${tag}: ${uncovered} 格未被任何 cage 覆盖`) && pass;
    if (overlap) pass = fail(`${tag}: ${overlap} 格被多个 cage 覆盖`) && pass;
  }

  if (pass) ok(`${tag} (score=${md.curator_score}, ${md.journeyShape}, MT${md.maxTechLevel})`);
  else allPass = false;
}

// 索引一致性
const idxPath = path.join(outDir, 'index.json');
if (!fs.existsSync(idxPath)) { allPass = fail('index.json 缺失') || allPass; }
else {
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  if (idx.total !== levelFiles.length) allPass = fail(`index.total=${idx.total} ≠ 文件数 ${levelFiles.length}`) || allPass;
  const idxIds = new Set((idx.levels || []).map((x) => x.id));
  if (idxIds.size !== levelFiles.length) allPass = fail('index.levels 与文件 id 不一致') || allPass;
  console.log(`索引: total=${idx.total}, 关卡文件=${levelFiles.length}`);
}

console.log(allPass ? '\n校验全部通过 ✅' : '\n校验存在失败 ❌');
process.exit(allPass ? 0 : 1);
