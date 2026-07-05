// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Playwright 测试配置
 * 笼中密码 - 自动化测试套件
 */
module.exports = defineConfig({
  testDir: './specs',
  /* 测试超时时间 */
  timeout: 30 * 1000,
  /* 每个测试用例的期望超时 */
  expect: {
    timeout: 5000
  },
  /* 完全失败后停止运行 */
  maxFailures: 10,
  /* 测试报告 */
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../reports/html' }],
    ['json', { outputFile: '../reports/test-results.json' }]
  ],
  /* 测试目录 */
  outputDir: '../reports/test-results',
  /* 并发选项 */
  fullyParallel: false,
  workers: 1,
  /* 重试次数 */
  retries: 0,
  /* 共享设置 */
  use: {
    /* 基础 URL */
    baseURL: 'http://localhost:8080',
    /* 截图：仅失败时 */
    screenshot: 'only-on-failure',
    /* 视频：仅失败时 */
    video: 'retain-on-failure',
    /* 追踪：仅失败时 */
    trace: 'retain-on-failure',
    /* 忽略 HTTPS 错误 */
    ignoreHTTPSErrors: true,
  },

  /* 测试项目 */
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'chromium-mobile-portrait',
      use: {
        ...devices['iPhone 12'],
        isMobile: true,
      },
      grep: /响应式|竖屏|mobile/,
    },
    {
      name: 'chromium-mobile-landscape',
      use: {
        ...devices['iPhone 12 landscape'],
        isMobile: true,
      },
      grep: /响应式|横屏|landscape/,
    },
  ],

  /* 本地开发服务器 */
  webServer: {
    command: 'python -m http.server 8080 --directory ../game-src',
    url: 'http://localhost:8080/menu.html',
    reuseExistingServer: true,
    timeout: 10 * 1000,
  },
});
