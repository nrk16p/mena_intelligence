import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

// ประเภทการซ่อม (MR repair_type) × อู่ใน/อู่นอก — powers the table on
// /cost-report slide 3.
//
// This is a DIFFERENT cost basis from /api/cost/detail. That route reads
// stockmovement_v5 (การเบิกของจากคลัง); this one reads the MR itself
// (maint_header → maint_tasks → maint_parts). The two do not total the same:
// MR cost includes ค่าแรงอู่นอก and อะไหล่ศูนย์/อู่นอก that never passed through
// คลัง, and excludes เบิก not attached to a ใบแจ้งซ่อม (เครื่องมือช่าง,
// วัสดุสิ้นเปลือง). The slide carries a note saying so.
//
// อู่ใน/อู่นอก uses the same rule as the rest of the ATMS pipeline: a request
// holding any parts_group that contains "ค่าแรง" was outsourced.
// (api-ncac scripts/maintenance/pipeline_maintenance.py:249)
//
// The scan starts at maint_header — one doc per ใบแจ้งซ่อม, the smallest of the
// three collections — and both lookups ride the (request_id, task_id) indexes
// the extractor creates, so nothing here is unbounded.

/** maint_parts numbers arrive as strings with thousands separators ("1,136.52") */
const toNum = (expr: string) => ({
  $convert: {
    input: {
      $replaceAll: {
        input: { $toString: { $ifNull: [expr, "0"] } },
        find: ",",
        replacement: "",
      },
    },
    to: "double",
    onError: 0,
    onNull: 0,
  },
})

const UNKNOWN_TYPE = "ไม่ระบุประเภท"

export type RepairTypeRow = {
  plate:       string
  month_year:  string
  garage:      "อู่ใน" | "อู่นอก"
  repair_type: string
  total:       number
}

type FacetRow = { plate: string; month_year: string; garage: string; total: number }
type TypeRow  = FacetRow & { repair_type: string }

// The three maint_* collections are rewritten once a night by the api-ncac
// maintenance pipeline (02:00), so a short TTL costs nothing in freshness and
// takes the ~9s aggregation off every repeat load of /cost-report. The result
// depends only on the range — nothing user-specific — so one process-wide Map
// is safe. On serverless this is per-instance and best-effort by nature.
const TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; data: RepairTypeRow[] }>()

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const email = session?.user?.email ?? null
    if (!email) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    const { allowedGroups } = await getUserPermissions(email)
    if (!allowedGroups.includes("ops")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start") // YYYY-MM
    const end   = searchParams.get("end")   // YYYY-MM
    if (!start || !end) {
      return NextResponse.json({ success: false, error: "start and end are required (YYYY-MM)" }, { status: 400 })
    }

    const cacheKey = `${start}|${end}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ success: true, count: hit.data.length, cached: true, data: hit.data })
    }

    const db = (await clientPromise).db("atms")

    const pipeline = [
      // reported_at is "DD/MM/YYYY HH:mm" and carries no index, so the month key
      // is derived and matched immediately — before either lookup runs.
      {
        $addFields: {
          month_year: {
            $concat: [
              { $substr: ["$reported_at", 6, 4] },
              "-",
              { $substr: ["$reported_at", 3, 2] },
            ],
          },
        },
      },
      { $match: { month_year: { $gte: start, $lte: end } } },
      { $project: { _id: 0, request_id: 1, plate_no: 1, month_year: 1 } },
      {
        $lookup: {
          from:         "maint_parts",
          localField:   "request_id",
          foreignField: "request_id",
          as:           "parts",
          pipeline:     [{ $project: { _id: 0, task_id: 1, parts_group: 1, total: 1 } }],
        },
      },
      {
        $addFields: {
          garage: {
            $cond: [
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$parts",
                        as:    "p",
                        cond:  { $regexMatch: { input: { $ifNull: ["$$p.parts_group", ""] }, regex: "ค่าแรง" } },
                      },
                    },
                  },
                  0,
                ],
              },
              "อู่นอก",
              "อู่ใน",
            ],
          },
          // The whole request's parts bill, kept so the per-task costs below can
          // be reconciled against it.
          req_total: { $sum: { $map: { input: "$parts", as: "p", in: toNum("$$p.total") } } },
        },
      },
      {
        $lookup: {
          from:         "maint_tasks",
          localField:   "request_id",
          foreignField: "request_id",
          as:           "tasks",
          pipeline:     [{ $project: { _id: 0, task_id: 1, repair_type: 1 } }],
        },
      },
      {
        // maint_tasks occasionally carries the same task_id twice within one ใบ.
        // Unwound as-is that task's parts bill is charged once per copy — the
        // measured overcount was 0.10% of the range. Keep the first of each id.
        $addFields: {
          tasks: {
            $reduce: {
              input:        "$tasks",
              initialValue: [],
              in: {
                $cond: [
                  { $in: ["$$this.task_id", "$$value.task_id"] },
                  "$$value",
                  { $concatArrays: ["$$value", ["$$this"]] },
                ],
              },
            },
          },
        },
      },
      {
        // byType = cost that maps to a งานซ่อม via task_id.
        // byReq  = the request's entire parts bill.
        // The gap between them is emitted as ไม่ระบุประเภท below, so part lines
        // whose task_id matches no task cannot vanish from the table's total.
        $facet: {
          byType: [
            { $unwind: "$tasks" },
            {
              $addFields: {
                task_cost: {
                  $sum: {
                    $map: {
                      input: {
                        $filter: {
                          input: "$parts",
                          as:    "p",
                          cond:  { $eq: ["$$p.task_id", "$tasks.task_id"] },
                        },
                      },
                      as: "p",
                      in: toNum("$$p.total"),
                    },
                  },
                },
              },
            },
            {
              $group: {
                _id: {
                  plate:  "$plate_no",
                  my:     "$month_year",
                  garage: "$garage",
                  type:   { $ifNull: ["$tasks.repair_type", ""] },
                },
                total: { $sum: "$task_cost" },
              },
            },
            {
              $project: {
                _id: 0,
                plate:       { $ifNull: ["$_id.plate", ""] },
                month_year:  "$_id.my",
                garage:      "$_id.garage",
                repair_type: "$_id.type",
                total:       1,
              },
            },
          ],
          byReq: [
            {
              $group: {
                _id:   { plate: "$plate_no", my: "$month_year", garage: "$garage" },
                total: { $sum: "$req_total" },
              },
            },
            {
              $project: {
                _id: 0,
                plate:      { $ifNull: ["$_id.plate", ""] },
                month_year: "$_id.my",
                garage:     "$_id.garage",
                total:      1,
              },
            },
          ],
        },
      },
    ]

    const [facet] = await db.collection("maint_header").aggregate(pipeline).toArray()
    const byType = ((facet?.byType ?? []) as TypeRow[])
    const byReq  = ((facet?.byReq  ?? []) as FacetRow[])

    const key = (r: { plate: string; month_year: string; garage: string }) =>
      `${r.plate}|${r.month_year}|${r.garage}`

    const out: RepairTypeRow[] = []
    const assigned = new Map<string, number>()
    for (const r of byType) {
      const type = (r.repair_type || "").trim() || UNKNOWN_TYPE
      out.push({
        plate:       r.plate || "",
        month_year:  r.month_year,
        garage:      r.garage === "อู่นอก" ? "อู่นอก" : "อู่ใน",
        repair_type: type,
        total:       r.total || 0,
      })
      assigned.set(key(r), (assigned.get(key(r)) ?? 0) + (r.total || 0))
    }

    // Whatever the tasks did not account for. Rounding noise is ignored; a real
    // gap means part lines with no matching task_id, and it must stay visible.
    for (const r of byReq) {
      const gap = (r.total || 0) - (assigned.get(key(r)) ?? 0)
      if (gap <= 0.01) continue
      out.push({
        plate:       r.plate || "",
        month_year:  r.month_year,
        garage:      r.garage === "อู่นอก" ? "อู่นอก" : "อู่ใน",
        repair_type: UNKNOWN_TYPE,
        total:       gap,
      })
    }

    cache.set(cacheKey, { at: Date.now(), data: out })
    return NextResponse.json({ success: true, count: out.length, cached: false, data: out })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    console.error("cost/repair-type API error:", msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
