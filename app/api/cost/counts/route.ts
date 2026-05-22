import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start       = searchParams.get("start");
    const end         = searchParams.get("end");
    const warehouse   = searchParams.get("warehouse");   // comma-separated
    const partnerFlag = searchParams.get("partner_flag");

    const client = await clientPromise;
    const col    = client.db("datawarehouse").collection("dw_stockmovement");

    const match: Record<string, any> = {};

    if (start && end)  match.month_year = { $gte: start, $lte: end };
    else if (start)    match.month_year = { $gte: start };
    else if (end)      match.month_year = { $lte: end };

    if (partnerFlag)   match.partner_flag = partnerFlag;

    if (warehouse) {
      const whs = warehouse.split(",").map((w) => w.trim()).filter(Boolean);
      if (whs.length === 1)      match["คลังสินค้า"] = whs[0];
      else if (whs.length > 1)   match["คลังสินค้า"] = { $in: whs };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id:      null,
          wds:      { $addToSet: "$WD" },
          plates:   { $addToSet: "$ทะเบียน" },
          products: { $addToSet: "$รหัสสินค้า" },
          total_cost:   { $sum: "$total_cost" },
          record_count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id:           0,
          wd_count:      { $size: "$wds" },
          plate_count:   { $size: "$plates" },
          product_count: { $size: "$products" },
          total_cost:    1,
          record_count:  1,
        },
      },
    ];

    const rows = await col.aggregate(pipeline).toArray();
    const result = rows[0] ?? { wd_count: 0, plate_count: 0, product_count: 0, total_cost: 0, record_count: 0 };

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("cost/counts API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
