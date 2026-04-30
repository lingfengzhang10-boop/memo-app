import { NextResponse } from 'next/server'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const TWIN_VOICE_MODEL = process.env.AI_TWIN_VOICE_CLONE_MODEL || 'FunAudioLLM/CosyVoice2-0.5B'
const UPLOAD_VOICE_ENDPOINT = `${AI_BASE_URL}/uploads/audio/voice`
const CUSTOM_NAME_MAX_LENGTH = 64
const CUSTOM_NAME_FALLBACK_PREFIX = 'twin-voice'

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

function sanitizeName(name: string) {
  const normalized = name
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  const limited = normalized.slice(0, CUSTOM_NAME_MAX_LENGTH).replace(/^-|-$/g, '')

  return limited || `${CUSTOM_NAME_FALLBACK_PREFIX}-${Date.now()}`
}

function extractVoiceUri(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const record = payload as Record<string, unknown>

  if (typeof record.uri === 'string' && record.uri.trim()) {
    return record.uri.trim()
  }

  if (record.data && typeof record.data === 'object') {
    const nested = record.data as Record<string, unknown>
    if (typeof nested.uri === 'string' && nested.uri.trim()) {
      return nested.uri.trim()
    }
  }

  if (record.voice && typeof record.voice === 'object') {
    const voice = record.voice as Record<string, unknown>
    if (typeof voice.uri === 'string' && voice.uri.trim()) {
      return voice.uri.trim()
    }
  }

  return ''
}

export async function POST(request: Request) {
  if (!AI_API_KEY) {
    return jsonResponse({ error: 'Missing AI_API_KEY.' }, 503)
  }

  try {
    const formData = await request.formData()
    const audio = formData.get('audio')
    const transcript = String(formData.get('transcript') || '').trim()
    const twinName = String(formData.get('twinName') || '').trim()
    const sampleDurationMs = Number(formData.get('sampleDurationMs') || '0')

    if (!(audio instanceof File)) {
      return jsonResponse({ error: 'Audio file is required.' }, 400)
    }

    if (!transcript) {
      return jsonResponse({ error: 'Transcript is required.' }, 400)
    }

    const upstream = new FormData()
    upstream.append('file', audio, audio.name || 'twin-voice-sample.webm')
    upstream.append('model', TWIN_VOICE_MODEL)
    upstream.append('customName', sanitizeName(twinName || 'twin-voice'))
    upstream.append('text', transcript)

    const response = await fetch(UPLOAD_VOICE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: upstream,
    })

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      throw new Error(`Voice clone upload failed: ${errorText}`)
    }

    const payload = (await response.json()) as Record<string, unknown>
    const voiceUri = extractVoiceUri(payload)

    if (!voiceUri) {
      throw new Error('Voice clone upload returned no voice uri.')
    }

    return jsonResponse({
      voiceUri,
      model: TWIN_VOICE_MODEL,
      sampleTranscript: transcript,
      sampleDurationMs: Number.isFinite(sampleDurationMs) && sampleDurationMs > 0 ? sampleDurationMs : undefined,
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Twin voice clone upload failed:', error)
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Twin voice clone upload failed.',
      },
      500,
    )
  }
}
