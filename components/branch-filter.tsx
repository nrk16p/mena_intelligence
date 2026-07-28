"use client"

import { useState } from "react"

/** The 4 warehouses in stockmovement_v5 (mirror of BRANCHES in lib/price-benchmark). */
export const PB_BRANCHES = ["คลังลาดกระบัง", "คลังสระบุรี", "คลัง DIST", "คลังขอนแก่น"]

/**
 * ตัวกรอง "คลังสินค้า" (สาขา) แบบ multi-select สำหรับ /price-benchmark.
 * ค่าเริ่มต้น = เลือกครบทุกคลัง (= ไม่กรอง = พฤติกรรมเดิม บริษัทรวม).
 * ราคากลางไม่เปลี่ยนตามคลัง — ตัวกรองนี้แค่จำกัดว่าจะนับ/แสดงรายการรับของคลังไหน
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
  const border = "#E5E7EB"
  const filtering = selected.size > 0 && selected.size < allBranches.length
  const toggle = (b: string) => {
    const s = new Set(selected)
    if (s.has(b)) s.delete(b)
    else s.add(b)
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
              width: 240, background: "#fff",
              border: `1px solid ${border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 10,
            }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button type="button" onClick={() => onChange(new Set(allBranches))} style={miniBtn}>เลือกทั้งหมด</button>
              <button type="button" onClick={() => onChange(new Set())} style={miniBtn}>ล้าง</button>
            </div>
            {allBranches.map((b) => (
              <label key={b} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 13, cursor: "pointer", borderRadius: 6 }}>
                <input type="checkbox" checked={selected.has(b)} onChange={() => toggle(b)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const miniBtn: React.CSSProperties = {
  flex: 1, padding: "5px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#374151",
}
