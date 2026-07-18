import { describe, it, expect } from "vitest"
import { buildPlateMapQuery } from "./plate-map-query"

const EXCLUDED = ["C001-01-01", "F001-01-01"]

describe("buildPlateMapQuery", () => {
  it("filters months with an IN (...) clause, not a lexicographic range", () => {
    const { sql } = buildPlateMapQuery(["01-26", "02-26"], EXCLUDED)
    expect(sql).toContain("IN (")
  })

  it("never regresses to a month_year >= / <= range comparison (regression guard)", () => {
    // month_year is "MM-YY" text. A >=/<= range sorts lexicographically by
    // month before year, so 01-26..07-26 would also match 02-25, 03-25, etc.
    // If a future edit reintroduces that comparison, this test must fail.
    const { sql } = buildPlateMapQuery(["01-26", "02-26", "07-26"], EXCLUDED)
    expect(sql).not.toContain("month_year >=")
    expect(sql).not.toContain("month_year <=")
  })

  it("produces exactly as many placeholders as params", () => {
    const months = ["01-26", "02-26", "03-26"]
    const { sql, params } = buildPlateMapQuery(months, EXCLUDED)
    const placeholderCount = (sql.match(/\?/g) || []).length
    expect(placeholderCount).toBe(params.length)
  })

  it("orders params as excluded plates first, then months, matching placeholder position", () => {
    const months = ["01-26", "02-26"]
    const { params } = buildPlateMapQuery(months, EXCLUDED)
    expect(params).toEqual([...EXCLUDED, ...months])
  })

  it("orders the excluded-plates IN clause ahead of the month IN clause in the SQL text", () => {
    const { sql } = buildPlateMapQuery(["01-26"], EXCLUDED)
    const excludedIdx = sql.indexOf("license_plate NOT IN")
    const monthIdx = sql.indexOf("month_year IN")
    expect(excludedIdx).toBeGreaterThan(-1)
    expect(monthIdx).toBeGreaterThan(-1)
    expect(excludedIdx).toBeLessThan(monthIdx)
  })

  it("throws on an empty months array instead of emitting invalid SQL (IN ())", () => {
    // The route already returns 400 before calling this (monthsBetween([]) is
    // checked upstream), so this helper's contract is: never accept [].
    expect(() => buildPlateMapQuery([], EXCLUDED)).toThrow()
  })

  it("scales placeholder and param count with the number of months given", () => {
    const months = ["01-26", "02-26", "03-26", "04-26", "05-26"]
    const { sql, params } = buildPlateMapQuery(months, EXCLUDED)
    const monthPlaceholders = sql.split("month_year IN (")[1].split(")")[0].split(",")
    expect(monthPlaceholders).toHaveLength(months.length)
    expect(params).toHaveLength(EXCLUDED.length + months.length)
  })
})
