## 背景
当前系统在“结构化资产化”上已经有明确方向：

- `memories` 保存原始音频与 transcript。
- `memory_facts` / `memory_events` 保存确认后的正式资产。
- `twin_versions` / `twin_profiles` 保存分身当前真相与成长快照。

缺的不是存储位置，而是一层清晰的“原文长期记忆底座”。这层底座不应直接改变正式资产与分身真相，而应提供：

- 原文证据保留
- 原文切片与时间元数据
- 后续 embedding 与语义检索挂载位
- 人物 / 地点 / 时间过滤的基础关联

## 目标 / 非目标

**目标**
- 把长期语义记忆底座定义为现有结构化资产层之下的独立层。
- 明确这层如何与 `memory-companion`、`twin`、`memoir` 等上层能力协作。
- 设计为“可渐进接入”，不要求当前一次性全量回填所有历史 transcript。
- 保证后续接入语义层时，不会打破确认边界和 active truth。

**非目标**
- 本次不决定具体向量数据库选型。
- 本次不决定 embedding 模型供应商。
- 本次不要求立刻实现全量 semantic retrieval。
- 本次不把分身主链路切换为 vector-first。

## 设计决策

### 决策 1：采用三层真相模型
系统未来必须始终显式区分三层：

```text
L1 原文证据层
   transcript / raw chunk / source metadata / optional embeddings

L2 正式资产层
   confirmed facts / confirmed events / later people / places / narratives

L3 分身当前真相层
   twin active version / persona snapshot / active growth result
```

理由：
- L1 保证不丢原话与语境。
- L2 保证“什么被用户确认过”。
- L3 保证“分身当前按什么来回答”。

如果这三层混掉，后续一旦引入语义召回，就会把“曾经说过”误当成“当前成立”。

### 决策 2：语义层是增强层，不是替换层
未来分身回答时的读取顺序应为：

```text
先读 L3 active truth
再读 L2 confirmed assets
必要时再用 L1 semantic retrieval 补细节和原话证据
```

而不是：

```text
直接把 raw semantic retrieval 当成新的唯一真相
```

理由：
- 对用户产品来说，确认边界比召回能力更重要。
- 即使语义层故障，L2/L3 仍可保证分身有保守可用的回答路径。

### 决策 3：只做渐进式接入，不做一次性全量替换
迁移顺序定义为：

```text
阶段 A：只定义 substrate 边界与挂载位
阶段 B：只为高价值原文建立切片与索引
阶段 C：只在少数分身问题上启用语义增强
阶段 D：再扩展到更广泛的 mixed retrieval
```

高价值原文优先包括：
- 已确认 facts / events 的 source transcript 片段
- 高情绪密度片段
- 高频人物 / 地点相关片段
- 关键阶段、关键转折点片段

理由：
- 控制成本
- 控制回填复杂度
- 避免一次性大改回答主链路

### 决策 4：为未来的 temporal / relation-aware retrieval 预留元数据
即使本次不实现完整 graph retrieval，substrate 也应预留：
- `memory_id`
- `created_at`
- `event_time_range` 或等价时间信息
- `source_fact_ids` / `source_event_ids`
- `person hints`
- `place hints`
- `importance / confidence`

理由：
- 后续人物、地点、人生阶段检索不能只靠纯向量相似度。
- 这一步现在不预留，未来会引发大范围回填和迁移。

## 系统草图

```text
用户语音
  ↓
transcript
  ↓
同时进入两条线

A. 资产线
  facts / events / profile / twin growth
  ↓
  confirmed assets + active truth

B. 语义线
  raw transcript archive
  → chunking
  → semantic metadata
  → optional embeddings
  ↓
  retrieval substrate
```

运行时回答：

```text
user question
  ↓
L3 active twin version
  ↓
L2 confirmed assets
  ↓
L1 semantic evidence retrieval (optional / bounded)
  ↓
memory packet
  ↓
twin reply / memoir evidence / later map surfaces
```

## 与现有变更的关系

- `add-hybrid-memory-retrieval` 解决的是运行时检索编排。
- 本 change 解决的是检索编排之下的长期语义底座。
- `add-memory-governance` 负责确认、状态、可见性与版本治理。
- 本 change 必须遵守治理边界，不绕过确认流程。

因此它应被视为：

```text
semantic-memory-substrate
    ↓
hybrid-memory-retrieval
    ↓
twin / memoir / future map surfaces
```

## 风险与兜底

- 风险 1：语义层被误用为正式真相层
  - 兜底：在 spec 中明确 raw semantic layer 只能作为证据与增强层。

- 风险 2：过早全量 embedding，成本和复杂度失控
  - 兜底：要求渐进式接入，只先覆盖高价值原文。

- 风险 3：分身回答逻辑被向量召回强绑定，故障时整条链路退化
  - 兜底：规定 L3/L2 必须可单独工作，L1 只是可选增强。

- 风险 4：以后为了时间/人物/地点检索不得不大规模回填
  - 兜底：现在先把时间、人、地元数据挂载位定清楚。

## 实施顺序建议

1. 先把 substrate 边界、三层真相与挂载位写入 spec
2. 再实现 transcript chunk / metadata substrate
3. 再给高价值原文做有限索引
4. 最后才让分身检索链路开始消费这一层
