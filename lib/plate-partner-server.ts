import clientPromise from "@/lib/mongo"
import { normPlate } from "@/lib/plate-partner"

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

/** Plates whose latest flag is in the requested set (normalized, no spaces). */
export async function platesForFlags(flagsCsv: string): Promise<string[] | null> {
  const flags = new Set(flagsCsv.split(",").map((f) => f.trim()).filter(Boolean))
  if (flags.size === 0) return null
  const map = await getPlateFlagMap()
  return [...map.entries()].filter(([, f]) => flags.has(f)).map(([p]) => p)
}
