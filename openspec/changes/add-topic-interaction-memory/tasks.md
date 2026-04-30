## 1. 互动记忆底座

- [x] 1.1 新增轻量 `twin_topic_interactions` 数据模型，并包含 twin、asker、topic、最近讨论时间、最近回答角度等字段
- [x] 1.2 实现 topic key 与 asker key 的运行时生成规则，并保证无记录时可安全降级
- [x] 1.3 为互动记忆层补充 Supabase RLS、索引和基础读写封装

## 2. 回答递进路由

- [x] 2.1 在 `/api/twin/chat` 中引入 same topic / same asker 命中逻辑，能识别首次回答、追问、同日重问和较久后重问
- [x] 2.2 为分身回答增加 `answerProgressionMode`，并让同会话追问优先走补充、换角度或诚实收束
- [x] 2.3 在没有新角度时输出更像人的收束语气，而不是重复上一轮核心内容

## 3. 回写与隔离

- [x] 3.1 在分身成功回复后回写 topic interaction，记录最近一次回答摘要、角度和模式
- [x] 3.2 验证 same asker 与 different asker 的互动记忆隔离，不让对话痕迹跨 asker 泄漏
- [x] 3.3 验证互动记忆不会反向污染 `twin_versions`、confirmed facts 或 confirmed events

## 4. 验证与文档

- [x] 4.1 增加围绕“刚聊过 / 同日再问 / 几天后再问 / different asker 再问”的可重复验证用例
- [x] 4.2 为 `/api/twin/chat` debug 输出补充 topic key、asker scope、answer progression mode 和 recency band
- [x] 4.3 更新 QA 指南，加入“避免机械复述、保留自然模糊感”的验证步骤
