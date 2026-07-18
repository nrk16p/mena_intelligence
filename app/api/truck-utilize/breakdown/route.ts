import pool from "@/lib/mysql";
import { platesForFlags } from "@/lib/plate-partner-server";
import { NextResponse } from "next/server";
import { EXCLUDED_PLATES } from "@/lib/fleets";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start") || "01-25";
    const end   = searchParams.get("end")   || "12-25";
    // optional: comma-separated partner_flag values (same vocabulary as dw_stockmovement)
    const partnerFlag = searchParams.get("partner_flag");

    // Resolve requested flags to a concrete plate list via dw_stockmovement.
    // Plates with no flag in the datawarehouse are excluded while filtering.
    let platesFilter: string[] | null = null;
    if (partnerFlag) {
      platesFilter = await platesForFlags(partnerFlag);
      if (platesFilter && platesFilter.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    const placeholders = EXCLUDED_PLATES.map(() => "?").join(",");
    const plateClause = platesFilter
      ? ` AND REPLACE(license_plate, ' ', '') IN (${platesFilter.map(() => "?").join(",")})`
      : "";
    const [rows] = await pool.query<any[]>(
      `SELECT
         fleet_group_id,
         month_year,
         COUNT(DISTINCT license_plate)                                   AS truck_count,
         SUM(CASE WHEN status IN ('B','BA') THEN 1 ELSE 0 END)          AS breakdown_count
       FROM performance_vehicle_daily
       WHERE license_plate NOT LIKE '%(%'
         AND license_plate NOT IN (${placeholders})
         AND month_year >= ?
         AND month_year <= ?${plateClause}
       GROUP BY fleet_group_id, month_year
       ORDER BY fleet_group_id, month_year`,
      [...EXCLUDED_PLATES, start, end, ...(platesFilter ?? [])]
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
