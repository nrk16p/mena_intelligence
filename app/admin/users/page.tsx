"use client"

import { useEffect, useState } from "react"

type AppUser = {
  _id: string
  email: string
  name: string
  image: string
  group_id: string | null
  group_name: string | null
  last_seen: string
}

type Group = {
  _id: string
  name: string
  is_admin: boolean
  access: string[]
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [pendingGroups, setPendingGroups] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/groups").then((r) => r.json()),
    ]).then(([u, g]) => {
      setUsers(u.data ?? [])
      setGroups(g.data ?? [])
      const initial: Record<string, string> = {}
      for (const user of u.data ?? []) {
        initial[user.email] = user.group_id ?? ""
      }
      setPendingGroups(initial)
    })
  }, [])

  async function saveUser(email: string) {
    setSaving(email)
    const group_id = pendingGroups[email] || null
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, group_id }),
    })
    // Refresh users list
    const res = await fetch("/api/admin/users").then((r) => r.json())
    setUsers(res.data ?? [])
    setSaving(null)
  }

  const unassigned = users.filter((u) => !u.group_id)
  const assigned = users.filter((u) => u.group_id)

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">จัดการผู้ใช้งาน</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          กำหนดกลุ่มสิทธิ์ให้กับแต่ละผู้ใช้
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/6">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ผู้ใช้</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">เข้าใช้ล่าสุด</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">กลุ่มสิทธิ์</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {[...unassigned, ...assigned].map((user) => (
              <tr key={user.email} className="border-b border-gray-50 dark:border-white/4 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold">
                        {user.name?.[0] ?? "?"}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                  {user.last_seen ? new Date(user.last_seen).toLocaleDateString("th-TH") : "-"}
                </td>
                <td className="px-4 py-3">
                  {!user.group_id && (
                    <span className="inline-block mb-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                      ยังไม่ได้กำหนด
                    </span>
                  )}
                  <select
                    value={pendingGroups[user.email] ?? ""}
                    onChange={(e) =>
                      setPendingGroups((p) => ({ ...p, [user.email]: e.target.value }))
                    }
                    className="block w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">— ไม่มีกลุ่ม —</option>
                    {groups.map((g) => (
                      <option key={String(g._id)} value={String(g._id)}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => saveUser(user.email)}
                    disabled={saving === user.email}
                    className="rounded-lg bg-gray-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-40 transition-opacity"
                  >
                    {saving === user.email ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  ยังไม่มีผู้ใช้ลงทะเบียน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

