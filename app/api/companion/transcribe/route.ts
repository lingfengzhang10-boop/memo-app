import { NextResponse } from 'next/server'
import { stabilizeVoiceInputDraft } from '@/lib/voiceInputTrust'
import { VoiceInputTranscriptionResult } from '@/types/companion'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const TRANSCRIBE_MODEL = process.env.AI_TRANSCRIBE_MODEL || 'FunAudioLLM/SenseVoiceSmall'
const TRANSCRIBE_ENDPOINT = `${AI_BASE_URL}/audio/transcriptions`

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

export async function POST(request: Request) {
  if (!AI_API_KEY) {
    return jsonResponse({ error: 'Missing AI_API_KEY.' }, 503)
  }

  try {
    const formData = await request.formData()
    const audio = formData.get('audio')
    const mode = typeof formData.get('mode') === 'string' ? String(formData.get('mode')).trim() : ''
    const contextRaw = typeof formData.get('context') === 'string' ? String(formData.get('context')) : ''

    if (!(audio instanceof File)) {
      return jsonResponse({ error: 'Audio file is required.' }, 400)
    }

    const upstreamFormData = new FormData()
    upstreamFormData.append('file', audio, audio.name || 'correction.webm')
    upstreamFormData.append('model', TRANSCRIBE_MODEL)
    upstreamFormData.append('language', 'zh')

    const response = await fetch(TRANSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: upstreamFormData,
    })

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      throw new Error(
        `Transcription failed (${response.status}) via ${TRANSCRIBE_ENDPOINT} with model ${TRANSCRIBE_MODEL}: ${errorText}`,
      )
    }

    const result = (await response.json()) as {
      text?: string
      transcript?: string
      result?: string
    }

    const transcript = result.text?.trim() || result.transcript?.trim() || result.result?.trim() || ''
    let context: string[] = []

    if (contextRaw) {
      try {
        const parsed = JSON.parse(contextRaw) as string[]
        if (Array.isArray(parsed)) {
          context = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        }
      } catch {
        context = []
      }
    }

    if (mode === 'twin-chat' || mode === 'memory-reflect') {
      const stabilized = await stabilizeVoiceInputDraft({
        transcript,
        surface: mode,
        context,
      })

      console.info('Voice input stabilized', {
        mode,
        trustLevel: stabilized.trustLevel,
        riskFlags: stabilized.riskFlags,
        usedRepair: stabilized.usedRepair,
        transcript,
        trustedTranscript: stabilized.trustedTranscript,
      })

      return jsonResponse({
        transcript,
        trustedTranscript: stabilized.trustedTranscript,
        displayTranscript: stabilized.displayTranscript,
        trustLevel: stabilized.trustLevel,
        riskFlags: stabilized.riskFlags,
        usedRepair: stabilized.usedRepair,
      } satisfies VoiceInputTranscriptionResult)
    }

    return jsonResponse({
      transcript,
    } satisfies VoiceInputTranscriptionResult)
  } catch (error) {
    console.error('Correction transcription failed:', error)
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Correction transcription failed.',
      },
      500,
    )
  }
}
