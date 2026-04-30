import { MemoryFactCandidate } from '@/types/companion'
import { SemanticMemorySearchHit } from '@/types/semanticMemory'

export type SituationalAnchorType = 'time' | 'place' | 'person' | 'stage'

export type SituationalAnchor = {
  type: SituationalAnchorType
  value: string
}

export type SituationalQuery = {
  enabled: boolean
  query: string
  anchors: SituationalAnchor[]
  scopeSource: 'message' | 'inherited' | 'none'
  scopeLocked: boolean
}

export type SituationalAnswerMode = 'default' | 'situational'

export type SituationalRoutingResult = {
  answerMode: SituationalAnswerMode
  situationAnchors: string[]
  situationalQuery: string
  scopeLocked: boolean
  scopeSource: 'message' | 'inherited' | 'none'
  fallbackReason: string | null
  localFacts: Array<Record<string, unknown>>
  localEvents: Array<Record<string, unknown>>
  localSemanticEvidence: SemanticMemorySearchHit[]
  localConcernCandidates: string[]
  globalFearCandidates: string[]
}

const PERSON_PATTERN =
  /(?:妈妈|爸爸|父亲|母亲|外婆|姥姥|奶奶|爷爷|外公|姥爷|姐姐|哥哥|弟弟|妹妹|儿子|女儿|爱人|老婆|老公|伴侣|前任|朋友|同事|老师|领导|孩子)/g
const STAGE_PATTERN = /(?:大学|高中|初中|童年|小时候|刚工作|毕业后|工作后|结婚后|分手后|创业时|怀孕时)/g
const TIME_PATTERN = /\b20\d{2}\b/g
const PLACE_PATTERN = /(?:北京|上海|杭州|深圳|广州|南京|苏州|成都|武汉|西安|重庆|天津|长沙|青岛|厦门|宁波|无锡|老家|故乡|家里|学校|公司|医院)/g
const CONCERN_PATTERN = /(?:怕|害怕|担心|焦虑|压力|最难|困难|不稳定|悬着心|发愁|紧张|难受)/i
const SITUATIONAL_FACT_TYPES = new Set(['fear', 'stressor', 'worry_about', 'situational_anxiety'])
const GLOBAL_FEAR_FACT_TYPES = new Set(['fear'])
const MAX_QUERY_CONTEXT_HISTORY = 2
const CLEAN_PERSON_PATTERN =
  /(?:妈妈|爸爸|父亲|母亲|外婆|姥姥|奶奶|爷爷|外公|姨妈|姑姑|哥哥|弟弟|妹妹|儿子|女儿|爱人|老婆|老公|伴侣|前任|朋友|同事|老师|领导|孩子)/g
const CLEAN_STAGE_PATTERN =
  /(?:大学|高中|初中|童年|小时候|刚工作|毕业后|工作后|结婚后|分手后|创业时|怀孕时)/g
const CLEAN_PLACE_PATTERN =
  /(?:北京|上海|杭州|深圳|广州|南京|苏州|成都|武汉|西安|重庆|天津|长沙|青岛|厦门|宁波|无锡|老家|故乡|家里|学校|公司|医院)/g
const CLEAN_CONCERN_PATTERN =
  /(?:害怕|担心|焦虑|压力|最难|困难|不稳定|悬着|发愁|紧张|难受|迷茫|不安)/i

function dedupeStrings(values: string[], limit = 8) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
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

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function pushAnchors(target: SituationalAnchor[], type: SituationalAnchorType, matches: Iterable<string>) {
  for (const match of matches) {
    const value = match.trim()
    if (!value) {
      continue
    }

    target.push({ type, value })
  }
}

export function extractSituationalAnchors(text: string) {
  const anchors: SituationalAnchor[] = []

  pushAnchors(anchors, 'time', text.match(TIME_PATTERN) ?? [])
  pushAnchors(anchors, 'person', text.match(CLEAN_PERSON_PATTERN) ?? [])
  pushAnchors(anchors, 'stage', text.match(CLEAN_STAGE_PATTERN) ?? [])
  pushAnchors(anchors, 'place', text.match(CLEAN_PLACE_PATTERN) ?? [])

  return dedupeStrings(anchors.map((anchor) => `${anchor.type}:${anchor.value}`), 12).map((item) => {
    const [type, ...rest] = item.split(':')
    return {
      type: type as SituationalAnchorType,
      value: rest.join(':'),
    }
  })
}

export function buildSituationalQuery(
  message: string,
  history: string[] = [],
  options?: {
    inheritedAnchors?: SituationalAnchor[]
    lockScopeToAnchors?: boolean
  },
): SituationalQuery {
  const messageAnchors = extractSituationalAnchors(message)
  const inheritedAnchors = options?.inheritedAnchors ?? []
  const recentHistory = history
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(-MAX_QUERY_CONTEXT_HISTORY)

  if (messageAnchors.length === 0) {
    if (inheritedAnchors.length > 0) {
      const anchorValues = inheritedAnchors.map((anchor) => anchor.value)

      return {
        enabled: true,
        query: [message, ...anchorValues, ...recentHistory].filter(Boolean).join('\n'),
        anchors: inheritedAnchors,
        scopeSource: 'inherited',
        scopeLocked: Boolean(options?.lockScopeToAnchors),
      }
    }

    return {
      enabled: false,
      query: [message, ...recentHistory].filter(Boolean).join('\n'),
      anchors: [],
      scopeSource: 'none',
      scopeLocked: false,
    }
  }

  const anchorValues = messageAnchors.map((anchor) => anchor.value)

  return {
    enabled: true,
    query: [message, ...anchorValues, ...recentHistory].filter(Boolean).join('\n'),
    anchors: messageAnchors,
    scopeSource: 'message',
    scopeLocked: false,
  }
}

function buildFactHaystack(fact: Record<string, unknown>) {
  return normalizeText(
    [
      readString(fact.subject),
      readString(fact.predicate),
      readString(fact.objectText) || readString(fact.object_text),
      readString(fact.factType) || readString(fact.fact_type),
      JSON.stringify(fact.metadata ?? {}),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function buildEventHaystack(event: Record<string, unknown>) {
  return normalizeText(
    [
      readString(event.title),
      readString(event.description),
      readString(event.lifeStage) || readString(event.life_stage),
      readString(event.locationName) || readString(event.location_name),
      readString(event.emotion),
      typeof event.year === 'number' ? String(event.year) : '',
      JSON.stringify(event.metadata ?? {}),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function buildSemanticHaystack(hit: SemanticMemorySearchHit) {
  return normalizeText(
    [
      hit.excerpt,
      ...hit.personHints,
      ...hit.placeHints,
      ...hit.timeHints,
      ...hit.tags,
      JSON.stringify(hit.metadata ?? {}),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function matchesAnchor(haystack: string, anchor: SituationalAnchor) {
  const value = normalizeText(anchor.value)
  if (!value) {
    return false
  }

  return haystack.includes(value)
}

function matchesAnyAnchor(haystack: string, anchors: SituationalAnchor[]) {
  return anchors.some((anchor) => matchesAnchor(haystack, anchor))
}

function summarizeFactClean(fact: Record<string, unknown>) {
  return `${readString(fact.subject) || '我'}${readString(fact.predicate)}${readString(fact.objectText) || readString(fact.object_text)}`.trim()
}

function summarizeEventClean(event: Record<string, unknown>) {
  const year = typeof event.year === 'number' ? `${event.year}年` : ''
  const title = readString(event.title)
  const description = readString(event.description)
  return `${year}${title || description}`.trim()
}

function summarizeFact(fact: Record<string, unknown>) {
  return `${readString(fact.subject) || '我'}${readString(fact.predicate)}${readString(fact.objectText) || readString(fact.object_text)}`.trim()
}

function summarizeEvent(event: Record<string, unknown>) {
  const year = typeof event.year === 'number' ? `${event.year}年` : ''
  const title = readString(event.title)
  const description = readString(event.description)
  return `${year}${title || description}`.trim()
}

function factHasConcernSignal(fact: Record<string, unknown>) {
  const factType = readString(fact.factType) || readString(fact.fact_type)
  if (SITUATIONAL_FACT_TYPES.has(factType)) {
    return true
  }

  return CLEAN_CONCERN_PATTERN.test(summarizeFactClean(fact))
}

function eventHasConcernSignal(event: Record<string, unknown>) {
  return CLEAN_CONCERN_PATTERN.test(summarizeEventClean(event))
}

function evidenceHasConcernSignal(hit: SemanticMemorySearchHit) {
  return CLEAN_CONCERN_PATTERN.test(hit.excerpt)
}

function isGlobalFearFact(fact: Record<string, unknown>) {
  const factType = readString(fact.factType) || readString(fact.fact_type)
  return GLOBAL_FEAR_FACT_TYPES.has(factType)
}

export function buildSituationalRoutingResult(input: {
  message: string
  history?: string[]
  facts: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  semanticEvidence: SemanticMemorySearchHit[]
  enabled?: boolean
  inheritedAnchors?: SituationalAnchor[]
  lockScopeToAnchors?: boolean
}) {
  const situationalQuery = buildSituationalQuery(input.message, input.history, {
    inheritedAnchors: input.inheritedAnchors,
    lockScopeToAnchors: input.lockScopeToAnchors,
  })
  const routingEnabled = input.enabled ?? true
  const anchors = situationalQuery.anchors

  if (!routingEnabled) {
    return {
      answerMode: 'default',
      situationAnchors: [],
      situationalQuery: situationalQuery.query,
      scopeLocked: false,
      scopeSource: situationalQuery.scopeSource,
      fallbackReason: 'situational-routing-disabled',
      localFacts: [],
      localEvents: [],
      localSemanticEvidence: [],
      localConcernCandidates: [],
      globalFearCandidates: input.facts.filter(isGlobalFearFact).map(summarizeFact).filter(Boolean).slice(0, 4),
    } satisfies SituationalRoutingResult
  }

  if (anchors.length === 0) {
    return {
      answerMode: 'default',
      situationAnchors: [],
      situationalQuery: situationalQuery.query,
      scopeLocked: false,
      scopeSource: situationalQuery.scopeSource,
      fallbackReason: 'no-situation-anchors',
      localFacts: [],
      localEvents: [],
      localSemanticEvidence: [],
      localConcernCandidates: [],
      globalFearCandidates: input.facts.filter(isGlobalFearFact).map(summarizeFact).filter(Boolean).slice(0, 4),
    } satisfies SituationalRoutingResult
  }

  const localFacts = input.facts.filter((fact) => matchesAnyAnchor(buildFactHaystack(fact), anchors))
  const localEvents = input.events.filter((event) => matchesAnyAnchor(buildEventHaystack(event), anchors))
  const localSemanticEvidence = input.semanticEvidence.filter((hit) => matchesAnyAnchor(buildSemanticHaystack(hit), anchors))
  const localConcernCandidates = dedupeStrings(
    [
      ...localFacts.filter(factHasConcernSignal).map(summarizeFact),
      ...localEvents.filter(eventHasConcernSignal).map(summarizeEvent),
      ...localSemanticEvidence.filter(evidenceHasConcernSignal).map((hit) => hit.excerpt.trim()),
    ],
    6,
  )

  if (localFacts.length === 0 && localEvents.length === 0 && localSemanticEvidence.length === 0) {
    if (situationalQuery.scopeLocked) {
      return {
        answerMode: 'situational',
        situationAnchors: anchors.map((anchor) => `${anchor.type}:${anchor.value}`),
        situationalQuery: situationalQuery.query,
        scopeLocked: true,
        scopeSource: situationalQuery.scopeSource,
        fallbackReason: 'locked-scope-no-local-evidence',
        localFacts,
        localEvents,
        localSemanticEvidence,
        localConcernCandidates,
        globalFearCandidates: [],
      } satisfies SituationalRoutingResult
    }

    return {
      answerMode: 'default',
      situationAnchors: anchors.map((anchor) => `${anchor.type}:${anchor.value}`),
      situationalQuery: situationalQuery.query,
      scopeLocked: false,
      scopeSource: situationalQuery.scopeSource,
      fallbackReason: 'no-local-evidence',
      localFacts,
      localEvents,
      localSemanticEvidence,
      localConcernCandidates,
      globalFearCandidates: input.facts.filter(isGlobalFearFact).map(summarizeFact).filter(Boolean).slice(0, 4),
    } satisfies SituationalRoutingResult
  }

  return {
    answerMode: 'situational',
    situationAnchors: anchors.map((anchor) => `${anchor.type}:${anchor.value}`),
    situationalQuery: situationalQuery.query,
    scopeLocked: situationalQuery.scopeLocked,
    scopeSource: situationalQuery.scopeSource,
    fallbackReason: localConcernCandidates.length > 0 ? null : 'insufficient-local-concern-signal',
    localFacts,
    localEvents,
    localSemanticEvidence,
    localConcernCandidates,
    globalFearCandidates: input.facts.filter(isGlobalFearFact).map(summarizeFact).filter(Boolean).slice(0, 4),
  } satisfies SituationalRoutingResult
}

function extractConcernObject(transcript: string) {
  const normalized = transcript.replace(/\s+/g, '')
  const patterns = [
    /最难(?:的|受)?(?:是)?([^。！？；\n]+)/,
    /最担心(?:的)?(?:是)?([^。！？；\n]+)/,
    /最怕(?:的)?(?:是)?([^。！？；\n]+)/,
    /压力(?:最大|最重|很大)(?:的)?(?:是)?([^。！？；\n]+)/,
    /(?:担心|害怕|焦虑|发愁)([^。！？；\n]+)/,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (!match?.[1]) {
      continue
    }

    return match[1].replace(/^[是关于对着]/, '').trim()
  }

  return ''
}

export function deriveSituationalFactCandidate(transcript: string): MemoryFactCandidate | null {
  const objectText = extractConcernObject(transcript)
  if (!objectText || objectText.length < 2) {
    return null
  }

  const anchors = extractSituationalAnchors(transcript)
  const anchorValuesByType = {
    placeHints: anchors.filter((anchor) => anchor.type === 'place').map((anchor) => anchor.value),
    personHints: anchors.filter((anchor) => anchor.type === 'person').map((anchor) => anchor.value),
    timeHints: anchors.filter((anchor) => anchor.type === 'time').map((anchor) => anchor.value),
    stageHints: anchors.filter((anchor) => anchor.type === 'stage').map((anchor) => anchor.value),
  }

  const isFearLike = /(?:最怕|害怕|怕|担心|焦虑|悬着心)/.test(transcript)
  const factType = isFearLike ? 'worry_about' : 'stressor'
  const predicate = isFearLike ? '担心' : '压力来自'
  const canonicalAnchor = [...anchorValuesByType.placeHints, ...anchorValuesByType.timeHints, ...anchorValuesByType.stageHints].join(':')
  const canonicalKey = `${factType}:${canonicalAnchor}:${normalizeText(objectText).slice(0, 40)}`

  return {
    canonicalKey,
    factType,
    subject: '我',
    predicate,
    objectText,
    valueJson: {
      scope: 'situational',
      anchors: anchorValuesByType,
    },
    validTimeType: anchorValuesByType.timeHints.length > 0 || anchorValuesByType.placeHints.length > 0 ? 'past' : 'temporary',
    confidence: 0.72,
    metadata: {
      derivedBy: 'situational-heuristic',
      ...anchorValuesByType,
      situational: true,
    },
  }
}
