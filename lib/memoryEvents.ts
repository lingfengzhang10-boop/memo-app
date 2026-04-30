import { annotateSemanticMemoryForAssets } from '@/lib/semanticMemory'
import { supabase } from '@/lib/supabase'
import { MemoryEventCandidate } from '@/types/companion'

type MemoryEventRow = {
  user_id: string
  canonical_key: string | null
  title: string
  description: string
  time_type: string
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
  source_memory_ids: string[]
  metadata: Record<string, unknown>
}

function normalizeEventCandidate(event: MemoryEventCandidate, memoryId: string): MemoryEventRow {
  return {
    user_id: '',
    canonical_key: event.canonicalKey?.trim() || null,
    title: event.title.trim(),
    description: event.description.trim(),
    time_type: event.timeType,
    start_at: event.startAt || null,
    end_at: event.endAt || null,
    year: typeof event.year === 'number' ? event.year : null,
    age_at_event: typeof event.ageAtEvent === 'number' ? event.ageAtEvent : null,
    life_stage: event.lifeStage?.trim() || null,
    is_current: event.isCurrent,
    location_name: event.locationName?.trim() || null,
    emotion: event.emotion?.trim() || null,
    importance: event.importance,
    confidence: event.confidence,
    source_memory_ids: [memoryId],
    metadata: {
      ...(event.metadata || {}),
      memoryAdmissionState: 'confirmed',
      admissionSource: 'user_confirmed_event',
      confirmedAt: new Date().toISOString(),
    },
  }
}

export async function saveMemoryEvents(memoryId: string, events: MemoryEventCandidate[]) {
  if (!memoryId || events.length === 0) {
    return
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return
  }

  const userId = session.user.id
  const normalizedEvents = events
    .map((event) => normalizeEventCandidate(event, memoryId))
    .filter((event) => event.title)

  if (normalizedEvents.length === 0) {
    return
  }

  const rowsWithKey = normalizedEvents
    .filter((event) => event.canonical_key)
    .map((event) => ({ ...event, user_id: userId }))

  const rowsWithoutKey = normalizedEvents
    .filter((event) => !event.canonical_key)
    .map((event) => ({ ...event, user_id: userId }))

  if (rowsWithKey.length > 0) {
    const { data, error } = await supabase
      .from('memory_events')
      .upsert(rowsWithKey, {
        onConflict: 'user_id,canonical_key',
      })
      .select('id')

    if (error) {
      console.error('保存 memory_events(upsert) 失败:', error)
    } else {
      await annotateSemanticMemoryForAssets({
        memoryId,
        eventIds: ((data ?? []) as Array<{ id: string }>).map((item) => item.id),
        keywordHints: rowsWithKey.flatMap((event) => [event.title, event.description]),
        placeHints: rowsWithKey.flatMap((event) => (event.location_name ? [event.location_name] : [])),
        timeHints: rowsWithKey.flatMap((event) => {
          const hints = [event.time_type]
          if (typeof event.year === 'number') {
            hints.push(String(event.year))
          }
          if (event.life_stage) {
            hints.push(event.life_stage)
          }
          return hints
        }),
        importance: 0.88,
      })
    }
  }

  if (rowsWithoutKey.length > 0) {
    const { data, error } = await supabase
      .from('memory_events')
      .insert(rowsWithoutKey)
      .select('id')

    if (error) {
      console.error('保存 memory_events(insert) 失败:', error)
    } else {
      await annotateSemanticMemoryForAssets({
        memoryId,
        eventIds: ((data ?? []) as Array<{ id: string }>).map((item) => item.id),
        keywordHints: rowsWithoutKey.flatMap((event) => [event.title, event.description]),
        placeHints: rowsWithoutKey.flatMap((event) => (event.location_name ? [event.location_name] : [])),
        timeHints: rowsWithoutKey.flatMap((event) => {
          const hints = [event.time_type]
          if (typeof event.year === 'number') {
            hints.push(String(event.year))
          }
          if (event.life_stage) {
            hints.push(event.life_stage)
          }
          return hints
        }),
        importance: 0.88,
      })
    }
  }
}
