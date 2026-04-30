## 为什么

当前分身的底层记忆和路由已经比早期稳定很多，但上层回答越来越像“执行规则”，而不是像一个人在继续说话。和豆包这类强模型相比，短轮对话里的人味、过渡和自然补充明显偏硬，说明我们现在的 prompt 控制和上下文打包方式已经开始过度约束模型。

现在需要调整，是因为再继续沿着“加更多规则”走，系统会越来越稳，但也会越来越不像人。这个问题已经直接影响分身的核心体感，优先级高于继续扩展更多新记忆能力。

## 变更内容

- 收缩分身系统 prompt 中的显式控制条款，保留少量不可违背的真相边界。
- 调整 twin chat 的 context packing，把“真相包”和“对话包”分开，减少把数据库摘要直接摊平成回答提示。
- 引入少量 few-shot / style exemplars，覆盖“刚聊过再问”“同日重问”“几天后重问”“没有新角度时自然收束”等高频场景。
- 把一部分句级控制从系统规则移回模型生成层，让系统更多负责“边界和方向”，而不是替模型写句子。
- 保持 confirmed facts / events / active twin truth / semantic evidence / topic interaction memory 这些底层结构不变，不做数据模型推翻。

## 功能 (Capabilities)

### 新增功能
- `twin-prompt-orchestration`: 定义分身回答时的 prompt 结构、context packing、few-shot 场景和表达自由度边界。

### 修改功能
- `twin`: 分身对话从“重规则、重显式指挥”的回答编排，调整为“少量硬边界 + 语境包 + 更自然生成”的回答方式。

## 影响

- 受影响的代码：`app/api/twin/chat/route.ts`、分身前端调试与上下文组装、和 twin 相关的 prompt / routing 辅助模块。
- 受影响的行为：同一事实的讲述方式、追问时的过渡、自然收束、模糊回忆感。
- 不影响的边界：
  - 不改变记忆确认边界。
  - 不改变“一人一分身”边界。
  - 不让画像层被客观编辑污染。
  - 不推翻现有 semantic substrate、topic interaction memory 和 twin version 数据层。
