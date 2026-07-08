# Lean Project — Cost per Plate (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New permission-gated sidebar group "Lean Project" with a first page showing a cost-group × year pivot of `dw_stockmovement` costs, split into two warehouse buckets.

**Architecture:** Extract the existing `/cost` cost-group mapping into `lib/cost-groups.ts` (shared). New GET API aggregates `datawarehouse.dw_stockmovement` by year × จุดประสงค์ × คลังสินค้า and maps to cost groups + warehouse buckets server-side. New client page renders the pivot. Sidebar/permissions updated with key `lean-project`.

**Tech Stack:** Next.js 16 App Router, MongoDB driver via `lib/mongo.ts`, next-auth guards in layout, Tailwind classes consistent with existing pages.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-08-lean-project-cost-per-plate-design.md`
- No test framework in repo (`scripts`: dev/build/start/lint only) → each task verifies via `curl` / browser on the running dev server at http://localhost:3000, plus `npx tsc --noEmit` type check.
- Warehouse buckets (exact strings): `ลาดกระบัง + ขอนแก่น` = ["คลังลาดกระบัง", "คลังขอนแก่น"]; `สระบุรี + DIST` = ["คลังสระบุรี", "คลัง DIST"]; anything else → `อื่น ๆ`.
- Permission key everywhere: `lean-project`. Route: `/lean-project/cost-per-plate`.
- `/cost` page behavior must not change (Task 1 is a pure extraction).

---

### Task 1: Shared cost-group module

**Files:**
- Create: `lib/cost-groups.ts`
- Modify: `app/cost/page.tsx:75-92` (remove map+fn, add import)

**Interfaces:**
- Produces: `COST_GROUP_MAP: Record<string,string>`, `getCostGroup(จุดประสงค์: string): string`, `COST_GROUP_ORDER: string[]` — imported by Tasks 2 & 3.

- [ ] **Step 1: Create `lib/cost-groups.ts`** with the map copied verbatim from `app/cost/page.tsx:77-92` plus a display order:

```ts
// Shared จุดประสงค์ในการเบิก → Cost Group mapping (used by /cost and /lean-project)
export const COST_GROUP_MAP: Record<string, string> = {
  "PM น้ำมันเครื่อง":        "PM - Preventive Maintenance",
  "PM ช่วงล่าง":             "PM - Preventive Maintenance",
  "PM ความเย็น":             "PM - Preventive Maintenance",
  "ค่าใช้จ่ายอื่น ๆ":        "CM - Corrective Maintenance",
  "ซ่อม":                    "CM - Corrective Maintenance",
  "อะไหล่/วัสดุสิ้นเปลือง": "CM - Corrective Maintenance",
  "เครื่องมือส่วนตัวช่าง":   "Tools & Equipment",
  "เบิกประจำตัวช่าง":        "Tools & Equipment",
  "ยาง":                     "T - Tire",
  "ซ่อมเคสอุบัติเหตุ":       "AC - Accident Repair",
}

export const COST_GROUP_ORDER = [
  "PM - Preventive Maintenance",
  "CM - Corrective Maintenance",
  "T - Tire",
  "Tools & Equipment",
  "AC - Accident Repair",
  "Other",
]

export function getCostGroup(จุดประสงค์: string): string {
  return COST_GROUP_MAP[จุดประสงค์?.trim()] ?? "Other"
}
```

- [ ] **Step 2: Update `app/cost/page.tsx`** — delete lines 77-92 (the `COST_GROUP_MAP` const and `getCostGroup` fn) and add to imports: `import { getCostGroup } from "@/lib/cost-groups"`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` passes; `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/cost` (expect 200 or 307 to login, same as before).

- [ ] **Step 4: Commit** — `git add lib/cost-groups.ts app/cost/page.tsx && git commit -m "refactor: extract cost-group mapping to lib/cost-groups"`

### Task 2: API route

**Files:**
- Create: `app/api/lean-project/cost-per-plate/route.ts`

**Interfaces:**
- Consumes: `clientPromise` from `@/lib/mongo`, `getCostGroup` from `@/lib/cost-groups`.
- Produces: `GET /api/lean-project/cost-per-plate` → `{ success: true, data: { warehouse_group: string, cost_group: string, year: string, total_cost: number }[] }`

- [ ] **Step 1: Create route** (pattern: `app/api/cost/summary/route.ts`):

```ts
import clientPromise from "@/lib/mongo";
import { getCostGroup } from "@/lib/cost-groups";
import { NextResponse } from "next/server";

const WAREHOUSE_GROUPS: Record<string, string> = {
  "คลังลาดกระบัง": "ลาดกระบัง + ขอนแก่น",
  "คลังขอนแก่น":   "ลาดกระบัง + ขอนแก่น",
  "คลังสระบุรี":    "สระบุรี + DIST",
  "คลัง DIST":     "สระบุรี + DIST",
};

export async function GET() {
  try {
    const client = await clientPromise;
    const col = client.db("datawarehouse").collection("dw_stockmovement");

    const raw = await col.aggregate([
      {
        $group: {
          _id: {
            year: { $substrCP: ["$month_year", 0, 4] },
            purpose: "$จุดประสงค์ในการเบิก",
            warehouse: "$คลังสินค้า",
          },
          total_cost: { $sum: "$total_cost" },
        },
      },
    ]).toArray();

    // Map to cost group + warehouse bucket, re-aggregate
    const acc = new Map<string, { warehouse_group: string; cost_group: string; year: string; total_cost: number }>();
    for (const r of raw) {
      const warehouse_group = WAREHOUSE_GROUPS[r._id.warehouse?.trim()] ?? "อื่น ๆ";
      const cost_group = getCostGroup(r._id.purpose || "");
      const year = r._id.year;
      const key = `${warehouse_group}|${cost_group}|${year}`;
      const cur = acc.get(key);
      if (cur) cur.total_cost += r.total_cost;
      else acc.set(key, { warehouse_group, cost_group, year, total_cost: r.total_cost });
    }

    return NextResponse.json({ success: true, data: [...acc.values()] });
  } catch (error: any) {
    console.error("lean-project/cost-per-plate API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify** — `curl -s http://localhost:3000/api/lean-project/cost-per-plate | head -c 600`: expect `{"success":true,"data":[...]}` with both bucket names present and 4-digit `year` values. Spot-check one bucket-year sum against direct Mongo aggregate (node one-liner filtering คลังสินค้า in ["คลังลาดกระบัง","คลังขอนแก่น"] and month_year prefix).

- [ ] **Step 3: Commit** — `git add app/api/lean-project && git commit -m "feat: lean-project cost-per-plate API"`

### Task 3: Page + layout

**Files:**
- Create: `app/lean-project/cost-per-plate/layout.tsx`
- Create: `app/lean-project/cost-per-plate/page.tsx`

**Interfaces:**
- Consumes: API from Task 2; `COST_GROUP_ORDER` from `@/lib/cost-groups`.

- [ ] **Step 1: layout.tsx** — copy of `app/cost/layout.tsx` with `"ops"` → `"lean-project"`:

```tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const { allowedGroups } = await getUserPermissions(session.user?.email)
  if (!allowedGroups.includes("lean-project")) redirect("/unauthorized")
  return <>{children}</>
}
```

- [ ] **Step 2: page.tsx** — client component. Fetch once on mount; pivot client-side:

Data shaping: `years` = sorted unique `year`; rows grouped by `warehouse_group` (order: ลาดกระบัง + ขอนแก่น, สระบุรี + DIST, อื่น ๆ — omit empty), cost groups within a bucket in `COST_GROUP_ORDER` (omit groups with no data), each row = cells per year + row total; per-bucket Subtotal row; Grand Total row. Baht format: `n.toLocaleString("en-US", { maximumFractionDigits: 0 })`.

States: `loading` (spinner/skeleton), `error` (red banner + retry button re-calling fetch), `empty` ("ไม่พบข้อมูล"). Styling: table with sticky header, section header rows with muted background, Subtotal rows semibold, Grand Total row emphasized top border; light/dark variants matching existing pages (`bg-white dark:bg-[#161922]`, `text-gray-*` / `dark:text-gray-*`). Page title "Cost per Plate Analysis", subtitle "Lean Project — cost group × year".

- [ ] **Step 3: Verify** — `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/lean-project/cost-per-plate` → 307 (redirect to login when unauthenticated). `npx tsc --noEmit` passes. Browser check after Task 4 (needs sidebar + permission).

- [ ] **Step 4: Commit** — `git add app/lean-project && git commit -m "feat: lean-project cost-per-plate page"`

### Task 4: Sidebar + permissions

**Files:**
- Modify: `components/sidebar.tsx:164` (insert group after Procurement)
- Modify: `lib/permissions.ts:9` (`ALL_GROUPS`)
- Modify: `app/admin/groups/page.tsx:6-13` (`SECTION_KEYS`)

**Interfaces:**
- Consumes: route `/lean-project/cost-per-plate` (Task 3).

- [ ] **Step 1: sidebar.tsx** — add import `Gauge` from lucide-react; insert after the Procurement group object:

```ts
{
  label:        "Lean Project",
  groupIcon:    Gauge,
  permissionKey: "lean-project",
  dot:          "bg-cyan-500",
  iconColor:    "text-cyan-500 dark:text-cyan-400",
  activeBg:     "bg-cyan-50 dark:bg-cyan-950/40",
  activeText:   "text-cyan-700 dark:text-cyan-300",
  activeBorder: "border-cyan-500",
  items: [
    { href: "/lean-project/cost-per-plate", label: "Cost per Plate", icon: BarChart3 },
  ],
},
```

- [ ] **Step 2: permissions** — `ALL_GROUPS` gains `"lean-project"` (before `"admin"`); `SECTION_KEYS` gains `{ key: "lean-project", label: "Lean Project" }`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`; browser: signed-in admin sees "Lean Project" group; page renders pivot with 2 sections, subtotals, grand total; dark mode OK; `/cost` unchanged.

- [ ] **Step 4: Commit** — `git add components/sidebar.tsx lib/permissions.ts app/admin/groups/page.tsx && git commit -m "feat: lean-project sidebar group + permission key"`
