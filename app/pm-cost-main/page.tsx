"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// ── Types ─────────────────────────────────────────────────────────────────────

type PartLine = {
  requisition_no: string
  parts_group:    string
  part:           string
  qty:            number
  unit_price:     number
  total:          number
}

type TaskRow = {
  request_id:   number
  task_id:      string
  repair_type:  string
  description:  string
  month_year:   string
  pm_class:     string
  parts:        PartLine[]
  task_cost:    number
  request_code: string
  step:         string
  branch:       string
  plate_no:     string
  vehicle_no:   string
  owner_type:   string
  mechanic:     string
  reported_at:  string
  mileage_at_report: string
  garage_finish_at: string
  garage_entry_at:  string
  estimated_hours:  string
  main_date:        string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PM_ORDER = ["PM1", "PM2", "PM3", "PM4", "PM ไม่ระบุระยะ"]

const PM_COLOR: Record<string, string> = {
  "PM1":            "#3B82F6",
  "PM2":            "#F59E0B",
  "PM3":            "#8B5CF6",
  "PM4":            "#10B981",
  "PM ไม่ระบุระยะ": "#9CA3AF",
}

const PM_LABEL_COLOR: Record<string, string> = {
  "PM1":            "#2563eb",
  "PM2":            "#d97706",
  "PM3":            "#7c3aed",
  "PM4":            "#059669",
  "PM ไม่ระบุระยะ": "#6b7280",
}

const MONTH_NUM_TO_LABEL: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

const PAGE_SIZE = 150

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

// ช่างมีนา vs อู่นอก: a named mechanic is always ช่างมีนา —
// only jobs recorded as "ซ่อมร้านนอก"/"อู่นอก" (no person) count as อู่นอก
function mechanicGroupOf(r: { mechanic?: string; repair_type?: string }): "ช่างมีนา" | "อู่นอก" {
  const mech = (r.mechanic || "").trim()
  if (!mech || mech.includes("ร้านนอก") || mech.includes("อู่นอก")) return "อู่นอก"
  return "ช่างมีนา"
}

// "DD/MM/YYYY HH:mm" → "YYYY-MM-DD HH:mm" (sortable)
function sortKeyOf(reportedAt: string): string {
  if (!reportedAt || reportedAt.length < 10) return ""
  return `${reportedAt.slice(6, 10)}-${reportedAt.slice(3, 5)}-${reportedAt.slice(0, 2)} ${reportedAt.slice(11)}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PmCostMainPage() {
  const today      = new Date()
  const todayYear  = today.getFullYear()
  const todayMonth = String(today.getMonth() + 1).padStart(2, "0")

  const [startMonth, setStartMonth] = useState(`${todayYear}-01`)
  const [endMonth, setEndMonth]     = useState(`${todayYear}-${todayMonth}`)

  const [rows, setRows]       = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const [selectedBranches, setSelectedBranches]     = useState<Set<string>>(new Set())
  const [selectedClasses, setSelectedClasses]       = useState<Set<string>>(new Set())
  const [selectedOwnerTypes, setSelectedOwnerTypes] = useState<Set<string>>(new Set())
  const [selectedMechGroups, setSelectedMechGroups] = useState<Set<string>>(new Set())
  const [selectedMechanic, setSelectedMechanic]     = useState<string>("")
  const [selectedFinish, setSelectedFinish]         = useState<Set<string>>(new Set())
  const [search, setSearch]     = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [copiedMr, setCopiedMr] = useState<string | null>(null)

  const copyMr = (e: React.MouseEvent, code: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(code)
    setCopiedMr(code)
    setTimeout(() => setCopiedMr((prev) => (prev === code ? null : prev)), 1500)
  }

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pm-cost-main?start=${startMonth}&end=${endMonth}`, { cache: "no-store" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "Load failed")
      setRows(json.data)
      setHasSearched(true)
      setVisibleCount(PAGE_SIZE)
    } catch (e: any) {
      setError(e.message || "Load failed")
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  // ── Filters ─────────────────────────────────────────────────────────────────
  const branches = useMemo(
    () => Array.from(new Set(rows.map((r) => r.branch || "ไม่ระบุ"))).sort(),
    [rows]
  )

  const ownerTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.owner_type || "ไม่ระบุ"))).sort(),
    [rows]
  )

  const mechanics = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r) => { const k = r.mechanic || "ไม่ระบุ"; m.set(k, (m.get(k) || 0) + 1) })
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [rows])

  const fRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (selectedBranches.size > 0 && !selectedBranches.has(r.branch || "ไม่ระบุ")) return false
      if (selectedClasses.size > 0 && !selectedClasses.has(r.pm_class)) return false
      if (selectedOwnerTypes.size > 0 && !selectedOwnerTypes.has(r.owner_type || "ไม่ระบุ")) return false
      if (selectedMechGroups.size > 0 && !selectedMechGroups.has(mechanicGroupOf(r))) return false
      if (selectedMechanic && (r.mechanic || "ไม่ระบุ") !== selectedMechanic) return false
      if (selectedFinish.size > 0) {
        const finished = (r.garage_finish_at || "").length >= 10 ? "ซ่อมเสร็จแล้ว" : "ยังไม่เสร็จ"
        if (!selectedFinish.has(finished)) return false
      }
      if (!q) return true
      return (
        r.request_code?.toLowerCase().includes(q) ||
        r.plate_no?.toLowerCase().includes(q) ||
        r.vehicle_no?.toLowerCase().includes(q) ||
        r.mechanic?.toLowerCase().includes(q) ||
        r.parts?.some((p) =>
          p.requisition_no?.toLowerCase().includes(q) || p.part?.toLowerCase().includes(q))
      )
    })
  }, [rows, selectedBranches, selectedClasses, selectedOwnerTypes, selectedMechGroups, selectedMechanic, selectedFinish, search])

  const months = useMemo(() => getMonthsInRange(startMonth, endMonth), [startMonth, endMonth])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalCost    = useMemo(() => fRows.reduce((s, r) => s + r.task_cost, 0), [fRows])
  const mrCount      = useMemo(() => new Set(fRows.map((r) => r.request_id)).size, [fRows])
  const plateCount   = useMemo(() => new Set(fRows.filter((r) => r.plate_no).map((r) => r.plate_no)).size, [fRows])
  const unstagedCost = useMemo(
    () => fRows.filter((r) => r.pm_class === "PM ไม่ระบุระยะ").reduce((s, r) => s + r.task_cost, 0),
    [fRows]
  )

  // ── PM class tiles (with ช่างมีนา vs อู่นอก split) ─────────────────────────
  // Averages use only jobs with ค่าซ่อม > 0 (tasksPaid) — zero-cost tasks would
  // drag the เฉลี่ย/งาน down artificially
  type GroupStat = { cost: number; tasks: number; tasksPaid: number; plates: Set<string> }
  const classTiles = useMemo(() => {
    const m = new Map<string, { cost: number; tasks: number; tasksPaid: number; plates: Set<string>; mena: GroupStat; nok: GroupStat }>()
    fRows.forEach((r) => {
      const e = m.get(r.pm_class) || {
        cost: 0, tasks: 0, tasksPaid: 0, plates: new Set<string>(),
        mena: { cost: 0, tasks: 0, tasksPaid: 0, plates: new Set<string>() },
        nok:  { cost: 0, tasks: 0, tasksPaid: 0, plates: new Set<string>() },
      }
      e.cost += r.task_cost
      e.tasks += 1
      if (r.task_cost > 0) e.tasksPaid += 1
      if (r.plate_no) e.plates.add(r.plate_no)
      const g = mechanicGroupOf(r) === "ช่างมีนา" ? e.mena : e.nok
      g.cost += r.task_cost
      g.tasks += 1
      if (r.task_cost > 0) g.tasksPaid += 1
      if (r.plate_no) g.plates.add(r.plate_no)
      m.set(r.pm_class, e)
    })
    return PM_ORDER.filter((k) => m.has(k)).map((k) => ({
      pm: k, cost: m.get(k)!.cost, tasks: m.get(k)!.tasks, tasksPaid: m.get(k)!.tasksPaid, plates: m.get(k)!.plates.size,
      mena: m.get(k)!.mena, nok: m.get(k)!.nok,
    }))
  }, [fRows])

  // ── Cost saving: (avg อู่นอก − avg มีนา) × จำนวนงานมีนา ────────────────────
  // No อู่นอก data in range → fall back to reference outside-garage prices,
  // which are Ladkrabang quotes, so the fallback counts only ลาดกระบัง jobs.
  const REF_NOK_PRICE: Record<string, number> = { PM1: 5300, PM2: 11600 }
  const REF_BRANCH = "ลาดกระบัง"

  const costSaving = useMemo(() => {
    // only jobs with ค่าซ่อม > 0 count — both for averages and the multiplier
    type Stat = { cost: number; tasks: number; plates: Set<string> }
    const newStat = (): Stat => ({ cost: 0, tasks: 0, plates: new Set() })
    const m = new Map<string, { mena: Stat; nok: Stat; menaRef: Stat }>()
    fRows.forEach((r) => {
      if (r.task_cost <= 0) return
      if (!m.has(r.pm_class)) m.set(r.pm_class, { mena: newStat(), nok: newStat(), menaRef: newStat() })
      const e = m.get(r.pm_class)!
      const isMena = mechanicGroupOf(r) === "ช่างมีนา"
      const g = isMena ? e.mena : e.nok
      g.cost += r.task_cost
      g.tasks += 1
      if (r.plate_no) g.plates.add(r.plate_no)
      if (isMena && r.branch === REF_BRANCH) {
        e.menaRef.cost += r.task_cost
        e.menaRef.tasks += 1
        if (r.plate_no) e.menaRef.plates.add(r.plate_no)
      }
    })

    const rows = PM_ORDER
      .filter((pm) => (m.get(pm)?.mena.tasks ?? 0) > 0)
      .map((pm) => {
        const e = m.get(pm)!
        if (e.nok.tasks > 0) {
          const avgMena = e.mena.cost / e.mena.tasks
          const avgNok  = e.nok.cost / e.nok.tasks
          return {
            pm, isRef: false, avgMena, avgNok,
            diff: avgNok - avgMena,
            menaTasks: e.mena.tasks, menaPlates: e.mena.plates.size,
            saving: (avgNok - avgMena) * e.mena.tasks,
          }
        }
        const ref = REF_NOK_PRICE[pm]
        if (ref !== undefined && e.menaRef.tasks > 0) {
          const avgMena = e.menaRef.cost / e.menaRef.tasks
          return {
            pm, isRef: true, avgMena, avgNok: ref,
            diff: ref - avgMena,
            menaTasks: e.menaRef.tasks, menaPlates: e.menaRef.plates.size,
            saving: (ref - avgMena) * e.menaRef.tasks,
          }
        }
        const avgMena = e.mena.cost / e.mena.tasks
        return {
          pm, isRef: false, avgMena, avgNok: null as number | null,
          diff: null as number | null,
          menaTasks: e.mena.tasks, menaPlates: e.mena.plates.size,
          saving: null as number | null,
        }
      })
    const total = rows.reduce((s, r) => s + (r.saving ?? 0), 0)
    return { rows, total }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fRows])

  // ── Breakdown by ประเภทรถร่วม / mechanic ───────────────────────────────────
  type Breakdown = { key: string; cost: number; mrs: number; plates: number; tasks: number; tasksPaid: number }

  const buildBreakdown = (keyOf: (r: TaskRow) => string): Breakdown[] => {
    const m = new Map<string, { cost: number; mrs: Set<number>; plates: Set<string>; tasks: number; tasksPaid: number }>()
    fRows.forEach((r) => {
      const k = keyOf(r) || "ไม่ระบุ"
      const e = m.get(k) || { cost: 0, mrs: new Set<number>(), plates: new Set<string>(), tasks: 0, tasksPaid: 0 }
      e.cost += r.task_cost
      e.mrs.add(r.request_id)
      if (r.plate_no) e.plates.add(r.plate_no)
      e.tasks += 1
      if (r.task_cost > 0) e.tasksPaid += 1
      m.set(k, e)
    })
    return Array.from(m.entries())
      .map(([key, e]) => ({ key, cost: e.cost, mrs: e.mrs.size, plates: e.plates.size, tasks: e.tasks, tasksPaid: e.tasksPaid }))
      .sort((a, b) => b.cost - a.cost)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ownerBreakdown     = useMemo(() => buildBreakdown((r) => r.owner_type), [fRows])
  // keyed "group|name" so a mechanic's in-house vs outside work stays separate
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mechanicBreakdown  = useMemo(() => buildBreakdown((r) => `${mechanicGroupOf(r)}|${r.mechanic || "ไม่ระบุ"}`), [fRows])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mechGroupBreakdown = useMemo(() => buildBreakdown((r) => mechanicGroupOf(r)), [fRows])

  // ── Parts summary per PM class ──────────────────────────────────────────────
  type PartSummary = {
    part: string; parts_group: string
    qty: number; cost: number; uses: number; plates: Set<string>
  }

  const partsByPm = useMemo(() => {
    const m = new Map<string, Map<string, PartSummary>>()
    fRows.forEach((r) => {
      if (!m.has(r.pm_class)) m.set(r.pm_class, new Map())
      const pMap = m.get(r.pm_class)!
      r.parts?.forEach((p) => {
        const key = p.part || "ไม่ระบุ"
        if (!pMap.has(key)) pMap.set(key, { part: key, parts_group: p.parts_group || "", qty: 0, cost: 0, uses: 0, plates: new Set() })
        const e = pMap.get(key)!
        e.qty  += p.qty
        e.cost += p.total
        e.uses += 1
        if (r.plate_no) e.plates.add(r.plate_no)
      })
    })
    return PM_ORDER
      .filter((pm) => m.has(pm))
      .map((pm) => {
        const items = Array.from(m.get(pm)!.values()).sort((a, b) => b.cost - a.cost)
        return {
          pm,
          items,
          total: items.reduce((s, i) => s + i.cost, 0),
          distinct: items.length,
        }
      })
  }, [fRows])

  // ── Chart data ──────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const cost   = new Map<string, Record<string, number>>()
    const plates = new Map<string, Record<string, Set<string>>>()
    fRows.forEach((r) => {
      const cRec = cost.get(r.month_year) || {}
      cRec[r.pm_class] = (cRec[r.pm_class] || 0) + r.task_cost
      cost.set(r.month_year, cRec)
      if (r.plate_no) {
        const pRec = plates.get(r.month_year) || {}
        pRec[r.pm_class] = pRec[r.pm_class] || new Set()
        pRec[r.pm_class].add(r.plate_no)
        plates.set(r.month_year, pRec)
      }
    })
    return months.map((my) => {
      const cRec = cost.get(my) || {}
      const pRec = plates.get(my) || {}
      const row: Record<string, number | string> = { month: MONTH_NUM_TO_LABEL[my.split("-")[1]] ?? my }
      PM_ORDER.forEach((pm) => {
        row[pm] = cRec[pm] || 0
        row[`${pm}_plates`] = pRec[pm]?.size || 0
      })
      return row
    })
  }, [fRows, months])

  // ── MR grouping (full detail table) ─────────────────────────────────────────
  type MrRow = {
    request_id:   number
    request_code: string
    plate_no:     string
    vehicle_no:   string
    branch:       string
    step:         string
    mechanic:     string
    owner_type:   string
    reported_at:  string
    garage_finish_at: string
    mileage:      string
    tasks:        TaskRow[]
    total:        number
    classes:      string[]
    sortKey:      string
  }

  const mrRows = useMemo<MrRow[]>(() => {
    const m = new Map<number, MrRow>()
    fRows.forEach((r) => {
      if (!m.has(r.request_id)) {
        m.set(r.request_id, {
          request_id: r.request_id, request_code: r.request_code,
          plate_no: r.plate_no, vehicle_no: r.vehicle_no, branch: r.branch,
          step: r.step, mechanic: r.mechanic, owner_type: r.owner_type, reported_at: r.reported_at,
          garage_finish_at: r.garage_finish_at || "",
          mileage: r.mileage_at_report, tasks: [], total: 0, classes: [], sortKey: sortKeyOf(r.main_date || r.reported_at),
        })
      }
      const mr = m.get(r.request_id)!
      mr.tasks.push(r)
      mr.total += r.task_cost
    })
    m.forEach((mr) => {
      mr.classes = PM_ORDER.filter((pm) => mr.tasks.some((t) => t.pm_class === pm))
    })
    return Array.from(m.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [fRows])

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

  const pmBadge = (pm: string) => (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
      style={{ background: PM_COLOR[pm] || "#9CA3AF" }}
    >
      {pm}
    </span>
  )

  const fmtLabel = (v: any) => {
    const n = Number(v)
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
    return n > 0 ? String(Math.round(n)) : ""
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">PM Cost — MR Based</h1>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 tracking-wide">
              MR → Task → WD
            </span>
          </div>
          <p className="text-xs text-gray-400">
            งาน PM จากใบแจ้งซ่อม (repair_type PMช่างมีนา / PMศูนย์บริการ) — ระยะ PM อ่านจากรายละเอียดงาน
            · อิงวันที่ซ่อมเสร็จ (ถ้ายังไม่เสร็จใช้วันที่แจ้ง)
          </p>
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
        <div className="min-w-[220px]">
          <p className="mb-1 text-[10px] font-medium text-gray-400">ค้นหา</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="MR / ทะเบียน / WD / อะไหล่ / ช่าง…"
            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        {branches.length > 1 && (
          <div>
            <p className="mb-1 text-[10px] font-medium text-gray-400">สาขา</p>
            <div className="flex flex-wrap gap-1.5">
              {branches.map((b) => (
                <button key={b}
                  onClick={() => toggleSetItem(selectedBranches, setSelectedBranches, b)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                    selectedBranches.has(b) ? "border-gray-800 bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
                  }`}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1 text-[10px] font-medium text-gray-400">PM Class</p>
          <div className="flex flex-wrap gap-1.5">
            {PM_ORDER.map((pm) => (
              <button key={pm}
                onClick={() => toggleSetItem(selectedClasses, setSelectedClasses, pm)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                  selectedClasses.has(pm) ? "text-white" : "text-gray-500 hover:bg-gray-50"
                }`}
                style={selectedClasses.has(pm) ? { background: PM_COLOR[pm], borderColor: PM_COLOR[pm] } : {}}>
                {pm}
              </button>
            ))}
          </div>
        </div>
        {ownerTypes.length > 1 && (
          <div>
            <p className="mb-1 text-[10px] font-medium text-gray-400">ประเภทรถร่วม</p>
            <div className="flex flex-wrap gap-1.5">
              {ownerTypes.map((t) => (
                <button key={t}
                  onClick={() => toggleSetItem(selectedOwnerTypes, setSelectedOwnerTypes, t)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                    selectedOwnerTypes.has(t) ? "border-gray-800 bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1 text-[10px] font-medium text-gray-400">ซ่อมเสร็จ</p>
          <div className="flex gap-1.5">
            {(["ซ่อมเสร็จแล้ว", "ยังไม่เสร็จ"] as const).map((s) => (
              <button key={s}
                onClick={() => toggleSetItem(selectedFinish, setSelectedFinish, s)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                  selectedFinish.has(s)
                    ? s === "ซ่อมเสร็จแล้ว" ? "border-emerald-600 bg-emerald-600 text-white" : "border-amber-500 bg-amber-500 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-gray-400">กลุ่มช่าง</p>
          <div className="flex gap-1.5">
            {(["ช่างมีนา", "อู่นอก"] as const).map((g) => (
              <button key={g}
                onClick={() => toggleSetItem(selectedMechGroups, setSelectedMechGroups, g)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                  selectedMechGroups.has(g)
                    ? g === "ช่างมีนา" ? "border-emerald-600 bg-emerald-600 text-white" : "border-orange-500 bg-orange-500 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-gray-400">ช่าง (mechanic)</p>
          <select
            value={selectedMechanic}
            onChange={(e) => setSelectedMechanic(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="">ทุกช่าง ({mechanics.length})</option>
            {mechanics.map(([name, n]) => (
              <option key={name} value={name}>{name} ({n})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* KPI row */}
      {hasSearched && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">PM Cost รวม</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatShort(totalCost)}</p>
            <p className="mt-0.5 text-xs text-gray-400">{formatNumber(totalCost)}</p>
          </div>
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">ใบแจ้งซ่อม (MR)</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{mrCount.toLocaleString()}<span className="text-sm font-medium text-gray-400"> ใบ</span></p>
            <p className="mt-0.5 text-xs text-gray-400">{fRows.length.toLocaleString()} งาน PM</p>
          </div>
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">Unique Plates</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{plateCount.toLocaleString()}<span className="text-sm font-medium text-gray-400"> คัน</span></p>
          </div>
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">PM ไม่ระบุระยะ</p>
            <p className={`mt-1 text-2xl font-bold ${unstagedCost > 0 ? "text-amber-500" : "text-emerald-600"}`}>
              {unstagedCost > 0 ? formatShort(unstagedCost) : "✓ 0"}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">อ่านระยะจาก description ไม่ได้</p>
          </div>
        </div>
      )}

      {/* PM class tiles */}
      {hasSearched && classTiles.length > 0 && (
        <div className="rounded-2xl border bg-white px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-gray-700">PM Class Summary</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {classTiles.map((t) => {
              const maxCost = Math.max(...classTiles.map((x) => x.cost))
              const w = maxCost > 0 ? (t.cost / maxCost) * 100 : 0
              const avgTask  = t.tasksPaid > 0 ? t.cost / t.tasksPaid : 0
              const avgPlate = t.plates > 0 ? t.cost / t.plates : 0
              const avgMena  = t.mena.tasksPaid > 0 ? t.mena.cost / t.mena.tasksPaid : 0
              const avgNok   = t.nok.tasksPaid  > 0 ? t.nok.cost  / t.nok.tasksPaid  : 0
              const menaPct  = t.cost > 0 ? (t.mena.cost / t.cost) * 100 : 0
              return (
                <div key={t.pm} className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: PM_COLOR[t.pm] }} />
                    <p className="truncate text-[10px] font-semibold text-gray-500">{t.pm}</p>
                  </div>
                  <p className="mt-1 text-sm font-bold text-gray-900">{formatShort(t.cost)}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">{t.tasks} งาน · {t.plates} คัน</p>
                  <p className="mt-1 text-[11px] font-semibold" style={{ color: PM_LABEL_COLOR[t.pm] }}>
                    เฉลี่ย ฿{avgTask.toLocaleString(undefined, { maximumFractionDigits: 0 })} /งาน
                  </p>
                  <p className="text-[10px] text-gray-400">
                    ฿{avgPlate.toLocaleString(undefined, { maximumFractionDigits: 0 })} /คัน
                  </p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(w, 100)}%`, background: PM_COLOR[t.pm] }} />
                  </div>

                  {/* ช่างมีนา vs อู่นอก */}
                  <div className="mt-2 border-t border-gray-200 pt-1.5 space-y-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="flex items-center gap-1 text-[9px] font-semibold text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />มีนา
                      </span>
                      <span className="tabular-nums text-[10px] font-semibold text-gray-700">{formatShort(t.mena.cost)}</span>
                      <span className="tabular-nums text-[9px] text-gray-400">
                        {t.mena.tasks} งาน{t.mena.tasks > 0 ? ` · ฿${avgMena.toLocaleString(undefined, { maximumFractionDigits: 0 })}/งาน` : ""}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="flex items-center gap-1 text-[9px] font-semibold text-orange-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />นอก
                      </span>
                      <span className="tabular-nums text-[10px] font-semibold text-gray-700">{formatShort(t.nok.cost)}</span>
                      <span className="tabular-nums text-[9px] text-gray-400">
                        {t.nok.tasks} งาน{t.nok.tasks > 0 ? ` · ฿${avgNok.toLocaleString(undefined, { maximumFractionDigits: 0 })}/งาน` : ""}
                      </span>
                    </div>
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full bg-emerald-500" style={{ width: `${menaPct}%` }} />
                      <div className="h-full bg-orange-500" style={{ width: `${100 - menaPct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cost saving from in-house PM */}
      {hasSearched && costSaving.rows.length > 0 && (
        <div className="rounded-2xl border bg-white px-5 py-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-gray-700">
              Cost Saving — PM โดยช่างมีนา
              <span className="ml-2 font-normal text-gray-400">(เฉลี่ยอู่นอก − เฉลี่ยมีนา) × จำนวนงานมีนา</span>
            </p>
            <p className={`text-sm font-bold ${costSaving.total >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              รวมประหยัด ฿{costSaving.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] text-gray-400">
                  <th className="py-1.5 pr-2 font-medium">PM</th>
                  <th className="py-1.5 pr-2 text-right font-medium">เฉลี่ยอู่นอก /งาน</th>
                  <th className="py-1.5 pr-2 text-right font-medium">เฉลี่ยมีนา /งาน</th>
                  <th className="py-1.5 pr-2 text-right font-medium">ส่วนต่าง /งาน</th>
                  <th className="py-1.5 pr-2 text-right font-medium">งานมีนา</th>
                  <th className="py-1.5 pr-2 text-right font-medium">รถ (คัน)</th>
                  <th className="py-1.5 text-right font-medium">ประหยัดรวม</th>
                </tr>
              </thead>
              <tbody>
                {costSaving.rows.map((r) => {
                  const fmt0 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })
                  return (
                    <tr key={r.pm} className="border-b last:border-b-0">
                      <td className="py-2 pr-2">{pmBadge(r.pm)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-orange-600">
                        {r.avgNok !== null ? (
                          <span>
                            ฿{fmt0(r.avgNok)}
                            {r.isRef && (
                              <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[9px] font-semibold text-amber-600" title="ไม่มีข้อมูลอู่นอกในช่วงนี้ — ใช้ราคาอ้างอิงอู่นอก เฉพาะงานลาดกระบัง">
                                อ้างอิง·ลาดกระบัง
                              </span>
                            )}
                          </span>
                        ) : <span className="text-gray-300">ไม่มีข้อมูลอู่นอก</span>}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-emerald-600">฿{fmt0(r.avgMena)}</td>
                      <td className={`py-2 pr-2 text-right tabular-nums font-semibold ${
                        r.diff === null ? "text-gray-300" : r.diff >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}>
                        {r.diff !== null ? `${r.diff >= 0 ? "+" : "−"}฿${fmt0(Math.abs(r.diff))}` : "—"}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{r.menaTasks.toLocaleString()}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-gray-600">{r.menaPlates.toLocaleString()}</td>
                      <td className={`py-2 text-right tabular-nums font-bold ${
                        r.saving === null ? "text-gray-300" : r.saving >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}>
                        {r.saving !== null ? `${r.saving >= 0 ? "" : "−"}฿${fmt0(Math.abs(r.saving))}` : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            * ส่วนต่างเป็นค่าประมาณ — เทียบราคาเฉลี่ยต่องานของอู่นอกกับช่างมีนาใน PM ระยะเดียวกัน ตามช่วงเวลา/ตัวกรองที่เลือก
            · ถ้าไม่มีงานอู่นอกในช่วงที่เลือก จะใช้ราคาอ้างอิงอู่นอก (PM1 ฿5,300 · PM2 ฿11,600)
            คำนวณเฉพาะงานช่างมีนาสาขาลาดกระบัง
          </p>
        </div>
      )}

      {/* Breakdown: ประเภทรถร่วม + ช่าง */}
      {hasSearched && fRows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* By owner type */}
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="mb-3 text-xs font-semibold text-gray-700">แบ่งตามประเภทรถร่วม</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] text-gray-400">
                  <th className="py-1.5 pr-2 font-medium">ประเภท</th>
                  <th className="py-1.5 pr-2 text-right font-medium">MR</th>
                  <th className="py-1.5 pr-2 text-right font-medium">คัน</th>
                  <th className="py-1.5 pr-2 text-right font-medium">ค่าใช้จ่าย</th>
                  <th className="w-1/4 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {ownerBreakdown.map((b) => {
                  const w = ownerBreakdown[0].cost > 0 ? (b.cost / ownerBreakdown[0].cost) * 100 : 0
                  return (
                    <tr key={b.key} className="border-b last:border-b-0">
                      <td className="py-2 pr-2 text-xs text-gray-700">{b.key}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-xs text-gray-500">{b.mrs.toLocaleString()}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-xs text-gray-500">{b.plates.toLocaleString()}</td>
                      <td className="py-2 pr-2 text-right tabular-nums font-semibold text-gray-800">฿{formatShort(b.cost)}</td>
                      <td className="py-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(w, 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* By mechanic: ช่างมีนา vs อู่นอก + top 10 */}
          <div className="rounded-2xl border bg-white px-5 py-4">
            <p className="mb-3 text-xs font-semibold text-gray-700">แบ่งตามช่าง — ช่างมีนา vs อู่นอก</p>

            {/* Group tiles */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              {mechGroupBreakdown.map((g) => {
                const isMena = g.key === "ช่างมีนา"
                const active = selectedMechGroups.has(g.key)
                return (
                  <button
                    key={g.key}
                    onClick={() => toggleSetItem(selectedMechGroups, setSelectedMechGroups, g.key)}
                    title="คลิกเพื่อกรองตามกลุ่มช่าง"
                    className={`rounded-xl px-3 py-2.5 text-left transition ${
                      active ? (isMena ? "bg-emerald-50 ring-1 ring-emerald-400" : "bg-orange-50 ring-1 ring-orange-400") : "bg-gray-50 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${isMena ? "bg-emerald-500" : "bg-orange-500"}`} />
                      <p className="text-[11px] font-semibold text-gray-600">{g.key}</p>
                    </div>
                    <p className="mt-1 text-sm font-bold text-gray-900">฿{formatShort(g.cost)}</p>
                    <p className="mt-0.5 text-[10px] text-gray-400">{g.tasks} งาน · {g.mrs} MR · {g.plates} คัน</p>
                    <p className={`text-[10px] font-semibold ${isMena ? "text-emerald-600" : "text-orange-600"}`}>
                      เฉลี่ย ฿{(g.tasksPaid > 0 ? g.cost / g.tasksPaid : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} /งาน
                    </p>
                  </button>
                )
              })}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[10px] text-gray-400">
                  <th className="py-1.5 pr-2 font-medium">ช่าง (Top 10)</th>
                  <th className="py-1.5 pr-2 text-right font-medium">งาน</th>
                  <th className="py-1.5 pr-2 text-right font-medium">MR</th>
                  <th className="py-1.5 pr-2 text-right font-medium">ค่าใช้จ่าย</th>
                  <th className="w-1/4 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {mechanicBreakdown.slice(0, 10).map((b) => {
                  const [grp, name] = b.key.split("|")
                  const isMena = grp === "ช่างมีนา"
                  const w = mechanicBreakdown[0].cost > 0 ? (b.cost / mechanicBreakdown[0].cost) * 100 : 0
                  return (
                    <tr
                      key={b.key}
                      onClick={() => setSelectedMechanic(selectedMechanic === name ? "" : name)}
                      className={`cursor-pointer border-b last:border-b-0 transition ${selectedMechanic === name ? "bg-blue-50/60" : "hover:bg-gray-50"}`}
                      title="คลิกเพื่อกรองตามช่างคนนี้"
                    >
                      <td className="py-2 pr-2 text-xs text-gray-700">
                        <span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white ${isMena ? "bg-emerald-500" : "bg-orange-500"}`}>
                          {isMena ? "มีนา" : "นอก"}
                        </span>
                        {name}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums text-xs text-gray-500">{b.tasks.toLocaleString()}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-xs text-gray-500">{b.mrs.toLocaleString()}</td>
                      <td className="py-2 pr-2 text-right tabular-nums font-semibold text-gray-800">฿{formatShort(b.cost)}</td>
                      <td className="py-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full rounded-full ${isMena ? "bg-emerald-500" : "bg-orange-500"}`} style={{ width: `${Math.min(w, 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly charts: cost + vehicle count */}
      {hasSearched && chartData.length > 0 && (() => {
        const activePms = PM_ORDER.filter((pm) => chartData.some((d) => (d[pm] as number) > 0))
        return (
          <>
            {/* Chart 1: cost */}
            <div className="rounded-2xl border bg-white p-5">
              <p className="mb-4 text-xs font-semibold text-gray-700">ค่าใช้จ่าย PM รายเดือน แยกตามระยะ (บาท)</p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData} barCategoryGap="30%" barGap={4}
                  margin={{ top: 20, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={fmtLabel}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => [Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }) + " ฿", name]}
                    labelStyle={{ fontWeight: 600, fontSize: 12 }}
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #e5e7eb" }}
                  />
                  <Legend formatter={(value) => <span style={{ fontSize: 11, color: "#6b7280" }}>{value}</span>} />
                  {activePms.map((pm) => (
                    <Bar key={pm} dataKey={pm} name={pm} fill={PM_COLOR[pm]} radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey={pm}
                        position="top"
                        style={{ fontSize: 10, fill: PM_LABEL_COLOR[pm], fontWeight: 600 }}
                        formatter={fmtLabel}
                      />
                    </Bar>
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: vehicle count */}
            <div className="rounded-2xl border bg-white p-5">
              <p className="mb-4 text-xs font-semibold text-gray-700">จำนวนรถเข้า PM รายเดือน แยกตามระยะ (คัน)</p>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} barCategoryGap="30%" barGap={4}
                  margin={{ top: 20, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) => [`${value} คัน`, name]}
                    labelStyle={{ fontWeight: 600, fontSize: 12 }}
                    contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid #e5e7eb" }}
                  />
                  <Legend formatter={(value) => <span style={{ fontSize: 11, color: "#6b7280" }}>{String(value).replace(" (คัน)", "")}</span>} />
                  {activePms.map((pm) => (
                    <Bar key={`${pm}_plates`} dataKey={`${pm}_plates`} name={`${pm} (คัน)`} fill={PM_COLOR[pm]} radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey={`${pm}_plates`}
                        position="top"
                        style={{ fontSize: 10, fill: PM_LABEL_COLOR[pm], fontWeight: 600 }}
                        formatter={(v: any) => (Number(v) > 0 ? String(v) : "")}
                      />
                    </Bar>
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )
      })()}

      {/* Parts summary per PM class */}
      {hasSearched && partsByPm.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <p className="mb-3 text-xs font-semibold text-gray-700">
            สรุปอะไหล่ที่ใช้ในแต่ละ PM
            <span className="ml-2 font-normal text-gray-400">คลิกเพื่อขยาย — เรียงตามมูลค่า</span>
          </p>
          <div className="space-y-2">
            {partsByPm.map((grp) => {
              const gKey = `parts-${grp.pm}`
              const open = expanded.has(gKey)
              const showAllKey = `parts-all-${grp.pm}`
              const showAll = expanded.has(showAllKey)
              const items = showAll ? grp.items : grp.items.slice(0, 15)
              return (
                <div key={gKey} className="overflow-hidden rounded-xl border">
                  <button
                    onClick={() => toggle(gKey)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${open ? "bg-gray-50" : "hover:bg-gray-50/60"}`}
                  >
                    <span className="text-gray-400">{open ? "▾" : "▸"}</span>
                    {pmBadge(grp.pm)}
                    <span className="text-xs text-gray-400">{grp.distinct.toLocaleString()} รายการอะไหล่</span>
                    <span className="ml-auto tabular-nums text-sm font-bold text-gray-900">฿{formatNumber(grp.total)}</span>
                  </button>
                  {open && (
                    <div className="border-t px-4 py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-[10px] text-gray-400">
                            <th className="py-1.5 pr-2 font-medium">อะไหล่</th>
                            <th className="py-1.5 pr-2 font-medium">กลุ่มสินค้า</th>
                            <th className="py-1.5 pr-2 text-right font-medium">จำนวนรวม</th>
                            <th className="py-1.5 pr-2 text-right font-medium">ครั้งที่เบิก</th>
                            <th className="py-1.5 pr-2 text-right font-medium">คัน</th>
                            <th className="py-1.5 pr-2 text-right font-medium">เฉลี่ย/หน่วย</th>
                            <th className="py-1.5 pr-2 text-right font-medium">มูลค่ารวม</th>
                            <th className="w-1/6 py-1.5 font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => {
                            const w = grp.items[0].cost > 0 ? (it.cost / grp.items[0].cost) * 100 : 0
                            const avgUnit = it.qty > 0 ? it.cost / it.qty : 0
                            return (
                              <tr key={it.part} className="border-b last:border-b-0 hover:bg-gray-50/60">
                                <td className="max-w-[320px] truncate py-1.5 pr-2 text-gray-700" title={it.part}>{it.part}</td>
                                <td className="whitespace-nowrap py-1.5 pr-2 text-gray-400">{it.parts_group}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">{it.qty.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">{it.uses.toLocaleString()}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">{it.plates.size.toLocaleString()}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">{avgUnit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-gray-800">{formatNumber(it.cost)}</td>
                                <td className="py-1.5">
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(w, 100)}%`, background: PM_COLOR[grp.pm] }} />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {grp.items.length > 15 && (
                        <button
                          onClick={() => toggle(showAllKey)}
                          className="mt-2 w-full rounded-lg border py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
                        >
                          {showAll ? "แสดงเฉพาะ Top 15" : `แสดงทั้งหมด (${grp.items.length.toLocaleString()} รายการ)`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* MR full-detail table */}
      {hasSearched && (
        <div className="rounded-2xl border bg-white p-5">
          <p className="mb-3 text-xs font-semibold text-gray-700">
            รายละเอียดใบแจ้งซ่อม (MR) — {mrRows.length.toLocaleString()} ใบ
            <span className="ml-2 font-normal text-gray-400">คลิกแถวเพื่อดูงานและรายการเบิก (WD)</span>
          </p>
          {mrRows.length === 0 && !loading && (
            <div className="px-5 py-10 text-center text-sm text-gray-400">ไม่พบข้อมูลในช่วงเวลาที่เลือก</div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] text-gray-400">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2 font-medium">เลขที่ MR</th>
                  <th className="px-2 py-2 font-medium">ทะเบียน</th>
                  <th className="px-2 py-2 font-medium">สาขา</th>
                  <th className="px-2 py-2 font-medium">วันที่แจ้ง</th>
                  <th className="px-2 py-2 font-medium">ซ่อมเสร็จ</th>
                  <th className="px-2 py-2 font-medium">สถานะ</th>
                  <th className="px-2 py-2 font-medium">ประเภทรถ</th>
                  <th className="px-2 py-2 font-medium">ช่าง</th>
                  <th className="px-2 py-2 font-medium">ระยะ PM</th>
                  <th className="px-2 py-2 text-right font-medium">ค่าใช้จ่าย</th>
                </tr>
              </thead>
              <tbody>
                {mrRows.slice(0, visibleCount).map((mr) => {
                  const mrKey = `mr-${mr.request_id}`
                  const open = expanded.has(mrKey)
                  return (
                    <React.Fragment key={mrKey}>
                      {/* MR row */}
                      <tr
                        onClick={() => toggle(mrKey)}
                        className={`cursor-pointer border-b transition ${open ? "bg-gray-50" : "hover:bg-gray-50/60"}`}
                      >
                        <td className="px-2 py-2.5 text-gray-400">{open ? "▾" : "▸"}</td>
                        <td className="px-2 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-gray-800">{mr.request_code}</span>
                            <button
                              onClick={(e) => copyMr(e, mr.request_code)}
                              title="คัดลอกเลข MR"
                              className={`rounded-md p-1 transition ${
                                copiedMr === mr.request_code
                                  ? "bg-emerald-50 text-emerald-600"
                                  : "text-gray-300 hover:bg-gray-100 hover:text-gray-600"
                              }`}
                            >
                              {copiedMr === mr.request_code ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                          </span>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="font-medium text-gray-800">{mr.plate_no}</span>
                          {mr.vehicle_no && <span className="ml-1.5 text-[11px] text-gray-400">{mr.vehicle_no}</span>}
                        </td>
                        <td className="px-2 py-2.5 text-xs text-gray-500">{mr.branch}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-xs text-gray-500">{mr.reported_at?.slice(0, 10)}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-xs">
                          {mr.garage_finish_at
                            ? <span className="font-medium text-gray-700">{mr.garage_finish_at.slice(0, 10)}</span>
                            : <span className="text-amber-500">ยังไม่เสร็จ</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            mr.step === "ปิด" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                          }`}>{mr.step}</span>
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-gray-500">{mr.owner_type || "—"}</td>
                        <td className="px-2 py-2.5 text-[11px] text-gray-600">{mr.mechanic || "—"}</td>
                        <td className="px-2 py-2.5">
                          <span className="flex flex-wrap gap-1">
                            {mr.classes.map((pm) => <React.Fragment key={pm}>{pmBadge(pm)}</React.Fragment>)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-bold text-gray-900">฿{formatNumber(mr.total)}</td>
                      </tr>

                      {/* Expanded: tasks + WD lines */}
                      {open && (
                        <tr className="border-b">
                          <td colSpan={11} className="bg-gray-50/50 px-4 py-3">
                            <div className="space-y-2">
                              {mr.tasks.map((t) => {
                                const tKey = `task-${t.request_id}-${t.task_id}`
                                const tOpen = expanded.has(tKey)
                                return (
                                  <div key={tKey} className="overflow-hidden rounded-xl border bg-white">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); toggle(tKey) }}
                                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
                                    >
                                      <span className="mt-0.5 text-gray-300">{tOpen ? "▾" : "▸"}</span>
                                      <span className="mt-0.5">{pmBadge(t.pm_class)}</span>
                                      <span className="mt-0.5 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{t.repair_type}</span>
                                      <span className="min-w-0 flex-1 text-xs leading-relaxed text-gray-600" title={t.description}>
                                        {t.description?.length > 220 ? t.description.slice(0, 220) + "…" : t.description}
                                      </span>
                                      <span className="whitespace-nowrap tabular-nums text-sm font-semibold text-gray-800">฿{formatNumber(t.task_cost)}</span>
                                    </button>

                                    {tOpen && (
                                      <div className="border-t px-4 py-2">
                                        {t.parts.length === 0 ? (
                                          <p className="py-2 text-xs text-gray-400">ไม่มีรายการเบิกอะไหล่ (WD) สำหรับงานนี้</p>
                                        ) : (
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="border-b text-left text-[10px] text-gray-400">
                                                <th className="py-1.5 pr-2 font-medium">เลขที่ใบเบิก (WD)</th>
                                                <th className="py-1.5 pr-2 font-medium">กลุ่มสินค้า</th>
                                                <th className="py-1.5 pr-2 font-medium">อะไหล่</th>
                                                <th className="py-1.5 pr-2 text-right font-medium">จำนวน</th>
                                                <th className="py-1.5 pr-2 text-right font-medium">ราคา/หน่วย</th>
                                                <th className="py-1.5 text-right font-medium">รวม</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {t.parts.map((p, i) => (
                                                <tr key={i} className="border-b last:border-b-0">
                                                  <td className="py-1.5 pr-2 font-mono text-[11px] text-blue-600">{p.requisition_no}</td>
                                                  <td className="py-1.5 pr-2 text-gray-500">{p.parts_group}</td>
                                                  <td className="py-1.5 pr-2 text-gray-700">{p.part}</td>
                                                  <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">{p.qty.toLocaleString()}</td>
                                                  <td className="py-1.5 pr-2 text-right tabular-nums text-gray-600">{formatNumber(p.unit_price)}</td>
                                                  <td className="py-1.5 text-right tabular-nums font-medium text-gray-800">{formatNumber(p.total)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {mrRows.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="mt-3 w-full rounded-xl border py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              แสดงเพิ่ม ({(mrRows.length - visibleCount).toLocaleString()} ใบที่เหลือ)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
