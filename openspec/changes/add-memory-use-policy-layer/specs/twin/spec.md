## MODIFIED Requirements

### 需求: Twin chat uses active version and twin memory context
分身对话必须基于当前激活的分身版本，并带上相应的人格、事实与经历上下文；在生成回复前，系统还必须通过记忆使用策略层裁剪本轮可用记忆包，避免把召回到的无关、未确认或已讲过内容直接交给模型。

#### 场景:User chats with seeded twin
- **当** 用户进入分身对话页并发送消息
- **那么** 系统必须读取 `active_version_id` 对应的版本快照
- **那么** 系统必须结合人格摘要、表达摘要、facts snapshot 与 events snapshot 生成候选上下文
- **那么** 系统必须通过记忆使用策略层生成本轮可用记忆包后再构造 prompt
- **那么** 系统禁止把未经裁剪的全部召回结果直接交给模型

#### 场景:User repeats a known topic immediately
- **当** 同一用户短时间内重复询问同一分身话题
- **那么** 系统必须识别该 topic 的上一轮回答角度
- **那么** 系统必须指示模型补充、换角度或自然收束
- **那么** 分身回复禁止原样复述上一轮已经说过的核心句子

#### 场景:User asks for more details on the same topic
- **当** 用户围绕同一 topic 追问“还有别的吗”
- **那么** 系统必须只允许当前 topic 下可信、未讲过的记忆进入回答
- **那么** 如果没有新增可信细节，分身必须自然表达当前能想起来的主要就是这些
- **那么** 分身禁止编造新事件或跨主题套用其他记忆

#### 场景:User probes an unconfirmed event
- **当** 用户询问当前记忆包中不存在的具体事件
- **那么** 分身必须保持不确定或说明没有明确记得
- **那么** 分身禁止为了显得像真人而创造未确认人物、地点、社交活动或爱好细节

#### 场景:User returns after time has passed
- **当** 同一用户在几小时或几天后再次询问同一 topic
- **那么** 系统必须允许分身带有自然的模糊记得感
- **那么** 分身禁止机械暴露精确内部时间、topic key 或调试字段
