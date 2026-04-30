'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getSessionUser } from '@/lib/recordingPersistence'
import { supabase } from '@/lib/supabase'

export default function MobileProfilePage() {
  const [email, setEmail] = useState('未登录')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void getSessionUser().then((user) => {
      setEmail(user?.email ?? '未登录')
    })
  }, [])

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    setNotice(error ? error.message : '已退出登录。')
  }

  return (
    <main className="mobile-panel-page">
      <div className="mobile-panel-shell">
        <header className="mobile-panel-header mobile-panel-header-back">
          <Link href="/mobile/more" className="mobile-panel-back" aria-label="返回">
            ‹
          </Link>
          <div className="mobile-panel-header__main">
            <h1 className="mobile-panel-title">用户名</h1>
            <p className="mobile-panel-subtitle">{email}</p>
          </div>
        </header>

        <section className="mobile-more-section">
          <button type="button" className="mobile-more-link" onClick={() => setNotice('个人信息扩展位已预留，暂未接入编辑。')}>
            <span>个人信息</span>
            <span>›</span>
          </button>
          <button type="button" className="mobile-more-link mobile-more-link-danger" onClick={() => void handleSignOut()}>
            <span>退出登录</span>
          </button>
        </section>
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
