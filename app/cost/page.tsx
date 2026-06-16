"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useSetAiContext } from "@/lib/ai-context"
import { AiInsightsPanel } from "@/components/ai-insights-panel"
import {
  Bar,
  Cell,
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

type CountsResult = {
  wd_count:      number
  plate_count:   number
  product_count: number
  total_cost:    number
  record_count:  number
}

type CostGroupRow = {
  group:    string
  curr:     number
  prev:     number
  change:   number
  pct:      number | null
}

type DetailLine = {
  จุดประสงค์:  string
  กลุ่มสินค้า:  string
  รหัสสินค้า:   string
  ชื่อสินค้า:   string
  ราคาทุน:     number | null
  ซัพพลายเออร์: string
  cost:          number
  records:       number
  sum_actual_issue?: number | null
  actual_issue?: number | null
  avg_actual_issue?: number | null
  sum_issue?: number | null
  qty?: number | null
  quantity?: number | null
  issue_qty?: number | null
}

type PlateDetailRow = {
  month_year:  string
  plate:       string
  wd:          string
  plate_total: number
  lines:       DetailLine[]
}

type GroupByField = "cost_group" | "จุดประสงค์ในการเบิก" | "กลุ่มสินค้า" | "partner_flag"

// ── Cost Group mapping ────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const LINE_COLORS = [
  "#111827", "#3B82F6", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#0891B2",
]

const MONTH_NUM_TO_LABEL: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: "cost_group",           label: "Cost Group" },
  { value: "จุดประสงค์ในการเบิก", label: "จุดประสงค์" },
  { value: "กลุ่มสินค้า",          label: "กลุ่มสินค้า" },
  { value: "partner_flag",         label: "Partner Flag" },
]

// API field to use for each GroupByField
const API_GROUP_BY: Record<GroupByField, string> = {
  "cost_group":           "จุดประสงค์ในการเบิก",
  "จุดประสงค์ในการเบิก": "จุดประสงค์ในการเบิก",
  "กลุ่มสินค้า":          "กลุ่มสินค้า",
  "partner_flag":         "partner_flag",
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

function formatDiff(v: number) {
  const sign = v >= 0 ? "+" : "−"
  return `${sign}${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toNum(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatQty(v: number) {
  return Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function formatAvgPrice(v: number | null) {
  if (v === null || !Number.isFinite(v)) return "—"
  return Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getLineUsage(line: DetailLine): number {
  return (
    toNum(line.sum_actual_issue) ||
    toNum(line.actual_issue) ||
    toNum(line.avg_actual_issue) ||
    toNum(line.sum_issue) ||
    toNum(line.qty) ||
    toNum(line.quantity) ||
    toNum(line.issue_qty) ||
    0
  )
}

function calcAvgPrice(totalCost: number, totalUsage: number, fallbackPrice?: number | null): number | null {
  if (totalUsage > 0) return totalCost / totalUsage
  if (fallbackPrice != null && Number.isFinite(Number(fallbackPrice))) return Number(fallbackPrice)
  return null
}

function getMonthsInRange(start: string, end: string): string[] {
  if (!start || !end) return []
  const [sy, sm] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)
  const months: string[] = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

function shiftYear(monthYear: string, delta: number): string {
  const [y, m] = monthYear.split("-")
  return `${Number(y) + delta}-${m}`
}

function nowYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

const COST_PASSWORD = "savecost15percent"
const COST_SESSION_KEY = "cost_authed"

export default function CostPage() {
  const todayYM   = nowYM()
  const todayYear = todayYM.split("-")[0]
  const setAiContext = useSetAiContext()

  // ── Password gate ─────────────────────────────────────────────────────────
  const [authed, setAuthed]         = useState(true)
  const [pwInput, setPwInput]       = useState("")
  const [pwError, setPwError]       = useState(false)

  function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwInput === COST_PASSWORD) {
      sessionStorage.setItem(COST_SESSION_KEY, "1")
      setAuthed(true)
      setPwError(false)
    } else {
      setPwError(true)
      setPwInput("")
    }
  }

  // ── Filter state ──────────────────────────────────────────────────────────
  const [year, setYear]             = useState(todayYear)
  const [startMonth, setStartMonth] = useState(`${todayYear}-01`)
  const [endMonth, setEndMonth]     = useState(todayYM)
  const [groupBy, setGroupBy]       = useState<GroupByField>("จุดประสงค์ในการเบิก")

  // ── Data state ────────────────────────────────────────────────────────────
  const [currSummary, setCurrSummary]   = useState<SummaryRow[]>([])
  const [prevSummary, setPrevSummary]   = useState<SummaryRow[]>([])
  // always by จุดประสงค์ฯ — for cost_group comparison section
  const [cgCurrRaw, setCgCurrRaw]       = useState<SummaryRow[]>([])
  const [cgPrevRaw, setCgPrevRaw]       = useState<SummaryRow[]>([])
  // distinct counts
  const [currCounts, setCurrCounts]     = useState<CountsResult | null>(null)
  const [prevCounts, setPrevCounts]     = useState<CountsResult | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState("")
  const [hasSearched, setHasSearched]   = useState(false)
  const [pgCurrRaw, setPgCurrRaw]       = useState<SummaryRow[]>([])
  const [pgPrevRaw, setPgPrevRaw]       = useState<SummaryRow[]>([])
  const [detailData, setDetailData]         = useState<PlateDetailRow[]>([])
  const [detailLoading, setDetailLoading]   = useState(false)
  const [detailFilter, setDetailFilter]     = useState("")
  const [workshopFilter, setWorkshopFilter] = useState<"all" | "อู่ใน" | "อู่นอก">("all")
  const [breakdownCurrDetail, setBreakdownCurrDetail] = useState<PlateDetailRow[]>([])
  const [breakdownPrevDetail, setBreakdownPrevDetail] = useState<PlateDetailRow[]>([])
  const [breakdownLoading, setBreakdownLoading]       = useState(false)
  const [expandedAutoGroups, setExpandedAutoGroups]       = useState<Set<string>>(new Set())
  const [expandedProductGroups, setExpandedProductGroups] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths]         = useState<Set<string>>(new Set())
  const [expandedCostGroups, setExpandedCostGroups] = useState<Set<string>>(new Set())
  const [expandedPlates, setExpandedPlates]         = useState<Set<string>>(new Set())

  // ── Warehouse chips ───────────────────────────────────────────────────────
  const availableWarehouses = useMemo<string[]>(() => {
    const s = new Set<string>()
    ;[...currSummary, ...prevSummary].forEach((r) => s.add(r.warehouse || "ไม่ระบุ"))
    return Array.from(s).sort()
  }, [currSummary, prevSummary])

  const [selectedWarehouses, setSelectedWarehouses]       = useState<Set<string>>(new Set())
  const [selectedPartnerFlags, setSelectedPartnerFlags]   = useState<Set<string>>(new Set())
  const [selectedGroupValues, setSelectedGroupValues]     = useState<Set<string>>(new Set())

  function toggleWarehouse(wh: string) {
    setSelectedWarehouses((prev) => {
      const next = new Set(prev)
      if (next.has(wh)) { next.delete(wh) } else { next.add(wh) }
      return next
    })
  }

  function togglePartnerFlag(v: string) {
    setSelectedPartnerFlags((prev) => {
      const next = new Set(prev)
      if (next.has(v)) { next.delete(v) } else { next.add(v) }
      return next
    })
  }

  function toggleGroupValue(v: string) {
    setSelectedGroupValues((prev) => {
      const next = new Set(prev)
      if (next.has(v)) { next.delete(v) } else { next.add(v) }
      return next
    })
  }

  // ── Available partner flags (from loaded data) ───────────────────────────
  const availablePartnerFlags = useMemo<string[]>(() => {
    const s = new Set<string>()
    ;[...currSummary, ...prevSummary].forEach((r) => {
      if (r.partner_flag) s.add(r.partner_flag)
    })
    return Array.from(s).sort()
  }, [currSummary, prevSummary])

  // ── Client-side warehouse + partner_flag filter ───────────────────────────
  const filteredCurr = useMemo(() =>
    currSummary.filter((r) => {
      if (selectedWarehouses.size > 0 && !selectedWarehouses.has(r.warehouse || "ไม่ระบุ")) return false
      if (selectedPartnerFlags.size > 0 && !selectedPartnerFlags.has(r.partner_flag))        return false
      return true
    }),
    [currSummary, selectedWarehouses, selectedPartnerFlags]
  )
  const filteredPrev = useMemo(() =>
    prevSummary.filter((r) => {
      if (selectedWarehouses.size > 0 && !selectedWarehouses.has(r.warehouse || "ไม่ระบุ")) return false
      if (selectedPartnerFlags.size > 0 && !selectedPartnerFlags.has(r.partner_flag))        return false
      return true
    }),
    [prevSummary, selectedWarehouses, selectedPartnerFlags]
  )

  // ── Apply cost_group mapping (re-aggregate after mapping) ────────────────
  const mappedCurr = useMemo(() => {
    if (groupBy !== "cost_group") return filteredCurr
    const map = new Map<string, SummaryRow>()
    filteredCurr.forEach((r) => {
      const group = getCostGroup(r.group_value)
      const key   = `${r.month_year}||${r.warehouse}||${group}`
      if (!map.has(key)) map.set(key, { ...r, group_value: group, total_cost: 0, record_count: 0 })
      const item = map.get(key)!
      item.total_cost   += r.total_cost
      item.record_count += r.record_count
    })
    return Array.from(map.values())
  }, [filteredCurr, groupBy])

  const mappedPrev = useMemo(() => {
    if (groupBy !== "cost_group") return filteredPrev
    const map = new Map<string, SummaryRow>()
    filteredPrev.forEach((r) => {
      const group = getCostGroup(r.group_value)
      const key   = `${r.month_year}||${r.warehouse}||${group}`
      if (!map.has(key)) map.set(key, { ...r, group_value: group, total_cost: 0, record_count: 0 })
      const item = map.get(key)!
      item.total_cost   += r.total_cost
      item.record_count += r.record_count
    })
    return Array.from(map.values())
  }, [filteredPrev, groupBy])

  // ── All group values sorted by cost (current year, filtered by warehouse) ──
  const allGroupValues = useMemo<{ value: string; total_cost: number }[]>(() => {
    const map = new Map<string, number>()
    mappedCurr.forEach((r) => {
      const k = r.group_value || "ไม่ระบุ"
      map.set(k, (map.get(k) || 0) + r.total_cost)
    })
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, total_cost]) => ({ value, total_cost }))
  }, [mappedCurr])

  // Lines to render = selectedGroupValues (or top 6 if nothing selected)
  const activeGroups = useMemo<string[]>(() => {
    if (selectedGroupValues.size > 0) return Array.from(selectedGroupValues)
    return allGroupValues.slice(0, 6).map((g) => g.value)
  }, [selectedGroupValues, allGroupValues])

  // ── Months in range ───────────────────────────────────────────────────────
  const months = useMemo(() => getMonthsInRange(startMonth, endMonth), [startMonth, endMonth])

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const rows = months.map((my) => {
      const prevMy   = shiftYear(my, -1)
      const mNum     = my.split("-")[1]
      const currRows = mappedCurr.filter((r) => r.month_year === my)
      const prevRows = mappedPrev.filter((r) => r.month_year === prevMy)

      const row: Record<string, any> = {
        month: MONTH_NUM_TO_LABEL[mNum] ?? mNum,
        total_curr: 0,
        total_prev: 0,
      }
      activeGroups.forEach((g) => {
        const c = currRows.filter((r) => r.group_value === g).reduce((s, r) => s + r.total_cost, 0)
        const p = prevRows.filter((r) => r.group_value === g).reduce((s, r) => s + r.total_cost, 0)
        row[`y_${g}`]    = c
        row[`prev_${g}`] = p
        row.total_curr  += c
        row.total_prev  += p
      })
      row.target   = row.total_prev > 0 ? row.total_prev * 0.85 : null
      row.pct_diff = row.total_prev > 0 ? ((row.total_curr - row.total_prev) / row.total_prev) * 100 : null
      row.val_diff = row.total_curr - row.total_prev
      row.pct_label = row.pct_diff != null
        ? `${row.pct_diff >= 0 ? "+" : ""}${(row.pct_diff as number).toFixed(1)}%`
        : ""
      return row
    })

    // append YTD summary bar
    const ytd_curr = rows.reduce((s, r) => s + r.total_curr, 0)
    const ytd_prev = rows.reduce((s, r) => s + r.total_prev, 0)
    const ytd_pct  = ytd_prev > 0 ? ((ytd_curr - ytd_prev) / ytd_prev) * 100 : null
    rows.push({
      month:       "YTD",
      total_curr:  ytd_curr,
      total_prev:  ytd_prev,
      target:      ytd_prev > 0 ? ytd_prev * 0.85 : null,
      pct_diff:    ytd_pct,
      val_diff:    ytd_curr - ytd_prev,
      pct_label:   ytd_pct != null ? `${ytd_pct >= 0 ? "+" : ""}${ytd_pct.toFixed(1)}%` : "",
      isYTD:       true,
    })
    return rows
  }, [months, mappedCurr, mappedPrev, activeGroups])

  // ── Summary KPIs ──────────────────────────────────────────────────────────
  const totalCurr = useMemo(() => mappedCurr.reduce((s, r) => s + r.total_cost, 0), [mappedCurr])
  const totalPrev = useMemo(() => mappedPrev.reduce((s, r) => s + r.total_cost, 0), [mappedPrev])
  const yoy = totalPrev > 0 ? ((totalCurr - totalPrev) / totalPrev) * 100 : null

  // ── Cost Group YoY comparison (always by จุดประสงค์ฯ mapping) ────────────
  const costGroupComparison = useMemo<CostGroupRow[]>(() => {
    // apply warehouse + partner_flag filter to the dedicated cg raw data
    const filter = (rows: SummaryRow[]) => rows.filter((r) => {
      if (selectedWarehouses.size > 0   && !selectedWarehouses.has(r.warehouse || "ไม่ระบุ")) return false
      if (selectedPartnerFlags.size > 0 && !selectedPartnerFlags.has(r.partner_flag))         return false
      return true
    })
    const applyMap = (rows: SummaryRow[]) => {
      const m = new Map<string, number>()
      rows.forEach((r) => {
        const g = getCostGroup(r.group_value)
        m.set(g, (m.get(g) || 0) + r.total_cost)
      })
      return m
    }

    const currMap = applyMap(filter(cgCurrRaw))
    const prevMap = applyMap(filter(cgPrevRaw))
    const allGroups = new Set([...currMap.keys(), ...prevMap.keys()])

    return Array.from(allGroups)
      .map((group) => {
        const curr   = currMap.get(group) || 0
        const prev   = prevMap.get(group) || 0
        const change = curr - prev
        const pct    = prev > 0 ? (change / prev) * 100 : null
        return { group, curr, prev, change, pct }
      })
      .sort((a, b) => {
        const ORDER = ["CM", "PM", "AC", "T -", "Other", "Tools"]
        const ai = ORDER.findIndex((k) => a.group.startsWith(k))
        const bi = ORDER.findIndex((k) => b.group.startsWith(k))
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
  }, [cgCurrRaw, cgPrevRaw, selectedWarehouses, selectedPartnerFlags])

  // ── Product breakdown: follows Monthly Cost filter, then groups by Auto Group → กลุ่มสินค้า → รหัสสินค้า ──
  type ByMonthCell = { curr: number; prev: number; qty_curr: number; qty_prev: number }

  type ProductCodeBreakdownRow = {
    key: string
    auto_group: string
    product_group: string
    product_code: string
    product_name: string
    byMonth: Record<string, ByMonthCell>
    total_curr: number
    total_prev: number
    usage_curr: number
    usage_prev: number
    fallback_price_curr: number | null
    fallback_price_prev: number | null
  }

  type ProductGroupBreakdownRow = {
    key: string
    auto_group: string
    product_group: string
    products: ProductCodeBreakdownRow[]
    byMonth: Record<string, ByMonthCell>
    total_curr: number
    total_prev: number
    usage_curr: number
    usage_prev: number
  }

  type AutoGroupBreakdownRow = {
    key: string
    auto_group: string
    product_groups: ProductGroupBreakdownRow[]
    byMonth: Record<string, ByMonthCell>
    total_curr: number
    total_prev: number
    usage_curr: number
    usage_prev: number
  }

  const PRODUCT_AUTO_GROUP_MAP: Record<string, "ค่าแรง" | "ยาง" | "อะไหล่" | "อื่นๆ"> = {
    // ── ยาง ─────────────────────────────────────────────
    "ยาง": "ยาง",
    "เครื่องมือยาง": "ยาง",

    // ── ค่าแรง ─────────────────────────────────────────
    "ค่าแรง": "ค่าแรง",
    "ค่าแรง-ระบบโม่": "ค่าแรง",
    "ค่าแรง-ระบบเบรค ครัช เกียร์": "ค่าแรง",
    "ค่าแรง-ระบบช่วงล่าง": "ค่าแรง",
    "ค่าแรง-ระบบเครื่องยนต์": "ค่าแรง",
    "ค่าแรง-ระบบแอร์ ไฟฟ้า": "ค่าแรง",
    "ค่าแรง-ระบบหาง": "ค่าแรง",
    "ค่าแรง-อุปกรณ์เสริม": "ค่าแรง",
    "ค่าแรง-ระบบบำรุงรักษา": "ค่าแรง",
    "ค่าแรง-หัวเก๋ง": "ค่าแรง",
    "ค่าแรง-ระบบยาง": "ค่าแรง",

    // ── อะไหล่ ─────────────────────────────────────────
    "ระบบบำรุงรักษา": "อะไหล่",
    "ระบบช่วงล่าง": "อะไหล่",
    "ระบบเบรคคลัทช์": "อะไหล่",
    "ระบบเครื่องยนต์": "อะไหล่",
    "ระบบแอร์&ระบบไฟ": "อะไหล่",
    "ระบบโม่": "อะไหล่",
    "วัสดุสิ้นเปลือง": "อะไหล่",
    "อุปกรณ์เสริม": "อะไหล่",
    "ระบบเบรค -คลัทช์-เกียร์": "อะไหล่",
    "ระบบอุปกรณ์เสริม": "อะไหล่",
    "ระบบหาง": "อะไหล่",
    "ระบบแอร์ - ไฟ": "อะไหล่",
    "ระบบหัวเก๋ง": "อะไหล่",
    "บำรุงรักษา": "อะไหล่",
    "อุปกรณ์รถอาหารสัตว์": "อะไหล่",
    "อะไหล่เก่า": "อะไหล่",
    "ระบบวัสดุสิ้นเปลือง": "อะไหล่",
    "เครื่องยนต์": "อะไหล่",
    "เครื่องมือช่าง": "อะไหล่",
    "ช่วงล่าง": "อะไหล่",
    "สดุอุปกรณ์ไฟฟ้า": "อะไหล่",
    "เครื่องมือช่าง (ประจำรถ)": "อะไหล่",
    "เครื่องมือรถ": "อะไหล่",

    // ── อื่นๆ ─────────────────────────────────────────
    "อื่นๆ": "อื่นๆ",
    "น้ำมันเชื้อเพลิง": "อื่นๆ",
    "DEAD STOCK": "อื่นๆ",
  }

  // Merge กลุ่มสินค้า names that mean the same thing across different warehouses:
  // LB=ลาดกระบัง · S=สระบุรี · MDD=DIST · KK=ขอนแก่น each named groups differently
  const GROUP_NORMALIZE_MAP: Record<string, string> = {
    "บำรุงรักษา":                 "ระบบบำรุงรักษา",   // MDD → LB/S/KK name
    "ระบบเบรค -คลัทช์-เกียร์":  "ระบบเบรคคลัทช์",   // S → LB/KK/MDD name
    "ระบบแอร์ - ไฟ":             "ระบบแอร์&ระบบไฟ",  // S → LB/KK/MDD name
    "ระบบอุปกรณ์เสริม":          "อุปกรณ์เสริม",      // S/MDD → LB/KK name
    "ระบบวัสดุสิ้นเปลือง":       "วัสดุสิ้นเปลือง",   // S → LB/KK/MDD name
    "เครื่องยนต์":               "ระบบเครื่องยนต์",   // MDD/LB (some rows) → canonical
    "ช่วงล่าง":                  "ระบบช่วงล่าง",      // MDD → LB/S/KK name
  }

  function normalizeProductGroup(productGroup: string): string {
    const trimmed = (productGroup || "").replace(/\s+/g, " ").trim()
    return GROUP_NORMALIZE_MAP[trimmed] ?? trimmed
  }

  function getAutoProductGroup(productGroup: string): "ค่าแรง" | "ยาง" | "อะไหล่" | "อื่นๆ" {
    const value = normalizeProductGroup(productGroup)

    if (!value || value === "ไม่ระบุ") return "อื่นๆ"

    // 1) exact mapping from known product groups
    if (PRODUCT_AUTO_GROUP_MAP[value]) {
      return PRODUCT_AUTO_GROUP_MAP[value]
    }

    // 2) rule-based auto detect
    // Important: check ค่าแรง first, so "ค่าแรง-ระบบยาง" stays in ค่าแรง.
    if (value.startsWith("ค่าแรง")) return "ค่าแรง"

    // Tire-related groups
    if (value.startsWith("ยาง")) return "ยาง"
    if (value.includes("ยาง") && !value.startsWith("ค่าแรง")) return "ยาง"

    // Other / non-maintenance expense groups
    if (
      value.startsWith("อื่น") ||
      value.includes("DEAD STOCK") ||
      value.includes("น้ำมันเชื้อเพลิง")
    ) {
      return "อื่นๆ"
    }

    // Default: vehicle systems, spare parts, materials, tools, equipment
    return "อะไหล่"
  }

  function getLineGroupValue(line: DetailLine): string {
    if (groupBy === "cost_group") return getCostGroup(line.จุดประสงค์ || "")
    if (groupBy === "จุดประสงค์ในการเบิก") return line.จุดประสงค์ || "ไม่ระบุ"
    if (groupBy === "กลุ่มสินค้า") return line.กลุ่มสินค้า || "ไม่ระบุ"

    // partner_flag is not available at line level in /api/cost/detail.
    // The partner filter is applied in the API request when selectedPartnerFlags is set.
    return ""
  }

  function shouldIncludeBreakdownLine(line: DetailLine): boolean {
    // For partner_flag mode, rely on the API parameter partner_flag.
    if (groupBy === "partner_flag") return true

    // No explicit chip filter selected → show every group in the breakdown table.
    // (activeGroups otherwise defaults to only the chart's top-6-by-cost values,
    // which silently hid most กลุ่มสินค้า/จุดประสงค์ rows since there are far
    // more than 6 distinct values for those fields — see cost page bug report.)
    if (selectedGroupValues.size === 0) return true

    const lineGroup = getLineGroupValue(line)
    return activeGroups.includes(lineGroup)
  }

  function toggleAutoGroup(key: string) {
    setExpandedAutoGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleProductGroup(key: string) {
    setExpandedProductGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const autoGroupBreakdownRows = useMemo<AutoGroupBreakdownRow[]>(() => {
    const productMap = new Map<string, ProductCodeBreakdownRow>()

    const ensureProduct = (line: DetailLine, month: string) => {
      const productGroup = line.กลุ่มสินค้า || "ไม่ระบุ"
      const autoGroup = getAutoProductGroup(productGroup)
      const productCode = line.รหัสสินค้า || "ไม่ระบุ"
      const productName = line.ชื่อสินค้า || ""
      const key = `${autoGroup}||${productGroup}||${productCode}||${productName}`

      if (!productMap.has(key)) {
        productMap.set(key, {
          key,
          auto_group: autoGroup,
          product_group: productGroup,
          product_code: productCode,
          product_name: productName,
          byMonth: {},
          total_curr: 0,
          total_prev: 0,
          usage_curr: 0,
          usage_prev: 0,
          fallback_price_curr: null,
          fallback_price_prev: null,
        })
      }

      const row = productMap.get(key)!
      if (!row.byMonth[month]) row.byMonth[month] = { curr: 0, prev: 0, qty_curr: 0, qty_prev: 0 }
      return row
    }

    breakdownCurrDetail.forEach((plateRow) => {
      ;(plateRow.lines || []).forEach((line) => {
        if (!shouldIncludeBreakdownLine(line)) return

        const usage = getLineUsage(line)
        const row = ensureProduct(line, plateRow.month_year)
        row.byMonth[plateRow.month_year].curr     += line.cost
        row.byMonth[plateRow.month_year].qty_curr += usage
        row.total_curr += line.cost
        row.usage_curr += usage
        if (row.fallback_price_curr == null && line.ราคาทุน != null) row.fallback_price_curr = line.ราคาทุน
      })
    })

    breakdownPrevDetail.forEach((plateRow) => {
      const alignedMonth = shiftYear(plateRow.month_year, 1)

      ;(plateRow.lines || []).forEach((line) => {
        if (!shouldIncludeBreakdownLine(line)) return

        const usage = getLineUsage(line)
        const row = ensureProduct(line, alignedMonth)
        row.byMonth[alignedMonth].prev     += line.cost
        row.byMonth[alignedMonth].qty_prev += usage
        row.total_prev += line.cost
        row.usage_prev += usage
        if (row.fallback_price_prev == null && line.ราคาทุน != null) row.fallback_price_prev = line.ราคาทุน
      })
    })

    const productGroupMap = new Map<string, ProductGroupBreakdownRow>()

    Array.from(productMap.values()).forEach((product) => {
      const groupKey = `${product.auto_group}||${product.product_group}`

      if (!productGroupMap.has(groupKey)) {
        productGroupMap.set(groupKey, {
          key: groupKey,
          auto_group: product.auto_group,
          product_group: product.product_group,
          products: [],
          byMonth: {},
          total_curr: 0,
          total_prev: 0,
          usage_curr: 0,
          usage_prev: 0,
        })
      }

      const group = productGroupMap.get(groupKey)!
      group.products.push(product)
      group.total_curr += product.total_curr
      group.total_prev += product.total_prev
      group.usage_curr += product.usage_curr
      group.usage_prev += product.usage_prev

      Object.entries(product.byMonth).forEach(([month, value]) => {
        if (!group.byMonth[month]) group.byMonth[month] = { curr: 0, prev: 0, qty_curr: 0, qty_prev: 0 }
        group.byMonth[month].curr     += value.curr
        group.byMonth[month].prev     += value.prev
        group.byMonth[month].qty_curr += value.qty_curr
        group.byMonth[month].qty_prev += value.qty_prev
      })
    })

    const autoGroupMap = new Map<string, AutoGroupBreakdownRow>()

    Array.from(productGroupMap.values()).forEach((productGroup) => {
      const autoKey = productGroup.auto_group

      if (!autoGroupMap.has(autoKey)) {
        autoGroupMap.set(autoKey, {
          key: autoKey,
          auto_group: autoKey,
          product_groups: [],
          byMonth: {},
          total_curr: 0,
          total_prev: 0,
          usage_curr: 0,
          usage_prev: 0,
        })
      }

      const autoGroup = autoGroupMap.get(autoKey)!
      autoGroup.product_groups.push({
        ...productGroup,
        products: productGroup.products.sort((a, b) => b.total_curr - a.total_curr),
      })
      autoGroup.total_curr += productGroup.total_curr
      autoGroup.total_prev += productGroup.total_prev
      autoGroup.usage_curr += productGroup.usage_curr
      autoGroup.usage_prev += productGroup.usage_prev

      Object.entries(productGroup.byMonth).forEach(([month, value]) => {
        if (!autoGroup.byMonth[month]) autoGroup.byMonth[month] = { curr: 0, prev: 0, qty_curr: 0, qty_prev: 0 }
        autoGroup.byMonth[month].curr     += value.curr
        autoGroup.byMonth[month].prev     += value.prev
        autoGroup.byMonth[month].qty_curr += value.qty_curr
        autoGroup.byMonth[month].qty_prev += value.qty_prev
      })
    })

    const ORDER = ["ค่าแรง", "ยาง", "อะไหล่", "อื่นๆ"]

    return Array.from(autoGroupMap.values())
      .map((autoGroup) => ({
        ...autoGroup,
        product_groups: autoGroup.product_groups.sort((a, b) => b.total_curr - a.total_curr),
      }))
      .sort((a, b) => {
        const ai = ORDER.indexOf(a.auto_group)
        const bi = ORDER.indexOf(b.auto_group)
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        return b.total_curr - a.total_curr
      })
  }, [breakdownCurrDetail, breakdownPrevDetail, groupBy, activeGroups, selectedGroupValues])

  // ── Fetch — 8 parallel calls ──────────────────────────────────────────────
  async function search() {
    try {
      setLoading(true)
      setError("")

      const prevStart = shiftYear(startMonth, -1)
      const prevEnd   = shiftYear(endMonth,   -1)

      const apiField  = API_GROUP_BY[groupBy]
      const cgField   = encodeURIComponent("จุดประสงค์ในการเบิก")
      const pgField   = encodeURIComponent("กลุ่มสินค้า")

      const summaryUrl = (start: string, end: string, field: string) =>
        `/api/cost/summary?start=${start}&end=${end}&group_by=${field}`
      const countsUrl  = (start: string, end: string) =>
        `/api/cost/counts?start=${start}&end=${end}`

      const [rCurr, rPrev, rCgCurr, rCgPrev, rCntCurr, rCntPrev, rPgCurr, rPgPrev] = await Promise.all([
        fetch(summaryUrl(startMonth, endMonth, encodeURIComponent(apiField)), { cache: "no-store" }),
        fetch(summaryUrl(prevStart,  prevEnd,  encodeURIComponent(apiField)), { cache: "no-store" }),
        fetch(summaryUrl(startMonth, endMonth, cgField),  { cache: "no-store" }),
        fetch(summaryUrl(prevStart,  prevEnd,  cgField),  { cache: "no-store" }),
        fetch(countsUrl(startMonth,  endMonth),           { cache: "no-store" }),
        fetch(countsUrl(prevStart,   prevEnd),            { cache: "no-store" }),
        fetch(summaryUrl(startMonth, endMonth, pgField),  { cache: "no-store" }),
        fetch(summaryUrl(prevStart,  prevEnd,  pgField),  { cache: "no-store" }),
      ])

      const [jCurr, jPrev, jCgCurr, jCgPrev, jCntCurr, jCntPrev, jPgCurr, jPgPrev] = await Promise.all([
        rCurr.json(), rPrev.json(), rCgCurr.json(), rCgPrev.json(), rCntCurr.json(), rCntPrev.json(),
        rPgCurr.json(), rPgPrev.json(),
      ])

      if (!rCurr.ok) throw new Error(jCurr.error || "Failed to fetch")

      setCurrSummary(jCurr.data || [])
      setPrevSummary(jPrev.data || [])
      setCgCurrRaw(jCgCurr.data || [])
      setCgPrevRaw(jCgPrev.data || [])
      setCurrCounts(jCntCurr.success ? jCntCurr.data : null)
      setPrevCounts(jCntPrev.success ? jCntPrev.data : null)
      setPgCurrRaw(jPgCurr.data || [])
      setPgPrevRaw(jPgPrev.data || [])
      setSelectedWarehouses(new Set())
      setSelectedPartnerFlags(new Set())
      setSelectedGroupValues(new Set())
      setExpandedAutoGroups(new Set())
      setExpandedProductGroups(new Set())
      setHasSearched(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Quick date picks ──────────────────────────────────────────────────────
  function pickYTD() {
    setStartMonth(`${year}-01`)
    setEndMonth(`${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`)
  }
  function pickCurrentMonth() {
    const m = String(new Date().getMonth() + 1).padStart(2, "0")
    setStartMonth(`${year}-${m}`)
    setEndMonth(`${year}-${m}`)
  }
  function pickFullYear() {
    setStartMonth(`${year}-01`)
    setEndMonth(`${year}-12`)
  }

  // Auto-load detail data for the Cost Breakdown table.
  // This lets the table keep the Monthly Cost filter, then break it down by กลุ่มสินค้า + รหัสสินค้า.
  useEffect(() => {
    if (!hasSearched) return

    let cancelled = false

    async function loadBreakdownDetail() {
      try {
        setBreakdownLoading(true)

        const prevStart = shiftYear(startMonth, -1)
        const prevEnd = shiftYear(endMonth, -1)

        const makeParams = (start: string, end: string) => {
          const params = new URLSearchParams({ start, end })

          if (selectedWarehouses.size > 0) {
            params.set("warehouse", Array.from(selectedWarehouses).join(","))
          }

          if (selectedPartnerFlags.size > 0) {
            params.set("partner_flag", Array.from(selectedPartnerFlags).join(","))
          }

          return params
        }

        const [rCurr, rPrev] = await Promise.all([
          fetch(`/api/cost/detail?${makeParams(startMonth, endMonth)}`, { cache: "no-store" }),
          fetch(`/api/cost/detail?${makeParams(prevStart, prevEnd)}`, { cache: "no-store" }),
        ])

        const [jCurr, jPrev] = await Promise.all([rCurr.json(), rPrev.json()])

        if (cancelled) return

        setBreakdownCurrDetail(jCurr.success ? jCurr.data || [] : [])
        setBreakdownPrevDetail(jPrev.success ? jPrev.data || [] : [])
      } catch (e) {
        if (!cancelled) {
          setBreakdownCurrDetail([])
          setBreakdownPrevDetail([])
        }
      } finally {
        if (!cancelled) setBreakdownLoading(false)
      }
    }

    loadBreakdownDetail()

    return () => {
      cancelled = true
    }
  }, [
    hasSearched,
    startMonth,
    endMonth,
    selectedWarehouses,
    selectedPartnerFlags,
    groupBy,
    activeGroups,
  ])

  async function loadDetail() {
    setDetailLoading(true)
    setDetailData([])
    setExpandedMonths(new Set())
    setExpandedCostGroups(new Set())
    setExpandedPlates(new Set())
    try {
      const params = new URLSearchParams({ start: startMonth, end: endMonth })
      if (selectedWarehouses.size > 0)
        params.set("warehouse", Array.from(selectedWarehouses).join(","))
      if (selectedPartnerFlags.size === 1)
        params.set("partner_flag", Array.from(selectedPartnerFlags)[0])
      const r = await fetch(`/api/cost/detail?${params}`, { cache: "no-store" })
      const j = await r.json()
      if (j.success) setDetailData(j.data || [])
    } catch (e: any) {
      console.error(e)
    } finally {
      setDetailLoading(false)
    }
  }

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function toggleCostGroup(key: string) {
    setExpandedCostGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function togglePlate(key: string) {
    setExpandedPlates((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const prevYear = String(Number(year) - 1)

  // ── AI context — feeds the global chat widget ─────────────────────────────
  function buildDataContext(): string {
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    const lines: string[] = []

    // ── 0. Definitions ───────────────────────────────────────────────────────
    lines.push("=== PAGE: Cost Monitoring Dashboard ===")
    lines.push("METRIC DEFINITIONS:")
    lines.push("- Total Cost: Sum of all maintenance & repair expenses (THB)")
    lines.push("- YoY Change: (Current Year Cost − Previous Year Cost) / Previous Year Cost × 100%")
    lines.push("- PM (Preventive Maintenance): Planned oil changes, chassis, cooling system")
    lines.push("- CM (Corrective Maintenance): Unscheduled repairs, spare parts, other reactive costs")
    lines.push("- T - Tire: All tire-related costs")
    lines.push("- AC - Accident Repair: Collision and accident damage repairs")
    lines.push("- Tools & Equipment: Mechanic tools and personal equipment")
    lines.push("MANAGEMENT TARGETS:")
    lines.push("- Reduce total cost by 15% YoY → Target = prev year × 0.85")
    lines.push("- YoY < -15% = Met target (GOOD) | -15%–0% = Improving | >0% = OVERSPENDING (BAD)")
    lines.push("- Higher PM vs CM ratio = better (proactive > reactive maintenance)")
    lines.push("")

    // ── 1. Overview ──────────────────────────────────────────────────────────
    lines.push("=== OVERVIEW ===")
    lines.push(`Period: ${startMonth} to ${endMonth}`)
    lines.push(`Current year: ${year} | Previous year: ${prevYear}`)
    lines.push(`Total Cost ${year}: ${fmt(totalCurr)} THB`)
    lines.push(`Total Cost ${prevYear}: ${fmt(totalPrev)} THB`)
    lines.push(`YoY Change: ${yoy !== null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : "N/A"} (${fmt(totalCurr - totalPrev)} THB)`)
    if (currCounts) lines.push(`${year} fleet: ${currCounts.wd_count} WDs, ${currCounts.plate_count} plates, ${currCounts.product_count} products`)
    if (prevCounts) lines.push(`${prevYear} fleet: ${prevCounts.wd_count} WDs, ${prevCounts.plate_count} plates, ${prevCounts.product_count} products`)
    if (selectedWarehouses.size > 0) lines.push(`Warehouse filter: ${Array.from(selectedWarehouses).join(", ")}`)
    if (selectedPartnerFlags.size > 0) lines.push(`Partner flag filter: ${Array.from(selectedPartnerFlags).join(", ")}`)

    // ── 2. Monthly trend ─────────────────────────────────────────────────────
    lines.push("")
    lines.push("=== MONTHLY TREND ===")
    lines.push(`Month | ${year} Cost | ${prevYear} Cost | YoY%`)
    months.forEach((m) => {
      const mLabel = MONTH_NUM_TO_LABEL[m.split("-")[1]] ?? m
      const curr = mappedCurr.filter((r) => r.month_year === m).reduce((s, r) => s + r.total_cost, 0)
      const prev = mappedPrev.filter((r) => r.month_year === shiftYear(m, -1)).reduce((s, r) => s + r.total_cost, 0)
      const pct  = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : "N/A"
      lines.push(`${mLabel} ${m}: ${fmt(curr)} | ${fmt(prev)} | ${pct}%`)
    })

    // ── 3. Cost group comparison ──────────────────────────────────────────────
    lines.push("")
    lines.push("=== COST GROUP COMPARISON ===")
    lines.push(`Group | ${year} | ${prevYear} | Change | YoY%`)
    costGroupComparison.forEach((cg) => {
      const pct = cg.pct !== null ? `${cg.pct >= 0 ? "+" : ""}${cg.pct.toFixed(1)}%` : "N/A"
      lines.push(`${cg.group}: ${fmt(cg.curr)} | ${fmt(cg.prev)} | ${fmt(cg.change)} | ${pct}`)
    })

    // ── 4. Full product breakdown ─────────────────────────────────────────────
    lines.push("")
    lines.push("=== PRODUCT BREAKDOWN (Auto Group → กลุ่มสินค้า → รหัสสินค้า) ===")
    autoGroupBreakdownRows.forEach((ag) => {
      const agPct = ag.total_prev > 0 ? ((ag.total_curr - ag.total_prev) / ag.total_prev * 100).toFixed(1) : "N/A"
      lines.push(``)
      lines.push(`[${ag.auto_group}] ${year}: ${fmt(ag.total_curr)} THB | ${prevYear}: ${fmt(ag.total_prev)} THB | YoY: ${agPct}% | Usage ${year}: ${ag.usage_curr} | Usage ${prevYear}: ${ag.usage_prev}`)

      ag.product_groups.forEach((pg) => {
        const pgPct = pg.total_prev > 0 ? ((pg.total_curr - pg.total_prev) / pg.total_prev * 100).toFixed(1) : "N/A"
        lines.push(`  กลุ่ม: ${pg.product_group} | ${year}: ${fmt(pg.total_curr)} | ${prevYear}: ${fmt(pg.total_prev)} | YoY: ${pgPct}% | Usage ${year}: ${pg.usage_curr}`)

        pg.products.forEach((p) => {
          const pPct = p.total_prev > 0 ? ((p.total_curr - p.total_prev) / p.total_prev * 100).toFixed(1) : "N/A"
          const avgCurr = p.usage_curr > 0 ? fmt(p.total_curr / p.usage_curr) : (p.fallback_price_curr != null ? fmt(p.fallback_price_curr) : "-")
          const avgPrev = p.usage_prev > 0 ? fmt(p.total_prev / p.usage_prev) : (p.fallback_price_prev != null ? fmt(p.fallback_price_prev) : "-")
          lines.push(`    ${p.product_code} | ${p.product_name} | ${year}: ${fmt(p.total_curr)} THB (qty:${p.usage_curr} avg:${avgCurr}) | ${prevYear}: ${fmt(p.total_prev)} THB (qty:${p.usage_prev} avg:${avgPrev}) | YoY: ${pPct}%`)
        })
      })
    })

    // ── 5. Plate-level data ───────────────────────────────────────────────────
    lines.push("")
    if (detailData.length > 0) {
      lines.push("=== PLATE COST DETAIL ===")
      // Aggregate per plate across all months
      const plateTotals = new Map<string, { wd: string; total: number; months: Map<string, number> }>()
      detailData.forEach((r) => {
        if (!plateTotals.has(r.plate)) plateTotals.set(r.plate, { wd: r.wd, total: 0, months: new Map() })
        const p = plateTotals.get(r.plate)!
        p.total += r.plate_total
        p.months.set(r.month_year, (p.months.get(r.month_year) || 0) + r.plate_total)
      })
      const sorted = Array.from(plateTotals.entries()).sort((a, b) => b[1].total - a[1].total)
      lines.push(`Plate | WD | Total Cost ${year}`)
      sorted.forEach(([plate, v], i) => {
        lines.push(`${i + 1}. ${plate} (WD: ${v.wd}): ${fmt(v.total)} THB`)
      })

      // Top 10 plates with their top cost items
      lines.push("")
      lines.push("=== TOP 10 PLATES — COST BREAKDOWN ===")
      sorted.slice(0, 10).forEach(([plate, v]) => {
        lines.push(`${plate} (WD: ${v.wd}) total: ${fmt(v.total)} THB`)
        // Find the lines for this plate
        const plateRows = detailData.filter((r) => r.plate === plate)
        const itemMap = new Map<string, { name: string; cost: number }>()
        plateRows.forEach((r) => (r.lines || []).forEach((l) => {
          const key = l.รหัสสินค้า || l.ชื่อสินค้า || "unknown"
          if (!itemMap.has(key)) itemMap.set(key, { name: l.ชื่อสินค้า || l.รหัสสินค้า || "", cost: 0 })
          itemMap.get(key)!.cost += l.cost
        }))
        Array.from(itemMap.entries())
          .sort((a, b) => b[1].cost - a[1].cost)
          .slice(0, 5)
          .forEach(([code, item]) => lines.push(`  ${code} ${item.name}: ${fmt(item.cost)} THB`))
      })
    } else {
      lines.push("(Plate detail not loaded — user can click 'Load Detail' for plate-level data)")
    }

    return lines.join("\n")
  }

  // Push to global AI chat widget whenever data changes
  useEffect(() => {
    if (!hasSearched) return
    setAiContext(buildDataContext(), `Cost ${startMonth}–${endMonth}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSearched, mappedCurr, mappedPrev, currCounts, prevCounts, detailData, costGroupComparison, autoGroupBreakdownRows])

  // ── Render ────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900">Cost Monitoring</h1>
          <p className="mt-1 text-xs text-gray-400">Enter password to access this page</p>
          <form onSubmit={submitPassword} className="mt-6 space-y-4">
            <input
              type="password"
              value={pwInput}
              onChange={(e) => { setPwInput(e.target.value); setPwError(false) }}
              placeholder="Password"
              autoFocus
              className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${pwError ? "border-red-300 focus:ring-red-200" : "focus:ring-gray-300"}`}
            />
            {pwError && <p className="text-xs text-red-500">Incorrect password — try again</p>}
            <button type="submit" className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 transition">
              Access
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-5 items-start">

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">Cost Monitoring</h1>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-500 tracking-wide">v0.3.0-beta</span>
            </div>
            <p className="text-xs text-gray-400">Month-on-month cost — {year} vs {prevYear}</p>
          </div>
          {loading && <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400 animate-pulse">Loading…</span>}
        </div>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* ── KPI row ────────────────────────────────────────────────────── */}
        {hasSearched && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border bg-white px-5 py-4">
              <p className="text-xs text-gray-400">{year} Total Cost</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{formatShort(totalCurr)}</p>
              <p className="mt-0.5 text-xs text-gray-400">{formatNumber(totalCurr)}</p>
            </div>
            <div className="rounded-2xl border bg-white px-5 py-4">
              <p className="text-xs text-gray-400">{prevYear} Total Cost</p>
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
                  <p className="mt-0.5 text-xs text-gray-400">vs {prevYear}</p>
                </>
              ) : (
                <p className="mt-1 text-lg font-bold text-gray-300">—</p>
              )}
            </div>
            {currCounts && (
              <div className="rounded-2xl border bg-white px-5 py-4">
                <p className="text-xs text-gray-400">Fleet {year}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{currCounts.plate_count}</p>
                <p className="mt-0.5 text-xs text-gray-400">{currCounts.wd_count} WDs · {currCounts.product_count} products</p>
              </div>
            )}
          </div>
        )}


      {/* ── AI Insights ──────────────────────────────────────────────────── */}
      {hasSearched && <AiInsightsPanel />}

      {/* ── Cost Group YoY comparison ─────────────────────────────────────── */}
      {hasSearched && costGroupComparison.length > 0 && (
        <div className="rounded-2xl border bg-white px-5 py-4">
          <div className="mb-3">
            <p className="text-xs font-semibold text-gray-700">Cost Group — YoY Comparison</p>
          </div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {costGroupComparison.map((row) => {
              const isUp   = row.change > 0
              const isDown = row.change < 0
              const pctColor = isUp ? "text-red-500" : isDown ? "text-emerald-600" : "text-gray-400"
              const maxCost  = Math.max(...costGroupComparison.map((r) => Math.max(r.curr, r.prev)))
              const currW    = maxCost > 0 ? (row.curr / maxCost) * 100 : 0
              const prevW    = maxCost > 0 ? (row.prev / maxCost) * 100 : 0
              return (
                <div key={row.group} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="truncate text-[10px] font-medium text-gray-400">{row.group}</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{formatShort(row.curr)}</p>
                  <div className="mt-0.5 text-[10px] text-gray-400">{formatShort(row.prev)}</div>
                  {row.pct !== null ? (
                    <div className={`mt-0.5 text-[10px] font-semibold ${pctColor}`}>
                      {isUp ? "▲" : "▼"} {Math.abs(row.pct).toFixed(1)}%
                      <span className="ml-1 font-normal opacity-80">
                        ({isUp ? "+" : "−"}{formatShort(Math.abs(row.change))})
                      </span>
                    </div>
                  ) : <div className="mt-0.5 text-[10px] text-gray-300">—</div>}
                  <div className="mt-2 space-y-0.5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-gray-800" style={{ width: `${Math.min(currW, 100)}%` }} />
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-gray-300" style={{ width: `${Math.min(prevW, 100)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Bar Chart ────────────────────────────────────────────────────── */}
      {hasSearched && chartData.length > 0 ? (
        <div className="rounded-2xl border bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-800">Monthly Cost — {year} vs {prevYear}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Dark = {year} · Light = {prevYear} · <span style={{ color: "#6366F1" }}>— — target (−15%)</span>
                {selectedWarehouses.size > 0 && ` · ${Array.from(selectedWarehouses).join(", ")}`}
              </p>
            </div>
            {/* legend pills */}
            <div className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> ≤ −15%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> −15%…0%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> &gt; 0%</span>
            </div>
          </div>

          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barCategoryGap="30%" barGap={3} margin={{ top: 24, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#9CA3AF" }}
                  axisLine={{ stroke: "#E5E7EB" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatShort(Number(v))}
                  tick={{ fontSize: 11, fill: "#9CA3AF" }}
                  axisLine={false}
                  tickLine={false}
                  width={55}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", fontSize: 12, border: "1px solid #E5E7EB" }}
                  cursor={{ fill: "#F9FAFB" }}
                  formatter={(value: any, name: any) => {
                    if (name === "total_prev") return [formatNumber(Number(value)), `${prevYear} actual`] as [string, string]
                    if (name === "target")     return [formatNumber(Number(value)), `Target (−15%)`] as [string, string]
                    return [formatNumber(Number(value)), `${year} actual`] as [string, string]
                  }}
                />

                {/* prev year bar */}
                <Bar dataKey="total_prev" name="total_prev" fill="#111827" fillOpacity={0.15} radius={[3, 3, 0, 0]} maxBarSize={48} />

                {/* current year bar — colored by performance */}
                <Bar dataKey="total_curr" name="total_curr" radius={[3, 3, 0, 0]} maxBarSize={48}>
                  <LabelList dataKey="pct_label" position="top" style={{ fontSize: 10, fontWeight: 600, fill: "#6B7280" }} />
                  {chartData.map((entry, index) => {
                    if (entry.isYTD) return <Cell key={index} fill="#1E293B" />
                    const pct = entry.pct_diff
                    const color =
                      pct === null  ? "#111827"
                      : pct <= -15  ? "#10B981"
                      : pct <= 0    ? "#F59E0B"
                      :               "#EF4444"
                    return <Cell key={index} fill={color} />
                  })}
                </Bar>

                {/* target line at prev × 0.85 */}
                <Line
                  dataKey="target"
                  name="target"
                  stroke="#6366F1"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* month-by-month diff table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-1.5 text-left font-medium text-gray-400">Month</th>
                  <th className="py-1.5 text-right font-medium text-gray-400">{year}</th>
                  <th className="py-1.5 text-right font-medium text-gray-400">{prevYear}</th>
                  <th className="py-1.5 text-right font-medium text-gray-400">Target (−15%)</th>
                  <th className="py-1.5 text-right font-medium text-gray-400">Diff vs LY</th>
                  <th className="py-1.5 text-right font-medium text-gray-400">%</th>
                </tr>
              </thead>
              <tbody>
                {chartData.filter((r) => !r.isYTD).map((row) => {
                  const pct  = row.pct_diff as number | null
                  const color =
                    pct === null ? "text-gray-400"
                    : pct <= -15 ? "text-emerald-600"
                    : pct <= 0   ? "text-amber-500"
                    :              "text-red-500"
                  return (
                    <tr key={row.month} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 font-medium text-gray-700">{row.month}</td>
                      <td className="py-1.5 text-right text-gray-800">{formatShort(row.total_curr)}</td>
                      <td className="py-1.5 text-right text-gray-400">{formatShort(row.total_prev)}</td>
                      <td className="py-1.5 text-right text-indigo-500">{row.target ? formatShort(row.target) : "—"}</td>
                      <td className={`py-1.5 text-right font-medium ${color}`}>
                        {pct !== null ? formatDiff(row.val_diff) : "—"}
                      </td>
                      <td className={`py-1.5 text-right font-semibold ${color}`}>
                        {pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  )
                })}
                {/* YTD summary row */}
                {(() => {
                  const ytd = chartData.find((r) => r.isYTD)
                  if (!ytd) return null
                  const pct = ytd.pct_diff as number | null
                  const color = pct === null ? "text-gray-400" : pct <= -15 ? "text-emerald-600" : pct <= 0 ? "text-amber-500" : "text-red-500"
                  return (
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td className="py-2 text-gray-900">YTD</td>
                      <td className="py-2 text-right text-gray-900">{formatShort(ytd.total_curr)}</td>
                      <td className="py-2 text-right text-gray-500">{formatShort(ytd.total_prev)}</td>
                      <td className="py-2 text-right text-indigo-500">{ytd.target ? formatShort(ytd.target) : "—"}</td>
                      <td className={`py-2 text-right ${color}`}>{pct !== null ? formatDiff(ytd.val_diff) : "—"}</td>
                      <td className={`py-2 text-right ${color}`}>{pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}</td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>
      ) : hasSearched && !loading ? (
        <div className="flex items-center justify-center rounded-2xl border bg-white py-20">
          <p className="text-sm text-gray-400">No chart data for selected filters</p>
        </div>
      ) : null}

      {/* ── Analysis section ─────────────────────────────────────────────── */}
      {hasSearched && (currCounts !== null || autoGroupBreakdownRows.length > 0 || breakdownLoading) && (() => {
        const avgWD_curr    = currCounts && currCounts.wd_count    > 0 ? currCounts.total_cost / currCounts.wd_count    : null
        const avgWD_prev    = prevCounts && prevCounts.wd_count    > 0 ? prevCounts.total_cost / prevCounts.wd_count    : null
        const avgPlate_curr = currCounts && currCounts.plate_count > 0 ? currCounts.total_cost / currCounts.plate_count : null
        const avgPlate_prev = prevCounts && prevCounts.plate_count > 0 ? prevCounts.total_cost / prevCounts.plate_count : null

        const kpiCards = [
          { label: "Unique WD",       curr: currCounts?.wd_count    ?? null, prev: prevCounts?.wd_count    ?? null, fmt: (v: number) => v.toLocaleString() },
          { label: "Unique Plates",   curr: currCounts?.plate_count ?? null, prev: prevCounts?.plate_count ?? null, fmt: (v: number) => v.toLocaleString() },
          { label: "Avg Cost / WD",   curr: avgWD_curr,    prev: avgWD_prev,    fmt: formatShort },
          { label: "Avg Cost / Plate", curr: avgPlate_curr, prev: avgPlate_prev, fmt: formatShort },
        ]

        return (
          <div className="space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Analysis</p>

            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {kpiCards.map(({ label, curr, prev, fmt }) => {
                const delta = curr !== null && prev !== null && prev > 0 ? ((curr - prev) / prev) * 100 : null
                const isUp  = delta !== null && delta > 0
                return (
                  <div key={label} className="rounded-2xl border bg-white px-5 py-4">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{curr !== null ? fmt(curr) : "—"}</p>
                    {prev !== null && (
                      <p className="mt-0.5 text-xs text-gray-400">{fmt(prev)} ({prevYear})</p>
                    )}
                    {delta !== null && (
                      <p className={`mt-0.5 text-xs font-semibold ${isUp ? "text-red-500" : "text-emerald-600"}`}>
                        {isUp ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs {prevYear}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Product group → product code drilldown table */}
            {(breakdownLoading || autoGroupBreakdownRows.length > 0) && (() => {
              const pivotTotal_curr = autoGroupBreakdownRows.reduce((s, r) => s + r.total_curr, 0)
              const pivotTotal_prev = autoGroupBreakdownRows.reduce((s, r) => s + r.total_prev, 0)
              const totalPct = pivotTotal_prev > 0 ? ((pivotTotal_curr - pivotTotal_prev) / pivotTotal_prev) * 100 : null
              const pctColor = (pct: number | null) =>
                pct === null ? "text-gray-400" : pct <= -15 ? "text-emerald-600" : pct <= 0 ? "text-amber-500" : "text-red-500"

              // Usage up = more parts used = red; down = green
              // Avg price up = more expensive = red; down = green
              const chgIndicator = (curr: number, prev: number, invertColor = false) => {
                if (!prev || !curr) return null
                const up = curr > prev
                const pct = Math.abs((curr - prev) / prev * 100)
                if (pct < 0.5) return null   // too small to show
                const color = invertColor
                  ? (up ? "text-emerald-500" : "text-red-400")
                  : (up ? "text-red-400"     : "text-emerald-500")
                return (
                  <span className={`ml-1 text-[9px] font-semibold ${color}`}>
                    {up ? "▲" : "▼"}{pct < 10 ? pct.toFixed(1) : Math.round(pct)}%
                  </span>
                )
              }

              return (
                <div className="rounded-2xl border bg-white p-5">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">
                        Auto Group → กลุ่มสินค้า → รหัสสินค้า — Cost Breakdown
                      </p>
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        {selectedGroupValues.size > 0
                          ? `Filtered to ${selectedGroupValues.size} selected Monthly Cost group${selectedGroupValues.size > 1 ? "s" : ""}`
                          : "All groups shown — pick chips in Monthly Cost to filter"} — {year} vs {prevYear} · Auto detect: ค่าแรง / ยาง / อะไหล่ / อื่นๆ · Includes Usage and Avg Price · Click each row to drill down
                      </p>
                    </div>
                    {breakdownLoading && (
                      <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-400">
                        Loading breakdown…
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        {/* Row 1 — year group labels */}
                        <tr className="text-gray-500 font-semibold text-[10px]">
                          <th colSpan={4} className="sticky left-0 bg-white" />
                          <th colSpan={2} className="py-1 text-center border-b border-blue-200 text-blue-600 bg-blue-50/40">{year}</th>
                          <th colSpan={2} className="py-1 text-center border-b border-gray-200 text-gray-400 bg-gray-50/40">{prevYear}</th>
                          {months.map((m) => <th key={m} />)}
                          <th /><th /><th />
                        </tr>
                        {/* Row 2 — column labels */}
                        <tr className="border-b border-gray-100 text-gray-400 font-medium">
                          <th className="py-1.5 text-left sticky left-0 bg-white min-w-[140px]">Auto Group</th>
                          <th className="py-1.5 text-left min-w-[180px]">กลุ่มสินค้า</th>
                          <th className="py-1.5 text-left min-w-[110px]">รหัสสินค้า</th>
                          <th className="py-1.5 text-left min-w-[240px]">ชื่อสินค้า</th>
                          <th className="py-1.5 text-right min-w-[90px]">Usage</th>
                          <th className="py-1.5 text-right min-w-[90px]">Avg ฿</th>
                          <th className="py-1.5 text-right min-w-[90px]">Usage</th>
                          <th className="py-1.5 text-right min-w-[90px]">Avg ฿</th>
                          {months.map((m) => (
                            <th key={m} className="py-1.5 text-right min-w-[60px] whitespace-nowrap">
                              {MONTH_NUM_TO_LABEL[m.split("-")[1]]}
                            </th>
                          ))}
                          <th className="py-1.5 text-right min-w-[64px]">{year} YTD</th>
                          <th className="py-1.5 text-right min-w-[64px]">{prevYear} YTD</th>
                          <th className="py-1.5 text-right min-w-[56px]">%</th>
                        </tr>
                      </thead>

                      <tbody>
                        {autoGroupBreakdownRows.map((autoGroup) => {
                          const autoOpen = expandedAutoGroups.has(autoGroup.key)
                          const autoPct = autoGroup.total_prev > 0 ? ((autoGroup.total_curr - autoGroup.total_prev) / autoGroup.total_prev) * 100 : null

                          return (
                            <React.Fragment key={autoGroup.key}>
                              <tr
                                onClick={() => toggleAutoGroup(autoGroup.key)}
                                className="cursor-pointer select-none border-b border-gray-100 bg-gray-900 hover:bg-gray-800 transition"
                              >
                                <td className="py-2.5 font-bold text-white sticky left-0 bg-gray-900">
                                  <span className="mr-2 text-[10px] text-gray-400">{autoOpen ? "▼" : "▶"}</span>
                                  {autoGroup.auto_group}
                                  <span className="ml-2 text-[10px] font-normal text-gray-400">
                                    {autoGroup.product_groups.length} groups
                                  </span>
                                </td>
                                <td className="py-2.5 text-gray-400">Click to view กลุ่มสินค้า</td>
                                <td className="py-2.5 text-gray-500">—</td>
                                <td className="py-2.5 text-gray-500">—</td>
                                <td className="py-2.5 text-right font-semibold text-white tabular-nums">
                                  {autoGroup.usage_curr > 0 ? formatQty(autoGroup.usage_curr) : <span className="font-normal text-gray-500">—</span>}
                                  {chgIndicator(autoGroup.usage_curr, autoGroup.usage_prev)}
                                </td>
                                <td className="py-2.5 text-right font-semibold text-white tabular-nums">
                                  {formatAvgPrice(calcAvgPrice(autoGroup.total_curr, autoGroup.usage_curr))}
                                  {chgIndicator(autoGroup.total_curr / (autoGroup.usage_curr || 1), autoGroup.total_prev / (autoGroup.usage_prev || 1))}
                                </td>
                                <td className="py-2.5 text-right font-semibold text-gray-300 tabular-nums">{autoGroup.usage_prev > 0 ? formatQty(autoGroup.usage_prev) : <span className="font-normal text-gray-500">—</span>}</td>
                                <td className="py-2.5 text-right font-semibold text-gray-300 tabular-nums">{formatAvgPrice(calcAvgPrice(autoGroup.total_prev, autoGroup.usage_prev))}</td>
                                {months.map((m) => (
                                  <td key={m} className="py-2.5 text-right font-semibold text-white tabular-nums">
                                    {autoGroup.byMonth[m]?.curr ? formatShort(autoGroup.byMonth[m].curr) : <span className="font-normal text-gray-500">—</span>}
                                  </td>
                                ))}
                                <td className="py-2.5 text-right font-bold text-white tabular-nums">{formatShort(autoGroup.total_curr)}</td>
                                <td className="py-2.5 text-right font-semibold text-gray-300 tabular-nums">{formatShort(autoGroup.total_prev)}</td>
                                <td className={`py-2.5 text-right font-semibold tabular-nums ${pctColor(autoPct)}`}>
                                  {autoPct !== null ? `${autoPct >= 0 ? "+" : ""}${autoPct.toFixed(1)}%` : "—"}
                                </td>
                              </tr>

                              {autoOpen && autoGroup.product_groups.map((group) => {
                                const groupOpen = expandedProductGroups.has(group.key)
                                const groupPct = group.total_prev > 0 ? ((group.total_curr - group.total_prev) / group.total_prev) * 100 : null

                                return (
                                  <React.Fragment key={group.key}>
                                    <tr
                                      onClick={() => toggleProductGroup(group.key)}
                                      className="cursor-pointer select-none border-b border-gray-100 bg-gray-50 hover:bg-gray-100 transition"
                                    >
                                      <td className="py-2 pl-6 text-gray-300 sticky left-0 bg-gray-50">
                                        └─ {autoGroup.auto_group}
                                      </td>
                                      <td className="py-2 font-semibold text-gray-800">
                                        <span className="mr-2 text-[10px] text-gray-400">{groupOpen ? "▼" : "▶"}</span>
                                        {group.product_group}
                                        <span className="ml-2 text-[10px] font-normal text-gray-400">
                                          {group.products.length} items
                                        </span>
                                      </td>
                                      <td className="py-2 text-gray-300">—</td>
                                      <td className="py-2 text-gray-400">Click to view product codes</td>
                                      <td className="py-2 text-right font-medium text-gray-700 tabular-nums">
                                        {group.usage_curr > 0 ? formatQty(group.usage_curr) : <span className="text-gray-200">—</span>}
                                        {chgIndicator(group.usage_curr, group.usage_prev)}
                                      </td>
                                      <td className="py-2 text-right font-medium text-gray-700 tabular-nums">
                                        {formatAvgPrice(calcAvgPrice(group.total_curr, group.usage_curr))}
                                        {chgIndicator(group.total_curr / (group.usage_curr || 1), group.total_prev / (group.usage_prev || 1))}
                                      </td>
                                      <td className="py-2 text-right font-medium text-gray-400 tabular-nums">{group.usage_prev > 0 ? formatQty(group.usage_prev) : <span className="text-gray-200">—</span>}</td>
                                      <td className="py-2 text-right font-medium text-gray-400 tabular-nums">{formatAvgPrice(calcAvgPrice(group.total_prev, group.usage_prev))}</td>
                                      {months.map((m) => (
                                        <td key={m} className="py-2 text-right font-medium text-gray-700 tabular-nums">
                                          {group.byMonth[m]?.curr ? formatShort(group.byMonth[m].curr) : <span className="font-normal text-gray-200">—</span>}
                                        </td>
                                      ))}
                                      <td className="py-2 text-right font-bold text-gray-900 tabular-nums">{formatShort(group.total_curr)}</td>
                                      <td className="py-2 text-right font-medium text-gray-500 tabular-nums">{formatShort(group.total_prev)}</td>
                                      <td className={`py-2 text-right font-semibold tabular-nums ${pctColor(groupPct)}`}>
                                        {groupPct !== null ? `${groupPct >= 0 ? "+" : ""}${groupPct.toFixed(1)}%` : "—"}
                                      </td>
                                    </tr>

                                    {groupOpen && group.products.map((row) => {
                                      const rowPct = row.total_prev > 0 ? ((row.total_curr - row.total_prev) / row.total_prev) * 100 : null

                                      return (
                                        <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50 transition">
                                          <td className="py-1.5 pl-10 text-gray-300 sticky left-0 bg-white">
                                            └─ {row.auto_group}
                                          </td>
                                          <td className="py-1.5 pl-6 text-gray-400">
                                            └─ {row.product_group}
                                          </td>
                                          <td className="py-1.5 font-mono text-[10px] text-gray-500">
                                            {row.product_code}
                                          </td>
                                          <td className="py-1.5 text-gray-600">
                                            {row.product_name || "—"}
                                          </td>
                                          <td className="py-1.5 text-right text-gray-600 tabular-nums">
                                            {row.usage_curr > 0 ? formatQty(row.usage_curr) : <span className="text-gray-200">—</span>}
                                            {chgIndicator(row.usage_curr, row.usage_prev)}
                                          </td>
                                          <td className="py-1.5 text-right text-gray-600 tabular-nums">
                                            {formatAvgPrice(calcAvgPrice(row.total_curr, row.usage_curr, row.fallback_price_curr))}
                                            {chgIndicator(
                                              calcAvgPrice(row.total_curr, row.usage_curr, row.fallback_price_curr) ?? 0,
                                              calcAvgPrice(row.total_prev, row.usage_prev, row.fallback_price_prev) ?? 0
                                            )}
                                          </td>
                                          <td className="py-1.5 text-right text-gray-400 tabular-nums">
                                            {row.usage_prev > 0 ? formatQty(row.usage_prev) : <span className="text-gray-200">—</span>}
                                          </td>
                                          <td className="py-1.5 text-right text-gray-400 tabular-nums">
                                            {formatAvgPrice(calcAvgPrice(row.total_prev, row.usage_prev, row.fallback_price_prev))}
                                          </td>
                                          {months.map((m) => {
                                            const cell = row.byMonth[m]
                                            const avgCurr = cell ? calcAvgPrice(cell.curr, cell.qty_curr, row.fallback_price_curr) : null
                                            const avgPrev = cell ? calcAvgPrice(cell.prev, cell.qty_prev, row.fallback_price_prev) : null
                                            const hasCurr = cell && (cell.curr > 0 || cell.qty_curr > 0)
                                            const hasPrev = cell && (cell.prev > 0 || cell.qty_prev > 0)
                                            return (
                                              <td key={m} className="py-1 text-right text-gray-600 tabular-nums align-top">
                                                {/* curr year */}
                                                {hasCurr ? (
                                                  <div className="leading-tight">
                                                    <div>{cell!.curr ? formatShort(cell!.curr) : <span className="text-gray-200">—</span>}</div>
                                                    {cell!.qty_curr > 0 && <div className="text-[9px] text-blue-400">qty {formatQty(cell!.qty_curr)}</div>}
                                                    {avgCurr !== null && <div className="text-[9px] text-gray-400">฿{formatAvgPrice(avgCurr)}</div>}
                                                  </div>
                                                ) : (
                                                  <div className="text-gray-200">—</div>
                                                )}
                                                {/* prev year */}
                                                {hasPrev && (
                                                  <div className="mt-0.5 leading-tight border-t border-gray-100 pt-0.5">
                                                    {cell!.prev > 0 && <div className="text-[9px] text-gray-300">LY {formatShort(cell!.prev)}</div>}
                                                    {cell!.qty_prev > 0 && <div className="text-[9px] text-gray-300">qty {formatQty(cell!.qty_prev)}</div>}
                                                    {avgPrev !== null && <div className="text-[9px] text-gray-300">฿{formatAvgPrice(avgPrev)}</div>}
                                                  </div>
                                                )}
                                              </td>
                                            )
                                          })}
                                          <td className="py-1.5 text-right font-semibold text-gray-800 tabular-nums">{formatShort(row.total_curr)}</td>
                                          <td className="py-1.5 text-right text-gray-400 tabular-nums">{formatShort(row.total_prev)}</td>
                                          <td className={`py-1.5 text-right font-semibold tabular-nums ${pctColor(rowPct)}`}>
                                            {rowPct !== null ? `${rowPct >= 0 ? "+" : ""}${rowPct.toFixed(1)}%` : "—"}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </React.Fragment>
                                )
                              })}
                            </React.Fragment>
                          )
                        })}

                        {!breakdownLoading && autoGroupBreakdownRows.length === 0 && (
                          <tr>
                            <td colSpan={months.length + 11} className="py-8 text-center text-xs text-gray-400">
                              No breakdown data for selected Monthly Cost filter
                            </td>
                          </tr>
                        )}

                        {/* Totals row */}
                        {autoGroupBreakdownRows.length > 0 && (
                          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                            <td className="py-2 text-gray-900 sticky left-0 bg-gray-50" colSpan={4}>Total</td>
                            <td className="py-2 text-right text-gray-900 tabular-nums">{formatQty(autoGroupBreakdownRows.reduce((s, r) => s + r.usage_curr, 0))}</td>
                            <td className="py-2 text-right text-gray-900 tabular-nums">{formatAvgPrice(calcAvgPrice(pivotTotal_curr, autoGroupBreakdownRows.reduce((s, r) => s + r.usage_curr, 0)))}</td>
                            <td className="py-2 text-right text-gray-500 tabular-nums">{formatQty(autoGroupBreakdownRows.reduce((s, r) => s + r.usage_prev, 0))}</td>
                            <td className="py-2 text-right text-gray-500 tabular-nums">{formatAvgPrice(calcAvgPrice(pivotTotal_prev, autoGroupBreakdownRows.reduce((s, r) => s + r.usage_prev, 0)))}</td>
                            {months.map((m) => {
                              const mTotal = autoGroupBreakdownRows.reduce((s, r) => s + (r.byMonth[m]?.curr || 0), 0)
                              return (
                                <td key={m} className="py-2 text-right text-gray-700 tabular-nums">
                                  {mTotal > 0 ? formatShort(mTotal) : <span className="font-normal text-gray-200">—</span>}
                                </td>
                              )
                            })}
                            <td className="py-2 text-right text-gray-900 tabular-nums">{formatShort(pivotTotal_curr)}</td>
                            <td className="py-2 text-right text-gray-500 tabular-nums">{formatShort(pivotTotal_prev)}</td>
                            <td className={`py-2 text-right tabular-nums ${pctColor(totalPct)}`}>
                              {totalPct !== null ? `${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {/* ── Transaction detail table ──────────────────────────────── */}
            <div className="rounded-2xl border bg-white p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-gray-700">Transaction Detail — All Plates by Month</p>
                <div className="ml-auto flex items-center gap-2">
                  {/* อู่ filter */}
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden text-[10px] font-semibold">
                    {(["all", "อู่ใน", "อู่นอก"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setWorkshopFilter(v)}
                        className={`px-2.5 py-1.5 transition ${
                          workshopFilter === v
                            ? v === "อู่นอก" ? "bg-orange-500 text-white"
                            : v === "อู่ใน"  ? "bg-sky-500 text-white"
                            : "bg-gray-900 text-white"
                            : "bg-white text-gray-500 hover:bg-gray-50"
                        } border-r last:border-r-0 border-gray-200`}
                      >
                        {v === "all" ? "ทั้งหมด" : v}
                      </button>
                    ))}
                  </div>
                  <input
                    value={detailFilter}
                    onChange={(e) => setDetailFilter(e.target.value)}
                    placeholder="Filter plate / WD…"
                    className="w-40 rounded-xl border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                <button
                  onClick={loadDetail}
                  disabled={detailLoading}
                  className="rounded-xl bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition"
                >
                  {detailLoading ? "Loading…" : detailData.length > 0 ? "Reload" : "Load Detail"}
                </button>
              </div>

              {detailData.length > 0 ? (() => {
                const q = detailFilter.toLowerCase().trim()
                const isFiltering = !!q   // only text search triggers auto-expand
                const filtered = detailData.filter((r) => {
                  if (q) {
                    const plateOk = (r.plate || "").toLowerCase().includes(q)
                    const wdOk    = (r.wd    || "").toLowerCase().includes(q)
                    if (!plateOk && !wdOk) return false
                  }
                  if (workshopFilter !== "all") {
                    const hasOutside = (r.lines || []).some(l => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
                    if (workshopFilter === "อู่นอก" && !hasOutside) return false
                    if (workshopFilter === "อู่ใน"  &&  hasOutside) return false
                  }
                  return true
                })

                const CG_ORDER = ["CM", "PM", "AC", "T -", "Tools", "Other"]
                const cgSort = (a: string, b: string) => {
                  const ai = CG_ORDER.findIndex((k) => a.startsWith(k))
                  const bi = CG_ORDER.findIndex((k) => b.startsWith(k))
                  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
                }

                // ── Build month → costGroup → plate → lines ─────────────────
                type CgPlate = { wd: string; lines: DetailLine[]; subtotal: number; isOutside: boolean }
                type CgData  = { costGroup: string; plates: Map<string, CgPlate>; totalCost: number; totalRecords: number }
                const hierarchy = new Map<string, Map<string, CgData>>()

                filtered.forEach((plateRow) => {
                  // classify the whole transaction — does this plate visit have any ค่าแรง?
                  const plateIsOutside = (plateRow.lines || []).some(l => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
                  if (!hierarchy.has(plateRow.month_year)) hierarchy.set(plateRow.month_year, new Map())
                  const mMap = hierarchy.get(plateRow.month_year)!
                  ;(plateRow.lines || []).forEach((line) => {
                    const cg = getCostGroup(line.จุดประสงค์ || "")
                    if (!mMap.has(cg)) mMap.set(cg, { costGroup: cg, plates: new Map(), totalCost: 0, totalRecords: 0 })
                    const cgData = mMap.get(cg)!
                    if (!cgData.plates.has(plateRow.plate)) cgData.plates.set(plateRow.plate, { wd: plateRow.wd, lines: [], subtotal: 0, isOutside: plateIsOutside })
                    const pd = cgData.plates.get(plateRow.plate)!
                    pd.lines.push(line)
                    pd.subtotal         += line.cost
                    cgData.totalCost    += line.cost
                    cgData.totalRecords += line.records
                  })
                })

                // ── Flat render list ─────────────────────────────────────────
                type FlatRow =
                  | { kind: "month";     month_year: string; plateCount: number; totalCost: number; totalRecords: number }
                  | { kind: "costgroup"; cgKey: string; costGroup: string; plateCount: number; totalCost: number }
                  | { kind: "plate";     groupKey: string; plate: string; wd: string; lines: DetailLine[]; subtotal: number; isOutside: boolean }
                  | { kind: "line";      line: DetailLine; rowKey: string }

                const flat: FlatRow[] = []
                hierarchy.forEach((mMap, month_year) => {
                  let mTotal = 0; let mRecords = 0; const mPlates = new Set<string>()
                  mMap.forEach((cg) => { mTotal += cg.totalCost; mRecords += cg.totalRecords; cg.plates.forEach((_, p) => mPlates.add(p)) })

                  flat.push({ kind: "month", month_year, plateCount: mPlates.size, totalCost: mTotal, totalRecords: mRecords })

                  if (isFiltering || expandedMonths.has(month_year)) {
                    Array.from(mMap.values()).sort((a, b) => cgSort(a.costGroup, b.costGroup)).forEach((cgData) => {
                      const cgKey = `${month_year}|${cgData.costGroup}`
                      flat.push({ kind: "costgroup", cgKey, costGroup: cgData.costGroup, plateCount: cgData.plates.size, totalCost: cgData.totalCost })

                      if (isFiltering || expandedCostGroups.has(cgKey)) {
                        Array.from(cgData.plates.entries()).sort((a, b) => b[1].subtotal - a[1].subtotal).forEach(([plate, pd]) => {
                          const groupKey = `${cgKey}|${plate}`
                          flat.push({ kind: "plate", groupKey, plate, wd: pd.wd, lines: pd.lines, subtotal: pd.subtotal, isOutside: pd.isOutside })
                          if (expandedPlates.has(groupKey)) {
                            pd.lines.forEach((line, li) => flat.push({ kind: "line", line, rowKey: `${groupKey}-${li}` }))
                          }
                        })
                      }
                    })
                  }
                })

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-400 font-medium">
                          <th className="py-1.5 text-left w-24">WD</th>
                          <th className="py-1.5 text-left w-28">Plate</th>
                          <th className="py-1.5 text-left">กลุ่มสินค้า</th>
                          <th className="py-1.5 text-left w-24">รหัสสินค้า</th>
                          <th className="py-1.5 text-left">ชื่อสินค้า</th>
                          <th className="py-1.5 text-right w-24">ราคาทุน</th>
                          <th className="py-1.5 text-left">ซัพพลายเออร์</th>
                          <th className="py-1.5 text-right w-24">Cost</th>
                          <th className="py-1.5 text-right w-10">Rows</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flat.map((row) => {

                          // ── Level 1 : Month ─────────────────────────────
                          if (row.kind === "month") {
                            const open = expandedMonths.has(row.month_year)
                            return (
                              <tr key={`m-${row.month_year}`} onClick={() => toggleMonth(row.month_year)}
                                  className="cursor-pointer select-none bg-gray-900 hover:bg-gray-800 transition">
                                <td colSpan={8} className="py-2.5 pl-3">
                                  <span className="mr-2 text-[10px] text-gray-500">{open ? "▼" : "▶"}</span>
                                  <span className="text-sm font-bold text-white">{row.month_year}</span>
                                  <span className="ml-3 text-[11px] text-gray-400">
                                    {row.plateCount} plates · {row.totalRecords.toLocaleString()} records
                                  </span>
                                </td>
                                <td className="py-2.5 pr-3 text-right text-sm font-bold text-white" colSpan={1}>
                                  {formatShort(row.totalCost)}
                                </td>
                              </tr>
                            )
                          }

                          // ── Level 2 : Cost Group ────────────────────────
                          if (row.kind === "costgroup") {
                            const open = expandedCostGroups.has(row.cgKey)
                            return (
                              <tr key={row.cgKey} onClick={() => toggleCostGroup(row.cgKey)}
                                  className="cursor-pointer select-none bg-gray-700 hover:bg-gray-600 transition">
                                <td colSpan={8} className="py-2 pl-6">
                                  <span className="mr-2 text-[10px] text-gray-400">{open ? "▼" : "▶"}</span>
                                  <span className="font-semibold text-white">{row.costGroup}</span>
                                  <span className="ml-3 text-[11px] text-gray-400">{row.plateCount} plates</span>
                                </td>
                                <td className="py-2 pr-3 text-right font-semibold text-white">
                                  {formatShort(row.totalCost)}
                                </td>
                              </tr>
                            )
                          }

                          // ── Level 3 : Plate ─────────────────────────────
                          if (row.kind === "plate") {
                            const open = expandedPlates.has(row.groupKey)
                            const recCount = row.lines.reduce((s, l) => s + l.records, 0)
                            const hasOutside = row.isOutside
                            return (
                              <tr key={row.groupKey} onClick={() => togglePlate(row.groupKey)}
                                  className="cursor-pointer select-none border-b border-gray-100 bg-gray-50 hover:bg-gray-100 transition">
                                <td className="py-2 pl-8 font-medium text-gray-600">{row.wd || "—"}</td>
                                <td className="py-2 font-semibold text-gray-800">
                                  <span className={`inline-block mr-1.5 rounded px-1 py-0.5 text-[9px] font-bold leading-none ${hasOutside ? "bg-orange-100 text-orange-600" : "bg-sky-100 text-sky-600"}`}>
                                    {hasOutside ? "อู่นอก" : "อู่ใน"}
                                  </span>
                                  {row.plate || "—"}
                                  <span className="ml-1.5 text-[10px] font-normal text-gray-400">
                                    {open ? "▲" : "▼"} {row.lines.length}
                                  </span>
                                </td>
                                <td colSpan={5} className="py-2 pl-1 text-[10px] text-gray-400">
                                  {!open && row.lines.slice(0, 3).map((l) => l.กลุ่มสินค้า).filter(Boolean).join(" · ")}
                                </td>
                                <td className="py-2 pr-3 text-right font-bold text-gray-800">{formatShort(row.subtotal)}</td>
                                <td className="py-2 text-right text-gray-400">{recCount}</td>
                              </tr>
                            )
                          }

                          // ── Level 4 : Line ──────────────────────────────
                          const { line, rowKey } = row
                          return (
                            <tr key={rowKey} className="border-b border-gray-50 hover:bg-gray-50 transition">
                              <td className="py-1.5 pl-12 text-gray-300" />
                              <td className="py-1.5 text-gray-300" />
                              <td className="py-1.5 text-gray-600">{line.กลุ่มสินค้า || "—"}</td>
                              <td className="py-1.5 font-mono text-[10px] text-gray-500">{line.รหัสสินค้า || "—"}</td>
                              <td className="py-1.5 text-gray-600">{line.ชื่อสินค้า || "—"}</td>
                              <td className="py-1.5 text-right text-gray-500">{line.ราคาทุน != null ? formatNumber(line.ราคาทุน) : "—"}</td>
                              <td className="py-1.5 text-[10px] text-gray-400">{line.ซัพพลายเออร์ || "—"}</td>
                              <td className="py-1.5 text-right font-medium text-gray-700">{formatShort(line.cost)}</td>
                              <td className="py-1.5 text-right text-gray-400">{line.records}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {filtered.length === 0 && (
                      <p className="py-8 text-center text-xs text-gray-400">No plates match filter</p>
                    )}
                  </div>
                )
              })() : (
                !detailLoading && (
                  <p className="py-8 text-center text-xs text-gray-400">
                    Click "Load Detail" · then Month → Cost Group → Plate → Line breakdown
                  </p>
                )
              )}
            </div>

          </div>
        )
      })()}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!hasSearched && !loading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-28">
          <p className="text-sm font-medium text-gray-400">Set filters and click Search</p>
          <p className="mt-1 text-xs text-gray-300">Loads {year} vs {prevYear} · no row limit</p>
        </div>
      )}

      </div> {/* end main content */}

      {/* ── Right sidebar ─────────────────────────────────────────────────── */}
      <div className="w-60 shrink-0 sticky top-4 space-y-2.5">

        {/* Filter card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">

          {/* Card header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wide text-gray-500 uppercase">Filters</span>
            {hasSearched && (
              <span className="text-[10px] text-emerald-500 font-medium">● Live</span>
            )}
          </div>

          <div className="px-4 py-3 space-y-3">

            {/* Year stepper */}
            <div>
              <label className="text-[10px] font-medium text-gray-400 block mb-1.5">Year</label>
              <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => {
                    const y = String(Number(year) - 1)
                    setYear(y)
                    setStartMonth(`${y}-${startMonth.split("-")[1]}`)
                    setEndMonth(`${y}-${endMonth.split("-")[1]}`)
                  }}
                  className="px-3 py-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition text-sm font-medium border-r border-gray-200"
                >‹</button>
                <span className="flex-1 text-center text-sm font-bold text-gray-900 py-2">{year}</span>
                <button
                  onClick={() => {
                    const y = String(Number(year) + 1)
                    setYear(y)
                    setStartMonth(`${y}-${startMonth.split("-")[1]}`)
                    setEndMonth(`${y}-${endMonth.split("-")[1]}`)
                  }}
                  className="px-3 py-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition text-sm font-medium border-l border-gray-200"
                >›</button>
              </div>
            </div>

            {/* Date range */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-gray-400 block">Date Range</label>
              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                <div className="flex items-center px-3 py-2 gap-2">
                  <span className="text-[10px] text-gray-300 w-8 shrink-0">From</span>
                  <input
                    type="month"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="flex-1 text-xs text-gray-700 bg-transparent focus:outline-none min-w-0"
                  />
                </div>
                <div className="flex items-center px-3 py-2 gap-2">
                  <span className="text-[10px] text-gray-300 w-8 shrink-0">To</span>
                  <input
                    type="month"
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                    className="flex-1 text-xs text-gray-700 bg-transparent focus:outline-none min-w-0"
                  />
                </div>
              </div>
            </div>

            {/* Quick picks */}
            <div className="grid grid-cols-3 gap-1">
              {([
                { label: "YTD",        fn: pickYTD },
                { label: "This Month", fn: pickCurrentMonth },
                { label: "Full Year",  fn: pickFullYear },
              ] as const).map(({ label, fn }) => (
                <button key={label} onClick={fn}
                  className="rounded-lg bg-gray-50 border border-gray-200 py-1.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition text-center leading-tight">
                  {label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Group by */}
            <div>
              <label className="text-[10px] font-medium text-gray-400 block mb-1.5">Group by</label>
              <div className="grid grid-cols-2 gap-1">
                {GROUP_BY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setGroupBy(opt.value)}
                    className={`rounded-lg py-1.5 px-2 text-[10px] font-medium transition text-center leading-tight ${
                      groupBy === opt.value
                        ? "bg-gray-900 text-white"
                        : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <button
              onClick={search}
              disabled={loading}
              className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading…
                </>
              ) : "Search"}
            </button>
          </div>
        </div>

        {/* Warehouse chips */}
        {availableWarehouses.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Warehouse</p>
              {selectedWarehouses.size > 0 && (
                <button onClick={() => setSelectedWarehouses(new Set())}
                  className="text-[10px] text-gray-300 hover:text-gray-500 transition">clear</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableWarehouses.map((wh) => (
                <button
                  key={wh}
                  onClick={() => toggleWarehouse(wh)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                    selectedWarehouses.has(wh)
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700"
                  }`}
                >
                  {wh}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Partner flag chips */}
        {availablePartnerFlags.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Partner Flag</p>
              {selectedPartnerFlags.size > 0 && (
                <button onClick={() => setSelectedPartnerFlags(new Set())}
                  className="text-[10px] text-gray-300 hover:text-gray-500 transition">clear</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availablePartnerFlags.map((flag) => (
                <button
                  key={flag}
                  onClick={() => togglePartnerFlag(flag)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                    selectedPartnerFlags.has(flag)
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700"
                  }`}
                >
                  {flag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cost group value chips — shown after first search */}
        {allGroupValues.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ?? "Group"}
              </p>
              {selectedGroupValues.size > 0 && (
                <button onClick={() => setSelectedGroupValues(new Set())}
                  className="text-[10px] text-gray-300 hover:text-gray-500 transition">clear</button>
              )}
            </div>
            <p className="text-[10px] text-gray-300 mb-2">
              {selectedGroupValues.size === 0
                ? `Top 6 shown in chart — pick to override`
                : `${selectedGroupValues.size} selected`}
            </p>
            <div className="flex flex-col gap-1">
              {allGroupValues.map(({ value, total_cost }) => {
                const active = selectedGroupValues.has(value)
                const maxCost = allGroupValues[0]?.total_cost || 1
                return (
                  <button
                    key={value}
                    onClick={() => toggleGroupValue(value)}
                    className={`relative w-full text-left rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition overflow-hidden ${
                      active
                        ? "bg-gray-900 text-white"
                        : "bg-gray-50 border border-gray-200 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {/* bar fill behind */}
                    {!active && (
                      <span
                        className="absolute inset-y-0 left-0 rounded-lg bg-gray-100"
                        style={{ width: `${(total_cost / maxCost) * 100}%` }}
                      />
                    )}
                    <span className="relative flex items-center justify-between gap-1">
                      <span className="truncate">{value}</span>
                      <span className={`shrink-0 tabular-nums ${active ? "text-gray-400" : "text-gray-400"}`}>
                        {formatShort(total_cost)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div> {/* end right sidebar */}

    </div>
  )
}
