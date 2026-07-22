"use client"

import { useState } from "react"

// ตัวกรอง "กลุ่มสินค้า" แบบ multi-select ใช้ร่วมกันหลายหน้า KPI
export function GroupFilter({
  allGroups,
  selected,
  onChange,
  defaultGroups,
}: {
  allGroups: string[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
  defaultGroups?: string[] // ชุดเริ่มต้น (เฉพาะอะไหล่) — ถ้ามี จะโชว์ปุ่มรีเซ็ต
}) {
  const [open, setOpen] = useState(false)
  const border = "#E5E7EB"
  const toggle = (g: string) => {
    const s = new Set(selected)
    if (s.has(g)) s.delete(g)
    else s.add(g)
    onChange(s)
  }
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
          border: `1px solid ${selected.size < allGroups.length ? "#2563EB" : border}`,
          background: selected.size < allGroups.length ? "#EFF6FF" : "#fff",
          color: "#111827", display: "inline-flex", alignItems: "center", gap: 6,
        }}
      >
        🔎 กรองกลุ่มสินค้า ({selected.size}/{allGroups.length}) ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 31,
              width: 300, maxHeight: 360, overflowY: "auto", background: "#fff",
              border: `1px solid ${border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 10,
            }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {defaultGroups && (
                <button onClick={() => onChange(new Set(defaultGroups))} style={{ ...miniBtn, background: "#EFF6FF", borderColor: "#2563EB", color: "#1D4ED8" }}>เฉพาะอะไหล่</button>
              )}
              <button onClick={() => onChange(new Set(allGroups))} style={miniBtn}>เลือกทั้งหมด</button>
              <button onClick={() => onChange(new Set())} style={miniBtn}>ล้าง</button>
            </div>
            {allGroups.map((g) => (
              <label key={g} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", fontSize: 13, cursor: "pointer", borderRadius: 6 }}>
                <input type="checkbox" checked={selected.has(g)} onChange={() => toggle(g)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g}</span>
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
