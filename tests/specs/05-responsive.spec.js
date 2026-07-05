// @ts-check
/**
 * ============================================================
 *  05 - 响应式布局测试
 * ============================================================
 *
 *  测试目标：验证游戏在不同屏幕尺寸和方向下的布局表现，
 *  确保棋盘自适应、UI 元素正确分布，且在各种设备上都有良好体验。
 *
 *  游戏布局特点：
 *  - 上下结构：顶部状态栏 + 棋盘区 + 工具栏 + 数字键盘
 *  - 最大宽度限制：桌面端固定宽度，水平居中
 *  - 移动端：宽度撑满屏幕，棋盘自适应高度
 *
 *  测试范围：
 *    - T26 竖屏布局（手机模拟）
 *    - T27 横屏布局（平板/PC）
 *    - T28 窗口缩放自适应
 * ============================================================
 */

const { test, expect } = require('@playwright/test');
const { waitForGameReady } = require('../utils/helpers');

// ============================================================
//  测试分组：响应式布局测试
// ============================================================
test.describe('响应式布局测试', () => {

  // ============================================================
  //  T26 - 竖屏布局（手机模拟）
  // ============================================================
  test('T26 - 竖屏布局（手机模拟）', async ({ page }) => {
    // 设置视口为手机竖屏尺寸（iPhone 12 类似尺寸）
    await page.setViewportSize({ width: 390, height: 844 });

    // 加载游戏页面（杀手数独关卡）
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');

    // 等待游戏初始化完成
    await waitForGameReady(page, 15000);

    // 等待页面布局稳定（确保 CSS 和渲染完成）
    await page.waitForTimeout(500);

    // ---- 获取棋盘 canvas 尺寸 ----
    const canvasRect = await page.evaluate(() => {
      const canvas = document.querySelector('#gameCanvas') || document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });

    expect(canvasRect, '棋盘 canvas 应存在').not.toBeNull();

    // ---- 验证棋盘居中显示 ----
    const viewportWidth = 390;
    const leftMargin = canvasRect.left;
    const rightMargin = viewportWidth - canvasRect.right;
    const marginDiff = Math.abs(leftMargin - rightMargin);

    // 棋盘应在水平方向大致居中（允许小的偏差）
    expect(marginDiff, '棋盘在水平方向应大致居中').toBeLessThan(20);

    // ---- 验证棋盘不超出视口 ----
    expect(canvasRect.left, '棋盘左边不应超出视口').toBeGreaterThanOrEqual(0);
    expect(canvasRect.right, '棋盘右边不应超出视口').toBeLessThanOrEqual(viewportWidth);

    // ---- 验证棋盘保持正方形比例 ----
    const aspectRatio = canvasRect.width / canvasRect.height;
    expect(aspectRatio, '棋盘应保持正方形比例（宽高比接近 1）').toBeCloseTo(1, 1);

    // ---- 验证 UI 元素按上下顺序排列 ----
    const layoutOrder = await page.evaluate(() => {
      const header = document.querySelector('#game-header');
      const canvas = document.querySelector('#gameCanvas');
      const toolbar = document.querySelector('#toolbar');
      const numpad = document.querySelector('#num-pad');

      const result = {};
      if (header) result.headerTop = header.getBoundingClientRect().top;
      if (canvas) result.canvasTop = canvas.getBoundingClientRect().top;
      if (toolbar) result.toolbarTop = toolbar.getBoundingClientRect().top;
      if (numpad) result.numpadTop = numpad.getBoundingClientRect().top;

      return result;
    });

    // 验证从上到下的顺序：header → canvas → toolbar → numpad
    expect(layoutOrder.headerTop, 'header 应在最上方').toBeLessThan(layoutOrder.canvasTop);
    expect(layoutOrder.canvasTop, '棋盘应在 header 下方').toBeGreaterThan(layoutOrder.headerTop);
    expect(layoutOrder.toolbarTop, '工具栏应在棋盘下方').toBeGreaterThan(layoutOrder.canvasTop);
    expect(layoutOrder.numpadTop, '数字键盘应在工具栏下方').toBeGreaterThan(layoutOrder.toolbarTop);
  });

  // ============================================================
  //  T27 - 横屏布局（平板/PC）
  // ============================================================
  test('T27 - 横屏布局（平板/PC）', async ({ page }) => {
    // 设置视口为桌面横屏尺寸
    await page.setViewportSize({ width: 1280, height: 800 });

    // 加载游戏页面
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');

    // 等待游戏初始化完成
    await waitForGameReady(page, 15000);

    // 等待布局稳定
    await page.waitForTimeout(500);

    // ---- 获取棋盘 canvas 尺寸 ----
    const canvasRect = await page.evaluate(() => {
      const canvas = document.querySelector('#gameCanvas') || document.querySelector('canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });

    expect(canvasRect, '棋盘 canvas 应存在').not.toBeNull();

    // ---- 验证棋盘高度适应屏幕 ----
    // 棋盘高度不应超过屏幕高度
    expect(canvasRect.height, '棋盘高度不应超过屏幕高度').toBeLessThanOrEqual(800);

    // 棋盘高度应占屏幕高度的合理比例（至少 40%，确保足够大）
    expect(canvasRect.height / 800, '棋盘高度应至少占屏幕高度的 40%').toBeGreaterThan(0.4);

    // ---- 验证棋盘保持正方形比例 ----
    const aspectRatio = canvasRect.width / canvasRect.height;
    expect(aspectRatio, '棋盘应保持正方形比例（宽高比接近 1）').toBeCloseTo(1, 1);

    // ---- 验证棋盘在水平方向居中（桌面端固定宽度居中显示） ----
    const viewportWidth = 1280;
    const leftMargin = canvasRect.left;
    const rightMargin = viewportWidth - canvasRect.right;
    const marginDiff = Math.abs(leftMargin - rightMargin);

    // 桌面端棋盘应水平居中
    expect(marginDiff, '横屏布局中棋盘应水平居中').toBeLessThan(50);

    // ---- 验证 UI 元素仍按上下顺序排列 ----
    const layoutOrder = await page.evaluate(() => {
      const header = document.querySelector('#game-header');
      const canvas = document.querySelector('#gameCanvas');
      const toolbar = document.querySelector('#toolbar');
      const numpad = document.querySelector('#num-pad');

      const result = {};
      if (header) result.headerTop = header.getBoundingClientRect().top;
      if (canvas) result.canvasTop = canvas.getBoundingClientRect().top;
      if (toolbar) result.toolbarTop = toolbar.getBoundingClientRect().top;
      if (numpad) result.numpadTop = numpad.getBoundingClientRect().top;

      return result;
    });

    // 验证从上到下的顺序：header → canvas → toolbar → numpad
    expect(layoutOrder.headerTop, 'header 应在最上方').toBeLessThan(layoutOrder.canvasTop);
    expect(layoutOrder.canvasTop, '棋盘应在 header 下方').toBeGreaterThan(layoutOrder.headerTop);
    expect(layoutOrder.toolbarTop, '工具栏应在棋盘下方').toBeGreaterThan(layoutOrder.canvasTop);
    expect(layoutOrder.numpadTop, '数字键盘应在工具栏下方').toBeGreaterThan(layoutOrder.toolbarTop);

    // ---- 验证棋盘不超出视口 ----
    expect(canvasRect.left, '棋盘左边不应超出视口').toBeGreaterThanOrEqual(0);
    expect(canvasRect.top, '棋盘顶部不应超出视口').toBeGreaterThanOrEqual(0);
    expect(canvasRect.right, '棋盘右边不应超出视口').toBeLessThanOrEqual(1280);
    expect(canvasRect.bottom, '棋盘底部不应超出视口').toBeLessThanOrEqual(800);
  });

  // ============================================================
  //  T28 - 窗口缩放自适应
  // ============================================================
  test('T28 - 窗口缩放自适应', async ({ page }) => {
    // 先加载游戏页面
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page, 15000);
    await page.waitForTimeout(500);

    // 定义要测试的视口尺寸列表
    // 游戏在桌面端有最大宽度限制，所以我们测试不同高度
    // 以及小视口下宽度是否自适应
    const viewportSizes = [
      { width: 390, height: 844, label: '手机竖屏 390x844' },
      { width: 768, height: 1024, label: '平板竖屏 768x1024' },
      { width: 1280, height: 800, label: '桌面横屏 1280x800' },
    ];

    // 存储每个尺寸下的棋盘尺寸，用于后续比较
    const results = [];

    for (const size of viewportSizes) {
      // ---- 设置视口大小 ----
      await page.setViewportSize({ width: size.width, height: size.height });

      // 等待布局重新计算和渲染稳定
      await page.waitForTimeout(300);

      // 触发一次重绘以确保布局更新
      await page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
      });
      await page.waitForTimeout(300);

      // ---- 获取棋盘 canvas 的 boundingClientRect ----
      const canvasRect = await page.evaluate(() => {
        const canvas = document.querySelector('#gameCanvas') || document.querySelector('canvas');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      });

      expect(canvasRect, `视口 ${size.label} 下棋盘 canvas 应存在`).not.toBeNull();

      results.push({
        viewport: size,
        canvas: canvasRect,
      });

      // ---- 验证棋盘不超出视口 ----
      expect(canvasRect.width,
        `视口 ${size.label} 下棋盘宽度不应超过视口宽度`
      ).toBeLessThanOrEqual(size.width);
      expect(canvasRect.height,
        `视口 ${size.label} 下棋盘高度不应超过视口高度`
      ).toBeLessThanOrEqual(size.height);

      // ---- 验证棋盘保持合理比例 ----
      // 注意：手机竖屏下可能因为高度限制导致棋盘略呈长方形
      // 只要比例在合理范围内（0.7 - 1.3）就可以接受
      const aspectRatio = canvasRect.width / canvasRect.height;
      expect(aspectRatio,
        `视口 ${size.label} 下棋盘比例应在合理范围内（0.7 - 1.3）`
      ).toBeGreaterThan(0.7);
      expect(aspectRatio,
        `视口 ${size.label} 下棋盘比例应在合理范围内（0.7 - 1.3）`
      ).toBeLessThan(1.3);

      // ---- 验证棋盘在视口内可见 ----
      expect(canvasRect.width,
        `视口 ${size.label} 下棋盘宽度应大于 0`
      ).toBeGreaterThan(0);
      expect(canvasRect.height,
        `视口 ${size.label} 下棋盘高度应大于 0`
      ).toBeGreaterThan(0);

      // ---- 验证棋盘在水平方向居中 ----
      const leftMargin = canvasRect.left;
      const rightMargin = size.width - canvasRect.right;
      const marginDiff = Math.abs(leftMargin - rightMargin);
      expect(marginDiff,
        `视口 ${size.label} 下棋盘应水平居中`
      ).toBeLessThan(30);
    }

    // ---- 验证小屏宽度自适应，大屏有最大宽度 ----
    // 手机竖屏（390px宽）下，棋盘宽度应该接近视口宽度（撑满）
    const mobileResult = results.find(r => r.viewport.label.includes('手机'));
    if (mobileResult) {
      const widthRatio = mobileResult.canvas.width / mobileResult.viewport.width;
      expect(widthRatio, '手机竖屏下棋盘宽度应接近视口宽度（至少 80%）').toBeGreaterThan(0.8);
    }

    // 桌面横屏（1280px宽）下，棋盘宽度应小于视口宽度（有最大宽度限制）
    const desktopResult = results.find(r => r.viewport.label.includes('桌面'));
    if (desktopResult) {
      const widthRatio = desktopResult.canvas.width / desktopResult.viewport.width;
      expect(widthRatio, '桌面横屏下棋盘宽度应小于视口宽度（最大宽度限制）').toBeLessThan(0.8);
    }

    // ---- 验证所有尺寸下棋盘都可见且比例正确 ----
    // （这是基本的健康检查，上面已经逐个验证过了）
    expect(results.length, '应测试所有视口尺寸').toBe(viewportSizes.length);
  });

});
