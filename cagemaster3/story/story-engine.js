// StoryEngine - Clean story playback with typewriter effect
// Handles prologue, dialogue, portraits, backgrounds, SFX, VO
// Supports skip button, long-press skip, read-dialogue fast-forward, skip confirmation

;(function(global) {
  'use strict';

  const BG_DIR = 'assets/images/backgrounds/';
  const PORTRAIT_DIR = 'assets/images/portraits/';
  const SKIP_STORAGE_KEY = 'cagedcipher_story_skip';
  const READ_STORAGE_KEY = 'cagedcipher_story_read';

  // Character side mapping
  const CHAR_SIDE = { shenmo: 'left' };

  // Typewriter speed presets (ms per character)
  const TYPING_SPEEDS = {
    serene: 80,
    normal: 45,
    fast: 15,
    instant: 0,
    heavy: 120,
    thinking: 60,
  };

  // Emotion -> typing speed
  function emotionSpeed(emotion) {
    const map = {
      serious: 'serene', calm: 'normal', confident: 'fast',
      surprised: 'fast', energetic: 'fast', default: 'normal',
      smile: 'normal', think: 'thinking',
    };
    return TYPING_SPEEDS[map[emotion] || 'normal'];
  }

  // Portrait file mapping
  const PORTRAIT_MAP = {
    shenmo: { default: 'SM_01_沉静', confident: 'SM_01_沉静', calm: 'SM_01_沉静', smile: 'SM_02_坚定', think: 'SM_03_犹豫' },
    ayan: { default: 'R_01_冷静', calm: 'R_01_冷静', serious: 'R_02_审视', smile: 'R_03_轻笑' },
    ying: { default: 'J_01_发光', energetic: 'J_01_发光', confident: 'J_02_低头', surprised: 'J_03_认真' },
    cagekeeper: { default: 'CK_01_庄重', serious: 'CK_01_庄重', smile: 'CK_02_欣慰', surprised: 'CK_03_复杂' },
    plotter: { default: 'P_01_常态', smirk: 'P_02_残影态', serious: 'P_03_真身' },
  };

  class StoryEngine {
    constructor() {
      this._queue = [];
      this._currentDialogue = null;
      this._isPlaying = false;
      this._onComplete = null;
      this._currentBg = null;
      this._typewriterTimer = null;
      this._isTyping = false;

      // VO sync state
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;

      // DOM elements
      this._portraitEl = null;
      this._bubbleEl = null;
      this._narratorEl = null;
      this._titleCardEl = null;
      this._overlayEl = null;
      this._itemEl = null;

      // Skip-related state
      this._skipBtnEl = null;
      this._longPressProgressEl = null;
      this._longPressTimer = null;
      this._longPressStart = 0;
      this._longPressDuration = 1000; // 1 second to trigger skip
      this._isLongPressing = false;
      this._skipConfirmationShown = false;
      this._sceneKey = null; // current scene identifier for read tracking
      this._autoSkipEnabled = true; // auto fast-forward for read dialogue
      this._isCurrentSceneRead = false;
      this._readHistory = {}; // cached read history, loaded from localStorage

      // Load skip preferences and read history
      this._loadSkipPrefs();
      this._loadReadHistory();
    }

    // === Core API ===

    sayLines(lines, callback) {
      if (!lines || lines.length === 0) {
        if (callback) callback();
        return;
      }
      this._queue = lines.map(line => this._convertLine(line));
      this._onComplete = callback;
      this._isPlaying = true;

      // Check if this scene has been read (for auto fast-forward)
      this._checkSceneRead();

      // Show skip button
      this._showSkipButton();

      this._playNext();
    }

    nextDialogue() {
      if (!this._isPlaying) return;
      // If typewriter is running, complete it instantly
      if (this._isTyping) {
        this._completeTypewriter();
        // If voice is still playing, don't advance yet - wait for voice
        if (this._voicePlaying) return;
        this._playNext();
        return;
      }
      // If voice is still playing, skip voice and advance
      if (this._voicePlaying) {
        if (typeof AudioService !== 'undefined') {
          AudioService.voice.stop(50);
        }
        this._voicePlaying = false;
        this._voiceFinished = true;
      }
      this._playNext();
    }

    interrupt() {
      this._stopTypewriter();
      // Stop any playing voice
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(50);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._queue = [];
      this._isPlaying = false;
      this._currentDialogue = null;

      // Clean up skip UI
      this._hideSkipButton();
      this._cancelLongPress();

      this._hideAll();
      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // === Skip API ===

    // Set the current scene key for read-history tracking
    // key format: {chapterId}_{levelId}_{dialogType}  e.g. "1_101_pre"
    setSceneKey(key) {
      this._sceneKey = key;
      if (this._isPlaying) {
        this._checkSceneRead();
      }
    }

    // Enable/disable auto fast-forward for read dialogue
    setAutoSkipEnabled(enabled) {
      this._autoSkipEnabled = enabled;
      this._saveSkipPrefs();
    }

    isAutoSkipEnabled() {
      return this._autoSkipEnabled;
    }

    // Skip all remaining dialogue (used by skip button and long-press)
    skipAll() {
      if (!this._isPlaying) return;

      // Check if we need to show confirmation
      if (!this._skipConfirmationShown && !this._getSkipPrefs().skipConfirmed) {
        this._showSkipConfirmation();
        return;
      }

      this._doSkip();
    }

    _doSkip() {
      // Mark scene as read
      if (this._sceneKey) {
        this._markSceneRead(this._sceneKey);
      }

      // Stop everything and jump to end
      this._stopTypewriter();
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(30);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._queue = [];
      this._isPlaying = false;
      this._currentDialogue = null;

      this._hideSkipButton();
      this._cancelLongPress();
      this._hideAll();

      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // === Typewriter ===

    _stopTypewriter() {
      if (this._typewriterTimer) {
        clearTimeout(this._typewriterTimer);
        this._typewriterTimer = null;
      }
      this._isTyping = false;
    }

    _completeTypewriter() {
      this._stopTypewriter();
      // Show full text immediately
      const textEl = document.getElementById('dlg-text') || document.getElementById('narrator-text');
      if (textEl && this._currentText) {
        textEl.textContent = this._currentText;
      }
      this._isTyping = false;
    }

    _typewrite(element, text, speed, callback) {
      // Apply auto fast-forward if scene is read
      let actualSpeed = speed;
      if (this._autoSkipEnabled && this._isCurrentSceneRead && speed > 0) {
        actualSpeed = Math.max(2, Math.floor(speed / 2)); // 2x speed
      }

      this._stopTypewriter();
      this._currentText = text;
      this._isTyping = true;
      let idx = 0;

      const type = () => {
        if (idx >= text.length) {
          this._isTyping = false;
          this._typewriterTimer = null;
          if (callback) callback();
          return;
        }
        const ch = text[idx];
        element.textContent += ch;
        idx++;
        // Play typewriter sound every 3 characters (skip spaces)
        if (ch !== ' ' && ch !== '\u3000' && idx % 3 === 0) {
          if (typeof AudioService !== 'undefined') {
            AudioService.sfx.play('playTypewriterKey');
          }
        }
        // Random variation for natural feel
        const delay = actualSpeed + (Math.random() * 15 - 7);
        this._typewriterTimer = setTimeout(type, delay);
      };
      type();
    }

    // === Internal ===

    _playNext() {
      this._stopTypewriter();
      // Reset sync state for new line
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      if (this._queue.length === 0) {
        this._endScene();
        return;
      }

      const line = this._queue.shift();
      this._currentDialogue = line;

      // Handle background change
      if (line.bg) {
        this._changeBg(line.bg);
      }

      // Handle title card
      if (line.type === 'title') {
        this._showTitleCard(line.text, line.subtitle);
        return;
      }

      // Handle item display
      if (line.item) {
        this._showItem(line.item);
      }

      // Handle explicit SFX (non-typewriter)
      if (line.sfx && line.sfx !== 'playTypewriterKey') {
        if (typeof AudioService !== 'undefined') {
          AudioService.sfx.play(line.sfx);
        }
      }

      // Handle narration
      if (line.isNarration || !line.speaker) {
        this._showNarrator(line.text);
        return;
      }

      // Handle character dialogue
      this._showDialogue(line);
    }

    _endScene() {
      this._stopTypewriter();
      // Stop any playing voice
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(100);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._isPlaying = false;
      this._currentDialogue = null;

      // Mark scene as read
      if (this._sceneKey) {
        this._markSceneRead(this._sceneKey);
      }

      this._hideSkipButton();
      this._cancelLongPress();
      this._hideAll();
      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // === Line Conversion ===

    _convertLine(line) {
      if (typeof line === 'string') {
        return { text: line, isNarration: true };
      }
      const speaker = line.speaker || '';
      const charId = this._speakerToCharId(speaker);
      return {
        speaker, charId,
        text: line.text || '',
        emotion: line.emotion || 'default',
        side: line.side || (charId && CHAR_SIDE[charId]) || 'right',
        effect: line.effect || 0,
        bg: line.bg || null,
        sfx: line.sfx || null,
        item: line.item || null,
        voiceId: line.voiceId || null,
        isNarration: line.isNarration || !charId,
        type: line.type || null,
        subtitle: line.subtitle || null,
      };
    }

    _speakerToCharId(speaker) {
      const map = {
        '沈墨': 'shenmo', '阿妍': 'ayan', '莹莹': 'ying',
        '守笼人': 'cagekeeper', '设局人': 'plotter',
      };
      return map[speaker] || null;
    }

    // === Display Methods ===

    _showTitleCard(title, subtitle) {
      this._initTitleCard();
      this._titleCardEl.style.display = 'flex';
      document.getElementById('tc-title').textContent = title || '';
      document.getElementById('tc-subtitle').textContent = subtitle || '';
      setTimeout(() => {
        this._titleCardEl.style.opacity = '0';
        setTimeout(() => {
          this._titleCardEl.style.display = 'none';
          this._playNext();
        }, 500);
      }, 2500);
    }

    _showNarrator(text) {
      this._hidePortrait();
      this._hideBubble();
      this._initNarrator();
      this._narratorEl.style.display = 'flex';
      this._narratorEl.textContent = ''; // Clear previous text
      // Typewriter effect for narration
      const speed = TYPING_SPEEDS.normal;
      this._typewrite(this._narratorEl, text, speed, () => {
        this._typewriterFinished = true;
      });
    }

    _showDialogue(line) {
      this._hideNarrator();
      this._initBubble();
      this._initPortrait();

      // Show portrait with fade transition
      if (line.charId) {
        const portraitFile = this._getPortraitFile(line.charId, line.emotion);
        if (portraitFile) {
          this._showPortraitWithFade(portraitFile, line.side);
        }
      } else {
        this._hidePortrait();
      }

      // Show bubble with name
      this._bubbleEl.style.display = 'block';
      const nameEl = document.getElementById('dlg-name');
      const textEl = document.getElementById('dlg-text');
      if (nameEl) nameEl.textContent = line.speaker || '';
      if (textEl) textEl.textContent = '';

      // Calculate typing speed
      const baseSpeed = emotionSpeed(line.emotion);

      // Play VO and sync with typewriter
      const hasVoice = line.voiceId && typeof AudioService !== 'undefined';

      if (hasVoice) {
        this._voicePlaying = true;
        this._voiceFinished = false;

        // Preload voice to get accurate duration for speed sync
        AudioService.voice.play(line.voiceId, {
          onended: () => {
            this._voicePlaying = false;
            this._voiceFinished = true;
            // If typewriter is still running when voice ends, complete it instantly
            if (this._isTyping) {
              this._completeTypewriter();
            }
          },
          fadeInMs: 50,
        });

        // Start typewriter at a moderate speed; voice onended will snap it to complete
        this._typewrite(textEl, line.text, baseSpeed, () => {
          this._typewriterFinished = true;
        });
      } else {
        // No voice: just type at normal speed
        this._typewrite(textEl, line.text, baseSpeed, () => {
          this._typewriterFinished = true;
        });
      }
    }

    _showItem(itemId) {
      this._initItem();
      const itemMap = {
        'file-k734': 'item_letter_k734.jpg',
        'letter_k734': 'item_letter_k734.jpg',
      };
      const file = itemMap[itemId] || itemId;
      this._itemEl.style.backgroundImage = `url('assets/images/items/${file}')`;
      this._itemEl.style.display = 'flex';
      setTimeout(() => { this._itemEl.style.display = 'none'; }, 2500);
    }

    _changeBg(bgValue) {
      if (bgValue === this._currentBg) return;
      this._currentBg = bgValue;
      const body = document.body;
      const app = document.getElementById('app');
      let url = bgValue;
      if (!bgValue.startsWith('http') && !bgValue.startsWith('url(') && !bgValue.startsWith('assets/')) {
        url = BG_DIR + bgValue;
      }
      const cssUrl = `url('${url}')`;

      // Fade transition: briefly darken, swap bg, fade back
      const fadeDuration = 400;
      if (body) {
        body.style.transition = `filter ${fadeDuration}ms ease`;
        body.style.filter = 'brightness(0)';
        setTimeout(() => {
          body.style.backgroundImage = cssUrl;
          body.style.backgroundSize = 'cover';
          body.style.backgroundPosition = 'center';
          // Force reflow
          void body.offsetWidth;
          body.style.filter = 'brightness(1)';
          // Clean up transition after animation
          setTimeout(() => {
            body.style.transition = '';
            body.style.filter = '';
          }, fadeDuration);
        }, fadeDuration);
      }
      if (app) {
        app.style.backgroundImage = cssUrl;
        app.style.backgroundSize = 'cover';
        app.style.backgroundPosition = 'center';
        app.style.background = 'transparent';
      }
    }

    _getPortraitFile(charId, emotion) {
      const map = PORTRAIT_MAP[charId];
      if (!map) return null;
      return map[emotion] || map.default || null;
    }

    _showPortraitWithFade(portraitFile, side) {
      if (!this._portraitEl) return;

      const isLeft = side === 'left';
      const newBg = `url('${PORTRAIT_DIR}${portraitFile}.png')`;

      // If portrait is already visible, cross-fade
      if (this._portraitEl.style.display === 'block' && this._portraitEl.style.opacity !== '0') {
        // Fade out, swap image, fade in
        this._portraitEl.style.transition = 'opacity 0.25s ease';
        this._portraitEl.style.opacity = '0';
        setTimeout(() => {
          this._portraitEl.style.backgroundImage = newBg;
          this._portraitEl.style.left = isLeft ? '10px' : '';
          this._portraitEl.style.right = isLeft ? '' : '10px';
          this._portraitEl.style.setProperty('--flip-x', isLeft ? '-1' : '1');
          // Force reflow then fade in
          void this._portraitEl.offsetWidth;
          this._portraitEl.style.opacity = '1';
        }, 250);
      } else {
        // Fresh display: set image then fade in
        this._portraitEl.style.backgroundImage = newBg;
        this._portraitEl.style.left = isLeft ? '10px' : '';
        this._portraitEl.style.right = isLeft ? '' : '10px';
        this._portraitEl.style.setProperty('--flip-x', isLeft ? '-1' : '1');
        this._portraitEl.style.opacity = '0';
        this._portraitEl.style.display = 'block';
        this._portraitEl.style.transition = 'opacity 0.3s ease';
        // Force reflow
        void this._portraitEl.offsetWidth;
        this._portraitEl.style.opacity = '1';
      }
    }

    _hidePortrait() {
      if (!this._portraitEl) return;
      if (this._portraitEl.style.display === 'none' || this._portraitEl.style.opacity === '0') {
        this._portraitEl.style.display = 'none';
        return;
      }
      this._portraitEl.style.transition = 'opacity 0.25s ease';
      this._portraitEl.style.opacity = '0';
      setTimeout(() => {
        if (this._portraitEl) {
          this._portraitEl.style.display = 'none';
        }
      }, 250);
    }
    _hideBubble() {
      if (!this._bubbleEl) return;
      if (this._bubbleEl.style.display === 'none') return;
      this._bubbleEl.style.transition = 'opacity 0.2s ease';
      this._bubbleEl.style.opacity = '0';
      setTimeout(() => {
        if (this._bubbleEl) {
          this._bubbleEl.style.display = 'none';
          this._bubbleEl.style.opacity = '';
          this._bubbleEl.style.transition = '';
        }
      }, 200);
    }
    _hideNarrator() {
      if (!this._narratorEl) return;
      if (this._narratorEl.style.display === 'none') return;
      this._narratorEl.style.transition = 'opacity 0.25s ease';
      this._narratorEl.style.opacity = '0';
      setTimeout(() => {
        if (this._narratorEl) {
          this._narratorEl.style.display = 'none';
          this._narratorEl.style.opacity = '';
          this._narratorEl.style.transition = '';
        }
      }, 250);
    }
    _hideAll() {
      this._hidePortrait(); this._hideBubble(); this._hideNarrator();
      if (this._titleCardEl) this._titleCardEl.style.display = 'none';
      if (this._itemEl) this._itemEl.style.display = 'none';
    }

    // === Skip Button ===

    _showSkipButton() {
      this._initSkipButton();
      if (!this._skipBtnEl) return;
      this._skipBtnEl.style.display = 'flex';
      // Fade in
      requestAnimationFrame(() => {
        this._skipBtnEl.style.opacity = '1';
      });
    }

    _hideSkipButton() {
      if (!this._skipBtnEl) return;
      this._skipBtnEl.style.opacity = '0';
      setTimeout(() => {
        if (this._skipBtnEl) {
          this._skipBtnEl.style.display = 'none';
        }
      }, 200);
    }

    _initSkipButton() {
      if (this._skipBtnEl) return;

      const btn = document.createElement('div');
      btn.id = 'story-skip-btn';
      btn.style.cssText = 'position:absolute;top:12px;right:16px;' +
        'padding:4px 12px;background:rgba(251,191,36,0.15);' +
        'border:1px solid rgba(251,191,36,0.4);border-radius:16px;' +
        'color:#fbbf24;font-size:12px;cursor:pointer;' +
        'z-index:10002;display:none;opacity:0;' +
        'transition:opacity 0.3s ease, background 0.2s, border-color 0.2s;' +
        'letter-spacing:1px;user-select:none;-webkit-user-select:none;';
      btn.innerHTML = '跳过 ▶▶';

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.skipAll();
      });

      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(251,191,36,0.3)';
        btn.style.borderColor = 'rgba(251,191,36,0.6)';
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(251,191,36,0.15)';
        btn.style.borderColor = 'rgba(251,191,36,0.4)';
      });

      // 确保对话框已创建，然后把跳过按钮放到对话框内部
      this._initBubble();
      if (this._bubbleEl) {
        this._bubbleEl.style.position = 'fixed';
        this._bubbleEl.appendChild(btn);
      } else {
        document.body.appendChild(btn);
      }
      this._skipBtnEl = btn;

      // Also set up long-press detection on the document
      this._setupLongPress();
    }

    // === Long Press Skip ===

    _setupLongPress() {
      // Long press on dialogue bubble or narrator to skip
      const self = this;

      function onPointerDown(e) {
        if (!self._isPlaying) return;
        // Don't trigger on skip button itself or other interactive elements
        if (e.target.closest('#story-skip-btn, button, .num-btn, #num-pad, #chapter-select-overlay')) return;
        // Only trigger on dialogue/narrator area
        if (!e.target.closest('#dialogue-bubble, #narrator-text, #story-portrait')) return;

        self._startLongPress(e);
      }

      function onPointerUp(e) {
        self._cancelLongPress();
      }

      function onPointerMove(e) {
        if (self._isLongPressing) {
          // If moved too much, cancel
          const dx = e.clientX - self._longPressStartX;
          const dy = e.clientY - self._longPressStartY;
          if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
            self._cancelLongPress();
          }
        }
      }

      document.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      document.addEventListener('pointerleave', onPointerUp);
      document.addEventListener('pointermove', onPointerMove);
    }

    _startLongPress(e) {
      if (this._isLongPressing) return;
      this._isLongPressing = true;
      this._longPressStart = Date.now();
      this._longPressStartX = e.clientX;
      this._longPressStartY = e.clientY;

      this._showLongPressProgress(e.clientX, e.clientY);

      const self = this;
      this._longPressTimer = setInterval(() => {
        const elapsed = Date.now() - self._longPressStart;
        const pct = Math.min(100, (elapsed / self._longPressDuration) * 100);
        self._updateLongPressProgress(pct);

        if (elapsed >= self._longPressDuration) {
          self._completeLongPress();
        }
      }, 16);
    }

    _cancelLongPress() {
      if (!this._isLongPressing) return;
      this._isLongPressing = false;
      if (this._longPressTimer) {
        clearInterval(this._longPressTimer);
        this._longPressTimer = null;
      }
      this._hideLongPressProgress();
    }

    _completeLongPress() {
      if (this._longPressTimer) {
        clearInterval(this._longPressTimer);
        this._longPressTimer = null;
      }
      this._isLongPressing = false;
      this._hideLongPressProgress();
      this.skipAll();
    }

    _showLongPressProgress(x, y) {
      let el = document.getElementById('long-press-progress');
      if (!el) {
        el = document.createElement('div');
        el.id = 'long-press-progress';
        el.style.cssText = 'position:fixed;width:80px;height:80px;' +
          'border-radius:50%;pointer-events:none;z-index:10003;' +
          'display:none;transform:translate(-50%,-50%);';
        el.innerHTML =
          '<svg width="80" height="80" viewBox="0 0 80 80">' +
          '<circle cx="40" cy="40" r="36" fill="none" stroke="rgba(251,191,36,0.2)" stroke-width="4"/>' +
          '<circle id="lp-progress-ring" cx="40" cy="40" r="36" fill="none" stroke="#fbbf24" stroke-width="4"' +
          ' stroke-dasharray="226" stroke-dashoffset="226" stroke-linecap="round"' +
          ' transform="rotate(-90 40 40)"/>' +
          '</svg>' +
          '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
          'font-size:10px;color:#fbbf24;letter-spacing:1px;">跳过</div>';
        document.body.appendChild(el);
      }
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.display = 'block';
      this._longPressProgressEl = el;
    }

    _updateLongPressProgress(pct) {
      if (!this._longPressProgressEl) return;
      const ring = this._longPressProgressEl.querySelector('#lp-progress-ring');
      if (ring) {
        const circumference = 2 * Math.PI * 36; // ~226
        const offset = circumference * (1 - pct / 100);
        ring.style.strokeDashoffset = offset;
      }
    }

    _hideLongPressProgress() {
      if (this._longPressProgressEl) {
        this._longPressProgressEl.style.display = 'none';
      }
    }

    // === Skip Confirmation ===

    _showSkipConfirmation() {
      const existing = document.getElementById('skip-confirmation');
      if (existing) return;

      const overlay = document.createElement('div');
      overlay.id = 'skip-confirmation';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.7);z-index:25000;' +
        'display:flex;align-items:center;justify-content:center;' +
        'backdrop-filter:blur(4px);';

      const dialog = document.createElement('div');
      dialog.style.cssText = 'background:linear-gradient(180deg,#1e293b,#0f172a);' +
        'border:1px solid rgba(251,191,36,0.3);border-radius:16px;' +
        'padding:32px;max-width:380px;width:90%;text-align:center;' +
        'box-shadow:0 20px 60px rgba(0,0,0,0.5);';

      dialog.innerHTML =
        '<div style="font-size:32px;margin-bottom:16px;">⏭️</div>' +
        '<div style="font-size:18px;font-weight:700;color:#f1f5f9;' +
        'margin-bottom:12px;letter-spacing:1px;">确定要跳过这段剧情吗？</div>' +
        '<div style="font-size:13px;color:#94a3b8;margin-bottom:24px;line-height:1.6;">' +
        '跳过之后将无法回看这段剧情内容。<br>建议首次游玩时完整观看。</div>' +
        '<label style="display:flex;align-items:center;justify-content:center;' +
        'gap:8px;margin-bottom:24px;cursor:pointer;font-size:13px;color:#64748b;">' +
        '<input type="checkbox" id="skip-dont-show-again" style="accent-color:#fbbf24;">' +
        '不再提示</label>' +
        '<div style="display:flex;gap:12px;justify-content:center;">' +
        '<button id="skip-cancel-btn" style="padding:10px 24px;border:1px solid #334155;' +
        'background:#1e293b;color:#94a3b8;border-radius:8px;cursor:pointer;' +
        'font-size:14px;transition:all 0.2s;">取消</button>' +
        '<button id="skip-confirm-btn" style="padding:10px 24px;border:1px solid #fbbf24;' +
        'background:rgba(251,191,36,0.15);color:#fbbf24;border-radius:8px;' +
        'cursor:pointer;font-size:14px;font-weight:600;transition:all 0.2s;">确认跳过</button>' +
        '</div>';

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const self = this;

      document.getElementById('skip-cancel-btn').addEventListener('click', () => {
        overlay.remove();
      });

      document.getElementById('skip-confirm-btn').addEventListener('click', () => {
        const dontShow = document.getElementById('skip-dont-show-again').checked;
        if (dontShow) {
          self._setSkipConfirmed();
        }
        overlay.remove();
        self._doSkip();
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
        }
      });
    }

    // === Read History / Auto Skip ===

    _loadReadHistory() {
      try {
        const raw = localStorage.getItem(READ_STORAGE_KEY);
        if (raw) {
          this._readHistory = JSON.parse(raw);
        } else {
          this._readHistory = {};
        }
      } catch (e) {
        this._readHistory = {};
      }
    }

    _saveReadHistory() {
      try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(this._readHistory));
      } catch (e) {}
    }

    _checkSceneRead() {
      if (!this._sceneKey) {
        this._isCurrentSceneRead = false;
        return;
      }
      this._isCurrentSceneRead = this._readHistory[this._sceneKey] === true;
    }

    _markSceneRead(key) {
      if (!key) return;
      if (this._readHistory[key]) return; // already marked
      this._readHistory[key] = true;
      this._saveReadHistory();
    }

    _getReadHistory() {
      return this._readHistory;
    }

    // === Skip Preferences ===

    _loadSkipPrefs() {
      try {
        const raw = localStorage.getItem(SKIP_STORAGE_KEY);
        if (raw) {
          const prefs = JSON.parse(raw);
          this._skipConfirmationShown = prefs.skipConfirmed === true;
          if (typeof prefs.autoSkipEnabled === 'boolean') {
            this._autoSkipEnabled = prefs.autoSkipEnabled;
          }
        }
      } catch (e) {}
    }

    _saveSkipPrefs() {
      try {
        const prefs = this._getSkipPrefs();
        localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(prefs));
      } catch (e) {}
    }

    _getSkipPrefs() {
      try {
        const raw = localStorage.getItem(SKIP_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { skipConfirmed: false, autoSkipEnabled: true };
    }

    _setSkipConfirmed() {
      const prefs = this._getSkipPrefs();
      prefs.skipConfirmed = true;
      prefs.autoSkipEnabled = this._autoSkipEnabled;
      try {
        localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(prefs));
        this._skipConfirmationShown = true;
      } catch (e) {}
    }

    // === DOM Initialization ===

    _initPortrait() {
      if (this._portraitEl) return;
      this._portraitEl = document.createElement('div');
      this._portraitEl.id = 'story-portrait';
      this._portraitEl.style.cssText = 'position:fixed;right:10px;bottom:80px;width:280px;height:420px;background-size:contain;background-repeat:no-repeat;background-position:bottom right;z-index:9999;display:none;transition:opacity 0.3s;--flip-x:1;transform:scaleX(var(--flip-x));';
      document.body.appendChild(this._portraitEl);
    }

    _initBubble() {
      if (this._bubbleEl) return;
      this._bubbleEl = document.createElement('div');
      this._bubbleEl.id = 'dialogue-bubble';
      this._bubbleEl.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:92%;max-width:650px;background:rgba(15,23,42,0.95);border:1px solid rgba(251,191,36,0.3);border-radius:12px;padding:18px 22px;z-index:10000;display:none;color:#f1f5f9;font-size:17px;line-height:1.7;min-height:60px;';
      this._bubbleEl.innerHTML = '<div id="dlg-name" style="color:#fbbf24;font-weight:bold;margin-bottom:10px;font-size:15px;padding-right:70px;"></div><div id="dlg-text" style="min-height:26px;"></div><div style="text-align:right;font-size:12px;color:#64748b;margin-top:10px;">▼ 点击继续</div>';
      this._bubbleEl.addEventListener('click', () => this.nextDialogue());
      document.body.appendChild(this._bubbleEl);
    }

    _initNarrator() {
      if (this._narratorEl) return;
      this._narratorEl = document.createElement('div');
      this._narratorEl.id = 'narrator-text';
      this._narratorEl.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);width:90%;max-width:600px;text-align:center;color:#e2e8f0;font-size:18px;font-style:italic;z-index:10000;display:none;line-height:1.8;min-height:40px;';
      this._narratorEl.addEventListener('click', () => this.nextDialogue());
      document.body.appendChild(this._narratorEl);
    }

    _initTitleCard() {
      if (this._titleCardEl) return;
      this._titleCardEl = document.createElement('div');
      this._titleCardEl.id = 'story-title-card';
      this._titleCardEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(15,23,42,0.95) 0%,rgba(0,0,0,0.98) 100%);z-index:10001;pointer-events:none;opacity:1;transition:opacity 0.5s;';
      this._titleCardEl.innerHTML = '<div id="tc-title" style="font-size:48px;font-weight:900;color:#fbbf24;text-shadow:0 0 30px rgba(251,191,36,0.5);font-family:Impact,sans-serif;letter-spacing:12px;"></div><div id="tc-subtitle" style="font-size:18px;color:#94a3b8;margin-top:16px;letter-spacing:4px;opacity:0.7;"></div>';
      document.body.appendChild(this._titleCardEl);
    }

    _initItem() {
      if (this._itemEl) return;
      this._itemEl = document.createElement('div');
      this._itemEl.id = 'story-item';
      this._itemEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:300px;height:300px;background-size:contain;background-repeat:no-repeat;background-position:center;z-index:10001;display:none;filter:drop-shadow(0 0 40px rgba(255,215,0,0.3));';
      document.body.appendChild(this._itemEl);
    }
  }

  global.StoryEngine = new StoryEngine();
})(window);
