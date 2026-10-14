/**
 * OpenAPI document for the Price Benchmark public API, generated straight from
 * the zod schemas — the docs can't drift from what the route accepts.
 *
 * Only /api/v1/price-benchmark/* is published here; the rest of this app's APIs
 * are internal.
 */
import { createDocument } from "zod-openapi"
import {
  API_VERSION,
  BatchRequestSchema,
  BatchResponseSchema,
  ErrorResponseSchema,
  MAX_CODES,
  MAX_FALLBACK_CODES,
} from "@/lib/api/price-benchmark-v1.schema"

export function buildOpenApiDocument(serverUrl?: string) {
  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "MENA Price Benchmark API",
      version: API_VERSION,
      description: [
        "ราคากลางอะไหล่จากประวัติการรับเข้าจริงใน ATMS — ใช้อ้างอิงตอนเปิด PR / เทียบราคา",
        "",
        "**นิยาม** ราคากลาง = ฐานนิยม (mode) ของราคาทุนต่อ รหัสสินค้า × ซัพพลายเออร์ ย้อนหลัง 12 เดือน (เสมอกัน → ราคาต่ำกว่าชนะ) · ตัดค่าผิดปกติด้วย IQR ถ่วงน้ำหนัก",
        "",
        "**ขอบเขต**",
        `- สูงสุด ${MAX_CODES} รหัสต่อครั้ง`,
        `- รหัสที่ไม่มีการรับเข้าใน 12 เดือนจะคำนวณสดย้อนหลังทั้งหมด (\`source: "fallback"\`) ได้สูงสุด ${MAX_FALLBACK_CODES} รหัสต่อครั้ง`,
        "- อ่านอย่างเดียว ไม่สร้าง snapshot ใหม่",
        "- ราคาทุนเป็นราคาต่อหน่วยตามที่ ATMS บันทึก (ก่อน VAT) · ราคากลางรวมทุกคลัง ไม่แยกสาขา",
        "- กลุ่ม น้ำมันเชื้อเพลิง ถูกตัดออกทั้งระบบ (ราคาตลาด ฐานนิยมไม่มีความหมาย)",
        "",
        "**API ไม่ตัดสินว่าแพงหรือไม่แพง** — ส่งตัวเลขกับราคาแนะนำไปให้ แล้วให้ระบบปลายทางตั้งเกณฑ์เอง",
      ].join("\n"),
      contact: { name: "MENA Intelligence" },
    },
    servers: [
      { url: serverUrl ?? "https://mena-intelligence.vercel.app", description: "production" },
    ],
    paths: {
      "/api/v1/price-benchmark/batch": {
        post: {
          summary: "ราคากลางหลายรหัสสินค้าในครั้งเดียว",
          description:
            "ส่งรายการรหัสสินค้า คืนราคากลางรวม ราคารายซัพพลายเออร์ ราคาสัญญา และราคาแนะนำ (เจ้าถูกสุด) ต่อรหัส",
          operationId: "priceBenchmarkBatch",
          tags: ["price-benchmark"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: BatchRequestSchema } },
          },
          responses: {
            "200": {
              description: "สำเร็จ — รหัสที่ไม่พบจะอยู่ใน items (found: false) และ not_found",
              content: { "application/json": { schema: BatchResponseSchema } },
            },
            "400": {
              description: "request ไม่ถูกต้อง",
              content: { "application/json": { schema: ErrorResponseSchema } },
            },
            "503": {
              description: "ยังไม่มี snapshot ราคากลางในระบบ",
              content: { "application/json": { schema: ErrorResponseSchema } },
            },
          },
        },
      },
    },
    tags: [{ name: "price-benchmark", description: "ราคากลางอะไหล่" }],
  })
}
