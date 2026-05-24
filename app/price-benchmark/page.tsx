"use client"

import React, { useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type PricePoint = {
  price: number | null
  count: number
  cost:  number
  qty:   number
  pct:   number
}

type BenchmarkResult = {
  รหัสสินค้า:    string
  ซัพพลายเออร์:  string
  ชื่อสินค้า:    string
  กลุ่มสินค้า:   string
  total_records: number
  total_cost:    number
  total_qty:     number
  first_date:    string
  last_date:     string
  prices:        PricePoint[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(v: number | null) {
  if (v === null || !Number.isFinite(v as number)) return "—"
  return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtCost(v: number) {
  return v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(ym: string) {
  if (!ym) return "—"
  const [y, m] = ym.split("-")
  const MONTHS = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
  return `${MONTHS[Number(m)] ?? m} ${Number(y) + 543}`
}

function nowYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function startOfYear() {
  return `${new Date().getFullYear()}-01`
}

function computeIQRBounds(prices: PricePoint[]): { lower: number; upper: number } | null {
  const valid = prices.filter(p => p.price !== null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  const total = valid.reduce((s, p) => s + p.count, 0)
  if (total < 4) return null

  function weightedPct(pct: number): number {
    const target = pct * total
    let cum = 0
    for (const p of valid) {
      cum += p.count
      if (cum >= target) return p.price!
    }
    return valid[valid.length - 1].price!
  }

  const q1 = weightedPct(0.25)
  const q3 = weightedPct(0.75)
  const iqr = q3 - q1
  if (iqr === 0) return null
  return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr }
}

function aggregateForProduct(rows: BenchmarkResult[]): BenchmarkResult {
  const priceMap = new Map<number, { count: number; cost: number; qty: number }>()
  for (const row of rows) {
    for (const p of row.prices) {
      if (p.price === null) continue
      const ex = priceMap.get(p.price)
      if (ex) { ex.count += p.count; ex.cost += p.cost; ex.qty += p.qty }
      else priceMap.set(p.price, { count: p.count, cost: p.cost, qty: p.qty })
    }
  }
  const total_records = rows.reduce((s, r) => s + r.total_records, 0)
  const prices: PricePoint[] = Array.from(priceMap.entries())
    .map(([price, { count, cost, qty }]) => ({ price, count, cost, qty, pct: (count / (total_records || 1)) * 100 }))
    .sort((a, b) => b.count - a.count)
  return {
    รหัสสินค้า:    rows[0].รหัสสินค้า,
    ซัพพลายเออร์:  "ทุกซัพพลายเออร์",
    ชื่อสินค้า:    rows[0].ชื่อสินค้า,
    กลุ่มสินค้า:   rows[0].กลุ่มสินค้า,
    total_records,
    total_cost:    rows.reduce((s, r) => s + r.total_cost, 0),
    total_qty:     rows.reduce((s, r) => s + r.total_qty, 0),
    first_date:    rows.map(r => r.first_date).sort()[0],
    last_date:     rows.map(r => r.last_date).sort().reverse()[0],
    prices,
  }
}

function isOutlierPrice(price: number | null, bounds: { lower: number; upper: number } | null): boolean {
  if (!bounds || price === null) return false
  return price < bounds.lower || price > bounds.upper
}

// ── Price Table ───────────────────────────────────────────────────────────────
// Renders mode / min / max / rank 2-5 as table rows with price, %, count

function PriceTable({ result, isOverall }: { result: BenchmarkResult; isOverall?: boolean }) {
  const prices = result.prices
  const iqr    = computeIQRBounds(prices)

  const sorted = [...prices].filter(p => p.price !== null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  const mode   = prices[0] ?? null
  const minRow = sorted[0] ?? null
  const maxRow = sorted[sorted.length - 1] ?? null
  const ranks  = prices.slice(1, 5)

  const rows: { label: string; point: PricePoint | null; color: string }[] = [
    { label: "ราคาที่พบมากสุด", point: mode,   color: "text-indigo-700" },
    { label: "ราคาต่ำสุด",      point: minRow, color: "text-emerald-700" },
    { label: "ราคาสูงสุด",      point: maxRow, color: "text-amber-700" },
    ...ranks.map((p, i) => ({ label: `อันดับ ${i + 2}`, point: p, color: "text-gray-600" })),
  ]

  return (
    <div className="flex flex-col">
      {rows.map(({ label, point, color }, i) => {
        if (!point) return null
        const outlier = isOutlierPrice(point.price, iqr)
        return (
          <div
            key={i}
            className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 ${
              outlier ? "opacity-50" : ""
            } ${isOverall && i === 0 ? "bg-indigo-50/60" : ""}`}
          >
            {/* Label */}
            <span className={`text-xs font-semibold w-32 shrink-0 ${color}`}>{label}</span>

            {/* Price */}
            <span className={`text-sm font-bold tabular-nums font-mono flex-1 ${
              outlier ? "line-through text-gray-300" : "text-gray-900"
            }`}>
              {fmt2(point.price)}
            </span>

            {/* % badge */}
            <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ${
              i === 0
                ? "bg-indigo-100 text-indigo-700"
                : "bg-gray-100 text-gray-500"
            }`}>
              {point.pct.toFixed(1)}%
            </span>

            {/* Count */}
            <span className="text-xs tabular-nums text-gray-400 w-16 text-right shrink-0">
              {point.count.toLocaleString()} ครั้ง
            </span>

            {/* Outlier badge */}
            {outlier && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-500 uppercase tracking-wide shrink-0">
                outlier
              </span>
            )}
          </div>
        )
      })}

      {/* IQR footer */}
      {iqr && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">IQR ช่วงปกติ</span>
          <span className="text-[11px] font-mono text-gray-500 tabular-nums">
            {fmt2(iqr.lower)} – {fmt2(iqr.upper)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Supplier Section ──────────────────────────────────────────────────────────

function SupplierSection({
  result,
  rank,
  isOverall,
  dimmed,
}: {
  result:    BenchmarkResult
  rank:      number
  isOverall: boolean
  dimmed:    boolean
}) {
  const accentColor = isOverall
    ? "border-indigo-400 bg-indigo-50"
    : "border-violet-400 bg-white"

  return (
    <div
      className={`rounded-xl border border-gray-200 overflow-hidden transition-opacity duration-200 ${
        dimmed ? "opacity-30" : "opacity-100"
      }`}
    >
      {/* Section header */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-gray-200 ${isOverall ? "bg-indigo-50" : "bg-gray-50"}`}>
        {/* Rank or overall badge */}
        {isOverall ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-100 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
            ภาพรวมทุกซัพพลายเออร์
          </span>
        ) : (
          <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
            {rank}
          </span>
        )}

        {/* Supplier name */}
        {!isOverall && (
          <span className="text-sm font-semibold text-gray-800 truncate flex-1">
            {result.ซัพพลายเออร์}
          </span>
        )}

        <div className="flex items-center gap-3 ml-auto shrink-0">
          {/* Total cost */}
          <span className="text-xs font-bold tabular-nums text-gray-700">
            ฿{fmtCost(result.total_cost)}
          </span>
          {/* Records */}
          <span className="text-xs tabular-nums text-gray-400">
            {result.total_records.toLocaleString()} ครั้ง
          </span>
          {/* Date range */}
          <span className="text-xs text-gray-400">
            {fmtDate(result.first_date)}
            {result.first_date !== result.last_date && (
              <> – {fmtDate(result.last_date)}</>
            )}
          </span>
        </div>
      </div>

      {/* Price table */}
      <PriceTable result={result} isOverall={isOverall} />
    </div>
  )
}

// ── Product Block ─────────────────────────────────────────────────────────────

function ProductBlock({
  productCode,
  rows,
  selectedSupplier,
}: {
  productCode:      string
  rows:             BenchmarkResult[]
  selectedSupplier: string | null
}) {
  const aggregate      = aggregateForProduct(rows)
  const suppliersRanked = [...rows].sort((a, b) => b.total_cost - a.total_cost)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Product header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-200 bg-gray-50">
        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg tracking-wider shrink-0">
          {productCode}
        </span>
        <span className="text-sm font-semibold text-gray-900 truncate flex-1">
          {rows[0].ชื่อสินค้า}
        </span>
        {rows[0].กลุ่มสินค้า && (
          <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded shrink-0">
            {rows[0].กลุ่มสินค้า}
          </span>
        )}
        <span className="text-[10px] text-gray-400 shrink-0">
          {rows.length} ซัพพลายเออร์
        </span>
      </div>

      {/* Sections */}
      <div className="p-4 flex flex-col gap-3">
        {/* Overall */}
        <SupplierSection
          result={aggregate}
          rank={0}
          isOverall={true}
          dimmed={false}
        />

        {/* Per supplier, sorted by total_cost desc */}
        {suppliersRanked.map((r, i) => {
          const dimmed = selectedSupplier !== null && selectedSupplier !== r.ซัพพลายเออร์
          return (
            <SupplierSection
              key={`${r.รหัสสินค้า}||${r.ซัพพลายเออร์}`}
              result={r}
              rank={i + 1}
              isOverall={false}
              dimmed={dimmed}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PriceBenchmarkPage() {
  const [startMonth,    setStartMonth]    = useState(startOfYear())
  const [endMonth,      setEndMonth]      = useState(nowYM())
  const [supplierInput, setSupplierInput] = useState("")
  const [productInput,  setProductInput]  = useState("")

  const [results,        setResults]        = useState<BenchmarkResult[]>([])
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState("")
  const [hasSearched,    setHasSearched]    = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    setHasSearched(true)
    setSelectedSupplier(null)

    const params = new URLSearchParams()
    params.set("start", startMonth)
    params.set("end",   endMonth)
    if (supplierInput.trim()) params.set("supplier",     supplierInput.trim())
    if (productInput.trim())  params.set("product_code", productInput.trim())

    try {
      const res  = await fetch(`/api/cost/benchmark-v2?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "API error")
      setResults(json.data)
    } catch (err: any) {
      setError(err.message || "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  const groups = new Map<string, BenchmarkResult[]>()
  for (const r of results) {
    const arr = groups.get(r.รหัสสินค้า) ?? []
    arr.push(r)
    groups.set(r.รหัสสินค้า, arr)
  }
  const allSuppliers = Array.from(new Set(results.map(r => r.ซัพพลายเออร์))).sort()
  const showChips    = allSuppliers.length > 1

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Platform ราคากลาง</h1>
        <p className="text-sm text-gray-500 mt-1">
          วิเคราะห์การกระจายตัวของราคา · เปรียบเทียบซัพพลายเออร์ · ตรวจจับ outlier ด้วย IQR
        </p>
      </div>

      {/* Filter form */}
      <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">เดือนเริ่มต้น</label>
            <input
              type="month"
              value={startMonth}
              onChange={e => setStartMonth(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">เดือนสิ้นสุด</label>
            <input
              type="month"
              value={endMonth}
              onChange={e => setEndMonth(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">รหัสสินค้า</label>
            <input
              type="text"
              value={productInput}
              onChange={e => setProductInput(e.target.value)}
              placeholder="เช่น LB00090"
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ซัพพลายเออร์</label>
            <input
              type="text"
              value={supplierInput}
              onChange={e => setSupplierInput(e.target.value)}
              placeholder="ชื่อซัพพลายเออร์ (ว่าง = ทั้งหมด)"
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {loading ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />กำลังค้นหา...</>
            ) : "ค้นหา"}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}

      {/* Empty state */}
      {!hasSearched && !loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">ระบุรหัสสินค้าแล้วกด ค้นหา</p>
          <p className="text-xs text-gray-400 mt-1">ระบบจะแสดงการกระจายตัวของราคาและเปรียบเทียบซัพพลายเออร์</p>
        </div>
      )}

      {/* No results */}
      {hasSearched && !loading && !error && results.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400 shadow-sm">
          ไม่พบข้อมูลสำหรับเงื่อนไขที่เลือก
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Supplier chips */}
          {showChips && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 shrink-0">ซัพพลายเออร์</span>
              <button
                onClick={() => setSelectedSupplier(null)}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-all ${
                  selectedSupplier === null
                    ? "bg-indigo-600 text-white border-transparent"
                    : "border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
                }`}
              >
                ทั้งหมด
              </button>
              {allSuppliers.map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedSupplier(prev => prev === s ? null : s)}
                  className={`text-xs px-3 py-1 rounded-full border font-medium transition-all ${
                    selectedSupplier === s
                      ? "bg-violet-600 text-white border-transparent"
                      : "border-gray-200 text-gray-500 hover:border-violet-400 hover:text-violet-600"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Product blocks */}
          <div className="flex flex-col gap-6">
            {Array.from(groups.entries()).map(([productCode, rows]) => (
              <ProductBlock
                key={productCode}
                productCode={productCode}
                rows={rows}
                selectedSupplier={selectedSupplier}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
