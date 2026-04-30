## 上下文

当前系统已经有三层和分身相关的记忆：

- `twin_versions` 中的 active truth
- confirmed `memory_facts` / `memory_events`
- semantic substrate 中的 raw evidence

这三层解决的是“这个人经历过什么、通常如何表达、当前分身真相是什么”。但它们没有记录“这个话题刚刚和谁聊过、聊到哪一层、多久前聊过”。结果是同一用户在短时间内追问同一话题时，分身会继续返回最强人生线索，而不会表现出真人对会话递进的记忆感。

这次设计的约束：

1. 互动记忆不能覆盖 confirmed truth，只能决定“怎么讲”和“这次讲到哪一层”。
2. 互动记忆必须区分 same asker 与 different asker，不能把上一位 asker 的对话痕迹带给下一位。
3. 互动记忆必须带自然遗忘曲线，不能永远精确记得“你在几点问过”。
4. 这次先实现最小闭环：优先解决同一 asker 的短期重复和短期重问，不一次做完整共享分身社交系统。

## 目标 / 非目标

**目标：**

- 为分身增加轻量、可持久化的话题互动记忆。
- 在同一 asker 的短期追问里，优先补充、换角度或诚实收束，而不是复述上一轮。
- 在同一 asker 的不同时间间隔里，生成不同强度的“记得你问过”表达。
- 在 different asker 场景里，把同一人生事实当作新一轮讲述，而不是继承前一个 asker 的上下文。
- 为运行时输出增加互动记忆路由解释，便于验证和调试。

**非目标：**

- 不做完整多用户共享分身权限系统。
- 不做完整社交关系图或 asker 身份体系。
- 不让互动记忆进入 `twin_versions` 或长期人生事实层。
- 不在这次变更里引入新的前台页面。

## 决策

### 决策 1：新增 `twin_topic_interactions` 作为轻量互动记忆层

新增一张表，用于记录：

- `twin_id`
- `asker_key`
- `topic_key`
- `last_discussed_at`
- `discuss_count`
- `last_answer_summary`
- `last_answer_angle`
- `last_answer_mode`
- `last_response_excerpt`
- `metadata`

这里的 `asker_key` 在最小实现里先用当前登录用户自身的 `user_id`，为后续共享分身留接口。`topic_key` 由运行时基于 situational anchors + local concern / event / fact 生成稳定键。

替代方案：

- 只把“刚刚说过什么”放在前端内存里。

不采用该方案，因为它无法支持“几小时后 / 几天后”的模糊记得感，也无法跨设备保持最基本的一致性。

### 决策 2：把互动记忆当成“回答编排层”，不是“事实层”

互动记忆只决定：

- 这次是首次回答、递进回答、模糊唤回还是诚实收束
- 这次要不要避免重复上一轮的主线
- 这次是否要带一句“我记得你问过”

互动记忆不决定：

- 人生事实真假
- 是否产生新记忆资产
- 是否修改 active twin truth

这样可以保证这层即使出错，也最多影响回答风格，不会污染底层真相。

### 决策 3：使用时间分段而不是绝对精确时间模板

对 same asker 的回忆感分为四档：

- `immediate`：0-30 分钟，强记忆
- `same_day`：30 分钟到 24 小时，中记忆
- `recent`：1-7 天，弱记忆
- `stale`：7 天以后，不主动强调“你问过”

这四档只提供路由信号和 prompt/answer mode，不把具体“今天上午 10:32”这样的精确时间暴露给回答。

替代方案：

- 永远精确地告诉用户“你上午问过”
- 完全不记得曾经聊过

前者太机械，后者太失真。分段遗忘更接近真人体验。

### 决策 4：引入 `answerProgressionMode`

运行时新增一组回答模式：

- `fresh_answer`
- `deepen_answer`
- `diversify_answer`
- `graceful_close`
- `fuzzy_recall`

选择逻辑大致是：

- 同一 asker、短时间、同 topic、上一轮已覆盖当前 strongest angle：优先 `deepen_answer` 或 `graceful_close`
- 同一 asker、同日稍后再问：优先 `fuzzy_recall`
- different asker：回到 `fresh_answer`

### 决策 5：最小实现先覆盖 “same asker + same topic”

这次先实现以下闭环：

1. 能识别同一 topic 的再次提问
2. 能记录上一轮回答角度
3. 能在短期追问时避免重复同一角度
4. 能在没有新角度时诚实收束

先不做：

- 复杂 asker 身份识别
- 群聊级共享分身会话
- 话题树和多层多轮追踪

## 风险 / 权衡

- [风险] topic key 过粗，会把不同问题误判成同一话题。  
  -> 缓解措施：首版 topic key 由 situational anchors + dominant local concern / event 共同组成，并输出 debug 字段。

- [风险] 为了避免重复，分身可能变得过度保守。  
  -> 缓解措施：引入 `deepen_answer` / `diversify_answer`，优先换角度，其次才是 `graceful_close`。

- [风险] 互动记忆可能被错误地当成长期记忆。  
  -> 缓解措施：数据模型和代码中明确区分 interaction memory 与 twin truth，不允许写入 `twin_versions`。

- [风险] different asker 未来接入前，当前 `asker_key` 设计会显得冗余。  
  -> 缓解措施：首版先统一落当前用户自身键，但结构上保留扩展位，避免未来大改。

## Migration Plan

1. 新增 `twin_topic_interactions` 表，不影响现有表结构和读路径。
2. 在 `/api/twin/chat` 中增加 topic interaction 读取、路由和回写。
3. 先以 feature flag 或保守默认启用，保证无 interaction 记录时仍能正常按现有路径回答。
4. 如果发现回答质量下降，可临时关闭互动记忆路由，回退到现有 situational routing。

## Open Questions

- `topic_key` 是否需要单独写入 `semantic_memory_chunks` 做反查，还是先只在运行时构造即可？
- `asker_key` 在共享分身引入前，是否需要额外支持匿名访客键？
- `last_answer_angle` 是否只存结构化标签，还是同时保留一段短摘要文本？
