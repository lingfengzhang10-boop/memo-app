function createAudioElement(audioUrl: string) {
  if (typeof Audio === 'undefined') {
    return null
  }

  return new Audio(audioUrl)
}

export function stopManagedAudio(audioRef: { current: HTMLAudioElement | null }) {
  if (!audioRef.current) {
    return
  }

  audioRef.current.pause()
  audioRef.current.currentTime = 0
  audioRef.current = null
}

export async function playManagedAudio(audioRef: { current: HTMLAudioElement | null }, audioUrl: string) {
  stopManagedAudio(audioRef)

  const audio = createAudioElement(audioUrl)
  if (!audio) {
    return false
  }

  audioRef.current = audio

  try {
    await audio.play()
    return true
  } catch (error) {
    console.warn('Audio playback failed:', error)
    return false
  }
}

export async function ensureManagedVideoPlayback(video: HTMLVideoElement | null) {
  if (!video) {
    return false
  }

  try {
    video.muted = true
    video.defaultMuted = true
    await video.play()
    return true
  } catch (error) {
    console.warn('Video autoplay failed:', error)
    return false
  }
}

export async function getBlobAudioDurationMs(blob: Blob) {
  if (typeof window === 'undefined') {
    return 0
  }

  const objectUrl = URL.createObjectURL(blob)

  try {
    const durationSeconds = await new Promise<number>((resolve) => {
      const audio = document.createElement('audio')
      const timeoutId = window.setTimeout(() => {
        cleanup()
        resolve(0)
      }, 1500)

      const cleanup = () => {
        window.clearTimeout(timeoutId)
        audio.onloadedmetadata = null
        audio.onerror = null
        audio.removeAttribute('src')
        audio.load()
      }

      audio.preload = 'metadata'
      audio.onloadedmetadata = () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0
        cleanup()
        resolve(duration)
      }
      audio.onerror = () => {
        cleanup()
        resolve(0)
      }

      audio.src = objectUrl
    })

    return Math.max(0, Math.round(durationSeconds * 1000))
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
