import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

// Note: DB value is "PM ความเเย็น" (สระเอ 2 ตัว) — not "PM ความเย็น"
const PM_PURPOSES = ["PM ความเเย็น", "PM น้ำมันเครื่อง", "PM ช่วงล่าง"]

// Line-level PM cost: month × item × warehouse × partner_flag, joined to
// pm_item_mapping so every row carries its PM1/PM2/PM3 class (null = unmapped).
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const email = session?.user?.email ?? null
    if (!email) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    const { allowedGroups } = await getUserPermissions(email)
    if (!allowedGroups.includes("ops")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")   // YYYY-MM
    const end   = searchParams.get("end")     // YYYY-MM

    const match: Record<string, any> = { "จุดประสงค์ในการเบิก": { $in: PM_PURPOSES } }
    if (start && end)   match.month_year = { $gte: start, $lte: end }
    else if (start)     match.month_year = { $gte: start }
    else if (end)       match.month_year = { $lte: end }

    const client = await clientPromise
    const col    = client.db("datawarehouse").collection("dw_stockmovement")

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            month_year:   "$month_year",
            รหัสสินค้า:   "$รหัสสินค้า",
            warehouse:    "$คลังสินค้า",
            partner_flag: "$partner_flag",
            plate:        "$ทะเบียน",
          },
          ชื่อสินค้า:   { $first: "$ชื่อสินค้า" },
          กลุ่มสินค้า:  { $first: "$กลุ่มสินค้า" },
          total_cost:   { $sum: "$total_cost" },
          qty:          { $sum: "$actual_issue" },
          records:      { $sum: 1 },
        },
      },
      {
        $lookup: {
          from:         "pm_item_mapping",
          localField:   "_id.รหัสสินค้า",
          foreignField: "รหัสสินค้า",
          as:           "map",
        },
      },
      {
        $project: {
          _id:          0,
          month_year:   "$_id.month_year",
          รหัสสินค้า:   "$_id.รหัสสินค้า",
          warehouse:    "$_id.warehouse",
          partner_flag: "$_id.partner_flag",
          plate:        "$_id.plate",
          ชื่อสินค้า:   1,
          กลุ่มสินค้า:  1,
          total_cost:   1,
          qty:          1,
          records:      1,
          pm_class:     { $ifNull: [{ $arrayElemAt: ["$map.pm_class", 0] }, null] },
        },
      },
      { $sort: { month_year: 1 as const } },
    ]

    const data = await col.aggregate(pipeline).toArray()

    return NextResponse.json({ success: true, count: data.length, data })
  } catch (error: any) {
    console.error("pm-cost API error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
