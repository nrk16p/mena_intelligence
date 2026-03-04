"use client"

import Link from "next/link"
import { BarChart3, Calculator, Fuel } from "lucide-react"

export function Sidebar() {
  return (
    <div className="w-64 border-r bg-background p-6">
      <h2 className="text-xl font-bold mb-6">Mena Intelligence</h2>

      <nav className="space-y-4">

        <Link
          href="/repair-cost"
          className="flex items-center gap-3 text-sm font-medium hover:text-primary"
        >
          <Calculator size={18} />
          Calculate Repair Cost
        </Link>

        <Link
          href="/fuel"
          className="flex items-center gap-3 text-sm font-medium hover:text-primary"
        >
          <Fuel size={18} />
          Fuel Management
        </Link>



      </nav>
    </div>
  )
}