import { NextResponse } from "next/server"
import clientPromise from "@/lib/mongo"
import { escapeRegex } from "@/lib/price-benchmark"

export const maxDuration = 30

/** Sort key from a "DD/MM/YYYY" Thai date string (0 when missing/unparseable). */
function dateKey(s: unknown): number {
  if (typeof s !== "string") return 0
  const [d, m, y] = s.split("/").map(Number)
  if (!y) return 0
  return y * 10000 + (m || 0) * 100 + (d || 0)
}

/**
 * Procurement lifecycle for one SKU (รหัสสินค้า): master record, creation event,
 * and every PR / PO it appears on — with received/outstanding status.
 *
 * Used by /price-benchmark to show "where is it" history for SKUs that have no
 * ราคากลาง yet (never received into stock). Read-only; joins master_data + atms.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")?.trim()
    if (!code) {
      return NextResponse.json({ success: false, error: "code is required" }, { status: 400 })
    }

    const client = await clientPromise
    const atms = client.db("atms")
    const md = client.db("master_data")

    // 1) SKU master — exact code, else a single unambiguous prefix match
    let master = await md.collection("atms_sku_master").findOne({ code }, { projection: { _id: 0 } })
    if (!master) {
      const cand = await md
        .collection("atms_sku_master")
        .find({ code: { $regex: `^${escapeRegex(code)}`, $options: "i" } }, { projection: { _id: 0 } })
        .limit(2)
        .toArray()
      if (cand.length === 1) master = cand[0]
    }
    const resolved = (master?.code as string) ?? code

    // 2) creation event (earliest)
    const created = await md
      .collection("atms_sku_add_events")
      .findOne({ code: resolved }, { projection: { _id: 0 }, sort: { addedAt: 1 } })

    // 3) purchase requests (items + their headers)
    const prItems = await atms
      .collection("purchase_request_items")
      .find({ sku: resolved }, { projection: { _id: 0 } })
      .toArray()
    const prCodes = [...new Set(prItems.map(i => i.pr_code))].filter(Boolean)
    const prHeaders = prCodes.length
      ? await atms
          .collection("purchase_requests")
          .find({ "ใบขอสั่งซื้อ (PR)": { $in: prCodes } }, { projection: { _id: 0 } })
          .toArray()
      : []
    const prHdr = new Map(prHeaders.map(h => [h["ใบขอสั่งซื้อ (PR)"], h]))
    const prs = prItems
      .map(i => {
        const h = (prHdr.get(i.pr_code) ?? {}) as Record<string, unknown>
        return {
          pr_code: i.pr_code,
          qty: i.amount ?? null,
          unit_price: i.unit_price ?? null,
          total: i.total ?? null,
          date: h["วันที่"] ?? null,
          requester: h["ผู้ขอซื้อ"] ?? null,
          approved: h["is approved"] ?? null,
          warehouse: i.warehouse ?? h["คลังสินค้า"] ?? null,
          dept: h["แผนก"] ?? null,
          plate: h["ทะเบียน"] ?? null,
          note: h["หมายเหตุ"] ?? null,
        }
      })
      .sort((a, b) => dateKey(b.date) - dateKey(a.date) || String(b.pr_code).localeCompare(String(a.pr_code)))

    // 4) purchase orders (items + their headers)
    const poItems = await atms
      .collection("purchase_order_items")
      .find({ sku: resolved }, { projection: { _id: 0 } })
      .toArray()
    const poCodes = [...new Set(poItems.map(i => i.po_code))].filter(Boolean)
    const poHeaders = poCodes.length
      ? await atms
          .collection("purchase_orders")
          .find({ รหัส: { $in: poCodes } }, { projection: { _id: 0 } })
          .toArray()
      : []
    const poHdr = new Map(poHeaders.map(h => [h["รหัส"], h]))
    const pos = poItems
      .map(i => {
        const h = (poHdr.get(i.po_code) ?? {}) as Record<string, unknown>
        return {
          po_code: i.po_code,
          qty: i.amount ?? null,
          unit_price: i.unit_price ?? null,
          total: i.total ?? null,
          received: i.received ?? null,
          outstanding: i.outstanding ?? null,
          date: h["วันที่"] ?? null,
          due: h["กำหนดส่งสินค้า"] ?? null,
          supplier: h["ซัพพลายเออร์"] ?? null,
          status: h["สถานะการรับสินค้า"] ?? null,
          ap_term: h["ap term"] ?? null,
          dept: h["แผนก"] ?? null,
        }
      })
      .sort((a, b) => dateKey(b.date) - dateKey(a.date) || String(b.po_code).localeCompare(String(a.po_code)))

    return NextResponse.json({
      success: true,
      code: resolved,
      master: master
        ? {
            skuPk: master.skuPk ?? null,
            name: master.name ?? null,
            group: master.group ?? null,
            warehouse: master.warehouse ?? null,
            brand: master.brand ?? null,
            unit: master.unit ?? null,
            oracle_code: master.oracleCode ?? null,
          }
        : null,
      created: created
        ? {
            added_at_text: created.addedAtText ?? null,
            added_at: created.addedAt ?? null,
            username: created.username ?? null,
          }
        : null,
      prs,
      pos,
    })
  } catch (error: any) {
    console.error("price-benchmark/sku-history API error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
