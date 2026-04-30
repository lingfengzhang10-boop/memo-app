## MODIFIED Requirements

### Requirement: Twin-specific voice clone is optional
系统必须支持绑定分身专属语音参考样本，但该能力不是创建分身的前置条件。系统在向上游音色克隆接口提交请求时，必须自行生成满足上游约束的名字，不能要求用户为了生成音色而修改分身展示名。

#### Scenario: User records a twin voice sample
- **当** 用户进入分身对话页并录制、确认一段有效样本音频
- **那么** 系统必须上传样本并获得可用的 voice reference
- **那么** 后续分身回复应优先尝试使用该专属音色进行语音合成
- **那么** 无法合成时仍必须保留文字回复

#### Scenario: Twin display name contains localized or unsupported characters
- **当** 分身展示名包含中文、空格或其他上游不接受的字符，且用户提交了一段有效样本
- **那么** 系统必须在服务端把上游 `customName` 转换为只包含 ASCII 字母、数字、`_` 和 `-` 的安全值
- **那么** 该安全值必须不超过 64 个字符
- **那么** 系统不得要求用户手动修改分身展示名才能完成音色上传

#### Scenario: Twin display name has no allowed ASCII characters
- **当** 分身展示名在安全转换后不包含任何可用字符
- **那么** 系统必须回退到一个安全的默认名字继续请求
- **那么** 只要样本音频和转写有效，音色上传流程就不得因为名字为空而失败

## ADDED Requirements

无

## REMOVED Requirements

无
