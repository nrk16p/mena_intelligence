import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

const AVG_MONTHS = 40;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const vehicleType = searchParams.get("vehicle_type");
    const year = searchParams.get("year");

    const client = await clientPromise;
    const collection = client.db("analytics").collection("truck_year_cost");

    const match: any = {};

    if (vehicleType) match["ประเภทยานพาหนะ"] = vehicleType;
    if (year) match["ปี"] = Number(year);

    const data = await collection
      .aggregate([
        { $match: match },
        {
          $addFields: {
            avg_per_month: {
              $round: [{ $divide: ["$avg_cost_per_ทะเบียน", AVG_MONTHS] }, 2],
            },
            estimate_per_year: {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$avg_cost_per_ทะเบียน", AVG_MONTHS] },
                    12,
                  ],
                },
                2,
              ],
            },
            year_x_truck: {
              $round: [
                {
                  $multiply: [
                    {
                      $multiply: [
                        { $divide: ["$avg_cost_per_ทะเบียน", AVG_MONTHS] },
                        12,
                      ],
                    },
                    "$count_ทะเบียน",
                  ],
                },
                2,
              ],
            },
          },
        },
        {
          $project: {
            _id: 0,
            ประเภทยานพาหนะ: 1,
            ปี: 1,
            total_cost: { $round: ["$total_cost", 2] },
            count_ทะเบียน: 1,
            avg_cost_per_ทะเบียน: { $round: ["$avg_cost_per_ทะเบียน", 2] },
            avg_per_month: 1,
            estimate_per_year: 1,
            year_x_truck: 1,
          },
        },
        { $sort: { ประเภทยานพาหนะ: 1, ปี: 1 } },
      ])
      .toArray();

    return NextResponse.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error: any) {
    console.error("truck-year-cost API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
