import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { EXCLUDED_GROUPS, getAvailableMonths, isValidMonth, SNAPSHOT_COLLECTION } from "@/lib/price-benchmark"

export const maxDuration = 30

/** Distinct product groups (fuel excluded) for the filter multi-select. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    let month = searchParams.get("month")

    const client = await clientPromise
    const col = client.db("atms").collection(SNAPSHOT_COLLECTION)

    if (!isValidMonth(month) || (await col.countDocuments({ snapshot_month: month }, { limit: 1 })) === 0) {
      month = (await getAvailableMonths()).max
    }

    const groups = month
      ? (await col.distinct("กลุ่มสินค้า", {
          snapshot_month: month,
          กลุ่มสินค้า: { $nin: [null, "", ...EXCLUDED_GROUPS] },
        })).sort((a: string, b: string) => a.localeCompare(b, "th"))
      : []

    return NextResponse.json({ success: true, month, groups })
  } catch (error: any) {
    console.error("price-benchmark/groups API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
