'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { canUseBrowserTts, speakWithBrowserTts, stopBrowserTts } from '@/lib/browserTts'
import {
  EMPTY_COMPANION_PROFILE,
  loadCompanionProfileFromSupabase,
} from '@/lib/companionProfile'
import { ingestCompanionProfileDelta } from '@/lib/companionProfileTraits'
import { buildFallbackEvents } from '@/lib/eventHeuristics'
import { saveMemoryEvents } from '@/lib/memoryEvents'
import { saveMemoryFacts } from '@/lib/memoryFacts'
import {
  buildPendingEventClues,
  buildPendingFactClues,
  refreshPendingClueSentence,
} from '@/lib/pendingClues'
import { getSessionUser, insertTextMemory } from '@/lib/recordingPersistence'
import { syncSemanticMemoryTranscript } from '@/lib/semanticMemory'
import { supabase } from '@/lib/supabase'
import {
  CompanionProfile,
  CorrectionTranscriptionResult,
  EventExtractionResult,
  FactExtractionResult,
  PendingClue,
  ProfileExtractionResult,
  QuickRecordingReflection,
  RecordingReflection,
} from '@/types/companion'

const ENABLE_SERVER_TTS = process.env.NEXT_PUBLIC_ENABLE_SERVER_TTS === 'true'
const INITIAL_REPLY = '今天感觉怎么样？'

type ReflectionInput = {
  blob?: Blob
  mimeType?: string
  transcript?: string
}

type ReflectionPayload = (QuickRecordingReflection | RecordingReflection) & {
  error?: string
}

async function readReflectionPayload(response: Response) {
  const rawText = await response.text()

  if (!rawText.trim()) {
    return {} as ReflectionPayload
  }

  try {
    return JSON.parse(rawText) as ReflectionPayload
  } catch {
    return {
      error: rawText,
    } as ReflectionPayload
  }
}

export function useMobileLivaDialogue() {
  const [profile, setProfile] = useState<CompanionProfile>(EMPTY_COMPANION_PROFILE)
  const [pendingMemoryId, setPendingMemoryId] = useState<string | null>(null)
  const [latestReflection, setLatestReflection] = useState<QuickRecordingReflection | RecordingReflection | null>(null)
  const [pendingClues, setPendingClues] = useState<PendingClue[]>([])
  const [correctionTargetId, setCorrectionTargetId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState(INITIAL_REPLY)
  const [userEcho, setUserEcho] = useState('')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [replyAudioUrl, setReplyAudioUrl] = useState<string | null>(null)
  const [replyAudioState, setReplyAudioState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const currentClue = pendingClues[0] ?? null
  const isCorrectingClue = Boolean(currentClue && correctionTargetId === currentClue.id)
  const browserTtsAvailable = canUseBrowserTts()

  useEffect(() => {
    let cancelled = false

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void loadCompanionProfileFromSupabase().then((loadedProfile) => {
        if (!cancelled) {
          setProfile(loadedProfile)
        }
      })
    })

    void loadCompanionProfileFromSupabase().then((loadedProfile) => {
      if (!cancelled) {
        setProfile(loadedProfile)
      }
    })

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
      stopBrowserTts()
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (replyAudioUrl) {
        URL.revokeObjectURL(replyAudioUrl)
      }
    }
  }, [replyAudioUrl])

  useEffect(() => {
    if (!pendingMemoryId || !latestReflection) {
      return
    }

    let cancelled = false

    void (async () => {
      const { error: updateError } = await supabase
        .from('memories')
        .update({
          transcript: latestReflection.transcript,
          summary: latestReflection.summary,
          tags: latestReflection.tags,
        })
        .eq('id', pendingMemoryId)

      if (updateError) {
        return
      }

      await syncSemanticMemoryTranscript({
        memoryId: pendingMemoryId,
        transcript: latestReflection.transcript,
        summary: latestReflection.summary,
        tags: latestReflection.tags,
      })

      const [facts, events, nextProfile] = await Promise.all([
        requestFactExtraction(latestReflection.transcript),
        requestEventExtraction(latestReflection.transcript),
        requestProfileExtraction(latestReflection.transcript, profile, pendingMemoryId),
      ])

      if (cancelled) {
        return
      }

      if (nextProfile) {
        setProfile(nextProfile)
      }

      const nextClues = [
        ...buildPendingEventClues(pendingMemoryId, latestReflection.transcript, events),
        ...buildPendingFactClues(pendingMemoryId, latestReflection.transcript, facts),
      ]

      if (nextClues.length > 0) {
        setPendingClues((current) => [...current, ...nextClues])
      }

      setPendingMemoryId(null)
      setLatestReflection(null)
    })()

    return () => {
      cancelled = true
    }
  }, [latestReflection, pendingMemoryId, profile])

  async function requestProfileExtraction(
    transcript: string,
    currentProfile: CompanionProfile,
    memoryId?: string,
  ) {
    try {
      const response = await fetch('/api/companion/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript,
          profile: currentProfile,
        }),
      })

      const result = (await response.json()) as ProfileExtractionResult | { error?: string }
      if (!response.ok || !('profileDelta' in result)) {
        throw new Error('画像聚合失败。')
      }

      const nextProfile = await ingestCompanionProfileDelta({
        currentProfile,
        profileDelta: result.profileDelta,
        transcript,
        memoryId,
        trustLevel: 'guarded',
        riskFlags: [],
      })

      return nextProfile.profile
    } catch {
      return null
    }
  }

  async function requestFactExtraction(transcript: string) {
    try {
      const response = await fetch('/api/companion/facts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
      })

      const result = (await response.json()) as FactExtractionResult | { error?: string }
      if (!response.ok || !('facts' in result)) {
        throw new Error('Fact extraction failed.')
      }

      return result.facts
    } catch {
      return []
    }
  }

  async function requestEventExtraction(transcript: string) {
    try {
      const response = await fetch('/api/companion/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
      })

      const result = (await response.json()) as EventExtractionResult | { error?: string }
      if (!response.ok || !('events' in result)) {
        throw new Error('Event extraction failed.')
      }

      return result.events.length > 0 ? result.events : buildFallbackEvents(transcript)
    } catch {
      return buildFallbackEvents(transcript)
    }
  }

  async function requestReplySpeech(text: string) {
    const response = await fetch('/api/companion/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(payload.error || '语音生成失败。')
    }

    const audioBlob = await response.blob()
    if (!audioBlob.size) {
      throw new Error('语音生成失败。')
    }

    if (replyAudioUrl) {
      URL.revokeObjectURL(replyAudioUrl)
    }

    const nextUrl = URL.createObjectURL(audioBlob)
    setReplyAudioUrl(nextUrl)
    setReplyAudioState('ready')
    return nextUrl
  }

  async function applyReflectionResult(reflection: QuickRecordingReflection | RecordingReflection) {
    const spokenReply = `${reflection.feedback} ${reflection.followUpPrompt}`.trim()

    setLatestReflection(reflection)
    setReplyText(spokenReply)
    setError('')

    if (!ENABLE_SERVER_TTS) {
      if (browserTtsAvailable) {
        speakWithBrowserTts(spokenReply)
      }
      return
    }

    try {
      setReplyAudioState('loading')
      const nextUrl = await requestReplySpeech(spokenReply)
      if (audioRef.current) {
        audioRef.current.pause()
      }
      audioRef.current = new Audio(nextUrl)
      await audioRef.current.play().catch(() => undefined)
    } catch (speechError) {
      setReplyAudioState('error')
      if (browserTtsAvailable) {
        speakWithBrowserTts(spokenReply)
      } else {
        setError(speechError instanceof Error ? speechError.message : '语音生成失败。')
      }
    }
  }

  async function requestReflection(inputValue: ReflectionInput) {
    const formData = new FormData()
    formData.append('profile', JSON.stringify(profile))

    if (inputValue.transcript) {
      formData.append('transcript', inputValue.transcript)
    } else if (inputValue.blob && inputValue.mimeType) {
      formData.append(
        'audio',
        new File([inputValue.blob], `memory.${inputValue.mimeType.split('/')[1] || 'webm'}`, {
          type: inputValue.mimeType,
        }),
      )
    }

    const response = await fetch('/api/companion/reflect', {
      method: 'POST',
      body: formData,
    })

    const result = await readReflectionPayload(response)
    if (!response.ok) {
      throw new Error(result.error || `回应生成失败（HTTP ${response.status}）。`)
    }

    await applyReflectionResult(result as QuickRecordingReflection | RecordingReflection)
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const transcript = input.trim()
    if (!transcript || busy) {
      return
    }

    setUserEcho(transcript)
    setInput('')
    setBusy(true)
    setError('')

    try {
      try {
        const user = await getSessionUser()
        if (user) {
          const pending = await insertTextMemory({
            userId: user.id,
            transcript,
            summary: '正在整理文字内容...',
            profileStatus: 'pending',
          })
          setPendingMemoryId(pending.id)
        }
      } catch (persistenceError) {
        console.warn('Typed memory persistence failed, continuing reflection:', persistenceError)
        setPendingMemoryId(null)
      }

      await requestReflection({ transcript })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '回应生成失败。')
    } finally {
      setBusy(false)
    }
  }

  async function handleVoiceReady(blob: Blob, mimeType: string) {
    setBusy(true)
    setError('')

    try {
      await requestReflection({ blob, mimeType })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '语音处理失败。')
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmClue() {
    if (!currentClue) {
      return
    }

    if (currentClue.kind === 'fact') {
      await saveMemoryFacts(currentClue.memoryId, [currentClue.fact])
    } else {
      await saveMemoryEvents(currentClue.memoryId, [currentClue.event])
    }

    setPendingClues((current) => current.filter((item) => item.id !== currentClue.id))
    setCorrectionTargetId((current) => (current === currentClue.id ? null : current))
  }

  function handleDismissClue() {
    if (!currentClue) {
      return
    }

    setPendingClues((current) => current.filter((item) => item.id !== currentClue.id))
    setCorrectionTargetId((current) => (current === currentClue.id ? null : current))
  }

  async function handleCorrectionTranscript(correctionTranscript: string) {
    if (!currentClue) {
      return
    }

    const normalizedTranscript = correctionTranscript.trim()
    if (!normalizedTranscript) {
      throw new Error('请先输入更正内容。')
    }

    const response = await fetch('/api/companion/clue-correction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clue: currentClue,
        correctionTranscript: normalizedTranscript,
      }),
    })

    const result = (await response.json()) as { clue?: PendingClue; error?: string }
    if (!response.ok || !result.clue) {
      throw new Error(result.error || '线索更正失败。')
    }

    const refreshed = refreshPendingClueSentence(result.clue)
    setPendingClues((current) => current.map((item) => (item.id === refreshed.id ? refreshed : item)))
    setCorrectionTargetId(null)
  }

  async function handleCorrectionRecording(blob: Blob, mimeType: string) {
    const formData = new FormData()
    formData.append(
      'audio',
      new File([blob], `correction.${mimeType.split('/')[1] || 'webm'}`, { type: mimeType }),
    )

    const response = await fetch('/api/companion/transcribe', {
      method: 'POST',
      body: formData,
    })

    const result = (await response.json()) as CorrectionTranscriptionResult | { error?: string }
    if (!response.ok || !('transcript' in result) || !result.transcript.trim()) {
      const errorMessage = 'error' in result ? result.error : undefined
      throw new Error(errorMessage || '语音更正失败。')
    }

    await handleCorrectionTranscript(result.transcript)
  }

  async function replayReply() {
    if (replyAudioUrl) {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      audioRef.current = new Audio(replyAudioUrl)
      await audioRef.current.play().catch(() => undefined)
      return
    }

    if (browserTtsAvailable) {
      speakWithBrowserTts(replyText)
    }
  }

  return {
    replyText,
    userEcho,
    input,
    setInput,
    busy,
    error,
    replyAudioState,
    replyAudioUrl,
    currentClue,
    isCorrectingClue,
    handleTextSubmit,
    handleVoiceReady,
    handleConfirmClue,
    handleDismissClue,
    handleCorrectionRecording,
    handleCorrectionTranscript,
    handleStartCorrection: () => {
      if (currentClue) {
        setCorrectionTargetId(currentClue.id)
      }
    },
    handleCancelCorrection: () => setCorrectionTargetId(null),
    handleMemoryPersisted: (memory: { id: string | null }) => {
      if (memory.id) {
        setPendingMemoryId(memory.id)
      }
    },
    replayReply,
  }
}
