import { NextResponse } from "next/server"
import type { Db } from "mongodb"
import clientPromise from "@/lib/mongo"
import { completeThrough as completeThroughOf, distanceCollections, sourceOf, vendorHealth } from "@/lib/gps-distance"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UNKNOWN = "ไม่ระบุ"
const DEFAULT_DAYS = 7

function isRealDate(value: string) {
  return DATE_RE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Oldest / newest date_key in a collection — an index-only lookup on {date_key, vehicle_no}. */
async function edgeDate(db: Db, name: string, dir: 1 | -1) {
  const doc = await db
    .collection(name)
    .find({}, { projection: { date_key: 1, _id: 0 }, sort: { date_key: dir }, limit: 1 })
    .next()
  return (doc?.date_key as string) ?? ""
}

/** Newest day with any distance above 0 — walks the date index backwards. */
async function lastNonZeroDate(db: Db, name: string) {
  const doc = await db
    .collection(name)
    .find(
      { $or: [{ distance_km: { $gt: 0 } }, { total_distance_km: { $gt: 0 } }] },
      { projection: { date_key: 1, _id: 0 }, sort: { date_key: -1 }, limit: 1 }
    )
    .next()
  return (doc?.date_key as string) ?? ""
}

/**
 * GET /api/gps/distance/options?start=YYYY-MM-DD&end=YYYY-MM-DD
 * → ขอบเขตวันที่ที่มีข้อมูล + fleet / สาขา / ที่มา ที่มีอยู่จริงในช่วงที่เลือก
 *
 * เมื่อไม่ส่ง start/end มา จะคืนช่วง 7 วันล่าสุดที่มีข้อมูลเป็นค่าเริ่มต้น
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const startParam = searchParams.get("start") ?? ""
    const endParam = searchParams.get("end") ?? ""

    const client = await clientPromise
    const db = client.db("gps")
    const collections = await distanceCollections(db)

    const [firstDates, lastDates, nonZeroDates] = await Promise.all([
      Promise.all(collections.map((c) => edgeDate(db, c, 1))),
      Promise.all(collections.map((c) => edgeDate(db, c, -1))),
      Promise.all(collections.map((c) => lastNonZeroDate(db, c))),
    ])
    const firstWithData = firstDates.filter(Boolean).sort()
    const lastWithData = lastDates.filter(Boolean).sort()
    const minDate = firstWithData[0] ?? ""
    const maxDate = lastWithData.at(-1) ?? ""

    const vendors = vendorHealth(
      collections.map((c, i) => ({
        source: sourceOf(c),
        firstDate: firstDates[i],
        lastDate: lastDates[i],
        lastNonZero: nonZeroDates[i],
      })),
      maxDate
    )

    // Vendors load on their own schedule, so the last day or two usually holds
    // one vendor only — a default window ending at maxDate would open the page
    // on a near-empty fleet list. Default instead to the newest day every live
    // vendor has reached; the picker still allows up to maxDate.
    const completeThrough = completeThroughOf(vendors, maxDate)

    let start = isRealDate(startParam) ? startParam : ""
    let end = isRealDate(endParam) ? endParam : ""
    if (!start || !end || start > end) {
      end = completeThrough
      start = end ? addDays(end, -(DEFAULT_DAYS - 1)) : ""
      if (minDate && start && start < minDate) start = minDate
    }

    const range = { date_key: { $gte: start, $lte: end } }

    const [fleetLists, branchLists, presence, dayLists] =
      start && end
        ? await Promise.all([
            Promise.all(collections.map((c) => db.collection(c).distinct("fleet", range))),
            Promise.all(collections.map((c) => db.collection(c).distinct("branch", range))),
            Promise.all(
              collections.map((c) =>
                db.collection(c).find(range, { projection: { _id: 1 }, limit: 1 }).next()
              )
            ),
            Promise.all(collections.map((c) => db.collection(c).distinct("date_key", range))),
          ])
        : [[], [], [], []]

    const uniqueSorted = (lists: unknown[][]) =>
      [...new Set(lists.flat().map((v) => (v ? String(v) : UNKNOWN)))].sort((a, b) =>
        a.localeCompare(b, "th")
      )

    // Only vendors that actually reported inside this window — offering a chip
    // that can only ever return nothing is worse than not offering it.
    const sources = collections
      .filter((_, i) => Boolean(presence[i]))
      .map(sourceOf)

    // Days inside the window a vendor should have covered (its own first..last
    // day, clipped to the window) but sent nothing for — a skipped ETL run.
    const gaps = Object.fromEntries(
      collections.map((c, i) => {
        const from = [start, firstDates[i]].sort().at(-1) ?? ""
        const to = [end, lastDates[i]].sort()[0] ?? ""
        const expected = from && to && from <= to ? Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1 : 0
        const have = (dayLists[i] ?? []).filter((d) => d >= from && d <= to).length
        return [sourceOf(c), Math.max(0, expected - have)]
      })
    )

    return NextResponse.json({
      success: true,
      minDate,
      maxDate,
      completeThrough,
      start,
      end,
      fleets: uniqueSorted(fleetLists),
      branches: uniqueSorted(branchLists),
      sources,
      coverage: { vendors: sources.length, totalVendors: collections.length },
      vendors: vendors.map((v) => ({ ...v, gapDays: gaps[v.source] ?? 0 })),
      collections,
    })
  } catch (error) {
    console.error("gps/distance/options API error:", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
