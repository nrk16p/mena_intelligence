import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start       = searchParams.get("start");
    const end         = searchParams.get("end");
    const warehouse   = searchParams.get("warehouse");
    const partnerFlag = searchParams.get("partner_flag");

    const client = await clientPromise;
    const col    = client.db("datawarehouse").collection("dw_stockmovement");

    const match: Record<string, any> = {};
    if (start && end)   match.month_year = { $gte: start, $lte: end };
    else if (start)     match.month_year = { $gte: start };
    else if (end)       match.month_year = { $lte: end };

    if (partnerFlag)    match.partner_flag = partnerFlag;
    if (warehouse) {
      const whs = warehouse.split(",").map((w) => w.trim()).filter(Boolean);
      if (whs.length === 1) match["คลังสินค้า"] = whs[0];
      else if (whs.length > 1) match["คลังสินค้า"] = { $in: whs };
    }

    const pipeline = [
      { $match: match },
      // ── Line-level aggregation ────────────────────────────────────────────
      {
        $group: {
          _id: {
            month_year:           "$month_year",
            plate:                "$ทะเบียน",
            จุดประสงค์ในการเบิก: "$จุดประสงค์ในการเบิก",
            กลุ่มสินค้า:         "$กลุ่มสินค้า",
            รหัสสินค้า:          "$รหัสสินค้า",
          },
          wd:               { $first: "$เลขรถ" },
          ชื่อสินค้า:       { $first: "$ชื่อสินค้า" },
          ราคาทุน:          { $first: "$ราคาทุน" },
          ซัพพลายเออร์:     { $first: "$ซัพพลายเออร์" },
          line_cost:        { $sum: "$total_cost" },
          sum_actual_issue: { $sum: "$actual_issue" },
          records:          { $sum: 1 },
        },
      },
      // ── Plate-level aggregation ───────────────────────────────────────────
      {
        $group: {
          _id: { month_year: "$_id.month_year", plate: "$_id.plate" },
          wd:          { $first: "$wd" },
          plate_total: { $sum: "$line_cost" },
          lines: {
            $push: {
              จุดประสงค์:       "$_id.จุดประสงค์ในการเบิก",
              กลุ่มสินค้า:       "$_id.กลุ่มสินค้า",
              รหัสสินค้า:        "$_id.รหัสสินค้า",
              ชื่อสินค้า:        "$ชื่อสินค้า",
              ราคาทุน:           "$ราคาทุน",
              ซัพพลายเออร์:      "$ซัพพลายเออร์",
              cost:               "$line_cost",
              sum_actual_issue:   "$sum_actual_issue",
              records:            "$records",
            },
          },
        },
      },
      { $sort: { "_id.month_year": 1, plate_total: -1 } },
      {
        $project: {
          _id:         0,
          month_year:  "$_id.month_year",
          plate:       "$_id.plate",
          wd:          1,
          plate_total: 1,
          lines:       1,
        },
      },
    ];

    const data = await col.aggregate(pipeline).toArray();

    // Sort lines within each plate by cost desc (client-friendly)
    data.forEach((row: any) => {
      row.lines?.sort((a: any, b: any) => b.cost - a.cost);
    });

    return NextResponse.json({ success: true, count: data.length, data });
  } catch (error: any) {
    console.error("cost/detail API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
