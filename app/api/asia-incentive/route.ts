import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const mmyy = searchParams.get("mmyy");
    const fleet = searchParams.get("fleet");
    const driverId = searchParams.get("driver_id");
    const driverName = searchParams.get("driver_name");

    const client = await clientPromise;

    // MongoDB
    const db = client.db("asia_incentive");
    const collection = db.collection("driver_incentive_data");

    const filter: any = {};

    if (mmyy) {
      filter.mmyy = mmyy.trim();
    }

    if (fleet) {
      filter.fleet = fleet.trim();
    }

    if (driverId) {
      filter.driver_id = driverId.trim();
    }

    if (driverName) {
      filter.driver_name = {
        $regex: escapeRegex(driverName.trim()),
        $options: "i",
      };
    }

    const data = await collection
      .find(filter, {
        projection: {
          _id: 0,
        },
      })
      .sort({
        mmyy: -1,
        fleet: 1,
        driver_id: 1,
      })
      .toArray();

    // ✅ return only data array
    return NextResponse.json(data);
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