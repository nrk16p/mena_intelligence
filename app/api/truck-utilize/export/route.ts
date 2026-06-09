import pool from "@/lib/mysql";
import { NextResponse } from "next/server";

export const maxDuration = 120;

const GROUP_STATUS_MAP: Record<string, string[]> = {
  working: ["A","AX","Aท","Aอ","Aอส","A75","A50","A25"],
  repair:  ["B","BA","BAQ","BY","PM"],
  idle:    ["อ","วซ","วA","วร","วล","วก","วป","วภ","X","วส","วพ","วข","วฝ"],
};

const FLEET_MAP: Record<string, string> = {
  "1":"ML","2":"MS","3":"TDM","4":"BTG","5":"TFG","6":"SCCC","7":"DHL","8":"KN",
};

const STATUS_LABEL: Record<string, string> = {
  "A":"ทำงานปกติ","AX":"ระหว่างเดินทาง","Aท":"รถสำรองทำงานแทน","Aอ":"รถโอน","Aอส":"รถโอนสาย",
  "A75":"ทำงาน 6 ชม.","A50":"ทำงาน 4 ชม.","A25":"ทำงาน 2 ชม.",
  "B":"รถซ่อมไม่มีพจส.","BA":"รถซ่อมมีพจส.","BAQ":"รถซ่อมมีคิว","BY":"รถเบรกแย๊กโม่","PM":"เช็คระยะตามรอบ",
  "อ":"รถจอด (อุบัติเหตุ)","วซ":"รถว่างรอซ่อม","วA":"รถว่างรอดำเนินการ","วร":"รถว่างรอสรรหา",
  "วล":"รถว่างพจส.ลาปกติ","วก":"รถว่างพจส.ลากิจฉุกเฉิน","วป":"รถว่างพจส.ลาป่วย","วภ":"รถว่างรอต่อภาษี",
  "X":"ตกคิว/ไม่ได้งาน","วส":"รถว่างพจส.อบรม/สอบ","วพ":"รถว่างพจส.ถูกพักงาน","วข":"รถว่างพจส.ขาดงาน","วฝ":"ว่างฝึกงาน",
};

const BATCH_SIZE = 50000;

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

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

    const where = `WHERE ${conditions.join(" AND ")}`;

    // Total count
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total FROM performance_vehicle_daily ${where}`,
      params,
    );
    const total = Number((countRows as any[])[0].total);

    // Build CSV with BOM for Excel UTF-8 support
    let csv = "﻿"; // UTF-8 BOM so Excel opens Thai characters correctly
    csv += csvRow(["Fleet","Fleet Group ID","License Plate","Plant","Customer","Status Code","Status","Group Status","Date","Month Year"]);

    const baseSql = `
      SELECT fleet_group_id, license_plate, plant, customer, status, group_status, date, month_year
      FROM performance_vehicle_daily
      ${where}
      ORDER BY date DESC, fleet_group_id ASC
    `;

    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const [batch] = await pool.query<any[]>(
        `${baseSql} LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
        params,
      );
      for (const r of batch as any[]) {
        csv += csvRow([
          FLEET_MAP[String(r.fleet_group_id)] ?? String(r.fleet_group_id),
          r.fleet_group_id,
          r.license_plate ?? "",
          r.plant ?? "",
          r.customer ?? "",
          r.status ?? "",
          STATUS_LABEL[r.status ?? ""] ?? "",
          r.group_status ?? "",
          r.date ? String(r.date).slice(0, 10) : "",
          r.month_year ?? "",
        ]);
      }
    }

    const buf = Buffer.from(csv, "utf8");
    const today = new Date().toISOString().slice(0, 10);

    return new Response(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="truck_utilize_${today}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("truck-utilize export error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Export failed" },
      { status: 500 },
    );
  }
}
