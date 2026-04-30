'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { VoiceRecorder } from '@/components/VoiceRecorder'
import { loadCompanionProfileFromSupabase } from '@/lib/companionProfile'
import { resolveSurfaceHref } from '@/lib/clientSurfaceRouting'
import { playManagedAudio, stopManagedAudio } from '@/lib/platform/audioPlayback'
import { getTwinProfile } from '@/lib/twinProfiles'
import { getActiveTwinVersion, updateTwinVersionPersonaSnapshot } from '@/lib/twinVersions'
import { createTwinVoiceClone, getTwinVoiceSampleDraft, requestTwinSpeechAudio } from '@/lib/twinVoice'
import { TwinPersonaSnapshot, TwinProfile, TwinVersion } from '@/types/twin'

type VoiceCloneDraft = {
  blob: Blob
  mimeType: string
  transcript: string
  durationMs: number
}

export default function TwinVoiceSamplePage() {
  const params = useParams<{ id: string }>()
  const pathname = usePathname()
  const twinId = params?.id

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [twin, setTwin] = useState<TwinProfile | null>(null)
  const [version, setVersion] = useState<TwinVersion | null>(null)
  const [draft, setDraft] = useState<VoiceCloneDraft | null>(null)
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null)

  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!twinId) {
      setLoading(false)
      setError('没有找到这个分身。')
      return
    }

    void (async () => {
      try {
        const nextTwin = await getTwinProfile(twinId)
        const nextVersion = await getActiveTwinVersion(nextTwin.id, nextTwin.activeVersionId)

        if (!cancelled) {
          setTwin(nextTwin)
          setVersion(nextVersion)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载分身声音样本失败。')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (previewAudioUrl) {
        URL.revokeObjectURL(previewAudioUrl)
      }
      stopManagedAudio(previewAudioRef)
    }
  }, [previewAudioUrl, twinId])

  const handleVoiceCloneSample = async (blob: Blob, mimeType: string) => {
    try {
      setBusy(true)
      setError('')
      setNotice('')
      const nextDraft = await getTwinVoiceSampleDraft(blob, mimeType)
      setDraft({
        blob,
        mimeType,
        transcript: nextDraft.transcript,
        durationMs: nextDraft.durationMs,
      })
      setNotice('样本转写已经出来了。你可以先改文字，再生成分身专属音色。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '样本转写失败。')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateVoiceClone = async () => {
    if (!draft || !twin || !version) {
      return
    }

    try {
      setBusy(true)
      setError('')
      setNotice('')

      const voiceClone = await createTwinVoiceClone(twin.name, draft)
      const nextPersonaSnapshot: TwinPersonaSnapshot = {
        ...(version.personaSnapshot ?? {}),
        voiceClone,
      }

      const updatedVersion = await updateTwinVersionPersonaSnapshot(version.id, nextPersonaSnapshot)
      setVersion(updatedVersion)
      setDraft(null)

      const profile = await loadCompanionProfileFromSupabase()
      const previewText = `${twin.name}，现在会优先用你的声音来回应你。`
      const previewBlob = await requestTwinSpeechAudio(
        previewText,
        voiceClone,
        twin,
        updatedVersion,
        profile.styleSummary || twin.voiceStyleSummary,
      )

      if (previewAudioUrl) {
        URL.revokeObjectURL(previewAudioUrl)
      }

      const nextAudioUrl = URL.createObjectURL(previewBlob)
      setPreviewAudioUrl(nextAudioUrl)
      await playManagedAudio(previewAudioRef, nextAudioUrl)
      setNotice('分身专属音色已经准备好了。接下来它会优先用这条声音和你说话。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '分身音色生成失败。')
    } finally {
      setBusy(false)
    }
  }

  const handleReplayPreview = async () => {
    if (!previewAudioUrl) {
      return
    }

    try {
      await playManagedAudio(previewAudioRef, previewAudioUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : '试播失败。')
    }
  }

  const voiceClone = version?.personaSnapshot.voiceClone

  return (
    <main className="surface-page">
      <section className="surface-panel">
        <p className="surface-eyebrow">声音样本</p>
        <h1 className="surface-title">{twin?.name || '分身'} 的专属声音</h1>
        <p className="surface-subtitle">
          这个流程独立于日常聊天。先录一段 8 到 10 秒、发音清晰、环境安静的样本，再确认转写文本，最后生成可跨 App 和 Web 复用的声音配置。
        </p>
        <div className="surface-panel__header">
          <Link href={resolveSurfaceHref(pathname, `/twin/${twinId}`)} className="surface-link">
            返回分身聊天
          </Link>
        </div>
      </section>

      {loading ? (
        <section className="surface-panel">
          <p className="surface-muted">正在加载当前分身声音配置...</p>
        </section>
      ) : error && !twin ? (
        <section className="surface-panel">
          <p className="surface-error">{error}</p>
        </section>
      ) : (
        <>
          <section className="surface-panel">
            <div className="surface-panel__header">
              <h2 className="surface-panel__title">当前状态</h2>
              <span className="surface-panel__meta">{voiceClone ? '已就绪' : '未生成'}</span>
            </div>
            {voiceClone ? (
              <div className="surface-list">
                <article className="surface-list__item">
                  <p className="surface-list__title">样本文本</p>
                  <p className="surface-list__body">{voiceClone.sampleTranscript}</p>
                </article>
                <article className="surface-list__item">
                  <p className="surface-list__title">模型</p>
                  <p className="surface-list__body">{voiceClone.model}</p>
                </article>
              </div>
            ) : (
              <p className="surface-muted">还没有可用的声音样本。录一段新的样本来初始化这条配置。</p>
            )}
          </section>

          <section className="surface-panel">
            <div className="surface-panel__header">
              <h2 className="surface-panel__title">录制或替换声音样本</h2>
            </div>
            <div className="twin-chat-recorder">
              <VoiceRecorder
                compact
                persistRecording={false}
                buttonIdleText={voiceClone ? '按住重录声音样本' : '按住录一段声音样本'}
                buttonRecordingText="松开发送样本"
                onRecordingReady={handleVoiceCloneSample}
                onRecorderError={(message) => setError(message)}
                onUploadError={(message) => setError(message)}
              />
            </div>
            {busy && <p className="surface-muted">正在处理样本...</p>}
          </section>

          {draft && (
            <section className="surface-panel">
              <div className="surface-panel__header">
                <h2 className="surface-panel__title">确认样本转写</h2>
              </div>
              <textarea
                value={draft.transcript}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          transcript: event.target.value,
                        }
                      : current,
                  )
                }
                className="twin-chat-input"
                rows={4}
                placeholder="如果转写有误，先改成正确文本。"
              />
              <div className="surface-panel__header">
                <button
                  type="button"
                  className="surface-button"
                  disabled={busy || !draft.transcript.trim()}
                  onClick={handleCreateVoiceClone}
                >
                  {busy ? '正在生成音色...' : '生成分身专属音色'}
                </button>
                <button
                  type="button"
                  className="surface-button surface-button-secondary"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null)
                    setNotice('')
                    setError('')
                  }}
                >
                  取消这段样本
                </button>
              </div>
            </section>
          )}

          {(previewAudioUrl || notice || error) && (
            <section className="surface-panel surface-panel-soft">
              <div className="surface-panel__header">
                <h2 className="surface-panel__title">结果</h2>
              </div>
              {previewAudioUrl && (
                <button type="button" className="surface-button" onClick={handleReplayPreview}>
                  重播试播音频
                </button>
              )}
              {notice && <p className="surface-muted">{notice}</p>}
              {error && <p className="surface-error">{error}</p>}
            </section>
          )}
        </>
      )}
    </main>
  )
}
