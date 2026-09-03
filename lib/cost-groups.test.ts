import { describe, expect, it } from "vitest"
import { COST_GROUP_MAP, getCostGroup } from "./cost-groups"

const CM = "CM - Corrective Maintenance"
const PM = "PM - Preventive Maintenance"
const T = "T - Tire"
const AC = "AC - Accident Repair"
const TOOLS = "Tools & Equipment"

describe("getCostGroup", () => {
  it("keeps the pre-ส.ค.-2026 names working", () => {
    expect(getCostGroup("ซ่อม")).toBe(CM)
    expect(getCostGroup("อะไหล่/วัสดุสิ้นเปลือง")).toBe(CM)
    expect(getCostGroup("ยาง")).toBe(T)
    expect(getCostGroup("ซ่อมเคสอุบัติเหตุ")).toBe(AC)
    expect(getCostGroup("PM น้ำมันเครื่อง")).toBe(PM)
    expect(getCostGroup("เบิกประจำตัวช่าง")).toBe(TOOLS)
  })

  // The source data really does carry both spellings; dropping the double-เเ
  // variant is what put "PM ความเเย็น" into Other on two of the four pages.
  it("accepts the double-เเ typo that exists in the source data", () => {
    expect(getCostGroup("PM ความเย็น")).toBe(PM)
    expect(getCostGroup("PM ความเเย็น")).toBe(PM)
  })

  it("maps the ส.ค.-2026 prefixed names to the same groups", () => {
    expect(getCostGroup("CM-งานซ่อม")).toBe(CM)
    expect(getCostGroup("CM-งานซ่อมรถร่วม")).toBe(CM)
    expect(getCostGroup("CM-งานซ่อมร่วมภายนอก")).toBe(CM)
    expect(getCostGroup("PM-บำรุงรักษา")).toBe(PM)
    expect(getCostGroup("PM-บำรุงรักษารถร่วม")).toBe(PM)
    expect(getCostGroup("PM-บำรุงรักษาร่วมภายนอก")).toBe(PM)
    expect(getCostGroup("T-ยาง")).toBe(T)
    expect(getCostGroup("T-ยางรถร่วม")).toBe(T)
    expect(getCostGroup("T-ยางรถร่วมภายนอก")).toBe(T)
    expect(getCostGroup("AC-เคสอุบัติเหตุ")).toBe(AC)
    expect(getCostGroup("AC-เคสอุบัติเหตุรถร่วม")).toBe(AC)
    expect(getCostGroup("AC-เคสอุบัติเหตุรถร่วมภายนอก")).toBe(AC)
  })

  // The whole point of the rename fix: the same economic cost has to land in the
  // same group whichever name ATMS wrote it under, or YoY breaks at the seam.
  it("puts each old name and its new equivalent in one group", () => {
    for (const [oldName, newName] of [
      ["ซ่อม", "CM-งานซ่อม"],
      ["ค่าซ่อม/ค่าอะไหล่รถร่วม", "CM-งานซ่อมรถร่วม"],
      ["ค่าซ่อม/ค่าอะไหล่รถร่วมภายนอก(พจน.)", "CM-งานซ่อมร่วมภายนอก"],
      ["ยาง", "T-ยาง"],
      ["ค่ายางรถร่วม", "T-ยางรถร่วม"],
      ["ซ่อมเคสอุบัติเหตุ", "AC-เคสอุบัติเหตุ"],
      ["PM ช่วงล่าง", "PM-บำรุงรักษา"],
    ]) {
      expect(getCostGroup(newName), `${oldName} vs ${newName}`).toBe(getCostGroup(oldName))
    }
  })

  it("leaves non-maintenance purposes in Other", () => {
    for (const v of [
      "ค่าล้างรถ", "แยคโม่", "แย็กโม่", "โอนย้ายสต็อค", "โอนย้ายศูนย์",
      "คืนสินค้าซัพพลายเออร์", "เบิกเพื่อทำความสะอาด", "ค่าบริการ",
      "ค่าชั่งน้ำหนัก", "สวัสดิการพนักงาน-นครหลวง", "น้ำมันเชื้อเพลิง",
    ]) expect(getCostGroup(v), v).toBe("Other")
  })

  it("trims, and never throws on empty input", () => {
    expect(getCostGroup("  ซ่อม  ")).toBe(CM)
    expect(getCostGroup("")).toBe("Other")
    expect(getCostGroup(undefined as unknown as string)).toBe("Other")
  })

  it("only ever produces groups the UI can render", () => {
    const known = new Set([CM, PM, T, AC, TOOLS])
    for (const g of Object.values(COST_GROUP_MAP)) expect(known).toContain(g)
  })
})
