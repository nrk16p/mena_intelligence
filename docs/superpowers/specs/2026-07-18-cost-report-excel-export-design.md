# Cost Report — Excel Export

**Date:** 2026-07-18
**Status:** Approved design, pending implementation
**Depends on:** the fleet-grouping branch (`feat/cost-report-fleet-grouping`) and its
final-review fix wave, both of which must land first — this feature exports the
fleet-tagged data those changes produce.

## Goal

Add a single "Export Excel" action to `/cost-report` that writes the report's
tables to a multi-sheet `.xlsx` file.

## Scope

Five sheets, mirroring the slides already in the deck. **Line-level raw rows are
explicitly out of scope** — the user removed them from the design. That decision
is what keeps this feature cheap; see Performance below.

```
mm-report_2026-01_2026-07.xlsx

1. สรุป           KPI totals, YoY, and the active filters
2. ตามฟลีต        Fleet × Month pivot, 2569 and 2568 rows, รวม column
3. กลุ่มต้นทุน     CM / PM / ยาง / อุบัติเหตุ / เครื่องมือ / อื่นๆ × เดือน
4. อู่ใน-อู่นอก     in-house vs outside workshop split
5. รายคัน          per-plate × month, months as columns, with fleet tag
```

## Performance

**No database or server impact.** `detCurr` and `detPrev` are already loaded when
the page renders; the export reads what is in memory. No new queries, nothing
touches `dw_stockmovement`.

Cost is client-side CPU only, and it is small. The largest sheet is `รายคัน` at
roughly 850 rows × ~9 columns. Everything else is tens to low hundreds of rows.
Expected generation well under one second, peak memory ~25 MB.

Consequently: **no Web Worker, no size guard, no progress UI beyond a disabled
button.** A plain synchronous handler, as in `app/pm-cost-main/page.tsx:454-476`.

Had the line-level sheet been included it would have been ~27,000–180,000 rows
depending on the average lines per plate-row (a figure never measured), which
would have blocked the main thread for 8–25 s and required a Worker. Dropping it
removed that entire problem.

## Conventions to follow

The repo has **no shared export helper** — all eight existing exports are
bespoke and inline. A consistent de-facto convention has emerged; follow it
rather than inventing a new one or extracting a helper as part of this work.

- Build rows as arrays of object literals with **Thai display strings as keys** —
  those keys become the header row.
- Coerce numerics with `+n.toFixed(2)` so Excel treats them as numbers; use `""`
  for nulls.
- Column widths via `ws["!cols"] = [{ wch: 14 }, …]`, as in
  `app/pm-cost-main/page.tsx:469-471`.
- `XLSX.write(wb, { bookType: "xlsx", type: "array" })` → `Blob` → `saveAs`,
  using the full MIME
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  (`app/asia-incentive/page.tsx` uses `application/octet-stream`; the majority
  and better-behaved choice is the full type.)
- Multi-sheet structure follows `app/stock-budget-ladkrabang/page.tsx:1180-1244`:
  summary sheet first, detail sheets after.

**Cell styling is not available.** The community build of `xlsx@0.18.5` supports
no bold headers, no number formats, no merged cells — only `!cols`. Do not
attempt it; there are zero occurrences of `!merges` or cell `s:` objects in the
repo for this reason.

## UI

A button in the controls card, immediately after `🖨 Export PDF`
(`app/cost-report/page.tsx:1022-1025`), reusing that button's exact class string:

```
rounded-xl border bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50
```

Label `📊 Export Excel`. This page uses emoji-prefixed labels rather than the
lucide `<Download>` icon other pages use — match the local file.

Disabled when `!hasData`. No loading state is needed at this data size.

## Filters

The export follows the on-screen filters — fleet pills, warehouse chips and
partner-flag chips — so the file matches what the user is looking at.

**The active filter selection is written into the header rows of sheet 1.** A
spreadsheet is forwarded and re-read out of context far more readily than a PNG,
so a file filtered to one fleet must say so on its face. This is the same
misreporting risk the fleet-grouping branch's final review raised about the PDF
export, where an ML-only deck was labelled identically to a full-company deck.

## Data sources

All sheets derive from the fleet-tagged, filtered arrays (`fdCurr` / `fdPrev`)
and the memos already computed for the on-screen slides — `fleetPivot`,
`groupAggs`, `wsAgg`, `countsCurrLocal` / `countsPrevLocal`. The export must not
re-derive aggregates from the raw `detCurr` / `detPrev`, both because that would
bypass the fleet filter and because the branch's final review specifically
identified reading the raw lineage as the cause of two Important bugs.

Sheet 5 requires one new aggregation not currently on the page: per-plate cost
keyed by month, with the plate's fleet. Build it from `fdCurr` — every row
already carries `plate`, `month_year`, `plate_total` and `fleet`. Exclude rows
flagged `isAllocated`, which are synthetic office-allocation rows carrying an
office plate rather than a real vehicle.

## Acceptance criteria

1. The workbook opens in Excel with Thai headers rendering correctly.
2. Sheet 2's `รวม` figure equals the on-screen pivot's `รวม` row.
3. Sheet 1's total equals the on-screen KPI total.
4. With a fleet pill active, every sheet reflects that filter, and sheet 1 names
   the active filters.
5. Sheet 5 excludes `isAllocated` rows, and its plate count matches the KPI
   `plate_count`.
6. Export completes in under a second with no visible freeze.

## Out of scope

- Line-level / raw item rows (removed by the user).
- Cell styling, which the installed `xlsx` build cannot do.
- Extracting a shared export helper for the repo's other eight exports.
- Server-side generation, unnecessary at this data size.
