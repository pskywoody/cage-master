// 更新章节标题、副标题、描述、图标、颜色等元数据
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'game-src', 'data', 'chapters.json');
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

const chapterMeta = {
  1: {
    title: '初识笼中密码',
    subtitle: '入门篇 · 4×4',
    icon: '📁',
    color: '#22c55e',
    description: '你作为新人侦探来到旧档案馆，守笼人是谜题管理员，阿岩是实习侦探。从4×4迷你盘面开始，学习数独三大铁律和杀手数独基础笼格。'
  },
  2: {
    title: '四十五星衡',
    subtitle: '基础篇 · 6×6/9×9',
    icon: '⭐',
    color: '#3b82f6',
    description: '进入手稿室，学习星衡法则（21法则与45法则），掌握基础差值推演，初闻设局人留声印记。'
  },
  3: {
    title: '档案室深层',
    subtitle: '进阶篇 · 9×9',
    icon: '🕵️',
    color: '#8b5cf6',
    description: '深入档案馆深层，学习区块排除、数对法、X-Wing等进阶技巧。设局人正式现身对话，揭露当年与守笼人的同门过往。'
  },
  4: {
    title: '尘封旧案',
    subtitle: '提高篇 · 9×9',
    icon: '📜',
    color: '#f59e0b',
    description: '通过残缺笔记逆向推导当年决裂事件的真相碎片，学习残局逆向推导技巧，情感浓度最高的一章。'
  },
  5: {
    title: '星辰梭核心',
    subtitle: '挑战篇 · 9×9',
    icon: '🔮',
    color: '#ef4444',
    description: '深入星辰梭核心，面对嵌套笼、异形笼、复合笼组合，笼局复杂度达到峰值。星辰梭的真正用途逐渐浮出水面。'
  },
  6: {
    title: '终局笼局',
    subtitle: '大师篇 · 9×9',
    icon: '👑',
    color: '#ec4899',
    description: '设局人留下的最后六道笼局，每一关对应一段往事。终局双答案设计，主线完整收束，你将成为新任守笼人。'
  }
};

for (const ch of data) {
  const meta = chapterMeta[ch.chapterId];
  if (meta) {
    Object.assign(ch, meta);
  }
}

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
console.log('✅ 章节元数据更新完成！');
for (const ch of data) {
  console.log(`第${ch.chapterId}章: ${ch.title} (${ch.subtitle}) - ${ch.levels.length}关`);
}
