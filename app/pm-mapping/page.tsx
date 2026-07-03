"use client"

import React, { useEffect, useMemo, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type PmClass = "PM1" | "PM2" | "PM3" | null

type Item = {
  รหัสสินค้า:  string
  ชื่อสินค้า:  string
  กลุ่มสินค้า: string
  total_cost:   number
  records:      number
  pm_class:     PmClass
  updated_by:   string | null
}

type GroupRow = {
  group:      string
  items:      Item[]
  total_cost: number
  mapped:     number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PM_OPTIONS: Exclude<PmClass, null>[] = ["PM1", "PM2", "PM3"]

const PM_STYLE: Record<string, { active: string; badge: string }> = {
  PM1: { active: "bg-blue-600 text-white border-blue-600",     badge: "bg-blue-50 text-blue-600 border-blue-200" },
  PM2: { active: "bg-amber-500 text-white border-amber-500",   badge: "bg-amber-50 text-amber-600 border-amber-200" },
  PM3: { active: "bg-violet-600 text-white border-violet-600", badge: "bg-violet-50 text-violet-600 border-violet-200" },
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 })

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PmMappingPage() {
  const [items, setItems]     = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // pending edits: code → new pm_class (null = clear)
  const [drafts, setDrafts]   = useState<Record<string, PmClass>>({})
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const [search, setSearch]             = useState("")
  const [unmappedOnly, setUnmappedOnly] = useState(false)
  const [collapsed, setCollapsed]       = useState<Set<string>>(new Set())

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/pm-mapping")
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "Load failed")
      setItems(json.data)
    } catch (e: any) {
      setError(e.message || "Load failed")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const effectiveClass = (it: Item): PmClass =>
    Object.prototype.hasOwnProperty.call(drafts, it.รหัสสินค้า) ? drafts[it.รหัสสินค้า] : it.pm_class

  const mappedCount = useMemo(
    () => items.filter((it) => effectiveClass(it) !== null).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, drafts]
  )

  const pmTotals = useMemo(() => {
    const t: Record<string, { count: number; cost: number }> = {
      PM1: { count: 0, cost: 0 }, PM2: { count: 0, cost: 0 }, PM3: { count: 0, cost: 0 },
    }
    items.forEach((it) => {
      const c = effectiveClass(it)
      if (c) { t[c].count += 1; t[c].cost += it.total_cost }
    })
    return t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, drafts])

  const groups = useMemo<GroupRow[]>(() => {
    const q = search.trim().toLowerCase()
    const filtered = items.filter((it) => {
      if (unmappedOnly && effectiveClass(it) !== null) return false
      if (!q) return true
      return (
        it.รหัสสินค้า?.toLowerCase().includes(q) ||
        it.ชื่อสินค้า?.toLowerCase().includes(q) ||
        it.กลุ่มสินค้า?.toLowerCase().includes(q)
      )
    })
    const map = new Map<string, Item[]>()
    filtered.forEach((it) => {
      const g = it.กลุ่มสินค้า || "ไม่ระบุกลุ่ม"
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(it)
    })
    return Array.from(map.entries())
      .map(([group, its]) => ({
        group,
        items:      its.sort((a, b) => b.total_cost - a.total_cost),
        total_cost: its.reduce((s, i) => s + i.total_cost, 0),
        mapped:     its.filter((i) => effectiveClass(i) !== null).length,
      }))
      .sort((a, b) => b.total_cost - a.total_cost)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, drafts, search, unmappedOnly])

  const dirtyCount = Object.keys(drafts).length

  // ── Actions ─────────────────────────────────────────────────────────────────
  const setItemClass = (it: Item, cls: PmClass) => {
    setDrafts((prev) => {
      const next = { ...prev }
      if (cls === it.pm_class) delete next[it.รหัสสินค้า]   // back to saved state
      else next[it.รหัสสินค้า] = cls
      return next
    })
  }

  const bulkAssign = (groupItems: Item[], cls: PmClass) => {
    setDrafts((prev) => {
      const next = { ...prev }
      groupItems.forEach((it) => {
        if (cls === it.pm_class) delete next[it.รหัสสินค้า]
        else next[it.รหัสสินค้า] = cls
      })
      return next
    })
  }

  const save = async () => {
    if (!dirtyCount || saving) return
    setSaving(true)
    setError(null)
    try {
      const byCode = new Map(items.map((it) => [it.รหัสสินค้า, it]))
      const payload = Object.entries(drafts).map(([code, cls]) => {
        const it = byCode.get(code)
        return {
          รหัสสินค้า:  code,
          ชื่อสินค้า:  it?.ชื่อสินค้า ?? "",
          กลุ่มสินค้า: it?.กลุ่มสินค้า ?? "",
          pm_class:     cls,
        }
      })
      const res = await fetch("/api/pm-mapping", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ items: payload }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "Save failed")
      // merge drafts into items, clear drafts
      setItems((prev) => prev.map((it) =>
        Object.prototype.hasOwnProperty.call(drafts, it.รหัสสินค้า)
          ? { ...it, pm_class: drafts[it.รหัสสินค้า] }
          : it
      ))
      setDrafts({})
      setSavedAt(new Date())
    } catch (e: any) {
      setError(e.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const toggleGroup = (g: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.group))

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Title + Save */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">PM Mapping</h1>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 tracking-wide">
              PM ความเเย็น · PM น้ำมันเครื่อง · PM ช่วงล่าง
            </span>
          </div>
          <p className="text-xs text-gray-400">กำหนด PM1 / PM2 / PM3 ให้แต่ละรหัสสินค้า — ใช้สร้างรายงาน PM Cost</p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !dirtyCount && (
            <span className="text-xs text-emerald-600">✓ บันทึกแล้ว {savedAt.toLocaleTimeString()}</span>
          )}
          {dirtyCount > 0 && (
            <span className="text-xs font-medium text-amber-600">{dirtyCount} รายการยังไม่บันทึก</span>
          )}
          <button
            onClick={save}
            disabled={!dirtyCount || saving}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
              dirtyCount && !saving
                ? "bg-gray-900 text-white hover:bg-gray-700"
                : "bg-gray-100 text-gray-300"
            }`}
          >
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white px-5 py-4">
          <p className="text-xs text-gray-400">ความคืบหน้า</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {mappedCount}<span className="text-sm font-medium text-gray-400"> / {items.length}</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: items.length ? `${(mappedCount / items.length) * 100}%` : "0%" }}
            />
          </div>
        </div>
        {PM_OPTIONS.map((pm) => (
          <div key={pm} className="rounded-2xl border bg-white px-5 py-4">
            <p className="text-xs text-gray-400">{pm}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{pmTotals[pm].count}<span className="text-sm font-medium text-gray-400"> รายการ</span></p>
            <p className="mt-0.5 text-xs text-gray-400">฿{fmt(pmTotals[pm].cost)}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหา รหัสสินค้า / ชื่อสินค้า / กลุ่มสินค้า…"
          className="w-72 rounded-xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={unmappedOnly}
            onChange={(e) => setUnmappedOnly(e.target.checked)}
            className="h-4 w-4 rounded accent-emerald-600"
          />
          แสดงเฉพาะที่ยังไม่กำหนด
        </label>
        <button
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.group)))}
          className="rounded-xl border px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50"
        >
          {allCollapsed ? "ขยายทั้งหมด" : "ย่อทั้งหมด"}
        </button>
        {loading && <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400 animate-pulse">Loading…</span>}
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {!loading && groups.length === 0 && (
          <div className="rounded-2xl border bg-white px-5 py-10 text-center text-sm text-gray-400">
            ไม่พบรายการ
          </div>
        )}
        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.group)
          return (
            <div key={g.group} className="overflow-hidden rounded-2xl border bg-white">
              {/* Group header */}
              <div className="flex flex-wrap items-center gap-3 border-b bg-gray-50/70 px-5 py-3">
                <button onClick={() => toggleGroup(g.group)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="text-gray-400">{isCollapsed ? "▸" : "▾"}</span>
                  <span className="truncate text-sm font-semibold text-gray-800">{g.group}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    g.mapped === g.items.length ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"
                  }`}>
                    {g.mapped}/{g.items.length}
                  </span>
                  <span className="text-xs text-gray-400">฿{fmt(g.total_cost)}</span>
                </button>
                {/* Bulk assign */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400">ทั้งกลุ่ม →</span>
                  {PM_OPTIONS.map((pm) => (
                    <button
                      key={pm}
                      onClick={() => bulkAssign(g.items, pm)}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition hover:opacity-80 ${PM_STYLE[pm].badge}`}
                    >
                      {pm}
                    </button>
                  ))}
                  <button
                    onClick={() => bulkAssign(g.items, null)}
                    className="rounded-lg border px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-100"
                  >
                    ล้าง
                  </button>
                </div>
              </div>

              {/* Items */}
              {!isCollapsed && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] text-gray-400">
                      <th className="px-5 py-2 font-medium">รหัสสินค้า</th>
                      <th className="px-3 py-2 font-medium">ชื่อสินค้า</th>
                      <th className="px-3 py-2 text-right font-medium">Total Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Records</th>
                      <th className="px-5 py-2 text-right font-medium">PM Class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it) => {
                      const cls     = effectiveClass(it)
                      const isDirty = Object.prototype.hasOwnProperty.call(drafts, it.รหัสสินค้า)
                      return (
                        <tr key={it.รหัสสินค้า} className={`border-b last:border-b-0 ${isDirty ? "bg-amber-50/50" : "hover:bg-gray-50/60"}`}>
                          <td className="px-5 py-2 font-mono text-xs text-gray-600">{it.รหัสสินค้า}</td>
                          <td className="px-3 py-2 text-gray-800">{it.ชื่อสินค้า}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-800">฿{fmt(it.total_cost)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400">{it.records}</td>
                          <td className="px-5 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {isDirty && <span className="mr-1 text-[10px] text-amber-500">●</span>}
                              {PM_OPTIONS.map((pm) => {
                                const active = cls === pm
                                return (
                                  <button
                                    key={pm}
                                    onClick={() => setItemClass(it, active ? null : pm)}
                                    title={active ? "คลิกอีกครั้งเพื่อล้าง" : `กำหนดเป็น ${pm}`}
                                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                                      active ? PM_STYLE[pm].active : "border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-500"
                                    }`}
                                  >
                                    {pm}
                                  </button>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
