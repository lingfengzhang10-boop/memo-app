## 1. Trait 准入底座

- [x] 1.1 设计并落库 `companion_profile_traits`（或等价存储）字段，至少支持 trait 类型、normalized key、来源 memory、support_count、trust_score、status、last_seen_at
- [x] 1.2 将 `/api/companion/profile` 的提取结果改为候选 trait 写入，而不是直接 merge 到 `companion_profiles`
- [x] 1.3 为候选 trait 实现 normalization、去重和基础信任分数计算
- [x] 1.4 接入输入信任等级，让 `stable / guarded / risky` 对 trait 累计和升级门槛生效

## 2. 长期画像 clean projection

- [x] 2.1 实现从 vetted traits 生成 `companion_profiles` projection 的服务函数
- [x] 2.2 让 `companion_profiles` 的 `lifeFacts`、`lexicalHabits`、`memoryThemes`、`twinNotes` 只来自 clean projection
- [x] 2.3 为明显噪音或低支持 trait 增加 rejected / stale 处理，确保它们不再进入长期画像
- [x] 2.4 补一组可验证用例：单条脏 transcript 不得直接污染长期画像，多次稳定出现的 trait 才能进入 projection

## 3. Twin growth 输入过滤

- [x] 3.1 修改 `twinGrowth`，只消费 clean projection 和正式资产，不再直接吃 profile 全量字段
- [x] 3.2 为 `prompt_snapshot` / `persona_snapshot` 构建增加过滤规则，排除低信任词条、噪音 phrasebook 和单次 lifeFacts
- [x] 3.3 验证：新 growth 生成的 twin version 不再包含明显脏词条（如 ASR 噪音、重复语气词、玩笑性饮食偏好）

## 4. Clean rebuild 与迁移

- [x] 4.1 实现基于 confirmed facts / events、clean semantic evidence、vetted traits 的 sanitized twin rebuild 流程
- [x] 4.2 为当前 active twin version 生成可回滚的新 clean 版本，并支持切换 `active_version_id`
- [x] 4.3 提供旧污染版本的差异检查和回滚步骤，确保 rebuild 失败时可恢复
- [x] 4.4 补充 QA 和运维文档，说明如何识别污染画像、如何触发 rebuild、如何验证 clean version 生效
