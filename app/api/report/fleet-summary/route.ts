import pool from "@/lib/mysql";
import { NextResponse } from "next/server";

const IDLE_ST = ["อ","วซ","วA","วร","วล","วก","วป","วภ","X","วส","วพ","วข","วฝ"];
const BD_ST   = ["B","BA","BAQ","BY","PM"];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start") || "01-26";
    const end   = searchParams.get("end")   || "04-26";

    const idlePlaceholders = IDLE_ST.map(() => "?").join(",");
    const bdPlaceholders   = BD_ST.map(() => "?").join(",");

    const [rows] = await pool.query<any[]>(`
      SELECT
        fleet_group_id,
        COUNT(DISTINCT date)                                                           AS day_count,
        COUNT(DISTINCT license_plate)                                                  AS truck_count,
        SUM(CASE WHEN status IN (${idlePlaceholders}) THEN 1 ELSE 0 END)              AS idle_records,
        SUM(CASE WHEN status IN (${bdPlaceholders})   THEN 1 ELSE 0 END)              AS bd_records,
        COUNT(*)                                                                       AS total_records
      FROM performance_vehicle_daily
      WHERE license_plate NOT LIKE '%(%'
        AND month_year >= ? AND month_year <= ?
      GROUP BY fleet_group_id
      ORDER BY fleet_group_id
    `, [...IDLE_ST, ...BD_ST, start, end]);

    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
