// ============================================================
//  demo-whatif-snapshot-override.mjs
//  演示 WhatIf 假设模式「快照滚动覆盖」逻辑
//  模拟用户连续创建 4 个快照，验证：最多 3 张，第 4 次覆盖最旧
//
//  运行：node scripts/demo-whatif-snapshot-override.mjs
// ============================================================

import { WhatIfManager } from '../core/what-if-manager.js';

// ---------- 1. mock 棋盘（4x4，够演示即可） ----------
function makeMockBoard(size = 4) {
  const cells = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      row.push({
        r, c,
        fillNum: 0,
        fixedNum: 0,
        candidates: new Set([1, 2, 3, 4]),
        eliminations: new Set(),
        isError: false,
        isCageSumError: false,
        tempWrongNum: null,
        isLocked: false,
        isSelected: false,
      });
    }
    cells.push(row);
  }
  return {
    size,
    cells,
    selectedCell: null,
    selectedCells: [],
    selectedCageId: null,
    selectedCageIds: [],
    history: [],
    redoStack: [],
  };
}

// ---------- 2. 模拟「用户填数 → 自动创建快照」 ----------
let snapshotChangedCount = 0; // 记录 onSnapshotsChanged 触发次数（模拟 UI 刷新）

const board = makeMockBoard(4);
const manager = new WhatIfManager(board, {
  maxSnapshots: 3,
  // 模拟 game.html 里的 UI 刷新回调
  onSnapshotsChanged: () => { snapshotChangedCount++; },
});

console.log('=== 进入 WhatIf 假设模式（根快照已保存）===');
manager.activate();

function userFill(r, c, num, step) {
  // 1) 用户填数
  board.cells[r][c].fillNum = num;
  board.cells[r][c].candidates.clear();
  // 2) WhatIf 模式下填数自动创建快照
  const snap = manager.createSnapshot(`填数 ${num} @ r${r + 1}c${c + 1}（步骤${step}）`);
  // 3) 打印当前快照栈（labels 从旧到新）
  const labels = manager.snapshots.map((s) => s.label);
  console.log(`[步骤${step}] 创建快照 -> ${snap.label}`);
  console.log(`          快照栈(${manager.snapshots.length}/3): ${JSON.stringify(labels, null, 0)}`);
  return snap;
}

// ---------- 3. 连续创建 4 个快照 ----------
console.log('\n=== 用户连续填 4 个数（第 4 次应覆盖最旧）===');
userFill(0, 0, 4, 1); // 快照1
userFill(0, 1, 3, 2); // 快照2
userFill(1, 0, 2, 3); // 快照3
userFill(1, 1, 1, 4); // 快照4 —— 期望：覆盖快照1

// ---------- 4. 断言验证 ----------
console.log('\n=== 验证结果 ===');
const labels = manager.snapshots.map((s) => s.label);
const pass1 = manager.snapshots.length === 3;
const pass2 = !labels.some((l) => l.includes('步骤1'));
const pass3 = labels.some((l) => l.includes('步骤4'));
const pass4 = snapshotChangedCount === 4; // 4 次 createSnapshot 各触发一次 UI 刷新
const pass5 = manager.getRootSnapshot() !== null; // 根快照始终保留

console.log(`① 快照数 = ${manager.snapshots.length}，期望 3        ${pass1 ? 'PASS' : 'FAIL'}`);
console.log(`② 最旧快照(步骤1)已被覆盖              ${pass2 ? 'PASS' : 'FAIL'}`);
console.log(`③ 最新快照(步骤4)在栈中                ${pass3 ? 'PASS' : 'FAIL'}`);
console.log(`④ UI 刷新回调触发 ${snapshotChangedCount} 次，期望 4    ${pass4 ? 'PASS' : 'FAIL'}`);
console.log(`⑤ 根快照仍保留（可彻底回退）            ${pass5 ? 'PASS' : 'FAIL'}`);

const allPass = pass1 && pass2 && pass3 && pass4 && pass5;
console.log(`\n总体：${allPass ? 'ALL PASS ✅ 滚动覆盖逻辑正确' : 'FAIL ❌ 逻辑有问题'}`);

// ---------- 5. 附加演示：回退 / 彻底回退 ----------
console.log('\n=== 附加：回退一步（弹栈）===');
manager.undo();
console.log(`回退后快照栈(${manager.snapshots.length}/3): ${JSON.stringify(manager.snapshots.map((s) => s.label))}`);

console.log('\n=== 附加：彻底回退到根（清空分支，不退出）===');
manager.reset();
console.log(`reset 后快照数 = ${manager.snapshots.length}（期望 0），currentIndex = ${manager.currentSnapshotIndex}（期望 -1）`);

// 退出（不采纳 → 回根）
manager.deactivate(false);
console.log('\n=== 退出假设模式（不采纳）===');
console.log(`isActive = ${manager.isActive}（期望 false），分支已全部丢弃`);
