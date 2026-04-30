import { getFileExtension } from '@/lib/audioMime'
import { syncSemanticMemoryTranscript } from '@/lib/semanticMemory'
import { supabase } from '@/lib/supabase'

type PendingMemoryInput = {
  userId: string
  audioUrl: string
  audioPath: string
  audioMimeType: string
  audioSizeBytes: number
  summary?: string
  tags?: string[]
  transcriptStatus?: 'pending' | 'completed' | 'failed'
  replyStatus?: 'pending' | 'completed' | 'failed'
  profileStatus?: 'pending' | 'completed' | 'failed'
}

export async function getSessionUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session?.user ?? null
}

export async function requireSessionUser() {
  const user = await getSessionUser()

  if (!user) {
    throw new Error('请先登录，再继续当前操作。')
  }

  return user
}

type UploadRecordingAssetInput = {
  ownerId: string
  blob: Blob
  mimeType: string
  filePrefix?: string
}

export async function uploadRecordingAsset(input: UploadRecordingAssetInput) {
  const timestamp = Date.now()
  const extension = getFileExtension(input.mimeType)
  const filePath = `${input.ownerId}/${input.filePrefix ?? 'recording'}_${timestamp}.${extension}`

  const { error: uploadError } = await supabase.storage.from('recordings').upload(filePath, input.blob, {
    contentType: input.mimeType,
    upsert: false,
  })

  if (uploadError) {
    throw uploadError
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('recordings').getPublicUrl(filePath)

  return {
    filePath,
    publicUrl,
  }
}

export async function insertPendingMemory(input: PendingMemoryInput) {
  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: input.userId,
      audio_url: input.audioUrl,
      audio_path: input.audioPath,
      audio_mime_type: input.audioMimeType,
      audio_size_bytes: input.audioSizeBytes,
      transcript_status: input.transcriptStatus ?? 'pending',
      reply_status: input.replyStatus ?? 'completed',
      profile_status: input.profileStatus ?? 'pending',
      summary: input.summary ?? '正在整理录音内容...',
      tags: input.tags ?? [],
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return {
    id: data.id as string,
  }
}

type TextMemoryInput = {
  userId: string
  transcript: string
  summary?: string
  tags?: string[]
  transcriptProvider?: string
  transcriptModel?: string
  profileStatus?: 'pending' | 'completed' | 'failed'
}

export async function insertTextMemory(input: TextMemoryInput) {
  const { data, error } = await supabase
    .from('memories')
    .insert({
      user_id: input.userId,
      transcript: input.transcript,
      transcript_provider: input.transcriptProvider ?? 'typed',
      transcript_model: input.transcriptModel ?? 'manual',
      transcript_status: 'completed',
      reply_status: 'completed',
      profile_status: input.profileStatus ?? 'pending',
      summary: input.summary ?? '正在整理文字内容...',
      tags: input.tags ?? [],
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  const syncResult = await syncSemanticMemoryTranscript({
    memoryId: data.id as string,
    transcript: input.transcript,
    summary: input.summary,
    tags: input.tags,
  })

  if (syncResult.status === 'failed') {
    console.error('Semantic substrate sync after text memory insert failed:', syncResult.reason)
  }

  return {
    id: data.id as string,
  }
}

export async function updateMemoryTranscript(
  memoryId: string,
  input: {
    transcript: string
    summary?: string
    tags?: string[]
    profileStatus?: 'pending' | 'completed' | 'failed'
    lastError?: string | null
  },
) {
  const { error } = await supabase
    .from('memories')
    .update({
      transcript: input.transcript,
      summary: input.summary,
      tags: input.tags,
      transcript_status: 'completed',
      profile_status: input.profileStatus,
      last_error: input.lastError ?? null,
    })
    .eq('id', memoryId)

  if (error) {
    throw error
  }

  const syncResult = await syncSemanticMemoryTranscript({
    memoryId,
    transcript: input.transcript,
    summary: input.summary,
    tags: input.tags,
  })

  if (syncResult.status === 'failed') {
    console.error('Semantic substrate sync after transcript update failed:', syncResult.reason)
  }
}
