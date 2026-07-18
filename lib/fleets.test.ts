import { describe, it, expect } from "vitest"
import { FLEET_MAP, FLEET_ORDER, FLEET_COLORS, UNKNOWN_FLEET, fleetLabel, fleetKey } from "./fleets"

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
})

describe("fleetKey", () => {
  it("strips whitespace from the plate and joins with the month", () => {
    expect(fleetKey("70 1234", "01-26")).toBe("701234|01-26")
  })

  it("is stable regardless of surrounding whitespace", () => {
    expect(fleetKey("  70-1234 ", "12-25")).toBe("70-1234|12-25")
  })
})
