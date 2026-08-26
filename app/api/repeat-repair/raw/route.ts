import { applyFilters, buildEvents, DEFAULT_WINDOW } from "@/lib/repeat-repair"

export const maxDuration = 120

const COLUMNS = [
  "วันแจ้งซ่อม", "เดือน", "เลขที่ใบแจ้งซ่อม", "ทะเบียน", "เลขรถ", "ประเภทงานซ่อม",
  "สาขา", "ประเภทรถ", "วันซ่อมเสร็จ/ปิด", "ซ่อมซ้ำ", "ห่างจากใบก่อน (วัน)",
  "ใบก่อนหน้า", "ประเภทใบก่อนหน้า", "วันเสร็จใบก่อนหน้า", "อาการรอบก่อน", "อาการรอบนี้",
] as const

function cell(v: unknown): string {
  if (v === null || v === undefined) return ""
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const fmt = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "")

// GET /api/repeat-repair/raw?year=&window=&planned=&branches=&types=&only=repeat
//   → CSV ทุกงานซ่อม (หรือเฉพาะงานซ่อมซ้ำ) ตามตัวกรองหน้าจอ
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const windowDays = Number(searchParams.get("window") ?? DEFAULT_WINDOW)
  const includePlanned = searchParams.get("planned") === "1"
  const onlyRepeat = searchParams.get("only") === "repeat"
  const list = (k: string) =>
    (searchParams.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean)

  const all = await buildEvents({
    windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : DEFAULT_WINDOW,
    includePlanned,
  })
  let rows = applyFilters(all, {
    year: searchParams.get("year") ?? undefined,
    branches: list("branches"),
    types: list("types"),
  })
  if (onlyRepeat) rows = rows.filter((e) => e.isRepeat)
  rows.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder()
      controller.enqueue(enc.encode("﻿" + COLUMNS.join(",") + "\n"))
      for (const e of rows) {
        controller.enqueue(
          enc.encode(
            [
              fmt(e.reportedAt), e.ym, e.requestCode, e.truck, e.vehicleNo, e.repairType,
              e.branch, e.ownerType, fmt(e.finishAt), e.isRepeat ? "ใช่" : "",
              e.gapDays ?? "", e.prevCode ?? "", e.prevType ?? "", fmt(e.prevFinishAt),
              e.prevDescription ?? "", e.description,
            ].map(cell).join(",") + "\n"
          )
        )
      }
      controller.close()
    },
  })

  const name = `repeat_repair_${searchParams.get("year") ?? "all"}${onlyRepeat ? "_repeat" : ""}.csv`
  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  })
}
