export type SemanticMemorySourceKind = 'raw_transcript' | 'confirmed_fact' | 'confirmed_event'
export type SemanticEmbeddingStatus = 'pending' | 'ready' | 'failed' | 'skipped'

export interface SemanticMemoryChunk {
  id: string
  userId: string
  memoryId: string
  chunkIndex: number
  chunkText: string
  chunkSummary: string
  sourceKind: SemanticMemorySourceKind
  importance: number
  confidence: number
  isHighValue: boolean
  embeddingStatus: SemanticEmbeddingStatus
  embeddingKey?: string
  transcriptCreatedAt?: string
  tags: string[]
  personHints: string[]
  placeHints: string[]
  timeHints: string[]
  sourceFactIds: string[]
  sourceEventIds: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SemanticMemorySearchHit {
  chunkId: string
  memoryId: string
  excerpt: string
  score: number
  reasons: string[]
  isHighValue: boolean
  importance: number
  transcriptCreatedAt?: string
  tags: string[]
  personHints: string[]
  placeHints: string[]
  timeHints: string[]
  metadata: Record<string, unknown>
}

export interface SemanticEvidencePreview {
  memoryId: string
  excerpt: string
  transcriptCreatedAt?: string
  reasons: string[]
  score: number
}
