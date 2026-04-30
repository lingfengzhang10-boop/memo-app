## ADDED Requirements

### 需求:Daily memory ingestion assigns admission state
日常记忆沉淀链路必须为输入内容分配回答准入状态，使系统能够区分可沉淀事实、候选线索、低置信输入和只留档内容。

#### 场景:Natural speech produces trustworthy candidate
- **当** 用户清晰表达一个带有时间、地点、人物或事件的真实经历
- **那么** 系统必须继续生成 fact 或 event 候选
- **那么** 系统必须保留原始 transcript 作为证据
- **那么** 系统必须将该候选标记为可进入确认流

#### 场景:Speech appears playful or unreliable
- **当** 用户输入明显像玩笑、测试、随口试探、环境误收音或 ASR 异常结果
- **那么** 系统必须允许保留原始记录
- **那么** 系统必须将其标记为低准入或只留档
- **那么** 系统禁止让该内容直接影响分身主动回答

#### 场景:User confirms a candidate clue
- **当** 用户确认某条候选 fact 或 event
- **那么** 系统必须将其提升为可供分身使用的 confirmed memory
- **那么** 该提升不得绕过现有确认边界

## MODIFIED Requirements

### 需求: Objective clues require user confirmation before persistence
从对话中抽出的客观线索不得在首次抽取后直接写入正式记忆层；系统还必须在确认前为候选线索保留准入状态，防止未确认或低置信内容影响分身回答。

#### 场景: Facts or events are extracted
- **当** 系统从某次讲话中抽出 `memory_facts` 或 `memory_events` 候选
- **那么** 系统必须先逐条展示给用户确认
- **那么** 用户应可以确认、关闭或语音纠正
- **那么** 只有确认后的线索才进入正式记忆层
- **那么** 确认前候选禁止作为分身主动回答的稳定事实

#### 场景: Candidate is dismissed or left unconfirmed
- **当** 用户关闭候选、跳过候选或候选长期未确认
- **那么** 系统可以保留原始 transcript 作为证据
- **那么** 系统必须阻止该候选以 confirmed memory 身份进入分身回答
