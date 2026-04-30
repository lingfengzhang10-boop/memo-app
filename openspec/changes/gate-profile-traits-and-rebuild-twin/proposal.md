## 为什么

当前系统会把单条 transcript 里模型提取出的 `lifeFacts`、`lexicalHabits`、`twinNotes` 等画像增量直接 merge 进 `companion_profiles`，随后又被 `twin growth` 固化进 `twin_versions`。这让一次性的 ASR 脏补全、环境噪音、玩笑话或不认真表达，直接升级成了长期画像和分身当前真相。

现在必须补一层准入和清洗规则。否则后面无论继续调 prompt、topic scope 还是 retrieval，active twin version 都会不断把旧污染重新带回来。

## 变更内容

- 为长期画像引入 trait 准入门槛，区分原始提取、候选 trait 和可进入长期画像的 vetted trait。
- 提高 `companion_profiles` 的合并门槛：单条 transcript 的画像增量不得直接成为长期人格资产。
- 调整 `twin growth` 的输入边界：active twin version 只能消费经过过滤的画像 trait，而不是直接吞入 profile 全量字段。
- 新增一条 clean rebuild 路径：允许从 confirmed facts / events、clean semantic evidence 和过滤后的画像 trait 重新生成 active twin version。
- **BREAKING**：现有 `companion_profiles` 与 `twin_versions` 的脏数据不再被视为可靠来源，系统必须支持对当前 active version 做重建或替换。

## 功能 (Capabilities)

### 新增功能
- `profile-trait-governance`: 为画像 trait 引入候选、信任、频次和准入控制，避免单次脏输入直接进入长期画像。

### 修改功能
- `memory-companion`: 画像提取从“提取后直接 merge”调整为“提取候选 -> 过滤/累计 -> 再进入长期画像”。
- `twin`: 分身成长从“直接消费 companion profile 全量字段”调整为“只消费过滤后的 clean traits，并支持从 clean assets 重建 active version”。

## 影响

- 受影响表和数据：`companion_profiles`、`twin_profiles`、`twin_versions`，以及可能新增的 trait 统计/候选字段或附属表。
- 受影响服务和路由：`/api/companion/profile`、日常录音后的画像合并逻辑、`twin growth` 版本生成逻辑。
- 受影响页面：主页录音沉淀链路、分身页读取 active version 的逻辑、后续任何展示分身画像摘要的页面。
- 不改变的边界：
  - `facts / events` 先确认再入库的边界不变。
  - 一人一分身边界不变。
  - 原始证据层、正式资产层、分身当前真相层三层分离原则不变。
