import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { ensureSnapshot, escapeRegex, isValidMonth, receiptMatch, SNAPSHOT_COLLECTION } from "@/lib/price-benchmark"

export const maxDuration = 60

const MAX_ROWS = 500

/**
 * รายงานรายการซื้อที่แพงกว่าราคากลาง:
 * joins the month's actual receipts against the same month's benchmark snapshot
 * and flags every row where ราคาทุน > benchmark_price (no tolerance).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const month       = searchParams.get("month")
    const productCode = searchParams.get("product_code")?.trim()
    const supplier    = searchParams.get("supplier")?.trim()
    const group       = searchParams.get("group")?.trim()

    if (!isValidMonth(month)) {
      return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 })
    }

    await ensureSnapshot(month)

    const client = await clientPromise
    const db = client.db("atms")

    // 1) Benchmark map for the month
    const benchMatch: Record<string, unknown> = { snapshot_month: month }
    if (group) benchMatch["กลุ่มสินค้า"] = { $regex: escapeRegex(group), $options: "i" }
    const benchRows = await db.collection(SNAPSHOT_COLLECTION)
      .find(benchMatch, { projection: { _id: 0, รหัสสินค้า: 1, ซัพพลายเออร์: 1, benchmark_price: 1, benchmark_count: 1, total_records: 1 } })
      .toArray()
    const bench = new Map<string, { price: number; count: number; records: number }>()
    for (const b of benchRows) {
      bench.set(`${b.รหัสสินค้า}||${b.ซัพพลายเออร์}`, {
        price: b.benchmark_price, count: b.benchmark_count, records: b.total_records,
      })
    }

    // 2) Actual receipts for the month
    const rcptMatch: Record<string, unknown> = receiptMatch({ year_month: month })
    if (productCode) rcptMatch["รหัสสินค้า"] = { $regex: escapeRegex(productCode), $options: "i" }
    if (group)       rcptMatch["กลุ่มสินค้า"] = { $regex: escapeRegex(group), $options: "i" }

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

    // 3) Join + flag
    type FlaggedRow = Record<string, unknown> & { excess_total: number }
    const flagged: FlaggedRow[] = []
    let checked = 0
    let noBenchmark = 0
    const flaggedProducts = new Set<string>()
    const flaggedSuppliers = new Set<string>()
    let excessSum = 0

    for (const r of receipts) {
      const price = r.ราคาทุน
      if (price === null || price === undefined || !Number.isFinite(price)) continue
      checked++
      const b = bench.get(`${r.รหัสสินค้า}||${r.ซัพพลายเออร์}`)
      if (!b) { noBenchmark++; continue }
      if (price > b.price) {
        const qty = Number.isFinite(r.รับ) ? r.รับ : 0
        const excess = (price - b.price) * qty
        excessSum += excess
        flaggedProducts.add(r.รหัสสินค้า)
        flaggedSuppliers.add(r.ซัพพลายเออร์)
        flagged.push({
          ...r,
          benchmark_price: b.price,
          benchmark_count: b.count,
          benchmark_records: b.records,
          diff: price - b.price,
          diff_pct: b.price > 0 ? ((price - b.price) / b.price) * 100 : null,
          excess_total: excess,
        })
      }
    }

    flagged.sort((a, b) => b.excess_total - a.excess_total)

    return NextResponse.json({
      success: true,
      month,
      summary: {
        receipts_checked: checked,
        flagged_count: flagged.length,
        flagged_products: flaggedProducts.size,
        flagged_suppliers: flaggedSuppliers.size,
        excess_total: excessSum,
        no_benchmark_count: noBenchmark,
      },
      truncated: flagged.length > MAX_ROWS,
      data: flagged.slice(0, MAX_ROWS),
    })
  } catch (error: any) {
    console.error("price-benchmark/overpriced API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
