'use client'

type MobileCharacterAvatarProps = {
  src?: string
  alt: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  glowing?: boolean
  system?: boolean
}

export function MobileCharacterAvatar({
  src,
  alt,
  size = 'md',
  glowing = false,
  system = false,
}: MobileCharacterAvatarProps) {
  const className = [
    'mobile-character-avatar',
    `mobile-character-avatar-${size}`,
    glowing ? 'mobile-character-avatar-glowing' : '',
    system ? 'mobile-character-avatar-system' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (src) {
    return (
      <div className={className}>
        <img src={src} alt={alt} className="mobile-character-avatar__image" />
      </div>
    )
  }

  return (
    <div className={className} aria-label={alt}>
      <span className="mobile-character-avatar__fallback">{system ? 'L' : alt.slice(0, 1)}</span>
    </div>
  )
}
