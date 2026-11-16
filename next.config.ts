import type { NextConfig } from "next";

/**
 * ย้าย API ไป mena-backend-services: ตั้ง BACKEND_API_URL (เช่น https://seahorse-app-o3p3o.ondigitalocean.app)
 * ใน Vercel แล้ว redeploy → /api/* วิ่งไป <BACKEND_API_URL>/api/v1/intel/* · ไม่ตั้ง = ใช้ route เดิมในแอป
 * ที่ยังอยู่ที่นี่: /api/auth/* (ล็อกอิน NextAuth) · /api/gps/etl-retry (ใช้ GITHUB_ETL_TOKEN ที่มีแค่ใน Vercel)
 * · /api/v1/price-benchmark/docs + openapi.json (หน้าเอกสาร API สาธารณะ)
 */
const backend = process.env.BACKEND_API_URL?.trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!backend) return [];
    return {
      beforeFiles: [
        {
          source:
            "/api/:path((?!(?:auth|gps/etl-retry|v1/price-benchmark/docs|v1/price-benchmark/openapi\\.json)(?:/|$)).+)",
          destination: `${backend}/api/v1/intel/:path`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
