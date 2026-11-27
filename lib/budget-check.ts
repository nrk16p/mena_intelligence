// เช็กงบจากเลขเอกสาร: compare one live PR against the buy leg (PR approved this month) in the
// budget-control snapshot that mena-backend-services writes every hour. Pure functions only.
// Category and plate rules copy services/jobs/jobs/budget-control.ts in mena-backend-services.

export type Category = "ซ่อม" | "PM" | "ยาง"
export const CATEGORIES: Category[] = ["ซ่อม", "PM", "ยาง"]

export type SnapshotRow = { group: string; category: Category; budget: number; wd: number; pr_approved: number; pr_pending: number }
export type Snapshot = {
  month: string
  cut: string
  computed_at: string
  sources?: { pr_at?: string | null; wd_at?: string | null }
  rows: SnapshotRow[]
  pending_prs: { code: string; split?: Partial<Record<Category, number>> }[]
  by_plate: { plate: string; group: string }[]
}
export type PlateMapEntry = { fleet: string; owner: string } | null

export type PrDoc = {
  code: string
  date: string // YYYY-MM-DD
  department: string
  plate: string
  total: number
  requester: string
  note: string
  approved: boolean
  levelsDone: number
  items: { group: string | null; total: number }[]
}

export type LineState = "ok" | "ok_pending_over" | "over"
export type CheckLine = {
  category: Category
  amount: number
  budget: number
  used: number
  before: number
  after: number
  othersPending: number
  state: LineState
  remark: string
}
export type NoticeCode =
  | "approved" | "other_dept" | "no_plate" | "not_budget" | "no_snapshot" | "unknown_plate" | "partner" | "no_budget_row"
export type CheckResult = {
  group: string | null
  lines: CheckLine[]
  otherLeg: { category: Category; before: number }[]
  notice: { code: NoticeCode; message: string } | null
}

const plain = (n: number) => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("en-US")
/** YYYY-MM-DD → DD/MM/YY in Buddhist era */
export const be = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${String(Number(iso.slice(0, 4)) + 543).slice(2)}`

/** งบ 11/69 ML ซ่อม (01/11/69–25/11/69) | คงเหลือ 1,234,567 | PR นี้ 45,000 | หลังอนุมัติเหลือ 1,189,567 */
export function remarkLine(month: string, cut: string, fleet: string, cat: Category, before: number, pr: number) {
  const yy = String(Number(month.slice(0, 4)) + 543).slice(2), mm = month.slice(5, 7)
  const after = before - pr
  return `งบ ${mm}/${yy} ${fleet} ${cat} (01/${mm}/${yy}–${be(cut)}) | คงเหลือ ${plain(before)} | PR นี้ ${plain(pr)} | หลังอนุมัติเหลือ ${plain(after)}`
    + (after < 0 ? ` | เกินงบ ${plain(-after)} ต้องขออนุมัติเพิ่ม` : "")
}

/** "lbpr26110482" → { kind: "PR", code: "LBPR26110482" }; null for anything that is not a PR/WD number. */
export function docKind(input: string): { kind: "PR" | "WD"; code: string } | null {
  const code = String(input ?? "").trim().toUpperCase()
  const m = /^[A-Z]{2}(PR|WD)\d{8}$/.exec(code)
  return m ? { kind: m[1] as "PR" | "WD", code } : null
}

export function itemCategory(group: unknown): Category {
  const g = String(group ?? "")
  if (g.includes("ยาง")) return "ยาง"
  if (g.includes("บำรุงรักษา")) return "PM"
  return "ซ่อม"
}
export const normPlate = (p: unknown) => String(p ?? "").replace(/\s/gu, "")
export const isStockPlate = (p: unknown) => {
  const s = normPlate(p)
  return !s || s === "None" || /^สบ\.0+$/u.test(s)
}
const FUEL = "น้ำมันเชื้อเพลิง"
const BRANCH_DEPT = ["ศลบ", "ยานยนต์"]

const notice = (code: NoticeCode, message: string, group: string | null = null): CheckResult => ({ group, lines: [], otherLeg: [], notice: { code, message } })
const fmt = plain

export function checkPr(pr: PrDoc, snap: Snapshot | null, plateMap: PlateMapEntry): CheckResult {
  if (pr.approved) return notice("approved", "PR ใบนี้อนุมัติครบแล้ว ยอดนี้นับอยู่ในงบซื้อแล้ว ไม่ต้องวางหมายเหตุ")
  if (!BRANCH_DEPT.every((s) => pr.department.includes(s)))
    return notice("other_dept", `PR ใบนี้เป็นของแผนก ${pr.department || "ที่ไม่ระบุ"} ตอนนี้เทียบได้เฉพาะงบยานยนต์ ลาดกระบัง`)
  if (isStockPlate(pr.plate))
    return notice("no_plate", "PR ใบนี้ไม่มีทะเบียน เป็นของซื้อเข้าสต๊อก ตอนนี้ยังไม่มีงบให้เทียบ")

  const split = new Map<Category, number>()
  if (!pr.items.length) split.set("ซ่อม", pr.total)
  for (const i of pr.items) {
    if (i.group === FUEL) continue
    const c = itemCategory(i.group)
    split.set(c, (split.get(c) ?? 0) + i.total)
  }
  if (![...split.values()].some((v) => v > 0)) return notice("not_budget", "PR ใบนี้มีแต่น้ำมัน ไม่กินงบซ่อม PM ยาง")

  const month = pr.date.slice(0, 7)
  if (!snap) return notice("no_snapshot", `ยังไม่มียอดงบของเดือน ${month.slice(5, 7)}/${String(Number(month.slice(0, 4)) + 543).slice(2)} ให้เทียบ`)

  const pl = normPlate(pr.plate)
  const hit = snap.by_plate.find((b) => normPlate(b.plate) === pl)
  const known = hit && hit.group !== "อื่น" ? hit.group : null // "อื่น" = plate outside the GPM mixer list
  const group = known ?? (plateMap ? `${plateMap.fleet}|${plateMap.owner}` : null)
  if (!group) return notice("unknown_plate", `ทะเบียน ${pr.plate} ไม่อยู่ในรายชื่อรถ ML/MS ไม่มีงบให้เทียบ ให้ถามเจ้าของงบ`)
  if (group.endsWith("ร่วม")) return notice("partner", `ทะเบียน ${pr.plate} เป็นรถร่วม ไม่มีงบบริษัทให้คุม ยอดใบนี้ ${fmt(pr.total)}`, group)

  const fleet = group.split("|")[0]
  const mine = snap.pending_prs.find((p) => p.code === pr.code)
  const lines: CheckLine[] = []
  const otherLeg: CheckResult["otherLeg"] = []
  const missing: Category[] = []
  for (const category of CATEGORIES) {
    const amount = split.get(category)
    if (!amount) continue
    const row = snap.rows.find((r) => r.group === group && r.category === category)
    if (!row || row.budget <= 0) { missing.push(category); continue }
    const used = row.pr_approved
    const before = row.budget - used
    const after = before - amount
    const othersPending = Math.max(row.pr_pending - (mine?.split?.[category] ?? 0), 0)
    const state: LineState = after < 0 ? "over" : after - othersPending < 0 ? "ok_pending_over" : "ok"
    lines.push({ category, amount, budget: row.budget, used, before, after, othersPending, state, remark: remarkLine(month, pr.date, fleet, category, before, amount) })
    otherLeg.push({ category, before: row.budget - row.wd })
  }
  const miss = missing.length ? { code: "no_budget_row" as const, message: `ยังไม่ได้ตั้งงบ ${missing.join(", ")} ของ ${fleet} เดือนนี้` } : null
  return { group, lines, otherLeg, notice: miss }
}
