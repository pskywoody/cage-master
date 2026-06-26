# GuideManager 教学引导系统使用说明

## 概述

GuideManager 是杀手数独教学模式的引导系统，负责根据配置的触发器自动弹出教学引导。它由三部分组成：

1. **触发器判定引擎** — 根据游戏事件（关卡开始、填数、选中等）判断是否触发引导
2. **FreezeMask 冷冻遮罩** — 全屏遮罩 + 高亮挖空，用于强引导
3. **PopupHint 气泡提示** — 轻量气泡，用于弱提示

## 文件位置

- 核心代码：`game-src/guide-manager.js`
- 样式文件：`game-src/assets/css/style.css`（`.guide-*` 开头的类）

## 快速开始

### 1. 引入 JS

在 `index.html` 中引入（需在 `main.js` 之前）：

```html
<script src="guide-manager.js"></script>
```

### 2. 创建实例

```javascript
const guide = new GuideManager({
  triggers: levelTriggers,    // 当前关卡的触发器配置
  levelId: 101,               // 关卡ID（用于本地存储去重）
  board: gameBoard,           // 棋盘对象引用
  renderer: renderer,         // 渲染器引用
  canvas: document.getElementById('gameCanvas')
});
```

### 3. 调用事件钩子

在游戏主循环的对应位置调用：

```javascript
// 关卡加载完成后
guide.onLevelStart();

// 玩家填数后
guide.onNumberFilled(r, c, num);

// 玩家选中格子后
guide.onCellSelect(r, c);

// 玩家选中笼子后（可选）
guide.onCageSelect(cage);

// 关卡通关时
guide.onLevelComplete();

// 每帧/每秒更新（卡壳计时用）
// 在主循环中调用，deltaTime 单位为秒
setInterval(() => guide.update(1), 1000);
```

## 触发器配置

每个关卡通过 `triggers` 数组配置引导。每个触发器结构如下：

```javascript
{
  id: 'trigger_001',         // 唯一ID（once: true 时必须）
  once: true,                // 是否只触发一次（默认 true）
  condition: {               // 触发条件
    type: 'onLevelStart'     // 条件类型
    // ... 其他条件参数
  },
  type: 'freeze_mask',       // 触发器类型
  config: {                  // UI 配置
    // ... 类型相关配置
  }
}
```

### 触发条件类型

#### 1. `onLevelStart` — 关卡开始时

```javascript
{ type: 'onLevelStart' }
```

#### 2. `onFirstNumberFilled` — 填入第一个数字时

```javascript
{ type: 'onFirstNumberFilled' }
```

#### 3. `onCageSelect` — 选中某个笼子时

```javascript
{
  type: 'onCageSelect',
  cageSize: 2,    // 可选：笼子格子数
  cageSum: 10,    // 可选：笼子和值
  cageId: 5       // 可选：指定笼子ID
}
```

#### 4. `onRowSelect` — 选中某一行时

```javascript
{
  type: 'onRowSelect',
  row: 0          // 可选：指定行号（0-based），不填则任意行都触发
}
```

#### 5. `onRowFillProgress` — 某行填了N个数字时

```javascript
{
  type: 'onRowFillProgress',
  row: 2,          // 可选：指定行，默认取当前填数所在行
  filledCount: 5   // 已填数量阈值
}
```

#### 6. `onBoxFillProgress` — 某个宫填了N个数字时

```javascript
{
  type: 'onBoxFillProgress',
  boxRow: 0,       // 可选：宫的行索引 (0-2)
  boxCol: 1,       // 可选：宫的列索引 (0-2)
  filledCount: 6   // 已填数量阈值
}
```

#### 7. `onStuckForSeconds` — 玩家卡壳N秒

```javascript
{
  type: 'onStuckForSeconds',
  seconds: 30      // 卡壳秒数
}
```

> 注意：需要调用 `guide.update(deltaTime)` 才能正常工作。每次填数会重置卡壳计时。

#### 8. `onLevelComplete` — 关卡通关时

```javascript
{ type: 'onLevelComplete' }
```

### 触发器类型

#### 1. `freeze_mask` — 冷冻遮罩

```javascript
{
  type: 'freeze_mask',
  config: {
    text: '点击这个格子，填入数字 5',   // 引导文字
    targetType: 'cell',                 // 高亮类型：cell / cage / row / box / full
    targetR: 2,                         // 目标行（targetType 为 cell/row/box 时）
    targetC: 3,                         // 目标列
    targetFromEvent: true,              // 从事件数据获取目标（替代 targetR/targetC）
    highlightShape: 'circle',           // 高亮形状：circle / rect
    onCloseAction: 'resumeGame'         // 关闭后的动作（预留）
  }
}
```

**targetType 说明：**
- `cell` — 高亮单个格子
- `cage` — 高亮整个笼子（需提供 `targetCells` 或通过 `targetFromEvent` 获取）
- `row` — 高亮整行
- `box` — 高亮整个宫
- `full` — 无高亮，全屏遮罩

#### 2. `popup_hint` — 气泡提示

```javascript
{
  type: 'popup_hint',
  config: {
    text: '试试 45 法则！',              // 提示文字
    position: 'top',                     // 气泡位置：top / bottom / left / right
    duration: 3500,                      // 显示时长（毫秒），默认 3500
    targetR: 1,                          // 目标行
    targetC: 0,                          // 目标列
    targetFromEvent: true                // 从事件数据获取目标
  }
}
```

#### 3. `calc_panel` — 计算器面板（预留接口）

目前仅打印日志，后续实现。

#### 4. `badge_award` — 徽章奖励（预留接口）

目前仅打印日志，后续实现。

## 完整示例

以下是一个教学关卡的触发器配置示例：

```javascript
const teachingTriggers = [
  // 关卡开始：欢迎引导
  {
    id: 'welcome',
    once: true,
    condition: { type: 'onLevelStart' },
    type: 'freeze_mask',
    config: {
      text: '欢迎来到杀手数独！让我们一起开始吧。',
      targetType: 'full',
      highlightShape: 'circle'
    }
  },
  // 第一次填数：正向反馈
  {
    id: 'first_fill',
    once: true,
    condition: { type: 'onFirstNumberFilled' },
    type: 'popup_hint',
    config: {
      text: '很棒！继续加油～',
      position: 'top',
      duration: 2500,
      targetFromEvent: true
    }
  },
  // 选中2格笼子时：提示45法则
  {
    id: 'cage_2cell_hint',
    once: true,
    condition: {
      type: 'onCageSelect',
      cageSize: 2
    },
    type: 'freeze_mask',
    config: {
      text: '两格笼子的和值可以帮你缩小候选范围',
      targetType: 'cage',
      targetFromEvent: true,
      highlightShape: 'rect'
    }
  },
  // 卡壳30秒：提示
  {
    id: 'stuck_30s',
    once: true,
    condition: {
      type: 'onStuckForSeconds',
      seconds: 30
    },
    type: 'popup_hint',
    config: {
      text: '试试使用提示功能吧！',
      position: 'bottom',
      duration: 4000,
      targetR: 4,
      targetC: 4
    }
  },
  // 通关：恭喜
  {
    id: 'complete',
    once: true,
    condition: { type: 'onLevelComplete' },
    type: 'popup_hint',
    config: {
      text: '恭喜通关！你掌握了基础技巧。',
      position: 'top',
      duration: 5000,
      targetR: 4,
      targetC: 4
    }
  }
];
```

## API 参考

### GuideManager 方法

| 方法 | 参数 | 说明 |
|------|------|------|
| `onLevelStart()` | 无 | 关卡开始时调用 |
| `onNumberFilled(r, c, num)` | 行, 列, 数字 | 玩家填数时调用 |
| `onCellSelect(r, c)` | 行, 列 | 玩家选中格子时调用 |
| `onCageSelect(cage)` | 笼子对象 | 玩家选中笼子时调用 |
| `onLevelComplete()` | 无 | 关卡通关时调用 |
| `update(deltaTime)` | 经过秒数 | 每帧/每秒调用，用于卡壳计时 |
| `reset()` | 无 | 重置运行时状态（不清 once 记录） |
| `clearAllRecords()` | 无 | 清除当前关卡的所有引导记录 |
| `triggerById(id)` | 触发器ID | 手动触发某个触发器（调试用） |
| `closeAll()` | 无 | 关闭所有引导 UI |
| `destroy()` | 无 | 销毁实例，清理 DOM |

### FreezeMask 方法

| 方法 | 参数 | 说明 |
|------|------|------|
| `show(options)` | 见下方 | 显示遮罩 |
| `close()` | 无 | 关闭遮罩 |
| `destroy()` | 无 | 销毁 |

**FreezeMask show 选项：**
- `targetR`, `targetC` — 目标格子坐标
- `targetType` — `cell` / `cage` / `row` / `box` / `full`
- `targetCells` — 笼子格子数组 `[[r,c], ...]`
- `text` — 引导文字
- `highlightShape` — `circle` / `rect`
- `canvas` — canvas DOM 元素
- `cellSize` — 格子像素尺寸
- `padding` — canvas 内边距
- `onClose` — 关闭回调

### PopupHint 方法

| 方法 | 参数 | 说明 |
|------|------|------|
| `show(options)` | 见下方 | 显示气泡 |
| `hide()` | 无 | 隐藏气泡 |
| `destroy()` | 无 | 销毁 |

**PopupHint show 选项：**
- `targetR`, `targetC` — 目标格子坐标
- `text` — 提示文字
- `position` — `top` / `bottom` / `left` / `right`
- `duration` — 显示时长（毫秒）
- `canvas` — canvas DOM 元素
- `cellSize` — 格子像素尺寸
- `padding` — canvas 内边距
- `onClose` — 关闭回调

## 本地存储

`once: true` 的触发器触发后会记录到 localStorage，key 格式为：

```
killersudoku_guide_triggered_{levelId}
```

存储内容为已触发的触发器 ID 数组。

## 集成到现有游戏

在 `main.js` 中的集成位置参考：

```javascript
// 1. 关卡加载后创建实例
let guide = null;
if (puzzle.triggers && puzzle.triggers.length > 0) {
  guide = new GuideManager({
    triggers: puzzle.triggers,
    levelId: currentLevelId,
    board: gameBoard,
    renderer: renderer,
    canvas: renderer.canvas
  });
  guide.onLevelStart();
}

// 2. 填数时调用
function handleNumberInput(num) {
  // ... 原有填数逻辑 ...
  if (guide && gameBoard.selectedCell) {
    const { r, c } = gameBoard.selectedCell;
    guide.onNumberFilled(r, c, num);
  }
}

// 3. 选中格子时调用
function handleCanvasTap(clientX, clientY) {
  // ... 原有选中逻辑 ...
  if (guide) {
    guide.onCellSelect(r, c);
  }
}

// 4. 通关时调用
function markComplete() {
  // ... 原有通关逻辑 ...
  if (guide) {
    guide.onLevelComplete();
  }
}

// 5. 卡壳计时（可利用现有计时器）
// 在 startTimer 的 setInterval 中添加：
if (guide) guide.update(1);
```

## 注意事项

1. **坐标系统**：所有行列坐标均为 0-based，与游戏棋盘 `Board.cells[r][c]` 一致
2. **响应式**：UI 组件会根据 canvas 的实际显示尺寸自动计算位置，支持移动端缩放
3. **Z-index**：freeze_mask 使用 z-index 500，popup_hint 使用 z-index 400，确保盖在游戏 UI 之上
4. **性能**：UI 组件采用懒创建，首次使用时才创建 DOM 元素
5. **边界检测**：气泡提示会自动检测视口边界，不会超出屏幕
6. **不打断操作**：popup_hint 设置了 `pointer-events: none`，不会阻挡玩家点击
