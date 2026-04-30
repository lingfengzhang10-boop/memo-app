import { listSemanticEvidencePreviews } from '@/lib/semanticMemory'
import { supabase } from '@/lib/supabase'
import {
  MemoirData,
  MemoirEntryDraft,
  MemoirEventDraft,
  MemoirFactDraft,
  MemoirSection,
  MemoryEvent,
  MemoryEventTimeType,
  MemoryFact,
  MemoryFactValidTimeType,
} from '@/types/companion'

type MemoryEventRow = {
  id: string
  user_id: string
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

type MemoryFactRow = {
  id: string
  user_id: string
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

function mapEventRow(row: MemoryEventRow): MemoryEvent {
  return {
    id: row.id,
    userId: row.user_id,
    canonicalKey: row.canonical_key || undefined,
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
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapFactRow(row: MemoryFactRow): MemoryFact {
  return {
    id: row.id,
    userId: row.user_id,
    canonicalKey: row.canonical_key || undefined,
    factType: row.fact_type,
    subject: row.subject,
    predicate: row.predicate,
    objectText: row.object_text,
    valueJson: row.value_json || {},
    validTimeType: row.valid_time_type,
    startAt: row.start_at || undefined,
    endAt: row.end_at || undefined,
    confidence: row.confidence,
    sourceMemoryIds: Array.isArray(row.source_memory_ids) ? row.source_memory_ids : [],
    supersedesFactId: row.supersedes_fact_id || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildEventTimeLabel(event: Pick<MemoryEvent, 'year' | 'lifeStage' | 'isCurrent' | 'timeType'>) {
  if (typeof event.year === 'number') {
    return `${event.year}年`
  }

  if (event.lifeStage?.trim()) {
    return event.lifeStage.trim()
  }

  if (event.isCurrent || event.timeType === 'current') {
    return '当前阶段'
  }

  return '时间未定'
}

function buildFactTimeLabel(fact: Pick<MemoryFact, 'validTimeType'>) {
  switch (fact.validTimeType) {
    case 'current':
      return '当前'
    case 'temporary':
      return '阶段性'
    case 'past':
      return '过去'
    case 'long_term':
      return '长期'
    default:
      return '时间未定'
  }
}

function toEventDraft(event: MemoryEvent): MemoirEventDraft {
  return {
    kind: 'event',
    id: event.id,
    title: event.title,
    description: event.description,
    year: event.year,
    lifeStage: event.lifeStage,
    locationName: event.locationName,
    timeLabel: buildEventTimeLabel(event),
    sourceMemoryIds: event.sourceMemoryIds ?? [],
  }
}

function toFactDraft(fact: MemoryFact): MemoirFactDraft {
  return {
    kind: 'fact',
    id: fact.id,
    subject: fact.subject,
    predicate: fact.predicate,
    objectText: fact.objectText,
    validTimeType: fact.validTimeType,
    timeLabel: buildFactTimeLabel(fact),
    sourceMemoryIds: fact.sourceMemoryIds ?? [],
  }
}

function sortMemoirEntries(entries: MemoirEntryDraft[]) {
  return [...entries].sort((left, right) => {
    if (left.kind === 'event' && right.kind === 'event') {
      return (left.year ?? 999999) - (right.year ?? 999999)
    }

    if (left.kind === 'event') return -1
    if (right.kind === 'event') return 1
    return left.timeLabel.localeCompare(right.timeLabel, 'zh-CN')
  })
}

function buildMemoirSections(events: MemoryEvent[], facts: MemoryFact[]): MemoirSection[] {
  const sections = new Map<string, MemoirSection>()

  const ensureSection = (id: string, title: string, summary: string) => {
    const existing = sections.get(id)
    if (existing) {
      return existing
    }

    const next: MemoirSection = {
      id,
      title,
      summary,
      entries: [],
    }

    sections.set(id, next)
    return next
  }

  for (const event of events) {
    const sectionId =
      typeof event.year === 'number'
        ? `year-${event.year}`
        : event.lifeStage?.trim()
          ? `stage-${event.lifeStage.trim()}`
          : event.isCurrent
            ? 'current'
            : 'unknown'

    const sectionTitle =
      typeof event.year === 'number'
        ? `${event.year}年`
        : event.lifeStage?.trim() || (event.isCurrent ? '当前阶段' : '时间未定')

    const sectionSummary =
      typeof event.year === 'number'
        ? '这一年里被明确讲出来的关键经历。'
        : event.isCurrent
          ? '当前仍在发生或仍然影响你的经历。'
          : '那些被提到，但时间还不够确定的经历。'

    ensureSection(sectionId, sectionTitle, sectionSummary).entries.push(toEventDraft(event))
  }

  const currentFacts = facts.filter((fact) => fact.validTimeType === 'current' || fact.validTimeType === 'temporary')

  if (currentFacts.length > 0) {
    ensureSection('current-facts', '当前状态', '当前仍在成立或正在影响你的事实与状态。').entries.push(
      ...currentFacts.map(toFactDraft),
    )
  }

  const stableFacts = facts.filter((fact) => !currentFacts.includes(fact))

  if (stableFacts.length > 0) {
    ensureSection('stable-facts', '长期事实', '反复被确认、相对稳定的长期事实。').entries.push(
      ...stableFacts.map(toFactDraft),
    )
  }

  return [...sections.values()]
    .map((section) => ({
      ...section,
      entries: sortMemoirEntries(section.entries),
    }))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
}

function attachEvidenceToSections(
  sections: MemoirSection[],
  evidenceByMemoryId: Record<string, Awaited<ReturnType<typeof listSemanticEvidencePreviews>>[string]>,
) {
  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => {
      const semanticEvidence = entry.sourceMemoryIds.flatMap((memoryId) => evidenceByMemoryId[memoryId] ?? []).slice(0, 2)
      return semanticEvidence.length > 0 ? { ...entry, semanticEvidence } : entry
    }),
  }))
}

export async function fetchMemoirData(): Promise<MemoirData> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return {
      sections: [],
      eventCount: 0,
      factCount: 0,
    }
  }

  const [eventsResult, factsResult] = await Promise.all([
    supabase
      .from('memory_events')
      .select('*')
      .order('year', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('memory_facts')
      .select('*')
      .order('created_at', { ascending: true }),
  ])

  if (eventsResult.error) {
    throw eventsResult.error
  }

  if (factsResult.error) {
    throw factsResult.error
  }

  const events = ((eventsResult.data ?? []) as MemoryEventRow[]).map(mapEventRow)
  const facts = ((factsResult.data ?? []) as MemoryFactRow[]).map(mapFactRow)
  const sections = buildMemoirSections(events, facts)
  const sourceMemoryIds = Array.from(
    new Set(sections.flatMap((section) => section.entries.flatMap((entry) => entry.sourceMemoryIds))),
  )
  const evidenceByMemoryId = await listSemanticEvidencePreviews(sourceMemoryIds, 2)

  return {
    sections: attachEvidenceToSections(sections, evidenceByMemoryId),
    eventCount: events.length,
    factCount: facts.length,
  }
}

export async function updateMemoirEntry(entry: MemoirEntryDraft) {
  if (entry.kind === 'event') {
    const { error } = await supabase
      .from('memory_events')
      .update({
        title: entry.title.trim(),
        description: entry.description.trim(),
        year: typeof entry.year === 'number' ? entry.year : null,
        life_stage: entry.lifeStage?.trim() || null,
        location_name: entry.locationName?.trim() || null,
      })
      .eq('id', entry.id)

    if (error) {
      throw error
    }

    return
  }

  const { error } = await supabase
    .from('memory_facts')
    .update({
      subject: entry.subject.trim(),
      predicate: entry.predicate.trim(),
      object_text: entry.objectText.trim(),
      valid_time_type: entry.validTimeType,
    })
    .eq('id', entry.id)

  if (error) {
    throw error
  }
}
