import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ===============================
// CORS CONFIG
// ===============================
const allowedOrigins = [
  "https://mena-pwa-app-548129382487.asia-southeast1.run.app",
  "https://mena-intelligence.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && allowedOrigins.includes(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed
      ? origin
      : "https://mena-pwa-app-548129382487.asia-southeast1.run.app",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data: any, status = 200, origin: string | null = null) {
  return NextResponse.json(data, {
    status,
    headers: getCorsHeaders(origin),
  });
}

// ===============================
// OPTIONS - Preflight request
// ===============================
export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");

  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

// ===============================
// Helper
// ===============================
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ===============================
// GET API
// ===============================
export async function GET(req: Request) {
  const origin = req.headers.get("origin");

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

    const filter: Record<string, any> = {};

    if (mmyy && mmyy.trim() !== "") {
      filter.mmyy = mmyy.trim();
    }

    if (fleet && fleet.trim() !== "") {
      filter.fleet = fleet.trim();
    }

    if (driverId && driverId.trim() !== "") {
      filter.driver_id = driverId.trim();
    }

    if (driverName && driverName.trim() !== "") {
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
    return jsonResponse(data, 200, origin);
  } catch (error: any) {
    console.error("asia-incentive API error:", error);

    return jsonResponse(
      {
        success: false,
        message: error?.message || "Internal Server Error",
      },
      500,
      origin
    );
  }
}