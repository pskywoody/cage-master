// ============================================================
//  character-templates.js - 本地化角色提示模板库（V4.3.26）
// ============================================================
//  替代外部 AI 生成角色化提示：按角色 × 技巧预置模板，
//  运行时用 TechRater 证据链动态填充占位符（{num}/{sum}/{placed}/...）。
//
//  设计原则：
//    - 纯本地数据 + 纯函数，零外部依赖
//    - 与 hint-system.js 四角色（沈墨/薇拉/苏晚/伊藤）人格对齐
//    - 模板带证据占位符；无证据时由调用方回退旧文案
//
//  用法：
//    import { renderHint } from './character-templates.js';
//    const msg = renderHint('shenmo', 'cageUnique', evidence);
//
// ============================================================

export const CHARACTER_TEMPLATES = {
  // ---- 沈墨：沉稳内敛，老师口吻 ----
  shenmo: {
    id: 'shenmo',
    name: '沈墨',
    tone: '沉稳·克制',
    start: '老师当年教过——先看盘面。',
    target: '这一格，可以确定。',
    fail: '不对，换个思路。',
    eureka: '推理正确。继续。',
    hint: {
      nakedSingle: '排除到最后，只剩 {num}。',
      hiddenSingle: '行/列/宫排除后，{num} 只可能在这里。',
      cageUnique: '笼和 {sum}，已有 {placed}，所以剩下的是 {num}。',
      rule45: '45 法则直接算出 {num}。',
      nakedPair: '数对 {num1}/{num2} 锁定在这两格，其他位置排除。',
      hiddenPair: '隐数对——{num1}/{num2} 藏在候选之间，只在这两格出现。',
      pointingClaiming: '区块排除：这个宫里的 {num} 只在这一行/列，可以排除其他位置。',
      nakedTriplet: '三格共享 {num1}/{num2}/{num3}，锁住后其他格排除这三个数。',
      xWing: 'X-Wing 结构——两行两列，{num} 被锁死了。',
      swordfish: 'Swordfish 鱼骨——三行三列，{num} 的位置被限死。',
      default: '用排除法推一下这一格。',
    },
  },

  // ---- 薇拉：白俄女子，直率明快 ----
  vera: {
    id: 'vera',
    name: '薇拉',
    tone: '直率·明快',
    start: '让我瞧瞧这盘面。',
    target: '就填这个数。',
    fail: '不对，再想想。',
    eureka: '不错，正是这条路。',
    hint: {
      nakedSingle: '这一格，只剩下 {num} 一个可能。',
      hiddenSingle: '{num} 在这一行/列/宫里只有这一个位置。',
      cageUnique: '这个笼子的和是 {sum}，已有的数是 {placed}，剩下的数就是 {num}。',
      rule45: '45 法则，这个笼子跨宫差值就是 {num}。',
      nakedPair: '这两个格子的候选数相同，锁住了 {num1} 和 {num2}。',
      hiddenPair: '{num1} 与 {num2} 只可能在这两格，其余位置可排除。',
      pointingClaiming: '这个宫里的 {num} 只在这一行/列，可以排除其他位置。',
      nakedTriplet: '这三格锁住了 {num1}、{num2}、{num3}，其他格排除。',
      xWing: '二连纵横阵——两行两列，{num} 被锁死了。',
      swordfish: '三才游鱼阵——三行三列，{num} 的形态已经浮现。',
      default: '观察一下，这里有个推理线索。',
    },
  },

  // ---- 苏晚：温柔知性，循循善诱 ----
  suwan: {
    id: 'suwan',
    name: '苏晚',
    tone: '温柔·耐心',
    start: '我们一起来看这盘面吧。',
    target: '这一格，可以填这个数。',
    fail: '再想想，换个角度试试。',
    eureka: '很好，你找到了。',
    hint: {
      nakedSingle: '这一格的候选数，只剩 {num} 一个了。',
      hiddenSingle: '{num} 在这一行/列/宫里，只有一个容身之处。',
      cageUnique: '笼和 {sum}，已有 {placed}，剩下的是 {num}。',
      rule45: '星衡法则——全宫之和为 45，差值就是 {num}。',
      nakedPair: '{num1}/{num2} 在这两格互相锁定，其他位置可以排除。',
      hiddenPair: '{num1}/{num2} 藏在候选之间，只在这两格出现。',
      pointingClaiming: '这个宫里的 {num} 只在这一行/列，可以排除其他位置。',
      nakedTriplet: '三格共享 {num1}/{num2}/{num3}，锁住后其他格排除。',
      xWing: '二连纵横阵——两行两列，{num} 被锁定了。',
      swordfish: '三才游鱼阵——三行三列，{num} 的轨迹已经成形。',
      default: '我们试试用排除法看这一格。',
    },
  },

  // ---- 伊藤：严肃冷静，精准简洁 ----
  ito: {
    id: 'ito',
    name: '伊藤',
    tone: '严肃·精准',
    start: '观察。',
    target: '此处可定。',
    fail: '误判。重来。',
    eureka: '确认。',
    hint: {
      nakedSingle: '此格候选已尽，唯余 {num}。',
      hiddenSingle: '{num} 在此行/列/宫中仅此一格。',
      cageUnique: '笼和 {sum}，已录 {placed}，未录为 {num}。',
      rule45: '45 法则。宫和恒为 45，差值即 {num}。',
      nakedPair: '{num1}/{num2} 锁定此二格，其余排除。',
      hiddenPair: '{num1}/{num2} 隐于候选，只在此二格。',
      pointingClaiming: '宫中 {num} 仅指向此行/列，其余可排除。',
      nakedTriplet: '{num1}/{num2}/{num3} 互锁三格，其余排除。',
      xWing: '二连纵横阵。两行两列，{num} 被索引锁定。',
      swordfish: '三才游鱼阵。三行三列，{num} 路径已闭合。',
      default: '核查此格，可提取一条推理线索。',
    },
  },
};

/**
 * ============================================================
 *  ARC_TEMPLATES - 叙事弧词库层（Cage Interpretation Framework）
 * ============================================================
 *  让同一数学事实按"谁的价值观"解释，而非"谁开口"。
 *  双轴解析：arc 优先（叙事身份），char 兜底（说话人语气）。
 *
 *  键控：ARC_TEMPLATES[arc][technique]
 *  占位符沿用 {num}/{sum}/{placed}，与 CHARACTER_TEMPLATES 一致，
 *  由 renderHint 统一填充，evidence 结构零改动。
 *
 *  arc 值：
 *    shenmo 沈墨篇 - 封锁区 / 星衡法则 / 笼和约束
 *    vera   薇拉篇 - 残忆笼 / 双曜平衡 / 记忆约束
 *    ito    伊藤篇 - Archive Cell / 记录守恒 / 档案约束
 *
 *  sealedCage：九格满宫笼触发的特殊叙事文案（C4 预留，展示层触发）
 * ============================================================
 */
export const ARC_TEMPLATES = {
  shenmo: {
    _label: '沈墨篇·封锁区',
    cage: '封锁区',
    rule45: '星衡法则',
    cageUnique: '笼和约束',
    sealedCage: '整个区域已经被封锁',
    hint: {
      nakedSingle: '这一格，封锁线内只剩 {num} 一个突破口。',
      hiddenSingle: '{num} 在这片封锁区里只有一个出口。',
      rule45: '星衡法则——全宫之和为 45，内突外突由此锁定 {num}。',
      cageUnique: '笼和约束——这个封锁区和值为 {sum}，已有 {placed}，剩下的是 {num}。',
      nakedPair: '两格共享 {num1}/{num2}，互为囚锁，其他位置排除。',
      hiddenPair: '{num1}/{num2} 被封锁在这两格，其余位置排除。',
      pointingClaiming: '宫里的 {num} 被封锁在这一行/列，其余位置排除。',
      nakedTriplet: '{num1}/{num2}/{num3} 三格互相封锁，其他格排除。',
      xWing: '二连纵横阵——两行两列，{num} 被锁死在矩阵四角。',
      swordfish: '三才游鱼阵——三行三列，{num} 的封锁线已经浮现。',
      default: '这片封锁区里，藏着一条推理线索。',
    },
  },

  vera: {
    _label: '薇拉篇·残忆笼',
    cage: '残忆笼',
    rule45: '双曜平衡',
    cageUnique: '记忆约束',
    sealedCage: '这段记忆没有留下空白',
    hint: {
      nakedSingle: '这段残忆里，只剩下 {num} 一个清晰印记。',
      hiddenSingle: '{num} 在残响中只有一个归处。',
      rule45: '双曜平衡——九宫总量恒为 45，差值即 {num}。',
      cageUnique: '记忆约束——这笼记和值是 {sum}，已忆起 {placed}，未竟的便是 {num}。',
      nakedPair: '{num1}/{num2} 在这两格互相攥紧，其他位置消散。',
      hiddenPair: '{num1}/{num2} 藏在残忆深处，只在这两格浮现。',
      pointingClaiming: '宫中的 {num} 只在这一行/列留有痕迹，其余位置排除。',
      nakedTriplet: '{num1}/{num2}/{num3} 三枚印记彼此依存，其他格排除。',
      xWing: '双曜回环——两行两列，{num} 被困在四角之间。',
      swordfish: '三曜游吟——三行三列，{num} 的轨迹已然成形。',
      default: '顺着这段残忆的脉络，能找出一条线索。',
    },
  },

  ito: {
    _label: '伊藤篇·档案',
    cage: 'Archive Cell',
    rule45: '记录守恒',
    cageUnique: '档案约束',
    sealedCage: '档案完整性确认',
    hint: {
      nakedSingle: '此格记录收敛，仅余 {num} 一条有效条目。',
      hiddenSingle: '{num} 在此行/列/宫的档案中仅出现一次。',
      rule45: '记录守恒——九宫记录总量恒为 45，归档差值即 {num}。',
      cageUnique: '档案约束——存档和值为 {sum}，已录 {placed}，未录条目为 {num}。',
      nakedPair: '{num1}/{num2} 两条记录锁定此二格，其余条目可排除。',
      hiddenPair: '{num1}/{num2} 隐于档案冗余，只在此二格归档。',
      pointingClaiming: '宫中 {num} 的归档仅指向此行/列，其余位置可排除。',
      nakedTriplet: '{num1}/{num2}/{num3} 三条记录互锁三格，其余排除。',
      xWing: '双轴归档——两行两列，{num} 被索引锁定。',
      swordfish: '三线归档——三行三列，{num} 的索引路径已闭合。',
      default: '核查此格档案，可提取一条推理索引。',
    },
  },
};

// 合法 arc 集合（供外部校验）
export const ARC_IDS = Object.keys(ARC_TEMPLATES);

/**
 * 用证据链渲染角色提示（纯函数，无副作用）
 * @param {string} charId - 角色 id（shenmo/vera/suwan/ito，未知回退 shenmo）
 * @param {string} technique - 技巧 id（nakedSingle/cageUnique/...）
 * @param {Object} [evidence] - TechRater 证据链（cageSum/filledNums/pairValues/num...）
 * @param {Object} [ctx] - 补充上下文（num 顶层值、arc 叙事弧等）
 * @returns {string} 渲染后的提示文案；无模板时返回 ''
 */
export function renderHint(charId, technique, evidence, ctx) {
  let tpl = null;

  // 双轴解析：arc 词库优先（叙事身份），char 模板兜底（说话人语气）
  const arcId = ctx && ctx.arc;
  const arc = (arcId && ARC_TEMPLATES[arcId]) ? ARC_TEMPLATES[arcId] : null;
  if (arc && arc.hint && (arc.hint[technique] || arc.hint.default)) {
    tpl = arc.hint[technique] || arc.hint.default;
  } else {
    const char = CHARACTER_TEMPLATES[charId] || CHARACTER_TEMPLATES.shenmo;
    tpl = (char.hint && (char.hint[technique] || char.hint.default)) || null;
  }
  if (!tpl) return '';

  const ev = evidence || {};
  const pairVals = Array.isArray(ev.pairValues) ? ev.pairValues : [];
  const tripletVals = Array.isArray(ev.tripletValues) ? ev.tripletValues : pairVals;
  const placed = Array.isArray(ev.filledNums)
    ? ev.filledNums.join('、')
    : (ev.placed !== undefined && ev.placed !== null ? String(ev.placed) : '?');

  // {num} 多源提取：ev.num → ctx.num → targetValue → targetCell.value（各技巧证据字段不同）
  const numVal = (ev.num !== undefined ? ev.num
    : (ctx && ctx.num !== undefined ? ctx.num
      : (ev.targetValue !== undefined ? ev.targetValue
        : (ev.targetCell && ev.targetCell.value !== undefined ? ev.targetCell.value : '?'))));

  return tpl
    .replace(/\{num\}/g, numVal)
    .replace(/\{num1\}/g, (ev.num1 !== undefined ? ev.num1 : (pairVals[0] !== undefined ? pairVals[0] : '?')))
    .replace(/\{num2\}/g, (ev.num2 !== undefined ? ev.num2 : (pairVals[1] !== undefined ? pairVals[1] : '?')))
    .replace(/\{num3\}/g, (ev.num3 !== undefined ? ev.num3 : (tripletVals[2] !== undefined ? tripletVals[2] : '?')))
    .replace(/\{sum\}/g, (ev.cageSum !== undefined ? ev.cageSum : (ev.sum !== undefined ? ev.sum : '?')))
    .replace(/\{placed\}/g, placed);
}

/**
 * 获取角色基础文案（start/fail/eureka），未知角色回退 shenmo
 * @param {string} charId
 * @param {string} key - start | target | fail | eureka
 * @returns {string}
 */
export function renderBase(charId, key) {
  const char = CHARACTER_TEMPLATES[charId] || CHARACTER_TEMPLATES.shenmo;
  return char[key] || '';
}

/**
 * 获取角色名（供 UI 展示）
 * @param {string} charId
 * @returns {string}
 */
export function characterName(charId) {
  const char = CHARACTER_TEMPLATES[charId] || CHARACTER_TEMPLATES.shenmo;
  return char.name || '沈墨';
}
