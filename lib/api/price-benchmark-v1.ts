/**
 * Price Benchmark Public API v1 — pure shaping logic.
 *
 * No I/O here on purpose: the route does the Mongo reads, this file turns
 * benchmark docs into the public response shape so the numbers can be unit
 * tested and so they stay identical to what /price-benchmark shows on screen.
 */
import { weightedIQRBounds, type BenchmarkDoc, type PricePoint } from "@/lib/price-benchmark"

/** A benchmark row with the negotiated contract price already overlaid. */
export type BenchmarkRowWithContract = BenchmarkDoc & {
  contract_price?: number
  contract_effective_start?: string
  contract_effective_end?: string | null
}

export type V1Supplier = {
  supplier: string
  benchmark_price: number
  benchmark_count: number
  benchmark_pct: number
  min_price: number
  max_price: number
  min_price_trimmed: number
  max_price_trimmed: number
  total_records: number
  total_qty: number
  total_cost: number
  first_month: string
  last_month: string
  contract_price: number | null
  contract_effective_start: string | null
  contract_effective_end: string | null
  prices?: PricePoint[]
}

export type V1Recommendation = {
  price: number
  supplier: string
  based_on_records: number
  based_on_pct: number
  window_months: number
  last_purchase_month: string
  overpaid_vs_cheapest: number
  thin_data: boolean
  stale: boolean
}

export type V1Item = {
  code: string
  found: boolean
  reason?: "no_data" | "fallback_limit"
  name?: string
  group?: string
  source?: "snapshot" | "fallback"
  window?: { start: string; end: string; months: number }
  benchmark_price?: number
  mid_price?: number
  min_price?: number
  max_price?: number
  min_price_trimmed?: number
  max_price_trimmed?: number
  total_records?: number
  total_qty?: number
  total_cost?: number
  supplier_count?: number
  last_purchase_month?: string
  suppliers?: V1Supplier[]
  recommendation?: V1Recommendation
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Inclusive month span, e.g. 2025-10 → 2026-09 = 12. */
export function monthSpan(start: string, end: string): number {
  if (!start || !end) return 0
  const [sy, sm] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)
  return (ey - sy) * 12 + (em - sm) + 1
}

/** How many months ago a YYYY-MM is, relative to `now` (default: today). */
export function monthsAgo(ym: string, now: Date = new Date()): number {
  if (!ym) return 0
  const [y, m] = ym.split("-").map(Number)
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
}

/**
 * Median of the per-supplier ราคากลาง weighted by how many times each supplier
 * was actually bought from. This is the number mena-wms already computes for
 * itself in /api/pr/items — kept here so both sides read one definition.
 */
export function weightedMedian(rows: Pick<BenchmarkDoc, "benchmark_price" | "total_records">[]): number {
  const weighted: number[] = []
  for (const r of rows) {
    const w = Math.max(1, r.total_records || 0)
    for (let i = 0; i < w; i++) weighted.push(r.benchmark_price)
  }
  if (weighted.length === 0) return 0
  weighted.sort((a, b) => a - b)
  return round2(weighted[Math.floor(weighted.length / 2)])
}

/**
 * Pooled ราคากลาง across every supplier of the product: merge all price points
 * and take the mode (tie → lower price), same as the "ทุกซัพพลายเออร์" row on
 * the /price-benchmark page.
 */
export function pooledBenchmark(rows: BenchmarkDoc[]): {
  benchmark_price: number
  min_price: number
  max_price: number
  min_price_trimmed: number
  max_price_trimmed: number
} {
  const map = new Map<number, { count: number; qty: number; cost: number }>()
  for (const r of rows) {
    for (const p of r.prices ?? []) {
      const ex = map.get(p.price)
      if (ex) { ex.count += p.count; ex.qty += p.qty; ex.cost += p.cost }
      else map.set(p.price, { count: p.count, qty: p.qty, cost: p.cost })
    }
  }
  const total = rows.reduce((s, r) => s + r.total_records, 0)
  const merged = Array.from(map.entries())
    .map(([price, v]) => ({ price, ...v, pct: (v.count / (total || 1)) * 100 }))
    .sort((a, b) => a.price - b.price)

  if (merged.length === 0) {
    // snapshot without price points (shouldn't happen) — fall back to row extremes
    const prices = rows.map(r => r.benchmark_price).sort((a, b) => a - b)
    const lo = prices[0] ?? 0
    const hi = prices[prices.length - 1] ?? 0
    return { benchmark_price: lo, min_price: lo, max_price: hi, min_price_trimmed: lo, max_price_trimmed: hi }
  }

  const bounds = weightedIQRBounds(merged)
  const flagged = merged.map(p => ({
    ...p,
    outlier: !!bounds && (p.price < bounds.lower || p.price > bounds.upper),
  }))
  const inRange = flagged.filter(p => !p.outlier)
  const trimmed = inRange.length > 0 ? inRange : flagged
  // mode: highest count, tie → lower price (array is sorted ascending)
  let mode = flagged[0]
  for (const p of flagged) if (p.count > mode.count) mode = p

  return {
    benchmark_price: mode.price,
    min_price: flagged[0].price,
    max_price: flagged[flagged.length - 1].price,
    min_price_trimmed: trimmed[0].price,
    max_price_trimmed: trimmed[trimmed.length - 1].price,
  }
}

/**
 * ราคาแนะนำ = the cheapest supplier's ราคากลาง (tie → the one bought from more
 * often), plus what was paid above it over the window. Mirrors RecommendationCard
 * in app/price-benchmark/page.tsx so the API and the screen never disagree.
 */
export function recommend(rows: BenchmarkDoc[], now: Date = new Date()): V1Recommendation | undefined {
  const byPrice = [...rows].sort(
    (a, b) => a.benchmark_price - b.benchmark_price || b.total_records - a.total_records
  )
  const best = byPrice[0]
  if (!best) return undefined

  const totalQty = rows.reduce((s, r) => s + r.total_qty, 0)
  const totalCost = rows.reduce((s, r) => s + r.total_cost, 0)

  return {
    price: best.benchmark_price,
    supplier: best.ซัพพลายเออร์,
    based_on_records: best.benchmark_count,
    based_on_pct: round2(best.benchmark_pct),
    window_months: monthSpan(best.window_start, best.window_end),
    last_purchase_month: best.last_date,
    overpaid_vs_cheapest: round2(Math.max(0, totalCost - best.benchmark_price * totalQty)),
    thin_data: best.total_records < 3,
    stale: monthsAgo(best.last_date, now) > 6,
  }
}

/** Shape one product's supplier rows into the public item payload. */
export function buildItem(
  code: string,
  rows: BenchmarkRowWithContract[],
  source: "snapshot" | "fallback",
  opts: { includePrices?: boolean; now?: Date } = {}
): V1Item {
  if (rows.length === 0) return { code, found: false, reason: "no_data" }

  const sorted = [...rows].sort((a, b) => b.total_cost - a.total_cost)
  const pooled = pooledBenchmark(sorted)
  const first = sorted[0]

  const suppliers: V1Supplier[] = [...sorted]
    .sort((a, b) => a.benchmark_price - b.benchmark_price || b.total_records - a.total_records)
    .map(r => ({
      supplier: r.ซัพพลายเออร์,
      benchmark_price: r.benchmark_price,
      benchmark_count: r.benchmark_count,
      benchmark_pct: round2(r.benchmark_pct),
      min_price: r.min_price,
      max_price: r.max_price,
      min_price_trimmed: r.min_price_trimmed,
      max_price_trimmed: r.max_price_trimmed,
      total_records: r.total_records,
      total_qty: round2(r.total_qty),
      total_cost: round2(r.total_cost),
      first_month: r.first_date,
      last_month: r.last_date,
      contract_price: r.contract_price ?? null,
      contract_effective_start: r.contract_effective_start ?? null,
      contract_effective_end: r.contract_effective_end ?? null,
      ...(opts.includePrices ? { prices: r.prices } : {}),
    }))

  return {
    code,
    found: true,
    name: first.ชื่อสินค้า,
    group: first.กลุ่มสินค้า,
    source,
    window: {
      start: first.window_start,
      end: first.window_end,
      months: monthSpan(first.window_start, first.window_end),
    },
    benchmark_price: pooled.benchmark_price,
    mid_price: weightedMedian(sorted),
    min_price: pooled.min_price,
    max_price: pooled.max_price,
    min_price_trimmed: pooled.min_price_trimmed,
    max_price_trimmed: pooled.max_price_trimmed,
    total_records: sorted.reduce((s, r) => s + r.total_records, 0),
    total_qty: round2(sorted.reduce((s, r) => s + r.total_qty, 0)),
    total_cost: round2(sorted.reduce((s, r) => s + r.total_cost, 0)),
    supplier_count: sorted.length,
    last_purchase_month: sorted.reduce((m, r) => (r.last_date > m ? r.last_date : m), ""),
    suppliers,
    recommendation: recommend(sorted, opts.now),
  }
}
