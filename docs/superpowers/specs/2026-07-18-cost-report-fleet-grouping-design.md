# Cost Report — Fleet Grouping

**Date:** 2026-07-18
**Status:** Approved design, pending implementation

## Goal

Add fleet grouping to `/cost-report`, matching the fleet controls on
`/truck_utilize_analysis`. Two capabilities:

1. **Filter** — a fleet pill row that narrows every existing slide to the
   selected fleets.
2. **Breakdown** — a new slide where fleet is the aggregation axis.

## Constraint

No MongoDB pipeline changes. Cost aggregation stays exactly as it is today;
all fleet logic lives in a new MySQL-backed API route plus client code.

## Background: why this is not a simple group-by

Cost and fleet live in different databases.

- Cost: MongoDB `datawarehouse.dw_stockmovement`, keyed by plate (`ทะเบียน`).
  **No fleet field exists on it.**
- Fleet: MySQL `performance_vehicle_daily.fleet_group_id` (`"1".."8"` →
  ML/MS/TDM/BTG/TFG/SCCC/DHL/KN).

Fleet can only be derived from plate, so any endpoint without a plate in its
group key cannot be fleet-tagged.

| Endpoint | Group key | Has plate? |
|---|---|---|
| `/api/cost/detail` | `{month_year, ทะเบียน, ...}` | yes |
| `/api/cost/summary` | `{month_year, warehouse, partner_flag, group_value}` | no |
| `/api/cost/counts` | `{_id: null}` | no |

Two findings make the no-Mongo constraint workable.

**Finding 1 — detail already contains everything summary has.** Each detail
line carries `จุดประสงค์` (`app/api/cost/detail/route.ts:61`), and cost-report
hardcodes its summary group-by to exactly that field
(`app/cost-report/page.tsx:211`). Both endpoints `$sum` the same `total_cost`
over the same `$match`. Summary is therefore fully derivable from detail on the
client — and detail is plate-level, so it can be fleet-tagged.

**Finding 2 — no existing API yields a usable plate→fleet map.**
`/api/truck-utilize` caps at `page_size=100` (`route.ts:4`); `?export=true`
returns every daily row unbounded (`route.ts:54-59`), roughly 180k rows per
year. Neither is viable. One new thin route is required.

## Design decisions

**Month-aware bridge.** The map is keyed by plate *and* month, so a truck that
moves ML→TDM in April has Jan–Mar cost credited to ML and April onward to TDM.
A flat plate→fleet map would retroactively re-credit a moved truck's entire
history, silently shifting last year's numbers.

**Client-side filtering.** The bridge API returns all fleets; pills filter in
memory. This mirrors `/truck_utilize_analysis`, where the API always returns
every fleet and `activeFleets` (`page.tsx:284`) drives the view. Pill toggles
cost zero refetches.

**Unmapped plates are visible, never dropped.** Plates with no fleet match fall
into a `"ไม่ระบุ"` bucket that always renders. Discarding them would break
reconciliation of the KPI totals.

## Components

### `lib/fleets.ts` (new)

Shared constants, currently copy-pasted across four sites:
`truck_utilize_analysis/page.tsx:39-47`,
`api/truck-utilize/export/route.ts:12-14`,
`api/breakdown-rate/customers/route.ts:6-19`, and partially
`cost-report/page.tsx:62-63` (`FLEET_ML`/`FLEET_MS`).

```ts
export const FLEET_MAP: Record<string, string>
export const FLEET_ORDER: string[]
export const FLEET_COLORS: Record<string, string>
export const EXCLUDED_PLATES: string[]
export const UNKNOWN_FLEET = "unknown"
```

All four sites repoint here. This is in scope because the feature needs the
constants in a fifth place; leaving a fifth copy is the wrong trade.

### `app/api/fleet/plate-map/route.ts` (new, MySQL only)

```sql
SELECT DISTINCT REPLACE(license_plate,' ','') AS plate, month_year, fleet_group_id
FROM performance_vehicle_daily
WHERE license_plate NOT LIKE '%(%'
  AND license_plate NOT IN (<EXCLUDED_PLATES>)
  AND month_year >= ? AND month_year <= ?
```

Params `start` / `end` in `"MM-YY"` — the format `toBdKey()` already produces.

```ts
{ success: true, data: { "70-1234|01-26": "1", "70-1234|04-26": "3" } }
```

Roughly 500 trucks × 12 months ≈ 6k entries ≈ 150KB. Follows the caching
approach of `lib/plate-partner.ts` (10-minute in-process cache).

### `app/cost-report/page.tsx` (modified)

**Fetch.** Two calls added to the `Promise.all` at `:213-222` (current and
previous range), paired the way the breakdown fetches already are. The bridge
is fetched in `fetchAll` only — *not* in the chip-change effect at `:240-263`,
since fleet mapping is independent of warehouse and partner_flag.

**Tag.** One `useMemo` walks `detCurr`/`detPrev` and attaches `fleet` per row:

```ts
map[normPlate(row.plate) + "|" + toBdKey(row.month_year)] ?? UNKNOWN_FLEET
```

`normPlate` comes from `lib/plate-partner.ts:9` and must be applied on **both**
sides of the join.

**Re-source the aggregates.** The substantive change. `groupAggs` (`:298-317`)
currently folds over `fCurr`/`fPrev` (summary-derived). It is rewritten to fold
over fleet-tagged detail lines, keyed on `getCostGroup(line.จุดประสงค์)`.
`totalCurr`/`totalPrev` (`:295-296`) follow. Everything downstream —
`chartSeries`, `overviewChart`, the KPI row — then honours the fleet pills
with no further change.

The `/api/cost/summary` fetch is retained: it remains the source for the
warehouse and partner-flag chip option lists (`:266-273`). It stops driving any
displayed number.

**Counts.** `/api/cost/counts` cannot be fleet-filtered, so `plate_count`,
`total_cost`, `wd_count` and `product_count` are recomputed from tagged detail
(`wd` sits on each row, `รหัสสินค้า` on each line).

**UI.** A fleet pill row beside the existing chips at `:707-742`, reusing
`toggleSet` and adding `FLEET_COLORS` plus an All/Clear toggle, lifted from
`truck_utilize_analysis:451-469`. A new "ต้นทุนตามฟลีต" slide showing cost per
fleet and month trend; truck counts for a per-truck metric come from `bdCurr`'s
`truck_count`.

## Risks

**Plate format divergence.** MySQL plates carry spaces; Mongo `ทะเบียน` may
differ in more than whitespace. If normalization does not reconcile them, the
bridge needs a different join key and this design changes materially. This is
verified before any code is written.

**Re-sourcing slide 1.** Every headline number changes provenance from summary
to detail. Mitigated by a temporary debug readout showing summary-derived and
detail-derived totals side by side during development, removed before merge.

## Acceptance criteria

1. With no chips set and all fleets selected, detail-derived `totalCurr` equals
   the current summary-derived value. This single number proves the
   re-sourcing.
2. Toggling fleet pills changes the KPI row, the monthly chart and all
   group-level slides, with no network request.
3. A plate that changed fleet mid-range has its cost split across both fleets
   at the correct month boundary.
4. Unmapped plates appear under `"ไม่ระบุ"`; the sum across all fleet buckets
   equals the unfiltered total.
5. The new slide is picked up by the existing print and PNG export paths.

## Out of scope

- Changes to any MongoDB aggregation pipeline.
- Fleet grouping on pages other than `/cost-report`.
- Reconciling `EXCLUDED_PLATES` dummy-plate handling between the cost and
  utilization reports.
