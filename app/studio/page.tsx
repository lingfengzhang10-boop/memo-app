'use client'

import Link from 'next/link'
import { useState } from 'react'
import { MemoirPanel } from '@/components/MemoirPanel'
import { WEB_WORKBENCH_MODULES } from '@/lib/clientSurfaces'

export default function StudioPage() {
  const [memoirOpen, setMemoirOpen] = useState(false)

  return (
    <main className="surface-page surface-page-studio">
      <section className="surface-panel">
        <p className="surface-eyebrow">Web 工作台</p>
        <h1 className="surface-title">整理、核对和查看完整资产</h1>
        <p className="surface-subtitle">这里保留深度编辑和高信息密度界面，首版 App 不重复承载这些重工作台能力。</p>
      </section>

      <section className="surface-grid">
        {WEB_WORKBENCH_MODULES.map((item) => (
          <article key={item.href} className="surface-panel">
            <div className="surface-panel__header">
              <h2 className="surface-panel__title">{item.label}</h2>
            </div>
            <p className="surface-list__body">{item.description}</p>
            <Link href={item.href} className="surface-link">
              进入
            </Link>
          </article>
        ))}

        <article className="surface-panel">
          <div className="surface-panel__header">
            <h2 className="surface-panel__title">回忆录</h2>
          </div>
          <p className="surface-list__body">继续在 Web 中查看、编辑和核对回忆录，保持来源可追溯。</p>
          <button type="button" className="surface-button" onClick={() => setMemoirOpen(true)}>
            打开回忆录
          </button>
        </article>
      </section>

      <MemoirPanel open={memoirOpen} onClose={() => setMemoirOpen(false)} canEdit />
    </main>
  )
}
