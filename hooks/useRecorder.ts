import { useState, useRef, useCallback, useEffect } from 'react'
import { getFileExtension } from '@/lib/audioMime'
import { getRecorderSupportError } from '@/lib/platform/recorderSupport'

interface UseRecorderReturn {
  isRecording: boolean
  audioBlob: Blob | null
  mimeType: string | null
  startRecording: () => Promise<boolean>
  stopRecording: () => void
  error: string | null
  duration: number
}

const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
]

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }

  for (const mimeType of SUPPORTED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }

  return ''
}

export { getFileExtension }

export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [mimeType, setMimeType] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentMimeTypeRef = useRef<string>('')
  const isStartingRef = useRef(false)

  const clearDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
  }, [])

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    clearDurationTimer()
    audioChunksRef.current = []
    mediaRecorderRef.current = null
    isStartingRef.current = false
  }, [clearDurationTimer])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (isRecording || isStartingRef.current) {
      return false
    }

    isStartingRef.current = true

    try {
      setError(null)
      setAudioBlob(null)
      setMimeType(null)
      setDuration(0)

      const supportError = getRecorderSupportError()
      if (supportError) {
        setError(supportError)
        isStartingRef.current = false
        return false
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      })

      streamRef.current = stream

      const supportedMimeType = getSupportedMimeType()
      currentMimeTypeRef.current = supportedMimeType

      let mediaRecorder: MediaRecorder

      if (supportedMimeType) {
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: supportedMimeType,
          audioBitsPerSecond: 128000,
        })
      } else {
        mediaRecorder = new MediaRecorder(stream, {
          audioBitsPerSecond: 128000,
        })
        currentMimeTypeRef.current = mediaRecorder.mimeType || 'audio/webm'
      }

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const finalMimeType = currentMimeTypeRef.current || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: finalMimeType })
        setAudioBlob(blob)
        setMimeType(finalMimeType)
        cleanup()
      }

      mediaRecorder.onerror = () => {
        setError('录音过程中发生错误。')
        cleanup()
        setIsRecording(false)
      }

      mediaRecorder.start(100)
      setIsRecording(true)
      isStartingRef.current = false

      clearDurationTimer()
      durationIntervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1)
      }, 1000)

      return true
    } catch (err) {
      let errorMessage = '无法访问麦克风。'

      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = '请先允许浏览器访问麦克风。'
        } else if (err.name === 'NotFoundError') {
          errorMessage = '没有检测到可用的麦克风设备。'
        } else {
          errorMessage = err.message
        }
      }

      setError(errorMessage)
      console.error('录音启动失败:', err)
      cleanup()
      return false
    }
  }, [isRecording, cleanup, clearDurationTimer])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      clearDurationTimer()

      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }

      setIsRecording(false)
    }
  }, [isRecording, clearDurationTimer])

  return {
    isRecording,
    audioBlob,
    mimeType,
    startRecording,
    stopRecording,
    error,
    duration,
  }
}
