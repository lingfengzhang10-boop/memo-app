## ADDED Requirements

### 需求: Twin surfaces must share one active twin truth
系统必须保证 Native App 与 Web 在分身能力上共享同一个 active version、同一套音色配置和同一份成长结果，不得因为客户端不同而形成两个不同的分身状态。

#### 场景: 用户在 App 与 Web 间切换分身
- **当** 用户先在 Native App 中与分身对话，再在 Web 中打开同一个分身
- **那么** 系统必须让两端读取同一条 `active_version_id`
- **那么** 两端必须基于同一份 facts snapshot、events snapshot 和 persona snapshot 进行展示与回复

#### 场景: 用户更新分身音色后跨端使用
- **当** 用户在任一客户端更新了分身音色样本并生成新的 voice reference
- **那么** 另一个客户端必须能够复用这份有效的音色配置
- **那么** 系统不得要求用户在两个客户端分别为同一个分身重复克隆音色

### 需求: Twin bootstrap and voice sample must remain dedicated flows
系统必须将分身冷启动和音色样本管理视为独立流程，而不是把它们完全混入日常聊天主界面。

#### 场景: 用户首次创建分身
- **当** 用户首次进入 Native App 或 Web 并尚未拥有分身
- **那么** 系统必须引导其进入专门的分身冷启动流程
- **那么** 系统不得把冷启动问答压缩成普通聊天输入的一部分

#### 场景: 用户需要重录音色样本
- **当** 用户想要配置、替换或重录分身音色样本
- **那么** 系统必须提供独立的样本录制与试听路径
- **那么** 系统不得要求用户通过普通聊天消息来完成音色配置

## MODIFIED Requirements

### 需求: Twin chat uses active version and twin memory context
分身对话必须继续基于当前激活的分身版本和相应的人格、事实、经历上下文，但在产品表面上必须把 Native App 视为高频对话入口，把 Web 视为可保留的管理、观察和辅助聊天入口。

#### 场景: 用户在 App 中与分身高频对话
- **当** 用户进入 Native App 的分身页并发起对话
- **那么** 系统必须基于当前 `active_version_id` 对应的版本快照生成回复
- **那么** 系统必须优先支持适合高频使用的文字与语音交互链路

#### 场景: 用户在 Web 中查看或继续分身对话
- **当** 用户在 Web 中打开同一个分身
- **那么** 系统必须继续使用相同的 active version 与上下文真相
- **那么** Web 可以承担更强的观察、核对或管理职责，而不必成为唯一的高频对话入口
