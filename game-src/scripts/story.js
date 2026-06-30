// ==========================================
// Story Engine v2 - 剧情对话引擎
// 修复: 配音自动播放(用户交互后启用)、手机端适配、自动推进
// ==========================================

const StoryEngine = (function() {
  let currentPortrait = null;
  let dialogueQueue = [];
  let isPlaying = false;
  let audioEl = null;
  let bubbleEl = null;
  let portraitEl = null;
  let overlayEl = null;
  let onCompleteCallback = null;
  let voiceEnabled = true;
  let _audioUnlocked = false;
  let _autoAdvanceTimer = null;

  // ---- 解锁音频（在用户首次交互时调用）----
  function _unlockAudio() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    // 创建一个静默音频来解锁AudioContext
    try {
      const silent = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQcAQNHWpXYRAPv/0Lc+EA==');
      silent.volume = 0;
      silent.play().catch(() => {});
    } catch(e) {}
    document.removeEventListener('click', _unlockAudio, true);
    document.removeEventListener('touchstart', _unlockAudio, true);
    document.removeEventListener('keydown', _unlockAudio, true);
  }

  // ---- 初始化UI ----
  function init() {
    if (bubbleEl) return;

    // 注册一次性交互监听解锁音频
    document.addEventListener('click', _unlockAudio, true);
    document.addEventListener('touchstart', _unlockAudio, true);
    document.addEventListener('keydown', _unlockAudio, true);

    // 检测是否为手机端
    const isMobile = window.innerWidth < 640 || ('ontouchstart' in window) || window.innerHeight < 700;
    // 手机端：立绘更小、位置更靠下边缘，对话气泡更宽更靠下
    const pWidth = isMobile ? 90 : 220;
    const pHeight = isMobile ? 120 : 280;
    const pRight = isMobile ? -10 : -20;
    const pBottom = isMobile ? 0 : 0;
    const bubbleMaxW = isMobile ? 'calc(100vw - 110px)' : 'min(420px, calc(100vw - 260px))';
    const bubbleBottom = isMobile ? '10px' : '20px';
    const bubbleFontSize = isMobile ? '13px' : '14px';
    const bubblePadding = isMobile ? '10px 14px' : '14px 18px';

    // 对话气泡 - 响应式
    bubbleEl = document.createElement('div');
    bubbleEl.id = 'dialogue-bubble';
    bubbleEl.style.cssText = `
      position: fixed; bottom: ${bubbleBottom}; left: 50%; transform: translateX(-50%) translateY(20px);
      max-width: ${bubbleMaxW}; min-width: 160px; padding: ${bubblePadding};
      background: rgba(15,23,42,0.92); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.15); border-radius: 14px;
      color: #f1f5f9; font-size: ${bubbleFontSize}; line-height: 1.6;
      opacity: 0; transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1);
      z-index: 10000; pointer-events: auto; cursor: pointer;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    `;
    bubbleEl.innerHTML = `
      <div id="dlg-name" style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:3px;"></div>
      <div id="dlg-text" style="font-size:${bubbleFontSize};"></div>
      <div id="dlg-indicator" style="text-align:right;font-size:9px;color:#64748b;margin-top:3px;">▼ 点击继续</div>
    `;
    bubbleEl.addEventListener('click', (e) => { e.stopPropagation(); nextDialogue(); });
    document.body.appendChild(bubbleEl);

    // 立绘容器 - 响应式尺寸
    portraitEl = document.createElement('div');
    portraitEl.id = 'story-portrait';
    portraitEl.style.cssText = `
      position: fixed; right: ${pRight}px; bottom: ${pBottom}px;
      width: ${pWidth}px; height: ${pHeight}px;
      background-size: contain; background-repeat: no-repeat;
      background-position: bottom right;
      opacity: 0; transform: translateX(30px) scale(0.8);
      transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1);
      z-index: 9999; pointer-events: none;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));
    `;
    document.body.appendChild(portraitEl);

    // 窗口大小变化时重新适配
    window.addEventListener('resize', () => {
      const mob = window.innerWidth < 640 || ('ontouchstart' in window) || window.innerHeight < 700;
      const w = mob ? 90 : 220;
      const h = mob ? 120 : 280;
      const r = mob ? -10 : -20;
      const bw = mob ? 'calc(100vw - 110px)' : 'min(420px, calc(100vw - 260px))';
      portraitEl.style.width = w + 'px';
      portraitEl.style.height = h + 'px';
      portraitEl.style.right = r + 'px';
      bubbleEl.style.maxWidth = bw;
    });

    // 点击遮罩
    overlayEl = document.createElement('div');
    overlayEl.id = 'dialogue-overlay';
    overlayEl.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.2); z-index: 9998;
      opacity: 0; transition: opacity 0.3s; pointer-events: none;
    `;
    overlayEl.addEventListener('click', nextDialogue);
    document.body.appendChild(overlayEl);
  }

  // ---- 预加载立绘 ----
  function preloadPortrait(charId, emotion) {
    const char = CHARACTERS[charId];
    if (!char || !char.portraits) return;
    const file = char.portraits[emotion] || char.portraits.default;
    if (!file) return;
    const img = new Image();
    img.src = `assets/images/portraits/${file.replace(/\.(png|jpg)$/, '')}.jpg`;
  }

  // ---- 显示立绘 ----
  function showPortrait(charId, emotion) {
    init();
    const char = CHARACTERS[charId];
    if (!char) { hidePortrait(); return; }

    const file = char.portraits[emotion] || char.portraits.default;
    if (!file) { hidePortrait(); return; }

    const base = `assets/images/portraits/${file.replace(/\.(png|jpg)$/, '')}`;
    const src = `${base}.jpg`;
    portraitEl.style.backgroundImage = `url('${src}')`;
    // 根据情绪添加CSS滤镜
    let filter = 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))';
    const e = emotion || 'default';
    if (e === 'angry') filter += ' saturate(1.3) brightness(0.95)';
    else if (e === 'smile') filter += ' brightness(1.05) saturate(1.1)';
    else if (e === 'sad') filter += ' saturate(0.6) brightness(0.85)';
    else if (e === 'surprised') filter += ' brightness(1.15) saturate(1.1)';
    else if (e === 'serious' || e === 'stern') filter += ' brightness(0.9) saturate(0.9)';
    else if (e === 'think') filter += ' brightness(0.95) saturate(0.85)';
    else if (e === 'confident' || e === 'smirk') filter += ' brightness(1.05) saturate(1.15) contrast(1.1)';
    else if (e === 'lose') filter += ' saturate(0.5) brightness(0.8) contrast(0.9)';
    else if (e.startsWith('shadow_')) filter += ' opacity(0.8) hue-rotate(20deg) saturate(1.5)';
    portraitEl.style.filter = filter;
    portraitEl.style.opacity = '1';
    portraitEl.style.transform = 'translateX(0) scale(1)';
    currentPortrait = { charId, emotion };
  }

  // ---- 隐藏立绘 ----
  function hidePortrait() {
    init();
    portraitEl.style.opacity = '0';
    portraitEl.style.transform = 'translateX(40px) scale(0.8)';
    currentPortrait = null;
  }

  // ---- 切换立绘表情 ----
  function setEmotion(emotion) {
    if (!currentPortrait) return;
    showPortrait(currentPortrait.charId, emotion);
  }

  // ---- 播放配音 ----
  function playVoice(voiceId) {
    if (!voiceEnabled || !_audioUnlocked) return;
    const dlg = DIALOGUES[voiceId];
    if (!dlg) return;

    const audioPath = `assets/audio/voices/${voiceId}.mp3`;
    if (audioEl) {
      audioEl.pause();
      audioEl.src = '';
    }
    audioEl = new Audio(audioPath);
    audioEl.volume = 0.8;
    audioEl.play().catch(() => { /* 静默失败 */ });
  }

  // ---- 显示对话气泡 ----
  function showBubble(charId, text) {
    init();
    const nameEl = document.getElementById('dlg-name');
    const textEl = document.getElementById('dlg-text');
    const char = CHARACTERS[charId];
    nameEl.textContent = char ? char.name : '';
    nameEl.style.color = char ? _charColor(charId) : '#94a3b8';
    textEl.textContent = text;
    bubbleEl.style.opacity = '1';
    bubbleEl.style.transform = 'translateX(-50%) translateY(0)';
    overlayEl.style.opacity = '1';
    overlayEl.style.pointerEvents = 'auto';
  }

  // ---- 隐藏对话气泡 ----
  function hideBubble() {
    init();
    bubbleEl.style.opacity = '0';
    bubbleEl.style.transform = 'translateX(-50%) translateY(20px)';
    overlayEl.style.opacity = '0';
    overlayEl.style.pointerEvents = 'none';
  }

  function _charColor(charId) {
    const colors = {
      cagekeeper: '#22c55e',
      ray: '#f59e0b',
      plotter: '#ef4444',
      weaver: '#06b6d4',
      remnant: '#10b981',
      system: '#60a5fa'
    };
    return colors[charId] || '#94a3b8';
  }

  // ---- 播放一组对话 ----
  function playScene(sceneId, callback) {
    const voiceIds = SCENE_TRIGGERS[sceneId];
    if (!voiceIds || voiceIds.length === 0) {
      if (callback) callback();
      return;
    }
    playDialogues(voiceIds, callback);
  }

  // ---- 按VO ID序列播放对话 ----
  function playDialogues(voiceIds, callback) {
    dialogueQueue = [...voiceIds];
    onCompleteCallback = callback;
    if (!isPlaying) {
      isPlaying = true;
      _playNext();
    }
  }

  function _playNext() {
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (dialogueQueue.length === 0) {
      _endScene();
      return;
    }

    const voiceId = dialogueQueue.shift();
    const dlg = DIALOGUES[voiceId];
    if (!dlg) { _playNext(); return; }

    // 显示立绘
    if (dlg.char && dlg.portrait) {
      showPortrait(dlg.char, dlg.portrait);
    } else if (!dlg.char) {
      hidePortrait();
    }

    // 触发特效
    if (dlg.effect > 0 && typeof Effects !== 'undefined') {
      Effects.triggerLevel(dlg.effect, { portrait: null });
    }

    // 显示文字
    showBubble(dlg.char, dlg.text);

    // 播放配音
    playVoice(voiceId);

    // 自动推进（3-5秒后自动下一句，可点击跳过）
    const delay = Math.max(2500, Math.min(6000, dlg.text.length * 200 + 1500));
    _autoAdvanceTimer = setTimeout(() => {
      if (isPlaying) nextDialogue();
    }, delay);
  }

  // ---- 下一句对话 ----
  function nextDialogue() {
    if (!isPlaying) return;
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (audioEl) { try { audioEl.pause(); audioEl.src = ''; } catch(e) {} }
    if (dialogueQueue.length > 0) {
      _playNext();
    } else {
      _endScene();
    }
  }

  function _endScene() {
    isPlaying = false;
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    hideBubble();
    setTimeout(() => hidePortrait(), 400);
    if (onCompleteCallback) {
      const cb = onCompleteCallback;
      onCompleteCallback = null;
      cb();
    }
  }

  // ---- 中断对话 ----
  function interrupt() {
    dialogueQueue = [];
    isPlaying = false;
    if (_autoAdvanceTimer) { clearTimeout(_autoAdvanceTimer); _autoAdvanceTimer = null; }
    if (audioEl) { try { audioEl.pause(); audioEl.src = ''; } catch(e) {} }
    hideBubble();
    hidePortrait();
    onCompleteCallback = null;
  }

  // ---- 单行台词快捷方式 ----
  function say(charId, emotion, text, effectLevel, callback) {
    const fakeId = '_say_' + Date.now();
    DIALOGUES[fakeId] = { char: charId, portrait: emotion, text: text, effect: effectLevel || 0 };
    playDialogues([fakeId], callback);
  }

  // ---- Boss登场 ----
  // 注意：Effects.triggerLevel应由外部调用，此处只负责剧情播放
  function bossEnter(bossId) {
    const scenes = {
      ray: 'ch3_boss',
      plotter: 'ch6_boss',
      weaver: 'ch5_boss',
      remnant: 'ch4_boss'
    };
    const scene = scenes[bossId];
    if (scene) {
      setTimeout(() => playScene(scene), 600);
    }
  }

  // ---- Boss被击败 ----
  function bossDefeat(bossId, callback) {
    const scenes = {
      ray: 'ray_defeat',
      plotter: 'plotter_defeat',
      weaver: 'weaver_defeat',
      remnant: 'remnant_defeat'
    };
    const scene = scenes[bossId];
    if (scene) {
      if (typeof Effects !== 'undefined') Effects.victoryFlash();
      playScene(scene, callback);
    } else {
      // 默认通关提示
      playScene('clear_level', callback);
    }
  }

  // ---- 终章通关 ----
  function finalVictory() {
    if (typeof Effects !== 'undefined') {
      Effects.goldenFlash(1200);
      Effects.vignette(0, 1500);
    }
    setTimeout(() => {
      playDialogues(['VO_P_10', 'VO_S_02', 'VO_S_03']);
    }, 800);
  }

  // ---- 设置配音开关 ----
  function setVoiceEnabled(enabled) {
    voiceEnabled = enabled;
  }

  // ---- 预加载所有立绘 ----
  function preloadAll() {
    Object.entries(CHARACTERS).forEach(([cid, c]) => {
      if (c.portraits) {
        Object.values(c.portraits).forEach(f => {
          const img = new Image();
          img.src = `assets/images/portraits/${f.replace(/\.(png|jpg)$/, '')}.jpg`;
        });
      }
    });
  }

  return {
    init,
    playScene,
    playDialogues,
    nextDialogue,
    interrupt,
    showPortrait,
    hidePortrait,
    setEmotion,
    bossEnter,
    bossDefeat,
    finalVictory,
    setVoiceEnabled,
    preloadPortrait,
    preloadAll,
    say,
    get isPlaying() { return isPlaying; },
    get audioUnlocked() { return _audioUnlocked; }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoryEngine;
} else {
  window.StoryEngine = StoryEngine;
}
