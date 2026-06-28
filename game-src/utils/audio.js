// ==========================================
// 音效管理器 v2.0（Web Audio API 程序化生成，音质升级版）
// ==========================================
const AudioManager = {
  ctx: null,
  enabled: true,
  bgmEnabled: true,
  sfxEnabled: true,
  masterGain: null,
  sfxGain: null,
  bgmGain: null,
  bgmNodes: [],
  bgmPlaying: false,
  bgmTimer: null,
  bossBgmMode: false,
  sfxVolume: 0.4,
  bgmVolume: 0.15,
  reverbBuffer: null,
  currentBGM: null,
  bgmIndex: 0,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 主音量
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);
      // 音效通道
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);
      // BGM通道
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.bgmVolume;
      this.bgmGain.connect(this.masterGain);
      // 创建简单混响
      this._createReverb();
      // 创建暗黑氛围drone缓冲区
      this._createDarkDrone();
      // 首次用户交互时自动恢复音频并启动BGM
      this._setupAutoStart();
    } catch (e) {
      console.warn('Web Audio API 不支持');
      this.enabled = false;
    }
  },

  // 暗黑氛围Drone（持续低频嗡鸣）
  _droneBuffer: null,
  _droneSource: null,
  _droneGain: null,
  _heartbeatTimer: null,

  _createDarkDrone() {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 8; // 8秒循环
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // 基础低音 D2 (73.4Hz) + 不和谐的三全音 A#2 (116.5Hz)
    const f1 = 73.42, f2 = 116.54, f3 = 55.0; // D2, A#2(tritone), A1
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // 多个不和谐正弦波叠加 + 缓慢LFO调制产生诡异波动
      const lfo1 = Math.sin(2 * Math.PI * 0.15 * t) * 0.3;
      const lfo2 = Math.sin(2 * Math.PI * 0.08 * t + 1.5) * 0.2;
      data[i] = (
        Math.sin(2 * Math.PI * f1 * t + lfo1) * 0.4 +
        Math.sin(2 * Math.PI * f2 * t + lfo2) * 0.3 +
        Math.sin(2 * Math.PI * f3 * t) * 0.25 +
        // 添加高次谐波制造金属质感
        Math.sin(2 * Math.PI * f1 * 2.01 * t) * 0.08 +
        Math.sin(2 * Math.PI * f2 * 1.99 * t) * 0.06
      ) * 0.5;
    }
    this._droneBuffer = buffer;
  },

  _startDrone(volume = 0.12) {
    if (!this._droneBuffer || !this.ctx) return;
    this._stopDrone();
    this._droneGain = this.ctx.createGain();
    this._droneGain.gain.value = 0;
    this._droneGain.connect(this.bgmGain);
    // 淡入
    this._droneGain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 3);
    this._droneSource = this.ctx.createBufferSource();
    this._droneSource.buffer = this._droneBuffer;
    this._droneSource.loop = true;
    this._droneSource.connect(this._droneGain);
    this._droneSource.start();
  },

  _stopDrone() {
    if (this._droneGain) {
      try { this._droneGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1); } catch(e) {}
    }
    if (this._droneSource) {
      try { setTimeout(() => { try { this._droneSource.stop(); } catch(e){} }, 1200); } catch(e) {}
      this._droneSource = null;
    }
  },

  // 心跳-like低频脉冲
  _startHeartbeat(bpm = 72, volume = 0.2) {
    this._stopHeartbeat();
    const interval = 60000 / bpm;
    const beat = () => {
      if (!this.bgmPlaying || !this.bossBgmMode) return;
      const now = this.ctx.currentTime;
      // 第一拍：重击
      const osc1 = this.ctx.createOscillator();
      const g1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(80, now);
      osc1.frequency.exponentialRampToValueAtTime(45, now + 0.15);
      g1.gain.setValueAtTime(0, now);
      g1.gain.linearRampToValueAtTime(volume, now + 0.02);
      g1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(g1);
      g1.connect(this.bgmGain);
      osc1.start(now);
      osc1.stop(now + 0.3);
      // 第二拍：回声（稍弱，延迟300ms）
      setTimeout(() => {
        if (!this.bgmPlaying || !this.bossBgmMode) return;
        const t2 = this.ctx.currentTime;
        const osc2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(70, t2);
        osc2.frequency.exponentialRampToValueAtTime(40, t2 + 0.12);
        g2.gain.setValueAtTime(0, t2);
        g2.gain.linearRampToValueAtTime(volume * 0.6, t2 + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.2);
        osc2.connect(g2);
        g2.connect(this.bgmGain);
        osc2.start(t2);
        osc2.stop(t2 + 0.25);
      }, 300);
    };
    beat();
    this._heartbeatTimer = setInterval(beat, interval);
  },

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  },

  // 首次用户交互时自动启动BGM
  _autoStarted: false,
  _setupAutoStart() {
    if (this._autoStarted) return;
    const startOnInteract = () => {
      if (this._autoStarted) return;
      this._autoStarted = true;
      this.resume();
      // 延迟一点启动普通BGM（不要在Boss战页面启动普通BGM）
      if (!this.bossBgmMode && this.bgmEnabled && !this.bgmPlaying) {
        setTimeout(() => this.startBGM(), 500);
      }
      document.removeEventListener('click', startOnInteract);
      document.removeEventListener('touchstart', startOnInteract);
      document.removeEventListener('keydown', startOnInteract);
    };
    document.addEventListener('click', startOnInteract, { once: true });
    document.addEventListener('touchstart', startOnInteract, { once: true });
    document.addEventListener('keydown', startOnInteract, { once: true });
  },

  // 创建简单算法混响（延迟网络模拟空间感）
  _createReverb() {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 1.5; // 1.5秒混响尾
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    this.reverbBuffer = impulse;
  },

  // 创建带混响的增益节点
  _createReverbSend(volume = 0.15) {
    if (!this.reverbBuffer) return null;
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this.reverbBuffer;
    const wetGain = this.ctx.createGain();
    wetGain.gain.value = volume;
    convolver.connect(wetGain);
    wetGain.connect(this.masterGain);
    return { convolver, wetGain };
  },

  // 恢复音频上下文
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  // ========== 基础音效单元 ==========

  // 播放单个音符（adsr包络）
  _playNote(freq, duration, type = 'sine', volume = 1, attack = 0.01, decay = 0.1, sustain = 0.6, release = 0.15, dest = null) {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const target = dest || this.sfxGain;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay);
    gain.gain.setValueAtTime(volume * sustain, now + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + duration + 0.05);
    return { osc, gain };
  },

  // 和弦（多音符同时）
  _playChord(freqs, duration, type = 'sine', volume = 0.5, attack = 0.01, release = 0.2) {
    freqs.forEach((f, i) => {
      setTimeout(() => this._playNote(f, duration, type, volume / freqs.length * 1.5, attack, 0.05, 0.7, release), i * 10);
    });
  },

  // 滑音（频率从start到end）
  _playSweep(startFreq, endFreq, duration, type = 'sine', volume = 1, attack = 0.02) {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.setValueAtTime(volume, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  },

  // 噪音生成（打击/爆炸/风声）
  _playNoise(duration, volume = 1, filterFreq = 2000, filterType = 'lowpass', filterEnd = 100) {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize * 0.3);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(filterEnd, 50), now + duration);
    filter.Q.value = 1;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(now);
    source.stop(now + duration + 0.05);
  },

  // 清脆的点击/敲击音（木质感）
  _playClick(freq = 1200, duration = 0.04, volume = 0.3) {
    this._playSweep(freq * 1.5, freq * 0.6, duration, 'triangle', volume, 0.001);
    this._playNoise(0.02, volume * 0.3, 4000, 'bandpass', 1000);
  },

  // 金属/铃铛泛音
  _playBell(freq, duration = 0.5, volume = 0.3) {
    const partials = [1, 2.76, 5.4, 8.93];
    const vols = [1, 0.5, 0.25, 0.12];
    partials.forEach((p, i) => {
      this._playNote(freq * p, duration * (1 - i * 0.15), 'sine', volume * vols[i], 0.005, 0.05, 0.3, duration * 0.6);
    });
  },

  // ========== 游戏核心音效 ==========

  // 点击/选格 - 清脆短促
  playClick() {
    this._playClick(1400, 0.035, 0.25);
  },

  // 填对数字 - 明亮的大三和弦上升，有铃铛泛音
  playCorrect() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    // C-E-G 和弦，逐个奏响（琶音）
    [523, 659, 784].forEach((freq, i) => {
      setTimeout(() => {
        this._playNote(freq, 0.25, 'triangle', 0.35, 0.005, 0.05, 0.5, 0.18);
        this._playNote(freq * 2, 0.15, 'sine', 0.1, 0.005, 0.03, 0.3, 0.12);
      }, i * 45);
    });
    // 顶层铃铛泛音
    setTimeout(() => this._playBell(1047, 0.4, 0.08), 80);
  },

  // 填错数字 - 低沉不和谐的摩擦感
  playWrong() {
    this._playSweep(180, 120, 0.25, 'sawtooth', 0.25, 0.01);
    this._playNote(147, 0.3, 'square', 0.12, 0.01, 0.05, 0.5, 0.2);
    // 不和谐音程（小二度）
    setTimeout(() => this._playNote(156, 0.2, 'sawtooth', 0.15, 0.01, 0.03, 0.4, 0.15), 30);
    this._playNoise(0.15, 0.08, 400, 'lowpass', 100);
  },

  // 擦除 - 像擦掉铅笔字的"沙"声
  playErase() {
    this._playSweep(500, 200, 0.12, 'triangle', 0.2, 0.01);
    this._playNoise(0.08, 0.12, 3000, 'highpass', 500);
  },

  // ========== 对战模式音效 ==========

  // 普攻
  playAttackNormal() {
    this._playSweep(500, 150, 0.12, 'sawtooth', 0.3, 0.01);
    this._playNoise(0.1, 0.2, 800, 'lowpass', 200);
  },

  // 重击
  playAttackHeavy() {
    this._playSweep(300, 60, 0.2, 'square', 0.35, 0.01);
    this._playNoise(0.25, 0.3, 600, 'lowpass', 80);
    setTimeout(() => {
      this._playNote(80, 0.3, 'sine', 0.4, 0.005, 0.05, 0.6, 0.25);
    }, 40);
  },

  // 必杀技
  playAttackUltimate() {
    // 上升蓄力
    this._playSweep(150, 800, 0.4, 'sawtooth', 0.3, 0.02);
    setTimeout(() => {
      // 爆炸
      this._playNoise(0.5, 0.4, 2000, 'lowpass', 100);
      this._playNote(60, 0.6, 'sine', 0.5, 0.005, 0.1, 0.7, 0.5);
      this._playNote(90, 0.5, 'triangle', 0.3, 0.005, 0.1, 0.5, 0.4);
      // 金属回响
      setTimeout(() => this._playBell(400, 0.6, 0.1), 50);
    }, 300);
  },

  // 被攻击
  playHit() {
    this._playNoise(0.12, 0.25, 500, 'lowpass', 100);
    this._playNote(130, 0.15, 'square', 0.2, 0.005, 0.02, 0.4, 0.1);
  },

  // 能量增加
  playEnergy() {
    this._playNote(1200, 0.05, 'sine', 0.15, 0.002);
  },

  // 能量满
  playEnergyFull() {
    [880, 1109, 1319].forEach((f, i) => {
      setTimeout(() => this._playNote(f, 0.2, 'triangle', 0.3, 0.01, 0.03, 0.5, 0.15), i * 70);
    });
    setTimeout(() => this._playBell(1319, 0.5, 0.08), 150);
  },

  // 连击
  playCombo(combo) {
    const baseFreq = 440 + Math.min(combo, 20) * 35;
    this._playNote(baseFreq, 0.08, 'triangle', 0.25, 0.005);
    if (combo >= 5) this._playNote(baseFreq * 1.5, 0.06, 'sine', 0.1, 0.005);
    if (combo >= 10) setTimeout(() => this._playBell(baseFreq * 2, 0.2, 0.05), 30);
  },

  // 胜利 - 更丰富的胜利旋律
  playWin() {
    const melody = [
      { f: 523, d: 0.15 }, { f: 659, d: 0.15 }, { f: 784, d: 0.15 }, { f: 1047, d: 0.4 }
    ];
    melody.forEach((n, i) => {
      setTimeout(() => {
        this._playNote(n.f, n.d, 'triangle', 0.35, 0.01, 0.05, 0.6, n.d * 0.5);
        this._playNote(n.f * 2, n.d * 0.7, 'sine', 0.08, 0.01, 0.03, 0.3, n.d * 0.4);
      }, i * 130);
    });
    // 结尾和弦
    setTimeout(() => {
      this._playChord([523, 659, 784], 0.6, 'sine', 0.25, 0.02, 0.4);
      this._playBell(1047, 0.8, 0.1);
    }, 550);
  },

  // 失败 - 下降的悲伤旋律
  playLose() {
    const melody = [
      { f: 392, d: 0.2 }, { f: 349, d: 0.2 }, { f: 311, d: 0.2 }, { f: 262, d: 0.5 }
    ];
    melody.forEach((n, i) => {
      setTimeout(() => {
        this._playNote(n.f, n.d, 'sine', 0.3, 0.02, 0.08, 0.5, n.d * 0.6);
      }, i * 180);
    });
    // 低音沉下去
    setTimeout(() => {
      this._playSweep(200, 80, 0.6, 'sine', 0.15, 0.05);
    }, 600);
  },

  // 对战开始 - 更有冲击力的开赛音效
  playBattleStart() {
    // 倒计时感：三二一冲！
    [440, 554, 659].forEach((f, i) => {
      setTimeout(() => {
        this._playNote(f, 0.12, 'triangle', 0.35, 0.005, 0.02, 0.5, 0.08);
      }, i * 150);
    });
    setTimeout(() => {
      // GO! 冲击
      this._playNote(880, 0.3, 'square', 0.3, 0.005, 0.05, 0.4, 0.2);
      this._playNote(1319, 0.25, 'sine', 0.15, 0.005, 0.03, 0.3, 0.15);
      this._playNoise(0.2, 0.25, 1500, 'bandpass', 300);
      this._playNote(110, 0.4, 'sine', 0.3, 0.005, 0.1, 0.6, 0.3);
    }, 450);
  },

  // ========== 迷雾对战专属音效 ==========

  // AI填了一格 - 幽灵般的细微声响，让玩家感知对手在动
  playAiFill() {
    // 极轻微的幽灵音，在背景中
    this._playNote(600 + Math.random() * 200, 0.08, 'sine', 0.06, 0.01);
    this._playNoise(0.05, 0.04, 2000, 'bandpass', 800);
  },

  // 抢格子成功！- 爽快的"叮"声
  playSteal() {
    // 上升的"嗖"声
    this._playSweep(400, 1200, 0.15, 'triangle', 0.2, 0.01);
    // 成功的铃声
    setTimeout(() => {
      this._playBell(1200, 0.3, 0.12);
      this._playNote(1568, 0.15, 'sine', 0.1, 0.005, 0.02, 0.4, 0.1);
    }, 80);
    this._playNoise(0.06, 0.08, 3000, 'bandpass', 1500);
  },

  // 遭遇对手 - 根据距离档给出不同紧张度
  playEncounter(level) {
    if (level === 'near') {
      // 近距离遭遇：紧张的冲击音
      this._playNoise(0.2, 0.2, 3000, 'bandpass', 200);
      this._playSweep(800, 200, 0.3, 'sawtooth', 0.2, 0.01);
      this._playNote(150, 0.25, 'square', 0.15, 0.01, 0.05, 0.4, 0.2);
    } else if (level === 'mid') {
      // 中距离：警告音
      this._playSweep(400, 600, 0.15, 'triangle', 0.12, 0.01);
      setTimeout(() => this._playSweep(600, 400, 0.12, 'triangle', 0.1), 100);
    } else {
      // 远距离：微弱的存在感
      this._playNote(500, 0.1, 'sine', 0.06, 0.01);
      this._playNoise(0.04, 0.03, 1500, 'bandpass', 500);
    }
  },

  // 60%预警 - 警报音
  playWarning() {
    // 急促的警报脉冲
    [0, 150, 300].forEach(i => {
      setTimeout(() => {
        this._playNote(880, 0.1, 'square', 0.2, 0.005, 0.02, 0.3, 0.08);
        this._playNote(660, 0.1, 'square', 0.15, 0.005, 0.02, 0.3, 0.08);
      }, i);
    });
    // 低频压迫感
    this._playNote(100, 0.5, 'sawtooth', 0.1, 0.02, 0.1, 0.4, 0.3);
  },

  // 迷雾散开/视野扩展 - 魔法般的清脆音
  playFogReveal() {
    // 竖琴/风铃般的上行泛音
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      setTimeout(() => {
        this._playNote(f, 0.3 - i * 0.03, 'sine', 0.08 - i * 0.01, 0.005, 0.05, 0.3, 0.2);
      }, i * 40);
    });
    this._playNoise(0.08, 0.05, 4000, 'highpass', 1000);
  },

  // 倒计时滴答
  playCountdownTick() {
    this._playClick(1000, 0.04, 0.2);
  },

  // ========== 背景音乐（版权开放古典名曲）==========
  
  // 音符频率表（中央C开始的音阶）
  _NOTES: {
    'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'B2': 123.47,
    'C#2': 69.30, 'D#2': 77.78, 'F#2': 92.50, 'G#2': 103.83, 'A#2': 116.54,
    'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'C6': 1046.50, 'D6': 1174.66, 'E6': 1318.51, 'F6': 1396.91, 'G6': 1567.98, 'A6': 1760.00, 'B6': 1975.53,
    'C#4': 277.18, 'D#4': 311.13, 'F#4': 369.99, 'G#4': 415.30, 'A#4': 466.16,
    'C#5': 554.37, 'D#5': 622.25, 'F#5': 739.99, 'G#5': 830.61, 'A#5': 932.33,
    'Eb4': 311.13, 'Ab4': 415.30, 'Bb4': 466.16, 'Eb5': 622.25, 'Ab5': 830.61, 'Bb5': 932.33,
    'R': 0 // 休止符
  },

  // 古典名曲库（版权开放）
  _bgmTracks: [
    {
      name: '致爱丽丝',
      composer: '贝多芬',
      bpm: 120,
      // [音符, 拍数]
      melody: [
        ['E5',0.5],['D#5',0.5],['E5',0.5],['D#5',0.5],['E5',0.5],['B4',0.5],['D5',0.5],['C5',0.5],
        ['A4',1],['R',0.5],['C4',0.5],['E4',0.5],['A4',0.5],['B4',1],['R',0.5],
        ['E4',0.5],['G#4',0.5],['B4',0.5],['C5',1],['R',0.5],['E4',0.5],['E5',0.5],['D#5',0.5],
        ['E5',0.5],['D#5',0.5],['E5',0.5],['B4',0.5],['D5',0.5],['C5',0.5],
        ['A4',1],['R',0.5],['C4',0.5],['E4',0.5],['A4',0.5],['B4',1],['R',0.5],
        ['E4',0.5],['C5',0.5],['B4',0.5],['A4',2]
      ],
      bass: [
        ['A3',2],['E3',2],['A3',2],['E3',2],
        ['A3',2],['E3',2],['A3',2],['E3',2]
      ],
      type: 'piano'
    },
    {
      name: 'G弦上的咏叹调',
      composer: '巴赫',
      bpm: 60,
      melody: [
        ['D4',2],['F#4',1],['A4',1],['G4',2],['F#4',1],['D4',1],
        ['E4',2],['G4',1],['F#4',1],['E4',2],['D4',2],
        ['C4',2],['E4',1],['G4',1],['F#4',2],['E4',1],['C4',1],
        ['D4',4],['R',2]
      ],
      bass: [
        ['D3',4],['A3',4],['G3',4],['D3',4]
      ],
      type: 'strings'
    },
    {
      name: '小夜曲',
      composer: '莫扎特',
      bpm: 100,
      melody: [
        ['G4',0.5],['D5',0.5],['G5',0.5],['D5',0.5],['G5',0.5],['D5',0.5],['G5',1],
        ['E5',0.5],['C5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['C5',0.5],['E5',1],
        ['D5',0.5],['B4',0.5],['D5',0.5],['B4',0.5],['D5',0.5],['B4',0.5],['D5',1],
        ['G4',0.5],['D5',0.5],['G5',0.5],['D5',0.5],['G5',0.5],['D5',0.5],['G5',1]
      ],
      bass: [
        ['G3',1],['D3',1],['G3',1],['D3',1],
        ['C3',1],['G3',1],['C3',1],['G3',1],
        ['D3',1],['A3',1],['D3',1],['A3',1],
        ['G3',1],['D3',1],['G3',1],['D3',1]
      ],
      type: 'classical'
    },
    {
      name: '欢乐颂',
      composer: '贝多芬',
      bpm: 90,
      melody: [
        ['E4',1],['E4',1],['F4',1],['G4',1],['G4',1],['F4',1],['E4',1],['D4',1],
        ['C4',1],['C4',1],['D4',1],['E4',1],['E4',1.5],['D4',0.5],['D4',2],
        ['E4',1],['E4',1],['F4',1],['G4',1],['G4',1],['F4',1],['E4',1],['D4',1],
        ['C4',1],['C4',1],['D4',1],['E4',1],['D4',1.5],['C4',0.5],['C4',2]
      ],
      bass: [
        ['C3',2],['G3',2],['C3',2],['G3',2],
        ['F3',2],['C3',2],['G3',2],['C3',2]
      ],
      type: 'orchestra'
    }
  ],

  // Boss战/迷雾对战专用BGM - 暗黑恐怖悬疑风格
  _bossBgmTracks: [
    {
      name: '暗影低语',
      mood: 'dark_ambient',
      bpm: 60,
      // 缓慢不和谐的pad旋律（D小调，三全音间隔，诡异氛围）
      melody: [
        ['D4',3],['A#4',1],['G4',2],['R',1],
        ['D4',2],['F4',0.5],['G#4',0.5],['A4',2],['G4',1],
        ['C#4',3],['G4',1],['F4',2],['R',1],
        ['D4',2],['A#4',2],['A4',1],['G4',1],['D4',2]
      ],
      bass: [
        ['D2',4],['D#2',4],
        ['C#2',4],['D2',4]
      ],
      type: 'horror_pad'
    },
    {
      name: '幽灵追逐',
      mood: 'chase',
      bpm: 140,
      // 急促的半音阶追逐（A小调，快速断奏）
      melody: [
        ['A4',0.2],['A#4',0.2],['B4',0.2],['C5',0.2],['B4',0.2],['A#4',0.2],['A4',0.2],['G#4',0.2],
        ['A4',0.2],['B4',0.2],['C5',0.2],['D5',0.2],['C5',0.2],['B4',0.2],['A4',0.2],['G#4',0.2],
        ['G4',0.2],['G#4',0.2],['A4',0.2],['A#4',0.2],['A4',0.2],['G#4',0.2],['G4',0.2],['F#4',0.2],
        ['E4',0.2],['F4',0.2],['F#4',0.2],['G4',0.2],['A4',0.4],['R',0.4]
      ],
      bass: [
        ['A2',0.4],['A#2',0.4],['B2',0.4],['C3',0.4],
        ['A2',0.4],['A#2',0.4],['B2',0.4],['C3',0.4],
        ['G2',0.4],['G#2',0.4],['A2',0.4],['A#2',0.4],
        ['E2',0.4],['F2',0.4],['F#2',0.4],['G2',0.4]
      ],
      type: 'chase'
    },
    {
      name: '丧钟回响',
      mood: 'ominous',
      bpm: 48,
      // 缓慢的钟声+不和谐音程（丧钟感）
      melody: [
        ['D4',4],['A#4',2],['R',2],
        ['F4',3],['C#5',1],['R',2],
        ['D4',2],['G#4',2],['D5',2],['R',2],
        ['A#4',4],['A4',2],['R',2]
      ],
      bass: [
        ['D2',8],
        ['C#2',8],
        ['D2',4],['D#2',4]
      ],
      type: 'dark_bell'
    }
  ],

  // 播放一个音符（用于BGM）—— 支持暗黑恐怖音色
  _playBGMNote(freq, duration, type, volume, dest) {
    if (!this.enabled || !this.ctx || freq === 0) return;
    const target = dest || this.bgmGain;
    const now = this.ctx.currentTime;
    
    // 根据类型选择音色
    let oscType = type || 'triangle';
    let vol = volume || 0.04;
    let attack = 0.02, decay = 0.1, sustain = 0.5, release = 0.3;
    let useFilter = false, filterFreq = 2000, filterQ = 1;
    let useDetune = false;
    
    if (type === 'strings') {
      oscType = 'sine';
      attack = 0.1; release = 0.5; vol = volume * 0.8;
    } else if (type === 'piano') {
      oscType = 'triangle';
      decay = 0.2; sustain = 0.3; release = 0.4;
    } else if (type === 'orchestra') {
      oscType = 'square';
      vol = volume * 0.6;
    } else if (type === 'suspense') {
      // 悬疑音色：锯齿波+低通滤波，更暗更压迫
      oscType = 'sawtooth';
      vol = volume * 0.8;
      attack = 0.08; decay = 0.2; sustain = 0.5; release = 0.8;
      useFilter = true; filterFreq = 800; filterQ = 3;
    } else if (type === 'chase') {
      // 追逐音色：尖锐的square脉冲，更急促
      oscType = 'square';
      vol = volume * 0.7;
      attack = 0.005; decay = 0.05; sustain = 0.15; release = 0.1;
    } else if (type === 'mystery') {
      // 神秘音色：sine+长释音，带微走调
      oscType = 'sine';
      vol = volume * 0.7;
      attack = 0.2; decay = 0.4; sustain = 0.5; release = 1.2;
      useDetune = true;
    } else if (type === 'dark_bell') {
      // 暗黑钟声/音乐盒：不和谐泛音
      oscType = 'triangle';
      vol = volume * 0.9;
      attack = 0.005; decay = 0.3; sustain = 0.2; release = 1.5;
      useFilter = true; filterFreq = 3000; filterQ = 2;
    } else if (type === 'horror_pad') {
      // 恐怖pad：锯齿+低通，缓慢起伏
      oscType = 'sawtooth';
      vol = volume * 0.5;
      attack = 0.5; decay = 0.3; sustain = 0.7; release = 1.5;
      useFilter = true; filterFreq = 600; filterQ = 5;
    } else if (type === 'heartbeat') {
      // 心跳低频
      oscType = 'sine';
      vol = volume * 1.0;
      attack = 0.01; decay = 0.1; sustain = 0.1; release = 0.2;
    } else if (type === 'screech') {
      // 尖锐刺耳音效（不和谐高音）
      oscType = 'sawtooth';
      vol = volume * 0.4;
      attack = 0.02; decay = 0.1; sustain = 0.3; release = 0.3;
      useFilter = true; filterFreq = 4000; filterQ = 8;
    }
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = oscType;
    osc.frequency.setValueAtTime(freq, now);
    if (useDetune) {
      osc.detune.setValueAtTime(Math.random() * 10 - 5, now);
    }
    
    let node = osc;
    if (useFilter) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, now);
      filter.Q.value = filterQ;
      osc.connect(filter);
      filter.connect(gain);
      node = filter;
    } else {
      osc.connect(gain);
    }
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.linearRampToValueAtTime(vol * sustain, now + attack + decay);
    gain.gain.setValueAtTime(vol * sustain, now + Math.max(0, duration - release));
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + duration + release + 0.1);
    this.bgmNodes.push(osc);
  },

  // 暗黑音效：金属撞击/铁链声（用于Boss战点缀）
  _playDarkClank(volume = 0.15) {
    if (!this.enabled || !this.ctx || !this.bgmPlaying) return;
    const now = this.ctx.currentTime;
    // 金属撞击：高频噪音+带通滤波+快速衰减
    const dur = 0.4;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500 + Math.random() * 2000;
    filter.Q.value = 8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    source.connect(filter);
    filter.connect(g);
    g.connect(this.bgmGain);
    source.start(now);
    source.stop(now + dur);
  },

  // 诡异音乐盒旋律（随机不和谐音符点缀）
  _playCreepyMusicBox(volume = 0.08) {
    if (!this.enabled || !this.ctx || !this.bgmPlaying || !this.bossBgmMode) return;
    // 不和谐音阶（半音/三全音）
    const notes = ['C5','C#5','D5','D#5','F5','F#5','G5','G#5','A5','A#5'];
    const note = notes[Math.floor(Math.random() * notes.length)];
    const freq = this._NOTES[note];
    if (!freq) return;
    const dur = 0.8 + Math.random() * 1.2;
    this._playBGMNote(freq, dur, 'dark_bell', volume * (0.5 + Math.random() * 0.5));
  },

  // 改进的BGM：循环播放古典名曲
  startBGM() {
    if (!this.enabled || !this.ctx || this.bgmPlaying || !this.bgmEnabled) return;
    this.resume();
    this.bgmPlaying = true;
    this.bgmNodes = [];
    
    // 随机选一首曲子
    this.bgmIndex = Math.floor(Math.random() * this._bgmTracks.length);
    this._playTrack(this._bgmTracks[this.bgmIndex]);
  },
  
  _playTrack(track) {
    if (!this.bgmPlaying) return;
    this.currentBGM = track;
    
    const beatMs = 60000 / track.bpm;
    
    // 独立播放旋律
    const playMelody = () => {
      if (!this.bgmPlaying) return;
      let idx = 0;
      const playNext = () => {
        if (!this.bgmPlaying) return;
        if (idx >= track.melody.length) return;
        const [note, beats] = track.melody[idx];
        const freq = this._NOTES[note] || 0;
        const dur = beats * beatMs / 1000;
        if (freq > 0) {
          this._playBGMNote(freq, dur, track.type, 0.12);
        }
        idx++;
        if (idx < track.melody.length) {
          this.bgmTimerMelody = setTimeout(playNext, beats * beatMs);
        }
      };
      playNext();
    };
    
    // 独立播放低音
    const playBass = () => {
      if (!this.bgmPlaying) return;
      let idx = 0;
      const playNext = () => {
        if (!this.bgmPlaying) return;
        if (idx >= track.bass.length) return;
        const [note, beats] = track.bass[idx];
        const freq = this._NOTES[note] || 0;
        const dur = beats * beatMs / 1000;
        if (freq > 0) {
          setTimeout(() => {
            if (this.bgmPlaying) {
              this._playBGMNote(freq, dur, 'sine', 0.08);
            }
          }, 80);
        }
        idx++;
        if (idx < track.bass.length) {
          this.bgmTimerBass = setTimeout(playNext, beats * beatMs);
        }
      };
      playNext();
    };
    
    playMelody();
    playBass();
    
    // 计算曲目总时长，播完后换曲
    let totalBeats = 0;
    track.melody.forEach(([, b]) => totalBeats += b);
    const totalMs = totalBeats * beatMs + 2500;
    
    this.bgmTimer = setTimeout(() => {
      if (this.bgmPlaying) {
        // 清理定时器
        if (this.bgmTimerMelody) clearTimeout(this.bgmTimerMelody);
        if (this.bgmTimerBass) clearTimeout(this.bgmTimerBass);
        this.bgmIndex = (this.bgmIndex + 1) % this._bgmTracks.length;
        this._playTrack(this._bgmTracks[this.bgmIndex]);
      }
    }, totalMs);
  },

  stopBGM() {
    this.bgmPlaying = false;
    this.bossBgmMode = false;
    this._phase = null;
    this._stopBreakthroughHeartbeat();
    if (this.bgmTimer) { clearTimeout(this.bgmTimer); this.bgmTimer = null; }
    if (this.bgmTimerMelody) {
      clearTimeout(this.bgmTimerMelody);
      this.bgmTimerMelody = null;
    }
    if (this.bgmTimerBass) {
      clearTimeout(this.bgmTimerBass);
      this.bgmTimerBass = null;
    }
    this.bgmNodes.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    this.bgmNodes = [];
  },

  /**
   * 开始Boss战BGM（暗黑恐怖悬疑风格）
   */
  startBossBGM() {
    if (!this.enabled || !this.ctx || !this.bgmEnabled) return;
    this.resume();
    // 如果正在播放普通BGM，先停止
    if (this.bgmPlaying) {
      this.stopBGM();
    }
    this.bgmPlaying = true;
    this.bossBgmMode = true;
    this.bgmNodes = [];

    // 启动暗黑drone氛围（持续低频嗡鸣）
    this._startDrone(0.1);

    // 根据曲目mood选择心跳速度
    setTimeout(() => {
      if (this.bossBgmMode && this.bgmPlaying) {
        const track = this._bossBgmTracks[this.bgmIndex];
        const hbBpm = track && track.mood === 'chase' ? 96 : 66;
        this._startHeartbeat(hbBpm, 0.25);
      }
    }, 2000);

    // 启动诡异音乐盒（随机间隔点缀）
    this._musicBoxTimer = setInterval(() => {
      if (this.bgmPlaying && this.bossBgmMode && Math.random() < 0.4) {
        this._playCreepyMusicBox(0.06);
      }
      // 偶尔金属撞击
      if (Math.random() < 0.15) {
        this._playDarkClank(0.08);
      }
    }, 4000);

    // 随机选一首Boss战BGM
    this.bgmIndex = Math.floor(Math.random() * this._bossBgmTracks.length);
    this._playBossTrack(this._bossBgmTracks[this.bgmIndex]);
  },

  /**
   * 播放Boss战BGM曲目（循环切换）
   */
  _playBossTrack(track) {
    if (!this.bgmPlaying) return;
    this.currentBGM = track;

    const beatMs = 60000 / track.bpm;

    // 根据曲目类型选择bass音色
    const bassType = track.type === 'dark_bell' ? 'dark_bell' :
                     track.type === 'horror_pad' ? 'horror_pad' : 'suspense';

    // 播放旋律
    const playMelody = () => {
      if (!this.bgmPlaying) return;
      let idx = 0;
      const playNext = () => {
        if (!this.bgmPlaying) return;
        if (idx >= track.melody.length) return;
        const [note, beats] = track.melody[idx];
        const freq = this._NOTES[note] || 0;
        const dur = beats * beatMs / 1000;
        if (freq > 0) {
          this._playBGMNote(freq, dur, track.type, 0.1);
        }
        idx++;
        if (idx < track.melody.length) {
          this.bgmTimerMelody = setTimeout(playNext, beats * beatMs);
        }
      };
      playNext();
    };

    // 播放低音
    const playBass = () => {
      if (!this.bgmPlaying) return;
      let idx = 0;
      const playNext = () => {
        if (!this.bgmPlaying) return;
        if (idx >= track.bass.length) return;
        const [note, beats] = track.bass[idx];
        const freq = this._NOTES[note] || 0;
        const dur = beats * beatMs / 1000;
        if (freq > 0) {
          setTimeout(() => {
            if (this.bgmPlaying) {
              this._playBGMNote(freq, dur, bassType, 0.08);
            }
          }, 60);
        }
        idx++;
        if (idx < track.bass.length) {
          this.bgmTimerBass = setTimeout(playNext, beats * beatMs);
        }
      };
      playNext();
    };

    playMelody();
    playBass();

    // 计算总时长，播完后切换下一首
    let totalBeats = 0;
    track.melody.forEach(([, b]) => totalBeats += b);
    const totalMs = totalBeats * beatMs + 2000;

    this.bgmTimer = setTimeout(() => {
      if (this.bgmPlaying && this.bossBgmMode) {
        if (this.bgmTimerMelody) clearTimeout(this.bgmTimerMelody);
        if (this.bgmTimerBass) clearTimeout(this.bgmTimerBass);
        this.bgmIndex = (this.bgmIndex + 1) % this._bossBgmTracks.length;
        // 切换心跳速度
        const nextTrack = this._bossBgmTracks[this.bgmIndex];
        this._stopHeartbeat();
        const hbBpm = nextTrack.mood === 'chase' ? 100 : 60;
        setTimeout(() => this._startHeartbeat(hbBpm, 0.25), 1000);
        this._playBossTrack(nextTrack);
      }
    }, totalMs);
  },

  /**
   * 停止Boss战BGM，恢复普通BGM
   */
  stopBossBGM() {
    const wasPlaying = this.bgmPlaying;
    // 停止drone和心跳
    this._stopDrone();
    this._stopHeartbeat();
    if (this._musicBoxTimer) {
      clearInterval(this._musicBoxTimer);
      this._musicBoxTimer = null;
    }
    this.stopBGM();
    if (wasPlaying && this.bgmEnabled) {
      // 短暂停顿后恢复普通BGM
      setTimeout(() => this.startBGM(), 1500);
    }
  },
  
  // 切换BGM开关
  toggleBGM() {
    this.bgmEnabled = !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopBGM();
    }
    return this.bgmEnabled;
  },

  // ========== 阶段BGM ==========
  /**
   * 破局阶段BGM：紧张悬疑感（不切歌，通过添加低频脉冲+提高bass intensity来营造紧张感）
   */
  startBreakthroughBGM() {
    if (!this.enabled || !this.ctx || !this.bgmEnabled) return;
    this.resume();
    this._phase = 'breakthrough';

    // 添加紧张心跳节奏（如果还没有）
    if (!this._breakthroughHeartbeat) {
      this._startBreakthroughHeartbeat();
    }

    // 稍微提高BGM音量增加紧张感
    if (this.bgmGain) {
      this.bgmGain.gain.linearRampToValueAtTime(this.bgmVolume * 1.3, this.ctx.currentTime + 2);
    }
  },

  /**
   * 收官阶段BGM：胜利感，上行琶音+高频bell
   */
  startFinishingBGM() {
    if (!this.enabled || !this.ctx || !this.bgmEnabled) return;
    this.resume();
    this._phase = 'finishing';

    // 停止破局心跳
    this._stopBreakthroughHeartbeat();

    // 恢复正常音量
    if (this.bgmGain) {
      this.bgmGain.gain.linearRampToValueAtTime(this.bgmVolume, this.ctx.currentTime + 1);
    }

    // 播放一串上行胜利音符
    this._playVictoryFanfare();
  },

  /**
   * 破局心跳：低频脉冲
   */
  _startBreakthroughHeartbeat() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const hbGain = ctx.createGain();
    hbGain.gain.value = 0;
    hbGain.connect(this.masterGain || ctx.destination);
    this._breakthroughHb = hbGain;

    const tick = () => {
      if (this._phase !== 'breakthrough' || !this.bgmPlaying) return;
      const t = ctx.currentTime;
      // 心跳"咚"声
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g); g.connect(hbGain);
      osc.start(t); osc.stop(t + 0.35);
      // 第二声（双跳）
      setTimeout(() => {
        if (this._phase !== 'breakthrough') return;
        const t2 = ctx.currentTime;
        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(90, t2);
        osc2.frequency.exponentialRampToValueAtTime(45, t2 + 0.1);
        g2.gain.setValueAtTime(0, t2);
        g2.gain.linearRampToValueAtTime(0.08, t2 + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.2);
        osc2.connect(g2); g2.connect(hbGain);
        osc2.start(t2); osc2.stop(t2 + 0.25);
      }, 200);
    };
    // 每1.2秒一次心跳
    this._breakthroughHbTimer = setInterval(tick, 1200);
    tick();
  },

  _stopBreakthroughHeartbeat() {
    if (this._breakthroughHbTimer) { clearInterval(this._breakthroughHbTimer); this._breakthroughHbTimer = null; }
    if (this._breakthroughHb) {
      try { this._breakthroughHb.disconnect(); } catch(e){}
      this._breakthroughHb = null;
    }
  },

  /**
   * 胜利号角：上行琶音
   */
  _playVictoryFanfare() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
    const bellGain = ctx.createGain();
    bellGain.gain.value = 0.08;
    bellGain.connect(this.masterGain || ctx.destination);

    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.15;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.1, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(g); g.connect(bellGain);
      osc.start(t); osc.stop(t + 0.9);
    });
    // 清理
    setTimeout(() => { try { bellGain.disconnect(); } catch(e){} }, 2000);
  },
  
  // 切换音效开关
  toggleSfx() {
    this.sfxEnabled = !this.sfxEnabled;
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
    }
    return this.sfxEnabled;
  },

  // 设置音效开关（供设置页面使用）
  setSfxEnabled(enabled) {
    this.sfxEnabled = !!enabled;
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
    }
  },

  // 设置BGM开关（供设置页面使用）
  setBgmEnabled(enabled) {
    this.bgmEnabled = !!enabled;
    if (!this.bgmEnabled) {
      this.stopBGM();
    } else {
      this.startBGM();
    }
  },

  // 暂停BGM
  pauseBGM() {
    if (this.bgmPlaying) {
      this.stopBGM();
      this._bgmPausedByUser = true;
    }
  },

  // 恢复BGM
  resumeBGM() {
    if (this.bgmEnabled && this._bgmPausedByUser) {
      this._bgmPausedByUser = false;
      this.startBGM();
    } else if (this.bgmEnabled && !this.bgmPlaying) {
      this.startBGM();
    }
  },

  // 设置音量
  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain && this.sfxEnabled) this.sfxGain.gain.value = this.sfxVolume;
  },
  setBgmVolume(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmGain) this.bgmGain.gain.value = this.bgmVolume;
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
