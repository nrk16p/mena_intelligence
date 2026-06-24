"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronRight, ChevronUp } from "lucide-react"
import {
  Bar, Cell, ComposedChart, CartesianGrid, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

// ── Types ──────────────────────────────────────────────────────────────────────

type DetailLine = {
  จุดประสงค์:       string
  กลุ่มสินค้า:      string
  รหัสสินค้า:       string
  ชื่อสินค้า:       string
  ราคาทุน:          number | null
  ซัพพลายเออร์:     string
  cost:              number
  records:           number
  sum_actual_issue?: number | null
}

type PlateDetailRow = {
  month_year:  string
  plate:       string
  wd:          string
  plate_total: number
  lines:       DetailLine[]
}

type SummaryRow = {
  month_year:   string
  warehouse:    string
  partner_flag: string
  group_value:  string
  total_cost:   number
  record_count: number
}

type ByMonthCell = { curr: number; prev: number; qty_curr: number; qty_prev: number }

type PCProductRow = {
  key:            string
  auto_group:     string
  product_group:  string
  product_code:   string
  product_name:   string
  byMonth:        Record<string, ByMonthCell>
  total_curr:     number
  total_prev:     number
  usage_curr:     number
  usage_prev:     number
  avg_curr:       number | null
  avg_prev:       number | null
  price_diff:     number | null
  price_diff_pct: number | null
  impact:         number | null
  category:       "cost_saving" | "same_price" | "overbudget" | "no_prev"
}

type PCGroupRow = {
  key:           string
  auto_group:    string
  product_group: string
  products:      PCProductRow[]
  total_curr:    number
  net_impact:    number
}

type PCAutoGroupRow = {
  key:        string
  auto_group: string
  groups:     PCGroupRow[]
  total_curr: number
  net_impact: number
  count:      number
}

type CategoryKey = "overbudget" | "cost_saving" | "same_price" | "no_prev"

type PCCategory = {
  key:        CategoryKey
  label:      string
  subtitle:   string
  autoGroups: PCAutoGroupRow[]
  net_impact: number
  count:      number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_TH: Record<string, string> = {
  "01":"ม.ค.", "02":"ก.พ.", "03":"มี.ค.", "04":"เม.ย.",
  "05":"พ.ค.", "06":"มิ.ย.", "07":"ก.ค.", "08":"ส.ค.",
  "09":"ก.ย.", "10":"ต.ค.", "11":"พ.ย.", "12":"ธ.ค.",
}

const AUTO_GROUP_ORDER = ["ค่าแรง", "ยาง", "อะไหล่", "อื่นๆ"]

const AG_CHART_COLORS: Record<string, string> = {
  "ค่าแรง": "#F59E0B",
  "ยาง":    "#3B82F6",
  "อะไหล่": "#8B5CF6",
  "อื่นๆ":  "#9CA3AF",
}

const AUTO_GROUP_COLORS: Record<string, string> = {
  "ค่าแรง": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "ยาง":    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "อะไหล่": "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  "อื่นๆ":  "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400",
}

const PRODUCT_AUTO_GROUP_MAP: Record<string, "ค่าแรง" | "ยาง" | "อะไหล่" | "อื่นๆ"> = {
  "ยาง": "ยาง", "เครื่องมือยาง": "ยาง",
  "ค่าแรง": "ค่าแรง", "ค่าแรง-ระบบโม่": "ค่าแรง",
  "ค่าแรง-ระบบเบรค ครัช เกียร์": "ค่าแรง", "ค่าแรง-ระบบช่วงล่าง": "ค่าแรง",
  "ค่าแรง-ระบบเครื่องยนต์": "ค่าแรง", "ค่าแรง-ระบบแอร์ ไฟฟ้า": "ค่าแรง",
  "ค่าแรง-ระบบหาง": "ค่าแรง", "ค่าแรง-อุปกรณ์เสริม": "ค่าแรง",
  "ค่าแรง-ระบบบำรุงรักษา": "ค่าแรง", "ค่าแรง-หัวเก๋ง": "ค่าแรง",
  "ค่าแรง-ระบบยาง": "ค่าแรง",
  "ระบบบำรุงรักษา": "อะไหล่", "ระบบช่วงล่าง": "อะไหล่", "ระบบเบรคคลัทช์": "อะไหล่",
  "ระบบเครื่องยนต์": "อะไหล่", "ระบบแอร์&ระบบไฟ": "อะไหล่", "ระบบโม่": "อะไหล่",
  "วัสดุสิ้นเปลือง": "อะไหล่", "อุปกรณ์เสริม": "อะไหล่",
  "ระบบเบรค -คลัทช์-เกียร์": "อะไหล่", "ระบบอุปกรณ์เสริม": "อะไหล่",
  "ระบบหาง": "อะไหล่", "ระบบแอร์ - ไฟ": "อะไหล่", "ระบบหัวเก๋ง": "อะไหล่",
  "บำรุงรักษา": "อะไหล่", "อุปกรณ์รถอาหารสัตว์": "อะไหล่", "อะไหล่เก่า": "อะไหล่",
  "ระบบวัสดุสิ้นเปลือง": "อะไหล่", "เครื่องยนต์": "อะไหล่", "เครื่องมือช่าง": "อะไหล่",
  "ช่วงล่าง": "อะไหล่", "สดุอุปกรณ์ไฟฟ้า": "อะไหล่",
  "เครื่องมือช่าง (ประจำรถ)": "อะไหล่", "เครื่องมือรถ": "อะไหล่",
  "อื่นๆ": "อื่นๆ", "น้ำมันเชื้อเพลิง": "อื่นๆ", "DEAD STOCK": "อื่นๆ",
}

const GROUP_NORMALIZE_MAP: Record<string, string> = {
  "บำรุงรักษา":                "ระบบบำรุงรักษา",
  "ระบบเบรค -คลัทช์-เกียร์": "ระบบเบรคคลัทช์",
  "ระบบแอร์ - ไฟ":            "ระบบแอร์&ระบบไฟ",
  "ระบบอุปกรณ์เสริม":         "อุปกรณ์เสริม",
  "ระบบวัสดุสิ้นเปลือง":      "วัสดุสิ้นเปลือง",
  "เครื่องยนต์":              "ระบบเครื่องยนต์",
  "ช่วงล่าง":                 "ระบบช่วงล่าง",
}

const CAT_CONFIG: Record<CategoryKey, { label: string; subtitle: string; headerCls: string; badgeCls: string; impactCls: string }> = {
  overbudget:  {
    label: "Overbudget", subtitle: "ราคาเฉลี่ยสูงกว่าปีที่แล้ว",
    headerCls: "bg-red-50 dark:bg-[#3A1C1C] border-red-200 dark:border-[#FF453A]/30",
    badgeCls:  "bg-red-100 text-red-700 dark:bg-[#FF453A]/20 dark:text-[#FF453A]",
    impactCls: "text-red-600 dark:text-[#FF453A]",
  },
  cost_saving: {
    label: "Cost Saving", subtitle: "ราคาเฉลี่ยน้อยกว่าปีที่แล้ว",
    headerCls: "bg-emerald-50 dark:bg-[#0D2617] border-emerald-200 dark:border-[#32D74B]/30",
    badgeCls:  "bg-emerald-100 text-emerald-700 dark:bg-[#32D74B]/20 dark:text-[#32D74B]",
    impactCls: "text-emerald-600 dark:text-[#32D74B]",
  },
  same_price: {
    label: "Same Price", subtitle: "ราคาเฉลี่ยเท่ากับปีที่แล้ว",
    headerCls: "bg-gray-50 dark:bg-white/3 border-gray-200 dark:border-white/8",
    badgeCls:  "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400",
    impactCls: "text-gray-400",
  },
  no_prev: {
    label: "New Items", subtitle: "ไม่มีข้อมูลปีที่แล้ว",
    headerCls: "bg-gray-50 dark:bg-white/3 border-gray-200 dark:border-white/8",
    badgeCls:  "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-500",
    impactCls: "text-gray-400",
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeGroup(g: string): string {
  const t = (g || "").replace(/\s+/g, " ").trim()
  return GROUP_NORMALIZE_MAP[t] ?? t
}

function getAutoGroup(raw: string): "ค่าแรง" | "ยาง" | "อะไหล่" | "อื่นๆ" {
  const g = normalizeGroup(raw)
  if (!g || g === "ไม่ระบุ") return "อื่นๆ"
  if (PRODUCT_AUTO_GROUP_MAP[g]) return PRODUCT_AUTO_GROUP_MAP[g]
  if (g.startsWith("ค่าแรง")) return "ค่าแรง"
  if (g.startsWith("ยาง") || (g.includes("ยาง") && !g.startsWith("ค่าแรง"))) return "ยาง"
  if (g.startsWith("อื่น") || g.includes("DEAD STOCK") || g.includes("น้ำมันเชื้อเพลิง")) return "อื่นๆ"
  return "อะไหล่"
}

function getUsage(line: DetailLine): number { return Number(line.sum_actual_issue) || 0 }

function nowYM(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}
function shiftYear(my: string, d: number): string {
  const [y, m] = my.split("-")
  return `${Number(y) + d}-${m}`
}
function getMonthsInRange(start: string, end: string): string[] {
  if (!start || !end) return []
  const [sy, sm] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)
  const out: string[] = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtDec(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`
}
function fmtShort(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "−" : ""
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(2)}M`
  if (a >= 1_000)     return `${s}${(a / 1_000).toFixed(1)}K`
  return `${s}${a.toFixed(0)}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PCCostPage() {
  const todayYM   = nowYM()
  const todayYear = todayYM.split("-")[0]

  // Filter state
  const [year, setYear]             = useState(todayYear)
  const [startMonth, setStartMonth] = useState(`${todayYear}-01`)
  const [endMonth, setEndMonth]     = useState(todayYM)

  // Data state
  const [loading, setLoading]         = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError]             = useState("")
  const [currDetail, setCurrDetail]   = useState<PlateDetailRow[]>([])
  const [prevDetail, setPrevDetail]   = useState<PlateDetailRow[]>([])
  const [currSummary, setCurrSummary] = useState<SummaryRow[]>([])
  const [prevSummary, setPrevSummary] = useState<SummaryRow[]>([])

  // Warehouse filter
  const [selectedWH, setSelectedWH] = useState<Set<string>>(new Set())
  const availableWH = useMemo<string[]>(() => {
    const s = new Set<string>()
    ;[...currSummary, ...prevSummary].forEach(r => s.add(r.warehouse || "ไม่ระบุ"))
    return Array.from(s).sort()
  }, [currSummary, prevSummary])

  // Sort + auto group chip filter
  const [sortBy,       setSortBy]       = useState<"value" | "pct">("value")
  const [filterAg,     setFilterAg]     = useState("all")
  const [paretoFilter, setParetoFilter] = useState<"all" | "overbudget" | "cost_saving">("all")
  const [paretoAg,     setParetoAg]     = useState("all")

  // Expand state
  const [expandedCats,     setExpandedCats]     = useState<Set<string>>(new Set(["overbudget", "cost_saving"]))
  const [expandedAg,       setExpandedAg]       = useState<Set<string>>(new Set())
  const [expandedGroups,   setExpandedGroups]   = useState<Set<string>>(new Set())
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())

  function tog<T>(s: Set<T>, set: React.Dispatch<React.SetStateAction<Set<T>>>, k: T) {
    set(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  const prevYear = String(Number(year) - 1)
  const months   = useMemo(() => getMonthsInRange(startMonth, endMonth), [startMonth, endMonth])

  // Quick date picks
  function pickYTD()   { setStartMonth(`${year}-01`); setEndMonth(`${year}-${String(new Date().getMonth()+1).padStart(2,"0")}`) }
  function pickMonth() { const m=String(new Date().getMonth()+1).padStart(2,"0"); setStartMonth(`${year}-${m}`); setEndMonth(`${year}-${m}`) }
  function pickFull()  { setStartMonth(`${year}-01`); setEndMonth(`${year}-12`) }

  const fetchData = useCallback(async (params: {
    start: string; end: string; warehouse: string
  }) => {
    try {
      setLoading(true); setError("")
      const ps = shiftYear(params.start, -1)
      const pe = shiftYear(params.end,   -1)

      const dp = (s: string, e: string) => {
        const p = new URLSearchParams({ start: s, end: e })
        if (params.warehouse) p.set("warehouse", params.warehouse)
        return p
      }
      const sp = (s: string, e: string) => {
        const p = new URLSearchParams({ start: s, end: e, group_by: "จุดประสงค์ในการเบิก" })
        if (params.warehouse) p.set("warehouse", params.warehouse)
        return p
      }

      const [rCD, rPD, rCS, rPS] = await Promise.all([
        fetch(`/api/cost/detail?${dp(params.start, params.end)}`,  { cache: "no-store" }),
        fetch(`/api/cost/detail?${dp(ps, pe)}`,                    { cache: "no-store" }),
        fetch(`/api/cost/summary?${sp(params.start, params.end)}`, { cache: "no-store" }),
        fetch(`/api/cost/summary?${sp(ps, pe)}`,                   { cache: "no-store" }),
      ])
      const [jCD, jPD, jCS, jPS] = await Promise.all([rCD.json(), rPD.json(), rCS.json(), rPS.json()])

      if (!rCD.ok) throw new Error(jCD.error || "Failed")

      setCurrDetail(jCD.success ? jCD.data || [] : [])
      setPrevDetail(jPD.success ? jPD.data || [] : [])
      setCurrSummary(jCS.data || [])
      setPrevSummary(jPS.data || [])
      setExpandedCats(new Set(["overbudget", "cost_saving"]))
      setExpandedAg(new Set()); setExpandedGroups(new Set()); setExpandedProducts(new Set())
      setHasSearched(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reactive query key — any filter change triggers a debounced re-fetch
  const queryKey = useMemo(() => ({
    start: startMonth,
    end:   endMonth,
    warehouse: Array.from(selectedWH).sort().join(","),
  }), [startMonth, endMonth, selectedWH])

  useEffect(() => {
    if (!queryKey.start || !queryKey.end) return
    const id = setTimeout(() => fetchData(queryKey), 400)
    return () => clearTimeout(id)
  }, [queryKey, fetchData])

  function toggleWH(wh: string) {
    setSelectedWH(prev => {
      const next = new Set(prev); next.has(wh) ? next.delete(wh) : next.add(wh)
      return next
    })
  }

  // Monthly chart data
  const chartData = useMemo(() => {
    return months.map(my => {
      const prevMy = shiftYear(my, -1)
      const m      = my.split("-")[1]
      const curr   = currSummary.filter(r => r.month_year === my).reduce((s, r) => s + r.total_cost, 0)
      const prev   = prevSummary.filter(r => r.month_year === prevMy).reduce((s, r) => s + r.total_cost, 0)
      const pct    = prev > 0 ? ((curr - prev) / prev) * 100 : null
      return { month: MONTH_TH[m] ?? m, curr, prev, pct }
    })
  }, [months, currSummary, prevSummary])

  // Build PC breakdown
  const pcCategories = useMemo<PCCategory[]>(() => {
    type RawProduct = {
      auto_group: string; product_group: string; product_code: string; product_name: string
      byMonth: Record<string, ByMonthCell>
      total_curr: number; total_prev: number
      usage_curr: number; usage_prev: number
      fb_curr: number | null; fb_prev: number | null
    }
    const productMap = new Map<string, RawProduct>()

    function ensure(line: DetailLine, month: string): RawProduct {
      const pg  = normalizeGroup(line.กลุ่มสินค้า || "")
      const ag  = getAutoGroup(pg || line.กลุ่มสินค้า)
      const key = `${ag}||${pg}||${line.รหัสสินค้า || "ไม่ระบุ"}`
      if (!productMap.has(key)) {
        productMap.set(key, {
          auto_group: ag, product_group: pg || "ไม่ระบุ",
          product_code: line.รหัสสินค้า || "ไม่ระบุ",
          product_name: line.ชื่อสินค้า || "",
          byMonth: {}, total_curr: 0, total_prev: 0, usage_curr: 0, usage_prev: 0,
          fb_curr: null, fb_prev: null,
        })
      }
      const row = productMap.get(key)!
      if (!row.byMonth[month]) row.byMonth[month] = { curr: 0, prev: 0, qty_curr: 0, qty_prev: 0 }
      return row
    }

    currDetail.forEach(pr => pr.lines?.forEach(line => {
      const usage = getUsage(line)
      const row   = ensure(line, pr.month_year)
      row.byMonth[pr.month_year].curr     += line.cost
      row.byMonth[pr.month_year].qty_curr += usage
      row.total_curr += line.cost
      row.usage_curr += usage
      if (row.fb_curr == null && line.ราคาทุน != null) row.fb_curr = line.ราคาทุน
    }))

    prevDetail.forEach(pr => {
      const aligned = shiftYear(pr.month_year, 1)
      pr.lines?.forEach(line => {
        const usage = getUsage(line)
        const row   = ensure(line, aligned)
        row.byMonth[aligned].prev     += line.cost
        row.byMonth[aligned].qty_prev += usage
        row.total_prev += line.cost
        row.usage_prev += usage
        if (row.fb_prev == null && line.ราคาทุน != null) row.fb_prev = line.ราคาทุน
      })
    })

    // Compute avg, categorize
    const products: PCProductRow[] = Array.from(productMap.entries()).map(([key, p]) => {
      const avg_curr = p.usage_curr > 0 ? p.total_curr / p.usage_curr : p.fb_curr
      const avg_prev = p.usage_prev > 0 ? p.total_prev / p.usage_prev : p.fb_prev
      const price_diff = avg_curr != null && avg_prev != null ? avg_curr - avg_prev : null
      const price_diff_pct = price_diff != null && avg_prev != null && avg_prev > 0
        ? (price_diff / avg_prev) * 100 : null
      const impact = price_diff != null ? price_diff * p.usage_curr : null

      let category: PCProductRow["category"]
      if (avg_prev == null)                                      category = "no_prev"
      else if (price_diff_pct == null || Math.abs(price_diff_pct) < 1) category = "same_price"
      else if (price_diff! > 0)                                  category = "overbudget"
      else                                                        category = "cost_saving"

      return { key, ...p, avg_curr, avg_prev, price_diff, price_diff_pct, impact, category }
    })

    const filtered = filterAg === "all" ? products : products.filter(p => p.auto_group === filterAg)

    function sortPs(ps: PCProductRow[]) {
      return [...ps].sort((a, b) =>
        sortBy === "pct"
          ? Math.abs(b.price_diff_pct ?? 0) - Math.abs(a.price_diff_pct ?? 0)
          : Math.abs(b.impact ?? 0) - Math.abs(a.impact ?? 0)
      )
    }

    const CAT_ORDER: CategoryKey[] = ["overbudget", "cost_saving", "same_price", "no_prev"]

    return CAT_ORDER.map(catKey => {
      const catPs = sortPs(filtered.filter(p => p.category === catKey))

      // Group by auto_group → product_group
      const agMap = new Map<string, Map<string, PCProductRow[]>>()
      catPs.forEach(p => {
        if (!agMap.has(p.auto_group)) agMap.set(p.auto_group, new Map())
        const gm = agMap.get(p.auto_group)!
        if (!gm.has(p.product_group)) gm.set(p.product_group, [])
        gm.get(p.product_group)!.push(p)
      })

      const autoGroups: PCAutoGroupRow[] = Array.from(agMap.entries())
        .sort((a, b) => AUTO_GROUP_ORDER.indexOf(a[0]) - AUTO_GROUP_ORDER.indexOf(b[0]))
        .map(([agKey, gm]) => {
          const groupRows: PCGroupRow[] = Array.from(gm.entries())
            .map(([pgKey, ps]) => ({
              key:           `${catKey}||${agKey}||${pgKey}`,
              auto_group:    agKey,
              product_group: pgKey,
              products:      ps,
              total_curr:    ps.reduce((s, p) => s + p.total_curr, 0),
              net_impact:    ps.reduce((s, p) => s + (p.impact ?? 0), 0),
            }))
            .sort((a, b) => Math.abs(b.net_impact) - Math.abs(a.net_impact))

          return {
            key:        `${catKey}||${agKey}`,
            auto_group: agKey,
            groups:     groupRows,
            total_curr: groupRows.reduce((s, g) => s + g.total_curr, 0),
            net_impact: groupRows.reduce((s, g) => s + g.net_impact, 0),
            count:      groupRows.reduce((s, g) => s + g.products.length, 0),
          }
        })
        .sort((a, b) => Math.abs(b.net_impact) - Math.abs(a.net_impact))

      return {
        key:        catKey,
        ...CAT_CONFIG[catKey],
        autoGroups,
        net_impact: autoGroups.reduce((s, ag) => s + ag.net_impact, 0),
        count:      catPs.length,
      }
    })
  }, [currDetail, prevDetail, filterAg, sortBy])

  // Pareto data — กลุ่มสินค้า ranked by absolute impact
  const paretoData = useMemo(() => {
    const groupMap = new Map<string, { ag: string; impact: number }>()
    pcCategories.forEach(cat => {
      if (cat.key === "same_price" || cat.key === "no_prev") return
      if (paretoFilter !== "all" && cat.key !== paretoFilter) return
      cat.autoGroups.forEach(ag => {
        if (paretoAg !== "all" && ag.auto_group !== paretoAg) return
        ag.groups.forEach(grp => {
          const absImpact = Math.abs(grp.net_impact)
          if (absImpact === 0) return
          const cur = groupMap.get(grp.product_group) ?? { ag: ag.auto_group, impact: 0 }
          groupMap.set(grp.product_group, { ag: cur.ag || ag.auto_group, impact: cur.impact + absImpact })
        })
      })
    })
    const sorted = Array.from(groupMap.entries())
      .map(([name, v]) => ({ name, ag: v.ag, impact: v.impact }))
      .sort((a, b) => b.impact - a.impact)
    const total = sorted.reduce((s, r) => s + r.impact, 0)
    let cum = 0
    return sorted.map(r => {
      cum += r.impact
      return { ...r, cumPct: total > 0 ? (cum / total) * 100 : 0 }
    })
  }, [pcCategories, paretoFilter, paretoAg])

  // KPIs
  const kpiOver   = pcCategories.find(c => c.key === "overbudget")?.net_impact  ?? 0
  const kpiSaving = pcCategories.find(c => c.key === "cost_saving")?.net_impact ?? 0
  const kpiNet    = kpiOver + kpiSaving

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-5 items-start">

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">PC Cost</h1>
          <p className="text-xs text-gray-400 mt-0.5">Price comparison — avg price {year} vs {prevYear} · Auto Group → กลุ่มสินค้า → รหัสสินค้า</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* Empty state */}
        {!hasSearched && !loading && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 rounded-2xl border border-dashed border-gray-200 dark:border-white/10 text-sm text-gray-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 dark:border-white/20 border-t-gray-500 dark:border-t-white/50" />
            กำลังโหลดข้อมูล…
          </div>
        )}

        {hasSearched && (
          <>
            {/* Warehouse chips */}
            {availableWH.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-400 shrink-0">คลังสินค้า:</span>
                {availableWH.map(wh => (
                  <button
                    key={wh}
                    onClick={() => toggleWH(wh)}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-colors ${
                      selectedWH.has(wh)
                        ? "bg-gray-900 dark:bg-[#00E5FF]/20 text-white dark:text-[#00E5FF] border-gray-900 dark:border-[#00E5FF]/60"
                        : "bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10"
                    }`}
                  >
                    {selectedWH.has(wh) && <span className="text-[10px]">✓</span>}
                    {wh}
                  </button>
                ))}
                {selectedWH.size > 0 && (
                  <button onClick={() => setSelectedWH(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline underline-offset-2">
                    ล้าง
                  </button>
                )}
              </div>
            )}

            {/* Monthly Cost chart + Group chips */}
            {chartData.length > 0 && (
              <div className="rounded-2xl border border-gray-200 dark:border-[#2C2C2E] bg-white dark:bg-[#1E1E1E] p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Monthly Cost — {year} vs {prevYear}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      เลือก Auto Group chips เพื่อกรอง Cost Breakdown ด้านล่าง
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {["all", ...AUTO_GROUP_ORDER].map(ag => (
                      <button
                        key={ag}
                        onClick={() => setFilterAg(ag)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          filterAg === ag
                            ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                            : `${AUTO_GROUP_COLORS[ag] ?? "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"} opacity-60 hover:opacity-100`
                        }`}
                      >
                        {ag === "all" ? "ทั้งหมด" : ag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} barCategoryGap="30%" barGap={3}
                      margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => fmtShort(Number(v))} tick={{ fontSize: 10, fill: "#9CA3AF" }}
                        axisLine={false} tickLine={false} width={46} />
                      <Tooltip
                        contentStyle={{ borderRadius: "10px", fontSize: 12, border: "1px solid #E5E7EB" }}
                        formatter={(v: any, name: any) => [fmt(Number(v)), name === "curr" ? year : prevYear]}
                      />
                      <Bar dataKey="prev" name="prev" fill="#2C2C2E" fillOpacity={0.8}
                        radius={[2,2,0,0]} maxBarSize={36} />
                      <Bar dataKey="curr" name="curr" radius={[2,2,0,0]} maxBarSize={36}>
                        {chartData.map((e, i) => {
                          const c = e.pct === null ? "#98989D" : e.pct <= 0 ? "#32D74B" : "#FF453A"
                          return <Cell key={i} fill={c} />
                        })}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* KPI cards — WattVision style */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-2xl bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2E] border-l-4 border-l-red-400 dark:border-l-[#FF453A] px-5 py-4">
                <p className="text-xs text-gray-500 dark:text-[#98989D] mb-1">Overbudget Impact</p>
                <p className="text-2xl font-bold text-red-600 dark:text-[#FF453A] watt-mono tabular-nums">
                  {kpiOver > 0 ? "+" : ""}{fmtShort(kpiOver)}
                </p>
                <p className="text-xs text-gray-400 dark:text-[#98989D] mt-0.5">{fmt(kpiOver)} ฿</p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2E] border-l-4 border-l-emerald-400 dark:border-l-[#32D74B] px-5 py-4">
                <p className="text-xs text-gray-500 dark:text-[#98989D] mb-1">Cost Saving Impact</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-[#32D74B] watt-mono tabular-nums">
                  {fmtShort(kpiSaving)}
                </p>
                <p className="text-xs text-gray-400 dark:text-[#98989D] mt-0.5">{fmt(kpiSaving)} ฿</p>
              </div>
              <div className="rounded-2xl bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2E] border-l-4 dark:border-l-[#00E5FF] border-l-blue-400 px-5 py-4">
                <p className="text-xs text-gray-500 dark:text-[#98989D] mb-1">Net Impact</p>
                <p className={`text-2xl font-bold watt-mono tabular-nums ${kpiNet > 0 ? "text-red-600 dark:text-[#FF453A]" : "text-emerald-600 dark:text-[#32D74B]"}`}>
                  {kpiNet > 0 ? "+" : ""}{fmtShort(kpiNet)}
                </p>
                <p className="text-xs text-gray-400 dark:text-[#98989D] mt-0.5">{fmt(kpiNet)} ฿</p>
              </div>
            </div>

            {/* Pareto Chart */}
            {paretoData.length > 0 && (
              <div className="rounded-2xl border border-gray-200 dark:border-[#2C2C2E] bg-white dark:bg-[#1E1E1E] p-5">
                <div className="mb-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Pareto — Impact by กลุ่มสินค้า</p>
                      <p className="text-xs text-gray-400 mt-0.5">จัดเรียงตาม |impact| สูงสุด · เส้นสีแดง = % สะสม</p>
                    </div>
                    <div className="flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden text-xs">
                      {([
                        { k: "all" as const,         label: "ทั้งหมด" },
                        { k: "overbudget" as const,  label: "Overbudget" },
                        { k: "cost_saving" as const, label: "Cost Saving" },
                      ]).map((opt, i) => (
                        <button key={opt.k} onClick={() => setParetoFilter(opt.k)}
                          className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-gray-200 dark:border-white/10" : ""} ${
                            paretoFilter === opt.k
                              ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                              : "bg-white dark:bg-white/3 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                          }`}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>
                  {/* Auto Group chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {["all", ...AUTO_GROUP_ORDER].map(ag => (
                      <button
                        key={ag}
                        onClick={() => setParetoAg(ag)}
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          paretoAg === ag
                            ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                            : `${AUTO_GROUP_COLORS[ag] ?? "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"} opacity-60 hover:opacity-100`
                        }`}
                      >
                        {ag === "all" ? "ทั้งหมด" : ag}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={paretoData} margin={{ top: 8, right: 44, left: 0, bottom: 64 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                        angle={-35} textAnchor="end" height={70} interval={0} />
                      <YAxis yAxisId="left" tickFormatter={v => fmtShort(Number(v))} tick={{ fontSize: 10, fill: "#9CA3AF" }}
                        axisLine={false} tickLine={false} width={46} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`}
                        tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false}
                        domain={[0, 100]} width={36} />
                      <Tooltip
                        contentStyle={{ borderRadius: "10px", fontSize: 12, border: "1px solid #E5E7EB" }}
                        formatter={(v: any, name: any) => {
                          if (name === "cumPct") return [`${Number(v).toFixed(1)}%`, "% สะสม"]
                          return [fmt(Number(v)) + " ฿", "impact"]
                        }}
                      />
                      <ReferenceLine yAxisId="right" y={80} stroke="#FF453A" strokeDasharray="4 4" strokeOpacity={0.5} />
                      <Bar yAxisId="left" dataKey="impact" name="impact" radius={[3,3,0,0]} maxBarSize={44}>
                        {paretoData.map((e, i) => (
                          <Cell key={i} fill={AG_CHART_COLORS[e.ag] ?? "#98989D"} />
                        ))}
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="#00E5FF"
                        strokeWidth={2} dot={false} name="cumPct" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-1 flex flex-wrap gap-4 justify-center">
                  {AUTO_GROUP_ORDER.map(ag => (
                    <div key={ag} className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                      <div className="w-3 h-3 rounded-sm" style={{ background: AG_CHART_COLORS[ag] }} />
                      {ag}
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                    <div className="w-5 border-t-2 border-red-400 border-dashed" />
                    80% line
                  </div>
                </div>
              </div>
            )}

            {/* Sort control */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">จัดเรียงตาม:</span>
              <div className="flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden text-xs">
                {([
                  { k: "value" as const, label: "ยอดเงิน (impact)" },
                  { k: "pct"   as const, label: "% ส่วนต่าง" },
                ]).map((opt, i) => (
                  <button key={opt.k} onClick={() => setSortBy(opt.k)}
                    className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-gray-200 dark:border-white/10" : ""} ${
                      sortBy === opt.k
                        ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                        : "bg-white dark:bg-white/3 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* PC Breakdown — category sections */}
            <div className="space-y-3">
              {pcCategories.map(cat => {
                const cfg     = CAT_CONFIG[cat.key]
                const catOpen = expandedCats.has(cat.key)

                return (
                  <div key={cat.key} className={`rounded-2xl border overflow-hidden ${cfg.headerCls}`}>
                    {/* Category header */}
                    <button
                      onClick={() => tog(expandedCats, setExpandedCats, cat.key)}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`inline-block transition-transform duration-150 ${catOpen ? "" : "-rotate-90"}`}>▾</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${cfg.badgeCls}`}>{cat.label}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{cfg.subtitle}</span>
                        <span className="text-xs text-gray-400">({cat.count} รายการ)</span>
                      </div>
                      {cat.net_impact !== 0 && (
                        <span className={`text-sm font-bold tabular-nums ${cfg.impactCls}`}>
                          {cat.net_impact > 0 ? "+" : ""}{fmt(cat.net_impact)} ฿
                        </span>
                      )}
                    </button>

                    {catOpen && cat.autoGroups.length > 0 && (
                      <div className="border-t border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-[#0f1117] border-b border-gray-100 dark:border-white/8">
                              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 min-w-[280px] sticky left-0 bg-gray-50 dark:bg-[#0f1117] z-10">
                                Auto Group / กลุ่มสินค้า / รหัสสินค้า
                              </th>
                              <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">avg {prevYear} (฿)</th>
                              <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">avg {year} (฿)</th>
                              <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">ส่วนต่าง (฿)</th>
                              <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">ส่วนต่าง (%)</th>
                              <th className="px-3 py-2.5 text-right font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">usage {year}</th>
                              <th className="px-3 py-2.5 text-right font-semibold text-orange-500 dark:text-orange-400 whitespace-nowrap bg-orange-50 dark:bg-orange-950/20 min-w-[120px]">
                                impact (฿) = ส่วนต่าง×n
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {cat.autoGroups.map(ag => {
                              const agOpen = expandedAg.has(ag.key)
                              return (
                                <React.Fragment key={ag.key}>
                                  {/* Auto Group row */}
                                  <tr
                                    onClick={() => tog(expandedAg, setExpandedAg, ag.key)}
                                    className="cursor-pointer border-t border-gray-100 dark:border-white/8 bg-gray-50/70 dark:bg-white/[0.02] hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                                  >
                                    <td className="px-3 py-2.5 sticky left-0 bg-gray-50/80 dark:bg-[#0f1117] z-10">
                                      <div className="flex items-center gap-2 font-bold text-gray-800 dark:text-white">
                                        <span className="text-gray-400 text-[10px] w-3">{agOpen ? "▾" : "▸"}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${AUTO_GROUP_COLORS[ag.auto_group] ?? "bg-gray-100 text-gray-600"}`}>
                                          {ag.auto_group}
                                        </span>
                                        <span className="text-[10px] text-gray-400 font-normal">{ag.count} รายการ</span>
                                      </div>
                                    </td>
                                    <td colSpan={5} className="px-3 py-2.5 text-right text-gray-400 text-[11px]">
                                      cost {year}: ฿{fmtShort(ag.total_curr)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-orange-600 dark:text-orange-400 bg-orange-50/60 dark:bg-orange-950/20 whitespace-nowrap">
                                      {ag.net_impact !== 0 ? `${ag.net_impact > 0 ? "+" : ""}${fmt(ag.net_impact)}` : "—"}
                                    </td>
                                  </tr>

                                  {agOpen && ag.groups.map(grp => {
                                    const grpOpen = expandedGroups.has(grp.key)
                                    return (
                                      <React.Fragment key={grp.key}>
                                        {/* Product Group row */}
                                        <tr
                                          onClick={() => tog(expandedGroups, setExpandedGroups, grp.key)}
                                          className="cursor-pointer border-t border-gray-50 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/3 transition-colors"
                                        >
                                          <td className="pl-8 pr-3 py-2 sticky left-0 bg-white dark:bg-[#0f1117] z-10">
                                            <div className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200">
                                              <span className="text-gray-400 text-[10px]">{grpOpen ? "▾" : "▸"}</span>
                                              <span className="truncate">{grp.product_group}</span>
                                              <span className="text-[10px] text-gray-400 font-normal shrink-0">({grp.products.length})</span>
                                            </div>
                                          </td>
                                          <td colSpan={5} className="px-3 py-2 text-right text-gray-400 text-[11px]">
                                            ฿{fmtShort(grp.total_curr)}
                                          </td>
                                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-orange-600 dark:text-orange-400 bg-orange-50/40 dark:bg-orange-950/10 whitespace-nowrap">
                                            {grp.net_impact !== 0 ? `${grp.net_impact > 0 ? "+" : ""}${fmt(grp.net_impact)}` : "—"}
                                          </td>
                                        </tr>

                                        {/* Product rows */}
                                        {grpOpen && grp.products.map(p => {
                                          const prodOpen = expandedProducts.has(p.key)
                                          const pctCls   =
                                            p.price_diff_pct == null ? "text-gray-400 dark:text-gray-600"
                                            : p.price_diff_pct > 0  ? "text-red-600 dark:text-red-400"
                                            : p.price_diff_pct < 0  ? "text-emerald-600 dark:text-emerald-400"
                                            : "text-gray-400"

                                          const drillRows = months
                                            .map(my => {
                                              const cell = p.byMonth[my]
                                              if (!cell || (cell.curr === 0 && cell.prev === 0)) return null
                                              const avgC   = cell.qty_curr > 0 ? cell.curr / cell.qty_curr : null
                                              const avgP   = cell.qty_prev > 0 ? cell.prev / cell.qty_prev : null
                                              const diff   = avgC != null && avgP != null ? avgC - avgP : null
                                              const diffPct = avgC != null && avgP != null && avgP > 0 ? ((avgC - avgP) / avgP) * 100 : null
                                              return { my, label: MONTH_TH[my.split("-")[1]] ?? my.split("-")[1], cell, avgC, avgP, diff, diffPct }
                                            })
                                            .filter((r): r is NonNullable<typeof r> => r !== null)

                                          return (
                                            <React.Fragment key={p.key}>
                                              <tr
                                                onClick={() => tog(expandedProducts, setExpandedProducts, p.key)}
                                                className="cursor-pointer border-t border-gray-50 dark:border-white/[0.03] hover:bg-gray-50 dark:hover:bg-white/3 transition-colors"
                                              >
                                                <td className="pl-14 pr-3 py-1.5 sticky left-0 bg-white dark:bg-[#0f1117] z-10">
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="text-gray-300 dark:text-gray-700 select-none shrink-0">└</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="font-mono text-gray-400 dark:text-gray-500 text-[10px] truncate">{p.product_code}</div>
                                                      <div className="text-gray-700 dark:text-gray-300 truncate max-w-[220px]" title={p.product_name}>{p.product_name || "—"}</div>
                                                    </div>
                                                    {prodOpen
                                                      ? <ChevronUp size={10} className="shrink-0 text-gray-400" />
                                                      : <ChevronRight size={10} className="shrink-0 text-gray-300 dark:text-gray-600" />
                                                    }
                                                  </div>
                                                </td>
                                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                  {fmtDec(p.avg_prev)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200 whitespace-nowrap">
                                                  {fmtDec(p.avg_curr)}
                                                </td>
                                                <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${pctCls}`}>
                                                  {p.price_diff != null ? `${p.price_diff > 0 ? "+" : ""}${fmtDec(p.price_diff)}` : "—"}
                                                </td>
                                                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap ${pctCls}`}>
                                                  {fmtPct(p.price_diff_pct)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                                  {p.usage_curr > 0 ? fmt(p.usage_curr) : "—"}
                                                </td>
                                                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap bg-orange-50/30 dark:bg-orange-950/10 ${
                                                  p.impact != null && Math.abs(p.impact) > 0.5 ? pctCls : "text-gray-300 dark:text-gray-700"
                                                }`}>
                                                  {p.impact != null && Math.abs(p.impact) > 0.5
                                                    ? `${p.impact > 0 ? "+" : ""}${fmt(p.impact)}`
                                                    : "—"}
                                                </td>
                                              </tr>

                                              {/* Monthly drill-down — redesigned */}
                                              {prodOpen && (
                                                <tr className="bg-slate-50/80 dark:bg-white/[0.015]">
                                                  <td colSpan={7} className="px-8 pt-3 pb-4">

                                                    {/* Header bar */}
                                                    <div className="flex items-center gap-2.5 mb-3">
                                                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ภาพรายเดือน — {year} vs {prevYear}</span>
                                                      {p.price_diff != null && (
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.price_diff > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                                                          avg {p.price_diff > 0 ? "+" : ""}{fmtDec(p.price_diff)} ฿ &nbsp;{fmtPct(p.price_diff_pct)}
                                                        </span>
                                                      )}
                                                    </div>

                                                    {/* Mini avg price chart */}
                                                    {drillRows.length > 0 && (
                                                      <div className="h-28 mb-3">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                          <ComposedChart data={drillRows} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%">
                                                            <CartesianGrid strokeDasharray="2 2" stroke="#F3F4F6" vertical={false} />
                                                            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                                                            <YAxis tick={{ fontSize: 9, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={40}
                                                              tickFormatter={v => fmtDec(Number(v), 0)} />
                                                            <Tooltip contentStyle={{ borderRadius: "8px", fontSize: 11, border: "1px solid #E5E7EB" }}
                                                              formatter={(v: any, name: any) => [v != null ? fmtDec(Number(v)) : "—", name === "avgC" ? `avg ${year}` : `avg ${prevYear}`]} />
                                                            <Bar dataKey="avgC" name="avgC" radius={[3,3,0,0]} maxBarSize={32}>
                                                              {drillRows.map((e, i) => (
                                                                <Cell key={i} fill={e.diff == null ? "#98989D" : e.diff > 0 ? "#FF453A" : "#32D74B"} fillOpacity={0.9} />
                                                              ))}
                                                            </Bar>
                                                            <Line dataKey="avgP" name="avgP" type="monotone" stroke="#00E5FF" strokeWidth={1.5}
                                                              dot={{ r: 2, fill: "#00E5FF" }} strokeDasharray="3 3" />
                                                          </ComposedChart>
                                                        </ResponsiveContainer>
                                                      </div>
                                                    )}

                                                    {/* Table — grouped headers */}
                                                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/8">
                                                      <table className="text-[10px] border-collapse w-full min-w-[540px]">
                                                        <thead>
                                                          <tr className="bg-gray-100/80 dark:bg-white/[0.04] text-gray-500 dark:text-gray-400">
                                                            <th className="text-left py-1.5 pl-3 pr-4 font-semibold whitespace-nowrap" rowSpan={2}>เดือน</th>
                                                            <th className="text-center px-3 py-1 font-semibold border-l border-gray-200 dark:border-white/10 text-[9px] uppercase tracking-wide" colSpan={2}>Cost (฿)</th>
                                                            <th className="text-center px-3 py-1 font-semibold border-l border-gray-200 dark:border-white/10 text-[9px] uppercase tracking-wide" colSpan={2}>Qty</th>
                                                            <th className="text-center px-3 py-1 font-semibold border-l border-gray-200 dark:border-white/10 text-[9px] uppercase tracking-wide" colSpan={2}>Avg Price (฿)</th>
                                                            <th className="text-center px-3 py-1 font-semibold border-l border-gray-200 dark:border-white/10 text-[9px] uppercase tracking-wide" colSpan={2}>ส่วนต่าง</th>
                                                          </tr>
                                                          <tr className="bg-gray-50 dark:bg-white/[0.02] text-gray-400 border-b border-gray-200 dark:border-white/8">
                                                            <th className="text-right px-3 py-1 font-medium border-l border-gray-200 dark:border-white/10 whitespace-nowrap text-gray-600 dark:text-gray-300">{year}</th>
                                                            <th className="text-right px-3 py-1 font-medium whitespace-nowrap opacity-60">{prevYear}</th>
                                                            <th className="text-right px-3 py-1 font-medium border-l border-gray-200 dark:border-white/10 whitespace-nowrap text-gray-600 dark:text-gray-300">{year}</th>
                                                            <th className="text-right px-3 py-1 font-medium whitespace-nowrap opacity-60">{prevYear}</th>
                                                            <th className="text-right px-3 py-1 font-medium border-l border-gray-200 dark:border-white/10 whitespace-nowrap text-gray-600 dark:text-gray-300">{year}</th>
                                                            <th className="text-right px-3 py-1 font-medium whitespace-nowrap opacity-60">{prevYear}</th>
                                                            <th className="text-right px-3 py-1 font-medium border-l border-gray-200 dark:border-white/10 whitespace-nowrap">฿</th>
                                                            <th className="text-right px-3 py-1 font-medium whitespace-nowrap">%</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="bg-white dark:bg-transparent">
                                                          {drillRows.map(({ my, label, cell, avgC, avgP, diff, diffPct }) => {
                                                            const dCls = diff == null ? "text-gray-300 dark:text-gray-700" : diff > 0 ? "text-red-500 dark:text-red-400" : "text-emerald-500 dark:text-emerald-400"
                                                            return (
                                                              <tr key={my} className="border-t border-gray-100 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                                                                <td className="py-1.5 pl-3 pr-4 text-gray-600 dark:text-gray-300 whitespace-nowrap font-medium">{label} {my.split("-")[0]}</td>
                                                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-100 border-l border-gray-100 dark:border-white/[0.04] whitespace-nowrap">{cell.curr > 0 ? fmtShort(cell.curr) : "—"}</td>
                                                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{cell.prev > 0 ? fmtShort(cell.prev) : "—"}</td>
                                                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 dark:text-gray-100 border-l border-gray-100 dark:border-white/[0.04] whitespace-nowrap">{cell.qty_curr > 0 ? fmt(cell.qty_curr) : "—"}</td>
                                                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{cell.qty_prev > 0 ? fmt(cell.qty_prev) : "—"}</td>
                                                                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-800 dark:text-gray-100 border-l border-gray-100 dark:border-white/[0.04] whitespace-nowrap">{avgC != null ? fmtDec(avgC) : "—"}</td>
                                                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{avgP != null ? fmtDec(avgP) : "—"}</td>
                                                                <td className={`px-3 py-1.5 text-right tabular-nums font-bold border-l border-gray-100 dark:border-white/[0.04] whitespace-nowrap ${dCls}`}>{diff != null ? `${diff > 0 ? "+" : ""}${fmtDec(diff)}` : "—"}</td>
                                                                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap ${dCls}`}>{diffPct != null ? fmtPct(diffPct) : "—"}</td>
                                                              </tr>
                                                            )
                                                          })}
                                                          {/* YTD row */}
                                                          <tr className="border-t-2 border-gray-300 dark:border-white/20 bg-gray-100/80 dark:bg-white/[0.05] font-bold">
                                                            <td className="py-2 pl-3 pr-4 text-gray-700 dark:text-gray-200 whitespace-nowrap">YTD รวม</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-100 border-l border-gray-200 dark:border-white/10 whitespace-nowrap">{fmt(p.total_curr)}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-gray-400 whitespace-nowrap">{fmt(p.total_prev)}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-100 border-l border-gray-200 dark:border-white/10 whitespace-nowrap">{p.usage_curr > 0 ? fmt(p.usage_curr) : "—"}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-gray-400 whitespace-nowrap">{p.usage_prev > 0 ? fmt(p.usage_prev) : "—"}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-gray-800 dark:text-gray-100 border-l border-gray-200 dark:border-white/10 whitespace-nowrap">{fmtDec(p.avg_curr)}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-gray-400 whitespace-nowrap">{fmtDec(p.avg_prev)}</td>
                                                            <td className={`px-3 py-2 text-right tabular-nums border-l border-gray-200 dark:border-white/10 whitespace-nowrap ${p.price_diff == null ? "text-gray-300" : p.price_diff > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{p.price_diff != null ? `${p.price_diff > 0 ? "+" : ""}${fmtDec(p.price_diff)}` : "—"}</td>
                                                            <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${p.price_diff_pct == null ? "text-gray-300" : p.price_diff_pct > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmtPct(p.price_diff_pct)}</td>
                                                          </tr>
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          )
                                        })}
                                      </React.Fragment>
                                    )
                                  })}
                                </React.Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {catOpen && cat.autoGroups.length === 0 && (
                      <div className="border-t border-gray-100 dark:border-white/8 px-5 py-6 text-center text-xs text-gray-400 bg-white dark:bg-white/3">
                        ไม่มีรายการ
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Filter sidebar ─────────────────────────────────────────────────── */}
      <div className="w-64 shrink-0 rounded-2xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-5 space-y-5 sticky top-4">
        <p className="text-sm font-semibold text-gray-700 dark:text-white">FILTERS</p>

        {/* Year */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5">Year</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const y = String(Number(year) - 1); setYear(y); setStartMonth(`${y}-01`); setEndMonth(`${y}-12`) }}
              className="rounded border border-gray-200 dark:border-white/10 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-white/5"
            >‹</button>
            <span className="flex-1 text-center text-sm font-bold text-gray-900 dark:text-white">{year}</span>
            <button
              onClick={() => { const y = String(Number(year) + 1); setYear(y); setStartMonth(`${y}-01`); setEndMonth(nowYM()) }}
              className="rounded border border-gray-200 dark:border-white/10 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-white/5"
            >›</button>
          </div>
        </div>

        {/* Date range */}
        <div>
          <p className="text-xs text-gray-400 mb-1.5">Date Range</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-8 shrink-0">From</span>
              <input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-8 shrink-0">To</span>
              <input type="month" value={endMonth} onChange={e => setEndMonth(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300" />
            </div>
          </div>
          <div className="flex gap-1.5 mt-2">
            {([
              ["YTD",        pickYTD],
              ["This Month", pickMonth],
              ["Full Year",  pickFull],
            ] as [string, () => void][]).map(([label, fn]) => (
              <button key={label} onClick={fn}
                className="flex-1 rounded-lg border border-gray-200 dark:border-white/10 px-1 py-1.5 text-[10px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 whitespace-nowrap">
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-1 text-xs text-gray-400 dark:text-[#98989D]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 dark:border-white/20 border-t-gray-600 dark:border-t-white/60" />
              กำลังโหลด…
            </div>
          )}
          <button
            onClick={() => fetchData(queryKey)}
            disabled={loading}
            className="w-full rounded-xl bg-gray-900 dark:bg-white py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition disabled:opacity-50"
          >
            ↺ Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
