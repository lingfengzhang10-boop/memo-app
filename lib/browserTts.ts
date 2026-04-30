type SpeakOptions = {
  lang?: string
  rate?: number
  pitch?: number
  volume?: number
}

function getSpeechSynthesis() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null
  }

  return window.speechSynthesis
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: string) {
  const normalizedLang = lang.toLowerCase()

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalizedLang) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(normalizedLang.split('-')[0])) ||
    voices.find((voice) => voice.default) ||
    null
  )
}

export function canUseBrowserTts() {
  return getSpeechSynthesis() !== null && typeof window.SpeechSynthesisUtterance !== 'undefined'
}

export function stopBrowserTts() {
  const synth = getSpeechSynthesis()
  if (!synth) return

  synth.cancel()
}

export function speakWithBrowserTts(text: string, options: SpeakOptions = {}) {
  const synth = getSpeechSynthesis()
  if (!synth || !text.trim()) {
    return false
  }

  synth.cancel()

  const utterance = new window.SpeechSynthesisUtterance(text.trim())
  const lang = options.lang || 'zh-CN'
  const voices = synth.getVoices()
  const voice = pickVoice(voices, lang)

  utterance.lang = lang
  utterance.rate = options.rate ?? 0.96
  utterance.pitch = options.pitch ?? 1
  utterance.volume = options.volume ?? 1

  if (voice) {
    utterance.voice = voice
  }

  synth.speak(utterance)
  return true
}
