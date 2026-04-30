'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { loadCompanionProfileFromSupabase } from '@/lib/companionProfile'
import { listRecentMemoryTranscripts } from '@/lib/recentMemories'
import { searchSemanticMemoryEvidence } from '@/lib/semanticMemory'
import { buildLiveTwinExpression, mergeTwinExpressionSnapshots } from '@/lib/twinExpression'
import { getAccessibleTwinProfile } from '@/lib/twinProfiles'
import { buildSituationalQuery } from '@/lib/twinSituationalRouting'
import {
  deriveTwinTopicInteractionSeed,
  extractAnchorsFromTopicKey,
  loadTwinTopicInteractionContext,
  recordTwinTopicInteraction,
} from '@/lib/twinTopicInteractions'
import { getAccessibleActiveTwinVersion } from '@/lib/twinVersions'
import {
  requestTwinSpeechAudio,
  transcribeTwinChatAudioBlob,
} from '@/lib/twinVoice'
import {
  TwinAnswerProgressionMode,
  TwinChatMessage,
  TwinExpressionSnapshot,
  TwinProfile,
  TwinTopicInteractionContext,
  TwinVersion,
} from '@/types/twin'

type TwinInputOptions = {
  displayContent?: string
  source?: 'text' | 'voice'
  trustLevel?: 'stable' | 'guarded' | 'risky'
  riskFlags?: string[]
}

type TwinReplyDebug = {
  answerMode?: 'default' | 'situational'
  situationAnchors?: string[]
  fallbackReason?: string
  topicKey?: string
  askerScope?: string
  topicRecencyBand?: string
  answerProgressionMode?: TwinAnswerProgressionMode
  preferredAnswerAngle?: string
  shouldAcknowledgePriorConversation?: boolean
}

type TwinReplyResult = {
  reply: string
  debug?: TwinReplyDebug
  topicInteraction: TwinTopicInteractionContext | null
}

type TwinChatPayload = {
  reply?: string
  error?: string
  debug?: TwinReplyDebug
}

function stripIntroHistory(messages: TwinChatMessage[]) {
  return messages.filter(
    (item, index) =>
      !(index === 0 && item.role === 'assistant' && item.content.includes('在这里')),
  )
}

function isRecencyBand(value: string | undefined): value is TwinTopicInteractionContext['recencyBand'] {
  return value === 'new' || value === 'immediate' || value === 'same_day' || value === 'recent' || value === 'stale'
}

async function readTwinChatPayload(response: Response) {
  const rawText = await response.text()

  if (!rawText.trim()) {
    return {} as TwinChatPayload
  }

  try {
    return JSON.parse(rawText) as TwinChatPayload
  } catch {
    return {
      error: rawText,
    } satisfies TwinChatPayload
  }
}

export function useMobileTwinDialogue(selectionTwinId?: string) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [input, setInput] = useState('')
  const [twin, setTwin] = useState<TwinProfile | null>(null)
  const [version, setVersion] = useState<TwinVersion | null>(null)
  const [messages, setMessages] = useState<TwinChatMessage[]>([])
  const [liveExpression, setLiveExpression] = useState<TwinExpressionSnapshot | null>(null)
  const [replyText, setReplyText] = useState('')
  const [userEcho, setUserEcho] = useState('')
  const [replyAudioUrl, setReplyAudioUrl] = useState<string | null>(null)
  const [replyAudioState, setReplyAudioState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [replyAudioError, setReplyAudioError] = useState('')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastTopicInteractionRef = useRef<TwinTopicInteractionContext | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      if (replyAudioUrl) {
        URL.revokeObjectURL(replyAudioUrl)
      }
    }
  }, [replyAudioUrl])

  useEffect(() => {
    if (!selectionTwinId) {
      setTwin(null)
      setVersion(null)
      setMessages([])
      setReplyText('')
      setUserEcho('')
      setLiveExpression(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')
    lastTopicInteractionRef.current = null

    void (async () => {
      try {
        const nextTwin = await getAccessibleTwinProfile(selectionTwinId)
        const nextVersion = await getAccessibleActiveTwinVersion(nextTwin.id, nextTwin.activeVersionId)
        const currentProfile = await loadCompanionProfileFromSupabase()
        const recentTranscripts = await listRecentMemoryTranscripts({
          limit: 8,
          since: nextVersion.createdAt,
        })
        const nextLiveExpression = mergeTwinExpressionSnapshots(
          nextVersion.personaSnapshot.expression,
          buildLiveTwinExpression(currentProfile, recentTranscripts),
        )

        if (!cancelled) {
          setTwin(nextTwin)
          setVersion(nextVersion)
          setLiveExpression(nextLiveExpression)
          setReplyText(nextTwin.personaSummary || `${nextTwin.name} 在这里。`)
          setMessages([
            {
              role: 'assistant',
              content: `${nextTwin.name} 在这里。`,
            },
          ])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '分身加载失败。')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectionTwinId])

  async function requestTwinReply(
    message: string,
    nextHistory: TwinChatMessage[],
    activeTwin: TwinProfile,
    activeVersion: TwinVersion,
    expression: TwinExpressionSnapshot | null,
    options: TwinInputOptions = {},
  ): Promise<TwinReplyResult> {
    const persona = activeVersion.personaSnapshot ?? {}
    const inheritedTopicSeed = deriveTwinTopicInteractionSeed(message, lastTopicInteractionRef.current)
    const inheritedAnchors =
      inheritedTopicSeed?.inheritedFromRecentTopic && inheritedTopicSeed.topicKey
        ? extractAnchorsFromTopicKey(inheritedTopicSeed.topicKey)
        : []
    const situationalQuery = buildSituationalQuery(
      message,
      nextHistory.filter((item) => item.role === 'user').map((item) => item.content),
      {
        inheritedAnchors,
        lockScopeToAnchors: inheritedAnchors.length > 0,
      },
    )
    let semanticEvidence = [] as Awaited<ReturnType<typeof searchSemanticMemoryEvidence>>
    let topicInteraction: TwinTopicInteractionContext | null = null

    try {
      semanticEvidence = await searchSemanticMemoryEvidence({
        query: situationalQuery.query,
        limit: 4,
      })
    } catch {
      semanticEvidence = []
    }

    try {
      topicInteraction = await loadTwinTopicInteractionContext({
        twinId: activeTwin.id,
        message,
      })
    } catch {
      topicInteraction = null
    }

    const response = await fetch('/api/twin/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        twinName: activeTwin.name,
        promptSnapshot: activeVersion.promptSnapshot,
        personaSnapshot: activeVersion.personaSnapshot,
        personaSummary:
          activeTwin.personaSummary || (typeof persona.summary === 'string' ? persona.summary : ''),
        voiceStyleSummary:
          activeTwin.voiceStyleSummary ||
          (typeof persona.voiceStyleSummary === 'string' ? persona.voiceStyleSummary : ''),
        responseStyle:
          activeTwin.responseStyle ||
          (typeof persona.responseStyle === 'string' ? persona.responseStyle : ''),
        coreValues: activeTwin.coreValues,
        boundaryRules: activeTwin.boundaryRules,
        expressionSnapshot: expression,
        factsSnapshot: activeVersion.factsSnapshot,
        eventsSnapshot: activeVersion.eventsSnapshot,
        semanticEvidence,
        history: nextHistory,
        message,
        messageSource: options.source,
        messageTrustLevel: options.trustLevel,
        messageRiskFlags: options.riskFlags,
        topicInteraction,
      }),
    })

    const payload = await readTwinChatPayload(response)
    if (!response.ok) {
      throw new Error(payload.error || `分身回复失败（HTTP ${response.status}）。`)
    }

    return {
      reply: payload.reply?.trim() || '',
      debug: payload.debug,
      topicInteraction,
    }
  }

  async function sendMessage(content: string, options: TwinInputOptions = {}) {
    const message = content.trim()
    if (!message || !twin || !version) {
      return
    }

    const priorHistory = stripIntroHistory(messages).slice(-8)
    const userMessage: TwinChatMessage = {
      role: 'user',
      content: message,
      displayContent: options.displayContent?.trim() || undefined,
      source: options.source,
      trustLevel: options.trustLevel,
      riskFlags: options.riskFlags?.length ? options.riskFlags : undefined,
    }

    setMessages((current) => [...current, userMessage])
    setUserEcho(userMessage.displayContent || userMessage.content)
    setInput('')
    setSending(true)
    setError('')
    setReplyAudioError('')

    try {
      const result = await requestTwinReply(message, priorHistory, twin, version, liveExpression, options)
      const nextReplyText = result.reply || '我听见了，你可以继续往下说。'

      setMessages((current) => [...current, { role: 'assistant', content: nextReplyText }])
      setReplyText(nextReplyText)

      if (result.topicInteraction?.topicKey) {
        const nextTopicInteraction: TwinTopicInteractionContext = {
          ...result.topicInteraction,
          recencyBand: isRecencyBand(result.debug?.topicRecencyBand)
            ? result.debug.topicRecencyBand
            : result.topicInteraction.recencyBand,
          discussCount: Math.max((result.topicInteraction.discussCount ?? 0) + 1, 1),
          lastDiscussedAt: new Date().toISOString(),
          lastAnswerSummary: nextReplyText,
          lastAnswerAngle: result.debug?.preferredAnswerAngle || result.topicInteraction.lastAnswerAngle,
          lastAnswerMode: result.debug?.answerProgressionMode || result.topicInteraction.lastAnswerMode,
        }

        lastTopicInteractionRef.current = nextTopicInteraction

        try {
          await recordTwinTopicInteraction({
            twinId: twin.id,
            context: nextTopicInteraction,
            answerSummary: nextReplyText,
            answerAngle: result.debug?.preferredAnswerAngle,
            answerMode: result.debug?.answerProgressionMode || 'fresh_answer',
            responseExcerpt: nextReplyText.slice(0, 160),
          })
        } catch (interactionError) {
          console.warn('Twin topic interaction sync failed after reply, kept local state:', interactionError)
        }
      }

      const voiceClone = version.personaSnapshot.voiceClone
      if (voiceClone?.voiceUri) {
        try {
          setReplyAudioState('loading')
          const audioBlob = await requestTwinSpeechAudio(
            nextReplyText,
            voiceClone,
            twin,
            version,
            twin.voiceStyleSummary,
          )

          if (replyAudioUrl) {
            URL.revokeObjectURL(replyAudioUrl)
          }

          const nextAudioUrl = URL.createObjectURL(audioBlob)
          setReplyAudioUrl(nextAudioUrl)
          setReplyAudioState('ready')
          if (audioRef.current) {
            audioRef.current.pause()
          }
          audioRef.current = new Audio(nextAudioUrl)
          await audioRef.current.play().catch(() => undefined)
        } catch (audioError) {
          setReplyAudioState('error')
          setReplyAudioError(audioError instanceof Error ? audioError.message : '分身语音生成失败。')
        }
      } else {
        setReplyAudioState('idle')
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '分身回复失败。')
    } finally {
      setSending(false)
    }
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!input.trim() || sending || transcribing) {
      return
    }

    await sendMessage(input)
  }

  async function handleVoiceReady(blob: Blob, mimeType: string) {
    try {
      setTranscribing(true)
      setError('')

      const draft = await transcribeTwinChatAudioBlob(
        blob,
        mimeType,
        stripIntroHistory(messages)
          .slice(-4)
          .map((item) => item.content),
      )

      setInput(draft.displayTranscript)
      await sendMessage(draft.trustedTranscript, {
        displayContent: draft.displayTranscript,
        source: 'voice',
        trustLevel: draft.trustLevel,
        riskFlags: draft.riskFlags,
      })
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : '语音处理失败。')
    } finally {
      setTranscribing(false)
    }
  }

  async function replayReply() {
    if (!replyAudioUrl) {
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }
    audioRef.current = new Audio(replyAudioUrl)
    await audioRef.current.play().catch(() => undefined)
  }

  return {
    loading,
    error,
    sending,
    transcribing,
    input,
    setInput,
    twin,
    version,
    replyText,
    userEcho,
    replyAudioUrl,
    replyAudioState,
    replyAudioError,
    handleTextSubmit,
    handleVoiceReady,
    replayReply,
  }
}
