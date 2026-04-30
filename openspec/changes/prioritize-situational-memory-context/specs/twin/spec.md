## MODIFIED Requirements

### 需求:Twin chat uses active version and twin memory context
分身对话必须基于当前激活的分身版本，并在此基础上优先消费与用户问题锚点相匹配的局部记忆上下文；只有当局部上下文不足以回答时，才允许回退到全局长期事实。

#### 场景:User chats with seeded twin
- **当** 用户进入分身对话页并发送普通消息
- **那么** 系统必须读取 `active_version_id` 对应的版本快照
- **那么** 系统必须结合人格摘要、表达摘要、facts snapshot 与 events snapshot 生成回复

#### 场景:User asks a situational question
- **当** 用户提问包含明确的时间、地点、人物或阶段锚点
- **那么** 系统必须优先在与该锚点匹配的局部 events、facts 和 semantic evidence 中组织答案
- **那么** 不得在局部证据充分时直接由全局 fear fact 主导回答

#### 场景:Global fallback is required
- **当** 局部语境证据不足以支撑回答
- **那么** 系统才可以回退到 active version 中的全局 confirmed fact
- **那么** 回退必须带有可解释的原因记录
