import { describe, it, expect, vi } from "vitest"

// lib/mongo throws at import without MONGO_URI — mock before importing the module under test
vi.mock("@/lib/mongo", () => ({ default: new Promise(() => {}) }))

import type { BenchmarkDoc } from "@/lib/price-benchmark"
import { buildItem, monthSpan, monthsAgo, pooledBenchmark, recommend, weightedMedian } from "./price-benchmark-v1"
import { BatchRequestSchema, MAX_CODES } from "./price-benchmark-v1.schema"

/** A benchmark row with just enough filled in to exercise the shaping logic. */
function row(p: Partial<BenchmarkDoc> & { ซัพพลายเออร์: string; benchmark_price: number }): BenchmarkDoc {
  const prices = p.prices ?? [
    { price: p.benchmark_price, count: p.total_records ?? 1, qty: p.total_qty ?? 1, cost: 0, pct: 100, outlier: false },
  ]
  return {
    snapshot_month: "2026-09",
    window_start: "2025-10",
    window_end: "2026-09",
    รหัสสินค้า: "LB13OT00128",
    ชื่อสินค้า: "ไส้กรองน้ำมันเครื่อง",
    กลุ่มสินค้า: "อะไหล่",
    benchmark_count: p.total_records ?? 1,
    benchmark_pct: 100,
    min_price: p.benchmark_price,
    max_price: p.benchmark_price,
    iqr_lower: null,
    iqr_upper: null,
    min_price_trimmed: p.benchmark_price,
    max_price_trimmed: p.benchmark_price,
    total_records: 1,
    total_qty: 1,
    total_cost: p.benchmark_price,
    first_date: "2026-01",
    last_date: "2026-09",
    computed_at: new Date(),
    ...p,
    prices,
  }
}

describe("monthSpan / monthsAgo", () => {
  it("counts an inclusive 12-month window", () => {
    expect(monthSpan("2025-10", "2026-09")).toBe(12)
  })

  it("spans across years for a fallback window", () => {
    expect(monthSpan("2023-01", "2026-09")).toBe(45)
  })

  it("measures age against a fixed now", () => {
    expect(monthsAgo("2026-03", new Date("2026-09-15"))).toBe(6)
  })
})

describe("weightedMedian", () => {
  it("lets the frequently-bought supplier pull the median", () => {
    // 900 bought 10×, 2200 bought once → median sits at 900
    const rows = [
      { benchmark_price: 900, total_records: 10 },
      { benchmark_price: 2200, total_records: 1 },
    ]
    expect(weightedMedian(rows)).toBe(900)
  })

  it("treats a supplier with no record count as weight 1", () => {
    expect(weightedMedian([{ benchmark_price: 500, total_records: 0 }])).toBe(500)
  })

  it("returns 0 for no rows", () => {
    expect(weightedMedian([])).toBe(0)
  })
})

describe("pooledBenchmark", () => {
  it("takes the mode across every supplier's price points", () => {
    const rows = [
      row({ ซัพพลายเออร์: "A", benchmark_price: 1500, prices: [
        { price: 1500, count: 5, qty: 5, cost: 7500, pct: 50, outlier: false },
      ] }),
      row({ ซัพพลายเออร์: "B", benchmark_price: 900, prices: [
        { price: 900, count: 2, qty: 2, cost: 1800, pct: 20, outlier: false },
        { price: 2200, count: 1, qty: 1, cost: 2200, pct: 10, outlier: false },
      ] }),
    ]
    const pooled = pooledBenchmark(rows)
    expect(pooled.benchmark_price).toBe(1500) // 5 hits beats 2 and 1
    expect(pooled.min_price).toBe(900)
    expect(pooled.max_price).toBe(2200)
  })

  it("breaks a tie toward the lower price", () => {
    const rows = [
      row({ ซัพพลายเออร์: "A", benchmark_price: 1500, prices: [
        { price: 1500, count: 3, qty: 3, cost: 4500, pct: 50, outlier: false },
      ] }),
      row({ ซัพพลายเออร์: "B", benchmark_price: 900, prices: [
        { price: 900, count: 3, qty: 3, cost: 2700, pct: 50, outlier: false },
      ] }),
    ]
    expect(pooledBenchmark(rows).benchmark_price).toBe(900)
  })
})

describe("recommend", () => {
  const now = new Date("2026-09-15")

  it("picks the cheapest supplier and prices the gap", () => {
    const rows = [
      row({ ซัพพลายเออร์: "แพง", benchmark_price: 1500, total_records: 4, total_qty: 10, total_cost: 15000 }),
      row({ ซัพพลายเออร์: "ถูก", benchmark_price: 900, total_records: 6, total_qty: 10, total_cost: 9000 }),
    ]
    const rec = recommend(rows, now)!
    expect(rec.supplier).toBe("ถูก")
    expect(rec.price).toBe(900)
    // 24,000 paid for 20 pcs vs 900×20 = 18,000
    expect(rec.overpaid_vs_cheapest).toBe(6000)
    expect(rec.window_months).toBe(12)
  })

  it("never reports a negative overpay", () => {
    const rows = [row({ ซัพพลายเออร์: "A", benchmark_price: 1500, total_qty: 10, total_cost: 9000 })]
    expect(recommend(rows, now)!.overpaid_vs_cheapest).toBe(0)
  })

  it("breaks a price tie toward the supplier bought from more often", () => {
    const rows = [
      row({ ซัพพลายเออร์: "นาน ๆ ครั้ง", benchmark_price: 900, total_records: 1 }),
      row({ ซัพพลายเออร์: "ประจำ", benchmark_price: 900, total_records: 9 }),
    ]
    expect(recommend(rows, now)!.supplier).toBe("ประจำ")
  })

  it("flags thin data and a stale price", () => {
    const rows = [row({ ซัพพลายเออร์: "A", benchmark_price: 900, total_records: 2, last_date: "2025-12" })]
    const rec = recommend(rows, now)!
    expect(rec.thin_data).toBe(true)
    expect(rec.stale).toBe(true)
  })

  it("returns undefined with no rows", () => {
    expect(recommend([], now)).toBeUndefined()
  })
})

describe("buildItem", () => {
  const now = new Date("2026-09-15")

  it("reports a code with no rows as not found", () => {
    const item = buildItem("NOPE", [], "snapshot", { now })
    expect(item).toEqual({ code: "NOPE", found: false, reason: "no_data" })
  })

  it("sorts suppliers cheapest first and totals the window", () => {
    const item = buildItem(
      "LB13OT00128",
      [
        row({ ซัพพลายเออร์: "แพง", benchmark_price: 1500, total_records: 4, total_qty: 4, total_cost: 6000 }),
        row({ ซัพพลายเออร์: "ถูก", benchmark_price: 900, total_records: 6, total_qty: 6, total_cost: 5400 }),
      ],
      "snapshot",
      { now }
    )
    expect(item.found).toBe(true)
    expect(item.suppliers!.map(s => s.supplier)).toEqual(["ถูก", "แพง"])
    expect(item.supplier_count).toBe(2)
    expect(item.total_records).toBe(10)
    expect(item.total_cost).toBe(11400)
    expect(item.recommendation!.supplier).toBe("ถูก")
    expect(item.window).toEqual({ start: "2025-10", end: "2026-09", months: 12 })
  })

  it("passes the contract price through and leaves it null otherwise", () => {
    const item = buildItem(
      "LB13OT00128",
      [
        { ...row({ ซัพพลายเออร์: "มีสัญญา", benchmark_price: 1500 }), contract_price: 1200, contract_effective_start: "2026-01", contract_effective_end: null },
        row({ ซัพพลายเออร์: "ไม่มีสัญญา", benchmark_price: 1600 }),
      ],
      "snapshot",
      { now }
    )
    const [withContract, without] = item.suppliers!
    expect(withContract.contract_price).toBe(1200)
    expect(withContract.contract_effective_end).toBeNull()
    expect(without.contract_price).toBeNull()
  })

  it("omits raw price points unless asked", () => {
    const rows = [row({ ซัพพลายเออร์: "A", benchmark_price: 900 })]
    expect(buildItem("X", rows, "snapshot", { now }).suppliers![0].prices).toBeUndefined()
    expect(buildItem("X", rows, "snapshot", { now, includePrices: true }).suppliers![0].prices).toHaveLength(1)
  })

  it("marks a long-window result as a fallback", () => {
    const rows = [row({ ซัพพลายเออร์: "A", benchmark_price: 900, window_start: "2023-01" })]
    const item = buildItem("X", rows, "fallback", { now })
    expect(item.source).toBe("fallback")
    expect(item.window!.months).toBe(45)
    expect(item.recommendation!.window_months).toBe(45)
  })
})

describe("BatchRequestSchema", () => {
  it("defaults include_prices to false", () => {
    expect(BatchRequestSchema.parse({ codes: ["A"] }).include_prices).toBe(false)
  })

  it("rejects an empty code list", () => {
    expect(BatchRequestSchema.safeParse({ codes: [] }).success).toBe(false)
  })

  it(`rejects more than ${MAX_CODES} codes`, () => {
    const codes = Array.from({ length: MAX_CODES + 1 }, (_, i) => `C${i}`)
    expect(BatchRequestSchema.safeParse({ codes }).success).toBe(false)
  })

  it("rejects a malformed month", () => {
    expect(BatchRequestSchema.safeParse({ codes: ["A"], month: "2026-9" }).success).toBe(false)
    expect(BatchRequestSchema.safeParse({ codes: ["A"], month: "2026-09" }).success).toBe(true)
  })
})
