"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "./sidebar"
import { AiChatWidget } from "./ai-chat-widget"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === "/login") {
    return <div className="w-full h-full">{children}</div>
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-7">{children}</main>
      <AiChatWidget />
    </>
  )
}
