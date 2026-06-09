import pool from "@/lib/mysql";
import { NextResponse } from "next/server";

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start") || "01-25";
    const end   = searchParams.get("end")   || "12-25";

    const placeholders = EXCLUDED_PLATES.map(() => "?").join(",");
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
         AND month_year <= ?
       GROUP BY fleet_group_id, month_year
       ORDER BY fleet_group_id, month_year`,
      [...EXCLUDED_PLATES, start, end]
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
