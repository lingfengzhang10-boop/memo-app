# 念及 PRD

## 1. 产品目标
念及是一款以语音为主入口的个人记忆与数字分身产品。用户不是来填表，而是来讲述。系统先接住语音，再逐步整理成可确认、可追溯、可编辑的长期记忆，并在此基础上生成可对话的数字分身。

当前产品有两条主路径：
- 日常陪伴与记忆沉淀
- 快速生成分身的冷启动建模

## 2. 当前阶段
- 阶段：MVP 1.0
- 形态：移动端 Web 优先
- 主链路：录音 -> 服务端 ASR -> 即时回复 -> 线索提取 -> 用户确认 -> 写入结构化记忆
- 分身链路：12 题语音建模 -> 生成初版分身卡 -> 选择分身对话

## 3. 核心价值
### 3.1 降低表达门槛
用户通过按住录音自然讲述，不需要先整理成文。

### 3.2 先被回应，再被整理
系统先给即时陪伴式反馈，再异步做结构化整理。

### 3.3 客观线索先确认，再入库
`memory_facts` 和 `memory_events` 不会第一次抽取后直接写入长期记忆，而是先以气泡形式逐条给用户确认、关闭或语音纠正。

### 3.4 回忆录是编排层
回忆录基于客观事实与经历生成，用户可编辑，但不直接改画像层。

### 3.5 分身先生成，再成长
用户可以先用一轮 12 题语音访谈生成初版分身，后续日常对话继续补足记忆和表达。

## 4. 当前可用能力
### 4.1 登录与录音
- Supabase 邮箱 magic link 登录
- `recordings` private bucket 录音上传
- 登录用户路径规则：`{user.id}/{timestamp}.{ext}`

### 4.2 服务端 ASR 与即时回复
- Web 默认走服务端 ASR
- 当前 ASR 模型：`FunAudioLLM/SenseVoiceSmall`
- 当前分析模型：`Pro/zai-org/GLM-4.7`

### 4.3 长期记忆层
- `memories`
- `companion_profiles`
- `memory_facts`
- `memory_events`

### 4.4 线索确认机制
- facts / events 先进入待确认队列
- 用户可确认、关闭、语音纠正
- 一次录音中的多条线索逐条确认

### 4.5 回忆录
- 自动按时间和客观事实整理
- 用户可查看与编辑
- 回写 facts / events，不改画像层

### 4.6 快速生成分身
- 12 题语音建模
- 每题支持多段录音
- 每段独立转写、可编辑、可删除
- 用户手动确认这一题后进入下一题
- 12 题完成后生成初版分身卡

### 4.7 分身对话
- 每个用户当前只允许一个分身
- 分身主档：`twin_profiles`
- 分身版本快照：`twin_versions`
- 访谈过程：`twin_bootstrap_sessions`、`twin_bootstrap_answers`
- 已支持进入分身列表并与当前分身对话

### 4.8 分身表达层
- 冷启动 12 题会抽取表达快照
- 分身对话时会叠加最近日常 `memories.transcript` 与最新 `companion_profiles`
- 当前已开始把“记得什么”与“怎么说”分开建模

### 4.9 分身专属语音
- 用户可在分身对话页录一段样本音频
- 系统先转写，用户可编辑样本文字
- 确认后调用服务端上传参考音频生成专属 `voice uri`
- 分身回复时优先用这条专属音色合成语音，文字继续保留
- 当前实现依赖 SiliconFlow 语音能力，若账户未实名认证或接口拒绝，会明确报错

## 5. 数据分层
### 5.1 原始素材层
- `recordings`
- `memories`

作用：
- 保留原始音频和原始 transcript
- 为后续纠错和重算提供真相源

### 5.2 聚合画像层
- `companion_profiles`

作用：
- 记录风格、情绪标记、叙事习惯等聚合画像

### 5.3 非事件记忆层
- `memory_facts`

作用：
- 偏好、担忧、边界、规则、位置、状态等非时间轴信息

### 5.4 时间轴事件层
- `memory_events`

作用：
- 哪一年、哪个年龄、哪个阶段发生了什么

### 5.5 分身层
- `twin_profiles`
- `twin_versions`
- `twin_bootstrap_sessions`
- `twin_bootstrap_answers`

作用：
- 保存“可对话分身”的主档、版本、建模过程和答案快照

## 6. 当前数据库主表
### `memories`
- `id`
- `user_id`
- `audio_url`
- `audio_path`
- `audio_mime_type`
- `audio_size_bytes`
- `duration_ms`
- `transcript`
- `transcript_segments`
- `transcript_provider`
- `transcript_model`
- `transcript_status`
- `summary`
- `tags`
- `reply_status`
- `profile_status`
- `last_error`
- `created_at`
- `updated_at`

### `companion_profiles`
- `id`
- `user_id`
- `version`
- `sessions`
- `style_summary`
- `catchphrases`
- `lexical_habits`
- `emotional_markers`
- `storytelling_patterns`
- `relationship_mentions`
- `memory_themes`
- `life_facts`
- `pacing`
- `pauses`
- `twin_notes`
- `last_transcript`
- `source_memory_id`
- `created_at`
- `updated_at`

### `memory_facts`
- `id`
- `user_id`
- `canonical_key`
- `fact_type`
- `subject`
- `predicate`
- `object_text`
- `value_json`
- `valid_time_type`
- `start_at`
- `end_at`
- `confidence`
- `source_memory_ids`
- `supersedes_fact_id`
- `metadata`
- `created_at`
- `updated_at`

### `memory_events`
- `id`
- `user_id`
- `canonical_key`
- `title`
- `description`
- `time_type`
- `start_at`
- `end_at`
- `year`
- `age_at_event`
- `life_stage`
- `is_current`
- `location_name`
- `emotion`
- `importance`
- `confidence`
- `source_memory_ids`
- `metadata`
- `created_at`
- `updated_at`

### `twin_profiles`
- `id`
- `user_id`
- `name`
- `status`
- `origin_type`
- `persona_summary`
- `voice_style_summary`
- `response_style`
- `core_values`
- `boundary_rules`
- `seed_confidence`
- `memory_readiness_score`
- `style_readiness_score`
- `share_enabled`
- `active_version_id`
- `created_at`
- `updated_at`

### `twin_versions`
- `id`
- `twin_id`
- `version_no`
- `change_source`
- `persona_snapshot`
- `facts_snapshot`
- `events_snapshot`
- `people_snapshot`
- `prompt_snapshot`
- `created_at`

### `twin_bootstrap_sessions`
- `id`
- `user_id`
- `twin_id`
- `status`
- `stage_index`
- `question_index`
- `question_count`
- `answers_count`
- `summary`
- `created_at`
- `updated_at`
- `completed_at`

### `twin_bootstrap_answers`
- `id`
- `session_id`
- `twin_id`
- `user_id`
- `question_code`
- `question_text`
- `memory_id`
- `transcript`
- `extracted_facts`
- `extracted_events`
- `extracted_profile_delta`
- `created_at`
- `updated_at`

## 7. 当前边界
### 当前允许用户修改
- 当前题内已转写内容
- 回忆录中的客观事实与经历
- 线索确认前的单条事实/事件
- 分身样本音频对应的样本文字

### 当前不直接回写
- 情绪特征
- 性格特征
- 说话风格聚合画像
- 未确认的外部线索

## 8. 后续方向
- 分身对话继续吸收日常新增记忆
- 正式引入 `people` / `person_relationships`
- 记忆分级：candidate / confirmed / stable
- 更强的表达层样本库
- 面向他人的分身授权
- 更拟人的正式 TTS / voice persona
