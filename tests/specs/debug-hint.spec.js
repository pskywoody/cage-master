// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForGameReady } = require('../utils/helpers');

test.describe('调试隐单测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page, 15000);
  });

  test('调试：行隐单候选数为0的问题', async ({ page }) => {
    const result = await page.evaluate(() => {
      const board7 = [
        [1, 2, 3, 4, 5, 6, 0, 0, 0],  // 第0行：缺7,8,9；空格(0,6)(0,7)(0,8)
        [0, 0, 0, 0, 0, 0, 7, 0, 0],  // (1,6)=7 → 第6列有7
        [0, 0, 0, 0, 0, 0, 0, 7, 0],  // (2,7)=7 → 第7列有7
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
      ];

      // 使用单格笼
      const cages7 = [];
      let cageId = 1;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          cages7.push({ id: cageId++, sum: board7[r][c] || 5, cells: [[r, c]] });
        }
      }

      const solver = new window.TechRaterSolverV2(board7, cages7);
      
      // 检查 (0,8) 的候选数
      const cand08 = Array.from(solver.candidates[0][8]).sort((a, b) => a - b);
      
      // 检查 (0,6) 和 (0,7) 的候选数
      const cand06 = Array.from(solver.candidates[0][6]).sort((a, b) => a - b);
      const cand07 = Array.from(solver.candidates[0][7]).sort((a, b) => a - b);
      
      // 检查第 0 行所有格子的候选数
      const row0Cands = [];
      for (let c = 0; c < 9; c++) {
        row0Cands.push({
          col: c,
          value: solver.grid[0][c],
          candidates: Array.from(solver.candidates[0][c]).sort((a, b) => a - b)
        });
      }
      
      // 检查笼子信息
      const cageInfo = cages7.map(c => ({
        id: c.id,
        sum: c.sum,
        cells: c.cells,
        cellValue: board7[c.cells[0][0]][c.cells[0][1]]
      }));

      const hint = solver.findNextStep();

      return {
        cand06,
        cand07,
        cand08,
        row0Cands,
        hint,
        cageInfo: cageInfo.slice(0, 10), // 只返回前10个
        hasFindHiddenSingle: typeof solver._findHiddenSingle === 'function',
        hasFindNakedSingle: typeof solver._findNakedSingle === 'function',
      };
    });

    console.log('(0,6) 候选数:', result.cand06);
    console.log('(0,7) 候选数:', result.cand07);
    console.log('(0,8) 候选数:', result.cand08);
    console.log('第0行所有格子:', JSON.stringify(result.row0Cands, null, 2));
    console.log('提示:', result.hint);
    console.log('有 _findHiddenSingle:', result.hasFindHiddenSingle);
    console.log('有 _findNakedSingle:', result.hasFindNakedSingle);
    console.log('前10个笼子:', JSON.stringify(result.cageInfo, null, 2));

    expect(true).toBe(true);
  });

  test('调试：不使用笼子约束的情况', async ({ page }) => {
    const result = await page.evaluate(() => {
      const board7 = [
        [1, 2, 3, 4, 5, 6, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 7, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 7, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
      ];

      // 不使用笼子约束（空笼子数组）
      const cagesEmpty = [];

      const solver = new window.TechRaterSolverV2(board7, cagesEmpty);
      
      const cand08 = Array.from(solver.candidates[0][8]).sort((a, b) => a - b);
      const cand06 = Array.from(solver.candidates[0][6]).sort((a, b) => a - b);
      const cand07 = Array.from(solver.candidates[0][7]).sort((a, b) => a - b);
      
      const hint = solver.findNextStep();

      return {
        cand06,
        cand07,
        cand08,
        hint,
      };
    });

    console.log('无笼子约束 (0,6) 候选数:', result.cand06);
    console.log('无笼子约束 (0,7) 候选数:', result.cand07);
    console.log('无笼子约束 (0,8) 候选数:', result.cand08);
    console.log('提示:', result.hint);

    expect(true).toBe(true);
  });
});
