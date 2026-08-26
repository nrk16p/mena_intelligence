# ทุกคลังสินค้าใน /price-benchmark

วันที่ 2026-08-26

## โจทย์

`/price-benchmark` มีตัวกรองคลังแค่ 4 คลัง ผู้ใช้ต้องการให้ครบทุกคลัง

เพดาน 4 คลังไม่ได้อยู่ที่หน้าเว็บ — อยู่ที่ตัวดึงข้อมูล `INVENTORY_LIST = ["4","3","11","24"]`
ซึ่งฮาร์ดโค้ดอยู่ 3 ไฟล์ ทำให้ `atms.stockmovement_v5` มีแค่ 4 คลังมาตลอด
แก้แค่ `BRANCHES` ในเว็บจึงไม่ได้อะไร เพราะไม่มีข้อมูลคลังอื่นให้กรอง

**ขอบเขต:** ข้อมูลครบทุกคลังใน v5 แต่**เปิดใช้เฉพาะ `/price-benchmark`** —
หน้าอื่นทั้งหมดถูก pin ไว้ที่ 4 คลังเดิม ตัวเลขต้องไม่ขยับแม้แต่บาทเดียว

## ATMS มี 31 คลัง (+1 ที่ถูกลบ)

อ่านจาก `<select name="inventory_id">` ของฟอร์มรายงาน ไม่ใช่การไล่เดา id —
เลข id ข้าม 14, 19, 20, 27-30 (พิสูจน์แล้วว่าถูก ATMS ปฏิเสธ)

จัดกลุ่มตามหน้าที่ 8 กลุ่ม: อะไหล่/สต็อกหลัก (4 คลังเดิม), HR (5), จป. (5),
ทรัพย์สิน (3), จัดส่ง (4), ไม่มีสต๊อก (3), หน่วยงานสนับสนุน (5), อื่น ๆ (3)

**คลังที่ถูกลบถาวร:** `"คลัง DIST ขอนแก่น"` มีแถวในประวัติแต่ไม่มีใน dropdown
และดึงด้วย id ไม่ได้ (ทดสอบ id 1, 2, 14, 19, 20, 27-30, 41-52 ตอบ HTML error ทั้งหมด
ขณะที่คลังที่มีจริงแต่ไม่มีข้อมูลตอบ Excel เปล่า) จึงให้ **id สังเคราะห์ `901`**
จากช่วงจอง 900+ — เข้าถึงด้วย id ไม่ได้อยู่แล้ว จึงไม่มีข้อผูกพันกับ ATMS
เป็นคนละคลังกับ id 33 `"คลัง DIST ขอนแก่น (SB)"`

## ดึงข้อมูล: 1 request ต่อเดือน ไม่ใช่ 1 ต่อ (เดือน × คลัง)

ฟอร์มมีตัวเลือก `inventory_id=""` (ทั้งหมด) คืนทุกคลังในไฟล์เดียว พร้อมคอลัมน์
`คลังสินค้า` ที่ map กลับเป็น id ได้ → backfill ทั้งประวัติเหลือ **44 requests
แทน 1,188**

จำเป็นต้องเป็นแบบนี้: ATMS ทรุดเมื่อยิงหนัก — วัดไว้ 2026-08-17 ว่า 176 requests
ดัน 500-rate จาก 0% เป็น 40% ใน 35 นาที 1,188 requests จึงเป็นไปไม่ได้

### กับดัก: row_key ซ้ำ

`row_key = md5(year_month | inventory_id | row_hash | dup_seq)` และ pipeline เดิม
ประทับ `inventory_id` **จาก parameter ที่ส่งไป** ยิง `inventory_id=""` ตรง ๆ จะได้
`inventory_id=""` ทุกแถว → row_key ใหม่หมด → 4 คลังเดิมถูกเพิ่มซ้ำอีกชุด ยอดเบิล

แก้โดย map กลับจากคอลัมน์ `คลังสินค้า` → id และ fail-fast เมื่อเจอชื่อที่ไม่รู้จัก

`probe_all_inventories.py` พิสูจน์ความเท่ากันของวิธี: เทียบ row_key ที่ได้จาก
bulk กับที่ได้จากการดึงรายคลังแบบเดิม ทั้ง 4 คลัง (9,540 แถว, 2024-06) —
**ตรงกันทุกแถว**

เกณฑ์ต้องเป็น bulk ↔ solo ไม่ใช่ bulk ↔ Mongo: Mongo มี drift สะสมอยู่ก่อนแล้ว
(ATMS แก้ย้อนหลังได้ + pipeline เป็น upsert-only ไม่เคยลบ) เทียบกับ Mongo จะทำให้
วิธีที่ถูกต้องสอบตก — วัด 2024-06 พบ stale 4 แถว / ขาด 4 แถว ซึ่งเป็นปัญหาคนละเรื่อง

## กันตัวเลขเดิมไม่ให้ขยับ

`stockmovement_v5` เป็นแหล่งร่วมของหลายระบบ ที่อ่านโดยไม่กรองคลังจะเปลี่ยนทันที
ที่ข้อมูลลง จึงต้อง pin **ก่อน** backfill

| ที่ | เดิม | ทำอะไร |
|---|---|---|
| `/stock-onhand-kpi`, `/deadstock-kpi` | `$match` ระบุ 4 คลังชัดอยู่แล้ว | ไม่แตะ ✅ |
| `/api/cost/supplier-analysis` | ไม่กรองคลังเมื่อไม่ระบุ | default `$in: LEGACY_WAREHOUSES` |
| `…/supplier-analysis/options` | `distinct("คลังสินค้า")` ทั้ง collection | คืนค่าคงที่ 4 คลัง (เลิก scan 520k docs ทุกครั้งที่โหลดหน้า) |
| `/api/cost/benchmark-v2` | ไม่กรองเมื่อไม่ระบุ | default `$in: LEGACY_WAREHOUSES` |
| `dw_stockmovement` (KPI-Motors) | `find({})` ทั้ง collection | กรอง 4 คลังใน `ext_WD_data.ipynb` |
| `/api/cost/detail` | อ่าน `dw_stockmovement` | ปลอดภัยผ่าน dw ที่ pin แล้ว |

## ราคากลาง

`generateSnapshot` รวมรายการรับทั้งบริษัทโดยไม่กรองคลัง ดังนั้นหลัง backfill
snapshot ที่สร้างใหม่จะคิดจาก 32 คลัง ขณะที่ 44 เดือนที่เก็บไว้แล้วคิดจาก 4 คลัง
— ถ้าปล่อยไว้ ประวัติจะมีนิยาม ราคากลาง สองแบบ โดยมีรอยต่อที่มองไม่เห็น

จึง **regen ทุกเดือน** ผ่าน `POST /api/price-benchmark/snapshot` (force) ซึ่ง
invalidate `price_benchmark_stats` ให้ด้วย — จำเป็น เพราะ cache key ของมุมมอง
ค่าเริ่มต้นคือ `branch: null` ซึ่ง match เอกสารเก่าก่อนการเปลี่ยนแปลงนี้ ถ้าไม่ล้าง
dashboard จะเสิร์ฟตัวเลข 4 คลังต่อไปเรื่อย ๆ

ผลกระทบวัดด้วย `benchmark_impact.py` ก่อน regen: แยกคู่ (รหัสสินค้า × ซัพพลายเออร์)
เป็น 3 กลุ่ม — ไม่แตะ / เพิ่มใหม่ล้วน (ไม่บิดเบือนของเดิม) / ทับซ้อน (ราคาอาจขยับ)

## หน้าเว็บ

`lib/warehouses.ts` เป็น source of truth ฝั่ง TS — ไม่ import `mongodb` จึงให้ทั้ง
server และ client component ใช้ร่วมกันได้ แก้ปัญหาเดิมที่ `lib/price-benchmark.ts`
กับ `components/branch-filter.tsx` ต่างคนต่างถือสำเนารายชื่อคลังของตัวเอง

`BranchFilter` เปลี่ยนจากรายการแบนเป็นแบ่งกลุ่ม + ช่องค้นหา + ปุ่มเลือกทั้งกลุ่ม
+ ปุ่มลัด "เฉพาะอะไหล่" (กลับไปดู 4 คลังหลัก) — 32 รายการยาวเกินกว่าจะเป็นรายการแบน

พฤติกรรมเดิมคงไว้: เลือกครบ = ไม่กรอง และ ราคากลาง ยังเป็นค่ารวมทั้งบริษัท
ตัวกรองคลังแค่จำกัดว่าจะนับ/แสดงรายการรับของคลังไหน

## งานรายวัน

`run_notebooks.sh` เพิ่มขั้นตอน 1b: `backfill_new_inventories.py --recent 5`
(5 requests) ดูแล 28 คลังใหม่ ส่วน notebook 1 ยังดูแล 4 คลังเดิมเหมือนเดิม
แยกกันชัดเจน ความเสี่ยงต่ำสุด — ถ้าขั้นตอนใหม่ล้ม จะ log แล้วไปต่อ ไม่ทำให้ทั้ง
pipeline ตาย

ต้องเป็น window 5 เดือน ไม่ใช่เดือนปัจจุบันอย่างเดียว เพราะ ATMS รับรายการย้อนหลัง
ได้ ~2 เดือน และลบรายการได้ด้วย

สคริปต์ใหม่ทั้งหมด login ด้วย credentials จริง (`ATMS_USERNAME`/`ATMS_PASSWORD`)
ไม่ใช่ PHPSESSID ฮาร์ดโค้ดแบบ notebook เดิม — **ปลายทาง login ที่ถูกคือ
`POST /account/user/login` พร้อม `submit=login` (ตัวเล็ก)** สคริปต์เก่าที่ POST ไป `/`
ด้วย `submit=Login` ได้ PHPSESSID กลับมาแต่ยังไม่ได้ login จริง แล้วรายงานทุกฉบับ
จะกลายเป็นหน้า HTML — ตรวจด้วยการหาลิงก์ "ออกจากระบบ" ไม่ใช่ status code

## ไฟล์

**pipeline** (`master_data/purchase/cost_saving_project/`)
- `atms_inventories.py` — ตาราง 31+1 คลัง, `LEGACY_4`, `RETIRED`, `GROUPS` (ใหม่)
- `probe_all_inventories.py` — พิสูจน์ความเท่ากันของวิธีดึง (ใหม่, read-only)
- `backfill_new_inventories.py` — backfill + โหมด `--recent` รายวัน (ใหม่)
- `benchmark_impact.py` — วัดผลกระทบต่อ ราคากลาง ก่อน regen (ใหม่, read-only)
- `regen_benchmark_snapshots.py` — ขับ regen ทีละเดือน (ใหม่)
- `run_notebooks.sh` — เพิ่มขั้นตอน 1b

**เว็บ** (`mena-intelligence/`)
- `lib/warehouses.ts` — source of truth ฝั่ง TS (ใหม่)
- `lib/price-benchmark.ts` — `BRANCHES` อ่านจาก `WAREHOUSE_NAMES`
- `components/branch-filter.tsx` — แบ่งกลุ่ม + ค้นหา + ปุ่มลัด
- `app/api/cost/{supplier-analysis,supplier-analysis/options,benchmark-v2}/route.ts` — pin

**นอก repo**
- `KPI-Motors/ext_WD_data/ext_WD_data.ipynb` — กรอง 4 คลัง (สำรองไว้ที่ `.bak-20260826`)
