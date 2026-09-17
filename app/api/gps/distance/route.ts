import { NextResponse } from "next/server"
import type { Document } from "mongodb"
import clientPromise from "@/lib/mongo"
import { distanceCollections, distancePipeline, sourceOf } from "@/lib/gps-distance"

export const dynamic = "force-dynamic"
// Unions 8 vendor collections and groups ~25k docs for a month; the platform
// default is too tight. cf. api/fleet/plate-map.
export const maxDuration = 60

const MONTH_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// A year of every plate is ~300k docs across the vendor collections; past that
// the caller wants an export job, not a request.
const MAX_RANGE_DAYS = 400

// The regex admits impossible dates like 2026-02-30, which Date.parse silently
// rolls forward to 2026-03-02 — that would query a range nobody asked for.
// Round-tripping rejects them instead.
function isRealDate(value: string) {
  return DATE_RE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

function daysBetween(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
}

function bad(message: string) {
  return NextResponse.json({ success: false, message }, { status: 400 })
}

/**
 * GET /api/gps/distance?start=YYYY-MM-DD&end=YYYY-MM-DD
 * GET /api/gps/distance?month=YYYY-MM        (whole month, kept for callers that
 *                                             still think in months)
 * GET /api/gps/distance?…&daily=1            (adds `days: [{ d, km }]` per vehicle
 *                                             — the Excel export needs it, the
 *                                             dashboard does not)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month") ?? ""
    const start = searchParams.get("start") ?? ""
    const end = searchParams.get("end") ?? ""

    // date_key is a zero-padded YYYY-MM-DD string, so a plain range comparison
    // sorts correctly, and {date_key, vehicle_no} is indexed on every collection.
    let dateMatch: Document
    if (start || end) {
      if (!isRealDate(start)) return bad("start ต้องเป็นวันที่จริงในรูปแบบ YYYY-MM-DD")
      if (!isRealDate(end)) return bad("end ต้องเป็นวันที่จริงในรูปแบบ YYYY-MM-DD")
      const span = daysBetween(start, end)
      if (span < 0) return bad("start ต้องไม่มากกว่า end")
      if (span > MAX_RANGE_DAYS) return bad(`ช่วงวันที่ยาวเกิน ${MAX_RANGE_DAYS} วัน`)
      dateMatch = { date_key: { $gte: start, $lte: end } }
    } else if (MONTH_RE.test(month)) {
      dateMatch = { etl_months: month }
    } else {
      return bad("ต้องระบุ start+end (YYYY-MM-DD) หรือ month (YYYY-MM)")
    }

    const csv = (key: string) =>
      (searchParams.get(key) ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)

    const fleets = csv("fleet")
    const branches = csv("branch")
    const sources = csv("source")
    const daily = searchParams.get("daily") === "1"

    const client = await clientPromise
    const db = client.db("gps")

    const all = await distanceCollections(db)
    if (!all.length) {
      return NextResponse.json(
        { success: false, message: "ไม่พบ collection ระยะทางใน db gps" },
        { status: 404 }
      )
    }

    // Narrowing the source scopes the whole calculation, not just the rows shown:
    // the daily maximum is then taken among the chosen vendors only, so picking a
    // single vendor yields that vendor's own numbers.
    const collections = sources.length
      ? all.filter((c) => sources.includes(sourceOf(c)))
      : all

    if (!collections.length) {
      return NextResponse.json({
        success: true, month, start, end, fleets, branches, sources, collections: [], count: 0, rows: [],
      })
    }

    const postMatch = [
      ...(fleets.length ? [{ $match: { fleet: { $in: fleets } } }] : []),
      ...(branches.length ? [{ $match: { branch: { $in: branches } } }] : []),
    ]

    const pipeline = distancePipeline(collections, dateMatch, postMatch, { daily })
    const rows = await db.collection(collections[0]).aggregate(pipeline).toArray()

    return NextResponse.json({
      success: true,
      month,
      start,
      end,
      fleets,
      branches,
      sources,
      collections,
      daily,
      count: rows.length,
      rows,
    })
  } catch (error) {
    console.error("gps/distance API error:", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
