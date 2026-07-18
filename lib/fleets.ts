import { normPlate } from "@/lib/plate-partner"

// Shared fleet constants. Previously duplicated in truck_utilize_analysis/page.tsx,
// api/truck-utilize/export/route.ts, api/breakdown-rate/customers/route.ts and
// cost-report/page.tsx.
// TODO(Task 0): Plate-join check — record the observed Mongo↔MySQL plate match
// rate here once the Task 0 spike has run.

export const FLEET_MAP: Record<string, string> = {
  "1": "ML", "2": "MS", "3": "TDM", "4": "BTG",
  "5": "TFG", "6": "SCCC", "7": "DHL", "8": "KN",
}

export const FLEET_ORDER = ["1", "2", "3", "4", "5", "6", "7", "8"]

export const FLEET_COLORS: Record<string, string> = {
  "1": "#3b82f6", "2": "#6366f1", "3": "#10b981", "4": "#f97316",
  "5": "#ec4899", "6": "#8b5cf6", "7": "#ef4444", "8": "#eab308",
}

/** Plates with no fleet match. Rendered, never dropped. */
export const UNKNOWN_FLEET = "unknown"

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

export function fleetLabel(id: string): string {
  return FLEET_MAP[id] ?? "ไม่ระบุ"
}

/** Join key for the plate→fleet bridge. month is "MM-YY". */
export function fleetKey(plate: string, monthMMYY: string): string {
  return `${normPlate(plate)}|${monthMMYY}`
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
