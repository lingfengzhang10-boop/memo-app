## 上下文

当前分身链路已经具备两部分能力：一是通过冷启动问答生成首个 `twin_version`，二是通过日常主链路持续沉淀 `memories`、`memory_facts`、`memory_events` 和 `companion_profiles`。但这两条链路之间仍然是松耦合的：分身聊天主要读取 `active_version_id` 对应的版本快照，再叠加最近 transcript 形成临时 live expression，并不会把后续日常沉淀正式写回分身版本。

这导致分身在产品体验上显得“能聊天，但不会持续长”。一方面，已确认的日常事实和经历没有稳定进入新的分身版本；另一方面，最近几句 transcript 又可能临时把表达层带偏。这个变更需要在不破坏现有确认边界、一人一分身边界和画像分层边界的前提下，把日常主链路和分身版本链路闭合起来。

## 目标 / 非目标

**目标：**

- 让分身能够从日常主链路中已经沉淀的内容持续成长，而不是停留在冷启动初版
- 让已确认的 facts / events 成为分身成长的正式客观素材
- 让代表性的日常表达逐步沉淀为长期表达证据，而不是只作为临时 recent transcript 叠加
- 让分身成长通过受控的版本刷新完成，保留旧版本并避免每轮聊天直接漂移
- 让成长失败时不阻塞用户继续聊天，始终保留当前可用分身版本

**非目标：**

- 不引入向量检索、人物地点图谱或叙事层
- 不重做冷启动问答、回忆录或当前记忆确认交互
- 不让未确认的客观线索直接改变 active twin version
- 不承诺分身与本人完全等同

## 决策

### 决策 1：把分身成长素材拆成“客观增量”和“表达增量”

- 选择：客观增量只来自新确认的 `memory_facts` / `memory_events`；表达增量来自 active version 创建之后的完成态 transcript 片段与最新 `companion_profiles` 表达聚合。
- 原因：事实和经历必须继续遵守确认边界；表达层需要吸收真实说话痕迹，但又不能把最近几句原样硬贴进长期版本。
- 备选方案：
  - 只用 recent transcripts 做成长：会把临时表达波动误当长期风格，放弃
  - 只用 `companion_profiles` 做成长：丢失真实语句样本，难以让分身越聊越像，放弃

### 决策 2：用当前 active version 作为增量水位，而不是先引入独立 staging 表

- 选择：每次准备成长时，以当前 active version 的创建时间和已吸收来源作为水位，只挑选其后的新确认事实、事件和可用表达证据参与本次刷新。
- 原因：现有模型已经有 `twin_versions`、`active_version_id` 和 `change_source = memory_growth`，可以先在不新增复杂 staging 表的前提下完成最小闭环。
- 备选方案：
  - 新增专门的 twin growth queue / staging 表：审计性更强，但对当前第一阶段过重，放弃
  - 每次全量重算整个分身：成本高且不利于控制漂移，放弃

### 决策 3：分身成长通过新版本刷新完成，禁止原地改写当前版本

- 选择：每次成长都创建新的 `twin_versions` 记录，`change_source` 标记为 `memory_growth`，再把 `twin_profiles.active_version_id` 切到新版本。
- 原因：分身成长必须可追溯、可回滚，也要为后续“分身成长史”保留版本基础。
- 备选方案：
  - 直接更新当前 active version 的 snapshot：会丢失成长轨迹，也难以排查漂移来源，放弃
  - 只更新 `twin_profiles` 聚合字段，不写新版本：会让聊天基线和分身档案脱节，放弃

### 决策 4：采用“阈值触发的阶段性刷新”，而不是每轮聊天都立即生长

- 选择：在日常确认记忆或更新 companion profile 后检查成长阈值；只有累积到足够的新客观素材或高代表性表达时，才触发一次 `memory_growth` 刷新。
- 原因：`念及` 的分身更适合稳定地阶段成长，而不是随着每条消息抖动。当前没有必要先暴露手动“立即更新分身”入口。
- 备选方案：
  - 每次聊天后直接刷新：成本高、漂移快、用户感知不稳定，放弃
  - 只靠用户手动触发：会让分身长期停留在旧状态，不符合“持续成长”的产品方向，放弃

### 决策 5：live expression 继续存在，但只作为“未晋升前的临时层”

- 选择：分身聊天仍可读取 live expression 以维持近期鲜活感，但 durable twin expression 只能来自经过筛选的代表性表达证据，并在版本刷新后写入长期 snapshot。
- 原因：这样能同时保留“最近像我”的感觉和“长期不乱漂”的稳定性。
- 备选方案：
  - 完全移除 live expression：分身会显得太钝，放弃
  - 让 live expression 直接覆盖长期表达：容易把偶然措辞写死到人格里，放弃

### 决策 6：成长刷新失败时软失败，永远回退到当前可用版本

- 选择：如果 AI 汇总、快照生成或写库失败，系统必须保留当前 active version，跳过本次刷新并允许后续重试。
- 原因：分身成长是增强能力，不应阻塞分身聊天，也不能因为一次失败让分身进入不可用状态。
- 备选方案：
  - 失败时中断聊天：用户感知最差，放弃
  - 写入半成品版本：会污染 active twin baseline，放弃

### 决策 7：第一版成长刷新放在共享 lib 逻辑中触发，而不是单独新增服务端路由

- 选择：在当前架构下，由已登录浏览器侧的共享 `lib` 逻辑读取 Supabase 受 RLS 保护的数据，完成 growth selector、snapshot 组装和版本写回。
- 原因：当前仓库只有浏览器侧 Supabase client，没有独立的服务端数据访问层。为了先补上最小闭环，不引入新的服务端鉴权与会话透传基础设施。
- 备选方案：
  - 新增专门的 `/api/twin/growth` 路由并在服务端读写 Supabase：方向更集中，但需要额外铺设服务端会话/权限能力，超出第一阶段范围，放弃
  - 把成长逻辑散落在首页和分身页内联实现：维护成本高，也不利于后续迁移到服务端，放弃

## 数据流 / 确认流 / 回写流

### 数据流

```text
日常语音 -> memories
          -> 提取 facts / events / profile
          -> confirmed facts/events 入正式层
          -> completed transcript + companion profile 形成表达候选
          -> twin growth selector 读取 active version 之后的增量
          -> 组装 growth snapshot
```

### 确认流

```text
客观线索候选
   ↓
用户确认 / 关闭 / 纠正
   ↓
只有 confirmed facts/events 才进入分身客观成长素材
   ↓
未确认线索不得直接写入 twin_versions
```

### 回写流

```text
满足成长阈值
   ↓
基于 active version + 增量素材生成新 snapshot
   ↓
写入 twin_versions(change_source = memory_growth)
   ↓
更新 twin_profiles.active_version_id
   ↓
后续分身对话读取新 active version
```

## 风险 / 权衡

- [成长刷新存在延迟，用户当天聊完未必立刻看到完整变化] -> 保留 live expression 作为临时层，等达到阈值后再写入正式版本
- [阈值过低导致分身漂移太快] -> 初期使用保守阈值，并要求客观层只读取 confirmed 数据
- [阈值过高导致分身显得不成长] -> 把“重大事件”作为单独高权重触发条件，避免必须等大量素材堆积
- [表达层吸收近期话术后可能过拟合] -> 只提炼短句、自然句和 profile 聚合结果，不直接全量复制 transcript
- [没有独立 staging 表会降低审计细度] -> 在新版本 snapshot 中保留本次吸收来源与时间边界，后续如有需要再升级为独立 staging 模型

## Migration Plan

- 保持现有已生成的 `twin_profiles` 和 `twin_versions` 不变，把当前 active version 视为成长起点
- 新增 `memory_growth` 刷新路径后，只对已经 seeded / active 的分身启用
- 首次上线时不回填历史全量成长；仅从启用后的新增日常沉淀开始形成后续版本
- 如果刷新路径出现异常，直接停用刷新入口并继续使用旧 active version，可无损回滚

## Open Questions

- “重大事件”触发刷新时，是否需要与普通日常表达使用不同阈值
- 后续是否需要向用户显式展示“分身已更新到第 N 版”
- 当客观素材充足但表达素材不足时，是否允许只做记忆层刷新、不更新表达层
