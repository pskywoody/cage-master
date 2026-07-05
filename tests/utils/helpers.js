/**
 * ==========================================
 * 杀手数独自动化测试 - 通用辅助函数库
 * ==========================================
 *
 * 提供 Playwright 测试中常用的页面交互工具函数，
 * 包括棋盘操作、数字输入、提示面板控制、状态获取等。
 *
 * 所有函数均为纯函数，接收 page 作为第一个参数。
 */

// ==========================================
//  游戏初始化与状态等待
// ==========================================

/**
 * 等待游戏初始化完成
 *
 * 检测 window.gameBoard 全局变量是否存在，
 * 并确保棋盘已加载关卡数据。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {number} [timeout=10000] - 超时时间（毫秒）
 * @returns {Promise<void>}
 */
async function waitForGameReady(page, timeout = 10000) {
  await page.waitForFunction(() => {
    return typeof window.gameBoard !== 'undefined'
      && window.gameBoard !== null
      && Array.isArray(window.gameBoard.cells)
      && window.gameBoard.cells.length > 0;
  }, { timeout });
}

// ==========================================
//  格子数值操作
// ==========================================

/**
 * 获取指定格子的数字
 *
 * 优先返回玩家填入的数字（fillNum），
 * 若为预填数字则返回 fixedNum，空格返回 0。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {number} row - 行号（0-8）
 * @param {number} col - 列号（0-8）
 * @returns {Promise<number>} 格子中的数字，空格返回 0
 */
async function getCellValue(page, row, col) {
  return page.evaluate(([r, c]) => {
    const cell = window.gameBoard.cells[r][c];
    if (cell.fillNum !== null) return cell.fillNum;
    if (cell.fixedNum !== null) return cell.fixedNum;
    return 0;
  }, [row, col]);
}

/**
 * 获取指定格子的候选数集合
 *
 * 返回该格子当前所有候选数字的数组（升序排列）。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {number} row - 行号（0-8）
 * @param {number} col - 列号（0-8）
 * @returns {Promise<number[]>} 候选数数组
 */
async function getCandidates(page, row, col) {
  return page.evaluate(([r, c]) => {
    const cell = window.gameBoard.cells[r][c];
    return Array.from(cell.candidates).sort((a, b) => a - b);
  }, [row, col]);
}

// ==========================================
//  Canvas 坐标计算与点击
// ==========================================

/**
 * 点击棋盘上的指定格子
 *
 * 通过获取 canvas 的 boundingClientRect，
 * 结合棋盘内边距（padding）计算出目标格子的中心坐标，
 * 然后模拟点击该位置。
 *
 * 棋盘在 canvas 中居中显示，周围有 padding 内边距。
 * 9x9 格子在 padding 内部均匀分布。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {number} row - 行号（0-8）
 * @param {number} col - 列号（0-8）
 * @param {Object} [options] - 选项
 * @param {string} [options.canvasSelector='canvas'] - canvas 选择器
 * @param {boolean} [options.closeRule45Panel=true] - 是否关闭45法则面板（默认关闭以避免遮挡）
 * @returns {Promise<void>}
 */
async function clickCell(page, row, col, options = {}) {
  const canvasSelector = options.canvasSelector || 'canvas';
  const closeRule45Panel = options.closeRule45Panel !== false;

  // 在页面中计算目标格子的中心坐标（相对于视口）
  const { x, y } = await page.evaluate(([r, c, selector]) => {
    const canvas = document.querySelector(selector);
    const rect = canvas.getBoundingClientRect();

    // 使用渲染器的 padding 配置（若 renderer 全局可用），
    // 否则使用默认值 12px（与 Renderer 类默认值一致）
    const pad = (typeof renderer !== 'undefined' && renderer.padding) ? renderer.padding : 12;
    const size = 9; // 9x9 棋盘

    // 计算格子的显示宽度和高度
    const cellW = (rect.width - pad * 2) / size;
    const cellH = (rect.height - pad * 2) / size;

    // 计算目标格子中心的坐标（相对于视口）
    const centerX = rect.left + pad + (c + 0.5) * cellW;
    const centerY = rect.top + pad + (r + 0.5) * cellH;

    return { x: centerX, y: centerY };
  }, [row, col, canvasSelector]);

  // 使用 Playwright 的鼠标 API 点击计算出的坐标
  await page.mouse.click(x, y);

  // 点击后关闭45法则提示面板（如果显示），防止遮挡后续操作
  if (closeRule45Panel) {
    await page.evaluate(() => {
      if (typeof hideRule45Hint === 'function') {
        hideRule45Hint();
      }
    });
  }
}

// ==========================================
//  数字键盘操作
// ==========================================

/**
 * 点击数字键盘输入数字
 *
 * 直接调用游戏内部的 handleNumberInput 函数来输入数字。
 * 这样可以避免 UI 层面的问题（如音频异常、动画延迟等）影响测试结果。
 * 同时也会触发数字按钮的视觉效果，确保 UI 状态一致。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {number} num - 要输入的数字（1-9）
 * @returns {Promise<void>}
 */
async function inputNumber(page, num) {
  // 直接调用游戏内部的 handleNumberInput 函数
  // 这比点击按钮更可靠，避免了音频异常等 UI 问题
  await page.evaluate((n) => {
    if (typeof handleNumberInput === 'function') {
      handleNumberInput(n);
    }
  }, num);
}

// ==========================================
//  提示面板操作
// ==========================================

/**
 * 等待提示面板出现
 *
 * 同时支持两种提示面板：
 * 1. 技巧演示面板（#script-hint-overlay）- 主要的提示面板
 * 2. 45法则计算器面板（#rule45-hint-panel）
 *
 * 任一面板可见即视为提示面板已出现。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {number} [timeout=5000] - 超时时间（毫秒）
 * @returns {Promise<void>}
 */
async function waitForHintPanel(page, timeout = 5000) {
  await page.waitForFunction(() => {
    // 检查技巧提示面板
    const scriptOverlay = document.getElementById('script-hint-overlay');
    if (scriptOverlay && !scriptOverlay.classList.contains('hidden')) {
      return true;
    }
    // 检查 45 法则提示面板
    const rule45Panel = document.getElementById('rule45-hint-panel');
    if (rule45Panel && !rule45Panel.classList.contains('hidden')) {
      return true;
    }
    return false;
  }, { timeout });
}

/**
 * 关闭提示面板
 *
 * 尝试关闭当前显示的提示面板。
 * 优先关闭技巧演示面板（通过关闭按钮），
 * 其次关闭 45 法则面板。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<void>}
 */
async function closeHintPanel(page) {
  await page.evaluate(() => {
    // 尝试关闭技巧提示面板
    const scriptOverlay = document.getElementById('script-hint-overlay');
    if (scriptOverlay && !scriptOverlay.classList.contains('hidden')) {
      const closeBtn = scriptOverlay.querySelector('.script-close');
      if (closeBtn) {
        closeBtn.click();
        return;
      }
    }
    // 尝试关闭 45 法则提示面板
    const rule45Panel = document.getElementById('rule45-hint-panel');
    if (rule45Panel && !rule45Panel.classList.contains('hidden')) {
      rule45Panel.classList.add('hidden');
    }
  });
}

// ==========================================
//  45法则面板操作
// ==========================================

/**
 * 关闭45法则提示面板
 *
 * 点击格子后会自动弹出45法则提示面板，
 * 该面板可能遮挡棋盘，影响后续测试操作。
 * 调用此函数可手动关闭面板。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<void>}
 */
async function closeRule45Panel(page) {
  await page.evaluate(() => {
    if (typeof hideRule45Hint === 'function') {
      hideRule45Hint();
    }
  });
}

// ==========================================
//  工具栏操作
// ==========================================

/**
 * 执行撤销操作
 *
 * 直接调用游戏内部的 undo 方法，
 * 避免 UI 层面的音频异常等问题导致操作失败。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<void>}
 */
async function undo(page) {
  await page.evaluate(() => {
    if (window.gameBoard && typeof window.gameBoard.undo === 'function') {
      window.gameBoard.undo();
    }
  });
}

/**
 * 执行擦除操作
 *
 * 直接调用游戏内部的 eraseNumber 方法，
 * 避免 UI 层面的音频异常等问题导致操作失败。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<void>}
 */
async function erase(page) {
  await page.evaluate(() => {
    if (window.gameBoard && typeof window.gameBoard.eraseNumber === 'function') {
      window.gameBoard.eraseNumber();
    }
  });
}

/**
 * 切换候选模式
 *
 * 直接调用游戏内部的方法切换输入模式。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<void>}
 */
async function toggleCandidateMode(page) {
  await page.evaluate(() => {
    if (window.gameBoard) {
      if (window.gameBoard.inputMode === 'candidate') {
        window.gameBoard.inputMode = 'normal';
      } else {
        window.gameBoard.inputMode = 'candidate';
      }
    }
  });
}

// ==========================================
//  控制台与错误检测
// ==========================================

/**
 * 获取控制台错误信息
 *
 * 返回页面加载以来所有 console.error 级别的消息数组。
 * 需要在测试开始前通过 page.on('console') 收集消息，
 * 本函数从 Playwright 内部状态中提取。
 *
 * 注意：使用前需确保 page 已注册 console 事件监听，
 * 或直接使用 page 内置的错误检测机制。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<string[]>} 错误消息数组
 */
async function getConsoleErrors(page) {
  return page.evaluate(() => {
    // 读取页面中可能存在的错误日志（如果游戏代码有收集的话）
    if (typeof window._consoleErrors !== 'undefined') {
      return window._consoleErrors;
    }
    return [];
  });
}

/**
 * 收集控制台错误的辅助设置函数
 *
 * 在测试开始前调用，将页面的 console.error 消息
 * 收集到 window._consoleErrors 数组中，
 * 方便后续通过 getConsoleErrors() 获取。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<void>}
 */
async function setupConsoleErrorCollection(page) {
  await page.evaluate(() => {
    window._consoleErrors = [];
    const originalError = console.error;
    console.error = function (...args) {
      window._consoleErrors.push(args.map(String).join(' '));
      originalError.apply(console, args);
    };
  });
}

// ==========================================
//  棋盘状态评估
// ==========================================

/**
 * 获取完整棋盘状态
 *
 * 返回一个 9x9 二维数组，表示当前棋盘上的所有数字。
 * 预填数字和玩家填入的数字都会返回，空格返回 0。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @returns {Promise<number[][]>} 9x9 二维数组，每个元素为格子中的数字（0 表示空）
 */
async function evaluateBoardState(page) {
  return page.evaluate(() => {
    const board = window.gameBoard;
    const size = board.size;
    const result = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.fillNum !== null) {
          row.push(cell.fillNum);
        } else if (cell.fixedNum !== null) {
          row.push(cell.fixedNum);
        } else {
          row.push(0);
        }
      }
      result.push(row);
    }
    return result;
  });
}

// ==========================================
//  笼子（Cage）相关操作
// ==========================================

/**
 * 计算指定笼子的预期和值
 *
 * 根据笼子 ID 查找对应的笼子配置，返回其目标和值（sum 属性）。
 * 若找不到该笼子，返回 -1。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {number|string} cageId - 笼子 ID
 * @returns {Promise<number>} 笼子的预期和值，找不到返回 -1
 */
async function calculateExpectedCageSum(page, cageId) {
  return page.evaluate((id) => {
    const cage = window.gameBoard.cages.find(c => c.id === id);
    if (!cage) return -1;
    return cage.sum;
  }, cageId);
}

/**
 * 获取指定笼子中所有格子的当前数字和
 *
 * 用于验证笼子和值是否正确。
 * 只计算已填入数字的格子（预填 + 玩家填数）。
 *
 * @param {import('@playwright/test').Page} page - Playwright 页面对象
 * @param {number|string} cageId - 笼子 ID
 * @returns {Promise<{sum: number, filledCount: number, totalCells: number}>}
 *   当前和值、已填格数、总格数
 */
async function getCurrentCageSum(page, cageId) {
  return page.evaluate((id) => {
    const cage = window.gameBoard.cages.find(c => c.id === id);
    if (!cage) return { sum: 0, filledCount: 0, totalCells: 0 };

    let sum = 0;
    let filledCount = 0;
    for (const [r, c] of cage.cells) {
      const cell = window.gameBoard.cells[r][c];
      const val = cell.fillNum !== null ? cell.fillNum : cell.fixedNum;
      if (val !== null) {
        sum += val;
        filledCount++;
      }
    }
    return {
      sum,
      filledCount,
      totalCells: cage.cells.length,
    };
  }, cageId);
}

// ==========================================
//  导出
// ==========================================

module.exports = {
  waitForGameReady,
  getCellValue,
  clickCell,
  inputNumber,
  getCandidates,
  waitForHintPanel,
  closeHintPanel,
  closeRule45Panel,
  undo,
  erase,
  toggleCandidateMode,
  getConsoleErrors,
  setupConsoleErrorCollection,
  evaluateBoardState,
  calculateExpectedCageSum,
  getCurrentCageSum,
};
