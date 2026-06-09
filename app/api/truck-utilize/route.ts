import pool from "@/lib/mysql";
import { NextResponse } from "next/server";

const ALLOWED_PAGE_SIZES = new Set([25, 50, 100]);

const GROUP_STATUS_MAP: Record<string, string[]> = {
  working: ["A","AX","Aท","Aอ","Aอส","A75","A50","A25"],
  repair:  ["B","BA","BAQ","BY","PM"],
  idle:    ["อ","วซ","วA","วร","วล","วก","วป","วภ","X","วส","วพ","วข","วฝ"],
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start_date     = searchParams.get("start_date");
    const end_date       = searchParams.get("end_date");
    const month_year     = searchParams.get("month_year");
    const plant          = searchParams.get("plant");
    const status         = searchParams.get("status");
    const group_status   = searchParams.get("group_status");
    const license_plate  = searchParams.get("license_plate");
    const fleet_group_id = searchParams.get("fleet_group_id");

    const isExport  = searchParams.get("export") === "true";
    const page      = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const page_size = ALLOWED_PAGE_SIZES.has(parseInt(searchParams.get("page_size") || "25", 10))
      ? parseInt(searchParams.get("page_size") || "25", 10)
      : 25;
    const offset = (page - 1) * page_size;

    const conditions: string[] = ["license_plate NOT LIKE '%(%'"];
    const params: (string | number)[] = [];

    if (start_date)    { conditions.push("date >= ?");            params.push(start_date); }
    if (end_date)      { conditions.push("date <= ?");            params.push(end_date); }
    if (month_year)    { conditions.push("month_year = ?");       params.push(month_year); }
    if (plant)         { conditions.push("plant = ?");            params.push(plant); }
    if (status)        { conditions.push("status = ?");           params.push(status); }
    if (group_status && GROUP_STATUS_MAP[group_status]) {
      const codes = GROUP_STATUS_MAP[group_status];
      conditions.push(`status IN (${codes.map(() => "?").join(",")})`);
      params.push(...codes);
    }
    if (license_plate) { conditions.push("license_plate LIKE ?"); params.push(`%${license_plate}%`); }
    if (fleet_group_id){ conditions.push("fleet_group_id = ?");   params.push(fleet_group_id); }

    const where    = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countSql = `SELECT COUNT(*) as total FROM performance_vehicle_daily ${where}`;

    const [countRows] = await pool.query<any[]>(countSql, params);
    const total = (countRows as any[])[0].total as number;

    if (isExport) {
      const exportSql = `SELECT fleet_group_id, license_plate, plant, customer, status, group_status, date, month_year
                         FROM performance_vehicle_daily ${where} ORDER BY date DESC, id DESC`;
      const [rows] = await pool.query<any[]>(exportSql, params);
      return NextResponse.json({ success: true, total, data: rows });
    }

    const dataSql = `SELECT * FROM performance_vehicle_daily ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`;
    const [rows]  = await pool.query<any[]>(dataSql, [...params, page_size, offset]);

    return NextResponse.json({
      success: true,
      total,
      page,
      page_size,
      total_pages: Math.ceil(total / page_size),
      data: rows,
    });
  } catch (error: any) {
    console.error("truck-utilize API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
