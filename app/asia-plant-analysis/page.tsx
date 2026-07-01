"use client"

import { useMemo, useState } from "react"
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
  BarChart, Bar, LabelList,
} from "recharts"

// ── Static data ───────────────────────────────────────────────────────────────
const ASIA_RAW = [
  { แพล้นท์: "รัชดา1",          Zone: "BKK Central 1", avg_trip: 2.323510, rev: 3693.04 },
  { แพล้นท์: "รัชดา2",          Zone: "BKK Central 1", avg_trip: 2.184687, rev: 3693.04 },
  { แพล้นท์: "หัวหมาก",         Zone: "BKK Central 1", avg_trip: 2.202795, rev: 4016.29 },
  { แพล้นท์: "ศูนย์วิจัย",      Zone: "BKK Central 1", avg_trip: 1.612465, rev: 2990.44 },
  { แพล้นท์: "ลาดกระบัง",       Zone: "BKK Central 2", avg_trip: 2.623169, rev: 3619.98 },
  { แพล้นท์: "บางเสาธง",        Zone: "BKK East",      avg_trip: 2.196825, rev: 3745.69 },
  { แพล้นท์: "บางบ่อ",          Zone: "BKK East",      avg_trip: 1.806452, rev: 3445.00 },
  { แพล้นท์: "สาธุประดิษฐ์",    Zone: "BKK East",      avg_trip: 2.000000, rev: 3799.46 },
  { แพล้นท์: "เชียงรากน้อย",    Zone: "BKK North",     avg_trip: 2.660485, rev: 3926.25 },
  { แพล้นท์: "ลำลูกกาคลอง8",   Zone: "BKK North",     avg_trip: 2.736527, rev: 4001.66 },
  { แพล้นท์: "หทัยราษฎร์",      Zone: "BKK North",     avg_trip: 2.408957, rev: 3204.34 },
  { แพล้นท์: "สรงประภา",        Zone: "BKK North",     avg_trip: 2.461697, rev: 3750.72 },
  { แพล้นท์: "ลำลูกกาคลอง12",  Zone: "BKK North",     avg_trip: 2.229569, rev: 3350.13 },
  { แพล้นท์: "บางปะอิน",        Zone: "BKK North",     avg_trip: 2.218735, rev: 4007.31 },
  { แพล้นท์: "บางหญ้าแพรก",     Zone: "BKK South 1",   avg_trip: 1.960163, rev: 4039.69 },
  { แพล้นท์: "หนามแดง",         Zone: "BKK South 2",   avg_trip: 2.353522, rev: 3382.42 },
  { แพล้นท์: "ปทุมธานี",        Zone: "BKK West 1",    avg_trip: 3.182173, rev: 4710.21 },
  { แพล้นท์: "สามัคคี",         Zone: "BKK West 1",    avg_trip: 2.287524, rev: 3221.48 },
  { แพล้นท์: "บางบัวทอง",       Zone: "BKK West 1",    avg_trip: 2.071719, rev: 2941.63 },
  { แพล้นท์: "ตลิ่งชัน",        Zone: "BKK West 2",    avg_trip: 2.306936, rev: 3346.69 },
  { แพล้นท์: "บางกรวย",         Zone: "BKK West 2",    avg_trip: 2.114353, rev: 3178.09 },
  { แพล้นท์: "พระรามห้า",       Zone: "BKK West 2",    avg_trip: 1.843193, rev: 3150.01 },
  { แพล้นท์: "สมุทรสาคร",       Zone: "BKK West 3",    avg_trip: 2.363134, rev: 3095.59 },
  { แพล้นท์: "อ้อมแก้ว",        Zone: "East Zone 1",   avg_trip: 3.111628, rev: 4703.63 },
  { แพล้นท์: "นาเกลือ",         Zone: "East Zone 1",   avg_trip: 2.518013, rev: 3601.51 },
  { แพล้นท์: "หนองขาม",         Zone: "East Zone 1",   avg_trip: 2.881826, rev: 4095.60 },
  { แพล้นท์: "บ่อวิน",          Zone: "East Zone 1",   avg_trip: 2.559303, rev: 3615.79 },
  { แพล้นท์: "สัตหีบ",          Zone: "East Zone 1",   avg_trip: 2.208250, rev: 3579.70 },
  { แพล้นท์: "แหลมฉบัง",        Zone: "East Zone 1",   avg_trip: 2.214501, rev: 3413.85 },
  { แพล้นท์: "พัทยา3",          Zone: "East Zone 1",   avg_trip: 2.148011, rev: 3408.76 },
  { แพล้นท์: "บ้านฉาง",         Zone: "East Zone 1",   avg_trip: 2.089435, rev: 3415.78 },
  { แพล้นท์: "พานทอง",          Zone: "East Zone 1",   avg_trip: 1.882296, rev: 3411.48 },
  { แพล้นท์: "หนองใหญ่",        Zone: "East Zone 1",   avg_trip: 1.966154, rev: 2842.50 },
  { แพล้นท์: "นิคมพัฒนา 3",     Zone: "East Zone 1",   avg_trip: 2.411290, rev: 4748.50 },
  { แพล้นท์: "พะเยา3",          Zone: "Up country",    avg_trip: 2.575390, rev: 3752.43 },
  { แพล้นท์: "พะเยา",           Zone: "Up country",    avg_trip: 2.224545, rev: 3752.43 },
  { แพล้นท์: "คีรีนคร",         Zone: "Outer พัทยา",   avg_trip: 1.741935, rev: 4229.02 },
]

const SCCO_RAW = [
  { แพล้นท์: "Mobile Fleet 2", Zone: "Onsite", avg_trip: 6.059123 },
  { แพล้นท์: "NongDon 2",      Zone: "Onsite", avg_trip: 4.826970 },
  { แพล้นท์: "ถลาง",           Zone: "ESB1",   avg_trip: 3.678571 },
  { แพล้นท์: "บางบ่อ",         Zone: "East",   avg_trip: 4.362333 },
  { แพล้นท์: "บางปู 2",        Zone: "East",   avg_trip: 3.486280 },
  { แพล้นท์: "บางหญ้าแพรก",   Zone: "Inner",  avg_trip: 2.186207 },
  { แพล้นท์: "บางเสาธง",       Zone: "East",   avg_trip: 4.138089 },
  { แพล้นท์: "รามอินทรา3",     Zone: "Inner",  avg_trip: 2.659153 },
  { แพล้นท์: "ลาดกระบัง 2",   Zone: "East",   avg_trip: 3.227617 },
  { แพล้นท์: "สวนหลวง",        Zone: "East",   avg_trip: 2.908232 },
  { แพล้นท์: "เอเชีย IE",      Zone: "East",   avg_trip: 4.312409 },
]

// Zone colour palettes
const ASIA_ZONE_COLORS: Record<string, string> = {
  "BKK Central 1": "#4E79A7",
  "BKK Central 2": "#F28E2B",
  "BKK East":      "#E15759",
  "BKK North":     "#76B7B2",
  "BKK South 1":   "#59A14F",
  "BKK South 2":   "#EDC948",
  "BKK West 1":    "#B07AA1",
  "BKK West 2":    "#FF9DA7",
  "BKK West 3":    "#9C755F",
  "East Zone 1":   "#499894",
  "Up country":    "#A0CBE8",
  "Outer พัทยา":   "#D37295",
}

const SCCO_ZONE_COLORS: Record<string, string> = {
  "East":   "#4E79A7",
  "ESB1":   "#F28E2B",
  "Inner":  "#E15759",
  "Onsite": "#59A14F",
}

// Trip group helpers
function tripGroup(v: number) {
  if (v < 3.5) return "lessthan_3.5"
  if (v <= 4)  return "3.5-4"
  return "morethan_4"
}

const GROUP_ORDER  = ["lessthan_3.5", "3.5-4", "morethan_4"]
const GROUP_COLORS = { "lessthan_3.5": "#EF4444", "3.5-4": "#F59E0B", "morethan_4": "#10B981" }
const GROUP_LABELS = { "lessthan_3.5": "น้อยกว่า 3.5\nเที่ยว/วัน", "3.5-4": "3.5 – 4\nเที่ยว/วัน", "morethan_4": "มากกว่า 4\nเที่ยว/วัน" }

// Quadrant config (scatter tab)
const QUADRANT_CONFIG = {
  "ดีที่สุด":               { color: "#1D9E75", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50" },
  "เที่ยวน้อยแต่รายได้ดี":  { color: "#378ADD", bg: "bg-blue-50 dark:bg-blue-950/30",    text: "text-blue-700 dark:text-blue-400",    border: "border-blue-200 dark:border-blue-800/50"    },
  "วิ่งเยอะแต่รายได้น้อย": { color: "#EF9F27", bg: "bg-amber-50 dark:bg-amber-950/30",  text: "text-amber-700 dark:text-amber-400",  border: "border-amber-200 dark:border-amber-800/50"  },
  "ควรย้ายออก":             { color: "#E24B4A", bg: "bg-red-50 dark:bg-red-950/30",      text: "text-red-700 dark:text-red-400",      border: "border-red-200 dark:border-red-800/50"      },
}

const ZONES_ASIA = ["ทั้งหมด", ...Array.from(new Set(ASIA_RAW.map(d => d.Zone))).sort()]

function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ── Scatter custom dot ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScatterDot(props: any) {
  const { cx, cy, payload } = props
  if (!cx || !cy) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={payload.color} opacity={0.88} stroke="#fff" strokeWidth={1.2} />
      <text x={cx + 8} y={cy + 4} fontSize={9.5} className="fill-gray-600 dark:fill-gray-300">{payload.แพล้นท์}</text>
    </g>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const cfg = QUADRANT_CONFIG[d.quadrant as keyof typeof QUADRANT_CONFIG]
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a2e] shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{d.แพล้นท์}</p>
      <p className="text-gray-400 text-xs mb-1">{d.Zone}</p>
      <p className="text-xs text-gray-700 dark:text-gray-300">เที่ยว/วัน: <strong>{d.avg_trip.toFixed(2)}</strong></p>
      <p className="text-xs text-gray-700 dark:text-gray-300">รายได้/วัน/คัน: <strong>{d._rev.toLocaleString("th-TH", { minimumFractionDigits: 0 })} ฿</strong></p>
      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>{d.quadrant}</span>
    </div>
  )
}

// ── Shared card wrapper ──
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] p-5">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ── Zone detail component (Asia or Scco) ──
function ZoneDetail({ raw, zoneColors, thresholds }: {
  raw: { แพล้นท์: string; Zone: string; avg_trip: number }[]
  zoneColors: Record<string, string>
  thresholds: number[]
}) {
  const sorted = [...raw].sort((a, b) => a.Zone.localeCompare(b.Zone) || b.avg_trip - a.avg_trip)
  const zones  = Array.from(new Set(sorted.map(d => d.Zone))).sort()

  const zoneSummary = zones.map(z => {
    const items = sorted.filter(d => d.Zone === z)
    return { Zone: z, avg: items.reduce((s, d) => s + d.avg_trip, 0) / items.length, count: items.length }
  }).sort((a, b) => b.avg - a.avg)

  const best  = sorted.reduce((a, b) => a.avg_trip > b.avg_trip ? a : b)
  const worst = sorted.reduce((a, b) => a.avg_trip < b.avg_trip ? a : b)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ZoneTip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a2e] shadow-lg p-2.5 text-xs">
        <p className="font-semibold text-gray-900 dark:text-white">{d.Zone ?? d.แพล้นท์}</p>
        {d.avg !== undefined && <p className="text-gray-600 dark:text-gray-400">เฉลี่ย: <strong>{d.avg.toFixed(2)}</strong> เที่ยว/วัน</p>}
        {d.count !== undefined && <p className="text-gray-600 dark:text-gray-400">{d.count} แพล้นท์</p>}
        {d.avg_trip !== undefined && <p className="text-gray-600 dark:text-gray-400">avg_trip: <strong>{d.avg_trip.toFixed(2)}</strong></p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* shared height so both X-axes sit at the same level */}
        {(() => {
          const chartH = Math.max(320, zoneSummary.length * 34 + 70)
          return (
            <>
              {/* Zone avg */}
              <ChartCard title="① ค่าเฉลี่ยเที่ยววิ่งต่อวัน แยกตามโซน">
                <ResponsiveContainer width="100%" height={chartH}>
                  <BarChart layout="vertical" data={zoneSummary} margin={{ left: 10, right: 55, top: 4, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-gray-100 dark:text-white/5" />
                    <XAxis type="number" domain={[0, Math.ceil(zoneSummary[0].avg + 1)]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="Zone" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip content={<ZoneTip />} />
                    {thresholds.map(t => (
                      <ReferenceLine key={t} x={t} stroke={t <= 3.5 ? "#EF4444" : "#10B981"} strokeDasharray="4 3" strokeWidth={1.2} />
                    ))}
                    <Bar dataKey="avg" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="avg" position="right" formatter={(v: unknown) => typeof v === "number" ? v.toFixed(2) : ""} style={{ fontSize: 10, fill: "#6b7280" }} />
                      {zoneSummary.map((d, i) => <Cell key={i} fill={zoneColors[d.Zone] ?? "#94a3b8"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Zone count */}
              <ChartCard title="② จำนวนแพล้นท์ในแต่ละโซน">
                <ResponsiveContainer width="100%" height={chartH}>
                  <BarChart data={zoneSummary} margin={{ top: 4, right: 20, bottom: 50, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-gray-100 dark:text-white/5" />
                    <XAxis dataKey="Zone" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<ZoneTip />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="count" position="top" formatter={(v: unknown) => `${v}`} style={{ fontSize: 10, fill: "#6b7280" }} />
                      {zoneSummary.map((d, i) => <Cell key={i} fill={zoneColors[d.Zone] ?? "#94a3b8"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </>
          )
        })()}
      </div>

      {/* Per plant */}
      <ChartCard title="③ ค่าเฉลี่ยเที่ยววิ่งต่อวัน รายแพล้นท์ (เรียงตามโซน)">
        <ResponsiveContainer width="100%" height={Math.max(300, sorted.length * 26)}>
          <BarChart layout="vertical" data={sorted} margin={{ left: 10, right: 60, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-gray-100 dark:text-white/5" />
            <XAxis type="number" domain={[0, Math.ceil(sorted[0].avg_trip + 1.5)]} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="แพล้นท์" tick={{ fontSize: 9 }} width={100} />
            <Tooltip content={<ZoneTip />} />
            {thresholds.map(t => (
              <ReferenceLine key={t} x={t} stroke={t <= 3.5 ? "#EF4444" : "#10B981"} strokeDasharray="4 3" strokeWidth={1.2} />
            ))}
            <Bar dataKey="avg_trip" radius={[0, 4, 4, 0]}>
              <LabelList dataKey="avg_trip" position="right" formatter={(v: unknown) => typeof v === "number" ? v.toFixed(2) : ""} style={{ fontSize: 9, fill: "#6b7280" }} />
              {sorted.map((d, i) => <Cell key={i} fill={zoneColors[d.Zone] ?? "#94a3b8"} opacity={d.แพล้นท์ === best.แพล้นท์ || d.แพล้นท์ === worst.แพล้นท์ ? 1 : 0.82} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-2">
          🏆 ดีที่สุด: <strong>{best.แพล้นท์}</strong> ({best.avg_trip.toFixed(2)} เที่ยว/วัน) &nbsp;·&nbsp;
          ⚠️ น้อยที่สุด: <strong>{worst.แพล้นท์}</strong> ({worst.avg_trip.toFixed(2)} เที่ยว/วัน)
        </p>
        {/* Zone legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {zones.map(z => (
            <span key={z} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: zoneColors[z] ?? "#94a3b8" }} />
              {z}
            </span>
          ))}
        </div>
      </ChartCard>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = ["Scatter", "Overview", "Asia", "Scco"] as const
type Tab = typeof TABS[number]

export default function AsiaPlantAnalysisPage() {
  const [tab,       setTab]       = useState<Tab>("Scatter")
  const [zone,      setZone]      = useState("ทั้งหมด")
  const [highlight, setHighlight] = useState<string | null>(null)

  // ── Scatter tab data ──
  const filtered = useMemo(() => {
    return zone === "ทั้งหมด" ? ASIA_RAW : ASIA_RAW.filter(d => d.Zone === zone)
  }, [zone])

  const medTrip = useMemo(() => median(filtered.map(d => d.avg_trip)), [filtered])
  const medRev  = useMemo(() => median(filtered.map(d => d.rev)), [filtered])

  const scatterData = useMemo(() => filtered.map(d => {
    const revVal = d.rev
    const lt = d.avg_trip < medTrip
    const hr = revVal     > medRev
    let quadrant: keyof typeof QUADRANT_CONFIG
    if (!lt && hr)       quadrant = "ดีที่สุด"
    else if (lt && hr)   quadrant = "เที่ยวน้อยแต่รายได้ดี"
    else if (!lt && !hr) quadrant = "วิ่งเยอะแต่รายได้น้อย"
    else                 quadrant = "ควรย้ายออก"
    return { ...d, quadrant, color: QUADRANT_CONFIG[quadrant].color, _rev: revVal }
  }), [filtered, medTrip, medRev])

  const quadSummary = useMemo(() => {
    const counts: Record<string, typeof scatterData> = {}
    for (const q of Object.keys(QUADRANT_CONFIG)) counts[q] = []
    scatterData.forEach(d => counts[d.quadrant].push(d))
    return counts
  }, [scatterData])

  // ── Overview tab data ──
  const overviewData = useMemo(() => GROUP_ORDER.map(g => ({
    group: g,
    label: GROUP_LABELS[g as keyof typeof GROUP_LABELS],
    asia:  ASIA_RAW.filter(d => tripGroup(d.avg_trip) === g).length,
    scco:  SCCO_RAW.filter(d => tripGroup(d.avg_trip) === g).length,
  })), [])

  const TAB_LABELS: Record<Tab, string> = {
    Scatter:  "Scatter Analysis",
    Overview: "กลุ่มเที่ยววิ่ง",
    Asia:     "Asia Detail",
    Scco:     "Scco Detail",
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Asia Plant Analysis</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">วิเคราะห์ประสิทธิภาพการวิ่งรายแพล้นท์ · Jan-May 2026</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/3 p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              tab === t
                ? "bg-white dark:bg-[#1a1a2e] shadow-sm text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── TAB: Scatter ── */}
      {tab === "Scatter" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">avg_trip vs รายได้/วัน/คัน — Asia Q1 2026</p>
            <div className="flex items-center gap-3">
              <select
                value={zone}
                onChange={e => setZone(e.target.value)}
                className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f1117] text-sm px-3 py-2 text-gray-700 dark:text-gray-300 focus:outline-none"
              >
                {ZONES_ASIA.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.entries(QUADRANT_CONFIG) as [keyof typeof QUADRANT_CONFIG, typeof QUADRANT_CONFIG[keyof typeof QUADRANT_CONFIG]][]).map(([q, cfg]) => (
              <button key={q} onClick={() => setHighlight(highlight === q ? null : q)}
                className={`rounded-xl border p-4 text-left transition-all ${cfg.border} ${cfg.bg} ${highlight === q ? "ring-2" : "opacity-90 hover:opacity-100"}`}>
                <div className={`text-2xl font-bold ${cfg.text}`}>{quadSummary[q].length}</div>
                <div className={`text-xs font-medium mt-0.5 ${cfg.text}`}>{q}</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">แพล้นท์</div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] p-5">
            <div className="flex flex-wrap gap-4 mb-4 text-xs">
              {(Object.entries(QUADRANT_CONFIG) as [keyof typeof QUADRANT_CONFIG, typeof QUADRANT_CONFIG[keyof typeof QUADRANT_CONFIG]][]).map(([q, cfg]) => (
                <span key={q} className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: cfg.color }} />
                  <span className="text-gray-600 dark:text-gray-400">{q}</span>
                </span>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={480}>
              <ScatterChart margin={{ top: 10, right: 40, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-white/5" />
                <XAxis type="number" dataKey="avg_trip" domain={[1.4, 3.8]} tickCount={7}
                  label={{ value: "avg_trip (เที่ยว/วัน)", position: "insideBottom", offset: -10, fontSize: 11 }} tick={{ fontSize: 10 }} />
                <YAxis type="number" dataKey="_rev" domain={[1400, 4400]}
                  tickFormatter={v => v.toLocaleString()}
                  label={{ value: "รายได้/วัน/คัน (฿)", angle: -90, position: "insideLeft", offset: 15, fontSize: 11 }}
                  tick={{ fontSize: 10 }} width={70} />
                <Tooltip content={<ScatterTip />} />
                <ReferenceLine x={medTrip} stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1.2} />
                <ReferenceLine y={medRev}  stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1.2} />
                <Scatter data={scatterData.filter(d => !highlight || d.quadrant === highlight)} shape={<ScatterDot />}>
                  {scatterData.filter(d => !highlight || d.quadrant === highlight).map((_, i) => <Cell key={i} />)}
                </Scatter>
                {highlight && (
                  <Scatter data={scatterData.filter(d => d.quadrant !== highlight)}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    shape={(p: any) => <circle cx={p.cx} cy={p.cy} r={5} fill="#d1d5db" opacity={0.3} />}>
                    {scatterData.filter(d => d.quadrant !== highlight).map((_, i) => <Cell key={i} fill="#d1d5db" />)}
                  </Scatter>
                )}
              </ScatterChart>
            </ResponsiveContainer>
            {/* Median explanation */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 dark:bg-white/4 border border-gray-200 dark:border-white/8 px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">เส้นแนวตั้ง — avg_trip</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{medTrip.toFixed(2)} เที่ยว/วัน</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  แพล้นท์ครึ่งหนึ่งวิ่ง<span className="font-semibold text-gray-700 dark:text-gray-300">มากกว่า</span> {medTrip.toFixed(2)} เที่ยว/วัน
                  &nbsp;— อีกครึ่งวิ่ง<span className="font-semibold text-gray-700 dark:text-gray-300">น้อยกว่า</span>
                  <br />แพล้นท์ที่อยู่ <span className="font-semibold text-gray-700 dark:text-gray-300">ขวาของเส้น</span> = วิ่งได้มากกว่าค่ากลาง
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-white/4 border border-gray-200 dark:border-white/8 px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">เส้นแนวนอน — รายได้/วัน/คัน</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{medRev.toLocaleString("th-TH", { minimumFractionDigits: 0 })} ฿</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  แพล้นท์ครึ่งหนึ่งสร้างรายได้<span className="font-semibold text-gray-700 dark:text-gray-300">มากกว่า</span> {medRev.toLocaleString("th-TH", { minimumFractionDigits: 0 })} ฿/วัน/คัน
                  &nbsp;— อีกครึ่ง<span className="font-semibold text-gray-700 dark:text-gray-300">น้อยกว่า</span>
                  <br />แพล้นท์ที่อยู่ <span className="font-semibold text-gray-700 dark:text-gray-300">บนเส้น</span> = รายได้ดีกว่าค่ากลาง
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-2 text-center">
              เส้นประสีเทาในกราฟแบ่งแพล้นท์ออกเป็น 4 กลุ่มตามค่ามัธยฐาน (ค่ากลางของข้อมูล)
            </p>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-white/6">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">รายชื่อแพล้นท์ทั้งหมด</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/6 text-xs text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-2.5 text-left font-medium">แพล้นท์</th>
                    <th className="px-4 py-2.5 text-left font-medium">Zone</th>
                    <th className="px-4 py-2.5 text-right font-medium">avg_trip</th>
                    <th className="px-4 py-2.5 text-right font-medium">รายได้/วัน/คัน</th>
                    <th className="px-4 py-2.5 text-left font-medium">Quadrant</th>
                  </tr>
                </thead>
                <tbody>
                  {scatterData
                    .filter(d => !highlight || d.quadrant === highlight)
                    .sort((a, b) => a.Zone.localeCompare(b.Zone) || a.แพล้นท์.localeCompare(b.แพล้นท์, "th"))
                    .map((d, i) => {
                      const cfg = QUADRANT_CONFIG[d.quadrant as keyof typeof QUADRANT_CONFIG]
                      return (
                        <tr key={i} className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3">
                          <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{d.แพล้นท์}</td>
                          <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{d.Zone}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-700 dark:text-gray-300">{d.avg_trip.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-700 dark:text-gray-300">{d._rev.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>{d.quadrant}</span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Overview ── */}
      {tab === "Overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["Asia", "Scco"] as const).map(client => {
              const total = overviewData.reduce((s, d) => s + (client === "Asia" ? d.asia : d.scco), 0)
              const clientData = overviewData.map(d => ({
                group: d.group,
                label: d.label,
                value: client === "Asia" ? d.asia : d.scco,
                pct:   total > 0 ? Math.round((client === "Asia" ? d.asia : d.scco) / total * 100) : 0,
              }))

              return (
                <ChartCard key={client} title={`ผู้ว่าจ้าง: ${client} (รวม ${total} แพล้นท์)`}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={clientData} margin={{ top: 20, right: 20, bottom: 40, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-gray-100 dark:text-white/5" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10 }}
                        interval={0}
                        tickFormatter={(v: string) => v.replace("\n", " ")}
                      />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        <LabelList dataKey="value"  position="top"    formatter={(v: unknown) => `${v} แพล้นท์`}  style={{ fontSize: 11, fontWeight: 700 }} />
                        <LabelList dataKey="pct"    position="inside" formatter={(v: unknown) => typeof v === "number" && v > 0 ? `${v}%` : ""} style={{ fontSize: 10, fill: "#fff", fontWeight: 700 }} />
                        {clientData.map((d, i) => <Cell key={i} fill={GROUP_COLORS[d.group as keyof typeof GROUP_COLORS]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-sm">
            {GROUP_ORDER.map(g => (
              <span key={g} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded" style={{ background: GROUP_COLORS[g as keyof typeof GROUP_COLORS] }} />
                <span className="text-gray-600 dark:text-gray-400">{GROUP_LABELS[g as keyof typeof GROUP_LABELS].replace("\n", " ")}</span>
              </span>
            ))}
          </div>

          {/* Summary table */}
          <ChartCard title="สรุปจำนวนแพล้นท์แยกตามกลุ่ม">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/6 text-xs text-gray-500 dark:text-gray-400">
                  <th className="py-2 text-left font-medium">กลุ่ม</th>
                  <th className="py-2 text-center font-medium">Asia</th>
                  <th className="py-2 text-center font-medium">Scco</th>
                  <th className="py-2 text-center font-medium">รวม</th>
                </tr>
              </thead>
              <tbody>
                {overviewData.map((d, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-white/4">
                    <td className="py-2.5 flex items-center gap-2">
                      <span className="h-3 w-3 rounded" style={{ background: GROUP_COLORS[d.group as keyof typeof GROUP_COLORS] }} />
                      <span className="text-gray-700 dark:text-gray-300">{d.label.replace("\n", " ")}</span>
                    </td>
                    <td className="py-2.5 text-center font-semibold text-gray-900 dark:text-white">{d.asia}</td>
                    <td className="py-2.5 text-center font-semibold text-gray-900 dark:text-white">{d.scco}</td>
                    <td className="py-2.5 text-center font-semibold text-gray-900 dark:text-white">{d.asia + d.scco}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
        </div>
      )}

      {/* ── TAB: Asia Detail ── */}
      {tab === "Asia" && (
        <ZoneDetail raw={ASIA_RAW} zoneColors={ASIA_ZONE_COLORS} thresholds={[3.5]} />
      )}

      {/* ── TAB: Scco Detail ── */}
      {tab === "Scco" && (
        <ZoneDetail raw={SCCO_RAW} zoneColors={SCCO_ZONE_COLORS} thresholds={[3.5, 4.0]} />
      )}
    </div>
  )
}
