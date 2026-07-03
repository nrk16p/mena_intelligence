"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────

type DetailLine = {
  จุดประสงค์:   string
  กลุ่มสินค้า:  string
  รหัสสินค้า:   string
  ชื่อสินค้า:   string
  ราคาทุน:      number | null
  ซัพพลายเออร์: string
  cost:          number
  records:       number
}

type PlateDetailRow = {
  month_year:  string
  plate:       string
  wd:          string
  plate_total: number
  lines:       DetailLine[]
}

// ── Cost Group mapping (same as transaction-detail) ──────────────────────────

const COST_GROUP_MAP: Record<string, string> = {
  "PM น้ำมันเครื่อง":        "PM - Preventive Maintenance",
  "PM ช่วงล่าง":             "PM - Preventive Maintenance",
  "PM ความเย็น":             "PM - Preventive Maintenance",
  "ค่าใช้จ่ายอื่น ๆ":        "CM - Corrective Maintenance",
  "ซ่อม":                    "CM - Corrective Maintenance",
  "อะไหล่/วัสดุสิ้นเปลือง": "CM - Corrective Maintenance",
  "เครื่องมือส่วนตัวช่าง":   "Tools & Equipment",
  "เบิกประจำตัวช่าง":        "Tools & Equipment",
  "ยาง":                     "T - Tire",
  "ซ่อมเคสอุบัติเหตุ":       "AC - Accident Repair",
}

function getCostGroup(จุดประสงค์: string): string {
  return COST_GROUP_MAP[จุดประสงค์?.trim()] ?? "Other"
}

const CG_ORDER = ["CM", "PM", "AC", "T -", "Tools", "Other"]
const cgSort = (a: string, b: string) => {
  const ai = CG_ORDER.findIndex((k) => a.startsWith(k))
  const bi = CG_ORDER.findIndex((k) => b.startsWith(k))
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatShort(v: number) {
  const abs = Math.abs(v)
  const sign = v < 0 ? "−" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1)}K`
  return `${sign}${abs.toFixed(0)}`
}

function formatInt(v: number) {
  return Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function nowYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

// อู่นอก = ใบเบิกของคัน-เดือนนั้นมีรายการ "ค่าแรง" (จ้างซ่อมภายนอก)
function isOutside(r: PlateDetailRow) {
  return (r.lines || []).some((l) => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkshopSummaryPage() {
  const todayYM   = nowYM()
  const todayYear = todayYM.split("-")[0]

  // ── Filter state ──────────────────────────────────────────────────────────
  const [startMonth, setStartMonth]                 = useState(`${todayYear}-01`)
  const [endMonth, setEndMonth]                     = useState(todayYM)
  const [selectedWarehouses, setSelectedWarehouses] = useState<Set<string>>(new Set())
  const [warehouseOptions, setWarehouseOptions]     = useState<string[]>([])
  const [selectedCostGroups, setSelectedCostGroups] = useState<Set<string>>(new Set())

  // ── Data state ────────────────────────────────────────────────────────────
  const [detailData, setDetailData] = useState<PlateDetailRow[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState("")
  const [hasLoaded, setHasLoaded]   = useState(false)

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError("")
    setDetailData([])
    setSelectedCostGroups(new Set())
    try {
      const params = new URLSearchParams({ start: startMonth, end: endMonth })
      if (selectedWarehouses.size > 0)
        params.set("warehouse", Array.from(selectedWarehouses).join(","))
      const r = await fetch(`/api/cost/detail?${params}`, { cache: "no-store" })
      const j = await r.json()
      if (j.success) {
        setDetailData(j.data || [])
        setHasLoaded(true)
      } else {
        setError(j.error || "Failed to load")
      }
    } catch (e: any) {
      setError(e.message || "Network error")
    } finally {
      setLoading(false)
    }
  }, [startMonth, endMonth, selectedWarehouses])

  // ── Fetch warehouse options ───────────────────────────────────────────────
  useEffect(() => {
    async function fetchWarehouses() {
      try {
        const r = await fetch(
          `/api/cost/summary?start=${startMonth}&end=${endMonth}&group_by=${encodeURIComponent("จุดประสงค์ในการเบิก")}`,
          { cache: "no-store" }
        )
        const j = await r.json()
        if (j.success) {
          const whs = Array.from(
            new Set((j.data || []).map((row: any) => row.warehouse).filter(Boolean))
          ) as string[]
          setWarehouseOptions(whs.sort())
        }
      } catch {}
    }
    fetchWarehouses()
  }, [startMonth, endMonth])

  // ── Available cost groups from loaded data ────────────────────────────────
  const availableCostGroups = useMemo(() => {
    const set = new Set<string>()
    detailData.forEach(r => (r.lines || []).forEach(l => set.add(getCostGroup(l.จุดประสงค์ || ""))))
    return Array.from(set).sort(cgSort)
  }, [detailData])

  // ── Cost-group filtered data (line-level, recalc plate_total) ─────────────
  const cgFilteredData = useMemo((): PlateDetailRow[] => {
    if (selectedCostGroups.size === 0) return detailData
    return detailData.flatMap(r => {
      const lines = (r.lines || []).filter(l => selectedCostGroups.has(getCostGroup(l.จุดประสงค์ || "")))
      if (lines.length === 0) return []
      return [{ ...r, lines, plate_total: lines.reduce((s, l) => s + l.cost, 0) }]
    })
  }, [detailData, selectedCostGroups])

  // ── Monthly summary: อู่ใน vs อู่นอก ─────────────────────────────────────
  const monthly = useMemo(() => {
    type Entry = {
      month: string
      auNai: number; auNok: number
      _naiPlates: Set<string>; _nokPlates: Set<string>
    }
    const map = new Map<string, Entry>()
    cgFilteredData.forEach((r) => {
      if (!map.has(r.month_year))
        map.set(r.month_year, { month: r.month_year, auNai: 0, auNok: 0, _naiPlates: new Set(), _nokPlates: new Set() })
      const entry = map.get(r.month_year)!
      if (isOutside(r)) { entry.auNok += r.plate_total; entry._nokPlates.add(r.plate) }
      else              { entry.auNai += r.plate_total; entry._naiPlates.add(r.plate) }
    })
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(({ _naiPlates, _nokPlates, ...rest }) => {
        const naiPlates = _naiPlates.size
        const nokPlates = _nokPlates.size
        const total     = rest.auNai + rest.auNok
        return {
          ...rest,
          naiPlates,
          nokPlates,
          total,
          nokShare: total > 0 ? (rest.auNok / total) * 100 : 0,
          avgNai:   naiPlates > 0 ? rest.auNai / naiPlates : 0,
          avgNok:   nokPlates > 0 ? rest.auNok / nokPlates : 0,
        }
      })
  }, [cgFilteredData])

  // ── Overall totals ────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let naiCost = 0, nokCost = 0
    const naiPlates = new Set<string>(), nokPlates = new Set<string>()
    cgFilteredData.forEach((r) => {
      if (isOutside(r)) { nokCost += r.plate_total; nokPlates.add(r.plate) }
      else              { naiCost += r.plate_total; naiPlates.add(r.plate) }
    })
    const total = naiCost + nokCost
    return {
      naiTotal: naiCost,
      nokTotal: nokCost,
      total,
      naiCount: naiPlates.size,
      nokCount: nokPlates.size,
      naiAvg:   naiPlates.size > 0 ? naiCost / naiPlates.size : 0,
      nokAvg:   nokPlates.size > 0 ? nokCost / nokPlates.size : 0,
      nokShare: total > 0 ? (nokCost / total) * 100 : 0,
    }
  }, [cgFilteredData])

  // ── Cost Group split: อู่ใน vs อู่นอก per group ──────────────────────────
  const cgSplit = useMemo(() => {
    type Row = { costGroup: string; nai: number; nok: number }
    const map = new Map<string, Row>()
    cgFilteredData.forEach((r) => {
      const outside = isOutside(r)
      ;(r.lines || []).forEach((l) => {
        const cg = getCostGroup(l.จุดประสงค์ || "")
        if (!map.has(cg)) map.set(cg, { costGroup: cg, nai: 0, nok: 0 })
        const row = map.get(cg)!
        if (outside) row.nok += l.cost
        else         row.nai += l.cost
      })
    })
    return Array.from(map.values())
      .map((r) => ({ ...r, total: r.nai + r.nok, nokShare: r.nai + r.nok > 0 ? (r.nok / (r.nai + r.nok)) * 100 : 0 }))
      .sort((a, b) => cgSort(a.costGroup, b.costGroup))
  }, [cgFilteredData])

  const premiumPct = totals.naiAvg > 0
    ? ((totals.nokAvg - totals.naiAvg) / totals.naiAvg) * 100
    : 0

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">สรุป อู่ใน vs อู่นอก</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          ค่าซ่อมรายเดือนแยกตามประเภทอู่ — <span className="text-sky-500 font-semibold">อู่ใน</span> = ซ่อมภายใน (ไม่มีรายการค่าแรง) · <span className="text-orange-500 font-semibold">อู่นอก</span> = จ้างซ่อมภายนอก (มีรายการค่าแรง)
        </p>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Start</label>
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-white/10 bg-transparent px-3 py-1.5 text-xs dark:text-white outline-none focus:border-gray-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">End</label>
            <input
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-white/10 bg-transparent px-3 py-1.5 text-xs dark:text-white outline-none focus:border-gray-400"
            />
          </div>

          <button
            onClick={loadDetail}
            disabled={loading}
            className="rounded-xl bg-gray-900 dark:bg-white px-5 py-1.5 text-xs font-semibold text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-40 transition"
          >
            {loading ? "Loading…" : hasLoaded ? "Reload" : "Load Data"}
          </button>
        </div>

        {/* คลังสินค้า chips */}
        {warehouseOptions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-white/8 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">คลังสินค้า</span>
            {warehouseOptions.map((wh) => {
              const active = selectedWarehouses.has(wh)
              return (
                <button
                  key={wh}
                  onClick={() => setSelectedWarehouses((prev) => {
                    const next = new Set(prev)
                    if (next.has(wh)) next.delete(wh); else next.add(wh)
                    return next
                  })}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                    active
                      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                      : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-gray-400"
                  }`}
                >
                  {wh}
                </button>
              )
            })}
            {selectedWarehouses.size > 0 && (
              <button
                onClick={() => setSelectedWarehouses(new Set())}
                className="text-[11px] text-gray-400 hover:text-gray-600 underline"
              >
                clear
              </button>
            )}
          </div>
        )}

        {/* Cost Group filter chips */}
        {availableCostGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-white/8 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cost Group</span>
            {availableCostGroups.map((cg) => {
              const active = selectedCostGroups.has(cg)
              return (
                <button
                  key={cg}
                  onClick={() => setSelectedCostGroups((prev) => {
                    const next = new Set(prev)
                    if (next.has(cg)) next.delete(cg); else next.add(cg)
                    return next
                  })}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                    active
                      ? "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-400 dark:text-gray-900"
                      : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-gray-400"
                  }`}
                >
                  {cg}
                </button>
              )
            })}
            {selectedCostGroups.size > 0 && (
              <button
                onClick={() => setSelectedCostGroups(new Set())}
                className="text-[11px] text-gray-400 hover:text-gray-600 underline"
              >
                clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>
      )}

      {/* Empty state */}
      {!hasLoaded && !loading && !error && (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 py-16 text-center text-xs text-gray-400">
          เลือกช่วงเดือนแล้วกด Load Data เพื่อดูสรุป อู่ใน / อู่นอก
        </div>
      )}

      {/* KPI cards */}
      {hasLoaded && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* อู่ใน total */}
          <div className="rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-sky-100 text-sky-600">อู่ใน</span>
              <span className="text-[11px] text-gray-400">{totals.naiCount} คัน</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">ค่าซ่อมรวม</p>
            <p className="text-xl font-bold text-sky-700 dark:text-sky-400">
              {totals.naiTotal > 0 ? formatShort(totals.naiTotal) : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">บาท (ทั้งช่วง)</p>
          </div>

          {/* อู่นอก total */}
          <div className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-600">อู่นอก</span>
              <span className="text-[11px] text-gray-400">{totals.nokCount} คัน</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">ค่าซ่อมรวม</p>
            <p className="text-xl font-bold text-orange-700 dark:text-orange-400">
              {totals.nokTotal > 0 ? formatShort(totals.nokTotal) : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">บาท (ทั้งช่วง)</p>
          </div>

          {/* อู่ใน avg */}
          <div className="rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-white dark:bg-[#1a1d27] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-sky-100 text-sky-600">อู่ใน</span>
              <span className="text-[11px] text-gray-400">avg / คัน</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">ค่าซ่อมเฉลี่ย / คัน</p>
            <p className="text-xl font-bold text-sky-700 dark:text-sky-400">
              {totals.naiAvg > 0 ? formatInt(totals.naiAvg) : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">บาท / คัน (ทั้งช่วง)</p>
          </div>

          {/* อู่นอก avg */}
          <div className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-white dark:bg-[#1a1d27] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-600">อู่นอก</span>
              <span className="text-[11px] text-gray-400">avg / คัน</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">ค่าซ่อมเฉลี่ย / คัน</p>
            <p className="text-xl font-bold text-orange-700 dark:text-orange-400">
              {totals.nokAvg > 0 ? formatInt(totals.nokAvg) : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">บาท / คัน (ทั้งช่วง)</p>
          </div>

          {/* Premium + share */}
          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-5 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">เปรียบเทียบ</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">อู่นอกแพงกว่า / คัน</p>
            <p className={`text-xl font-bold ${premiumPct >= 0 ? "text-red-500" : "text-emerald-500"}`}>
              {totals.naiAvg > 0 ? `${premiumPct >= 0 ? "+" : ""}${premiumPct.toFixed(0)}%` : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              สัดส่วนอู่นอก {totals.nokShare.toFixed(0)}% ของค่าซ่อมทั้งหมด
            </p>
          </div>
        </div>
      )}

      {/* Chart: อู่ใน vs อู่นอก by month */}
      {monthly.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-5">
          <p className="mb-4 text-xs font-semibold text-gray-700 dark:text-gray-300">
            ค่าซ่อม อู่ใน vs อู่นอก รายเดือน
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={monthly} barCategoryGap="30%" barGap={4}
              margin={{ top: 20, right: 48, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="cost"
                orientation="left"
                tickFormatter={(v) => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
                  return String(v)
                }}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <YAxis
                yAxisId="plates"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#a78bfa" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                formatter={(value: any, name: any) => {
                  if (name === "naiPlates") return [value + " คัน", "อู่ใน (plates)"]
                  if (name === "nokPlates") return [value + " คัน", "อู่นอก (plates)"]
                  const fmt = (v: number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ฿"
                  return [fmt(value), name === "auNai" ? "อู่ใน (cost)" : "อู่นอก (cost)"]
                }}
                labelStyle={{ fontWeight: 600, fontSize: 12 }}
                contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #e5e7eb" }}
              />
              <Legend
                formatter={(value) => {
                  const map: Record<string, string> = {
                    auNai: "อู่ใน (cost)", auNok: "อู่นอก (cost)",
                    naiPlates: "อู่ใน (plates)", nokPlates: "อู่นอก (plates)",
                  }
                  return <span style={{ fontSize: 11, color: "#6b7280" }}>{map[value] ?? value}</span>
                }}
              />
              <Bar yAxisId="cost" dataKey="auNai" name="auNai" fill="#0ea5e9" radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="auNai"
                  position="top"
                  style={{ fontSize: 10, fill: "#0284c7", fontWeight: 600 }}
                  formatter={(v: any) => {
                    const n = Number(v)
                    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
                    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
                    return n > 0 ? String(n) : ""
                  }}
                />
              </Bar>
              <Bar yAxisId="cost" dataKey="auNok" name="auNok" fill="#f97316" radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="auNok"
                  position="top"
                  style={{ fontSize: 10, fill: "#ea580c", fontWeight: 600 }}
                  formatter={(v: any) => {
                    const n = Number(v)
                    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
                    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
                    return n > 0 ? String(n) : ""
                  }}
                />
              </Bar>
              <Line
                yAxisId="plates"
                dataKey="naiPlates"
                name="naiPlates"
                type="monotone"
                stroke="#0ea5e9"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 3, fill: "#0ea5e9", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="plates"
                dataKey="nokPlates"
                name="nokPlates"
                type="monotone"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly summary table */}
      {monthly.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-5">
          <p className="mb-4 text-xs font-semibold text-gray-700 dark:text-gray-300">
            ตารางสรุปรายเดือน
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-2 pr-3 text-left font-semibold">เดือน</th>
                  <th className="py-2 px-3 text-right font-semibold text-sky-500">อู่ใน (฿)</th>
                  <th className="py-2 px-3 text-right font-semibold text-sky-500">คัน</th>
                  <th className="py-2 px-3 text-right font-semibold text-sky-500">avg/คัน</th>
                  <th className="py-2 px-3 text-right font-semibold text-orange-500">อู่นอก (฿)</th>
                  <th className="py-2 px-3 text-right font-semibold text-orange-500">คัน</th>
                  <th className="py-2 px-3 text-right font-semibold text-orange-500">avg/คัน</th>
                  <th className="py-2 px-3 text-right font-semibold">รวม (฿)</th>
                  <th className="py-2 pl-3 text-right font-semibold">%อู่นอก</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/2">
                    <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-white">{m.month}</td>
                    <td className="py-2 px-3 text-right text-sky-700 dark:text-sky-400">{formatInt(m.auNai)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{m.naiPlates}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{m.avgNai > 0 ? formatInt(m.avgNai) : "—"}</td>
                    <td className="py-2 px-3 text-right text-orange-700 dark:text-orange-400">{formatInt(m.auNok)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{m.nokPlates}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{m.avgNok > 0 ? formatInt(m.avgNok) : "—"}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900 dark:text-white">{formatInt(m.total)}</td>
                    <td className="py-2 pl-3 text-right">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        m.nokShare >= 50
                          ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300"
                          : "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300"
                      }`}>
                        {m.nokShare.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-white/15 font-bold text-gray-900 dark:text-white">
                  <td className="py-2 pr-3">รวม</td>
                  <td className="py-2 px-3 text-right text-sky-700 dark:text-sky-400">{formatInt(totals.naiTotal)}</td>
                  <td className="py-2 px-3 text-right">{totals.naiCount}</td>
                  <td className="py-2 px-3 text-right">{totals.naiAvg > 0 ? formatInt(totals.naiAvg) : "—"}</td>
                  <td className="py-2 px-3 text-right text-orange-700 dark:text-orange-400">{formatInt(totals.nokTotal)}</td>
                  <td className="py-2 px-3 text-right">{totals.nokCount}</td>
                  <td className="py-2 px-3 text-right">{totals.nokAvg > 0 ? formatInt(totals.nokAvg) : "—"}</td>
                  <td className="py-2 px-3 text-right">{formatInt(totals.total)}</td>
                  <td className="py-2 pl-3 text-right">{totals.nokShare.toFixed(0)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            * จำนวนคันรวมนับทะเบียนไม่ซ้ำทั้งช่วง (ไม่ใช่ผลรวมรายเดือน) — คันเดียวกันอาจเข้าทั้งอู่ในและอู่นอกคนละเดือน
          </p>
        </div>
      )}

      {/* Cost Group split */}
      {cgSplit.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-5">
          <p className="mb-4 text-xs font-semibold text-gray-700 dark:text-gray-300">
            แยกตาม Cost Group — อู่ใน vs อู่นอก
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-2 pr-3 text-left font-semibold">Cost Group</th>
                  <th className="py-2 px-3 text-right font-semibold text-sky-500">อู่ใน (฿)</th>
                  <th className="py-2 px-3 text-right font-semibold text-orange-500">อู่นอก (฿)</th>
                  <th className="py-2 px-3 text-right font-semibold">รวม (฿)</th>
                  <th className="py-2 px-3 text-right font-semibold">%อู่นอก</th>
                  <th className="py-2 pl-3 text-left font-semibold w-[30%]">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {cgSplit.map((r) => (
                  <tr key={r.costGroup} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/2">
                    <td className="py-2 pr-3 font-semibold text-gray-900 dark:text-white">{r.costGroup}</td>
                    <td className="py-2 px-3 text-right text-sky-700 dark:text-sky-400">{formatInt(r.nai)}</td>
                    <td className="py-2 px-3 text-right text-orange-700 dark:text-orange-400">{formatInt(r.nok)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900 dark:text-white">{formatInt(r.total)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{r.nokShare.toFixed(0)}%</td>
                    <td className="py-2 pl-3">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                        <div className="bg-sky-400" style={{ width: `${100 - r.nokShare}%` }} />
                        <div className="bg-orange-400" style={{ width: `${r.nokShare}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
