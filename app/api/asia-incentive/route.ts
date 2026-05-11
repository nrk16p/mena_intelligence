import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const mmyy = searchParams.get("mmyy"); 
    const driverId = searchParams.get("driver_id");

    const fleet = searchParams.get("fleet");
    const driverName = searchParams.get("driver_name");

    const page = Number(searchParams.get("page") || 1);
    const limit = Number(searchParams.get("limit") || 100);

    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const skip = (safePage - 1) * safeLimit;

    const client = await clientPromise;
    const db = client.db("atms");

    // Collection name
    const collection = db.collection("asia-incentive");

    const query: any = {};

    if (mmyy) {
      query.mmyy = mmyy;
    }

    if (driverId) {
      query.driver_id = {
        $regex: escapeRegex(driverId),
        $options: "i",
      };
    }

    if (fleet) {
      query.fleet = {
        $regex: escapeRegex(fleet),
        $options: "i",
      };
    }

    if (driverName) {
      query.driver_name = {
        $regex: escapeRegex(driverName),
        $options: "i",
      };
    }

    const [data, total] = await Promise.all([
      collection
        .find(query, { projection: { _id: 0 } })
        .sort({
          mmyy: 1,
          fleet: 1,
          driver_id: 1,
          driver_name: 1,
        })
        .skip(skip)
        .limit(safeLimit)
        .toArray(),

      collection.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
      count: data.length,
      query,
      data,
    });
  } catch (error: any) {
    console.error("asia-incentive API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}