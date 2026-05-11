import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 100);

    const mmyy = searchParams.get("mmyy");
    const fleet = searchParams.get("fleet");
    const driverId = searchParams.get("driver_id");
    const driverName = searchParams.get("driver_name");

    const skip = (page - 1) * limit;

    const client = await clientPromise;

    // ✅ Correct MongoDB location
    const db = client.db("asia_incentive");
    const collection = db.collection("driver_incentive_data");

    const query: any = {};

    if (mmyy) {
      query.mmyy = mmyy.trim();
    }

    if (fleet) {
      query.fleet = fleet.trim();
    }

    if (driverId) {
      query.driver_id = driverId.trim();
    }

    if (driverName) {
      query.driver_name = {
        $regex: escapeRegex(driverName.trim()),
        $options: "i",
      };
    }

    const total = await collection.countDocuments(query);

    const data = await collection
      .find(query, { projection: { _id: 0 } })
      .sort({
        mmyy: -1,
        fleet: 1,
        driver_id: 1,
      })
      .skip(skip)
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: data.length,
      query,
      data,
    });
  } catch (error: any) {
    console.error("asia-incentive API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}