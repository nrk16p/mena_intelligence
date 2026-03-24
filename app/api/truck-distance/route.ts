import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const plate = searchParams.get("plate");
  const start = searchParams.get("start"); // 2026-01
  const end = searchParams.get("end");     // 2026-03

  const client = await clientPromise;
  const db = client.db("atms");
  const collection = db.collection("truck_distance_summary");

  const query: any = {};

  if (plate) {
    query.plate = plate;
  }

  if (start && end) {
    query.month_year = { $gte: start, $lte: end };
  }

  const data = await collection
    .find(query)
    .sort({ month_year: 1 })
    .toArray();

  return NextResponse.json(data);
}