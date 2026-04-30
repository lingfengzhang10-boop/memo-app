## 上下文

当前系统的长期画像链路是：

```text
transcript
  -> /api/companion/profile 提取 profileDelta
  -> mergeCompanionProfile()
  -> companion_profiles
  -> twinGrowth buildPromptSnapshot()/personaSnapshot
  -> twin_versions.active truth
```

这条链路的问题不是“提取不够聪明”，而是“准入太松”：

- 单条 transcript 的提取结果会直接 merge 成长期画像。
- `uniqueMerge` 只去重，不看来源信任、重复次数、是否被后续证伪。
- `twinGrowth` 会直接消费 `lifeFacts`、`lexicalHabits`、`twinNotes`、`phrasebook` 等 profile 全量字段。
- 一旦 profile 被一次 ASR 脏补全、环境音或玩笑话污染，污染会通过 growth 持续写进新版本。

相关利益方：

- 用户：要求分身像人，但不能把偶发噪音写成长期人格。
- 产品：要保留沉浸感，不能靠频繁的前台确认来兜底。
- 工程：需要一种可回放、可重建、可回滚的清洗路径，而不是持续在 prompt 层打补丁。

关键约束：

- `facts / events` 的“先确认再入库”边界不能被破坏。
- 三层真相边界不能被破坏：原始证据层、正式资产层、分身当前真相层。
- 这次不能把范围扩成新的 retrieval 改造或新的前台确认流程。

## 目标 / 非目标

**目标：**
- 让 profile trait 进入长期画像前必须经过准入、累计和信任判断。
- 将“提取结果”“候选 trait”“长期画像 trait”分层，而不是一步到位 merge。
- 让 `twinGrowth` 只消费经过过滤的 clean traits。
- 提供可执行的 twin rebuild 路径，用 clean assets 重建当前 active version。
- 为旧污染数据提供迁移和回滚路径。

**非目标：**
- 不修改 `memory_facts` / `memory_events` 的确认机制。
- 不把 raw transcript 直接提升成长期画像。
- 不新增用户手动确认画像 trait 的前台流程。
- 不在这次变更里引入新的向量库或新的 retrieval 架构。

## 决策

### 决策 1：将 profile 提取链拆成“候选层”和“vetted 层”

新增中间层，而不是继续把 `profileDelta` 直接 merge 到 `companion_profiles`。

建议的数据模型：

```text
companion_profile_traits
  id
  user_id
  trait_type        // catchphrase, lexical_habit, life_fact, memory_theme, twin_note_hint ...
  normalized_key
  display_text
  source_memory_ids
  support_count
  trust_score
  last_seen_at
  first_seen_at
  status            // candidate | vetted | rejected | stale
  metadata
```

写入流：

```text
profile extraction
  -> candidate traits
  -> trait normalization
  -> support_count / trust_score accumulation
  -> only vetted traits are materialized into companion_profiles
```

理由：
- `companion_profiles` 应该是压缩后的长期画像，不应该兼任原始提取池。
- trait 级别的 support / trust / recency 是 profile gating 的最小单元。

替代方案：
- 继续只用 `companion_profiles` 一个表，加更多数组字段。
  - 不采用，因为无法表达 support_count、来源和拒绝状态。
- 直接把所有 profile delta 存进 `semantic_memory_chunks.metadata`。
  - 不采用，因为画像 trait 需要独立生命周期，不应埋进证据层。

### 决策 2：长期画像只吃 vetted traits，不吃单条 delta

`companion_profiles` 从“直接 merge 结果”改成“vetted trait 的汇总投影”。

也就是：

```text
companion_profile_traits (source of truth for profile traits)
  -> buildCompanionProfileProjection()
  -> companion_profiles
```

理由：
- 这样 `companion_profiles` 可以随时重建，不再是不可逆状态。
- 一条坏 transcript 最多污染 candidate layer，不会直接污染长期画像。

替代方案：
- 仍然保留直接 merge，只在 merge 前加几个 heuristics。
  - 不采用，因为这会让 `companion_profiles` 继续承担不可回溯状态。

### 决策 3：twin growth 只消费 clean projection

`twinGrowth` 不再直接信任 `companion_profiles` 里所有可见字段，而是只消费经过筛选的 clean projection：

- vetted `lifeFacts`
- vetted `lexicalHabits`
- vetted `memoryThemes`
- vetted `twinNotes` 摘要
- clean expression traits

并且为每类字段增加上限和最低门槛，例如：

- `lifeFacts`: 必须有至少 2 次支持，且来自 `stable` 或 `guarded` 以上的 transcript
- `lexicalHabits`: 必须重复出现，且不属于噪音词表
- `phrasebook`: 必须来自多次表达证据，不能是单次噪声

理由：
- growth 是放大器，输入不 clean，版本就不会 clean。

替代方案：
- 保持 growth 不变，只在 prompt 层屏蔽脏词。
  - 不采用，因为污染数据仍在版本里，会不断以别的方式漏出。

### 决策 4：active twin version 支持从 clean assets 重建

新增一条 rebuild 路径：

```text
confirmed facts/events
+ vetted profile traits
+ clean semantic evidence
  -> rebuild persona snapshot
  -> rebuild prompt snapshot
  -> create sanitized twin version
  -> repoint active_version_id
```

这里的 rebuild 是显式行为，不混在普通 growth 里。

理由：
- 当前已有污染版本，必须有办法清洗历史，而不是等后续新版本慢慢覆盖。

替代方案：
- 只做未来 gating，不清理现有版本。
  - 不采用，因为现有污染会继续影响当前体验。

### 决策 5：输入信任标签继续下沉，但不让用户感知

这次不会增加前台确认步骤，但会继续使用输入信任信息：

- `stable`
- `guarded`
- `risky`
- 后续可扩展 `ambient` / `playful` / `quoted`

这些标签影响：
- candidate trait 是否累计
- trust_score 怎么算
- twin rebuild 是否采纳某段 evidence

理由：
- 用户不需要知道系统在防噪，但系统必须知道。

## 风险 / 权衡

- [风险] 新增 trait 表后，profile 逻辑从单表变多表，工程复杂度上升。  
  -> 缓解措施：把 `companion_profiles` 定义为 projection，所有复杂性集中在 trait service，不分散到页面层。

- [风险] 准入门槛太高会让分身显得“长得太慢”。  
  -> 缓解措施：只对长期 trait 提高门槛，不影响即时聊天；growth 继续可读 facts/events 和 clean semantic evidence。

- [风险] clean rebuild 可能让用户感觉“分身突然变了”。  
  -> 缓解措施：rebuild 生成新版本，不覆盖旧版本；可回滚 `active_version_id`。

- [风险] 旧污染数据如何识别会有灰区。  
  -> 缓解措施：先针对明确脏模式和低支持 trait 清理，再保守重建；不要试图一次自动判断所有人格信息真假。

## Migration Plan

1. 先新增 trait 存储和 gating 逻辑，但不立刻切换 growth 读取源。
2. 回填近期 profile delta 为 candidate traits，建立 support/trust 初始值。
3. 构建 `companion_profiles` clean projection，并对比当前画像差异。
4. 切换 `twinGrowth` 到 clean projection 输入。
5. 为当前用户生成 sanitized twin version，并将 `active_version_id` 切过去。
6. 保留旧版本可回滚；若新版本异常，直接切回旧 `active_version_id`。

## Open Questions

- `companion_profile_traits` 是否单独建表，还是先挂在 `companion_profiles.metadata` 做过渡？我倾向单表，因为后续一定需要支持次数和状态。
- `twinNotes` 该不该继续作为自由文本长期保留，还是改成更结构化的 note traits？当前更稳的是先把它视为低优先级候选，只允许 clean summary 进入 projection。
- 旧数据清洗是否需要一次离线审计脚本，列出明显噪音 trait 候选供人工确认？如果历史污染已经很多，这一步会很值。
