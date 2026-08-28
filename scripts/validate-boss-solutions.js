import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEVELS = path.join(__dirname, '..', 'data', 'levels');

const bossIds = [109, 209, 309, 409, 509, 609, 709];

let bad = 0;
for (const id of bossIds) {
  const p = path.join(LEVELS, `level-${id}.json`);
  if (!fs.existsSync(p)) { console.log(`[SKIP] level-${id} 不存在`); continue; }
  const L = JSON.parse(fs.readFileSync(p, 'utf8'));
  const bd = L.boardData, sol = L.solution;
  const g = L.gridSize || 9;
  if (!Array.isArray(sol) || sol.length !== g) { console.log(`[BUG] ${id} solution 非 ${g}x${g}`); bad++; continue; }
  const issues = [];
  const b = 3, w = 3; // 仅 4x4/9x9；其它尺寸按 4x4 处理
  const boxH = g === 9 ? 3 : (g === 6 ? 2 : 2);
  const boxW = g / boxH;
  for (let r = 0; r < g; r++) {
    if (sol[r].length !== g) issues.push(`行${r} 长度${sol[r].length}`);
    for (let c = 0; c < g; c++) if (bd[r][c] && bd[r][c] !== sol[r][c]) issues.push(`固定格[${r}][${c}]=${bd[r][c]} != sol=${sol[r][c]}`);
    const rowSet = new Set(sol[r]); if (rowSet.size !== g || [...rowSet].some(x => x < 1 || x > g)) issues.push(`行${r} 非法/重复`);
    const colSet = new Set(); for (let rr = 0; rr < g; rr++) colSet.add(sol[rr][r]); if (colSet.size !== g) issues.push(`列${r} 重复/非法`);
  }
  for (let br = 0; br < boxH; br++) for (let bc = 0; bc < boxW; bc++) {
    const box = new Set();
    for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) box.add(sol[br * boxH + dr][bc * boxW + dc]);
    if (box.size !== g) issues.push(`宫(${br},${bc}) 重复`);
  }
  if (Array.isArray(L.cages)) for (const cage of L.cages) {
    let sum = 0; for (const [r, c] of cage.cells) sum += sol[r][c];
    if (sum !== cage.sum) issues.push(`笼${cage.id} 和=${sum} != ${cage.sum}`);
  }
  if (issues.length) { bad++; console.log(`[BUG] ${id}「${L.title}」 ${issues.length}处：`, issues.slice(0, 6).join('; ')); }
  else console.log(`[OK] ${id}「${L.title}」 一致`);
}
console.log(`\n数据有问题的 Boss 关数 = ${bad}`);