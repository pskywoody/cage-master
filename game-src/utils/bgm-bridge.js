// ==========================================
// BGM桥接器 - 统一管理MidiBGM + AudioManager
// 自动选择可用引擎，提供统一API
// ==========================================
const BGMEngine = {
  _ready: false,
  _currentChapter: null,
  _currentMode: null, // 'story' | 'menu' | 'puzzle'
  _volume: 0.35,
  _muted: false,

  /** 初始化：注册首次交互自动启动 */
  init() {
    if (this._ready) return;
    this._ready = true;

    // 恢复音量设置
    if (typeof AudioManager !== 'undefined') {
      const s = Storage.loadSettings();
      if (s) {
        this._muted = s.bgm === false;
        this._volume = s.bgmVolume || 0.35;
      }
    }

    // 首次交互自动恢复上下文
    const autoResume = () => {
      if (typeof AudioManager !== 'undefined') AudioManager.resume();
      document.removeEventListener('click', autoResume);
      document.removeEventListener('touchstart', autoResume);
      document.removeEventListener('keydown', autoResume);
    };
    document.addEventListener('click', autoResume, { once: true });
    document.addEventListener('touchstart', autoResume, { once: true });
    document.addEventListener('keydown', autoResume, { once: true });

    // 监听设置变化
    document.addEventListener('bgm-toggle', (e) => {
      this._muted = !e.detail;
      if (this._muted) this.stop();
    });

    console.log('[BGMEngine] 初始化完成');
  },

  /** 播放章节BGM（故事模式） */
  playChapter(chapterId) {
    if (this._muted) return;
    this._currentMode = 'story';
    this._currentChapter = chapterId;
    this.stop();

    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.load(chapterId);
      MidiBGM.setVolume(this._volume);
      MidiBGM.play();
      return;
    }
    if (typeof AudioManager !== 'undefined') {
      AudioManager.startBGM();
    }
  },

  /** 主菜单BGM */
  playMenu() {
    if (this._muted) return;
    this._currentMode = 'menu';
    this.stop();

    if (typeof MidiBGM !== 'undefined') {
      // 用第1章温暖主题作为菜单BGM
      MidiBGM.load(1);
      MidiBGM.setVolume(this._volume * 0.8);
      MidiBGM.play();
      return;
    }
    if (typeof AudioManager !== 'undefined') {
      AudioManager.startBGM();
    }
  },

  /** 速度谜题BGM */
  playPuzzle() {
    if (this._muted) return;
    this._currentMode = 'puzzle';
    this.stop();

    if (typeof MidiBGM !== 'undefined') {
      // 速度谜题用第4章（冷静推理）或第5章（星辰核心）
      MidiBGM.load(5);
      MidiBGM.setVolume(this._volume * 0.85);
      MidiBGM.play();
      return;
    }
    if (typeof AudioManager !== 'undefined') {
      AudioManager.startBGM();
    }
  },

  /** Boss战BGM */
  playBossBattle() {
    if (this._muted) return;
    if (typeof MidiBGM !== 'undefined') {
      this.stop();
      // 使用MidiBGM的Boss战BGM
      MidiBGM.setVolume(this._volume * 1.1);
      MidiBGM.playSpecial('boss_battle');
      return;
    }
    if (typeof AudioManager !== 'undefined' && AudioManager.startBossBGM) {
      AudioManager.stopBGM();
      AudioManager.startBossBGM();
    }
  },

  /** 播放角色主题曲 */
  playCharacterTheme(charId) {
    if (this._muted) return;
    if (typeof MidiBGM !== 'undefined') {
      // 角色ID映射到MidiBGM主题
      const themeMap = {
        'ray': 'ray',
        'cagekeeper': 'cagekeeper',
        'plotter': 'plotter',
        'plotterShadow': 'plotter',
        'remnant': 'cagekeeper',
        'weaver': 'weaver',
        'setterSecret': 'weaver'
      };
      const theme = themeMap[charId];
      if (theme) {
        MidiBGM.playTheme(theme);
      }
    }
  },

  /** 胜利BGM */
  playVictory() {
    if (this._muted) return;
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.playSpecial('victory');
      return;
    }
    if (typeof AudioManager !== 'undefined') {
      AudioManager.playWin();
    }
  },

  /** 破局号角 */
  playBreakthrough() {
    if (this._muted) return;
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.playSpecial('breakthrough_fanfare');
    }
  },

  /** 设置阶段 */
  setPhase(phase) {
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.setPhase(phase);
    }
    if (phase === 'breakthrough' && typeof AudioManager !== 'undefined') {
      AudioManager.startBreakthroughBGM();
    }
    if (phase === 'finishing' && typeof AudioManager !== 'undefined') {
      AudioManager.startFinishingBGM();
    }
  },

  /** 停止BGM */
  stop() {
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.stop();
    }
    if (typeof AudioManager !== 'undefined') {
      AudioManager.stopBGM();
      AudioManager.stopBossBGM();
    }
  },

  /** 暂停 */
  pause() {
    if (typeof MidiBGM !== 'undefined') MidiBGM.pause();
    if (typeof AudioManager !== 'undefined') AudioManager.pauseBGM();
  },

  /** 恢复 */
  resume() {
    if (typeof AudioManager === 'undefined') return;
    if (this._muted) return;
    AudioManager.resume();
    if (typeof MidiBGM !== 'undefined' && !MidiBGM.isPlaying) {
      if (this._currentMode === 'menu') this.playMenu();
      else if (this._currentMode === 'puzzle') this.playPuzzle();
      else if (this._currentChapter) this.playChapter(this._currentChapter);
    }
  },

  /** 设置音量 */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(0.7, v));
    if (typeof MidiBGM !== 'undefined') MidiBGM.setVolume(this._volume);
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
    if (typeof MidiBGM !== 'undefined' && MidiBGM.isPlaying) return true;
    if (typeof AudioManager !== 'undefined') return AudioManager.bgmPlaying;
    return false;
  }
};

// 导出到全局
if (typeof window !== 'undefined') {
  window.BGMEngine = BGMEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BGMEngine;
}
