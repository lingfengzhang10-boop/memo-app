import { CompanionProfileDelta, MemoryEventCandidate, MemoryFactCandidate } from '@/types/companion'
import { supabase } from '@/lib/supabase'
import { TwinBootstrapAnswer, TwinBootstrapQuestionCode } from '@/types/twin'

type TwinBootstrapAnswerRow = {
  id: string
  session_id: string
  twin_id: string | null
  user_id: string
  question_code: TwinBootstrapQuestionCode
  question_text: string
  memory_id: string | null
  transcript: string
  extracted_facts: Array<Record<string, unknown>>
  extracted_events: Array<Record<string, unknown>>
  extracted_profile_delta: Record<string, unknown>
  created_at: string
  updated_at: string
}

type SaveTwinBootstrapAnswerInput = {
  sessionId: string
  twinId?: string
  questionCode: TwinBootstrapQuestionCode
  questionText: string
  memoryId?: string
  transcript: string
  facts: MemoryFactCandidate[]
  events: MemoryEventCandidate[]
  profileDelta: CompanionProfileDelta
}

function mapTwinBootstrapAnswer(row: TwinBootstrapAnswerRow): TwinBootstrapAnswer {
  return {
    id: row.id,
    sessionId: row.session_id,
    twinId: row.twin_id ?? undefined,
    userId: row.user_id,
    questionCode: row.question_code,
    questionText: row.question_text,
    memoryId: row.memory_id ?? undefined,
    transcript: row.transcript,
    extractedFacts: Array.isArray(row.extracted_facts) ? row.extracted_facts : [],
    extractedEvents: Array.isArray(row.extracted_events) ? row.extracted_events : [],
    extractedProfileDelta: row.extracted_profile_delta ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function saveTwinBootstrapAnswer(input: SaveTwinBootstrapAnswerInput) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    throw new Error('请先登录，再继续这轮建模。')
  }

  const { data, error } = await supabase
    .from('twin_bootstrap_answers')
    .insert({
      session_id: input.sessionId,
      twin_id: input.twinId ?? null,
      user_id: session.user.id,
      question_code: input.questionCode,
      question_text: input.questionText,
      memory_id: input.memoryId ?? null,
      transcript: input.transcript,
      extracted_facts: input.facts,
      extracted_events: input.events,
      extracted_profile_delta: input.profileDelta,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapTwinBootstrapAnswer(data as TwinBootstrapAnswerRow)
}

export async function listTwinBootstrapAnswers(sessionId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    throw new Error('请先登录，再继续这轮建模。')
  }

  const { data, error } = await supabase
    .from('twin_bootstrap_answers')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return ((data ?? []) as TwinBootstrapAnswerRow[]).map(mapTwinBootstrapAnswer)
}

export async function updateTwinBootstrapAnswer(
  answerId: string,
  updates: Partial<{
    transcript: string
    memoryId: string
    extractedFacts: Array<Record<string, unknown>>
    extractedEvents: Array<Record<string, unknown>>
    extractedProfileDelta: Record<string, unknown>
  }>,
) {
  const payload: Record<string, unknown> = {}

  if (typeof updates.transcript === 'string') payload.transcript = updates.transcript
  if (typeof updates.memoryId === 'string') payload.memory_id = updates.memoryId
  if (updates.extractedFacts) payload.extracted_facts = updates.extractedFacts
  if (updates.extractedEvents) payload.extracted_events = updates.extractedEvents
  if (updates.extractedProfileDelta) payload.extracted_profile_delta = updates.extractedProfileDelta

  const { data, error } = await supabase
    .from('twin_bootstrap_answers')
    .update(payload)
    .eq('id', answerId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapTwinBootstrapAnswer(data as TwinBootstrapAnswerRow)
}
