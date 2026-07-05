import pool from "@/lib/mysql";
import { platesForFlags } from "@/lib/plate-partner";
import { NextResponse } from "next/server";

// Same dummy-plate exclusions as /api/truck-utilize/breakdown
const EXCLUDED_PLATES = [
  "C001-01-01","C001-01-02","C001-01-03","C001-01-04",
  "F001-01-01","F001-01-02","F001-01-03","F001-01-04",
  "JRC001-01-01","KP001-01-01","KP001-01-02","RP001-01-01",
  "TPI.00-0000","TN01-001","TN01-002","TH001-01","TH001-02","TH001-03","TH001-04","AS001-01",
  "0001-01","0001-02","ACO-001","O001-01-01",
  "U001-01-01","U001-01-02","ZY001-01","ZY001-02",
  "สบ.00-0000","สบ.00-0001","สบ.00-0002","สบ.00-0003","สบ.00-0004",
  "สบ.00-0005","สบ.00-0006","สบ.00-0007","สบ.00-0008","สบ.00-0009",
  "สบ.00-0010","สบ.00-0011","สบ.00-0012","สบ.00-0013","สบ.00-0014",
  "สบ.00-0015","สบ.00-0016","สบ.00-0017","สบ.00-0018","สบ.00-0019",
  "สบ.00-0020",
  "สบ.00-00000","สบ.00-00002",
];

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
