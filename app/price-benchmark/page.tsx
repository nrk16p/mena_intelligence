"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import * as XLSX from "xlsx"
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Cell, Line, ReferenceLine, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip,
} from "recharts"

// ─────────────────────────────────────────────────────────────────────────────
// ระบบราคากลาง (Price Benchmark) — PropertyVue design system
// ราคากลาง = mode (ราคาที่พบบ่อยสุด) ต่อ รหัสสินค้า × ซัพพลายเออร์
// จาก receipts 12 เดือนย้อนหลัง, snapshot รายเดือนใน collection `price_benchmark`
// ─────────────────────────────────────────────────────────────────────────────

// ── PropertyVue tokens ────────────────────────────────────────────────────────

const PV = {
  blue:    "#2563EB",
  blueDk:  "#1D4ED8",
  green:   "#16A34A",
  gray:    "#6B7280",
  ink:     "#111827",
  border:  "#E5E7EB",
  bg:      "#F9FAFB",
  surface: "#FFFFFF",
  warn:    "#D97706",
  error:   "#DC2626",
}

const FONT_HEAD = "'Red Hat Display', sans-serif"
const FONT_BODY = "'DM Sans', sans-serif"
const FONT_MONO = "'Fira Code', monospace"

// ── Types (mirror API) ────────────────────────────────────────────────────────

type PricePoint = { price: number; count: number; qty: number; cost: number; pct: number; outlier?: boolean }

type BenchmarkRow = {
  snapshot_month: string
  window_start: string
  window_end: string
  รหัสสินค้า: string
  ชื่อสินค้า: string
  กลุ่มสินค้า: string
  ซัพพลายเออร์: string
  benchmark_price: number
  benchmark_count: number
  benchmark_pct: number
  min_price: number
  max_price: number
  iqr_lower?: number | null
  iqr_upper?: number | null
  min_price_trimmed?: number
  max_price_trimmed?: number
  total_records: number
  total_qty: number
  total_cost: number
  first_date: string
  last_date: string
  prices: PricePoint[]
  computed_at: string
  contract_price?: number
  contract_effective_start?: string
  contract_effective_end?: string | null
}

type OverpricedRow = {
  วันที่: string
  PO: string | null
  PR: string | null
  รหัสสินค้า: string
  ชื่อสินค้า: string
  กลุ่มสินค้า: string
  ซัพพลายเออร์: string
  คลังสินค้า: string
  รับ: number
  ราคาทุน: number
  ยอดเงิน: number
  benchmark_price: number
  benchmark_count: number
  benchmark_records: number
  iqr_upper: number | null
  severity: "warning" | "critical"
  diff: number
  diff_pct: number | null
  excess_total: number
}

type MonthStats = {
  month: string
  summary: {
    receipts_checked: number
    flagged_count: number
    flagged_products: number
    flagged_suppliers: number
    excess_total: number
    no_benchmark_count: number
  }
  top_products:  { code: string; name: string; group: string; excess: number; count: number }[]
  top_suppliers: { supplier: string; excess: number; count: number }[]
  by_group:      { group: string; excess: number; count: number }[]
  snapshot_pairs: number
  computed_at: string
}

type TrendPoint = {
  month: string
  excess_total: number
  flagged_count: number
  receipts_checked: number
}

type OverpricedSummary = {
  receipts_checked: number
  flagged_count: number
  flagged_products: number
  flagged_suppliers: number
  excess_total: number
  critical_count: number
  no_benchmark_count: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits })

const fmt0 = (v: number | null | undefined) => fmt(v, 0)

const TH_MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

function fmtYM(ym: string | undefined) {
  if (!ym) return "—"
  const [y, m] = ym.split("-")
  return `${TH_MONTHS[Number(m)] ?? m} ${Number(y) + 543}`
}

function fmtDate(iso: string) {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${d.getDate()} ${TH_MONTHS[d.getMonth() + 1]} ${d.getFullYear() + 543}`
}

function nowYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/** Weighted Tukey 1.5×IQR bounds over a price distribution sorted asc (mirrors lib). */
function weightedIQRBounds(prices: { price: number; count: number }[]): { lower: number; upper: number } | null {
  const total = prices.reduce((s, p) => s + p.count, 0)
  if (total < 4) return null
  const quantile = (pct: number): number => {
    const target = pct * total
    let cum = 0
    for (const p of prices) {
      cum += p.count
      if (cum >= target) return p.price
    }
    return prices[prices.length - 1].price
  }
  const q1 = quantile(0.25)
  const q3 = quantile(0.75)
  const iqr = q3 - q1
  if (iqr <= 0) return null
  return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr }
}

/** Aggregate all supplier rows of one product into an "overall" row (mode tie → lowest price). */
function aggregateProduct(rows: BenchmarkRow[]): BenchmarkRow {
  const map = new Map<number, { count: number; qty: number; cost: number }>()
  for (const r of rows) {
    for (const p of r.prices) {
      const ex = map.get(p.price)
      if (ex) { ex.count += p.count; ex.qty += p.qty; ex.cost += p.cost }
      else map.set(p.price, { count: p.count, qty: p.qty, cost: p.cost })
    }
  }
  const total = rows.reduce((s, r) => s + r.total_records, 0)
  const merged = Array.from(map.entries())
    .map(([price, v]) => ({ price, ...v, pct: (v.count / (total || 1)) * 100 }))
    .sort((a, b) => a.price - b.price)
  const bounds = weightedIQRBounds(merged)
  const prices: PricePoint[] = merged.map(p => ({
    ...p,
    outlier: !!bounds && (p.price < bounds.lower || p.price > bounds.upper),
  }))
  const inRange = prices.filter(p => !p.outlier)
  const trimmed = inRange.length > 0 ? inRange : prices
  let mode = prices[0]
  for (const p of prices) if (p.count > mode.count) mode = p
  return {
    ...rows[0],
    ซัพพลายเออร์: "ทุกซัพพลายเออร์",
    benchmark_price: mode?.price ?? 0,
    benchmark_count: mode?.count ?? 0,
    benchmark_pct: mode ? (mode.count / (total || 1)) * 100 : 0,
    min_price: prices[0]?.price ?? 0,
    max_price: prices[prices.length - 1]?.price ?? 0,
    iqr_lower: bounds?.lower ?? null,
    iqr_upper: bounds?.upper ?? null,
    min_price_trimmed: trimmed[0]?.price ?? 0,
    max_price_trimmed: trimmed[trimmed.length - 1]?.price ?? 0,
    total_records: total,
    total_qty: rows.reduce((s, r) => s + r.total_qty, 0),
    total_cost: rows.reduce((s, r) => s + r.total_cost, 0),
    first_date: rows.map(r => r.first_date).sort()[0],
    last_date: rows.map(r => r.last_date).sort().reverse()[0],
    prices,
  }
}

// ── Small building blocks ─────────────────────────────────────────────────────

function Chip({ tone, children }: { tone: "success" | "warning" | "error" | "info" | "neutral"; children: React.ReactNode }) {
  const tones: Record<string, { bg: string; fg: string }> = {
    success: { bg: `${PV.green}18`, fg: PV.green },
    warning: { bg: `${PV.warn}18`,  fg: PV.warn },
    error:   { bg: `${PV.error}18`, fg: PV.error },
    info:    { bg: `${PV.blue}18`,  fg: PV.blue },
    neutral: { bg: "#F3F4F6",       fg: PV.gray },
  }
  const t = tones[tone]
  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{ background: t.bg, color: t.fg, padding: "4px 12px", borderRadius: 4, fontSize: 12, fontWeight: 500, fontFamily: FONT_BODY }}
    >
      {children}
    </span>
  )
}

function Skeleton({ h = 120 }: { h?: number }) {
  return (
    <div className="animate-pulse rounded-lg" style={{ background: "#E5E7EB80", height: h }} />
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: PV.ink, marginBottom: 6, display: "block" }}>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: 14,
  height: 40,
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${PV.border}`,
  background: PV.surface,
  color: PV.ink,
  width: "100%",
  outline: "none",
}

function PrimaryButton({ children, disabled, onClick, type = "button" }: {
  children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="transition-colors"
      style={{
        fontFamily: FONT_BODY, fontSize: 16, fontWeight: 500,
        background: PV.blue, color: "#fff", border: "none",
        padding: "8px 20px", height: 40, borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.10)",
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget.style.background = PV.blueDk) }}
      onMouseLeave={e => { (e.currentTarget.style.background = PV.blue) }}
    >
      {children}
    </button>
  )
}

function SecondaryButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500,
        background: "transparent", color: PV.blue, border: `1px solid ${PV.blue}`,
        padding: "6px 12px", height: 32, borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

// ── Price Band Timeline (min–max band + mode line + purchase dots) ────────────

type TimelineMonth = {
  month: string
  min: number | null
  max: number | null
  mode: number | null
  mode_count: number | null
  count: number
  points: { price: number; count: number; qty: number; supplier: string; outlier: boolean }[]
}

// Distinct colours for per-supplier scatter points (cycles for >10 suppliers)
const SUPPLIER_COLORS = [
  "#2563EB", "#16A34A", "#D97706", "#9333EA", "#DB2777",
  "#0891B2", "#CA8A04", "#4F46E5", "#059669", "#E11D48",
]
const supplierColor = (i: number) => SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]

function fmtYMShort(ym: string) {
  const [y, m] = ym.split("-")
  return `${TH_MONTHS[Number(m)] ?? m}${String(Number(y) + 543).slice(-2)}`
}

function TimelineTooltip({ active, payload, pointMap }: {
  active?: boolean
  payload?: { payload: Record<string, unknown>; dataKey?: unknown; name?: string }[]
  pointMap?: Map<string, { supplier: string; count: number }[]>
}) {
  if (!active || !payload?.length) return null
  const box: React.CSSProperties = {
    background: PV.ink, color: "#fff", borderRadius: 8, padding: "6px 12px",
    fontFamily: FONT_BODY, fontSize: 12, maxWidth: 280,
    boxShadow: "0 10px 20px rgba(0,0,0,0.10), 0 20px 48px rgba(0,0,0,0.12)",
  }
  // A scatter dot carries `supplier`; the band/line entries do not. Prefer the
  // dot even when the band/mode line is also active at this x, so every point
  // always shows supplier + count + price.
  const dot = payload.find(e => {
    const pl = e.payload as { price?: number; supplier?: string }
    return pl?.price !== undefined && pl?.supplier !== undefined
  })?.payload as (Partial<TimelineMonth> & { price?: number; count?: number; outlier?: boolean; supplier?: string }) | undefined

  // dot hover — list every supplier sitting at this exact เดือน×ราคา point
  if (dot) {
    const p = dot
    const list = pointMap?.get(`${p.month}|${p.price}`)
      ?? (p.supplier ? [{ supplier: p.supplier, count: Number(p.count) || 0 }] : [])
    const totalCount = list.reduce((s, x) => s + x.count, 0)
    return (
      <div style={box}>
        <div style={{ fontWeight: 700 }}>{fmtYM(String(p.month))} — ฿{fmt(p.price)}</div>
        <div style={{ opacity: 0.85, marginBottom: list.length ? 4 : 0 }}>
          {totalCount.toLocaleString()} ครั้ง · {list.length} ซัพพลายเออร์{p.outlier ? " · outlier" : ""}
        </div>
        {list.map((x, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, lineHeight: 1.5 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 }}>{x.supplier}</span>
            <span style={{ opacity: 0.8, flexShrink: 0 }}>{x.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }
  // band / mode hover (no dot under the cursor)
  const p = payload[0].payload as Partial<TimelineMonth>
  if (p.mode === null || p.mode === undefined) return null
  return (
    <div style={box}>
      <div style={{ fontWeight: 700 }}>{fmtYM(String(p.month))}</div>
      <div>mode ฿{fmt(p.mode)} ({p.mode_count} ครั้ง)</div>
      <div style={{ opacity: 0.85 }}>ช่วง {fmt(p.min ?? null)} – {fmt(p.max ?? null)} · รวม {p.count} ครั้ง</div>
    </div>
  )
}

// Plotly is heavy — load the 3D view lazily, only when the user opens it
const PriceScatter3D = dynamic(() => import("@/components/PriceScatter3D"), {
  ssr: false,
  loading: () => <Skeleton h={460} />,
})

function PriceTimelineChart({ code, month, supplier, benchmark, contracts = [], auto }: {
  code: string
  month: string
  supplier: string | null
  benchmark: number
  contracts?: { supplier: string; price: number }[]
  auto: boolean
}) {
  const [data, setData]       = useState<TimelineMonth[] | null>(null)
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [wanted, setWanted]   = useState(auto)
  const [is3d, setIs3d]       = useState(false)

  useEffect(() => { setWanted(auto) }, [auto])

  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ month, product_code: code })
        if (supplier) params.set("supplier", supplier)
        const res  = await fetch(`/api/price-benchmark/timeline?${params}`, { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.success) { setData(json.monthly); setSuppliers(json.suppliers ?? []) }
      } catch { /* keep silent — chart is supplementary */ }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [wanted, code, month, supplier])

  if (!wanted) {
    return (
      <div style={{ padding: "10px 16px", border: `1px dashed ${PV.border}`, borderRadius: 8, textAlign: "center" }}>
        <button
          type="button"
          onClick={() => setWanted(true)}
          style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: PV.blue, background: "none", border: "none", cursor: "pointer" }}
        >
          แสดงกราฟแนวโน้มราคา 12 เดือน
        </button>
      </div>
    )
  }

  if (loading || !data) return <Skeleton h={220} />

  const chartData = data.map((m) => ({ ...m, band: m.min !== null && m.max !== null ? [m.min, m.max] : null }))
  // colour the top-10 suppliers; the long tail shares one "อื่นๆ" colour
  const colorMap = new Map<string, string>()
  suppliers.slice(0, SUPPLIER_COLORS.length).forEach((s, i) => colorMap.set(s, supplierColor(i)))
  const colorOf = (s: string) => colorMap.get(s) ?? PV.gray
  const hasTail = suppliers.length > SUPPLIER_COLORS.length
  const colorRecord: Record<string, string> = {}
  suppliers.forEach((s, i) => { colorRecord[s] = i < SUPPLIER_COLORS.length ? supplierColor(i) : PV.gray })
  // one scatter series per supplier (non-outlier dots) so points are visually separable
  const bySupplier = new Map<string, { month: string; price: number; count: number; qty: number; outlier: boolean }[]>()
  for (const m of data) {
    for (const p of m.points) {
      if (p.outlier) continue
      const arr = bySupplier.get(p.supplier) ?? []
      arr.push({ month: m.month, ...p })
      bySupplier.set(p.supplier, arr)
    }
  }
  const outlierDots = data.flatMap((m) => m.points.filter(p => p.outlier).map(p => ({ month: m.month, ...p })))
  // every supplier sitting at each เดือน×ราคา coordinate → richer dot tooltip
  const pointMap = new Map<string, { supplier: string; count: number }[]>()
  for (const m of data) for (const p of m.points) {
    const key = `${m.month}|${p.price}`
    const arr = pointMap.get(key) ?? []
    arr.push({ supplier: p.supplier, count: p.count })
    pointMap.set(key, arr)
  }
  for (const arr of pointMap.values()) arr.sort((a, b) => b.count - a.count)

  return (
    <div style={{ border: `1px solid ${PV.border}`, borderRadius: 8, padding: "12px 8px 4px", background: PV.surface }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 12px 6px", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: PV.ink }}>
          แนวโน้มราคา 12 เดือน{supplier ? ` — ${supplier}` : " — ทุกซัพพลายเออร์"}
        </span>
        {/* 2D / 3D toggle */}
        <div style={{ display: "inline-flex", border: `1px solid ${PV.border}`, borderRadius: 8, overflow: "hidden" }}>
          {([["2D", false], ["3D", true]] as const).map(([lab, v]) => (
            <button
              key={lab}
              type="button"
              onClick={() => setIs3d(v)}
              style={{
                fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, cursor: "pointer",
                padding: "5px 14px", border: "none",
                background: is3d === v ? PV.blue : PV.surface,
                color: is3d === v ? "#fff" : PV.gray,
              }}
            >
              {lab}
            </button>
          ))}
        </div>
        <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: PV.gray, flexBasis: "100%" }}>
          {is3d
            ? "3 แกน: เดือน × ซัพพลายเออร์ × ราคา · ขนาดจุด = จำนวนครั้ง · ลากเพื่อหมุน · ล้อเมาส์ซูม · กากบาท = outlier"
            : "แถบเทา = ช่วง min–max · เส้นน้ำเงิน = ราคาที่พบบ่อยสุดรายเดือน · เส้นประเขียว = ราคากลาง · เส้นทึบสีซัพ = ราคาสัญญาของซัพเจ้านั้น · จุดแยกสีตามซัพพลายเออร์ · กากบาทแดง = outlier · hover จุดเพื่อดูซัพทุกเจ้าที่ราคานั้น"}
        </span>
      </div>
      {/* supplier colour legend */}
      {!supplier && suppliers.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "0 12px 8px" }}>
          {suppliers.slice(0, SUPPLIER_COLORS.length).map((s, i) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY, fontSize: 11, color: PV.gray, maxWidth: 220 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9999, background: supplierColor(i), flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
            </span>
          ))}
          {hasTail && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY, fontSize: 11, color: PV.gray }}>
              <span style={{ width: 9, height: 9, borderRadius: 9999, background: PV.gray, flexShrink: 0 }} />
              อื่นๆ ({suppliers.length - SUPPLIER_COLORS.length})
            </span>
          )}
        </div>
      )}
      {is3d ? (
        <PriceScatter3D data={data} suppliers={suppliers} colorMap={colorRecord} />
      ) : (
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#F3F4F6" />
          <XAxis
            dataKey="month"
            tickFormatter={fmtYMShort}
            tick={{ fontFamily: FONT_BODY, fontSize: 11, fill: PV.gray }}
            axisLine={{ stroke: PV.border }} tickLine={false}
            allowDuplicatedCategory={false}
          />
          <YAxis
            tickFormatter={(v: number) => v.toLocaleString("th-TH")}
            tick={{ fontFamily: FONT_MONO, fontSize: 10, fill: PV.gray }}
            axisLine={false} tickLine={false} width={64}
            domain={["auto", "auto"]}
          />
          <ZAxis type="number" dataKey="count" range={[30, 220]} />
          <Tooltip content={<TimelineTooltip pointMap={pointMap} />} />
          <Area
            dataKey="band" name="ช่วง min–max" type="monotone" connectNulls
            stroke="none" fill="#9CA3AF" fillOpacity={0.18} activeDot={false}
          />
          <Line
            dataKey="mode" name="ราคาที่พบบ่อยสุด" type="monotone" connectNulls
            stroke={PV.blue} strokeWidth={2.5}
            dot={{ r: 3, fill: PV.blue, strokeWidth: 0 }} activeDot={{ r: 5 }}
          />
          {[...bySupplier.entries()].map(([s, ds]) => (
            <Scatter key={s} data={ds} dataKey="price" name={s} fill={colorOf(s)} fillOpacity={0.7} />
          ))}
          <Scatter data={outlierDots} dataKey="price" name="outlier" fill={PV.error} fillOpacity={0.85} shape="cross" />
          <ReferenceLine
            y={benchmark}
            stroke={PV.green} strokeWidth={1.5} strokeDasharray="6 4"
            label={{ value: `ราคากลาง ${fmt(benchmark)}`, position: "insideTopRight", fill: PV.green, fontSize: 11, fontFamily: FONT_BODY }}
          />
          {/* ราคาสัญญาต่อซัพ — เส้นแนวนอน สีเดียวกับจุด scatter ของซัพเจ้านั้น */}
          {contracts
            .filter(c => !supplier || c.supplier === supplier)
            .map(c => (
              <ReferenceLine
                key={`ct-${c.supplier}`}
                y={c.price}
                ifOverflow="extendDomain"
                stroke={colorRecord[c.supplier] ?? PV.gray}
                strokeWidth={1.5}
                label={{ value: `สัญญา ${fmt(c.price)}`, position: "insideBottomRight", fill: colorRecord[c.supplier] ?? PV.gray, fontSize: 10, fontFamily: FONT_BODY }}
              />
            ))}
        </ComposedChart>
      </ResponsiveContainer>
      )}
    </div>
  )
}

// ── Price ranking table (min → max) ───────────────────────────────────────────

function PriceRankingTable({ row }: { row: BenchmarkRow }) {
  const maxCount = Math.max(...row.prices.map(p => p.count), 1)
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_BODY }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${PV.border}` }}>
            {["อันดับ", "ราคา (฿)", "จำนวนครั้ง", "สัดส่วน", "จำนวนชิ้น", "สถานะ"].map((h, i) => (
              <th
                key={h}
                style={{
                  fontFamily: FONT_BODY, fontSize: 12, fontWeight: 500, color: PV.gray,
                  textAlign: i === 1 || i === 2 || i === 4 ? "right" : "left",
                  padding: "8px 16px", whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row.prices.map((p, i) => {
            const isMode  = p.price === row.benchmark_price
            const above   = p.price > row.benchmark_price
            const outlier = !!p.outlier
            return (
              <tr
                key={p.price}
                style={{
                  borderBottom: "1px solid #F3F4F6",
                  background: isMode ? `${PV.blue}08` : undefined,
                  height: 48,
                  opacity: outlier ? 0.45 : 1,
                }}
              >
                <td style={{ padding: "8px 16px", fontSize: 14, color: PV.gray }}>
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 24, height: 24, borderRadius: 9999, fontSize: 12, fontWeight: 700,
                      fontFamily: FONT_MONO,
                      background: isMode ? PV.blue : "#F3F4F6",
                      color: isMode ? "#fff" : PV.gray,
                    }}
                  >
                    {i + 1}
                  </span>
                </td>
                <td style={{
                  padding: "8px 16px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 14,
                  fontWeight: isMode ? 600 : 400,
                  color: outlier ? PV.gray : isMode ? PV.blueDk : above ? PV.error : PV.ink,
                  textDecoration: outlier ? "line-through" : "none",
                }}>
                  {fmt(p.price)}
                </td>
                <td style={{ padding: "8px 16px", textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                    <div style={{ width: 96, height: 6, background: "#F3F4F6", borderRadius: 9999, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(p.count / maxCount) * 100}%`, height: "100%", borderRadius: 9999,
                          background: isMode ? PV.blue : above ? `${PV.error}66` : "#D1D5DB",
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: PV.ink, minWidth: 32, textAlign: "right" }}>
                      {p.count.toLocaleString()}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "8px 16px", fontSize: 12, color: PV.gray, fontFamily: FONT_MONO }}>
                  {p.pct.toFixed(1)}%
                </td>
                <td style={{ padding: "8px 16px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 14, color: PV.gray }}>
                  {fmt0(p.qty)}
                </td>
                <td style={{ padding: "8px 16px" }}>
                  {outlier ? (
                    <Chip tone="error">outlier — ตัดออกจากช่วงปกติ</Chip>
                  ) : isMode ? (
                    <Chip tone="info">ราคากลาง</Chip>
                  ) : above ? (
                    <Chip tone="error">สูงกว่าราคากลาง</Chip>
                  ) : (
                    <Chip tone="success">ต่ำกว่าราคากลาง</Chip>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Supplier benchmark section ────────────────────────────────────────────────

function SupplierSection({ row, rank, isOverall, dimmed }: {
  row: BenchmarkRow; rank: number; isOverall: boolean; dimmed: boolean
}) {
  const [open, setOpen] = useState(isOverall)
  const lowData = row.total_records < 3
  const stable  = row.total_records >= 3 && row.benchmark_pct >= 60
  return (
    <div
      style={{
        border: `1px solid ${PV.border}`, borderRadius: 8, background: PV.surface, overflow: "hidden",
        opacity: dimmed ? 0.3 : 1, transition: "opacity 200ms",
      }}
    >
      {/* Header row — click to expand */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          all: "unset", boxSizing: "border-box", cursor: "pointer", width: "100%",
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          background: isOverall ? `${PV.blue}08` : PV.surface,
        }}
      >
        {isOverall ? (
          <Chip tone="info">ภาพรวมทุกซัพพลายเออร์</Chip>
        ) : (
          <span
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 22, height: 22, borderRadius: 9999, background: "#F3F4F6",
              fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: PV.gray, flexShrink: 0,
            }}
          >
            {rank}
          </span>
        )}
        {!isOverall && (
          <span style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: PV.ink, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.ซัพพลายเออร์}
          </span>
        )}
        {isOverall && <span style={{ flex: 1 }} />}

        {/* Benchmark price — green per PropertyVue price semantics */}
        <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: isOverall ? 24 : 20, fontWeight: 700, color: PV.green }}>
            ฿{fmt(row.benchmark_price)}
          </span>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>
            {row.benchmark_count.toLocaleString()} ครั้ง ({row.benchmark_pct.toFixed(0)}%)
          </span>
        </span>

        {row.contract_price != null && (
          <Chip tone={row.benchmark_price > row.contract_price ? "warning" : "success"}>
            สัญญา ฿{fmt(row.contract_price)}
          </Chip>
        )}
        {stable && !isOverall && <Chip tone="success">ราคานิ่ง</Chip>}
        {lowData && (
          <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: PV.gray, flexShrink: 0 }}>
            ข้อมูล {row.total_records} ครั้ง
          </span>
        )}

        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: PV.gray, flexShrink: 0 }}>
          {fmt(row.min_price_trimmed ?? row.min_price)} – {fmt(row.max_price_trimmed ?? row.max_price)}
        </span>
        <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray, flexShrink: 0 }}>
          {row.total_records.toLocaleString()} ครั้ง · ฿{fmt0(row.total_cost)}
        </span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PV.gray} strokeWidth="2"
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms", flexShrink: 0 }}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${PV.border}` }}>
          <PriceRankingTable row={row} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "8px 16px", background: PV.bg, borderTop: `1px solid ${PV.border}` }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>
              ช่วงข้อมูล {fmtYM(row.first_date)} – {fmtYM(row.last_date)} (window 12 เดือน: {fmtYM(row.window_start)} – {fmtYM(row.window_end)})
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: PV.gray }}>
              {row.iqr_lower != null && row.iqr_upper != null
                ? row.iqr_lower <= (row.min_price_trimmed ?? row.min_price)
                  ? <>เพดานราคาปกติ ≤ {fmt(row.iqr_upper)} · </>
                  : <>ช่วงราคาปกติ {fmt(row.iqr_lower)} – {fmt(row.iqr_upper)} · </>
                : <>ข้อมูลน้อย/ไม่กระจาย — ไม่ตัด outlier · </>}
              รวม {fmt0(row.total_qty)} ชิ้น
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Product card ──────────────────────────────────────────────────────────────

function monthsAgo(ym: string): number {
  if (!ym) return 0
  const [y, m] = ym.split("-").map(Number)
  const d = new Date()
  return (d.getFullYear() - y) * 12 + (d.getMonth() + 1 - m)
}

function fmtMonthsAgo(ym: string): string {
  const n = monthsAgo(ym)
  if (n <= 0) return "เดือนนี้"
  if (n === 1) return "เดือนที่แล้ว"
  return `${n} เดือนก่อน`
}

/** คำแนะนำสำหรับจัดซื้อ: เจ้าถูกสุด + เงินที่จ่ายเกินราคาถูกสุด */
function RecommendationCard({ rows, onViewTransactions, code }: {
  rows: BenchmarkRow[]; code: string; onViewTransactions?: (code: string) => void
}) {
  const byPrice = [...rows].sort((a, b) =>
    a.benchmark_price - b.benchmark_price || b.total_records - a.total_records)
  const best = byPrice[0]
  if (!best) return null
  const totalQty  = rows.reduce((s, r) => s + r.total_qty, 0)
  const totalCost = rows.reduce((s, r) => s + r.total_cost, 0)
  const overpaid  = Math.max(0, totalCost - best.benchmark_price * totalQty)
  const stale     = monthsAgo(best.last_date) > 6
  const thin      = best.total_records < 3

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      background: `${PV.green}0D`, border: `1px solid ${PV.green}40`, borderRadius: 8, padding: "12px 16px",
    }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, color: PV.green, textTransform: "uppercase", letterSpacing: 0.5 }}>
          ราคาแนะนำ (เจ้าถูกสุด)
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
          <span style={{ fontFamily: FONT_HEAD, fontSize: 28, fontWeight: 900, color: PV.green }}>
            ฿{fmt(best.benchmark_price)}
          </span>
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: PV.ink }}>
            {best.ซัพพลายเออร์}
          </span>
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray, marginTop: 2 }}>
          อ้างอิง {best.benchmark_count.toLocaleString()} ครั้ง ({best.benchmark_pct.toFixed(0)}% ของ {best.total_records.toLocaleString()} ครั้ง) · ซื้อล่าสุด {fmtMonthsAgo(best.last_date)}
          {thin  && <span style={{ color: PV.warn }}> · ข้อมูลน้อย — ตรวจสอบก่อนใช้อ้างอิง</span>}
          {stale && <span style={{ color: PV.warn }}> · ราคาอาจไม่เป็นปัจจุบัน</span>}
        </div>
      </div>
      {overpaid > 0 && rows.length > 1 && (
        <div style={{ textAlign: "right" }} title="เทียบกรณีซื้อทุกชิ้นที่ราคาแนะนำ — ตัวเลขเชิงโอกาส อาจมีเหตุผลอื่น เช่น งานด่วน/ของขาด/สเปคต่าง">
          <div style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, color: PV.error, textTransform: "uppercase", letterSpacing: 0.5 }}>
            จ่ายเกินราคาถูกสุด (12 เดือน)
          </div>
          <div style={{ fontFamily: FONT_HEAD, fontSize: 22, fontWeight: 700, color: PV.error }}>
            ฿{fmt0(overpaid)}
          </div>
        </div>
      )}
      {onViewTransactions && (
        <SecondaryButton onClick={() => onViewTransactions(code)}>
          ดูรายการซื้อจริง →
        </SecondaryButton>
      )}
    </div>
  )
}

/** ตารางเปรียบเทียบซัพพลายเออร์ — มองแวบเดียวรู้ว่าใครถูก/แพง/สดแค่ไหน */
function SupplierCompareTable({ rows, selectedSupplier, onSelectSupplier }: {
  rows: BenchmarkRow[]
  selectedSupplier: string | null
  onSelectSupplier?: (s: string | null) => void
}) {
  const byPrice = [...rows].sort((a, b) =>
    a.benchmark_price - b.benchmark_price || b.total_records - a.total_records)
  const best = byPrice[0]
  return (
    <div style={{ border: `1px solid ${PV.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_BODY, minWidth: 760 }}>
          <thead>
            <tr style={{ background: PV.bg, borderBottom: `1px solid ${PV.border}` }}>
              {["ซัพพลายเออร์", "ราคากลาง (฿)", "ราคาสัญญา (฿)", "เทียบเจ้าถูกสุด", "ครั้ง", "ความนิ่ง", "ซื้อล่าสุด", "มูลค่ารวม (฿)"].map((h, i) => (
                <th key={h} style={{
                  fontFamily: FONT_BODY, fontSize: 12, fontWeight: 500, color: PV.gray,
                  padding: "8px 12px", textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byPrice.map(r => {
              const isBest  = r === best
              const diffPct = best.benchmark_price > 0
                ? ((r.benchmark_price - best.benchmark_price) / best.benchmark_price) * 100
                : 0
              const stable  = r.total_records >= 3 && r.benchmark_pct >= 60
              const nAgo    = monthsAgo(r.last_date)
              const active  = selectedSupplier === r.ซัพพลายเออร์
              return (
                <tr
                  key={r.ซัพพลายเออร์}
                  onClick={() => onSelectSupplier?.(active ? null : r.ซัพพลายเออร์)}
                  style={{
                    borderBottom: "1px solid #F3F4F6", cursor: onSelectSupplier ? "pointer" : "default",
                    background: active ? `${PV.blue}0D` : isBest ? `${PV.green}0A` : undefined,
                  }}
                >
                  <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: isBest ? 700 : 500, color: PV.ink, maxWidth: 260 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ซัพพลายเออร์}</span>
                      {isBest && <Chip tone="success">ถูกสุด</Chip>}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: isBest ? PV.green : PV.ink }}>
                    {fmt(r.benchmark_price)}
                  </td>
                  <td
                    style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, color: r.contract_price == null ? PV.gray : PV.ink }}
                    title={r.contract_price != null ? `ราคาสัญญา${r.contract_effective_start ? ` (มีผล ${fmtYM(r.contract_effective_start)}${r.contract_effective_end ? `–${fmtYM(r.contract_effective_end)}` : " เป็นต้นไป"})` : ""}` : "ไม่มีราคาสัญญา"}
                  >
                    {r.contract_price != null ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                        {fmt(r.contract_price)}
                        {r.benchmark_price > r.contract_price
                          ? <span style={{ fontSize: 10, color: PV.error }} title="ราคากลางสูงกว่าราคาสัญญา">▲</span>
                          : <span style={{ fontSize: 10, color: PV.green }} title="ราคากลางไม่เกินราคาสัญญา">✓</span>}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, color: isBest ? PV.gray : diffPct > 25 ? PV.error : PV.warn }}>
                    {isBest ? "—" : `+${diffPct.toFixed(0)}%`}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, color: PV.ink }}>
                    {r.total_records.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {stable
                      ? <Chip tone="success">นิ่ง {r.benchmark_pct.toFixed(0)}%</Chip>
                      : <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>
                          {r.total_records < 3 ? `ข้อมูล ${r.total_records} ครั้ง` : `${r.benchmark_pct.toFixed(0)}%`}
                        </span>}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_BODY, fontSize: 12, color: nAgo > 6 ? PV.warn : PV.gray, whiteSpace: "nowrap" }}>
                    {fmtMonthsAgo(r.last_date)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, color: PV.gray }}>
                    {fmt0(r.total_cost)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProductCard({ code, rows, month, selectedSupplier, autoChart, onSelectSupplier, onViewTransactions }: {
  code: string
  rows: BenchmarkRow[]
  month: string
  selectedSupplier: string | null
  autoChart: boolean
  onSelectSupplier?: (s: string | null) => void
  onViewTransactions?: (code: string) => void
}) {
  const overall = aggregateProduct(rows)
  const ranked  = [...rows].sort((a, b) => b.total_cost - a.total_cost)
  const contracts = rows
    .filter(r => r.contract_price != null)
    .map(r => ({ supplier: r.ซัพพลายเออร์, price: r.contract_price as number }))
  return (
    <div
      style={{
        background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.10)", overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderBottom: `1px solid ${PV.border}`, background: PV.bg, flexWrap: "wrap" }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 600, color: PV.blue }}>{code}</span>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: PV.ink, flex: 1, minWidth: 200 }}>
          {rows[0].ชื่อสินค้า}
        </span>
        {rows[0].กลุ่มสินค้า && <Chip tone="neutral">{rows[0].กลุ่มสินค้า}</Chip>}
        <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>{rows.length} ซัพพลายเออร์</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
        <RecommendationCard rows={rows} code={code} onViewTransactions={onViewTransactions} />
        {rows.length > 1 && (
          <SupplierCompareTable
            rows={rows}
            selectedSupplier={selectedSupplier}
            onSelectSupplier={onSelectSupplier}
          />
        )}
        <PriceTimelineChart
          code={code}
          month={month}
          supplier={selectedSupplier}
          benchmark={overall.benchmark_price}
          contracts={contracts}
          auto={autoChart}
        />
        {rows.length > 1 && <SupplierSection row={overall} rank={0} isOverall dimmed={false} />}
        {ranked.map((r, i) => (
          <SupplierSection
            key={`${r.รหัสสินค้า}||${r.ซัพพลายเออร์}`}
            row={r}
            rank={i + 1}
            isOverall={false}
            dimmed={selectedSupplier !== null && selectedSupplier !== r.ซัพพลายเออร์}
          />
        ))}
      </div>
    </div>
  )
}

// ── Supplier filter (ranked facet chips, collapsible) ─────────────────────────

const SUPPLIER_CHIPS_VISIBLE = 8

function SupplierFilter({ suppliers, selected, onSelect }: {
  suppliers: { name: string; records: number; cost: number }[]
  selected:  string | null
  onSelect:  (s: string | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery]       = useState("")

  const filtered = query.trim()
    ? suppliers.filter(s => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    : suppliers
  const visible = expanded || query.trim() ? filtered : filtered.slice(0, SUPPLIER_CHIPS_VISIBLE)
  const hidden  = filtered.length - visible.length

  const chipBase: React.CSSProperties = {
    fontFamily: FONT_BODY, fontSize: 12, fontWeight: 500,
    padding: "5px 12px", borderRadius: 4, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 8, maxWidth: 320,
  }

  return (
    <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, padding: "12px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: PV.ink }}>
          ซัพพลายเออร์ ({suppliers.length})
        </span>
        <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: PV.gray }}>
          เรียงตามมูลค่าซื้อ · คลิกเพื่อโฟกัส
        </span>
        {suppliers.length > SUPPLIER_CHIPS_VISIBLE && (
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="พิมพ์กรองรายชื่อ..."
            style={{ ...inputStyle, height: 30, fontSize: 12, padding: "4px 10px", width: 180, marginLeft: "auto" }}
          />
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => onSelect(null)}
          style={{
            ...chipBase,
            background: selected === null ? PV.blue : PV.surface,
            color: selected === null ? "#fff" : PV.ink,
            border: selected === null ? "1px solid transparent" : `1px solid ${PV.border}`,
          }}
        >
          ทั้งหมด
        </button>
        {visible.map(s => {
          const active = selected === s.name
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => onSelect(active ? null : s.name)}
              title={`${s.name} — ${s.records.toLocaleString()} ครั้ง · ฿${fmt0(s.cost)}`}
              style={{
                ...chipBase,
                background: active ? PV.blue : PV.surface,
                color: active ? "#fff" : PV.ink,
                border: active ? "1px solid transparent" : `1px solid ${PV.border}`,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              <span style={{
                fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, flexShrink: 0,
                padding: "1px 6px", borderRadius: 9999,
                background: active ? "rgba(255,255,255,0.22)" : "#F3F4F6",
                color: active ? "#fff" : PV.gray,
              }}>
                ฿{fmtCompact(s.cost)}
              </span>
            </button>
          )
        })}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{ ...chipBase, background: "transparent", color: PV.blue, border: `1px dashed ${PV.blue}66` }}
          >
            +{hidden} เพิ่มเติม
          </button>
        )}
        {expanded && !query.trim() && suppliers.length > SUPPLIER_CHIPS_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{ ...chipBase, background: "transparent", color: PV.gray, border: "none" }}
          >
            ย่อ
          </button>
        )}
        {query.trim() && filtered.length === 0 && (
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>ไม่พบชื่อที่ค้นหา</span>
        )}
      </div>
    </div>
  )
}

// ── Group multi-select ────────────────────────────────────────────────────────

function GroupMultiSelect({ options, selected, onChange }: {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options
  const toggle = (g: string) =>
    onChange(selected.includes(g) ? selected.filter(x => x !== g) : [...selected, g])

  const label = selected.length === 0 ? "ทุกกลุ่มสินค้า" : `${selected.length} กลุ่ม`

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected.length ? PV.ink : PV.gray }}>
          {label}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PV.gray} strokeWidth="2" style={{ flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {selected.map(g => (
            <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: `${PV.blue}12`, color: PV.blue, fontFamily: FONT_BODY, fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>
              {g}
              <span onClick={() => toggle(g)} style={{ cursor: "pointer", fontWeight: 700 }}>×</span>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div style={{
          position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0, right: 0,
          background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8,
          boxShadow: "0 10px 20px rgba(0,0,0,0.10), 0 20px 48px rgba(0,0,0,0.12)", maxHeight: 300, overflow: "auto",
        }}>
          <div style={{ padding: 8, position: "sticky", top: 0, background: PV.surface, borderBottom: `1px solid ${PV.border}`, display: "flex", gap: 8, alignItems: "center" }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ค้นหากลุ่ม..."
              style={{ ...inputStyle, height: 32, fontSize: 13 }}
            />
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.blue, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>
                ล้าง
              </button>
            )}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 12, fontFamily: FONT_BODY, fontSize: 13, color: PV.gray, textAlign: "center" }}>ไม่พบกลุ่ม</div>
          ) : filtered.map(g => {
            const on = selected.includes(g)
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggle(g)}
                style={{
                  all: "unset", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "8px 12px", cursor: "pointer",
                  background: on ? `${PV.blue}0A` : "transparent",
                  fontFamily: FONT_BODY, fontSize: 13, color: PV.ink,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = PV.bg }}
                onMouseLeave={e => { e.currentTarget.style.background = on ? `${PV.blue}0A` : "transparent" }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${on ? PV.blue : PV.border}`, background: on ? PV.blue : PV.surface,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Product autocomplete (รหัส + ชื่อสินค้า) ───────────────────────────────────

type ProductHit = { code: string; name: string; group: string }

function ProductCombobox({ month, value, onChange, onPick }: {
  month: string
  value: string
  onChange: (v: string) => void
  onPick?: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<ProductHit[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  // debounced fetch on query change
  useEffect(() => {
    if (!open) return
    const q = value.trim()
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ month })
        if (q) params.set("q", q)
        const res = await fetch(`/api/price-benchmark/products?${params}`, { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.success) setHits(json.data)
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [value, month, open])

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="รหัส/ชื่อสินค้า — พิมพ์เพื่อค้นหา"
        style={inputStyle}
      />
      {open && (value.trim() !== "" || hits.length > 0) && (
        <div style={{
          position: "absolute", zIndex: 20, top: "calc(100% + 4px)", left: 0,
          minWidth: "100%", width: "max-content", maxWidth: "min(560px, 92vw)",
          background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8,
          boxShadow: "0 10px 20px rgba(0,0,0,0.10), 0 20px 48px rgba(0,0,0,0.12)", maxHeight: 320, overflow: "auto",
        }}>
          {loading && hits.length === 0 ? (
            <div style={{ padding: 12, fontFamily: FONT_BODY, fontSize: 13, color: PV.gray, textAlign: "center" }}>กำลังค้นหา...</div>
          ) : hits.length === 0 ? (
            <div style={{ padding: 12, fontFamily: FONT_BODY, fontSize: 13, color: PV.gray, textAlign: "center" }}>ไม่พบสินค้า</div>
          ) : hits.map(h => (
            <button
              key={h.code}
              type="button"
              onClick={() => { onChange(h.code); setOpen(false); onPick?.(h.code) }}
              style={{
                all: "unset", boxSizing: "border-box", display: "flex", alignItems: "flex-start", gap: 10,
                width: "100%", padding: "8px 12px", cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = PV.bg }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
            >
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: PV.blue, flexShrink: 0, minWidth: 84 }}>{h.code}</span>
              <span style={{ flex: 1, minWidth: 0, fontFamily: FONT_BODY, fontSize: 13, color: PV.ink, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.35 }}>{h.name || "—"}</span>
              {h.group && <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: PV.gray, flexShrink: 0, whiteSpace: "nowrap" }}>{h.group}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Contract-price upload ─────────────────────────────────────────────────────

function ContractUpload({ onUploaded }: { onUploaded?: () => void }) {
  const [open, setOpen]       = useState(false)
  const [busy, setBusy]       = useState(false)
  const [result, setResult]   = useState<{ total_rows: number; accepted: number; upserted: number; modified: number; error_count: number; errors: { row: number; reason: string }[] } | null>(null)
  const [error, setError]     = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const rows = [
      { รหัสสินค้า: "LB00090", ชื่อสินค้า: "ตัวอย่างสินค้า", ซัพพลายเออร์: "บริษัท ตัวอย่าง จำกัด", ราคาสัญญา: 1250, เริ่ม: "2026-01", สิ้นสุด: "2026-12", หมายเหตุ: "" },
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "contract")
    XLSX.writeFile(wb, "contract-price-template.xlsx")
  }

  async function upload() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError("เลือกไฟล์ก่อน"); return }
    setBusy(true); setError(""); setResult(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/price-benchmark/contract", { method: "POST", body: fd })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "อัปโหลดไม่สำเร็จ")
      setResult(json)
      onUploaded?.()
    } catch (e: any) {
      setError(e.message || "อัปโหลดไม่สำเร็จ")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px" }}
      >
        <span style={{ fontFamily: FONT_HEAD, fontSize: 14, fontWeight: 600, color: PV.ink }}>อัปโหลดราคาสัญญา (ราคาที่เจรจากับซัพ)</span>
        <span style={{ fontFamily: FONT_BODY, fontSize: 11, color: PV.gray }}>Excel/CSV รายสินค้า × ซัพพลายเออร์</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PV.gray} strokeWidth="2" style={{ marginLeft: "auto", transform: open ? "rotate(180deg)" : undefined, transition: "transform 150ms" }}>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${PV.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray, margin: 0 }}>
            คอลัมน์: <b>รหัสสินค้า</b>, ชื่อสินค้า, <b>ซัพพลายเออร์</b>, <b>ราคาสัญญา</b>, <b>เริ่ม</b> (YYYY-MM), สิ้นสุด (YYYY-MM, ว่าง = ไม่มีกำหนด), หมายเหตุ ·
            ราคาจะแสดงในผลค้นหาเป็น "ราคาสัญญา" ตามช่วงเวลาที่มีผล
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ fontFamily: FONT_BODY, fontSize: 13 }} />
            <PrimaryButton onClick={upload} disabled={busy}>{busy ? "กำลังอัปโหลด..." : "อัปโหลด"}</PrimaryButton>
            <SecondaryButton onClick={downloadTemplate}>ดาวน์โหลด template</SecondaryButton>
          </div>
          {error && (
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: PV.error, background: `${PV.error}10`, border: `1px solid ${PV.error}40`, borderRadius: 8, padding: "8px 12px" }}>
              {error}
            </div>
          )}
          {result && (
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: PV.ink, background: PV.bg, border: `1px solid ${PV.border}`, borderRadius: 8, padding: "10px 12px" }}>
              อ่าน {result.total_rows.toLocaleString()} แถว · บันทึกใหม่ {result.upserted.toLocaleString()} · อัปเดต {result.modified.toLocaleString()}
              {result.error_count > 0 && <span style={{ color: PV.warn }}> · ข้าม {result.error_count.toLocaleString()} แถว</span>}
              {result.errors.length > 0 && (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: PV.gray, fontSize: 12 }}>
                  {result.errors.slice(0, 8).map((er, i) => <li key={i}>แถว {er.row}: {er.reason}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab 1: lookup ─────────────────────────────────────────────────────────────

function LookupTab({ prefill, onViewTransactions }: {
  prefill?: { product?: string; supplier?: string; seq: number }
  onViewTransactions?: (code: string) => void
}) {
  const [month, setMonth]       = useState(nowYM())
  const [product, setProduct]   = useState("")
  const [supplier, setSupplier] = useState("")
  const [groups, setGroups]     = useState<string[]>([])
  const [groupOptions, setGroupOptions] = useState<string[]>([])

  const [rows, setRows]           = useState<BenchmarkRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState("")
  const [searched, setSearched]   = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [totalProducts, setTotalProducts] = useState(0)
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)

  // group options for the multi-select (fuel already excluded server-side)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res  = await fetch(`/api/price-benchmark/groups?month=${month}`, { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.success) setGroupOptions(json.groups ?? [])
      } catch { /* non-critical */ }
    })()
    return () => { cancelled = true }
  }, [month])

  const search = useCallback(async (overrides?: { product?: string; supplier?: string }) => {
    const p = overrides?.product  ?? product
    const s = overrides?.supplier ?? supplier
    if (!p.trim() && !s.trim() && groups.length === 0) {
      setError("ระบุอย่างน้อย 1 เงื่อนไข: รหัสสินค้า ซัพพลายเออร์ หรือกลุ่มสินค้า")
      return
    }
    setLoading(true); setError(""); setSearched(true); setSelectedSupplier(null)
    const params = new URLSearchParams({ month })
    if (p.trim())      params.set("product_code", p.trim())
    if (s.trim())      params.set("supplier", s.trim())
    if (groups.length) params.set("groups", groups.join(","))
    try {
      const res  = await fetch(`/api/price-benchmark/lookup?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "API error")
      setRows(json.data)
      setTruncated(json.truncated)
      setTotalProducts(json.total_products)
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ")
      setRows([])
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, product, supplier, groups])

  // Drill-down from the overview tab: prefill fields and search immediately
  useEffect(() => {
    if (prefill && (prefill.product !== undefined || prefill.supplier !== undefined)) {
      setProduct(prefill.product ?? "")
      setSupplier(prefill.supplier ?? "")
      search({ product: prefill.product ?? "", supplier: prefill.supplier ?? "" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.seq])

  async function regenerate() {
    setRefreshing(true); setError("")
    try {
      const res  = await fetch("/api/price-benchmark/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, force: true }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "API error")
      if (searched) await search()
    } catch (e: any) {
      setError(e.message || "คำนวณใหม่ไม่สำเร็จ")
    } finally {
      setRefreshing(false)
    }
  }

  const productGroups = new Map<string, BenchmarkRow[]>()
  for (const r of rows) {
    const arr = productGroups.get(r.รหัสสินค้า) ?? []
    arr.push(r)
    productGroups.set(r.รหัสสินค้า, arr)
  }
  // Supplier facets ranked by spend — most relevant filter targets first
  const supplierAgg = new Map<string, { records: number; cost: number }>()
  for (const r of rows) {
    const ex = supplierAgg.get(r.ซัพพลายเออร์)
    if (ex) { ex.records += r.total_records; ex.cost += r.total_cost }
    else supplierAgg.set(r.ซัพพลายเออร์, { records: r.total_records, cost: r.total_cost })
  }
  const allSuppliers = Array.from(supplierAgg.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.cost - a.cost)
  const computedAt = rows[0]?.computed_at

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Filters — persistently visible (PropertyVue Do #4) */}
      <form
        onSubmit={e => { e.preventDefault(); search() }}
        style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, padding: 24, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 16 }}>
          <div>
            <Label>เดือน snapshot</Label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <Label>รหัส / ชื่อสินค้า</Label>
            <ProductCombobox
              month={month}
              value={product}
              onChange={setProduct}
              onPick={(code) => search({ product: code })}
            />
          </div>
          <div>
            <Label>ซัพพลายเออร์</Label>
            <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="ค้นหาบางส่วนได้" style={inputStyle} />
          </div>
          <div>
            <Label>กลุ่มสินค้า</Label>
            <GroupMultiSelect options={groupOptions} selected={groups} onChange={setGroups} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>
            {computedAt ? <>ราคากลางคำนวณล่าสุด {fmtDate(computedAt)}</> : <>ราคากลาง = ราคาที่พบบ่อยสุดใน 12 เดือนย้อนหลัง</>}
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            <SecondaryButton onClick={regenerate} disabled={refreshing || loading}>
              {refreshing ? "กำลังคำนวณ..." : "คำนวณราคากลางใหม่"}
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={loading || refreshing}>
              {loading ? "กำลังค้นหา..." : "ค้นหาราคากลาง"}
            </PrimaryButton>
          </div>
        </div>
      </form>

      <ContractUpload onUploaded={() => { if (searched) search() }} />

      {error && (
        <div style={{ fontFamily: FONT_BODY, fontSize: 14, color: PV.error, background: `${PV.error}10`, border: `1px solid ${PV.error}40`, borderRadius: 8, padding: 16 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton h={160} /><Skeleton h={160} />
        </div>
      )}

      {!searched && !loading && (
        <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, padding: 64, textAlign: "center" }}>
          <p style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: PV.ink }}>ค้นหาราคากลางก่อนสั่งซื้อ</p>
          <p style={{ fontFamily: FONT_BODY, fontSize: 14, color: PV.gray, marginTop: 4 }}>
            ระบุรหัสสินค้า / ซัพพลายเออร์ / กลุ่มสินค้า — ระบบแสดงราคากลางพร้อม ranking ราคาต่ำ → สูง และจำนวนครั้งที่พบ
          </p>
        </div>
      )}

      {searched && !loading && !error && rows.length === 0 && (
        <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, padding: 48, textAlign: "center", fontFamily: FONT_BODY, fontSize: 14, color: PV.gray }}>
          ไม่พบข้อมูลสำหรับเงื่อนไขที่เลือก
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {truncated && (
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: PV.warn, background: `${PV.warn}10`, border: `1px solid ${PV.warn}40`, borderRadius: 8, padding: "10px 16px" }}>
              พบ {totalProducts.toLocaleString()} รหัสสินค้า — แสดง 50 รายการแรก (เรียงตามมูลค่าซื้อ) กรุณาระบุเงื่อนไขให้แคบลง
            </div>
          )}

          {allSuppliers.length > 1 && (
            <SupplierFilter
              suppliers={allSuppliers}
              selected={selectedSupplier}
              onSelect={setSelectedSupplier}
            />
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {Array.from(productGroups.entries()).map(([code, productRows]) => (
              <ProductCard
                key={code}
                code={code}
                rows={productRows}
                month={month}
                selectedSupplier={selectedSupplier}
                autoChart={productGroups.size <= 8}
                onSelectSupplier={setSelectedSupplier}
                onViewTransactions={onViewTransactions}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab 2: overpriced report ──────────────────────────────────────────────────

function StatTile({ label, value, tone, sub, hint }: {
  label: string
  value: string
  tone?: "error" | "default"
  sub?: string
  hint?: string
}) {
  return (
    <div
      title={hint}
      style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
    >
      <div style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 500, color: PV.gray }}>
        {label}{hint ? <span style={{ marginLeft: 4, color: "#D1D5DB", cursor: "help" }}>ⓘ</span> : null}
      </div>
      <div style={{ fontFamily: FONT_HEAD, fontSize: 24, fontWeight: 700, color: tone === "error" ? PV.error : PV.ink, marginTop: 4 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: FONT_BODY, fontSize: 11, lineHeight: 1.45, color: PV.gray, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function OverpricedTab({ prefill }: { prefill?: { product?: string; seq: number } }) {
  const [start, setStart]       = useState(nowYM())
  const [end, setEnd]           = useState(nowYM())
  const [product, setProduct]   = useState("")
  const [supplier, setSupplier] = useState("")
  const [groups, setGroups]     = useState<string[]>([])
  const [groupOptions, setGroupOptions] = useState<string[]>([])

  const [summary, setSummary]   = useState<OverpricedSummary | null>(null)
  const [rows, setRows]         = useState<OverpricedRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")
  const [searched, setSearched] = useState(false)

  // Seed the range from available data: last up-to-12 months ending at the latest snapshot month
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res  = await fetch(`/api/price-benchmark/months`, { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.success && json.max) {
          const lo = json.min && json.min > shiftMonth(json.max, -11) ? json.min : shiftMonth(json.max, -11)
          setEnd(json.max)
          setStart(lo)
        }
      } catch { /* keep nowYM defaults */ }
    })()
    return () => { cancelled = true }
  }, [])

  // group options for the multi-select (fuel excluded server-side)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res  = await fetch(`/api/price-benchmark/groups?month=${end}`, { cache: "no-store" })
        const json = await res.json()
        if (!cancelled && json.success) setGroupOptions(json.groups ?? [])
      } catch { /* non-critical */ }
    })()
    return () => { cancelled = true }
  }, [end])

  const load = useCallback(async (overrides?: { product?: string }) => {
    const p = overrides?.product ?? product
    setLoading(true); setError(""); setSearched(true)
    const params = new URLSearchParams({ start, end })
    if (p.trim())        params.set("product_code", p.trim())
    if (supplier.trim()) params.set("supplier", supplier.trim())
    if (groups.length)   params.set("groups", groups.join(","))
    try {
      const res  = await fetch(`/api/price-benchmark/overpriced?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "API error")
      setSummary(json.summary)
      setRows(json.data)
      setTruncated(json.truncated)
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ")
      setSummary(null); setRows([])
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, product, supplier, groups])

  // Drill-down from lookup: prefill product code and run immediately
  useEffect(() => {
    if (prefill && prefill.product !== undefined) {
      setProduct(prefill.product)
      load({ product: prefill.product })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.seq])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <form
        onSubmit={e => { e.preventDefault(); load() }}
        style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, padding: 24, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" style={{ gap: 16 }}>
          <div>
            <Label>เดือนเริ่มต้น</Label>
            <input type="month" value={start} max={end} onChange={e => setStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <Label>เดือนสิ้นสุด</Label>
            <input type="month" value={end} min={start} onChange={e => setEnd(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <Label>รหัส / ชื่อสินค้า</Label>
            <ProductCombobox
              month={end}
              value={product}
              onChange={setProduct}
              onPick={(code) => load({ product: code })}
            />
          </div>
          <div>
            <Label>ซัพพลายเออร์</Label>
            <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="ว่าง = ทั้งหมด" style={inputStyle} />
          </div>
          <div>
            <Label>กลุ่มสินค้า</Label>
            <GroupMultiSelect options={groupOptions} selected={groups} onChange={setGroups} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>
            ตรวจช่วง {fmtYM(start)} – {fmtYM(end)} · เลือกได้สูงสุด 12 เดือน (ช่วงกว้างใช้เวลานานขึ้น)
          </span>
          <PrimaryButton type="submit" disabled={loading}>
            {loading ? "กำลังตรวจสอบ..." : "ตรวจสอบรายการซื้อ"}
          </PrimaryButton>
        </div>
      </form>

      {error && (
        <div style={{ fontFamily: FONT_BODY, fontSize: 14, color: PV.error, background: `${PV.error}10`, border: `1px solid ${PV.error}40`, borderRadius: 8, padding: 16 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16 }}>
            <Skeleton h={84} /><Skeleton h={84} /><Skeleton h={84} /><Skeleton h={84} />
          </div>
          <Skeleton h={300} />
        </div>
      )}

      {!searched && !loading && (
        <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, padding: 64, textAlign: "center" }}>
          <p style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: PV.ink }}>ตรวจจับรายการซื้อที่แพงกว่าราคากลาง</p>
          <p style={{ fontFamily: FONT_BODY, fontSize: 14, color: PV.gray, marginTop: 4 }}>
            เลือกช่วงเดือน แล้วระบบจะเทียบทุกรายการรับเข้ากับราคากลางของเดือนนั้น ๆ — แพงกว่าเมื่อไหร่ flag ทันที
          </p>
        </div>
      )}

      {summary && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16 }}>
            <StatTile label="รายการที่แพงกว่าราคากลาง" value={`${summary.flagged_count.toLocaleString()} / ${summary.receipts_checked.toLocaleString()}`} tone="error" />
            <StatTile label="มูลค่าส่วนเกินรวม (฿)" value={fmt0(summary.excess_total)} tone="error" />
            <StatTile label="หลุดช่วงปกติ IQR (วิกฤต)" value={(summary.critical_count ?? 0).toLocaleString()} tone="error" />
            <StatTile label="สินค้า / ซัพพลายเออร์ที่เกี่ยวข้อง" value={`${summary.flagged_products.toLocaleString()} / ${summary.flagged_suppliers.toLocaleString()}`} />
          </div>

          {truncated && (
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: PV.warn, background: `${PV.warn}10`, border: `1px solid ${PV.warn}40`, borderRadius: 8, padding: "10px 16px" }}>
              แสดง 500 รายการแรก (เรียงตามมูลค่าส่วนเกิน) — กรองเงื่อนไขเพิ่มเพื่อดูรายการที่เหลือ
            </div>
          )}

          {rows.length === 0 ? (
            <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, padding: 48, textAlign: "center", fontFamily: FONT_BODY, fontSize: 14, color: PV.green }}>
              ✓ ไม่พบรายการซื้อที่แพงกว่าราคากลางในเงื่อนไขนี้
            </div>
          ) : (
            <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
              {/* Scrolls both axes so the sticky header stays pinned while browsing 500 rows */}
              <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "70vh" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontFamily: FONT_BODY, minWidth: 1080 }}>
                  <thead>
                    <tr>
                      {["#", "วันที่", "PO", "สินค้า", "ซัพพลายเออร์", "คลัง", "ราคาซื้อ", "ราคากลาง", "ส่วนต่าง", "จำนวน", "ส่วนเกินรวม (฿)"].map((h, i) => (
                        <th key={h} style={{
                          fontFamily: FONT_BODY, fontSize: 12, fontWeight: 500, color: PV.gray, padding: "10px 12px",
                          textAlign: i >= 6 ? "right" : "left", whiteSpace: "nowrap",
                          position: "sticky", top: 0, zIndex: 2, background: PV.bg,
                          boxShadow: `inset 0 -1px 0 ${PV.border}`,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                        <td style={{ padding: "8px 12px", fontFamily: FONT_MONO, fontSize: 12, color: PV.gray }}>{i + 1}</td>
                        <td style={{ padding: "8px 12px", fontSize: 13, color: PV.ink, whiteSpace: "nowrap" }}>{fmtDate(r.วันที่)}</td>
                        <td style={{ padding: "8px 12px", fontFamily: FONT_MONO, fontSize: 12, color: PV.gray, whiteSpace: "nowrap" }}>{r.PO || r.PR || "—"}</td>
                        <td style={{ padding: "8px 12px", maxWidth: 240 }}>
                          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: PV.blue }}>{r.รหัสสินค้า}</div>
                          <div style={{ fontSize: 13, color: PV.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ชื่อสินค้า}</div>
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: 13, color: PV.ink, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.ซัพพลายเออร์}
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: 12, color: PV.gray, whiteSpace: "nowrap" }}>{r.คลังสินค้า}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: PV.error }}>{fmt(r.ราคาทุน)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, color: PV.green }}>
                          {fmt(r.benchmark_price)}
                          <span style={{ fontSize: 10, color: PV.gray }}> ({r.benchmark_count}/{r.benchmark_records})</span>
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <Chip tone={r.severity === "critical" ? "error" : "warning"}>
                            +{fmt(r.diff)}{r.diff_pct !== null ? ` (${r.diff_pct.toFixed(1)}%)` : ""}
                            {r.severity === "critical" ? " · หลุด IQR" : ""}
                          </Chip>
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, color: PV.ink }}>{fmt0(r.รับ)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: PV.error }}>{fmt0(r.excess_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {summary.no_benchmark_count > 0 && (
                <div style={{ padding: "8px 16px", background: PV.bg, borderTop: `1px solid ${PV.border}`, fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>
                  หมายเหตุ: {summary.no_benchmark_count.toLocaleString()} รายการไม่มีราคากลางให้เทียบ (ไม่เคยซื้อคู่สินค้า×ซัพพลายเออร์นี้ใน 12 เดือน)
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Tab 0: overview dashboard ─────────────────────────────────────────────────

function fmtCompact(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 2 })}M`
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toLocaleString("th-TH", { maximumFractionDigits: 0 })}k`
  return fmt0(v)
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{
      background: PV.ink, color: "#fff", borderRadius: 8, padding: "6px 12px",
      fontFamily: FONT_BODY, fontSize: 12, maxWidth: 220,
      boxShadow: "0 10px 20px rgba(0,0,0,0.10), 0 20px 48px rgba(0,0,0,0.12)",
    }}>
      <div style={{ fontWeight: 700 }}>{fmtYM(p.month)}</div>
      <div>ส่วนเกิน ฿{fmt0(p.excess_total)}</div>
      <div style={{ opacity: 0.8 }}>{p.flagged_count.toLocaleString()} / {p.receipts_checked.toLocaleString()} รายการแพงกว่าราคากลาง</div>
    </div>
  )
}

function RankList({ title, items, onClick }: {
  title: string
  items: { key: string; label: string; sub?: string; excess: number; count: number }[]
  onClick?: (key: string) => void
}) {
  const max = Math.max(...items.map(i => i.excess), 1)
  return (
    <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.06)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${PV.border}`, fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: PV.ink }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ padding: 24, fontFamily: FONT_BODY, fontSize: 13, color: PV.gray, textAlign: "center" }}>ไม่มีรายการ</div>
      ) : (
        <div>
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              onClick={() => onClick?.(it.key)}
              title={`${it.label} — ส่วนเกิน ฿${fmt0(it.excess)} จาก ${it.count.toLocaleString()} รายการ`}
              style={{
                all: "unset", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12,
                width: "100%", padding: "8px 16px", cursor: onClick ? "pointer" : "default",
                borderBottom: i < items.length - 1 ? "1px solid #F3F4F6" : "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = PV.bg }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 500, color: PV.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.label}
                </span>
                {it.sub && (
                  <span style={{ display: "block", fontFamily: FONT_MONO, fontSize: 11, color: PV.gray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.sub}
                  </span>
                )}
                <span style={{ display: "block", height: 4, background: "#F3F4F6", borderRadius: 9999, marginTop: 4, overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${(it.excess / max) * 100}%`, height: "100%", background: PV.blue, borderRadius: 9999 }} />
                </span>
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: PV.ink, flexShrink: 0 }}>
                ฿{fmtCompact(it.excess)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function OverviewTab({ onDrillProduct, onDrillSupplier }: {
  onDrillProduct:  (code: string) => void
  onDrillSupplier: (name: string) => void
}) {
  const [month, setMonth]     = useState(nowYM())
  const [groups, setGroups]   = useState<string[]>([])
  const [groupOptions, setGroupOptions] = useState<string[]>([])
  const [stats, setStats]     = useState<MonthStats | null>(null)
  const [trend, setTrend]     = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  const [slow, setSlow]       = useState(false)
  const loadedKey = useRef<string | null>(null)

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(""); setSlow(false)
    const slowTimer = setTimeout(() => setSlow(true), 4000)
    try {
      if (force) {
        const res = await fetch("/api/price-benchmark/snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month, force: true }),
        })
        const j = await res.json()
        if (!j.success) throw new Error(j.error || "API error")
      }
      const params = new URLSearchParams({ month })
      if (groups.length) params.set("groups", groups.join(","))
      if (force) params.set("force", "1")
      const res  = await fetch(`/api/price-benchmark/dashboard?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "API error")
      setStats(json.current)
      setTrend(json.trend)
      if (Array.isArray(json.group_options)) setGroupOptions(json.group_options)
      loadedKey.current = `${month}|${groups.join(",")}`
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      clearTimeout(slowTimer)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, groups])

  useEffect(() => {
    if (loadedKey.current !== `${month}|${groups.join(",")}`) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, groups])

  const s = stats?.summary
  const flaggedPct = s && s.receipts_checked > 0 ? (s.flagged_count / s.receipts_checked) * 100 : 0

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <Label>เดือน</Label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: 180 }} />
        </div>
        <div style={{ width: 240 }}>
          <Label>กลุ่มสินค้า</Label>
          <GroupMultiSelect options={groupOptions} selected={groups} onChange={setGroups} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {stats && (
            <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray }}>
              ราคากลาง {stats.snapshot_pairs.toLocaleString()} คู่สินค้า×ซัพพลายเออร์ · คำนวณล่าสุด {fmtDate(stats.computed_at)}
            </span>
          )}
          <SecondaryButton onClick={() => load(true)} disabled={loading}>
            {loading ? "กำลังคำนวณ..." : "คำนวณราคากลางใหม่"}
          </SecondaryButton>
        </div>
      </div>

      {error && (
        <div style={{ fontFamily: FONT_BODY, fontSize: 14, color: PV.error, background: `${PV.error}10`, border: `1px solid ${PV.error}40`, borderRadius: 8, padding: 16 }}>
          {error}
        </div>
      )}

      {loading && (
        <>
          {slow && (
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: PV.warn, background: `${PV.warn}10`, border: `1px solid ${PV.warn}40`, borderRadius: 8, padding: "10px 16px" }}>
              กำลังสร้างราคากลางย้อนหลังครั้งแรก อาจใช้เวลาประมาณ 1 นาที — ครั้งถัดไปจะเร็วขึ้น
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16 }}>
            <Skeleton h={84} /><Skeleton h={84} /><Skeleton h={84} /><Skeleton h={84} />
          </div>
          <Skeleton h={260} />
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
            <Skeleton h={420} /><Skeleton h={420} />
          </div>
        </>
      )}

      {stats && s && !loading && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16 }}>
            <StatTile
              label="รายการซื้อแพงกว่าราคากลาง"
              value={`${s.flagged_count.toLocaleString()} รายการ`}
              tone="error"
              sub={`จากรายการรับเข้าที่ตรวจทั้งหมด ${s.receipts_checked.toLocaleString()} รายการ ในเดือน ${fmtYM(month)}${groups.length ? ` เฉพาะ ${groups.length} กลุ่ม` : ""}`}
              hint="รายการรับเข้า (รับ > 0) ที่ราคาต่อหน่วยสูงกว่าราคากลางของสินค้า×ซัพพลายเออร์คู่นั้น แม้แต่บาทเดียวก็นับ"
            />
            <StatTile
              label="เงินที่จ่ายเกินราคากลาง"
              value={`฿${fmt0(s.excess_total)}`}
              tone="error"
              sub="ถ้าทุกรายการซื้อได้ที่ราคากลาง เดือนนี้จะประหยัดได้เท่านี้"
              hint="ตัวเลขเชิงโอกาส — บางรายการอาจมีเหตุผล เช่น ของขาด งานด่วน หรือสเปคต่างกัน คำนวณจาก (ราคาซื้อ − ราคากลาง) × จำนวนชิ้น รวมทุกรายการที่แพงกว่า"
            />
            <StatTile
              label="สัดส่วนที่ซื้อแพงกว่า"
              value={`${flaggedPct.toFixed(1)}%`}
              sub={flaggedPct > 0
                ? `คิดง่าย ๆ ทุก ${Math.max(2, Math.round(100 / flaggedPct))} รายการซื้อ มี 1 รายการแพงกว่าราคากลาง`
                : "ไม่มีรายการที่แพงกว่าราคากลางเลย"}
            />
            <StatTile
              label="กระจายอยู่ที่ใคร"
              value={`${s.flagged_products.toLocaleString()} สินค้า`}
              sub={`เกี่ยวข้องกับซัพพลายเออร์ ${s.flagged_suppliers.toLocaleString()} ราย — ดูตัวท็อปได้จากอันดับด้านล่าง`}
            />
          </div>

          {/* วิธีอ่าน */}
          <p style={{ fontFamily: FONT_BODY, fontSize: 11, color: PV.gray, margin: "-8px 2px 0" }}>
            วิธีอ่าน: <b>ราคากลาง</b> = ราคาที่พบบ่อยสุดใน 12 เดือนย้อนหลังของสินค้า×ซัพพลายเออร์แต่ละคู่ ·{" "}
            <b>แพงกว่า</b> = ราคาซื้อจริงสูงกว่าราคากลาง (ไม่มีเผื่อเปอร์เซ็นต์) · ชี้ที่ ⓘ บนการ์ดเพื่อดูรายละเอียด
          </p>

          {/* 6-month trend */}
          <div style={{ background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 8, boxShadow: "0 1px 2px rgba(0,0,0,0.06)", padding: "16px 16px 8px" }}>
            <div style={{ fontFamily: FONT_HEAD, fontSize: 16, fontWeight: 600, color: PV.ink, marginBottom: 8 }}>
              มูลค่าส่วนเกินจากราคากลาง 6 เดือนล่าสุด
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="#F3F4F6" />
                <XAxis
                  dataKey="month"
                  tickFormatter={fmtYM}
                  tick={{ fontFamily: FONT_BODY, fontSize: 12, fill: PV.gray }}
                  axisLine={{ stroke: PV.border }} tickLine={false}
                />
                <YAxis
                  tickFormatter={fmtCompact}
                  tick={{ fontFamily: FONT_MONO, fontSize: 11, fill: PV.gray }}
                  axisLine={false} tickLine={false} width={52}
                />
                <Tooltip content={<TrendTooltip />} cursor={{ fill: `${PV.blue}08` }} />
                <Bar dataKey="excess_total" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {trend.map(t => (
                    <Cell key={t.month} fill={t.month === month ? PV.blue : `${PV.blue}59`} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Top-10 drill-down lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16 }}>
            <RankList
              title="Top 10 สินค้า — ส่วนเกินสูงสุด"
              items={stats.top_products.map(p => ({ key: p.code, label: p.name || p.code, sub: `${p.code} · ${p.group || "—"}`, excess: p.excess, count: p.count }))}
              onClick={onDrillProduct}
            />
            <RankList
              title="Top 10 ซัพพลายเออร์ — ส่วนเกินสูงสุด"
              items={stats.top_suppliers.map(sp => ({ key: sp.supplier, label: sp.supplier, excess: sp.excess, count: sp.count }))}
              onClick={onDrillSupplier}
            />
          </div>

          {/* Group breakdown */}
          {stats.by_group.length > 0 && (
            <RankList
              title="ส่วนเกินแยกตามกลุ่มสินค้า"
              items={stats.by_group.map(g => ({ key: g.group, label: g.group, excess: g.excess, count: g.count }))}
            />
          )}

          <p style={{ fontFamily: FONT_BODY, fontSize: 12, color: PV.gray, textAlign: "center" }}>
            คลิกสินค้า/ซัพพลายเออร์เพื่อดูราคากลางและ ranking ราคาแบบละเอียด · ดูรายการ transaction ทั้งหมดได้ที่แท็บ "รายการซื้อแพงกว่าราคากลาง"
          </p>
        </>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PriceBenchmarkPage() {
  const [tab, setTab] = useState<"overview" | "lookup" | "overpriced">("overview")
  const [prefill, setPrefill] = useState<{ product?: string; supplier?: string; seq: number } | undefined>()
  const [opPrefill, setOpPrefill] = useState<{ product?: string; seq: number } | undefined>()

  const tabs = [
    { id: "overview" as const,   label: "ภาพรวม" },
    { id: "lookup" as const,     label: "ค้นหาราคากลาง" },
    { id: "overpriced" as const, label: "รายการซื้อแพงกว่าราคากลาง" },
  ]

  function drillProduct(code: string) {
    setPrefill(prev => ({ product: code, seq: (prev?.seq ?? 0) + 1 }))
    setTab("lookup")
  }

  function drillSupplier(name: string) {
    setPrefill(prev => ({ supplier: name, seq: (prev?.seq ?? 0) + 1 }))
    setTab("lookup")
  }

  function drillTransactions(code: string) {
    setOpPrefill(prev => ({ product: code, seq: (prev?.seq ?? 0) + 1 }))
    setTab("overpriced")
  }

  return (
    <div style={{ fontFamily: FONT_BODY, display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: FONT_HEAD, fontSize: 30, fontWeight: 700, lineHeight: 1.25, color: PV.ink }}>
          ระบบราคากลาง
        </h1>
        <p style={{ fontFamily: FONT_BODY, fontSize: 14, color: PV.gray, marginTop: 4 }}>
          ราคากลาง = ราคาที่พบบ่อยสุด (mode) ต่อ รหัสสินค้า × ซัพพลายเออร์ จากข้อมูลรับเข้า 12 เดือนย้อนหลัง · snapshot รายเดือน
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${PV.border}` }}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              fontFamily: FONT_BODY, fontSize: 14, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? PV.blue : PV.gray,
              background: "transparent", border: "none", cursor: "pointer",
              padding: "10px 16px",
              borderBottom: tab === t.id ? `2px solid ${PV.blue}` : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: tab === "overview" ? "block" : "none" }}>
        <OverviewTab onDrillProduct={drillProduct} onDrillSupplier={drillSupplier} />
      </div>
      <div style={{ display: tab === "lookup" ? "block" : "none" }}>
        <LookupTab prefill={prefill} onViewTransactions={drillTransactions} />
      </div>
      <div style={{ display: tab === "overpriced" ? "block" : "none" }}>
        <OverpricedTab prefill={opPrefill} />
      </div>
    </div>
  )
}
