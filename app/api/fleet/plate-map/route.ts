import pool from "@/lib/mysql"
import { NextResponse } from "next/server"
import { EXCLUDED_PLATES, fleetKey, monthsBetween } from "@/lib/fleets"
import { buildPlateMapQuery } from "@/lib/plate-map-query"
import { normPlate } from "@/lib/plate-partner"
import { getPlateFlagMap } from "@/lib/plate-partner-server"

// plate+month → fleet_group_id, cached in-process for 10 min per range.
// Month-aware on purpose: a truck that moves ML→TDM mid-year keeps its earlier
// cost credited to ML.
const TTL = 10 * 60 * 1000
const cache = new Map<string, { at: number; data: Record<string, string> }>()

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")
    const end   = searchParams.get("end")

    if (!start || !end) {
      return NextResponse.json(
        { success: false, error: "start and end are required (MM-YY)" },
        { status: 400 },
      )
    }

    const months = monthsBetween(start, end)
    if (months.length === 0) {
      return NextResponse.json(
        { success: false, error: "invalid or out-of-range start/end (MM-YY)" },
        { status: 400 },
      )
    }

    const ck = `${start}..${end}`
    const hit = cache.get(ck)
    let data: Record<string, string>

    if (hit && Date.now() - hit.at < TTL) {
      data = hit.data
    } else {
      const { sql, params } = buildPlateMapQuery(months, EXCLUDED_PLATES)
      const [rows] = await pool.query<any[]>(sql, params)

      data = {}
      for (const r of rows as any[]) {
        data[fleetKey(r.plate, r.month_year)] = String(r.fleet_group_id)
      }

      cache.set(ck, { at: Date.now(), data })
    }

    // Per-plate partner_flag so the client can bucket plates that have no
    // fleet match. Reuses the existing Mongo-backed lookup — no new
    // aggregation pipeline. Must not fail the whole request if Mongo errors.
    let flags: Record<string, string> = {}
    try {
      const flagMap = await getPlateFlagMap()
      flags = Object.fromEntries(
        [...flagMap.entries()].map(([plate, flag]) => [normPlate(plate), flag]),
      )
    } catch (flagError) {
      console.error("fleet/plate-map flag lookup error:", flagError)
      flags = {}
    }

    return NextResponse.json({ success: true, count: Object.keys(data).length, data, flags })
  } catch (error: any) {
    console.error("fleet/plate-map API error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 },
    )
  }
}
