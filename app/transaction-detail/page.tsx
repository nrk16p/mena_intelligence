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
  sum_actual_issue?: number | null
}

type PlateDetailRow = {
  month_year:  string
  plate:       string
  wd:          string
  plate_total: number
  lines:       DetailLine[]
}

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

function nowYM() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

// ── Password ──────────────────────────────────────────────────────────────────

const COST_PASSWORD    = "savecost15percent"
const COST_SESSION_KEY = "cost_authed"

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TransactionDetailPage() {
  const todayYM   = nowYM()
  const todayYear = todayYM.split("-")[0]

  // ── Password gate ─────────────────────────────────────────────────────────
  const [authed, setAuthed]   = useState(false)
  const [pwInput, setPwInput] = useState("")
  const [pwError, setPwError] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(COST_SESSION_KEY) === "1") setAuthed(true)
  }, [])

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
  const [startMonth, setStartMonth]     = useState(`${todayYear}-01`)
  const [endMonth, setEndMonth]         = useState(todayYM)
  const [workshopFilter, setWorkshopFilter] = useState<"all" | "อู่ใน" | "อู่นอก">("all")
  const [detailFilter, setDetailFilter] = useState("")
  const [selectedWarehouses, setSelectedWarehouses] = useState<Set<string>>(new Set())
  const [warehouseOptions, setWarehouseOptions]     = useState<string[]>([])
  const [compareFilter, setCompareFilter]           = useState<"all" | "nai-expensive" | "nok-expensive">("all")
  const [selectedCostGroups, setSelectedCostGroups] = useState<Set<string>>(new Set())
  const [showExplanation, setShowExplanation]         = useState(false)
  const [showPivotInfo, setShowPivotInfo]             = useState(false)
  const [expandedPivotGroups, setExpandedPivotGroups] = useState<Set<string>>(new Set())

  // ── Data state ────────────────────────────────────────────────────────────
  const [detailData, setDetailData]   = useState<PlateDetailRow[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState("")
  const [hasLoaded, setHasLoaded]     = useState(false)

  // ── Expanded state ────────────────────────────────────────────────────────
  const [expandedMonths, setExpandedMonths]         = useState<Set<string>>(new Set())
  const [expandedCostGroups, setExpandedCostGroups] = useState<Set<string>>(new Set())
  const [expandedPlates, setExpandedPlates]         = useState<Set<string>>(new Set())
  const [expandedCompareGroups, setExpandedCompareGroups] = useState<Set<string>>(new Set())

  // ── Available warehouses from loaded data ─────────────────────────────────
  const availableWarehouses = useMemo<string[]>(() => {
    const s = new Set<string>()
    detailData.forEach((r) => {
      // wd field acts as warehouse indicator in detail data
      if (r.wd) s.add(r.wd)
    })
    return Array.from(s).sort()
  }, [detailData])

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError("")
    setDetailData([])
    setExpandedMonths(new Set())
    setExpandedCostGroups(new Set())
    setExpandedPlates(new Set())
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

  // ── Toggle helpers ────────────────────────────────────────────────────────
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

  // ── Available cost groups from loaded data ────────────────────────────────
  const availableCostGroups = useMemo(() => {
    const set = new Set<string>()
    detailData.forEach(r => (r.lines || []).forEach(l => set.add(getCostGroup(l.จุดประสงค์ || ""))))
    return Array.from(set).sort()
  }, [detailData])

  // ── Cost-group filtered data (line-level filter, recalc plate_total) ──────
  const cgFilteredData = useMemo((): PlateDetailRow[] => {
    if (selectedCostGroups.size === 0) return detailData
    return detailData.flatMap(r => {
      const lines = (r.lines || []).filter(l => selectedCostGroups.has(getCostGroup(l.จุดประสงค์ || "")))
      if (lines.length === 0) return []
      return [{ ...r, lines, plate_total: lines.reduce((s, l) => s + l.cost, 0) }]
    })
  }, [detailData, selectedCostGroups])

  // ── Table data computation ────────────────────────────────────────────────
  const { flat, totalCost, totalPlates, totalRecords } = useMemo(() => {
    const q           = detailFilter.toLowerCase().trim()
    const isFiltering = !!q

    const filtered = cgFilteredData.filter((r) => {
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

    type CgPlate = { wd: string; lines: DetailLine[]; subtotal: number; isOutside: boolean }
    type CgData  = { costGroup: string; plates: Map<string, CgPlate>; totalCost: number; totalRecords: number }
    const hierarchy = new Map<string, Map<string, CgData>>()

    filtered.forEach((plateRow) => {
      const plateIsOutside = (plateRow.lines || []).some(l => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
      if (!hierarchy.has(plateRow.month_year)) hierarchy.set(plateRow.month_year, new Map())
      const mMap = hierarchy.get(plateRow.month_year)!
      ;(plateRow.lines || []).forEach((line) => {
        const cg = getCostGroup(line.จุดประสงค์ || "")
        if (!mMap.has(cg)) mMap.set(cg, { costGroup: cg, plates: new Map(), totalCost: 0, totalRecords: 0 })
        const cgData = mMap.get(cg)!
        if (!cgData.plates.has(plateRow.plate))
          cgData.plates.set(plateRow.plate, { wd: plateRow.wd, lines: [], subtotal: 0, isOutside: plateIsOutside })
        const pd = cgData.plates.get(plateRow.plate)!
        pd.lines.push(line)
        pd.subtotal         += line.cost
        cgData.totalCost    += line.cost
        cgData.totalRecords += line.records
      })
    })

    type FlatRow =
      | { kind: "month";     month_year: string; plateCount: number; totalCost: number; totalRecords: number }
      | { kind: "costgroup"; cgKey: string; costGroup: string; plateCount: number; totalCost: number }
      | { kind: "plate";     groupKey: string; plate: string; wd: string; lines: DetailLine[]; subtotal: number; isOutside: boolean }
      | { kind: "line";      line: DetailLine; rowKey: string }

    const flat: FlatRow[] = []
    const sortedMonths = Array.from(hierarchy.keys()).sort().reverse()

    sortedMonths.forEach((month_year) => {
      const mMap = hierarchy.get(month_year)!
      let mTotal = 0; let mRecords = 0; const mPlates = new Set<string>()
      mMap.forEach((cg) => {
        mTotal   += cg.totalCost
        mRecords += cg.totalRecords
        cg.plates.forEach((_, p) => mPlates.add(p))
      })

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

    const totalCost    = filtered.reduce((s, r) => s + r.plate_total, 0)
    const totalPlates  = new Set(filtered.map(r => r.plate)).size
    const totalRecords = filtered.reduce((s, r) => s + (r.lines || []).reduce((ss, l) => ss + l.records, 0), 0)

    return { flat, totalCost, totalPlates, totalRecords }
  }, [cgFilteredData, detailFilter, workshopFilter, expandedMonths, expandedCostGroups, expandedPlates])

  // ── Chart data: อู่ใน vs อู่นอก by month ────────────────────────────────
  const chartData = useMemo(() => {
    type Entry = {
      month: string
      auNai: number; auNok: number
      _naiPlates: Set<string>; _nokPlates: Set<string>
    }
    const map = new Map<string, Entry>()
    cgFilteredData.forEach((r) => {
      if (!map.has(r.month_year))
        map.set(r.month_year, { month: r.month_year, auNai: 0, auNok: 0, _naiPlates: new Set(), _nokPlates: new Set() })
      const entry     = map.get(r.month_year)!
      const isOutside = (r.lines || []).some(l => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
      if (isOutside) { entry.auNok += r.plate_total; entry._nokPlates.add(r.plate) }
      else           { entry.auNai += r.plate_total; entry._naiPlates.add(r.plate) }
    })
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(({ _naiPlates, _nokPlates, ...rest }) => {
        const naiPlates = _naiPlates.size
        const nokPlates = _nokPlates.size
        return {
          ...rest,
          naiPlates,
          nokPlates,
          avgNai: naiPlates > 0 ? rest.auNai / naiPlates : 0,
          avgNok: nokPlates > 0 ? rest.auNok / nokPlates : 0,
        }
      })
  }, [cgFilteredData])

  // ── Overall avg cost per plate ────────────────────────────────────────────
  const avgStats = useMemo(() => {
    let naiCost = 0, nokCost = 0
    const naiPlates = new Set<string>(), nokPlates = new Set<string>()
    cgFilteredData.forEach((r) => {
      const isOutside = (r.lines || []).some(l => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
      if (isOutside) { nokCost += r.plate_total; nokPlates.add(r.plate) }
      else           { naiCost += r.plate_total; naiPlates.add(r.plate) }
    })
    return {
      naiTotal: naiCost,
      nokTotal: nokCost,
      naiAvg:   naiPlates.size > 0 ? naiCost / naiPlates.size : 0,
      nokAvg:   nokPlates.size > 0 ? nokCost / nokPlates.size : 0,
      naiCount: naiPlates.size,
      nokCount: nokPlates.size,
    }
  }, [cgFilteredData])

  // ── Compare same item อู่ใน vs อู่นอก ────────────────────────────────────
  type CompareRow = {
    key: string; ชื่อสินค้า: string; รหัสสินค้า: string; กลุ่มสินค้า: string
    naiCost: number; naiRecords: number; naiAvg: number
    nokCost: number; nokRecords: number; nokAvg: number
    diff: number; diffPct: number
  }

  const compareData = useMemo((): CompareRow[] => {
    type Side = { cost: number; records: number }
    const naiMap = new Map<string, Side & { ชื่อสินค้า: string; รหัสสินค้า: string; กลุ่มสินค้า: string }>()
    const nokMap = new Map<string, Side>()

    cgFilteredData.forEach((plateRow) => {
      const isOutside = (plateRow.lines || []).some(l => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
      ;(plateRow.lines || []).forEach((line) => {
        if ((line.ชื่อสินค้า || "").includes("ค่าแรง")) return // skip labor lines
        const key = (line.รหัสสินค้า || line.ชื่อสินค้า || "").trim()
        if (!key) return
        const target = isOutside ? nokMap : naiMap
        if (!target.has(key)) {
          if (!isOutside) {
            naiMap.set(key, { cost: 0, records: 0, ชื่อสินค้า: line.ชื่อสินค้า || "", รหัสสินค้า: line.รหัสสินค้า || "", กลุ่มสินค้า: line.กลุ่มสินค้า || "" })
          } else {
            nokMap.set(key, { cost: 0, records: 0 })
          }
        }
        const entry = target.get(key)!
        entry.cost    += line.cost
        entry.records += line.records
      })
    })

    const rows: CompareRow[] = []
    naiMap.forEach((nai, key) => {
      if (!nokMap.has(key)) return
      const nok      = nokMap.get(key)!
      const naiAvg   = nai.records > 0 ? nai.cost / nai.records : 0
      const nokAvg   = nok.records > 0 ? nok.cost / nok.records : 0
      const diff     = nokAvg - naiAvg
      const diffPct  = naiAvg > 0 ? (diff / naiAvg) * 100 : 0
      rows.push({
        key, ชื่อสินค้า: nai.ชื่อสินค้า, รหัสสินค้า: nai.รหัสสินค้า, กลุ่มสินค้า: nai.กลุ่มสินค้า,
        naiCost: nai.cost, naiRecords: nai.records, naiAvg,
        nokCost: nok.cost, nokRecords: nok.records, nokAvg,
        diff, diffPct,
      })
    })

    return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  }, [cgFilteredData])

  // ── Pivot: Cost Group → กลุ่มสินค้า × month, split อู่ใน | อู่นอก ────────
  type PivotEntry = { cost: number; records: number }
  type PivotCell  = { nai: PivotEntry; nok: PivotEntry }
  const zeroPivot = (): PivotCell => ({ nai: { cost: 0, records: 0 }, nok: { cost: 0, records: 0 } })
  const addEntry  = (target: PivotCell, side: "nai" | "nok", cost: number, records: number) => {
    target[side].cost    += cost
    target[side].records += records
  }

  const { pivotMonths, pivotTree, pivotColTotal } = useMemo(() => {
    const monthSet = new Set<string>()
    // tree[costGroup][กลุ่มสินค้า][month] = PivotCell
    const tree = new Map<string, {
      subtotal: PivotCell
      groups: Map<string, { rowTotal: PivotCell; months: Map<string, PivotCell> }>
    }>()
    const colTotal = new Map<string, PivotCell>()

    cgFilteredData.forEach((r) => {
      const isOutside = (r.lines || []).some(l => (l.ชื่อสินค้า || "").includes("ค่าแรง"))
      const side: "nai" | "nok" = isOutside ? "nok" : "nai"
      monthSet.add(r.month_year)
      ;(r.lines || []).forEach((line) => {
        const cg = getCostGroup(line.จุดประสงค์ || "")
        const g  = line.กลุ่มสินค้า || "ไม่ระบุ"
        const { cost, records } = line

        if (!tree.has(cg)) tree.set(cg, { subtotal: zeroPivot(), groups: new Map() })
        const cgNode = tree.get(cg)!
        addEntry(cgNode.subtotal, side, cost, records)

        if (!cgNode.groups.has(g)) cgNode.groups.set(g, { rowTotal: zeroPivot(), months: new Map() })
        const gNode = cgNode.groups.get(g)!
        addEntry(gNode.rowTotal, side, cost, records)

        if (!gNode.months.has(r.month_year)) gNode.months.set(r.month_year, zeroPivot())
        addEntry(gNode.months.get(r.month_year)!, side, cost, records)

        if (!colTotal.has(r.month_year)) colTotal.set(r.month_year, zeroPivot())
        addEntry(colTotal.get(r.month_year)!, side, cost, records)
      })
    })

    const months = Array.from(monthSet).sort((a, b) => a.localeCompare(b))

    // sort cost groups by subtotal desc
    const sortedTree = Array.from(tree.entries()).sort(([, a], [, b]) => {
      const ta = a.subtotal.nai.cost + a.subtotal.nok.cost
      const tb = b.subtotal.nai.cost + b.subtotal.nok.cost
      return tb - ta
    }).map(([cg, node]) => ({
      cg,
      subtotal: node.subtotal,
      groups: Array.from(node.groups.entries()).sort(([, a], [, b]) => {
        return (b.rowTotal.nai.cost + b.rowTotal.nok.cost) - (a.rowTotal.nai.cost + a.rowTotal.nok.cost)
      }).map(([g, gNode]) => ({ g, rowTotal: gNode.rowTotal, months: gNode.months })),
    }))

    return { pivotMonths: months, pivotTree: sortedTree, pivotColTotal: colTotal }
  }, [cgFilteredData])

  // ── Password gate UI ──────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0f1117]">
        <form onSubmit={submitPassword} className="w-80 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-8 shadow-sm">
          <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">Transaction Detail</p>
          <p className="mb-5 text-xs text-gray-400">Enter password to access</p>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            placeholder="Password"
            autoFocus
            className="mb-3 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-gray-400 dark:text-white"
          />
          {pwError && <p className="mb-3 text-xs text-red-500">Incorrect password</p>}
          <button type="submit" className="w-full rounded-xl bg-gray-900 dark:bg-white py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:opacity-90 transition">
            Unlock
          </button>
        </form>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Transaction Detail</h1>
        <p className="text-xs text-gray-400 mt-0.5">All Plates by Month — Month → Cost Group → Plate → Line</p>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Date range */}
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

          {/* อู่ filter */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Workshop</label>
            <div className="flex rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden text-[11px] font-semibold">
              {(["all", "อู่ใน", "อู่นอก"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setWorkshopFilter(v)}
                  className={`px-3 py-1.5 transition border-r last:border-r-0 border-gray-200 dark:border-white/10 ${
                    workshopFilter === v
                      ? v === "อู่นอก" ? "bg-orange-500 text-white"
                      : v === "อู่ใน"  ? "bg-sky-500 text-white"
                      : "bg-gray-900 text-white"
                      : "bg-white dark:bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                  }`}
                >
                  {v === "all" ? "ทั้งหมด" : v}
                </button>
              ))}
            </div>
          </div>

          {/* Plate / WD filter */}
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Filter Plate / WD</label>
            <input
              type="text"
              value={detailFilter}
              onChange={(e) => setDetailFilter(e.target.value)}
              placeholder="ค้นหาทะเบียน หรือ WD…"
              className="rounded-xl border border-gray-200 dark:border-white/10 bg-transparent px-3 py-1.5 text-xs dark:text-white outline-none focus:border-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600"
            />
          </div>

          {/* Load button */}
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

        {/* KPI summary row */}
        {hasLoaded && !loading && (
          <div className="mt-3 flex flex-wrap gap-4 border-t border-gray-100 dark:border-white/8 pt-3">
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-900 dark:text-white">{totalPlates.toLocaleString()}</span> plates
            </div>
            <div className="text-xs text-gray-500">
              <span className="font-semibold text-gray-900 dark:text-white">{totalRecords.toLocaleString()}</span> records
            </div>
            <div className="text-xs text-gray-500">
              Total cost: <span className="font-semibold text-gray-900 dark:text-white">{formatNumber(totalCost)}</span> ฿
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>
      )}

      {/* 4 summary cards */}
      {hasLoaded && !loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* อู่ใน total cost */}
          <div className="rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-sky-100 text-sky-600">อู่ใน</span>
              <span className="text-[11px] text-gray-400">{avgStats.naiCount} คัน</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">ค่าซ่อมรวม</p>
            <p className="text-xl font-bold text-sky-700 dark:text-sky-400">
              {avgStats.naiTotal > 0
                ? avgStats.naiTotal >= 1_000_000
                  ? (avgStats.naiTotal / 1_000_000).toFixed(2) + "M"
                  : avgStats.naiTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">บาท (ทั้งช่วง)</p>
          </div>

          {/* อู่นอก total cost */}
          <div className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-950/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-600">อู่นอก</span>
              <span className="text-[11px] text-gray-400">{avgStats.nokCount} คัน</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">ค่าซ่อมรวม</p>
            <p className="text-xl font-bold text-orange-700 dark:text-orange-400">
              {avgStats.nokTotal > 0
                ? avgStats.nokTotal >= 1_000_000
                  ? (avgStats.nokTotal / 1_000_000).toFixed(2) + "M"
                  : avgStats.nokTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">บาท (ทั้งช่วง)</p>
          </div>

          {/* อู่ใน avg/plate */}
          <div className="rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-white dark:bg-[#1a1d27] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-sky-100 text-sky-600">อู่ใน</span>
              <span className="text-[11px] text-gray-400">avg / คัน</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">ค่าซ่อมเฉลี่ย / คัน</p>
            <p className="text-xl font-bold text-sky-700 dark:text-sky-400">
              {avgStats.naiAvg > 0
                ? avgStats.naiAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">บาท / คัน (ทั้งช่วง)</p>
          </div>

          {/* อู่นอก avg/plate */}
          <div className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-white dark:bg-[#1a1d27] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-600">อู่นอก</span>
              <span className="text-[11px] text-gray-400">avg / คัน</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">ค่าซ่อมเฉลี่ย / คัน</p>
            <p className="text-xl font-bold text-orange-700 dark:text-orange-400">
              {avgStats.nokAvg > 0
                ? avgStats.nokAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : "—"}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">บาท / คัน (ทั้งช่วง)</p>
          </div>
        </div>
      )}

      {/* Bar chart: อู่ใน vs อู่นอก by month */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-5">
          <p className="mb-4 text-xs font-semibold text-gray-700 dark:text-gray-300">
            ค่าซ่อม อู่ใน vs อู่นอก รายเดือน
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


      {/* Pivot table: Cost Group → กลุ่มสินค้า × month — split อู่ใน | อู่นอก */}
      {pivotTree.length > 0 && (() => {
        const fmtCost = (v: number) => {
          if (v <= 0) return null
          if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M"
          return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
        }
        const fmtAvg = (cost: number, rec: number) => {
          if (rec <= 0) return null
          const a = cost / rec
          if (a >= 1_000_000) return (a / 1_000_000).toFixed(2) + "M"
          if (a >= 1_000) return (a / 1_000).toFixed(1) + "K"
          return a.toLocaleString(undefined, { maximumFractionDigits: 0 })
        }

        const CostCell = ({ e, color }: { e: PivotEntry; color: "sky" | "orange" }) => {
          const cost = fmtCost(e.cost)
          const avg  = fmtAvg(e.cost, e.records)
          if (!cost) return <span className="text-gray-300 dark:text-gray-600">—</span>
          return (
            <span className="flex flex-col items-end gap-0.5">
              <span className={`font-semibold tabular-nums ${color === "sky" ? "text-sky-700 dark:text-sky-400" : "text-orange-700 dark:text-orange-400"}`}>
                {cost}
              </span>
              <span className="text-[9px] tabular-nums text-gray-400 dark:text-gray-500">
                {e.records} · {avg}
              </span>
            </span>
          )
        }

        const grandNai = pivotTree.reduce((s, n) => ({ cost: s.cost + n.subtotal.nai.cost, records: s.records + n.subtotal.nai.records }), { cost: 0, records: 0 })
        const grandNok = pivotTree.reduce((s, n) => ({ cost: s.cost + n.subtotal.nok.cost, records: s.records + n.subtotal.nok.records }), { cost: 0, records: 0 })

        return (
          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-5">
            <div className="mb-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  ค่าซ่อมรวม จำแนกตาม กลุ่มสินค้า × เดือน
                </p>
                <button
                  onClick={() => setShowPivotInfo(v => !v)}
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold border transition ${
                    showPivotInfo
                      ? "bg-gray-900 border-gray-900 text-white dark:bg-white dark:border-white dark:text-gray-900"
                      : "border-gray-300 dark:border-white/20 text-gray-400 hover:border-gray-500 dark:hover:border-white/40 hover:text-gray-600"
                  }`}
                >
                  i
                </button>
              </div>
              {showPivotInfo && (
                <div className="rounded-xl border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-white/[0.03] px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed space-y-1.5">
                  <p className="font-semibold text-gray-700 dark:text-gray-300 text-xs">วิธีอ่านตารางนี้</p>
                  <p>• แถวหลัก = <span className="font-semibold">Cost Group</span> (คลิกเพื่อดู/ซ่อน กลุ่มสินค้า ย่อย)</p>
                  <p>• แถวย่อย = <span className="font-semibold">กลุ่มสินค้า</span> ภายใน Cost Group นั้น</p>
                  <p>• แต่ละคอลัมน์ = เดือน แบ่งเป็น 2 ฝั่ง: <span className="font-semibold text-sky-600">อู่ใน</span> และ <span className="font-semibold text-orange-500">อู่นอก</span></p>
                  <p>• ในแต่ละเซลล์มี 2 บรรทัด:</p>
                  <p className="pl-3">— บรรทัดบน: <span className="font-semibold">ค่าซ่อมรวม</span> (฿)</p>
                  <p className="pl-3">— บรรทัดล่าง: <span className="font-semibold">จำนวนรายการ (qty)</span> · <span className="font-semibold">ค่าเฉลี่ยต่อรายการ (avg)</span></p>
                  <p>• <span className="font-semibold">อู่ใน</span> = ใบเบิกที่ไม่มีรายการ "ค่าแรง" → ซ่อมภายในองค์กร</p>
                  <p>• <span className="font-semibold">อู่นอก</span> = ใบเบิกที่มีรายการ "ค่าแรง" → ซ่อมโดยอู่ภายนอก</p>
                  <p>• คอลัมน์ <span className="font-semibold">รวม</span> = ผลรวมทุกเดือนในช่วงที่เลือก</p>
                  <p>• แถว <span className="font-semibold">รวม</span> (footer) = ผลรวมทุก Cost Group ในแต่ละเดือน</p>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="text-right text-[11px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th rowSpan={2} className="py-2 pr-5 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap align-bottom border-b border-gray-200 dark:border-white/10">
                      กลุ่มสินค้า
                    </th>
                    {pivotMonths.map((m) => (
                      <th key={m} colSpan={2} className="py-1.5 px-1 text-center font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100 dark:border-white/8 border-l border-gray-100 dark:border-white/8">
                        {m}
                      </th>
                    ))}
                    <th colSpan={2} className="py-1.5 px-1 text-center font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap border-b border-gray-200 dark:border-white/10 border-l border-gray-200 dark:border-white/10">
                      รวม
                    </th>
                  </tr>
                  <tr>
                    {pivotMonths.map((m) => (
                      <React.Fragment key={m}>
                        <th className="py-1.5 px-3 text-center font-semibold text-sky-500 whitespace-nowrap border-b border-gray-200 dark:border-white/10 border-l border-gray-100 dark:border-white/8">
                          อู่ใน
                        </th>
                        <th className="py-1.5 px-3 text-center font-semibold text-orange-500 whitespace-nowrap border-b border-gray-200 dark:border-white/10">
                          อู่นอก
                        </th>
                      </React.Fragment>
                    ))}
                    <th className="py-1.5 px-3 text-center font-semibold text-sky-500 whitespace-nowrap border-b border-gray-200 dark:border-white/10 border-l border-gray-200 dark:border-white/10">
                      อู่ใน
                    </th>
                    <th className="py-1.5 px-3 text-center font-semibold text-orange-500 whitespace-nowrap border-b border-gray-200 dark:border-white/10">
                      อู่นอก
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pivotTree.map((cgNode) => {
                    const isOpen = expandedPivotGroups.has(cgNode.cg)
                    const totalCols = pivotMonths.length * 2 + 2
                    return (
                      <React.Fragment key={cgNode.cg}>
                        {/* Cost Group header row */}
                        <tr
                          className="cursor-pointer bg-gray-100/80 dark:bg-white/[0.06] hover:bg-gray-100 dark:hover:bg-white/[0.09] transition-colors"
                          onClick={() => setExpandedPivotGroups(prev => {
                            const next = new Set(prev)
                            isOpen ? next.delete(cgNode.cg) : next.add(cgNode.cg)
                            return next
                          })}
                        >
                          <td className="py-2 pr-5 text-left font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap" colSpan={totalCols + 1}>
                            <span className="mr-2 text-[10px] text-gray-400">{isOpen ? "▾" : "▸"}</span>
                            {cgNode.cg}
                          </td>
                        </tr>
                        {/* Cost Group subtotal row (always visible) */}
                        <tr className="bg-gray-50/60 dark:bg-white/[0.03] border-b border-gray-100 dark:border-white/8">
                          <td className="py-1.5 pr-5 pl-6 text-left text-[10px] text-gray-400 whitespace-nowrap italic">รวม</td>
                          {pivotMonths.map((m) => {
                            const c = cgNode.groups.reduce((acc, gn) => {
                              const mc = gn.months.get(m) ?? zeroPivot()
                              addEntry(acc, "nai", mc.nai.cost, mc.nai.records)
                              addEntry(acc, "nok", mc.nok.cost, mc.nok.records)
                              return acc
                            }, zeroPivot())
                            return (
                              <React.Fragment key={m}>
                                <td className="py-1.5 px-3 whitespace-nowrap border-l border-gray-100 dark:border-white/5">
                                  <CostCell e={c.nai} color="sky" />
                                </td>
                                <td className="py-1.5 px-3 whitespace-nowrap">
                                  <CostCell e={c.nok} color="orange" />
                                </td>
                              </React.Fragment>
                            )
                          })}
                          <td className="py-1.5 px-3 whitespace-nowrap border-l border-gray-200 dark:border-white/10">
                            <CostCell e={cgNode.subtotal.nai} color="sky" />
                          </td>
                          <td className="py-1.5 px-3 whitespace-nowrap">
                            <CostCell e={cgNode.subtotal.nok} color="orange" />
                          </td>
                        </tr>
                        {/* กลุ่มสินค้า detail rows (collapsible) */}
                        {isOpen && cgNode.groups.map((gNode, gi) => (
                          <tr key={gNode.g} className={`border-b border-gray-50 dark:border-white/5 ${gi % 2 === 0 ? "" : "bg-gray-50/30 dark:bg-white/[0.01]"}`}>
                            <td className="py-2.5 pr-5 pl-8 text-left text-gray-600 dark:text-gray-300 whitespace-nowrap text-[11px]">
                              {gNode.g}
                            </td>
                            {pivotMonths.map((m) => {
                              const c = gNode.months.get(m) ?? zeroPivot()
                              return (
                                <React.Fragment key={m}>
                                  <td className="py-2.5 px-3 whitespace-nowrap border-l border-gray-100 dark:border-white/5">
                                    <CostCell e={c.nai} color="sky" />
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <CostCell e={c.nok} color="orange" />
                                  </td>
                                </React.Fragment>
                              )
                            })}
                            <td className="py-2.5 px-3 whitespace-nowrap border-l border-gray-200 dark:border-white/10">
                              <CostCell e={gNode.rowTotal.nai} color="sky" />
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <CostCell e={gNode.rowTotal.nok} color="orange" />
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-white/12">
                    <td className="py-2.5 pr-5 text-left font-bold text-gray-700 dark:text-gray-200">รวม</td>
                    {pivotMonths.map((m) => {
                      const c = pivotColTotal.get(m) ?? zeroPivot()
                      return (
                        <React.Fragment key={m}>
                          <td className="py-2.5 px-3 whitespace-nowrap border-l border-gray-100 dark:border-white/8">
                            <CostCell e={c.nai} color="sky" />
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <CostCell e={c.nok} color="orange" />
                          </td>
                        </React.Fragment>
                      )
                    })}
                    <td className="py-2.5 px-3 whitespace-nowrap border-l border-gray-200 dark:border-white/10">
                      <CostCell e={grandNai} color="sky" />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <CostCell e={grandNok} color="orange" />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Compare table อู่ใน vs อู่นอก — grouped by กลุ่มสินค้า */}
      {compareData.length > 0 && (() => {
        // apply compareFilter
        const visibleRows = compareData.filter((row) => {
          if (compareFilter === "nai-expensive") return row.diff < 0
          if (compareFilter === "nok-expensive") return row.diff > 0
          return true
        })

        // group by กลุ่มสินค้า
        const groupMap = new Map<string, CompareRow[]>()
        visibleRows.forEach((row) => {
          const g = row.กลุ่มสินค้า || "ไม่ระบุ"
          if (!groupMap.has(g)) groupMap.set(g, [])
          groupMap.get(g)!.push(row)
        })
        const groups = Array.from(groupMap.entries()).sort((a, b) => a[0].localeCompare(b[0], "th"))

        return (
          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-5">
            {/* Header */}
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">เปรียบเทียบรายการซ่อม — อู่ใน vs อู่นอก</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {visibleRows.length} รายการ · จัดกลุ่มตาม กลุ่มสินค้า
                </p>
              </div>
              {/* แพงกว่า filter */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">แพงกว่า</span>
                <div className="flex rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden text-[10px] font-semibold">
                  {([["all","ทั้งหมด"],["nok-expensive","อู่นอก"],["nai-expensive","อู่ใน"]] as const).map(([v, label]) => (
                    <button key={v} onClick={() => setCompareFilter(v)}
                      className={`px-2.5 py-1.5 border-r last:border-r-0 border-gray-200 dark:border-white/10 transition ${
                        compareFilter === v
                          ? v === "nok-expensive" ? "bg-orange-500 text-white"
                          : v === "nai-expensive" ? "bg-sky-500 text-white"
                          : "bg-gray-900 text-white"
                          : "bg-white dark:bg-transparent text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
                      }`}>{label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Explanation (collapsible) */}
            <div className="mb-4">
              <button
                onClick={() => setShowExplanation((v) => !v)}
                className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 dark:border-white/20 text-[9px] font-bold">i</span>
                {showExplanation ? "ซ่อนคำอธิบาย" : "วิธีอ่านตารางนี้"}
              </button>
              {showExplanation && (
                <div className="mt-2 rounded-xl bg-gray-50 dark:bg-white/4 border border-gray-100 dark:border-white/8 p-4 text-[11px] text-gray-500 dark:text-gray-400 space-y-2">
                  <p className="font-semibold text-gray-700 dark:text-gray-200 text-xs">วิธีการทำงานของตาราง</p>
                  <div className="space-y-1.5">
                    <p><span className="font-medium text-sky-600">🔵 อู่ใน</span> = transaction ที่ <strong>ไม่มี</strong> รายการ "ค่าแรง" ในใบเบิก — หมายถึงซ่อมภายในโดยช่างของบริษัท</p>
                    <p><span className="font-medium text-orange-600">🟠 อู่นอก</span> = transaction ที่ <strong>มี</strong> รายการ "ค่าแรง" อยู่ — หมายถึงส่งออกไปซ่อมอู่ภายนอก</p>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">avg / record</span> = ค่าใช้จ่ายรวมของรายการนั้น ÷ จำนวนครั้งที่เบิก (records) — ใช้เปรียบเทียบราคาต่อหน่วยการทำงาน</p>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">ค่าแรง ถูกตัดออก</span> จากการคำนวณทั้งสองฝั่ง เพื่อเปรียบเทียบเฉพาะค่าอะไหล่/วัสดุ</p>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">แสดงเฉพาะ</span> รายการที่ปรากฏใน <strong>ทั้งสองฝั่ง</strong> เพื่อให้เปรียบเทียบได้ตรงกัน</p>
                    <p><span className="text-red-500 font-medium">สีแดง</span> = อู่นอกแพงกว่าอู่ใน &nbsp;|&nbsp; <span className="text-emerald-500 font-medium">สีเขียว</span> = อู่นอกถูกกว่าอู่ใน</p>
                  </div>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/8 text-gray-400 font-medium">
                    <th className="py-1.5 text-left">ชื่อสินค้า</th>
                    <th className="py-1.5 text-left w-24 font-mono">รหัสสินค้า</th>
                    <th className="py-1.5 text-right w-28">
                      <span className="inline-flex items-center justify-end gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400 inline-block" />อู่ใน avg
                      </span>
                    </th>
                    <th className="py-1.5 text-right w-10 text-gray-300">rec</th>
                    <th className="py-1.5 text-right w-28">
                      <span className="inline-flex items-center justify-end gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" />อู่นอก avg
                      </span>
                    </th>
                    <th className="py-1.5 text-right w-10 text-gray-300">rec</th>
                    <th className="py-1.5 text-right w-28">ส่วนต่าง</th>
                    <th className="py-1.5 text-right w-16">%</th>
                    <th className="py-1.5 text-center w-20">แพงกว่า</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([group, rows]) => {
                    const open = expandedCompareGroups.has(group)
                    const groupNaiAvg = rows.reduce((s, r) => s + r.naiAvg, 0) / rows.length
                    const groupNokAvg = rows.reduce((s, r) => s + r.nokAvg, 0) / rows.length
                    const groupDiff   = groupNokAvg - groupNaiAvg
                    const groupPct    = groupNaiAvg > 0 ? (groupDiff / groupNaiAvg) * 100 : 0
                    const gPricier    = groupDiff > 0
                    const gCheaper    = groupDiff < 0
                    return (
                      <React.Fragment key={group}>
                        {/* Group header row */}
                        <tr
                          onClick={() => setExpandedCompareGroups((prev) => {
                            const next = new Set(prev)
                            if (next.has(group)) next.delete(group); else next.add(group)
                            return next
                          })}
                          className="cursor-pointer select-none bg-gray-100 dark:bg-white/6 hover:bg-gray-200 dark:hover:bg-white/10 transition"
                        >
                          <td colSpan={2} className="py-2 pl-2">
                            <span className="mr-2 text-[10px] text-gray-400">{open ? "▼" : "▶"}</span>
                            <span className="font-semibold text-gray-800 dark:text-gray-200">{group}</span>
                            <span className="ml-2 text-[10px] text-gray-400">{rows.length} รายการ</span>
                          </td>
                          <td className="py-2 text-right font-medium text-sky-600 dark:text-sky-400">
                            {groupNaiAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td />
                          <td className="py-2 text-right font-medium text-orange-600 dark:text-orange-400">
                            {groupNokAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td />
                          <td className={`py-2 text-right font-semibold ${gPricier ? "text-red-500" : gCheaper ? "text-emerald-500" : "text-gray-400"}`}>
                            {groupDiff > 0 ? "+" : ""}{groupDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="py-2 text-right">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              gPricier ? "bg-red-50 dark:bg-red-950/30 text-red-500" :
                              gCheaper ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" :
                              "bg-gray-50 text-gray-400"
                            }`}>
                              {groupDiff > 0 ? "+" : ""}{groupPct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 text-center">
                            {groupDiff !== 0 && (
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                gPricier ? "bg-orange-100 text-orange-600" : "bg-sky-100 text-sky-600"
                              }`}>
                                {gPricier ? "อู่นอก" : "อู่ใน"}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Item rows */}
                        {open && rows.map((row) => {
                          const cheaper = row.diff < 0
                          const pricier = row.diff > 0
                          return (
                            <tr key={row.key} className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3 transition">
                              <td className="py-1.5 pl-7 font-medium text-gray-700 dark:text-gray-200">{row.ชื่อสินค้า || "—"}</td>
                              <td className="py-1.5 font-mono text-[10px] text-gray-400">{row.รหัสสินค้า || "—"}</td>
                              <td className="py-1.5 text-right text-sky-700 dark:text-sky-400">
                                {row.naiAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="py-1.5 text-right text-gray-300">{row.naiRecords}</td>
                              <td className="py-1.5 text-right text-orange-700 dark:text-orange-400">
                                {row.nokAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="py-1.5 text-right text-gray-300">{row.nokRecords}</td>
                              <td className={`py-1.5 text-right font-semibold ${pricier ? "text-red-500" : cheaper ? "text-emerald-500" : "text-gray-400"}`}>
                                {row.diff > 0 ? "+" : ""}{row.diff.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="py-1.5 text-right">
                                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${
                                  pricier  ? "bg-red-50 dark:bg-red-950/30 text-red-500" :
                                  cheaper  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" :
                                  "bg-gray-50 text-gray-400"
                                }`}>
                                  {row.diff > 0 ? "+" : ""}{row.diffPct.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-1.5 text-center">
                                {row.diff !== 0 && (
                                  <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                    pricier ? "bg-orange-100 text-orange-600" : "bg-sky-100 text-sky-600"
                                  }`}>
                                    {pricier ? "อู่นอก" : "อู่ใน"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] text-gray-400">
              ส่วนต่าง = อู่นอก avg − อู่ใน avg · <span className="text-red-400">สีแดง</span> = อู่นอกแพงกว่า · <span className="text-emerald-500">สีเขียว</span> = อู่นอกถูกกว่า
            </p>
          </div>
        )
      })()}

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-5">
        {!hasLoaded && !loading ? (
          <p className="py-12 text-center text-xs text-gray-400">
            กด "Load Data" เพื่อโหลดข้อมูล Transaction Detail
          </p>
        ) : loading ? (
          <p className="py-12 text-center text-xs text-gray-400">Loading…</p>
        ) : flat.length === 0 ? (
          <p className="py-12 text-center text-xs text-gray-400">No data found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/8 text-gray-400 font-medium">
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

                  // Level 1: Month
                  if (row.kind === "month") {
                    const open = expandedMonths.has(row.month_year)
                    return (
                      <tr key={`m-${row.month_year}`}
                          onClick={() => toggleMonth(row.month_year)}
                          className="cursor-pointer select-none bg-gray-900 hover:bg-gray-800 transition">
                        <td colSpan={8} className="py-2.5 pl-3">
                          <span className="mr-2 text-[10px] text-gray-500">{open ? "▼" : "▶"}</span>
                          <span className="text-sm font-bold text-white">{row.month_year}</span>
                          <span className="ml-3 text-[11px] text-gray-400">
                            {row.plateCount} plates · {row.totalRecords.toLocaleString()} records
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-sm font-bold text-white">
                          {formatShort(row.totalCost)}
                        </td>
                      </tr>
                    )
                  }

                  // Level 2: Cost Group
                  if (row.kind === "costgroup") {
                    const open = expandedCostGroups.has(row.cgKey)
                    return (
                      <tr key={row.cgKey}
                          onClick={() => toggleCostGroup(row.cgKey)}
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

                  // Level 3: Plate
                  if (row.kind === "plate") {
                    const open      = expandedPlates.has(row.groupKey)
                    const recCount  = row.lines.reduce((s, l) => s + l.records, 0)
                    return (
                      <tr key={row.groupKey}
                          onClick={() => togglePlate(row.groupKey)}
                          className="cursor-pointer select-none border-b border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-white/4 hover:bg-gray-100 dark:hover:bg-white/6 transition">
                        <td className="py-2 pl-8 font-medium text-gray-600 dark:text-gray-400">{row.wd || "—"}</td>
                        <td className="py-2 font-semibold text-gray-800 dark:text-gray-200">
                          <span className={`inline-block mr-1.5 rounded px-1 py-0.5 text-[9px] font-bold leading-none ${
                            row.isOutside ? "bg-orange-100 text-orange-600" : "bg-sky-100 text-sky-600"
                          }`}>
                            {row.isOutside ? "อู่นอก" : "อู่ใน"}
                          </span>
                          {row.plate || "—"}
                          <span className="ml-1.5 text-[10px] font-normal text-gray-400">
                            {open ? "▲" : "▼"} {row.lines.length}
                          </span>
                        </td>
                        <td colSpan={5} className="py-2 pl-1 text-[10px] text-gray-400">
                          {!open && row.lines.slice(0, 3).map((l) => l.กลุ่มสินค้า).filter(Boolean).join(" · ")}
                        </td>
                        <td className="py-2 pr-3 text-right font-bold text-gray-800 dark:text-gray-200">
                          {formatShort(row.subtotal)}
                        </td>
                        <td className="py-2 text-right text-gray-400">{recCount}</td>
                      </tr>
                    )
                  }

                  // Level 4: Line
                  const { line, rowKey } = row
                  return (
                    <tr key={rowKey} className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3 transition">
                      <td className="py-1.5 pl-12 text-gray-300" />
                      <td className="py-1.5 text-gray-300" />
                      <td className="py-1.5 text-gray-600 dark:text-gray-400">{line.กลุ่มสินค้า || "—"}</td>
                      <td className="py-1.5 font-mono text-[10px] text-gray-500">{line.รหัสสินค้า || "—"}</td>
                      <td className="py-1.5 text-gray-600 dark:text-gray-300">{line.ชื่อสินค้า || "—"}</td>
                      <td className="py-1.5 text-right text-gray-500">
                        {line.ราคาทุน != null ? formatNumber(line.ราคาทุน) : "—"}
                      </td>
                      <td className="py-1.5 text-[10px] text-gray-400">{line.ซัพพลายเออร์ || "—"}</td>
                      <td className="py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">
                        {formatShort(line.cost)}
                      </td>
                      <td className="py-1.5 text-right text-gray-400">{line.records}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
