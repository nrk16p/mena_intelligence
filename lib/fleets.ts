import { normPlate } from "@/lib/plate-partner"

// Shared fleet constants. Previously duplicated in truck_utilize_analysis/page.tsx,
// api/truck-utilize/export/route.ts, api/breakdown-rate/customers/route.ts and
// cost-report/page.tsx.
// Plate-join coverage (measured Task 0, range Jan–Jul 2026): 85.8% of cost maps
// to a fleet by exact plate+month against performance_vehicle_daily; 83.7% for
// 2026-07 alone. The remainder has no MySQL operations row for that month and is
// bucketed by partner_flag instead (see the fallback buckets below).

export const FLEET_MAP: Record<string, string> = {
  "1": "ML", "2": "MS", "3": "TDM", "4": "BTG",
  "5": "TFG", "6": "SCCC", "7": "DHL", "8": "KN",
}

export const FLEET_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8"]

export const FLEET_COLORS: Record<string, string> = {
  "1": "#3b82f6", "2": "#6366f1", "3": "#10b981", "4": "#f97316",
  "5": "#ec4899", "6": "#8b5cf6", "7": "#ef4444", "8": "#eab308",
}

// ── Fallback buckets ──────────────────────────────────────────────────────────
// A plate with no MySQL operations record for a given month has no fleet, so it
// is bucketed by its Mongo partner_flag instead. These share the id space with
// the numeric fleet ids, so their values must never collide with "1".."8".

/** partner_flag "รถสำนักงาน" — office vehicles, allocated across fleets later. */
export const BUCKET_OFFICE = "office"
/** partner_flag starting with "รถร่วม" — subcontracted trucks. */
export const BUCKET_PARTNER = "partner"
/** partner_flag "รถมีนา" — newly acquired trucks not yet onboarded to ops. */
export const BUCKET_NEW = "new"
/** No fleet match and no usable partner_flag. Rendered, never dropped. */
export const BUCKET_UNKNOWN = "unknown"

/**
 * @deprecated Alias of {@link BUCKET_UNKNOWN}, kept so existing call sites keep
 * compiling. Same value by construction — do not redeclare it independently.
 */
export const UNKNOWN_FLEET = BUCKET_UNKNOWN

export const EXCLUDED_PLATES: string[] = [
  "C001-01-01","C001-01-02","C001-01-03","C001-01-04",
  "F001-01-01","F001-01-02","F001-01-03","F001-01-04",
  "JRC001-01-01","KP001-01-01","KP001-01-02","RP001-01-01",
  "TPI.00-0000","TN01-001","TN01-002","TH001-01","TH001-02","TH001-03","TH001-04","AS001-01",
  "0001-01","0001-02","ACO-001","O001-01-01",
  "U001-01-01","U001-01-02","ZY001-01","ZY001-02",
  "สบ.00-0000","สบ.00-0001","สบ.00-0002","สบ.00-0003","สบ.00-0004",
  "สบ.00-0005","สบ.00-0006","สบ.00-0007","สบ.00-0008","สบ.00-0009",
  "สบ.00-0010","สบ.00-0011","สบ.00-0012","สบ.00-0013","สบ.00-0014",
  "สบ.00-0015","สบ.00-0016","สบ.00-0017","สบ.00-0018","สบ.00-0019",
  "สบ.00-0020",
  "สบ.00-00000","สบ.00-00002",
]

const BUCKET_LABELS: Record<string, string> = {
  [BUCKET_OFFICE]:  "สำนักงาน",
  [BUCKET_PARTNER]: "รถร่วม",
  [BUCKET_NEW]:     "รถใหม่ (ยังไม่เข้าระบบ ops)",
  [BUCKET_UNKNOWN]: "ไม่ระบุ",
}

/** Display label for a fleet id or a fallback bucket. Unrecognised → "ไม่ระบุ". */
export function fleetLabel(id: string): string {
  return FLEET_MAP[id] ?? BUCKET_LABELS[id] ?? "ไม่ระบุ"
}

/** Join key for the plate→fleet bridge. month is "MM-YY". */
export function fleetKey(plate: string, monthMMYY: string): string {
  return `${normPlate(plate)}|${monthMMYY}`
}

/**
 * "YYYY-MM" (Mongo dw_stockmovement.month_year, cost detail month_year)
 * → "MM-YY" (the bridge / fleetKey convention). Returns "" on malformed input.
 * Mirrors the toBdKey helper in app/cost-report/page.tsx.
 */
export function ymToMonthKey(ym: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(ym ?? "")
  if (!match) return ""
  return `${match[2]}-${match[1].slice(2)}`
}

/** Inverse of {@link ymToMonthKey}. "YY" is 2000-based. Returns "" if malformed. */
export function monthKeyToYm(monthMMYY: string): string {
  const match = /^(\d{2})-(\d{2})$/.exec(monthMMYY ?? "")
  if (!match) return ""
  return `20${match[2]}-${match[1]}`
}

/**
 * Splits a single month's office (รถสำนักงาน) cost across fleets pro-rata by
 * truck count. Office cost is central overhead with no vehicle of its own, so
 * showing it as its own row makes any fleet-filtered view undercount the total.
 *
 * Returns exact fractional shares — deliberately unrounded, so the returned
 * values always sum back to `officeCost`. Rounding here would leak baht and
 * break the "filtered total == unfiltered total" invariant the callers rely on.
 *
 * Returns {} when no fleet has trucks (the caller must then keep the row in
 * BUCKET_OFFICE rather than drop it — cost must never vanish).
 */
export function allocateOffice(
  officeCost: number,
  trucksByFleet: Record<string, number>,
): Record<string, number> {
  let totalTrucks = 0
  for (const n of Object.values(trucksByFleet)) {
    if (Number.isFinite(n) && n > 0) totalTrucks += n
  }
  if (totalTrucks <= 0) return {}

  const out: Record<string, number> = {}
  for (const [fleet, n] of Object.entries(trucksByFleet)) {
    if (!Number.isFinite(n) || n <= 0) continue
    out[fleet] = (officeCost * n) / totalTrucks
  }
  return out
}

const MAX_MONTHS_SPAN = 120

/**
 * Expands a "MM-YY" range into the explicit list of months it spans,
 * inclusive of both endpoints, in chronological order.
 *
 * month_year is stored as "MM-YY" text, so a naive SQL range comparison
 * (month_year >= start AND month_year <= end) sorts lexicographically by
 * month before year — e.g. a 01-26..07-26 range would also match 02-25,
 * 03-25, etc. Building the exact month list here and filtering with
 * `IN (...)` avoids that trap entirely.
 *
 * "YY" is 2000-based ("26" -> 2026). Returns [] if start is after end, or if
 * the span exceeds MAX_MONTHS_SPAN months (guards against runaway input)
 * instead of throwing.
 */
export function monthsBetween(startMMYY: string, endMMYY: string): string[] {
  const parse = (mmYY: string): { month: number; year: number } | null => {
    const match = /^(\d{2})-(\d{2})$/.exec(mmYY)
    if (!match) return null
    const month = Number(match[1])
    const year = 2000 + Number(match[2])
    if (month < 1 || month > 12) return null
    return { month, year }
  }

  const start = parse(startMMYY)
  const end = parse(endMMYY)
  if (!start || !end) return []

  const startIndex = start.year * 12 + (start.month - 1)
  const endIndex = end.year * 12 + (end.month - 1)
  if (startIndex > endIndex) return []
  if (endIndex - startIndex + 1 > MAX_MONTHS_SPAN) return []

  const months: string[] = []
  for (let i = startIndex; i <= endIndex; i++) {
    const year = Math.floor(i / 12)
    const month = (i % 12) + 1
    const mm = String(month).padStart(2, "0")
    const yy = String(year % 100).padStart(2, "0")
    months.push(`${mm}-${yy}`)
  }
  return months
}
