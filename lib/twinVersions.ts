import { supabase } from '@/lib/supabase'
import { TwinPersonaSnapshot, TwinProfile, TwinSeedCard, TwinVersion } from '@/types/twin'

type CreateTwinVersionInput = {
  twinId: string
  personaSnapshot: TwinPersonaSnapshot
  factsSnapshot: Array<Record<string, unknown>>
  eventsSnapshot: Array<Record<string, unknown>>
  peopleSnapshot?: Array<Record<string, unknown>>
  promptSnapshot: string
  changeSource?: TwinVersion['changeSource']
}

type TwinVersionRow = {
  id: string
  twin_id: string
  version_no: number
  change_source: TwinVersion['changeSource']
  persona_snapshot: TwinPersonaSnapshot
  facts_snapshot: Array<Record<string, unknown>>
  events_snapshot: Array<Record<string, unknown>>
  people_snapshot: Array<Record<string, unknown>>
  prompt_snapshot: string
  created_at: string
}

type TwinProfileUpdateRow = {
  id: string
  user_id: string
  name: string
  status: TwinProfile['status']
  origin_type: TwinProfile['originType']
  persona_summary: string
  voice_style_summary: string
  response_style: string
  core_values: string[]
  boundary_rules: string[]
  seed_confidence: number
  memory_readiness_score: number
  style_readiness_score: number
  share_enabled: boolean
  portrait_path: string | null
  portrait_url: string | null
  active_version_id: string | null
  created_at: string
  updated_at: string
}

function mapTwinVersion(row: TwinVersionRow): TwinVersion {
  return {
    id: row.id,
    twinId: row.twin_id,
    versionNo: row.version_no,
    changeSource: row.change_source,
    personaSnapshot: row.persona_snapshot ?? {},
    factsSnapshot: Array.isArray(row.facts_snapshot) ? row.facts_snapshot : [],
    eventsSnapshot: Array.isArray(row.events_snapshot) ? row.events_snapshot : [],
    peopleSnapshot: Array.isArray(row.people_snapshot) ? row.people_snapshot : [],
    promptSnapshot: row.prompt_snapshot ?? '',
    createdAt: row.created_at,
  }
}

function mapTwinProfile(row: TwinProfileUpdateRow): TwinProfile {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    status: row.status,
    originType: row.origin_type,
    personaSummary: row.persona_summary,
    voiceStyleSummary: row.voice_style_summary,
    responseStyle: row.response_style,
    coreValues: Array.isArray(row.core_values) ? row.core_values : [],
    boundaryRules: Array.isArray(row.boundary_rules) ? row.boundary_rules : [],
    seedConfidence: row.seed_confidence,
    memoryReadinessScore: row.memory_readiness_score,
    styleReadinessScore: row.style_readiness_score,
    shareEnabled: row.share_enabled,
    portraitPath: row.portrait_path ?? undefined,
    portraitUrl: row.portrait_url ?? undefined,
    activeVersionId: row.active_version_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function requireSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    throw new Error('请先登录，再继续分身相关操作。')
  }

  return session.user
}

async function requireSessionUserId() {
  const user = await requireSession()
  return user.id
}

export async function createTwinVersion(input: CreateTwinVersionInput) {
  const user = await requireSession()

  const { data: twin, error: twinError } = await supabase
    .from('twin_profiles')
    .select('id')
    .eq('id', input.twinId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (twinError) {
    throw twinError
  }

  if (!twin) {
    throw new Error('当前分身不存在，无法创建版本。')
  }

  const { data: latestVersion, error: latestVersionError } = await supabase
    .from('twin_versions')
    .select('version_no')
    .eq('twin_id', input.twinId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestVersionError) {
    throw latestVersionError
  }

  const versionNo = (latestVersion?.version_no ?? 0) + 1

  const { data, error } = await supabase
    .from('twin_versions')
    .insert({
      twin_id: input.twinId,
      version_no: versionNo,
      change_source: input.changeSource ?? 'bootstrap',
      persona_snapshot: input.personaSnapshot,
      facts_snapshot: input.factsSnapshot,
      events_snapshot: input.eventsSnapshot,
      people_snapshot: input.peopleSnapshot ?? [],
      prompt_snapshot: input.promptSnapshot,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapTwinVersion(data as TwinVersionRow)
}

export async function getTwinVersion(id: string) {
  const user = await requireSession()

  const { data, error } = await supabase
    .from('twin_versions')
    .select('*, twin_profiles!inner(user_id)')
    .eq('id', id)
    .eq('twin_profiles.user_id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('当前分身版本不存在。')
  }

  return mapTwinVersion(data as unknown as TwinVersionRow)
}

export async function getAccessibleTwinVersion(id: string) {
  await requireSessionUserId()

  const { data, error } = await supabase
    .from('twin_versions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('当前分身版本不存在。')
  }

  return mapTwinVersion(data as TwinVersionRow)
}

export async function getActiveTwinVersion(twinId: string, activeVersionId?: string) {
  if (activeVersionId) {
    return getTwinVersion(activeVersionId)
  }

  const user = await requireSession()

  const { data, error } = await supabase
    .from('twin_versions')
    .select('*, twin_profiles!inner(user_id)')
    .eq('twin_id', twinId)
    .eq('twin_profiles.user_id', user.id)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('这个分身还没有可用版本。')
  }

  return mapTwinVersion(data as unknown as TwinVersionRow)
}

export async function getAccessibleActiveTwinVersion(twinId: string, activeVersionId?: string) {
  await requireSessionUserId()

  if (activeVersionId) {
    return getAccessibleTwinVersion(activeVersionId)
  }

  const { data, error } = await supabase
    .from('twin_versions')
    .select('*')
    .eq('twin_id', twinId)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('这个分身还没有可用版本。')
  }

  return mapTwinVersion(data as TwinVersionRow)
}

export async function updateTwinVersionPersonaSnapshot(
  versionId: string,
  personaSnapshot: TwinPersonaSnapshot,
) {
  await requireSession()

  const { data, error } = await supabase
    .from('twin_versions')
    .update({
      persona_snapshot: personaSnapshot,
    })
    .eq('id', versionId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapTwinVersion(data as TwinVersionRow)
}

type UpdateTwinProfileInput = {
  twinId: string
  card: TwinSeedCard
  activeVersionId: string
}

type UpdateTwinProfileFromVersionInput = {
  twinId: string
  activeVersionId: string
  personaSummary: string
  voiceStyleSummary: string
  responseStyle: string
  coreValues: string[]
  boundaryRules: string[]
  status?: TwinProfile['status']
}

export async function updateTwinProfileFromSeed(input: UpdateTwinProfileInput) {
  const user = await requireSession()

  const payload = {
    status: 'seeded',
    persona_summary: input.card.personaSummary,
    voice_style_summary: input.card.voiceStyleSummary,
    response_style: input.card.responseStyle,
    core_values: input.card.coreValues,
    boundary_rules: input.card.boundaryRules,
    seed_confidence: input.card.seedConfidence,
    memory_readiness_score: input.card.memoryReadinessScore,
    style_readiness_score: input.card.styleReadinessScore,
    active_version_id: input.activeVersionId,
  }

  const { data, error } = await supabase
    .from('twin_profiles')
    .update(payload)
    .eq('id', input.twinId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapTwinProfile(data as TwinProfileUpdateRow)
}

export async function updateTwinProfileFromVersion(input: UpdateTwinProfileFromVersionInput) {
  const user = await requireSession()

  const payload = {
    status: input.status ?? 'active',
    persona_summary: input.personaSummary,
    voice_style_summary: input.voiceStyleSummary,
    response_style: input.responseStyle,
    core_values: input.coreValues,
    boundary_rules: input.boundaryRules,
    active_version_id: input.activeVersionId,
  }

  const { data, error } = await supabase
    .from('twin_profiles')
    .update(payload)
    .eq('id', input.twinId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapTwinProfile(data as TwinProfileUpdateRow)
}

export async function activateTwinVersion(input: {
  twinId: string
  versionId: string
  status?: TwinProfile['status']
}) {
  const version = await getTwinVersion(input.versionId)
  const persona = version.personaSnapshot ?? {}

  return updateTwinProfileFromVersion({
    twinId: input.twinId,
    activeVersionId: version.id,
    personaSummary:
      (typeof persona.summary === 'string' && persona.summary.trim()) || '',
    voiceStyleSummary:
      (typeof persona.voiceStyleSummary === 'string' && persona.voiceStyleSummary.trim()) || '',
    responseStyle:
      (typeof persona.responseStyle === 'string' && persona.responseStyle.trim()) || '',
    coreValues: Array.isArray(persona.coreValues)
      ? persona.coreValues.filter((item): item is string => typeof item === 'string')
      : [],
    boundaryRules: Array.isArray(persona.boundaryRules)
      ? persona.boundaryRules.filter((item): item is string => typeof item === 'string')
      : [],
    status: input.status ?? 'active',
  })
}
