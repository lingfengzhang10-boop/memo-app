import { getStoredValue, setStoredValue } from '@/lib/platform/storage'
import { supabase } from '@/lib/supabase'
import {
  extractSituationalAnchors,
  SituationalAnchor,
  SituationalAnchorType,
} from '@/lib/twinSituationalRouting'
import {
  TwinAnswerProgressionMode,
  TwinTopicInteractionContext,
  TwinTopicInteractionRecord,
  TwinTopicInteractionRecencyBand,
} from '@/types/twin'

type TwinTopicInteractionRow = {
  id: string
  twin_id: string
  user_id: string
  asker_key: string
  topic_key: string
  discuss_count: number
  last_discussed_at: string
  last_answer_summary: string
  last_answer_angle: string
  last_answer_mode: TwinAnswerProgressionMode
  last_response_excerpt: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type LoadTopicInteractionInput = {
  twinId: string
  message: string
}

type RecordTopicInteractionInput = {
  twinId: string
  context: TwinTopicInteractionContext
  answerSummary: string
  answerAngle?: string
  answerMode: TwinAnswerProgressionMode
  responseExcerpt?: string
}

type ProgressionInput = {
  interaction: TwinTopicInteractionContext | null
  angleCandidates: string[]
}

export type TopicProgressionResult = {
  answerProgressionMode: TwinAnswerProgressionMode
  preferredAngle: string
  shouldAcknowledgePriorConversation: boolean
}

const TABLE_NAME = 'twin_topic_interactions'
const LOCAL_STORAGE_KEY = 'nianji:twin-topic-interactions'
const FOLLOWUP_PATTERN = /(?:还有什么|除此之外|还有别的|还有吗|别的吗|然后呢|再呢|还有其他|印象深刻|除此以外|除此之外呢)/i

function normalizeTopicText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\u4e00-\u9fff]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function buildLocalInteractionKey(twinId: string, askerKey: string, topicKey: string) {
  return `${twinId}::${askerKey}::${topicKey}`
}

function readLocalInteractionStore() {
  const rawValue = getStoredValue(LOCAL_STORAGE_KEY)
  if (!rawValue) {
    return {} as Record<string, TwinTopicInteractionRecord>
  }

  try {
    const parsed = JSON.parse(rawValue) as Record<string, TwinTopicInteractionRecord>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalInteractionStore(store: Record<string, TwinTopicInteractionRecord>) {
  setStoredValue(LOCAL_STORAGE_KEY, JSON.stringify(store))
}

function readLocalInteraction(params: {
  twinId: string
  askerKey: string
  topicKey: string
}): TwinTopicInteractionRecord | null {
  const store = readLocalInteractionStore()
  return store[buildLocalInteractionKey(params.twinId, params.askerKey, params.topicKey)] || null
}

function writeLocalInteraction(record: TwinTopicInteractionRecord) {
  const store = readLocalInteractionStore()
  store[buildLocalInteractionKey(record.twinId, record.askerKey, record.topicKey)] = record
  writeLocalInteractionStore(store)
}

function looksLikeFollowupPrompt(message: string) {
  return FOLLOWUP_PATTERN.test(message)
}

export function deriveTwinTopicInteractionSeed(
  message: string,
  recentInteraction?: TwinTopicInteractionContext | null,
) {
  const anchorTopicKey = buildAnchorTopicKey(message)
  const inheritedFromRecentTopic =
    !anchorTopicKey &&
    looksLikeFollowupPrompt(message) &&
    Boolean(recentInteraction?.topicKey && recentInteraction.recencyBand !== 'stale')

  const topicKey =
    anchorTopicKey ||
    (inheritedFromRecentTopic ? recentInteraction?.topicKey || '' : buildFallbackTopicKey(message))

  if (!topicKey) {
    return null
  }

  return {
    topicKey,
    inheritedFromRecentTopic,
  }
}

function mapRow(row: TwinTopicInteractionRow): TwinTopicInteractionRecord {
  return {
    id: row.id,
    twinId: row.twin_id,
    userId: row.user_id,
    askerKey: row.asker_key,
    topicKey: row.topic_key,
    recencyBand: resolveTopicRecencyBand(row.last_discussed_at),
    discussCount: row.discuss_count,
    lastDiscussedAt: row.last_discussed_at,
    lastAnswerSummary: row.last_answer_summary,
    lastAnswerAngle: row.last_answer_angle,
    lastAnswerMode: row.last_answer_mode,
    lastResponseExcerpt: row.last_response_excerpt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function requireUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session?.user?.id ?? null
}

function buildAnchorTopicKey(message: string) {
  const anchors = extractSituationalAnchors(message)
    .map((anchor) => `${anchor.type}:${normalizeTopicText(anchor.value)}`)
    .filter(Boolean)
    .sort()

  if (anchors.length === 0) {
    return ''
  }

  return `anchors:${anchors.join('|')}`
}

export function extractAnchorsFromTopicKey(topicKey: string): SituationalAnchor[] {
  if (!topicKey.startsWith('anchors:')) {
    return []
  }

  return topicKey
    .slice('anchors:'.length)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [rawType, ...rawValue] = item.split(':')
      const value = rawValue.join(':').trim()

      if (!value) {
        return null
      }

      if (
        rawType !== 'time' &&
        rawType !== 'place' &&
        rawType !== 'person' &&
        rawType !== 'stage'
      ) {
        return null
      }

      return {
        type: rawType as SituationalAnchorType,
        value,
      } satisfies SituationalAnchor
    })
    .filter((item): item is SituationalAnchor => Boolean(item))
}

function buildFallbackTopicKey(message: string) {
  const normalized = normalizeTopicText(message)
  if (!normalized) {
    return ''
  }

  return `query:${normalized.slice(0, 72)}`
}

export function resolveTopicRecencyBand(lastDiscussedAt?: string | null): TwinTopicInteractionRecencyBand {
  if (!lastDiscussedAt) {
    return 'new'
  }

  const last = new Date(lastDiscussedAt).getTime()
  if (Number.isNaN(last)) {
    return 'new'
  }

  const diffMs = Date.now() - last
  const halfHour = 30 * 60 * 1000
  const oneDay = 24 * 60 * 60 * 1000
  const sevenDays = 7 * oneDay

  if (diffMs <= halfHour) {
    return 'immediate'
  }
  if (diffMs <= oneDay) {
    return 'same_day'
  }
  if (diffMs <= sevenDays) {
    return 'recent'
  }
  return 'stale'
}

export async function loadTwinTopicInteractionContext(
  input: LoadTopicInteractionInput,
): Promise<TwinTopicInteractionContext | null> {
  const userId = await requireUserId()
  if (!input.twinId) {
    return null
  }

  const askerKey = userId || 'local-asker'

  let latestInteraction: TwinTopicInteractionRecord | null = null

  if (userId) {
    const { data: latestData, error: latestError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('user_id', userId)
      .eq('twin_id', input.twinId)
      .eq('asker_key', askerKey)
      .order('last_discussed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestError && latestData) {
      latestInteraction = mapRow(latestData as TwinTopicInteractionRow)
    }
  }

  const seed = deriveTwinTopicInteractionSeed(input.message, latestInteraction)
  const topicKey = seed?.topicKey || ''
  const inheritedFromRecentTopic = Boolean(seed?.inheritedFromRecentTopic)

  if (!topicKey) {
    return null
  }

  let existing: TwinTopicInteractionRecord | null = null

  if (userId) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('user_id', userId)
      .eq('twin_id', input.twinId)
      .eq('asker_key', askerKey)
      .eq('topic_key', topicKey)
      .maybeSingle()

    if (!error && data) {
      existing = mapRow(data as TwinTopicInteractionRow)
    }
  }

  if (!existing) {
    existing = readLocalInteraction({
      twinId: input.twinId,
      askerKey,
      topicKey,
    })
  }

  return {
    topicKey,
    askerKey,
    recencyBand: existing?.recencyBand ?? 'new',
    discussCount: existing?.discussCount ?? 0,
    lastDiscussedAt: existing?.lastDiscussedAt,
    lastAnswerSummary: existing?.lastAnswerSummary,
    lastAnswerAngle: existing?.lastAnswerAngle,
    lastAnswerMode: existing?.lastAnswerMode,
    inheritedFromRecentTopic,
  }
}

export async function recordTwinTopicInteraction(input: RecordTopicInteractionInput) {
  const userId = await requireUserId()
  if (!input.twinId || !input.context.topicKey) {
    return
  }

  const askerKey = input.context.askerKey || userId || 'local-asker'
  const timestamp = new Date().toISOString()

  writeLocalInteraction({
    id: buildLocalInteractionKey(input.twinId, askerKey, input.context.topicKey),
    twinId: input.twinId,
    userId: userId || 'local-user',
    askerKey,
    topicKey: input.context.topicKey,
    recencyBand: 'immediate',
    discussCount: Math.max(input.context.discussCount + 1, 1),
    lastDiscussedAt: timestamp,
    lastAnswerSummary: input.answerSummary.trim(),
    lastAnswerAngle: input.answerAngle?.trim() || '',
    lastAnswerMode: input.answerMode,
    lastResponseExcerpt: input.responseExcerpt?.trim() || input.answerSummary.trim().slice(0, 160),
    createdAt: input.context.lastDiscussedAt || timestamp,
    updatedAt: timestamp,
    inheritedFromRecentTopic: Boolean(input.context.inheritedFromRecentTopic),
  })

  if (!userId) {
    return
  }

  const payload = {
    twin_id: input.twinId,
    user_id: userId,
    asker_key: askerKey,
    topic_key: input.context.topicKey,
    discuss_count: Math.max(input.context.discussCount + 1, 1),
    last_discussed_at: timestamp,
    last_answer_summary: input.answerSummary.trim(),
    last_answer_angle: input.answerAngle?.trim() || '',
    last_answer_mode: input.answerMode,
    last_response_excerpt: input.responseExcerpt?.trim() || input.answerSummary.trim().slice(0, 160),
    metadata: {
      inheritedFromRecentTopic: Boolean(input.context.inheritedFromRecentTopic),
      recencyBand: input.context.recencyBand,
    },
  }

  const { error } = await supabase.from(TABLE_NAME).upsert(payload, {
    onConflict: 'twin_id,asker_key,topic_key',
  })

  if (error) {
    console.warn('Twin topic interaction remote sync failed, kept local fallback:', error)
  }
}

function isSameAngle(left: string, right: string) {
  const a = normalizeTopicText(left)
  const b = normalizeTopicText(right)
  if (!a || !b) {
    return false
  }

  return a === b || a.includes(b) || b.includes(a)
}

export function resolveTopicProgression(input: ProgressionInput): TopicProgressionResult {
  const angleCandidates = dedupeStrings(input.angleCandidates, 6)
  const interaction = input.interaction

  if (!interaction || interaction.recencyBand === 'new' || interaction.recencyBand === 'stale') {
    return {
      answerProgressionMode: 'fresh_answer',
      preferredAngle: angleCandidates[0] || '',
      shouldAcknowledgePriorConversation: false,
    }
  }

  const previousAngle = interaction.lastAnswerAngle || interaction.lastAnswerSummary || ''
  const alternativeAngle = angleCandidates.find((candidate) => !isSameAngle(candidate, previousAngle))

  if (interaction.recencyBand === 'immediate') {
    if (alternativeAngle) {
      return {
        answerProgressionMode: interaction.inheritedFromRecentTopic ? 'diversify_answer' : 'deepen_answer',
        preferredAngle: alternativeAngle,
        shouldAcknowledgePriorConversation: true,
      }
    }

    return {
      answerProgressionMode: 'graceful_close',
      preferredAngle: previousAngle || angleCandidates[0] || '',
      shouldAcknowledgePriorConversation: true,
    }
  }

  if (interaction.recencyBand === 'same_day') {
    return {
      answerProgressionMode: alternativeAngle ? 'deepen_answer' : 'fuzzy_recall',
      preferredAngle: alternativeAngle || previousAngle || angleCandidates[0] || '',
      shouldAcknowledgePriorConversation: true,
    }
  }

  return {
    answerProgressionMode: 'fuzzy_recall',
    preferredAngle: alternativeAngle || previousAngle || angleCandidates[0] || '',
    shouldAcknowledgePriorConversation: true,
  }
}
