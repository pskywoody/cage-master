// ==========================================
// 音效管理器（Web Audio API 程序化生成）
// ==========================================
const AudioManager = {
  ctx: null,
  enabled: true,
  bgmOscillators: [],
  bgmGain: null,
  bgmPlaying: false,
  sfxVolume: 0.3,
  bgmVolume: 0.1,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API 不支持');
      this.enabled = false;
    }
  },

  // 恢复音频上下文（需要用户交互后调用）
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  // ========== 基础音效生成 ==========

  // 简单的方波/正弦波音效
  _playTone(freq, duration, type = 'sine', volume = 1, attack = 0.01, release = 0.1) {
    if (!this.enabled || !this.ctx) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume * this.sfxVolume, this.ctx.currentTime + attack);
    gain.gain.setValueAtTime(volume * this.sfxVolume, this.ctx.currentTime + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },

  // 滑音（频率变化）
  _playSweep(startFreq, endFreq, duration, type = 'sine', volume = 1) {
    if (!this.enabled || !this.ctx) return;
    this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume * this.sfxVolume, this.ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(volume * this.sfxVolume, this.ctx.currentTime + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },

  // 噪音（用于攻击/爆炸效果）
  _playNoise(duration, volume = 1, filterFreq = 1000) {
    if (!this.enabled || !this.ctx) return;
    this.resume();

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume * this.sfxVolume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start();
    source.stop(this.ctx.currentTime + duration);
  },

  // ========== 游戏音效 ==========

  // 点击/选格
  playClick() {
    this._playTone(800, 0.05, 'sine', 0.3);
  },

  // 填对数字
  playCorrect() {
    this._playTone(523, 0.08, 'sine', 0.5);
    setTimeout(() => this._playTone(659, 0.08, 'sine', 0.5), 50);
    setTimeout(() => this._playTone(784, 0.12, 'sine', 0.5), 100);
  },

  // 填错数字
  playWrong() {
    this._playTone(200, 0.15, 'sawtooth', 0.3);
    setTimeout(() => this._playTone(150, 0.2, 'sawtooth', 0.3), 80);
  },

  // 擦除
  playErase() {
    this._playSweep(400, 200, 0.1, 'sine', 0.3);
  },

  // 普攻
  playAttackNormal() {
    this._playSweep(600, 200, 0.15, 'sawtooth', 0.4);
    this._playNoise(0.1, 0.2, 500);
  },

  // 重击
  playAttackHeavy() {
    this._playSweep(400, 100, 0.25, 'square', 0.5);
    this._playNoise(0.2, 0.3, 800);
    setTimeout(() => this._playTone(100, 0.2, 'sine', 0.4), 50);
  },

  // 必杀技
  playAttackUltimate() {
    // 上升音效
    this._playSweep(200, 1200, 0.4, 'sawtooth', 0.5);
    setTimeout(() => {
      // 爆炸
      this._playNoise(0.5, 0.5, 1500);
      this._playTone(80, 0.6, 'sine', 0.6);
      this._playTone(120, 0.5, 'sine', 0.4);
    }, 350);
  },

  // 被攻击
  playHit() {
    this._playNoise(0.15, 0.3, 600);
    this._playTone(150, 0.15, 'square', 0.3);
  },

  // 能量增加
  playEnergy() {
    this._playTone(1000, 0.05, 'sine', 0.2);
  },

  // 能量满提示
  playEnergyFull() {
    this._playTone(880, 0.1, 'sine', 0.4);
    setTimeout(() => this._playTone(1100, 0.1, 'sine', 0.4), 80);
    setTimeout(() => this._playTone(1320, 0.15, 'sine', 0.4), 160);
  },

  // 连击
  playCombo(combo) {
    const baseFreq = 440 + Math.min(combo, 20) * 30;
    this._playTone(baseFreq, 0.08, 'triangle', 0.3);
  },

  // 胜利
  playWin() {
    // 胜利旋律
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this._playTone(freq, 0.2, 'sine', 0.5), i * 120);
    });
    setTimeout(() => this._playTone(1047, 0.4, 'sine', 0.5), 480);
  },

  // 失败
  playLose() {
    const notes = [392, 349, 311, 262];
    notes.forEach((freq, i) => {
      setTimeout(() => this._playTone(freq, 0.25, 'sine', 0.4), i * 150);
    });
  },

  // 对战开始
  playBattleStart() {
    this._playTone(440, 0.1, 'sine', 0.4);
    setTimeout(() => this._playTone(554, 0.1, 'sine', 0.4), 100);
    setTimeout(() => this._playTone(659, 0.15, 'sine', 0.4), 200);
    setTimeout(() => {
      this._playTone(880, 0.3, 'sine', 0.5);
      this._playNoise(0.2, 0.2, 1000);
    }, 350);
  },

  // ========== 背景音乐 ==========

  // 简单的循环背景音乐（五声音阶随机旋律）
  startBGM() {
    if (!this.enabled || !this.ctx || this.bgmPlaying) return;
    this.resume();
    this.bgmPlaying = true;

    // 使用简单的五声音阶
    const scale = [262, 294, 330, 392, 440, 523, 587, 659]; // C大调五声
    let noteIndex = 0;
    let direction = 1;

    const playNextNote = () => {
      if (!this.bgmPlaying) return;

      const freq = scale[noteIndex % scale.length];
      const duration = 0.4 + Math.random() * 0.2;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(this.bgmVolume * 0.5, this.ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(this.bgmVolume * 0.5, this.ctx.currentTime + duration - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);

      // 随机变化
      if (Math.random() < 0.3) {
        direction = Math.random() < 0.5 ? 1 : -1;
      }
      noteIndex += direction;
      if (noteIndex < 0) noteIndex = 0;
      if (noteIndex >= scale.length) noteIndex = scale.length - 1;

      setTimeout(playNextNote, duration * 1000 * 0.8);
    };

    playNextNote();

    // 低音铺底
    const bassOsc = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(131, this.ctx.currentTime); // C3
    bassGain.gain.setValueAtTime(this.bgmVolume * 0.3, this.ctx.currentTime);
    bassOsc.connect(bassGain);
    bassGain.connect(this.ctx.destination);
    bassOsc.start();

    this.bgmOscillators.push(bassOsc);
    this.bgmGain = bassGain;
  },

  stopBGM() {
    this.bgmPlaying = false;
    this.bgmOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    this.bgmOscillators = [];
  },

  // 开关
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopBGM();
    }
    return this.enabled;
  }
};
