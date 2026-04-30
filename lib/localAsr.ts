type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<{ text: string }>

let asrPipelinePromise: Promise<AsrPipeline | null> | null = null
const TRANSFORMERS_JS_CDN =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js'

export function shouldUseLocalAsr() {
  if (typeof window === 'undefined') {
    return false
  }

  const ua = window.navigator.userAgent || ''
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const memory = 'deviceMemory' in navigator ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined

  // Browser-side Whisper is too memory-hungry for many phones, especially Safari.
  if (isMobile) {
    return false
  }

  if (typeof memory === 'number' && memory <= 4) {
    return false
  }

  return true
}

async function getAudioDataFromBlob(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioContext = new AudioContext({ sampleRate: 16000 })

  try {
    const decodedAudio = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const channelData = decodedAudio.getChannelData(0)

    return new Float32Array(channelData)
  } finally {
    await audioContext.close()
  }
}

async function getAsrPipeline() {
  if (typeof window === 'undefined') {
    return null
  }

  if (!asrPipelinePromise) {
    asrPipelinePromise = (async () => {
      const transformersModule = await import(
        /* webpackIgnore: true */
        TRANSFORMERS_JS_CDN
      ) as {
        env: { allowLocalModels: boolean }
        pipeline: (task: string, model: string) => Promise<AsrPipeline>
      }

      transformersModule.env.allowLocalModels = false

      const model = process.env.NEXT_PUBLIC_LOCAL_ASR_MODEL || 'Xenova/whisper-tiny'

      return await transformersModule.pipeline('automatic-speech-recognition', model)
    })()
  }

  return asrPipelinePromise
}

export async function preloadLocalAsr() {
  if (!shouldUseLocalAsr()) {
    throw new Error('当前设备不启用本地语音模型')
  }
  return getAsrPipeline()
}

export async function transcribeLocally(blob: Blob): Promise<string> {
  if (!shouldUseLocalAsr()) {
    throw new Error('当前设备不启用本地语音模型')
  }

  const audio = await getAudioDataFromBlob(blob)
  const asr = await getAsrPipeline()

  if (!asr) {
    throw new Error('Local ASR is unavailable in this environment.')
  }

  const result = await asr(audio, {
    language: 'zh',
    task: 'transcribe',
    chunk_length_s: 20,
    stride_length_s: 5,
    return_timestamps: false,
  })

  return result.text?.trim() || ''
}
