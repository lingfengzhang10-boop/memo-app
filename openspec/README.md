# 念及 OpenSpec 入口

## 1. 这个目录现在有什么

当前 `openspec/` 已经承载的是“项目基线”，不是某一次临时需求。

已建立的基线 capability：
- `memory-companion`
- `memoir`
- `twin`

对应文件：
- `openspec/specs/memory-companion/spec.md`
- `openspec/specs/memoir/spec.md`
- `openspec/specs/twin/spec.md`

项目级约束与上下文：
- `openspec/config.yaml`

## 2. 新窗口接力时应该先读什么

建议顺序：

1. `openspec/config.yaml`
2. `openspec/specs/memory-companion/spec.md`
3. `openspec/specs/memoir/spec.md`
4. `openspec/specs/twin/spec.md`
5. 根目录补充文档：
   - `PRD.md`
   - `PROGRESS.md`
   - `TASKS.md`
   - `DECISIONS.md`

这样可以先知道：
- 当前产品基线是什么
- 当前边界是什么
- 当前哪些能力已经实现
- 当前下一步建议是什么

## 3. 当前项目真实状态摘要

当前项目不是空白应用，而是已经跑通的 MVP：

- 登录、录音上传、服务端 ASR
- 即时文字回复
- `memory_facts` / `memory_events` 抽取
- 用户确认后再写入客观记忆
- 回忆录查看与编辑
- 12 题分身冷启动
- 初版分身卡生成
- 单用户单分身
- 分身对话
- 分身表达层
- 分身专属语音样本上传与语音合成尝试

当前主数据层：
- `memories`
- `companion_profiles`
- `memory_facts`
- `memory_events`
- `twin_profiles`
- `twin_versions`
- `twin_bootstrap_sessions`
- `twin_bootstrap_answers`
- Storage bucket `recordings`

## 4. 当前最重要的产品边界

- 语音优先，不先让用户填表。
- 客观记忆层和画像层分开。
- facts / events 先确认后入库。
- 回忆录是编排层，不直接改画像层。
- 每个用户只能有一个分身。
- 分身先冷启动，再随着日常对话成长。
- 对外授权给其他用户对话是后续能力，不是当前默认能力。

## 5. 后续开 change 时建议的切法

后续中等以上功能，建议在 `openspec/changes/` 下单独开 change。

当前最适合开 change 的方向：

1. `add-twin-sharing`
   - 分身授权给其他用户对话
   - 权限边界
   - 外部线索来源与待确认状态

2. `add-expression-sample-library`
   - 把分身表达层从“实时叠加”升级成长期样本库

3. `add-people-relationships`
   - 新增 `people`
   - 新增 `person_relationships`
   - 支撑“爸爸妈妈是谁、同事是谁、喜欢谁”

4. `add-memory-confidence-states`
   - 记忆分级：candidate / confirmed / stable

## 6. 新窗口建议起手提示词

如果以后在新窗口继续，建议直接这样开场：

```text
先读取 openspec/config.yaml、openspec/specs/memory-companion/spec.md、openspec/specs/memoir/spec.md、openspec/specs/twin/spec.md，再读取 PRD.md、PROGRESS.md、TASKS.md、DECISIONS.md，然后基于当前基线继续。
```

如果要做一个中等以上新功能，可以直接说：

```text
基于当前 openspec 基线，为 <功能名> 创建一个标准 change，输出 proposal、design、tasks。
```

## 7. 当前推荐

如果现在继续做功能，不建议直接散着改代码。

建议优先做成标准 change 的功能：
- 分身授权
- 外部人物线索并入
- 表达样本库
- 记忆分级

小改动或 bug 修复可以直接做，不必每次都开 change。
