# Repair Daily Log — Design Spec
**Date:** 2026-06-29
**Project:** Mena Intelligence (Next.js on Vercel)
**Feature:** Daily repair report entry + LINE template generator for VS and อู่ใน supervisors

---

## Overview

Add a "Maintenance" sidebar group to Mena Intelligence where two supervisors (VS and อู่ใน) can:
1. Enter daily repair/backlog numbers in a structured form
2. Auto-generate a formatted LINE message to copy-paste into the vehicle manager LINE group
3. View and edit historical records
4. See backlog trend charts

---

## Sidebar Integration

New group added to `components/sidebar.tsx` after the existing "Vehicle" group:

```
Maintenance
  ├── Daily Log (VS)     → /repair-daily/vs
  ├── Daily Log (Garage) → /repair-daily/garage
  └── Report History     → /repair-daily/history

Settings (existing or new)
  └── Report Templates   → /repair-daily/settings
```

Uses existing NextAuth session — no new login required.

---

## Routes

| Route | Page |
|---|---|
| `/repair-daily/vs` | VS supervisor daily form (create + edit) |
| `/repair-daily/garage` | อู่ใน supervisor daily form (create + edit) |
| `/repair-daily/history` | Combined history table + charts |
| `/repair-daily/settings` | LINE template editor |

---

## Data Model

### MongoDB — `atms` database

**Collection: `repair_daily_vs`**

```ts
{
  _id: ObjectId,
  date: string,              // "2026-06-25" (unique key)
  opening_backlog: number,
  new_repairs: number,
  completed_today: number,
  closing_backlog: number,   // auto: opening + new - completed
  backlog_change: number,    // auto: closing - opening
  completed_in: number,      // อู่ในเสร็จ
  completed_out: number,     // อู่นอกเสร็จ
  garage_in_count: number,   // คงค้างอู่ใน
  garage_out_count: number,  // คงค้างอู่นอก
  garage_out_status: {
    waiting_assessment: number,
    waiting_approval: number,
    waiting_parts: number,
    in_progress: number,
    completed: number,
  },
  vs_followup_count: number,
  notes: string,
  created_at: Date,
  updated_at: Date,
}
```

**Collection: `repair_daily_garage`**

```ts
{
  _id: ObjectId,
  date: string,              // "2026-06-25" (unique key)
  opening_backlog: number,
  received_today: number,
  completed_today: number,
  closing_backlog: number,   // auto: opening + received - completed
  backlog_change: number,    // auto: closing - opening
  status: {
    waiting_queue: number,
    in_repair: number,
    waiting_parts: number,
    waiting_qc: number,
    on_hold: number,
  },
  overdue_count: number,
  next_day: {
    target_complete: number,
    urgent_close: number,
    urgent_parts: number,
    team_reallocation: number,
    support_needed: string,
  },
  created_at: Date,
  updated_at: Date,
}
```

**Collection: `repair_daily_templates`**

```ts
{
  _id: ObjectId,
  type: "vs" | "garage",
  template_text: string,   // full LINE template with {{variable}} placeholders
  updated_at: Date,
}
```

### Auto-calculated fields (client-side)
- `closing_backlog = opening_backlog + new_repairs − completed_today`
- `backlog_change = closing_backlog − opening_backlog`
- Garage status sum must equal `closing_backlog` — show warning if mismatch (not blocking)

---

## Page Designs

### VS Daily Form (`/repair-daily/vs`)

- Date picker at top, defaults to today
- If a record exists for the selected date, form auto-loads that data (edit mode)
- Sections:
  1. **ภาพรวม** — คงค้างต้นวัน, รับใหม่, ซ่อมเสร็จ, คงค้างสิ้นวัน (auto)
  2. **แยกคงค้างสิ้นวัน** — อู่ใน, อู่นอก
  3. **สถานะอู่นอก** — รอประเมิน, รออนุมัติ, รออะไหล่, ระหว่างซ่อม, เสร็จ
  4. **แผนติดตาม** — เร่งติดตาม, อู่ในเสร็จ, อู่นอกเสร็จ
- "บันทึก & สร้าง LINE Text" button — saves record then shows LINE preview with Copy button

### อู่ใน Daily Form (`/repair-daily/garage`)

- Same UX pattern as VS form
- Sections:
  1. **ภาพรวม** — คงค้างต้นวัน, รับเข้า, ซ่อมเสร็จ, คงค้างสิ้นวัน (auto)
  2. **สถานะรถคงค้าง** — รอขึ้นซ่อม, กำลังซ่อม, รออะไหล่, รอ QC, ชะลอซ่อม
  3. **เกินกำหนด** — overdue count
  4. **แผนวันถัดไป** — เป้าเสร็จ, เร่งปิด, เร่งอะไหล่, จัดช่าง, Support needed

### History Page (`/repair-daily/history`)

- Tab toggle: **VS** | **อู่ใน**
- Month picker (default: current month)
- Charts (Recharts):
  - Line chart: backlog trend (closing_backlog over 30 days)
  - Bar chart: daily completions (completed_today per day)
- Data table columns (VS): Date | คงค้างต้นวัน | รับใหม่ | เสร็จ | คงค้างสิ้นวัน | อู่ใน | อู่นอก | Actions
- Data table columns (Garage): Date | คงค้างต้นวัน | รับเข้า | เสร็จ | คงค้างสิ้นวัน | เกินกำหนด | Actions
- Actions per row: **[✏️ Edit]** (navigates to `/repair-daily/vs?date=2026-06-25` — form loads that date's data) | **[📋 Copy LINE]** (generates LINE text inline, no navigation)

### Template Settings (`/repair-daily/settings`)

- Tab: VS template | Garage template
- Left: textarea with full template using `{{variable}}` placeholders (e.g. `{{closing_backlog}}`)
- Right: live preview rendered with today's last saved values
- Save button — upserts to `repair_daily_templates` collection
- Default templates seeded from the original LINE message formats: the GET `/api/repair-daily/templates` route checks if a doc exists for `type: "vs"` / `type: "garage"` — if not, it inserts the default template text and returns it

---

## API Routes

All under `/app/api/repair-daily/`

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/repair-daily/vs` | List VS records (with date range filter) |
| POST | `/api/repair-daily/vs` | Create or update VS record for a date |
| GET | `/api/repair-daily/vs/[date]` | Get single VS record by date |
| GET | `/api/repair-daily/garage` | List Garage records |
| POST | `/api/repair-daily/garage` | Create or update Garage record for a date |
| GET | `/api/repair-daily/garage/[date]` | Get single Garage record by date |
| GET | `/api/repair-daily/templates` | Get both templates |
| POST | `/api/repair-daily/templates` | Save a template |

---

## LINE Template System

Templates stored in MongoDB as plain text with `{{variable}}` placeholders matching field names in the data model. Example VS template snippet:

```
📌 รายงานสรุปการแจ้งซ่อมทั้งหมด โดย VS
ประจำวันที่ {{date_thai}}

🔷 สรุปภาพรวมงานแจ้งซ่อม
🚗 คงค้างต้นวัน : {{opening_backlog}} คัน
📥 รับแจ้งซ่อมใหม่วันนี้ : {{new_repairs}} คัน
✅ ซ่อมเสร็จส่งมอบวันนี้ : {{completed_today}} คัน
📌 คงค้างสิ้นวันรวม: {{closing_backlog}} คัน
...
```

A single `renderTemplate(template, data)` utility function replaces all `{{key}}` tokens. `{{date_thai}}` is a special token that auto-formats the date to Thai Buddhist era (e.g., 25/6/2569).

---

## Tech Stack

- **Framework:** Next.js (App Router) — existing project
- **Database:** MongoDB via existing `MONGODB_URI` env var, `atms` database
- **Charts:** Recharts (already used in project or add as dependency)
- **Auth:** Existing NextAuth session
- **Styling:** Tailwind CSS — match existing component patterns
- **UI components:** Existing `/components/ui/` (shadcn/ui)

---

## Out of Scope

- Auto-pull อู่ใน numbers into VS report (supervisors fill independently)
- Separate logins per supervisor
- Mobile-specific optimizations (web responsive is sufficient)
- Export to PDF or Excel
- Push notifications

---

## Validation Rules

- Date is required; duplicate dates overwrite existing record (upsert)
- All numeric fields default to 0 if left blank
- Garage status sum ≠ closing_backlog → show yellow warning, allow save anyway
- Template save is non-destructive — previous template recoverable via MongoDB if needed
