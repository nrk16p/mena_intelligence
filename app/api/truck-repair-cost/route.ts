import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"

// แถวละ ทะเบียน × ปีปฏิทิน (~3.5k แถว) คำนวณไว้ล่วงหน้าโดย mr_wd_repair/truck_repair_cost/build.py
// หน้าเว็บรวมยอดเองตามตัวกรอง: ค่าต่อคันต่อปี = Σcost ÷ Σmonths × 12
export async function GET() {
  try {
    const client = await clientPromise
    const rows = await client
      .db("analytics")
      .collection("truck_repair_cost")
      .find(
        {},
        {
          projection: {
            _id: 0, plate: 1, year: 1, cost: 1, months: 1, vehicle_type: 1, model_year: 1,
            ownership: 1, fleet_no: 1, brand: 1, warehouse: 1, is_trailer: 1, data_through: 1,
          },
        },
      )
      .maxTimeMS(15000)
      .toArray()
    return NextResponse.json({ success: true, count: rows.length, data_through: rows[0]?.data_through ?? null, data: rows })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error"
    console.error("truck-repair-cost API error:", error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
