import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"
import { DEFAULT_VS_TEMPLATE, DEFAULT_GARAGE_TEMPLATE } from "@/lib/repair-daily"
import type { DailyTemplate } from "@/lib/repair-daily"

export async function GET() {
  try {
    const client = await clientPromise
    const col = client.db("atms").collection<DailyTemplate>("repair_daily_templates")

    let vsDoc = await col.findOne({ type: "vs" })
    let garageDoc = await col.findOne({ type: "garage" })

    const now = new Date()
    if (!vsDoc) {
      await col.insertOne({ type: "vs", template_text: DEFAULT_VS_TEMPLATE, updated_at: now })
      vsDoc = await col.findOne({ type: "vs" })
    }
    if (!garageDoc) {
      await col.insertOne({ type: "garage", template_text: DEFAULT_GARAGE_TEMPLATE, updated_at: now })
      garageDoc = await col.findOne({ type: "garage" })
    }

    return NextResponse.json({ success: true, vs: vsDoc?.template_text || DEFAULT_VS_TEMPLATE, garage: garageDoc?.template_text || DEFAULT_GARAGE_TEMPLATE })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { type, template_text }: { type: "vs" | "garage"; template_text: string } = await req.json()
    if (!type || !template_text) {
      return NextResponse.json({ success: false, error: "type and template_text required" }, { status: 400 })
    }

    const client = await clientPromise
    const col = client.db("atms").collection("repair_daily_templates")

    await col.updateOne(
      { type },
      { $set: { template_text, updated_at: new Date() } },
      { upsert: true }
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
