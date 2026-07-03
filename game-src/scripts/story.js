// ==========================================
// Story Engine v3 - 逆转裁判级演出系统
// 特性：打字机文字、瞬间表情切换、Boss砸入、情绪音效、异议指示器
// ==========================================

const StoryEngine = (function() {
  let currentPortrait = null;
  let dialogueQueue = [];
  let isPlaying = false;
  let audioEl = null;
  let bubbleEl = null;
  let portraitEl = null;
  let overlayEl = null;
  let objectionEl = null;
  let titleCardEl = null;
  let onCompleteCallback = null;
  let voiceEnabled = true;
  let _audioUnlocked = false;
  let _autoAdvanceTimer = null;
  let _typewriterTimer = null;
  let _isBossEnter = false;
  let _typingSpeed = 45; // ms per character (slightly slower for better readability)
  let _isMobile = false;

  // ---- 打字机速度档位（P0 剧情张力增强）----
  const TYPING_SPEEDS = {
    serene: 80,    // 庄重/教学：慢，一字一顿
    normal: 40,    // 日常对话
    fast: 15,      // 吐槽/爆发/快速
    instant: 0,    // 瞬间显示（系统/彩蛋）
    heavy: 120,    // Boss压迫感：极慢
    thinking: 60,  // 思考状态：稍慢
  };

  // ---- 情绪 → 打字机速度映射 ----
  function _emotionTypingSpeed(emotion) {
    const e = (emotion || 'default').toLowerCase();
    switch (e) {
      case 'serious':
      case 'sad':
      case 'lose':
      case 'stern':
        return TYPING_SPEEDS.serene;
      case 'think':
      case 'thinking':
        return TYPING_SPEEDS.thinking;
      case 'surprised':
      case 'angry':
        return TYPING_SPEEDS.fast;
      case 'confident':
        return TYPING_SPEEDS.heavy;
      case 'smile':
      case 'smirk':
      case 'default':
      default:
        return TYPING_SPEEDS.normal;
    }
  }

  // ---- 判断情绪是否属于"爆发类"（用于前慢后快的节奏变化）----
  function _isBurstEmotion(emotion) {
    const e = (emotion || '').toLowerCase();
    return e === 'surprised' || e === 'angry';
  }
  let _pendingVoiceId = null; // voice to play after audio unlocks
  let _portraitZoom = 1.0;    // 当前立绘缩放比例（1.0 = normal）
  let _portraitShakeTimer = null;
  const PORTRAIT_ZOOM_LEVELS = {
    far: 0.85,
    normal: 1.0,
    close: 1.15,
  };

  // ---- 解锁音频 ----
  function _unlockAudio() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    try {
      if (typeof AudioManager !== 'undefined') AudioManager.resume();
      const silent = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQcAQNHWpXYRAPv/0Lc+EA==');
      silent.volume = 0;
      silent.play().catch(() => {});
    } catch(e) {}
    document.removeEventListener('click', _unlockAudio, true);
    document.removeEventListener('touchstart', _unlockAudio, true);
    document.removeEventListener('keydown', _unlockAudio, true);

    // 音频解锁后，如果有等待播放的配音，立即播放
    if (_pendingVoiceId) {
      const vid = _pendingVoiceId;
      _pendingVoiceId = null;
      playVoice(vid);
    }
  }

  // ---- 播放音效（自动尝试解锁音频）----
  function _sfx(name) {
    if (typeof AudioManager === 'undefined') return;
    try { AudioManager.resume(); } catch(e) {}
    const fn = AudioManager[name];
    if (typeof fn === 'function') {
      try { fn.call(AudioManager); } catch(e) {}
    }
  }

  // ---- 情绪对应的音效 ----
  function _emotionSfx(emotion) {
    const e = emotion || 'default';
    if (e === 'surprised') _sfx('playEmotionSurprise');
    else if (e === 'angry') _sfx('playEmotionAngry');
    else if (e === 'smirk' || e === 'confident') _sfx('playEmotionSmirk');
    else if (e === 'sad' || e === 'lose') _sfx('playEmotionSad');
    else if (e === 'think' || e === 'thinking') _sfx('playThinking');
  }

  // ---- 震动反馈（分级：light / medium / strong / victory / slam / insight / objection / contradiction）----
  function _vibrate(level) {
    if (!navigator.vibrate) return;
    try {
      switch (level) {
        case 'light':
          navigator.vibrate(30);
          break;
        case 'medium':
          navigator.vibrate([80, 40, 80]);
          break;
        case 'strong':
          navigator.vibrate([150, 60, 120, 60, 150]);
          break;
        case 'victory':
          // 胜利节奏：短-短-长-短-长（类似庆祝感）
          navigator.vibrate([100, 80, 100, 80, 200, 100, 300]);
          break;
        case 'slam':
          // 砸入：一下重击
          navigator.vibrate([120, 30, 80]);
          break;
        case 'insight':
          // 灵光一闪：细碎的灵感节奏
          navigator.vibrate([10, 8, 10, 8, 15, 10, 30]);
          break;
        case 'objection':
          // 异议！：爆发式振动
          navigator.vibrate([30, 20, 50, 30, 80]);
          break;
        case 'contradiction':
          // 发现矛盾：有力的双震
          navigator.vibrate([60, 20, 60]);
          break;
        default:
          navigator.vibrate(50);
      }
    } catch(e) {}
  }

  // ---- 初始化UI ----
  function init() {
    if (bubbleEl) return;

    document.addEventListener('click', _unlockAudio, true);
    document.addEventListener('touchstart', _unlockAudio, true);
    document.addEventListener('keydown', _unlockAudio, true);

    _isMobile = window.innerWidth < 640 || ('ontouchstart' in window && window.innerWidth < 768);
    const isMobile = _isMobile;
    const vh = window.innerHeight;

    // 手机端打字速度稍慢，更易阅读
    if (_isMobile) _typingSpeed = 52;

    // 底部UI区域估算（数字键盘+工具栏）
    const bottomUI = isMobile ? 220 : 170;
    // 手机端立绘稍小，给对话气泡腾出空间
    const pHeightRatio = isMobile ? 0.30 : 0.52;
    const pHeight = Math.min(Math.floor(vh * pHeightRatio), vh - bottomUI);
    const pWidth = Math.floor(pHeight * 0.72);
    const pRight = isMobile ? 5 : 30;
    const pBottom = bottomUI - 30;
    const bubbleMaxW = isMobile
      ? 'calc(100vw - 30px)'
      : 'min(540px, calc(100vw - ' + (pWidth + 80) + 'px))';
    const bubbleBottom = isMobile ? '100px' : (bottomUI + 20) + 'px';
    const bubbleLeft = isMobile ? '50%' : '30px';
    const bubbleTransform = isMobile ? 'translateX(-50%) translateY(20px)' : 'translateY(20px)';

    // === 对话气泡 ===
    bubbleEl = document.createElement('div');
    bubbleEl.id = 'dialogue-bubble';
    bubbleEl.style.cssText = `
      position: fixed; bottom: ${bubbleBottom}; left: ${bubbleLeft}; transform: ${bubbleTransform};
      max-width: ${bubbleMaxW}; min-width: 200px;
      padding: 14px 20px 12px;
      background: linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(20,30,50,0.92) 100%);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border: 2px solid rgba(255,215,0,0.3);
      border-radius: 6px;
      color: #f1f5f9; font-size: 15px; line-height: 1.8;
      opacity: 0; transition: opacity 0.2s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
      z-index: 10000; pointer-events: auto; cursor: pointer;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1);
      font-family: "Microsoft YaHei","PingFang SC",sans-serif;
    `;
    bubbleEl.innerHTML = `
      <div id="dlg-name" style="font-size:13px;font-weight:900;letter-spacing:1px;margin-bottom:4px;text-shadow:0 0 8px currentColor;"></div>
      <div id="dlg-text" style="font-size:16px;font-weight:500;min-height:1.6em;"></div>
      <div id="dlg-indicator" style="text-align:right;font-size:10px;color:#fbbf24;margin-top:6px;opacity:0;animation:blink 0.8s infinite;">▼ 点击继续</div>
      <style>
        @keyframes blink { 0%,100%{opacity:0.4;} 50%{opacity:1;} }
        @keyframes dlg-shake {
          0%,100%{transform:translateX(0);}
          20%{transform:translateX(-3px);}
          40%{transform:translateX(3px);}
          60%{transform:translateX(-2px);}
          80%{transform:translateX(2px);}
        }
        .dlg-shake { animation: dlg-shake 0.3s ease; }
      </style>
    `;
    bubbleEl.addEventListener('click', (e) => {
      // 如果气泡不可见，不拦截点击
      if (bubbleEl.style.opacity === '0') return;
      e.stopPropagation();
      // 环境台词模式：点击补全文字或关闭
      if (_isAmbientPlaying) {
        if (_ambientTypeTimer) {
          clearTimeout(_ambientTypeTimer);
          _ambientTypeTimer = null;
          const textEl = document.getElementById('dlg-text');
          if (textEl && _ambientCurrentText) textEl.textContent = _ambientCurrentText;
          _startAmbientAutoHide(Math.max(2000, (_ambientCurrentText || '').length * 150));
        } else {
          _hideAmbient();
        }
        return;
      }
      // 如果正在打字，点击则立刻显示全部文字
      if (_typewriterTimer) {
        _completeTypewriter();
      } else {
        nextDialogue();
      }
    });
    document.body.appendChild(bubbleEl);

    // === 立绘容器（逆转裁判风格：从右侧"砸入"）===
    portraitEl = document.createElement('div');
    portraitEl.id = 'story-portrait';
    portraitEl.style.cssText = `
      position: fixed; right: ${pRight}px; bottom: ${pBottom}px;
      width: ${pWidth}px; height: ${pHeight}px;
      background-size: contain; background-repeat: no-repeat;
      background-position: bottom right;
      opacity: 0;
      transform: translateX(150px) scale(1.1) rotate(-3deg);
      transition: opacity 0.01s, transform 0s;
      z-index: 9999; pointer-events: none;
      filter: drop-shadow(0 12px 32px rgba(0,0,0,0.7));
    `;
    document.body.appendChild(portraitEl);

    // 注入立绘砸入/退出动画的CSS
    const style = document.createElement('style');
    style.textContent = `
      @keyframes portrait-slam {
        0% { opacity: 0; transform: translateX(200px) scale(1.3) rotate(-8deg); }
        40% { opacity: 1; transform: translateX(-25px) scale(0.95) rotate(2deg); }
        60% { transform: translateX(10px) scale(1.03) rotate(-1deg); }
        80% { transform: translateX(-5px) scale(0.99) rotate(0.5deg); }
        100% { opacity: 1; transform: translateX(0) scale(1) rotate(0deg); }
      }
      @keyframes portrait-exit {
        0% { opacity: 1; transform: translateX(0) scale(1); }
        100% { opacity: 0; transform: translateX(200px) scale(0.8) rotate(-5deg); }
      }
      @keyframes objection-pop {
        0% { opacity: 0; transform: scale(3) rotate(-15deg); }
        30% { opacity: 1; transform: scale(0.9) rotate(5deg); }
        50% { transform: scale(1.15) rotate(-2deg); }
        70% { transform: scale(0.98) rotate(1deg); }
        100% { opacity: 1; transform: scale(1) rotate(0deg); }
      }
      @keyframes objection-sustain {
        0%,100% { transform: scale(1); }
        50% { transform: scale(1.03); }
      }
      @keyframes text-pop {
        0% { transform: scale(0.5); opacity: 0; }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes title-card-in {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); letter-spacing: 30px; }
        60% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); letter-spacing: 8px; }
        100% { opacity: 1; transform: translate(-50%, -50%) scale(1); letter-spacing: 12px; }
      }
      @keyframes title-card-sub-in {
        0% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes title-card-out {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
      @keyframes narrator-fade {
        0% { opacity: 0; transform: translate(-50%, -45%); }
        100% { opacity: 1; transform: translate(-50%, -50%); }
      }
      .portrait-slamming {
        animation: portrait-slam 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;
      }
      .portrait-exiting {
        animation: portrait-exit 0.35s ease-in forwards;
      }
      .objection-show {
        animation: objection-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards,
                   objection-sustain 0.8s ease-in-out 0.5s infinite;
      }
      .title-card-show {
        animation: title-card-in 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards;
      }
      .title-card-sub-show {
        animation: title-card-sub-in 0.5s ease-out 0.5s forwards;
        opacity: 0;
      }
      .narrator-show {
        animation: narrator-fade 0.6s ease-out forwards;
      }
      /* ---- P0: 立绘抖动动画（震惊/破防）---- */
      @keyframes portrait-shake {
        0%,100% { transform: translateX(0) scale(var(--pzoom, 1)) rotate(0deg); }
        15% { transform: translateX(-6px) scale(var(--pzoom, 1)) rotate(-1deg); }
        30% { transform: translateX(5px) scale(var(--pzoom, 1)) rotate(1deg); }
        45% { transform: translateX(-4px) scale(var(--pzoom, 1)) rotate(-0.5deg); }
        60% { transform: translateX(3px) scale(var(--pzoom, 1)) rotate(0.5deg); }
        75% { transform: translateX(-2px) scale(var(--pzoom, 1)) rotate(0deg); }
        90% { transform: translateX(1px) scale(var(--pzoom, 1)) rotate(0deg); }
      }
      .portrait-shaking {
        animation: portrait-shake 0.4s ease-in-out;
      }
      /* ---- P0: 立绘缩放过渡 ---- */
      .portrait-zoom-transition {
        transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease !important;
      }
    `;
    document.head.appendChild(style);

    // === 半透明遮罩（让游戏画面变暗，聚焦对话）===
    overlayEl = document.createElement('div');
    overlayEl.id = 'dialogue-overlay';
    overlayEl.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.75); z-index: 9998;
      opacity: 0; transition: opacity 0.4s ease; pointer-events: none;
    `;
    overlayEl.addEventListener('click', nextDialogue);
    document.body.appendChild(overlayEl);

    // === 章节标题卡 ===
    titleCardEl = document.createElement('div');
    titleCardEl.id = 'story-title-card';
    titleCardEl.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      text-align: center; z-index: 10003; pointer-events: none;
      opacity: 0;
    `;
    titleCardEl.innerHTML = `
      <div id="tc-title" style="font-size:48px;font-weight:900;color:#fbbf24;text-shadow:0 0 30px rgba(251,191,36,0.5),3px 3px 0 #78350f;font-family:'Impact','SimHei','Microsoft YaHei',sans-serif;letter-spacing:12px;-webkit-text-stroke:1px #000;"></div>
      <div id="tc-subtitle" style="font-size:20px;color:#e2e8f0;margin-top:16px;text-shadow:0 2px 8px rgba(0,0,0,0.8);letter-spacing:4px;opacity:0;"></div>
    `;
    document.body.appendChild(titleCardEl);

    // === "异议！"破局指示器 ===
    objectionEl = document.createElement('div');
    objectionEl.id = 'objection-indicator';
    objectionEl.style.cssText = `
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%) scale(3) rotate(-15deg);
      font-size: 80px; font-weight: 900; color: #fff;
      text-shadow:
        0 0 20px #ef4444, 0 0 40px #ef4444,
        3px 3px 0 #7f1d1d, -3px -3px 0 #7f1d1d,
        3px -3px 0 #7f1d1d, -3px 3px 0 #7f1d1d,
        0 0 80px rgba(239,68,68,0.8);
      z-index: 10002; pointer-events: none;
      opacity: 0; font-family: "Impact","SimHei","Microsoft YaHei",sans-serif;
      letter-spacing: 8px; -webkit-text-stroke: 2px #000;
    `;
    objectionEl.textContent = '异议！';
    document.body.appendChild(objectionEl);

    // === 响应式适配 ===
    window.addEventListener('resize', () => {
      const mob = window.innerWidth < 640 || ('ontouchstart' in window && window.innerWidth < 768);
      const vh2 = window.innerHeight;
      const btUI = mob ? 220 : 170;
      const h = Math.min(Math.floor(vh2 * (mob ? 0.38 : 0.58)), vh2 - btUI);
      const w = Math.floor(h * 0.72);
      portraitEl.style.width = w + 'px';
      portraitEl.style.height = h + 'px';
      portraitEl.style.right = (mob ? -5 : 10) + 'px';
      portraitEl.style.bottom = (btUI - 20) + 'px';
      const bw = mob ? 'calc(100vw - 30px)' : 'min(540px, calc(100vw - ' + (w + 80) + 'px))';
      bubbleEl.style.maxWidth = bw;
      bubbleEl.style.left = mob ? '50%' : '30px';
      bubbleEl.style.bottom = mob ? '100px' : (btUI + 20) + 'px';
    });
  }

  // ---- 预加载立绘 ----
  function preloadPortrait(charId, emotion) {
    const char = CHARACTERS[charId];
    if (!char || !char.portraits) return;
    const file = char.portraits[emotion] || char.portraits.default;
    if (!file) return;
    const img = new Image();
    img.src = `assets/images/portraits/${file.replace(/\.(png|jpg)$/, '')}.png`;
  }

  // ---- 显示立绘（带砸入动画）----
  // zoom: 'far' | 'normal' | 'close' | number（可选，默认保持当前缩放）
  function showPortrait(charId, emotion, isEnter = false, zoom) {
    init();
    const char = CHARACTERS[charId];
    if (!char || !char.portraits || Object.keys(char.portraits).length === 0) {
      hidePortrait();
      return;
    }

    const file = char.portraits[emotion] || char.portraits.default;
    if (!file) { hidePortrait(); return; }

    const src = `assets/images/portraits/${file.replace(/\.(png|jpg)$/, '')}.png`;
    const sameChar = currentPortrait && currentPortrait.charId === charId;
    const sameEmotion = sameChar && currentPortrait.emotion === emotion;
    if (sameEmotion && zoom === undefined) return;

    // 处理 zoom 参数
    if (zoom !== undefined) {
      if (typeof zoom === 'number') {
        _portraitZoom = zoom;
      } else if (PORTRAIT_ZOOM_LEVELS[zoom] !== undefined) {
        _portraitZoom = PORTRAIT_ZOOM_LEVELS[zoom];
      }
    }
    portraitEl.style.setProperty('--pzoom', _portraitZoom);

    // 根据情绪设置滤镜
    let filter = 'drop-shadow(0 12px 32px rgba(0,0,0,0.7))';
    const e = emotion || 'default';
    // 秘术形态：紫色色调+发光
    if (charId === 'setterSecret') filter += ' hue-rotate(270deg) saturate(1.5) brightness(0.9) contrast(1.3) drop-shadow(0 0 20px rgba(147,51,234,0.6))';
    // 残影形态：暗紫色半透明
    if (charId === 'plotterShadow') filter += ' brightness(0.4) contrast(1.4) saturate(0.3) drop-shadow(0 0 15px rgba(139,92,246,0.5))';
    if (e === 'angry') filter += ' saturate(1.4) brightness(0.9) contrast(1.15)';
    else if (e === 'smile') filter += ' brightness(1.06) saturate(1.15)';
    else if (e === 'sad' || e === 'lose') filter += ' saturate(0.5) brightness(0.8) contrast(0.9)';
    else if (e === 'surprised') filter += ' brightness(1.18) saturate(1.15) contrast(1.1)';
    else if (e === 'serious' || e === 'stern') filter += ' brightness(0.88) saturate(0.85) contrast(1.1)';
    else if (e === 'think') filter += ' brightness(0.95) saturate(0.8) contrast(1.05)';
    else if (e === 'confident' || e === 'smirk') filter += ' brightness(1.08) saturate(1.2) contrast(1.15)';
    else if (e.startsWith('shadow_')) filter += ' opacity(0.75) hue-rotate(20deg) saturate(1.6) brightness(0.7)';

    portraitEl.style.filter = filter;
    portraitEl.style.backgroundImage = `url('${src}')`;

    if (!sameChar || isEnter) {
      portraitEl.classList.remove('portrait-exiting');
      portraitEl.classList.remove('portrait-slamming');
      portraitEl.classList.remove('portrait-shaking');
      portraitEl.classList.remove('portrait-zoom-transition');
      void portraitEl.offsetWidth;
      portraitEl.classList.add('portrait-slamming');
      portraitEl.style.opacity = '1';
      if (isEnter) {
        _sfx('playPortraitSlam');
        if (typeof Effects !== 'undefined') {
          Effects.shake(8, 300);
          Effects.flash('#ffffff', 150, 0.15);
        }
      } else {
        _sfx('playPortraitSlam');
        if (typeof Effects !== 'undefined') Effects.shake(4, 150);
      }
      _isBossEnter = false;
      // 砸入动画结束后，应用当前缩放
      setTimeout(() => {
        if (portraitEl && currentPortrait && currentPortrait.charId === charId) {
          portraitEl.classList.remove('portrait-slamming');
          _applyPortraitTransform();
        }
      }, 500);
    } else {
      portraitEl.classList.remove('portrait-slamming');
      portraitEl.classList.remove('portrait-exiting');
      portraitEl.classList.remove('portrait-shaking');
      portraitEl.style.opacity = '1';
      portraitEl.style.transform = `translateX(0) scale(${_portraitZoom}) rotate(0deg)`;
      portraitEl.style.transition = 'none';
      _sfx('playEmotionSnap');
      if (typeof Effects !== 'undefined') Effects.shake(2, 80);
      bubbleEl.classList.remove('dlg-shake');
      void bubbleEl.offsetWidth;
      bubbleEl.classList.add('dlg-shake');
      setTimeout(() => bubbleEl.classList.remove('dlg-shake'), 300);
    }

    setTimeout(() => _emotionSfx(e), sameChar ? 0 : 150);
    currentPortrait = { charId, emotion };
  }

  // ---- 隐藏立绘 ----
  function hidePortrait() {
    init();
    if (!currentPortrait) return;
    portraitEl.classList.remove('portrait-slamming');
    portraitEl.classList.remove('portrait-shaking');
    portraitEl.classList.remove('portrait-zoom-transition');
    portraitEl.classList.add('portrait-exiting');
    if (_portraitShakeTimer) { clearTimeout(_portraitShakeTimer); _portraitShakeTimer = null; }
    setTimeout(() => {
      portraitEl.classList.remove('portrait-exiting');
      portraitEl.style.opacity = '0';
      portraitEl.style.backgroundImage = '';
      // 重置缩放状态
      _portraitZoom = 1.0;
      portraitEl.style.setProperty('--pzoom', 1.0);
    }, 350);
    currentPortrait = null;
  }

  // ---- 切换表情 ----
  function setEmotion(emotion) {
    if (!currentPortrait) return;
    showPortrait(currentPortrait.charId, emotion);
  }

  // ---- 应用立绘当前缩放（内部工具：把 _portraitZoom 写入 inline transform）----
  function _applyPortraitTransform() {
    if (!portraitEl) return;
    const z = _portraitZoom;
    portraitEl.style.setProperty('--pzoom', z);
    // 只有当立绘没有在播放 slam/exit 动画时才设置 inline transform
    if (!portraitEl.classList.contains('portrait-slamming') &&
        !portraitEl.classList.contains('portrait-exiting') &&
        !portraitEl.classList.contains('portrait-shaking')) {
      portraitEl.style.transform = `translateX(0) scale(${z}) rotate(0deg)`;
    }
  }

  // ---- 立绘缩放（zoom: 'far' | 'normal' | 'close' 或数字，duration: 过渡时间 ms）----
  function zoomPortrait(zoom, duration) {
    if (!portraitEl || !currentPortrait) return;
    let scale;
    if (typeof zoom === 'number') {
      scale = zoom;
    } else {
      scale = PORTRAIT_ZOOM_LEVELS[zoom] !== undefined ? PORTRAIT_ZOOM_LEVELS[zoom] : 1.0;
    }
    _portraitZoom = scale;
    const dur = (duration !== undefined && duration !== null) ? duration : 300;

    // 如果正在播放 slam/exit/shake 动画，只更新状态值，等动画结束后再应用
    if (portraitEl.classList.contains('portrait-slamming') ||
        portraitEl.classList.contains('portrait-exiting') ||
        portraitEl.classList.contains('portrait-shaking')) {
      portraitEl.style.setProperty('--pzoom', scale);
      return;
    }

    // 添加过渡类
    portraitEl.classList.add('portrait-zoom-transition');
    portraitEl.style.setProperty('--pzoom', scale);
    portraitEl.style.transform = `translateX(0) scale(${scale}) rotate(0deg)`;

    // 过渡结束后移除过渡类（避免和 slam 等动画冲突）
    setTimeout(() => {
      if (portraitEl) portraitEl.classList.remove('portrait-zoom-transition');
    }, dur + 20);
  }

  // ---- 预设：立绘推近（震惊/特写）----
  function zoomIn(duration) {
    zoomPortrait('close', duration);
  }

  // ---- 预设：立绘拉远（释然/消散）----
  function zoomOut(duration) {
    zoomPortrait('far', duration);
  }

  // ---- 预设：立绘抖动（震惊/破防）----
  function shake() {
    if (!portraitEl || !currentPortrait) return;
    // 如果正在播放 slam/exit 动画，跳过抖动（避免动画冲突）
    if (portraitEl.classList.contains('portrait-slamming') ||
        portraitEl.classList.contains('portrait-exiting')) return;
    if (_portraitShakeTimer) {
      clearTimeout(_portraitShakeTimer);
      _portraitShakeTimer = null;
    }
    portraitEl.classList.remove('portrait-shaking');
    portraitEl.classList.remove('portrait-zoom-transition');
    portraitEl.style.setProperty('--pzoom', _portraitZoom);
    void portraitEl.offsetWidth;
    portraitEl.classList.add('portrait-shaking');
    _portraitShakeTimer = setTimeout(() => {
      if (portraitEl) portraitEl.classList.remove('portrait-shaking');
      _portraitShakeTimer = null;
      // 抖动结束后恢复当前缩放的 transform
      _applyPortraitTransform();
    }, 400);
  }

  // ---- 预设：恢复立绘正常缩放 ----
  function resetZoom(duration) {
    zoomPortrait('normal', duration);
  }

  // ---- 根据情绪自动触发立绘演出（P0 剧情张力增强）----
  function _triggerPortraitEmotion(emotion) {
    if (!currentPortrait || !portraitEl) return;
    const e = (emotion || 'default').toLowerCase();
    // 判断是否正在播放 slam 动画（新角色登场）
    const isSlamming = portraitEl.classList.contains('portrait-slamming');

    switch (e) {
      case 'surprised':
        // 惊讶：轻微推近 + 短暂抖动
        zoomPortrait('close', 250);
        if (isSlamming) {
          // slam 结束后再抖动
          setTimeout(shake, 520);
        } else {
          setTimeout(shake, 150);
        }
        break;
      case 'angry':
        // 愤怒：推近 + 抖动
        zoomPortrait('close', 200);
        if (isSlamming) {
          setTimeout(shake, 520);
        } else {
          setTimeout(shake, 100);
        }
        break;
      case 'sad':
      case 'lose':
        // 悲伤：拉远
        zoomPortrait('far', 400);
        break;
      case 'confident':
        // 自信（设局人压迫感）：推近
        zoomPortrait('close', 350);
        break;
      case 'serious':
      case 'stern':
        // 严肃：轻微推近
        zoomPortrait(1.05, 300);
        break;
      default:
        // 其他情绪：恢复正常
        if (_portraitZoom !== 1.0) {
          resetZoom(300);
        }
        break;
    }
  }

  // ---- 显示章节标题卡 ----
  function _showTitleCard(title, subtitle, duration) {
    init();
    const tcTitle = document.getElementById('tc-title');
    const tcSub = document.getElementById('tc-subtitle');
    tcTitle.textContent = title || '';
    tcSub.textContent = subtitle || '';

    titleCardEl.classList.remove('title-card-show', 'title-card-sub-show');
    void titleCardEl.offsetWidth;
    titleCardEl.style.opacity = '1';
    tcTitle.classList.add('title-card-show');
    if (subtitle) {
      tcSub.classList.add('title-card-sub-show');
    }

    overlayEl.style.opacity = '1';
    overlayEl.style.pointerEvents = 'auto';

    const dur = duration || 2500;
    setTimeout(() => {
      titleCardEl.style.opacity = '0';
      tcTitle.classList.remove('title-card-show');
      tcSub.classList.remove('title-card-sub-show');
      setTimeout(() => {
        overlayEl.style.opacity = '0';
        overlayEl.style.pointerEvents = 'none';
        if (isPlaying) nextDialogue();
      }, 400);
    }, dur);
  }

  // ---- 显示旁白文字（居中，无立绘，无对话框边框）----
  function _showNarrator(text) {
    init();
    hidePortrait();
    bubbleEl.style.opacity = '0';
    bubbleEl.style.pointerEvents = 'none';

    // 创建旁白元素（如果不存在）
    let narrEl = document.getElementById('narrator-text');
    if (!narrEl) {
      narrEl = document.createElement('div');
      narrEl.id = 'narrator-text';
      narrEl.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        max-width: 600px; padding: 20px 30px;
        text-align: center; font-size: 18px; line-height: 2;
        color: rgba(255,255,255,0.9); font-style: italic;
        text-shadow: 0 2px 12px rgba(0,0,0,0.8);
        z-index: 10001; pointer-events: auto; cursor: pointer;
        font-family: "Microsoft YaHei","PingFang SC",serif;
      `;
      narrEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_typewriterTimer) {
          _completeTypewriter();
        } else {
          nextDialogue();
        }
      });
      document.body.appendChild(narrEl);
    }

    overlayEl.style.opacity = '1';
    overlayEl.style.pointerEvents = 'auto';

    narrEl.style.opacity = '0';
    narrEl.style.pointerEvents = 'auto';
    narrEl.classList.remove('narrator-show');
    void narrEl.offsetWidth;
    narrEl.classList.add('narrator-show');

    // 打字机效果显示旁白
    _currentText = text;
    const indicator = document.getElementById('dlg-indicator');
    let idx = 0;
    narrEl.textContent = '';

    function typeNarr() {
      if (idx >= text.length) {
        _typewriterTimer = null;
        // 旁白点击继续提示
        const hint = document.createElement('span');
        hint.style.cssText = 'display:block;font-size:10px;color:#fbbf24;margin-top:12px;opacity:0.6;animation:blink 0.8s infinite;font-style:normal;';
        hint.textContent = '▼ 点击继续';
        narrEl.appendChild(hint);
        return;
      }
      const ch = text[idx];
      narrEl.textContent += ch;
      idx++;
      if (ch !== ' ' && ch !== '　' && idx % 3 === 0) {
        _sfx('playTypewriterKey');
      }
      _typewriterTimer = setTimeout(typeNarr, _typingSpeed + (Math.random() * 15 - 7));
    }

    // 保存当前旁白元素引用，供_completeTypewriter使用
    _narratorEl = narrEl;
    typeNarr();
  }

  function _hideNarrator() {
    const narrEl = document.getElementById('narrator-text');
    if (narrEl) {
      narrEl.style.opacity = '0';
      narrEl.style.pointerEvents = 'none';
      narrEl.classList.remove('narrator-show');
    }
  }

  // ---- 播放配音 ----
  function playVoice(voiceId) {
    if (!voiceEnabled) return;
    const dlg = DIALOGUES[voiceId];
    if (!dlg) return;
    // 只有VO_开头的ID有配音文件
    if (!voiceId.startsWith('VO_')) return;

    if (!_audioUnlocked) {
      // 音频未解锁，排队等待用户交互后播放
      _pendingVoiceId = voiceId;
      return;
    }

    const audioPath = `assets/audio/voices/${voiceId}.mp3`;
    if (audioEl) { try { audioEl.pause(); audioEl.src = ''; } catch(e) {} }
    audioEl = new Audio(audioPath);
    audioEl.volume = 0.85;
    audioEl.play().catch((e) => {
      // 播放失败，不影响文字显示
      console.warn('Voice play failed:', voiceId, e);
    });
  }

  // ---- 打字机效果显示文字 ----
  // speed: 每字间隔 ms；burst: 是否启用"前慢后快"爆发节奏
  function _typewrite(charId, text, onComplete, speed, burst) {
    const nameEl = document.getElementById('dlg-name');
    const textEl = document.getElementById('dlg-text');
    const indicator = document.getElementById('dlg-indicator');
    const char = CHARACTERS[charId];
    const charColor = char ? _charColor(charId) : '#94a3b8';

    // 名字立即显示
    nameEl.textContent = char ? char.name : '';
    nameEl.style.color = charColor;

    // 清空文字
    textEl.textContent = '';
    indicator.style.opacity = '0';

    let idx = 0;
    const totalLen = text.length;
    const baseSpeed = (speed !== undefined && speed !== null) ? speed : _typingSpeed;
    // 爆发模式：前4个字用庄重速度（先愣一下），之后切到快速
    const burstThreshold = burst ? 4 : 0;
    const burstSlowSpeed = TYPING_SPEEDS.serene;

    // 检查是否有配音（VO_开头的ID）
    const hasVoice = dialogueQueue.length > 0 && dialogueQueue[0] && dialogueQueue[0].startsWith('VO_');
    // 当前对话的voiceId是dialogueQueue[0]吗？不，已经shift了。
    // 我们需要知道当前正在播放的voiceId
    const currentVid = _currentVoiceId || '';
    const currentHasVoice = currentVid.startsWith('VO_');

    // instant 速度：直接显示全部文字
    if (baseSpeed <= 0) {
      textEl.textContent = text;
      _typewriterTimer = null;
      indicator.style.opacity = '1';
      if (onComplete) onComplete();
      return;
    }

    function type() {
      if (idx >= totalLen) {
        _typewriterTimer = null;
        indicator.style.opacity = '1';
        if (onComplete) onComplete();
        return;
      }
      const ch = text[idx];
      textEl.textContent += ch;
      idx++;
      // 打字音效：有配音时每5字播放一次避免干扰语音，无配音时每2字播放一次
      const _twInterval = currentHasVoice ? 5 : 2;
      if (ch !== ' ' && ch !== '　' && idx % _twInterval === 0) {
        _sfx('playTypewriterKey');
      }
      // 爆发模式：前几个字稍慢，模拟"先愣一下然后爆发"
      let delay = baseSpeed + (Math.random() * 20 - 10);
      if (burst && idx <= burstThreshold && idx > 0) {
        delay = burstSlowSpeed + (Math.random() * 15 - 7);
      }
      _typewriterTimer = setTimeout(type, delay);
    }
    type();
  }

  function _completeTypewriter() {
    if (!_typewriterTimer) return;
    clearTimeout(_typewriterTimer);
    _typewriterTimer = null;

    // 检查是否是旁白模式
    if (_narratorEl && _narratorEl.style.opacity !== '0') {
      _narratorEl.textContent = _currentText;
      const hint = document.createElement('span');
      hint.style.cssText = 'display:block;font-size:10px;color:#fbbf24;margin-top:12px;opacity:0.6;animation:blink 0.8s infinite;font-style:normal;';
      hint.textContent = '▼ 点击继续';
      _narratorEl.appendChild(hint);
      return;
    }

    const textEl = document.getElementById('dlg-text');
    const indicator = document.getElementById('dlg-indicator');
    if (_currentText && textEl) textEl.textContent = _currentText;
    if (indicator) indicator.style.opacity = '1';
  }

  let _currentText = '';
  let _currentVoiceId = '';
  let _narratorEl = null;

  // ---- 显示对话气泡 ----
  // speed: 打字机速度（ms/字），不传则用默认速度；burst: 是否启用前慢后快爆发节奏
  function showBubble(charId, text, speed, burst) {
    init();
    _currentText = text;
    // 隐藏旁白
    _hideNarrator();

    const isMobile = window.innerWidth < 640 || ('ontouchstart' in window);
    bubbleEl.style.opacity = '1';
    bubbleEl.style.pointerEvents = 'auto';
    bubbleEl.style.transform = isMobile ? 'translateX(-50%) translateY(0)' : 'translateY(0)';
    overlayEl.style.opacity = '1';
    overlayEl.style.pointerEvents = 'auto';
    _sfx('playBubblePop');
    _typewrite(charId, text, null, speed, burst);
  }

  // ---- 隐藏对话气泡 ----
  function hideBubble() {
    init();
    if (_typewriterTimer) { clearTimeout(_typewriterTimer); _typewriterTimer = null; }
    if (bubbleEl) {
      bubbleEl.style.opacity = '0';
      bubbleEl.style.pointerEvents = 'none';
      const isMobile = window.innerWidth < 640 || ('ontouchstart' in window);
      bubbleEl.style.transform = isMobile ? 'translateX(-50%) translateY(20px)' : 'translateY(20px)';
    }
    _hideNarrator();
    if (overlayEl) {
      overlayEl.style.opacity = '0';
      overlayEl.style.pointerEvents = 'none';
    }
  }

  function _charColor(charId) {
    const colors = {
      cagekeeper: '#4ade80',
      ray: '#fbbf24',
      plotter: '#f87171',
      weaver: '#22d3ee',
      remnant: '#34d399',
      system: '#60a5fa'
    };
    return colors[charId] || '#94a3b8';
  }

  // ---- 播放场景 ----
  function playScene(sceneId, callback) {
    const voiceIds = SCENE_TRIGGERS[sceneId];
    if (!voiceIds || voiceIds.length === 0) {
      console.warn('StoryEngine: Scene not found:', sceneId);
      if (callback) callback();
      return;
    }
    playDialogues(voiceIds, callback);
  }

  // ---- 播放对话序列 ----
  function playDialogues(voiceIds, callback) {
    // 开始主线剧情时，隐藏环境台词
    _hideAmbient();
    dialogueQueue = [...voiceIds];
    onCompleteCallback = callback;
    isPlaying = true;
    _playNext();
  }

  function _playNext() {
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_typewriterTimer) { clearTimeout(_typewriterTimer); _typewriterTimer = null; }
    if (dialogueQueue.length === 0) {
      _endScene();
      return;
    }

    const voiceId = dialogueQueue.shift();
    _currentVoiceId = voiceId;
    const dlg = DIALOGUES[voiceId];
    if (!dlg) { _playNext(); return; }

    // 处理标题卡（自动播放，不需要点击）
    if (dlg.isTitle) {
      _showTitleCard(dlg.text, dlg.subtitle);
      return;
    }

    // 处理旁白（需要点击继续）
    if (dlg.char === 'narrator' || (dlg.char === null && !dlg.portrait && dlg.text && !dlg.isTitle)) {
      _showNarrator(dlg.text);
      playVoice(voiceId);
      return;
    }

    // 显示立绘
    if (dlg.char && dlg.portrait) {
      showPortrait(dlg.char, dlg.portrait);
      // P0: 根据情绪自动触发立绘演出动画
      _triggerPortraitEmotion(dlg.portrait);
    } else if (!dlg.char) {
      hidePortrait();
    }

    // 触发特效
    if (dlg.effect > 0 && typeof Effects !== 'undefined') {
      Effects.triggerLevel(dlg.effect, { portrait: dlg.char || null });
    }

    // P0: 根据情绪计算打字机速度
    const typingSpeed = dlg.portrait ? _emotionTypingSpeed(dlg.portrait) : _typingSpeed;
    const isBurst = _isBurstEmotion(dlg.portrait);

    // 显示文字（打字机）
    showBubble(dlg.char, dlg.text, typingSpeed, isBurst);

    // 播放配音
    playVoice(voiceId);
  }

  // ---- 下一句 ----
  function nextDialogue() {
    if (!isPlaying) return;
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (audioEl) { try { audioEl.pause(); audioEl.src = ''; } catch(e) {} }
    _pendingVoiceId = null;
    // 如果正在打字，先补全文字
    if (_typewriterTimer) {
      _completeTypewriter();
      return; // 补全后等待再次点击
    }
    if (dialogueQueue.length > 0) {
      _playNext();
    } else {
      _endScene();
    }
  }

  function _endScene() {
    isPlaying = false;
    _currentVoiceId = '';
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_typewriterTimer) { clearTimeout(_typewriterTimer); _typewriterTimer = null; }
    hideBubble();
    _hideNarrator();
    setTimeout(() => hidePortrait(), 200);
    if (onCompleteCallback) {
      const cb = onCompleteCallback;
      onCompleteCallback = null;
      cb();
    }
  }

  // ---- 中断 ----
  function interrupt() {
    dialogueQueue = [];
    isPlaying = false;
    _currentVoiceId = '';
    _pendingVoiceId = null;
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_typewriterTimer) { clearTimeout(_typewriterTimer); _typewriterTimer = null; }
    if (audioEl) { try { audioEl.pause(); audioEl.src = ''; } catch(e) {} }
    hideObjection();
    _hideAmbient();
    hideBubble();
    _hideNarrator();
    hidePortrait();
    onCompleteCallback = null;
  }

  // ---- 单行台词 ----
  function say(charId, emotion, text, effectLevel, callback) {
    const fakeId = '_say_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    DIALOGUES[fakeId] = { char: charId, portrait: emotion, text: text, effect: effectLevel || 0 };
    playDialogues([fakeId], callback);
  }

  // ---- 环境台词（非阻塞，用于comedy/游戏中角色吐槽）----
  // 特性：显示立绘+底部气泡+打字机效果，但不显示暗色遮罩、不阻塞游戏操作、自动消失
  let _ambientTimer = null;
  let _ambientAutoHideTimer = null;
  let _ambientTypeTimer = null;
  let _ambientCurrentText = '';
  let _isAmbientPlaying = false;

  function sayAmbient(charId, emotion, text, displayMs) {
    init();
    // 如果正在播放主线剧情，不要打断
    if (isPlaying) return;

    // 清除之前的环境台词
    _hideAmbient();

    _isAmbientPlaying = true;

    // 显示立绘（不带砸入动画，轻柔出现）
    if (charId && CHARACTERS[charId] && CHARACTERS[charId].portraits) {
      const char = CHARACTERS[charId];
      const emo = emotion || 'default';
      const file = char.portraits[emo] || char.portraits.default;
      if (file) {
        const src = `assets/images/portraits/${file.replace(/\.(png|jpg)$/, '')}.png`;
        portraitEl.style.backgroundImage = `url('${src}')`;
        let filter = 'drop-shadow(0 12px 32px rgba(0,0,0,0.7))';
        if (charId === 'setterSecret') filter += ' hue-rotate(270deg) saturate(1.5) brightness(0.9) contrast(1.3) drop-shadow(0 0 20px rgba(147,51,234,0.6))';
        if (charId === 'plotterShadow') filter += ' brightness(0.4) contrast(1.4) saturate(0.3) drop-shadow(0 0 15px rgba(139,92,246,0.5))';
        if (emo === 'smile') filter += ' brightness(1.06) saturate(1.15)';
        else if (emo === 'angry') filter += ' saturate(1.4) brightness(0.9) contrast(1.15)';
        else if (emo === 'surprised') filter += ' brightness(1.18) saturate(1.15) contrast(1.1)';
        else if (emo === 'sad' || emo === 'lose') filter += ' saturate(0.5) brightness(0.8) contrast(0.9)';
        portraitEl.style.filter = filter;
        portraitEl.style.opacity = '1';
        portraitEl.style.transform = 'translateX(0) scale(1) rotate(0deg)';
        portraitEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        currentPortrait = { charId, emotion: emo };
      }
    } else {
      hidePortrait();
    }

    // 显示对话气泡（不显示遮罩，不阻塞点击）
    const isMobile = window.innerWidth < 640 || ('ontouchstart' in window);
    bubbleEl.style.opacity = '1';
    bubbleEl.style.pointerEvents = 'auto';
    bubbleEl.style.transform = isMobile ? 'translateX(-50%) translateY(0)' : 'translateY(0)';
    // 遮罩不显示（保持透明、不拦截点击）
    overlayEl.style.opacity = '0';
    overlayEl.style.pointerEvents = 'none';

    _sfx('playBubblePop');

    // 设置名字和打字机文字
    const nameEl = document.getElementById('dlg-name');
    const textEl = document.getElementById('dlg-text');
    const indicator = document.getElementById('dlg-indicator');
    const char = CHARACTERS[charId];
    const charColor = char ? _charColor(charId) : '#94a3b8';
    nameEl.textContent = char ? char.name : '';
    nameEl.style.color = charColor;
    textEl.textContent = '';
    indicator.style.opacity = '0';
    _ambientCurrentText = text;

    // P0: 根据情绪计算打字机速度
    const emo = emotion || 'default';
    const typingSpeed = _emotionTypingSpeed(emo);
    const isBurst = _isBurstEmotion(emo);

    // P0: 根据情绪触发立绘演出
    if (currentPortrait) {
      _triggerPortraitEmotion(emo);
    }

    // 打字机效果
    let idx = 0;
    const speed = typingSpeed;
    // 爆发模式：前4个字稍慢
    const burstThreshold = isBurst ? 4 : 0;
    const burstSlowSpeed = TYPING_SPEEDS.serene;

    // instant 速度直接显示
    if (speed <= 0) {
      textEl.textContent = text;
      _ambientTypeTimer = null;
      indicator.style.opacity = '0';
      const waitMs = displayMs || Math.max(2500, text.length * 180);
      _startAmbientAutoHide(waitMs);
      return;
    }

    function typeAmbient() {
      if (idx >= text.length) {
        _ambientTypeTimer = null;
        indicator.style.opacity = '0';
        // 打字完成后自动倒计时消失
        const waitMs = displayMs || Math.max(2500, text.length * 180);
        _startAmbientAutoHide(waitMs);
        return;
      }
      textEl.textContent += text[idx];
      idx++;
      if (text[idx - 1] !== ' ' && text[idx - 1] !== '　' && idx % 3 === 0) {
        _sfx('playTypewriterKey');
      }
      // 爆发模式：前几个字稍慢
      let delay = speed + (Math.random() * 15 - 7);
      if (isBurst && idx <= burstThreshold && idx > 0) {
        delay = burstSlowSpeed + (Math.random() * 10 - 5);
      }
      _ambientTypeTimer = setTimeout(typeAmbient, delay);
    }
    typeAmbient();
  }

  function _startAmbientAutoHide(waitMs) {
    if (_ambientAutoHideTimer) clearTimeout(_ambientAutoHideTimer);
    _ambientAutoHideTimer = setTimeout(() => {
      _hideAmbient();
    }, waitMs);
  }

  function _hideAmbient() {
    if (!_isAmbientPlaying) return;
    _isAmbientPlaying = false;
    if (_ambientTypeTimer) { clearTimeout(_ambientTypeTimer); _ambientTypeTimer = null; }
    if (_ambientAutoHideTimer) { clearTimeout(_ambientAutoHideTimer); _ambientAutoHideTimer = null; }
    // 隐藏气泡（淡出）
    if (bubbleEl) {
      bubbleEl.style.opacity = '0';
      bubbleEl.style.pointerEvents = 'none';
      const isMobile = window.innerWidth < 640 || ('ontouchstart' in window);
      bubbleEl.style.transform = isMobile ? 'translateX(-50%) translateY(20px)' : 'translateY(20px)';
    }
    // 延迟隐藏立绘
    setTimeout(() => {
      if (!_isAmbientPlaying && !isPlaying) {
        hidePortrait();
      }
    }, 300);
  }

  // 播放多行对话（用于clearDialog/preDialog等动态对话）
  // lines: [{speaker: '守笼人'/'阿岩'/'设局人', text: '...'}]
  function sayLines(lines, callback) {
    const speakerMap = {
      '守笼人': 'cagekeeper',
      '阿岩': 'ray',
      '设局人': 'plotter',
      '设局人残影': 'plotterShadow',
      '设局人（秘术）': 'setterSecret',
      '织网者': 'weaver',
      '星辰梭': 'weaver',
      '残局': 'remnant',
      '残局守护者': 'remnant',
      '旁白': 'narrator',
      '系统': 'system'
    };
    const emotionMap = {
      '守笼人': 'default',
      '阿岩': 'default',
      '设局人': 'default',
      '设局人残影': 'smirk',
      '设局人（秘术）': 'smirk',
      '织网者': 'default',
      '星辰梭': 'default',
      '残局': 'default',
      '残局守护者': 'default',
    };
    const ids = [];
    lines.forEach((line, i) => {
      const charId = speakerMap[line.speaker] || null;
      const emotion = line.emotion || emotionMap[line.speaker] || 'default';
      const fakeId = '_lines_' + Date.now() + '_' + i;
      DIALOGUES[fakeId] = {
        char: charId,
        portrait: charId ? emotion : null,
        text: line.text || '',
        effect: 0
      };
      ids.push(fakeId);
    });
    if (ids.length > 0) {
      playDialogues(ids, callback);
    } else if (callback) {
      callback();
    }
  }

  // ---- Boss登场（砸入+暗角+震动+异议感）----
  function bossEnter(bossId) {
    _isBossEnter = true;
    if (typeof Effects !== 'undefined') {
      Effects.vignette(0.6, 600);
      Effects.shake(12, 500);
    }
    if (typeof AudioManager !== 'undefined' && typeof AudioManager.vibrate === 'function') {
      AudioManager.vibrate('slam');
    } else if (navigator.vibrate) {
      _vibrate('slam');
    }
    _sfx('playPortraitSlam');
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.setPhase('breakthrough');
    } else if (typeof AudioManager !== 'undefined') {
      AudioManager.startBossBGM && AudioManager.startBossBGM();
    }
    const scenes = {
      ray: 'ch1_boss',
      cagekeeper: 'ch2_boss',
      plotterShadow: 'ch3_boss',
      plotter: 'ch6_boss',
      setterSecret: 'ch7_final',
      weaver: 'ch5_boss',
      remnant: 'ch4_boss'
    };
    const scene = scenes[bossId];
    if (scene) {
      setTimeout(() => {
        if (typeof MidiBGM !== 'undefined') MidiBGM.playTheme && MidiBGM.playTheme(bossId);
        playScene(scene);
      }, 700);
    }
  }

  // ---- Boss被击败 ----
  function bossDefeat(bossId, callback) {
    const scenes = {
      ray: 'ray_defeat',
      cagekeeper: 'cagekeeper_defeat',
      plotterShadow: 'shadow_defeat',
      plotter: 'plotter_defeat',
      setterSecret: 'plotter_defeat',
      weaver: 'weaver_defeat',
      remnant: 'remnant_defeat'
    };
    const scene = scenes[bossId];
    if (typeof Effects !== 'undefined') {
      Effects.victoryFlash();
      Effects.vignette(0, 800);
    }
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playWin();
      if (typeof AudioManager.vibrate === 'function') AudioManager.vibrate('victory');
    } else if (navigator.vibrate) {
      _vibrate('victory');
    }
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.setPhase('finishing');
    }
    if (scene) {
      playScene(scene, callback);
    } else {
      playScene('clear_level', callback);
    }
  }

  // ---- 终章通关 ----
  function finalVictory(callback) {
    // 1. 金色闪光+震屏
    if (typeof Effects !== 'undefined') {
      Effects.goldenFlash(1500);
      Effects.shake(8, 800);
      setTimeout(() => Effects.vignette(0, 2000), 500);
    }
    if (typeof AudioManager !== 'undefined' && typeof AudioManager.vibrate === 'function') {
      AudioManager.vibrate('victory');
    } else if (navigator.vibrate) {
      _vibrate('victory');
    }

    // 2. 切换到胜利BGM
    if (typeof AudioManager !== 'undefined') {
      AudioManager.stopBGM && AudioManager.stopBGM();
      AudioManager.stopBossBGM && AudioManager.stopBossBGM();
      setTimeout(() => AudioManager.playWin && AudioManager.playWin(), 300);
    }
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.setPhase('victory');
    }

    // 3. 角色接力演出：设局人认输→传承→守笼人肯定→阿岩欢呼→结局
    const sequence = [
      'setter_defeat',     // 秘术设局人认可
      'setter_transfer',   // 传承星辰梭
      'setter_farewell',   // 设局人告别
      'true_ending'        // 守笼人+阿岩+系统：薪火不息
    ];

    // 延迟800ms后开始播放，等闪光效果
    setTimeout(() => {
      playSceneSequence(sequence, () => {
        // 演出全部结束后，延迟显示"全章节通关"字幕
        setTimeout(() => {
          showEndingCredits();
          if (callback) callback();
        }, 1000);
      });
    }, 1000);
  }

  // ---- 顺序播放多个场景 ----
  function playSceneSequence(scenes, finalCallback) {
    if (!scenes || scenes.length === 0) {
      if (finalCallback) finalCallback();
      return;
    }
    const [first, ...rest] = scenes;
    playScene(first, () => {
      playSceneSequence(rest, finalCallback);
    });
  }

  // ---- 结局字幕 ----
  function showEndingCredits() {
    init();
    // 创建结局覆盖层
    let creditsEl = document.getElementById('ending-credits');
    if (!creditsEl) {
      creditsEl = document.createElement('div');
      creditsEl.id = 'ending-credits';
      creditsEl.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: radial-gradient(ellipse at center, rgba(20,10,40,0.95) 0%, rgba(5,0,15,0.98) 100%);
        z-index: 10000; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        opacity: 0; transition: opacity 1.5s ease; pointer-events: none;
      `;
      creditsEl.innerHTML = `
        <div style="text-align:center; color:#fff; font-family:serif;">
          <div style="font-size:clamp(28px,6vw,56px); font-weight:900;
                      background:linear-gradient(135deg,#fbbf24,#f59e0b,#ef4444,#a855f7);
                      -webkit-background-clip:text; -webkit-text-fill-color:transparent;
                      text-shadow:none; letter-spacing:0.15em; margin-bottom:30px;">
            全章节通关
          </div>
          <div style="font-size:clamp(14px,2.5vw,22px); color:#c4b5fd; letter-spacing:0.3em; margin-bottom:50px;">
            — 档案之道 · 薪火不息 —
          </div>
          <div style="font-size:clamp(12px,2vw,18px); color:#94a3b8; line-height:2; letter-spacing:0.1em;">
            七卷秘术 · 已全部传承<br>
            新的设局人 · 已经诞生
          </div>
          <div style="margin-top:60px; font-size:clamp(11px,1.8vw,15px); color:#6366f1;
                      cursor:pointer; pointer-events:auto; padding:12px 30px;
                      border:1px solid #6366f1; border-radius:8px;"
               id="ending-credits-close">
            返回档案馆
          </div>
        </div>
      `;
      document.body.appendChild(creditsEl);

      const closeBtn = creditsEl.querySelector('#ending-credits-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          creditsEl.style.opacity = '0';
          setTimeout(() => {
            creditsEl.remove();
            // 跳转到章节选择页面
            window.location.href = 'chapters.html';
          }, 1000);
        });
      }
    }
    requestAnimationFrame(() => {
      creditsEl.style.opacity = '1';
    });
  }

  // ---- "异议！"破局指示器 ----
  function showObjection(text) {
    init();
    const txt = text || '异议！';
    objectionEl.textContent = txt;
    objectionEl.classList.remove('objection-show');
    void objectionEl.offsetWidth;
    objectionEl.classList.add('objection-show');
    objectionEl.style.opacity = '1';
    if (typeof Effects !== 'undefined') {
      Effects.shake(15, 500);
      Effects.flash('#ffffff', 300, 0.4);
      Effects.vignette(0.5, 300);
    }
    if (typeof AudioManager !== 'undefined' && typeof AudioManager.vibrate === 'function') {
      AudioManager.vibrate('objection');
    } else if (navigator.vibrate) {
      _vibrate('objection');
    }

    // BGM短暂压低，突出异议音效（逆转裁判式"等一下！"的感觉）
    let originalVolume = null;
    let duckTarget = null;
    if (typeof MidiBGM !== 'undefined' && MidiBGM.volume !== undefined) {
      originalVolume = MidiBGM.volume;
      MidiBGM.setVolume(originalVolume * 0.2);
      duckTarget = 'midi';
    } else if (typeof AudioManager !== 'undefined' && AudioManager.bgmGain && AudioManager.ctx) {
      originalVolume = AudioManager.bgmGain.gain.value;
      AudioManager.bgmGain.gain.setValueAtTime(originalVolume * 0.2, AudioManager.ctx.currentTime);
      duckTarget = 'audio';
    }

    _sfx('playObjection');
    if (typeof MidiBGM !== 'undefined') MidiBGM.setPhase('breakthrough');
    else if (typeof AudioManager !== 'undefined') AudioManager.startBreakthroughBGM && AudioManager.startBreakthroughBGM();

    // 0.8秒后BGM恢复
    setTimeout(() => {
      if (originalVolume !== null) {
        if (duckTarget === 'midi' && typeof MidiBGM !== 'undefined') {
          MidiBGM.setVolume(originalVolume);
        } else if (duckTarget === 'audio' && typeof AudioManager !== 'undefined' && AudioManager.bgmGain && AudioManager.ctx) {
          AudioManager.bgmGain.gain.linearRampToValueAtTime(originalVolume, AudioManager.ctx.currentTime + 0.5);
        }
      }
    }, 800);

    setTimeout(() => hideObjection(), 2000);
  }

  function hideObjection() {
    init();
    if (!objectionEl) return;
    objectionEl.classList.remove('objection-show');
    objectionEl.style.opacity = '0';
  }

  function breakthrough() {
    // 破局时刻：金色闪光 + "破局！"全屏特效
    if (typeof Effects !== 'undefined') {
      Effects.triggerLevel(4, { type: 'flash' });
    }
    _sfx('playInsight');
    if (typeof AudioManager !== 'undefined' && typeof AudioManager.vibrate === 'function') {
      AudioManager.vibrate('insight');
    } else if (navigator.vibrate) {
      _vibrate('insight');
    }
    showObjection('破局！');
  }

  function setVoiceEnabled(enabled) {
    voiceEnabled = enabled;
  }

  function preloadAll() {
    Object.entries(CHARACTERS).forEach(([cid, c]) => {
      if (c.portraits) {
        Object.values(c.portraits).forEach(f => {
          const img = new Image();
          img.src = `assets/images/portraits/${f.replace(/\.(png|jpg)$/, '')}.png`;
        });
      }
    });
  }

  return {
    init,
    playScene,
    playDialogues,
    sayLines,
    sayAmbient,
    nextDialogue,
    interrupt,
    showPortrait,
    hidePortrait,
    hideBubble,
    setEmotion,
    zoomPortrait,
    zoomIn,
    zoomOut,
    shake,
    resetZoom,
    bossEnter,
    bossDefeat,
    finalVictory,
    setVoiceEnabled,
    preloadPortrait,
    preloadAll,
    say,
    showObjection,
    hideObjection,
    breakthrough,
    get isPlaying() { return isPlaying; },
    get audioUnlocked() { return _audioUnlocked; }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoryEngine;
} else {
  window.StoryEngine = StoryEngine;
}
