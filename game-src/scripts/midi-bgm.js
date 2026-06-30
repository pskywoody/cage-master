// ==========================================
// MidiBGM - 程序化MIDI音乐系统 v2
// 使用Web Audio API合成，零文件体积（<5KB）
// 支持7章BGM + 3特殊BGM + 4角色主题 + 三阶段变奏
// 三阶段: opening(开局/舒缓) → breakthrough(破局/紧张) → finishing(收官/辉煌)
// ==========================================

const MidiBGM = (function() {
  let ctx = null;
  let masterGain = null;
  let isPlaying = false;
  let currentChapter = 1;
  let currentPhase = 'opening';
  let _schedulerTimer = null;
  let _nextNoteTime = 0;
  let _melodyIndex = 0;
  let _bassIndex = 0;
  let _chordIndex = 0;
  let _volume = 0.1;
  let _currentTempo = 100;
  let _themeMode = false; // 是否在播放角色主题
  let _themeData = null;

  // ---- 音符合成 ----
  function _createContext() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = _volume;
      masterGain.connect(ctx.destination);
    } catch(e) {
      console.warn('[BGM] Web Audio API not supported');
    }
  }

  // 带泛音的更丰富音色合成
  function _playNote(freq, startTime, duration, type, vol) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // 添加低通滤波让音色更柔和
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = type === 'sawtooth' ? 2000 : (type === 'square' ? 3000 : 4000);

    osc.type = type || 'sine';
    osc.frequency.value = freq;

    // ADSR envelope
    const attack = type === 'sine' ? 0.05 : 0.02;
    const decay = 0.15;
    const sustainLevel = vol * 0.5;
    const release = 0.2;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + attack);
    gain.gain.linearRampToValueAtTime(sustainLevel, startTime + attack + decay);
    gain.gain.setValueAtTime(sustainLevel, startTime + Math.max(0.1, duration - release));
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  }

  // 音符名转频率
  function _noteFreq(note) {
    if (typeof note === 'number') return note;
    const notes = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6, G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };
    const match = note.match(/^([A-G][#b]?)(-?\d)$/);
    if (!match) return 440;
    const semitone = notes[match[1]];
    const octave = parseInt(match[2]);
    const midi = (octave + 1) * 12 + semitone;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ---- 7章BGM数据 ----
  // 格式: [音符, 拍数, 乐器类型, 音量]
  const CHAPTER_MUSIC = {
    // 第1章：温暖档案室 - C大调，温暖三角波
    1: {
      opening: {
        tempo: 75,
        melody: [
          ['C4',1,'triangle',0.18],['E4',1,'triangle',0.18],['G4',1,'triangle',0.18],['E4',1,'triangle',0.14],
          ['F4',1,'triangle',0.18],['A4',1,'triangle',0.18],['G4',2,'triangle',0.18],
          ['E4',1,'triangle',0.15],['G4',1,'triangle',0.15],['C5',2,'triangle',0.2],
          ['B4',1,'triangle',0.14],['G4',1,'triangle',0.15],['E4',2,'triangle',0.14]
        ],
        bass: [['C3',2,'sine',0.12],['F3',2,'sine',0.1],['G3',2,'sine',0.1],['C3',2,'sine',0.12]],
        chords: [['C4,E4,G4',2,'sine',0.04],['F4,A4,C5',2,'sine',0.04],['G4,B4,D5',2,'sine',0.04],['C4,E4,G4',2,'sine',0.05]]
      },
      breakthrough: {
        tempo: 120,
        melody: [
          ['C5',0.5,'square',0.12],['D5',0.5,'square',0.12],['E5',0.5,'square',0.12],['G5',0.5,'square',0.12],
          ['F5',0.5,'square',0.1],['E5',0.5,'square',0.12],['D5',1,'square',0.1],
          ['E5',0.5,'square',0.12],['G5',0.5,'square',0.12],['A5',1,'square',0.15],
          ['G5',0.5,'square',0.12],['E5',0.5,'square',0.1],['C5',1,'square',0.12]
        ],
        bass: [['C3',1,'sawtooth',0.08],['G3',1,'sawtooth',0.08],['F3',1,'sawtooth',0.08],['C3',1,'sawtooth',0.08]],
        chords: null
      },
      finishing: {
        tempo: 95,
        melody: [
          ['C5',1,'triangle',0.22],['E5',1,'triangle',0.22],['G5',2,'triangle',0.28],
          ['C5',0.5,'triangle',0.18],['E5',0.5,'triangle',0.18],['G5',0.5,'triangle',0.18],['C6',2,'triangle',0.28]
        ],
        bass: [['C3',2,'sine',0.15],['F3',2,'sine',0.12],['G3',1,'sine',0.12],['C3',3,'sine',0.15]],
        chords: [['C5,E5,G5',4,'sine',0.06]]
      }
    },

    // 第2章：秩序档案馆 - D小调，理性正弦波
    2: {
      opening: {
        tempo: 85,
        melody: [
          ['D4',1,'sine',0.15],['F4',1,'sine',0.15],['A4',1,'sine',0.12],['D5',1,'sine',0.15],
          ['C5',1,'sine',0.12],['A4',1,'sine',0.15],['F4',2,'sine',0.12],
          ['E4',1,'sine',0.1],['G4',1,'sine',0.12],['D4',2,'sine',0.15]
        ],
        bass: [['D3',2,'sine',0.1],['A3',2,'sine',0.08],['Bb3',2,'sine',0.08],['A3',2,'sine',0.1]],
        chords: [['D4,F4,A4',2,'sine',0.03],['A4,C5,E5',2,'sine',0.03],['Bb4,D5,F5',2,'sine',0.03],['A4,C5,E5',2,'sine',0.03]]
      },
      breakthrough: {
        tempo: 130,
        melody: [
          ['D5',0.5,'square',0.1],['F5',0.5,'square',0.1],['A5',0.5,'square',0.1],['D6',0.5,'square',0.12],
          ['C6',0.5,'square',0.1],['A5',0.5,'square',0.1],['F5',1,'square',0.08],
          ['E5',0.5,'square',0.1],['G5',0.5,'square',0.1],['D5',1,'square',0.12]
        ],
        bass: [['D3',0.5,'sawtooth',0.06],['A3',0.5,'sawtooth',0.06],['Bb3',0.5,'sawtooth',0.06],['A3',0.5,'sawtooth',0.06]],
        chords: null
      },
      finishing: {
        tempo: 95,
        melody: [['D5',2,'triangle',0.22],['F5',1,'triangle',0.18],['D5',3,'triangle',0.22]],
        bass: [['D3',3,'sine',0.12],['A3',3,'sine',0.1]],
        chords: [['D5,F5,A5',6,'sine',0.05]]
      }
    },

    // 第3章：密道悬疑 - E小调，锯齿波紧张感（阿岩Boss）
    3: {
      opening: {
        tempo: 70,
        melody: [
          ['E4',2,'sawtooth',0.08],['G4',1,'sawtooth',0.06],['B4',2,'sawtooth',0.08],
          ['A4',1,'sawtooth',0.06],['G4',2,'sawtooth',0.08],['F#4',1,'sawtooth',0.06],['E4',2,'sawtooth',0.1]
        ],
        bass: [['E2',3,'sawtooth',0.06],['B2',3,'sawtooth',0.06],['E2',2,'sawtooth',0.08]],
        chords: null
      },
      breakthrough: {
        tempo: 140,
        melody: [
          ['E5',0.25,'square',0.1],['F#5',0.25,'square',0.1],['G5',0.25,'square',0.1],['B5',0.25,'square',0.12],
          ['A5',0.25,'square',0.1],['G5',0.25,'square',0.08],['F#5',0.5,'square',0.08],['E5',0.5,'square',0.1]
        ],
        bass: [['E2',0.5,'sawtooth',0.05],['B2',0.5,'sawtooth',0.05]],
        chords: null
      },
      finishing: {
        tempo: 80,
        melody: [['E5',3,'triangle',0.2],['G5',1,'triangle',0.15],['E5',4,'triangle',0.18]],
        bass: [['E2',4,'sine',0.1],['B2',4,'sine',0.08]],
        chords: [['E5,G5,B5',8,'sine',0.05]]
      }
    },

    // 第4章：旧档案库 - G大调，怀旧温暖（残局守护者）
    4: {
      opening: {
        tempo: 70,
        melody: [
          ['G4',1,'sine',0.12],['B4',1,'sine',0.12],['D5',1,'sine',0.12],['B4',1,'sine',0.1],
          ['A4',1,'sine',0.12],['C5',1,'sine',0.12],['G4',2,'sine',0.15]
        ],
        bass: [['G3',2,'sine',0.1],['C3',2,'sine',0.08],['D3',2,'sine',0.08],['G3',2,'sine',0.1]],
        chords: [['G4,B4,D5',2,'sine',0.03],['C5,E5,G5',2,'sine',0.03],['D5,F#5,A5',2,'sine',0.03],['G4,B4,D5',2,'sine',0.04]]
      },
      breakthrough: {
        tempo: 110,
        melody: [
          ['G5',0.5,'square',0.1],['B5',0.5,'square',0.1],['D6',1,'square',0.12],
          ['C6',0.5,'square',0.08],['A5',0.5,'square',0.1],['G5',1,'square',0.12]
        ],
        bass: [['G2',1,'sawtooth',0.06],['D3',1,'sawtooth',0.06],['C3',1,'sawtooth',0.05],['G2',1,'sawtooth',0.06]],
        chords: null
      },
      finishing: {
        tempo: 80,
        melody: [['G5',2,'triangle',0.2],['D5',1,'triangle',0.15],['G4',3,'triangle',0.18]],
        bass: [['G3',3,'sine',0.1],['D3',3,'sine',0.08]],
        chords: [['G5,B5,D6',6,'sine',0.05]]
      }
    },

    // 第5章：星辰核心 - A小调，冷峻科幻（星辰梭）
    5: {
      opening: {
        tempo: 80,
        melody: [
          ['A4',1,'sine',0.1],['C5',1,'sine',0.1],['E5',1,'sine',0.12],['C5',1,'sine',0.08],
          ['B4',1,'sine',0.1],['E5',1,'sine',0.1],['A5',2,'sine',0.12]
        ],
        bass: [['A2',2,'sine',0.08],['E3',2,'sine',0.06],['F3',2,'sine',0.06],['E3',2,'sine',0.08]],
        chords: null
      },
      breakthrough: {
        tempo: 140,
        melody: [
          ['E5',0.25,'square',0.08],['A5',0.25,'square',0.1],['C6',0.25,'square',0.1],['E6',0.25,'square',0.12],
          ['D6',0.25,'square',0.1],['C6',0.25,'square',0.08],['B5',0.5,'square',0.06],['A5',0.5,'square',0.1]
        ],
        bass: [['A2',0.5,'sawtooth',0.05],['E3',0.5,'sawtooth',0.05]],
        chords: null
      },
      finishing: {
        tempo: 85,
        melody: [['A5',2,'triangle',0.18],['C6',1,'triangle',0.15],['E6',3,'triangle',0.18]],
        bass: [['A2',3,'sine',0.08],['E3',3,'sine',0.06]],
        chords: [['A5,C6,E6',6,'sine',0.04]]
      }
    },

    // 第6章：设局人书房 - F小调，压迫沉重（设局人）
    6: {
      opening: {
        tempo: 55,
        melody: [
          ['F4',2,'sawtooth',0.08],['Ab4',2,'sawtooth',0.08],['C5',2,'sawtooth',0.1],
          ['Db5',1,'sawtooth',0.08],['C5',2,'sawtooth',0.1],['Ab4',3,'sawtooth',0.08]
        ],
        bass: [['F2',3,'sawtooth',0.06],['Db3',3,'sawtooth',0.06],['C3',2,'sawtooth',0.08]],
        chords: null
      },
      breakthrough: {
        tempo: 150,
        melody: [
          ['F5',0.25,'square',0.1],['Ab5',0.25,'square',0.1],['C6',0.25,'square',0.12],['Db6',0.25,'square',0.12],
          ['C6',0.25,'square',0.1],['Ab5',0.25,'square',0.1],['F5',0.5,'square',0.08],['Db5',0.5,'square',0.1]
        ],
        bass: [['F2',0.5,'sawtooth',0.05],['Db3',0.5,'sawtooth',0.05]],
        chords: null
      },
      finishing: {
        tempo: 65,
        melody: [['F5',3,'triangle',0.18],['Db5',1,'triangle',0.12],['F4',4,'triangle',0.18]],
        bass: [['F2',4,'sine',0.08],['Db3',4,'sine',0.06]],
        chords: [['F5,Ab5,C6',8,'sine',0.04]]
      }
    },

    // 第7章：真相之殿 - C大调，辉煌光明（终章）
    7: {
      opening: {
        tempo: 85,
        melody: [
          ['C5',1,'triangle',0.18],['E5',1,'triangle',0.18],['G5',1,'triangle',0.18],['C6',2,'triangle',0.22],
          ['B5',1,'triangle',0.18],['G5',1,'triangle',0.18],['E5',2,'triangle',0.18]
        ],
        bass: [['C3',2,'sine',0.12],['F3',2,'sine',0.1],['G3',2,'sine',0.1],['C3',2,'sine',0.12]],
        chords: [['C5,E5,G5',2,'sine',0.05],['F5,A5,C6',2,'sine',0.04],['G5,B5,D6',2,'sine',0.04],['C5,E5,G5',2,'sine',0.05]]
      },
      breakthrough: {
        tempo: 130,
        melody: [
          ['C6',0.5,'square',0.12],['E6',0.5,'square',0.12],['G6',0.5,'square',0.12],['C7',1,'square',0.18],
          ['B6',0.5,'square',0.12],['G6',0.5,'square',0.1],['E6',1,'square',0.12]
        ],
        bass: [['C3',1,'sawtooth',0.06],['G3',1,'sawtooth',0.06],['F3',1,'sawtooth',0.06],['C3',1,'sawtooth',0.08]],
        chords: null
      },
      finishing: {
        tempo: 105,
        melody: [
          ['C5',1,'triangle',0.22],['E5',1,'triangle',0.22],['G5',1,'triangle',0.22],['C6',3,'triangle',0.28],
          ['G5',1,'triangle',0.18],['E5',1,'triangle',0.18],['C5',4,'triangle',0.22]
        ],
        bass: [['C3',4,'sine',0.12],['G3',2,'sine',0.1],['C3',2,'sine',0.15]],
        chords: [['C5,E5,G5,C6',8,'sine',0.06]]
      }
    }
  };

  // 特殊BGM
  const SPECIAL_MUSIC = {
    boss_battle: {
      tempo: 160,
      melody: [
        ['E4',0.25,'square',0.1],['F#4',0.25,'square',0.1],['G4',0.25,'square',0.12],['B4',0.25,'square',0.12],
        ['A4',0.25,'square',0.1],['G4',0.25,'square',0.1],['F#4',0.25,'square',0.08],['E4',0.25,'square',0.1]
      ],
      bass: [['E2',0.5,'sawtooth',0.06],['B2',0.5,'sawtooth',0.06]],
      chords: null,
      loop: true
    },
    breakthrough: {
      tempo: 140,
      melody: [
        ['C5',0.125,'square',0.08],['D5',0.125,'square',0.08],['E5',0.125,'square',0.1],['G5',0.125,'square',0.1],
        ['C6',0.5,'triangle',0.18],['B5',0.25,'square',0.08],['G5',0.25,'square',0.08],['E5',0.5,'square',0.12]
      ],
      bass: [['C3',0.25,'sawtooth',0.05],['G3',0.25,'sawtooth',0.05]],
      chords: null,
      oneShot: true
    },
    victory: {
      tempo: 120,
      melody: [
        ['C5',0.5,'triangle',0.2],['E5',0.5,'triangle',0.2],['G5',0.5,'triangle',0.2],['C6',1,'triangle',0.28],
        ['B5',0.5,'triangle',0.2],['G5',0.5,'triangle',0.2],['E5',0.5,'triangle',0.2],['C5',1.5,'triangle',0.22]
      ],
      bass: [['C3',2,'sine',0.12],['G3',2,'sine',0.1],['C3',2,'sine',0.12]],
      chords: [['C5,E5,G5',2,'sine',0.06],['G5,B5,D6',2,'sine',0.05],['C5,E5,G5,C6',2,'sine',0.07]],
      oneShot: true
    }
  };

  // 4个角色主题动机（10-15秒短旋律）
  const CHARACTER_THEMES = {
    cagekeeper: { // 守笼人 - C大调，温暖木质感
      tempo: 80,
      melody: [
        ['C4',1,'triangle',0.15],['E4',1,'triangle',0.15],['G4',1,'triangle',0.15],['C5',2,'triangle',0.18],
        ['B4',0.5,'triangle',0.12],['A4',0.5,'triangle',0.12],['G4',1,'triangle',0.15],['E4',1,'triangle',0.12],['C4',2,'triangle',0.15]
      ],
      bass: [['C3',4,'sine',0.1],['G3',2,'sine',0.08],['C3',2,'sine',0.1]]
    },
    ray: { // 阿岩 - E小调，活泼有活力
      tempo: 110,
      melody: [
        ['E4',0.5,'square',0.1],['G4',0.5,'square',0.1],['B4',0.5,'square',0.12],['E5',0.5,'square',0.12],
        ['D5',0.5,'square',0.1],['B4',0.5,'square',0.1],['G4',0.5,'square',0.08],['E4',1,'square',0.1]
      ],
      bass: [['E3',1,'sawtooth',0.06],['B3',1,'sawtooth',0.06]]
    },
    plotter: { // 设局人 - F小调，低沉神秘
      tempo: 60,
      melody: [
        ['F4',2,'sawtooth',0.08],['Ab4',2,'sawtooth',0.08],['C5',3,'sawtooth',0.1],
        ['Db5',1,'sawtooth',0.08],['C5',2,'sawtooth',0.08],['F4',4,'sawtooth',0.1]
      ],
      bass: [['F2',4,'sawtooth',0.06],['Db3',4,'sawtooth',0.06]]
    },
    weaver: { // 星辰梭 - A小调，空灵科幻
      tempo: 90,
      melody: [
        ['A4',1,'sine',0.1],['C5',1,'sine',0.1],['E5',1,'sine',0.12],['A5',2,'sine',0.15],
        ['G5',0.5,'sine',0.1],['E5',0.5,'sine',0.1],['C5',1,'sine',0.1],['A4',2,'sine',0.12]
      ],
      bass: [['A2',3,'sine',0.06],['E3',3,'sine',0.05]]
    }
  };

  // ---- 调度器 ----
  function _scheduler() {
    if (!isPlaying || !ctx) return;
    while (_nextNoteTime < ctx.currentTime + 0.15) {
      _playCurrentNotes();
    }
    _schedulerTimer = setTimeout(_scheduler, 25);
  }

  function _playChord(chordStr, startTime, duration, type, vol) {
    // 播放和弦（多个音符同时发声）
    const notes = chordStr.split(',');
    notes.forEach(n => {
      _playNote(_noteFreq(n.trim()), startTime, duration, type, vol / notes.length);
    });
  }

  function _playCurrentNotes() {
    const data = _themeMode ? _themeData : _getCurrentData();
    if (!data) return;
    const secondsPerBeat = 60.0 / data.tempo;
    _currentTempo = data.tempo;
    const t = _nextNoteTime;

    // 播放旋律
    if (data.melody && data.melody.length > 0) {
      const idx = _melodyIndex % data.melody.length;
      const [note, beats, type, vol] = data.melody[idx];
      _playNote(_noteFreq(note), t, beats * secondsPerBeat * 0.9, type, vol * _volume);
      // 推进
      _nextNoteTime += beats * secondsPerBeat;
      _melodyIndex++;
    }

    // 播放贝斯（独立循环）
    if (data.bass && data.bass.length > 0) {
      const bIdx = _bassIndex % data.bass.length;
      const [note, beats, type, vol] = data.bass[bIdx];
      const bTime = t; // 贝斯和旋律同时开始
      // 计算贝斯是否该在这个时间点播放
      const bassTotalBeats = data.bass.reduce((s, n) => s + n[1], 0);
      const melodyTotalBeats = data.melody ? data.melody.reduce((s, n) => s + n[1], 0) : 4;
      // 简单策略：每小节贝斯循环一次
      if (_melodyIndex % Math.max(1, Math.floor(bassTotalBeats)) === 0 || _bassIndex === 0) {
        _playNote(_noteFreq(note), bTime, beats * secondsPerBeat * 0.9, type, vol * _volume);
        _bassIndex = (_bassIndex + 1) % data.bass.length;
      }
    }

    // 播放和弦（每4拍换一次）
    if (data.chords && data.chords.length > 0) {
      const cIdx = _chordIndex % data.chords.length;
      const [chord, beats, type, vol] = data.chords[cIdx];
      const beatsSinceStart = (_melodyIndex > 0) ? data.melody.slice(0, _melodyIndex % data.melody.length).reduce((s, n) => s + n[1], 0) : 0;
      if (Math.floor(beatsSinceStart) % 4 === 0 && beatsSinceStart < (data.melody ? data.melody.length : 0)) {
        _playChord(chord, t, beats * secondsPerBeat * 0.95, type, vol * _volume);
      }
      if (_melodyIndex > 0 && _melodyIndex % 4 === 0) {
        _chordIndex = (_chordIndex + 1) % data.chords.length;
      }
    }

    // 循环处理
    if (data.melody && _melodyIndex >= data.melody.length) {
      if (data.oneShot) {
        // 一次性播放完停止
        setTimeout(() => {
          if (_themeMode) {
            _themeMode = false;
            _themeData = null;
            _melodyIndex = 0;
            _bassIndex = 0;
            _chordIndex = 0;
            _nextNoteTime = ctx.currentTime + 0.1;
          }
        }, beats * secondsPerBeat * 1000);
      } else {
        _melodyIndex = 0;
        _chordIndex = 0;
      }
    }
  }

  function _getCurrentData() {
    if (currentChapter === 'boss_battle' || currentChapter === 'breakthrough' || currentChapter === 'victory') {
      return SPECIAL_MUSIC[currentChapter];
    }
    const ch = CHAPTER_MUSIC[currentChapter];
    if (!ch) return CHAPTER_MUSIC[1].opening;
    return ch[currentPhase] || ch.opening;
  }

  // ---- 公共API ----
  function load(chapterId) {
    currentChapter = chapterId;
    currentPhase = 'opening';
    _melodyIndex = 0;
    _bassIndex = 0;
    _chordIndex = 0;
    _themeMode = false;
    _themeData = null;
  }

  function play() {
    _createContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (isPlaying) return;
    isPlaying = true;
    _melodyIndex = 0;
    _bassIndex = 0;
    _chordIndex = 0;
    _nextNoteTime = ctx.currentTime + 0.1;
    _scheduler();
  }

  function stop() {
    isPlaying = false;
    if (_schedulerTimer) { clearTimeout(_schedulerTimer); _schedulerTimer = null; }
  }

  // 设置三阶段（平滑切换）
  function setPhase(phase) {
    if (phase === currentPhase) return;
    currentPhase = phase;
    _melodyIndex = 0;
    _bassIndex = 0;
    _chordIndex = 0;
    // 通关阶段播放victory
    if (phase === 'finishing') {
      setTimeout(() => {
        playSpecial('victory');
      }, 500);
    }
  }

  function setVolume(v) {
    _volume = Math.max(0, Math.min(0.3, v));
    if (masterGain) masterGain.gain.value = _volume;
  }

  function setTempo(bpm) {
    _currentTempo = bpm;
  }

  // 播放角色主题动机（一次性）
  function playTheme(charId) {
    const theme = CHARACTER_THEMES[charId];
    if (!theme) return;
    _themeMode = true;
    _themeData = theme;
    _melodyIndex = 0;
    _bassIndex = 0;
    _chordIndex = 0;
    if (!isPlaying) {
      _createContext();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      isPlaying = true;
      _nextNoteTime = ctx.currentTime + 0.1;
      _scheduler();
    }
  }

  // 播放特殊BGM
  function playSpecial(name) {
    const special = SPECIAL_MUSIC[name];
    if (!special) return;
    currentChapter = name;
    _melodyIndex = 0;
    _bassIndex = 0;
    _chordIndex = 0;
    if (!isPlaying) {
      _createContext();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      isPlaying = true;
      _nextNoteTime = ctx.currentTime + 0.1;
      _scheduler();
    }
  }

  return {
    load,
    play,
    stop,
    setPhase,
    setVolume,
    setTempo,
    playTheme,
    playSpecial,
    playChapter: function(ch) { load(ch); play(); },
    get isPlaying() { return isPlaying; },
    get phase() { return currentPhase; },
    get chapter() { return currentChapter; }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MidiBGM;
} else {
  window.MidiBGM = MidiBGM;
}
