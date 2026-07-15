// ==========================================
// Story Engine v3 - 逆转裁判级演出系统（主入口）
// ==========================================
// 定位：剧情播放主引擎 · 大立绘演出级
// 降级方案：story/story-modal.js（模态框式轻量剧情）
// 底层模块：story/modules/（ScenePlayer / DialoguePresenter / VoiceManager 等）
// 特性：打字机文字、瞬间表情切换、Boss砸入、情绪音效、异议指示器
// ==========================================

const StoryEngine = (function() {
  // ==========================================
  // 资源路径配置（优先使用 media-config.js，降级到硬编码默认值）
  // ==========================================
  const _DEFAULT_IMG_BASE = 'assets/images/';
  const _DEFAULT_AUDIO_BASE = 'assets/audio/';
  // 从 media-config 获取配音目录（如果可用）
  const _VOICE_DIR = (typeof MEDIA_CONFIG !== 'undefined' && MEDIA_CONFIG.voiceDir) ||
                     (_DEFAULT_AUDIO_BASE + 'voices/');
  // 立绘目录（直接拼接，因为 media-config 的 portraitPath 是按角色+表情查询的）
  const _PORTRAIT_DIR = _DEFAULT_IMG_BASE + 'portraits/';
  let currentPortrait = null;
  let dialogueQueue = [];
  let isPlaying = false;
  let audioEl = null;
  let bubbleEl = null;
  let portraitEl = null;
  let itemEl = null;
  let itemLabelEl = null;
  let itemOverlayEl = null;
  let currentItem = null;
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
  let _portraitToken = 0; // 立绘加载令牌，防止旧请求覆盖新请求
  let _currentRoute = 1; // 当前周目（1/2/3）

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
  let _pendingSfxQueue = [];  // sfx to play after audio unlocks
  let _portraitZoom = 1.0;    // 当前立绘缩放比例（1.0 = normal）
  let _portraitShakeTimer = null;
  let _itemHideTimer = null;
  let _currentBg = null;      // 当前背景图片路径
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
      if (typeof AudioManager !== 'undefined') {
        AudioManager.resume();
      }
      const silent = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQcAQNHWpXYRAPv/0Lc+EA==');
      silent.volume = 0;
      silent.play().catch(() => {});
    } catch(e) {}
    document.removeEventListener('click', _unlockAudio, true);
    document.removeEventListener('touchstart', _unlockAudio, true);
    document.removeEventListener('keydown', _unlockAudio, true);

    // 立即播放待播的环境音效（同步播放，不等待Promise）
    _playPendingSfx();

    // 音频解锁后，如果有等待播放的配音，立即播放
    if (_pendingVoiceId) {
      const vid = _pendingVoiceId;
      _pendingVoiceId = null;
      playVoice(vid);
    }
  }

  // ---- 播放待播的环境音效 ----
  function _playPendingSfx() {
    if (typeof AudioManager === 'undefined') return;
    if (_pendingSfxQueue.length > 0) {
      const queue = _pendingSfxQueue.slice();
      _pendingSfxQueue = [];
      queue.forEach(item => {
        const fn = AudioManager[item.name];
        if (typeof fn === 'function') {
          try { fn.apply(AudioManager, item.args); } catch(e) {}
        }
      });
    }
  }

  // ---- 播放音效（自动尝试解锁音频）----
  function _sfx(name, ...args) {
    console.log('[StoryEngine] _sfx:', name, 'unlocked:', _audioUnlocked, 'AudioManager:', typeof AudioManager !== 'undefined');
    try {
      if (typeof AudioManager === 'undefined') return;
      // 如果音频尚未解锁，加入待播队列
      if (!_audioUnlocked) {
        if (!_pendingSfxQueue) _pendingSfxQueue = [];
        _pendingSfxQueue.push({ name, args });
        return;
      }
      try { AudioManager.resume(); } catch(e) {}
      const fn = AudioManager[name];
      if (typeof fn === 'function') {
        try { fn.apply(AudioManager, args); } catch(e) {}
      } else {
        console.warn('[StoryEngine] SFX method not found:', name);
      }
    } catch(e) {
      // 静默失败，不影响主流程
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

    // 如果 AudioManager 已经初始化且 AudioContext 已经在运行，说明音频已解锁
    // 避免因 init 调用太晚导致错过用户点击而无法解锁音频
    try {
      if (typeof AudioManager !== 'undefined' && AudioManager.ctx && AudioManager.ctx.state === 'running') {
        _audioUnlocked = true;
        console.log('[StoryEngine] Audio already unlocked via AudioManager state');
      }
    } catch(e) {}

    _isMobile = window.innerWidth < 640 || ('ontouchstart' in window && window.innerWidth < 768);
    const isMobile = _isMobile;
    const vh = window.innerHeight;

    // 手机端打字速度稍慢，更易阅读
    if (_isMobile) _typingSpeed = 52;

    // 底部UI区域估算（数字键盘+工具栏）
    const bottomUI = isMobile ? 220 : 170;
    // 手机端立绘稍小，给对话气泡腾出空间
    const pHeightRatio = isMobile ? 0.34 : 0.48;
    const pHeight = Math.min(Math.floor(vh * pHeightRatio), vh - bottomUI);
    const pWidth = Math.floor(pHeight * 0.75);
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

    // === 道具展示容器（从左侧滑入，带光效）===
    itemEl = document.createElement('div');
    itemEl.id = 'story-item';
    itemEl.style.cssText = `
      position: fixed; left: 50%; top: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      width: 320px; height: 320px;
      background-size: contain; background-repeat: no-repeat; background-position: center;
      z-index: 10001; pointer-events: none;
      opacity: 0;
      filter: drop-shadow(0 0 40px rgba(255,215,0,0.3)) drop-shadow(0 8px 24px rgba(0,0,0,0.6));
      transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    document.body.appendChild(itemEl);

    // 道具名称标签
    itemLabelEl = document.createElement('div');
    itemLabelEl.id = 'story-item-label';
    itemLabelEl.style.cssText = `
      position: fixed; left: 50%; top: calc(50% + 170px);
      transform: translateX(-50%);
      padding: 6px 20px;
      background: rgba(0,0,0,0.75);
      color: #fbbf24;
      font-size: 16px;
      font-weight: bold;
      letter-spacing: 2px;
      border: 1px solid rgba(251,191,36,0.4);
      border-radius: 4px;
      z-index: 10002; pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease 0.2s;
      font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
    `;
    document.body.appendChild(itemLabelEl);

    // 道具背景遮罩
    itemOverlayEl = document.createElement('div');
    itemOverlayEl.id = 'story-item-overlay';
    itemOverlayEl.style.cssText = `
      position: fixed; left: 0; top: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.6);
      z-index: 10000; pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(itemOverlayEl);

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
      /* ---- 打击感等级入场动画 ---- */
      /* level 0: 无声切入 - 自然淡入 */
      @keyframes portrait-fade-in {
        0% { opacity: 0; transform: translateX(20px) scale(1); }
        100% { opacity: 1; transform: translateX(0) scale(1); }
      }
      .portrait-fade {
        animation: portrait-fade-in 0.4s ease-out forwards;
      }
      /* level 1: 轻叩 - 轻快滑入 */
      @keyframes portrait-tap-in {
        0% { opacity: 0; transform: translateX(60px) scale(1); }
        70% { opacity: 1; transform: translateX(-5px) scale(1); }
        100% { opacity: 1; transform: translateX(0) scale(1); }
      }
      .portrait-tap {
        animation: portrait-tap-in 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;
      }
      /* level 2: 顿击 - 卡入微震动 */
      @keyframes portrait-strike-in {
        0% { opacity: 0; transform: translateX(100px) scale(1.05) rotate(-2deg); }
        50% { opacity: 1; transform: translateX(-8px) scale(0.98) rotate(1deg); }
        75% { transform: translateX(4px) scale(1.01) rotate(-0.5deg); }
        100% { opacity: 1; transform: translateX(0) scale(1) rotate(0deg); }
      }
      .portrait-strike {
        animation: portrait-strike-in 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards;
      }
      /* level 3: 重砸 - 砸入强回弹 */
      @keyframes portrait-slam {
        0% { opacity: 0; transform: translateX(200px) scale(1.3) rotate(-8deg); }
        40% { opacity: 1; transform: translateX(-25px) scale(0.95) rotate(2deg); }
        60% { transform: translateX(10px) scale(1.03) rotate(-1deg); }
        80% { transform: translateX(-5px) scale(0.99) rotate(0.5deg); }
        100% { opacity: 1; transform: translateX(0) scale(1) rotate(0deg); }
      }
      .portrait-slamming {
        animation: portrait-slam 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;
      }
      /* level 4: 爆裂 - 爆裂登场 */
      @keyframes portrait-burst-in {
        0% { opacity: 0; transform: translateX(300px) scale(1.5) rotate(-12deg); }
        20% { opacity: 1; transform: translateX(-30px) scale(0.9) rotate(5deg); }
        35% { transform: translateX(15px) scale(1.08) rotate(-3deg); }
        50% { transform: translateX(-8px) scale(0.97) rotate(1.5deg); }
        65% { transform: translateX(4px) scale(1.02) rotate(-0.8deg); }
        80% { transform: translateX(-2px) scale(0.99) rotate(0.3deg); }
        100% { opacity: 1; transform: translateX(0) scale(1) rotate(0deg); }
      }
      .portrait-burst {
        animation: portrait-burst-in 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards;
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

  // ---- 立绘路径辅助：优先 PNG（新版透明立绘），失败回退 WebP ----
  function _portraitSrc(file) {
    return _PORTRAIT_DIR + file.replace(/\.(png|jpg|webp)$/, '') + '.png';
  }
  function _portraitFallbackSrc(file) {
    return _PORTRAIT_DIR + file.replace(/\.(png|jpg|webp)$/, '') + '.webp';
  }
  // 用 Image 对象尝试加载 PNG，失败自动切 WebP
  function _loadPortrait(file, onLoad) {
    const pngSrc = _portraitSrc(file);
    const webpSrc = _portraitFallbackSrc(file);
    const img = new Image();
    let done = false;
    img.onload = function() {
      if (done) return;
      done = true;
      onLoad && onLoad(pngSrc);
    };
    img.onerror = function() {
      if (done) return;
      done = true;
      // PNG 加载失败，回退到 WebP
      const webpImg = new Image();
      webpImg.onload = function() { onLoad && onLoad(webpSrc); };
      webpImg.onerror = function() { onLoad && onLoad(webpSrc); };
      webpImg.src = webpSrc;
    };
    img.src = pngSrc;
  }

  // ---- 预加载立绘 ----
  function preloadPortrait(charId, emotion) {
    const chars = _getCharacters();
    const char = chars[charId];
    if (!char || !char.portraits) return;
    const file = char.portraits[emotion] || char.portraits.default;
    if (!file) return;
    _loadPortrait(file);
  }

  // ---- 打击感等级 → 立绘入场动画类名 ----
  function _portraitEnterAnimClass(level) {
    switch (level) {
      case 0: return 'portrait-fade';
      case 1: return 'portrait-tap';
      case 2: return 'portrait-strike';
      case 3: return 'portrait-slamming';
      case 4: return 'portrait-burst';
      default: return 'portrait-fade';
    }
  }

  // ---- 打击感等级 → 立绘入场动画时长(ms) ----
  function _portraitEnterAnimDuration(level) {
    switch (level) {
      case 0: return 400;
      case 1: return 300;
      case 2: return 400;
      case 3: return 500;
      case 4: return 600;
      default: return 400;
    }
  }

  // ---- 打击感音效+震动+闪光 ----
  function _playHitEffect(level) {
    if (level <= 0) return;

    // 音效
    if (level >= 3) {
      _sfx('playPortraitSlam');
    } else if (level >= 1) {
      _sfx('playPortraitTap');
    }

    // 视觉特效（调用 Effects 系统）
    if (typeof Effects !== 'undefined') {
      Effects.triggerLevel(level);
    }
  }

  // ---- 判断立绘是否正在播放入场动画 ----
  function _isPortraitEntering() {
    if (!portraitEl) return false;
    return portraitEl.classList.contains('portrait-fade') ||
           portraitEl.classList.contains('portrait-tap') ||
           portraitEl.classList.contains('portrait-strike') ||
           portraitEl.classList.contains('portrait-slamming') ||
           portraitEl.classList.contains('portrait-burst');
  }

  // ---- 动态背景切换 ----
  // bgValue 可以是：
  //   - 图片路径字符串：'assets/images/bg/bg_chapter_3.webp'
  //   - 颜色字符串：'#1a1a2e' 或 'rgba(20,10,40,0.95)'
  //   - null：恢复默认背景
  function changeBg(bgValue, options = {}) {
    init();
    const duration = options.duration || 800; // 过渡时间ms

    if (bgValue === _currentBg) return;
    _currentBg = bgValue;

    const body = document.body;

    if (!bgValue || bgValue === 'default') {
      // 恢复默认背景（清除内联样式，使用CSS变量）
      body.style.backgroundImage = '';
      body.style.backgroundColor = '';
      body.style.backgroundSize = '';
      body.style.backgroundPosition = '';
      body.style.backgroundRepeat = '';
      return;
    }

    // 判断是图片还是颜色
    const isImage = /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(bgValue) || bgValue.startsWith('url(');

    if (isImage) {
      const url = bgValue.startsWith('url(') ? bgValue : `url('${bgValue}')`;
      body.style.transition = `background-image ${duration}ms ease, background-color ${duration}ms ease`;
      body.style.backgroundImage = url;
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      body.style.backgroundRepeat = 'no-repeat';
    } else {
      // 纯色背景
      body.style.transition = `background-color ${duration}ms ease`;
      body.style.backgroundImage = '';
      body.style.backgroundColor = bgValue;
    }

    // 过渡结束后恢复 transition（避免影响其他动画）
    setTimeout(() => {
      body.style.transition = '';
    }, duration + 50);
  }

  // ---- 显示立绘（带砸入动画）----
  // zoom: 'far' | 'normal' | 'close' | number（可选，默认保持当前缩放）
  function showPortrait(charId, emotion, effectLevel = 0, zoom) {
    init();
    const chars = _getCharacters();
    const char = chars[charId];
    if (!char || !char.portraits || Object.keys(char.portraits).length === 0) {
      hidePortrait();
      return;
    }

    const file = char.portraits[emotion] || char.portraits.default;
    if (!file) { hidePortrait(); return; }

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

    // 优先 WebP，加载失败回退 PNG
    const token = ++_portraitToken;
    _loadPortrait(file, function(src) {
      if (token !== _portraitToken) return; // 已被新的调用覆盖
      if (!portraitEl) return;
      portraitEl.style.backgroundImage = `url('${src}')`;
    });

    if (!sameChar) {
      // 新角色登场：根据打击感等级选择入场动画
      const level = Math.max(0, Math.min(4, effectLevel || 0));
      const animClass = _portraitEnterAnimClass(level);
      const animDuration = _portraitEnterAnimDuration(level);

      portraitEl.classList.remove('portrait-exiting');
      portraitEl.classList.remove('portrait-slamming');
      portraitEl.classList.remove('portrait-fade');
      portraitEl.classList.remove('portrait-tap');
      portraitEl.classList.remove('portrait-strike');
      portraitEl.classList.remove('portrait-burst');
      portraitEl.classList.remove('portrait-shaking');
      portraitEl.classList.remove('portrait-zoom-transition');
      void portraitEl.offsetWidth;
      portraitEl.classList.add(animClass);
      portraitEl.style.opacity = '1';

      // 打击感动画 + 音效 + 震动
      _playHitEffect(level);

      _isBossEnter = false;
      // 入场动画结束后，应用当前缩放
      setTimeout(() => {
        if (portraitEl && currentPortrait && currentPortrait.charId === charId) {
          portraitEl.classList.remove(animClass);
          _applyPortraitTransform();
        }
      }, animDuration);
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

  // ---- 显示道具（弹出动画）----
  // itemId: 道具ID（对应 media-config.items 中的key）
  // options: { duration, label, autoHide }
  function showItem(itemId, options = {}) {
    init();
    const items = _getItems();
    const itemUrl = items[itemId];
    if (!itemUrl) {
      console.warn('[StoryEngine] 道具不存在:', itemId);
      return;
    }

    const label = options.label || _getItemLabel(itemId);
    const duration = options.duration || 0; // 0=不自动隐藏
    const autoHide = options.autoHide !== undefined ? options.autoHide : (duration > 0);

    // 播放道具获得音效
    if (typeof _sfx === 'function') {
      _sfx('reveal');
    }

    // 设置道具图片
    itemEl.style.backgroundImage = `url('${itemUrl}')`;
    itemLabelEl.textContent = label;

    // 显示遮罩
    itemOverlayEl.style.opacity = '1';

    // 显示道具（弹入动画）
    requestAnimationFrame(() => {
      itemEl.style.opacity = '1';
      itemEl.style.transform = 'translate(-50%, -50%) scale(1)';
      itemLabelEl.style.opacity = '1';
    });

    currentItem = itemId;

    // 自动隐藏
    if (autoHide && duration > 0) {
      if (_itemHideTimer) { clearTimeout(_itemHideTimer); }
      _itemHideTimer = setTimeout(() => {
        hideItem();
      }, duration);
    }
  }

  // ---- 隐藏道具 ----
  function hideItem() {
    init();
    if (!currentItem) return;
    if (_itemHideTimer) { clearTimeout(_itemHideTimer); _itemHideTimer = null; }

    itemOverlayEl.style.opacity = '0';
    itemEl.style.opacity = '0';
    itemEl.style.transform = 'translate(-50%, -50%) scale(0.8)';
    itemLabelEl.style.opacity = '0';

    setTimeout(() => {
      itemEl.style.backgroundImage = '';
      itemLabelEl.textContent = '';
    }, 350);

    currentItem = null;
  }

  // ---- 道具名称映射 ----
  function _getItemLabel(itemId) {
    const labels = {
      'diary': '日记',
      'key': '钥匙',
      'letter_k734': 'K-734信件',
      'scroll': '卷轴',
      'starshuttle': '星辰梭',
      'unposted_letter': '未寄出的信',
    };
    return labels[itemId] || itemId;
  }

  // ---- 获取道具配置 ----
  function _getItems() {
    if (typeof MEDIA_CONFIG !== 'undefined' && MEDIA_CONFIG.items) return MEDIA_CONFIG.items;
    if (typeof window.MEDIA_CONFIG !== 'undefined' && window.MEDIA_CONFIG.items) return window.MEDIA_CONFIG.items;
    return {};
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
    // 只有当立绘没有在播放入场/退场/抖动动画时才设置 inline transform
    if (!_isPortraitEntering() &&
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

    // 如果正在播放入场/退场/抖动动画，只更新状态值，等动画结束后再应用
    if (_isPortraitEntering() ||
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
    // 如果正在播放入场/退场动画，跳过抖动（避免动画冲突）
    if (_isPortraitEntering() ||
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
    // 判断是否正在播放入场动画
    const entering = _isPortraitEntering();
    const enterDelay = entering ? 550 : 150;

    switch (e) {
      case 'surprised':
        // 惊讶：轻微推近 + 短暂抖动
        zoomPortrait('close', 250);
        setTimeout(shake, enterDelay);
        break;
      case 'angry':
        // 愤怒：推近 + 抖动
        zoomPortrait('close', 200);
        setTimeout(shake, entering ? 520 : 100);
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
    if (bubbleEl) {
      bubbleEl.style.opacity = '0';
      bubbleEl.style.pointerEvents = 'none';
    }

    // 确保遮罩层正常工作（拦截背景点击）
    if (overlayEl) {
      overlayEl.style.opacity = '1';
      overlayEl.style.pointerEvents = 'auto';
      overlayEl.style.zIndex = '9998';
    }

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

    narrEl.style.pointerEvents = 'auto';
    narrEl.style.zIndex = '10001';
    narrEl.classList.remove('narrator-show');
    void narrEl.offsetWidth;
    narrEl.classList.add('narrator-show');

    // 打字机效果显示旁白
    _currentText = text;
    let idx = 0;
    narrEl.textContent = '';

    function typeNarr() {
      try {
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
      } catch(e) {
        // 打字机出错时，直接显示全部文字
        _typewriterTimer = null;
        narrEl.textContent = text;
        const hint = document.createElement('span');
        hint.style.cssText = 'display:block;font-size:10px;color:#fbbf24;margin-top:12px;opacity:0.6;animation:blink 0.8s infinite;font-style:normal;';
        hint.textContent = '▼ 点击继续';
        narrEl.appendChild(hint);
      }
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
    if (!voiceId) return;
    // 只有VO_开头的ID有配音文件
    if (!voiceId.startsWith('VO_')) return;

    if (!_audioUnlocked) {
      // 音频未解锁，排队等待用户交互后播放
      _pendingVoiceId = voiceId;
      return;
    }

    // 优先使用 MP3 格式（体积小，加载快），加载失败则回退到 WAV
    const mp3Path = _VOICE_DIR + voiceId + '.mp3';
    const wavPath = _VOICE_DIR + voiceId + '.wav';
    
    if (audioEl) { try { audioEl.pause(); audioEl.src = ''; } catch(e) {} }
    audioEl = new Audio();
    audioEl.volume = 0.85;
    
    let fallbackDone = false;
    
    audioEl.addEventListener('error', function onError() {
      if (!fallbackDone) {
        fallbackDone = true;
        // MP3 加载失败，回退到 WAV
        audioEl.src = wavPath;
        audioEl.play().catch((e) => {
          console.warn('Voice play failed (WAV fallback):', voiceId, e);
        });
      }
    });
    
    audioEl.src = mp3Path;
    audioEl.play().catch((e) => {
      // 播放被阻止（如自动播放策略），不影响文字显示
      if (e.name === 'NotAllowedError') {
        console.warn('Voice autoplay blocked:', voiceId);
      }
    });
  }

  // ---- 打字机效果显示文字 ----
  // speed: 每字间隔 ms；burst: 是否启用"前慢后快"爆发节奏
  function _typewrite(charId, text, onComplete, speed, burst) {
    const nameEl = document.getElementById('dlg-name');
    const textEl = document.getElementById('dlg-text');
    const indicator = document.getElementById('dlg-indicator');
    const chars = _getCharacters();
    const char = chars[charId];
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
    const hasVoice = dialogueQueue.length > 0 && dialogueQueue[0] && dialogueQueue[0].voiceId && dialogueQueue[0].voiceId.startsWith('VO_');
    // 当前对话的voiceId
    const currentVid = (_currentDialogue && _currentDialogue.voiceId) || '';
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
      try {
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
      } catch(e) {
        // 打字机出错时，直接显示全部文字
        _typewriterTimer = null;
        textEl.textContent = text;
        indicator.style.opacity = '1';
        if (onComplete) onComplete();
      }
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
  let _currentDialogue = null;
  let _narratorEl = null;

  // ---- 显示对话气泡 ----
  // speed: 打字机速度（ms/字），不传则用默认速度；burst: 是否启用前慢后快爆发节奏
  function showBubble(charId, text, speed, burst) {
    init();
    _currentText = text;
    // 隐藏旁白
    _hideNarrator();

    const isMobile = window.innerWidth < 640 || ('ontouchstart' in window);
    if (bubbleEl) {
      bubbleEl.style.opacity = '1';
      bubbleEl.style.pointerEvents = 'auto';
      bubbleEl.style.transform = isMobile ? 'translateX(-50%) translateY(0)' : 'translateY(0)';
    }
    if (overlayEl) {
      overlayEl.style.opacity = '1';
      overlayEl.style.pointerEvents = 'auto';
      overlayEl.style.zIndex = '9998';
    }
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
      yan: '#60a5fa',
      plotter: '#f87171',
      weaver: '#22d3ee',
      remnant: '#34d399',
      setterSecret: '#a78bfa',
      plotterShadow: '#8b5cf6',
      system: '#64748b'
    };
    return colors[charId] || '#94a3b8';
  }

  // ---- 获取 CHARACTERS 数据源（优先 window.CHAPTER_DATA.characters，降级全局 CHARACTERS）----
  function _getCharacters() {
    if (typeof window !== 'undefined' && window.CHAPTER_DATA && window.CHAPTER_DATA.characters) {
      return window.CHAPTER_DATA.characters;
    }
    if (typeof CHARACTERS !== 'undefined') return CHARACTERS;
    return {};
  }

  // ---- 获取场景数据源（window.CHAPTER_DATA.scenes）----
  function _getScenes() {
    if (typeof window !== 'undefined' && window.CHAPTER_DATA && window.CHAPTER_DATA.scenes) {
      return window.CHAPTER_DATA.scenes;
    }
    return null;
  }

  // ---- 解析背景ID为实际URL ----
  // 优先级：MediaConfig.scenes > MediaConfig.backgrounds > MediaConfig.endings > 原值
  function _resolveBgUrl(bgValue) {
    if (!bgValue) return bgValue;
    // 已经是URL（包含路径或扩展名），直接返回
    if (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(bgValue) || bgValue.startsWith('url(') || bgValue.startsWith('http') || bgValue.startsWith('assets/')) {
      return bgValue;
    }
    // 从 MediaConfig 中查找
    let mc = null;
    if (typeof MEDIA_CONFIG !== 'undefined') mc = MEDIA_CONFIG;
    else if (typeof window !== 'undefined' && window.MEDIA_CONFIG) mc = window.MEDIA_CONFIG;

    // 判断是否为移动端布局
    const isMobile = document.body && document.body.classList && document.body.classList.contains('layout-mobile');

    if (mc) {
      // 移动端优先查找竖屏版（_portrait）
      if (isMobile) {
        const portraitKey = bgValue + '_portrait';
        // 优先查场景图竖屏版
        if (mc.scenes && mc.scenes[portraitKey]) return mc.scenes[portraitKey];
        // 带 scene_ 前缀的竖屏版
        if (bgValue.startsWith('scene_')) {
          const portraitSceneKey = bgValue + '_portrait';
          const key = portraitSceneKey.slice('scene_'.length);
          if (mc.scenes && mc.scenes[key]) return mc.scenes[key];
        }
      }

      // 优先查场景图
      if (mc.scenes && mc.scenes[bgValue]) return mc.scenes[bgValue];
      // 其次查章节背景
      if (mc.backgrounds && mc.backgrounds[bgValue]) return mc.backgrounds[bgValue];
      // 查结局图
      if (mc.endings && mc.endings[bgValue]) return mc.endings[bgValue];
      // 支持带 scene_ 前缀的写法
      const prefixMap = { 'scene_': 'scenes', 'bg_': 'backgrounds', 'ending_': 'endings' };
      for (const [prefix, category] of Object.entries(prefixMap)) {
        if (bgValue.startsWith(prefix)) {
          const key = bgValue.slice(prefix.length);
          if (mc[category] && mc[category][key]) return mc[category][key];
        }
      }
    }
    // 都找不到，返回原值（changeBg 会当作纯色处理）
    return bgValue;
  }

  // ---- 说话者中文名 → charId 映射（动态从 CHARACTERS 构建，硬编码作为 fallback）----
  let _speakerMapCache = null;
  function _getSpeakerMap() {
    if (_speakerMapCache) return _speakerMapCache;
    const chars = _getCharacters();
    const map = {
      '旁白': 'narrator',
      '系统': 'system',
      '你': null,
      '玩家': null,
    };
    // 别名硬编码（兼容场景数据中的多种称呼）
    const aliases = {
      '设局人残影': 'plotterShadow',
      '设局人（残影）': 'plotterShadow',
      '残影': 'plotterShadow',
      '设局人秘术': 'setterSecret',
      '设局人（秘术）': 'setterSecret',
      '秘术形态': 'setterSecret',
      '星辰梭': 'weaver',
      '残局守护者': 'remnant',
      '残者': 'remnant',
      '沈墨': 'shenmo',
      '莹莹': 'ying',
      '阿妍': 'yan',
    };
    Object.assign(map, aliases);
    // 从 CHARACTERS 动态构建（中文名 → charId）
    for (const [cid, c] of Object.entries(chars)) {
      if (c && c.name) {
        if (map[c.name] === undefined) {
          map[c.name] = cid;
        }
      }
    }
    _speakerMapCache = map;
    return map;
  }

  // ---- 内联格式 → 内部播放格式转换 ----
  // 内联格式：{speaker, text, emotion?, bg?, isTitle?, isNarration?, sfx?, thought?, effect?, subtitle?, type?}
  // 内部格式：{char, portrait, text, effect, bg, isTitle, sfx, subtitle, isNarration, thought, voiceId}
  function _convertInlineDialogue(line) {
    if (!line) return null;

    // 标题卡
    if (line.isTitle || line.type === 'title') {
      return {
        char: null,
        portrait: null,
        text: line.text || '',
        isTitle: true,
        subtitle: line.subtitle || '',
        effect: 0,
        bg: line.bg !== undefined ? line.bg : undefined,
        bgDuration: line.bgDuration,
        item: line.item !== undefined ? line.item : undefined,
        itemDuration: line.itemDuration,
      };
    }

    const speakerMap = _getSpeakerMap();
    const speaker = line.speaker || '';
    const charId = speakerMap[speaker];
    const chars = _getCharacters();

    // 旁白
    const isNarration = line.isNarration || charId === 'narrator' ||
      (charId === null && speaker && speakerMap.hasOwnProperty(speaker) === false && !line.emotion);

    // 确定情绪/立绘
    let portrait = null;
    if (charId && charId !== 'narrator') {
      portrait = line.emotion || 'default';
      // 如果角色没有该情绪的立绘，降级到 default
      const charData = chars[charId];
      if (charData && charData.portraits && !charData.portraits[portrait]) {
        portrait = 'default';
      }
    }

    return {
      char: charId || (isNarration ? 'narrator' : null),
      portrait: portrait,
      text: line.text || '',
      effect: line.effect !== undefined ? line.effect : 0,
      bg: line.bg !== undefined ? line.bg : undefined,
      bgDuration: line.bgDuration,
      sfx: line.sfx,
      item: line.item !== undefined ? line.item : undefined,
      itemDuration: line.itemDuration,
      thought: line.thought || false,
      isNarration: isNarration,
      isTitle: false,
      voiceId: line.voiceId || null,
    };
  }

  // ---- 批量转换内联对话行 ----
  function _convertInlineLines(lines) {
    if (!lines || !Array.isArray(lines)) return [];
    return lines.map(_convertInlineDialogue).filter(d => d !== null);
  }

  // ---- 根据周目构造场景key ----
  function _buildSceneKey(baseKey) {
    if (!baseKey) return baseKey;
    if (_currentRoute <= 1) return baseKey; // route1 兼容旧格式
    const routeKey = 'route' + _currentRoute + '_' + baseKey;
    // 检查 window.CHAPTER_DATA.scenes 中是否存在带前缀的场景
    const scenes = _getScenes();
    if (scenes && scenes[routeKey]) {
      return routeKey;
    }
    // 降级：返回原始key
    return baseKey;
  }

  // ---- 设置当前周目 ----
  function setRoute(route) {
    _currentRoute = parseInt(route) || 1;
    console.log('[StoryEngine] setRoute:', _currentRoute);
  }

  // ---- 播放场景 ----
  function playScene(sceneId, callback) {
    const resolvedKey = _buildSceneKey(sceneId);
    if (resolvedKey !== sceneId) {
      console.log('[StoryEngine] route scene:', sceneId, '→', resolvedKey);
    }
    const scenes = _getScenes();
    const sceneData = scenes ? scenes[resolvedKey] : null;
    if (!sceneData || !Array.isArray(sceneData) || sceneData.length === 0) {
      console.warn('StoryEngine: Scene not found:', resolvedKey);
      if (callback) callback();
      return;
    }
    // 将内联格式转换为内部播放格式
    const dialogueObjects = _convertInlineLines(sceneData);
    playDialogues(dialogueObjects, callback);
  }

  // ---- 播放对话序列 ----
  function playDialogues(dialogueObjects, callback) {
    // 如果正在播放，先中断当前剧情，防止重入导致状态混乱
    if (isPlaying) {
      interrupt();
    }
    // 开始主线剧情时，隐藏环境台词
    _hideAmbient();
    dialogueQueue = [...dialogueObjects];
    onCompleteCallback = callback;
    isPlaying = true;
    // 派发"台词开始"事件，用于暂停计时器等
    try {
      GlobalBus.emit('story-dialogue-start');
    } catch(e) {}
    _playNext();
  }

  function _playNext() {
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_typewriterTimer) { clearTimeout(_typewriterTimer); _typewriterTimer = null; }
    if (dialogueQueue.length === 0) {
      _endScene();
      return;
    }

    const dlg = dialogueQueue.shift();
    _currentDialogue = dlg;
    if (!dlg) { _playNext(); return; }

    // 处理背景切换（bg字段）——所有对话类型都支持
    if (dlg.bg !== undefined && dlg.bg !== null) {
      const bgUrl = _resolveBgUrl(dlg.bg);
      changeBg(bgUrl, { duration: dlg.bgDuration || 800 });
    }

    // 处理道具展示（item字段）
    if (dlg.item !== undefined && dlg.item !== null) {
      if (dlg.item === false || dlg.item === 'hide') {
        hideItem();
      } else if (typeof dlg.item === 'string') {
        showItem(dlg.item, { duration: dlg.itemDuration || 0 });
      } else if (typeof dlg.item === 'object' && dlg.item.id) {
        showItem(dlg.item.id, {
          duration: dlg.item.duration || 0,
          label: dlg.item.label,
          autoHide: dlg.item.autoHide,
        });
      }
    }

    // 处理标题卡（自动播放，不需要点击）
    if (dlg.isTitle) {
      _showTitleCard(dlg.text, dlg.subtitle);
      return;
    }

    // 处理旁白（需要点击继续）
    if (dlg.char === 'narrator' || dlg.isNarration || (dlg.char === null && !dlg.portrait && dlg.text && !dlg.isTitle)) {
      _showNarrator(dlg.text);
      // 旁白的环境音效
      if (dlg.sfx) {
        if (typeof dlg.sfx === 'string') {
          _sfx(dlg.sfx);
        } else if (typeof dlg.sfx === 'object' && dlg.sfx.name) {
          const delay = dlg.sfx.delay || 0;
          const args = dlg.sfx.args || [];
          if (delay > 0) {
            setTimeout(() => _sfx(dlg.sfx.name, ...args), delay);
          } else {
            _sfx(dlg.sfx.name, ...args);
          }
        }
      }
      playVoice(dlg.voiceId);
      return;
    }

    // 显示立绘（effect 决定打击感等级入场动画）
    if (dlg.char && dlg.portrait) {
      showPortrait(dlg.char, dlg.portrait, dlg.effect || 0);
      // P0: 根据情绪自动触发立绘演出动画
      _triggerPortraitEmotion(dlg.portrait);
    } else if (!dlg.char) {
      hidePortrait();
    }

    // 台词级环境音效（sfx字段可以是字符串或{name, delay, args}
    if (dlg.sfx) {
      if (typeof dlg.sfx === 'string') {
        _sfx(dlg.sfx);
      } else if (typeof dlg.sfx === 'object' && dlg.sfx.name) {
        const delay = dlg.sfx.delay || 0;
        const args = dlg.sfx.args || [];
        if (delay > 0) {
          setTimeout(() => _sfx(dlg.sfx.name, ...args), delay);
        } else {
          _sfx(dlg.sfx.name, ...args);
        }
      }
    }

    // 系统空台词：只有SFX/道具/背景切换，不显示气泡，自动进入下一句
    if (dlg.char === 'system' && (!dlg.text || dlg.text.length === 0) && !dlg.thought) {
      hideBubble();
      // 如果有道具展示，给一点展示时间再继续
      const autoDelay = dlg.item ? (dlg.itemDuration || 2000) : 400;
      _autoAdvanceTimer = setTimeout(() => _playNext(), autoDelay);
      return;
    }

    // P0: 根据情绪计算打字机速度
    const typingSpeed = dlg.portrait ? _emotionTypingSpeed(dlg.portrait) : _typingSpeed;
    const isBurst = _isBurstEmotion(dlg.portrait);

    // 显示文字（打字机）
    showBubble(dlg.char, dlg.text, typingSpeed, isBurst);

    // 播放配音
    playVoice(dlg.voiceId);
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
    _currentDialogue = null;
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (_typewriterTimer) { clearTimeout(_typewriterTimer); _typewriterTimer = null; }
    hideBubble();
    _hideNarrator();
    setTimeout(() => hidePortrait(), 200);
    // 派发"台词结束"事件，用于恢复计时器等
    try {
      GlobalBus.emit('story-dialogue-end');
    } catch(e) {}
    if (onCompleteCallback) {
      const cb = onCompleteCallback;
      onCompleteCallback = null;
      cb();
    }
  }

  // ---- 中断 ----
  function interrupt() {
    const wasPlaying = isPlaying;
    dialogueQueue = [];
    isPlaying = false;
    _currentDialogue = null;
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
    // 如果之前在播放，派发结束事件
    if (wasPlaying) {
      try {
        GlobalBus.emit('story-dialogue-end');
      } catch(e) {}
    }
  }

  // ---- 单行台词 ----
  function say(charId, emotion, text, effectLevel, callback) {
    const dlg = {
      char: charId,
      portrait: emotion,
      text: text,
      effect: effectLevel || 0,
      isTitle: false,
      isNarration: false,
      voiceId: null,
    };
    playDialogues([dlg], callback);
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
    // 如果提示系统激活，不要播放环境台词，避免打扰
    if (typeof window.isHintActive === 'function' && window.isHintActive()) return;
    if (typeof window._scriptHintActive === 'boolean' && window._scriptHintActive) return;

    // 清除之前的环境台词
    _hideAmbient();

    _isAmbientPlaying = true;

    // 显示立绘（不带砸入动画，轻柔出现）
    const chars = _getCharacters();
    if (charId && chars[charId] && chars[charId].portraits) {
      const char = chars[charId];
      const emo = emotion || 'default';
      const file = char.portraits[emo] || char.portraits.default;
      if (file) {
        _loadPortrait(file, function(src) {
          if (!portraitEl) return;
          portraitEl.style.backgroundImage = `url('${src}')`;
        });
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
    const char = chars[charId];
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
  // lines: [{speaker, text, emotion?}]
  function sayLines(lines, callback) {
    const dialogueObjects = _convertInlineLines(lines);
    if (dialogueObjects.length > 0) {
      playDialogues(dialogueObjects, callback);
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
      ray: 'Yan_defeat',
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

    // 3. 根据周目选择结局序列
    //    route1: 设局人认输→传承→告别→守笼人总结
    //    route2: 阿妍视角的传承与告别
    //    route3: 莹莹视角的发现与重逢（普通结局）
    const sequence = _getEndingSequence('normal');

    // 延迟800ms后开始播放，等闪光效果
    setTimeout(() => {
      playSceneSequence(sequence, () => {
        // 演出全部结束后，延迟显示结局字幕
        setTimeout(() => {
          showEndingCredits('normal');
          if (callback) callback();
        }, 1000);
      });
    }, 1000);
  }

  // ---- 真结局（隐藏关通关后） ----
  function finalTrueEnding(callback) {
    // 1. 温柔的金光+柔光效果（真结局更温暖）
    if (typeof Effects !== 'undefined') {
      Effects.goldenFlash(2000);
      Effects.vignette(0.3, 500);
      setTimeout(() => Effects.vignette(0, 3000), 500);
    }
    if (typeof AudioManager !== 'undefined' && typeof AudioManager.vibrate === 'function') {
      AudioManager.vibrate('victory');
    } else if (navigator.vibrate) {
      _vibrate('victory');
    }

    // 2. 切换到真结局BGM（更温暖的旋律）
    if (typeof AudioManager !== 'undefined') {
      AudioManager.stopBGM && AudioManager.stopBGM();
      AudioManager.stopBossBGM && AudioManager.stopBossBGM();
      setTimeout(() => AudioManager.playWin && AudioManager.playWin(), 500);
    }
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.setPhase('true_ending');
    }

    // 3. 真结局序列：父女重逢+真相大白+告别+收束
    const sequence = _getEndingSequence('true');

    setTimeout(() => {
      playSceneSequence(sequence, () => {
        setTimeout(() => {
          showEndingCredits('true');
          if (callback) callback();
        }, 1500);
      });
    }, 1500);
  }

  // ---- 获取结局场景序列 ----
  function _getEndingSequence(type) {
    if (type === 'true') {
      // 真结局：route3 通关隐藏关后触发
      if (_currentRoute === 3) {
        return [
          'setter_defeat',           // 秘术设局人认可
          'setter_transfer',         // 传承星辰梭
          'setter_farewell',         // 设局人告别
          'route3_true_ending',      // 莹莹视角·父女重逢
          'route3_true_ending_final' // 最终收束
        ];
      }
      // 其他周目真结局（默认）
      return [
        'setter_defeat',
        'setter_transfer',
        'setter_farewell',
        'true_ending'
      ];
    }
    // 普通结局：各周目普通通关
    if (_currentRoute === 2) {
      return [
        'setter_defeat',
        'setter_transfer',
        'setter_farewell',
        'true_ending'
      ];
    }
    if (_currentRoute === 3) {
      return [
        'setter_defeat',
        'setter_transfer',
        'setter_farewell',
        'true_ending'
      ];
    }
    // route1 默认
    return [
      'setter_defeat',
      'setter_transfer',
      'setter_farewell',
      'true_ending'
    ];
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

  // ---- 结局存档管理 ----
  const ENDING_STORAGE_KEY = 'killersudoku_endings';

  function _loadEndings() {
    try {
      return JSON.parse(localStorage.getItem(ENDING_STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function _saveEnding(type, route) {
    const endings = _loadEndings();
    const key = `route${route}_${type}`;
    endings[key] = {
      unlocked: true,
      unlockedAt: Date.now(),
      route: route,
      type: type
    };
    localStorage.setItem(ENDING_STORAGE_KEY, JSON.stringify(endings));
    return endings;
  }

  function hasSeenEnding(type, route) {
    const endings = _loadEndings();
    const key = `route${route}_${type}`;
    return !!(endings[key] && endings[key].unlocked);
  }

  function getAllEndings() {
    return _loadEndings();
  }

  // ---- 结局字幕 ----
  function showEndingCredits(type) {
    init();
    const endingType = type || 'normal';

    // 保存结局记录
    _saveEnding(endingType, _currentRoute);

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

      // 根据结局类型显示不同内容
      let titleText, subtitleText, detailText, cgImageLandscape, cgImagePortrait;
      if (endingType === 'true') {
        titleText = '真结局 · 父女重逢';
        subtitleText = '— 所有的线索，终于汇聚成光 —';
        detailText = '他一直在等你<br>星辰不灭，薪火相传<br>这一次，不再有遗憾';
        // 优先使用 media-config 的 getScene()，否则降级到硬编码路径
        cgImageLandscape = (typeof getScene === 'function' && getScene('cg_reunion_wide')) ||
                           'assets/images/scenes/cg_true_ending_reunion.jpg';
        cgImagePortrait = (typeof getScene === 'function' && getScene('cg_reunion')) ||
                          'assets/images/scenes/cg_true_ending_reunion.jpg';
      } else if (_currentRoute === 2) {
        titleText = '第二章通关';
        subtitleText = '— 冷面侦探 · 档案之道 —';
        detailText = '七卷秘术 · 已全部传承<br>真相的碎片 · 已收集过半';
        cgImageLandscape = null;
        cgImagePortrait = null;
      } else if (_currentRoute === 3) {
        titleText = '第三章通关';
        subtitleText = '— 寻女之路 · 暂告一段落 —';
        detailText = '七卷秘术 · 已全部传承<br>但真相……似乎还隐藏在更深的迷雾中';
        cgImageLandscape = null;
        cgImagePortrait = null;
      } else {
        titleText = '全章节通关';
        subtitleText = '— 档案之道 · 薪火不息 —';
        detailText = '七卷秘术 · 已全部传承<br>新的设局人 · 已经诞生';
        cgImageLandscape = null;
        cgImagePortrait = null;
      }

      // 判断横竖屏，选择对应CG
      const isPortrait = window.innerHeight > window.innerWidth;
      const cgImage = isPortrait ? cgImagePortrait : cgImageLandscape;

      // CG图片占位（有图则显示，无图则跳过）——自适应横竖屏
      const cgHtml = cgImage ? `
        <div class="ending-cg-container" style="margin-bottom:30px;">
          <img src="${cgImage}" alt="结局CG"
               class="ending-cg-img"
               style="max-width:${isPortrait ? 'min(85vw,420px)' : 'min(80vw,600px)'};
                      max-height:${isPortrait ? '45vh' : '35vh'};
                      width: auto; height: auto;
                      border-radius:12px;
                      box-shadow:0 10px 40px rgba(251,191,36,0.2);
                      object-fit:contain;"
               onerror="this.style.display='none'; this.parentElement.style.display='none'">
        </div>
      ` : '';

      creditsEl.innerHTML = `
        <div style="text-align:center; color:#fff; font-family:serif; padding:20px;">
          ${cgHtml}
          <div style="font-size:clamp(28px,6vw,56px); font-weight:900;
                      background:linear-gradient(135deg,#fbbf24,#f59e0b,#ef4444,#a855f7);
                      -webkit-background-clip:text; -webkit-text-fill-color:transparent;
                      text-shadow:none; letter-spacing:0.15em; margin-bottom:30px;">
            ${titleText}
          </div>
          <div style="font-size:clamp(14px,2.5vw,22px); color:#c4b5fd; letter-spacing:0.3em; margin-bottom:50px;">
            ${subtitleText}
          </div>
          <div style="font-size:clamp(12px,2vw,18px); color:#94a3b8; line-height:2; letter-spacing:0.1em;">
            ${detailText}
          </div>
          <div style="margin-top:60px; font-size:clamp(11px,1.8vw,15px); color:#6366f1;
                      cursor:pointer; pointer-events:auto; padding:12px 30px;
                      border:1px solid #6366f1; border-radius:8px;
                      display:inline-block; transition:all 0.3s;"
               onmouseover="this.style.background='rgba(99,102,241,0.2)'"
               onmouseout="this.style.background='transparent'"
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
    const chars = _getCharacters();
    Object.entries(chars).forEach(([cid, c]) => {
      if (c.portraits) {
        Object.values(c.portraits).forEach(f => {
          _loadPortrait(f);
        });
      }
    });
  }

  return {
    init,
    setRoute,
    playScene,
    playDialogues,
    sayLines,
    sayAmbient,
    nextDialogue,
    interrupt,
    showPortrait,
    hidePortrait,
    hideBubble,
    showItem,
    hideItem,
    setEmotion,
    zoomPortrait,
    zoomIn,
    zoomOut,
    shake,
    resetZoom,
    changeBg,
    bossEnter,
    bossDefeat,
    finalVictory,
    finalTrueEnding,
    showEndingCredits,
    hasSeenEnding,
    getAllEndings,
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
