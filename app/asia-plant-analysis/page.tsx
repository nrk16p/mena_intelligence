"use client"

import { useMemo, useState } from "react"
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts"

// ── Static data ──────────────────────────────────────────────────────────────
const RAW = [
  { แพล้นท์: "รัชดา1",          Zone: "BKK Central 1", avg_trip: 2.717966, rev: 3349.88 },
  { แพล้นท์: "รัชดา2",          Zone: "BKK Central 1", avg_trip: 2.343506, rev: 3331.15 },
  { แพล้นท์: "หัวหมาก",         Zone: "BKK Central 1", avg_trip: 2.290933, rev: 3705.60 },
  { แพล้นท์: "ศูนย์วิจัย",      Zone: "BKK Central 1", avg_trip: 1.664009, rev: 2917.41 },
  { แพล้นท์: "ลาดกระบัง",       Zone: "BKK Central 2", avg_trip: 2.740048, rev: 1788.71 },
  { แพล้นท์: "บางเสาธง",        Zone: "BKK East",      avg_trip: 2.964286, rev: 3282.32 },
  { แพล้นท์: "บางบ่อ",          Zone: "BKK East",      avg_trip: 1.806452, rev: 3445.00 },
  { แพล้นท์: "เชียงรากน้อย",    Zone: "BKK North",     avg_trip: 2.884343, rev: 3298.25 },
  { แพล้นท์: "ลำลูกกาคลอง8",   Zone: "BKK North",     avg_trip: 2.664464, rev: 3364.20 },
  { แพล้นท์: "หทัยราษฎร์",      Zone: "BKK North",     avg_trip: 2.528802, rev: 2519.52 },
  { แพล้นท์: "สรงประภา",        Zone: "BKK North",     avg_trip: 2.463553, rev: 3435.90 },
  { แพล้นท์: "ลำลูกกาคลอง12",  Zone: "BKK North",     avg_trip: 2.418974, rev: 3981.71 },
  { แพล้นท์: "บางปะอิน",        Zone: "BKK North",     avg_trip: 2.047235, rev: 3299.32 },
  { แพล้นท์: "บางหญ้าแพรก",     Zone: "BKK South 1",   avg_trip: 2.016839, rev: 3777.05 },
  { แพล้นท์: "หนามแดง",         Zone: "BKK South 2",   avg_trip: 2.604423, rev: 3644.97 },
  { แพล้นท์: "ปทุมธานี",        Zone: "BKK West 1",    avg_trip: 3.496705, rev: 3824.34 },
  { แพล้นท์: "สามัคคี",         Zone: "BKK West 1",    avg_trip: 2.319019, rev: 2880.60 },
  { แพล้นท์: "บางบัวทอง",       Zone: "BKK West 1",    avg_trip: 2.281771, rev: 2859.02 },
  { แพล้นท์: "ตลิ่งชัน",        Zone: "BKK West 2",    avg_trip: 2.521021, rev: 2954.66 },
  { แพล้นท์: "บางกรวย",         Zone: "BKK West 2",    avg_trip: 2.171271, rev: 2811.56 },
  { แพล้นท์: "พระรามห้า",       Zone: "BKK West 2",    avg_trip: 1.951333, rev: 2929.80 },
  { แพล้นท์: "สมุทรสาคร",       Zone: "BKK West 3",    avg_trip: 2.641563, rev: 2893.93 },
  { แพล้นท์: "อ้อมแก้ว",        Zone: "East Zone 1",   avg_trip: 3.056777, rev: 4046.29 },
  { แพล้นท์: "นาเกลือ",         Zone: "East Zone 1",   avg_trip: 2.973912, rev: 3233.44 },
  { แพล้นท์: "หนองขาม",         Zone: "East Zone 1",   avg_trip: 2.718988, rev: 3481.70 },
  { แพล้นท์: "บ่อวิน",          Zone: "East Zone 1",   avg_trip: 2.560979, rev: 3287.19 },
  { แพล้นท์: "สัตหีบ",          Zone: "East Zone 1",   avg_trip: 2.300987, rev: 3195.82 },
  { แพล้นท์: "แหลมฉบัง",        Zone: "East Zone 1",   avg_trip: 2.195313, rev: 2832.40 },
  { แพล้นท์: "พัทยา3",          Zone: "East Zone 1",   avg_trip: 2.042512, rev: 3128.01 },
  { แพล้นท์: "บ้านฉาง",         Zone: "East Zone 1",   avg_trip: 1.916071, rev: 3087.37 },
  { แพล้นท์: "พานทอง",          Zone: "East Zone 1",   avg_trip: 1.860016, rev: 3910.37 },
  { แพล้นท์: "หนองใหญ่",        Zone: "East Zone 1",   avg_trip: 1.719442, rev: 2480.43 },
  { แพล้นท์: "พะเยา3",          Zone: "Up country",    avg_trip: 2.683316, rev: 2976.33 },
  { แพล้นท์: "พะเยา",           Zone: "Up country",    avg_trip: 2.423645, rev: 1967.03 },
]

const QUADRANT_CONFIG = {
  "ดีที่สุด":               { color: "#1D9E75", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50" },
  "เที่ยวน้อยแต่รายได้ดี":  { color: "#378ADD", bg: "bg-blue-50 dark:bg-blue-950/30",    text: "text-blue-700 dark:text-blue-400",    border: "border-blue-200 dark:border-blue-800/50"    },
  "วิ่งเยอะแต่รายได้น้อย": { color: "#EF9F27", bg: "bg-amber-50 dark:bg-amber-950/30",  text: "text-amber-700 dark:text-amber-400",  border: "border-amber-200 dark:border-amber-800/50"  },
  "ควรย้ายออก":             { color: "#E24B4A", bg: "bg-red-50 dark:bg-red-950/30",      text: "text-red-700 dark:text-red-400",      border: "border-red-200 dark:border-red-800/50"      },
}

const ZONES = ["ทั้งหมด", ...Array.from(new Set(RAW.map(d => d.Zone))).sort()]

function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Custom dot with label
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomDot(props: any) {
  const { cx, cy, payload } = props
  if (!cx || !cy) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={payload.color} opacity={0.88} stroke="#fff" strokeWidth={1.2} />
      <text x={cx + 8} y={cy + 4} fontSize={9.5} fill="currentColor" className="fill-gray-600 dark:fill-gray-300">
        {payload.แพล้นท์}
      </text>
    </g>
  )
}

// Custom tooltip
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const cfg = QUADRANT_CONFIG[d.quadrant as keyof typeof QUADRANT_CONFIG]
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a2e] shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-900 dark:text-white mb-1.5">{d.แพล้นท์}</p>
      <p className="text-gray-500 dark:text-gray-400 text-xs mb-1.5">{d.Zone}</p>
      <div className="space-y-0.5 text-xs">
        <p className="text-gray-700 dark:text-gray-300">เที่ยว/วัน: <span className="font-semibold">{d.avg_trip.toFixed(2)}</span></p>
        <p className="text-gray-700 dark:text-gray-300">รายได้/วัน/คัน: <span className="font-semibold">{d.rev.toLocaleString("th-TH", { minimumFractionDigits: 0 })} ฿</span></p>
      </div>
      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
        {d.quadrant}
      </span>
    </div>
  )
}

export default function AsiaPlantAnalysisPage() {
  const [zone, setZone] = useState("ทั้งหมด")
  const [highlight, setHighlight] = useState<string | null>(null)

  const filtered = useMemo(
    () => zone === "ทั้งหมด" ? RAW : RAW.filter(d => d.Zone === zone),
    [zone]
  )

  const medTrip = useMemo(() => median(filtered.map(d => d.avg_trip)), [filtered])
  const medRev  = useMemo(() => median(filtered.map(d => d.rev)),       [filtered])

  const data = useMemo(() => filtered.map(d => {
    const lt = d.avg_trip < medTrip
    const hr = d.rev      > medRev
    let quadrant: keyof typeof QUADRANT_CONFIG
    if (!lt && hr)       quadrant = "ดีที่สุด"
    else if (lt && hr)   quadrant = "เที่ยวน้อยแต่รายได้ดี"
    else if (!lt && !hr) quadrant = "วิ่งเยอะแต่รายได้น้อย"
    else                 quadrant = "ควรย้ายออก"
    return { ...d, quadrant, color: QUADRANT_CONFIG[quadrant].color }
  }), [filtered, medTrip, medRev])

  const summary = useMemo(() => {
    const counts: Record<string, typeof data> = {}
    for (const q of Object.keys(QUADRANT_CONFIG)) counts[q] = []
    data.forEach(d => counts[d.quadrant].push(d))
    return counts
  }, [data])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Asia — Plant Analysis</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            เปรียบเทียบ avg_trip vs รายได้/วัน/คัน แยกตาม Quadrant · Q1 2026
          </p>
        </div>
        <select
          value={zone}
          onChange={e => setZone(e.target.value)}
          className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f1117] text-sm px-3 py-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white/30"
        >
          {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      {/* Quadrant summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(QUADRANT_CONFIG) as [keyof typeof QUADRANT_CONFIG, typeof QUADRANT_CONFIG[keyof typeof QUADRANT_CONFIG]][]).map(([q, cfg]) => (
          <button
            key={q}
            onClick={() => setHighlight(highlight === q ? null : q)}
            className={`rounded-xl border p-4 text-left transition-all ${cfg.border} ${cfg.bg} ${highlight === q ? "ring-2 ring-offset-1" : "opacity-90 hover:opacity-100"}`}
            style={{ ["--tw-ring-color" as string]: cfg.color }}
          >
            <div className={`text-2xl font-bold ${cfg.text}`}>{summary[q].length}</div>
            <div className={`text-xs font-medium mt-0.5 ${cfg.text}`}>{q}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">แพล้นท์</div>
          </button>
        ))}
      </div>

      {/* Scatter chart */}
      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] p-5">
        <div className="flex flex-wrap gap-4 mb-4 text-xs">
          {(Object.entries(QUADRANT_CONFIG) as [keyof typeof QUADRANT_CONFIG, typeof QUADRANT_CONFIG[keyof typeof QUADRANT_CONFIG]][]).map(([q, cfg]) => (
            <span key={q} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: cfg.color }} />
              <span className="text-gray-600 dark:text-gray-400">{q}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="inline-block h-px w-5 border-t border-dashed border-gray-400" />
            <span className="text-gray-400">ค่ามัธยฐาน</span>
          </span>
        </div>

        <ResponsiveContainer width="100%" height={480}>
          <ScatterChart margin={{ top: 10, right: 40, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-100 dark:text-white/5" />
            <XAxis
              type="number" dataKey="avg_trip"
              name="avg_trip"
              domain={[1.4, 3.8]}
              tickCount={7}
              label={{ value: "avg_trip (เที่ยว/วัน)", position: "insideBottom", offset: -10, fontSize: 11 }}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              type="number" dataKey="rev"
              name="รายได้/วัน/คัน"
              domain={[1400, 4400]}
              tickFormatter={v => v.toLocaleString()}
              label={{ value: "รายได้/วัน/คัน (฿)", angle: -90, position: "insideLeft", offset: 15, fontSize: 11 }}
              tick={{ fontSize: 10 }}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={medTrip} stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1.2} />
            <ReferenceLine y={medRev}  stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1.2} />

            <Scatter
              data={data.filter(d => !highlight || d.quadrant === highlight)}
              shape={<CustomDot />}
            >
              {data
                .filter(d => !highlight || d.quadrant === highlight)
                .map((d, i) => <Cell key={i} fill={d.color} />)}
            </Scatter>

            {/* Faded dots for non-highlighted */}
            {highlight && (
              <Scatter
                data={data.filter(d => d.quadrant !== highlight)}
                shape={(props: unknown) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { cx, cy } = props as any
                  return <circle cx={cx} cy={cy} r={5} fill="#d1d5db" opacity={0.3} />
                }}
              >
                {data.filter(d => d.quadrant !== highlight).map((_, i) => <Cell key={i} fill="#d1d5db" />)}
              </Scatter>
            )}
          </ScatterChart>
        </ResponsiveContainer>

        <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-2 text-center">
          มัธยฐาน avg_trip: <strong>{medTrip.toFixed(2)}</strong> เที่ยว/วัน &nbsp;·&nbsp;
          มัธยฐาน รายได้: <strong>{medRev.toLocaleString("th-TH", { minimumFractionDigits: 0 })}</strong> ฿/วัน/คัน
        </p>
      </div>

      {/* Detail table */}
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
              {data
                .filter(d => !highlight || d.quadrant === highlight)
                .sort((a, b) => b.avg_trip - a.avg_trip)
                .map((d, i) => {
                  const cfg = QUADRANT_CONFIG[d.quadrant as keyof typeof QUADRANT_CONFIG]
                  return (
                    <tr key={i} className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{d.แพล้นท์}</td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{d.Zone}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700 dark:text-gray-300">{d.avg_trip.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700 dark:text-gray-300">
                        {d.rev.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
                          {d.quadrant}
                        </span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
