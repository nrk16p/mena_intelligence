import { NextResponse } from "next/server";

// Proxy → mena-wms public API: reference งานซ่อมอู่นอก/อะไหล่ลงคัน ต่อทะเบียน (batch)
// เรียกฝั่ง server เพื่อเลี่ยง CORS + cache สั้นๆ ลดโหลด WMS
const WMS_BASE = process.env.WMS_BASE_URL || "https://mena-wms.vercel.app";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const plates = searchParams.get("plates")?.trim() ?? "";
  if (!plates) return NextResponse.json({ error: "ต้องระบุ plates" }, { status: 400 });

  try {
    const res = await fetch(
      `${WMS_BASE}/api/repair-external/utilize-ref?plates=${encodeURIComponent(plates)}`,
      { next: { revalidate: 120 } },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "เชื่อมต่อ mena-wms ไม่สำเร็จ" }, { status: 502 });
  }
}
