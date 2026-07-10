import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { ensureSnapshot, escapeRegex, getContractMap, groupFilter, isValidMonth, SNAPSHOT_COLLECTION } from "@/lib/price-benchmark"

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
    // `groups` = comma-separated exact group names (multi-select); legacy `group` still accepted
    const groups      = (searchParams.get("groups") ?? searchParams.get("group") ?? "")
      .split(",").map(s => s.trim()).filter(Boolean)

    if (!isValidMonth(month)) {
      return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 })
    }
    if (!productCode && !supplier && groups.length === 0) {
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
    // always constrain กลุ่มสินค้า so fuel is dropped even when no group is selected
    match["กลุ่มสินค้า"] = groupFilter(groups)

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

    // Overlay negotiated contract prices in effect for this month (per สินค้า×ซัพพลายเออร์)
    const contractMap = await getContractMap(month, codes)
    const data = rows.map(r => {
      const c = contractMap.get(`${r.รหัสสินค้า}||${r.ซัพพลายเออร์}`)
      return c
        ? {
            ...r,
            contract_price: c.contract_price,
            contract_effective_start: c.effective_start,
            contract_effective_end: c.effective_end,
          }
        : r
    })

    const totalProducts = (await col.distinct("รหัสสินค้า", match)).length

    return NextResponse.json({
      success: true,
      month,
      snapshot,
      total_products: totalProducts,
      truncated: totalProducts > MAX_PRODUCTS,
      data,
    })
  } catch (error: any) {
    console.error("price-benchmark/lookup API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
