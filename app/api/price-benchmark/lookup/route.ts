import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { computeBenchmarkForCode, ensureSnapshot, escapeRegex, getContractMap, getDataStart, groupFilter, isValidMonth, SNAPSHOT_COLLECTION, WINDOW_MONTHS, type BenchmarkDoc } from "@/lib/price-benchmark"

export const maxDuration = 60

const MAX_PRODUCTS = 50

/**
 * ราคากลาง lookup for the procurement team.
 * Lazily generates the month's snapshot on first call.
 *
 * Fallback: when a รหัสสินค้า search finds nothing in the 12-month snapshot (the
 * item exists but has not been received for over a year), the benchmark is
 * recomputed live over the FULL history so the user still gets a reference
 * price instead of a dead end. Flagged `fallback: true` in the response.
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

    let rows = await col
      .find({ ...match, รหัสสินค้า: { $in: codes } }, { projection: { _id: 0 } })
      .sort({ total_cost: -1 })
      .toArray()

    // ── Long-window fallback ──────────────────────────────────────────────────
    // Only for a code search: an unscoped long-window aggregation would be
    // unbounded. Supplier/group browsing keeps the strict 12-month semantics.
    let fallback: { window_start: string; window_end: string; window_months: number } | null = null
    if (rows.length === 0 && productCode) {
      const dataStart = await getDataStart()
      const docs = await computeBenchmarkForCode(productCode, month, dataStart, groups)
      if (docs.length > 0) {
        // same "top products by spend, then every supplier row for them" shape
        const spend = new Map<string, number>()
        for (const d of docs) spend.set(d.รหัสสินค้า, (spend.get(d.รหัสสินค้า) ?? 0) + d.total_cost)
        const keep = new Set(
          [...spend.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_PRODUCTS).map(([c]) => c)
        )
        rows = docs
          .filter(d => keep.has(d.รหัสสินค้า))
          .sort((a, b) => b.total_cost - a.total_cost) as unknown as typeof rows
        codes.push(...keep)
        fallback = {
          window_start: dataStart,
          window_end:   month,
          window_months: WINDOW_MONTHS,
        }
      }
    }

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

    const totalProducts = fallback
      ? new Set(rows.map(r => (r as unknown as BenchmarkDoc).รหัสสินค้า)).size
      : (await col.distinct("รหัสสินค้า", match)).length

    return NextResponse.json({
      success: true,
      month,
      snapshot,
      total_products: totalProducts,
      truncated: totalProducts > MAX_PRODUCTS,
      fallback,
      data,
    })
  } catch (error: any) {
    console.error("price-benchmark/lookup API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
