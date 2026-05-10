"use client"

import Link from "next/link"
import { useState } from "react"
import {
  BarChart3,
  Calculator,
  Fuel,
  Menu,
  ChevronLeft,
} from "lucide-react"

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(true)

  const menuItems = [
    {
      href: "/repair-cost",
      label: "Calculate Repair Cost",
      icon: Calculator,
    },
    {
      href: "/fuel",
      label: "Fuel Management",
      icon: Fuel,
    },
    {
      href: "/truck-distance",
      label: "Truck Distance",
      icon: BarChart3,
    },
  ]

  return (
    <aside
      className={`
        min-h-screen border-r bg-background p-4
        transition-all duration-300
        ${collapsed ? "w-20" : "w-64"}
      `}
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        {!collapsed && (
          <h2 className="text-xl font-bold whitespace-nowrap">
            Mena Intelligence
          </h2>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="
            rounded-lg p-2
            hover:bg-muted
            transition-colors
          "
        >
          {collapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className="
                flex items-center gap-3
                rounded-lg px-3 py-2
                text-sm font-medium
                hover:bg-muted hover:text-primary
                transition-colors
              "
            >
              <Icon size={18} className="shrink-0" />

              {!collapsed && (
                <span className="whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}