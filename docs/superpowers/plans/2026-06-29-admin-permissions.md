# Admin Permissions Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-based permission system so admins can control which sidebar sections each user can access, with a full admin panel to manage users and permission groups.

**Architecture:** Permissions are stored in MongoDB (`app_users` + `permission_groups` collections in the `atms` db). The root layout is an async server component that fetches the signed-in user's permissions from MongoDB on every request and passes `allowedGroups: string[]` down to AppShell → Sidebar. Each protected page directory gets a `layout.tsx` (server component) that redirects to `/unauthorized` if the user lacks the required group key. Admin pages at `/admin/*` are protected by checking `"admin"` in `allowedGroups`.

**Tech Stack:** Next.js 16.1.6 App Router, MongoDB 7.x via `lib/mongo.ts`, NextAuth 4 via `lib/auth.ts`, TypeScript 5, Tailwind CSS 4, lucide-react

## Global Constraints

- Database: `atms` db via `clientPromise` from `lib/mongo.ts` using env var `MONGO_URI`
- New collections: `permission_groups`, `app_users` (both in `atms` db)
- Sidebar section permission keys (exact strings): `"vehicle"`, `"fuel"`, `"ops"`, `"mixer"`, `"procurement"`, `"maintenance"`, `"admin"`
- Overview (Home `/`) is always accessible — no permission key
- Unassigned users (no `group_id`) can only see Overview
- Admin users get `allowedGroups: ["vehicle","fuel","ops","mixer","procurement","maintenance","admin"]`
- No new npm packages — use existing lucide-react, mongodb, next-auth, Tailwind
- All new UI pages must be `"use client"` and follow the existing pattern (no shadcn components beyond Button and Card)
- All admin API routes must verify `isAdmin` before responding — return `{ error: "Forbidden" }` with status 403 if not
- TypeScript: run `npx tsc --noEmit` after each task to verify no type errors

---

### Task 1: Permissions Utility

**Files:**
- Create: `lib/permissions.ts`

**Interfaces:**
- Consumes: `clientPromise` from `lib/mongo.ts`, `ObjectId` from `mongodb`
- Produces:
  - `type UserPermissions = { isAdmin: boolean; allowedGroups: string[] }`
  - `async function getUserPermissions(email: string | null | undefined): Promise<UserPermissions>`

- [ ] **Step 1: Create `lib/permissions.ts`**

```typescript
import { ObjectId } from "mongodb"
import clientPromise from "@/lib/mongo"

export type UserPermissions = {
  isAdmin: boolean
  allowedGroups: string[]
}

const ALL_GROUPS = ["vehicle", "fuel", "ops", "mixer", "procurement", "maintenance", "admin"]

export async function getUserPermissions(
  email: string | null | undefined
): Promise<UserPermissions> {
  if (!email) return { isAdmin: false, allowedGroups: [] }

  try {
    const client = await clientPromise
    const db = client.db("atms")

    const user = await db.collection("app_users").findOne({ email })
    if (!user || !user.group_id) return { isAdmin: false, allowedGroups: [] }

    const group = await db
      .collection("permission_groups")
      .findOne({ _id: new ObjectId(String(user.group_id)) })
    if (!group) return { isAdmin: false, allowedGroups: [] }

    if (group.is_admin) {
      return { isAdmin: true, allowedGroups: ALL_GROUPS }
    }

    return { isAdmin: false, allowedGroups: (group.access as string[]) ?? [] }
  } catch {
    return { isAdmin: false, allowedGroups: [] }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd /path/to/mena-intelligence && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors unrelated to this file)

- [ ] **Step 3: Commit**

```bash
git add lib/permissions.ts
git commit -m "feat: add getUserPermissions utility for role-based access"
```

---

### Task 2: Record Users on Sign-In

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: `clientPromise` from `lib/mongo.ts`
- Produces: Every Google sign-in upserts a doc into `app_users` with `{ email, name, image, last_seen }` and `$setOnInsert: { group_id: null, group_name: null, created_at }`

- [ ] **Step 1: Update `lib/auth.ts`** — add MongoDB upsert to the `signIn` callback

Replace the entire file content with:

```typescript
import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import clientPromise from "@/lib/mongo"

const ALLOWED_DOMAIN = "menatransport.co.th"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const email  = user?.email ?? (profile as { email?: string })?.email ?? ""
      const domain = email.split("@")[1]?.toLowerCase()
      if (domain !== ALLOWED_DOMAIN) return false

      try {
        const client = await clientPromise
        const db = client.db("atms")
        await db.collection("app_users").updateOne(
          { email },
          {
            $set: {
              name:      user.name  ?? "",
              image:     user.image ?? "",
              last_seen: new Date(),
            },
            $setOnInsert: {
              group_id:   null,
              group_name: null,
              created_at: new Date(),
            },
          },
          { upsert: true }
        )
      } catch {
        // don't block sign-in if DB write fails
      }

      return true
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error:  "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET ?? "KmPPFtAkmCcq7GfYW2MFkU9qS4NcRARXWfno8SrtVg0=",
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Verify manually**

Start dev server (`npm run dev`). Sign out and sign back in with a `@menatransport.co.th` Google account. In MongoDB Compass, open `atms` → `app_users`. A document should appear with your email, name, image, `group_id: null`, `group_name: null`.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: upsert app_users on every Google sign-in"
```

---

### Task 3: Permission UI Plumbing

Wire `allowedGroups` from MongoDB through the component tree so the sidebar hides sections the user can't access.

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/app-shell.tsx`
- Modify: `components/sidebar.tsx`

**Interfaces:**
- Consumes: `getUserPermissions` from `lib/permissions.ts`, `getServerSession` from `next-auth/next`, `authOptions` from `lib/auth.ts`
- Produces:
  - `AppShell` accepts new prop `allowedGroups: string[]`
  - `Sidebar` accepts new prop `allowedGroups: string[]`
  - `NAV_GROUPS` entries have optional `permissionKey?: string` field
  - Sidebar filters groups where `!permissionKey || allowedGroups.includes(permissionKey)`

- [ ] **Step 1: Update `app/layout.tsx`** — make it async, fetch permissions, pass to AppShell

Replace entire file:

```tsx
import "./globals.css"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import { Providers } from "@/components/providers"
import { AppShell } from "@/components/app-shell"

export const metadata = {
  title: "Mena Intelligence",
  description: "Fleet Analytics & Allocation Platform",
  icons: { icon: "/logo.svg" },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className="flex h-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a10]">
        <Providers>
          <AppShell allowedGroups={allowedGroups}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Update `components/app-shell.tsx`** — accept `allowedGroups` prop, pass to Sidebar

Replace entire file:

```tsx
"use client"

import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { Menu } from "lucide-react"
import { Sidebar } from "./sidebar"
import { AiChatWidget } from "./ai-chat-widget"

export function AppShell({
  children,
  allowedGroups,
}: {
  children: React.ReactNode
  allowedGroups: string[]
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [pathname, isMobile])

  if (pathname === "/login") {
    return <div className="w-full h-full">{children}</div>
  }

  return (
    <>
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        isMobile={isMobile}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        allowedGroups={allowedGroups}
      />
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 sm:py-7 min-w-0">
        {isMobile && (
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors"
            >
              <Menu size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Mena Intel</span>
          </div>
        )}
        {children}
      </main>
      <AiChatWidget />
    </>
  )
}
```

- [ ] **Step 3: Update `components/sidebar.tsx`** — add `permissionKey` to `NavGroup` type, add keys to each group, add Admin group, accept `allowedGroups` prop, filter nav

Find the `type NavGroup` block and the `NAV_GROUPS` array and the `Sidebar` function. Make these changes:

**3a. Update `type NavGroup`** — add `permissionKey?: string`:
```typescript
type NavGroup = {
  label: string
  permissionKey?: string
  items: NavItem[]
}
```

**3b. Add `Shield` to lucide-react imports** (add alongside existing imports):
```typescript
import {
  BarChart3,
  Calculator,
  Fuel,
  ChevronLeft,
  ChevronRight,
  Truck,
  Trophy,
  PackageSearch,
  LayoutDashboard,
  Warehouse,
  TrendingUp,
  Users,
  FileText,
  LogOut,
  Search,
  Wrench,
  History,
  Settings2,
  Shield,
} from "lucide-react"
```

**3c. Replace the entire `NAV_GROUPS` array** with this version that adds `permissionKey` to each group and adds the Admin group at the end:

```typescript
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Vehicle",
    permissionKey: "vehicle",
    items: [
      { href: "/truck-distance", label: "Truck Distance", icon: Truck },
      { href: "/truck-year-cost", label: "Truck Year Cost", icon: BarChart3 },
      { href: "/truck_utilize_analysis", label: "Truck Utilize", icon: Truck },
      { href: "/fleet-report", label: "Fleet Report", icon: FileText },
    ],
  },
  {
    label: "Fuel",
    permissionKey: "fuel",
    items: [
      { href: "/fuel", label: "Fuel Management", icon: Fuel },
    ],
  },
  {
    label: "Ops",
    permissionKey: "ops",
    items: [
      { href: "/repair-cost",          label: "Repair Cost",        icon: Calculator },
      { href: "/repair-analysis",      label: "Repair Analysis",    icon: BarChart3 },
      { href: "/cost",                 label: "Cost Monitoring",    icon: Warehouse },
      { href: "/pc-cost",              label: "PC Cost",            icon: TrendingUp },
      { href: "/transaction-detail",   label: "Transaction Detail", icon: FileText },
    ],
  },
  {
    label: "Mixer",
    permissionKey: "mixer",
    items: [
      { href: "/asia-incentive",      label: "Asia Incentive",      icon: Trophy },
      { href: "/asia-plant-analysis", label: "Asia Plant Analysis", icon: BarChart3 },
    ],
  },
  {
    label: "Procurement",
    permissionKey: "procurement",
    items: [
      { href: "/procurement-search",      label: "Procurement Search", icon: Search },
      { href: "/stock-budget-ladkrabang", label: "Stock Budget",       icon: PackageSearch },
      { href: "/price-benchmark",         label: "Price Benchmark",    icon: TrendingUp },
      { href: "/supplier-analysis",       label: "Supplier Analysis",  icon: Users },
    ],
  },
  {
    label: "Maintenance",
    permissionKey: "maintenance",
    items: [
      { href: "/repair-daily/vs",       label: "Daily Log (VS)",     icon: Wrench },
      { href: "/repair-daily/garage",   label: "Daily Log (Garage)", icon: Wrench },
      { href: "/repair-daily/history",  label: "Report History",     icon: History },
      { href: "/repair-daily/settings", label: "Templates",          icon: Settings2 },
    ],
  },
  {
    label: "Admin",
    permissionKey: "admin",
    items: [
      { href: "/admin/users",  label: "Users",  icon: Users },
      { href: "/admin/groups", label: "Groups", icon: Shield },
    ],
  },
]
```

**3d. Update the `Sidebar` function signature** to accept `allowedGroups`:

```typescript
export function Sidebar({
  isMobile = false,
  mobileOpen = false,
  onMobileClose,
  allowedGroups = [],
}: {
  isMobile?: boolean
  mobileOpen?: boolean
  onMobileClose?: () => void
  allowedGroups?: string[]
}) {
```

**3e. Update the nav render** — filter NAV_GROUPS before mapping. In the `<nav>` block, change `{NAV_GROUPS.map((group) => (` to:

```tsx
{NAV_GROUPS.filter(
  (group) => !group.permissionKey || allowedGroups.includes(group.permissionKey)
).map((group) => (
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Verify manually**

Start dev server. Sign in as a user with no group assigned. Sidebar should show only "Overview → Home". Sign in as an admin user (after manually seeding — see bootstrap note below or test with a temporary hardcode). Sidebar should show all groups including Admin.

> **Bootstrap note for testing:** After Task 2, sign in once to create your `app_users` doc. Then in MongoDB Compass:
> 1. Insert into `permission_groups`: `{ name: "Admin", is_admin: true, access: [], created_at: new Date(), updated_at: new Date() }`
> 2. Copy the `_id` of the Admin group
> 3. Update your `app_users` doc: set `group_id: ObjectId("...your_group_id...")`, `group_name: "Admin"`
> 4. Sign out and sign back in — you should see all sidebar groups including Admin

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx components/app-shell.tsx components/sidebar.tsx
git commit -m "feat: wire permission-based sidebar filtering through layout → AppShell → Sidebar"
```

---

### Task 4: Route Protection Layouts + Unauthorized Page

Add a `layout.tsx` per protected route directory that checks the matching permission key. Unassigned users who navigate directly to a protected URL see `/unauthorized`.

**Files:**
- Create: `app/unauthorized/page.tsx`
- Create: `app/fuel/layout.tsx`
- Create: `app/truck-distance/layout.tsx`
- Create: `app/truck-year-cost/layout.tsx`
- Create: `app/truck_utilize_analysis/layout.tsx`
- Create: `app/fleet-report/layout.tsx`
- Create: `app/repair-cost/layout.tsx`
- Create: `app/repair-analysis/layout.tsx`
- Create: `app/cost/layout.tsx`
- Create: `app/pc-cost/layout.tsx`
- Create: `app/transaction-detail/layout.tsx`
- Create: `app/asia-incentive/layout.tsx`
- Create: `app/asia-plant-analysis/layout.tsx`
- Create: `app/procurement-search/layout.tsx`
- Create: `app/stock-budget-ladkrabang/layout.tsx`
- Create: `app/price-benchmark/layout.tsx`
- Create: `app/supplier-analysis/layout.tsx`
- Create: `app/repair-daily/layout.tsx`

**Interfaces:**
- Consumes: `getUserPermissions` from `lib/permissions.ts`, `getServerSession` from `next-auth/next`, `authOptions` from `lib/auth.ts`, `redirect` from `next/navigation`

- [ ] **Step 1: Create `app/unauthorized/page.tsx`**

```tsx
"use client"

import Link from "next/link"
import { ShieldX } from "lucide-react"

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <ShieldX size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
        กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การเข้าถึง
      </p>
      <Link
        href="/"
        className="rounded-lg bg-gray-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:opacity-90 transition-opacity"
      >
        กลับหน้าหลัก
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Create a shared helper** — to avoid repeating the same 6 lines in every layout, note that each layout file is tiny and follows the same pattern. Write each layout as shown below (they ARE repeated by design — each is independently deployable).

- [ ] **Step 3: Create `app/fuel/layout.tsx`**

```tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function FuelLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!allowedGroups.includes("fuel")) redirect("/unauthorized")
  return <>{children}</>
}
```

- [ ] **Step 4: Create vehicle group layouts** — same pattern with key `"vehicle"`:

`app/truck-distance/layout.tsx`:
```tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!allowedGroups.includes("vehicle")) redirect("/unauthorized")
  return <>{children}</>
}
```

`app/truck-year-cost/layout.tsx` — identical to above (same permission key `"vehicle"`)

`app/truck_utilize_analysis/layout.tsx` — identical (key `"vehicle"`)

`app/fleet-report/layout.tsx` — identical (key `"vehicle"`)

- [ ] **Step 5: Create ops group layouts** — key `"ops"`:

`app/repair-cost/layout.tsx`:
```tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!allowedGroups.includes("ops")) redirect("/unauthorized")
  return <>{children}</>
}
```

`app/repair-analysis/layout.tsx` — identical (key `"ops"`)

`app/cost/layout.tsx` — identical (key `"ops"`)

`app/pc-cost/layout.tsx` — identical (key `"ops"`)

`app/transaction-detail/layout.tsx` — identical (key `"ops"`)

- [ ] **Step 6: Create mixer group layouts** — key `"mixer"`:

`app/asia-incentive/layout.tsx`:
```tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!allowedGroups.includes("mixer")) redirect("/unauthorized")
  return <>{children}</>
}
```

`app/asia-plant-analysis/layout.tsx` — identical (key `"mixer"`)

- [ ] **Step 7: Create procurement group layouts** — key `"procurement"`:

`app/procurement-search/layout.tsx`:
```tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!allowedGroups.includes("procurement")) redirect("/unauthorized")
  return <>{children}</>
}
```

`app/stock-budget-ladkrabang/layout.tsx` — identical (key `"procurement"`)

`app/price-benchmark/layout.tsx` — identical (key `"procurement"`)

`app/supplier-analysis/layout.tsx` — identical (key `"procurement"`)

- [ ] **Step 8: Create maintenance layout** — key `"maintenance"`:

`app/repair-daily/layout.tsx`:
```tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!allowedGroups.includes("maintenance")) redirect("/unauthorized")
  return <>{children}</>
}
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 10: Verify manually**

Open an incognito browser. Sign in as a user with no group. Try navigating to `/fuel` — should redirect to `/unauthorized`. Navigate to `/` — should work (Overview always accessible).

- [ ] **Step 11: Commit**

```bash
git add app/unauthorized/page.tsx \
  app/fuel/layout.tsx \
  app/truck-distance/layout.tsx app/truck-year-cost/layout.tsx \
  app/truck_utilize_analysis/layout.tsx app/fleet-report/layout.tsx \
  app/repair-cost/layout.tsx app/repair-analysis/layout.tsx \
  app/cost/layout.tsx app/pc-cost/layout.tsx app/transaction-detail/layout.tsx \
  app/asia-incentive/layout.tsx app/asia-plant-analysis/layout.tsx \
  app/procurement-search/layout.tsx app/stock-budget-ladkrabang/layout.tsx \
  app/price-benchmark/layout.tsx app/supplier-analysis/layout.tsx \
  app/repair-daily/layout.tsx
git commit -m "feat: add server-side route protection layouts and unauthorized page"
```

---

### Task 5: Admin API Routes

**Files:**
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/groups/route.ts`

**Interfaces:**
- Consumes: `getUserPermissions` from `lib/permissions.ts`, `getServerSession` from `next-auth/next`, `authOptions` from `lib/auth.ts`, `clientPromise` from `lib/mongo.ts`, `ObjectId` from `mongodb`
- Produces:
  - `GET /api/admin/users` → `{ success: true, data: AppUser[] }`
  - `PATCH /api/admin/users` → `{ success: true }` (body: `{ email: string, group_id: string | null }`)
  - `GET /api/admin/groups` → `{ success: true, data: PermissionGroup[] }`
  - `POST /api/admin/groups` → `{ success: true, data: PermissionGroup }` (body: `{ name: string, is_admin: boolean, access: string[] }`)
  - `PATCH /api/admin/groups` → `{ success: true }` (body: `{ id: string, name: string, is_admin: boolean, access: string[] }`)
  - `DELETE /api/admin/groups` → `{ success: true }` (body: `{ id: string }`)

- [ ] **Step 1: Create `app/api/admin/users/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { ObjectId } from "mongodb"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

async function getAdminSession() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  const perms = await getUserPermissions(email)
  return perms.isAdmin ? email : null
}

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const client = await clientPromise
  const db = client.db("atms")
  const users = await db
    .collection("app_users")
    .find({})
    .sort({ group_id: 1, last_seen: -1 })
    .toArray()

  return NextResponse.json({ success: true, data: users })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { email, group_id } = await req.json() as { email: string; group_id: string | null }

  const client = await clientPromise
  const db = client.db("atms")

  if (!group_id) {
    await db.collection("app_users").updateOne(
      { email },
      { $set: { group_id: null, group_name: null } }
    )
    return NextResponse.json({ success: true })
  }

  const group = await db.collection("permission_groups").findOne({ _id: new ObjectId(group_id) })
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  await db.collection("app_users").updateOne(
    { email },
    { $set: { group_id: new ObjectId(group_id), group_name: group.name as string } }
  )

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Create `app/api/admin/groups/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { ObjectId } from "mongodb"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

async function getAdminSession() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  const perms = await getUserPermissions(email)
  return perms.isAdmin ? email : null
}

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const client = await clientPromise
  const db = client.db("atms")
  const groups = await db.collection("permission_groups").find({}).sort({ name: 1 }).toArray()

  return NextResponse.json({ success: true, data: groups })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { name, is_admin, access } = await req.json() as {
    name: string
    is_admin: boolean
    access: string[]
  }

  const client = await clientPromise
  const db = client.db("atms")
  const now = new Date()
  const result = await db.collection("permission_groups").insertOne({
    name,
    is_admin,
    access,
    created_at: now,
    updated_at: now,
  })

  const doc = await db.collection("permission_groups").findOne({ _id: result.insertedId })
  return NextResponse.json({ success: true, data: doc })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id, name, is_admin, access } = await req.json() as {
    id: string
    name: string
    is_admin: boolean
    access: string[]
  }

  const client = await clientPromise
  const db = client.db("atms")

  await db.collection("permission_groups").updateOne(
    { _id: new ObjectId(id) },
    { $set: { name, is_admin, access, updated_at: new Date() } }
  )

  // Update denormalized group_name in app_users
  await db.collection("app_users").updateMany(
    { group_id: new ObjectId(id) },
    { $set: { group_name: name } }
  )

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await req.json() as { id: string }

  const client = await clientPromise
  const db = client.db("atms")

  // Unassign all users in this group
  await db.collection("app_users").updateMany(
    { group_id: new ObjectId(id) },
    { $set: { group_id: null, group_name: null } }
  )

  await db.collection("permission_groups").deleteOne({ _id: new ObjectId(id) })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Verify manually** (requires admin session from bootstrap in Task 3)

```bash
# List users (should return your user record)
curl -b cookies.txt http://localhost:3001/api/admin/users

# List groups (should return the Admin group you seeded)
curl -b cookies.txt http://localhost:3001/api/admin/groups
```

Note: Use a browser's Network tab to get cookie headers, or just test via the UI in Task 6.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/users/route.ts app/api/admin/groups/route.ts
git commit -m "feat: add admin API routes for user and group management"
```

---

### Task 6: Admin UI Pages

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/users/page.tsx`
- Create: `app/admin/groups/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/admin/users` → `{ success: true, data: { _id, email, name, image, group_id, group_name, last_seen }[] }`
  - `PATCH /api/admin/users` → body `{ email: string, group_id: string | null }`
  - `GET /api/admin/groups` → `{ success: true, data: { _id, name, is_admin, access }[] }`
  - `POST /api/admin/groups` → body `{ name: string, is_admin: boolean, access: string[] }`
  - `PATCH /api/admin/groups` → body `{ id: string, name: string, is_admin: boolean, access: string[] }`
  - `DELETE /api/admin/groups` → body `{ id: string }`

- [ ] **Step 1: Create `app/admin/layout.tsx`** — admin-only gate

```tsx
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const { isAdmin } = await getUserPermissions(session?.user?.email)
  if (!isAdmin) redirect("/unauthorized")
  return <>{children}</>
}
```

- [ ] **Step 2: Create `app/admin/users/page.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"

const SECTION_KEYS = ["vehicle", "fuel", "ops", "mixer", "procurement", "maintenance"]

type AppUser = {
  _id: string
  email: string
  name: string
  image: string
  group_id: string | null
  group_name: string | null
  last_seen: string
}

type Group = {
  _id: string
  name: string
  is_admin: boolean
  access: string[]
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [pendingGroups, setPendingGroups] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/groups").then((r) => r.json()),
    ]).then(([u, g]) => {
      setUsers(u.data ?? [])
      setGroups(g.data ?? [])
      const initial: Record<string, string> = {}
      for (const user of u.data ?? []) {
        initial[user.email] = user.group_id ?? ""
      }
      setPendingGroups(initial)
    })
  }, [])

  async function saveUser(email: string) {
    setSaving(email)
    const group_id = pendingGroups[email] || null
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, group_id }),
    })
    // Refresh users list
    const res = await fetch("/api/admin/users").then((r) => r.json())
    setUsers(res.data ?? [])
    setSaving(null)
  }

  const unassigned = users.filter((u) => !u.group_id)
  const assigned = users.filter((u) => u.group_id)

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">จัดการผู้ใช้งาน</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          กำหนดกลุ่มสิทธิ์ให้กับแต่ละผู้ใช้
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/6">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ผู้ใช้</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">เข้าใช้ล่าสุด</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">กลุ่มสิทธิ์</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {[...unassigned, ...assigned].map((user) => (
              <tr key={user.email} className="border-b border-gray-50 dark:border-white/4 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">
                        {user.name?.[0] ?? "?"}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                  {user.last_seen ? new Date(user.last_seen).toLocaleDateString("th-TH") : "-"}
                </td>
                <td className="px-4 py-3">
                  {!user.group_id && (
                    <span className="inline-block mb-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                      ยังไม่ได้กำหนด
                    </span>
                  )}
                  <select
                    value={pendingGroups[user.email] ?? ""}
                    onChange={(e) =>
                      setPendingGroups((p) => ({ ...p, [user.email]: e.target.value }))
                    }
                    className="block w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">— ไม่มีกลุ่ม —</option>
                    {groups.map((g) => (
                      <option key={String(g._id)} value={String(g._id)}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => saveUser(user.email)}
                    disabled={saving === user.email}
                    className="rounded-lg bg-gray-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-40 transition-opacity"
                  >
                    {saving === user.email ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  ยังไม่มีผู้ใช้ลงทะเบียน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/admin/groups/page.tsx`**

```tsx
"use client"

import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, X, Check } from "lucide-react"

const SECTION_KEYS = [
  { key: "vehicle",      label: "Vehicle" },
  { key: "fuel",         label: "Fuel" },
  { key: "ops",          label: "Ops" },
  { key: "mixer",        label: "Mixer" },
  { key: "procurement",  label: "Procurement" },
  { key: "maintenance",  label: "Maintenance" },
]

type Group = {
  _id: string
  name: string
  is_admin: boolean
  access: string[]
}

type FormState = {
  name: string
  is_admin: boolean
  access: string[]
}

const EMPTY_FORM: FormState = { name: "", is_admin: false, access: [] }

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    const res = await fetch("/api/admin/groups").then((r) => r.json())
    setGroups(res.data ?? [])
  }

  useEffect(() => { load() }, [])

  function toggleAccess(key: string) {
    setForm((f) => ({
      ...f,
      access: f.access.includes(key) ? f.access.filter((k) => k !== key) : [...f.access, key],
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    if (editingId) {
      await fetch("/api/admin/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...form }),
      })
    } else {
      await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
    }
    await load()
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("ลบกลุ่มนี้? ผู้ใช้ที่อยู่ในกลุ่มจะถูกยกเลิกสิทธิ์ทั้งหมด")) return
    setDeleting(id)
    await fetch("/api/admin/groups", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    await load()
    setDeleting(null)
  }

  function startEdit(group: Group) {
    setEditingId(String(group._id))
    setForm({ name: group.name, is_admin: group.is_admin, access: group.access })
    setShowForm(true)
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">กลุ่มสิทธิ์</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            กำหนดว่าแต่ละกลุ่มเข้าถึงส่วนใดของระบบได้บ้าง
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true) }}
            className="flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-3 py-2 text-sm font-medium text-white dark:text-gray-900 hover:opacity-80 transition-opacity"
          >
            <Plus size={14} />
            สร้างกลุ่มใหม่
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 p-4">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">
            {editingId ? "แก้ไขกลุ่ม" : "สร้างกลุ่มใหม่"}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">ชื่อกลุ่ม</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="เช่น Fuel Team, OPS Team"
                className="block w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_admin"
                checked={form.is_admin}
                onChange={(e) => setForm((f) => ({ ...f, is_admin: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="is_admin" className="text-sm text-gray-700 dark:text-gray-300">
                Admin (เข้าถึงได้ทุกส่วน)
              </label>
            </div>

            {!form.is_admin && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">ส่วนที่เข้าถึงได้</p>
                <div className="flex flex-wrap gap-2">
                  {SECTION_KEYS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleAccess(key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                        form.access.includes(key)
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-gray-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-40 transition-opacity"
              >
                <Check size={13} />
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM) }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/6 transition-colors"
              >
                <X size={13} />
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-3">
        {groups.map((group) => (
          <div
            key={String(group._id)}
            className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900 dark:text-white">{group.name}</span>
                {group.is_admin && (
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Admin
                  </span>
                )}
              </div>
              {!group.is_admin && (
                <div className="flex flex-wrap gap-1">
                  {group.access.length === 0 ? (
                    <span className="text-xs text-gray-400">ไม่มีสิทธิ์เพิ่มเติม</span>
                  ) : (
                    group.access.map((key) => (
                      <span
                        key={key}
                        className="rounded-full bg-gray-100 dark:bg-white/8 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300"
                      >
                        {key}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => startEdit(group)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-700 dark:hover:text-white transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => handleDelete(String(group._id))}
                disabled={deleting === String(group._id)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 transition-colors disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">ยังไม่มีกลุ่มสิทธิ์</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Verify manually**

Sign in as an admin user (with bootstrap from Task 3). Navigate to `/admin/users` — should see your user in the table. Navigate to `/admin/groups` — should see the Admin group. Create a new group (e.g., "Fuel Team" with `fuel` access). Assign yourself to it (or another signed-in user). Sign out, sign back in as that user — sidebar should only show Fuel section.

- [ ] **Step 6: Commit**

```bash
git add app/admin/layout.tsx app/admin/users/page.tsx app/admin/groups/page.tsx
git commit -m "feat: add admin panel UI for user and group management"
```

---

## Bootstrap Instructions (After All Tasks)

To activate the admin panel for the first time:

1. Ensure all tasks are deployed / dev server is running
2. Sign in with your `@menatransport.co.th` Google account (this creates your `app_users` doc)
3. In MongoDB Compass → `atms` → `permission_groups`, insert:
   ```json
   {
     "name": "Admin",
     "is_admin": true,
     "access": [],
     "created_at": { "$date": "2026-06-29T00:00:00Z" },
     "updated_at": { "$date": "2026-06-29T00:00:00Z" }
   }
   ```
4. Copy the `_id` of the newly inserted Admin group
5. In `atms` → `app_users`, find your email doc and update:
   ```json
   { "$set": { "group_id": { "$oid": "<paste_id_here>" }, "group_name": "Admin" } }
   ```
6. Sign out and sign back in — the Admin sidebar group appears and all sections are accessible
7. Use `/admin/groups` to create other groups, `/admin/users` to assign users
