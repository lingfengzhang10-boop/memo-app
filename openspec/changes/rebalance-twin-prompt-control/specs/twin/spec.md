## MODIFIED Requirements

### 需求: Twin chat uses active version and twin memory context
分身对话必须继续基于当前激活的分身版本、相关的人格与事实/经历上下文生成回复，但系统必须把“保护真相”和“生成自然表达”分层处理，避免把数据库摘要和系统规则直接复述成回答。

#### 场景:User chats with seeded twin
- **当** 用户进入分身对话页并发送消息
- **那么** 系统必须读取 `active_version_id` 对应的版本快照
- **那么** 系统必须只向模型提供与当前问题最相关的 confirmed facts、confirmed events、必要 semantic evidence 和当前对话语境
- **那么** 系统不得把大量无关摘要或重复控制规则直接摊平成回答提示

#### 场景:User asks a follow-up on a known topic
- **当** 用户围绕同一话题继续追问
- **那么** 系统必须优先告诉模型“这轮该补充、换角度还是自然收束”
- **那么** 系统不得通过硬编码句级规则强迫模型逐条重复上一轮已经说过的内容

#### 场景:User asks a normal non-risky question
- **当** 用户发送一条普通且低风险的文本或语音消息
- **那么** 系统必须给模型保留足够的表达自由度
- **那么** 分身回复必须更像自然叙述，而不是日志式执行结果
