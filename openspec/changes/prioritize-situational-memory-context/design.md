## 上下文

当前分身回答链路已经具备三层输入：

- `twin_versions` 中的 active truth
- confirmed `memory_facts` / `memory_events`
- semantic substrate 中的 raw evidence

但运行时的优先级仍偏向“全局标签优先”。当用户问题包含明确的时间、地点、人物或阶段锚点时，系统没有先把问题收窄到局部语境，再从该语境里组织答案，而是直接让全局 fear fact 参与回答。结果是诸如“去杭州后怕什么”这类问题，会被解释成“这个人全局最怕什么”。

这次设计的约束有三条：

1. 不能破坏“confirmed truth 比 raw evidence 更可信”的边界。
2. 不能让未确认语义直接进入 `active twin truth`。
3. 不能把这次调整做成一次性推翻现有事实层和 semantic substrate 的重构。

利益相关者包括：

- 用户：希望分身能理解“某段时期里的担心”，而不是背诵全局人格标签。
- 记忆系统：需要维持 confirmed truth 的稳定性。
- 后续混合检索、叙事层和治理层：需要一个可扩展的回答编排路径。

## 目标 / 非目标

**目标：**

- 让分身在回答带语境锚点的问题时，优先在该语境范围内检索和作答。
- 让“最难 / 压力 / 担心 / 不稳定”等表达能够以保守方式进入局部压力语义，而不只是客观事件。
- 明确全局 fear fact 的 fallback 时机，避免其压过局部上下文。
- 为运行时输出增加可解释来源，便于调试“为什么答成这样”。

**非目标：**

- 不在本次变更中完成完整的多路混合检索系统。
- 不在本次变更中引入完整 narrative layer。
- 不改变 `facts / events` 需要用户确认后才能成为正式资产的边界。
- 不新增前台地图、关系图或新的回忆录页面形态。

## 决策

### 决策 1：回答路径改为“语境收窄 -> 局部解释 -> 全局 fallback”

运行时先解析用户问题中的四类锚点：

- 时间：如“那时候”“后来”“2024 年”
- 地点：如“去杭州后”“在老家时”
- 人物：如“和妈妈那段时间”
- 阶段：如“大学时”“刚工作时”

如果命中任一锚点，系统必须先生成一个 situational query，对 confirmed events、confirmed facts 和 semantic evidence 做局部收窄，再组织答案。只有在局部结果不足以回答“怕什么 / 最难什么 / 担心什么”时，才允许全局 fear fact 参与 fallback。

替代方案：

- 保持现有“全局 confirmed fact 优先”路径，只调 prompt 文案。

不采用该方案，因为 prompt 微调无法稳定解决“局部语境 vs 全局长期事实”的排序问题。

### 决策 2：为局部压力引入中间语义，而不是强行全部映射为 fear

“收入不稳定”“最难的是”“压力很大”不总是等价于强 fear。为了避免过拟合，本次设计新增保守的 situational semantics：

- `worry_about`
- `stressor`
- `situational_anxiety`

这些语义只作为候选资产或 confirmed facts 的扩展类型存在，服务于局部回答，不直接等价于长期 fear。

替代方案：

- 把所有这类表达都映射到 `fear`。

不采用该方案，因为它会污染长期人格事实，扩大误答面。

### 决策 3：局部回答与全局 fallback 都要显式留下解释信息

运行时 memory packet 需要新增回答路由说明，例如：

- `answerMode: situational`
- `situationAnchors: ["place:杭州", "time:2024"]`
- `fallbackReason: insufficient_local_fear_signal`

这样既便于日志观察，也便于后续把回答错误回溯到“锚点解析失败”“局部证据不足”还是“fallback 过早”。

替代方案：

- 继续只把结果交给模型，不保留中间路由说明。

不采用该方案，因为这会让类似本次问题继续只能靠猜。

### 决策 4：确认流仍留在正式资产层，语境路由只消费，不越权写入

这次变更会扩展主页提取链路，使其能识别局部压力候选，但它们仍然必须遵守现有确认流：

- 抽取候选
- 用户确认
- 进入正式资产层
- 后续供分身稳定消费

semantic evidence 只作为补充，不得直接把未确认的“担心/压力”写成 active twin truth。

## 风险 / 权衡

- [风险] 局部语境收窄过强，可能漏掉用户其实在问长期人格事实。
  → 缓解措施：仅在问题中有明确锚点时启用 situational mode；无锚点时保留现有全局路径。

- [风险] 新增 `worry_about / stressor` 语义会增加提取分类复杂度。
  → 缓解措施：第一阶段只支持少量高价值触发表达，不追求全覆盖。

- [风险] fallback 逻辑仍可能被 prompt 漂移影响。
  → 缓解措施：把局部/全局路由先在服务端完成，再将已组织好的 memory packet 交给模型。

- [风险] 用户会觉得系统在“推断我的情绪”。
  → 缓解措施：局部压力语义仍走确认流，且未确认内容不进入长期 truth。

## Migration Plan

1. 先在提取层补充局部压力候选与语义标注，不改现有 facts/events 表的主路径。
2. 在分身聊天链路中新增语境锚点解析与 situational routing。
3. 为 memory packet 增加路由解释字段与 fallback 理由。
4. 保留现有全局路径作为回滚开关；如果局部回答质量下降，可临时关闭 situational mode。

## Open Questions

- `worry_about / stressor / situational_anxiety` 最终是作为 `memory_facts.fact_type` 的扩展，还是独立候选结构存在？
- 地点和时间锚点解析是否需要显式依赖未来的 people/place graph，还是先基于现有 hints 和 events 即可？
- 回答解释信息是仅保留在服务端日志，还是未来展示到调试 UI？
