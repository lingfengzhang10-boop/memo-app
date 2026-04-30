'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_SURFACE_NAV } from '@/lib/clientSurfaces'

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="mobile-bottom-nav" aria-label="App 主导航">
      {APP_SURFACE_NAV.map((item) => {
        const active = pathname === item.href || (item.href !== '/mobile' && pathname?.startsWith(`${item.href}/`))

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-bottom-nav__item ${active ? 'mobile-bottom-nav__item-active' : ''}`}
          >
            <span className="mobile-bottom-nav__label">{item.label}</span>
            <span className="mobile-bottom-nav__description">{item.description}</span>
          </Link>
        )
      })}
    </nav>
  )
}
