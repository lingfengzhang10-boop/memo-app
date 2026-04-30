## 1. 策略层基础

- [x] 1.1 新建记忆使用策略模块，定义 `MemoryUsePolicy`、`MemoryAdmissionState`、`AnswerProgressionMode` 和 blocked reason 类型。
- [x] 1.2 实现 topic scope 构造逻辑，复用现有时间、地点、人物、阶段和 situational anchors。
- [x] 1.3 实现记忆候选归一化，将 facts、events、semantic chunks 和 topic interactions 转成统一候选结构。
- [x] 1.4 实现记忆包裁剪，按 topic scope、准入状态、已讲过角度和当前问题意图筛选 allowed memory items。

## 2. 分身聊天接入

- [x] 2.1 在 `/api/twin/chat` 的召回后、prompt 构建前接入 `MemoryUsePolicy`。
- [x] 2.2 将 prompt context 改为接收 allowed memory packet 和自然语言推进提示，禁止直接填入未经裁剪的召回集合。
- [x] 2.3 为“重复同一问题”“还有别的吗”“几小时/几天后重问”生成对应 `answerProgressionMode`。
- [x] 2.4 增加未确认事件防幻觉约束，确保当前 memory packet 中不存在的事件只能不确定表达，不能编造。
- [x] 2.5 保留策略层 debug 输出，记录 allowed / blocked 记忆与原因，但不把内部字段原样暴露给用户回复。

## 3. 记忆准入与沉淀

- [x] 3.1 为日常记忆提取结果补充准入状态，区分 raw、candidate、confirmed、stable、archived。
- [x] 3.2 增加低置信输入判断，覆盖玩笑、测试、误收音、ASR 异常和上下文不完整输入。
- [x] 3.3 确保未确认或低准入候选不会作为分身主动回答的稳定事实进入策略层 allowed packet。
- [x] 3.4 保持现有用户确认流不被绕过，确认后的 facts/events 才能提升为 confirmed memory。

## 4. 程序性记忆与表达规则

- [x] 4.1 建立首版程序性规则集合，覆盖不原样重复、不跨主题补充、不编造、无新增细节时自然收束。
- [x] 4.2 将程序性规则翻译为短自然语言提示，而不是把完整规则或系统术语直接喂给模型。
- [x] 4.3 增加回滚开关或保守 fallback，策略层异常时可回到现有 situational routing 路径。

## 5. QA 与验证

- [x] 5.1 增加固定文本 QA 用例：杭州首问、立即重复、追问“还有别的吗”、妈妈局部追问、朋友聚会否定式试探、辣条跨主题试探。
- [x] 5.2 验证重复提问不会原样复述上一轮主句。
- [x] 5.3 验证“还有别的吗”不会抓取当前 topic 外的记忆。
- [x] 5.4 验证不存在的朋友聚会、辣条等事件不会被编造。
- [x] 5.5 运行类型检查和相关测试，记录验证方式与剩余风险。
