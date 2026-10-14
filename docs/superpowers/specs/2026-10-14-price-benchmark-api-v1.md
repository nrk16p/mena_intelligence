# Price Benchmark Public API v1

สถานะ: **สร้างแล้ว 2026-10-14** (แทนเอกสารดีไซน์ 2026-10-05 ที่หายไปจาก Desktop)

## ทำไมต้องมี

`mena-wms` (`app/api/pr/items/route.ts`) อ่าน `atms.price_benchmark` จาก Mongo ตรง ๆ แล้วคิด
weighted median เอง — ได้แค่ตัวเลขดิบ ไม่มีราคาสัญญา ไม่มี fallback และถ้านิยามราคากลางเปลี่ยน
ต้องไล่แก้ทุก repo. API นี้ทำให้มี **แหล่งเดียว** ที่รู้นิยาม

## สิ่งที่แชร์ออกไป

**เฉพาะ price-benchmark เท่านั้น** — API อื่นในแอปนี้ยังเป็นของภายใน

| | |
|---|---|
| `POST /api/v1/price-benchmark/batch` | ราคากลางหลายรหัสในครั้งเดียว |
| `GET /api/v1/price-benchmark/openapi.json` | spec (gen จาก zod) |
| `GET /api/v1/price-benchmark/docs` | หน้าเอกสาร Scalar ลองยิงได้ |

## การตัดสินใจ

- **สัญญาเขียนที่เดียว** — `lib/api/price-benchmark-v1.schema.ts` (zod) ใช้ทั้ง validate request,
  gen OpenAPI และหน้าเอกสาร · แก้ field ที่เดียว เอกสารเปลี่ยนตาม ไม่มีทางหลุดจากโค้ด
- **ไม่มี API key** (ผู้ใช้สั่ง 2026-10-14) — endpoint เปิดเหมือน `/api/price-benchmark/*` เดิม
  เปิด auth ทีหลังได้โดยเติมในฟังก์ชัน `requireApiKey()` ใน route เท่านั้น ไม่ต้องแก้ที่อื่น
- **อ่านอย่างเดียว ไม่เรียก `ensureSnapshot`** — กันคนนอกจุด aggregation รายเดือนที่หนัก
  เดือนที่ยังไม่มี snapshot = ไม่ถูกเลือก
- **ไม่ตัดสินแพง/ไม่แพง** — ส่งตัวเลขกับ `recommendation` ไปให้ ปลายทางตั้งเกณฑ์เอง
- **default month ถูก cap ที่เดือนปัจจุบัน** — collection มี snapshot ของเดือนอนาคต (2026-11, 2026-12)
  จากการที่ month picker ในหน้าเว็บ gen แบบ lazy ถ้าไม่ cap มันจะกลายเป็นคำตอบ default
- **ชื่อฟิลด์เป็นอังกฤษ** ทั้งหมด (ข้างในเป็นคีย์ไทย)
- **`logic อยู่ใน lib/api/price-benchmark-v1.ts` แบบ pure** ไม่มี I/O → unit test ได้ และลอกสูตรจาก
  `RecommendationCard` / `aggregateProduct` ใน `app/price-benchmark/page.tsx` ตรง ๆ ให้ตัวเลขตรงหน้าเว็บ

## ตัวเลขที่ส่งกลับ ต่อรหัสสินค้า

| ฟิลด์ | นิยาม |
|---|---|
| `benchmark_price` | ราคากลางรวมทุกซัพ = ฐานนิยมของ price point ทั้งหมดรวมกัน (เสมอ → ต่ำกว่าชนะ) |
| `mid_price` | มัธยฐานของราคากลางรายซัพ ถ่วงด้วย `total_records` — ตัวที่ wms คิดเองอยู่เดิม |
| `min/max_price_trimmed` | ตัด outlier ด้วย IQR ถ่วงน้ำหนักแล้ว |
| `suppliers[]` | เรียงถูก→แพง มีราคาสัญญาที่มีผลในเดือนนั้นแปะมาด้วย |
| `recommendation` | ราคากลางของเจ้าถูกสุด (เสมอ → เจ้าที่ซื้อบ่อยกว่า) + `overpaid_vs_cheapest` + ธง `thin_data` (<3 ครั้ง) / `stale` (>6 เดือน) |
| `source` | `snapshot` = 12 เดือน · `fallback` = ไม่มีการรับเข้าใน 12 เดือน จึงคำนวณสดย้อนหลังทั้งหมด |

## ขอบเขต / กับดัก

- สูงสุด **200 รหัส**ต่อครั้ง · fallback (คำนวณสด) สูงสุด **20 รหัส**ต่อครั้ง เกินนั้นตอบ
  `found:false, reason:"fallback_limit"` ให้ยิงแยก — แต่ละตัวคือ aggregation ของตัวเอง
- จับคู่รหัสสินค้าและชื่อซัพแบบ **ตรงตัว** (ฝั่ง fallback ใช้ regex หา แล้วกรองให้เหลือ exact)
- กลุ่ม **น้ำมันเชื้อเพลิง** ถูกตัดทั้งระบบ (ราคาตลาด ฐานนิยมไม่มีความหมาย) — กรองที่ read path ด้วย
  เพราะ snapshot เก่ายังมีแถวน้ำมันค้างอยู่
- ราคากลาง **pooled ทั้งบริษัท ไม่แยกคลัง** (ตามนิยามเดิมของระบบ)
- ราคาทุนใช้ตามที่ ATMS บันทึก = **ราคาต่อหน่วยก่อน VAT** (ข้อสมมติ ยังไม่ยืนยันกับฝ่ายบัญชี)

## ฝั่งคนเรียก

`lib/api/price-benchmark-client.ts` — ไฟล์เดียว ไม่มี dependency ก๊อปไปวางใน repo ไหนก็ได้
ตั้ง `PRICE_BENCHMARK_API_URL` ถ้าไม่ใช่ prod

```ts
const pb = createPriceBenchmarkClient()
const { items } = await pb.batch({ codes: ["LB13OT00128"] })
```

## ตรวจแล้ว

- unit test 22 ข้อ (`lib/api/price-benchmark-v1.test.ts`) — สูตร mode / weighted median / overpaid / ธง / schema
- เทียบกับ `/api/price-benchmark/lookup` เดือน 2026-10 รหัส LB10PM00097: ซัพ 21 ราย,
  เจ้าถูกสุด 19.67, จ่ายเกิน 750,590.16, มูลค่ารวม 990,728.03 — **ตรงกันทุกตัว**

## ยังไม่ได้ทำ

- ยังไม่แก้ `mena-wms` ให้เลิกอ่าน Mongo ตรงแล้วมายิง API นี้แทน
- ยังไม่มี cron gen snapshot ต้นเดือน (ตอนนี้พึ่ง lazy gen จากหน้าเว็บ)
