// KPI ควบคุมสต็อคคงเหลือ — shared config & aggregation
// สต็อคคงเหลือสิ้นเดือน = running balance = Σ(รับ − จ่าย) × ราคาทุน สะสมตั้งแต่ 2023-01
// (ยิ่งน้อยยิ่งดี — คุมทุนจม)  แสดง KPI ตั้งแต่ปี KPI_START_YEAR
import clientPromise from "@/lib/mongo"

export const DB = "atms"
export const COLL = "stockmovement_v5"
export const WEIGHT = 4
export const KPI_START_YEAR = 2025
// คงเหลือของเดือน M วัด ณ วันที่ SNAPSHOT_DAY ของเดือนถัดไป (รวม movement วันที่ 1–SNAPSHOT_DAY ของเดือนถัดไป)
export const SNAPSHOT_DAY = 5

// ym "YYYY-MM" → เดือนถัดไป
function nextYm(ym: string): string {
  let [y, m] = ym.split("-").map(Number)
  m += 1
  if (m > 12) { y += 1; m = 1 }
  return `${y}-${String(m).padStart(2, "0")}`
}

// นิพจน์ net (รับ−จ่าย)×ราคาทุน สำหรับ aggregation
const NET_EXPR = {
  $subtract: [
    { $multiply: [{ $ifNull: ["$รับ", 0] }, { $ifNull: ["$ราคาทุน", 0] }] },
    { $multiply: [{ $ifNull: ["$จ่าย", 0] }, { $ifNull: ["$ราคาทุน", 0] }] },
  ],
}
// net เฉพาะ movement วันที่ ≤ SNAPSHOT_DAY (ของเดือนนั้น)
const FIRST_N_NET_EXPR = {
  $sum: {
    $cond: [
      { $lte: [{ $dayOfMonth: { date: "$วันที่", timezone: "Asia/Bangkok" } }, SNAPSHOT_DAY] },
      NET_EXPR,
      0,
    ],
  },
}

export type GroupKey = "ศลบ." | "สสบ."

export type GroupConfig = {
  key: GroupKey
  label: string
  warehouses: string[]
  target: number
  grade4: number // ≤ ค่านี้ = เกรด 4 (ดีสุด)
  grade3: number // ≤ ค่านี้ = เกรด 3 (เป้า)
  grade2: number // ≤ ค่านี้ = เกรด 2 ; มากกว่านี้ = เกรด 1 (ตก)
}

export const GROUPS: GroupConfig[] = [
  {
    key: "ศลบ.",
    label: "ควบคุมสต็อคคงเหลือ ศลบ. (ศูนย์ลาดกระบัง+ศูนย์ขอนแก่น)",
    warehouses: ["คลังลาดกระบัง", "คลังขอนแก่น"],
    target: 650_000,
    grade4: 630_000,
    grade3: 650_000,
    grade2: 670_000,
  },
  {
    key: "สสบ.",
    label: "ควบคุมสต็อคคงเหลือ สสบ. (สำนักงานสระบุรี+ศูนย์บางปะกง)",
    warehouses: ["คลังสระบุรี", "คลัง DIST"],
    target: 180_000,
    grade4: 160_000,
    grade3: 180_000,
    grade2: 200_000,
  },
]

export function gradeFor(cfg: GroupConfig, balance: number): number {
  if (balance <= cfg.grade4) return 4
  if (balance <= cfg.grade3) return 3
  if (balance <= cfg.grade2) return 2
  return 0 // ต่ำกว่าเกรด 2 (คงเหลือเกิน band แย่สุด) = ตก, 0 คะแนน
}

// score = เกรด × น้ำหนัก → เกรด 4/3/2 = 16/12/8, ต่ำกว่าเกรด 2 (grade 0) = 0
export function scoreFor(grade: number): number {
  return grade * WEIGHT
}

export type MonthRow = {
  ym: string // YYYY-MM
  monthNet: number
  balance: number
  grade: number
  score: number
}

export type PivotResult = {
  years: number[]
  groups: {
    key: GroupKey
    label: string
    target: number
    bands: { grade4: number; grade3: number; grade2: number }
    warehouses: string[]
    months: MonthRow[] // ตั้งแต่ KPI_START_YEAR เป็นต้นไป เรียงตามเดือน
  }[]
}

/**
 * ดึงมูลค่ารับ/จ่ายรายเดือน-รายคลัง แล้วคำนวณ running balance สะสมจากเดือนแรกสุด
 * คืน pivot ต่อกลุ่ม (เฉพาะเดือน >= KPI_START_YEAR)
 */
export async function buildPivot(): Promise<PivotResult> {
  const client = await clientPromise
  const col = client.db(DB).collection(COLL)

  const allWarehouses = [...new Set(GROUPS.flatMap((g) => g.warehouses))]

  const agg = await col
    .aggregate([
      { $match: { คลังสินค้า: { $in: allWarehouses } } },
      {
        $group: {
          _id: { wh: "$คลังสินค้า", ym: "$year_month" },
          recv: { $sum: { $multiply: [{ $ifNull: ["$รับ", 0] }, { $ifNull: ["$ราคาทุน", 0] }] } },
          iss: { $sum: { $multiply: [{ $ifNull: ["$จ่าย", 0] }, { $ifNull: ["$ราคาทุน", 0] }] } },
          first5: FIRST_N_NET_EXPR,
        },
      },
    ])
    .toArray()

  // net + net วันที่ 1–5 ต่อ warehouse ต่อเดือน
  const netByWh: Record<string, Record<string, number>> = {}
  const first5ByWh: Record<string, Record<string, number>> = {}
  const monthSet = new Set<string>()
  for (const r of agg) {
    const wh = r._id.wh as string
    const ym = r._id.ym as string | null
    if (!ym) continue
    monthSet.add(ym)
    ;(netByWh[wh] ??= {})[ym] = (r.recv as number) - (r.iss as number)
    ;(first5ByWh[wh] ??= {})[ym] = r.first5 as number
  }
  const months = [...monthSet].sort()

  // running balance สิ้นเดือน (= ณ วันที่ 1 ของเดือนถัดไป) สะสมต่อ warehouse
  // แล้วปรับเป็น ณ วันที่ SNAPSHOT_DAY ของเดือนถัดไป: + net วันที่ 1–5 ของเดือนถัดไป
  const balByWh: Record<string, Record<string, number>> = {}
  for (const wh of allWarehouses) {
    let run = 0
    const end: Record<string, number> = {}
    for (const ym of months) {
      run += netByWh[wh]?.[ym] ?? 0
      end[ym] = run
    }
    balByWh[wh] = {}
    for (const ym of months) {
      balByWh[wh][ym] = end[ym] + (first5ByWh[wh]?.[nextYm(ym)] ?? 0)
    }
  }

  const years = new Set<number>()
  const groups = GROUPS.map((cfg) => {
    const rows: MonthRow[] = []
    for (const ym of months) {
      const year = Number(ym.slice(0, 4))
      const monthNet = cfg.warehouses.reduce((s, w) => s + (netByWh[w]?.[ym] ?? 0), 0)
      const balance = cfg.warehouses.reduce((s, w) => s + (balByWh[w]?.[ym] ?? 0), 0)
      if (year < KPI_START_YEAR) continue // running balance สะสมไว้แล้ว แค่ไม่ต้องแสดง
      years.add(year)
      const grade = gradeFor(cfg, balance)
      rows.push({ ym, monthNet, balance, grade, score: scoreFor(grade) })
    }
    return {
      key: cfg.key,
      label: cfg.label,
      target: cfg.target,
      bands: { grade4: cfg.grade4, grade3: cfg.grade3, grade2: cfg.grade2 },
      warehouses: cfg.warehouses,
      months: rows,
    }
  })

  return { years: [...years].sort(), groups }
}

export function groupByKey(key: string): GroupConfig | undefined {
  return GROUPS.find((g) => g.key === key)
}

// ─── breakdown ตามกลุ่มสินค้า ─────────────────────────────────────────────
export type BreakdownCell = { recv: number; issue: number; balance: number }
export type BreakdownResult = {
  years: number[]
  groups: {
    key: GroupKey
    months: string[] // 2025+ เรียงตามเดือน
    productGroups: { name: string; cells: Record<string, BreakdownCell> }[]
  }[]
}

/**
 * แตกยอดตาม กลุ่มสินค้า × เดือน ต่อกลุ่มคลัง
 *  - recv  = Σ(รับ × ราคาทุน) รายเดือน (ยอดรับ)
 *  - issue = Σ(จ่าย × ราคาทุน) รายเดือน (ยอดเบิก)
 *  - balance = running balance สะสม (Σ recv−issue) ต่อกลุ่มสินค้า (คงเหลือ)
 * แสดงเฉพาะเดือน >= KPI_START_YEAR แต่ balance สะสมจริงจากเดือนแรกสุด
 */
export async function buildBreakdown(): Promise<BreakdownResult> {
  const client = await clientPromise
  const col = client.db(DB).collection(COLL)
  const allWarehouses = [...new Set(GROUPS.flatMap((g) => g.warehouses))]

  const agg = await col
    .aggregate([
      { $match: { คลังสินค้า: { $in: allWarehouses } } },
      {
        $group: {
          _id: { wh: "$คลังสินค้า", pg: "$กลุ่มสินค้า", ym: "$year_month" },
          recv: { $sum: { $multiply: [{ $ifNull: ["$รับ", 0] }, { $ifNull: ["$ราคาทุน", 0] }] } },
          issue: { $sum: { $multiply: [{ $ifNull: ["$จ่าย", 0] }, { $ifNull: ["$ราคาทุน", 0] }] } },
          first5: FIRST_N_NET_EXPR,
        },
      },
    ])
    .toArray()

  const monthSet = new Set<string>()
  // data[whGroupKey][pg][ym] = {recv, issue, first5}
  const whToGroup: Record<string, GroupKey> = {}
  for (const cfg of GROUPS) for (const w of cfg.warehouses) whToGroup[w] = cfg.key

  const data: Record<string, Record<string, Record<string, { recv: number; issue: number; first5: number }>>> = {}
  for (const cfg of GROUPS) data[cfg.key] = {}

  for (const r of agg) {
    const ym = r._id.ym as string | null
    if (!ym) continue
    const gk = whToGroup[r._id.wh as string]
    if (!gk) continue
    const pg = (r._id.pg as string | null)?.trim() || "ไม่ระบุ"
    monthSet.add(ym)
    const bucket = (data[gk][pg] ??= {})
    const cell = (bucket[ym] ??= { recv: 0, issue: 0, first5: 0 })
    cell.recv += r.recv as number
    cell.issue += r.issue as number
    cell.first5 += r.first5 as number
  }
  const months = [...monthSet].sort()
  const displayMonths = months.filter((m) => Number(m.slice(0, 4)) >= KPI_START_YEAR)
  const years = [...new Set(displayMonths.map((m) => Number(m.slice(0, 4))))].sort()

  const groups = GROUPS.map((cfg) => {
    const pgMap = data[cfg.key]
    const productGroups = Object.keys(pgMap).map((pg) => {
      const src = pgMap[pg]
      // end-of-month cumulative net (= ณ วันที่ 1 ของเดือนถัดไป)
      let run = 0
      const end: Record<string, number> = {}
      for (const ym of months) {
        const c = src[ym]
        run += (c?.recv ?? 0) - (c?.issue ?? 0)
        end[ym] = run
      }
      // ปรับเป็น ณ วันที่ SNAPSHOT_DAY ของเดือนถัดไป: + net วันที่ 1–5 ของเดือนถัดไป
      const cells: Record<string, BreakdownCell> = {}
      for (const ym of displayMonths) {
        const c = src[ym]
        cells[ym] = { recv: c?.recv ?? 0, issue: c?.issue ?? 0, balance: end[ym] + (src[nextYm(ym)]?.first5 ?? 0) }
      }
      return { name: pg, cells }
    })
    return { key: cfg.key, months: displayMonths, productGroups }
  })

  return { years, groups }
}
