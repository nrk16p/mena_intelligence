// Pure SQL builder for app/api/fleet/plate-map/route.ts, split out so it can
// be unit-tested without a live MySQL connection. Keep this file free of
// server-only imports (mysql/mongo) for the same reason lib/fleets.ts and
// lib/plate-partner.ts are: it must stay safe to import from client bundles.
//
// month_year is stored as "MM-YY" text. A naive SQL range comparison
// (month_year >= start AND month_year <= end) sorts lexicographically by
// month before year — e.g. 01-26..07-26 would also match 02-25, 03-25, etc.
// The caller must expand the range to an explicit month list (see
// lib/fleets.ts monthsBetween) and pass it here to filter with `IN (...)`.
// Regression guard: this function must never emit `month_year >=` / `<=`.

export function buildPlateMapQuery(
  months: string[],
  excludedPlates: string[],
): { sql: string; params: string[] } {
  if (months.length === 0) {
    throw new Error("buildPlateMapQuery requires at least one month (caller must check monthsBetween() first)")
  }

  const excludedPlaceholders = excludedPlates.map(() => "?").join(",")
  const monthPlaceholders = months.map(() => "?").join(",")

  const sql = `
    SELECT DISTINCT REPLACE(license_plate, ' ', '') AS plate, month_year, fleet_group_id
      FROM performance_vehicle_daily
     WHERE license_plate NOT LIKE '%(%'
       AND license_plate NOT IN (${excludedPlaceholders})
       AND month_year IN (${monthPlaceholders})
       AND fleet_group_id IS NOT NULL
  `

  return { sql, params: [...excludedPlates, ...months] }
}
