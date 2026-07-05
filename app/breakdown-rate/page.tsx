"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

// ─────────────────────────────────────────────────────────────────────────────
// Breakdown Rate — ลูกค้าโครงการ (TDM · BTG · TFG · SCCC · DHL · KN)
// ฟอร์แมตเดียวกับสไลด์ Fleet Reliability ใน /cost-report แต่ไม่มี ML/MS
// % = จำนวน breakdown (status B/BA) ÷ (จำนวนรถ × วันในเดือน) · ตัวเลขเล็ก = ครั้ง/วัน
// ─────────────────────────────────────────────────────────────────────────────

type ApiRow = {
  code:            string
  month_year:      string   // "MM-YY"
  truck_count:     number
  breakdown_count: number | string
}

const CUSTOMERS = [
  { code: "TDM",  name: "ทีดีเอ็ม ลอจิสติกส์",      color: "#2563EB" },
  { code: "BTG",  name: "เบทาโกร",                  color: "#F97316" },
  { code: "TFG",  name: "ไทย ฟู้ดส์ สไวน ฟาร์ม",     color: "#10B981" },
  { code: "SCCC", name: "ปูนซีเมนต์นครหลวง",         color: "#8B5CF6" },
  { code: "DHL",  name: "ดีเอชแอล ดิสทริบิวชั่น",    color: "#DC2626" },
  { code: "KN",   name: "คูห์เน่ แอนด์ นาเกิ้ล",     color: "#0891B2" },
] as const

const MONTH_LABEL: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
}

const daysInMonth = (year: number, mm: string) => new Date(year, Number(mm), 0).getDate()

// partner_flag vocabulary (dw_stockmovement) — flags present in these 6 fleets
const FLAG_OPTIONS = ["รถมีนา", "รถร่วมมีนา", "รถร่วมภายนอกบริษัท", "รถสำนักงาน"]

type MonthCell = {
  mm: string
  pCurr: number | null
  pPrev: number | null
  yoy:   number | null
  nCurr: number | null   // ครั้ง/วัน current year
  nPrev: number | null   // ครั้ง/วัน previous year
  trucksCurr: number | null
}

export default function BreakdownRatePage() {
  const today = new Date()
  const cy = today.getFullYear()
  const cm = String(today.getMonth() + 1).padStart(2, "0")

  const [startMonth, setStartMonth] = useState(`${cy}-01`)
  const [endMonth, setEndMonth]     = useState(`${cy}-${cm}`)
  const [curr, setCurr]             = useState<ApiRow[]>([])
  const [prev, setPrev]             = useState<ApiRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState("")
  const [focusFleet, setFocusFleet] = useState<string | null>(null)
  const [flagFilter, setFlagFilter] = useState<Set<string>>(new Set())
  const [savingPng, setSavingPng]   = useState(false)
  const slideRef = useRef<HTMLDivElement | null>(null)

  const year     = Number(startMonth.split("-")[0])
  const prevYear = year - 1
  const yy = (y: number) => String(y).slice(-2)

  // months in range (same year as startMonth)
  const months = useMemo(() => {
    const sm = Number(startMonth.split("-")[1])
    const emYear = Number(endMonth.split("-")[0])
    const em = emYear === year ? Number(endMonth.split("-")[1]) : 12
    const out: string[] = []
    for (let m = sm; m <= Math.max(sm, em); m++) out.push(String(m).padStart(2, "0"))
    return out
  }, [startMonth, endMonth, year])

  const periodLabel = months.length
    ? `${MONTH_LABEL[months[0]]} – ${MONTH_LABEL[months[months.length - 1]]} ${year}`
    : String(year)

  const flagParam = flagFilter.size > 0 ? `&partner_flag=${encodeURIComponent([...flagFilter].join(","))}` : ""

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError("")
      try {
        const [rc, rp] = await Promise.all([
          fetch(`/api/breakdown-rate/customers?year=${yy(year)}${flagParam}`,     { cache: "no-store" }),
          fetch(`/api/breakdown-rate/customers?year=${yy(prevYear)}${flagParam}`, { cache: "no-store" }),
        ])
        const [jc, jp] = await Promise.all([rc.json(), rp.json()])
        if (!jc.success) throw new Error(jc.error || "API error")
        if (!jp.success) throw new Error(jp.error || "API error")
        if (!cancelled) { setCurr(jc.data); setPrev(jp.data) }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "โหลดข้อมูลไม่สำเร็จ")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [year, prevYear, flagParam])

  // ── Per-customer monthly stats (same math as /fleet-report + MM Report) ─────
  const fleets = useMemo(() => CUSTOMERS.map((c) => {
    const find = (data: ApiRow[], mm: string, y: number) =>
      data.find((r) => r.code === c.code && r.month_year === `${mm}-${yy(y)}`)
    const rows: MonthCell[] = months.map((mm) => {
      const rc = find(curr, mm, year)
      const rp = find(prev, mm, prevYear)
      const pCurr = rc && Number(rc.truck_count) > 0
        ? (Number(rc.breakdown_count) / (Number(rc.truck_count) * daysInMonth(year, mm))) * 100 : null
      const pPrev = rp && Number(rp.truck_count) > 0
        ? (Number(rp.breakdown_count) / (Number(rp.truck_count) * daysInMonth(prevYear, mm))) * 100 : null
      return {
        mm, pCurr, pPrev,
        yoy: pCurr !== null && pPrev !== null && pPrev > 0 ? ((pCurr - pPrev) / pPrev) * 100 : null,
        nCurr: rc ? Number(rc.breakdown_count) / daysInMonth(year, mm) : null,
        nPrev: rp ? Number(rp.breakdown_count) / daysInMonth(prevYear, mm) : null,
        trucksCurr: rc ? Number(rc.truck_count) : null,
      }
    })
    const withP = rows.filter((r) => r.pCurr !== null)
    const avg = withP.length ? withP.reduce((s, r) => s + r.pCurr!, 0) / withP.length : null
    const paired = withP.filter((r) => r.pPrev !== null)
    const avgPrev = paired.length ? paired.reduce((s, r) => s + r.pPrev!, 0) / paired.length : null
    return {
      ...c,
      rows,
      avg,
      avgPrev,
      avgYoy: avg !== null && avgPrev !== null && avgPrev > 0 ? ((avg - avgPrev) / avgPrev) * 100 : null,
      best:  withP.length ? withP.reduce((b, r) => (r.pCurr! < b.pCurr! ? r : b)) : null,
      worst: withP.length ? withP.reduce((w, r) => (r.pCurr! > w.pCurr! ? r : w)) : null,
      trucks: rows.map((r) => r.trucksCurr ?? 0).reduce((m, n) => Math.max(m, n), 0) || null,
    }
  }), [curr, prev, months, year, prevYear])

  const hasData = fleets.some((f) => f.rows.some((r) => r.pCurr !== null))
  const shownFleets = focusFleet ? fleets.filter((f) => f.code === focusFleet) : fleets

  // ── Chart: all fleets = solid current-year lines; focused = solid vs dashed ─
  const chartData = useMemo(() => months.map((mm) => {
    const row: Record<string, string | number | null> = { month: MONTH_LABEL[mm] }
    fleets.forEach((f) => {
      const r = f.rows.find((x) => x.mm === mm)
      row[f.code] = r?.pCurr ?? null
      row[`${f.code} ${prevYear}`] = r?.pPrev ?? null
    })
    return row
  }), [fleets, months, prevYear])

  // ── Insights ────────────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const out: string[] = []
    const withAvg = fleets.filter((f) => f.avg !== null)
    if (!withAvg.length) return out
    const worst = [...withAvg].sort((a, b) => b.avg! - a.avg!)[0]
    const best  = [...withAvg].sort((a, b) => a.avg! - b.avg!)[0]
    out.push(`${worst.code} เฉลี่ยสูงสุด ${worst.avg!.toFixed(2)}% (${worst.name})`)
    out.push(`${best.code} ต่ำสุด ${best.avg!.toFixed(2)}%`)
    const worsened = withAvg.filter((f) => f.avgYoy !== null && f.avgYoy > 0).sort((a, b) => b.avgYoy! - a.avgYoy!)[0]
    const improved = withAvg.filter((f) => f.avgYoy !== null && f.avgYoy < 0).sort((a, b) => a.avgYoy! - b.avgYoy!)[0]
    if (worsened) out.push(`${worsened.code} แย่กว่าปีก่อน +${worsened.avgYoy!.toFixed(0)}% (${worsened.avgPrev!.toFixed(2)}% → ${worsened.avg!.toFixed(2)}%)`)
    if (improved) out.push(`${improved.code} ดีกว่าปีก่อน ${improved.avgYoy!.toFixed(0)}% (${improved.avgPrev!.toFixed(2)}% → ${improved.avg!.toFixed(2)}%)`)
    return out
  }, [fleets])

  const pctColor = (p: number | null) =>
    p === null ? "text-gray-300" : p >= 10 ? "text-red-500" : p >= 5 ? "text-amber-600" : "text-emerald-700"

  const savePng = async () => {
    const el = slideRef.current
    if (!el || savingPng) return
    setSavingPng(true)
    try {
      const { toBlob } = await import("html-to-image")
      const opts = {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        // the slide uses system fonts — skip web-font embedding, which throws
        // CORS SecurityError on the Google Fonts stylesheet and slows capture
        skipFonts: true,
        filter: (node: Node) => !(node instanceof HTMLElement && node.dataset.noExport !== undefined),
      }
      // WebKit/Safari: first capture can come back blank — warm up, then capture
      await toBlob(el, opts)
      const blob = await toBlob(el, opts)
      if (!blob) throw new Error("capture returned empty image")
      // blob + object URL downloads reliably across Chrome/Safari/Firefox
      // (data: URLs on an un-attached anchor silently fail on Safari)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.download = `breakdown-rate-customers-${year}.png`
      a.href = url
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e: any) {
      console.error("save png failed", e)
      setError(`บันทึก PNG ไม่สำเร็จ: ${e?.message || e}`)
    } finally {
      setSavingPng(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Controls (outside the exported slide) */}
      <div className="flex flex-wrap items-end gap-3" data-no-export>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">เดือนเริ่มต้น</label>
          <input
            type="month" value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">เดือนสิ้นสุด</label>
          <input
            type="month" value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        {/* Fleet focus chips */}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFocusFleet(null)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              focusFleet === null ? "border-transparent bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-gray-400"
            }`}
          >
            ทั้งหมด
          </button>
          {CUSTOMERS.map((c) => (
            <button
              key={c.code}
              onClick={() => setFocusFleet((f) => (f === c.code ? null : c.code))}
              className="rounded-full border px-3 py-1 text-xs font-semibold transition"
              style={focusFleet === c.code
                ? { background: c.color, color: "#fff", borderColor: "transparent" }
                : { background: "#fff", color: c.color, borderColor: `${c.color}55` }}
            >
              {c.code}
            </button>
          ))}
        </div>
      </div>

      {/* Partner-flag filter */}
      <div className="flex flex-wrap items-center gap-1.5" data-no-export>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Partner Flag:</span>
        <button
          onClick={() => setFlagFilter(new Set())}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
            flagFilter.size === 0 ? "border-transparent bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-emerald-400"
          }`}
        >
          ทั้งหมด
        </button>
        {FLAG_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => setFlagFilter((prev) => {
              const next = new Set(prev)
              if (next.has(f)) next.delete(f); else next.add(f)
              return next
            })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              flagFilter.has(f) ? "border-transparent bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-500 hover:border-emerald-400"
            }`}
          >
            {f}
          </button>
        ))}
        {flagFilter.size > 0 && (
          <span className="text-[10px] text-amber-600">
            * รถที่ไม่มีข้อมูล flag ในคลังข้อมูล (TDM 17 คัน) จะถูกตัดออกเมื่อกรอง
          </span>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading && (
        <div className="flex flex-col gap-4">
          <div className="h-80 animate-pulse rounded-2xl bg-gray-200/60" />
          <div className="h-96 animate-pulse rounded-2xl bg-gray-200/60" />
        </div>
      )}

      {!loading && !error && !hasData && (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          ไม่พบข้อมูลช่วง {periodLabel}
        </div>
      )}

      {!loading && hasData && (
        <section ref={slideRef} className="rounded-2xl bg-white p-6 shadow-sm 2xl:aspect-video">
          {/* Slide header — same anatomy as cost-report slide 2 */}
          <div className="mb-4 flex items-start justify-between border-b pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600">Fleet Reliability</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">Breakdown Rate — ลูกค้าโครงการ</h2>
              <p className="mt-0.5 text-sm text-gray-400">
                {periodLabel} เทียบกับ {prevYear} · % = จำนวน breakdown ÷ (จำนวนรถ × วันในเดือน) · ตัวเลขเล็ก = ครั้ง/วัน
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-300">TDM · BTG · TFG · SCCC · DHL · KN</p>
                <button
                  data-no-export
                  onClick={savePng}
                  disabled={savingPng}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-500 transition hover:border-gray-400 hover:text-gray-800 disabled:opacity-40"
                >
                  {savingPng ? "กำลังบันทึก…" : "⬇ PNG"}
                </button>
              </div>
              <p className="text-[10px] text-gray-300">รถลูกค้าโครงการ คลังขอนแก่น + คลังลาดกระบัง</p>
              {flagFilter.size > 0 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {[...flagFilter].map((f) => (
                    <span key={f} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">{f}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Trend chart + insights */}
          <div className="mb-5 grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-semibold text-gray-700">
                {focusFleet
                  ? `Breakdown Rate รายเดือน — ${focusFleet} · ${year} (เส้นทึบ) vs ${prevYear} (เส้นประ)`
                  : `Breakdown Rate รายเดือน ปี ${year} — เทียบ 6 ลูกค้า (คลิกชื่อย่อด้านบนเพื่อเทียบกับปีก่อน)`}
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    formatter={(v: unknown, n: unknown) => [v !== null ? `${Number(v).toFixed(2)}%` : "—", String(n)]}
                    labelStyle={{ fontWeight: 600, fontSize: 12 }}
                    contentStyle={{ borderRadius: 12, fontSize: 11, border: "1px solid #e5e7eb" }}
                  />
                  <Legend formatter={(v) => <span style={{ fontSize: 10, color: "#6b7280" }}>{v}</span>} />
                  {shownFleets.map((f) => (
                    <React.Fragment key={f.code}>
                      <Line dataKey={f.code} name={`${f.code} ${year}`} type="monotone" connectNulls
                        stroke={f.color} strokeWidth={2.5}
                        dot={{ r: 3.5, fill: f.color, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                      {focusFleet && (
                        <Line dataKey={`${f.code} ${prevYear}`} name={`${f.code} ${prevYear}`} type="monotone" connectNulls
                          stroke={f.color} strokeWidth={1.5} strokeDasharray="5 4" strokeOpacity={0.45}
                          dot={{ r: 2, fill: f.color, strokeWidth: 0, fillOpacity: 0.45 }} />
                      )}
                    </React.Fragment>
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">Key Takeaways</p>
              <ul className="space-y-1.5">
                {insights.map((t, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-gray-600">
                    <span className="text-emerald-500">•</span>{t}
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-gray-200 pt-2 text-[10px] leading-snug text-gray-400">
                เกณฑ์สี: <span className="font-semibold text-emerald-700">&lt; 5%</span> ·{" "}
                <span className="font-semibold text-amber-600">5–10%</span> ·{" "}
                <span className="font-semibold text-red-500">≥ 10%</span>
              </p>
            </div>
          </div>

          {/* Per-customer cards — 6 in one row (16:9 slide layout) */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {fleets.map((f) => (
              <div key={f.code} className="rounded-xl border border-gray-100 p-3" style={{ borderTop: `3px solid ${f.color}` }}>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-bold" style={{ color: f.color }}>{f.code}</p>
                  <p className="text-xs">
                    <span className={`font-bold ${pctColor(f.avg)}`}>{f.avg !== null ? `${f.avg.toFixed(2)}%` : "—"}</span>
                    {f.avgYoy !== null && (
                      <span className={`ml-1 text-[10px] font-bold ${f.avgYoy > 0 ? "text-red-500" : "text-emerald-600"}`}>
                        {f.avgYoy > 0 ? "▲" : "▼"}{Math.abs(f.avgYoy).toFixed(0)}%
                      </span>
                    )}
                  </p>
                </div>
                <p className="truncate text-[9px] text-gray-400">{f.name}</p>

                <p className="mt-1.5 mb-1 flex items-center justify-between rounded-lg bg-gray-50 px-2 py-1 text-[9px] leading-tight text-gray-500">
                  <span>B <span className="font-bold text-emerald-700">{f.best ? `${MONTH_LABEL[f.best.mm]} ${f.best.pCurr!.toFixed(1)}%` : "—"}</span></span>
                  <span>W <span className="font-bold text-red-500">{f.worst ? `${MONTH_LABEL[f.worst.mm]} ${f.worst.pCurr!.toFixed(1)}%` : "—"}</span></span>
                  <span className="font-bold text-gray-700">{f.trucks ?? "—"} คัน</span>
                </p>

                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b text-left text-[9px] text-gray-400">
                      <th className="py-1 pr-1 font-medium">Mo</th>
                      <th className="py-1 pr-1 font-medium">{yy(year)}</th>
                      <th className="py-1 pr-1 font-medium">{yy(prevYear)}</th>
                      <th className="py-1 font-medium">YoY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.rows.map((r) => (
                      <tr key={r.mm} className="border-b last:border-b-0">
                        <td className="py-1 pr-1 text-gray-600">{MONTH_LABEL[r.mm]}</td>
                        <td className={`py-1 pr-1 font-semibold tabular-nums ${pctColor(r.pCurr)}`}>
                          {r.pCurr !== null ? `${r.pCurr.toFixed(1)}%` : "—"}
                          {r.nCurr !== null && <span className="ml-0.5 text-[8px] font-normal text-gray-400">{r.nCurr.toFixed(1)}</span>}
                        </td>
                        <td className="py-1 pr-1 tabular-nums text-gray-500">
                          {r.pPrev !== null ? `${r.pPrev.toFixed(1)}%` : "—"}
                        </td>
                        <td className={`py-1 font-semibold tabular-nums ${
                          r.yoy === null ? "text-gray-300" : r.yoy > 0 ? "text-red-500" : "text-emerald-700"
                        }`}>
                          {r.yoy !== null ? `${r.yoy > 0 ? "+" : ""}${r.yoy.toFixed(0)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
