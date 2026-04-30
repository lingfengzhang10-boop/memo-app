export function getRecorderSupportError(): string | null {
  if (typeof window === 'undefined') {
    return '当前环境不支持录音。'
  }

  if (!window.isSecureContext) {
    return '当前页面不是安全连接，手机录音请使用 HTTPS 地址打开。'
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return '当前浏览器或访问方式不支持录音，请换用 Safari 或 Chrome，并通过 HTTPS 打开。'
  }

  if (typeof MediaRecorder === 'undefined') {
    return '当前浏览器不支持录音能力。'
  }

  return null
}

export function canUseRecorder() {
  return getRecorderSupportError() === null
}
