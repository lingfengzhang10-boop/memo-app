import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '念及 - 把回忆留在声音里',
  description: '用一段段自然讲述的录音，保存家人和自己最真实的记忆。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  )
}
