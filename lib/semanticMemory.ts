import { supabase } from '@/lib/supabase'
import {
  SemanticEmbeddingStatus,
  SemanticEvidencePreview,
  SemanticMemoryChunk,
  SemanticMemorySearchHit,
  SemanticMemorySourceKind,
} from '@/types/semanticMemory'

const TABLE_NAME = 'semantic_memory_chunks'
const CHUNK_SOFT_LIMIT = 180
const CHUNK_HARD_LIMIT = 260
const SEARCH_CANDIDATE_LIMIT = 120

type SemanticMemoryRow = {
  id: string
  user_id: string
  memory_id: string
  chunk_index: number
  source_kind: SemanticMemorySourceKind
  chunk_text: string
  normalized_text: string
  chunk_summary: string
  tags: string[] | null
  person_hints: string[] | null
  place_hints: string[] | null
  time_hints: string[] | null
  transcript_created_at: string | null
  event_time_start: string | null
  event_time_end: string | null
  source_fact_ids: string[] | null
  source_event_ids: string[] | null
  importance: number
  confidence: number
  is_high_value: boolean
  evidence_status: 'active' | 'archived'
  embedding_status: SemanticEmbeddingStatus
  embedding_key: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type SyncSemanticMemoryTranscriptInput = {
  memoryId: string
  transcript: string
  summary?: string
  tags?: string[]
  transcriptCreatedAt?: string
  sourceKind?: SemanticMemorySourceKind
}

type AnnotateSemanticMemoryInput = {
  memoryId: string
  factIds?: string[]
  eventIds?: string[]
  keywordHints?: string[]
  personHints?: string[]
  placeHints?: string[]
  timeHints?: string[]
  importance?: number
}

type SearchSemanticMemoryInput = {
  query: string
  limit?: number
}

type SemanticMemoryResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }

function dedupeStrings(values: string[], limit = 12) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
}

function normalizeSemanticText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\u4e00-\u9fff]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeSemanticText(value: string) {
  const normalized = normalizeSemanticText(value)
  if (!normalized) {
    return [] as string[]
  }

  const asciiTokens = normalized.match(/[a-z0-9]+/g) ?? []
  const chineseSequences = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  const chineseTokens = chineseSequences.flatMap((sequence) => {
    const pieces = [sequence]
    for (let index = 0; index < sequence.length - 1; index += 1) {
      pieces.push(sequence.slice(index, index + 2))
    }
    if (sequence.length <= 4) {
      pieces.push(...sequence.split(''))
    }
    return pieces
  })

  return dedupeStrings(
    [...asciiTokens, ...chineseTokens].filter((token) => token.length > 1 || /[\u4e00-\u9fff]/.test(token)),
    24,
  )
}

function summarizeChunk(chunkText: string, transcriptSummary?: string) {
  const fallback = chunkText.trim()
  const summary = transcriptSummary?.trim()
  if (summary && fallback.length <= CHUNK_SOFT_LIMIT) {
    return fallback
  }

  if (fallback.length <= 96) {
    return fallback
  }

  return `${fallback.slice(0, 96).trim()}…`
}

function splitTranscriptIntoChunks(transcript: string) {
  const cleaned = transcript
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')

  if (!cleaned) {
    return [] as string[]
  }

  const units = cleaned
    .split(/(?<=[。！？!?；;，,])|\n+/)
    .map((unit) => unit.trim())
    .filter(Boolean)

  if (units.length === 0) {
    return [cleaned]
  }

  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    const value = current.trim()
    if (value) {
      chunks.push(value)
    }
    current = ''
  }

  const pushLongUnit = (unit: string) => {
    if (unit.length <= CHUNK_HARD_LIMIT) {
      chunks.push(unit)
      return
    }

    let cursor = 0
    while (cursor < unit.length) {
      chunks.push(unit.slice(cursor, cursor + CHUNK_HARD_LIMIT).trim())
      cursor += CHUNK_HARD_LIMIT
    }
  }

  for (const unit of units) {
    if (!current) {
      current = unit
      continue
    }

    const candidate = `${current}${current.endsWith('\n') ? '' : ' '}${unit}`.trim()
    if (candidate.length <= CHUNK_SOFT_LIMIT) {
      current = candidate
      continue
    }

    pushCurrent()

    if (unit.length > CHUNK_HARD_LIMIT) {
      pushLongUnit(unit)
      current = ''
      continue
    }

    current = unit
  }

  pushCurrent()
  return chunks.filter(Boolean)
}

function extractTimeHints(text: string) {
  const hints = [
    ...(text.match(/\b20\d{2}\b/g) ?? []),
    ...(text.match(/(?:今天|昨天|前天|明天|今年|去年|前年|明年|小时候|大学|高中|初中|童年|最近|现在)/g) ?? []),
  ]

  return dedupeStrings(hints, 8)
}

function extractPersonHints(text: string) {
  const hints = text.match(
    /(?:妈妈|爸爸|父亲|母亲|外婆|姥姥|奶奶|爷爷|外公|姥爷|姐姐|哥哥|弟弟|妹妹|儿子|女儿|爱人|老婆|老公|伴侣|前任|朋友|同事|老师|领导|孩子)/g,
  )

  return dedupeStrings(hints ?? [], 8)
}

function extractPlaceHints(text: string) {
  const explicit = text.match(/[\u4e00-\u9fff]{1,12}(?:市|省|区|县|镇|村|老家|故乡|学校|公司|医院|家)/g) ?? []
  const common = text.match(/(?:北京|上海|杭州|深圳|广州|南京|苏州|成都|武汉|西安)/g) ?? []
  return dedupeStrings([...explicit, ...common], 8)
}

function buildKeywordHints(text: string, tags: string[] = []) {
  return dedupeStrings([...tokenizeSemanticText(text), ...tags], 10)
}

function mapRowToChunk(row: SemanticMemoryRow): SemanticMemoryChunk {
  return {
    id: row.id,
    userId: row.user_id,
    memoryId: row.memory_id,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    chunkSummary: row.chunk_summary,
    sourceKind: row.source_kind,
    importance: row.importance,
    confidence: row.confidence,
    isHighValue: row.is_high_value,
    embeddingStatus: row.embedding_status,
    embeddingKey: row.embedding_key || undefined,
    transcriptCreatedAt: row.transcript_created_at || undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    personHints: Array.isArray(row.person_hints) ? row.person_hints : [],
    placeHints: Array.isArray(row.place_hints) ? row.place_hints : [],
    timeHints: Array.isArray(row.time_hints) ? row.time_hints : [],
    sourceFactIds: Array.isArray(row.source_fact_ids) ? row.source_fact_ids : [],
    sourceEventIds: Array.isArray(row.source_event_ids) ? row.source_event_ids : [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isSemanticTableMissingError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { code?: string; message?: string; details?: string }
  return candidate.code === '42P01' || candidate.message?.includes(TABLE_NAME) || candidate.details?.includes(TABLE_NAME) || false
}

async function getSessionUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session?.user?.id ?? null
}

function explainSemanticHit(row: SemanticMemoryChunk, queryTokens: string[], normalizedQuery: string) {
  let score = 0
  const reasons: string[] = []
  const haystack = normalizeSemanticText(row.chunkText)

  if (normalizedQuery && haystack.includes(normalizedQuery)) {
    score += 8
    reasons.push('matched full phrase')
  }

  let matchedTokenCount = 0
  for (const token of queryTokens) {
    if (!token) continue

    if (haystack.includes(token)) {
      score += 2
      matchedTokenCount += 1
      continue
    }

    const hintMatch = [...row.tags, ...row.personHints, ...row.placeHints, ...row.timeHints].some((hint) =>
      normalizeSemanticText(hint).includes(token),
    )

    if (hintMatch) {
      score += 1.5
      matchedTokenCount += 1
    }
  }

  if (matchedTokenCount > 0) {
    reasons.push(`matched ${matchedTokenCount} semantic hints`)
  }

  if (row.isHighValue) {
    score += 1.5
    reasons.push('confirmed-memory source')
  }

  score += row.importance * 2

  return {
    score,
    reasons,
  }
}

export async function syncSemanticMemoryTranscript(
  input: SyncSemanticMemoryTranscriptInput,
): Promise<SemanticMemoryResult<number>> {
  const userId = await getSessionUserId()

  if (!userId) {
    return { status: 'skipped', reason: 'no authenticated user session' }
  }

  const transcript = input.transcript.trim()
  if (!input.memoryId || !transcript) {
    return { status: 'skipped', reason: 'no transcript to sync' }
  }

  const sourceKind = input.sourceKind ?? 'raw_transcript'
  const chunks = splitTranscriptIntoChunks(transcript)
  if (chunks.length === 0) {
    return { status: 'skipped', reason: 'transcript produced no semantic chunks' }
  }

  const rows = chunks.map((chunkText, index) => ({
    user_id: userId,
    memory_id: input.memoryId,
    chunk_index: index,
    source_kind: sourceKind,
    chunk_text: chunkText,
    normalized_text: normalizeSemanticText(chunkText),
    chunk_summary: summarizeChunk(chunkText, input.summary),
    tags: dedupeStrings(input.tags ?? [], 8),
    person_hints: extractPersonHints(chunkText),
    place_hints: extractPlaceHints(chunkText),
    time_hints: extractTimeHints(chunkText),
    transcript_created_at: input.transcriptCreatedAt ?? null,
    event_time_start: null,
    event_time_end: null,
    source_fact_ids: [] as string[],
    source_event_ids: [] as string[],
    importance: 0.35,
    confidence: 0.6,
    is_high_value: false,
    evidence_status: 'active',
    embedding_status: 'skipped' as SemanticEmbeddingStatus,
    embedding_key: null as string | null,
    metadata: {
      memoryAdmissionState: 'raw',
      admissionSource: sourceKind,
      answerUse: 'evidence_only',
      transcriptLength: transcript.length,
      chunkCount: chunks.length,
      keywordHints: buildKeywordHints(chunkText, input.tags),
    },
  }))

  try {
    const { error: deleteError } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('user_id', userId)
      .eq('memory_id', input.memoryId)

    if (deleteError) {
      if (isSemanticTableMissingError(deleteError)) {
        return { status: 'skipped', reason: 'semantic substrate table is not available yet' }
      }

      throw deleteError
    }

    const { error: insertError } = await supabase.from(TABLE_NAME).insert(rows)

    if (insertError) {
      if (isSemanticTableMissingError(insertError)) {
        return { status: 'skipped', reason: 'semantic substrate table is not available yet' }
      }

      throw insertError
    }

    return { status: 'ok', data: rows.length }
  } catch (error) {
    console.error('Semantic memory transcript sync failed:', error)
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'semantic transcript sync failed',
    }
  }
}

export async function annotateSemanticMemoryForAssets(
  input: AnnotateSemanticMemoryInput,
): Promise<SemanticMemoryResult<number>> {
  const userId = await getSessionUserId()

  if (!userId) {
    return { status: 'skipped', reason: 'no authenticated user session' }
  }

  if (!input.memoryId) {
    return { status: 'skipped', reason: 'no memory id for semantic annotation' }
  }

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        'id, user_id, memory_id, chunk_index, source_kind, chunk_text, normalized_text, chunk_summary, tags, person_hints, place_hints, time_hints, transcript_created_at, event_time_start, event_time_end, source_fact_ids, source_event_ids, importance, confidence, is_high_value, evidence_status, embedding_status, embedding_key, metadata, created_at, updated_at',
      )
      .eq('user_id', userId)
      .eq('memory_id', input.memoryId)
      .eq('evidence_status', 'active')

    if (error) {
      if (isSemanticTableMissingError(error)) {
        return { status: 'skipped', reason: 'semantic substrate table is not available yet' }
      }

      throw error
    }

    const rows = ((data ?? []) as SemanticMemoryRow[]).map(mapRowToChunk)
    if (rows.length === 0) {
      return { status: 'skipped', reason: 'no semantic chunks found for memory' }
    }

    const updatedRows = rows.map((row) => ({
      id: row.id,
      user_id: row.userId,
      memory_id: row.memoryId,
      chunk_index: row.chunkIndex,
      source_kind: row.sourceKind,
      chunk_text: row.chunkText,
      normalized_text: normalizeSemanticText(row.chunkText),
      chunk_summary: row.chunkSummary,
      tags: dedupeStrings([...row.tags, ...(input.keywordHints ?? [])], 10),
      person_hints: dedupeStrings([...row.personHints, ...(input.personHints ?? [])], 8),
      place_hints: dedupeStrings([...row.placeHints, ...(input.placeHints ?? [])], 8),
      time_hints: dedupeStrings([...row.timeHints, ...(input.timeHints ?? [])], 8),
      transcript_created_at: row.transcriptCreatedAt ?? null,
      event_time_start: null,
      event_time_end: null,
      source_fact_ids: dedupeStrings([...row.sourceFactIds, ...(input.factIds ?? [])], 12),
      source_event_ids: dedupeStrings([...row.sourceEventIds, ...(input.eventIds ?? [])], 12),
      importance: Math.max(row.importance, input.importance ?? 0.82),
      confidence: Math.max(row.confidence, 0.78),
      is_high_value: true,
      evidence_status: 'active',
      embedding_status: row.embeddingStatus,
      embedding_key: row.embeddingKey ?? null,
      metadata: {
        ...row.metadata,
        memoryAdmissionState: 'confirmed',
        admissionSource: 'confirmed_asset_annotation',
        confirmedAt: new Date().toISOString(),
        keywordHints: dedupeStrings([
          ...(Array.isArray(row.metadata.keywordHints) ? (row.metadata.keywordHints as string[]) : []),
          ...(input.keywordHints ?? []),
        ]),
      },
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }))

    const { error: upsertError } = await supabase.from(TABLE_NAME).upsert(updatedRows, {
      onConflict: 'memory_id,chunk_index',
    })

    if (upsertError) {
      if (isSemanticTableMissingError(upsertError)) {
        return { status: 'skipped', reason: 'semantic substrate table is not available yet' }
      }

      throw upsertError
    }

    return { status: 'ok', data: updatedRows.length }
  } catch (error) {
    console.error('Semantic memory asset annotation failed:', error)
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : 'semantic asset annotation failed',
    }
  }
}

export async function searchSemanticMemoryEvidence(
  input: SearchSemanticMemoryInput,
): Promise<SemanticMemorySearchHit[]> {
  const userId = await getSessionUserId()
  if (!userId) {
    return []
  }

  const normalizedQuery = normalizeSemanticText(input.query)
  const queryTokens = tokenizeSemanticText(input.query)
  if (!normalizedQuery || queryTokens.length === 0) {
    return []
  }

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        'id, user_id, memory_id, chunk_index, source_kind, chunk_text, normalized_text, chunk_summary, tags, person_hints, place_hints, time_hints, transcript_created_at, event_time_start, event_time_end, source_fact_ids, source_event_ids, importance, confidence, is_high_value, evidence_status, embedding_status, embedding_key, metadata, created_at, updated_at',
      )
      .eq('user_id', userId)
      .eq('evidence_status', 'active')
      .order('is_high_value', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(SEARCH_CANDIDATE_LIMIT)

    if (error) {
      if (isSemanticTableMissingError(error)) {
        return []
      }

      throw error
    }

    return ((data ?? []) as SemanticMemoryRow[])
      .map(mapRowToChunk)
      .map((row) => {
        const scored = explainSemanticHit(row, queryTokens, normalizedQuery)
        return {
          chunkId: row.id,
          memoryId: row.memoryId,
          excerpt: row.chunkSummary || summarizeChunk(row.chunkText),
          score: scored.score,
          reasons: scored.reasons,
          isHighValue: row.isHighValue,
          importance: row.importance,
          transcriptCreatedAt: row.transcriptCreatedAt,
          tags: row.tags,
          personHints: row.personHints,
          placeHints: row.placeHints,
          timeHints: row.timeHints,
          metadata: row.metadata,
        } satisfies SemanticMemorySearchHit
      })
      .filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? 4)
  } catch (error) {
    console.error('Semantic memory search failed:', error)
    return []
  }
}

export async function listSemanticEvidencePreviews(
  memoryIds: string[],
  limitPerMemory = 2,
): Promise<Record<string, SemanticEvidencePreview[]>> {
  const userId = await getSessionUserId()
  if (!userId || memoryIds.length === 0) {
    return {}
  }

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(
        'id, user_id, memory_id, chunk_index, source_kind, chunk_text, normalized_text, chunk_summary, tags, person_hints, place_hints, time_hints, transcript_created_at, event_time_start, event_time_end, source_fact_ids, source_event_ids, importance, confidence, is_high_value, evidence_status, embedding_status, embedding_key, metadata, created_at, updated_at',
      )
      .eq('user_id', userId)
      .eq('evidence_status', 'active')
      .in('memory_id', memoryIds)
      .order('is_high_value', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(Math.max(memoryIds.length * limitPerMemory, 12))

    if (error) {
      if (isSemanticTableMissingError(error)) {
        return {}
      }

      throw error
    }

    const grouped: Record<string, SemanticEvidencePreview[]> = {}

    for (const row of (data ?? []) as SemanticMemoryRow[]) {
      const current = grouped[row.memory_id] ?? []
      if (current.length >= limitPerMemory) {
        continue
      }

      const reasons = []
      if (row.is_high_value) {
        reasons.push('confirmed-memory source')
      }
      if (Array.isArray(row.person_hints) && row.person_hints.length > 0) {
        reasons.push(`mentions ${row.person_hints[0]}`)
      } else if (Array.isArray(row.place_hints) && row.place_hints.length > 0) {
        reasons.push(`mentions ${row.place_hints[0]}`)
      } else {
        reasons.push('raw transcript evidence')
      }

      current.push({
        memoryId: row.memory_id,
        excerpt: row.chunk_summary || summarizeChunk(row.chunk_text),
        transcriptCreatedAt: row.transcript_created_at || undefined,
        reasons,
        score: row.is_high_value ? row.importance + 1 : row.importance,
      })
      grouped[row.memory_id] = current
    }

    return grouped
  } catch (error) {
    console.error('Semantic evidence preview query failed:', error)
    return {}
  }
}
