import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"

function detectType(q: string): "WD" | "DD" | "MR" | "PO" | "PR" | "unknown" {
  const u = q.toUpperCase()
  if (u.includes("WD")) return "WD"
  if (u.includes("DD")) return "DD"
  if (u.includes("MR")) return "MR"
  if (/PO\d/.test(u)) return "PO"
  if (/PR\d/.test(u)) return "PR"
  return "unknown"
}

// Build MR summary + WD list from repair-analysis rows
function summariseMR(rows: Record<string, unknown>[]) {
  if (!rows.length) return null
  const first = rows[0]
  return {
    request_id:        first.request_id,
    request_code:      first.request_code,
    reported_at:       first.reported_at,
    branch:            first.branch,
    plate_no:          first.plate_no,
    owner_type:        first.owner_type,
    mechanic:          first.mechanic,
    mileage_at_report: first.mileage_at_report,
    step:              first.step,
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") || "").trim()
    if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 })

    const type = detectType(q)
    const client = await clientPromise
    const db = client.db("atms")

    const repairCol   = db.collection("repair-analysis")
    const ddCol       = db.collection("deposit_header")
    const itemsCol    = db.collection("deposit_items")

    let result: Record<string, unknown> = { query: q, type }

    // ── DD ───────────────────────────────────────────────────────────────────
    if (type === "DD") {
      const dd = await ddCol.findOne({ deposit_code: q }, { projection: { _id: 0 } })
      const items = dd
        ? await itemsCol.find({ deposit_id: (dd as Record<string,unknown>).deposit_id }, { projection: { _id: 0 } }).toArray()
        : []

      let mr = null
      let mr_parts: unknown[] = []
      const wd_code = (dd as Record<string,unknown>)?.withdraw_ref as string | null
      if (wd_code) {
        const rows = await repairCol.find({ requisition_no: wd_code }, { projection: { _id: 0 } }).toArray()
        mr = summariseMR(rows as Record<string, unknown>[])
        mr_parts = rows
      }
      result = { ...result, dd, dd_items: items, mr, mr_parts, related_wds: wd_code ? [wd_code] : [] }
    }

    // ── WD ───────────────────────────────────────────────────────────────────
    else if (type === "WD") {
      // Repair-analysis rows for this WD
      const raRows = await repairCol.find({ requisition_no: q }, { projection: { _id: 0 } }).toArray()
      const mr = summariseMR(raRows as Record<string, unknown>[])

      // DD(s) that reference this WD (stock returns)
      const dds = await ddCol.find({ withdraw_ref: q }, { projection: { _id: 0 } }).toArray()
      const dep_ids = (dds as Record<string,unknown>[]).map(d => d.deposit_id)
      const dd_items = dep_ids.length
        ? await itemsCol.find({ deposit_id: { $in: dep_ids } }, { projection: { _id: 0 } }).toArray()
        : []

      result = { ...result, mr, mr_parts: raRows, dds, dd_items }
    }

    // ── MR ───────────────────────────────────────────────────────────────────
    else if (type === "MR") {
      const raRows = await repairCol.find({ request_code: q }, { projection: { _id: 0 } }).toArray()
      const mr = summariseMR(raRows as Record<string, unknown>[])

      // Unique WD codes for this MR
      const wds = [...new Set(
        (raRows as Record<string,unknown>[])
          .map(r => r.requisition_no as string)
          .filter(Boolean)
      )]

      // For each WD, find return DDs
      const dds = wds.length
        ? await ddCol.find({ withdraw_ref: { $in: wds } }, { projection: { _id: 0 } }).toArray()
        : []
      const dep_ids = (dds as Record<string,unknown>[]).map(d => d.deposit_id)
      const dd_items = dep_ids.length
        ? await itemsCol.find({ deposit_id: { $in: dep_ids } }, { projection: { _id: 0 } }).toArray()
        : []

      result = { ...result, mr, mr_parts: raRows, wds, dds, dd_items }
    }

    // ── PO ───────────────────────────────────────────────────────────────────
    else if (type === "PO") {
      const dds = await ddCol.find({ purchase_order: q }, { projection: { _id: 0 } }).toArray()
      const dep_ids = (dds as Record<string,unknown>[]).map(d => d.deposit_id)
      const dd_items = dep_ids.length
        ? await itemsCol.find({ deposit_id: { $in: dep_ids } }, { projection: { _id: 0 } }).toArray()
        : []

      // Check if purchase_order collection exists
      const hasPoCol = (await db.listCollections({ name: "purchase_order" }).toArray()).length > 0
      const po = hasPoCol
        ? await db.collection("purchase_order").findOne({ po_code: q }, { projection: { _id: 0 } })
        : null

      result = { ...result, po, dds, dd_items, po_code: q }
    }

    // ── PR ───────────────────────────────────────────────────────────────────
    else if (type === "PR") {
      const hasPoCol = (await db.listCollections({ name: "purchase_order" }).toArray()).length > 0
      if (hasPoCol) {
        const pos = await db.collection("purchase_order").find({ pr_code: q }, { projection: { _id: 0 } }).toArray()
        const po_codes = (pos as Record<string,unknown>[]).map(p => p.po_code as string)
        const dds = po_codes.length
          ? await ddCol.find({ purchase_order: { $in: po_codes } }, { projection: { _id: 0 } }).toArray()
          : []
        const dep_ids = (dds as Record<string,unknown>[]).map(d => d.deposit_id)
        const dd_items = dep_ids.length
          ? await itemsCol.find({ deposit_id: { $in: dep_ids } }, { projection: { _id: 0 } }).toArray()
          : []
        result = { ...result, pos, dds, dd_items, pr_code: q }
      } else {
        result = { ...result, pos: [], dds: [], pr_code: q, note: "purchase_order collection not yet indexed" }
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
