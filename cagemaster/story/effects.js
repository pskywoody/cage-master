// ==========================================
// 特效系统 Effects
// 提供震动/闪光/脉冲/暗角/立绘特写/金色闪光/画面撕裂等效果
// 遵循"轻量级、可降级、渐进增强"原则
// ==========================================

const Effects = (function() {
  let container = null;
  let flashEl = null;
  let vignetteEl = null;
  let borderPulseEl = null;
  let portraitZoomEl = null;
  let screenTearEl = null;
  let goldenFlashEl = null;
  let crackEl = null;
  let bwFlashEl = null;
  let activeTimeouts = [];

  // ---- 初始化DOM容器 ----
  function init() {
    if (container) return;
    container = document.createElement('div');
    container.id = 'effects-container';
    container.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 9999; overflow: hidden;
    `;
    document.body.appendChild(container);

    // 闪光层
    flashEl = document.createElement('div');
    flashEl.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: #fff; opacity: 0; transition: none;
    `;
    container.appendChild(flashEl);

    // 金色闪光层
    goldenFlashEl = document.createElement('div');
    goldenFlashEl.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: radial-gradient(ellipse at center, rgba(255,215,0,0.6) 0%, rgba(255,215,0,0) 70%);
      opacity: 0; transition: none;
    `;
    container.appendChild(goldenFlashEl);

    // 暗角层
    vignetteEl = document.createElement('div');
    vignetteEl.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0) 100%);
      opacity: 0; transition: opacity 0.5s ease;
    `;
    container.appendChild(vignetteEl);

    // 棋盘边框脉冲层（定位在canvas上）
    borderPulseEl = document.createElement('div');
    borderPulseEl.style.cssText = `
      position: absolute; border: 3px solid transparent; border-radius: 8px;
      opacity: 0; transition: none; pointer-events: none;
    `;
    container.appendChild(borderPulseEl);

    // 立绘特写层
    portraitZoomEl = document.createElement('div');
    portraitZoomEl.style.cssText = `
      position: absolute; right: 20px; bottom: 20px;
      width: 200px; height: 250px;
      opacity: 0; transform: scale(0.5) translateX(50px);
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      background-size: contain; background-repeat: no-repeat;
      background-position: bottom right;
      pointer-events: none;
    `;
    container.appendChild(portraitZoomEl);

    // 画面撕裂效果
    screenTearEl = document.createElement('div');
    screenTearEl.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      opacity: 0; pointer-events: none;
    `;
    container.appendChild(screenTearEl);

    // 碎屏效果层
    crackEl = document.createElement('div');
    crackEl.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      opacity: 0; pointer-events: none;
      background:
        linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.6) 45%, transparent 50%),
        linear-gradient(65deg, transparent 60%, rgba(255,255,255,0.5) 63%, transparent 66%),
        linear-gradient(140deg, transparent 30%, rgba(255,255,255,0.4) 33%, transparent 36%),
        linear-gradient(200deg, transparent 70%, rgba(255,255,255,0.3) 73%, transparent 76%);
      mix-blend-mode: overlay;
    `;
    container.appendChild(crackEl);

    // 黑白闪效果层（去饱和+亮度爆发）
    bwFlashEl = document.createElement('div');
    bwFlashEl.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      opacity: 0; pointer-events: none;
      background: #fff;
      mix-blend-mode: saturation;
    `;
    container.appendChild(bwFlashEl);

    // 注入CSS动画
    const style = document.createElement('style');
    style.textContent = `
      @keyframes shake-anim {
        0%, 100% { transform: translate(0, 0); }
        10% { transform: translate(calc(-1 * var(--dx, 5px)), calc(-1 * var(--dy, 5px))); }
        20% { transform: translate(var(--dx, 5px), var(--dy, 5px)); }
        30% { transform: translate(calc(-1 * var(--dx, 5px)), var(--dy, 5px)); }
        40% { transform: translate(var(--dx, 5px), calc(-1 * var(--dy, 5px))); }
        50% { transform: translate(calc(-1 * var(--dx, 5px)), calc(-1 * var(--dy, 5px))); }
        60% { transform: translate(var(--dx, 5px), var(--dy, 5px)); }
        70% { transform: translate(calc(-1 * var(--dx, 5px)), 0); }
        80% { transform: translate(var(--dx, 5px), 0); }
        90% { transform: translate(-2px, 0); }
      }
      @keyframes flash-anim {
        0% { opacity: 0; }
        10% { opacity: var(--flash-opacity, 0.3); }
        100% { opacity: 0; }
      }
      @keyframes golden-flash-anim {
        0% { opacity: 0; transform: scale(0.8); }
        20% { opacity: 1; transform: scale(1); }
        100% { opacity: 0; transform: scale(1.5); }
      }
      @keyframes border-pulse-anim {
        0% { opacity: 0; box-shadow: 0 0 0 0 var(--pulse-color, rgba(201,176,55,0.6)); }
        30% { opacity: 1; box-shadow: 0 0 20px 5px var(--pulse-color, rgba(201,176,55,0.6)); }
        100% { opacity: 0; box-shadow: 0 0 0 0 transparent; }
      }
      @keyframes tear-anim {
        0% { opacity: 0; }
        10% { opacity: 1; }
        20% { opacity: 0; transform: translateX(0); }
        25% { opacity: 1; transform: translateX(-5px); }
        30% { opacity: 0; transform: translateX(5px); }
        35% { opacity: 1; transform: translateX(-3px); }
        40% { opacity: 0; transform: translateX(0); }
        100% { opacity: 0; }
      }
      @keyframes portrait-in {
        0% { opacity: 0; transform: scale(0.5) translateX(50px); }
        60% { opacity: 1; transform: scale(1.05) translateX(-5px); }
        100% { opacity: 1; transform: scale(1) translateX(0); }
      }
      @keyframes portrait-out {
        0% { opacity: 1; transform: scale(1) translateX(0); }
        100% { opacity: 0; transform: scale(0.8) translateX(30px); }
      }
      .shaking {
        animation: shake-anim var(--shake-duration, 200ms) ease-in-out;
      }
      .flashing {
        animation: flash-anim var(--flash-duration, 300ms) ease-out forwards;
      }
      .golden-flashing {
        animation: golden-flash-anim var(--golden-duration, 800ms) ease-out forwards;
      }
      .border-pulsing {
        animation: border-pulse-anim var(--pulse-duration, 1500ms) ease-out forwards;
      }
      .tearing {
        background: repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(255,255,255,0.03) 2px,
          rgba(255,255,255,0.03) 4px
        );
        animation: tear-anim var(--tear-duration, 600ms) ease-out forwards;
      }
      .portrait-in {
        animation: portrait-in 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      .portrait-out {
        animation: portrait-out 300ms ease-in forwards;
      }
      @keyframes crack-anim {
        0% { opacity: 0; transform: scale(0.8); }
        15% { opacity: 1; transform: scale(1); }
        60% { opacity: 0.8; }
        100% { opacity: 0; transform: scale(1.1); }
      }
      .cracking {
        animation: crack-anim var(--crack-duration, 800ms) ease-out forwards;
      }
      @keyframes bw-flash-anim {
        0% { opacity: 0; }
        10% { opacity: 1; }
        30% { opacity: 0.6; }
        100% { opacity: 0; }
      }
      .bw-flashing {
        animation: bw-flash-anim var(--bw-duration, 500ms) ease-out forwards;
      }
    `;
    document.head.appendChild(style);
  }

  function _clearTimeouts() {
    activeTimeouts.forEach(t => clearTimeout(t));
    activeTimeouts = [];
  }

  function _schedule(fn, delay) {
    const t = setTimeout(fn, delay);
    activeTimeouts.push(t);
    return t;
  }

  // ---- 震动 ----
  function shake(intensity = 5, duration = 200) {
    init();
    // 设备震动API（移动端）
    if (navigator.vibrate) {
      try { navigator.vibrate(duration > 300 ? [50, 30, 50] : Math.min(intensity * 10, 100)); } catch(e) {}
    }
    // DOM震动
    const target = document.getElementById('gameCanvas') || document.body;
    const dx = Math.min(intensity, 15);
    const dy = Math.min(intensity, 15);
    target.style.setProperty('--dx', dx + 'px');
    target.style.setProperty('--dy', dy + 'px');
    target.style.setProperty('--shake-duration', duration + 'ms');
    target.classList.remove('shaking');
    void target.offsetWidth; // reflow
    target.classList.add('shaking');
    _schedule(() => target.classList.remove('shaking'), duration);
  }

  // ---- 闪光 ----
  function flash(color = '#ffffff', duration = 300, opacity = 0.3) {
    init();
    flashEl.style.background = color;
    flashEl.style.setProperty('--flash-opacity', opacity);
    flashEl.style.setProperty('--flash-duration', duration + 'ms');
    flashEl.classList.remove('flashing');
    void flashEl.offsetWidth;
    flashEl.classList.add('flashing');
    _schedule(() => flashEl.classList.remove('flashing'), duration);
  }

  // ---- 棋盘边框脉冲 ----
  function pulseBorder(color = '#c9b037', duration = 1500) {
    init();
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    borderPulseEl.style.top = rect.top + 'px';
    borderPulseEl.style.left = rect.left + 'px';
    borderPulseEl.style.width = rect.width + 'px';
    borderPulseEl.style.height = rect.height + 'px';
    borderPulseEl.style.setProperty('--pulse-color', color);
    borderPulseEl.style.setProperty('--pulse-duration', duration + 'ms');
    borderPulseEl.classList.remove('border-pulsing');
    void borderPulseEl.offsetWidth;
    borderPulseEl.classList.add('border-pulsing');
    _schedule(() => borderPulseEl.classList.remove('border-pulsing'), duration);
  }

  // ---- 暗角渐入/渐出 ----
  function vignette(level = 0, duration = 500) {
    init();
    const darkness = Math.min(Math.max(level, 0), 0.85);
    vignetteEl.style.transition = `opacity ${duration}ms ease`;
    vignetteEl.style.background = `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${darkness}) 100%)`;
    vignetteEl.style.opacity = darkness > 0 ? '1' : '0';
  }

  // ---- 立绘特写切入 ----
  function portraitZoom(portraitFile, duration = 400) {
    init();
    if (!portraitFile) {
      // 淡出
      portraitZoomEl.classList.remove('portrait-in');
      portraitZoomEl.classList.add('portrait-out');
      _schedule(() => { portraitZoomEl.style.opacity = '0'; }, 300);
      return;
    }
    // 解析路径：如果传入的是角色ID（如'ray'），自动映射到default立绘
    let path;
    if (portraitFile.startsWith('http') || portraitFile.startsWith('assets/') || portraitFile.includes('/')) {
      path = portraitFile;
    } else {
      // 角色ID → 从CHARACTERS查找default立绘
      const char = (typeof CHARACTERS !== 'undefined') ? CHARACTERS[portraitFile] : null;
      const file = char?.portraits?.default || (portraitFile + '_default.webp');
      const base = file.replace(/\.(png|jpg|webp)$/, '');
      path = `assets/images/portraits/${base}.webp`;
    }
    // 优先 WebP，加载失败回退 PNG
    const testImg = new Image();
    testImg.onload = function() {
      portraitZoomEl.style.backgroundImage = `url('${path}')`;
    };
    testImg.onerror = function() {
      const pngPath = path.replace(/\.webp$/, '.png');
      portraitZoomEl.style.backgroundImage = `url('${pngPath}')`;
    };
    testImg.src = path;
    portraitZoomEl.classList.remove('portrait-out');
    portraitZoomEl.classList.add('portrait-in');
  }

  // ---- 全屏金色闪光（终章专用） ----
  function goldenFlash(duration = 800) {
    init();
    goldenFlashEl.style.setProperty('--golden-duration', duration + 'ms');
    goldenFlashEl.classList.remove('golden-flashing');
    void goldenFlashEl.offsetWidth;
    goldenFlashEl.classList.add('golden-flashing');
    shake(8, 300);
    if (navigator.vibrate) { try { navigator.vibrate([100, 50, 100, 50, 200]); } catch(e) {} }
    _schedule(() => goldenFlashEl.classList.remove('golden-flashing'), duration);
  }

  // ---- 画面撕裂（残影专用） ----
  function screenTear(duration = 600) {
    init();
    screenTearEl.style.setProperty('--tear-duration', duration + 'ms');
    screenTearEl.classList.remove('tearing');
    void screenTearEl.offsetWidth;
    screenTearEl.classList.add('tearing');
    shake(12, 400);
    if (navigator.vibrate) { try { navigator.vibrate([80, 40, 80, 40, 80, 40, 150]); } catch(e) {} }
    _schedule(() => screenTearEl.classList.remove('tearing'), duration);
  }

  // ---- 碎屏效果（爆裂级） ----
  function screenCrack(duration = 800) {
    init();
    crackEl.style.setProperty('--crack-duration', duration + 'ms');
    crackEl.classList.remove('cracking');
    void crackEl.offsetWidth;
    crackEl.classList.add('cracking');
    shake(15, 500);
    if (navigator.vibrate) { try { navigator.vibrate([150, 50, 120, 50, 100, 50, 200]); } catch(e) {} }
    _schedule(() => crackEl.classList.remove('cracking'), duration);
  }

  // ---- 黑白闪（情绪爆发峰值） ----
  function bwFlash(duration = 500) {
    init();
    bwFlashEl.style.setProperty('--bw-duration', duration + 'ms');
    bwFlashEl.classList.remove('bw-flashing');
    void bwFlashEl.offsetWidth;
    bwFlashEl.classList.add('bw-flashing');
    _schedule(() => bwFlashEl.classList.remove('bw-flashing'), duration);
  }

  // ---- 侧边双重闪（Boss被反超） ----
  function sideFlash(color = '#ef4444', duration = 500) {
    init();
    const left = document.createElement('div');
    const right = document.createElement('div');
    const style = `
      position: absolute; top: 0; width: 30%; height: 100%;
      background: linear-gradient(to ${'left'}, ${color}, transparent);
      opacity: 0; transition: opacity ${duration}ms;
    `;
    left.style.cssText = style + 'left: 0; background: linear-gradient(to right, ' + color + ', transparent);';
    right.style.cssText = style + 'right: 0;';
    container.appendChild(left);
    container.appendChild(right);
    requestAnimationFrame(() => {
      left.style.opacity = '0.4';
      right.style.opacity = '0.4';
    });
    _schedule(() => {
      left.style.opacity = '0';
      right.style.opacity = '0';
      _schedule(() => { left.remove(); right.remove(); }, duration);
    }, 150);
    shake(6, 100);
  }

  // ---- 全屏胜利闪光 ----
  function victoryFlash() {
    flash('#ffd700', 600, 0.2);
    _schedule(() => pulseBorder('#ffd700', 2000), 100);
    _schedule(() => shake(6, 400), 200);
  }

  // ---- Boss登场特效 ----
  function bossEnter(portraitFile) {
    vignette(0.6, 800);
    shake(10, 500);
    if (navigator.vibrate) { try { navigator.vibrate([100, 50, 150]); } catch(e) {} }
    _schedule(() => {
      portraitZoom(portraitFile, 500);
      flash('rgba(255,255,255,0.2)', 200, 0.2);
    }, 300);
  }

  // ---- 重置所有特效 ----
  function reset() {
    _clearTimeouts();
    init();
    flashEl.classList.remove('flashing');
    flashEl.style.opacity = '0';
    goldenFlashEl.classList.remove('golden-flashing');
    goldenFlashEl.style.opacity = '0';
    vignetteEl.style.opacity = '0';
    borderPulseEl.classList.remove('border-pulsing');
    borderPulseEl.style.opacity = '0';
    screenTearEl.classList.remove('tearing');
    screenTearEl.style.opacity = '0';
    crackEl.classList.remove('cracking');
    crackEl.style.opacity = '0';
    bwFlashEl.classList.remove('bw-flashing');
    bwFlashEl.style.opacity = '0';
    portraitZoomEl.classList.remove('portrait-in');
    portraitZoomEl.classList.add('portrait-out');
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch(e) {} }
  }

  // ---- 打击感等级特效（0-4级） ----
  // 0: 无声切入 - 无特效
  // 1: 轻叩 - 轻快切入，无震动，轻微音效
  // 2: 顿击 - 立绘卡入，微震动，短促音效
  // 3: 重砸 - 立绘砸入，屏幕震动，尖锐音效
  // 4: 爆裂 - 全屏冲击，强震动+碎屏/黑白闪
  function triggerLevel(level, options = {}) {
    switch(level) {
      case 0:
        // 无声切入：不触发任何特效
        break;
      case 1: // 轻叩
        pulseBorder(options.color || 'rgba(201,176,55,0.5)', 600);
        // 无震动，只有边框脉冲
        break;
      case 2: // 顿击
        sideFlash(options.color || '#6366f1', 400);
        shake(5, 120);
        if (navigator.vibrate) { try { navigator.vibrate([40, 20, 40]); } catch(e) {} }
        break;
      case 3: // 重砸
        bossEnter(options.portrait);
        break;
      case 4: // 爆裂
        // 组合效果：黑白闪 + 碎屏 + 强震动
        bwFlash(400);
        _schedule(() => {
          screenCrack(700);
        }, 100);
        break;
      default:
        break;
    }
  }

  return {
    init,
    shake,
    flash,
    pulseBorder,
    vignette,
    portraitZoom,
    goldenFlash,
    screenTear,
    screenCrack,
    bwFlash,
    sideFlash,
    victoryFlash,
    bossEnter,
    triggerLevel,
    reset
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Effects;
} else {
  window.Effects = Effects;
}
