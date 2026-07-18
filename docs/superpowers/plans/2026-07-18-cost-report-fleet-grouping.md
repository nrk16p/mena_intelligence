# Cost Report Fleet Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fleet filtering and a fleet-level breakdown slide to `/cost-report`, without changing any MongoDB aggregation.

**Architecture:** Fleet lives in MySQL (`performance_vehicle_daily.fleet_group_id`); cost lives in Mongo (`dw_stockmovement`), joined only by plate. A new MySQL-only route returns a month-aware `plate|MM-YY → fleet_group_id` map. The client tags plate-level `/api/cost/detail` rows with fleet, then re-sources the report's aggregates from tagged detail instead of `/api/cost/summary` (detail carries `จุดประสงค์`, the same field summary groups by).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, mysql2, MongoDB driver, Recharts, Tailwind. Vitest added in Task 1 for pure-function tests.

## Global Constraints

- **No MongoDB pipeline changes.** `app/api/cost/*/route.ts` aggregation stages must remain byte-identical. Verify with `git diff --stat app/api/cost/` before each commit.
- Month format for the fleet bridge is `"MM-YY"` (e.g. `"07-26"`), produced by the existing `toBdKey()` in `app/cost-report/page.tsx`. Cost data uses `"YYYY-MM"`. Never mix them.
- Plate normalization is `normPlate` from `lib/plate-partner.ts:9` (`String(s).replace(/\s+/g,"").trim()`), applied on **both** sides of every join.
- Plates with no MySQL fleet are bucketed by `partner_flag`, never dropped:

  | `partner_flag` | bucket | row | label |
  |---|---|---|---|
  | `รถสำนักงาน` | `BUCKET_OFFICE` | no — allocated into fleets | — |
  | `รถร่วม*` | `BUCKET_PARTNER` | yes | `รถร่วม` |
  | `รถมีนา` | `BUCKET_NEW` | yes | `รถใหม่ (ยังไม่เข้าระบบ ops)` |
  | anything else / none | `BUCKET_UNKNOWN` | yes | `ไม่ระบุ` |

  `BUCKET_NEW` is MENA's own newly-acquired trucks, confirmed by the user on
  2026-07-18: they draw parts before ops onboarding completes, so they have
  cost but no `performance_vehicle_daily` record. They are a normal operating
  condition, not a data error — label them accurately rather than lumping them
  into `ไม่ระบุ`.

  `BUCKET_PARTNER`, `BUCKET_NEW` and `BUCKET_UNKNOWN` are all excluded from
  every per-truck denominator, since none of them has a truck count.
- The pivot's `รวม` row must equal the unfiltered KPI total. This is the
  single check that proves allocation neither double-counts nor drops cost.
- Fleet filtering is client-side only. Toggling a fleet pill must issue zero network requests.
- Existing UI copy stays Thai, matching surrounding text.

---

### Task 0: Confirm the plate join — ✅ RAN 2026-07-18, results below

**Outcome: 85.9% raw match, below the 90% gate — but the shortfall is
explained and does not invalidate the bridge.** Measured against production
for `07-26` / `2026-07`:

| | plates | share of cost |
|---|---|---|
| Exact plate+month match | 432 | **83.7%** |
| Rescued by nearest-month fallback | **0** | 0% |
| No MySQL ops record in any month | 71 | **16.3%** |

Ruled out by direct measurement: encoding differences (`สบ.` is byte-identical
on both sides, `e0b8aa e0b89a 2e`), a missing-prefix convention (bare numbers
like `70-3706` do not exist in MySQL), and month misalignment (a fallback to
the plate's nearest known month rescues zero plates).

The 71 unmatched plates are trucks absent from `performance_vehicle_daily`
entirely. `partner_flag` — already carried on the cost data — classifies them:

| partner_flag | plates | cost | treatment |
|---|---|---|---|
| `รถมีนา` | 45 | 10.1% | `BUCKET_UNKNOWN` — own row, flagged ⚠ |
| `รถสำนักงาน` | 3 | 3.0% | `BUCKET_OFFICE` — allocated across fleets |
| `รถร่วมมีนา` | 9 | 2.3% | `BUCKET_PARTNER` — own row |
| none | 13 | 0.9% | `BUCKET_UNKNOWN` |
| `รถร่วมภายนอกบริษัท` | 1 | 0.0% | `BUCKET_PARTNER` |

The `รถมีนา` group is MENA's own trucks drawing parts with no operations
record — an ops-data gap, surfaced in the pivot rather than hidden.

Note `ext_WD_data.ipynb` does **not** implement ปันลง allocation despite the
`office_plates` list in cell 2; it only tags those rows `รถสำนักงาน`. The
allocation in Task 7 is new behaviour, so `/cost-report` will deliberately
differ from `pivot_year_warehouse.xlsx` by the office share.

The original spike steps are retained below for reference; **do not re-run
them.**

**Files:**
- Create: `scripts/check-plate-join.mjs` (throwaway, deleted in Step 4)

- [ ] **Step 1: Write the check script**

```js
// scripts/check-plate-join.mjs — run once, then delete.
import mysql from "mysql2/promise"
import { MongoClient } from "mongodb"

const norm = (s) => String(s).replace(/\s+/g, "").trim()
const MY = "07-26", MONGO_MY = "2026-07"

const my = await mysql.createConnection(process.env.MYSQL_URL)
const [rows] = await my.execute(
  `SELECT DISTINCT license_plate, fleet_group_id
     FROM performance_vehicle_daily
    WHERE month_year = ? AND license_plate NOT LIKE '%(%' LIMIT 2000`, [MY])
const sqlPlates = new Set(rows.map((r) => norm(r.license_plate)))

const mongo = await new MongoClient(process.env.MONGODB_URI).connect()
const mPlates = await mongo.db("datawarehouse").collection("dw_stockmovement")
  .distinct("ทะเบียน", { month_year: MONGO_MY })
const mongoPlates = new Set(mPlates.filter(Boolean).map(norm))

const hit = [...mongoPlates].filter((p) => sqlPlates.has(p))
const miss = [...mongoPlates].filter((p) => !sqlPlates.has(p))
console.log(`mysql=${sqlPlates.size} mongo=${mongoPlates.size} matched=${hit.length} unmatched=${miss.length}`)
console.log(`match rate: ${((hit.length / mongoPlates.size) * 100).toFixed(1)}%`)
console.log("sample unmatched:", miss.slice(0, 15))

await my.end(); await mongo.close()
```

- [ ] **Step 2: Run it**

Run: `node scripts/check-plate-join.mjs`
Expected: a match rate printed, plus up to 15 unmatched plates.

- [ ] **Step 3: Judge the result**

- **≥90% matched** → proceed to Task 1 unchanged.
- **<90%** → **STOP and report to the user.** Inspect the unmatched samples: if they are dummy plates (contain `(`, or appear in `EXCLUDED_PLATES`), they are expected and the real rate is higher. If they are real plates differing by more than whitespace (Thai vs Latin characters, dashes), the join key is wrong and the spec's bridge design needs revisiting before any code is written.

- [ ] **Step 4: Delete the script and record the finding**

```bash
rm scripts/check-plate-join.mjs
```

Add the observed rate as a comment at the top of `lib/fleets.ts` in Task 1, mirroring the style of `lib/plate-partner.ts:4-6`. Nothing to commit in this task.

---

### Task 1: Shared fleet constants + test harness

**Files:**
- Create: `lib/fleets.ts`
- Create: `lib/fleets.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script + devDeps)

**Interfaces:**
- Produces: `FLEET_MAP: Record<string,string>`, `FLEET_ORDER: string[]`, `FLEET_COLORS: Record<string,string>`, `EXCLUDED_PLATES: string[]`, `UNKNOWN_FLEET: "unknown"`, `fleetLabel(id: string): string`, `fleetKey(plate: string, monthMMYY: string): string`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add config and script**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
})
```

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write the failing test**

Create `lib/fleets.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { FLEET_MAP, FLEET_ORDER, FLEET_COLORS, UNKNOWN_FLEET, fleetLabel, fleetKey } from "./fleets"

describe("fleet constants", () => {
  it("maps all eight fleet ids to names", () => {
    expect(FLEET_MAP["1"]).toBe("ML")
    expect(FLEET_MAP["8"]).toBe("KN")
    expect(Object.keys(FLEET_MAP)).toHaveLength(8)
  })

  it("orders fleets 1..8 and gives every one a colour", () => {
    expect(FLEET_ORDER).toEqual(["1","2","3","4","5","6","7","8"])
    FLEET_ORDER.forEach((id) => expect(FLEET_COLORS[id]).toMatch(/^#[0-9a-f]{6}$/i))
  })
})

describe("fleetLabel", () => {
  it("returns the fleet name for a known id", () => {
    expect(fleetLabel("3")).toBe("TDM")
  })

  it("returns ไม่ระบุ for the unknown sentinel", () => {
    expect(fleetLabel(UNKNOWN_FLEET)).toBe("ไม่ระบุ")
  })

  it("returns ไม่ระบุ for an id that is not in the map", () => {
    expect(fleetLabel("99")).toBe("ไม่ระบุ")
  })
})

describe("fleetKey", () => {
  it("strips whitespace from the plate and joins with the month", () => {
    expect(fleetKey("70 1234", "01-26")).toBe("701234|01-26")
  })

  it("is stable regardless of surrounding whitespace", () => {
    expect(fleetKey("  70-1234 ", "12-25")).toBe("70-1234|12-25")
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./fleets"`

- [ ] **Step 5: Write the implementation**

Create `lib/fleets.ts`. Copy `EXCLUDED_PLATES` verbatim from `app/api/truck-utilize/breakdown/route.ts:5-18` — do not retype it, and do not reorder or edit entries.

```ts
import { normPlate } from "@/lib/plate-partner"

// Shared fleet constants. Previously duplicated in truck_utilize_analysis/page.tsx,
// api/truck-utilize/export/route.ts, api/breakdown-rate/customers/route.ts and
// cost-report/page.tsx.
// Plate-join check (2026-07-18): see Task 0 — record the observed Mongo↔MySQL
// plate match rate here.

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
  // ← paste verbatim from app/api/truck-utilize/breakdown/route.ts:5-18
]

export function fleetLabel(id: string): string {
  return FLEET_MAP[id] ?? "ไม่ระบุ"
}

/** Join key for the plate→fleet bridge. month is "MM-YY". */
export function fleetKey(plate: string, monthMMYY: string): string {
  return `${normPlate(plate)}|${monthMMYY}`
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 7 tests.

- [ ] **Step 7: Repoint the duplicate definitions**

Replace the local constants with imports from `@/lib/fleets` in:

- `app/truck_utilize_analysis/page.tsx:39-47` — delete `FLEET_MAP`, `FLEET_ORDER`, `FLEET_COLORS`; add `import { FLEET_MAP, FLEET_ORDER, FLEET_COLORS } from "@/lib/fleets"`
- `app/api/truck-utilize/export/route.ts:12-14` — delete `FLEET_MAP`; import it
- `app/api/truck-utilize/breakdown/route.ts:5-18` — delete `EXCLUDED_PLATES`; import it
- `app/api/breakdown-rate/customers/route.ts:6-19` — delete `EXCLUDED_PLATES`; import it

Leave `app/cost-report/page.tsx:62-63` (`FLEET_ML`/`FLEET_MS`) alone for now — Task 6 removes it.

- [ ] **Step 8: Verify nothing broke**

Run: `npm run build && npm run lint`
Expected: build succeeds, no new lint errors.

Then load `/truck_utilize_analysis` in the browser and confirm the fleet pills still render with correct names and colours, and the pivot table still shows all eight fleets. A regression here means an import was missed.

- [ ] **Step 9: Commit**

```bash
git add lib/fleets.ts lib/fleets.test.ts vitest.config.ts package.json package-lock.json \
  app/truck_utilize_analysis/page.tsx app/api/truck-utilize/export/route.ts \
  app/api/truck-utilize/breakdown/route.ts app/api/breakdown-rate/customers/route.ts
git commit -m "refactor: extract shared fleet constants to lib/fleets.ts"
```

---

### Task 2: Plate→fleet bridge API

**Files:**
- Create: `app/api/fleet/plate-map/route.ts`

**Interfaces:**
- Consumes: `EXCLUDED_PLATES`, `fleetKey` from `@/lib/fleets`
- Produces: `GET /api/fleet/plate-map?start=MM-YY&end=MM-YY` → `{ success: true, count: number, data: Record<string, string> }` where keys are `"normplate|MM-YY"` and values are `fleet_group_id`

- [ ] **Step 1: Write the route**

Follows the caching approach of `lib/plate-partner.ts:7,14` (10-minute in-process cache), keyed by range so different month spans don't collide.

```ts
import pool from "@/lib/mysql"
import { NextResponse } from "next/server"
import { EXCLUDED_PLATES, fleetKey } from "@/lib/fleets"

// plate+month → fleet_group_id, cached in-process for 10 min per range.
// Month-aware on purpose: a truck that moves ML→TDM mid-year keeps its earlier
// cost credited to ML.
const TTL = 10 * 60 * 1000
const cache = new Map<string, { at: number; data: Record<string, string> }>()

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const start = searchParams.get("start")
    const end   = searchParams.get("end")

    if (!start || !end) {
      return NextResponse.json(
        { success: false, error: "start and end are required (MM-YY)" },
        { status: 400 },
      )
    }

    const ck = `${start}..${end}`
    const hit = cache.get(ck)
    if (hit && Date.now() - hit.at < TTL) {
      return NextResponse.json({ success: true, count: Object.keys(hit.data).length, data: hit.data })
    }

    const placeholders = EXCLUDED_PLATES.map(() => "?").join(",")
    const sql = `
      SELECT DISTINCT REPLACE(license_plate, ' ', '') AS plate, month_year, fleet_group_id
        FROM performance_vehicle_daily
       WHERE license_plate NOT LIKE '%(%'
         AND license_plate NOT IN (${placeholders})
         AND month_year >= ? AND month_year <= ?
         AND fleet_group_id IS NOT NULL
    `
    const [rows] = await pool.query<any[]>(sql, [...EXCLUDED_PLATES, start, end])

    const data: Record<string, string> = {}
    for (const r of rows as any[]) {
      data[fleetKey(r.plate, r.month_year)] = String(r.fleet_group_id)
    }

    cache.set(ck, { at: Date.now(), data })
    return NextResponse.json({ success: true, count: Object.keys(data).length, data })
  } catch (error: any) {
    console.error("fleet/plate-map API error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Verify against the running app**

```bash
npm run dev
```

Then in a second terminal:

```bash
curl -s 'http://localhost:3000/api/fleet/plate-map?start=01-26&end=07-26' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('count',d['count']); \
    items=list(d['data'].items())[:5]; print(items); \
    print('fleets', sorted(set(d['data'].values())))"
```

Expected: `count` in the low thousands (roughly trucks × months), sample keys shaped `"701234|03-26"`, and `fleets` a subset of `['1'..'8']`.

Missing-param check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/api/fleet/plate-map'
```

Expected: `400`

- [ ] **Step 3: Confirm no Mongo route was touched**

Run: `git diff --stat app/api/cost/`
Expected: empty output.

- [ ] **Step 4: Commit**

```bash
git add app/api/fleet/plate-map/route.ts
git commit -m "feat: add plate-to-fleet bridge API (MySQL, month-aware)"
```

---

### Task 3: Fetch and tag detail rows with fleet

Adds the fleet dimension to client state without changing any displayed number yet. A temporary debug readout proves the tagging before Task 4 re-sources the aggregates.

**Files:**
- Modify: `app/cost-report/page.tsx` (state, `fetchAll`, new memos, debug block)

**Interfaces:**
- Consumes: `GET /api/fleet/plate-map` from Task 2; `FLEET_ORDER`, `UNKNOWN_FLEET`, `fleetKey`, `fleetLabel` from `@/lib/fleets`
- Produces: `taggedCurr: TaggedPlateRow[]`, `taggedPrev: TaggedPlateRow[]` where `TaggedPlateRow = PlateDetailRow & { fleet: string }`; `selectedFleets: Set<string>`; `fleetFilter(rows: TaggedPlateRow[]): TaggedPlateRow[]`

- [ ] **Step 1: Add imports and state**

At the top of `app/cost-report/page.tsx`, add:

```ts
import { FLEET_ORDER, FLEET_COLORS, UNKNOWN_FLEET, fleetKey, fleetLabel } from "@/lib/fleets"
```

Alongside the existing state declarations (near `const [bdCurr, setBdCurr] = useState<BDRow[]>([])`, around `:180`):

```ts
const [fleetMapCurr, setFleetMapCurr] = useState<Record<string, string>>({})
const [fleetMapPrev, setFleetMapPrev] = useState<Record<string, string>>({})
const [selectedFleets, setSelectedFleets] = useState<Set<string>>(new Set())
```

`selectedFleets` starts empty and, as with the existing warehouse and partner-flag chips, empty means "no filter — show everything".

- [ ] **Step 2: Fetch the bridge in `fetchAll`**

In `fetchAll` (`:207-235`), extend the `Promise.all` array with two entries and widen the destructuring:

```ts
const [s1, s2, d1, d2, c1, c2, b1, b2, f1, f2] = await Promise.all([
  // ...the eight existing fetches, unchanged...
  fetch(`/api/fleet/plate-map?start=${toBdKey(startMonth)}&end=${toBdKey(endMonth)}`, { cache: "no-store" }),
  fetch(`/api/fleet/plate-map?start=${toBdKey(pS)}&end=${toBdKey(pE)}`, { cache: "no-store" }),
])
const [j1, j2, j3, j4, j5, j6, j7, j8, j9, j10] = await Promise.all([
  s1.json(), s2.json(), d1.json(), d2.json(), c1.json(),
  c2.json(), b1.json(), b2.json(), f1.json(), f2.json(),
])
// ...existing setters, unchanged...
setFleetMapCurr(j9.success ? j9.data : {})
setFleetMapPrev(j10.success ? j10.data : {})
```

Do **not** add these fetches to the chip-change effect at `:240-263`. Fleet mapping does not depend on warehouse or partner_flag, so refetching there would be wasted work.

- [ ] **Step 3: Tag detail rows**

Add after the existing `filterSum` memos (around `:285`):

Measured against production for 2026-07: 83.7% of cost maps to a fleet by
exact plate+month. The remaining 16.3% has no MySQL operations record at all
(a fallback to the plate's nearest other month rescues **zero** plates — this
was tested). That residue is classified by `partner_flag`, which is already
present on the cost data:

| partner_flag | Share | Bucket |
|---|---|---|
| `รถสำนักงาน` | 3.0% | `BUCKET_OFFICE` — allocated across fleets (Task 7) |
| `รถร่วมมีนา`, `รถร่วมภายนอกบริษัท` | 2.3% | `BUCKET_PARTNER` — own row |
| `รถมีนา` / none | 11.0% | `BUCKET_UNKNOWN` — own row |

```ts
type TaggedPlateRow = PlateDetailRow & { fleet: string }

const tagFleet = (
  rows: PlateDetailRow[],
  fleetMap: Record<string, string>,
  flagMap: Record<string, string>,
): TaggedPlateRow[] =>
  rows.map((r) => {
    const f = fleetMap[fleetKey(r.plate, toBdKey(r.month_year))]
    if (f) return { ...r, fleet: f }
    const flag = flagMap[normPlate(r.plate)] ?? ""
    const bucket =
      flag === "รถสำนักงาน" ? BUCKET_OFFICE
      : flag.startsWith("รถร่วม") ? BUCKET_PARTNER
      : flag === "รถมีนา" ? BUCKET_NEW
      : BUCKET_UNKNOWN
    return { ...r, fleet: bucket }
  })

const taggedCurr = useMemo(
  () => tagFleet(detCurr, fleetMapCurr, flagMap), [detCurr, fleetMapCurr, flagMap])
const taggedPrev = useMemo(
  () => tagFleet(detPrev, fleetMapPrev, flagMap), [detPrev, fleetMapPrev, flagMap])

// empty selection = no filter, matching the warehouse / partner-flag chips
const fleetFilter = (rows: TaggedPlateRow[]) =>
  selectedFleets.size === 0 ? rows : rows.filter((r) => selectedFleets.has(r.fleet))
```

- [ ] **Step 4: Add the temporary debug readout**

Insert directly below the existing filter chips (after the partner-flag chip block ending near `:742`). This block is **removed in Task 8** — the `data-debug` attribute makes it easy to find.

```tsx
{hasData && (
  <div data-debug="fleet-recon" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs">
    <div className="font-semibold text-amber-900">DEBUG — fleet reconciliation (removed before merge)</div>
    <div className="mt-1 grid gap-1 text-amber-800">
      <div>summary total: {Math.round(totalCurr).toLocaleString()}</div>
      <div>detail total: {Math.round(taggedCurr.reduce((s, r) => s + r.plate_total, 0)).toLocaleString()}</div>
      <div>
        unmapped plates: {taggedCurr.filter((r) => r.fleet === UNKNOWN_FLEET).length} / {taggedCurr.length}
      </div>
      <div>
        by fleet:{" "}
        {[...FLEET_ORDER, UNKNOWN_FLEET].map((f) => {
          const n = taggedCurr.filter((r) => r.fleet === f).length
          return n ? `${fleetLabel(f)}=${n}` : null
        }).filter(Boolean).join("  ")}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify the reconciliation**

Run: `npm run dev`, open `/cost-report`, wait for load.

Expected in the amber box:
- **summary total and detail total agree** to within rounding. This is the key number — it proves detail is a valid substitute for summary before Task 4 depends on it.
- unmapped count is a small minority of total plates.
- the by-fleet line names several fleets with non-zero counts.

If summary and detail totals diverge by more than ~1%, **stop and report**. Likely causes worth checking in order: the summary fetch omits warehouse/partner_flag params (`:211`) while detail includes them, so clear all chips before comparing; or the month ranges differ.

- [ ] **Step 6: Commit**

```bash
git add app/cost-report/page.tsx
git commit -m "feat: tag cost-report detail rows with fleet (+ temporary recon readout)"
```

---

### Task 4: Re-source aggregates from tagged detail

The substantive change. Every headline number moves from summary-derived to detail-derived so the fleet filter reaches it.

**Files:**
- Modify: `app/cost-report/page.tsx:295-317` (`totalCurr`, `totalPrev`, `groupAggs`)

**Interfaces:**
- Consumes: `taggedCurr`, `taggedPrev`, `fleetFilter` from Task 3
- Produces: `fdCurr`, `fdPrev` (fleet-filtered tagged rows); `groupAggs` with unchanged shape `{ group, curr, prev, byMonth, byMonthPrev }[]`

- [ ] **Step 1: Add fleet-filtered row sets**

Immediately after `fleetFilter` from Task 3:

```ts
const fdCurr = useMemo(() => fleetFilter(taggedCurr), [taggedCurr, selectedFleets])
const fdPrev = useMemo(() => fleetFilter(taggedPrev), [taggedPrev, selectedFleets])
```

- [ ] **Step 2: Re-source the totals**

Replace `totalCurr` / `totalPrev` (`:295-296`):

```ts
const totalCurr = useMemo(() => fdCurr.reduce((s, r) => s + r.plate_total, 0), [fdCurr])
const totalPrev = useMemo(() => fdPrev.reduce((s, r) => s + r.plate_total, 0), [fdPrev])
```

- [ ] **Step 3: Re-source `groupAggs`**

Replace the body of `groupAggs` (`:298-317`). Shape is unchanged, so `chartSeries`, `overviewChart` and the comparison table need no edits. The fold now walks `lines` and keys on `line.จุดประสงค์` — the same field `/api/cost/summary` grouped by.

```ts
const groupAggs = useMemo<GroupAgg[]>(() => {
  const m = new Map<string, GroupAgg>()
  const ensure = (g: string) => {
    if (!m.has(g)) m.set(g, { group: g, curr: 0, prev: 0, byMonth: {}, byMonthPrev: {} })
    return m.get(g)!
  }
  fdCurr.forEach((row) => {
    row.lines?.forEach((ln) => {
      const e = ensure(getCostGroup(ln.จุดประสงค์))
      e.curr += ln.cost
      e.byMonth[row.month_year] = (e.byMonth[row.month_year] || 0) + ln.cost
    })
  })
  fdPrev.forEach((row) => {
    const aligned = shiftYear(row.month_year, 1)
    row.lines?.forEach((ln) => {
      const e = ensure(getCostGroup(ln.จุดประสงค์))
      e.prev += ln.cost
      e.byMonthPrev[aligned] = (e.byMonthPrev[aligned] || 0) + ln.cost
    })
  })
  return GROUP_ORDER.filter((g) => m.has(g)).map((g) => m.get(g)!)
    .sort((a, b) => b.curr - a.curr)
}, [fdCurr, fdPrev])
```

Keep the `/api/cost/summary` fetch and the `warehouses` / `flags` memos (`:266-273`) — summary still populates the chip option lists, it just no longer drives a displayed number.

- [ ] **Step 4: Verify the numbers are unchanged**

Before this task, record the KPI row and the monthly chart totals from the running page (screenshot or note them down).

Run: `npm run dev`, reload `/cost-report` with no chips and no fleets selected.

Expected: the KPI row, the stacked bar chart and the group comparison table show **the same values as before this task**. The debug box's summary and detail totals should still agree.

If a cost group's total shifted, the likely cause is `getCostGroup` receiving a different string: summary passed `group_value`, detail passes `line.จุดประสงค์`. Confirm they carry identical values by logging the distinct set of each.

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run build && npm run lint`
Expected: tests pass, build succeeds, no new lint errors.

- [ ] **Step 6: Confirm no Mongo route was touched**

Run: `git diff --stat app/api/cost/`
Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add app/cost-report/page.tsx
git commit -m "refactor: derive cost-report aggregates from detail rows"
```

---

### Task 5: Recompute counts from tagged detail

`/api/cost/counts` returns a single unfiltered aggregate and cannot be fleet-filtered, so the KPI counts are recomputed client-side.

**Files:**
- Modify: `app/cost-report/page.tsx` (counts memo + KPI row consumers)

**Interfaces:**
- Consumes: `fdCurr`, `fdPrev`
- Produces: `countsCurrLocal`, `countsPrevLocal`, both `{ wd_count, plate_count, product_count, total_cost, record_count }` — same shape as `CountsResult`, so KPI consumers need no shape change

- [ ] **Step 1: Add the local counts memo**

```ts
const countsFrom = (rows: TaggedPlateRow[]): CountsResult => {
  const wd = new Set<string>(), plates = new Set<string>(), products = new Set<string>()
  let total = 0, records = 0
  rows.forEach((r) => {
    if (r.wd) wd.add(String(r.wd))
    if (r.plate) plates.add(String(r.plate))
    total += r.plate_total
    r.lines?.forEach((ln) => {
      if (ln.รหัสสินค้า) products.add(String(ln.รหัสสินค้า))
      records += ln.records ?? 0
    })
  })
  return {
    wd_count: wd.size,
    plate_count: plates.size,
    product_count: products.size,
    total_cost: total,
    record_count: records,
  }
}

const countsCurrLocal = useMemo(() => countsFrom(fdCurr), [fdCurr])
const countsPrevLocal = useMemo(() => countsFrom(fdPrev), [fdPrev])
```

- [ ] **Step 2: Point the KPI row at the local counts**

Search `app/cost-report/page.tsx` for every read of `counts?.` and `countsPrev?.` and replace with `countsCurrLocal.` / `countsPrevLocal.` respectively. Use:

```bash
grep -n "counts?\.\|countsPrev?\." app/cost-report/page.tsx
```

Work through every hit. Leave the `counts` / `countsPrev` state and their fetches in place for now — Task 8 removes them once nothing reads them.

- [ ] **Step 3: Verify**

Run: `npm run dev`, reload `/cost-report` with no filters.

Expected: `plate_count` in the KPI row matches its pre-change value. A small difference in `plate_count` is possible and acceptable — `/api/cost/counts` counts distinct `ทะเบียน` across all rows while the local version counts distinct plates present in detail; these agree unless a plate has rows that produced no detail line. If the gap exceeds ~1%, investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add app/cost-report/page.tsx
git commit -m "refactor: compute cost-report KPI counts from tagged detail"
```

---

### Task 6: Fleet pill row

**Files:**
- Modify: `app/cost-report/page.tsx` (chip row area near `:707-742`, and `:62-63`)

**Interfaces:**
- Consumes: `FLEET_ORDER`, `FLEET_COLORS`, `FLEET_MAP`, `UNKNOWN_FLEET`, `fleetLabel`; `selectedFleets` / `setSelectedFleets`

- [ ] **Step 1: Add the toggle handlers**

Beside the existing `toggleSet` helper:

```ts
const toggleFleet = (id: string) =>
  setSelectedFleets((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

// empty = no filter, so "Clear" and "all selected" are the same view
const toggleAllFleets = () =>
  setSelectedFleets((prev) => (prev.size === 0 ? new Set([...FLEET_ORDER, UNKNOWN_FLEET]) : new Set()))
```

- [ ] **Step 2: Render the pill row**

Insert after the partner-flag chip block (near `:742`), following the same markup idiom as `app/truck_utilize_analysis/page.tsx:451-469`:

```tsx
<div className="mb-3 flex flex-wrap items-center gap-2">
  <span className="text-xs font-semibold text-gray-600">Fleet</span>
  <button
    onClick={toggleAllFleets}
    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-50"
  >
    {selectedFleets.size === 0 ? "All" : "Clear"}
  </button>
  {[...FLEET_ORDER, UNKNOWN_FLEET].map((g) => {
    const on = selectedFleets.size === 0 || selectedFleets.has(g)
    return (
      <button
        key={g}
        onClick={() => toggleFleet(g)}
        className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
          on ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-400"
        }`}
        style={on ? { backgroundColor: FLEET_COLORS[g] ?? "#9ca3af", borderColor: FLEET_COLORS[g] ?? "#9ca3af" } : {}}
      >
        {fleetLabel(g)}
      </button>
    )
  })}
</div>
```

- [ ] **Step 3: Remove the superseded constants**

Delete `FLEET_ML` and `FLEET_MS` at `:62-63`. Update `bdFleets` (`:429-460`) to reference `"1"` and `"2"` through `FLEET_MAP` instead. Do not change the breakdown-rate arithmetic — it stays `breakdown_count / (truck_count * daysInMonth) * 100`.

- [ ] **Step 4: Verify the filter works with no refetch**

Run `npm run dev`, open `/cost-report`, open DevTools → Network, then click a fleet pill.

Expected:
- **Zero new network requests.** Any request means the fetch wiring in Task 3 Step 2 leaked into the chip effect.
- The KPI row, the stacked bar chart and the group table all change.
- Deselecting every pill (Clear) returns to the full unfiltered view.
- Selecting only `ไม่ระบุ` shows the unmapped-plate cost — non-zero if the debug box reported unmapped plates.

- [ ] **Step 5: Verify `/truck_utilize_analysis` still works**

Load it and confirm the breakdown pivot and its own fleet pills are unaffected.

- [ ] **Step 6: Commit**

```bash
git add app/cost-report/page.tsx
git commit -m "feat: add fleet filter pills to cost-report"
```

---

### Task 7: Fleet × Month pivot table

Replaces the flat "cost per fleet" table originally planned here. Rows are
fleets with year-over-year sub-rows; columns are months. Mirrors the pivot in
`app/truck_utilize_analysis/page.tsx:617-690`, which uses a `rowSpan={2}` fleet
cell over two year rows.

**Files:**
- Modify: `app/cost-report/page.tsx` (new memo + new slide block)

**Interfaces:**
- Consumes: `fdCurr`, `fdPrev`, `bdCurr`, `months`, `FLEET_ORDER`,
  `FLEET_COLORS`, `BUCKET_OFFICE`, `BUCKET_PARTNER`, `BUCKET_UNKNOWN`,
  `fleetLabel`
- Produces: `fleetPivot: { rows: PivotRow[]; totals: PivotTotals }` where
  `PivotRow = { key, label, color, isFleet, curr: Record<string,number>,
  prev: Record<string,number>, currTotal, prevTotal, trucks: Record<string,number> }`

- [ ] **Step 1: Write the failing test for the allocation helper**

The allocation is pure arithmetic, so it is unit-tested. Add to
`lib/fleets.test.ts`:

```ts
import { allocateOffice } from "./fleets"

describe("allocateOffice", () => {
  it("splits office cost across fleets pro-rata by truck count", () => {
    const out = allocateOffice(1000, { "1": 60, "2": 40 })
    expect(out["1"]).toBeCloseTo(600)
    expect(out["2"]).toBeCloseTo(400)
  })

  it("returns an empty allocation when there are no trucks", () => {
    expect(allocateOffice(1000, {})).toEqual({})
  })

  it("returns an empty allocation when office cost is zero", () => {
    expect(allocateOffice(0, { "1": 60 })).toEqual({ "1": 0 })
  })

  it("does not lose baht to rounding across fleets", () => {
    const out = allocateOffice(100, { "1": 1, "2": 1, "3": 1 })
    const sum = Object.values(out).reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `allocateOffice` is not exported from `./fleets`

- [ ] **Step 3: Implement `allocateOffice` in `lib/fleets.ts`**

```ts
/**
 * Spread central (รถสำนักงาน) cost across fleets pro-rata by truck count.
 * Returns {} when there is nothing to allocate against, so callers never
 * divide by zero. Values are exact fractions — do not round here, or the
 * allocated total stops matching the input.
 */
export function allocateOffice(
  officeCost: number,
  trucksByFleet: Record<string, number>,
): Record<string, number> {
  const total = Object.values(trucksByFleet).reduce((s, n) => s + n, 0)
  if (total <= 0) return {}
  const out: Record<string, number> = {}
  for (const [fleet, n] of Object.entries(trucksByFleet)) {
    out[fleet] = (officeCost * n) / total
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 11 tests total (7 from Task 1, 4 new).

- [ ] **Step 5: Build the pivot memo**

Allocation is computed **per month**, not once over the whole range — truck
counts shift month to month, and an annual allocation would misattribute cost
to fleets that grew or shrank mid-range.

```tsx
type PivotRow = {
  key: string; label: string; color: string; isFleet: boolean
  curr: Record<string, number>; prev: Record<string, number>
  currTotal: number; prevTotal: number
  trucks: Record<string, number>
}

const fleetPivot = useMemo(() => {
  // trucks[fleet][month] from the MySQL breakdown rows
  const trucks: Record<string, Record<string, number>> = {}
  bdCurr.forEach((b) => {
    const id = String(b.fleet_group_id)
    ;(trucks[id] ??= {})[toMy(b.month_year)] = Number(b.truck_count) || 0
  })

  const cost = (rows: TaggedPlateRow[]) => {
    const m: Record<string, Record<string, number>> = {}
    rows.forEach((r) => { (m[r.fleet] ??= {})[r.month_year] = (m[r.fleet]?.[r.month_year] || 0) + r.plate_total })
    return m
  }
  const cCurr = cost(fdCurr), cPrev = cost(fdPrev)

  // allocate office cost per month across fleets present that month
  const allocate = (c: Record<string, Record<string, number>>) => {
    const alloc: Record<string, Record<string, number>> = {}
    months.forEach((my) => {
      const office = c[BUCKET_OFFICE]?.[my] || 0
      if (!office) return
      const tby: Record<string, number> = {}
      FLEET_ORDER.forEach((f) => { const n = trucks[f]?.[my] || 0; if (n) tby[f] = n })
      const split = allocateOffice(office, tby)
      for (const [f, v] of Object.entries(split)) (alloc[f] ??= {})[my] = v
    })
    return alloc
  }
  const aCurr = allocate(cCurr), aPrev = allocate(cPrev)

  const mk = (key: string, isFleet: boolean): PivotRow => {
    const curr: Record<string, number> = {}, prev: Record<string, number> = {}
    months.forEach((my) => {
      curr[my] = (cCurr[key]?.[my] || 0) + (isFleet ? (aCurr[key]?.[my] || 0) : 0)
      const pmy = shiftYear(my, -1)
      prev[my] = (cPrev[key]?.[pmy] || 0) + (isFleet ? (aPrev[key]?.[pmy] || 0) : 0)
    })
    return {
      key, label: fleetLabel(key), color: FLEET_COLORS[key] ?? "#9ca3af", isFleet,
      curr, prev,
      currTotal: Object.values(curr).reduce((s, v) => s + v, 0),
      prevTotal: Object.values(prev).reduce((s, v) => s + v, 0),
      trucks: trucks[key] ?? {},
    }
  }

  const rows = [
    ...FLEET_ORDER.map((f) => mk(f, true)),
    mk(BUCKET_PARTNER, false),
    mk(BUCKET_NEW, false),
    mk(BUCKET_UNKNOWN, false),
  ].filter((r) => r.currTotal > 0 || r.prevTotal > 0)

  const totals = { curr: {} as Record<string, number>, prev: {} as Record<string, number>, trucks: {} as Record<string, number> }
  months.forEach((my) => {
    totals.curr[my] = rows.reduce((s, r) => s + (r.curr[my] || 0), 0)
    totals.prev[my] = rows.reduce((s, r) => s + (r.prev[my] || 0), 0)
    totals.trucks[my] = rows.filter((r) => r.isFleet).reduce((s, r) => s + (r.trucks[my] || 0), 0)
  })
  return { rows, totals }
}, [fdCurr, fdPrev, bdCurr, months])
```

`BUCKET_OFFICE` deliberately gets no row of its own — its cost lives inside the
fleet rows after allocation. `BUCKET_PARTNER` and `BUCKET_UNKNOWN` get rows and
are **excluded from the per-truck denominator**, since neither has a truck
count. `make_pivot_excel.py:115-116` makes the opposite choice and counts
pseudo-plates in its `nunique()` denominator, which understates its per-truck
figures — do not copy that behaviour.

- [ ] **Step 6: Add the metric toggle state**

```ts
const [pivotMetric, setPivotMetric] = useState<"total" | "perTruck">("total")

const cellValue = (r: PivotRow, my: string, yr: "curr" | "prev") => {
  const v = r[yr][my] || 0
  if (pivotMetric === "total") return v
  const n = r.trucks[my] || 0
  return r.isFleet && n > 0 ? v / n : null   // null renders as "—"
}
```

- [ ] **Step 7: Render the pivot slide**

Copy the outer slide wrapper from the existing "อู่ใน vs อู่นอก" slide at
`app/cost-report/page.tsx:1019` — same wrapper element, same class names, same
heading markup — so print and PNG export pick it up automatically. Replace only
the body.

Table structure, mirroring `app/truck_utilize_analysis/page.tsx:617-690`:

- Header: a metric toggle (`ต้นทุนรวม` / `ต้นทุนต่อคัน`), then one column per
  month using `MONTH_LABEL`, then a `รวม` column.
- One two-row block per pivot row: `rowSpan={2}` cell holding a `color` dot and
  `label`, then a Buddhist-era year cell (`year + 543` / `prevYear + 543`), then
  the month cells.
- `รถใหม่ (ยังไม่เข้าระบบ ops)` and `ไม่ระบุ` render in a muted style below the
  fleet rows, separated by a divider, so they read as non-fleet buckets rather
  than as fleets. Neither gets a `FLEET_COLORS` dot.
- A bold `รวม` row at the bottom, both years.
- `null` cells render `—`, never `0`.
- Wrap the table in `overflow-x-auto` so a 12-month range scrolls rather than
  breaking the slide layout.

- [ ] **Step 8: Verify**

Run: `npm run dev`, open `/cost-report`.

Expected:
- One two-row block per fleet, in `FLEET_ORDER`, with `รถร่วม` and `ไม่ระบุ`
  as separate rows beneath.
- No `สำนักงาน` row — its cost is inside the fleet rows.
- **The `รวม` row equals the KPI total** (acceptance criterion 4). Confirm with
  the debug readout still present from Task 3.
- Switching to `ต้นทุนต่อคัน` shows `—` for `รถร่วม` and `ไม่ระบุ`, numbers for
  fleets.
- Fleet pills filter the pivot.
- Print preview and per-slide PNG export both include it.

Reconciliation check for the allocation specifically: switch the metric to
`ต้นทุนรวม`, note the `รวม` row total, then temporarily select only the
`ไม่ระบุ` and `รถร่วม` pills. The remaining fleet-row sum plus those two must
equal the unfiltered total — if it does not, office cost is being double
counted or dropped.

- [ ] **Step 9: Commit**

```bash
git add app/cost-report/page.tsx lib/fleets.ts lib/fleets.test.ts
git commit -m "feat: add fleet x month cost pivot with office allocation"
```
### Task 8: Remove debug scaffolding and dead fetches

**Files:**
- Modify: `app/cost-report/page.tsx`

- [ ] **Step 1: Remove the debug readout**

Delete the `data-debug="fleet-recon"` block added in Task 3 Step 4.

```bash
grep -n 'data-debug' app/cost-report/page.tsx
```

Expected after deletion: no matches.

- [ ] **Step 2: Remove the now-unused counts fetches**

`counts` / `countsPrev` state is no longer read after Task 5. Remove the state declarations, the two `/api/cost/counts` fetches in `fetchAll`, and the two in the chip-change effect. Adjust both destructuring arrays to match the reduced fetch count.

The `/api/cost/summary` fetches **stay** — `warehouses` and `flags` still derive from `sumCurr`.

- [ ] **Step 3: Verify nothing regressed**

Run: `npm test && npm run build && npm run lint`
Expected: tests pass, build succeeds, no new lint errors.

Then reload `/cost-report` and confirm: the KPI row still populates, the warehouse and partner-flag chips still list their options, fleet pills still filter, and no console errors appear.

- [ ] **Step 4: Walk the acceptance criteria**

From the spec — confirm each explicitly:

1. With no chips and no fleets selected, the KPI total matches the pre-change value recorded in Task 4 Step 4.
2. Toggling a fleet pill changes the KPI row, the chart and all group slides, with zero network requests in DevTools.
3. Pick a plate the bridge maps to different fleets in different months; confirm its cost splits across both fleets at the right month boundary.
4. The sum across all fleet buckets on the new slide, `ไม่ระบุ` included, equals the unfiltered total.
5. Print preview and PNG export both include the new slide.

- [ ] **Step 5: Confirm no Mongo route was touched across the whole feature**

Run: `git diff --stat main -- app/api/cost/`
Expected: empty output.

- [ ] **Step 6: Commit**

```bash
git add app/cost-report/page.tsx
git commit -m "chore: remove fleet recon scaffolding and unused counts fetches"
```

---

## Notes for the implementer

- `toBdKey()` converts `"YYYY-MM"` → `"MM-YY"` and already exists in `app/cost-report/page.tsx`. Every fleet-bridge lookup goes through it. Passing a raw `"YYYY-MM"` produces a silent 100% miss rate — every plate lands in `ไม่ระบุ` and totals still reconcile, so this failure looks like real data. If the unmapped count is suspiciously high, check this first.
- Empty `Set` means "no filter" for all three chip groups. Keep that convention.
- `app/cost-report/page.tsx` is ~1400 lines. It is not split here — that refactor is out of scope and would obscure the diff — but each task's edits are localized, so work by `grep`, not by scrolling.
