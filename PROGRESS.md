# 念及项目进度

## 当前状态
- 阶段：MVP 1.0
- 入口：移动端 Web 单页
- 当前主链路：
  - 录音
  - 上传
  - 服务端 ASR
  - 即时回复
  - 客观线索提取
  - 用户确认后写入长期记忆
  - 快速生成分身
  - 分身对话
  - 分身专属语音样本录制与语音合成

## 已跑通能力
- Supabase magic link 登录
- `recordings` private bucket 上传
- `memories` 写入
- 服务端 ASR
- 即时文字回复
- `companion_profiles` 更新
- `memory_facts` 抽取、确认、写入
- `memory_events` 抽取、确认、写入
- 回忆录查看与编辑
- 分身冷启动 12 题语音建模
- 分身 seed 卡生成
- 分身列表与分身对话
- 分身表达层读取：
  - 冷启动表达快照
  - 最近日常 transcript
  - 最新 companion profile
- 分身专属语音样本：
  - 录样本
  - 自动转写
  - 用户编辑样本文字
  - 上传参考音频生成 `voice uri`
  - 分身回复时尝试自动播报

## 最近完成
### 1. 一人一个分身
- 代码层已经锁成“一人一个分身”
- bootstrap 不再创建第二个分身，只会复用并继续丰富
- schema 里已补唯一索引方案，等下次同步到 Supabase 一并落库

### 2. 分身表达层增强
- 冷启动 12 题会生成 `expression snapshot`
- 分身对话时叠加最近日常 transcript 的表达痕迹
- 不再只靠 seed prompt 做角色扮演

### 3. 分身专属语音
- 新增参考音频上传接口
- 新增分身语音合成接口
- 分身对话页可录制 8-10 秒样本并编辑转写
- 当前把 clone 信息写入 `twin_versions.persona_snapshot.voiceClone`

## 当前数据库结构
- `memories`
- `companion_profiles`
- `memory_facts`
- `memory_events`
- `twin_profiles`
- `twin_versions`
- `twin_bootstrap_sessions`
- `twin_bootstrap_answers`
- `recordings` bucket

遗留表：
- `ai_scripts`
  - 当前代码未引用
  - 不是主链路的一部分

## 当前边界
- 用户确认与编辑只影响客观记忆层
- 分身当前可与本人对话
- 对外授权尚未正式接入
- 分身语音克隆当前依赖第三方语音服务能力和账户权限

## 已知问题
- ASR 在方言、口语、省略句、专有名词下仍会误识别
- Web 上录音和自动播放稳定性不如原生 App
- 分身虽然开始有表达层，但离“像本人说话”还有距离
- 日常高代表性表达还没有正式沉淀成长期表达样本库
- `twin_profiles.user_id` 的唯一索引还未手动同步到 Supabase

## 下一步
- 把分身对话后的新记忆继续回流到 active version
- 新增表达层长期样本库
- 引入 `people` / `person_relationships`
- 做记忆分级：candidate / confirmed / stable
- 评估 timestamps ASR
- 设计分身授权与外部线索待确认机制
