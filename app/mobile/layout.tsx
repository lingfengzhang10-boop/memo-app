import { ReactNode } from 'react'

export default function MobileLayout({ children }: { children: ReactNode }) {
  return <div className="mobile-shell">{children}</div>
}
