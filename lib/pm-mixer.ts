/**
 * PM มิกเซอร์ คลังลาดกระบัง — งาน PM ทั้งหมดมาจากฝั่ง MR (maint_tasks.repair_type)
 * ไม่ใช่ฝั่งใบเบิก เพราะปี 2026 มีเพียง 53% ของใบ PM จริงที่ถูกคีย์จุดประสงค์เป็น "PM"
 * (อีก 336 ใบคีย์เป็น "ซ่อม") — ฝั่ง MR จึงเป็นฐานเดียวที่เทียบข้ามปีได้
 *
 * ค่าใช้จ่ายต่องานมาจาก repair-analysis (flatten ของ maint_parts) จับคู่ request_id+task_id
 * ทะเบียน → ฟลีต/อายุรถ จับคู่ผ่าน maint_header.vehicle_no ↔ truck_master_monthly.truck_no
 * (จับด้วย plate ไม่ได้ รูปแบบทะเบียนสองระบบไม่ตรงกัน)
 */
import type { Db } from "mongodb"

// ── นิยาม PM ────────────────────────────────────────────────────────────────
// "PMช่างมีนา" (ทำเองในอู่) · "PMศูนย์บริการ" (ส่งศูนย์) · "ระบบบำรุงรักษา"
// รวมรูปแบบใหม่ "อู่ใน-PM-…" / "อู่นอก-PM-…" ที่เริ่มใช้ปี 2026
export function isPmType(rt: string | null | undefined): boolean {
  const s = (rt ?? "").trim()
  return s.includes("PM") || s.includes("บำรุงรักษา")
}

// ลูกค้าที่ไม่ใช่รถมิกเซอร์ (ตู้เย็น/ตู้แห้ง/หาง/ขนส่งทั่วไป) — ที่ลาดกระบังมีไม่ถึง 0.5%
export const NON_MIXER_CUSTOMERS = new Set([
  "MHS", "DHL 9.5", "DHL 7.5", "TDM", "TDM 7.5", "Trailer", "TFG", "KN 9.5 Fix var",
  "KN 7.5", "BTG-T", "Lazada Express - DD", "ALL NOW 7.5", "JRC", "RP", "ACON-T",
])
// เลขรถขึ้นต้นด้วยคำนำหน้าเหล่านี้ = หาง/รถตู้ ใช้เฉพาะกรณีจับคู่ truck master ไม่ได้
export const TRAILER_PREFIXES = new Set(["M", "MC", "T", "CKD", "TPT"])

// รายการมาตรฐานที่ควรมีในงาน PM หนึ่งครั้ง
export const PM_ITEMS: { key: string; label: string; re: RegExp }[] = [
  { key: "engineOil", label: "น้ำมันเครื่อง",    re: /น้ำมันเครื่อง/ },
  { key: "oilFilter", label: "กรองเครื่อง",      re: /กรองเครื่อง|กรองน้ำมันเครื่อง/ },
  { key: "fuelFilter", label: "กรองโซล่า/ดักน้ำ", re: /กรองโซล่า|กรองเชื้อเพลิง|กรองดักน้ำ/ },
  { key: "gearOil",   label: "น้ำมันเกียร์",      re: /น้ำมันเกียร์/ },
  { key: "diffOil",   label: "น้ำมันเฟืองท้าย",   re: /เฟืองท้าย/ },
  { key: "grease",    label: "จารบี",             re: /จารบี/ },
]

// เกณฑ์รอบ PM ที่ใช้ตัดสินว่า "หลุด" — ยังไม่มีเกณฑ์ทางการ ตั้งจาก p50 ปี 2026 (10,534 กม.)
export const KM_LIMIT = 15_000
export const DAY_LIMIT = 180
export const KM_SEVERE = 25_000
// ผลต่างเลขไมล์ที่เกินนี้ถือว่าเลขไมล์กรอกผิด ไม่นำมาตัดสิน
export const KM_SANE_MAX = 60_000

const AGE_BANDS: { label: string; max: number }[] = [
  { label: "≤3 ปี", max: 3 }, { label: "4-6 ปี", max: 6 },
  { label: "7-10 ปี", max: 10 }, { label: ">10 ปี", max: Infinity },
]
export function ageBand(age: number | null): string | null {
  if (age === null || !Number.isFinite(age) || age <= 0) return null
  return AGE_BANDS.find(b => age <= b.max)!.label
}

// ── helpers ─────────────────────────────────────────────────────────────────
/** "20/05/2026 20:28" → Date (local midnight). คืน null เมื่อรูปแบบไม่ตรง */
export function parseThaiDate(s: string | null | undefined): Date | null {
  const m = (s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  const [, d, mo, y] = m
  const dt = new Date(Number(y), Number(mo) - 1, Number(d))
  return Number.isNaN(dt.getTime()) ? null : dt
}
/** "236,636" → 236636 · ค่าที่อยู่นอกช่วงเลขไมล์ที่เป็นไปได้คืน null */
export function parseKm(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/,/g, ""))
  return Number.isFinite(n) && n >= 1000 && n <= 2_000_000 ? n : null
}
function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const i = Math.floor(s.length / 2)
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2
}
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)

// ── shapes ──────────────────────────────────────────────────────────────────
export type YearStat = {
  year: number
  pmMrs: number; pmTasks: number; platesPm: number; platesAll: number
  coverage: number; freq: number; cost: number; perMr: number; perPlate: number
  mrsAll: number; costAll: number; shareMrs: number; shareCost: number
}
export type SplitRow = { key: string; cur: { trucks: number; pmTrucks: number; pmMrs: number; cost: number }
                                     prev: { trucks: number; pmTrucks: number; pmMrs: number; cost: number } }
export type MonthRow = { month: number; curMrs: number; curCost: number; prevMrs: number; prevCost: number }
export type IntervalRow = { year: number; pairs: number; kmPairs: number
                            medianDays: number | null; medianKm: number | null
                            over15k: number; over20k: number; over30k: number }
export type BasketRow = { year: number; repairType: string; mrs: number; noPartsPct: number
                          avgItems: number; items: Record<string, number>; laborPct: number }
export type RiskRow = { plate: string; customer: string; age: number | null; mrs: number; pmCount: number
                        lastPm: string | null; daysSince: number | null; kmSince: number | null
                        kmNow: number | null; level: "A" | "B" | "C"; kmSuspect: boolean }
export type PmMixerPayload = {
  meta: { branch: string; curYear: number; prevYear: number; monthTo: number; asOf: string
          mrTotal: number; mrMixer: number; mixerPct: number; generatedAt: string }
  overview: YearStat[]
  byType: SplitRow[]; byFleet: SplitRow[]; byAge: SplitRow[]; byOwner: SplitRow[]; byBrand: SplitRow[]
  monthly: MonthRow[]
  interval: IntervalRow[]
  basket: BasketRow[]
  risk: RiskRow[]
  riskSummary: { fleetSize: number; never: number; overKm: number; overDays: number; kmSuspect: number
                 total: number; byLevel: Record<string, number>; byFleet: { key: string; n: number }[] }
}

type Hdr = {
  request_id: number; dt: Date | null; year: number; month: number
  plate: string; vehicleNo: string; km: number | null; ownerType: string
  customer: string; age: number | null; brand: string; isPm: boolean
}

// ── main ────────────────────────────────────────────────────────────────────
export async function computePmMixer(
  db: Db,
  opts: { year: number; monthTo: number; asOf?: Date },
): Promise<PmMixerPayload> {
  const { year, monthTo } = opts
  const asOf = opts.asOf ?? new Date()
  const prevYear = year - 1

  const [rawHdr, fleetRows, pmTasksRaw, mrTotals] = await Promise.all([
    db.collection("maint_header").find(
      { branch: "ลาดกระบัง" },
      { projection: { _id: 0, request_id: 1, reported_at: 1, plate_no: 1, vehicle_no: 1,
                      mileage_at_report: 1, owner_type: 1 } },
    ).toArray(),
    // truck master เก็บรายเดือน — เอาแถวล่าสุดของแต่ละเลขรถ
    db.collection("truck_master_monthly").aggregate([
      { $sort: { truck_no: 1, month_year: 1 } },
      { $group: { _id: "$truck_no", customer: { $last: "$customer" },
                  truck_age: { $last: "$truck_age" }, brand: { $last: "$brand" } } },
    ]).toArray(),
    db.collection("maint_tasks").find(
      { $or: [{ repair_type: { $regex: "PM" } }, { repair_type: { $regex: "บำรุงรักษา" } }] },
      { projection: { _id: 0, request_id: 1, task_id: 1, repair_type: 1 } },
    ).toArray(),
    // ค่าซ่อมรวมทั้งใบ (ทุกงาน ไม่ใช่เฉพาะ PM) — ใช้เป็นตัวหารของสัดส่วน PM
    db.collection("repair-analysis").aggregate<{ _id: number; total: number }>([
      { $group: { _id: "$request_id", total: { $sum: "$total" } } },
    ]).toArray(),
  ])
  const totalCostByRid = new Map<number, number>(mrTotals.map(r => [r._id, Number(r.total) || 0]))

  const fleet = new Map<string, { customer: string; age: number | null; brand: string }>()
  for (const f of fleetRows) {
    const age = Number(f.truck_age)
    fleet.set(String(f._id).trim(), {
      customer: f.customer ?? "", age: Number.isFinite(age) ? age : null,
      brand: String(f.brand ?? "").toUpperCase(),
    })
  }

  // PM tasks ของทุกสาขา → กรองด้วย request_id ของลาดกระบังทีหลัง
  const pmByRid = new Map<number, { taskId: number; repairType: string }[]>()
  for (const t of pmTasksRaw) {
    if (!isPmType(t.repair_type)) continue
    const arr = pmByRid.get(t.request_id) ?? []
    arr.push({ taskId: Number(t.task_id), repairType: String(t.repair_type).trim() })
    pmByRid.set(t.request_id, arr)
  }

  // ── header → มิกเซอร์เท่านั้น ────────────────────────────────────────────
  const all: Hdr[] = []
  let mrTotal = 0
  for (const h of rawHdr) {
    mrTotal++
    const vehicleNo = String(h.vehicle_no ?? "").trim()
    const fm = fleet.get(vehicleNo)
    const customer = fm?.customer ?? ""
    const prefix = vehicleNo.match(/^([A-Za-z]+)/)?.[1] ?? ""
    const isMixer = fm
      ? !NON_MIXER_CUSTOMERS.has(customer)
      : !TRAILER_PREFIXES.has(prefix)
    if (!isMixer) continue
    const plate = String(h.plate_no ?? "").trim()
    if (!plate) continue
    const dt = parseThaiDate(h.reported_at)
    if (!dt) continue
    all.push({
      request_id: h.request_id, dt, year: dt.getFullYear(), month: dt.getMonth() + 1,
      plate, vehicleNo, km: parseKm(h.mileage_at_report),
      ownerType: String(h.owner_type ?? "ไม่ระบุ").trim() || "ไม่ระบุ",
      customer: customer || "(ไม่พบในทะเบียนรถ)", age: fm?.age ?? null,
      brand: fm?.brand || "ไม่ระบุ", isPm: pmByRid.has(h.request_id),
    })
  }

  // ── ค่าใช้จ่ายต่องาน PM ──────────────────────────────────────────────────
  const pmRids = all.filter(h => h.isPm).map(h => h.request_id)
  const partRows = pmRids.length
    ? await db.collection("repair-analysis").find(
        { request_id: { $in: pmRids } },
        { projection: { _id: 0, request_id: 1, task_id: 1, part: 1, total: 1, parts_group: 1 } },
      ).toArray()
    : []

  const pmTaskKeys = new Set<string>()
  for (const [rid, ts] of pmByRid) for (const t of ts) pmTaskKeys.add(`${rid}|${t.taskId}`)
  const costByRid = new Map<number, number>()
  const partsByRid = new Map<number, { part: string; group: string }[]>()
  for (const p of partRows) {
    if (!pmTaskKeys.has(`${p.request_id}|${Number(p.task_id)}`)) continue   // เฉพาะบรรทัดของงาน PM
    costByRid.set(p.request_id, (costByRid.get(p.request_id) ?? 0) + (Number(p.total) || 0))
    const arr = partsByRid.get(p.request_id) ?? []
    arr.push({ part: String(p.part ?? ""), group: String(p.parts_group ?? "") })
    partsByRid.set(p.request_id, arr)
  }
  const costOf = (rid: number) => costByRid.get(rid) ?? 0

  // ── 1. overview ──────────────────────────────────────────────────────────
  const inWindow = (h: Hdr, y: number) => h.year === y && h.month <= monthTo
  const overview: YearStat[] = [prevYear, year].map(y => {
    const rows = all.filter(h => inWindow(h, y))
    const pm = rows.filter(h => h.isPm)
    const pmMrs = new Set(pm.map(h => h.request_id)).size
    const platesPm = new Set(pm.map(h => h.plate)).size
    const platesAll = new Set(rows.map(h => h.plate)).size
    const cost = pm.reduce((s, h) => s + costOf(h.request_id), 0)
    const costAll = rows.reduce((s, h) => s + (totalCostByRid.get(h.request_id) ?? 0), 0)
    const pmTasks = pm.reduce((s, h) => s + (pmByRid.get(h.request_id)?.length ?? 0), 0)
    return {
      year: y, pmMrs, pmTasks, platesPm, platesAll,
      coverage: pct(platesPm, platesAll), freq: platesPm ? pmMrs / platesPm : 0,
      cost, perMr: pmMrs ? cost / pmMrs : 0, perPlate: platesPm ? cost / platesPm : 0,
      mrsAll: new Set(rows.map(h => h.request_id)).size, costAll,
      shareMrs: pct(pmMrs, new Set(rows.map(h => h.request_id)).size), shareCost: pct(cost, costAll),
    }
  })

  // ── 2-6. มิติต่าง ๆ ──────────────────────────────────────────────────────
  function split(keyOf: (h: Hdr) => string | null): SplitRow[] {
    const acc = new Map<string, SplitRow>()
    for (const y of [prevYear, year]) {
      const side = y === year ? "cur" : "prev"
      const buckets = new Map<string, { trucks: Set<string>; pmTrucks: Set<string>; pmMrs: Set<number>; cost: number }>()
      for (const h of all) {
        if (!inWindow(h, y)) continue
        const k = keyOf(h)
        if (k === null) continue
        const b = buckets.get(k) ?? { trucks: new Set(), pmTrucks: new Set(), pmMrs: new Set(), cost: 0 }
        b.trucks.add(h.plate)
        if (h.isPm) { b.pmTrucks.add(h.plate); b.pmMrs.add(h.request_id); b.cost += costOf(h.request_id) }
        buckets.set(k, b)
      }
      for (const [k, b] of buckets) {
        const row = acc.get(k) ?? { key: k, cur: { trucks: 0, pmTrucks: 0, pmMrs: 0, cost: 0 },
                                            prev: { trucks: 0, pmTrucks: 0, pmMrs: 0, cost: 0 } }
        row[side] = { trucks: b.trucks.size, pmTrucks: b.pmTrucks.size, pmMrs: b.pmMrs.size, cost: b.cost }
        acc.set(k, row)
      }
    }
    return [...acc.values()].sort((a, b) => (b.cur.trucks + b.prev.trucks) - (a.cur.trucks + a.prev.trucks))
  }

  // byType นับเป็น "งาน" (task) ไม่ใช่คัน — ใบเดียวมี PM ได้หลายชนิด
  const byType: SplitRow[] = (() => {
    const acc = new Map<string, SplitRow>()
    for (const y of [prevYear, year]) {
      const side = y === year ? "cur" : "prev"
      const b = new Map<string, { tasks: number; cost: number; mrs: Set<number>; trucks: Set<string> }>()
      for (const h of all) {
        if (!inWindow(h, y) || !h.isPm) continue
        const tasks = pmByRid.get(h.request_id) ?? []
        const share = tasks.length ? costOf(h.request_id) / tasks.length : 0
        for (const t of tasks) {
          const e = b.get(t.repairType) ?? { tasks: 0, cost: 0, mrs: new Set(), trucks: new Set() }
          e.tasks++; e.cost += share; e.mrs.add(h.request_id); e.trucks.add(h.plate)
          b.set(t.repairType, e)
        }
      }
      for (const [k, e] of b) {
        const row = acc.get(k) ?? { key: k, cur: { trucks: 0, pmTrucks: 0, pmMrs: 0, cost: 0 },
                                            prev: { trucks: 0, pmTrucks: 0, pmMrs: 0, cost: 0 } }
        row[side] = { trucks: e.trucks.size, pmTrucks: e.tasks, pmMrs: e.mrs.size, cost: e.cost }
        acc.set(k, row)
      }
    }
    return [...acc.values()].sort((a, b) => (b.cur.pmTrucks + b.prev.pmTrucks) - (a.cur.pmTrucks + a.prev.pmTrucks))
  })()

  const byFleet = split(h => h.customer)
  const byAge   = split(h => ageBand(h.age))
  const byOwner = split(h => h.ownerType)
  const byBrand = split(h => h.brand)

  // ── 7. รายเดือน ──────────────────────────────────────────────────────────
  const monthly: MonthRow[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const of = (y: number) => {
      const rows = all.filter(h => h.year === y && h.month === m && h.isPm)
      return { mrs: new Set(rows.map(h => h.request_id)).size,
               cost: rows.reduce((s, h) => s + costOf(h.request_id), 0) }
    }
    const c = of(year), p = of(prevYear)
    return { month: m, curMrs: c.mrs, curCost: c.cost, prevMrs: p.mrs, prevCost: p.cost }
  })

  // ── 8. ระยะห่างระหว่าง PM ────────────────────────────────────────────────
  const byPlate = new Map<string, Hdr[]>()
  for (const h of all) {
    const arr = byPlate.get(h.plate) ?? []
    arr.push(h); byPlate.set(h.plate, arr)
  }
  const gaps: { year: number; days: number; km: number | null }[] = []
  for (const rows of byPlate.values()) {
    const pm = rows.filter(h => h.isPm).sort((a, b) => a.dt!.getTime() - b.dt!.getTime())
    for (let i = 1; i < pm.length; i++) {
      const days = Math.round((pm[i].dt!.getTime() - pm[i - 1].dt!.getTime()) / 86400000)
      if (days < 1 || days > 400) continue
      const km = pm[i].km !== null && pm[i - 1].km !== null ? pm[i].km! - pm[i - 1].km! : null
      gaps.push({ year: pm[i].year, days, km: km !== null && km > 0 && km <= 150_000 ? km : null })
    }
  }
  const interval: IntervalRow[] = [prevYear, year].map(y => {
    const g = gaps.filter(x => x.year === y)
    const kms = g.map(x => x.km).filter((x): x is number => x !== null)
    return {
      year: y, pairs: g.length, kmPairs: kms.length,
      medianDays: median(g.map(x => x.days)), medianKm: median(kms),
      over15k: pct(kms.filter(k => k > 15_000).length, kms.length),
      over20k: pct(kms.filter(k => k > 20_000).length, kms.length),
      over30k: pct(kms.filter(k => k > 30_000).length, kms.length),
    }
  })

  // ── 9. ความครบถ้วนของรายการในใบ PM ──────────────────────────────────────
  const basket: BasketRow[] = []
  for (const y of [prevYear, year]) {
    const byType2 = new Map<string, number[]>()   // repairType → request_ids
    for (const h of all) {
      if (!inWindow(h, y) || !h.isPm) continue
      for (const t of pmByRid.get(h.request_id) ?? []) {
        const arr = byType2.get(t.repairType) ?? []
        if (!arr.includes(h.request_id)) arr.push(h.request_id)
        byType2.set(t.repairType, arr)
      }
    }
    for (const [repairType, rids] of byType2) {
      const withParts = rids.filter(r => (partsByRid.get(r)?.length ?? 0) > 0)
      const items: Record<string, number> = {}
      let itemSum = 0, labor = 0
      for (const it of PM_ITEMS) {
        const n = withParts.filter(r => partsByRid.get(r)!.some(p => it.re.test(p.part))).length
        items[it.key] = pct(n, withParts.length)
        itemSum += n
      }
      labor = withParts.filter(r => partsByRid.get(r)!.some(p => p.group.includes("ค่าแรง"))).length
      basket.push({
        year: y, repairType, mrs: rids.length,
        noPartsPct: pct(rids.length - withParts.length, rids.length),
        avgItems: withParts.length ? itemSum / withParts.length : 0,
        items, laborPct: pct(labor, withParts.length),
      })
    }
  }
  basket.sort((a, b) => a.year - b.year || b.mrs - a.mrs)

  // ── 10. รถที่หลุด PM ในปีปัจจุบัน ────────────────────────────────────────
  const risk: RiskRow[] = []
  let never = 0, overKm = 0, overDays = 0, kmSuspect = 0, fleetSize = 0
  for (const [plate, rows] of byPlate) {
    const cur = rows.filter(h => h.year === year)
    if (!cur.length) continue
    fleetSize++
    const pm = cur.filter(h => h.isPm).sort((a, b) => a.dt!.getTime() - b.dt!.getTime())
    const pmKm = pm.filter(h => h.km !== null)
    const anyKm = cur.filter(h => h.km !== null).sort((a, b) => a.dt!.getTime() - b.dt!.getTime())
    const last = pm.length ? pm[pm.length - 1] : null
    const kmAtPm = pmKm.length ? pmKm[pmKm.length - 1].km! : null
    const kmNow = anyKm.length ? anyKm[anyKm.length - 1].km! : null
    const rawDiff = kmAtPm !== null && kmNow !== null ? kmNow - kmAtPm : null
    const suspect = rawDiff !== null && rawDiff > KM_SANE_MAX
    const kmSince = rawDiff !== null && rawDiff >= 0 && !suspect ? rawDiff : null
    const daysSince = last ? Math.round((asOf.getTime() - last.dt!.getTime()) / 86400000) : null

    if (!pm.length) never++
    if (kmSince !== null && kmSince > KM_LIMIT) overKm++
    if (daysSince !== null && daysSince > DAY_LIMIT) overDays++
    if (suspect) kmSuspect++

    const flagged = !pm.length || (kmSince !== null && kmSince > KM_LIMIT) || (daysSince !== null && daysSince > DAY_LIMIT)
    if (!flagged) continue
    const meta = rows[rows.length - 1]
    risk.push({
      plate, customer: meta.customer, age: meta.age,
      mrs: new Set(cur.map(h => h.request_id)).size, pmCount: new Set(pm.map(h => h.request_id)).size,
      lastPm: last ? last.dt!.toISOString().slice(0, 10) : null,
      daysSince, kmSince, kmNow, kmSuspect: suspect,
      level: !pm.length ? "A" : (kmSince !== null && kmSince > KM_SEVERE ? "B" : "C"),
    })
  }
  risk.sort((a, b) => a.level.localeCompare(b.level) || (b.daysSince ?? 0) - (a.daysSince ?? 0))
  const fleetCount = new Map<string, number>()
  for (const r of risk) fleetCount.set(r.customer, (fleetCount.get(r.customer) ?? 0) + 1)

  return {
    meta: {
      branch: "ลาดกระบัง", curYear: year, prevYear, monthTo, asOf: asOf.toISOString().slice(0, 10),
      mrTotal, mrMixer: all.length, mixerPct: pct(all.length, mrTotal),
      generatedAt: new Date().toISOString(),
    },
    overview, byType, byFleet, byAge, byOwner, byBrand, monthly, interval, basket, risk,
    riskSummary: {
      fleetSize, never, overKm, overDays, kmSuspect, total: risk.length,
      byLevel: risk.reduce<Record<string, number>>((a, r) => ({ ...a, [r.level]: (a[r.level] ?? 0) + 1 }), {}),
      byFleet: [...fleetCount.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n),
    },
  }
}
