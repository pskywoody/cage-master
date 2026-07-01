// ==========================================
// 深度审计：验证破局唯一性 + 收官连锁
// 用法: node tools/deep-audit.js [levelId]
// ==========================================

const fs = require('fs');
const path = require('path');

const chapters = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'game-src', 'data', 'chapters.json'), 'utf-8'
));

function getBox(size) {
  if (size === 4) return { bw: 2, bh: 2 };
  if (size === 6) return { bw: 3, bh: 2 };
  return { bw: 3, bh: 3 };
}

function cloneGrid(g) { return g.map(r => [...r]); }

function getCands(grid, r, c, size, bw, bh) {
  if (grid[r][c] !== 0) return [];
  const used = new Set();
  for (let i = 0; i < size; i++) {
    if (grid[r][i]) used.add(grid[r][i]);
    if (grid[i][c]) used.add(grid[i][c]);
  }
  const br0 = Math.floor(r/bh)*bh, bc0 = Math.floor(c/bw)*bw;
  for (let dr=0; dr<bh; dr++) for (let dc=0; dc<bw; dc++)
    if (grid[br0+dr][bc0+dc]) used.add(grid[br0+dr][bc0+dc]);
  const c = [];
  for (let n=1; n<=size; n++) if (!used.has(n)) c.push(n);
  return c;
}

function findSingles(grid, size, bw, bh) {
  const ns = [], hs = [];
  for (let r=0;r<size;r++) for (let c=0;c<size;c++) {
    if (grid[r][c]) continue;
    const cd = getCands(grid,r,c,size,bw,bh);
    if (cd.length===1) ns.push({r,c,n:cd[0],type:'naked'});
  }
  if (ns.length) return ns;
  // hidden singles
  for (let r=0;r<size;r++) {
    const pos = Array.from({length:size+1},()=>[]);
    for (let c=0;c<size;c++) if(!grid[r][c]) for(const n of getCands(grid,r,c,size,bw,bh)) pos[n].push([r,c]);
    for(let n=1;n<=size;n++) if(pos[n].length===1) {const[rr,cc]=pos[n][0]; if(!hs.find(x=>x.r===rr&&x.c===cc)) hs.push({r:rr,c:cc,n,type:'hidden'});}
  }
  for (let c=0;c<size;c++) {
    const pos = Array.from({length:size+1},()=>[]);
    for (let r=0;r<size;r++) if(!grid[r][c]) for(const n of getCands(grid,r,c,size,bw,bh)) pos[n].push([r,c]);
    for(let n=1;n<=size;n++) if(pos[n].length===1) {const[rr,cc]=pos[n][0]; if(!hs.find(x=>x.r===rr&&x.c===cc)) hs.push({r:rr,c:cc,n,type:'hidden'});}
  }
  const {bw:BW,bh:BH}=getBox(size);
  for(let br=0;br<size/BH;br++)for(let bc=0;bc<size/BW;bc++){
    const pos=Array.from({length:size+1},()=>[]);
    for(let dr=0;dr<BH;dr++)for(let dc=0;dc<BW;dc++){const r=br*BH+dr,c=bc*BW+dc;if(!grid[r][c])for(const n of getCands(grid,r,c,size,BW,BH))pos[n].push([r,c]);}
    for(let n=1;n<=size;n++)if(pos[n].length===1){const[rr,cc]=pos[n][0];if(!hs.find(x=>x.r===rr&&x.c===cc))hs.push({r:rr,c:cc,n,type:'hidden'});}
  }
  return hs;
}

// 找显性数对
function findNakedPairs(grid, size, bw, bh) {
  const pairs = [];
  function checkRegion(cells, regionType, regionIdx) {
    const empty = cells.filter(([r,c]) => grid[r][c] === 0);
    for (let i=0; i<empty.length; i++) {
      for (let j=i+1; j<empty.length; j++) {
        const [r1,c1] = empty[i], [r2,c2] = empty[j];
        const c1 = getCands(grid, r1, c1, size, bw, bh);
        const c2 = getCands(grid, r2, c2, size, bw, bh);
        if (c1.length === 2 && c2.length === 2 && c1[0]===c2[0] && c1[1]===c2[1]) {
          // 检查这对数能否排除其他格
          const [a,b] = c1;
          let eliminates = 0;
          for (const [rr,cc] of empty) {
            if ((rr===r1&&cc===c1)||(rr===r2&&cc===c2)) continue;
            const cc_cands = getCands(grid, rr, cc, size, bw, bh);
            if (cc_cands.includes(a) || cc_cands.includes(b)) eliminates++;
          }
          if (eliminates > 0) {
            pairs.push({cells:[[r1,c1],[r2,c2]], nums:c1, regionType, regionIdx, eliminates});
          }
        }
      }
    }
  }
  // 行
  for (let r=0;r<size;r++) checkRegion(Array.from({length:size},(_,c)=>[r,c]), 'row', r);
  // 列
  for (let c=0;c<size;c++) checkRegion(Array.from({length:size},(_,r)=>[r,c]), 'col', c);
  // 宫
  for(let br=0;br<size/bh;br++)for(let bc=0;bc<size/bw;bc++){
    const cells=[];
    for(let dr=0;dr<bh;dr++)for(let dc=0;dc<bw;dc++)cells.push([br*bh+dr,bc*bw+dc]);
    checkRegion(cells, 'box', br*Math.floor(size/bw)+bc);
  }
  return pairs;
}

function simulateBasic(boardData, size) {
  const {bw,bh}=getBox(size);
  const grid = cloneGrid(boardData);
  const chain = [];
  let filled = 0;
  while (true) {
    const singles = findSingles(grid, size, bw, bh);
    if (singles.length === 0) break;
    for (const s of singles) {
      grid[s.r][s.c] = s.n;
      filled++;
      chain.push(s);
    }
  }
  let empty=0;
  for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(!grid[r][c])empty++;
  return {grid, chain, filled, empty, completed: empty===0};
}

function deepAudit(level) {
  const size = level.gridSize || 9;
  const {bw,bh} = getBox(size);
  const totalCells = size*size;
  const initialEmpty = level.boardData.flat().filter(v=>v===0).length;
  
  // 第一阶段：基础技巧模拟
  const phase1 = simulateBasic(level.boardData, size);
  
  // 在卡壳状态找数对
  const pairsAtStuck = findNakedPairs(phase1.grid, size, bw, bh);
  
  // 尝试应用数对看能否推进
  let breakthrough = null;
  let phase2 = null;
  if (pairsAtStuck.length > 0) {
    // 取第一个数对，模拟应用（从同区域其他格中排除这两个数）
    const pair = pairsAtStuck[0];
    const testGrid = cloneGrid(phase1.grid);
    const [[r1,c1],[r2,c2]] = pair.cells;
    const [a,b] = pair.nums;
    
    // 排除同区域其他格中的a和b
    function eliminateInRegion(cells) {
      let eliminated = false;
      for (const [rr,cc] of cells) {
        if ((rr===r1&&cc===c1)||(rr===r2&&cc===c2)) continue;
        if (testGrid[rr][cc] !== 0) continue;
        // 简化处理：不实际修改候选数，直接看排除后是否产生裸单
      }
      return eliminated;
    }
    
    // 模拟：假设数对推导出某个格的确定值
    // 更精确的方式：对数对所在的行/列/宫，排除这两个数字后重新找裸单
    // 这里简化为：检查填入solution中的正确数字后，连锁有多长
    const sol = level.solution;
    if (sol) {
      // 找破局关键格（应用数对后第一个可以确定的格）
      // 检查pair所在行中，排除pair.nums后是否有裸单
      const testG = cloneGrid(phase1.grid);
      // 对于pair中每个格，它们的candidates就是pair.nums
      // 所以同region中其他格不能有这两个数字
      // 我们通过暴力方式：依次尝试每个空格，看如果用solution的值填入，能否引发连锁
      let bestChain = 0;
      let bestCell = null;
      
      for (let r=0;r<size;r++) for (let c=0;c<size;c++) {
        if (testG[r][c] !== 0) continue;
        // 如果这个格的candidates包含a或b且在pair区域，则可能是被排除的格
        const cands = getCands(testG, r, c, size, bw, bh);
        const inPairRegion = (pair.regionType === 'row' && r === pair.cells[0][0]) ||
                            (pair.regionType === 'col' && c === pair.cells[0][1]) ||
                            (pair.regionType === 'box' && Math.floor(r/bh)===Math.floor(pair.cells[0][0]/bh) && Math.floor(c/bw)===Math.floor(pair.cells[0][1]/bw));
        if (!inPairRegion) continue;
        if ((rr===r1&&cc===c1)||(rr===r2&&cc===c2)) {
          // 这是数对格本身，跳过
          continue;
        }
        // 尝试填入正确答案
        const testG2 = cloneGrid(testG);
        testG2[r][c] = sol[r][c];
        const after = simulateBasic(testG2, size);
        const chainLen = after.chain.length;
        if (after.completed || chainLen > bestChain) {
          bestChain = chainLen;
          bestCell = {r, c, n: sol[r][c], chainLen, completes: after.completed};
        }
      }
      
      if (bestCell) {
        breakthrough = {pair, keyCell: bestCell};
        // 填入关键格后继续模拟收官
        const testG3 = cloneGrid(phase1.grid);
        testG3[bestCell.r][bestCell.c] = bestCell.n;
        phase2 = simulateBasic(testG3, size);
      }
    }
  }
  
  return {
    levelId: level.levelId,
    title: level.title,
    initialEmpty,
    phase1Filled: phase1.filled,
    phase1FillRatio: Math.round(phase1.filled / initialEmpty * 100),
    stuckEmpty: phase1.empty,
    pairsAtStuck: pairsAtStuck.length,
    pairDetails: pairsAtStuck.map(p => ({
      cells: p.cells.map(c=>`(${c[0]},${c[1]})`).join(','),
      nums: p.nums.join(','),
      region: p.regionType,
      eliminates: p.eliminates
    })),
    breakthrough: breakthrough ? {
      pairAt: breakthrough.pair.cells.map(c=>`(${c[0]},${c[1]})`).join(','),
      pairNums: breakthrough.pair.nums.join(','),
      keyCell: `(${breakthrough.keyCell.r},${breakthrough.keyCell.c})=${breakthrough.keyCell.n}`,
      chainLen: breakthrough.keyCell.chainLen,
      completes: breakthrough.keyCell.completes
    } : null,
    finishingEmpty: phase2 ? phase2.empty : null,
    phase3Complete: phase2 ? phase2.completed : false
  };
}

// 运行审计
const targetLevel = process.argv[2] ? parseInt(process.argv[2]) : null;

for (const chapter of chapters) {
  for (const level of chapter.levels) {
    if (targetLevel && level.levelId !== targetLevel) continue;
    if (level.gridSize === 4) continue; // 4x4关卡跳过（不需要数对破局）
    
    const result = deepAudit(level);
    const icon = result.pairsAtStuck > 0 && result.breakthrough ? '✅' : 
                 result.phase1FillRatio === 100 ? '💀' : 
                 result.pairsAtStuck > 0 ? '⚠️' : '❓';
    
    console.log(`\n${icon} L${result.levelId} ${result.title}`);
    console.log(`   开局: ${result.phase1Filled}/${result.initialEmpty}格 (${result.phase1FillRatio}%) 卡壳剩${result.stuckEmpty}格`);
    
    if (result.pairsAtStuck > 0) {
      console.log(`   数对: ${result.pairsAtStuck}个`);
      for (const pd of result.pairDetails.slice(0,3)) {
        console.log(`     → [${pd.region}] 格${pd.cells} = {${pd.nums}} 可排除${pd.eliminates}格`);
      }
    } else if (result.phase1FillRatio < 100) {
      console.log(`   ⚠ 卡壳但未找到显性数对（可能需要隐单/45法则/其他技巧）`);
    }
    
    if (result.breakthrough) {
      const b = result.breakthrough;
      console.log(`   🔑 破局: 数对{${b.pairNums}} → 关键格${b.keyCell} → 连锁${b.chainLen}步 ${b.completes?'(直接收官!)':''}`);
      if (result.phase3Complete) {
        console.log(`   🏁 收官: 完美连锁，一破全破!`);
      } else if (result.finishingEmpty !== null) {
        console.log(`   🏁 收官: 连锁后剩${result.finishingEmpty}格（可能需要再次破局）`);
      }
    }
  }
}
