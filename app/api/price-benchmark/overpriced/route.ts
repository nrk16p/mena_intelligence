import { NextResponse } from "next/server"
import type { Db } from "mongodb"
import clientPromise from "@/lib/mongo"
import { ensureSnapshot, escapeRegex, groupFilter, isValidMonth, receiptMatch, SNAPSHOT_COLLECTION } from "@/lib/price-benchmark"

export const maxDuration = 300

const MAX_ROWS   = 500
const MAX_MONTHS = 12

/** List the YYYY-MM months from start..end inclusive (empty if invalid/reversed). */
function monthRange(start: string, end: string): string[] {
  const [sy, sm] = start.split("-").map(Number)
  const [ey, em] = end.split("-").map(Number)
  const out: string[] = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

type FlaggedRow = Record<string, unknown> & { excess_total: number }

/** Flag every receipt in `month` where ราคาทุน > benchmark_price (no tolerance). */
async function scanMonth(
  db: Db,
  month: string,
  productCode: string | undefined,
  supplier: string | undefined,
  groups: string[],
) {
  await ensureSnapshot(month)

  // 1) Benchmark map for the month (fuel + non-selected groups already dropped)
  const benchMatch: Record<string, unknown> = { snapshot_month: month, กลุ่มสินค้า: groupFilter(groups) }
  const benchRows = await db.collection(SNAPSHOT_COLLECTION)
    .find(benchMatch, { projection: { _id: 0, รหัสสินค้า: 1, ซัพพลายเออร์: 1, benchmark_price: 1, benchmark_count: 1, total_records: 1, iqr_upper: 1 } })
    .toArray()
  const bench = new Map<string, { price: number; count: number; records: number; iqr_upper: number | null }>()
  for (const b of benchRows) {
    bench.set(`${b.รหัสสินค้า}||${b.ซัพพลายเออร์}`, {
      price: b.benchmark_price, count: b.benchmark_count, records: b.total_records,
      iqr_upper: b.iqr_upper ?? null,
    })
  }

  // 2) Actual receipts for the month (fuel/group filter applied on กลุ่มสินค้า)
  const rcptMatch: Record<string, unknown> = receiptMatch({ year_month: month, กลุ่มสินค้า: groupFilter(groups) })
  if (productCode) rcptMatch["รหัสสินค้า"] = { $regex: escapeRegex(productCode), $options: "i" }

  const receipts = await db.collection("stockmovement_v5").aggregate([
    { $match: rcptMatch },
    {
      $addFields: {
        ซัพพลายเออร์: {
          $cond: {
            if:   { $or: [{ $eq: ["$ซัพพลายเออร์", null] }, { $eq: ["$ซัพพลายเออร์", ""] }] },
            then: "ไม่ระบุ",
            else: "$ซัพพลายเออร์",
          },
        },
      },
    },
    ...(supplier ? [{ $match: { ซัพพลายเออร์: { $regex: escapeRegex(supplier), $options: "i" } } }] : []),
    {
      $project: {
        _id: 0,
        วันที่: 1, PO: 1, PR: 1,
        รหัสสินค้า: 1, ชื่อสินค้า: 1, กลุ่มสินค้า: 1,
        ซัพพลายเออร์: 1, คลังสินค้า: 1,
        รับ: 1, ราคาทุน: 1, ยอดเงิน: 1,
      },
    },
  ]).toArray()

  // 3) Join + classify — keep EVERY receipt that has a benchmark to compare
  //    against (over or not), tagged with a status so the UI can colour it.
  const rows: FlaggedRow[] = []
  let checked = 0
  let noBenchmark = 0
  let overCount = 0
  let excessSum = 0
  let criticalCount = 0
  const flaggedProducts = new Set<string>()
  const flaggedSuppliers = new Set<string>()

  for (const r of receipts) {
    const price = r.ราคาทุน
    if (price === null || price === undefined || !Number.isFinite(price)) continue
    checked++
    const b = bench.get(`${r.รหัสสินค้า}||${r.ซัพพลายเออร์}`)
    if (!b) { noBenchmark++; continue }
    const over = price > b.price
    const critical = over && b.iqr_upper !== null && price > b.iqr_upper
    const qty = Number.isFinite(r.รับ) ? r.รับ : 0
    const excess = over ? (price - b.price) * qty : 0
    if (over) {
      overCount++
      excessSum += excess
      if (critical) criticalCount++
      flaggedProducts.add(r.รหัสสินค้า)
      flaggedSuppliers.add(r.ซัพพลายเออร์)
    }
    rows.push({
      ...r,
      year_month: month,
      benchmark_price: b.price,
      benchmark_count: b.count,
      benchmark_records: b.records,
      iqr_upper: b.iqr_upper,
      status: critical ? "critical" : over ? "warning" : "ok",
      diff: price - b.price,
      diff_pct: b.price > 0 ? ((price - b.price) / b.price) * 100 : null,
      excess_total: excess,
    })
  }

  return { rows, checked, noBenchmark, overCount, excessSum, criticalCount, flaggedProducts, flaggedSuppliers }
}

/**
 * รายงานรายการซื้อที่แพงกว่าราคากลาง across a month range (start..end, ≤12 months).
 * Each receipt is compared to its own month's benchmark snapshot.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const monthParam  = searchParams.get("month")
    const start       = searchParams.get("start") || monthParam
    const end         = searchParams.get("end")   || monthParam
    const productCode = searchParams.get("product_code")?.trim() || undefined
    const supplier    = searchParams.get("supplier")?.trim() || undefined
    const groups      = (searchParams.get("groups") ?? searchParams.get("group") ?? "")
      .split(",").map(s => s.trim()).filter(Boolean)

    if (!isValidMonth(start) || !isValidMonth(end)) {
      return NextResponse.json({ success: false, error: "start/end must be YYYY-MM" }, { status: 400 })
    }
    if (start > end) {
      return NextResponse.json({ success: false, error: "เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด" }, { status: 400 })
    }
    const months = monthRange(start, end)
    if (months.length > MAX_MONTHS) {
      return NextResponse.json(
        { success: false, error: `ช่วงเดือนกว้างเกินไป — เลือกได้ไม่เกิน ${MAX_MONTHS} เดือน` },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("atms")

    const all: FlaggedRow[] = []
    const summary = {
      receipts_checked: 0, flagged_count: 0,
      flagged_products: 0, flagged_suppliers: 0,
      excess_total: 0, critical_count: 0, no_benchmark_count: 0,
    }
    const allProducts = new Set<string>()
    const allSuppliers = new Set<string>()

    // Sequential: each month may lazily build a heavy snapshot
    for (const m of months) {
      const r = await scanMonth(db, m, productCode, supplier, groups)
      all.push(...r.rows)
      summary.receipts_checked   += r.checked
      summary.flagged_count      += r.overCount
      summary.excess_total       += r.excessSum
      summary.critical_count     += r.criticalCount
      summary.no_benchmark_count += r.noBenchmark
      r.flaggedProducts.forEach(p => allProducts.add(p))
      r.flaggedSuppliers.forEach(s => allSuppliers.add(s))
    }

    // Over-benchmark rows first (by excess desc), then the rest (by ราคาทุน desc)
    const rank = (x: FlaggedRow) => (x.status === "ok" ? 1 : 0)
    all.sort((a, b) =>
      rank(a) - rank(b)
      || b.excess_total - a.excess_total
      || (Number(b.ราคาทุน) || 0) - (Number(a.ราคาทุน) || 0)
    )
    summary.flagged_products  = allProducts.size
    summary.flagged_suppliers = allSuppliers.size

    return NextResponse.json({
      success: true,
      start, end,
      months,
      summary,
      total_rows: all.length,
      truncated: all.length > MAX_ROWS,
      data: all.slice(0, MAX_ROWS),
    })
  } catch (error: any) {
    console.error("price-benchmark/overpriced API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
