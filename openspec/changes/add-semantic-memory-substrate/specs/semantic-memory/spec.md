## ADDED Requirements

### Requirement: Semantic memory substrate preserves raw evidence without replacing confirmed truth
系统必须提供一层长期语义记忆底座，用于保存 transcript 原文证据、切片元数据、来源映射与后续语义索引挂载位。该层只能作为证据与增强层，不能直接替代 confirmed facts / events 或 active twin version。

#### Scenario: Raw transcript is kept as future semantic evidence
- **当** 新的 transcript 进入系统
- **那么** 系统必须允许该 transcript 进入长期原文证据层或其未来的切片挂载位
- **那么** 这一步不得自动把 transcript 直接提升为正式资产

#### Scenario: Semantic evidence conflicts with confirmed truth
- **当** 原文语义召回结果与当前 confirmed facts / events 或 active truth 不一致
- **那么** 系统必须以 confirmed assets 与 active truth 为准
- **那么** raw semantic evidence 只能作为补充证据，不得直接覆盖当前真相

### Requirement: Semantic substrate is prepared for temporal and relational filtering
长期语义记忆底座必须为未来的时间、人、地过滤与追溯预留元数据，而不是只支持无约束的相似度查询。

#### Scenario: Future retrieval needs time-aware filtering
- **当** 后续检索需要回答“那时候”“后来”“在杭州那几年”这类带时间或阶段的问题
- **那么** semantic substrate 必须具备最小必要的时间元数据挂载位

#### Scenario: Future retrieval needs person/place-aware filtering
- **当** 后续检索需要回答“她”“妈妈”“老家”“杭州”这类人物或地点相关问题
- **那么** semantic substrate 必须具备最小必要的人物 / 地点提示或来源映射挂载位
