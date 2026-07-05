import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { ensureSnapshot, escapeRegex, isValidMonth, SNAPSHOT_COLLECTION } from "@/lib/price-benchmark"

export const maxDuration = 60

const MAX_PRODUCTS = 50

/**
 * ราคากลาง lookup for the procurement team.
 * Lazily generates the month's snapshot on first call.
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
    if (!productCode && !supplier && !group) {
      return NextResponse.json(
        { success: false, error: "ระบุอย่างน้อย 1 เงื่อนไข: product_code, supplier หรือ group" },
        { status: 400 }
      )
    }

    const snapshot = await ensureSnapshot(month)

    const client = await clientPromise
    const col = client.db("atms").collection(SNAPSHOT_COLLECTION)

    const match: Record<string, unknown> = { snapshot_month: month }
    if (productCode) match["รหัสสินค้า"]   = { $regex: escapeRegex(productCode), $options: "i" }
    if (supplier)    match["ซัพพลายเออร์"] = { $regex: escapeRegex(supplier),    $options: "i" }
    if (group)       match["กลุ่มสินค้า"]  = { $regex: escapeRegex(group), $options: "i" }

    // Pick the top product codes by spend, then return every supplier row for them
    const topProducts = await col.aggregate([
      { $match: match },
      { $group: { _id: "$รหัสสินค้า", spend: { $sum: "$total_cost" } } },
      { $sort: { spend: -1 } },
      { $limit: MAX_PRODUCTS },
    ]).toArray()
    const codes = topProducts.map(p => p._id)

    const rows = await col
      .find({ ...match, รหัสสินค้า: { $in: codes } }, { projection: { _id: 0 } })
      .sort({ total_cost: -1 })
      .toArray()

    const totalProducts = (await col.distinct("รหัสสินค้า", match)).length

    return NextResponse.json({
      success: true,
      month,
      snapshot,
      total_products: totalProducts,
      truncated: totalProducts > MAX_PRODUCTS,
      data: rows,
    })
  } catch (error: any) {
    console.error("price-benchmark/lookup API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
