/**
 * ============================================================
 *  DialogueDatabase - 台词数据库与运行时追踪器
 * ============================================================
 *
 *  管理所有角色台词，支持按类型、角色、标签查询，
 *  并追踪已使用的台词，避免重复。
 *
 *  台词类型（DialogueType）：
 *  - direction: 方向性引导（"看那边"）
 *  - strategy: 策略性引导（"试试这个思路"）
 *  - note_guide: 笔记引导（"先标记笔记"）
 *  - eureka: Eureka赞美（"漂亮！"）
 *  - tease: 吐槽/激将
 *  - answer: 直接给答案
 *  - error: 说错版本
 *
 *  使用限制（DialogueUsage）：
 *  - maxPerLevel: 每关最大触发次数
 *  - cooldown: 冷却时间（秒）
 *  - priority: 优先级（1=普通，2=优先，3=强制）
 *
 * ============================================================
 */

// ============================================================
//  类型定义
// ============================================================

/**
 * @typedef {'direction'|'strategy'|'note_guide'|'eureka'|'tease'|'answer'|'error'} DialogueType
 */

/**
 * @typedef {Object} DialogueUsage
 * @property {number} maxPerLevel - 每关最大触发次数
 * @property {number} cooldown - 冷却时间（秒）
 * @property {number} priority - 优先级 1-3
 */

/**
 * @typedef {Object} DialogueLine
 * @property {string} id - 台词ID
 * @property {'ray'|'keeper'|'plotter'} speaker - 说话角色
 * @property {string} text - 台词文本
 * @property {DialogueType} type - 台词类型
 * @property {string[]} tags - 标签
 * @property {DialogueUsage} usage - 使用限制
 * @property {Object} [conditions] - 触发条件
 * @property {string} [errorType] - 错误类型（'position'|'value'|'random'）
 */

// ============================================================
//  内置台词数据
// ============================================================

const BUILTIN_DIALOGUES = [
  // ========================================================
  //  阿岩台词（ray）- 活泼/吐槽型
  // ========================================================

  // --- 方向性引导 (direction) ---
  {
    id: 'ray_dir_001',
    speaker: 'ray',
    text: '喂！那边那个格子空了多久了？你看不见吗？',
    type: 'direction',
    tags: ['casual', 'point'],
    usage: { maxPerLevel: 3, cooldown: 30, priority: 2 },
  },
  {
    id: 'ray_dir_002',
    speaker: 'ray',
    text: '看这里看这里！这一行就剩一个空了！',
    type: 'direction',
    tags: ['casual', 'excited'],
    usage: { maxPerLevel: 3, cooldown: 30, priority: 2 },
  },
  {
    id: 'ray_dir_003',
    speaker: 'ray',
    text: '你在同一行点了五次了！换个地方试试好不好！',
    type: 'direction',
    tags: ['tease', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 45, priority: 1 },
  },
  {
    id: 'ray_dir_004',
    speaker: 'ray',
    text: '那个笼子！就差一个数了！',
    type: 'direction',
    tags: ['cage', 'excited'],
    usage: { maxPerLevel: 3, cooldown: 30, priority: 2 },
  },
  {
    id: 'ray_dir_005',
    speaker: 'ray',
    text: '左下角！左下角你看了吗？',
    type: 'direction',
    tags: ['spatial', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 40, priority: 1 },
  },

  // --- 策略性引导 (strategy) ---
  {
    id: 'ray_strat_001',
    speaker: 'ray',
    text: '先把能确定的都填了，剩下的就简单了！',
    type: 'strategy',
    tags: ['advice', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 2 },
  },
  {
    id: 'ray_strat_002',
    speaker: 'ray',
    text: '这个笼子的和是固定的，倒着推试试？',
    type: 'strategy',
    tags: ['cage', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 2 },
  },
  {
    id: 'ray_strat_003',
    speaker: 'ray',
    text: '试试星衡法则！一整行加起来肯定是45嘛！',
    type: 'strategy',
    tags: ['rule45', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 2 },
  },

  // --- 笔记引导 (note_guide) ---
  {
    id: 'ray_note_001',
    speaker: 'ray',
    text: '别光看啊！先把笔记标上！',
    type: 'note_guide',
    tags: ['encourage', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 2 },
  },
  {
    id: 'ray_note_002',
    speaker: 'ray',
    text: '好记性不如烂笔头！标记一下嘛！',
    type: 'note_guide',
    tags: ['encourage', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 1 },
  },

  // --- Eureka赞美 (eureka) ---
  {
    id: 'ray_eureka_001',
    speaker: 'ray',
    text: '对！就是这样！手感来了别停！',
    type: 'eureka',
    tags: ['praise', 'excited'],
    usage: { maxPerLevel: 99, cooldown: 10, priority: 3 },
  },
  {
    id: 'ray_eureka_002',
    speaker: 'ray',
    text: '漂亮！这一下连锁反应太爽了！',
    type: 'eureka',
    tags: ['praise', 'excited'],
    usage: { maxPerLevel: 99, cooldown: 10, priority: 3 },
  },
  {
    id: 'ray_eureka_003',
    speaker: 'ray',
    text: '卧槽你也太强了吧！',
    type: 'eureka',
    tags: ['praise', 'surprised'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },
  {
    id: 'ray_eureka_004',
    speaker: 'ray',
    text: '神之一手！这就是神之一手！',
    type: 'eureka',
    tags: ['praise', 'excited'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },

  // --- 吐槽 (tease) ---
  {
    id: 'ray_tease_001',
    speaker: 'ray',
    text: '不是吧，这一行就剩一个空了，你还能卡住？',
    type: 'tease',
    tags: ['tease', 'casual'],
    usage: { maxPerLevel: 5, cooldown: 45, priority: 1 },
  },
  {
    id: 'ray_tease_002',
    speaker: 'ray',
    text: '喂喂喂，你睡着了吗？',
    type: 'tease',
    tags: ['tease', 'casual'],
    usage: { maxPerLevel: 3, cooldown: 60, priority: 1 },
  },
  {
    id: 'ray_tease_003',
    speaker: 'ray',
    text: '我都快睡着了……',
    type: 'tease',
    tags: ['tease', 'bored'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 1 },
  },

  // --- 答案 (answer) ---
  {
    id: 'ray_answer_001',
    speaker: 'ray',
    text: '行行行！就是5！快填！别磨蹭！',
    type: 'answer',
    tags: ['impatient', 'casual'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },
  {
    id: 'ray_answer_002',
    speaker: 'ray',
    text: '我都把答案拍你脸上了！你还能填错？！',
    type: 'answer',
    tags: ['surprised', 'casual'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },

  // --- 说错版本 (error) - 位置说错 ---
  {
    id: 'ray_err_pos_001',
    speaker: 'ray',
    text: '喂！第5行第4列……哦不对，是第3行第4列！我说顺嘴了！',
    type: 'error',
    tags: ['error_position', 'cute'],
    errorType: 'position',
    usage: { maxPerLevel: 2, cooldown: 120, priority: 2 },
  },
  {
    id: 'ray_err_pos_002',
    speaker: 'ray',
    text: '看那个……嗯……第几行来着？哦对！第7行！',
    type: 'error',
    tags: ['error_position', 'confused'],
    errorType: 'position',
    usage: { maxPerLevel: 2, cooldown: 120, priority: 1 },
  },

  // --- 说错版本 (error) - 数字说错 ---
  {
    id: 'ray_err_val_001',
    speaker: 'ray',
    text: '那个格填3……啊？不是3吗？……哦是5！你当我没说！',
    type: 'error',
    tags: ['error_value', 'cute'],
    errorType: 'value',
    usage: { maxPerLevel: 1, cooldown: 180, priority: 2 },
  },
  {
    id: 'ray_err_val_002',
    speaker: 'ray',
    text: '这一格填……嗯……好像是……算了你自己看！',
    type: 'error',
    tags: ['error_value', 'give_up'],
    errorType: 'random',
    usage: { maxPerLevel: 1, cooldown: 180, priority: 1 },
  },

  // ========================================================
  //  守笼人台词（keeper）- 儒雅/指引型
  // ========================================================

  // --- 方向性引导 (direction) ---
  {
    id: 'keeper_dir_001',
    speaker: 'keeper',
    text: '第3行第4列，尚有未察之数。',
    type: 'direction',
    tags: ['formal', 'point'],
    usage: { maxPerLevel: 3, cooldown: 45, priority: 2 },
  },
  {
    id: 'keeper_dir_002',
    speaker: 'keeper',
    text: '宫内的和已经明确，余数即答案。',
    type: 'direction',
    tags: ['formal', 'box'],
    usage: { maxPerLevel: 3, cooldown: 45, priority: 2 },
  },
  {
    id: 'keeper_dir_003',
    speaker: 'keeper',
    text: '笼子边缘的那一格，或许就是突破口。',
    type: 'direction',
    tags: ['formal', 'cage'],
    usage: { maxPerLevel: 3, cooldown: 45, priority: 2 },
  },
  {
    id: 'keeper_dir_004',
    speaker: 'keeper',
    text: '纵览全局，勿困于一隅。',
    type: 'direction',
    tags: ['formal', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 1 },
  },

  // --- 策略性引导 (strategy) ---
  {
    id: 'keeper_strat_001',
    speaker: 'keeper',
    text: '以45为基，行和列和皆可推算。',
    type: 'strategy',
    tags: ['rule45', 'formal'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 2 },
  },
  {
    id: 'keeper_strat_002',
    speaker: 'keeper',
    text: '数对排除，可收奇效。',
    type: 'strategy',
    tags: ['pair', 'formal'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 2 },
  },

  // --- 笔记引导 (note_guide) ---
  {
    id: 'keeper_note_001',
    speaker: 'keeper',
    text: '笔记标记，乃推理之基。',
    type: 'note_guide',
    tags: ['formal', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 2 },
  },
  {
    id: 'keeper_note_002',
    speaker: 'keeper',
    text: '心算易漏，笔耕不辍。',
    type: 'note_guide',
    tags: ['formal', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 1 },
  },

  // --- Eureka赞美 (eureka) ---
  {
    id: 'keeper_eureka_001',
    speaker: 'keeper',
    text: '妙。此一子，盘活全局。',
    type: 'eureka',
    tags: ['praise', 'formal'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },
  {
    id: 'keeper_eureka_002',
    speaker: 'keeper',
    text: '你已接近正确。不妨再看一眼。',
    type: 'eureka',
    tags: ['encourage', 'formal'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },
  {
    id: 'keeper_eureka_003',
    speaker: 'keeper',
    text: '善。思路既通，势如破竹。',
    type: 'eureka',
    tags: ['praise', 'formal'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },

  // --- 答案 (answer) ---
  {
    id: 'keeper_answer_001',
    speaker: 'keeper',
    text: '第3行第4列，其数为5。',
    type: 'answer',
    tags: ['formal', 'direct'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },

  // ========================================================
  //  设局人台词（plotter）- 阴冷/嘲讽型
  // ========================================================

  // --- 嘲讽 (tease) ---
  {
    id: 'plotter_tease_001',
    speaker: 'plotter',
    text: '你还在看那片区域？我已经算完三遍了。',
    type: 'tease',
    tags: ['mock', 'cold'],
    usage: { maxPerLevel: 2, cooldown: 120, priority: 1 },
  },
  {
    id: 'plotter_tease_002',
    speaker: 'plotter',
    text: '连孤星都看不清？就是那一个格。',
    type: 'tease',
    tags: ['mock', 'cold'],
    usage: { maxPerLevel: 2, cooldown: 120, priority: 1 },
  },
  {
    id: 'plotter_tease_003',
    speaker: 'plotter',
    text: '等你找到答案，我已经布完下一局了。',
    type: 'tease',
    tags: ['mock', 'pressure'],
    usage: { maxPerLevel: 2, cooldown: 180, priority: 1 },
  },

  // --- 方向性引导 (direction) ---
  {
    id: 'plotter_dir_001',
    speaker: 'plotter',
    text: '你的目光，从未落在正确的地方。',
    type: 'direction',
    tags: ['mock', 'cold'],
    usage: { maxPerLevel: 2, cooldown: 120, priority: 2 },
  },

  // --- Eureka（很少赞美，更多是"有意思"） ---
  {
    id: 'plotter_eureka_001',
    speaker: 'plotter',
    text: '……有点意思。',
    type: 'eureka',
    tags: ['surprised', 'cold'],
    usage: { maxPerLevel: 99, cooldown: 30, priority: 3 },
  },
  {
    id: 'plotter_eureka_002',
    speaker: 'plotter',
    text: '呵。居然走对了。',
    type: 'eureka',
    tags: ['surprised', 'cold'],
    usage: { maxPerLevel: 99, cooldown: 30, priority: 3 },
  },

  // --- 答案 (answer) ---
  {
    id: 'plotter_answer_001',
    speaker: 'plotter',
    text: '5。别再让我等更久了。',
    type: 'answer',
    tags: ['cold', 'direct'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },
  {
    id: 'plotter_answer_002',
    speaker: 'plotter',
    text: '那格是5。现在可以继续了吗？',
    type: 'answer',
    tags: ['cold', 'impatient'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },

  // --- 故意说错 (error) ---
  {
    id: 'plotter_err_001',
    speaker: 'plotter',
    text: '那格填7……哦不，是5。我故意说错，看你会不会信。',
    type: 'error',
    tags: ['error_intentional', 'mock'],
    errorType: 'value',
    usage: { maxPerLevel: 1, cooldown: 300, priority: 2 },
  },
  {
    id: 'plotter_err_002',
    speaker: 'plotter',
    text: '我说是3你就填3？你的脑子呢？',
    type: 'error',
    tags: ['error_intentional', 'mock'],
    errorType: 'value',
    usage: { maxPerLevel: 1, cooldown: 300, priority: 2 },
  },

  // ========================================================
  //  [v5.0] 高级技巧专属戏剧台词
  // ========================================================

  // --- 星衡法则（rule45）被动教学 ---
  {
    id: 'sk_rule45_ray_01',
    speaker: 'ray',
    type: 'strategy',
    text: '傅导，盯着那一行！整行九格加起来必须是45。把笼子的和值一块块扣掉，剩下的那一格，就是突破口的金钥匙。',
    tags: ['rule45'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },
  {
    id: 'sk_rule45_keeper_01',
    speaker: 'keeper',
    type: 'strategy',
    text: '45是这牢笼的命门。一行、一列、一宫，和值永远钉死在四十五上。你只需找出那些"凸出去"或"凹进来"的笼子，差额就是答案。',
    tags: ['rule45'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },
  {
    id: 'sk_rule45_plotter_01',
    speaker: 'plotter',
    type: 'strategy',
    text: '呵呵，星衡法则……最古老也最致命的一把钥匙。你以为我把笼子排布得眼花缭乱？其实只需要加减，就能看穿这层薄纱。',
    tags: ['rule45'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },

  // --- 隐曜（hiddenSingle）被动教学 ---
  {
    id: 'sk_hidden_ray_01',
    speaker: 'ray',
    type: 'strategy',
    text: '看这一宫！数字7只在这一格出现过。其他八格都把它排除干净了——它无处可逃，只能乖乖待在这里！',
    tags: ['hiddenSingle'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },
  {
    id: 'sk_hidden_keeper_01',
    speaker: 'keeper',
    type: 'strategy',
    text: '藏得再深也没用。一个数字在一整行/列/宫里只剩一个容身之所，那它就必须待在那里。这叫隐曜——隐形的唯一答案。',
    tags: ['hiddenSingle'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },

  // --- 并蒂锁（nakedPair）被动教学 ---
  {
    id: 'sk_nakedpair_ray_01',
    speaker: 'ray',
    type: 'strategy',
    text: '傅导你看这两格！它们都只剩下同样的两个笔记。这是个"死亡契约"——这两个数被这两格平分了，同行其他格全都可以把它们划掉！',
    tags: ['nakedPair'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },
  {
    id: 'sk_nakedpair_keeper_01',
    speaker: 'keeper',
    type: 'strategy',
    text: '两个格子，两个笔记。不多不少，恰好配对。这就是并蒂锁——它们把这两个数字占死了，同区域的其他格子休想再碰。',
    tags: ['nakedPair'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },

  // --- 笼子唯一组合（cageUniqueCombo）被动教学 ---
  {
    id: 'sk_cagecombo_ray_01',
    speaker: 'ray',
    type: 'strategy',
    text: '这个三格笼子的和值是24！你算一下——1-9里挑三个不同的数加起来等于24，有几种可能？只有一种：7、8、9。所以这三格只能是它们三个！',
    tags: ['cageUniqueCombo'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },
  {
    id: 'sk_cagecombo_keeper_01',
    speaker: 'keeper',
    type: 'strategy',
    text: '笼子的和值和格数凑在一起，有时候只有唯一的组合可能。把所有组合列一遍，你会发现有些笼子从一开始就被锁死了数字范围。',
    tags: ['cageUniqueCombo'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },

  // --- 区块排除（pointingClaiming）被动教学 ---
  {
    id: 'sk_pointing_ray_01',
    speaker: 'ray',
    type: 'strategy',
    text: '傅导，你看这几个格子。笔记被锁死在这个笼子的这根骨架里了——它虽然没落子，但已经把整行的去路给霸占了！这叫区块截杀，别的地方别想再容下它！',
    tags: ['pointingClaiming'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },
  {
    id: 'sk_pointing_keeper_01',
    speaker: 'keeper',
    type: 'strategy',
    text: '哼，铜墙铁壁。那一宫的笼子已经把多余的笔记排挤出去了，盯着那条长街（行列）的主轴看，死局已经漏了风。',
    tags: ['pointingClaiming'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 5 },
  },

  // --- 二连纵横阵 被动教学 ---
  {
    id: 'sk_二连纵横阵_ray_01',
    speaker: 'ray',
    type: 'strategy',
    text: '四角成阵，死气封门！两行对两列，交叉的死角已经把数字9的容身所焊死了。注意到这个高反差的"X"结构了吗？其余列上的干扰，全都可以剔干净了！',
    tags: ['xWing'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 7 },
  },
  {
    id: 'sk_二连纵横阵_keeper_01',
    speaker: 'keeper',
    type: 'strategy',
    text: '……这是设局人最喜欢的双轴捕鼠夹（二连纵横阵）。四座哨塔彼此对望，把生路两两锁死。如果你看不到这根无形的绞刑架，你就永远走不出这间牢笼。',
    tags: ['xWing'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 7 },
  },
  {
    id: 'sk_二连纵横阵_plotter_01',
    speaker: 'plotter',
    type: 'strategy',
    text: '你看到那四只角了吗？它们像四根通天的铜柱，把一个数字的命运钉死在十字交叉的虚空中。二连纵横阵——这是我留给你的，第一道真正的考验。',
    tags: ['xWing'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 7 },
  },

  // ========================================================
  //  [v5.0] 收官期：多米诺级联坍塌爆破台词
  // ========================================================

  {
    id: 'exp_rule45_ray_01',
    speaker: 'ray',
    type: 'answer',
    text: '就是这一格！星衡法则的金钥匙插进去了——剩下的死结全都要连环崩断！给我爆！！',
    tags: ['rule45', 'explosion'],
    usage: { maxPerLevel: 1, cooldown: 120, priority: 9 },
  },
  {
    id: 'exp_rule45_keeper_01',
    speaker: 'keeper',
    type: 'answer',
    text: '……命门被击中了。四十五法则的核心格被扣动，剩下的约束就像高空坠落的冰山，级联雪崩。挡不住了。',
    tags: ['rule45', 'explosion'],
    usage: { maxPerLevel: 1, cooldown: 120, priority: 9 },
  },
  {
    id: 'exp_hidden_ray_01',
    speaker: 'ray',
    type: 'answer',
    text: '找到了！它藏得再深也没用——这一子砸下去，全盘的铁链锁扣都要噼里啪啦碎一地！',
    tags: ['hiddenSingle', 'explosion'],
    usage: { maxPerLevel: 1, cooldown: 120, priority: 9 },
  },
  {
    id: 'exp_nakedpair_ray_01',
    speaker: 'ray',
    type: 'answer',
    text: '死亡契约生效了！这对数对一旦落定，剩下的格子就像多米诺骨牌一样，一个接一个地翻开！',
    tags: ['nakedPair', 'explosion'],
    usage: { maxPerLevel: 1, cooldown: 120, priority: 9 },
  },
  {
    id: 'exp_cagecombo_ray_01',
    speaker: 'ray',
    type: 'answer',
    text: '唯一组合被击穿了！这个笼子的数字一旦确定，整条锁链都要炸开——全盘收官！',
    tags: ['cageUniqueCombo', 'explosion'],
    usage: { maxPerLevel: 1, cooldown: 120, priority: 9 },
  },
  {
    id: 'exp_二连纵横阵_ray_01',
    speaker: 'ray',
    type: 'answer',
    text: '就是这里！神之一手！你看好了，这一子砸下去，所有的铁链、所有的锁扣全都要连环崩断了！给我爆！！',
    tags: ['xWing', 'explosion'],
    usage: { maxPerLevel: 1, cooldown: 120, priority: 10 },
  },
  {
    id: 'exp_二连纵横阵_keeper_01',
    speaker: 'keeper',
    type: 'answer',
    text: '……局破了。这个核心格被扣动，剩下的死结就像高空坠落的冰山，级联雪崩。挡不住了，全盘收官。',
    tags: ['xWing', 'explosion'],
    usage: { maxPerLevel: 1, cooldown: 120, priority: 10 },
  },
  {
    id: 'exp_二连纵横阵_plotter_01',
    speaker: 'plotter',
    type: 'answer',
    text: '呵呵……不愧是你。二连纵横阵 的四根铜柱轰然倒塌的瞬间，还真是令人怀念啊。下一局，我会给你准备更精彩的。',
    tags: ['xWing', 'explosion'],
    usage: { maxPerLevel: 1, cooldown: 120, priority: 10 },
  },
];

// ============================================================
//  DialogueRuntimeTracker - 运行时追踪器
// ============================================================

class DialogueRuntimeTracker {
  /** @type {Set<string>} 已使用的台词ID */
  static _usedLines = new Set();

  /** @type {Map<string, number>} 各台词使用次数 */
  static _lineCounts = new Map();

  /** @type {Map<string, number>} 各类型台词使用次数 */
  static _typeCounts = new Map();

  /** @type {Map<string, number>} 最后使用时间（用于冷却） */
  static _lastUsedTime = new Map();

  /** @type {number} 笔记引导台词使用次数【补丁5】 */
  static _noteGuideCount = 0;

  /** @type {boolean} 是否标记为反笔记用户【补丁5】 */
  static _isAntiNoteUser = false;

  /** @type {number} 最后一次笔记引导的时间 */
  static _lastNoteGuideTime = 0;

  // ========================================================
  //  关卡重置
  // ========================================================

  /**
   * 重置为新关卡状态
   */
  static resetForNewLevel() {
    this._usedLines.clear();
    this._lineCounts.clear();
    this._typeCounts.clear();
    this._lastUsedTime.clear();
    this._noteGuideCount = 0;
    this._isAntiNoteUser = false;
    this._lastNoteGuideTime = 0;
  }

  // ========================================================
  //  使用记录
  // ========================================================

  /**
   * 标记台词已使用
   * @param {DialogueLine} line - 台词对象
   */
  static markUsed(line) {
    if (!line || !line.id) return;

    const now = Date.now();

    this._usedLines.add(line.id);

    // 计数
    const count = this._lineCounts.get(line.id) || 0;
    this._lineCounts.set(line.id, count + 1);

    // 类型计数
    const typeCount = this._typeCounts.get(line.type) || 0;
    this._typeCounts.set(line.type, typeCount + 1);

    // 最后使用时间
    this._lastUsedTime.set(line.id, now);

    // 笔记引导计数【补丁5】
    if (line.type === 'note_guide') {
      this._noteGuideCount++;
      this._lastNoteGuideTime = now;
    }
  }

  // ========================================================
  //  查询方法
  // ========================================================

  /**
   * 台词是否已使用过
   * @param {string} lineId
   * @returns {boolean}
   */
  static isUsed(lineId) {
    return this._usedLines.has(lineId);
  }

  /**
   * 获取台词使用次数
   * @param {string} lineId
   * @returns {number}
   */
  static getCount(lineId) {
    return this._lineCounts.get(lineId) || 0;
  }

  /**
   * 获取某类型台词使用次数
   * @param {string} type
   * @returns {number}
   */
  static getTypeCount(type) {
    return this._typeCounts.get(type) || 0;
  }

  /**
   * 检查台词是否在冷却中
   * @param {DialogueLine} line
   * @returns {boolean}
   */
  static isInCooldown(line) {
    if (!line.usage || !line.usage.cooldown) return false;

    const lastUsed = this._lastUsedTime.get(line.id) || 0;
    const elapsed = (Date.now() - lastUsed) / 1000;

    return elapsed < line.usage.cooldown;
  }

  /**
   * 检查台词是否达到每关上限
   * @param {DialogueLine} line
   * @returns {boolean}
   */
  static isMaxedOut(line) {
    if (!line.usage || !line.usage.maxPerLevel) return false;

    const count = this.getCount(line.id);
    return count >= line.usage.maxPerLevel;
  }

  // ========================================================
  //  【补丁5】封口计数器
  // ========================================================

  /**
   * 获取笔记引导使用次数
   * @returns {number}
   */
  static getNoteGuideCount() {
    return this._noteGuideCount;
  }

  /**
   * 是否为反笔记用户
   * @returns {boolean}
   */
  static isAntiNoteUser() {
    return this._isAntiNoteUser;
  }

  /**
   * 标记为反笔记用户（封口）
   */
  static markAntiNote() {
    this._isAntiNoteUser = true;
  }

  /**
   * 检查是否应该封口笔记引导
   * 规则：引导笔记台词已触发2次，且180秒内无笔记操作
   * @param {number} lastNoteTime - 最后一次笔记操作时间（时间戳）
   * @returns {boolean}
   */
  static shouldSealNoteGuide(lastNoteTime) {
    if (this._isAntiNoteUser) return true;
    if (this._noteGuideCount < 2) return false;

    const elapsed = (Date.now() - lastNoteTime) / 1000;
    return elapsed > 180; // 180秒无笔记操作
  }
}

// ============================================================
//  DialogueDatabase - 台词数据库
// ============================================================

class DialogueDatabase {
  /** @type {DialogueLine[]} 台词库 */
  static _lines = [...BUILTIN_DIALOGUES];

  // ========================================================
  //  台词管理
  // ========================================================

  /**
   * 添加自定义台词
   * @param {DialogueLine[]} lines - 台词数组
   */
  static addLines(lines) {
    if (!Array.isArray(lines)) return;
    this._lines.push(...lines);
  }

  /**
   * 获取所有台词
   * @returns {DialogueLine[]}
   */
  static getAllLines() {
    return [...this._lines];
  }

  // ========================================================
  //  查询引擎
  // ========================================================

  /**
   * 查询台词
   * @param {Object} query - 查询条件
   * @param {DialogueType|DialogueType[]} [query.type] - 台词类型
   * @param {string|string[]} [query.speaker] - 说话角色
   * @param {string|string[]} [query.tags] - 标签（包含任一即可）
   * @param {string[]} [query.excludeTags] - 排除标签
   * @param {boolean} [query.excludeUsed=false] - 是否排除已使用
   * @param {number} [query.minPriority] - 最低优先级
   * @param {boolean} [query.respectCooldown=true] - 是否遵守冷却
   * @param {boolean} [query.respectMaxPerLevel=true] - 是否遵守每关上限
   * @returns {DialogueLine|null}
   */
  static findLine(query = {}) {
    let candidates = [...this._lines];

    // 按类型过滤
    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      candidates = candidates.filter(l => types.includes(l.type));
    }

    // 按角色过滤
    if (query.speaker) {
      const speakers = Array.isArray(query.speaker) ? query.speaker : [query.speaker];
      candidates = candidates.filter(l => speakers.includes(l.speaker));
    }

    // 按标签过滤（包含任一）
    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      candidates = candidates.filter(l =>
        tags.some(t => l.tags && l.tags.includes(t))
      );
    }

    // 排除标签
    if (query.excludeTags) {
      candidates = candidates.filter(l =>
        !query.excludeTags.some(t => l.tags && l.tags.includes(t))
      );
    }

    // 排除已使用
    if (query.excludeUsed) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isUsed(l.id));
    }

    // 最低优先级
    if (query.minPriority !== undefined) {
      candidates = candidates.filter(l =>
        l.usage && l.usage.priority >= query.minPriority
      );
    }

    // 遵守冷却
    if (query.respectCooldown !== false) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isInCooldown(l));
    }

    // 遵守每关上限
    if (query.respectMaxPerLevel !== false) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isMaxedOut(l));
    }

    if (candidates.length === 0) {
      return null;
    }

    // 按优先级排序，同优先级随机
    candidates.sort((a, b) => (b.usage?.priority || 1) - (a.usage?.priority || 1));
    const topPriority = candidates[0].usage?.priority || 1;
    const topCandidates = candidates.filter(l => (l.usage?.priority || 1) === topPriority);

    const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    return selected;
  }

  /**
   * 查询多条台词
   * @param {Object} query - 查询条件（同 findLine）
   * @param {number} [limit=5] - 返回数量上限
   * @returns {DialogueLine[]}
   */
  static findLines(query = {}, limit = 5) {
    let candidates = [...this._lines];

    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      candidates = candidates.filter(l => types.includes(l.type));
    }

    if (query.speaker) {
      const speakers = Array.isArray(query.speaker) ? query.speaker : [query.speaker];
      candidates = candidates.filter(l => speakers.includes(l.speaker));
    }

    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      candidates = candidates.filter(l =>
        tags.some(t => l.tags && l.tags.includes(t))
      );
    }

    if (query.excludeUsed) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isUsed(l.id));
    }

    if (query.respectCooldown !== false) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isInCooldown(l));
    }

    if (query.respectMaxPerLevel !== false) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isMaxedOut(l));
    }

    // 按优先级排序
    candidates.sort((a, b) => (b.usage?.priority || 1) - (a.usage?.priority || 1));

    return candidates.slice(0, limit);
  }

  /**
   * 根据ID获取台词
   * @param {string} id
   * @returns {DialogueLine|undefined}
   */
  static getLineById(id) {
    return this._lines.find(l => l.id === id);
  }

  // ========================================================
  //  [v5.0] 高级技巧专属查询
  // ========================================================

  /**
   * [v5.0] 获取针对特定高级技巧的被动教学引导台词（破局期卡点专用）
   * @param {string} speaker - 角色标识 ('ray', 'keeper', 'plotter')
   * @param {string} skill - 技巧标识 ('rule45', 'hiddenSingle', 'nakedPair', 'cageUniqueCombo', 'hiddenPair', 'pointingClaiming', 'xWing')
   * @returns {string}
   */
  static getPassiveSkillText(speaker, skill) {
    const matches = this._lines.filter(l =>
      l.speaker === speaker &&
      l.type === 'strategy' &&
      l.tags && l.tags.includes(skill)
    );

    if (matches.length === 0) {
      return "看这盘面，似乎有高手布下的暗局……";
    }

    const picked = matches[Math.floor(Math.random() * matches.length)];
    if (typeof DialogueRuntimeTracker !== 'undefined') {
      DialogueRuntimeTracker.markUsed(picked);
    }
    return picked.text;
  }

  /**
   * [v5.0] 获取主动点击提示、引爆多米诺级联坍塌时的宣泄惊叹台词（收官期专用）
   * @param {string} speaker - 角色标识
   * @param {string} skill - 被引爆的卡点技巧标识
   * @returns {string}
   */
  static getActiveExplosionText(speaker, skill) {
    const matches = this._lines.filter(l =>
      l.speaker === speaker &&
      l.type === 'answer' &&
      l.tags && l.tags.includes(skill) && l.tags.includes('explosion')
    );

    if (matches.length === 0) {
      return "破局！连锁反应已经无法阻挡！";
    }

    const picked = matches[Math.floor(Math.random() * matches.length)];
    if (typeof DialogueRuntimeTracker !== 'undefined') {
      DialogueRuntimeTracker.markUsed(picked);
    }
    return picked.text;
  }

  // ========================================================
  //  统计
  // ========================================================

  /**
   * 获取台词总数
   * @returns {number}
   */
  static getTotalCount() {
    return this._lines.length;
  }

  /**
   * 按角色统计
   * @returns {Object}
   */
  static getStatsBySpeaker() {
    const stats = {};
    for (const line of this._lines) {
      if (!stats[line.speaker]) {
        stats[line.speaker] = { total: 0, byType: {} };
      }
      stats[line.speaker].total++;
      stats[line.speaker].byType[line.type] = (stats[line.speaker].byType[line.type] || 0) + 1;
    }
    return stats;
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DialogueDatabase,
    DialogueRuntimeTracker,
    BUILTIN_DIALOGUES,
  };
}

if (typeof window !== 'undefined') {
  window.DialogueDatabase = DialogueDatabase;
  window.DialogueRuntimeTracker = DialogueRuntimeTracker;
}
