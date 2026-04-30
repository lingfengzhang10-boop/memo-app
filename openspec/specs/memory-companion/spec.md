# Capability: Memory Companion

## Goal
定义念及当前“日常陪伴与记忆沉淀”的基线能力，确保后续变更都建立在同一条语音主链路和同一组记忆边界上。

## Requirements

### Requirement: Speech-first daily conversation
系统必须以语音讲述作为默认入口，而不是先要求用户填写结构化表单。

#### Scenario: User speaks naturally
- Given 用户已打开产品主页面
- When 用户按住录音并自然讲述
- Then 系统应接住该段语音并进入上传与转写流程
- And 用户不需要先手动把内容整理成文字

### Requirement: Server-side ASR and immediate textual reply
系统必须先完成服务端转写，并在此基础上给出即时文字回复。

#### Scenario: Audio is processed
- Given 用户成功上传一段录音
- When 服务端完成 ASR
- Then 系统应生成 transcript
- And 系统应返回一段即时陪伴式文字回复
- And transcript 与回复都应可追溯到原始 memory

### Requirement: Objective clues require user confirmation before persistence
从对话中抽出的客观线索不得在首次抽取后直接写入正式记忆层。

#### Scenario: Facts or events are extracted
- Given 系统从某次讲话中抽出 `memory_facts` 或 `memory_events` 候选
- When 候选线索准备持久化
- Then 系统应先逐条展示给用户确认
- And 用户应可以确认、关闭或语音纠正
- And 只有确认后的线索才进入正式记忆层

### Requirement: Objective memory and persona profile remain separate
系统必须将客观记忆层与画像层分开，避免事实修正污染人格画像。

#### Scenario: User edits objective information
- Given 用户对某条客观事实或经历提出修正
- When 系统回写数据库
- Then 系统只应更新 facts / events 等客观层
- And 不应直接改写 `companion_profiles` 中的个性、情绪或表达聚合结果

### Requirement: Structured memory model
系统必须至少支持两类长期记忆：非事件记忆与时间轴事件。

#### Scenario: Preference or fear is captured
- Given 用户表达偏好、担忧、边界、状态、位置等非事件信息
- When 系统结构化存储
- Then 该信息应进入 `memory_facts`

#### Scenario: Life event is captured
- Given 用户表达带有时间、年龄、阶段或经历转折的内容
- When 系统结构化存储
- Then 该信息应进入 `memory_events`

### Requirement: Raw material remains preserved
系统必须始终保留原始录音与原始转写，作为后续纠错和重算的真相源。

#### Scenario: Memory is later questioned
- Given 某条结构化记忆被怀疑有误
- When 系统需要复核
- Then 应能回溯到对应的原始录音与 transcript

