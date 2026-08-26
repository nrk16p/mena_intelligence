"use client"

import { useMemo, useState } from "react"
import { WAREHOUSE_GROUPS, WAREHOUSE_NAMES, LEGACY_WAREHOUSES } from "@/lib/warehouses"

/** All warehouses in stockmovement_v5. Re-exported so pages keep one import. */
export const PB_BRANCHES = WAREHOUSE_NAMES

/** The 4 spare-parts warehouses — the list this filter offered before 2026-08. */
export const PB_LEGACY_BRANCHES = LEGACY_WAREHOUSES

/**
 * ตัวกรอง "คลังสินค้า" (สาขา) แบบ multi-select สำหรับ /price-benchmark.
 * ค่าเริ่มต้น = เลือกครบทุกคลัง (= ไม่กรอง = พฤติกรรมเดิม บริษัทรวม).
 * ราคากลางไม่เปลี่ยนตามคลัง — ตัวกรองนี้แค่จำกัดว่าจะนับ/แสดงรายการรับของคลังไหน
 *
 * 32 คลังยาวเกินกว่าจะเป็นรายการแบน ๆ จึงแบ่งเป็นกลุ่มตามหน้าที่ + มีช่องค้นหา
 * และปุ่มลัด "เฉพาะอะไหล่" สำหรับกลับไปดู 4 คลังหลักแบบเดิม
 */
export function BranchFilter({
  allBranches,
  selected,
  onChange,
}: {
  allBranches: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const border = "#E5E7EB"
  const filtering = selected.size > 0 && selected.size < allBranches.length

  // Only offer warehouses the caller actually passed in, so a page can still
  // narrow the universe without this component inventing options.
  const groups = useMemo(() => {
    const allowed = new Set(allBranches)
    const needle = q.trim().toLowerCase()
    return WAREHOUSE_GROUPS
      .map((g) => ({
        label: g.label,
        names: g.items
          .map((w) => w.name)
          .filter((n) => allowed.has(n) && (!needle || n.toLowerCase().includes(needle))),
      }))
      .filter((g) => g.names.length > 0)
  }, [allBranches, q])

  const toggle = (b: string) => {
    const s = new Set(selected)
    if (s.has(b)) s.delete(b)
    else s.add(b)
    onChange(s)
  }

  const toggleGroup = (names: string[], allOn: boolean) => {
    const s = new Set(selected)
    for (const n of names) {
      if (allOn) s.delete(n)
      else s.add(n)
    }
    onChange(s)
  }

  const label =
    selected.size === 0 || selected.size === allBranches.length
      ? "ทุกคลัง"
      : selected.size === 1
        ? [...selected][0]
        : `${selected.size} คลัง`

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
          border: `1px solid ${filtering ? "#2563EB" : border}`,
          background: filtering ? "#EFF6FF" : "#fff",
          color: "#111827", display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        🏬 คลัง: {label} ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 31,
              width: 300, background: "#fff",
              border: `1px solid ${border}`, borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 10,
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาคลัง…"
              style={{
                width: "100%", padding: "6px 9px", marginBottom: 8, fontSize: 13,
                border: `1px solid ${border}`, borderRadius: 8, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button type="button" onClick={() => onChange(new Set(allBranches))} style={miniBtn}>
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => onChange(new Set(allBranches.filter((b) => LEGACY_WAREHOUSES.includes(b))))}
                style={miniBtn}
              >
                เฉพาะอะไหล่
              </button>
              <button type="button" onClick={() => onChange(new Set())} style={miniBtn}>
                ล้าง
              </button>
            </div>

            <div style={{ maxHeight: 340, overflowY: "auto", paddingRight: 2 }}>
              {groups.length === 0 && (
                <div style={{ fontSize: 12, color: "#9CA3AF", padding: "10px 4px", textAlign: "center" }}>
                  ไม่พบคลังที่ตรงกับ “{q}”
                </div>
              )}
              {groups.map((g) => {
                const on = g.names.filter((n) => selected.has(n)).length
                const allOn = on === g.names.length
                return (
                  <div key={g.label} style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "4px 4px 3px", borderBottom: `1px solid ${border}`, marginBottom: 3,
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>
                        {g.label} <span style={{ fontWeight: 500 }}>({on}/{g.names.length})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.names, allOn)}
                        style={{
                          border: "none", background: "none", cursor: "pointer",
                          fontSize: 11, fontWeight: 600, color: "#2563EB", padding: 0,
                        }}
                      >
                        {allOn ? "เอาออก" : "เลือกทั้งกลุ่ม"}
                      </button>
                    </div>
                    {g.names.map((b) => (
                      <label
                        key={b}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "5px 4px",
                          fontSize: 13, cursor: "pointer", borderRadius: 6,
                        }}
                      >
                        <input type="checkbox" checked={selected.has(b)} onChange={() => toggle(b)} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {b}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const miniBtn: React.CSSProperties = {
  flex: 1, padding: "5px 6px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#374151",
}
