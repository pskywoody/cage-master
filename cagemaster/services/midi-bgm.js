// ==========================================
// MidiBGM v5 - 逆转裁判风格MIDI音乐系统
// 灵感来源: 逆転裁判 (Ace Attorney) 系列BGM风格
// 特征: 爵士/摇滚融合、铜管+钢琴主导、紧迫切分节奏、
//       不协和和声制造悬疑、强烈贝斯riff、戏剧性动态变化
// 7章BGM + 3特殊BGM + 4角色主题
// ==========================================

const MidiBGM = (function() {
  let ctx = null;
  let masterGain = null;
  let reverbNode = null, reverbGain = null;
  let delayNode = null, delayFeedback = null, delayGain = null;
  let distortionNode = null;
  let isPlaying = false;
  let currentChapter = 1;
  let currentPhase = 'opening';
  let _volume = 0.4;
  let _schedulerTimer = null;
  let _lookahead = 25;
  let _scheduleAhead = 0.3;
  let _barCount = 0;

  let _tracks = {
    melody:  { nextTime: 0, idx: 0, gain: null, pan: 0 },
    counter: { nextTime: 0, idx: 0, gain: null, pan: -0.15 },
    arp:     { nextTime: 0, idx: 0, gain: null, pan: 0.2 },
    bass:    { nextTime: 0, idx: 0, gain: null, pan: 0 },
    harm:    { nextTime: 0, idx: 0, gain: null, pan: 0 },
    pad:     { nextTime: 0, idx: 0, gain: null, pan: 0 },
    perc:    { nextTime: 0, idx: 0, gain: null, pan: 0 }
  };

  let _pendingPhase = null;
  let _crossfadeStart = 0;
  let _crossfadeDuration = 1.5;
  let _themeMode = false;
  let _themeData = null;
  let _oneShotCallback = null;
  let _currentTempo = 100;
  let _transpose = 0;
  let _instrumentOverride = null;
  let _expression = 1.0;

  const NOTE_SEMITONES = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };

  function noteToFreq(note) {
    if (typeof note === 'number') return note;
    if (note === 'R' || note === null || note === 'r') return 0;
    const m = note.match(/^([A-G][#b]?)(-?\d)$/);
    if (!m) return 440;
    const semi = NOTE_SEMITONES[m[1]];
    const oct = parseInt(m[2]);
    const midi = (oct + 1) * 12 + semi + _transpose;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function noteToMidi(note) {
    if (typeof note === 'number') return Math.round(69 + 12 * Math.log2(note / 440));
    if (note === 'R' || note === null || note === 'r') return -1;
    const m = note.match(/^([A-G][#b]?)(-?\d)$/);
    if (!m) return 60;
    const semi = NOTE_SEMITONES[m[1]];
    const oct = parseInt(m[2]);
    return (oct + 1) * 12 + semi + _transpose;
  }

  function midiToNote(midi) {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return names[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  function _createContext() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = _volume;
      masterGain.connect(ctx.destination);

      const trackConfigs = {
        melody:  { vol: 1.0, pan: 0.0 },
        counter: { vol: 0.6, pan: -0.15 },
        arp:     { vol: 0.5, pan: 0.2 },
        bass:    { vol: 1.2, pan: 0.0 },
        harm:    { vol: 0.7, pan: 0.0 },
        pad:     { vol: 0.4, pan: 0.0 },
        perc:    { vol: 0.55, pan: 0.0 }
      };

      Object.entries(trackConfigs).forEach(([name, cfg]) => {
        const t = _tracks[name];
        t.gain = ctx.createGain();
        t.gain.gain.value = cfg.vol;
        if (cfg.pan !== 0) {
          t.panner = ctx.createStereoPanner();
          t.panner.pan.value = cfg.pan;
          t.gain.connect(t.panner);
          t.panner.connect(masterGain);
        } else {
          t.gain.connect(masterGain);
        }
      });

      _createReverb();
      _createDelay();

      ['melody','counter','arp'].forEach(name => {
        const t = _tracks[name];
        const src = t.panner || t.gain;
        if (reverbGain) src.connect(reverbGain);
        if (delayGain) src.connect(delayGain);
      });
      ['harm','pad'].forEach(name => {
        const t = _tracks[name];
        const src = t.panner || t.gain;
        if (reverbGain) src.connect(reverbGain);
      });

      return true;
    } catch(e) {
      console.warn('[BGM] Web Audio API not supported', e);
      return false;
    }
  }

  function _createReverb() {
    const sr = ctx.sampleRate;
    const len = sr * 2.2;
    const impulse = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i/len, 3.5);
      }
    }
    reverbNode = ctx.createConvolver();
    reverbNode.buffer = impulse;
    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.18;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass'; rf.frequency.value = 5000;
    reverbNode.connect(rf); rf.connect(reverbGain); reverbGain.connect(masterGain);
  }

  function _createDelay() {
    delayNode = ctx.createDelay(2.0);
    delayNode.delayTime.value = 0.25;
    delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.2;
    delayGain = ctx.createGain();
    delayGain.gain.value = 0.1;
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass'; df.frequency.value = 2500;
    delayNode.connect(df); df.connect(delayFeedback);
    delayFeedback.connect(delayNode); df.connect(delayGain);
    delayGain.connect(masterGain);
  }

  function _playVoice(freq, startTime, duration, voiceType, volume, destNode) {
    if (!ctx || freq === 0) return;
    const dest = destNode || masterGain;
    const now = startTime;
    const end = startTime + duration;
    const vel = volume * _expression;

    const voices = {
      // 逆转裁判核心音色
      ace_piano: [  // 明亮的大钢琴（主旋律用）
        ['triangle',1,0.4,0],['sine',2,0.2,0],['sine',3,0.08,2],
        ['sine',4,0.04,-2],['sine',1,0.1,6]
      ],
      ace_brass: [  // 尖锐铜管（异议！追求！）
        ['sawtooth',1,0.3,0],['square',1,0.15,0],['sine',2,0.12,0],
        ['sine',3,0.05,0],['triangle',1,0.1,0]
      ],
      ace_trumpet: [  // 小号齐奏
        ['sawtooth',1,0.35,0],['square',2,0.08,0],['sine',3,0.04,0],
        ['sine',1,0.15,8]
      ],
      jazz_guitar: [  // 爵士吉他
        ['triangle',1,0.45,0],['sine',2,0.12,0],['sine',3,0.05,0],
        ['square',1,0.08,0]
      ],
      slap_bass: [  // 击弦贝斯（逆转裁判标志节奏）
        ['sine',1,0.45,0],['sine',0.5,0.4,0],['triangle',1,0.2,0],
        ['sine',2,0.06,0]
      ],
      suspense_pad: [  // 悬疑铺底
        ['sine',1,0.2,0],['sine',1.006,0.2,0],['sine',2,0.06,5],
        ['sawtooth',0.5,0.15,0]
      ],
      dark_pad: [
        ['sawtooth',1,0.18,0],['sine',1,0.2,0],['sine',0.5,0.2,0],
        ['sine',1.005,0.15,0]
      ],
      // 标准音色
      piano: [['triangle',1,0.5,0],['sine',2,0.15,0],['sine',3,0.05,3],['sine',4,0.02,-2]],
      strings: [['sine',1,0.35,0],['sine',2,0.18,6],['sine',3,0.07,-4],['triangle',1,0.2,2]],
      strings_sus: [['sawtooth',1,0.25,0],['sine',1,0.25,0],['sine',2,0.12,5],['triangle',1,0.15,-3],['sine',1.007,0.2,0]],
      cello: [['sawtooth',1,0.3,0],['sine',1,0.2,0],['sine',2,0.1,4],['sine',0.5,0.15,0]],
      pad: [['sine',1,0.3,0],['sine',1.008,0.25,0],['sine',2,0.07,5],['sine',0.5,0.12,0]],
      bell: [['sine',1,0.25,0],['sine',2.76,0.14,0],['sine',5.4,0.06,0],['triangle',1,0.15,0]],
      music_box: [['sine',1,0.3,0],['sine',2,0.2,0],['sine',3,0.1,0],['triangle',1,0.15,0]],
      harp: [['triangle',1,0.35,0],['sine',2,0.2,0],['sine',3,0.1,0],['sine',4,0.05,0]],
      pluck: [['triangle',1,0.45,0],['sine',2,0.12,0],['square',3,0.03,0]],
      pizzicato: [['triangle',1,0.5,0],['sine',2,0.08,0],['sine',3,0.03,0]],
      lead: [['square',1,0.2,0],['sine',1,0.2,0],['sine',2,0.1,0],['triangle',3,0.04,0]],
      synth_lead: [['sawtooth',1,0.25,0],['square',1,0.1,0],['sine',1,0.15,0],['sine',2,0.08,5]],
      bass: [['sine',1,0.5,0],['sine',0.5,0.35,0],['sine',2,0.05,0],['triangle',1,0.15,0]],
      finger_bass: [['triangle',1,0.4,0],['sine',1,0.3,0],['sine',0.5,0.2,0],['sine',2,0.05,0]],
      flute: [['sine',1,0.4,0],['sine',2,0.12,0],['sine',3,0.04,0]],
      oboe: [['sawtooth',1,0.25,0],['sine',2,0.15,0],['sine',1,0.2,0]],
      clarinet: [['square',1,0.2,0],['sine',1,0.25,0],['sine',3,0.1,0]],
      brass: [['sawtooth',1,0.25,0],['square',1,0.12,0],['sine',2,0.1,0],['sine',3,0.05,0]],
      horn: [['sawtooth',1,0.3,0],['sine',1,0.2,0],['sine',2,0.06,0]],
      choir: [['sine',1,0.25,0],['sine',1.003,0.2,0],['sine',2,0.12,5],['triangle',2,0.08,0]],
      sine: [['sine',1,0.6,0],['sine',2,0.05,0]],
      organ: [['sine',1,0.2,0],['sine',2,0.15,0],['sine',3,0.1,0],['sine',4,0.08,0],['sine',1.005,0.15,0]]
    };

    const harmonics = voices[voiceType] || voices.ace_piano;

    const mainFilter = ctx.createBiquadFilter();
    mainFilter.type = 'lowpass';
    let filterFreq = 5000, filterQ = 1;
    let attack = 0.02, decay = 0.15, sustain = 0.5, release = 0.3;
    let filterStart = 8000, filterEnd = 2000;

    switch(voiceType) {
      case 'ace_piano':
        attack=0.004; decay=0.3; sustain=0.25; release=0.5;
        filterFreq=7000; filterStart=10000; filterEnd=2500; break;
      case 'ace_brass': case 'ace_trumpet':
        attack=0.015; decay=0.05; sustain=0.7; release=0.15;
        filterFreq=6000; filterQ=2; filterStart=7000; filterEnd=5000; break;
      case 'jazz_guitar':
        attack=0.003; decay=0.2; sustain=0.15; release=0.3;
        filterFreq=5000; break;
      case 'slap_bass':
        attack=0.002; decay=0.08; sustain=0.2; release=0.1;
        filterFreq=900; filterStart=2000; filterEnd=400; break;
      case 'suspense_pad':
        attack=0.8; decay=0.2; sustain=0.7; release=1.2;
        filterFreq=1500; filterQ=6; break;
      case 'organ':
        attack=0.02; decay=0.05; sustain=0.8; release=0.1;
        filterFreq=5000; break;
      case 'piano':
        attack=0.005; decay=0.4; sustain=0.2; release=0.6; break;
      case 'grand_piano':
        attack=0.004; decay=0.6; sustain=0.15; release=0.8; filterFreq=7000; break;
      case 'strings': case 'strings_sus':
        attack=0.15; decay=0.1; sustain=0.7; release=0.5; filterFreq=6000; break;
      case 'cello':
        attack=0.1; decay=0.15; sustain=0.65; release=0.4; filterFreq=3000; break;
      case 'pad': case 'dark_pad': case 'choir':
        attack=0.5; decay=0.2; sustain=0.7; release=1.0;
        filterFreq = voiceType === 'dark_pad' ? 800 : (voiceType === 'suspense_pad' ? 1500 : 3500); break;
      case 'bell': case 'harp': case 'music_box':
        attack=0.002; decay=0.6; sustain=0.08; release=1.5; filterFreq=10000; break;
      case 'pluck': case 'pizzicato':
        attack=0.003; decay=0.15; sustain=0.03; release=0.2; filterFreq=5000; break;
      case 'lead': case 'synth_lead':
        attack=0.008; decay=0.08; sustain=0.6; release=0.25; filterFreq=4000; filterQ=2.5; break;
      case 'bass': case 'finger_bass':
        attack=0.015; decay=0.12; sustain=0.65; release=0.2; filterFreq=800; break;
      case 'brass': case 'horn':
        attack=0.04; decay=0.08; sustain=0.65; release=0.2; filterFreq=5500; break;
    }

    mainFilter.frequency.value = filterFreq;
    mainFilter.Q.value = filterQ;

    const midiNote = 69 + 12 * Math.log2(freq / 440);
    if (midiNote > 72) filterFreq *= 1.2;
    if (midiNote < 48) filterFreq *= 0.7;

    harmonics.forEach(([oscType, freqMult, volMult, detune]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = oscType;
      osc.frequency.value = freq * freqMult;
      osc.detune.value = detune;

      const peakVol = vel * volMult;
      const susVol = peakVol * sustain;
      const noteEnd = Math.max(now + 0.01, end - release);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peakVol, now + attack);
      g.gain.exponentialRampToValueAtTime(Math.max(susVol, 0.0001), now + attack + decay);
      g.gain.setValueAtTime(susVol, noteEnd);
      g.gain.exponentialRampToValueAtTime(0.001, end);

      if (freqMult <= 1 && voiceType !== 'suspense_pad' && voiceType !== 'organ') {
        const oscFilter = ctx.createBiquadFilter();
        oscFilter.type = 'lowpass';
        oscFilter.frequency.setValueAtTime(filterStart, now);
        oscFilter.frequency.exponentialRampToValueAtTime(Math.max(filterEnd, 200), now + attack + 0.3);
        oscFilter.Q.value = 1;
        osc.connect(g); g.connect(oscFilter); oscFilter.connect(mainFilter);
      } else {
        osc.connect(g); g.connect(mainFilter);
      }

      osc.start(now);
      osc.stop(end + release + 0.1);
    });

    mainFilter.connect(dest);
  }

  function _playChordNotes(chordStr, startTime, duration, voiceType, volume, destNode) {
    if (!chordStr) return;
    const notes = chordStr.split(',');
    const spread = Math.min(0.012 * notes.length, 0.03);
    notes.forEach((n, i) => {
      const f = noteToFreq(n.trim());
      if (f > 0) {
        _playVoice(f, startTime + i * spread, Math.max(duration - i*0.005, 0.1),
                   voiceType, volume / Math.pow(notes.length, 0.55), destNode);
      }
    });
  }

  function _playPerc(kind, startTime, volume, destNode) {
    if (!ctx) return;
    const dest = destNode || masterGain;
    const v = volume * 0.7;
    const sr = ctx.sampleRate;

    if (kind === 'kick') {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.1);
      g.gain.setValueAtTime(v, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
      osc.connect(g); g.connect(dest);
      osc.start(startTime); osc.stop(startTime + 0.25);
    } else if (kind === 'snare') {
      const bufLen = sr * 0.15;
      const buf = ctx.createBuffer(1, bufLen, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/bufLen, 4);
      const noise = ctx.createBufferSource(); noise.buffer = buf;
      const nf = ctx.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=1800;
      const ng = ctx.createGain(); ng.gain.value = v * 0.5;
      noise.connect(nf); nf.connect(ng); ng.connect(dest); noise.start(startTime);
      const osc = ctx.createOscillator(), og = ctx.createGain();
      osc.type='triangle'; osc.frequency.value=180;
      og.gain.setValueAtTime(v*0.3, startTime); og.gain.exponentialRampToValueAtTime(0.001, startTime+0.1);
      osc.connect(og); og.connect(dest); osc.start(startTime); osc.stop(startTime+0.12);
    } else if (kind === 'hat_closed' || kind === 'hh') {
      const bufLen = sr * 0.04;
      const buf = ctx.createBuffer(1, bufLen, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/bufLen, 10);
      const noise = ctx.createBufferSource(); noise.buffer = buf;
      const nf = ctx.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=7000;
      const ng = ctx.createGain(); ng.gain.value = v * 0.25;
      noise.connect(nf); nf.connect(ng); ng.connect(dest); noise.start(startTime);
    } else if (kind === 'hat_open') {
      const bufLen = sr * 0.25;
      const buf = ctx.createBuffer(1, bufLen, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/bufLen, 2);
      const noise = ctx.createBufferSource(); noise.buffer = buf;
      const nf = ctx.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=5000;
      const ng = ctx.createGain(); ng.gain.value = v * 0.2;
      noise.connect(nf); nf.connect(ng); ng.connect(dest); noise.start(startTime);
    } else if (kind === 'rim') {
      // 边击（逆转裁判常用）
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'square'; osc.frequency.value = 1800;
      g.gain.setValueAtTime(v*0.15, startTime); g.gain.exponentialRampToValueAtTime(0.001, startTime+0.02);
      osc.connect(g); g.connect(dest); osc.start(startTime); osc.stop(startTime+0.03);
    } else if (kind === 'clap') {
      const bufLen = sr * 0.1;
      const buf = ctx.createBuffer(1, bufLen, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/bufLen, 5);
      const noise = ctx.createBufferSource(); noise.buffer = buf;
      const nf = ctx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=2000; nf.Q.value=2;
      const ng = ctx.createGain(); ng.gain.value = v * 0.3;
      noise.connect(nf); nf.connect(ng); ng.connect(dest); noise.start(startTime);
    } else if (kind === 'tom') {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(200, startTime);
      osc.frequency.exponentialRampToValueAtTime(80, startTime+0.15);
      g.gain.setValueAtTime(v*0.4, startTime); g.gain.exponentialRampToValueAtTime(0.001, startTime+0.25);
      osc.connect(g); g.connect(dest); osc.start(startTime); osc.stop(startTime+0.3);
    } else if (kind === 'timpani') {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(100, startTime);
      osc.frequency.exponentialRampToValueAtTime(55, startTime+0.3);
      g.gain.setValueAtTime(v*0.7, startTime); g.gain.exponentialRampToValueAtTime(0.001, startTime+0.6);
      osc.connect(g); g.connect(dest); osc.start(startTime); osc.stop(startTime+0.7);
    } else if (kind === 'cymbal' || kind === 'crash') {
      const bufLen = sr * 1.5;
      const buf = ctx.createBuffer(1, bufLen, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/bufLen, 1.2);
      const noise = ctx.createBufferSource(); noise.buffer = buf;
      const nf = ctx.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=4000;
      const ng = ctx.createGain(); ng.gain.value = v * 0.3;
      noise.connect(nf); nf.connect(ng); ng.connect(dest); noise.start(startTime);
    } else if (kind === 'tick' || kind === 'click') {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type='square'; osc.frequency.value=2000;
      g.gain.setValueAtTime(v*0.1, startTime); g.gain.exponentialRampToValueAtTime(0.001, startTime+0.02);
      osc.connect(g); g.connect(dest); osc.start(startTime); osc.stop(startTime+0.03);
    } else if (kind === 'cowbell') {
      // 牛铃（逆转裁判特有的节奏元素）
      const osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator(), g = ctx.createGain();
      osc1.type='square'; osc1.frequency.value=560;
      osc2.type='square'; osc2.frequency.value=800;
      g.gain.setValueAtTime(v*0.15, startTime); g.gain.exponentialRampToValueAtTime(0.001, startTime+0.08);
      osc1.connect(g); osc2.connect(g); g.connect(dest);
      osc1.start(startTime); osc2.start(startTime); osc1.stop(startTime+0.1); osc2.stop(startTime+0.1);
    }
  }

  function _getArpPattern(pattern, chordNotes, beats, tempo) {
    const freqs = chordNotes.split(',').map(n => noteToFreq(n.trim())).filter(f => f > 0);
    if (freqs.length === 0) return [];
    const notes = [];
    const beatDur = 60 / tempo;
    const subdivisions = Math.max(2, Math.round(beats * 4));
    const noteDur = (beats * beatDur) / subdivisions * 0.7;
    for (let i = 0; i < subdivisions; i++) {
      let noteIdx;
      switch(pattern) {
        case 'up': noteIdx = i % freqs.length; break;
        case 'down': noteIdx = freqs.length - 1 - (i % freqs.length); break;
        case 'updown': { const c=freqs.length*2-2; const p=i%c; noteIdx=p<freqs.length?p:c-p; break; }
        case 'jazz': { // 爵士琶音模式 1-3-5-3-8-5-3-1
          const jazzPat=[0,2,4,2,0,2,4,2];
          noteIdx = jazzPat[i%8] % freqs.length; break;
        }
        default: noteIdx = i % freqs.length;
      }
      notes.push({ freq: freqs[Math.min(noteIdx, freqs.length-1)], dur: noteDur });
    }
    return notes;
  }

  // ==========================================
  // 音乐数据 - 逆转裁判风格
  // ==========================================

  // 第1章：序章/日常 - C大调，轻快俏皮
  const CH1 = {
    opening: {
      tempo: 132, timeSig: [4,4],
      melody: [
        ['E5',0.5,'ace_piano',0.14],['G5',0.25,'ace_piano',0.12],['E5',0.25,'ace_piano',0.10],
        ['C5',0.25,'ace_piano',0.12],['D5',0.25,'ace_piano',0.12],['E5',0.5,'ace_piano',0.14],
        ['G5',0.25,'ace_piano',0.12],['E5',0.25,'ace_piano',0.10],['C5',0.5,'ace_piano',0.12],
        ['D5',0.25,'ace_piano',0.12],['E5',0.25,'ace_piano',0.12],['G5',0.5,'ace_piano',0.14],
        ['A5',0.25,'ace_piano',0.12],['G5',0.25,'ace_piano',0.12],['E5',0.25,'ace_piano',0.10],['D5',0.25,'ace_piano',0.10],
        ['C5',0.5,'ace_piano',0.14],['E5',0.5,'ace_piano',0.12]
      ],
      counter: [
        ['G4',0.5,'ace_piano',0.08],['C5',0.5,'ace_piano',0.08],
        ['E4',0.5,'ace_piano',0.07],['G4',0.5,'ace_piano',0.07],
        ['A4',0.5,'ace_piano',0.08],['C5',0.5,'ace_piano',0.08],
        ['F4',0.5,'ace_piano',0.07],['G4',0.5,'ace_piano',0.08]
      ],
      arp: { pattern: 'jazz', voice: 'pluck', vol: 0.04 },
      bass: [
        ['C3',0.5,'slap_bass',0.12],['E3',0.25,'slap_bass',0.08],['G3',0.25,'slap_bass',0.08],
        ['C3',0.5,'slap_bass',0.10],['G2',0.25,'slap_bass',0.07],['B2',0.25,'slap_bass',0.07],
        ['A2',0.5,'slap_bass',0.10],['C3',0.25,'slap_bass',0.08],['E3',0.25,'slap_bass',0.08],
        ['F2',0.5,'slap_bass',0.10],['G2',0.5,'slap_bass',0.10],
        ['C3',1,'slap_bass',0.12]
      ],
      harm: [
        ['C4,E4,G4,C5',1,'ace_piano',0.04],['C4,E4,G4,C5',1,'ace_piano',0.03],
        ['G3,B3,D4,G4',1,'ace_piano',0.04],['G3,B3,D4,G4',1,'ace_piano',0.03],
        ['A3,C4,E4,A4',1,'ace_piano',0.04],['F3,A3,C4,F4',1,'ace_piano',0.04],
        ['G3,B3,D4,G4',1,'ace_piano',0.04],['C4,E4,G4,C5',1,'ace_piano',0.05]
      ],
      pad: [['C3,E3,G3',4,'pad',0.02],['G2,B2,D3',2,'pad',0.015],['C3,E3,G3,C4',2,'pad',0.02]],
      perc: [
        ['kick',0.5,'perc',0.08],['hh',0.25,'perc',0.03],['snare',0.25,'perc',0.06],
        ['hh',0.25,'perc',0.02],['kick',0.25,'perc',0.06],['cowbell',0.5,'perc',0.04],
        ['hh',0.25,'perc',0.02],['snare',0.25,'perc',0.06]
      ]
    },
    breakthrough: {
      tempo: 160, timeSig: [4,4],
      melody: [
        ['E5',0.125,'ace_brass',0.10],['G5',0.125,'ace_brass',0.10],['C6',0.25,'ace_brass',0.14],
        ['B5',0.125,'ace_brass',0.10],['G5',0.125,'ace_brass',0.08],['E5',0.25,'ace_brass',0.10],
        ['A5',0.125,'ace_brass',0.10],['G5',0.125,'ace_brass',0.08],['E5',0.125,'ace_brass',0.08],['C5',0.125,'ace_brass',0.08],
        ['D5',0.125,'ace_brass',0.10],['E5',0.125,'ace_brass',0.10],['G5',0.25,'ace_brass',0.12],
        ['C6',0.25,'ace_brass',0.14],['B5',0.125,'ace_brass',0.10],['A5',0.125,'ace_brass',0.08],['G5',0.5,'ace_brass',0.10]
      ],
      counter: [
        ['C5',0.25,'ace_trumpet',0.07],['E5',0.25,'ace_trumpet',0.07],
        ['G4',0.25,'ace_trumpet',0.06],['C5',0.25,'ace_trumpet',0.07]
      ],
      arp: { pattern: 'updown', voice: 'jazz_guitar', vol: 0.05 },
      bass: [
        ['C2',0.25,'slap_bass',0.10],['G2',0.25,'slap_bass',0.07],['C3',0.25,'slap_bass',0.07],['G2',0.25,'slap_bass',0.07],
        ['F2',0.25,'slap_bass',0.08],['C3',0.25,'slap_bass',0.07],['F2',0.25,'slap_bass',0.07],['C3',0.25,'slap_bass',0.07]
      ],
      harm: [
        ['C4,E4,G4',0.5,'jazz_guitar',0.04],['G4,B4,D5',0.5,'jazz_guitar',0.04],
        ['A4,C5,E5',0.5,'jazz_guitar',0.04],['F4,A4,C5',0.5,'jazz_guitar',0.04]
      ],
      pad: [['C3,G3,E3',2,'suspense_pad',0.03],['F3,C4,A3',2,'suspense_pad',0.03]],
      perc: [
        ['kick',0.25,'perc',0.08],['hh',0.125,'perc',0.02],['snare',0.125,'perc',0.06],
        ['kick',0.125,'perc',0.06],['hh',0.125,'perc',0.02],['snare',0.25,'perc',0.06],
        ['hh',0.125,'perc',0.02],['kick',0.125,'perc',0.06],['cowbell',0.25,'perc',0.04],
        ['hh',0.125,'perc',0.02],['snare',0.25,'perc',0.06],['crash',0.5,'perc',0.06]
      ]
    },
    finishing: {
      tempo: 144, timeSig: [4,4],
      melody: [
        ['C5',0.375,'ace_brass',0.14],['E5',0.125,'ace_brass',0.12],['G5',0.25,'ace_brass',0.14],['C6',0.75,'ace_brass',0.20],
        ['E6',0.25,'bell',0.18],['G6',0.25,'bell',0.16],['C7',1.5,'bell',0.24],
        ['B6',0.25,'harp',0.12],['G6',0.25,'harp',0.10],['E6',0.25,'music_box',0.12],['C6',0.25,'music_box',0.10],
        ['C5',0.5,'ace_brass',0.16],['G5',0.5,'ace_brass',0.14],['C6',2,'ace_brass',0.22]
      ],
      counter: [
        ['G4',0.5,'horn',0.07],['C5',0.5,'horn',0.07],
        ['E5',0.5,'horn',0.08],['G5',0.5,'horn',0.09],
        ['C5',1,'horn',0.08]
      ],
      arp: { pattern: 'up', voice: 'harp', vol: 0.04 },
      bass: [
        ['C2',2,'slap_bass',0.12],['G2',2,'slap_bass',0.10],
        ['F2',1,'slap_bass',0.09],['G2',1,'slap_bass',0.09],
        ['C2',2,'slap_bass',0.14],['C2',2,'slap_bass',0.16]
      ],
      harm: [
        ['C5,E5,G5,C6',4,'strings_sus',0.05],
        ['F5,A5,C6,F6',2,'strings_sus',0.04],['G5,B5,D6,G6',2,'strings_sus',0.04],
        ['C5,E5,G5,C6,E6',6,'choir',0.07]
      ],
      pad: [['C4,E4,G4,C5',8,'choir',0.03]],
      perc: [
        ['timpani',1,'perc',0.08],['cymbal',1,'perc',0.06],
        ['timpani',0.5,'perc',0.06],['timpani',0.5,'perc',0.06],['cymbal',2,'perc',0.05]
      ]
    }
  };

  // 第2章：寻问/调查 - D小调，紧张悬疑
  const CH2 = {
    opening: {
      tempo: 120, timeSig: [4,4],
      melody: [
        ['D5',0.25,'ace_piano',0.10],['F5',0.25,'ace_piano',0.10],['A5',0.5,'ace_piano',0.12],
        ['G5',0.25,'ace_piano',0.10],['F5',0.25,'ace_piano',0.08],['D5',0.5,'ace_piano',0.10],
        ['C5',0.25,'ace_piano',0.08],['D5',0.25,'ace_piano',0.10],['F5',0.5,'ace_piano',0.12],
        ['E5',0.25,'ace_piano',0.10],['D5',0.25,'ace_piano',0.08],['Bb4',0.5,'ace_piano',0.08],
        ['A4',0.25,'ace_piano',0.10],['D5',0.25,'ace_piano',0.10],['F5',0.5,'ace_piano',0.12],
        ['A5',0.25,'ace_piano',0.10],['D5',0.75,'ace_piano',0.10]
      ],
      counter: [
        ['A4',0.5,'cello',0.06],['F4',0.5,'cello',0.06],
        ['D4',0.5,'cello',0.05],['Bb3',0.5,'cello',0.05]
      ],
      arp: { pattern: 'updown', voice: 'pluck', vol: 0.04 },
      bass: [
        ['D2',0.5,'slap_bass',0.10],['A2',0.25,'slap_bass',0.07],['D3',0.25,'slap_bass',0.07],
        ['Bb2',0.5,'slap_bass',0.08],['D3',0.25,'slap_bass',0.06],['Bb2',0.25,'slap_bass',0.06],
        ['G2',0.5,'slap_bass',0.08],['D2',0.25,'slap_bass',0.07],['A2',0.25,'slap_bass',0.07],
        ['A2',0.5,'slap_bass',0.08],['D2',0.5,'slap_bass',0.10]
      ],
      harm: [
        ['D4,F4,A4',1,'ace_piano',0.035],['D4,F4,A4',1,'ace_piano',0.03],
        ['Bb3,D4,F4',1,'ace_piano',0.03],['A3,C4,E4',1,'ace_piano',0.03],
        ['G3,Bb3,D4',1,'ace_piano',0.03],['D4,F4,A4',1,'ace_piano',0.035],
        ['A3,C4,E4',1,'ace_piano',0.03],['D4,F4,A4',1,'ace_piano',0.04]
      ],
      pad: [['D3,A3,D4',2,'suspense_pad',0.03],['Bb2,F3,Bb3',2,'suspense_pad',0.03]],
      perc: [
        ['rim',0.5,'perc',0.05],['hh',0.25,'perc',0.02],['rim',0.25,'perc',0.04],
        ['hh',0.25,'perc',0.02],['rim',0.25,'perc',0.04],['kick',0.5,'perc',0.06],
        ['hh',0.25,'perc',0.02],['rim',0.25,'perc',0.04]
      ]
    },
    breakthrough: {
      tempo: 168, timeSig: [4,4],
      melody: [
        ['D5',0.125,'ace_brass',0.10],['F5',0.125,'ace_brass',0.10],['A5',0.125,'ace_brass',0.12],['D6',0.125,'ace_brass',0.14],
        ['C6',0.125,'ace_brass',0.12],['A5',0.125,'ace_brass',0.10],['F5',0.25,'ace_brass',0.10],
        ['Bb5',0.125,'ace_brass',0.10],['A5',0.125,'ace_brass',0.08],['G5',0.125,'ace_brass',0.08],['F5',0.125,'ace_brass',0.08],
        ['E5',0.125,'ace_brass',0.10],['F5',0.125,'ace_brass',0.10],['A5',0.25,'ace_brass',0.12],
        ['D6',0.25,'ace_brass',0.14],['A5',0.25,'ace_brass',0.10],['D5',0.5,'ace_brass',0.10]
      ],
      counter: [
        ['A4',0.25,'ace_trumpet',0.06],['F4',0.25,'ace_trumpet',0.06],
        ['D4',0.25,'ace_trumpet',0.05],['A3',0.25,'ace_trumpet',0.06]
      ],
      arp: { pattern: 'updown', voice: 'jazz_guitar', vol: 0.04 },
      bass: [['D2',0.25,'slap_bass',0.09],['A2',0.25,'slap_bass',0.06],['Bb2',0.25,'slap_bass',0.06],['A2',0.25,'slap_bass',0.07]],
      harm: [
        ['D4,A4',0.5,'jazz_guitar',0.03],['F4,C5',0.5,'jazz_guitar',0.03],
        ['Bb4,F5',0.5,'jazz_guitar',0.03],['A4,E5',0.5,'jazz_guitar',0.03]
      ],
      pad: [['D3,A3,D4,F4',4,'suspense_pad',0.04]],
      perc: [
        ['kick',0.25,'perc',0.08],['hh',0.125,'perc',0.02],['snare',0.125,'perc',0.06],
        ['hh',0.125,'perc',0.02],['kick',0.125,'perc',0.06],['cowbell',0.25,'perc',0.04],
        ['hh',0.125,'perc',0.02],['snare',0.25,'perc',0.06]
      ]
    },
    finishing: {
      tempo: 138, timeSig: [4,4],
      melody: [
        ['D5',0.5,'ace_brass',0.14],['F5',0.25,'ace_brass',0.12],['A5',0.25,'ace_brass',0.14],
        ['D6',1,'ace_brass',0.20],['F6',0.5,'bell',0.16],['D6',0.5,'harp',0.12],
        ['D5',1,'bell',0.18],['A5',0.5,'bell',0.14],['D5',0.5,'harp',0.10],
        ['D6',2,'ace_brass',0.22]
      ],
      counter: [
        ['A4',1,'horn',0.06],['F4',1,'horn',0.06],
        ['D4',2,'horn',0.07],['A4',2,'horn',0.08],
        ['D5',2,'horn',0.09]
      ],
      arp: { pattern: 'up', voice: 'harp', vol: 0.04 },
      bass: [
        ['D2',3,'slap_bass',0.10],['A2',1,'slap_bass',0.07],
        ['Bb2',2,'slap_bass',0.07],['D2',2,'slap_bass',0.11]
      ],
      harm: [
        ['D5,F5,A5',4,'strings_sus',0.05],
        ['A5,C6,E6',2,'strings_sus',0.04],['D5,F5,A5',2,'strings_sus',0.05],
        ['D5,F5,A5,D6',6,'choir',0.06]
      ],
      pad: [['D4,A4,D5,F5',8,'choir',0.03]],
      perc: [['timpani',2,'perc',0.07],['cymbal',2,'perc',0.05]]
    }
  };

  // 第3章：悬疑/对峙 - E小调（阿岩主题）
  const CH3 = {
    opening: {
      tempo: 100, timeSig: [4,4],
      melody: [
        ['E5',0.5,'organ',0.08],['B4',0.5,'organ',0.08],['E5',0.5,'organ',0.10],['G5',0.5,'organ',0.08],
        ['F#5',0.5,'organ',0.08],['E5',0.5,'organ',0.08],['D5',0.5,'organ',0.06],['B4',0.5,'organ',0.08],
        ['C5',0.5,'organ',0.06],['D5',0.5,'organ',0.08],['E5',0.5,'organ',0.10],['G5',0.5,'organ',0.08],
        ['A5',0.5,'organ',0.08],['G5',0.5,'organ',0.08],['F#5',0.5,'organ',0.06],['E5',0.5,'organ',0.08],
        ['B4',1,'organ',0.10],['E5',1,'organ',0.10]
      ],
      counter: [
        ['B3',0.5,'cello',0.05],['G3',0.5,'cello',0.05],['E3',0.5,'cello',0.04],['B3',0.5,'cello',0.05]
      ],
      arp: null,
      bass: [
        ['E2',2,'slap_bass',0.08],['B2',2,'slap_bass',0.06],
        ['E2',2,'slap_bass',0.08],['G2',2,'slap_bass',0.06],
        ['A2',2,'slap_bass',0.06],['E2',2,'slap_bass',0.08]
      ],
      harm: null,
      pad: [
        ['E2,B2,E3',4,'suspense_pad',0.05],
        ['E2,G2,B2',2,'suspense_pad',0.04],['A2,E3,A3',2,'suspense_pad',0.04]
      ],
      perc: [['tick',1,'perc',0.02],['rim',1,'perc',0.03],['tick',1,'perc',0.02],['rim',1,'perc',0.03]]
    },
    breakthrough: {
      tempo: 176, timeSig: [4,4],
      melody: [
        ['E5',0.0625,'ace_brass',0.08],['G5',0.0625,'ace_brass',0.08],['B5',0.125,'ace_brass',0.12],
        ['A5',0.0625,'ace_brass',0.10],['G5',0.0625,'ace_brass',0.08],['E5',0.125,'ace_brass',0.10],
        ['B5',0.0625,'ace_brass',0.10],['A5',0.0625,'ace_brass',0.08],['G5',0.0625,'ace_brass',0.08],['E5',0.0625,'ace_brass',0.08],
        ['F#5',0.125,'ace_brass',0.10],['G5',0.125,'ace_brass',0.10],['E5',0.5,'ace_brass',0.10]
      ],
      counter: [
        ['B4',0.125,'ace_trumpet',0.06],['G4',0.125,'ace_trumpet',0.05],
        ['E4',0.125,'ace_trumpet',0.05],['B3',0.125,'ace_trumpet',0.05]
      ],
      arp: { pattern: 'updown', voice: 'jazz_guitar', vol: 0.05 },
      bass: [['E2',0.125,'slap_bass',0.08],['B2',0.125,'slap_bass',0.05],['G2',0.125,'slap_bass',0.05],['B2',0.125,'slap_bass',0.05]],
      harm: [['E4,B4',0.25,'jazz_guitar',0.03],['G4,D5',0.25,'jazz_guitar',0.03]],
      pad: [['E2,B2,E3,G3',4,'dark_pad',0.05]],
      perc: [
        ['kick',0.25,'perc',0.07],['hh',0.125,'perc',0.02],['snare',0.125,'perc',0.05],
        ['kick',0.125,'perc',0.05],['hh',0.125,'perc',0.02],['kick',0.125,'perc',0.05],['snare',0.25,'perc',0.05]
      ]
    },
    finishing: {
      tempo: 120, timeSig: [4,4],
      melody: [
        ['E5',1,'ace_brass',0.14],['G5',0.5,'ace_brass',0.12],['B5',0.5,'ace_brass',0.14],
        ['E6',2,'bell',0.20],['B5',1,'bell',0.14],['G5',1,'harp',0.10],
        ['E5',4,'ace_brass',0.16]
      ],
      counter: [
        ['G4',2,'horn',0.06],['B4',2,'horn',0.06],['E4',2,'horn',0.05],['E5',2,'horn',0.07]
      ],
      arp: { pattern: 'up', voice: 'harp', vol: 0.03 },
      bass: [['E2',4,'slap_bass',0.10],['B2',4,'slap_bass',0.07]],
      harm: [['E5,G5,B5',8,'strings_sus',0.05]],
      pad: [['E4,G4,B4,E5',8,'choir',0.03]],
      perc: [['timpani',4,'perc',0.07]]
    }
  };

  // 第4章：逻辑/推理 - G大调，冷静理性
  const CH4 = {
    opening: {
      tempo: 124, timeSig: [4,4],
      melody: [
        ['G4',0.5,'ace_piano',0.10],['B4',0.25,'ace_piano',0.10],['D5',0.25,'ace_piano',0.12],
        ['B4',0.25,'ace_piano',0.10],['G4',0.25,'ace_piano',0.08],['D4',0.5,'ace_piano',0.10],
        ['E4',0.25,'ace_piano',0.08],['G4',0.25,'ace_piano',0.10],['C5',0.25,'ace_piano',0.10],['D5',0.25,'ace_piano',0.10],
        ['B4',0.25,'ace_piano',0.10],['G4',0.25,'ace_piano',0.08],['D4',0.5,'ace_piano',0.10],
        ['G4',0.25,'ace_piano',0.10],['B4',0.25,'ace_piano',0.10],['D5',0.5,'ace_piano',0.14],
        ['G5',0.25,'ace_piano',0.10],['D5',0.25,'ace_piano',0.08],['B4',0.25,'ace_piano',0.08],['G4',0.25,'ace_piano',0.10]
      ],
      counter: [
        ['D4',0.5,'cello',0.06],['B3',0.5,'cello',0.06],['G3',0.5,'cello',0.05],['D3',0.5,'cello',0.05]
      ],
      arp: { pattern: 'jazz', voice: 'jazz_guitar', vol: 0.04 },
      bass: [
        ['G2',0.5,'slap_bass',0.10],['D3',0.25,'slap_bass',0.07],['G3',0.25,'slap_bass',0.07],
        ['C2',0.5,'slap_bass',0.08],['G2',0.25,'slap_bass',0.06],['E3',0.25,'slap_bass',0.06],
        ['D2',0.5,'slap_bass',0.08],['G2',0.25,'slap_bass',0.07],['B2',0.25,'slap_bass',0.07],
        ['G2',0.5,'slap_bass',0.10],['D2',0.5,'slap_bass',0.08]
      ],
      harm: [
        ['G4,B4,D5',1,'ace_piano',0.035],['D4,F#4,A4',1,'ace_piano',0.03],
        ['C4,E4,G4',1,'ace_piano',0.03],['D4,F#4,A4',1,'ace_piano',0.03],
        ['E4,G4,B4',1,'ace_piano',0.03],['C4,E4,G4',1,'ace_piano',0.03],
        ['D4,F#4,A4',1,'ace_piano',0.03],['G4,B4,D5',1,'ace_piano',0.04]
      ],
      pad: [['G3,B3,D4',2,'pad',0.02],['D3,F#3,A3',2,'pad',0.02]],
      perc: [
        ['kick',0.5,'perc',0.07],['hh',0.25,'perc',0.02],['snare',0.25,'perc',0.05],
        ['hh',0.25,'perc',0.02],['rim',0.25,'perc',0.03],['kick',0.5,'perc',0.06],
        ['hh',0.25,'perc',0.02],['snare',0.25,'perc',0.05]
      ]
    },
    breakthrough: {
      tempo: 160, timeSig: [4,4],
      melody: [
        ['G5',0.125,'ace_brass',0.10],['B5',0.125,'ace_brass',0.10],['D6',0.25,'ace_brass',0.14],
        ['C6',0.125,'ace_brass',0.10],['A5',0.125,'ace_brass',0.08],['G5',0.25,'ace_brass',0.10],
        ['E5',0.125,'ace_brass',0.10],['G5',0.125,'ace_brass',0.10],['C6',0.125,'ace_brass',0.12],['D6',0.125,'ace_brass',0.12],
        ['B5',0.125,'ace_brass',0.10],['D6',0.125,'ace_brass',0.10],['G5',0.5,'ace_brass',0.10]
      ],
      counter: [
        ['D5',0.25,'ace_trumpet',0.06],['B4',0.25,'ace_trumpet',0.06],
        ['G4',0.25,'ace_trumpet',0.05],['D4',0.25,'ace_trumpet',0.06]
      ],
      arp: { pattern: 'updown', voice: 'jazz_guitar', vol: 0.04 },
      bass: [
        ['G2',0.25,'slap_bass',0.09],['D3',0.25,'slap_bass',0.06],
        ['C2',0.25,'slap_bass',0.07],['G2',0.25,'slap_bass',0.08]
      ],
      harm: [
        ['G4,D5',0.5,'jazz_guitar',0.03],['C5,G5',0.5,'jazz_guitar',0.03],
        ['D5,A5',0.5,'jazz_guitar',0.03],['G4,D5',0.5,'jazz_guitar',0.03]
      ],
      pad: [['G3,D4,G4,B4',4,'suspense_pad',0.04]],
      perc: [
        ['kick',0.25,'perc',0.07],['hh',0.125,'perc',0.02],['snare',0.125,'perc',0.05],
        ['kick',0.125,'perc',0.05],['hh',0.125,'perc',0.02],['kick',0.125,'perc',0.05],['cowbell',0.25,'perc',0.04],
        ['hh',0.125,'perc',0.02],['snare',0.25,'perc',0.05]
      ]
    },
    finishing: {
      tempo: 132, timeSig: [4,4],
      melody: [
        ['G5',0.5,'ace_brass',0.14],['B5',0.25,'ace_brass',0.12],['D6',0.25,'ace_brass',0.16],
        ['G6',1,'bell',0.22],['D6',0.5,'bell',0.14],['B5',0.5,'harp',0.10],
        ['G5',0.5,'ace_brass',0.14],['B5',0.5,'ace_brass',0.14],['D6',1,'ace_brass',0.18],
        ['G6',2,'ace_brass',0.24]
      ],
      counter: [
        ['B4',1,'horn',0.06],['G4',1,'horn',0.06],['D4',1,'horn',0.05],['G4',1,'horn',0.07],
        ['B4',2,'horn',0.07],['D5',2,'horn',0.08]
      ],
      arp: { pattern: 'up', voice: 'harp', vol: 0.04 },
      bass: [
        ['G2',3,'slap_bass',0.10],['D3',1,'slap_bass',0.07],
        ['C2',2,'slap_bass',0.07],['G2',2,'slap_bass',0.10],
        ['D2',2,'slap_bass',0.07],['G2',4,'slap_bass',0.13]
      ],
      harm: [
        ['G5,B5,D6',4,'strings_sus',0.05],
        ['C6,E6,G6',2,'strings_sus',0.04],['D6,F#6,A6',2,'strings_sus',0.04],
        ['G5,B5,D6,G6',6,'choir',0.06]
      ],
      pad: [['G4,B4,D5,G5',8,'choir',0.03]],
      perc: [['timpani',2,'perc',0.07],['cymbal',2,'perc',0.05]]
    }
  };

  // 第5章：关键证据/紧迫 - A小调（星辰梭）
  const CH5 = {
    opening: {
      tempo: 140, timeSig: [4,4],
      melody: [
        ['A4',0.25,'synth_lead',0.08],['C5',0.25,'synth_lead',0.08],['E5',0.25,'synth_lead',0.10],['A5',0.25,'synth_lead',0.12],
        ['G5',0.25,'synth_lead',0.10],['E5',0.25,'synth_lead',0.08],['C5',0.25,'synth_lead',0.08],['A4',0.25,'synth_lead',0.08],
        ['B4',0.25,'synth_lead',0.08],['E5',0.25,'synth_lead',0.10],['G5',0.25,'synth_lead',0.10],['E5',0.25,'synth_lead',0.08],
        ['A5',0.25,'synth_lead',0.12],['G5',0.25,'synth_lead',0.08],['E5',0.25,'synth_lead',0.08],['A4',0.25,'synth_lead',0.10]
      ],
      counter: [
        ['E4',0.25,'pluck',0.05],['A4',0.25,'pluck',0.05],['C5',0.25,'pluck',0.06],['E5',0.25,'pluck',0.06]
      ],
      arp: { pattern: 'updown', voice: 'pluck', vol: 0.04 },
      bass: [
        ['A2',0.5,'slap_bass',0.08],['E3',0.25,'slap_bass',0.06],['A3',0.25,'slap_bass',0.06],
        ['F2',0.5,'slap_bass',0.07],['C3',0.25,'slap_bass',0.06],['F3',0.25,'slap_bass',0.06],
        ['G2',0.5,'slap_bass',0.07],['D3',0.25,'slap_bass',0.06],['G3',0.25,'slap_bass',0.06],
        ['E2',0.5,'slap_bass',0.07],['A2',0.5,'slap_bass',0.08]
      ],
      harm: null,
      pad: [
        ['A2,E3,A3,C4',4,'suspense_pad',0.035],
        ['F2,C3,F3,A3',2,'suspense_pad',0.03],['E2,B2,E3,G#3',2,'suspense_pad',0.03]
      ],
      perc: [
        ['kick',0.5,'perc',0.07],['hh',0.25,'perc',0.02],['snare',0.25,'perc',0.05],
        ['hh',0.25,'perc',0.02],['kick',0.25,'perc',0.05],['rim',0.25,'perc',0.03],
        ['hh',0.25,'perc',0.02],['snare',0.25,'perc',0.05]
      ]
    },
    breakthrough: {
      tempo: 184, timeSig: [4,4],
      melody: [
        ['E5',0.0625,'ace_brass',0.08],['A5',0.0625,'ace_brass',0.09],['C6',0.0625,'ace_brass',0.10],['E6',0.0625,'ace_brass',0.12],
        ['D6',0.0625,'ace_brass',0.10],['C6',0.0625,'ace_brass',0.08],['B5',0.125,'ace_brass',0.08],['A5',0.125,'ace_brass',0.08],
        ['G5',0.0625,'ace_brass',0.07],['A5',0.0625,'ace_brass',0.08],['C6',0.0625,'ace_brass',0.10],['E6',0.0625,'ace_brass',0.10],
        ['A5',0.125,'ace_brass',0.08],['E5',0.125,'ace_brass',0.08]
      ],
      counter: [
        ['C5',0.125,'ace_trumpet',0.05],['A4',0.125,'ace_trumpet',0.05],
        ['E4',0.125,'ace_trumpet',0.05],['A3',0.125,'ace_trumpet',0.05]
      ],
      arp: { pattern: 'updown', voice: 'jazz_guitar', vol: 0.05 },
      bass: [['A2',0.125,'slap_bass',0.07],['E3',0.125,'slap_bass',0.05]],
      harm: [['E4,A4',0.25,'jazz_guitar',0.025],['C5,E5',0.25,'jazz_guitar',0.025]],
      pad: [['A2,E3,A3,C4',4,'dark_pad',0.05]],
      perc: [
        ['kick',0.125,'perc',0.07],['hh',0.0625,'perc',0.015],['kick',0.0625,'perc',0.05],
        ['snare',0.125,'perc',0.05],['hh',0.0625,'perc',0.015],['kick',0.0625,'perc',0.05],
        ['hh',0.0625,'perc',0.015],['cowbell',0.125,'perc',0.03]
      ]
    },
    finishing: {
      tempo: 126, timeSig: [4,4],
      melody: [
        ['A5',1,'ace_brass',0.14],['C6',0.5,'ace_brass',0.12],['E6',0.5,'ace_brass',0.14],
        ['A6',2,'bell',0.20],['E6',1,'bell',0.14],['C6',1,'harp',0.10],
        ['A5',4,'ace_brass',0.16]
      ],
      counter: [
        ['E5',2,'horn',0.06],['C5',2,'horn',0.06],['A4',4,'horn',0.07]
      ],
      arp: { pattern: 'up', voice: 'music_box', vol: 0.03 },
      bass: [['A2',4,'slap_bass',0.09],['E3',4,'slap_bass',0.07]],
      harm: [['A5,C6,E6',8,'strings_sus',0.05]],
      pad: [['A4,C5,E5,A5',8,'choir',0.03]],
      perc: [['cymbal',4,'perc',0.05]]
    }
  };

  // 第6章：Boss/设局人 - F小调，黑暗压迫
  const CH6 = {
    opening: {
      tempo: 88, timeSig: [4,4],
      melody: [
        ['F4',1,'organ',0.08],['Ab4',1,'organ',0.08],['C5',1,'organ',0.10],['Db5',1,'organ',0.10],
        ['C5',1,'organ',0.08],['Ab4',1,'organ',0.08],['F4',2,'organ',0.10],
        ['Eb4',0.5,'organ',0.06],['F4',0.5,'organ',0.06],['Ab4',1,'organ',0.08],['C5',1,'organ',0.10],
        ['Db5',1,'organ',0.08],['C5',1,'organ',0.08],['F4',2,'organ',0.12]
      ],
      counter: [
        ['C4',2,'cello',0.05],['Ab3',2,'cello',0.05],
        ['F3',2,'cello',0.04],['Db3',2,'cello',0.05]
      ],
      arp: null,
      bass: [
        ['F2',3,'bass',0.07],['Db3',1,'bass',0.05],
        ['C2',2,'bass',0.05],['F2',2,'bass',0.07],
        ['Ab2',2,'bass',0.05],['Db3',2,'bass',0.05],
        ['C2',2,'bass',0.05],['F2',2,'bass',0.07]
      ],
      harm: null,
      pad: [
        ['F2,Db3,F3,Ab3',4,'suspense_pad',0.06],
        ['C2,Ab2,C3,Eb3',2,'suspense_pad',0.05],['F2,C3,F4,Ab3',2,'suspense_pad',0.05],
        ['Ab2,Eb3,Ab3,C4',2,'suspense_pad',0.05],['Db3,Ab3,Db4,F4',2,'suspense_pad',0.05],
        ['F2,C3,F3,Ab3',4,'suspense_pad',0.06]
      ],
      perc: [['timpani',2,'perc',0.06],['tick',2,'perc',0.015]]
    },
    breakthrough: {
      tempo: 172, timeSig: [4,4],
      melody: [
        ['F5',0.0625,'ace_brass',0.08],['Ab5',0.0625,'ace_brass',0.08],['C6',0.125,'ace_brass',0.12],
        ['Db6',0.0625,'ace_brass',0.10],['C6',0.0625,'ace_brass',0.10],['Ab5',0.125,'ace_brass',0.08],
        ['Eb5',0.0625,'ace_brass',0.08],['F5',0.0625,'ace_brass',0.08],['Ab5',0.125,'ace_brass',0.10],
        ['C6',0.0625,'ace_brass',0.12],['Db6',0.125,'ace_brass',0.12],['C6',0.125,'ace_brass',0.08],
        ['F5',0.5,'ace_brass',0.10]
      ],
      counter: [
        ['Ab4',0.125,'ace_trumpet',0.05],['F4',0.125,'ace_trumpet',0.05],
        ['Db4',0.125,'ace_trumpet',0.05],['F3',0.125,'ace_trumpet',0.05]
      ],
      arp: { pattern: 'updown', voice: 'jazz_guitar', vol: 0.04 },
      bass: [['F2',0.125,'bass',0.07],['Db3',0.125,'bass',0.05]],
      harm: [['F4,Db5',0.25,'jazz_guitar',0.025],['Ab4,Eb5',0.25,'jazz_guitar',0.025]],
      pad: [['F2,Db3,F3,Ab3',4,'dark_pad',0.06]],
      perc: [
        ['kick',0.25,'perc',0.07],['hh',0.125,'perc',0.02],['snare',0.125,'perc',0.05],
        ['kick',0.125,'perc',0.05],['timpani',0.125,'perc',0.05],['crash',0.5,'perc',0.05]
      ]
    },
    finishing: {
      tempo: 108, timeSig: [4,4],
      melody: [
        ['F5',2,'ace_brass',0.14],['Db5',1,'harp',0.10],['C5',1,'music_box',0.10],
        ['F5',2,'bell',0.16],['Ab5',2,'bell',0.14],['F5',2,'bell',0.14],
        ['F4',4,'ace_piano',0.16]
      ],
      counter: [
        ['Db5',2,'horn',0.05],['C5',2,'horn',0.05],['Ab4',2,'horn',0.05],['F4',2,'horn',0.06]
      ],
      arp: { pattern: 'up', voice: 'harp', vol: 0.03 },
      bass: [['F2',4,'bass',0.09],['Db3',4,'bass',0.06]],
      harm: [['F5,Ab5,C6',8,'strings_sus',0.05]],
      pad: [['F4,Ab4,C5,F5',8,'choir',0.03]],
      perc: [['timpani',4,'perc',0.06]]
    }
  };

  // 第7章：真相/最终 - C大调，辉煌壮丽
  const CH7 = {
    opening: {
      tempo: 148, timeSig: [4,4],
      melody: [
        ['C5',0.5,'ace_brass',0.14],['E5',0.25,'ace_brass',0.12],['G5',0.25,'ace_brass',0.14],
        ['C6',0.5,'ace_brass',0.18],['B5',0.25,'ace_brass',0.12],['G5',0.25,'ace_brass',0.10],
        ['E5',0.25,'ace_brass',0.10],['G5',0.25,'ace_brass',0.12],['C6',0.5,'ace_brass',0.16],
        ['E6',0.25,'ace_brass',0.14],['D6',0.25,'ace_brass',0.12],['C6',0.25,'ace_brass',0.10],['G5',0.25,'ace_brass',0.10],
        ['F5',0.25,'ace_brass',0.12],['A5',0.25,'ace_brass',0.12],['C6',0.5,'ace_brass',0.16],['E6',0.5,'ace_brass',0.18],
        ['G6',0.5,'ace_brass',0.20],['C6',0.5,'ace_brass',0.14]
      ],
      counter: [
        ['G4',0.5,'ace_trumpet',0.08],['C5',0.5,'ace_trumpet',0.08],
        ['E5',0.5,'ace_trumpet',0.09],['G5',0.5,'ace_trumpet',0.10],
        ['C5',0.5,'horn',0.07],['E5',0.5,'horn',0.07],['G5',1,'horn',0.08]
      ],
      arp: { pattern: 'jazz', voice: 'jazz_guitar', vol: 0.04 },
      bass: [
        ['C2',0.5,'slap_bass',0.11],['G2',0.25,'slap_bass',0.08],['C3',0.25,'slap_bass',0.08],
        ['F2',0.5,'slap_bass',0.09],['C3',0.25,'slap_bass',0.07],['F3',0.25,'slap_bass',0.07],
        ['G2',0.5,'slap_bass',0.10],['D3',0.25,'slap_bass',0.07],['G3',0.25,'slap_bass',0.07],
        ['C2',0.25,'slap_bass',0.09],['E2',0.25,'slap_bass',0.07],['G2',0.25,'slap_bass',0.08],['C3',0.25,'slap_bass',0.10]
      ],
      harm: [
        ['C5,E5,G5,C6',1,'ace_piano',0.05],['C5,E5,G5,C6',1,'ace_piano',0.04],
        ['F5,A5,C6,F6',1,'ace_piano',0.04],['G5,B5,D6,G6',1,'ace_piano',0.04],
        ['A5,C6,E6,A6',1,'ace_piano',0.04],['F5,A5,C6,F6',1,'ace_piano',0.04],
        ['G5,B5,D6,G6',1,'ace_piano',0.04],['C5,E5,G5,C6',1,'ace_piano',0.06]
      ],
      pad: [
        ['C3,G3,C4,E4',4,'pad',0.025],
        ['F3,C4,F4,A4',4,'pad',0.02]
      ],
      perc: [
        ['kick',0.25,'perc',0.08],['hh',0.125,'perc',0.02],['snare',0.125,'perc',0.06],
        ['hh',0.125,'perc',0.02],['kick',0.125,'perc',0.06],['crash',0.5,'perc',0.06],
        ['hh',0.125,'perc',0.02],['snare',0.25,'perc',0.06],['cowbell',0.25,'perc',0.04]
      ]
    },
    breakthrough: {
      tempo: 168, timeSig: [4,4],
      melody: [
        ['C6',0.125,'ace_brass',0.12],['E6',0.125,'ace_brass',0.12],['G6',0.125,'ace_brass',0.14],['C7',0.25,'ace_brass',0.18],
        ['B6',0.125,'ace_brass',0.12],['G6',0.125,'ace_brass',0.10],['E6',0.125,'ace_brass',0.12],['C6',0.125,'ace_brass',0.12],
        ['D6',0.125,'ace_brass',0.12],['F6',0.125,'ace_brass',0.12],['A6',0.125,'ace_brass',0.14],['C7',0.125,'ace_brass',0.16],
        ['B6',0.0625,'ace_brass',0.10],['G6',0.0625,'ace_brass',0.08],['E6',0.0625,'ace_brass',0.10],['C6',0.0625,'ace_brass',0.12],
        ['G6',0.5,'ace_brass',0.14],['C7',0.5,'ace_brass',0.20]
      ],
      counter: [
        ['G5',0.25,'ace_trumpet',0.07],['E5',0.25,'ace_trumpet',0.07],
        ['C5',0.25,'horn',0.06],['G4',0.25,'horn',0.06]
      ],
      arp: { pattern: 'updown', voice: 'jazz_guitar', vol: 0.05 },
      bass: [
        ['C2',0.25,'slap_bass',0.10],['G2',0.25,'slap_bass',0.07],
        ['F2',0.25,'slap_bass',0.08],['C2',0.25,'slap_bass',0.10]
      ],
      harm: [
        ['C5,G5',0.5,'jazz_guitar',0.04],['F5,C6',0.5,'jazz_guitar',0.04],
        ['G5,D6',0.5,'jazz_guitar',0.04],['C5,E5,G5,C6',0.5,'ace_brass',0.06]
      ],
      pad: [['C3,G3,C4,E4',4,'suspense_pad',0.04]],
      perc: [
        ['kick',0.125,'perc',0.08],['hh',0.0625,'perc',0.02],['kick',0.0625,'perc',0.06],
        ['snare',0.125,'perc',0.06],['tom',0.125,'perc',0.05],['hh',0.0625,'perc',0.02],
        ['kick',0.0625,'perc',0.06],['crash',0.25,'perc',0.06],['cowbell',0.125,'perc',0.04]
      ]
    },
    finishing: {
      tempo: 144, timeSig: [4,4],
      melody: [
        ['C5',0.25,'ace_brass',0.16],['E5',0.25,'ace_brass',0.16],['G5',0.25,'ace_brass',0.18],['C6',0.5,'bell',0.24],
        ['E6',0.25,'bell',0.20],['G6',0.25,'bell',0.20],['C7',1.5,'bell',0.30],
        ['G5',0.25,'harp',0.12],['E5',0.25,'harp',0.12],['C5',0.25,'music_box',0.12],['G4',0.25,'music_box',0.10],
        ['C5',0.5,'ace_brass',0.18],['E5',0.5,'ace_brass',0.18],['G5',0.5,'ace_brass',0.20],
        ['C6',4,'ace_brass',0.30]
      ],
      counter: [
        ['E5',0.5,'horn',0.08],['G5',0.5,'horn',0.08],['C6',0.5,'horn',0.09],['E6',0.5,'horn',0.10],
        ['G6',1,'horn',0.10],['C6',1,'horn',0.09]
      ],
      arp: { pattern: 'up', voice: 'harp', vol: 0.04 },
      bass: [
        ['C2',4,'slap_bass',0.14],['G2',2,'slap_bass',0.10],
        ['F2',2,'slap_bass',0.10],['E2',2,'slap_bass',0.08],
        ['G2',2,'slap_bass',0.10],['C2',4,'slap_bass',0.18]
      ],
      harm: [
        ['C5,E5,G5,C6',4,'strings_sus',0.07],
        ['F5,A5,C6,F6',2,'strings_sus',0.06],['G5,B5,D6,G6',2,'strings_sus',0.06],
        ['C5,E5,G5,C6,E6,G6',8,'choir',0.10]
      ],
      pad: [['C4,E4,G4,C5,E5,G5',8,'choir',0.05]],
      perc: [
        ['timpani',1,'perc',0.09],['crash',1,'perc',0.07],
        ['timpani',0.5,'perc',0.07],['crash',0.5,'perc',0.05],
        ['timpani',2,'perc',0.08],['cymbal',6,'perc',0.06]
      ]
    }
  };

  const CHAPTERS = { 1: CH1, 2: CH2, 3: CH3, 4: CH4, 5: CH5, 6: CH6, 7: CH7 };

  // 特殊BGM
  const SPECIAL = {
    boss_battle: {
      tempo: 180, timeSig: [4,4], loop: true,
      melody: [
        ['E5',0.0625,'ace_brass',0.08],['F#5',0.0625,'ace_brass',0.08],['G5',0.0625,'ace_brass',0.10],['B5',0.0625,'ace_brass',0.10],
        ['A5',0.0625,'ace_brass',0.10],['G5',0.0625,'ace_brass',0.08],['F#5',0.125,'ace_brass',0.08],['E5',0.125,'ace_brass',0.08],
        ['B5',0.0625,'ace_brass',0.10],['A5',0.0625,'ace_brass',0.08],['G5',0.0625,'ace_brass',0.08],['E5',0.0625,'ace_brass',0.08],
        ['F#5',0.0625,'ace_brass',0.08],['G5',0.0625,'ace_brass',0.08],['B5',0.125,'ace_brass',0.10],['E5',0.125,'ace_brass',0.08]
      ],
      counter: [
        ['B4',0.125,'ace_trumpet',0.06],['G4',0.125,'ace_trumpet',0.05],
        ['E4',0.125,'ace_trumpet',0.05],['B3',0.125,'ace_trumpet',0.05]
      ],
      arp: { pattern: 'updown', voice: 'jazz_guitar', vol: 0.05 },
      bass: [['E2',0.125,'slap_bass',0.08],['B2',0.125,'slap_bass',0.06]],
      harm: null,
      pad: [['E2,B2,E3,G3',2,'dark_pad',0.06]],
      perc: [
        ['kick',0.125,'perc',0.08],['hh',0.0625,'perc',0.02],['kick',0.0625,'perc',0.06],
        ['snare',0.125,'perc',0.06],['hh',0.0625,'perc',0.02],['kick',0.0625,'perc',0.05],
        ['cowbell',0.125,'perc',0.04]
      ]
    },
    breakthrough_fanfare: {  // "异议！"号角
      tempo: 160, timeSig: [4,4], oneShot: true,
      melody: [
        ['C5',0.0625,'ace_brass',0.10],['D5',0.0625,'ace_brass',0.10],['E5',0.0625,'ace_brass',0.12],['G5',0.0625,'ace_brass',0.12],
        ['C6',0.375,'ace_brass',0.22],
        ['B5',0.125,'ace_brass',0.12],['G5',0.125,'ace_brass',0.10],['E5',0.25,'ace_brass',0.14],
        ['G5',0.125,'ace_trumpet',0.12],['C6',0.125,'ace_trumpet',0.14],['E6',0.5,'ace_brass',0.24],
        ['C5',0.5,'ace_brass',0.16]
      ],
      counter: [
        ['G4',0.25,'ace_trumpet',0.08],['C5',0.25,'ace_trumpet',0.08],
        ['E5',0.5,'horn',0.10]
      ],
      arp: null,
      bass: [
        ['C3',0.125,'slap_bass',0.10],['G3',0.125,'slap_bass',0.08],
        ['C3',0.125,'slap_bass',0.10],['E3',0.125,'slap_bass',0.08],
        ['C3',1,'slap_bass',0.14]
      ],
      harm: [['C5,E5,G5',1,'ace_brass',0.08],['C5,E5,G5,C6',1,'ace_brass',0.10]],
      pad: null,
      perc: [
        ['crash',0.25,'perc',0.08],['timpani',0.25,'perc',0.08],
        ['crash',0.5,'perc',0.07]
      ]
    },
    victory: {  // 胜利！
      tempo: 138, timeSig: [4,4], oneShot: true,
      melody: [
        ['C5',0.25,'ace_brass',0.16],['E5',0.125,'ace_brass',0.14],['G5',0.125,'ace_brass',0.16],['C6',0.5,'ace_brass',0.22],
        ['E6',0.25,'bell',0.20],['G6',0.25,'bell',0.20],['C7',1.5,'bell',0.28],
        ['B6',0.25,'harp',0.14],['G6',0.25,'harp',0.12],['E6',0.25,'music_box',0.14],['C6',0.25,'music_box',0.12],
        ['G5',0.25,'harp',0.12],['C5',0.25,'harp',0.10],['C5',1.5,'ace_brass',0.20]
      ],
      counter: [
        ['E5',0.5,'horn',0.08],['G5',0.5,'horn',0.08],
        ['C6',1,'horn',0.10],['G5',0.5,'horn',0.08],['C5',0.5,'horn',0.08],
        ['C5',1,'horn',0.10]
      ],
      arp: { pattern: 'up', voice: 'harp', vol: 0.04 },
      bass: [
        ['C3',2,'slap_bass',0.13],['G3',2,'slap_bass',0.10],
        ['F3',1,'slap_bass',0.10],['G3',1,'slap_bass',0.10],
        ['C2',2,'slap_bass',0.15]
      ],
      harm: [
        ['C5,E5,G5',2,'strings_sus',0.07],
        ['F5,A5,C6',1,'strings_sus',0.06],['G5,B5,D6',1,'strings_sus',0.06],
        ['C5,E5,G5,C6',4,'choir',0.10]
      ],
      pad: [['C4,E4,G4,C5',8,'choir',0.04]],
      perc: [
        ['timpani',0.5,'perc',0.10],['crash',0.5,'perc',0.08],
        ['timpani',0.25,'perc',0.08],['crash',0.75,'perc',0.07]
      ]
    }
  };

  // 角色主题
  const THEMES = {
    cagekeeper: {  // 守笼人 - 温暖稳重
      tempo: 124, oneShot: true,
      melody: [
        ['C4',0.5,'ace_piano',0.12],['E4',0.5,'ace_piano',0.12],['G4',0.5,'ace_piano',0.12],['C5',1,'ace_piano',0.16],
        ['B4',0.5,'ace_piano',0.10],['A4',0.5,'ace_piano',0.10],['G4',0.5,'ace_piano',0.12],['E4',0.5,'ace_piano',0.10],
        ['F4',0.5,'ace_piano',0.10],['A4',0.5,'ace_piano',0.12],['C5',0.5,'ace_piano',0.14],['C4',1,'ace_piano',0.12]
      ],
      counter: [
        ['G3',1,'cello',0.05],['E3',1,'cello',0.05],['C3',2,'cello',0.05]
      ],
      arp: { pattern: 'jazz', voice: 'pluck', vol: 0.03 },
      bass: [['C2',3,'slap_bass',0.10],['G2',1,'slap_bass',0.07],['F2',2,'slap_bass',0.07],['C2',2,'slap_bass',0.10]],
      harm: [
        ['C4,E4,G4',4,'strings_sus',0.03],
        ['F4,A4,C5',2,'strings_sus',0.025],['G4,B4,D5',2,'strings_sus',0.025]
      ],
      pad: [['C3,E3,G3',8,'pad',0.02]],
      perc: null
    },
    ray: {  // 阿岩 - 活泼敏捷
      tempo: 144, oneShot: true,
      melody: [
        ['E4',0.125,'pluck',0.08],['G4',0.125,'pluck',0.08],['B4',0.25,'pluck',0.10],['E5',0.25,'pluck',0.12],
        ['D5',0.25,'pluck',0.10],['B4',0.25,'pluck',0.08],['G4',0.25,'pluck',0.08],['E4',0.5,'pluck',0.10],
        ['B4',0.125,'pluck',0.08],['E5',0.125,'pluck',0.10],['B5',0.75,'pluck',0.14]
      ],
      counter: [
        ['G3',0.25,'pizzicato',0.04],['B3',0.25,'pizzicato',0.04],['E4',0.5,'pizzicato',0.05]
      ],
      arp: { pattern: 'up', voice: 'pluck', vol: 0.03 },
      bass: [['E2',1,'slap_bass',0.08],['B2',1,'slap_bass',0.06],['E2',2,'slap_bass',0.09]],
      harm: [['E4,G4,B4',2,'pluck',0.03],['B4,D5,F#5',2,'pluck',0.025]],
      pad: [['E3,B3,E4',4,'pad',0.02]],
      perc: [['hh',0.5,'perc',0.02]]
    },
    plotter: {  // 设局人 - 阴险深沉
      tempo: 80, oneShot: true,
      melody: [
        ['F4',2,'organ',0.07],['Ab4',2,'organ',0.07],['C5',3,'organ',0.09],
        ['Db5',1,'organ',0.07],['C5',2,'organ',0.07],['F4',4,'organ',0.09]
      ],
      counter: [
        ['C4',2,'cello',0.04],['Ab3',2,'cello',0.04],['F3',4,'cello',0.04]
      ],
      arp: null,
      bass: [['F2',4,'bass',0.06],['Db3',4,'bass',0.05]],
      harm: null,
      pad: [['F2,Db3,F3,Ab3',8,'suspense_pad',0.04]],
      perc: [['timpani',4,'perc',0.04]]
    },
    weaver: {  // 星辰梭 - 空灵科技
      tempo: 132, oneShot: true,
      melody: [
        ['A4',0.25,'synth_lead',0.08],['C5',0.25,'synth_lead',0.08],['E5',0.25,'synth_lead',0.10],['A5',1,'synth_lead',0.14],
        ['G5',0.25,'synth_lead',0.09],['E5',0.25,'synth_lead',0.08],['C5',0.25,'synth_lead',0.08],['A4',1,'synth_lead',0.10]
      ],
      counter: [
        ['E4',0.5,'sine',0.04],['A3',0.5,'sine',0.04],['E4',1,'sine',0.04]
      ],
      arp: { pattern: 'octave', voice: 'music_box', vol: 0.02 },
      bass: [['A2',3,'bass',0.07],['E3',3,'bass',0.05],['A2',2,'bass',0.07]],
      harm: [['A4,C5,E5',4,'pad',0.03],['E4,G4,B4',2,'pad',0.02],['A4,C5,E5,A5',2,'pad',0.03]],
      pad: [['A2,E3,A3,C4',8,'pad',0.03]],
      perc: null
    }
  };

  function _getData() {
    if (_themeMode && _themeData) return _themeData;
    if (SPECIAL[currentChapter]) return SPECIAL[currentChapter];
    const ch = CHAPTERS[currentChapter];
    if (!ch) return CHAPTERS[1].opening;
    return ch[currentPhase] || ch.opening;
  }

  function _scheduler() {
    if (!isPlaying || !ctx) return;
    const now = ctx.currentTime;
    _updateCrossfade(now);
    while (_getEarliestNextTime() < now + _scheduleAhead) {
      _scheduleTrack('melody');
      _scheduleTrack('counter');
      _scheduleTrack('arp');
      _scheduleTrack('bass');
      _scheduleTrack('harm');
      _scheduleTrack('pad');
      _scheduleTrack('perc');
    }
    _schedulerTimer = setTimeout(_scheduler, _lookahead);
  }

  function _getEarliestNextTime() {
    let min = Infinity;
    Object.values(_tracks).forEach(t => { if (t.nextTime < min) min = t.nextTime; });
    return min;
  }

  function _scheduleTrack(trackName) {
    const data = _getData();
    const track = _tracks[trackName];
    const dest = track.panner || track.gain;
    let notes = data[trackName];

    if (trackName === 'arp' && notes && typeof notes === 'object' && !Array.isArray(notes)) {
      _scheduleArp(data, track, dest);
      return;
    }

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      track.nextTime = ctx.currentTime + 0.5;
      return;
    }

    const tempo = _currentTempo || data.tempo || 100;
    const spb = 60.0 / tempo;
    const t = track.nextTime;
    const idx = track.idx % notes.length;
    const [note, beats, voice, vol] = notes[idx];
    const actualVoice = _instrumentOverride || voice;
    const dur = Math.max(0.05, beats * spb * 0.94);

    if (trackName === 'perc') {
      _playPerc(note, t, (vol||0.1) * _expression, dest);
    } else if (trackName === 'harm') {
      _playChordNotes(note, t, dur, actualVoice, (vol||0.03) * _expression, dest);
    } else {
      const f = noteToFreq(note);
      if (f > 0) _playVoice(f, t, dur, actualVoice, (vol||0.1) * _expression, dest);
    }

    track.nextTime = t + beats * spb;
    track.idx++;

    if (trackName === 'melody' && track.idx >= notes.length) _barCount++;

    if (track.idx >= notes.length) {
      track.idx = 0;
      if (data.oneShot && trackName === 'melody') {
        const totalMelodyBeats = notes.reduce((s, n) => s + n[1], 0);
        const totalMs = totalMelodyBeats * spb * 1000 + 800;
        setTimeout(() => {
          if (_themeMode) {
            _themeMode = false; _themeData = null; _resetAllTracks();
            if (_oneShotCallback) { const cb = _oneShotCallback; _oneShotCallback = null; cb(); }
          } else if (data.oneShot) { stop(); }
        }, totalMs);
      }
    }
  }

  function _scheduleArp(data, track, dest) {
    const arpConfig = data.arp;
    const harmNotes = data.harm;
    if (!arpConfig || !harmNotes) { track.nextTime = ctx.currentTime + 0.5; return; }
    const tempo = _currentTempo || data.tempo || 100;
    const spb = 60.0 / tempo;
    const t = track.nextTime;
    const arpBeatDur = 0.25;
    // find current harm chord
    let cumTime = 0;
    let chordStr = harmNotes[0][0];
    for (let i = 0; i < harmNotes.length; i++) {
      const cb = harmNotes[i][1] * spb;
      if (cumTime + cb > (t - track.nextTime) + 0.001) { chordStr = harmNotes[i][0]; break; }
      cumTime += cb;
    }
    const arpNotes = _getArpPattern(arpConfig.pattern || 'up', chordStr, 0.5, tempo);
    if (arpNotes.length > 0) {
      const subIdx = track.idx % arpNotes.length;
      _playVoice(arpNotes[subIdx].freq, t, arpNotes[subIdx].dur * 0.7, arpConfig.voice || 'pluck',
                 (arpConfig.vol||0.04) * _expression, dest);
    }
    track.nextTime = t + arpBeatDur * spb;
    track.idx++;
  }

  function _resetAllTracks() {
    const now = ctx ? ctx.currentTime + 0.05 : 0;
    Object.values(_tracks).forEach(t => { t.nextTime = now; t.idx = 0; });
    _barCount = 0;
  }

  function _updateCrossfade(now) {
    if (!_pendingPhase) return;
    const elapsed = now - _crossfadeStart;
    if (elapsed >= _crossfadeDuration) {
      _pendingPhase = null;
      _expression = 1.0;
      return;
    }
    const progress = elapsed / _crossfadeDuration;
    _expression = 0.7 + 0.6 * Math.sin(progress * Math.PI);
  }

  function load(chapterId) {
    currentChapter = chapterId; currentPhase = 'opening';
    _themeMode = false; _themeData = null;
    _instrumentOverride = null; _transpose = 0; _expression = 1.0;
    _resetAllTracks();
  }

  function play() {
    if (!_createContext()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (isPlaying) return;
    isPlaying = true;
    _currentTempo = _getData().tempo || 100;
    _expression = 1.0;
    _resetAllTracks();
    _scheduler();
  }

  function stop() {
    isPlaying = false; _themeMode = false; _themeData = null; _pendingPhase = null; _expression = 1.0;
    if (_schedulerTimer) { clearTimeout(_schedulerTimer); _schedulerTimer = null; }
    if (ctx && masterGain) {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0, now + 0.4);
      setTimeout(() => { if (masterGain) masterGain.gain.setValueAtTime(_volume, ctx ? ctx.currentTime : 0); }, 450);
    }
  }

  function setPhase(phase) {
    if (phase === currentPhase) return;
    const wasPhase = currentPhase;
    currentPhase = phase; _pendingPhase = phase;
    _crossfadeStart = ctx ? ctx.currentTime : 0;
    _currentTempo = _getData().tempo || 100;

    // "异议！" 效果 - 突破阶段开头的快速音阶
    if (phase === 'breakthrough' && wasPhase === 'opening') {
      setTimeout(() => {
        if (ctx) {
          const t0 = ctx.currentTime;
          // 逆转裁判标志性的上行半音阶
          [523,587,659,784,1047].forEach((f, i) => {
            _playVoice(f, t0 + i * 0.05, 0.3, 'ace_brass', 0.2, _tracks.melody.panner || _tracks.melody.gain);
          });
        }
      }, 50);
    }

    if (phase === 'finishing') {
      setTimeout(() => { playSpecial('victory'); }, 600);
    }

    setTimeout(() => { if (currentPhase === phase) _resetAllTracks(); }, 200);
  }

  function setVariation(type) { setPhase(type); }

  function setVolume(v) {
    _volume = Math.max(0, Math.min(0.7, v));
    if (masterGain) {
      const now = ctx ? ctx.currentTime : 0;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.linearRampToValueAtTime(_volume, now + 0.2);
    }
  }

  function setTempo(bpm) { _currentTempo = bpm; }
  function setTranspose(semitones) { _transpose = semitones; }
  function setInstrument(instr) { _instrumentOverride = instr; }

  function playTheme(charId, callback) {
    const theme = THEMES[charId]; if (!theme) return;
    _themeMode = true; _themeData = theme; _oneShotCallback = callback||null;
    _instrumentOverride = null; _transpose = 0; _expression = 1.0; _resetAllTracks();
    if (!isPlaying) {
      if (!_createContext()) return;
      if (ctx.state === 'suspended') ctx.resume();
      isPlaying = true; _currentTempo = theme.tempo || 100; _scheduler();
    }
  }

  function playSpecial(name, callback) {
    const special = SPECIAL[name]; if (!special) return;
    currentChapter = name; _themeMode = false; _themeData = null;
    _oneShotCallback = callback||null; _instrumentOverride = null; _transpose = 0; _expression = 1.0;
    _currentTempo = special.tempo || 100; _resetAllTracks();
    if (!isPlaying) {
      if (!_createContext()) return;
      if (ctx.state === 'suspended') ctx.resume();
      isPlaying = true; _scheduler();
    }
  }

  function playChapter(ch) { load(ch); play(); }

  function pause() { if (isPlaying) { isPlaying = false; if (_schedulerTimer) { clearTimeout(_schedulerTimer); _schedulerTimer = null; } } }
  function resume() { if (!isPlaying && ctx) { isPlaying = true; _scheduler(); } }

  return {
    load, play, stop, pause, resume,
    setPhase, setVariation, setVolume, setTempo, setTranspose, setInstrument,
    playTheme, playSpecial, playChapter,
    get isPlaying() { return isPlaying; },
    get phase() { return currentPhase; },
    get chapter() { return currentChapter; },
    get volume() { return _volume; },
    _data: { CHAPTERS, SPECIAL, THEMES }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MidiBGM;
} else {
  window.MidiBGM = MidiBGM;
}
