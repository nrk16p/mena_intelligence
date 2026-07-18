# Cost Report — Cost-Group Filter

**Date:** 2026-07-18
**Status:** Approved design, pending implementation
**Depends on:** `feat/cost-report-fleet-grouping` (24 commits, pushed)

## Goal

Add a cost-group filter to `/cost-report` — CM / PM / ยาง / อุบัติเหตุ /
เครื่องมือ / อื่นๆ — as a multi-select chip row alongside the existing
warehouse, partner-flag and fleet filters.

## The structural difference from every other filter on this page

The three existing filters operate on **rows**. Each plate-row has exactly one
warehouse, one partner_flag, one fleet, so filtering is a row predicate:

```ts
rows.filter((r) => selected.has(r.fleet))
```

**Cost group is line-level.** A single plate-row's `lines[]` spans several cost
groups — one truck in one month typically carries CM, PM and tyre lines at once.
There is no row-level cost group to filter on.

So this filter must reach *inside* each row, keep the matching lines, and
recompute `plate_total` from what survives. A row whose lines are all excluded
drops out entirely.

```ts
const cgFilter = (rows: TaggedPlateRow[]): TaggedPlateRow[] => {
  if (selectedGroups.size === 0) return rows
  const out: TaggedPlateRow[] = []
  for (const r of rows) {
    const lines = r.lines.filter((ln) => selectedGroups.has(getCostGroup(ln.จุดประสงค์)))
    if (lines.length === 0) continue
    out.push({ ...r, lines, plate_total: lines.reduce((s, ln) => s + ln.cost, 0) })
  }
  return out
}
```

Applied **after** `fleetFilter`, so the two compose: `cgFilter(fleetFilter(tagged))`.

### Consequences to expect, not to treat as bugs

- **`plate_count` moves, sometimes a lot.** Filtering to `อุบัติเหตุ` leaves
  only trucks that actually had accident work — perhaps 40 of 836. That is the
  correct answer, not a defect.
- **Office allocation still holds.** Allocated rows carry lines already scaled by
  the allocation share, so line-level filtering scales proportionally with them.
  No special handling.
- **Every downstream consumer follows automatically**, because they all read
  `fdCurr`/`fdPrev`: `totalCurr`, `groupAggs`, `fleetPivot`, `countsCurrLocal`,
  and the Excel export.

## Behaviour

**Selection.** Multi-select chips matching the page's existing convention: empty
Set means "no filter, show everything"; All/Clear toggle. Same `toggleSet`
helper and styling as the warehouse and partner-flag rows.

**Per-cost-group slides.** Slides 3+ render one slide per cost group. Under a
filter they all **remain in the deck** so the printed page count stays stable.
An unselected group's slide renders with its layout intact but visually muted,
carrying an explicit badge (`ไม่ได้เลือกในตัวกรอง`) rather than a zero-filled
chart — a chart of zeros reads as a data fault, a badge does not.

**Filter tags.** `hasFilters` gains `selectedGroups`, and `FilterTags` renders
the selected group labels, so a filtered PDF/PNG export says what it is showing.
This is the same requirement the fleet filter's final review imposed.

**Excel export.** Sheet 1's filter block gains a `กลุ่มต้นทุนที่เลือก` line.
All five sheets follow the filter automatically via `fdCurr`/`fdPrev`.

## Components

- `lib/cost-groups.ts` already holds the canonical mapping. `app/cost-report/page.tsx:67-81`
  re-declares `COST_GROUP_MAP` inline, with an extra `"PM ความเเย็น"` entry using
  a doubled สระเอ — a real misspelling present in the data. **Do not consolidate
  these as part of this work**; the inline copy is load-bearing and the
  divergence deserves its own change.
- `GROUP_ORDER` in the page gives the canonical chip order.
- `getCostGroup(จุดประสงค์)` is the existing line → group function. Reuse it; do
  not reimplement the mapping.

## Acceptance criteria

1. With no groups selected, every number is identical to today.
2. Selecting all six groups produces the same totals as selecting none —
   the same All-equals-Clear invariant the fleet filter had to satisfy.
3. Selecting CM+PM gives a total equal to the sum of CM alone and PM alone.
4. The six groups selected individually partition the unfiltered total exactly,
   allowing for display rounding.
5. `plate_count` reflects only trucks with lines in the selected groups.
6. Unselected cost-group slides remain in the deck, muted and badged, and the
   printed page count is unchanged.
7. Fleet pills and cost-group chips compose: ML + CM shows ML's CM cost.
8. `FilterTags` names the selection, and it survives print.
9. The Excel export follows the filter and names it in sheet 1.

## Out of scope

- Consolidating the duplicated `COST_GROUP_MAP`.
- Filtering by `กลุ่มสินค้า` (product group) or `รหัสสินค้า` — different axes.
- Server-side filtering; this stays client-side like every other filter here.
