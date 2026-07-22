import clientPromise from "@/lib/mongo"
import { DB, COLL, GROUPS, groupByKey } from "@/lib/stock-onhand-kpi"

export const maxDuration = 300

// คอลัมน์ที่ export (ตามลำดับ)
const COLUMNS = [
  "วันที่", "year_month", "คลังสินค้า", "รหัสสินค้า", "ชื่อสินค้า", "กลุ่มสินค้า",
  "รับ", "จ่าย", "ราคาทุน", "ยอดเงิน", "จุดประสงค์ในการเบิก",
  "เลขรถ", "ทะเบียน", "ซัพพลายเออร์", "PR", "PO",
] as const

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v.toISOString().slice(0, 10) // YYYY-MM-DD
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// GET /api/stock-onhand-kpi/raw?year=2026&group=ศลบ.|สสบ.|all → CSV stream
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get("year")
  const group = searchParams.get("group") ?? "all"

  if (!year || !/^\d{4}$/.test(year)) {
    return new Response(JSON.stringify({ success: false, error: "year ต้องเป็น YYYY" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  const warehouses =
    group === "all"
      ? [...new Set(GROUPS.flatMap((g) => g.warehouses))]
      : groupByKey(group)?.warehouses
  if (!warehouses) {
    return new Response(JSON.stringify({ success: false, error: "group ไม่ถูกต้อง" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  // optional filter กลุ่มสินค้า (comma-separated) — ให้ raw respect ตัวกรองหน้า
  const pg = (searchParams.get("pg") ?? "").split(",").map((s) => s.trim()).filter(Boolean)

  const client = await clientPromise
  const col = client.db(DB).collection(COLL)
  const projection = Object.fromEntries(COLUMNS.map((c) => [c, 1]))
  const q: Record<string, unknown> = {
    คลังสินค้า: { $in: warehouses },
    year_month: { $gte: `${year}-01`, $lte: `${year}-12` },
  }
  if (pg.length) q["กลุ่มสินค้า"] = { $in: pg }
  const cursor = col.find(q, { projection }).sort({ year_month: 1, วันที่: 1 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("﻿")) // BOM ให้ Excel อ่านไทยได้
        controller.enqueue(encoder.encode(COLUMNS.join(",") + "\r\n"))
        for await (const doc of cursor) {
          const line = COLUMNS.map((c) => csvCell((doc as Record<string, unknown>)[c])).join(",")
          controller.enqueue(encoder.encode(line + "\r\n"))
        }
      } catch (e) {
        controller.error(e)
        return
      } finally {
        await cursor.close().catch(() => {})
      }
      controller.close()
    },
  })

  const fname = `stock_onhand_raw_${group === "all" ? "all" : group.replace(/\./g, "")}_${year}.csv`
  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${encodeURIComponent(fname)}"`,
      "cache-control": "no-store",
    },
  })
}
