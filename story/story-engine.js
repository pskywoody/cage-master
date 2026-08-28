// StoryEngine - Clean story playback with typewriter effect
// Handles prologue, dialogue, portraits, backgrounds, SFX, VO
// Supports skip button, long-press skip, read-dialogue fast-forward, skip confirmation
// Enhanced with Ace Attorney style presentation quality

  'use strict';

  const BG_DIR = 'assets/images/backgrounds/';
  const PORTRAIT_DIR = 'assets/images/portraits/';
  const SKIP_STORAGE_KEY = 'cagedcipher_story_skip';
  const READ_STORAGE_KEY = 'cagedcipher_story_read';
  const HISTORY_STORAGE_KEY = 'cagedcipher_story_history';

  // Character side mapping (left/right position on screen)
  // 语音总开关（2026-08-03）：minimax 配音暂缓，默认关闭只保留打字机音效
  let VOICE_ENABLED = false;

  // v2.0：仅本周目主角沈墨从桌侧（左）出现且水平翻转（脸朝棋盘），
  // 其余角色（含苏晚/薇拉/伊藤/山田/老师/父亲等）一律右侧出现不翻转
  const CHAR_SIDE = {
    shenmo: 'left',
    suwan: 'right', vera: 'right',
    zhou_taotai: 'right', pan_hanian: 'right',
    ito: 'right', yamada: 'right', teacher: 'right',
    father: 'right',
  };

  // Typewriter speed presets (ms per character)
  const TYPING_SPEEDS = {
    // 2026-08-19：用户反馈教学/剧情文字显示过慢 → 整体提速约 15-20×。
    // 旧档 500-1500ms/字（1-2 字/秒）过慢；新档按中文快读节奏（约 11-35 字/秒）校准，
    // 既明显更快又不至于看不清（保留极小随机抖动手感）。
    serene: 75,      // 低沉缓慢 ~13 字/秒
    normal: 48,      // 正常语速 ~21 字/秒
    fast: 28,        // 快语速 ~36 字/秒
    instant: 0,
    heavy: 90,       // 沉重缓慢 ~11 字/秒
    thinking: 62,    // 思考中 ~16 字/秒
  };

  // Emotion -> typing speed
  function emotionSpeed(emotion) {
    const map = {
      serious: 'serene', calm: 'normal', confident: 'fast',
      surprised: 'fast', energetic: 'fast', default: 'normal',
      smile: 'normal', think: 'thinking',
    };
    // 第一步：中文 emotion 词 → 中间情感词（serene/normal/fast/thinking...）
    let key = EMOTION_ZH_MAP ? (EMOTION_ZH_MAP[emotion] || emotion || 'normal') : (emotion || 'normal');
    // 第二步：中间情感词 → 速度档（修复旧版 map 定义却未生效，导致 'serious' 等
    // 退化成字符串 'normal'，_typewrite 内 'normal'+数字 = NaN → setTimeout(NaN)=0 变瞬时）
    key = map[key] || key;
    const sp = TYPING_SPEEDS[key];
    // 兜底务必返回数字（TYPING_SPEEDS.normal 而非字符串），否则 _typewrite 会算成 NaN
    return (typeof sp === 'number') ? sp : TYPING_SPEEDS.normal;
  }

  // 中文 emotion → 英文 key 归一化（自动生成，覆盖 scripts.json 全部情感词）
  // 规则：先精确匹配，再按关键词兜底；未命中回退 default 立绘
  const EMOTION_ZH_MAP = {
    "不敢相信": "surprised",
    "不舍·笑": "smile",
    "严肃": "serious",
    "严肃·教学": "teaching",
    "严肃·确认": "serious",
    "严肃·警告": "stern",
    "低沉": "sad",
    "低沉·不确定": "sad",
    "低沉·回避": "sad",
    "低沉·坚定": "determined",
    "低沉·复杂": "sad",
    "低沉·感慨": "sad",
    "低沉·揭示": "sad",
    "低沉·未知": "sad",
    "低沉·沉重": "sad",
    "低沉·理解": "sad",
    "低沉·确认": "sad",
    "低沉·自语": "sad",
    "低沉·观察": "sad",
    "低沉·认可": "sad",
    "低沉·认真": "serious",
    "低沉·试探": "sad",
    "低沉·询问": "sad",
    "低沉·领悟": "sad",
    "低语·不敢说出口": "surprised",
    "傲慢·嘲讽": "confident",
    "傲慢·期待": "confident",
    "元气·搞笑": "excited",
    "克制·鼓励": "smile",
    "兴奋": "excited",
    "兴奋·发现": "excited",
    "兴奋·教学": "teaching",
    "兴奋·期待": "excited",
    "兴奋·热情": "excited",
    "兴奋·确认": "excited",
    "冷笑": "smile",
    "冷静": "calm",
    "冷静·但手在微微发抖": "calm",
    "冷静·分析": "think",
    "冷静·推进": "calm",
    "冷静·提示": "teaching",
    "冷静·揭穿": "calm",
    "冷静·教学": "teaching",
    "冷静·确认": "calm",
    "冷静·简短": "calm",
    "冷静·练习过的": "calm",
    "冷静·解释": "calm",
    "冷静·评价": "calm",
    "冷静·询问": "calm",
    "冷静·陈述": "calm",
    "冷静·鼓励": "calm",
    "发现": "surprised",
    "发现·报数": "surprised",
    "哭·不敢相信·期待": "crying",
    "哭·坚定·笑": "crying",
    "哭·微笑·释然": "crying",
    "哭·笑·撒娇": "crying",
    "哭·质问·想念": "crying",
    "哭·释然": "crying",
    "哭·释然·想念": "crying",
    "哲理·深沉": "mysterious",
    "哲理·领悟": "mysterious",
    "哽咽·微笑·克制": "crying",
    "嘟囔": "default",
    "回忆·苦涩": "sad",
    "回避": "sad",
    "困惑": "think",
    "困惑·紧张": "think",
    "坚定": "determined",
    "坚定·前行": "determined",
    "坚定·又带着一丝不确定·像是赴一个迟到三十年的约": "determined",
    "坚定·宣告": "determined",
    "坚定·热血": "determined",
    "坚定·真情": "determined",
    "坚定·询问": "determined",
    "坚定·走向": "determined",
    "复杂·一丝不易察觉的柔软": "gentle",
    "复杂·低沉": "sad",
    "复杂·回避": "sad",
    "复杂·恨意与好奇交织": "think",
    "复杂·感慨": "sad",
    "复杂·敬畏": "serious",
    "复杂·欣慰": "sad",
    "复杂·温柔": "gentle",
    "复杂·理解": "think",
    "复杂·看着W的轮廓": "sad",
    "复杂·诚实": "serious",
    "复杂·预知·温柔": "gentle",
    "大喊·开心·自由": "excited",
    "好奇": "think",
    "好奇·佩服": "think",
    "好奇·急切": "think",
    "好奇·期待": "think",
    "害怕·好奇": "think",
    "害怕·小声": "surprised",
    "害怕·惊奇": "surprised",
    "害怕·理解": "surprised",
    "小声·坚定·快哭了": "crying",
    "小心·询问": "think",
    "崇拜": "smile",
    "平静": "calm",
    "平静·傲慢·一切尽在掌握": "confident",
    "平静·判断": "think",
    "平静·回答": "calm",
    "平静·坚定": "determined",
    "平静·对话感": "calm",
    "平静·展示": "calm",
    "平静·带一点笑意·直视镜头": "calm",
    "平静·微笑": "calm",
    "平静·揭示": "calm",
    "平静·收尾": "calm",
    "平静·期待": "calm",
    "平静·温柔": "gentle",
    "平静·确认": "calm",
    "平静·简短": "calm",
    "平静·询问": "calm",
    "平静·释然": "calm",
    "平静·陈述": "calm",
    "平静·预示": "calm",
    "庄重": "serious",
    "庄重·与一周目同一句，但语气更疲惫": "angry",
    "庄重·严肃": "serious",
    "庄重·口诀": "teaching",
    "庄重·回忆": "serious",
    "庄重·复杂": "serious",
    "庄重·托付": "serious",
    "庄重·教学": "teaching",
    "庄重·敬畏": "serious",
    "庄重·欣慰": "serious",
    "庄重·神秘": "mysterious",
    "庄重·询问": "serious",
    "庄重·过渡": "serious",
    "庄重·铺垫": "serious",
    "开心·期待": "excited",
    "引用·沉重": "sad",
    "强撑·活泼": "excited",
    "微笑·平静·幸福": "calm",
    "快速计算": "thinking",
    "快速计算·确认": "thinking",
    "怀念·低沉": "sad",
    "怀念·声音微颤": "sad",
    "怀念·小心": "sad",
    "急切": "surprised",
    "急切·激动": "excited",
    "恍然·欣慰": "smile",
    "恍然·笑": "smile",
    "恍然·难过": "sad",
    "恍然大悟": "surprised",
    "惊吓·紧张": "surprised",
    "惊喜": "surprised",
    "惊喜·感激": "surprised",
    "惊恐": "surprised",
    "惊恐·不舍": "surprised",
    "惊恐·紧张": "surprised",
    "惊恐·跳起来": "surprised",
    "惊讶": "surprised",
    "惊讶·确认": "surprised",
    "惊讶·询问": "surprised",
    "惊讶·轻声": "surprised",
    "意味深长": "mysterious",
    "意外·感兴趣": "surprised",
    "意外·期待": "smile",
    "意外·认可": "surprised",
    "意外·询问": "think",
    "意外·轻笑": "smile",
    "感慨·低沉": "sad",
    "懊恼·元气": "angry",
    "担心": "surprised",
    "提醒·紧张": "surprised",
    "搞笑·自嘲": "smile",
    "教学": "teaching",
    "敬畏·小声": "serious",
    "断然·复杂": "determined",
    "旁白·低沉·讲故事": "sad",
    "旁白·温柔·忧伤·讲故事": "gentle",
    "旁白·温柔·讲故事": "gentle",
    "期待·急切": "surprised",
    "机械·\"笑\"": "smile",
    "机械·严肃": "serious",
    "机械·但停顿了0.5秒——第一次\"犹豫\"": "default",
    "机械·但停顿了1秒才说——第一次\"主动帮助\"": "default",
    "机械·但在引用沈世安的话时，语速慢了0.1秒": "default",
    "机械·但声音比之前小——第一次\"温柔\"": "gentle",
    "机械·但语气有微小变化——\"不喜欢\"不是系统用语": "angry",
    "机械·但这是第一个\"自我陈述\"句": "default",
    "机械·但这是第一次主动提到沈世安说过的话": "default",
    "机械·停顿2秒·极轻": "calm",
    "机械·像在纠正自己的用词——第一次\"组织语言\"": "default",
    "机械·别扭——像在掩饰什么": "default",
    "机械·匀速·无感情·合成质感": "default",
    "机械·启动": "default",
    "机械·安详": "default",
    "机械·对老朋友说话": "default",
    "机械·平静": "calm",
    "机械·庄重": "serious",
    "机械·报数": "default",
    "机械·教学": "teaching",
    "机械·智慧": "default",
    "机械·最后一课·电流声减弱": "default",
    "机械·极轻·气声·道别——这一句后期不加电音，保留微弱合成底噪": "angry",
    "机械·温柔": "gentle",
    "机械·温柔·父亲对女儿": "gentle",
    "机械·温柔——这是第一句\"人话\"，不是系统用语": "gentle",
    "机械·看向沈墨": "default",
    "机械·第一次有\"释然\"的感觉": "smile",
    "机械·缓慢": "default",
    "机械·艰难·像在说出一个秘密": "default",
    "机械·解释": "default",
    "机械·说明": "default",
    "机械·越来越像人·温柔": "gentle",
    "机械·高傲": "confident",
    "极低·只有自己能听到": "sad",
    "极沉重": "sad",
    "极温柔·苍老·坚定": "gentle",
    "极轻·只有自己能听到": "calm",
    "极轻·哽咽": "crying",
    "极轻·坚定": "determined",
    "极轻·坚定·真情·声音微微发颤": "determined",
    "极轻·害羞": "calm",
    "极轻·赞许": "smile",
    "极轻·鼓励": "calm",
    "果断·冷静": "determined",
    "果断·分析": "default",
    "核心·坚定·比第一章更沉": "determined",
    "核心·询问·确认": "think",
    "欣慰": "smile",
    "欣慰·复杂": "sad",
    "欣慰·赞许": "smile",
    "比喻·深沉": "sad",
    "沉着·指向": "calm",
    "沉稳": "calm",
    "沉稳·开始": "serious",
    "沉稳·策略": "calm",
    "沉重": "sad",
    "沉重·介绍": "sad",
    "沉重·哲理": "sad",
    "沉重·回忆": "sad",
    "沉重·复杂": "sad",
    "沉重·揭示": "sad",
    "沉重·温柔·追忆": "gentle",
    "沉重·简短": "sad",
    "沉重·追忆": "sad",
    "沉重·预示": "sad",
    "沉静": "calm",
    "沉静·报数": "teaching",
    "沉静·推进": "default",
    "沉静·比喻": "default",
    "沉静·领悟": "calm",
    "沉静·默认": "default",
    "沉默·0.8秒——第一次\"沉默\"": "default",
    "沧桑·傲慢·戏弄": "confident",
    "沧桑·叹息": "sad",
    "沮丧·快哭了": "crying",
    "活泼": "excited",
    "活泼·解释": "excited",
    "深沉·领悟": "sad",
    "温和·坚定": "gentle",
    "温和·笑": "gentle",
    "温和·认可": "smile",
    "温和·释然": "gentle",
    "温柔·了然": "gentle",
    "温柔·回忆·微笑": "gentle",
    "温柔·期待": "gentle",
    "激动·想哭": "crying",
    "激动·泪目": "crying",
    "狂喜·崇拜": "default",
    "理解": "calm",
    "理解·兴奋": "excited",
    "畏难": "default",
    "疲惫·开心": "excited",
    "痛苦·回忆": "sad",
    "直接·询问": "think",
    "确信·复杂": "default",
    "确信·温柔": "gentle",
    "确认": "calm",
    "确认·报数": "teaching",
    "碎片·焦急": "surprised",
    "碎片·遥远": "default",
    "神秘·戏弄": "mysterious",
    "笑·哭·坚定": "crying",
    "第一次有情绪——痛苦？": "default",
    "简短": "default",
    "简短·认可": "default",
    "紧张": "surprised",
    "紧张·坚定": "determined",
    "紧张·好奇": "think",
    "紧张·小声": "surprised",
    "紧张·怀疑": "surprised",
    "紧张·期待": "surprised",
    "紧张·确认": "surprised",
    "紧张·询问": "think",
    "紧张但兴奋": "excited",
    "羞恼": "angry",
    "自信·活泼": "confident",
    "自信·解释": "confident",
    "自嘲·笑": "smile",
    "苦涩": "sad",
    "苦涩·感慨": "sad",
    "苦涩·自嘲": "sad",
    "观察·评估": "default",
    "警觉": "stern",
    "警觉·分析": "stern",
    "警觉·询问": "stern",
    "认可": "smile",
    "认可·确认": "default",
    "认真": "serious",
    "认真·提示": "serious",
    "认真·教学": "serious",
    "认真·理解": "serious",
    "认真·策略": "serious",
    "认真理解": "serious",
    "试探·确认": "default",
    "试探·询问": "think",
    "说给别人听是搞笑·内心是害怕": "smile",
    "质问·压迫": "stern",
    "轻声·自语": "default",
    "轻声·询问": "think",
    "轻蔑": "smirk",
    "轻蔑·傲慢": "confident",
    "边哭边念·崩溃": "crying",
    "迟疑·询问": "think",
    "释然·低沉": "sad",
    "释然·微笑": "smile",
    "释然·微笑·坚定": "determined",
    "释然·感慨·消散": "sad",
    "释然·放下": "smile",
    "释然·流泪·欣慰": "crying",
    "释然·认可": "smile",
    "重复·但这次是释然": "smile",
    "重复·确认·更坚定": "determined",
    "雀跃": "default",
    "震动·不敢相信": "surprised",
    "震动·确认·柔软": "gentle",
    "震动·追忆": "sad",
    "震惊": "surprised",
    "震惊·不敢相信": "surprised",
    "震惊·复杂": "surprised",
    "震惊·害怕": "surprised",
    "震惊·恍惚": "surprised",
    "震惊·恍然": "surprised",
    "震惊·恍然大悟": "surprised",
    "震惊·确认": "surprised",
    "震惊·领悟": "surprised",
    "震撼·小声": "calm",
    "震撼·惊奇": "surprised",
    "震撼·敬畏": "serious",
    "震撼·确认": "surprised",
    "震撼·老泪纵横": "crying",
    "顿悟·震撼": "surprised",
    "领悟": "smile",
    "领悟·坚定": "determined",
    "领悟·复述": "default",
    "颤抖·不敢相信": "surprised",
    "颤抖·不敢相信·哭": "crying",
    "颤抖·确认": "crying",
    "默念": "thinking",
    "默念·确认": "default",
    "鼓励": "smile",
    "鼓励·热血": "default",
    "鼓励·紧张": "surprised",
    "鼓起勇气·询问": "angry",
  };;;

  // Portrait file mapping (emotion -> filename without extension)
  // 使用实际存在的PNG立绘文件（中文名+英文名混合）
  // ===== 新立绘映射（2026-08-03 接入 assets/images/portraits/new/）=====
  // 英文命名新立绘：SM/R/J/CK 全套差分；老师仅常态一张 P_01_normal_default
  // （用户确认：老师所有表情统一用常态）。缺位角色保留旧中文立绘。
  // ===== chibi Q 版映射（教学引导专用，2026-08-13 重制：正面半身像、趴在棋盘上讲解）=====
  // 教学阶段显示当前教学者 Q 版头像；差分：shenmo-thinking / vera-suwan-smile / ito-serious
  const CHIBI_MAP = {
    shenmo:   { default: 'shenmo_c01_default', thinking: 'shenmo_c01_thinking' },
    vera:     { default: 'vera_c01_default', smile: 'vera_c01_smile' },
    suwan:    { default: 'suwan_c01_default', smile: 'suwan_c01_smile' },
    ito:      { default: 'ito_c01_default', serious: 'ito_c01_serious' },
  };

  const PORTRAIT_MAP = {
    // 第一章新立绘（1941上海谍战主题，ch1_ 前缀透明PNG）
    shenmo: {
      default: 'ch1_shenmo_default', calm: 'ch1_shenmo_default',
      mysterious: 'ch1_shenmo_default', teaching: 'ch1_shenmo_default',
      think: 'ch1_shenmo_default', thinking: 'ch1_shenmo_default',
      surprised: 'ch1_shenmo_default',
      smile: 'ch1_shenmo_smile', confident: 'ch1_shenmo_smile',
      determined: 'ch1_shenmo_serious', stern: 'ch1_shenmo_serious',
      serious: 'ch1_shenmo_serious', angry: 'ch1_shenmo_serious',
      sad: 'ch1_shenmo_default', gentle: 'ch1_shenmo_default', lose: 'ch1_shenmo_default',
    },
    // 薇拉（第一章新增，白俄人设）
    vera: {
      default: 'ch1_vera_default', calm: 'ch1_vera_default',
      mysterious: 'ch1_vera_default', teaching: 'ch1_vera_default',
      think: 'ch1_vera_default', thinking: 'ch1_vera_default',
      surprised: 'ch1_vera_default', gentle: 'ch1_vera_default',
      sad: 'ch1_vera_default', lose: 'ch1_vera_default',
      smile: 'ch1_vera_smile', confident: 'ch1_vera_smile', smirk: 'ch1_vera_smile',
      serious: 'ch1_vera_serious', stern: 'ch1_vera_serious',
      angry: 'ch1_vera_serious', determined: 'ch1_vera_serious',
    },
    // 苏晚（新角色，专属立绘 2026-08-13 国风厚涂·脸朝左）
    suwan: {
      default: 'suwan_default', calm: 'suwan_default',
      teaching: 'suwan_default', mysterious: 'suwan_default',
      thinking: 'suwan_default', think: 'suwan_default',
      surprised: 'suwan_serious', gentle: 'suwan_smile',
      serious: 'suwan_serious', stern: 'suwan_serious',
      direct_gaze: 'suwan_serious', determined: 'suwan_serious',
      smile: 'suwan_smile', confident: 'suwan_smile',
      sad: 'suwan_serious',
    },
    // 周太太（第七·库房新角色，专属立绘 2026-08-13）
    zhou_taotai: {
      default: 'zhou_taotai_default', calm: 'zhou_taotai_default',
      smile: 'zhou_taotai_smile', serious: 'zhou_taotai_serious',
      stern: 'zhou_taotai_serious', angry: 'zhou_taotai_serious',
      thinking: 'zhou_taotai_default', think: 'zhou_taotai_default',
      surprised: 'zhou_taotai_serious', gentle: 'zhou_taotai_smile',
      sad: 'zhou_taotai_serious',
    },
    // 潘汉年（第六·网接头人，专属立绘 2026-08-13）
    pan_hanian: {
      default: 'pan_hanian_default', calm: 'pan_hanian_default',
      serious: 'pan_hanian_serious', stern: 'pan_hanian_serious',
      angry: 'pan_hanian_serious', thinking: 'pan_hanian_default',
      think: 'pan_hanian_default', smile: 'pan_hanian_smile',
      confident: 'pan_hanian_smile', gentle: 'pan_hanian_smile',
      surprised: 'pan_hanian_serious',
    },
    // 伊藤（第三章物证对峙，专属立绘 2026-08-13）
    ito: {
      default: 'ito_default', calm: 'ito_default',
      serious: 'ito_serious', stern: 'ito_serious',
      angry: 'ito_serious', thinking: 'ito_default',
      think: 'ito_default', surprised: 'ito_serious',
      smile: 'ito_default', confident: 'ito_default',
    },
    // 山田（第五·电特高课，专属立绘 2026-08-13）
    yamada: {
      default: 'yamada_default', calm: 'yamada_default',
      serious: 'yamada_serious', stern: 'yamada_serious',
      angry: 'yamada_angry', thinking: 'yamada_default',
      think: 'yamada_default', surprised: 'yamada_serious',
      smile: 'yamada_default', confident: 'yamada_default',
    },
    // 老师（留声/回忆，占位待专属美术）
    teacher: {
      default: 'ch1_shenmo_default', calm: 'ch1_shenmo_default',
      smile: 'ch1_shenmo_smile', serious: 'ch1_shenmo_serious',
      gentle: 'ch1_shenmo_default', thinking: 'ch1_shenmo_default',
      surprised: 'ch1_shenmo_default',
    },
    // 父亲（沈世安，回忆/信，专属立绘 2026-08-13）
    father: {
      default: 'father_default', calm: 'father_default',
      serious: 'father_serious', stern: 'father_serious',
      gentle: 'father_smile', smile: 'father_smile',
      confident: 'father_smile', thinking: 'father_default',
      think: 'father_default', surprised: 'father_serious',
      sad: 'father_serious',
    },
  };

  // Speaker alias mapping (supports nicknames and partial matching)
  const SPEAKER_ALIASES = {
    'shenmo': 'shenmo', '沈墨': 'shenmo', '沈墨君': 'shenmo', '小沈': 'shenmo',
    '苏晚': 'suwan', '苏晚（旧友）': 'suwan',
    '薇拉': 'vera', '薇拉（书信）': 'vera', '薇拉·陈': 'vera',
    '周太太': 'zhou_taotai', '房东太太': 'zhou_taotai',
    '潘汉年': 'pan_hanian', '灰布长衫': 'pan_hanian', '接头人': 'pan_hanian',
    '伊藤': 'ito', '伊藤（物证）': 'ito',
    '山田': 'yamada', '山田特高课': 'yamada',
    '老师': 'teacher', '老师（留声）': 'teacher', '留声': 'teacher',
    '父亲': 'father', '父亲（回忆）': 'father', '沈世安': 'father',
    '沈墨 CHIBI': 'shenmo', '沈墨CHIBI': 'shenmo', '少年沈墨': 'shenmo',
    'narrator': 'narrator', '旁白': 'narrator', '': 'narrator',
    'system': 'system', '系统': 'system',
  };

  class StoryEngine {
    constructor() {
      this._queue = [];
      this._currentDialogue = null;
      this._isPlaying = false;
      this._onComplete = null;
      this._currentBg = null;
      this._typewriterTimer = null;
      this._isTyping = false;
      // CG / chibi 显示状态
      this._cgEl = null;
      this._cgVisible = false;
      this._chibiEl = null;
      this._chibiVisible = false;

      // === Unified timer management ===
      // All setTimeout/setInterval IDs are tracked here for clean cleanup
      this._timers = new Set();
      this._intervals = new Set();

      // === Preload cache ===
      this._imageCache = {}; // url -> HTMLImageElement or Promise

      // VO sync state
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._typewriterStartTime = 0;

      // === Animation race condition guards ===
      // Track pending hide/show timers to prevent stale callbacks from overriding current state
      this._portraitHideTimer = null;
      this._bubbleHideTimer = null;
      this._narratorHideTimer = null;
      this._skipBtnHideTimer = null;
      this._portraitTransitioning = false;
      // 立绘隐藏纪元：每次 _hidePortrait 递增；预加载回调用它在显示前判断期间是否发生过隐藏，
      // 防止"预加载异步窗口内场景结束→隐藏 display:none→then 又把 display 设回 block"的立绘残留
      this._portraitEpoch = 0;
      this._itemVisible = false;
      this._itemTimer = null;

      // DOM elements
      this._portraitEl = null;
      this._bubbleEl = null;
      this._narratorEl = null;
      this._titleCardEl = null;
      this._overlayEl = null;
      this._itemEl = null;
      this._continueArrowEl = null;

      // Skip-related state
      this._skipBtnEl = null;
      this._longPressProgressEl = null;
      this._longPressTimer = null;
      this._longPressStart = 0;
      this._longPressDuration = 1000; // 1 second to trigger skip
      this._isLongPressing = false;
      this._skipConfirmationShown = false;
      this._sceneKey = null; // current scene identifier for read tracking
      this._autoSkipEnabled = true; // auto fast-forward for read dialogue
      this._isCurrentSceneRead = false;
      this._readHistory = {}; // cached read history, loaded from localStorage

      // === Dialogue history (for backlog / review) ===
      this._dialogueHistory = [];
      this._historyPanelEl = null;
      this._maxHistoryItems = 200;

      // Load skip preferences and read history
      this._loadSkipPrefs();
      this._loadReadHistory();
    }

    // ============================================================
    // === Timer Management (统一定时器管理) ===
    // ============================================================

    /**
     * Wrapped setTimeout that automatically tracks the timer ID.
     * All timers created through this method can be cleaned up via _clearAllTimers().
     * @param {Function} fn - Callback function
     * @param {number} ms - Delay in milliseconds
     * @returns {number} Timer ID
     */
    _setTimeout(fn, ms) {
      const id = setTimeout(() => {
        this._timers.delete(id);
        fn();
      }, ms);
      this._timers.add(id);
      return id;
    }

    /**
     * Clear a tracked timeout and remove it from the set.
     * @param {number} id - Timer ID
     */
    _clearTimeout(id) {
      if (id != null) {
        clearTimeout(id);
        this._timers.delete(id);
      }
    }

    /**
     * Wrapped setInterval that automatically tracks the interval ID.
     * @param {Function} fn - Callback function
     * @param {number} ms - Interval in milliseconds
     * @returns {number} Interval ID
     */
    _setInterval(fn, ms) {
      const id = setInterval(fn, ms);
      this._intervals.add(id);
      return id;
    }

    /**
     * Clear a tracked interval and remove it from the set.
     * @param {number} id - Interval ID
     */
    _clearInterval(id) {
      if (id != null) {
        clearInterval(id);
        this._intervals.delete(id);
      }
    }

    /**
     * Clear all tracked timers and intervals.
     * Called during interrupt(), _doSkip(), _endScene(), and destruction.
     */
    _clearAllTimers() {
      // Clear all tracked timeouts
      this._timers.forEach(id => clearTimeout(id));
      this._timers.clear();

      // Clear all tracked intervals
      this._intervals.forEach(id => clearInterval(id));
      this._intervals.clear();

      // Reset specific timer references
      this._typewriterTimer = null;
      this._longPressTimer = null;
      this._portraitHideTimer = null;
      this._bubbleHideTimer = null;
      this._narratorHideTimer = null;
      this._skipBtnHideTimer = null;
      this._itemTimer = null;

      // Reset animation states
      this._portraitTransitioning = false;
    }

    // ============================================================
    // === Image Preloading (图片预加载) ===
    // ============================================================

    /**
     * Preload a single image and cache it.
     * Returns a Promise that resolves when the image is loaded (or fails).
     * @param {string} url - Image URL
     * @returns {Promise<HTMLImageElement>} Loaded image element
     */
    _preloadImage(url) {
      if (this._imageCache[url]) {
        return this._imageCache[url];
      }
      const promise = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve(img);
        };
        img.onerror = () => {
          console.warn('[StoryEngine] Image failed to load:', url);
          resolve(null); // Resolve with null on failure for graceful degradation
        };
        img.src = url;
      });
      this._imageCache[url] = promise;
      return promise;
    }

    /**
     * 批量预加载剧情背景图（供「继续/新游戏」点击进关前预热，缩短首次进关等待）。
     * @param {string|string[]} bgValues - 背景名（短名将被拼上 BG_DIR）或完整 URL
     */
    async preloadBackgrounds(bgValues) {
      const list = Array.isArray(bgValues) ? bgValues : [bgValues];
      for (const bg of list) {
        if (!bg || typeof bg !== 'string') continue;
        let url = bg;
        if (!bg.startsWith('http') && !bg.startsWith('url(') && !bg.startsWith('assets/') && !bg.startsWith('data:') && !bg.startsWith('/')) {
          url = BG_DIR + bg;
        }
        try { await this._preloadImage(url); } catch (e) { /* 单张失败不阻塞 */ }
      }
    }

    /**
     * Preload all portrait expressions for a character.
     * Called at the start of sayLines when we know who will be speaking.
     * @param {string} charId - Character ID
     */
    _preloadPortraits(charId) {
      const map = PORTRAIT_MAP[charId];
      if (!map) return;
      Object.values(map).forEach(file => {
        const url = `${PORTRAIT_DIR}${file}.png`;
        this._preloadImage(url);
      });
    }

    /**
     * Get the portrait URL for a character + emotion.
     * @param {string} charId - Character ID
     * @param {string} emotion - Emotion key
     * @returns {string|null} Portrait URL or null
     */
    _getPortraitUrl(charId, emotion) {
      const file = this._getPortraitFile(charId, emotion);
      if (!file) return null;
      return `${PORTRAIT_DIR}${file}.png`;
    }

    // ============================================================
    // === Core API ===
    // ============================================================

    async sayLines(lines, callback) {
      // 场景默认背景仍在加载（编排器在 sayLines 前调用 _changeBg，未 await）→
      // 先等背景就绪再播对话，避免首句气泡盖在黑底上
      if (this._bgReady) {
        try { await this._bgReady; } catch (eBg) {}
      }
      if (!lines || lines.length === 0) {
        if (callback) callback();
        return;
      }

      // 剧情开始：隐藏棋盘区域
      this._hideBoardForStory();

      // Filter empty lines and convert all
      const validLines = lines
        .map(line => this._convertLine(line))
        .filter(line => {
          // Keep title cards, items, bg/cg changes even with no text
          if (line.type === 'title' || line.item || line.bg || line.cg) return true;
          // Filter out lines with empty/whitespace-only text
          return line.text && line.text.trim().length > 0;
        });

      if (validLines.length === 0) {
        if (callback) callback();
        return;
      }

      this._queue = validLines;
      this._onComplete = callback;
      this._isPlaying = true;

      // Preload portraits for all speakers in this batch
      const speakers = new Set();
      validLines.forEach(line => {
        if (line.charId) speakers.add(line.charId);
      });
      speakers.forEach(charId => this._preloadPortraits(charId));

      // Reset dialogue history for this scene
      this._dialogueHistory = [];

      // Check if this scene has been read (for auto fast-forward)
      this._checkSceneRead();

      // Show skip button
      this._showSkipButton();

      // 预热本批全部背景图（含首行）：让第一句气泡不必等背景逐张下载
      try {
        validLines.forEach(line => {
          if (line.bg && line.bg !== this._currentBg) {
            let pu = line.bg;
            if (!pu.startsWith('http') && !pu.startsWith('url(') && !pu.startsWith('assets/') && !pu.startsWith('data:') && !pu.startsWith('/')) pu = BG_DIR + pu;
            this._preloadImage(pu);
          }
        });
      } catch (e) {}

      this._playNext();
    }

    nextDialogue() {
      if (!this._isPlaying) return;
      // 背景切换中：气泡尚未渲染，点击不应跳到下一句
      if (this._awaitingBg) return;

      // If CG is visible, hide it first and don't advance dialogue
      if (this._cgVisible) {
        this._hideCg();
        return;
      }

      // If item is visible, hide it first and don't advance dialogue
      if (this._itemVisible) {
        this._hideItem();
        return;
      }

      // If typewriter is running, complete it instantly
      if (this._isTyping) {
        this._completeTypewriter();
        // If voice is still playing, don't advance yet - wait for voice
        if (this._voicePlaying) return;
        this._playNext();
        return;
      }
      // If voice is still playing, skip voice and advance
      if (this._voicePlaying) {
        if (typeof AudioService !== 'undefined') {
          AudioService.voice.stop(50);
        }
        this._voicePlaying = false;
        this._voiceFinished = true;
      }
      this._playNext();
    }

    interrupt() {
      this._clearAllTimers();
      // 解除可能仍在进行的背景等待，避免 _playNext 的 await 永久挂起
      this._awaitingBg = false;
      if (this._bgResolve) { try { this._bgResolve(); } catch (e) {} this._bgResolve = null; }
      this._stopTypewriter();
      // Stop any playing voice
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(50);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._queue = [];
      this._isPlaying = false;
      this._currentDialogue = null;
      this._itemVisible = false;

      // Clean up skip UI
      this._hideSkipButton();
      this._cancelLongPress();

      // Close history panel if open
      this._hideHistoryPanel();

      this._hideAll();
      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // ============================================================
    // === Skip API ===
    // ============================================================

    // Set the current scene key for read-history tracking
    // key format: {chapterId}_{levelId}_{dialogType}  e.g. "1_101_pre"
    setSceneKey(key) {
      this._sceneKey = key;
      if (this._isPlaying) {
        this._checkSceneRead();
      }
    }

    // 查询某场景是否已读（用于隐藏叙事 / 道具分支防重复触发）
    isSceneRead(key) {
      try {
        return !!(key && this._readHistory && this._readHistory[key] === true);
      } catch (e) {
        return false;
      }
    }

    // Enable/disable auto fast-forward for read dialogue
    setAutoSkipEnabled(enabled) {
      this._autoSkipEnabled = enabled;
      this._saveSkipPrefs();
    }

    isAutoSkipEnabled() {
      return this._autoSkipEnabled;
    }

    // Skip all remaining dialogue (used by skip button and long-press)
    skipAll() {
      if (!this._isPlaying) return;

      // Check if we need to show confirmation
      if (!this._skipConfirmationShown && !this._getSkipPrefs().skipConfirmed) {
        this._showSkipConfirmation();
        return;
      }

      this._doSkip();
    }

    _doSkip() {
      // Mark scene as read
      if (this._sceneKey) {
        this._markSceneRead(this._sceneKey);
      }

      // Clear all timers first
      this._clearAllTimers();

      // Stop everything and jump to end
      this._stopTypewriter();
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(30);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._queue = [];
      this._isPlaying = false;
      this._currentDialogue = null;
      this._itemVisible = false;

      this._hideSkipButton();
      this._cancelLongPress();
      this._hideHistoryPanel();
      this._hideAll();

      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // ============================================================
    // === Typewriter (打字机效果) ===
    // ============================================================

    _stopTypewriter() {
      if (this._typewriterTimer) {
        this._clearTimeout(this._typewriterTimer);
        this._typewriterTimer = null;
      }
      this._isTyping = false;
    }

    _completeTypewriter() {
      this._stopTypewriter();
      // Show full text immediately
      const textEl = document.getElementById('dlg-text') || document.getElementById('narrator-text');
      if (textEl && this._currentText) {
        textEl.textContent = this._currentText;
      }
      this._isTyping = false;
      // Show continue arrow when typing completes
      this._showContinueArrow();
    }

    /**
     * Typewriter effect with multiple optimizations:
     * - instant speed: show full text immediately (no per-char setTimeout)
     * - Long text: uses batch textContent update pattern
     * - Sound only plays on non-space characters for more uniform rhythm
     * - Random delay is guaranteed non-negative via Math.max(0, delay)
     * - Supports emotion-based speed for both dialogue and narration
     *
     * @param {HTMLElement} element - Target text element
     * @param {string} text - Text to type out
     * @param {number} speed - Base speed in ms per character
     * @param {Function} callback - Completion callback
     * @param {Object} options - { voiceDuration: number } for VO sync
     */
    _typewrite(element, text, speed, callback, options) {
      // Apply auto fast-forward if scene is read
      let actualSpeed = speed;
      if (this._autoSkipEnabled && this._isCurrentSceneRead && speed > 0) {
        actualSpeed = Math.max(2, Math.floor(speed / 2)); // 2x speed
      }

      // If voice duration is provided, calculate speed to match voice length
      if (options && options.voiceDuration && options.voiceDuration > 0) {
        const charCount = text.replace(/\s/g, '').length;
        if (charCount > 0) {
          // Minimum reasonable duration: 40ms per char for Chinese text
          const minDuration = charCount * 0.04;
          const effectiveDuration = Math.max(options.voiceDuration, minDuration);
          const voiceBasedSpeed = (effectiveDuration * 0.85) / charCount;
          // Use the slower of the two speeds to avoid finishing way too early
          // Also enforce a floor of 25ms/char to prevent unreadably fast typing
          actualSpeed = Math.min(actualSpeed, Math.max(25, voiceBasedSpeed * 1000));
        }
      }

      this._stopTypewriter();
      this._currentText = text;
      this._isTyping = true;

      // Hide continue arrow while typing
      this._hideContinueArrow();

      // Instant mode: show everything at once
      if (actualSpeed <= 0 || actualSpeed === TYPING_SPEEDS.instant) {
        element.textContent = text;
        this._isTyping = false;
        this._typewriterTimer = null;
        this._showContinueArrow();
        if (callback) callback();
        return;
      }

      element.textContent = '';
      let idx = 0;
      let soundCounter = 0;

      const type = () => {
        if (idx >= text.length) {
          this._isTyping = false;
          this._typewriterTimer = null;
          this._showContinueArrow();
          if (callback) callback();
          return;
        }

        // Batch append for long texts (still per-char but using direct textContent +=)
        // For very long texts (>200 chars), append 2 chars at a time for performance
        const batchSize = text.length > 200 ? 2 : 1;
        const endIdx = Math.min(idx + batchSize, text.length);
        const chunk = text.substring(idx, endIdx);
        element.textContent += chunk;

        // Play typewriter sound only on non-space characters (better rhythm)
        // 手感审计：%3→%6，打字机音效密度减半（配合语速 ×2 后每秒响数降为 1/4，不再"密集阵"）
        for (let i = 0; i < chunk.length; i++) {
          const ch = chunk[i];
          if (ch !== ' ' && ch !== '\u3000' && ch !== '\n') {
            soundCounter++;
            if (soundCounter % 6 === 0) {
              if (typeof AudioService !== 'undefined') {
                AudioService.sfx.play('playTypewriterKey');
              }
            }
          }
        }

        idx = endIdx;

        // Random variation for natural feel, guaranteed non-negative
        const delay = Math.max(0, actualSpeed + (Math.random() * 15 - 7));
        this._typewriterTimer = this._setTimeout(type, delay);
      };
      type();
    }

    // ============================================================
    // === Continue Arrow (继续箭头 - 逆转裁判风格) ===
    // ============================================================

    /**
     * Show the blinking "continue" arrow in the dialogue bubble.
     * Ace Attorney style indicator that text is complete and waiting for input.
     */
    _showContinueArrow() {
      if (!this._continueArrowEl) return;
      this._continueArrowEl.style.opacity = '1';
      this._continueArrowEl.style.animationPlayState = 'running';
    }

    /**
     * Hide the continue arrow (e.g. while typing is in progress).
     */
    _hideContinueArrow() {
      if (!this._continueArrowEl) return;
      this._continueArrowEl.style.opacity = '0';
      this._continueArrowEl.style.animationPlayState = 'paused';
    }

    // ============================================================
    // === Internal Playback ===
    // ============================================================

    // 场景就绪通知：scene 首个气泡/旁白渲染时调用，立即移除关卡加载遮罩，
    // 避免 loading 的"最短可见"延迟导致转圈残留并与已显示的剧情对话叠在一起
    _notifySceneReady() {
      try {
        if (typeof window !== 'undefined' && typeof window.hideLoading === 'function') {
          window.hideLoading(true);
        }
      } catch (e) {}
    }

    async _playNext() {
      try {
      this._stopTypewriter();
      // Reset sync state for new line
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;

      // Hide item from previous line if still visible
      if (this._itemVisible) {
        this._hideItem();
      }

      if (this._queue.length === 0) {
        this._endScene();
        return;
      }

      const line = this._queue.shift();
      this._currentDialogue = line;

      // Add to dialogue history
      this._addToHistory(line);

      // Handle background change：先等背景加载并淡入应用完成，再显示气泡，
      // 否则气泡会比背景先出，开局只见黑底对话（背景缺失）
      if (line.bg) {
        this._awaitingBg = true;
        try { await this._changeBg(line.bg); } catch (eBg) { console.warn('[StoryEngine] 背景应用失败:', eBg); }
        this._awaitingBg = false;
      }

      // Handle title card
      if (line.type === 'title') {
        this._showTitleCard(line.text, line.subtitle);
        return;
      }

      // Handle item display
      if (line.item) {
        this._showItem(line.item);
      }

      // Handle CG display (fullscreen illustration)
      if (line.cg) {
        this._showCg(line.cg);
      }

      // Handle explicit SFX (non-typewriter)：逗号分隔多音效逐个播放
      if (line.sfx && line.sfx !== 'playTypewriterKey') {
        if (typeof AudioService !== 'undefined') {
          String(line.sfx).split(',').map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0; })
            .forEach(function (sfxName) {
              try { AudioService.sfx.play(sfxName); } catch (e) { /* 忽略单条失败 */ }
            });
        }
      }

      // Handle narration
      if (line.isNarration || !line.speaker) {
        this._showNarrator(line.text, line);
        return;
      }

      // Handle character dialogue
      this._showDialogue(line);
      } catch (e) {
        console.error('[StoryEngine] _playNext error:', e);
        // 兜底：出错时强制结束场景，避免UI卡死
        this._endScene();
      }
    }

    _endScene() {
      this._clearAllTimers();
      // 强制解除可能仍在进行的背景等待，避免场景结束后面 _playNext 的 await 永久挂起
      this._awaitingBg = false;
      if (this._bgResolve) { try { this._bgResolve(); } catch (e) {} this._bgResolve = null; }
      this._stopTypewriter();
      // Stop any playing voice
      if (this._voicePlaying && typeof AudioService !== 'undefined') {
        AudioService.voice.stop(100);
      }
      this._voicePlaying = false;
      this._voiceFinished = false;
      this._typewriterFinished = false;
      this._isPlaying = false;
      this._currentDialogue = null;
      this._itemVisible = false;

      // Mark scene as read
      if (this._sceneKey) {
        this._markSceneRead(this._sceneKey);
      }

      this._hideSkipButton();
      this._cancelLongPress();
      this._hideHistoryPanel();
      this._hideAll();

      // 剧情结束：恢复棋盘显示
      this._showBoardForStory();

      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }

    // ============================================================
    // === Line Conversion & Data Compatibility ===
    // ============================================================

    _convertLine(line) {
      if (typeof line === 'string') {
        return { text: line, isNarration: true };
      }
      const speaker = line.speaker || '';
      const charId = this._speakerToCharId(speaker);
      // v2.0：强制 side 规则——只要角色可识别就覆盖数据里的 side：
      // 沈墨 left（翻转），其余角色 right（不翻转）。数据层（scripts.json）
      // 若带 side 会被此规则纠正，避免角色出现在错误一侧。
      const forcedSide = (charId && CHAR_SIDE[charId]) ? CHAR_SIDE[charId] : (line.side || 'right');
      // 16:9 宽屏布局：立绘统一放左栏（用户偏好）。flipX 由 side 驱动自动镜像面向中心，
      // 故仅切 side 即可同时完成「左移 + 朝向修正」，不动图片资源。
      let finalSide = forcedSide;
      if (typeof window !== 'undefined' && window.matchMedia
          && window.matchMedia('(min-aspect-ratio: 16/9) and (min-width: 900px)').matches) {
        finalSide = 'left';
      }
      return {
        speaker, charId,
        text: line.text || '',
        emotion: line.emotion || 'default',
        side: finalSide,
        effect: line.effect || 0,
        bg: line.bg || null,
        cg: line.cg || null,
        sfx: line.sfx || null,
        item: line.item || null,
        voiceId: line.voiceId || null,
        isNarration: line.isNarration || !charId,
        type: line.type || null,
        subtitle: line.subtitle || null,
      };
    }

    /**
     * Convert speaker name to character ID with alias/partial matching support.
     * Supports nicknames, shortened names, and case-insensitive matching.
     * @param {string} speaker - Speaker name
     * @returns {string|null} Character ID
     */
    _speakerToCharId(speaker) {
      if (!speaker) return null;

      // Direct exact match first
      if (SPEAKER_ALIASES[speaker]) {
        return SPEAKER_ALIASES[speaker];
      }

      // Try startsWith / includes matching (for nicknames like "沈墨君" -> "shenmo")
      const lowerSpeaker = speaker.toLowerCase();
      for (const [alias, charId] of Object.entries(SPEAKER_ALIASES)) {
        if (alias.length > 1 && (
          lowerSpeaker.includes(alias.toLowerCase()) ||
          alias.toLowerCase().includes(lowerSpeaker)
        )) {
          return charId;
        }
      }

      return null;
    }

    // ============================================================
    // === Display Methods ===
    // ============================================================

    _showTitleCard(title, subtitle) {
      this._initTitleCard();
      this._titleCardEl.style.display = 'flex';
      this._titleCardEl.style.opacity = '1';
      document.getElementById('tc-title').textContent = title || '';
      document.getElementById('tc-subtitle').textContent = subtitle || '';

      // Use tracked timeout for auto-advance
      this._setTimeout(() => {
        if (this._titleCardEl) {
          this._titleCardEl.style.opacity = '0';
        }
        this._setTimeout(() => {
          if (this._titleCardEl) {
            this._titleCardEl.style.display = 'none';
          }
          this._playNext();
        }, 500);
      }, 2500);
    }

    /**
     * Show narrator text with emotion-based typing speed and optional VO.
     * @param {string} text - Narration text
     * @param {Object} line - Full line object (for emotion/voiceId)
     */
    /**
     * 设置语音总开关（false = 只播打字机音效，不播 minimax 配音）
     * @param {boolean} v
     */
    setVoiceEnabled(v) {
      VOICE_ENABLED = !!v;
    }

    _showNarrator(text, line) {
      this._hidePortrait();
      this._hideBubble();
      this._initNarrator();
      this._narratorEl.style.display = 'flex';
      this._narratorEl.style.opacity = '1';
      this._narratorEl.textContent = ''; // Clear previous text

      // Cancel any pending narrator hide timer (race condition fix)
      if (this._narratorHideTimer) {
        this._clearTimeout(this._narratorHideTimer);
        this._narratorHideTimer = null;
      }

      // Use emotion-based speed for narration too (not fixed normal)
      const emotion = line && line.emotion ? line.emotion : 'default';
      const speed = emotionSpeed(emotion);

      // Check for voice ID in narration
      const hasVoice = line && line.voiceId && VOICE_ENABLED && typeof AudioService !== 'undefined';

      if (hasVoice) {
        this._voicePlaying = true;
        this._voiceFinished = false;

        AudioService.voice.play(line.voiceId, {
          onended: () => {
            this._voicePlaying = false;
            this._voiceFinished = true;
            if (this._isTyping) {
              this._completeTypewriter();
            }
          },
          onerror: () => {
            // Voice playback failed - degrade gracefully
            console.warn('[StoryEngine] Voice playback failed for:', line.voiceId);
            this._voicePlaying = false;
            this._voiceFinished = true;
          },
          fadeInMs: 50,
        });

        this._typewrite(this._narratorEl, text, speed, () => {
          this._typewriterFinished = true;
        });
      } else {
        // No voice: just type at emotion-based speed
        this._typewrite(this._narratorEl, text, speed, () => {
          this._typewriterFinished = true;
        });
      }

      // 气泡就绪：背景+旁白文本已可见，解除加载遮罩（game.html 提供 hideLoading）
      this._notifySceneReady();
    }

    _showDialogue(line) {
      this._hideNarrator();
      this._initBubble();
      this._initPortrait();

      // PC 布局适配：将对话框限制在左侧棋盘区域内
      this._adjustBubbleForLayout();

      // Cancel pending bubble hide timer (race condition fix)
      if (this._bubbleHideTimer) {
        this._clearTimeout(this._bubbleHideTimer);
        this._bubbleHideTimer = null;
      }

      // Show portrait with fade transition and preload
      if (line.charId) {
        const portraitFile = this._getPortraitFile(line.charId, line.emotion);
        if (portraitFile) {
          this._showPortraitWithFade(portraitFile, line.side, line.effect);
        }
      } else {
        this._hidePortrait();
      }

      // Show bubble with name
      this._bubbleEl.style.display = 'block';
      this._bubbleEl.style.opacity = '1';
      const nameEl = document.getElementById('dlg-name');
      const textEl = document.getElementById('dlg-text');
      if (nameEl) nameEl.textContent = line.speaker || '';
      if (textEl) textEl.textContent = '';

      // Apply text effect class for important lines (shaking, highlight)
      if (line.effect && textEl) {
        textEl.classList.add('dlg-effect-' + line.effect);
        // Add shake animation for strong emphasis (effect >= 2)
        if (line.effect >= 2) {
          textEl.style.animation = 'textShake 0.3s ease-in-out 2';
          this._setTimeout(() => {
            if (textEl) textEl.style.animation = '';
          }, 600);
        }
      } else if (textEl) {
        textEl.className = '';
      }

      // Calculate typing speed
      const baseSpeed = emotionSpeed(line.emotion);

      // Play VO and sync with typewriter（语音总开关 VOICE_ENABLED）
      const hasVoice = line.voiceId && VOICE_ENABLED && typeof AudioService !== 'undefined';

      if (hasVoice) {
        this._voicePlaying = true;
        this._voiceFinished = false;
        this._typewriterStartTime = Date.now();

        // Try to get voice duration for speed sync (if AudioService provides it)
        let voiceDuration = 0;
        if (AudioService.voice && AudioService.voice.getDuration) {
          voiceDuration = AudioService.voice.getDuration(line.voiceId) || 0;
        }

        // Calculate minimum reasonable duration for this text (40ms per Chinese char)
        const charCount = line.text.replace(/\s/g, '').length;
        const minReasonableDuration = charCount * 0.04; // seconds
        // If voice duration is too short for the text, don't trust it for sync
        const voiceTooShort = voiceDuration > 0 && voiceDuration < minReasonableDuration * 0.6;

        AudioService.voice.play(line.voiceId, {
          onended: () => {
            this._voicePlaying = false;
            this._voiceFinished = true;
            // Only complete typewriter instantly if enough time has passed
            // This prevents short/mismatched voice clips from cutting off text
            if (this._isTyping) {
              const elapsed = (Date.now() - this._typewriterStartTime) / 1000;
              // Minimum time before auto-complete: 35ms per character (readability floor)
              const minTime = (line.text.replace(/\s/g, '').length) * 0.035;
              if (elapsed >= minTime) {
                this._completeTypewriter();
              }
            }
          },
          onerror: () => {
            // Voice playback failed - degrade gracefully
            console.warn('[StoryEngine] Voice playback failed for:', line.voiceId);
            this._voicePlaying = false;
            this._voiceFinished = true;
          },
          fadeInMs: 50,
        });

        // Start typewriter with voice-synced speed if duration available and reliable
        const syncDuration = (voiceDuration > 0 && !voiceTooShort) ? voiceDuration : 0;
        this._typewrite(textEl, line.text, baseSpeed, () => {
          this._typewriterFinished = true;
        }, { voiceDuration: syncDuration });
      } else {
        // No voice: just type at normal speed
        this._typewrite(textEl, line.text, baseSpeed, () => {
          this._typewriterFinished = true;
        });
      }

      // 气泡就绪：背景+对话已可见，解除加载遮罩（game.html 提供 hideLoading）
      this._notifySceneReady();
    }

    /**
     * Show item display. Item visibility blocks dialogue advance until hidden.
     * @param {string} itemId - Item identifier
     */
    _showItem(itemId) {
    this._initItem();
    const itemMap = {
      'file-k734': 'ITEM-01_k734_envelope.jpg',
      'letter_k734': 'ITEM-01_k734_envelope.jpg',
      'k734': 'ITEM-01_k734_envelope.jpg',
      'key': 'item_key.jpg',
      'diary': 'ITEM-03_old_notebook.jpg',
      'notebook': 'ITEM-03_old_notebook.jpg',
      'pen': 'ITEM-02_fountain_pen.jpg',
      'seal': 'ITEM-15_clearance_seal.jpg',
      'scroll': 'item_scroll.jpg',
      'starshuttle': 'item_starshuttle.jpg',
      'unposted_letter': 'item_unposted_letter.jpg',
    };
    const file = itemMap[itemId] || itemId;
    const itemUrl = `assets/images/items/${file}`;

      // Preload item image before showing
      this._preloadImage(itemUrl).then(() => {
        if (!this._itemEl) return;
        this._itemEl.style.backgroundImage = `url('${itemUrl}')`;
        this._itemEl.style.display = 'flex';
        this._itemEl.style.opacity = '0';
        this._itemEl.style.transform = 'translate(-50%, -50%) scale(0.8)';
        this._itemEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

        // Force reflow then fade in with scale
        void this._itemEl.offsetWidth;
        this._itemEl.style.opacity = '1';
        this._itemEl.style.transform = 'translate(-50%, -50%) scale(1)';

        this._itemVisible = true;

        // Auto-hide after a delay, but item remains clickable
        if (this._itemTimer) {
          this._clearTimeout(this._itemTimer);
        }
        this._itemTimer = this._setTimeout(() => {
          // Don't auto-hide; wait for user click instead
          // Item will be hidden when user clicks to advance dialogue
          this._itemTimer = null;
        }, 2500);
      });
    }

    /**
     * Hide the currently displayed item with fade-out animation.
     */
    _hideItem() {
      if (!this._itemEl) {
        this._itemVisible = false;
        return;
      }
      if (this._itemTimer) {
        this._clearTimeout(this._itemTimer);
        this._itemTimer = null;
      }
      this._itemEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      this._itemEl.style.opacity = '0';
      this._itemEl.style.transform = 'translate(-50%, -50%) scale(0.9)';

      const timer = this._setTimeout(() => {
        if (this._itemEl) {
          this._itemEl.style.display = 'none';
          this._itemEl.style.transform = '';
        }
        this._itemVisible = false;
      }, 250);
      this._itemTimer = timer;
    }

    /**
     * Change background with fade transition.
     * Supports multiple path formats: relative paths, data URIs, full URLs.
     * Returns a Promise that resolves once the background is applied（对话气泡等待它）。
     * @param {string} bgValue - Background image path or URL
     */
    _changeBg(bgValue) {
      if (bgValue === this._currentBg) return Promise.resolve();
      this._currentBg = bgValue;
      const body = document.body;
      const app = document.getElementById('app');
      let url = bgValue;

      if (!bgValue.startsWith('http') &&
          !bgValue.startsWith('url(') &&
          !bgValue.startsWith('assets/') &&
          !bgValue.startsWith('data:') &&
          !bgValue.startsWith('/')) {
        url = BG_DIR + bgValue;
      }
      const cssUrl = `url('${url}')`;

      // Preload background image before transition; resolve once applied.
      // resolve 保存在 this._bgResolve，场景结束时由 _endScene 强制触发，避免切换场景永久 await。
      const p = this._preloadImage(url).then(() => new Promise((resolve) => {
        this._bgResolve = resolve;
        // 背景图标一旦应用即 resolve（loading 不必等淡入动画走完全程）；
        // 过渡改为更短的 200ms，降低"点继续→进剧情"的加载等待
        const fadeDuration = 200;
        if (body) {
          body.style.transition = `filter ${fadeDuration}ms ease`;
          body.style.filter = 'brightness(0)';
          this._setTimeout(() => {
            body.style.backgroundImage = cssUrl;
            body.style.backgroundSize = 'cover';
            body.style.backgroundPosition = 'center';
            // Force reflow
            void body.offsetWidth;
            body.style.filter = 'brightness(1)';
            if (this._fadeTimer) this._clearTimeout(this._fadeTimer);
            this._setTimeout(() => { body.style.transition = ''; body.style.filter = ''; }, fadeDuration);
            resolve();
          }, fadeDuration);
        } else {
          resolve();
        }
      }));
      this._bgReady = p;
      return p;
    }

    _getPortraitFile(charId, emotion) {
      const map = PORTRAIT_MAP[charId];
      if (!map) return null;
      // 中文情感词归一化：scripts.json 使用中文 emotion（如"严肃·教学"），
      // PORTRAIT_MAP 使用英文 key，先做映射再查表，差分立绘才能生效
      const key = EMOTION_ZH_MAP[emotion] || emotion || 'default';
      return map[key] || map.default || null;
    }

    /**
     * Show portrait with cross-fade transition.
     * FIX: Preloads the new image first before starting the fade.
     * Also adds bounce animation for emphasis effect.
     *
     * @param {string} portraitFile - Portrait filename (without extension)
     * @param {string} side - 'left' or 'right'
     * @param {number} effect - Effect level (0=normal, 1+=bounce emphasis)
     */
    _showPortraitWithFade(portraitFile, side, effect) {
      if (!this._portraitEl) return;

      // PC 布局适配：将角色立绘限制在左侧棋盘区域内
      this._adjustPortraitForLayout();

      // v2.0：立绘底部动态对齐对话气泡边框顶端——气泡高度随文字行数变化，
      // 固定 bottom(130px) 估算会偏。显示时读取气泡实际高度：
      // 立绘 bottom = 气泡 bottom(20px) + 气泡高度 + 2px 边框余量，
      // 立绘底边恰好贴住气泡边框顶端（立绘在气泡后方，重叠区被气泡盖住）
      try {
        if (this._bubbleEl && this._bubbleEl.offsetHeight > 0) {
          const bh = this._bubbleEl.offsetHeight || 0;
          const portraitBottom = 20 + bh + 2;
          this._portraitEl.style.bottom = 'calc(' + portraitBottom + 'px + env(safe-area-inset-bottom))';
        }
      } catch (ePb) {}

      // If already transitioning, queue the change (prevent race condition)
      if (this._portraitTransitioning) {
        // Store the pending change
        this._pendingPortrait = { file: portraitFile, side, effect };
        return;
      }

      // v2.0：翻转规则——立绘素材全部"朝左看"构图。沈墨在屏幕左侧时脸朝外，
      // 需水平翻转（scaleX(-1)）让脸朝棋盘；其余角色在右侧（素材朝左=朝棋盘）不翻转。
      const isLeft = side === 'left';
      const flipX = isLeft ? '-1' : '1';
      const portraitUrl = `${PORTRAIT_DIR}${portraitFile}.png`;
      const newBg = `url('${portraitUrl}')`;

      // 记录发起显示时的纪元：预加载/淡入窗口内若发生隐藏（场景结束）则放弃本次显示
      const epoch = this._portraitEpoch;
      const epochGuard = () => { return this._portraitEl && this._portraitEpoch === epoch; };

      // Preload the new image first
      this._preloadImage(portraitUrl).then((img) => {
        if (!epochGuard()) return;

        // If a newer portrait was requested during preload, use that instead
        if (this._pendingPortrait) {
          const pending = this._pendingPortrait;
          this._pendingPortrait = null;
          this._showPortraitWithFade(pending.file, pending.side, pending.effect);
          return;
        }

        this._portraitTransitioning = true;

        // If image failed to load, show a fallback (emoji placeholder)
        if (!img) {
          this._portraitEl.style.backgroundImage = 'none';
          this._portraitEl.innerHTML = '<div style="font-size:80px;position:absolute;bottom:20px;left:50%;transform:translateX(-50%);">🖼️</div>';
        } else {
          this._portraitEl.innerHTML = '';
        }

        // If portrait is already visible, cross-fade
        if (this._portraitEl.style.display === 'block' && this._portraitEl.style.opacity !== '0') {
          // Fade out, swap image, fade in
          // v2.0：transition 只保留 opacity——transform（翻转）在淡入前一次性设好，
          // 沈墨(左,scaleX(-1))↔其他(右,scaleX(1)) 切换时无翻转动画
          this._portraitEl.style.transition = 'opacity 0.25s ease';
          this._portraitEl.style.opacity = '0';

          this._setTimeout(() => {
            if (!epochGuard()) return;
            if (img) {
              this._portraitEl.style.backgroundImage = newBg;
            }
            this._portraitEl.style.left = isLeft ? '10px' : '';
            this._portraitEl.style.right = isLeft ? '' : '10px';
            // 翻转在淡入前一次性设好（display 已可见，无翻转动画）
            this._portraitEl.style.setProperty('--flip-x', flipX);
            this._portraitEl.style.transform = 'scaleX(' + flipX + ')';

            // Apply bounce effect for emphasis lines (Ace Attorney style)
            if (effect && effect >= 1) {
              this._portraitEl.style.animation = 'portraitBounce 0.4s ease-out';
            } else {
              this._portraitEl.style.animation = '';
            }

            // Force reflow then fade in
            void this._portraitEl.offsetWidth;
            this._portraitEl.style.opacity = '1';

            // Clear transition state after animation
            this._setTimeout(() => {
                if (!epochGuard()) return;
                this._portraitTransitioning = false;
                this._portraitEl.style.animation = '';
                // Check if there's a pending change
                if (this._pendingPortrait) {
                  const pending = this._pendingPortrait;
                  this._pendingPortrait = null;
                  this._showPortraitWithFade(pending.file, pending.side, pending.effect);
                }
              }, 300);
          }, 250);
        } else {
          // Fresh display: set image then fade in
          if (img) {
            this._portraitEl.style.backgroundImage = newBg;
          }
          this._portraitEl.style.left = isLeft ? '10px' : '';
          this._portraitEl.style.right = isLeft ? '' : '10px';
          // v2.0：翻转在淡入前设好（沈墨左 scaleX(-1)、其他右 scaleX(1)），无翻转动画
          this._portraitEl.style.setProperty('--flip-x', flipX);
          this._portraitEl.style.transform = 'scaleX(' + flipX + ')';
          this._portraitEl.style.opacity = '0';
          this._portraitEl.style.display = 'block';
          // v2.0：transition 只保留 opacity（与 cross-fade 分支一致，杜绝翻转动画）
          this._portraitEl.style.transition = 'opacity 0.3s ease';

          // Bounce effect for emphasis
          if (effect && effect >= 1) {
            this._portraitEl.style.animation = 'portraitBounce 0.4s ease-out';
          }

          // Force reflow
          void this._portraitEl.offsetWidth;
          this._portraitEl.style.opacity = '1';

          this._setTimeout(() => {
            if (!epochGuard()) return;
            this._portraitTransitioning = false;
            this._portraitEl.style.animation = '';
            // Check if there's a pending change
            if (this._pendingPortrait) {
              const pending = this._pendingPortrait;
              this._pendingPortrait = null;
              this._showPortraitWithFade(pending.file, pending.side, pending.effect);
            }
          }, 300);
        }
      });
    }

    _hidePortrait() {
      if (!this._portraitEl) return;
      // 递增隐藏纪元：任何在途预加载回调看到纪元变化都应放弃重新显示
      this._portraitEpoch++;

      // PC 布局适配：确保立绘在正确的父容器中
      this._adjustPortraitForLayout();

      // Cancel any pending portrait hide (race condition fix)
      if (this._portraitHideTimer) {
        this._clearTimeout(this._portraitHideTimer);
        this._portraitHideTimer = null;
      }

      if (this._portraitEl.style.display === 'none' || this._portraitEl.style.opacity === '0') {
        this._portraitEl.style.display = 'none';
        this._portraitTransitioning = false;
        return;
      }
      this._portraitEl.style.transition = 'opacity 0.25s ease';
      this._portraitEl.style.opacity = '0';
      this._portraitTransitioning = true;

      this._portraitHideTimer = this._setTimeout(() => {
        if (this._portraitEl) {
          this._portraitEl.style.display = 'none';
        }
        this._portraitTransitioning = false;
        this._portraitHideTimer = null;
      }, 250);
    }

    _hideBubble() {
      if (!this._bubbleEl) return;

      // PC 布局适配：确保对话框在正确的父容器中
      this._adjustBubbleForLayout();

      // Cancel pending hide timer (race condition fix)
      if (this._bubbleHideTimer) {
        this._clearTimeout(this._bubbleHideTimer);
        this._bubbleHideTimer = null;
      }

      if (this._bubbleEl.style.display === 'none') return;
      this._bubbleEl.style.transition = 'opacity 0.2s ease';
      this._bubbleEl.style.opacity = '0';

      this._bubbleHideTimer = this._setTimeout(() => {
        if (this._bubbleEl) {
          this._bubbleEl.style.display = 'none';
          this._bubbleEl.style.opacity = '';
          this._bubbleEl.style.transition = '';
        }
        this._bubbleHideTimer = null;
      }, 200);
    }

    _hideNarrator() {
      if (!this._narratorEl) return;

      // Cancel pending hide timer (race condition fix)
      if (this._narratorHideTimer) {
        this._clearTimeout(this._narratorHideTimer);
        this._narratorHideTimer = null;
      }

      if (this._narratorEl.style.display === 'none') return;
      this._narratorEl.style.transition = 'opacity 0.25s ease';
      this._narratorEl.style.opacity = '0';

      this._narratorHideTimer = this._setTimeout(() => {
        if (this._narratorEl) {
          this._narratorEl.style.display = 'none';
          this._narratorEl.style.opacity = '';
          this._narratorEl.style.transition = '';
        }
        this._narratorHideTimer = null;
      }, 250);
    }

    _hideAll() {
      this._hidePortrait();
      this._hideBubble();
      this._hideNarrator();
      this._hideItem();
      if (this._cgEl) { this._cgEl.style.display = 'none'; this._cgVisible = false; }
      if (this._chibiEl) { this._chibiEl.style.display = 'none'; this._chibiVisible = false; }
      if (this._titleCardEl) this._titleCardEl.style.display = 'none';
      if (this._itemEl) this._itemEl.style.display = 'none';
    }

    // 剧情播放时隐藏棋盘（避免棋盘黑框干扰剧情演出）
    _hideBoardForStory() {
      // 兼容 V4 新布局（game.html 使用 #board-container / #pad / #statusLine / #toolRoll）
      const boardContainer = document.getElementById('board-container');
      const pad = document.getElementById('pad');
      const statusLine = document.getElementById('statusLine');
      const toolRoll = document.getElementById('toolRoll');
      if (boardContainer && statusLine) {
        // 2026-08-19 修正（用户截图反馈：剧情模式中键盘+工具栏露出且拉长）：
        // sayLines 仅用于序章/前置对话/后置对话等全屏剧情场景；
        // 教学引导走 LessonPlayer 自己的 _bubbleEl（独立 DOM，不经过这里），
        // 故恢复隐藏 #pad / #toolRoll 不影响教学可用性，且能避免剧情时露出拉长的工具栏。
        this._boardHiddenElements = {
          'board-container': boardContainer.style.display,
          'statusLine': statusLine.style.display,
          'pad': pad ? pad.style.display : '',
          'toolRoll': toolRoll ? toolRoll.style.display : '',
        };
        boardContainer.style.display = 'none';
        statusLine.style.display = 'none';
        if (pad) pad.style.display = 'none';
        if (toolRoll) toolRoll.style.display = 'none';
        return;
      }

      // 判断当前是否为PC布局：检查pc-workspace是否可见
      const pcWorkspace = document.getElementById('pc-workspace');
      const isPcLayout = pcWorkspace && window.getComputedStyle(pcWorkspace).display !== 'none';

      if (isPcLayout) {
        const pcLeftPanel = document.getElementById('pc-left-panel');
        if (pcLeftPanel) {
          this._prevBoardDisplay = pcLeftPanel.style.display;
          this._boardHiddenElement = 'pc-left-panel';
          pcLeftPanel.style.display = 'none';
          return;
        }
      }
      const boardArea = document.getElementById('board-area');
      if (boardArea) {
        this._prevBoardDisplay = boardArea.style.display;
        this._boardHiddenElement = 'board-area';
        boardArea.style.display = 'none';
      }
    }

    // 剧情结束时恢复棋盘显示
    _showBoardForStory() {
      // 兼容 V4 新布局
      if (this._boardHiddenElements) {
        Object.entries(this._boardHiddenElements).forEach(([id, display]) => {
          const el = document.getElementById(id);
          if (el) el.style.display = display || '';
        });
        this._boardHiddenElements = null;
        return;
      }

      if (this._boardHiddenElement === 'pc-left-panel') {
        const pcLeftPanel = document.getElementById('pc-left-panel');
        if (pcLeftPanel) {
          pcLeftPanel.style.display = this._prevBoardDisplay || '';
        }
      } else {
        const boardArea = document.getElementById('board-area');
        if (boardArea) {
          boardArea.style.display = this._prevBoardDisplay || '';
        }
      }
      this._prevBoardDisplay = null;
      this._boardHiddenElement = null;
    }

    // ============================================================
    // === Dialogue History (对话历史记录 - 逆转裁判风格回看法庭记录) ===
    // ============================================================

    /**
     * Add a line to the dialogue history (backlog).
     * @param {Object} line - Converted line object
     */
    _addToHistory(line) {
      if (!line || (!line.text && line.type !== 'title')) return;

      const entry = {
        speaker: line.speaker || (line.isNarration ? '旁白' : ''),
        text: line.text || '',
        emotion: line.emotion || 'default',
        timestamp: Date.now(),
      };

      this._dialogueHistory.push(entry);

      // Keep history within max size
      if (this._dialogueHistory.length > this._maxHistoryItems) {
        this._dialogueHistory.shift();
      }
    }

    /**
     * Toggle the dialogue history panel (backlog review).
     * Ace Attorney style "court record" review for dialogue.
     */
    toggleHistory() {
      if (this._historyPanelEl && this._historyPanelEl.style.display === 'flex') {
        this._hideHistoryPanel();
      } else {
        this._showHistoryPanel();
      }
    }

    /**
     * Show the dialogue history panel.
     */
    _showHistoryPanel() {
      this._initHistoryPanel();
      if (!this._historyPanelEl) return;

      // Populate history
      const listEl = this._historyPanelEl.querySelector('#history-list');
      if (listEl) {
        listEl.innerHTML = '';
        this._dialogueHistory.forEach(entry => {
          const item = document.createElement('div');
          // P2：历史记录行 = 纸上墨线（去金色/深蓝灰）
          item.style.cssText = 'padding:10px 0;border-bottom:1px solid rgba(90,70,40,0.25);';
          if (entry.speaker) {
            const nameSpan = document.createElement('div');
            nameSpan.style.cssText = 'color:#a3352a;font-size:13px;font-weight:bold;margin-bottom:4px;font-family:\'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif;';
            nameSpan.textContent = entry.speaker;
            item.appendChild(nameSpan);
          }
          const textSpan = document.createElement('div');
          textSpan.style.cssText = 'color:#4a3520;font-size:14px;line-height:1.6;';
          textSpan.textContent = entry.text;
          item.appendChild(textSpan);
          listEl.appendChild(item);
        });
        // Scroll to bottom
        listEl.scrollTop = listEl.scrollHeight;
      }

      this._historyPanelEl.style.display = 'flex';
      requestAnimationFrame(() => {
        if (this._historyPanelEl) {
          this._historyPanelEl.style.opacity = '1';
        }
      });
    }

    /**
     * Hide the dialogue history panel.
     */
    _hideHistoryPanel() {
      if (!this._historyPanelEl) return;
      if (this._historyPanelEl.style.display === 'none') return;
      this._historyPanelEl.style.opacity = '0';
      this._setTimeout(() => {
        if (this._historyPanelEl) {
          this._historyPanelEl.style.display = 'none';
        }
      }, 200);
    }

    /**
     * Initialize the history panel DOM element.
     */
    _initHistoryPanel() {
      if (this._historyPanelEl) return;

      const panel = document.createElement('div');
      panel.id = 'story-history-panel';
      // P2：对话记录面板 = 夹页纸（去毛玻璃/深蓝灰）
      panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(20,14,8,0.8);z-index:100013;' +
        'display:none;flex-direction:column;align-items:center;justify-content:center;' +
        'opacity:0;transition:opacity 0.2s ease;';

      panel.innerHTML =
        '<div style="width:90%;max-width:500px;max-height:75vh;' +
        'background-color:#f5f0e0;' +
        'background-image:repeating-linear-gradient(45deg, rgba(200,190,170,0.04) 0px, rgba(200,190,170,0.04) 1px, transparent 1px, transparent 3px);' +
        'border:1px solid rgba(61,47,34,0.55);border-radius:8px;' +
        'box-shadow:0 12px 34px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.3), inset 0 0 20px rgba(120,100,70,0.15);' +
        'padding:20px;display:flex;flex-direction:column;">' +
        '<div style="color:#3d2a1a;font-size:18px;font-weight:bold;' +
        'margin-bottom:12px;letter-spacing:2px;text-align:center;font-family:\'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif;">对话记录</div>' +
        '<div id="history-list" style="flex:1;overflow-y:auto;padding:4px;' +
        'max-height:60vh;color:#4a3520;"></div>' +
        '<div style="text-align:center;margin-top:12px;">' +
        '<button id="history-close-btn" style="padding:8px 24px;' +
        'background:linear-gradient(180deg,#d9a94f,#b8860b);border:1px solid #8a6a3a;' +
        'border-radius:6px;color:#241a10;cursor:pointer;font-size:14px;font-weight:600;">关闭</button>' +
        '</div></div>';

      panel.addEventListener('click', (e) => {
        if (e.target === panel) {
          this._hideHistoryPanel();
        }
      });

      document.body.appendChild(panel);
      this._historyPanelEl = panel;

      // Close button
      const closeBtn = panel.querySelector('#history-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._hideHistoryPanel();
        });
      }
    }

    // ============================================================
    // === Skip Button ===
    // ============================================================

    _showSkipButton() {
      this._initSkipButton();
      // 无跳过按钮（长按跳过方案），_skipBtnEl 恒 null，直接返回
      if (!this._skipBtnEl) return;

      // Cancel pending hide timer (race condition fix)
      if (this._skipBtnHideTimer) {
        this._clearTimeout(this._skipBtnHideTimer);
        this._skipBtnHideTimer = null;
      }

      this._skipBtnEl.style.display = 'flex';
      // Fade in
      requestAnimationFrame(() => {
        if (this._skipBtnEl) {
          this._skipBtnEl.style.opacity = '1';
        }
      });
    }

    _hideSkipButton() {
      if (!this._skipBtnEl) return;

      // Cancel pending hide timer (race condition fix)
      if (this._skipBtnHideTimer) {
        this._clearTimeout(this._skipBtnHideTimer);
        this._skipBtnHideTimer = null;
      }

      this._skipBtnEl.style.opacity = '0';
      this._skipBtnHideTimer = this._setTimeout(() => {
        if (this._skipBtnEl) {
          this._skipBtnEl.style.display = 'none';
        }
        this._skipBtnHideTimer = null;
      }, 200);
    }

    _initSkipButton() {
      if (this._skipBtnEl) return;

      // v2.0：去掉跳过按钮（用户反馈"跳过按钮和长按跳过留一个就行，去按钮屏幕干净"）——
      // 剧情跳过统一由长按（气泡/立绘/旁白长按 1000ms）触发，不占用屏幕。
      // 长按跳过对所有剧情（开场/前置/关后/尾声）全局生效。
      this._setupLongPress();
      this._injectAnimations();
    }

    /**
     * Inject CSS keyframe animations for visual effects.
     * Ace Attorney style: portrait bounce, text shake, blinking arrow.
     */
    _injectAnimations() {
      if (document.getElementById('story-engine-animations')) return;

      const style = document.createElement('style');
      style.id = 'story-engine-animations';
      style.textContent = `
        /* Portrait bounce animation (Ace Attorney objection style) */
        @keyframes portraitBounce {
          0% { transform: scaleX(var(--flip-x, 1)) translateY(0); }
          30% { transform: scaleX(var(--flip-x, 1)) translateY(-12px) scale(1.03); }
          60% { transform: scaleX(var(--flip-x, 1)) translateY(4px) scale(0.99); }
          100% { transform: scaleX(var(--flip-x, 1)) translateY(0); }
        }

        /* Text shake animation for important lines */
        @keyframes textShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }

        /* Blinking continue arrow (▼) */
        @keyframes blinkArrow {
          0%, 100% { opacity: 1; transform: translateY(0); }
          50% { opacity: 0.3; transform: translateY(3px); }
        }

        .continue-arrow-blink {
          animation: blinkArrow 1s ease-in-out infinite;
        }

        /* Highlight effect for important text（P2：去发光，改纸面加粗墨色/朱砂） */
        .dlg-effect-1 {
          color: #a3352a;
          font-weight: 700;
        }

        .dlg-effect-2 {
          color: #8e2c21;
          font-weight: 700;
        }
      `;
      document.head.appendChild(style);
    }

    // ============================================================
    // === Long Press Skip ===
    // ============================================================

    _setupLongPress() {
      // Long press on dialogue bubble or narrator to skip
      const self = this;

      function onPointerDown(e) {
        if (!self._isPlaying) return;
        // Don't trigger on skip button itself or other interactive elements
        if (e.target.closest('#story-skip-btn, button, .num-btn, #num-pad, #chapter-select-overlay, #story-history-panel, #skip-confirmation')) return;
        // Only trigger on dialogue/narrator area
        if (!e.target.closest('#dialogue-bubble, #narrator-text, #story-portrait, #story-item')) return;

        // If item is visible, don't start long press (item click hides item)
        if (self._itemVisible) return;

        self._startLongPress(e);
      }

      function onPointerUp(e) {
        self._cancelLongPress();
      }

      function onPointerMove(e) {
        if (self._isLongPressing) {
          // If moved too much, cancel
          const dx = e.clientX - self._longPressStartX;
          const dy = e.clientY - self._longPressStartY;
          if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
            self._cancelLongPress();
          }
        }
      }

      document.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      document.addEventListener('pointerleave', onPointerUp);
      document.addEventListener('pointermove', onPointerMove);

      // v2.0：touch 事件兜底（移动端 WebView 的 PointerEvent 兼容 bug——
      // 老内核只派发 touch 事件，pointer 全部静默；原长按跳过在手机上会失效）
      function onTouchStart(e) {
        const t = e.touches && e.touches[0];
        if (!t) return;
        onPointerDown({ target: e.target, clientX: t.clientX, clientY: t.clientY });
      }
      function onTouchEnd() { onPointerUp(); }
      function onTouchMove(e) {
        if (!self._isLongPressing) return;
        const t = e.changedTouches && e.changedTouches[0];
        if (t) onPointerMove({ clientX: t.clientX, clientY: t.clientY });
      }
      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchend', onTouchEnd, { passive: true });
      document.addEventListener('touchcancel', onTouchEnd, { passive: true });
      document.addEventListener('touchmove', onTouchMove, { passive: true });
    }

    _startLongPress(e) {
      if (this._isLongPressing) return;
      this._isLongPressing = true;
      this._longPressStart = Date.now();
      this._longPressStartX = e.clientX;
      this._longPressStartY = e.clientY;

      this._showLongPressProgress(e.clientX, e.clientY);

      const self = this;
      this._longPressTimer = this._setInterval(() => {
        const elapsed = Date.now() - self._longPressStart;
        const pct = Math.min(100, (elapsed / self._longPressDuration) * 100);
        self._updateLongPressProgress(pct);

        if (elapsed >= self._longPressDuration) {
          self._completeLongPress();
        }
      }, 16);
    }

    _cancelLongPress() {
      if (!this._isLongPressing) return;
      this._isLongPressing = false;
      if (this._longPressTimer) {
        this._clearInterval(this._longPressTimer);
        this._longPressTimer = null;
      }
      this._hideLongPressProgress();
    }

    _completeLongPress() {
      if (this._longPressTimer) {
        this._clearInterval(this._longPressTimer);
        this._longPressTimer = null;
      }
      this._isLongPressing = false;
      this._hideLongPressProgress();
      this.skipAll();
    }

    _showLongPressProgress(x, y) {
      let el = document.getElementById('long-press-progress');
      if (!el) {
        el = document.createElement('div');
        el.id = 'long-press-progress';
        el.style.cssText = 'position:fixed;width:80px;height:80px;' +
          'border-radius:50%;pointer-events:none;z-index:100015;' +
          'display:none;transform:translate(-50%,-50%);';
        el.innerHTML =
          '<svg width="80" height="80" viewBox="0 0 80 80">' +
          '<circle cx="40" cy="40" r="36" fill="none" stroke="rgba(184,134,11,0.25)" stroke-width="4"/>' +
          '<circle id="lp-progress-ring" cx="40" cy="40" r="36" fill="none" stroke="#d4a853" stroke-width="4"' +
          ' stroke-dasharray="226" stroke-dashoffset="226" stroke-linecap="round"' +
          ' transform="rotate(-90 40 40)"/>' +
          '</svg>' +
          '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
          'font-size:10px;color:#d4a853;letter-spacing:1px;">跳过</div>';
        document.body.appendChild(el);
      }
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.display = 'block';
      this._longPressProgressEl = el;
    }

    _updateLongPressProgress(pct) {
      if (!this._longPressProgressEl) return;
      const ring = this._longPressProgressEl.querySelector('#lp-progress-ring');
      if (ring) {
        const circumference = 2 * Math.PI * 36; // ~226
        const offset = circumference * (1 - pct / 100);
        ring.style.strokeDashoffset = offset;
      }
    }

    _hideLongPressProgress() {
      if (this._longPressProgressEl) {
        this._longPressProgressEl.style.display = 'none';
      }
    }

    // ============================================================
    // === Skip Confirmation ===
    // ============================================================

    _showSkipConfirmation() {
      const existing = document.getElementById('skip-confirmation');
      if (existing) return;

      const overlay = document.createElement('div');
      overlay.id = 'skip-confirmation';
      // P2：遮罩去毛玻璃，改暖褐夜视
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(20,14,8,0.75);z-index:100016;' +
        'display:flex;align-items:center;justify-content:center;';

      const dialog = document.createElement('div');
      // P2：跳过确认 = 纸笺（去毛玻璃/深蓝灰）
      dialog.style.cssText = 'background-color:#f5f0e0;' +
        'background-image:repeating-linear-gradient(45deg, rgba(200,190,170,0.04) 0px, rgba(200,190,170,0.04) 1px, transparent 1px, transparent 3px);' +
        'border:1px solid rgba(61,47,34,0.55);border-radius:8px;' +
        'padding:28px;max-width:380px;width:90%;text-align:center;' +
        'box-shadow:0 16px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.3), inset 0 0 20px rgba(120,100,70,0.15);' +
        'color:#3d2f22;';

      dialog.innerHTML =
        '<div style="font-size:32px;margin-bottom:16px;">⏭️</div>' +
        '<div style="font-size:18px;font-weight:700;color:#3d2a1a;' +
        'margin-bottom:12px;letter-spacing:1px;font-family:\'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif;">确定要跳过这段剧情吗？</div>' +
        '<div style="font-size:13px;color:#75603f;margin-bottom:24px;line-height:1.6;">' +
        '跳过之后将无法回看这段剧情内容。<br>建议首次游玩时完整观看。</div>' +
        '<label style="display:flex;align-items:center;justify-content:center;' +
        'gap:8px;margin-bottom:24px;cursor:pointer;font-size:13px;color:#6b5a42;">' +
        '<input type="checkbox" id="skip-dont-show-again" style="accent-color:#b8860b;">' +
        '不再提示</label>' +
        '<div style="display:flex;gap:12px;justify-content:center;">' +
        '<button id="skip-cancel-btn" style="padding:10px 24px;border:1px solid rgba(90,70,40,0.6);' +
        'background:transparent;color:#5a4630;border-radius:6px;cursor:pointer;' +
        'font-size:14px;transition:all 0.2s;">取消</button>' +
        '<button id="skip-confirm-btn" style="padding:10px 24px;border:1px solid #8a6a3a;' +
        'background:linear-gradient(180deg,#d9a94f,#b8860b);color:#241a10;border-radius:6px;' +
        'cursor:pointer;font-size:14px;font-weight:600;transition:all 0.2s;">确认跳过</button>' +
        '</div>';

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const self = this;

      document.getElementById('skip-cancel-btn').addEventListener('click', () => {
        overlay.remove();
      });

      document.getElementById('skip-confirm-btn').addEventListener('click', () => {
        const dontShow = document.getElementById('skip-dont-show-again').checked;
        if (dontShow) {
          self._setSkipConfirmed();
        }
        overlay.remove();
        self._doSkip();
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
        }
      });
    }

    // ============================================================
    // === Read History / Auto Skip ===
    // ============================================================

    _loadReadHistory() {
      try {
        const raw = localStorage.getItem(READ_STORAGE_KEY);
        if (raw) {
          this._readHistory = JSON.parse(raw);
        } else {
          this._readHistory = {};
        }
      } catch (e) {
        this._readHistory = {};
      }
    }

    _saveReadHistory() {
      try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(this._readHistory));
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[StoryEngine] Storage quota exceeded on read history save');
        }
      }
    }

    _checkSceneRead() {
      if (!this._sceneKey) {
        this._isCurrentSceneRead = false;
        return;
      }
      this._isCurrentSceneRead = this._readHistory[this._sceneKey] === true;
    }

    _markSceneRead(key) {
      if (!key) return;
      if (this._readHistory[key]) return; // already marked
      this._readHistory[key] = true;
      this._saveReadHistory();
    }

    _getReadHistory() {
      return this._readHistory;
    }

    // ============================================================
    // === Skip Preferences ===
    // ============================================================

    _loadSkipPrefs() {
      try {
        const raw = localStorage.getItem(SKIP_STORAGE_KEY);
        if (raw) {
          const prefs = JSON.parse(raw);
          this._skipConfirmationShown = prefs.skipConfirmed === true;
          if (typeof prefs.autoSkipEnabled === 'boolean') {
            this._autoSkipEnabled = prefs.autoSkipEnabled;
          }
        }
      } catch (e) {}
    }

    _saveSkipPrefs() {
      try {
        const prefs = this._getSkipPrefs();
        localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(prefs));
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[StoryEngine] Storage quota exceeded on skip prefs save');
        }
      }
    }

    _getSkipPrefs() {
      try {
        const raw = localStorage.getItem(SKIP_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { skipConfirmed: false, autoSkipEnabled: true };
    }

    _setSkipConfirmed() {
      const prefs = this._getSkipPrefs();
      prefs.skipConfirmed = true;
      prefs.autoSkipEnabled = this._autoSkipEnabled;
      try {
        localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(prefs));
        this._skipConfirmationShown = true;
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('[StoryEngine] Storage quota exceeded on skip confirm save');
        }
      }
    }

    // ============================================================
    // === PC 布局适配 ===
    // ============================================================

    /**
     * 根据当前布局调整角色立绘的父元素和定位方式
     * - 移动端：position: fixed，父元素为 body
     * - PC 布局：position: absolute，父元素为 #pc-board-container，限制在左侧棋盘区域
     */
    _adjustPortraitForLayout() {
      if (!this._portraitEl) return;

      const isPc = typeof window._isPcLayout !== 'undefined' ? window._isPcLayout : false;
      const pcBoard = document.getElementById('pc-board-container');
      const currentParent = this._portraitEl.parentNode;

      if (isPc && pcBoard && currentParent !== pcBoard) {
        // 切换到 PC 布局：移动到棋盘容器，改用 absolute 定位
        pcBoard.appendChild(this._portraitEl);
        this._portraitEl.style.position = 'absolute';
        // v2.0：立绘完全在对话框上方（对话框约 80px 高，原 100px 仍会被顶到）
        this._portraitEl.style.bottom = '110px';
        this._portraitEl.style.maxHeight = 'calc(100% - 130px)';
        // 宽度稍微缩小以适应棋盘区域
        this._portraitEl.style.width = 'clamp(120px, 20%, 180px)';
        this._portraitEl.style.height = 'clamp(180px, 55%, 300px)';
        // 立绘靠右显示
        this._portraitEl.style.left = '';
        this._portraitEl.style.right = '5px';
        // z-index 适当降低（在棋盘容器内）
        this._portraitEl.style.zIndex = '100009';
      } else if (!isPc && currentParent && currentParent !== document.body) {
        // 切换回移动端：移回 body，恢复 fixed 定位
        document.body.appendChild(this._portraitEl);
        this._portraitEl.style.position = 'fixed';
        // v2.0：立绘底部吸附气泡顶端（bottom 130px 贴气泡上缘）+ z-index 高于气泡
        this._portraitEl.style.bottom = 'calc(130px + env(safe-area-inset-bottom))';
        this._portraitEl.style.maxHeight = 'calc(100vh - 170px - env(safe-area-inset-bottom))';
        this._portraitEl.style.width = 'clamp(180px, 28vw, 280px)';
        this._portraitEl.style.height = 'clamp(270px, 42vh, 420px)';
        this._portraitEl.style.left = '';
        this._portraitEl.style.right = '';
        // v2.0：z-index 9990 低于气泡（10000），气泡文字不被立绘遮挡
        this._portraitEl.style.zIndex = '100009';
      }
    }

    /**
     * 根据当前布局调整对话框的父元素和定位方式
     * - 移动端：position: fixed + left:50% 居中，父元素为 body
     * - PC 布局：position: absolute，限制在 #pc-board-container 底部，不超出左侧范围
     */
    _adjustBubbleForLayout() {
      if (!this._bubbleEl) return;

      const isPc = typeof window._isPcLayout !== 'undefined' ? window._isPcLayout : false;
      const pcBoard = document.getElementById('pc-board-container');
      const currentParent = this._bubbleEl.parentNode;

      if (isPc && pcBoard && currentParent !== pcBoard) {
        // 切换到 PC 布局：移动到棋盘容器底部，改用 absolute 定位
        pcBoard.appendChild(this._bubbleEl);
        this._bubbleEl.style.position = 'absolute';
        this._bubbleEl.style.left = '50%';
        this._bubbleEl.style.transform = 'translateX(-50%)';
        this._bubbleEl.style.bottom = '10px';
        this._bubbleEl.style.width = '94%';
        this._bubbleEl.style.maxWidth = 'none';
        // 适当减小内边距和字体以适应棋盘区域
        this._bubbleEl.style.padding = '14px 18px';
        this._bubbleEl.style.fontSize = '15px';
        this._bubbleEl.style.lineHeight = '1.6';
        this._bubbleEl.style.minHeight = '50px';
        // z-index 适当降低
        this._bubbleEl.style.zIndex = '100010';
      } else if (!isPc && currentParent && currentParent !== document.body) {
        // 切换回移动端：移回 body，恢复 fixed 定位
        document.body.appendChild(this._bubbleEl);
        this._bubbleEl.style.position = 'fixed';
        this._bubbleEl.style.left = '50%';
        this._bubbleEl.style.transform = 'translateX(-50%)';
        this._bubbleEl.style.bottom = 'calc(20px + env(safe-area-inset-bottom))';
        this._bubbleEl.style.width = '92%';
        this._bubbleEl.style.maxWidth = '650px';
        this._bubbleEl.style.padding = '18px 22px';
        this._bubbleEl.style.fontSize = '17px';
        this._bubbleEl.style.lineHeight = '1.7';
        this._bubbleEl.style.minHeight = '60px';
        this._bubbleEl.style.zIndex = '100010';
      }
    }

    // ============================================================
    // === DOM Initialization ===
    // ============================================================

    _initPortrait() {
      if (this._portraitEl) return;
      this._portraitEl = document.createElement('div');
      this._portraitEl.id = 'story-portrait';
      // MOBILE FIX: responsive sizing with vh and max constraints, safe-area bottom support
      this._portraitEl.style.cssText = 'position:fixed;' +
        'right:10px;' +
        // v2.0：立绘底部吸附对话气泡顶端——气泡 bottom 20px、高约 96-120px，
        // 立绘 bottom 130px 刚好贴住气泡上缘，不留间距
        'bottom:calc(130px + env(safe-area-inset-bottom));' +
        'width:clamp(180px, 28vw, 280px);' +
        'height:clamp(270px, 42vh, 420px);' +
        'max-height:calc(100vh - 170px - env(safe-area-inset-bottom));' +
        'background-size:contain;' +
        'background-repeat:no-repeat;' +
        'background-position:bottom right;' +
        // v2.0：立绘 z-index 9990 低于对话气泡（10000）——气泡文字永远清晰可读，
        // 立绘身体与气泡重叠部分被气泡盖住（"立绘在后、气泡在前"）
        'z-index:100009;' +
        'display:none;' +
        'transition:opacity 0.3s;' +
        '--flip-x:1;' +
        'transform:scaleX(var(--flip-x));' +
        'pointer-events:none;';
      document.body.appendChild(this._portraitEl);
    }

    _initBubble() {
      if (this._bubbleEl) return;
      this._bubbleEl = document.createElement('div');
      this._bubbleEl.id = 'dialogue-bubble';
      // MOBILE FIX: safe-area bottom support
      // P2：对话气泡 = 半透明旧纸笺（纸底 + 细墨边 + 纸厚内阴影，去毛玻璃/深蓝灰）
      this._bubbleEl.style.cssText = 'position:fixed;' +
        'bottom:calc(20px + env(safe-area-inset-bottom));' +
        'left:50%;transform:translateX(-50%);' +
        'width:92%;max-width:650px;' +
        'background-color:rgba(245,240,224,0.96);' +
        'background-image:' +
        'repeating-linear-gradient(45deg, rgba(200,190,170,0.04) 0px, rgba(200,190,170,0.04) 1px, transparent 1px, transparent 3px),' +
        'repeating-linear-gradient(-45deg, rgba(200,190,170,0.03) 0px, rgba(200,190,170,0.03) 1px, transparent 1px, transparent 4px);' +
        'border:1px solid rgba(61,47,34,0.55);' +
        'border-radius:8px;' +
        'padding:16px 20px;' +
        'padding-bottom:calc(16px + env(safe-area-inset-bottom) * 0.3);' +
        'z-index:100010;' +
        'display:none;' +
        'color:#3d2f22;font-size:17px;line-height:1.7;' +
        'font-family:\'KaiTi\',\'楷体\',\'STKaiti\',\'PingFang SC\',serif;' +
        'min-height:60px;' +
        'box-shadow:0 8px 24px rgba(0,0,0,0.45),' +
        'inset 0 0 0 1px rgba(255,255,255,0.30),' +
        'inset 0 0 20px rgba(120,100,70,0.15);';

      this._bubbleEl.innerHTML =
        '<div id="dlg-name" style="color:#a3352a;font-weight:bold;margin-bottom:10px;font-size:15px;padding-right:70px;font-family:\'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif;letter-spacing:1px;"></div>' +
        '<div id="dlg-text" style="min-height:26px;color:#3d2f22;"></div>' +
        '<div class="continue-arrow-blink" id="continue-arrow" style="text-align:right;font-size:14px;color:#75603f;margin-top:8px;opacity:0;transition:opacity 0.2s;">▼ 点击继续</div>';

      this._bubbleEl.addEventListener('click', () => this.nextDialogue());
      document.body.appendChild(this._bubbleEl);

      // Cache continue arrow element
      this._continueArrowEl = document.getElementById('continue-arrow');
    }

    _initNarrator() {
      if (this._narratorEl) return;
      this._narratorEl = document.createElement('div');
      this._narratorEl.id = 'narrator-text';
      // MOBILE FIX: safe-area bottom support
      // P2：旁白 = 页边批注（半透明旧纸 + 左侧朱砂竖线 + 斜体手写，去毛玻璃/深蓝灰）
      this._narratorEl.style.cssText = 'position:fixed;' +
        'bottom:calc(120px + env(safe-area-inset-bottom));' +
        'left:50%;transform:translateX(-50%);' +
        'width:90%;max-width:600px;' +
        'text-align:center;color:#4a3520;' +
        'font-size:18px;font-style:italic;' +
        'font-family:\'Caveat\',\'KaiTi\',\'楷体\',cursive;' +
        'z-index:100010;display:none;' +
        'line-height:1.8;min-height:40px;' +
        'padding:16px 26px 16px 30px;' +
        'background-color:rgba(245,240,224,0.92);' +
        'background-image:' +
        'repeating-linear-gradient(45deg, rgba(200,190,170,0.04) 0px, rgba(200,190,170,0.04) 1px, transparent 1px, transparent 3px);' +
        'border-left:3px solid #a3352a;' +
        'border-top:1px solid rgba(61,47,34,0.4);' +
        'border-right:1px solid rgba(61,47,34,0.4);' +
        'border-bottom:1px solid rgba(61,47,34,0.4);' +
        'border-radius:6px;' +
        'box-shadow:0 8px 24px rgba(0,0,0,0.4),' +
        'inset 0 0 0 1px rgba(255,255,255,0.25),' +
        'inset 0 0 16px rgba(120,100,70,0.12);';
      this._narratorEl.addEventListener('click', () => this.nextDialogue());
      document.body.appendChild(this._narratorEl);
    }

    _initTitleCard() {
      if (this._titleCardEl) return;
      this._titleCardEl = document.createElement('div');
      this._titleCardEl.id = 'story-title-card';
      this._titleCardEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;align-items:center;justify-content:center;' +
        // P2：标题卡 = 深色封页（布纹感暖褐，去深蓝灰）
        'background:radial-gradient(ellipse at center, rgba(61,42,26,0.97) 0%, rgba(24,16,9,0.99) 100%);z-index:100012;pointer-events:none;opacity:1;transition:opacity 0.5s;';
      this._titleCardEl.innerHTML = '<div id="tc-title" style="font-size:48px;font-weight:700;color:#d4a853;text-shadow:0 2px 12px rgba(0,0,0,0.5),0 0 30px rgba(212,168,83,0.15);font-family:\'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif;letter-spacing:12px;"></div><div id="tc-subtitle" style="font-size:18px;color:#a09070;margin-top:16px;letter-spacing:4px;opacity:0.7;font-family:\'KaiTi\',\'楷体\',serif;"></div>';
      document.body.appendChild(this._titleCardEl);
    }

    _initItem() {
      if (this._itemEl) return;
      this._itemEl = document.createElement('div');
      this._itemEl.id = 'story-item';
      // MOBILE FIX: responsive item size
      this._itemEl.style.cssText = 'position:fixed;' +
        'top:50%;left:50%;' +
        'transform:translate(-50%,-50%);' +
        'width:clamp(200px, 40vw, 300px);' +
        'height:clamp(200px, 40vw, 300px);' +
        'background-size:contain;' +
        'background-repeat:no-repeat;' +
        'background-position:center;' +
        'z-index:100012;display:none;' +
        'filter:drop-shadow(0 0 40px rgba(255,215,0,0.3));' +
        'cursor:pointer;' +
        'transition:opacity 0.3s, transform 0.3s;';
      // Click on item hides it
      this._itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hideItem();
      });
      document.body.appendChild(this._itemEl);
    }

    /**
     * 初始化全屏 CG 插图元素（剧情关键节点演出）
     */
    _initCg() {
      if (this._cgEl) return;
      this._cgEl = document.createElement('div');
      this._cgEl.id = 'story-cg';
      this._cgEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background-size:contain;background-repeat:no-repeat;background-position:center;' +
        'background-color:rgba(0,0,0,0.9);' +
        'z-index:100011;display:none;cursor:pointer;' +
        'transition:opacity 0.3s;';
      // 点击 CG 关闭并继续对话
      this._cgEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hideCg();
      });
      document.body.appendChild(this._cgEl);
    }

    /**
     * 显示全屏 CG 插图
     * @param {string} cgValue - 'CG-00_xxx' 或完整 assets/ 路径
     */
    _showCg(cgValue) {
      if (!this._cgEl) this._initCg();
      if (!this._cgEl) return;
      const url = (/^(assets\/|http|data:|url\(|\/)/i.test(cgValue))
        ? cgValue : 'assets/images/cg/' + cgValue;
      this._preloadImage(url).then(() => {
        if (!this._cgEl) return;
        this._cgEl.style.backgroundImage = "url('" + url + "')";
        this._cgEl.style.opacity = '0';
        this._cgEl.style.display = 'flex';
        void this._cgEl.offsetWidth;
        this._cgEl.style.opacity = '1';
        this._cgVisible = true;
      });
    }

    /**
     * 隐藏 CG 插图（淡出）
     */
    _hideCg() {
      if (!this._cgEl) return;
      this._cgEl.style.opacity = '0';
      this._setTimeout(() => {
        if (this._cgEl) this._cgEl.style.display = 'none';
      }, 300);
      this._cgVisible = false;
    }

    /**
     * 初始化教学 Q 版 chibi 元素（吸附于棋盘顶部与 header 之间）
     */
    _initChibi() {
      if (this._chibiEl) return;
      this._chibiEl = document.createElement('div');
      this._chibiEl.id = 'story-chibi';
      this._chibiEl.style.cssText = 'position:fixed;z-index:100008;display:none;' +
        'background-size:contain;background-repeat:no-repeat;background-position:center bottom;' +
        'pointer-events:none;transition:opacity 0.25s;' +
        // v2.0：无底板（原半透明圆形底框用户反馈"黑色圆形框框住"不想要），
        // 纯立绘贴棋盘顶端，干净吸附
        'filter:drop-shadow(0 6px 14px rgba(0,0,0,0.35));';
      document.body.appendChild(this._chibiEl);
    }

    /**
     * 显示教学 Q 版 chibi（角色 + 可选变体）
     * @param {string} roleKey - shenmo/vera/suwan/ito
     * @param {string} [variant] - 可选状态（如 shenmo 的 thinking/vera 的 smile）
     */
    showChibi(roleKey, variant) {
      try {
        if (!this._chibiEl) this._initChibi();
        if (!this._chibiEl) return;
        const map = CHIBI_MAP[roleKey];
        if (!map) return;
        const file = (variant && map[variant]) ? map[variant] : map.default;
        if (!file) return;
        // v2.0：同一角色已在显示时跳过（避免每次气泡出现重复淡入闪烁）
        if (this._chibiVisible && this._chibiFile === file) return;
        this._chibiFile = file;
        this._chibiEl.style.backgroundImage = "url('assets/images/chibi/" + file + ".png')";
        this._chibiEl.style.opacity = '0';
        this._chibiEl.style.display = 'flex';
        void this._chibiEl.offsetWidth;
        this._chibiEl.style.opacity = '1';
        this._chibiVisible = true;
      } catch (e) {
        console.warn('[Story] showChibi error:', e);
      }
    }

    /**
     * 隐藏教学 Q 版 chibi
     */
    hideChibi() {
      try {
        if (!this._chibiEl) return;
        this._chibiEl.style.opacity = '0';
        this._setTimeout(() => {
          if (this._chibiEl) this._chibiEl.style.display = 'none';
        }, 250);
        this._chibiVisible = false;
      } catch (e) {
        console.warn('[Story] hideChibi error:', e);
      }
    }

    /** chibi 当前是否可见 */
    isChibiVisible() {
      return this._chibiVisible;
    }
  }

  export default new StoryEngine();
