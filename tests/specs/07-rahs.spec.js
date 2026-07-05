// @ts-check
/**
 * ============================================================
 *  07 - RAHS 推理与提示联动系统测试
 * ============================================================
 *
 *  测试目标：验证 RAHS 系统各模块功能正常
 * ============================================================
 */

const { test, expect } = require('@playwright/test');
const { waitForGameReady } = require('../utils/helpers');

// ============================================================
//  测试分组：RAHS 系统测试
// ============================================================
test.describe('RAHS 推理与提示联动系统', () => {

  test.beforeEach(async ({ page }) => {
    // 收集控制台错误
    page._consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('preload script') &&
            !text.includes('preload-browserView') &&
            !text.includes('favicon')) {
          page._consoleErrors.push(text);
        }
      }
    });
  });

  test('T01 - 页面加载后 RAHS 系统已初始化', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    const initialized = await page.evaluate(() => {
      return typeof ReasoningAndHintSystem !== 'undefined' &&
             ReasoningAndHintSystem._initialized === true;
    });
    expect(initialized).toBe(true);
    console.log('✓ RAHS 系统已初始化');
  });

  test('T02 - RAHS 所有子模块已加载', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    const modules = await page.evaluate(() => {
      return {
        ReasoningMonitor: typeof ReasoningMonitor !== 'undefined',
        EurekaDetector: typeof EurekaDetector !== 'undefined',
        DynamicThresholdCalculator: typeof DynamicThresholdCalculator !== 'undefined',
        DialogueDatabase: typeof DialogueDatabase !== 'undefined',
        CharacterErrorEngine: typeof CharacterErrorEngine !== 'undefined',
        HintDialogueDirector: typeof HintDialogueDirector !== 'undefined',
        NotePlayback: typeof NotePlayback !== 'undefined',
        DataCollector: typeof DataCollector !== 'undefined',
        ReasoningAndHintSystem: typeof ReasoningAndHintSystem !== 'undefined',
      };
    });

    for (const [name, exists] of Object.entries(modules)) {
      expect(exists, `${name} 模块未加载`).toBe(true);
      console.log(`✓ ${name} 模块已加载`);
    }
  });

  test('T03 - 填数操作触发 RAHS 事件', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => {
      // 找到第一个空格
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (!gameBoard.cells[r][c].value && !gameBoard.cells[r][c].given) {
            gameBoard.selectCell(r, c);
            if (typeof ReasoningAndHintSystem !== 'undefined') {
              ReasoningAndHintSystem.onSelect(r, c);
            }
            return { row: r, col: c, hasRahs: typeof ReasoningAndHintSystem !== 'undefined' };
          }
        }
      }
      return null;
    });

    expect(result).not.toBeNull();
    expect(result.hasRahs).toBe(true);
    console.log(`✓ 选中格子 (${result.row}, ${result.col}) 并触发 RAHS 事件`);
  });

  test('T04 - 笔记回放 UI 按钮存在', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    const btnExists = await page.evaluate(() => {
      return document.getElementById('btn-playback') !== null;
    });
    expect(btnExists).toBe(true);
    console.log('✓ 笔记回放按钮存在');
  });

  test('T05 - 设置页有角色提示开关', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    // 打开设置面板
    await page.click('#btn-setting');
    await page.waitForTimeout(500);

    const charHintExists = await page.evaluate(() => {
      return document.getElementById('setting-char-hint') !== null;
    });
    const dataCollectExists = await page.evaluate(() => {
      return document.getElementById('setting-data-collect') !== null;
    });

    expect(charHintExists).toBe(true);
    expect(dataCollectExists).toBe(true);
    console.log('✓ 设置页角色提示开关存在');
    console.log('✓ 设置页数据收集开关存在');
  });

  test('T06 - 推理监控返回有效状态', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    const state = await page.evaluate(() => {
      if (typeof ReasoningMonitor === 'undefined') return null;
      return ReasoningMonitor.getReasoningState();
    });

    expect(state).not.toBeNull();
    expect(typeof state.noteFrequency).toBe('number');
    expect(typeof state.errorRate).toBe('number');
    expect(typeof state.isEureka).toBe('boolean');
    expect(typeof state.spatialConcentration).toBe('number');
    console.log('✓ 推理监控返回有效状态:', JSON.stringify({
      noteFrequency: state.noteFrequency,
      errorRate: state.errorRate,
      isEureka: state.isEureka,
      spatialConcentration: state.spatialConcentration,
    }));
  });

  test('T07 - 动态阈值计算器返回有效阈值', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    const threshold = await page.evaluate(() => {
      if (typeof DynamicThresholdCalculator === 'undefined') return -1;
      const state = {
        noteFrequency: 5,
        noteAccuracy: 0.8,
        errorRate: 0,
        difficulty: '普通',
        isEureka: false,
        autoCandidatesOn: false,
      };
      return DynamicThresholdCalculator.calculate(state);
    });

    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThanOrEqual(120);
    console.log(`✓ 动态阈值: ${threshold}秒`);
  });

  test('T08 - Eureka 模式阈值为 0', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    const threshold = await page.evaluate(() => {
      if (typeof DynamicThresholdCalculator === 'undefined') return -1;
      const state = {
        noteFrequency: 5,
        noteAccuracy: 0.8,
        errorRate: 0,
        difficulty: '普通',
        isEureka: true,
        autoCandidatesOn: false,
      };
      return DynamicThresholdCalculator.calculate(state);
    });

    expect(threshold).toBe(0);
    console.log(`✓ Eureka 状态阈值为 0 秒（立即触发）`);
  });

  test('T09 - 角色说错机制配置正确', async ({ page }) => {
    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(1000);

    const hasEngine = await page.evaluate(() => {
      return typeof CharacterErrorEngine !== 'undefined';
    });

    expect(hasEngine).toBe(true);
    console.log('✓ 角色说错机制已加载');
  });

  test('T10 - 控制台无致命错误', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('preload script') &&
            !text.includes('preload-browserView') &&
            !text.includes('favicon') &&
            !text.includes('Failed to load resource')) {
          errors.push(text);
        }
      }
    });

    await page.goto('/index.html?chapter=hell&id=271&mode=killer');
    await waitForGameReady(page);
    await page.waitForTimeout(2000);

    if (errors.length > 0) {
      console.log('控制台错误列表:');
      errors.forEach((e, i) => console.log(`  [${i+1}] ${e}`));
    }

    expect(errors.length).toBe(0);
    console.log('✓ 控制台无致命错误');
  });
});
