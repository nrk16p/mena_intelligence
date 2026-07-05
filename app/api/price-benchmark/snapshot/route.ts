import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { generateSnapshot, ensureSnapshot, invalidateMonthStats, isValidMonth, SNAPSHOT_COLLECTION } from "@/lib/price-benchmark"

export const maxDuration = 60

/** Generate (or force-regenerate) the ราคากลาง snapshot for a month. */
export async function POST(req: Request) {
  try {
    const body  = await req.json().catch(() => ({}))
    const month = body.month as string | undefined
    const force = body.force !== false // default: regenerate

    if (!isValidMonth(month ?? null)) {
      return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 })
    }

    const result = force ? { generated: true, ...(await generateSnapshot(month!)) } : await ensureSnapshot(month!)
    if (force) await invalidateMonthStats(month!)
    return NextResponse.json({ success: true, month, ...result })
  } catch (error: any) {
    console.error("price-benchmark/snapshot API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}

/** Snapshot status per month (row count + computed_at). */
export async function GET() {
  try {
    const client = await clientPromise
    const col = client.db("atms").collection(SNAPSHOT_COLLECTION)
    const months = await col.aggregate([
      { $group: { _id: "$snapshot_month", row_count: { $sum: 1 }, computed_at: { $max: "$computed_at" } } },
      { $project: { _id: 0, month: "$_id", row_count: 1, computed_at: 1 } },
      { $sort: { month: -1 } },
    ]).toArray()
    return NextResponse.json({ success: true, data: months })
  } catch (error: any) {
    console.error("price-benchmark/snapshot GET error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
