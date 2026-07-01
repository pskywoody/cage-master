// ==========================================
// 构造Naked Pair残局教学关 - 扩展搜索
// ==========================================

const fs = require('fs');
const path = require('path');
const builder = require('./level-builder');

// 数独解（有效）
const solution = [
  [4,8,6,7,3,2,5,1,9],
  [5,1,3,6,9,8,4,2,7],
  [9,2,7,1,5,4,6,8,3],
  [3,5,4,9,8,7,2,6,1],
  [7,9,1,2,6,5,8,3,4],
  [2,6,8,3,4,1,9,7,5],
  [8,4,2,5,1,3,7,9,6],
  [6,3,5,8,7,9,1,4,2],
  [1,7,9,4,2,6,3,5,8]
];

// 用PuzzleTransformer生成多个变体来增加搜索空间
const { PuzzleTransformer } = require('./puzzle-transformer-node');
const transformer = new PuzzleTransformer();

const {bw, bh} = builder.getBox(9);

function getCands(grid, r, c) {
  return builder.getCands(grid, r, c, 9, bw, bh);
}

function findNakedPairsStuck(stuck) {
  const pairs = [];
  for (let r=0;r<9;r++) {
    const empties = [];
    for (let c=0;c<9;c++) if (stuck[r][c]===0) empties.push([r,c]);
    for (let i=0;i<empties.length;i++) for(let j=i+1;j<empties.length;j++) {
      const [r1,c1]=empties[i],[r2,c2]=empties[j];
      const cd1=getCands(stuck,r1,c1),cd2=getCands(stuck,r2,c2);
      if(cd1.length===2&&cd2.length===2&&cd1[0]===cd2[0]&&cd1[1]===cd2[1]) {
        const[a,b]=cd1;
        let elim=[];
        for(const[rr,cc] of empties) {
          if((rr===r1&&cc===c1)||(rr===r2&&cc===c2)) continue;
          const cd=getCands(stuck,rr,cc);
          if(cd.includes(a)||cd.includes(b)) {
            elim.push({cell:[rr,cc],oldCands:cd,newCands:cd.filter(n=>n!==a&&n!==b)});
          }
        }
        pairs.push({cells:[[r1,c1],[r2,c2]],nums:cd1,eliminates:elim,row:r});
      }
    }
  }
  // 也检查宫和列
  for (let idx=0;idx<9;idx++) {
    // 宫
    const br=Math.floor(idx/3)*3, bc=(idx%3)*3;
    const empties=[];
    for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++){const r=br+dr,c=bc+dc;if(stuck[r][c]===0)empties.push([r,c]);}
    for(let i=0;i<empties.length;i++)for(let j=i+1;j<empties.length;j++){
      const[r1,c1]=empties[i],[r2,c2]=empties[j];
      const cd1=getCands(stuck,r1,c1),cd2=getCands(stuck,r2,c2);
      if(cd1.length===2&&cd2.length===2&&cd1[0]===cd2[0]&&cd1[1]===cd2[1]){
        const[a,b]=cd1;
        let elim=[];
        for(const[rr,cc] of empties){
          if((rr===r1&&cc===c1)||(rr===r2&&cc===c2))continue;
          const cd=getCands(stuck,rr,cc);
          if(cd.includes(a)||cd.includes(b))elim.push({cell:[rr,cc],oldCands:cd,newCands:cd.filter(n=>n!==a&&n!==b)});
        }
        if(elim.length>0&&!pairs.find(p=>p.cells[0][0]===r1&&p.cells[0][1]===c1&&p.cells[1][0]===r2&&p.cells[1][1]===c2))
          pairs.push({cells:[[r1,c1],[r2,c2]],nums:cd1,eliminates:elim,box:idx});
      }
    }
  }
  return pairs;
}

function evaluate(emptyCells, sol) {
  const board = sol.map(r=>[...r]);
  for (const [r,c] of emptyCells) board[r][c]=0;
  const sim = builder.simulate(board,9);
  // 残局关：直接进入破局，不能有开局裸单（或只有1个热身格）
  if(sim.completed) return null;
  if(sim.filled > 2) return null; // 超过2个开局可填格就不是残局了
  if(sim.empty > 6) return null; // 空格太多
  if(sim.empty < 3) return null; // 空格太少（2格直接就是行唯一了）
  const pairs = findNakedPairsStuck(sim.grid);
  const good = pairs.filter(p => p.eliminates.length > 0);
  if(good.length===0) return null;
  // 找最佳pair（排除效果最好）
  const best = good.sort((a,b)=>b.eliminates.length-a.eliminates.length)[0];
  // 验证填入pair后收官
  const testG = sim.grid.map(r=>[...r]);
  testG[best.cells[0][0]][best.cells[0][1]] = sol[best.cells[0][0]][best.cells[0][1]];
  testG[best.cells[1][0]][best.cells[1][1]] = sol[best.cells[1][0]][best.cells[1][1]];
  const after = builder.simulate(testG,9);
  return {board, afterOpening:sim.grid, sim, pair:best, pairs:good, afterPair:after, emptyCells};
}

// 随机搜索策略：随机选一个"焦点行"，在该行选2-3个空格，
// 再在这些空格的列和宫中随机选额外空格
function search(sol, maxAttempts=200000) {
  let best = null;
  for (let attempt=0; attempt<maxAttempts; attempt++) {
    const focusRow = Math.floor(Math.random()*9);
    const nEmptyInRow = 3 + Math.floor(Math.random()*2); // 3-4个空格在焦点行
    const rowCols = [];
    const avail=[0,1,2,3,4,5,6,7,8];
    for(let i=0;i<nEmptyInRow;i++){
      const idx=Math.floor(Math.random()*avail.length);
      rowCols.push(avail.splice(idx,1)[0]);
    }
    const empties = rowCols.map(c=>[focusRow,c]);
    const nExtra = 2 + Math.floor(Math.random()*4); // 2-5个额外空格
    const extraSet = new Set(empties.map(e=>e[0]+','+e[1]));
    for(let i=0;i<nExtra;i++){
      // 优先在相关列/宫中选
      const relatedCols = rowCols;
      let r,c;
      if (Math.random()<0.6) {
        // 在相关列中选非焦点行
        c = relatedCols[Math.floor(Math.random()*relatedCols.length)];
        do { r = Math.floor(Math.random()*9); } while(r===focusRow);
      } else {
        // 随机位置
        r = Math.floor(Math.random()*9);
        c = Math.floor(Math.random()*9);
      }
      const key = r+','+c;
      if(!extraSet.has(key) && !(r===focusRow && rowCols.includes(c))) {
        extraSet.add(key);
        empties.push([r,c]);
      }
    }
    const res = evaluate(empties, sol);
    if (res) {
      if (!best || res.afterPair.empty < best.afterPair.empty) {
        best = res;
        if (res.afterPair.completed) break; // 完美收官
      }
    }
  }
  return best;
}

console.log('生成变体并搜索Naked Pair残局...');
let bestOverall = null;

// 尝试多个变体
for (let v=0; v<20; v++) {
  const variant = transformer.transform({
    gridSize:9, boardData:solution.map(r=>[...r]), cages:[], solution: solution.map(r=>[...r])
  }, {randomize:true});
  const sol = variant.solution;
  if (!builder.isValidSolution(sol,9)) continue;
  
  const result = search(sol, 50000);
  if (result) {
    console.log(`变体${v}: 找到! 空格${result.emptyCells.length}, 开局填${result.sim.filled}, 卡壳${result.sim.empty}格, pair排除${result.pair.eliminates.length}格, 收官剩${result.afterPair.empty}格`);
    if (!bestOverall || 
        (result.afterPair.completed && !bestOverall.afterPair.completed) ||
        (result.afterPair.empty < bestOverall.afterPair.empty)) {
      bestOverall = result;
      bestOverall.sol = sol;
      if (result.afterPair.completed) break;
    }
  }
}

if (bestOverall) {
  console.log('\n========== 最佳结果 ==========');
  builder.printGrid(bestOverall.board, 9);
  console.log('\n卡壳盘面（开局填',bestOverall.sim.filled,'格后）:');
  builder.printGrid(bestOverall.afterOpening, 9);
  console.log('\nNaked Pair:', bestOverall.pair.cells.map(c=>`(${c[0]+1},${c[1]+1})`).join(','), '= {', bestOverall.pair.nums.join(','), '}');
  console.log('排除效果:');
  for(const e of bestOverall.pair.eliminates) {
    console.log(`  (${e.cell[0]+1},${e.cell[1]+1}): ${e.oldCands.join(',')} → ${e.newCands.join(',')} ${e.newCands.length===1?'→ 裸单!':''}`);
  }
  console.log('\n填入数对后:');
  builder.printGrid(bestOverall.afterPair.grid, 9);
  console.log('收官完成:', bestOverall.afterPair.completed, '剩', bestOverall.afterPair.empty, '格');
  
  // 保存
  const keyCellsSet = new Set();
  for (const [r,c] of bestOverall.emptyCells) keyCellsSet.add(r+','+c);
  // 开局能填的格不在keyCells中（因为它们不是玩家操作的）
  // keyCells应该是卡壳状态下所有空格
  const stuckEmpties = [];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(bestOverall.afterOpening[r][c]===0)stuckEmpties.push([r,c]);
  
  const output = {
    levelId: 701,
    mode: 'endgame',
    title: '第1关：数对之锁',
    gridSize: 9,
    difficulty: '中等',
    teachingGoal: '显性数对（Naked Pair）：当同一行/列/宫中两个格子的候选数恰好是相同的两个数字时，这两个数字被它们"锁定"，同区域其他格子可以排除这两个候选。',
    keyCells: stuckEmpties,
    pairCells: bestOverall.pair.cells,
    pairNums: bestOverall.pair.nums,
    breakthroughCell: bestOverall.pair.eliminates[0]?.cell || bestOverall.pair.cells[0],
    boardData: bestOverall.board,
    cages: [],
    solution: bestOverall.sol,
    debug: {
      initialEmpty: bestOverall.emptyCells.length,
      openingFilled: bestOverall.sim.filled,
      stuckEmpty: bestOverall.sim.empty,
      pairEliminates: bestOverall.pair.eliminates,
      afterPairEmpty: bestOverall.afterPair.empty,
      afterPairComplete: bestOverall.afterPair.completed
    }
  };
  fs.writeFileSync(
    path.join(__dirname, '..', 'tools', 'level701-endgame.json'),
    JSON.stringify(output, null, 2)
  );
  console.log('\n✅ 已保存到 tools/level701-endgame.json');
} else {
  console.log('❌ 未找到合适残局');
}
