## MODIFIED Requirements

### 需求: Twin chat uses active version, twin memory context, and interaction memory
分身对话必须同时基于当前激活的分身版本、相应的人格与事实/经历上下文，以及当前 asker 的互动记忆来生成回复。

#### 场景: User chats with seeded twin
- **当** 用户进入分身对话页并发送消息
- **那么** 系统必须读取 `active_version_id` 对应的版本快照
- **那么** 系统必须结合人格摘要、表达摘要、facts snapshot、events snapshot 和当前互动记忆生成回复
- **那么** 如果这是同一 asker 对同一 topic 的再次追问，系统不得机械重复上一轮已经说过的核心内容

#### 场景: Same asker asks follow-up on the same topic
- **当** same asker 在短时间内继续追问同一 topic
- **那么** 系统必须优先尝试补充、换角度或诚实收束
- **那么** 只有在存在新的局部证据或新的回答角度时，系统才可以继续展开

#### 场景: Different asker asks the same topic
- **当** different asker 询问已经被其他 asker 讨论过的话题
- **那么** 系统必须重新组织适合当前 asker 的 fresh answer
- **那么** 不得直接把上一位 asker 的对话记忆痕迹带入当前回答
