'use client'

import Link from 'next/link'
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { VoiceRecorder } from '@/components/VoiceRecorder'
import { getFileExtension } from '@/lib/audioMime'
import { resolveSurfaceHref } from '@/lib/clientSurfaceRouting'
import {
  EMPTY_COMPANION_PROFILE,
  loadCompanionProfileFromSupabase,
} from '@/lib/companionProfile'
import { ingestCompanionProfileDelta } from '@/lib/companionProfileTraits'
import { buildFallbackEvents } from '@/lib/eventHeuristics'
import { saveMemoryEvents } from '@/lib/memoryEvents'
import { saveMemoryFacts } from '@/lib/memoryFacts'
import { getSessionUser, insertPendingMemory, updateMemoryTranscript, uploadRecordingAsset } from '@/lib/recordingPersistence'
import { supabase } from '@/lib/supabase'
import { getTwinBootstrapProgress, getTwinBootstrapQuestion } from '@/lib/twinBootstrap'
import { listTwinBootstrapAnswers, saveTwinBootstrapAnswer, updateTwinBootstrapAnswer } from '@/lib/twinBootstrapAnswers'
import { startOrResumeTwinBootstrap, updateTwinBootstrapSessionProgress, uploadTwinPortrait } from '@/lib/twinProfiles'
import { createTwinVersion, updateTwinProfileFromSeed } from '@/lib/twinVersions'
import {
  CompanionProfile,
  EventExtractionResult,
  FactExtractionResult,
  ProfileExtractionResult,
} from '@/types/companion'
import { TwinBootstrapFinishResult, TwinBootstrapStartResult, TwinProfile, TwinSeedCard } from '@/types/twin'

type ProcessingState = 'idle' | 'saving' | 'error' | 'done'
type DraftSegmentStatus = 'queued' | 'processing' | 'ready' | 'error'

type DraftSegment = {
  id: string
  questionCode: string
  memoryId?: string
  transcript: string
  status: DraftSegmentStatus
  error?: string
}

type QueuedSegment = {
  id: string
  blob: Blob
  mimeType: string
  sessionId: string
  twinId: string
  questionCode: string
  questionTitle: string
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
      throw new Error('error' in result ? result.error || 'Fact extraction failed.' : 'Fact extraction failed.')
    }

    return result.facts
  } catch (error) {
    console.error('分身建模提取 facts 失败:', error)
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
      throw new Error('error' in result ? result.error || 'Event extraction failed.' : 'Event extraction failed.')
    }

    return result.events.length > 0 ? result.events : buildFallbackEvents(transcript)
  } catch (error) {
    console.error('分身建模提取 events 失败:', error)
    return buildFallbackEvents(transcript)
  }
}

async function requestProfileExtraction(transcript: string, profile: CompanionProfile) {
  try {
    const response = await fetch('/api/companion/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript,
        profile,
      }),
    })

    const result = (await response.json()) as ProfileExtractionResult | { error?: string }
    if (!response.ok || !('profileDelta' in result)) {
      throw new Error('error' in result ? result.error || 'Profile extraction failed.' : 'Profile extraction failed.')
    }

    return result.profileDelta
  } catch (error) {
    console.error('分身建模提取 profile 失败:', error)
    return null
  }
}

export default function TwinBootstrapPage() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [processingState, setProcessingState] = useState<ProcessingState>('idle')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [email, setEmail] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [result, setResult] = useState<TwinBootstrapStartResult | null>(null)
  const [profile, setProfile] = useState<CompanionProfile>(EMPTY_COMPANION_PROFILE)
  const [statusMessage, setStatusMessage] = useState('')
  const [pageError, setPageError] = useState('')
  const [lastTranscript, setLastTranscript] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [seedCard, setSeedCard] = useState<TwinSeedCard | null>(null)
  const [draftSegments, setDraftSegments] = useState<DraftSegment[]>([])
  const [answerInputMode, setAnswerInputMode] = useState<'voice' | 'text'>('voice')
  const [typedSegmentInput, setTypedSegmentInput] = useState('')
  const [portraitFile, setPortraitFile] = useState<File | null>(null)
  const [portraitPreviewUrl, setPortraitPreviewUrl] = useState('')
  const [portraitUploading, setPortraitUploading] = useState(false)

  const queueRef = useRef<QueuedSegment[]>([])
  const processingQueueRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setIsAuthenticated(Boolean(session?.user))
      setEmail(session?.user?.email ?? '')
    })

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!cancelled) {
        setIsAuthenticated(Boolean(session?.user))
        setEmail(session?.user?.email ?? '')
      }

      const loadedProfile = await loadCompanionProfileFromSupabase()
      if (!cancelled) {
        setProfile(loadedProfile)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!portraitFile) {
      setPortraitPreviewUrl('')
      return
    }

    const nextPreviewUrl = URL.createObjectURL(portraitFile)
    setPortraitPreviewUrl(nextPreviewUrl)

    return () => {
      URL.revokeObjectURL(nextPreviewUrl)
    }
  }, [portraitFile])

  const portraitDisplayUrl = portraitPreviewUrl || result?.twin.portraitUrl || ''

  const handlePortraitFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setPortraitFile(nextFile)
    setPageError('')
  }

  const ensureTwinPortrait = async (twin: TwinProfile) => {
    const hasExistingPortrait = Boolean(twin.portraitUrl?.trim())

    if (!portraitFile && hasExistingPortrait) {
      return twin
    }

    if (!portraitFile) {
      throw new Error('请先上传分身照片。')
    }

    setPortraitUploading(true)
    setStatusMessage('正在上传分身照片，后续会用于分身详情和授权人物展示。')

    try {
      const updatedTwin = await uploadTwinPortrait(twin.id, {
        blob: portraitFile,
        mimeType: portraitFile.type || 'image/jpeg',
        filePrefix: 'bootstrap_portrait',
      })

      setResult((current) => (current ? { ...current, twin: updatedTwin } : current))
      setPortraitFile(null)
      return updatedTwin
    } finally {
      setPortraitUploading(false)
    }
  }

  const handleStart = async () => {
    try {
      setStarting(true)
      setPageError('')
      setStatusMessage('')
      setSeedCard(null)
      setLastTranscript('')
      const next = await startOrResumeTwinBootstrap(nameInput)
      const twinWithPortrait = await ensureTwinPortrait(next.twin)
      setResult({
        ...next,
        twin: twinWithPortrait,
      })
      setIsComplete(next.session.status === 'completed' || next.session.questionIndex >= next.question.total)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : '开始分身建模失败。')
    } finally {
      setStarting(false)
    }
  }

  const progress = result ? getTwinBootstrapProgress(result.session.questionIndex) : 0

  const readySegments = draftSegments.filter((segment) => segment.status === 'ready' && segment.transcript.trim())
  const pendingSegments = draftSegments.filter(
    (segment) => segment.status === 'queued' || segment.status === 'processing',
  )

  const progressLabel = useMemo(() => {
    if (!result) return '第 0 / 12 题'
    return `第 ${Math.min(result.question.index, result.question.total)} / ${result.question.total} 题`
  }, [result])

  const processQueuedSegments = async () => {
    if (processingQueueRef.current) {
      return
    }

    processingQueueRef.current = true

    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!
      if (!next) break

      try {
        setDraftSegments((current) =>
          current.map((segment) =>
            segment.id === next.id
              ? {
                  ...segment,
                  status: 'processing',
                }
              : segment,
          ),
        )
        setStatusMessage('正在记录并转写这一段，你现在也可以继续补充下一段。')

        const sessionUser = await getSessionUser()

        if (!sessionUser) {
          throw new Error('请先登录，再继续这轮建模。')
        }

        const user = sessionUser
        const extension = getFileExtension(next.mimeType)
        const uploaded = await uploadRecordingAsset({
          ownerId: user.id,
          blob: next.blob,
          mimeType: next.mimeType,
          filePrefix: `twin_bootstrap_${next.sessionId}`,
        })

        const insertedMemory = await insertPendingMemory({
          userId: user.id,
          audioUrl: uploaded.publicUrl,
          audioPath: uploaded.filePath,
          audioMimeType: next.mimeType,
          audioSizeBytes: next.blob.size,
          summary: `鍒嗚韩寤烘ā锛?{next.questionTitle}`,
          tags: ['twin_bootstrap', next.questionCode],
        })

        if (false) {
        const timestamp = Date.now()
        const filePath = `${user.id}/twin_bootstrap_${next.sessionId}_${timestamp}.${extension}`

        const { error: uploadError } = await supabase.storage.from('recordings').upload(filePath, next.blob, {
          contentType: next.mimeType,
          upsert: false,
        })

        if (uploadError) {
          throw uploadError
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from('recordings').getPublicUrl(filePath)

        const { data: insertedMemory, error: memoryInsertError } = await supabase
          .from('memories')
          .insert({
            user_id: user.id,
            audio_url: publicUrl,
            audio_path: filePath,
            audio_mime_type: next.mimeType,
            audio_size_bytes: next.blob.size,
            transcript_status: 'pending',
            reply_status: 'completed',
            profile_status: 'pending',
            summary: `分身建模：${next.questionTitle}`,
            tags: ['twin_bootstrap', next.questionCode],
          })
          .select('id')
          .single()

        if (memoryInsertError) {
          throw memoryInsertError
        }
        }

        const formData = new FormData()
        formData.append('audio', new File([next.blob], `bootstrap.${extension}`, { type: next.mimeType }))

        const transcriptionResponse = await fetch('/api/companion/transcribe', {
          method: 'POST',
          body: formData,
        })

        const transcriptionPayload = (await transcriptionResponse.json().catch(() => ({}))) as {
          transcript?: string
          error?: string
        }

        if (!transcriptionResponse.ok || !transcriptionPayload.transcript?.trim()) {
          throw new Error(transcriptionPayload.error || '这段录音没有成功转写。')
        }

        const transcript = transcriptionPayload.transcript.trim()
        await updateMemoryTranscript(insertedMemory.id, {
          transcript,
          summary: `鍒嗚韩寤烘ā锛?{next.questionTitle}`,
          tags: ['twin_bootstrap', next.questionCode],
          profileStatus: 'pending',
        })

        if (false) {
        const { error: memoryUpdateError } = await supabase
          .from('memories')
          .update({
            transcript,
            transcript_status: 'completed',
            summary: `分身建模：${next.questionTitle}`,
            tags: ['twin_bootstrap', next.questionCode],
            profile_status: 'pending',
          })
          .eq('id', insertedMemory.id)

        if (memoryUpdateError) {
          throw memoryUpdateError
        }
        }

        setDraftSegments((current) =>
          current.map((segment) =>
            segment.id === next.id
              ? {
                  ...segment,
                  status: 'ready',
                  transcript,
                  memoryId: insertedMemory.id,
                }
              : segment,
          ),
        )
        setStatusMessage('这段已经转写出来了。你可以继续补充，也可以等全部转写完后点确认。')
      } catch (error) {
        console.error('分身建模单段转写失败:', error)
        const message = error instanceof Error ? error.message : '这段录音处理失败了。'

        setDraftSegments((current) =>
          current.map((segment) =>
            segment.id === next.id
              ? {
                  ...segment,
                  status: 'error',
                  error: message,
                }
              : segment,
          ),
        )
        setPageError(message)
        setStatusMessage('有一段处理失败了。你可以继续补充新的内容，或者先确认已转写的部分。')
      }
    }

    processingQueueRef.current = false
  }

  const handleSegmentTranscriptChange = (segmentId: string, transcript: string) => {
    setDraftSegments((current) =>
      current.map((segment) =>
        segment.id === segmentId
          ? {
              ...segment,
              transcript,
            }
          : segment,
      ),
    )
  }

  const handleRemoveSegment = (segmentId: string) => {
    queueRef.current = queueRef.current.filter((segment) => segment.id !== segmentId)
    setDraftSegments((current) => current.filter((segment) => segment.id !== segmentId))
    setStatusMessage('这一段我先帮你去掉了。你可以继续补充新的内容，或确认现在保留的部分。')
    setPageError('')
  }

  const handleBootstrapAnswer = async (blob: Blob, mimeType: string) => {
    if (!result) {
      return
    }

    try {
      const segmentId = `segment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      setProcessingState('idle')
      setPageError('')
      setStatusMessage('我先记下这一段。你可以继续说，转写完会显示在下面。')
      setDraftSegments((current) => [
        ...current,
        {
          id: segmentId,
          questionCode: result.question.item.code,
          transcript: '',
          status: 'queued',
        },
      ])

      queueRef.current.push({
        id: segmentId,
        blob,
        mimeType,
        sessionId: result.session.id,
        twinId: result.twin.id,
        questionCode: result.question.item.code,
        questionTitle: result.question.item.title,
      })

      void processQueuedSegments()
    } catch (error) {
      console.error('分身建模记录当前题失败:', error)
      setProcessingState('error')
      setPageError(error instanceof Error ? error.message : '这题录音处理失败了，请再试一次。')
      setStatusMessage('')
    }
  }

  const handleAddTypedSegment = () => {
    if (!result) {
      return
    }

    const transcript = typedSegmentInput.trim()
    if (!transcript) {
      return
    }

    const segmentId = `segment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setProcessingState('idle')
    setPageError('')
    setStatusMessage('这段我先按文字记下来了。你可以继续补充，或者直接确认这一题。')
    setDraftSegments((current) => [
      ...current,
      {
        id: segmentId,
        questionCode: result.question.item.code,
        transcript,
        status: 'ready',
      },
    ])
    setTypedSegmentInput('')
  }

  const handleConfirmQuestion = async () => {
    if (!result) {
      return
    }

    if (pendingSegments.length > 0) {
      return
    }

    try {
      const confirmedSegments = draftSegments.filter(
        (segment) => segment.status === 'ready' && segment.transcript.trim() && segment.questionCode === result.question.item.code,
      )

      if (confirmedSegments.length === 0) {
        throw new Error('请至少先录一段并等它转写完成，再确认这一题。')
      }

      setProcessingState('saving')
      setPageError('')
      setStatusMessage('我先把这题的多段回答合并起来，再进入下一题。')

      const combinedTranscript = confirmedSegments.map((segment) => segment.transcript.trim()).join('\n')
      const primaryMemoryId =
        confirmedSegments[confirmedSegments.length - 1]?.memoryId ??
        confirmedSegments.find((segment) => segment.memoryId)?.memoryId

      const savedAnswer = await saveTwinBootstrapAnswer({
        sessionId: result.session.id,
        twinId: result.twin.id,
        questionCode: result.question.item.code,
        questionText: result.question.item.prompt,
        memoryId: primaryMemoryId,
        transcript: combinedTranscript,
        facts: [],
        events: [],
        profileDelta: {
          styleSummary: '',
          catchphrases: [],
          lexicalHabits: [],
          emotionalMarkers: [],
          storytellingPatterns: [],
          relationshipMentions: [],
          memoryThemes: [],
          lifeFacts: [],
          pacing: '',
          pauses: '',
          twinNotes: '',
        },
      })

      setLastTranscript(combinedTranscript)

      const nextQuestionIndex = result.session.questionIndex + 1
      const nextAnswersCount = result.session.answersCount + 1
      const hasMoreQuestions = nextQuestionIndex < result.question.total

      const updatedSession = await updateTwinBootstrapSessionProgress(result.session.id, {
        questionIndex: nextQuestionIndex,
        stageIndex: hasMoreQuestions
          ? getTwinBootstrapQuestion(nextQuestionIndex)?.stageIndex ?? result.session.stageIndex
          : result.session.stageIndex,
        answersCount: nextAnswersCount,
        status: hasMoreQuestions ? 'in_progress' : 'completed',
        completedAt: hasMoreQuestions ? null : new Date().toISOString(),
      })

      setDraftSegments([])

      if (!hasMoreQuestions) {
        setResult((current) =>
          current
            ? {
                ...current,
                session: updatedSession,
              }
            : current,
        )
        setIsComplete(true)
        setProcessingState('done')
        setStatusMessage('这轮 12 题已经录完。下一步我会把它们汇总成初版分身卡。')
      } else {
        const nextQuestion = getTwinBootstrapQuestion(nextQuestionIndex)
        if (!nextQuestion) {
          throw new Error('下一题没有找到，请重新进入这轮建模。')
        }

        setResult((current) =>
          current
            ? {
                ...current,
                session: updatedSession,
                question: {
                  index: nextQuestionIndex + 1,
                  total: current.question.total,
                  item: nextQuestion,
                },
              }
            : current,
        )
        setProcessingState('done')
        setStatusMessage('这题已经确认，继续下一题。上一题的画像整理会在后台继续完成。')
        setTypedSegmentInput('')
      }

      void (async () => {
        try {
          const [facts, events, profileDelta] = await Promise.all([
            requestFactExtraction(combinedTranscript),
            requestEventExtraction(combinedTranscript),
            requestProfileExtraction(combinedTranscript, profile),
          ])

          if (primaryMemoryId) {
            await Promise.all([saveMemoryFacts(primaryMemoryId, facts), saveMemoryEvents(primaryMemoryId, events)])

            await supabase
              .from('memories')
              .update({
                profile_status: profileDelta ? 'completed' : 'failed',
                last_error: null,
              })
              .eq('id', primaryMemoryId)
          }

          let nextProfile = profile
          if (profileDelta) {
            const ingested = await ingestCompanionProfileDelta({
              currentProfile: profile,
              profileDelta,
              transcript: combinedTranscript,
              memoryId: primaryMemoryId,
              trustLevel: 'guarded',
              riskFlags: [],
            })
            nextProfile = ingested.profile
            setProfile(nextProfile)
          }

          await updateTwinBootstrapAnswer(savedAnswer.id, {
            extractedFacts: facts as unknown as Array<Record<string, unknown>>,
            extractedEvents: events as unknown as Array<Record<string, unknown>>,
            extractedProfileDelta:
              (profileDelta ??
                {
                  styleSummary: '',
                  catchphrases: [],
                  lexicalHabits: [],
                  emotionalMarkers: [],
                  storytellingPatterns: [],
                  relationshipMentions: [],
                  memoryThemes: [],
                  lifeFacts: [],
                  pacing: '',
                  pauses: '',
                  twinNotes: '',
                }) as unknown as Record<string, unknown>,
          })
        } catch (backgroundError) {
          console.error('分身建模确认后的后台整理失败:', backgroundError)

          if (primaryMemoryId) {
            await supabase
              .from('memories')
              .update({
                profile_status: 'failed',
                last_error:
                  backgroundError instanceof Error ? backgroundError.message : 'Twin bootstrap background enrichment failed.',
              })
              .eq('id', primaryMemoryId)
          }
        }
      })()
    } catch (error) {
      console.error('确认当前题失败:', error)
      setProcessingState('error')
      setPageError(error instanceof Error ? error.message : '确认当前题失败。')
      setStatusMessage('')
    }
  }

  const handleFinish = async () => {
    if (!result) {
      return
    }

    try {
      setFinishing(true)
      setPageError('')
      setStatusMessage('我在汇总这轮建模答案，生成你的初版分身卡。')
      const readyTwin = await ensureTwinPortrait(result.twin)

      const answers = await listTwinBootstrapAnswers(result.session.id)
      if (answers.length === 0) {
        throw new Error('这轮建模还没有可用答案，暂时无法生成分身卡。')
      }

      const finishResponse = await fetch('/api/twin/bootstrap/finish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          twinName: readyTwin.name,
          answers,
          profile,
        }),
      })

      const finishPayload = (await finishResponse.json().catch(() => ({}))) as
        | TwinBootstrapFinishResult
        | { error?: string }

      if (!finishResponse.ok || !('seedCard' in finishPayload)) {
        throw new Error('error' in finishPayload ? finishPayload.error || '分身卡生成失败。' : '分身卡生成失败。')
      }

      const factsSnapshot = answers.flatMap((answer) => answer.extractedFacts)
      const eventsSnapshot = answers.flatMap((answer) => answer.extractedEvents)
      const personaSnapshot = {
        profile: profile as unknown as Record<string, unknown>,
        summary: finishPayload.seedCard.personaSummary,
        voiceStyleSummary: finishPayload.seedCard.voiceStyleSummary,
        responseStyle: finishPayload.seedCard.responseStyle,
        coreValues: finishPayload.seedCard.coreValues,
        boundaryRules: finishPayload.seedCard.boundaryRules,
        expression: finishPayload.seedCard.expression,
      }

      const version = await createTwinVersion({
        twinId: readyTwin.id,
        personaSnapshot,
        factsSnapshot,
        eventsSnapshot,
        peopleSnapshot: [],
        promptSnapshot: finishPayload.seedCard.promptSnapshot,
      })

      const updatedTwin = await updateTwinProfileFromSeed({
        twinId: readyTwin.id,
        card: finishPayload.seedCard,
        activeVersionId: version.id,
      })

      setSeedCard(finishPayload.seedCard)
      setResult((current) => (current ? { ...current, twin: updatedTwin } : current))
      setStatusMessage('初版分身已经生成，可以作为后续对话和继续成长的起点了。')
    } catch (error) {
      console.error('生成初版分身卡失败:', error)
      setPageError(error instanceof Error ? error.message : '生成初版分身卡失败。')
      setStatusMessage('')
    } finally {
      setFinishing(false)
    }
  }

  return (
    <main className="twin-bootstrap-page">
      <div className="twin-bootstrap-shell">
        <Link href={resolveSurfaceHref(pathname, '/twin')} className="twin-bootstrap-back">
          返回主页
        </Link>

        <section className="twin-bootstrap-card">
          <p className="twin-bootstrap-eyebrow">快速生成分身</p>
          <h1 className="twin-bootstrap-title">先用一轮语音访谈，生成你的初版分身。</h1>
          <p className="twin-bootstrap-description">
            每个用户只有一个分身。这一步不是再创建一个新分身，而是先把你的分身冷启动出来，后面它会继续继承你不断确认下来的记忆和习惯。
          </p>

          {loading ? (
            <p className="twin-bootstrap-muted">正在检查登录状态...</p>
          ) : !isAuthenticated ? (
            <div className="twin-bootstrap-block">
              <p className="twin-bootstrap-warning">请先回到主页登录，再开始生成分身。</p>
            </div>
          ) : (
            <>
              <div className="twin-bootstrap-block">
                <p className="twin-bootstrap-label">当前账号</p>
                <p className="twin-bootstrap-value">{email || '已登录'}</p>
              </div>

              <div className="twin-bootstrap-block">
                <label className="twin-bootstrap-label" htmlFor="twinName">
                  分身名字
                </label>
                <input
                  id="twinName"
                  className="twin-bootstrap-input"
                  placeholder="可选，不填则自动生成"
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                />
              </div>

              <div className="twin-bootstrap-block">
                <label className="twin-bootstrap-label" htmlFor="twinPortrait">
                  分身照片
                </label>
                <p className="twin-bootstrap-muted">
                  创建完成后的分身详情页、授权人物卡片和对话入口都会使用这张独立照片。
                </p>
                <div className="twin-bootstrap-portrait-picker">
                  <div className="twin-bootstrap-portrait-frame">
                    {portraitDisplayUrl ? (
                      <img src={portraitDisplayUrl} alt="分身照片预览" className="twin-bootstrap-portrait-frame__image" />
                    ) : (
                      <div className="twin-bootstrap-portrait-frame__placeholder">待上传</div>
                    )}
                  </div>
                  <div className="twin-bootstrap-portrait-picker__body">
                    <input
                      id="twinPortrait"
                      type="file"
                      accept="image/*"
                      className="twin-bootstrap-file-input"
                      onChange={handlePortraitFileChange}
                    />
                    <p className="twin-bootstrap-value">
                      {portraitFile
                        ? portraitFile.name
                        : result?.twin.portraitUrl
                          ? '已使用当前分身照片'
                          : '尚未上传照片'}
                    </p>
                    <p className="twin-bootstrap-muted">
                      请上传清晰正脸照片。后续授权给他人对话时，会直接展示这张素材。
                    </p>
                  </div>
                </div>
              </div>

              <div className="twin-bootstrap-actions">
                <button
                  type="button"
                  className="twin-bootstrap-button"
                  onClick={handleStart}
                  disabled={starting || portraitUploading}
                >
                  {portraitUploading ? '正在上传照片...' : starting ? '正在准备...' : result ? '继续这轮建模' : '开始生成我的分身'}
                </button>
              </div>

              {pageError && <p className="twin-bootstrap-error">{pageError}</p>}

              {result && (
                <div className="twin-bootstrap-preview">
                  <div className="twin-bootstrap-preview__header">
                    <div>
                      <p className="twin-bootstrap-label">当前分身草稿</p>
                      <p className="twin-bootstrap-value">{result.twin.name}</p>
                    </div>
                    <span className="twin-bootstrap-status">{result.twin.status}</span>
                  </div>

                  <div className="twin-bootstrap-progress">
                    <div className="twin-bootstrap-progress__bar">
                      <span style={{ width: `${Math.max(progress * 100, 8)}%` }} />
                    </div>
                    <p className="twin-bootstrap-muted">{progressLabel}</p>
                  </div>

                  {!isComplete ? (
                    <>
                      <div className="twin-bootstrap-question">
                        <p className="twin-bootstrap-question__title">{result.question.item.title}</p>
                        <p className="twin-bootstrap-question__prompt">{result.question.item.prompt}</p>
                        <p className="twin-bootstrap-question__hint">{result.question.item.hint}</p>
                      </div>

                      <div className="twin-bootstrap-interview">
                        <div className="input-mode-toggle">
                          <button
                            type="button"
                            className={`input-mode-toggle__button ${answerInputMode === 'voice' ? 'input-mode-toggle__button-active' : ''}`}
                            onClick={() => setAnswerInputMode('voice')}
                          >
                            语音回答
                          </button>
                          <button
                            type="button"
                            className={`input-mode-toggle__button ${answerInputMode === 'text' ? 'input-mode-toggle__button-active' : ''}`}
                            onClick={() => setAnswerInputMode('text')}
                          >
                            文字回答
                          </button>
                        </div>

                        {answerInputMode === 'voice' ? (
                          <VoiceRecorder
                            persistRecording={false}
                            buttonIdleText="按住继续说"
                            buttonRecordingText="松开结束回答"
                            onRecordingReady={handleBootstrapAnswer}
                            onRecorderError={(message) => {
                              setProcessingState('error')
                              setPageError(message)
                            }}
                            onUploadError={(message) => {
                              setProcessingState('error')
                              setPageError(message)
                            }}
                            onPhaseChange={(phase) => {
                              if (phase === 'recording') {
                                setStatusMessage('我在听。你可以分几段说，每说完一段松开就行。')
                              } else if (phase === 'uploading') {
                                setStatusMessage('这段已经收到，正在转写…')
                              }
                            }}
                          />
                        ) : (
                          <div className="twin-bootstrap-text-entry">
                            <textarea
                              className="twin-bootstrap-transcript-editor"
                              value={typedSegmentInput}
                              onChange={(event) => setTypedSegmentInput(event.target.value)}
                              rows={4}
                              placeholder="直接输入这一题的回答内容，也可以分多段逐次加入"
                            />
                            <div className="twin-bootstrap-transcript-actions">
                              <button
                                type="button"
                                className="twin-bootstrap-segment-button"
                                onClick={handleAddTypedSegment}
                                disabled={!typedSegmentInput.trim()}
                              >
                                加入这一段
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="twin-bootstrap-answer-preview">
                        <p className="twin-bootstrap-label">本题已记录内容</p>
                        {draftSegments.length === 0 ? (
                          <p className="twin-bootstrap-muted">你可以先说第一段，转写完成后文字会显示在这里。</p>
                        ) : (
                          <div className="twin-bootstrap-transcript-list">
                            {draftSegments.map((segment, index) => (
                              <div key={segment.id} className={`twin-bootstrap-transcript-item twin-bootstrap-transcript-item-${segment.status}`}>
                                <p className="twin-bootstrap-label">第 {index + 1} 段</p>
                                {segment.status === 'ready' ? (
                                  <>
                                    <textarea
                                      className="twin-bootstrap-transcript-editor"
                                      value={segment.transcript}
                                      onChange={(event) => handleSegmentTranscriptChange(segment.id, event.target.value)}
                                      rows={Math.max(3, Math.min(8, segment.transcript.split('\n').length + 1))}
                                    />
                                    <div className="twin-bootstrap-transcript-actions">
                                      <button
                                        type="button"
                                        className="twin-bootstrap-segment-button twin-bootstrap-segment-button-danger"
                                        onClick={() => handleRemoveSegment(segment.id)}
                                      >
                                        删除这段
                                      </button>
                                    </div>
                                  </>
                                ) : segment.status === 'error' ? (
                                  <>
                                    <p className="twin-bootstrap-error twin-bootstrap-inline-error">
                                      {segment.error || '这段转写失败了'}
                                    </p>
                                    <div className="twin-bootstrap-transcript-actions">
                                      <button
                                        type="button"
                                        className="twin-bootstrap-segment-button twin-bootstrap-segment-button-danger"
                                        onClick={() => handleRemoveSegment(segment.id)}
                                      >
                                        删掉这段
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <p className="twin-bootstrap-typing">
                                    正在记录转写
                                    <span className="twin-bootstrap-dots" aria-hidden="true">
                                      <span>.</span>
                                      <span>.</span>
                                      <span>.</span>
                                    </span>
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="twin-bootstrap-actions">
                        <button
                          type="button"
                          className="twin-bootstrap-button"
                          onClick={handleConfirmQuestion}
                          disabled={pendingSegments.length > 0 || readySegments.length === 0 || processingState === 'saving'}
                        >
                          {pendingSegments.length > 0
                            ? '还有内容正在转写…'
                            : readySegments.length === 0
                              ? '先录入并完成转写'
                              : '确认这一题并进入下一题'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="twin-bootstrap-complete">
                      <p className="twin-bootstrap-question__title">这一轮建模已经录完</p>
                      <p className="twin-bootstrap-question__prompt">
                        12 题都已经收齐。下一步我会把这些回答汇总成你的初版分身卡。
                      </p>
                      <div className="twin-bootstrap-actions">
                        <button
                          type="button"
                          className="twin-bootstrap-button"
                          onClick={handleFinish}
                          disabled={finishing || Boolean(seedCard) || portraitUploading}
                        >
                          {portraitUploading
                            ? '正在上传照片...'
                            : finishing
                              ? '正在生成分身卡...'
                              : seedCard
                                ? '初版分身已生成'
                                : '生成初版分身卡'}
                        </button>
                      </div>
                    </div>
                  )}

                  {statusMessage && <p className="twin-bootstrap-next">{statusMessage}</p>}

                  {lastTranscript && (
                    <div className="twin-bootstrap-answer-preview">
                      <p className="twin-bootstrap-label">上一题转写</p>
                      <p className="twin-bootstrap-value">{lastTranscript}</p>
                    </div>
                  )}

                  {seedCard && (
                    <div className="twin-bootstrap-seed-card">
                      <p className="twin-bootstrap-question__title">你的初版分身卡</p>
                      <p className="twin-bootstrap-question__prompt">{seedCard.personaSummary}</p>
                      <p className="twin-bootstrap-question__hint">{seedCard.voiceStyleSummary}</p>
                      <div className="twin-bootstrap-seed-grid">
                        <div>
                          <p className="twin-bootstrap-label">它已经记住的几件事</p>
                          <ul className="twin-bootstrap-list">
                            {seedCard.factsPreview.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="twin-bootstrap-label">关键经历</p>
                          <ul className="twin-bootstrap-list">
                            {seedCard.eventsPreview.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="twin-bootstrap-seed-grid">
                        <div>
                          <p className="twin-bootstrap-label">核心价值</p>
                          <ul className="twin-bootstrap-list">
                            {seedCard.coreValues.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="twin-bootstrap-label">边界与敏感点</p>
                          <ul className="twin-bootstrap-list">
                            {seedCard.boundaryRules.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      {seedCard.expression.summary && (
                        <div className="twin-bootstrap-answer-preview">
                          <p className="twin-bootstrap-label">表达层摘要</p>
                          <p className="twin-bootstrap-value">{seedCard.expression.summary}</p>
                        </div>
                      )}
                      {seedCard.expression.phrasebook.length > 0 && (
                        <div className="twin-bootstrap-answer-preview">
                          <p className="twin-bootstrap-label">代表性说法</p>
                          <ul className="twin-bootstrap-list">
                            {seedCard.expression.phrasebook.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="twin-bootstrap-muted">
                        当前可用度：记忆 {seedCard.memoryReadinessScore}% / 风格 {seedCard.styleReadinessScore}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
