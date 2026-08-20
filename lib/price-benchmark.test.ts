import { describe, it, expect, vi } from "vitest"

// lib/mongo throws at import without MONGO_URI — mock before importing the module under test
vi.mock("@/lib/mongo", () => ({ default: new Promise(() => {}) }))

import { receiptMatch } from "./price-benchmark"

describe("receiptMatch", () => {
  it("excludes zero-price receipts (ราคาทุน must be > 0)", () => {
    expect(receiptMatch()["ราคาทุน"]).toEqual({ $gt: 0 })
  })

  it("keeps the base receipt conditions", () => {
    const m = receiptMatch()
    expect(m["รับ"]).toEqual({ $gt: 0 })
    expect(m["WD"]).toEqual({ $in: [null, ""] })
    expect(m["รหัสสินค้า"]).toEqual({ $exists: true, $nin: [null, ""] })
  })

  it("merges extra conditions without losing the price guard", () => {
    const m = receiptMatch({ year_month: "2026-08" })
    expect(m["year_month"]).toBe("2026-08")
    expect(m["ราคาทุน"]).toEqual({ $gt: 0 })
  })
})

import { buildBenchmarkDocs, monthRange, shiftMonth, windowFor } from "./price-benchmark"

describe("shiftMonth", () => {
  it("moves forward and backward across year boundaries", () => {
    expect(shiftMonth("2026-08", -1)).toBe("2026-07")
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2025-12", 1)).toBe("2026-01")
    expect(shiftMonth("2026-08", -11)).toBe("2025-09")
    expect(shiftMonth("2026-08", -43)).toBe("2023-01")
  })
})

describe("windowFor", () => {
  it("defaults to the 12-month rolling window (unchanged behaviour)", () => {
    expect(windowFor("2026-08")).toEqual({ start: "2025-09", end: "2026-08" })
  })

  it("accepts a wider window", () => {
    expect(windowFor("2026-08", 24)).toEqual({ start: "2024-09", end: "2026-08" })
    expect(windowFor("2026-08", 1)).toEqual({ start: "2026-08", end: "2026-08" })
  })
})

describe("monthRange", () => {
  it("lists every month inclusive", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"])
  })

  it("returns a single month when start === end", () => {
    expect(monthRange("2026-08", "2026-08")).toEqual(["2026-08"])
  })

  it("returns empty when start is after end", () => {
    expect(monthRange("2026-08", "2026-07")).toEqual([])
  })

  it("covers the full 44-month history without blowing the guard", () => {
    expect(monthRange("2023-01", "2026-08")).toHaveLength(44)
  })
})

describe("buildBenchmarkDocs", () => {
  const row = (prices: [number, number][], extra: Record<string, unknown> = {}) => ({
    _id: { p: "P1", s: "S1" },
    ชื่อสินค้า: "ของ", กลุ่มสินค้า: "อะไหล่",
    total_qty: 10, total_cost: 1000,
    first_date: "2023-02", last_date: "2026-08",
    prices: prices.map(([price, count]) => ({ price, count, qty: count, cost: price * count })),
    ...extra,
  })

  it("picks the most frequent price as ราคากลาง", () => {
    const [d] = buildBenchmarkDocs([row([[100, 1], [120, 5], [150, 2]])], "2026-08", "2023-01", "2026-08")
    expect(d.benchmark_price).toBe(120)
    expect(d.benchmark_count).toBe(5)
    expect(d.total_records).toBe(8)
  })

  it("breaks a count tie with the lower price", () => {
    const [d] = buildBenchmarkDocs([row([[100, 3], [200, 3]])], "2026-08", "2023-01", "2026-08")
    expect(d.benchmark_price).toBe(100)
  })

  it("stamps the window it was computed over", () => {
    const [d] = buildBenchmarkDocs([row([[100, 1]])], "2026-08", "2023-01", "2026-08")
    expect(d.window_start).toBe("2023-01")
    expect(d.window_end).toBe("2026-08")
    expect(d.snapshot_month).toBe("2026-08")
  })

  it("drops null/non-finite prices and skips a pair with no usable price", () => {
    const withNull = row([[100, 2]])
    withNull.prices.push({ price: null as unknown as number, count: 9, qty: 9, cost: 0 })
    const [d] = buildBenchmarkDocs([withNull], "2026-08", "2023-01", "2026-08")
    expect(d.benchmark_price).toBe(100)
    expect(d.total_records).toBe(2)

    const allNull = row([])
    allNull.prices = [{ price: null as unknown as number, count: 1, qty: 1, cost: 0 }]
    expect(buildBenchmarkDocs([allNull], "2026-08", "2023-01", "2026-08")).toHaveLength(0)
  })

  it("flags IQR outliers and trims min/max, keeping raw min/max intact", () => {
    const [d] = buildBenchmarkDocs(
      [row([[100, 5], [105, 5], [110, 5], [9000, 1]])],
      "2026-08", "2023-01", "2026-08"
    )
    expect(d.min_price).toBe(100)
    expect(d.max_price).toBe(9000)
    expect(d.max_price_trimmed).toBe(110)
    expect(d.prices.find(p => p.price === 9000)?.outlier).toBe(true)
    expect(d.prices.find(p => p.price === 100)?.outlier).toBe(false)
  })
})
