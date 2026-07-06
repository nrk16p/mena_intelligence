import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { escapeRegex, isValidMonth, receiptMatch, weightedIQRBounds, windowFor } from "@/lib/price-benchmark"

export const maxDuration = 60

/**
 * ราคารายเดือนของสินค้าหนึ่งตัว (ทั้ง 12 เดือนของ window ราคากลาง):
 * min / max / mode ต่อเดือน + จุดราคาซื้อจริงทุกจุด (ติดธง outlier ด้วย IQR
 * ของทั้ง window) — ใช้วาด Price Band Timeline ใน /price-benchmark
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const month       = searchParams.get("month")
    const productCode = searchParams.get("product_code")?.trim()
    const supplier    = searchParams.get("supplier")?.trim()

    if (!isValidMonth(month)) {
      return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 })
    }
    if (!productCode) {
      return NextResponse.json({ success: false, error: "product_code is required" }, { status: 400 })
    }

    const { start, end } = windowFor(month)
    const client = await clientPromise
    const col = client.db("atms").collection("stockmovement_v5")

    const match: Record<string, unknown> = receiptMatch({
      year_month: { $gte: start, $lte: end },
      รหัสสินค้า: productCode,
      ราคาทุน: { $ne: null },
    })

    const supplierNorm = {
      $cond: {
        if:   { $or: [{ $eq: ["$ซัพพลายเออร์", null] }, { $eq: ["$ซัพพลายเออร์", ""] }] },
        then: "ไม่ระบุ",
        else: "$ซัพพลายเออร์",
      },
    }

    const rows = await col.aggregate([
      { $match: match },
      { $addFields: { sup: supplierNorm } },
      ...(supplier
        ? [{ $match: { sup: supplier === "ไม่ระบุ" ? "ไม่ระบุ" : { $regex: escapeRegex(supplier), $options: "i" } } }]
        : []),
      {
        $group: {
          _id: { m: "$year_month", price: "$ราคาทุน" },
          count: { $sum: 1 },
          qty:   { $sum: "$รับ" },
        },
      },
      { $sort: { "_id.m": 1, "_id.price": 1 } },
    ]).toArray()

    // IQR over the whole window (weighted) → outlier flags for the dots
    const distMap = new Map<number, number>()
    for (const r of rows) distMap.set(r._id.price, (distMap.get(r._id.price) ?? 0) + r.count)
    const dist = [...distMap.entries()].map(([price, count]) => ({ price, count })).sort((a, b) => a.price - b.price)
    const bounds = weightedIQRBounds(dist)
    const isOutlier = (p: number) => !!bounds && (p < bounds.lower || p > bounds.upper)

    // every month of the window on the axis, even empty ones
    const monthsAxis: string[] = []
    {
      const [sy, sm] = start.split("-").map(Number)
      for (let i = 0; i < 12; i++) {
        const d = new Date(Date.UTC(sy, sm - 1 + i, 1))
        monthsAxis.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`)
      }
    }

    const byMonth = new Map<string, { price: number; count: number; qty: number }[]>()
    for (const r of rows) {
      const arr = byMonth.get(r._id.m) ?? []
      arr.push({ price: r._id.price, count: r.count, qty: r.qty })
      byMonth.set(r._id.m, arr)
    }

    const monthly = monthsAxis.map((m) => {
      const pts = (byMonth.get(m) ?? []).sort((a, b) => a.price - b.price)
      if (pts.length === 0) {
        return { month: m, min: null, max: null, mode: null, mode_count: null, count: 0, points: [] }
      }
      let mode = pts[0]
      for (const p of pts) if (p.count > mode.count) mode = p // tie → lowest (sorted asc)
      return {
        month: m,
        min: pts[0].price,
        max: pts[pts.length - 1].price,
        mode: mode.price,
        mode_count: mode.count,
        count: pts.reduce((s, p) => s + p.count, 0),
        points: pts.map((p) => ({ ...p, outlier: isOutlier(p.price) })),
      }
    })

    return NextResponse.json({
      success: true,
      product_code: productCode,
      window_start: start,
      window_end: end,
      iqr: bounds,
      monthly,
    })
  } catch (error: any) {
    console.error("price-benchmark/timeline API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
