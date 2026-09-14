import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { distanceCollections, distancePipeline, sourceOf } from "@/lib/gps-distance"

export const dynamic = "force-dynamic"
// Unions 8 vendor collections and groups ~25k docs for a month; the platform
// default is too tight. cf. api/fleet/plate-map.
export const maxDuration = 60

const MONTH_RE = /^\d{4}-\d{2}$/

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month") ?? ""
    if (!MONTH_RE.test(month)) {
      return NextResponse.json(
        { success: false, message: "month is required (YYYY-MM)" },
        { status: 400 }
      )
    }

    const csv = (key: string) =>
      (searchParams.get(key) ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)

    const fleets = csv("fleet")
    const branches = csv("branch")
    const sources = csv("source")

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
        success: true, month, fleets, branches, sources, collections: [], count: 0, rows: [],
      })
    }

    const postMatch = [
      ...(fleets.length ? [{ $match: { fleet: { $in: fleets } } }] : []),
      ...(branches.length ? [{ $match: { branch: { $in: branches } } }] : []),
    ]

    const pipeline = distancePipeline(collections, { etl_months: month }, postMatch)
    const rows = await db.collection(collections[0]).aggregate(pipeline).toArray()

    return NextResponse.json({
      success: true,
      month,
      fleets,
      branches,
      sources,
      collections,
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
