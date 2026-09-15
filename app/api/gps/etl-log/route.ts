import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000

type LogDoc = {
  _id: unknown
  source?: string
  date_key?: string
  etl_months?: string
  status?: string
  stage?: string
  started_at?: Date
  finished_at?: Date
  duration_seconds?: number
  error_type?: string | null
  error_message?: string | null
  is_empty?: boolean | null
  collections?: string[]
}

const iso = (d?: Date | null) => (d instanceof Date ? d.toISOString() : null)

/**
 * GET /api/gps/etl-log?limit=&status=&source=
 * → ประวัติการทำงานของ ETL จาก collection `etl_log` (db: gps) เรียงล่าสุดก่อน
 *
 * `status` / `source` รับได้ทั้งค่าเดียวและ CSV. `summary.bySource` คำนวณจาก
 * ทั้ง collection เสมอ ไม่ใช่เฉพาะแถวที่ถูกกรอง — ผู้ใช้จึงยังเห็นภาพรวมของทุกเจ้า
 * แม้กำลังกรองดูเฉพาะรายการที่ error อยู่
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const csv = (key: string) =>
      (searchParams.get(key) ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)

    const statuses = csv("status")
    const sources = csv("source")
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT)
    )

    const filter: Record<string, unknown> = {}
    if (statuses.length) filter.status = { $in: statuses }
    if (sources.length) filter.source = { $in: sources }

    const client = await clientPromise
    const col = client.db("gps").collection<LogDoc>("etl_log")

    const [docs, matched, total, bySource] = await Promise.all([
      col.find(filter).sort({ started_at: -1, _id: -1 }).limit(limit).toArray(),
      col.countDocuments(filter),
      col.estimatedDocumentCount(),
      // ล่าสุดของแต่ละเจ้า + จำนวนรอบ/ข้อผิดพลาดสะสม
      col
        .aggregate([
          { $sort: { started_at: -1 } },
          {
            $group: {
              _id: "$source",
              runs: { $sum: 1 },
              errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
              lastStatus: { $first: "$status" },
              lastDateKey: { $first: "$date_key" },
              lastRunAt: { $first: "$started_at" },
              lastFinishedAt: { $first: "$finished_at" },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
    ])

    const rows = docs.map((d) => ({
      id: String(d._id),
      source: d.source ?? "",
      dateKey: d.date_key ?? "",
      etlMonth: d.etl_months ?? "",
      status: d.status ?? "",
      stage: d.stage ?? "",
      startedAt: iso(d.started_at),
      finishedAt: iso(d.finished_at),
      durationSeconds: typeof d.duration_seconds === "number" ? d.duration_seconds : null,
      errorType: d.error_type ?? null,
      errorMessage: d.error_message ?? null,
      isEmpty: d.is_empty ?? null,
      collections: d.collections ?? [],
    }))

    return NextResponse.json({
      success: true,
      rows,
      count: rows.length,
      matched,
      total,
      truncated: matched > rows.length,
      summary: {
        lastRunAt: rows[0]?.startedAt ?? null,
        bySource: bySource.map((s) => ({
          source: String(s._id ?? ""),
          runs: s.runs as number,
          errors: s.errors as number,
          lastStatus: (s.lastStatus as string) ?? "",
          lastDateKey: (s.lastDateKey as string) ?? "",
          lastRunAt: iso(s.lastRunAt as Date),
          lastFinishedAt: iso(s.lastFinishedAt as Date),
        })),
      },
    })
  } catch (error) {
    console.error("gps/etl-log API error:", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
