// ==========================================
// 音效管理�?v2.0（Web Audio API 程序化生成，音质升级版）
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
      // 优先使用 AudioPlayer 桥接（统一管理 AudioContext 生命周期�?      if (typeof AudioPlayer !== 'undefined' && AudioPlayer.init) {
        AudioPlayer.init();
        this.ctx = AudioPlayer.ctx;
        if (!this.ctx) {
          this.enabled = false;
          return;
        }
      } else {
        // 降级：自己创�?AudioContext
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      // 主音�?      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);
      // 音效通道
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);
      // BGM通道
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.bgmVolume;
      // BGM 低通滤波器（插入在 bgmGain �?masterGain 之间�?      this._bgmFilter = this.ctx.createBiquadFilter();
      this._bgmFilter.type = 'lowpass';
      this._bgmFilter.frequency.value = 20000; // 默认全�?      this.bgmGain.connect(this._bgmFilter);
      this._bgmFilter.connect(this.masterGain);
      // BGM 强度状�?      this._currentIntensity = 'Normal';
      this._pendingFilter = null;
      // 创建简单混�?      this._createReverb();
      // 创建暗黑氛围drone缓冲�?      this._createDarkDrone();
      // 首次用户交互时自动恢复音频并启动BGM
      this._setupAutoStart();
    } catch (e) {
      console.warn('Web Audio API 不支�?);
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
    const length = sampleRate * 8; // 8秒循�?    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // 基础低音 D2 (73.4Hz) + 不和谐的三全�?A#2 (116.5Hz)
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
        // 添加高次谐波制造金属质�?        Math.sin(2 * Math.PI * f1 * 2.01 * t) * 0.08 +
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
      // 第二拍：回声（稍弱，延迟300ms�?      setTimeout(() => {
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

  // 检测是否有其他BGM系统在运行（MidiBGM / BGMEngine�?  _hasMidiBGM() {
    return typeof MidiBGM !== 'undefined' || typeof BGMEngine !== 'undefined';
  },

  // 首次用户交互时自动启动BGM
  _autoStarted: false,
  _setupAutoStart() {
    if (this._autoStarted) return;
    const startOnInteract = () => {
      if (this._autoStarted) return;
      this._autoStarted = true;
      this.resume();
      // 如果MIDI系统可用，不启动旧的古典BGM
      if (!this._hasMidiBGM()) {
        if (!this.bossBgmMode && this.bgmEnabled && !this.bgmPlaying) {
          setTimeout(() => this.startBGM(), 500);
        }
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

  // 恢复音频上下�?  resume() {
    if (typeof AudioPlayer !== 'undefined' && AudioPlayer.resume) {
      AudioPlayer.resume();
    } else if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  // ========== 基础音效单元 ==========

  // 播放单个音符（adsr包络�?  _playNote(freq, duration, type = 'sine', volume = 1, attack = 0.01, decay = 0.1, sustain = 0.6, release = 0.15, dest = null) {
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

  // 和弦（多音符同时�?  _playChord(freqs, duration, type = 'sine', volume = 0.5, attack = 0.01, release = 0.2) {
    freqs.forEach((f, i) => {
      setTimeout(() => this._playNote(f, duration, type, volume / freqs.length * 1.5, attack, 0.05, 0.7, release), i * 10);
    });
  },

  // 滑音（频率从start到end�?  _playSweep(startFreq, endFreq, duration, type = 'sine', volume = 1, attack = 0.02) {
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

  // 噪音生成（打�?爆炸/风声�?  _playNoise(duration, volume = 1, filterFreq = 2000, filterType = 'lowpass', filterEnd = 100) {
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

  // 清脆的点�?敲击音（木质感）
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

  // 填对数字 - 明亮的大三和弦上升，有铃铛泛�?  playCorrect() {
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

  // 填错数字 - 低沉不和谐的摩擦�?  playWrong() {
    this._playSweep(180, 120, 0.25, 'sawtooth', 0.25, 0.01);
    this._playNote(147, 0.3, 'square', 0.12, 0.01, 0.05, 0.5, 0.2);
    // 不和谐音程（小二度）
    setTimeout(() => this._playNote(156, 0.2, 'sawtooth', 0.15, 0.01, 0.03, 0.4, 0.15), 30);
    this._playNoise(0.15, 0.08, 400, 'lowpass', 100);
  },

  // 擦除 - 像擦掉铅笔字�?�?�?  playErase() {
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

  // 被攻�?  playHit() {
    this._playNoise(0.12, 0.25, 500, 'lowpass', 100);
    this._playNote(130, 0.15, 'square', 0.2, 0.005, 0.02, 0.4, 0.1);
  },

  // 能量增加
  playEnergy() {
    this._playNote(1200, 0.05, 'sine', 0.15, 0.002);
  },

  // 能量�?  playEnergyFull() {
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

  // 连击中断
  playComboBreak(reason) {
    if (reason === 'wrong') {
      // 填错断连：下降的滑音+轻微噪声
      this._playSweep(600, 200, 0.2, 'triangle', 0.2, 0.01);
      this._playNoise(0.15, 0.08, 500, 'lowpass', 100);
    } else {
      // 超时断连：柔和的下降音，不挫�?      this._playSweep(400, 250, 0.25, 'sine', 0.12, 0.02);
    }
  },

  // Eureka 爆发
  playEureka(source) {
    const intensity = source === 'inspiration' ? 1.2 : 1.0;

    // 冲击音：噪声+低频
    this._playNoise(0.25, 0.3 * intensity, 2500, 'bandpass', 200);
    this._playNote(110, 0.35, 'sine', 0.35 * intensity, 0.005, 0.08, 0.5, 0.25);

    // 上升琶音（金色光芒感�?    const arp = [523, 659, 784, 1047, 1319];
    arp.forEach((f, i) => {
      setTimeout(() => {
        this._playNote(f, 0.18, 'triangle', 0.28 * intensity, 0.005, 0.02, 0.4, 0.15);
        this._playNote(f * 2, 0.12, 'sine', 0.12 * intensity, 0.005, 0.01, 0.3, 0.1);
      }, i * 60);
    });

    // 高潮钟声
    setTimeout(() => {
      this._playBell(1319, 0.8, 0.15 * intensity);
      this._playBell(1760, 0.6, 0.08 * intensity);
      this._playChord([523, 659, 784, 1047], 0.8, 'sine', 0.2 * intensity, 0.02, 0.5);
    }, 280);

    // 尾韵：持续的金光氛围
    setTimeout(() => {
      this._playNote(880, 1.0, 'sine', 0.06, 0.1, 0.2, 0.6, 0.7);
      this._playNote(1320, 0.8, 'sine', 0.04, 0.15, 0.2, 0.5, 0.6);
    }, 400);
  },

  // Eureka 连段音（Eureka状态内每步正确�?  playEurekaStep(streak) {
    const baseFreq = 660 + Math.min(streak, 10) * 40;
    this._playBell(baseFreq, 0.15, 0.08);
    this._playNote(baseFreq * 1.5, 0.1, 'sine', 0.06, 0.005, 0.01, 0.3, 0.08);
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

  // 失败 - 下降的悲伤旋�?  playLose() {
    const melody = [
      { f: 392, d: 0.2 }, { f: 349, d: 0.2 }, { f: 311, d: 0.2 }, { f: 262, d: 0.5 }
    ];
    melody.forEach((n, i) => {
      setTimeout(() => {
        this._playNote(n.f, n.d, 'sine', 0.3, 0.02, 0.08, 0.5, n.d * 0.6);
      }, i * 180);
    });
    // 低音沉下�?    setTimeout(() => {
      this._playSweep(200, 80, 0.6, 'sine', 0.15, 0.05);
    }, 600);
  },

  // 对战开�?- 更有冲击力的开赛音�?  playBattleStart() {
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

  // AI填了一�?- 幽灵般的细微声响，让玩家感知对手在动
  playAiFill() {
    // 极轻微的幽灵音，在背景中
    this._playNote(600 + Math.random() * 200, 0.08, 'sine', 0.06, 0.01);
    this._playNoise(0.05, 0.04, 2000, 'bandpass', 800);
  },

  // 抢格子成功！- 爽快�?�?�?  playSteal() {
    // 上升�?�?�?    this._playSweep(400, 1200, 0.15, 'triangle', 0.2, 0.01);
    // 成功的铃�?    setTimeout(() => {
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
      // 中距离：警告�?      this._playSweep(400, 600, 0.15, 'triangle', 0.12, 0.01);
      setTimeout(() => this._playSweep(600, 400, 0.12, 'triangle', 0.1), 100);
    } else {
      // 远距离：微弱的存在感
      this._playNote(500, 0.1, 'sine', 0.06, 0.01);
      this._playNoise(0.04, 0.03, 1500, 'bandpass', 500);
    }
  },

  // 60%预警 - 警报�?  playWarning() {
    // 急促的警报脉�?    [0, 150, 300].forEach(i => {
      setTimeout(() => {
        this._playNote(880, 0.1, 'square', 0.2, 0.005, 0.02, 0.3, 0.08);
        this._playNote(660, 0.1, 'square', 0.15, 0.005, 0.02, 0.3, 0.08);
      }, i);
    });
    // 低频压迫�?    this._playNote(100, 0.5, 'sawtooth', 0.1, 0.02, 0.1, 0.4, 0.3);
  },

  // 迷雾散开/视野扩展 - 魔法般的清脆�?  playFogReveal() {
    // 竖琴/风铃般的上行泛音
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      setTimeout(() => {
        this._playNote(f, 0.3 - i * 0.03, 'sine', 0.08 - i * 0.01, 0.005, 0.05, 0.3, 0.2);
      }, i * 40);
    });
    this._playNoise(0.08, 0.05, 4000, 'highpass', 1000);
  },

  // 倒计时滴�?  playCountdownTick() {
    this._playClick(1000, 0.04, 0.2);
  },

  // ========== 背景音乐（版权开放古典名曲）==========
  
  // 音符频率表（中央C开始的音阶�?  _NOTES: {
    'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'B2': 123.47,
    'C#2': 69.30, 'D#2': 77.78, 'F#2': 92.50, 'G#2': 103.83, 'A#2': 116.54,
    'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'C6': 1046.50, 'D6': 1174.66, 'E6': 1318.51, 'F6': 1396.91, 'G6': 1567.98, 'A6': 1760.00, 'B6': 1975.53,
    'C#4': 277.18, 'D#4': 311.13, 'F#4': 369.99, 'G#4': 415.30, 'A#4': 466.16,
    'C#5': 554.37, 'D#5': 622.25, 'F#5': 739.99, 'G#5': 830.61, 'A#5': 932.33,
    'Eb4': 311.13, 'Ab4': 415.30, 'Bb4': 466.16, 'Eb5': 622.25, 'Ab5': 830.61, 'Bb5': 932.33,
    'R': 0 // 休止�?  },

  // 古典名曲库（版权开放）
  // BGM统一由BGMEngine(bgm-bridge.js)管理，不再使用程序化生成的古典音�?
  // 播放一个音符（用于BGM）—�?支持暗黑恐怖音�?  _playBGMNote(freq, duration, type, volume, dest) {
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
      // 悬疑音色：锯齿波+低通滤波，更暗更压�?      oscType = 'sawtooth';
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
      // 暗黑钟声/音乐盒：不和谐泛�?      oscType = 'triangle';
      vol = volume * 0.9;
      attack = 0.005; decay = 0.3; sustain = 0.2; release = 1.5;
      useFilter = true; filterFreq = 3000; filterQ = 2;
    } else if (type === 'horror_pad') {
      // 恐怖pad：锯�?低通，缓慢起伏
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

  // 暗黑音效：金属撞�?铁链声（用于Boss战点缀�?  _playDarkClank(volume = 0.15) {
    if (!this.enabled || !this.ctx || !this.bgmPlaying) return;
    const now = this.ctx.currentTime;
    // 金属撞击：高频噪�?带通滤�?快速衰�?    const dur = 0.4;
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

  // 诡异音乐盒旋律（随机不和谐音符点缀�?  _playCreepyMusicBox(volume = 0.08) {
    if (!this.enabled || !this.ctx || !this.bgmPlaying || !this.bossBgmMode) return;
    // 不和谐音阶（半音/三全音）
    const notes = ['C5','C#5','D5','D#5','F5','F#5','G5','G#5','A5','A#5'];
    const note = notes[Math.floor(Math.random() * notes.length)];
    const freq = this._NOTES[note];
    if (!freq) return;
    const dur = 0.8 + Math.random() * 1.2;
    this._playBGMNote(freq, dur, 'dark_bell', volume * (0.5 + Math.random() * 0.5));
  },

  // BGM统一由BGMEngine管理，此处不再播放程序化音乐
  startBGM() {
    if (!this.enabled || !this.ctx || this.bgmPlaying || !this.bgmEnabled) return;
    this.resume();
  },
  
    // BGM��BGMEngine����

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
   * MIDI系统存在时不播放
   */
  startBossBGM() {
    if (!this.enabled || !this.ctx || !this.bgmEnabled) return;
    this.resume();
    if (this.bgmPlaying) {
      this.stopBGM();
    }
    this.bgmPlaying = true;
    this.bossBgmMode = true;
    this.bgmNodes = [];

    // 启动暗黑drone氛围（持续低频嗡鸣）
    this._startDrone(0.1);

    // 心跳节奏
    setTimeout(() => {
      if (this.bossBgmMode && this.bgmPlaying) {
        this._startHeartbeat(66, 0.25);
      }
    }, 2000);

    // 启动诡异音乐盒（随机间隔点缀�?    this._musicBoxTimer = setInterval(() => {
      if (this.bgmPlaying && this.bossBgmMode && Math.random() < 0.4) {
        this._playCreepyMusicBox(0.06);
      }
      if (Math.random() < 0.15) {
        this._playDarkClank(0.08);
      }
    }, 4000);
  },

  /**
   * 播放Boss战BGM曲目（循环切换）
   */

  /**
   * 停止Boss战BGM，恢复普通BGM
   */
  stopBossBGM() {
    const wasPlaying = this.bgmPlaying;
    // 停止drone和心�?    this._stopDrone();
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
  
  // 切换BGM开�?  toggleBGM() {
    this.bgmEnabled = !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopBGM();
    }
    return this.bgmEnabled;
  },

  // ========== 阶段BGM ==========
  /**
   * 破局阶段BGM：紧张悬疑感（MIDI系统存在时不操作�?   */
  startBreakthroughBGM() {
    if (this._hasMidiBGM()) return;
    if (!this.enabled || !this.ctx || !this.bgmEnabled) return;
    this.resume();
    this._phase = 'breakthrough';

    // 添加紧张心跳节奏（如果还没有�?    if (!this._breakthroughHeartbeat) {
      this._startBreakthroughHeartbeat();
    }

    // 稍微提高BGM音量增加紧张�?    if (this.bgmGain) {
      this.bgmGain.gain.linearRampToValueAtTime(this.bgmVolume * 1.3, this.ctx.currentTime + 2);
    }
  },

  /**
   * 收官阶段BGM：胜利感（MIDI系统存在时不操作�?   */
  startFinishingBGM() {
    if (this._hasMidiBGM()) return;
    if (!this.enabled || !this.ctx || !this.bgmEnabled) return;
    this.resume();
    this._phase = 'finishing';

    // 停止破局心跳
    this._stopBreakthroughHeartbeat();

    // 恢复正常音量
    if (this.bgmGain) {
      this.bgmGain.gain.linearRampToValueAtTime(this.bgmVolume, this.ctx.currentTime + 1);
    }

    // 播放一串上行胜利音�?    this._playVictoryFanfare();
  },

  /**
   * 破局心跳：低频脉�?   */
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
      // 心跳"�?�?      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g); g.connect(hbGain);
      osc.start(t); osc.stop(t + 0.35);
      // 第二声（双跳�?      setTimeout(() => {
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
    // �?.2秒一次心�?    this._breakthroughHbTimer = setInterval(tick, 1200);
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
   * 胜利号角：上行琶�?   */
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
  
  // 切换音效开�?  toggleSfx() {
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
    // 如果有更高级的BGM系统，委托给�?    if (this._hasMidiBGM()) {
      if (typeof BGMEngine !== 'undefined') {
        if (this.bgmEnabled) {
          BGMEngine.unmute();
        } else {
          BGMEngine.mute();
        }
      }
      return;
    }
    if (!this.bgmEnabled) {
      this.stopBGM();
    } else {
      this.startBGM();
    }
  },

  // 暂停BGM
  pauseBGM() {
    // 如果有更高级的BGM系统，委托给�?    if (this._hasMidiBGM()) {
      if (typeof BGMEngine !== 'undefined' && BGMEngine.pause) {
        BGMEngine.pause();
      }
      return;
    }
    if (this.bgmPlaying) {
      this.stopBGM();
      this._bgmPausedByUser = true;
    }
  },

  // 恢复BGM
  resumeBGM() {
    // 如果有更高级的BGM系统，委托给�?    if (this._hasMidiBGM()) {
      if (typeof BGMEngine !== 'undefined' && BGMEngine.resume) {
        BGMEngine.resume();
      }
      return;
    }
    if (this.bgmEnabled && this._bgmPausedByUser) {
      this._bgmPausedByUser = false;
      this.startBGM();
    } else if (this.bgmEnabled && !this.bgmPlaying) {
      this.startBGM();
    }
  },

  // 设置BGM音量
  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain && this.sfxEnabled && !this._muted) this.sfxGain.gain.value = this.sfxVolume;
  },
  setBgmVolume(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.bgmGain && !this._muted) this.bgmGain.gain.value = this.bgmVolume;
  },
  
  // 一键静�?取消静音
  setMuted(muted) {
    this._muted = !!muted;
    if (this.sfxGain) {
      this.sfxGain.gain.value = this._muted ? 0 : (this.sfxEnabled ? this.sfxVolume : 0);
    }
    if (this.bgmGain) {
      this.bgmGain.gain.value = this._muted ? 0 : this.bgmVolume;
    }
  },

  // ========== BGM 强度过渡与滤波器 ==========

  /**
   * BGM 强度层级定义
   * - Muted:   低�?300Hz + 音量 20%（闷响远景）
   * - Normal:  低�?20000Hz + 音量 60%（全频，正常音量�?   * - Intense: 低�?20000Hz + 音量 100%（全频，满音量）
   * - Eureka:  低�?20000Hz + 音量 120%（全频，略过载）
   */
  BGM_INTENSITY: {
    Muted:   { filter: 300,   volume: 0.20 },
    Normal:  { filter: 20000, volume: 0.60 },
    Intense: { filter: 20000, volume: 1.00 },
    Eureka:  { filter: 20000, volume: 1.20 },
  },

  /**
   * BGM 强度过渡（滤波器 + 音量同时变化�?   * @param {string} intensity - 'Muted' | 'Normal' | 'Intense' | 'Eureka'
   * @param {number} fadeMs - 淡入淡出毫秒（默�?500�?   */
  transitionBgm(intensity, fadeMs = 500) {
    const config = this.BGM_INTENSITY[intensity];
    if (!config) {
      console.warn('[AudioManager] 未知 BGM 强度:', intensity);
      return;
    }

    // 1. 低通滤波器
    this.setLowPassFilter(config.filter, fadeMs);

    // 2. BGM 音量（以 bgmVolume 为基准的倍率�?    this._fadeBgmVolume(this.bgmVolume * config.volume, fadeMs);

    // 3. 记录当前强度
    this._currentIntensity = intensity;
  },

  /**
   * 低通滤波器控制
   * @param {number} frequency - 截止频率（Hz），300 = 闷响�?0000 = 全开
   * @param {number} duration - 过渡时间（ms），0 = 立即
   */
  setLowPassFilter(frequency, duration = 0) {
    if (!this._bgmFilter) {
      // 如果滤波器未初始化，保存待应�?      this._pendingFilter = { frequency, duration };
      return;
    }

    const now = this.ctx.currentTime;
    if (duration <= 0) {
      // 立即设置
      this._bgmFilter.frequency.cancelScheduledValues(now);
      this._bgmFilter.frequency.setValueAtTime(frequency, now);
    } else {
      // 平滑过渡
      const startFreq = this._bgmFilter.frequency.value;
      this._bgmFilter.frequency.cancelScheduledValues(now);
      this._bgmFilter.frequency.setValueAtTime(startFreq, now);
      // 指数渐变（人耳对频率是对数感知）
      const safeFreq = Math.max(20, frequency);
      this._bgmFilter.frequency.exponentialRampToValueAtTime(safeFreq, now + duration / 1000);
    }
  },

  /**
   * BGM 音量淡入淡出
   * @param {number} targetVolume - 目标音量（绝对值）
   * @param {number} fadeMs - 过渡毫秒
   */
  _fadeBgmVolume(targetVolume, fadeMs = 500) {
    if (!this.bgmGain) return;

    const now = this.ctx.currentTime;
    const currentGain = this.bgmGain.gain.value;

    if (fadeMs <= 0) {
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(targetVolume, now);
    } else {
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setValueAtTime(currentGain, now);
      this.bgmGain.gain.linearRampToValueAtTime(targetVolume, now + fadeMs / 1000);
    }
  },

  /**
   * 播放 EUREKA 曲（定位到爆发点�?   * 优先使用 MidiPlayer / MidiBGM �?eureka 变奏，否则播放程序化胜利�?   */
  playEureka() {
    // 优先 MIDI 系统�?Eureka 变奏
    if (typeof MidiPlayer !== 'undefined' && MidiPlayer.loadedFile) {
      MidiPlayer.setVariation('eureka');
      return;
    }
    if (typeof MidiBGM !== 'undefined' && typeof MidiBGM.setVariation === 'function') {
      MidiBGM.setVariation('eureka');
      return;
    }
    // fallback：程序化胜利号角
    this._playVictoryFanfare();
  },

  /**
   * 带定位的音频播放（用�?cue 点切入）
   * @param {string} file - 音频文件名或曲目标识
   * @param {number} seekSeconds - 定位秒数
   * @param {number} delayMs - 延迟毫秒
   */
  playCued(file, seekSeconds = 0, delayMs = 0) {
    setTimeout(() => {
      // 如果�?MIDI 文件，走 MidiPlayer
      if (file.endsWith('.mid') || file.endsWith('.midi')) {
        if (typeof MidiPlayer !== 'undefined') {
          MidiPlayer.load(file).then(() => {
            MidiPlayer.play();
          }).catch(e => console.warn('[Audio] playCued midi error:', e));
        }
      } else if (file === 'eureka.mp3') {
        this.playEureka();
      } else {
        // 其他文件：尝试用采样播放
        this._playSample(file, { seek: seekSeconds }).catch(() => {});
      }
    }, delayMs);
  },

  // ========== 剧情/演出音效（逆转裁判风格�?=========

  // 打字机音�?- 短促的机械键盘敲击声（优化版：更响亮、更有质感）
  playTypewriterKey() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;

    // 1. 低频"咔嗒"主体（方波快速下滑，模拟按键触底的机械感�?    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    const oscFilter = this.ctx.createBiquadFilter();
    osc.type = 'square';
    // 起始频率降低到中高频�?00-1200Hz），人耳更敏感
    osc.frequency.setValueAtTime(900 + Math.random() * 300, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.035);
    oscFilter.type = 'lowpass';
    oscFilter.frequency.value = 1500;
    oscFilter.Q.value = 1;
    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.18, now + 0.0015);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(oscFilter); oscFilter.connect(oscGain); oscGain.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.06);

    // 2. 高频"�?声噪声（每次都触发，模拟键帽撞击的清脆感�?    const noiseLen = this.ctx.sampleRate * 0.025;
    const nb = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      // 指数衰减的白噪声，更像真实撞�?      nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 2);
    }
    const ns = this.ctx.createBufferSource(); ns.buffer = nb;
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 2500 + Math.random() * 500;
    nf.Q.value = 3;
    ng.gain.setValueAtTime(0.08, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    ns.connect(nf); nf.connect(ng); ng.connect(this.sfxGain);
    ns.start(now); ns.stop(now + 0.03);

    // 3. 30%概率触发"空格/回车"级别的重按键音（更响、更低沉�?    if (Math.random() < 0.3) {
      const lowOsc = this.ctx.createOscillator();
      const lowGain = this.ctx.createGain();
      lowOsc.type = 'triangle';
      lowOsc.frequency.setValueAtTime(300 + Math.random() * 100, now);
      lowOsc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
      lowGain.gain.setValueAtTime(0, now);
      lowGain.gain.linearRampToValueAtTime(0.12, now + 0.002);
      lowGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      lowOsc.connect(lowGain); lowGain.connect(this.sfxGain);
      lowOsc.start(now); lowOsc.stop(now + 0.1);
    }
  },

  // 立绘"轻叩"音（カチッ）—�?effect=1,2 级入�?  playPortraitTap() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    // 优先播放采样（如果有�?    if (this.sfxSamples && this.sfxSamples['portrait_tap']) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.sfxSamples['portrait_tap'];
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.6, now);
      src.connect(g); g.connect(this.sfxGain);
      src.start(now);
      return;
    }
    // fallback：程序化生成
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(800, now);
    o.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.15, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o.connect(g); g.connect(this.sfxGain);
    o.start(now); o.stop(now + 0.15);
    // 加一点高频点击感
    this._playNoise(0.05, 0.08, 4000, 'highpass', 0.05);
  },

  // 立绘"砸入"音（バシ�?�?  playPortraitSlam() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    this._playSweep(200, 60, 0.15, 'sine', 0.3, 0.005);
    setTimeout(() => {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(400, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.15);
    }, 20);
    this._playNoise(0.1, 0.12, 3000, 'bandpass', 200);
  },

  // 表情瞬间切换"�?�?  playEmotionSnap() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(1200, now);
    o.frequency.exponentialRampToValueAtTime(400, now + 0.04);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    o.connect(g); g.connect(this.sfxGain);
    o.start(now); o.stop(now + 0.08);
  },

  // 惊讶"叮！"
  playEmotionSurprise() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    this._playBell(1200, 0.35, 0.1);
    setTimeout(() => this._playBell(1600, 0.25, 0.06), 60);
  },

  // 愤�?咚！"
  playEmotionAngry() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, now);
    o.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.25, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    o.connect(g); g.connect(this.sfxGain);
    o.start(now); o.stop(now + 0.3);
    this._playNoise(0.08, 0.12, 500, 'lowpass', 80);
  },

  // 冷笑/得意"フッ"
  playEmotionSmirk() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    this._playSweep(600, 300, 0.12, 'sawtooth', 0.08, 0.01);
    setTimeout(() => this._playNoise(0.06, 0.04, 2000, 'bandpass', 500), 30);
  },

  // 悲伤下行�?  playEmotionSad() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    [392, 349, 294].forEach((f, i) => {
      setTimeout(() => this._playNote(f, 0.4, 'sine', 0.08, 0.02, 0.1, 0.4, 0.3), i * 120);
    });
  },

  // "异议あり�?式爆�?  playObjection() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    // 蓄力：上升噪�?    const chargeLen = this.ctx.sampleRate * 0.25;
    const cb = this.ctx.createBuffer(1, chargeLen, this.ctx.sampleRate);
    const cd = cb.getChannelData(0);
    for (let i = 0; i < chargeLen; i++) cd[i] = (Math.random()*2-1) * (i/chargeLen);
    const cs = this.ctx.createBufferSource(); cs.buffer = cb;
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0, now);
    cg.gain.linearRampToValueAtTime(0.12, now + 0.2);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    const cf = this.ctx.createBiquadFilter();
    cf.type = 'lowpass';
    cf.frequency.setValueAtTime(200, now);
    cf.frequency.exponentialRampToValueAtTime(2000, now + 0.25);
    cs.connect(cf); cf.connect(cg); cg.connect(this.sfxGain);
    cs.start(now); cs.stop(now + 0.35);
    // 爆发
    setTimeout(() => {
      const t = this.ctx.currentTime;
      [262, 330, 392, 523].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = i === 0 ? 'sawtooth' : 'square';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12 / (i+1), t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); g.connect(this.sfxGain);
        o.start(t); o.stop(t + 0.6);
      });
      this._playNoise(0.35, 0.18, 4000, 'highpass', 200);
      setTimeout(() => this._playBell(880, 0.7, 0.08), 80);
    }, 280);
  },

  // 对话气泡弹出�?  playBubblePop() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(500, now);
    o.frequency.exponentialRampToValueAtTime(900, now + 0.04);
    o.frequency.exponentialRampToValueAtTime(350, now + 0.1);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.08, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o.connect(g); g.connect(this.sfxGain);
    o.start(now); o.stop(now + 0.15);
  },

  // ========== 逆转裁判风格演出音效 ==========

  // 思考音 - 低沉�?�?.."，思考时循环�?  playThinking() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    // 轻微的思索"�?�?    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(800, now);
    o.frequency.exponentialRampToValueAtTime(600, now + 0.15);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.08, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    o.connect(g); g.connect(this.sfxGain);
    o.start(now); o.stop(now + 0.25);
  },

  // 灵光一�?- "叮！"的顿悟感
  playInsight() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    // 上升琶音
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.04);
      g.gain.linearRampToValueAtTime(0.12, now + i * 0.04 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.3);
      o.connect(g); g.connect(this.sfxGain);
      o.start(now + i * 0.04); o.stop(now + i * 0.04 + 0.35);
    });
    // 顶部闪亮
    setTimeout(() => this._playBell(1568, 0.5, 0.1), 150);
    // 短暂的闪光噪�?    this._playNoise(0.1, 0.06, 6000, 'highpass', 100);
  },

  // 发现线索 - "发现了！"的感�?  playDiscover() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    // 三连快�?哒哒�?上升
    [440, 554, 659].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.06);
      g.gain.linearRampToValueAtTime(0.08, now + i * 0.06 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.08);
      o.connect(g); g.connect(this.sfxGain);
      o.start(now + i * 0.06); o.stop(now + i * 0.06 + 0.1);
    });
    // 最后一�?�?
    setTimeout(() => {
      this._playBell(880, 0.3, 0.12);
      this._playNote(1109, 0.2, 'sine', 0.1, 0.005);
    }, 180);
  },

  // 矛盾指证 - 有力�?咚！"
  playContradiction() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    // 低音冲击
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, now);
    o.frequency.exponentialRampToValueAtTime(80, now + 0.2);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.2, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    o.connect(g); g.connect(this.sfxGain);
    o.start(now); o.stop(now + 0.35);
    // 噪声冲击
    this._playNoise(0.15, 0.15, 800, 'lowpass', 100);
    // 金属回响
    setTimeout(() => this._playBell(330, 0.5, 0.08), 30);
  },

  // 证据出示 - 翻开证据�?�?�?  playEvidence() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    // "�?的翻页声
    const noiseLen = this.ctx.sampleRate * 0.2;
    const nb = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      nd[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen);
    }
    const ns = this.ctx.createBufferSource(); ns.buffer = nb;
    const ng = this.ctx.createGain();
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.setValueAtTime(1000, now);
    nf.frequency.exponentialRampToValueAtTime(4000, now + 0.15);
    ng.gain.setValueAtTime(0.15, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    ns.connect(nf); nf.connect(ng); ng.connect(this.sfxGain);
    ns.start(now); ns.stop(now + 0.25);
    // 结尾"�?
    setTimeout(() => {
      this._playClick(1800, 0.02, 0.15);
    }, 150);
  },

  // 法庭记录选择 - 轻微的选择�?  playCourtRecord() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    this._playNote(660, 0.08, 'triangle', 0.1, 0.005);
    setTimeout(() => this._playNote(880, 0.1, 'sine', 0.08, 0.005), 30);
  },

  // ========== 环境/剧情音效 ==========

  // 开门声 - 尘封的旧木门吱呀�?  playDoorOpen() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;

    // 0. 开门瞬间的冲击"咔哒"声（响亮、短促，确保能听到）
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    const clickFilter = this.ctx.createBiquadFilter();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(3000, now);
    clickOsc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 2500;
    clickFilter.Q.value = 2;
    clickGain.gain.setValueAtTime(0, now);
    clickGain.gain.linearRampToValueAtTime(0.3, now + 0.005);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    clickOsc.connect(clickFilter); clickFilter.connect(clickGain); clickGain.connect(this.sfxGain);
    clickOsc.start(now); clickOsc.stop(now + 0.12);

    // 1. 门轴吱呀声主音（锯齿�?+ 带通滤波，2kHz左右，人耳最敏感区域�?    const creak = this.ctx.createOscillator();
    const creakGain = this.ctx.createGain();
    const creakFilter = this.ctx.createBiquadFilter();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(1500, now);
    creak.frequency.linearRampToValueAtTime(2000, now + 0.15);
    creak.frequency.linearRampToValueAtTime(1300, now + 0.4);
    creak.frequency.linearRampToValueAtTime(1800, now + 0.7);
    creak.frequency.linearRampToValueAtTime(1400, now + 1.0);
    creakFilter.type = 'bandpass';
    creakFilter.frequency.value = 1800;
    creakFilter.Q.value = 4;
    creakGain.gain.setValueAtTime(0, now);
    creakGain.gain.linearRampToValueAtTime(0.25, now + 0.08);
    creakGain.gain.linearRampToValueAtTime(0.3, now + 0.35);
    creakGain.gain.linearRampToValueAtTime(0.2, now + 0.7);
    creakGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    creak.connect(creakFilter); creakFilter.connect(creakGain); creakGain.connect(this.sfxGain);
    creak.start(now); creak.stop(now + 1.2);

    // 2. 第二层吱呀声（方波，稍低频，增加金属摩擦的质感�?    const creak2 = this.ctx.createOscillator();
    const creak2Gain = this.ctx.createGain();
    const creak2Filter = this.ctx.createBiquadFilter();
    creak2.type = 'square';
    creak2.frequency.setValueAtTime(800, now + 0.03);
    creak2.frequency.linearRampToValueAtTime(1000, now + 0.2);
    creak2.frequency.linearRampToValueAtTime(700, now + 0.45);
    creak2.frequency.linearRampToValueAtTime(900, now + 0.75);
    creak2Filter.type = 'bandpass';
    creak2Filter.frequency.value = 900;
    creak2Filter.Q.value = 5;
    creak2Gain.gain.setValueAtTime(0, now + 0.03);
    creak2Gain.gain.linearRampToValueAtTime(0.15, now + 0.12);
    creak2Gain.gain.linearRampToValueAtTime(0.18, now + 0.4);
    creak2Gain.gain.linearRampToValueAtTime(0.12, now + 0.7);
    creak2Gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    creak2.connect(creak2Filter); creak2Filter.connect(creak2Gain); creak2Gain.connect(this.sfxGain);
    creak2.start(now + 0.03); creak2.stop(now + 1.1);

    // 3. 推门的低�?�?声（低频，增加厚重感和冲击力�?    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(100, now + 0.05);
    thud.frequency.exponentialRampToValueAtTime(50, now + 0.5);
    thudGain.gain.setValueAtTime(0, now + 0.05);
    thudGain.gain.linearRampToValueAtTime(0.35, now + 0.12);
    thudGain.gain.linearRampToValueAtTime(0.3, now + 0.3);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    thud.connect(thudGain); thudGain.connect(this.sfxGain);
    thud.start(now + 0.05); thud.stop(now + 0.7);

    // 4. 门与地面/门框的摩擦噪声（中高频，增加真实感和辨识度）
    const scrapeLen = this.ctx.sampleRate * 0.9;
    const scrapeBuf = this.ctx.createBuffer(1, scrapeLen, this.ctx.sampleRate);
    const scrapeData = scrapeBuf.getChannelData(0);
    for (let i = 0; i < scrapeLen; i++) {
      const t = i / scrapeLen;
      // 不规则的摩擦噪声，中间强两边�?      const envelope = Math.sin(t * Math.PI);
      // 添加一些随机的"颗粒�?
      const grain = Math.random() > 0.7 ? (Math.random() * 2 - 1) * 0.5 : 0;
      scrapeData[i] = ((Math.random() * 2 - 1) * 0.7 + grain) * envelope;
    }
    const scrapeSrc = this.ctx.createBufferSource(); scrapeSrc.buffer = scrapeBuf;
    const scrapeGain = this.ctx.createGain();
    const scrapeFilter = this.ctx.createBiquadFilter();
    scrapeFilter.type = 'bandpass';
    scrapeFilter.frequency.value = 2500;
    scrapeFilter.Q.value = 2;
    scrapeGain.gain.setValueAtTime(0, now + 0.08);
    scrapeGain.gain.linearRampToValueAtTime(0.12, now + 0.2);
    scrapeGain.gain.linearRampToValueAtTime(0.15, now + 0.45);
    scrapeGain.gain.linearRampToValueAtTime(0.1, now + 0.7);
    scrapeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    scrapeSrc.connect(scrapeFilter); scrapeFilter.connect(scrapeGain); scrapeGain.connect(this.sfxGain);
    scrapeSrc.start(now + 0.08); scrapeSrc.stop(now + 1.0);

    // 5. 灰尘飘落的细碎噪声（高频轻噪声，氛围感）
    const dustLen = this.ctx.sampleRate * 1.2;
    const dustBuf = this.ctx.createBuffer(1, dustLen, this.ctx.sampleRate);
    const dustData = dustBuf.getChannelData(0);
    for (let i = 0; i < dustLen; i++) {
      dustData[i] = (Math.random() * 2 - 1) * (1 - i / dustLen) * 0.5;
    }
    const dustSrc = this.ctx.createBufferSource(); dustSrc.buffer = dustBuf;
    const dustGain = this.ctx.createGain();
    const dustFilter = this.ctx.createBiquadFilter();
    dustFilter.type = 'highpass';
    dustFilter.frequency.value = 4000;
    dustGain.gain.setValueAtTime(0.06, now + 0.15);
    dustGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    dustSrc.connect(dustFilter); dustFilter.connect(dustGain); dustGain.connect(this.sfxGain);
    dustSrc.start(now + 0.15); dustSrc.stop(now + 1.2);
  },

  // 脚步�?- 木地板脚步声�?~3步）
  playFootstep(steps = 2) {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const interval = 0.35; // 每步间隔

    for (let i = 0; i < steps; i++) {
      const t = now + i * interval;
      const weight = 0.8 + Math.random() * 0.4; // 每步轻重略有不同

      // 1. 脚步声主体（低频"�?�?      const step = this.ctx.createOscillator();
      const stepGain = this.ctx.createGain();
      const stepFilter = this.ctx.createBiquadFilter();
      step.type = 'sine';
      step.frequency.setValueAtTime(120 + Math.random() * 30, t);
      step.frequency.exponentialRampToValueAtTime(50, t + 0.08);
      stepFilter.type = 'lowpass';
      stepFilter.frequency.value = 400;
      stepGain.gain.setValueAtTime(0, t);
      stepGain.gain.linearRampToValueAtTime(0.2 * weight, t + 0.005);
      stepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      step.connect(stepFilter); stepFilter.connect(stepGain); stepGain.connect(this.sfxGain);
      step.start(t); step.stop(t + 0.12);

      // 2. 鞋跟/地面的细碎声（高频噪声）
      const tapLen = this.ctx.sampleRate * 0.05;
      const tapBuf = this.ctx.createBuffer(1, tapLen, this.ctx.sampleRate);
      const tapData = tapBuf.getChannelData(0);
      for (let j = 0; j < tapLen; j++) {
        tapData[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / tapLen, 1.5);
      }
      const tapSrc = this.ctx.createBufferSource(); tapSrc.buffer = tapBuf;
      const tapGain = this.ctx.createGain();
      const tapFilter = this.ctx.createBiquadFilter();
      tapFilter.type = 'bandpass';
      tapFilter.frequency.value = 1500 + Math.random() * 500;
      tapFilter.Q.value = 3;
      tapGain.gain.setValueAtTime(0.08 * weight, t);
      tapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      tapSrc.connect(tapFilter); tapFilter.connect(tapGain); tapGain.connect(this.sfxGain);
      tapSrc.start(t); tapSrc.stop(t + 0.06);
    }
  },

  // 笑声 - 轻快�?呵呵"轻笑
  playLaugh() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;

    // 连续3-4个上升的"�?�?    const laughs = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < laughs; i++) {
      const t = now + i * 0.12;
      const baseFreq = 300 + i * 40 + Math.random() * 30;

      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.setValueAtTime(baseFreq, t);
      o.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, t + 0.06);
      f.type = 'bandpass';
      f.frequency.value = baseFreq * 2;
      f.Q.value = 1.5;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(f); f.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.12);
    }
  },

  // 翻纸�?- 档案馆的旧纸张（单页�?  playPaperFlip() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;

    // 1. 翻纸的沙沙声（带通白噪声�?    const paperLen = this.ctx.sampleRate * 0.25;
    const paperBuf = this.ctx.createBuffer(1, paperLen, this.ctx.sampleRate);
    const paperData = paperBuf.getChannelData(0);
    for (let i = 0; i < paperLen; i++) {
      const env = Math.sin(Math.PI * i / paperLen); // 淡入淡出包络
      paperData[i] = (Math.random() * 2 - 1) * env;
    }
    const paperSrc = this.ctx.createBufferSource(); paperSrc.buffer = paperBuf;
    const paperGain = this.ctx.createGain();
    const paperFilter = this.ctx.createBiquadFilter();
    paperFilter.type = 'bandpass';
    paperFilter.frequency.setValueAtTime(3000, now);
    paperFilter.frequency.exponentialRampToValueAtTime(1500, now + 0.2);
    paperFilter.Q.value = 1;
    paperGain.gain.setValueAtTime(0, now);
    paperGain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    paperGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    paperSrc.connect(paperFilter); paperFilter.connect(paperGain); paperGain.connect(this.sfxGain);
    paperSrc.start(now); paperSrc.stop(now + 0.3);

    // 2. 纸张落下的轻�?    setTimeout(() => {
      const tapLen = this.ctx.sampleRate * 0.04;
      const tapBuf = this.ctx.createBuffer(1, tapLen, this.ctx.sampleRate);
      const tapData = tapBuf.getChannelData(0);
      for (let i = 0; i < tapLen; i++) {
        tapData[i] = (Math.random() * 2 - 1) * (1 - i / tapLen);
      }
      const t = this.ctx.currentTime;
      const tapSrc = this.ctx.createBufferSource(); tapSrc.buffer = tapBuf;
      const tapGain = this.ctx.createGain();
      const tapFilter = this.ctx.createBiquadFilter();
      tapFilter.type = 'highpass';
      tapFilter.frequency.value = 500;
      tapGain.gain.setValueAtTime(0.08, t);
      tapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      tapSrc.connect(tapFilter); tapFilter.connect(tapGain); tapGain.connect(this.sfxGain);
      tapSrc.start(t); tapSrc.stop(t + 0.05);
    }, 200);
  },

  // 翻书�?- 快速翻动多页（哗啦啦）
  playBookFlip(pages = 5) {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const totalDur = 0.15 * pages + 0.1;

    // 生成连续翻页的噪�?    const bookLen = this.ctx.sampleRate * totalDur;
    const bookBuf = this.ctx.createBuffer(1, bookLen, this.ctx.sampleRate);
    const bookData = bookBuf.getChannelData(0);
    for (let i = 0; i < bookLen; i++) {
      const phase = i / bookLen;
      let env;
      if (phase < 0.1) env = phase / 0.1; // 淡入
      else if (phase < 0.85) env = 0.6 + 0.4 * Math.random(); // 主体波动
      else env = (1 - phase) / 0.15 * 0.6; // 淡出
      bookData[i] = (Math.random() * 2 - 1) * env;
    }

    const bookSrc = this.ctx.createBufferSource(); bookSrc.buffer = bookBuf;
    const bookGain = this.ctx.createGain();
    const bookFilter = this.ctx.createBiquadFilter();
    bookFilter.type = 'bandpass';
    bookFilter.frequency.setValueAtTime(4000, now);
    bookFilter.frequency.linearRampToValueAtTime(2000, now + totalDur);
    bookFilter.Q.value = 0.8;
    bookGain.gain.setValueAtTime(0.06, now);
    bookGain.gain.linearRampToValueAtTime(0.001, now + totalDur);
    bookSrc.connect(bookFilter); bookFilter.connect(bookGain); bookGain.connect(this.sfxGain);
    bookSrc.start(now); bookSrc.stop(now + totalDur + 0.05);
  },

  // 叹气�?- 轻轻�?�?
  playSigh() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;

    // 1. 叹气的气流声（低通白噪声，先升后降）
    const sighLen = this.ctx.sampleRate * 0.8;
    const sighBuf = this.ctx.createBuffer(1, sighLen, this.ctx.sampleRate);
    const sighData = sighBuf.getChannelData(0);
    for (let i = 0; i < sighLen; i++) {
      const phase = i / sighLen;
      let env;
      if (phase < 0.2) env = phase / 0.2; // 淡入
      else if (phase < 0.7) env = 1 - (phase - 0.2) / 0.5 * 0.3; // 平稳
      else env = 0.7 * (1 - (phase - 0.7) / 0.3); // 淡出
      sighData[i] = (Math.random() * 2 - 1) * env;
    }
    const sighSrc = this.ctx.createBufferSource(); sighSrc.buffer = sighBuf;
    const sighGain = this.ctx.createGain();
    const sighFilter = this.ctx.createBiquadFilter();
    sighFilter.type = 'lowpass';
    sighFilter.frequency.setValueAtTime(600, now);
    sighFilter.frequency.linearRampToValueAtTime(300, now + 0.8);
    sighGain.gain.setValueAtTime(0.06, now);
    sighGain.gain.linearRampToValueAtTime(0.001, now + 0.8);
    sighSrc.connect(sighFilter); sighFilter.connect(sighGain); sighGain.connect(this.sfxGain);
    sighSrc.start(now); sighSrc.stop(now + 0.85);
  },

  // 环境风声 - 轻柔的风（循环用，需要手动停止）
  playAmbientWind(intensity = 0.3) {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    if (this._windNode) return; // 已经在播�?
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 2;
    const windBuf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const windData = windBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      windData[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const windSrc = this.ctx.createBufferSource(); windSrc.buffer = windBuf;
    windSrc.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 300;
    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0, now);
    windGain.gain.linearRampToValueAtTime(0.03 * intensity, now + 0.5);

    windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(this.sfxGain);
    windSrc.start(now);
    this._windNode = { src: windSrc, gain: windGain, filter: windFilter };
  },

  // 停止环境风声
  stopAmbientWind() {
    if (!this._windNode) return;
    const now = this.ctx.currentTime;
    this._windNode.gain.gain.cancelScheduledValues(now);
    this._windNode.gain.gain.linearRampToValueAtTime(0, now + 0.5);
    this._windNode.src.stop(now + 0.6);
    this._windNode = null;
  },

  // 铃铛/钟声 - 清脆�?�?
  playBell(pitch = 'mid') {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    const baseFreq = pitch === 'high' ? 1319 : (pitch === 'low' ? 440 : 880);
    this._playBell(baseFreq, 1.2, 0.15);
  },

  // ========== UI 音效补充 ==========

  // 弹窗出现
  playPopupOpen() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    [330, 440, 554].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.03);
      g.gain.linearRampToValueAtTime(0.08, now + i * 0.03 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.15);
      o.connect(g); g.connect(this.sfxGain);
      o.start(now + i * 0.03); o.stop(now + i * 0.03 + 0.2);
    });
  },

  // 弹窗关闭
  playPopupClose() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    const now = this.ctx.currentTime;
    [554, 440, 330].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.025);
      g.gain.linearRampToValueAtTime(0.06, now + i * 0.025 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.025 + 0.12);
      o.connect(g); g.connect(this.sfxGain);
      o.start(now + i * 0.025); o.stop(now + i * 0.025 + 0.15);
    });
  },

  // 按钮悬停（轻微的�?  playHover() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    this._playNote(1000, 0.03, 'sine', 0.04, 0.002);
  },

  // 切换开�?  playToggle() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    this._playClick(1600, 0.025, 0.15);
    setTimeout(() => this._playClick(1200, 0.02, 0.1), 50);
  },

  // 滑块调整
  playSlider() {
    if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
    this.resume();
    this._playNote(800 + Math.random() * 200, 0.02, 'sine', 0.03, 0.002);
  },

  // ========== 振动反馈（Vibration�?=========

  vibrate(pattern) {
    if (!navigator.vibrate) return;
    try {
      // 检查设置是否开启振动（默认开启）
      if (typeof Storage !== 'undefined' && Storage.getSettings) {
        const s = Storage.getSettings();
        if (s && s.vibration === false) return;
      }
      switch (pattern) {
        // 轻触
        case 'tap':
          navigator.vibrate(10);
          break;
        // 点击按钮
        case 'click':
          navigator.vibrate(15);
          break;
        // 填对数字 - 短促有力的一�?        case 'correct':
          navigator.vibrate([20, 10, 15]);
          break;
        // 填错数字 - 低沉的错误感
        case 'wrong':
          navigator.vibrate([50, 20, 40]);
          break;
        // 擦除
        case 'erase':
          navigator.vibrate(25);
          break;
        // 选中格移�?        case 'move':
          navigator.vibrate(5);
          break;
        // 异议�?- 爆发式振�?        case 'objection':
          navigator.vibrate([30, 20, 50, 30, 80]);
          break;
        // 灵光一�?        case 'insight':
          navigator.vibrate([10, 8, 10, 8, 15, 10, 30]);
          break;
        // 发现矛盾
        case 'contradiction':
          navigator.vibrate([60, 20, 60]);
          break;
        // 胜利 - 庆祝节奏
        case 'victory':
          navigator.vibrate([50, 30, 50, 30, 100, 50, 150]);
          break;
        // 失败
        case 'defeat':
          navigator.vibrate([100, 50, 80, 50, 200]);
          break;
        // 砸桌/重击
        case 'slam':
          navigator.vibrate([80, 30, 60]);
          break;
        // 轻微提示
        case 'notice':
          navigator.vibrate([15, 10, 15]);
          break;
        // 默认
        default:
          navigator.vibrate(20);
      }
    } catch(e) {}
  },

  // ========== 采样音效播放器（支持 ogg/mp3/wav，优先采样，fallback 到程序化生成�?=========

  _sampleCache: {},           // 缓存已加载的 Audio 对象
  _sampleBasePath: 'assets/audio/sfx/',
  _sampleFormats: ['ogg', 'mp3', 'wav'],  // 优先级顺�?  _sampleLoops: {},           // 正在循环播放的采�?{ name: { audio, gainNode } }
  _sampleGain: null,          // 采样音效�?gain 节点（挂�?sfxGain 下，�?Web Audio 控制音量�?  _sampleProbeCache: {},      // 探测过的文件存在�?{ name.ogg: true/false }

  // 初始化采样音效增益节�?  _initSampleGain() {
    if (this._sampleGain || !this.ctx) return;
    this._sampleGain = this.ctx.createGain();
    this._sampleGain.gain.value = 1.0;
    this._sampleGain.connect(this.sfxGain);
  },

  // 探测某个采样文件是否存在（通过 HEAD 请求，结果缓存）
  async _probeSample(name, ext) {
    const key = name + '.' + ext;
    if (this._sampleProbeCache[key] !== undefined) {
      return this._sampleProbeCache[key];
    }
    const url = this._sampleBasePath + name + '.' + ext;
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      const exists = resp.ok && resp.status !== 404;
      this._sampleProbeCache[key] = exists;
      return exists;
    } catch(e) {
      this._sampleProbeCache[key] = false;
      return false;
    }
  },

  // 查找可用的采样文件（�?ogg �?mp3 �?wav 优先级探测）
  async _findSample(name) {
    for (const ext of this._sampleFormats) {
      if (await this._probeSample(name, ext)) {
        return name + '.' + ext;
      }
    }
    return null;
  },

  // 播放采样音效（一次性，不可循环�?  // 返回 true 表示成功播放采样，false 表示无采样文件需 fallback
  async _playSample(name, options = {}) {
    if (!this.enabled || !this.sfxEnabled) return false;
    this.resume();

    const volume = options.volume !== undefined ? options.volume : 1.0;
    const playbackRate = options.playbackRate || 1.0;

    // 查找可用格式
    const fileName = await this._findSample(name);
    if (!fileName) return false;

    const url = this._sampleBasePath + fileName;

    // 如果�?Web Audio 上下文，�?MediaElementSource 接入增益�?    if (this.ctx) {
      this._initSampleGain();
      try {
        const audio = new Audio(url);
        audio.playbackRate = playbackRate;
        const source = this.ctx.createMediaElementSource(audio);
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(this._sampleGain);
        audio.play().catch(() => {});
        return true;
      } catch(e) {
        // fallback 到纯 HTMLAudio
      }
    }

    // �?HTMLAudio 回退
    try {
      const audio = new Audio(url);
      audio.volume = volume * this.sfxVolume;
      audio.playbackRate = playbackRate;
      audio.play().catch(() => {});
      return true;
    } catch(e) {
      return false;
    }
  },

  // 开始循环播放采样音效（用于环境音）
  async _startSampleLoop(name, options = {}) {
    if (!this.enabled || !this.sfxEnabled) return false;
    if (this._sampleLoops[name]) return true; // 已经在播

    this.resume();
    const volume = options.volume !== undefined ? options.volume : 0.5;
    const fadeIn = options.fadeIn !== undefined ? options.fadeIn : 0.5; // �?
    const fileName = await this._findSample(name);
    if (!fileName) return false;

    const url = this._sampleBasePath + fileName;

    if (this.ctx) {
      this._initSampleGain();
      try {
        const audio = new Audio(url);
        audio.loop = true;
        const source = this.ctx.createMediaElementSource(audio);
        const gainNode = this.ctx.createGain();
        const now = this.ctx.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + fadeIn);
        source.connect(gainNode);
        gainNode.connect(this._sampleGain);
        audio.play().catch(() => {});
        this._sampleLoops[name] = { audio, gainNode, source };
        return true;
      } catch(e) {}
    }

    // HTMLAudio 回退
    try {
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0;
      audio.play().catch(() => {});
      // 简单淡�?      const startVol = 0;
      const targetVol = volume * this.sfxVolume;
      const steps = 20;
      let step = 0;
      const fadeTimer = setInterval(() => {
        step++;
        audio.volume = startVol + (targetVol - startVol) * (step / steps);
        if (step >= steps) clearInterval(fadeTimer);
      }, fadeIn * 1000 / steps);
      this._sampleLoops[name] = { audio, fadeTimer };
      return true;
    } catch(e) {
      return false;
    }
  },

  // 停止循环采样音效
  _stopSampleLoop(name, options = {}) {
    const loop = this._sampleLoops[name];
    if (!loop) return;

    const fadeOut = options.fadeOut !== undefined ? options.fadeOut : 0.5;

    if (loop.gainNode && this.ctx) {
      // Web Audio 淡出
      const now = this.ctx.currentTime;
      loop.gainNode.gain.cancelScheduledValues(now);
      loop.gainNode.gain.setValueAtTime(loop.gainNode.gain.value, now);
      loop.gainNode.gain.linearRampToValueAtTime(0, now + fadeOut);
      setTimeout(() => {
        if (loop.audio) {
          loop.audio.pause();
          loop.audio.currentTime = 0;
        }
        delete this._sampleLoops[name];
      }, fadeOut * 1000 + 50);
    } else if (loop.audio) {
      // HTMLAudio 淡出
      const startVol = loop.audio.volume;
      const steps = 20;
      let step = 0;
      const fadeTimer = setInterval(() => {
        step++;
        loop.audio.volume = startVol * (1 - step / steps);
        if (step >= steps) {
          clearInterval(fadeTimer);
          loop.audio.pause();
          loop.audio.currentTime = 0;
          delete this._sampleLoops[name];
        }
      }, fadeOut * 1000 / steps);
    }
  },

  // 停止所有循环采�?  _stopAllSampleLoops() {
    for (const name of Object.keys(this._sampleLoops)) {
      this._stopSampleLoop(name);
    }
  },

  // ========== 音效方法：优先采样，fallback 到程序化生成 ==========

  // 开门声（采样优先）
  playDoorOpen_sample() {
    const played = this._playSample('door_open', { volume: 0.9 });
    // 不等�?Promise，如果采样失败仍可听到程序化版本
    played.then(success => {
      if (!success) {
        // 采样不存在，播放程序化版�?        this._playDoorOpen_procedural();
      }
    });
  },

  // 环境风声（采样优先，循环�?  playAmbientWind_sample(intensity = 0.3) {
    this._startSampleLoop('ambient_wind', {
      volume: 0.15 + intensity * 0.2,
      fadeIn: 1.0
    }).then(success => {
      if (!success) {
        this._playAmbientWind_procedural(intensity);
      }
    });
  },

  stopAmbientWind_sample() {
    if (this._sampleLoops['ambient_wind']) {
      this._stopSampleLoop('ambient_wind', { fadeOut: 0.8 });
    } else {
      this._stopAmbientWind_procedural();
    }
  },

  // 脚步声（采样优先�?  playFootstep_sample(steps = 2) {
    // 采样版本：单步音频，多次播放模拟多步
    this._playSample('footstep_wood', { volume: 0.6 }).then(success => {
      if (success) {
        // 成功播放采样，继续播后续步数
        for (let i = 1; i < steps; i++) {
          setTimeout(() => {
            this._playSample('footstep_wood', {
              volume: 0.5 + Math.random() * 0.2,
              playbackRate: 0.9 + Math.random() * 0.2
            });
          }, i * 350 + Math.random() * 30);
        }
      } else {
        this._playFootstep_procedural(steps);
      }
    });
  },

  // 翻纸声（采样优先�?  playPaperFlip_sample() {
    this._playSample('paper_flip', { volume: 0.7 }).then(success => {
      if (!success) {
        this._playPaperFlip_procedural();
      }
    });
  },

  // 翻书声（采样优先�?  playBookFlip_sample(pages = 5) {
    this._playSample('book_flip', { volume: 0.6 }).then(success => {
      if (!success) {
        this._playBookFlip_procedural(pages);
      }
    });
  },

  // 叹气声（采样优先�?  playSigh_sample() {
    this._playSample('sigh', { volume: 0.7 }).then(success => {
      if (!success) {
        this._playSigh_procedural();
      }
    });
  },

  // 雷声（采样优先，如果有）
  playThunder_sample() {
    this._playSample('thunder', { volume: 0.8 }).then(success => {
      if (!success) {
        // 程序�?fallback：低频冲�?+ 噪声滚响
        if (!this.enabled || !this.ctx || !this.sfxEnabled) return;
        this.resume();
        const now = this.ctx.currentTime;
        this._playNote(80, 1.5, 'sine', 0.3, 0.02, 0.2, 0.5, 1.0);
        this._playNoise(2.0, 0.15, 200, 'lowpass', 80);
        setTimeout(() => this._playNote(60, 1.0, 'sine', 0.2, 0.05, 0.3, 0.4, 0.8), 300);
      }
    });
  },

  // 开�?  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopBGM();
      this._stopAllSampleLoops();
    }
    return this.enabled;
  }
};

// ---- 保存原始程序化方法的引用，供 fallback 使用 ----
AudioManager._playDoorOpen_procedural = AudioManager.playDoorOpen;
AudioManager._playAmbientWind_procedural = AudioManager.playAmbientWind;
AudioManager._stopAmbientWind_procedural = AudioManager.stopAmbientWind;
AudioManager._playFootstep_procedural = AudioManager.playFootstep;
AudioManager._playPaperFlip_procedural = AudioManager.playPaperFlip;
AudioManager._playBookFlip_procedural = AudioManager.playBookFlip;
AudioManager._playSigh_procedural = AudioManager.playSigh;

// ---- 替换为采样优先版�?----
AudioManager.playDoorOpen = AudioManager.playDoorOpen_sample;
AudioManager.playAmbientWind = AudioManager.playAmbientWind_sample;
AudioManager.stopAmbientWind = AudioManager.stopAmbientWind_sample;
AudioManager.playFootstep = AudioManager.playFootstep_sample;
AudioManager.playPaperFlip = AudioManager.playPaperFlip_sample;
AudioManager.playBookFlip = AudioManager.playBookFlip_sample;
AudioManager.playSigh = AudioManager.playSigh_sample;

/* === DEPRECATED MIDI 遗留代码 开�?=== */
/*
 * 遗留代码，midi-bgm.js 已移除，BGM 统一�?bgm-bridge.js (BGMEngine) 管理
 * 以下 MidiPlayer 模块暂以块注释方式保留，待确认无外部依赖后可整体删除
 * ==========================================
 * MidiPlayer - 标准MIDI文件播放器模�? * 符合工单API规范：load/play/setVariation/stop/setVolume
 * 支持：MIDI文件解析、Web Audio合成、三阶段变奏、实时参数调�? * 优先使用MidiBGM程序化引擎，支持标准.mid文件加载
 * ==========================================
const MidiPlayer = (function() {
  let _ctx = null;
  let _masterGain = null;
  let _loadedData = null;
  let _currentFile = null;
  let _isPlaying = false;
  let _variation = 'opening';
  let _volume = 0.35;
  let _tempo = 120;
  let _transpose = 0;
  let _instrument = null;
  let _schedulerTimer = null;
  let _trackStates = [];
  let _activeNotes = [];
  let _loopMode = false;
  let _onEndCallback = null;

  // ---- 轻量级MIDI文件解析�?----
  function _parseMIDI(data) {
    // data: Uint8Array of .mid file
    const view = new DataView(data.buffer || data);
    let pos = 0;

    function readVarLen() {
      let val = 0;
      let byte;
      do {
        byte = view.getUint8(pos++);
        val = (val << 7) | (byte & 0x7F);
      } while (byte & 0x80);
      return val;
    }

    function readStr(len) {
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(pos++));
      return s;
    }

    // 读取header
    const header = readStr(4);
    if (header !== 'MThd') return null;
    const headerLen = view.getUint32(pos + 0);
    pos += 4;
    const format = view.getUint16(pos + 0);
    const numTracks = view.getUint16(pos + 2);
    const division = view.getUint16(pos + 4);
    pos += headerLen;

    const tracks = [];
    for (let t = 0; t < numTracks; t++) {
      const trkHdr = readStr(4);
      if (trkHdr !== 'MTrk') return null;
      const trkLen = view.getUint32(pos + 0);
      pos += 4;
      const trkEnd = pos + trkLen;
      const events = [];
      let absTick = 0;
      let runningStatus = 0;

      while (pos < trkEnd) {
        const delta = readVarLen();
        absTick += delta;
        let status = view.getUint8(pos++);

        if (status < 0x80) {
          // running status
          pos--;
          status = runningStatus;
        } else {
          runningStatus = status;
        }

        if (status === 0xFF) {
          // Meta event
          const type = view.getUint8(pos++);
          const len = readVarLen();
          const metaData = [];
          for (let i = 0; i < len; i++) metaData.push(view.getUint8(pos++));
          events.push({ tick: absTick, type: 'meta', metaType: type, data: metaData });
          if (type === 0x2F) break; // End of track
        } else if (status === 0xF0 || status === 0xF7) {
          // SysEx
          const len = readVarLen();
          pos += len;
        } else {
          const high = status & 0xF0;
          const ch = status & 0x0F;
          if (high === 0x80 || high === 0x90) {
            const note = view.getUint8(pos++);
            const vel = view.getUint8(pos++);
            events.push({
              tick: absTick,
              type: high === 0x90 && vel > 0 ? 'noteOn' : 'noteOff',
              channel: ch,
              note: note,
              velocity: vel
            });
          } else if (high === 0xB0) {
            pos += 2; // CC
          } else if (high === 0xC0) {
            const prog = view.getUint8(pos++);
            events.push({ tick: absTick, type: 'program', channel: ch, program: prog });
          } else if (high === 0xE0) {
            pos += 2; // Pitch bend
          } else {
            // Other: 0xA0 (aftertouch), 0xD0 (channel pressure)
            const paramLen = (high === 0xD0) ? 1 : 2;
            pos += paramLen;
          }
        }
      }
      pos = trkEnd;
      tracks.push(events);
    }

    return { format, numTracks, division, tracks };
  }

  // ---- GM音色映射到我们的合成音色 ----
  const GM_INSTRUMENT_MAP = [
    // 0-7: Piano
    'piano','piano','piano','piano','piano','piano','harp','harp',
    // 8-15: Chromatic Percussion
    'bell','bell','bell','bell','bell','bell','bell','bell',
    // 16-23: Organ
    'pad','pad','pad','pad','pad','pad','pad','pad',
    // 24-31: Guitar
    'pluck','pluck','pluck','pluck','pluck','pluck','pluck','pluck',
    // 32-39: Bass
    'bass','bass','bass','bass','bass','bass','bass','bass',
    // 40-47: Strings
    'strings','strings','strings','strings','strings','strings','strings','strings',
    // 48-55: Ensemble
    'strings','strings','strings','strings','strings','pad','pad','pad',
    // 56-63: Brass
    'brass','brass','brass','brass','brass','brass','brass','brass',
    // 64-71: Reed
    'oboe','oboe','oboe','oboe','oboe','oboe','flute','flute',
    // 72-79: Pipe
    'flute','flute','flute','flute','flute','flute','flute','flute',
    // 80-87: Synth Lead
    'lead','lead','lead','lead','lead','lead','lead','lead',
    // 88-95: Synth Pad
    'pad','pad','dark_pad','pad','pad','dark_pad','dark_pad','dark_pad',
    // 96-103: Synth Effects
    'pad','pad','pad','pad','pad','pad','pad','pad',
    // 104-111: Ethnic
    'pluck','pluck','pluck','pluck','pluck','pluck','pluck','pluck',
    // 112-119: Percussive
    'bell','bell','bell','bell','bell','bell','bell','bell',
    // 120-127: Sound FX
    'pad','pad','pad','pad','pad','pad','pad','pad'
  ];

  function _gmToVoice(gmProgram) {
    return GM_INSTRUMENT_MAP[gmProgram] || 'piano';
  }

  function _midiToFreq(note, transpose) {
    const n = note + (transpose || 0);
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  // ---- 音频引擎 ----
  function _ensureContext() {
    if (_ctx) return true;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _masterGain = _ctx.createGain();
      _masterGain.gain.value = _volume;
      _masterGain.connect(_ctx.destination);
      return true;
    } catch(e) {
      console.warn('[MidiPlayer] Web Audio API not supported');
      return false;
    }
  }

  function _playNote(freq, startTime, duration, voice, vol) {
    if (!_ctx || freq < 20) return;
    const now = startTime;
    const end = startTime + duration;
    const osc = _ctx.createOscillator();
    const gain = _ctx.createGain();
    const filter = _ctx.createBiquadFilter();

    let oscType = 'triangle';
    let attack = 0.01, decay = 0.1, sustain = 0.5, release = 0.2;
    let cutoff = 4000;

    switch(voice) {
      case 'piano': oscType='triangle'; attack=0.005; decay=0.3; sustain=0.2; release=0.5; cutoff=5000; break;
      case 'strings': oscType='sine'; attack=0.1; decay=0.1; sustain=0.7; release=0.4; cutoff=6000; break;
      case 'pad': case 'dark_pad': oscType='sawtooth'; attack=0.3; decay=0.2; sustain=0.7; release=0.8; cutoff=voice==='dark_pad'?800:3000; break;
      case 'bell': case 'harp': oscType='sine'; attack=0.002; decay=0.4; sustain=0.1; release=1.0; cutoff=8000; break;
      case 'pluck': oscType='triangle'; attack=0.003; decay=0.15; sustain=0.05; release=0.2; cutoff=4500; break;
      case 'lead': oscType='square'; attack=0.01; decay=0.1; sustain=0.5; release=0.2; cutoff=4000; break;
      case 'bass': oscType='sine'; attack=0.02; decay=0.15; sustain=0.6; release=0.2; cutoff=600; break;
      case 'flute': oscType='sine'; attack=0.08; decay=0.08; sustain=0.7; release=0.3; cutoff=3500; break;
      case 'oboe': oscType='sawtooth'; attack=0.05; decay=0.1; sustain=0.65; release=0.25; cutoff=4500; break;
      case 'brass': oscType='sawtooth'; attack=0.06; decay=0.1; sustain=0.6; release=0.3; cutoff=5000; break;
    }

    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    osc.type = oscType;
    osc.frequency.value = freq;

    const peak = vol;
    const sus = peak * sustain;
    const noteEnd = Math.max(now + 0.01, end - release);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.linearRampToValueAtTime(sus, now + attack + decay);
    gain.gain.setValueAtTime(sus, noteEnd);
    gain.gain.exponentialRampToValueAtTime(0.001, end);

    // 添加泛音（简单版�?    const osc2 = _ctx.createOscillator();
    const gain2 = _ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2;
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(peak * 0.15, now + attack);
    gain2.gain.exponentialRampToValueAtTime(0.001, end);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(_masterGain);
    osc2.connect(gain2);
    gain2.connect(_masterGain);

    osc.start(now);
    osc.stop(end + release + 0.05);
    osc2.start(now);
    osc2.stop(end + release + 0.05);

    _activeNotes.push(osc, osc2);
  }

  // ---- 调度器（用于解析后的MIDI文件播放�?---
  function _startScheduler() {
    if (_schedulerTimer) clearTimeout(_schedulerTimer);
    const lookahead = 25;
    const scheduleAhead = 0.2;
    const startTime = _ctx.currentTime + 0.1;
    const ticksPerBeat = _loadedData.division;
    const secPerTick = 60.0 / _tempo / ticksPerBeat;

    // 初始化各�?    _trackStates = _loadedData.tracks.map(track => {
      // 对noteOn/noteOff配对，计算时�?      const notes = [];
      const active = {}; // note -> {startTick, vel, channel}
      const channelInstr = {};
      track.forEach(ev => {
        if (ev.type === 'program') {
          channelInstr[ev.channel] = ev.program;
        } else if (ev.type === 'noteOn') {
          active[ev.note] = { startTick: ev.tick, vel: ev.velocity, ch: ev.channel };
        } else if (ev.type === 'noteOff') {
          const a = active[ev.note];
          if (a) {
            notes.push({
              startTick: a.startTick,
              duration: (ev.tick - a.startTick) * secPerTick,
              note: ev.note,
              velocity: a.vel / 127,
              channel: a.ch,
              instrument: channelInstr[a.ch] || 0
            });
            delete active[ev.note];
          }
        }
      });
      return { notes: notes.sort((a,b) => a.startTick - b.startTick), idx: 0, currentTime: startTime };
    });

    function tick() {
      if (!_isPlaying) return;
      const now = _ctx.currentTime;
      _trackStates.forEach(ts => {
        while (ts.idx < ts.notes.length) {
          const n = ts.notes[ts.idx];
          const noteTime = startTime + n.startTick * secPerTick;
          if (noteTime > now + scheduleAhead) break;

          // 变奏处理
          let tempoMult = 1;
          let voiceType = _instrument || _gmToVoice(n.instrument);
          let volMult = 1;
          if (_variation === 'breakthrough') {
            tempoMult = 1.3;
            if (voiceType === 'piano' || voiceType === 'strings') voiceType = 'lead';
            volMult = 1.1;
          } else if (_variation === 'finishing') {
            tempoMult = 0.9;
            if (voiceType === 'lead' || voiceType === 'pluck') voiceType = 'bell';
            volMult = 1.2;
          }

          const freq = _midiToFreq(n.note, _transpose);
          const dur = n.duration / tempoMult;
          const vol = Math.min(0.6, n.velocity * 0.5 * volMult);
          _playNote(freq, noteTime, dur, voiceType, vol);
          ts.idx++;
        }
      });

      // 循环检�?      if (_loopMode && _trackStates.every(ts => ts.idx >= ts.notes.length)) {
        _trackStates.forEach(ts => {
          ts.idx = 0;
        });
        startTime = _ctx.currentTime + 0.1;
        _trackStates.forEach(ts => { ts.currentTime = startTime; });
        if (_onEndCallback) {
          const cb = _onEndCallback;
          _onEndCallback = null;
          setTimeout(cb, 500);
        }
      }

      _schedulerTimer = setTimeout(tick, lookahead);
    }
    tick();
  }

  // ---- 公共API（符合工单规范）----
  function load(filePath) {
    // 加载MIDI文件（支持路径或直接数据�?    if (typeof filePath === 'object' && filePath.tracks) {
      _loadedData = filePath;
      _currentFile = 'memory';
      return Promise.resolve(_loadedData);
    }
    return fetch(filePath)
      .then(r => r.arrayBuffer())
      .then(buf => {
        _loadedData = _parseMIDI(new Uint8Array(buf));
        _currentFile = filePath;
        return _loadedData;
      })
      .catch(e => {
        console.warn('[MidiPlayer] Failed to load MIDI file:', e);
        return null;
      });
  }

  function play(midiData, options) {
    options = options || {};
    if (midiData) {
      if (typeof midiData === 'string') {
        return load(midiData).then(() => play(null, options));
      }
      _loadedData = midiData;
    }
    if (!_loadedData) {
      // 无MIDI文件时，委托给MidiBGM
      if (typeof MidiBGM !== 'undefined') {
        if (options.loop !== false) MidiBGM.play();
        return;
      }
      console.warn('[MidiPlayer] No MIDI data loaded');
      return;
    }

    if (!_ensureContext()) return;
    if (_ctx.state === 'suspended') _ctx.resume();
    _isPlaying = true;
    _activeNotes = [];

    if (options.tempo) _tempo = options.tempo;
    if (options.transpose) _transpose = options.transpose;
    if (options.instrument) _instrument = options.instrument;

    _startScheduler();
  }

  function setVariation(type) {
    // type: 'opening' | 'breakthrough' | 'finishing'
    _variation = type;
    // 同步到MidiBGM
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.setVariation(type);
    }
  }

  function stop() {
    _isPlaying = false;
    if (_schedulerTimer) { clearTimeout(_schedulerTimer); _schedulerTimer = null; }
    // 快速淡出所有活跃音�?    if (_ctx && _masterGain) {
      const now = _ctx.currentTime;
      _masterGain.gain.cancelScheduledValues(now);
      _masterGain.gain.setValueAtTime(_masterGain.gain.value, now);
      _masterGain.gain.linearRampToValueAtTime(0, now + 0.3);
      setTimeout(() => {
        if (_masterGain) _masterGain.gain.setValueAtTime(_volume, _ctx.currentTime);
      }, 350);
    }
    _activeNotes.forEach(o => { try { o.stop(); } catch(e){} });
    _activeNotes = [];
  }

  function setVolume(volume) {
    _volume = Math.max(0, Math.min(0.8, volume));
    if (_masterGain) {
      const now = _ctx ? _ctx.currentTime : 0;
      _masterGain.gain.cancelScheduledValues(now);
      _masterGain.gain.linearRampToValueAtTime(_volume, now + 0.2);
    }
    // 同步MidiBGM
    if (typeof MidiBGM !== 'undefined') {
      MidiBGM.setVolume(volume);
    }
  }

  function setTempo(bpm) {
    _tempo = bpm;
    if (typeof MidiBGM !== 'undefined') MidiBGM.setTempo(bpm);
  }

  function setTranspose(semitones) {
    _transpose = semitones;
    if (typeof MidiBGM !== 'undefined') MidiBGM.setTranspose(semitones);
  }

  function setInstrument(instr) {
    _instrument = instr;
    if (typeof MidiBGM !== 'undefined') MidiBGM.setInstrument(instr);
  }

  function setLoop(shouldLoop) {
    _loopMode = !!shouldLoop;
  }

  function setOnEnd(callback) {
    _onEndCallback = typeof callback === 'function' ? callback : null;
  }

  return {
    load, play, setVariation, stop, setVolume, setTempo, setTranspose, setInstrument,
    setLoop, setOnEnd,
    get isPlaying() { return _isPlaying; },
    get variation() { return _variation; },
    get loadedFile() { return _currentFile; },
    _parseMIDI
  };
})();

// 初始化：AudioManager加载时也初始化MidiPlayer引用
if (typeof window !== 'undefined') {
  window.MidiPlayer = MidiPlayer;
}
*/
/* === DEPRECATED MIDI 遗留代码 结束 === */
