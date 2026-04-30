export type TwinStatus = 'draft' | 'seeded' | 'active' | 'shared'
export type TwinOriginType = 'bootstrap' | 'organic' | 'mixed'
export type TwinVersionChangeSource = 'bootstrap' | 'user_edit' | 'memory_growth' | 'rebuild'
export type TwinBootstrapStatus = 'in_progress' | 'completed' | 'abandoned'
export type TwinDialogueGrantStatus = 'active' | 'revoked'
export type DialogueMode = 'text' | 'voice'
export type DialogueCharacterKind = 'liva' | 'twin'
export type DialogueCharacterSource = 'system' | 'shared_twin' | 'own_twin'

export interface TwinVoiceCloneConfig {
  voiceUri: string
  model: string
  sampleTranscript: string
  source: 'user_sample'
  createdAt: string
  sampleDurationMs?: number
}

export interface TwinExpressionSnapshot {
  summary: string
  speakingTraits: string[]
  phrasebook: string[]
  comfortExamples: string[]
  conflictExamples: string[]
  storytellingExamples: string[]
  forbiddenPatterns: string[]
}

export interface TwinPersonaSnapshot {
  profile?: Record<string, unknown>
  summary?: string
  voiceStyleSummary?: string
  responseStyle?: string
  coreValues?: string[]
  boundaryRules?: string[]
  expression?: TwinExpressionSnapshot
  voiceClone?: TwinVoiceCloneConfig
}

export interface TwinProfile {
  id: string
  userId: string
  name: string
  status: TwinStatus
  originType: TwinOriginType
  personaSummary: string
  voiceStyleSummary: string
  responseStyle: string
  coreValues: string[]
  boundaryRules: string[]
  seedConfidence: number
  memoryReadinessScore: number
  styleReadinessScore: number
  shareEnabled: boolean
  portraitPath?: string
  portraitUrl?: string
  activeVersionId?: string
  createdAt: string
  updatedAt: string
}

export interface TwinDialogueGrant {
  id: string
  twinId: string
  ownerUserId: string
  granteeUserId: string
  displayLabel: string
  status: TwinDialogueGrantStatus
  createdAt: string
  updatedAt: string
}

export interface DialogueCharacter {
  id: string
  selectionKey: string
  kind: DialogueCharacterKind
  source: DialogueCharacterSource
  title: string
  subtitle: string
  avatarUrl?: string
  twinId?: string
  shareSummary?: string
}

export interface TwinVersion {
  id: string
  twinId: string
  versionNo: number
  changeSource: TwinVersionChangeSource
  personaSnapshot: TwinPersonaSnapshot
  factsSnapshot: Array<Record<string, unknown>>
  eventsSnapshot: Array<Record<string, unknown>>
  peopleSnapshot: Array<Record<string, unknown>>
  promptSnapshot: string
  createdAt: string
}

export type TwinChatRole = 'user' | 'assistant'
export type TwinTopicInteractionRecencyBand = 'new' | 'immediate' | 'same_day' | 'recent' | 'stale'
export type TwinAnswerProgressionMode =
  | 'fresh_answer'
  | 'deepen_answer'
  | 'diversify_answer'
  | 'graceful_close'
  | 'fuzzy_recall'

export interface TwinTopicInteractionContext {
  topicKey: string
  askerKey: string
  recencyBand: TwinTopicInteractionRecencyBand
  discussCount: number
  lastDiscussedAt?: string
  lastAnswerSummary?: string
  lastAnswerAngle?: string
  lastAnswerMode?: TwinAnswerProgressionMode
  inheritedFromRecentTopic?: boolean
}

export interface TwinTopicInteractionRecord extends TwinTopicInteractionContext {
  id: string
  twinId: string
  userId: string
  lastResponseExcerpt?: string
  createdAt: string
  updatedAt: string
}

export interface TwinChatMessage {
  role: TwinChatRole
  content: string
  displayContent?: string
  source?: 'text' | 'voice'
  trustLevel?: 'stable' | 'guarded' | 'risky'
  riskFlags?: string[]
}

export interface TwinBootstrapSession {
  id: string
  userId: string
  twinId?: string
  status: TwinBootstrapStatus
  stageIndex: number
  questionIndex: number
  questionCount: number
  answersCount: number
  summary: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface TwinBootstrapAnswer {
  id: string
  sessionId: string
  twinId?: string
  userId: string
  questionCode: TwinBootstrapQuestionCode
  questionText: string
  memoryId?: string
  transcript: string
  extractedFacts: Array<Record<string, unknown>>
  extractedEvents: Array<Record<string, unknown>>
  extractedProfileDelta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type TwinBootstrapQuestionCode =
  | 'identity_intro'
  | 'current_stage'
  | 'important_people'
  | 'family_tone'
  | 'turning_point_event'
  | 'timeline_break_year'
  | 'dislike_boundary'
  | 'comfort_style'
  | 'conflict_style'
  | 'decision_values'
  | 'comforting_others'
  | 'signature_story'

export interface TwinBootstrapQuestion {
  code: TwinBootstrapQuestionCode
  title: string
  prompt: string
  hint: string
  stageIndex: number
}

export interface TwinBootstrapStartResult {
  session: TwinBootstrapSession
  twin: TwinProfile
  question: {
    index: number
    total: number
    item: TwinBootstrapQuestion
  }
}

export interface TwinSeedCard {
  twinName: string
  personaSummary: string
  voiceStyleSummary: string
  responseStyle: string
  coreValues: string[]
  boundaryRules: string[]
  factsPreview: string[]
  eventsPreview: string[]
  expression: TwinExpressionSnapshot
  promptSnapshot: string
  seedConfidence: number
  memoryReadinessScore: number
  styleReadinessScore: number
}

export interface TwinBootstrapFinishResult {
  seedCard: TwinSeedCard
}
