import { supabase } from '@/lib/supabase'

type ReviewMemoryRow = {
  id: string
  transcript: string | null
  summary: string | null
  created_at: string
}

type ReviewFactRow = {
  id: string
  subject: string
  predicate: string
  object_text: string
  created_at: string
}

type ReviewEventRow = {
  id: string
  title: string
  description: string
  year: number | null
  created_at: string
}

export type ReviewSnapshot = {
  memories: ReviewMemoryRow[]
  facts: ReviewFactRow[]
  events: ReviewEventRow[]
}

export async function fetchReviewSnapshot(limit = 5): Promise<ReviewSnapshot> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return {
      memories: [],
      facts: [],
      events: [],
    }
  }

  const [memoriesResult, factsResult, eventsResult] = await Promise.all([
    supabase
      .from('memories')
      .select('id, transcript, summary, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('memory_facts')
      .select('id, subject, predicate, object_text, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('memory_events')
      .select('id, title, description, year, created_at')
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (memoriesResult.error) throw memoriesResult.error
  if (factsResult.error) throw factsResult.error
  if (eventsResult.error) throw eventsResult.error

  return {
    memories: (memoriesResult.data ?? []) as ReviewMemoryRow[],
    facts: (factsResult.data ?? []) as ReviewFactRow[],
    events: (eventsResult.data ?? []) as ReviewEventRow[],
  }
}
