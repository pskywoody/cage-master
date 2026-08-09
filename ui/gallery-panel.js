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

export class GalleryPanel {
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
      { id: 'char_2', type: 'character', name: '阿妍', title: '实习侦探',
        description: '初来档案馆的实习侦探，与守笼人一同调查旧案。', chapter: 2, rarity: 'common',
        icon: '🔍', image: 'assets/images/portraits/new/R_01_calm_default.png', unlockedBy: '完成第 2 章任意关卡' },
      { id: 'char_3', type: 'character', name: '设局人', title: '谜之来信者',
        description: '留下谜题与秘信的神秘人物，与守笼人曾是同门。', chapter: 3, rarity: 'rare',
        icon: '📃', image: 'assets/images/portraits/new/P_01_normal_default.png', unlockedBy: '完成第 3 章任意关卡' },
      { id: 'seal_1', type: 'seal', name: '星衡印记', title: '四十五星衡',
        description: '记载星衡法则的印记，破解手稿室谜题后获得。', chapter: 4, rarity: 'epic',
        icon: '⭐', unlockedBy: '完成第 4 章任意关卡' },
      { id: 'char_4', type: 'character', name: '档案员·零', title: '尘封旧案负责人',
        description: '残卷中的故人，其遗物牵出当年的决裂真相。', chapter: 5, rarity: 'epic',
        icon: '📖', image: 'assets/images/portraits/remnant_default.png', unlockedBy: '完成第 5 章任意关卡' },
      { id: 'seal_2', type: 'seal', name: '星辰梭核心', title: '终局之钥',
        description: '星辰梭的真正用途，与嵌套笼奥秘一同浮出水面。', chapter: 6, rarity: 'legendary',
        icon: '🔮', image: 'assets/images/portraits/weaver_default.png', unlockedBy: '完成第 6 章任意关卡' },
      { id: 'char_5', type: 'character', name: '秘术整理者', title: '秘术档案编纂人',
        description: '将六卷秘术手稿整理成册的守秘人。', chapter: 7, rarity: 'rare',
        icon: '📜', image: 'assets/images/portraits/setter_secret_default.png', unlockedBy: '完成第 7 章任意关卡' },
      { id: 'seal_3', type: 'seal', name: '归途星印', title: '星辰归途',
        description: '集齐七封密信方可开启的最终印记，通向档案馆最深处的答案。', chapter: 8, rarity: 'legendary',
        icon: '🌟', unlockedBy: '完成第 8 章任意关卡' },

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
      { id: 'frag_ch2_1', type: 'collectible', name: '档案碎片 · 壹', title: '天平初现',
        description: '天平厅内，左右各悬四枚砝码，天平纹丝不动。四十五法则从这里开始被铭刻。', chapter: 2, rarity: 'common',
        icon: '⚖️', unlockedBy: '通关第 201 关' },
      { id: 'frag_ch2_2', type: 'collectible', name: '档案碎片 · 贰', title: '砝码之语',
        description: '每一组砝码的和值都对应着一段密语——差值推演的法则，藏在砝码的起落之间。', chapter: 2, rarity: 'common',
        icon: '🧾', unlockedBy: '通关第 202 关' },
      { id: 'frag_ch2_3', type: 'collectible', name: '档案碎片 · 叁', title: '星衡学徒',
        description: '一枚黄铜算珠徽章落在石台上，这是四十五星衡的入门凭证。', chapter: 2, rarity: 'common',
        icon: '🏅', unlockedBy: '通关第 203 关' },
      { id: 'frag_ch2_4', type: 'collectible', name: '档案碎片 · 肆', title: '差值之网',
        description: '差值推演的蛛网铺满整间房间——每个数字都像蛛网上的节点，牵一发而动全身。', chapter: 2, rarity: 'common',
        icon: '🕸️', unlockedBy: '通关第 204 关' },
      { id: 'frag_ch2_5', type: 'collectible', name: '档案碎片 · 伍', title: '隐曜初窥',
        description: '某些数字被藏在笼子的阴影里，只有用差值法则才能让它们显形。', chapter: 2, rarity: 'common',
        icon: '🌑', unlockedBy: '通关第 205 关' },
      { id: 'frag_ch2_6', type: 'collectible', name: '档案碎片 · 陆', title: '星衡密信',
        description: '一封封卷着的密信从天平底座的暗格滚落，每封上都刻着四十五的标记。', chapter: 2, rarity: 'common',
        icon: '✉️', unlockedBy: '通关第 206 关' },
      { id: 'frag_ch2_7', type: 'collectible', name: '档案碎片 · 柒', title: '特高课痕迹',
        description: '从伊藤身上落下的纸条，字迹潦草，边缘被火焰烧去了一角。', chapter: 2, rarity: 'common',
        icon: '📝', unlockedBy: '通关第 207 关' },
      { id: 'frag_ch2_8', type: 'collectible', name: '档案碎片 · 捌', title: '学徒徽章',
        description: '四十五星衡的徽章在掌心发烫——你正式成为了星衡学徒。', chapter: 2, rarity: 'common',
        icon: '🎖️', unlockedBy: '通关第 208 关' },
      { id: 'frag_ch2_9', type: 'collectible', name: '档案碎片 · 玖', title: '星衡闭环',
        description: '天平、砝码、差值、隐曜——九枚碎片拼出完整的四十五星衡。', chapter: 2, rarity: 'common',
        icon: '🔗', unlockedBy: '集齐本章八枚碎片后解锁' },

      // ===== 第3章档案碎片（9枚，collectible）=====
      { id: 'frag_ch3_1', type: 'collectible', name: '档案碎片 · 壹', title: '旧书店回忆',
        description: '旧书店的地板咯吱作响，薇拉从书架最深处抽出一本封皮磨旧的书——那是档案室的旧索引。', chapter: 3, rarity: 'common',
        icon: '📚', unlockedBy: '通关第 301 关' },
      { id: 'frag_ch3_2', type: 'collectible', name: '档案碎片 · 贰', title: '四号桥底',
        description: '四号桥的桥墩下，潮湿的石壁上刻着三列数阵——行、列、宫区块的法则在此首次完整呈现。', chapter: 3, rarity: 'common',
        icon: '🌉', unlockedBy: '通关第 302 关' },
      { id: 'frag_ch3_3', type: 'collectible', name: '档案碎片 · 叁', title: '行块残影',
        description: '行区块的残影沿着走廊延伸——每一段都像被刀削过一样整齐。', chapter: 3, rarity: 'common',
        icon: '➡️', unlockedBy: '通关第 303 关' },
      { id: 'frag_ch3_4', type: 'collectible', name: '档案碎片 · 肆', title: '列块回声',
        description: '列区块的回声从穹顶落下——像是有人在头顶的另一层，用同样的节奏解题。', chapter: 3, rarity: 'common',
        icon: '⬇️', unlockedBy: '通关第 304 关' },
      { id: 'frag_ch3_5', type: 'collectible', name: '档案碎片 · 伍', title: '宫块重影',
        description: '宫区块的重影在转角处叠加——三个宫块像三面镜子，照出同一个答案。', chapter: 3, rarity: 'common',
        icon: '🔲', unlockedBy: '通关第 305 关' },
      { id: 'frag_ch3_6', type: 'collectible', name: '档案碎片 · 陆', title: '东余杭路 94 号',
        description: '一张泛黄的门牌照片——东余杭路94号。背面写着母亲的笔迹。', chapter: 3, rarity: 'common',
        icon: '🏠', unlockedBy: '通关第 306 关' },
      { id: 'frag_ch3_7', type: 'collectible', name: '档案碎片 · 柒', title: '母亲的照片',
        description: '母亲年轻时的照片，夹在一本旧书里。照片背面写着一个日期：1938。', chapter: 3, rarity: 'common',
        icon: '📷', unlockedBy: '通关第 307 关' },
      { id: 'frag_ch3_8', type: 'collectible', name: '档案碎片 · 捌', title: '档案室平面图',
        description: '档案室深层的平面图，标注着七条通道和九间密室。', chapter: 3, rarity: 'common',
        icon: '🗺️', unlockedBy: '集齐本章前七枚碎片后解锁' },
      { id: 'frag_ch3_9', type: 'collectible', name: '档案碎片 · 玖', title: '区块闭环',
        description: '行、列、宫、平面图、母亲的线索——九枚碎片拼出档案室深层的完整地图。', chapter: 3, rarity: 'common',
        icon: '🧩', unlockedBy: '通关本章最终关卡后解锁' },

      // ===== 第4章档案碎片（9枚，collectible）=====
      { id: 'frag_ch4_1', type: 'collectible', name: '档案碎片 · 壹', title: '藏书楼地下',
        description: '藏书楼地下B1层的空气里弥漫着旧纸的味道。尘封的卷宗架上，每一卷都锁着一道题。', chapter: 4, rarity: 'common',
        icon: '🏛️', unlockedBy: '通关第 401 关' },
      { id: 'frag_ch4_2', type: 'collectible', name: '档案碎片 · 贰', title: 'B1 笔记',
        description: '一本写满笔记的练习册——是设局人当年的草稿。字迹锋利，像在跟谁较劲。', chapter: 4, rarity: 'common',
        icon: '📒', unlockedBy: '通关第 402 关' },
      { id: 'frag_ch4_3', type: 'collectible', name: '档案碎片 · 叁', title: '并蒂锁痕',
        description: '显性数对的痕迹刻在石墙上——两个数字被牢牢锁在一起，其他地方再也容不下它们。', chapter: 4, rarity: 'common',
        icon: '🔗', unlockedBy: '通关第 403 关' },
      { id: 'frag_ch4_4', type: 'collectible', name: '档案碎片 · 肆', title: '三子法印',
        description: '三格锁三数的印记在B2密室地面浮现——像三兄弟手牵着手，不分开。', chapter: 4, rarity: 'common',
        icon: '🔢', unlockedBy: '通关第 404 关' },
      { id: 'frag_ch4_5', type: 'collectible', name: '档案碎片 · 伍', title: '笼内排除',
        description: '笼内的数字被逐一排除——剩下的那个，就是答案。', chapter: 4, rarity: 'common',
        icon: '⛓️', unlockedBy: '通关第 405 关' },
      { id: 'frag_ch4_6', type: 'collectible', name: '档案碎片 · 陆', title: '伊藤练习册',
        description: 'B2密室的铁柜里，一本伊藤的练习册——上面画满了密密麻麻的笼局。', chapter: 4, rarity: 'common',
        icon: '📓', unlockedBy: '通关第 406 关' },
      { id: 'frag_ch4_7', type: 'collectible', name: '档案碎片 · 柒', title: '隐性唯一',
        description: '藏得最深的那个数字，往往是最关键的。隐性唯一数，是黑暗里唯一的光。', chapter: 4, rarity: 'common',
        icon: '✨', unlockedBy: '通关第 410 关' },
      { id: 'frag_ch4_8', type: 'collectible', name: '档案碎片 · 捌', title: '父亲的信',
        description: 'B3入口处，父亲止步的地方，压着一封信——信上说，他没有走完这条路。', chapter: 4, rarity: 'common',
        icon: '💌', unlockedBy: '集齐本章前七枚碎片后解锁' },
      { id: 'frag_ch4_9', type: 'collectible', name: '档案碎片 · 玖', title: '旧案闭环',
        description: '笔记、练习册、父亲的信——九枚碎片拼出三十年前那场决裂的完整轮廓。', chapter: 4, rarity: 'common',
        icon: '📜', unlockedBy: '通关本章最终关卡后解锁' },

      // ===== 第5章档案碎片（9枚，collectible）=====
      { id: 'frag_ch5_1', type: 'collectible', name: '档案碎片 · 壹', title: '钥匙 · 编号 4',
        description: '匙柄刻着数字4的旧铜钥匙。它打开了东余杭路94号的门——那是嵌套笼关卡的入口。', chapter: 5, rarity: 'common',
        icon: '🔑', unlockedBy: '通关第 501 关' },
      { id: 'frag_ch5_2', type: 'collectible', name: '档案碎片 · 贰', title: '嵌套笼',
        description: '笼子里套着笼子——就像俄罗斯套娃，每一层都有自己的规则，也有自己的答案。', chapter: 5, rarity: 'common',
        icon: '🎁', unlockedBy: '通关第 502 关' },
      { id: 'frag_ch5_3', type: 'collectible', name: '档案碎片 · 叁', title: '异形笼',
        description: '笼子的形状不再规则——有的像星，有的像云，有的像一条蜿蜒的河。', chapter: 5, rarity: 'common',
        icon: '☁️', unlockedBy: '通关第 503 关' },
      { id: 'frag_ch5_4', type: 'collectible', name: '档案碎片 · 肆', title: '复合笼',
        description: '多个笼子交织在一起——它们共享边界，共享数字，也共享秘密。', chapter: 5, rarity: 'common',
        icon: '🔗', unlockedBy: '通关第 504 关' },
      { id: 'frag_ch5_5', type: 'collectible', name: '档案碎片 · 伍', title: '多宫星衡',
        description: '四十五法则在多个宫之间同时生效——像一张大网，把整个盘面都罩住了。', chapter: 5, rarity: 'common',
        icon: '🌟', unlockedBy: '通关第 505 关' },
      { id: 'frag_ch5_6', type: 'collectible', name: '档案碎片 · 陆', title: '母亲的航线',
        description: '母亲的航线指向符拉迪沃斯托克——那条路，她一个人走了很远。', chapter: 5, rarity: 'common',
        icon: '🧭', unlockedBy: '通关第 506 关' },
      { id: 'frag_ch5_7', type: 'collectible', name: '档案碎片 · 柒', title: '父亲的足迹',
        description: '父亲的足迹停在了东余杭路94号——那条路，他没有走完。', chapter: 5, rarity: 'common',
        icon: '👣', unlockedBy: '集齐本章前六枚碎片后解锁' },
      { id: 'frag_ch5_8', type: 'collectible', name: '档案碎片 · 捌', title: '星辰梭真相',
        description: '星辰梭的真正用途浮出水面——它不是武器，不是工具，是选择。', chapter: 5, rarity: 'common',
        icon: '💎', unlockedBy: '通关本章最终关卡后解锁' },
      { id: 'frag_ch5_9', type: 'collectible', name: '档案碎片 · 玖', title: '星辰闭环',
        description: '嵌套、异形、复合、多宫星衡——九枚碎片拼出星辰梭的完整核心。', chapter: 5, rarity: 'common',
        icon: '💫', unlockedBy: '集齐本章全部碎片后解锁' },

      // ===== 第6章档案碎片（9枚，collectible）=====
      { id: 'frag_ch6_1', type: 'collectible', name: '档案碎片 · 壹', title: '终局入口',
        description: '六道终局笼局的第一道门——设局人离开前留下的最后作品，就藏在这道门之后。', chapter: 6, rarity: 'common',
        icon: '🚪', unlockedBy: '通关第 601 关' },
      { id: 'frag_ch6_2', type: 'collectible', name: '档案碎片 · 贰', title: '极限推理',
        description: '推演市场走势、推演人群决策、推演战争胜负——星辰梭的边界一旦打开，后果不堪设想。', chapter: 6, rarity: 'common',
        icon: '🧠', unlockedBy: '通关第 602 关' },
      { id: 'frag_ch6_3', type: 'collectible', name: '档案碎片 · 叁', title: '设局人谜题 · 一',
        description: '设局人留声的第一问——「你知道为什么我能赢他吗？」', chapter: 6, rarity: 'common',
        icon: '❓', unlockedBy: '通关第 603 关' },
      { id: 'frag_ch6_4', type: 'collectible', name: '档案碎片 · 肆', title: '设局人谜题 · 二',
        description: '设局人留声的第二问——封存，还是释放？', chapter: 6, rarity: 'common',
        icon: '⚖️', unlockedBy: '通关第 604 关' },
      { id: 'frag_ch6_5', type: 'collectible', name: '档案碎片 · 伍', title: '设局人谜题 · 三',
        description: '设局人留声的第三问——网撒下去的时候，鱼已经不在水里了。', chapter: 6, rarity: 'common',
        icon: '🕸️', unlockedBy: '通关第 605 关' },
      { id: 'frag_ch6_6', type: 'collectible', name: '档案碎片 · 陆', title: '终极笼局',
        description: '二十三个提示数——设局人毕生的巅峰之作。', chapter: 6, rarity: 'common',
        icon: '👑', unlockedBy: '通关第 606 关' },
      { id: 'frag_ch6_7', type: 'collectible', name: '档案碎片 · 柒', title: '封存与释放',
        description: '两道箭头——一个指向封存，一个指向释放。选择，落在了沈墨手上。', chapter: 6, rarity: 'common',
        icon: '🔒', unlockedBy: '集齐本章前六枚碎片后解锁' },
      { id: 'frag_ch6_8', type: 'collectible', name: '档案碎片 · 捌', title: '那封信',
        description: '信纸在蓝光中微微反光——「档案编号K七三四。如果你能解开这一局，就能找到我。」', chapter: 6, rarity: 'common',
        icon: '💌', unlockedBy: '通关本章最终关卡后解锁' },
      { id: 'frag_ch6_9', type: 'collectible', name: '档案碎片 · 玖', title: '终局闭环',
        description: '六道终局、三个问题、两个选择、一封信——九枚碎片拼出终局笼局的完整答案。', chapter: 6, rarity: 'common',
        icon: '🏁', unlockedBy: '集齐本章全部碎片后解锁' },

      // ===== 第7章档案碎片（9枚，collectible）=====
      { id: 'frag_ch7_1', type: 'collectible', name: '档案碎片 · 壹', title: '并蒂锁卷',
        description: '第一卷——并蒂锁。双星并蒂，闭户成局。', chapter: 7, rarity: 'common',
        icon: '🔒', unlockedBy: '通关第 701 关' },
      { id: 'frag_ch7_2', type: 'collectible', name: '档案碎片 · 贰', title: '隐曜卷',
        description: '第二卷——隐曜。群曜遮目，一光独隐。', chapter: 7, rarity: 'common',
        icon: '🌑', unlockedBy: '通关第 702 关' },
      { id: 'frag_ch7_3', type: 'collectible', name: '档案碎片 · 叁', title: '三子卷',
        description: '第三卷——三子法。三子连阵，锁数成局。', chapter: 7, rarity: 'common',
        icon: '🔢', unlockedBy: '通关第 703 关' },
      { id: 'frag_ch7_4', type: 'collectible', name: '档案碎片 · 肆', title: '剑鱼卷',
        description: '第四卷——剑鱼。三行三列，网罗全局。', chapter: 7, rarity: 'common',
        icon: '🐟', unlockedBy: '通关第 704 关' },
      { id: 'frag_ch7_5', type: 'collectible', name: '档案碎片 · 伍', title: 'X 翼卷',
        description: '第五卷——X翼。四角成阵，对角线锁。', chapter: 7, rarity: 'common',
        icon: '✖️', unlockedBy: '通关第 705 关' },
      { id: 'frag_ch7_6', type: 'collectible', name: '档案碎片 · 陆', title: 'XY 翼卷',
        description: '第六卷——XY翼。三格联动，一翅定局。', chapter: 7, rarity: 'common',
        icon: '🪽', unlockedBy: '通关第 706 关' },
      { id: 'frag_ch7_7', type: 'collectible', name: '档案碎片 · 柒', title: '第七卷暗格',
        description: '「非星辰梭传人不得开启」的暗格——第七卷，在里面。', chapter: 7, rarity: 'common',
        icon: '📜', unlockedBy: '集齐本章前六枚碎片后解锁' },
      { id: 'frag_ch7_8', type: 'collectible', name: '档案碎片 · 捌', title: '星辰之眼',
        description: '隐藏关——星辰之眼。设局人毕生心血的结晶。', chapter: 7, rarity: 'common',
        icon: '👁️', unlockedBy: '通关第 799 关' },
      { id: 'frag_ch7_9', type: 'collectible', name: '档案碎片 · 玖', title: '秘术闭环',
        description: '六卷秘术，一枚暗格，一道隐藏关——九枚碎片拼出秘术档案的全部秘密。', chapter: 7, rarity: 'common',
        icon: '📚', unlockedBy: '通关本章最终关卡后解锁' },

      // ===== 第8章档案碎片（9枚，collectible）=====
      { id: 'frag_ch8_1', type: 'collectible', name: '档案碎片 · 壹', title: '门扉 · 壹',
        description: '古铜门扉上的第一道锁——归途启程。', chapter: 8, rarity: 'common',
        icon: '🚪', unlockedBy: '通关第 801 关' },
      { id: 'frag_ch8_2', type: 'collectible', name: '档案碎片 · 贰', title: '门扉 · 贰',
        description: '星印初现——星印中央的那枚数字，是整盘的关键。', chapter: 8, rarity: 'common',
        icon: '⭐', unlockedBy: '通关第 802 关' },
      { id: 'frag_ch8_3', type: 'collectible', name: '档案碎片 · 叁', title: '门扉 · 叁',
        description: '守笼人之匙——三十年前，他在这里犹豫过。', chapter: 8, rarity: 'common',
        icon: '🗝️', unlockedBy: '通关第 803 关' },
      { id: 'frag_ch8_4', type: 'collectible', name: '档案碎片 · 肆', title: '门扉 · 肆',
        description: '归途星印——设局人毕生所学凝聚的最后一枚印记。', chapter: 8, rarity: 'common',
        icon: '🌟', unlockedBy: '通关第 804 关' },
      { id: 'frag_ch8_5', type: 'collectible', name: '档案碎片 · 伍', title: '门扉 · 伍',
        description: '门扉两抉——留下，还是离开？', chapter: 8, rarity: 'common',
        icon: '🚪', unlockedBy: '通关第 805 关' },
      { id: 'frag_ch8_6', type: 'collectible', name: '档案碎片 · 陆', title: '门扉 · 陆',
        description: '星辰归途——最后一格，转了。门开了。', chapter: 8, rarity: 'common',
        icon: '🌌', unlockedBy: '通关第 806 关' },
      { id: 'frag_ch8_7', type: 'collectible', name: '档案碎片 · 柒', title: '门后之光',
        description: '门后没有秘密。门后，只有你已经走完的、属于自己的路。', chapter: 8, rarity: 'common',
        icon: '☀️', unlockedBy: '集齐本章前六枚碎片后解锁' },
      { id: 'frag_ch8_8', type: 'collectible', name: '档案碎片 · 捌', title: '守笼人释然',
        description: '我守了三十年的门，终于开了。', chapter: 8, rarity: 'common',
        icon: '😊', unlockedBy: '通关本章最终关卡后解锁' },
      { id: 'frag_ch8_9', type: 'collectible', name: '档案碎片 · 玖', title: '归途闭环',
        description: '六道锁、一束光、三十年——九枚碎片拼出星辰归途的完整轮回。', chapter: 8, rarity: 'common',
        icon: '🔄', unlockedBy: '集齐本章全部碎片后解锁' },

      

      // ===== 关键剧情道具（108 夹层遗物 → 黄铜钥匙 · 编号3）=====
      { id: 'key_brass3', type: 'prop', name: '黄铜钥匙 · 编号3', title: '父亲的遗物',
        description: '夹层石室的一只蒙尘旧木箱里，沈墨在泛黄绢纸中发现这把黄铜小钥匙，编号为3。纸上几行模糊字迹，是他父亲的笔迹——多年以前，他的父亲，也曾来过这里。用途仍是谜。', chapter: 1, rarity: 'rare',
        icon: '🔑', image: 'assets/images/items/item_key.jpg', unlockedBy: '通过第 108 关「夹层遗物」' },

      // ===== 关键剧情道具（后续章节）=====
      { id: 'badge_abacus', type: 'prop', name: '徽章 · 星衡学徒', title: '黄铜算珠徽章',
        description: '四十五星衡的入门凭证，边缘刻着一圈细密算珠纹。它是深入档案室深层的入场资格。', chapter: 2, rarity: 'rare',
        icon: '🏅', unlockedBy: '通过第 208 关' },
      { id: 'key4_94', type: 'prop', name: '钥匙 · 编号4', title: '东余杭路 94 号',
        description: '匙柄刻着数字4的旧铜钥匙。它能打开东余杭路94号的门——那是进入嵌套笼关卡的门。', chapter: 5, rarity: 'rare',
        icon: '🔑', image: 'assets/images/items/item_key.jpg', unlockedBy: '通过第 501 关' },
      { id: 'key_cagekeeper', type: 'prop', name: '守笼人的钥匙', title: '终章 · 待抉择',
        description: '守笼人递来的古旧钥匙。「选择留下」或「不接」，将引向不同的结局。', chapter: 8, rarity: 'legendary',
        icon: '🗝️', image: 'assets/images/items/item_key.jpg', unlockedBy: '通关终章剧情' },

      // ===== 新增关键剧情道具（第3-7章补充）=====
      { id: 'photo_mother', type: 'prop', name: '母亲的旧照片', title: '东余杭路 94 号',
        description: '从档案室深处的卷宗里找到的母亲旧照，背面写着1938年的日期和一个地址。', chapter: 3, rarity: 'rare',
        icon: '📷', unlockedBy: '通过第 307 关' },
      { id: 'ito_notebook', type: 'prop', name: '伊藤的练习册', title: 'B2 密室遗物',
        description: '从藏书楼B2密室铁柜中找到的练习册，上面画满密密麻麻的笼局。伊藤当年也曾深入这里。', chapter: 4, rarity: 'rare',
        icon: '📓', unlockedBy: '通过第 406 关' },
      { id: 'chart_mother', type: 'prop', name: '母亲的航线图', title: '符拉迪沃斯托克方向',
        description: '从东余杭路94号暗墙里取出的航线图，标注着母亲当年的去向——符拉迪沃斯托克。', chapter: 5, rarity: 'rare',
        icon: '🗺️', unlockedBy: '通过第 506 关' },
      { id: 'letter_k734', type: 'prop', name: '信 · 档案编号 K734', title: '设局人的邀请',
        description: '从蓝光中浮现的信纸，上面写着「档案编号K七三四。如果你能解开这一局，就能找到我。」字迹与父亲信中一致，折法却不同。', chapter: 6, rarity: 'rare',
        icon: '💌', unlockedBy: '通过第 606 关' },
      { id: 'scroll_seven', type: 'prop', name: '第七卷秘术', title: '暗格中的秘卷',
        description: '从「非星辰梭传人不得开启」的暗格中取出的第七卷秘术竹简，记载着设局人最深的秘术——星辰之眼。', chapter: 7, rarity: 'rare',
        icon: '📜', unlockedBy: '通过第 706 关' },

      // ===== 周目继承道具（跨周目保留）=====
      { id: 'coin_vera', type: 'inherit', name: '薇拉的硬币', title: '旧书铺之约',
        description: '薇拉递出的一枚旧硬币，边缘已经磨损。二 / 三周目再访旧书铺时，这枚硬币会让她记起你。', chapter: 1, rarity: 'rare',
        icon: '🪙', unlockedBy: '周目继承 · 待定' },
      { id: 'note_ito', type: 'inherit', name: '伊藤的纸条', title: '特高课的痕迹',
        description: '从伊藤身上落下的纸条，字迹潦草。二 / 三周目携带它，会牵出隐藏的新线索。', chapter: 2, rarity: 'rare',
        icon: '📝', image: 'assets/images/items/item_unposted_letter.jpg', unlockedBy: '周目继承 · 待定' },
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
      410: 'frag_ch4_7',
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
      799: 'frag_ch7_8',
      801: 'frag_ch8_1',
      802: 'frag_ch8_2',
      803: 'frag_ch8_3',
      804: 'frag_ch8_4',
      805: 'frag_ch8_5',
      806: 'frag_ch8_6',
    };
  }

  /**
   * 关卡 → 关键剧情道具映射（通关解锁）
   * 后续可扩展：208 → badge_abacus（星衡学徒徽章）、501 → key4_94（钥匙·编号4）
   * @returns {Object<number,string>}
   */
  static get KEY_ITEM_BY_LEVEL() {
    return {
      108: 'key_brass3',
      208: 'badge_abacus',
      501: 'key4_94',
      307: 'photo_mother',
      406: 'ito_notebook',
      506: 'chart_mother',
      606: 'letter_k734',
      706: 'scroll_seven',
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
      8: [
        { id: 'frag_ch8_7', type: 'collect_at_least', threshold: 6 },
        { id: 'frag_ch8_8', type: 'beat_last_level' },
        { id: 'frag_ch8_9', type: 'collect_at_least', threshold: 8 },
      ],
    };
  }

  /**
   * 每章最后一关 ID（用于「通关本章最终关」里程碑判断）
   */
  static get LAST_LEVEL_OF_CHAPTER() {
    return {
      1: 109, 2: 208, 3: 307, 4: 410, 5: 506, 6: 606, 7: 706, 8: 806,
    };
  }

  static get KEY_ITEM_IDS() {
    return ['key_brass3', 'badge_abacus', 'photo_mother', 'ito_notebook', 'key4_94', 'chart_mother', 'letter_k734', 'scroll_seven', 'key_cagekeeper'];
  }

  /**
   * 周目继承道具 id 白名单
   * @returns {string[]}
   */
  static get INHERIT_ITEM_IDS() {
    return ['coin_vera', 'note_ito'];
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
      return true;
    } catch (e) {
      console.warn('[GalleryPanel] open error:', e);
      return false;
    }
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
        '<span class="cm-gallery-title">\uD83D\uDD0D \u56FE\u9274</span>' +
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
        { key: 'all', label: '\u56FE\u9274' },
        { key: 'prop', label: '\u5173\u952E\u9053\u5177' },
        { key: 'fragment', label: '\u6536\u85CF\u788E\u7247' },
        { key: 'inherit', label: '\u5468\u76EE\u7EE7\u627F' },
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
      fallback.textContent = '图鉴内容加载失败';
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
      const ids = tab === 'prop' ? GalleryPanel.KEY_ITEM_IDS : GalleryPanel.INHERIT_ITEM_IDS;
      const propItems = items.filter(item => ids.indexOf(item.id) >= 0);
      return this._buildGroupSection(tab, propItems);
    } catch (e) {
      console.warn('[GalleryPanel] _buildTabContent error:', e);
      const fallback = document.createElement('div');
      fallback.textContent = '内容加载失败';
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
        title.textContent = '\u7B2C' + ch + '\u7AE0 \u788E\u7247  ' + unlocked + '/' + list.length;
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
      const label = tab === 'prop' ? '\u5173\u952E\u9053\u5177' : (tab === 'inherit' ? '\u5468\u76EE\u7EE7\u627F' : '\u6536\u85CF');
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
      name.textContent = item.unlocked ? item.name : '\u672A\u89E3\u9501';

      const title = document.createElement('div');
      title.className = 'cm-gallery-title-line';
      title.textContent = item.unlocked ? item.title : '???';

      const desc = document.createElement('div');
      desc.className = 'cm-gallery-desc';
      desc.textContent = item.unlocked ? item.description : item.unlockedBy || '\u5B8C\u6210\u5BF9\u5E94\u5173\u5361\u5373\u53EF\u89E3\u9501';

      const meta = document.createElement('div');
      meta.className = 'cm-gallery-meta';
      meta.textContent = '第 ' + item.chapter + ' 章 · ' + item.rarity;

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
      fallback.textContent = '卡片加载失败';
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
      '.cm-gallery { position: fixed; right: 20px; top: 20px; width: 380px; max-height: 86vh;',
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
      '.cm-gallery-meta { font-size: 10px; color: #a08a70; }',
      '/* P1.1：页签栏 + 收集分组 + 进度条 */',
      '.cm-gallery-tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }',
      '.cm-gallery-tab { border: 1px solid rgba(90,70,40,.4); background: rgba(237,229,208,.5); color: #5a4630;',
      '  border-radius: 5px; padding: 4px 10px; font-size: 12px; cursor: pointer; }',
      '.cm-gallery-tab--active { background: #b8860b; color: #f5f0e0; border-color: #b8860b; }',
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