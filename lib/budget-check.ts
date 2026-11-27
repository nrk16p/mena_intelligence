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
  by_plate: { plate: string; group: string; pr_approved_cat?: Partial<Record<Category, number>> }[]
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
  for (const [k, v] of split) split.set(k, Math.round(v))
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
    const used = Math.round(row.pr_approved)
    const before = Math.round(row.budget) - used
    const after = before - amount
    const othersPending = Math.max(row.pr_pending - (mine?.split?.[category] ?? 0), 0)
    const state: LineState = after < 0 ? "over" : after - othersPending < 0 ? "ok_pending_over" : "ok"
    lines.push({ category, amount, budget: Math.round(row.budget), used, before, after, othersPending, state, remark: remarkLine(month, pr.date, fleet, category, before, amount) })
    otherLeg.push({ category, before: row.budget - row.wd })
  }
  const miss = missing.length ? { code: "no_budget_row" as const, message: `ยังไม่ได้ตั้งงบ ${missing.join(", ")} ของ ${fleet} เดือนนี้` } : null
  return { group, lines, otherLeg, notice: miss }
}

// ---------- per fleet (งบรายฟลีท) ----------
// Fleet budget comes from the "งบรายฟลีท" snapshot (repair split by truck age, PM and tyre by truck count);
// used = PR approved this month on that fleet's plates (by_plate.pr_approved_cat in the budget-control snapshot).

export type FleetBudgetFile = {
  year: number
  groups: { id: string; trucks: number; repair: number[]; pm: number[]; tyre: number[]; fleets: { fleet: string; trucks: number; repair_share: number }[] }[]
}
export const OTHER_ML = new Set(["ที.เอ็น.ซีเมนต์บล็อค", "Acon", "มหาทรัพย์ซีเมนต์", "จิรโชติ", "RP"])

/** "Asia" + ML → "Asia ML"; names that already end in ML/MS stay as they are ("Scco ML", "Asia MS"). */
export const fleetLabel = (name: string, groupId: string) => (/\s(ML|MS)$/.test(name) ? name : `${name} ${groupId}`)

/** Monthly fleet budget per category, or null when the file has no such fleet or year. */
export function fleetBudgetFor(file: FleetBudgetFile, groupId: string, atmsFleet: string, month: string): Partial<Record<Category, number>> | null {
  if (Number(month.slice(0, 4)) !== file.year) return null
  const g = file.groups.find((x) => x.id === groupId)
  const name = groupId === "ML" && OTHER_ML.has(atmsFleet) ? "อื่น ๆ" : atmsFleet
  const f = g?.fleets.find((x) => x.fleet === name)
  if (!g || !f || !g.trucks) return null
  const m = Number(month.slice(5, 7)) - 1
  const byCount = f.trucks / g.trucks
  return { ซ่อม: g.repair[m] * f.repair_share, PM: g.pm[m] * byCount, ยาง: g.tyre[m] * byCount }
}

/** false until the budget-control job that stores PR approved per plate has run for this snapshot. */
export const hasFleetTotals = (snap: Pick<Snapshot, "by_plate">) => snap.by_plate.some((r) => r.pr_approved_cat !== undefined)

/** Lines for one fleet: same maths as the group lines, with the fleet's own budget, approved total and pending PRs. */
export function checkPrFleet(
  pr: PrDoc,
  fleet: string,
  budget: Partial<Record<Category, number>>,
  fleetPlates: Set<string>,
  snap: Pick<Snapshot, "by_plate" | "pending_prs">,
  pendingPlates: { code: string; plate: string; split?: Partial<Record<Category, number>> }[],
): CheckLine[] {
  const split = new Map<Category, number>()
  if (!pr.items.length) split.set("ซ่อม", pr.total)
  for (const i of pr.items) {
    if (i.group === FUEL) continue
    const c = itemCategory(i.group)
    split.set(c, (split.get(c) ?? 0) + i.total)
  }
  for (const [k, v] of split) split.set(k, Math.round(v))
  const month = pr.date.slice(0, 7)
  const lines: CheckLine[] = []
  for (const category of CATEGORIES) {
    const amount = split.get(category)
    const b = Math.round(budget[category] ?? 0)
    if (!amount || !b || b <= 0) continue
    const used = Math.round(snap.by_plate.filter((r) => fleetPlates.has(normPlate(r.plate))).reduce((s, r) => s + (r.pr_approved_cat?.[category] ?? 0), 0))
    const othersPending = pendingPlates
      .filter((p) => p.code !== pr.code && fleetPlates.has(normPlate(p.plate)))
      .reduce((s, p) => s + (p.split?.[category] ?? 0), 0)
    const before = b - used
    const after = before - amount
    const state: LineState = after < 0 ? "over" : after - othersPending < 0 ? "ok_pending_over" : "ok"
    lines.push({ category, amount, budget: b, used, before, after, othersPending, state, remark: remarkLine(month, pr.date, fleet, category, before, amount) })
  }
  return lines
}

// ---------- ตามฟลีท tab ----------
export type FleetCell = { budget: number; wd: number; dd: number; pr: number; pend: number }
export type PlateCats = { plate: string; group: string; fleet?: string | null; cat?: Partial<Record<Category, { wd: number; dd_open: number; pr_open: number; pr_pending: number }>> }
export type FleetPivotRow = { groupId: string; fleet: string; cats: Record<Category, FleetCell> }
const emptyFleetCell = (): FleetCell => ({ budget: 0, wd: 0, dd: 0, pr: 0, pend: 0 })

/** Company plates summed by ATMS fleet ("Asia ML", "Cpac MS" …) with each fleet's own budget for the month.
 *  Fleets with a budget but no activity yet still get a row. Plates with no known fleet go to "ไม่ระบุฟลีท". */
export function fleetPivot(byPlate: PlateCats[], file: FleetBudgetFile, month: string): FleetPivotRow[] {
  const out = new Map<string, FleetPivotRow>()
  const row = (groupId: string, fleet: string) => {
    const k = `${groupId}|${fleet}`
    return out.get(k) ?? out.set(k, { groupId, fleet, cats: { ซ่อม: emptyFleetCell(), PM: emptyFleetCell(), ยาง: emptyFleetCell() } }).get(k)!
  }
  if (Number(month.slice(0, 4)) === file.year) {
    for (const g of file.groups.filter((x) => x.id === "ML" || x.id === "MS")) {
      for (const f of g.fleets) {
        const b = fleetBudgetFor(file, g.id, f.fleet === "อื่น ๆ" ? "Acon" : f.fleet, month)
        if (!b) continue
        const r = row(g.id, fleetLabel(f.fleet, g.id))
        for (const c of CATEGORIES) r.cats[c].budget += b[c] ?? 0
      }
    }
  }
  for (const p of byPlate) {
    if (!p.group.endsWith("บริษัท")) continue
    const groupId = p.group.split("|")[0]
    const raw = p.fleet ?? ""
    const name = !raw ? "ไม่ระบุฟลีท" : fleetLabel(groupId === "ML" && OTHER_ML.has(raw) ? "อื่น ๆ" : raw, groupId)
    const r = row(groupId, name)
    for (const c of CATEGORIES) {
      const v = p.cat?.[c]
      if (!v) continue
      r.cats[c].wd += v.wd; r.cats[c].dd += v.dd_open; r.cats[c].pr += v.pr_open; r.cats[c].pend += v.pr_pending
    }
  }
  const total = (r: FleetPivotRow) => CATEGORIES.reduce((s, c) => s + r.cats[c].budget, 0)
  return [...out.values()].sort((a, b) => a.groupId.localeCompare(b.groupId) || total(b) - total(a) || a.fleet.localeCompare(b.fleet))
}
