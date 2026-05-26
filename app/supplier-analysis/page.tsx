"use client"

import React, { useState, useMemo, useEffect, useRef } from "react"

// ── Types ──────────────────────────────────────────────────────────────────────

type RawRow = {
  ซัพพลายเออร์: string
  กลุ่มสินค้า:  string
  รหัสสินค้า:   string
  ชื่อสินค้า:   string
  year:          string
  total_cost:    number
  total_qty:     number
  total_records: number
}

type ProductEntry = {
  รหัสสินค้า: string
  ชื่อสินค้า: string
  yearly:     Record<string, number>  // year → cost
  total_cost: number
  total_qty:  number
}

type GroupEntry = {
  กลุ่มสินค้า: string
  products:    ProductEntry[]
  yearly:      Record<string, number>
  total_cost:  number
  total_qty:   number
}

type SupplierEntry = {
  ซัพพลายเออร์: string
  groups:        GroupEntry[]
  yearly:        Record<string, number>
  total_cost:    number
  total_qty:     number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(v: number) {
  if (!v) return "—"
  return v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtM(v: number) {
  if (!v) return "—"
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M"
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + "K"
  return String(v)
}

function yearRange(start: number, end: number): string[] {
  const out: string[] = []
  for (let y = start; y <= end; y++) out.push(String(y))
  return out
}

// ── Data processor ─────────────────────────────────────────────────────────────

function buildTree(rows: RawRow[]): SupplierEntry[] {
  // supplier → group → product
  const supplierMap = new Map<string, Map<string, Map<string, ProductEntry>>>()

  for (const r of rows) {
    if (!supplierMap.has(r.ซัพพลายเออร์))
      supplierMap.set(r.ซัพพลายเออร์, new Map())
    const groupMap = supplierMap.get(r.ซัพพลายเออร์)!

    if (!groupMap.has(r.กลุ่มสินค้า))
      groupMap.set(r.กลุ่มสินค้า, new Map())
    const productMap = groupMap.get(r.กลุ่มสินค้า)!

    if (!productMap.has(r.รหัสสินค้า)) {
      productMap.set(r.รหัสสินค้า, {
        รหัสสินค้า: r.รหัสสินค้า,
        ชื่อสินค้า: r.ชื่อสินค้า,
        yearly:     {},
        total_cost: 0,
        total_qty:  0,
      })
    }
    const prod = productMap.get(r.รหัสสินค้า)!
    prod.yearly[r.year]  = (prod.yearly[r.year]  ?? 0) + r.total_cost
    prod.total_cost      += r.total_cost
    prod.total_qty       += r.total_qty
  }

  // Build nested entries, sort by total_cost desc at every level
  const suppliers: SupplierEntry[] = []

  for (const [supName, groupMap] of supplierMap) {
    const groups: GroupEntry[] = []
    const supYearly: Record<string, number> = {}
    let supTotal = 0

    for (const [grpName, productMap] of groupMap) {
      const products = Array.from(productMap.values())
        .sort((a, b) => b.total_cost - a.total_cost)

      const grpYearly: Record<string, number> = {}
      let grpTotal = 0
      let grpQty   = 0
      for (const p of products) {
        for (const [y, c] of Object.entries(p.yearly)) {
          grpYearly[y] = (grpYearly[y] ?? 0) + c
          supYearly[y] = (supYearly[y] ?? 0) + c
        }
        grpTotal += p.total_cost
        grpQty   += p.total_qty
        supTotal += p.total_cost
      }

      groups.push({ กลุ่มสินค้า: grpName, products, yearly: grpYearly, total_cost: grpTotal, total_qty: grpQty })
    }

    const supQty = groups.reduce((s, g) => s + g.total_qty, 0)
    groups.sort((a, b) => b.total_cost - a.total_cost)
    suppliers.push({ ซัพพลายเออร์: supName, groups, yearly: supYearly, total_cost: supTotal, total_qty: supQty })
  }

  suppliers.sort((a, b) => b.total_cost - a.total_cost)
  return suppliers
}

// ── Supplier Multi-Autocomplete ────────────────────────────────────────────────

function SupplierAutocomplete({
  options,
  selected,
  onChange,
  disabled,
}: {
  options:   string[]
  selected:  string[]
  onChange:  (v: string[]) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState("")
  const [open,  setOpen]  = useState(false)
  const containerRef       = useRef<HTMLDivElement>(null)
  const inputRef           = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return options.filter(o => !selected.includes(o) && (!q || o.toLowerCase().includes(q)))
  }, [query, options, selected])

  function add(opt: string) {
    onChange([...selected, opt])
    setQuery("")
    inputRef.current?.focus()
  }

  function remove(opt: string) {
    onChange(selected.filter(s => s !== opt))
  }

  function clearAll() {
    onChange([])
    setQuery("")
    setOpen(false)
  }

  function highlight(text: string) {
    const q = query.trim()
    if (!q) return <>{text}</>
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return <>{text}</>
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-100 text-yellow-800 rounded-sm not-italic">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input box with chips */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-300 cursor-text min-h-[38px]"
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        {/* Selected chips */}
        {selected.map(s => (
          <span
            key={s}
            className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full shrink-0"
          >
            {s}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); remove(s) }}
              className="hover:text-indigo-900 leading-none"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder={selected.length === 0 ? "พิมพ์เพื่อค้นหา..." : "เพิ่ม..."}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none disabled:opacity-50"
        />

        {/* Clear all */}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); clearAll() }}
            className="text-gray-400 hover:text-gray-600 shrink-0 ml-1"
            title="ล้างทั้งหมด"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-400 text-center">
              {query ? "ไม่พบซัพพลายเออร์" : "เลือกครบแล้ว"}
            </p>
          ) : (
            filtered.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => add(opt)}
                className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-indigo-50 hover:text-indigo-700 truncate"
              >
                {highlight(opt)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Year cell ──────────────────────────────────────────────────────────────────

function YearCell({
  value,
  years,
  colW,
}: {
  value: number | undefined
  years: string[]
  colW: string
}) {
  return (
    <span
      className="tabular-nums text-right shrink-0 text-xs"
      style={{ width: colW }}
    >
      {value ? fmt(value) : <span className="text-gray-200">—</span>}
    </span>
  )
}

// ── Row components ─────────────────────────────────────────────────────────────

function ProductRow({
  product,
  years,
  colW,
}: {
  product: ProductEntry
  years:   string[]
  colW:    string
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-gray-50 hover:bg-gray-50/60 group">
      {/* Indent spacer */}
      <span className="w-8 shrink-0" />

      {/* Code */}
      <span className="font-mono text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0 leading-tight">
        {product.รหัสสินค้า}
      </span>

      {/* Name */}
      <span className="text-xs text-gray-600 flex-1 truncate">
        {product.ชื่อสินค้า}
      </span>

      {/* Year columns */}
      {years.map(y => (
        <YearCell key={y} value={product.yearly[y]} years={years} colW={colW} />
      ))}

      {/* Total */}
      <span className="tabular-nums text-right text-xs font-semibold text-gray-700 shrink-0" style={{ width: colW }}>
        {fmt(product.total_cost)}
      </span>

      {/* Qty */}
      <span className="tabular-nums text-right text-xs text-emerald-600 shrink-0 w-20">
        {product.total_qty ? product.total_qty.toLocaleString() : <span className="text-gray-200">—</span>}
      </span>
    </div>
  )
}

function GroupSection({
  group,
  years,
  colW,
  supplierOpen,
}: {
  group:        GroupEntry
  years:        string[]
  colW:         string
  supplierOpen: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-gray-50/80 hover:bg-gray-100/80 border-b border-gray-100 text-left"
      >
        {/* Chevron */}
        <svg
          className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>

        {/* Group name */}
        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">
          {group.กลุ่มสินค้า}
        </span>

        {/* SKU count */}
        <span className="text-[10px] text-gray-400 shrink-0">{group.products.length} รายการ</span>

        {/* Year columns */}
        {years.map(y => (
          <span
            key={y}
            className="tabular-nums text-right text-xs text-gray-500 shrink-0"
            style={{ width: colW }}
          >
            {group.yearly[y] ? fmtM(group.yearly[y]) : <span className="text-gray-200">—</span>}
          </span>
        ))}

        {/* Total */}
        <span
          className="tabular-nums text-right text-xs font-bold text-violet-700 shrink-0"
          style={{ width: colW }}
        >
          {fmtM(group.total_cost)}
        </span>

        {/* Qty */}
        <span className="tabular-nums text-right text-xs font-semibold text-emerald-600 shrink-0 w-20">
          {group.total_qty ? group.total_qty.toLocaleString() : <span className="text-gray-200">—</span>}
        </span>
      </button>

      {/* Products */}
      {open && (
        <div>
          {group.products.map(p => (
            <ProductRow key={p.รหัสสินค้า} product={p} years={years} colW={colW} />
          ))}
        </div>
      )}
    </div>
  )
}

function SupplierBlock({
  supplier,
  years,
  colW,
  rank,
}: {
  supplier: SupplierEntry
  years:    string[]
  colW:     string
  rank:     number
}) {
  const [open, setOpen] = useState(rank <= 5)

  const grandTotal = supplier.total_cost

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Supplier header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 text-left"
      >
        {/* Rank */}
        <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center shrink-0">
          {rank}
        </span>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {/* Name */}
        <span className="text-sm font-bold text-gray-900 flex-1 truncate">
          {supplier.ซัพพลายเออร์}
        </span>

        {/* Group count */}
        <span className="text-[10px] text-gray-400 shrink-0">
          {supplier.groups.length} กลุ่ม · {supplier.groups.reduce((s, g) => s + g.products.length, 0)} รายการ
        </span>

        {/* Year costs */}
        {years.map(y => (
          <span
            key={y}
            className="tabular-nums text-right text-xs font-semibold text-gray-600 shrink-0"
            style={{ width: colW }}
          >
            {supplier.yearly[y] ? fmtM(supplier.yearly[y]) : <span className="text-gray-300">—</span>}
          </span>
        ))}

        {/* Grand total */}
        <span
          className="tabular-nums text-right text-sm font-extrabold text-indigo-700 shrink-0"
          style={{ width: colW }}
        >
          ฿{fmtM(grandTotal)}
        </span>

        {/* Qty */}
        <span className="tabular-nums text-right text-xs font-bold text-emerald-600 shrink-0 w-20">
          {supplier.total_qty ? supplier.total_qty.toLocaleString() : <span className="text-gray-300">—</span>}
        </span>
      </button>

      {/* Groups */}
      {open && (
        <div>
          {supplier.groups.map(g => (
            <GroupSection
              key={g.กลุ่มสินค้า}
              group={g}
              years={years}
              colW={colW}
              supplierOpen={open}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Column header row ──────────────────────────────────────────────────────────

function ColumnHeaders({ years, colW }: { years: string[]; colW: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2 bg-white border border-gray-200 rounded-xl shadow-sm sticky top-0 z-10">
      <span className="flex-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        ซัพพลายเออร์ / กลุ่ม / รหัสสินค้า
      </span>
      {years.map(y => (
        <span
          key={y}
          className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 text-right shrink-0"
          style={{ width: colW }}
        >
          {y}
        </span>
      ))}
      <span
        className="text-[10px] font-bold uppercase tracking-widest text-gray-500 text-right shrink-0"
        style={{ width: colW }}
      >
        รวม
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 text-right shrink-0 w-20">
        จำนวน
      </span>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const CUR_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: CUR_YEAR - 2019 }, (_, i) => String(2020 + i))

export default function SupplierAnalysisPage() {
  const [startYear,      setStartYear]      = useState(String(CUR_YEAR - 2))
  const [endYear,        setEndYear]        = useState(String(CUR_YEAR))
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([])
  const [selectedWarehouse, setSelectedWarehouse]  = useState("")

  const [supplierOptions,  setSupplierOptions]  = useState<string[]>([])
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([])
  const [optionsLoading,   setOptionsLoading]   = useState(true)

  const [rows,       setRows]       = useState<RawRow[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState("")
  const [hasSearched,setHasSearched]= useState(false)

  // Load dropdown options once on mount
  useEffect(() => {
    fetch("/api/cost/supplier-analysis/options", { cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setSupplierOptions(json.suppliers)
          setWarehouseOptions(json.warehouses)
        }
      })
      .catch(() => {})
      .finally(() => setOptionsLoading(false))
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    setHasSearched(true)

    const params = new URLSearchParams({ startYear, endYear })
    if (selectedSuppliers.length > 0) params.set("supplier",  selectedSuppliers.join(","))
    if (selectedWarehouse)            params.set("warehouse", selectedWarehouse)

    try {
      const res  = await fetch(`/api/cost/supplier-analysis?${params}`, { cache: "no-store" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "API error")
      setRows(json.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const years    = useMemo(() => yearRange(Number(startYear), Number(endYear)), [startYear, endYear])
  const suppliers = useMemo(() => buildTree(rows), [rows])

  // Dynamic column width: fewer years → wider, more years → narrower
  const colW = years.length <= 3 ? "88px" : years.length <= 5 ? "76px" : "64px"

  const grandTotal  = suppliers.reduce((s, x) => s + x.total_cost, 0)
  const grandQty    = suppliers.reduce((s, x) => s + x.total_qty,  0)
  const grandYearly = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of suppliers)
      for (const [y, c] of Object.entries(s.yearly))
        map[y] = (map[y] ?? 0) + c
    return map
  }, [suppliers])

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">วิเคราะห์ยอดซื้อรายซัพพลายเออร์</h1>
        <p className="text-sm text-gray-500 mt-1">
          จัดกลุ่มตาม ซัพพลายเออร์ → กลุ่มสินค้า → รหัสสินค้า · เปรียบเทียบรายปี
        </p>
      </div>

      {/* Filter form */}
      <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ปีเริ่มต้น</label>
            <select
              value={startYear}
              onChange={e => setStartYear(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{Number(y) + 543} ({y})</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ปีสิ้นสุด</label>
            <select
              value={endYear}
              onChange={e => setEndYear(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{Number(y) + 543} ({y})</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              ซัพพลายเออร์
              {selectedSuppliers.length > 0 && (
                <span className="ml-2 text-indigo-500 normal-case font-normal">
                  · {selectedSuppliers.length} รายการ
                </span>
              )}
            </label>
            <SupplierAutocomplete
              options={supplierOptions}
              selected={selectedSuppliers}
              onChange={setSelectedSuppliers}
              disabled={optionsLoading}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              คลังสินค้า
            </label>
            <select
              value={selectedWarehouse}
              onChange={e => setSelectedWarehouse(e.target.value)}
              disabled={optionsLoading}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <option value="">ทั้งหมด</option>
              {warehouseOptions.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex justify-end mt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />กำลังโหลด...</>
            ) : "ค้นหา"}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 text-sm bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}

      {/* Empty state */}
      {!hasSearched && !loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">เลือกช่วงปีแล้วกด ค้นหา</p>
          <p className="text-xs text-gray-400 mt-1">ระบบจะแสดงยอดซื้อแยกรายปี จัดกลุ่มตามซัพพลายเออร์ กลุ่มสินค้า และรหัสสินค้า</p>
        </div>
      )}

      {/* No results */}
      {hasSearched && !loading && !error && suppliers.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400 shadow-sm">
          ไม่พบข้อมูลสำหรับเงื่อนไขที่เลือก
        </div>
      )}

      {/* Results */}
      {suppliers.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-indigo-50 border border-indigo-100 rounded-xl">
            <span className="text-xs font-bold text-indigo-700">
              {suppliers.length} ซัพพลายเออร์
            </span>
            <span className="text-xs text-indigo-500">
              {suppliers.reduce((s, x) => s + x.groups.length, 0)} กลุ่มสินค้า
            </span>
            <span className="text-xs text-indigo-500">
              {suppliers.reduce((s, x) => s + x.groups.reduce((gs, g) => gs + g.products.length, 0), 0)} รหัสสินค้า
            </span>
            <span className="ml-auto text-sm font-extrabold text-indigo-800 tabular-nums">
              รวมทั้งหมด ฿{fmt(grandTotal)}
            </span>
          </div>

          {/* Column headers */}
          <ColumnHeaders years={years} colW={colW} />

          {/* Grand total row */}
          <div className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 rounded-xl text-white">
            <span className="text-xs font-bold flex-1">รวมทุกซัพพลายเออร์</span>
            {years.map(y => (
              <span
                key={y}
                className="tabular-nums text-right text-xs font-semibold shrink-0"
                style={{ width: colW }}
              >
                {grandYearly[y] ? fmtM(grandYearly[y]) : <span className="opacity-30">—</span>}
              </span>
            ))}
            <span
              className="tabular-nums text-right text-sm font-extrabold shrink-0"
              style={{ width: colW }}
            >
              ฿{fmtM(grandTotal)}
            </span>
            <span className="tabular-nums text-right text-xs font-bold text-emerald-200 shrink-0 w-20">
              {grandQty.toLocaleString()}
            </span>
          </div>

          {/* Supplier blocks */}
          <div className="flex flex-col gap-4">
            {suppliers.map((s, i) => (
              <SupplierBlock
                key={s.ซัพพลายเออร์}
                supplier={s}
                years={years}
                colW={colW}
                rank={i + 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
