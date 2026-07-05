// @ts-check
const { test, expect } = require('@playwright/test');
const { waitForGameReady } = require('../utils/helpers');

test.describe('调试响应式测试', () => {
  test('调试：不同视口下棋盘尺寸', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page, 15000);
    await page.waitForTimeout(500);

    const sizes = [
      { w: 640, h: 480 },
      { w: 1024, h: 768 },
      { w: 1280, h: 800 },
    ];

    for (const size of sizes) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.waitForTimeout(500);
      
      // 触发 resize 事件
      await page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
      });
      await page.waitForTimeout(500);

      const info = await page.evaluate(() => {
        const canvas = document.querySelector('#gameCanvas');
        const boardArea = document.querySelector('#board-area');
        const gameContainer = document.querySelector('#game-container');
        const app = document.querySelector('#app');
        
        return {
          canvasRect: canvas ? {
            w: canvas.getBoundingClientRect().width,
            h: canvas.getBoundingClientRect().height,
          } : null,
          boardAreaRect: boardArea ? {
            w: boardArea.getBoundingClientRect().width,
            h: boardArea.getBoundingClientRect().height,
          } : null,
          gameContainerRect: gameContainer ? {
            w: gameContainer.getBoundingClientRect().width,
            h: gameContainer.getBoundingClientRect().height,
          } : null,
          appRect: app ? {
            w: app.getBoundingClientRect().width,
            h: app.getBoundingClientRect().height,
          } : null,
          canvasWidth: canvas ? canvas.width : 0,
          canvasHeight: canvas ? canvas.height : 0,
        };
      });

      console.log(`视口 ${size.w}x${size.h}:`);
      console.log(`  canvas CSS: ${info.canvasRect?.w}x${info.canvasRect?.h}`);
      console.log(`  canvas 实际: ${info.canvasWidth}x${info.canvasHeight}`);
      console.log(`  board-area: ${info.boardAreaRect?.w}x${info.boardAreaRect?.h}`);
      console.log(`  game-container: ${info.gameContainerRect?.w}x${info.gameContainerRect?.h}`);
      console.log(`  app: ${info.appRect?.w}x${info.appRect?.h}`);
    }

    expect(true).toBe(true);
  });

  test('调试：横屏布局结构', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page, 15000);
    await page.waitForTimeout(500);

    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('#gameCanvas');
      const numpad = document.querySelector('#num-pad');
      const header = document.querySelector('#game-header');
      const toolbar = document.querySelector('#toolbar');
      const boardArea = document.querySelector('#board-area');
      
      const result = {};
      
      if (canvas) {
        const r = canvas.getBoundingClientRect();
        result.canvas = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height };
      }
      if (numpad) {
        const r = numpad.getBoundingClientRect();
        result.numpad = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height };
      }
      if (header) {
        const r = header.getBoundingClientRect();
        result.header = { top: r.top, bottom: r.bottom, w: r.width, h: r.height };
      }
      if (toolbar) {
        const r = toolbar.getBoundingClientRect();
        result.toolbar = { top: r.top, bottom: r.bottom, w: r.width, h: r.height };
      }
      if (boardArea) {
        const r = boardArea.getBoundingClientRect();
        result.boardArea = { top: r.top, bottom: r.bottom, w: r.width, h: r.height };
      }
      
      return result;
    });

    console.log('横屏布局:');
    console.log(JSON.stringify(layout, null, 2));

    expect(true).toBe(true);
  });
});
