## 上下文

当前分身链路已经有三层真相约束：

- `twin_versions` 里的 active truth
- confirmed `memory_facts` / `memory_events`
- semantic evidence / topic interaction memory 这样的运行时补充层

这些层解决的是“什么是真的、什么是已确认的、当前和谁聊到哪了”。但 `app/api/twin/chat/route.ts` 现在把太多系统内部状态直接摊平成 prompt 规则，包括：

- 很多显式禁止和 fallback 约束
- 很多系统术语化的路由信息
- 很多事实 / 事件 / evidence 的并列摘要

这会让模型更稳，但也更像在执行说明书。豆包一类强模型在短轮拟人上的优势，恰恰来自“更少的显式控制 + 更强的临场表达”。这次设计不是推翻底层，而是重新划定系统层和模型层的边界。

## 目标 / 非目标

**目标：**
- 保留少量不可违背的真相边界，让模型继续受 confirmed truth 约束。
- 把 twin chat 的输入重组为“真相包 + 对话包 + 轻量表达提示”，减少规则堆叠。
- 通过少量 few-shot 覆盖高频场景，让模型学会自然地补充、换角度、模糊回忆和收束。
- 让系统更多负责“边界与方向”，让模型更多负责“这句话怎么说”。
- 保留现有调试可观测性，但不把调试术语原样写进 prompt。

**非目标：**
- 不修改数据库 schema。
- 不推翻 semantic substrate、topic interaction memory、situational routing 的底层方向。
- 不把未确认内容直接提升为正式真相。
- 不在这次变更里引入新的前端页面或新的用户确认步骤。

## 决策

### 决策 1：把 prompt 结构收敛为三层

新的 twin system prompt 只保留三层：

1. 真相边界
2. 当前语境包
3. 表达方式提示

真相边界只包含必须保留的硬约束，例如：
- confirmed truth 优先
- raw evidence 只能补细节
- 禁止编新人物、新事件、新社交活动

当前语境包只包含这轮真正需要的内容，例如：
- 当前 topic / anchors
- 上一轮已说角度
- 这轮更适合补充、换角度还是收束

表达方式提示则只保留少量关于“像人地说”的指导。

替代方案：
- 继续在当前大 prompt 上叠规则
- 让所有路由状态原样出现在 prompt 中

不采用，因为这两条都会继续放大“说话像执行器”的问题。

### 决策 2：把系统术语留在 debug，不直接喂给模型

像 `answerProgressionMode`、`topicRecencyBand`、`fallbackReason` 这类字段保留在 debug 和日志层，方便验证，但进入 prompt 时必须翻译成自然语言提示，例如：

- “这段刚聊过，别原样重复”
- “今天聊过这段，轻一点带出记得感”
- “如果没有新角度，简短收束”

替代方案：
- 直接把系统内部状态原样写入 prompt

不采用，因为模型会更像读配置，而不是读语境。

### 决策 3：用 few-shot 替代一部分句级规则

高频但容易说硬的场景不再主要靠规则表达，而改为少量示例：

- 刚聊过同一话题再追问
- 同日重问
- 几天后再问
- 没有新角度时自然收束

few-shot 只覆盖对话策略，不覆盖人生事实本体。事实仍然由底层结构提供。

替代方案：
- 完全不用 few-shot，只写规则
- 大量 few-shot 覆盖所有情况

不采用前者，因为不够自然；不采用后者，因为会让 prompt 过重。

### 决策 4：压缩 context packing，优先给“最少但最相关”的材料

context packing 改成：

- 真相包：active truth + 当前最相关 confirmed facts/events + 必要 raw evidence
- 对话包：topic、前一轮角度、这轮推进方向、记得感强弱

而不是无差别把所有可用摘要并列给模型。

替代方案：
- 保持当前“凡是可能相关都给”

不采用，因为会拉低生成聚焦度，也会让回答更像复述摘要。

## 风险 / 权衡

- [风险] 约束收得太松，模型可能重新出现扩写和轻度脑补。  
  → 缓解措施：真相边界仍保留；ASR trust pipeline、situational routing、topic interaction memory 不删除。

- [风险] 压缩上下文后，模型可能漏掉一些次要但真实的细节。  
  → 缓解措施：优先压缩“重复和术语”，不压缩当前最相关证据；保留 semantic evidence 的少量高价值片段。

- [风险] few-shot 写得不像当前分身人设，可能统一了风格。  
  → 缓解措施：few-shot 只示范“对话推进方式”，不规定具体人格语气。

- [风险] debug 仍然存在，但 prompt 更自然后，问题更难追。  
  → 缓解措施：保留结构化 debug 输出，区分“给模型看的”和“给工程看的”。

## Migration Plan

1. 先重构 twin chat 的 prompt builder 和 context packing，不改数据结构。
2. 加入 few-shot，并保留一个简短开关，必要时可临时回退到旧 prompt 版本。
3. 用现有的 Hangzhou / same-topic / same-day 场景做回归验证。
4. 如果回答出现明显幻觉回潮，优先收紧真相边界和 context 选择，不回到大段规则堆叠。

## Open Questions

- few-shot 是直接内联在 route 里，还是抽成单独模板文件更好维护？
- 当前 `expressionSnapshot` 里的哪些字段真的对“像人”有帮助，哪些只是噪音？
- 是否需要为不同风险等级的语音输入使用两套不同强度的 prompt，而不是一套通用 prompt？
