// ==========================================
// gallery-panel.js - V4 UI 层：GalleryPanel 图鉴/画廊面板
// ==========================================
// 说明（参照 CageMasterV4-refactoring-manual sec2-4 与附录 B）：
//   ui/gallery-panel.js 展示角色立绘、印记、收集品（图鉴），
//   通过 core/data-store.js 的 DataStore 持久化解锁状态（分类 GALLERY）：
//     DataStore.get('unlocked', DataStore.GALLERY, [])   // 已解锁 id 数组
//     DataStore.set('unlocked', [...], DataStore.GALLERY)
//   方法：
//     open() / close() / unlockItem(id) / isUnlocked(id) / getAllItems()
//   内置 8 个章节角色示例图鉴数据。
//
// 环境约束：
//   - 纯 ES Module 语法；无模块顶层 DOM 访问（Node import 不报错）。
// ==========================================

import { DataStore } from '../core/data-store.js';
import I18n from '../i18n/i18n.js';

export class GalleryPanel {
  /**
   * 图鉴条目显示文案翻译：item.id → i18n key 前缀
   * 角色/印记/碎片/道具/周目继承 的 name/title/description/unlockedBy 均经此翻译。
   * @private
   */
  _tItem(item, field) {
    try {
      const id = item && item.id ? String(item.id) : '';
      let prefix = '';
      const CHAR_MAP = {
        char_shenmo: 'ui.gallery.char.shenmo',
        char_vera: 'ui.gallery.char.vera',
        char_2: 'ui.gallery.char.suwan',
        char_3: 'ui.gallery.char.ito',
        seal_1: 'ui.gallery.char.seal1',
        char_4: 'ui.gallery.char.yamada',
        seal_2: 'ui.gallery.char.seal2',
        char_5: 'ui.gallery.char.zhoutaitai',
      };
      if (CHAR_MAP[id]) {
        prefix = CHAR_MAP[id];
      } else if (id.indexOf('frag_ch') === 0) {
        // frag_ch1_1 → ui.gallery.frag.ch1.1
        const m = id.match(/^frag_ch(\d+)_(\d+)$/);
        if (m) prefix = 'ui.gallery.frag.ch' + m[1] + '.' + m[2];
      } else if (id === 'key4_94') {
        // 特殊 id：key4_94 不以 key_ 开头，单独映射
        prefix = 'ui.gallery.prop.key4_94';
      } else if (id.indexOf('key_') === 0 || id.indexOf('badge_') === 0 || id.indexOf('ito_') === 0 ||
                 id.indexOf('photo_') === 0 || id.indexOf('letter_') === 0 || id.indexOf('scroll_') === 0 ||
                 id.indexOf('chart_') === 0) {
        // 关键道具：snake_case → camelCase
        prefix = 'ui.gallery.prop.' + id.replace(/_([a-z])/g, (m2, c) => c.toUpperCase());
      } else if (id.indexOf('coin_') === 0 || id.indexOf('note_') === 0) {
        // 周目继承：snake_case → camelCase
        prefix = 'ui.gallery.inherit.' + id.replace(/_([a-z])/g, (m2, c) => c.toUpperCase());
      }
      if (!prefix) return item[field];
      const key = prefix + '.' + (field === 'description' ? 'desc' : field);
      const val = I18n.t(key);
      // 回退：key 无翻译时返回原 key，此时用原始文案
      return val === key ? item[field] : val;
    } catch (e) {
      return item[field];
    }
  }

  /**
   * 内置示例图鉴数据：8 个章节角色条目
   * @returns {Array<Object>} 只读副本
   */
  static get DEFAULT_ITEMS() {
    return [
      { id: 'char_shenmo', type: 'character', name: '沈墨', title: '帐房先生·地下工作者',
        description: '公开身份是帐房先生，实为地下情报人员。擅用笼中密码传递讯息，冷静缜密，是「六月的风」行动的关键信使。', chapter: 1, rarity: 'rare',
        icon: '✉️', image: 'assets/images/portraits/ch1_shenmo_default.png', unlockedBy: '完成第 1 章任意关卡' },
      { id: 'char_vera', type: 'character', name: '薇拉', title: '霞飞路旧书店店主·联络员',
        description: '白俄难民，十月革命后随家人流亡上海，在法租界霞飞路经营旧书店为生。表面是安分守己的异国店主，实为情报网的关键联络人。出题如设局，冷静疏离之下藏着炽热的信念。', chapter: 1, rarity: 'rare',
        icon: '📚', image: 'assets/images/portraits/ch1_vera_default.png', unlockedBy: '通过第 102 关' },
      { id: 'char_2', type: 'character', name: '苏晚', title: '帐房之妻 · 守望者',
        description: '沈墨的妻子，以沉默为他守着这方寸阵地。乱世之中，她替他抹除外出的痕迹，在灶台边为他留一盏煤油灯，端一碗温热米粥。', chapter: 2, rarity: 'common',
        icon: '🫖', image: 'assets/images/portraits/suwan_default.png', unlockedBy: '完成第 2 章任意关卡' },
      { id: 'char_3', type: 'character', name: '伊藤', title: '特高课 · 物证对峙',
        description: '身在特高课的伊藤，与父亲相识。他先期抵达核验发报机，在B3留下补全的题面——你所有的题我都看过了。这道是我补的。', chapter: 3, rarity: 'rare',
        icon: '🗂️', image: 'assets/images/portraits/ito_default.png', unlockedBy: '完成第 3 章任意关卡' },
      { id: 'seal_1', type: 'seal', name: '星衡印记', title: '四十五星衡',
        description: '记载星衡法则的印记，破解藏书楼谜题后获得。', chapter: 4, rarity: 'epic',
        icon: '⭐', unlockedBy: '完成第 4 章任意关卡' },
      { id: 'char_4', type: 'character', name: '山田', title: '特高课 · 资深搜查官',
        description: '山田的排查档案里，沈墨的名字被批注：归档类别：无关。测向车一东一西锁死藏书楼片区，而沈墨在黑暗中默数六分钟风险窗口。', chapter: 5, rarity: 'epic',
        icon: '📡', image: 'assets/images/portraits/yamada_default.png', unlockedBy: '完成第 5 章任意关卡' },
      { id: 'seal_2', type: 'seal', name: '三代刻痕', title: '短横与竖线',
        description: '沈墨留短横，伊藤留竖线，父亲在B3留下更深的短横——三代人，三种刻法，同一条路。', chapter: 6, rarity: 'legendary',
        icon: '✒️', unlockedBy: '完成第 6 章任意关卡' },
      { id: 'char_5', type: 'character', name: '周太太', title: '狄思威路72号 · 守望者',
        description: '你父亲走之前托过我一样东西。他说——如果有一天他回来了，把这个交给他。封口严丝合缝，无拆启痕迹。', chapter: 7, rarity: 'rare',
        icon: '✉️', image: 'assets/images/portraits/zhou_taotai_default.png', unlockedBy: '完成第 7 章任意关卡' },
      // ===== 序章档案碎片（101-109，通关解锁，collectible）=====
      { id: 'frag_ch1_1', type: 'collectible', name: '档案碎片 · 壹', title: '雨夜来信',
        description: '无署名的信，封缄处只刻着一道极细的短横记号。拆开信封，内里是一道残缺的数独盘面。', chapter: 1, rarity: 'common',
        icon: '🗞️', image: 'assets/images/chapter1/cg/CG-CH1-01_letter_closeup.jpg', unlockedBy: '通关第 101 关' },
      { id: 'frag_ch1_2', type: 'collectible', name: '档案碎片 · 贰', title: '旧书铺踪迹',
        description: '霞飞路旧书铺的主人是薇拉，白俄联络员。她出了一道题，作为开口的代价。', chapter: 1, rarity: 'common',
        icon: '📚', image: 'assets/images/chapter1/cg/CG-CH1-03_bookstore_first_meeting.jpg', unlockedBy: '通关第 102 关' },
      { id: 'frag_ch1_3', type: 'collectible', name: '档案碎片 · 叁', title: '街巷阴影',
        description: '霞飞路上的流动联络点浮现，特高课便衣徘徊。监视的网，已经悄然铺开。', chapter: 1, rarity: 'common',
        icon: '🌫️', image: 'assets/images/chapter1/cg/CG-CH1-06_xiafei_road_walking.jpg', unlockedBy: '通关第 103 关' },
      { id: 'frag_ch1_4', type: 'collectible', name: '档案碎片 · 肆', title: '访客苏晚',
        description: '苏晚认得这地下密语，主动替你掩盖行踪。而风险，仍在升高。', chapter: 1, rarity: 'common',
        icon: '🫖', image: 'assets/images/chapter1/backgrounds/BG-CH1-03_teahouse_window.jpg', unlockedBy: '通关第 104 关' },
      { id: 'frag_ch1_5', type: 'collectible', name: '档案碎片 · 伍', title: '藏书楼外墙',
        description: '墙角砖石松动，砖缝中塞着谜题纸条。隐藏入口浮现——整条密信链条的枢纽。', chapter: 1, rarity: 'common',
        icon: '🏛️', image: 'assets/images/chapter1/cg/CG-CH1-04_alley_iron_gate_unlock.jpg', unlockedBy: '通关第 105 关' },
      { id: 'frag_ch1_6', type: 'collectible', name: '档案碎片 · 陆', title: '砖石秘钥',
        description: '依照坐标推动墙砖，墙体裂开一道缝隙——密道入口正式现世，向下通往藏书楼底层。', chapter: 1, rarity: 'common',
        icon: '🧱', image: 'assets/images/chapter1/cg/CG-CH1-07_handwritten_puzzle.jpg', unlockedBy: '通关第 106 关' },
      { id: 'frag_ch1_7', type: 'collectible', name: '档案碎片 · 柒', title: '初入幽阶',
        description: '石壁渗水，刻着断断续续的数独残痕。有的旧，有的新，分属不同的年代。', chapter: 1, rarity: 'common',
        icon: '🕯️', image: 'assets/images/chapter1/backgrounds/BG-CH1-04_alley_iron_gate.jpg', unlockedBy: '通关第 107 关' },
      { id: 'frag_ch1_8', type: 'collectible', name: '档案碎片 · 捌', title: '夹层遗物',
        description: '夹层石室中，沈墨找到一把编号为3的黄铜小钥匙，以及父亲的笔迹。', chapter: 1, rarity: 'common',
        icon: '🔑', image: 'assets/images/chapter1/backgrounds/BG-CH1-01_accounting_room_night.jpg', unlockedBy: '通关第 108 关' },
      { id: 'frag_ch1_9', type: 'collectible', name: '档案碎片 · 玖', title: '第一重闭环',
        description: '信、旧书铺、石壁、父亲的遗物……全部汇到这里。序章九枚碎片，悉数解锁。', chapter: 1, rarity: 'common',
        icon: '🗝️', image: 'assets/images/chapter1/backgrounds/BG-CH1-05_xiafei_road_night.jpg', unlockedBy: '通关第 109 关' },

      // ===== 第2章档案碎片（9枚，collectible）=====
      { id: 'frag_ch2_1', type: 'collectible', name: '档案碎片 · 壹', title: 'B1回廊',
        description: '铁门洞开，沈墨踏入藏书楼地下B1回廊。两侧石壁布满刀尖刻下的数字序列，绵延向走廊尽头——这是一条漫长的记忆长廊，无数谜题碎片被刻在石头之上。', chapter: 2, rarity: 'common',
        icon: '🏛️', unlockedBy: '通关第 201 关' },
      { id: 'frag_ch2_2', type: 'collectible', name: '档案碎片 · 贰', title: '岔路残简',
        description: '回廊中段道路一分为二，地面落着半张腐朽残破的纸页。排除错误岔路，锁定主通路方向——1938年残简的身份依旧成谜。', chapter: 2, rarity: 'common',
        icon: '🧾', unlockedBy: '通关第 202 关' },
      { id: 'frag_ch2_3', type: 'collectible', name: '档案碎片 · 叁', title: '桥洞一瞬',
        description: '沈墨返回地面补给，途经城外石桥。桥洞阴影深重，一名身着灰布长衫的中年人立在阴影之中——我方或敌方监视，已经近身。', chapter: 2, rarity: 'common',
        icon: '🌉', unlockedBy: '通关第 203 关' },
      { id: 'frag_ch2_4', type: 'collectible', name: '档案碎片 · 肆', title: '72号旧居',
        description: '循着线索来到父亲从前居住的72号旧居，院落早已荒废。屋内木柜开启，存放着父亲遗留的文稿与数独底稿。', chapter: 2, rarity: 'common',
        icon: '🏚️', unlockedBy: '通关第 204 关' },
      { id: 'frag_ch2_5', type: 'collectible', name: '档案碎片 · 伍', title: '旧稿破译',
        description: '木柜之内一叠叠数独底稿静静躺着，有的完整，有的只写到一半便中断。父亲知晓藏书楼地下密道的全部存在，却始终无法走完最后的段落。', chapter: 2, rarity: 'common',
        icon: '📜', unlockedBy: '通关第 205 关' },
      { id: 'frag_ch2_6', type: 'collectible', name: '档案碎片 · 陆', title: '返回地下',
        description: '旧居线索读完，沈墨必须重返地下。城内风声一日紧过一日，苏晚在家中替他抹除外出的痕迹，掩盖他长时间失踪的事实。', chapter: 2, rarity: 'common',
        icon: '🕯️', unlockedBy: '通关第 206 关' },
      { id: 'frag_ch2_7', type: 'collectible', name: '档案碎片 · 柒', title: 'B2石室入口',
        description: '走完漫长B1回廊，抵达通往B2的厚重铁门。整扇门板就是一块巨大的数独锁——而存在不明访客，先于沈墨抵达。', chapter: 2, rarity: 'common',
        icon: '🚪', unlockedBy: '通关第 207 关' },
      { id: 'frag_ch2_8', type: 'collectible', name: '档案碎片 · 捌', title: 'B2空室',
        description: '踏入B2主石室，墙角堆放旧木箱，地上散落废弃文稿。B3真实存在却被谜题链封锁——不明访客曾经停留于此。', chapter: 2, rarity: 'common',
        icon: '🗄️', unlockedBy: '通关第 208 关' },
      { id: 'frag_ch2_9', type: 'collectible', name: '档案碎片 · 玖', title: '石室留痕',
        description: '无数前人的印记遍布四壁。沈墨取出炭笔，在石壁空白处留下属于自己的一道刻痕——不写名字，不写日期，只代表：我来过。', chapter: 2, rarity: 'common',
        icon: '✏️', unlockedBy: '集齐本章八枚碎片后解锁' },

      // ===== 第3章档案碎片（9枚，collectible）=====
      { id: 'frag_ch3_1', type: 'collectible', name: '档案碎片 · 壹', title: '暗门',
        description: '沈墨目光扫过暗门内侧门框——一道细细铅笔短横静静刻在木框之上，样式与序章霞飞路旧窗台上的标记一模一样。', chapter: 3, rarity: 'common',
        icon: '🚪', unlockedBy: '通关第 301 关' },
      { id: 'frag_ch3_2', type: 'collectible', name: '档案碎片 · 贰', title: 'B1走廊',
        description: 'B1走廊逼仄，石壁刻痕连绵不绝。第七道刻痕末尾三位数字与旧大衣内袋纸条完全吻合——地面泥印来自苏州河岸，六小时前有访客途经此地。', chapter: 3, rarity: 'common',
        icon: '👣', unlockedBy: '通关第 302 关' },
      { id: 'frag_ch3_3', type: 'collectible', name: '档案碎片 · 叁', title: 'B2密室',
        description: 'B2密室木桌摆着一只敞开的牛皮纸袋，内里七道数独由浅入深依次排开。最上方纸页一行铅笔字迹：你到了。这里是老师留下的第二层。', chapter: 3, rarity: 'common',
        icon: '📦', unlockedBy: '通关第 303 关' },
      { id: 'frag_ch3_4', type: 'collectible', name: '档案碎片 · 肆', title: '七道题·一',
        description: '第一道数独提示数不多，盘面结构清晰利落。纸页末尾一行小字：还有六道。不用急——你需要时间。', chapter: 3, rarity: 'common',
        icon: '📄', unlockedBy: '通关第 304 关' },
      { id: 'frag_ch3_5', type: 'collectible', name: '档案碎片 · 伍', title: '七道题·二',
        description: '第二道谜题复杂度陡升，笼线层层交错，多组跨宫笼互相纠缠。老师落笔：你还记得六月的那本书吗？那道题是我出的。这一道也是。', chapter: 3, rarity: 'common',
        icon: '📄', unlockedBy: '通关第 305 关' },
      { id: 'frag_ch3_6', type: 'collectible', name: '档案碎片 · 陆', title: '七道题·三',
        description: '第三道是零提示数独——整张盘面只有笼格线条与和值，没有任何预先填写的数字。沈墨在灯下耗尽心力，终于推演完毕。', chapter: 3, rarity: 'common',
        icon: '⬜', unlockedBy: '通关第 306 关' },
      { id: 'frag_ch3_7', type: 'collectible', name: '档案碎片 · 柒', title: 'B3入口',
        description: '走廊尽头矗立一扇远重于过往所有门扇的铸铁铁门，门板中央镌刻一道大半已填好的数独盘面——父亲仅完成三分之二，伊藤先期抵达核验发报机。', chapter: 3, rarity: 'common',
        icon: '🗝️', unlockedBy: '通关第 307 关' },
      { id: 'frag_ch3_8', type: 'collectible', name: '档案碎片 · 捌', title: '发报机',
        description: '石室最深处，一台老式发报机安放在木桌之上，处于断电状态。发报机有移动痕迹，桌腿刻字"3"，伊藤完成设备检查记录。', chapter: 3, rarity: 'common',
        icon: '📻', unlockedBy: '集齐本章前七枚碎片后解锁' },
      { id: 'frag_ch3_9', type: 'collectible', name: '档案碎片 · 玖', title: '最深处的门',
        description: '石室最深处立着一扇一人宽窄的石门，门后斗室只放一桌一椅，桌面安放一只铁皮箱。箱中只有一张纸——父亲B3入口那道谜题残留的最后三分之一空白。', chapter: 3, rarity: 'common',
        icon: '🗃️', unlockedBy: '通关本章最终关卡后解锁' },

      // ===== 第4章档案碎片（9枚，collectible）=====
      { id: 'frag_ch4_1', type: 'collectible', name: '档案碎片 · 壹', title: '东余杭路94号',
        description: '黄昏暮色中，沈墨绕行至东余杭路94号后巷。第三根电线杆的砖缝里绷着一根新系棉线，线尾拴着一枚齿痕磨亮的旧铜钥匙，柄处刻着数字4。门框内侧一道指甲刻出的短横划痕，与他留在藏书楼暗门外的标记一模一样——有人先他一步来过。', chapter: 4, rarity: 'common',
        icon: '🔑', unlockedBy: '通关第 401 关' },
      { id: 'frag_ch4_2', type: 'collectible', name: '档案碎片 · 贰', title: '402房',
        description: '402房桌面摊开一本旧练习册，纸面铅笔字迹清浅笃定，四字落笔工整：他还没来。是母亲的笔迹。下方一行补写小字：我等到11月15日，不能再等了。抽屉里一封旧信，纸面印着一道数独题——解完它，就知道我在哪里。', chapter: 4, rarity: 'common',
        icon: '📒', unlockedBy: '通关第 402 关' },
      { id: 'frag_ch4_3', type: 'collectible', name: '档案碎片 · 叁', title: '403房',
        description: '403房中央一只无锁铁匣，匣盖内侧贴着纸条：这道题你母亲解了一半。另一半留给你。题解至终，末尾数字序列锁定一个关键日期——1941年11月15日，母亲彻底离开上海的日子。匣底垫着1941年11月5日的旧报纸残边：十日之前，日本御前会议敲定南进国策。', chapter: 4, rarity: 'common',
        icon: '🗃️', unlockedBy: '通关第 403 关' },
      { id: 'frag_ch4_4', type: 'collectible', name: '档案碎片 · 肆', title: '404房',
        description: '404房墙面钉着一张旧照片——女人立于轮船跳板，身姿挺拔，决绝远行。照片背面一行母亲笔迹：1941年11月15日。我改签了。不去香港。去符拉迪沃斯托克。照片取下，墙上一行浅淡铅笔字：你找到这里了。', chapter: 4, rarity: 'common',
        icon: '🚢', unlockedBy: '通关第 404 关' },
      { id: 'frag_ch4_5', type: 'collectible', name: '档案碎片 · 伍', title: '潘汉年的字条',
        description: '94号后门外的电线杆砖缝里，夹着一方折叠极小的纸条，纸面干燥，是刚刚放置的痕迹。无署名、无落款，仅单列一行精准地址：法租界·霞飞路·路路通茶馆·二楼雅间。折叠手法规整生疏，是全新的未知联络笔迹。', chapter: 4, rarity: 'common',
        icon: '📝', unlockedBy: '通关第 405 关' },
      { id: 'frag_ch4_6', type: 'collectible', name: '档案碎片 · 陆', title: '路路通茶馆',
        description: '茶馆二楼雅间桌面静置一只旧信封，封口压印着细密九宫格暗纹，与序章唤醒他的匿名密信完全同源。纸面并排两道数独：解完第一道，用它的密钥去解第二道。双题推演落幕，右侧盘面解锁一组全新地址与精准时间。而茶馆，早已被人暗中盯守。', chapter: 4, rarity: 'common',
        icon: '🫖', unlockedBy: '通关第 406 关' },
      { id: 'frag_ch4_7', type: 'collectible', name: '档案碎片 · 柒', title: '另一条路',
        description: '薇拉的书店大门紧闭，唯有临街窗台平放着一本无书名旧书，扉页是她的笔迹：你走的路是对的。但还有另一条路。书页夹缝是一张零提示数独，题解终局，一组冰冷日期赫然浮现——1941年12月8日。淡字显形：下一次你走进这扇门的时候，它就不再是书店了。', chapter: 4, rarity: 'common',
        icon: '📖', unlockedBy: '通关第 407 关' },
      { id: 'frag_ch4_8', type: 'collectible', name: '档案碎片 · 捌', title: '备用电台',
        description: '404房书桌下方暗藏隔层，内里静静躺着一方泛黄纸条，折痕经年磨损：备用电台在你上次到过的地方。藏书楼地下，B3，发报机底座下。字迹陌生、无从溯源，密道线索层层闭环，远超预期。', chapter: 4, rarity: 'common',
        icon: '📻', unlockedBy: '集齐本章前七枚碎片后解锁' },
      { id: 'frag_ch4_9', type: 'collectible', name: '档案碎片 · 玖', title: '三重对齐',
        description: '深夜雨落，沈墨重回藏书楼地下B3石室。发报机底座下拆下一只扁平铁盒，内里一张九阶数独完整填完，底端一行伊藤的笔迹：你所有的题我都看过了。这道是我补的。父亲残题、母亲轨迹、老师线索、伊藤补全——所有人的路径在此刻彻底三重对齐。山田的排查档案里，他的名字被批注：归档类别：无关。', chapter: 4, rarity: 'common',
        icon: '⚙️', unlockedBy: '通关本章最终关卡后解锁' },

      // ===== 第5章档案碎片（9枚，collectible）=====
      { id: 'frag_ch5_1', type: 'collectible', name: '档案碎片 · 壹', title: '发报机的准备',
        description: '黎明未至，沈墨重返藏书楼B3石室。电源线接驳完好、旋钮保持初始校准位置，伊藤补全的完整数独题面原样躺在铁盒里，无人踏足。设备完好，只待启动。', chapter: 5, rarity: 'common',
        icon: '📻', unlockedBy: '通关第 501 关' },
      { id: 'frag_ch5_2', type: 'collectible', name: '档案碎片 · 贰', title: '断电',
        description: '头顶持续传来低频机械震颤——日军无线电测向车的专属运作声，稳稳停驻在藏书楼正上方。沈墨静坐桌边纹丝不动，屏息蛰伏。此刻，不能有任何动静。', chapter: 5, rarity: 'common',
        icon: '🔇', unlockedBy: '通关第 502 关' },
      { id: 'frag_ch5_3', type: 'collectible', name: '档案碎片 · 叁', title: '测向车',
        description: '雨声笼罩全城，沈墨依托外置晾衣架铁丝搭建临时定向天线，削弱侧向信号辐射。两辆测向车一东一西同步就位，锁死藏书楼片区。他熄灭煤油灯，在全然黑暗中静坐，默数六分钟风险窗口期。', chapter: 5, rarity: 'common',
        icon: '📡', unlockedBy: '通关第 503 关' },
      { id: 'frag_ch5_4', type: 'collectible', name: '档案碎片 · 肆', title: '第一组电文',
        description: '雨声簌簌，正是绝佳的发报窗口期。沈墨抬手按下电键，以三秒间隔分段发送，每段报文传输时长不超五秒。第一组电文完整传输完毕，上空未传回任何回应信号。', chapter: 5, rarity: 'common',
        icon: '📶', unlockedBy: '通关第 504 关' },
      { id: 'frag_ch5_5', type: 'collectible', name: '档案碎片 · 伍', title: '第二组电文',
        description: '第二组报文篇幅更短，却承载着太平洋舰队坐标的核心关键情报。就在最后一个字符即将送出之际，头顶脚步声骤然逼近，精准停驻在地下暗门入口附近，咫尺之隔，危机骤生。', chapter: 5, rarity: 'common',
        icon: '⚡', unlockedBy: '通关第 505 关' },
      { id: 'frag_ch5_6', type: 'collectible', name: '档案碎片 · 陆', title: '第三组电文',
        description: '前两组电文尽数送出，再无退路。第三组收尾电文行将终结之际，头顶传来三声规整敲击声——有人知道他在发报。沈墨心神不动，稳稳送出最后一个情报字符，从贴身衣袋取出一张折叠整齐的薄纸，轻轻平放于发报机底座：这张纸，留给该看到的人。', chapter: 5, rarity: 'common',
        icon: '🕯️', unlockedBy: '通关第 506 关' },
      { id: 'frag_ch5_7', type: 'collectible', name: '档案碎片 · 柒', title: '天亮前的撤离',
        description: '情报尽数送出，沈墨有序收尾善后——彻底关闭发报机、拔除电源线、收回外置天线，将所有操作痕迹全部复原。沿原路逐层折返，步伐平缓沉稳，不留仓促撤离的痕迹。', chapter: 5, rarity: 'common',
        icon: '🌅', unlockedBy: '集齐本章前六枚碎片后解锁' },
      { id: 'frag_ch5_8', type: 'collectible', name: '档案碎片 · 捌', title: '山田的档案',
        description: '沈墨沿苏州河安然折返帐房，灶台边苏晚早已为他留好一盏煤油灯，默默端来一碗热粥。他转动窗台上的白瓷碗，将碗口精准朝向东方，指尖轻抵碗底刻下一道极浅短横暗记。山田的档案里，还留着他的名字。', chapter: 5, rarity: 'common',
        icon: '🍚', unlockedBy: '通关本章最终关卡后解锁' },
      { id: 'frag_ch5_9', type: 'collectible', name: '档案碎片 · 玖', title: '天亮',
        description: '报童飞奔过湿滑的石板弄堂，高声呼喊：号外！号外！日本海军袭击夏威夷！美国对日宣战！三段电文全部落地，测向队追着假信号走了——他趁那个窗口走了出来。珍珠港事件爆发，太平洋战局彻底引爆。', chapter: 5, rarity: 'common',
        icon: '📰', unlockedBy: '集齐本章全部碎片后解锁' },

      // ===== 第6章档案碎片（9枚，collectible）=====
      { id: 'frag_ch6_1', type: 'collectible', name: '档案碎片 · 壹', title: '账房',
        description: '灰白晨光平铺桌面，覆在陈旧的账本与古朴的算盘之上。苏晚默然生火做饭，轻声开口：早上有兵车过去了。三辆。向西。苏河桥方向。乱世之中，她以沉默为他守着这方寸阵地。', chapter: 6, rarity: 'common',
        icon: '🧮', unlockedBy: '通关第 601 关' },
      { id: 'frag_ch6_2', type: 'collectible', name: '档案碎片 · 贰', title: '书店',
        description: '旧书店大门紧闭，门槛内侧一道规整短横刻痕，与他六月留存的专属标记完全一致。书店无人后巷的第三根电线杆砖缝里，夹着一张折叠规整的纸条：旧书店的题面已经销毁。剩余材料在你们第一次见面的地方。有人，在他之前收走了最后一步。', chapter: 6, rarity: 'common',
        icon: '📚', unlockedBy: '通关第 602 关' },
      { id: 'frag_ch6_3', type: 'collectible', name: '档案碎片 · 叁', title: '四号桥',
        description: '四号桥桥洞之下，石阶上静静搁置着一件深色旧大衣，袖口一道长期穿戴的磨损痕迹。侧袋里一只无封口水信封，内里叠放着一张1938年出版的上海法租界精准地图，铅笔圈注的点位并非茶馆现址，而是1939年搬迁前的旧址门牌号。', chapter: 6, rarity: 'common',
        icon: '🧥', unlockedBy: '通关第 603 关' },
      { id: 'frag_ch6_4', type: 'collectible', name: '档案碎片 · 肆', title: '路路通旧址',
        description: '路路通茶馆旧址人去楼空，一楼尽头窗台内侧，一只铁盒被粗棉绳交叉绑定，绳结打法是专属熟人的标记手法。盒内最上方一张白纸：你看到了这张地图，说明你已经走到了最后一步。这是老师留下的最后一份原始题面。她没有发完。', chapter: 6, rarity: 'common',
        icon: '📦', unlockedBy: '通关第 604 关' },
      { id: 'frag_ch6_5', type: 'collectible', name: '档案碎片 · 伍', title: '发报机',
        description: '深夜，沈墨再度折返藏书楼地下。发报机电源线已然脱落，断面平整利落，是精密工具精准剪断的痕迹。底座铁盒封存胶带完好，盒身边缘却有细微偏移。这种无痕断电、隐秘收尾的手法——是伊藤。', chapter: 6, rarity: 'common',
        icon: '✂️', unlockedBy: '通关第 605 关' },
      { id: 'frag_ch6_6', type: 'collectible', name: '档案碎片 · 陆', title: '痕迹',
        description: '幽暗B1走廊，沈墨凭记忆核验满布石壁的数字刻痕，确认完好无损。随后指尖微屈，在原有刻痕旁轻轻划下一道全新短横——比父亲留下的更短、更浅。暗门外侧的门框标记、B3入口的原始刻痕……三处一线，父子一脉。这条网，他替父亲补完了。', chapter: 6, rarity: 'common',
        icon: '✏️', unlockedBy: '通关第 606 关' },
      { id: 'frag_ch6_7', type: 'collectible', name: '档案碎片 · 柒', title: '山田的搜查',
        description: '凌晨，日军整队巡查的规整步伐在巷口骤然停驻，原地僵持片刻后沿巷远去，未深入弄堂、未靠近帐房。苏晚轻声开口：巷口有人站了一会儿。没有进弄堂。伊藤，你已经在12月7日深夜，把我的名字从那份档案里摘了出去。', chapter: 6, rarity: 'common',
        icon: '🌙', unlockedBy: '集齐本章前六枚碎片后解锁' },
      { id: 'frag_ch6_8', type: 'collectible', name: '档案碎片 · 捌', title: '沈世安的痕迹',
        description: '狄思威路72号三楼书房，桌面一道全新浅淡压痕，是轻薄旧书长期静置留下的底面印记。靠墙隐秘凹槽较此前更深，有明显重新启用、按压触碰的新鲜痕迹，槽内却空空如也。父亲，你在撤离上海之前，回来取走了最后一件东西。12月初，你比我先到。', chapter: 6, rarity: 'common',
        icon: '🪑', unlockedBy: '通关本章最终关卡后解锁' },
      { id: 'frag_ch6_9', type: 'collectible', name: '档案碎片 · 玖', title: '潘汉年',
        description: '路路通茶馆二楼雅间，一名身着素色灰布长衫的男子端坐等候。沈墨摊开1938年租界旧地图，地图背面一行铅笔字迹清晰显露：1941年12月7日。他在等你。那是他深夜发电、传递核心情报的同一天——父亲撤离上海，经符拉迪沃斯托克中转，辗转前往莫斯科。这张网，终于织完了。', chapter: 6, rarity: 'common',
        icon: '🍵', unlockedBy: '集齐本章全部碎片后解锁' },

      // ===== 第7章档案碎片（9枚，collectible）=====
      { id: 'frag_ch7_1', type: 'collectible', name: '档案碎片 · 壹', title: '西郊仓库',
        description: '夜色最深的时刻，沈墨最后一次踏出上海城区，伫立在废弃西郊仓库的外墙阴影之中。仓库中央地面留存着一片大面积水冲痕迹，彻底覆盖了昔日摆放铁皮箱的核心区域。门框外侧底端，一道崭新垂直刻痕清晰入目，与他四月留存的专属标记同源异形，力道更深、纹路更宽——出自另一人之手。', chapter: 7, rarity: 'common',
        icon: '🏚️', unlockedBy: '通关第 701 关' },
      { id: 'frag_ch7_2', type: 'collectible', name: '档案碎片 · 贰', title: '狄思威路72号',
        description: '破晓时分，沈墨再度踏入狄思威路72号老宅。一楼走廊尽头，周太太静立良久，掌心摊开一只边角磨损、纸面泛黄的旧信封：你父亲走之前托过我一样东西。他说——如果有一天他回来了，把这个交给他。封口严丝合缝，无拆启痕迹。', chapter: 7, rarity: 'common',
        icon: '✉️', unlockedBy: '通关第 702 关' },
      { id: 'frag_ch7_3', type: 'collectible', name: '档案碎片 · 叁', title: '霞飞路旧书店',
        description: '霞飞路旧书店的店门被全新铁锁从外部牢牢锁死。转身离去的刹那，沈墨余光捕捉到窗台内侧书架板面上一道浅淡至极的短横刻痕，与他六月留存的专属标记完全契合，只是力道极轻、入木极浅。他在当年取走秘藏书册的原位，落下了耗时半年拼凑出的最终终点——一行清晰的铅笔地址。', chapter: 7, rarity: 'common',
        icon: '🔒', unlockedBy: '通关第 703 关' },
      { id: 'frag_ch7_4', type: 'collectible', name: '档案碎片 · 肆', title: '苏州河',
        description: '午后的苏州河面风平浪静，沈墨静坐临水阶前，取出那只泛黄信封。指尖轻启，内里平整信纸上一行沉敛字迹：墨——我是你父亲。我走了，不是因为我不想等。落款日期12月8日，正是他深夜完成发报、传递核心情报的同一天。', chapter: 7, rarity: 'common',
        icon: '🌊', unlockedBy: '通关第 704 关' },
      { id: 'frag_ch7_5', type: 'collectible', name: '档案碎片 · 伍', title: '符拉迪沃斯托克',
        description: '破晓晨光漫洒黄浦江面，沈墨赶在天明之前抵达码头，走上栈桥尽头。码头管理站窗口前，他径直缴费购票——船票目的地清晰标注：符拉迪沃斯托克。与父亲撤离路线、信纸标注方向、母亲照片留存的航海轨迹完全重合。三代隐秘前路，终究归于同一方向。', chapter: 7, rarity: 'common',
        icon: '🎫', unlockedBy: '通关第 705 关' },
      { id: 'frag_ch7_6', type: 'collectible', name: '档案碎片 · 陆', title: '帐房',
        description: '沈墨时隔一日重回帐房，苏晚独坐灶台边矮凳上，窗台那只白瓷碗碗口稳稳朝东，是二人默认的终极平安信号。她未曾起身问询，只掀开锅盖盛出一碗温热米粥，轻轻摆放在桌面。你什么时候走。……明天。船票买好了。……买好了。粥温了。', chapter: 7, rarity: 'common',
        icon: '🥣', unlockedBy: '通关第 706 关' },
      { id: 'frag_ch7_7', type: 'collectible', name: '档案碎片 · 柒', title: '船',
        description: '清晨薄雾氤氲江面，轮渡缓缓起锚，挣脱岸线束缚，徐徐驶离上海码头。沈墨静立船舷之侧，不扶栏杆、不挥手道别、不回头眷恋。内袋贴身收纳着所有过往与期许：父亲的亲笔信、母亲的旧照片、老师留存的原始题面、1938年租界旧地图。上海，留在身后了。', chapter: 7, rarity: 'common',
        icon: '🚢', unlockedBy: '集齐本章前六枚碎片后解锁' },
      { id: 'frag_ch7_8', type: 'collectible', name: '档案碎片 · 捌', title: '雾',
        description: '轮渡驶出吴淞口，江水接轨碧海，海雾层层翻涌。船尾拖出一条绵长淡白的水痕，彻底斩断与上海的过往牵连。身后甲板入口处，有人短暂驻足停留，静默观望，不靠近、不言语、不离去，暗藏一丝隐秘窥探。来去无痕，一如他过往所有隐秘博弈。', chapter: 7, rarity: 'common',
        icon: '🌫️', unlockedBy: '通关第 708 关' },
      { id: 'frag_ch7_9', type: 'collectible', name: '档案碎片 · 玖', title: '库房',
        description: '海雾彻底褪去，沈墨静坐船舱，将贴身收纳的所有物件逐一平铺展开。身后传来脚步声，一人，在离他三步远的地方停了。伊藤：你走完了。西郊仓库那道竖痕，是你留的。你留了短横，我留了竖线。你父亲的短横在B3。三代人。三种刻法。船舷上留着那把钥匙。船继续向东。海平面没有尽头。', chapter: 7, rarity: 'common',
        icon: '🗝️', unlockedBy: '通关本章最终关卡后解锁' },

      // ===== 关键剧情道具（108 夹层遗物 → 黄铜钥匙 · 编号3）=====
      { id: 'key_brass3', type: 'prop', name: '黄铜钥匙 · 编号3', title: '父亲的遗物',
        description: '夹层石室的一只蒙尘旧木箱里，沈墨在泛黄绢纸中发现这把黄铜小钥匙，编号为3。纸上几行模糊字迹，是他父亲的笔迹——多年以前，他的父亲，也曾来过这里。用途仍是谜。', chapter: 1, rarity: 'rare',
        icon: '🔑', image: 'assets/images/items/item_key.jpg', unlockedBy: '通过第 108 关「夹层遗物」' },

      // ===== 关键剧情道具（后续章节）=====
      { id: 'badge_abacus', type: 'prop', name: '徽章 · 星衡学徒', title: '黄铜算珠徽章',
        description: '四十五星衡的入门凭证，边缘刻着一圈细密算珠纹。它是深入藏书楼地下的入场资格。', chapter: 2, rarity: 'rare',
        icon: '🏅', unlockedBy: '通过第 208 关' },
      { id: 'ito_notebook', type: 'prop', name: '伊藤的练习册', title: 'B2 密室遗物',
        description: '从藏书楼B2密室铁柜中找到的练习册，上面画满密密麻麻的笼局。伊藤当年也曾深入这里。', chapter: 3, rarity: 'rare',
        icon: '📓', unlockedBy: '通过第 303 关' },
      { id: 'key4_94', type: 'prop', name: '钥匙 · 编号4', title: '东余杭路 94 号',
        description: '匙柄刻着数字4的旧铜钥匙，齿痕磨亮。它能打开东余杭路94号的门——母亲留下的最后一扇门。', chapter: 4, rarity: 'rare',
        icon: '🔑', image: 'assets/images/items/item_key.jpg', unlockedBy: '通过第 401 关' },
      { id: 'photo_mother', type: 'prop', name: '母亲的旧照片', title: '404 房 · 决绝远行',
        description: '404房墙面钉着的一张旧照片——女人立于轮船跳板，身姿挺拔，决绝远行。照片背面一行母亲笔迹：1941年11月15日。我改签了。不去香港。去符拉迪沃斯托克。', chapter: 4, rarity: 'rare',
        icon: '📷', unlockedBy: '通过第 404 关' },
      { id: 'letter_k734', type: 'prop', name: '老师的原始题面', title: '最后一份题面',
        description: '路路通茶馆旧址铁盒内最上方的一张白纸：你看到了这张地图，说明你已经走到了最后一步。这是老师留下的最后一份原始题面。她没有发完。', chapter: 6, rarity: 'rare',
        icon: '💌', unlockedBy: '通过第 604 关' },
      { id: 'scroll_seven', type: 'prop', name: '父亲的亲笔信', title: '苏州河 · 落款12月8日',
        description: '苏州河畔，沈墨静坐临水阶前，取出那只泛黄信封。指尖轻启，内里平整信纸上一行沉敛字迹：墨——我是你父亲。我走了，不是因为我不想等。落款日期12月8日。', chapter: 7, rarity: 'rare',
        icon: '📜', unlockedBy: '通过第 704 关' },
      { id: 'chart_mother', type: 'prop', name: '母亲的航线图', title: '符拉迪沃斯托克方向',
        description: '码头购票的船票目的地清晰标注：符拉迪沃斯托克。与父亲撤离路线、信纸标注方向、母亲照片留存的航海轨迹完全重合。', chapter: 7, rarity: 'rare',
        icon: '🗺️', unlockedBy: '通过第 705 关' },

      // ===== 周目继承道具（跨周目保留）=====
      { id: 'coin_vera', type: 'inherit', name: '薇拉的硬币', title: '旧书铺之约',
        description: '薇拉递出的一枚旧硬币，边缘已经磨损。旧书铺之约的凭证。', chapter: 1, rarity: 'rare',
        icon: '🪙', unlockedBy: '周目继承 · 待定' },
      { id: 'note_ito', type: 'inherit', name: '伊藤的纸条', title: '特高课的痕迹',
        description: '从伊藤身上落下的纸条，字迹潦草。特高课的痕迹。', chapter: 2, rarity: 'rare',
        icon: '📝', image: 'assets/images/items/item_unposted_letter.jpg', unlockedBy: '周目继承 · 待定' },
      // ---- V4.4：技巧收集（type:'technique'）——首次习得自动盖章收藏，对应 TeachingSystem.TECHNIQUE_INFO ----
      { id: 'tech_nakedSingle', type: 'technique', name: '裸单法', title: '基础 · 沈墨',
        description: '当一个格子只剩一个候选数时，那个数就是答案。', rarity: 'common', icon: '🧭',
        unlockedBy: '在解题中首次使用裸单法' },
      { id: 'tech_cageUnique', type: 'technique', name: '笼子唯一组合', title: '杀手 · 沈墨',
        description: '通过笼子的和值与候选约束，确定某个数字只能放在某一格。', rarity: 'common', icon: '🎯',
        unlockedBy: '在解题中首次使用唯一组合' },
      { id: 'tech_hiddenSingle', type: 'technique', name: '隐单法', title: '基础 · 沈墨',
        description: '在一行/列/宫中，某个数字只能放在一个格子里。', rarity: 'common', icon: '🔍',
        unlockedBy: '在解题中首次使用隐单法' },
      { id: 'tech_rule45', type: 'technique', name: '45法则', title: '杀手 · 苏晚',
        description: '每宫数字之和为45，利用跨宫笼子的内外差值推导数字。', rarity: 'rare', icon: '⚖️',
        unlockedBy: '在解题中首次使用45法则' },
      { id: 'tech_nakedPair', type: 'technique', name: '裸数对', title: '中级 · 苏晚',
        description: '两格共享相同两个候选数，则该两数必在此两格，其他格可排除。', rarity: 'rare', icon: '👥',
        unlockedBy: '在解题中首次使用裸数对' },
      { id: 'tech_hiddenPair', type: 'technique', name: '隐数对', title: '中级 · 苏晚',
        description: '两个数字只出现在相同的两格里，则这两格只能是这两个数。', rarity: 'rare', icon: '🕯️',
        unlockedBy: '在解题中首次使用隐数对' },
      { id: 'tech_pointingClaiming', type: 'technique', name: '区块排除', title: '中级 · 薇拉',
        description: '某宫某数字只在同一行/列，则该行/列其他宫的该数字可排除。', rarity: 'rare', icon: '📍',
        unlockedBy: '在解题中首次使用区块排除' },
      { id: 'tech_nakedTriplet', type: 'technique', name: '裸三数组', title: '高级 · 薇拉',
        description: '三格共享三个候选数，则这三数必在此三格，其他格可排除。', rarity: 'epic', icon: '🛶',
        unlockedBy: '在解题中首次使用裸三数组' },
      { id: 'tech_xWing', type: 'technique', name: '二连纵横阵', title: '高级 · 薇拉',
        description: '某数字在两行中仅出现在相同两列（或反之），构成X形，可排除其他行该数字。', rarity: 'epic', icon: '✖️',
        unlockedBy: '在解题中首次使用二连纵横阵' },
      { id: 'tech_swordfish', type: 'technique', name: '三才游鱼阵', title: '最高阶 · 伊藤',
        description: 'X-Wing 进阶：某数字在三行中仅出现在相同三列（或反之），可排除更多候选。', rarity: 'legend', icon: '🐟',
        unlockedBy: '在解题中首次使用三才游鱼阵' },
    ];
  }

  /**
   * 关卡 → 碎片 ID 映射（通关解锁）
   * @returns {Object<number,string>}
   */
  static get FRAGMENT_BY_LEVEL() {
    return {
      101: 'frag_ch1_1', 102: 'frag_ch1_2', 103: 'frag_ch1_3',
      104: 'frag_ch1_4', 105: 'frag_ch1_5', 106: 'frag_ch1_6',
      107: 'frag_ch1_7', 108: 'frag_ch1_8', 109: 'frag_ch1_9',
201: 'frag_ch2_1',
      202: 'frag_ch2_2',
      203: 'frag_ch2_3',
      204: 'frag_ch2_4',
      205: 'frag_ch2_5',
      206: 'frag_ch2_6',
      207: 'frag_ch2_7',
      208: 'frag_ch2_8',
      301: 'frag_ch3_1',
      302: 'frag_ch3_2',
      303: 'frag_ch3_3',
      304: 'frag_ch3_4',
      305: 'frag_ch3_5',
      306: 'frag_ch3_6',
      307: 'frag_ch3_7',
      401: 'frag_ch4_1',
      402: 'frag_ch4_2',
      403: 'frag_ch4_3',
      404: 'frag_ch4_4',
      405: 'frag_ch4_5',
      406: 'frag_ch4_6',
      407: 'frag_ch4_7',
      501: 'frag_ch5_1',
      502: 'frag_ch5_2',
      503: 'frag_ch5_3',
      504: 'frag_ch5_4',
      505: 'frag_ch5_5',
      506: 'frag_ch5_6',
      601: 'frag_ch6_1',
      602: 'frag_ch6_2',
      603: 'frag_ch6_3',
      604: 'frag_ch6_4',
      605: 'frag_ch6_5',
      606: 'frag_ch6_6',
      701: 'frag_ch7_1',
      702: 'frag_ch7_2',
      703: 'frag_ch7_3',
      704: 'frag_ch7_4',
      705: 'frag_ch7_5',
      706: 'frag_ch7_6',
      708: 'frag_ch7_8',
    };
  }

  /**
   * 关卡 → 关键剧情道具映射（通关解锁）
   * 108 → key_brass3（黄铜钥匙·编号3）、303 → ito_notebook（伊藤练习册）、401 → key4_94（钥匙·编号4）、
   * 404 → photo_mother（母亲旧照）、604 → letter_k734（老师原始题面）、704 → scroll_seven（父亲亲笔信）、
   * 705 → chart_mother（母亲航线图）
   * @returns {Object<number,string>}
   */
  static get KEY_ITEM_BY_LEVEL() {
    return {
      108: 'key_brass3',
      208: 'badge_abacus',
      303: 'ito_notebook',
      401: 'key4_94',
      404: 'photo_mother',
      604: 'letter_k734',
      704: 'scroll_seven',
      705: 'chart_mother',
    };
  }

  /**
   * 关键道具 id 白名单（供查询「是否持有某道具」）
   * @returns {string[]}
   */
  /**
   * 各章里程碑碎片解锁规则
   * type: 'collect_at_least'（集齐至少N枚）| 'beat_last_level'（通关最终关）| 'collect_all'（集齐全部）
   */
  static get FRAGMENT_MILESTONE_RULES() {
    return {
      2: [
        { id: 'frag_ch2_9', type: 'collect_at_least', threshold: 8 },
      ],
      3: [
        { id: 'frag_ch3_8', type: 'collect_at_least', threshold: 7 },
        { id: 'frag_ch3_9', type: 'beat_last_level' },
      ],
      4: [
        { id: 'frag_ch4_8', type: 'collect_at_least', threshold: 7 },
        { id: 'frag_ch4_9', type: 'beat_last_level' },
      ],
      5: [
        { id: 'frag_ch5_7', type: 'collect_at_least', threshold: 6 },
        { id: 'frag_ch5_8', type: 'beat_last_level' },
        { id: 'frag_ch5_9', type: 'collect_at_least', threshold: 8 },
      ],
      6: [
        { id: 'frag_ch6_7', type: 'collect_at_least', threshold: 6 },
        { id: 'frag_ch6_8', type: 'beat_last_level' },
        { id: 'frag_ch6_9', type: 'collect_at_least', threshold: 8 },
      ],
      7: [
        { id: 'frag_ch7_7', type: 'collect_at_least', threshold: 6 },
        { id: 'frag_ch7_9', type: 'beat_last_level' },
      ],
    };
  }

  /**
   * 每章最后一关 ID（用于「通关本章最终关」里程碑判断）
   */
  static get LAST_LEVEL_OF_CHAPTER() {
    return {
      1: 109, 2: 209, 3: 309, 4: 409, 5: 509, 6: 609, 7: 709,
    };
  }

  static get KEY_ITEM_IDS() {
    return ['key_brass3', 'badge_abacus', 'photo_mother', 'ito_notebook', 'key4_94', 'chart_mother', 'letter_k734', 'scroll_seven'];
  }

  /**
   * 周目继承道具 id 白名单
   * @returns {string[]}
   */
  static get INHERIT_ITEM_IDS() {
    return ['coin_vera', 'note_ito'];
  }

  /**
   * 技巧收集 id 白名单（V4.4：对应 DEFAULT_ITEMS 中 type:'technique' 的条目）
   * @returns {string[]}
   */
  static get TECHNIQUE_ITEM_IDS() {
    return ['tech_nakedSingle', 'tech_cageUnique', 'tech_hiddenSingle', 'tech_rule45', 'tech_nakedPair', 'tech_hiddenPair', 'tech_pointingClaiming', 'tech_nakedTriplet', 'tech_xWing', 'tech_swordfish'];
  }

  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - 挂载容器（可选；缺省为浮动层）
   * @param {Object}      [options.dataStore] - 可注入的 DataStore（默认 core/data-store.js）
   * @param {Function}    [options.onChange] - 解锁状态变更回调 (id, unlocked) => void
   * @param {Array}       [options.items] - 自定义图鉴数据（默认 DEFAULT_ITEMS）
   */
  constructor(options) {
    options = options || {};

    /** @type {HTMLElement|null} */
    this._container = options.container || null;

    /** @type {Object} */
    this._dataStore = options.dataStore || DataStore;

    /** @type {Function|null} */
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;

    /** @type {Array} 图鉴条目 */
    this._items = Array.isArray(options.items) ? options.items : GalleryPanel.DEFAULT_ITEMS;

    /** @type {boolean} */
    this._isOpen = false;

    /** @type {string} 当前收起/收集页签：all | prop | fragment | inherit */
    this._activeTab = 'all';

    /** @type {HTMLElement|null} */
    this._panel = null;
    this._stylesInjected = false;
  }

  // ============================================================
  //  解锁状态
  // ============================================================

  /**
   * 读取已解锁 id 数组（本地缓存 + DataStore）
   * @private
   */
  _loadUnlocked() {
    try {
      const arr = this._dataStore.get('unlocked', DataStore.GALLERY, []);
      return Array.isArray(arr) ? arr.slice() : [];
    } catch (e) {
      console.warn('[GalleryPanel] load unlocked failed:', e);
      return [];
    }
  }

  /**
   * 持久化已解锁数组
   * @private
   */
  _saveUnlocked(ids) {
    try {
      this._dataStore.set('unlocked', ids, DataStore.GALLERY);
      return true;
    } catch (e) {
      console.warn('[GalleryPanel] save unlocked failed:', e);
      return false;
    }
  }

  /**
   * 是否已解锁
   * @param {string} id - 图鉴条目 id
   * @returns {boolean}
   */
  isUnlocked(id) {
    try {
      return this._loadUnlocked().indexOf(id) >= 0;
    } catch (e) {
      console.warn('[GalleryPanel] isUnlocked error:', e);
      return false;
    }
  }

  /**
   * 解锁指定条目
   * @param {string} id
   * @returns {boolean} 是否首次解锁（已解锁返回 false）
   */
  unlockItem(id) {
    try {
      const ids = this._loadUnlocked();
      if (ids.indexOf(id) >= 0) return false;

      ids.push(id);
      this._saveUnlocked(ids);

      if (typeof this.onChange === 'function') {
        try { this.onChange(id, true); } catch (e) { console.warn('[GalleryPanel] onChange error:', e); }
      }
      return true;
    } catch (e) {
      console.warn('[GalleryPanel] unlockItem error:', e);
      return false;
    }
  }

  /**
   * 锁定指定条目（调试/重置用）
   * @param {string} id
   * @returns {boolean}
   */
  lockItem(id) {
    try {
      const ids = this._loadUnlocked().filter((x) => x !== id);
      this._saveUnlocked(ids);
      if (typeof this.onChange === 'function') {
        try { this.onChange(id, false); } catch (e) { console.warn('[GalleryPanel] onChange error:', e); }
      }
      return true;
    } catch (e) {
      console.warn('[GalleryPanel] lockItem error:', e);
      return false;
    }
  }
  // ============================================================
  //  StoryOrchestrator 兼容接口
  // ============================================================

  /**
   * 解锁角色（兼容接口）
   * @param {string|number} charId
   * @returns {boolean}
   */
  unlockCharacter(charId) {
    try {
      if (charId == null) return false;
      return this.unlockItem('char_' + charId);
    } catch (e) {
      console.warn('[GalleryPanel] unlockCharacter error:', e);
      return false;
    }
  }

  /**
   * 解锁背景（兼容接口）
   * @param {string} bgName
   * @returns {boolean}
   */
  unlockBackground(bgName) {
    try {
      if (bgName == null) return false;
      return this.unlockItem('bg_' + bgName.replace(/[^a-zA-Z0-9_]/g, '_'));
    } catch (e) {
      console.warn('[GalleryPanel] unlockBackground error:', e);
      return false;
    }
  }

  /**
   * 按关卡解锁对应档案碎片（通关触发）
   * @param {string|number} levelId
   * @returns {boolean} 是否首次解锁
   */
  unlockFragmentByLevel(levelId) {
    try {
      if (levelId == null) return false;
      const id = GalleryPanel.FRAGMENT_BY_LEVEL[Number(levelId)];
      if (!id) return false;
      return this.unlockItem(id);
    } catch (e) {
      console.warn('[GalleryPanel] unlockFragmentByLevel error:', e);
      return false;
    }
  }

  /**
   * 按关卡解锁对应关键剧情道具（通关触发，如 108 → 黄铜钥匙·编号3）
   * @param {string|number} levelId
   * @returns {boolean} 是否首次解锁
   */
  unlockKeyItemByLevel(levelId) {
    try {
      if (levelId == null) return false;
      const id = GalleryPanel.KEY_ITEM_BY_LEVEL[Number(levelId)];
      if (!id) return false;
      return this.unlockItem(id);
    } catch (e) {
      console.warn('[GalleryPanel] unlockKeyItemByLevel error:', e);
      return false;
    }
  }

  /**
   * 里程碑碎片解锁：每次通关后检查并解锁本章「集齐前N枚」「通关最终关」「集齐全部」类里程碑碎片
   * @param {string|number} chapterId
   * @param {number} levelId - 当前通关的关卡 id
   * @returns {string[]} 本次新解锁的碎片 id 列表
   */
  unlockMilestoneFragments(chapterId, levelId) {
    const granted = [];
    try {
      if (!chapterId || levelId == null) return granted;
      const ch = Number(chapterId);
      const lvl = Number(levelId);
      const MILESTONE_RULES = GalleryPanel.FRAGMENT_MILESTONE_RULES || {};
      const rules = MILESTONE_RULES[ch];
      if (!rules || !Array.isArray(rules)) return granted;

      const currentCount = this.getChapterFragmentCount(ch);
      const isLastLevel = this._isChapterLastLevel(ch, lvl);

      rules.forEach(rule => {
        const id = rule.id;
        if (!id || this.isUnlocked(id)) return;
        let ok = false;
        if (rule.type === 'collect_at_least' && currentCount >= rule.threshold) ok = true;
        else if (rule.type === 'beat_last_level' && isLastLevel) ok = true;
        else if (rule.type === 'collect_all' && currentCount >= 8) ok = true; // 含自身共9枚
        if (ok) {
          if (this.unlockItem(id)) granted.push(id);
        }
      });

      if (granted.length) console.log('[GalleryPanel] 里程碑碎片解锁:', granted.join(', '));
      return granted;
    } catch (e) {
      console.warn('[GalleryPanel] unlockMilestoneFragments error:', e);
      return granted;
    }
  }

  /**
   * 判断某关卡是否为该章的最后一关
   * @private
   */
  _isChapterLastLevel(chapterId, levelId) {
    try {
      const LAST_LEVEL_OF_CHAPTER = GalleryPanel.LAST_LEVEL_OF_CHAPTER || {};
      return LAST_LEVEL_OF_CHAPTER[Number(chapterId)] === Number(levelId);
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取某章已解锁碎片数量
   * @param {string|number} chapterId
   * @returns {number}
   */
  getChapterFragmentCount(chapterId) {
    try {
      const unlocked = new Set(this._loadUnlocked());
      let count = 0;
      for (let i = 1; i <= 9; i++) {
        if (unlocked.has('frag_ch' + chapterId + '_' + i)) count++;
      }
      return count;
    } catch (e) {
      console.warn('[GalleryPanel] getChapterFragmentCount error:', e);
      return 0;
    }
  }

  /**
   * 某章碎片是否集齐（每章 9 枚）
   * @param {string|number} chapterId
   * @returns {boolean}
   */
  hasAllChapterFragments(chapterId) {
    try {
      return this.getChapterFragmentCount(chapterId) >= 9;
    } catch (e) {
      console.warn('[GalleryPanel] hasAllChapterFragments error:', e);
      return false;
    }
  }

  /**
   * 是否持有指定关键 / 周目道具
   * @param {string} id
   * @returns {boolean}
   */
  hasItem(id) {
    try {
      return this.isUnlocked(id);
    } catch (e) {
      console.warn('[GalleryPanel] hasItem error:', e);
      return false;
    }
  }

  /**
   * 周目继承道具：进入二 / 三周目时，将上一周目继承的道具解锁。
   * persist 道具（INHERIT_ITEM_IDS）跨周目保留，缺省全部授予。
   * @param {number} [cycle] - 当前周目（≥2 才授予）
   * @param {string[]} [ids] - 限定授予的道具 id（缺省为全部周目继承道具）
   * @returns {string[]} 本次首次解锁的道具 id 列表
   */
  grantInheritItems(cycle, ids) {
    const granted = [];
    try {
      if (cycle != null && cycle < 2) return granted;
      const targets = (ids && ids.length) ? ids : GalleryPanel.INHERIT_ITEM_IDS;
      targets.forEach(id => {
        try {
          if (this.unlockItem(id)) granted.push(id);
        } catch (e) {
          console.warn('[GalleryPanel] grantInheritItems unlock error:', id, e);
        }
      });
      if (granted.length) console.log('[GalleryPanel] 周目继承道具已授予:', granted.join(', '));
      return granted;
    } catch (e) {
      console.warn('[GalleryPanel] grantInheritItems error:', e);
      return granted;
    }
  }

  /**
   * 获取某分类下已解锁碎片 / 道具数量
   * @param {string} type - 'fragment' | 'prop' | 'inherit'
   * @param {string|number} [chapterId]
   * @returns {number}
   */
  getCollectCount(type, chapterId) {
    try {
      const unlocked = new Set(this._loadUnlocked());
      let count = 0;
      for (const id of unlocked) {
        if (type === 'fragment' && chapterId != null && id.indexOf('frag_ch' + chapterId + '_') === 0) count++;
        else if (type === 'prop' && GalleryPanel.KEY_ITEM_IDS.indexOf(id) >= 0) count++;
        else if (type === 'inherit' && GalleryPanel.INHERIT_ITEM_IDS.indexOf(id) >= 0) count++;
      }
      return count;
    } catch (e) {
      console.warn('[GalleryPanel] getCollectCount error:', e);
      return 0;
    }
  }

  /**
   * 标记场景已读（兼容接口）
   * @param {string|number} chapterId
   * @param {string|number} levelId
   * @param {string} type
   */
  markSceneRead(chapterId, levelId, type) {
    try {
      if (!this._dataStore) return;
      this._dataStore.set('scene_' + chapterId + '_' + levelId + '_' + type, true, DataStore.GALLERY);
    } catch (e) {
      console.warn('[GalleryPanel] markSceneRead error:', e);
    }
  }

  /**
   * 获取全部图鉴条目（附带解锁状态与统计）
   * @returns {Array<Object>} [{ id, name, ..., unlocked, index }]
   */
  getAllItems() {
    try {
      const unlocked = new Set(this._loadUnlocked());
      return this._items.map((item, index) => Object.assign({}, item, {
        unlocked: unlocked.has(item.id),
        index: index,
      }));
    } catch (e) {
      console.warn('[GalleryPanel] getAllItems error:', e);
      return [];
    }
  }

  /**
   * 获取图鉴统计
   * @returns {{total:number, unlocked:number, progress:number}}
   */
  getStats() {
    try {
      const all = this.getAllItems();
      const unlocked = all.filter((item) => item.unlocked).length;
      return {
        total: all.length,
        unlocked: unlocked,
        progress: all.length > 0 ? Math.round(unlocked / all.length * 100) : 0,
      };
    } catch (e) {
      console.warn('[GalleryPanel] getStats error:', e);
      return { total: 0, unlocked: 0, progress: 0 };
    }
  }

  /**
   * 按类型分组获取
   * @returns {Object} { character: [], seal: [], collectible: [] }
   */
  getByType() {
    try {
      const result = { character: [], seal: [], collectible: [] };
      for (const item of this.getAllItems()) {
        const type = item.type in result ? item.type : 'collectible';
        result[type].push(item);
      }
      return result;
    } catch (e) {
      console.warn('[GalleryPanel] getByType error:', e);
      return { character: [], seal: [], collectible: [] };
    }
  }

  // ============================================================
  //  显示 / 隐藏
  // ============================================================

  /**
   * 打开图鉴面板
   * @returns {boolean}
   */
  open() {
    try {
      if (typeof document === 'undefined') return false;
      this._ensurePanel();
      if (!this._panel) return false;
      this._panel.innerHTML = '';
      const content = this._buildContent();
      if (content) {
        this._panel.appendChild(content);
      }
      this._panel.style.display = 'block';
      this._isOpen = true;
      // 上线审计修复：Escape 关闭浮动面板
      this._bindEscape();
      return true;
    } catch (e) {
      console.warn('[GalleryPanel] open error:', e);
      return false;
    }
  }

  /**
   * 上线审计修复：Escape 关闭面板（单次绑定）
   */
  _bindEscape() {
    try {
      if (this._escapeBound) return;
      this._escapeBound = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isOpen) {
          e.preventDefault();
          this.close();
        }
      });
    } catch (e) { /* 忽略 */ }
  }

  /**
   * 关闭图鉴面板
   */
  close() {
    try {
      if (this._panel) {
        this._panel.style.display = 'none';
      }
      this._isOpen = false;
    } catch (e) {
      console.warn('[GalleryPanel] close error:', e);
    }
  }

  /**
   * 是否打开
   * @returns {boolean}
   */
  isOpen() {
    return this._isOpen;
  }

  /**
   * 切换开/关
   */
  toggle() {
    try {
      if (this._isOpen) this.close();
      else this.open();
    } catch (e) {
      console.warn('[GalleryPanel] toggle error:', e);
    }
  }

  // ============================================================
  //  DOM
  // ============================================================

  /**
   * 惰性构建面板骨架
   * @private
   */
  _ensurePanel() {
    if (this._panel || typeof document === 'undefined') return;
    this._injectStyles();

    const panel = document.createElement('div');
    panel.className = 'cm-gallery';
    panel.style.display = 'none';

    if (this._container) {
      this._container.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }
    this._panel = panel;
  }

  /**
   * 构建图鉴内容
   * @private
   */
  _buildContent() {
    try {
      const wrap = document.createElement('div');

      // 头部
      const header = document.createElement('div');
      header.className = 'cm-gallery-header';
      const stats = this.getStats();
      header.innerHTML =
        '<span class="cm-gallery-title">' + I18n.t('ui.gallery.title') + '</span>' +
        '<span class="cm-gallery-count">' + stats.unlocked + '/' + stats.total +
        ' (' + stats.progress + '%)</span>';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'cm-gallery-close';
      closeBtn.textContent = '\u00D7';
      closeBtn.addEventListener('click', () => this.close());
      header.appendChild(closeBtn);
      wrap.appendChild(header);

      // 页签栏（图鉴 / 收集）
      const tabs = document.createElement('div');
      tabs.className = 'cm-gallery-tabs';
      const tabDefs = [
        { key: 'all', label: I18n.t('ui.gallery.tab.all') },
        { key: 'prop', label: I18n.t('ui.gallery.tab.prop') },
        { key: 'fragment', label: I18n.t('ui.gallery.tab.fragment') },
        { key: 'technique', label: I18n.t('ui.gallery.tab.technique') },
        { key: 'inherit', label: I18n.t('ui.gallery.tab.inherit') },
      ];
      tabDefs.forEach(def => {
        const btn = document.createElement('button');
        btn.className = 'cm-gallery-tab' + (def.key === this._activeTab ? ' cm-gallery-tab--active' : '');
        btn.textContent = def.label;
        btn.addEventListener('click', () => {
          this._activeTab = def.key;
          if (this._panel) this.open();
        });
        tabs.appendChild(btn);
      });
      wrap.appendChild(tabs);

      // 内容区
      const body = document.createElement('div');
      body.className = 'cm-gallery-body';
      body.appendChild(this._buildTabContent(this._activeTab));
      wrap.appendChild(body);

      return wrap;
    } catch (e) {
      console.warn('[GalleryPanel] _buildContent error:', e);
      const fallback = document.createElement('div');
      fallback.textContent = I18n.t('ui.gallery.loadError');
      return fallback;
    }
  }

  /**
   * 按页签构建内容区
   * @private
   */
  _buildTabContent(tab) {
    try {
      const items = this.getAllItems();
      if (tab === 'all') {
        const grid = document.createElement('div');
        grid.className = 'cm-gallery-grid';
        items.forEach(item => grid.appendChild(this._buildCard(item)));
        return grid;
      }
      if (tab === 'fragment') {
        return this._buildFragmentSection();
      }
      const ids = tab === 'prop' ? GalleryPanel.KEY_ITEM_IDS : (tab === 'technique' ? GalleryPanel.TECHNIQUE_ITEM_IDS : GalleryPanel.INHERIT_ITEM_IDS);
      const propItems = items.filter(item => ids.indexOf(item.id) >= 0);
      return this._buildGroupSection(tab, propItems);
    } catch (e) {
      console.warn('[GalleryPanel] _buildTabContent error:', e);
      const fallback = document.createElement('div');
      fallback.textContent = I18n.t('ui.gallery.contentError');
      return fallback;
    }
  }

  /**
   * 收藏碎片分组：按章节归档 + 进度条
   * @private
   */
  _buildFragmentSection() {
    const wrap = document.createElement('div');
    try {
      const items = this.getAllItems();
      const frags = items.filter(item => item.type === 'collectible' && item.id.indexOf('frag_') === 0);
      const byChapter = {};
      frags.forEach(it => { (byChapter[it.chapter] = byChapter[it.chapter] || []).push(it); });
      Object.keys(byChapter).sort((a, b) => a - b).forEach(ch => {
        const list = byChapter[ch];
        const unlocked = list.filter(it => it.unlocked).length;
        const pct = list.length ? Math.round(unlocked / list.length * 100) : 0;

        const box = document.createElement('div');
        box.className = 'cm-gallery-section';

        const title = document.createElement('div');
        title.className = 'cm-gallery-section-title';
        title.textContent = I18n.t('ui.gallery.chapterFragments', { chapter: ch, unlocked: unlocked, total: list.length });
        box.appendChild(title);

        const bar = document.createElement('div');
        bar.className = 'cm-gallery-progress';
        const fill = document.createElement('div');
        fill.className = 'cm-gallery-progress-fill';
        fill.style.width = pct + '%';
        const ptext = document.createElement('span');
        ptext.className = 'cm-gallery-progress-text';
        ptext.textContent = unlocked + '/' + list.length;
        bar.appendChild(fill);
        bar.appendChild(ptext);
        box.appendChild(bar);

        const grid = document.createElement('div');
        grid.className = 'cm-gallery-grid';
        list.forEach(it => grid.appendChild(this._buildCard(it)));
        box.appendChild(grid);

        wrap.appendChild(box);
      });
      return wrap;
    } catch (e) {
      console.warn('[GalleryPanel] _buildFragmentSection error:', e);
      return wrap;
    }
  }

  /**
   * 通用分组区（关键道具 / 周目继承）：标题 + 数量 + 卡片网格
   * @private
   */
  _buildGroupSection(tab, list) {
    const wrap = document.createElement('div');
    try {
      const unlocked = list.filter(it => it.unlocked).length;
      const label = tab === 'prop' ? I18n.t('ui.gallery.group.prop') : (tab === 'technique' ? I18n.t('ui.gallery.group.technique') : (tab === 'inherit' ? I18n.t('ui.gallery.group.inherit') : I18n.t('ui.gallery.group.collect')));
      const title = document.createElement('div');
      title.className = 'cm-gallery-section-title';
      title.textContent = label + '  ' + unlocked + '/' + list.length;
      wrap.appendChild(title);
      const grid = document.createElement('div');
      grid.className = 'cm-gallery-grid';
      list.forEach(it => grid.appendChild(this._buildCard(it)));
      wrap.appendChild(grid);
      return wrap;
    } catch (e) {
      console.warn('[GalleryPanel] _buildGroupSection error:', e);
      return wrap;
    }
  }

  /**
   * 构建单张图鉴卡片
   * @private
   */
  _buildCard(item) {
    try {
      const card = document.createElement('div');
      card.className = 'cm-gallery-card' + (item.unlocked ? ' cm-gallery-card--unlocked' : '');

      const icon = document.createElement('div');
      icon.className = 'cm-gallery-icon';
      if (item.unlocked && item.image) {
        // V4.3.33：接入立绘/CG 资源显示（替换 emoji 占位）
        icon.style.backgroundImage = "url('" + item.image + "')";
        icon.style.backgroundSize = 'cover';
        icon.style.backgroundPosition = 'center';
        icon.style.backgroundRepeat = 'no-repeat';
        icon.style.backgroundColor = 'transparent';
        icon.textContent = '';
      } else {
        icon.textContent = item.unlocked ? (item.icon || '') : '?';
      }

      const info = document.createElement('div');
      info.className = 'cm-gallery-info';

      const name = document.createElement('div');
      name.className = 'cm-gallery-name';
      name.textContent = item.unlocked ? this._tItem(item, 'name') : I18n.t('ui.gallery.locked');

      const title = document.createElement('div');
      title.className = 'cm-gallery-title-line';
      title.textContent = item.unlocked ? this._tItem(item, 'title') : '???';

      const desc = document.createElement('div');
      desc.className = 'cm-gallery-desc';
      desc.textContent = item.unlocked ? this._tItem(item, 'description') : (this._tItem(item, 'unlockedBy') || I18n.t('ui.gallery.unlockHint'));

      const meta = document.createElement('div');
      meta.className = 'cm-gallery-meta';
      if (item.type === 'technique') {
        // 技巧收集卡：不显示「章·稀有」，改显分类标题（title 已是「类型 · 角色」）
        meta.textContent = item.unlocked ? (item.title || '') : '???';
      } else {
        meta.textContent = I18n.t('ui.gallery.meta', { chapter: item.chapter, rarity: item.rarity });
      }

      info.appendChild(name);
      info.appendChild(title);
      info.appendChild(desc);
      info.appendChild(meta);
      card.appendChild(icon);
      card.appendChild(info);
      return card;
    } catch (e) {
      console.warn('[GalleryPanel] _buildCard error:', e);
      const fallback = document.createElement('div');
      fallback.className = 'cm-gallery-card';
      fallback.textContent = I18n.t('ui.gallery.cardError');
      return fallback;
    }
  }

  /**
   * 注入默认样式（首次构建面板时执行）
   * @private
   */
  _injectStyles() {
    if (this._stylesInjected || typeof document === 'undefined') return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'cm-gallery-style';
    style.textContent = [
      '/* P1：画廊面板 = 档案页（旧纸底 + 纹理叠层 + 墨描边） */',
      '.cm-gallery { position: fixed; right: 20px; top: 20px; width: 380px; max-width: calc(100vw - 24px);',
      '  max-height: 86vh;',
      '  overflow-y: auto; z-index: 9500; background-color: #f5f0e0; background-image:',
      '  repeating-linear-gradient(45deg, rgba(200,190,170,.03) 0px, rgba(200,190,170,.03) 1px, transparent 1px, transparent 3px),',
      '  radial-gradient(ellipse at 20% 30%, rgba(184,168,136,.05) 0%, transparent 60%);',
      '  border: 1px solid rgba(61,47,34,.5); border-radius: 8px;',
      '  box-shadow: 0 10px 30px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.28), inset 0 0 20px rgba(120,100,70,.16);',
      '  padding: 16px 18px; color: #3d2f22; }',
      '.cm-gallery-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px;',
      '  padding-bottom: 8px; border-bottom: 1px solid rgba(90,70,40,.4); }',
      '.cm-gallery-title { font-size: 16px; font-weight: 700; color: #3d2a1a; font-family: \'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif; letter-spacing: 2px; }',
      '.cm-gallery-count { font-size: 12px; color: var(--color-ink-muted); flex: 1; }',
      '.cm-gallery-close { border: 1px solid rgba(90,70,40,.5); background: rgba(255,255,255,.25); color: #5a4630;',
      '  border-radius: 5px; width: 26px; height: 26px; cursor: pointer; font-size: 15px; line-height: 1; }',
      '.cm-gallery-close:hover { border-color: #b8860b; color: #3d2a1a; }',
      '.cm-gallery-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }',
      '.cm-gallery-card { display: flex; gap: 10px; padding: 10px; border: 1px solid rgba(90,70,40,.3);',
      '  border-radius: 6px; background: rgba(237,229,208,.7); opacity: .62; filter: grayscale(.5); }',
      '.cm-gallery-card--unlocked { opacity: 1; filter: none; border-color: rgba(184,134,11,.6); }',
      '.cm-gallery-icon { flex-shrink: 0; width: 46px; height: 46px; border-radius: 6px;',
      '  background: #a08a70; color: #f5f0e0; font-size: 22px; display: flex; align-items: center;',
      '  justify-content: center; }',
      '.cm-gallery-card--unlocked .cm-gallery-icon { background: #b8860b; }',
      '.cm-gallery-info { min-width: 0; }',
      '.cm-gallery-name { font-size: 13px; font-weight: 600; color: #3a3229; }',
      '.cm-gallery-title-line { font-size: 11px; color: #8a5a3a; margin-bottom: 4px; }',
      '.cm-gallery-desc { font-size: 12px; color: var(--color-ink-muted); line-height: 1.5; margin-bottom: 6px; }',
      '.cm-gallery-meta { font-size: 10px; color: #6b4f33; }',
      '/* P1.1：页签栏 + 收集分组 + 进度条 */',
      '.cm-gallery-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }',
      '.cm-gallery-tab { border: 1px solid rgba(90,70,40,.4); background: rgba(237,229,208,.5); color: #5a4630;',
      '  border-radius: 5px; padding: 4px 10px; font-size: 12px; cursor: pointer; }',
      '.cm-gallery-tab--active { background: #7d5b0e; color: #f7f3e6; border-color: #7d5b0e; }',
      '.cm-gallery-body { display: flex; flex-direction: column; gap: 12px; }',
      '.cm-gallery-section-title { font-size: 13px; font-weight: 700; color: #3a3229; margin-bottom: 6px; }',
      '.cm-gallery-progress { position: relative; height: 12px; border-radius: 6px; background: rgba(90,70,40,.18);',
      '  margin-bottom: 8px; overflow: hidden; }',
      '.cm-gallery-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg,#b8860b,#d9a441); }',
      '.cm-gallery-progress-text { position: absolute; right: 6px; top: 0; bottom: 0; font-size: 10px;',
      '  line-height: 12px; color: #3a3229; }',
    ].join('\n');
    document.head.appendChild(style);
  }
}

export default GalleryPanel;

// ============================================================