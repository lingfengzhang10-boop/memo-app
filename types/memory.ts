export interface Memory {
  id: string
  user_id: string
  audio_url: string | null
  transcript: string | null
  summary: string
  tags: string[]
  created_at: string
  updated_at?: string
}

export interface MemoryInsert {
  id?: string
  user_id: string
  audio_url?: string | null
  transcript?: string | null
  summary?: string
  tags?: string[]
  created_at?: string
}

export interface MemoryUpdate {
  audio_url?: string | null
  transcript?: string | null
  summary?: string
  tags?: string[]
}
