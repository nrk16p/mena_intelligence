import { describe, expect, it } from "vitest"
import { checkPr, checkPrFleet, docKind, fleetBudgetFor, fleetLabel, hasFleetTotals, itemCategory, isStockPlate, normPlate, remarkLine, type PrDoc, type Snapshot } from "./budget-check"

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  month: "2026-11",
  cut: "2026-11-25",
  computed_at: "2026-11-25T03:25:00.000Z",
  sources: { pr_at: "2026-11-25T03:15:00.000Z" },
  rows: [
    { group: "ML|บริษัท", category: "ซ่อม", budget: 1_000_000, wd: 550_000, pr_approved: 700_000, pr_pending: 0 },
    { group: "ML|บริษัท", category: "ยาง", budget: 200_000, wd: 50_000, pr_approved: 20_000, pr_pending: 0 },
    { group: "ML|ร่วม", category: "ซ่อม", budget: 0, wd: 10_000, pr_approved: 0, pr_pending: 0 },
  ],
  pending_prs: [],
  by_plate: [{ plate: "สบ.71-2876", group: "ML|บริษัท" }],
  ...over,
})
const pr = (over: Partial<PrDoc> = {}): PrDoc => ({
  code: "LBPR26110482",
  date: "2026-11-25",
  department: "ลาดกระบัง : ยานยนต์ (ศลบ)",
  plate: "สบ.71-2876",
  total: 45_000,
  requester: "someone",
  note: "",
  approved: false,
  levelsDone: 1,
  items: [{ group: "ระบบเกียร์", total: 45_000 }],
  ...over,
})

describe("remarkLine", () => {
  it("matches the agreed format exactly", () => {
    expect(remarkLine("2026-11", "2026-11-25", "ML", "ซ่อม", 1_234_567, 45_000)).toBe(
      "งบ 11/69 ML ซ่อม (01/11/69–25/11/69) | คงเหลือ 1,234,567 | PR นี้ 45,000 | หลังอนุมัติเหลือ 1,189,567",
    )
  })
  it("adds the over-budget warning", () => {
    expect(remarkLine("2026-11", "2026-11-25", "ML", "ซ่อม", 300_000, 350_000)).toBe(
      "งบ 11/69 ML ซ่อม (01/11/69–25/11/69) | คงเหลือ 300,000 | PR นี้ 350,000 | หลังอนุมัติเหลือ -50,000 | เกินงบ 50,000 ต้องขออนุมัติเพิ่ม",
    )
  })
})

describe("docKind", () => {
  it("reads PR and WD codes, trimming and upper-casing", () => {
    expect(docKind(" lbpr26110482 ")).toEqual({ kind: "PR", code: "LBPR26110482" })
    expect(docKind("LBWD26111980")).toEqual({ kind: "WD", code: "LBWD26111980" })
    expect(docKind("SBPR26110517")).toEqual({ kind: "PR", code: "SBPR26110517" })
  })
  it("rejects anything else", () => {
    for (const bad of ["", "LBPR2611048", "LBPO26110482", "LBPR26110482;", "../x", "LBPR26110482 x"]) expect(docKind(bad)).toBeNull()
  })
})

describe("category and plate rules (same as the budget-control job)", () => {
  it("itemCategory", () => {
    expect(itemCategory("ยางรถยนต์")).toBe("ยาง")
    expect(itemCategory("งานบำรุงรักษา")).toBe("PM")
    expect(itemCategory("ระบบเกียร์")).toBe("ซ่อม")
    expect(itemCategory(null)).toBe("ซ่อม")
  })
  it("plates", () => {
    expect(normPlate(" สบ. 71-2876 ")).toBe("สบ.71-2876")
    expect(isStockPlate("")).toBe(true)
    expect(isStockPlate("None")).toBe(true)
    expect(isStockPlate("สบ.00000")).toBe(true)
    expect(isStockPlate("สบ.71-2876")).toBe(false)
  })
})

describe("checkPr", () => {
  it("fits: 300,000 left, PR 45,000 leaves 255,000", () => {
    const r = checkPr(pr(), snap(), null)
    expect(r.notice).toBeNull()
    expect(r.group).toBe("ML|บริษัท")
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toMatchObject({ category: "ซ่อม", amount: 45_000, budget: 1_000_000, used: 700_000, before: 300_000, after: 255_000, othersPending: 0, state: "ok" })
    expect(r.lines[0].remark).toBe("งบ 11/69 ML ซ่อม (01/11/69–25/11/69) | คงเหลือ 300,000 | PR นี้ 45,000 | หลังอนุมัติเหลือ 255,000")
    expect(r.otherLeg).toEqual([{ category: "ซ่อม", before: 450_000 }])
  })
  it("over: PR 350,000 goes over by 50,000", () => {
    const r = checkPr(pr({ total: 350_000, items: [{ group: "ระบบเกียร์", total: 350_000 }] }), snap(), null)
    expect(r.lines[0]).toMatchObject({ after: -50_000, state: "over" })
    expect(r.lines[0].remark).toContain("| เกินงบ 50,000 ต้องขออนุมัติเพิ่ม")
  })
  it("fits alone but other pending PRs in the same budget would push it over", () => {
    const s = snap({ rows: [{ group: "ML|บริษัท", category: "ซ่อม", budget: 1_000_000, wd: 0, pr_approved: 700_000, pr_pending: 350_000 }] })
    const r = checkPr(pr(), s, null)
    expect(r.lines[0]).toMatchObject({ after: 255_000, othersPending: 350_000, state: "ok_pending_over" })
  })
  it("does not count this PR as one of the others when the snapshot already lists it", () => {
    const s = snap({
      rows: [{ group: "ML|บริษัท", category: "ซ่อม", budget: 1_000_000, wd: 0, pr_approved: 700_000, pr_pending: 45_000 }],
      pending_prs: [{ code: "LBPR26110482", split: { ซ่อม: 45_000 } }],
    })
    expect(checkPr(pr(), s, null).lines[0]).toMatchObject({ othersPending: 0, state: "ok" })
  })
  it("one line per category, fuel left out", () => {
    const r = checkPr(pr({ total: 70_000, items: [{ group: "ระบบเกียร์", total: 40_000 }, { group: "ยางรถยนต์", total: 20_000 }, { group: "น้ำมันเชื้อเพลิง", total: 10_000 }] }), snap(), null)
    expect(r.lines.map((l) => [l.category, l.amount])).toEqual([["ซ่อม", 40_000], ["ยาง", 20_000]])
  })
  it("no item table: whole PR counts as ซ่อม, like the job", () => {
    expect(checkPr(pr({ items: [] }), snap(), null).lines[0]).toMatchObject({ category: "ซ่อม", amount: 45_000 })
  })
  it("falls back to fleet_plate_map when the plate has no activity this month", () => {
    const r = checkPr(pr({ plate: "สบ.72-0001" }), snap(), { fleet: "ML", owner: "บริษัท" })
    expect(r.group).toBe("ML|บริษัท")
    expect(r.lines).toHaveLength(1)
  })
  it("notices instead of numbers", () => {
    expect(checkPr(pr({ approved: true }), snap(), null).notice?.code).toBe("approved")
    expect(checkPr(pr({ department: "สระบุรี : ยานยนต์ (สสบ)" }), snap(), null).notice?.code).toBe("other_dept")
    expect(checkPr(pr({ plate: "" }), snap(), null).notice?.code).toBe("no_plate")
    expect(checkPr(pr({ plate: "สบ.00000" }), snap(), null).notice?.code).toBe("no_plate")
    expect(checkPr(pr({ items: [{ group: "น้ำมันเชื้อเพลิง", total: 45_000 }] }), snap(), null).notice?.code).toBe("not_budget")
    expect(checkPr(pr(), null, null).notice?.code).toBe("no_snapshot")
    expect(checkPr(pr({ plate: "สบ.72-0001" }), snap(), null).notice?.code).toBe("unknown_plate")
    expect(checkPr(pr({ plate: "สบ.72-0002" }), snap({ by_plate: [{ plate: "สบ.72-0002", group: "อื่น" }] }), null).notice?.code).toBe("unknown_plate")
    expect(checkPr(pr({ plate: "สบ.72-0001" }), snap(), { fleet: "ML", owner: "ร่วม" }).notice?.code).toBe("partner")
    const noRow = checkPr(pr({ items: [{ group: "งานบำรุงรักษา", total: 45_000 }] }), snap(), null)
    expect(noRow.notice?.code).toBe("no_budget_row")
    expect(noRow.lines).toHaveLength(0)
  })
  it("every notice and line stays empty of numbers it cannot back", () => {
    const r = checkPr(pr({ approved: true }), snap(), null)
    expect(r.lines).toEqual([])
  })
})

describe("per fleet", () => {
  it("fleetLabel: Asia → Asia ML, keeps names that already say ML/MS", () => {
    expect(fleetLabel("Asia", "ML")).toBe("Asia ML")
    expect(fleetLabel("Fast", "ML")).toBe("Fast ML")
    expect(fleetLabel("อื่น ๆ", "ML")).toBe("อื่น ๆ ML")
    expect(fleetLabel("Scco ML", "ML")).toBe("Scco ML")
    expect(fleetLabel("Asia MS", "MS")).toBe("Asia MS")
  })
  const file = {
    year: 2026,
    groups: [{ id: "ML", trucks: 200, repair: Array(12).fill(1_000_000), pm: Array(12).fill(100_000), tyre: Array(12).fill(400_000),
      fleets: [{ fleet: "Asia", trucks: 100, repair_share: 0.3 }, { fleet: "Scco ML", trucks: 97, repair_share: 0.68 }, { fleet: "อื่น ๆ", trucks: 3, repair_share: 0.02 }] }],
  }
  it("fleetBudgetFor: repair by age share, PM and tyre by truck count; other ML fleets fall in อื่น ๆ", () => {
    expect(fleetBudgetFor(file, "ML", "Asia", "2026-11")).toEqual({ ซ่อม: 300_000, PM: 50_000, ยาง: 200_000 })
    expect(fleetBudgetFor(file, "ML", "Acon", "2026-11")?.ซ่อม).toBeCloseTo(20_000)
    expect(fleetBudgetFor(file, "ML", "Fast", "2026-11")).toBeNull()
    expect(fleetBudgetFor(file, "ML", "Asia", "2027-01")).toBeNull()
  })
  it("checkPrFleet: fleet used = PR approved on that fleet's plates; pending PRs of the fleet counted apart", () => {
    const plates = new Set(["สบ.71-2876", "สบ.71-0002"])
    const s = {
      by_plate: [
        { plate: "สบ.71-2876", group: "ML|บริษัท", pr_approved_cat: { ซ่อม: 200_000 } },
        { plate: "สบ.71-0002", group: "ML|บริษัท", pr_approved_cat: { ซ่อม: 50_000, ยาง: 10_000 } },
        { plate: "สบ.79-9999", group: "ML|บริษัท", pr_approved_cat: { ซ่อม: 999_000 } },
      ],
      pending_prs: [],
    }
    const pending = [{ code: "X1", plate: "สบ.71-0002", split: { ซ่อม: 40_000 } }, { code: "LBPR26110482", plate: "สบ.71-2876", split: { ซ่อม: 45_000 } }]
    const lines = checkPrFleet(pr(), "Asia ML", { ซ่อม: 300_000 }, plates, s, pending)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ budget: 300_000, used: 250_000, before: 50_000, after: 5_000, othersPending: 40_000, state: "ok_pending_over" })
    expect(lines[0].remark).toBe("งบ 11/69 Asia ML ซ่อม (01/11/69–25/11/69) | คงเหลือ 50,000 | PR นี้ 45,000 | หลังอนุมัติเหลือ 5,000")
  })
})

describe("review fixes", () => {
  it("rounds satang before comparing, so a tiny overrun never reads -0", () => {
    const r = checkPr(pr({ total: 300_000.4, items: [{ group: "ระบบเกียร์", total: 300_000.4 }] }), snap(), null)
    expect(r.lines[0]).toMatchObject({ amount: 300_000, after: 0, state: "ok" })
    expect(r.lines[0].remark).not.toContain("-0")
  })
  it("hasFleetTotals is false for a snapshot written before per-plate totals existed", () => {
    expect(hasFleetTotals({ by_plate: [{ plate: "a", group: "ML|บริษัท" }] })).toBe(false)
    expect(hasFleetTotals({ by_plate: [{ plate: "a", group: "ML|บริษัท", pr_approved_cat: {} }] })).toBe(true)
  })
})
