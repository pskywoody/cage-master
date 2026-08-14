// P0-3 适配验证：按屏幕宽高比判定 PC/手机布局
// 模拟 window.innerWidth/innerHeight，验证 isPcLayoutActive 判定正确
import PcLayoutManager from '../ui/pc-layout-manager.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// 构造 DOM 模拟环境
const fakeWindow = { innerWidth: 0, innerHeight: 0, addEventListener: () => {} };
const fakeDoc = { body: { classList: { contains: () => false, toggle: () => {} } }, getElementById: () => null };
global.window = fakeWindow;
global.document = fakeDoc;

const cases = [
  // [名称, w, h, 期望结果]
  ['iPhone 竖屏 9:16 (390x844)', 390, 844, false],
  ['iPhone 横屏 16:9 (844x390)', 844, 390, false], // 宽度<900 不激活
  ['Android 竖屏 9:19.5 (360x780)', 360, 780, false],
  ['PC 16:9 (1920x1080)', 1920, 1080, true],
  ['PC 16:10 (1440x900)', 1440, 900, true],   // 1.6 >= 1.4
  ['PC 21:9 (2560x1080)', 2560, 1080, true],
  ['笔记本 16:9 (1366x768)', 1366, 768, true],
  ['平板竖屏 3:4 (768x1024)', 768, 1024, false], // 宽度<900
  ['平板竖屏 4:3 (1024x768)', 1024, 768, false],  // 宽高比 1.33 < 1.4 → 单栏
  ['平板横屏 4:3 宽 (1366x1024)', 1366, 1024, false], // 1.33 < 1.4
  ['折叠屏横置 16:9 (1024x576)', 1024, 576, true],
  ['桌面 5:4 (1280x1024)', 1280, 1024, false], // 1.25 < 1.4
];

for (const [name, w, h, expected] of cases) {
  fakeWindow.innerWidth = w;
  fakeWindow.innerHeight = h;
  const mgr = new PcLayoutManager({});
  const got = mgr.isPcLayoutActive();
  assert(name + ' → ' + (got ? 'PC双栏' : '单栏'), got === expected, 'got=' + got + ' expected=' + expected);
}

console.log(`\nP0-3 布局判定验证: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
