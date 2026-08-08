# Repair Daily Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Maintenance" section to Mena Intelligence where VS and อู่ใน supervisors enter daily repair backlog numbers, save them to MongoDB, and copy a formatted LINE message to their vehicle manager group.

**Architecture:** Next.js App Router pages + API routes, all within the existing `mena-intelligence` project. Data stored in two new MongoDB collections (`repair_daily_vs`, `repair_daily_garage`) and one template collection in the existing `atms` database. A shared utility module handles TypeScript types, template rendering, and Thai date formatting.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, MongoDB 7 via `lib/mongo.ts`, Recharts 3.8, Tailwind CSS 4, lucide-react

## Global Constraints

- MongoDB env var is `MONGO_URI` (not `MONGODB_URI`) — always import from `@/lib/mongo`
- Use `"use client"` directive on all interactive pages and components
- API routes: always return `NextResponse.json({ success: true, ... })` on success and `NextResponse.json({ success: false, error: msg }, { status: 500 })` on error — match existing pattern in `app/api/repair-analysis/route.ts`
- Tailwind CSS 4 syntax — no `@apply` directives, inline class names only
- Only these shadcn/ui components exist: `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`, `Button` from `@/components/ui/button` — use plain `<input>` elements styled with Tailwind for all form inputs
- lucide-react version `^0.575.0` — import icons with named imports
- Date stored as ISO string `"YYYY-MM-DD"` (e.g., `"2026-06-25"`); date is the unique key per collection — upsert on POST
- Thai Buddhist era year = Gregorian year + 543
- No test framework installed — verify with `npx tsc --noEmit` for types and `npm run dev` + manual browser check

---

## File Structure

```
lib/
  repair-daily.ts                           NEW — types, template renderer, Thai date, defaults

app/
  api/
    repair-daily/
      vs/route.ts                           NEW — GET (list) + POST (upsert) VS records
      garage/route.ts                       NEW — GET (list) + POST (upsert) Garage records
      templates/route.ts                    NEW — GET both templates + POST (upsert) one template

  repair-daily/
    vs/page.tsx                             NEW — VS daily form (create + edit)
    garage/page.tsx                         NEW — Garage daily form (create + edit)
    history/page.tsx                        NEW — History table + charts (tabs: VS / Garage)
    settings/page.tsx                       NEW — Template editor with live preview

components/
  sidebar.tsx                               MODIFY — add "Maintenance" nav group
```

---

## Task 1: Shared Types and Template Utilities

**Files:**
- Create: `lib/repair-daily.ts`

**Interfaces:**
- Produces: `VSRecord`, `GarageRecord`, `DailyTemplate`, `toThaiDate()`, `renderTemplate()`, `vsToTemplateVars()`, `garageToTemplateVars()`, `DEFAULT_VS_TEMPLATE`, `DEFAULT_GARAGE_TEMPLATE` — used by all subsequent tasks

- [ ] **Step 1: Create `lib/repair-daily.ts`**

```typescript
// lib/repair-daily.ts

export interface GarageOutStatus {
  waiting_assessment: number
  waiting_approval: number
  waiting_parts: number
  in_progress: number
  completed: number
}

export interface GarageStatus {
  waiting_queue: number
  in_repair: number
  waiting_parts: number
  waiting_qc: number
  on_hold: number
}

export interface NextDayPlan {
  target_complete: number
  urgent_close: number
  urgent_parts: number
  team_reallocation: number
  support_needed: string
}

export interface VSRecord {
  date: string
  opening_backlog: number
  new_repairs: number
  completed_today: number
  closing_backlog: number
  backlog_change: number
  completed_in: number
  completed_out: number
  garage_in_count: number
  garage_out_count: number
  garage_out_status: GarageOutStatus
  vs_followup_count: number
  notes: string
  created_at?: Date
  updated_at?: Date
}

export interface GarageRecord {
  date: string
  opening_backlog: number
  received_today: number
  completed_today: number
  closing_backlog: number
  backlog_change: number
  status: GarageStatus
  overdue_count: number
  next_day: NextDayPlan
  created_at?: Date
  updated_at?: Date
}

export interface DailyTemplate {
  type: "vs" | "garage"
  template_text: string
  updated_at?: Date
}

export function toThaiDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-")
  return `${parseInt(d)}/${parseInt(m)}/${parseInt(y) + 543}`
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0]
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "")
}

export function vsToTemplateVars(r: VSRecord): Record<string, string> {
  const change = r.backlog_change
  return {
    date_thai: toThaiDate(r.date),
    opening_backlog: String(r.opening_backlog),
    new_repairs: String(r.new_repairs),
    completed_today: String(r.completed_today),
    closing_backlog: String(r.closing_backlog),
    backlog_change: change >= 0 ? `+${change}` : String(change),
    backlog_change_abs: String(Math.abs(change)),
    completed_in: String(r.completed_in),
    completed_out: String(r.completed_out),
    garage_in_count: String(r.garage_in_count),
    garage_out_count: String(r.garage_out_count),
    waiting_assessment: String(r.garage_out_status.waiting_assessment),
    waiting_approval: String(r.garage_out_status.waiting_approval),
    waiting_parts: String(r.garage_out_status.waiting_parts),
    in_progress: String(r.garage_out_status.in_progress),
    out_completed: String(r.garage_out_status.completed),
    vs_followup_count: String(r.vs_followup_count),
    notes: r.notes,
  }
}

export function garageToTemplateVars(r: GarageRecord): Record<string, string> {
  const change = r.backlog_change
  return {
    date_thai: toThaiDate(r.date),
    opening_backlog: String(r.opening_backlog),
    received_today: String(r.received_today),
    completed_today: String(r.completed_today),
    closing_backlog: String(r.closing_backlog),
    backlog_change: change >= 0 ? `+${change}` : String(change),
    waiting_queue: String(r.status.waiting_queue),
    in_repair: String(r.status.in_repair),
    waiting_parts: String(r.status.waiting_parts),
    waiting_qc: String(r.status.waiting_qc),
    on_hold: String(r.status.on_hold),
    overdue_count: String(r.overdue_count),
    target_complete: String(r.next_day.target_complete),
    urgent_close: String(r.next_day.urgent_close),
    urgent_parts: String(r.next_day.urgent_parts),
    team_reallocation: String(r.next_day.team_reallocation),
    support_needed: r.next_day.support_needed || "………………………………………",
  }
}

export const DEFAULT_VS_TEMPLATE = `📌 รายงานสรุปการแจ้งซ่อมทั้งหมด โดย VS
ประจำวันที่ {{date_thai}}

🔷 สรุปภาพรวมงานแจ้งซ่อม

🚗 คงค้างต้นวัน : {{opening_backlog}}  คัน
📥 รับแจ้งซ่อมใหม่วันนี้ : {{new_repairs}} คัน
✅ ซ่อมเสร็จส่งมอบวันนี้ : {{completed_today}} คัน
📌 คงค้างสิ้นวันรวม: {{closing_backlog}} คัน

📊 Backlog ลด : {{backlog_change_abs}} คัน
สาเหตุภาพรวม : อู่ในเสร็จ {{completed_in}} คัน อู่นอกเสร็จ {{completed_out}} คัน

🔧 แยกคงค้างสิ้นวัน

🏭 อู่ใน : {{garage_in_count}} คัน
↗️ อู่นอก : {{garage_out_count}} คัน
รวมคงค้างสิ้นวัน : {{closing_backlog}} คัน


↗️ สถานะอู่นอก

* รอประเมิน : {{waiting_assessment}} คัน
* รออนุมัติซ่อม : {{waiting_approval}} คัน
* รออะไหล่ : {{waiting_parts}} คัน
* อยู่ระหว่างซ่อม : {{in_progress}} คัน
* เสร็จ : {{out_completed}} คัน

🎯 แผนติดตามของ VS วันถัดไป

* งานอู่นอกที่ต้องเร่งติดตามซ่อมในวันถัดไป : {{vs_followup_count}} คัน

📌 ตรวจยอด
คงค้างต้นวัน + รับแจ้งใหม่ - ซ่อมเสร็จ = คงค้างสิ้นวันรวม
คงค้างอู่ใน + คงค้างอู่นอก = คงค้างสิ้นวันรวม`

export const DEFAULT_GARAGE_TEMPLATE = `ประจำวันที่ {{date_thai}}

🔷 สรุปงานอู่ใน

🏭 คงค้างอู่ในต้นวัน: {{opening_backlog}} คัน
📥 รับเข้าอู่ในวันนี้: {{received_today}} คัน
✅ ซ่อมเสร็จส่งมอบวันนี้: {{completed_today}} คัน
📌 คงค้างอู่ในสิ้นวัน: {{closing_backlog}} คัน

📊 งานอู่ในเพิ่ม/ลด: {{backlog_change}} คัน
สาเหตุภาพรวม: ………………………………………

🔧 สถานะรถคงค้างอู่ใน

* รอขึ้นซ่อม: {{waiting_queue}} คัน
* กำลังซ่อม: {{in_repair}} คัน
* รออะไหล่: {{waiting_parts}} คัน
* รอ QC / รอส่งมอบ: {{waiting_qc}} คัน
* ชะลอซ่อม: {{on_hold}} คัน

⏰ งานเกินกำหนดอู่ใน: {{overdue_count}} คัน

🎯 แผนอู่ในวันถัดไป

* เป้าซ่อมเสร็จส่งมอบ: {{target_complete}} คัน
* งานที่ต้องเร่งปิด: {{urgent_close}} คัน
* งานที่ต้องเร่งอะไหล่: {{urgent_parts}} คัน
* งานที่ต้องจัดช่าง/โยกทีมเพิ่ม: {{team_reallocation}} คัน
* เรื่องที่ต้องขอ Support: {{support_needed}}

📌 ตรวจยอด
รอขึ้นซ่อม + กำลังซ่อม + รออะไหล่ + รอ QC/รอส่งมอบ + ชะลอซ่อม = คงค้างอู่ในสิ้นวัน`
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/menatransport_02/Documents/project/mena_intelligence/mena-intelligence
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/repair-daily.ts
git commit -m "feat: add repair-daily shared types and template utilities"
```

---

## Task 2: API Routes

**Files:**
- Create: `app/api/repair-daily/vs/route.ts`
- Create: `app/api/repair-daily/garage/route.ts`
- Create: `app/api/repair-daily/templates/route.ts`

**Interfaces:**
- Consumes: `clientPromise` from `@/lib/mongo`, `VSRecord`, `GarageRecord`, `DailyTemplate`, `DEFAULT_VS_TEMPLATE`, `DEFAULT_GARAGE_TEMPLATE` from `@/lib/repair-daily`
- Produces:
  - `GET /api/repair-daily/vs?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ success: true, data: VSRecord[] }`
  - `POST /api/repair-daily/vs` body: `VSRecord` → `{ success: true }`
  - `GET /api/repair-daily/garage?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ success: true, data: GarageRecord[] }`
  - `POST /api/repair-daily/garage` body: `GarageRecord` → `{ success: true }`
  - `GET /api/repair-daily/templates` → `{ success: true, vs: string, garage: string }`
  - `POST /api/repair-daily/templates` body: `{ type: "vs"|"garage", template_text: string }` → `{ success: true }`

- [ ] **Step 1: Create VS API route**

```typescript
// app/api/repair-daily/vs/route.ts
import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"
import type { VSRecord } from "@/lib/repair-daily"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const client = await clientPromise
    const col = client.db("atms").collection<VSRecord>("repair_daily_vs")

    const filter: Record<string, unknown> = {}
    if (from || to) {
      filter.date = {}
      if (from) (filter.date as Record<string, string>)["$gte"] = from
      if (to) (filter.date as Record<string, string>)["$lte"] = to
    }

    const data = await col.find(filter, { projection: { _id: 0 } }).sort({ date: -1 }).toArray()
    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body: VSRecord = await req.json()
    if (!body.date) return NextResponse.json({ success: false, error: "date required" }, { status: 400 })

    const client = await clientPromise
    const col = client.db("atms").collection("repair_daily_vs")

    const now = new Date()
    await col.updateOne(
      { date: body.date },
      { $set: { ...body, updated_at: now }, $setOnInsert: { created_at: now } },
      { upsert: true }
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create Garage API route**

```typescript
// app/api/repair-daily/garage/route.ts
import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"
import type { GarageRecord } from "@/lib/repair-daily"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const client = await clientPromise
    const col = client.db("atms").collection<GarageRecord>("repair_daily_garage")

    const filter: Record<string, unknown> = {}
    if (from || to) {
      filter.date = {}
      if (from) (filter.date as Record<string, string>)["$gte"] = from
      if (to) (filter.date as Record<string, string>)["$lte"] = to
    }

    const data = await col.find(filter, { projection: { _id: 0 } }).sort({ date: -1 }).toArray()
    return NextResponse.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body: GarageRecord = await req.json()
    if (!body.date) return NextResponse.json({ success: false, error: "date required" }, { status: 400 })

    const client = await clientPromise
    const col = client.db("atms").collection("repair_daily_garage")

    const now = new Date()
    await col.updateOne(
      { date: body.date },
      { $set: { ...body, updated_at: now }, $setOnInsert: { created_at: now } },
      { upsert: true }
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create Templates API route**

```typescript
// app/api/repair-daily/templates/route.ts
import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"
import { DEFAULT_VS_TEMPLATE, DEFAULT_GARAGE_TEMPLATE } from "@/lib/repair-daily"
import type { DailyTemplate } from "@/lib/repair-daily"

export async function GET() {
  try {
    const client = await clientPromise
    const col = client.db("atms").collection<DailyTemplate>("repair_daily_templates")

    let vsDoc = await col.findOne({ type: "vs" })
    let garageDoc = await col.findOne({ type: "garage" })

    const now = new Date()
    if (!vsDoc) {
      await col.insertOne({ type: "vs", template_text: DEFAULT_VS_TEMPLATE, updated_at: now })
      vsDoc = { type: "vs", template_text: DEFAULT_VS_TEMPLATE, updated_at: now }
    }
    if (!garageDoc) {
      await col.insertOne({ type: "garage", template_text: DEFAULT_GARAGE_TEMPLATE, updated_at: now })
      garageDoc = { type: "garage", template_text: DEFAULT_GARAGE_TEMPLATE, updated_at: now }
    }

    return NextResponse.json({ success: true, vs: vsDoc.template_text, garage: garageDoc.template_text })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { type, template_text }: { type: "vs" | "garage"; template_text: string } = await req.json()
    if (!type || !template_text) {
      return NextResponse.json({ success: false, error: "type and template_text required" }, { status: 400 })
    }

    const client = await clientPromise
    const col = client.db("atms").collection("repair_daily_templates")

    await col.updateOne(
      { type },
      { $set: { template_text, updated_at: new Date() } },
      { upsert: true }
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/api/repair-daily/
git commit -m "feat: add repair-daily API routes for VS, garage, and templates"
```

---

## Task 3: VS Daily Form Page

**Files:**
- Create: `app/repair-daily/vs/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/repair-daily/vs?from=DATE&to=DATE` to load existing record
  - `POST /api/repair-daily/vs` to save
  - `GET /api/repair-daily/templates` to get LINE template
  - `todayISO()`, `vsToTemplateVars()`, `renderTemplate()` from `@/lib/repair-daily`
  - `toThaiDate()` from `@/lib/repair-daily`

- [ ] **Step 1: Create `app/repair-daily/vs/page.tsx`**

```typescript
// app/repair-daily/vs/page.tsx
"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Copy, Save, CheckCircle } from "lucide-react"
import { todayISO, vsToTemplateVars, renderTemplate, toThaiDate } from "@/lib/repair-daily"
import type { VSRecord } from "@/lib/repair-daily"

const INPUT_CLS = "w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
const LABEL_CLS = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
const SECTION_CLS = "rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-5"

function NumInput({ label, value, onChange, disabled }: { label: string; value: number; onChange?: (v: number) => void; disabled?: boolean }) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => onChange?.(Number(e.target.value))}
        disabled={disabled}
        className={INPUT_CLS}
      />
    </div>
  )
}

function VSFormInner() {
  const searchParams = useSearchParams()
  const urlDate = searchParams.get("date")

  const [date, setDate] = useState(urlDate ?? todayISO())
  const [openingBacklog, setOpeningBacklog] = useState(0)
  const [newRepairs, setNewRepairs] = useState(0)
  const [completedToday, setCompletedToday] = useState(0)
  const [completedIn, setCompletedIn] = useState(0)
  const [completedOut, setCompletedOut] = useState(0)
  const [garageInCount, setGarageInCount] = useState(0)
  const [garageOutCount, setGarageOutCount] = useState(0)
  const [waitingAssessment, setWaitingAssessment] = useState(0)
  const [waitingApproval, setWaitingApproval] = useState(0)
  const [waitingParts, setWaitingParts] = useState(0)
  const [inProgress, setInProgress] = useState(0)
  const [outCompleted, setOutCompleted] = useState(0)
  const [vsFollowup, setVsFollowup] = useState(0)
  const [notes, setNotes] = useState("")
  const [template, setTemplate] = useState("")
  const [lineText, setLineText] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isEdit, setIsEdit] = useState(false)

  const closingBacklog = openingBacklog + newRepairs - completedToday
  const backlogChange = closingBacklog - openingBacklog

  const loadRecord = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/repair-daily/vs?from=${d}&to=${d}`)
      const json = await res.json()
      if (json.success && json.data.length > 0) {
        const r: VSRecord = json.data[0]
        setOpeningBacklog(r.opening_backlog)
        setNewRepairs(r.new_repairs)
        setCompletedToday(r.completed_today)
        setCompletedIn(r.completed_in)
        setCompletedOut(r.completed_out)
        setGarageInCount(r.garage_in_count)
        setGarageOutCount(r.garage_out_count)
        setWaitingAssessment(r.garage_out_status.waiting_assessment)
        setWaitingApproval(r.garage_out_status.waiting_approval)
        setWaitingParts(r.garage_out_status.waiting_parts)
        setInProgress(r.garage_out_status.in_progress)
        setOutCompleted(r.garage_out_status.completed)
        setVsFollowup(r.vs_followup_count)
        setNotes(r.notes ?? "")
        setIsEdit(true)
      } else {
        setOpeningBacklog(0); setNewRepairs(0); setCompletedToday(0)
        setCompletedIn(0); setCompletedOut(0); setGarageInCount(0)
        setGarageOutCount(0); setWaitingAssessment(0); setWaitingApproval(0)
        setWaitingParts(0); setInProgress(0); setOutCompleted(0)
        setVsFollowup(0); setNotes("")
        setIsEdit(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRecord(date) }, [date, loadRecord])

  useEffect(() => {
    fetch("/api/repair-daily/templates")
      .then(r => r.json())
      .then(j => { if (j.success) setTemplate(j.vs) })
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const record: VSRecord = {
        date,
        opening_backlog: openingBacklog,
        new_repairs: newRepairs,
        completed_today: completedToday,
        closing_backlog: closingBacklog,
        backlog_change: backlogChange,
        completed_in: completedIn,
        completed_out: completedOut,
        garage_in_count: garageInCount,
        garage_out_count: garageOutCount,
        garage_out_status: {
          waiting_assessment: waitingAssessment,
          waiting_approval: waitingApproval,
          waiting_parts: waitingParts,
          in_progress: inProgress,
          completed: outCompleted,
        },
        vs_followup_count: vsFollowup,
        notes,
      }
      await fetch("/api/repair-daily/vs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) })
      const text = renderTemplate(template, vsToTemplateVars(record))
      setLineText(text)
      setIsEdit(true)
    } finally {
      setSaving(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(lineText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">รายงานสรุปการแจ้งซ่อม (VS)</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {isEdit ? "แก้ไขรายการที่มีอยู่" : "บันทึกรายการใหม่"}
          </p>
        </div>
        <div>
          <label className={LABEL_CLS}>วันที่</label>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setLineText("") }}
            className={INPUT_CLS + " w-44"}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🔷 สรุปภาพรวมงานแจ้งซ่อม</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="คงค้างต้นวัน (คัน)" value={openingBacklog} onChange={setOpeningBacklog} />
          <NumInput label="รับแจ้งซ่อมใหม่วันนี้ (คัน)" value={newRepairs} onChange={setNewRepairs} />
          <NumInput label="ซ่อมเสร็จส่งมอบวันนี้ (คัน)" value={completedToday} onChange={setCompletedToday} />
          <div>
            <label className={LABEL_CLS}>คงค้างสิ้นวันรวม (AUTO)</label>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {closingBacklog} คัน {backlogChange !== 0 && <span className={backlogChange < 0 ? "text-green-600" : "text-red-500"}>({backlogChange > 0 ? "+" : ""}{backlogChange})</span>}
            </div>
          </div>
          <NumInput label="อู่ในเสร็จ (คัน)" value={completedIn} onChange={setCompletedIn} />
          <NumInput label="อู่นอกเสร็จ (คัน)" value={completedOut} onChange={setCompletedOut} />
        </div>
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🔧 แยกคงค้างสิ้นวัน</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="🏭 อู่ใน (คัน)" value={garageInCount} onChange={setGarageInCount} />
          <NumInput label="↗️ อู่นอก (คัน)" value={garageOutCount} onChange={setGarageOutCount} />
        </div>
        {garageInCount + garageOutCount !== closingBacklog && closingBacklog > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠️ อู่ใน + อู่นอก ({garageInCount + garageOutCount}) ≠ คงค้างสิ้นวัน ({closingBacklog})</p>
        )}
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">↗️ สถานะอู่นอก</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="รอประเมิน (คัน)" value={waitingAssessment} onChange={setWaitingAssessment} />
          <NumInput label="รออนุมัติซ่อม (คัน)" value={waitingApproval} onChange={setWaitingApproval} />
          <NumInput label="รออะไหล่ (คัน)" value={waitingParts} onChange={setWaitingParts} />
          <NumInput label="อยู่ระหว่างซ่อม (คัน)" value={inProgress} onChange={setInProgress} />
          <NumInput label="เสร็จ (คัน)" value={outCompleted} onChange={setOutCompleted} />
        </div>
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🎯 แผนติดตามวันถัดไป</p>
        <NumInput label="งานอู่นอกที่ต้องเร่งติดตาม (คัน)" value={vsFollowup} onChange={setVsFollowup} />
        <div className="mt-4">
          <label className={LABEL_CLS}>หมายเหตุ</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className={INPUT_CLS}
            placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
      >
        <Save size={15} />
        {saving ? "กำลังบันทึก..." : "บันทึก & สร้าง LINE Text"}
      </button>

      {lineText && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">LINE Text พร้อมคัดลอก</p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-emerald-900/30 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
            >
              {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
              {copied ? "คัดลอกแล้ว!" : "คัดลอก"}
            </button>
          </div>
          <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{lineText}</pre>
        </div>
      )}
    </div>
  )
}

export default function VSPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">กำลังโหลด...</div>}>
      <VSFormInner />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Start dev and test manually**

```bash
npm run dev
```
Open `http://localhost:3000/repair-daily/vs`

Check:
- Form renders with all sections
- Changing date fetches existing data (or clears if none)
- `คงค้างสิ้นวัน` auto-updates as you type in the top 3 fields
- Warning appears when อู่ใน + อู่นอก ≠ closing backlog
- Save button shows LINE text preview below form
- Copy button copies to clipboard

- [ ] **Step 4: Commit**

```bash
git add app/repair-daily/vs/page.tsx
git commit -m "feat: add VS daily repair form page"
```

---

## Task 4: Garage Daily Form Page

**Files:**
- Create: `app/repair-daily/garage/page.tsx`

**Interfaces:**
- Consumes: same pattern as VS page — `GET/POST /api/repair-daily/garage`, `garageToTemplateVars()`, `renderTemplate()` from `@/lib/repair-daily`

- [ ] **Step 1: Create `app/repair-daily/garage/page.tsx`**

```typescript
// app/repair-daily/garage/page.tsx
"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Copy, Save, CheckCircle } from "lucide-react"
import { todayISO, garageToTemplateVars, renderTemplate } from "@/lib/repair-daily"
import type { GarageRecord } from "@/lib/repair-daily"

const INPUT_CLS = "w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
const LABEL_CLS = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
const SECTION_CLS = "rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-5"

function NumInput({ label, value, onChange, disabled }: { label: string; value: number; onChange?: (v: number) => void; disabled?: boolean }) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => onChange?.(Number(e.target.value))}
        disabled={disabled}
        className={INPUT_CLS}
      />
    </div>
  )
}

function GarageFormInner() {
  const searchParams = useSearchParams()
  const urlDate = searchParams.get("date")

  const [date, setDate] = useState(urlDate ?? todayISO())
  const [openingBacklog, setOpeningBacklog] = useState(0)
  const [receivedToday, setReceivedToday] = useState(0)
  const [completedToday, setCompletedToday] = useState(0)
  const [waitingQueue, setWaitingQueue] = useState(0)
  const [inRepair, setInRepair] = useState(0)
  const [waitingParts, setWaitingParts] = useState(0)
  const [waitingQc, setWaitingQc] = useState(0)
  const [onHold, setOnHold] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [targetComplete, setTargetComplete] = useState(0)
  const [urgentClose, setUrgentClose] = useState(0)
  const [urgentParts, setUrgentParts] = useState(0)
  const [teamReallocation, setTeamReallocation] = useState(0)
  const [supportNeeded, setSupportNeeded] = useState("")
  const [template, setTemplate] = useState("")
  const [lineText, setLineText] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isEdit, setIsEdit] = useState(false)

  const closingBacklog = openingBacklog + receivedToday - completedToday
  const backlogChange = closingBacklog - openingBacklog
  const statusSum = waitingQueue + inRepair + waitingParts + waitingQc + onHold

  const loadRecord = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/repair-daily/garage?from=${d}&to=${d}`)
      const json = await res.json()
      if (json.success && json.data.length > 0) {
        const r: GarageRecord = json.data[0]
        setOpeningBacklog(r.opening_backlog)
        setReceivedToday(r.received_today)
        setCompletedToday(r.completed_today)
        setWaitingQueue(r.status.waiting_queue)
        setInRepair(r.status.in_repair)
        setWaitingParts(r.status.waiting_parts)
        setWaitingQc(r.status.waiting_qc)
        setOnHold(r.status.on_hold)
        setOverdueCount(r.overdue_count)
        setTargetComplete(r.next_day.target_complete)
        setUrgentClose(r.next_day.urgent_close)
        setUrgentParts(r.next_day.urgent_parts)
        setTeamReallocation(r.next_day.team_reallocation)
        setSupportNeeded(r.next_day.support_needed ?? "")
        setIsEdit(true)
      } else {
        setOpeningBacklog(0); setReceivedToday(0); setCompletedToday(0)
        setWaitingQueue(0); setInRepair(0); setWaitingParts(0)
        setWaitingQc(0); setOnHold(0); setOverdueCount(0)
        setTargetComplete(0); setUrgentClose(0); setUrgentParts(0)
        setTeamReallocation(0); setSupportNeeded("")
        setIsEdit(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRecord(date) }, [date, loadRecord])

  useEffect(() => {
    fetch("/api/repair-daily/templates")
      .then(r => r.json())
      .then(j => { if (j.success) setTemplate(j.garage) })
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const record: GarageRecord = {
        date,
        opening_backlog: openingBacklog,
        received_today: receivedToday,
        completed_today: completedToday,
        closing_backlog: closingBacklog,
        backlog_change: backlogChange,
        status: { waiting_queue: waitingQueue, in_repair: inRepair, waiting_parts: waitingParts, waiting_qc: waitingQc, on_hold: onHold },
        overdue_count: overdueCount,
        next_day: { target_complete: targetComplete, urgent_close: urgentClose, urgent_parts: urgentParts, team_reallocation: teamReallocation, support_needed: supportNeeded },
      }
      await fetch("/api/repair-daily/garage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) })
      const text = renderTemplate(template, garageToTemplateVars(record))
      setLineText(text)
      setIsEdit(true)
    } finally {
      setSaving(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(lineText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">สรุปงานอู่ใน</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {isEdit ? "แก้ไขรายการที่มีอยู่" : "บันทึกรายการใหม่"}
          </p>
        </div>
        <div>
          <label className={LABEL_CLS}>วันที่</label>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setLineText("") }}
            className={INPUT_CLS + " w-44"}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🔷 สรุปงานอู่ใน</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="คงค้างอู่ในต้นวัน (คัน)" value={openingBacklog} onChange={setOpeningBacklog} />
          <NumInput label="รับเข้าอู่ในวันนี้ (คัน)" value={receivedToday} onChange={setReceivedToday} />
          <NumInput label="ซ่อมเสร็จส่งมอบวันนี้ (คัน)" value={completedToday} onChange={setCompletedToday} />
          <div>
            <label className={LABEL_CLS}>คงค้างอู่ในสิ้นวัน (AUTO)</label>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {closingBacklog} คัน {backlogChange !== 0 && <span className={backlogChange < 0 ? "text-green-600" : "text-red-500"}>({backlogChange > 0 ? "+" : ""}{backlogChange})</span>}
            </div>
          </div>
        </div>
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🔧 สถานะรถคงค้างอู่ใน</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="รอขึ้นซ่อม (คัน)" value={waitingQueue} onChange={setWaitingQueue} />
          <NumInput label="กำลังซ่อม (คัน)" value={inRepair} onChange={setInRepair} />
          <NumInput label="รออะไหล่ (คัน)" value={waitingParts} onChange={setWaitingParts} />
          <NumInput label="รอ QC / รอส่งมอบ (คัน)" value={waitingQc} onChange={setWaitingQc} />
          <NumInput label="ชะลอซ่อม (คัน)" value={onHold} onChange={setOnHold} />
        </div>
        {statusSum !== closingBacklog && closingBacklog > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠️ ผลรวมสถานะ ({statusSum}) ≠ คงค้างสิ้นวัน ({closingBacklog})</p>
        )}
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">⏰ เกินกำหนด & แผนวันถัดไป</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="งานเกินกำหนดอู่ใน (คัน)" value={overdueCount} onChange={setOverdueCount} />
          <NumInput label="เป้าซ่อมเสร็จส่งมอบ (คัน)" value={targetComplete} onChange={setTargetComplete} />
          <NumInput label="งานที่ต้องเร่งปิด (คัน)" value={urgentClose} onChange={setUrgentClose} />
          <NumInput label="งานที่ต้องเร่งอะไหล่ (คัน)" value={urgentParts} onChange={setUrgentParts} />
          <NumInput label="งานที่ต้องจัดช่าง/โยกทีม (คัน)" value={teamReallocation} onChange={setTeamReallocation} />
        </div>
        <div className="mt-4">
          <label className={LABEL_CLS}>เรื่องที่ต้องขอ Support</label>
          <textarea
            value={supportNeeded}
            onChange={e => setSupportNeeded(e.target.value)}
            rows={2}
            className={INPUT_CLS}
            placeholder="………………………………………"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
      >
        <Save size={15} />
        {saving ? "กำลังบันทึก..." : "บันทึก & สร้าง LINE Text"}
      </button>

      {lineText && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">LINE Text พร้อมคัดลอก</p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-emerald-900/30 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
            >
              {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
              {copied ? "คัดลอกแล้ว!" : "คัดลอก"}
            </button>
          </div>
          <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{lineText}</pre>
        </div>
      )}
    </div>
  )
}

export default function GaragePage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">กำลังโหลด...</div>}>
      <GarageFormInner />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Test in browser**

```bash
npm run dev
```
Open `http://localhost:3000/repair-daily/garage`

Check: same checklist as VS form — all fields render, auto-calculate works, status sum warning shows, save + LINE preview works.

- [ ] **Step 4: Commit**

```bash
git add app/repair-daily/garage/page.tsx
git commit -m "feat: add garage daily repair form page"
```

---

## Task 5: History Page

**Files:**
- Create: `app/repair-daily/history/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/repair-daily/vs?from=YYYY-MM-DD&to=YYYY-MM-DD` → `VSRecord[]`
  - `GET /api/repair-daily/garage?from=YYYY-MM-DD&to=YYYY-MM-DD` → `GarageRecord[]`
  - `GET /api/repair-daily/templates` → `{ vs: string, garage: string }`
  - `vsToTemplateVars()`, `garageToTemplateVars()`, `renderTemplate()`, `toThaiDate()` from `@/lib/repair-daily`
  - `LineChart`, `Line`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer` from `recharts`
- Produces: navigates to `/repair-daily/vs?date=YYYY-MM-DD` or `/repair-daily/garage?date=YYYY-MM-DD` on edit click

- [ ] **Step 1: Create `app/repair-daily/history/page.tsx`**

```typescript
// app/repair-daily/history/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Edit2, Copy, CheckCircle } from "lucide-react"
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { vsToTemplateVars, garageToTemplateVars, renderTemplate, toThaiDate } from "@/lib/repair-daily"
import type { VSRecord, GarageRecord } from "@/lib/repair-daily"

function monthRange(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const last = new Date(y, d.getMonth() + 1, 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${last}`, label: `${m}/${y}` }
}

export default function HistoryPage() {
  const router = useRouter()
  const [tab, setTab] = useState<"vs" | "garage">("vs")
  const [monthOffset, setMonthOffset] = useState(0)
  const [vsData, setVsData] = useState<VSRecord[]>([])
  const [garageData, setGarageData] = useState<GarageRecord[]>([])
  const [templates, setTemplates] = useState({ vs: "", garage: "" })
  const [copiedDate, setCopiedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const range = monthRange(monthOffset)

  useEffect(() => {
    fetch("/api/repair-daily/templates")
      .then(r => r.json())
      .then(j => { if (j.success) setTemplates({ vs: j.vs, garage: j.garage }) })
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/repair-daily/vs?from=${range.from}&to=${range.to}`).then(r => r.json()),
      fetch(`/api/repair-daily/garage?from=${range.from}&to=${range.to}`).then(r => r.json()),
    ]).then(([vs, garage]) => {
      if (vs.success) setVsData([...vs.data].sort((a: VSRecord, b: VSRecord) => a.date.localeCompare(b.date)))
      if (garage.success) setGarageData([...garage.data].sort((a: GarageRecord, b: GarageRecord) => a.date.localeCompare(b.date)))
    }).finally(() => setLoading(false))
  }, [range.from, range.to])

  function copyLine(record: VSRecord | GarageRecord, type: "vs" | "garage") {
    const vars = type === "vs" ? vsToTemplateVars(record as VSRecord) : garageToTemplateVars(record as GarageRecord)
    const text = renderTemplate(type === "vs" ? templates.vs : templates.garage, vars)
    navigator.clipboard.writeText(text)
    setCopiedDate(record.date)
    setTimeout(() => setCopiedDate(null), 2000)
  }

  const chartData = tab === "vs"
    ? vsData.map(r => ({ label: toThaiDate(r.date).slice(0, 5), closing_backlog: r.closing_backlog, completed_today: r.completed_today }))
    : garageData.map(r => ({ label: toThaiDate(r.date).slice(0, 5), closing_backlog: r.closing_backlog, completed_today: r.completed_today }))

  const TAB_ACTIVE = "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
  const TAB_IDLE = "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-white"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">ประวัติรายงานซ่อม</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthOffset(o => o - 1)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors">‹</button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 text-center">{range.label}</span>
          <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors disabled:opacity-40" disabled={monthOffset >= 0}>›</button>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/3 p-1 w-fit">
        {(["vs", "garage"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? TAB_ACTIVE : TAB_IDLE}`}>
            {t === "vs" ? "VS (ภาพรวม)" : "อู่ใน"}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}

      {chartData.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">📈 คงค้างสิ้นวัน (Backlog Trend)</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="closing_backlog" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} name="คงค้าง" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">📊 ซ่อมเสร็จต่อวัน</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="completed_today" fill="#059669" radius={[4, 4, 0, 0]} name="เสร็จ" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/8">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">วันที่</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ต้นวัน</th>
              {tab === "vs" ? (
                <>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">รับใหม่</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">เสร็จ</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">สิ้นวัน</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">อู่ใน</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">อู่นอก</th>
                </>
              ) : (
                <>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">รับเข้า</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">เสร็จ</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">สิ้นวัน</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">เกินกำหนด</th>
                </>
              )}
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(tab === "vs" ? vsData : garageData).length === 0 && !loading && (
              <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">ไม่มีข้อมูลในเดือนนี้</td></tr>
            )}
            {tab === "vs" && [...vsData].reverse().map(r => (
              <tr key={r.date} className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">{toThaiDate(r.date)}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.opening_backlog}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.new_repairs}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.completed_today}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{r.closing_backlog}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.garage_in_count}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.garage_out_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => router.push(`/repair-daily/vs?date=${r.date}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors" title="แก้ไข"><Edit2 size={13} /></button>
                    <button onClick={() => copyLine(r, "vs")} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors" title="คัดลอก LINE">
                      {copiedDate === r.date ? <CheckCircle size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tab === "garage" && [...garageData].reverse().map(r => (
              <tr key={r.date} className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">{toThaiDate(r.date)}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.opening_backlog}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.received_today}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.completed_today}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{r.closing_backlog}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.overdue_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => router.push(`/repair-daily/garage?date=${r.date}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors" title="แก้ไข"><Edit2 size={13} /></button>
                    <button onClick={() => copyLine(r, "garage")} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors" title="คัดลอก LINE">
                      {copiedDate === r.date ? <CheckCircle size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Test in browser**

```bash
npm run dev
```
Open `http://localhost:3000/repair-daily/history`

Check:
- Tab toggle between VS and Garage works
- Month navigation (‹ ›) changes the date range and re-fetches
- If data exists: charts render, table shows rows
- Edit button navigates to the form with `?date=` param pre-filled
- Copy button puts LINE text in clipboard (check with Ctrl+V in a text editor)
- "ไม่มีข้อมูลในเดือนนี้" shows when no records exist

- [ ] **Step 4: Commit**

```bash
git add app/repair-daily/history/page.tsx
git commit -m "feat: add repair history page with trend charts and edit/copy actions"
```

---

## Task 6: Template Settings Page

**Files:**
- Create: `app/repair-daily/settings/page.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/repair-daily/templates` → `{ vs: string, garage: string }`
  - `POST /api/repair-daily/templates` body `{ type, template_text }`
  - `renderTemplate()` from `@/lib/repair-daily`

- [ ] **Step 1: Create `app/repair-daily/settings/page.tsx`**

```typescript
// app/repair-daily/settings/page.tsx
"use client"

import { useEffect, useState } from "react"
import { Save, CheckCircle } from "lucide-react"
import { renderTemplate } from "@/lib/repair-daily"

const PREVIEW_VARS: Record<string, string> = {
  date_thai: "25/6/2569",
  opening_backlog: "69", new_repairs: "9", completed_today: "16",
  closing_backlog: "62", backlog_change: "-7", backlog_change_abs: "7",
  completed_in: "2", completed_out: "14",
  garage_in_count: "27", garage_out_count: "35",
  waiting_assessment: "9", waiting_approval: "4", waiting_parts: "6",
  in_progress: "16", out_completed: "14", vs_followup_count: "7",
  notes: "",
  received_today: "5", waiting_queue: "3", in_repair: "10",
  waiting_qc: "4", on_hold: "2", overdue_count: "3",
  target_complete: "5", urgent_close: "2", urgent_parts: "3",
  team_reallocation: "1", support_needed: "ขออะไหล่เพิ่มเติม",
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"vs" | "garage">("vs")
  const [vsTemplate, setVsTemplate] = useState("")
  const [garageTemplate, setGarageTemplate] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/repair-daily/templates")
      .then(r => r.json())
      .then(j => { if (j.success) { setVsTemplate(j.vs); setGarageTemplate(j.garage) } })
  }, [])

  const current = tab === "vs" ? vsTemplate : garageTemplate
  const preview = renderTemplate(current, PREVIEW_VARS)

  async function handleSave() {
    setSaving(true)
    try {
      await fetch("/api/repair-daily/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tab, template_text: current }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const TAB_ACTIVE = "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
  const TAB_IDLE = "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-white"

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">ตั้งค่า LINE Template</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">แก้ไข template โดยใช้ <code className="bg-gray-100 dark:bg-white/10 px-1 rounded text-xs">{"{{variable}}"}</code> แทนค่าตัวเลข</p>
      </div>

      <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/3 p-1 w-fit">
        {(["vs", "garage"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? TAB_ACTIVE : TAB_IDLE}`}>
            {t === "vs" ? "VS (ภาพรวม)" : "อู่ใน"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Template Editor</p>
          <textarea
            value={current}
            onChange={e => tab === "vs" ? setVsTemplate(e.target.value) : setGarageTemplate(e.target.value)}
            rows={28}
            className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {saved ? <CheckCircle size={15} /> : <Save size={15} />}
            {saved ? "บันทึกแล้ว!" : saving ? "กำลังบันทึก..." : "บันทึก Template"}
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Preview (ข้อมูลตัวอย่าง)</p>
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-4 min-h-[420px]">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{preview}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Test in browser**

```bash
npm run dev
```
Open `http://localhost:3000/repair-daily/settings`

Check:
- Both templates load from API
- Editing textarea instantly updates the preview on the right
- Save button persists the template (verify by refreshing the page — template should still be the edited version)
- Tab switches between VS and Garage templates independently

- [ ] **Step 4: Commit**

```bash
git add app/repair-daily/settings/page.tsx
git commit -m "feat: add LINE template editor with live preview"
```

---

## Task 7: Sidebar Integration

**Files:**
- Modify: `components/sidebar.tsx:65-113` (the `NAV_GROUPS` array)

**Interfaces:**
- Consumes: `Wrench` icon from `lucide-react` (add to existing import)

- [ ] **Step 1: Add Wrench to the lucide-react import in `components/sidebar.tsx`**

Find the existing import line (line 7):
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
} from "lucide-react"
```

Replace with:
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
} from "lucide-react"
```

- [ ] **Step 2: Add "Maintenance" group to `NAV_GROUPS` in `components/sidebar.tsx`**

Find the end of the `NAV_GROUPS` array (after the "Procurement" group, before the closing `]`):

```typescript
  {
    label: "Procurement",
    items: [
      { href: "/procurement-search",      label: "Procurement Search", icon: Search },
      { href: "/stock-budget-ladkrabang", label: "Stock Budget",       icon: PackageSearch },
      { href: "/price-benchmark",         label: "Price Benchmark",    icon: TrendingUp },
      { href: "/supplier-analysis",       label: "Supplier Analysis",  icon: Users },
    ],
  },
]
```

Replace with:
```typescript
  {
    label: "Procurement",
    items: [
      { href: "/procurement-search",      label: "Procurement Search", icon: Search },
      { href: "/stock-budget-ladkrabang", label: "Stock Budget",       icon: PackageSearch },
      { href: "/price-benchmark",         label: "Price Benchmark",    icon: TrendingUp },
      { href: "/supplier-analysis",       label: "Supplier Analysis",  icon: Users },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { href: "/repair-daily/vs",       label: "Daily Log (VS)",    icon: Wrench },
      { href: "/repair-daily/garage",   label: "Daily Log (Garage)", icon: Wrench },
      { href: "/repair-daily/history",  label: "Report History",     icon: History },
      { href: "/repair-daily/settings", label: "Templates",          icon: Settings2 },
    ],
  },
]
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Test in browser**

```bash
npm run dev
```
Open `http://localhost:3000`

Check:
- Sidebar shows "Maintenance" group at the bottom
- All 4 nav items are visible and clickable
- Active state highlights correctly when on each page
- Collapsed sidebar shows icon-only mode for Maintenance items

- [ ] **Step 5: Final end-to-end test**

1. Navigate to `/repair-daily/vs` → enter numbers → save → see LINE text → copy
2. Navigate to `/repair-daily/garage` → enter numbers → save → copy LINE text
3. Navigate to `/repair-daily/history` → verify both records appear in table and charts
4. Click Edit on a history row → verify form loads with pre-filled values
5. Navigate to `/repair-daily/settings` → edit VS template → save → return to VS form → save → verify new template used in LINE output

- [ ] **Step 6: Commit**

```bash
git add components/sidebar.tsx
git commit -m "feat: add Maintenance nav group to sidebar for repair daily log"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ VS daily form with all fields from template
- ✅ Garage daily form with all fields from template
- ✅ Auto-calculated closing_backlog and backlog_change
- ✅ Validation warning when status totals mismatch
- ✅ Save + LINE text generation with copy button
- ✅ Load existing record when date selected (edit mode)
- ✅ History page with VS/Garage tabs
- ✅ Backlog trend line chart
- ✅ Daily completions bar chart
- ✅ Edit button navigates to form with ?date= param
- ✅ Copy LINE button in history table
- ✅ Template editor with live preview
- ✅ Templates seeded from defaults on first GET
- ✅ MongoDB upsert by date (no duplicates)
- ✅ Sidebar "Maintenance" group with 4 items
- ✅ Month navigation in history page
