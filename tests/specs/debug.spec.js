// @ts-check
const { test, expect } = require('@playwright/test');
const {
  waitForGameReady,
  getCellValue,
  clickCell,
  inputNumber,
  getCandidates,
} = require('../utils/helpers');

test.describe('调试测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page, 15000);

    await page.evaluate(() => {
      return new Promise((resolve) => {
        const waitForSolver = () => {
          if (typeof TechRaterSolverV2 !== 'undefined') {
            const board = [];
            const cages = [];
            for (let r = 0; r < 9; r++) {
              board[r] = [];
              for (let c = 0; c < 9; c++) {
                const cell = window.gameBoard.cells[r][c];
                board[r][c] = cell.fixedNum || 0;
              }
            }
            for (const cage of window.gameBoard.cages) {
              cages.push({
                id: cage.id,
                sum: cage.sum,
                cells: cage.cells.map(([r, c]) => [r, c])
              });
            }
            const solver = new TechRaterSolverV2(board, cages);
            solver.solve(500);
            const solution = [];
            for (let r = 0; r < 9; r++) {
              solution[r] = [];
              for (let c = 0; c < 9; c++) {
                solution[r][c] = solver.grid[r][c];
              }
            }
            window._solution = solution;
            resolve(true);
          } else {
            setTimeout(waitForSolver, 100);
          }
        };
        waitForSolver();
      });
    });
  });

  test('调试：T06 候选数问题', async ({ page }) => {
    // 找空格子
    const emptyCell = await page.evaluate(() => {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cell = window.gameBoard.cells[r][c];
          if (cell.fixedNum === null && cell.fillNum === null && !cell.isLocked) {
            return { r, c };
          }
        }
      }
      return null;
    });
    const { r, c } = emptyCell;
    const correctNum = await page.evaluate(([row, col]) => {
      return window._solution[row][col];
    }, [r, c]);

    console.log('测试格子:', { r, c, correctNum });

    // 检查设置
    const settings = await page.evaluate(() => {
      return {
        autoClearCandidates: gameBoard.settings.autoClearCandidates,
        settings: JSON.stringify(gameBoard.settings)
      };
    });
    console.log('设置:', settings);

    // 检查 (0,0) 格子的候选数
    const cellCandidates = await getCandidates(page, r, c);
    console.log('空格子候选数:', cellCandidates);

    // 检查同行某个格子的候选数
    const rowCandidates = await page.evaluate(([row, num]) => {
      const result = [];
      for (let c = 0; c < 9; c++) {
        const cell = gameBoard.cells[row][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          result.push({ c, has: cell.candidates.has(num), candidates: Array.from(cell.candidates) });
        }
      }
      return result;
    }, [r, correctNum]);
    console.log('同行空格子候选数:', JSON.stringify(rowCandidates, null, 2));

    // 点击格子并填入数字
    await clickCell(page, r, c);
    await inputNumber(page, correctNum);

    // 验证填入成功
    const cellValue = await getCellValue(page, r, c);
    console.log('填入后格子值:', cellValue);

    // 再次检查同行候选数
    const rowCandidatesAfter = await page.evaluate(([row, num]) => {
      const result = [];
      for (let c = 0; c < 9; c++) {
        const cell = gameBoard.cells[row][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          result.push({ c, has: cell.candidates.has(num), candidates: Array.from(cell.candidates) });
        }
      }
      return result;
    }, [r, correctNum]);
    console.log('填入后同行空格子候选数:', JSON.stringify(rowCandidatesAfter, null, 2));

    expect(true).toBe(true);
  });

  test('调试：T09 撤销问题', async ({ page }) => {
    // 找空格子
    const emptyCell = await page.evaluate(() => {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cell = window.gameBoard.cells[r][c];
          if (cell.fixedNum === null && cell.fillNum === null && !cell.isLocked) {
            return { r, c };
          }
        }
      }
      return null;
    });
    const { r, c } = emptyCell;
    const correctNum = await page.evaluate(([row, col]) => {
      return window._solution[row][col];
    }, [r, c]);

    console.log('测试格子:', { r, c, correctNum });

    // 检查历史记录
    const historyBefore = await page.evaluate(() => {
      return {
        length: gameBoard.history.length,
        canUndo: gameBoard.canUndo ? gameBoard.canUndo() : 'unknown'
      };
    });
    console.log('填入前历史:', historyBefore);

    // 点击格子并填入数字
    await clickCell(page, r, c);
    await inputNumber(page, correctNum);

    const cellValue = await getCellValue(page, r, c);
    console.log('填入后格子值:', cellValue);

    // 检查历史记录
    const historyAfterFill = await page.evaluate(() => {
      return {
        length: gameBoard.history.length,
        canUndo: gameBoard.canUndo ? gameBoard.canUndo() : 'unknown'
      };
    });
    console.log('填入后历史:', historyAfterFill);

    // 点击撤销按钮
    console.log('点击撤销按钮...');
    await page.click('#btn-undo', { force: true });
    await page.waitForTimeout(300);

    const afterUndoValue = await getCellValue(page, r, c);
    console.log('撤销后格子值:', afterUndoValue);

    // 检查历史记录
    const historyAfterUndo = await page.evaluate(() => {
      return {
        length: gameBoard.history.length,
        canUndo: gameBoard.canUndo ? gameBoard.canUndo() : 'unknown'
      };
    });
    console.log('撤销后历史:', historyAfterUndo);

    // 尝试直接调用 undo
    console.log('直接调用 undo...');
    await page.evaluate(() => {
      gameBoard.undo();
    });

    const afterDirectUndoValue = await getCellValue(page, r, c);
    console.log('直接撤销后格子值:', afterDirectUndoValue);

    expect(true).toBe(true);
  });
});
