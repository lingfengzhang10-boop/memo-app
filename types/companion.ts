import { SemanticEvidencePreview } from '@/types/semanticMemory'

export interface CompanionProfile {
  version: number
  sessions: number
  styleSummary: string
  catchphrases: string[]
  lexicalHabits: string[]
  emotionalMarkers: string[]
  storytellingPatterns: string[]
  relationshipMentions: string[]
  memoryThemes: string[]
  lifeFacts: string[]
  pacing: string
  pauses: string
  twinNotes: string
  lastTranscript: string
  lastUpdatedAt: string
}

export interface CompanionProfileDelta {
  styleSummary: string
  catchphrases: string[]
  lexicalHabits: string[]
  emotionalMarkers: string[]
  storytellingPatterns: string[]
  relationshipMentions: string[]
  memoryThemes: string[]
  lifeFacts: string[]
  pacing: string
  pauses: string
  twinNotes: string
}

export type CompanionProfileTraitType =
  | 'style_summary'
  | 'catchphrase'
  | 'lexical_habit'
  | 'emotional_marker'
  | 'storytelling_pattern'
  | 'relationship_mention'
  | 'memory_theme'
  | 'life_fact'
  | 'pacing'
  | 'pause_style'
  | 'twin_note_hint'

export type CompanionProfileTraitStatus = 'candidate' | 'vetted' | 'rejected' | 'stale'

export interface CompanionProfileTrait {
  id: string
  userId?: string
  traitType: CompanionProfileTraitType
  normalizedKey: string
  displayText: string
  supportCount: number
  trustScore: number
  status: CompanionProfileTraitStatus
  sourceMemoryIds: string[]
  metadata: Record<string, unknown>
  firstSeenAt: string
  lastSeenAt: string
  createdAt?: string
  updatedAt?: string
}

export interface RecordingReflection {
  transcript: string
  displayTranscript?: string
  summary: string
  tags: string[]
  feedback: string
  followUpPrompt: string
  profileDelta: CompanionProfileDelta
  trustLevel?: VoiceInputTrustLevel
  riskFlags?: string[]
  usedRepair?: boolean
}

export interface QuickRecordingReflection {
  transcript: string
  displayTranscript?: string
  summary: string
  tags: string[]
  feedback: string
  followUpPrompt: string
  trustLevel?: VoiceInputTrustLevel
  riskFlags?: string[]
  usedRepair?: boolean
}

export interface ProfileExtractionResult {
  profileDelta: CompanionProfileDelta
}

export type MemoryEventTimeType = 'exact' | 'year' | 'age' | 'relative' | 'current' | 'unknown'
export type MemoryFactValidTimeType = 'current' | 'long_term' | 'past' | 'temporary' | 'unknown'

export interface MemoryEvent {
  id: string
  userId: string
  canonicalKey?: string
  title: string
  description: string
  timeType: MemoryEventTimeType
  startAt?: string
  endAt?: string
  year?: number
  ageAtEvent?: number
  lifeStage?: string
  isCurrent: boolean
  locationName?: string
  emotion?: string
  importance: number
  confidence: number
  sourceMemoryIds: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MemoryEventCandidate {
  canonicalKey?: string
  title: string
  description: string
  timeType: MemoryEventTimeType
  startAt?: string
  endAt?: string
  year?: number
  ageAtEvent?: number
  lifeStage?: string
  isCurrent: boolean
  locationName?: string
  emotion?: string
  importance: number
  confidence: number
  metadata: Record<string, unknown>
}

export interface MemoryFact {
  id: string
  userId: string
  canonicalKey?: string
  factType: string
  subject: string
  predicate: string
  objectText: string
  valueJson: Record<string, unknown>
  validTimeType: MemoryFactValidTimeType
  startAt?: string
  endAt?: string
  confidence: number
  sourceMemoryIds: string[]
  supersedesFactId?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MemoryFactCandidate {
  canonicalKey?: string
  factType: string
  subject: string
  predicate: string
  objectText: string
  valueJson: Record<string, unknown>
  validTimeType: MemoryFactValidTimeType
  startAt?: string
  endAt?: string
  confidence: number
  metadata: Record<string, unknown>
}

export interface FactExtractionResult {
  facts: MemoryFactCandidate[]
}

export interface EventExtractionResult {
  events: MemoryEventCandidate[]
}

export type PendingClueKind = 'fact' | 'event'

export interface PendingFactClue {
  id: string
  kind: 'fact'
  memoryId: string
  transcript: string
  sentence: string
  fact: MemoryFactCandidate
}

export interface PendingEventClue {
  id: string
  kind: 'event'
  memoryId: string
  transcript: string
  sentence: string
  event: MemoryEventCandidate
}

export type PendingClue = PendingFactClue | PendingEventClue

export interface CorrectionTranscriptionResult {
  transcript: string
}

export type VoiceInputTrustLevel = 'stable' | 'guarded' | 'risky'

export interface VoiceInputTranscriptionResult extends CorrectionTranscriptionResult {
  trustedTranscript?: string
  displayTranscript?: string
  trustLevel?: VoiceInputTrustLevel
  riskFlags?: string[]
  usedRepair?: boolean
}

export interface ClueCorrectionResult {
  clue: PendingClue | null
}

export interface PersonEntity {
  id: string
  userId: string
  canonicalName: string
  displayName: string
  aliases: string[]
  gender?: string
  notes: string
  confidence: number
  sourceMemoryIds: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type RelationshipStatus = 'active' | 'past' | 'unclear'

export interface PersonRelationship {
  id: string
  userId: string
  personId: string
  relationType: string
  relationLabel?: string
  closeness: number
  sentiment?: string
  status: RelationshipStatus
  startAt?: string
  endAt?: string
  confidence: number
  sourceMemoryIds: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MemorySpeechFeatures {
  id: string
  userId: string
  memoryId: string
  speakingRateWpm?: number
  avgPauseMs?: number
  longestPauseMs?: number
  pauseCount?: number
  fillerWords: string[]
  fillerWordCount?: number
  sentenceLengthAvg?: number
  energyLabel?: string
  prosodyNotes: string
  confidence: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type MemoirEntryKind = 'event' | 'fact'

export interface MemoirEventDraft {
  kind: 'event'
  id: string
  title: string
  description: string
  year?: number
  lifeStage?: string
  locationName?: string
  timeLabel: string
  sourceMemoryIds: string[]
  semanticEvidence?: SemanticEvidencePreview[]
}

export interface MemoirFactDraft {
  kind: 'fact'
  id: string
  subject: string
  predicate: string
  objectText: string
  validTimeType: MemoryFactValidTimeType
  timeLabel: string
  sourceMemoryIds: string[]
  semanticEvidence?: SemanticEvidencePreview[]
}

export type MemoirEntryDraft = MemoirEventDraft | MemoirFactDraft

export interface MemoirSection {
  id: string
  title: string
  summary: string
  entries: MemoirEntryDraft[]
}

export interface MemoirData {
  sections: MemoirSection[]
  eventCount: number
  factCount: number
}
