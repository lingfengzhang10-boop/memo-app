## ADDED Requirements

### Requirement: Twin growth refresh is controlled and versioned
系统必须通过受控版本刷新让分身继续成长，而不是在每轮聊天时直接原地改写当前 active version。

#### Scenario: Confirmed daily material reaches the refresh threshold
- **当** 当前分身已经存在 active version，且其后的已确认事实、已确认经历或高代表性表达素材达到刷新阈值
- **那么** 系统必须基于当前 active version 与这些增量素材生成新的分身版本
- **那么** 新版本必须以 `memory_growth` 作为 change source 写入 `twin_versions`
- **那么** `twin_profiles.active_version_id` 必须切换到这个新版本

#### Scenario: New material is not enough to justify a new version
- **当** 当前 active version 之后仅出现少量日常表达或不足以形成稳定变化的素材
- **那么** 系统不得为了追求实时性而强制创建新的分身版本
- **那么** 分身仍可以继续使用现有 active version 配合临时 live expression 进行对话

#### Scenario: Growth refresh fails
- **当** 分身成长刷新过程中的 AI 汇总、快照生成或写库步骤失败
- **那么** 系统必须保留当前 active version 继续可用
- **那么** 该失败不得阻塞用户继续与分身聊天

## MODIFIED Requirements

### Requirement: Daily conversation can continue enriching the twin
分身在冷启动完成后，必须能够从后续日常主链路中持续吸收成长素材。客观成长素材必须来自已确认的 facts / events；表达成长素材必须来自完成态日常 transcript 与 companion profile 中经过筛选的代表性表达。未确认线索不得直接改变 active twin version。

#### Scenario: User continues normal conversation after bootstrap
- **当** 用户已经生成初版分身，并继续在主链路中日常讲话
- **那么** 后续完成态 transcript 必须能够继续参与分身表达层的临时 live expression
- **那么** 后续已确认记忆必须能够成为分身后续成长的正式素材

#### Scenario: Confirmed daily memory becomes durable twin material
- **当** 用户在日常链路中确认了一条新的事实或经历
- **那么** 这条已确认内容必须可以被后续的分身成长刷新吸收进新的版本快照
- **那么** 分身后续对话必须能够基于刷新后的 active version 使用这条内容

#### Scenario: Representative daily expression becomes durable twin expression
- **当** 用户在日常讲话中形成了新的代表性说法、说话节奏或讲述方式，且系统判断其足以代表长期表达
- **那么** 系统必须允许这些表达证据在版本刷新后进入长期 expression snapshot
- **那么** 这些表达证据不得只停留在最近几条 transcript 的临时叠加层

#### Scenario: Unconfirmed clues do not directly mutate the twin
- **当** 日常链路中仍存在未确认的事实或经历候选
- **那么** 系统不得把这些未确认线索直接写入 active twin version
- **那么** 分身只能在保守前提下继续使用当前版本进行对话

## REMOVED Requirements

无
