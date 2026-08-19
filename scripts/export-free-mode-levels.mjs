// 导出自由模式关卡：从生成器批次 JSON + Curator 排序 JSON + features 表，
// 抽取 UI 所需字段，落成 data/free_mode_levels/<id>.json 独立文件 + index.json。
//
// 字段来源（严格遵循导出规范）：
//   boardData / cages / solution / scenicCells / goldBypass / realTrace  -> gen_batch_30_relaxed.json
//   curator_score                                                  -> curator_top10_relaxed.json (composite)
//   journeyShape (journey_curve_shape)                            -> suzhou.db features 表
//   maxTechLevel                                                   -> gen_batch_30_relaxed.json realTrace (techLevel 最大值)
//
// 运行：node --experimental-sqlite scripts/export-free-mode-levels.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const outDir = path.join(dataDir, 'free_mode_levels');

const GEN = path.join(dataDir, 'gen_batch_30_relaxed.json');
const CUR = path.join(dataDir, 'curator_top10_relaxed.json');
const DB = path.join(dataDir, 'suzhou.db');

// ---- 读生成器批次 ----
const gen = JSON.parse(fs.readFileSync(GEN, 'utf8'));
const puzzles = gen.puzzles || gen.levels || [];
if (!puzzles.length) { console.error('生成器批次无 puzzles/levels'); process.exit(1); }

// ---- 读 Curator 排序（取 composite + 备用 journeyShape/maxTech）----
const cur = JSON.parse(fs.readFileSync(CUR, 'utf8'));
const curMap = new Map();
for (const r of cur.allRanked || cur.top || []) {
  curMap.set(r.levelId, r);
}

// ---- 读 features 表（journey_curve_shape，权威来源）----
const shapeFromDb = new Map();
try {
  const db = new DatabaseSync(DB);
  const rows = db.prepare("SELECT level_id, journey_curve_shape FROM features WHERE level_id LIKE 'V9-%'").all();
  for (const row of rows) shapeFromDb.set(row.level_id, row.journey_curve_shape);
  db.close();
} catch (e) {
  console.warn('features 表读取失败，回退到 Curator signals：', e.message);
}

function maxTechOf(realTrace) {
  let m = 0;
  for (const s of realTrace || []) {
    const l = s.techLevel || 0;
    if (l > m) m = l;
  }
  return m;
}

let written = 0;
const indexLevels = [];
const errors = [];

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const p of puzzles) {
  const id = p.levelId != null ? String(p.levelId) : null;
  if (!id) { errors.push('(无 levelId)'); continue; }

  const cur = curMap.get(id);
  const curatorScore = cur ? cur.composite : null;
  // journeyShape：优先 features 表；回退 Curator signals
  let journeyShape = shapeFromDb.get(id) || (cur && cur.signals && cur.signals.journeyCurveShape) || null;
  // maxTechLevel：优先 realTrace 计算；回退 Curator signals
  let maxTechLevel = maxTechOf(p.realTrace);
  if (!maxTechLevel && cur && cur.signals) maxTechLevel = cur.signals.maxTechLevel || null;

  const levelObj = {
    id,
    boardData: p.boardData,
    cages: (p.cages || []).map((c) => ({ id: c.id, sum: c.sum, cells: c.cells })),
    solution: p.solution,
    metadata: {
      source: 'suzhou_curator',
      batch: 'relaxed_30',
      curator_score: curatorScore,
      maxTechLevel,
      journeyShape,
      scenicCells: p.scenicCells || [],
      goldBypass: !!p.goldBypass,
    },
  };

  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(levelObj, null, 2));
  written++;
  indexLevels.push({ id, score: curatorScore, journey: journeyShape, maxTech: maxTechLevel });
}

// 索引按 curator_score 降序（无分排末）
indexLevels.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
const index = {
  version: '1.0',
  generated_at: new Date().toISOString(),
  total: indexLevels.length,
  levels: indexLevels,
};
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));

console.log(`=== 导出自由模式关卡 ===`);
console.log(`写入独立文件: ${written} 关 -> ${outDir}`);
console.log(`索引: ${outDir}/index.json (total=${indexLevels.length})`);
if (errors.length) console.log(`警告(跳过): ${errors.length} 关`);
