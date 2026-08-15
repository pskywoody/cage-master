// ============================================================
//  boss-content.js - Boss 内容包（CM4-R7 内容生产层）
// ============================================================
//  定位：把"机制"变成"可玩内容"。Director 决定节奏，这里提供剧本。
//  每个 Boss 一个内容包，含：
//    - meta    : 人格 / 策略画像 / 难度曲线 / 视觉主题
//    - phase   : 4 阶段台词池（opening/development/crisis/climax）
//    - event   : 事件文本池（污染/连线/压力/反击）
//    - strategy: 策略切换台词池
//    - feedback: 胜负反馈
//
//  多语言资源格式（R7 先建管线，R8 接 t() loader）：
//    每行台词 = { key, zh, ja, en }，key 即 R8 的 i18n 键
//    缺失语言由 boss-line-selector 回退到 zh-CN（不阻塞）
//
//  设计：纯数据、无逻辑、无 DOM；可被 controller / 测试 / 未来 i18n 消费。
//  2026-08-14：按新剧本《笼中密信：上海1941》重写全部台词包——
//    薇拉（旧书铺店主）/ 伊藤（特高课警官）/ 山田（搜查官）/ 沈墨（主角）。
// ============================================================

// 语言标识（供 R8 loader 统一）
export const SUPPORTED_LOCALES = ['zh-CN', 'ja-JP', 'en-US'];
export const DEFAULT_LOCALE = 'zh-CN';

export const BOSS_PACKS = {

  // ---------------- 薇拉（vera）· 冷静疏离 ----------------
  // 第1章试炼石 Boss：旧书铺店主，出题如设局，言语克制
  yingying: {
    id: 'yingying',
    meta: {
      name: { 'zh-CN': '薇拉', 'ja-JP': '薇拉', 'en-US': 'Vera' },
      personality: 'blind',
      strategyProfile: 'sneaky-pressure',   // 轻快推进，冷不丁施压
      difficultyCurve: [0.4, 0.55, 0.7, 0.85], // 每阶段强度
      visualTheme: 'calm-bookshop',         // 旧书铺、克制
    },
    phaseLines: {
      opening: [
        { key: 'boss.vera.opening.01', zh: '想进这扇门，先解我一道题。', ja: 'この扉を開けたいなら、まず私の問題を解け。', en: 'To pass this door, solve my puzzle first.' },
        { key: 'boss.vera.opening.02', zh: '出题如设局——你最好跟得上。', ja: '出題は布石。ついてこられるか。', en: 'Setting a puzzle is setting a trap—keep up.' },
      ],
      development: [
        { key: 'boss.vera.development.01', zh: '你守的那个位置，我早看穿了。', ja: '君が守るその位置、もう見抜いている。', en: 'That spot you guard—I saw through it long ago.' },
        { key: 'boss.vera.development.02', zh: '只盯着一处，会漏掉另一边的。', ja: '一か所ばかり見てると、反対側を見逃す。', en: 'Stare at one spot and you’ll miss the other side.' },
      ],
      crisis: [
        { key: 'boss.vera.crisis.01', zh: '中央空出来了呢。', ja: '中央が空いた。', en: 'The center has opened.' },
        { key: 'boss.vera.crisis.02', zh: '这下，你顾不过来了吧。', ja: 'もう手が回らないだろう。', en: 'Now you can’t cover everything.' },
      ],
      climax: [
        { key: 'boss.vera.climax.01', zh: '最后一步，你确定吗？', ja: '最後の一手、それでいいのか？', en: 'That last move—are you certain?' },
        { key: 'boss.vera.climax.02', zh: '别让我赢得太轻松。', ja: '楽に勝たせないでくれ。', en: 'Don’t make this too easy for me.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.vera.pollution.01', zh: '那个据点，开始脏了。', ja: 'その拠点、汚れてきた。', en: 'That hub is getting tainted.' },
      ],
      line_win: [
        { key: 'boss.vera.line_win.01', zh: '三点连线。这局，我收了。', ja: '三点ライン。この勝負、もらう。', en: 'Three in a line. I’ll take this one.' },
      ],
      line_steal: [
        { key: 'boss.vera.line_steal.01', zh: '你的线，还差一点。', ja: '君のラインは、あと一歩足りない。', en: 'Your line is still a step short.' },
      ],
      pressure_incoming: [
        { key: 'boss.vera.pressure.01', zh: '我要动你另一边了。', ja: '反対側を動かす。', en: 'I’m going after your other side.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.vera.strategy.attack', zh: '这个据点，我要定了。', ja: 'この拠点、もらう。', en: 'This hub is mine.' },
      defend: { key: 'boss.vera.strategy.defend', zh: '先守住我的地盘。', ja: 'まず自分の陣地を守る。', en: 'Protect my turf first.' },
      global: { key: 'boss.vera.strategy.global', zh: '不纠结据点了，我到处填填看。', ja: '拠点にこだわらず、あちこち埋める。', en: 'Forget hubs—I’ll fill around.' },
      counter: { key: 'boss.vera.strategy.counter', zh: '敢动我的据点？反击。', ja: '私の拠点に手を出す？反撃だ。', en: 'Touch my hub? Counterattack.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.vera.win.01', zh: '……解开了。你比我想象的更快。', ja: '……解いたか。思ったより速い。', en: '…Solved. Faster than I expected.' },
      ],
      playerLose: [
        { key: 'boss.vera.lose.01', zh: '题，还没解完。', ja: '問題は、まだ終わっていない。', en: 'The puzzle isn’t finished yet.' },
      ],
      draw: [
        { key: 'boss.vera.draw.01', zh: '平局。你我都在试探。', ja: '引き分けか。互いに探り合っていた。', en: 'A draw. We were both probing.' },
      ],
    },
  },

  // ---------------- 山田（yan）· 资深搜查官 ----------------
  // 压迫感强，档案在手，审视一切
  yan: {
    id: 'yan',
    meta: {
      name: { 'zh-CN': '山田', 'ja-JP': '山田', 'en-US': 'Yamada' },
      personality: 'expert',
      strategyProfile: 'aggressive-contest', // 直接进攻，抢夺关键据点
      difficultyCurve: [0.5, 0.65, 0.8, 0.95],
      visualTheme: 'sharp-investigator',
    },
    phaseLines: {
      opening: [
        { key: 'boss.yamada.opening.01', zh: '你的名字，在这份档案里。', ja: '君の名前は、このファイルにある。', en: 'Your name is in this file.' },
        { key: 'boss.yamada.opening.02', zh: '别慢吞吞的，会跟不上的。', ja: 'のんびりしてると、置いてかれる。', en: 'Don’t dawdle, or you’ll fall behind.' },
      ],
      development: [
        { key: 'boss.yamada.development.01', zh: '你守的那个点，我盯上了。', ja: '君が守るその地点、狙っている。', en: 'That spot you guard—I’ve got my eye on it.' },
        { key: 'boss.yamada.development.02', zh: '进攻，就是最好的防守。', ja: '攻めるのが最高の守りだ。', en: 'The best defense is a good offense.' },
      ],
      crisis: [
        { key: 'boss.yamada.crisis.01', zh: '中央已经乱了，你拿什么守？', ja: '中央はもう乱れている。何で守る？', en: 'The center’s already chaos—what’ll you defend with?' },
        { key: 'boss.yamada.crisis.02', zh: '现在，该我收网了。', ja: 'さあ、そろそろ網を畳む。', en: 'Now it’s time for me to close the net.' },
      ],
      climax: [
        { key: 'boss.yamada.climax.01', zh: '最后一步，我不会留情。', ja: '最後の一手、容赦はしない。', en: 'For the last move, I won’t hold back.' },
        { key: 'boss.yamada.climax.02', zh: '看好了，这就结束。', ja: 'よく見ろ。これで終わりだ。', en: 'Watch closely—this ends it.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.yamada.pollution.01', zh: '污染正在蔓延，你还在发呆？', ja: '汚染が広がっている。まだボーッとしているのか？', en: 'The pollution’s spreading—still spacing out?' },
      ],
      line_win: [
        { key: 'boss.yamada.line_win.01', zh: '三点连线，胜负已定。', ja: '三点ライン。これで決まりだ。', en: 'Three in a line. That settles it.' },
      ],
      line_steal: [
        { key: 'boss.yamada.line_steal.01', zh: '想连线？先过我这关。', ja: 'ラインを組みたい？まず俺を倒せ。', en: 'Want that line? Get past me first.' },
      ],
      pressure_incoming: [
        { key: 'boss.yamada.pressure.01', zh: '我要压你那一路了。', ja: 'その一翼を潰す。', en: 'I’m crushing that wing of yours.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.yamada.strategy.attack', zh: '这个据点，我要了。', ja: 'この拠点、頂く。', en: 'This hub is mine.' },
      defend: { key: 'boss.yamada.strategy.defend', zh: '先守好，再谈进攻。', ja: 'まず守ってから、攻める。', en: 'Secure first, then attack.' },
      global: { key: 'boss.yamada.strategy.global', zh: '据点不重要，一盘全拿下。', ja: '拠点より、盤面全部を取る。', en: 'Hubs don’t matter—take the whole board.' },
      counter: { key: 'boss.yamada.strategy.counter', zh: '你动我的地盘？那就别怪我了。', ja: '俺の陣地に手を出す？なら容赦しない。', en: 'You touched my turf? Don’t blame me then.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.yamada.win.01', zh: '……有点本事。下次不会让你这么轻松。', ja: '……中々やるな。次はそう簡単にはいかない。', en: '…Not bad. Next time won’t be so easy.' },
      ],
      playerLose: [
        { key: 'boss.yamada.lose.01', zh: '就这？回去再练练。', ja: 'こんなものか。練習して出直してこい。', en: 'That’s it? Go train and come back.' },
      ],
      draw: [
        { key: 'boss.yamada.draw.01', zh: '平局？还行，不算丢人。', ja: '引き分けか。悪くない。', en: 'A draw? Not bad, not embarrassing.' },
      ],
    },
  },

  // ---------------- 伊藤（cagekeeper）· 特高课警官 ----------------
  // 冷静克制，暗中观察，与父亲相识
  cagekeeper: {
    id: 'cagekeeper',
    meta: {
      name: { 'zh-CN': '伊藤', 'ja-JP': '伊藤', 'en-US': 'Ito' },
      personality: 'mentor',
      strategyProfile: 'calm-observe',      // 观察、克制、留空间
      difficultyCurve: [0.45, 0.6, 0.75, 0.9],
      visualTheme: 'calm-investigator',
    },
    phaseLines: {
      opening: [
        { key: 'boss.ito.opening.01', zh: '我以为你到不了。', ja: '君がここまで来るとは思わなかった。', en: 'I didn’t think you’d make it here.' },
        { key: 'boss.ito.opening.02', zh: '你自己算的。我查过了。', ja: '君自身で解いた。調べたよ。', en: 'You solved it yourself. I checked.' },
      ],
      development: [
        { key: 'boss.ito.development.01', zh: '你留的每一道痕，我都看见了。', ja: '君が残した痕は、全て見ている。', en: 'Every mark you left—I’ve seen them all.' },
        { key: 'boss.ito.development.02', zh: '执着于一处的人，往往顾此失彼。', ja: '一か所に固執する者は、往々にして失う。', en: 'Those who cling to one place often lose another.' },
      ],
      crisis: [
        { key: 'boss.ito.crisis.01', zh: '中央空出来了。', ja: '中央が空いた。', en: 'The center has opened.' },
        { key: 'boss.ito.crisis.02', zh: '局面将倾，你已经没有退路。', ja: '盤面は傾き、君に逃げ場はない。', en: 'The board is tipping—you have no way out.' },
      ],
      climax: [
        { key: 'boss.ito.climax.01', zh: '最后一步，你确定吗？', ja: '最後の一手、それでいいのか？', en: 'That last move—are you certain?' },
        { key: 'boss.ito.climax.02', zh: '尘埃落定之前，一切都未可知。', ja: '砂が落ち着くまで、全ては未知だ。', en: 'Until the dust settles, nothing is certain.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.ito.pollution.01', zh: '污染侵蚀了那个据点。', ja: '汚染がその拠点を蝕んでいる。', en: 'The pollution is eating that hub.' },
      ],
      line_win: [
        { key: 'boss.ito.line_win.01', zh: '三点连线。棋局已终。', ja: '三点ライン。棋局は終わった。', en: 'Three in a line. The game is over.' },
      ],
      line_steal: [
        { key: 'boss.ito.line_steal.01', zh: '你的线，还差一寸。', ja: '君のラインは、あと一寸足りない。', en: 'Your line is still an inch short.' },
      ],
      pressure_incoming: [
        { key: 'boss.ito.pressure.01', zh: '这次，看向另一侧吧。', ja: '今度は、反対側を見るといい。', en: 'This time, look to the other side.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.ito.strategy.attack', zh: '这个据点，我收下了。', ja: 'この拠点、いただく。', en: 'I’ll take this hub.' },
      defend: { key: 'boss.ito.strategy.defend', zh: '先稳后动。', ja: '先に固めてから動く。', en: 'Steady first, move after.' },
      global: { key: 'boss.ito.strategy.global', zh: '据点不过是虚妄，胜负在整盘。', ja: '拠点は虚妄、勝負は盤全体にある。', en: 'Hubs are illusion; victory lies in the whole board.' },
      counter: { key: 'boss.ito.strategy.counter', zh: '你动了不该动的地方。', ja: '君は触れてはいけない場所に触れた。', en: 'You touched where you shouldn’t have.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.ito.win.01', zh: '……你赢了。看来是我看漏了。', ja: '……君の勝ちだ。私の見落としだった。', en: '…You win. It seems I overlooked something.' },
      ],
      playerLose: [
        { key: 'boss.ito.lose.01', zh: '棋局已定。去下一处吧。', ja: '棋局は定まった。次へ行こう。', en: 'The game is decided. Move on.' },
      ],
      draw: [
        { key: 'boss.ito.draw.01', zh: '平局。你我都在试探。', ja: '引き分けか。互いに探り合っていた。', en: 'A draw. We were both probing.' },
      ],
    },
  },

  // ---------------- 伊藤·残影（plotterShadow） ----------------
  // 门后还有门，包围型
  plotterShadow: {
    id: 'plotterShadow',
    meta: {
      name: { 'zh-CN': '伊藤', 'ja-JP': '伊藤', 'en-US': 'Ito' },
      personality: 'surround',
      strategyProfile: 'surround-pressure', // 包围、收紧
      difficultyCurve: [0.5, 0.65, 0.8, 0.95],
      visualTheme: 'shadow-surround',
    },
    phaseLines: {
      opening: [
        { key: 'boss.ito_shadow.opening.01', zh: '门后还有门。', ja: '扉の向こうには、また扉がある。', en: 'Behind the door, there is another door.' },
        { key: 'boss.ito_shadow.opening.02', zh: '你走不完的。', ja: '君は歩き切れない。', en: 'You can’t walk it all.' },
      ],
      development: [
        { key: 'boss.ito_shadow.development.01', zh: '四周都在收紧。', ja: '周囲が締まってくる。', en: 'The net is closing in.' },
        { key: 'boss.ito_shadow.development.02', zh: '你留的短横，我留了竖线。', ja: '君は短い横線、私は縦線を残した。', en: 'You left a dash; I left a vertical line.' },
      ],
      crisis: [
        { key: 'boss.ito_shadow.crisis.01', zh: '下一站，我下船。', ja: '次の駅で、私は降りる。', en: 'At the next stop, I get off.' },
        { key: 'boss.ito_shadow.crisis.02', zh: '你走到了最后。', ja: '君は最後まで歩いた。', en: 'You walked to the very end.' },
      ],
      climax: [
        { key: 'boss.ito_shadow.climax.01', zh: '这一局，你走不出去。', ja: 'この勝負、君は抜け出せない。', en: 'This round, you can’t get out.' },
        { key: 'boss.ito_shadow.climax.02', zh: '看好了，这就结束。', ja: 'よく見ろ。これで終わりだ。', en: 'Watch closely—this ends it.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.ito_shadow.pollution.01', zh: '那个据点，被污染了。', ja: 'その拠点が汚染された。', en: 'That hub is polluted.' },
      ],
      line_win: [
        { key: 'boss.ito_shadow.line_win.01', zh: '三点连线。你输了。', ja: '三点ライン。君の負けだ。', en: 'Three in a line. You lose.' },
      ],
      line_steal: [
        { key: 'boss.ito_shadow.line_steal.01', zh: '你的线，断在这里。', ja: '君のラインは、ここで途切れる。', en: 'Your line breaks here.' },
      ],
      pressure_incoming: [
        { key: 'boss.ito_shadow.pressure.01', zh: '我要压你另一边了。', ja: '反対側を潰す。', en: 'I’m crushing your other side.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.ito_shadow.strategy.attack', zh: '这个据点，归我。', ja: 'この拠点、もらう。', en: 'This hub is mine.' },
      defend: { key: 'boss.ito_shadow.strategy.defend', zh: '守住，再收紧。', ja: '守ってから、締める。', en: 'Hold, then tighten.' },
      global: { key: 'boss.ito_shadow.strategy.global', zh: '全盘，我都要。', ja: '盤面全部、もらう。', en: 'I’ll take the whole board.' },
      counter: { key: 'boss.ito_shadow.strategy.counter', zh: '你动了我的地盘。', ja: '君は俺の陣地に触れた。', en: 'You touched my turf.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.ito_shadow.win.01', zh: '……被你走完了。', ja: '……君に歩き切られた。', en: '…You walked it all.' },
      ],
      playerLose: [
        { key: 'boss.ito_shadow.lose.01', zh: '到此为止。', ja: 'ここまでだ。', en: 'This is where it ends.' },
      ],
      draw: [
        { key: 'boss.ito_shadow.draw.01', zh: '平局。我们都在等。', ja: '引き分けか。互いに待っていた。', en: 'A draw. We were both waiting.' },
      ],
    },
  },

  // ---------------- 伊藤·补题人（remnant） ----------------
  // 稳健型，补全终题
  remnant: {
    id: 'remnant',
    meta: {
      name: { 'zh-CN': '伊藤', 'ja-JP': '伊藤', 'en-US': 'Ito' },
      personality: 'steady',
      strategyProfile: 'steady-complete',   // 稳健、补全
      difficultyCurve: [0.45, 0.6, 0.75, 0.9],
      visualTheme: 'steady-ink',
    },
    phaseLines: {
      opening: [
        { key: 'boss.remnant.opening.01', zh: '你所有的题，我都看过了。', ja: '君の問題は、全て見た。', en: 'I’ve seen all your puzzles.' },
        { key: 'boss.remnant.opening.02', zh: '这道，是我补的。', ja: 'これは、私が補った。', en: 'This one—I completed it.' },
      ],
      development: [
        { key: 'boss.remnant.development.01', zh: '这一格，我补完了。', ja: 'この一マス、補い終えた。', en: 'This cell, I’ve completed.' },
        { key: 'boss.remnant.development.02', zh: '对齐，不是那么容易。', ja: '揃えるのは、そう簡単ではない。', en: 'Aligning isn’t so easy.' },
      ],
      crisis: [
        { key: 'boss.remnant.crisis.01', zh: '你慢了。', ja: '君は遅い。', en: 'You’re slow.' },
        { key: 'boss.remnant.crisis.02', zh: '这道终题，无需你补全。', ja: 'この終局の問題は、君が補う必要はない。', en: 'This final puzzle needs no completion from you.' },
      ],
      climax: [
        { key: 'boss.remnant.climax.01', zh: '最后一步，你确定吗？', ja: '最後の一手、それでいいのか？', en: 'That last move—are you certain?' },
        { key: 'boss.remnant.climax.02', zh: '你走到了终点。', ja: '君は終点まで歩いた。', en: 'You reached the end.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.remnant.pollution.01', zh: '那个据点，脏了。', ja: 'その拠点、汚れた。', en: 'That hub is tainted.' },
      ],
      line_win: [
        { key: 'boss.remnant.line_win.01', zh: '三点连线。收尾。', ja: '三点ライン。締めだ。', en: 'Three in a line. Closing it out.' },
      ],
      line_steal: [
        { key: 'boss.remnant.line_steal.01', zh: '你的线，还差一格。', ja: '君のラインは、あと一マス。', en: 'Your line is one cell short.' },
      ],
      pressure_incoming: [
        { key: 'boss.remnant.pressure.01', zh: '我要压你那边了。', ja: 'そちら側を押す。', en: 'I’m pressing your side.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.remnant.strategy.attack', zh: '这个据点，我补上。', ja: 'この拠点、補う。', en: 'I’ll complete this hub.' },
      defend: { key: 'boss.remnant.strategy.defend', zh: '先对齐，再进攻。', ja: 'まず揃えてから、攻める。', en: 'Align first, then attack.' },
      global: { key: 'boss.remnant.strategy.global', zh: '全盘补全。', ja: '盤面全部を補う。', en: 'Complete the whole board.' },
      counter: { key: 'boss.remnant.strategy.counter', zh: '你动了我的对齐。', ja: '君は俺の揃えを崩した。', en: 'You broke my alignment.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.remnant.win.01', zh: '……你补得比我好。', ja: '……君の補いは私より上手い。', en: '…You completed it better than I did.' },
      ],
      playerLose: [
        { key: 'boss.remnant.lose.01', zh: '我补完了。', ja: '私は補い終えた。', en: 'I’ve completed it.' },
      ],
      draw: [
        { key: 'boss.remnant.draw.01', zh: '平局。我们都补完了。', ja: '引き分けか。互いに補い終えた。', en: 'A draw. We both completed it.' },
      ],
    },
  },

  // ---------------- 山田·搜查官（weaver） ----------------
  // 稳健型，档案搜查
  weaver: {
    id: 'weaver',
    meta: {
      name: { 'zh-CN': '山田', 'ja-JP': '山田', 'en-US': 'Yamada' },
      personality: 'steady',
      strategyProfile: 'file-investigate',  // 档案搜查、稳健推进
      difficultyCurve: [0.5, 0.65, 0.8, 0.95],
      visualTheme: 'file-investigator',
    },
    phaseLines: {
      opening: [
        { key: 'boss.yamada_file.opening.01', zh: '信号已锁定。', ja: '信号を捕捉した。', en: 'Signal locked.' },
        { key: 'boss.yamada_file.opening.02', zh: '你发不出去的。', ja: '君は送信できない。', en: 'You can’t transmit.' },
      ],
      development: [
        { key: 'boss.yamada_file.development.01', zh: '拦截成功。', ja: '傍受成功。', en: 'Interception successful.' },
        { key: 'boss.yamada_file.development.02', zh: '你的频率，我记下了。', ja: '君の周波数、記録した。', en: 'I’ve noted your frequency.' },
      ],
      crisis: [
        { key: 'boss.yamada_file.crisis.01', zh: '测向队，正在靠近。', ja: '測向隊が近づいている。', en: 'The direction-finding team is closing in.' },
        { key: 'boss.yamada_file.crisis.02', zh: '你逃不掉的。', ja: '君は逃げられない。', en: 'You can’t escape.' },
      ],
      climax: [
        { key: 'boss.yamada_file.climax.01', zh: '最后一格。', ja: '最後の一マス。', en: 'The last cell.' },
        { key: 'boss.yamada_file.climax.02', zh: '胜负已定。', ja: '勝負は決まった。', en: 'The outcome is decided.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.yamada_file.pollution.01', zh: '那个据点，被污染了。', ja: 'その拠点が汚染された。', en: 'That hub is polluted.' },
      ],
      line_win: [
        { key: 'boss.yamada_file.line_win.01', zh: '三点连线。收网。', ja: '三点ライン。網を畳む。', en: 'Three in a line. Closing the net.' },
      ],
      line_steal: [
        { key: 'boss.yamada_file.line_steal.01', zh: '你的线，断了。', ja: '君のラインは途切れた。', en: 'Your line is broken.' },
      ],
      pressure_incoming: [
        { key: 'boss.yamada_file.pressure.01', zh: '我要压你那一路。', ja: 'その一翼を押す。', en: 'I’m pressing that wing of yours.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.yamada_file.strategy.attack', zh: '这个据点，我锁定了。', ja: 'この拠点、ロックした。', en: 'This hub is locked.' },
      defend: { key: 'boss.yamada_file.strategy.defend', zh: '先守住，再追查。', ja: 'まず守ってから、追う。', en: 'Secure first, then pursue.' },
      global: { key: 'boss.yamada_file.strategy.global', zh: '全盘追查。', ja: '盤面全部を追う。', en: 'Pursue the whole board.' },
      counter: { key: 'boss.yamada_file.strategy.counter', zh: '你动了我的档案。', ja: '君は俺のファイルに触れた。', en: 'You touched my file.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.yamada_file.win.01', zh: '……你的名字，不在这一页。', ja: '……君の名前は、このページにはない。', en: '…Your name isn’t on this page.' },
      ],
      playerLose: [
        { key: 'boss.yamada_file.lose.01', zh: '档案已归档。', ja: 'ファイルは整理された。', en: 'The file is archived.' },
      ],
      draw: [
        { key: 'boss.yamada_file.draw.01', zh: '平局。我们都在等信号。', ja: '引き分けか。互いに信号を待っていた。', en: 'A draw. We were both waiting for a signal.' },
      ],
    },
  },

  // ---------------- 山田（plotter）· 全局控场 ----------------
  // 包围型，档案在手
  plotter: {
    id: 'plotter',
    meta: {
      name: { 'zh-CN': '山田', 'ja-JP': '山田', 'en-US': 'Yamada' },
      personality: 'surround',
      strategyProfile: 'surround-control',  // 包围、控场
      difficultyCurve: [0.55, 0.7, 0.85, 1.0],
      visualTheme: 'shadow-control',
    },
    phaseLines: {
      opening: [
        { key: 'boss.yamada_plot.opening.01', zh: '你的名字，在里面。第三页。', ja: '君の名前は、そこにある。三ページ目。', en: 'Your name is in there. Page three.' },
        { key: 'boss.yamada_plot.opening.02', zh: '我不确定它为什么会出现在那一页。', ja: 'なぜそのページにあるのか、私には分からない。', en: 'I’m not sure why it appears on that page.' },
      ],
      development: [
        { key: 'boss.yamada_plot.development.01', zh: '我手下有人替你改过这一条。', ja: '私の部下が君の項目を書き換えた。', en: 'One of my men rewrote your entry.' },
        { key: 'boss.yamada_plot.development.02', zh: '你在里面，不只一个人。', ja: '君は、一人ではない。', en: 'You’re not alone in there.' },
      ],
      crisis: [
        { key: 'boss.yamada_plot.crisis.01', zh: '我来确认你不值得抓。', ja: '君が捕まえる価値がないことを確認しに来た。', en: 'I came to confirm you’re not worth arresting.' },
        { key: 'boss.yamada_plot.crisis.02', zh: '你逃不掉的。', ja: '君は逃げられない。', en: 'You can’t escape.' },
      ],
      climax: [
        { key: 'boss.yamada_plot.climax.01', zh: '最后一页。', ja: '最後のページ。', en: 'The last page.' },
        { key: 'boss.yamada_plot.climax.02', zh: '胜负已定。', ja: '勝負は決まった。', en: 'The outcome is decided.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.yamada_plot.pollution.01', zh: '那个据点，被污染了。', ja: 'その拠点が汚染された。', en: 'That hub is polluted.' },
      ],
      line_win: [
        { key: 'boss.yamada_plot.line_win.01', zh: '三点连线。收网。', ja: '三点ライン。網を畳む。', en: 'Three in a line. Closing the net.' },
      ],
      line_steal: [
        { key: 'boss.yamada_plot.line_steal.01', zh: '你的线，断了。', ja: '君のラインは途切れた。', en: 'Your line is broken.' },
      ],
      pressure_incoming: [
        { key: 'boss.yamada_plot.pressure.01', zh: '我要压你那一路。', ja: 'その一翼を押す。', en: 'I’m pressing that wing of yours.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.yamada_plot.strategy.attack', zh: '这个据点，我锁定了。', ja: 'この拠点、ロックした。', en: 'This hub is locked.' },
      defend: { key: 'boss.yamada_plot.strategy.defend', zh: '先守住，再追查。', ja: 'まず守ってから、追う。', en: 'Secure first, then pursue.' },
      global: { key: 'boss.yamada_plot.strategy.global', zh: '全盘追查。', ja: '盤面全部を追う。', en: 'Pursue the whole board.' },
      counter: { key: 'boss.yamada_plot.strategy.counter', zh: '你动了我的档案。', ja: '君は俺のファイルに触れた。', en: 'You touched my file.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.yamada_plot.win.01', zh: '……你的名字，不在这一页。', ja: '……君の名前は、このページにはない。', en: '…Your name isn’t on this page.' },
      ],
      playerLose: [
        { key: 'boss.yamada_plot.lose.01', zh: '档案已归档。', ja: 'ファイルは整理された。', en: 'The file is archived.' },
      ],
      draw: [
        { key: 'boss.yamada_plot.draw.01', zh: '平局。我们都在等信号。', ja: '引き分けか。互いに信号を待っていた。', en: 'A draw. We were both waiting for a signal.' },
      ],
    },
  },

  // ---------------- 伊藤·终局（setterSecret） ----------------
  // 包围型，三代人的刻痕
  setterSecret: {
    id: 'setterSecret',
    meta: {
      name: { 'zh-CN': '伊藤', 'ja-JP': '伊藤', 'en-US': 'Ito' },
      personality: 'surround',
      strategyProfile: 'final-surround',    // 终局包围
      difficultyCurve: [0.55, 0.7, 0.85, 1.0],
      visualTheme: 'final-ink',
    },
    phaseLines: {
      opening: [
        { key: 'boss.ito_final.opening.01', zh: '你走完了。', ja: '君は歩き切った。', en: 'You walked it all.' },
        { key: 'boss.ito_final.opening.02', zh: '我也走完了。', ja: '私も歩き切った。', en: 'I walked it all too.' },
      ],
      development: [
        { key: 'boss.ito_final.development.01', zh: '我走得比你早。但我没有停下来过。', ja: '私は君より早く歩き出した。だが、止まったことはない。', en: 'I started earlier than you. But I never stopped.' },
        { key: 'boss.ito_final.development.02', zh: '你留了短横，我留了竖线。', ja: '君は短い横線、私は縦線を残した。', en: 'You left a dash; I left a vertical line.' },
      ],
      crisis: [
        { key: 'boss.ito_final.crisis.01', zh: '三代人。三种刻法。', ja: '三代。三つの刻み方。', en: 'Three generations. Three ways of marking.' },
        { key: 'boss.ito_final.crisis.02', zh: '我花了三年才看懂这条规则。', ja: 'この規則を理解するのに三年かかった。', en: 'It took me three years to understand this rule.' },
      ],
      climax: [
        { key: 'boss.ito_final.climax.01', zh: '下一站，我下船。', ja: '次の駅で、私は降りる。', en: 'At the next stop, I get off.' },
        { key: 'boss.ito_final.climax.02', zh: '你停留了。这就是你走到最后的原因。', ja: '君は留まった。それが君が最後まで歩けた理由だ。', en: 'You paused. That’s why you made it to the end.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.ito_final.pollution.01', zh: '那个据点，被污染了。', ja: 'その拠点が汚染された。', en: 'That hub is polluted.' },
      ],
      line_win: [
        { key: 'boss.ito_final.line_win.01', zh: '三点连线。收尾。', ja: '三点ライン。締めだ。', en: 'Three in a line. Closing it out.' },
      ],
      line_steal: [
        { key: 'boss.ito_final.line_steal.01', zh: '你的线，还差一格。', ja: '君のラインは、あと一マス。', en: 'Your line is one cell short.' },
      ],
      pressure_incoming: [
        { key: 'boss.ito_final.pressure.01', zh: '我要压你那边了。', ja: 'そちら側を押す。', en: 'I’m pressing your side.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.ito_final.strategy.attack', zh: '这个据点，我收下。', ja: 'この拠点、いただく。', en: 'I’ll take this hub.' },
      defend: { key: 'boss.ito_final.strategy.defend', zh: '先稳后动。', ja: '先に固めてから動く。', en: 'Steady first, move after.' },
      global: { key: 'boss.ito_final.strategy.global', zh: '全盘，我都要。', ja: '盤面全部、もらう。', en: 'I’ll take the whole board.' },
      counter: { key: 'boss.ito_final.strategy.counter', zh: '你动了我的刻痕。', ja: '君は俺の刻みに触れた。', en: 'You touched my mark.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.ito_final.win.01', zh: '……你走完了。', ja: '……君は歩き切った。', en: '…You walked it all.' },
      ],
      playerLose: [
        { key: 'boss.ito_final.lose.01', zh: '我只是经过。', ja: '私はただ通り過ぎただけだ。', en: 'I was only passing through.' },
      ],
      draw: [
        { key: 'boss.ito_final.draw.01', zh: '平局。我们都在等。', ja: '引き分けか。互いに待っていた。', en: 'A draw. We were both waiting.' },
      ],
    },
  },

  // ---------------- 沈墨（shenmo）· 沉稳试探 ----------------
  shenmo: {
    id: 'shenmo',
    meta: {
      name: { 'zh-CN': '沈墨', 'ja-JP': '沈墨', 'en-US': 'Shenmo' },
      personality: 'prober',
      strategyProfile: 'calm-probe',       // 试探、观察、后发制人
      difficultyCurve: [0.45, 0.6, 0.75, 0.9],
      visualTheme: 'ink-calm',
    },
    phaseLines: {
      opening: [
        { key: 'boss.shenmo.opening.01', zh: '左边很安全，对吗？', ja: '左は安全だと思っている？', en: 'The left is safe. Isn’t it?' },
        { key: 'boss.shenmo.opening.02', zh: '开始之前，我更喜欢先看清你。', ja: '始める前に、君をよく見ておこう。', en: 'Before we begin, I prefer to study you first.' },
      ],
      development: [
        { key: 'boss.shenmo.development.01', zh: '你一直守那里，我注意到了。', ja: 'ずっとそこを守っている。気づいていた。', en: 'You keep guarding that spot. I’ve noticed.' },
        { key: 'boss.shenmo.development.02', zh: '执着于一处的人，往往顾此失彼。', ja: '一か所に固執する者は、往々にして失う。', en: 'Those who cling to one place often lose another.' },
      ],
      crisis: [
        { key: 'boss.shenmo.crisis.01', zh: '中央空出来了。', ja: '中央が空いた。', en: 'The center has opened.' },
        { key: 'boss.shenmo.crisis.02', zh: '局面将倾，你已经没有退路。', ja: '盤面は傾き、君に逃げ場はない。', en: 'The board is tipping—you have no way out.' },
      ],
      climax: [
        { key: 'boss.shenmo.climax.01', zh: '最后一步，你确定吗？', ja: '最後の一手、それでいいのか？', en: 'That last move—are you certain?' },
        { key: 'boss.shenmo.climax.02', zh: '尘埃落定之前，一切都未可知。', ja: '砂が落ち着くまで、全ては未知だ。', en: 'Until the dust settles, nothing is certain.' },
      ],
    },
    eventLines: {
      pollution: [
        { key: 'boss.shenmo.pollution.01', zh: '污染侵蚀了那个据点。你能守住吗？', ja: '汚染がその拠点を蝕んでいる。守れるか？', en: 'The pollution is eating that hub. Can you hold it?' },
      ],
      line_win: [
        { key: 'boss.shenmo.line_win.01', zh: '三点连线。棋局已终。', ja: '三点ライン。棋局は終わった。', en: 'Three in a line. The game is over.' },
      ],
      line_steal: [
        { key: 'boss.shenmo.line_steal.01', zh: '你的线，还差一寸。', ja: '君のラインは、あと一寸足りない。', en: 'Your line is still an inch short.' },
      ],
      pressure_incoming: [
        { key: 'boss.shenmo.pressure.01', zh: '这次，看向另一侧吧。', ja: '今度は、反対側を見るといい。', en: 'This time, look to the other side.' },
      ],
    },
    strategyLines: {
      attack: { key: 'boss.shenmo.strategy.attack', zh: '这个据点，我收下了。', ja: 'この拠点、いただく。', en: 'I’ll take this hub.' },
      defend: { key: 'boss.shenmo.strategy.defend', zh: '先稳后动。', ja: '先に固めてから動く。', en: 'Steady first, move after.' },
      global: { key: 'boss.shenmo.strategy.global', zh: '据点不过是虚妄，胜负在整盘。', ja: '拠点は虚妄、勝負は盤全体にある。', en: 'Hubs are illusion; victory lies in the whole board.' },
      counter: { key: 'boss.shenmo.strategy.counter', zh: '你动了不该动的地方。', ja: '君は触れてはいけない場所に触れた。', en: 'You touched where you shouldn’t have.' },
    },
    feedback: {
      playerWin: [
        { key: 'boss.shenmo.win.01', zh: '……你赢了。看来是我看漏了。', ja: '……君の勝ちだ。私の見落としだった。', en: '…You win. It seems I overlooked something.' },
      ],
      playerLose: [
        { key: 'boss.shenmo.lose.01', zh: '棋局已定。去下一处吧。', ja: '棋局は定まった。次へ行こう。', en: 'The game is decided. Move on.' },
      ],
      draw: [
        { key: 'boss.shenmo.draw.01', zh: '平局。你我都在试探。', ja: '引き分けか。互いに探り合っていた。', en: 'A draw. We were both probing.' },
      ],
    },
  },
};

// ---------------- 通用兜底包（未配置的 Boss） ----------------
export const DEFAULT_BOSS_PACK = {
  id: 'default',
  meta: {
    name: { 'zh-CN': '守卫者', 'ja-JP': '守護者', 'en-US': 'Keeper' },
    personality: 'steady',
    strategyProfile: 'balanced',
    difficultyCurve: [0.4, 0.55, 0.7, 0.85],
    visualTheme: 'neutral',
  },
  phaseLines: {
    opening: [{ key: 'boss.default.opening.01', zh: '开始了。', ja: '始まる。', en: 'It begins.' }],
    development: [{ key: 'boss.default.development.01', zh: '有意思。', ja: '面白い。', en: 'Interesting.' }],
    crisis: [{ key: 'boss.default.crisis.01', zh: '局势紧张了。', ja: '局面が緊迫した。', en: 'The situation tightens.' }],
    climax: [{ key: 'boss.default.climax.01', zh: '最后一手。', ja: '最後の一手。', en: 'The final move.' }],
  },
  eventLines: {
    pollution: [{ key: 'boss.default.pollution.01', zh: '那里被污染了。', ja: 'そこが汚染された。', en: 'That place is polluted.' }],
    line_win: [{ key: 'boss.default.line_win.01', zh: '三点连线。', ja: '三点ライン。', en: 'Three in a line.' }],
    line_steal: [{ key: 'boss.default.line_steal.01', zh: '我不会让你连线。', ja: 'ラインは渡さない。', en: 'I won’t let you make the line.' }],
    pressure_incoming: [{ key: 'boss.default.pressure.01', zh: '我要施压了。', ja: '圧力をかける。', en: 'I’m applying pressure.' }],
  },
  strategyLines: {
    attack: { key: 'boss.default.strategy.attack', zh: '攻。', ja: '攻め。', en: 'Attack.' },
    defend: { key: 'boss.default.strategy.defend', zh: '守。', ja: '守り。', en: 'Defend.' },
    global: { key: 'boss.default.strategy.global', zh: '填满全盘。', ja: '盤面を埋める。', en: 'Fill the board.' },
    counter: { key: 'boss.default.strategy.counter', zh: '反击。', ja: '反撃。', en: 'Counter.' },
  },
  feedback: {
    playerWin: [{ key: 'boss.default.win.01', zh: '你赢了。', ja: '君の勝ちだ。', en: 'You win.' }],
    playerLose: [{ key: 'boss.default.lose.01', zh: '你输了。', ja: '君の負けだ。', en: 'You lose.' }],
    draw: [{ key: 'boss.default.draw.01', zh: '平局。', ja: '引き分け。', en: 'Draw.' }],
  },
};

/** 按 bossId 取内容包（未配置回退通用包） */
export function getBossPack(bossId) {
  return (bossId && BOSS_PACKS[bossId]) || DEFAULT_BOSS_PACK;
}

export default { BOSS_PACKS, DEFAULT_BOSS_PACK, getBossPack, SUPPORTED_LOCALES, DEFAULT_LOCALE };
