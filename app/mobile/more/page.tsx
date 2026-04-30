'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { MobileCharacterAvatar } from '@/components/mobile/MobileCharacterAvatar'
import { getSessionUser } from '@/lib/recordingPersistence'
import { supabase } from '@/lib/supabase'
import { countOutgoingTwinDialogueGrants, getMyTwinProfile } from '@/lib/twinProfiles'
import { TwinProfile } from '@/types/twin'

const LOGGED_OUT_LABEL = '未登录'

function getFriendlyAuthError(error: unknown) {
  if (error instanceof Error && error.message.includes('Failed to fetch')) {
    return '登录服务暂时连接不上。当前 Supabase 项目地址不可达，请稍后重试，或到 Supabase 控制台检查项目是否需要恢复/重启。'
  }

  if (error instanceof Error) {
    return error.message
  }

  return '发送登录链接失败。'
}

export default function MobileMorePage() {
  const [authEmail, setAuthEmail] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [email, setEmail] = useState(LOGGED_OUT_LABEL)
  const [twin, setTwin] = useState<TwinProfile | null>(null)
  const [grantCount, setGrantCount] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const user = await getSessionUser()
        const myTwin = await getMyTwinProfile().catch(() => null)
        const count = myTwin ? await countOutgoingTwinDialogueGrants(myTwin.id).catch(() => 0) : 0

        if (!cancelled) {
          setEmail(user?.email ?? LOGGED_OUT_LABEL)
          setTwin(myTwin)
          setGrantCount(count)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '更多页面加载失败。')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const handleEmailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedEmail = authEmail.trim()
    if (!normalizedEmail) {
      setNotice('请先输入邮箱。')
      return
    }

    try {
      setAuthLoading(true)

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })

      if (signInError) {
        throw signInError
      }

      setNotice('登录链接已经发送到你的邮箱。')
      setAuthEmail('')
    } catch (signInError) {
      setNotice(getFriendlyAuthError(signInError))
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setAuthLoading(true)

      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        throw signOutError
      }

      setEmail(LOGGED_OUT_LABEL)
      setNotice('你已经退出登录。')
    } catch (signOutError) {
      setNotice(signOutError instanceof Error ? signOutError.message : '退出登录失败。')
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <main className="mobile-panel-page">
      <div className="mobile-panel-shell mobile-more-shell">
        <header className="mobile-panel-header mobile-panel-header-back">
          <Link href="/mobile" className="mobile-panel-back" aria-label="返回">
            ←
          </Link>
          <div className="mobile-panel-header__main">
            <h1 className="mobile-panel-title">更多</h1>
            <p className="mobile-panel-subtitle">{email}</p>
          </div>
          <Link href="/mobile/profile" className="mobile-panel-gear" aria-label="用户信息">
            ⚙
          </Link>
        </header>

        {error ? <p className="mobile-panel-error">{error}</p> : null}

        <section className="mobile-more-section">
          <h2 className="mobile-more-section__title">登录</h2>
          {email === LOGGED_OUT_LABEL ? (
            <form onSubmit={handleEmailSignIn}>
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="输入邮箱登录"
                className="more-panel__input"
                autoComplete="email"
              />
              <button type="submit" className="more-panel__action" disabled={authLoading}>
                {authLoading ? '发送中...' : '发送登录链接'}
              </button>
            </form>
          ) : (
            <button type="button" className="more-panel__logout" onClick={handleSignOut} disabled={authLoading}>
              {authLoading ? '处理中...' : '退出登录'}
            </button>
          )}
        </section>

        <section className="mobile-more-section">
          <h2 className="mobile-more-section__title">我的分身</h2>
          {twin ? (
            <Link href={`/mobile/twin/${twin.id}`} className="mobile-character-card">
              <MobileCharacterAvatar src={twin.portraitUrl} alt={twin.name} size="lg" />
              <div className="mobile-character-card__copy">
                <p className="mobile-character-card__title">{twin.name}</p>
                <p className="mobile-character-card__subtitle">已授权给 {grantCount} 人对话</p>
              </div>
            </Link>
          ) : (
            <Link href="/mobile/twin/bootstrap" className="mobile-character-card">
              <MobileCharacterAvatar alt="创建分身" size="lg" />
              <div className="mobile-character-card__copy">
                <p className="mobile-character-card__title">创建</p>
                <p className="mobile-character-card__subtitle">完成问答并上传照片</p>
              </div>
            </Link>
          )}
        </section>

        <section className="mobile-more-section">
          <h2 className="mobile-more-section__title">扩展</h2>
          <button
            type="button"
            className="mobile-more-link"
            onClick={() => setNotice('回忆入口已预留，暂未迁移到这版移动端。')}
          >
            <span>回忆</span>
            <span>→</span>
          </button>
          <button
            type="button"
            className="mobile-more-link"
            onClick={() => setNotice('日程入口已预留，暂未接入。')}
          >
            <span>日程</span>
            <span>→</span>
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
