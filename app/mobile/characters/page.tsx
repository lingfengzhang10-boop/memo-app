'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MobileCharacterAvatar } from '@/components/mobile/MobileCharacterAvatar'
import { listSelectableDialogueCharacters } from '@/lib/dialogueCharacters'
import { DialogueCharacter } from '@/types/twin'

export default function MobileCharactersPage() {
  const searchParams = useSearchParams()
  const selected = searchParams.get('selected') || 'liva'

  const [characters, setCharacters] = useState<DialogueCharacter[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    void listSelectableDialogueCharacters()
      .then((nextCharacters) => {
        if (!cancelled) {
          setCharacters(nextCharacters)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '人物列表加载失败。')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mobile-panel-page">
      <div className="mobile-panel-shell">
        <header className="mobile-panel-header">
          <div>
            <h1 className="mobile-panel-title">选择对话人物</h1>
          </div>
          <Link href="/mobile" className="mobile-panel-close" aria-label="关闭">
            ×
          </Link>
        </header>

        {error ? <p className="mobile-panel-error">{error}</p> : null}

        <section className="mobile-character-list">
          {characters.map((character) => {
            const active = selected === character.selectionKey

            return (
              <Link
                key={character.selectionKey}
                href={`/mobile?character=${encodeURIComponent(character.selectionKey)}&mode=text`}
                className={`mobile-character-card ${active ? 'mobile-character-card-active' : ''}`}
              >
                <MobileCharacterAvatar
                  src={character.avatarUrl}
                  alt={character.title}
                  size="lg"
                  glowing={active}
                  system={character.kind === 'liva'}
                />
                <div className="mobile-character-card__copy">
                  <p className="mobile-character-card__title">{character.title}</p>
                  <p className="mobile-character-card__subtitle">{character.subtitle}</p>
                </div>
              </Link>
            )
          })}
        </section>
      </div>
    </main>
  )
}
