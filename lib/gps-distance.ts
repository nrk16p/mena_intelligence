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

// Vendors disagree on the distance field name (distance_songdee uses
// total_distance_km), so normalise it before anything is unioned.
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
        km: { $ifNull: ["$distance_km", { $ifNull: ["$total_distance_km", 0] }] },
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
 */
export function distancePipeline(
  collections: string[],
  match: Document,
  postMatch: Document[] = []
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
      },
    },

    ...postMatch,
    { $sort: { distanceKm: -1 } },
  ]
}
