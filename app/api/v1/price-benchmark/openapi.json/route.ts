import { NextResponse } from "next/server"
import { buildOpenApiDocument } from "@/lib/api/price-benchmark-v1.openapi"

export const dynamic = "force-dynamic"

/** The spec itself — point Scalar/Swagger/an SDK generator at this URL. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  return NextResponse.json(buildOpenApiDocument(origin), {
    headers: { "Cache-Control": "public, max-age=300" },
  })
}
