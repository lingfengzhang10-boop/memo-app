import { NextResponse } from 'next/server'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const TTS_MODEL = process.env.AI_TTS_MODEL || 'fnlp/MOSS-TTSD-v0.5'
const TTS_VOICE = process.env.AI_TTS_VOICE || 'fnlp/MOSS-TTSD-v0.5:claire'
const TTS_FORMAT = process.env.AI_TTS_FORMAT || 'mp3'
const TTS_SPEED = Number(process.env.AI_TTS_SPEED || '0.96')
const TTS_STYLE_PROMPT =
  process.env.AI_TTS_STYLE_PROMPT || '请用温柔、自然、陪伴式的中文口语来读下面这段话，语速稍慢，带一点停顿，不要播音腔。'
const TTS_TIMEOUT_MS = Number(process.env.AI_TTS_TIMEOUT_MS || '18000')
const SPEECH_ENDPOINT = `${AI_BASE_URL}/audio/speech`

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
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

function clampSpeed(value: number) {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.min(1.3, Math.max(0.8, value))
}

function buildSpeechInput(text: string) {
  const trimmed = text.trim()

  if (TTS_MODEL.includes('MOSS-TTSD')) {
    return trimmed
  }

  // CosyVoice supports control prompt before <|endofprompt|>.
  // Without this separator, the model may literally read the instruction text.
  return `${TTS_STYLE_PROMPT}<|endofprompt|>${trimmed}`
}

export async function POST(request: Request) {
  if (!AI_API_KEY) {
    return jsonResponse({ error: 'Missing AI_API_KEY.' }, 503)
  }

  try {
    const body = (await request.json()) as { text?: string }
    const text = body.text?.trim()

    if (!text) {
      return jsonResponse({ error: 'Text is required.' }, 400)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), Math.max(5000, TTS_TIMEOUT_MS))

    const response = await fetch(SPEECH_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: buildSpeechInput(text),
        response_format: TTS_FORMAT,
        speed: clampSpeed(TTS_SPEED),
      }),
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      throw new Error(`Speech generation failed: ${errorText}`)
    }

    const audioBuffer = await response.arrayBuffer()
    const contentType =
      response.headers.get('content-type') ||
      (TTS_FORMAT === 'wav' ? 'audio/wav' : TTS_FORMAT === 'flac' ? 'audio/flac' : 'audio/mpeg')

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Companion speech generation failed:', error)

    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Speech generation timed out.'
        : error instanceof Error
          ? error.message
          : 'Companion speech generation failed.'

    return jsonResponse(
      {
        error: message,
      },
      500
    )
  }
}
