import { getSessionUser } from '@/lib/recordingPersistence'
import { supabase } from '@/lib/supabase'
import { getAccessibleTwinProfile, getMyTwinProfile } from '@/lib/twinProfiles'
import { DialogueCharacter, TwinProfile } from '@/types/twin'

type GrantedTwinProfileRow = {
  id: string
  user_id: string
  name: string
  persona_summary: string
  portrait_url: string | null
}

type GrantedTwinRow = {
  twin_id: string
  grantee_user_id: string
  display_label: string
  twin_profiles: GrantedTwinProfileRow | GrantedTwinProfileRow[] | null
}

export const LIVA_SELECTION_KEY = 'liva'

export const LIVA_DIALOGUE_CHARACTER: DialogueCharacter = {
  id: 'liva',
  selectionKey: LIVA_SELECTION_KEY,
  kind: 'liva',
  source: 'system',
  title: 'Liva',
  subtitle: '系统人物',
}

function normalizeGrantedTwinProfile(value: GrantedTwinRow['twin_profiles']) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function buildTwinDialogueCharacter(
  twin: TwinProfile,
  input: {
    source: DialogueCharacter['source']
    subtitle: string
    shareSummary?: string
  },
): DialogueCharacter {
  return {
    id: twin.id,
    selectionKey: buildTwinSelectionKey(twin.id),
    kind: 'twin',
    source: input.source,
    title: twin.name,
    subtitle: input.subtitle,
    avatarUrl: twin.portraitUrl,
    twinId: twin.id,
    shareSummary: input.shareSummary,
  }
}

async function getGrantLabelForTwin(twinId: string, granteeUserId: string) {
  const { data, error } = await supabase
    .from('twin_dialogue_grants')
    .select('display_label')
    .eq('twin_id', twinId)
    .eq('grantee_user_id', granteeUserId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw error
  }

  return ((data as { display_label?: string } | null)?.display_label || '').trim()
}

export function buildTwinSelectionKey(twinId: string) {
  return `twin:${twinId}`
}

export function parseDialogueSelection(selection?: string | null) {
  const normalized = selection?.trim() || LIVA_SELECTION_KEY

  if (normalized === LIVA_SELECTION_KEY) {
    return {
      kind: 'liva' as const,
    }
  }

  if (normalized.startsWith('twin:')) {
    const twinId = normalized.slice('twin:'.length).trim()
    if (twinId) {
      return {
        kind: 'twin' as const,
        twinId,
      }
    }
  }

  return {
    kind: 'liva' as const,
  }
}

export async function listSelectableDialogueCharacters(): Promise<DialogueCharacter[]> {
  const user = await getSessionUser()

  if (!user) {
    return [LIVA_DIALOGUE_CHARACTER]
  }

  const ownTwin = await getMyTwinProfile().catch(() => null)

  const { data, error } = await supabase
    .from('twin_dialogue_grants')
    .select(
      `
        twin_id,
        grantee_user_id,
        display_label,
        twin_profiles!inner(
          id,
          user_id,
          name,
          persona_summary,
          portrait_url
        )
      `,
    )
    .eq('grantee_user_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  const grantedCharacters: DialogueCharacter[] = []

  for (const row of (data as GrantedTwinRow[] | null) ?? []) {
    const twin = normalizeGrantedTwinProfile(row.twin_profiles)
    if (!twin) {
      continue
    }

    grantedCharacters.push({
      id: twin.id,
      selectionKey: buildTwinSelectionKey(twin.id),
      kind: 'twin',
      source: 'shared_twin',
      title: twin.name,
      subtitle: row.display_label?.trim() || '已授权人物',
      avatarUrl: twin.portrait_url ?? undefined,
      twinId: twin.id,
      shareSummary: twin.persona_summary?.trim() || undefined,
    })
  }

  const ownTwinCharacter = ownTwin
    ? [
        buildTwinDialogueCharacter(ownTwin, {
          source: 'own_twin',
          subtitle: '我的分身',
          shareSummary: ownTwin.personaSummary || undefined,
        }),
      ]
    : []

  const grantedOnly = grantedCharacters.filter((character) => character.twinId !== ownTwin?.id)

  return [LIVA_DIALOGUE_CHARACTER, ...ownTwinCharacter, ...grantedOnly]
}

export async function getDialogueCharacterFromSelection(selection?: string | null) {
  const parsed = parseDialogueSelection(selection)

  if (parsed.kind === 'liva') {
    return LIVA_DIALOGUE_CHARACTER
  }

  const twin = await getAccessibleTwinProfile(parsed.twinId)
  const user = await getSessionUser()
  const isOwner = user?.id === twin.userId
  const grantLabel = isOwner || !user ? '' : await getGrantLabelForTwin(twin.id, user.id)

  return buildTwinDialogueCharacter(twin, {
    source: isOwner ? 'own_twin' : 'shared_twin',
    subtitle: isOwner ? '我的分身' : grantLabel || '已授权人物',
    shareSummary: twin.personaSummary || undefined,
  })
}
