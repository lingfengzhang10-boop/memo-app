# App / Web Client Surface QA

## Shared truth

- 在 `App` 侧首页确认一条 fact/event 线索后，`Web` 侧回忆录或工作台能读取同一条正式记录。
- 在 `Web` 侧整理正式资产后，`App` 侧 `回顾` 页面和 `分身` 页面能读取同一份结果。
- `App` 与 `Web` 读取同一个 `active_version_id`，不存在双版本分叉。

## App-first surfaces

- `/mobile` 保留高频录音入口、即时回应和轻量线索确认。
- `/mobile/twin` 只承载高频分身聊天入口，不再混入音色样本录制。
- `/mobile/review` 只提供轻量回顾，而不是完整工作台。
- `/mobile/me` 展示设备能力、共享契约和跳转到 `Web` 工作台的入口。

## Dedicated flows

- `/mobile/twin/bootstrap` 与 `/twin/bootstrap` 继续使用独立冷启动流程。
- `/mobile/twin/[id]/voice` 与 `/twin/[id]/voice` 继续使用独立声音样本流程。
- 日常聊天页只显示声音状态和跳转入口，不要求用户在聊天主界面完成样本录制。

## Web workbench

- `/studio` 明确作为 `Web` 深度整理入口存在。
- `Web` 侧保留回忆录、工作台和重资产入口，不要求首版 `App` 重复实现。
- 从 `Web` 页面进入 `分身`、`回忆录`、`工作台` 时，不会被重定向到 `mobile` 路由。

## Platform adapters

- 录音能力通过 `lib/platform/recorderSupport.ts` 判定。
- 音频播放通过 `lib/platform/audioPlayback.ts` 管理，而不是散落在页面内部。
- 本地存储通过 `lib/platform/storage.ts` 管理。
- 录音上传和 pending memory 写入通过 `lib/recordingPersistence.ts` 复用。

## Fallbacks

- `ASR` 失败时，页面保留错误提示并允许用户稍后重试。
- `TTS` 失败时，页面保留文本回复；首页可退回浏览器 `TTS`。
- 声音样本转写失败时，不污染现有 `voice clone` 配置。

## Verification

- `npm run typecheck`
- 至少手测一次：
  - `/mobile`
  - `/mobile/twin`
  - `/mobile/review`
  - `/mobile/me`
  - `/mobile/twin/bootstrap`
  - `/mobile/twin/[id]/voice`
  - `/studio`

## Character selection update

- `/mobile/characters` must list `Liva`, the current user's own twin if one exists, and twins explicitly granted to the current user.
- Selecting the user's own twin must return to `/mobile?character=twin:<id>&mode=text`, keep that twin in the top character selector, and route later messages through the twin chat flow instead of the Liva reflection flow.
- The older rule "the user's own twin cannot be selected from the character selector" is superseded because it caused the user to enter a twin conversation and then visually fall back to Liva.
