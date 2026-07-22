import { NextResponse } from "next/server"
import { buildDeadstock } from "@/lib/deadstock-kpi"

export const maxDuration = 60

// GET /api/deadstock-kpi → dead stock (>12 เดือน) รายเดือน ต่อศูนย์ + เกรด/คะแนน
export async function GET() {
  try {
    const data = await buildDeadstock()
    return NextResponse.json({ success: true, ...data })
  } catch (e) {
    console.error("[deadstock-kpi]", e)
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}
