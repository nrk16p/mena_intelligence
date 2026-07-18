import { describe, it, expect } from "vitest"
import {
  FLEET_MAP, FLEET_ORDER, FLEET_COLORS, UNKNOWN_FLEET,
  BUCKET_OFFICE, BUCKET_PARTNER, BUCKET_NEW, BUCKET_UNKNOWN,
  fleetLabel, fleetKey, monthsBetween,
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
