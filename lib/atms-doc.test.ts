import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _resetAtmsSession, assertAllowed, atmsGet, isLoginPage, parsePrItems, parsePrListRow, readPr } from "./atms-doc"

// Hand-made HTML that follows the shape of ATMS pages (checked 27/11/69). No real names, plates or remarks:
// this repository is public.
const HEADS = ["ใบขอสั่งซื้อ (PR)", "คลังสินค้า", "แผนก", "ทะเบียน", "วันที่", "รวม", "ผู้ขอซื้อ", "หมายเหตุ", "is approved",
  "ผู้อนุมัติระดับที่ 1", "ผู้อนุมัติระดับที่ 2", "ผู้อนุมัติระดับที่ 3", "ผู้อนุมัติระดับที่ 4", ""]
const listPage = (rows: string[][], icon = "x-square-fill") => `<html><body><form action="/inv/purchase.request/index"></form>
<table class="list"><thead><tr>${HEADS.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c, i) => (i === 8 ? `<td class="align-center"><img src="/assets/js/widget/bootstrap/bootstrap-icons/${icon}.svg"/></td>` : `<td>${c}</td>`)).join("")}</tr>`).join("\n")}
</tbody></table></body></html>`
const ROW = ["TSPR26110001", "คลังทดสอบ", "ลาดกระบัง : ยานยนต์ (ศลบ)", "สบ.99-0001", "25/11/2026", "45,000.00", "tester.a",
  "MR ทดสอบ &amp; หมายเหตุ", "", "tester.b 25/11/2026 10:00", "", "", "",
  `<a href="/inv/purchase.request/view/id/12345">แสดง</a> <a href="/inv/purchase.order/edit/id/1">บันทึก</a>`]
const viewPage = `<html><body><table><tr><th>คลังสินค้า</th><th>กลุ่มสินค้า</th><th>สินค้า</th><th>amount</th><th>unit price</th><th>รวม</th><th>หมายเหตุ</th><th></th></tr>
<tr><td>คลังทดสอบ</td><td>ระบบเกียร์</td><td>XX00TEST001 : ชิ้นส่วน</td><td>1.00</td><td>40,000.00</td><td>40,000.00</td><td></td><td></td></tr>
<tr><td>คลังทดสอบ</td><td>ยางรถยนต์</td><td>XX00TEST002 : ยาง</td><td>1.00</td><td>5,000.00</td><td>5,000.00</td><td></td><td></td></tr>
<tr><td colspan="5">grand total</td><td>45,000.00</td></tr></table>
<a href="/inv/purchase.request/unapprove/id/12345">ไม่อนุมัติ 1</a></body></html>`
const loginPage = `<html><form action="/account/user/login" method="post"><input name="username"><input type="password" name="password"></form></html>`

describe("parsePrListRow", () => {
  it("reads the header fields and the view id", () => {
    const r = parsePrListRow(listPage([ROW]), "TSPR26110001")
    expect(r).toEqual({
      id: "12345", code: "TSPR26110001", date: "2026-11-25", department: "ลาดกระบัง : ยานยนต์ (ศลบ)", plate: "สบ.99-0001",
      total: 45_000, requester: "tester.a", note: "MR ทดสอบ & หมายเหตุ", approved: false, levelsDone: 1,
    })
  })
  it("reads the approved icon", () => {
    expect(parsePrListRow(listPage([ROW], "check-square"), "TSPR26110001")?.approved).toBe(true)
  })
  it("returns null when the search found nothing or another code", () => {
    expect(parsePrListRow(listPage([]), "TSPR26110001")).toBeNull()
    expect(parsePrListRow(listPage([ROW]), "TSPR26110002")).toBeNull()
  })
})

describe("parsePrItems", () => {
  it("reads group and line total, skips grand total", () => {
    expect(parsePrItems(viewPage)).toEqual([{ group: "ระบบเกียร์", total: 40_000 }, { group: "ยางรถยนต์", total: 5_000 }])
  })
})

describe("guards", () => {
  it("recognises the login page", () => {
    expect(isLoginPage(loginPage)).toBe(true)
    expect(isLoginPage(viewPage)).toBe(false)
  })
  it("refuses anything outside the read-only allow-list", () => {
    expect(() => assertAllowed("/inv/withdraw/approve/id/1")).toThrow(/not allowed/)
    expect(() => assertAllowed("/inv/purchase.request/unapprove/id/12345")).toThrow(/not allowed/)
    expect(() => assertAllowed("/inv/purchase.request/view/id/1/../../delete")).toThrow(/not allowed/)
    expect(() => assertAllowed("/inv/purchase.request/view/id/12345")).not.toThrow()
  })
})

describe("readPr with a fake ATMS", () => {
  const env = { ...process.env }
  beforeEach(() => {
    _resetAtmsSession()
    process.env.ATMS_USERNAME = "u"
    process.env.ATMS_PASSWORD = "p"
  })
  afterEach(() => {
    process.env = { ...env }
  })
  const res = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers })
  const fake = (handler: (url: string, init: RequestInit) => Response) => {
    const calls: { url: string; method: string }[] = []
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" })
      return handler(String(url), init ?? {})
    }) as unknown as typeof fetch
    return { f, calls }
  }

  it("logs in once, reads list then view, and only POSTs the login form", async () => {
    const { f, calls } = fake((url, init) => {
      if (url.endsWith("/account/user/login")) return res("", init.method === "POST" ? 302 : 200, { "set-cookie": "PHPSESSID=abc; path=/", location: "/" })
      if (url.includes("/inv/purchase.request/index?")) return res(listPage([ROW]))
      if (url.endsWith("/inv/purchase.request/index")) return res("<html>ok</html>")
      if (url.endsWith("/view/id/12345")) return res(viewPage)
      return res("", 404)
    })
    const pr = await readPr("TSPR26110001", f)
    expect(pr?.items).toHaveLength(2)
    expect(pr?.total).toBe(45_000)
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["https://www.mena-atms.com/account/user/login"])
    expect(calls.some((c) => /approve|edit|delete/.test(c.url))).toBe(false)
  })

  it("returns null when ATMS has no such PR", async () => {
    const { f } = fake((url) => (url.includes("index?") ? res(listPage([])) : res("<html>ok</html>", 200, { "set-cookie": "PHPSESSID=abc" })))
    expect(await readPr("TSPR26110009", f)).toBeNull()
  })

  it("logs in again once when the session died", async () => {
    let logins = 0, listHits = 0
    const { f } = fake((url, init) => {
      if (url.endsWith("/account/user/login")) { if (init.method === "POST") logins++; return res("", 200, { "set-cookie": `PHPSESSID=s${logins}` }) }
      if (url.endsWith("/inv/purchase.request/index")) return res("<html>ok</html>")
      if (url.includes("index?")) { listHits++; return listHits === 1 ? res(loginPage) : res(listPage([])) }
      return res("", 404)
    })
    await atmsGet("/inv/purchase.request/index", { code: "x" }, f)
    expect(logins).toBe(2)
  })

  it("says not configured without an account", async () => {
    delete process.env.ATMS_USERNAME
    const { f } = fake(() => res(""))
    await expect(readPr("TSPR26110001", f)).rejects.toMatchObject({ kind: "not_configured" })
  })

  it("says login failed when ATMS keeps showing the login page", async () => {
    const { f } = fake((url) => (url.endsWith("/inv/purchase.request/index") ? res(loginPage) : res("", 200, { "set-cookie": "PHPSESSID=x" })))
    await expect(readPr("TSPR26110001", f)).rejects.toMatchObject({ kind: "login_failed" })
  })
})
