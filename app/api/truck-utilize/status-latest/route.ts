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

    // ดึงย้อนหลัง 60 วัน (bounded) — แถวล่าสุด + นับจำนวนวันติดต่อกันที่อยู่กลุ่มสถานะเดิม (streak)
    const placeholders = plates.map(() => "?").join(",");
    const [rows] = await pool.query<any[]>(
      `SELECT license_plate, status, date
       FROM performance_vehicle_daily
       WHERE license_plate IN (${placeholders}) AND date >= CURDATE() - INTERVAL 60 DAY
       ORDER BY date DESC`,
      plates,
    );

    // จัดกลุ่มแถวต่อทะเบียน (เรียง date DESC อยู่แล้ว)
    const byPlate = new Map<string, { group: string; status: string; date: string }[]>();
    for (const r of rows as any[]) {
      const plate = String(r.license_plate);
      const status = String(r.status ?? "");
      if (!byPlate.has(plate)) byPlate.set(plate, []);
      byPlate.get(plate)!.push({ group: groupOf(status), status, date: fmtDateBKK(r.date) });
    }

    const statuses: Record<string, { status: string; label: string; group: string; date: string; streak_days: number; streak_capped: boolean }> = {};
    for (const [plate, list] of byPlate) {
      const latest = list[0];
      // นับวันติดต่อกัน (ตามวันที่จริง ห่างได้ไม่เกิน 1 วัน) ที่อยู่ "กลุ่ม" เดียวกับวันล่าสุด
      let streak = 1;
      let prev = new Date(latest.date);
      for (let i = 1; i < list.length; i++) {
        const cur = list[i];
        if (cur.date === fmtDateBKK(prev)) continue; // แถวซ้ำวันเดียวกัน
        const d = new Date(cur.date);
        const gapDays = Math.round((prev.getTime() - d.getTime()) / 86400000);
        if (gapDays > 1 || cur.group !== latest.group) break;
        streak++;
        prev = d;
      }
      statuses[plate] = {
        status: latest.status,
        label: STATUS_LABEL[latest.status] ?? "",
        group: latest.group,
        date: latest.date,
        streak_days: streak,
        streak_capped: streak >= 60, // ครบหน้าต่าง 60 วัน = อาจนานกว่านี้
      };
    }

    return NextResponse.json({ statuses });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "query failed" }, { status: 500 });
  }
}
