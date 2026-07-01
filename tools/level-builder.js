// ==========================================
// 教学关卡构造器 - 开局/破局/收官 三阶段精确控制
// ==========================================
// 设计理念：
//   开局(Opening)：用已学技巧能填15-40%空格，热身
//   破局(Breakthrough)：卡壳，必须使用本关新技巧，触发引导
//   收官(Finishing)：破局后裸单连锁填满剩余
//
// 使用方式：node tools/build-teaching-level.js

const fs = require('fs');
const path = require('path');

function getBox(size) {
  if (size === 4) return { bw: 2, bh: 2 };
  if (size === 6) return { bw: 3, bh: 2 };
  return { bw: 3, bh: 3 };
}

function cloneGrid(g) { return g.map(r => [...r]); }

function getCands(grid, r, c, size, bw, bh) {
  if (grid[r][c] !== 0) return [];
  const used = new Set();
  for (let i = 0; i < size; i++) { if (grid[r][i]) used.add(grid[r][i]); if (grid[i][c]) used.add(grid[i][c]); }
  const br0 = Math.floor(r/bh)*bh, bc0 = Math.floor(c/bw)*bw;
  for (let dr=0; dr<bh; dr++) for (let dc=0; dc<bw; dc++) if (grid[br0+dr][bc0+dc]) used.add(grid[br0+dr][bc0+dc]);
  const cands = [];
  for (let n=1; n<=size; n++) if (!used.has(n)) cands.push(n);
  return cands;
}

function findSingles(grid, size, bw, bh) {
  const ns = [], hs = [];
  // naked singles
  for (let r=0; r<size; r++) for (let c=0; c<size; c++) {
    if (grid[r][c]) continue;
    const cd = getCands(grid,r,c,size,bw,bh);
    if (cd.length===1) ns.push({r,c,n:cd[0]});
  }
  if (ns.length) return {type:'naked', singles:ns};
  // hidden singles in row
  for (let r=0; r<size; r++) {
    const pos = Array.from({length:size+1},()=>[]);
    for (let c=0; c<size; c++) { if (!grid[r][c]) for (const n of getCands(grid,r,c,size,bw,bh)) pos[n].push([r,c]); }
    for (let n=1; n<=size; n++) if (pos[n].length===1) { const [rr,cc]=pos[n][0]; if (!hs.find(x=>x.r===rr&&x.c===cc)) hs.push({r:rr,c:cc,n}); }
  }
  // hidden singles in col
  for (let c=0; c<size; c++) {
    const pos = Array.from({length:size+1},()=>[]);
    for (let r=0; r<size; r++) { if (!grid[r][c]) for (const n of getCands(grid,r,c,size,bw,bh)) pos[n].push([r,c]); }
    for (let n=1; n<=size; n++) if (pos[n].length===1) { const [rr,cc]=pos[n][0]; if (!hs.find(x=>x.r===rr&&x.c===cc)) hs.push({r:rr,c:cc,n}); }
  }
  // hidden singles in box
  for (let br=0; br<size/bh; br++) for (let bc=0; bc<size/bw; bc++) {
    const pos = Array.from({length:size+1},()=>[]);
    for (let dr=0; dr<bh; dr++) for (let dc=0; dc<bw; dc++) { const r=br*bh+dr,c=bc*bw+dc; if (!grid[r][c]) for (const n of getCands(grid,r,c,size,bw,bh)) pos[n].push([r,c]); }
    for (let n=1; n<=size; n++) if (pos[n].length===1) { const [rr,cc]=pos[n][0]; if (!hs.find(x=>x.r===rr&&x.c===cc)) hs.push({r:rr,c:cc,n}); }
  }
  if (hs.length) return {type:'hidden', singles:hs};
  return null;
}

/**
 * 模拟解题，返回{grid, steps, stuckEmpty, fillRatio, completed}
 */
function simulate(boardData, size, cages45=null) {
  const {bw, bh} = getBox(size);
  const grid = cloneGrid(boardData);
  const steps = [];
  let filled = 0, totalEmpty = 0;
  for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (!grid[r][c]) totalEmpty++;
  
  while (true) {
    const s = findSingles(grid, size, bw, bh);
    if (!s) break;
    for (const x of s.singles) { grid[x.r][x.c] = x.n; filled++; steps.push({...x, t:s.type}); }
  }
  let stuck = 0;
  for (let r=0;r<size;r++) for (let c=0;c<size;c++) if (!grid[r][c]) stuck++;
  return {grid, steps, filled, stuck, totalEmpty, fillRatio: totalEmpty?filled/totalEmpty:1, completed: stuck===0};
}

/**
 * 移除格子，确保移除后仍然能通过指定技巧解出
 * 从solution出发，保留givenCells集合，其余置0，验证可解性
 */
function buildFromSolution(solution, givenCells, size, cages=null) {
  const {bw, bh} = getBox(size);
  const grid = Array.from({length:size}, (_,r) => Array.from({length:size}, (_,c) => 
    givenCells.has(`${r},${c}`) ? solution[r][c] : 0));
  const sim = simulate(grid, size, cages);
  return { grid, ...sim };
}

/**
 * 数字映射变换
 */
function remapSolution(sol, size) {
  const perm = [1,2,3,4,5,6,7,8,9].slice(0,size);
  for (let i = perm.length-1; i>0; i--) { const j = Math.floor(Math.random()*(i+1)); [perm[i],perm[j]]=[perm[j],perm[i]]; }
  const map = [0,...perm];
  return sol.map(r => r.map(v => map[v]));
}

/**
 * 验证数组合法性
 */
function isValidSolution(sol, size) {
  const {bw,bh} = getBox(size);
  // rows
  for (let r=0;r<size;r++) { const s=new Set(); for(let c=0;c<size;c++){if(sol[r][c]<1||sol[r][c]>size)return false;s.add(sol[r][c]);} if(s.size!==size)return false; }
  // cols
  for (let c=0;c<size;c++) { const s=new Set(); for(let r=0;r<size;r++)s.add(sol[r][c]); if(s.size!==size)return false; }
  // boxes
  for (let br=0;br<size/bh;br++)for(let bc=0;bc<size/bw;bc++){const s=new Set();for(let dr=0;dr<bh;dr++)for(let dc=0;dc<bw;dc++)s.add(sol[br*bh+dr][bc*bw+dc]);if(s.size!==size)return false;}
  return true;
}

/**
 * 验证笼子和值
 */
function verifyCages(sol, cages) {
  if (!cages) return true;
  for (const cage of cages) {
    const sum = cage.cells.reduce((s,[r,c]) => s+sol[r][c], 0);
    if (sum !== cage.sum) return false;
  }
  return true;
}

function printGrid(grid, size) {
  const {bw,bh} = getBox(size);
  for (let r=0;r<size;r++) {
    let line = '';
    for (let c=0;c<size;c++) {
      line += grid[r][c] || '·';
      if ((c+1)%bw===0 && c<size-1) line += '│';
    }
    console.log(line);
    if ((r+1)%bh===0 && r<size-1) {
      let sep = '';
      for (let c=0;c<size;c++) { sep += '─'; if ((c+1)%bw===0 && c<size-1) sep += '┼'; }
      console.log(sep);
    }
  }
}

module.exports = { getBox, cloneGrid, getCands, findSingles, simulate, buildFromSolution, remapSolution, isValidSolution, verifyCages, printGrid };
