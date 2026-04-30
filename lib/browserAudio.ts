const WAV_MIME_TYPE = 'audio/wav'

type BrowserAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

function getAudioContextCtor() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.AudioContext || (window as BrowserAudioWindow).webkitAudioContext || null
}

function mixToMono(audioBuffer: AudioBuffer) {
  const channelCount = audioBuffer.numberOfChannels
  const frameCount = audioBuffer.length

  if (channelCount <= 1) {
    return audioBuffer.getChannelData(0)
  }

  const mono = new Float32Array(frameCount)

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channelData = audioBuffer.getChannelData(channelIndex)
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      mono[frameIndex] += channelData[frameIndex] / channelCount
    }
  }

  return mono
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function encodeMonoWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: WAV_MIME_TYPE })
}

export async function prepareVoiceCloneAudio(blob: Blob, mimeType: string) {
  if (mimeType.includes('wav')) {
    return {
      blob,
      mimeType: WAV_MIME_TYPE,
      extension: 'wav',
    }
  }

  const AudioContextCtor = getAudioContextCtor()
  if (!AudioContextCtor) {
    throw new Error('当前浏览器无法转换音色样本，请换用 Safari 或 Chrome 再试。')
  }

  const audioContext = new AudioContextCtor()

  try {
    const sourceBuffer = await blob.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(sourceBuffer.slice(0))
    const monoSamples = mixToMono(audioBuffer)
    const wavBlob = encodeMonoWav(monoSamples, audioBuffer.sampleRate)

    return {
      blob: wavBlob,
      mimeType: WAV_MIME_TYPE,
      extension: 'wav',
    }
  } catch (error) {
    console.error('Voice clone sample conversion failed:', error)
    throw new Error('这段样本无法转换成可用的音色格式，请再录一段或换浏览器重试。')
  } finally {
    await audioContext.close().catch(() => undefined)
  }
}
