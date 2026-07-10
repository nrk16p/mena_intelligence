import { NextResponse } from "next/server"
import { getAvailableMonths } from "@/lib/price-benchmark"

export const maxDuration = 30

/** Months that already have a benchmark snapshot — used to seed the overpriced date range. */
export async function GET() {
  try {
    const { months, min, max } = await getAvailableMonths()
    return NextResponse.json({ success: true, months, min, max })
  } catch (error: any) {
    console.error("price-benchmark/months API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
