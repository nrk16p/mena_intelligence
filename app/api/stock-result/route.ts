import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start = searchParams.get("start"); // example: 2026-01
    const end = searchParams.get("end"); // example: 2026-05

    const year = searchParams.get("year"); // example: 2026
    const month = searchParams.get("month"); // example: 5

    const warehouse = searchParams.get("warehouse"); // คลังสินค้า
    const issuePurpose = searchParams.get("issue_purpose"); // จุดประสงค์ในการเบิก
    const productGroup = searchParams.get("product_group"); // กลุ่มสินค้า
    const productCode = searchParams.get("product_code"); // รหัสสินค้า
    const plate = searchParams.get("plate"); // ทะเบียน
    const truckNo = searchParams.get("truck_no"); // เลขรถ
    const fleet = searchParams.get("fleet"); // ฟลีท
    const vehicleType = searchParams.get("vehicle_type"); // ประเภทยานพาหนะ
    const fleetType = searchParams.get("fleet_type"); // ประเภทรถร่วม

    const client = await clientPromise;
    const db = client.db("atms");
    const collection = db.collection("stock_result");

    const query: any = {};

    if (start && end) {
      query.month_year = { $gte: start, $lte: end };
    }

    if (year) {
      query.year = Number(year);
    }

    if (month) {
      query.month = Number(month);
    }

    if (warehouse) {
      query["คลังสินค้า"] = {
        $regex: escapeRegex(warehouse),
        $options: "i",
      };
    }

    if (issuePurpose) {
      query["จุดประสงค์ในการเบิก"] = {
        $regex: escapeRegex(issuePurpose),
        $options: "i",
      };
    }

    if (productGroup) {
      query["กลุ่มสินค้า"] = {
        $regex: escapeRegex(productGroup),
        $options: "i",
      };
    }

    if (productCode) {
      query["รหัสสินค้า"] = {
        $regex: escapeRegex(productCode),
        $options: "i",
      };
    }

    if (plate) {
      query["ทะเบียน"] = {
        $regex: escapeRegex(plate),
        $options: "i",
      };
    }

    if (truckNo) {
      query["เลขรถ"] = {
        $regex: escapeRegex(truckNo),
        $options: "i",
      };
    }

    if (fleet) {
      query["ฟลีท"] = {
        $regex: escapeRegex(fleet),
        $options: "i",
      };
    }

    if (vehicleType) {
      query["ประเภทยานพาหนะ"] = {
        $regex: escapeRegex(vehicleType),
        $options: "i",
      };
    }

    if (fleetType) {
      query["ประเภทรถร่วม"] = {
        $regex: escapeRegex(fleetType),
        $options: "i",
      };
    }

    const data = await collection
      .find(query, { projection: { _id: 0 } })
      .sort({
        month_year: 1,
        "คลังสินค้า": 1,
        "กลุ่มสินค้า": 1,
        "รหัสสินค้า": 1,
      })
      .toArray();

    return NextResponse.json({
      success: true,
      count: data.length,
      query,
      data,
    });
  } catch (error: any) {
    console.error("stock-result API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}