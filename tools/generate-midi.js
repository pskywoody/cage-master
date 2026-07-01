// ==========================================
// MIDI File Generator
// 将音乐数据转换为标准MIDI格式（Format 1, 多轨）
// 输出到 game-src/assets/audio/midi/
// ==========================================

const fs = require('fs');
const path = require('path');

// ---- 音符名到MIDI音符号的映射 ----
const NOTE_SEMIS = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };

function noteNameToMidi(note) {
  if (typeof note === 'number') return note;
  if (note === 'R') return -1;
  const m = note.match(/^([A-G][#b]?)(-?\d)$/);
  if (!m) return -1;
  const semi = NOTE_SEMIS[m[1]];
  const oct = parseInt(m[2]);
  return (oct + 1) * 12 + semi;
}

// 音色到GM Program Number的映射
const VOICE_TO_GM = {
  piano: 0, grand_piano: 0, ace_piano: 0,
  strings: 48, strings_sus: 48, cello: 42,
  pad: 89, dark_pad: 90, suspense_pad: 90, choir: 52, organ: 19,
  bell: 14, music_box: 10, harp: 46,
  pluck: 24, pizzicato: 45, jazz_guitar: 26,
  lead: 80, synth_lead: 80, ace_brass: 56, ace_trumpet: 56, brass: 60, horn: 61,
  bass: 32, finger_bass: 33, slap_bass: 36,
  flute: 73, oboe: 68, clarinet: 71,
  sine: 73
};

// ---- MIDI写入器 ----
class MIDIWriter {
  constructor(ticksPerBeat = 480) {
    this.ticksPerBeat = ticksPerBeat;
    this.tracks = [];
  }

  addTrack() {
    const track = { events: [] };
    this.tracks.push(track);
    return track;
  }

  // 添加一个事件到轨道
  addEvent(track, tick, type, data) {
    track.events.push({ tick, type, data });
  }

  // 便捷方法：noteOn/noteOff
  noteOn(track, tick, channel, note, velocity) {
    this.addEvent(track, tick, 'noteOn', { channel, note, velocity });
  }
  noteOff(track, tick, channel, note) {
    this.addEvent(track, tick, 'noteOff', { channel, note });
  }
  programChange(track, tick, channel, program) {
    this.addEvent(track, tick, 'program', { channel, program });
  }
  tempoChange(track, tick, bpm) {
    const microsecondsPerBeat = Math.round(60000000 / bpm);
    const data = [
      (microsecondsPerBeat >> 16) & 0xFF,
      (microsecondsPerBeat >> 8) & 0xFF,
      microsecondsPerBeat & 0xFF
    ];
    this.addEvent(track, tick, 'meta', { metaType: 0x51, data });
  }
  endOfTrack(track, tick) {
    this.addEvent(track, tick, 'meta', { metaType: 0x2F, data: [] });
  }

  // 编码可变长度数值
  _encodeVarLen(value) {
    const bytes = [];
    bytes.push(value & 0x7F);
    value >>= 7;
    while (value > 0) {
      bytes.push((value & 0x7F) | 0x80);
      value >>= 7;
    }
    return Buffer.from(bytes.reverse());
  }

  // 编码一个MIDI事件
  _encodeEvent(prevTick, ev) {
    const delta = ev.tick - prevTick;
    const deltaBuf = this._encodeVarLen(delta);
    let eventBuf;

    switch(ev.type) {
      case 'noteOn':
        eventBuf = Buffer.from([
          0x90 | (ev.data.channel & 0x0F),
          ev.data.note & 0x7F,
          ev.data.velocity & 0x7F
        ]);
        break;
      case 'noteOff':
        eventBuf = Buffer.from([
          0x80 | (ev.data.channel & 0x0F),
          ev.data.note & 0x7F,
          0
        ]);
        break;
      case 'program':
        eventBuf = Buffer.from([
          0xC0 | (ev.data.channel & 0x0F),
          ev.data.program & 0x7F
        ]);
        break;
      case 'meta': {
        const metaData = Buffer.from(ev.data.data);
        const lenBuf = this._encodeVarLen(metaData.length);
        eventBuf = Buffer.concat([
          Buffer.from([0xFF, ev.data.metaType]),
          lenBuf,
          metaData
        ]);
        break;
      }
      default:
        eventBuf = Buffer.alloc(0);
    }
    return Buffer.concat([deltaBuf, eventBuf]);
  }

  // 构建整个MIDI文件二进制
  build() {
    // 排序每个轨道的事件
    this.tracks.forEach(t => {
      t.events.sort((a, b) => a.tick - b.tick);
    });

    const chunks = [];

    // Header chunk: MThd
    const headerData = Buffer.alloc(6);
    headerData.writeUInt16BE(1, 0);  // Format 1 (multi-track)
    headerData.writeUInt16BE(this.tracks.length, 2);
    headerData.writeUInt16BE(this.ticksPerBeat, 4);
    chunks.push(Buffer.from('MThd'));
    chunks.push(this._uint32BE(6));
    chunks.push(headerData);

    // Track chunks
    this.tracks.forEach(track => {
      // 确保每个轨道都有End of Track
      const lastTick = track.events.length > 0 ? track.events[track.events.length - 1].tick : 0;
      const hasEOT = track.events.some(e => e.type === 'meta' && e.data.metaType === 0x2F);
      if (!hasEOT) {
        this.endOfTrack(track, lastTick + this.ticksPerBeat);
        track.events.sort((a, b) => a.tick - b.tick);
      }

      // 编码事件
      const eventBufs = [];
      let prevTick = 0;
      track.events.forEach(ev => {
        eventBufs.push(this._encodeEvent(prevTick, ev));
        prevTick = ev.tick;
      });
      const trackData = Buffer.concat(eventBufs);

      chunks.push(Buffer.from('MTrk'));
      chunks.push(this._uint32BE(trackData.length));
      chunks.push(trackData);
    });

    return Buffer.concat(chunks);
  }

  _uint32BE(val) {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(val, 0);
    return b;
  }
}

// ---- 将一段音乐数据转换为MIDI轨道 ----
function musicToMIDI(musicData, filename) {
  const midi = new MIDIWriter(480);
  const tpb = midi.ticksPerBeat;
  const tempo = musicData.tempo || 100;

  // 轨道0: tempo track
  const tempoTrack = midi.addTrack();
  midi.tempoChange(tempoTrack, 0, tempo);
  midi.endOfTrack(tempoTrack, tpb * 4);

  // 通道分配
  const CH_MELODY = 0;
  const CH_COUNTER = 1;
  const CH_BASS = 2;
  const CH_HARM = 3;
  const CH_PAD = 4;

  // Helper: write a melodic track
  function writeMelodicTrack(trackData, channel, loopMult) {
    if (!trackData || !Array.isArray(trackData) || trackData.length === 0) return null;
    const tr = midi.addTrack();
    const firstVoice = trackData[0][2];
    const gmProg = VOICE_TO_GM[firstVoice] || 0;
    midi.programChange(tr, 0, channel, gmProg);

    const totalBeats = trackData.reduce((s, n) => s + n[1], 0);
    const loopCount = musicData.oneShot ? 1 : (loopMult || 2);

    let tick = 0;
    for (let loop = 0; loop < loopCount; loop++) {
      trackData.forEach(([note, beats, voice, vol]) => {
        const midiNote = noteNameToMidi(note);
        const durTicks = Math.round(beats * tpb);
        if (midiNote >= 0) {
          const velocity = Math.min(127, Math.round(vol * 127 * 5));
          midi.noteOn(tr, tick, channel, midiNote, velocity);
          midi.noteOff(tr, tick + durTicks, channel, midiNote);
        }
        tick += durTicks;
      });
    }
    midi.endOfTrack(tr, tick + tpb);
    return tick;
  }

  // Helper: write a chord track
  function writeChordTrack(trackData, channel, loopMult) {
    if (!trackData || !Array.isArray(trackData) || trackData.length === 0) return null;
    const tr = midi.addTrack();
    const firstVoice = trackData[0][2];
    const gmProg = VOICE_TO_GM[firstVoice] || 48;
    midi.programChange(tr, 0, channel, gmProg);

    const totalBeats = trackData.reduce((s, n) => s + n[1], 0);
    const loopCount = musicData.oneShot ? 1 : (loopMult || 2);

    let tick = 0;
    for (let loop = 0; loop < loopCount; loop++) {
      trackData.forEach(([chord, beats, voice, vol]) => {
        const durTicks = Math.round(beats * tpb);
        const notes = chord.split(',');
        const velocity = Math.min(127, Math.round(vol * 127 * 8));
        notes.forEach(n => {
          const midiNote = noteNameToMidi(n.trim());
          if (midiNote >= 0) {
            midi.noteOn(tr, tick, channel, midiNote, velocity);
            midi.noteOff(tr, tick + durTicks, channel, midiNote);
          }
        });
        tick += durTicks;
      });
    }
    midi.endOfTrack(tr, tick + tpb);
    return tick;
  }

  // Melody
  writeMelodicTrack(musicData.melody, CH_MELODY, 2);
  // Counter melody
  writeMelodicTrack(musicData.counter, CH_COUNTER, 2);
  // Bass
  writeMelodicTrack(musicData.bass, CH_BASS, 2);
  // Harmony chords
  writeChordTrack(musicData.harm || musicData.chord, CH_HARM, 2);
  // Pad
  writeChordTrack(musicData.pad, CH_PAD, 2);

  return midi.build();
}

// ---- 音乐数据（与midi-bgm.js中的数据一致）----
// 注意：这里是简化版数据用于MIDI导出，完整数据在midi-bgm.js中使用
// 由于无法直接require浏览器端JS，这里独立定义数据
const NOTE_SEMITONES_LOCAL = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };

// 章节BGM（开局阶段）- 导出时使用opening阶段作为代表
const CHAPTERS_EXPORT = {
  1: { name: 'chapter_1', tempo: 72,
    melody: [
      ['C4',1,'piano',0.16],['E4',1,'piano',0.16],['G4',1,'piano',0.16],['C5',1,'piano',0.18],
      ['B4',0.5,'piano',0.14],['A4',0.5,'piano',0.14],['G4',1,'piano',0.16],['E4',1,'piano',0.14],
      ['F4',1,'piano',0.15],['A4',1,'piano',0.15],['C5',1,'piano',0.18],['A4',1,'piano',0.15],
      ['G4',0.5,'piano',0.14],['E4',0.5,'piano',0.14],['C4',2,'piano',0.16]
    ],
    bass: [
      ['C3',2,'bass',0.12],['E3',2,'bass',0.08],['F3',2,'bass',0.10],['G3',2,'bass',0.10],
      ['A3',2,'bass',0.08],['F3',2,'bass',0.08],['G3',2,'bass',0.10],['C3',2,'bass',0.12]
    ],
    chord: [
      ['C4,E4,G4',4,'strings',0.04],['F4,A4,C5',4,'strings',0.04],
      ['G4,B4,D5',2,'strings',0.03],['C5,E5,G5',2,'strings',0.04],
      ['F4,A4,C5',2,'strings',0.03],['G4,B4,D5',2,'strings',0.03],
      ['C4,E4,G4,C5',4,'strings',0.05]
    ],
    pad: [['C3,E3,G3',8,'pad',0.03]]
  },
  2: { name: 'chapter_2', tempo: 80,
    melody: [
      ['D4',1,'piano',0.14],['F4',1,'piano',0.14],['A4',1,'piano',0.12],['D5',1,'piano',0.15],
      ['C5',1,'piano',0.12],['A4',1,'piano',0.14],['F4',1,'piano',0.12],['D4',1,'piano',0.12],
      ['E4',1,'piano',0.10],['G4',1,'piano',0.12],['Bb4',1,'piano',0.12],['A4',1,'piano',0.12],
      ['G4',0.5,'piano',0.10],['F4',0.5,'piano',0.10],['D4',2,'piano',0.14]
    ],
    bass: [
      ['D3',2,'bass',0.10],['A3',2,'bass',0.08],['Bb3',2,'bass',0.08],['A3',2,'bass',0.10],
      ['G3',2,'bass',0.08],['D3',2,'bass',0.10],['A3',2,'bass',0.08],['D3',2,'bass',0.10]
    ],
    chord: [
      ['D4,F4,A4',4,'strings',0.03],['Bb4,D5,F5',2,'strings',0.03],['A4,C5,E5',2,'strings',0.03],
      ['G4,Bb4,D5',2,'strings',0.03],['D4,F4,A4',2,'strings',0.03],
      ['A4,C5,E5',2,'strings',0.03],['D4,F4,A4',2,'strings',0.04]
    ],
    pad: [['D3,A3',4,'pad',0.03],['Bb3,F4',2,'pad',0.03],['A3,E4',2,'pad',0.03]]
  },
  3: { name: 'chapter_3', tempo: 66,
    melody: [
      ['E4',2,'oboe',0.10],['G4',1,'oboe',0.08],['B4',1,'oboe',0.10],
      ['A4',1,'oboe',0.08],['G4',1,'oboe',0.08],['F#4',1,'oboe',0.08],['E4',1,'oboe',0.10],
      ['D4',1,'oboe',0.08],['E4',1,'oboe',0.08],['G4',2,'oboe',0.10],
      ['B4',1,'oboe',0.08],['A4',1,'oboe',0.08],['G4',2,'oboe',0.10]
    ],
    bass: [
      ['E2',3,'bass',0.08],['B2',1,'bass',0.06],['E2',2,'bass',0.08],['G2',2,'bass',0.06],
      ['A2',2,'bass',0.06],['E2',2,'bass',0.08]
    ],
    chord: null,
    pad: [['E2,B2',4,'dark_pad',0.05],['E2,G2',2,'dark_pad',0.04],['A2,E3',2,'dark_pad',0.04]]
  },
  4: { name: 'chapter_4', tempo: 68,
    melody: [
      ['G4',1,'flute',0.12],['B4',1,'flute',0.12],['D5',1,'flute',0.14],['B4',1,'flute',0.12],
      ['A4',1,'flute',0.12],['C5',1,'flute',0.12],['G4',2,'flute',0.14],
      ['E4',1,'piano',0.10],['G4',1,'piano',0.10],['C5',1,'piano',0.12],['D5',1,'piano',0.12],
      ['B4',0.5,'piano',0.10],['G4',0.5,'piano',0.10],['D4',2,'piano',0.12]
    ],
    bass: [
      ['G3',2,'bass',0.10],['D3',2,'bass',0.08],['C3',2,'bass',0.08],['G3',2,'bass',0.10],
      ['B3',2,'bass',0.06],['C3',2,'bass',0.08],['D3',2,'bass',0.08],['G3',2,'bass',0.10]
    ],
    chord: [
      ['G4,B4,D5',4,'strings',0.03],['C5,E5,G5',2,'strings',0.03],['D5,F#5,A5',2,'strings',0.03],
      ['E4,G4,B4',2,'strings',0.02],['C5,E5,G5',2,'strings',0.03],
      ['D5,F#5,A5',2,'strings',0.03],['G4,B4,D5',2,'strings',0.04]
    ],
    pad: [['G3,D4',4,'pad',0.03],['C4,E4',2,'pad',0.03],['D4,F#4',2,'pad',0.03]]
  },
  5: { name: 'chapter_5', tempo: 78,
    melody: [
      ['A4',1,'sine',0.10],['C5',1,'sine',0.10],['E5',1,'sine',0.12],['A5',1,'sine',0.14],
      ['G5',1,'sine',0.10],['E5',1,'sine',0.10],['C5',1,'sine',0.10],['A4',1,'sine',0.10],
      ['B4',1,'pad',0.08],['E5',1,'sine',0.10],['G5',1,'sine',0.10],['E5',1,'sine',0.10],
      ['C5',0.5,'sine',0.08],['A4',0.5,'sine',0.08],['A4',2,'sine',0.12]
    ],
    bass: [
      ['A2',2,'bass',0.08],['E3',2,'bass',0.06],['F3',2,'bass',0.06],['E3',2,'bass',0.08],
      ['D3',2,'bass',0.06],['A2',2,'bass',0.08]
    ],
    chord: null,
    pad: [
      ['A2,E3,A3',4,'pad',0.04],['F3,C4,F4',2,'pad',0.03],['E3,B3,E4',2,'pad',0.03],
      ['A2,E3,A3',4,'pad',0.04]
    ]
  },
  6: { name: 'chapter_6', tempo: 52,
    melody: [
      ['F4',2,'oboe',0.08],['Ab4',2,'oboe',0.08],['C5',2,'oboe',0.10],
      ['Db5',1,'oboe',0.08],['C5',2,'oboe',0.10],['Ab4',1,'oboe',0.08],
      ['F4',2,'oboe',0.08],['Eb4',1,'oboe',0.06],['F4',1,'oboe',0.06],
      ['Ab4',2,'oboe',0.08],['C5',2,'oboe',0.10],['F4',2,'oboe',0.10]
    ],
    bass: [
      ['F2',3,'bass',0.06],['Db3',1,'bass',0.06],['C3',2,'bass',0.06],['F2',2,'bass',0.08],
      ['Ab2',2,'bass',0.06],['Db3',2,'bass',0.06],['C3',2,'bass',0.06],['F2',2,'bass',0.08]
    ],
    chord: null,
    pad: [
      ['F2,Db3,F3',4,'dark_pad',0.05],['C3,Ab3,C4',2,'dark_pad',0.04],['F2,C4,F4',2,'dark_pad',0.04],
      ['Ab2,Eb3,Ab3',2,'dark_pad',0.04],['Db3,Ab3,Db4',2,'dark_pad',0.04],
      ['F2,C4,F4',4,'dark_pad',0.05]
    ]
  },
  7: { name: 'chapter_7', tempo: 88,
    melody: [
      ['C5',1,'brass',0.14],['E5',1,'brass',0.14],['G5',1,'brass',0.16],['C6',2,'brass',0.20],
      ['B5',1,'brass',0.14],['G5',1,'brass',0.14],['E5',1,'brass',0.12],['C5',1,'brass',0.14],
      ['F5',1,'strings',0.12],['A5',1,'strings',0.12],['C6',1,'brass',0.16],['E6',1,'brass',0.16],
      ['D6',0.5,'brass',0.12],['C6',0.5,'brass',0.12],['G5',1,'brass',0.14],['C5',2,'brass',0.16]
    ],
    bass: [
      ['C3',2,'bass',0.12],['G3',2,'bass',0.10],['F3',2,'bass',0.10],['G3',2,'bass',0.10],
      ['A3',2,'bass',0.08],['F3',2,'bass',0.10],['G3',2,'bass',0.10],['C3',2,'bass',0.14]
    ],
    chord: [
      ['C5,E5,G5',4,'strings',0.05],['F5,A5,C6',2,'strings',0.04],['G5,B5,D6',2,'strings',0.04],
      ['A5,C6,E6',2,'strings',0.04],['F5,A5,C6',2,'strings',0.04],
      ['G5,B5,D6',2,'strings',0.04],['C5,E5,G5,C6',2,'strings',0.06]
    ],
    pad: [
      ['C3,G3,C4,E4',4,'pad',0.04],['F3,C4,F4,A4',4,'pad',0.03],
      ['C3,G3,C4,E4,G4',4,'pad',0.04]
    ]
  }
};

// 特殊BGM
const SPECIAL_EXPORT = {
  boss_battle: { name: 'boss_battle', tempo: 160, loop: true,
    melody: [
      ['E4',0.25,'lead',0.08],['F#4',0.25,'lead',0.08],['G4',0.25,'lead',0.10],['B4',0.25,'lead',0.10],
      ['A4',0.25,'lead',0.10],['G4',0.25,'lead',0.08],['F#4',0.25,'lead',0.08],['E4',0.25,'lead',0.08],
      ['B4',0.25,'lead',0.10],['A4',0.25,'lead',0.10],['G4',0.25,'lead',0.08],['E4',0.25,'lead',0.08],
      ['F#4',0.25,'lead',0.08],['G4',0.25,'lead',0.08],['B4',0.5,'lead',0.10],['E4',0.5,'lead',0.08]
    ],
    bass: [['E2',0.5,'bass',0.08],['B2',0.5,'bass',0.06]],
    chord: null,
    pad: [['E2,B2,E3',2,'dark_pad',0.06]]
  },
  breakthrough: { name: 'breakthrough', tempo: 144, oneShot: true,
    melody: [
      ['C5',0.125,'lead',0.08],['D5',0.125,'lead',0.08],['E5',0.125,'lead',0.10],['G5',0.125,'lead',0.10],
      ['C6',0.5,'brass',0.18],['B5',0.25,'lead',0.08],['G5',0.25,'lead',0.08],['E5',0.5,'brass',0.12],
      ['G5',0.25,'lead',0.10],['C6',0.75,'brass',0.20]
    ],
    bass: [['C3',0.5,'bass',0.08],['G3',0.5,'bass',0.06],['C3',1,'bass',0.10]],
    chord: [['C5,E5,G5',2,'brass',0.06]],
    pad: null
  },
  victory: { name: 'victory', tempo: 120, oneShot: true,
    melody: [
      ['C5',0.5,'bell',0.20],['E5',0.5,'bell',0.20],['G5',0.5,'bell',0.20],['C6',1,'bell',0.28],
      ['E6',0.5,'bell',0.22],['G6',0.5,'bell',0.22],['C7',1.5,'bell',0.30],
      ['B5',0.5,'harp',0.16],['G5',0.5,'harp',0.16],['E5',0.5,'piano',0.16],['C5',1.5,'bell',0.22]
    ],
    bass: [
      ['C3',2,'bass',0.12],['G3',2,'bass',0.10],['F3',1,'bass',0.10],['G3',1,'bass',0.10],['C3',2,'bass',0.14]
    ],
    chord: [
      ['C5,E5,G5',2,'strings',0.06],['F5,A5,C6',1,'strings',0.05],['G5,B5,D6',1,'strings',0.05],
      ['C5,E5,G5,C6',4,'strings',0.08]
    ],
    pad: [['C4,E4,G4,C5',8,'pad',0.04]]
  }
};

// 角色主题
const THEMES_EXPORT = {
  cagekeeper: { name: 'theme_cagekeeper', tempo: 76, oneShot: true,
    melody: [
      ['C4',1,'piano',0.14],['E4',1,'piano',0.14],['G4',1,'piano',0.14],['C5',2,'piano',0.18],
      ['B4',0.5,'piano',0.12],['A4',0.5,'piano',0.12],['G4',1,'piano',0.14],['E4',1,'piano',0.12],['C4',2,'piano',0.14]
    ],
    bass: [['C3',4,'bass',0.10],['G3',2,'bass',0.08],['C3',2,'bass',0.10]],
    chord: [['C4,E4,G4',4,'strings',0.04],['F4,A4,C5',2,'strings',0.03],['G4,B4,D5',2,'strings',0.03]],
    pad: [['C3,E3,G3',8,'pad',0.03]]
  },
  ray: { name: 'theme_ray', tempo: 108, oneShot: true,
    melody: [
      ['E4',0.5,'pluck',0.10],['G4',0.5,'pluck',0.10],['B4',0.5,'pluck',0.12],['E5',0.5,'pluck',0.12],
      ['D5',0.5,'pluck',0.10],['B4',0.5,'pluck',0.10],['G4',0.5,'pluck',0.08],['E4',1,'pluck',0.10],
      ['B4',0.5,'lead',0.10],['E5',1.5,'pluck',0.14]
    ],
    bass: [['E3',1,'bass',0.08],['B3',1,'bass',0.06],['E3',2,'bass',0.08]],
    chord: [['E4,G4,B4',2,'pluck',0.04],['B4,D5,F#5',2,'pluck',0.03]],
    pad: null
  },
  plotter: { name: 'theme_plotter', tempo: 58, oneShot: true,
    melody: [
      ['F4',2,'oboe',0.08],['Ab4',2,'oboe',0.08],['C5',3,'oboe',0.10],
      ['Db5',1,'oboe',0.08],['C5',2,'oboe',0.08],['F4',4,'oboe',0.10]
    ],
    bass: [['F2',4,'bass',0.06],['Db3',4,'bass',0.06]],
    chord: null,
    pad: [['F2,Db3,F3',8,'dark_pad',0.04]]
  },
  weaver: { name: 'theme_weaver', tempo: 88, oneShot: true,
    melody: [
      ['A4',1,'sine',0.10],['C5',1,'sine',0.10],['E5',1,'sine',0.12],['A5',2,'sine',0.15],
      ['G5',0.5,'sine',0.10],['E5',0.5,'sine',0.10],['C5',1,'sine',0.10],['A4',2,'sine',0.12]
    ],
    bass: [['A2',3,'bass',0.06],['E3',3,'bass',0.05]],
    chord: [['A4,C5,E5',4,'pad',0.04],['E4,G4,B4',2,'pad',0.03]],
    pad: [['A2,E3,A3',6,'pad',0.03]]
  }
};

// ---- 主函数 ----
function main() {
  const outputDir = 'd:\\killersudoku\\game-src\\assets\\audio\\midi';
  
  // 确保目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let totalSize = 0;
  let fileCount = 0;

  // 生成7章BGM
  Object.values(CHAPTERS_EXPORT).forEach(ch => {
    const buf = musicToMIDI(ch, ch.name);
    const outPath = path.join(outputDir, `${ch.name}.mid`);
    fs.writeFileSync(outPath, buf);
    totalSize += buf.length;
    fileCount++;
    console.log(`  [CHAPTER] ${ch.name}.mid - ${buf.length} bytes (tempo=${ch.tempo})`);
  });

  // 生成特殊BGM
  Object.values(SPECIAL_EXPORT).forEach(sp => {
    const buf = musicToMIDI(sp, sp.name);
    const outPath = path.join(outputDir, `${sp.name}.mid`);
    fs.writeFileSync(outPath, buf);
    totalSize += buf.length;
    fileCount++;
    console.log(`  [SPECIAL] ${sp.name}.mid - ${buf.length} bytes (tempo=${sp.tempo})`);
  });

  // 生成角色主题
  Object.values(THEMES_EXPORT).forEach(th => {
    const buf = musicToMIDI(th, th.name);
    const outPath = path.join(outputDir, `${th.name}.mid`);
    fs.writeFileSync(outPath, buf);
    totalSize += buf.length;
    fileCount++;
    console.log(`  [THEME]   ${th.name}.mid - ${buf.length} bytes (tempo=${th.tempo})`);
  });

  console.log(`\nDone! Generated ${fileCount} MIDI files, total size: ${totalSize} bytes (${(totalSize/1024).toFixed(1)} KB)`);
  console.log(`Output directory: ${outputDir}`);
  
  if (totalSize < 100 * 1024) {
    console.log('✓ Package size < 100KB requirement PASSED');
  } else {
    console.log('✗ Package size exceeds 100KB target');
  }
}

main();
