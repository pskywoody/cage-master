// ==========================================
// 关卡三阶段质量审计脚本
// 模拟解题过程，检查每关是否有合理的开局→破局→收官节奏
// ==========================================

const fs = require('fs');
const path = require('path');

const chapters = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'game-src', 'data', 'chapters.json'), 'utf-8'
));

function getBoxSize(size) {
  if (size === 4) return { boxW: 2, boxH: 2 };
  if (size === 6) return { boxW: 3, boxH: 2 };
  return { boxW: 3, boxH: 3 };
}

function cloneGrid(grid) {
  return grid.map(row => [...row]);
}

function getCandidates(grid, r, c, cages, size, boxW, boxH) {
  if (grid[r][c] !== 0) return [];
  const used = new Set();
  
  // 行
  for (let i = 0; i < size; i++) {
    if (grid[r][i] !== 0) used.add(grid[r][i]);
  }
  // 列
  for (let i = 0; i < size; i++) {
    if (grid[i][c] !== 0) used.add(grid[i][c]);
  }
  // 宫
  const br = Math.floor(r / boxH) * boxH;
  const bc = Math.floor(c / boxW) * boxW;
  for (let dr = 0; dr < boxH; dr++)
    for (let dc = 0; dc < boxW; dc++)
      if (grid[br+dr][bc+dc] !== 0) used.add(grid[br+dr][bc+dc]);
  
  // 笼子约束：如果某个笼子只有一个空格，它必须等于sum减去其他已填数字
  // 这里简化处理，不做cage sum推理，只做基础数独规则
  
  const cands = [];
  for (let n = 1; n <= size; n++) if (!used.has(n)) cands.push(n);
  return cands;
}

function findNakedSingles(grid, cages, size, boxW, boxH) {
  const result = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== 0) continue;
      const cands = getCandidates(grid, r, c, cages, size, boxW, boxH);
      if (cands.length === 1) {
        result.push({ r, c, num: cands[0], technique: 'nakedSingle' });
      }
    }
  }
  return result;
}

function findHiddenSingles(grid, cages, size, boxW, boxH) {
  const result = [];
  // 检查每行
  for (let r = 0; r < size; r++) {
    const pos = Array.from({length: size+1}, () => []);
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== 0) continue;
      const cands = getCandidates(grid, r, c, cages, size, boxW, boxH);
      for (const n of cands) pos[n].push([r, c]);
    }
    for (let n = 1; n <= size; n++) {
      if (pos[n].length === 1) {
        const [rr, cc] = pos[n][0];
        // 检查是否已经被naked single找到
        if (!result.find(x => x.r === rr && x.c === cc)) {
          result.push({ r: rr, c: cc, num: n, technique: 'hiddenSingle' });
        }
      }
    }
  }
  // 检查每列
  for (let c = 0; c < size; c++) {
    const pos = Array.from({length: size+1}, () => []);
    for (let r = 0; r < size; r++) {
      if (grid[r][c] !== 0) continue;
      const cands = getCandidates(grid, r, c, cages, size, boxW, boxH);
      for (const n of cands) pos[n].push([r, c]);
    }
    for (let n = 1; n <= size; n++) {
      if (pos[n].length === 1) {
        const [rr, cc] = pos[n][0];
        if (!result.find(x => x.r === rr && x.c === cc)) {
          result.push({ r: rr, c: cc, num: n, technique: 'hiddenSingle' });
        }
      }
    }
  }
  // 检查每宫
  for (let br = 0; br < size / boxH; br++) {
    for (let bc = 0; bc < size / boxW; bc++) {
      const pos = Array.from({length: size+1}, () => []);
      for (let dr = 0; dr < boxH; dr++) {
        for (let dc = 0; dc < boxW; dc++) {
          const r = br * boxH + dr, c = bc * boxW + dc;
          if (grid[r][c] !== 0) continue;
          const cands = getCandidates(grid, r, c, cages, size, boxW, boxH);
          for (const n of cands) pos[n].push([r, c]);
        }
      }
      for (let n = 1; n <= size; n++) {
        if (pos[n].length === 1) {
          const [rr, cc] = pos[n][0];
          if (!result.find(x => x.r === rr && x.c === cc)) {
            result.push({ r: rr, c: cc, num: n, technique: 'hiddenSingle' });
          }
        }
      }
    }
  }
  return result;
}

/**
 * 模拟基础技巧连锁，返回{filled, empty, steps, grid}
 */
function simulateBasic(level) {
  const size = level.gridSize || 9;
  const { boxW, boxH } = getBoxSize(size);
  const grid = cloneGrid(level.boardData);
  const cages = level.cages || [];
  const steps = [];
  let filled = 0;
  let initialEmpty = 0;
  
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r][c] === 0) initialEmpty++;
  
  while (true) {
    const ns = findNakedSingles(grid, cages, size, boxW, boxH);
    if (ns.length > 0) {
      for (const s of ns) {
        grid[s.r][s.c] = s.num;
        filled++;
        steps.push({ ...s, phase: 'basic' });
      }
      continue;
    }
    const hs = findHiddenSingles(grid, cages, size, boxW, boxH);
    if (hs.length > 0) {
      for (const s of hs) {
        grid[s.r][s.c] = s.num;
        filled++;
        steps.push({ ...s, phase: 'basic' });
      }
      continue;
    }
    break;
  }
  
  let empty = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r][c] === 0) empty++;
  
  return { grid, filled, empty, initialEmpty, steps, fillRatio: filled / initialEmpty };
}

/**
 * 审计单个关卡
 */
function auditLevel(level) {
  const size = level.gridSize || 9;
  const totalCells = size * size;
  const initialGiven = level.boardData.flat().filter(v => v !== 0).length;
  const initialEmpty = totalCells - initialGiven;
  
  const sim = simulateBasic(level);
  const collapseRatio = sim.initialEmpty > 0 ? sim.filled / sim.initialEmpty : 1;
  
  // 评估三阶段质量
  let rating = 'A';
  let issues = [];
  
  // 开局阶段：应该有足够的基础填空（15%-40%）让玩家热身
  if (sim.fillRatio > 0.85) {
    rating = 'F';
    issues.push('基础技巧直接填满全盘，无破局点');
  } else if (sim.fillRatio > 0.7) {
    rating = 'D';
    issues.push(`基础连锁过多(${Math.round(collapseRatio*100)}%)，破局点过晚`);
  } else if (sim.fillRatio < 0.1 && initialEmpty > 4) {
    rating = 'C';
    issues.push('开局裸单过少，玩家可能一开始就卡壳');
  }
  
  // 收官阶段：破局后应该有连锁反应
  // （这个需要检测具体技巧，这里只看卡壳时剩余空格）
  if (sim.empty === 1 && sim.fillRatio < 1) {
    issues.push('仅剩1格时才卡壳，收官链太短');
  }
  
  // 笼子验证
  const cages = level.cages || [];
  let cageCoverage = 0;
  for (const cage of cages) cageCoverage += cage.cells.length;
  
  const hasTriggers = level.triggers && level.triggers.length > 0;
  const hasDialogues = level.preDialog || level.clearDialog;
  
  return {
    levelId: level.levelId,
    title: level.title,
    size,
    difficulty: level.difficulty,
    initialGiven,
    initialEmpty,
    basicFilled: sim.filled,
    stuckEmpty: sim.empty,
    collapseRatio: Math.round(collapseRatio * 100),
    hasTriggers,
    hasDialogues,
    cageCount: cages.length,
    rating,
    issues
  };
}

// ========== 主程序 ==========
console.log('========================================');
console.log('  关卡三阶段质量审计');
console.log('========================================\n');

const allResults = [];

for (const chapter of chapters) {
  console.log(`\n━━━ 第${chapter.chapterId}章: ${chapter.title} ━━━`);
  
  const results = [];
  for (const level of chapter.levels) {
    const result = auditLevel(level);
    results.push(result);
    allResults.push(result);
    
    const ratingIcon = { 'A': '✅', 'B': '✓', 'C': '⚠', 'D': '❌', 'F': '💀' }[result.rating];
    const trigIcon = result.hasTriggers ? '🔔' : '  ';
    console.log(`  ${ratingIcon} ${trigIcon} L${result.levelId} ${result.title.padEnd(12)} ` +
      `given:${String(result.initialGiven).padStart(2)}/${result.size*result.size} ` +
      `fill:${String(result.collapseRatio).padStart(3)}% ` +
      `stuck:${String(result.stuckEmpty).padStart(2)}格 ` +
      `${result.issues.length > 0 ? '→ ' + result.issues.join('; ') : ''}`);
  }
  
  // 章节统计
  const avg = Math.round(results.reduce((s, r) => s + r.collapseRatio, 0) / results.length);
  const badCount = results.filter(r => r.rating === 'D' || r.rating === 'F').length;
  const noTriggerCount = results.filter(r => !r.hasTriggers).length;
  console.log(`  → 章节平均: 基础连锁${avg}%, 问题关${badCount}个, 无触发器${noTriggerCount}个`);
}

// 总结
console.log('\n━━━ 总结 ━━━');
const gradeCount = { A: 0, B: 0, C: 0, D: 0, F: 0 };
let noTrigCount = 0;
for (const r of allResults) {
  gradeCount[r.rating]++;
  if (!r.hasTriggers) noTrigCount++;
}
console.log(`  总计 ${allResults.length} 关`);
console.log(`  ✅ A级(优秀): ${gradeCount.A}关`);
console.log(`  ⚠  C级(一般): ${gradeCount.C}关`);
console.log(`  ❌ D级(坍塌): ${gradeCount.D}关`);
console.log(`  💀 F级(无解): ${gradeCount.F}关`);
console.log(`  🔔 有触发器: ${allResults.length - noTrigCount}关 / 无触发器: ${noTrigCount}关`);
