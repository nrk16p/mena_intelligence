"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useSession, signOut } from "next-auth/react"
import {
  BarChart3,
  Calculator,
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
} from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

function MenaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="url(#mena-g)" />
      <path d="M7 22 C7 15 14 10 25 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" fill="none" />
      <circle cx="7" cy="22" r="2.2" fill="white" opacity="0.85" />
      <circle cx="25" cy="10" r="2.2" fill="white" opacity="0.85" />
      <rect x="10" y="17.5" width="5" height="5" rx="1" fill="white" opacity="0.85" />
      <rect x="14" y="15.5" width="9" height="7" rx="1" fill="white" />
      <circle cx="12.5" cy="23.2" r="1.4" fill="url(#mena-g)" />
      <circle cx="20.5" cy="23.2" r="1.4" fill="url(#mena-g)" />
      <defs>
        <linearGradient id="mena-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
      </defs>
    </svg>
  )
}

type NavItem  = { href: string; label: string; icon: React.ElementType; exact?: boolean }
type NavGroup = { label: string; permissionKey?: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Vehicle",
    permissionKey: "vehicle",
    items: [
      { href: "/truck-distance",        label: "Truck Distance",    icon: Truck },
      { href: "/truck-year-cost",        label: "Truck Year Cost",   icon: BarChart3 },
      { href: "/truck_utilize_analysis", label: "Truck Utilize",     icon: Truck },
      { href: "/fleet-report",           label: "Fleet Report",      icon: FileText },
    ],
  },
  {
    label: "Fuel",
    permissionKey: "fuel",
    items: [
      { href: "/fuel", label: "Fuel Management", icon: Fuel },
    ],
  },
  {
    label: "Ops",
    permissionKey: "ops",
    items: [
      { href: "/repair-cost",        label: "Repair Cost",        icon: Calculator },
      { href: "/repair-analysis",    label: "Repair Analysis",    icon: BarChart3 },
      { href: "/cost",               label: "Cost Monitoring",    icon: Warehouse },
      { href: "/pc-cost",            label: "PC Cost",            icon: TrendingUp },
      { href: "/transaction-detail", label: "Transaction Detail", icon: FileText },
    ],
  },
  {
    label: "Mixer",
    permissionKey: "mixer",
    items: [
      { href: "/asia-incentive",      label: "Asia Incentive",      icon: Trophy },
      { href: "/asia-plant-analysis", label: "Asia Plant Analysis", icon: BarChart3 },
    ],
  },
  {
    label: "Procurement",
    permissionKey: "procurement",
    items: [
      { href: "/procurement-search",      label: "Procurement Search", icon: Search },
      { href: "/stock-budget-ladkrabang", label: "Stock Budget",       icon: PackageSearch },
      { href: "/price-benchmark",         label: "Price Benchmark",    icon: TrendingUp },
      { href: "/supplier-analysis",       label: "Supplier Analysis",  icon: Users },
    ],
  },
  {
    label: "Maintenance",
    permissionKey: "maintenance",
    items: [
      { href: "/repair-daily/vs",       label: "Daily Log (VS)",     icon: Wrench },
      { href: "/repair-daily/garage",   label: "Daily Log (Garage)", icon: Wrench },
      { href: "/repair-daily/history",  label: "Report History",     icon: History },
      { href: "/repair-daily/settings", label: "Templates",          icon: Settings2 },
    ],
  },
  {
    label: "Admin",
    permissionKey: "admin",
    items: [
      { href: "/admin/users",  label: "Users",  icon: Users },
      { href: "/admin/groups", label: "Groups", icon: Shield },
    ],
  },
]

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

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const visibleGroups = NAV_GROUPS.filter(
    g => !g.permissionKey || allowedGroups.includes(g.permissionKey)
  )

  const isCollapsed = !isMobile && collapsed

  return (
    <aside
      className={`
        flex h-screen flex-col shrink-0
        border-r border-gray-200 dark:border-white/8
        bg-white dark:bg-[#0f1117]
        transition-all duration-300 ease-in-out
        ${isMobile
          ? `fixed inset-y-0 left-0 z-50 w-[224px] ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`
          : collapsed ? "w-[60px]" : "w-[224px]"
        }
      `}
    >
      {/* ── Header ── */}
      <div className={`flex h-14 items-center shrink-0 border-b border-gray-200 dark:border-white/8 ${isCollapsed ? "justify-center px-0" : "justify-between px-4"}`}>
        {isCollapsed ? (
          <Link href="/" title="Mena Intel">
            <MenaLogo size={28} />
          </Link>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2.5 min-w-0">
              <MenaLogo size={28} />
              <div className="leading-tight min-w-0">
                <p className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">Mena Intel</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Fleet Platform</p>
              </div>
            </Link>
            {isMobile && (
              <button
                onClick={onMobileClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X size={15} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {visibleGroups.map((group, gi) => (
          <div key={group.label}>
            {/* Group divider in collapsed mode */}
            {isCollapsed && gi > 0 && (
              <div className="mx-2 mb-3 h-px bg-gray-100 dark:bg-white/6" />
            )}

            {/* Group label in expanded mode */}
            {!isCollapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                {group.label}
              </p>
            )}

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon  = item.icon
                const active = isActive(item.href, item.exact)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={isMobile ? onMobileClose : undefined}
                    title={isCollapsed ? item.label : undefined}
                    className={`
                      group relative flex items-center rounded-lg py-2 text-[13px] font-medium
                      transition-all duration-150
                      ${isCollapsed ? "justify-center px-0" : "gap-2.5 px-2.5"}
                      ${active
                        ? "bg-gray-950 dark:bg-white text-white dark:text-gray-900"
                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/6 hover:text-gray-900 dark:hover:text-white"
                      }
                    `}
                  >
                    <Icon size={15} className="shrink-0" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}

                    {/* Tooltip for collapsed mode */}
                    {isCollapsed && (
                      <span className="
                        pointer-events-none absolute left-full ml-2 z-50
                        whitespace-nowrap rounded-md
                        border border-gray-200 dark:border-white/10
                        bg-white dark:bg-[#1a1d27]
                        px-2.5 py-1.5 text-[12px] font-medium
                        text-gray-700 dark:text-white
                        shadow-lg opacity-0 group-hover:opacity-100
                        translate-x-1 group-hover:translate-x-0
                        transition-all duration-150
                      ">
                        {item.label}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Collapse toggle ── */}
      {!isMobile && (
        <div className="px-2 py-2 border-t border-gray-100 dark:border-white/6">
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? "ขยายเมนู" : "หุบเมนู"}
            className={`
              flex w-full items-center rounded-lg py-2 text-[12px] font-medium
              text-gray-400 dark:text-gray-500
              hover:bg-gray-100 dark:hover:bg-white/6
              hover:text-gray-700 dark:hover:text-gray-300
              transition-colors
              ${isCollapsed ? "justify-center px-0" : "gap-2.5 px-2.5"}
            `}
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

      {/* ── Footer ── */}
      <div className="border-t border-gray-200 dark:border-white/8 px-2 py-3 space-y-1">
        <ThemeToggle collapsed={isCollapsed} />

        {session?.user && (
          isCollapsed ? (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="flex w-full items-center justify-center rounded-lg py-2 text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 transition-colors"
            >
              <LogOut size={15} />
            </button>
          ) : (
            <div className="mt-1 rounded-xl border border-gray-100 dark:border-white/6 bg-gray-50 dark:bg-white/3 px-3 py-2.5">
              <div className="flex items-center gap-2.5 mb-2">
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt="" className="h-7 w-7 rounded-full ring-1 ring-gray-200 dark:ring-white/10 shrink-0" />
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
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/8 py-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800/40 transition-colors"
              >
                <LogOut size={11} />
                Sign out
              </button>
            </div>
          )
        )}

        {!isCollapsed && (
          <p className="px-1 pt-1 text-[10px] text-gray-400 dark:text-gray-600">
            Mena Transport · v1.0
          </p>
        )}
      </div>
    </aside>
  )
}
