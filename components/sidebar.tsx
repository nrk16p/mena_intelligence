"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import {
  ChevronRight,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Search,
  X,
} from "lucide-react"
import { ThemeToggle } from "./theme-toggle"
import { TypeTag } from "./type-tag"
import { openPalette, usePins, useStoredState } from "./nav-prefs"
import {
  ALL_PAGES,
  OPEN_TYPES,
  PAGE_TYPES,
  findActive,
  isActivePath,
  visibleSections,
  type NavPage,
  type PageType,
} from "@/lib/nav"

// ── Logo ────────────────────────────────────────────────────────
function MenaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="url(#mg)" />
      <path d="M7 22 C7 15 14 10 25 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" fill="none" />
      <circle cx="7"  cy="22" r="2.2" fill="white" opacity="0.85" />
      <circle cx="25" cy="10" r="2.2" fill="white" opacity="0.85" />
      <rect x="10" y="17.5" width="5" height="5" rx="1" fill="white" opacity="0.85" />
      <rect x="14" y="15.5" width="9" height="7" rx="1" fill="white" />
      <circle cx="12.5" cy="23.2" r="1.4" fill="url(#mg)" />
      <circle cx="20.5" cy="23.2" r="1.4" fill="url(#mg)" />
      <defs>
        <linearGradient id="mg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ── One page link ───────────────────────────────────────────────
function PageLink({
  page, active, pinned, onTogglePin, onNavigate, indent,
}: {
  page: NavPage
  active: boolean
  pinned: boolean
  onTogglePin: (href: string) => void
  onNavigate?: () => void
  indent: boolean
}) {
  return (
    <div className="group/item relative">
      <Link
        href={page.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[34px] items-center rounded-lg py-1.5 pr-8 text-[13px] leading-snug transition-colors
          ${indent ? "pl-8" : "pl-3"}
          ${active
            ? "bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"}`}
      >
        {page.label}
      </Link>
      <button
        type="button"
        onClick={() => onTogglePin(page.href)}
        aria-label={pinned ? `เลิกปักหมุด ${page.label}` : `ปักหมุด ${page.label}`}
        title={pinned ? "เลิกปักหมุด" : "ปักหมุด"}
        className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md
          text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700
          focus-visible:opacity-100 group-hover/item:opacity-100 dark:hover:bg-white/10 dark:hover:text-gray-200"
      >
        {pinned ? <PinOff size={13} /> : <Pin size={13} />}
      </button>
    </div>
  )
}

// ── Sidebar ─────────────────────────────────────────────────────
export function Sidebar({
  isMobile = false,
  mobileOpen = false,
  onMobileClose,
  allowedGroups = [],
}: {
  isMobile?: boolean
  mobileOpen?: boolean
  onMobileClose?: () => void
  allowedGroups?: string[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { data: session } = useSession()
  const { pins, toggle: togglePin, isPinned } = usePins()

  const sections = useMemo(() => visibleSections(allowedGroups), [allowedGroups])
  const allowedHrefs = useMemo(() => new Set(sections.flatMap((s) => s.pages.map((p) => p.href))), [sections])
  const pinnedPages = pins.map((h) => ALL_PAGES.find((p) => p.href === h)).filter((p): p is NavPage => !!p && allowedHrefs.has(p.href))
  const active = findActive(pathname)

  // One department open at a time: the one holding the current page, else the last one opened.
  const [lastOpen, setLastOpen] = useStoredState<string>("intel.nav.section", "")
  const [openSection, setOpenSection] = useState<string>("")
  useEffect(() => {
    if (active) setOpenSection(active.section.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  useEffect(() => {
    if (!active && lastOpen) setOpenSection((cur) => cur || lastOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastOpen])
  function toggleSection(key: string) {
    const next = openSection === key ? "" : key
    setOpenSection(next)
    setLastOpen(next)
  }

  // Analysis-type groups: ติดตาม and KPI open, the rest folded; the user's choice is remembered.
  const [closedTypes, setClosedTypes] = useStoredState<PageType[]>(
    "intel.nav.closedTypes",
    PAGE_TYPES.filter((t) => !OPEN_TYPES.includes(t)),
  )
  function typeOpen(t: PageType) {
    return !closedTypes.includes(t) || active?.page.type === t
  }
  function toggleType(t: PageType) {
    setClosedTypes(closedTypes.includes(t) ? closedTypes.filter((x) => x !== t) : [...closedTypes, t])
  }

  const isCollapsed = !isMobile && collapsed
  const navigate = isMobile ? onMobileClose : undefined

  return (
    <aside className={`
      flex h-screen flex-col shrink-0
      border-r border-gray-200 dark:border-white/8
      bg-white dark:bg-[#0f1117]
      transition-all duration-200 ease-in-out motion-reduce:transition-none
      ${isMobile
        ? `fixed inset-y-0 left-0 z-50 w-[280px] shadow-2xl ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`
        : collapsed ? "w-[62px]" : "w-[264px]"
      }
    `}>

      {/* ── Brand ─────────────────────────────────────────────── */}
      <div className={`flex h-[56px] shrink-0 items-center border-b border-gray-100 dark:border-white/6
        ${isCollapsed ? "justify-center" : "gap-3 px-4"}`}>
        <Link href="/" className="shrink-0" title="Mena Intel" aria-label="หน้าแรก Mena Intel">
          <MenaLogo size={30} />
        </Link>
        {!isCollapsed && (
          <p className="flex-1 min-w-0 text-[14px] font-bold text-gray-900 dark:text-white tracking-tight">Mena Intel</p>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="ปิดเมนู"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-gray-400
              hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ── Nav ───────────────────────────────────────────────── */}
      <nav aria-label="เมนูหลัก" className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-1">
            <Link href="/" title="หน้าแรก" aria-label="หน้าแรก"
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${pathname === "/" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"}`}>
              <Home size={17} />
            </Link>
            <button type="button" onClick={openPalette} title="ค้นหา (⌘K)" aria-label="ค้นหาหน้า"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5">
              <Search size={17} />
            </button>
            <div className="my-1 h-px w-8 bg-gray-100 dark:bg-white/8" />
            {sections.map((s) => {
              const Icon = s.icon
              const here = active?.section.key === s.key
              return (
                <button key={s.key} type="button" title={s.label} aria-label={s.label}
                  onClick={() => { setCollapsed(false); setOpenSection(s.key); setLastOpen(s.key) }}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${here ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"}`}>
                  <Icon size={17} />
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Link href="/" onClick={navigate} aria-current={pathname === "/" ? "page" : undefined}
                className={`flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 text-[13px] font-semibold transition-colors
                  ${pathname === "/" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}>
                <Home size={16} className="shrink-0" />
                หน้าแรก
              </Link>
              <button type="button" onClick={openPalette}
                className="flex min-h-[40px] items-center gap-2.5 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-500
                  hover:bg-gray-50 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5">
                <Search size={15} className="shrink-0" />
                <span className="flex-1 text-left">ค้นหาหน้า</span>
                <kbd className="rounded border border-gray-200 px-1.5 text-[11px] font-sans text-gray-500 dark:border-white/10">⌘K</kbd>
              </button>
            </div>

            {pinnedPages.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <p className="px-3 text-[12px] font-semibold text-gray-500 dark:text-gray-400">ปักหมุด</p>
                {pinnedPages.map((p) => (
                  <PageLink key={p.href} page={p} active={isActivePath(pathname, p.href)} pinned
                    onTogglePin={togglePin} onNavigate={navigate} indent={false} />
                ))}
              </div>
            )}

            {sections.length > 0 && <div className="flex flex-col gap-1">
              <p className="px-3 text-[12px] font-semibold text-gray-500 dark:text-gray-400">แผนก</p>
              {sections.map((s) => {
                const open = openSection === s.key
                const Icon = s.icon
                const here = active?.section.key === s.key
                return (
                  <div key={s.key}
                    className={`rounded-xl border ${open ? "border-gray-200 bg-gray-50/70 dark:border-white/8 dark:bg-white/3" : "border-transparent"}`}>
                    <button type="button" onClick={() => toggleSection(s.key)} aria-expanded={open}
                      className="flex min-h-[42px] w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-semibold
                        text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5">
                      <Icon size={16} className={`shrink-0 ${here ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`} />
                      <span className="flex-1">{s.label}</span>
                      <span className="text-[12px] font-medium text-gray-400 dark:text-gray-500">{s.pages.length}</span>
                      <ChevronRight size={14} aria-hidden="true"
                        className={`shrink-0 text-gray-400 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
                    </button>
                    {open && (
                      <div className="flex flex-col gap-0.5 px-1 pb-2">
                        {PAGE_TYPES.map((t) => {
                          const pages = s.pages.filter((p) => p.type === t)
                          if (!pages.length) return null
                          const tOpen = typeOpen(t)
                          return (
                            <div key={t}>
                              <button type="button" onClick={() => toggleType(t)} aria-expanded={tOpen}
                                className="flex min-h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-gray-500 hover:bg-gray-100/70 dark:hover:bg-white/5">
                                <ChevronRight size={12} aria-hidden="true"
                                  className={`shrink-0 transition-transform duration-150 motion-reduce:transition-none ${tOpen ? "rotate-90" : ""}`} />
                                <TypeTag type={t} />
                                <span>{pages.length}</span>
                              </button>
                              {tOpen && pages.map((p) => (
                                <PageLink key={p.href} page={p} active={isActivePath(pathname, p.href)} pinned={isPinned(p.href)}
                                  onTogglePin={togglePin} onNavigate={navigate} indent />
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>}
          </div>
        )}
      </nav>

      {/* ── Collapse toggle ────────────────────────────────────── */}
      {!isMobile && (
        <div className="px-2 pb-1 pt-1 border-t border-gray-100 dark:border-white/6">
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? "ขยายเมนู" : "หุบเมนู"}
            className={`flex w-full items-center rounded-lg py-2 text-[12px] font-medium
              text-gray-500 dark:text-gray-400
              hover:bg-gray-50 dark:hover:bg-white/6
              hover:text-gray-700 dark:hover:text-gray-300
              transition-colors
              ${isCollapsed ? "justify-center" : "gap-2.5 px-2.5"}`}
          >
            {collapsed
              ? <PanelLeftOpen size={15} className="shrink-0" />
              : <>
                  <PanelLeftClose size={15} className="shrink-0" />
                  <span>หุบเมนู</span>
                </>
            }
          </button>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 dark:border-white/6 px-2 py-2 space-y-1">
        <ThemeToggle collapsed={isCollapsed} />

        {session?.user && (
          isCollapsed ? (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="ออกจากระบบ"
              aria-label="ออกจากระบบ"
              className="flex w-full items-center justify-center rounded-lg py-2
                text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 transition-colors"
            >
              <LogOut size={15} />
            </button>
          ) : (
            <div className="rounded-xl border border-gray-100 dark:border-white/6 bg-gray-50 dark:bg-white/3 px-3 py-2.5">
              <div className="flex items-center gap-2.5 mb-2.5">
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt=""
                    className="h-7 w-7 rounded-full ring-1 ring-gray-200 dark:ring-white/10 shrink-0" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold shrink-0">
                    {session.user.name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-white truncate leading-tight">
                    {session.user.name?.split(" ")[0]}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-tight">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg
                  border border-gray-200 dark:border-white/8 py-1.5
                  text-[12px] font-medium text-gray-500 dark:text-gray-400
                  hover:bg-red-50 dark:hover:bg-red-950/20
                  hover:text-red-500 hover:border-red-200 dark:hover:border-red-800/40 transition-colors"
              >
                <LogOut size={12} />
                ออกจากระบบ
              </button>
            </div>
          )
        )}
      </div>
    </aside>
  )
}
