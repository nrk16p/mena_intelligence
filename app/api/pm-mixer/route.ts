import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { computePmMixer, type PmMixerPayload } from "@/lib/pm-mixer"

// One request scans maint_header (ลาดกระบัง ~18k) + all PM tasks + the PM part
// lines + the truck master — ~50k small docs. That is a second of Mongo work for
// a page whose numbers only move once a night (the MR sync runs 02:00), so the
// result is cached per (year, monthTo) instead of recomputed per view.
const TTL_MS = 15 * 60 * 1000
const cache = new Map<string, { at: number; data: PmMixerPayload }>()

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const email = session?.user?.email ?? null
    if (!email) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    const { allowedGroups } = await getUserPermissions(email)
    if (!allowedGroups.includes("ops")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const now = new Date()
    const year = Number(searchParams.get("year")) || now.getFullYear()
    // Default to the last complete month so the YoY comparison never puts a
    // part-month against a whole one.
    const defaultMonthTo = Math.max(1, now.getMonth())
    const monthTo = Math.min(12, Math.max(1, Number(searchParams.get("monthTo")) || defaultMonthTo))

    const key = `${year}|${monthTo}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS && searchParams.get("refresh") !== "1") {
      return NextResponse.json({ success: true, cached: true, ...hit.data })
    }

    const client = await clientPromise
    const data = await computePmMixer(client.db("atms"), { year, monthTo, asOf: now })
    cache.set(key, { at: Date.now(), data })
    return NextResponse.json({ success: true, cached: false, ...data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    console.error("pm-mixer API error:", msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
