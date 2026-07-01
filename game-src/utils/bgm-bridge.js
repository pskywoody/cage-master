// ==========================================
// BGM桥接器 v2 — 使用 MidiPlayer 播放 .mid 文件
// 优先播放 assets/audio/midi/ 中的交响配乐 .mid 文件
// 回退到 AudioManager 程序化BGM
// ==========================================
const BGMEngine = {
  _ready: false,
  _currentChapter: null,
  _currentMode: null,
  _volume: 0.35,
  _muted: false,
  _midiBase: 'assets/audio/midi/',
  _stopLoopCheck: null,

  /** 初始化 */
  init() {
    if (this._ready) return;
    this._ready = true;

    if (typeof AudioManager !== 'undefined') {
      try {
        const s = typeof Storage !== 'undefined' && Storage.loadSettings ? Storage.loadSettings() : null;
        if (s) {
          this._muted = s.bgm === false;
          this._volume = s.bgmVolume || 0.35;
        }
      } catch(e) {}
    }

    const autoResume = () => {
      if (typeof AudioManager !== 'undefined') AudioManager.resume();
      document.removeEventListener('click', autoResume);
      document.removeEventListener('touchstart', autoResume);
      document.removeEventListener('keydown', autoResume);
    };
    document.addEventListener('click', autoResume, { once: true });
    document.addEventListener('touchstart', autoResume, { once: true });
    document.addEventListener('keydown', autoResume, { once: true });

    document.addEventListener('bgm-toggle', (e) => {
      this._muted = !e.detail;
      if (this._muted) this.stop();
    });

    console.log('[BGMEngine] 初始化完成');
  },

  /** 播放.mid文件（内部方法） */
  _playMidi(path, loop) {
    if (typeof MidiPlayer === 'undefined') {
      // 回退到AudioManager
      if (typeof AudioManager !== 'undefined') AudioManager.startBGM();
      return;
    }
    this.stop();
    MidiPlayer.setVolume(this._volume);
    MidiPlayer.setLoop(!!loop);
    MidiPlayer.load(path).then(() => {
      if (this._muted) return;
      MidiPlayer.play();
    });
  },

  /** 播放章节BGM */
  playChapter(chapterId) {
    if (this._muted) return;
    this._currentMode = 'story';
    this._currentChapter = chapterId;
    this._playMidi(this._midiBase + 'chapter_' + chapterId + '.mid', true);
  },

  /** 主菜单BGM（第1章主题） */
  playMenu() {
    if (this._muted) return;
    this._currentMode = 'menu';
    this._playMidi(this._midiBase + 'chapter_1.mid', true);
  },

  /** 速度谜题BGM（第5章星辰核心） */
  playPuzzle() {
    if (this._muted) return;
    this._currentMode = 'puzzle';
    this._playMidi(this._midiBase + 'chapter_5.mid', true);
  },

  /** Boss战BGM */
  playBossBattle() {
    if (this._muted) return;
    this._playMidi(this._midiBase + 'boss_battle.mid', true);
  },

  /** 播放角色主题曲 */
  playCharacterTheme(charId) {
    if (this._muted) return;
    const fileMap = {
      'ray': 'theme_ray.mid',
      'cagekeeper': 'theme_cagekeeper.mid',
      'plotter': 'theme_plotter.mid',
      'plotterShadow': 'theme_plotter.mid',
      'remnant': 'theme_cagekeeper.mid',
      'weaver': 'theme_weaver.mid',
      'setterSecret': 'theme_weaver.mid'
    };
    const file = fileMap[charId];
    if (file) {
      this._playMidi(this._midiBase + file, false);
    }
  },

  /** 胜利BGM */
  playVictory() {
    if (this._muted) return;
    this._playMidi(this._midiBase + 'victory.mid', false);
  },

  /** 破局号角 */
  playBreakthrough() {
    if (this._muted) return;
    this._playMidi(this._midiBase + 'breakthrough_fanfare.mid', false);
  },

  /** 设置阶段 */
  setPhase(phase) {
    if (typeof MidiPlayer !== 'undefined') {
      MidiPlayer.setVariation(phase);
    }
    if (phase === 'finishing') {
      // 收官阶段播放胜利号角
      this.playVictory();
    }
  },

  /** 停止BGM */
  stop() {
    if (typeof MidiPlayer !== 'undefined') MidiPlayer.stop();
    if (typeof AudioManager !== 'undefined') {
      AudioManager.stopBGM();
      AudioManager.stopBossBGM();
    }
  },

  /** 暂停 */
  pause() {
    if (typeof MidiPlayer !== 'undefined') MidiPlayer.stop();
    if (typeof AudioManager !== 'undefined') AudioManager.pauseBGM();
  },

  /** 恢复 */
  resume() {
    if (typeof AudioManager === 'undefined') return;
    if (this._muted) return;
    AudioManager.resume();
    if (typeof MidiPlayer !== 'undefined') {
      if (this._currentMode === 'menu') this.playMenu();
      else if (this._currentMode === 'puzzle') this.playPuzzle();
      else if (this._currentChapter) this.playChapter(this._currentChapter);
    }
  },

  /** 设置音量 */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(0.7, v));
    if (typeof MidiPlayer !== 'undefined') MidiPlayer.setVolume(this._volume);
    if (typeof AudioManager !== 'undefined') AudioManager.setBgmVolume(this._volume);
  },

  /** 开关BGM */
  toggle() {
    this._muted = !this._muted;
    if (this._muted) {
      this.stop();
    } else {
      this.resume();
    }
    return !this._muted;
  },

  get isPlaying() {
    if (typeof MidiPlayer !== 'undefined' && MidiPlayer.isPlaying) return true;
    if (typeof AudioManager !== 'undefined') return AudioManager.bgmPlaying;
    return false;
  }
};

if (typeof window !== 'undefined') window.BGMEngine = BGMEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = BGMEngine;
