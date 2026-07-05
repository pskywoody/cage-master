// @ts-check
/**
 * ============================================================
 *  06 - 性能测试
 * ============================================================
 *
 *  测试目标：验证游戏的性能表现是否满足预期，
 *  包括页面加载速度、操作响应时间、内存稳定性以及无控制台错误。
 *
 *  注意：
 *  - 性能测试使用 test.slow() 标记，允许更长的超时时间
 *  - 性能指标可能因环境而异，阈值设置为合理的上限
 *  - 内存测试基于 Chromium 的 performance.memory API
 *
 *  测试范围：
 *    - T29 页面加载时间
 *    - T30 操作响应时间
 *    - T31 内存稳定性（简化版）
 *    - T32 控制台无错误
 * ============================================================
 */

const { test, expect } = require('@playwright/test');
const { waitForGameReady, clickCell, inputNumber, undo, erase, toggleCandidateMode } = require('../utils/helpers');

// ============================================================
//  测试分组：性能测试
// ============================================================
test.describe('性能测试', () => {

  // 将整个 describe 标记为慢速测试，延长超时时间
  test.slow();

  // ============================================================
  //  T29 - 页面加载时间
  // ============================================================
  test('T29 - 页面加载时间', async ({ page }) => {
    /**
     * 测试思路：
     * 1. 导航到游戏页面
     * 2. 使用 performance API 记录各项加载时间
     * 3. 验证首屏加载时间 < 2 秒
     * 4. 输出 DOMContentLoaded 和 Load 事件时间
     */

    // 导航到游戏页面，同时收集性能指标
    const startTime = Date.now();

    await page.goto('/index.html?chapter=hell&id=271&mode=killer', {
      waitUntil: 'load',
    });

    // 等待游戏完全初始化（包括棋盘数据加载和渲染）
    await waitForGameReady(page, 15000);

    const totalReadyTime = Date.now() - startTime;

    // ---- 使用 performance API 获取详细加载时间 ----
    const perfData = await page.evaluate(() => {
      const navEntry = performance.getEntriesByType('navigation')[0];
      if (!navEntry) {
        // 回退到 performance.timing（旧版 API）
        const t = performance.timing;
        return {
          domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
          load: t.loadEventEnd - t.navigationStart,
          domInteractive: t.domInteractive - t.navigationStart,
          responseEnd: t.responseEnd - t.navigationStart,
          domComplete: t.domComplete - t.navigationStart,
          api: 'timing',
        };
      }
      return {
        domContentLoaded: navEntry.domContentLoadedEventEnd,
        load: navEntry.loadEventEnd,
        domInteractive: navEntry.domInteractive,
        responseEnd: navEntry.responseEnd,
        domComplete: navEntry.domComplete,
        api: 'navigation',
      };
    });

    // ---- 输出加载时间 ----
    console.log('=== 页面加载时间 ===');
    console.log(`  DOMContentLoaded: ${perfData.domContentLoaded.toFixed(0)}ms`);
    console.log(`  Load:             ${perfData.load.toFixed(0)}ms`);
    console.log(`  DOM Interactive:  ${perfData.domInteractive.toFixed(0)}ms`);
    console.log(`  Response End:     ${perfData.responseEnd.toFixed(0)}ms`);
    console.log(`  游戏就绪总时间:    ${totalReadyTime}ms`);

    // ---- 验证首屏加载 < 2 秒（2000ms） ----
    // Load 事件时间应小于 2 秒
    expect(perfData.load,
      `页面 Load 事件时间应小于 2000ms，实际为 ${perfData.load.toFixed(0)}ms`
    ).toBeLessThan(2000);

    // DOMContentLoaded 也应小于 2 秒
    expect(perfData.domContentLoaded,
      `DOMContentLoaded 时间应小于 2000ms，实际为 ${perfData.domContentLoaded.toFixed(0)}ms`
    ).toBeLessThan(2000);

    // 游戏完全就绪时间（包括脚本初始化和数据加载）
    // 允许稍长时间，但不应超过 5 秒
    expect(totalReadyTime,
      `游戏完全就绪时间应小于 5000ms，实际为 ${totalReadyTime}ms`
    ).toBeLessThan(5000);
  });

  // ============================================================
  //  T30 - 操作响应时间
  // ============================================================
  test('T30 - 操作响应时间', async ({ page }) => {
    /**
     * 测试思路：
     * 1. 加载游戏页面并等待就绪
     * 2. 测量点击格子到选中状态更新的时间
     * 3. 验证 < 100ms
     * 4. 测量填数操作响应时间
     * 5. 验证 < 100ms
     */

    // 加载游戏页面
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page, 15000);
    await page.waitForTimeout(500);

    // 找到一个可点击的空格子（非预填、非锁定）
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

    const { r: testRow, c: testCol } = emptyCell;

    // ---- 测量点击格子到选中状态更新的时间 ----
    // 在页面中注入测量函数，精确测量操作响应时间
    const clickResponseTime = await page.evaluate(async ([row, col]) => {
      return new Promise((resolve) => {
        const canvas = document.querySelector('#gameCanvas') || document.querySelector('canvas');
        const rect = canvas.getBoundingClientRect();

        // 计算目标格子中心坐标
        const pad = (typeof renderer !== 'undefined' && renderer.padding) ? renderer.padding : 12;
        const cellW = (rect.width - pad * 2) / 9;
        const cellH = (rect.height - pad * 2) / 9;
        const centerX = rect.left + pad + (col + 0.5) * cellW;
        const centerY = rect.top + pad + (row + 0.5) * cellH;

        // 记录开始时间
        const startTime = performance.now();

        // 记录选中状态变化的回调
        let checkCount = 0;
        const maxChecks = 100; // 最多检查 100 次，每次 1ms，共 100ms

        const checkSelection = () => {
          checkCount++;
          const board = window.gameBoard;
          let selected = null;

          // 尝试多种方式获取选中格子
          if (board.getSelectedCell) {
            selected = board.getSelectedCell();
          } else if (board.getActiveCell) {
            selected = board.getActiveCell();
          } else {
            selected = board.selectedCell;
          }

          if (selected && selected.r === row && selected.c === col) {
            // 选中状态已更新
            const endTime = performance.now();
            resolve(endTime - startTime);
            return;
          }

          if (checkCount >= maxChecks) {
            // 超时，返回当前耗时
            resolve(performance.now() - startTime);
            return;
          }

          requestAnimationFrame(checkSelection);
        };

        // 模拟鼠标点击
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: centerX,
          clientY: centerY,
        });

        // 先触发 mousedown，再触发 mouseup，最后 click
        const mouseDownEvent = new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: centerX,
          clientY: centerY,
        });
        const mouseUpEvent = new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          clientX: centerX,
          clientY: centerY,
        });

        canvas.dispatchEvent(mouseDownEvent);
        canvas.dispatchEvent(mouseUpEvent);
        canvas.dispatchEvent(clickEvent);

        // 开始检查选中状态
        checkSelection();
      });
    }, [testRow, testCol]);

    console.log(`点击格子响应时间: ${clickResponseTime.toFixed(2)}ms`);
    expect(clickResponseTime,
      `点击格子到选中状态更新的时间应小于 100ms，实际为 ${clickResponseTime.toFixed(2)}ms`
    ).toBeLessThan(100);

    // ---- 测量填数操作响应时间 ----
    // 先获取该格子的正确答案（用于填入一个数字）
    const correctNum = await page.evaluate(([row, col]) => {
      // 简单起见，填入数字 1（不关心是否正确，只测响应速度）
      return 1;
    }, [testRow, testCol]);

    // 测量填数操作的响应时间
    const fillResponseTime = await page.evaluate(async ([row, col, num]) => {
      return new Promise((resolve) => {
        const board = window.gameBoard;

        // 确保格子已被选中
        if (board.selectCell) {
          board.selectCell(row, col);
        }

        // 记录开始时间
        const startTime = performance.now();

        // 执行填数操作
        if (board.fillNumber) {
          board.fillNumber(num);
        } else if (board.inputNumber) {
          board.inputNumber(num);
        } else if (board.setNumber) {
          board.setNumber(num);
        }

        // 等待一帧后检查数字是否已更新
        requestAnimationFrame(() => {
          const cell = board.cells[row][col];
          const filled = cell.fillNum !== null;
          const endTime = performance.now();
          resolve({
            time: endTime - startTime,
            filled,
            value: cell.fillNum,
          });
        });
      });
    }, [testRow, testCol, correctNum]);

    console.log(`填数操作响应时间: ${fillResponseTime.time.toFixed(2)}ms`);
    expect(fillResponseTime.filled, '填数操作后格子应有数字').toBe(true);
    expect(fillResponseTime.time,
      `填数操作响应时间应小于 100ms，实际为 ${fillResponseTime.time.toFixed(2)}ms`
    ).toBeLessThan(100);
  });

  // ============================================================
  //  T31 - 内存稳定性（简化版）
  // ============================================================
  test('T31 - 内存稳定性（简化版）', async ({ page }) => {
    /**
     * 测试思路：
     * 1. 加载游戏并等待就绪
     * 2. 记录初始内存使用量
     * 3. 连续执行 50 次填数+擦除操作
     * 4. 记录操作后的内存使用量
     * 5. 验证内存增长在合理范围内（< 20MB）
     *
     * 注意：
     * - performance.memory 仅在 Chromium 系浏览器中可用
     * - 内存测量可能有波动，取多次测量的平均值
     * - 如果浏览器不支持 performance.memory，则跳过测试
     */

    // 加载游戏页面
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page, 15000);
    await page.waitForTimeout(1000);

    // ---- 检查浏览器是否支持 performance.memory ----
    const memorySupported = await page.evaluate(() => {
      return typeof performance.memory !== 'undefined' && performance.memory !== null;
    });

    if (!memorySupported) {
      console.log('跳过内存测试：当前浏览器不支持 performance.memory API');
      test.skip();
      return;
    }

    // ---- 获取内存使用量的辅助函数 ----
    async function getMemoryUsage() {
      return page.evaluate(() => {
        // 取 3 次测量的平均值，减少波动
        let total = 0;
        for (let i = 0; i < 3; i++) {
          // 强制执行一次垃圾回收（如果可用）
          if (window.gc) {
            window.gc();
          }
          total += performance.memory.usedJSHeapSize;
        }
        return {
          usedJSHeapSize: total / 3,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        };
      });
    }

    // ---- 记录初始内存 ----
    // 先做几次操作让 JIT 预热，然后再记录初始内存
    await page.evaluate(() => {
      const board = window.gameBoard;
      // 预热：随便选一个格子填数再擦除
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cell = board.cells[r][c];
          if (cell.fixedNum === null && !cell.isLocked) {
            if (board.selectCell) board.selectCell(r, c);
            if (board.fillNumber) board.fillNumber(1);
            if (board.eraseNumber) board.eraseNumber();
            break;
          }
        }
        break;
      }
    });
    await page.waitForTimeout(500);

    const initialMemory = await getMemoryUsage();
    console.log(`初始内存: ${(initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);

    // ---- 找到一个用于测试的空格子 ----
    const testCell = await page.evaluate(() => {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cell = window.gameBoard.cells[r][c];
          if (cell.fixedNum === null && !cell.isLocked) {
            return { r, c };
          }
        }
      }
      return null;
    });
    expect(testCell, '应存在空的可填格子').not.toBeNull();

    // ---- 连续执行 50 次填数+擦除操作 ----
    const operationCount = 50;

    await page.evaluate(([row, col, count]) => {
      const board = window.gameBoard;

      // 选中测试格子
      if (board.selectCell) {
        board.selectCell(row, col);
      }

      for (let i = 0; i < count; i++) {
        // 填入数字（用 1-9 循环，避免总是同一个数字）
        const num = (i % 9) + 1;
        if (board.fillNumber) {
          board.fillNumber(num);
        } else if (board.inputNumber) {
          board.inputNumber(num);
        }

        // 擦除数字
        if (board.eraseNumber) {
          board.eraseNumber();
        } else if (board.clearCell) {
          board.clearCell();
        }
      }
    }, [testCell.r, testCell.c, operationCount]);

    // 等待操作完成后的稳定期
    await page.waitForTimeout(1000);

    // ---- 记录操作后内存 ----
    const afterMemory = await getMemoryUsage();
    console.log(`操作后内存: ${(afterMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);

    // ---- 计算内存增长量 ----
    const memoryGrowth = afterMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
    const memoryGrowthMB = memoryGrowth / 1024 / 1024;

    console.log(`内存增长: ${memoryGrowthMB.toFixed(2)} MB`);
    console.log(`  操作次数: ${operationCount} 次填数+擦除`);

    // ---- 验证内存增长在合理范围内（< 20MB） ----
    expect(memoryGrowthMB,
      `连续 ${operationCount} 次操作后内存增长应小于 20MB，实际增长 ${memoryGrowthMB.toFixed(2)}MB`
    ).toBeLessThan(20);

    // 额外检查：内存不应减少超过初始值的 50%（说明测量可能有问题）
    expect(memoryGrowthMB,
      `内存不应大幅减少（可能是测量误差），实际变化 ${memoryGrowthMB.toFixed(2)}MB`
    ).toBeGreaterThan(-20);
  });

  // ============================================================
  //  T32 - 控制台无错误
  // ============================================================
  test('T32 - 控制台无错误', async ({ page }) => {
    /**
     * 测试思路：
     * 1. 收集所有 console.error 消息
     * 2. 加载游戏并执行一系列操作（点击、填数、擦除、撤销、候选模式）
     * 3. 验证没有红色报错
     * 4. 排除环境相关错误
     */

    test.setTimeout(30000); // 30秒超时

    // ---- 收集控制台错误 ----
    const consoleErrors = [];
    const consoleWarnings = [];

    page.on('console', (msg) => {
      const text = msg.text();
      const type = msg.type();

      if (type === 'error') {
        consoleErrors.push({
          text,
          type,
          location: msg.location() ? `${msg.location().url}:${msg.location().lineNumber}` : 'unknown',
        });
      } else if (type === 'warning') {
        consoleWarnings.push(text);
      }
    });

    // ---- 加载游戏页面 ----
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page, 15000);
    await page.waitForTimeout(200);

    // ---- 执行一系列操作（使用辅助函数，避免UI按钮问题） ----

    // 操作 1：点击格子
    await clickCell(page, 4, 4);
    await page.waitForTimeout(50);

    // 操作 2：填入数字
    await inputNumber(page, 5);
    await page.waitForTimeout(50);

    // 操作 3：点击另一个格子
    await clickCell(page, 2, 3);
    await page.waitForTimeout(50);

    // 操作 4：填入另一个数字
    await inputNumber(page, 3);
    await page.waitForTimeout(50);

    // 操作 5：擦除数字
    await erase(page);
    await page.waitForTimeout(50);

    // 操作 6：撤销操作
    await undo(page);
    await page.waitForTimeout(50);

    // 操作 7：切换候选模式
    await toggleCandidateMode(page);
    await page.waitForTimeout(50);

    // 操作 8：在候选模式下输入候选数
    await clickCell(page, 6, 6);
    await inputNumber(page, 7);
    await page.waitForTimeout(50);

    // 操作 9：切回正常模式
    await toggleCandidateMode(page);
    await page.waitForTimeout(50);

    // 等待所有操作完成
    await page.waitForTimeout(200);

    // ---- 过滤掉环境相关的错误 ----
    const filteredErrors = consoleErrors.filter(err => {
      const text = err.text.toLowerCase();
      const location = err.location.toLowerCase();

      // 排除以下类型的错误：
      const excludePatterns = [
        'preload',              // preload script 错误
        'extensions',           // 浏览器扩展错误
        'chrome-extension',     // Chrome 扩展
        'playwright',           // Playwright 内部
        'about:blank',          // 空白页
        'devtools',             // 开发者工具
        'favicon',              // favicon 加载失败（不影响功能）
        'source map',           // source map 加载失败
        'sourcemap',            // sourcemap 加载失败
        'failed to load resource: the server responded with a status of 404', // 404 资源
        'net::err_file_not_found', // 文件未找到
      ];

      for (const pattern of excludePatterns) {
        if (text.includes(pattern) || location.includes(pattern)) {
          return false; // 过滤掉
        }
      }

      // 保留游戏相关的错误
      return true;
    });

    // ---- 输出所有收集到的错误（便于调试） ----
    if (consoleErrors.length > 0) {
      console.log(`=== 收集到 ${consoleErrors.length} 条 console.error ===`);
      consoleErrors.forEach((err, i) => {
        console.log(`  [${i + 1}] ${err.text}`);
        console.log(`       位置: ${err.location}`);
      });
    }

    if (filteredErrors.length > 0) {
      console.log(`=== 其中 ${filteredErrors.length} 条为游戏相关错误 ===`);
      filteredErrors.forEach((err, i) => {
        console.log(`  [${i + 1}] ${err.text}`);
        console.log(`       位置: ${err.location}`);
      });
    }

    if (consoleWarnings.length > 0) {
      console.log(`=== 收集到 ${consoleWarnings.length} 条 console.warning ===`);
    }

    // ---- 验证没有红色报错 ----
    expect(filteredErrors.length,
      `游戏操作过程中不应有控制台错误，实际有 ${filteredErrors.length} 条: ${filteredErrors.map(e => e.text).join('; ')}`
    ).toBe(0);
  });

});
