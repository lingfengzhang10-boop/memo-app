import { NextResponse } from 'next/server'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const TWIN_TTS_MODEL = process.env.AI_TWIN_TTS_MODEL || 'FunAudioLLM/CosyVoice2-0.5B'
const TWIN_TTS_FORMAT = process.env.AI_TWIN_TTS_FORMAT || 'mp3'
const TWIN_TTS_SPEED = Number(process.env.AI_TWIN_TTS_SPEED || '0.96')
const TWIN_TTS_STYLE_PROMPT =
  process.env.AI_TWIN_TTS_STYLE_PROMPT ||
  '请用自然、像真人陪伴聊天一样的中文口语读下面这段话，语速稍慢，带一点停顿，不要播音腔，也不要夸张演绎。'
const TWIN_TTS_TIMEOUT_MS = Number(process.env.AI_TWIN_TTS_TIMEOUT_MS || '20000')
const DEFAULT_TWIN_VOICE =
  process.env.AI_TWIN_DEFAULT_VOICE || 'FunAudioLLM/CosyVoice2-0.5B:claire'
const SPEECH_ENDPOINT = `${AI_BASE_URL}/audio/speech`

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

function clampSpeed(value: number) {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.min(1.25, Math.max(0.8, value))
}

async function readErrorPayload(response: Response) {
  const rawText = await response.text()

  try {
    const parsed = JSON.parse(rawText) as {
      error?: { message?: string }
      message?: string
    }

    return parsed.error?.message || parsed.message || rawText
  } catch {
    return rawText
  }
}

function sanitizeSpeechText(text: string) {
  const cleaned = text
    .replace(/<\|[^|]+\|>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[_*`#~]/g, ' ')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, ' ')
    .replace(/[^\p{Letter}\p{Number}\p{Punctuation}\p{Separator}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || text.trim()
}

function buildSpeechInput(text: string) {
  const spokenText = sanitizeSpeechText(text)

  if (TWIN_TTS_MODEL.includes('MOSS-TTSD')) {
    return spokenText
  }

  // Keep the control prompt minimal. Long persona summaries can leak into
  // cloned-voice synthesis or destabilize the generated audio.
  return `${TWIN_TTS_STYLE_PROMPT}<|endofprompt|>${spokenText}`
}

export async function POST(request: Request) {
  if (!AI_API_KEY) {
    return jsonResponse({ error: 'Missing AI_API_KEY.' }, 503)
  }

  try {
    const body = (await request.json()) as {
      text?: string
      voiceUri?: string
    }

    const text = body.text?.trim()
    if (!text) {
      return jsonResponse({ error: 'Text is required.' }, 400)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), Math.max(5000, TWIN_TTS_TIMEOUT_MS))

    const response = await fetch(SPEECH_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: TWIN_TTS_MODEL,
        voice: body.voiceUri || DEFAULT_TWIN_VOICE,
        input: buildSpeechInput(text),
        response_format: TWIN_TTS_FORMAT,
        speed: clampSpeed(TWIN_TTS_SPEED),
        stream: false,
      }),
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      throw new Error(`Twin speech generation failed: ${errorText}`)
    }

    const audioBuffer = await response.arrayBuffer()
    const contentType =
      response.headers.get('content-type') ||
      (TWIN_TTS_FORMAT === 'wav'
        ? 'audio/wav'
        : TWIN_TTS_FORMAT === 'flac'
          ? 'audio/flac'
          : 'audio/mpeg')

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Twin speech generation failed:', error)

    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Twin speech generation timed out.'
        : error instanceof Error
          ? error.message
          : 'Twin speech generation failed.'

    return jsonResponse({ error: message }, 500)
  }
}
