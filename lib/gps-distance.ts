import type { Db, Document } from "mongodb"

export const UNKNOWN = "ไม่ระบุ"

/**
 * Every GPS vendor lands in its own `distance_*` collection. Discovered at call
 * time rather than listed, so a newly onboarded vendor is picked up without a
 * code change.
 */
export async function distanceCollections(db: Db) {
  const cols = await db.listCollections({ name: { $regex: "^distance_" } }).toArray()
  return cols.map((c) => c.name).sort()
}

export function sourceOf(collection: string) {
  return collection.replace(/^distance_/, "")
}

/**
 * A truck cannot cover more than this in one day (≈ 24 h at 62 km/h). Readings
 * above it are a broken odometer, not driving — the worst seen was 4,224 km in
 * a day from cartrack. They would win the per-day max and inflate the total, so
 * they are dropped and the next vendor's reading for that day wins instead.
 * Negative readings (an odometer that ran backwards) are dropped the same way.
 */
export const MAX_DAY_KM = 1500

/** Vendors normally land by D+1, terminus by D+2; later than this is a stall. */
export const STALE_AFTER_DAYS = 3

export type VendorStatus = "ok" | "stale" | "zero"

export type VendorHealth = {
  source: string
  firstDate: string
  lastDate: string
  /** newest day this vendor reported any distance above 0 */
  lastNonZero: string
  /** days between the newest day of any vendor and this vendor's newest day */
  lagDays: number
  /** trailing days at the end of this vendor's data where every truck read 0 */
  zeroDays: number
  status: VendorStatus
}

function dayDiff(from: string, to: string) {
  if (!from || !to) return 0
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/**
 * Status of each vendor feed. "stale" = stopped sending; "zero" = still sending
 * but every truck reads 0 km (HINO since 2026-10-09: the API answers 200 with
 * all-zero rows). Both look like "the fleet parked" on the page unless named.
 */
export function vendorHealth(
  feeds: { source: string; firstDate: string; lastDate: string; lastNonZero: string }[],
  maxDate: string
): VendorHealth[] {
  return feeds.map((f) => {
    const lagDays = dayDiff(f.lastDate, maxDate)
    const zeroDays = f.lastNonZero ? dayDiff(f.lastNonZero, f.lastDate) : dayDiff(f.firstDate, f.lastDate) + 1
    const status: VendorStatus =
      lagDays > STALE_AFTER_DAYS ? "stale" : zeroDays >= STALE_AFTER_DAYS ? "zero" : "ok"
    return { ...f, lagDays, zeroDays, status }
  })
}

/**
 * Newest day every *live* vendor has reached. A stalled vendor is left out —
 * otherwise one feed that stopped weeks ago would pin the page's default window
 * to its last day (BESTTECH stopped at 2026-11-01 and dragged the default with it).
 */
export function completeThrough(health: VendorHealth[], maxDate: string) {
  const live = health.filter((h) => h.status !== "stale" && h.lastDate).map((h) => h.lastDate).sort()
  return live[0] ?? maxDate
}

// Vendors disagree on the distance field name (distance_songdee uses
// total_distance_km), so normalise it before anything is unioned.
const RAW_KM = { $ifNull: ["$distance_km", { $ifNull: ["$total_distance_km", 0] }] }

function vendorStage(match: Document): Document[] {
  return [
    { $match: match },
    {
      $project: {
        _id: 0,
        vehicle_no: 1,
        date_key: 1,
        fleet: 1,
        branch: 1,
        brand: 1,
        plant: 1,
        source: 1,
        // null drops the reading from $max below; see MAX_DAY_KM.
        km: {
          $cond: [{ $and: [{ $gte: [RAW_KM, 0] }, { $lte: [RAW_KM, MAX_DAY_KM] }] }, RAW_KM, null],
        },
      },
    },
  ]
}

/**
 * Per-vehicle distance rolled up from every vendor collection.
 *
 * The rule that makes this non-trivial: a truck can carry two GPS units that
 * report wildly different numbers for the same day (one real case: 163 km from
 * terminus vs 4,413 km from besttech in one month). So the highest reading for
 * each (vehicle, day) wins and those daily winners are summed — never the
 * vendors' monthly totals, because vendors cover different days, and never a
 * plain sum across vendors, which double-counts by ~12%.
 *
 * @param match     filter applied inside each vendor collection (date scope, plates…)
 * @param postMatch stages appended AFTER fleet/branch are resolved across vendors.
 *                  Filtering on those fields earlier would drop a vendor's rows
 *                  merely because that vendor left the field null.
 * @param opts.daily also return `days: [{ d, km }]` — the winning reading of each
 *                  day, the same numbers the totals are built from. Off by
 *                  default: it is one array per vehicle that only the Excel
 *                  export needs, and the dashboard would carry it for nothing.
 */
export function distancePipeline(
  collections: string[],
  match: Document,
  postMatch: Document[] = [],
  opts: { daily?: boolean } = {}
): Document[] {
  const [, ...rest] = collections

  return [
    ...vendorStage(match),
    ...rest.map((name) => ({ $unionWith: { coll: name, pipeline: vendorStage(match) } })),

    // Feeds $first below, so the winning vendor is known per day.
    { $sort: { km: -1 } },
    {
      $group: {
        _id: { v: "$vehicle_no", d: "$date_key" },
        km: { $max: "$km" },
        winner: { $first: "$source" },
        sources: { $addToSet: "$source" },
        // $max skips nulls, so a vendor that left fleet/branch blank does not
        // erase the value another vendor filled in.
        fleet: { $max: "$fleet" },
        branch: { $max: "$branch" },
        brand: { $max: "$brand" },
        plant: { $max: "$plant" },
      },
    },
    // A day whose every reading was implausible keeps its row (the truck did
    // report) but counts as 0 km rather than null.
    { $set: { km: { $ifNull: ["$km", 0] } } },

    {
      $group: {
        _id: "$_id.v",
        distanceKm: { $sum: "$km" },
        activeDays: { $sum: { $cond: [{ $gt: ["$km", 0] }, 1, 0] } },
        dataDays: { $sum: 1 },
        maxDayKm: { $max: "$km" },
        firstDay: { $min: "$_id.d" },
        lastDay: { $max: "$_id.d" },
        fleet: { $max: "$fleet" },
        branch: { $max: "$branch" },
        brand: { $max: "$brand" },
        plant: { $max: "$plant" },
        usedSources: { $addToSet: "$winner" },
        sourceSets: { $addToSet: "$sources" },
        overlapDays: { $sum: { $cond: [{ $gt: [{ $size: "$sources" }, 1] }, 1, 0] } },
        // Unordered on purpose — the rows above are sorted by km, not by date.
        // Callers key this by date rather than by position. Left unrounded so
        // the day values still sum to distanceKm, and so a crawl of a few metres
        // does not reach the caller as a flat 0 while activeDays counts it.
        ...(opts.daily ? { days: { $push: { d: "$_id.d", km: "$km" } } } : {}),
      },
    },

    {
      $project: {
        _id: 0,
        vehicleNo: "$_id",
        fleet: { $ifNull: ["$fleet", UNKNOWN] },
        branch: { $ifNull: ["$branch", UNKNOWN] },
        brand: { $ifNull: ["$brand", UNKNOWN] },
        plant: { $ifNull: ["$plant", ""] },
        distanceKm: { $round: ["$distanceKm", 1] },
        activeDays: 1,
        dataDays: 1,
        firstDay: 1,
        lastDay: 1,
        maxDayKm: { $round: ["$maxDayKm", 1] },
        avgDayKm: {
          $round: [
            {
              $cond: [
                { $gt: ["$activeDays", 0] },
                { $divide: ["$distanceKm", "$activeDays"] },
                0,
              ],
            },
            1,
          ],
        },
        usedSources: 1,
        allSources: {
          $reduce: {
            input: "$sourceSets",
            initialValue: [],
            in: { $setUnion: ["$$value", "$$this"] },
          },
        },
        overlapDays: 1,
        ...(opts.daily ? { days: 1 } : {}),
      },
    },

    ...postMatch,
    { $sort: { distanceKm: -1 } },
  ]
}
