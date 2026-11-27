import { describe, expect, it } from "vitest"
import { completeThrough, vendorHealth } from "./gps-distance"

const MAX = "2026-11-26"

describe("vendorHealth", () => {
  const health = vendorHealth(
    [
      { source: "songdee", firstDate: "2026-01-01", lastDate: "2026-11-26", lastNonZero: "2026-11-26" },
      { source: "terminus", firstDate: "2026-01-01", lastDate: "2026-11-25", lastNonZero: "2026-11-25" },
      { source: "besttech", firstDate: "2026-05-26", lastDate: "2026-11-01", lastNonZero: "2026-11-01" },
      { source: "nostra", firstDate: "2026-01-01", lastDate: "2026-11-15", lastNonZero: "2026-10-08" },
      { source: "dtc", firstDate: "2026-01-01", lastDate: "2026-11-26", lastNonZero: "2026-11-24" },
    ],
    MAX
  )
  const by = Object.fromEntries(health.map((h) => [h.source, h]))

  it("a feed one or two days behind is normal, not stale", () => {
    expect(by.terminus.status).toBe("ok")
    expect(by.terminus.lagDays).toBe(1)
  })

  it("flags a feed that stopped sending", () => {
    expect(by.besttech.status).toBe("stale")
    expect(by.besttech.lagDays).toBe(25)
  })

  it("stale wins over zero; zero days are counted from the last real reading", () => {
    expect(by.nostra.status).toBe("stale")
    expect(by.nostra.zeroDays).toBe(38)
  })

  it("a couple of quiet days is not an all-zero feed", () => {
    expect(by.dtc.status).toBe("ok")
  })

  it("flags a live feed whose readings are all zero", () => {
    const [h] = vendorHealth(
      [{ source: "dtc", firstDate: "2026-01-01", lastDate: MAX, lastNonZero: "2026-11-10" }],
      MAX
    )
    expect(h.status).toBe("zero")
  })

  it("a cancelled vendor is retired, never stale, and does not hold the window back", () => {
    const [h] = vendorHealth(
      [{ source: "hino", firstDate: "2026-01-01", lastDate: "2026-11-15", lastNonZero: "2026-10-08" }],
      MAX
    )
    expect(h.status).toBe("retired")
    expect(completeThrough([h, by.songdee], MAX)).toBe(MAX)
  })

  it("completeThrough ignores stalled feeds", () => {
    expect(completeThrough(health, MAX)).toBe("2026-11-25")
  })

  it("completeThrough falls back to maxDate when every feed is stale", () => {
    expect(completeThrough([by.besttech], MAX)).toBe(MAX)
  })
})
