import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

// Note: DB value is "PM ความเเย็น" (สระเอ 2 ตัว) — not "PM ความเย็น"
const PM_PURPOSES = ["PM ความเเย็น", "PM น้ำมันเครื่อง", "PM ช่วงล่าง"]
const PM_CLASSES = new Set(["PM1", "PM2", "PM3"])

const MAPPING_COLLECTION = "pm_item_mapping"

async function getOpsEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  if (!email) return null
  const { allowedGroups } = await getUserPermissions(email)
  return allowedGroups.includes("ops") ? email : null
}

// ── GET: distinct PM items joined with current mapping ────────────────────────
export async function GET() {
  try {
    const email = await getOpsEmail()
    if (!email) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })

    const client = await clientPromise
    const db = client.db("datawarehouse")

    const pipeline = [
      { $match: { "จุดประสงค์ในการเบิก": { $in: PM_PURPOSES } } },
      {
        $group: {
          _id:          "$รหัสสินค้า",
          ชื่อสินค้า:   { $first: "$ชื่อสินค้า" },
          กลุ่มสินค้า:  { $first: "$กลุ่มสินค้า" },
          total_cost:   { $sum: "$total_cost" },
          records:      { $sum: 1 },
        },
      },
      {
        $lookup: {
          from:         MAPPING_COLLECTION,
          localField:   "_id",
          foreignField: "รหัสสินค้า",
          as:           "map",
        },
      },
      {
        $project: {
          _id:          0,
          รหัสสินค้า:   "$_id",
          ชื่อสินค้า:   1,
          กลุ่มสินค้า:  1,
          total_cost:   1,
          records:      1,
          pm_class:     { $ifNull: [{ $arrayElemAt: ["$map.pm_class", 0] }, null] },
          updated_by:   { $ifNull: [{ $arrayElemAt: ["$map.updated_by", 0] }, null] },
        },
      },
      { $sort: { total_cost: -1 as const } },
    ]

    const data = await db.collection("dw_stockmovement").aggregate(pipeline).toArray()

    return NextResponse.json({ success: true, count: data.length, data })
  } catch (error: any) {
    console.error("pm-mapping GET error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}

// ── POST: batch upsert mappings ───────────────────────────────────────────────
// Body: { items: [{ รหัสสินค้า, ชื่อสินค้า, กลุ่มสินค้า, pm_class }] }
// pm_class: "PM1" | "PM2" | "PM3" | null (null clears the mapping)
export async function POST(req: NextRequest) {
  try {
    const email = await getOpsEmail()
    if (!email) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const items: any[] = Array.isArray(body?.items) ? body.items : []
    if (!items.length) {
      return NextResponse.json({ success: false, error: "items is required" }, { status: 400 })
    }

    for (const it of items) {
      if (!it?.รหัสสินค้า || typeof it.รหัสสินค้า !== "string") {
        return NextResponse.json({ success: false, error: "รหัสสินค้า is required on every item" }, { status: 400 })
      }
      if (it.pm_class !== null && !PM_CLASSES.has(it.pm_class)) {
        return NextResponse.json(
          { success: false, error: `pm_class must be PM1, PM2, PM3 or null (got: ${it.pm_class})` },
          { status: 400 }
        )
      }
    }

    const client = await clientPromise
    const col = client.db("datawarehouse").collection(MAPPING_COLLECTION)
    await col.createIndex({ รหัสสินค้า: 1 }, { unique: true })

    const now = new Date()
    const ops = items.map((it) => ({
      updateOne: {
        filter: { รหัสสินค้า: it.รหัสสินค้า },
        update: {
          $set: {
            ชื่อสินค้า:  it.ชื่อสินค้า ?? "",
            กลุ่มสินค้า: it.กลุ่มสินค้า ?? "",
            pm_class:    it.pm_class,
            updated_by:  email,
            updated_at:  now,
          },
        },
        upsert: true,
      },
    }))

    const result = await col.bulkWrite(ops)

    return NextResponse.json({
      success:  true,
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
    })
  } catch (error: any) {
    console.error("pm-mapping POST error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
