"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { COST_GROUP_ORDER } from "@/lib/cost-groups"
import { RefreshCw } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

type ApiRow = {
  warehouse_group: string
  cost_group: string
  year: string
  total_cost: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WAREHOUSE_GROUP_ORDER = ["ลาดกระบัง + ขอนแก่น", "สระบุรี + DIST", "อื่น ๆ"]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
}

function sortCostGroups(a: string, b: string): number {
  const ia = COST_GROUP_ORDER.indexOf(a)
  const ib = COST_GROUP_ORDER.indexOf(b)
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CostPerPlatePage() {
  const [rows, setRows]       = useState<ApiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch("/api/lean-project/cost-per-plate")
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "โหลดข้อมูลไม่สำเร็จ")
      setRows(json.data as ApiRow[])
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Pivot shaping ───────────────────────────────────────────────────────────

  const pivot = useMemo(() => {
    const years = [...new Set(rows.map((r) => r.year))].sort()

    type CgRow = { cost_group: string; byYear: Record<string, number>; total: number }
    type Section = { warehouse_group: string; groups: CgRow[]; subtotal: Record<string, number>; subtotalAll: number }

    const sections: Section[] = []

    for (const wg of WAREHOUSE_GROUP_ORDER) {
      const wgRows = rows.filter((r) => r.warehouse_group === wg)
      if (!wgRows.length) continue

      const byCg = new Map<string, CgRow>()
      for (const r of wgRows) {
        let cg = byCg.get(r.cost_group)
        if (!cg) { cg = { cost_group: r.cost_group, byYear: {}, total: 0 }; byCg.set(r.cost_group, cg) }
        cg.byYear[r.year] = (cg.byYear[r.year] ?? 0) + r.total_cost
        cg.total += r.total_cost
      }

      const subtotal: Record<string, number> = {}
      let subtotalAll = 0
      for (const cg of byCg.values()) {
        for (const y of years) subtotal[y] = (subtotal[y] ?? 0) + (cg.byYear[y] ?? 0)
        subtotalAll += cg.total
      }

      sections.push({
        warehouse_group: wg,
        groups: [...byCg.values()].sort((a, b) => sortCostGroups(a.cost_group, b.cost_group)),
        subtotal,
        subtotalAll,
      })
    }

    const grand: Record<string, number> = {}
    let grandAll = 0
    for (const s of sections) {
      for (const y of years) grand[y] = (grand[y] ?? 0) + (s.subtotal[y] ?? 0)
      grandAll += s.subtotalAll
    }

    return { years, sections, grand, grandAll }
  }, [rows])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">

        {/* Header */}
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
              Cost per Plate Analysis
            </h1>
            <p className="text-[13px] text-gray-500 dark:text-gray-400">
              Lean Project — cost group × year (แยกตามกลุ่มคลังสินค้า)
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10
              bg-white dark:bg-white/5 px-3 py-1.5 text-[12px] font-medium
              text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10
              disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            รีเฟรช
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20
            px-4 py-3 text-[13px] text-red-600 dark:text-red-400 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={load} className="font-semibold underline underline-offset-2 shrink-0">ลองใหม่</button>
          </div>
        )}

        {/* Loading */}
        {loading && !error && (
          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#161922] p-10
            text-center text-[13px] text-gray-400 dark:text-gray-500">
            กำลังโหลดข้อมูล…
          </div>
        )}

        {/* Empty */}
        {!loading && !error && pivot.sections.length === 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#161922] p-10
            text-center text-[13px] text-gray-400 dark:text-gray-500">
            ไม่พบข้อมูล
          </div>
        )}

        {/* Pivot table */}
        {!loading && !error && pivot.sections.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/8
            bg-white dark:bg-[#161922] shadow-sm">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/4">
                  <th className="sticky left-0 bg-gray-50 dark:bg-[#1a1d27] px-4 py-2.5 text-left font-semibold
                    text-gray-600 dark:text-gray-300 min-w-[220px]">
                    Cost Group
                  </th>
                  {pivot.years.map((y) => (
                    <th key={y} className="px-4 py-2.5 text-right font-semibold text-gray-600 dark:text-gray-300 min-w-[110px]">
                      {y}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-bold text-gray-700 dark:text-gray-200 min-w-[120px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {pivot.sections.map((s) => (
                  <SectionRows key={s.warehouse_group} section={s} years={pivot.years} />
                ))}

                {/* Grand total */}
                <tr className="border-t-2 border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/6">
                  <td className="sticky left-0 bg-gray-100 dark:bg-[#20242f] px-4 py-2.5 font-bold text-gray-900 dark:text-white">
                    Grand Total
                  </td>
                  {pivot.years.map((y) => (
                    <td key={y} className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white tabular-nums">
                      {fmt(pivot.grand[y] ?? 0)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 dark:text-white tabular-nums">
                    {fmt(pivot.grandAll)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section (warehouse bucket) rows ───────────────────────────────────────────

function SectionRows({
  section,
  years,
}: {
  section: {
    warehouse_group: string
    groups: { cost_group: string; byYear: Record<string, number>; total: number }[]
    subtotal: Record<string, number>
    subtotalAll: number
  }
  years: string[]
}) {
  return (
    <>
      {/* Section header */}
      <tr className="border-t border-gray-200 dark:border-white/8 bg-emerald-50/60 dark:bg-emerald-950/20">
        <td
          colSpan={years.length + 2}
          className="sticky left-0 px-4 py-2 font-bold text-emerald-800 dark:text-emerald-300"
        >
          {section.warehouse_group}
        </td>
      </tr>

      {/* Cost group rows */}
      {section.groups.map((g) => (
        <tr
          key={g.cost_group}
          className="border-t border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
        >
          <td className="sticky left-0 bg-white dark:bg-[#161922] px-4 py-2 pl-7 text-gray-700 dark:text-gray-300">
            {g.cost_group}
          </td>
          {years.map((y) => (
            <td key={y} className="px-4 py-2 text-right text-gray-700 dark:text-gray-300 tabular-nums">
              {g.byYear[y] != null ? fmt(g.byYear[y]) : <span className="text-gray-300 dark:text-gray-600">—</span>}
            </td>
          ))}
          <td className="px-4 py-2 text-right font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
            {fmt(g.total)}
          </td>
        </tr>
      ))}

      {/* Subtotal */}
      <tr className="border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/3">
        <td className="sticky left-0 bg-gray-50 dark:bg-[#1a1d27] px-4 py-2 pl-7 font-semibold text-gray-800 dark:text-gray-200">
          Subtotal
        </td>
        {years.map((y) => (
          <td key={y} className="px-4 py-2 text-right font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
            {fmt(section.subtotal[y] ?? 0)}
          </td>
        ))}
        <td className="px-4 py-2 text-right font-bold text-gray-900 dark:text-white tabular-nums">
          {fmt(section.subtotalAll)}
        </td>
      </tr>
    </>
  )
}
