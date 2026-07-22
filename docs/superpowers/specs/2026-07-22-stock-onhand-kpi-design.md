# KPI ควบคุมสต็อคคงเหลือ (Stock On-hand KPI) — Design

วันที่: 2026-07-22 · กลุ่มเมนู: **Procurement** · permission key: `procurement`

## เป้าหมาย
Scorecard ควบคุม **มูลค่าสต็อคคงเหลือ** ราย 2 กลุ่มคลัง วัดรายเดือน ให้เกรด/คะแนน
เทียบเป้า — ยิ่งคงเหลือน้อยยิ่งดี (คุมทุนจม)

## กลุ่มคลัง (bucket)
| กลุ่ม | คลังสินค้า (field `คลังสินค้า`) | เป้าหมาย | band เกรด 4 / 3 / 2 |
|---|---|---|---|
| **ศลบ.** | คลังลาดกระบัง + คลังขอนแก่น | 650,000 | ≤630k / ≤650k / ≤670k |
| **สสบ.** | คลังสระบุรี + คลัง DIST (บางปะกง) | 180,000 | ≤160k / ≤180k / ≤200k |

- น้ำหนัก = 4, คะแนน = เกรด × 4 (เต็ม 16), เกินกว่า band เกรด 2 → **เกรด 1 (ตก)**

## นิยาม metric (ยืนยันจากข้อมูลจริง)
`สต็อคคงเหลือสิ้นเดือน = running balance = Σ(รับ − จ่าย) × ราคาทุน สะสมตั้งแต่ 2023-01`
(reproduce เป้า 650k/180k ได้พอดีช่วงปลายปี 2025)

- คำนวณสะสมจาก 2023-01 เพื่อความถูกต้อง แต่ **แสดง KPI ตั้งแต่ปี 2025 เป็นต้นไป**

## Data source
`atms.stockmovement_v5` (mongodb driver ผ่าน `lib/mongo.ts`)
match ทั้ง 4 คลัง (= ทุก row ในคอลเลกชัน), group by `คลังสินค้า` × `year_month`

## ไฟล์ที่เพิ่ม/แก้
- `lib/stock-onhand-kpi.ts` — config กลุ่ม/band + `gradeFor()` + `buildPivot()` (aggregation + running balance)
- `app/api/stock-onhand-kpi/route.ts` — GET → pivot ต่อปี (balance/grade/score รายเดือน) + config
- `app/api/stock-onhand-kpi/raw/route.ts` — GET `?year=&group=` → stream CSV raw movement rows
- `app/stock-onhand-kpi/layout.tsx` — guard `procurement` (mirror supplier-analysis) + PropertyVue fonts
- `app/stock-onhand-kpi/page.tsx` — UI (PropertyVue): ตัวเลือกปี + pivot table + การ์ดสรุป + ปุ่มโหลด raw
- `components/sidebar.tsx` — เพิ่มเมนูใน Procurement group

## UI
1. **ตัวเลือกปี** — ปุ่มปี (2025, 2026, …) ดูทีละปี
2. **Pivot table** — แถว: ศลบ.(คงเหลือ/เกรด/คะแนน) + สสบ.(คงเหลือ/เกรด/คะแนน); คอลัมน์: ม.ค.–ธ.ค. ของปีที่เลือก; ลงสีตามเกรด (🟢4 / 🟡2 / 🔴1)
3. **การ์ดสรุปเดือนล่าสุด** 2 ใบ — คงเหลือ / เกรด / คะแนน x16 / เทียบเป้า
4. **ปุ่มโหลด Raw Data** — Excel/CSV ของปี+กลุ่มที่เลือก (server stream)

## ไม่แตะ
route/หน้าเดิมทั้งหมด · **ไม่ push main จนกว่าจะสั่ง** (push = deploy prod)

## สมมติฐาน
- เกรด 1 = คงเหลือ > band เกรด 2 (ตารางกำหนดแค่ 2–4)
- คงเหลือ < band เกรด 4 ยังนับเกรด 4 (cap ที่ 16)
- opening stock ก่อน 2023 = 0 (วิธีคิดตรงกับเป้าที่ตั้งไว้)
