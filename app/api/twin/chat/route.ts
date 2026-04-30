import { NextResponse } from 'next/server'
import {
  buildMemoryUsePolicy,
  memoryUsePolicyToPromptLines,
} from '@/lib/memoryUsePolicy'
import { buildSituationalRoutingResult } from '@/lib/twinSituationalRouting'
import {
  extractAnchorsFromTopicKey,
  resolveTopicProgression,
  TopicProgressionResult,
} from '@/lib/twinTopicInteractions'
import { SemanticMemorySearchHit } from '@/types/semanticMemory'
import {
  TwinAnswerProgressionMode,
  TwinChatMessage,
  TwinExpressionSnapshot,
  TwinPersonaSnapshot,
  TwinTopicInteractionContext,
  TwinTopicInteractionRecencyBand,
} from '@/types/twin'

const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1'
const ANALYSIS_MODEL = process.env.AI_ANALYSIS_MODEL || 'Qwen/Qwen2.5-7B-Instruct'
const CHAT_COMPLETIONS_ENDPOINT = `${AI_BASE_URL}/chat/completions`
const ENABLE_SITUATIONAL_ROUTING = process.env.ENABLE_SITUATIONAL_TWIN_ROUTING !== 'false'

type TwinChatRequest = {
  twinName?: string
  promptSnapshot?: string
  personaSummary?: string
  voiceStyleSummary?: string
  responseStyle?: string
  coreValues?: string[]
  boundaryRules?: string[]
  factsSnapshot?: Array<Record<string, unknown>>
  eventsSnapshot?: Array<Record<string, unknown>>
  personaSnapshot?: TwinPersonaSnapshot
  expressionSnapshot?: TwinExpressionSnapshot
  semanticEvidence?: SemanticMemorySearchHit[]
  history?: TwinChatMessage[]
  message?: string
  messageSource?: 'text' | 'voice'
  messageTrustLevel?: 'stable' | 'guarded' | 'risky'
  messageRiskFlags?: string[]
  topicInteraction?: TwinTopicInteractionContext | null
}

type PromptInput = {
  twinName: string
  promptSnapshot: string
  personaSummary: string
  voiceStyleSummary: string
  responseStyle: string
  coreValues: string[]
  boundaryRules: string[]
  expression: TwinExpressionSnapshot | null
  answerMode: 'default' | 'situational'
  situationAnchors: string[]
  situationalQuery: string
  scopeLocked: boolean
  scopeSource: 'message' | 'inherited' | 'none'
  localFactLines: string[]
  localEventLines: string[]
  localConcernCandidates: string[]
  localEvidenceLines: string[]
  factLines: string[]
  eventLines: string[]
  semanticEvidence: SemanticMemorySearchHit[]
  globalFearCandidates: string[]
  fallbackReason: string
  messageSource: 'text' | 'voice'
  messageTrustLevel: 'stable' | 'guarded' | 'risky'
  messageRiskFlags: string[]
  topicKey: string
  topicRecencyBand: TwinTopicInteractionRecencyBand
  previousAnswerSummary: string
  previousAnswerAngle: string
  answerProgressionMode: TwinAnswerProgressionMode
  preferredAnswerAngle: string
  shouldAcknowledgePriorConversation: boolean
  previousUserQuestion: string
  isRepeatedQuestion: boolean
  memoryPolicyPrompts: string[]
}

type PromptPackets = {
  truthPacket: string[]
  dialoguePacket: string[]
  stylePacket: string[]
}

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

function dedupeStrings(values: string[], limit = 8) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
}

function normalizeConversationText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\u4e00-\u9fff]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function areQuestionsSimilar(left: string, right: string) {
  const a = normalizeConversationText(left)
  const b = normalizeConversationText(right)

  if (!a || !b) {
    return false
  }

  if (a === b || a.includes(b) || b.includes(a)) {
    return true
  }

  const aTokens = new Set(a.split(' ').filter(Boolean))
  const bTokens = new Set(b.split(' ').filter(Boolean))
  if (aTokens.size === 0 || bTokens.size === 0) {
    return false
  }

  let overlap = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1
    }
  }

  const ratio = overlap / Math.max(aTokens.size, bTokens.size)
  return ratio >= 0.6
}

function areRepliesTooSimilar(left: string, right: string) {
  const a = normalizeConversationText(left)
  const b = normalizeConversationText(right)

  if (!a || !b) {
    return false
  }

  if (a === b) {
    return true
  }

  const aTokens = new Set(a.split(' ').filter(Boolean))
  const bTokens = new Set(b.split(' ').filter(Boolean))
  if (aTokens.size === 0 || bTokens.size === 0) {
    return false
  }

  let overlap = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1
    }
  }

  const ratio = overlap / Math.max(aTokens.size, bTokens.size)
  return ratio >= 0.85
}

function readErrorPayload(response: Response) {
  return response.text().then((rawText) => {
    try {
      const parsed = JSON.parse(rawText) as {
        error?: { message?: string }
        message?: string
      }

      return parsed.error?.message || parsed.message || rawText
    } catch {
      return rawText
    }
  })
}

function sanitizeHistory(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as TwinChatMessage[]
  }

  return value
    .filter((item): item is TwinChatMessage => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Record<string, unknown>
      return (
        (candidate.role === 'user' || candidate.role === 'assistant') &&
        typeof candidate.content === 'string' &&
        candidate.content.trim().length > 0
      )
    })
    .slice(-6)
}

function toStringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit)
}

function sanitizeRecordArray(value: unknown, limit = 12) {
  if (!Array.isArray(value)) {
    return [] as Array<Record<string, unknown>>
  }

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
    .slice(0, limit)
}

function sanitizeExpression(value: unknown): TwinExpressionSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Record<string, unknown>
  return {
    summary: typeof item.summary === 'string' ? item.summary.trim() : '',
    speakingTraits: toStringArray(item.speakingTraits, 8),
    phrasebook: toStringArray(item.phrasebook, 8),
    comfortExamples: toStringArray(item.comfortExamples, 4),
    conflictExamples: toStringArray(item.conflictExamples, 4),
    storytellingExamples: toStringArray(item.storytellingExamples, 4),
    forbiddenPatterns: toStringArray(item.forbiddenPatterns, 8),
  }
}

function sanitizeSemanticEvidence(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as SemanticMemorySearchHit[]
  }

  return value
    .filter((item): item is SemanticMemorySearchHit => {
      if (!item || typeof item !== 'object') return false
      const candidate = item as Record<string, unknown>
      return (
        typeof candidate.chunkId === 'string' &&
        typeof candidate.memoryId === 'string' &&
        typeof candidate.excerpt === 'string' &&
        typeof candidate.score === 'number'
      )
    })
    .slice(0, 4)
}

function sanitizeTrustLevel(value: unknown) {
  return value === 'stable' || value === 'guarded' || value === 'risky' ? value : 'stable'
}

function sanitizeTopicInteraction(value: unknown): TwinTopicInteractionContext | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  const topicKey = typeof candidate.topicKey === 'string' ? candidate.topicKey.trim() : ''
  const askerKey = typeof candidate.askerKey === 'string' ? candidate.askerKey.trim() : ''

  if (!topicKey || !askerKey) {
    return null
  }

  const recencyBand =
    candidate.recencyBand === 'new' ||
    candidate.recencyBand === 'immediate' ||
    candidate.recencyBand === 'same_day' ||
    candidate.recencyBand === 'recent' ||
    candidate.recencyBand === 'stale'
      ? candidate.recencyBand
      : 'new'

  const lastAnswerMode =
    candidate.lastAnswerMode === 'fresh_answer' ||
    candidate.lastAnswerMode === 'deepen_answer' ||
    candidate.lastAnswerMode === 'diversify_answer' ||
    candidate.lastAnswerMode === 'graceful_close' ||
    candidate.lastAnswerMode === 'fuzzy_recall'
      ? candidate.lastAnswerMode
      : undefined

  return {
    topicKey,
    askerKey,
    recencyBand,
    discussCount: typeof candidate.discussCount === 'number' ? candidate.discussCount : 0,
    lastDiscussedAt: typeof candidate.lastDiscussedAt === 'string' ? candidate.lastDiscussedAt : undefined,
    lastAnswerSummary:
      typeof candidate.lastAnswerSummary === 'string' ? candidate.lastAnswerSummary : undefined,
    lastAnswerAngle:
      typeof candidate.lastAnswerAngle === 'string' ? candidate.lastAnswerAngle : undefined,
    lastAnswerMode,
    inheritedFromRecentTopic: Boolean(candidate.inheritedFromRecentTopic),
  }
}

function summarizeFacts(facts: Array<Record<string, unknown>>) {
  return facts
    .map((fact) => {
      const subject = typeof fact.subject === 'string' ? fact.subject : '我'
      const predicate = typeof fact.predicate === 'string' ? fact.predicate : ''
      const objectText =
        typeof fact.objectText === 'string'
          ? fact.objectText
          : typeof fact.object_text === 'string'
            ? fact.object_text
            : ''
      return `${subject}${predicate}${objectText}`.trim()
    })
    .filter(Boolean)
    .slice(0, 8)
}

function summarizeEvents(events: Array<Record<string, unknown>>) {
  return events
    .map((event) => {
      const year = typeof event.year === 'number' ? `${event.year}年 ` : ''
      const title = typeof event.title === 'string' ? event.title : ''
      const description = typeof event.description === 'string' ? event.description : ''
      return `${year}${title || description}`.trim()
    })
    .filter(Boolean)
    .slice(0, 8)
}

function summarizeSemanticEvidence(evidence: SemanticMemorySearchHit[]) {
  return evidence.map((item) => item.excerpt.trim()).filter(Boolean).slice(0, 4)
}

function summarizeSemanticEvidenceForPrompt(evidence: SemanticMemorySearchHit[]) {
  return evidence
    .map((item) => {
      const hints = dedupeStrings(
        [...item.reasons, ...item.personHints, ...item.placeHints, ...item.timeHints],
        3,
      ).join(' / ')
      return hints ? `${item.excerpt}（${hints}）` : item.excerpt
    })
    .filter(Boolean)
    .slice(0, 3)
}

function buildAnswerAngleCandidates(input: {
  answerMode: 'default' | 'situational'
  scopeLocked: boolean
  localConcernCandidates: string[]
  localFactLines: string[]
  localEventLines: string[]
  localEvidenceLines: string[]
  factLines: string[]
  eventLines: string[]
}) {
  if (input.answerMode === 'situational') {
    return dedupeStrings(
      [
        ...input.localConcernCandidates,
        ...input.localFactLines,
        ...input.localEventLines,
      ],
      6,
    )
  }

  if (input.scopeLocked) {
    return []
  }

  return dedupeStrings([...input.factLines, ...input.eventLines], 6)
}

function findMostRecentUserQuestion(history: TwinChatMessage[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (item.role === 'user') {
      return item.content.trim()
    }
  }

  return ''
}

function findMostRecentAssistantReply(history: TwinChatMessage[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (item.role === 'assistant') {
      return item.content.trim()
    }
  }

  return ''
}

function pickUncoveredAngle(candidates: string[], previousAssistantReply: string) {
  if (candidates.length <= 1) {
    return ''
  }

  const previous = normalizeConversationText(previousAssistantReply)
  if (!previous) {
    return candidates[0] || ''
  }

  return (
    candidates.find((candidate) => {
      const normalizedCandidate = normalizeConversationText(candidate)
      return normalizedCandidate && !previous.includes(normalizedCandidate)
    }) || ''
  )
}

function applyRepeatedQuestionOverride(input: {
  message: string
  previousUserQuestion: string
  previousAssistantReply: string
  angleCandidates: string[]
  progression: TopicProgressionResult
}) {
  const isRepeatedQuestion =
    Boolean(input.previousUserQuestion) &&
    areQuestionsSimilar(input.message, input.previousUserQuestion)

  if (!isRepeatedQuestion) {
    return {
      isRepeatedQuestion: false,
      progression: input.progression,
    }
  }

  if (input.angleCandidates.length <= 1) {
    return {
      isRepeatedQuestion: true,
      progression: {
        answerProgressionMode: 'graceful_close',
        preferredAngle: input.progression.preferredAngle || input.angleCandidates[0] || '',
        shouldAcknowledgePriorConversation: true,
      } satisfies TopicProgressionResult,
    }
  }

  const alternativeAngle = pickUncoveredAngle(input.angleCandidates, input.previousAssistantReply)

  return {
    isRepeatedQuestion: true,
    progression: {
      answerProgressionMode: alternativeAngle ? 'diversify_answer' : 'graceful_close',
      preferredAngle:
        alternativeAngle ||
        input.progression.preferredAngle ||
        input.angleCandidates[0] ||
        '',
      shouldAcknowledgePriorConversation: true,
    } satisfies TopicProgressionResult,
  }
}

function describeRecencyBand(
  recencyBand: TwinTopicInteractionRecencyBand,
  shouldAcknowledge: boolean,
) {
  if (!shouldAcknowledge || recencyBand === 'new') {
    return ''
  }

  if (recencyBand === 'immediate') {
    return 'The same asker is following up on the same topic moments later.'
  }

  if (recencyBand === 'same_day') {
    return 'The same asker brought up this topic earlier today.'
  }

  if (recencyBand === 'recent') {
    return 'The same asker discussed this topic in the last few days.'
  }

  return 'This topic was discussed before, but not recently enough for a crisp reminder.'
}

function describeProgressionMode(
  progressionMode: TwinAnswerProgressionMode,
  preferredAngle: string,
  previousAngle: string,
  isRepeatedQuestion: boolean,
) {
  if (isRepeatedQuestion) {
    return previousAngle
      ? `The asker is repeating essentially the same question. Briefly acknowledge that this angle was just discussed, then either add one small grounded nuance or summarize in one shorter line around: ${previousAngle}.`
      : 'The asker is repeating essentially the same question. Briefly acknowledge that, then answer more compactly instead of redoing the whole prior answer.'
  }

  switch (progressionMode) {
    case 'deepen_answer':
      return preferredAngle
        ? `Build on the same topic with a new grounded facet, preferably around: ${preferredAngle}. Do not restate the previous angle line by line.`
        : 'Build on the same topic with one additional grounded facet. Do not restate the previous answer line by line.'
    case 'diversify_answer':
      return preferredAngle
        ? `Shift to a different grounded angle inside the same topic. Prefer this angle: ${preferredAngle}.`
        : 'Shift to a different grounded angle inside the same topic instead of repeating the last answer.'
    case 'graceful_close':
      return previousAngle
        ? `The strongest grounded point is still ${previousAngle}. Acknowledge that briefly and close naturally without repeating it sentence by sentence.`
        : 'No clearly new grounded angle is available. Close briefly and honestly instead of repeating yourself.'
    case 'fuzzy_recall':
      return preferredAngle
        ? `Use a light, natural sense of recall. Re-enter the topic through: ${preferredAngle}.`
        : 'Use a light, natural sense of recall. Do not sound like a reminder app or a log.'
    default:
      return preferredAngle
        ? `Answer directly and naturally. A useful angle for this turn is: ${preferredAngle}.`
        : 'Answer directly and naturally.'
  }
}

function buildTruthPacket(input: PromptInput) {
  const truthPacket: string[] = [
    `Twin identity: ${input.twinName}`,
    'Confirmed truth outranks raw evidence. Raw evidence can add texture, but it cannot create new people, events, or life facts.',
  ]

  if (input.answerMode === 'situational') {
    if (input.scopeLocked) {
      truthPacket.push(
        'This turn is locked to the current topic scope. Stay inside these anchors and do not pull in unrelated habits, hobbies, foods, or other global memories.',
      )
    }
    if (input.situationAnchors.length > 0) {
      truthPacket.push(`Current situational anchors: ${input.situationAnchors.join(' / ')}`)
    }
    if (input.localConcernCandidates.length > 0) {
      truthPacket.push(`Most grounded situational concerns: ${input.localConcernCandidates.join(' / ')}`)
    }
    if (input.localFactLines.length > 0) {
      truthPacket.push(`Confirmed facts for this situation: ${input.localFactLines.join(' / ')}`)
    }
    if (input.localEventLines.length > 0) {
      truthPacket.push(`Confirmed events for this situation: ${input.localEventLines.join(' / ')}`)
    }

    const localEvidence = summarizeSemanticEvidenceForPrompt(
      input.semanticEvidence.filter((item) =>
        input.localEvidenceLines.some((line) => item.excerpt.trim() === line.trim()),
      ),
    )

    if (localEvidence.length > 0) {
      truthPacket.push(`Raw evidence that may add texture: ${localEvidence.join(' | ')}`)
    }

    if (
      input.globalFearCandidates.length > 0 &&
      input.localConcernCandidates.length === 0 &&
      input.localFactLines.length === 0 &&
      input.localEventLines.length === 0
    ) {
      truthPacket.push(
        `Global fallback truths only if local evidence stays thin: ${input.globalFearCandidates.join(' / ')}`,
      )
    }
  } else {
    if (input.factLines.length > 0) {
      truthPacket.push(`Confirmed facts: ${input.factLines.join(' / ')}`)
    }
    if (input.eventLines.length > 0) {
      truthPacket.push(`Confirmed events: ${input.eventLines.join(' / ')}`)
    }
    const globalEvidence = summarizeSemanticEvidenceForPrompt(input.semanticEvidence)
    if (globalEvidence.length > 0) {
      truthPacket.push(`Raw evidence that may add texture: ${globalEvidence.join(' | ')}`)
    }
  }

  if (input.messageSource === 'voice' && input.messageTrustLevel !== 'stable') {
    truthPacket.push(
      'The latest user turn came from a stabilized voice transcript. Mirror the grounded core meaning conservatively. Do not amplify it into new stories, social scenes, or playful flourishes.',
    )
  }

  if (input.messageSource === 'voice' && input.messageRiskFlags.length > 0) {
    truthPacket.push(`Voice risk signals: ${input.messageRiskFlags.join(', ')}`)
  }

  return truthPacket
}

function buildDialoguePacket(input: PromptInput) {
  const dialoguePacket: string[] = []

  if (input.answerMode === 'situational') {
    dialoguePacket.push(
      'Answer inside the current time/place/person context first. Do not jump to a broad lifelong label if the question is clearly about a particular period.',
    )
    if (input.scopeLocked) {
      dialoguePacket.push(
        'The latest user turn is a follow-up inside the same topic. Continue only within the existing topic scope; do not widen the scope to unrelated memories.',
      )
    }
  }

  if (input.situationalQuery) {
    dialoguePacket.push(`Current user question focus: ${input.situationalQuery}`)
  }

  const recencyHint = describeRecencyBand(
    input.topicRecencyBand,
    input.shouldAcknowledgePriorConversation,
  )
  if (recencyHint) {
    dialoguePacket.push(recencyHint)
  }

  if (input.previousAnswerSummary) {
    dialoguePacket.push(`Previous answer summary on this topic: ${input.previousAnswerSummary}`)
  }

  if (input.previousUserQuestion) {
    dialoguePacket.push(`Most recent user wording on this topic: ${input.previousUserQuestion}`)
  }

  if (input.previousAnswerAngle) {
    dialoguePacket.push(`Previously centered angle: ${input.previousAnswerAngle}`)
  }

  dialoguePacket.push(
    describeProgressionMode(
      input.answerProgressionMode,
      input.preferredAnswerAngle,
      input.previousAnswerAngle,
      input.isRepeatedQuestion,
    ),
  )

  if (input.memoryPolicyPrompts.length > 0) {
    dialoguePacket.push(...input.memoryPolicyPrompts)
  }

  if (input.fallbackReason) {
    dialoguePacket.push(`If grounded detail stays thin, fall back carefully because: ${input.fallbackReason}`)
  }

  dialoguePacket.push(
    'Sound like a person continuing a conversation, not like a memory engine reciting records.',
  )

  return dialoguePacket
}

function buildStylePacket(input: PromptInput) {
  const stylePacket: string[] = [
    'Speak naturally, in ordinary conversational Chinese unless the user clearly switches language.',
    'Answer the current question first, then add at most one or two grounded supporting details.',
    'Do not expose internal routing, recency bands, progression modes, or debugging concepts.',
    'If there is no clearly new grounded angle, say so naturally and briefly instead of repeating the same sentence.',
  ]

  const shouldMinimizeGlobalPersona =
    input.answerMode === 'situational' || input.scopeLocked

  if (!shouldMinimizeGlobalPersona && input.personaSummary) {
    stylePacket.push(`Persona summary: ${input.personaSummary}`)
  }
  if (!shouldMinimizeGlobalPersona && input.voiceStyleSummary) {
    stylePacket.push(`Voice and tone: ${input.voiceStyleSummary}`)
  }
  if (!shouldMinimizeGlobalPersona && input.responseStyle) {
    stylePacket.push(`Response style: ${input.responseStyle}`)
  }
  if (!shouldMinimizeGlobalPersona && input.coreValues.length > 0) {
    stylePacket.push(`Core values: ${input.coreValues.join(' / ')}`)
  }
  if (!shouldMinimizeGlobalPersona && input.boundaryRules.length > 0) {
    stylePacket.push(`Boundary rules: ${input.boundaryRules.join(' / ')}`)
  }
  if (!shouldMinimizeGlobalPersona && input.expression?.summary) {
    stylePacket.push(`Recent expression drift to preserve: ${input.expression.summary}`)
  }
  if (!shouldMinimizeGlobalPersona && input.expression?.speakingTraits?.length) {
    stylePacket.push(
      `Speaking traits: ${input.expression.speakingTraits.slice(0, 4).join(' / ')}`,
    )
  }
  if (!shouldMinimizeGlobalPersona && input.expression?.phrasebook?.length) {
    stylePacket.push(`Common phrasing: ${input.expression.phrasebook.slice(0, 4).join(' / ')}`)
  }
  if (!shouldMinimizeGlobalPersona && input.expression?.forbiddenPatterns?.length) {
    stylePacket.push(
      `Avoid these patterns: ${input.expression.forbiddenPatterns.slice(0, 4).join(' / ')}`,
    )
  }
  if (!shouldMinimizeGlobalPersona && input.promptSnapshot && !input.scopeLocked) {
    stylePacket.push(`Additional prompt snapshot: ${input.promptSnapshot}`)
  }

  return stylePacket
}

function buildPromptPackets(input: PromptInput): PromptPackets {
  return {
    truthPacket: buildTruthPacket(input),
    dialoguePacket: buildDialoguePacket(input),
    stylePacket: buildStylePacket(input),
  }
}

function buildSystemPrompt(input: PromptInput, packets: PromptPackets) {
  return [
    `You are roleplaying the user's digital twin "${input.twinName}".`,
    'Your job is to stay grounded in the supplied truth packet, then answer in a natural, human way.',
    '',
    'Non-negotiable boundaries:',
    '- Confirmed truth outranks raw evidence.',
    '- Raw evidence can add texture, but it cannot invent new people, new social activities, or new life events.',
    '- When the latest voice transcript is guarded or risky, answer conservatively and do not embellish.',
    '- Never sound like a reminder app, a database dump, or an AI policy block.',
    '',
    'TRUTH PACKET:',
    ...packets.truthPacket.map((line) => `- ${line}`),
    '',
    'DIALOGUE PACKET:',
    ...packets.dialoguePacket.map((line) => `- ${line}`),
    '',
    'STYLE PACKET:',
    ...packets.stylePacket.map((line) => `- ${line}`),
  ].join('\n')
}

function buildFewShotMessages() {
  return [
    {
      role: 'user' as const,
      content: '我在杭州那几年挺难的。',
    },
    {
      role: 'assistant' as const,
      content: '挺难的，最压着我的还是收入不稳。那时候心里一直是悬着的。',
    },
    {
      role: 'user' as const,
      content: '还有什么让你印象深的吗？',
    },
    {
      role: 'assistant' as const,
      content: '除了收入不稳，更深的还有家里那种托住我的感觉。妈妈总会打电话来，让我别一个人硬扛。',
    },
    {
      role: 'user' as const,
      content: '你上午不是也说到杭州那段吗？',
    },
    {
      role: 'assistant' as const,
      content: '嗯，我记得今天聊到过这段。现在再想，除了收入压力，还有刚到新地方时那种站不稳的迷茫。',
    },
    {
      role: 'user' as const,
      content: '再说说杭州那段。',
    },
    {
      role: 'assistant' as const,
      content: '我记得你之前好像问过这段。要是现在重新说，最深的还是不稳定带来的悬着感。',
    },
    {
      role: 'user' as const,
      content: '还有别的吗？',
    },
    {
      role: 'assistant' as const,
      content: '这会儿最先浮上来的还是刚才那两点。要再往下说，我暂时没想起更新的了。',
    },
  ]
}

function buildFallbackReply(
  twinName: string,
  message: string,
  facts: string[],
  events: string[],
  expression: TwinExpressionSnapshot | null,
  situational?: {
    answerMode: 'default' | 'situational'
    localConcernCandidates: string[]
  },
  progression?: {
    answerProgressionMode: TwinAnswerProgressionMode
    preferredAngle: string
    shouldAcknowledgePriorConversation: boolean
  },
) {
  if (progression?.answerProgressionMode === 'graceful_close') {
    const focus = progression.preferredAngle || situational?.localConcernCandidates[0] || ''
    return focus
      ? `${twinName}，刚才最核心的还是${focus}。这会儿我暂时没想起更新的了。`
      : `${twinName}，刚才最深的基本就是那一层了，这会儿我暂时没想起新的。`
  }

  if (progression?.answerProgressionMode === 'fuzzy_recall' && progression.shouldAcknowledgePriorConversation) {
    const focus =
      progression.preferredAngle || situational?.localConcernCandidates[0] || facts[0] || events[0] || ''
    return focus
      ? `${twinName}，我记得你之前好像问过这段。现在再想，最深的还是${focus}。`
      : `${twinName}，我记得你之前好像提过这段，现在先浮上来的还是刚才那条线。`
  }

  if (situational?.answerMode === 'situational' && situational.localConcernCandidates.length > 0) {
    return `${twinName}，那段时间更像是在扛着${situational.localConcernCandidates[0]}。`
  }

  const firstMemoryHint = [...facts, ...events][0]
  if (firstMemoryHint) {
    return `${twinName}，我先顺着你这句接住。现在最先浮上来的还是${firstMemoryHint}。`
  }

  if (expression?.phrasebook?.length) {
    return `${twinName}，我先接住你这句。现在一下子最先浮上来的，还是${expression.phrasebook[0]}那种说法。`
  }

  return `${twinName}，我听见你刚才这句了。你可以继续往下说，我会顺着这条线接你。`
}

function buildRepeatedReplyOverride(
  twinName: string,
  progression: {
    answerProgressionMode: TwinAnswerProgressionMode
    preferredAngle: string
  },
  previousAngle: string,
) {
  if (progression.answerProgressionMode === 'graceful_close') {
    return previousAngle
      ? `${twinName}，刚才最核心的还是${previousAngle}。要是现在再说，我暂时没想起更新的了。`
      : `${twinName}，这会儿我没想起更新的了，最深的还是刚才那一层。`
  }

  if (progression.preferredAngle && progression.preferredAngle !== previousAngle) {
    return `${twinName}，如果换个角度说，更深的还有${progression.preferredAngle}。`
  }

  return previousAngle
    ? `${twinName}，要是顺着刚才那条线接，最核心的还是${previousAngle}。`
    : `${twinName}，刚才说到的那个点已经是这会儿最先浮上来的了。`
}

function compressAnswerAngleNatural(value: string) {
  const raw = value.trim()
  if (!raw) {
    return ''
  }

  const normalized = raw
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\d{4}年[，,、\s]*/u, '')
    .replace(/^(?:如果换个角度说|更深的还有|最难忘的是|最核心的还是|更像是在扛着)\s*/u, '')
    .trim()

  const clauses = normalized
    .split(/[。！？!?；;\n]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((item) =>
      item
        .replace(/^\d{4}年[，,、\s]*/u, '')
        .replace(/^(?:我搬到杭州之后|搬到杭州之后|在杭州那段时间|那时候|后来|然后|我记得|我最难忘的是)\s*/u, '')
        .replace(/^的/u, '')
        .trim(),
    )
    .filter(Boolean)

  return clauses.join('，') || normalized
}

function buildFallbackReplyNatural(
  twinName: string,
  message: string,
  facts: string[],
  events: string[],
  expression: TwinExpressionSnapshot | null,
  situational?: {
    answerMode: 'default' | 'situational'
    localConcernCandidates: string[]
  },
  progression?: {
    answerProgressionMode: TwinAnswerProgressionMode
    preferredAngle: string
    shouldAcknowledgePriorConversation: boolean
  },
) {
  const focus = compressAnswerAngleNatural(
    progression?.preferredAngle || situational?.localConcernCandidates[0] || facts[0] || events[0] || '',
  )

  if (progression?.answerProgressionMode === 'graceful_close') {
    return focus
      ? `${twinName}，刚才最深的还是${focus}。这会儿我暂时没想起更多新的了。`
      : `${twinName}，刚才最深的大概就是那一层了，这会儿我暂时没想起更多新的。`
  }

  if (progression?.answerProgressionMode === 'fuzzy_recall' && progression.shouldAcknowledgePriorConversation) {
    return focus
      ? `${twinName}，我记得你之前好像问过这段。现在再想，最深的还是${focus}。`
      : `${twinName}，我记得你之前好像提过这段，现在最先浮上来的还是刚才那条线。`
  }

  if (situational?.answerMode === 'situational' && situational.localConcernCandidates.length > 0) {
    return focus
      ? `${twinName}，那段时间更像是在扛着${focus}。`
      : `${twinName}，那段时间更像是在硬扛着一些悬着的东西。`
  }

  if (focus) {
    return `${twinName}，我先顺着你这句接住。现在最先浮上来的还是${focus}。`
  }

  if (expression?.phrasebook?.length) {
    return `${twinName}，我先接住你这句。现在一下子最先浮上来的，还是${expression.phrasebook[0]}那种说法。`
  }

  return `${twinName}，我听见你刚才这句了。你可以继续往下说，我会顺着这条线接你。`
}

function buildRepeatedReplyOverrideNatural(
  twinName: string,
  progression: {
    answerProgressionMode: TwinAnswerProgressionMode
    preferredAngle: string
  },
  previousAngle: string,
) {
  const nextFocus = compressAnswerAngleNatural(progression.preferredAngle)
  const previousFocus = compressAnswerAngleNatural(previousAngle)

  if (progression.answerProgressionMode === 'graceful_close') {
    return previousFocus
      ? `${twinName}，刚才最核心的还是${previousFocus}。这会儿我暂时没想起更多新的了。`
      : `${twinName}，这会儿我没想起更多新的了，最深的还是刚才那一层。`
  }

  if (nextFocus && nextFocus !== previousFocus) {
    return `${twinName}，如果换个角度说，更深一点的还有${nextFocus}。`
  }

  return previousFocus
    ? `${twinName}，要是顺着刚才那条线接，最核心的还是${previousFocus}。`
    : `${twinName}，刚才说到的那个点已经是这会儿最先浮上来的了。`
}

function buildFewShotMessagesClean() {
  return [
    {
      role: 'user' as const,
      content: '我在杭州那几年挺难的。',
    },
    {
      role: 'assistant' as const,
      content: '挺难的。那时候最压着我的还是收入不稳定，心里一直是悬着的。',
    },
    {
      role: 'user' as const,
      content: '还有什么让你印象深的吗？',
    },
    {
      role: 'assistant' as const,
      content: '除了收入不稳，更深一点的是家里那种托住我的感觉。妈妈常打电话来，让我别一个人硬扛。',
    },
    {
      role: 'user' as const,
      content: '你上午不是也说到杭州那段吗？',
    },
    {
      role: 'assistant' as const,
      content: '嗯，我记得今天聊到过这段。现在再想，除了收入压力，还有刚到新地方时那种站不稳的迷茫。',
    },
    {
      role: 'user' as const,
      content: '再说说杭州那段。',
    },
    {
      role: 'assistant' as const,
      content: '我记得你之前好像问过这段。要是现在重新说，最深的还是那种不稳定带来的悬着感。',
    },
    {
      role: 'user' as const,
      content: '还有别的吗？',
    },
    {
      role: 'assistant' as const,
      content: '这会儿最先浮上来的还是刚才那几层。要再往下说，我暂时没想起更新的了。',
    },
  ]
}

function compressAnswerAngleClean(value: string) {
  const raw = value.trim()
  if (!raw) {
    return ''
  }

  const normalized = raw
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\d{4}年[,，、\s]*/u, '')
    .replace(
      /^(?:如果换个角度说，更深的还有|更深一点的是|最深的还是|最难忘的是|更像是在扛着|那段时间更像是在扛着)\s*/u,
      '',
    )
    .trim()

  const clauses = normalized
    .split(/[。！？!?；;\n]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((item) =>
      item
        .replace(/^\d{4}年[,，、\s]*/u, '')
        .replace(
          /^(?:我搬到杭州之后|搬到杭州之后|在杭州那段时间|那时候|后来|然后|我记得|我最难忘的是)\s*/u,
          '',
        )
        .replace(/^的/u, '')
        .trim(),
    )
    .filter(Boolean)

  return clauses.join('，') || normalized
}

function buildFallbackReplyClean(
  twinName: string,
  message: string,
  facts: string[],
  events: string[],
  expression: TwinExpressionSnapshot | null,
  situational?: {
    answerMode: 'default' | 'situational'
    localConcernCandidates: string[]
  },
  progression?: {
    answerProgressionMode: TwinAnswerProgressionMode
    preferredAngle: string
    shouldAcknowledgePriorConversation: boolean
  },
) {
  const focus = compressAnswerAngleClean(
    progression?.preferredAngle || situational?.localConcernCandidates[0] || facts[0] || events[0] || '',
  )

  if (progression?.answerProgressionMode === 'graceful_close') {
    return '这会儿最先浮上来的还是刚才那一层，暂时没想起更多新的了。'
  }

  if (progression?.answerProgressionMode === 'fuzzy_recall' && progression.shouldAcknowledgePriorConversation) {
    return focus
      ? `我记得你之前好像问过这段。现在再想，最深的还是${focus}。`
      : '我记得你之前好像提过这段，现在最先浮上来的还是刚才那条线。'
  }

  if (situational?.answerMode === 'situational' && situational.localConcernCandidates.length > 0) {
    return focus
      ? `那段时间更像是在扛着${focus}。`
      : '那段时间更像是在硬扛着一些悬着的东西。'
  }

  if (focus) {
    return `我先顺着你这句接住。现在最先浮上来的还是${focus}。`
  }

  if (expression?.phrasebook?.length) {
    return `我先接住你这句。现在一下子最先浮上来的，还是${expression.phrasebook[0]}那种说法。`
  }

  return '我先接住你这句。你可以继续往下说，我会顺着这条线接你。'
}

function buildRepeatedReplyOverrideClean(
  twinName: string,
  progression: {
    answerProgressionMode: TwinAnswerProgressionMode
    preferredAngle: string
  },
  previousAngle: string,
) {
  const nextFocus = compressAnswerAngleClean(progression.preferredAngle)
  const previousFocus = compressAnswerAngleClean(previousAngle)

  if (progression.answerProgressionMode === 'graceful_close') {
    return '这会儿最先浮上来的还是刚才那一层，暂时没想起更多新的了。'
  }

  if (nextFocus && nextFocus !== previousFocus) {
    return `如果换个角度说，更深一点的还有${nextFocus}。`
  }

  return previousFocus
    ? '顺着刚才那条线往下接，最深的还是那一层。'
    : '刚才说到的那个点，已经是这会儿最先浮上来的了。'
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TwinChatRequest

    const twinName = body.twinName?.trim() || '分身'
    const promptSnapshot = body.promptSnapshot?.trim() || ''
    const personaSnapshot = (body.personaSnapshot ?? {}) as TwinPersonaSnapshot
    const personaSummary =
      body.personaSummary?.trim() ||
      (typeof personaSnapshot.summary === 'string' ? personaSnapshot.summary.trim() : '')
    const voiceStyleSummary =
      body.voiceStyleSummary?.trim() ||
      (typeof personaSnapshot.voiceStyleSummary === 'string'
        ? personaSnapshot.voiceStyleSummary.trim()
        : '')
    const responseStyle =
      body.responseStyle?.trim() ||
      (typeof personaSnapshot.responseStyle === 'string'
        ? personaSnapshot.responseStyle.trim()
        : '')
    const coreValues = toStringArray(body.coreValues ?? personaSnapshot.coreValues, 6)
    const boundaryRules = toStringArray(body.boundaryRules ?? personaSnapshot.boundaryRules, 6)
    const factsSnapshot = sanitizeRecordArray(body.factsSnapshot, 12)
    const eventsSnapshot = sanitizeRecordArray(body.eventsSnapshot, 12)
    const semanticEvidence = sanitizeSemanticEvidence(body.semanticEvidence)
    const history = sanitizeHistory(body.history)
    const message = body.message?.trim()
    const messageSource = body.messageSource === 'voice' ? 'voice' : 'text'
    const messageTrustLevel = sanitizeTrustLevel(body.messageTrustLevel)
    const messageRiskFlags = toStringArray(body.messageRiskFlags, 8)
    const topicInteraction = sanitizeTopicInteraction(body.topicInteraction)
    const expression =
      sanitizeExpression(body.expressionSnapshot) ||
      sanitizeExpression(personaSnapshot.expression) ||
      null

    if (!message) {
      return jsonResponse({ error: 'Message is required.' }, 400)
    }

    const routing = buildSituationalRoutingResult({
      message,
      history: history.filter((item) => item.role === 'user').map((item) => item.content),
      facts: factsSnapshot,
      events: eventsSnapshot,
      semanticEvidence,
      enabled: ENABLE_SITUATIONAL_ROUTING,
      inheritedAnchors:
        topicInteraction?.inheritedFromRecentTopic && topicInteraction.topicKey
          ? extractAnchorsFromTopicKey(topicInteraction.topicKey)
          : [],
      lockScopeToAnchors: Boolean(topicInteraction?.inheritedFromRecentTopic),
    })

    const factLines = summarizeFacts(factsSnapshot)
    const eventLines = summarizeEvents(eventsSnapshot)
    const localFactLines = summarizeFacts(routing.localFacts)
    const localEventLines = summarizeEvents(routing.localEvents)
    const localEvidenceLines = summarizeSemanticEvidence(routing.localSemanticEvidence)
    const angleCandidates = buildAnswerAngleCandidates({
      answerMode: routing.answerMode,
      scopeLocked: routing.scopeLocked,
      localConcernCandidates: routing.localConcernCandidates,
      localFactLines,
      localEventLines,
      localEvidenceLines,
      factLines,
      eventLines,
    })
    const progression = resolveTopicProgression({
      interaction: topicInteraction,
      angleCandidates,
    })
    const previousUserQuestion = findMostRecentUserQuestion(history)
    const previousAssistantReply = findMostRecentAssistantReply(history)
    const repeatedQuestionState = applyRepeatedQuestionOverride({
      message,
      previousUserQuestion,
      previousAssistantReply,
      angleCandidates,
      progression,
    })
    const resolvedProgression = repeatedQuestionState.progression
    const resolvedTopicRecencyBand =
      topicInteraction?.recencyBand || (repeatedQuestionState.isRepeatedQuestion ? 'immediate' : 'new')
    const memoryUsePolicy = buildMemoryUsePolicy({
      message,
      messageSource,
      messageTrustLevel,
      messageRiskFlags,
      routing,
      facts: factsSnapshot,
      events: eventsSnapshot,
      semanticEvidence,
      topicInteraction,
      previousAssistantReply,
      progression: resolvedProgression,
      isRepeatedQuestion: repeatedQuestionState.isRepeatedQuestion,
    })
    const policyFactLines = dedupeStrings(
      memoryUsePolicy.allowedMemoryItems
        .filter((item) => item.kind === 'fact')
        .map((item) => item.text),
      8,
    )
    const policyEventLines = dedupeStrings(
      memoryUsePolicy.allowedMemoryItems
        .filter((item) => item.kind === 'event')
        .map((item) => item.text),
      8,
    )
    const policyEvidenceLines = dedupeStrings(
      memoryUsePolicy.allowedMemoryItems
        .filter((item) => item.kind === 'semantic')
        .map((item) => item.text),
      8,
    )
    const policyConcernCandidates = dedupeStrings(
      memoryUsePolicy.allowedMemoryItems
        .filter((item) => item.concernLike)
        .map((item) => item.text),
      6,
    )
    const policySemanticIds = new Set(
      memoryUsePolicy.allowedMemoryItems
        .filter((item) => item.kind === 'semantic')
        .map((item) => item.id),
    )
    const policySemanticEvidence = semanticEvidence.filter((item) =>
      policySemanticIds.has(item.chunkId),
    )
    const finalProgression = {
      ...resolvedProgression,
      answerProgressionMode: memoryUsePolicy.answerProgressionMode,
      preferredAngle: memoryUsePolicy.preferredAnswerAngle || resolvedProgression.preferredAngle,
    }
    const memoryPolicyPrompts = memoryUsePolicyToPromptLines(memoryUsePolicy)

    const promptInput: PromptInput = {
      twinName,
      promptSnapshot,
      personaSummary,
      voiceStyleSummary,
      responseStyle,
      coreValues,
      boundaryRules,
      expression,
      answerMode: routing.answerMode,
      situationAnchors: routing.situationAnchors,
      situationalQuery: routing.situationalQuery,
      scopeLocked: routing.scopeLocked,
      scopeSource: routing.scopeSource,
      localFactLines: policyFactLines,
      localEventLines: policyEventLines,
      localConcernCandidates: policyConcernCandidates,
      localEvidenceLines: policyEvidenceLines,
      factLines: policyFactLines,
      eventLines: policyEventLines,
      semanticEvidence: policySemanticEvidence,
      globalFearCandidates: policyConcernCandidates,
      fallbackReason: routing.fallbackReason || '',
      messageSource,
      messageTrustLevel,
      messageRiskFlags,
      topicKey: topicInteraction?.topicKey || '',
      topicRecencyBand: resolvedTopicRecencyBand,
      previousAnswerSummary: topicInteraction?.lastAnswerSummary || previousAssistantReply,
      previousAnswerAngle: topicInteraction?.lastAnswerAngle || '',
      answerProgressionMode: finalProgression.answerProgressionMode,
      preferredAnswerAngle: finalProgression.preferredAngle,
      shouldAcknowledgePriorConversation: finalProgression.shouldAcknowledgePriorConversation,
      previousUserQuestion,
      isRepeatedQuestion: repeatedQuestionState.isRepeatedQuestion,
      memoryPolicyPrompts,
    }

    const promptPackets = buildPromptPackets(promptInput)

    const debug = {
      answerMode: routing.answerMode,
      situationAnchors: routing.situationAnchors,
      fallbackReason: routing.fallbackReason || '',
      situationalQuery: routing.situationalQuery,
      messageSource,
      messageTrustLevel,
      messageRiskFlags,
      localConcernCandidates: policyConcernCandidates,
      globalFearCandidates: routing.globalFearCandidates,
      scopeLockedFromTopicInteraction: routing.scopeLocked,
      scopeSource: routing.scopeSource,
      topicKey: topicInteraction?.topicKey || '',
      askerScope:
        topicInteraction && topicInteraction.recencyBand !== 'new'
          ? 'same_asker'
          : repeatedQuestionState.isRepeatedQuestion
            ? 'same_session'
          : 'fresh_for_asker',
      topicRecencyBand: resolvedTopicRecencyBand,
      answerProgressionMode: finalProgression.answerProgressionMode,
      preferredAnswerAngle: finalProgression.preferredAngle,
      shouldAcknowledgePriorConversation: finalProgression.shouldAcknowledgePriorConversation,
      previousUserQuestion,
      isRepeatedQuestion: repeatedQuestionState.isRepeatedQuestion,
      memoryUsePolicy: {
        inputTrust: memoryUsePolicy.inputTrust,
        topicScope: memoryUsePolicy.topicScope,
        allowedMemoryItems: memoryUsePolicy.allowedMemoryItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          text: item.text,
          admissionState: item.admissionState,
          topicMatched: item.topicMatched,
          concernLike: item.concernLike,
          confidence: item.confidence,
        })),
        blockedMemoryItems: memoryUsePolicy.blockedMemoryItems.map(({ item, reason }) => ({
          id: item.id,
          kind: item.kind,
          text: item.text,
          reason,
        })),
        proceduralPrompts: memoryUsePolicy.proceduralPrompts,
        directReply: Boolean(memoryUsePolicy.directReply),
        ...memoryUsePolicy.debug,
      },
      modelFacing: {
        truthPacket: promptPackets.truthPacket,
        dialoguePacket: promptPackets.dialoguePacket,
        stylePacket: promptPackets.stylePacket,
        fewShotCount: buildFewShotMessagesClean().length / 2,
      },
      engineering: {
        localFactLines: policyFactLines,
        localEventLines: policyEventLines,
        localEvidenceLines: policyEvidenceLines,
        rawLocalFactLines: localFactLines,
        rawLocalEventLines: localEventLines,
        rawLocalEvidenceLines: localEvidenceLines,
        angleCandidates,
        topicDiscussCount: topicInteraction?.discussCount || 0,
      },
    }

    if (memoryUsePolicy.directReply) {
      return jsonResponse({
        reply: memoryUsePolicy.directReply,
        debug,
      })
    }

    if (
      finalProgression.answerProgressionMode === 'graceful_close' &&
      (repeatedQuestionState.isRepeatedQuestion ||
        routing.scopeLocked ||
        memoryUsePolicy.debug.isFollowupForMore)
    ) {
      return jsonResponse({
        reply: buildFallbackReplyClean(
          twinName,
          message,
          policyFactLines,
          policyEventLines,
          expression,
          {
            answerMode: routing.answerMode,
            localConcernCandidates: policyConcernCandidates,
          },
          finalProgression,
        ),
        debug,
      })
    }

    if (!AI_API_KEY || (!promptSnapshot && !personaSummary)) {
      return jsonResponse({
        reply: buildFallbackReplyClean(
          twinName,
          message,
          policyFactLines,
          policyEventLines,
          expression,
          {
            answerMode: routing.answerMode,
            localConcernCandidates: policyConcernCandidates,
          },
          finalProgression,
        ),
        debug,
      })
    }

    const systemPrompt = buildSystemPrompt(promptInput, promptPackets)
    const fewShotMessages = buildFewShotMessagesClean()

    console.info('Twin prompt orchestration', {
      message,
      ...debug,
    })

    const response = await fetch(CHAT_COMPLETIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...fewShotMessages,
          ...history.map((item) => ({
            role: item.role,
            content: item.content,
          })),
          { role: 'user', content: message },
        ],
        temperature:
          finalProgression.answerProgressionMode === 'graceful_close'
            ? 0.3
            : messageSource === 'voice' && messageTrustLevel !== 'stable'
              ? 0.35
              : 0.65,
        max_tokens: 320,
      }),
    })

    if (!response.ok) {
      const errorText = await readErrorPayload(response)
      console.error('Twin chat failed:', errorText)
      return jsonResponse({
        reply: buildFallbackReplyClean(
          twinName,
          message,
          policyFactLines,
          policyEventLines,
          expression,
          {
            answerMode: routing.answerMode,
            localConcernCandidates: policyConcernCandidates,
          },
          finalProgression,
        ),
        debug,
      })
    }

    const result = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string
        }
      }>
    }

    const rawReply = result.choices?.[0]?.message?.content?.trim()
    const reply =
      repeatedQuestionState.isRepeatedQuestion &&
      rawReply &&
      previousAssistantReply &&
      areRepliesTooSimilar(rawReply, previousAssistantReply)
        ? buildRepeatedReplyOverrideClean(
            twinName,
            finalProgression,
            promptInput.previousAnswerAngle || policyConcernCandidates[0] || '',
          )
        : rawReply

    return jsonResponse({
      reply:
        reply ||
        buildFallbackReplyClean(
          twinName,
          message,
          policyFactLines,
          policyEventLines,
          expression,
          {
            answerMode: routing.answerMode,
            localConcernCandidates: policyConcernCandidates,
          },
          finalProgression,
        ),
      debug,
    })
  } catch (error) {
    console.error('Twin chat route failed:', error)
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Twin chat failed.' },
      500,
    )
  }
}
