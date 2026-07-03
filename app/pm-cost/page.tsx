"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────

type ApiRow = {
  month_year:   string
  รหัสสินค้า:  string
  ชื่อสินค้า:  string
  กลุ่มสินค้า: string
  warehouse:    string
  partner_flag: string
  plate:        string
  total_cost:   number
  qty:          number
  records:      number
  pm_class:     "PM1" | "PM2" | "PM3" | null
}

type PmKey = "PM1" | "PM2" | "PM3" | "ยังไม่ mapping"

// ── Constants ─────────────────────────────────────────────────────────────────

const PM_ORDER: PmKey[] = ["PM1", "PM2", "PM3", "ยังไม่ mapping"]

const PM_META: Record<PmKey, { color: string; desc: string }> = {
  "PM1":            { color: "#3B82F6", desc: "Basic — น้ำมันเครื่อง ไส้กรอง จารบี ค่าแรงเซอร์วิส" },
  "PM2":            { color: "#F59E0B", desc: "Intermediate — เครื่องยนต์ แอร์/ไฟ เบรค/คลัทช์" },
  "PM3":            { color: "#8B5CF6", desc: "Comprehensive — ช่วงล่าง เกียร์/เฟืองท้าย หาง/ตัวถัง" },
  "ยังไม่ mapping": { color: "#9CA3AF", desc: "ยังไม่ได้กำหนด PM class — ไปที่ PM Mapping" },
}

const MONTH_NUM_TO_LABEL: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatShort(v: number) {
  const abs  = Math.abs(v)
  const sign = v < 0 ? "−" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(1)}K`
  return `${sign}${abs.toFixed(0)}`
}

function formatNumber(v: number) {
  return Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getMonthsInRange(start: string, end: string): string[] {
  if (!start || !end) return []
  const [sy, sm] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)
  const out: string[] = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

function shiftYear(ym: string, delta: number): string {
  const [y, m] = ym.split("-")
  return `${Number(y) + delta}-${m}`
}

const pmKeyOf = (r: ApiRow): PmKey => r.pm_class ?? "ยังไม่ mapping"

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PmCostPage() {
  const today      = new Date()
  const todayYear  = today.getFullYear()
  const todayMonth = String(today.getMonth() + 1).padStart(2, "0")

  const [startMonth, setStartMonth] = useState(`${todayYear}-01`)
  const [endMonth, setEndMonth]     = useState(`${todayYear}-${todayMonth}`)

  const [currRows, setCurrRows] = useState<ApiRow[]>([])
  const [prevRows, setPrevRows] = useState<ApiRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const [selectedWarehouses, setSelectedWarehouses]     = useState<Set<string>>(new Set())
  const [selectedPartnerFlags, setSelectedPartnerFlags] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const year     = Number(startMonth.split("-")[0])
  const prevYear = year - 1

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = (s: string, e: string) => `/api/pm-cost?start=${s}&end=${e}`
      const [cRes, pRes] = await Promise.all([
        fetch(url(startMonth, endMonth), { cache: "no-store" }),
        fetch(url(shiftYear(startMonth, -1), shiftYear(endMonth, -1)), { cache: "no-store" }),
      ])
      const [cJson, pJson] = await Promise.all([cRes.json(), pRes.json()])
      if (!cJson.success) throw new Error(cJson.error || "Load failed")
      if (!pJson.success) throw new Error(pJson.error || "Load failed")
      setCurrRows(cJson.data)
      setPrevRows(pJson.data)
      setHasSearched(true)
    } catch (e: any) {
      setError(e.message || "Load failed")
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  // ── Filters ─────────────────────────────────────────────────────────────────
  const warehouses = useMemo(
    () => Array.from(new Set(currRows.map((r) => r.warehouse || "ไม่ระบุ"))).sort(),
    [currRows]
  )
  const partnerFlags = useMemo(
    () => Array.from(new Set(currRows.map((r) => r.partner_flag || "ไม่ระบุ"))).sort(),
    [currRows]
  )

  const applyFilter = (rows: ApiRow[]) => rows.filter((r) => {
    if (selectedWarehouses.size > 0   && !selectedWarehouses.has(r.warehouse || "ไม่ระบุ"))     return false
    if (selectedPartnerFlags.size > 0 && !selectedPartnerFlags.has(r.partner_flag || "ไม่ระบุ")) return false
    return true
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fCurr = useMemo(() => applyFilter(currRows), [currRows, selectedWarehouses, selectedPartnerFlags])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fPrev = useMemo(() => applyFilter(prevRows), [prevRows, selectedWarehouses, selectedPartnerFlags])

  const months = useMemo(() => getMonthsInRange(startMonth, endMonth), [startMonth, endMonth])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalCurr = useMemo(() => fCurr.reduce((s, r) => s + r.total_cost, 0), [fCurr])
  const totalPrev = useMemo(() => fPrev.reduce((s, r) => s + r.total_cost, 0), [fPrev])
  const yoy = totalPrev > 0 ? ((totalCurr - totalPrev) / totalPrev) * 100 : null
  const unmappedCurr = useMemo(
    () => fCurr.filter((r) => r.pm_class === null).reduce((s, r) => s + r.total_cost, 0),
    [fCurr]
  )

  // ── PM class comparison (curr vs prev) ──────────────────────────────────────
  const pmComparison = useMemo(() => {
    const sum = (rows: ApiRow[]) => {
      const m = new Map<PmKey, number>()
      rows.forEach((r) => {
        const k = pmKeyOf(r)
        m.set(k, (m.get(k) || 0) + r.total_cost)
      })
      return m
    }
    const cm = sum(fCurr), pm = sum(fPrev)
    return PM_ORDER
      .filter((k) => (cm.get(k) || 0) > 0 || (pm.get(k) || 0) > 0)
      .map((k) => {
        const curr = cm.get(k) || 0
        const prev = pm.get(k) || 0
        return { pm: k, curr, prev, change: curr - prev, pct: prev > 0 ? ((curr - prev) / prev) * 100 : null }
      })
  }, [fCurr, fPrev])

  // ── Monthly chart data (cost bars + unique plate counts) ───────────────────
  const chartData = useMemo(() => {
    const byMonthPm       = new Map<string, Record<string, number>>()
    const platesByMonthPm = new Map<string, Record<string, Set<string>>>()
    fCurr.forEach((r) => {
      const k = pmKeyOf(r)
      const rec = byMonthPm.get(r.month_year) || {}
      rec[k] = (rec[k] || 0) + r.total_cost
      byMonthPm.set(r.month_year, rec)
      if (r.plate) {
        const pRec = platesByMonthPm.get(r.month_year) || {}
        pRec[k] = pRec[k] || new Set()
        pRec[k].add(r.plate)
        platesByMonthPm.set(r.month_year, pRec)
      }
    })
    const prevByMonth = new Map<string, number>()
    fPrev.forEach((r) => {
      // align prev-year month to current-year axis
      const aligned = shiftYear(r.month_year, 1)
      prevByMonth.set(aligned, (prevByMonth.get(aligned) || 0) + r.total_cost)
    })
    return months.map((my) => {
      const rec  = byMonthPm.get(my) || {}
      const pRec = platesByMonthPm.get(my) || {}
      const mm = my.split("-")[1]
      const row: Record<string, number | string> = {
        month:            MONTH_NUM_TO_LABEL[mm] ?? my,
        PM1:              rec["PM1"] || 0,
        PM2:              rec["PM2"] || 0,
        PM3:              rec["PM3"] || 0,
        "ยังไม่ mapping": rec["ยังไม่ mapping"] || 0,
        [`${prevYear}`]:  prevByMonth.get(my) || 0,
      }
      PM_ORDER.forEach((pm) => { row[`${pm}_plates`] = pRec[pm]?.size || 0 })
      return row
    })
  }, [fCurr, fPrev, months, prevYear])

  // ── Unique plates (period total) ────────────────────────────────────────────
  const uniquePlatesCurr = useMemo(() => new Set(fCurr.filter((r) => r.plate).map((r) => r.plate)).size, [fCurr])
  const uniquePlatesPrev = useMemo(() => new Set(fPrev.filter((r) => r.plate).map((r) => r.plate)).size, [fPrev])

  // ── Breakdown: PM → กลุ่มสินค้า → รหัสสินค้า ───────────────────────────────
  type ItemRow = {
    key: string; code: string; name: string
    byMonth: Record<string, number>
    total_curr: number; total_prev: number; qty_curr: number
  }
  type GroupRow = {
    key: string; group: string; items: ItemRow[]
    byMonth: Record<string, number>
    total_curr: number; total_prev: number
  }
  type PmRow = {
    key: PmKey; groups: GroupRow[]
    byMonth: Record<string, number>
    total_curr: number; total_prev: number
  }

  const breakdown = useMemo<PmRow[]>(() => {
    // prev-year totals per item (for YoY at item level)
    const prevByItem = new Map<string, number>()
    fPrev.forEach((r) => {
      const k = `${pmKeyOf(r)}|${r.กลุ่มสินค้า}|${r.รหัสสินค้า}`
      prevByItem.set(k, (prevByItem.get(k) || 0) + r.total_cost)
    })

    const pmMap = new Map<PmKey, Map<string, Map<string, ItemRow>>>()
    fCurr.forEach((r) => {
      const pk = pmKeyOf(r)
      if (!pmMap.has(pk)) pmMap.set(pk, new Map())
      const gMap = pmMap.get(pk)!
      const g = r.กลุ่มสินค้า || "ไม่ระบุกลุ่ม"
      if (!gMap.has(g)) gMap.set(g, new Map())
      const iMap = gMap.get(g)!
      if (!iMap.has(r.รหัสสินค้า)) {
        iMap.set(r.รหัสสินค้า, {
          key: `${pk}|${g}|${r.รหัสสินค้า}`,
          code: r.รหัสสินค้า, name: r.ชื่อสินค้า,
          byMonth: {}, total_curr: 0,
          total_prev: prevByItem.get(`${pk}|${r.กลุ่มสินค้า}|${r.รหัสสินค้า}`) || 0,
          qty_curr: 0,
        })
      }
      const it = iMap.get(r.รหัสสินค้า)!
      it.byMonth[r.month_year] = (it.byMonth[r.month_year] || 0) + r.total_cost
      it.total_curr += r.total_cost
      it.qty_curr   += r.qty || 0
    })

    // include prev-only items so YoY totals reconcile at group level
    fPrev.forEach((r) => {
      const pk = pmKeyOf(r)
      const g = r.กลุ่มสินค้า || "ไม่ระบุกลุ่ม"
      const iMap = pmMap.get(pk)?.get(g)
      if (iMap && !iMap.has(r.รหัสสินค้า)) {
        iMap.set(r.รหัสสินค้า, {
          key: `${pk}|${g}|${r.รหัสสินค้า}`,
          code: r.รหัสสินค้า, name: r.ชื่อสินค้า,
          byMonth: {}, total_curr: 0,
          total_prev: prevByItem.get(`${pk}|${r.กลุ่มสินค้า}|${r.รหัสสินค้า}`) || 0,
          qty_curr: 0,
        })
      }
    })

    return PM_ORDER
      .filter((pk) => pmMap.has(pk))
      .map((pk) => {
        const groups: GroupRow[] = Array.from(pmMap.get(pk)!.entries())
          .map(([g, iMap]) => {
            const items = Array.from(iMap.values()).sort((a, b) => b.total_curr - a.total_curr)
            const byMonth: Record<string, number> = {}
            items.forEach((it) => Object.entries(it.byMonth).forEach(([m, v]) => { byMonth[m] = (byMonth[m] || 0) + v }))
            return {
              key: `${pk}|${g}`, group: g, items, byMonth,
              total_curr: items.reduce((s, i) => s + i.total_curr, 0),
              total_prev: items.reduce((s, i) => s + i.total_prev, 0),
            }
          })
          .sort((a, b) => b.total_curr - a.total_curr)
        const byMonth: Record<string, number> = {}
        groups.forEach((g) => Object.entries(g.byMonth).forEach(([m, v]) => { byMonth[m] = (byMonth[m] || 0) + v }))
        return {
          key: pk, groups, byMonth,
          total_curr: groups.reduce((s, g) => s + g.total_curr, 0),
          total_prev: groups.reduce((s, g) => s + g.total_prev, 0),
        }
      })
  }, [fCurr, fPrev])

  // ── UI helpers ──────────────────────────────────────────────────────────────
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleSetItem = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setter(next)
  }

  const pctCell = (curr: number, prev: number) => {
    if (prev <= 0) return <span className="text-gray-300">—</span>
    const pct = ((curr - prev) / prev) * 100
    const up = pct > 0
    return (
      <span className={`font-semibold ${up ? "text-red-500" : "text-emerald-600"}`}>
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      </span>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">PM Cost</h1>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 tracking-wide">
              PM1 · PM2 · PM3
            </span>
          </div>
          <p className="text-xs text-gray-400">Preventive maintenance cost by PM class — {year} vs {prevYear}</p>
        </div>
        {loading && <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400 animate-pulse">Loading…</span>}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white px-5 py-4">
        <div>
          <p className="mb-1 text-[10px] font-medium text-gray-400">Start</p>
          <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-gray-400">End</p>
          <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
        </div>
        <button onClick={fetchData} disabled={loading}
          className="rounded-xl bg-gray-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40">
          Search
        </button>

        {warehouses.length > 1 && (
          <div className="ml-2">
            <p className="mb-1 text-[10px] font-medium text-gray-400">คลังสินค้า</p>
            <div className="flex flex-wrap gap-1.5">
              {warehouses.map((w) => (
                <button key={w}
                  onClick={() => toggleSetItem(selectedWarehouses, setSelectedWarehouses, w)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                    selectedWarehouses.has(w) ? "border-gray-800 bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
                  }`}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}
        {partnerFlags.length > 1 && (
          <div className="ml-2">
            <p className="mb-1 text-[10px] font-medium text-gray-400">Partner Flag</p>
            <div className="flex flex-wrap gap-1.5">
              {partnerFlags.map((f) => (
                <button key={f}
                  onClick={() => toggleSetItem(selectedPartnerFlags, setSelectedPartnerFlags, f)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                    selectedPartnerFlags.has(f) ? "border-gray-800 bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* KPI row */}
      {hasSearched && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">{year} PM Total</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatShort(totalCurr)}</p>
            <p className="mt-0.5 text-xs text-gray-400">{formatNumber(totalCurr)}</p>
          </div>
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">{prevYear} PM Total</p>
            <p className="mt-1 text-2xl font-bold text-gray-400">{formatShort(totalPrev)}</p>
            <p className="mt-0.5 text-xs text-gray-400">{formatNumber(totalPrev)}</p>
          </div>
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">YoY Change</p>
            {yoy !== null ? (
              <>
                <p className={`mt-1 text-2xl font-bold ${yoy > 0 ? "text-red-500" : "text-emerald-600"}`}>
                  {yoy > 0 ? "▲" : "▼"} {Math.abs(yoy).toFixed(1)}%
                </p>
                <p className={`mt-0.5 text-sm font-semibold ${yoy > 0 ? "text-red-400" : "text-emerald-500"}`}>
                  {yoy > 0 ? "+" : ""}{formatShort(totalCurr - totalPrev)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-lg font-bold text-gray-300">—</p>
            )}
          </div>
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">Unique Plates</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{uniquePlatesCurr.toLocaleString()}<span className="text-sm font-medium text-gray-400"> คัน</span></p>
            <p className="mt-0.5 text-xs text-gray-400">{uniquePlatesPrev.toLocaleString()} คัน ({prevYear})</p>
          </div>
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">ยังไม่ mapping</p>
            <p className={`mt-1 text-2xl font-bold ${unmappedCurr > 0 ? "text-amber-500" : "text-emerald-600"}`}>
              {unmappedCurr > 0 ? formatShort(unmappedCurr) : "✓ 0"}
            </p>
            {unmappedCurr > 0 && (
              <Link href="/pm-mapping" className="mt-0.5 inline-block text-xs font-medium text-blue-500 hover:underline">
                ไปที่ PM Mapping →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* PM class comparison tiles */}
      {hasSearched && pmComparison.length > 0 && (
        <div className="rounded-2xl border bg-white px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-gray-700">PM Class — YoY Comparison</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {pmComparison.map((row) => {
              const isUp = row.change > 0
              const maxCost = Math.max(...pmComparison.map((r) => Math.max(r.curr, r.prev)))
              const currW = maxCost > 0 ? (row.curr / maxCost) * 100 : 0
              const prevW = maxCost > 0 ? (row.prev / maxCost) * 100 : 0
              return (
                <div key={row.pm} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: PM_META[row.pm].color }} />
                    <p className="truncate text-[10px] font-semibold text-gray-500">{row.pm}</p>
                  </div>
                  <p className="mt-1 text-sm font-bold text-gray-900">{formatShort(row.curr)}</p>
                  <div className="mt-0.5 text-[10px] text-gray-400">{formatShort(row.prev)} ({prevYear})</div>
                  {row.pct !== null ? (
                    <div className={`mt-0.5 text-[10px] font-semibold ${isUp ? "text-red-500" : "text-emerald-600"}`}>
                      {isUp ? "▲" : "▼"} {Math.abs(row.pct).toFixed(1)}%
                      <span className="ml-1 font-normal opacity-80">({isUp ? "+" : "−"}{formatShort(Math.abs(row.change))})</span>
                    </div>
                  ) : <div className="mt-0.5 text-[10px] text-gray-300">—</div>}
                  <div className="mt-2 space-y-0.5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(currW, 100)}%`, background: PM_META[row.pm].color }} />
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-gray-300" style={{ width: `${Math.min(prevW, 100)}%` }} />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[9px] leading-tight text-gray-400">{PM_META[row.pm].desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Monthly grouped bar chart (style: /transaction-detail) */}
      {hasSearched && chartData.length > 0 && (() => {
        const activePms = PM_ORDER.filter((pm) => chartData.some((d) => (d[pm] as number) > 0))
        const labelColor: Record<PmKey, string> = {
          "PM1": "#2563eb", "PM2": "#d97706", "PM3": "#7c3aed", "ยังไม่ mapping": "#6b7280",
        }
        const fmtLabel = (v: any) => {
          const n = Number(v)
          if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
          if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
          return n > 0 ? String(Math.round(n)) : ""
        }
        return (
          <div className="rounded-2xl border bg-white p-5">
            <p className="mb-4 text-xs font-semibold text-gray-700">
              PM Cost รายเดือน แยกตาม PM Class — {year} (เส้นประ = {prevYear} รวม)
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} barCategoryGap="30%" barGap={4}
                margin={{ top: 20, right: 48, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                {/* Left Y: cost */}
                <YAxis
                  yAxisId="cost"
                  orientation="left"
                  tickFormatter={fmtLabel}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                {/* Right Y: plate count */}
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
                    if (String(name).endsWith("(คัน)")) return [`${value} คัน`, name]
                    const fmt = (v: number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ฿"
                    return [fmt(value), name === `${prevYear}` ? `${prevYear} รวม` : name]
                  }}
                  labelStyle={{ fontWeight: 600, fontSize: 12 }}
                  contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #e5e7eb" }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {value === `${prevYear}` ? `${prevYear} รวม` : value}
                    </span>
                  )}
                />
                {activePms.map((pm) => (
                  <Bar key={pm} yAxisId="cost" dataKey={pm} name={pm} fill={PM_META[pm].color} radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey={pm}
                      position="top"
                      style={{ fontSize: 10, fill: labelColor[pm], fontWeight: 600 }}
                      formatter={fmtLabel}
                    />
                  </Bar>
                ))}
                {activePms.map((pm) => (
                  <Line
                    key={`${pm}_plates`}
                    yAxisId="plates"
                    dataKey={`${pm}_plates`}
                    name={`${pm} (คัน)`}
                    type="monotone"
                    stroke={PM_META[pm].color}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={{ r: 3, fill: PM_META[pm].color, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
                <Line
                  yAxisId="cost"
                  dataKey={`${prevYear}`}
                  name={`${prevYear}`}
                  type="monotone"
                  stroke="#111827"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={{ r: 3, fill: "#111827", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      {/* Breakdown table: PM → กลุ่มสินค้า → รหัสสินค้า */}
      {hasSearched && breakdown.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <p className="mb-3 text-xs font-semibold text-gray-700">
            Breakdown — PM Class → กลุ่มสินค้า → รหัสสินค้า
            <span className="ml-2 font-normal text-gray-400">คลิกแถวเพื่อขยาย</span>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-[11px] text-gray-400">
                  <th className="px-2 py-2 text-left font-medium">PM / กลุ่ม / รหัสสินค้า</th>
                  {months.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-medium">{MONTH_NUM_TO_LABEL[m.split("-")[1]]}</th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold">Total {year}</th>
                  <th className="px-2 py-2 text-right font-medium">{prevYear}</th>
                  <th className="px-2 py-2 text-right font-medium">YoY</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((pm) => (
                  <React.Fragment key={pm.key}>
                    {/* PM level */}
                    <tr onClick={() => toggle(pm.key)} className="cursor-pointer border-b bg-gray-50/80 hover:bg-gray-100/70">
                      <td className="px-2 py-2.5 font-semibold text-gray-900">
                        <span className="mr-1.5 text-gray-400">{expanded.has(pm.key) ? "▾" : "▸"}</span>
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: PM_META[pm.key].color }} />
                        {pm.key}
                        <span className="ml-2 text-[10px] font-normal text-gray-400">{pm.groups.length} กลุ่ม</span>
                      </td>
                      {months.map((m) => (
                        <td key={m} className="px-2 py-2.5 text-right tabular-nums font-medium text-gray-800">
                          {pm.byMonth[m] ? formatShort(pm.byMonth[m]) : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className="px-2 py-2.5 text-right tabular-nums font-bold text-gray-900">{formatShort(pm.total_curr)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-gray-400">{formatShort(pm.total_prev)}</td>
                      <td className="px-2 py-2.5 text-right text-xs">{pctCell(pm.total_curr, pm.total_prev)}</td>
                    </tr>

                    {/* Group level */}
                    {expanded.has(pm.key) && pm.groups.map((g) => (
                      <React.Fragment key={g.key}>
                        <tr onClick={() => toggle(g.key)} className="cursor-pointer border-b hover:bg-gray-50/70">
                          <td className="py-2 pl-8 pr-2 font-medium text-gray-700">
                            <span className="mr-1.5 text-gray-300">{expanded.has(g.key) ? "▾" : "▸"}</span>
                            {g.group}
                            <span className="ml-2 text-[10px] font-normal text-gray-400">{g.items.length} รายการ</span>
                          </td>
                          {months.map((m) => (
                            <td key={m} className="px-2 py-2 text-right tabular-nums text-gray-600">
                              {g.byMonth[m] ? formatShort(g.byMonth[m]) : <span className="text-gray-200">—</span>}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-gray-800">{formatShort(g.total_curr)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-gray-400">{formatShort(g.total_prev)}</td>
                          <td className="px-2 py-2 text-right text-xs">{pctCell(g.total_curr, g.total_prev)}</td>
                        </tr>

                        {/* Item level */}
                        {expanded.has(g.key) && g.items.map((it) => (
                          <tr key={it.key} className="border-b bg-gray-50/40 last:border-b-0">
                            <td className="py-1.5 pl-14 pr-2">
                              <span className="font-mono text-[11px] text-gray-500">{it.code}</span>
                              <span className="ml-2 text-xs text-gray-600">{it.name}</span>
                              {it.qty_curr > 0 && <span className="ml-2 text-[10px] text-gray-400">qty {it.qty_curr.toLocaleString()}</span>}
                            </td>
                            {months.map((m) => (
                              <td key={m} className="px-2 py-1.5 text-right tabular-nums text-xs text-gray-500">
                                {it.byMonth[m] ? formatShort(it.byMonth[m]) : <span className="text-gray-200">—</span>}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right tabular-nums text-xs font-medium text-gray-700">{formatShort(it.total_curr)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-xs text-gray-400">{formatShort(it.total_prev)}</td>
                            <td className="px-2 py-1.5 text-right text-[11px]">{pctCell(it.total_curr, it.total_prev)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasSearched && !loading && currRows.length === 0 && (
        <div className="rounded-2xl border bg-white px-5 py-10 text-center text-sm text-gray-400">
          ไม่พบข้อมูลในช่วงเวลาที่เลือก
        </div>
      )}
    </div>
  )
}
