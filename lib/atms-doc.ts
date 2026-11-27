// อ่านเอกสาร PR หนึ่งใบจาก ATMS ตอนกด (ATMS ไม่มี API: ล็อกอินแล้วอ่านหน้า HTML).
// Read-only by construction: the only POST is the login form, and GETs go through an allow-list of
// list/view pages. ATMS pages also link to approve/edit/delete; those paths are refused here.
// Account: env ATMS_USERNAME / ATMS_PASSWORD. Never log HTML, cookies or the password.
import type { PrDoc } from "./budget-check"

const BASE = "https://www.mena-atms.com"
const LOGIN = "/account/user/login"
const ALLOWED = [/^\/inv\/purchase\.request\/index$/, /^\/inv\/purchase\.request\/view\/id\/\d+$/, /^\/inv\/withdraw\/index$/]
const TIMEOUT_MS = 15_000
const SESSION_MS = 20 * 60_000

export class AtmsError extends Error {
  constructor(public kind: "not_configured" | "login_failed" | "unavailable" | "refused", message: string) {
    super(message)
  }
}

export function assertAllowed(path: string) {
  if (!ALLOWED.some((re) => re.test(path))) throw new AtmsError("refused", `path not allowed: ${path}`)
}

// ---------- HTML helpers (pure, tested with hand-made HTML) ----------

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " }
export const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENT[e])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[\s ]+/g, " ")
    .trim()

type Cell = { text: string; html: string }
type Table = { heads: string[]; rows: Cell[][] }
export function parseTables(html: string): Table[] {
  const out: Table[] = []
  for (const t of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const heads = [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => textOf(m[1]))
    const rows: Cell[][] = []
    for (const tr of t.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => ({ text: textOf(m[1]), html: m[1] }))
      if (cells.length) rows.push(cells)
    }
    out.push({ heads, rows })
  }
  return out
}

export const isLoginPage = (html: string) => /name=["']password["']/i.test(html) && /account\/user\/login/i.test(html)
const num = (s: string) => {
  const n = Number(String(s).replace(/,/g, "").trim())
  return Number.isFinite(n) ? n : 0
}
const iso = (dmy: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(dmy.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ""
}

/** The PR list row for `code` (search result page), or null when ATMS has no such PR. */
export function parsePrListRow(html: string, code: string): (Omit<PrDoc, "items"> & { id: string }) | null {
  const t = parseTables(html).find((x) => x.heads.includes("ใบขอสั่งซื้อ (PR)") && x.heads.includes("is approved"))
  if (!t) return null
  const col = (name: string) => t.heads.indexOf(name)
  for (const cells of t.rows) {
    const get = (name: string) => cells[col(name)]?.text ?? ""
    if (get("ใบขอสั่งซื้อ (PR)") !== code) continue
    const link = cells.map((c) => /purchase\.request\/view\/id\/(\d+)/.exec(c.html)?.[1]).find(Boolean)
    if (!link) return null
    const approvedHtml = cells[col("is approved")]?.html ?? ""
    return {
      id: link,
      code,
      date: iso(get("วันที่")),
      department: get("แผนก"),
      plate: get("ทะเบียน"),
      total: num(get("รวม")),
      requester: get("ผู้ขอซื้อ"),
      note: get("หมายเหตุ"),
      approved: /check-square/.test(approvedHtml) && !/x-square/.test(approvedHtml),
      levelsDone: [1, 2, 3, 4].filter((l) => get(`ผู้อนุมัติระดับที่ ${l}`)).length,
    }
  }
  return null
}

/** Item lines of a PR view page: product group and line total. null = no item table on the page (layout changed). */
export function parsePrItems(html: string): PrDoc["items"] | null {
  const t = parseTables(html).find((x) => x.heads.includes("กลุ่มสินค้า") && x.heads.includes("รวม") && x.heads.includes("amount"))
  if (!t) return null
  const g = t.heads.indexOf("กลุ่มสินค้า"), tot = t.heads.indexOf("รวม")
  return t.rows
    .filter((cells) => cells.length >= t.heads.length - 1 && !/grand total/i.test(cells.map((c) => c.text).join(" ")))
    .map((cells) => ({ group: cells[g]?.text || null, total: num(cells[tot]?.text ?? "") }))
}

// ---------- network ----------

type Fetch = typeof fetch
let session: { cookie: string; at: number } | null = null
let queue: Promise<unknown> = Promise.resolve()
let failedAt = 0 // a refused login is remembered for a minute so repeated clicks cannot lock the account
const FAIL_MS = 60_000

function cookiesFrom(res: Response, jar: Map<string, string>) {
  const list = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  for (const c of list) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    if (i <= 0) continue
    const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim()
    if (!v || v === "deleted" || /max-age=0/i.test(c)) jar.delete(k)
    else jar.set(k, v)
  }
}
const jarString = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ")

async function call(f: Fetch, url: string, init: RequestInit) {
  try {
    return await f(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
  } catch {
    throw new AtmsError("unavailable", "ATMS did not answer")
  }
}

async function login(f: Fetch): Promise<string> {
  const user = process.env.ATMS_USERNAME, pass = process.env.ATMS_PASSWORD
  if (!user || !pass) throw new AtmsError("not_configured", "ATMS_USERNAME / ATMS_PASSWORD not set")
  const jar = new Map<string, string>()
  const seed = await call(f, BASE + LOGIN, { method: "GET" })
  cookiesFrom(seed, jar)
  await seed.body?.cancel()
  const res = await call(f, BASE + LOGIN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jarString(jar) },
    body: new URLSearchParams({ username: user, password: pass, submit: "login", next: "" }).toString(),
  })
  cookiesFrom(res, jar)
  await res.body?.cancel()
  const check = await call(f, `${BASE}/inv/purchase.request/index`, { method: "GET", headers: { cookie: jarString(jar) } })
  const loc = check.headers.get("location") ?? ""
  if (check.status >= 300 && check.status < 400) await check.body?.cancel()
  if (check.status >= 300 && check.status < 400 && loc.includes("account/user/login")) throw new AtmsError("login_failed", "ATMS login refused")
  if (check.status === 200 && isLoginPage(await check.text())) throw new AtmsError("login_failed", "ATMS login refused")
  return jarString(jar)
}

/** GET one allow-listed ATMS page as text, logging in (or once more, if the session died) as needed. */
export async function atmsGet(path: string, params: Record<string, string> = {}, f: Fetch = fetch): Promise<string> {
  assertAllowed(path)
  const run = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!session || Date.now() - session.at > SESSION_MS) {
        if (Date.now() - failedAt < FAIL_MS) throw new AtmsError("login_failed", "ATMS login refused a moment ago")
        try {
          session = { cookie: await login(f), at: Date.now() }
        } catch (e) {
          if (e instanceof AtmsError && e.kind === "login_failed") failedAt = Date.now()
          throw e
        }
      }
      const qs = new URLSearchParams(params).toString()
      const res = await call(f, `${BASE}${path}${qs ? `?${qs}` : ""}`, { method: "GET", headers: { cookie: session.cookie } })
      const loc = res.headers.get("location") ?? ""
      const html = res.status === 200 ? await res.text() : ""
      if (res.status !== 200) await res.body?.cancel()
      if ((res.status >= 300 && res.status < 400 && loc.includes("account/user/login")) || (res.status === 200 && isLoginPage(html))) {
        session = null
        continue
      }
      if (res.status !== 200) throw new AtmsError("unavailable", `ATMS answered ${res.status}`)
      return html
    }
    throw new AtmsError("login_failed", "ATMS session could not be kept")
  }
  const p = queue.then(run, run) // one ATMS request at a time per instance
  queue = p.catch(() => undefined)
  return p
}

/** One PR read live from ATMS: list row (header + approval) then its view page (items). null = not found. */
export async function readPr(code: string, f: Fetch = fetch): Promise<PrDoc | null> {
  const list = await atmsGet("/inv/purchase.request/index", { code, submit: "ค้นหา" }, f)
  const row = parsePrListRow(list, code)
  if (!row) return null
  const view = await atmsGet(`/inv/purchase.request/view/id/${row.id}`, {}, f)
  const head: Omit<PrDoc, "items"> = { code: row.code, date: row.date, department: row.department, plate: row.plate, total: row.total,
    requester: row.requester, note: row.note, approved: row.approved, levelsDone: row.levelsDone }
  const items = parsePrItems(view)
  if (items === null) throw new AtmsError("unavailable", "PR view page has no item table")
  return { ...head, items }
}

/** test hook */
export function _resetAtmsSession() {
  session = null
  failedAt = 0
  queue = Promise.resolve()
}
