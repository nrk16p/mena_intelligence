"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
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

type SummaryRow = {
  month_year:   string
  warehouse:    string
  partner_flag: string
  group_value:  string
  total_cost:   number
  record_count: number
}

type DetailLine = {
  จุดประสงค์:  string
  กลุ่มสินค้า:  string
  รหัสสินค้า:   string
  ชื่อสินค้า:   string
  cost:          number
  records:       number
  sum_actual_issue?: number | null
}

type PlateDetailRow = {
  month_year:  string
  plate:       string
  wd:          string
  plate_total: number
  lines:       DetailLine[]
}

type CountsResult = {
  wd_count:      number
  plate_count:   number
  product_count: number
  total_cost:    number
  record_count:  number
}

// truck-utilize/breakdown rows — month_year format "MM-YY"
type BDRow = {
  fleet_group_id:  string | number
  month_year:      string
  truck_count:     number
  breakdown_count: number
}

const FLEET_ML = "1"
const FLEET_MS = "2"

// ── Cost Group mapping (same as /cost, incl. the เเย็น double-sara-e variant) ──

const COST_GROUP_MAP: Record<string, string> = {
  "PM น้ำมันเครื่อง":        "PM - Preventive Maintenance",
  "PM ช่วงล่าง":             "PM - Preventive Maintenance",
  "PM ความเย็น":             "PM - Preventive Maintenance",
  "PM ความเเย็น":            "PM - Preventive Maintenance",
  "ค่าใช้จ่ายอื่น ๆ":        "CM - Corrective Maintenance",
  "ซ่อม":                    "CM - Corrective Maintenance",
  "อะไหล่/วัสดุสิ้นเปลือง": "CM - Corrective Maintenance",
  "เครื่องมือส่วนตัวช่าง":   "Tools & Equipment",
  "เบิกประจำตัวช่าง":        "Tools & Equipment",
  "ยาง":                     "T - Tire",
  "ซ่อมเคสอุบัติเหตุ":       "AC - Accident Repair",
}

const getCostGroup = (p: string) => COST_GROUP_MAP[p?.trim()] ?? "Other"

const GROUP_ORDER = [
  "CM - Corrective Maintenance",
  "PM - Preventive Maintenance",
  "T - Tire",
  "AC - Accident Repair",
  "Tools & Equipment",
  "Other",
]

const GROUP_COLOR: Record<string, string> = {
  "CM - Corrective Maintenance": "#EF4444",
  "PM - Preventive Maintenance": "#10B981",
  "T - Tire":                    "#F59E0B",
  "AC - Accident Repair":        "#8B5CF6",
  "Tools & Equipment":           "#3B82F6",
  "Other":                       "#9CA3AF",
}

const GROUP_THAI: Record<string, string> = {
  "CM - Corrective Maintenance": "ซ่อมแซม/แก้ไข",
  "PM - Preventive Maintenance": "บำรุงรักษาตามระยะ",
  "T - Tire":                    "ยาง",
  "AC - Accident Repair":        "ซ่อมเคสอุบัติเหตุ",
  "Tools & Equipment":           "เครื่องมือช่าง",
  "Other":                       "อื่นๆ",
}

const MONTH_LABEL: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtShort = (v: number) => {
  const abs = Math.abs(v)
  const sign = v < 0 ? "−" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}K`
  return `${sign}${abs.toFixed(0)}`
}

const fmtNum = (v: number) =>
  Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })

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

const shiftYear = (ym: string, d: number) => `${Number(ym.split("-")[0]) + d}-${ym.split("-")[1]}`

// "YYYY-MM" → breakdown-API key "MM-YY"
const toBdKey = (ym: string) => `${ym.split("-")[1]}-${ym.split("-")[0].slice(2)}`
const daysInMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m, 0).getDate()
}

const pctOf = (curr: number, prev: number) => (prev > 0 ? ((curr - prev) / prev) * 100 : null)

const PctBadge = ({ pct, size = "text-xs" }: { pct: number | null; size?: string }) => {
  if (pct === null) return <span className={`${size} text-gray-300`}>—</span>
  const up = pct > 0
  return (
    <span className={`${size} font-bold ${up ? "text-red-500" : "text-emerald-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CostReportPage() {
  const today = new Date()
  const cy = today.getFullYear()
  const cm = String(today.getMonth() + 1).padStart(2, "0")

  const [startMonth, setStartMonth] = useState(`${cy}-01`)
  const [endMonth, setEndMonth]     = useState(`${cy}-${cm}`)

  const [sumCurr, setSumCurr]       = useState<SummaryRow[]>([])
  const [sumPrev, setSumPrev]       = useState<SummaryRow[]>([])
  const [detCurr, setDetCurr]       = useState<PlateDetailRow[]>([])
  const [detPrev, setDetPrev]       = useState<PlateDetailRow[]>([])
  const [counts, setCounts]         = useState<CountsResult | null>(null)
  const [countsPrev, setCountsPrev] = useState<CountsResult | null>(null)
  const [bdCurr, setBdCurr]         = useState<BDRow[]>([])
  const [bdPrev, setBdPrev]         = useState<BDRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [hasData, setHasData] = useState(false)

  const [selectedWh, setSelectedWh]     = useState<Set<string>>(new Set())
  const [selectedFlag, setSelectedFlag] = useState<Set<string>>(new Set())

  const year = Number(startMonth.split("-")[0])
  const prevYear = year - 1

  // shared by counts + detail — both APIs accept comma-separated warehouse / partner_flag
  const countsParams = (s: string, e: string) => {
    const p = new URLSearchParams({ start: s, end: e })
    if (selectedWh.size > 0)   p.set("warehouse", [...selectedWh].join(","))
    if (selectedFlag.size > 0) p.set("partner_flag", [...selectedFlag].join(","))
    return p.toString()
  }

  // breakdown follows the partner-flag chips only (MySQL has no warehouse dimension)
  const bdParams = (s: string, e: string) => {
    const p = new URLSearchParams({ start: s, end: e })
    if (selectedFlag.size > 0) p.set("partner_flag", [...selectedFlag].join(","))
    return p.toString()
  }

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const gp = encodeURIComponent("จุดประสงค์ในการเบิก")
      const pS = shiftYear(startMonth, -1), pE = shiftYear(endMonth, -1)
      const [s1, s2, d1, d2, c1, c2, b1, b2] = await Promise.all([
        fetch(`/api/cost/summary?group_by=${gp}&start=${startMonth}&end=${endMonth}`, { cache: "no-store" }),
        fetch(`/api/cost/summary?group_by=${gp}&start=${pS}&end=${pE}`, { cache: "no-store" }),
        fetch(`/api/cost/detail?${countsParams(startMonth, endMonth)}`, { cache: "no-store" }),
        fetch(`/api/cost/detail?${countsParams(pS, pE)}`, { cache: "no-store" }),
        fetch(`/api/cost/counts?${countsParams(startMonth, endMonth)}`, { cache: "no-store" }),
        fetch(`/api/cost/counts?${countsParams(pS, pE)}`, { cache: "no-store" }),
        fetch(`/api/truck-utilize/breakdown?${bdParams(toBdKey(startMonth), toBdKey(endMonth))}`, { cache: "no-store" }),
        fetch(`/api/truck-utilize/breakdown?${bdParams(toBdKey(pS), toBdKey(pE))}`, { cache: "no-store" }),
      ])
      const [j1, j2, j3, j4, j5, j6, j7, j8] = await Promise.all([s1.json(), s2.json(), d1.json(), d2.json(), c1.json(), c2.json(), b1.json(), b2.json()])
      if (!j1.success) throw new Error(j1.error || "summary failed")
      setSumCurr(j1.data); setSumPrev(j2.success ? j2.data : [])
      setDetCurr(j3.success ? j3.data : []); setDetPrev(j4.success ? j4.data : [])
      setCounts(j5.success ? j5.data : null); setCountsPrev(j6.success ? j6.data : null)
      setBdCurr(j7.success ? j7.data : []); setBdPrev(j8.success ? j8.data : [])
      setHasData(true)
    } catch (e: any) {
      setError(e.message || "Load failed")
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  // counts + detail are aggregated server-side → refetch when chip filters change
  useEffect(() => {
    if (!hasData) return
    const pS = shiftYear(startMonth, -1), pE = shiftYear(endMonth, -1)
    ;(async () => {
      try {
        const [c1, c2, d1, d2, b1, b2] = await Promise.all([
          fetch(`/api/cost/counts?${countsParams(startMonth, endMonth)}`, { cache: "no-store" }),
          fetch(`/api/cost/counts?${countsParams(pS, pE)}`, { cache: "no-store" }),
          fetch(`/api/cost/detail?${countsParams(startMonth, endMonth)}`, { cache: "no-store" }),
          fetch(`/api/cost/detail?${countsParams(pS, pE)}`, { cache: "no-store" }),
          fetch(`/api/truck-utilize/breakdown?${bdParams(toBdKey(startMonth), toBdKey(endMonth))}`, { cache: "no-store" }),
          fetch(`/api/truck-utilize/breakdown?${bdParams(toBdKey(pS), toBdKey(pE))}`, { cache: "no-store" }),
        ])
        const [j1, j2, j3, j4, j5, j6] = await Promise.all([c1.json(), c2.json(), d1.json(), d2.json(), b1.json(), b2.json()])
        if (j1.success) setCounts(j1.data)
        if (j2.success) setCountsPrev(j2.data)
        if (j3.success) setDetCurr(j3.data)
        if (j4.success) setDetPrev(j4.data)
        if (j5.success) setBdCurr(j5.data)
        if (j6.success) setBdPrev(j6.data)
      } catch { /* keep previous data on transient failure */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWh, selectedFlag])

  // ── Filters ─────────────────────────────────────────────────────────────────
  const warehouses = useMemo(
    () => Array.from(new Set(sumCurr.map((r) => r.warehouse || "ไม่ระบุ"))).sort(),
    [sumCurr]
  )
  const flags = useMemo(
    () => Array.from(new Set(sumCurr.map((r) => r.partner_flag || "ไม่ระบุ"))).sort(),
    [sumCurr]
  )

  const filterSum = (rows: SummaryRow[]) => rows.filter((r) => {
    if (selectedWh.size > 0 && !selectedWh.has(r.warehouse || "ไม่ระบุ")) return false
    if (selectedFlag.size > 0 && !selectedFlag.has(r.partner_flag || "ไม่ระบุ")) return false
    return true
  })
  // detail rows are filtered server-side (warehouse/partner_flag passed on fetch),
  // so detail-driven slides (workshop split, top items) follow the chips too

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fCurr = useMemo(() => filterSum(sumCurr), [sumCurr, selectedWh, selectedFlag])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fPrev = useMemo(() => filterSum(sumPrev), [sumPrev, selectedWh, selectedFlag])

  const months = useMemo(() => getMonthsInRange(startMonth, endMonth), [startMonth, endMonth])

  // ── Overview aggregates ─────────────────────────────────────────────────────
  const totalCurr = useMemo(() => fCurr.reduce((s, r) => s + r.total_cost, 0), [fCurr])
  const totalPrev = useMemo(() => fPrev.reduce((s, r) => s + r.total_cost, 0), [fPrev])

  type GroupAgg = {
    group: string; curr: number; prev: number
    byMonth: Record<string, number>; byMonthPrev: Record<string, number>
  }
  const groupAggs = useMemo<GroupAgg[]>(() => {
    const m = new Map<string, GroupAgg>()
    const ensure = (g: string) => {
      if (!m.has(g)) m.set(g, { group: g, curr: 0, prev: 0, byMonth: {}, byMonthPrev: {} })
      return m.get(g)!
    }
    fCurr.forEach((r) => {
      const e = ensure(getCostGroup(r.group_value))
      e.curr += r.total_cost
      e.byMonth[r.month_year] = (e.byMonth[r.month_year] || 0) + r.total_cost
    })
    fPrev.forEach((r) => {
      const e = ensure(getCostGroup(r.group_value))
      e.prev += r.total_cost
      const aligned = shiftYear(r.month_year, 1)
      e.byMonthPrev[aligned] = (e.byMonthPrev[aligned] || 0) + r.total_cost
    })
    return GROUP_ORDER.filter((g) => m.has(g)).map((g) => m.get(g)!)
      .sort((a, b) => b.curr - a.curr)
  }, [fCurr, fPrev])

  // Chart shows only the top 3 groups; the rest collapse into "อื่นๆ" so the
  // stack stays readable. The comparison table keeps all groups.
  const CHART_SHORT: Record<string, string> = {
    "CM - Corrective Maintenance": "CM ซ่อมแซม",
    "PM - Preventive Maintenance": "PM บำรุงรักษา",
    "T - Tire":                    "ยาง",
    "AC - Accident Repair":        "อุบัติเหตุ",
    "Tools & Equipment":           "เครื่องมือ",
    "Other":                       "อื่นๆ",
  }

  const chartSeries = useMemo(() => {
    // PM is always its own series (the deck's focus), plus the top groups by
    // cost; everything else folds into "อื่นๆ"
    const topKeys = new Set(groupAggs.slice(0, 3).map((g) => g.group))
    groupAggs.forEach((g) => { if (g.group.startsWith("PM")) topKeys.add(g.group) })
    const top = groupAggs.filter((g) => topKeys.has(g.group))
    const rest = groupAggs.filter((g) => !topKeys.has(g.group))
    return {
      top,
      rest,
      restLabel: rest.length ? "อื่นๆ" : null,
      restNote:  rest.length ? rest.map((g) => CHART_SHORT[g.group] ?? g.group).join(" + ") : null,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupAggs])

  const overviewChart = useMemo(() => months.map((my) => {
    const row: Record<string, number | string> = { month: MONTH_LABEL[my.split("-")[1]] ?? my }
    let total = 0, prevTotal = 0
    chartSeries.top.forEach((g) => {
      const v = g.byMonth[my] || 0
      row[CHART_SHORT[g.group] ?? g.group] = v
      total += v
    })
    if (chartSeries.restLabel) {
      const v = chartSeries.rest.reduce((s, g) => s + (g.byMonth[my] || 0), 0)
      row[chartSeries.restLabel] = v
      total += v
    }
    groupAggs.forEach((g) => { prevTotal += g.byMonthPrev[my] || 0 })
    row.total = total
    row[`รวม ${prevYear}`] = prevTotal
    return row
  }), [months, groupAggs, chartSeries, prevYear])

  // ── Detail breakdown per cost group (from /api/cost/detail lines) ───────────
  type ItemAgg = { code: string; name: string; pg: string; curr: number; prev: number; qty: number }
  type PgAgg   = { pg: string; curr: number; prev: number; items: ItemAgg[] }

  const detailByGroup = useMemo(() => {
    const items = new Map<string, Map<string, ItemAgg>>()   // group → itemKey → agg
    const walk = (rows: PlateDetailRow[], side: "curr" | "prev") => {
      rows.forEach((r) => r.lines?.forEach((l) => {
        const g = getCostGroup(l.จุดประสงค์)
        if (!items.has(g)) items.set(g, new Map())
        const key = `${l.กลุ่มสินค้า}|${l.รหัสสินค้า}`
        const im = items.get(g)!
        if (!im.has(key)) im.set(key, { code: l.รหัสสินค้า, name: l.ชื่อสินค้า, pg: l.กลุ่มสินค้า || "ไม่ระบุ", curr: 0, prev: 0, qty: 0 })
        const e = im.get(key)!
        e[side] += l.cost
        if (side === "curr") e.qty += Number(l.sum_actual_issue) || 0
      }))
    }
    walk(detCurr, "curr")
    walk(detPrev, "prev")

    const out = new Map<string, { pgs: PgAgg[]; items: ItemAgg[] }>()
    items.forEach((im, g) => {
      const all = Array.from(im.values())
      const pgMap = new Map<string, PgAgg>()
      all.forEach((it) => {
        if (!pgMap.has(it.pg)) pgMap.set(it.pg, { pg: it.pg, curr: 0, prev: 0, items: [] })
        const p = pgMap.get(it.pg)!
        p.curr += it.curr
        p.prev += it.prev
        p.items.push(it)
      })
      out.set(g, {
        pgs: Array.from(pgMap.values()).sort((a, b) => b.curr - a.curr),
        items: all.sort((a, b) => b.curr - a.curr),
      })
    })
    return out
  }, [detCurr, detPrev])

  // ── Auto takeaways (overview) ───────────────────────────────────────────────
  const takeaways = useMemo(() => {
    const out: string[] = []
    const yoy = pctOf(totalCurr, totalPrev)
    if (yoy !== null) {
      out.push(`ค่าใช้จ่ายรวม ${fmtShort(totalCurr)} บาท ${yoy > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(yoy).toFixed(1)}% เทียบปี ${prevYear} (${yoy > 0 ? "+" : "−"}${fmtShort(Math.abs(totalCurr - totalPrev))})`)
    }
    const withPct = groupAggs
      .map((g) => ({ ...g, pct: pctOf(g.curr, g.prev) }))
      .filter((g) => g.pct !== null && g.prev > 50_000)
    const worst = [...withPct].sort((a, b) => (b.pct! - a.pct!))[0]
    const best  = [...withPct].sort((a, b) => (a.pct! - b.pct!))[0]
    if (worst && worst.pct! > 0)
      out.push(`${worst.group} เพิ่มขึ้นมากที่สุด ${worst.pct!.toFixed(1)}% (${fmtShort(worst.prev)} → ${fmtShort(worst.curr)})`)
    if (best && best.pct! < 0)
      out.push(`${best.group} ลดลงมากที่สุด ${Math.abs(best.pct!).toFixed(1)}% (${fmtShort(best.prev)} → ${fmtShort(best.curr)})`)
    const top = groupAggs[0]
    if (top && totalCurr > 0)
      out.push(`${top.group} เป็นสัดส่วนใหญ่ที่สุด ${(top.curr / totalCurr * 100).toFixed(0)}% ของค่าใช้จ่ายทั้งหมด`)
    return out
  }, [groupAggs, totalCurr, totalPrev, prevYear])

  // ── Breakdown rate (ML / MS fleets, same math as /fleet-report) ─────────────
  type BdMonthRow = { my: string; pCurr: number | null; pPrev: number | null; yoy: number | null; nCurr: number | null; nPrev: number | null }
  const bdFleets = useMemo(() => {
    const calc = (fleet: string) => {
      const find = (data: BDRow[], key: string) =>
        data.find((r) => String(r.fleet_group_id) === fleet && r.month_year === key)
      const rows: BdMonthRow[] = months.map((my) => {
        const pm = shiftYear(my, -1)
        const rc = find(bdCurr, toBdKey(my))
        const rp = find(bdPrev, toBdKey(pm))
        const pCurr = rc && Number(rc.truck_count) > 0
          ? (Number(rc.breakdown_count) / (Number(rc.truck_count) * daysInMonth(my))) * 100 : null
        const pPrev = rp && Number(rp.truck_count) > 0
          ? (Number(rp.breakdown_count) / (Number(rp.truck_count) * daysInMonth(pm))) * 100 : null
        return {
          my, pCurr, pPrev,
          yoy: pCurr !== null && pPrev !== null && pPrev > 0 ? ((pCurr - pPrev) / pPrev) * 100 : null,
          nCurr: rc ? Number(rc.breakdown_count) / daysInMonth(my) : null,
          nPrev: rp ? Number(rp.breakdown_count) / daysInMonth(pm) : null,
        }
      })
      const withP = rows.filter((r) => r.pCurr !== null)
      return {
        rows,
        best:  withP.length ? withP.reduce((b, r) => (r.pCurr! < b.pCurr! ? r : b)) : null,
        worst: withP.length ? withP.reduce((w, r) => (r.pCurr! > w.pCurr! ? r : w)) : null,
        trucks: months.map((my) => Number(find(bdCurr, toBdKey(my))?.truck_count ?? 0)).find((n) => n > 0) ?? null,
      }
    }
    return [
      { key: "ML", name: "ML · Mixer Large", ...calc(FLEET_ML) },
      { key: "MS", name: "MS · Mixer Small", ...calc(FLEET_MS) },
    ]
  }, [bdCurr, bdPrev, months])

  const hasBd = bdFleets.some((f) => f.rows.some((r) => r.pCurr !== null))
  const bdPctColor = (p: number | null) =>
    p === null ? "text-gray-300" : p >= 10 ? "text-red-500" : p >= 5 ? "text-amber-600" : "text-emerald-700"

  const BD_FLEET_COLOR: Record<string, string> = { ML: "#0ea5e9", MS: "#f97316" }

  const bdChart = useMemo(() => months.map((my) => {
    const row: Record<string, number | string | null> = { month: MONTH_LABEL[my.split("-")[1]] ?? my }
    bdFleets.forEach((f) => {
      const r = f.rows.find((x) => x.my === my)
      row[f.key] = r?.pCurr ?? null
      row[`${f.key} ${prevYear}`] = r?.pPrev ?? null
    })
    return row
  }), [months, bdFleets, prevYear])

  const bdInsights = useMemo(() => {
    const out: string[] = []
    const avgOf = (vals: (number | null)[]) => {
      const v = vals.filter((x): x is number => x !== null)
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
    }
    bdFleets.forEach((f) => {
      const withP = f.rows.filter((r) => r.pCurr !== null)
      if (!withP.length) return
      const avgCurr = avgOf(withP.map((r) => r.pCurr))!
      const avgYoy  = avgOf(withP.map((r) => r.yoy))
      let line = `${f.key} เฉลี่ย ${avgCurr.toFixed(2)}%`
      if (avgYoy !== null) line += ` — ${avgYoy > 0 ? "แย่กว่า" : "ดีกว่า"}ปีก่อนเฉลี่ย ${avgYoy > 0 ? "+" : ""}${avgYoy.toFixed(0)}%`
      const worseMonths = withP.filter((r) => r.yoy !== null && r.yoy > 0).length
      const yoyMonths   = withP.filter((r) => r.yoy !== null).length
      if (yoyMonths > 0 && worseMonths === yoyMonths) line += ` (แย่กว่าปีก่อนทุกเดือน)`
      out.push(line)
      if (f.best && f.worst && f.best.my !== f.worst.my) {
        out.push(`${f.key}: แย่สุด ${MONTH_LABEL[f.worst.my.split("-")[1]]} ${f.worst.pCurr!.toFixed(2)}% · ดีสุด ${MONTH_LABEL[f.best.my.split("-")[1]]} ${f.best.pCurr!.toFixed(2)}%`)
      }
      const first = withP[0], last = withP[withP.length - 1]
      if (withP.length >= 3 && first.my !== last.my) {
        const trendPct = ((last.pCurr! - first.pCurr!) / first.pCurr!) * 100
        if (Math.abs(trendPct) >= 10) {
          out.push(`${f.key}: แนวโน้ม${trendPct < 0 ? "ดีขึ้น" : "แย่ลง"}จากต้นช่วง ${MONTH_LABEL[first.my.split("-")[1]]} ${first.pCurr!.toFixed(2)}% → ${MONTH_LABEL[last.my.split("-")[1]]} ${last.pCurr!.toFixed(2)}%`)
        }
      }
    })
    return out
  }, [bdFleets])

  // ── Workshop split: อู่ใน vs อู่นอก (from /api/cost/detail rows) ────────────
  // อู่นอก = คัน-เดือนที่มีรายการ "ค่าแรง" (จ้างซ่อมภายนอก) — same rule as /transaction-detail
  type WsMonth = { nai: number; nok: number; naiPlates: number; nokPlates: number }
  type WsSide = { nai: number; nok: number; naiPlates: number; nokPlates: number; byMonth: Record<string, WsMonth> }
  const wsAgg = useMemo(() => {
    const isOutsideRow = (r: PlateDetailRow) =>
      (r.lines || []).some((l) => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
    const agg = (rows: PlateDetailRow[], align: boolean): WsSide => {
      const byMonthSets: Record<string, { nai: number; nok: number; naiP: Set<string>; nokP: Set<string> }> = {}
      let nai = 0, nok = 0
      const naiP = new Set<string>(), nokP = new Set<string>()
      rows.forEach((r) => {
        const my = align ? shiftYear(r.month_year, 1) : r.month_year
        if (!byMonthSets[my]) byMonthSets[my] = { nai: 0, nok: 0, naiP: new Set(), nokP: new Set() }
        const e = byMonthSets[my]
        if (isOutsideRow(r)) { e.nok += r.plate_total; e.nokP.add(r.plate); nok += r.plate_total; nokP.add(r.plate) }
        else                 { e.nai += r.plate_total; e.naiP.add(r.plate); nai += r.plate_total; naiP.add(r.plate) }
      })
      const byMonth: Record<string, WsMonth> = {}
      Object.entries(byMonthSets).forEach(([my, e]) => {
        byMonth[my] = { nai: e.nai, nok: e.nok, naiPlates: e.naiP.size, nokPlates: e.nokP.size }
      })
      return { nai, nok, naiPlates: naiP.size, nokPlates: nokP.size, byMonth }
    }
    return { curr: agg(detCurr, false), prev: agg(detPrev, true) }
  }, [detCurr, detPrev])

  const hasWs = detCurr.length > 0
  const wsNaiAvg = wsAgg.curr.naiPlates > 0 ? wsAgg.curr.nai / wsAgg.curr.naiPlates : 0
  const wsNokAvg = wsAgg.curr.nokPlates > 0 ? wsAgg.curr.nok / wsAgg.curr.nokPlates : 0
  const wsTotal  = wsAgg.curr.nai + wsAgg.curr.nok
  const wsTotalPrev = wsAgg.prev.nai + wsAgg.prev.nok
  const wsShare  = wsTotal > 0 ? (wsAgg.curr.nok / wsTotal) * 100 : 0
  const wsSharePrev = wsTotalPrev > 0 ? (wsAgg.prev.nok / wsTotalPrev) * 100 : null

  const wsChart = useMemo(() => months.map((my) => ({
    month:  MONTH_LABEL[my.split("-")[1]] ?? my,
    auNai:  wsAgg.curr.byMonth[my]?.nai ?? 0,
    auNok:  wsAgg.curr.byMonth[my]?.nok ?? 0,
    prevNai: wsAgg.prev.byMonth[my]?.nai ?? 0,
    prevNok: wsAgg.prev.byMonth[my]?.nok ?? 0,
    naiPlates: wsAgg.curr.byMonth[my]?.naiPlates ?? 0,
    nokPlates: wsAgg.curr.byMonth[my]?.nokPlates ?? 0,
  })), [months, wsAgg])

  const wsMonthly = useMemo(() => months.map((my) => {
    const c = wsAgg.curr.byMonth[my] ?? { nai: 0, nok: 0, naiPlates: 0, nokPlates: 0 }
    const p = wsAgg.prev.byMonth[my] ?? { nai: 0, nok: 0, naiPlates: 0, nokPlates: 0 }
    const tot  = c.nai + c.nok
    const totP = p.nai + p.nok
    return {
      my,
      label: MONTH_LABEL[my.split("-")[1]] ?? my,
      ...c,
      share:     tot  > 0 ? (c.nok / tot)  * 100 : null,
      sharePrev: totP > 0 ? (p.nok / totP) * 100 : null,
    }
  }), [months, wsAgg])

  const wsTakeaways = useMemo(() => {
    const out: string[] = []
    const { curr, prev } = wsAgg
    if (wsTotal > 0)
      out.push(`อู่นอกคิดเป็น ${wsShare.toFixed(0)}% ของค่าซ่อมทั้งหมด${wsSharePrev !== null ? ` (ปี ${prevYear}: ${wsSharePrev.toFixed(0)}%)` : ""}`)
    if (wsNaiAvg > 0 && wsNokAvg > 0)
      out.push(`เฉลี่ยต่อคัน: อู่นอก ฿${fmtNum(wsNokAvg)} vs อู่ใน ฿${fmtNum(wsNaiAvg)} (${wsNokAvg >= wsNaiAvg ? "แพงกว่า +" : "ถูกกว่า −"}${Math.abs(((wsNokAvg - wsNaiAvg) / wsNaiAvg) * 100).toFixed(0)}%)`)
    const yoyNok = pctOf(curr.nok, prev.nok)
    if (yoyNok !== null)
      out.push(`ค่าซ่อมอู่นอก ${yoyNok > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(yoyNok).toFixed(1)}% เทียบปี ${prevYear} (${fmtShort(prev.nok)} → ${fmtShort(curr.nok)})`)
    const yoyNai = pctOf(curr.nai, prev.nai)
    if (yoyNai !== null)
      out.push(`ค่าซ่อมอู่ใน ${yoyNai > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(yoyNai).toFixed(1)}% เทียบปี ${prevYear} (${fmtShort(prev.nai)} → ${fmtShort(curr.nai)})`)
    const peak = months
      .map((my) => ({ my, v: curr.byMonth[my]?.nok ?? 0 }))
      .sort((a, b) => b.v - a.v)[0]
    if (peak && peak.v > 0)
      out.push(`อู่นอกสูงสุดเดือน ${MONTH_LABEL[peak.my.split("-")[1]]} (${fmtShort(peak.v)})`)
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsAgg, months, prevYear])

  const periodLabel = `${MONTH_LABEL[startMonth.split("-")[1]]} – ${MONTH_LABEL[endMonth.split("-")[1]]} ${year}`
  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setter(next)
  }

  const fmtLabel = (v: any) => {
    const n = Number(v)
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
    return n > 0 ? String(Math.round(n)) : ""
  }

  // ── Save slide as PNG (full slide, 2x resolution) ───────────────────────────
  const slideRefs = useRef<Record<string, HTMLElement | null>>({})
  const setSlideRef = (key: string) => (el: HTMLElement | null) => { slideRefs.current[key] = el }
  const [savingPng, setSavingPng] = useState<string | null>(null)

  const savePng = async (key: string, name: string) => {
    const el = slideRefs.current[key]
    if (!el) return
    setSavingPng(key)
    try {
      const { toBlob } = await import("html-to-image")
      const opts = {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        // slides use system fonts — skip web-font embedding, which throws a
        // CORS SecurityError on the Google Fonts stylesheet and slows capture
        skipFonts: true,
        // keep the PNG button itself out of the capture
        filter: (node: Node) => !(node instanceof HTMLElement && node.dataset.noExport !== undefined),
      }
      // WebKit/Safari: first capture can come back blank — warm up, then capture
      await toBlob(el, opts)
      const blob = await toBlob(el, opts)
      if (!blob) throw new Error("capture returned empty image")
      // blob + object URL downloads reliably across Chrome/Safari/Firefox
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.download = `${name}.png`
      a.href = url
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      console.error("save png failed", e)
    } finally {
      setSavingPng(null)
    }
  }

  const PngButton = ({ slideKey, name }: { slideKey: string; name: string }) => (
    <button
      data-no-export
      onClick={() => savePng(slideKey, name)}
      disabled={savingPng !== null}
      title="บันทึกสไลด์นี้เป็นรูป PNG"
      className="print:hidden inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-500 transition hover:border-gray-400 hover:text-gray-800 disabled:opacity-40"
    >
      {savingPng === slideKey ? "กำลังบันทึก…" : "⬇ PNG"}
    </button>
  )

  // active-filter tags shown on every slide (visible in PDF export too)
  const hasFilters = selectedWh.size > 0 || selectedFlag.size > 0
  const FilterTags = ({ note }: { note?: string }) => {
    if (!hasFilters) return null
    return (
      <div className="flex max-w-[260px] flex-wrap justify-end gap-1">
        {[...selectedWh].map((w) => (
          <span key={w} className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{w}</span>
        ))}
        {[...selectedFlag].map((f) => (
          <span key={f} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">{f}</span>
        ))}
        {note && <p className="w-full text-right text-[9px] text-amber-500">{note}</p>}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f0f0f0] p-6 print:bg-white print:p-0">

      {/* Controls (hidden in print) */}
      <div className="print:hidden mx-auto mb-5 max-w-[1400px] rounded-2xl border bg-white p-4">
        {/* Row 1: title + date range + actions */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-base font-semibold text-gray-700">MM Report — by Cost Group</h1>
            <p className="mt-0.5 text-[11px] text-gray-400">เลือกช่วงเดือนและ filter แล้วกด Generate</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium text-gray-400">Start</p>
            <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)}
              className="rounded-xl border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium text-gray-400">End</p>
            <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)}
              className="rounded-xl border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
          </div>
          <button onClick={fetchAll} disabled={loading}
            className="rounded-xl bg-gray-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-40">
            {loading ? "Loading…" : "Generate"}
          </button>
          <button onClick={() => window.print()}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            🖨 Export PDF
          </button>
        </div>

        {/* Row 2: warehouse chips */}
        {warehouses.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3">
            <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400">คลังสินค้า</span>
            {warehouses.map((w) => (
              <button key={w} onClick={() => toggleSet(selectedWh, setSelectedWh, w)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  selectedWh.has(w) ? "border-gray-800 bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                }`}>{w}</button>
            ))}
            {selectedWh.size > 0 && (
              <button onClick={() => setSelectedWh(new Set())}
                className="ml-1 text-[11px] text-gray-400 underline hover:text-gray-600">
                clear
              </button>
            )}
          </div>
        )}

        {/* Row 3: partner flag chips */}
        {flags.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
            <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Partner Flag</span>
            {flags.map((f) => (
              <button key={f} onClick={() => toggleSet(selectedFlag, setSelectedFlag, f)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  selectedFlag.has(f) ? "border-gray-800 bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                }`}>{f}</button>
            ))}
            {selectedFlag.size > 0 && (
              <button onClick={() => setSelectedFlag(new Set())}
                className="ml-1 text-[11px] text-gray-400 underline hover:text-gray-600">
                clear
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="print:hidden mx-auto mb-4 max-w-[1400px] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {hasData && (
        <div className="mx-auto max-w-[1400px] space-y-6">

          {/* ══ SLIDE 1: Executive Overview ══════════════════════════════════ */}
          <section ref={setSlideRef("overview")} className="slide rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
            <div className="mb-4 flex items-start justify-between border-b pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600">Mena Transport — Manager Meeting</p>
                <h2 className="mt-1 text-2xl font-bold text-gray-900">MM Report — Maintenance Cost by Cost Group</h2>
                <p className="mt-0.5 text-sm text-gray-400">{periodLabel} เทียบกับ {prevYear}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-300">Slide 1 — Executive Overview</p>
                  <PngButton slideKey="overview" name={`mm-report-1-overview-${year}`} />
                </div>
                <FilterTags />
              </div>
            </div>

            {/* KPI row */}
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-2xl border px-5 py-4">
                <p className="text-xs text-gray-400">{year} Total Cost</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{fmtShort(totalCurr)}</p>
                <p className="mt-0.5 text-xs text-gray-400">฿{fmtNum(totalCurr)}</p>
              </div>
              <div className="rounded-2xl border px-5 py-4">
                <p className="text-xs text-gray-400">{prevYear} Total Cost</p>
                <p className="mt-1 text-3xl font-bold text-gray-400">{fmtShort(totalPrev)}</p>
                <p className="mt-0.5 text-xs text-gray-400">฿{fmtNum(totalPrev)}</p>
              </div>
              <div className="rounded-2xl border px-5 py-4">
                <p className="text-xs text-gray-400">YoY Change</p>
                <p className="mt-1 text-2xl font-bold"><PctBadge pct={pctOf(totalCurr, totalPrev)} size="text-2xl" /></p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {totalPrev > 0 ? `${totalCurr - totalPrev >= 0 ? "+" : "−"}฿${fmtNum(Math.abs(totalCurr - totalPrev))}` : "—"}
                </p>
              </div>
              <div className="rounded-2xl border px-5 py-4">
                <p className="text-xs text-gray-400">Fleet ({year})</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{counts?.plate_count ?? "—"}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  คัน{counts && counts.plate_count > 0 ? ` · เฉลี่ย ฿${fmtNum(totalCurr / counts.plate_count)}/คัน` : ""}
                  {countsPrev && countsPrev.plate_count > 0 ? ` (${prevYear}: ฿${fmtNum(totalPrev / countsPrev.plate_count)})` : ""}
                </p>
                <p className="mt-1.5 border-t pt-1.5 text-[9px] leading-snug text-gray-400">
                  นับเฉพาะรถที่มีค่าซ่อม/เบิกอะไหล่ในช่วงที่เลือก · เฉลี่ย/คัน = ค่าใช้จ่ายรวม ÷ จำนวนคัน
                  (ปี {prevYear} ใช้จำนวนคันของปีนั้นเอง)
                </p>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-5">
              {/* Monthly stacked chart — top 3 groups + อื่นๆ, total labeled on top */}
              <div className="lg:col-span-3">
                <p className="mb-2 text-xs font-semibold text-gray-700">
                  ค่าใช้จ่ายรายเดือน แยกตาม Cost Group
                  <span className="ml-2 font-normal text-gray-400">ตัวเลขบนแท่ง = รวมทั้งเดือน · เส้นประ = รวม {prevYear}</span>
                </p>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={overviewChart} barCategoryGap="28%" margin={{ top: 22, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtLabel} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={46} />
                    <Tooltip
                      formatter={(v: any, n: any) => [`฿${fmtNum(Number(v))}`, n]}
                      labelStyle={{ fontWeight: 600, fontSize: 12 }}
                      contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }}
                    />
                    <Legend formatter={(v) => <span style={{ fontSize: 11, color: "#6b7280" }}>{v}</span>} />
                    {chartSeries.top.map((g, i) => {
                      const isLast = !chartSeries.restLabel && i === chartSeries.top.length - 1
                      return (
                        <Bar key={g.group} dataKey={CHART_SHORT[g.group] ?? g.group} stackId="cg"
                          fill={GROUP_COLOR[g.group]} radius={isLast ? [4, 4, 0, 0] : 0}>
                          {isLast && (
                            <LabelList dataKey="total" position="top"
                              style={{ fontSize: 11, fill: "#111827", fontWeight: 700 }} formatter={fmtLabel} />
                          )}
                        </Bar>
                      )
                    })}
                    {chartSeries.restLabel && (
                      <Bar dataKey={chartSeries.restLabel} stackId="cg" fill="#cbd5e1" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="total" position="top"
                          style={{ fontSize: 11, fill: "#111827", fontWeight: 700 }} formatter={fmtLabel} />
                      </Bar>
                    )}
                    <Line dataKey={`รวม ${prevYear}`} type="monotone" stroke="#111827" strokeWidth={2}
                      strokeDasharray="4 3" dot={{ r: 3, fill: "#111827", strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
                {chartSeries.restNote && (
                  <p className="mt-1 text-[10px] text-gray-400">อื่นๆ = {chartSeries.restNote} (ดูรายละเอียดครบทุกกลุ่มในตารางขวา)</p>
                )}
              </div>

              {/* Comparison table + takeaways */}
              <div className="lg:col-span-2">
                <p className="mb-2 text-xs font-semibold text-gray-700">Cost Group — YoY</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-[10px] text-gray-400">
                      <th className="py-1.5 pr-1 font-medium">Group</th>
                      <th className="py-1.5 pr-1 text-right font-medium">{year}</th>
                      <th className="py-1.5 pr-1 text-right font-medium">{prevYear}</th>
                      <th className="py-1.5 pr-1 text-right font-medium">%YoY</th>
                      <th className="py-1.5 text-right font-medium">สัดส่วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupAggs.map((g) => (
                      <tr key={g.group} className="border-b last:border-b-0">
                        <td className="py-1.5 pr-1">
                          <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[g.group] }} />
                          <span className="font-medium text-gray-700">{g.group.split(" - ")[0]}</span>
                          <span className="ml-1 text-[9px] text-gray-400">{GROUP_THAI[g.group]}</span>
                        </td>
                        <td className="py-1.5 pr-1 text-right tabular-nums font-semibold text-gray-800">{fmtShort(g.curr)}</td>
                        <td className="py-1.5 pr-1 text-right tabular-nums text-gray-400">{fmtShort(g.prev)}</td>
                        <td className="py-1.5 pr-1 text-right"><PctBadge pct={pctOf(g.curr, g.prev)} size="text-[10px]" /></td>
                        <td className="py-1.5 text-right tabular-nums text-gray-500">
                          {totalCurr > 0 ? `${(g.curr / totalCurr * 100).toFixed(0)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 rounded-xl bg-gray-50 p-3">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Key Takeaways</p>
                  <ul className="space-y-1">
                    {takeaways.map((t, i) => (
                      <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-gray-600">
                        <span className="text-emerald-500">•</span>{t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* ══ SLIDE 2: Breakdown Rate (ML / MS) ═════════════════════════════ */}
          {hasBd && (
            <section ref={setSlideRef("breakdown")} className="slide rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
              <div className="mb-4 flex items-start justify-between border-b pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600">Fleet Reliability</p>
                  <h2 className="mt-1 text-2xl font-bold text-gray-900">Breakdown Rate</h2>
                  <p className="mt-0.5 text-sm text-gray-400">
                    {periodLabel} เทียบกับ {prevYear} · % = จำนวน breakdown ÷ (จำนวนรถ × วันในเดือน) · ตัวเลขเล็ก = ครั้ง/วัน
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-300">Slide 2 — Breakdown Rate</p>
                    <PngButton slideKey="breakdown" name={`mm-report-2-breakdown-${year}`} />
                  </div>
                  <FilterTags note="* Breakdown Rate ตาม filter รถมีนา/รถร่วม — ไม่ตามคลัง (ข้อมูลรถไม่มีมิติคลัง)" />
                </div>
              </div>

              {/* Trend chart + insights */}
              <div className="mb-5 grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <p className="mb-2 text-xs font-semibold text-gray-700">Breakdown Rate รายเดือน — {year} (เส้นทึบ) vs {prevYear} (เส้นประ)</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={bdChart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip
                        formatter={(v: any, n: any) => [v !== null ? `${Number(v).toFixed(2)}%` : "—", n]}
                        labelStyle={{ fontWeight: 600, fontSize: 12 }}
                        contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }}
                      />
                      <Legend formatter={(v) => <span style={{ fontSize: 10, color: "#6b7280" }}>{v}</span>} />
                      {bdFleets.map((f) => (
                        <React.Fragment key={f.key}>
                          <Line dataKey={f.key} name={`${f.key} ${year}`} type="monotone" connectNulls
                            stroke={BD_FLEET_COLOR[f.key]} strokeWidth={2.5}
                            dot={{ r: 3.5, fill: BD_FLEET_COLOR[f.key], strokeWidth: 0 }} activeDot={{ r: 5 }} />
                          <Line dataKey={`${f.key} ${prevYear}`} name={`${f.key} ${prevYear}`} type="monotone" connectNulls
                            stroke={BD_FLEET_COLOR[f.key]} strokeWidth={1.5} strokeDasharray="5 4" strokeOpacity={0.45}
                            dot={{ r: 2, fill: BD_FLEET_COLOR[f.key], strokeWidth: 0, fillOpacity: 0.45 }} />
                        </React.Fragment>
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">Key Takeaways</p>
                  <ul className="space-y-1.5">
                    {bdInsights.map((t, i) => (
                      <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-gray-600">
                        <span className="text-emerald-500">•</span>{t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                {bdFleets.map((f) => (
                  <div key={f.key} className="rounded-2xl border border-emerald-100 border-l-4 border-l-emerald-500 p-5">
                    <p className="mb-3 text-sm font-bold text-emerald-700">{f.name}</p>

                    <div className="mb-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-gray-50 px-3 py-2">
                        <p className="text-[10px] text-gray-400">Best</p>
                        <p className="mt-0.5 text-sm font-bold text-emerald-700">
                          {f.best ? `${MONTH_LABEL[f.best.my.split("-")[1]]} — ${f.best.pCurr!.toFixed(2)}%` : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-3 py-2">
                        <p className="text-[10px] text-gray-400">Worst</p>
                        <p className="mt-0.5 text-sm font-bold text-red-500">
                          {f.worst ? `${MONTH_LABEL[f.worst.my.split("-")[1]]} — ${f.worst.pCurr!.toFixed(2)}%` : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 px-3 py-2">
                        <p className="text-[10px] text-gray-400">Trucks</p>
                        <p className="mt-0.5 text-sm font-bold text-gray-800">{f.trucks ?? "—"}</p>
                      </div>
                    </div>

                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-[10px] text-gray-400">
                          <th className="py-1.5 pr-2 font-medium">Mo</th>
                          <th className="py-1.5 pr-2 font-medium">{String(year).slice(2)}</th>
                          <th className="py-1.5 pr-2 font-medium">{String(prevYear).slice(2)}</th>
                          <th className="py-1.5 font-medium">YoY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.rows.map((r) => (
                          <tr key={r.my} className="border-b last:border-b-0">
                            <td className="py-1.5 pr-2 text-gray-600">{MONTH_LABEL[r.my.split("-")[1]]}</td>
                            <td className={`py-1.5 pr-2 tabular-nums font-semibold ${bdPctColor(r.pCurr)}`}>
                              {r.pCurr !== null ? `${r.pCurr.toFixed(2)}%` : "—"}
                              {r.nCurr !== null && <div className="text-[9px] font-normal leading-tight text-gray-400">{r.nCurr.toFixed(1)}</div>}
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums text-gray-500">
                              {r.pPrev !== null ? `${r.pPrev.toFixed(2)}%` : "—"}
                              {r.nPrev !== null && <div className="text-[9px] leading-tight text-gray-300">{r.nPrev.toFixed(1)}</div>}
                            </td>
                            <td className={`py-1.5 tabular-nums font-semibold ${
                              r.yoy === null ? "text-gray-300" : r.yoy > 0 ? "text-red-500" : "text-emerald-700"
                            }`}>
                              {r.yoy !== null ? `${r.yoy > 0 ? "+" : ""}${r.yoy.toFixed(0)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ══ SLIDE: อู่ใน vs อู่นอก ════════════════════════════════════════ */}
          {hasWs && (
            <section ref={setSlideRef("workshop")} className="slide rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
              <div className="mb-4 flex items-start justify-between border-b pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-600">Workshop Split</p>
                  <h2 className="mt-1 text-2xl font-bold text-gray-900">ค่าซ่อม อู่ใน vs อู่นอก</h2>
                  <p className="mt-0.5 text-sm text-gray-400">
                    {periodLabel} เทียบกับ {prevYear} · <span className="font-semibold text-sky-500">อู่ใน</span> = ซ่อมภายใน (ไม่มีค่าแรง) · <span className="font-semibold text-orange-500">อู่นอก</span> = จ้างซ่อมภายนอก (มีรายการค่าแรง)
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-300">Slide {hasBd ? 3 : 2} — อู่ใน vs อู่นอก</p>
                    <PngButton slideKey="workshop" name={`mm-report-${hasBd ? 3 : 2}-workshop-${year}`} />
                  </div>
                  <FilterTags />
                </div>
              </div>

              {/* KPI row */}
              <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="rounded-2xl border border-sky-100 px-5 py-4">
                  <p className="text-xs text-gray-400"><span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-600">อู่ใน</span> {year}</p>
                  <p className="mt-1 text-3xl font-bold text-sky-700">{fmtShort(wsAgg.curr.nai)}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {wsAgg.curr.naiPlates} คัน · {prevYear}: {fmtShort(wsAgg.prev.nai)} <PctBadge pct={pctOf(wsAgg.curr.nai, wsAgg.prev.nai)} size="text-[10px]" />
                  </p>
                </div>
                <div className="rounded-2xl border border-orange-100 px-5 py-4">
                  <p className="text-xs text-gray-400"><span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">อู่นอก</span> {year}</p>
                  <p className="mt-1 text-3xl font-bold text-orange-600">{fmtShort(wsAgg.curr.nok)}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {wsAgg.curr.nokPlates} คัน · {prevYear}: {fmtShort(wsAgg.prev.nok)} <PctBadge pct={pctOf(wsAgg.curr.nok, wsAgg.prev.nok)} size="text-[10px]" />
                  </p>
                </div>
                <div className="rounded-2xl border px-5 py-4">
                  <p className="text-xs text-gray-400">เฉลี่ย / คัน</p>
                  <p className="mt-1 text-xl font-bold">
                    <span className="text-sky-700">{wsNaiAvg > 0 ? fmtShort(wsNaiAvg) : "—"}</span>
                    <span className="mx-1.5 text-sm font-normal text-gray-300">vs</span>
                    <span className="text-orange-600">{wsNokAvg > 0 ? fmtShort(wsNokAvg) : "—"}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {wsNaiAvg > 0 && wsNokAvg > 0
                      ? `อู่นอก${wsNokAvg >= wsNaiAvg ? "แพงกว่า +" : "ถูกกว่า −"}${Math.abs(((wsNokAvg - wsNaiAvg) / wsNaiAvg) * 100).toFixed(0)}% ต่อคัน`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-2xl border px-5 py-4">
                  <p className="text-xs text-gray-400">สัดส่วนอู่นอก</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">{wsShare.toFixed(0)}%</p>
                  <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="bg-sky-400" style={{ width: `${100 - wsShare}%` }} />
                    <div className="bg-orange-400" style={{ width: `${wsShare}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{wsSharePrev !== null ? `ปี ${prevYear}: ${wsSharePrev.toFixed(0)}%` : "—"}</p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-5">
                {/* Monthly chart */}
                <div className="lg:col-span-3">
                  <p className="mb-2 text-xs font-semibold text-gray-700">
                    รายเดือน {year}
                    <span className="ml-2 font-normal text-gray-400">แท่ง = {year} · เส้นประ = {prevYear}</span>
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={wsChart} barCategoryGap="28%" barGap={4} margin={{ top: 20, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="cost" tickFormatter={fmtLabel} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={46} />
                      <YAxis yAxisId="plates" orientation="right" allowDecimals={false}
                        tick={{ fontSize: 10, fill: "#a78bfa" }} axisLine={false} tickLine={false} width={34} />
                      <Tooltip
                        formatter={(v: any, n: any) => {
                          if (n === "naiPlates") return [`${v} คัน`, `อู่ใน (คัน)`]
                          if (n === "nokPlates") return [`${v} คัน`, `อู่นอก (คัน)`]
                          const map: Record<string, string> = {
                            auNai: `อู่ใน ${year}`, auNok: `อู่นอก ${year}`,
                            prevNai: `อู่ใน ${prevYear}`, prevNok: `อู่นอก ${prevYear}`,
                          }
                          return [`฿${fmtNum(Number(v))}`, map[n] ?? n]
                        }}
                        labelStyle={{ fontWeight: 600, fontSize: 12 }}
                        contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }}
                      />
                      <Legend
                        formatter={(v) => {
                          const map: Record<string, string> = {
                            auNai: `อู่ใน ${year}`, auNok: `อู่นอก ${year}`,
                            prevNai: `อู่ใน ${prevYear}`, prevNok: `อู่นอก ${prevYear}`,
                            naiPlates: "อู่ใน (คัน)", nokPlates: "อู่นอก (คัน)",
                          }
                          return <span style={{ fontSize: 11, color: "#6b7280" }}>{map[v] ?? v}</span>
                        }}
                      />
                      <Bar yAxisId="cost" dataKey="auNai" name="auNai" fill="#0ea5e9" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="auNai" position="top" style={{ fontSize: 9, fill: "#0284c7", fontWeight: 600 }} formatter={fmtLabel} />
                      </Bar>
                      <Bar yAxisId="cost" dataKey="auNok" name="auNok" fill="#f97316" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="auNok" position="top" style={{ fontSize: 9, fill: "#ea580c", fontWeight: 600 }} formatter={fmtLabel} />
                      </Bar>
                      <Line yAxisId="cost" dataKey="prevNai" name="prevNai" type="monotone" stroke="#0ea5e9" strokeWidth={1.5}
                        strokeDasharray="5 4" strokeOpacity={0.45} dot={{ r: 2, fill: "#0ea5e9", strokeWidth: 0, fillOpacity: 0.45 }} />
                      <Line yAxisId="cost" dataKey="prevNok" name="prevNok" type="monotone" stroke="#f97316" strokeWidth={1.5}
                        strokeDasharray="5 4" strokeOpacity={0.45} dot={{ r: 2, fill: "#f97316", strokeWidth: 0, fillOpacity: 0.45 }} />
                      <Line yAxisId="plates" dataKey="naiPlates" name="naiPlates" type="monotone" stroke="#0369a1"
                        strokeWidth={2} dot={{ r: 3, fill: "#0369a1", strokeWidth: 0 }} activeDot={{ r: 5 }}>
                        <LabelList dataKey="naiPlates" position="top" offset={8}
                          style={{ fontSize: 9, fill: "#0369a1", fontWeight: 700 }} formatter={(v: any) => (Number(v) > 0 ? v : "")} />
                      </Line>
                      <Line yAxisId="plates" dataKey="nokPlates" name="nokPlates" type="monotone" stroke="#9a3412"
                        strokeWidth={2} dot={{ r: 3, fill: "#9a3412", strokeWidth: 0 }} activeDot={{ r: 5 }}>
                        <LabelList dataKey="nokPlates" position="bottom" offset={8}
                          style={{ fontSize: 9, fill: "#9a3412", fontWeight: 700 }} formatter={(v: any) => (Number(v) > 0 ? v : "")} />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly table + takeaways */}
                <div className="lg:col-span-2">
                  <p className="mb-2 text-xs font-semibold text-gray-700">%อู่นอก รายเดือน</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-[10px] text-gray-400">
                        <th className="py-1.5 pr-1 font-medium">Mo</th>
                        <th className="py-1.5 pr-1 text-right font-medium">อู่ใน</th>
                        <th className="py-1.5 pr-1 text-right font-medium">คัน</th>
                        <th className="py-1.5 pr-1 text-right font-medium">อู่นอก</th>
                        <th className="py-1.5 pr-1 text-right font-medium">คัน</th>
                        <th className="py-1.5 pr-1 text-right font-medium">%นอก</th>
                        <th className="py-1.5 text-right font-medium">%นอก {String(prevYear).slice(2)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wsMonthly.map((m) => (
                        <tr key={m.my} className="border-b last:border-b-0">
                          <td className="py-1.5 pr-1 text-gray-600">{m.label}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums text-sky-700">{m.nai > 0 ? fmtShort(m.nai) : "—"}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums text-gray-500">{m.naiPlates > 0 ? m.naiPlates : "—"}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums text-orange-600">{m.nok > 0 ? fmtShort(m.nok) : "—"}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums text-gray-500">{m.nokPlates > 0 ? m.nokPlates : "—"}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums font-semibold text-gray-800">
                            {m.share !== null ? `${m.share.toFixed(0)}%` : "—"}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-gray-400">
                            {m.sharePrev !== null ? `${m.sharePrev.toFixed(0)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-4 rounded-xl bg-gray-50 p-3">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Key Takeaways</p>
                    <ul className="space-y-1">
                      {wsTakeaways.map((t, i) => (
                        <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-gray-600">
                          <span className="text-sky-500">•</span>{t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ══ SLIDES 3+: one per cost group ═════════════════════════════════ */}
          {groupAggs.map((g, idx) => {
            const det = detailByGroup.get(g.group)
            const monthly = months.map((my) => ({
              month: MONTH_LABEL[my.split("-")[1]] ?? my,
              curr:  g.byMonth[my] || 0,
              prev:  g.byMonthPrev[my] || 0,
            }))
            const share = totalCurr > 0 ? (g.curr / totalCurr) * 100 : 0
            // biggest item mover (needs meaningful prev base)
            const mover = det?.items
              .filter((it) => it.prev > 20_000 || it.curr > 20_000)
              .sort((a, b) => Math.abs(b.curr - b.prev) - Math.abs(a.curr - a.prev))[0]
            return (
              <section key={g.group} ref={setSlideRef(`cg-${g.group}`)} className="slide rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
                <div className="mb-4 flex items-start justify-between border-b pb-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: GROUP_COLOR[g.group] }}>
                      Cost Group Breakdown
                    </p>
                    <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
                      <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: GROUP_COLOR[g.group] }} />
                      {g.group}
                      <span className="text-base font-medium text-gray-400">{GROUP_THAI[g.group]}</span>
                    </h2>
                    <p className="mt-0.5 text-sm text-gray-400">{periodLabel} เทียบกับ {prevYear}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-300">Slide {idx + 2 + (hasBd ? 1 : 0) + (hasWs ? 1 : 0)}</p>
                      <PngButton
                        slideKey={`cg-${g.group}`}
                        name={`mm-report-${idx + 2 + (hasBd ? 1 : 0) + (hasWs ? 1 : 0)}-${g.group.split(" - ")[0].replace(/\s+/g, "").toLowerCase()}-${year}`}
                      />
                    </div>
                    <FilterTags />
                  </div>
                </div>

                {/* group KPIs */}
                <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-2xl border px-5 py-3.5">
                    <p className="text-xs text-gray-400">{year} Cost</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{fmtShort(g.curr)}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">฿{fmtNum(g.curr)}</p>
                  </div>
                  <div className="rounded-2xl border px-5 py-3.5">
                    <p className="text-xs text-gray-400">{prevYear} Cost</p>
                    <p className="mt-1 text-2xl font-bold text-gray-400">{fmtShort(g.prev)}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">฿{fmtNum(g.prev)}</p>
                  </div>
                  <div className="rounded-2xl border px-5 py-3.5">
                    <p className="text-xs text-gray-400">YoY</p>
                    <p className="mt-1"><PctBadge pct={pctOf(g.curr, g.prev)} size="text-2xl" /></p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {g.prev > 0 ? `${g.curr - g.prev >= 0 ? "+" : "−"}฿${fmtNum(Math.abs(g.curr - g.prev))}` : "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl border px-5 py-3.5">
                    <p className="text-xs text-gray-400">สัดส่วนของทั้งหมด</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{share.toFixed(1)}%</p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, background: GROUP_COLOR[g.group] }} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  {/* monthly trend */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-gray-700">รายเดือน {year} vs {prevYear}</p>
                    <ResponsiveContainer width="100%" height={230}>
                      <ComposedChart data={monthly} barCategoryGap="30%" margin={{ top: 18, right: 8, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={fmtLabel} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip formatter={(v: any, n: any) => [`฿${fmtNum(Number(v))}`, n === "curr" ? `${year}` : `${prevYear}`]}
                          contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }} />
                        <Bar dataKey="curr" fill={GROUP_COLOR[g.group]} radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="curr" position="top" style={{ fontSize: 9, fill: "#6b7280", fontWeight: 600 }} formatter={fmtLabel} />
                        </Bar>
                        <Line dataKey="prev" type="monotone" stroke="#111827" strokeWidth={2}
                          strokeDasharray="4 3" dot={{ r: 2.5, fill: "#111827", strokeWidth: 0 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                    {mover && (
                      <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-[11px] leading-snug text-gray-600">
                        <span className="font-semibold text-gray-700">Insight: </span>
                        ตัวขับเคลื่อนหลัก{mover.curr - mover.prev >= 0 ? "ที่เพิ่มขึ้น" : "ที่ลดลง"}: {mover.name}
                        {" "}({fmtShort(mover.prev)} → {fmtShort(mover.curr)}, {mover.curr - mover.prev >= 0 ? "+" : "−"}฿{fmtNum(Math.abs(mover.curr - mover.prev))})
                      </div>
                    )}
                  </div>

                  {/* top product groups */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-gray-700">Top กลุ่มสินค้า</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-[10px] text-gray-400">
                          <th className="py-1.5 pr-1 font-medium">กลุ่มสินค้า</th>
                          <th className="py-1.5 pr-1 text-right font-medium">{year}</th>
                          <th className="py-1.5 pr-1 text-right font-medium">{prevYear}</th>
                          <th className="py-1.5 pr-1 text-right font-medium">%YoY</th>
                          <th className="w-1/5 py-1.5 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(det?.pgs.slice(0, 8) ?? []).map((p) => {
                          const w = det!.pgs[0].curr > 0 ? (p.curr / det!.pgs[0].curr) * 100 : 0
                          return (
                            <tr key={p.pg} className="border-b last:border-b-0">
                              <td className="max-w-[180px] truncate py-1.5 pr-1 text-gray-700" title={p.pg}>{p.pg}</td>
                              <td className="py-1.5 pr-1 text-right tabular-nums font-semibold text-gray-800">{fmtShort(p.curr)}</td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-gray-400">{fmtShort(p.prev)}</td>
                              <td className="py-1.5 pr-1 text-right"><PctBadge pct={pctOf(p.curr, p.prev)} size="text-[10px]" /></td>
                              <td className="py-1.5">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(w, 100)}%`, background: GROUP_COLOR[g.group] }} />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {!det?.pgs.length && (
                          <tr><td colSpan={5} className="py-4 text-center text-gray-300">ไม่มีข้อมูล detail</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* top items */}
                {det && det.items.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold text-gray-700">Top 10 รายการ (รหัสสินค้า)</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-[10px] text-gray-400">
                          <th className="py-1.5 pr-2 font-medium">รหัส</th>
                          <th className="py-1.5 pr-2 font-medium">ชื่อสินค้า</th>
                          <th className="py-1.5 pr-2 font-medium">กลุ่มสินค้า</th>
                          <th className="py-1.5 pr-2 text-right font-medium">จำนวน</th>
                          <th className="py-1.5 pr-2 text-right font-medium">{year}</th>
                          <th className="py-1.5 pr-2 text-right font-medium">{prevYear}</th>
                          <th className="py-1.5 text-right font-medium">%YoY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {det.items.slice(0, 10).map((it) => (
                          <tr key={`${it.pg}|${it.code}`} className="border-b last:border-b-0">
                            <td className="py-1.5 pr-2 font-mono text-[10px] text-gray-500">{it.code}</td>
                            <td className="max-w-[280px] truncate py-1.5 pr-2 text-gray-700" title={it.name}>{it.name}</td>
                            <td className="max-w-[140px] truncate py-1.5 pr-2 text-gray-400">{it.pg}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">{fmtNum(it.qty)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-gray-800">{fmtShort(it.curr)}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-gray-400">{fmtShort(it.prev)}</td>
                            <td className="py-1.5 text-right"><PctBadge pct={pctOf(it.curr, it.prev)} size="text-[10px]" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {loading && !hasData && (
        <div className="py-16 text-center text-sm text-gray-400">กำลังโหลดข้อมูล…</div>
      )}

      {/* print styles (same pattern as /fleet-report) */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .slide { page-break-after: always; break-after: page; }
          .slide:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  )
}
