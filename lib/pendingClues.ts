import { MemoryEventCandidate, MemoryFactCandidate, PendingClue } from '@/types/companion'

function buildFactSentence(fact: MemoryFactCandidate) {
  const subject = fact.subject?.trim() || '这件事'
  const predicate = fact.predicate?.trim() || '有关'
  const objectText = fact.objectText?.trim() || ''
  return `${subject}${predicate}${objectText}`.trim()
}

function buildEventSentence(event: MemoryEventCandidate) {
  const timeLabel =
    typeof event.year === 'number'
      ? `${event.year}年`
      : event.lifeStage?.trim()
        ? `${event.lifeStage}`
        : event.isCurrent
          ? '现在'
          : ''

  const title = event.title?.trim() || '一段经历'
  const description = event.description?.trim()
  return [timeLabel, description || title].filter(Boolean).join('，')
}

function markCandidateAdmission<T extends { metadata: Record<string, unknown> }>(
  candidate: T,
  admissionSource: string,
): T {
  return {
    ...candidate,
    metadata: {
      ...candidate.metadata,
      memoryAdmissionState: 'candidate',
      admissionSource,
      candidateAt: new Date().toISOString(),
    },
  }
}

export function buildPendingFactClues(memoryId: string, transcript: string, facts: MemoryFactCandidate[]): PendingClue[] {
  return facts.map((fact, index) => ({
    id: `fact-${memoryId}-${index}-${Date.now()}`,
    kind: 'fact',
    memoryId,
    transcript,
    sentence: buildFactSentence(fact),
    fact: markCandidateAdmission(fact, 'pending_fact_clue'),
  }))
}

export function buildPendingEventClues(memoryId: string, transcript: string, events: MemoryEventCandidate[]): PendingClue[] {
  return events.map((event, index) => ({
    id: `event-${memoryId}-${index}-${Date.now()}`,
    kind: 'event',
    memoryId,
    transcript,
    sentence: buildEventSentence(event),
    event: markCandidateAdmission(event, 'pending_event_clue'),
  }))
}

export function refreshPendingClueSentence(clue: PendingClue): PendingClue {
  if (clue.kind === 'fact') {
    return {
      ...clue,
      sentence: buildFactSentence(clue.fact),
    }
  }

  return {
    ...clue,
    sentence: buildEventSentence(clue.event),
  }
}
