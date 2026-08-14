// AudioService - Unified audio layer
// Single entry point for all audio operations
// ============================================================
//  音效命名规范与用途
// ============================================================
// 核心玩法: click, fill_correct, fill_wrong, erase, note_toggle, select
// 进阶反馈: success, error, eureka, breakthrough, victory_short/full
// 三幕引导: act_open (合成), act_breakthrough (合成), avalanche_start (合成)
// UI过渡:   paper_flip, book_flip, seal_unlock, notification, reveal
// 连击系统: combo_1, combo_2, combo_3, combo_max
// 环境音:   typewriter, ambient_wind, thunder
// ============================================================

'use strict';


const SFX_DIR = 'assets/audio/sfx/';
const VOICE_DIR = 'assets/audio/voice/';
const BGM_DIR = 'assets/audio/bgm/';

// V4.3.28（P1）：BGM BPM 元数据表（时序层 BeatQuantizer 节拍对齐用）
// 文件名 → BPM（无官方标定，按曲风设定合理节拍；未知回退 120）
const BGM_BPM_MAP = {
  'intro': 96,
  'chapter_1': 100,
  'chapter_2': 105,
  'chapter_3': 108,
  'chapter_4': 112,
  'chapter_5': 116,
  'chapter_6': 120,
  'chapter_7': 124,
  'boss_battle': 132,
  'eureka': 128,
  'ending_circle1': 90,
  'ending_circle2': 88,
  'ending_circle3': 92,
  'ending_true': 84,
};

// 角色代码到子目录的映射（全量配音后每个角色有独立目录）
const VOICE_CHAR_MAP = {
  'CK': 'CK',   // 伊藤
  'J': 'J',     // 薇拉
  'N': 'N',     // 旁白
  'P': 'P',     // 老师
  'PS': 'PS',   // 老师（残影）
  'R': 'R',     // 山田
  'RE': 'RE',   // 档案
  'S': 'S',     // 系统
  'SM': 'SM',   // 沈墨
  'SS': 'SS',   // 老师（秘术）
  'U': 'U',     // 你
  'W': 'W',     // 档案
};

const VOLUME_KEY = 'audio_volume_settings';
const DEFAULT_VOLUMES = {
  master: 0.7,
  sfx: 0.6,
  voice: 0.85,
  bgm: 0.4,
};

// SFX name mapping (friendly name -> actual file)
// 优先使用MP3（来自NEO收集，音质更好），合成音效使用WAV
const SFX_MAP = {
  // Core gameplay
  'click': 'click.wav',
  'fill_correct': 'fill_correct.mp3',
  'fill_wrong': 'fill_wrong.mp3',
  'erase': 'erase.wav',
  'note_toggle': 'note_toggle.mp3',
  'hint': 'hint.wav',
  'select': 'click.wav',
  'cage_highlight': 'hover.wav',
  'hover': 'hover.wav',

  // Progression & rewards
  'success': 'success.mp3',
  'error': 'error.wav',
  'eureka': 'eureka.wav',
  'breakthrough': 'breakthrough.wav',
  'victory': 'victory_short.mp3',
  'victory_short': 'victory_short.mp3',
  'victory_full': 'victory_full.mp3',
  'victory_true': 'victory_true.mp3',
  'achievement': 'achievement.wav',
  'notification': 'notification.wav',
  'reveal': 'reveal.wav',

  // UI & transitions
  'paper_flip': 'paper_flip.mp3',
  'book_flip': 'book_flip.wav',
  'book_open': 'book_open.mp3',
  'seal_unlock': 'seal_unlock.mp3',
  'seal_stamp': 'seal_stamp.mp3',
  'key_unlock': 'key_unlock.wav',
  'chain_pop': 'chain_pop.wav',
  'portrait_tap': 'portrait_tap.wav',
  'portrait_slam': 'portrait_slam.wav',
  'dialog_advance': 'dialog_advance.wav',

  // Environment & atmosphere
  'door_open': 'door_open.mp3',
  'door_final_open': 'door_final_open.mp3',
  'door_stone_open': 'door_stone_open.mp3',
  'door_open_light': 'door_open_light.mp3',
  'footstep': 'footstep.wav',
  'footstep_wood': 'footstep_wood.mp3',
  'footstep_stone': 'footstep_stone.mp3',
  'footstep_hall': 'footstep_hall.mp3',
  'footstep_hall_2': 'footstep_hall_2.mp3',
  'footstep_fading': 'footstep_fading.mp3',
  'footstep_run_light': 'footstep_run_light.mp3',
  'chair_move': 'chair_move.mp3',
  'typewriter': 'typewriter.mp3',
  'ambient_wind': 'ambient_wind.mp3',
  'thunder': 'thunder.wav',
  'thinking': 'thinking.wav',
  'sigh': 'sigh.wav',
  'lamp_click': 'lamp_click.mp3',
  'electronic_pulse': 'electronic_pulse.mp3',
  'seal_glow': 'seal_glow.mp3',
  'paper_fold': 'paper_fold.mp3',
  'paper_tear': 'paper_tear.mp3',
  'pen_write_fast': 'pen_write_fast.mp3',

  // Combo system
  'combo_1': 'combo_1.wav',
  'combo_2': 'combo_2.wav',
  'combo_3': 'combo_3.wav',
  'combo_max': 'combo_max.wav',

  // Rating
  'rating_s': 'rating_s.wav',
  'rating_a': 'rating_a.wav',
  'rating_b': 'rating_b.wav',
  'rating_c': 'rating_c.wav',

  // Emotions
  'emotion_angry': 'emotion_angry.wav',
  'emotion_sad': 'emotion_sad.wav',
  'emotion_smirk': 'emotion_smirk.wav',
  'emotion_surprise': 'emotion_surprise.wav',

  // Typewriter key (single key strike - short, punchy)
  'typewriter_key': 'click.wav',
  // Typewriter ambient (longer sequence - for scene ambience)
  'typewriter': 'typewriter.mp3',
  // Legacy aliases (backward compatibility)
  'playDoorOpen': 'door_open.mp3',
  'playFootstep': 'footstep_hall.mp3',
  'playTypewriterKey': 'typewriter_key',

  // 剧本原始文件名别名（2026-08-03：剧本写 .wav 而资源为 .mp3，避免 404）
  'door_open.wav': 'door_open.mp3',
  'ambient_wind.wav': 'ambient_wind.mp3',
  'footstep_hall.wav': 'footstep_hall.mp3',
  'door_open': 'door_open.mp3',
  'footstep_hall': 'footstep_hall.mp3',
  'footstep_hall_2': 'footstep_hall_2.mp3',
  'chair_move': 'chair_move.mp3',
  'paper_flip': 'paper_flip.mp3',
  'pen_write_fast': 'pen_write_fast.mp3',
  'pen_write': 'NEO/pen_write.mp3',
  'lamp_click': 'lamp_click.mp3',
  // 剧本中文演出关键词
  '轻快小跑脚步': 'footstep_run_light.mp3',
  '笔尖沙沙声': 'pen_write_fast.mp3',
  '脚步声': 'footstep.wav',
  '开门声': 'door_open.mp3',
  '关门声': 'door_stone_open.mp3',
  '风铃声': 'ambient_wind.mp3',

  // ===== NEO 新音效（2026-08-03 挂载，NEO 子目录独有）=====
  'ambient_hall': 'NEO/ambient_hall.mp3',
  'note_toggle_on': 'NEO/note_toggle_on.mp3',
  'note_toggle_off': 'NEO/note_toggle_off.mp3',
  'paper_unfold': 'NEO/paper_unfold.mp3',
  'pen_write': 'NEO/pen_write.mp3',
  'seal_breaking': 'NEO/seal_breaking.mp3',
  'victory_electric': 'NEO/victory_electric.mp3',
};

class AudioService {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.voiceGain = null;
    this.bgmGain = null;
    this.bgmFilter = null;
    this.enabled = true;
    this.sfxEnabled = true;
    this.bgmEnabled = true;
    this.bgmPlaying = false;
    this._currentBgm = null;
    this._currentIntensity = 'Normal';
    this._audioEl = null;
    this._unlocked = false;
    this._pendingBgm = null;
    this._pendingBgmOptions = null;

    // BGM Web Audio state
    this._bgmTrack = null;       // { el, source, gain, path } — current active BGM track
    this._bgmFadingOut = [];     // array of tracks currently fading out

    // Ducking state
    this._duckingActive = false;
    this._sfxGainBeforeDuck = 0;
    this._bgmGainBeforeDuck = 0;

    // SFX state (Web Audio based)
    this._sfxCache = new Map();
    this._sfxSources = new Set();

    // Typewriter key choke group (stop previous key when new one plays)
    this._lastTypewriterKeyGain = null;
    this._lastTypewriterKeyTime = 0;
    this._typewriterKeyCooldown = 45; // ms minimum between key sounds

    // Voice state (Web Audio based)
    this._voiceSource = null;
    this._voiceGainNode = null;
    this._voiceCache = new Map();
    this._voiceOnEnded = null;
    this._voiceStopping = false;

    // Voice index (loaded from voice_index.json for duration lookup)
    this._voiceIndex = null;
    this._voiceIndexLoaded = false;
    this._loadVoiceIndex();

    // Volume settings
    this._volumes = this._loadVolumes();

    // Robustness: degradation flag & timer tracking
    this._webAudioInitAttempted = false;
    this._webAudioSupported = false;
    this._activeTimers = new Set();
  }

  // --- Timer safety & degradation helpers ---
  _setSafeTimeout(fn, delay) {
    const timerId = setTimeout(() => {
      this._activeTimers.delete(timerId);
      try { fn(); } catch(e) {
        console.debug('[AudioService] Timer callback error:', e.message);
      }
    }, delay);
    this._activeTimers.add(timerId);
    return timerId;
  }

  _clearSafeTimeout(timerId) {
    if (timerId != null) {
      clearTimeout(timerId);
      this._activeTimers.delete(timerId);
    }
  }

  _isAudioContextReady() {
    return this.ctx !== null && this._webAudioSupported;
  }

  init() {
    if (this.ctx) return;
    if (this._webAudioInitAttempted) return;
    this._webAudioInitAttempted = true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._volumes.master;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this._volumes.sfx;
      this.sfxGain.connect(this.masterGain);

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = this._volumes.voice;
      this.voiceGain.connect(this.masterGain);

      this.bgmFilter = this.ctx.createBiquadFilter();
      this.bgmFilter.type = 'lowpass';
      this.bgmFilter.frequency.value = 20000;
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this._volumes.bgm;
      this.bgmFilter.connect(this.bgmGain);
      this.bgmGain.connect(this.masterGain);

      console.log('[AudioService] Initialized');
      this._webAudioSupported = true;

      // Preload commonly used SFX
      this._preloadCommonSfx();
    } catch(e) {
      console.warn('[AudioService] Web Audio not supported:', e);
      this.enabled = false;
      this._webAudioSupported = false;
    }
  }

  resume() {
    try {
      if (this.ctx && this.ctx.state === 'suspended') {
        // 手势解锁前不尝试恢复 AudioContext：
        // Chrome autoplay 策略下非手势 resume 会报 "AudioContext was not allowed to start"
        // 解锁由 unlock() 在首次用户手势内完成
        if (!this._unlocked) {
          return Promise.resolve();
        }
        const p = this.ctx.resume();
        return p || Promise.resolve();
      }
    } catch(e) {
      console.debug('[AudioService] resume failed:', e.message);
    }
    return Promise.resolve();
  }

  // === Volume Control ===
  setVolume(type, value) {
    try {
      if (!DEFAULT_VOLUMES.hasOwnProperty(type)) return;
      value = Math.max(0, Math.min(1, value));
      this._volumes[type] = value;
      this._saveVolumes();

      if (this.ctx) {
        const now = this.ctx.currentTime;
        if (type === 'master' && this.masterGain) {
          this.masterGain.gain.linearRampToValueAtTime(value, now + 0.05);
        } else if (type === 'sfx' && this.sfxGain) {
          const target = this._duckingActive ? value * 0.5 : value;
          this.sfxGain.gain.cancelScheduledValues(now);
          this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
          this.sfxGain.gain.linearRampToValueAtTime(target, now + 0.05);
          // Update duck baseline so restoration returns to the new volume
          if (this._duckingActive) {
            this._sfxGainBeforeDuck = value;
          }
        } else if (type === 'voice' && this.voiceGain) {
          this.voiceGain.gain.linearRampToValueAtTime(value, now + 0.05);
        } else if (type === 'bgm' && this.bgmGain) {
          const target = this._duckingActive ? value * 0.7 : value;
          this.bgmGain.gain.cancelScheduledValues(now);
          this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
          this.bgmGain.gain.linearRampToValueAtTime(target, now + 0.05);
          // Update duck baseline so restoration returns to the new volume
          if (this._duckingActive) {
            this._bgmGainBeforeDuck = value;
          }
        }
      }
    } catch(e) {
      console.debug('[AudioService] setVolume failed:', e.message);
    }
  }

  getVolume(type) {
    if (!DEFAULT_VOLUMES.hasOwnProperty(type)) return 1;
    return this._volumes[type];
  }

  _loadVolumes() {
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Object.assign({}, DEFAULT_VOLUMES, parsed);
      }
    } catch(e) {}
    return Object.assign({}, DEFAULT_VOLUMES);
  }

  _saveVolumes() {
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify(this._volumes));
    } catch(e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[AudioService] Storage quota exceeded on volume save');
      }
    }
  }

  // === SFX ===
  sfx = {
    isSupported: () => this._isAudioContextReady(),

    play: (name, options) => {
      try {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        options = options || {};
        const volume = (options.volume !== undefined) ? options.volume : 1;

        const file = SFX_MAP[name] || name;
        // NEO 子目录音效（SFX_MAP 值含 '/'，如 'NEO/ambient_hall.mp3'）
        const path = (file.includes('/') || file.includes('.')) ? SFX_DIR + file : SFX_DIR + file + '.wav';

        // Typewriter: play with choke (stop previous key to avoid buildup)
        if (name === 'playTypewriterKey' || name === 'typewriter_key') {
          this._playTypewriterKey(volume);
        } else if (name === 'typewriter') {
          this._playTypewriterBurst(path, volume);
        } else {
          this._playSfxBuffer(name, path, { volume: volume });
        }
      } catch(e) {
        console.debug('[AudioService] sfx.play failed:', name, e.message);
      }
    },
    doorOpen: () => { try { this.sfx.play('door_open'); } catch(e) { console.debug('[AudioService] sfx.doorOpen failed:', e.message); } },
    footstep: () => { try { this.sfx.play('footstep'); } catch(e) { console.debug('[AudioService] sfx.footstep failed:', e.message); } },
    typewriterBurst: () => { try { this.sfx.play('typewriter'); } catch(e) { console.debug('[AudioService] sfx.typewriterBurst failed:', e.message); } },
    correct: () => { try { this.sfx.play('fill_correct'); } catch(e) { console.debug('[AudioService] sfx.correct failed:', e.message); } },
    wrong: () => { try { this.sfx.play('fill_wrong'); } catch(e) { console.debug('[AudioService] sfx.wrong failed:', e.message); } },
    click: () => { try { this.sfx.play('click'); } catch(e) { console.debug('[AudioService] sfx.click failed:', e.message); } },
    hover: () => { try { this.sfx.play('hover'); } catch(e) { console.debug('[AudioService] sfx.hover failed:', e.message); } },
    success: () => { try { this.sfx.play('success'); } catch(e) { console.debug('[AudioService] sfx.success failed:', e.message); } },
    error: () => { try { this.sfx.play('error'); } catch(e) { console.debug('[AudioService] sfx.error failed:', e.message); } },
    eureka: () => { try { this.sfx.play('eureka'); } catch(e) { console.debug('[AudioService] sfx.eureka failed:', e.message); } },
    breakthrough: () => { try { this.sfx.play('breakthrough'); } catch(e) { console.debug('[AudioService] sfx.breakthrough failed:', e.message); } },
    paperFlip: () => { try { this.sfx.play('paper_flip'); } catch(e) { console.debug('[AudioService] sfx.paperFlip failed:', e.message); } },
    bookFlip: () => { try { this.sfx.play('book_flip'); } catch(e) { console.debug('[AudioService] sfx.bookFlip failed:', e.message); } },
    sealUnlock: () => { try { this.sfx.play('seal_unlock'); } catch(e) { console.debug('[AudioService] sfx.sealUnlock failed:', e.message); } },
    // NEO 新音效快捷方法（2026-08-03）
    ambientHall: () => { try { this.sfx.play('ambient_hall'); } catch(e) { console.debug('[AudioService] sfx.ambientHall failed:', e.message); } },
    noteToggleOn: () => { try { this.sfx.play('note_toggle_on'); } catch(e) { console.debug('[AudioService] sfx.noteToggleOn failed:', e.message); } },
    noteToggleOff: () => { try { this.sfx.play('note_toggle_off'); } catch(e) { console.debug('[AudioService] sfx.noteToggleOff failed:', e.message); } },
    sealBreaking: () => { try { this.sfx.play('seal_breaking'); } catch(e) { console.debug('[AudioService] sfx.sealBreaking failed:', e.message); } },
    penWrite: () => { try { this.sfx.play('pen_write'); } catch(e) { console.debug('[AudioService] sfx.penWrite failed:', e.message); } },
    setVolume: (v) => { try { this.setVolume('sfx', v); } catch(e) { console.debug('[AudioService] sfx.setVolume failed:', e.message); } },
    preload: (names) => {
      try {
        if (!names || !names.length) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        names.forEach((name) => {
          const file = SFX_MAP[name] || name;
          const path = file.includes('.') ? SFX_DIR + file : SFX_DIR + file + '.wav';
          this._loadSfxBuffer(name, path).catch(() => {});
        });
      } catch(e) {
        console.debug('[AudioService] sfx.preload failed:', e.message);
      }
    },

    /**
     * 根据关卡类型预加载关键音效
     * 异步预加载，不阻塞主流程
     * @param {string} levelId - 关卡ID
     * @param {Object} levelData - 关卡数据
     * @returns {Promise<void>}
     */
    preloadLevelSfx: (levelId, levelData) => {
      try {
        if (!this.ctx) this.init();
        if (!this.ctx) return Promise.resolve();

        const sfxToPreload = [
          'fill_correct',
          'fill_wrong',
          'select',
          'click',
          'hint',
          'success',
          'eureka',
          'breakthrough',
          'victory_short',
          'error',
        ];

        // Boss 关额外预加载
        if (levelData && (levelData.isBoss || levelData.battleMode)) {
          sfxToPreload.push('victory_full', 'achievement', 'combo_max');
        }

        // 三幕引导关额外预加载
        if (levelData && levelData.features && levelData.features.threeActGuide) {
          sfxToPreload.push('reveal', 'notification');
        }

        // 异步预加载，不阻塞
        const promises = sfxToPreload.map((name) => {
          const file = SFX_MAP[name] || name;
          const path = file.includes('.') ? SFX_DIR + file : SFX_DIR + file + '.wav';
          return this._loadSfxBuffer(name, path).catch(() => null);
        });

        return Promise.all(promises).then(() => {});
      } catch (e) {
        console.debug('[AudioService] preloadLevelSfx failed:', e.message);
        return Promise.resolve();
      }
    },
  };

  // === Voice ===
  voice = {
    isSupported: () => this._isAudioContextReady(),

    /**
     * 解析语音ID到实际文件路径
     * 支持多种格式：
     * - "VO_CK_03" → "CK/VO_CK_0003.mp3"
     * - "CK_03" → "CK/VO_CK_0003.mp3"
     * - "VO_R_003" → "R/VO_R_0003.mp3"
     * - "R_007" → "R/VO_R_0007.mp3"
     */
    _resolvePath: (voiceId) => {
      if (!voiceId) return null;

      // 去掉VO_前缀（如果有）
      let raw = voiceId;
      if (raw.startsWith('VO_')) {
        raw = raw.substring(3);
      }

      // 解析角色代码和编号（支持多字符角色代码如SM, CK等）
      // 格式：CHAR_NUM 或 CHAR_NUMb（变体）
      const match = raw.match(/^([A-Z]+)_(\d+)([a-z]?)$/);
      if (!match) {
        // 非标准格式（如review_01, demo_01等教学语音），直接返回null（不存在）
        return null;
      }

      const charCode = match[1];
      const num = match[2];
      const variant = match[3] || '';

      // 检查角色是否存在
      if (!VOICE_CHAR_MAP[charCode]) {
        return null;
      }

      // 编号补零到4位
      const paddedNum = num.padStart(4, '0');
      const fileName = `VO_${charCode}_${paddedNum}${variant ? variant : ''}.mp3`;
      // 优先查子目录，其次查根目录（兼容旧版布局）
      const subDirPath = VOICE_DIR + `${charCode}/${fileName}`;
      const rootPath = VOICE_DIR + fileName;
      // 先尝试子目录路径（新布局）
      return subDirPath;
    },

    play: (voiceId, options) => {
      try {
        if (!this.enabled) return;
        if (!voiceId) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        options = options || {};
        const onended = options.onended || null;
        const fadeInMs = options.fadeInMs || 0;
        const volume = (options.volume !== undefined) ? options.volume : 1;

        // 解析路径
        const path = this.voice._resolvePath(voiceId);
        if (!path) {
          // 语音文件不存在，优雅降级
          console.debug('[AudioService] Voice not found (graceful skip):', voiceId);
          if (onended) {
            this._setSafeTimeout(() => { onended(); }, 100);
          }
          return;
        }

        // Stop any currently playing voice first (with quick fade for smoothness)
        if (this._voiceSource) {
          this._stopVoiceNow(50);
        }

        this._loadVoiceBuffer(voiceId, path).then((buffer) => {
          if (!buffer) {
            console.warn('[AudioService] Voice buffer not available:', voiceId);
            if (onended) onended();
            return;
          }
          this._playVoiceBuffer(buffer, { onended: onended, fadeInMs: fadeInMs, volume: volume });
        }).catch((e) => {
          console.warn('[AudioService] Voice play failed:', voiceId, e);
          if (onended) onended();
        });
      } catch(e) {
        console.debug('[AudioService] voice.play failed:', voiceId, e.message);
        if (options && options.onended) {
          this._setSafeTimeout(() => { try { options.onended(); } catch(e) {} }, 0);
        }
      }
    },

    stop: (fadeMs) => {
      try {
        if (fadeMs === undefined) fadeMs = 100;
        if (!this._voiceSource) {
          // Fallback: also stop legacy HTML Audio element if present
          if (this._audioEl) {
            try { this._audioEl.pause(); } catch(e) {}
            this._audioEl = null;
          }
          return;
        }
        this._stopVoiceNow(fadeMs);
      } catch(e) {
        console.debug('[AudioService] voice.stop failed:', e.message);
      }
    },

    setVolume: (v) => { try { this.setVolume('voice', v); } catch(e) { console.debug('[AudioService] voice.setVolume failed:', e.message); } },

    /**
     * 获取语音时长（秒）
     * 优先从已缓存的buffer获取，其次从voice_index.json获取
     * @param {string} voiceId
     * @returns {number} 时长（秒），未找到返回0
     */
    getDuration: (voiceId) => {
      try {
        if (this._voiceCache.has(voiceId)) {
          const buffer = this._voiceCache.get(voiceId);
          return buffer ? buffer.duration : 0;
        }
        // Fallback to voice index
        if (this._voiceIndex && this._voiceIndex[voiceId]) {
          return this._voiceIndex[voiceId].duration || 0;
        }
        return 0;
      } catch(e) {
        console.debug('[AudioService] voice.getDuration failed:', e.message);
        return 0;
      }
    },

    preload: (voiceIds) => {
      try {
        if (!voiceIds || !voiceIds.length) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        voiceIds.forEach((voiceId) => {
          const path = this.voice._resolvePath(voiceId);
          if (path) {
            this._loadVoiceBuffer(voiceId, path).catch(() => {});
          }
        });
      } catch(e) {
        console.debug('[AudioService] voice.preload failed:', e.message);
      }
    },
  };

  // === BGM ===
  bgm = {
    isSupported: () => this._isAudioContextReady(),

    play: (chapterId) => {
      try {
        if (!this.enabled || !this.bgmEnabled) return;
        this.resume();
        const path = BGM_DIR + 'chapter_' + chapterId + '.mp3';
        this._playBgm(path);
      } catch(e) {
        console.debug('[AudioService] bgm.play failed:', e.message);
      }
    },
    playFile: (filename) => {
      try {
        console.log('[AudioService] bgm.playFile:', filename, 'enabled:', this.enabled, 'bgmEnabled:', this.bgmEnabled);
        if (!this.enabled || !this.bgmEnabled) return;
        this.resume();
        const path = BGM_DIR + filename;
        this._playBgm(path);
      } catch(e) {
        console.debug('[AudioService] bgm.playFile failed:', e.message);
      }
    },
    stop: (fadeMs) => {
      try {
        if (fadeMs === undefined) fadeMs = 200;
        if (!this._bgmTrack && !this.bgmPlaying) return;

        this.bgmPlaying = false;
        this._pendingBgm = null;

        if (this._bgmTrack) {
          const oldTrack = this._bgmTrack;
          this._bgmTrack = null;
          this._currentBgm = null;
          this._fadeOutAndDisposeTrack(oldTrack, fadeMs);
        }

        // Also stop any fading-out tracks immediately if fadeMs is 0
        if (fadeMs === 0) {
          while (this._bgmFadingOut.length) {
            this._disposeBgmTrack(this._bgmFadingOut.pop());
          }
        }
      } catch(e) {
        console.debug('[AudioService] bgm.stop failed:', e.message);
      }
    },
    pause: () => {
      try {
        if (!this._bgmTrack || !this.bgmPlaying) return;
        try { this._bgmTrack.el.pause(); } catch(e) {}
        this.bgmPlaying = false;
      } catch(e) {
        console.debug('[AudioService] bgm.pause failed:', e.message);
      }
    },
    resume: () => {
      try {
        if (!this._bgmTrack || this.bgmPlaying) return;
        if (!this.enabled || !this.bgmEnabled) return;
        this._bgmTrack.el.play().then(() => {
          this.bgmPlaying = true;
        }).catch((e) => {
          console.warn('[AudioService] BGM resume failed:', e);
        });
      } catch(e) {
        console.debug('[AudioService] bgm.resume failed:', e.message);
      }
    },
    transition: (intensity, fadeMs = 500) => {
      try {
        if (!this.ctx || !this.bgmGain) return;
        this._currentIntensity = intensity;

        const volumeMap = { Muted: 0.03, Normal: 0.15, Intense: 0.3, Eureka: 0.5 };
        const filterMap = { Muted: 300, Normal: 20000, Intense: 20000, Eureka: 20000 };

        let targetVol = (volumeMap[intensity] || 0.15) * this._volumes.bgm;
        const targetFreq = filterMap[intensity] || 20000;

        // Apply ducking factor if ducking is active
        if (this._duckingActive) {
          targetVol *= 0.7;
        }

        const now = this.ctx.currentTime;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now);
        this.bgmGain.gain.linearRampToValueAtTime(targetVol, now + fadeMs / 1000);

        this.bgmFilter.frequency.cancelScheduledValues(now);
        this.bgmFilter.frequency.setValueAtTime(this.bgmFilter.frequency.value, now);
        this.bgmFilter.frequency.linearRampToValueAtTime(targetFreq, now + fadeMs / 1000);
      } catch(e) {
        console.debug('[AudioService] bgm.transition failed:', e.message);
      }
    },
    setLowPass: (freq, duration = 500) => {
      try {
        if (!this.ctx || !this.bgmFilter) return;
        const now = this.ctx.currentTime;
        this.bgmFilter.frequency.cancelScheduledValues(now);
        this.bgmFilter.frequency.setValueAtTime(this.bgmFilter.frequency.value, now);
        this.bgmFilter.frequency.linearRampToValueAtTime(freq, now + duration / 1000);
      } catch(e) {
        console.debug('[AudioService] bgm.setLowPass failed:', e.message);
      }
    },
    setVolume: (v) => { try { this.setVolume('bgm', v); } catch(e) { console.debug('[AudioService] bgm.setVolume failed:', e.message); } },

    /**
     * 播放 Boss 战专属 BGM
     * @param {string} bossId - Boss ID
     * @param {Object} options - 选项
     * @param {string} options.bgmFile - 自定义 BGM 文件名（可选）
     * @param {boolean} options.fadeIn - 是否淡入（默认 true）
     * @param {number} options.volume - 音量（默认 0.6）
     */
    playBoss: (bossId, options) => {
      try {
        if (!this.enabled || !this.bgmEnabled) return;
        this.resume();

        options = options || {};
        // V4.3.20：boss_{id}.mp3 未逐个产出，统一回退到通用 boss_battle.mp3，
        // 避免 "Failed to load because no supported source was found"；
        // 将来某个 Boss 有专属 BGM 时用 options.bgmFile 覆盖即可
        const bgmFile = options.bgmFile || 'boss_battle.mp3';
        const path = BGM_DIR + bgmFile;
        const volume = (options.volume !== undefined) ? options.volume : 0.6;
        const fadeIn = options.fadeIn !== false;

        // Boss BGM uses crossfade like normal BGM, but with custom volume
        this._pendingBgm = path;
        this._pendingBgmOptions = { volume: volume, fadeIn: fadeIn };

        if (this._unlocked) {
          this._playBgmNow(path, { volume: volume, fadeIn: fadeIn });
        }
      } catch (e) {
        console.debug('[AudioService] bgm.playBoss failed:', e.message);
      }
    },

    /**
     * 停止 Boss 战 BGM
     * @param {number} fadeOutMs - 淡出时长（毫秒），默认 500ms
     */
    stopBoss: (fadeOutMs) => {
      try {
        if (fadeOutMs === undefined) fadeOutMs = 500;
        if (!this._bgmTrack || !this.bgmPlaying) {
          this.bgm.stop(fadeOutMs);
          return;
        }

        // Fade out the BGM bus gain to 0, then stop
        if (this.ctx && this.bgmGain && fadeOutMs > 0) {
          const now = this.ctx.currentTime;
          const currentGain = this.bgmGain.gain.value;
          this.bgmGain.gain.cancelScheduledValues(now);
          this.bgmGain.gain.setValueAtTime(currentGain, now);
          this.bgmGain.gain.linearRampToValueAtTime(0, now + fadeOutMs / 1000);

          this._setSafeTimeout(() => {
            this.bgm.stop(0);
            // Restore bgmGain to user setting for next playback
            if (this.bgmGain && this.ctx) {
              const t = this.ctx.currentTime;
              this.bgmGain.gain.cancelScheduledValues(t);
              this.bgmGain.gain.setValueAtTime(this._volumes.bgm, t);
            }
          }, fadeOutMs);
        } else {
          this.bgm.stop(0);
        }
      } catch (e) {
        console.debug('[AudioService] bgm.stopBoss failed:', e.message);
        // Fallback: stop immediately
        try { this.bgm.stop(0); } catch(e2) {}
      }
    },
  };

  // === SFX: buffer loading ===
  _loadSfxBuffer(name, path) {
    if (this._sfxCache.has(name)) {
      return Promise.resolve(this._sfxCache.get(name));
    }
    return fetch(path)
      .then((response) => {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => this.ctx.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        this._sfxCache.set(name, audioBuffer);
        return audioBuffer;
      })
      .catch((e) => {
        // 未知音效静默跳过（不影响剧情），不刷警告
        console.debug('[AudioService] SFX unavailable:', name, e && e.message);
        return null;
      });
  }

  // === SFX: Web Audio playback ===
  _playSfxBuffer(name, path, options) {
    const volume = (options && options.volume !== undefined) ? options.volume : 1;

    this._loadSfxBuffer(name, path).then((buffer) => {
      if (!buffer) return;
      if (!this.ctx) return;

      try {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const gainNode = this.ctx.createGain();
        const targetGain = Math.max(0, Math.min(1, volume));
        gainNode.gain.value = targetGain;

        source.connect(gainNode);
        gainNode.connect(this.sfxGain);

        source.onended = () => {
          try { source.disconnect(); } catch(e) {}
          try { gainNode.disconnect(); } catch(e) {}
          this._sfxSources.delete(source);
        };

        this._sfxSources.add(source);
        source.start(0);
      } catch(e) {
        console.warn('[AudioService] SFX playback error:', name, e);
      }
    });
  }

  // === Helpers ===

  /**
   * Play a single typewriter key sound (synthesized for authenticity)
   * Uses choke: previous key is quickly faded out to prevent buildup
   */
  _playTypewriterKey(volume) {
    if (!this.enabled || !this.sfxEnabled || !this.ctx) return;
    this.resume();

    const now = Date.now();
    if (now - this._lastTypewriterKeyTime < this._typewriterKeyCooldown) return;
    this._lastTypewriterKeyTime = now;

    const ctx = this.ctx;
    const t = ctx.currentTime;
    // v2.0：提高打字机合成音默认音量（0.6→0.9），手机上更易听见
    const vol = (volume !== undefined ? volume : 0.9) * 0.5;

    // Choke previous key: fade out quickly
    if (this._lastTypewriterKeyGain) {
      try {
        const oldGain = this._lastTypewriterKeyGain;
        oldGain.gain.cancelScheduledValues(t);
        oldGain.gain.setValueAtTime(oldGain.gain.value, t);
        oldGain.gain.linearRampToValueAtTime(0, t + 0.02);
      } catch(e) {}
      this._lastTypewriterKeyGain = null;
    }

    try {
      // Typewriter key = noise burst (mechanical clack) + short thud
      // 1. Noise component (key strike - bright, short)
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
      const noiseData = noiseBuf.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 3);
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuf;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 2500 + Math.random() * 1000;
      noiseFilter.Q.value = 1.5;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(vol * 0.7, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      // 2. Thud component (key hitting platen - lower, shorter)
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120 + Math.random() * 40, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.04);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(vol * 0.5, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);

      // Track the noise gain for choking next key
      this._lastTypewriterKeyGain = noiseGain;

      noiseSource.start(t);
      noiseSource.stop(t + 0.08);
      osc.start(t);
      osc.stop(t + 0.08);

      // Cleanup
      this._setSafeTimeout(() => {
        try { noiseSource.disconnect(); } catch(e) {}
        try { noiseFilter.disconnect(); } catch(e) {}
        try { noiseGain.disconnect(); } catch(e) {}
        try { osc.disconnect(); } catch(e) {}
        try { oscGain.disconnect(); } catch(e) {}
        if (this._lastTypewriterKeyGain === noiseGain) {
          this._lastTypewriterKeyGain = null;
        }
      }, 150);
    } catch(e) {
      console.debug('[AudioService] typewriter key synth failed:', e.message);
      // Fallback: use click.wav
      this._playSfxBuffer('typewriter_key', SFX_DIR + 'click.wav', { volume: vol });
    }
  }

  _playTypewriterBurst(path, volume) {
    // Ambient typewriter sequence - just play the buffer once
    this._playSfxBuffer('typewriter', path, { volume: volume || 0.4 });
  }

  _playSample(path) {
    // Legacy fallback - delegate to Web Audio buffer system
    const name = path.substring(path.lastIndexOf('/') + 1);
    this._playSfxBuffer(name, path, { volume: 1 });
  }

  // === SFX Preloading ===
  _preloadCommonSfx() {
    const commonSfx = [
      'click',
      'fill_correct',
      'fill_wrong',
      'erase',
      'select',
      'hint',
      'victory',
      'error',
      'success',
      'note_toggle',
      'hover',
      'eureka',
      'paper_flip',
      'dialog_advance',
    ];
    // Defer slightly to not block initial render
    this._setSafeTimeout(() => {
      if (this.sfx && this.sfx.preload) {
        this.sfx.preload(commonSfx);
        console.log('[AudioService] Preloading common SFX:', commonSfx.length, 'sounds');
      }
    }, 500);
  }

  // --- Voice: index loading ---
  _loadVoiceIndex() {
    const indexPath = VOICE_DIR + 'voice_index.json';
    fetch(indexPath)
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then((data) => {
        this._voiceIndex = data;
        this._voiceIndexLoaded = true;
        console.log('[AudioService] Voice index loaded:', Object.keys(data).length, 'entries');
      })
      .catch((e) => {
        console.warn('[AudioService] Failed to load voice index:', e.message);
        this._voiceIndex = {};
        this._voiceIndexLoaded = true;
      });
  }

  // --- Voice: buffer loading ---
  _loadVoiceBuffer(voiceId, path) {
    // Return from cache if available
    if (this._voiceCache.has(voiceId)) {
      return Promise.resolve(this._voiceCache.get(voiceId));
    }
    // Fetch and decode
    return fetch(path)
      .then((response) => {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => this.ctx.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        // Warn about suspiciously short voice clips (less than 0.8s)
        if (audioBuffer && audioBuffer.duration < 0.8) {
          console.warn('[AudioService] Voice clip shorter than expected (%.1fs): %s', audioBuffer.duration, voiceId);
        }
        this._voiceCache.set(voiceId, audioBuffer);
        return audioBuffer;
      })
      .catch((e) => {
        console.warn('[AudioService] Failed to load voice:', voiceId, e);
        return null;
      });
  }

  // --- Voice: Web Audio playback ---
  _playVoiceBuffer(buffer, options) {
    const onended = options.onended || null;
    const fadeInMs = options.fadeInMs || 0;
    const volume = (options.volume !== undefined) ? options.volume : 1;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0;

    source.connect(gainNode);
    gainNode.connect(this.voiceGain);

    const now = this.ctx.currentTime;
    const targetGain = Math.max(0, Math.min(1, volume));

    if (fadeInMs > 0) {
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(targetGain, now + fadeInMs / 1000);
    } else {
      gainNode.gain.setValueAtTime(targetGain, now);
    }

    // Start ducking: lower SFX (-6dB) and BGM (-3dB) while voice plays
    this._startDucking();

    source.onended = () => {
      // Restore ducking first
      this._endDucking();
      // Only fire onended for natural completion (not forced stop)
      if (!this._voiceStopping && onended) {
        try { onended(); } catch(e) { console.warn('[AudioService] voice onended error:', e); }
      }
      // Cleanup
      try { source.disconnect(); } catch(e) {}
      try { gainNode.disconnect(); } catch(e) {}
      if (this._voiceSource === source) {
        this._voiceSource = null;
        this._voiceGainNode = null;
        this._voiceOnEnded = null;
      }
    };

    this._voiceSource = source;
    this._voiceGainNode = gainNode;
    this._voiceOnEnded = onended;
    this._voiceStopping = false;

    source.start(0);
  }

  // --- Voice: stop with fade out ---
  _stopVoiceNow(fadeMs) {
    if (!this._voiceSource || !this._voiceGainNode) return;

    const source = this._voiceSource;
    const gainNode = this._voiceGainNode;

    this._voiceStopping = true;
    this._voiceSource = null;
    this._voiceGainNode = null;
    this._voiceOnEnded = null;

    // Restore ducking immediately (with fade)
    this._endDucking();

    try {
      const now = this.ctx.currentTime;
      const currentGain = gainNode.gain.value;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(currentGain, now);

      if (fadeMs > 0) {
        gainNode.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
        // Stop the source slightly after fade completes
        try { source.stop(now + fadeMs / 1000 + 0.02); } catch(e) {}
      } else {
        gainNode.gain.setValueAtTime(0, now);
        try { source.stop(now); } catch(e) {}
      }
    } catch(e) {
      // Fallback: force stop
      try { source.stop(); } catch(e2) {}
    }
  }

  // --- Ducking: lower SFX and BGM while voice plays ---
  _startDucking() {
    if (!this.ctx || this._duckingActive) return;
    this._duckingActive = true;
    const now = this.ctx.currentTime;

    // Duck SFX: -6dB (multiply by 0.5), 150ms ramp
    if (this.sfxGain) {
      const currentVal = this.sfxGain.gain.value;
      this._sfxGainBeforeDuck = currentVal;
      this.sfxGain.gain.cancelScheduledValues(now);
      this.sfxGain.gain.setValueAtTime(currentVal, now);
      this.sfxGain.gain.linearRampToValueAtTime(currentVal * 0.5, now + 0.15);
    }

    // Duck BGM: -3dB (multiply by 0.7), 150ms ramp
    if (this.bgmGain) {
      const currentVal = this.bgmGain.gain.value;
      this._bgmGainBeforeDuck = currentVal;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(currentVal, now);
      this.bgmGain.gain.linearRampToValueAtTime(currentVal * 0.7, now + 0.15);
    }
  }

  _endDucking() {
    if (!this.ctx || !this._duckingActive) return;
    this._duckingActive = false;
    const now = this.ctx.currentTime;

    // Restore SFX, 150ms ramp
    if (this.sfxGain) {
      const currentVal = this.sfxGain.gain.value;
      // _sfxGainBeforeDuck stores the pre-duck gain value.
      // If setVolume was called during ducking, it was updated to the new base volume.
      const restoreTarget = this._sfxGainBeforeDuck || this._volumes.sfx;
      this.sfxGain.gain.cancelScheduledValues(now);
      this.sfxGain.gain.setValueAtTime(currentVal, now);
      this.sfxGain.gain.linearRampToValueAtTime(restoreTarget, now + 0.15);
    }

    // Restore BGM, 150ms ramp
    if (this.bgmGain) {
      const currentVal = this.bgmGain.gain.value;
      const restoreTarget = this._bgmGainBeforeDuck || this._volumes.bgm;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(currentVal, now);
      this.bgmGain.gain.linearRampToValueAtTime(restoreTarget, now + 0.15);
    }
  }

  // --- BGM track management ---
  _createBgmTrack(path, options) {
    options = options || {};
    const audio = new Audio(path);
    audio.loop = true;
    // Set element volume to max — all volume control done via Web Audio gain
    audio.volume = 1;

    const source = this.ctx.createMediaElementSource(audio);
    const trackGain = this.ctx.createGain();
    trackGain.gain.value = (options.startAtZero) ? 0 : 1;

    // Signal chain: source → trackGain → bgmFilter → bgmGain → masterGain
    source.connect(trackGain);
    trackGain.connect(this.bgmFilter);

    return { el: audio, source: source, gain: trackGain, path: path };
  }

  _disposeBgmTrack(track) {
    if (!track) return;
    try { track.gain.disconnect(); } catch(e) {}
    try { track.source.disconnect(); } catch(e) {}
    try { track.el.pause(); } catch(e) {}
    try { track.el.src = ''; } catch(e) {}
  }

  _fadeOutAndDisposeTrack(track, fadeMs) {
    if (!track || !this.ctx) {
      this._disposeBgmTrack(track);
      return;
    }
    const now = this.ctx.currentTime;
    const currentGain = track.gain.gain.value;
    try {
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(currentGain, now);
      track.gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    } catch(e) {}

    const trackRef = track;
    this._setSafeTimeout(() => {
      this._disposeBgmTrack(trackRef);
      // Remove from fadingOut array if present
      const idx = this._bgmFadingOut.indexOf(trackRef);
      if (idx >= 0) this._bgmFadingOut.splice(idx, 1);
    }, fadeMs + 20);
  }

  // Legacy HTML Audio voice playback (kept for reference, no longer used)
  _playVoice(path) {
    if (this._audioEl) {
      try { this._audioEl.pause(); } catch(e) {}
    }
    const audio = new Audio(path);
    audio.volume = this._volumes.voice * this._volumes.master;
    this._audioEl = audio;
    audio.play().catch(() => {});
  }

  _playBgm(path) {
    this._pendingBgm = path;
    this._pendingBgmOptions = null;
    // If already interacted, play immediately with crossfade
    if (this._unlocked) {
      this._playBgmNow(path);
    }
    // Otherwise, wait for first click
  }

  /**
   * V4.3.28（P1）：获取当前 BGM 的 BPM（时序层节拍对齐）
   * 从文件名匹配 BGM_BPM_MAP，未知回退 120
   * @returns {number}
   */
  getBPM() {
    try {
      const track = this._bgmTrack;
      const path = (track && track.path) || this._pendingBgm || '';
      const name = path.split('/').pop().replace(/\.(mp3|wav|ogg|m4a)$/i, '');
      const bpm = BGM_BPM_MAP[name];
      return (typeof bpm === 'number' && bpm > 0) ? bpm : 120;
    } catch (e) {
      return 120;
    }
  }

  _playBgmNow(path, options) {
    try {
      if (!this.ctx) {
        this.init();
        if (!this.ctx) return;
      }
      options = options || {};
      console.log('[AudioService] Playing BGM:', path);

      // If same track is already playing, do nothing
      if (this._bgmTrack && this._bgmTrack.path === path && this.bgmPlaying) {
        console.log('[AudioService] BGM already playing, skipping:', path);
        return;
      }

      const fadeIn = options.fadeIn !== false; // default true
      const hasExisting = !!this._bgmTrack;

      // Create new track (start at 0 if we're crossfading or fadeIn is requested)
      const newTrack = this._createBgmTrack(path, { startAtZero: hasExisting || fadeIn });

      // Move current track to fading-out state
      if (this._bgmTrack) {
        const oldTrack = this._bgmTrack;
        this._bgmFadingOut.push(oldTrack);
        this._fadeOutAndDisposeTrack(oldTrack, 800);
      }

      this._bgmTrack = newTrack;
      this._currentBgm = newTrack.el; // keep for backward compat
      this.bgmPlaying = true;

      // If a custom volume is provided (e.g. Boss BGM), set bgmGain to it
      if (options.volume !== undefined) {
        const now = this.ctx.currentTime;
        const targetVol = this._duckingActive ? options.volume * 0.7 : options.volume;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setValueAtTime(targetVol, now);
      } else if (this.bgmGain && this.bgmGain.gain.value < 0.001) {
        // Reset bgmGain to user volume if it was faded down by stopBoss
        const now = this.ctx.currentTime;
        const targetVol = this._duckingActive ? this._volumes.bgm * 0.7 : this._volumes.bgm;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setValueAtTime(targetVol, now);
      }

      newTrack.el.play().then(() => {
        // If track was replaced before playback started, skip fade-in
        if (this._bgmTrack !== newTrack) {
          console.log('[AudioService] BGM track obsolete before play started, skipping fade-in');
          return;
        }
        console.log('[AudioService] BGM playing successfully');
        const now = this.ctx.currentTime;

        if (hasExisting) {
          // Crossfade: new track fades in over 800ms with 30% overlap
          const fadeDuration = 0.8;
          const overlapRatio = 0.3;
          const delay = fadeDuration * (1 - overlapRatio);

          newTrack.gain.gain.cancelScheduledValues(now);
          newTrack.gain.gain.setValueAtTime(0, now);
          newTrack.gain.gain.setValueAtTime(0, now + delay);
          newTrack.gain.gain.linearRampToValueAtTime(1, now + delay + fadeDuration);
        } else if (fadeIn) {
          const fadeDuration = 0.8;
          newTrack.gain.gain.cancelScheduledValues(now);
          newTrack.gain.gain.setValueAtTime(0, now);
          newTrack.gain.gain.linearRampToValueAtTime(1, now + fadeDuration);
        } else {
          newTrack.gain.gain.cancelScheduledValues(now);
          newTrack.gain.gain.setValueAtTime(1, now);
        }
      }).catch((e) => {
        console.warn('[AudioService] BGM play failed:', e.message);
        if (this._bgmTrack === newTrack) {
          this._disposeBgmTrack(newTrack);
          this._bgmTrack = null;
          this._currentBgm = null;
          this.bgmPlaying = false;
        }
      });
    } catch(e) {
      console.error('[AudioService] BGM error:', e);
    }
  }

  unlock() {
    try {
      if (this._unlocked) {
        // Already unlocked, but may have pending BGM
        if (this._pendingBgm && !this.bgmPlaying) {
          this._playBgmNow(this._pendingBgm, this._pendingBgmOptions || {});
          this._pendingBgm = null;
          this._pendingBgmOptions = null;
        }
        return;
      }
      console.log('[AudioService] Audio unlocked');
      this._unlocked = true;
      // 等 AudioContext resume 完成后再播 BGM（避免手势外被 Chrome 拒绝）
      const playPending = () => {
        if (this._pendingBgm) {
          console.log('[AudioService] Playing pending BGM:', this._pendingBgm);
          this._playBgmNow(this._pendingBgm, this._pendingBgmOptions || {});
          this._pendingBgm = null;
          this._pendingBgmOptions = null;
        }
        // 解锁后播放轻提示音，让玩家感知声音已开启（resume 成功后只播一次；
        // 此时 ctx 已 running，sfx.play 内部 resume() 不会重复触发 ctx.resume）
        try { this.sfx.play('click'); } catch (e) {}
      };
      const rp = this.resume();
      if (rp && typeof rp.then === 'function') {
        rp.then(playPending).catch(playPending);
      } else {
        playPending();
      }
    } catch(e) {
      console.debug('[AudioService] unlock failed:', e.message);
    }
  }

  // === Synthesizer (Web Audio tone generation) ===
  synth = {
    isSupported: () => this._isAudioContextReady(),

    /**
     * Play a single synthesized tone
     * @param {number} freq - Frequency in Hz
     * @param {number} duration - Duration in seconds
     * @param {string} type - Oscillator type: 'sine', 'square', 'sawtooth', 'triangle'
     * @param {number} volume - Volume (0-1), applied on top of sfx gain
     */
    playTone: (freq, duration, type, volume) => {
      try {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        type = type || 'sine';
        volume = (volume !== undefined) ? volume : 0.3;

        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = type;
          osc.frequency.value = freq;

          const attack = 0.01;
          const decay = 0.05;
          const sustain = 0.3;
          const release = 0.1;

          const peakGain = Math.max(0, Math.min(1, volume));
          const sustainGain = peakGain * sustain;

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(peakGain, now + attack);
          gain.gain.linearRampToValueAtTime(sustainGain, now + attack + decay);

          const totalSustain = Math.max(0, duration - attack - decay);
          const releaseStart = now + attack + decay + totalSustain;
          gain.gain.setValueAtTime(sustainGain, releaseStart);
          gain.gain.linearRampToValueAtTime(0, releaseStart + release);

          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.start(now);
          osc.stop(releaseStart + release + 0.02);

          osc.onended = () => {
            try { osc.disconnect(); } catch(e) {}
            try { gain.disconnect(); } catch(e) {}
          };
        } catch(e) {
          console.debug('[AudioService] synth.playTone failed:', e.message);
        }
      } catch(e) {
        console.debug('[AudioService] synth.playTone outer failed:', e.message);
      }
    },

    /**
     * Avalanche start sound - single clear bell-like tone
     */
    playAvalancheStart: () => {
      try {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        try {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.value = 523.25;

          const peakGain = 0.25;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(peakGain, now + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.start(now);
          osc.stop(now + 0.85);

          osc.onended = () => {
            try { osc.disconnect(); } catch(e) {}
            try { gain.disconnect(); } catch(e) {}
          };
        } catch(e) {
          console.debug('[AudioService] avalancheStart failed:', e.message);
        }
      } catch(e) {
        console.debug('[AudioService] playAvalancheStart outer failed:', e.message);
      }
    },

    /**
     * Avalanche tick - individual notes during the avalanche cascade
     */
    playAvalancheTick: (index, total) => {
      try {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        total = Math.max(1, total || 1);
        const progress = Math.min(1, Math.max(0, index / total));

        try {
          const now = this.ctx.currentTime;
          const startFreq = 523.25;
          const endFreq = 2093.0;
          const freq = startFreq * Math.pow(endFreq / startFreq, progress);

          let vol;
          if (progress < 0.3) {
            vol = 0.1 + (progress / 0.3) * 0.25;
          } else if (progress < 0.7) {
            vol = 0.35;
          } else {
            vol = 0.35 - ((progress - 0.7) / 0.3) * 0.2;
          }

          const duration = 0.12 - progress * 0.06;

          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.value = freq;

          const attack = 0.005;
          const release = Math.max(0.02, duration * 0.6);
          const peakGain = vol;

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(peakGain, now + attack);
          gain.gain.exponentialRampToValueAtTime(0.001, now + attack + release);

          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.start(now);
          osc.stop(now + attack + release + 0.02);

          osc.onended = () => {
            try { osc.disconnect(); } catch(e) {}
            try { gain.disconnect(); } catch(e) {}
          };
        } catch(e) {
          console.debug('[AudioService] avalancheTick failed:', e.message);
        }
      } catch(e) {
        console.debug('[AudioService] playAvalancheTick outer failed:', e.message);
      }
    },

    /**
     * Avalanche end sound - major chord with fade-out
     */
    playAvalancheEnd: () => {
      try {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        try {
          const now = this.ctx.currentTime;
          const chordFreqs = [523.25, 659.25, 783.99];
          const volume = 0.2;

          chordFreqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            const startDelay = i * 0.03;
            const startTime = now + startDelay;

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.2);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(startTime);
            osc.stop(startTime + 1.25);

            osc.onended = () => {
              try { osc.disconnect(); } catch(e) {}
              try { gain.disconnect(); } catch(e) {}
            };
          });
        } catch(e) {
          console.debug('[AudioService] avalancheEnd failed:', e.message);
        }
      } catch(e) {
        console.debug('[AudioService] playAvalancheEnd outer failed:', e.message);
      }
    },

    /**
     * 播放音符序列（辅助方法）
     */
    playNoteSequence: (freqs, interval, type, volume) => {
      try {
        if (!freqs || !freqs.length) return;
        type = type || 'sine';
        volume = (volume !== undefined) ? volume : 0.3;
        interval = interval || 200;

        freqs.forEach((freq, i) => {
          this._setSafeTimeout(() => {
            try {
              this.synth.playTone(freq, interval * 0.8 / 1000, type, volume);
            } catch(e) {
              console.debug('[AudioService] playNoteSequence note failed:', e.message);
            }
          }, i * interval);
        });
      } catch(e) {
        console.debug('[AudioService] playNoteSequence failed:', e.message);
      }
    },

    /**
     * 第一幕开幕音效：悠扬的上升音阶
     */
    playActOpen: () => {
      try {
        if (!this.enabled || !this.sfxEnabled) return;
        this.synth.playNoteSequence([523.25, 659.25, 783.99], 200, 'sine', 0.2);
      } catch(e) {
        console.debug('[AudioService] playActOpen failed:', e.message);
      }
    },

    /**
     * 第二幕破局音效：紧张的低音 + 上升音
     */
    playActBreakthrough: () => {
      try {
        if (!this.enabled || !this.sfxEnabled) return;
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        this.resume();

        this.synth.playTone(220, 0.5, 'triangle', 0.15);
        this._setSafeTimeout(() => {
          try {
            this.synth.playTone(880, 0.15, 'sine', 0.2);
          } catch(e) {}
        }, 200);
      } catch(e) {
        console.debug('[AudioService] playActBreakthrough failed:', e.message);
      }
    },
  };
}

export default new AudioService();