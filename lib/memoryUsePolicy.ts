import { SituationalRoutingResult } from '@/lib/twinSituationalRouting'
import { SemanticMemorySearchHit } from '@/types/semanticMemory'
import {
  TwinAnswerProgressionMode,
  TwinTopicInteractionContext,
  TwinTopicInteractionRecencyBand,
} from '@/types/twin'

export type MemoryAdmissionState = 'raw' | 'candidate' | 'confirmed' | 'stable' | 'archived'

export type MemoryUseBlockedReason =
  | 'outside_topic_scope'
  | 'low_admission_state'
  | 'raw_evidence_not_high_value'
  | 'already_covered_angle'
  | 'missing_requested_detail'
  | 'unsafe_voice_expansion'

export type MemoryUseCandidateKind = 'fact' | 'event' | 'semantic'

export type MemoryUseCandidate = {
  id: string
  kind: MemoryUseCandidateKind
  text: string
  admissionState: MemoryAdmissionState
  topicMatched: boolean
  concernLike: boolean
  confidence: number
  raw: Record<string, unknown> | SemanticMemorySearchHit
}

export type MemoryUsePolicy = {
  inputTrust: {
    source: 'text' | 'voice'
    level: 'stable' | 'guarded' | 'risky'
    riskFlags: string[]
    admissionState: MemoryAdmissionState
  }
  topicScope: {
    mode: 'default' | 'situational'
    locked: boolean
    anchors: string[]
    source: 'message' | 'inherited' | 'none'
    query: string
  }
  allowedMemoryItems: MemoryUseCandidate[]
  blockedMemoryItems: Array<{
    item: MemoryUseCandidate
    reason: MemoryUseBlockedReason
  }>
  proceduralPrompts: string[]
  answerProgressionMode: TwinAnswerProgressionMode
  preferredAnswerAngle: string
  directReply?: string
  debug: {
    isFollowupForMore: boolean
    missingRequestedTerms: string[]
    usedTopicInteraction: boolean
    recencyBand: TwinTopicInteractionRecencyBand
  }
}

type BuildMemoryUsePolicyInput = {
  message: string
  messageSource: 'text' | 'voice'
  messageTrustLevel: 'stable' | 'guarded' | 'risky'
  messageRiskFlags: string[]
  routing: SituationalRoutingResult
  facts: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  semanticEvidence: SemanticMemorySearchHit[]
  topicInteraction: TwinTopicInteractionContext | null
  previousAssistantReply: string
  progression: {
    answerProgressionMode: TwinAnswerProgressionMode
    preferredAngle: string
    shouldAcknowledgePriorConversation: boolean
  }
  isRepeatedQuestion: boolean
}

const FOLLOWUP_FOR_MORE_PATTERN =
  /(?:还有别的吗|还有别的|还有吗|还有什么|除此之外|除此以外|还有其他|还有没有|再说点|然后呢|别的呢)/i
const MISSING_DETAIL_PROBE_PATTERN =
  /(?:朋友聚会|聚会|聚餐|喝酒|唱歌|出去玩|见朋友|参加活动|社交|辣条|火锅|旅游|旅行|恋爱|同事)/g
const CONCERN_PATTERN =
  /(?:怕|害怕|担心|焦虑|压力|最难|困难|不稳定|悬着|发愁|紧张|难受|迷茫|不安|后盾|安慰|收入|工作)/i

function dedupeStrings(values: string[], limit = 12) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit)
}

function normalizeText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\u4e00-\u9fff]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readMetadata(record: Record<string, unknown>) {
  const metadata = record.metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}
}

function readAdmissionState(metadata: Record<string, unknown>, fallback: MemoryAdmissionState) {
  const state = metadata.memoryAdmissionState || metadata.admissionState
  return state === 'raw' ||
    state === 'candidate' ||
    state === 'confirmed' ||
    state === 'stable' ||
    state === 'archived'
    ? state
    : fallback
}

function summarizeFact(fact: Record<string, unknown>) {
  const subject = readString(fact.subject) || '我'
  const predicate = readString(fact.predicate)
  const objectText = readString(fact.objectText) || readString(fact.object_text)
  return `${subject}${predicate}${objectText}`.trim()
}

function summarizeEvent(event: Record<string, unknown>) {
  const year = typeof event.year === 'number' ? `${event.year}年` : ''
  const stage = readString(event.lifeStage) || readString(event.life_stage)
  const location = readString(event.locationName) || readString(event.location_name)
  const title = readString(event.title)
  const description = readString(event.description)
  return [year || stage, location, title || description].filter(Boolean).join('，').trim()
}

function itemKey(kind: MemoryUseCandidateKind, index: number, record: Record<string, unknown>) {
  return readString(record.id) || readString(record.canonicalKey) || readString(record.canonical_key) || `${kind}:${index}`
}

function sameRecord(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftId = readString(left.id) || readString(left.canonicalKey) || readString(left.canonical_key)
  const rightId = readString(right.id) || readString(right.canonicalKey) || readString(right.canonical_key)

  if (leftId && rightId) {
    return leftId === rightId
  }

  return normalizeText(JSON.stringify(left)) === normalizeText(JSON.stringify(right))
}

function semanticKey(hit: SemanticMemorySearchHit) {
  return hit.chunkId || hit.memoryId || normalizeText(hit.excerpt).slice(0, 80)
}

function isSemanticLocal(hit: SemanticMemorySearchHit, localHits: SemanticMemorySearchHit[]) {
  return localHits.some((localHit) => semanticKey(localHit) === semanticKey(hit))
}

function isAlreadyCovered(text: string, previousAssistantReply: string) {
  const item = normalizeText(text)
  const previous = normalizeText(previousAssistantReply)

  if (!item || !previous) {
    return false
  }

  if (previous.includes(item) || item.includes(previous)) {
    return true
  }

  const compactItem = item.replace(/\s+/g, '')
  const compactPrevious = previous.replace(/\s+/g, '')
  const fragments = new Set<string>()

  for (let index = 0; index <= compactItem.length - 4; index += 1) {
    const fragment = compactItem.slice(index, index + 4)
    if (/[\u4e00-\u9fff]{4}/.test(fragment)) {
      fragments.add(fragment)
    }
  }

  if (fragments.size > 0) {
    const matched = [...fragments].filter((fragment) => compactPrevious.includes(fragment)).length
    if (matched >= 2 || matched / fragments.size >= 0.3) {
      return true
    }
  }

  const itemTokens = item.split(' ').filter((token) => token.length >= 2)
  if (itemTokens.length === 0) {
    return false
  }

  const coveredTokens = itemTokens.filter((token) => previous.includes(token)).length
  return coveredTokens / itemTokens.length >= 0.65
}

function extractRequestedMissingTerms(message: string) {
  return dedupeStrings(message.match(MISSING_DETAIL_PROBE_PATTERN) ?? [], 4)
}

function hasTermInAllowedItems(term: string, items: MemoryUseCandidate[]) {
  const normalizedTerm = normalizeText(term)
  return items.some((item) => normalizeText(item.text).includes(normalizedTerm))
}

function buildInputAdmissionState(input: BuildMemoryUsePolicyInput): MemoryAdmissionState {
  if (input.messageSource !== 'voice') {
    return 'confirmed'
  }

  if (input.messageTrustLevel === 'risky') {
    return 'archived'
  }

  if (input.messageTrustLevel === 'guarded' || input.messageRiskFlags.length > 0) {
    return 'candidate'
  }

  return 'confirmed'
}

function buildCandidates(input: BuildMemoryUsePolicyInput) {
  const localFacts = input.routing.localFacts
  const localEvents = input.routing.localEvents
  const localSemanticEvidence = input.routing.localSemanticEvidence

  const factCandidates = input.facts.map((fact, index) => {
    const metadata = readMetadata(fact)
    const text = summarizeFact(fact)

    return {
      id: itemKey('fact', index, fact),
      kind: 'fact' as const,
      text,
      admissionState: readAdmissionState(metadata, 'confirmed'),
      topicMatched:
        input.routing.answerMode === 'default' ||
        localFacts.some((localFact) => sameRecord(localFact, fact)),
      concernLike: CONCERN_PATTERN.test(text),
      confidence: readNumber(fact.confidence, 0.8),
      raw: fact,
    }
  })

  const eventCandidates = input.events.map((event, index) => {
    const metadata = readMetadata(event)
    const text = summarizeEvent(event)

    return {
      id: itemKey('event', index, event),
      kind: 'event' as const,
      text,
      admissionState: readAdmissionState(metadata, 'confirmed'),
      topicMatched:
        input.routing.answerMode === 'default' ||
        localEvents.some((localEvent) => sameRecord(localEvent, event)),
      concernLike: CONCERN_PATTERN.test(text),
      confidence: readNumber(event.confidence, 0.8),
      raw: event,
    }
  })

  const semanticCandidates = input.semanticEvidence.map((hit, index) => {
    const metadata = hit.metadata ?? {}
    const fallbackState: MemoryAdmissionState = hit.isHighValue ? 'confirmed' : 'raw'
    const text = hit.excerpt.trim()

    return {
      id: hit.chunkId || `semantic:${index}`,
      kind: 'semantic' as const,
      text,
      admissionState: readAdmissionState(metadata, fallbackState),
      topicMatched:
        input.routing.answerMode === 'default' || isSemanticLocal(hit, localSemanticEvidence),
      concernLike: CONCERN_PATTERN.test(text),
      confidence: hit.isHighValue ? Math.max(hit.importance, 0.78) : Math.min(hit.importance, 0.62),
      raw: hit,
    }
  })

  return [...factCandidates, ...eventCandidates, ...semanticCandidates].filter((item) => item.text)
}

function isAdmitted(item: MemoryUseCandidate) {
  return item.admissionState === 'confirmed' || item.admissionState === 'stable'
}

function selectAllowedItems(
  input: BuildMemoryUsePolicyInput,
  candidates: MemoryUseCandidate[],
  blockedMemoryItems: MemoryUsePolicy['blockedMemoryItems'],
) {
  const scoped = input.routing.answerMode === 'situational' || input.routing.scopeLocked
  const isFollowupForMore = FOLLOWUP_FOR_MORE_PATTERN.test(input.message)
  const shouldAvoidCoveredAngle = isFollowupForMore || input.isRepeatedQuestion
  const allowed: MemoryUseCandidate[] = []

  for (const item of candidates) {
    if (scoped && !item.topicMatched) {
      blockedMemoryItems.push({ item, reason: 'outside_topic_scope' })
      continue
    }

    if (!isAdmitted(item)) {
      blockedMemoryItems.push({ item, reason: 'low_admission_state' })
      continue
    }

    if (item.kind === 'semantic' && !item.raw.isHighValue) {
      blockedMemoryItems.push({ item, reason: 'raw_evidence_not_high_value' })
      continue
    }

    if (shouldAvoidCoveredAngle && isAlreadyCovered(item.text, input.previousAssistantReply)) {
      blockedMemoryItems.push({ item, reason: 'already_covered_angle' })
      continue
    }

    allowed.push(item)
  }

  const sorted = allowed.sort((left, right) => {
    if (left.concernLike !== right.concernLike) {
      return left.concernLike ? -1 : 1
    }

    if (left.kind !== right.kind) {
      const order: Record<MemoryUseCandidateKind, number> = { fact: 0, event: 1, semantic: 2 }
      return order[left.kind] - order[right.kind]
    }

    return right.confidence - left.confidence
  })

  return sorted.slice(0, scoped ? 6 : 8)
}

function buildProceduralPrompts(
  input: BuildMemoryUsePolicyInput,
  policyCore: {
    isFollowupForMore: boolean
    missingRequestedTerms: string[]
    allowedItems: MemoryUseCandidate[]
  },
) {
  const prompts = [
    '只使用本轮允许的记忆包回答；不要把被阻断或未确认的内容说成经历。',
    '不要新增人物、地点、社交活动、食物偏好或事件细节。',
  ]

  if (input.routing.answerMode === 'situational' || input.routing.scopeLocked) {
    prompts.push('当前问题有明确语境，回答必须收在这个时间、地点、人物或阶段范围内。')
  }

  if (input.isRepeatedQuestion) {
    prompts.push('用户在重复同一问题，不要原样复述上一轮；只能换一个小角度，或自然收住。')
  }

  if (policyCore.isFollowupForMore) {
    prompts.push('用户在追问还有没有别的，只能补充当前话题下未讲过的可信细节。')
  }

  if (policyCore.allowedItems.length === 0 || policyCore.missingRequestedTerms.length > 0) {
    prompts.push('如果没有可信新增细节，要自然说明现在没有明确想起更多，而不是编造。')
  }

  if (input.messageSource === 'voice' && input.messageTrustLevel !== 'stable') {
    prompts.push('这轮来自非稳定语音输入，只保守承接核心意思，不扩写成新记忆。')
  }

  return dedupeStrings(prompts, 8)
}

function chooseProgressionMode(input: BuildMemoryUsePolicyInput, allowedItems: MemoryUseCandidate[]) {
  const isFollowupForMore = FOLLOWUP_FOR_MORE_PATTERN.test(input.message)

  if (isFollowupForMore && allowedItems.length <= 1) {
    return 'graceful_close' satisfies TwinAnswerProgressionMode
  }

  if (input.isRepeatedQuestion && allowedItems.length <= 1) {
    return 'graceful_close' satisfies TwinAnswerProgressionMode
  }

  return input.progression.answerProgressionMode
}

function buildDirectReply(input: BuildMemoryUsePolicyInput, missingRequestedTerms: string[], allowedItems: MemoryUseCandidate[]) {
  if (missingRequestedTerms.length === 0) {
    return undefined
  }

  const missingTerms = missingRequestedTerms.join('、')
  const grounded = allowedItems.find((item) => item.concernLike)?.text || allowedItems[0]?.text || ''

  if (grounded) {
    return `这个我没有明确记得。现在这段里能确认的，还是${grounded}。`
  }

  if (input.routing.situationAnchors.length > 0) {
    return `这个我没有明确记得。至少在${input.routing.situationAnchors.join('、')}这段记忆里，没有清楚想起和${missingTerms}有关的事。`
  }

  return `这个我没有明确记得。现在没有清楚想起和${missingTerms}有关的事。`
}

export function buildMemoryUsePolicy(input: BuildMemoryUsePolicyInput): MemoryUsePolicy {
  const candidates = buildCandidates(input)
  const blockedMemoryItems: MemoryUsePolicy['blockedMemoryItems'] = []
  const allowedItems = selectAllowedItems(input, candidates, blockedMemoryItems)
  const isFollowupForMore = FOLLOWUP_FOR_MORE_PATTERN.test(input.message)
  const missingRequestedTerms = extractRequestedMissingTerms(input.message).filter(
    (term) => !hasTermInAllowedItems(term, allowedItems),
  )

  for (const term of missingRequestedTerms) {
    const pseudoItem: MemoryUseCandidate = {
      id: `missing:${term}`,
      kind: 'semantic',
      text: term,
      admissionState: 'raw',
      topicMatched: false,
      concernLike: false,
      confidence: 0,
      raw: {
        chunkId: `missing:${term}`,
        memoryId: '',
        excerpt: term,
        score: 0,
        reasons: [],
        isHighValue: false,
        importance: 0,
        tags: [],
        personHints: [],
        placeHints: [],
        timeHints: [],
        metadata: {},
      } satisfies SemanticMemorySearchHit,
    }
    blockedMemoryItems.push({ item: pseudoItem, reason: 'missing_requested_detail' })
  }

  const answerProgressionMode = chooseProgressionMode(input, allowedItems)
  const preferredAnswerAngle =
    allowedItems.find((item) => item.concernLike)?.text ||
    allowedItems[0]?.text ||
    input.progression.preferredAngle
  const proceduralPrompts = buildProceduralPrompts(input, {
    isFollowupForMore,
    missingRequestedTerms,
    allowedItems,
  })

  return {
    inputTrust: {
      source: input.messageSource,
      level: input.messageTrustLevel,
      riskFlags: input.messageRiskFlags,
      admissionState: buildInputAdmissionState(input),
    },
    topicScope: {
      mode: input.routing.answerMode,
      locked: input.routing.scopeLocked,
      anchors: input.routing.situationAnchors,
      source: input.routing.scopeSource,
      query: input.routing.situationalQuery,
    },
    allowedMemoryItems: allowedItems,
    blockedMemoryItems,
    proceduralPrompts,
    answerProgressionMode,
    preferredAnswerAngle,
    directReply: buildDirectReply(input, missingRequestedTerms, allowedItems),
    debug: {
      isFollowupForMore,
      missingRequestedTerms,
      usedTopicInteraction: Boolean(input.topicInteraction),
      recencyBand: input.topicInteraction?.recencyBand || 'new',
    },
  }
}

export function memoryUsePolicyToPromptLines(policy: MemoryUsePolicy) {
  return policy.proceduralPrompts
}
