"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  BarChart3,
  Calculator,
  Fuel,
  ChevronLeft,
  ChevronRight,
  Truck,
  Trophy,
  PackageSearch,
  LayoutDashboard,
  ClipboardList,
  Warehouse,
} from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  exact?: boolean
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Vehicle",
    items: [
      { href: "/truck-distance", label: "Truck Distance", icon: Truck },
    ],
  },
  {
    label: "Fuel",
    items: [
      { href: "/fuel", label: "Fuel Management", icon: Fuel },
    ],
  },
  {
    label: "Ops",
    items: [
      { href: "/repair-cost", label: "Repair Cost", icon: Calculator },
      { href: "/cost", label: "Cost Monitoring", icon: Warehouse },
    ],
  },
  {
    label: "Mixer",
    items: [
      { href: "/asia-incentive", label: "Asia Incentive", icon: Trophy },
    ],
  },
  {
    label: "Procurement",
    items: [
      { href: "/stock-budget-ladkrabang", label: "Stock Budget", icon: PackageSearch },
      { href: "/stock-result-summary", label: "Stock Summary", icon: ClipboardList },
    ],
  },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={`
        relative flex h-screen flex-col shrink-0
        border-r border-gray-200 dark:border-white/8
        bg-white dark:bg-[#0f1117]
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-[56px]" : "w-[224px]"}
      `}
    >
      {/* Logo */}
      <div className={`flex h-14 items-center border-b border-gray-200 dark:border-white/8 ${collapsed ? "justify-center px-0" : "justify-between px-4"}`}>
        {!collapsed ? (
          <>
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gray-800 to-gray-950 dark:from-white dark:to-gray-300 text-white dark:text-gray-900 text-xs font-bold shadow-sm">
                M
              </div>
              <div className="leading-tight">
                <p className="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">Mena Intel</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Fleet Platform</p>
              </div>
            </Link>
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
          </>
        ) : (
          <button onClick={() => setCollapsed(false)} className="group flex flex-col items-center gap-0.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gray-800 to-gray-950 dark:from-white dark:to-gray-300 text-white dark:text-gray-900 text-xs font-bold shadow-sm">
              M
            </div>
            <ChevronRight size={10} className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href, item.exact)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`
                      group relative flex items-center gap-2.5 rounded-lg py-2 text-[13px] font-medium transition-all duration-150
                      ${collapsed ? "justify-center px-0" : "px-2.5"}
                      ${active
                        ? "bg-gray-950 dark:bg-white text-white dark:text-gray-900"
                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/6 hover:text-gray-900 dark:hover:text-white"
                      }
                    `}
                  >
                    <Icon size={15} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-white/8 px-2 py-3 space-y-1">
        <ThemeToggle collapsed={collapsed} />
        {!collapsed && (
          <p className="px-2.5 pt-1 text-[10px] text-gray-400 dark:text-gray-600">
            Mena Transport · v1.0
          </p>
        )}
      </div>
    </aside>
  )
}
