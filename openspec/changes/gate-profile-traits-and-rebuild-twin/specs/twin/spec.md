## 新增需求

## 修改需求

### 需求:Twin growth 只能消费 clean traits 和正式资产
分身成长必须只消费 confirmed facts / events、clean semantic evidence 和 vetted profile traits。系统禁止直接把未经准入的 profile 字段写入新的 twin version。

#### 场景:系统生成新的 twin version
- **当** 系统触发 twin growth 刷新
- **那么** 系统必须从 clean projection 读取可用画像 trait
- **那么** 系统禁止直接读取未经筛选的 `lifeFacts`、`lexicalHabits`、`twinNotes` 或噪音 phrasebook 作为版本输入

#### 场景:画像候选仍处于 candidate 状态
- **当** 某个画像 trait 仍处于 candidate、rejected 或 stale 状态
- **那么** 系统禁止将其写入 `prompt_snapshot`、`persona_snapshot` 或 active twin truth

### 需求:系统必须支持从 clean assets 重建 active twin version
系统必须支持基于 clean assets 生成 sanitized twin version，并将 `active_version_id` 指向新的 clean 版本。

#### 场景:现有 active version 被判定包含污染画像
- **当** 系统或运营判定当前 active twin version 含有污染的画像内容
- **那么** 系统必须能够基于 confirmed facts / events、clean semantic evidence 和 vetted profile traits 生成新的 sanitized twin version
- **那么** 系统必须允许将 `active_version_id` 切换到该新版本

#### 场景:clean rebuild 后发现效果异常
- **当** sanitized twin version 上线后表现异常
- **那么** 系统必须能够回滚到上一个 twin version
- **那么** 系统不得丢失旧版本记录

## 移除需求
