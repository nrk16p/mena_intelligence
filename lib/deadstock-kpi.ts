// KPI: มูลค่าสินค้าคงคลังที่จัดเก็บ >12 เดือน (Dead Stock) ไม่เกิน 2% ของยอดควบคุม
// นิยาม (proxy จาก movement): ยังมีคงเหลือ (net on-hand > 0) แต่ "ไม่มีการเคลื่อนไหว
//   (ไม่มีรับ/จ่าย) เป็นเวลา >= 12 เดือน" ณ สิ้นเดือนที่วัด → นับเป็น dead stock
// หมายเหตุ: stockmovement ไม่มี opening stock ก่อน 2023/อายุ lot จริง → ค่าเป็นตัวประมาณ
import clientPromise from "@/lib/mongo"

export const DB = "atms"
export const COLL = "stockmovement_v5"
export const DS_WEIGHT = 3
export const DS_KPI_START_YEAR = 2025
export const DS_GAP_MONTHS = 12

export type DsCenter = "ศลบ." | "สสบ."

export type DsConfig = {
  key: DsCenter
  label: string
  warehouses: string[]
  target: number
  grade4: number // ≤ = เกรด 4 (ดีสุด)
  grade3: number // ≤ = เกรด 3 (เป้า)
  grade2: number // ≤ = เกรด 2 ; มากกว่านี้ = 0 (ตก)
}

export const DS_CENTERS: DsConfig[] = [
  { key: "ศลบ.", label: "มูลค่าสินค้าคงคลัง >12 เดือน — ศลบ. (ไม่เกิน 2% ของยอดควบคุม)", warehouses: ["คลังลาดกระบัง", "คลังขอนแก่น"], target: 13_000, grade4: 10_000, grade3: 13_000, grade2: 15_000 },
  { key: "สสบ.", label: "มูลค่าสินค้าคงคลัง >12 เดือน — สสบ. (ไม่เกิน 2% ของยอดควบคุม)", warehouses: ["คลังสระบุรี", "คลัง DIST"], target: 3_600, grade4: 2_500, grade3: 3_600, grade2: 4_500 },
]

export function dsGrade(cfg: DsConfig, value: number): number {
  if (value <= cfg.grade4) return 4
  if (value <= cfg.grade3) return 3
  if (value <= cfg.grade2) return 2
  return 0 // เกินเกรด 2 = ตก, 0 คะแนน
}

export const dsScore = (grade: number) => grade * DS_WEIGHT // เต็ม 12

export type DsMonthRow = { ym: string; value: number; grade: number; score: number }
export type DsResult = {
  years: number[]
  centers: {
    key: DsCenter
    label: string
    target: number
    bands: { grade4: number; grade3: number; grade2: number }
    warehouses: string[]
    months: DsMonthRow[] // ตั้งแต่ DS_KPI_START_YEAR เรียงตามเดือน
  }[]
}

const ymIdx = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return y * 12 + m
}

/** คำนวณ dead stock รายเดือน ต่อศูนย์ (ยังคงเหลือ แต่ไม่เคลื่อนไหว >=12 เดือน) */
export async function buildDeadstock(): Promise<DsResult> {
  const client = await clientPromise
  const col = client.db(DB).collection(COLL)
  const whToCenter: Record<string, DsCenter> = {}
  for (const c of DS_CENTERS) for (const w of c.warehouses) whToCenter[w] = c.key
  const warehouses = Object.keys(whToCenter)

  const agg = await col
    .aggregate(
      [
        { $match: { คลังสินค้า: { $in: warehouses }, year_month: { $ne: null } } },
        {
          $group: {
            _id: { wh: "$คลังสินค้า", item: "$รหัสสินค้า", ym: "$year_month" },
            netval: {
              $sum: {
                $subtract: [
                  { $multiply: [{ $ifNull: ["$รับ", 0] }, { $ifNull: ["$ราคาทุน", 0] }] },
                  { $multiply: [{ $ifNull: ["$จ่าย", 0] }, { $ifNull: ["$ราคาทุน", 0] }] },
                ],
              },
            },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray()

  // series ต่อ (center|item): [{idx, net}] เรียงตามเดือน
  const series = new Map<string, { idx: number; net: number }[]>()
  const monthsSet = new Set<string>()
  for (const r of agg) {
    const center = whToCenter[r._id.wh as string]
    const ym = r._id.ym as string
    if (!center || !ym) continue
    monthsSet.add(ym)
    const key = `${center}|${r._id.item}`
    let arr = series.get(key)
    if (!arr) series.set(key, (arr = []))
    arr.push({ idx: ymIdx(ym), net: r.netval as number })
  }
  for (const arr of series.values()) arr.sort((a, b) => a.idx - b.idx)

  const months = [...monthsSet].sort()
  const displayMonths = months.filter((m) => Number(m.slice(0, 4)) >= DS_KPI_START_YEAR)
  const dispIdx = displayMonths.map(ymIdx)

  const totals: Record<DsCenter, number[]> = { "ศลบ.": dispIdx.map(() => 0), "สสบ.": dispIdx.map(() => 0) }
  for (const [key, arr] of series) {
    const center = key.slice(0, key.indexOf("|")) as DsCenter
    for (let i = 0; i < dispIdx.length; i++) {
      const dm = dispIdx[i]
      let onhand = 0
      let lastMove = -1
      for (const e of arr) {
        if (e.idx > dm) break
        onhand += e.net
        if (e.idx > lastMove) lastMove = e.idx
      }
      // ยังมีของ แต่เคลื่อนไหวล่าสุด >= 12 เดือนก่อนหน้า
      if (onhand > 0 && lastMove >= 0 && lastMove <= dm - DS_GAP_MONTHS) totals[center][i] += onhand
    }
  }

  const centers = DS_CENTERS.map((cfg) => ({
    key: cfg.key,
    label: cfg.label,
    target: cfg.target,
    bands: { grade4: cfg.grade4, grade3: cfg.grade3, grade2: cfg.grade2 },
    warehouses: cfg.warehouses,
    months: displayMonths.map((ym, i) => {
      const value = Math.round(totals[cfg.key][i])
      const grade = dsGrade(cfg, value)
      return { ym, value, grade, score: dsScore(grade) }
    }),
  }))
  const years = [...new Set(displayMonths.map((m) => Number(m.slice(0, 4))))].sort()
  return { years, centers }
}

// ─── breakdown dead stock ตามกลุ่มสินค้า ─────────────────────────────────────
export type DsBreakdownResult = {
  years: number[]
  centers: { key: DsCenter; months: string[]; productGroups: { name: string; cells: Record<string, number> }[] }[]
}

/** แตกยอด dead stock รายเดือน ว่ามาจากกลุ่มสินค้าใด (attribute ต่อ pg ของ movement ล่าสุดของ item) */
export async function buildDeadstockBreakdown(): Promise<DsBreakdownResult> {
  const client = await clientPromise
  const col = client.db(DB).collection(COLL)
  const whToCenter: Record<string, DsCenter> = {}
  for (const c of DS_CENTERS) for (const w of c.warehouses) whToCenter[w] = c.key
  const warehouses = Object.keys(whToCenter)

  const agg = await col
    .aggregate(
      [
        { $match: { คลังสินค้า: { $in: warehouses }, year_month: { $ne: null } } },
        {
          $group: {
            _id: { wh: "$คลังสินค้า", item: "$รหัสสินค้า", pg: "$กลุ่มสินค้า", ym: "$year_month" },
            netval: {
              $sum: {
                $subtract: [
                  { $multiply: [{ $ifNull: ["$รับ", 0] }, { $ifNull: ["$ราคาทุน", 0] }] },
                  { $multiply: [{ $ifNull: ["$จ่าย", 0] }, { $ifNull: ["$ราคาทุน", 0] }] },
                ],
              },
            },
          },
        },
      ],
      { allowDiskUse: true }
    )
    .toArray()

  const netByItemYm = new Map<string, Map<number, number>>() // center|item -> (idx -> net)
  const itemLatest = new Map<string, { idx: number; pg: string }>() // center|item -> latest movement pg
  const monthsSet = new Set<string>()
  for (const r of agg) {
    const center = whToCenter[r._id.wh as string]
    const ym = r._id.ym as string
    if (!center || !ym) continue
    monthsSet.add(ym)
    const idx = ymIdx(ym)
    const pg = ((r._id.pg as string | null)?.trim() || "ไม่ระบุ") as string
    const key = `${center}|${r._id.item}`
    let mm = netByItemYm.get(key)
    if (!mm) netByItemYm.set(key, (mm = new Map()))
    mm.set(idx, (mm.get(idx) ?? 0) + (r.netval as number))
    const cur = itemLatest.get(key)
    if (!cur || idx > cur.idx) itemLatest.set(key, { idx, pg })
  }
  const months = [...monthsSet].sort()
  const displayMonths = months.filter((m) => Number(m.slice(0, 4)) >= DS_KPI_START_YEAR)
  const dispIdx = displayMonths.map(ymIdx)

  const bd: Record<DsCenter, Map<string, number[]>> = { "ศลบ.": new Map(), "สสบ.": new Map() }
  for (const [key, mm] of netByItemYm) {
    const center = key.slice(0, key.indexOf("|")) as DsCenter
    const pg = itemLatest.get(key)!.pg
    const entries = [...mm.entries()].sort((a, b) => a[0] - b[0])
    for (let i = 0; i < dispIdx.length; i++) {
      const dm = dispIdx[i]
      let onhand = 0
      let lastMove = -1
      for (const [idx, net] of entries) {
        if (idx > dm) break
        onhand += net
        if (idx > lastMove) lastMove = idx
      }
      if (onhand > 0 && lastMove >= 0 && lastMove <= dm - DS_GAP_MONTHS) {
        let arr = bd[center].get(pg)
        if (!arr) bd[center].set(pg, (arr = dispIdx.map(() => 0)))
        arr[i] += onhand
      }
    }
  }

  const centers = DS_CENTERS.map((cfg) => ({
    key: cfg.key,
    months: displayMonths,
    productGroups: [...bd[cfg.key].entries()].map(([name, arr]) => ({
      name,
      cells: Object.fromEntries(displayMonths.map((ym, i) => [ym, Math.round(arr[i])])),
    })),
  }))
  const years = [...new Set(displayMonths.map((m) => Number(m.slice(0, 4))))].sort()
  return { years, centers }
}
