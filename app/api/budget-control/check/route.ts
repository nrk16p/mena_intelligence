import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { AtmsError, readPr } from "@/lib/atms-doc"
import { checkPr, checkPrFleet, docKind, fleetBudgetFor, fleetLabel, hasFleetTotals, normPlate, type FleetBudgetFile, type PlateMapEntry, type Snapshot } from "@/lib/budget-check"
import fleetBudget from "@/app/budget-control/fleet-budget-2569.json"

// เช็กงบจากเลข PR: read one PR live from ATMS, compare with the budget-control snapshot (buy leg) and
// return the remark line to paste into the PR. WD numbers are recognised but not checked yet.
export const maxDuration = 30
export const dynamic = "force-dynamic"

const BRANCH = "ศลบ"
const fail = (status: number, error: string) => NextResponse.json({ success: false, error }, { status })

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)
  if (!session || !allowedGroups.includes("budget")) return fail(403, "Forbidden")

  const doc = docKind(req.nextUrl.searchParams.get("doc") ?? "")
  if (!doc) return fail(400, "เลขเอกสารไม่ถูกรูปแบบ ตัวอย่าง LBPR26110482")
  if (doc.kind === "WD") return fail(400, "ตอนนี้เช็กได้เฉพาะเลข PR ใบเบิก WD ยังไม่เปิดใช้")

  const started = Date.now()
  let pr
  try {
    pr = await readPr(doc.code)
  } catch (e) {
    const kind = e instanceof AtmsError ? e.kind : "unavailable"
    console.error(`budget-check ${doc.code}: ATMS ${kind} after ${Date.now() - started} ms`)
    if (kind === "not_configured") return fail(503, "หน้านี้ยังไม่ได้ตั้งค่าบัญชี ATMS ให้ผู้ดูแลระบบเพิ่ม ATMS_USERNAME และ ATMS_PASSWORD")
    return fail(502, "อ่าน ATMS ไม่ได้ตอนนี้ ลองกดใหม่อีกครั้ง")
  }
  if (!pr) return fail(404, `ไม่พบเลข ${doc.code} ใน ATMS`)
  const readAt = new Date().toISOString()

  try {
    const an = (await clientPromise).db("analytics")
    const month = pr.date.slice(0, 7)
    const snap = /^\d{4}-\d{2}$/.test(month)
      ? ((await an.collection("budget_control_snapshots").findOne({ _id: `${BRANCH}|${month}` as unknown as never }, { maxTimeMS: 5000 })) as unknown as Snapshot | null)
      : null
    const pl = normPlate(pr.plate)
    let plateMap: PlateMapEntry = null
    if (snap && pl && !snap.by_plate?.some((b) => normPlate(b.plate) === pl && b.group !== "อื่น")) {
      const m = await an.collection("fleet_plate_map").findOne({ plate_norm: pl }, { projection: { _id: 0, fleet: 1, owner: 1 }, maxTimeMS: 5000 })
      plateMap = m ? { fleet: String(m.fleet), owner: String(m.owner) } : null
    }
    const result = checkPr(pr, snap ? { ...snap, pending_prs: snap.pending_prs ?? [], by_plate: snap.by_plate ?? [], rows: snap.rows ?? [] } : null, plateMap)
    // งบรายฟลีท: ATMS fleet of the plate (vehiclemaster), its company plates, the fleet's monthly budget
    let fleet: { name: string; lines: ReturnType<typeof checkPrFleet>; reason: string | null } | null = null
    if (snap && result.group?.endsWith("บริษัท")) {
      const atms = (await clientPromise).db("atms").collection("vehiclemaster")
      const vm = await atms.findOne({ ทะเบียน: { $in: [...new Set([pr.plate, pl])] } }, { projection: { _id: 0, ฟลีท: 1 }, maxTimeMS: 5000 })
      const atmsFleet = vm ? String(vm["ฟลีท"] ?? "") : ""
      const groupId = result.group.split("|")[0]
      const name = fleetLabel(atmsFleet, groupId)
      const budget = atmsFleet ? fleetBudgetFor(fleetBudget as FleetBudgetFile, groupId, atmsFleet, month) : null
      if (!hasFleetTotals({ by_plate: snap.by_plate ?? [] })) {
        fleet = { name: atmsFleet ? name : "—", lines: [], reason: "ยอดงบรายฟลีทยังไม่พร้อม รอรอบคำนวณถัดไป (ทุกชั่วโมง 07:25–20:25)" }
      } else if (!budget) {
        fleet = { name: atmsFleet ? name : "—", lines: [], reason: atmsFleet ? `ยังไม่มีงบรายฟลีทของ ${name} เดือนนี้` : `ไม่พบฟลีทของทะเบียน ${pr.plate} ใน ATMS` }
      } else {
        const rows = await atms.find({ ฟลีท: atmsFleet, ประเภทรถร่วม: "รถมีนา" }, { projection: { _id: 0, ทะเบียน: 1 } }).limit(1000).maxTimeMS(5000).toArray()
        const plates = new Set(rows.map((r) => normPlate(r["ทะเบียน"])))
        plates.add(pl)
        const lines = checkPrFleet(pr, name, budget, plates, { by_plate: snap.by_plate ?? [], pending_prs: snap.pending_prs ?? [] },
          (snap.pending_prs ?? []) as unknown as { code: string; plate: string; split?: Record<string, number> }[])
        fleet = { name, lines, reason: lines.length ? null : "ใบนี้ไม่มีหมวดที่ตั้งงบรายฟลีทไว้" }
      }
    }
    console.log(`budget-check ${doc.code}: ${result.notice?.code ?? result.lines.map((l) => l.state).join(",")} in ${Date.now() - started} ms`)
    return NextResponse.json({
      success: true,
      kind: doc.kind,
      doc: { code: pr.code, date: pr.date, plate: pr.plate, department: pr.department, total: pr.total, by: pr.requester, note: pr.note, approved: pr.approved, levelsDone: pr.levelsDone },
      readAt,
      base: snap ? { month: snap.month, computedAt: snap.computed_at, cut: snap.cut, prAt: snap.sources?.pr_at ?? null } : null,
      ...result,
      fleet,
    })
  } catch (error: unknown) {
    console.error("budget-check error:", error instanceof Error ? error.message : error)
    return fail(500, "คำนวณงบไม่สำเร็จ ลองกดใหม่อีกครั้ง")
  }
}
