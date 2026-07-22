import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import crypto from "crypto"

// DigitalOcean Spaces (S3-compatible) — เก็บไฟล์แนบ เช่น หลักฐานราคาสัญญา
let client: S3Client | null = null

function s3(): S3Client {
  if (client) return client
  const endpoint = process.env.DO_SPACES_ENDPOINT
  const key = process.env.DO_SPACES_KEY
  const secret = process.env.DO_SPACES_SECRET
  if (!endpoint || !key || !secret) throw new Error("Missing DO_SPACES_ENDPOINT / DO_SPACES_KEY / DO_SPACES_SECRET")
  client = new S3Client({
    region: process.env.DO_SPACES_REGION || "sgp1",
    endpoint,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  })
  return client
}

const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
}

export const ALLOWED_EVIDENCE_TYPES = Object.keys(EXT_BY_TYPE)
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024 // 10MB

function safeExt(contentType: string, originalName?: string): string {
  if (EXT_BY_TYPE[contentType]) return EXT_BY_TYPE[contentType]
  const m = (originalName || "").match(/\.[a-zA-Z0-9]{1,6}$/)
  return m ? m[0].toLowerCase() : ""
}

/**
 * อัปโหลดไฟล์ (buffer) ขึ้น DO Spaces (public-read) — คืน URL สาธารณะ
 * @param folder เช่น "contract-evidence"
 */
export async function uploadFile(
  buffer: Buffer,
  contentType: string,
  originalName: string,
  folder: string
): Promise<string> {
  const bucket = process.env.DO_SPACES_BUCKET
  if (!bucket) throw new Error("Missing DO_SPACES_BUCKET")
  const region = process.env.DO_SPACES_REGION || "sgp1"
  const prefix = (process.env.DO_SPACES_PREFIX || "").replace(/^\/+|\/+$/g, "")

  const name = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${safeExt(contentType, originalName)}`
  const key = [prefix, folder, name].filter(Boolean).join("/")

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
      ACL: "public-read",
    })
  )

  return `https://${bucket}.${region}.digitaloceanspaces.com/${key}`
}
