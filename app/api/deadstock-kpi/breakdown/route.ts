import { NextResponse } from "next/server"
import { buildDeadstockBreakdown } from "@/lib/deadstock-kpi"

export const maxDuration = 60

// GET /api/deadstock-kpi/breakdown → dead stock แตกตามกลุ่มสินค้า × เดือน ต่อศูนย์
export async function GET() {
  try {
    const data = await buildDeadstockBreakdown()
    return NextResponse.json({ success: true, ...data })
  } catch (e) {
    console.error("[deadstock-kpi/breakdown]", e)
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}
