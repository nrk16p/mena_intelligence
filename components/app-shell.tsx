"use client"

import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { Menu, Search } from "lucide-react"
import { Sidebar } from "./sidebar"
import { AiChatWidget } from "./ai-chat-widget"
import { CommandPalette } from "./command-palette"
import { openPalette } from "./nav-prefs"

export function AppShell({
  children,
  allowedGroups,
}: {
  children: React.ReactNode
  allowedGroups: string[]
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [pathname, isMobile])

  if (pathname === "/login") {
    return <div className="w-full h-full">{children}</div>
  }

  return (
    <>
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        isMobile={isMobile}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        allowedGroups={allowedGroups}
      />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 sm:py-7 min-w-0">
        {isMobile && (
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="เปิดเมนู"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors"
            >
              <Menu size={16} />
            </button>
            <span className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Mena Intel</span>
            <button
              type="button"
              onClick={openPalette}
              aria-label="ค้นหาหน้า"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors"
            >
              <Search size={16} />
            </button>
          </div>
        )}
        {children}
      </main>
      <CommandPalette allowedGroups={allowedGroups} />
      <AiChatWidget />
    </>
  )
}
