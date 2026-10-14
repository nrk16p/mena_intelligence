/**
 * The one contract for the Price Benchmark public API v1.
 *
 * Written once here, used three ways: request validation in the route,
 * /api/v1/price-benchmark/openapi.json, and the docs page. Change a field here
 * and the docs change with it.
 */
import { z } from "zod"

export const API_VERSION = "1.0.0"
export const MAX_CODES = 200
export const MAX_FALLBACK_CODES = 20

const monthStr = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "month ต้องเป็นรูปแบบ YYYY-MM")

export const BatchRequestSchema = z
  .object({
    codes: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(MAX_CODES)
      .meta({
        description: `รหัสสินค้า (ATMS) ที่ต้องการราคากลาง — สูงสุด ${MAX_CODES} รหัสต่อครั้ง จับคู่แบบตรงตัว`,
        example: ["LB13OT00128", "LB10PM00097"],
      }),
    month: monthStr.optional().meta({
      description: "เดือนของ snapshot ที่ต้องการ (ราคากลาง = ฐานนิยมย้อนหลัง 12 เดือนนับจากเดือนนี้) · ไม่ระบุ = snapshot ล่าสุดที่มี",
      example: "2026-09",
    }),
    include_prices: z.boolean().optional().default(false).meta({
      description: "ใส่รายการจุดราคาดิบ (ราคา/จำนวนครั้ง/outlier) ของแต่ละซัพพลายเออร์มาด้วย — payload โตขึ้นมาก",
    }),
  })
  .meta({ id: "BatchRequest" })

const PricePointSchema = z
  .object({
    price: z.number(),
    count: z.number().int(),
    qty: z.number(),
    cost: z.number(),
    pct: z.number(),
    outlier: z.boolean().meta({ description: "อยู่นอกช่วง IQR ถ่วงน้ำหนัก = ราคาผิดปกติ" }),
  })
  .meta({ id: "PricePoint" })

const SupplierSchema = z
  .object({
    supplier: z.string().meta({ description: "ชื่อซัพพลายเออร์ตามที่คีย์ใน ATMS (เทียบแบบตรงตัว)" }),
    benchmark_price: z.number().meta({ description: "ราคากลางของซัพรายนี้ = ฐานนิยมของราคาทุน (เสมอกัน → ราคาต่ำกว่าชนะ)" }),
    benchmark_count: z.number().int().meta({ description: "จำนวนครั้งที่ซื้อได้ราคานี้" }),
    benchmark_pct: z.number().meta({ description: "% ของการซื้อทั้งหมดที่ได้ราคานี้" }),
    min_price: z.number(),
    max_price: z.number(),
    min_price_trimmed: z.number().meta({ description: "ต่ำสุดหลังตัด outlier" }),
    max_price_trimmed: z.number().meta({ description: "สูงสุดหลังตัด outlier" }),
    total_records: z.number().int().meta({ description: "จำนวนครั้งที่รับเข้าในช่วงเวลา" }),
    total_qty: z.number(),
    total_cost: z.number(),
    first_month: z.string(),
    last_month: z.string().meta({ description: "เดือนที่ซื้อล่าสุด (YYYY-MM)" }),
    contract_price: z.number().nullable().meta({ description: "ราคาสัญญาที่มีผลในเดือนนี้ · null = ไม่มีสัญญา" }),
    contract_effective_start: z.string().nullable(),
    contract_effective_end: z.string().nullable(),
    prices: z.array(PricePointSchema).optional(),
  })
  .meta({ id: "Supplier" })

const RecommendationSchema = z
  .object({
    price: z.number().meta({ description: "ราคาแนะนำ = ราคากลางของเจ้าที่ถูกที่สุด (เสมอกัน → เจ้าที่ซื้อบ่อยกว่า)" }),
    supplier: z.string(),
    based_on_records: z.number().int().meta({ description: "อ้างอิงจากกี่ครั้งที่ได้ราคานี้" }),
    based_on_pct: z.number(),
    window_months: z.number().int().meta({ description: "ช่วงที่ใช้คำนวณ (เดือน) — ปกติ 12 แต่ยาวกว่านั้นเมื่อเป็น fallback" }),
    last_purchase_month: z.string(),
    overpaid_vs_cheapest: z.number().meta({
      description: "ส่วนต่างถ้าซื้อทุกชิ้นในช่วงนี้ที่ราคาแนะนำ — ตัวเลขเชิงโอกาส อาจมีเหตุผลอื่น เช่น งานด่วน ของขาด สเปคต่าง",
    }),
    thin_data: z.boolean().meta({ description: "ข้อมูลน้อย (ซื้อ < 3 ครั้ง) — ควรตรวจก่อนใช้อ้างอิง" }),
    stale: z.boolean().meta({ description: "ไม่ได้ซื้อมาเกิน 6 เดือน — ราคาอาจไม่เป็นปัจจุบัน" }),
  })
  .meta({ id: "Recommendation" })

const ItemSchema = z
  .object({
    code: z.string(),
    found: z.boolean(),
    reason: z.enum(["no_data", "fallback_limit"]).optional().meta({
      description: "เหตุผลที่ไม่พบ: no_data = ไม่เคยรับเข้าเลย · fallback_limit = เกินโควตาการคำนวณสดต่อครั้ง ให้ยิงรหัสนี้แยก",
    }),
    name: z.string().optional(),
    group: z.string().optional(),
    source: z.enum(["snapshot", "fallback"]).optional().meta({
      description: "snapshot = ราคากลาง 12 เดือนที่คำนวณไว้แล้ว · fallback = ไม่มีการรับเข้าใน 12 เดือน จึงคำนวณสดย้อนหลังทั้งหมด",
    }),
    window: z.object({ start: z.string(), end: z.string(), months: z.number().int() }).optional(),
    benchmark_price: z.number().optional().meta({ description: "ราคากลางรวมทุกซัพ = ฐานนิยมของราคาทุนทั้งหมดรวมกัน" }),
    mid_price: z.number().optional().meta({ description: "มัธยฐานของราคากลางรายซัพ ถ่วงด้วยจำนวนครั้งที่ซื้อ" }),
    min_price: z.number().optional(),
    max_price: z.number().optional(),
    min_price_trimmed: z.number().optional(),
    max_price_trimmed: z.number().optional(),
    total_records: z.number().int().optional(),
    total_qty: z.number().optional(),
    total_cost: z.number().optional(),
    supplier_count: z.number().int().optional(),
    last_purchase_month: z.string().optional(),
    suppliers: z.array(SupplierSchema).optional().meta({ description: "เรียงจากถูกไปแพง" }),
    recommendation: RecommendationSchema.optional(),
  })
  .meta({ id: "Item" })

export const BatchResponseSchema = z
  .object({
    success: z.literal(true),
    month: z.string().meta({ description: "เดือนของ snapshot ที่ใช้ตอบจริง" }),
    window: z.object({ start: z.string(), end: z.string(), months: z.number().int() }),
    requested: z.number().int(),
    found: z.number().int(),
    items: z.array(ItemSchema),
    not_found: z.array(z.string()),
    generated_at: z.string(),
  })
  .meta({ id: "BatchResponse" })

export const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.string(),
    details: z.unknown().optional(),
  })
  .meta({ id: "ErrorResponse" })

export type BatchRequest = z.infer<typeof BatchRequestSchema>
export type BatchResponse = z.infer<typeof BatchResponseSchema>
