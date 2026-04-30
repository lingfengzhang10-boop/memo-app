'use client'

import { useEffect } from 'react'

export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('mobile route error:', error)
  }, [error])

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#101115',
        color: '#fff',
        padding: '24px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20 }}>Mobile Route Error</h1>
      <p style={{ opacity: 0.8 }}>{error.message || 'Unknown error'}</p>
      {error.digest ? <p style={{ opacity: 0.7 }}>digest: {error.digest}</p> : null}
      {error.stack ? (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#181b22',
            padding: 16,
            borderRadius: 12,
            overflow: 'auto',
          }}
        >
          {error.stack}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        style={{
          marginTop: 16,
          border: 0,
          borderRadius: 999,
          background: '#2b6cf6',
          color: '#fff',
          padding: '10px 16px',
          font: 'inherit',
        }}
      >
        Retry
      </button>
    </main>
  )
}
