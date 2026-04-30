## MODIFIED Requirements

### Requirement: Daily memory ingestion preserves both structured assets and raw evidence
日常记忆主链路在继续抽取并确认结构化 assets 的同时，必须保留可作为长期语义证据的原文层。原文层的存在不改变“确认后入库”的正式资产边界。

#### Scenario: Daily transcript produces candidate facts and raw evidence
- **当** 一段新的日常 transcript 被转写并进入提取流程
- **那么** 系统必须继续允许从中抽取 fact / event 候选
- **那么** 系统也必须保留这段 transcript 作为未来 semantic substrate 的原文证据来源
- **那么** transcript 被保留并不意味着其中内容已自动成为 confirmed asset

#### Scenario: User confirms objective clues
- **当** 用户确认 fact 或 event 候选
- **那么** 被确认的结构化内容必须继续进入正式资产层
- **那么** 与之关联的原文证据可以被标记为高价值原文，供后续语义索引优先使用

#### Scenario: User does not confirm a clue
- **当** transcript 中存在未确认候选
- **那么** 原文证据层仍可保留对应原话
- **那么** 系统不得因为保留了原文证据就把未确认候选视为正式资产
