import { prepareVoiceCloneAudio } from '@/lib/browserAudio'
import { getBlobAudioDurationMs } from '@/lib/platform/audioPlayback'
import { VoiceInputTranscriptionResult } from '@/types/companion'
import { TwinProfile, TwinVersion, TwinVoiceCloneConfig } from '@/types/twin'

export type TwinVoiceInputDraft = {
  transcript: string
  trustedTranscript: string
  displayTranscript: string
  trustLevel: 'stable' | 'guarded' | 'risky'
  riskFlags: string[]
  usedRepair: boolean
}

async function requestVoiceTranscription(
  blob: Blob,
  mimeType: string,
  input: {
    fileBaseName?: string
    mode?: 'twin-chat' | 'memory-reflect'
    context?: string[]
  } = {},
) {
  const formData = new FormData()
  const fileBaseName = input.fileBaseName ?? 'twin-audio'
  const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm'

  formData.append('audio', new File([blob], `${fileBaseName}.${extension}`, { type: mimeType }))

  if (input.mode) {
    formData.append('mode', input.mode)
  }

  if (input.context && input.context.length > 0) {
    formData.append('context', JSON.stringify(input.context))
  }

  const response = await fetch('/api/companion/transcribe', {
    method: 'POST',
    body: formData,
  })

  const payload = (await response.json().catch(() => ({}))) as VoiceInputTranscriptionResult & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Voice transcription failed.')
  }

  return payload
}

export async function transcribeAudioBlob(blob: Blob, mimeType: string, fileBaseName = 'twin-audio') {
  const payload = await requestVoiceTranscription(blob, mimeType, {
    fileBaseName,
  })

  return payload.trustedTranscript?.trim() || payload.transcript?.trim() || ''
}

export async function transcribeTwinChatAudioBlob(blob: Blob, mimeType: string, context: string[] = []) {
  const payload = await requestVoiceTranscription(blob, mimeType, {
    fileBaseName: 'twin-chat',
    mode: 'twin-chat',
    context,
  })

  const transcript = payload.transcript?.trim() || ''
  const trustedTranscript = payload.trustedTranscript?.trim() || transcript
  const displayTranscript = payload.displayTranscript?.trim() || trustedTranscript || transcript

  if (!trustedTranscript) {
    throw new Error('Voice transcription returned no usable text.')
  }

  return {
    transcript,
    trustedTranscript,
    displayTranscript,
    trustLevel: payload.trustLevel || 'stable',
    riskFlags: payload.riskFlags ?? [],
    usedRepair: payload.usedRepair ?? false,
  } satisfies TwinVoiceInputDraft
}

export async function getTwinVoiceSampleDraft(blob: Blob, mimeType: string) {
  const [transcript, durationMs] = await Promise.all([
    transcribeAudioBlob(blob, mimeType, 'twin-voice'),
    getBlobAudioDurationMs(blob),
  ])

  if (!transcript) {
    throw new Error('Voice sample could not be transcribed into usable text.')
  }

  return {
    transcript,
    durationMs,
  }
}

export async function createTwinVoiceClone(
  twinName: string,
  draft: { blob: Blob; mimeType: string; transcript: string; durationMs: number },
) {
  const uploadAudio = await prepareVoiceCloneAudio(draft.blob, draft.mimeType)
  const formData = new FormData()
  formData.append(
    'audio',
    new File([uploadAudio.blob], `twin-voice-sample.${uploadAudio.extension}`, { type: uploadAudio.mimeType }),
  )
  formData.append('transcript', draft.transcript.trim())
  formData.append('twinName', twinName)
  if (draft.durationMs > 0) {
    formData.append('sampleDurationMs', String(draft.durationMs))
  }

  const response = await fetch('/api/twin/voice/clone', {
    method: 'POST',
    body: formData,
  })

  const payload = (await response.json().catch(() => ({}))) as {
    voiceUri?: string
    model?: string
    sampleTranscript?: string
    createdAt?: string
    sampleDurationMs?: number
    error?: string
  }

  if (!response.ok || !payload.voiceUri || !payload.model || !payload.sampleTranscript) {
    throw new Error(payload.error || 'Voice clone creation failed.')
  }

  const voiceClone: TwinVoiceCloneConfig = {
    voiceUri: payload.voiceUri,
    model: payload.model,
    sampleTranscript: payload.sampleTranscript,
    source: 'user_sample',
    createdAt: payload.createdAt || new Date().toISOString(),
    sampleDurationMs: payload.sampleDurationMs,
  }

  return voiceClone
}

export async function requestTwinSpeechAudio(
  text: string,
  clone: TwinVoiceCloneConfig,
  activeTwin: TwinProfile,
  activeVersion: TwinVersion,
  voiceStyleSummary: string,
) {
  const response = await fetch('/api/twin/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voiceUri: clone.voiceUri,
      twinName: activeTwin.name,
      personaSummary: activeTwin.personaSummary,
      voiceStyleSummary,
      responseStyle:
        activeTwin.responseStyle ||
        (typeof activeVersion.personaSnapshot.responseStyle === 'string'
          ? activeVersion.personaSnapshot.responseStyle
          : ''),
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error || 'Twin speech synthesis failed.')
  }

  const audioBlob = await response.blob()
  if (!audioBlob.size) {
    throw new Error('Twin speech synthesis returned empty audio.')
  }

  return audioBlob
}
