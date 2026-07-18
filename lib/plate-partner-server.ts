import clientPromise from "@/lib/mongo"
import { normPlate } from "@/lib/plate-partner"
import { monthKeyToYm, ymToMonthKey } from "@/lib/fleets"

// plate → latest partner_flag from dw_stockmovement, cached in-process for 10 min.
// Plate-spelling check (2026-07): ML/MS real plates match ~100% after dummy
// exclusions; TDM has 17 plates with no flag (never drew parts) — when a
// partner filter is active those plates are excluded from the counts.
let cache: { at: number; map: Map<string, string> } | null = null

export async function getPlateFlagMap(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.map
  const client = await clientPromise
  const rows = await client
    .db("datawarehouse")
    .collection("dw_stockmovement")
    .aggregate([
      { $match: { ทะเบียน: { $nin: [null, ""] }, partner_flag: { $nin: [null, ""] } } },
      { $sort: { month_year: 1 } },
      { $group: { _id: "$ทะเบียน", flag: { $last: "$partner_flag" } } },
    ])
    .toArray()
  const map = new Map<string, string>(rows.map((r: any) => [normPlate(r._id), r.flag]))
  cache = { at: Date.now(), map }
  return map
}

// plate+month → that month's partner_flag, cached in-process for 10 min per
// month range. Unlike getPlateFlagMap() above (which collapses a plate to its
// LATEST EVER flag), this keeps the flag the plate actually had in each month —
// a truck that was "รถร่วม" in 2025 and "รถมีนา" in 2026 must not have its 2025
// cost bucketed with the 2026 flag.
const byMonthTTL = 10 * 60 * 1000
const byMonthCache = new Map<string, { at: number; map: Map<string, string> }>()

/**
 * @param months list of "MM-YY" months (e.g. ["01-26","02-26"]).
 * @returns Map keyed `${normPlate(plate)}|${MM-YY}` → partner_flag.
 *
 * Mongo stores month_year as "YYYY-MM", so the months are converted on the way
 * into the $match (keeping the query bounded — never a whole-collection scan)
 * and converted back to "MM-YY" on the way out so the keys line up with the
 * MySQL fleet bridge produced by fleetKey().
 */
export async function getPlateFlagMapByMonth(months: string[]): Promise<Map<string, string>> {
  if (!months || months.length === 0) return new Map()

  const ck = months.join(",")
  const hit = byMonthCache.get(ck)
  if (hit && Date.now() - hit.at < byMonthTTL) return hit.map

  const ymList = months.map(monthKeyToYm).filter(Boolean)
  if (ymList.length === 0) return new Map()

  const client = await clientPromise
  const rows = await client
    .db("datawarehouse")
    .collection("dw_stockmovement")
    .aggregate([
      {
        $match: {
          month_year: { $in: ymList },
          ทะเบียน: { $nin: [null, ""] },
          partner_flag: { $nin: [null, ""] },
        },
      },
      {
        $group: {
          _id: { plate: "$ทะเบียน", month: "$month_year" },
          flag: { $last: "$partner_flag" },
        },
      },
    ])
    .toArray()

  const map = new Map<string, string>()
  for (const r of rows as any[]) {
    const mm = ymToMonthKey(r._id.month)
    if (!mm) continue
    map.set(`${normPlate(r._id.plate)}|${mm}`, r.flag)
  }

  byMonthCache.set(ck, { at: Date.now(), map })
  return map
}

/** Plates whose latest flag is in the requested set (normalized, no spaces). */
export async function platesForFlags(flagsCsv: string): Promise<string[] | null> {
  const flags = new Set(flagsCsv.split(",").map((f) => f.trim()).filter(Boolean))
  if (flags.size === 0) return null
  const map = await getPlateFlagMap()
  return [...map.entries()].filter(([, f]) => flags.has(f)).map(([p]) => p)
}
