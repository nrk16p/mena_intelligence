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
import {
  FLEET_MAP, FLEET_ORDER, FLEET_COLORS,
  BUCKET_OFFICE, BUCKET_PARTNER, BUCKET_NEW, BUCKET_UNKNOWN,
  fleetKey, fleetLabel, allocateOffice,
} from "@/lib/fleets"
// normPlate lives in lib/plate-partner (dependency-free). Never import
// lib/plate-partner-server here — it pulls in Mongo and breaks the client build.
import { normPlate } from "@/lib/plate-partner"

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

// /api/cost/repair-type rows — ประเภทการซ่อม straight off the MR, one row per
// (ทะเบียน × เดือน × อู่ใน/อู่นอก × ประเภท). A DIFFERENT cost basis from the
// stockmovement rows above: see the note rendered on the workshop slide.
type RepairTypeRow = {
  plate:       string
  month_year:  string
  garage:      "อู่ใน" | "อู่นอก"
  repair_type: string
  total:       number
}

// truck-utilize/breakdown rows — month_year format "MM-YY"
type BDRow = {
  fleet_group_id:  string | number
  month_year:      string
  truck_count:     number
  breakdown_count: number
}

// Selectable fleet pills. BUCKET_OFFICE is normally empty — office cost is split
// across the real fleets during tagging (see allocateOfficeRows) — but it is
// listed anyway as a safety net: if a month yields no allocation denominator at
// all, the row stays in BUCKET_OFFICE and must remain selectable, or "All" would
// filter out cost that "Clear" includes. "All" and "Clear" must always total the
// same, so every bucket a row can hold needs a pill here.
const FLEET_PILLS = [...FLEET_ORDER, BUCKET_PARTNER, BUCKET_NEW, BUCKET_UNKNOWN, BUCKET_OFFICE]

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

// Thai month abbreviations — used for the Excel export's month columns, where
// the audience is Thai-reading and the sheet is read without the page around it.
const MONTH_TH: Record<string, string> = {
  "01": "ม.ค.", "02": "ก.พ.", "03": "มี.ค.", "04": "เม.ย.", "05": "พ.ค.", "06": "มิ.ย.",
  "07": "ก.ค.", "08": "ส.ค.", "09": "ก.ย.", "10": "ต.ค.", "11": "พ.ย.", "12": "ธ.ค.",
}
const monthTh = (my: string) => MONTH_TH[my.split("-")[1]] ?? my

// MR repair_type values kept out of the ประเภทการซ่อม table, for two reasons:
//
//   not repair work at all — ATMS raises ใบแจ้งซ่อม for these too, and left in
//   they distort a slide titled ค่าซ่อม (น้ำมันเชื้อเพลิง alone was ฿10.26M,
//   second-largest of 32 types over Jan–Jul 2026)
//
//   reported on their own elsewhere — ยาง and อุปกรณ์เสริม are large enough to
//   crowd out the actual repair systems, and ยาง already has its own cost group
//
// PMช่างมีนา (งาน PM ที่ช่างในอู่ทำเอง) ตัดออก — เป็นงานตามแผน ไม่ใช่ซ่อม และ
// มีสไลด์กลุ่มต้นทุน PM ของตัวเองอยู่แล้ว พร้อมชื่อชุดใหม่ที่หมายถึงงานเดียวกัน
// (อู่ใน-PM-*) ตามนโยบายเติมชื่อให้ครบ
// PMศูนย์บริการ / อู่นอก-PM-* ยังอยู่: เป็น PM ที่จ้างศูนย์ทำ ซึ่งเป็นค่าใช้จ่าย
// ที่ต้องเห็นในตารางอู่ใน-vs-อู่นอก
// วัสดุสิ้นเปลือง ยังอยู่เช่นกัน — เป็นค่าบำรุงรักษาจริงและฝั่ง stockmovement ก็นับ
// Compared with whitespace collapsed — the NGV value ships with padded brackets.
const EXCLUDED_TYPES = new Set([
  "น้ำมันเชื้อเพลิง",
  "ทำความสะอาด",
  "ต่อภาษี",
  "ตรวจสภาพถังก๊าซ NGV ( ประจำปี )",
  "ยาง",
  "อุปกรณ์เสริม",

  // ATMS เริ่มใช้ชื่อชุดใหม่ "อู่ใน-/อู่นอก- <หมวด> - <งาน>" ราว ส.ค. 2026
  // ควบคู่ชื่อเดิม ช่วงเดือนที่ยังไม่ถึงจะไม่เห็นชื่อพวกนี้เลย แต่พอขยับช่วง
  // มาถึง ส.ค. จะโผล่เป็นแถวแยกทันทีถ้าไม่ตัดไว้ก่อน (ฟิลด์เดียวกับที่
  // lib/repeat-repair.ts ตัด — คนละเหตุผล จึงคนละลิสต์)
  "ปะยาง",
  "อู่ใน-T-เปลี่ยนยาง",
  "อู่นอก-T-เปลี่ยนยาง",
  "อู่นอก-T-เปลี่ยนยางใน",
  "อู่นอก-T-เปลี่ยนยางรองคอ",
  "อู่ใน-OTH-อุปกรณ์เสริม",
  "อู่นอก-OTH-อุปกรณ์เสริม",
  "อู่ใน-ทำความสะอาด",
  "อู่นอก-ทำความสะอาด",
  "PMช่างมีนา",
  "อู่ใน-PM-1",
  "อู่ใน-PM-3",
  "อู่ใน-PM-ช่วงล่าง",
  "อู่ใน-PM-ลิฟต์ท้าย",
].map((t) => t.replace(/\s+/g, " ").trim()))

const isExcludedType = (t: string) => EXCLUDED_TYPES.has(t.replace(/\s+/g, " ").trim())

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

// อู่นอก = คัน-เดือนที่มีรายการ "ค่าแรง" (จ้างซ่อมภายนอก) — same rule as
// /transaction-detail. The side is a property of the whole plate-month row, so
// every line inside it inherits that side.
const isOutsideRow = (r: PlateDetailRow) =>
  (r.lines || []).some((l) => (l.ชื่อสินค้า || "").includes("ค่าแรง"))

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

// ── PNG export frame ──────────────────────────────────────────────────────────
// Slides get pasted straight into the MM deck, so every exported PNG is 16:9.
// 1920×1080 at 2x = a 3840×2160 file. SlideFrame pins each slide to 1440×810,
// which is the same ratio, so the fit below lands on exactly 4/3 and the frame
// comes out full-bleed — the letterbox path only runs if a slide is ever
// unpinned from that size.
const PNG_FRAME_W = 1920
const PNG_FRAME_H = 1080
const PNG_SCALE = 2

const loadImage = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("could not decode the captured slide"))
    img.src = URL.createObjectURL(blob)
  })

// ── Slide frame ───────────────────────────────────────────────────────────────
// Every slide is pinned to exactly 1440×810 — 16:9 — so savePng's fit lands on
// 1920/1440 = 1080/810 = 4/3 on the nose. Two things follow: exported PNGs have
// no letterbox bars, and one type scale reads the same on every slide. Before
// this the slide was min(1400, viewport − 48) wide, so the same slide exported
// at a different apparent type size from a 1366px laptop than from a 1920px one.
function SlideFrame({
  slideRef, accent, eyebrow, title, meta, right, children, muted = false,
}: {
  slideRef: (el: HTMLElement | null) => void
  accent: string
  eyebrow: string
  title: React.ReactNode
  meta: React.ReactNode
  right: React.ReactNode
  children: React.ReactNode
  muted?: boolean
}) {
  const el = useRef<HTMLElement | null>(null)
  const [over, setOver] = useState(false)
  const attach = (node: HTMLElement | null) => { el.current = node; slideRef(node) }

  // the fixed height clips silently, so say so on screen while there is still a
  // chance to fix it. Runs on every render — the data behind a slide changes its
  // height without changing this component's props.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: a slide's
  // height changes with its data, not with this component's props, so it has to
  // re-measure every render. setOver returns the previous value when nothing
  // moved, so React bails out and this settles rather than looping.
  useEffect(() => {
    const node = el.current
    if (!node) return
    const spilling = node.scrollHeight > node.clientHeight + 1
    setOver((prev) => (prev === spilling ? prev : spilling))
  })

  return (
    <section ref={attach}
      className={`slide relative flex h-[810px] w-[1440px] shrink-0 flex-col overflow-hidden bg-white p-8 ${muted ? "opacity-70" : ""}`}>
      {over && (
        <div data-no-export
          className="absolute right-3 top-3 z-50 rounded-md bg-red-600 px-2.5 py-1 text-[14px] font-bold text-white shadow">
          เนื้อหาเกินกรอบสไลด์ — ตัดออกในไฟล์ PNG
        </div>
      )}
      <header className="mb-5 flex shrink-0 items-start justify-between gap-8 border-b-2 border-gray-900 pb-4">
        <div className="min-w-0">
          <p className="text-[18px] font-bold uppercase leading-[24px] tracking-[0.16em]" style={{ color: accent }}>{eyebrow}</p>
          <h2 className="mt-1 text-[40px] font-bold leading-[46px] text-gray-900">{title}</h2>
          <p className="mt-1.5 text-[20px] leading-[27px] text-gray-500">{meta}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">{right}</div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CostReportPage() {
  const today = new Date()
  const cy = today.getFullYear()
  const cm = String(today.getMonth() + 1).padStart(2, "0")

  const [startMonth, setStartMonth] = useState(`${cy}-01`)
  const [endMonth, setEndMonth]     = useState(`${cy}-${cm}`)

  // sumCurr drives the warehouse + partner-flag chip lists only (see below); the
  // headline figures come from the fleet-tagged detail rows. There is no prior-
  // year summary state on purpose — nothing reads it, so the aggregation is not
  // run.
  const [sumCurr, setSumCurr]       = useState<SummaryRow[]>([])
  const [detCurr, setDetCurr]       = useState<PlateDetailRow[]>([])
  const [detPrev, setDetPrev]       = useState<PlateDetailRow[]>([])
  const [rtCurr, setRtCurr]         = useState<RepairTypeRow[]>([])
  const [bdCurr, setBdCurr]         = useState<BDRow[]>([])
  const [bdPrev, setBdPrev]         = useState<BDRow[]>([])

  // plate+month → fleet_group_id bridge (MySQL), plus the per-plate partner_flag
  // used to bucket plates the bridge has no row for.
  const [fleetMapCurr, setFleetMapCurr] = useState<Record<string, string>>({})
  const [fleetMapPrev, setFleetMapPrev] = useState<Record<string, string>>({})
  // flags are keyed plate|MM-YY and are range-specific: the current-range
  // response must not bucket prior-year rows (a truck can change flag).
  const [flagMapCurr, setFlagMapCurr]   = useState<Record<string, string>>({})
  const [flagMapPrev, setFlagMapPrev]   = useState<Record<string, string>>({})
  const [selectedFleets, setSelectedFleets] = useState<Set<string>>(new Set())
  // "failed" = the plate-map call errored (retrying may help); "empty" = it
  // succeeded but MySQL has no operations rows for the range (retrying will not).
  const [fleetBridgeStatus, setFleetBridgeStatus] = useState<"ok" | "failed" | "empty">("ok")

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [hasData, setHasData] = useState(false)

  // ── Staged load progress ────────────────────────────────────────────────────
  // A bare "Loading…" over a 2–4s load reads as a hang. The four MySQL scans
  // behind it are ~700–930ms each and cannot be indexed away (cardinality 18 on
  // a 390k-row table), so the honest fix is to show what is happening.
  //
  // The seven requests stay in ONE Promise.all — splitting them into sequential
  // stages to show progress would make the page slower, which defeats the
  // point. Each stage instead hangs a .then() off its own fetches and flips
  // when they really resolve.
  //
  // Because they run in parallel the stages can finish out of order — the fleet
  // bridge often beats the cost scans. So each stage renders its OWN state
  // independently rather than as a strict sequence: a finished later stage
  // shows ✓ while an earlier one still spins, and nothing ever jumps backwards.
  type LoadStage = "cost" | "fleet" | "compute"
  const [stagesDone, setStagesDone] = useState<Record<LoadStage, boolean>>({
    cost: false, fleet: false, compute: false,
  })
  const [loadStartedAt, setLoadStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const markStage = (s: LoadStage) => setStagesDone((p) => (p[s] ? p : { ...p, [s]: true }))

  useEffect(() => {
    if (!loading || loadStartedAt === null) return
    setElapsed((Date.now() - loadStartedAt) / 1000)
    const id = setInterval(() => setElapsed((Date.now() - loadStartedAt) / 1000), 100)
    return () => clearInterval(id)
  }, [loading, loadStartedAt])

  const LOAD_STAGES: { key: LoadStage; label: string }[] = [
    { key: "cost",    label: "ดึงข้อมูลต้นทุน" },
    { key: "fleet",   label: "เชื่อมข้อมูลฟลีต" },
    { key: "compute", label: "คำนวณและจัดกลุ่ม" },
  ]

  const [selectedWh, setSelectedWh]     = useState<Set<string>>(new Set())
  const [selectedFlag, setSelectedFlag] = useState<Set<string>>(new Set())
  // Cost group is the only LINE-level filter on this page — see cgFilter below.
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())

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
    setStagesDone({ cost: false, fleet: false, compute: false })
    setLoadStartedAt(Date.now())
    setElapsed(0)
    try {
      const gp = encodeURIComponent("จุดประสงค์ในการเบิก")
      const pS = shiftYear(startMonth, -1), pE = shiftYear(endMonth, -1)
      // Fleet mapping does not depend on the warehouse / partner_flag chips, so
      // it is fetched here only — never in the chip-change effect below.
      const pSum  = fetch(`/api/cost/summary?group_by=${gp}&start=${startMonth}&end=${endMonth}`, { cache: "no-store" })
      const pDet1 = fetch(`/api/cost/detail?${countsParams(startMonth, endMonth)}`, { cache: "no-store" })
      const pDet2 = fetch(`/api/cost/detail?${countsParams(pS, pE)}`, { cache: "no-store" })
      const pBd1  = fetch(`/api/truck-utilize/breakdown?${bdParams(toBdKey(startMonth), toBdKey(endMonth))}`, { cache: "no-store" })
      const pBd2  = fetch(`/api/truck-utilize/breakdown?${bdParams(toBdKey(pS), toBdKey(pE))}`, { cache: "no-store" })
      const pFl1  = fetch(`/api/fleet/plate-map?start=${toBdKey(startMonth)}&end=${toBdKey(endMonth)}`, { cache: "no-store" })
      const pFl2  = fetch(`/api/fleet/plate-map?start=${toBdKey(pS)}&end=${toBdKey(pE)}`, { cache: "no-store" })
      // MR repair types are aggregated wholly server-side and depend on neither
      // the warehouse nor the partner_flag chips, so like the fleet bridge this
      // is fetched here only.
      const pRt   = fetch(`/api/cost/repair-type?start=${startMonth}&end=${endMonth}`, { cache: "no-store" })

      // Stage ticks hang off the SAME promises the await below consumes — the
      // requests are not re-issued and not serialised. A rejection is swallowed
      // here on purpose; the await is what surfaces the error.
      Promise.all([pSum, pDet1, pDet2]).then(() => markStage("cost")).catch(() => {})
      Promise.all([pBd1, pBd2, pFl1, pFl2]).then(() => markStage("fleet")).catch(() => {})

      const [s1, d1, d2, b1, b2, f1, f2, r1] = await Promise.all([
        pSum, pDet1, pDet2, pBd1, pBd2, pFl1, pFl2, pRt,
      ])
      const [j1, j2, j3, j4, j5, j6, j7, j8] = await Promise.all([s1.json(), d1.json(), d2.json(), b1.json(), b2.json(), f1.json(), f2.json(), r1.json()])
      if (!j1.success) throw new Error(j1.error || "summary failed")
      setSumCurr(j1.data)
      setDetCurr(j2.success ? j2.data : []); setDetPrev(j3.success ? j3.data : [])
      setBdCurr(j4.success ? j4.data : []); setBdPrev(j5.success ? j5.data : [])
      setFleetMapCurr(j6.success ? j6.data : {}); setFleetMapPrev(j7.success ? j7.data : {})
      // count comes straight from the route; it is the only way to tell a failed
      // bridge apart from a range that genuinely has no MySQL operations rows.
      const bridgeCount = j6.count ?? Object.keys(j6.data ?? {}).length
      setFleetBridgeStatus(
        !f1.ok || !j6.success ? "failed" : bridgeCount === 0 ? "empty" : "ok",
      )
      // A failed MR join must not take the slide down — the table renders empty
      // and every other panel on it still has its stockmovement numbers.
      setRtCurr(j8.success ? j8.data : [])
      setFlagMapCurr(j6.success ? (j6.flags ?? {}) : {})
      setFlagMapPrev(j7.success ? (j7.flags ?? {}) : {})
      setHasData(true)
      markStage("compute")
    } catch (e: any) {
      setFleetBridgeStatus("failed")
      setError(e.message || "Load failed")
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  // detail + breakdown are aggregated server-side → refetch when chip filters change
  useEffect(() => {
    if (!hasData) return
    const pS = shiftYear(startMonth, -1), pE = shiftYear(endMonth, -1)
    ;(async () => {
      try {
        const [d1, d2, b1, b2] = await Promise.all([
          fetch(`/api/cost/detail?${countsParams(startMonth, endMonth)}`, { cache: "no-store" }),
          fetch(`/api/cost/detail?${countsParams(pS, pE)}`, { cache: "no-store" }),
          fetch(`/api/truck-utilize/breakdown?${bdParams(toBdKey(startMonth), toBdKey(endMonth))}`, { cache: "no-store" }),
          fetch(`/api/truck-utilize/breakdown?${bdParams(toBdKey(pS), toBdKey(pE))}`, { cache: "no-store" }),
        ])
        const [j1, j2, j3, j4] = await Promise.all([d1.json(), d2.json(), b1.json(), b2.json()])
        if (j1.success) setDetCurr(j1.data)
        if (j2.success) setDetPrev(j2.data)
        if (j3.success) setBdCurr(j3.data)
        if (j4.success) setBdPrev(j4.data)
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

  // detail rows are filtered server-side (warehouse/partner_flag passed on fetch),
  // so detail-driven slides (workshop split, top items) follow the chips too

  // ── Fleet tagging ───────────────────────────────────────────────────────────
  // Every detail row gets a fleet id from the plate+month bridge. Rows the
  // bridge has no entry for (no MySQL operations record that month) fall back
  // to a bucket derived from partner_flag — nothing is ever dropped.
  // isAllocated marks a synthetic row produced by splitting an office row across
  // fleets. It carries cost but NOT a vehicle, so countsFrom must keep it out of
  // the distinct wd / plate / product sets.
  type TaggedPlateRow = PlateDetailRow & { fleet: string; isAllocated?: boolean }

  const tagFleet = <T extends { plate: string; month_year: string }>(
    rows: T[],
    fleetMap: Record<string, string>,
    flags: Record<string, string>,
  ): (T & { fleet: string })[] => {
    // flags are keyed plate|MM-YY. A plate can be missing in one month (it drew
    // no parts that month) while present in another — without a per-plate
    // fallback those rows would newly drop to ไม่ระบุ and shift the split.
    const anyFlagForPlate: Record<string, string> = {}
    for (const [k, v] of Object.entries(flags)) {
      const plate = k.slice(0, k.lastIndexOf("|"))
      if (plate && anyFlagForPlate[plate] === undefined) anyFlagForPlate[plate] = v
    }

    return rows.map((r) => {
      // cost month_year is "YYYY-MM"; the bridge is keyed "MM-YY" — passing the
      // raw value here silently misses 100% of plates.
      const f = fleetMap[fleetKey(r.plate, toBdKey(r.month_year))]
      // Only ids the UI can actually render are accepted. An unrecognised id
      // (e.g. a 9th fleet added to performance_vehicle_daily) has no pill and no
      // pivot row, so totalCurr would count it while the pivot รวม would not.
      // Fall through to the partner_flag bucket instead.
      if (f && FLEET_ORDER.includes(f)) return { ...r, fleet: f }
      const np = normPlate(r.plate)
      const flag = flags[fleetKey(r.plate, toBdKey(r.month_year))] ?? anyFlagForPlate[np] ?? ""
      const bucket =
        flag === "รถสำนักงาน" ? BUCKET_OFFICE
        : flag.startsWith("รถร่วม") ? BUCKET_PARTNER
        : flag === "รถมีนา" ? BUCKET_NEW
        : BUCKET_UNKNOWN
      return { ...r, fleet: bucket }
    })
  }

  // ── Office cost allocation ──────────────────────────────────────────────────
  // รถสำนักงาน is central overhead with no vehicle of its own. Left as its own
  // bucket it has no pill, so ANY non-empty fleet filter silently drops it and
  // the filtered total falls short of the unfiltered one. Instead each office
  // row is expanded here, once, into one fractional row per fleet — upstream of
  // every consumer, so the KPI row, the pivot and the charts cannot disagree.
  //
  // Allocation is PER MONTH: truck counts move month to month and an annual
  // split would misattribute cost to fleets that grew or shrank mid-range.
  const allocateOfficeRows = (rows: TaggedPlateRow[], bd: BDRow[]): TaggedPlateRow[] => {
    // "MM-YY" → { fleet id → truck_count }, real fleets only
    const trucksByMonth: Record<string, Record<string, number>> = {}
    for (const b of bd) {
      const fleet = String(b.fleet_group_id)
      if (!FLEET_ORDER.includes(fleet)) continue
      const n = Number(b.truck_count) || 0
      if (n <= 0) continue
      const bucket = (trucksByMonth[b.month_year] ??= {})
      bucket[fleet] = (bucket[fleet] ?? 0) + n
    }

    // Fallback denominator: "MM-YY" → { fleet id → non-office cost }. Truck
    // counts come from MySQL and can be missing for a month the cost side does
    // have (a year-boundary range used to empty them entirely). Splitting by
    // each fleet's share of that month's own cost keeps office overhead
    // distributed instead of stranding it in an unattributed bucket.
    const costByMonth: Record<string, Record<string, number>> = {}
    for (const r of rows) {
      if (!FLEET_ORDER.includes(r.fleet)) continue
      const v = Number(r.plate_total) || 0
      if (v <= 0) continue
      const bucket = (costByMonth[toBdKey(r.month_year)] ??= {})
      bucket[r.fleet] = (bucket[r.fleet] ?? 0) + v
    }

    const out: TaggedPlateRow[] = []
    for (const r of rows) {
      if (r.fleet !== BUCKET_OFFICE) { out.push(r); continue }
      const mk = toBdKey(r.month_year)
      // share of 1 = fraction of the month's trucks belonging to each fleet
      let shares = allocateOffice(1, trucksByMonth[mk] ?? {})
      // No truck data this month — fall back to the month's cost split.
      if (Object.keys(shares).length === 0) {
        shares = allocateOffice(1, costByMonth[mk] ?? {})
      }
      // Neither denominator available (no trucks AND no fleet cost this month) —
      // keep the row in BUCKET_OFFICE rather than drop it. Cost must never
      // vanish, even if it stays unattributed; the office pill and pivot row
      // exist precisely so it stays visible when this happens.
      if (Object.keys(shares).length === 0) { out.push(r); continue }
      for (const [fleet, share] of Object.entries(shares)) {
        out.push({
          ...r,
          fleet,
          isAllocated: true,
          plate_total: r.plate_total * share,
          // records is scaled alongside cost: the row is duplicated once per
          // fleet, so carrying the full count on each copy would multiply
          // record_count by the number of fleets.
          lines: (r.lines ?? []).map((ln) => ({
            ...ln,
            cost:    ln.cost * share,
            records: (ln.records ?? 0) * share,
            sum_actual_issue: ln.sum_actual_issue == null ? ln.sum_actual_issue : ln.sum_actual_issue * share,
          })),
        })
      }
    }
    return out
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const taggedCurr = useMemo(() => allocateOfficeRows(tagFleet(detCurr, fleetMapCurr, flagMapCurr), bdCurr), [detCurr, fleetMapCurr, flagMapCurr, bdCurr])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const taggedPrev = useMemo(() => allocateOfficeRows(tagFleet(detPrev, fleetMapPrev, flagMapPrev), bdPrev), [detPrev, fleetMapPrev, flagMapPrev, bdPrev])

  // empty selection = no filter, matching the warehouse / partner-flag chips
  const fleetFilter = (rows: TaggedPlateRow[]) =>
    selectedFleets.size === 0 ? rows : rows.filter((r) => selectedFleets.has(r.fleet))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ffCurr = useMemo(() => fleetFilter(taggedCurr), [taggedCurr, selectedFleets])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ffPrev = useMemo(() => fleetFilter(taggedPrev), [taggedPrev, selectedFleets])

  // ── Cost-group filter (LINE level) ──────────────────────────────────────────
  // The warehouse / partner-flag / fleet filters are row predicates: a plate-row
  // has exactly one of each. Cost group is not — one truck-month's lines[] spans
  // CM, PM, tyre… at once, so there is no row-level group to test. This filter
  // therefore reaches inside the row, keeps the matching lines and rebuilds
  // plate_total from the survivors; a row with nothing left drops out.
  //
  // Office-allocated rows need no special handling: their lines are already
  // scaled by the allocation share, so a line-level filter scales with them.
  //
  // Applied AFTER fleetFilter so the two compose.
  const cgFilter = (rows: TaggedPlateRow[]): TaggedPlateRow[] => {
    if (selectedGroups.size === 0) return rows
    const out: TaggedPlateRow[] = []
    for (const r of rows) {
      const lines = (r.lines ?? []).filter((ln) => selectedGroups.has(getCostGroup(ln.จุดประสงค์)))
      if (lines.length === 0) continue
      out.push({ ...r, lines, plate_total: lines.reduce((s, ln) => s + ln.cost, 0) })
    }
    return out
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fdCurr = useMemo(() => cgFilter(ffCurr), [ffCurr, selectedGroups])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fdPrev = useMemo(() => cgFilter(ffPrev), [ffPrev, selectedGroups])

  // /api/cost/counts returns one unfiltered aggregate ({_id: null}) and cannot be
  // fleet-filtered, so the KPI counts are recomputed from the fleet-filtered rows.
  const countsFrom = (rows: TaggedPlateRow[]): CountsResult => {
    const wd = new Set<string>(), plates = new Set<string>(), products = new Set<string>()
    let total = 0, records = 0
    rows.forEach((r) => {
      // Synthetic office-allocation rows carry the office plate, not a vehicle
      // of this fleet. They contribute cost and records but must stay out of the
      // distinct sets, or plate_count jumps for every fleet.
      const counts = !r.isAllocated
      if (counts && r.wd) wd.add(String(r.wd))
      if (counts && r.plate) plates.add(String(r.plate))
      total += r.plate_total
      r.lines?.forEach((ln) => {
        if (counts && ln.รหัสสินค้า) products.add(String(ln.รหัสสินค้า))
        records += ln.records ?? 0
      })
    })
    return {
      wd_count:      wd.size,
      plate_count:   plates.size,
      product_count: products.size,
      total_cost:    total,
      record_count:  records,
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const countsCurrLocal = useMemo(() => countsFrom(fdCurr), [fdCurr])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const countsPrevLocal = useMemo(() => countsFrom(fdPrev), [fdPrev])

  const months = useMemo(() => getMonthsInRange(startMonth, endMonth), [startMonth, endMonth])

  // ── Overview aggregates ─────────────────────────────────────────────────────
  // Sourced from the fleet-tagged detail rows (not /api/cost/summary) so the
  // fleet chips reach every headline number. Verified identical to the baht.
  const totalCurr = useMemo(() => fdCurr.reduce((s, r) => s + r.plate_total, 0), [fdCurr])
  const totalPrev = useMemo(() => fdPrev.reduce((s, r) => s + r.plate_total, 0), [fdPrev])

  type GroupAgg = {
    group: string; curr: number; prev: number
    byMonth: Record<string, number>; byMonthPrev: Record<string, number>
  }
  const buildGroupAggs = (curr: TaggedPlateRow[], prev: TaggedPlateRow[]): GroupAgg[] => {
    const m = new Map<string, GroupAgg>()
    const ensure = (g: string) => {
      if (!m.has(g)) m.set(g, { group: g, curr: 0, prev: 0, byMonth: {}, byMonthPrev: {} })
      return m.get(g)!
    }
    // line.จุดประสงค์ is the same field /api/cost/summary grouped by (group_value)
    curr.forEach((row) => {
      row.lines?.forEach((ln) => {
        const e = ensure(getCostGroup(ln.จุดประสงค์))
        e.curr += ln.cost
        e.byMonth[row.month_year] = (e.byMonth[row.month_year] || 0) + ln.cost
      })
    })
    prev.forEach((row) => {
      const aligned = shiftYear(row.month_year, 1)
      row.lines?.forEach((ln) => {
        const e = ensure(getCostGroup(ln.จุดประสงค์))
        e.prev += ln.cost
        e.byMonthPrev[aligned] = (e.byMonthPrev[aligned] || 0) + ln.cost
      })
    })
    return GROUP_ORDER.filter((g) => m.has(g)).map((g) => m.get(g)!)
      .sort((a, b) => b.curr - a.curr)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupAggs = useMemo(() => buildGroupAggs(fdCurr, fdPrev), [fdCurr, fdPrev])

  // Same aggregation over the fleet-filtered but cost-group-UNFILTERED rows.
  // Bucketing is per-group, so every selected group's figures here are identical
  // to groupAggs; the extra entries are exactly the unselected groups, which the
  // slide deck still renders (muted) so the printed page count stays stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupAggsAll = useMemo(() => buildGroupAggs(ffCurr, ffPrev), [ffCurr, ffPrev])
  // denominator for a muted slide's "สัดส่วนของทั้งหมด" — its own group is not in
  // totalCurr under a filter, so measuring it against totalCurr would be nonsense
  const totalAllGroups = useMemo(() => ffCurr.reduce((s, r) => s + r.plate_total, 0), [ffCurr])

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
    // ffCurr/ffPrev, not the raw detail: this slide's header uses groupAggs,
    // which is fleet-filtered. Walking the untagged rows here made the table
    // contradict its own header under a fleet filter.
    //
    // The cost-group filter is deliberately NOT applied: this map is keyed by
    // group, so dropping other groups' lines cannot change a group's own bucket.
    // Skipping it keeps the muted slides of unselected groups populated.
    walk(ffCurr, "curr")
    walk(ffPrev, "prev")

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
  }, [ffCurr, ffPrev])

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
      // Period figures for the matrix's two summary columns. The average is
      // weighted (Σ breakdowns ÷ Σ truck-days), not a mean of the monthly rates —
      // months differ in fleet size and length, so the naive mean is wrong.
      const period = (which: "curr" | "prev") => {
        let bd = 0, truckDays = 0, trucks = 0, n = 0
        for (const my of months) {
          const key = which === "curr" ? my : shiftYear(my, -1)
          const r = find(which === "curr" ? bdCurr : bdPrev, toBdKey(key))
          if (!r) continue
          const tc = Number(r.truck_count)
          bd += Number(r.breakdown_count)
          truckDays += tc * daysInMonth(key)
          if (tc > 0) { trucks += tc; n += 1 }
        }
        return {
          breakdowns: bd,
          rate: truckDays > 0 ? (bd / truckDays) * 100 : null,
          trucks: n > 0 ? Math.round(trucks / n) : null,
        }
      }
      return {
        rows,
        curr: period("curr"),
        prev: period("prev"),
        best:  withP.length ? withP.reduce((b, r) => (r.pCurr! < b.pCurr! ? r : b)) : null,
        worst: withP.length ? withP.reduce((w, r) => (r.pCurr! > w.pCurr! ? r : w)) : null,
      }
    }
    return [
      { key: FLEET_MAP["1"], name: FLEET_MAP["1"], thai: "โม่ใหญ่", ...calc("1") },
      { key: FLEET_MAP["2"], name: FLEET_MAP["2"], thai: "โม่เล็ก", ...calc("2") },
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

  // ── Workshop split: อู่ใน vs อู่นอก (from /api/cost/detail rows) ────────────
  // อู่นอก = คัน-เดือนที่มีรายการ "ค่าแรง" (จ้างซ่อมภายนอก) — same rule as /transaction-detail
  type WsMonth = { nai: number; nok: number; naiPlates: number; nokPlates: number }
  type WsSide = { nai: number; nok: number; naiPlates: number; nokPlates: number; byMonth: Record<string, WsMonth> }
  const wsAgg = useMemo(() => {
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
    // fleet-filtered, like every other slide — the workshop split must follow
    // the pills or it reports the whole company under a single-fleet heading.
    return { curr: agg(fdCurr, false), prev: agg(fdPrev, true) }
  }, [fdCurr, fdPrev])

  const hasWs = fdCurr.length > 0
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

  // ประเภทการซ่อม comes off the MR itself (maint_tasks.repair_type via
  // /api/cost/repair-type), NOT from stockmovement's จุดประสงค์ — see that
  // route for why the two cost bases do not total the same. The rows go through
  // the same plate+month fleet bridge as every other slide so the fleet pills
  // still apply; the warehouse and cost-group chips have no MR equivalent and
  // deliberately do not touch this table.
  const wsByType = useMemo(() => {
    const tagged = tagFleet(rtCurr, fleetMapCurr, flagMapCurr)
    const rows = selectedFleets.size === 0
      ? tagged
      : tagged.filter((r) => selectedFleets.has(r.fleet))
    const m = new Map<string, { type: string; nai: number; nok: number }>()
    rows.forEach((r) => {
      const t = (r.repair_type || "").trim() || "ไม่ระบุประเภท"
      if (isExcludedType(t)) return
      let e = m.get(t)
      if (!e) { e = { type: t, nai: 0, nok: 0 }; m.set(t, e) }
      if (r.garage === "อู่นอก") e.nok += r.total
      else                       e.nai += r.total
    })
    const all = [...m.values()]
      .map((e) => ({ ...e, total: e.nai + e.nok }))
      .sort((a, b) => b.total - a.total)
    const rest = all.slice(5)
    return {
      top: all.slice(0, 5),
      // Kept so the five rows are not mistaken for the whole MR spend.
      rest: rest.length
        ? {
            count: rest.length,
            total: rest.reduce((sum, e) => sum + e.total, 0),
            nai:   rest.reduce((sum, e) => sum + e.nai, 0),
            nok:   rest.reduce((sum, e) => sum + e.nok, 0),
          }
        : null,
      grand: all.reduce((sum, e) => sum + e.total, 0),
    }
  }, [rtCurr, fleetMapCurr, flagMapCurr, selectedFleets])

  // ── Fleet × Month pivot ─────────────────────────────────────────────────────
  // Aggregation only. Office (รถสำนักงาน) cost has ALREADY been split across the
  // fleet rows by allocateOfficeRows, upstream of fdCurr/fdPrev, so BUCKET_OFFICE
  // is normally empty here. Re-allocating at this level would double-count. A
  // BUCKET_OFFICE row is still built (and dropped when zero) so that any cost
  // allocateOfficeRows could not distribute still lands in the รวม.
  type PivotRow = {
    key: string; label: string; color: string; isFleet: boolean
    curr: Record<string, number>; prev: Record<string, number>
    currTotal: number; prevTotal: number
    trucks: Record<string, number>; trucksPrev: Record<string, number>
  }

  const fleetPivot = useMemo(() => {
    // fleet id → "MM-YY" → truck_count, from the MySQL breakdown rows
    const truckIndex = (bd: BDRow[]) => {
      const out: Record<string, Record<string, number>> = {}
      for (const b of bd) {
        const id = String(b.fleet_group_id)
        ;(out[id] ??= {})[b.month_year] = (out[id][b.month_year] ?? 0) + (Number(b.truck_count) || 0)
      }
      return out
    }
    const tCurr = truckIndex(bdCurr), tPrev = truckIndex(bdPrev)

    // fleet id → "YYYY-MM" → cost
    const cost = (rows: TaggedPlateRow[]) => {
      const m: Record<string, Record<string, number>> = {}
      for (const r of rows) {
        const bucket = (m[r.fleet] ??= {})
        bucket[r.month_year] = (bucket[r.month_year] ?? 0) + r.plate_total
      }
      return m
    }
    const cCurr = cost(fdCurr), cPrev = cost(fdPrev)

    const mk = (key: string, isFleet: boolean): PivotRow => {
      const curr: Record<string, number> = {}, prev: Record<string, number> = {}
      const trucks: Record<string, number> = {}, trucksPrev: Record<string, number> = {}
      months.forEach((my) => {
        curr[my] = cCurr[key]?.[my] ?? 0
        prev[my] = cPrev[key]?.[shiftYear(my, -1)] ?? 0
        // trucks are keyed by the current-range month so both year rows line up
        // against the same column; the prev row uses the prior year's own count.
        trucks[my]     = tCurr[key]?.[toBdKey(my)] ?? 0
        trucksPrev[my] = tPrev[key]?.[toBdKey(shiftYear(my, -1))] ?? 0
      })
      return {
        key, label: fleetLabel(key), color: FLEET_COLORS[key] ?? "#9ca3af", isFleet,
        curr, prev,
        currTotal: Object.values(curr).reduce((s, v) => s + v, 0),
        prevTotal: Object.values(prev).reduce((s, v) => s + v, 0),
        trucks, trucksPrev,
      }
    }

    const rows = [
      ...FLEET_ORDER.map((f) => mk(f, true)),
      mk(BUCKET_PARTNER, false),
      mk(BUCKET_NEW, false),
      mk(BUCKET_UNKNOWN, false),
      // Normally allocated away to zero and dropped by the filter below. It is
      // listed so that office cost which could not be allocated (no truck count
      // AND no fleet cost that month) still reaches the รวม row instead of
      // silently undercounting the KPI total.
      mk(BUCKET_OFFICE, false),
    ].filter((r) => r.currTotal !== 0 || r.prevTotal !== 0)

    const totals = {
      curr: {} as Record<string, number>,
      prev: {} as Record<string, number>,
      trucks: {} as Record<string, number>,
      trucksPrev: {} as Record<string, number>,
      currTotal: 0,
      prevTotal: 0,
    }
    months.forEach((my) => {
      totals.curr[my]       = rows.reduce((s, r) => s + (r.curr[my] || 0), 0)
      totals.prev[my]       = rows.reduce((s, r) => s + (r.prev[my] || 0), 0)
      // only real fleets carry a truck count — the three fallback buckets have none
      totals.trucks[my]     = rows.filter((r) => r.isFleet).reduce((s, r) => s + (r.trucks[my] || 0), 0)
      totals.trucksPrev[my] = rows.filter((r) => r.isFleet).reduce((s, r) => s + (r.trucksPrev[my] || 0), 0)
    })
    totals.currTotal = rows.reduce((s, r) => s + r.currTotal, 0)
    totals.prevTotal = rows.reduce((s, r) => s + r.prevTotal, 0)

    return { rows, totals }
  }, [fdCurr, fdPrev, bdCurr, bdPrev, months])

  const [pivotMetric, setPivotMetric] = useState<"total" | "perTruck">("total")

  // null renders as "—" (no truck count), never 0 and never NaN.
  const pivotCell = (
    cost: number,
    trucks: number,
    isFleet: boolean,
  ): number | null => {
    if (pivotMetric === "total") return cost
    return isFleet && trucks > 0 ? cost / trucks : null
  }

  // Range total for the รวม column. In per-truck mode the month cells are
  // ฿/คัน, so the total is cost ÷ total truck-months — the same unit averaged
  // over the range, not a sum of per-truck figures (which would be meaningless).
  const pivotRowTotal = (
    cost: number,
    trucksByMonth: Record<string, number>,
    isFleet: boolean,
  ): number | null => {
    if (pivotMetric === "total") return cost
    if (!isFleet) return null
    const truckMonths = months.reduce((s, my) => s + (trucksByMonth[my] || 0), 0)
    return truckMonths > 0 ? cost / truckMonths : null
  }

  const hasPivot = fleetPivot.rows.length > 0

  // Fastest-growing cost group — used to be the second line of the overview's
  // Key Takeaways box. As a KPI tile it is the same fact at five times the size.
  const topMover = useMemo(() => {
    const withPct = groupAggs
      .map((g) => ({ ...g, pct: pctOf(g.curr, g.prev) }))
      .filter((g) => g.pct !== null && g.prev > 50_000)
    const worst = [...withPct].sort((a, b) => b.pct! - a.pct!)[0]
    return worst && worst.pct! > 0 ? worst : null
  }, [groupAggs])

  // Slides speak Thai, so they date in Buddhist era. The pivot slide already did
  // (year + 543) while every other slide printed 2026 — two calendars in one deck
  // is a guaranteed interruption.
  const yBE = year + 543
  const pBE = prevYear + 543
  const periodTh = `${monthTh(startMonth)}–${monthTh(endMonth)} ${yBE}`
  const unitNote = "หน่วย: บาท (M = ล้าน, K = พัน)"
  const MAX_MONTH_COLS = 12
  const visMonths = months.length > MAX_MONTH_COLS ? months.slice(-MAX_MONTH_COLS) : months
  const trimNote = months.length > MAX_MONTH_COLS
    ? ` · แสดง ${MAX_MONTH_COLS} เดือนล่าสุดจาก ${months.length} เดือน (ยอดรวมเป็นของทั้งช่วง)`
    : ""
  const deltaNote = "▲ แดง = สูงขึ้น · ▼ เขียว = ลดลง"
  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setter(next)
  }

  const toggleFleet = (id: string) =>
    setSelectedFleets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // empty = no filter, matching the warehouse / partner-flag chips, so "Clear"
  // returns the full unfiltered view rather than an empty one
  const toggleAllFleets = () =>
    setSelectedFleets((prev) => (prev.size === 0 ? new Set(FLEET_PILLS) : new Set()))

  const toggleAllGroups = () =>
    setSelectedGroups((prev) => (prev.size === 0 ? new Set(GROUP_ORDER) : new Set()))

  const fmtLabel = (v: any) => {
    const n = Number(v)
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
    return n > 0 ? String(Math.round(n)) : ""
  }

  // ── Export Excel ────────────────────────────────────────────────────────────
  // Every sheet is built from the fleet-tagged, fleet-FILTERED arrays (fdCurr /
  // fdPrev) and the memos the on-screen slides already use — fleetPivot,
  // groupAggs, wsAgg, countsCurrLocal / countsPrevLocal. Re-deriving anything
  // from the raw detCurr / detPrev would bypass the fleet pills and produce a
  // file that silently disagrees with the screen it was exported from.
  //
  // Cell styling is deliberately absent: the community build of xlsx@0.18.5
  // supports only "!cols" — no bold headers, number formats or merges.
  const exportExcel = async () => {
    // xlsx (~276 KB) and file-saver are pulled in on demand, not at page load —
    // same pattern as the html-to-image import in savePng below.
    const XLSX = await import("xlsx")
    const { saveAs } = await import("file-saver")

    const num = (n: number) => +(Number(n) || 0).toFixed(2)
    const yBE = year + 543, pBE = prevYear + 543
    const pctStr = (curr: number, prev: number) => {
      const p = pctOf(curr, prev)
      return p === null ? "" : num(p)
    }

    // ── Sheet 1: สรุป ─────────────────────────────────────────────────────────
    // The filter block leads the sheet on purpose. A workbook gets forwarded and
    // re-read out of context far more readily than the on-screen deck, so a file
    // narrowed to one fleet has to say so on its face.
    const K_ITEM = "รายการ", K_CURR = `ปี ${yBE}`, K_PREV = `ปี ${pBE}`, K_YOY = "YoY %"
    const listOr = (s: Set<string>, label: (v: string) => string) =>
      s.size === 0 ? "ทั้งหมด" : [...s].map(label).join(", ")

    const summaryRows: Record<string, string | number>[] = [
      { [K_ITEM]: "ช่วงเดือน",       [K_CURR]: `${startMonth} ถึง ${endMonth}`, [K_PREV]: "", [K_YOY]: "" },
      { [K_ITEM]: "ฟลีตที่เลือก",    [K_CURR]: listOr(selectedFleets, fleetLabel), [K_PREV]: "", [K_YOY]: "" },
      { [K_ITEM]: "คลังสินค้าที่เลือก", [K_CURR]: listOr(selectedWh, (v) => v), [K_PREV]: "", [K_YOY]: "" },
      { [K_ITEM]: "Partner Flag ที่เลือก", [K_CURR]: listOr(selectedFlag, (v) => v), [K_PREV]: "", [K_YOY]: "" },
      { [K_ITEM]: "กลุ่มต้นทุนที่เลือก", [K_CURR]: listOr(selectedGroups, (g) => GROUP_THAI[g] ?? g), [K_PREV]: "", [K_YOY]: "" },
      { [K_ITEM]: "", [K_CURR]: "", [K_PREV]: "", [K_YOY]: "" },
      { [K_ITEM]: "ค่าใช้จ่ายรวม (฿)", [K_CURR]: num(totalCurr), [K_PREV]: num(totalPrev), [K_YOY]: pctStr(totalCurr, totalPrev) },
      { [K_ITEM]: "จำนวนคัน",         [K_CURR]: countsCurrLocal.plate_count, [K_PREV]: countsPrevLocal.plate_count, [K_YOY]: pctStr(countsCurrLocal.plate_count, countsPrevLocal.plate_count) },
      { [K_ITEM]: "จำนวนใบเบิก (WD)", [K_CURR]: countsCurrLocal.wd_count, [K_PREV]: countsPrevLocal.wd_count, [K_YOY]: pctStr(countsCurrLocal.wd_count, countsPrevLocal.wd_count) },
      { [K_ITEM]: "จำนวนรหัสสินค้า",  [K_CURR]: countsCurrLocal.product_count, [K_PREV]: countsPrevLocal.product_count, [K_YOY]: pctStr(countsCurrLocal.product_count, countsPrevLocal.product_count) },
      { [K_ITEM]: "จำนวนรายการเบิก",  [K_CURR]: num(countsCurrLocal.record_count), [K_PREV]: num(countsPrevLocal.record_count), [K_YOY]: pctStr(countsCurrLocal.record_count, countsPrevLocal.record_count) },
      {
        [K_ITEM]: "ค่าเฉลี่ยต่อคัน (฿)",
        [K_CURR]: countsCurrLocal.plate_count > 0 ? num(totalCurr / countsCurrLocal.plate_count) : "",
        [K_PREV]: countsPrevLocal.plate_count > 0 ? num(totalPrev / countsPrevLocal.plate_count) : "",
        [K_YOY]: countsCurrLocal.plate_count > 0 && countsPrevLocal.plate_count > 0
          ? pctStr(totalCurr / countsCurrLocal.plate_count, totalPrev / countsPrevLocal.plate_count) : "",
      },
      { [K_ITEM]: "ค่าซ่อมอู่ใน (฿)",  [K_CURR]: num(wsAgg.curr.nai), [K_PREV]: num(wsAgg.prev.nai), [K_YOY]: pctStr(wsAgg.curr.nai, wsAgg.prev.nai) },
      { [K_ITEM]: "ค่าซ่อมอู่นอก (฿)", [K_CURR]: num(wsAgg.curr.nok), [K_PREV]: num(wsAgg.prev.nok), [K_YOY]: pctStr(wsAgg.curr.nok, wsAgg.prev.nok) },
    ]
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
    wsSummary["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 18 }, { wch: 12 }]

    // ── Sheet 2: ตามฟลีต — fleet × month, one row per fleet per year ──────────
    const K_FLEET = "ฟลีต", K_YEAR = "ปี", K_TOTAL = "รวม"
    const pivotRow = (label: string, be: number, byMonth: Record<string, number>, total: number) => {
      const o: Record<string, string | number> = { [K_FLEET]: label, [K_YEAR]: be }
      // prev-year cells are already aligned onto the current-range month keys by
      // fleetPivot, so both year rows line up under the same column.
      months.forEach((my) => { o[monthTh(my)] = num(byMonth[my] || 0) })
      o[K_TOTAL] = num(total)
      return o
    }
    const fleetRows = fleetPivot.rows.flatMap((r) => [
      pivotRow(r.label, yBE, r.curr, r.currTotal),
      pivotRow(r.label, pBE, r.prev, r.prevTotal),
    ])
    fleetRows.push(pivotRow("รวมทั้งหมด", yBE, fleetPivot.totals.curr, fleetPivot.totals.currTotal))
    fleetRows.push(pivotRow("รวมทั้งหมด", pBE, fleetPivot.totals.prev, fleetPivot.totals.prevTotal))
    const wsFleet = XLSX.utils.json_to_sheet(fleetRows)
    wsFleet["!cols"] = [{ wch: 16 }, { wch: 8 }, ...months.map(() => ({ wch: 14 })), { wch: 16 }]

    // ── Sheet 3: กลุ่มต้นทุน — cost group × month, both years ─────────────────
    const K_GROUP = "กลุ่มต้นทุน"
    const groupRow = (label: string, be: number, byMonth: Record<string, number>, total: number) => {
      const o: Record<string, string | number> = { [K_GROUP]: label, [K_YEAR]: be }
      months.forEach((my) => { o[monthTh(my)] = num(byMonth[my] || 0) })
      o[K_TOTAL] = num(total)
      return o
    }
    const groupRows = groupAggs.flatMap((g) => [
      groupRow(GROUP_THAI[g.group] ?? g.group, yBE, g.byMonth, g.curr),
      groupRow(GROUP_THAI[g.group] ?? g.group, pBE, g.byMonthPrev, g.prev),
    ])
    const groupTotCurr: Record<string, number> = {}, groupTotPrev: Record<string, number> = {}
    months.forEach((my) => {
      groupTotCurr[my] = groupAggs.reduce((s, g) => s + (g.byMonth[my] || 0), 0)
      groupTotPrev[my] = groupAggs.reduce((s, g) => s + (g.byMonthPrev[my] || 0), 0)
    })
    groupRows.push(groupRow("รวมทั้งหมด", yBE, groupTotCurr, groupAggs.reduce((s, g) => s + g.curr, 0)))
    groupRows.push(groupRow("รวมทั้งหมด", pBE, groupTotPrev, groupAggs.reduce((s, g) => s + g.prev, 0)))
    const wsGroup = XLSX.utils.json_to_sheet(groupRows)
    wsGroup["!cols"] = [{ wch: 22 }, { wch: 8 }, ...months.map(() => ({ wch: 14 })), { wch: 16 }]

    // ── Sheet 4: อู่ใน-อู่นอก — in-house vs outside workshop, per month ───────
    const wsRows = months.map((my) => {
      const c = wsAgg.curr.byMonth[my] ?? { nai: 0, nok: 0, naiPlates: 0, nokPlates: 0 }
      const p = wsAgg.prev.byMonth[my] ?? { nai: 0, nok: 0, naiPlates: 0, nokPlates: 0 }
      const tot = c.nai + c.nok, totP = p.nai + p.nok
      return {
        "เดือน": monthTh(my),
        [`อู่ใน ${yBE} (฿)`]:  num(c.nai),
        [`อู่นอก ${yBE} (฿)`]: num(c.nok),
        [`รวม ${yBE} (฿)`]:    num(tot),
        [`สัดส่วนอู่นอก ${yBE} (%)`]: tot > 0 ? num((c.nok / tot) * 100) : "",
        "คันอู่ใน":  c.naiPlates,
        "คันอู่นอก": c.nokPlates,
        [`อู่ใน ${pBE} (฿)`]:  num(p.nai),
        [`อู่นอก ${pBE} (฿)`]: num(p.nok),
        [`สัดส่วนอู่นอก ${pBE} (%)`]: totP > 0 ? num((p.nok / totP) * 100) : "",
      }
    })
    const totNai = wsAgg.curr.nai, totNok = wsAgg.curr.nok, totAll = totNai + totNok
    const totNaiP = wsAgg.prev.nai, totNokP = wsAgg.prev.nok, totAllP = totNaiP + totNokP
    wsRows.push({
      "เดือน": "รวม",
      [`อู่ใน ${yBE} (฿)`]:  num(totNai),
      [`อู่นอก ${yBE} (฿)`]: num(totNok),
      [`รวม ${yBE} (฿)`]:    num(totAll),
      [`สัดส่วนอู่นอก ${yBE} (%)`]: totAll > 0 ? num((totNok / totAll) * 100) : "",
      "คันอู่ใน":  wsAgg.curr.naiPlates,
      "คันอู่นอก": wsAgg.curr.nokPlates,
      [`อู่ใน ${pBE} (฿)`]:  num(totNaiP),
      [`อู่นอก ${pBE} (฿)`]: num(totNokP),
      [`สัดส่วนอู่นอก ${pBE} (%)`]: totAllP > 0 ? num((totNokP / totAllP) * 100) : "",
    })
    const wsWorkshop = XLSX.utils.json_to_sheet(wsRows)
    wsWorkshop["!cols"] = [{ wch: 10 }, ...Array.from({ length: 9 }, () => ({ wch: 16 }))]

    // ── Sheet 5: รายคัน — plate × month, months as columns ────────────────────
    // isAllocated rows are excluded: they are synthetic office-allocation slices
    // carrying an office plate, not a vehicle. Including them would put phantom
    // trucks in the sheet and make its plate count disagree with the KPI.
    type PlateAgg = { fleet: string; fleetCost: Record<string, number>; byMonth: Record<string, number>; total: number }
    const plateMap = new Map<string, PlateAgg>()
    fdCurr.forEach((r) => {
      if (r.isAllocated || !r.plate) return
      let e = plateMap.get(r.plate)
      if (!e) { e = { fleet: r.fleet, fleetCost: {}, byMonth: {}, total: 0 }; plateMap.set(r.plate, e) }
      e.byMonth[r.month_year] = (e.byMonth[r.month_year] || 0) + r.plate_total
      e.total += r.plate_total
      // a plate can change fleet mid-range; label it with the fleet that carries
      // most of its cost rather than whichever month happened to be seen first
      e.fleetCost[r.fleet] = (e.fleetCost[r.fleet] || 0) + r.plate_total
    })
    const plateRows = [...plateMap.entries()]
      .map(([plate, e]) => {
        const dominant = Object.entries(e.fleetCost).sort((a, b) => b[1] - a[1])[0]?.[0] ?? e.fleet
        const o: Record<string, string | number> = { "ทะเบียน": plate, [K_FLEET]: fleetLabel(dominant) }
        months.forEach((my) => { o[monthTh(my)] = num(e.byMonth[my] || 0) })
        o[K_TOTAL] = num(e.total)
        return o
      })
      .sort((a, b) => Number(b[K_TOTAL]) - Number(a[K_TOTAL]))
    const wsPlate = XLSX.utils.json_to_sheet(plateRows)
    wsPlate["!cols"] = [{ wch: 16 }, { wch: 12 }, ...months.map(() => ({ wch: 14 })), { wch: 16 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsSummary,  "สรุป")
    XLSX.utils.book_append_sheet(wb, wsFleet,    "ตามฟลีต")
    XLSX.utils.book_append_sheet(wb, wsGroup,    "กลุ่มต้นทุน")
    XLSX.utils.book_append_sheet(wb, wsWorkshop, "อู่ใน-อู่นอก")
    XLSX.utils.book_append_sheet(wb, wsPlate,    "รายคัน")

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    saveAs(blob, `mm-report_${startMonth}_${endMonth}.xlsx`)
  }

  // ── Save slide as PNG (16:9 frame, 2x resolution) ───────────────────────────
  const slideRefs = useRef<Record<string, HTMLElement | null>>({})
  const setSlideRef = (key: string) => (el: HTMLElement | null) => { slideRefs.current[key] = el }
  const [savingPng, setSavingPng] = useState<string | null>(null)

  const savePng = async (key: string, name: string) => {
    const el = slideRefs.current[key]
    if (!el) return
    setSavingPng(key)
    let darkRestore = false
    try {
      const { toBlob } = await import("html-to-image")
      // globals.css forces `.dark .bg-white` to a dark grey with !important, so a
      // slide captured in dark mode exports as a dark card sitting in the white
      // frame below. Drop the class for the duration of the capture rather than
      // fighting every overridden utility in CSS.
      const root = document.documentElement
      const wasDark = root.classList.contains("dark")
      if (wasDark) { root.classList.remove("dark"); darkRestore = true }
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h) throw new Error("slide has no size to capture")
      // Fit the whole slide inside the 16:9 frame — nothing may be cropped, the
      // ML/MS break-rate tables sit at the very bottom of their slide and have
      // to survive the export. Rendering at the fitted scale (rather than
      // capturing 1:1 and resizing the bitmap afterwards) keeps text sharp,
      // because html-to-image rasterises from SVG at whatever pixelRatio it is
      // given.
      const fit = Math.min(PNG_FRAME_W / w, PNG_FRAME_H / h)
      const opts = {
        pixelRatio: PNG_SCALE * fit,
        backgroundColor: "#ffffff",
        // slides use system fonts — skip web-font embedding, which throws a
        // CORS SecurityError on the Google Fonts stylesheet and slows capture
        skipFonts: true,
        // keep the PNG button itself out of the capture
        filter: (node: Node) => !(node instanceof HTMLElement && node.dataset.noExport !== undefined),
      }
      // WebKit/Safari: first capture can come back blank — warm up, then capture
      await toBlob(el, opts)
      const shot = await toBlob(el, opts)
      if (!shot) throw new Error("capture returned empty image")

      // Compose onto the 16:9 canvas, centred, with the leftover on either the
      // sides or the top and bottom left white — the slide's own background.
      const img = await loadImage(shot)
      const canvas = document.createElement("canvas")
      canvas.width = PNG_FRAME_W * PNG_SCALE
      canvas.height = PNG_FRAME_H * PNG_SCALE
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("could not open a 2d canvas")
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      // re-derive the scale from the bitmap actually produced: html-to-image
      // floors its canvas dimensions, so the capture can land a pixel or two
      // over the frame it was sized to fit
      const contain = Math.min(canvas.width / img.width, canvas.height / img.height)
      const dw = img.width * contain
      const dh = img.height * contain
      ctx.drawImage(img, Math.round((canvas.width - dw) / 2), Math.round((canvas.height - dh) / 2), dw, dh)
      URL.revokeObjectURL(img.src)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) throw new Error("could not encode the 16:9 frame")
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
      if (darkRestore) document.documentElement.classList.add("dark")
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

  // /api/fleet/plate-map failing is not fatal — fetchAll only throws on the
  // summary call — so the page still renders correct-looking totals while every
  // row silently falls back to ไม่ระบุ and the whole fleet feature is dead. Say
  // so instead of failing quietly.
  const fleetBridgeDown = taggedCurr.length > 0 && Object.keys(fleetMapCurr).length === 0

  // active-filter tags shown on every slide (visible in PDF export too).
  // selectedFleets counts as a filter: without it an exported deck narrowed to
  // one fleet is labelled identically to the full-company deck.
  const hasFilters =
    selectedWh.size > 0 || selectedFlag.size > 0 || selectedFleets.size > 0 || selectedGroups.size > 0
  const FilterTags = ({ note }: { note?: string }) => {
    // Rendering nothing for "no filter" is ambiguous: a full-company slide and a
    // filtered one look identical, and someone always asks which they are seeing.
    if (!hasFilters) return (
      <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[16px] font-medium text-gray-500">
        ทั้งบริษัท (ไม่กรอง)
      </span>
    )
    return (
      <div className="flex max-w-[380px] flex-wrap items-center justify-end gap-1.5">
        <span className="text-[16px] font-semibold text-gray-400">กรอง:</span>
        {/* a full selection shows the same data as an empty one, so it is not a
            filter — rendering 12 chips for it just crowds the box. */}
        {selectedFleets.size < FLEET_PILLS.length && [...selectedFleets].map((g) => (
          <span key={g} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[16px] font-medium text-emerald-700">{fleetLabel(g)}</span>
        ))}
        {/* likewise: all six groups selected is the same view as none */}
        {selectedGroups.size < GROUP_ORDER.length && [...selectedGroups].map((g) => (
          <span key={g} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[16px] font-medium text-violet-700">{GROUP_THAI[g] ?? g}</span>
        ))}
        {[...selectedWh].map((w) => (
          <span key={w} className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-[16px] font-medium text-gray-600">{w}</span>
        ))}
        {[...selectedFlag].map((f) => (
          <span key={f} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[16px] font-medium text-amber-700">{f}</span>
        ))}
        {note && <p className="w-full text-right text-[15px] leading-[21px] text-amber-500">{note}</p>}
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
          <button onClick={exportExcel} disabled={!hasData}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            📊 Export Excel
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

        {/* Row 4: fleet pills — client-side filter only, never triggers a refetch */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
          <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Fleet</span>
          <button onClick={toggleAllFleets}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition hover:bg-gray-50">
            {selectedFleets.size === 0 ? "All" : "Clear"}
          </button>
          {FLEET_PILLS.map((g) => {
            const on = selectedFleets.has(g)
            const color = FLEET_COLORS[g]
            return (
              <button key={g} onClick={() => toggleFleet(g)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  on
                    ? color ? "border-transparent text-white" : "border-gray-700 bg-gray-600 text-white"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
                style={on && color ? { backgroundColor: color, borderColor: color } : {}}>
                {/* disambiguated from the Partner Flag "ไม่ระบุ" chip a row above.
                    The label is overridden here only — BUCKET_LABELS is shared. */}
                {g === BUCKET_UNKNOWN ? "ไม่ระบุฟลีท" : fleetLabel(g)}
              </button>
            )
          })}
        </div>

        {/* Row 5: cost-group chips — client-side, line-level filter (see cgFilter) */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
          <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400">กลุ่มต้นทุน</span>
          <button onClick={toggleAllGroups}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition hover:bg-gray-50">
            {selectedGroups.size === 0 ? "All" : "Clear"}
          </button>
          {GROUP_ORDER.map((g) => {
            const on = selectedGroups.has(g)
            const color = GROUP_COLOR[g]
            return (
              <button key={g} onClick={() => toggleSet(selectedGroups, setSelectedGroups, g)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  on ? "border-transparent text-white" : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
                style={on ? { backgroundColor: color, borderColor: color } : {}}>
                {CHART_SHORT[g] ?? g}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="print:hidden mx-auto mb-4 max-w-[1400px] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {fleetBridgeDown && (
        <div className="mx-auto mb-4 max-w-[1400px] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {fleetBridgeStatus === "empty" ? (
            <>
              ไม่พบข้อมูลจับคู่ทะเบียน–ฟลีท (plate-map) ในช่วงเดือนที่เลือก — ยอดรวมยังถูกต้อง
              แต่ทุกคันจะถูกจัดอยู่ในกลุ่ม “ไม่ระบุฟลีท” และการกรองตามฟลีทจะใช้งานไม่ได้ กรุณาเลือกช่วงเดือนอื่น
            </>
          ) : (
            <>
              ไม่สามารถโหลดข้อมูลจับคู่ทะเบียน–ฟลีท (plate-map) ได้ — ยอดรวมยังถูกต้อง
              แต่ทุกคันจะถูกจัดอยู่ในกลุ่ม “ไม่ระบุฟลีท” และการกรองตามฟลีทจะใช้งานไม่ได้ กรุณากด Generate ใหม่อีกครั้ง
            </>
          )}
        </div>
      )}

      {loading && (
        <div className="print:hidden mx-auto mb-5 max-w-[420px] rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-gray-700">⏳ กำลังโหลดข้อมูล…</p>
            <p className="text-sm tabular-nums text-gray-400">{elapsed.toFixed(1)}ว</p>
          </div>
          <ul className="mt-3 space-y-1.5">
            {LOAD_STAGES.map((s) => {
              const done = stagesDone[s.key]
              // "คำนวณ" genuinely cannot start until both fetch stages land, so
              // it is the one stage with a real not-yet-started state. The two
              // fetch stages are always in flight together while loading.
              const active = !done && (s.key !== "compute" || (stagesDone.cost && stagesDone.fleet))
              return (
                <li key={s.key} className={`flex items-center gap-2 text-[13px] ${
                  done ? "text-gray-700" : active ? "text-gray-500" : "text-gray-300"
                }`}>
                  <span className={done ? "text-emerald-500" : active ? "animate-pulse text-gray-400" : "text-gray-300"}>
                    {done ? "✓" : active ? "●" : "○"}
                  </span>
                  {s.label}
                </li>
              )
            })}
          </ul>
          <p className="mt-3 border-t pt-2.5 text-[11px] text-gray-400">ช่วงเวลากว้างอาจใช้ 3–5 วินาที</p>
        </div>
      )}

      {hasData && (
        <div className="mx-auto flex w-[1440px] flex-col gap-6">

          {/* ══ SLIDE 1: Executive Overview ══════════════════════════════════ */}
          <SlideFrame
            slideRef={setSlideRef("overview")}
            accent="#059669"
            eyebrow="MM Report · Executive Overview"
            title="ต้นทุนงานซ่อมบำรุง แยกตามกลุ่มต้นทุน"
            meta={`${periodTh} เทียบช่วงเดือนเดียวกันของ ${pBE} · ${unitNote} · ที่มา: ใบเบิกอะไหล่จากคลัง (ATMS)`}
            right={<>
              <div className="flex items-center gap-2">
                <p className="text-[18px] leading-[24px] text-gray-300">Slide 1</p>
                <PngButton slideKey="overview" name={`mm-report-1-overview-${year}`} />
              </div>
              <FilterTags />
            </>}
          >
            {/* KPI row */}
            <div className="mb-5 grid h-[144px] shrink-0 grid-cols-4 gap-5">
              <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                <p className="text-[20px] leading-[26px] text-gray-500">ต้นทุนรวม {yBE}</p>
                <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-gray-900">{fmtShort(totalCurr)}</p>
                <p className="text-[18px] leading-[24px] text-gray-400">฿{fmtNum(totalCurr)}</p>
              </div>
              <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                <p className="text-[20px] leading-[26px] text-gray-500">ต้นทุนรวม {pBE}</p>
                <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-gray-400">{fmtShort(totalPrev)}</p>
                <p className="text-[18px] leading-[24px] text-gray-400">฿{fmtNum(totalPrev)}</p>
              </div>
              <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                <p className="text-[20px] leading-[26px] text-gray-500">เทียบปีก่อน (ช่วงเดือนเดียวกัน)</p>
                <p className="mt-0.5 leading-[60px]"><PctBadge pct={pctOf(totalCurr, totalPrev)} size="text-[56px]" /></p>
                <p className="text-[18px] leading-[24px] text-gray-400">
                  {totalPrev > 0 ? `${totalCurr - totalPrev >= 0 ? "+" : "−"}฿${fmtNum(Math.abs(totalCurr - totalPrev))}` : "—"}
                </p>
              </div>
              <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                <p className="text-[20px] leading-[26px] text-gray-500">กลุ่มที่โตเร็วที่สุด</p>
                {topMover ? (
                  <>
                    <p className="mt-0.5 leading-[60px]"><PctBadge pct={topMover.pct} size="text-[56px]" /></p>
                    <p className="truncate text-[18px] leading-[24px] text-gray-500">
                      {GROUP_THAI[topMover.group] ?? topMover.group} · {fmtShort(topMover.prev)} → {fmtShort(topMover.curr)}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-gray-300">—</p>
                )}
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-12 gap-5">
              {/* Monthly stacked chart — top 3 groups + อื่นๆ, total labeled on top */}
              <div className="col-span-7 flex min-h-0 flex-col">
                <p className="text-[22px] font-semibold leading-[30px] text-gray-800">ค่าใช้จ่ายรายเดือน แยกตามกลุ่มต้นทุน</p>
                <p className="mb-2 text-[18px] leading-[24px] text-gray-500">
                  แท่ง = ต้นทุนแต่ละกลุ่ม (ซ้อนกัน) · ตัวเลขบนแท่ง = รวมทั้งเดือน · เส้นประ = ยอดรวมปี {pBE}
                </p>
                <ResponsiveContainer width="100%" height={374}>
                  <ComposedChart data={overviewChart} barCategoryGap="28%" margin={{ top: 28, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 18, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtLabel} tick={{ fontSize: 18, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip
                      formatter={(v: any, n: any) => [`฿${fmtNum(Number(v))}`, n]}
                      labelStyle={{ fontWeight: 600, fontSize: 12 }}
                      contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }}
                    />
                    {/* the "อื่นๆ = …" footnote used to sit under the chart at 10px;
                        folded into the legend it says the same thing legibly */}
                    <Legend formatter={(v) => (
                      <span style={{ fontSize: 18, color: "#6b7280" }}>
                        {v === chartSeries.restLabel && chartSeries.restNote ? `อื่นๆ (${chartSeries.restNote})` : v}
                      </span>
                    )} />
                    {chartSeries.top.map((g, i) => {
                      const isLast = !chartSeries.restLabel && i === chartSeries.top.length - 1
                      return (
                        <Bar key={g.group} dataKey={CHART_SHORT[g.group] ?? g.group} stackId="cg" isAnimationActive={false}
                          fill={GROUP_COLOR[g.group]} radius={isLast ? [4, 4, 0, 0] : 0}>
                          {isLast && (
                            <LabelList dataKey="total" position="top"
                              style={{ fontSize: 20, fill: "#111827", fontWeight: 700 }} formatter={fmtLabel} />
                          )}
                        </Bar>
                      )
                    })}
                    {chartSeries.restLabel && (
                      <Bar dataKey={chartSeries.restLabel} stackId="cg" fill="#cbd5e1" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        <LabelList dataKey="total" position="top"
                          style={{ fontSize: 20, fill: "#111827", fontWeight: 700 }} formatter={fmtLabel} />
                      </Bar>
                    )}
                    <Line dataKey={`รวม ${prevYear}`} type="monotone" stroke="#111827" strokeWidth={3} isAnimationActive={false}
                      strokeDasharray="5 4" dot={{ r: 4, fill: "#111827", strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Comparison table */}
              <div className="col-span-5 flex min-h-0 flex-col">
                <p className="text-[22px] font-semibold leading-[30px] text-gray-800">กลุ่มต้นทุน — เทียบปีก่อน</p>
                <p className="mb-2 text-[18px] leading-[24px] text-gray-500">{deltaNote}</p>
                <table className="w-full table-fixed text-[24px]">
                  <colgroup>
                    <col style={{ width: "40%" }} />
                    <col style={{ width: "17%" }} />
                    <col style={{ width: "17%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "11%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b-2 border-gray-300 text-left text-[18px] leading-[24px] text-gray-500">
                      <th className="py-2 pr-1 font-medium">กลุ่มต้นทุน</th>
                      <th className="py-2 pr-1 text-right font-medium">{yBE}</th>
                      <th className="py-2 pr-1 text-right font-medium">{pBE}</th>
                      <th className="py-2 pr-1 text-right font-medium">±ปีก่อน</th>
                      <th className="py-2 text-right font-medium">สัดส่วน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupAggs.map((g) => (
                      <tr key={g.group} className="border-b border-gray-100 last:border-b-0">
                        <td className="py-2 pr-1 leading-[34px]">
                          <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: GROUP_COLOR[g.group] }} />
                          <span className="align-middle font-medium text-gray-800">{GROUP_THAI[g.group] ?? g.group}</span>
                        </td>
                        <td className="py-2 pr-1 text-right font-semibold leading-[34px] tabular-nums text-gray-900">{fmtShort(g.curr)}</td>
                        <td className="py-2 pr-1 text-right leading-[34px] tabular-nums text-gray-400">{fmtShort(g.prev)}</td>
                        <td className="py-2 pr-1 text-right leading-[34px]"><PctBadge pct={pctOf(g.curr, g.prev)} size="text-[20px]" /></td>
                        <td className="py-2 text-right leading-[34px] tabular-nums text-gray-500">
                          {totalCurr > 0 ? `${(g.curr / totalCurr * 100).toFixed(0)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SlideFrame>

          {/* ══ SLIDE 2: Break Rate (ML / MS) ═════════════════════════════ */}
          {hasBd && (
            <SlideFrame
              slideRef={setSlideRef("breakdown")}
              accent="#059669"
              eyebrow="Fleet Reliability"
              title="Break Rate — อัตราการเสียของรถ"
              meta={`${periodTh} เทียบ ${pBE} · Break Rate = จำนวนครั้งที่รถเสีย ÷ (จำนวนรถ × จำนวนวันในเดือน) × 100 · ยิ่งต่ำยิ่งดี${trimNote}`}
              right={<>
                <div className="flex items-center gap-2">
                  <p className="text-[18px] leading-[24px] text-gray-300">Slide 2</p>
                  <PngButton slideKey="breakdown" name={`mm-report-2-breakdown-${year}`} />
                </div>
                <FilterTags note="* กรองตามฟลีทรถมีนา/รถร่วมได้ — ไม่ตามคลัง (ข้อมูลรถไม่มีมิติคลัง)" />
              </>}
            >
              {/* Trend chart — full slide width now that the insights box is gone */}
              <p className="text-[22px] font-semibold leading-[30px] text-gray-800">
                Break Rate รายเดือน — เส้นทึบ {yBE} · เส้นประ {pBE}
              </p>
              <ResponsiveContainer width="100%" height={258}>
                <ComposedChart data={bdChart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 18, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 18, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip
                    formatter={(v: any, n: any) => [v !== null ? `${Number(v).toFixed(1)}%` : "—", n]}
                    labelStyle={{ fontWeight: 600, fontSize: 12 }}
                    contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }}
                  />
                  <Legend formatter={(v) => <span style={{ fontSize: 18, color: "#6b7280" }}>{v}</span>} />
                  {bdFleets.map((f) => (
                    <React.Fragment key={f.key}>
                      {/* no LabelList: every one of those values is in the matrix
                          below at 32px, where it can actually be read */}
                      <Line dataKey={f.key} name={`${f.key} ${yBE}`} type="monotone" connectNulls isAnimationActive={false}
                        stroke={BD_FLEET_COLOR[f.key]} strokeWidth={3.5}
                        dot={{ r: 5, fill: BD_FLEET_COLOR[f.key], strokeWidth: 0 }} activeDot={{ r: 7 }} />
                      <Line dataKey={`${f.key} ${prevYear}`} name={`${f.key} ${pBE}`} type="monotone" connectNulls isAnimationActive={false}
                        stroke={BD_FLEET_COLOR[f.key]} strokeWidth={2.5} strokeDasharray="5 4" strokeOpacity={0.45}
                        dot={{ r: 3, fill: BD_FLEET_COLOR[f.key], strokeWidth: 0, fillOpacity: 0.45 }} />
                    </React.Fragment>
                  ))}
                </ComposedChart>
              </ResponsiveContainer>

              {/* Month matrix — the two stacked ML/MS cards transposed. Same 24
                  data points, a quarter of the height, and the colour rule that
                  drives them stated instead of implied. */}
              <div className="mt-5 flex items-baseline justify-between">
                <p className="text-[22px] font-semibold leading-[30px] text-gray-800">รายเดือน (%)</p>
                <p className="flex items-center gap-4 text-[18px] leading-[24px] text-gray-500">
                  <span className="text-emerald-700">● ต่ำกว่า 5% ดี</span>
                  <span className="text-amber-600">● 5–10% เฝ้าระวัง</span>
                  <span className="text-red-500">● 10% ขึ้นไป ต้องแก้ไข</span>
                </p>
              </div>
              <table className="mt-1.5 w-full table-fixed border-separate border-spacing-0">
                <colgroup>
                  <col style={{ width: "13.8%" }} />
                  {visMonths.map((my) => <col key={my} style={{ width: `${64.5 / visMonths.length}%` }} />)}
                  <col style={{ width: "7.0%" }} />
                  <col style={{ width: "14.7%" }} />
                </colgroup>
                <thead>
                  <tr className="text-[18px] leading-[24px] text-gray-500">
                    <th className="border-b-2 border-gray-300 py-2 pr-2 text-left font-medium">ฟลีท</th>
                    {visMonths.map((my) => (
                      <th key={my} className="border-b-2 border-gray-300 py-2 text-right font-medium">{monthTh(my)}</th>
                    ))}
                    <th className="border-b-2 border-gray-300 py-2 text-right font-medium">เฉลี่ย</th>
                    <th className="border-b-2 border-gray-300 py-2 text-right font-medium">รวมเสีย (ครั้ง)</th>
                  </tr>
                </thead>
                <tbody>
                  {bdFleets.map((f) => ([
                    <tr key={`${f.key}-c`} className={`${visMonths.length > 8 ? "text-[22px] leading-[30px]" : "text-[24px] leading-[34px]"} tabular-nums`}>
                      <td className="border-b border-gray-100 py-2 pr-2 font-bold" style={{ color: BD_FLEET_COLOR[f.key] }}>
                        {f.key} {yBE}
                      </td>
                      {f.rows.filter((r) => visMonths.includes(r.my)).map((r) => (
                        <td key={r.my} className={`border-b border-gray-100 py-2 text-right font-semibold ${bdPctColor(r.pCurr)}`}>
                          {r.pCurr !== null ? r.pCurr.toFixed(1) : "—"}
                        </td>
                      ))}
                      <td className={`border-b border-gray-100 py-2 text-right font-bold ${bdPctColor(f.curr.rate)}`}>
                        {f.curr.rate !== null ? f.curr.rate.toFixed(1) : "—"}
                      </td>
                      <td className="border-b border-gray-100 py-2 text-right font-semibold text-gray-800">
                        {fmtNum(f.curr.breakdowns)}
                      </td>
                    </tr>,
                    <tr key={`${f.key}-p`} className={`${visMonths.length > 8 ? "text-[22px] leading-[30px]" : "text-[24px] leading-[34px]"} tabular-nums text-gray-400`}>
                      <td className="border-b-2 border-gray-200 py-2 pr-2 font-medium">{f.key} {pBE}</td>
                      {f.rows.filter((r) => visMonths.includes(r.my)).map((r) => (
                        <td key={r.my} className="border-b-2 border-gray-200 py-2 text-right">
                          {r.pPrev !== null ? r.pPrev.toFixed(1) : "—"}
                        </td>
                      ))}
                      <td className="border-b-2 border-gray-200 py-2 text-right font-semibold">
                        {f.prev.rate !== null ? f.prev.rate.toFixed(1) : "—"}
                      </td>
                      <td className="border-b-2 border-gray-200 py-2 text-right">{fmtNum(f.prev.breakdowns)}</td>
                    </tr>,
                  ]))}
                </tbody>
              </table>
              <p className="mt-2 text-[18px] leading-[24px] text-gray-500">
                {bdFleets.map((f) => `${f.key} · ${f.thai}${f.curr.trucks ? ` (เฉลี่ย ${f.curr.trucks} คัน)` : ""}`).join("   ·   ")}
              </p>
            </SlideFrame>
          )}

          {/* ══ SLIDE: อู่ใน vs อู่นอก ════════════════════════════════════════ */}
          {hasWs && (
            <SlideFrame
              slideRef={setSlideRef("workshop")}
              accent="#0284c7"
              eyebrow="Workshop Split"
              title="ค่าซ่อม อู่ใน vs อู่นอก"
              meta={`${periodTh} เทียบ ${pBE} · ${unitNote} · อู่ใน = ซ่อมเองในอู่ (ไม่มีรายการค่าแรง) · อู่นอก = จ้างซ่อมภายนอก (มีรายการค่าแรง)`}
              right={<>
                <div className="flex items-center gap-2">
                  <p className="text-[18px] leading-[24px] text-gray-300">Slide {hasBd ? 3 : 2}</p>
                  <PngButton slideKey="workshop" name={`mm-report-${hasBd ? 3 : 2}-workshop-${year}`} />
                </div>
                <FilterTags />
              </>}
            >
              {/* KPI row */}
              <div className="mb-5 grid h-[144px] shrink-0 grid-cols-4 gap-5">
                <div className="rounded-2xl border-2 border-sky-100 px-5 py-4">
                  <p className="text-[20px] leading-[26px] text-gray-500">อู่ใน {yBE}</p>
                  <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-sky-700">{fmtShort(wsAgg.curr.nai)}</p>
                  <p className="text-[18px] leading-[24px] text-gray-500">
                    รถ {wsAgg.curr.naiPlates} คัน ที่เข้าอู่ใน · {pBE}: {fmtShort(wsAgg.prev.nai)} <PctBadge pct={pctOf(wsAgg.curr.nai, wsAgg.prev.nai)} size="text-[18px]" />
                  </p>
                </div>
                <div className="rounded-2xl border-2 border-orange-100 px-5 py-4">
                  <p className="text-[20px] leading-[26px] text-gray-500">อู่นอก {yBE}</p>
                  <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-orange-600">{fmtShort(wsAgg.curr.nok)}</p>
                  <p className="text-[18px] leading-[24px] text-gray-500">
                    รถ {wsAgg.curr.nokPlates} คัน ที่ส่งอู่นอก · {pBE}: {fmtShort(wsAgg.prev.nok)} <PctBadge pct={pctOf(wsAgg.curr.nok, wsAgg.prev.nok)} size="text-[18px]" />
                  </p>
                </div>
                {/* the decision was in the 12px sub-line and the raw pair was the
                    headline — swapped, so the number that matters is the big one */}
                <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                  <p className="text-[20px] leading-[26px] text-gray-500">อู่นอกแพงกว่าอู่ใน (ต่อคัน)</p>
                  {wsNaiAvg > 0 && wsNokAvg > 0 ? (
                    <>
                      <p className={`mt-0.5 text-[56px] font-bold leading-[60px] ${wsNokAvg >= wsNaiAvg ? "text-red-500" : "text-emerald-600"}`}>
                        {wsNokAvg >= wsNaiAvg ? "+" : "−"}{Math.abs(((wsNokAvg - wsNaiAvg) / wsNaiAvg) * 100).toFixed(0)}%
                      </p>
                      <p className="text-[18px] leading-[24px] text-gray-500">
                        ฿{fmtNum(Math.round(wsNokAvg))} vs ฿{fmtNum(Math.round(wsNaiAvg))} ต่อคัน
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-gray-300">—</p>
                  )}
                </div>
                <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                  <p className="text-[20px] leading-[26px] text-gray-500">สัดส่วนอู่นอก</p>
                  <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-gray-900">{wsShare.toFixed(0)}%</p>
                  <div className="mb-1 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="bg-sky-400" style={{ width: `${100 - wsShare}%` }} />
                    <div className="bg-orange-400" style={{ width: `${wsShare}%` }} />
                  </div>
                  <p className="text-[18px] leading-[24px] text-gray-500">{wsSharePrev !== null ? `ปี ${pBE}: ${wsSharePrev.toFixed(0)}%` : "—"}</p>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-12 gap-5">
                {/* Monthly chart */}
                <div className="col-span-7 flex min-h-0 flex-col">
                  <p className="text-[22px] font-semibold leading-[30px] text-gray-800">ค่าซ่อมรายเดือน</p>
                  <p className="mb-2 text-[18px] leading-[24px] text-gray-500">
                    แท่ง = {yBE} · เส้นประ = {pBE} · เส้นทึบ = จำนวนคัน (แกนขวา)
                  </p>
                  <ResponsiveContainer width="100%" height={374}>
                    <ComposedChart data={wsChart} barCategoryGap="28%" barGap={4} margin={{ top: 24, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 18, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="cost" tickFormatter={fmtLabel} tick={{ fontSize: 18, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={64} />
                      <YAxis yAxisId="plates" orientation="right" allowDecimals={false}
                        tick={{ fontSize: 18, fill: "#a78bfa" }} axisLine={false} tickLine={false} width={48} />
                      <Tooltip
                        formatter={(v: any, n: any) => {
                          if (n === "naiPlates") return [`${v} คัน`, `อู่ใน (คัน)`]
                          if (n === "nokPlates") return [`${v} คัน`, `อู่นอก (คัน)`]
                          const map: Record<string, string> = {
                            auNai: `อู่ใน ${yBE}`, auNok: `อู่นอก ${yBE}`,
                            prevNai: `อู่ใน ${pBE}`, prevNok: `อู่นอก ${pBE}`,
                          }
                          return [`฿${fmtNum(Number(v))}`, map[n] ?? n]
                        }}
                        labelStyle={{ fontWeight: 600, fontSize: 12 }}
                        contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }}
                      />
                      <Legend
                        formatter={(v) => {
                          const map: Record<string, string> = {
                            auNai: `อู่ใน ${yBE}`, auNok: `อู่นอก ${yBE}`,
                            prevNai: `อู่ใน ${pBE}`, prevNok: `อู่นอก ${pBE}`,
                            naiPlates: "อู่ใน (คัน)", nokPlates: "อู่นอก (คัน)",
                          }
                          return <span style={{ fontSize: 18, color: "#6b7280" }}>{map[v] ?? v}</span>
                        }}
                      />
                      <Bar yAxisId="cost" dataKey="auNai" name="auNai" fill="#0ea5e9" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        <LabelList dataKey="auNai" position="top" style={{ fontSize: 18, fill: "#0284c7", fontWeight: 600 }} formatter={fmtLabel} />
                      </Bar>
                      <Bar yAxisId="cost" dataKey="auNok" name="auNok" fill="#f97316" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        <LabelList dataKey="auNok" position="top" style={{ fontSize: 18, fill: "#ea580c", fontWeight: 600 }} formatter={fmtLabel} />
                      </Bar>
                      <Line yAxisId="cost" dataKey="prevNai" name="prevNai" type="monotone" stroke="#0ea5e9" strokeWidth={2.5} isAnimationActive={false}
                        strokeDasharray="5 4" strokeOpacity={0.45} dot={{ r: 3, fill: "#0ea5e9", strokeWidth: 0, fillOpacity: 0.45 }} />
                      <Line yAxisId="cost" dataKey="prevNok" name="prevNok" type="monotone" stroke="#f97316" strokeWidth={2.5} isAnimationActive={false}
                        strokeDasharray="5 4" strokeOpacity={0.45} dot={{ r: 3, fill: "#f97316", strokeWidth: 0, fillOpacity: 0.45 }} />
                      <Line yAxisId="plates" dataKey="naiPlates" name="naiPlates" type="monotone" stroke="#0369a1" isAnimationActive={false}
                        strokeWidth={3} dot={{ r: 4, fill: "#0369a1", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      <Line yAxisId="plates" dataKey="nokPlates" name="nokPlates" type="monotone" stroke="#9a3412" isAnimationActive={false}
                        strokeWidth={3} dot={{ r: 4, fill: "#9a3412", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Repair types — as bars, because the อู่ใน/อู่นอก split is the
                    slide's whole thesis and two columns of fmtShort never showed it */}
                <div className="col-span-5 flex min-h-0 flex-col">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[22px] font-semibold leading-[30px] text-gray-800">ประเภทการซ่อม · Top 5</p>
                    <p className="text-[18px] leading-[24px] tabular-nums text-gray-500">รวม {fmtShort(wsByType.grand)}</p>
                  </div>
                  <p className="mt-1 text-[18px] leading-[24px] text-gray-500">
                    ที่มา: ใบแจ้งซ่อม (MR) — คนละฐานกับการ์ดด้านบนที่มาจากใบเบิกของจากคลัง จึงรวมกันไม่เท่า
                  </p>
                  <p className="text-[18px] leading-[24px] text-gray-500">
                    ไม่รวม: ยาง · อุปกรณ์เสริม · PM ช่างมีนา · งานที่ไม่ใช่การซ่อม (น้ำมัน ล้างรถ ต่อภาษี ตรวจ NGV)
                  </p>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {[...wsByType.top.map((t) => ({ label: t.type, ...t })),
                      ...(wsByType.rest ? [{ label: `อื่นๆ (${wsByType.rest.count} ประเภท)`, ...wsByType.rest }] : [])
                    ].map((t) => (
                      <div key={t.label}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[22px] leading-[28px] text-gray-700" title={t.label}>{t.label}</span>
                          <span className="shrink-0 text-[22px] font-bold leading-[28px] tabular-nums text-gray-900">{fmtShort(t.total)}</span>
                        </div>
                        <div className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="bg-sky-500" style={{ width: `${wsByType.grand > 0 ? (t.nai / wsByType.grand) * 100 : 0}%` }} />
                          <div className="bg-orange-500" style={{ width: `${wsByType.grand > 0 ? (t.nok / wsByType.grand) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 flex items-center gap-4 text-[18px] leading-[24px] text-gray-500">
                    <span><span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-sky-500 align-middle" />อู่ใน</span>
                    <span><span className="mr-1.5 inline-block h-3 w-3 rounded-sm bg-orange-500 align-middle" />อู่นอก</span>
                    <span className="text-gray-400">ความยาวแท่ง = สัดส่วนของยอดรวมทั้งหมด</span>
                  </p>
                </div>
              </div>
            </SlideFrame>
          )}

          {/* ══ SLIDE: ต้นทุนรายฟลีท × เดือน ═══════════════════════════════════ */}
          {hasPivot && (
            <SlideFrame
              slideRef={setSlideRef("fleetPivot")}
              accent="#4f46e5"
              eyebrow="Fleet × Month"
              title="ต้นทุนรายฟลีท แยกตามเดือน"
              meta={pivotMetric === "perTruck"
                ? `${periodTh} · หน่วย: บาท/คัน (หารด้วยจำนวนรถของฟลีทในเดือนนั้น · — = ไม่มีข้อมูลจำนวนรถ) · ${deltaNote}${trimNote}`
                : `${periodTh} · ${unitNote} · ค่าใช้จ่ายรถสำนักงานเฉลี่ยเข้าแต่ละฟลีทตามจำนวนรถแล้ว · ${deltaNote}${trimNote}`}
              right={<>
                <div className="flex items-center gap-2">
                  <p className="text-[18px] leading-[24px] text-gray-300">Slide {2 + (hasBd ? 1 : 0) + (hasWs ? 1 : 0)}</p>
                  <PngButton slideKey="fleetPivot" name={`mm-report-${2 + (hasBd ? 1 : 0) + (hasWs ? 1 : 0)}-fleet-pivot-${year}`} />
                </div>
                <FilterTags />
              </>}
            >
              {/* metric toggle — data-no-export, it is a control, not content.
                  It used to bake two pill buttons into every PNG, and their
                  selected state was the file's only clue to the unit. That now
                  lives in the header meta line above. */}
              <div data-no-export className="print:hidden mb-3 flex shrink-0 items-center gap-1.5">
                {([["total", "ต้นทุนรวม"], ["perTruck", "ต้นทุนต่อคัน"]] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setPivotMetric(m)}
                    className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
                      pivotMetric === m
                        ? "border-indigo-500 bg-indigo-500 text-white"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* table-fixed + colgroup: widths are declared, so the table cannot
                  outgrow the slide. It used to sit in overflow-x-auto, where the
                  columns that scrolled out of view were dropped from the PNG with
                  nothing to show they were missing. */}
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border-2 border-gray-200">
                <table className="w-full table-fixed border-separate border-spacing-0 text-[22px]">
                  <colgroup>
                    <col style={{ width: "12.2%" }} />
                    {visMonths.map((my) => <col key={my} style={{ width: `${64.5 / visMonths.length}%` }} />)}
                    <col style={{ width: "8.4%" }} />
                    <col style={{ width: "7.6%" }} />
                    <col style={{ width: "7.3%" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50 text-[18px] leading-[24px]">
                      <th className="border-b-2 border-r px-3 py-2 text-left font-semibold text-gray-500">ฟลีท</th>
                      {visMonths.map((my) => (
                        <th key={my} className="border-b-2 px-1.5 py-2 text-right font-semibold text-gray-500">
                          {monthTh(my)}
                        </th>
                      ))}
                      <th className="border-b-2 border-l px-1.5 py-2 text-right font-semibold text-gray-500">รวม {yBE}</th>
                      <th className="border-b-2 px-1.5 py-2 text-right font-semibold text-gray-500">รวม {pBE}</th>
                      <th className="border-b-2 px-1.5 py-2 text-right font-semibold text-gray-500">±ปีก่อน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleetPivot.rows.map((r, idx) => {
                      const prevRow = fleetPivot.rows[idx - 1]
                      // divider where the fleet rows end and the fallback buckets begin
                      const startsBuckets = !r.isFleet && (!prevRow || prevRow.isFleet)
                      const muted = r.isFleet ? "" : "text-gray-400"
                      const cell = (v: number | null, extra: string) =>
                        v === null
                          ? <span className="text-gray-300">—</span>
                          // v !== 0, not v > 0: a credit/adjustment makes a month
                          // negative, and hiding it as "—" while it still counts
                          // in the รวม makes the row visibly not add up.
                          : <span className={extra}>{v !== 0 ? fmtShort(v) : "—"}</span>
                      const currTotal = pivotRowTotal(r.currTotal, r.trucks, r.isFleet)
                      const prevTotal = pivotRowTotal(r.prevTotal, r.trucksPrev, r.isFleet)
                      return (
                        <React.Fragment key={r.key}>
                          {startsBuckets && (
                            <tr>
                              <td colSpan={visMonths.length + 4}
                                className="border-t-2 border-gray-300 bg-gray-50 px-3 py-1.5 text-[18px] leading-[24px] text-gray-400">
                                กลุ่มที่จับคู่ทะเบียนกับฟลีทไม่ได้ (นับรวมในยอดรวมด้านล่าง)
                              </td>
                            </tr>
                          )}
                          <tr className="leading-[31px]">
                            <td className="border-b border-r px-3 py-1.5 align-middle">
                              <div className="flex items-center gap-2">
                                {r.isFleet && (
                                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                                )}
                                <span className={`truncate ${r.isFleet ? "font-bold text-gray-800" : "font-medium text-gray-400"}`} title={r.label}>
                                  {r.label}
                                </span>
                              </div>
                            </td>
                            {visMonths.map((my) => (
                              <td key={my} className={`border-b px-1.5 py-1.5 text-right tabular-nums ${muted || "text-gray-800"}`}>
                                {cell(pivotCell(r.curr[my] || 0, r.trucks[my] || 0, r.isFleet), "font-semibold")}
                              </td>
                            ))}
                            <td className={`border-b border-l px-1.5 py-1.5 text-right tabular-nums ${muted || "text-gray-900"}`}>
                              {cell(currTotal, "font-bold")}
                            </td>
                            <td className="border-b px-1.5 py-1.5 text-right tabular-nums text-gray-400">
                              {cell(prevTotal, "")}
                            </td>
                            <td className="border-b px-1.5 py-1.5 text-right">
                              <PctBadge pct={currTotal !== null && prevTotal !== null ? pctOf(currTotal, prevTotal) : null} size="text-[20px]" />
                            </td>
                          </tr>
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const tCurr = pivotRowTotal(fleetPivot.totals.currTotal, fleetPivot.totals.trucks, true)
                      const tPrev = pivotRowTotal(fleetPivot.totals.prevTotal, fleetPivot.totals.trucksPrev, true)
                      const foot = (v: number | null) =>
                        v === null || v === 0 ? <span className="text-gray-300">—</span> : fmtShort(v)
                      return (
                        <tr className="bg-gray-50 leading-[34px]">
                          <td className="border-r border-t-2 border-gray-300 px-3 py-2 text-[24px] font-bold text-gray-900">รวม</td>
                          {visMonths.map((my) => (
                            <td key={my} className="border-t-2 border-gray-300 px-1.5 py-2 text-right text-[24px] font-bold tabular-nums text-gray-900">
                              {foot(pivotCell(fleetPivot.totals.curr[my] || 0, fleetPivot.totals.trucks[my] || 0, true))}
                            </td>
                          ))}
                          <td className="border-l border-t-2 border-gray-300 px-1.5 py-2 text-right text-[24px] font-bold tabular-nums text-gray-900">
                            {foot(tCurr)}
                          </td>
                          <td className="border-t-2 border-gray-300 px-1.5 py-2 text-right text-[24px] font-semibold tabular-nums text-gray-500">
                            {foot(tPrev)}
                          </td>
                          <td className="border-t-2 border-gray-300 px-1.5 py-2 text-right">
                            <PctBadge pct={tCurr !== null && tPrev !== null ? pctOf(tCurr, tPrev) : null} size="text-[20px]" />
                          </td>
                        </tr>
                      )
                    })()}
                  </tfoot>
                </table>
              </div>
            </SlideFrame>
          )}

          {/* ══ SLIDES 3+: one per cost group ═════════════════════════════════ */}
          {/* groupAggsAll, not groupAggs: an unselected group keeps its slide so
              the printed page count does not move with the filter. It renders
              muted with a badge rather than as a chart of zeros, which would
              read as a data fault. */}
          {groupAggsAll.map((g, idx) => {
            const picked = selectedGroups.size === 0 || selectedGroups.has(g.group)
            const det = detailByGroup.get(g.group)
            const monthly = months.map((my) => ({
              month: MONTH_LABEL[my.split("-")[1]] ?? my,
              curr:  g.byMonth[my] || 0,
              prev:  g.byMonthPrev[my] || 0,
            }))
            // a muted group is not part of totalCurr, so it is measured against
            // the cost-group-unfiltered total instead
            const denom = picked ? totalCurr : totalAllGroups
            const share = denom > 0 ? (g.curr / denom) * 100 : 0
            // biggest item mover (needs meaningful prev base)
            const mover = det?.items
              .filter((it) => it.prev > 20_000 || it.curr > 20_000)
              .sort((a, b) => Math.abs(b.curr - b.prev) - Math.abs(a.curr - a.prev))[0]
            return (
              <SlideFrame
                key={g.group}
                slideRef={setSlideRef(`cg-${g.group}`)}
                muted={!picked}
                accent={GROUP_COLOR[g.group]}
                eyebrow="Cost Group Breakdown"
                title={<span className="flex items-center gap-3">
                  <span className="inline-block h-5 w-5 rounded-full" style={{ background: GROUP_COLOR[g.group] }} />
                  {GROUP_THAI[g.group] ?? g.group}
                  {!picked && (
                    <span className="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-[18px] font-semibold text-gray-500">
                      ไม่ได้เลือกในตัวกรอง
                    </span>
                  )}
                </span>}
                meta={`${g.group} · ${periodTh} เทียบ ${pBE} · ${unitNote} · ${deltaNote}`}
                right={<>
                  <div className="flex items-center gap-2">
                    <p className="text-[18px] leading-[24px] text-gray-300">Slide {idx + 2 + (hasBd ? 1 : 0) + (hasWs ? 1 : 0) + (hasPivot ? 1 : 0)}</p>
                    <PngButton
                      slideKey={`cg-${g.group}`}
                      name={`mm-report-${idx + 2 + (hasBd ? 1 : 0) + (hasWs ? 1 : 0) + (hasPivot ? 1 : 0)}-${g.group.split(" - ")[0].replace(/\s+/g, "").toLowerCase()}-${year}`}
                    />
                  </div>
                  <FilterTags />
                </>}
              >
                {/* group KPIs */}
                <div className="mb-5 grid h-[144px] shrink-0 grid-cols-4 gap-5">
                  <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                    <p className="text-[20px] leading-[26px] text-gray-500">ต้นทุน {yBE}</p>
                    <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-gray-900">{fmtShort(g.curr)}</p>
                    <p className="text-[18px] leading-[24px] text-gray-400">฿{fmtNum(g.curr)}</p>
                  </div>
                  <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                    <p className="text-[20px] leading-[26px] text-gray-500">ต้นทุน {pBE}</p>
                    <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-gray-400">{fmtShort(g.prev)}</p>
                    <p className="text-[18px] leading-[24px] text-gray-400">฿{fmtNum(g.prev)}</p>
                  </div>
                  <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                    <p className="text-[20px] leading-[26px] text-gray-500">เทียบปีก่อน</p>
                    <p className="mt-0.5 leading-[60px]"><PctBadge pct={pctOf(g.curr, g.prev)} size="text-[56px]" /></p>
                    <p className="text-[18px] leading-[24px] text-gray-400">
                      {g.prev > 0 ? `${g.curr - g.prev >= 0 ? "+" : "−"}฿${fmtNum(Math.abs(g.curr - g.prev))}` : "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl border-2 border-gray-200 px-5 py-4">
                    <p className="text-[20px] leading-[26px] text-gray-500">สัดส่วนของต้นทุนซ่อมบำรุงทั้งหมด</p>
                    <p className="mt-0.5 text-[56px] font-bold leading-[60px] text-gray-900">{share.toFixed(1)}%</p>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, background: GROUP_COLOR[g.group] }} />
                    </div>
                  </div>
                </div>

                {/* three columns instead of three stacked bands — that is what
                    buys the height back for the type scale */}
                <div className="grid min-h-0 flex-1 grid-cols-12 gap-5">
                  {/* monthly trend */}
                  <div className="col-span-4 flex min-h-0 flex-col">
                    <p className="text-[22px] font-semibold leading-[30px] text-gray-800">รายเดือน {yBE} vs {pBE}</p>
                    {/* the Insight box became this line — same fact, half the height */}
                    <p className="mb-2 line-clamp-2 text-[18px] leading-[24px] text-gray-500">
                      {mover
                        ? `ตัวขับเคลื่อนหลัก: ${mover.name} ${fmtShort(mover.prev)} → ${fmtShort(mover.curr)}`
                        : `แท่ง = ${yBE} · เส้นประ = ${pBE}`}
                    </p>
                    <ResponsiveContainer width="100%" height={338}>
                      <ComposedChart data={monthly} barCategoryGap="30%" margin={{ top: 24, right: 8, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 18, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={fmtLabel} tick={{ fontSize: 18, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={62} />
                        <Tooltip formatter={(v: any, n: any) => [`฿${fmtNum(Number(v))}`, n === "curr" ? `${yBE}` : `${pBE}`]}
                          contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }} />
                        <Bar dataKey="curr" fill={GROUP_COLOR[g.group]} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                          <LabelList dataKey="curr" position="top" style={{ fontSize: 18, fill: "#6b7280", fontWeight: 600 }} formatter={fmtLabel} />
                        </Bar>
                        <Line dataKey="prev" type="monotone" stroke="#111827" strokeWidth={3} isAnimationActive={false}
                          strokeDasharray="5 4" dot={{ r: 3.5, fill: "#111827", strokeWidth: 0 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* top product groups — as bars, same device as slide 3 */}
                  <div className="col-span-3 flex min-h-0 flex-col">
                    <p className="text-[22px] font-semibold leading-[30px] text-gray-800">Top กลุ่มสินค้า</p>
                    <p className="mb-3 text-[18px] leading-[24px] text-gray-500">ความยาวแท่ง = เทียบกลุ่มที่มากที่สุด</p>
                    {det?.pgs.length ? (
                      <div className="flex flex-col gap-3">
                        {det.pgs.slice(0, 6).map((pg) => {
                          const w = det.pgs[0].curr > 0 ? (pg.curr / det.pgs[0].curr) * 100 : 0
                          return (
                            <div key={pg.pg}>
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-[22px] leading-[28px] text-gray-700" title={pg.pg}>{pg.pg}</span>
                                <span className="shrink-0 text-[22px] font-bold leading-[28px] tabular-nums text-gray-900">{fmtShort(pg.curr)}</span>
                              </div>
                              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(w, 100)}%`, background: GROUP_COLOR[g.group] }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="py-6 text-center text-[20px] text-gray-300">ไม่มีข้อมูล detail</p>
                    )}
                  </div>

                  {/* top items — 3 columns, not 7. SKU code, product group and a
                      unitless quantity all went: unreadable at projection size,
                      and the group rollup is the panel immediately to the left. */}
                  <div className="col-span-5 flex min-h-0 flex-col">
                    <p className="text-[22px] font-semibold leading-[30px] text-gray-800">Top 5 รายการ</p>
                    <p className="mb-2 text-[18px] leading-[24px] text-gray-500">เรียงตามต้นทุน {yBE}</p>
                    {det && det.items.length > 0 ? (
                      <table className="w-full table-fixed text-[24px]">
                        <colgroup>
                          <col style={{ width: "58%" }} />
                          <col style={{ width: "24%" }} />
                          <col style={{ width: "18%" }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b-2 border-gray-300 text-left text-[18px] leading-[24px] text-gray-500">
                            <th className="py-2 pr-2 font-medium">ชื่อสินค้า</th>
                            <th className="py-2 pr-2 text-right font-medium">{yBE}</th>
                            <th className="py-2 text-right font-medium">±ปีก่อน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {det.items.slice(0, 5).map((it) => (
                            <tr key={`${it.pg}|${it.code}`} className="border-b border-gray-100 last:border-b-0">
                              <td className="truncate py-2.5 pr-2 leading-[34px] text-gray-700" title={`${it.code} · ${it.name}`}>{it.name}</td>
                              <td className="py-2.5 pr-2 text-right font-semibold leading-[34px] tabular-nums text-gray-900">{fmtShort(it.curr)}</td>
                              <td className="py-2.5 text-right leading-[34px]"><PctBadge pct={pctOf(it.curr, it.prev)} size="text-[20px]" /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="py-6 text-center text-[20px] text-gray-300">ไม่มีข้อมูล detail</p>
                    )}
                  </div>
                </div>
              </SlideFrame>
            )
          })}
        </div>
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
