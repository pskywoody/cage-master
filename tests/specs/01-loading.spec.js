// @ts-check
/**
 * ============================================================
 *  01 - 页面加载测试
 * ============================================================
 *
 *  测试目标：验证游戏各页面能否正常加载，
 *  包括主菜单、章节列表、游戏关卡、自由模式等核心页面。
 *
 *  测试范围：
 *    - T01 主菜单加载
 *    - T02 故事模式章节列表
 *    - T03 关卡加载（杀手数独）
 *    - T04 自由模式加载
 * ============================================================
 */

const { test, expect } = require('@playwright/test');
const { waitForGameReady } = require('../utils/helpers');

// ============================================================
//  测试分组：页面加载测试
// ============================================================
test.describe('页面加载测试', () => {

  // ============================================================
  //  T01 - 主菜单加载
  // ============================================================
  test('T01 - 主菜单加载', async ({ page }) => {
    // 收集控制台错误（过滤环境相关错误）
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // 过滤环境相关错误
        if (text.includes('preload script') ||
            text.includes('preload-browserView') ||
            text.includes('Failed to load resource') ||
            text.includes('404') ||
            text.includes('MIDI') ||
            text.includes('midi') ||
            text.includes('net::ERR_ABORTED') ||
            text.includes('source map')) {
          return;
        }
        consoleErrors.push(text);
      }
    });

    // 跳转到主菜单页面
    await page.goto('/menu.html');

    // 检查页面标题包含"笼中密码"或"档案侦探"
    const title = await page.title();
    expect(title).toMatch(/笼中密码|档案侦探/);

    // 检查"故事模式"按钮存在（兼容中英文）
    const storyBtn = page.locator('.menu-btn.btn-story');
    await expect(storyBtn).toBeVisible();
    const storyText = await storyBtn.locator('.btn-title').textContent();
    expect(storyText).toMatch(/故事模式|Story Mode/i);

    // 检查"自由模式"（数独谜题）按钮存在（兼容中英文）
    const freeBtn = page.locator('.menu-btn.btn-free');
    await expect(freeBtn).toBeVisible();
    const freeText = await freeBtn.locator('.btn-title').textContent();
    expect(freeText).toMatch(/数独谜题|自由模式|Free Play|Puzzles/i);

    // 检查"设置"按钮存在（兼容中英文）
    const settingsBtn = page.locator('.menu-btn.btn-settings');
    await expect(settingsBtn).toBeVisible();
    const settingsText = await settingsBtn.locator('.btn-title').textContent();
    expect(settingsText).toMatch(/设置|Settings/i);

    // 检查无控制台错误
    expect(consoleErrors, `页面存在控制台错误: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  // ============================================================
  //  T02 - 故事模式章节列表
  // ============================================================
  test('T02 - 故事模式章节列表', async ({ page }) => {
    // 跳转到章节选择页面
    await page.goto('/chapters.html');

    // 等待章节列表加载完成（等待 loading 文本消失，或章节卡片出现）
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.chapter-card');
      return cards.length > 0;
    }, { timeout: 10000 });

    // 检查章节卡片数量（至少有 7 个章节）
    const chapterCards = page.locator('.chapter-card');
    const count = await chapterCards.count();
    expect(count, `章节卡片数量应为至少 7 个，实际为 ${count} 个`).toBeGreaterThanOrEqual(7);

    // 检查有章节标题元素
    const chapterTitles = page.locator('.chapter-title');
    await expect(chapterTitles.first()).toBeVisible();

    // 检查章节标题不为空
    const firstTitle = await chapterTitles.first().textContent();
    expect(firstTitle, '章节标题不应为空').toBeTruthy();
    expect(firstTitle && firstTitle.trim().length > 0, '章节标题长度应大于 0').toBeTruthy();
  });

  // ============================================================
  //  T03 - 关卡加载（杀手数独）
  // ============================================================
  test('T03 - 关卡加载（杀手数独）', async ({ page }) => {
    // 收集控制台错误（过滤环境相关错误）
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('preload script') ||
            text.includes('preload-browserView') ||
            text.includes('Failed to load resource') ||
            text.includes('404') ||
            text.includes('MIDI') ||
            text.includes('midi') ||
            text.includes('net::ERR_ABORTED') ||
            text.includes('source map') ||
            text.includes('getThemeColors')) {
          return;
        }
        consoleErrors.push(text);
      }
    });

    // 跳转到杀手数独关卡页面（地狱难度第 271 关）
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');

    // 等待游戏初始化完成（window.gameBoard 存在且已加载数据）
    await waitForGameReady(page, 15000);

    // 检查棋盘 canvas 存在
    const canvas = page.locator('#gameCanvas');
    await expect(canvas).toBeVisible();

    // 验证棋盘上有预填数字（至少有一个格子有数字）
    const hasPrefilled = await page.evaluate(() => {
      const board = window.gameBoard;
      for (let r = 0; r < board.size; r++) {
        for (let c = 0; c < board.size; c++) {
          const cell = board.cells[r][c];
          if (cell.fixedNum !== null && cell.fixedNum > 0) {
            return true;
          }
        }
      }
      return false;
    });
    expect(hasPrefilled, '棋盘上应至少有一个预填数字').toBe(true);

    // 验证笼子存在（gameBoard.cages.length > 0）
    const cageCount = await page.evaluate(() => {
      return window.gameBoard.cages ? window.gameBoard.cages.length : 0;
    });
    expect(cageCount, `笼子数量应大于 0，实际为 ${cageCount}`).toBeGreaterThan(0);

    // 检查无控制台错误
    expect(consoleErrors, `页面存在控制台错误: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  // ============================================================
  //  T04 - 自由模式加载
  // ============================================================
  test('T04 - 自由模式加载', async ({ page }) => {
    // 跳转到自由模式页面
    await page.goto('/free-play.html');

    // 检查难度筛选按钮存在（入门、简单、中等、困难、地狱）
    const diffTabs = page.locator('.diff-tab');

    // 应存在 5 个难度标签
    await expect(diffTabs).toHaveCount(5);

    // 检查各难度标签文本
    await expect(diffTabs.nth(0).locator('.diff-name')).toHaveText('入门');
    await expect(diffTabs.nth(1).locator('.diff-name')).toHaveText('简单');
    await expect(diffTabs.nth(2).locator('.diff-name')).toHaveText('中等');
    await expect(diffTabs.nth(3).locator('.diff-name')).toHaveText('困难');
    await expect(diffTabs.nth(4).locator('.diff-name')).toHaveText('地狱');

    // 等待关卡列表加载完成
    await page.waitForFunction(() => {
      const grid = document.getElementById('levelsGrid');
      if (!grid) return false;
      // 等待加载中提示消失或关卡格子出现
      const cells = grid.querySelectorAll('.level-cell');
      return cells.length > 0 || grid.textContent?.indexOf('加载中') === -1;
    }, { timeout: 10000 });

    // 检查关卡列表元素存在
    const levelsGrid = page.locator('#levelsGrid');
    await expect(levelsGrid).toBeVisible();

    // 检查关卡网格中有关卡格子（或至少有内容显示）
    const levelCells = page.locator('.level-cell');
    const cellCount = await levelCells.count();
    if (cellCount > 0) {
      // 有关卡格子时，检查第一个格子可见
      await expect(levelCells.first()).toBeVisible();
    } else {
      // 没有关卡格子时，检查网格中有内容（如"此难度题目正在收集中"等提示）
      const gridText = await levelsGrid.textContent();
      expect(gridText, '关卡网格应有内容显示').toBeTruthy();
    }
  });

});
