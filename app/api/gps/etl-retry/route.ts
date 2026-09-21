import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GitHub PAT ที่ใช้สั่งรัน workflow ของ repo menatransport/mongodb-gps
 *
 * ตั้งค่าเป็น env `GITHUB_ETL_TOKEN` เท่านั้น — repo นี้เป็น public ถ้าฝัง token ไว้ในโค้ด
 * GitHub secret scanning จะเห็นตอน push แล้วเพิกถอนให้อัตโนมัติ ปุ่มจะเริ่มตอบ 401 เงียบๆ
 *   · เครื่อง dev  → .env.local (อยู่ใน .gitignore แล้ว)
 *   · production  → Vercel → Settings → Environment Variables
 *
 * สิทธิ์ที่ token ต้องมี: Fine-grained PAT → repo mongodb-gps → Actions: Read and write
 * (สิทธิ์ read อย่างเดียวจะยิง dispatch ไม่ผ่าน GitHub ตอบ 403 actions=write)
 */
const TOKEN = process.env.GITHUB_ETL_TOKEN || ""
const REPO = process.env.GITHUB_ETL_REPO || "menatransport/mongodb-gps"
const REF = "main"

/**
 * source ใน gps.etl_log ตรงกับชื่อไฟล์ workflow แบบ 1:1 — เก็บเป็น allow-list ไว้
 * แทนการต่อสตริงตรงๆ เพื่อไม่ให้ค่าที่ผู้ใช้ส่งมากลายเป็นชื่อไฟล์อะไรก็ได้
 */
const WORKFLOW: Record<string, string> = {
  songdee:      "gps_daily_songdee.yml",
  hino:         "gps_daily_hino.yml",
  thaitracking: "gps_daily_thaitracking.yml",
  dtc:          "gps_daily_dtc.yml",
  terminus:     "gps_daily_terminus.yml",
  besttech:     "gps_daily_besttech.yml",
  nostra:       "gps_daily_nostra.yml",
  cartrack:     "gps_daily_cartrack.yml",
}

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  Authorization: `Bearer ${TOKEN}`,
}

/** วันนี้ตามเวลาไทยในรูป YYYY-MM-DD — en-CA เป็น locale ที่ให้รูปแบบนี้ตรงๆ */
const bkkToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

const fail = (status: number, message: string) =>
  NextResponse.json({ success: false, message }, { status })

/** แปล HTTP status ของ GitHub เป็นสาเหตุที่คนอ่านแล้วรู้ว่าต้องไปแก้ตรงไหน */
function githubError(status: number, body: string) {
  if (status === 401) return "GitHub token ไม่ถูกต้องหรือหมดอายุ — ต้องออก PAT ใหม่"
  if (status === 403) return "GitHub ปฏิเสธคำขอ — ตรวจสิทธิ์ Actions: Read and write ของ PAT"
  if (status === 404) return "ไม่พบ workflow หรือ PAT มองไม่เห็น repo นี้"
  if (status === 422) return "GitHub ไม่รับพารามิเตอร์ที่ส่งไป (branch หรือ input ไม่ตรง)"
  return `GitHub ตอบกลับ ${status}: ${body.slice(0, 200)}`
}

/**
 * POST /api/gps/etl-retry  { source, dateKey }
 * → สั่ง workflow_dispatch ของ source นั้นให้ดึงข้อมูลวันที่ระบุใหม่อีกครั้ง
 *
 * เฉพาะ admin เท่านั้น — การกดปุ่มนี้คือการรัน job จริงที่ยิง API ของผู้ให้บริการ GPS
 * (DTC จำกัด 3 requests/นาที/IP และอาจล็อกบัญชีถ้าเกินโควตา) จึงไม่เปิดกว้างกว่านี้
 *
 * ก่อนยิงจะเช็คว่า workflow ตัวเดิมกำลังรันอยู่หรือไม่ ถ้ารันอยู่ตอบ 409 แทนการต่อคิวซ้อน —
 * ฝั่ง workflow ตั้ง concurrency ไว้แล้วก็จริง แต่การบอกผู้ใช้ตรงๆ ดีกว่าปล่อยให้กดรัวแล้วเงียบ
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin) return fail(403, "ต้องเป็นผู้ดูแลระบบจึงจะสั่งดึงข้อมูลใหม่ได้")

  if (!TOKEN) return fail(500, "ยังไม่ได้ตั้งค่า GitHub token สำหรับสั่งรัน ETL")

  let body: { source?: unknown; dateKey?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, "รูปแบบคำขอไม่ถูกต้อง")
  }

  const source = String(body.source ?? "")
  const dateKey = String(body.dateKey ?? "")

  const workflow = WORKFLOW[source]
  if (!workflow) return fail(400, `ไม่รู้จักผู้ให้บริการ "${source}"`)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return fail(400, "วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD")
  if (dateKey > bkkToday()) return fail(400, "ดึงข้อมูลของวันในอนาคตไม่ได้")

  const base = `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}`
  const runsUrl = `https://github.com/${REPO}/actions/workflows/${workflow}`

  try {
    // รอบที่ยังไม่จบจะอยู่ต้นลิสต์เสมอ (GitHub เรียงใหม่สุดก่อน) — ดู 10 รอบล่าสุดก็พอ
    const running = await fetch(`${base}/runs?per_page=10`, {
      headers: GH_HEADERS,
      cache: "no-store",
    })
    if (!running.ok) return fail(502, githubError(running.status, await running.text()))

    const list = (await running.json()) as {
      workflow_runs?: { status?: string; html_url?: string }[]
    }
    const active = list.workflow_runs?.find(
      (r) => r.status === "queued" || r.status === "in_progress" || r.status === "waiting"
    )
    if (active) {
      return NextResponse.json(
        {
          success: false,
          message: `${source} กำลังรันอยู่ รอให้รอบปัจจุบันจบก่อน`,
          runsUrl: active.html_url ?? runsUrl,
        },
        { status: 409 }
      )
    }

    const dispatch = await fetch(`${base}/dispatches`, {
      method: "POST",
      headers: { ...GH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ ref: REF, inputs: { date: dateKey } }),
      cache: "no-store",
    })
    // dispatch สำเร็จคืน 204 ไม่มี body และ "ไม่คืน run id" — ส่งลิงก์หน้า runs ไปแทน
    if (!dispatch.ok) return fail(502, githubError(dispatch.status, await dispatch.text()))

    return NextResponse.json({ success: true, source, dateKey, runsUrl }, { status: 202 })
  } catch (error) {
    console.error("gps/etl-retry API error:", error)
    return fail(500, error instanceof Error ? error.message : "Internal Server Error")
  }
}
