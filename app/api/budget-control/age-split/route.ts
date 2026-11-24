import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

// ปันงบซ่อมตามอายุรถ: reads the doc the mena-backend-services job `budget-age-split` writes every night
// (analytics.budget_age_split, one doc per branch × year). Nothing is computed here.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!session || !allowedGroups.includes("budget")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  try {
    const branch = req.nextUrl.searchParams.get("branch") || "ศลบ"
    const y = req.nextUrl.searchParams.get("year")
    const year = y && /^\d{4}$/.test(y)
      ? y
      : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(new Date())
    const doc = await (await clientPromise)
      .db("analytics")
      .collection("budget_age_split")
      .findOne({ _id: `${branch}|${year}` as unknown as never }, { maxTimeMS: 10000 })
    return NextResponse.json({ success: true, data: doc })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error"
    console.error("budget-control age-split API error:", error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
