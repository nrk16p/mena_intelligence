import pool from "@/lib/mysql";
import { NextResponse } from "next/server";

// สถานะรายวันล่าสุดของรถ (จาก performance_vehicle_daily) แบบ batch หลายทะเบียน
// GET /api/truck-utilize/status-latest?plates=สบ.71-1256,สบ.71-2028
// ใช้โดย mena-wms /repair-external — แสดงว่ารถแต่ละคันวันล่าสุดอยู่สถานะอะไร (A/B/BA/...)
// ตอบ: { statuses: { "<ทะเบียน>": { status, label, group, date } } }

const STATUS_LABEL: Record<string, string> = {
  "A":"ทำงานปกติ","AX":"ระหว่างเดินทาง","Aท":"รถสำรองทำงานแทน",
  "Aอ":"รถโอน","Aอส":"รถโอนสาย","A75":"ทำงาน 6 ชม.","A50":"ทำงาน 4 ชม.","A25":"ทำงาน 2 ชม.",
  "B":"รถซ่อมไม่มีพจส.","BA":"รถซ่อมมีพจส.","BAQ":"รถซ่อมมีคิว","BY":"รถเบรกแย๊กโม่","PM":"เช็คระยะตามรอบ",
  "อ":"รถจอด (อุบัติเหตุ)","วซ":"รถว่างรอซ่อม","วA":"รถว่างรอดำเนินการ","วร":"รถว่างรอสรรหา",
  "วล":"รถว่างพจส.ลาปกติ","วก":"รถว่างพจส.ลากิจฉุกเฉิน","วป":"รถว่างพจส.ลาป่วย","วภ":"รถว่างรอต่อภาษี",
  "X":"ตกคิว/ไม่ได้งาน","วส":"รถว่างพจส.อบรม/สอบ","วพ":"รถว่างพจส.ถูกพักงาน","วข":"รถว่างพจส.ขาดงาน","วฝ":"ว่างฝึกงาน",
};
const WORKING = new Set(["A","AX","Aท","Aอ","Aอส","A75","A50","A25"]);
const REPAIR  = new Set(["B","BA","BAQ","BY","PM"]);
const IDLE    = new Set(["อ","วซ","วA","วร","วล","วก","วป","วภ","X","วส","วพ","วข","วฝ"]);

function groupOf(status: string): string {
  if (WORKING.has(status)) return "working";
  if (REPAIR.has(status))  return "repair";
  if (IDLE.has(status))    return "idle";
  return "unknown";
}

function fmtDateBKK(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const platesParam = searchParams.get("plates")?.trim() ?? "";
    const plates = [...new Set(platesParam.split(",").map(p => p.trim()).filter(Boolean))].slice(0, 100);
    if (!plates.length) return NextResponse.json({ error: "ต้องระบุ plates" }, { status: 400 });

    // ดึงย้อนหลัง 14 วัน (bounded) แล้วเอาแถวล่าสุดต่อทะเบียน
    const placeholders = plates.map(() => "?").join(",");
    const [rows] = await pool.query<any[]>(
      `SELECT license_plate, status, date
       FROM performance_vehicle_daily
       WHERE license_plate IN (${placeholders}) AND date >= CURDATE() - INTERVAL 14 DAY
       ORDER BY date DESC`,
      plates,
    );

    const statuses: Record<string, { status: string; label: string; group: string; date: string }> = {};
    for (const r of rows as any[]) {
      const plate = String(r.license_plate);
      if (statuses[plate]) continue; // เรียง date DESC แล้ว — แถวแรกคือล่าสุด
      const status = String(r.status ?? "");
      statuses[plate] = {
        status,
        label: STATUS_LABEL[status] ?? "",
        group: groupOf(status),
        date: fmtDateBKK(r.date),
      };
    }

    return NextResponse.json({ statuses });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "query failed" }, { status: 500 });
  }
}
