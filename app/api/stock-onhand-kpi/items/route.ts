import { NextResponse } from "next/server"
import { buildItemBreakdown } from "@/lib/stock-onhand-kpi"

export const maxDuration = 60

// GET /api/stock-onhand-kpi/items → คงเหลือรายเดือน ต่อรหัสสินค้า ต่อกลุ่มคลัง
export async function GET() {
  try {
    const data = await buildItemBreakdown()
    return NextResponse.json({ success: true, ...data })
  } catch (e) {
    console.error("[stock-onhand-kpi/items]", e)
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}
