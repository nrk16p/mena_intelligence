import { NextResponse } from "next/server"
import {
  applyFilters,
  buildEvents,
  DEFAULT_WINDOW,
  optionsOf,
  summarize,
} from "@/lib/repeat-repair"

export const maxDuration = 60

// GET /api/repeat-repair?year=2026&window=30&planned=0&branches=a,b&types=x,y
//   → สรุป KPI ซ่อมซ้ำ + รายการงานซ่อมซ้ำ (raw detail)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const windowDays = Number(searchParams.get("window") ?? DEFAULT_WINDOW)
    const includePlanned = searchParams.get("planned") === "1"
    const list = (k: string) =>
      (searchParams.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean)

    const all = await buildEvents({
      windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : DEFAULT_WINDOW,
      includePlanned,
    })
    const filtered = applyFilters(all, {
      year: searchParams.get("year") ?? undefined,
      branches: list("branches"),
      types: list("types"),
    })

    return NextResponse.json({
      success: true,
      windowDays,
      includePlanned,
      options: optionsOf(all),
      ...summarize(filtered),
      // rawตาราง: เฉพาะงานที่เป็นการซ่อมซ้ำ (ใหม่→เก่า) — ทั้งหมดอยู่ใน /raw CSV
      repeatEvents: filtered
        .filter((e) => e.isRepeat)
        .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
    })
  } catch (e) {
    console.error("[repeat-repair]", e)
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}
