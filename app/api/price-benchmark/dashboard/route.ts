import { NextResponse } from "next/server"
import { getMonthStats, isValidMonth } from "@/lib/price-benchmark"

export const maxDuration = 300

const TREND_MONTHS = 6

function monthsBack(month: string, n: number): string[] {
  const [y, m] = month.split("-").map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`)
  }
  return out
}

/**
 * Dashboard overview: current-month stats (KPIs + top-10 breakdowns) and a
 * 6-month excess trend. Stats are cached per month; force=1 recomputes the
 * selected month only. First call may take ~1 min while old snapshots build.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const month = searchParams.get("month")
    const force = searchParams.get("force") === "1"

    if (!isValidMonth(month)) {
      return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 })
    }

    const months = monthsBack(month, TREND_MONTHS)

    // Sequential on purpose: each month may lazily build its snapshot (heavy)
    const trend = []
    for (const m of months) {
      const stats = await getMonthStats(m, force && m === month)
      trend.push({
        month: m,
        excess_total:  stats.summary.excess_total,
        flagged_count: stats.summary.flagged_count,
        receipts_checked: stats.summary.receipts_checked,
      })
    }

    const current = await getMonthStats(month)

    return NextResponse.json({ success: true, month, current, trend })
  } catch (error: any) {
    console.error("price-benchmark/dashboard API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
