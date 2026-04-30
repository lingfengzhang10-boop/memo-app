import { getFileExtension } from '@/lib/audioMime'
import { supabase } from '@/lib/supabase'
import { getTwinBootstrapQuestion, TWIN_BOOTSTRAP_QUESTIONS } from '@/lib/twinBootstrap'
import {
  TwinBootstrapSession,
  TwinBootstrapStartResult,
  TwinDialogueGrant,
  TwinProfile,
} from '@/types/twin'

type TwinProfileRow = {
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

type TwinBootstrapSessionRow = {
  id: string
  user_id: string
  twin_id: string | null
  status: TwinBootstrapSession['status']
  stage_index: number
  question_index: number
  question_count: number
  answers_count: number
  summary: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

type TwinDialogueGrantRow = {
  id: string
  twin_id: string
  owner_user_id: string
  grantee_user_id: string
  display_label: string
  status: TwinDialogueGrant['status']
  created_at: string
  updated_at: string
}

type TwinDialogueGrantWithProfileRow = TwinDialogueGrantRow & {
  twin_profiles: TwinProfileRow | TwinProfileRow[] | null
}

function normalizeNestedTwinProfile(value: TwinProfileRow | TwinProfileRow[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function mapTwinProfile(row: TwinProfileRow): TwinProfile {
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

function mapBootstrapSession(row: TwinBootstrapSessionRow): TwinBootstrapSession {
  return {
    id: row.id,
    userId: row.user_id,
    twinId: row.twin_id ?? undefined,
    status: row.status,
    stageIndex: row.stage_index,
    questionIndex: row.question_index,
    questionCount: row.question_count,
    answersCount: row.answers_count,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  }
}

function mapTwinDialogueGrant(row: TwinDialogueGrantRow): TwinDialogueGrant {
  return {
    id: row.id,
    twinId: row.twin_id,
    ownerUserId: row.owner_user_id,
    granteeUserId: row.grantee_user_id,
    displayLabel: row.display_label,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildDefaultTwinName(email?: string | null) {
  const prefix = email?.split('@')[0]?.trim()
  return prefix ? `${prefix} 的分身` : '我的分身'
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

async function getUserTwinRow(userId: string) {
  const { data, error } = await supabase
    .from('twin_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as TwinProfileRow | null) ?? null
}

async function getOrCreateUserTwin(userId: string, email?: string | null, proposedName?: string) {
  const existing = await getUserTwinRow(userId)
  if (existing) {
    return mapTwinProfile(existing)
  }

  const { data: twinRow, error: twinInsertError } = await supabase
    .from('twin_profiles')
    .insert({
      user_id: userId,
      name: proposedName?.trim() || buildDefaultTwinName(email),
      status: 'draft',
      origin_type: 'bootstrap',
      persona_summary: '',
      voice_style_summary: '',
      response_style: '',
      core_values: [],
      boundary_rules: [],
      seed_confidence: 0.5,
      memory_readiness_score: 0,
      style_readiness_score: 0,
      share_enabled: false,
      portrait_path: '',
      portrait_url: '',
    })
    .select('*')
    .single()

  if (twinInsertError) {
    throw twinInsertError
  }

  return mapTwinProfile(twinRow as TwinProfileRow)
}

async function getGrantedTwinRow(twinId: string, userId: string) {
  const { data, error } = await supabase
    .from('twin_dialogue_grants')
    .select(
      `
        id,
        twin_id,
        owner_user_id,
        grantee_user_id,
        display_label,
        status,
        created_at,
        updated_at,
        twin_profiles!inner(*)
      `,
    )
    .eq('grantee_user_id', userId)
    .eq('twin_id', twinId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw error
  }

  const nested = normalizeNestedTwinProfile((data as TwinDialogueGrantWithProfileRow | null)?.twin_profiles)
  return nested ? mapTwinProfile(nested) : null
}

export async function getTwinProfile(id: string) {
  const user = await requireSession()

  const { data, error } = await supabase
    .from('twin_profiles')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('当前分身不存在，或你没有访问权限。')
  }

  return mapTwinProfile(data as TwinProfileRow)
}

export async function getAccessibleTwinProfile(id: string) {
  const user = await requireSession()

  const { data, error } = await supabase
    .from('twin_profiles')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (data) {
    return mapTwinProfile(data as TwinProfileRow)
  }

  const granted = await getGrantedTwinRow(id, user.id)

  if (!granted) {
    throw new Error('当前分身不存在，或你没有访问权限。')
  }

  return granted
}

export async function getMyTwinProfile() {
  const user = await requireSession()
  const data = await getUserTwinRow(user.id)

  if (!data) {
    return null
  }

  return mapTwinProfile(data)
}

export async function listTwinProfiles() {
  const user = await requireSession()
  const data = await getUserTwinRow(user.id)

  return data ? [mapTwinProfile(data)] : []
}

export async function listAuthorizedTwinProfiles() {
  const user = await requireSession()

  const { data, error } = await supabase
    .from('twin_dialogue_grants')
    .select(
      `
        id,
        twin_id,
        owner_user_id,
        grantee_user_id,
        display_label,
        status,
        created_at,
        updated_at,
        twin_profiles!inner(*)
      `,
    )
    .eq('grantee_user_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return ((data as TwinDialogueGrantWithProfileRow[] | null) ?? [])
    .map((row) => normalizeNestedTwinProfile(row.twin_profiles))
    .filter((row): row is TwinProfileRow => Boolean(row))
    .map(mapTwinProfile)
}

export async function listOutgoingTwinDialogueGrants(twinId: string) {
  const user = await requireSession()

  const { data, error } = await supabase
    .from('twin_dialogue_grants')
    .select('*')
    .eq('owner_user_id', user.id)
    .eq('twin_id', twinId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return ((data as TwinDialogueGrantRow[] | null) ?? []).map(mapTwinDialogueGrant)
}

export async function countOutgoingTwinDialogueGrants(twinId: string) {
  const user = await requireSession()

  const { count, error } = await supabase
    .from('twin_dialogue_grants')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', user.id)
    .eq('twin_id', twinId)
    .eq('status', 'active')

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function uploadTwinPortrait(
  twinId: string,
  input: {
    blob: Blob
    mimeType?: string
    filePrefix?: string
  },
) {
  const user = await requireSession()
  const currentTwin = await getTwinProfile(twinId)
  const mimeType = input.mimeType?.trim() || input.blob.type || 'image/jpeg'
  const extension = getFileExtension(mimeType)
  const timestamp = Date.now()
  const filePath = `${user.id}/${input.filePrefix ?? 'portrait'}_${twinId}_${timestamp}.${extension}`

  const { error: uploadError } = await supabase.storage.from('twin-portraits').upload(filePath, input.blob, {
    contentType: mimeType,
    upsert: false,
  })

  if (uploadError) {
    throw uploadError
  }

  if (currentTwin.portraitPath) {
    await supabase.storage.from('twin-portraits').remove([currentTwin.portraitPath]).catch(() => undefined)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('twin-portraits').getPublicUrl(filePath)

  const { data, error } = await supabase
    .from('twin_profiles')
    .update({
      portrait_path: filePath,
      portrait_url: publicUrl,
    })
    .eq('id', twinId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapTwinProfile(data as TwinProfileRow)
}

export async function startOrResumeTwinBootstrap(proposedName?: string) {
  const user = await requireSession()
  const twin = await getOrCreateUserTwin(user.id, user.email, proposedName)

  const { data: existingSessionRow, error: existingSessionError } = await supabase
    .from('twin_bootstrap_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('twin_id', twin.id)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSessionError) {
    throw existingSessionError
  }

  if (existingSessionRow) {
    const bootstrapSession = mapBootstrapSession(existingSessionRow as TwinBootstrapSessionRow)
    const question =
      getTwinBootstrapQuestion(bootstrapSession.questionIndex) ??
      TWIN_BOOTSTRAP_QUESTIONS[TWIN_BOOTSTRAP_QUESTIONS.length - 1]

    return {
      session: bootstrapSession,
      twin,
      question: {
        index: Math.min(bootstrapSession.questionIndex + 1, TWIN_BOOTSTRAP_QUESTIONS.length),
        total: TWIN_BOOTSTRAP_QUESTIONS.length,
        item: question,
      },
    } satisfies TwinBootstrapStartResult
  }

  const { data: bootstrapSessionRow, error: sessionInsertError } = await supabase
    .from('twin_bootstrap_sessions')
    .insert({
      user_id: user.id,
      twin_id: twin.id,
      status: 'in_progress',
      stage_index: TWIN_BOOTSTRAP_QUESTIONS[0]?.stageIndex ?? 0,
      question_index: 0,
      question_count: TWIN_BOOTSTRAP_QUESTIONS.length,
      answers_count: 0,
      summary: '',
    })
    .select('*')
    .single()

  if (sessionInsertError) {
    throw sessionInsertError
  }

  return {
    session: mapBootstrapSession(bootstrapSessionRow as TwinBootstrapSessionRow),
    twin,
    question: {
      index: 1,
      total: TWIN_BOOTSTRAP_QUESTIONS.length,
      item: TWIN_BOOTSTRAP_QUESTIONS[0],
    },
  } satisfies TwinBootstrapStartResult
}

export async function updateTwinBootstrapSessionProgress(
  sessionId: string,
  updates: Partial<{
    status: TwinBootstrapSession['status']
    stageIndex: number
    questionIndex: number
    answersCount: number
    summary: string
    completedAt: string | null
  }>,
) {
  const payload: Record<string, unknown> = {}

  if (updates.status) payload.status = updates.status
  if (typeof updates.stageIndex === 'number') payload.stage_index = updates.stageIndex
  if (typeof updates.questionIndex === 'number') payload.question_index = updates.questionIndex
  if (typeof updates.answersCount === 'number') payload.answers_count = updates.answersCount
  if (typeof updates.summary === 'string') payload.summary = updates.summary
  if ('completedAt' in updates) payload.completed_at = updates.completedAt

  const { data, error } = await supabase
    .from('twin_bootstrap_sessions')
    .update(payload)
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapBootstrapSession(data as TwinBootstrapSessionRow)
}
