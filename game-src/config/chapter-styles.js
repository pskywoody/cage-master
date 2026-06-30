// ==========================================
// 七章棋盘样式配置
// 每章传递不同的情绪关键词
// ==========================================

const CHAPTER_STYLES = {
  1: {
    name: '档案室·初入',
    mood: '温暖、木质、暖光',
    bg: '#faf3e8',
    gridLine: '#d4c5a9',
    thickLine: '#b8956a',
    border: '#8b6b4a',
    cageDash: '#a8896a',
    cageBadgeBg: '#22c55e',
    cageBadgeText: '#ffffff',
    fixedNum: '#4a3520',
    playerNum: '#c0392b',
    candidateNum: '#8b7a6a',
    errorNum: '#e74c3c',
    selectedCell: 'rgba(200,160,120,0.25)',
    sameNumGlow: 'rgba(200,180,150,0.2)',
    sameRowCol: 'rgba(200,180,160,0.1)',
    sameBox: 'rgba(200,180,160,0.12)',
    cageHighlight: 'rgba(200,180,160,0.08)',
    cageArea: 'rgba(200,180,160,0.08)',
    isDark: false,
    bgImage: 'assets/images/bg/bg_chapter_1.jpg'
  },
  2: {
    name: '档案室·深入',
    mood: '专注、规则、秩序',
    bg: '#ece8e0',
    gridLine: '#c0b8b0',
    thickLine: '#7a8a9a',
    border: '#4a5a6a',
    cageDash: '#8a9aaa',
    cageBadgeBg: '#3b82f6',
    cageBadgeText: '#ffffff',
    fixedNum: '#2c3e50',
    playerNum: '#2980b9',
    candidateNum: '#7f8c8d',
    errorNum: '#e74c3c',
    selectedCell: 'rgba(41,128,185,0.2)',
    sameNumGlow: 'rgba(52,152,219,0.15)',
    sameRowCol: 'rgba(100,130,160,0.08)',
    sameBox: 'rgba(100,130,160,0.1)',
    cageHighlight: 'rgba(100,130,160,0.06)',
    cageArea: 'rgba(100,130,160,0.06)',
    isDark: false,
    bgImage: 'assets/images/bg/bg_chapter_2.jpg'
  },
  3: {
    name: '密道·暗室',
    mood: '悬疑、紧张、转折',
    bg: '#3a3530',
    gridLine: '#5a5550',
    thickLine: '#7a6a5a',
    border: '#8a7a6a',
    cageDash: '#6a5a4a',
    cageBadgeBg: '#f59e0b',
    cageBadgeText: '#ffffff',
    fixedNum: '#d4ccc0',
    playerNum: '#e67e22',
    candidateNum: '#8a8078',
    errorNum: '#ef4444',
    selectedCell: 'rgba(230,126,34,0.25)',
    sameNumGlow: 'rgba(200,160,120,0.2)',
    sameRowCol: 'rgba(100,80,60,0.12)',
    sameBox: 'rgba(100,80,60,0.15)',
    cageHighlight: 'rgba(230,126,34,0.1)',
    cageArea: 'rgba(100,80,60,0.12)',
    isDark: true,
    bgImage: 'assets/images/bg/bg_chapter_3.jpg'
  },
  4: {
    name: '旧档案库',
    mood: '尘封、记忆、怀旧',
    bg: '#d4c8b0',
    gridLine: '#b8a890',
    thickLine: '#8a7a6a',
    border: '#6a5a4a',
    cageDash: '#9a8a7a',
    cageBadgeBg: '#d97706',
    cageBadgeText: '#fffbeb',
    fixedNum: '#4a3a2a',
    playerNum: '#8e44ad',
    candidateNum: '#7a6a5a',
    errorNum: '#c0392b',
    selectedCell: 'rgba(142,68,173,0.2)',
    sameNumGlow: 'rgba(180,150,130,0.15)',
    sameRowCol: 'rgba(160,140,120,0.08)',
    sameBox: 'rgba(160,140,120,0.1)',
    cageHighlight: 'rgba(217,119,6,0.1)',
    cageArea: 'rgba(160,140,120,0.07)',
    isDark: false,
    bgImage: 'assets/images/bg/bg_chapter_4.jpg'
  },
  5: {
    name: '星辰核心',
    mood: '高级、结构、冷峻',
    bg: '#0a0e1a',
    gridLine: '#1a2a4a',
    thickLine: '#3a5a8a',
    border: '#4a7aaa',
    cageDash: '#2a4a6a',
    cageBadgeBg: '#a855f7',
    cageBadgeText: '#ffffff',
    fixedNum: '#c0d0e0',
    playerNum: '#00d4ff',
    candidateNum: '#4a6a8a',
    errorNum: '#ff4444',
    selectedCell: 'rgba(0,212,255,0.25)',
    sameNumGlow: 'rgba(100,180,255,0.15)',
    sameRowCol: 'rgba(30,60,120,0.1)',
    sameBox: 'rgba(30,60,120,0.12)',
    cageHighlight: 'rgba(168,85,247,0.12)',
    cageArea: 'rgba(30,60,120,0.1)',
    isDark: true,
    bgImage: 'assets/images/bg/bg_chapter_5.jpg'
  },
  6: {
    name: '设局人书房',
    mood: '压迫、终结、对峙',
    bg: '#1a1510',
    gridLine: '#3a3028',
    thickLine: '#6a4a3a',
    border: '#8a3a2a',
    cageDash: '#5a3a2a',
    cageBadgeBg: '#ef4444',
    cageBadgeText: '#ffffff',
    fixedNum: '#d4c8b8',
    playerNum: '#e74c3c',
    candidateNum: '#6a5a4a',
    errorNum: '#ff0000',
    selectedCell: 'rgba(231,76,60,0.2)',
    sameNumGlow: 'rgba(200,100,80,0.15)',
    sameRowCol: 'rgba(100,60,40,0.1)',
    sameBox: 'rgba(100,60,40,0.12)',
    cageHighlight: 'rgba(239,68,68,0.1)',
    cageArea: 'rgba(100,60,40,0.12)',
    isDark: true,
    bgImage: 'assets/images/bg/bg_chapter_6.jpg'
  },
  7: {
    name: '真相之殿',
    mood: '通透、光明、真相',
    bg: '#f5f0ea',
    gridLine: '#d0c8c0',
    thickLine: '#b8a898',
    border: '#c9b037',
    cageDash: '#c0b0a0',
    cageBadgeBg: '#22c55e',
    cageBadgeText: '#ffffff',
    fixedNum: '#2a2520',
    playerNum: '#2ecc71',
    candidateNum: '#a09888',
    errorNum: '#e74c3c',
    selectedCell: 'rgba(201,176,55,0.25)',
    sameNumGlow: 'rgba(200,180,100,0.15)',
    sameRowCol: 'rgba(200,190,180,0.08)',
    sameBox: 'rgba(200,190,180,0.1)',
    cageHighlight: 'rgba(201,176,55,0.12)',
    cageArea: 'rgba(200,190,180,0.06)',
    isDark: false,
    bgImage: 'assets/images/bg/bg_chapter_7.jpg'
  }
};

// 默认样式（free play/battle模式使用）
const DEFAULT_STYLE = {
  ...CHAPTER_STYLES[1],
  name: '默认',
  cageBadgeBg: '#22c55e',
  cageBadgeText: '#ffffff'
};

// Boss战专用样式覆盖
const BOSS_STYLE_OVERRIDES = {
  ray: { // 阿岩 - 活泼热血
    cageBadgeBg: '#e67e22',
    cageBadgeText: '#ffffff',
    playerNum: '#e67e22',
    border: '#d35400',
    selectedCell: 'rgba(230,126,34,0.25)'
  },
  plotter: { // 设局人 - 冷酷压迫
    cageBadgeBg: '#dc2626',
    cageBadgeText: '#fef3c7',
    playerNum: '#ef4444',
    border: '#991b1b',
    selectedCell: 'rgba(220,38,38,0.2)',
    isDark: true
  },
  weaver: { // 星辰梭 - 高傲冷峻
    cageBadgeBg: '#a855f7',
    cageBadgeText: '#ffffff',
    playerNum: '#00d4ff',
    border: '#7c3aed',
    selectedCell: 'rgba(168,85,247,0.2)',
    isDark: true
  },
  remnant: { // 残局守护者 - 机械无感情
    cageBadgeBg: '#6b7280',
    cageBadgeText: '#ffffff',
    playerNum: '#9ca3af',
    border: '#4b5563',
    selectedCell: 'rgba(107,114,128,0.2)',
    isDark: true
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHAPTER_STYLES, DEFAULT_STYLE, BOSS_STYLE_OVERRIDES };
} else {
  window.CHAPTER_STYLES = CHAPTER_STYLES;
  window.DEFAULT_STYLE = DEFAULT_STYLE;
  window.BOSS_STYLE_OVERRIDES = BOSS_STYLE_OVERRIDES;
}
