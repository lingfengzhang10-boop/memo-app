'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { resolveSurfaceHref } from '@/lib/clientSurfaceRouting'
import { listTwinProfiles } from '@/lib/twinProfiles'
import { TwinProfile } from '@/types/twin'

export default function TwinIndexPage() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [twins, setTwins] = useState<TwinProfile[]>([])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const next = await listTwinProfiles()
        if (!cancelled) {
          setTwins(next)
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
  }, [])

  return (
    <main className="twin-page">
      <section className="twin-shell">
        <div className="twin-header">
          <div>
            <p className="twin-eyebrow">分身</p>
            <h1 className="twin-title">进入你的分身</h1>
            <p className="twin-subtitle">每个用户只有一个分身。它会继续继承你后续确认过的记忆，也会在以后支持授权给亲友和同事对话。</p>
          </div>
          <Link href={resolveSurfaceHref(pathname, '/twin/bootstrap')} className="twin-primary-link">
            继续丰富我的分身
          </Link>
        </div>

        {loading ? (
          <div className="twin-panel">
            <p className="twin-muted">正在整理你的分身列表...</p>
          </div>
        ) : error ? (
          <div className="twin-panel">
            <p className="twin-error">{error}</p>
          </div>
        ) : twins.length === 0 ? (
          <div className="twin-panel">
            <p className="twin-muted">你还没有可用的分身，先去完成一轮快速生成。</p>
          </div>
        ) : (
          <div className="twin-grid">
            {twins.map((twin) => (
              <article key={twin.id} className="twin-card">
                <div className="twin-card__top">
                  <div>
                    <p className="twin-card__name">{twin.name}</p>
                    <p className="twin-card__meta">
                      状态：{twin.status} · 记忆准备度 {twin.memoryReadinessScore} · 风格准备度 {twin.styleReadinessScore}
                    </p>
                  </div>
                  <span className="twin-card__badge">{twin.status}</span>
                </div>
                <p className="twin-card__summary">{twin.personaSummary || '这是一张刚开始生长的分身草稿。'}</p>
                <div className="twin-card__actions">
                  <Link href={resolveSurfaceHref(pathname, `/twin/${twin.id}`)} className="twin-card__action">
                    和我的分身说话
                  </Link>
                  <Link
                    href={resolveSurfaceHref(pathname, '/twin/bootstrap')}
                    className="twin-card__action twin-card__action-secondary"
                  >
                    继续丰富我的分身
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
