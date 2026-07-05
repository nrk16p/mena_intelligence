# ระบบราคากลาง (Price Benchmark) สำหรับทีมจัดซื้อ — Design

**Date:** 2026-07-05
**Status:** Approved (user delegated approval — proceed with Approach A)
**Route:** `/price-benchmark` (rebuild ทั้งหมด แทนหน้าเดิม)

## 1. Business Requirements

| หัวข้อ | ข้อสรุป |
|---|---|
| ผู้ใช้ | ทีมจัดซื้อ (group `procurement`) |
| Use case 1 | เช็คราคากลางก่อนสั่งซื้อ / ใช้ต่อรองราคา supplier |
| Use case 2 | ตรวจจับรายการซื้อจริงที่ราคาแพงกว่าราคากลาง |
| นิยามราคากลาง | **Mode** (ราคาที่พบบ่อยสุด) ต่อ `รหัสสินค้า × ซัพพลายเออร์` |
| ช่วงข้อมูล | Rolling 12 เดือนย้อนหลัง (นับรวมเดือน snapshot) |
| การเก็บค่า | Snapshot รายเดือน เก็บใน collection `price_benchmark` |
| เกณฑ์ flag | ราคาทุน > ราคากลาง นับทันที (ไม่มี tolerance) |
| การแสดงผล | จำนวนครั้งของแต่ละราคา เรียง min → max แสดงเป็น ranking |
| Design system | PropertyVue (designmd.ai) — blue #2563EB primary, green #16A34A สำหรับราคา, Red Hat Display + DM Sans + Fira Code |

## 2. Data Source & Rules

- Source: `atms.stockmovement_v5` (435k rows; 12-month window ≈ 45.7k receipts, ≈ 13k product×supplier pairs)
- Receipt filter (ตาม convention เดิมของ benchmark-v2): `รับ > 0`, `WD ∈ [null, ""]`, `รหัสสินค้า` ไม่ว่าง
- `ซัพพลายเออร์` ว่าง/null → normalize เป็น `"ไม่ระบุ"`
- ราคา = `ราคาทุน` (unit cost), มูลค่า = `ยอดเงิน`, จำนวน = `รับ`
- **Mode tie-break:** ถ้าหลายราคามี count เท่ากัน เลือก **ราคาต่ำกว่า** (เป็น anchor ที่ดีกว่าสำหรับการต่อรอง)
- ราคากลางคำนวณเมื่อมีข้อมูล ≥ 1 ครั้ง; UI แสดงจำนวนครั้งกำกับเสมอเพื่อให้ผู้ใช้เห็นความน่าเชื่อถือ (n น้อย = เชื่อถือต่ำ)

## 3. Storage: collection `price_benchmark`

หนึ่ง document ต่อ `snapshot_month × รหัสสินค้า × ซัพพลายเออร์`:

```js
{
  snapshot_month: "2026-07",          // เดือนที่ประกาศใช้
  window_start: "2025-08",            // ช่วงข้อมูลที่ใช้คำนวณ
  window_end:   "2026-07",
  รหัสสินค้า: "LB00090",
  ชื่อสินค้า: "...", กลุ่มสินค้า: "...",
  ซัพพลายเออร์: "...",                 // "ไม่ระบุ" ถ้าว่าง
  benchmark_price: 123.5,             // mode
  benchmark_count: 14,                // จำนวนครั้งของ mode
  benchmark_pct: 63.6,                // % ของ receipts ทั้งหมดของคู่นี้
  min_price: 100, max_price: 150,
  total_records: 22, total_qty: 40, total_cost: 5060,
  first_date: "2025-09", last_date: "2026-06",
  prices: [ { price, count, qty, cost, pct } ],  // เรียง price น้อย→มาก (min→max ranking)
  computed_at: ISODate
}
```

Indexes: `{snapshot_month:1, รหัสสินค้า:1, ซัพพลายเออร์:1}` (unique), `{snapshot_month:1, กลุ่มสินค้า:1}`

**Snapshot lifecycle (lazy + refresh):**
- GET lookup เดือนใด ถ้ายังไม่มีเอกสารของ `snapshot_month` นั้น → generate อัตโนมัติครั้งแรก (ทั้งเดือน, ~13k docs, insertMany เป็น batch)
- `POST /api/price-benchmark/snapshot { month }` → ลบของเดือนนั้นแล้วคำนวณใหม่ (ปุ่ม "คำนวณใหม่" ใน UI)
- ไม่ต้องใช้ cron — เดือนใหม่ถูกสร้างเมื่อถูกเรียกครั้งแรก; เดือนเก่า freeze ไว้เป็นประวัติอ้างอิง

## 4. API (namespace ใหม่ `/api/price-benchmark/`)

1. **`GET /api/price-benchmark/lookup?month&product_code&supplier&group`**
   - ensure snapshot ของ `month` มีอยู่ (lazy generate)
   - คืนรายการ snapshot ที่ match (product_code: regex escape, case-insensitive; supplier: substring match; group: exact) — จำกัด ~50 product codes ต่อครั้ง เรียงตาม total_cost desc
   - รูปแบบ: จัดกลุ่มเป็น per-product → per-supplier rows + overall aggregate (รวมทุก supplier)
2. **`POST /api/price-benchmark/snapshot`** body `{ month, force? }`
   - สร้าง/สร้างใหม่ snapshot ทั้งเดือน; คืน `{ generated, row_count, ms }`
3. **`GET /api/price-benchmark/overpriced?month&product_code&supplier&group&warehouse`**
   - ดึง receipts จริงของเดือน `month` (filter เดียวกับ §2) → join กับ snapshot ของเดือนเดียวกันด้วย key `รหัสสินค้า×ซัพพลายเออร์`
   - flag แถวที่ `ราคาทุน > benchmark_price`
   - คืน 2 ระดับ: `summary` (จำนวนรายการ flag, มูลค่าส่วนเกินรวม Σ((ราคา−benchmark)×รับ), จำนวนสินค้า, จำนวน supplier) และ `rows` รายการ transaction (PO/PR, วันที่, คลัง, ราคาซื้อ, ราคากลาง, ส่วนต่าง฿/%, qty, มูลค่าส่วนเกิน) เรียงมูลค่าส่วนเกิน desc, limit 500
   - กรณีคู่ product×supplier ไม่มี benchmark (ไม่เคยซื้อใน 12 เดือนก่อน) → ไม่ flag แต่ นับแยกเป็น `no_benchmark_count` ให้เห็น

Error convention เดิมของ repo: `{ success, data | error }`, log ด้วย `console.error`.

## 5. UI — `/price-benchmark` (rebuild, PropertyVue)

โครงหน้า: header + 2 tab (persistent filter bar ตาม Do #4 ของ PropertyVue)

**Tab 1 — ค้นหาราคากลาง (lookup ก่อนออก PO)**
- Filters: เดือน snapshot (default เดือนปัจจุบัน), รหัสสินค้า, ซัพพลายเออร์, กลุ่มสินค้า
- Product card (PropertyVue card): header = รหัส (Fira Code) + ชื่อสินค้า + chip กลุ่มสินค้า
- ภายใน: section "ภาพรวมทุกซัพพลายเออร์" + section ต่อ supplier (เรียง total_cost desc พร้อมอันดับ)
- แต่ละ section: **ราคากลางตัวใหญ่สีเขียว #16A34A** (price semantics) + badge `n ครั้ง (xx%)` + meta (ช่วงข้อมูล, มูลค่ารวม)
- **Ranking table ราคา min→max**: ทุกราคาที่เคยซื้อ เรียงน้อย→มาก, คอลัมน์ = อันดับ, ราคา, จำนวนครั้ง (พร้อม bar เทียบสัดส่วน), %, จำนวนชิ้น; แถว mode ไฮไลต์น้ำเงิน; แถวที่แพงกว่าราคากลาง ติด chip แดง "สูงกว่าราคากลาง"
- Supplier filter chips (PropertyVue filter chip) เมื่อผลลัพธ์มีหลาย supplier
- Skeleton loader ระหว่างโหลด (Do #6)

**Tab 2 — รายการซื้อแพงกว่าราคากลาง (variance report)**
- Filters: เดือนที่ตรวจ (default เดือนปัจจุบัน), รหัสสินค้า, ซัพพลายเออร์, กลุ่มสินค้า
- Summary tiles: รายการที่แพงกว่า, มูลค่าส่วนเกินรวม (฿ แดง), สินค้าที่โดน flag, รายการไม่มีราคากลาง
- ตาราง ranking เรียงมูลค่าส่วนเกิน desc: วันที่, PO, รหัส/ชื่อสินค้า, supplier, คลัง, ราคาซื้อ, ราคากลาง, ส่วนต่าง (฿ / % chip แดง), จำนวน, ส่วนเกินรวม
- ปุ่ม "คำนวณราคากลางใหม่" (POST snapshot force) ใน header ของ tab 1 + แสดง computed_at

**Fonts:** โหลด Red Hat Display / DM Sans / Fira Code ผ่าน Google Fonts `<link>` ใน `app/price-benchmark/layout.tsx` (scope เฉพาะหน้านี้ ไม่กระทบ global) และใช้ inline font-family บน container

**Auth:** คง layout.tsx เดิม (session + group `procurement`)

## 6. Error handling & edge cases

- เดือนที่ไม่มี receipts เลย → snapshot ว่าง, UI แสดง empty state (ไม่ error)
- product×supplier ที่ mode มี count = 1 (ซื้อครั้งเดียว) → benchmark ใช้ได้แต่ badge เตือน "ข้อมูลน้อย" เมื่อ total_records < 3
- Generate ซ้อนกัน (2 requests พร้อมกันตอนยังไม่มี snapshot) → ใช้ unique index + `ordered:false` insert เพื่อกัน duplicate, catch duplicate error แล้วอ่านต่อ
- Regex injection → escape user input (pattern เดิมจาก benchmark-v2)

## 7. Testing

- API: curl ทั้ง 3 endpoints กับข้อมูลจริง (snapshot generate, lookup product ที่รู้จัก, overpriced เดือนปัจจุบัน) ตรวจตัวเลข mode กับ query ตรงจาก mongo
- UI: `npx tsc --noEmit` + โหลดหน้าใน dev server ตรวจ render
- Snapshot idempotency: เรียก lookup ซ้ำ → ไม่ generate ซ้ำ (row count คงเดิม)

## 8. Out of scope (YAGNI — เผื่ออนาคต)

- Approval workflow / manual override ราคากลาง (แนวทาง C)
- Export Excel/PNG, แจ้งเตือนอัตโนมัติ (LINE/email)
- ราคากลางระดับกลุ่มสินค้า หรือเทียบข้าม supplier อัตโนมัติ
