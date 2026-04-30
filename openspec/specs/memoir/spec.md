# Capability: Memoir

## Goal
定义“回忆录”作为客观记忆编排层的基线行为，使其既可读、可编辑，又不破坏底层画像边界。

## Requirements

### Requirement: Memoir is generated from objective memory layers
回忆录必须基于已确认的客观记忆层生成，而不是直接基于模型自由编造。

#### Scenario: Memoir is opened
- Given 用户已沉淀部分 `memory_facts` 与 `memory_events`
- When 用户打开回忆录
- Then 系统应基于这些客观记忆整理内容
- And 时间轴内容应优先按时间顺序展示
- And 非事件型客观事实应进入补充章节或侧栏

### Requirement: Memoir is editable by the user
用户必须能够查看和修改回忆录中的条目内容。

#### Scenario: User edits memoir text
- Given 用户发现回忆录中的事实或叙述有误
- When 用户修改回忆录内容并保存
- Then 系统应将修改回写到客观记忆层

### Requirement: Memoir edits do not directly rewrite persona
回忆录编辑不应直接改写用户画像层。

#### Scenario: User fixes a story detail
- Given 用户只是在修正某段经历或事实
- When 系统保存回忆录编辑结果
- Then 系统不得直接更改 `companion_profiles` 中的情绪、个性或表达风格摘要

### Requirement: Memoir remains traceable
回忆录中的内容应能追溯到其来源记忆。

#### Scenario: User questions where a chapter came from
- Given 某段回忆录内容已展示给用户
- When 系统需要解释来源
- Then 该内容应可关联回相关的 facts、events 或 memory ids

