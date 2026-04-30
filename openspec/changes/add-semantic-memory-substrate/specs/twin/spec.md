## MODIFIED Requirements

### Requirement: Twin response uses semantic evidence as a bounded enhancement layer
分身后续必须支持“稳定真相优先、语义证据增强”的读取策略。semantic substrate 只能在不打破 active truth 的前提下为分身补充原话细节、同义语义与阶段上下文。

#### Scenario: Twin answers with stable truth first
- **当** 分身收到一个用户问题
- **那么** 系统必须优先使用 active twin version 与 confirmed assets 组织基础回答上下文
- **那么** 不得在缺少稳定基础层的情况下直接只依赖 raw semantic retrieval

#### Scenario: Semantic evidence improves detail and recall
- **当** 用户问题与既有 transcript 在语义上相关，但与 snapshot 文本不完全同词
- **那么** 系统可以使用 semantic evidence 补充原话细节、时间语境或上下文纹理
- **那么** 这种增强不得改变当前 active truth 的边界定义

#### Scenario: Semantic retrieval is unavailable
- **当** semantic substrate 或其检索能力暂时不可用
- **那么** 分身仍必须能够基于 active version 与 confirmed assets 继续工作
- **那么** 整条分身对话链路不得因为语义增强层故障而中断
