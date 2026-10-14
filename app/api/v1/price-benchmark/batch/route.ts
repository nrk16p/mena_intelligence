import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import {
  computeBenchmarkForCode,
  getContractMap,
  getDataStart,
  groupFilter,
  SNAPSHOT_COLLECTION,
  type BenchmarkDoc,
} from "@/lib/price-benchmark"
import { buildItem, type BenchmarkRowWithContract, type V1Item } from "@/lib/api/price-benchmark-v1"
import {
  BatchRequestSchema,
  MAX_FALLBACK_CODES,
  type BatchResponse,
} from "@/lib/api/price-benchmark-v1.schema"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * POST /api/v1/price-benchmark/batch — ราคากลางสำหรับระบบอื่น (mena-wms ฯลฯ).
 *
 * Read-only by design: it never triggers snapshot generation, so an external
 * caller can't make this app do the expensive monthly aggregation. Months that
 * have no snapshot yet simply aren't offered.
 *
 * Open endpoint for now (no key) — to lock it down later, fill in requireApiKey
 * below and nothing else has to change.
 */
/** Today's YYYY-MM in Bangkok time — the app's months are all Thai calendar months. */
function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())
}

function requireApiKey(_req: Request): string | null {
  // v1 เปิดอ่านได้เลยตามที่ตกลง — คืน null = ผ่าน
  // เปิดใช้ทีหลัง: อ่าน process.env.PRICE_API_KEYS ("client:key,...") เทียบกับ header x-api-key
  return null
}

export async function POST(req: Request) {
  try {
    const authError = requireApiKey(req)
    if (authError) {
      return NextResponse.json({ success: false, error: authError }, { status: 401 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ success: false, error: "body ต้องเป็น JSON" }, { status: 400 })
    }

    const parsed = BatchRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "request ไม่ถูกต้อง", details: parsed.error.issues },
        { status: 400 }
      )
    }
    const { codes: rawCodes, month: reqMonth, include_prices } = parsed.data

    // dedupe but keep the caller's order so the response lines up with their list
    const codes = [...new Set(rawCodes.map(c => c.trim()).filter(Boolean))]

    const client = await clientPromise
    const col = client.db("atms").collection(SNAPSHOT_COLLECTION)

    // Resolve the month WITHOUT generating anything: newest snapshot ≤ requested.
    // Default is capped at the current month — the collection can hold snapshots
    // for months ahead (the UI's month picker generates them lazily) and those
    // shouldn't become the default answer.
    const cap = reqMonth ?? currentMonth()
    const latest = (await col
      .find({ snapshot_month: { $lte: cap } })
      .project({ snapshot_month: 1, _id: 0 })
      .sort({ snapshot_month: -1 })
      .limit(1)
      .next()) as { snapshot_month?: string } | null
    const month = latest?.snapshot_month
    if (!month) {
      return NextResponse.json(
        { success: false, error: "ยังไม่มี snapshot ราคากลางในระบบ" },
        { status: 503 }
      )
    }

    // Snapshot rows (fuel and other excluded groups dropped on the read path too)
    const rows = (await col
      .find(
        { snapshot_month: month, รหัสสินค้า: { $in: codes }, กลุ่มสินค้า: groupFilter([]) },
        { projection: { _id: 0 } }
      )
      .toArray()) as unknown as BenchmarkDoc[]

    const bySku = new Map<string, BenchmarkDoc[]>()
    for (const r of rows) {
      const list = bySku.get(r.รหัสสินค้า)
      if (list) list.push(r)
      else bySku.set(r.รหัสสินค้า, [r])
    }

    // ── Long-window fallback ──────────────────────────────────────────────────
    // A code with no rows in the 12-month window usually means "real part, just
    // not bought this year". Recompute it live over the full history rather than
    // answering "unknown" — capped, because each one is its own aggregation.
    const missing = codes.filter(c => !bySku.has(c))
    const fallbackCodes = missing.slice(0, MAX_FALLBACK_CODES)
    const overflow = new Set(missing.slice(MAX_FALLBACK_CODES))
    const fellBack = new Set<string>()

    if (fallbackCodes.length > 0) {
      const dataStart = await getDataStart()
      const results = await Promise.all(
        fallbackCodes.map(code =>
          computeBenchmarkForCode(code, month, dataStart)
            // computeBenchmarkForCode matches by regex; keep exact hits only
            .then(docs => docs.filter(d => d.รหัสสินค้า === code))
            .catch(() => [] as BenchmarkDoc[])
        )
      )
      results.forEach((docs, i) => {
        if (docs.length > 0) {
          bySku.set(fallbackCodes[i], docs)
          fellBack.add(fallbackCodes[i])
        }
      })
    }

    // Overlay negotiated contract prices in effect for this month
    const contractMap = await getContractMap(month, codes)

    const items: V1Item[] = codes.map(code => {
      const docs = bySku.get(code)
      if (!docs || docs.length === 0) {
        return { code, found: false, reason: overflow.has(code) ? "fallback_limit" : "no_data" }
      }
      const withContract: BenchmarkRowWithContract[] = docs.map(d => {
        const c = contractMap.get(`${d.รหัสสินค้า}||${d.ซัพพลายเออร์}`)
        return c
          ? {
              ...d,
              contract_price: c.contract_price,
              contract_effective_start: c.effective_start,
              contract_effective_end: c.effective_end,
            }
          : d
      })
      return buildItem(code, withContract, fellBack.has(code) ? "fallback" : "snapshot", {
        includePrices: include_prices,
      })
    })

    const anyWindow = items.find(i => i.window && i.source === "snapshot")?.window
    const payload: BatchResponse = {
      success: true,
      month,
      window: anyWindow ?? { start: month, end: month, months: 12 },
      requested: codes.length,
      found: items.filter(i => i.found).length,
      items,
      not_found: items.filter(i => !i.found).map(i => i.code),
      generated_at: new Date().toISOString(),
    }
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error"
    console.error("v1/price-benchmark/batch error:", error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
