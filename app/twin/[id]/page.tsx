'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { VoiceRecorder } from '@/components/VoiceRecorder'
import { EMPTY_COMPANION_PROFILE, loadCompanionProfileFromSupabase } from '@/lib/companionProfile'
import { resolveSurfaceHref } from '@/lib/clientSurfaceRouting'
import { listRecentMemoryTranscripts } from '@/lib/recentMemories'
import { playManagedAudio, stopManagedAudio } from '@/lib/platform/audioPlayback'
import { searchSemanticMemoryEvidence } from '@/lib/semanticMemory'
import { buildSituationalQuery } from '@/lib/twinSituationalRouting'
import {
  deriveTwinTopicInteractionSeed,
  extractAnchorsFromTopicKey,
  loadTwinTopicInteractionContext,
  recordTwinTopicInteraction,
} from '@/lib/twinTopicInteractions'
import { maybeRefreshTwinGrowth } from '@/lib/twinGrowth'
import { buildLiveTwinExpression, mergeTwinExpressionSnapshots } from '@/lib/twinExpression'
import { getTwinProfile } from '@/lib/twinProfiles'
import { getActiveTwinVersion } from '@/lib/twinVersions'
import { requestTwinSpeechAudio, transcribeTwinChatAudioBlob } from '@/lib/twinVoice'
import { CompanionProfile } from '@/types/companion'
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
      !(index === 0 && item.role === 'assistant' && item.content.includes('你可以继续像和我说话一样')),
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

export default function TwinChatPage() {
  const params = useParams<{ id: string }>()
  const pathname = usePathname()
  const twinId = params?.id

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [twin, setTwin] = useState<TwinProfile | null>(null)
  const [version, setVersion] = useState<TwinVersion | null>(null)
  const [messages, setMessages] = useState<TwinChatMessage[]>([])
  const [liveProfile, setLiveProfile] = useState<CompanionProfile>(EMPTY_COMPANION_PROFILE)
  const [liveExpression, setLiveExpression] = useState<TwinExpressionSnapshot | null>(null)
  const [replyAudioUrl, setReplyAudioUrl] = useState<string | null>(null)
  const [replyAudioState, setReplyAudioState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [replyAudioError, setReplyAudioError] = useState('')
  const [chatInputMode, setChatInputMode] = useState<'voice' | 'text'>('voice')

  const replyAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastTopicInteractionRef = useRef<TwinTopicInteractionContext | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!twinId) {
      setLoading(false)
      setError('没有找到这个分身。')
      return
    }

    void (async () => {
      try {
        let nextTwin = await getTwinProfile(twinId)
        let nextVersion = await getActiveTwinVersion(nextTwin.id, nextTwin.activeVersionId)

        const growthResult = await maybeRefreshTwinGrowth()
        if (growthResult.status === 'refreshed' && growthResult.twin.id === nextTwin.id) {
          nextTwin = growthResult.twin
          nextVersion = growthResult.version
        }

        const currentProfile = await loadCompanionProfileFromSupabase()
        const recentTranscripts = await listRecentMemoryTranscripts({
          limit: 8,
          since: nextVersion.createdAt,
        })
        const profileExpression = buildLiveTwinExpression(currentProfile, recentTranscripts)
        const mergedExpression = mergeTwinExpressionSnapshots(
          nextVersion.personaSnapshot.expression,
          profileExpression,
        )

        if (!cancelled) {
          setTwin(nextTwin)
          setVersion(nextVersion)
          setLiveProfile(currentProfile)
          setLiveExpression(mergedExpression)
          setMessages([
            {
              role: 'assistant',
              content: `${nextTwin.name}在这里。你可以继续像和本人一样和我说话，我会尽量按当前激活版本的记忆、表达和边界来回应你。`,
            },
          ])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载分身失败。')
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
  }, [twinId])

  useEffect(() => {
    return () => {
      if (replyAudioUrl) {
        URL.revokeObjectURL(replyAudioUrl)
      }

      stopManagedAudio(replyAudioRef)
    }
  }, [replyAudioUrl])

  const stopReplyPlayback = () => {
    stopManagedAudio(replyAudioRef)
  }

  const playReplyAudio = async (audioUrl: string) => {
    stopReplyPlayback()
    return playManagedAudio(replyAudioRef, audioUrl)
  }

  const canSend = useMemo(
    () => Boolean(input.trim()) && !sending && !transcribing && Boolean(twin) && Boolean(version),
    [input, sending, transcribing, twin, version],
  )

  const voiceClone = version?.personaSnapshot.voiceClone

  const requestTwinReply = async (
    message: string,
    nextHistory: TwinChatMessage[],
    activeTwin: TwinProfile,
    activeVersion: TwinVersion,
    options: TwinInputOptions = {},
  ): Promise<TwinReplyResult> => {
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
    } catch (semanticError) {
      console.error('Twin semantic evidence load failed:', semanticError)
    }

    try {
      topicInteraction = await loadTwinTopicInteractionContext({
        twinId: activeTwin.id,
        message,
      })
    } catch (interactionError) {
      console.error('Twin topic interaction load failed:', interactionError)
    }

    if (!topicInteraction) {
      const derivedSeed = inheritedTopicSeed
      if (derivedSeed) {
        topicInteraction = {
          topicKey: derivedSeed.topicKey,
          askerKey: '',
          recencyBand: lastTopicInteractionRef.current?.topicKey === derivedSeed.topicKey ? 'immediate' : 'new',
          discussCount:
            lastTopicInteractionRef.current?.topicKey === derivedSeed.topicKey
              ? lastTopicInteractionRef.current.discussCount
              : 0,
          lastDiscussedAt:
            lastTopicInteractionRef.current?.topicKey === derivedSeed.topicKey
              ? lastTopicInteractionRef.current.lastDiscussedAt
              : undefined,
          lastAnswerSummary:
            lastTopicInteractionRef.current?.topicKey === derivedSeed.topicKey
              ? lastTopicInteractionRef.current.lastAnswerSummary
              : undefined,
          lastAnswerAngle:
            lastTopicInteractionRef.current?.topicKey === derivedSeed.topicKey
              ? lastTopicInteractionRef.current.lastAnswerAngle
              : undefined,
          lastAnswerMode:
            lastTopicInteractionRef.current?.topicKey === derivedSeed.topicKey
              ? lastTopicInteractionRef.current.lastAnswerMode
              : undefined,
          inheritedFromRecentTopic: derivedSeed.inheritedFromRecentTopic,
        }
      }
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
          liveProfile.styleSummary ||
          activeTwin.voiceStyleSummary ||
          (typeof persona.voiceStyleSummary === 'string' ? persona.voiceStyleSummary : ''),
        responseStyle:
          activeTwin.responseStyle ||
          (typeof persona.responseStyle === 'string' ? persona.responseStyle : ''),
        coreValues: activeTwin.coreValues,
        boundaryRules: activeTwin.boundaryRules,
        expressionSnapshot: liveExpression,
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

  const sendMessage = async (content: string, options: TwinInputOptions = {}) => {
    const message = content.trim()
    if (!message || !twin || !version) {
      return
    }

    const activeTwin = twin
    const activeVersion = version
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
    setInput('')
    setSending(true)
    setError('')
    setReplyAudioError('')

    try {
      const result = await requestTwinReply(message, priorHistory, activeTwin, activeVersion, options)
      const replyText = result.reply || '我听见了，你可以继续往下说。'

      setMessages((current) => [...current, { role: 'assistant', content: replyText }])

      if (result.topicInteraction?.topicKey) {
        try {
          const nextTopicInteraction: TwinTopicInteractionContext = {
            ...result.topicInteraction,
            recencyBand: isRecencyBand(result.debug?.topicRecencyBand)
              ? result.debug.topicRecencyBand
              : result.topicInteraction.recencyBand,
            discussCount: Math.max((result.topicInteraction.discussCount ?? 0) + 1, 1),
            lastDiscussedAt: new Date().toISOString(),
            lastAnswerSummary: replyText,
            lastAnswerAngle: result.debug?.preferredAnswerAngle || result.topicInteraction.lastAnswerAngle,
            lastAnswerMode: result.debug?.answerProgressionMode || result.topicInteraction.lastAnswerMode,
          }

          await recordTwinTopicInteraction({
            twinId: activeTwin.id,
            context: nextTopicInteraction,
            answerSummary: replyText,
            answerAngle: result.debug?.preferredAnswerAngle,
            answerMode: result.debug?.answerProgressionMode || 'fresh_answer',
            responseExcerpt: replyText.slice(0, 160),
          })
          lastTopicInteractionRef.current = nextTopicInteraction
        } catch (interactionError) {
          console.error('Twin topic interaction sync failed:', interactionError)
          lastTopicInteractionRef.current = {
            ...(result.topicInteraction as TwinTopicInteractionContext),
            discussCount: Math.max((result.topicInteraction?.discussCount ?? 0) + 1, 1),
            recencyBand: isRecencyBand(result.debug?.topicRecencyBand)
              ? result.debug.topicRecencyBand
              : result.topicInteraction?.recencyBand || 'new',
            lastDiscussedAt: new Date().toISOString(),
            lastAnswerSummary: replyText,
            lastAnswerAngle: result.debug?.preferredAnswerAngle,
            lastAnswerMode: result.debug?.answerProgressionMode || 'fresh_answer',
          }
        }
      }

      if (voiceClone?.voiceUri) {
        try {
          setReplyAudioState('loading')
          const audioBlob = await requestTwinSpeechAudio(
            replyText,
            voiceClone,
            activeTwin,
            activeVersion,
            liveProfile.styleSummary || activeTwin.voiceStyleSummary,
          )

          if (replyAudioUrl) {
            URL.revokeObjectURL(replyAudioUrl)
          }

          const nextAudioUrl = URL.createObjectURL(audioBlob)
          setReplyAudioUrl(nextAudioUrl)
          setReplyAudioState('ready')
          await playReplyAudio(nextAudioUrl)
        } catch (speechError) {
          setReplyAudioState('error')
          setReplyAudioError(speechError instanceof Error ? speechError.message : '分身语音合成失败。')
        }
      } else {
        setReplyAudioState('idle')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '分身回复失败。')
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSend) {
      return
    }

    stopReplyPlayback()
    await sendMessage(input)
  }

  const handleVoiceMessage = async (blob: Blob, mimeType: string) => {
    try {
      setTranscribing(true)
      setError('')
      stopReplyPlayback()

      const draft = await transcribeTwinChatAudioBlob(
        blob,
        mimeType,
        stripIntroHistory(messages)
          .slice(-4)
          .map((item) => item.content),
      )

      if (!draft.trustedTranscript) {
        throw new Error('这段语音没有转写出有效文字。')
      }

      if (draft.usedRepair || draft.trustLevel !== 'stable') {
        console.info('Twin voice draft stabilized', {
          trustLevel: draft.trustLevel,
          riskFlags: draft.riskFlags,
          transcript: draft.transcript,
          trustedTranscript: draft.trustedTranscript,
        })
      }

      setInput(draft.displayTranscript)
      await sendMessage(draft.trustedTranscript, {
        displayContent: draft.displayTranscript,
        source: 'voice',
        trustLevel: draft.trustLevel,
        riskFlags: draft.riskFlags,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '语音发送失败。')
    } finally {
      setTranscribing(false)
    }
  }

  const handleReplayLatestReply = async () => {
    if (!replyAudioUrl) {
      return
    }

    try {
      await playReplyAudio(replyAudioUrl)
    } catch (err) {
      setReplyAudioError(err instanceof Error ? err.message : '重播失败。')
    }
  }

  return (
    <main className="twin-page">
      <section className="twin-shell twin-shell-chat">
        <div className="twin-header">
          <div>
            <p className="twin-eyebrow">分身对话</p>
            <h1 className="twin-title">{twin?.name || '分身'}</h1>
            <p className="twin-subtitle">
              {loading
                ? '正在加载当前分身版本...'
                : twin?.personaSummary || '这是一个正在继续成长的初版分身。'}
            </p>
          </div>
          <div className="twin-card__actions">
            <Link href={resolveSurfaceHref(pathname, '/twin')} className="twin-primary-link twin-primary-link-secondary">
              返回分身列表
            </Link>
            <Link
              href={resolveSurfaceHref(pathname, `/twin/${twinId}/voice`)}
              className="twin-primary-link twin-primary-link-secondary"
            >
              管理声音样本
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="twin-panel">
            <p className="twin-muted">正在整理这个分身的当前版本...</p>
          </div>
        ) : error && !twin ? (
          <div className="twin-panel">
            <p className="twin-error">{error}</p>
          </div>
        ) : (
          <div className="twin-chat-panel">
            <div className="twin-chat-meta">
              <span>当前版本：V{version?.versionNo ?? '-'}</span>
              <span>状态：{twin?.status ?? '-'}</span>
              <span>事实：{version?.factsSnapshot.length ?? 0}</span>
              <span>经历：{version?.eventsSnapshot.length ?? 0}</span>
            </div>

            {twin && (
              <div className="twin-panel twin-chat-memory-panel">
                <p className="twin-card__meta">当前分身设定</p>
                <p className="twin-card__summary">
                  {twin.personaSummary || '这张分身还没有足够清晰的人格摘要。'}
                </p>
                {liveExpression?.summary && <p className="twin-card__meta">表达层：{liveExpression.summary}</p>}
                {twin.boundaryRules.length > 0 && (
                  <p className="twin-card__meta">边界：{twin.boundaryRules.join(' / ')}</p>
                )}
              </div>
            )}

            <div className="twin-panel twin-voice-panel">
              <div className="twin-voice-panel__header">
                <div>
                  <p className="twin-card__meta">分身声音</p>
                  <p className="twin-card__summary">
                    日常聊天页只保留声音状态和试播入口。录制、重录和样本管理已经拆到独立流程，避免和高频聊天混在一起。
                  </p>
                </div>
                <span className={`twin-card__badge ${voiceClone ? 'twin-card__badge-success' : ''}`}>
                  {voiceClone ? '已就绪' : '未生成'}
                </span>
              </div>

              {voiceClone ? (
                <div className="twin-voice-clone__ready">
                  <p className="twin-card__meta">当前已绑定音色</p>
                  <p className="twin-muted">样本文本：{voiceClone.sampleTranscript}</p>
                </div>
              ) : (
                <p className="twin-muted">还没有可用的分身音色样本。你可以进入独立流程录制一段样本声音。</p>
              )}

              <div className="twin-card__actions">
                <Link href={resolveSurfaceHref(pathname, `/twin/${twinId}/voice`)} className="twin-primary-link">
                  {voiceClone ? '重录或替换声音样本' : '录制分身声音样本'}
                </Link>
              </div>
            </div>

            <div className="twin-chat-messages">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`twin-chat-message twin-chat-message-${message.role}`}>
                  <p className="twin-chat-role">{message.role === 'assistant' ? twin?.name || '分身' : '我'}</p>
                  <p className="twin-chat-content">{message.displayContent || message.content}</p>
                </div>
              ))}
              {sending && (
                <div className="twin-chat-message twin-chat-message-assistant">
                  <p className="twin-chat-role">{twin?.name || '分身'}</p>
                  <p className="twin-chat-content">正在组织回复...</p>
                </div>
              )}
            </div>

            {voiceClone?.voiceUri && (
              <div className="twin-voice-reply">
                <div className="twin-voice-reply__meta">
                  <span>分身语音</span>
                  <span>
                    {replyAudioState === 'loading'
                      ? '合成中...'
                      : replyAudioState === 'ready'
                        ? '已准备好'
                        : replyAudioState === 'error'
                          ? '合成失败'
                          : '等待下一条回复'}
                  </span>
                </div>
                <div className="twin-card__actions">
                  <button
                    type="button"
                    className="twin-primary-link"
                    disabled={!replyAudioUrl || replyAudioState === 'loading'}
                    onClick={handleReplayLatestReply}
                  >
                    重播上一条回复
                  </button>
                </div>
                {replyAudioError && <p className="twin-error twin-chat-error">{replyAudioError}</p>}
              </div>
            )}

            <div className="input-mode-toggle">
              <button
                type="button"
                className={`input-mode-toggle__button ${chatInputMode === 'voice' ? 'input-mode-toggle__button-active' : ''}`}
                onClick={() => setChatInputMode('voice')}
              >
                语音输入
              </button>
              <button
                type="button"
                className={`input-mode-toggle__button ${chatInputMode === 'text' ? 'input-mode-toggle__button-active' : ''}`}
                onClick={() => setChatInputMode('text')}
              >
                文字输入
              </button>
            </div>

            {chatInputMode === 'voice' ? (
              <div className="twin-chat-recorder">
                <VoiceRecorder
                  compact
                  persistRecording={false}
                  buttonIdleText="按住对分身说话"
                  buttonRecordingText="松开发送这段话"
                  onRecordingReady={handleVoiceMessage}
                  onPhaseChange={(phase) => {
                    if (phase === 'recording' || phase === 'uploading') {
                      stopReplyPlayback()
                    }
                  }}
                  onRecorderError={(message) => setError(message)}
                  onUploadError={(message) => setError(message)}
                />
                {transcribing && <p className="twin-muted">正在转写你刚才这段话...</p>}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="twin-chat-form">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="也可以直接输入文字继续和分身对话"
                  className="twin-chat-input"
                  rows={3}
                />
                <button type="submit" className="twin-primary-link" disabled={!canSend}>
                  {sending ? '回复中...' : transcribing ? '转写中...' : '发送'}
                </button>
              </form>
            )}

            {error && twin && <p className="twin-error twin-chat-error">{error}</p>}
          </div>
        )}
      </section>
    </main>
  )
}
