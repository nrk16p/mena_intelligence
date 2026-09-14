import { NextResponse } from "next/server"
import type { Db } from "mongodb"
import clientPromise from "@/lib/mongo"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const MONTH_RE = /^\d{4}-\d{2}$/
const UNKNOWN = "ไม่ระบุ"

async function distanceCollections(db: Db) {
  const cols = await db.listCollections({ name: { $regex: "^distance_" } }).toArray()
  return cols.map((c) => c.name).sort()
}

// GET /api/gps/distance/options?month=YYYY-MM
// → เดือนที่มีข้อมูลทั้งหมด + fleet ที่มีในเดือนที่เลือก
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const monthParam = searchParams.get("month") ?? ""

    const client = await clientPromise
    const db = client.db("gps")
    const collections = await distanceCollections(db)

    const monthLists = await Promise.all(
      collections.map((name) => db.collection(name).distinct("etl_months"))
    )

    // Vendors load on their own schedule, so the newest month is usually still
    // half-empty — landing on it makes most fleets look missing.
    const coverage = new Map<string, string[]>()
    monthLists.forEach((list, i) => {
      for (const m of list as string[]) {
        if (!m) continue
        coverage.set(m, [...(coverage.get(m) ?? []), collections[i]])
      }
    })

    const months = [...coverage.keys()].sort().reverse()
    const monthMeta = months.map((m) => ({
      month: m,
      vendors: coverage.get(m)!.length,
      totalVendors: collections.length,
    }))

    const latestComplete = monthMeta.find((m) => m.vendors === collections.length)?.month
    const month = MONTH_RE.test(monthParam) ? monthParam : (latestComplete ?? months[0])

    const [fleetLists, branchLists] = month
      ? await Promise.all([
          Promise.all(
            collections.map((name) => db.collection(name).distinct("fleet", { etl_months: month }))
          ),
          Promise.all(
            collections.map((name) => db.collection(name).distinct("branch", { etl_months: month }))
          ),
        ])
      : [[], []]

    const uniqueSorted = (lists: unknown[][]) =>
      [...new Set(lists.flat().map((v) => (v ? String(v) : UNKNOWN)))].sort((a, b) =>
        a.localeCompare(b, "th")
      )

    // Only vendors that actually reported in this month — offering a chip that
    // can only ever return nothing is worse than not offering it.
    const sources = (coverage.get(month) ?? [])
      .map((c) => c.replace(/^distance_/, ""))
      .sort()

    return NextResponse.json({
      success: true,
      months,
      monthMeta,
      month,
      fleets: uniqueSorted(fleetLists),
      branches: uniqueSorted(branchLists),
      sources,
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
