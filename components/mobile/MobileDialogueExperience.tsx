'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useMobileLivaDialogue } from '@/hooks/useMobileLivaDialogue'
import { useMobileTwinDialogue } from '@/hooks/useMobileTwinDialogue'
import {
  getDialogueCharacterFromSelection,
  LIVA_DIALOGUE_CHARACTER,
  LIVA_SELECTION_KEY,
  parseDialogueSelection,
} from '@/lib/dialogueCharacters'
import { DialogueCharacter } from '@/types/twin'
import styles from './MobileDialogueExperience.module.css'

const LIVA_MAIN_IMAGE = '/mobile/figma-main/liva-main.png'
const LIVA_AVATAR_IMAGE = '/mobile/figma-main/liva-avatar.png'
const LIVA_BOTTOM_GLOW = '/mobile/figma-main/bottom-glow.png'
const STATUS_TIME_ICON = '/mobile/figma-main/status-time.svg'
const STATUS_RIGHT_ICON = '/mobile/figma-main/status-right.svg'
const TOGGLE_ICON = '/mobile/figma-main/toggle.svg'
const SEND_ICON = '/mobile/figma-main/send.svg'
const PLUS_ICON = '/mobile/figma-main/plus.svg'
const DEFAULT_ECHO = '2017年我刚到杭州'
const NOTICE_TIMEOUT_MS = 3600

export function MobileDialogueExperience() {
  const searchParams = useSearchParams()
  const selectedKey = searchParams.get('character')?.trim() || LIVA_SELECTION_KEY
  const selectedCharacter = useMemo(() => parseDialogueSelection(selectedKey), [selectedKey])
  const selectedTwinId = selectedCharacter.kind === 'twin' ? selectedCharacter.twinId : undefined

  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [character, setCharacter] = useState<DialogueCharacter>(LIVA_DIALOGUE_CHARACTER)
  const livaDialogue = useMobileLivaDialogue()
  const twinDialogue = useMobileTwinDialogue(selectedTwinId)
  const isTwinDialogue = selectedCharacter.kind === 'twin'
  const characterTitle = isTwinDialogue ? twinDialogue.twin?.name || character.title : LIVA_DIALOGUE_CHARACTER.title
  const characterAvatar = isTwinDialogue ? twinDialogue.twin?.portraitUrl || character.avatarUrl : LIVA_AVATAR_IMAGE
  const replyText = isTwinDialogue
    ? twinDialogue.loading
      ? '正在加载分身...'
      : twinDialogue.replyText || character.shareSummary || `${characterTitle}在这里。`
    : livaDialogue.replyText
  const userEcho = isTwinDialogue ? twinDialogue.userEcho : livaDialogue.userEcho
  const input = isTwinDialogue ? twinDialogue.input : livaDialogue.input
  const setInput = isTwinDialogue ? twinDialogue.setInput : livaDialogue.setInput
  const busy = isTwinDialogue
    ? twinDialogue.loading || twinDialogue.sending || twinDialogue.transcribing
    : livaDialogue.busy
  const error = isTwinDialogue ? twinDialogue.error : livaDialogue.error
  const handleTextSubmit = isTwinDialogue ? twinDialogue.handleTextSubmit : livaDialogue.handleTextSubmit
  const replayReply = isTwinDialogue ? twinDialogue.replayReply : livaDialogue.replayReply

  useEffect(() => {
    let cancelled = false

    void getDialogueCharacterFromSelection(selectedKey)
      .then((nextCharacter) => {
        if (!cancelled) {
          setCharacter(nextCharacter)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setCharacter(LIVA_DIALOGUE_CHARACTER)
          setNotice(loadError instanceof Error ? loadError.message : '人物加载失败。')
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedKey])

  useEffect(() => {
    if (error) {
      setNotice(error)
    }
  }, [error])

  useEffect(() => {
    if (!notice) {
      return
    }

    const timer = window.setTimeout(() => {
      setNotice('')
    }, NOTICE_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [notice])

  const showReservedNotice = (label: string) => {
    setNotice(`${label}入口已预留，暂未接入上传。`)
    setAttachmentsOpen(false)
  }

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLParagraphElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    void replayReply()
  }

  return (
    <main className={styles.page}>
      <section className={styles.phone}>
        <header className={styles.statusBar} aria-hidden="true">
          <img src={STATUS_TIME_ICON} alt="" className={styles.statusTime} />
          <img src={STATUS_RIGHT_ICON} alt="" className={styles.statusRight} />
        </header>

        <Link href="/mobile/more" className={styles.menuButton} aria-label="更多">
          <span />
          <span />
          <span />
        </Link>

        <Link
          href={`/mobile/characters?selected=${encodeURIComponent(selectedKey)}`}
          className={styles.characterButton}
        >
          <div className={styles.characterAvatar} aria-hidden="true">
            {characterAvatar ? (
              <img
                src={characterAvatar}
                alt=""
                className={isTwinDialogue ? styles.characterAvatarImageFallback : styles.characterAvatarImage}
              />
            ) : (
              <span className={styles.characterAvatarFallback}>{characterTitle.slice(0, 1)}</span>
            )}
          </div>
          <span className={styles.characterName}>{characterTitle}</span>
        </Link>

        <p
          className={`${styles.replyText} ${styles.replyTextInteractive}`}
          onClick={() => void replayReply()}
          onKeyDown={handleReplyKeyDown}
          role="button"
          tabIndex={0}
          aria-label={`重播 ${characterTitle} 回复`}
        >
          {replyText}
        </p>

        <div className={styles.heroWrap} aria-hidden="true">
          {isTwinDialogue ? (
            characterAvatar ? (
              <img src={characterAvatar} alt="" className={styles.heroImageFallback} />
            ) : (
              <div className={`${styles.heroImageFallback} ${styles.heroFallbackCard}`}>
                {characterTitle.slice(0, 1)}
              </div>
            )
          ) : (
            <img src={LIVA_MAIN_IMAGE} alt="" className={styles.heroImage} />
          )}
        </div>

        <img src={LIVA_BOTTOM_GLOW} alt="" className={styles.bottomGlow} aria-hidden="true" />

        <p className={styles.userEcho}>{userEcho || DEFAULT_ECHO}</p>

        <div className={styles.inputBackdrop} aria-hidden="true" />

        <form className={styles.inputBar} onSubmit={handleTextSubmit}>
          <Link
            href={`/mobile?character=${encodeURIComponent(selectedKey)}&mode=voice`}
            className={styles.iconButton}
            aria-label="切换到语音输入"
          >
            <img src={TOGGLE_ICON} alt="" />
          </Link>
          <input
            className={styles.textInput}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入"
            disabled={busy}
            autoComplete="off"
          />
          <button
            type="submit"
            className={`${styles.sendButton} ${busy || !input.trim() ? styles.iconButtonDisabled : ''}`}
            aria-label={busy ? '发送中' : '发送'}
            disabled={busy || !input.trim()}
          >
            <img src={SEND_ICON} alt="" />
          </button>
          <button
            type="button"
            className={styles.plusButton}
            onClick={() => setAttachmentsOpen(true)}
            aria-label="附件入口"
          >
            <img src={PLUS_ICON} alt="" />
          </button>
        </form>

        {notice ? (
          <div className={styles.toast}>
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')}>
              知道了
            </button>
          </div>
        ) : null}

        {attachmentsOpen ? (
          <div className={styles.sheet}>
            <button type="button" className={styles.sheetBackdrop} onClick={() => setAttachmentsOpen(false)} />
            <div className={styles.sheetPanel}>
              <p className={styles.sheetTitle}>附件入口预留</p>
              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => showReservedNotice('本地图片')}
              >
                <span>本地图片</span>
                <span>预留中</span>
              </button>
              <button
                type="button"
                className={styles.sheetAction}
                onClick={() => showReservedNotice('本地视频')}
              >
                <span>本地视频</span>
                <span>预留中</span>
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}
