# PM Mapping — Design (Phase 1 built, Phase 2 pending)

Date: 2026-07-03

## Goal
Items withdrawn under purposes `PM ความเเย็น`, `PM น้ำมันเครื่อง`, `PM ช่วงล่าง` (in
`datawarehouse.dw_stockmovement`) must be classified into **PM1 / PM2 / PM3** by the
ops team, then reported like `/cost` but grouped by PM class.

Note: the DB purpose value is `PM ความเเย็น` (สระเอ ×2). The existing `/cost`
`COST_GROUP_MAP` uses `PM ความเย็น` (สระเอ ×1) — that purpose therefore falls into
"Other" on `/cost` today. Known issue, out of scope here.

## Phase 1 — mapping page (DONE)
- **Storage**: `datawarehouse.pm_item_mapping`, one doc per รหัสสินค้า
  (unique index): `{ รหัสสินค้า, ชื่อสินค้า, กลุ่มสินค้า, pm_class: "PM1"|"PM2"|"PM3"|null, updated_by, updated_at }`
- **API**: `app/api/pm-mapping/route.ts`
  - `GET` — distinct item codes (681) under the 3 PM purposes, with total_cost /
    records, `$lookup` joined to current mapping. Requires login + `ops` group.
  - `POST { items: [{ รหัสสินค้า, ชื่อสินค้า, กลุ่มสินค้า, pm_class }] }` — batch
    upsert; `pm_class: null` clears. Stamps session email as `updated_by`.
- **Page**: `/pm-mapping` (`ops` permission, same guard as `/cost`)
  - Items grouped by กลุ่มสินค้า, collapsible, sorted by group cost desc.
  - Per-row PM1/PM2/PM3 toggle buttons (click active one to clear).
  - Bulk-assign per กลุ่มสินค้า header + "ล้าง".
  - Search, "unmapped only" filter, progress bar, PM1/PM2/PM3 KPI tiles.
  - Edits staged locally (amber highlight), saved in one batch via บันทึก.
- Sidebar: "PM Mapping" under Ops group.

## Phase 2 — PM cost page (DONE 2026-07-03)
`/pm-cost` page similar to `/cost`:
- **API**: `app/api/pm-cost/route.ts` — GET start/end (YYYY-MM); matches the 3 PM
  purposes, groups month × รหัสสินค้า × คลังสินค้า × partner_flag,
  `$lookup pm_item_mapping` → each row carries pm_class (null = unmapped).
  Login + `ops` required.
- **Page**: month-range picker (fetches current + previous year), client-side
  คลังสินค้า / partner_flag chip filters, KPI row (curr/prev/YoY/unmapped),
  PM class YoY tiles, monthly stacked bar chart by PM class with prev-year
  dashed line, and an expandable breakdown table
  PM class → กลุ่มสินค้า → รหัสสินค้า with per-month columns + YoY.
- Sidebar: "PM Cost" under Ops.

## Seeded mapping (2026-07-03)
All 681 items pre-filled with `updated_by: "ai-suggestion"` (PM1: 310, PM2: 226,
PM3: 145) using industry PM-A/B/C tiers: PM1 = oil service groups
(บำรุงรักษา/ค่าแรง/วัสดุสิ้นเปลือง), PM2 = เครื่องยนต์/แอร์-ไฟ/เบรค-คลัทช์,
PM3 = ช่วงล่าง/หาง/หัวเก๋ง/อุปกรณ์. Item-name overrides: เกียร์/เฟืองท้าย/หม้อน้ำ
→ PM3, ไฮดรอลิค → PM2. Ops team can adjust on /pm-mapping (their saves stamp
their email over "ai-suggestion").
