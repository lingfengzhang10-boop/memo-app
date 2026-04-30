import { NextResponse } from 'next/server'
import { deriveSituationalFactCandidate } from '@/lib/twinSituationalRouting'
import { FactExtractionResult, MemoryFactCandidate } from '@/types/companion'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
const CHAT_COMPLETIONS_ENDPOINT = `${AI_BASE_URL}/chat/completions`

const CANONICAL_PREDICATES = new Map<string, string>([
  ['最喜欢', '喜欢'],
  ['喜欢', '喜欢'],
  ['偏爱', '喜欢'],
  ['不喜欢', '不喜欢'],
  ['讨厌', '不喜欢'],
  ['害怕', '害怕'],
  ['担心', '担心'],
  ['恐惧', '害怕'],
  ['焦虑', '担心'],
  ['觉得', '认为'],
  ['相信', '认为'],
  ['认为', '认为'],
  ['住在', '住在'],
  ['放在', '放在'],
  ['放着', '放在'],
  ['习惯', '习惯'],
  ['常常', '习惯'],
  ['想要', '想要'],
  ['希望', '想要'],
  ['正在经历', '正在经历'],
  ['处于', '正在经历'],
  ['压力来自', '压力来自'],
])

const EVENT_LIKE_PATTERNS = [
  /(19|20)\d{2}年/,
  /\d{1,2}岁/,
  /毕业/,
  /工作/,
  /上学/,
  /去了/,
  /来到/,
  /搬到/,
  /结婚/,
  /住院/,
  /手术/,
  /去世/,
]

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

function buildFactsPrompt(transcript: string) {
  return [
    'Extract non-event memories from the following Chinese transcript.',
    'Only extract stable facts, preferences, fears, states, habits, beliefs, rules, goals, item locations, and situational worries/stressors.',
    'Do not extract life events or timeline experiences as facts.',
    'Return JSON only, with one top-level field: facts.',
    '',
    'Each fact should contain:',
    '- canonicalKey: stable key for dedupe, empty string if uncertain',
    '- factType: identity / preference / belief / fear / habit / location / health / routine / rule / goal / status / worry_about / stressor / situational_anxiety',
    '- subject: who or what',
    '- predicate: a short natural relation verb',
    '- objectText: object text',
    '- valueJson: object',
    '- validTimeType: current / long_term / past / temporary / unknown',
    '- startAt: ISO string or empty string',
    '- endAt: ISO string or empty string',
    '- confidence: number 0-1',
    '- metadata: object',
    '',
    'Rules:',
    '- Do not output event-like content such as graduation, jobs, trips, or year-based experiences as facts.',
    '- When the user says "最难/最担心/压力最大/不稳定/悬着心" inside a specific time or place context, prefer worry_about / stressor / situational_anxiety instead of generic status.',
    '- Extract at most 6 facts.',
    '- If there are no clear facts, return {"facts":[]}.',
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

function normalizePredicate(predicate: string) {
  const trimmed = predicate.trim()
  return CANONICAL_PREDICATES.get(trimmed) || trimmed
}

function normalizeFactType(factType: string) {
  const trimmed = factType.trim()
  const normalized = trimmed.toLowerCase()
  const aliases = new Map<string, string>([
    ['identity', 'identity'],
    ['preference', 'preference'],
    ['belief', 'belief'],
    ['fear', 'fear'],
    ['habit', 'habit'],
    ['location', 'location'],
    ['health', 'health'],
    ['routine', 'routine'],
    ['rule', 'rule'],
    ['goal', 'goal'],
    ['status', 'status'],
    ['worry_about', 'worry_about'],
    ['worry', 'worry_about'],
    ['stressor', 'stressor'],
    ['situational_anxiety', 'situational_anxiety'],
  ])

  return aliases.get(normalized) || trimmed
}

function looksLikeEventFact(candidate: Pick<MemoryFactCandidate, 'factType' | 'predicate' | 'objectText'>) {
  const haystack = `${candidate.predicate} ${candidate.objectText}`
  if (candidate.factType === 'belief' && EVENT_LIKE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return true
  }

  return candidate.factType !== 'location' && EVENT_LIKE_PATTERNS.some((pattern) => pattern.test(candidate.objectText))
}

function parseFactCandidate(value: unknown): MemoryFactCandidate | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Record<string, unknown>
  const factType = typeof item.factType === 'string' ? normalizeFactType(item.factType) : ''
  const subject = typeof item.subject === 'string' ? item.subject.trim() : ''
  const rawPredicate = typeof item.predicate === 'string' ? item.predicate.trim() : ''

  if (!factType || !subject || !rawPredicate) {
    return null
  }

  const candidate: MemoryFactCandidate = {
    canonicalKey: typeof item.canonicalKey === 'string' ? item.canonicalKey.trim() : '',
    factType,
    subject,
    predicate: normalizePredicate(rawPredicate),
    objectText: typeof item.objectText === 'string' ? item.objectText.trim() : '',
    valueJson:
      item.valueJson && typeof item.valueJson === 'object' ? (item.valueJson as Record<string, unknown>) : {},
    validTimeType:
      item.validTimeType === 'current' ||
      item.validTimeType === 'long_term' ||
      item.validTimeType === 'past' ||
      item.validTimeType === 'temporary'
        ? item.validTimeType
        : 'unknown',
    startAt: typeof item.startAt === 'string' && item.startAt.trim() ? item.startAt.trim() : undefined,
    endAt: typeof item.endAt === 'string' && item.endAt.trim() ? item.endAt.trim() : undefined,
    confidence: clampConfidence(item.confidence),
    metadata: item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : {},
  }

  if (looksLikeEventFact(candidate)) {
    return null
  }

  return candidate
}

function mergeFactCandidates(modelFacts: MemoryFactCandidate[], transcript: string) {
  const merged = [...modelFacts]
  const situationalCandidate = deriveSituationalFactCandidate(transcript)

  if (!situationalCandidate) {
    return merged.slice(0, 6)
  }

  const signature = (candidate: MemoryFactCandidate) =>
    `${candidate.factType}:${candidate.subject}:${candidate.predicate}:${candidate.objectText}`

  const existingSignatures = new Set(merged.map(signature))
  if (!existingSignatures.has(signature(situationalCandidate))) {
    merged.push(situationalCandidate)
  }

  return merged.slice(0, 6)
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
            content: 'You extract structured non-event memories from Chinese transcripts and return compact JSON only.',
          },
          {
            role: 'user',
            content: buildFactsPrompt(transcript),
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
      throw new Error(`Fact extraction failed: ${errorText}`)
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
      throw new Error('Fact extraction returned no structured content.')
    }

    const parsed = JSON.parse(text) as Record<string, unknown>
    const modelFacts = Array.isArray(parsed.facts)
      ? parsed.facts
          .map(parseFactCandidate)
          .filter((item): item is MemoryFactCandidate => item !== null)
      : []

    return jsonResponse({
      facts: mergeFactCandidates(modelFacts, transcript),
    } satisfies FactExtractionResult)
  } catch (error) {
    console.error('Companion fact extraction failed:', error)
    const fallbackFacts = transcript ? mergeFactCandidates([], transcript) : []
    return jsonResponse({
      facts: fallbackFacts,
    } satisfies FactExtractionResult)
  }
}
