"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, History, X } from "lucide-react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import { ChipRowSkeleton, GpsSpinner, ResultsSkeleton } from "@/components/gps/gps-loader"
import { EtlLogDialog } from "@/components/gps/etl-log-dialog"
import { SOURCE_COLOR } from "@/lib/gps-labels"
import {
  DateRangePicker,
  addDays,
  dateLabel,
  daysInRange,
  rangeLabel,
  type DateRange,
} from "@/components/date-range-picker"

// ── Types ─────────────────────────────────────────────────────────────────────

type Row = {
  vehicleNo:   string
  fleet:       string
  branch:      string
  brand:       string
  plant:       string
  distanceKm:  number
  activeDays:  number
  dataDays:    number
  maxDayKm:    number
  avgDayKm:    number
  usedSources: string[]
  allSources:  string[]
  overlapDays: number
}

type SortKey = "vehicleNo" | "fleet" | "branch" | "distanceKm" | "activeDays" | "avgDayKm" | "maxDayKm"

type Coverage = { vendors: number; totalVendors: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number, digits = 0) {
  return Number(v || 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtShort(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return fmt(v)
}

const FLEET_PREVIEW = 8

/** Every day of the range, so the export has a column even for silent days. */
function datesInRange(r: DateRange) {
  const out: string[] = []
  // The API refuses ranges longer than 400 days; the bound keeps a bad `end`
  // from spinning here.
  for (let d = r.start; d && d <= r.end && out.length < 400; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * The day columns of the export: the 1st of the start month through the last of
 * the end month, so a week-long search still lands on a full calendar month and
 * the columns are always วันที่ 1…สิ้นเดือน. Days outside the searched range
 * stay blank — nothing was asked of them.
 */
function monthGridDates(r: DateRange) {
  const [y, m] = r.end.slice(0, 7).split("-").map(Number)
  // Day 0 of the next month is the last day of this one, leap years included.
  const endOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return datesInRange({ start: `${r.start.slice(0, 7)}-01`, end: endOfMonth })
}

/** Thai abbreviated months, the same ones Excel's mmm prints in a Thai locale. */
const MONTH_ABBR = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]

/**
 * Day-column labels as dd-mmm ("07-ก.ย."). Written as text rather than as dates
 * formatted with dd-mmm, so the Thai month shows up whatever locale the
 * spreadsheet is opened in.
 */
function dayHeaders(dates: string[]) {
  return dates.map((d) => `${d.slice(8, 10)}-${MONTH_ABBR[Number(d.slice(5, 7)) - 1]}`)
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function Kpi({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-white">
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-gray-400">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

// ── Logic explainer dialog ────────────────────────────────────────────────────

function H({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
      {children}
    </p>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] text-gray-700 dark:bg-white/10 dark:text-gray-200">
      {children}
    </code>
  )
}

function LogicDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="m-auto w-[min(720px,92vw)] rounded-2xl border border-gray-200 bg-white p-0 text-gray-700 backdrop:bg-black/50 dark:border-white/10 dark:bg-[#1a1d27] dark:text-gray-300"
    >
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/8">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">ระบบคิดตัวเลขนี้มาอย่างไร</p>
          <p className="mt-0.5 text-xs text-gray-400">ที่มาของข้อมูลและวิธีคำนวณแต่ละคอลัมน์</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/8 dark:hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="themed-scroll max-h-[70vh] overflow-y-auto px-5 pb-5 text-xs leading-relaxed">
        <H>ข้อมูลมาจากไหน</H>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            ฐานข้อมูล <Code>gps</Code> ทุก collection ที่ขึ้นต้นด้วย <Code>distance_</Code> —
            ระบบไล่หาเองตอนเรียก ไม่ได้ระบุรายชื่อไว้ตายตัว ถ้ามีผู้ให้บริการใหม่เข้ามาจะถูกนับอัตโนมัติ
          </li>
          <li>
            กรองวันด้วยฟิลด์ <Code>date_key</Code> ตามช่วงวันที่ที่เลือก (รวมวันเริ่มต้นและวันสิ้นสุด)
          </li>
          <li>
            ระยะทางอ่านจาก <Code>distance_km</Code> ยกเว้น songdee ที่ใช้ชื่อฟิลด์{" "}
            <Code>total_distance_km</Code> ระบบแปลงให้เป็นชื่อเดียวกันก่อนรวม
          </li>
        </ul>

        <H>หัวใจของการคำนวณ: รถคันเดียวมีได้หลาย GPS</H>
        <p className="mb-2">
          รถหลายคันติดกล่อง GPS มากกว่าหนึ่งเจ้า และตัวเลขมักไม่ตรงกันอย่างมาก
          (เคยพบคันหนึ่งเดือนเดียวกัน terminus รายงาน 163 กม. แต่ besttech รายงาน 4,413 กม.)
          ระบบจึงคิดแบบนี้:
        </p>
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>รวมข้อมูลทุกผู้ให้บริการเข้าด้วยกันก่อน</li>
          <li>
            จับกลุ่มเป็นราย <strong>(ทะเบียน, วันที่)</strong> แล้ว
            <strong className="text-gray-900 dark:text-white"> เลือกค่าสูงสุดของวันนั้น</strong>{" "}
            ไม่บวกรวมกัน
          </li>
          <li>นำค่าที่ชนะของแต่ละวันมาบวกกันเป็นยอดของช่วงที่เลือก</li>
        </ol>
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400">
          ทำไมต้องสูงสุด: ถ้าบวกรวมทุกเจ้า ยอดจะเบิ้ล (เดือน ส.ค. 2026 จะเกินจริงราว 237,000 กม.
          หรือ 12%) ส่วนถ้าเลือกค่าต่ำสุด รถที่กล่องหนึ่งเสียหรือไม่ส่งข้อมูลจะถูกนับระยะทางต่ำกว่าจริง
        </p>

        <H>Fleet และ สาขา</H>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            บาง vendor เว้นช่อง fleet/สาขา ว่างไว้ ระบบจึงเลือกค่าที่ &ldquo;ไม่ว่าง&rdquo;
            จากผู้ให้บริการเจ้าใดก็ได้ที่กรอกมา — เจ้าที่เว้นว่างจะไม่ไปลบค่าที่อีกเจ้ากรอกไว้
          </li>
          <li>
            การกรองเกิดขึ้น <strong>หลัง</strong> รวมค่าจากทุกเจ้าแล้ว
            ถ้ากรองตั้งแต่ต้นจะทำให้ข้อมูลของ vendor ที่เว้นช่องว่างหลุดหายไป
          </li>
          <li>รถที่ไม่มีเจ้าใดกรอกเลย จะถูกจัดเป็น &ldquo;ไม่ระบุ&rdquo; ไม่ถูกตัดทิ้ง</li>
        </ul>

        <H>ตัวกรอง &ldquo;แหล่งที่มา&rdquo; ต่างจากอีกสองตัว</H>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <strong>Fleet</strong> และ <strong>สาขา</strong> เป็นการ &ldquo;คัดแถว&rdquo; —
            คำนวณระยะทางจากทุกแหล่งตามปกติ แล้วค่อยเลือกเฉพาะรถที่ตรงเงื่อนไขมาแสดง
          </li>
          <li>
            <strong>แหล่งที่มา</strong> เปลี่ยน &ldquo;ขอบเขตการคำนวณ&rdquo; —
            เมื่อเลือกแล้วระบบจะคิดจากเฉพาะแหล่งที่เลือกเท่านั้น
            ถ้าเลือกเจ้าเดียวจะได้ตัวเลขดิบของเจ้านั้นตรง ๆ (ไม่มีการเทียบค่าสูงสุดกับเจ้าอื่น)
            เหมาะกับการตรวจสอบว่ากล่องของเจ้าไหนรายงานผิดปกติ
          </li>
          <li>เลือกได้หลายเจ้าพร้อมกัน ระบบจะเทียบค่าสูงสุดรายวันเฉพาะในกลุ่มที่เลือก</li>
          <li>รายชื่อแหล่งจะแสดงเฉพาะเจ้าที่มีข้อมูลจริงในช่วงวันที่ที่เลือก</li>
        </ul>

        <H>แต่ละคอลัมน์คิดยังไง</H>
        <ul className="list-disc space-y-1 pl-4">
          <li><strong>ระยะทางรวม</strong> — ผลรวมของค่าสูงสุดรายวันตลอดช่วงที่เลือก</li>
          <li>
            <strong>วันวิ่ง</strong> — จำนวนวันที่ระยะทางมากกว่า 0 ตัวเลขสีจางข้างหลัง (เช่น{" "}
            <Code>28/30</Code>) คือจำนวนวันที่มีข้อมูลส่งเข้ามาทั้งหมด ส่วนต่างคือวันที่จอดนิ่ง
          </li>
          <li><strong>เฉลี่ย/วัน</strong> — ระยะทางรวม ÷ วันวิ่ง (ไม่หารด้วยวันที่จอด)</li>
          <li><strong>สูงสุด/วัน</strong> — วันที่วิ่งไกลที่สุดของคันนั้น</li>
          <li>
            <strong>แหล่ง GPS</strong> — ป้ายสี = เจ้าที่ถูกใช้เป็นค่าสูงสุด, ป้ายขีดฆ่า = มีข้อมูลแต่ค่าต่ำกว่าเลยไม่ถูกใช้,
            ป้ายเหลือง &ldquo;ซ้อน N วัน&rdquo; = จำนวนวันที่มีข้อมูลมากกว่าหนึ่งเจ้า
          </li>
        </ul>

        <H>ข้อควรระวัง</H>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            ช่วงวันที่ที่ ETL ยังโหลดไม่ครบทุกเจ้าจะเห็น fleet/สาขา ไม่ครบ — ระบบจะขึ้นแถบเตือนไว้ว่าช่วงนั้นมีข้อมูลกี่แหล่ง
            และจะมีแถบเตือนสีเหลืองขึ้นให้
          </li>
          <li>
            KPI ด้านบนคำนวณจากแถวที่แสดงอยู่จริง ถ้าพิมพ์ค้นหาในตาราง ตัวเลข KPI จะขยับตามด้วย
          </li>
        </ul>
      </div>
    </dialog>
  )
}

// ── Filter chip row ───────────────────────────────────────────────────────────

function ChipRow({
  label,
  options,
  selected,
  onToggle,
  onClear,
  hint,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onToggle: (value: string) => void
  onClear: () => void
  hint?: string
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
      active
        ? "border-cyan-600 bg-cyan-600 text-white"
        : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-gray-400"
    }`

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-white/8 pt-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <button onClick={onClear} className={chip(selected.size === 0)}>
        ทั้งหมด
      </button>
      {options.map((o) => (
        <button key={o} onClick={() => onToggle(o)} className={chip(selected.has(o))}>
          {o}
        </button>
      ))}
      {hint && selected.size > 0 && (
        <span className="text-[10px] text-gray-400">{hint}</span>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GpsDistancePage() {
  // Filter options
  const [bounds, setBounds]         = useState<{ min: string; max: string }>({ min: "", max: "" })
  const [coverage, setCoverage]     = useState<Coverage | null>(null)
  const [fleetOptions, setFleetOptions] = useState<string[]>([])
  const [branchOptions, setBranchOptions] = useState<string[]>([])
  const [sourceOptions, setSourceOptions] = useState<string[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)

  // Filter state
  const [range, setRange] = useState<DateRange>({ start: "", end: "" })
  const [selectedFleets, setSelectedFleets] = useState<Set<string>>(new Set())
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set())
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())

  // Result state
  const [rows, setRows]             = useState<Row[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState("")
  const [searchedRange, setSearchedRange] = useState<DateRange | null>(null)

  // Table state
  const [textFilter, setTextFilter] = useState("")
  const [sortKey, setSortKey]       = useState<SortKey>("distanceKm")
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("desc")
  const [showAllFleets, setShowAllFleets] = useState(false)
  const [logicOpen, setLogicOpen] = useState(false)
  const [etlOpen, setEtlOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  // The chips can be changed without pressing ค้นหา again, so the export re-runs
  // the query that actually produced these rows — not whatever is selected now.
  const [searchedQuery, setSearchedQuery] = useState("")

  // ── Load filter options (fleet/สาขา/ที่มา follow the chosen date range) ─────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setOptionsLoading(true)
      try {
        const qs = range.start && range.end ? `?start=${range.start}&end=${range.end}` : ""
        const r = await fetch(`/api/gps/distance/options${qs}`, { cache: "no-store" })
        const j = await r.json()
        if (cancelled || !j.success) return
        setBounds({ min: j.minDate ?? "", max: j.maxDate ?? "" })
        setCoverage(j.coverage ?? null)
        setFleetOptions(j.fleets ?? [])
        setBranchOptions(j.branches ?? [])
        setSourceOptions(j.sources ?? [])
        // First load: adopt the default window the API picked.
        if (!range.start && j.start && j.end) setRange({ start: j.start, end: j.end })
      } catch {
        if (!cancelled) setError("โหลดตัวเลือกไม่สำเร็จ")
      } finally {
        if (!cancelled) setOptionsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [range.start, range.end])

  // ── Search ────────────────────────────────────────────────────────────────
  const search = useCallback(async () => {
    if (!range.start || !range.end) return
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end })
      if (selectedFleets.size > 0) params.set("fleet", [...selectedFleets].join(","))
      if (selectedBranches.size > 0) params.set("branch", [...selectedBranches].join(","))
      if (selectedSources.size > 0) params.set("source", [...selectedSources].join(","))
      const r = await fetch(`/api/gps/distance?${params}`, { cache: "no-store" })
      const j = await r.json()
      if (j.success) {
        setRows(j.rows ?? [])
        setSearchedRange({ start: j.start, end: j.end })
        setSearchedQuery(params.toString())
      } else {
        setError(j.message || "ค้นหาไม่สำเร็จ")
        setRows([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [range.start, range.end, selectedFleets, selectedBranches, selectedSources])

  function toggleIn(setter: (fn: (prev: Set<string>) => Set<string>) => void, value: string) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value); else next.add(value)
      return next
    })
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "vehicleNo" || key === "fleet" || key === "branch" ? "asc" : "desc")
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const q = textFilter.trim().toLowerCase()
    const filtered = q
      ? rows.filter((r) =>
          r.vehicleNo.toLowerCase().includes(q) ||
          r.fleet.toLowerCase().includes(q) ||
          r.branch.toLowerCase().includes(q) ||
          r.brand.toLowerCase().includes(q)
        )
      : rows

    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv, "th") * dir
      return ((av as number) - (bv as number)) * dir
    })
  }, [rows, textFilter, sortKey, sortDir])

  const kpi = useMemo(() => {
    const totalKm = visibleRows.reduce((s, r) => s + r.distanceKm, 0)
    const totalDays = visibleRows.reduce((s, r) => s + r.activeDays, 0)
    const overlapVehicles = visibleRows.filter((r) => r.allSources.length > 1).length
    const idle = visibleRows.filter((r) => r.activeDays === 0).length
    return {
      totalKm,
      vehicles: visibleRows.length,
      avgPerVehicle: visibleRows.length ? totalKm / visibleRows.length : 0,
      avgPerDay: totalDays ? totalKm / totalDays : 0,
      overlapVehicles,
      idle,
    }
  }, [visibleRows])

  const fleetBreakdown = useMemo(() => {
    const map = new Map<string, { km: number; vehicles: number }>()
    for (const r of visibleRows) {
      const acc = map.get(r.fleet) ?? { km: 0, vehicles: 0 }
      acc.km += r.distanceKm
      acc.vehicles += 1
      map.set(r.fleet, acc)
    }
    const list = [...map.entries()]
      .map(([fleet, v]) => ({ fleet, ...v }))
      .sort((a, b) => b.km - a.km)
    const max = list[0]?.km ?? 0
    return { list, max }
  }, [visibleRows])

  // ── Export ────────────────────────────────────────────────────────
  // Two sheets: "distance-summary" is the read-it-first roll-up, and
  // "distance-period" is the per-vehicle grid with one column per day of the
  // range. The daily numbers come from a second call with daily=1 — the
  // dashboard never shows them, so they are fetched only when someone asks for
  // the file.
  type DailyRow = { vehicleNo: string; days?: { d: string; km: number }[] }

  async function exportExcel() {
    if (!visibleRows.length || !searchedRange || !searchedQuery || exporting) return
    setExporting(true)
    setError("")
    try {
      const r = await fetch(`/api/gps/distance?${searchedQuery}&daily=1`, { cache: "no-store" })
      const j = await r.json()
      if (!j.success) throw new Error(j.message || "ดึงข้อมูลรายวันไม่สำเร็จ")

      const daily = new Map<string, Map<string, number>>()
      for (const row of (j.rows ?? []) as DailyRow[]) {
        daily.set(row.vehicleNo, new Map((row.days ?? []).map((x) => [x.d, x.km])))
      }
      buildWorkbook(searchedRange, daily)
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งออก Excel ไม่สำเร็จ")
    } finally {
      setExporting(false)
    }
  }

  function buildWorkbook(range: DateRange, daily: Map<string, Map<string, number>>) {
    const grid = monthGridDates(range)
    const headers = dayHeaders(grid)
    const r1 = (v: number) => Math.round((Number(v) || 0) * 10) / 10

    // A reading too small to survive one decimal keeps more of them — otherwise a
    // truck that crawled 30 m reads as parked while วันวิ่ง still counts the day.
    const dayCell = (km: number) => {
      const rounded = r1(km)
      return rounded === 0 && km > 0 ? Math.round(km * 1000) / 1000 : rounded
    }

    // ── Sheet distance-summary: the raw per-vehicle roll-up ────────────────
    const wsSummary = XLSX.utils.json_to_sheet(
      visibleRows.map((row) => ({
        "ทะเบียน": row.vehicleNo,
        "Fleet": row.fleet,
        "สาขา": row.branch,
        "ยี่ห้อ": row.brand,
        "ระยะทาง_km": r1(row.distanceKm),
        "วันวิ่ง": row.activeDays,
        "วันมีข้อมูล": row.dataDays,
        "เฉลี่ยต่อวัน_km": r1(row.avgDayKm),
        "สูงสุดต่อวัน_km": r1(row.maxDayKm),
        "แหล่งที่ใช้": row.usedSources.join("|"),
        "แหล่งทั้งหมด": row.allSources.join("|"),
        "วันที่ซ้อนแหล่ง": row.overlapDays,
        // The period rides on every row so the raw sheet stays self-describing
        // once it is appended to last month's or pivoted.
        "startdate": range.start,
        "enddate": range.end,
      }))
    )
    wsSummary["!cols"] = [
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 9 },
      { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 16 },
      { wch: 12 }, { wch: 12 },
    ]
    wsSummary["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: visibleRows.length, c: 13 } }),
    }

    // ── Sheet distance-period ──────────────────────────────────
    // Plate × day: identity + row totals, then วันที่ 1 to the end of the month as
    // dd-mmm. Days the search did not cover carry 0 like any other quiet day.
    // Written as an array of arrays rather than from objects so the day columns
    // keep their order whatever the headers look like.
    // total_km / total_day are taken from the same aggregate as
    // distance-summary, so the two sheets never disagree; the day columns are
    // the breakdown of that total.
    const FIXED = ["ทะเบียน", "Fleet", "สาขา", "แหล่งทั้งหมด", "total_km", "total_day"]
    const periodAoa: (string | number)[][] = [
      [...FIXED, ...headers],
      ...visibleRows.map((row) => {
        const perDay = daily.get(row.vehicleNo)
        return [
          row.vehicleNo, row.fleet, row.branch, row.allSources.join("|"),
          r1(row.distanceKm), row.activeDays,
          ...grid.map((d) => dayCell(perDay?.get(d) ?? 0)),
        ]
      }),
    ]
    const wsPeriod = XLSX.utils.aoa_to_sheet(periodAoa)
    wsPeriod["!cols"] = [
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 11 },
      ...grid.map(() => ({ wch: 9 })),
    ]
    // Hundreds of rows is a lot to eyeball: the filter row lets whoever opens
    // the file slice by fleet or branch without going back to the dashboard.
    wsPeriod["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: periodAoa.length - 1, c: FIXED.length + grid.length - 1 },
      }),
    }

    // ── Workbook ──────────────────────────────────────────────
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsSummary, "distance-summary")
    XLSX.utils.book_append_sheet(wb, wsPeriod, "distance-period")

    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `gps-distance-${range.start}_${range.end}.xlsx`
    )
  }

  // ── Table cell classes ────────────────────────────────────────────────────
  const thBase = "px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100 dark:border-white/8 select-none"
  const thLeft = "px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100 dark:border-white/8 select-none"
  const tdBase = "px-3 py-2 text-right text-xs tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap"
  const tdLeft = "px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap"

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 text-gray-300 dark:text-gray-600">↕</span>
    return <span className="ml-1 text-cyan-500">{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-6">
      <LogicDialog open={logicOpen} onClose={() => setLogicOpen(false)} />
      <EtlLogDialog open={etlOpen} onClose={() => setEtlOpen(false)} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">ระยะทาง GPS</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            สรุประยะทางรายคันตามช่วงวันที่ — รวมข้อมูลจากทุกผู้ให้บริการ GPS
          </p>
        </div>
        <button
          onClick={() => setEtlOpen(true)}
          title="ประวัติการโหลดข้อมูล (ETL)"
          className="rounded-xl border border-gray-200 p-2 text-gray-500 transition hover:border-cyan-500 hover:text-cyan-600 dark:border-white/10 dark:text-gray-400 dark:hover:text-cyan-400"
        >
          <History size={16} />
        </button>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">ช่วงวันที่</label>
            <DateRangePicker
              value={range}
              onChange={(r) => {
                setRange(r)
                setSelectedFleets(new Set())
                setSelectedBranches(new Set())
                setSelectedSources(new Set())
              }}
              min={bounds.min}
              max={bounds.max}
              disabled={optionsLoading && !range.start}
            />
          </div>

          {bounds.max && (
            <span className="pb-1.5 text-[11px] text-gray-400">
              ข้อมูลมีถึง {dateLabel(bounds.max)}
            </span>
          )}

          {/* Search button */}
          <button
            onClick={search}
            disabled={loading || !range.start || !range.end}
            className="rounded-xl bg-cyan-600 px-6 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-40 transition"
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <GpsSpinner />
                กำลังค้นหา…
              </span>
            ) : (
              "ค้นหา"
            )}
          </button>

          {searchedRange && !loading && (
            <span className="text-[11px] text-gray-400">
              ผลลัพธ์ {rangeLabel(searchedRange)} · {daysInRange(searchedRange)} วัน ·{" "}
              {fmt(rows.length)} คัน
            </span>
          )}
        </div>

        {/* A window missing vendors shows only the fleets those vendors carry, so
            say so rather than let it read as "these fleets had no distance".
            A window touching the last couple of days can blame a pending ETL —
            an older one is short simply because that vendor was not onboarded yet. */}
        {coverage && coverage.vendors < coverage.totalVendors && (
          <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            ช่วง {rangeLabel(range)} มีข้อมูลจาก {coverage.vendors} จาก{" "}
            {coverage.totalVendors} แหล่ง GPS — fleet ที่แสดงจึงมีเฉพาะของแหล่งที่มีข้อมูล
            {bounds.max && range.end === bounds.max && " (ETL ของแหล่งที่เหลือยังโหลดไม่ครบ)"}
          </div>
        )}

        {optionsLoading ? (
          <>
            <ChipRowSkeleton label="Fleet" />
            <ChipRowSkeleton label="สาขา" />
            <ChipRowSkeleton label="ที่มา" />
          </>
        ) : (
          <>
            <ChipRow
              label="Fleet"
              options={fleetOptions}
              selected={selectedFleets}
              onToggle={(v) => toggleIn(setSelectedFleets, v)}
              onClear={() => setSelectedFleets(new Set())}
            />

            <ChipRow
              label="สาขา"
              options={branchOptions}
              selected={selectedBranches}
              onToggle={(v) => toggleIn(setSelectedBranches, v)}
              onClear={() => setSelectedBranches(new Set())}
            />

            <ChipRow
              label="ที่มา"
              options={sourceOptions}
              selected={selectedSources}
              onToggle={(v) => toggleIn(setSelectedSources, v)}
              onClear={() => setSelectedSources(new Set())}
              hint="เลือกแล้วจะคำนวณจากแหล่งที่เลือกเท่านั้น"
            />
          </>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!searchedRange && !loading && !error && (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 px-6 py-12 text-center">
          <p className="text-sm text-gray-400">เลือกช่วงวันที่ และ Fleet แล้วกด &ldquo;ค้นหา&rdquo;</p>
        </div>
      )}

      {/* Loader — โครงร่างเดียวกับผลลัพธ์จริง ไม่ให้หน้าว่างระหว่างรอ */}
      {loading && <ResultsSkeleton />}

      {searchedRange && !loading && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 px-6 py-12 text-center">
          <p className="text-sm text-gray-400">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p>
        </div>
      )}

      {/* Results */}
      {!loading && rows.length > 0 && (
        <div className="gps-fade-in flex flex-col gap-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="ระยะทางรวม" value={fmtShort(kpi.totalKm)} unit="km" />
            <Kpi label="จำนวนรถ" value={fmt(kpi.vehicles)} unit="คัน" />
            <Kpi label="เฉลี่ย/คัน" value={fmt(kpi.avgPerVehicle)} unit="km" />
            <Kpi label="เฉลี่ย/คัน/วัน" value={fmt(kpi.avgPerDay)} unit="km" />
            <Kpi label="รถไม่มีระยะทาง" value={fmt(kpi.idle)} unit="คัน" hint="มีข้อมูลแต่ 0 km" />
            <Kpi
              label="รถหลายแหล่ง GPS"
              value={fmt(kpi.overlapVehicles)}
              unit="คัน"
              hint="ใช้ค่าสูงสุดรายวัน"
            />
          </div>

          {/* Fleet breakdown */}
          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27]">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-white/8">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">สรุปตาม Fleet</p>
                <p className="text-xs text-gray-400 mt-0.5">ระยะทางรวมและจำนวนรถของแต่ละ fleet</p>
              </div>
              {fleetBreakdown.list.length > FLEET_PREVIEW && (
                <button
                  onClick={() => setShowAllFleets((v) => !v)}
                  className="rounded-xl border border-gray-200 dark:border-white/10 px-3 py-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:border-gray-400 transition"
                >
                  {showAllFleets ? "ย่อ" : `ดูทั้งหมด (${fleetBreakdown.list.length})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 p-4 xl:grid-cols-2">
              {(showAllFleets ? fleetBreakdown.list : fleetBreakdown.list.slice(0, FLEET_PREVIEW)).map((f) => (
                <div key={f.fleet} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs font-medium text-gray-700 dark:text-gray-300" title={f.fleet}>
                    {f.fleet}
                  </span>
                  <div className="relative hidden h-5 flex-1 overflow-hidden rounded-md bg-gray-100 sm:block dark:bg-white/5">
                    <div
                      className="h-full rounded-md bg-linear-to-r from-cyan-500 to-cyan-400"
                      style={{ width: `${fleetBreakdown.max ? (f.km / fleetBreakdown.max) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="ml-auto w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-white">
                    {fmtShort(f.km)} km
                  </span>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
                    {fmt(f.vehicles)} คัน
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Datatable */}
          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-white/8">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setLogicOpen(true)}
                  title="ระบบคิดตัวเลขนี้มาอย่างไร"
                  className="rounded-xl border border-gray-200 p-1.5 text-gray-500 transition hover:border-cyan-500 hover:text-cyan-600 dark:border-white/10 dark:text-gray-400 dark:hover:text-cyan-400"
                >
                  <BookOpen size={15} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">รายคัน</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    แสดง {fmt(visibleRows.length)} จาก {fmt(rows.length)} คัน
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={textFilter}
                  onChange={(e) => setTextFilter(e.target.value)}
                  placeholder="ค้นหาทะเบียน / fleet / สาขา…"
                  className="rounded-xl border border-gray-200 dark:border-white/10 bg-transparent px-3 py-1.5 text-xs dark:text-white outline-none focus:border-cyan-500 placeholder:text-gray-300 dark:placeholder:text-gray-600 min-w-50"
                />
                <button
                  onClick={exportExcel}
                  disabled={exporting}
                  title="ดาวน์โหลด Excel — ชีต distance-summary และ distance-period (รายคัน × รายวัน)"
                  className="rounded-xl border border-gray-200 dark:border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-gray-400 disabled:opacity-40 transition"
                >
                  {exporting ? (
                    <span className="inline-flex items-center gap-1.5">
                      <GpsSpinner />
                      กำลังสร้าง…
                    </span>
                  ) : (
                    "Excel"
                  )}
                </button>
              </div>
            </div>

            <div className="themed-scroll overflow-x-auto max-h-155 overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 dark:bg-[#12151d]">
                    <th className={`${thLeft} w-10 text-center`}>#</th>
                    <th className={`${thLeft} cursor-pointer`} onClick={() => toggleSort("vehicleNo")}>
                      ทะเบียน<SortArrow k="vehicleNo" />
                    </th>
                    <th className={`${thLeft} cursor-pointer`} onClick={() => toggleSort("fleet")}>
                      Fleet<SortArrow k="fleet" />
                    </th>
                    <th className={`${thLeft} cursor-pointer`} onClick={() => toggleSort("branch")}>
                      สาขา<SortArrow k="branch" />
                    </th>
                    <th className={thLeft}>ยี่ห้อ</th>
                    <th className={`${thBase} cursor-pointer`} onClick={() => toggleSort("distanceKm")}>
                      ระยะทางรวม (km)<SortArrow k="distanceKm" />
                    </th>
                    <th className={`${thBase} cursor-pointer`} onClick={() => toggleSort("activeDays")}>
                      วันวิ่ง<SortArrow k="activeDays" />
                    </th>
                    <th className={`${thBase} cursor-pointer`} onClick={() => toggleSort("avgDayKm")}>
                      เฉลี่ย/วัน<SortArrow k="avgDayKm" />
                    </th>
                    <th className={`${thBase} cursor-pointer`} onClick={() => toggleSort("maxDayKm")}>
                      สูงสุด/วัน<SortArrow k="maxDayKm" />
                    </th>
                    <th className={thLeft}>แหล่ง GPS</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, i) => (
                    <tr
                      key={r.vehicleNo}
                      className="border-t border-gray-50 dark:border-white/5 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20 transition-colors"
                    >
                      <td className={`${tdBase} text-center text-gray-300 dark:text-gray-600`}>{i + 1}</td>
                      <td className={`${tdLeft} font-mono font-medium text-gray-900 dark:text-white`}>
                        {r.vehicleNo}
                      </td>
                      <td className={tdLeft}>
                        <span className="rounded-full bg-gray-100 dark:bg-white/8 px-2 py-0.5 text-[11px] font-medium">
                          {r.fleet}
                        </span>
                      </td>
                      <td className={tdLeft}>{r.branch}</td>
                      <td className={`${tdLeft} text-gray-400`}>{r.brand}</td>
                      <td className={`${tdBase} font-bold text-gray-900 dark:text-white`}>
                        {fmt(r.distanceKm, 1)}
                      </td>
                      <td className={tdBase}>
                        {r.activeDays}
                        {r.dataDays > r.activeDays && (
                          <span className="ml-1 text-gray-300 dark:text-gray-600">/{r.dataDays}</span>
                        )}
                      </td>
                      <td className={tdBase}>{fmt(r.avgDayKm, 1)}</td>
                      <td className={tdBase}>{fmt(r.maxDayKm, 1)}</td>
                      <td className={tdLeft}>
                        <div className="flex flex-wrap items-center gap-1">
                          {r.allSources.map((s) => {
                            const used = r.usedSources.includes(s)
                            return (
                              <span
                                key={s}
                                title={used ? `${s} — ถูกใช้เป็นค่าสูงสุด` : `${s} — มีข้อมูลแต่ค่าต่ำกว่า`}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  used
                                    ? SOURCE_COLOR[s] ?? "bg-gray-100 text-gray-600 dark:bg-white/8 dark:text-gray-300"
                                    : "bg-transparent text-gray-300 dark:text-gray-600 line-through"
                                }`}
                              >
                                {s}
                              </span>
                            )
                          })}
                          {r.overlapDays > 0 && (
                            <span
                              title={`${r.overlapDays} วันที่มีข้อมูลมากกว่า 1 แหล่ง — ใช้ค่าสูงสุดของวันนั้น`}
                              className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            >
                              ซ้อน {r.overlapDays} วัน
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer total */}
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-white/3 px-5 py-3 text-xs">
              <span className="text-gray-400">รวม {fmt(visibleRows.length)} คัน</span>
              <span className="font-bold tabular-nums text-gray-900 dark:text-white">
                {fmt(kpi.totalKm, 1)} km
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
