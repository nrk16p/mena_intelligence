export const dynamic = "force-dynamic"

/**
 * Interactive API reference, rendered by Scalar from the OpenAPI spec next door.
 *
 * Served as raw HTML from a route handler rather than a page so it skips the
 * app shell and the sign-in chrome — this URL is meant to be handed to another
 * team as-is. The content always follows the zod schemas; nothing to re-write
 * when a field changes.
 */
const HTML = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MENA Price Benchmark API</title>
    <link rel="icon" href="/logo.svg" />
    <style>body { margin: 0 }</style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/v1/price-benchmark/openapi.json"
      data-configuration='{"theme":"purple","hideDownloadButton":false}'></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.129/dist/browser/standalone.min.js"></script>
  </body>
</html>`

export async function GET() {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  })
}
