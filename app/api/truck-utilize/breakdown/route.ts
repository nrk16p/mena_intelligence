import pool from "@/lib/mysql";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start") || "01-25";
    const end   = searchParams.get("end")   || "12-25";

    const [rows] = await pool.query<any[]>(
      `SELECT
         fleet_group_id,
         month_year,
         COUNT(DISTINCT license_plate)                                   AS truck_count,
         SUM(CASE WHEN status IN ('B','BA') THEN 1 ELSE 0 END)          AS breakdown_count
       FROM performance_vehicle_daily
       WHERE license_plate NOT LIKE '%(%'
         AND month_year >= ?
         AND month_year <= ?
       GROUP BY fleet_group_id, month_year
       ORDER BY fleet_group_id, month_year`,
      [start, end]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error("breakdown API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
