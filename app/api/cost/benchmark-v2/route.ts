import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const start       = searchParams.get("start")
    const end         = searchParams.get("end")
    const supplier    = searchParams.get("supplier")
    const productCode = searchParams.get("product_code")
    const warehouse   = searchParams.get("warehouse")

    const client = await clientPromise
    const col    = client.db("atms").collection("stockmovement_v5")

    const match: Record<string, any> = {
      รับ: { $gt: 0 },
      WD:  { $in: [null, ""] },
    }

    if (start && end)   match.year_month = { $gte: start, $lte: end }
    else if (start)     match.year_month = { $gte: start }
    else if (end)       match.year_month = { $lte: end }

    if (supplier)    match["ซัพพลายเออร์"] = supplier
    if (productCode) match["รหัสสินค้า"]   = { $regex: productCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }

    if (warehouse) {
      const whs = warehouse.split(",").map((w) => w.trim()).filter(Boolean)
      if (whs.length === 1) match["คลังสินค้า"] = whs[0]
      else if (whs.length > 1) match["คลังสินค้า"] = { $in: whs }
    }

    if (!match["รหัสสินค้า"]) match["รหัสสินค้า"] = { $exists: true, $nin: [null, ""] }

    const pipeline = [
      { $match: match },
      // Normalise null/empty ซัพพลายเออร์
      {
        $addFields: {
          ซัพพลายเออร์: {
            $cond: {
              if:   { $or: [{ $eq: ["$ซัพพลายเออร์", null] }, { $eq: ["$ซัพพลายเออร์", ""] }] },
              then: "ไม่ระบุ",
              else: "$ซัพพลายเออร์",
            },
          },
        },
      },
      // Group by product + supplier + unit price → count occurrences
      {
        $group: {
          _id: {
            รหัสสินค้า:   "$รหัสสินค้า",
            ซัพพลายเออร์: "$ซัพพลายเออร์",
            ราคาทุน:      "$ราคาทุน",
          },
          ชื่อสินค้า:  { $first: "$ชื่อสินค้า" },
          กลุ่มสินค้า: { $first: "$กลุ่มสินค้า" },
          count:       { $sum: 1 },
          total_cost:  { $sum: "$ยอดเงิน" },
          total_qty:   { $sum: "$รับ" },
          first_date:  { $min: "$year_month" },
          last_date:   { $max: "$year_month" },
        },
      },
      // Roll up to product + supplier, push price distribution array
      {
        $group: {
          _id: {
            รหัสสินค้า:   "$_id.รหัสสินค้า",
            ซัพพลายเออร์: "$_id.ซัพพลายเออร์",
          },
          ชื่อสินค้า:    { $first: "$ชื่อสินค้า" },
          กลุ่มสินค้า:   { $first: "$กลุ่มสินค้า" },
          total_records: { $sum: "$count" },
          total_cost:    { $sum: "$total_cost" },
          total_qty:     { $sum: "$total_qty" },
          first_date:    { $min: "$first_date" },
          last_date:     { $max: "$last_date" },
          prices: {
            $push: {
              price: "$_id.ราคาทุน",
              count: "$count",
              cost:  "$total_cost",
              qty:   "$total_qty",
            },
          },
        },
      },
      {
        $project: {
          _id:           0,
          รหัสสินค้า:    "$_id.รหัสสินค้า",
          ซัพพลายเออร์:  "$_id.ซัพพลายเออร์",
          ชื่อสินค้า:    1,
          กลุ่มสินค้า:   1,
          total_records: 1,
          total_cost:    1,
          total_qty:     1,
          first_date:    1,
          last_date:     1,
          prices:        1,
        },
      },
      { $sort: { รหัสสินค้า: 1, ซัพพลายเออร์: 1 } },
    ]

    const data = await col.aggregate(pipeline).toArray()

    // Post-process: sort prices by count desc, add pct
    data.forEach((row: any) => {
      const total = row.total_records || 1
      row.prices = (row.prices as any[])
        .filter(p => p.price !== null && p.price !== undefined)
        .sort((a: any, b: any) => b.count - a.count)
        .map((p: any) => ({ ...p, pct: (p.count / total) * 100 }))
    })

    return NextResponse.json({ success: true, count: data.length, data })
  } catch (error: any) {
    console.error("cost/benchmark-v2 API error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
