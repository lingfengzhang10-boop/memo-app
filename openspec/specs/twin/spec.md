# Capability: Twin

## Goal
定义念及当前“数字分身”能力的基线，包括冷启动建模、单分身约束、分身对话、表达层与专属语音。

## Requirements

### Requirement: One user has exactly one twin
每个用户只能拥有一个分身，后续只能持续丰富该分身，而不能重复创建多个平行分身。

#### Scenario: User starts bootstrap more than once
- Given 某个用户已经存在 `twin_profiles` 记录
- When 用户再次进入“快速生成分身”
- Then 系统应复用现有分身
- And 不应新建第二个分身主档

### Requirement: Bootstrap interview creates the seed twin
系统必须支持通过固定题集的语音建模来生成初版分身。

#### Scenario: User completes bootstrap interview
- Given 用户进入分身冷启动流程
- When 用户完成全部建模题目
- Then 系统应汇总本轮答案
- And 生成初版分身卡
- And 写入 `twin_profiles` 与 `twin_versions`

### Requirement: Bootstrap answers support segmented speech confirmation
分身建模中的每一题必须支持多段语音回答，并由用户确认最终文本后再进入下一题。

#### Scenario: User answers a question in multiple chunks
- Given 用户正在回答某一道建模题
- When 用户分多段进行录音
- Then 系统应逐段转写并展示文本
- And 用户应可编辑或删除某一段
- And 只有当所有段落完成转写后，“确认进入下一题”才可点击

### Requirement: Twin chat uses active version and twin memory context
分身对话必须基于当前激活的分身版本，并带上相应的人格、事实与经历上下文。

#### Scenario: User chats with seeded twin
- Given 用户已拥有一个已生成的分身
- When 用户进入分身对话页并发送消息
- Then 系统应读取 `active_version_id` 对应的版本快照
- And 应结合人格摘要、表达摘要、facts snapshot 与 events snapshot 生成回复

### Requirement: Twin expression is modeled separately from memory
分身必须区分“记住什么”与“怎么说话”。

#### Scenario: Twin responds with style
- Given 分身已具备基础记忆
- When 系统生成分身回复
- Then 系统应同时读取表达层信息
- And 不应仅靠事实列表做普通 AI 回答

### Requirement: Daily conversation can continue enriching the twin
分身在冷启动完成后，必须可以继承后续日常对话沉淀出来的表达和记忆。

#### Scenario: User continues normal conversation after bootstrap
- Given 用户已生成初版分身
- When 用户继续在主链路中日常讲话
- Then 后续真实表达应能逐步回流影响分身表达层
- And 后续已确认记忆应能作为分身后续成长的素材

### Requirement: Twin-specific voice clone is optional
分身应支持绑定专属语音参考样本，但该能力不是创建分身的前置条件。

#### Scenario: User records a twin voice sample
- Given 用户进入分身对话页
- When 用户录制并确认一段样本音频
- Then 系统应可上传样本并获得可用的 voice reference
- And 后续分身回复应优先尝试使用该专属音色进行语音合成
- And 无法合成时仍应保留文字回复

### Requirement: Shared twin is a future extension, not default behavior
分身未来可授权给其他用户对话，但当前基线不应默认等同“完全就是本人”。

#### Scenario: Product describes the twin
- Given 系统需要向用户解释分身能力
- When 系统展示产品文案或功能说明
- Then 应表述为“基于用户讲述持续成长的数字分身”
- And 不应承诺它与本人完全等同
