import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"
import type { GarageRecord } from "@/lib/repair-daily"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const client = await clientPromise
    const col = client.db("atms").collection<GarageRecord>("repair_daily_garage")

    const filter: Record<string, unknown> = {}
    if (from || to) {
      filter.date = {}
      if (from) (filter.date as Record<string, string>)["$gte"] = from
      if (to) (filter.date as Record<string, string>)["$lte"] = to
    }

    const data = await col.find(filter, { projection: { _id: 0 } }).sort({ date: -1 }).toArray()
    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body: GarageRecord = await req.json()
    if (!body.date) return NextResponse.json({ success: false, error: "date required" }, { status: 400 })

    const client = await clientPromise
    const col = client.db("atms").collection("repair_daily_garage")

    const now = new Date()
    await col.updateOne(
      { date: body.date },
      { $set: { ...body, updated_at: now }, $setOnInsert: { created_at: now } },
      { upsert: true }
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
