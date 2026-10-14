/**
 * MENA Price Benchmark API — client (v1)
 *
 * ไฟล์เดียว ไม่มี dependency — ก๊อปไปวางใน repo ไหนก็ได้ (mena-wms ฯลฯ)
 * เอกสาร: https://mena-intelligence.vercel.app/api/v1/price-benchmark/docs
 *
 *   const pb = createPriceBenchmarkClient()
 *   const { items } = await pb.batch({ codes: ["LB13OT00128"] })
 *
 * env ที่ใช้: PRICE_BENCHMARK_API_URL (ไม่ตั้ง = prod)
 */

const DEFAULT_BASE_URL = "https://mena-intelligence.vercel.app"

export type PriceBenchmarkSupplier = {
  supplier: string
  benchmark_price: number
  benchmark_count: number
  benchmark_pct: number
  min_price: number
  max_price: number
  min_price_trimmed: number
  max_price_trimmed: number
  total_records: number
  total_qty: number
  total_cost: number
  first_month: string
  last_month: string
  contract_price: number | null
  contract_effective_start: string | null
  contract_effective_end: string | null
}

export type PriceBenchmarkRecommendation = {
  /** ราคากลางของเจ้าที่ถูกที่สุด */
  price: number
  supplier: string
  based_on_records: number
  based_on_pct: number
  window_months: number
  last_purchase_month: string
  /** ส่วนต่างถ้าซื้อทุกชิ้นในช่วงนี้ที่ราคาแนะนำ (เชิงโอกาส) */
  overpaid_vs_cheapest: number
  /** ซื้อน้อยกว่า 3 ครั้ง — ควรตรวจก่อนใช้อ้างอิง */
  thin_data: boolean
  /** ไม่ได้ซื้อเกิน 6 เดือน — ราคาอาจไม่เป็นปัจจุบัน */
  stale: boolean
}

export type PriceBenchmarkItem = {
  code: string
  found: boolean
  reason?: "no_data" | "fallback_limit"
  name?: string
  group?: string
  source?: "snapshot" | "fallback"
  window?: { start: string; end: string; months: number }
  /** ราคากลางรวมทุกซัพ (ฐานนิยม) */
  benchmark_price?: number
  /** มัธยฐานของราคากลางรายซัพ ถ่วงด้วยจำนวนครั้งที่ซื้อ */
  mid_price?: number
  min_price?: number
  max_price?: number
  min_price_trimmed?: number
  max_price_trimmed?: number
  total_records?: number
  total_qty?: number
  total_cost?: number
  supplier_count?: number
  last_purchase_month?: string
  /** เรียงจากถูกไปแพง */
  suppliers?: PriceBenchmarkSupplier[]
  recommendation?: PriceBenchmarkRecommendation
}

export type PriceBenchmarkBatchResponse = {
  success: true
  month: string
  window: { start: string; end: string; months: number }
  requested: number
  found: number
  items: PriceBenchmarkItem[]
  not_found: string[]
  generated_at: string
}

export type PriceBenchmarkBatchRequest = {
  /** รหัสสินค้า ATMS สูงสุด 200 รหัส จับคู่แบบตรงตัว */
  codes: string[]
  /** YYYY-MM · ไม่ระบุ = snapshot ล่าสุด */
  month?: string
  include_prices?: boolean
}

export class PriceBenchmarkError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message)
    this.name = "PriceBenchmarkError"
  }
}

export function createPriceBenchmarkClient(options: {
  baseUrl?: string
  /** ms — ตั้งให้สั้นกว่า timeout ของ route ที่เรียก (ค่าเริ่มต้น 20 วิ) */
  timeoutMs?: number
  fetchImpl?: typeof fetch
} = {}) {
  const baseUrl = (options.baseUrl ?? process.env.PRICE_BENCHMARK_API_URL ?? DEFAULT_BASE_URL)
    .replace(/\/+$/, "")
  const timeoutMs = options.timeoutMs ?? 20_000
  const doFetch = options.fetchImpl ?? fetch

  return {
    baseUrl,

    /** ราคากลางหลายรหัสในครั้งเดียว */
    async batch(request: PriceBenchmarkBatchRequest): Promise<PriceBenchmarkBatchResponse> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await doFetch(`${baseUrl}/api/v1/price-benchmark/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.success) {
          throw new PriceBenchmarkError(
            json?.error ?? `price-benchmark API ตอบ ${res.status}`,
            res.status,
            json?.details
          )
        }
        return json as PriceBenchmarkBatchResponse
      } finally {
        clearTimeout(timer)
      }
    },

    /** ราคากลางรหัสเดียว — undefined เมื่อไม่พบ */
    async lookup(code: string, month?: string): Promise<PriceBenchmarkItem | undefined> {
      const { items } = await this.batch({ codes: [code], month })
      const item = items[0]
      return item?.found ? item : undefined
    },
  }
}
