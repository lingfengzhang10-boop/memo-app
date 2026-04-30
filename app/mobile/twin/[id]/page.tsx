'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { MobileCharacterAvatar } from '@/components/mobile/MobileCharacterAvatar'
import { countOutgoingTwinDialogueGrants, getTwinProfile } from '@/lib/twinProfiles'
import { TwinProfile } from '@/types/twin'

export default function MobileTwinDetailPage() {
  const params = useParams<{ id: string }>()
  const twinId = params?.id

  const [twin, setTwin] = useState<TwinProfile | null>(null)
  const [grantCount, setGrantCount] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false

    if (!twinId) {
      setError('未找到分身。')
      return
    }

    void (async () => {
      try {
        const nextTwin = await getTwinProfile(twinId)
        const nextGrantCount = await countOutgoingTwinDialogueGrants(twinId).catch(() => 0)

        if (!cancelled) {
          setTwin(nextTwin)
          setGrantCount(nextGrantCount)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '分身详情加载失败。')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [twinId])

  return (
    <main className="mobile-panel-page">
      <div className="mobile-panel-shell mobile-twin-detail-shell">
        <header className="mobile-panel-header mobile-panel-header-back">
          <Link href="/mobile/more" className="mobile-panel-back" aria-label="返回">
            ‹
          </Link>
        </header>

        {error ? (
          <p className="mobile-panel-error">{error}</p>
        ) : twin ? (
          <>
            <div className="mobile-twin-hero">
              <MobileCharacterAvatar src={twin.portraitUrl} alt={twin.name} size="xl" />
            </div>

            <section className="mobile-twin-summary">
              <h1 className="mobile-twin-summary__title">{twin.name}</h1>
              <p className="mobile-twin-summary__subtitle">已授权给 {grantCount} 人对话</p>
            </section>

            <section className="mobile-more-section">
              <Link href={`/mobile?character=${encodeURIComponent(`twin:${twin.id}`)}&mode=text`} className="mobile-more-link">
                <span>与我的分身对话</span>
                <span>›</span>
              </Link>
              <button type="button" className="mobile-more-link" onClick={() => setNotice('授权分身入口已预留，后续接入管理能力。')}>
                <span>授权分身</span>
                <span>›</span>
              </button>
            </section>

            <button type="button" className="mobile-twin-delete" onClick={() => setNotice('删除分身能力已预留，当前版本暂不开放。')}>
              删除分身
            </button>
          </>
        ) : null}
      </div>

      {notice ? (
        <div className="mobile-dialogue-toast">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>
            知道了
          </button>
        </div>
      ) : null}
    </main>
  )
}
