# Admin Permissions Panel — Design Spec
**Date:** 2026-06-29
**Project:** Mena Intelligence (Next.js on Vercel)
**Feature:** Role-based access control with admin panel for managing user group permissions

---

## Overview

Add a permission system so admins can control which sidebar sections each user can access. Users sign in with Google (existing), get recorded automatically, and an admin assigns them to a permission group. Groups define which sidebar sections are visible and accessible.

---

## Permission Groups

Named groups stored in MongoDB. Each group has a list of allowed sidebar section keys. The Admin group bypasses all checks.

Sidebar section keys:
- `vehicle` — Truck Distance, Truck Year Cost, Truck Utilize, Fleet Report
- `fuel` — Fuel Management
- `ops` — Repair Cost, Repair Analysis, Cost Monitoring, PC Cost, Transaction Detail
- `mixer` — Asia Incentive, Asia Plant Analysis
- `procurement` — Procurement Search, Stock Budget, Price Benchmark, Supplier Analysis
- `maintenance` — Daily Log (VS), Daily Log (Garage), Report History, Templates

`overview` (Home) is always accessible — no permission key needed.

---

## Data Model

### MongoDB — `atms` database

**Collection: `permission_groups`**
```ts
{
  _id: ObjectId,
  name: string,         // "Admin", "Fuel Team", "OPS Team", etc.
  is_admin: boolean,    // true = bypass all access checks
  access: string[],     // e.g. ["fuel", "ops"] — empty for admin groups
  created_at: Date,
  updated_at: Date,
}
```

**Collection: `app_users`**
Auto-upserted on every Google sign-in.
```ts
{
  _id: ObjectId,
  email: string,           // unique key, "user@menatransport.co.th"
  name: string,            // from Google OAuth
  image: string,           // avatar URL
  group_id: ObjectId | null,   // null = unassigned
  group_name: string | null,   // denormalized for display
  last_seen: Date,
  created_at: Date,
}
```

### Bootstrap (manual MongoDB seed)
Insert one `permission_groups` doc: `{ name: "Admin", is_admin: true, access: [] }`.
Sign in to the app (creates `app_users` record). Then update your `app_users` doc to set `group_id` to the Admin group's `_id`.

---

## Permissions Flow

1. User signs in via Google → `signIn` callback upserts user into `app_users`
2. Root layout (`app/layout.tsx`) — server component — gets session email → calls `getUserPermissions(email)` from `lib/permissions.ts`
3. `getUserPermissions` queries `app_users` + `permission_groups` → returns `{ isAdmin: boolean, allowedGroups: string[] }`
4. Unassigned users get `{ isAdmin: false, allowedGroups: [] }` → can only see Overview
5. `allowedGroups` passed as prop to `AppShell` → `Sidebar` filters `NAV_GROUPS` to show only accessible sections
6. Per-page/per-group `layout.tsx` files also call `getUserPermissions` and redirect to `/unauthorized` if section not allowed

---

## Route Protection

Each sidebar section's pages get a `layout.tsx` that checks the relevant permission key and redirects to `/unauthorized` if the user lacks it.

Protected layouts:
- `app/fuel/layout.tsx` → checks `fuel`
- `app/truck-distance/layout.tsx` → checks `vehicle`
- `app/truck-year-cost/layout.tsx` → checks `vehicle`
- `app/truck_utilize_analysis/layout.tsx` → checks `vehicle`
- `app/fleet-report/layout.tsx` → checks `vehicle`
- `app/repair-cost/layout.tsx` → checks `ops`
- `app/repair-analysis/layout.tsx` → checks `ops`
- `app/cost/layout.tsx` → checks `ops`
- `app/pc-cost/layout.tsx` → checks `ops`
- `app/transaction-detail/layout.tsx` → checks `ops`
- `app/asia-incentive/layout.tsx` → checks `mixer`
- `app/asia-plant-analysis/layout.tsx` → checks `mixer`
- `app/procurement-search/layout.tsx` → checks `procurement`
- `app/stock-budget-ladkrabang/layout.tsx` → checks `procurement`
- `app/price-benchmark/layout.tsx` → checks `procurement`
- `app/supplier-analysis/layout.tsx` → checks `procurement`
- `app/repair-daily/layout.tsx` → checks `maintenance`
- `app/admin/layout.tsx` → checks `is_admin === true`

---

## Admin Panel

New sidebar group **"Admin"** — visible only when `is_admin === true`.

### `/admin/users` — User Management
- Table: Avatar | Name | Email | Last Sign-in | Group (dropdown) | Save button
- Unassigned users shown first with a yellow "Unassigned" badge
- Changing dropdown + Save → PATCH `/api/admin/users` → updates `app_users.group_id` and `group_name`

### `/admin/groups` — Group Management
- List of all groups: Name | Is Admin | Allowed Sections (badges) | Edit | Delete
- "New Group" form: name + checkboxes for each section + Is Admin toggle
- Edit: inline form with same fields
- Delete: confirm if group has users assigned (show count warning)
- CRUD via `/api/admin/groups`

---

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/admin/users` | List all `app_users` with group info |
| PATCH | `/api/admin/users` | Update user's group (`{ email, group_id }`) |
| GET | `/api/admin/groups` | List all `permission_groups` |
| POST | `/api/admin/groups` | Create new group |
| PATCH | `/api/admin/groups` | Update group (`{ id, name, is_admin, access }`) |
| DELETE | `/api/admin/groups` | Delete group (`{ id }`) |

All admin API routes check `is_admin` server-side before responding.

---

## New Pages & Files

| File | Purpose |
|---|---|
| `lib/permissions.ts` | `getUserPermissions(email)` utility |
| `lib/auth.ts` | Modified — upsert to `app_users` on sign-in |
| `app/layout.tsx` | Modified — fetch permissions, pass to AppShell |
| `components/app-shell.tsx` | Modified — accept + pass `allowedGroups` to Sidebar |
| `components/sidebar.tsx` | Modified — add `permissionKey` to NAV_GROUPS, filter by `allowedGroups` |
| `app/unauthorized/page.tsx` | Access denied page |
| `app/admin/layout.tsx` | Admin-only gate |
| `app/admin/users/page.tsx` | User management UI |
| `app/admin/groups/page.tsx` | Group management UI |
| `app/api/admin/users/route.ts` | User assignment API |
| `app/api/admin/groups/route.ts` | Group CRUD API |
| Per-section `layout.tsx` files | ~17 files — one per protected route directory |

---

## Unauthorized Page

`/unauthorized` — simple page: "คุณไม่มีสิทธิ์เข้าถึงหน้านี้" with user's name, a note to contact admin, and a Back to Home button.

---

## Out of Scope

- Per-page (sub-group) permissions — group-level only
- Audit log of permission changes
- Self-service access requests
- Email notifications when access is granted
