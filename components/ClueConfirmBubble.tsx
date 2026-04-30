'use client'

import { PendingClue } from '@/types/companion'

interface ClueConfirmBubbleProps {
  clue: PendingClue | null
  total: number
  correcting: boolean
  onConfirm: () => void
  onDismiss: () => void
  onStartCorrection: () => void
  onCancelCorrection: () => void
}

function getClueKindLabel(clue: PendingClue) {
  return clue.kind === 'event' ? '经历线索' : '事实线索'
}

export function ClueConfirmBubble({
  clue,
  total,
  correcting,
  onConfirm,
  onDismiss,
  onStartCorrection,
  onCancelCorrection,
}: ClueConfirmBubbleProps) {
  if (!clue) {
    return null
  }

  return (
    <section className="clue-bubble" aria-live="polite">
      <div className="clue-bubble__meta">
        <span className="clue-bubble__badge">{getClueKindLabel(clue)}</span>
        <span className="clue-bubble__count">待确认 {total} 条</span>
      </div>

      <p className="clue-bubble__sentence">{clue.sentence}</p>

      {!correcting ? (
        <div className="clue-bubble__actions">
          <button type="button" className="clue-bubble__button clue-bubble__button-primary" onClick={onConfirm}>
            确认
          </button>
          <button type="button" className="clue-bubble__button" onClick={onStartCorrection}>
            纠正
          </button>
          <button type="button" className="clue-bubble__button clue-bubble__button-ghost" onClick={onDismiss}>
            关闭
          </button>
        </div>
      ) : (
        <div className="clue-bubble__correction">
          <p className="clue-bubble__hint">按住下方录音按钮，说出正确版本。这次只会修正这条线索，不会新增一段记忆。</p>
          <button type="button" className="clue-bubble__button clue-bubble__button-ghost" onClick={onCancelCorrection}>
            取消纠正
          </button>
        </div>
      )}
    </section>
  )
}
