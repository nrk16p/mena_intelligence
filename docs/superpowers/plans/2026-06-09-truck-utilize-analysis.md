# Truck Utilize Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `truck_utilize_analysis` page with a filterable, paginated table backed by a new MySQL API route querying `performance_vehicle_daily`.

**Architecture:** Add `mysql2` package + `lib/mysql.ts` connection pool (mirrors `lib/mongo.ts`), expose a Next.js GET API route at `/api/truck-utilize`, and build a client page at `/truck_utilize_analysis` with filter controls and a server-paginated table.

**Tech Stack:** Next.js 16 App Router, TypeScript, `mysql2`, Tailwind CSS, shadcn components, `be_database.performance_vehicle_daily`

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `.env` | Add `MYSQL_DB=be_database` |
| Create | `lib/mysql.ts` | MySQL connection pool singleton |
| Create | `app/api/truck-utilize/route.ts` | GET endpoint — filter + paginate `performance_vehicle_daily` |
| Create | `app/truck_utilize_analysis/page.tsx` | Filter bar + paginated table UI |
| Modify | `components/sidebar.tsx` | Add nav link under "Vehicle" group |

---

## Task 1: Update `.env` and install `mysql2`

**Files:**
- Modify: `.env`

- [ ] **Step 1: Update DB_NAME in `.env`**

Change the existing `DB_NAME` line:
```
DB_NAME=be_database
```

The full MySQL block in `.env` should now read:
```
DB_HOST=157.230.39.131
DB_USER=admin-be
DB_PASSWORD=Mena!001
DB_NAME=be_database
DB_PORT=3306
```

- [ ] **Step 2: Install `mysql2`**

```bash
cd /Users/menatransport_02/Documents/project/mena_intelligence/mena-intelligence
npm install mysql2
```

Expected: `mysql2` appears in `package.json` dependencies.

- [ ] **Step 3: Commit**

```bash
git add .env package.json package-lock.json
git commit -m "chore: update DB_NAME to be_database and install mysql2"
```

---

## Task 2: Create MySQL connection pool (`lib/mysql.ts`)

**Files:**
- Create: `lib/mysql.ts`

- [ ] **Step 1: Create `lib/mysql.ts`**

```typescript
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/menatransport_02/Documents/project/mena_intelligence/mena-intelligence
npx tsc --noEmit
```

Expected: No errors for `lib/mysql.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/mysql.ts
git commit -m "feat: add MySQL connection pool"
```

---

## Task 3: Create API route (`app/api/truck-utilize/route.ts`)

**Files:**
- Create: `app/api/truck-utilize/route.ts`

The route accepts these query params:

| Param | Type | Example |
|-------|------|---------|
| `start_date` | string | `2025-01-01` |
| `end_date` | string | `2025-12-31` |
| `month_year` | string | `01-25` |
| `plant` | string | `บางปะอิน` |
| `status` | string | `A` |
| `group_status` | string | `working` |
| `license_plate` | string | `สบ.71-1530` |
| `fleet_group_id` | string | `1` |
| `page` | number | `1` (default) |
| `page_size` | number | `25` (default, allowed: 25/50/100) |

- [ ] **Step 1: Create `app/api/truck-utilize/route.ts`**

```typescript
import pool from "@/lib/mysql";
import { NextResponse } from "next/server";

const ALLOWED_PAGE_SIZES = new Set([25, 50, 100]);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start_date     = searchParams.get("start_date");
    const end_date       = searchParams.get("end_date");
    const month_year     = searchParams.get("month_year");
    const plant          = searchParams.get("plant");
    const status         = searchParams.get("status");
    const group_status   = searchParams.get("group_status");
    const license_plate  = searchParams.get("license_plate");
    const fleet_group_id = searchParams.get("fleet_group_id");

    const page      = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const page_size = ALLOWED_PAGE_SIZES.has(parseInt(searchParams.get("page_size") || "25", 10))
      ? parseInt(searchParams.get("page_size") || "25", 10)
      : 25;
    const offset = (page - 1) * page_size;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (start_date) { conditions.push("date >= ?"); params.push(start_date); }
    if (end_date)   { conditions.push("date <= ?"); params.push(end_date); }
    if (month_year) { conditions.push("month_year = ?"); params.push(month_year); }
    if (plant)      { conditions.push("plant = ?"); params.push(plant); }
    if (status)     { conditions.push("status = ?"); params.push(status); }
    if (group_status)   { conditions.push("group_status = ?"); params.push(group_status); }
    if (license_plate)  { conditions.push("license_plate LIKE ?"); params.push(`%${license_plate}%`); }
    if (fleet_group_id) { conditions.push("fleet_group_id = ?"); params.push(fleet_group_id); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) as total FROM performance_vehicle_daily ${where}`;
    const dataSql  = `SELECT * FROM performance_vehicle_daily ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`;

    const [countRows] = await pool.query<any[]>(countSql, params);
    const total = (countRows as any[])[0].total as number;

    const [rows] = await pool.query<any[]>(dataSql, [...params, page_size, offset]);

    return NextResponse.json({
      success: true,
      total,
      page,
      page_size,
      total_pages: Math.ceil(total / page_size),
      data: rows,
    });
  } catch (error: any) {
    console.error("truck-utilize API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Start dev server and test the endpoint**

```bash
npm run dev
```

In another terminal or browser:
```
http://localhost:3000/api/truck-utilize?page=1&page_size=25
```

Expected response shape:
```json
{
  "success": true,
  "total": 382983,
  "page": 1,
  "page_size": 25,
  "total_pages": 15320,
  "data": [{ "id": ..., "license_plate": ..., ... }]
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/truck-utilize/route.ts
git commit -m "feat: add truck-utilize API route with filters and pagination"
```

---

## Task 4: Create the page (`app/truck_utilize_analysis/page.tsx`)

**Files:**
- Create: `app/truck_utilize_analysis/page.tsx`

- [ ] **Step 1: Create `app/truck_utilize_analysis/page.tsx`**

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
interface VehicleRow {
  id: number;
  fleet_group_id: string;
  license_plate: string;
  plant: string | null;
  customer: string | null;
  status: string | null;
  group_status: string | null;
  date: string;
  month_year: string | null;
}

interface ApiResponse {
  success: boolean;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  data: VehicleRow[];
}

const PAGE_SIZES = [25, 50, 100] as const;

// ── Page ───────────────────────────────────────────────────────────────────
export default function TruckUtilizeAnalysisPage() {
  const [rows, setRows]             = useState<VehicleRow[]>([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  // Filters
  const [startDate, setStartDate]       = useState("");
  const [endDate, setEndDate]           = useState("");
  const [monthYear, setMonthYear]       = useState("");
  const [plant, setPlant]               = useState("");
  const [status, setStatus]             = useState("");
  const [groupStatus, setGroupStatus]   = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [fleetGroupId, setFleetGroupId] = useState("");

  // Pagination
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState<25 | 50 | 100>(25);

  const fetchData = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (startDate)    params.set("start_date", startDate);
      if (endDate)      params.set("end_date", endDate);
      if (monthYear)    params.set("month_year", monthYear);
      if (plant)        params.set("plant", plant);
      if (status)       params.set("status", status);
      if (groupStatus)  params.set("group_status", groupStatus);
      if (licensePlate) params.set("license_plate", licensePlate);
      if (fleetGroupId) params.set("fleet_group_id", fleetGroupId);
      params.set("page", String(currentPage));
      params.set("page_size", String(pageSize));

      const res = await fetch(`/api/truck-utilize?${params.toString()}`);
      const json: ApiResponse = await res.json();

      if (!json.success) throw new Error("API error");
      setRows(json.data);
      setTotal(json.total);
      setTotalPages(json.total_pages);
    } catch (e: any) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, monthYear, plant, status, groupStatus, licensePlate, fleetGroupId, pageSize]);

  useEffect(() => {
    fetchData(page);
  }, [page, pageSize]);

  function handleSearch() {
    setPage(1);
    fetchData(1);
  }

  function handleClear() {
    setStartDate(""); setEndDate(""); setMonthYear("");
    setPlant(""); setStatus(""); setGroupStatus("");
    setLicensePlate(""); setFleetGroupId("");
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Truck Utilize Analysis</h1>

      {/* ── Filters ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Month Year (MM-YY)</label>
            <input type="text" placeholder="e.g. 01-25" value={monthYear} onChange={e => setMonthYear(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">License Plate</label>
            <input type="text" placeholder="Search plate..." value={licensePlate} onChange={e => setLicensePlate(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Plant</label>
            <input type="text" placeholder="Plant name..." value={plant} onChange={e => setPlant(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700">
              <option value="">All</option>
              <option value="A">A</option>
              <option value="I">I</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Group Status</label>
            <select value={groupStatus} onChange={e => setGroupStatus(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700">
              <option value="">All</option>
              <option value="working">working</option>
              <option value="idle">idle</option>
              <option value="repair">repair</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Fleet Group ID</label>
            <input type="text" placeholder="e.g. 1" value={fleetGroupId} onChange={e => setFleetGroupId(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm dark:bg-zinc-800 dark:border-zinc-700" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition">
            Search
          </button>
          <button onClick={handleClear}
            className="px-4 py-2 border rounded text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition">
            Clear
          </button>
        </div>
      </div>

      {/* ── Table header ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? "Loading..." : `${total.toLocaleString()} records`}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Rows per page:</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value) as 25 | 50 | 100); setPage(1); }}
            className="border rounded px-2 py-1 text-sm dark:bg-zinc-800 dark:border-zinc-700">
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* ── Table ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 dark:bg-zinc-800">
              {["ID","Fleet Group","License Plate","Plant","Customer","Status","Group Status","Date","Month Year"].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">No records found</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition">
                <td className="px-3 py-2 text-gray-400">{row.id}</td>
                <td className="px-3 py-2">{row.fleet_group_id}</td>
                <td className="px-3 py-2 font-medium">{row.license_plate}</td>
                <td className="px-3 py-2">{row.plant ?? "—"}</td>
                <td className="px-3 py-2 max-w-[200px] truncate" title={row.customer ?? ""}>{row.customer ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.status === "A" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {row.status ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.group_status === "working" ? "bg-blue-100 text-blue-700" :
                    row.group_status === "repair"  ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {row.group_status ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                <td className="px-3 py-2">{row.month_year ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages.toLocaleString()}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1}
              className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800 transition">«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800 transition">‹</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800 transition">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
              className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-zinc-800 transition">»</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/truck_utilize_analysis/page.tsx
git commit -m "feat: add truck_utilize_analysis page with filters and pagination"
```

---

## Task 5: Add sidebar nav link

**Files:**
- Modify: `components/sidebar.tsx`

- [ ] **Step 1: Add nav item to the "Vehicle" group**

In `components/sidebar.tsx`, find the Vehicle group (around line 73–76):

```typescript
label: "Vehicle",
items: [
  { href: "/truck-distance", label: "Truck Distance", icon: Truck },
  { href: "/truck-year-cost", label: "Truck Year Cost", icon: BarChart3 },
],
```

Change it to:

```typescript
label: "Vehicle",
items: [
  { href: "/truck-distance", label: "Truck Distance", icon: Truck },
  { href: "/truck-year-cost", label: "Truck Year Cost", icon: BarChart3 },
  { href: "/truck_utilize_analysis", label: "Truck Utilize", icon: Truck },
],
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:3000/truck_utilize_analysis` — confirm the page loads, sidebar shows "Truck Utilize" as active, and the table fetches data.

- [ ] **Step 3: Commit**

```bash
git add components/sidebar.tsx
git commit -m "feat: add Truck Utilize Analysis link to sidebar"
```

---

## Done

All tasks complete. The feature delivers:
- MySQL pool connection via `lib/mysql.ts`
- Filtered, paginated API at `/api/truck-utilize`
- Full-featured page at `/truck_utilize_analysis` with 8 filter fields and configurable page size (25/50/100)
- Sidebar navigation link
