"use client"

import React, { useEffect, useState, useMemo, useRef } from "react"
import { ChevronDown, ChevronUp, Info, X, Download } from "lucide-react"
import * as XLSX from "xlsx"

// ── Types ──────────────────────────────────────────────────────────────────────

type Row = {
  request_id:   number
  request_code: string
  reported_at:  string
  branch:       string
  plate_no:     string
  owner_type:   string
  mechanic:     string
  parts_group:  string
  part:         string
  qty:          number
  unit_price:   number
  total:        number
  อู่:          string
  แหล่งอะไหล่: string
  remark:       string | null
}

type SummaryItem = {
  _id:        string
  total_cost: number
  count:      number
}

type PivotCostItem = {
  _id: { sortKey: string; label: string; source: string }
  total: number
}

type PivotCountItem = {
  _id: { sortKey: string; label: string; garage: string }
  count: number
}

type PriceCompItem = {
  _id:        { parts_group: string; part: string; source: string }
  total_cost: number
  total_qty:  number
  count:      number
}

type LaborPivotItem = {
  _id:   { sortKey: string; label: string; branch: string; parts_group: string; part: string }
  total: number
  count: number
}

type ApiResponse = {
  success:     boolean
  count:       number
  totalCount:  number
  summary:     SummaryItem[]
  pivotCost:   PivotCostItem[]
  pivotCount:  PivotCountItem[]
  priceComp:   PriceCompItem[]
  laborPivot:  LaborPivotItem[]
  filters:     { branches: string[]; sources: string[]; garages: string[]; partsGroups: string[] }
  data:        Row[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined) {
  if (v == null || isNaN(v)) return "—"
  return v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const MONTH_TH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

function labelToDisplay(label: string) {
  // "01/2026" → "ม.ค. 26"
  const [mm, yyyy] = label.split("/")
  return `${MONTH_TH[parseInt(mm)]} ${yyyy.slice(2)}`
}

const SOURCE_COLOR: Record<string, string> = {
  "อะไหล่คลัง":         "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "อะไหล่ศูนย์/อู่นอก": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "ค่าแรง":              "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
}

const GARAGE_COLOR: Record<string, string> = {
  "อู่ใน":  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "อู่นอก": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
}

// ── Pivot builder ──────────────────────────────────────────────────────────────

type PivotRow = { key: string; label: string; byMonth: Record<string, number>; total: number }

type PivotData = {
  months:    { sortKey: string; label: string; display: string }[]
  costRows:  PivotRow[]
  countRows: PivotRow[]
  ratioRow:  PivotRow
}

function buildPivot(pivotCost: PivotCostItem[], pivotCount: PivotCountItem[]): PivotData {
  // Collect all unique months in order
  const monthMap = new Map<string, string>()
  for (const r of pivotCost)  monthMap.set(r._id.sortKey, r._id.label)
  for (const r of pivotCount) monthMap.set(r._id.sortKey, r._id.label)
  const months = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sortKey, label]) => ({ sortKey, label, display: labelToDisplay(label) }))

  const COST_SOURCES = ["อะไหล่คลัง", "อะไหล่ศูนย์/อู่นอก", "ค่าแรง"] as const
  const COST_LABELS  = ["อะไหล่คลัง (฿)", "อะไหล่ศูนย์/อู่นอก (฿)", "ค่าแรงอู่นอก (฿)"]

  const costRows = COST_SOURCES.map((src, i) => {
    const byMonth: Record<string, number> = {}
    for (const r of pivotCost) {
      if (r._id.source === src) byMonth[r._id.sortKey] = (byMonth[r._id.sortKey] ?? 0) + r.total
    }
    const total = Object.values(byMonth).reduce((s, v) => s + v, 0)
    return { key: src, label: COST_LABELS[i], byMonth, total }
  })

  const GARAGES       = ["อู่ใน", "อู่นอก"] as const
  const GARAGE_LABELS = ["Count อู่ใน (request)", "Count อู่นอก (request)"]

  const countRows = GARAGES.map((g, i) => {
    const byMonth: Record<string, number> = {}
    for (const r of pivotCount) {
      if (r._id.garage === g) byMonth[r._id.sortKey] = (byMonth[r._id.sortKey] ?? 0) + r.count
    }
    const total = Object.values(byMonth).reduce((s, v) => s + v, 0)
    return { key: g, label: GARAGE_LABELS[i], byMonth, total }
  })

  // Derived: ค่าแรงอู่นอก (฿) ÷ Count อู่นอก (request) per month
  const laborRow     = costRows.find(r => r.key === "ค่าแรง")!
  const outerGarageRow = countRows.find(r => r.key === "อู่นอก")!
  const ratioByMonth: Record<string, number> = {}
  const allKeys = new Set([...Object.keys(laborRow.byMonth), ...Object.keys(outerGarageRow.byMonth)])
  for (const k of allKeys) {
    const cnt = outerGarageRow.byMonth[k] ?? 0
    if (cnt > 0) ratioByMonth[k] = (laborRow.byMonth[k] ?? 0) / cnt
  }
  const ratioRow: PivotRow = {
    key:     "ratio",
    label:   "ค่าแรง / Count อู่นอก (฿/req)",
    byMonth: ratioByMonth,
    total:   outerGarageRow.total > 0 ? laborRow.total / outerGarageRow.total : 0,
  }

  return { months, costRows, countRows, ratioRow }
}

// ── MultiSelect ────────────────────────────────────────────────────────────────

function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const label = value.length === 0
    ? placeholder
    : value.length === 1
      ? value[0]
      : `${value[0]} +${value.length - 1}`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 min-w-[160px] max-w-[220px] truncate"
      >
        <span className="flex-1 text-left truncate">{label}</span>
        {value.length > 0 && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange([]) }}
            className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={13} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1d27] shadow-lg py-1 max-h-64 overflow-y-auto">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-gray-700 dark:accent-white"
              />
              <span className="truncate">{opt}</span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">ไม่มีตัวเลือก</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Logic Documentation ────────────────────────────────────────────────────────

function LogicPanel() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-950/20 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-semibold text-sm">
          <Info size={15} />
          Data Source &amp; Processing Logic
        </div>
        {open ? <ChevronUp size={15} className="text-blue-500" /> : <ChevronDown size={15} className="text-blue-500" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 text-sm text-gray-700 dark:text-gray-300">

          {/* Data Source */}
          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">📂 Data Source</h3>
            <p>ข้อมูลมาจาก 2 ตาราง export จาก ATMS ระบบซ่อมบำรุง:</p>
            <ul className="mt-1.5 ml-4 list-disc space-y-0.5 text-gray-600 dark:text-gray-400">
              <li><code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">full_parts.csv</code> — รายการอะไหล่และค่าแรงต่อ request</li>
              <li><code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">full_header.csv</code> — ข้อมูลหัว request: สาขา, ทะเบียน, ช่างซ่อม, วันที่แจ้ง</li>
            </ul>
            <p className="mt-2">
              Join ด้วย <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">request_id</code>{" "}
              → drop แถวที่ <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">mechanic = พจส.ซ่อมเอง</code>{" "}
              → upload ไปยัง <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">atms.repair-analysis</code>{" "}
              ผ่าน <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">parts_analysis.ipynb</code>
            </p>
          </section>

          {/* อู่ column */}
          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">🏗️ คอลัมน์ <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">อู่</code></h3>
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-gray-100 dark:bg-white/5">
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">เงื่อนไข</th>
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">ค่า</th>
              </tr></thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 border border-gray-200 dark:border-white/10">request_id มี parts_group = <strong>ค่าแรง</strong> อย่างน้อย 1 แถว</td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-white/10"><span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 font-medium">อู่นอก</span></td>
                </tr>
                <tr>
                  <td className="px-3 py-2 border border-gray-200 dark:border-white/10">request_id ไม่มี ค่าแรง เลย</td>
                  <td className="px-3 py-2 border border-gray-200 dark:border-white/10"><span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 font-medium">อู่ใน</span></td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* แหล่งอะไหล่ rules */}
          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              📦 คอลัมน์ <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded">แหล่งอะไหล่</code>
              <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">(5 rules เรียงตามลำดับความสำคัญ)</span>
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-gray-100 dark:bg-white/5">
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10 w-6">#</th>
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">เงื่อนไข</th>
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">ค่า</th>
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">Applied</th>
              </tr></thead>
              <tbody>
                {([
                  { n:"1", cond:"อู่ == อู่ใน",                                                           val:"อะไหล่คลัง",         cls: SOURCE_COLOR["อะไหล่คลัง"],         where:"Python (notebook)" },
                  { n:"2", cond:"อู่ == อู่นอก + remark มี 'มีนาจัดอะไหล่' + parts_group ≠ ค่าแรง",    val:"อะไหล่คลัง",         cls: SOURCE_COLOR["อะไหล่คลัง"],         where:"Python (notebook)" },
                  { n:"3", cond:"NaN ที่เหลือ + อู่ == อู่นอก",                                           val:"อะไหล่ศูนย์/อู่นอก", cls: SOURCE_COLOR["อะไหล่ศูนย์/อู่นอก"], where:"Python (notebook)" },
                  { n:"4", cond:"parts_group = 'ค่าแรง' — override ทุกแถว",                              val:"ค่าแรง",             cls: SOURCE_COLOR["ค่าแรง"],             where:"Python (notebook)" },
                  { n:"5", cond:"parts_group = 'ยาง' — override แถว ศูนย์/อู่นอก → คลัง (ยางสำรองจาก warehouse)", val:"อะไหล่คลัง", cls: SOURCE_COLOR["อะไหล่คลัง"],     where:"API pipeline ($addFields)" },
                ] as { n:string; cond:string; val:string; cls:string; where:string }[]).map(r => (
                  <tr key={r.n} className={r.n === "5" ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}>
                    <td className="px-3 py-2 border border-gray-200 dark:border-white/10 text-gray-400 font-medium">{r.n}</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-white/10">{r.cond}</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-white/10">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.cls}`}>{r.val}</span>
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-white/10 text-gray-400 whitespace-nowrap">{r.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              * Rule 5 ถูก apply ใน MongoDB aggregation pipeline ก่อน filter ทุกตัว — ข้อมูลใน Collection ยังเก็บค่าเดิม แต่ทุก query บนหน้านี้เห็นค่าที่ถูก correct แล้ว
            </p>
          </section>

          {/* Views */}
          <section>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">📊 มุมมองข้อมูลบนหน้านี้</h3>
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-gray-100 dark:bg-white/5">
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">ตาราง</th>
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">Row</th>
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">Column</th>
                <th className="text-left px-3 py-2 border border-gray-200 dark:border-white/10">ค่า</th>
              </tr></thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                {([
                  { t:"Pivot รายเดือน",             r:"แหล่งอะไหล่",          c:"เดือน-ปี", v:"มูลค่า (฿) · Count request · อัตราค่าแรง (฿/request)" },
                  { t:"ค่าแรงอู่นอก รายสาขา",       r:"สาขา",                 c:"เดือน-ปี", v:"มูลค่าค่าแรง (฿)" },
                  { t:"ราคาเฉลี่ย คลัง vs ศูนย์",  r:"parts_group → part",   c:"—",         v:"Weighted avg price (total_cost/qty) + indicator" },
                  { t:"Row Data",                   r:"แต่ละรายการ",           c:"—",         v:"ทุก field · server-side search · paginate 50 แถว" },
                ] as { t:string; r:string; c:string; v:string }[]).map(r => (
                  <tr key={r.t}>
                    <td className="px-3 py-2 border border-gray-200 dark:border-white/10 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.t}</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-white/10 whitespace-nowrap">{r.r}</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-white/10 whitespace-nowrap">{r.c}</td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-white/10">{r.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

        </div>
      )}
    </div>
  )
}

// ── Pivot Table ────────────────────────────────────────────────────────────────

function PivotTable({ pivot }: { pivot: PivotData }) {
  const { months, costRows, countRows, ratioRow } = pivot

  const thBase = "px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100 dark:border-white/8"
  const thLeft = "px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100 dark:border-white/8"
  const tdBase = "px-3 py-2 text-right text-xs tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap"
  const tdLeft = "px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-white whitespace-nowrap"
  const tdTotal = "px-3 py-2 text-right text-xs font-bold tabular-nums text-gray-900 dark:text-white whitespace-nowrap bg-gray-50 dark:bg-white/3"

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-white/8">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Pivot Table — รายเดือน</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">มูลค่าแหล่งอะไหล่ (฿) และจำนวน request แยกตามอู่</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-white/3">
              <th className={`${thLeft} sticky left-0 bg-gray-50 dark:bg-[#0f1117] z-10 min-w-[180px]`}>รายการ</th>
              {months.map(m => (
                <th key={m.sortKey} className={thBase}>{m.display}</th>
              ))}
              <th className={`${thBase} bg-gray-100 dark:bg-white/5`}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {/* Cost rows */}
            {costRows.map((row, ri) => (
              <tr key={row.key} className={`border-t border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors ${ri === costRows.length - 1 ? "border-b-2 border-gray-200 dark:border-white/10" : ""}`}>
                <td className={`${tdLeft} sticky left-0 bg-white dark:bg-[#0f1117] z-10`}>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLOR[row.key] ?? "bg-gray-100 text-gray-600"}`}>
                    {row.label}
                  </span>
                </td>
                {months.map(m => (
                  <td key={m.sortKey} className={tdBase}>
                    {row.byMonth[m.sortKey] ? fmt(row.byMonth[m.sortKey]) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                ))}
                <td className={tdTotal}>{fmt(row.total)}</td>
              </tr>
            ))}

            {/* Count rows */}
            {countRows.map(row => (
              <tr key={row.key} className="border-t border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                <td className={`${tdLeft} sticky left-0 bg-white dark:bg-[#0f1117] z-10`}>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${GARAGE_COLOR[row.key] ?? "bg-gray-100 text-gray-600"}`}>
                    {row.label}
                  </span>
                </td>
                {months.map(m => (
                  <td key={m.sortKey} className={tdBase}>
                    {row.byMonth[m.sortKey] ? fmt(row.byMonth[m.sortKey]) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                ))}
                <td className={tdTotal}>{fmt(row.total)}</td>
              </tr>
            ))}

            {/* Ratio row: ค่าแรงอู่นอก ÷ Count อู่นอก */}
            <tr className="border-t-2 border-gray-200 dark:border-white/10 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 transition-colors">
              <td className={`${tdLeft} sticky left-0 bg-white dark:bg-[#0f1117] z-10`}>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                  {ratioRow.label}
                </span>
              </td>
              {months.map(m => (
                <td key={m.sortKey} className={tdBase}>
                  {ratioRow.byMonth[m.sortKey]
                    ? fmt(ratioRow.byMonth[m.sortKey])
                    : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
              ))}
              <td className={`${tdTotal} bg-violet-50 dark:bg-violet-950/20`}>{fmt(ratioRow.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Labor Pivot Table ──────────────────────────────────────────────────────────

type LaborPartRow   = { part: string; byMonth: Record<string, number>; byCount: Record<string, number>; total: number; totalCount: number }
type LaborGroupRow  = { parts_group: string; byMonth: Record<string, number>; byCount: Record<string, number>; total: number; totalCount: number; parts: LaborPartRow[] }
type LaborBranchRow = { branch: string; byMonth: Record<string, number>; byCount: Record<string, number>; total: number; totalCount: number; groups: LaborGroupRow[] }

function buildLaborPivot(items: LaborPivotItem[]) {
  const monthMap = new Map<string, string>()
  for (const r of items) monthMap.set(r._id.sortKey, r._id.label)
  const months = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sortKey, label]) => ({ sortKey, label, display: labelToDisplay(label) }))

  // branch → parts_group → part → month → { total, count }
  type Cell = { total: number; count: number }
  type Nest = Map<string, Map<string, Map<string, Cell>>>
  const tree = new Map<string, Nest>()
  for (const r of items) {
    const { branch, parts_group, part, sortKey } = r._id
    if (!tree.has(branch)) tree.set(branch, new Map())
    const pgMap = tree.get(branch)!
    if (!pgMap.has(parts_group)) pgMap.set(parts_group, new Map())
    const partMap = pgMap.get(parts_group)!
    if (!partMap.has(part)) partMap.set(part, new Map())
    const mMap = partMap.get(part)!
    const prev = mMap.get(sortKey) ?? { total: 0, count: 0 }
    mMap.set(sortKey, { total: prev.total + r.total, count: prev.count + r.count })
  }

  const sumR  = (bm: Record<string, number>) => Object.values(bm).reduce((s, v) => s + v, 0)
  const merge = (maps: Record<string, number>[]) => {
    const out: Record<string, number> = {}
    for (const m of maps) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v
    return out
  }

  const branchRows: LaborBranchRow[] = [...tree.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([branch, pgMap]) => {
      const groups: LaborGroupRow[] = [...pgMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([parts_group, partMap]) => {
          const parts: LaborPartRow[] = [...partMap.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([part, mMap]) => {
              const byMonth: Record<string, number> = {}
              const byCount: Record<string, number> = {}
              for (const [k, v] of mMap.entries()) { byMonth[k] = v.total; byCount[k] = v.count }
              return { part, byMonth, byCount, total: sumR(byMonth), totalCount: sumR(byCount) }
            })
          const byMonth = merge(parts.map(p => p.byMonth))
          const byCount = merge(parts.map(p => p.byCount))
          return { parts_group, byMonth, byCount, total: sumR(byMonth), totalCount: sumR(byCount), parts }
        })
      const byMonth = merge(groups.map(g => g.byMonth))
      const byCount = merge(groups.map(g => g.byCount))
      return { branch, byMonth, byCount, total: sumR(byMonth), totalCount: sumR(byCount), groups }
    })

  const totalByMonth = merge(branchRows.map(r => r.byMonth))
  const totalByCount = merge(branchRows.map(r => r.byCount))
  const grandTotal   = sumR(totalByMonth)
  const grandCount   = sumR(totalByCount)

  return { months, branchRows, totalByMonth, totalByCount, grandTotal, grandCount }
}

function LaborPivotTable({ items }: { items: LaborPivotItem[] }) {
  const { months, branchRows, totalByMonth, totalByCount, grandTotal, grandCount } = useMemo(() => buildLaborPivot(items), [items])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (items.length === 0) return null

  const toggle = (key: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const thBase = "px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100 dark:border-white/8"
  const thLeft = "px-3 py-2.5 text-left  text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100 dark:border-white/8"
  const dash   = <span className="text-gray-300 dark:text-gray-600">—</span>

  const Cell = ({ v, c, bold = false }: { v?: number; c?: number; bold?: boolean }) =>
    v ? (
      <div className="flex flex-col items-end gap-0.5">
        <span className={bold ? "font-semibold" : ""}>{fmt(v)}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{c ?? 0} ครั้ง</span>
      </div>
    ) : dash

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-white/8">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">ค่าแรงอู่นอก — รายสาขา × เดือน</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">มูลค่าค่าแรงอู่นอก (฿) · คลิกสาขา หรือ parts_group เพื่อขยาย</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-white/3">
              <th className={`${thLeft} sticky left-0 bg-gray-50 dark:bg-[#0f1117] z-10 min-w-[240px]`}>สาขา / หมวด / รายการ</th>
              {months.map(m => <th key={m.sortKey} className={thBase}>{m.display}</th>)}
              <th className={`${thBase} bg-gray-100 dark:bg-white/5`}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {branchRows.map(branch => {
              const branchOpen = expanded.has(branch.branch)
              return (
                <React.Fragment key={branch.branch}>
                  {/* ── Level 1: Branch ── */}
                  <tr
                    onClick={() => toggle(branch.branch)}
                    className="border-t border-gray-100 dark:border-white/8 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/3 transition-colors"
                  >
                    <td className="px-3 py-2 text-left text-xs font-bold text-gray-900 dark:text-white whitespace-nowrap sticky left-0 bg-white dark:bg-[#0f1117] z-10">
                      <span className="flex items-center gap-1.5">
                        {branchOpen ? <ChevronDown size={12} className="text-gray-400 shrink-0" /> : <ChevronUp size={12} className="text-gray-400 shrink-0 rotate-180" />}
                        {branch.branch}
                      </span>
                    </td>
                    {months.map(m => (
                      <td key={m.sortKey} className="px-3 py-2 text-right text-xs tabular-nums text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        <Cell v={branch.byMonth[m.sortKey]} c={branch.byCount[m.sortKey]} bold />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-900 dark:text-white whitespace-nowrap bg-gray-50 dark:bg-white/3">
                      <Cell v={branch.total} c={branch.totalCount} bold />
                    </td>
                  </tr>

                  {branchOpen && branch.groups.map(grp => {
                    const grpKey = `${branch.branch}|${grp.parts_group}`
                    const grpOpen = expanded.has(grpKey)
                    return (
                      <React.Fragment key={grpKey}>
                        {/* ── Level 2: parts_group ── */}
                        <tr
                          onClick={() => toggle(grpKey)}
                          className="border-t border-gray-50 dark:border-white/5 cursor-pointer bg-gray-50/40 dark:bg-white/[0.018] hover:bg-gray-50 dark:hover:bg-white/3 transition-colors"
                        >
                          <td className="pl-7 pr-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap sticky left-0 bg-gray-50/40 dark:bg-[#0f1117] z-10">
                            <span className="flex items-center gap-1.5">
                              {grpOpen ? <ChevronDown size={11} className="text-gray-400 shrink-0" /> : <ChevronUp size={11} className="text-gray-400 shrink-0 rotate-180" />}
                              {grp.parts_group}
                            </span>
                          </td>
                          {months.map(m => (
                            <td key={m.sortKey} className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              <Cell v={grp.byMonth[m.sortKey]} c={grp.byCount[m.sortKey]} />
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right text-xs tabular-nums text-gray-700 dark:text-gray-200 whitespace-nowrap bg-gray-50 dark:bg-white/3">
                            <Cell v={grp.total} c={grp.totalCount} />
                          </td>
                        </tr>

                        {/* ── Level 3: part ── */}
                        {grpOpen && grp.parts.map(p => (
                          <tr key={p.part} className="border-t border-gray-50 dark:border-white/[0.04] bg-white dark:bg-white/[0.008]">
                            <td className="pl-12 pr-3 py-1 text-left text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap sticky left-0 bg-white dark:bg-[#0f1117] z-10 max-w-[260px] truncate" title={p.part}>
                              {p.part}
                            </td>
                            {months.map(m => (
                              <td key={m.sortKey} className="px-3 py-1 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                <Cell v={p.byMonth[m.sortKey]} c={p.byCount[m.sortKey]} />
                              </td>
                            ))}
                            <td className="px-3 py-1 text-right text-xs tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap bg-gray-50 dark:bg-white/3">
                              <Cell v={p.total} c={p.totalCount} />
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })}

            {/* Grand total */}
            <tr className="border-t-2 border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/3">
              <td className="px-3 py-2 text-left text-xs font-bold text-gray-900 dark:text-white sticky left-0 bg-gray-50 dark:bg-[#0f1117] z-10">รวมทั้งหมด</td>
              {months.map(m => (
                <td key={m.sortKey} className="px-3 py-2 text-right text-xs tabular-nums text-gray-900 dark:text-white whitespace-nowrap">
                  <Cell v={totalByMonth[m.sortKey]} c={totalByCount[m.sortKey]} bold />
                </td>
              ))}
              <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-900 dark:text-white whitespace-nowrap bg-gray-100 dark:bg-white/5">
                <Cell v={grandTotal} c={grandCount} bold />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Price Comparison Pivot ─────────────────────────────────────────────────────

type SourceEntry = { avgPrice: number; count: number; total_cost: number }

type PartPrices = {
  part:  string
  คลัง:  SourceEntry | null
  ศูนย์: SourceEntry | null
}

type GroupPrices = { partsGroup: string; parts: PartPrices[] }

function buildPriceGroups(items: PriceCompItem[]): GroupPrices[] {
  const map = new Map<string, Map<string, PartPrices>>()
  for (const item of items) {
    const { parts_group, part, source } = item._id
    if (!map.has(parts_group)) map.set(parts_group, new Map())
    const pm = map.get(parts_group)!
    if (!pm.has(part)) pm.set(part, { part, คลัง: null, ศูนย์: null })
    const e   = pm.get(part)!
    const avg = item.total_qty > 0 ? item.total_cost / item.total_qty : 0
    if (source === "อะไหล่คลัง")          e.คลัง  = { avgPrice: avg, count: item.count, total_cost: item.total_cost }
    if (source === "อะไหล่ศูนย์/อู่นอก")  e.ศูนย์ = { avgPrice: avg, count: item.count, total_cost: item.total_cost }
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([partsGroup, pm]) => ({
      partsGroup,
      parts: [...pm.values()].sort((a, b) => a.part.localeCompare(b.part)),
    }))
}

function PriceCompTable({ items }: { items: PriceCompItem[] }) {
  const groups    = useMemo(() => buildPriceGroups(items), [items])
  const allGroups = useMemo(() => groups.map(g => g.partsGroup), [groups])

  type CompFilter  = "all" | "คลัง" | "ศูนย์" | "ใกล้เคียง"
  type RangeFilter = "all" | "low" | "mid" | "high"

  const [selGroups,  setSelGroups]  = useState<string[]>([])
  const [partQ,      setPartQ]      = useState("")
  const [compFilter,   setCompFilter]   = useState<CompFilter>("all")
  const [diffFilter,   setDiffFilter]   = useState<RangeFilter>("all")
  const [valFilter,    setValFilter]    = useState<RangeFilter>("all")
  const [impactFilter, setImpactFilter] = useState<RangeFilter>("all")
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set())

  // Expand all when data changes
  useEffect(() => { setExpanded(new Set(allGroups)) }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleGroup(g: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s })
  }

  function getDiffPct(p: PartPrices): number {
    const kp = p.คลัง?.avgPrice ?? null
    const sp = p.ศูนย์?.avgPrice ?? null
    if (kp === null || sp === null) return 0
    return Math.abs(((kp - sp) / Math.max(sp, 0.01)) * 100)
  }

  function getComp(p: PartPrices): CompFilter {
    const kp = p.คลัง?.avgPrice ?? null
    const sp = p.ศูนย์?.avgPrice ?? null
    if (kp === null || sp === null) return "all"
    const pct = getDiffPct(p)
    if (pct < 1) return "ใกล้เคียง"
    return kp > sp ? "คลัง" : "ศูนย์"
  }

  function getTotalValue(p: PartPrices): number {
    return Math.abs((p.คลัง?.avgPrice ?? 0) - (p.ศูนย์?.avgPrice ?? 0))
  }

  function getImpact(p: PartPrices): number {
    const kp = p.คลัง?.avgPrice ?? null
    const sp = p.ศูนย์?.avgPrice ?? null
    if (kp === null || sp === null) return 0
    const pct = Math.abs(((kp - sp) / Math.max(sp, 0.01)) * 100)
    if (pct < 1) return 0
    const n = kp > sp ? (p.คลัง?.count ?? 0) : (p.ศูนย์?.count ?? 0)
    return Math.abs(kp - sp) * n
  }

  const visible = useMemo(() => {
    return groups
      .filter(g => selGroups.length === 0 || selGroups.includes(g.partsGroup))
      .map(g => ({
        ...g,
        parts: g.parts
          .filter(p => {
            if (p.คลัง === null || p.ศูนย์ === null) return false
            if (partQ.trim() && !p.part.toLowerCase().includes(partQ.toLowerCase())) return false
            if (compFilter !== "all" && getComp(p) !== compFilter) return false
            const pct = getDiffPct(p)
            if (diffFilter === "low"  && pct >= 25)              return false
            if (diffFilter === "mid"  && (pct < 25 || pct >= 75)) return false
            if (diffFilter === "high" && pct < 75)               return false
            const val = getTotalValue(p)
            if (valFilter === "low"  && val >= 200)              return false
            if (valFilter === "mid"  && (val < 200 || val >= 5_000)) return false
            if (valFilter === "high" && val < 5_000)             return false
            const impact = getImpact(p)
            if (impactFilter === "low"  && impact >= 1_000)              return false
            if (impactFilter === "mid"  && (impact < 1_000 || impact >= 20_000)) return false
            if (impactFilter === "high" && impact < 20_000)              return false
            return true
          })
          .sort((a, b) => getImpact(b) - getImpact(a)),
      }))
      .filter(g => g.parts.length > 0)
      .sort((a, b) => {
        const sumImpact = (parts: PartPrices[]) => parts.reduce((s, p) => s + getImpact(p), 0)
        return sumImpact(b.parts) - sumImpact(a.parts)
      })
  }, [groups, selGroups, partQ, compFilter, diffFilter, valFilter, impactFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const th = "px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100 dark:border-white/8"
  const td = "px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap"

  function exportExcel() {
    const rows = visible.flatMap(group =>
      group.parts.map(p => {
        const kp   = p.คลัง?.avgPrice  ?? null
        const sp   = p.ศูนย์?.avgPrice ?? null
        const diff = kp !== null && sp !== null ? kp - sp : null
        const pct  = kp !== null && sp !== null
          ? Math.abs(((kp - sp) / Math.max(sp, 0.01)) * 100)
          : null
        const comp = pct == null ? "—"
          : pct < 1 ? "ใกล้เคียง"
          : kp! > sp! ? "คลัง แพงกว่า"
          : "ศูนย์ แพงกว่า"
        const impactNExport = kp !== null && sp !== null && pct !== null && pct >= 1
          ? (kp > sp ? (p.คลัง?.count ?? 0) : (p.ศูนย์?.count ?? 0))
          : 0
        const impactValExport = kp !== null && sp !== null && pct !== null && pct >= 1
          ? +Math.abs(kp - sp) * impactNExport
          : ""
        return {
          "parts_group":           group.partsGroup,
          "part":                  p.part,
          "avg คลัง (฿)":          kp != null ? +kp.toFixed(2) : "",
          "count คลัง":            p.คลัง?.count ?? "",
          "avg ศูนย์/อู่นอก (฿)":  sp != null ? +sp.toFixed(2) : "",
          "count ศูนย์":           p.ศูนย์?.count ?? "",
          "ส่วนต่าง (฿)":          diff != null ? +Math.abs(diff).toFixed(2) : "",
          "ส่วนต่าง (%)":          pct  != null ? +pct.toFixed(2)  : "",
          "เปรียบเทียบ":           comp,
          "ส่วนต่าง×n (฿)":        impactValExport,
        }
      })
    )
    const ws = XLSX.utils.json_to_sheet(rows)
    ws["!cols"] = [
      { wch: 20 }, { wch: 40 }, { wch: 16 }, { wch: 10 },
      { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 16 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Price Comparison")
    XLSX.writeFile(wb, "price_comparison.xlsx")
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-white/8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">ราคาเฉลี่ย — คลัง vs ศูนย์/อู่นอก</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">เปรียบเทียบราคาเฉลี่ยต่อหน่วย (weighted avg) แยกตาม parts_group → part</p>
        </div>
        <button
          onClick={exportExcel}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shrink-0"
        >
          <Download size={13} />
          Export Excel
        </button>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-white/8 space-y-3">
        {/* Row 1: search inputs + clear */}
        <div className="flex flex-wrap gap-3 items-center">
          <MultiSelect options={allGroups} value={selGroups} onChange={setSelGroups} placeholder="ทุก parts_group" />
          <div className="relative">
            <input
              value={partQ}
              onChange={e => setPartQ(e.target.value)}
              placeholder="ค้นหาชื่ออะไหล่..."
              className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 w-56"
            />
            {partQ && (
              <button onClick={() => setPartQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={12} />
              </button>
            )}
          </div>
          {(selGroups.length > 0 || partQ || compFilter !== "all" || diffFilter !== "all" || valFilter !== "all" || impactFilter !== "all") && (
            <button
              onClick={() => { setSelGroups([]); setPartQ(""); setCompFilter("all"); setDiffFilter("all"); setValFilter("all"); setImpactFilter("all") }}
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>

        {/* Row 2: pill groups */}
        <div className="flex flex-wrap gap-4 items-start">
          {/* เปรียบเทียบ */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">เปรียบเทียบ</span>
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden text-xs">
              {([
                { key: "all",       label: "ทั้งหมด",       cls: "bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300" },
                { key: "คลัง",      label: "คลัง แพงกว่า",  cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" },
                { key: "ศูนย์",     label: "ศูนย์ แพงกว่า", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
                { key: "ใกล้เคียง", label: "ใกล้เคียง",     cls: "bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400" },
              ] as { key: CompFilter; label: string; cls: string }[]).map((opt, i) => (
                <button key={opt.key} onClick={() => setCompFilter(opt.key)}
                  className={`px-3 py-1.5 whitespace-nowrap transition-colors ${i > 0 ? "border-l border-gray-200 dark:border-white/10" : ""} ${compFilter === opt.key ? opt.cls : "bg-white dark:bg-white/3 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* แพงกว่า % */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">แพงกว่า %</span>
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden text-xs">
              {([
                { key: "all",  label: "ทั้งหมด" },
                { key: "low",  label: "< 25%"   },
                { key: "mid",  label: "25–75%"  },
                { key: "high", label: "> 75%"   },
              ] as { key: RangeFilter; label: string }[]).map((opt, i) => (
                <button key={opt.key} onClick={() => setDiffFilter(opt.key)}
                  className={`px-3 py-1.5 whitespace-nowrap transition-colors ${i > 0 ? "border-l border-gray-200 dark:border-white/10" : ""} ${diffFilter === opt.key ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400" : "bg-white dark:bg-white/3 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ส่วนต่างราคา ฿ */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">ส่วนต่างราคา (฿)</span>
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden text-xs">
              {([
                { key: "all",  label: "ทั้งหมด"  },
                { key: "low",  label: "< 200"     },
                { key: "mid",  label: "200–5,000" },
                { key: "high", label: "> 5,000"   },
              ] as { key: RangeFilter; label: string }[]).map((opt, i) => (
                <button key={opt.key} onClick={() => setValFilter(opt.key)}
                  className={`px-3 py-1.5 whitespace-nowrap transition-colors ${i > 0 ? "border-l border-gray-200 dark:border-white/10" : ""} ${valFilter === opt.key ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400" : "bg-white dark:bg-white/3 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ส่วนต่าง×n ฿ */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">ส่วนต่าง×n (฿)</span>
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden text-xs">
              {([
                { key: "all",  label: "ทั้งหมด"     },
                { key: "low",  label: "< 1,000"      },
                { key: "mid",  label: "1,000–20,000" },
                { key: "high", label: "> 20,000"     },
              ] as { key: RangeFilter; label: string }[]).map((opt, i) => (
                <button key={opt.key} onClick={() => setImpactFilter(opt.key)}
                  className={`px-3 py-1.5 whitespace-nowrap transition-colors ${i > 0 ? "border-l border-gray-200 dark:border-white/10" : ""} ${impactFilter === opt.key ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" : "bg-white dark:bg-white/3 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[560px]">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-gray-50 dark:bg-[#13151f]">
              <th className={`${th} text-left sticky left-0 top-0 bg-gray-50 dark:bg-[#13151f] z-30 min-w-[260px]`}>parts_group / part</th>
              <th className={`${th} text-right bg-emerald-50 dark:bg-emerald-950/40`}>avg คลัง (฿)</th>
              <th className={`${th} text-right bg-emerald-50 dark:bg-emerald-950/40`}>n</th>
              <th className={`${th} text-right bg-blue-50 dark:bg-blue-950/40`}>avg ศูนย์/อู่นอก (฿)</th>
              <th className={`${th} text-right bg-blue-50 dark:bg-blue-950/40`}>n</th>
              <th className={`${th} text-right bg-gray-50 dark:bg-[#13151f] min-w-[150px]`}>เปรียบเทียบ</th>
              <th className={`${th} text-right bg-orange-50 dark:bg-orange-950/20 min-w-[110px]`}>ส่วนต่าง (฿)</th>
              <th className={`${th} text-right bg-orange-50 dark:bg-orange-950/20 min-w-[140px]`}>ส่วนต่าง×n (฿) ↓</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(group => (
              <React.Fragment key={group.partsGroup}>
                {/* Group header — click to expand/collapse */}
                {(() => {
                  const groupImpact = group.parts.reduce((s, p) => s + getImpact(p), 0)
                  return (
                    <tr
                      className="cursor-pointer bg-gray-50/70 dark:bg-white/2 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                      onClick={() => toggleGroup(group.partsGroup)}
                    >
                      <td className="px-3 py-2.5 sticky left-0 bg-gray-50/80 dark:bg-[#13151f] z-10" colSpan={7}>
                        <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white">
                          <span className="text-gray-400 text-[10px] w-3 shrink-0">{expanded.has(group.partsGroup) ? "▾" : "▸"}</span>
                          {group.partsGroup}
                          <span className="font-normal text-gray-400">({group.parts.length} รายการ)</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-bold tabular-nums text-orange-600 dark:text-orange-400 bg-orange-50/60 dark:bg-orange-950/20 whitespace-nowrap">
                        {groupImpact > 0 ? fmt(groupImpact) : <span className="text-gray-300 dark:text-gray-600 font-normal">—</span>}
                      </td>
                    </tr>
                  )
                })()}

                {/* Part rows */}
                {expanded.has(group.partsGroup) && group.parts.map(p => {
                  const kp = p.คลัง?.avgPrice ?? null
                  const sp = p.ศูนย์?.avgPrice ?? null
                  const kHigh = kp !== null && sp !== null && kp > sp
                  const sHigh = kp !== null && sp !== null && sp > kp

                  let indicator: React.ReactNode = <span className="text-gray-300 dark:text-gray-600">—</span>
                  if (kp !== null && sp !== null) {
                    const pct = Math.abs(((kp - sp) / Math.max(sp, 0.01)) * 100)
                    if (pct < 1) {
                      indicator = <span className="text-gray-400">ใกล้เคียง</span>
                    } else if (kp > sp) {
                      indicator = <span className="px-2 py-0.5 rounded-full font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">คลัง +{pct.toFixed(1)}%</span>
                    } else {
                      indicator = <span className="px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">ศูนย์ +{pct.toFixed(1)}%</span>
                    }
                  }

                  const impactN = kp !== null && sp !== null
                    ? (kp > sp ? (p.คลัง?.count ?? 0) : (p.ศูนย์?.count ?? 0))
                    : 0
                  const pctForImpact = kp !== null && sp !== null
                    ? Math.abs(((kp - sp) / Math.max(sp, 0.01)) * 100)
                    : 0
                  const impactVal = kp !== null && sp !== null && pctForImpact >= 1
                    ? Math.abs(kp - sp) * impactN
                    : null

                  return (
                    <tr key={p.part} className="border-t border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                      <td className="px-3 py-2 sticky left-0 bg-white dark:bg-[#0f1117] z-10 max-w-[260px]">
                        <div className="flex items-center gap-1.5 pl-4">
                          <span className="text-gray-300 dark:text-gray-600 shrink-0 select-none">└</span>
                          <span className="truncate text-gray-700 dark:text-gray-300" title={p.part}>{p.part}</span>
                        </div>
                      </td>
                      <td className={`${td} ${kHigh ? "bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 font-semibold" : "text-gray-700 dark:text-gray-300"}`}>
                        {kp !== null ? fmt(kp) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className={`${td} text-gray-400 dark:text-gray-500`}>{p.คลัง?.count ?? "—"}</td>
                      <td className={`${td} ${sHigh ? "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 font-semibold" : "text-gray-700 dark:text-gray-300"}`}>
                        {sp !== null ? fmt(sp) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className={`${td} text-gray-400 dark:text-gray-500`}>{p.ศูนย์?.count ?? "—"}</td>
                      <td className={`${td}`}>{indicator}</td>
                      <td className={`${td} text-orange-700 dark:text-orange-300`}>
                        {kp !== null && sp !== null
                          ? fmt(Math.abs(kp - sp))
                          : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className={`${td} font-medium ${impactVal ? "text-orange-600 dark:text-orange-400" : ""}`}>
                        {impactVal != null ? fmt(impactVal) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-400">ไม่พบข้อมูล</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RepairAnalysisPage() {
  const PAGE_SIZE = 50

  const [data,       setData]       = useState<Row[]>([])
  const [summary,    setSummary]    = useState<SummaryItem[]>([])
  const [pivotCost,  setPivotCost]  = useState<PivotCostItem[]>([])
  const [pivotCount, setPivotCount] = useState<PivotCountItem[]>([])
  const [priceComp,  setPriceComp]  = useState<PriceCompItem[]>([])
  const [laborPivot, setLaborPivot] = useState<LaborPivotItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [filters,    setFilters]    = useState<ApiResponse["filters"]>({ branches: [], sources: [], garages: [], partsGroups: [] })
  const [loading,    setLoading]    = useState(true)
  const [searchInput, setSearchInput] = useState("")
  const [search,      setSearch]      = useState("")
  const [page,        setPage]        = useState(0)

  const [branches,    setBranches]    = useState<string[]>([])
  const [sources,     setSources]     = useState<string[]>([])
  const [garages,     setGarages]     = useState<string[]>([])
  const [partsGroups, setPartsGroups] = useState<string[]>([])

  // Debounce the raw input → committed search (400 ms)
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const params = new URLSearchParams()
      if (branches.length)    params.set("branch",     branches.join(","))
      if (sources.length)     params.set("source",     sources.join(","))
      if (garages.length)     params.set("garage",     garages.join(","))
      if (partsGroups.length) params.set("partsGroup", partsGroups.join(","))
      if (search)             params.set("search",     search)
      const res  = await fetch(`/api/repair-analysis?${params}`)
      const json: ApiResponse = await res.json()
      if (json.success) {
        setData(json.data)
        setTotalCount(json.totalCount)
        setSummary(json.summary)
        setPivotCost(json.pivotCost)
        setPivotCount(json.pivotCount)
        setPriceComp(json.priceComp)
        setLaborPivot(json.laborPivot)
        setFilters(json.filters)
        setPage(0)
      }
      setLoading(false)
    }
    load()
  }, [branches, sources, garages, partsGroups, search])

  const pivot    = useMemo(() => buildPivot(pivotCost, pivotCount), [pivotCost, pivotCount])
  const pageCount = Math.max(1, Math.ceil(data.length / PAGE_SIZE))
  const pageRows  = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalCost = summary.reduce((s, r) => s + r.total_cost, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Repair Analysis</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          ข้อมูลการซ่อมบำรุงจาก ATMS — จำแนกตามแหล่งอะไหล่และประเภทอู่
        </p>
      </div>

      {/* Logic Documentation */}
      <LogicPanel />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <MultiSelect
          options={filters.branches}
          value={branches}
          onChange={setBranches}
          placeholder="ทุกสาขา"
        />
        <MultiSelect
          options={filters.sources}
          value={sources}
          onChange={setSources}
          placeholder="ทุกแหล่งอะไหล่"
        />
        <MultiSelect
          options={filters.garages}
          value={garages}
          onChange={setGarages}
          placeholder="ทุกอู่"
        />
        <MultiSelect
          options={filters.partsGroups}
          value={partsGroups}
          onChange={setPartsGroups}
          placeholder="ทุก parts_group"
        />
        {(branches.length > 0 || sources.length > 0 || garages.length > 0 || partsGroups.length > 0) && (
          <button
            onClick={() => { setBranches([]); setSources([]); setGarages([]); setPartsGroups([]) }}
            className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-sm text-gray-400">กำลังโหลด...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-5 py-4">
              <p className="text-xs text-gray-400 dark:text-gray-500">รายการทั้งหมด</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{fmt(totalCount)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-5 py-4">
              <p className="text-xs text-gray-400 dark:text-gray-500">มูลค่ารวม (฿)</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{fmt(totalCost)}</p>
            </div>
            {summary.slice(0, 2).map(s => (
              <div key={s._id} className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-5 py-4">
                <p className="text-xs text-gray-400 dark:text-gray-500">{s._id}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{fmt(s.total_cost)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{fmt(s.count)} รายการ</p>
              </div>
            ))}
          </div>

          {/* Pivot Table */}
          <PivotTable pivot={pivot} />

          {/* Labor Pivot */}
          <LaborPivotTable items={laborPivot} />

          {/* แหล่งอะไหล่ bar breakdown */}
          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">แหล่งอะไหล่ breakdown</p>
            <div className="space-y-2">
              {summary.map(s => {
                const pct = totalCost > 0 ? (s.total_cost / totalCost) * 100 : 0
                return (
                  <div key={s._id} className="flex items-center gap-3">
                    <span className={`shrink-0 w-44 text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_COLOR[s._id] ?? "bg-gray-100 text-gray-600"}`}>{s._id}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-white/8 overflow-hidden">
                      <div className="h-2 rounded-full bg-gray-900 dark:bg-white/60" style={{ width: `${pct.toFixed(1)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-28 text-right">฿{fmt(s.total_cost)}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Price Comparison Pivot */}
          <PriceCompTable items={priceComp} />

          {/* Row Data Table */}
          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
            {/* Table header + filter */}
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-white/8 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Row Data</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {`แสดง ${fmt(data.length)} จาก ${fmt(totalCount)} แถว`}
                </p>
              </div>
              <div className="relative">
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="กรอง ทะเบียน / request / ช่าง / อะไหล่ / remark..."
                  className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 w-80"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-auto max-h-[560px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-20">
                  <tr className="border-b border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-[#13151f]">
                    {["request_code","reported_at","branch","plate_no","mechanic","parts_group","part","qty","unit_price","total","อู่","แหล่งอะไหล่","remark"].map(h => (
                      <th key={h} className="px-3 py-3 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap bg-gray-50 dark:bg-[#13151f]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                      <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.request_code}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.reported_at}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.branch}</td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{r.plate_no}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.mechanic}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.parts_group}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={r.part}>{r.part}</td>
                      <td className="px-3 py-2 text-right">{r.qty}</td>
                      <td className="px-3 py-2 text-right">{fmt(r.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(r.total)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${GARAGE_COLOR[r.อู่] ?? "bg-gray-100 text-gray-600"}`}>{r.อู่}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${SOURCE_COLOR[r.แหล่งอะไหล่] ?? "bg-gray-100 text-gray-600"}`}>{r.แหล่งอะไหล่}</span>
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate text-gray-400 dark:text-gray-500" title={r.remark ?? ""}>{r.remark ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-5 py-3 border-t border-gray-100 dark:border-white/8 flex items-center justify-between gap-4">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                แถว {fmt(page * PAGE_SIZE + 1)}–{fmt(Math.min((page + 1) * PAGE_SIZE, data.length))} จาก {fmt(data.length)}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0}
                  className="px-2 py-1 rounded text-xs border border-gray-200 dark:border-white/10 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5"
                >«</button>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2 py-1 rounded text-xs border border-gray-200 dark:border-white/10 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5"
                >‹</button>
                <span className="px-3 py-1 text-xs text-gray-600 dark:text-gray-300">
                  หน้า {page + 1} / {pageCount}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="px-2 py-1 rounded text-xs border border-gray-200 dark:border-white/10 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5"
                >›</button>
                <button
                  onClick={() => setPage(pageCount - 1)}
                  disabled={page >= pageCount - 1}
                  className="px-2 py-1 rounded text-xs border border-gray-200 dark:border-white/10 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/5"
                >»</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
