import { supabase } from '@/lib/supabase'

type RecentMemoryRow = {
  id: string
  transcript: string | null
  created_at: string
}

type RecentMemoryQuery = {
  limit?: number
  since?: string
}

export async function listRecentMemoryTranscripts(query: number | RecentMemoryQuery = 8) {
  const limit = typeof query === 'number' ? query : query.limit ?? 8
  const since = typeof query === 'number' ? undefined : query.since

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return [] as string[]
  }

  let request = supabase
    .from('memories')
    .select('id, transcript, created_at')
    .eq('user_id', session.user.id)
    .eq('transcript_status', 'completed')
    .not('transcript', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (since) {
    request = request.gt('created_at', since)
  }

  const { data, error } = await request

  if (error) {
    throw error
  }

  return ((data ?? []) as RecentMemoryRow[])
    .map((item) => item.transcript?.trim() || '')
    .filter(Boolean)
}
