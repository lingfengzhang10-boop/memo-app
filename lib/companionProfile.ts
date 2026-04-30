import { CompanionProfile, CompanionProfileDelta } from '@/types/companion'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'nianji-companion-profile-v1'

type CompanionProfileRow = {
  version: number
  sessions: number
  style_summary: string
  catchphrases: string[]
  lexical_habits: string[]
  emotional_markers: string[]
  storytelling_patterns: string[]
  relationship_mentions: string[]
  memory_themes: string[]
  life_facts: string[]
  pacing: string
  pauses: string
  twin_notes: string
  last_transcript: string
  updated_at: string
}

export const EMPTY_COMPANION_PROFILE: CompanionProfile = {
  version: 1,
  sessions: 0,
  styleSummary: '',
  catchphrases: [],
  lexicalHabits: [],
  emotionalMarkers: [],
  storytellingPatterns: [],
  relationshipMentions: [],
  memoryThemes: [],
  lifeFacts: [],
  pacing: '',
  pauses: '',
  twinNotes: '',
  lastTranscript: '',
  lastUpdatedAt: '',
}

function uniqueMerge(base: string[], incoming: string[]): string[] {
  const merged = [...base, ...incoming]
    .map((item) => item.trim())
    .filter(Boolean)

  return Array.from(new Set(merged)).slice(0, 12)
}

function loadLocalCompanionProfile(): CompanionProfile {
  if (typeof window === 'undefined') {
    return EMPTY_COMPANION_PROFILE
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return EMPTY_COMPANION_PROFILE
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CompanionProfile>
    return {
      ...EMPTY_COMPANION_PROFILE,
      ...parsed,
    }
  } catch {
    return EMPTY_COMPANION_PROFILE
  }
}

function saveLocalCompanionProfile(profile: CompanionProfile) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

function rowToProfile(row: CompanionProfileRow): CompanionProfile {
  return {
    version: row.version ?? 1,
    sessions: row.sessions ?? 0,
    styleSummary: row.style_summary ?? '',
    catchphrases: row.catchphrases ?? [],
    lexicalHabits: row.lexical_habits ?? [],
    emotionalMarkers: row.emotional_markers ?? [],
    storytellingPatterns: row.storytelling_patterns ?? [],
    relationshipMentions: row.relationship_mentions ?? [],
    memoryThemes: row.memory_themes ?? [],
    lifeFacts: row.life_facts ?? [],
    pacing: row.pacing ?? '',
    pauses: row.pauses ?? '',
    twinNotes: row.twin_notes ?? '',
    lastTranscript: row.last_transcript ?? '',
    lastUpdatedAt: row.updated_at ?? '',
  }
}

function profileToRow(profile: CompanionProfile) {
  return {
    version: profile.version,
    sessions: profile.sessions,
    style_summary: profile.styleSummary,
    catchphrases: profile.catchphrases,
    lexical_habits: profile.lexicalHabits,
    emotional_markers: profile.emotionalMarkers,
    storytelling_patterns: profile.storytellingPatterns,
    relationship_mentions: profile.relationshipMentions,
    memory_themes: profile.memoryThemes,
    life_facts: profile.lifeFacts,
    pacing: profile.pacing,
    pauses: profile.pauses,
    twin_notes: profile.twinNotes,
    last_transcript: profile.lastTranscript,
    updated_at: profile.lastUpdatedAt || new Date().toISOString(),
  }
}

export function loadCompanionProfile(): CompanionProfile {
  return loadLocalCompanionProfile()
}

export async function loadCompanionProfileFromSupabase() {
  const localProfile = loadLocalCompanionProfile()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    return localProfile
  }

  const { data, error } = await supabase
    .from('companion_profiles')
    .select(`
      version,
      sessions,
      style_summary,
      catchphrases,
      lexical_habits,
      emotional_markers,
      storytelling_patterns,
      relationship_mentions,
      memory_themes,
      life_facts,
      pacing,
      pauses,
      twin_notes,
      last_transcript,
      updated_at
    `)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error || !data) {
    return localProfile
  }

  const remoteProfile = rowToProfile(data as CompanionProfileRow)
  saveLocalCompanionProfile(remoteProfile)
  return remoteProfile
}

export async function saveCompanionProfile(profile: CompanionProfile, sourceMemoryId?: string) {
  saveLocalCompanionProfile(profile)

  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    return
  }

  const { error } = await supabase
    .from('companion_profiles')
    .upsert(
      {
        user_id: session.user.id,
        source_memory_id: sourceMemoryId ?? null,
        ...profileToRow(profile),
      },
      {
        onConflict: 'user_id',
      }
    )

  if (error) {
    console.error('保存 companion_profiles 失败:', error)
  }
}

export function mergeCompanionProfile(
  current: CompanionProfile,
  delta: CompanionProfileDelta,
  transcript: string
): CompanionProfile {
  const now = new Date().toISOString()

  return {
    ...current,
    version: 1,
    sessions: current.sessions + 1,
    styleSummary: delta.styleSummary || current.styleSummary,
    catchphrases: uniqueMerge(current.catchphrases, delta.catchphrases),
    lexicalHabits: uniqueMerge(current.lexicalHabits, delta.lexicalHabits),
    emotionalMarkers: uniqueMerge(current.emotionalMarkers, delta.emotionalMarkers),
    storytellingPatterns: uniqueMerge(current.storytellingPatterns, delta.storytellingPatterns),
    relationshipMentions: uniqueMerge(current.relationshipMentions, delta.relationshipMentions),
    memoryThemes: uniqueMerge(current.memoryThemes, delta.memoryThemes),
    lifeFacts: uniqueMerge(current.lifeFacts, delta.lifeFacts),
    pacing: delta.pacing || current.pacing,
    pauses: delta.pauses || current.pauses,
    twinNotes: delta.twinNotes || current.twinNotes,
    lastTranscript: transcript,
    lastUpdatedAt: now,
  }
}
