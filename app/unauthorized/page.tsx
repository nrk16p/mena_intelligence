"use client"

import Link from "next/link"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { Check, Copy, ShieldX } from "lucide-react"

export default function UnauthorizedPage() {
  const { data: session } = useSession()
  const [copied, setCopied] = useState(false)
  const email = session?.user?.email ?? ""
  const message = `ขอสิทธิ์เข้า Mena Intel · บัญชี ${email}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <ShieldX size={44} className="text-gray-400 dark:text-gray-500 mb-4" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">คุณยังไม่มีสิทธิ์เปิดหน้านี้</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 max-w-sm">
        คัดลอกข้อความด้านล่างส่งให้ผู้ดูแลระบบ แอดมินจะเพิ่มสิทธิ์ให้ตามแผนกของคุณ
      </p>
      <div className="mb-5 w-full max-w-md rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-[13px] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
        {message}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความขอสิทธิ์"}
        </button>
        <Link
          href="/"
          className="inline-flex min-h-[40px] items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5"
        >
          กลับหน้าแรก
        </Link>
      </div>
    </div>
  )
}
