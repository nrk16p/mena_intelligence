import { describe, it, expect } from "vitest"
import {
  FLEET_MAP, FLEET_ORDER, FLEET_COLORS, UNKNOWN_FLEET,
  BUCKET_OFFICE, BUCKET_PARTNER, BUCKET_NEW, BUCKET_UNKNOWN,
  fleetLabel, fleetKey, monthsBetween, ymToMonthKey, monthKeyToYm, allocateOffice,
} from "./fleets"

describe("fleet constants", () => {
  it("maps all eight fleet ids to names", () => {
    expect(FLEET_MAP["1"]).toBe("ML")
    expect(FLEET_MAP["8"]).toBe("KN")
    expect(Object.keys(FLEET_MAP)).toHaveLength(8)
  })

  it("orders fleets 1..8 and gives every one a colour", () => {
    expect(FLEET_ORDER).toEqual(["1","2","3","4","5","6","7","8"])
    FLEET_ORDER.forEach((id) => expect(FLEET_COLORS[id]).toMatch(/^#[0-9a-f]{6}$/i))
  })
})

describe("fleetLabel", () => {
  it("returns the fleet name for a known id", () => {
    expect(fleetLabel("3")).toBe("TDM")
  })

  it("returns ไม่ระบุ for the unknown sentinel", () => {
    expect(fleetLabel(UNKNOWN_FLEET)).toBe("ไม่ระบุ")
  })

  it("returns ไม่ระบุ for an id that is not in the map", () => {
    expect(fleetLabel("99")).toBe("ไม่ระบุ")
  })

  it("labels the office bucket", () => {
    expect(fleetLabel(BUCKET_OFFICE)).toBe("สำนักงาน")
  })

  it("labels the partner bucket", () => {
    expect(fleetLabel(BUCKET_PARTNER)).toBe("รถร่วม")
  })

  it("labels the newly-acquired-truck bucket", () => {
    expect(fleetLabel(BUCKET_NEW)).toBe("รถใหม่ (ยังไม่เข้าระบบ ops)")
  })

  it("labels the unknown bucket", () => {
    expect(fleetLabel(BUCKET_UNKNOWN)).toBe("ไม่ระบุ")
  })
})

describe("bucket constants", () => {
  it("keeps UNKNOWN_FLEET and BUCKET_UNKNOWN as one and the same value", () => {
    // Deliberately a single constant with a back-compat alias — two competing
    // constants sharing the value "unknown" would drift apart silently.
    expect(BUCKET_UNKNOWN).toBe("unknown")
    expect(UNKNOWN_FLEET).toBe(BUCKET_UNKNOWN)
  })

  it("gives every bucket a value distinct from the numeric fleet ids", () => {
    const buckets = [BUCKET_OFFICE, BUCKET_PARTNER, BUCKET_NEW, BUCKET_UNKNOWN]
    expect(new Set(buckets).size).toBe(4)
    buckets.forEach((b) => expect(FLEET_ORDER).not.toContain(b))
  })
})

describe("fleetKey", () => {
  it("strips whitespace from the plate and joins with the month", () => {
    expect(fleetKey("70 1234", "01-26")).toBe("701234|01-26")
  })

  it("is stable regardless of surrounding whitespace", () => {
    expect(fleetKey("  70-1234 ", "12-25")).toBe("70-1234|12-25")
  })
})

describe("monthsBetween", () => {
  it("returns every month in a same-year span, inclusive", () => {
    expect(monthsBetween("01-26", "04-26")).toEqual(["01-26", "02-26", "03-26", "04-26"])
  })

  it("returns every month across a year boundary, inclusive", () => {
    expect(monthsBetween("11-25", "02-26")).toEqual(["11-25", "12-25", "01-26", "02-26"])
  })

  it("returns a single month when start equals end", () => {
    expect(monthsBetween("07-26", "07-26")).toEqual(["07-26"])
  })

  it("returns an empty array when start is after end", () => {
    expect(monthsBetween("07-26", "01-26")).toEqual([])
  })

  it("returns an empty array when the span exceeds 120 months", () => {
    expect(monthsBetween("01-00", "02-11")).toEqual([])
  })

  it("does not leak lexicographically-matching months from other years (regression)", () => {
    // month_year is "MM-YY"; a naive string range 01-26..07-26 also lexically
    // matches e.g. 02-25 (month "02" falls between "01" and "07"). The exact
    // month list must never include months from the wrong year.
    const months = monthsBetween("01-26", "07-26")
    expect(months).not.toContain("02-25")
    expect(months).toEqual(["01-26", "02-26", "03-26", "04-26", "05-26", "06-26", "07-26"])
  })
})

describe("ymToMonthKey / monthKeyToYm", () => {
  it("converts YYYY-MM to MM-YY", () => {
    expect(ymToMonthKey("2026-01")).toBe("01-26")
    expect(ymToMonthKey("2025-12")).toBe("12-25")
    expect(ymToMonthKey("2026-07")).toBe("07-26")
  })

  it("converts MM-YY back to YYYY-MM", () => {
    expect(monthKeyToYm("01-26")).toBe("2026-01")
    expect(monthKeyToYm("12-25")).toBe("2025-12")
  })

  it("round-trips every month of a year in both directions", () => {
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0")
      const ym = `2026-${mm}`
      expect(monthKeyToYm(ymToMonthKey(ym))).toBe(ym)
      const key = `${mm}-26`
      expect(ymToMonthKey(monthKeyToYm(key))).toBe(key)
    }
  })

  it("handles the January and December boundaries without year drift", () => {
    expect(ymToMonthKey("2025-01")).toBe("01-25")
    expect(ymToMonthKey("2025-12")).toBe("12-25")
    expect(monthKeyToYm("01-25")).toBe("2025-01")
    expect(monthKeyToYm("12-25")).toBe("2025-12")
  })

  it("matches the toBdKey convention used by cost-report", () => {
    const toBdKey = (ym: string) => `${ym.split("-")[1]}-${ym.split("-")[0].slice(2)}`
    for (const ym of ["2024-01", "2025-06", "2026-12"]) {
      expect(ymToMonthKey(ym)).toBe(toBdKey(ym))
    }
  })

  it("returns null-ish empty string for malformed input", () => {
    expect(ymToMonthKey("")).toBe("")
    expect(ymToMonthKey("2026")).toBe("")
    expect(monthKeyToYm("nope")).toBe("")
  })

  it("builds bridge-compatible keys from a YYYY-MM month", () => {
    expect(fleetKey("70-1234", ymToMonthKey("2026-03"))).toBe(fleetKey("70-1234", "03-26"))
  })
})

describe("allocateOffice", () => {
  it("splits cost proportionally to truck counts", () => {
    expect(allocateOffice(1000, { "1": 60, "2": 40 })).toEqual({ "1": 600, "2": 400 })
  })

  it("returns {} when there are no trucks at all", () => {
    expect(allocateOffice(1000, {})).toEqual({})
    expect(allocateOffice(1000, { "1": 0, "2": 0 })).toEqual({})
  })

  it("handles zero cost without dividing by nothing", () => {
    expect(allocateOffice(0, { "1": 60 })).toEqual({ "1": 0 })
  })

  it("loses no baht on a non-terminating split", () => {
    const out = allocateOffice(100, { "1": 1, "2": 1, "3": 1 })
    const sum = Object.values(out).reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(100, 10)
  })
})
