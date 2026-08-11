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
