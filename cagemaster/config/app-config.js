// ==========================================
// 统一配置中心
// 所有功能开关集中管理，便于抖音/多平台适配
// ==========================================

const CONFIG = (function() {
  const isLocalhost = window.location && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );

  return {
    // ---------- 环境 ----------
    debug: isLocalhost,                // 本地开发时自动启用
    platform: 'web',                   // 'web' | 'douyin'（构建时注入）
    cdnBase: 'https://your-cdn.com/killersudoku/', // 占位

    // ---------- 功能开关 ----------
    demoMode: false,                   // 演示模式
    ads: true,                         // 广告
    cheat: false,                      // 作弊模式
    testing: false,                    // 测试模式
    skipBoss: false,                   // 跳过Boss战
    devTools: isLocalhost,             // 开发者工具

    // ---------- 路径 ----------
    paths: {
      portraits: 'assets/images/portraits/',
      audio: 'assets/audio/',
    },

    // ---------- 抖音适配 ----------
    douyin: {
      appId: '',                        // 抖音小程序appId
      version: '1.2.1',
      adUnitId: '',                     // 激励广告单元ID
    }
  };
})();

// 导出到全局
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
  if (CONFIG.debug) console.log('[CONFIG] 已加载 (debug模式)');
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
