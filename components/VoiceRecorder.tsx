'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRecorder } from '@/hooks/useRecorder'
import { getSessionUser, insertPendingMemory, uploadRecordingAsset } from '@/lib/recordingPersistence'

interface VoiceRecorderProps {
  buttonIdleText?: string
  buttonRecordingText?: string
  compact?: boolean
  persistRecording?: boolean
  onUploadSuccess?: () => void
  onUploadError?: (error: string) => void
  onRecorderError?: (error: string) => void
  onPhaseChange?: (phase: 'idle' | 'recording' | 'uploading' | 'success' | 'error') => void
  onRecordingReady?: (blob: Blob, mimeType: string) => void | Promise<void>
  onMemoryPersisted?: (memory: { id: string | null; audioUrl: string | null; isAnonymous: boolean }) => void
}

type SupabaseLikeError = {
  message?: string
  error_description?: string
  details?: string
  hint?: string
}

function getReadableErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const maybeError = error as SupabaseLikeError
    const parts = [
      maybeError.message,
      maybeError.error_description,
      maybeError.details,
      maybeError.hint,
    ].filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  return '上传失败，请重试'
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function VoiceRecorder({
  buttonIdleText = '按住录音',
  buttonRecordingText = '松开保存',
  compact = false,
  persistRecording = true,
  onUploadSuccess,
  onUploadError,
  onRecorderError,
  onPhaseChange,
  onRecordingReady,
  onMemoryPersisted,
}: VoiceRecorderProps) {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPressed, setIsPressed] = useState(false)

  const isProcessingRef = useRef(false)
  const lastHandledBlobRef = useRef<Blob | null>(null)

  const {
    isRecording,
    audioBlob,
    mimeType,
    startRecording,
    stopRecording,
    error: recorderError,
    duration,
  } = useRecorder()

  const uploadRecording = useCallback(
    async (blob: Blob, audioMimeType: string) => {
      if (isProcessingRef.current) return
      isProcessingRef.current = true

      setUploadStatus('uploading')
      setErrorMessage(null)
      onPhaseChange?.('uploading')

      try {
        const user = await getSessionUser()

        if (!user) {
          const anonId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
          await uploadRecordingAsset({
            ownerId: anonId,
            blob,
            mimeType: audioMimeType,
            filePrefix: 'memory',
          })

          onMemoryPersisted?.({ id: null, audioUrl: null, isAnonymous: true })
          setUploadStatus('success')
          onPhaseChange?.('success')
          onUploadSuccess?.()

          window.setTimeout(() => {
            setUploadStatus('idle')
            onPhaseChange?.('idle')
            isProcessingRef.current = false
          }, 2000)

          return
        }

        const uploaded = await uploadRecordingAsset({
          ownerId: user.id,
          blob,
          mimeType: audioMimeType,
          filePrefix: 'memory',
        })

        const insertedMemory = await insertPendingMemory({
          userId: user.id,
          audioUrl: uploaded.publicUrl,
          audioPath: uploaded.filePath,
          audioMimeType,
          audioSizeBytes: blob.size,
        })

        onMemoryPersisted?.({ id: insertedMemory.id, audioUrl: uploaded.publicUrl, isAnonymous: false })
        setUploadStatus('success')
        onPhaseChange?.('success')
        onUploadSuccess?.()

        window.setTimeout(() => {
          setUploadStatus('idle')
          onPhaseChange?.('idle')
          isProcessingRef.current = false
        }, 2000)
      } catch (error) {
        console.error('上传失败:', error)
        const message = getReadableErrorMessage(error)
        setErrorMessage(message)
        setUploadStatus('error')
        onPhaseChange?.('error')
        onUploadError?.(message)
        isProcessingRef.current = false
      }
    },
    [onMemoryPersisted, onPhaseChange, onUploadError, onUploadSuccess],
  )

  useEffect(() => {
    if (!audioBlob || !mimeType || isRecording) {
      return
    }

    if (lastHandledBlobRef.current === audioBlob) {
      return
    }

    lastHandledBlobRef.current = audioBlob

    if (persistRecording) {
      void onRecordingReady?.(audioBlob, mimeType)
      void uploadRecording(audioBlob, mimeType)
      return
    }

    isProcessingRef.current = true
    onPhaseChange?.('uploading')

    void Promise.resolve(onRecordingReady?.(audioBlob, mimeType))
      .catch((error) => {
        console.error('纠正录音处理失败:', error)
        onUploadError?.(getReadableErrorMessage(error))
      })
      .finally(() => {
        isProcessingRef.current = false
        onPhaseChange?.('idle')
      })
  }, [audioBlob, isRecording, mimeType, onPhaseChange, onRecordingReady, onUploadError, persistRecording, uploadRecording])

  useEffect(() => {
    if (recorderError) {
      onRecorderError?.(recorderError)
    }
  }, [onRecorderError, recorderError])

  const handlePointerDown = useCallback(
    async (event: React.PointerEvent) => {
      event.preventDefault()

      if (isRecording || uploadStatus === 'uploading' || isProcessingRef.current) {
        return
      }

      setIsPressed(true)
      lastHandledBlobRef.current = null

      const started = await startRecording()
      if (started) {
        onPhaseChange?.('recording')
      }
    },
    [isRecording, onPhaseChange, startRecording, uploadStatus],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      setIsPressed(false)

      if (isRecording) {
        stopRecording()
      }
    },
    [isRecording, stopRecording],
  )

  const handlePointerLeave = useCallback(() => {
    if (isPressed && isRecording) {
      setIsPressed(false)
      stopRecording()
    }
  }, [isPressed, isRecording, stopRecording])

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
  }, [])

  const statusTone =
    uploadStatus === 'error'
      ? 'error'
      : uploadStatus === 'success'
        ? 'success'
        : isRecording
          ? 'recording'
          : 'idle'

  const getButtonText = () => {
    if (uploadStatus === 'uploading') return persistRecording ? '正在保存' : '正在整理'
    if (isRecording) return buttonRecordingText
    return buttonIdleText
  }

  const getStatusTitle = () => {
    if (uploadStatus === 'uploading') return persistRecording ? '正在上传这段声音' : '正在整理这条纠正'
    if (uploadStatus === 'success') return '录音已保存'
    if (uploadStatus === 'error') return '这次保存没有完成'
    if (isRecording) return '录音中'
    return '准备开始'
  }

  const getStatusDescription = () => {
    if (uploadStatus === 'uploading') return persistRecording ? '请稍等几秒，不要重复点击。' : '我会先把这条纠正转成文字，再回到待确认队列。'
    if (uploadStatus === 'success') return '你刚刚说下的内容已经进入记忆库。'
    if (uploadStatus === 'error') return errorMessage || '请检查网络、权限或存储配置后重试。'
    if (isRecording) return '继续按住按钮，说完再松手。'
    return '找一个安静角落，把一个片段轻轻说出来。'
  }

  const getButtonClass = () => {
    let className = 'recording-button select-none touch-none'

    if (isRecording) {
      className += ' recording'
    }

    if (isPressed && isRecording) {
      className += ' recording-pulse'
    } else if (!isRecording && uploadStatus !== 'uploading') {
      className += ' breathing-animation'
    }

    if (uploadStatus === 'uploading') {
      className += ' opacity-70 cursor-wait'
    }

    return className
  }

  return (
    <div className={`voice-recorder ${compact ? 'voice-recorder-compact' : ''}`}>
      {!compact && (
        <div className={`voice-status-card voice-status-${statusTone}`}>
          <p className="voice-status-eyebrow">{getStatusTitle()}</p>
          <p className="voice-status-description">{getStatusDescription()}</p>
        </div>
      )}

      <div className="voice-button-wrap">
        <button
          className={getButtonClass()}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerUp}
          onContextMenu={handleContextMenu}
          disabled={uploadStatus === 'uploading'}
          aria-label={isRecording ? '松开保存录音' : '按住开始录音'}
          style={{ touchAction: 'none' }}
        >
          <div className="voice-button-core pointer-events-none">
            <div className="voice-button-text">{getButtonText()}</div>
            {isRecording && <div className="voice-button-timer">{formatDuration(duration)}</div>}
          </div>
        </button>

        {isRecording && <div className="voice-recording-ring" />}
      </div>

      {!compact && (
        <div className="voice-hints">
          <div className="voice-hint-item">
            <span className="voice-hint-label">手势</span>
            <span className="voice-hint-text">长按开始，松开自动结束</span>
          </div>
          <div className="voice-hint-item">
            <span className="voice-hint-label">建议</span>
            <span className="voice-hint-text">从一个具体场景讲起，效果会更好</span>
          </div>
        </div>
      )}

      {!compact && recorderError && <div className="voice-feedback voice-feedback-error">{recorderError}</div>}

      {!compact && uploadStatus === 'success' && (
        <div className="voice-feedback voice-feedback-success">录音已保存。</div>
      )}

      {!compact && uploadStatus === 'error' && (
        <div className="voice-feedback voice-feedback-error">{errorMessage || '上传失败，请重试'}</div>
      )}
    </div>
  )
}
