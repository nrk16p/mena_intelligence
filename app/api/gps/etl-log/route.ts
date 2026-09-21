import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
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
 *
 * `canRetry` ติดมากับคำตอบนี้เลยแทนที่จะให้ฝั่ง client ยิงถามสิทธิ์อีกรอบ — dialog เรียก
 * endpoint นี้ตอนเปิดอยู่แล้ว และใช้มันตัดสินแค่ว่าจะ *แสดง* ปุ่มหรือไม่ ส่วนการบังคับสิทธิ์
 * จริงอยู่ที่ POST /api/gps/etl-retry
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

    const session = await getServerSession(authOptions)
    const { isAdmin } = await getUserPermissions(session?.user?.email)

    const client = await clientPromise
    const col = client.db("gps").collection<LogDoc>("etl_log")

    const [docs, matched, total, bySource, openBySource] = await Promise.all([
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
      // ข้อผิดพลาดที่ "ยังค้าง" รายเจ้า — นับเฉพาะ error ที่ยังไม่มี success ของ
      // source+วันเดียวกันตามมาทีหลัง จับกลุ่มเป็น source+date_key ก่อนแล้วค่อยรวมเป็น source
      col
        .aggregate([
          {
            $group: {
              _id: { source: "$source", dateKey: "$date_key" },
              lastSuccessAt: {
                $max: { $cond: [{ $eq: ["$status", "success"] }, "$started_at", null] },
              },
              errorTimes: {
                $push: { $cond: [{ $eq: ["$status", "error"] }, "$started_at", "$$REMOVE"] },
              },
            },
          },
          {
            $project: {
              source: "$_id.source",
              openErrors: {
                $size: {
                  $filter: {
                    input: "$errorTimes",
                    as: "t",
                    cond: {
                      $or: [
                        { $eq: ["$lastSuccessAt", null] },
                        { $gt: ["$$t", "$lastSuccessAt"] },
                      ],
                    },
                  },
                },
              },
            },
          },
          { $group: { _id: "$source", openErrors: { $sum: "$openErrors" } } },
        ])
        .toArray(),
    ])

    /**
     * หา "success ล่าสุด" ของแต่ละ source+วัน ที่มี error อยู่ในหน้านี้ เพื่อบอกได้ว่า
     * error แถวนั้นถูกแก้ไปแล้วหรือยัง
     *
     * ต้องถามฐานข้อมูลแยก ไม่ใช้ rows ที่ส่งกลับไปคำนวณเอง เพราะตอนผู้ใช้กรอง status=error
     * แถว success จะไม่ติดมาด้วยเลยสักแถว — ถ้าเทียบจากในหน้าก็จะไม่มีวันเจอว่าแก้แล้ว
     */
    const errDocs = docs.filter((d) => d.status === "error")
    const resolvedAt = new Map<string, Date>()
    if (errDocs.length) {
      const fixes = await col
        .aggregate([
          {
            $match: {
              status: "success",
              source: { $in: [...new Set(errDocs.map((d) => d.source ?? ""))] },
              date_key: { $in: [...new Set(errDocs.map((d) => d.date_key ?? ""))] },
            },
          },
          {
            $group: {
              _id: { source: "$source", dateKey: "$date_key" },
              at: { $max: "$started_at" },
            },
          },
        ])
        .toArray()
      for (const f of fixes) {
        const key = `${f._id.source}|${f._id.dateKey}`
        if (f.at instanceof Date) resolvedAt.set(key, f.at)
      }
    }

    /** success ที่มาทีหลัง error แถวนั้น = ข้อมูลของวันนั้นเข้ามาเรียบร้อยแล้ว */
    const fixedAt = (d: LogDoc): Date | null => {
      if (d.status !== "error") return null
      const at = resolvedAt.get(`${d.source ?? ""}|${d.date_key ?? ""}`)
      if (!at) return null
      const started = d.started_at
      return started instanceof Date && at <= started ? null : at
    }

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
      resolvedAt: iso(fixedAt(d)),
    }))

    const openErrors = new Map(
      openBySource.map((o) => [String(o._id ?? ""), (o.openErrors as number) ?? 0])
    )

    return NextResponse.json({
      success: true,
      rows,
      count: rows.length,
      matched,
      total,
      truncated: matched > rows.length,
      canRetry: isAdmin,
      summary: {
        lastRunAt: rows[0]?.startedAt ?? null,
        bySource: bySource.map((s) => ({
          source: String(s._id ?? ""),
          runs: s.runs as number,
          errors: s.errors as number,
          openErrors: openErrors.get(String(s._id ?? "")) ?? 0,
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
