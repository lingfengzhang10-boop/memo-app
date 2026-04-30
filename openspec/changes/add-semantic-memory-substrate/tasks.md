## 1. 底层边界

- [x] 1.1 定义原文证据层、正式资产层、分身当前真相层三层边界，并明确每层的读写责任
- [x] 1.2 定义 semantic substrate 与现有 `memories`、`memory_facts`、`memory_events`、`twin_versions` 的关系
- [x] 1.3 定义语义层只能作为增强层、不能直接替代 confirmed assets 与 active truth 的运行时约束

## 2. 数据底座

- [x] 2.1 设计 transcript chunk / metadata / source mapping 的数据模型与挂载位
- [x] 2.2 为时间、人、地、来源追溯预留最小必要元数据
- [x] 2.3 设计“高价值原文优先”的渐进索引策略，避免一开始全量回填

## 3. 运行时接入策略

- [x] 3.1 定义分身读取顺序：L3 active truth -> L2 confirmed assets -> L1 semantic evidence
- [x] 3.2 定义回忆录、后续地图和关系图如何消费 semantic evidence 而不混淆正式资产
- [x] 3.3 定义 semantic layer 故障时的降级行为，确保分身和记忆主链继续可用

## 4. 迁移与成本控制

- [x] 4.1 定义阶段 A/B/C/D 的渐进接入路径，而不是一次性大改
- [x] 4.2 定义优先索引的高价值原文范围与暂不覆盖的内容
- [x] 4.3 输出成本关注点：embedding、向量存储、检索编排、工程复杂度，作为实施前评估清单
