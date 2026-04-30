import { loadCompanionProfileProjection } from '@/lib/companionProfileTraits'
import { listRecentMemoryTranscripts } from '@/lib/recentMemories'
import { listSemanticEvidencePreviews } from '@/lib/semanticMemory'
import { supabase } from '@/lib/supabase'
import { buildLiveTwinExpression, mergeTwinExpressionSnapshots } from '@/lib/twinExpression'
import { getMyTwinProfile } from '@/lib/twinProfiles'
import { activateTwinVersion, createTwinVersion, getActiveTwinVersion, updateTwinProfileFromVersion } from '@/lib/twinVersions'
import { CompanionProfile, MemoryEvent, MemoryEventTimeType, MemoryFact, MemoryFactValidTimeType } from '@/types/companion'
import { TwinExpressionSnapshot, TwinPersonaSnapshot, TwinProfile, TwinVersion } from '@/types/twin'

const MAX_FACT_SNAPSHOT = 18
const MAX_EVENT_SNAPSHOT = 18
const MAX_GROWTH_TRANSCRIPTS = 10
const MIN_EXPRESSION_TRANSCRIPTS = 4
const MIN_PROFILE_SESSION_DELTA = 2

type MemoryFactRow = {
  id: string
  canonical_key: string | null
  fact_type: string
  subject: string
  predicate: string
  object_text: string
  value_json: Record<string, unknown> | null
  valid_time_type: MemoryFactValidTimeType
  start_at: string | null
  end_at: string | null
  confidence: number
  source_memory_ids: string[] | null
  supersedes_fact_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type MemoryEventRow = {
  id: string
  canonical_key: string | null
  title: string
  description: string
  time_type: MemoryEventTimeType
  start_at: string | null
  end_at: string | null
  year: number | null
  age_at_event: number | null
  life_stage: string | null
  is_current: boolean
  location_name: string | null
  emotion: string | null
  importance: number
  confidence: number
  source_memory_ids: string[] | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type TwinGrowthRefreshResult =
  | { status: 'skipped'; reason: string }
  | { status: 'refreshed'; reason: string; twin: TwinProfile; version: TwinVersion }
  | { status: 'failed'; reason: string }

type TwinSanitizedDiff = {
  previousVersionId: string
  nextVersionId: string
  removedCoreValues: string[]
  removedBoundaryRules: string[]
  removedPhrasebook: string[]
  removedLifeFacts: string[]
}

type TwinRebuildResult =
  | { status: 'skipped'; reason: string }
  | { status: 'rebuilt'; reason: string; twin: TwinProfile; previousVersion: TwinVersion; version: TwinVersion; diff: TwinSanitizedDiff }
  | { status: 'failed'; reason: string }

function dedupe(values: string[], limit = 8) {
  return Array.from(
    new Set(
      values
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
}

function normalizeTwinLine(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
}

function isNoisyTwinLine(value: string) {
  const normalized = normalizeTwinLine(value)
  if (!normalized) {
    return true
  }

  if (normalized.length < 2) {
    return true
  }

  if (/^(?:[^\p{L}\p{N}\u4e00-\u9fff]+)$/u.test(normalized)) {
    return true
  }

  if (/(.)\1{3,}/u.test(normalized)) {
    return true
  }

  if (/(嘿嘿嘿|哈哈哈|我我|嗯嗯嗯|辣条)/u.test(normalized)) {
    return true
  }

  return false
}

function sanitizeTwinStrings(values: string[], limit = 8) {
  return dedupe(
    values
      .map(normalizeTwinLine)
      .filter((value) => !isNoisyTwinLine(value)),
    limit,
  )
}

function sanitizeTwinText(value: string) {
  const normalized = normalizeTwinLine(value)
  return isNoisyTwinLine(normalized) ? '' : normalized
}

function buildTwinResponseStyle(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }

    const sanitized = sanitizeTwinText(value)
    if (sanitized) {
      return sanitized
    }
  }

  return '回答时优先自然、口语化地延续对方的话题。'
}

function sanitizeProfileForTwinGrowth(profile: CompanionProfile): CompanionProfile {
  return {
    ...profile,
    styleSummary: sanitizeTwinText(profile.styleSummary),
    catchphrases: sanitizeTwinStrings(profile.catchphrases, 6),
    lexicalHabits: sanitizeTwinStrings(profile.lexicalHabits, 6),
    emotionalMarkers: sanitizeTwinStrings(profile.emotionalMarkers, 6),
    storytellingPatterns: sanitizeTwinStrings(profile.storytellingPatterns, 6),
    relationshipMentions: sanitizeTwinStrings(profile.relationshipMentions, 6),
    memoryThemes: sanitizeTwinStrings(profile.memoryThemes, 6),
    lifeFacts: sanitizeTwinStrings(profile.lifeFacts, 8),
    pacing: sanitizeTwinText(profile.pacing),
    pauses: sanitizeTwinText(profile.pauses),
    twinNotes: sanitizeTwinText(profile.twinNotes),
  }
}

function sanitizeExpressionSnapshot(expression: TwinExpressionSnapshot | null | undefined) {
  if (!expression) {
    return null
  }

  return {
    ...expression,
    summary: sanitizeTwinText(expression.summary),
    speakingTraits: sanitizeTwinStrings(expression.speakingTraits, 8),
    phrasebook: sanitizeTwinStrings(expression.phrasebook, 10),
    comfortExamples: sanitizeTwinStrings(expression.comfortExamples, 4),
    conflictExamples: sanitizeTwinStrings(expression.conflictExamples, 4),
    storytellingExamples: sanitizeTwinStrings(expression.storytellingExamples, 6),
    forbiddenPatterns: sanitizeTwinStrings(expression.forbiddenPatterns, 10),
  } satisfies TwinExpressionSnapshot
}

function collectSourceMemoryIds(facts: MemoryFact[], events: MemoryEvent[]) {
  return dedupe(
    [...facts.flatMap((fact) => fact.sourceMemoryIds), ...events.flatMap((event) => event.sourceMemoryIds)],
    24,
  )
}

async function listCleanSemanticEvidenceLines(facts: MemoryFact[], events: MemoryEvent[]) {
  const memoryIds = collectSourceMemoryIds(facts, events)
  if (memoryIds.length === 0) {
    return [] as string[]
  }

  const previews = await listSemanticEvidencePreviews(memoryIds, 2)
  return sanitizeTwinStrings(
    Object.values(previews)
      .flat()
      .sort((left, right) => right.score - left.score)
      .map((preview) => preview.excerpt),
    8,
  )
}

function diffTwinStrings(before: string[], after: string[]) {
  const afterSet = new Set(after.map((item) => normalizeTwinLine(item)))
  return before.filter((item) => {
    const normalized = normalizeTwinLine(item)
    return normalized && !afterSet.has(normalized)
  })
}

function normalizeSnapshotValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function factSignature(value: Record<string, unknown>) {
  const canonical =
    normalizeSnapshotValue(value.canonicalKey) || normalizeSnapshotValue(value.canonical_key)
  if (canonical) {
    return `fact:${canonical}`
  }

  const subject = normalizeSnapshotValue(value.subject)
  const predicate = normalizeSnapshotValue(value.predicate)
  const objectText = normalizeSnapshotValue(value.objectText) || normalizeSnapshotValue(value.object_text)
  return `fact:${subject}|${predicate}|${objectText}`
}

function eventSignature(value: Record<string, unknown>) {
  const canonical =
    normalizeSnapshotValue(value.canonicalKey) || normalizeSnapshotValue(value.canonical_key)
  if (canonical) {
    return `event:${canonical}`
  }

  const title = normalizeSnapshotValue(value.title)
  const year = typeof value.year === 'number' ? String(value.year) : ''
  const startAt = normalizeSnapshotValue(value.startAt) || normalizeSnapshotValue(value.start_at)
  const description = normalizeSnapshotValue(value.description)
  return `event:${title}|${year}|${startAt}|${description}`
}

function mapFactRow(row: MemoryFactRow): MemoryFact {
  return {
    id: row.id,
    canonicalKey: row.canonical_key || undefined,
    userId: '',
    factType: row.fact_type,
    subject: row.subject,
    predicate: row.predicate,
    objectText: row.object_text,
    valueJson: row.value_json ?? {},
    validTimeType: row.valid_time_type,
    startAt: row.start_at || undefined,
    endAt: row.end_at || undefined,
    confidence: row.confidence,
    sourceMemoryIds: Array.isArray(row.source_memory_ids) ? row.source_memory_ids : [],
    supersedesFactId: row.supersedes_fact_id || undefined,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEventRow(row: MemoryEventRow): MemoryEvent {
  return {
    id: row.id,
    canonicalKey: row.canonical_key || undefined,
    userId: '',
    title: row.title,
    description: row.description,
    timeType: row.time_type,
    startAt: row.start_at || undefined,
    endAt: row.end_at || undefined,
    year: typeof row.year === 'number' ? row.year : undefined,
    ageAtEvent: typeof row.age_at_event === 'number' ? row.age_at_event : undefined,
    lifeStage: row.life_stage || undefined,
    isCurrent: row.is_current,
    locationName: row.location_name || undefined,
    emotion: row.emotion || undefined,
    importance: row.importance,
    confidence: row.confidence,
    sourceMemoryIds: Array.isArray(row.source_memory_ids) ? row.source_memory_ids : [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function sortFacts(facts: MemoryFact[]) {
  return [...facts].sort((left, right) => {
    const leftCurrent = left.validTimeType === 'current' ? 1 : 0
    const rightCurrent = right.validTimeType === 'current' ? 1 : 0
    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent
    }

    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })
}

function sortEvents(events: MemoryEvent[]) {
  return [...events].sort((left, right) => {
    const leftCurrent = left.isCurrent ? 1 : 0
    const rightCurrent = right.isCurrent ? 1 : 0
    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent
    }

    if (left.importance !== right.importance) {
      return right.importance - left.importance
    }

    const leftTime = left.startAt
      ? new Date(left.startAt).getTime()
      : typeof left.year === 'number'
        ? left.year
        : 0
    const rightTime = right.startAt
      ? new Date(right.startAt).getTime()
      : typeof right.year === 'number'
        ? right.year
        : 0

    return rightTime - leftTime
  })
}

function buildBoundaryRules(
  existingBoundaryRules: string[],
  facts: MemoryFact[],
) {
  const factRules = facts
    .filter((fact) =>
      ['不喜欢', '害怕', '规则', '习惯', '边界', '讨厌', '不能', '需要'].some((keyword) =>
        fact.predicate.includes(keyword),
      ),
    )
    .map((fact) => `${fact.subject}${fact.predicate}${fact.objectText}`.trim())

  return sanitizeTwinStrings([...existingBoundaryRules, ...factRules], 6)
}

function buildCoreValues(existingCoreValues: string[], profile: CompanionProfile, facts: MemoryFact[]) {
  return sanitizeTwinStrings(
    [
      ...existingCoreValues,
      ...profile.memoryThemes,
      ...profile.lifeFacts,
      ...facts
        .filter((fact) => fact.validTimeType === 'current' || fact.validTimeType === 'long_term')
        .map((fact) => `${fact.subject}${fact.predicate}${fact.objectText}`.trim()),
    ],
    6,
  )
}

function summarizeFactsForPrompt(facts: Array<Record<string, unknown>>) {
  return dedupe(
    facts.map((fact) => {
      const subject = normalizeSnapshotValue(fact.subject) || '我'
      const predicate = normalizeSnapshotValue(fact.predicate)
      const objectText = normalizeSnapshotValue(fact.objectText) || normalizeSnapshotValue(fact.object_text)
      return `${subject}${predicate}${objectText}`.trim()
    }),
    6,
  )
}

function summarizeEventsForPrompt(events: Array<Record<string, unknown>>) {
  return dedupe(
    events.map((event) => {
      const year = typeof event.year === 'number' ? `${event.year}年` : ''
      const title = normalizeSnapshotValue(event.title)
      const description = normalizeSnapshotValue(event.description)
      return `${year}${title || description}`.trim()
    }),
    6,
  )
}

function buildPromptSnapshot(
  twinName: string,
  personaSummary: string,
  voiceStyleSummary: string,
  responseStyle: string,
  factsSnapshot: Array<Record<string, unknown>>,
  eventsSnapshot: Array<Record<string, unknown>>,
  boundaryRules: string[],
  expression: TwinExpressionSnapshot | null,
) {
  return [
    `你是 ${twinName} 的持续成长版数字分身。`,
    personaSummary,
    voiceStyleSummary ? `说话风格：${voiceStyleSummary}` : '',
    responseStyle ? `回应方式：${responseStyle}` : '',
    summarizeFactsForPrompt(factsSnapshot).length > 0
      ? `你已经确认的事实：${summarizeFactsForPrompt(factsSnapshot).join('；')}`
      : '',
    summarizeEventsForPrompt(eventsSnapshot).length > 0
      ? `你已经确认的经历：${summarizeEventsForPrompt(eventsSnapshot).join('；')}`
      : '',
    boundaryRules.length > 0 ? `边界与敏感点：${boundaryRules.join('；')}` : '',
    expression?.summary ? `表达层摘要：${expression.summary}` : '',
    expression?.phrasebook?.length ? `代表性说法：${expression.phrasebook.join('；')}` : '',
    expression?.comfortExamples?.length ? `安慰别人时更像：${expression.comfortExamples.join('；')}` : '',
    expression?.conflictExamples?.length ? `表达不满时更像：${expression.conflictExamples.join('；')}` : '',
    expression?.storytellingExamples?.length ? `讲故事时更像：${expression.storytellingExamples.join('；')}` : '',
    expression?.forbiddenPatterns?.length ? `尽量避免这些 AI 腔：${expression.forbiddenPatterns.join('；')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildPersonaSummary(
  twin: TwinProfile,
  activeVersion: TwinVersion,
  profile: CompanionProfile,
  factsSnapshot: Array<Record<string, unknown>>,
  eventsSnapshot: Array<Record<string, unknown>>,
) {
  const cleanTwinNotes = sanitizeTwinText(profile.twinNotes)
  if (cleanTwinNotes) {
    return cleanTwinNotes
  }

  const hints = [...summarizeFactsForPrompt(factsSnapshot), ...summarizeEventsForPrompt(eventsSnapshot)].slice(0, 2)
  if (hints.length > 0) {
    return `${twin.name} 是一个会继续从真实日常里成长的分身，目前更像：${hints.join('；')}`
  }

  const fallback =
    (typeof activeVersion.personaSnapshot.summary === 'string'
      ? sanitizeTwinText(activeVersion.personaSnapshot.summary)
      : '') || sanitizeTwinText(twin.personaSummary)

  if (fallback) {
    return fallback
  }

  return `${twin.name} 是一个会继续从真实日常里成长的分身。`
}

function getProfileSessionBaseline(activeVersion: TwinVersion) {
  const profile = activeVersion.personaSnapshot.profile
  if (!profile || typeof profile !== 'object') {
    return 0
  }

  const sessions = (profile as Record<string, unknown>).sessions
  return typeof sessions === 'number' && Number.isFinite(sessions) ? sessions : 0
}

async function listMemoryFacts() {
  const { data, error } = await supabase
    .from('memory_facts')
    .select(
      'id, canonical_key, fact_type, subject, predicate, object_text, value_json, valid_time_type, start_at, end_at, confidence, source_memory_ids, supersedes_fact_id, metadata, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(64)

  if (error) {
    throw error
  }

  return ((data ?? []) as MemoryFactRow[]).map(mapFactRow)
}

async function listMemoryEvents() {
  const { data, error } = await supabase
    .from('memory_events')
    .select(
      'id, canonical_key, title, description, time_type, start_at, end_at, year, age_at_event, life_stage, is_current, location_name, emotion, importance, confidence, source_memory_ids, metadata, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(64)

  if (error) {
    throw error
  }

  return ((data ?? []) as MemoryEventRow[]).map(mapEventRow)
}

function detectFreshFacts(activeVersion: TwinVersion, facts: MemoryFact[]) {
  const activeSignatures = new Set(
    (activeVersion.factsSnapshot ?? [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(factSignature),
  )

  return facts.filter((fact) => {
    const signature = factSignature({
      canonicalKey: fact.canonicalKey,
      subject: fact.subject,
      predicate: fact.predicate,
      objectText: fact.objectText,
    })

    return !activeSignatures.has(signature) || new Date(fact.updatedAt).getTime() > new Date(activeVersion.createdAt).getTime()
  })
}

function detectFreshEvents(activeVersion: TwinVersion, events: MemoryEvent[]) {
  const activeSignatures = new Set(
    (activeVersion.eventsSnapshot ?? [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(eventSignature),
  )

  return events.filter((event) => {
    const signature = eventSignature({
      canonicalKey: event.canonicalKey,
      title: event.title,
      year: event.year,
      startAt: event.startAt,
      description: event.description,
    })

    return !activeSignatures.has(signature) || new Date(event.updatedAt).getTime() > new Date(activeVersion.createdAt).getTime()
  })
}

function shouldRefreshTwinGrowth(
  freshFacts: MemoryFact[],
  freshEvents: MemoryEvent[],
  recentTranscripts: string[],
  profile: CompanionProfile,
  activeVersion: TwinVersion,
) {
  if (freshFacts.length > 0 || freshEvents.length > 0) {
    return {
      shouldRefresh: true,
      reason: freshEvents.some((event) => event.importance >= 4 || event.isCurrent)
        ? 'high-signal confirmed event'
        : 'confirmed facts or events changed',
    }
  }

  const baseSessions = getProfileSessionBaseline(activeVersion)
  const hasExpressionDelta =
    recentTranscripts.length >= MIN_EXPRESSION_TRANSCRIPTS &&
    profile.sessions >= baseSessions + MIN_PROFILE_SESSION_DELTA

  if (hasExpressionDelta) {
    return {
      shouldRefresh: true,
      reason: 'representative daily expression accumulated',
    }
  }

  return {
    shouldRefresh: false,
    reason: 'not enough confirmed or representative growth material yet',
  }
}

function toFactSnapshot(facts: MemoryFact[]): Array<Record<string, unknown>> {
  return facts.slice(0, MAX_FACT_SNAPSHOT).map((fact) => ({
    id: fact.id,
    canonicalKey: fact.canonicalKey,
    factType: fact.factType,
    subject: fact.subject,
    predicate: fact.predicate,
    objectText: fact.objectText,
    valueJson: fact.valueJson,
    validTimeType: fact.validTimeType,
    startAt: fact.startAt,
    endAt: fact.endAt,
    confidence: fact.confidence,
    sourceMemoryIds: fact.sourceMemoryIds,
    supersedesFactId: fact.supersedesFactId,
    metadata: fact.metadata,
    createdAt: fact.createdAt,
    updatedAt: fact.updatedAt,
  }))
}

function toEventSnapshot(events: MemoryEvent[]): Array<Record<string, unknown>> {
  return events.slice(0, MAX_EVENT_SNAPSHOT).map((event) => ({
    id: event.id,
    canonicalKey: event.canonicalKey,
    title: event.title,
    description: event.description,
    timeType: event.timeType,
    startAt: event.startAt,
    endAt: event.endAt,
    year: event.year,
    ageAtEvent: event.ageAtEvent,
    lifeStage: event.lifeStage,
    isCurrent: event.isCurrent,
    locationName: event.locationName,
    emotion: event.emotion,
    importance: event.importance,
    confidence: event.confidence,
    sourceMemoryIds: event.sourceMemoryIds,
    metadata: event.metadata,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  }))
}

export async function maybeRefreshTwinGrowth(): Promise<TwinGrowthRefreshResult> {
  try {
    const twin = await getMyTwinProfile()
    if (!twin?.activeVersionId) {
      return { status: 'skipped', reason: 'no active twin version available' }
    }

    const activeVersion = await getActiveTwinVersion(twin.id, twin.activeVersionId)
    const [profileProjection, facts, events, recentTranscripts] = await Promise.all([
      loadCompanionProfileProjection(),
      listMemoryFacts(),
      listMemoryEvents(),
      listRecentMemoryTranscripts({
        limit: MAX_GROWTH_TRANSCRIPTS,
        since: activeVersion.createdAt,
      }),
    ])

    const profile = sanitizeProfileForTwinGrowth(profileProjection)
    const sortedFacts = sortFacts(facts)
    const sortedEvents = sortEvents(events)
    const freshFacts = detectFreshFacts(activeVersion, sortedFacts)
    const freshEvents = detectFreshEvents(activeVersion, sortedEvents)
    const refreshDecision = shouldRefreshTwinGrowth(
      freshFacts,
      freshEvents,
      recentTranscripts,
      profile,
      activeVersion,
    )

    if (!refreshDecision.shouldRefresh) {
      return { status: 'skipped', reason: refreshDecision.reason }
    }

    const factsSnapshot = toFactSnapshot(sortedFacts)
    const eventsSnapshot = toEventSnapshot(sortedEvents)
    const voiceClone =
      activeVersion.personaSnapshot.voiceClone && typeof activeVersion.personaSnapshot.voiceClone === 'object'
        ? activeVersion.personaSnapshot.voiceClone
        : undefined

    const nextExpression =
      sanitizeExpressionSnapshot(
        mergeTwinExpressionSnapshots(
          sanitizeExpressionSnapshot(activeVersion.personaSnapshot.expression),
          buildLiveTwinExpression(profile, recentTranscripts),
        ) || sanitizeExpressionSnapshot(activeVersion.personaSnapshot.expression) || null,
      ) || undefined

    const personaSummary = sanitizeTwinText(
      buildPersonaSummary(twin, activeVersion, profile, factsSnapshot, eventsSnapshot),
    )
    const voiceStyleSummary =
      sanitizeTwinText(profile.styleSummary) ||
      (typeof activeVersion.personaSnapshot.voiceStyleSummary === 'string'
        ? sanitizeTwinText(activeVersion.personaSnapshot.voiceStyleSummary)
        : '') ||
      sanitizeTwinText(twin.voiceStyleSummary)
    const responseStyle =
      (typeof activeVersion.personaSnapshot.responseStyle === 'string'
        ? activeVersion.personaSnapshot.responseStyle.trim()
        : '') ||
      twin.responseStyle ||
      '回答时优先自然、口语化地延续对方的话题。'
    const coreValues = sanitizeTwinStrings(buildCoreValues(twin.coreValues, profile, sortedFacts), 6)
    const boundaryRules = sanitizeTwinStrings(buildBoundaryRules(twin.boundaryRules, sortedFacts), 6)
    const cleanResponseStyle = buildTwinResponseStyle(responseStyle, twin.responseStyle)

    const nextPersonaSnapshot: TwinPersonaSnapshot = {
      ...activeVersion.personaSnapshot,
      profile: profile as unknown as Record<string, unknown>,
      summary: personaSummary,
      voiceStyleSummary,
      responseStyle: cleanResponseStyle,
      coreValues,
      boundaryRules,
      expression: nextExpression ?? undefined,
      voiceClone,
    }

    const nextVersion = await createTwinVersion({
      twinId: twin.id,
      changeSource: 'memory_growth',
      personaSnapshot: nextPersonaSnapshot,
      factsSnapshot,
      eventsSnapshot,
      peopleSnapshot: activeVersion.peopleSnapshot,
      promptSnapshot: buildPromptSnapshot(
        twin.name,
        personaSummary,
        voiceStyleSummary,
        cleanResponseStyle,
        factsSnapshot,
        eventsSnapshot,
        boundaryRules,
        nextExpression ?? null,
      ),
    })

    const updatedTwin = await updateTwinProfileFromVersion({
      twinId: twin.id,
      activeVersionId: nextVersion.id,
      personaSummary,
      voiceStyleSummary,
      responseStyle: cleanResponseStyle,
      coreValues,
      boundaryRules,
      status: 'active',
    })

    return {
      status: 'refreshed',
      reason: refreshDecision.reason,
      twin: updatedTwin,
      version: nextVersion,
    }
  } catch (error) {
    console.error('Twin growth refresh failed:', error)
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Twin growth refresh failed.',
    }
  }
}

export async function rebuildTwinFromCleanAssets(): Promise<TwinRebuildResult> {
  try {
    const twin = await getMyTwinProfile()
    if (!twin?.activeVersionId) {
      return { status: 'skipped', reason: 'no active twin version available' }
    }

    const previousVersion = await getActiveTwinVersion(twin.id, twin.activeVersionId)
    const [profileProjection, facts, events, recentTranscripts] = await Promise.all([
      loadCompanionProfileProjection(),
      listMemoryFacts(),
      listMemoryEvents(),
      listRecentMemoryTranscripts({ limit: MAX_GROWTH_TRANSCRIPTS }),
    ])

    const profile = sanitizeProfileForTwinGrowth(profileProjection)
    const sortedFacts = sortFacts(facts)
    const sortedEvents = sortEvents(events)
    const semanticEvidenceLines = await listCleanSemanticEvidenceLines(sortedFacts, sortedEvents)
    const factsSnapshot = toFactSnapshot(sortedFacts)
    const eventsSnapshot = toEventSnapshot(sortedEvents)
    const voiceClone =
      previousVersion.personaSnapshot.voiceClone &&
      typeof previousVersion.personaSnapshot.voiceClone === 'object'
        ? previousVersion.personaSnapshot.voiceClone
        : undefined

    const expressionInputs = dedupe(
      [...recentTranscripts, ...semanticEvidenceLines].map((line) => line.trim()).filter(Boolean),
      MAX_GROWTH_TRANSCRIPTS + 8,
    )

    const nextExpression =
      sanitizeExpressionSnapshot(
        mergeTwinExpressionSnapshots(
          sanitizeExpressionSnapshot(previousVersion.personaSnapshot.expression),
          buildLiveTwinExpression(profile, expressionInputs),
        ) ||
          sanitizeExpressionSnapshot(previousVersion.personaSnapshot.expression) ||
          null,
      ) || undefined

    const personaSummary = sanitizeTwinText(
      buildPersonaSummary(twin, previousVersion, profile, factsSnapshot, eventsSnapshot),
    )
    const voiceStyleSummary = buildTwinResponseStyle(
      profile.styleSummary,
      typeof previousVersion.personaSnapshot.voiceStyleSummary === 'string'
        ? previousVersion.personaSnapshot.voiceStyleSummary
        : '',
      twin.voiceStyleSummary,
    )
    const responseStyle = buildTwinResponseStyle(
      typeof previousVersion.personaSnapshot.responseStyle === 'string'
        ? previousVersion.personaSnapshot.responseStyle
        : '',
      twin.responseStyle,
    )
    const coreValues = sanitizeTwinStrings(buildCoreValues(twin.coreValues, profile, sortedFacts), 6)
    const boundaryRules = sanitizeTwinStrings(buildBoundaryRules(twin.boundaryRules, sortedFacts), 6)

    const nextPersonaSnapshot: TwinPersonaSnapshot = {
      ...previousVersion.personaSnapshot,
      profile: profile as unknown as Record<string, unknown>,
      summary: personaSummary,
      voiceStyleSummary,
      responseStyle,
      coreValues,
      boundaryRules,
      expression: nextExpression ?? undefined,
      voiceClone,
    }

    const nextVersion = await createTwinVersion({
      twinId: twin.id,
      changeSource: 'rebuild',
      personaSnapshot: nextPersonaSnapshot,
      factsSnapshot,
      eventsSnapshot,
      peopleSnapshot: previousVersion.peopleSnapshot,
      promptSnapshot: buildPromptSnapshot(
        twin.name,
        personaSummary,
        voiceStyleSummary,
        responseStyle,
        factsSnapshot,
        eventsSnapshot,
        boundaryRules,
        nextExpression ?? null,
      ),
    })

    const updatedTwin = await activateTwinVersion({
      twinId: twin.id,
      versionId: nextVersion.id,
      status: 'active',
    })

    const previousProfile =
      previousVersion.personaSnapshot.profile && typeof previousVersion.personaSnapshot.profile === 'object'
        ? (previousVersion.personaSnapshot.profile as Record<string, unknown>)
        : {}
    const previousExpression = sanitizeExpressionSnapshot(previousVersion.personaSnapshot.expression)

    return {
      status: 'rebuilt',
      reason: 'sanitized twin version rebuilt from clean assets',
      twin: updatedTwin,
      previousVersion,
      version: nextVersion,
      diff: {
        previousVersionId: previousVersion.id,
        nextVersionId: nextVersion.id,
        removedCoreValues: diffTwinStrings(
          Array.isArray(previousVersion.personaSnapshot.coreValues)
            ? previousVersion.personaSnapshot.coreValues.filter((item): item is string => typeof item === 'string')
            : [],
          coreValues,
        ),
        removedBoundaryRules: diffTwinStrings(
          Array.isArray(previousVersion.personaSnapshot.boundaryRules)
            ? previousVersion.personaSnapshot.boundaryRules.filter((item): item is string => typeof item === 'string')
            : [],
          boundaryRules,
        ),
        removedPhrasebook: diffTwinStrings(previousExpression?.phrasebook ?? [], nextExpression?.phrasebook ?? []),
        removedLifeFacts: diffTwinStrings(
          Array.isArray(previousProfile.lifeFacts)
            ? previousProfile.lifeFacts.filter((item): item is string => typeof item === 'string')
            : [],
          profile.lifeFacts,
        ),
      },
    }
  } catch (error) {
    console.error('Twin sanitized rebuild failed:', error)
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'Twin sanitized rebuild failed.',
    }
  }
}
