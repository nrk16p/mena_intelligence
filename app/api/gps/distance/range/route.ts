import { NextResponse } from "next/server"
import type { Document } from "mongodb"
import clientPromise from "@/lib/mongo"
import { distanceCollections, distancePipeline } from "@/lib/gps-distance"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// A year of every plate is ~300k docs across the vendor collections; past that
// the caller wants an export job, not a request.
const MAX_RANGE_DAYS = 400

function bad(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 })
}

function daysBetween(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
}

// The regex admits impossible dates like 2026-02-30, which Date.parse silently
// rolls forward to 2026-03-02 — that would query a range the caller never asked
// for. Round-tripping rejects them instead.
function isRealDate(value: string) {
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * POST /api/gps/distance/range
 * body: { startdate: "2026-01-01", enddate: "2026-02-02", plates: ["สบ.73-3403"] }
 *
 * Same daily-maximum rule as the monthly endpoint (see lib/gps-distance.ts),
 * scoped to an arbitrary day range instead of a whole month.
 *
 * POST rather than GET because `plates` can hold hundreds of Thai plates, which
 * blows past URL length limits once percent-encoded.
 */
export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return bad("body ต้องเป็น JSON")
    }

    const startdate = String(body.startdate ?? "")
    const enddate = String(body.enddate ?? "")

    if (!DATE_RE.test(startdate) || !isRealDate(startdate)) {
      return bad("startdate ต้องเป็นวันที่จริงในรูปแบบ YYYY-MM-DD")
    }
    if (!DATE_RE.test(enddate) || !isRealDate(enddate)) {
      return bad("enddate ต้องเป็นวันที่จริงในรูปแบบ YYYY-MM-DD")
    }

    const span = daysBetween(startdate, enddate)
    if (span < 0) return bad("startdate ต้องไม่มากกว่า enddate")
    if (span > MAX_RANGE_DAYS) return bad(`ช่วงวันที่ยาวเกิน ${MAX_RANGE_DAYS} วัน`)

    const rawPlates = body.plates
    if (rawPlates !== undefined && !Array.isArray(rawPlates)) {
      return bad("plates ต้องเป็น array")
    }
    // Empty or omitted means every vehicle, matching how the other filters behave.
    const plates = Array.isArray(rawPlates)
      ? [...new Set(rawPlates.map((p) => String(p).trim()).filter(Boolean))]
      : []

    const client = await clientPromise
    const db = client.db("gps")

    const collections = await distanceCollections(db)
    if (!collections.length) {
      return NextResponse.json(
        { success: false, message: "ไม่พบ collection ระยะทางใน db gps" },
        { status: 404 }
      )
    }

    // date_key is a zero-padded YYYY-MM-DD string, so a plain range comparison
    // sorts correctly, and {date_key, vehicle_no} is indexed on every collection.
    const match: Document = { date_key: { $gte: startdate, $lte: enddate } }
    if (plates.length) match.vehicle_no = { $in: plates }

    const rows = await db
      .collection(collections[0])
      .aggregate(distancePipeline(collections, match))
      .toArray()

    // Plates that matched nothing are reported rather than silently dropped —
    // a typo'd plate and a truck that genuinely never moved look identical in
    // the rows alone.
    const found = new Set(rows.map((r) => r.vehicleNo))
    const notFound = plates.filter((p) => !found.has(p))

    return NextResponse.json({
      success: true,
      startdate,
      enddate,
      days: span + 1,
      plates,
      notFound,
      collections,
      count: rows.length,
      totalDistanceKm: Math.round(rows.reduce((s, r) => s + r.distanceKm, 0) * 10) / 10,
      rows,
    })
  } catch (error) {
    console.error("gps/distance/range API error:", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
