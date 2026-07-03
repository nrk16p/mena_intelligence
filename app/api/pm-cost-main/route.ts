import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

// PM work orders live in maint_tasks with repair_type "PMช่างมีนา" / "PMศูนย์บริการ".
// The PM stage (PM1–PM4) is written inside the task description free text.
// Parts (WD requisitions) are matched on request_id + task_id.

export type PmClass = "PM1" | "PM2" | "PM3" | "PM4" | "PM ไม่ระบุระยะ"

// "ระยะ 120,000 KM" must not match ระยะ 1 — hence the digit/comma lookahead
export function classifyPm(desc: string | null | undefined): PmClass {
  const d = desc || ""
  let m = d.match(/PM\s*([1-4])(?![\d,.])/i)
  if (m) return `PM${m[1]}` as PmClass
  m = d.match(/ระยะ(?:ที่)?\s*([1-4])(?![\d,.])/)
  if (m) return `PM${m[1]}` as PmClass
  return "PM ไม่ระบุระยะ"
}

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
    const start = searchParams.get("start")   // YYYY-MM
    const end   = searchParams.get("end")     // YYYY-MM

    const client = await clientPromise
    const db = client.db("atms")

    const pipeline: Record<string, any>[] = [
      { $match: { repair_type: { $regex: "^PM" } } },
      {
        $lookup: {
          from:         "maint_header",
          localField:   "request_id",
          foreignField: "request_id",
          as:           "hdr",
        },
      },
      { $unwind: "$hdr" },
      {
        $lookup: {
          from:         "maint_timing",
          localField:   "request_id",
          foreignField: "request_id",
          as:           "timing",
        },
      },
      {
        $addFields: {
          garage_finish_at: { $ifNull: [{ $arrayElemAt: ["$timing.garage_finish_at", 0] }, ""] },
          estimated_hours:  { $ifNull: [{ $arrayElemAt: ["$timing.estimated_hours", 0] }, ""] },
          garage_entry_at:  { $ifNull: [{ $arrayElemAt: ["$timing.garage_entry_at", 0] }, ""] },
        },
      },
      {
        // Main date = ซ่อมเสร็จเมื่อ (garage_finish_at); MRs not yet finished fall
        // back to reported_at. Dates are "DD/MM/YYYY HH:mm" → month_year "YYYY-MM"
        $addFields: {
          main_date: {
            $cond: [
              { $gte: [{ $strLenCP: "$garage_finish_at" }, 10] },
              "$garage_finish_at",
              "$hdr.reported_at",
            ],
          },
        },
      },
      {
        $addFields: {
          month_year: {
            $concat: [
              { $substr: ["$main_date", 6, 4] },
              "-",
              { $substr: ["$main_date", 3, 2] },
            ],
          },
        },
      },
      ...(start || end
        ? [{
            $match: {
              month_year: {
                ...(start ? { $gte: start } : {}),
                ...(end   ? { $lte: end }   : {}),
              },
            },
          }]
        : []),
      {
        $lookup: {
          from: "maint_parts",
          let:  { rid: "$request_id", tid: "$task_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$request_id", "$$rid"] },
                    { $eq: ["$task_id", "$$tid"] },
                  ],
                },
              },
            },
            {
              // values come as strings with thousands separators ("1,136.52")
              $project: {
                _id:            0,
                requisition_no: 1,
                parts_group:    1,
                part:           1,
                qty:        { $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: ["$qty", "0"] } },        find: ",", replacement: "" } }, to: "double", onError: 0, onNull: 0 } },
                unit_price: { $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: ["$unit_price", "0"] } }, find: ",", replacement: "" } }, to: "double", onError: 0, onNull: 0 } },
                total:      { $convert: { input: { $replaceAll: { input: { $toString: { $ifNull: ["$total", "0"] } },      find: ",", replacement: "" } }, to: "double", onError: 0, onNull: 0 } },
              },
            },
          ],
          as: "parts",
        },
      },
      {
        $project: {
          _id:         0,
          request_id:  1,
          task_id:     1,
          repair_type: 1,
          description: 1,
          month_year:  1,
          parts:       1,
          task_cost:   { $sum: "$parts.total" },
          garage_finish_at:  1,
          garage_entry_at:   1,
          estimated_hours:   1,
          main_date:         1,
          request_code:      "$hdr.request_code",
          step:              "$hdr.step",
          branch:            "$hdr.branch",
          plate_no:          "$hdr.plate_no",
          vehicle_no:        "$hdr.vehicle_no",
          owner_type:        "$hdr.owner_type",
          mechanic:          "$hdr.mechanic",
          reported_at:       "$hdr.reported_at",
          mileage_at_report: "$hdr.mileage_at_report",
        },
      },
      { $sort: { month_year: 1 as const, request_id: 1 as const } },
    ]

    const rows = await db.collection("maint_tasks").aggregate(pipeline).toArray()

    // Classify PM stage from description free text
    rows.forEach((r: any) => { r.pm_class = classifyPm(r.description) })

    return NextResponse.json({ success: true, count: rows.length, data: rows })
  } catch (error: any) {
    console.error("pm-cost-main API error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
