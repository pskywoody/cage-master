// ==========================================
// 音效管理器 v2.0（Web Audio API 程序化生成，音质升级版）
// ==========================================
const AudioManager = {
  ctx: null,
  enabled: true,
  masterGain: null,
  sfxGain: null,
  bgmGain: null,
  bgmNodes: [],
  bgmPlaying: false,
  bgmTimer: null,
  sfxVolume: 0.4,
  bgmVolume: 0.08,
  reverbBuffer: null,

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
    } catch (e) {
      console.warn('Web Audio API 不支持');
      this.enabled = false;
    }
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
    if (!this.enabled || !this.ctx) return;
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
    if (!this.enabled || !this.ctx) return;
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
    if (!this.enabled || !this.ctx) return;
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

  // ========== 背景音乐 ==========

  // 改进的BGM：和弦进行+旋律+低音
  startBGM() {
    if (!this.enabled || !this.ctx || this.bgmPlaying) return;
    this.resume();
    this.bgmPlaying = true;
    this.bgmNodes = [];

    // 和弦进行（C-Am-F-G 经典流行进行）
    const chords = [
      [262, 330, 392],  // C
      [220, 262, 330],  // Am
      [175, 220, 262],  // F
      [196, 247, 294],  // G
    ];
    const chordDurations = [2, 2, 2, 2]; // 每个和弦2秒
    const melodyScale = [262, 294, 330, 392, 440, 523, 587, 659, 784];

    let beatIndex = 0;
    let chordIndex = 0;
    let chordBeatCount = 0;
    const bpm = 72;
    const beatMs = 60000 / bpm;

    const playBeat = () => {
      if (!this.bgmPlaying) return;

      // 和弦铺底（每2拍换一次和弦）
      if (chordBeatCount === 0) {
        const chord = chords[chordIndex];
        chord.forEach(f => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const now = this.ctx.currentTime;
          osc.type = 'sine';
          osc.frequency.value = f;
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.06, now + 0.1);
          gain.gain.setValueAtTime(0.06, now + beatMs * chordDurations[chordIndex] / 1000 - 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, now + beatMs * chordDurations[chordIndex] / 1000);
          osc.connect(gain);
          gain.connect(this.bgmGain);
          osc.start(now);
          osc.stop(now + beatMs * chordDurations[chordIndex] / 1000 + 0.1);
          this.bgmNodes.push(osc);
        });
      }

      // 低音（每拍根音）
      if (beatIndex % 2 === 0) {
        const rootFreq = chords[chordIndex][0] / 2;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;
        osc.type = 'triangle';
        osc.frequency.value = rootFreq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.bgmGain);
        osc.start(now);
        osc.stop(now + 0.4);
        this.bgmNodes.push(osc);
      }

      // 旋律音（随机，在和弦音上）
      if (Math.random() < 0.4) {
        const chord = chords[chordIndex];
        const chordTones = chord.map(f => f * 2).concat(chord.map(f => f * 4));
        const availNotes = melodyScale.filter(n => {
          return chordTones.some(ct => Math.abs(n - ct) < 20) || Math.random() < 0.2;
        });
        if (availNotes.length > 0) {
          const note = availNotes[Math.floor(Math.random() * availNotes.length)];
          this._playNote(note, 0.3 + Math.random() * 0.2, 'triangle', 0.04, 0.02, 0.05, 0.4, 0.2, this.bgmGain);
        }
      }

      beatIndex++;
      chordBeatCount++;
      if (chordBeatCount >= chordDurations[chordIndex]) {
        chordBeatCount = 0;
        chordIndex = (chordIndex + 1) % chords.length;
      }

      this.bgmTimer = setTimeout(playBeat, beatMs);
    };

    playBeat();
  },

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.bgmNodes.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    this.bgmNodes = [];
  },

  // 设置音量
  setSfxVolume(v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
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
