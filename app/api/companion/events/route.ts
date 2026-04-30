import { NextResponse } from 'next/server'
import { EventExtractionResult, MemoryEventCandidate } from '@/types/companion'
import { buildFallbackEvents } from '@/lib/eventHeuristics'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
const CHAT_COMPLETIONS_ENDPOINT = `${AI_BASE_URL}/chat/completions`

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

function buildEventsPrompt(transcript: string) {
  return [
    'Extract life timeline events from the following Chinese transcript.',
    'Only extract things that happened or are happening as events.',
    'Do not extract preferences, fears, beliefs, item locations, or generic opinions.',
    'Return JSON only, with one top-level field: events.',
    '',
    'Each event should contain:',
    '- canonicalKey: stable key for dedupe, empty string if uncertain',
    '- title: short event title',
    '- description: event description',
    '- timeType: exact / year / age / relative / current / unknown',
    '- startAt: ISO string or empty string',
    '- endAt: ISO string or empty string',
    '- year: number or null',
    '- ageAtEvent: number or null',
    '- lifeStage: short label or empty string',
    '- isCurrent: boolean',
    '- locationName: location or empty string',
    '- emotion: emotion keyword or empty string',
    '- importance: integer 1-5',
    '- confidence: number 0-1',
    '- metadata: object',
    '',
    'Rules:',
    '- Extract at most 5 events.',
    '- If there is no clear event, return {"events":[]}.',
    '- Be conservative and avoid hallucination.',
    '- Preserve concrete nouns from the transcript whenever possible; do not rewrite named entities or titles.',
    '',
    'Transcript:',
    transcript,
  ].join('\n')
}

function clampConfidence(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.5
  }

  return Math.min(1, Math.max(0, value))
}

function clampImportance(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 3
  }

  return Math.min(5, Math.max(1, Math.round(value)))
}

function normalizeEventText(text: string) {
  return text
    .replace(/(看|观看)世界(?!观|末日|地图|上|里)/g, '$1世界杯')
    .replace(/一起(看|观看)世界(?!观|末日|地图|上|里)/g, '一起$1世界杯')
    .trim()
}

function normalizeEventCandidate(candidate: MemoryEventCandidate) {
  const title = normalizeEventText(candidate.title)
  const description = normalizeEventText(candidate.description)

  return {
    ...candidate,
    title,
    description,
    metadata: {
      ...candidate.metadata,
      normalizedText: true,
    },
  }
}

function parseEventCandidate(value: unknown): MemoryEventCandidate | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Record<string, unknown>
  const title = typeof item.title === 'string' ? item.title.trim() : ''

  if (!title) {
    return null
  }

  return {
    canonicalKey: typeof item.canonicalKey === 'string' ? item.canonicalKey.trim() : '',
    title,
    description: typeof item.description === 'string' ? item.description.trim() : '',
    timeType:
      item.timeType === 'exact' ||
      item.timeType === 'year' ||
      item.timeType === 'age' ||
      item.timeType === 'relative' ||
      item.timeType === 'current'
        ? item.timeType
        : 'unknown',
    startAt: typeof item.startAt === 'string' && item.startAt.trim() ? item.startAt.trim() : undefined,
    endAt: typeof item.endAt === 'string' && item.endAt.trim() ? item.endAt.trim() : undefined,
    year: typeof item.year === 'number' ? item.year : undefined,
    ageAtEvent: typeof item.ageAtEvent === 'number' ? item.ageAtEvent : undefined,
    lifeStage: typeof item.lifeStage === 'string' && item.lifeStage.trim() ? item.lifeStage.trim() : undefined,
    isCurrent: Boolean(item.isCurrent),
    locationName:
      typeof item.locationName === 'string' && item.locationName.trim() ? item.locationName.trim() : undefined,
    emotion: typeof item.emotion === 'string' && item.emotion.trim() ? item.emotion.trim() : undefined,
    importance: clampImportance(item.importance),
    confidence: clampConfidence(item.confidence),
    metadata: item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : {},
  }
}

export async function POST(request: Request) {
  if (!AI_API_KEY) {
    return jsonResponse({ error: 'Missing AI_API_KEY.' }, 503)
  }

  let transcript = ''

  try {
    const body = (await request.json()) as { transcript?: string }
    transcript = body.transcript?.trim() || ''

    if (!transcript) {
      return jsonResponse({ error: 'Transcript is required.' }, 400)
    }

    const response = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You extract structured life events from Chinese transcripts and return compact JSON only.',
          },
          {
            role: 'user',
            content: buildEventsPrompt(transcript),
          },
        ],
        response_format: {
          type: 'json_object',
        },
        temperature: 0.1,
        max_tokens: 900,
      }),
    })

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      throw new Error(`Event extraction failed: ${errorText}`)
    }

    const result = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string
        }
      }>
    }

    const text = result.choices?.[0]?.message?.content

    if (!text) {
      throw new Error('Event extraction returned no structured content.')
    }

    const parsed = JSON.parse(text) as Record<string, unknown>
    const modelEvents = Array.isArray(parsed.events)
      ? parsed.events
          .map(parseEventCandidate)
          .filter((item): item is MemoryEventCandidate => item !== null)
          .map(normalizeEventCandidate)
          .slice(0, 5)
      : []

    const events = modelEvents.length > 0 ? modelEvents : buildFallbackEvents(transcript).map(normalizeEventCandidate)

    return jsonResponse({
      events,
    } satisfies EventExtractionResult)
  } catch (error) {
    console.error('Companion event extraction failed:', error)
    return jsonResponse({
      events: transcript ? buildFallbackEvents(transcript).map(normalizeEventCandidate) : [],
    } satisfies EventExtractionResult)
  }
}
