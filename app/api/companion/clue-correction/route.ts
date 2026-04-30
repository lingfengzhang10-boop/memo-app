import { NextResponse } from 'next/server'
import {
  ClueCorrectionResult,
  MemoryEventCandidate,
  MemoryFactCandidate,
  PendingClue,
} from '@/types/companion'

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

function clampConfidence(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.6
  }

  return Math.min(1, Math.max(0, value))
}

function clampImportance(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 3
  }

  return Math.min(5, Math.max(1, Math.round(value)))
}

function parseFactCandidate(value: unknown): MemoryFactCandidate | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Record<string, unknown>
  if (typeof item.subject !== 'string' || typeof item.predicate !== 'string') {
    return null
  }

  return {
    canonicalKey: typeof item.canonicalKey === 'string' ? item.canonicalKey.trim() : '',
    factType: typeof item.factType === 'string' ? item.factType.trim() || 'status' : 'status',
    subject: item.subject.trim(),
    predicate: item.predicate.trim(),
    objectText: typeof item.objectText === 'string' ? item.objectText.trim() : '',
    valueJson: item.valueJson && typeof item.valueJson === 'object' ? (item.valueJson as Record<string, unknown>) : {},
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
}

function parseEventCandidate(value: unknown): MemoryEventCandidate | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Record<string, unknown>
  if (typeof item.title !== 'string') {
    return null
  }

  return {
    canonicalKey: typeof item.canonicalKey === 'string' ? item.canonicalKey.trim() : '',
    title: item.title.trim(),
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
    locationName: typeof item.locationName === 'string' && item.locationName.trim() ? item.locationName.trim() : undefined,
    emotion: typeof item.emotion === 'string' && item.emotion.trim() ? item.emotion.trim() : undefined,
    importance: clampImportance(item.importance),
    confidence: clampConfidence(item.confidence),
    metadata: item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : {},
  }
}

function buildFactPrompt(clue: PendingClue, correctionTranscript: string) {
  return [
    '你要根据用户的语音纠正内容，修正一条已经抽取出的事实线索。',
    '只返回 JSON，对象顶层字段必须是 fact。',
    '不要解释，不要代码块。',
    '',
    '原线索：',
    JSON.stringify(clue.kind === 'fact' ? clue.fact : clue, null, 2),
    '',
    '用户刚才的纠正语音转写：',
    correctionTranscript,
    '',
    '要求：',
    '- 保持字段结构稳定',
    '- 尽量只修正客观事实，不要发散改写',
    '- 如果用户是在否认原线索，就根据纠正内容改成正确版本',
  ].join('\n')
}

function buildEventPrompt(clue: PendingClue, correctionTranscript: string) {
  return [
    '你要根据用户的语音纠正内容，修正一条已经抽取出的事件线索。',
    '只返回 JSON，对象顶层字段必须是 event。',
    '不要解释，不要代码块。',
    '',
    '原线索：',
    JSON.stringify(clue.kind === 'event' ? clue.event : clue, null, 2),
    '',
    '用户刚才的纠正语音转写：',
    correctionTranscript,
    '',
    '要求：',
    '- 保持字段结构稳定',
    '- 优先修正年份、年龄、地点、人物、标题和描述',
    '- 不要把它改成偏好或情绪',
  ].join('\n')
}

function buildFallbackClue(clue: PendingClue, correctionTranscript: string): PendingClue {
  if (clue.kind === 'fact') {
    return {
      ...clue,
      sentence: correctionTranscript.trim() || clue.sentence,
      fact: {
        ...clue.fact,
        objectText: correctionTranscript.trim() || clue.fact.objectText,
        confidence: Math.min(0.95, Math.max(clue.fact.confidence, 0.72)),
      },
    }
  }

  return {
    ...clue,
    sentence: correctionTranscript.trim() || clue.sentence,
    event: {
      ...clue.event,
      description: correctionTranscript.trim() || clue.event.description,
      title: clue.event.title || correctionTranscript.trim() || '修正后的经历',
      confidence: Math.min(0.95, Math.max(clue.event.confidence, 0.72)),
    },
  }
}

export async function POST(request: Request) {
  if (!AI_API_KEY) {
    return jsonResponse({ error: 'Missing AI_API_KEY.' }, 503)
  }

  try {
    const body = (await request.json()) as {
      clue?: PendingClue
      correctionTranscript?: string
    }

    const clue = body.clue
    const correctionTranscript = body.correctionTranscript?.trim()

    if (!clue || !correctionTranscript) {
      return jsonResponse({ error: 'Clue and correctionTranscript are required.' }, 400)
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
            content: '你负责根据用户纠正后的语音内容，修正结构化记忆线索。只输出 JSON。',
          },
          {
            role: 'user',
            content: clue.kind === 'fact' ? buildFactPrompt(clue, correctionTranscript) : buildEventPrompt(clue, correctionTranscript),
          },
        ],
        response_format: {
          type: 'json_object',
        },
        temperature: 0.1,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      throw new Error(`Clue correction failed: ${errorText}`)
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
      throw new Error('Clue correction returned no structured content.')
    }

    const parsed = JSON.parse(text) as Record<string, unknown>

    if (clue.kind === 'fact') {
      const fact = parseFactCandidate(parsed.fact)
      return jsonResponse({
        clue: fact
          ? {
              ...clue,
              fact,
            }
          : buildFallbackClue(clue, correctionTranscript),
      } satisfies ClueCorrectionResult)
    }

    const event = parseEventCandidate(parsed.event)
    return jsonResponse({
      clue: event
        ? {
            ...clue,
            event,
          }
        : buildFallbackClue(clue, correctionTranscript),
    } satisfies ClueCorrectionResult)
  } catch (error) {
    console.error('Companion clue correction failed:', error)
    return jsonResponse({
      clue: null,
    } satisfies ClueCorrectionResult)
  }
}
