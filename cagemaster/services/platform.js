// ==========================================
// 平台适配层 v1
// 封装所有平台相关API，统一调用入口
// Web版：使用标准浏览器API
// 抖音版：使用 tt.* API（待集成）
// ==========================================

const Platform = (function() {

  const isDouyin = typeof tt !== 'undefined';

  // ---------- 存储 ----------
  function getStorage(key) {
    try {
      if (isDouyin) {
        return tt.getStorageSync(key);
      }
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch (e) {
      if (CONFIG && CONFIG.debug) console.warn('[Platform] getStorage error:', e);
      return null;
    }
  }

  function setStorage(key, value) {
    try {
      if (isDouyin) {
        tt.setStorageSync(key, value);
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      if (CONFIG && CONFIG.debug) console.warn('[Platform] setStorage error:', e);
    }
  }

  function removeStorage(key) {
    try {
      if (isDouyin) {
        tt.removeStorageSync(key);
        return;
      }
      localStorage.removeItem(key);
    } catch (e) {
      if (CONFIG && CONFIG.debug) console.warn('[Platform] removeStorage error:', e);
    }
  }

  // ---------- 网络请求 ----------
  function request(url, options) {
    options = options || {};
    if (isDouyin) {
      return new Promise((resolve, reject) => {
        tt.request({
          url,
          method: options.method || 'GET',
          data: options.data,
          header: options.headers,
          success: (res) => resolve(res),
          fail: (err) => reject(err)
        });
      });
    }
    return fetch(url, {
      method: options.method || 'GET',
      body: options.data ? JSON.stringify(options.data) : undefined,
      headers: options.headers || { 'Content-Type': 'application/json' }
    }).then(r => r.json());
  }

  // ---------- 音频 ----------
  function createAudio(src) {
    if (isDouyin) {
      const audio = tt.createInnerAudioContext();
      audio.src = src;
      return audio;
    }
    const audio = new Audio(src);
    return audio;
  }

  // ---------- 事件绑定 ----------
  function onTouchStart(callback) {
    if (isDouyin) {
      tt.onTouchStart(callback);
      return () => tt.offTouchStart(callback);
    }
    document.addEventListener('touchstart', callback);
    return () => document.removeEventListener('touchstart', callback);
  }

  // ---------- 震动反馈 ----------
  function vibrate(pattern) {
    if (isDouyin) {
      tt.vibrateShort({ type: pattern > 200 ? 'heavy' : 'medium' });
      return;
    }
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  // ---------- 设备信息 ----------
  function getDeviceInfo() {
    if (isDouyin) {
      const info = tt.getSystemInfoSync();
      return {
        width: info.windowWidth,
        height: info.windowHeight,
        pixelRatio: info.pixelRatio,
        platform: info.platform
      };
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      platform: 'web'
    };
  }

  return {
    isDouyin,
    getStorage,
    setStorage,
    removeStorage,
    request,
    createAudio,
    onTouchStart,
    vibrate,
    getDeviceInfo
  };
})();

// 导出到全局
if (typeof window !== 'undefined') {
  window.Platform = Platform;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Platform;
}
