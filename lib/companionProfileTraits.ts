import {
  CompanionProfile,
  CompanionProfileDelta,
  CompanionProfileTrait,
  CompanionProfileTraitStatus,
  CompanionProfileTraitType,
  VoiceInputTrustLevel,
} from '@/types/companion'
import {
  EMPTY_COMPANION_PROFILE,
  loadCompanionProfileFromSupabase,
  saveCompanionProfile,
} from '@/lib/companionProfile'
import { supabase } from '@/lib/supabase'

const TRAITS_STORAGE_KEY = 'nianji-companion-profile-traits-v1'
const STALE_AFTER_DAYS = 180
const MAX_PROJECTION_ITEMS = 10

type TraitCandidate = {
  traitType: CompanionProfileTraitType
  displayText: string
  normalizedKey: string
  metadata: Record<string, unknown>
}

type CompanionProfileTraitRow = {
  id: string
  user_id: string
  trait_type: CompanionProfileTraitType
  normalized_key: string
  display_text: string
  support_count: number
  trust_score: number
  status: CompanionProfileTraitStatus
  source_memory_ids: string[] | null
  metadata: Record<string, unknown> | null
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

type TraitTypeConfig = {
  minSupport: number
  minTrust: number
  maxProjection: number
}

const TRAIT_CONFIG: Record<CompanionProfileTraitType, TraitTypeConfig> = {
  style_summary: { minSupport: 2, minTrust: 1.4, maxProjection: 1 },
  catchphrase: { minSupport: 2, minTrust: 1.2, maxProjection: 6 },
  lexical_habit: { minSupport: 2, minTrust: 1.2, maxProjection: 6 },
  emotional_marker: { minSupport: 2, minTrust: 1.2, maxProjection: 6 },
  storytelling_pattern: { minSupport: 2, minTrust: 1.2, maxProjection: 6 },
  relationship_mention: { minSupport: 2, minTrust: 1.2, maxProjection: 6 },
  memory_theme: { minSupport: 2, minTrust: 1.4, maxProjection: 6 },
  life_fact: { minSupport: 2, minTrust: 1.6, maxProjection: 8 },
  pacing: { minSupport: 2, minTrust: 1.4, maxProjection: 1 },
  pause_style: { minSupport: 2, minTrust: 1.4, maxProjection: 1 },
  twin_note_hint: { minSupport: 2, minTrust: 1.8, maxProjection: 2 },
}

function dedupeStrings(values: string[], limit = MAX_PROJECTION_ITEMS) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
}

function trimSpaces(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTraitKey(value: string) {
  return trimSpaces(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\u4e00-\u9fff]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function noisePattern(value: string) {
  return /(?:嘿嘿嘿|哈哈哈|呵呵呵|我我|啊啊啊|哦哦哦|嗯嗯嗯|啦啦啦|(.)\1{3,})/i.test(value)
}

function looksTooCasualForLongTerm(traitType: CompanionProfileTraitType, value: string) {
  if (traitType !== 'life_fact') {
    return false
  }

  return /(?:喜欢吃|爱吃|最喜欢吃|今天|刚刚|一下子|随口|开玩笑)/.test(value)
}

function isLikelyNoiseTrait(
  traitType: CompanionProfileTraitType,
  value: string,
  riskFlags: string[],
) {
  const normalized = trimSpaces(value)
  if (!normalized) {
    return true
  }

  if (normalized.length < 2) {
    return true
  }

  if (noisePattern(normalized)) {
    return true
  }

  if (/^[\p{P}\p{S}\s]+$/u.test(normalized)) {
    return true
  }

  if (riskFlags.some((flag) => flag.includes('laughter') || flag.includes('emoji'))) {
    return true
  }

  if (looksTooCasualForLongTerm(traitType, normalized)) {
    return true
  }

  return false
}

function mapRowToTrait(row: CompanionProfileTraitRow): CompanionProfileTrait {
  return {
    id: row.id,
    userId: row.user_id,
    traitType: row.trait_type,
    normalizedKey: row.normalized_key,
    displayText: row.display_text,
    supportCount: row.support_count,
    trustScore: row.trust_score,
    status: row.status,
    sourceMemoryIds: Array.isArray(row.source_memory_ids) ? row.source_memory_ids : [],
    metadata: row.metadata ?? {},
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function traitToRow(trait: CompanionProfileTrait) {
  return {
    id: trait.id,
    user_id: trait.userId,
    trait_type: trait.traitType,
    normalized_key: trait.normalizedKey,
    display_text: trait.displayText,
    support_count: trait.supportCount,
    trust_score: Number(trait.trustScore.toFixed(3)),
    status: trait.status,
    source_memory_ids: trait.sourceMemoryIds,
    metadata: trait.metadata,
    first_seen_at: trait.firstSeenAt,
    last_seen_at: trait.lastSeenAt,
  }
}

function traitWeight(trustLevel: VoiceInputTrustLevel) {
  if (trustLevel === 'stable') return 1
  if (trustLevel === 'guarded') return 0.6
  return 0.2
}

function supportIncrement(trustLevel: VoiceInputTrustLevel) {
  return trustLevel === 'risky' ? 0 : 1
}

function nextTraitStatus(
  traitType: CompanionProfileTraitType,
  supportCount: number,
  trustScore: number,
  lastSeenAt: string,
  forcedRejected = false,
): CompanionProfileTraitStatus {
  if (forcedRejected) {
    return 'rejected'
  }

  const config = TRAIT_CONFIG[traitType]
  const ageDays = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24)

  if (ageDays > STALE_AFTER_DAYS && supportCount < config.minSupport + 1) {
    return 'stale'
  }

  if (supportCount >= config.minSupport && trustScore >= config.minTrust) {
    return 'vetted'
  }

  return 'candidate'
}

function buildCandidateEntries(profileDelta: CompanionProfileDelta) {
  const entries: Array<[CompanionProfileTraitType, string[]]> = [
    ['style_summary', profileDelta.styleSummary ? [profileDelta.styleSummary] : []],
    ['catchphrase', profileDelta.catchphrases],
    ['lexical_habit', profileDelta.lexicalHabits],
    ['emotional_marker', profileDelta.emotionalMarkers],
    ['storytelling_pattern', profileDelta.storytellingPatterns],
    ['relationship_mention', profileDelta.relationshipMentions],
    ['memory_theme', profileDelta.memoryThemes],
    ['life_fact', profileDelta.lifeFacts],
    ['pacing', profileDelta.pacing ? [profileDelta.pacing] : []],
    ['pause_style', profileDelta.pauses ? [profileDelta.pauses] : []],
    ['twin_note_hint', profileDelta.twinNotes ? [profileDelta.twinNotes] : []],
  ]

  return entries
}

function deriveTraitCandidates(
  profileDelta: CompanionProfileDelta,
  riskFlags: string[],
): TraitCandidate[] {
  const candidates: TraitCandidate[] = []

  for (const [traitType, values] of buildCandidateEntries(profileDelta)) {
    for (const rawValue of values) {
      const displayText = trimSpaces(rawValue)
      const normalizedKey = normalizeTraitKey(displayText)

      if (!displayText || !normalizedKey) {
        continue
      }

      if (isLikelyNoiseTrait(traitType, displayText, riskFlags)) {
        candidates.push({
          traitType,
          displayText,
          normalizedKey,
          metadata: { rejectedByNoiseGate: true, riskFlags },
        })
        continue
      }

      candidates.push({
        traitType,
        displayText,
        normalizedKey,
        metadata: {},
      })
    }
  }

  return candidates
}

function loadLocalTraits() {
  if (typeof window === 'undefined') {
    return [] as CompanionProfileTrait[]
  }

  const raw = window.localStorage.getItem(TRAITS_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    return JSON.parse(raw) as CompanionProfileTrait[]
  } catch {
    return []
  }
}

function saveLocalTraits(traits: CompanionProfileTrait[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(TRAITS_STORAGE_KEY, JSON.stringify(traits))
}

async function getSessionUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session?.user?.id ?? null
}

async function loadRemoteTraits(userId: string) {
  const { data, error } = await supabase
    .from('companion_profile_traits')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    console.error('加载 companion_profile_traits 失败:', error)
    return [] as CompanionProfileTrait[]
  }

  return ((data ?? []) as CompanionProfileTraitRow[]).map(mapRowToTrait)
}

async function saveRemoteTraits(traits: CompanionProfileTrait[]) {
  if (traits.length === 0) {
    return
  }

  const rows = traits
    .filter((trait) => trait.userId)
    .map(traitToRow)

  if (rows.length === 0) {
    return
  }

  const { error } = await supabase.from('companion_profile_traits').upsert(rows, {
    onConflict: 'user_id,trait_type,normalized_key',
  })

  if (error) {
    console.error('保存 companion_profile_traits 失败:', error)
  }
}

function mergeTraitCandidates(
  existingTraits: CompanionProfileTrait[],
  candidates: TraitCandidate[],
  input: {
    memoryId?: string
    trustLevel: VoiceInputTrustLevel
    riskFlags: string[]
  },
) {
  const now = new Date().toISOString()
  const nextByKey = new Map<string, CompanionProfileTrait>(
    existingTraits.map((trait) => [`${trait.traitType}:${trait.normalizedKey}`, trait] as const),
  )

  for (const candidate of candidates) {
    const key = `${candidate.traitType}:${candidate.normalizedKey}`
    const current = nextByKey.get(key)
    const rejectedByNoise = Boolean(candidate.metadata.rejectedByNoiseGate)
    const weight = rejectedByNoise ? 0 : traitWeight(input.trustLevel)
    const increment = rejectedByNoise ? 0 : supportIncrement(input.trustLevel)

    const merged: CompanionProfileTrait = current
      ? {
          ...current,
          displayText: candidate.displayText,
          supportCount: current.supportCount + increment,
          trustScore: current.trustScore + weight,
          sourceMemoryIds: dedupeStrings(
            [...current.sourceMemoryIds, ...(input.memoryId ? [input.memoryId] : [])],
            12,
          ),
          metadata: {
            ...(current.metadata ?? {}),
            ...candidate.metadata,
            lastRiskFlags: input.riskFlags,
            lastTrustLevel: input.trustLevel,
          },
          lastSeenAt: now,
        }
      : {
          id: crypto.randomUUID(),
          traitType: candidate.traitType,
          normalizedKey: candidate.normalizedKey,
          displayText: candidate.displayText,
          supportCount: increment,
          trustScore: weight,
          status: 'candidate',
          sourceMemoryIds: input.memoryId ? [input.memoryId] : [],
          metadata: {
            ...candidate.metadata,
            lastRiskFlags: input.riskFlags,
            lastTrustLevel: input.trustLevel,
          },
          firstSeenAt: now,
          lastSeenAt: now,
        }

    merged.status = nextTraitStatus(
      merged.traitType,
      merged.supportCount,
      merged.trustScore,
      merged.lastSeenAt,
      rejectedByNoise,
    )

    nextByKey.set(key, merged)
  }

  return Array.from(nextByKey.values()).map((trait) => ({
    ...trait,
    status: nextTraitStatus(
      trait.traitType,
      trait.supportCount,
      trait.trustScore,
      trait.lastSeenAt,
      trait.status === 'rejected',
    ),
  }))
}

function pickTraitTexts(
  traits: CompanionProfileTrait[],
  traitType: CompanionProfileTraitType,
) {
  const config = TRAIT_CONFIG[traitType]

  return traits
    .filter((trait) => trait.traitType === traitType && trait.status === 'vetted')
    .sort((left, right) => {
      if (right.trustScore !== left.trustScore) {
        return right.trustScore - left.trustScore
      }
      return new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime()
    })
    .slice(0, config.maxProjection)
    .map((trait) => trait.displayText)
}

export function buildCompanionProfileProjection(input: {
  currentProfile?: CompanionProfile
  traits: CompanionProfileTrait[]
  transcript: string
  sessionDelta?: number
}) {
  const now = new Date().toISOString()
  const currentProfile = input.currentProfile ?? EMPTY_COMPANION_PROFILE
  const styleSummary = pickTraitTexts(input.traits, 'style_summary')[0] ?? ''
  const pacing = pickTraitTexts(input.traits, 'pacing')[0] ?? ''
  const pauses = pickTraitTexts(input.traits, 'pause_style')[0] ?? ''
  const twinNotes = pickTraitTexts(input.traits, 'twin_note_hint').join('；')

  return {
    ...EMPTY_COMPANION_PROFILE,
    version: 1,
    sessions: Math.max(currentProfile.sessions + (input.sessionDelta ?? 0), 0),
    styleSummary,
    catchphrases: dedupeStrings(pickTraitTexts(input.traits, 'catchphrase'), 6),
    lexicalHabits: dedupeStrings(pickTraitTexts(input.traits, 'lexical_habit'), 6),
    emotionalMarkers: dedupeStrings(pickTraitTexts(input.traits, 'emotional_marker'), 6),
    storytellingPatterns: dedupeStrings(pickTraitTexts(input.traits, 'storytelling_pattern'), 6),
    relationshipMentions: dedupeStrings(pickTraitTexts(input.traits, 'relationship_mention'), 6),
    memoryThemes: dedupeStrings(pickTraitTexts(input.traits, 'memory_theme'), 6),
    lifeFacts: dedupeStrings(pickTraitTexts(input.traits, 'life_fact'), 8),
    pacing,
    pauses,
    twinNotes,
    lastTranscript: input.transcript,
    lastUpdatedAt: now,
  } satisfies CompanionProfile
}

function refreshTraitStatuses(traits: CompanionProfileTrait[]) {
  return traits.map((trait) => ({
    ...trait,
    status: nextTraitStatus(
      trait.traitType,
      trait.supportCount,
      trait.trustScore,
      trait.lastSeenAt,
      trait.status === 'rejected' || Boolean(trait.metadata?.rejectedByNoiseGate),
    ),
  }))
}

export async function ingestCompanionProfileDelta(input: {
  currentProfile: CompanionProfile
  profileDelta: CompanionProfileDelta
  transcript: string
  memoryId?: string
  trustLevel?: VoiceInputTrustLevel
  riskFlags?: string[]
}) {
  const trustLevel = input.trustLevel ?? 'guarded'
  const riskFlags = input.riskFlags ?? []
  const candidates = deriveTraitCandidates(input.profileDelta, riskFlags)
  const userId = await getSessionUserId()
  const existingTraits = userId ? await loadRemoteTraits(userId) : loadLocalTraits()
  const mergedTraits = mergeTraitCandidates(existingTraits, candidates, {
    memoryId: input.memoryId,
    trustLevel,
    riskFlags,
  })
    .map((trait) => ({
      ...trait,
      userId: userId ?? trait.userId,
    }))
  const refreshedTraits = refreshTraitStatuses(mergedTraits)

  if (userId) {
    await saveRemoteTraits(refreshedTraits)
  } else {
    saveLocalTraits(refreshedTraits)
  }

  const nextProfile = buildCompanionProfileProjection({
    currentProfile: input.currentProfile,
    traits: refreshedTraits,
    transcript: input.transcript,
    sessionDelta: 1,
  })

  await saveCompanionProfile(nextProfile, input.memoryId)

  return {
    profile: nextProfile,
    traits: refreshedTraits,
    vettedTraits: refreshedTraits.filter((trait) => trait.status === 'vetted'),
  }
}

export async function loadCompanionProfileTraits() {
  const userId = await getSessionUserId()
  if (!userId) {
    return refreshTraitStatuses(loadLocalTraits())
  }

  return refreshTraitStatuses(await loadRemoteTraits(userId))
}

export async function loadCompanionProfileProjection() {
  const traits = await loadCompanionProfileTraits()
  const currentProfile = await loadCompanionProfileFromSupabase()
  return buildCompanionProfileProjection({
    currentProfile,
    traits,
    transcript: currentProfile.lastTranscript,
    sessionDelta: 0,
  })
}
