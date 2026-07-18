import pool from "@/lib/mysql"
import { NextResponse } from "next/server"
import { EXCLUDED_PLATES, fleetKey, monthsBetween } from "@/lib/fleets"
import { buildPlateMapQuery } from "@/lib/plate-map-query"
import { getPlateFlagMapByMonth } from "@/lib/plate-partner-server"

// plate+month → fleet_group_id, cached in-process for 10 min per range.
// Month-aware on purpose: a truck that moves ML→TDM mid-year keeps its earlier
// cost credited to ML.
// A MySQL query plus a Mongo aggregation in sequence; the platform default is
// too tight for a wide month range. cf. api/truck-utilize/export (120).
export const maxDuration = 60

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

    // Per-plate+month partner_flag so the client can bucket plates that have no
    // fleet match. Month-aware for the same reason the fleet map is: a truck
    // that changed flag mid-history must not have its older cost bucketed by
    // today's flag. Must not fail the whole request if Mongo errors.
    let flags: Record<string, string> = {}
    try {
      const flagMap = await getPlateFlagMapByMonth(months)
      flags = Object.fromEntries(flagMap.entries())
    } catch (flagError) {
      console.error("fleet/plate-map flag lookup error:", flagError)
      flags = {}
    }

    // The in-process Map above only helps within one warm lambda instance. The
    // edge cache is what actually spares MySQL/Mongo on repeat requests.
    // Success only — errors and 400s must never be cached.
    return NextResponse.json(
      { success: true, count: Object.keys(data).length, data, flags },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1800" } },
    )
  } catch (error: any) {
    console.error("fleet/plate-map API error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 },
    )
  }
}
