import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const startYear = searchParams.get("startYear") || String(new Date().getFullYear() - 2)
    const endYear   = searchParams.get("endYear")   || String(new Date().getFullYear())
    const supplier  = searchParams.get("supplier")
    const warehouse = searchParams.get("warehouse")

    const client = await clientPromise
    const col    = client.db("atms").collection("stockmovement_v5")

    const match: Record<string, any> = {
      รับ:        { $gt: 0 },
      WD:         { $in: [null, ""] },
      year_month: { $gte: `${startYear}-01`, $lte: `${endYear}-12` },
    }

    if (supplier) {
      const list = supplier.split(",").map(s => s.trim()).filter(Boolean)
      match["ซัพพลายเออร์"] = list.length === 1 ? list[0] : { $in: list }
    }
    if (warehouse) match["คลังสินค้า"]   = warehouse

    const pipeline = [
      { $match: match },

      // Normalise nulls + extract year
      {
        $addFields: {
          ซัพพลายเออร์: {
            $cond: {
              if:   { $or: [{ $eq: ["$ซัพพลายเออร์", null] }, { $eq: ["$ซัพพลายเออร์", ""] }] },
              then: "ไม่ระบุ",
              else: "$ซัพพลายเออร์",
            },
          },
          กลุ่มสินค้า: {
            $cond: {
              if:   { $or: [{ $eq: ["$กลุ่มสินค้า", null] }, { $eq: ["$กลุ่มสินค้า", ""] }] },
              then: "ไม่ระบุกลุ่ม",
              else: "$กลุ่มสินค้า",
            },
          },
          year: { $substr: ["$year_month", 0, 4] },
        },
      },

      // Group: supplier × group × product × year
      {
        $group: {
          _id: {
            ซัพพลายเออร์: "$ซัพพลายเออร์",
            กลุ่มสินค้า:  "$กลุ่มสินค้า",
            รหัสสินค้า:   "$รหัสสินค้า",
            year:         "$year",
          },
          ชื่อสินค้า:    { $first: "$ชื่อสินค้า" },
          total_cost:    { $sum: "$ยอดเงิน" },
          total_qty:     { $sum: "$รับ" },
          total_records: { $sum: 1 },
        },
      },

      {
        $project: {
          _id:           0,
          ซัพพลายเออร์:  "$_id.ซัพพลายเออร์",
          กลุ่มสินค้า:   "$_id.กลุ่มสินค้า",
          รหัสสินค้า:    "$_id.รหัสสินค้า",
          year:          "$_id.year",
          ชื่อสินค้า:    1,
          total_cost:    1,
          total_qty:     1,
          total_records: 1,
        },
      },

      { $sort: { ซัพพลายเออร์: 1, กลุ่มสินค้า: 1, รหัสสินค้า: 1, year: 1 } },
    ]

    const data = await col.aggregate(pipeline).toArray()
    return NextResponse.json({ success: true, count: data.length, data })
  } catch (error: any) {
    console.error("supplier-analysis error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
