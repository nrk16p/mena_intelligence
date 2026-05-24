"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"

type TruckYearRow = {
  ประเภทยานพาหนะ: string
  ปี: number
  total_cost: number
  count_ทะเบียน: number
  avg_cost_per_ทะเบียน: number
  avg_per_month: number
  estimate_per_year: number
  year_x_truck: number
}

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length
  if (n < 2) return null
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return null
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

function fmt(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtInt(value: number) {
  return value.toLocaleString()
}

export default function TruckYearCostPage() {
  const [data, setData] = useState<TruckYearRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const res = await fetch("/api/truck-year-cost", { cache: "no-store" })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || "Failed")
        setData(json.data)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const allTypes = useMemo(
    () => Array.from(new Set(data.map((r) => r.ประเภทยานพาหนะ))).sort(),
    [data]
  )

  const allYears = useMemo(
    () => Array.from(new Set(data.map((r) => r.ปี))).sort((a, b) => a - b),
    [data]
  )

  const filtered = useMemo(() => {
    if (selectedTypes.size === 0) return data
    return data.filter((r) => selectedTypes.has(r.ประเภทยานพาหนะ))
  }, [data, selectedTypes])

  const trendData = useMemo(() => {
    const points = filtered.map((r) => ({ x: r.ปี, y: r.avg_cost_per_ทะเบียน }))
    const reg = linearRegression(points)
    if (!reg) return []
    const years = filtered.map((r) => r.ปี)
    const minY = Math.min(...years)
    const maxY = Math.max(...years)
    return [
      { ปี: minY, trend: reg.slope * minY + reg.intercept },
      { ปี: maxY, trend: reg.slope * maxY + reg.intercept },
    ]
  }, [filtered])

  const trendInsight = useMemo(() => {
    const points = filtered.map((r) => ({ x: r.ปี, y: r.avg_cost_per_ทะเบียน }))
    const reg = linearRegression(points)
    if (!reg || filtered.length < 2) return null
    const years = filtered.map((r) => r.ปี)
    const minYear = Math.min(...years)
    const maxYear = Math.max(...years)
    const valAtMin = reg.slope * minYear + reg.intercept
    const valAtMax = reg.slope * maxYear + reg.intercept
    const totalDiff = valAtMax - valAtMin
    const pct = valAtMin !== 0 ? (totalDiff / valAtMin) * 100 : 0
    const yearSpan = maxYear - minYear
    return { slope: reg.slope, minYear, maxYear, yearSpan, valAtMin, valAtMax, totalDiff, pct }
  }, [filtered])

  // show every 2nd year on x axis when there are many years
  const xTicks = useMemo(() => {
    if (allYears.length <= 10) return allYears
    return allYears.filter((_, i) => i % 2 === 0)
  }, [allYears])

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const totals = useMemo(() => ({
    total_cost: filtered.reduce((s, r) => s + r.total_cost, 0),
    year_x_truck: filtered.reduce((s, r) => s + r.year_x_truck, 0),
  }), [filtered])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Truck Year Cost</h1>
        <p className="text-sm text-muted-foreground">ต้นทุนรายประเภทรถ × ปีรถ พร้อมค่าประมาณการ</p>
      </div>

      {/* Data source note */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs text-blue-600">
        📦 Collection: <span className="font-medium">stockmovement</span>
        <span className="mx-2 text-blue-300">·</span>จุดประสงค์: <span className="font-medium">ซ่อม</span>
        <span className="mx-2 text-blue-300">·</span>ไม่รวม: <span className="font-medium">ยาง, PM</span>
        <span className="mx-2 text-blue-300">·</span>ช่วงเวลา: <span className="font-medium">ม.ค. 2023 — พ.ค. 2026</span>
      </div>

      {/* Filter chips */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">กรองประเภทรถ</span>
          {selectedTypes.size > 0 && (
            <button
              onClick={() => setSelectedTypes(new Set())}
              className="text-xs text-gray-500 underline hover:text-black"
            >
              ล้างทั้งหมด ({selectedTypes.size})
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {allTypes.map((type) => {
            const active = selectedTypes.has(type)
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400"
                }`}
              >
                {type}
              </button>
            )
          })}
        </div>
        {selectedTypes.size > 0 && (
          <p className="text-xs text-gray-400">
            แสดง {Array.from(new Set(filtered.map((r) => r.ประเภทยานพาหนะ))).length} จาก {allTypes.length} ประเภทรถ ({filtered.length} แถว)
          </p>
        )}
      </div>

      {/* Scatter chart */}
      {!loading && filtered.length > 0 && (
        <div className="rounded-xl border bg-white p-5 space-y-4">
          {/* Chart header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">เฉลี่ย / คัน vs ปีรถ</p>
              <p className="text-xs text-gray-400">X = ปีรถ &nbsp;·&nbsp; Y = เฉลี่ย/คัน (บาท)</p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 opacity-80 shrink-0" />
                <span>แต่ละจุด = ประเภทรถ × ปีรถ</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="24" height="10" className="shrink-0">
                  <line x1="0" y1="5" x2="24" y2="5" stroke="#ef4444" strokeWidth="2" strokeDasharray="6 3" />
                </svg>
                <span>Trend Line — ทิศทางภาพรวม ยิ่งชันมาก ค่าซ่อมเพิ่มเร็วตามอายุ</span>
              </div>
            </div>
          </div>

          {/* Insight cards */}
          {trendInsight && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                <p className="text-xs text-gray-500">ทุกๆ 1 ปีที่รถอายุมากขึ้น</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-orange-700">
                  ▲ {fmt(Math.abs(trendInsight.slope))} บาท/คัน
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  ค่าซ่อมเฉลี่ยต่อคัน เพิ่มขึ้นประมาณ {fmt(Math.abs(trendInsight.slope))} บาท ต่อปีอายุ
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">
                  ปี {trendInsight.maxYear} (ใหม่สุด) vs ปี {trendInsight.minYear} (เก่าสุด)
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-gray-800">
                  ต่างกัน {fmt(Math.abs(trendInsight.totalDiff))} บาท
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {fmt(trendInsight.valAtMin)} → {fmt(trendInsight.valAtMax)} บาท
                </p>
              </div>

              <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                <p className="text-xs text-gray-500">ค่าซ่อมเพิ่มขึ้นเฉลี่ยต่อปีอายุรถ</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-orange-700">
                  {trendInsight.yearSpan > 0
                    ? (Math.abs(trendInsight.pct) / trendInsight.yearSpan).toFixed(1)
                    : "—"}% / ปี
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  รวม {trendInsight.yearSpan} ปี เพิ่มขึ้น {Math.abs(trendInsight.pct).toFixed(1)}%
                  &nbsp;({Math.abs(trendInsight.pct).toFixed(1)}% ÷ {trendInsight.yearSpan} ปี)
                </p>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 16, bottom: 32, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="ปี"
                  domain={["auto", "auto"]}
                  allowDuplicatedCategory={false}
                  ticks={xTicks}
                  tickFormatter={(v) => String(Math.round(v))}
                  angle={-40}
                  textAnchor="end"
                  height={48}
                  axisLine={{ stroke: "#374151", strokeWidth: 1.5 }}
                  tickLine={{ stroke: "#374151" }}
                  tick={{ fontSize: 12, fill: "#111827", fontWeight: 600 }}
                />
                <YAxis
                  type="number"
                  dataKey="avg_cost_per_ทะเบียน"
                  tickFormatter={(v) => (v / 1000).toFixed(0) + "K"}
                  axisLine={{ stroke: "#374151", strokeWidth: 1.5 }}
                  tickLine={{ stroke: "#374151" }}
                  tick={{ fontSize: 12, fill: "#374151" }}
                  label={{
                    value: "เฉลี่ย/คัน (บาท)",
                    angle: -90,
                    position: "insideLeft",
                    offset: -44,
                    fontSize: 11,
                    fill: "#6b7280",
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload as TruckYearRow
                    if (!d.ประเภทยานพาหนะ) return null
                    return (
                      <div className="rounded-lg border bg-white p-3 text-xs shadow-lg space-y-1 max-w-[220px]">
                        <p className="font-semibold text-sm leading-tight">{d.ประเภทยานพาหนะ}</p>
                        <p className="text-gray-500">ปีรถ: <span className="font-medium text-gray-800">{d.ปี}</span></p>
                        <p className="text-gray-500">เฉลี่ย/คัน: <span className="font-medium text-gray-800">{fmt(d.avg_cost_per_ทะเบียน)}</span></p>
                        <p className="text-gray-500">จำนวนคัน: <span className="font-medium text-gray-800">{fmtInt(d.count_ทะเบียน)}</span></p>
                        <p className="text-gray-500">ต้นทุนรวม: <span className="font-medium text-gray-800">{fmt(d.total_cost)}</span></p>
                      </div>
                    )
                  }}
                />
                <Scatter data={filtered} fill="#4f46e5" fillOpacity={0.75} r={5} />
                <Line
                  data={trendData}
                  type="linear"
                  dataKey="trend"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">
              {filtered.length.toLocaleString()} แถว{selectedTypes.size > 0 && " (กรองแล้ว)"}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b">
                  <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold min-w-[180px]">
                    <div>ประเภทรถ</div>
                    <div className="text-xs font-normal text-gray-400">Vehicle Type</div>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    <div>ปีรถ</div>
                    <div className="text-xs font-normal text-gray-400">Model Year</div>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    <div>ต้นทุนรวม</div>
                    <div className="text-xs font-normal text-gray-400">Actual Total Cost</div>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    <div>จำนวนคัน</div>
                    <div className="text-xs font-normal text-gray-400"># Trucks</div>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    <div>เฉลี่ย / คัน</div>
                    <div className="text-xs font-normal text-gray-400">ต้นทุนรวม ÷ จำนวนคัน</div>
                  </th>
                  <th className="whitespace-nowrap bg-indigo-50 px-4 py-3 text-right font-semibold">
                    <div className="inline-flex items-center gap-1">
                      <span>เฉลี่ย / คัน / เดือน</span>
                      <span className="group relative cursor-default inline-flex">
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-[10px] font-bold leading-none text-indigo-700">i</span>
                        <div className="pointer-events-none absolute right-0 top-7 z-50 hidden w-80 rounded-xl border border-indigo-100 bg-white p-4 text-left font-normal shadow-xl group-hover:block">
                          <p className="text-sm font-semibold text-gray-900 mb-2">ทำไมหาร 40 เดือน?</p>
                          <p className="text-sm text-gray-600">ข้อมูลครอบคลุมตั้งแต่ <span className="font-semibold text-gray-800">ม.ค. 2023 — พ.ค. 2026</span></p>
                          <div className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-gray-600">
                            <p>(2026 − 2023) × 12 + (5 − 1)</p>
                            <p>= 36 + 4 = <span className="font-bold text-indigo-600 text-base">40 เดือน</span></p>
                          </div>
                          <p className="mt-2 text-sm text-gray-600">หารด้วย 40 เพื่อให้ได้ต้นทุนเฉลี่ย <span className="font-semibold text-gray-800">ต่อคัน ต่อเดือน</span></p>
                        </div>
                      </span>
                    </div>
                    <div className="text-xs font-normal text-indigo-300">÷ 40 เดือน (ม.ค. 2023 — พ.ค. 2026)</div>
                  </th>
                  <th className="whitespace-nowrap bg-indigo-50 px-4 py-3 text-right font-semibold">
                    <div>ประมาณการ / คัน / ปี</div>
                    <div className="text-xs font-normal text-indigo-300">× 12 เดือน</div>
                  </th>
                  <th className="whitespace-nowrap bg-indigo-50 px-4 py-3 text-right font-semibold">
                    <div>ประมาณการทั้งฝูง / ปี</div>
                    <div className="text-xs font-normal text-indigo-300">× จำนวนคัน</div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-400">ไม่มีข้อมูล</td>
                  </tr>
                )}
                {filtered.map((row, i) => {
                  const isEven = i % 2 === 0
                  const rowBg = isEven ? "bg-white" : "bg-gray-50/60"
                  return (
                    <tr key={`${row.ประเภทยานพาหนะ}-${row.ปี}`} className={`border-b hover:bg-blue-50/30 ${rowBg}`}>
                      <td className={`sticky left-0 z-10 whitespace-nowrap px-4 py-2.5 font-medium ${rowBg}`}>
                        <span className="block max-w-[180px] truncate">{row.ประเภทยานพาหนะ}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{row.ปี}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(row.total_cost)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmtInt(row.count_ทะเบียน)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{fmt(row.avg_cost_per_ทะเบียน)}</td>
                      <td className="whitespace-nowrap bg-indigo-50/40 px-4 py-2.5 text-right tabular-nums">{fmt(row.avg_per_month)}</td>
                      <td className="whitespace-nowrap bg-indigo-50/40 px-4 py-2.5 text-right tabular-nums">{fmt(row.estimate_per_year)}</td>
                      <td className="whitespace-nowrap bg-indigo-50/40 px-4 py-2.5 text-right tabular-nums">{fmt(row.year_x_truck)}</td>
                    </tr>
                  )
                })}

                {/* Total row */}
                {filtered.length > 0 && (
                  <tr className="border-t-2 border-gray-400 bg-gray-100 font-bold">
                    <td className="sticky left-0 z-10 bg-gray-100 px-4 py-3">รวม</td>
                    <td className="px-4 py-3" />
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fmt(totals.total_cost)}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="bg-indigo-100 px-4 py-3" />
                    <td className="bg-indigo-100 px-4 py-3" />
                    <td className="whitespace-nowrap bg-indigo-100 px-4 py-3 text-right tabular-nums">{fmt(totals.year_x_truck)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
