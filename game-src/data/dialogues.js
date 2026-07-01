// ==========================================
// 角色定义与配音台词数据
// ==========================================

const CHARACTERS = {
  cagekeeper: {
    id: 'cagekeeper',
    name: '守笼人',
    nameEn: 'Cagekeeper',
    voicePrefix: 'VO_CK',
    portraits: {
      default: 'cagekeeper_default.png',
      smile: 'cagekeeper_default.png',
      surprised: 'cagekeeper_surprised.png',
      serious: 'cagekeeper_serious.png',
      think: 'cagekeeper_serious.png',
      sad: 'cagekeeper_serious.png'
    },
    voice: 'zh-CN-YunxiNeural',
    voiceStyle: 'gentle'
  },
  ray: {
    id: 'ray',
    name: '阿岩',
    nameEn: 'Ray',
    voicePrefix: 'VO_R',
    portraits: {
      default: 'ray_default.png',
      smile: 'ray_default.png',
      surprised: 'ray_angry.png',
      angry: 'ray_angry.png',
      lose: 'ray_default.png'
    },
    voice: 'zh-CN-YunjianNeural',
    voiceStyle: 'cheerful'
  },
  plotter: {
    id: 'plotter',
    name: '设局人',
    nameEn: 'Plotter',
    voicePrefix: 'VO_P',
    portraits: {
      default: 'plotter_default.png',
      smirk: 'plotter_smirk.png',
      angry: 'plotter_angry.png',
      surprised: 'plotter_surprised.png',
      confident: 'plotter_confident.png',
      shadow_default: 'plotter_shadow_default.png',
      shadow_smirk: 'plotter_shadow_smirk.png'
    },
    voice: 'zh-CN-YunyeNeural',
    voiceStyle: 'calm'
  },
  plotterShadow: {
    id: 'plotterShadow',
    name: '设局人残影',
    nameEn: 'Plotter Shadow',
    voicePrefix: 'VO_PS',
    portraits: {
      default: 'plotter_shadow_default.png',
      smirk: 'plotter_shadow_smirk.png',
      angry: 'plotter_shadow_default.png',
      surprised: 'plotter_shadow_default.png',
      confident: 'plotter_shadow_smirk.png'
    },
    voice: 'zh-CN-YunyeNeural',
    voiceStyle: 'calm'
  },
  weaver: {
    id: 'weaver',
    name: '星辰梭',
    nameEn: 'Weaver',
    voicePrefix: 'VO_W',
    portraits: {
      default: 'weaver_default.png',
      surprised: 'weaver_default.png',
      smirk: 'weaver_default.png',
      angry: 'weaver_default.png'
    },
    voice: 'zh-CN-YunxiNeural',
    voiceStyle: 'proud',
    rate: '+15%'
  },
  remnant: {
    id: 'remnant',
    name: '残局守护者',
    nameEn: 'Remnant',
    voicePrefix: 'VO_RE',
    portraits: {
      default: 'remnant_default.png',
      stern: 'remnant_default.png',
      surprised: 'remnant_default.png'
    },
    voice: 'zh-CN-YunxiNeural',
    voiceStyle: 'mechanical',
    rate: '-10%',
    pitch: '-5Hz'
  },
  setterSecret: {
    id: 'setterSecret',
    name: '设局人（秘术）',
    nameEn: 'Plotter (Secret)',
    voicePrefix: 'VO_SS',
    portraits: {
      default: 'setter_secret_default.png',
      smirk: 'setter_secret_smirk.png',
      angry: 'setter_secret_angry.png',
      surprised: 'setter_secret_surprised.png',
      confident: 'setter_secret_confident.png'
    },
    voice: 'zh-CN-YunyeNeural',
    voiceStyle: 'calm',
    rate: '-5%',
    pitch: '-3Hz'
  },
  system: {
    id: 'system',
    name: '系统',
    nameEn: 'System',
    voicePrefix: 'VO_S',
    portraits: {},
    voice: 'zh-CN-XiaoxiaoNeural'
  },
  narrator: {
    id: 'narrator',
    name: '',
    nameEn: 'Narrator',
    voicePrefix: '',
    portraits: {},
    voice: ''
  }
};

// ==========================================
// 完整台词清单
// ==========================================
const DIALOGUES = {
  // ---- 守笼人 (11句) ----
  VO_CK_01: { char: 'cagekeeper', portrait: 'default', text: '欢迎来到档案室。', scene: 'ch1_opening', effect: 0 },
  VO_CK_02: { char: 'cagekeeper', portrait: 'default', text: '我是这里的记录者。', scene: 'ch1_opening', effect: 0 },
  VO_CK_03: { char: 'cagekeeper', portrait: 'serious', text: '这些档案被数字密码锁住了。', scene: 'before_tutorial', effect: 0 },
  VO_CK_04: { char: 'cagekeeper', portrait: 'serious', text: '解开它们，你就能找到真相。', scene: 'before_tutorial', effect: 0 },
  VO_CK_05: { char: 'cagekeeper', portrait: 'smile', text: '嗯……做得不错。', scene: 'first_correct', effect: 1 },
  VO_CK_06: { char: 'cagekeeper', portrait: 'smile', text: '你比我想象中敏锐。', scene: 'level_clear', effect: 0 },
  VO_CK_07: { char: 'cagekeeper', portrait: 'surprised', text: '什么？！', scene: 'breakthrough', effect: 2 },
  VO_CK_08: { char: 'cagekeeper', portrait: 'surprised', text: '你居然能看穿这一层……', scene: 'advanced_tech', effect: 1 },
  VO_CK_09: { char: 'cagekeeper', portrait: 'think', text: '让我想想……', scene: 'before_hint', effect: 0 },
  VO_CK_10: { char: 'cagekeeper', portrait: 'sad', text: '那份档案……的确有些蹊跷。', scene: 'mention_plotter', effect: 0 },
  VO_CK_11: { char: 'cagekeeper', portrait: 'sad', text: '我没想到……他竟然会走到那一步。', scene: 'ch6_eve', effect: 0 },
  VO_CK_12: { char: 'cagekeeper', portrait: 'serious', text: '看来，是时候考验你真正的实力了。', scene: 'ch2_boss', effect: 3 },
  VO_CK_13: { char: 'cagekeeper', portrait: 'serious', text: '作为你的导师，我不会手下留情。', scene: 'ch2_boss', effect: 3 },
  VO_CK_14: { char: 'cagekeeper', portrait: 'surprised', text: '你……竟然做到了这一步。', scene: 'cagekeeper_defeat', effect: 2 },
  VO_CK_15: { char: 'cagekeeper', portrait: 'default', text: '很好，你已经超越了我。去揭开真相吧。', scene: 'cagekeeper_defeat', effect: 2 },

  // ---- 阿岩 (10句) ----
  VO_R_01: { char: 'ray', portrait: 'default', text: '嘿！你就是新来的档案侦探？', scene: 'ray_boss_intro', effect: 3 },
  VO_R_02: { char: 'ray', portrait: 'default', text: '想进下一层？先过我这关！', scene: 'ray_boss_start', effect: 3 },
  VO_R_03: { char: 'ray', portrait: 'smile', text: '哈哈，这题可没那么简单哦！', scene: 'ray_stuck', effect: 0 },
  VO_R_04: { char: 'ray', portrait: 'surprised', text: '诶？！', scene: 'ray_break', effect: 1 },
  VO_R_05: { char: 'ray', portrait: 'surprised', text: '你居然能解开？！', scene: 'ray_break2', effect: 2 },
  VO_R_06: { char: 'ray', portrait: 'angry', text: '可恶！', scene: 'ray_tied', effect: 2 },
  VO_R_07: { char: 'ray', portrait: 'angry', text: '我还没认真呢！', scene: 'ray_tied', effect: 1 },
  VO_R_08: { char: 'ray', portrait: 'lose', text: '切……', scene: 'ray_defeat', effect: 2 },
  VO_R_09: { char: 'ray', portrait: 'lose', text: '算你厉害……', scene: 'ray_defeat', effect: 2 },
  VO_R_10: { char: 'ray', portrait: 'angry', text: '后面还有更难的！', scene: 'ray_after', effect: 0 },

  // ---- 设局人 (10句) ----
  VO_P_01: { char: 'plotter', portrait: 'default', text: '你终于走到这一步了。', scene: 'plotter_enter', effect: 3 },
  VO_P_02: { char: 'plotter', portrait: 'default', text: '可惜，还不够。', scene: 'plotter_enter', effect: 3 },
  VO_P_03: { char: 'plotter', portrait: 'smirk', text: '呵……', scene: 'plotter_pressure', effect: 1 },
  VO_P_04: { char: 'plotter', portrait: 'smirk', text: '你以为你看到的，就是全部？', scene: 'plotter_battle', effect: 0 },
  VO_P_05: { char: 'plotter', portrait: 'confident', text: '那就让你亲身体会一下。', scene: 'plotter_final_start', effect: 4 },
  VO_P_06: { char: 'plotter', portrait: 'confident', text: '真正的「笼中密码」。', scene: 'plotter_final_start', effect: 4 },
  VO_P_07: { char: 'plotter', portrait: 'angry', text: '不可能！', scene: 'plotter_broken', effect: 2 },
  VO_P_08: { char: 'plotter', portrait: 'angry', text: '我设下的锁岂是你能解的？！', scene: 'plotter_broken2', effect: 2 },
  VO_P_09: { char: 'plotter', portrait: 'surprised', text: '你……你居然……', scene: 'plotter_flaw', effect: 4 },
  VO_P_10: { char: 'plotter', portrait: 'default', text: '……结束了。', scene: 'plotter_defeat', effect: 4 },

  // ---- 设局人·秘术形态（第7章终章，12句）----
  VO_SS_01: { char: 'setterSecret', portrait: 'confident', text: '三十年前，我设下这七卷秘术，只为等一个人。', scene: 'ch7_final', effect: 4 },
  VO_SS_02: { char: 'setterSecret', portrait: 'smirk', text: '一个能在混沌中看见秩序，在牢笼中找到钥匙的人。', scene: 'ch7_final', effect: 3 },
  VO_SS_03: { char: 'setterSecret', portrait: 'confident', text: '数对、三链数、X翼、剑鱼……我会全部用出来。', scene: 'ch7_final', effect: 4 },
  VO_SS_04: { char: 'setterSecret', portrait: 'default', text: '如果你能赢我，你就是新的设局人。', scene: 'ch7_final', effect: 4 },
  VO_SS_05: { char: 'setterSecret', portrait: 'smirk', text: '秘术推演，比你想象得更快。', scene: 'setter_pressure', effect: 1 },
  VO_SS_06: { char: 'setterSecret', portrait: 'smirk', text: '你以为看到了剑鱼？不，那只是我的诱饵。', scene: 'setter_battle', effect: 2 },
  VO_SS_07: { char: 'setterSecret', portrait: 'surprised', text: '……不可能！', scene: 'setter_broken', effect: 3 },
  VO_SS_08: { char: 'setterSecret', portrait: 'angry', text: 'X翼构型……被你看穿了？！', scene: 'setter_broken2', effect: 3 },
  VO_SS_09: { char: 'setterSecret', portrait: 'surprised', text: '你……不仅学会了秘术，还能在实战中运用……', scene: 'setter_defeat', effect: 4 },
  VO_SS_10: { char: 'setterSecret', portrait: 'default', text: '好。从今天起，「秘术大师」的称号属于你。', scene: 'setter_defeat', effect: 4 },
  VO_SS_11: { char: 'setterSecret', portrait: 'smirk', text: '星辰梭的传承，正式交到你手中。', scene: 'setter_transfer', effect: 4 },
  VO_SS_12: { char: 'setterSecret', portrait: 'default', text: '去吧。新的笼局，等你去设。', scene: 'setter_farewell', effect: 4 },

  // ---- 阿岩·终章 (3句) ----
  VO_R_11: { char: 'ray', portrait: 'surprised', text: '他……他的气场完全变了！比之前强太多了！', scene: 'ch7_final', effect: 2 },
  VO_R_12: { char: 'ray', portrait: 'smile', text: '我们赢了？！我们真的赢了设局人完全体？！', scene: 'setter_defeat', effect: 2 },
  VO_R_13: { char: 'ray', portrait: 'smile', text: '太好了！以后你就是大师了，我还当你的助手！', scene: 'true_ending', effect: 1 },

  // ---- 守笼人·终章 (3句) ----
  VO_CK_16: { char: 'cagekeeper', portrait: 'serious', text: '小心。这是他真正的实力，不要留手。', scene: 'ch7_final', effect: 2 },
  VO_CK_17: { char: 'cagekeeper', portrait: 'smile', text: '（微微点头）恭喜你，真正的大师。', scene: 'setter_transfer', effect: 2 },
  VO_CK_18: { char: 'cagekeeper', portrait: 'default', text: '七卷秘术已全部传承。档案之道，薪火不息。', scene: 'true_ending', effect: 3 },

  // ---- 设局人残影 (4句) ----
  VO_PS_01: { char: 'plotterShadow', portrait: 'smirk', text: '你以为……这就是真相？', scene: 'ch3_boss', effect: 3 },
  VO_PS_02: { char: 'plotterShadow', portrait: 'default', text: '我留下的残影，只是开始。', scene: 'ch3_boss', effect: 3 },
  VO_PS_03: { char: 'plotterShadow', portrait: 'surprised', text: '……残影被看穿了？', scene: 'shadow_defeat', effect: 2 },
  VO_PS_04: { char: 'plotterShadow', portrait: 'default', text: '有意思。继续往前走吧……', scene: 'shadow_defeat', effect: 2 },

  // ---- 星辰梭 (9句) ----
  VO_W_01: { char: 'weaver', portrait: 'default', text: '我就是星辰梭。', scene: 'weaver_enter', effect: 3 },
  VO_W_02: { char: 'weaver', portrait: 'default', text: '穿梭于逻辑之间的织网者。', scene: 'weaver_enter', effect: 3 },
  VO_W_03: { char: 'weaver', portrait: 'smirk', text: '你以为这就结束了？', scene: 'weaver_tech', effect: 1 },
  VO_W_04: { char: 'weaver', portrait: 'smirk', text: '远着呢。', scene: 'weaver_tech', effect: 0 },
  VO_W_05: { char: 'weaver', portrait: 'surprised', text: '有趣……', scene: 'weaver_exceed', effect: 1 },
  VO_W_06: { char: 'weaver', portrait: 'surprised', text: '你居然能看穿这层结构。', scene: 'weaver_seen', effect: 2 },
  VO_W_07: { char: 'weaver', portrait: 'angry', text: '别得意。', scene: 'weaver_cornered', effect: 2 },
  VO_W_08: { char: 'weaver', portrait: 'angry', text: '我还没有用出真正的杀招。', scene: 'weaver_cornered', effect: 2 },
  VO_W_09: { char: 'weaver', portrait: 'angry', text: '……你赢了。', scene: 'weaver_defeat', effect: 2 },

  // ---- 残局守护者 (6句) ----
  VO_RE_01: { char: 'remnant', portrait: 'default', text: '残局已激活。', scene: 'remnant_enter', effect: 4 },
  VO_RE_02: { char: 'remnant', portrait: 'default', text: '验证开始。', scene: 'remnant_enter', effect: 3 },
  VO_RE_03: { char: 'remnant', portrait: 'stern', text: '检测到异常逻辑输入。', scene: 'remnant_break', effect: 2 },
  VO_RE_04: { char: 'remnant', portrait: 'stern', text: '拒绝。', scene: 'remnant_reject', effect: 1 },
  VO_RE_05: { char: 'remnant', portrait: 'surprised', text: '残局……被破解。', scene: 'remnant_defeat', effect: 4 },
  VO_RE_06: { char: 'remnant', portrait: 'surprised', text: '逻辑崩塌中……', scene: 'remnant_collapse', effect: 4 },

  // ---- 系统 (3句) ----
  VO_S_01: { char: 'system', portrait: null, text: '异议あり！', scene: 'objection', effect: 4, lang: 'ja' },
  VO_S_02: { char: 'system', portrait: null, text: '档案碎片已收集。', scene: 'fragment', effect: 1 },
  VO_S_03: { char: 'system', portrait: null, text: '恭喜通关。', scene: 'clear', effect: 1 },

  // ---- 第一章开场（无配音部分，使用打字机音效）----
  CH1_N01: { char: null, portrait: null, text: '第一章', scene: 'ch1_opening_full', effect: 0, isTitle: true, subtitle: '初识笼中密码' },
  CH1_N02: { char: 'narrator', portrait: null, text: '你推开尘封三十年的档案馆大门，空气中弥漫着旧纸张的气息。', scene: 'ch1_opening_full', effect: 0 },
  CH1_RAY01: { char: 'ray', portrait: 'smile', text: '哇，你就是新来的档案侦探？我叫阿岩，比你早来几天的实习侦探！', scene: 'ch1_opening_full', effect: 0 },
  CH1_RAY02: { char: 'ray', portrait: 'smile', text: '别紧张，我会在旁边帮你翻译大师的话——他老人家说话总是文绉绉的！', scene: 'ch1_opening_full', effect: 0 },
  CH1_CK05: { char: 'cagekeeper', portrait: 'default', text: '从今天起，你们将从最基础的4×4盘面学起。记住三条铁律：每行、每列、每个2×2小宫格里，数字只能出现一次。', scene: 'ch1_opening_full', effect: 0 }
};

// ==========================================
// 剧情场景触发映射
// ==========================================
const SCENE_TRIGGERS = {
  // 第一章
  ch1_opening: ['VO_CK_01', 'VO_CK_02', 'VO_CK_03', 'VO_CK_04'],
  ch1_opening_full: ['CH1_N01', 'CH1_N02', 'VO_CK_01', 'VO_CK_02', 'CH1_RAY01', 'VO_CK_03', 'VO_CK_04', 'CH1_RAY02', 'CH1_CK05'],
  before_tutorial: ['VO_CK_03', 'VO_CK_04'],
  first_correct: ['VO_CK_05'],
  level_clear_ch1: ['VO_CK_06'],
  breakthrough: ['VO_CK_07'],
  advanced_tech: ['VO_CK_08'],
  before_hint: ['VO_CK_09'],
  ch1_boss: ['VO_R_01', 'VO_R_02'],

  // 第二章 - 秩序档案馆（守笼人继续引导）
  ch2_opening: ['VO_CK_06', 'VO_CK_08'],
  ch2_boss: ['VO_CK_12', 'VO_CK_13'],
  cagekeeper_defeat: ['VO_CK_14', 'VO_CK_15'],

  // 各章节Boss开场（triggerChapterIntro使用）
  ch3_boss: ['VO_PS_01', 'VO_PS_02'],
  shadow_defeat: ['VO_PS_03', 'VO_PS_04'],
  ch4_boss: ['VO_RE_01', 'VO_RE_02'],
  ch5_boss: ['VO_W_01', 'VO_W_02'],
  ch6_boss: ['VO_CK_11', 'VO_P_01', 'VO_P_02'],
  ch7_final: ['VO_SS_01', 'VO_SS_02', 'VO_R_11', 'VO_CK_16', 'VO_SS_03', 'VO_SS_04'],

  // 阿岩Boss
  ray_boss_intro: ['VO_R_01'],
  ray_boss_start: ['VO_R_02'],
  ray_stuck: ['VO_R_03'],
  ray_break: ['VO_R_04'],
  ray_break2: ['VO_R_05'],
  ray_tied: ['VO_R_06', 'VO_R_07'],
  ray_defeat: ['VO_R_08', 'VO_R_09'],
  ray_after: ['VO_R_10'],

  // 第三章 残影
  mention_plotter: ['VO_CK_10'],

  // 第四章 残局守护者
  remnant_enter: ['VO_RE_01', 'VO_RE_02'],
  remnant_break: ['VO_RE_03'],
  remnant_reject: ['VO_RE_04'],
  remnant_defeat: ['VO_RE_05', 'VO_RE_06'],

  // 第五章 星辰梭
  weaver_enter: ['VO_W_01', 'VO_W_02'],
  weaver_tech: ['VO_W_03', 'VO_W_04'],
  weaver_exceed: ['VO_W_05'],
  weaver_seen: ['VO_W_06'],
  weaver_cornered: ['VO_W_07', 'VO_W_08'],
  weaver_defeat: ['VO_W_09'],

  // 第六章 设局人
  ch6_eve: ['VO_CK_11'],
  plotter_enter: ['VO_P_01', 'VO_P_02'],
  plotter_pressure: ['VO_P_03'],
  plotter_battle: ['VO_P_04'],
  plotter_final_start: ['VO_P_05', 'VO_P_06'],
  plotter_broken: ['VO_P_07'],
  plotter_broken2: ['VO_P_08'],
  plotter_flaw: ['VO_P_09'],
  plotter_defeat: ['VO_P_10'],

  // 第七章 终章 - 设局人秘术形态
  setter_pressure: ['VO_SS_05'],
  setter_battle: ['VO_SS_06'],
  setter_broken: ['VO_SS_07'],
  setter_broken2: ['VO_SS_08'],
  setter_defeat: ['VO_SS_09', 'VO_SS_10', 'VO_R_12'],
  setter_transfer: ['VO_SS_11', 'VO_CK_17'],
  setter_farewell: ['VO_SS_12'],
  true_ending: ['VO_CK_18', 'VO_R_13', 'VO_S_03'],

  // 通用
  objection: ['VO_S_01'],
  fragment: ['VO_S_02'],
  clear: ['VO_S_03'],
  clear_level: ['VO_S_03'],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHARACTERS, DIALOGUES, SCENE_TRIGGERS };
} else {
  window.CHARACTERS = CHARACTERS;
  window.DIALOGUES = DIALOGUES;
  window.SCENE_TRIGGERS = SCENE_TRIGGERS;
}
