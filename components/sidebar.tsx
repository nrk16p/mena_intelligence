"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useSession, signOut } from "next-auth/react"
import {
  BarChart3,
  Calculator,
  ChevronDown,
  Fuel,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Truck,
  Trophy,
  PackageSearch,
  LayoutDashboard,
  Warehouse,
  TrendingUp,
  Users,
  FileText,
  LogOut,
  Search,
  Wrench,
  History,
  Settings2,
  Shield,
  ClipboardList,
  Gauge,
} from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

// ── Logo ────────────────────────────────────────────────────────
function MenaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
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

// ── Types ───────────────────────────────────────────────────────
type NavItem  = { href: string; label: string; icon: React.ElementType; exact?: boolean }
type NavGroup = {
  label:          string
  groupIcon:      React.ElementType
  permissionKey?: string
  dot:            string
  iconColor:      string   // group header icon color
  activeBg:       string
  activeText:     string
  activeBorder:   string
  items:          NavItem[]
}

// ── Nav config ──────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label:        "Overview",
    groupIcon:    LayoutDashboard,
    dot:          "bg-gray-400",
    iconColor:    "text-gray-500 dark:text-gray-400",
    activeBg:     "bg-gray-100 dark:bg-white/8",
    activeText:   "text-gray-900 dark:text-white",
    activeBorder: "border-gray-500",
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label:        "Vehicle",
    groupIcon:    Truck,
    permissionKey: "vehicle",
    dot:          "bg-blue-500",
    iconColor:    "text-blue-500 dark:text-blue-400",
    activeBg:     "bg-blue-50 dark:bg-blue-950/40",
    activeText:   "text-blue-700 dark:text-blue-300",
    activeBorder: "border-blue-500",
    items: [
      { href: "/truck-distance",        label: "Truck Distance",  icon: Truck },
      { href: "/truck-year-cost",        label: "Year Cost",       icon: BarChart3 },
      { href: "/truck_utilize_analysis", label: "Utilization",     icon: TrendingUp },
      { href: "/breakdown-rate",         label: "Breakdown Rate",  icon: Wrench },
      { href: "/fleet-report",           label: "Fleet Report",    icon: FileText },
    ],
  },
  {
    label:        "Fuel",
    groupIcon:    Fuel,
    permissionKey: "fuel",
    dot:          "bg-orange-500",
    iconColor:    "text-orange-500 dark:text-orange-400",
    activeBg:     "bg-orange-50 dark:bg-orange-950/40",
    activeText:   "text-orange-700 dark:text-orange-300",
    activeBorder: "border-orange-500",
    items: [
      { href: "/fuel", label: "Fuel Management", icon: Fuel },
    ],
  },
  {
    label:        "Ops",
    groupIcon:    Warehouse,
    permissionKey: "ops",
    dot:          "bg-emerald-500",
    iconColor:    "text-emerald-600 dark:text-emerald-400",
    activeBg:     "bg-emerald-50 dark:bg-emerald-950/40",
    activeText:   "text-emerald-700 dark:text-emerald-300",
    activeBorder: "border-emerald-500",
    items: [
      { href: "/repair-cost",        label: "Repair Cost",     icon: Calculator },
      { href: "/repair-analysis",    label: "Analysis",        icon: BarChart3 },
      { href: "/cost",               label: "Cost Monitor",    icon: Warehouse },
      { href: "/pm-cost",            label: "PM Cost",         icon: Wrench },
      { href: "/pm-cost-main",       label: "PM Cost (MR)",    icon: History },
      { href: "/pm-mapping",         label: "PM Mapping",      icon: Settings2 },
      { href: "/pc-cost",            label: "PC Cost",         icon: ClipboardList },
      { href: "/transaction-detail", label: "Transactions",    icon: FileText },
      { href: "/workshop-summary",   label: "อู่ใน/อู่นอก",     icon: Wrench },
      { href: "/cost-report",        label: "MM Report",       icon: BarChart3 },
    ],
  },
  {
    label:        "Mixer",
    groupIcon:    Trophy,
    permissionKey: "mixer",
    dot:          "bg-amber-500",
    iconColor:    "text-amber-500 dark:text-amber-400",
    activeBg:     "bg-amber-50 dark:bg-amber-950/40",
    activeText:   "text-amber-700 dark:text-amber-300",
    activeBorder: "border-amber-500",
    items: [
      { href: "/asia-incentive",      label: "Asia Incentive",  icon: Trophy },
      { href: "/asia-plant-analysis", label: "Plant Analysis",  icon: BarChart3 },
    ],
  },
  {
    label:        "Procurement",
    groupIcon:    PackageSearch,
    permissionKey: "procurement",
    dot:          "bg-violet-500",
    iconColor:    "text-violet-500 dark:text-violet-400",
    activeBg:     "bg-violet-50 dark:bg-violet-950/40",
    activeText:   "text-violet-700 dark:text-violet-300",
    activeBorder: "border-violet-500",
    items: [
      { href: "/procurement-search",      label: "Search",          icon: Search },
      { href: "/stock-budget-ladkrabang", label: "Stock Budget",    icon: PackageSearch },
      { href: "/price-benchmark",         label: "Price Benchmark", icon: TrendingUp },
      { href: "/supplier-analysis",       label: "Suppliers",       icon: Users },
    ],
  },
  {
    label:        "Lean Project",
    groupIcon:    Gauge,
    dot:          "bg-cyan-500",
    iconColor:    "text-cyan-500 dark:text-cyan-400",
    activeBg:     "bg-cyan-50 dark:bg-cyan-950/40",
    activeText:   "text-cyan-700 dark:text-cyan-300",
    activeBorder: "border-cyan-500",
    items: [
      { href: "/lean-project/cost-per-plate", label: "Cost per Plate", icon: BarChart3 },
    ],
  },
  {
    label:        "Maintenance",
    groupIcon:    Wrench,
    permissionKey: "maintenance",
    dot:          "bg-rose-500",
    iconColor:    "text-rose-500 dark:text-rose-400",
    activeBg:     "bg-rose-50 dark:bg-rose-950/40",
    activeText:   "text-rose-700 dark:text-rose-300",
    activeBorder: "border-rose-500",
    items: [
      { href: "/repair-daily/vs",       label: "Daily Log VS",    icon: Wrench },
      { href: "/repair-daily/garage",   label: "Daily Log Garage",icon: Wrench },
      { href: "/repair-daily/history",  label: "History",         icon: History },
      { href: "/repair-daily/settings", label: "Templates",       icon: Settings2 },
    ],
  },
  {
    label:        "Admin",
    groupIcon:    Shield,
    permissionKey: "admin",
    dot:          "bg-slate-500",
    iconColor:    "text-slate-500 dark:text-slate-400",
    activeBg:     "bg-slate-100 dark:bg-slate-800/40",
    activeText:   "text-slate-700 dark:text-slate-300",
    activeBorder: "border-slate-500",
    items: [
      { href: "/admin/users",  label: "Users",  icon: Users },
      { href: "/admin/groups", label: "Groups", icon: Shield },
    ],
  },
]

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
  const pathname  = usePathname()
  const { data: session } = useSession()

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  const isCollapsed   = !isMobile && collapsed
  const visibleGroups = NAV_GROUPS.filter(
    g => !g.permissionKey || allowedGroups.includes(g.permissionKey)
  )

  // Groups are collapsed by default; the group containing the active page is open
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = visibleGroups.find(g => g.items.some(i => isActive(i.href, i.exact)))
    return new Set(active ? [active.label] : [])
  })

  function toggleGroup(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  return (
    <aside className={`
      flex h-screen flex-col shrink-0 select-none
      border-r border-gray-200 dark:border-white/8
      bg-white dark:bg-[#0f1117]
      transition-all duration-250 ease-in-out
      ${isMobile
        ? `fixed inset-y-0 left-0 z-50 w-[232px] shadow-2xl ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`
        : collapsed ? "w-[62px]" : "w-[232px]"
      }
    `}>

      {/* ── Brand ─────────────────────────────────────────────── */}
      <div className={`flex h-[56px] shrink-0 items-center border-b border-gray-100 dark:border-white/6
        ${isCollapsed ? "justify-center" : "gap-3 px-4"}`}>
        <Link href="/" className="shrink-0" title="Mena Intel">
          <MenaLogo size={30} />
        </Link>
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
              Mena Intel
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">Fleet Platform</p>
          </div>
        )}
        {isMobile && (
          <button
            onClick={onMobileClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400
              hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Nav ───────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 px-2">
        {visibleGroups.map((group) => {
          const groupOpen     = openGroups.has(group.label)
          const hasActiveItem = group.items.some(i => isActive(i.href, i.exact))

          return (
            <div key={group.label} className="mb-1">

              {/* Group header */}
              {isCollapsed ? (
                // In collapsed mode: just a thin colored divider (skip Overview)
                group.label !== "Overview" && (
                  <div className={`mx-3 my-2 h-[2px] rounded-full ${group.dot} opacity-30`} />
                )
              ) : (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="group flex w-full items-center gap-2 px-2 py-1.5 mb-0.5 rounded-lg
                    hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
                >
                  {/* Group icon */}
                  {(() => {
                    const GIcon = group.groupIcon
                    return (
                      <GIcon
                        size={14}
                        className={`shrink-0 transition-colors ${
                          hasActiveItem
                            ? group.iconColor
                            : "text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500"
                        }`}
                      />
                    )
                  })()}
                  <span className={`flex-1 text-left text-[11px] font-semibold tracking-wide
                    transition-colors
                    ${hasActiveItem
                      ? "text-gray-700 dark:text-gray-200"
                      : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400"
                    }`}>
                    {group.label}
                  </span>
                  <ChevronDown
                    size={11}
                    className={`shrink-0 text-gray-300 dark:text-gray-600 transition-transform duration-200
                      ${groupOpen ? "" : "-rotate-90"}`}
                  />
                </button>
              )}

              {/* Nav items */}
              {(isCollapsed || groupOpen) && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon   = item.icon
                    const active = isActive(item.href, item.exact)

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={isMobile ? onMobileClose : undefined}
                        title={isCollapsed ? item.label : undefined}
                        className={`
                          group relative flex items-center rounded-lg text-[13px] font-medium
                          transition-all duration-150
                          ${isCollapsed ? "justify-center py-2.5 px-0" : "gap-2.5 px-2.5 py-2"}
                          ${active
                            ? `${group.activeBg} ${group.activeText} border-l-[3px] ${group.activeBorder} pl-[7px]`
                            : `border-l-[3px] border-transparent
                               text-gray-500 dark:text-gray-400
                               hover:bg-gray-50 dark:hover:bg-white/5
                               hover:text-gray-800 dark:hover:text-gray-200`
                          }
                        `}
                      >
                        <Icon
                          size={15}
                          className={`shrink-0 transition-colors
                            ${active ? group.activeText : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`}
                        />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}

                        {/* Tooltip in collapsed mode */}
                        {isCollapsed && (
                          <span className="
                            pointer-events-none absolute left-[calc(100%+8px)] z-50
                            whitespace-nowrap rounded-lg
                            border border-gray-200 dark:border-white/10
                            bg-white dark:bg-[#1e2130]
                            px-3 py-1.5 text-[12px] font-medium
                            text-gray-700 dark:text-white
                            shadow-lg
                            opacity-0 -translate-x-1
                            group-hover:opacity-100 group-hover:translate-x-0
                            transition-all duration-150
                          ">
                            {item.label}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── Collapse toggle ────────────────────────────────────── */}
      {!isMobile && (
        <div className="px-2 pb-1 pt-1 border-t border-gray-100 dark:border-white/6">
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`flex w-full items-center rounded-lg py-2 text-[12px] font-medium
              text-gray-400 dark:text-gray-500
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
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
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
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold shrink-0">
                    {session.user.name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-white truncate leading-tight">
                    {session.user.name?.split(" ")[0]}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate leading-tight">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg
                  border border-gray-200 dark:border-white/8 py-1.5
                  text-[11px] font-medium text-gray-500 dark:text-gray-400
                  hover:bg-red-50 dark:hover:bg-red-950/20
                  hover:text-red-500 hover:border-red-200 dark:hover:border-red-800/40 transition-colors"
              >
                <LogOut size={11} />
                Sign out
              </button>
            </div>
          )
        )}
      </div>
    </aside>
  )
}
