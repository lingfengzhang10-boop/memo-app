export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      memories: {
        Row: {
          id: string
          user_id: string
          audio_url: string | null
          transcript: string | null
          summary: string
          tags: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          audio_url?: string | null
          transcript?: string | null
          summary?: string
          tags?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          audio_url?: string | null
          transcript?: string | null
          summary?: string
          tags?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
