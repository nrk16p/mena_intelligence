import pool from "@/lib/mysql";
import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

// plate → latest partner_flag from dw_stockmovement, cached for 10 min
// (plates verified 2026-07: ML/MS real plates match ~100%; misses are dummies)
let plateFlagCache: { at: number; map: Map<string, string> } | null = null;

async function getPlateFlagMap(): Promise<Map<string, string>> {
  if (plateFlagCache && Date.now() - plateFlagCache.at < 10 * 60 * 1000) {
    return plateFlagCache.map;
  }
  const client = await clientPromise;
  const rows = await client
    .db("datawarehouse")
    .collection("dw_stockmovement")
    .aggregate([
      { $match: { ทะเบียน: { $nin: [null, ""] }, partner_flag: { $nin: [null, ""] } } },
      { $sort: { month_year: 1 } },
      { $group: { _id: "$ทะเบียน", flag: { $last: "$partner_flag" } } },
    ])
    .toArray();
  const norm = (s: string) => String(s).replace(/\s+/g, "").trim();
  const map = new Map<string, string>(rows.map((r: any) => [norm(r._id), r.flag]));
  plateFlagCache = { at: Date.now(), map };
  return map;
}

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
    // optional: comma-separated partner_flag values (same vocabulary as dw_stockmovement)
    const partnerFlag = searchParams.get("partner_flag");

    // Resolve requested flags to a concrete plate list via dw_stockmovement.
    // Plates with no flag in the datawarehouse are excluded while filtering.
    let platesFilter: string[] | null = null;
    if (partnerFlag) {
      const flags = new Set(partnerFlag.split(",").map((f) => f.trim()).filter(Boolean));
      if (flags.size > 0) {
        const map = await getPlateFlagMap();
        platesFilter = [...map.entries()].filter(([, f]) => flags.has(f)).map(([p]) => p);
        if (platesFilter.length === 0) {
          return NextResponse.json({ success: true, data: [] });
        }
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
