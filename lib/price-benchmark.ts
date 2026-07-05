import clientPromise from "@/lib/mongo"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PricePoint = {
  price: number
  count: number
  qty:   number
  cost:  number
  pct:   number
}

export type BenchmarkDoc = {
  snapshot_month: string
  window_start:   string
  window_end:     string
  รหัสสินค้า:     string
  ชื่อสินค้า:     string
  กลุ่มสินค้า:    string
  ซัพพลายเออร์:   string
  benchmark_price: number
  benchmark_count: number
  benchmark_pct:   number
  min_price: number
  max_price: number
  total_records: number
  total_qty:     number
  total_cost:    number
  first_date: string
  last_date:  string
  prices: PricePoint[]
  computed_at: Date
}

export const SNAPSHOT_COLLECTION = "price_benchmark"

// ── Helpers ───────────────────────────────────────────────────────────────────

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** 12-month rolling window ending at (and including) the snapshot month. */
export function windowFor(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 - 11, 1))
  const start = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  return { start, end: month }
}

export function isValidMonth(month: string | null): month is string {
  return !!month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

/** Receipt filter shared by snapshot generation and the overpriced report. */
export function receiptMatch(extra: Record<string, unknown> = {}) {
  return {
    รับ: { $gt: 0 },
    WD:  { $in: [null, ""] },
    รหัสสินค้า: { $exists: true, $nin: [null, ""] },
    ...extra,
  }
}

// ── Snapshot generation ───────────────────────────────────────────────────────

/**
 * Compute the full snapshot for a month (mode over the trailing 12 months,
 * per รหัสสินค้า × ซัพพลายเออร์) and store it in `price_benchmark`.
 * Existing rows for the month are replaced.
 */
export async function generateSnapshot(month: string): Promise<{ row_count: number; ms: number }> {
  const t0 = Date.now()
  const client = await clientPromise
  const db  = client.db("atms")
  const src = db.collection("stockmovement_v5")
  const dst = db.collection(SNAPSHOT_COLLECTION)

  await dst.createIndex(
    { snapshot_month: 1, รหัสสินค้า: 1, ซัพพลายเออร์: 1 },
    { unique: true }
  )
  await dst.createIndex({ snapshot_month: 1, กลุ่มสินค้า: 1 })

  const { start, end } = windowFor(month)

  const pipeline = [
    { $match: receiptMatch({ year_month: { $gte: start, $lte: end } }) },
    {
      $addFields: {
        ซัพพลายเออร์: {
          $cond: {
            if:   { $or: [{ $eq: ["$ซัพพลายเออร์", null] }, { $eq: ["$ซัพพลายเออร์", ""] }] },
            then: "ไม่ระบุ",
            else: "$ซัพพลายเออร์",
          },
        },
      },
    },
    {
      $group: {
        _id: { p: "$รหัสสินค้า", s: "$ซัพพลายเออร์", price: "$ราคาทุน" },
        ชื่อสินค้า:  { $last: "$ชื่อสินค้า" },
        กลุ่มสินค้า: { $last: "$กลุ่มสินค้า" },
        count:      { $sum: 1 },
        qty:        { $sum: "$รับ" },
        cost:       { $sum: "$ยอดเงิน" },
        first_date: { $min: "$year_month" },
        last_date:  { $max: "$year_month" },
      },
    },
    {
      $group: {
        _id: { p: "$_id.p", s: "$_id.s" },
        ชื่อสินค้า:    { $last: "$ชื่อสินค้า" },
        กลุ่มสินค้า:   { $last: "$กลุ่มสินค้า" },
        total_records: { $sum: "$count" },
        total_qty:     { $sum: "$qty" },
        total_cost:    { $sum: "$cost" },
        first_date:    { $min: "$first_date" },
        last_date:     { $max: "$last_date" },
        prices: { $push: { price: "$_id.price", count: "$count", qty: "$qty", cost: "$cost" } },
      },
    },
  ]

  const rows = await src.aggregate(pipeline, { allowDiskUse: true }).toArray()
  const computed_at = new Date()

  const docs: BenchmarkDoc[] = []
  for (const r of rows) {
    const valid = (r.prices as { price: number | null; count: number; qty: number; cost: number }[])
      .filter(p => p.price !== null && p.price !== undefined && Number.isFinite(p.price))
      // min → max ranking; stable base order for the mode tie-break below
      .sort((a, b) => (a.price as number) - (b.price as number))
    if (valid.length === 0) continue

    const total = valid.reduce((s, p) => s + p.count, 0)
    // Mode = highest count; tie → lower price wins (array already sorted asc)
    let mode = valid[0]
    for (const p of valid) if (p.count > mode.count) mode = p

    docs.push({
      snapshot_month: month,
      window_start:   start,
      window_end:     end,
      รหัสสินค้า:     r._id.p,
      ชื่อสินค้า:     r.ชื่อสินค้า ?? "",
      กลุ่มสินค้า:    r.กลุ่มสินค้า ?? "",
      ซัพพลายเออร์:   r._id.s,
      benchmark_price: mode.price as number,
      benchmark_count: mode.count,
      benchmark_pct:   (mode.count / total) * 100,
      min_price: valid[0].price as number,
      max_price: valid[valid.length - 1].price as number,
      total_records: total,
      total_qty:     r.total_qty,
      total_cost:    r.total_cost,
      first_date: r.first_date,
      last_date:  r.last_date,
      prices: valid.map(p => ({
        price: p.price as number,
        count: p.count,
        qty:   p.qty,
        cost:  p.cost,
        pct:   (p.count / total) * 100,
      })),
      computed_at,
    })
  }

  await dst.deleteMany({ snapshot_month: month })
  if (docs.length > 0) {
    try {
      await dst.insertMany(docs as unknown as Record<string, unknown>[], { ordered: false })
    } catch (err: unknown) {
      // Concurrent generation can race on the unique index — keep whichever landed first
      if ((err as { code?: number }).code !== 11000) throw err
    }
  }

  return { row_count: docs.length, ms: Date.now() - t0 }
}

/** Generate the snapshot for a month if it does not exist yet (lazy init). */
export async function ensureSnapshot(month: string): Promise<{ generated: boolean; row_count: number }> {
  const client = await clientPromise
  const dst = client.db("atms").collection(SNAPSHOT_COLLECTION)
  const existing = await dst.countDocuments({ snapshot_month: month })
  if (existing > 0) return { generated: false, row_count: existing }
  const { row_count } = await generateSnapshot(month)
  return { generated: true, row_count }
}
