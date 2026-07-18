import pool from "@/lib/mysql";
import { platesForFlags } from "@/lib/plate-partner-server";
import { NextResponse } from "next/server";
import { EXCLUDED_PLATES } from "@/lib/fleets";

/**
 * Breakdown rate source rows for the 6 customer fleets (คลังขอนแก่น + คลังลาดกระบัง).
 * Grouped by customer-name pattern rather than fleet_group_id because the KN
 * company name changed mid-year and fleet 8 contains one TDM truck.
 * month_year is "MM-YY"; pass ?year=26 (two-digit) — avoids the lexicographic
 * cross-year bug that start/end string ranges have on this column.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const year = (searchParams.get("year") || "26").slice(-2);
    if (!/^\d{2}$/.test(year)) {
      return NextResponse.json({ success: false, error: "year must be 2 digits (e.g. 26)" }, { status: 400 });
    }

    // optional partner_flag filter (comma-separated dw_stockmovement values);
    // plates with no flag in the datawarehouse drop out while filtering
    const partnerFlag = searchParams.get("partner_flag");
    let platesFilter: string[] | null = null;
    if (partnerFlag) {
      platesFilter = await platesForFlags(partnerFlag);
      if (platesFilter && platesFilter.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
    }
    const plateClause = platesFilter
      ? ` AND REPLACE(license_plate, ' ', '') IN (${platesFilter.map(() => "?").join(",")})`
      : "";

    const placeholders = EXCLUDED_PLATES.map(() => "?").join(",");
    const [rows] = await pool.query<any[]>(
      `SELECT
         CASE
           WHEN customer LIKE '%ทีดี เอ็ม%' OR customer LIKE '%ทีดีเอ็ม%' THEN 'TDM'
           WHEN customer LIKE '%เบทาโกร%'                                THEN 'BTG'
           WHEN customer LIKE '%ไทย ฟู้ดส์%'                             THEN 'TFG'
           WHEN customer LIKE '%ปูนซีเมนต์นครหลวง%'                      THEN 'SCCC'
           WHEN customer LIKE '%ดีเอชแอล%'                               THEN 'DHL'
           WHEN customer LIKE '%นาเกิ้ล%'                                THEN 'KN'
           ELSE NULL
         END                                                            AS code,
         month_year,
         COUNT(DISTINCT license_plate)                                  AS truck_count,
         SUM(CASE WHEN status IN ('B','BA') THEN 1 ELSE 0 END)          AS breakdown_count
       FROM performance_vehicle_daily
       WHERE license_plate NOT LIKE '%(%'
         AND license_plate NOT IN (${placeholders})
         AND month_year LIKE ?${plateClause}
       GROUP BY code, month_year
       HAVING code IS NOT NULL
       ORDER BY code, month_year`,
      [...EXCLUDED_PLATES, `%-${year}`, ...(platesFilter ?? [])]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error("breakdown-rate/customers API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
