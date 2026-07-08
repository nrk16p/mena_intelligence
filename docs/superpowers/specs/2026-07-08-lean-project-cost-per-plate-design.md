# Lean Project — Cost per Plate Analysis (v1)

Date: 2026-07-08
Status: Approved design

## Purpose

First page of a new "Lean Project" sidebar group: a yearly pivot of maintenance
cost by cost group, split into two warehouse buckets. Answers: "How much does
each cost group cost per year, per warehouse region?"

Plate-level drill-down is explicitly **out of scope for v1** (page is named
"Cost per Plate" because plate-level analysis is the roadmap; v1 shows the
cost-group × year pivot only).

## Data

- Source: MongoDB `datawarehouse.dw_stockmovement` (same as `/cost`).
- Fields used: `month_year` ("YYYY-MM"), `จุดประสงค์ในการเบิก`, `คลังสินค้า`, `total_cost`.
- Cost groups: same mapping as `/cost` (`COST_GROUP_MAP`):
  PM - Preventive Maintenance, CM - Corrective Maintenance, Tools & Equipment,
  T - Tire, AC - Accident Repair, Other (fallback).
- Warehouse buckets (exact values confirmed in collection):
  - `ลาดกระบัง + ขอนแก่น` = `คลังลาดกระบัง`, `คลังขอนแก่น`
  - `สระบุรี + DIST` = `คลังสระบุรี`, `คลัง DIST`
  - Any unexpected new warehouse value falls into an `อื่น ๆ` bucket so data is
    never silently dropped.

## Components

### 1. Shared cost-group map — `lib/cost-groups.ts` (new)

Extract `COST_GROUP_MAP` + `getCostGroup()` out of `app/cost/page.tsx` into
`lib/cost-groups.ts`; `app/cost/page.tsx` imports from there (no behavior
change). The new API imports the same map so grouping can never drift.

### 2. API — `app/api/lean-project/cost-per-plate/route.ts` (new)

GET, no params in v1. Pipeline over `dw_stockmovement`:

1. `$group` by `{ year: $substrCP(month_year, 0, 4), จุดประสงค์ในการเบิก, คลังสินค้า }`,
   `$sum: total_cost`.
2. In JS: map จุดประสงค์ → cost group, คลังสินค้า → warehouse bucket,
   re-aggregate, return rows:
   `{ warehouse_group, cost_group, year, total_cost }`.

Response: `{ success, data }`. Error handling identical to `api/cost/summary`
(try/catch → 500 with message).

### 3. Page — `app/lean-project/cost-per-plate/page.tsx` (+ `layout.tsx`)

Client component; layout.tsx copied from `app/cost/layout.tsx` (same auth/shell
wrapper). Fetches the API once on mount, renders a single pivot table:

- Columns: years discovered dynamically from data (sorted asc) + Total.
- Rows: section header per warehouse bucket → cost-group rows (fixed sort
  order: PM, CM, Tools & Equipment, T - Tire, AC, Other; omit rows with no
  data) → Subtotal per bucket → Grand Total row.
- Baht-formatted numbers (`toLocaleString`), light/dark styling consistent
  with existing pages. Loading and error states.

### 4. Sidebar — `components/sidebar.tsx` (edit)

New `NavGroup` "Lean Project" appended after "Procurement":

- `permissionKey: "lean-project"`, cyan color scheme (dot/icon/active states),
  icon: e.g. `TrendingUp` or `Gauge`.
- One item: `{ href: "/lean-project/cost-per-plate", label: "Cost per Plate" }`.

Access note: group is permission-gated like all others — grant `lean-project`
to the relevant user group in `/admin/groups` after deploy.

## Error handling

- API: 500 with message on Mongo failure (existing pattern).
- Page: error banner with retry; empty-state message if no data.

## Testing

Manual verification on local dev (http://localhost:3001):

1. API returns rows covering all 4 warehouses mapped into 2 buckets; spot-check
   one bucket-year total against a direct Mongo aggregate.
2. `/cost` page unchanged after the `COST_GROUP_MAP` extraction.
3. Page renders pivot with correct subtotals/grand total; dark mode OK.

## Out of scope (v1)

Plate-level rows, warehouse/partner filters, charts, CSV export, month
granularity.
