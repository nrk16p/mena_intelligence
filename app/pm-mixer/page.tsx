"use client"

import { useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"

// ─────────────────────────────────────────────────────────────────────────────
// PM มิกเซอร์ — คลังลาดกระบัง
// ฐานข้อมูล = ใบแจ้งซ่อม (MR) + ประเภทการซ่อม ไม่ใช่จุดประสงค์ในการเบิก
// เพราะปี 2026 มีเพียง 53% ของใบ PM จริงที่ถูกคีย์จุดประสงค์เป็น "PM"
// ─────────────────────────────────────────────────────────────────────────────

const PV = {
  blue: "#2563EB", blueSoft: "#93C5FD", red: "#DC2626", amber: "#D97706",
  green: "#16A34A", ink: "#111827", sub: "#6B7280", border: "#E5E7EB",
  bg: "#F9FAFB", surface: "#FFFFFF", grey: "#9CA3AF",
}
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
const num = (n: number) => Math.round(n).toLocaleString("en-US")
const baht = (n: number) => `฿${num(n)}`
const short = (n: number) => (Math.abs(n) >= 1e6 ? `฿${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `฿${(n / 1e3).toFixed(0)}K` : `฿${num(n)}`)
const pc = (n: number | null, d = 1) => (n === null || !Number.isFinite(n) ? "—" : `${n.toFixed(d)}%`)
const fmtDate = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—")
const delta = (cur: number, prev: number) => (prev > 0 ? ((cur / prev - 1) * 100) : null)

// ── shapes (mirror lib/pm-mixer.ts) ─────────────────────────────────────────
type YearStat = {
  year: number; pmMrs: number; pmTasks: number; platesPm: number; platesAll: number
  coverage: number; freq: number; cost: number; perMr: number; perPlate: number
  mrsAll: number; costAll: number; shareMrs: number; shareCost: number
}
type Side = { trucks: number; pmTrucks: number; pmMrs: number; cost: number }
type SplitRow = { key: string; cur: Side; prev: Side }
type MonthRow = { month: number; curMrs: number; curCost: number; prevMrs: number; prevCost: number }
type IntervalRow = { year: number; pairs: number; kmPairs: number
                     medianDays: number | null; medianKm: number | null
                     over15k: number; over20k: number; over30k: number }
type BasketRow = { year: number; repairType: string; mrs: number; noPartsPct: number
                   avgItems: number; items: Record<string, number>; laborPct: number }
type RiskRow = { plate: string; customer: string; age: number | null; mrs: number; pmCount: number
                 lastPm: string | null; daysSince: number | null; kmSince: number | null
                 kmNow: number | null; level: "A" | "B" | "C"; kmSuspect: boolean }
type Api = {
  success: boolean; error?: string; cached?: boolean
  meta: { branch: string; curYear: number; prevYear: number; monthTo: number; asOf: string
          mrTotal: number; mrMixer: number; mixerPct: number; generatedAt: string }
  overview: YearStat[]
  byType: SplitRow[]; byFleet: SplitRow[]; byAge: SplitRow[]; byOwner: SplitRow[]; byBrand: SplitRow[]
  monthly: MonthRow[]; interval: IntervalRow[]; basket: BasketRow[]; risk: RiskRow[]
  riskSummary: { fleetSize: number; never: number; overKm: number; overDays: number; kmSuspect: number
                 total: number; byLevel: Record<string, number>; byFleet: { key: string; n: number }[] }
}

const ITEM_COLS = [
  { key: "engineOil", label: "น้ำมันเครื่อง" }, { key: "oilFilter", label: "กรองเครื่อง" },
  { key: "fuelFilter", label: "กรองโซล่า" }, { key: "gearOil", label: "น้ำมันเกียร์" },
  { key: "diffOil", label: "เฟืองท้าย" }, { key: "grease", label: "จารบี" },
]
const SPLITS = [
  { key: "byFleet", label: "ฟลีต/ลูกค้า" }, { key: "byAge", label: "อายุรถ" },
  { key: "byOwner", label: "เจ้าของรถ" }, { key: "byBrand", label: "ยี่ห้อ" },
] as const
const LEVELS: Record<RiskRow["level"], { label: string; color: string }> = {
  A: { label: "A ไม่ได้ทำ PM เลย", color: PV.red },
  B: { label: "B วิ่งเกิน 25,000 กม.", color: PV.amber },
  C: { label: "C เกินเกณฑ์", color: PV.blue },
}

// ── small presentational bits ───────────────────────────────────────────────
function Card({ title, value, sub, tone = "ink", foot }: {
  title: string; value: string; sub?: string; tone?: "ink" | "red" | "green" | "amber"; foot?: string
}) {
  const color = tone === "red" ? PV.red : tone === "green" ? PV.green : tone === "amber" ? PV.amber : PV.ink
  return (
    <div className="rounded-2xl border bg-white px-5 py-4" style={{ borderColor: PV.border }}>
      <p className="text-xs" style={{ color: PV.sub }}>{title}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: PV.sub }}>{sub}</p>}
      {foot && <p className="mt-1.5 border-t pt-1.5 text-[10px] leading-snug" style={{ color: PV.sub, borderColor: PV.border }}>{foot}</p>}
    </div>
  )
}
function Delta({ cur, prev, invert = false, suffix = "%" }: { cur: number; prev: number; invert?: boolean; suffix?: string }) {
  const d = delta(cur, prev)
  if (d === null) return <span style={{ color: PV.grey }}>—</span>
  const good = invert ? d < 0 : d > 0
  return <span style={{ color: Math.abs(d) < 0.5 ? PV.sub : good ? PV.green : PV.red }}>
    {d > 0 ? "+" : ""}{d.toFixed(1)}{suffix}
  </span>
}
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5" style={{ borderColor: PV.border }}>
      <div className="mb-3">
        <h2 className="text-sm font-bold" style={{ color: PV.ink }}>{title}</h2>
        {note && <p className="mt-0.5 text-xs" style={{ color: PV.sub }}>{note}</p>}
      </div>
      {children}
    </section>
  )
}

export default function PmMixerPage() {
  const [data, setData] = useState<Api | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const now = new Date()
  const [year, setYear] = useState(String(now.getFullYear()))
  const [monthTo, setMonthTo] = useState(String(Math.max(1, now.getMonth())))
  const [split, setSplit] = useState<(typeof SPLITS)[number]["key"]>("byFleet")
  const [riskLevel, setRiskLevel] = useState<"all" | RiskRow["level"]>("all")
  const [riskFleet, setRiskFleet] = useState("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    let alive = true
    setLoading(true); setErr(null)
    fetch(`/api/pm-mixer?year=${year}&monthTo=${monthTo}`, { cache: "no-store" })
      .then(r => r.json())
      .then((j: Api) => {
        if (!alive) return
        if (!j.success) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ")
        setData(j)
      })
      .catch(e => alive && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [year, monthTo])

  const prev = data?.overview[0]
  const cur = data?.overview[1]

  const chart = useMemo(() => (data?.monthly ?? [])
    .filter(m => m.curMrs || m.prevMrs)
    .map(m => ({ month: TH_MONTHS[m.month - 1], cur: m.curMrs, prev: m.prevMrs,
                 curCost: m.curCost, prevCost: m.prevCost })), [data])

  const risk = useMemo(() => (data?.risk ?? []).filter(r =>
    (riskLevel === "all" || r.level === riskLevel) &&
    (riskFleet === "all" || r.customer === riskFleet) &&
    (!search.trim() || r.plate.includes(search.trim()))), [data, riskLevel, riskFleet, search])

  function exportXlsx() {
    if (!data) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.overview.map(o => ({
      ปี: o.year, "ใบ PM": o.pmMrs, "คันที่ได้ PM": o.platesPm, "รถทั้งหมด": o.platesAll,
      "%ครอบคลุม": +o.coverage.toFixed(1), "ครั้ง/คัน": +o.freq.toFixed(2), "ค่าใช้จ่าย": Math.round(o.cost),
      "บาท/ใบ": Math.round(o.perMr), "%ของใบซ่อมทั้งหมด": +o.shareMrs.toFixed(1),
      "%ของค่าซ่อมทั้งหมด": +o.shareCost.toFixed(1),
    }))), "ภาพรวม")
    const splitSheet = (rows: SplitRow[]) => rows.map(r => ({
      รายการ: r.key,
      [`รถ ${data.meta.prevYear}`]: r.prev.trucks, [`ได้ PM ${data.meta.prevYear}`]: r.prev.pmTrucks,
      [`%ครอบคลุม ${data.meta.prevYear}`]: r.prev.trucks ? +(r.prev.pmTrucks / r.prev.trucks * 100).toFixed(1) : "",
      [`ใบ PM ${data.meta.prevYear}`]: r.prev.pmMrs, [`บาท ${data.meta.prevYear}`]: Math.round(r.prev.cost),
      [`รถ ${data.meta.curYear}`]: r.cur.trucks, [`ได้ PM ${data.meta.curYear}`]: r.cur.pmTrucks,
      [`%ครอบคลุม ${data.meta.curYear}`]: r.cur.trucks ? +(r.cur.pmTrucks / r.cur.trucks * 100).toFixed(1) : "",
      [`ใบ PM ${data.meta.curYear}`]: r.cur.pmMrs, [`บาท ${data.meta.curYear}`]: Math.round(r.cur.cost),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(splitSheet(data.byFleet)), "ตามฟลีต")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(splitSheet(data.byAge)), "ตามอายุรถ")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.basket.map(b => ({
      ปี: b.year, ชนิด: b.repairType, "ใบ PM": b.mrs, "รายการเฉลี่ย/ใบ": +b.avgItems.toFixed(2),
      ...Object.fromEntries(ITEM_COLS.map(c => [c.label, +(b.items[c.key] ?? 0).toFixed(1)])),
      "%มีค่าแรง/เหมา": +b.laborPct.toFixed(1), "%ใบไม่มีรายการ": +b.noPartsPct.toFixed(1),
    }))), "ความครบถ้วน")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.risk.map(r => ({
      ระดับ: LEVELS[r.level].label, ทะเบียน: r.plate, ฟลีต: r.customer, อายุ: r.age ?? "",
      "ใบซ่อมปีนี้": r.mrs, "จำนวน PM": r.pmCount, "PM ล่าสุด": fmtDate(r.lastPm),
      "วันตั้งแต่ PM": r.daysSince ?? "", "กม.ตั้งแต่ PM": r.kmSince ?? "",
      "เลขไมล์ล่าสุด": r.kmNow ?? "", "เลขไมล์น่าสงสัย": r.kmSuspect ? "ใช่" : "",
    }))), "รถหลุด PM")
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `pm-mixer-ladkrabang-${year}.xlsx`)
  }

  return (
    <div className="min-h-screen p-6" style={{ background: PV.bg }}>
      <div className="mx-auto max-w-[1400px] space-y-5">

        {/* ── header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: PV.green }}>
              Preventive Maintenance
            </p>
            <h1 className="mt-1 text-2xl font-bold" style={{ color: PV.ink }}>PM มิกเซอร์ — คลังลาดกระบัง</h1>
            <p className="mt-0.5 text-sm" style={{ color: PV.sub }}>
              {data ? <>ม.ค.–{TH_MONTHS[data.meta.monthTo - 1]} {data.meta.curYear} เทียบ {data.meta.prevYear} · นับจากใบแจ้งซ่อม (MR) และประเภทการซ่อม</> : "กำลังโหลด…"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={year} onChange={e => setYear(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: PV.border }}>
              {["2026", "2025"].map(y => <option key={y} value={y}>ปี {y}</option>)}
            </select>
            <select value={monthTo} onChange={e => setMonthTo(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: PV.border }}>
              {TH_MONTHS.map((m, i) => <option key={m} value={i + 1}>ถึง {m}</option>)}
            </select>
            <button onClick={exportXlsx} disabled={!data}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              style={{ borderColor: PV.border, color: PV.ink }}>ดาวน์โหลด Excel</button>
          </div>
        </div>

        {loading && <div className="rounded-2xl border bg-white p-10 text-center text-sm" style={{ borderColor: PV.border, color: PV.sub }}>กำลังคำนวณจากใบแจ้งซ่อม…</div>}
        {err && <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: PV.red, color: PV.red }}>{err}</div>}

        {data && cur && prev && !loading && (
          <>
            {/* ── KPI ───────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card title="ความครอบคลุม PM" value={pc(cur.coverage)}
                tone={cur.coverage >= 95 ? "green" : cur.coverage >= 85 ? "amber" : "red"}
                sub={`${num(cur.platesPm)} จาก ${num(cur.platesAll)} คัน · ปี ${data.meta.prevYear}: ${pc(prev.coverage)}`}
                foot="นับรถที่เข้าซ่อมในช่วงเดียวกัน — เป้าหมายที่เสนอคือ ≥95%" />
              <Card title="ใบ PM" value={num(cur.pmMrs)}
                sub={`ปี ${data.meta.prevYear}: ${num(prev.pmMrs)} ใบ · ${delta(cur.pmMrs, prev.pmMrs)?.toFixed(1)}%`}
                foot={`คิดเป็น ${pc(cur.shareMrs)} ของใบซ่อมทั้งหมด (ปีก่อน ${pc(prev.shareMrs)})`} />
              <Card title="ค่าใช้จ่าย PM" value={short(cur.cost)}
                sub={`${baht(cur.perMr)}/ใบ · ปีก่อน ${baht(prev.perMr)}/ใบ`}
                foot={`คิดเป็น ${pc(cur.shareCost)} ของค่าซ่อมทั้งหมด`} />
              <Card title="รถที่หลุด PM" value={num(data.riskSummary.total)} tone="red"
                sub={`${pc(data.riskSummary.total / data.riskSummary.fleetSize * 100, 0)} ของ ${num(data.riskSummary.fleetSize)} คัน`}
                foot={`ไม่ได้ทำเลย ${data.riskSummary.never} · เกิน 15,000 กม. ${data.riskSummary.overKm} · เกิน 180 วัน ${data.riskSummary.overDays}`} />
            </div>

            {/* ── monthly ───────────────────────────────────────────────── */}
            <Section title="จำนวนใบ PM รายเดือน" note={`แท่ง = ${data.meta.curYear} · แท่งจาง = ${data.meta.prevYear} · เส้น = ค่าใช้จ่าย ${data.meta.curYear}`}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: PV.sub }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10, fill: PV.grey }} axisLine={false} tickLine={false} width={38} />
                  <YAxis yAxisId="r" orientation="right" tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
                    tick={{ fontSize: 10, fill: PV.grey }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v, n) => [String(n).includes("บาท") ? baht(Number(v)) : `${num(Number(v))} ใบ`, String(n)]}
                    contentStyle={{ borderRadius: 12, fontSize: 11, border: `1px solid ${PV.border}` }} />
                  <Legend formatter={v => <span style={{ fontSize: 11, color: PV.sub }}>{v}</span>} />
                  <Bar yAxisId="l" dataKey="prev" name={`ใบ PM ${data.meta.prevYear}`} fill={PV.blueSoft} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar yAxisId="l" dataKey="cur" name={`ใบ PM ${data.meta.curYear}`} fill={PV.blue} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Line yAxisId="r" dataKey="curCost" name={`บาท ${data.meta.curYear}`} stroke={PV.amber}
                    strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Section>

            {/* ── PM type + interval ────────────────────────────────────── */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="ชนิดของงาน PM" note="นับเป็นจำนวนงาน (task) — ใบเดียวมีงาน PM ได้หลายชนิด">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left" style={{ color: PV.sub, borderColor: PV.border }}>
                      <th className="py-2 font-medium">ประเภท</th>
                      <th className="py-2 text-right font-medium">งาน {data.meta.prevYear}</th>
                      <th className="py-2 text-right font-medium">งาน {data.meta.curYear}</th>
                      <th className="py-2 text-right font-medium">บาท {data.meta.prevYear}</th>
                      <th className="py-2 text-right font-medium">บาท {data.meta.curYear}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byType.map(r => (
                      <tr key={r.key} className="border-b last:border-0" style={{ borderColor: PV.border }}>
                        <td className="py-2" style={{ color: PV.ink }}>{r.key}</td>
                        <td className="py-2 text-right tabular-nums" style={{ color: PV.sub }}>{num(r.prev.pmTrucks)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{num(r.cur.pmTrucks)}
                          <span className="ml-1 text-[10px]"><Delta cur={r.cur.pmTrucks} prev={r.prev.pmTrucks} /></span>
                        </td>
                        <td className="py-2 text-right tabular-nums" style={{ color: PV.sub }}>{short(r.prev.cost)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{short(r.cur.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title="ระยะห่างระหว่าง PM แต่ละครั้ง" note="วัดจากเลขไมล์ในใบแจ้งซ่อม — ตัดใบที่ไม่ได้กรอกเลขไมล์ออก">
                <div className="grid grid-cols-2 gap-3">
                  {data.interval.map(iv => (
                    <div key={iv.year} className="rounded-xl p-4" style={{ background: PV.bg }}>
                      <p className="text-xs font-bold" style={{ color: iv.year === data.meta.curYear ? PV.blue : PV.sub }}>ปี {iv.year}</p>
                      <p className="mt-2 text-2xl font-bold" style={{ color: PV.ink }}>
                        {iv.medianKm !== null ? num(iv.medianKm) : "—"} <span className="text-sm font-normal" style={{ color: PV.sub }}>กม.</span>
                      </p>
                      <p className="text-xs" style={{ color: PV.sub }}>มัธยฐาน · {iv.medianDays ?? "—"} วัน</p>
                      <p className="text-[10px]" style={{ color: PV.grey }}>{num(iv.pairs)} ช่วง PM · วัดเลขไมล์ได้ {num(iv.kmPairs)}</p>
                      <div className="mt-3 space-y-1 border-t pt-2 text-[11px]" style={{ borderColor: PV.border }}>
                        {([["เกิน 15,000 กม.", iv.over15k], ["เกิน 20,000 กม.", iv.over20k], ["เกิน 30,000 กม.", iv.over30k]] as const).map(([l, v]) => (
                          <div key={l} className="flex justify-between">
                            <span style={{ color: PV.sub }}>{l}</span>
                            <span className="font-semibold tabular-nums" style={{ color: v > 20 ? PV.red : v > 10 ? PV.amber : PV.ink }}>{pc(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            {/* ── splits ────────────────────────────────────────────────── */}
            <Section title="ความครอบคลุม PM แยกตามมิติ" note="ครอบคลุม = คันที่ได้ทำ PM ÷ คันที่เข้าซ่อมในช่วงเดียวกัน">
              <div className="mb-3 flex flex-wrap gap-2">
                {SPLITS.map(s => (
                  <button key={s.key} onClick={() => setSplit(s.key)}
                    className="rounded-full border px-3 py-1 text-xs font-medium"
                    style={split === s.key
                      ? { background: PV.blue, borderColor: PV.blue, color: "#fff" }
                      : { borderColor: PV.border, color: PV.sub }}>{s.label}</button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="border-b text-left" style={{ color: PV.sub, borderColor: PV.border }}>
                      <th className="py-2 font-medium">รายการ</th>
                      <th className="py-2 text-right font-medium">รถ {data.meta.prevYear}</th>
                      <th className="py-2 text-right font-medium">ครอบคลุม {data.meta.prevYear}</th>
                      <th className="py-2 text-right font-medium">รถ {data.meta.curYear}</th>
                      <th className="py-2 text-right font-medium">ครอบคลุม {data.meta.curYear}</th>
                      <th className="py-2 text-right font-medium">Δ จุด</th>
                      <th className="py-2 text-right font-medium">ใบ PM</th>
                      <th className="py-2 text-right font-medium">บาท {data.meta.curYear}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data[split] as SplitRow[]).filter(r => r.cur.trucks + r.prev.trucks >= 3).map(r => {
                      const cp = r.prev.trucks ? r.prev.pmTrucks / r.prev.trucks * 100 : null
                      const cc = r.cur.trucks ? r.cur.pmTrucks / r.cur.trucks * 100 : null
                      const dd = cp !== null && cc !== null ? cc - cp : null
                      return (
                        <tr key={r.key} className="border-b last:border-0" style={{ borderColor: PV.border }}>
                          <td className="py-2" style={{ color: PV.ink }}>{r.key}</td>
                          <td className="py-2 text-right tabular-nums" style={{ color: PV.sub }}>{num(r.prev.trucks)}</td>
                          <td className="py-2 text-right tabular-nums" style={{ color: PV.sub }}>{pc(cp, 0)}</td>
                          <td className="py-2 text-right tabular-nums">{num(r.cur.trucks)}</td>
                          <td className="py-2 text-right font-semibold tabular-nums"
                            style={{ color: cc === null ? PV.grey : cc >= 95 ? PV.green : cc >= 85 ? PV.ink : PV.red }}>{pc(cc, 0)}</td>
                          <td className="py-2 text-right font-semibold tabular-nums"
                            style={{ color: dd === null ? PV.grey : dd >= 0 ? PV.green : PV.red }}>
                            {dd === null ? "—" : `${dd > 0 ? "+" : ""}${dd.toFixed(0)}`}
                          </td>
                          <td className="py-2 text-right tabular-nums" style={{ color: PV.sub }}>{num(r.prev.pmMrs)} → {num(r.cur.pmMrs)}</td>
                          <td className="py-2 text-right tabular-nums">{short(r.cur.cost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* ── basket ────────────────────────────────────────────────── */}
            <Section title="ความครบถ้วนของรายการในใบ PM"
              note="% ของใบ PM ที่มีรายการนั้นเบิกจริง — ใบที่จ่ายเหมาให้ศูนย์บริการจะไม่มีรายการอะไหล่ในระบบ จึงต้องอ่านคู่กับคอลัมน์ค่าแรง/เหมา">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-xs">
                  <thead>
                    <tr className="border-b text-left" style={{ color: PV.sub, borderColor: PV.border }}>
                      <th className="py-2 font-medium">ปี</th>
                      <th className="py-2 font-medium">ชนิด PM</th>
                      <th className="py-2 text-right font-medium">ใบ</th>
                      {ITEM_COLS.map(c => <th key={c.key} className="py-2 text-right font-medium">{c.label}</th>)}
                      <th className="py-2 text-right font-medium">รายการ/ใบ</th>
                      <th className="py-2 text-right font-medium">ค่าแรง/เหมา</th>
                      <th className="py-2 text-right font-medium">ใบไม่มีรายการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.basket.map(b => (
                      <tr key={`${b.year}-${b.repairType}`} className="border-b last:border-0" style={{ borderColor: PV.border }}>
                        <td className="py-2 tabular-nums" style={{ color: b.year === data.meta.curYear ? PV.ink : PV.sub }}>{b.year}</td>
                        <td className="py-2" style={{ color: PV.ink }}>{b.repairType}</td>
                        <td className="py-2 text-right tabular-nums">{num(b.mrs)}</td>
                        {ITEM_COLS.map(c => {
                          const v = b.items[c.key] ?? 0
                          return <td key={c.key} className="py-2 text-right tabular-nums"
                            style={{ color: v >= 90 ? PV.green : v >= 50 ? PV.ink : v >= 20 ? PV.amber : PV.grey }}>{pc(v, 0)}</td>
                        })}
                        <td className="py-2 text-right font-semibold tabular-nums">{b.avgItems.toFixed(2)}</td>
                        <td className="py-2 text-right tabular-nums" style={{ color: b.laborPct > 50 ? PV.amber : PV.sub }}>{pc(b.laborPct, 0)}</td>
                        <td className="py-2 text-right tabular-nums" style={{ color: b.noPartsPct > 20 ? PV.amber : PV.sub }}>{pc(b.noPartsPct, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 rounded-xl p-3 text-[11px] leading-relaxed" style={{ background: PV.bg, color: PV.sub }}>
                <b style={{ color: PV.ink }}>วิธีอ่าน:</b> แถว PMศูนย์บริการที่มีค่าแรง/เหมาเกือบ 100% แต่รายการอะไหล่ต่ำ
                ไม่ได้แปลว่าศูนย์ไม่ได้เปลี่ยนอะไหล่ — แต่แปลว่าอะไหล่ไม่ได้ผ่านสต็อกเรา จึงไม่ปรากฏในระบบ
                ส่วน &ldquo;ระบบบำรุงรักษา&rdquo; ที่แทบไม่มีน้ำมันเครื่องเลย คืองานบำรุงรักษาย่อย ไม่ใช่การเปลี่ยนถ่าย
              </p>
            </Section>

            {/* ── risk ──────────────────────────────────────────────────── */}
            <Section title={`รถที่ต้องตามเก็บ PM — ${num(data.risk.length)} คัน`}
              note={`ณ ${fmtDate(data.meta.asOf)} · เกณฑ์ที่ใช้: ไม่ได้ทำ PM เลยในปี ${data.meta.curYear} หรือวิ่งเกิน 15,000 กม. หรือเกิน 180 วันนับจาก PM ครั้งล่าสุด`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button onClick={() => setRiskLevel("all")}
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={riskLevel === "all" ? { background: PV.ink, borderColor: PV.ink, color: "#fff" } : { borderColor: PV.border, color: PV.sub }}>
                  ทั้งหมด {data.risk.length}
                </button>
                {(Object.keys(LEVELS) as RiskRow["level"][]).map(l => (
                  <button key={l} onClick={() => setRiskLevel(l)}
                    className="rounded-full border px-3 py-1 text-xs font-medium"
                    style={riskLevel === l
                      ? { background: LEVELS[l].color, borderColor: LEVELS[l].color, color: "#fff" }
                      : { borderColor: PV.border, color: PV.sub }}>
                    {LEVELS[l].label} {data.riskSummary.byLevel[l] ?? 0}
                  </button>
                ))}
                <select value={riskFleet} onChange={e => setRiskFleet(e.target.value)}
                  className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: PV.border }}>
                  <option value="all">ทุกฟลีต</option>
                  {data.riskSummary.byFleet.map(f => <option key={f.key} value={f.key}>{f.key} ({f.n})</option>)}
                </select>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นทะเบียน"
                  className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: PV.border }} />
                <span className="text-xs" style={{ color: PV.sub }}>แสดง {risk.length} คัน</span>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[820px] text-xs">
                  <thead className="sticky top-0" style={{ background: PV.surface }}>
                    <tr className="border-b text-left" style={{ color: PV.sub, borderColor: PV.border }}>
                      <th className="py-2 font-medium">ระดับ</th>
                      <th className="py-2 font-medium">ทะเบียน</th>
                      <th className="py-2 font-medium">ฟลีต</th>
                      <th className="py-2 text-right font-medium">อายุ</th>
                      <th className="py-2 text-right font-medium">ใบซ่อมปีนี้</th>
                      <th className="py-2 text-right font-medium">PM ปีนี้</th>
                      <th className="py-2 font-medium">PM ล่าสุด</th>
                      <th className="py-2 text-right font-medium">วันที่ผ่านมา</th>
                      <th className="py-2 text-right font-medium">กม. ตั้งแต่ PM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risk.map(r => (
                      <tr key={r.plate} className="border-b last:border-0" style={{ borderColor: PV.border }}>
                        <td className="py-1.5">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: LEVELS[r.level].color }}>{r.level}</span>
                        </td>
                        <td className="py-1.5 font-medium" style={{ color: PV.ink }}>{r.plate}</td>
                        <td className="py-1.5" style={{ color: PV.sub }}>{r.customer}</td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: PV.sub }}>{r.age ?? "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{num(r.mrs)}</td>
                        <td className="py-1.5 text-right tabular-nums" style={{ color: r.pmCount === 0 ? PV.red : PV.ink }}>{r.pmCount}</td>
                        <td className="py-1.5" style={{ color: PV.sub }}>{fmtDate(r.lastPm)}</td>
                        <td className="py-1.5 text-right tabular-nums"
                          style={{ color: (r.daysSince ?? 0) > 180 ? PV.red : PV.ink }}>{r.daysSince ?? "—"}</td>
                        <td className="py-1.5 text-right tabular-nums"
                          style={{ color: (r.kmSince ?? 0) > 25000 ? PV.red : (r.kmSince ?? 0) > 15000 ? PV.amber : PV.ink }}>
                          {r.kmSince !== null ? num(r.kmSince) : r.kmSuspect ? "เลขไมล์ผิดปกติ" : "—"}
                        </td>
                      </tr>
                    ))}
                    {!risk.length && (
                      <tr><td colSpan={9} className="py-8 text-center" style={{ color: PV.sub }}>ไม่มีรถในเงื่อนไขนี้</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* ── takeaways ─────────────────────────────────────────────── */}
            <Section title="สรุปสำหรับที่ประชุม">
              <ul className="space-y-2 text-xs leading-relaxed" style={{ color: PV.ink }}>
                <li>• <b>ความครอบคลุมลดลง {(prev.coverage - cur.coverage).toFixed(1)} จุด</b> ({pc(prev.coverage)} → {pc(cur.coverage)})
                  ขณะที่ขนาดฟลีตเท่าเดิม ({num(prev.platesAll)} → {num(cur.platesAll)} คัน) — มี <b style={{ color: PV.red }}>{data.riskSummary.never} คันที่ไม่ได้ทำ PM เลย</b></li>
                <li>• <b>ค่าใช้จ่าย PM รวมลดลง {Math.abs(delta(cur.cost, prev.cost) ?? 0).toFixed(1)}%</b> แต่ <b>ต่อครั้งเพิ่ม {(delta(cur.perMr, prev.perMr) ?? 0).toFixed(1)}%</b>
                  ({baht(prev.perMr)} → {baht(cur.perMr)}) — ทำน้อยครั้งลงแต่ครบชุดขึ้น</li>
                <li>• <b>ระยะห่างระหว่าง PM เพิ่มจาก {num(data.interval[0].medianKm ?? 0)} เป็น {num(data.interval[1].medianKm ?? 0)} กม.</b> และสัดส่วนที่ปล่อยเกิน 20,000 กม.
                  เพิ่มจาก {pc(data.interval[0].over20k)} เป็น {pc(data.interval[1].over20k)}</li>
                <li>• ปี {data.meta.prevYear} <b>ไม่ได้ทำ PM น้อยกว่า</b> — ครอบคลุมมากกว่าและถี่กว่า สิ่งที่ต่างคือขอบเขตงานต่อครั้ง
                  (น้ำมันเกียร์/เฟืองท้ายเพิ่มจากราว 28% เป็นราว 78% ของใบ) และงานที่เคยส่งศูนย์บริการถูกดึงกลับมาทำเอง</li>
                <li>• ตัวเลข &ldquo;รายการไม่ครบ&rdquo; ของ PMศูนย์บริการเป็นข้อจำกัดของการบันทึก ไม่ใช่หลักฐานว่าไม่ได้ทำ —
                  ต้องแก้ที่การลงรายการก่อนถึงจะเทียบข้ามปีได้เต็มที่</li>
              </ul>
              <p className="mt-3 text-[10px]" style={{ color: PV.grey }}>
                ข้อมูล {num(data.meta.mrMixer)} ใบแจ้งซ่อมมิกเซอร์ ({pc(data.meta.mixerPct)} ของใบซ่อมที่คลังลาดกระบัง) ·
                คำนวณเมื่อ {new Date(data.meta.generatedAt).toLocaleString("th-TH")} {data.cached ? "(จากแคช)" : ""}
              </p>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
