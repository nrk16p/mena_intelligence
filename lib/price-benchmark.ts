import clientPromise from "@/lib/mongo"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PricePoint = {
  price: number
  count: number
  qty:   number
  cost:  number
  pct:   number
  outlier: boolean
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
  iqr_lower: number | null
  iqr_upper: number | null
  min_price_trimmed: number
  max_price_trimmed: number
  total_records: number
  total_qty:     number
  total_cost:    number
  first_date: string
  last_date:  string
  prices: PricePoint[]
  computed_at: Date
}

export const SNAPSHOT_COLLECTION = "price_benchmark"
export const STATS_COLLECTION    = "price_benchmark_stats"

export type MonthStats = {
  month: string
  group: string | null
  summary: {
    receipts_checked: number
    flagged_count: number
    flagged_products: number
    flagged_suppliers: number
    excess_total: number
    no_benchmark_count: number
  }
  top_products:  { code: string; name: string; group: string; excess: number; count: number }[]
  top_suppliers: { supplier: string; excess: number; count: number }[]
  by_group:      { group: string; excess: number; count: number }[]
  snapshot_pairs: number
  computed_at: Date
}

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

/**
 * Weighted IQR bounds (Tukey 1.5×IQR) over a price distribution sorted asc.
 * Quantiles are weighted by occurrence count. Returns null when there is too
 * little data (< 4 receipts) or no spread (IQR = 0) — no trimming in that case.
 */
export function weightedIQRBounds(
  prices: { price: number; count: number }[]
): { lower: number; upper: number } | null {
  const total = prices.reduce((s, p) => s + p.count, 0)
  if (total < 4) return null
  const quantile = (pct: number): number => {
    const target = pct * total
    let cum = 0
    for (const p of prices) {
      cum += p.count
      if (cum >= target) return p.price
    }
    return prices[prices.length - 1].price
  }
  const q1 = quantile(0.25)
  const q3 = quantile(0.75)
  const iqr = q3 - q1
  if (iqr <= 0) return null
  return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr }
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

    const bounds = weightedIQRBounds(valid as { price: number; count: number }[])
    const isOutlier = (price: number) => !!bounds && (price < bounds.lower || price > bounds.upper)
    const inRange = valid.filter(p => !isOutlier(p.price as number))
    const trimmed = inRange.length > 0 ? inRange : valid

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
      iqr_lower: bounds?.lower ?? null,
      iqr_upper: bounds?.upper ?? null,
      min_price_trimmed: trimmed[0].price as number,
      max_price_trimmed: trimmed[trimmed.length - 1].price as number,
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
        outlier: isOutlier(p.price as number),
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

/**
 * Compute dashboard stats for a month: join the month's receipts against the
 * month's benchmark snapshot inside MongoDB ($lookup on the unique index) and
 * aggregate flags, excess value, and top-N breakdowns.
 */
async function computeMonthStats(month: string, group: string | null = null): Promise<MonthStats> {
  const client = await clientPromise
  const db = client.db("atms")

  const supplierNorm = {
    $cond: {
      if:   { $or: [{ $eq: ["$ซัพพลายเออร์", null] }, { $eq: ["$ซัพพลายเออร์", ""] }] },
      then: "ไม่ระบุ",
      else: "$ซัพพลายเออร์",
    },
  }

  const [res] = await db.collection("stockmovement_v5").aggregate([
    { $match: receiptMatch({ year_month: month, ราคาทุน: { $ne: null }, ...(group ? { กลุ่มสินค้า: group } : {}) }) },
    { $addFields: { sup: supplierNorm } },
    {
      $lookup: {
        from: SNAPSHOT_COLLECTION,
        let: { p: "$รหัสสินค้า", s: "$sup" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$snapshot_month", month] },
                  { $eq: ["$รหัสสินค้า", "$$p"] },
                  { $eq: ["$ซัพพลายเออร์", "$$s"] },
                ],
              },
            },
          },
          { $project: { _id: 0, benchmark_price: 1 } },
        ],
        as: "bench",
      },
    },
    { $addFields: { bench: { $first: "$bench.benchmark_price" } } },
    {
      $addFields: {
        is_flagged: { $and: [{ $ne: ["$bench", null] }, { $gt: ["$ราคาทุน", "$bench"] }] },
        excess: {
          $cond: [
            { $and: [{ $ne: ["$bench", null] }, { $gt: ["$ราคาทุน", "$bench"] }] },
            { $multiply: [{ $subtract: ["$ราคาทุน", "$bench"] }, { $ifNull: ["$รับ", 0] }] },
            0,
          ],
        },
      },
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              receipts_checked: { $sum: 1 },
              flagged_count:    { $sum: { $cond: ["$is_flagged", 1, 0] } },
              excess_total:     { $sum: "$excess" },
              no_benchmark_count: { $sum: { $cond: [{ $eq: ["$bench", null] }, 1, 0] } },
            },
          },
        ],
        flagged_products:  [{ $match: { is_flagged: true } }, { $group: { _id: "$รหัสสินค้า" } }, { $count: "n" }],
        flagged_suppliers: [{ $match: { is_flagged: true } }, { $group: { _id: "$sup" } }, { $count: "n" }],
        top_products: [
          { $match: { is_flagged: true } },
          {
            $group: {
              _id: "$รหัสสินค้า",
              name:  { $last: "$ชื่อสินค้า" },
              group: { $last: "$กลุ่มสินค้า" },
              excess: { $sum: "$excess" },
              count:  { $sum: 1 },
            },
          },
          { $sort: { excess: -1 } },
          { $limit: 10 },
          { $project: { _id: 0, code: "$_id", name: 1, group: 1, excess: 1, count: 1 } },
        ],
        top_suppliers: [
          { $match: { is_flagged: true } },
          { $group: { _id: "$sup", excess: { $sum: "$excess" }, count: { $sum: 1 } } },
          { $sort: { excess: -1 } },
          { $limit: 10 },
          { $project: { _id: 0, supplier: "$_id", excess: 1, count: 1 } },
        ],
        by_group: [
          { $match: { is_flagged: true } },
          { $group: { _id: { $ifNull: ["$กลุ่มสินค้า", "ไม่ระบุ"] }, excess: { $sum: "$excess" }, count: { $sum: 1 } } },
          { $sort: { excess: -1 } },
          { $limit: 12 },
          { $project: { _id: 0, group: "$_id", excess: 1, count: 1 } },
        ],
      },
    },
  ], { allowDiskUse: true }).toArray()

  const snapshot_pairs = await db.collection(SNAPSHOT_COLLECTION).countDocuments({
    snapshot_month: month,
    ...(group ? { กลุ่มสินค้า: group } : {}),
  })
  const s = res.summary[0] ?? { receipts_checked: 0, flagged_count: 0, excess_total: 0, no_benchmark_count: 0 }

  return {
    month,
    group,
    summary: {
      receipts_checked: s.receipts_checked,
      flagged_count:    s.flagged_count,
      flagged_products:  res.flagged_products[0]?.n ?? 0,
      flagged_suppliers: res.flagged_suppliers[0]?.n ?? 0,
      excess_total:     s.excess_total,
      no_benchmark_count: s.no_benchmark_count,
    },
    top_products:  res.top_products,
    top_suppliers: res.top_suppliers,
    by_group:      res.by_group,
    snapshot_pairs,
    computed_at: new Date(),
  }
}

/**
 * Cached month stats (collection `price_benchmark_stats`, keyed month × group);
 * group = null → all product groups. Recompute on force.
 */
export async function getMonthStats(month: string, force = false, group: string | null = null): Promise<MonthStats> {
  const client = await clientPromise
  const col = client.db("atms").collection(STATS_COLLECTION)

  if (!force) {
    // { group: null } also matches legacy docs saved before the group field existed
    const cached = await col.findOne({ month, group: group ?? null }, { projection: { _id: 0 } })
    if (cached) return { group: null, ...cached } as unknown as MonthStats
  }

  await ensureSnapshot(month)
  const stats = await computeMonthStats(month, group)
  await col.updateOne({ month, group: group ?? null }, { $set: stats }, { upsert: true })
  return stats
}

/** Drop cached stats for a month — every group variant (after snapshot regen). */
export async function invalidateMonthStats(month: string) {
  const client = await clientPromise
  await client.db("atms").collection(STATS_COLLECTION).deleteMany({ month })
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
