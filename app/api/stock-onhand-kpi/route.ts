import { NextResponse } from "next/server"
import { buildPivot } from "@/lib/stock-onhand-kpi"

export const maxDuration = 60

// GET /api/stock-onhand-kpi → pivot ต่อปี (running balance + grade + score รายเดือน)
export async function GET() {
  try {
    const data = await buildPivot()
    return NextResponse.json({ success: true, ...data })
  } catch (e) {
    console.error("[stock-onhand-kpi]", e)
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}
