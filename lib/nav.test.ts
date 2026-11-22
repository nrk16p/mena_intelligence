import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { ALL_PAGES, NAV_SECTIONS, PAGE_TYPES, findActive, searchPages, visibleSections } from "./nav"

const APP = path.resolve(__dirname, "../app")

/** The nearest layout.tsx above a route, and the permission group it checks (if any). */
function layoutGroup(href: string): string | null {
  let dir = path.join(APP, href)
  while (dir.startsWith(APP) && dir !== APP) {
    const f = path.join(dir, "layout.tsx")
    if (fs.existsSync(f)) {
      const m = fs.readFileSync(f, "utf8").match(/includes\("([a-z]+)"\)/)
      if (m) return m[1]
    }
    dir = path.dirname(dir)
  }
  return null
}

describe("nav config", () => {
  it("every page exists and appears once", () => {
    const hrefs = ALL_PAGES.map((p) => p.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const h of hrefs) expect(fs.existsSync(path.join(APP, h, "page.tsx")), h).toBe(true)
  })

  it("covers every page the old menu had (32 reports + 2 admin) plus ควบคุมงบประมาณ", () => {
    expect(ALL_PAGES.length).toBe(35)
  })

  it("each page's perm matches the group its layout checks", () => {
    for (const p of ALL_PAGES) {
      const g = layoutGroup(p.href)
      if (g) expect(p.perm, p.href).toBe(g)
    }
  })

  it("names start with the word for their type", () => {
    const start: Record<string, RegExp> = {
      ติดตาม: /^(ภาพรวม|ควบคุม)/, KPI: /^KPI /, สาเหตุ: /^(วิเคราะห์|รายงาน)/, ค้นหา: /^ค้นหา/,
      เครื่องมือ: /^(บันทึก|ปันส่วน|คำนวณ|ตั้งค่า)/,
    }
    for (const p of ALL_PAGES) {
      expect(PAGE_TYPES).toContain(p.type)
      expect(p.label, p.href).toMatch(start[p.type])
    }
  })
})

describe("visibleSections", () => {
  it("keeps only allowed pages and drops empty sections", () => {
    const s = visibleSections(["procurement"])
    expect(s.map((x) => x.key)).toEqual(["purchasing", "store"])
    expect(s.flatMap((x) => x.pages).every((p) => p.perm === "procurement")).toBe(true)
  })
  it("gives nothing without groups", () => {
    expect(visibleSections([])).toEqual([])
  })
  it("mixes pages from several groups inside one department", () => {
    const d = visibleSections(["gps"]).find((x) => x.key === "delivery")
    expect(d?.pages.map((p) => p.href)).toEqual(["/gps/distance"])
  })
})

describe("findActive", () => {
  it("matches sub-paths but not prefixes of other names", () => {
    expect(findActive("/pm-cost")?.page.href).toBe("/pm-cost")
    expect(findActive("/pm-cost-main")?.page.href).toBe("/pm-cost-main")
    expect(findActive("/repair-daily/vs/123")?.page.href).toBe("/repair-daily/vs")
    expect(findActive("/")).toBeNull()
  })
})

describe("searchPages", () => {
  it("finds by Thai name, old English name and path", () => {
    expect(searchPages("ซ่อมซ้ำ", ALL_PAGES)[0].href).toBe("/repeat-repair")
    expect(searchPages("cost monitor", ALL_PAGES)[0].href).toBe("/cost")
    expect(searchPages("gps", ALL_PAGES)[0].href).toBe("/gps/distance")
  })
  it("puts names that start with the word first", () => {
    expect(searchPages("KPI", ALL_PAGES).slice(0, 4).every((p) => p.label.startsWith("KPI"))).toBe(true)
  })
  it("empty query returns everything given", () => {
    expect(searchPages("  ", ALL_PAGES).length).toBe(ALL_PAGES.length)
  })
  it("sections are not empty", () => {
    for (const s of NAV_SECTIONS) expect(s.pages.length).toBeGreaterThan(0)
  })
})
