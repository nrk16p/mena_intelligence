import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { escapeRegex, getAvailableMonths, groupFilter, isValidMonth, SNAPSHOT_COLLECTION } from "@/lib/price-benchmark"

export const maxDuration = 30

const LIMIT = 20

/**
 * Autocomplete source for รหัสสินค้า + ชื่อสินค้า (Lookup tab).
 * Reads the (small) benchmark snapshot — never the raw 435k receipts — and
 * drops fuel. Falls back to the latest available snapshot month if the
 * requested month has none yet.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim() ?? ""
    let month = searchParams.get("month")

    const client = await clientPromise
    const col = client.db("atms").collection(SNAPSHOT_COLLECTION)

    if (!isValidMonth(month) || (await col.countDocuments({ snapshot_month: month }, { limit: 1 })) === 0) {
      month = (await getAvailableMonths()).max
    }
    if (!month) return NextResponse.json({ success: true, data: [] })

    const match: Record<string, unknown> = { snapshot_month: month, กลุ่มสินค้า: groupFilter() }
    if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" }
      match["$or"] = [{ รหัสสินค้า: rx }, { ชื่อสินค้า: rx }]
    }

    const rows = await col.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$รหัสสินค้า",
          name:  { $last: "$ชื่อสินค้า" },
          group: { $last: "$กลุ่มสินค้า" },
          spend: { $sum: "$total_cost" },
        },
      },
      { $sort: { spend: -1 } },
      { $limit: LIMIT },
      { $project: { _id: 0, code: "$_id", name: 1, group: 1 } },
    ]).toArray()

    return NextResponse.json({ success: true, month, data: rows })
  } catch (error: any) {
    console.error("price-benchmark/products API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
