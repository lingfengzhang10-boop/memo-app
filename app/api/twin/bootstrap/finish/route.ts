import { NextResponse } from 'next/server'
import { CompanionProfile } from '@/types/companion'
import {
  TwinBootstrapAnswer,
  TwinBootstrapFinishResult,
  TwinExpressionSnapshot,
  TwinSeedCard,
} from '@/types/twin'
import { buildTwinExpressionSnapshot } from '@/lib/twinExpression'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
const CHAT_COMPLETIONS_ENDPOINT = `${AI_BASE_URL}/chat/completions`

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

function dedupe(values: string[], limit = 6) {
  return Array.from(
    new Set(
      values
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
}

function summarizeFacts(answers: TwinBootstrapAnswer[]) {
  return dedupe(
    answers.flatMap((answer) =>
      answer.extractedFacts.map((fact) => {
        const subject = typeof fact.subject === 'string' ? fact.subject : '我'
        const predicate = typeof fact.predicate === 'string' ? fact.predicate : ''
        const objectText = typeof fact.objectText === 'string' ? fact.objectText : ''
        return `${subject}${predicate}${objectText}`.trim()
      }),
    ),
    5,
  )
}

function summarizeEvents(answers: TwinBootstrapAnswer[]) {
  return dedupe(
    answers.flatMap((answer) =>
      answer.extractedEvents.map((event) => {
        const year = typeof event.year === 'number' ? `${event.year}年` : ''
        const title = typeof event.title === 'string' ? event.title : ''
        const description = typeof event.description === 'string' ? event.description : ''
        return `${year}${title || description}`.trim()
      }),
    ),
    5,
  )
}

function buildPromptSnapshot(
  twinName: string,
  personaSummary: string,
  voiceStyleSummary: string,
  responseStyle: string,
  factsPreview: string[],
  eventsPreview: string[],
  boundaryRules: string[],
  expression: TwinExpressionSnapshot,
) {
  return [
    `你是 ${twinName} 的初版数字分身。`,
    personaSummary,
    voiceStyleSummary ? `说话风格：${voiceStyleSummary}` : '',
    responseStyle ? `回应方式：${responseStyle}` : '',
    factsPreview.length > 0 ? `你已经确认的事实：${factsPreview.join('；')}` : '',
    eventsPreview.length > 0 ? `你已经确认的经历：${eventsPreview.join('；')}` : '',
    boundaryRules.length > 0 ? `边界与敏感点：${boundaryRules.join('；')}` : '',
    expression.summary ? `表达层摘要：${expression.summary}` : '',
    expression.phrasebook.length > 0 ? `代表性说法：${expression.phrasebook.join('；')}` : '',
    expression.comfortExamples.length > 0 ? `安慰别人时更像：${expression.comfortExamples.join('；')}` : '',
    expression.conflictExamples.length > 0 ? `表达不满时更像：${expression.conflictExamples.join('；')}` : '',
    expression.storytellingExamples.length > 0 ? `讲故事时更像：${expression.storytellingExamples.join('；')}` : '',
    expression.forbiddenPatterns.length > 0 ? `尽量避免这些 AI 腔：${expression.forbiddenPatterns.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildFallbackSeedCard(
  twinName: string,
  answers: TwinBootstrapAnswer[],
  profile: CompanionProfile,
): TwinSeedCard {
  const factsPreview = summarizeFacts(answers)
  const eventsPreview = summarizeEvents(answers)
  const coreValues = dedupe(
    [
      ...profile.memoryThemes,
      ...profile.lifeFacts,
      ...profile.relationshipMentions,
      ...factsPreview,
    ],
    4,
  )
  const boundaryRules = dedupe(
    answers.flatMap((answer) =>
      answer.extractedFacts
        .filter((fact) => typeof fact.predicate === 'string' && ['不喜欢', '害怕', '规则', '习惯'].includes(fact.predicate))
        .map((fact) => {
          const subject = typeof fact.subject === 'string' ? fact.subject : '我'
          const predicate = typeof fact.predicate === 'string' ? fact.predicate : ''
          const objectText = typeof fact.objectText === 'string' ? fact.objectText : ''
          return `${subject}${predicate}${objectText}`.trim()
        }),
    ),
    4,
  )

  const expression = buildTwinExpressionSnapshot(answers, profile)
  const personaSummary =
    profile.styleSummary ||
    `这是 ${twinName} 的初版分身。它已经掌握了一部分自我介绍、重要关系、关键经历和边界感，但仍然会继续成长。`
  const voiceStyleSummary =
    profile.pacing || profile.pauses
      ? `说话节奏：${[profile.pacing, profile.pauses].filter(Boolean).join('；')}`
      : '说话方式会优先沿用用户在建模访谈里表现出来的自然口语感。'
  const responseStyle =
    profile.twinNotes || '回答时优先像熟悉自己的人一样说话，尽量自然、口语化、贴近用户原有表达。'

  return {
    twinName,
    personaSummary,
    voiceStyleSummary,
    responseStyle,
    coreValues,
    boundaryRules,
    factsPreview,
    eventsPreview,
    expression,
    promptSnapshot: buildPromptSnapshot(
      twinName,
      personaSummary,
      voiceStyleSummary,
      responseStyle,
      factsPreview,
      eventsPreview,
      boundaryRules,
      expression,
    ),
    seedConfidence: 0.72,
    memoryReadinessScore: Math.min(100, 35 + answers.length * 5 + eventsPreview.length * 4 + factsPreview.length * 3),
    styleReadinessScore: Math.min(
      100,
      40 + profile.catchphrases.length * 4 + profile.lexicalHabits.length * 4 + expression.phrasebook.length * 2,
    ),
  }
}

function buildPrompt(twinName: string, answers: TwinBootstrapAnswer[], profile: CompanionProfile, fallback: TwinSeedCard) {
  return [
    '你是一个中文产品里的“数字分身生成器”。',
    '请根据一轮语音建模访谈的答案，生成一个初版分身卡。',
    '只返回 JSON，不要返回代码块，不要解释。',
    '',
    '返回字段：',
    '- twinName: string',
    '- personaSummary: string',
    '- voiceStyleSummary: string',
    '- responseStyle: string',
    '- coreValues: string[]',
    '- boundaryRules: string[]',
    '- factsPreview: string[]',
    '- eventsPreview: string[]',
    '- expression: { summary: string, speakingTraits: string[], phrasebook: string[], comfortExamples: string[], conflictExamples: string[], storytellingExamples: string[], forbiddenPatterns: string[] }',
    '- promptSnapshot: string',
    '- seedConfidence: number 0-1',
    '- memoryReadinessScore: integer 0-100',
    '- styleReadinessScore: integer 0-100',
    '',
    '要求：',
    '- 不要夸张，不要假装这个分身已经完全等同于真人。',
    '- 口吻要准确、克制、温和。',
    '- factsPreview 只放客观事实或偏好，不超过 5 条。',
    '- eventsPreview 只放关键经历，不超过 5 条。',
    '- boundaryRules 提炼出用户明确说过的不喜欢、害怕、需要被怎样对待。',
    '- expression 要尽量从真实回答里保留代表性句式和口语，而不是写成泛化的 AI 风格。',
    '- forbiddenPatterns 里放需要避免的泛 AI 表达。',
    '- promptSnapshot 用于后续分身对话，应当简洁、可执行。',
    '',
    `分身名字：${twinName}`,
    `当前聚合画像：${JSON.stringify(profile)}`,
    `访谈答案：${JSON.stringify(answers)}`,
    `如果不确定，请尽量接近这个 fallback：${JSON.stringify(fallback)}`,
  ].join('\n')
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

function cleanJsonCandidate(rawText: string) {
  return rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^\uFEFF/, '')
    .trim()
}

function extractJsonObjectCandidate(rawText: string) {
  const direct = cleanJsonCandidate(rawText)
  const firstBrace = direct.indexOf('{')
  const lastBrace = direct.lastIndexOf('}')

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return direct.slice(firstBrace, lastBrace + 1)
  }

  return direct
}

function normalizeLooseJson(rawText: string) {
  return extractJsonObjectCandidate(rawText)
    .replace(/,\s*([}\]])/g, '$1')
    .trim()
}

function parseSeedCardPayload(rawText: string) {
  const attempts = [cleanJsonCandidate(rawText), extractJsonObjectCandidate(rawText), normalizeLooseJson(rawText)]

  for (const attempt of attempts) {
    if (!attempt) {
      continue
    }

    try {
      return JSON.parse(attempt) as Record<string, unknown>
    } catch {
      continue
    }
  }

  return null
}

function sanitizeStringArray(value: unknown, limit = 6) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return dedupe(
    value.filter((entry): entry is string => typeof entry === 'string'),
    limit,
  )
}

function sanitizeExpression(value: unknown, fallback: TwinExpressionSnapshot): TwinExpressionSnapshot {
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const item = value as Record<string, unknown>

  return {
    summary:
      typeof item.summary === 'string' && item.summary.trim()
        ? item.summary.trim()
        : fallback.summary,
    speakingTraits: sanitizeStringArray(item.speakingTraits, 8).length > 0
      ? sanitizeStringArray(item.speakingTraits, 8)
      : fallback.speakingTraits,
    phrasebook: sanitizeStringArray(item.phrasebook, 8).length > 0
      ? sanitizeStringArray(item.phrasebook, 8)
      : fallback.phrasebook,
    comfortExamples: sanitizeStringArray(item.comfortExamples, 4).length > 0
      ? sanitizeStringArray(item.comfortExamples, 4)
      : fallback.comfortExamples,
    conflictExamples: sanitizeStringArray(item.conflictExamples, 4).length > 0
      ? sanitizeStringArray(item.conflictExamples, 4)
      : fallback.conflictExamples,
    storytellingExamples: sanitizeStringArray(item.storytellingExamples, 4).length > 0
      ? sanitizeStringArray(item.storytellingExamples, 4)
      : fallback.storytellingExamples,
    forbiddenPatterns: sanitizeStringArray(item.forbiddenPatterns, 8).length > 0
      ? sanitizeStringArray(item.forbiddenPatterns, 8)
      : fallback.forbiddenPatterns,
  }
}

function sanitizeSeedCard(value: unknown, fallback: TwinSeedCard): TwinSeedCard {
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const item = value as Record<string, unknown>
  const expression = sanitizeExpression(item.expression, fallback.expression)

  return {
    twinName: typeof item.twinName === 'string' && item.twinName.trim() ? item.twinName.trim() : fallback.twinName,
    personaSummary:
      typeof item.personaSummary === 'string' && item.personaSummary.trim()
        ? item.personaSummary.trim()
        : fallback.personaSummary,
    voiceStyleSummary:
      typeof item.voiceStyleSummary === 'string' && item.voiceStyleSummary.trim()
        ? item.voiceStyleSummary.trim()
        : fallback.voiceStyleSummary,
    responseStyle:
      typeof item.responseStyle === 'string' && item.responseStyle.trim()
        ? item.responseStyle.trim()
        : fallback.responseStyle,
    coreValues: sanitizeStringArray(item.coreValues, 6).length > 0 ? sanitizeStringArray(item.coreValues, 6) : fallback.coreValues,
    boundaryRules:
      sanitizeStringArray(item.boundaryRules, 6).length > 0 ? sanitizeStringArray(item.boundaryRules, 6) : fallback.boundaryRules,
    factsPreview:
      sanitizeStringArray(item.factsPreview, 5).length > 0 ? sanitizeStringArray(item.factsPreview, 5) : fallback.factsPreview,
    eventsPreview:
      sanitizeStringArray(item.eventsPreview, 5).length > 0 ? sanitizeStringArray(item.eventsPreview, 5) : fallback.eventsPreview,
    expression,
    promptSnapshot:
      typeof item.promptSnapshot === 'string' && item.promptSnapshot.trim()
        ? item.promptSnapshot.trim()
        : buildPromptSnapshot(
            typeof item.twinName === 'string' && item.twinName.trim() ? item.twinName.trim() : fallback.twinName,
            typeof item.personaSummary === 'string' && item.personaSummary.trim()
              ? item.personaSummary.trim()
              : fallback.personaSummary,
            typeof item.voiceStyleSummary === 'string' && item.voiceStyleSummary.trim()
              ? item.voiceStyleSummary.trim()
              : fallback.voiceStyleSummary,
            typeof item.responseStyle === 'string' && item.responseStyle.trim()
              ? item.responseStyle.trim()
              : fallback.responseStyle,
            sanitizeStringArray(item.factsPreview, 5).length > 0 ? sanitizeStringArray(item.factsPreview, 5) : fallback.factsPreview,
            sanitizeStringArray(item.eventsPreview, 5).length > 0 ? sanitizeStringArray(item.eventsPreview, 5) : fallback.eventsPreview,
            sanitizeStringArray(item.boundaryRules, 6).length > 0
              ? sanitizeStringArray(item.boundaryRules, 6)
              : fallback.boundaryRules,
            expression,
          ),
    seedConfidence:
      typeof item.seedConfidence === 'number' && !Number.isNaN(item.seedConfidence)
        ? Math.min(1, Math.max(0, item.seedConfidence))
        : fallback.seedConfidence,
    memoryReadinessScore:
      typeof item.memoryReadinessScore === 'number' && !Number.isNaN(item.memoryReadinessScore)
        ? Math.min(100, Math.max(0, Math.round(item.memoryReadinessScore)))
        : fallback.memoryReadinessScore,
    styleReadinessScore:
      typeof item.styleReadinessScore === 'number' && !Number.isNaN(item.styleReadinessScore)
        ? Math.min(100, Math.max(0, Math.round(item.styleReadinessScore)))
        : fallback.styleReadinessScore,
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      twinName?: string
      answers?: TwinBootstrapAnswer[]
      profile?: CompanionProfile
    }

    const twinName = body.twinName?.trim() || '我的分身'
    const answers = Array.isArray(body.answers) ? body.answers : []
    const profile =
      body.profile ||
      ({
        version: 1,
        sessions: 0,
        styleSummary: '',
        catchphrases: [],
        lexicalHabits: [],
        emotionalMarkers: [],
        storytellingPatterns: [],
        relationshipMentions: [],
        memoryThemes: [],
        lifeFacts: [],
        pacing: '',
        pauses: '',
        twinNotes: '',
        lastTranscript: '',
        lastUpdatedAt: '',
      } satisfies CompanionProfile)

    if (answers.length === 0) {
      return jsonResponse({ error: 'Bootstrap answers are required.' }, 400)
    }

    const fallback = buildFallbackSeedCard(twinName, answers, profile)

    if (!AI_API_KEY) {
      return jsonResponse({ seedCard: fallback } satisfies TwinBootstrapFinishResult)
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
            content: '你输出紧凑 JSON，不要输出代码块，不要额外解释。',
          },
          {
            role: 'user',
            content: buildPrompt(twinName, answers, profile, fallback),
          },
        ],
        response_format: {
          type: 'json_object',
        },
        temperature: 0.3,
        max_tokens: 1400,
      }),
    })

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      console.error('Twin bootstrap finish failed:', errorText)
      return jsonResponse({ seedCard: fallback } satisfies TwinBootstrapFinishResult)
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
      return jsonResponse({ seedCard: fallback } satisfies TwinBootstrapFinishResult)
    }

    const parsed = parseSeedCardPayload(text)
    if (!parsed) {
      console.warn('Twin bootstrap finish returned malformed JSON, using fallback seed card.')
      return jsonResponse({ seedCard: fallback } satisfies TwinBootstrapFinishResult)
    }

    const seedCard = sanitizeSeedCard(parsed, fallback)

    return jsonResponse({
      seedCard,
    } satisfies TwinBootstrapFinishResult)
  } catch (error) {
    console.error('Twin bootstrap finish route failed:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Twin bootstrap finish failed.' }, 500)
  }
}
