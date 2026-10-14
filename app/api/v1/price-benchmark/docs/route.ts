export const dynamic = "force-dynamic"

/**
 * Interactive API reference, rendered by Scalar from the OpenAPI spec next door.
 *
 * Served as raw HTML from a route handler rather than a page so it skips the
 * app shell and the sign-in chrome — this URL is meant to be handed to another
 * team as-is. The content always follows the zod schemas; nothing to re-write
 * when a field changes.
 *
 * The CDN bundle is pinned: an unpinned tag can ship a breaking rename and
 * leave this page blank. A fallback link renders if the script fails to load.
 */
const SCALAR_CDN = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.4/dist/browser/standalone.min.js"

const HTML = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MENA Price Benchmark API</title>
    <link rel="icon" href="/logo.svg" />
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif }
      #fallback { padding: 48px 24px; max-width: 640px; margin: 0 auto; line-height: 1.7; color: #1a1a1a }
      #fallback code { background: #f1f1f4; padding: 2px 6px; border-radius: 4px }
    </style>
  </head>
  <body>
    <div id="fallback">
      <h1>MENA Price Benchmark API</h1>
      <p>กำลังโหลดหน้าเอกสาร… ถ้าค้างอยู่ตรงนี้แปลว่าโหลดตัวแสดงผลจาก CDN ไม่ได้</p>
      <p>ใช้ spec ตรง ๆ ได้ที่ <a href="/api/v1/price-benchmark/openapi.json">/api/v1/price-benchmark/openapi.json</a>
      (เปิดใน Postman / Swagger Editor ได้เลย)</p>
      <p>หรือยิงทดสอบ: <code>POST /api/v1/price-benchmark/batch</code> body <code>{"codes":["LB10PM00097"]}</code></p>
    </div>
    <div id="app"></div>
    <script src="${SCALAR_CDN}"></script>
    <script>
      (function () {
        if (!window.Scalar || typeof window.Scalar.createApiReference !== "function") return
        document.getElementById("fallback").remove()
        window.Scalar.createApiReference("#app", {
          url: "/api/v1/price-benchmark/openapi.json",
          theme: "purple",
        })
      })()
    </script>
  </body>
</html>`

export async function GET() {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  })
}
