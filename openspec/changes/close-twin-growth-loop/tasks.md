## 1. 成长素材与触发条件

- [x] 1.1 梳理当前 active version 之后可被分身吸收的 confirmed facts / events 与表达证据选择规则
- [x] 1.2 实现 twin growth selector，能够基于 active version 水位读取客观增量和代表性表达增量
- [x] 1.3 定义并接入保守的刷新阈值与重大事件触发条件，确保素材不足时跳过版本刷新

## 2. 分身版本刷新

- [x] 2.1 实现基于当前 active version 与增量素材生成 `memory_growth` snapshot 的共享组装逻辑
- [x] 2.2 写入新的 `twin_versions` 记录并更新 `twin_profiles.active_version_id`，让分身后续对话切到新版本
- [x] 2.3 保留 live expression 作为临时层，同时确保未确认线索不会直接进入新的 twin version

## 3. 失败兜底与验证

- [x] 3.1 为分身成长刷新增加软失败回退，保证 AI 汇总或写库失败时继续使用旧 active version
- [x] 3.2 验证用户确认新的事实或经历后，后续分身回复能够通过刷新后的 active version 体现变化
- [x] 3.3 验证仅有少量 recent transcript 或未确认线索时，不会强制生成新版本，也不会污染长期表达层
