import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

// ควบคุมงบประมาณ: reads the snapshot the mena-backend-services job `budget-control` writes every hour
// (analytics.budget_control_snapshots, one doc per branch × month). Nothing is computed here.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!session || !allowedGroups.includes("budget")) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  try {
    const branch = req.nextUrl.searchParams.get("branch") || "ศลบ"
    const month = req.nextUrl.searchParams.get("month")
    const col = (await clientPromise).db("analytics").collection("budget_control_snapshots")
    const months = await col
      .find({ branch }, { projection: { _id: 0, month: 1 } })
      .sort({ month: -1 })
      .limit(24)
      .maxTimeMS(10000)
      .toArray()
    const pick = month && /^\d{4}-\d{2}$/.test(month) ? month : months[0]?.month
    const doc = pick
      ? await col.findOne({ _id: `${branch}|${pick}` as unknown as never }, { maxTimeMS: 10000 })
      : null
    return NextResponse.json({ success: true, months: months.map((m) => m.month), data: doc })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error"
    console.error("budget-control API error:", error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
