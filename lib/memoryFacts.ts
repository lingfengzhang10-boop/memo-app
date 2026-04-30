import { annotateSemanticMemoryForAssets } from '@/lib/semanticMemory'
import { supabase } from '@/lib/supabase'
import { MemoryFactCandidate } from '@/types/companion'

type MemoryFactRow = {
  user_id: string
  canonical_key: string | null
  fact_type: string
  subject: string
  predicate: string
  object_text: string
  value_json: Record<string, unknown>
  valid_time_type: string
  start_at: string | null
  end_at: string | null
  confidence: number
  source_memory_ids: string[]
  metadata: Record<string, unknown>
}

function normalizeFactCandidate(fact: MemoryFactCandidate, memoryId: string): MemoryFactRow {
  return {
    user_id: '',
    canonical_key: fact.canonicalKey?.trim() || null,
    fact_type: fact.factType.trim(),
    subject: fact.subject.trim(),
    predicate: fact.predicate.trim(),
    object_text: fact.objectText.trim(),
    value_json: fact.valueJson || {},
    valid_time_type: fact.validTimeType,
    start_at: fact.startAt || null,
    end_at: fact.endAt || null,
    confidence: fact.confidence,
    source_memory_ids: [memoryId],
    metadata: {
      ...(fact.metadata || {}),
      memoryAdmissionState: 'confirmed',
      admissionSource: 'user_confirmed_fact',
      confirmedAt: new Date().toISOString(),
    },
  }
}

function readMetadataHints(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function buildFactKeywordHints(fact: MemoryFactRow) {
  const metadataKeywords = readMetadataHints(fact.metadata, 'keywordHints')
  return [
    fact.subject,
    fact.predicate,
    fact.object_text,
    ...metadataKeywords,
  ].filter(Boolean)
}

function buildFactPersonHints(fact: MemoryFactRow) {
  return readMetadataHints(fact.metadata, 'personHints')
}

function buildFactPlaceHints(fact: MemoryFactRow) {
  return readMetadataHints(fact.metadata, 'placeHints')
}

function buildFactTimeHints(fact: MemoryFactRow) {
  return [
    fact.valid_time_type,
    ...readMetadataHints(fact.metadata, 'timeHints'),
    ...readMetadataHints(fact.metadata, 'stageHints'),
  ].filter(Boolean)
}

export async function saveMemoryFacts(memoryId: string, facts: MemoryFactCandidate[]) {
  if (!memoryId || facts.length === 0) {
    return
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return
  }

  const userId = session.user.id
  const normalizedFacts = facts
    .map((fact) => normalizeFactCandidate(fact, memoryId))
    .filter((fact) => fact.fact_type && fact.subject && fact.predicate)

  if (normalizedFacts.length === 0) {
    return
  }

  const rowsWithKey = normalizedFacts
    .filter((fact) => fact.canonical_key)
    .map((fact) => ({ ...fact, user_id: userId }))

  const rowsWithoutKey = normalizedFacts
    .filter((fact) => !fact.canonical_key)
    .map((fact) => ({ ...fact, user_id: userId }))

  if (rowsWithKey.length > 0) {
    const { data, error } = await supabase
      .from('memory_facts')
      .upsert(rowsWithKey, {
        onConflict: 'user_id,canonical_key',
      })
      .select('id')

    if (error) {
      console.error('保存 memory_facts(upsert) 失败:', error)
    } else {
      await annotateSemanticMemoryForAssets({
        memoryId,
        factIds: ((data ?? []) as Array<{ id: string }>).map((item) => item.id),
        keywordHints: rowsWithKey.flatMap(buildFactKeywordHints),
        personHints: rowsWithKey.flatMap(buildFactPersonHints),
        placeHints: rowsWithKey.flatMap(buildFactPlaceHints),
        timeHints: rowsWithKey.flatMap(buildFactTimeHints),
        importance: 0.84,
      })
    }
  }

  if (rowsWithoutKey.length > 0) {
    const { data, error } = await supabase
      .from('memory_facts')
      .insert(rowsWithoutKey)
      .select('id')

    if (error) {
      console.error('保存 memory_facts(insert) 失败:', error)
    } else {
      await annotateSemanticMemoryForAssets({
        memoryId,
        factIds: ((data ?? []) as Array<{ id: string }>).map((item) => item.id),
        keywordHints: rowsWithoutKey.flatMap(buildFactKeywordHints),
        personHints: rowsWithoutKey.flatMap(buildFactPersonHints),
        placeHints: rowsWithoutKey.flatMap(buildFactPlaceHints),
        timeHints: rowsWithoutKey.flatMap(buildFactTimeHints),
        importance: 0.84,
      })
    }
  }
}
