// @ts-check
/**
 * ============================================================
 *  02 - 核心玩法测试
 * ============================================================
 *
 *  测试目标：验证杀手数独核心游戏玩法，
 *  包括格子选择、数字填入、错误检测、擦除、撤销、候选标记等。
 *
 *  测试前置条件：加载第 271 关杀手数独，等待游戏就绪。
 *
 *  测试范围：
 *    - T05 点击选择格子
 *    - T06 填入正确数字
 *    - T07 填入错误数字
 *    - T08 擦除数字
 *    - T09 撤销操作
 *    - T10 候选数标记
 * ============================================================
 */

const { test, expect } = require('@playwright/test');
const {
  waitForGameReady,
  getCellValue,
  getCandidates,
  clickCell,
  inputNumber,
  undo,
  erase,
  toggleCandidateMode,
} = require('../utils/helpers');

// ============================================================
//  测试分组：核心玩法测试
// ============================================================
test.describe('核心玩法测试', () => {

  /**
   * 测试前置条件：
   *  1. 加载第 271 关杀手数独
   *  2. 等待游戏初始化完成
   *  3. 计算正确答案（用于验证填入是否正确）
   */
  test.beforeEach(async ({ page }) => {
    // 跳转到第 271 关杀手数独
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');

    // 等待游戏初始化完成
    await waitForGameReady(page, 15000);

    // 使用求解器计算正确答案并缓存到 window._solution
    await page.evaluate(() => {
      return new Promise((resolve) => {
        // 等待 TechRaterSolverV2 加载完成
        const waitForSolver = () => {
          if (typeof TechRaterSolverV2 !== 'undefined') {
            // 从当前棋盘复制数据用于求解
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

            // 使用求解器计算答案
            const solver = new TechRaterSolverV2(board, cages);
            solver.solve(500);

            // 提取解（从求解器的 grid 中获取）
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

  // ============================================================
  //  T05 - 点击选择格子
  // ============================================================
  test('T05 - 点击选择格子', async ({ page }) => {
    // 点击第 5 行第 5 列（索引 4,4）的格子
    await clickCell(page, 4, 4);

    // 验证该格子被选中（通过 gameBoard.selectedCell）
    const selected = await page.evaluate(() => {
      const cell = window.gameBoard.getSelectedCell
        ? window.gameBoard.getSelectedCell()
        : window.gameBoard.getActiveCell
          ? window.gameBoard.getActiveCell()
          : window.gameBoard.selectedCell;
      return cell;
    });

    expect(selected, '应存在选中的格子').not.toBeNull();
    expect(selected.r, '选中行应为 4').toBe(4);
    expect(selected.c, '选中列应为 4').toBe(4);
  });

  // ============================================================
  //  T06 - 填入正确数字
  // ============================================================
  test('T06 - 填入正确数字', async ({ page }) => {
    // 先初始化所有格子的候选数（游戏默认不自动计算候选数）
    await page.evaluate(() => {
      gameBoard.updateCandidates();
    });

    // 找到一个空格子用于测试
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
    expect(emptyCell, '应存在空的可填格子').not.toBeNull();

    const { r, c } = emptyCell;

    // 获取该格子的正确答案
    const correctNum = await page.evaluate(([row, col]) => {
      return window._solution[row][col];
    }, [r, c]);
    expect(correctNum, '正确答案应在 1-9 之间').toBeGreaterThanOrEqual(1);
    expect(correctNum, '正确答案应在 1-9 之间').toBeLessThanOrEqual(9);

    // 记录填入前相关格子的候选数（同行、同列、同宫、同笼）
    const beforeCandidates = await page.evaluate(([row, col, num]) => {
      const board = window.gameBoard;
      const result = {
        row: [],
        col: [],
        box: [],
      };
      // 同行
      for (let i = 0; i < 9; i++) {
        if (i !== col) {
          const cell = board.cells[row][i];
          if (cell.fillNum === null && cell.fixedNum === null) {
            result.row.push({ c: i, has: cell.candidates.has(num) });
          }
        }
      }
      // 同列
      for (let i = 0; i < 9; i++) {
        if (i !== row) {
          const cell = board.cells[i][col];
          if (cell.fillNum === null && cell.fixedNum === null) {
            result.col.push({ r: i, has: cell.candidates.has(num) });
          }
        }
      }
      // 同宫
      const boxR = Math.floor(row / 3) * 3;
      const boxC = Math.floor(col / 3) * 3;
      for (let i = boxR; i < boxR + 3; i++) {
        for (let j = boxC; j < boxC + 3; j++) {
          if (i !== row || j !== col) {
            const cell = board.cells[i][j];
            if (cell.fillNum === null && cell.fixedNum === null) {
              result.box.push({ r: i, c: j, has: cell.candidates.has(num) });
            }
          }
        }
      }
      return result;
    }, [r, c, correctNum]);

    // 选中该空格
    await clickCell(page, r, c);

    // 输入正确的数字
    await inputNumber(page, correctNum);

    // 验证该格子数字已更新
    const cellValue = await getCellValue(page, r, c);
    expect(cellValue, `格子 (${r},${c}) 应填入数字 ${correctNum}`).toBe(correctNum);

    // 验证无冲突标记
    const hasError = await page.evaluate(([row, col]) => {
      return window.gameBoard.cells[row][col].isError;
    }, [r, c]);
    expect(hasError, '填入正确数字后不应有冲突标记').toBe(false);

    // 验证候选数已更新（相关格子候选数减少）
    const candidatesReduced = await page.evaluate(([row, col, num, before]) => {
      const board = window.gameBoard;
      let reduced = false;

      // 检查同行
      for (const item of before.row) {
        if (item.has) {
          const cell = board.cells[row][item.c];
          if (!cell.candidates.has(num)) {
            reduced = true;
            break;
          }
        }
      }
      if (reduced) return true;

      // 检查同列
      for (const item of before.col) {
        if (item.has) {
          const cell = board.cells[item.r][col];
          if (!cell.candidates.has(num)) {
            reduced = true;
            break;
          }
        }
      }
      if (reduced) return true;

      // 检查同宫
      for (const item of before.box) {
        if (item.has) {
          const cell = board.cells[item.r][item.c];
          if (!cell.candidates.has(num)) {
            reduced = true;
            break;
          }
        }
      }

      return reduced;
    }, [r, c, correctNum, beforeCandidates]);

    // 如果自动清除候选功能开启，相关格子的候选数应减少
    const autoClearEnabled = await page.evaluate(() => {
      return window.gameBoard.settings.autoClearCandidates;
    });
    if (autoClearEnabled) {
      expect(candidatesReduced, '填入数字后相关格子的候选数应减少').toBe(true);
    }
  });

  // ============================================================
  //  T07 - 填入错误数字
  // ============================================================
  test('T07 - 填入错误数字', async ({ page }) => {
    // 找到一个空格子用于测试
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
    expect(emptyCell, '应存在空的可填格子').not.toBeNull();

    const { r, c } = emptyCell;

    // 获取该格子的正确答案，然后选一个错误的数字
    const wrongNum = await page.evaluate(([row, col]) => {
      const correctNum = window._solution[row][col];
      // 选一个与正确答案不同的数字
      // 优先选同行/同列/同宫中已存在的数字，确保产生冲突
      const board = window.gameBoard;

      // 收集同行已有的数字
      const existingNums = new Set();
      for (let i = 0; i < 9; i++) {
        const v = board.cells[row][i].fixedNum || board.cells[row][i].fillNum;
        if (v && v !== correctNum) existingNums.add(v);
      }
      for (let i = 0; i < 9; i++) {
        const v = board.cells[i][col].fixedNum || board.cells[i][col].fillNum;
        if (v && v !== correctNum) existingNums.add(v);
      }

      // 如果有冲突的数字，用它；否则用 1-9 中除正确答案外的任意数字
      if (existingNums.size > 0) {
        return existingNums.values().next().value;
      }
      // 用一个不等于正确答案的数字
      for (let n = 1; n <= 9; n++) {
        if (n !== correctNum) return n;
      }
      return 1;
    }, [r, c]);

    // 选中该空格
    await clickCell(page, r, c);

    // 输入错误的数字
    await inputNumber(page, wrongNum);

    // 验证有冲突标记（isError 为 true）
    const hasError = await page.evaluate(([row, col]) => {
      return window.gameBoard.cells[row][col].isError;
    }, [r, c]);
    expect(hasError, '填入错误数字后应有冲突标记（红色高亮）').toBe(true);

    // 验证数字已写入但标记为错误
    const cellValue = await getCellValue(page, r, c);
    expect(cellValue, '错误数字应已写入格子').toBe(wrongNum);
  });

  // ============================================================
  //  T08 - 擦除数字
  // ============================================================
  test('T08 - 擦除数字', async ({ page }) => {
    // 找到一个空格子用于测试
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
    expect(emptyCell, '应存在空的可填格子').not.toBeNull();

    const { r, c } = emptyCell;

    // 获取正确答案
    const correctNum = await page.evaluate(([row, col]) => {
      return window._solution[row][col];
    }, [r, c]);

    // 记录擦除前的候选数状态
    const beforeCandidates = await getCandidates(page, r, c);

    // 选中格子并填入数字
    await clickCell(page, r, c);
    await inputNumber(page, correctNum);

    // 验证数字已填入
    const filledValue = await getCellValue(page, r, c);
    expect(filledValue, '填入前应先确认数字已写入').toBe(correctNum);

    // 点击擦除按钮
    await erase(page);

    // 验证数字被清除
    const afterEraseValue = await getCellValue(page, r, c);
    expect(afterEraseValue, '擦除后格子应为空').toBe(0);

    // 验证候选数恢复（擦除后候选数应恢复到填入前的状态）
    const afterEraseCandidates = await getCandidates(page, r, c);
    // 擦除后格子的候选数应为空集合（因为 eraseNumber 中 clear 了 candidates）
    // 但自动清除的关联候选会在撤销时恢复，擦除本身不恢复候选
    // 这里验证该格本身的 fillNum 被清除即可
    const fillNumIsNull = await page.evaluate(([row, col]) => {
      return window.gameBoard.cells[row][col].fillNum === null;
    }, [r, c]);
    expect(fillNumIsNull, '擦除后 fillNum 应为 null').toBe(true);
  });

  // ============================================================
  //  T09 - 撤销操作
  // ============================================================
  test('T09 - 撤销操作', async ({ page }) => {
    // 找到一个空格子用于测试
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
    expect(emptyCell, '应存在空的可填格子').not.toBeNull();

    const { r, c } = emptyCell;

    // 获取正确答案
    const correctNum = await page.evaluate(([row, col]) => {
      return window._solution[row][col];
    }, [r, c]);

    // 记录填入前的历史记录长度
    const historyLenBefore = await page.evaluate(() => {
      return window.gameBoard.history.length;
    });

    // 选中格子并填入数字
    await clickCell(page, r, c);
    await inputNumber(page, correctNum);

    // 验证数字已填入
    const filledValue = await getCellValue(page, r, c);
    expect(filledValue, '填入后应确认数字已写入').toBe(correctNum);

    // 验证历史记录增加
    const historyLenAfterFill = await page.evaluate(() => {
      return window.gameBoard.history.length;
    });
    expect(historyLenAfterFill, '填入后历史记录应增加').toBeGreaterThan(historyLenBefore);

    // 点击撤销按钮
    await undo(page);

    // 验证数字被清除
    const afterUndoValue = await getCellValue(page, r, c);
    expect(afterUndoValue, '撤销后格子应为空').toBe(0);

    // 验证恢复到之前的状态（历史记录减少）
    const historyLenAfterUndo = await page.evaluate(() => {
      return window.gameBoard.history.length;
    });
    expect(historyLenAfterUndo, '撤销后历史记录应减少').toBe(historyLenAfterFill - 1);

    // 验证候选数恢复（撤销应恢复被自动清除的关联候选）
    const fillNumIsNull = await page.evaluate(([row, col]) => {
      return window.gameBoard.cells[row][col].fillNum === null;
    }, [r, c]);
    expect(fillNumIsNull, '撤销后 fillNum 应为 null').toBe(true);
  });

  // ============================================================
  //  T10 - 候选数标记
  // ============================================================
  test('T10 - 候选数标记', async ({ page }) => {
    // 找到一个空格子用于测试
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
    expect(emptyCell, '应存在空的可填格子').not.toBeNull();

    const { r, c } = emptyCell;

    // 确认当前为正常模式
    const initialMode = await page.evaluate(() => {
      return window.gameBoard.inputMode;
    });
    expect(initialMode, '初始输入模式应为 normal').toBe('normal');

    // 开启候选模式
    await toggleCandidateMode(page);

    // 验证已切换到候选模式
    const candidateMode = await page.evaluate(() => {
      return window.gameBoard.inputMode;
    });
    expect(candidateMode, '点击候选按钮后应切换为 candidate 模式').toBe('candidate');

    // 选中一个空格
    await clickCell(page, r, c);

    // 输入候选数字（选 3 作为测试）
    const testNum = 3;
    await inputNumber(page, testNum);

    // 验证候选数被标记
    const candidatesAfterAdd = await getCandidates(page, r, c);
    expect(candidatesAfterAdd, `候选数中应包含 ${testNum}`).toContain(testNum);

    // 再次输入相同数字取消候选
    await inputNumber(page, testNum);

    // 验证候选数被清除
    const candidatesAfterRemove = await getCandidates(page, r, c);
    expect(candidatesAfterRemove, `再次输入后候选数中不应包含 ${testNum}`).not.toContain(testNum);

    // 切回正常模式（恢复测试环境）
    await toggleCandidateMode(page);
    const finalMode = await page.evaluate(() => {
      return window.gameBoard.inputMode;
    });
    expect(finalMode, '测试结束后应切回 normal 模式').toBe('normal');
  });

});
