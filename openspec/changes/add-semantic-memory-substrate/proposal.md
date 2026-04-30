## 为什么
当前系统已经具备原始语音转写、结构化 facts / events、用户确认、分身版本成长等主链路，但“原文长期记忆”仍然只停留在 `memories.transcript` 的存档层，尚未成为可语义召回、可按时间过滤、可为分身提供原话证据的运行时底座。这样会带来三个长期风险：

- 分身越来越依赖结构化摘要和版本快照，细节语境与原话纹理逐渐丢失。
- 未来如果要补向量检索、时间过滤、人物地点联想，会直接改到回答主链路，迁移风险高。
- 回忆录、关系图、人生地图后续想引用“原声证据”时，缺少一层清晰的 raw memory substrate。

这个 change 的目的不是立刻把系统改成完整的 MemPalace 式本地记忆引擎，而是先把“长期语义记忆底座”定义成现有结构化资产层下面的一层，避免以后为了补检索能力而推翻现有设计。

## 变更内容

- 新增一层长期语义记忆底座，用于保存原始 transcript 的可检索切片、时间元数据、来源映射和后续 embedding 入口。
- 明确三层真相边界：原文证据层、正式资产层、分身当前真相层；语义层只能补充证据与联想，不能直接替代 confirmed facts / events 或 active twin version。
- 规定未来的分身读取策略为“snapshot / confirmed assets 为基础，semantic retrieval 为增强”，避免后续接入语义层时改成完全依赖运行时向量召回。
- 为未来的渐进式接入定义迁移顺序：先高价值原文、后有限检索、再扩大覆盖，而不是一次性全量回填所有历史 transcript。

## 功能 (Capabilities)

### 新增功能
- `semantic-memory`: 提供原文切片、时间元数据、来源映射、embedding 挂载位与语义检索底座的能力定义。

### 修改功能
- `memory-companion`: 记忆主链路除结构化提取外，必须保留原文长期证据层，并允许后续对高价值原文进行语义索引。
- `twin`: 分身后续必须支持“稳定层 + 语义增强层”的双层读取策略，而不是只读 snapshot 或未来直接被 raw retrieval 替代。

## 影响

- 受影响的数据层：`memories`、未来可能新增的 transcript chunk / semantic index 相关表，以及现有 `memory_facts`、`memory_events`、`twin_versions` 的来源关系。
- 受影响的后端逻辑：记忆写入链路、分身检索链路、回忆录与后续地图/关系图的证据引用方式。
- 受影响的产品边界：confirmed facts / events 仍然是正式资产；raw semantic layer 是证据与联想层，不改变确认边界和 active truth 定义。
