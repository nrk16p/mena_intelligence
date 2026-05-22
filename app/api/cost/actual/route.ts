import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // ── Date filters ────────────────────────────────────────────
    const start  = searchParams.get("start");  // 2025-01
    const end    = searchParams.get("end");    // 2026-05
    const year   = searchParams.get("year");   // 2026
    const month  = searchParams.get("month");  // 5

    // ── Dimension filters ───────────────────────────────────────
    const warehouse    = searchParams.get("warehouse");     // คลังสินค้า
    const issuePurpose = searchParams.get("issue_purpose"); // จุดประสงค์ในการเบิก
    const productGroup = searchParams.get("product_group"); // กลุ่มสินค้า
    const productCode  = searchParams.get("product_code");  // รหัสสินค้า
    const customer     = searchParams.get("customer");      // fleet
    const partnerFlag  = searchParams.get("partner_flag");  // รถมีนา / รถร่วมมีนา / รถสำนักงาน
    const brand        = searchParams.get("brand");
    const plate        = searchParams.get("plate");         // ทะเบียน
    const truckNo      = searchParams.get("truck_no");      // เลขรถ

    // ── Pagination ──────────────────────────────────────────────
    const limit = Math.min(Number(searchParams.get("limit") ?? 1000), 5000);
    const skip  = Number(searchParams.get("skip") ?? 0);

    const client = await clientPromise;
    const db     = client.db("datawarehouse");
    const col    = db.collection("dw_stockmovement");

    const query: Record<string, any> = {};

    if (start && end) {
      query.month_year = { $gte: start, $lte: end };
    } else if (start) {
      query.month_year = { $gte: start };
    } else if (end) {
      query.month_year = { $lte: end };
    }

    if (year)  query.year  = Number(year);
    if (month) query.month = Number(month);

    if (warehouse)    query["คลังสินค้า"]           = { $regex: escapeRegex(warehouse),    $options: "i" };
    if (issuePurpose) query["จุดประสงค์ในการเบิก"]  = { $regex: escapeRegex(issuePurpose), $options: "i" };
    if (productGroup) query["กลุ่มสินค้า"]           = { $regex: escapeRegex(productGroup), $options: "i" };
    if (productCode)  query["รหัสสินค้า"]            = { $regex: escapeRegex(productCode),  $options: "i" };
    if (plate)        query["ทะเบียน"]               = { $regex: escapeRegex(plate),        $options: "i" };
    if (truckNo)      query["เลขรถ"]                 = { $regex: escapeRegex(truckNo),      $options: "i" };
    if (customer)     query.customer     = { $regex: escapeRegex(customer), $options: "i" };
    if (partnerFlag)  query.partner_flag = partnerFlag;
    if (brand)        query.brand        = { $regex: escapeRegex(brand), $options: "i" };

    const [data, total] = await Promise.all([
      col
        .find(query, {
          projection: {
            _id: 0, row_hash: 0, row_key: 0, dup_seq: 0,
            source_row_no: 0, uploaded_at: 0,
          },
        })
        .sort({ month_year: 1, "คลังสินค้า": 1, "กลุ่มสินค้า": 1, "รหัสสินค้า": 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      col.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      total,
      count: data.length,
      skip,
      limit,
      data,
    });
  } catch (error: any) {
    console.error("cost/actual API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
