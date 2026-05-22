import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

// Allowed group_by fields — prevents injection
const ALLOWED_GROUP_BY = new Set([
  "จุดประสงค์ในการเบิก",
  "กลุ่มสินค้า",
  "รหัสสินค้า",
  "partner_flag",
  "คลังสินค้า",
  "customer",
  "brand",
  "ซัพพลายเออร์",
]);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start      = searchParams.get("start");       // 2026-01
    const end        = searchParams.get("end");         // 2026-05
    const groupBy    = searchParams.get("group_by");    // field name
    const warehouse  = searchParams.get("warehouse");   // comma-separated or single
    const partnerFlag = searchParams.get("partner_flag");
    const customer   = searchParams.get("customer");

    if (!groupBy || !ALLOWED_GROUP_BY.has(groupBy)) {
      return NextResponse.json(
        { success: false, error: `group_by must be one of: ${[...ALLOWED_GROUP_BY].join(", ")}` },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const col    = client.db("datawarehouse").collection("dw_stockmovement");

    // ── Match stage ────────────────────────────────────────────────────────
    const match: Record<string, any> = {};

    if (start && end)   match.month_year = { $gte: start, $lte: end };
    else if (start)     match.month_year = { $gte: start };
    else if (end)       match.month_year = { $lte: end };

    if (partnerFlag)    match.partner_flag = partnerFlag;
    if (customer)       match.customer = { $regex: customer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

    // Multi-warehouse filter (comma-separated)
    if (warehouse) {
      const whs = warehouse.split(",").map((w) => w.trim()).filter(Boolean);
      if (whs.length === 1) {
        match["คลังสินค้า"] = whs[0];
      } else if (whs.length > 1) {
        match["คลังสินค้า"] = { $in: whs };
      }
    }

    // ── Aggregation pipeline ───────────────────────────────────────────────
    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            month_year:   "$month_year",
            warehouse:    "$คลังสินค้า",
            partner_flag: "$partner_flag",
            group_value:  `$${groupBy}`,
          },
          total_cost:   { $sum: "$total_cost" },
          record_count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id:          0,
          month_year:   "$_id.month_year",
          warehouse:    "$_id.warehouse",
          partner_flag: "$_id.partner_flag",
          group_value:  "$_id.group_value",
          total_cost:   1,
          record_count: 1,
        },
      },
      { $sort: { month_year: 1, warehouse: 1 } },
    ];

    const data = await col.aggregate(pipeline).toArray();

    return NextResponse.json({ success: true, count: data.length, data });
  } catch (error: any) {
    console.error("cost/summary API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
