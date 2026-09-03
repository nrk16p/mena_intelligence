// Shared จุดประสงค์ในการเบิก → Cost Group mapping.
//
// Used by /cost, /cost-report, /workshop-summary and /transaction-detail. It
// lives here alone on purpose: the four pages each carried their own copy, two
// of them had already lost "PM ความเเย็น", and when ATMS renamed its purposes
// nobody had one place to update.
//
// ── The ส.ค. 2026 rename ─────────────────────────────────────────────────────
// ATMS moved to a prefixed scheme (CM- / PM- / T- / AC- / OTH-) and ran it
// ALONGSIDE the old names through the transition — Aug 2026 has ฿6.56M under old
// names and ฿3.77M under new ones. Both sets are mapped here so a cost group
// means the same thing either side of the switch. Without the new names, Aug
// alone dropped ฿3.77M into "Other" and CM / T / AC all read low.
// Source: the ประเภทการซ่อม → จุดประสงค์ mapping table, codes Y019–Y033.
const CM = "CM - Corrective Maintenance"
const PM = "PM - Preventive Maintenance"
const T  = "T - Tire"
const AC = "AC - Accident Repair"
const TOOLS = "Tools & Equipment"

export const COST_GROUP_MAP: Record<string, string> = {
  // ── old names (pre-ส.ค. 2026, still in use during the transition) ─────────
  "PM น้ำมันเครื่อง":        PM,
  "PM ช่วงล่าง":             PM,
  "PM ความเย็น":             PM,
  "PM ความเเย็น":            PM, // typo ในข้อมูลต้นทาง (เเ สองตัว) — เป็นค่าที่มีจริง
  "ค่าใช้จ่ายอื่น ๆ":        CM,
  "ซ่อม":                    CM,
  "อะไหล่/วัสดุสิ้นเปลือง": CM,
  "เครื่องมือส่วนตัวช่าง":   TOOLS,
  "เบิกประจำตัวช่าง":        TOOLS,
  "เบิกประจำรถ":             TOOLS,
  "เบิกประจำฟรีท":           TOOLS,
  "ยาง":                     T,
  "ซ่อมเคสอุบัติเหตุ":       AC,

  // Partner-vehicle work under the old names. These are the same costs the new
  // scheme calls CM-งานซ่อมรถร่วม / T-ยางรถร่วม, so they have to land in the
  // same groups — left in "Other" they were ฿11.5M of a 16-month "Other" bucket
  // that then collapsed the moment the new names took over.
  "ค่าซ่อม/ค่าอะไหล่รถร่วม":              CM,
  "ค่าซ่อม/ค่าอะไหล่รถร่วมภายนอก(พจน.)": CM,
  "ค่ายางรถร่วม":                          T,

  // ── new names, ส.ค. 2026 onward ───────────────────────────────────────────
  "CM-งานซ่อม":            CM,
  "CM-งานซ่อมรถร่วม":      CM,
  "CM-งานซ่อมร่วมภายนอก":  CM,
  "PM-บำรุงรักษา":            PM,
  "PM-บำรุงรักษารถร่วม":      PM,
  "PM-บำรุงรักษาร่วมภายนอก":  PM,
  "T-ยาง":              T,
  "T-ยางรถร่วม":        T,
  "T-ยางรถร่วมภายนอก":  T,
  "AC-เคสอุบัติเหตุ":              AC,
  "AC-เคสอุบัติเหตุรถร่วม":        AC,
  "AC-เคสอุบัติเหตุรถร่วมภายนอก":  AC,

  // OTH-อื่นๆ replaces four old repair types that used to split across two
  // groups: วัสดุสิ้นเปลือง and อุปกรณ์เสริม / NGV / อัดจารบี were CM, while
  // เครื่องมือช่าง was Tools & Equipment. The purpose field can no longer tell
  // them apart, so it goes to CM, where three of the four came from — Tools was
  // ฿23K over eight months, and its detail survives in ประเภทการซ่อม
  // (อู่ใน-OTH-เครื่องมือช่าง) on the MR side for anyone who needs the split.
  "OTH-อื่นๆ": CM,
}

// Values seen in the data that deliberately fall through to "Other": ค่าล้างรถ ·
// แยคโม่ / แย็กโม่ (spelling changed in ส.ค. 2026 — both belong here) ·
// โอนย้ายสต็อค · โอนย้ายศูนย์ · คืนสินค้าซัพพลายเออร์ · เบิกเพื่อทำความสะอาด ·
// ค่าบริการ · ค่าชั่งน้ำหนัก · สวัสดิการพนักงาน-นครหลวง · น้ำมันเชื้อเพลิง ·
// ต่อภาษี · การขาย · เบิกเพื่อเป็นแจกให้พนักงาน. None of them is maintenance work.

export const COST_GROUP_ORDER = [
  "PM - Preventive Maintenance",
  "CM - Corrective Maintenance",
  "T - Tire",
  "Tools & Equipment",
  "AC - Accident Repair",
  "Other",
]

export function getCostGroup(จุดประสงค์: string): string {
  return COST_GROUP_MAP[จุดประสงค์?.trim()] ?? "Other"
}
