import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start = searchParams.get("start"); // example: 2026-01
    const end = searchParams.get("end");     // example: 2026-05

    const year = searchParams.get("year");   // example: 2026
    const month = searchParams.get("month"); // example: 5

    const warehouse = searchParams.get("warehouse"); // คลังสินค้า
    const issuePurpose = searchParams.get("issue_purpose"); // จุดประสงค์ในการเบิก
    const productGroup = searchParams.get("product_group"); // กลุ่มสินค้า
    const vehicleType = searchParams.get("vehicle_type"); // ประเภทยานพาหนะ
    const fleetType = searchParams.get("fleet_type"); // ประเภทรถร่วม

    const client = await clientPromise;
    const db = client.db("atms");
    const collection = db.collection("stock_result");

    const match: any = {};

    if (start && end) {
      match.month_year = { $gte: start, $lte: end };
    }

    if (year) {
      match.year = Number(year);
    }

    if (month) {
      match.month = Number(month);
    }

    // Partial match / contains
    // example: warehouse=ลาดกระบัง
    // can match: คลังสินค้าลาดกระบัง
    if (warehouse) {
      match["คลังสินค้า"] = {
        $regex: escapeRegex(warehouse),
        $options: "i",
      };
    }

    if (issuePurpose) {
      match["จุดประสงค์ในการเบิก"] = {
        $regex: escapeRegex(issuePurpose),
        $options: "i",
      };
    }

    if (productGroup) {
      match["กลุ่มสินค้า"] = {
        $regex: escapeRegex(productGroup),
        $options: "i",
      };
    }

    if (vehicleType) {
      match["ประเภทยานพาหนะ"] = vehicleType;
    }

    if (fleetType) {
      match["ประเภทรถร่วม"] = fleetType;
    }

    const data = await collection
      .aggregate([
        {
          $match: match,
        },
        {
          $group: {
            _id: {
              คลังสินค้า: "$คลังสินค้า",
              จุดประสงค์ในการเบิก: "$จุดประสงค์ในการเบิก",
              กลุ่มสินค้า: "$กลุ่มสินค้า",
              month_year: "$month_year",
              ประเภทยานพาหนะ: "$ประเภทยานพาหนะ",
              ประเภทรถร่วม: "$ประเภทรถร่วม",
            },
            total_cost: {
              $sum: {
                $convert: {
                  input: "$total_cost",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            คลังสินค้า: "$_id.คลังสินค้า",
            จุดประสงค์ในการเบิก: "$_id.จุดประสงค์ในการเบิก",
            กลุ่มสินค้า: "$_id.กลุ่มสินค้า",
            month_year: "$_id.month_year",
            ประเภทยานพาหนะ: "$_id.ประเภทยานพาหนะ",
            ประเภทรถร่วม: "$_id.ประเภทรถร่วม",
            total_cost: {
              $round: ["$total_cost", 2],
            },
          },
        },
        {
          $sort: {
            month_year: 1,
            คลังสินค้า: 1,
            จุดประสงค์ในการเบิก: 1,
            กลุ่มสินค้า: 1,
            ประเภทยานพาหนะ: 1,
            ประเภทรถร่วม: 1,
          },
        },
      ])
      .toArray();

    return NextResponse.json({
      success: true,
      count: data.length,
      query: match,
      data,
    });
  } catch (error: any) {
    console.error("stock-result-summary API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}