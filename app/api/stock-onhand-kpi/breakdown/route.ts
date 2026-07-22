import { NextResponse } from "next/server"
import { buildBreakdown } from "@/lib/stock-onhand-kpi"

export const maxDuration = 60

// GET /api/stock-onhand-kpi/breakdown → แตกยอด (คงเหลือ/รับ/เบิก) ตามกลุ่มสินค้า × เดือน
export async function GET() {
  try {
    const data = await buildBreakdown()
    return NextResponse.json({ success: true, ...data })
  } catch (e) {
    console.error("[stock-onhand-kpi/breakdown]", e)
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 })
  }
}
