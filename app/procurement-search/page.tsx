"use client"

import React, { useState, useCallback } from "react"
import { Search, ChevronRight, Package, FileText, ShoppingCart, Truck, ArrowLeftRight, Loader2, AlertCircle } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

type DD = Record<string, unknown>
type Item = Record<string, unknown>
type MR = Record<string, unknown>

type SearchResult = {
  query: string
  type: "WD" | "DD" | "MR" | "PO" | "PR" | "unknown"
  // DD search
  dd?: DD | null
  dd_items?: Item[]
  mr?: MR | null
  mr_parts?: Item[]
  related_wds?: string[]
  // WD search
  dds?: DD[]
  // MR search
  wds?: string[]
  // PO search
  po_code?: string
  // PR search
  pr_code?: string
  pos?: DD[]
  note?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  MR: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-700",
  WD: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700",
  DD: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-700",
  PO: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700",
  PR: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 border-pink-200 dark:border-pink-700",
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  MR: <Truck className="w-4 h-4" />,
  WD: <ArrowLeftRight className="w-4 h-4" />,
  DD: <Package className="w-4 h-4" />,
  PO: <ShoppingCart className="w-4 h-4" />,
  PR: <FileText className="w-4 h-4" />,
}

const TYPE_LABELS: Record<string, string> = {
  MR: "ใบแจ้งซ่อม",
  WD: "ใบเบิก",
  DD: "ใบรับสินค้า",
  PO: "ใบสั่งซื้อ",
  PR: "ใบขอสั่งซื้อ",
}

function CodeBadge({ code, type, onClick }: { code: string; type: string; onClick?: (c: string) => void }) {
  const cls = TYPE_COLORS[type] || "bg-gray-100 text-gray-700 border-gray-200"
  return (
    <button
      onClick={() => onClick?.(code)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm font-mono font-medium transition-opacity hover:opacity-80 ${cls}`}
    >
      {TYPE_ICONS[type]}
      {code}
    </button>
  )
}

function NodeCard({ type, code, children, onSearch }: { type: string; code: string; children?: React.ReactNode; onSearch: (c: string) => void }) {
  const cls = TYPE_COLORS[type] || ""
  return (
    <div className={`rounded-xl border p-4 ${cls.includes("purple") ? "border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20" : cls.includes("blue") ? "border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20" : cls.includes("green") ? "border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20" : cls.includes("amber") ? "border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20" : "border-pink-200 dark:border-pink-700 bg-pink-50 dark:bg-pink-900/20"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold uppercase ${TYPE_COLORS[type]}`}>
          {TYPE_ICONS[type]} {type}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{TYPE_LABELS[type]}</span>
        <button onClick={() => onSearch(code)} className="ml-auto text-xs underline text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          ค้นหา
        </button>
      </div>
      <div className="font-mono font-semibold text-sm mb-2">{code}</div>
      {children}
    </div>
  )
}

function Connector({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
      {label && <span className="text-xs text-gray-400 dark:text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{label}</span>}
      <ChevronRight className="w-4 h-4 text-gray-400 rotate-90" />
    </div>
  )
}

function ItemsTable({ items }: { items: Item[] }) {
  if (!items.length) return null
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 text-left font-medium">กลุ่มสินค้า</th>
            <th className="px-3 py-2 text-left font-medium">สินค้า</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Unit Price</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-left font-medium">Remark</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {items.map((it, i) => (
            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{String(it.parts_group || "")}</td>
              <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200 font-mono">{String(it.item || "")}</td>
              <td className="px-3 py-1.5 text-right">{String(it.qty || "")}</td>
              <td className="px-3 py-1.5 text-right">{String(it.unit_price || "")}</td>
              <td className="px-3 py-1.5 text-right font-medium">{String(it.total || "")}</td>
              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{String(it.remark || "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DDCard({ dd, items, onSearch }: { dd: DD; items: Item[]; onSearch: (c: string) => void }) {
  const code = String(dd.deposit_code || "")
  return (
    <NodeCard type="DD" code={code} onSearch={onSearch}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600 dark:text-gray-300">
        <span>คลัง: <b>{String(dd.warehouse || "—")}</b></span>
        <span>ยอด: <b>{String(dd.amount || "—")}</b></span>
        <span>รับเมื่อ: {String(dd.received_at || "—")}</span>
        <span>ผู้ใช้: {String(dd.user || "—")}</span>
        {!!dd.supplier && <span className="col-span-2">ซัพพลายเออร์: {String(dd.supplier)}</span>}
        {!!dd.withdraw_ref && <span className="col-span-2">อ้างอิง WD: <CodeBadge code={String(dd.withdraw_ref)} type="WD" onClick={onSearch} /></span>}
        {!!dd.purchase_order && <span className="col-span-2">อ้างอิง PO: <CodeBadge code={String(dd.purchase_order)} type="PO" onClick={onSearch} /></span>}
      </div>
      <ItemsTable items={items.filter(it => it.deposit_id === dd.deposit_id)} />
    </NodeCard>
  )
}

function MRPartsTable({ parts }: { parts: Item[] }) {
  if (!parts.length) return null
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
            <th className="px-3 py-2 text-left font-medium">กลุ่ม</th>
            <th className="px-3 py-2 text-left font-medium">อะไหล่</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Unit Price</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {parts.map((it, i) => (
            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{String(it.parts_group || "")}</td>
              <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200 font-mono">{String(it.part || "")}</td>
              <td className="px-3 py-1.5 text-right">{String(it.qty || "")}</td>
              <td className="px-3 py-1.5 text-right">{String(it.unit_price || "")}</td>
              <td className="px-3 py-1.5 text-right font-medium">{String(it.total || "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MRCard({ mr, parts, onSearch }: { mr: MR; parts?: Item[]; onSearch: (c: string) => void }) {
  const code = String(mr.request_code || "")
  return (
    <NodeCard type="MR" code={code} onSearch={onSearch}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600 dark:text-gray-300">
        <span>ทะเบียน: <b>{String(mr.plate_no || "—")}</b></span>
        <span>สาขา: {String(mr.branch || "—")}</span>
        <span>แจ้งซ่อม: {String(mr.reported_at || "—")}</span>
        <span>ช่าง: {String(mr.mechanic || "—")}</span>
        {!!mr.owner_type && <span className="col-span-2">ประเภท: {String(mr.owner_type)}</span>}
        {!!mr.step && <span className="col-span-2">ขั้นตอน: {String(mr.step)}</span>}
      </div>
      {parts && parts.length > 0 && <MRPartsTable parts={parts} />}
    </NodeCard>
  )
}

function PendingNode({ type, code }: { type: string; code: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-4 opacity-60">
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold uppercase ${TYPE_COLORS[type] || ""}`}>
          {TYPE_ICONS[type]} {type}
        </span>
        <span className="text-xs text-gray-400">ยังไม่ได้ index</span>
      </div>
      <div className="font-mono text-sm text-gray-400">{code}</div>
    </div>
  )
}

// ── Chain Renderer ─────────────────────────────────────────────────────────────

function ChainView({ result, onSearch }: { result: SearchResult; onSearch: (c: string) => void }) {
  const { type, query } = result

  if (type === "DD") {
    const dd = result.dd
    const items = result.dd_items || []
    const mr = result.mr
    const mrParts = result.mr_parts || []
    const wds = result.related_wds || []
    if (!dd) return <p className="text-sm text-gray-500">ไม่พบ DD: {query}</p>
    return (
      <div className="flex flex-col items-stretch max-w-2xl">
        {mr && (<><MRCard mr={mr} parts={mrParts} onSearch={onSearch} /><Connector label="ออกใบเบิก" /></>)}
        {wds.length > 0 && !mr && (
          <><PendingNode type="MR" code="(ยังไม่ได้ index)" /><Connector label="ออกใบเบิก" /></>
        )}
        {wds.map(wd => (
          <div key={wd}><CodeBadge code={wd} type="WD" onClick={onSearch} /><Connector label="คืนสินค้า" /></div>
        ))}
        <DDCard dd={dd} items={items} onSearch={onSearch} />
      </div>
    )
  }

  if (type === "WD") {
    const dds = result.dds || []
    const items = result.dd_items || []
    const mr = result.mr
    const mrParts = result.mr_parts || []
    return (
      <div className="flex flex-col items-stretch max-w-2xl">
        {mr
          ? <><MRCard mr={mr} parts={mrParts} onSearch={onSearch} /><Connector label="ออกใบเบิก" /></>
          : <><PendingNode type="MR" code="(ยังไม่ได้ index)" /><Connector label="ออกใบเบิก" /></>
        }
        <NodeCard type="WD" code={query} onSearch={onSearch}>
          <p className="text-xs text-gray-500 dark:text-gray-400">รหัสใบเบิก · พบ DD คืนสินค้า: {dds.length} ใบ</p>
        </NodeCard>
        {dds.length > 0 && <Connector label="คืนสินค้า" />}
        {dds.map((dd, i) => (
          <div key={i}>
            {i > 0 && <div className="h-2" />}
            <DDCard dd={dd} items={items} onSearch={onSearch} />
          </div>
        ))}
        {dds.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">ยังไม่มี DD คืนสินค้าที่อ้างอิง WD นี้</p>
        )}
      </div>
    )
  }

  if (type === "MR") {
    const mr = result.mr
    const wds = result.wds || []
    const dds = result.dds || []
    const items = result.dd_items || []
    const mrParts = result.mr_parts || []
    if (!mr) return <p className="text-sm text-gray-500">ยังไม่ได้ index MR: {query} — รันการ crawl ก่อน</p>
    return (
      <div className="flex flex-col items-stretch max-w-2xl">
        <MRCard mr={mr} parts={mrParts} onSearch={onSearch} />
        {wds.length === 0 && <p className="text-xs text-gray-400 mt-3">ยังไม่มีใบเบิก (WD) ที่เชื่อมกับ MR นี้</p>}
        {wds.map(wd => {
          const relDDs = dds.filter((dd: DD) => String(dd.withdraw_ref) === wd)
          return (
            <div key={wd}>
              <Connector label="ออกใบเบิก" />
              <NodeCard type="WD" code={wd} onSearch={onSearch}>
                <p className="text-xs text-gray-500">พบ DD คืนสินค้า: {relDDs.length} ใบ</p>
              </NodeCard>
              {relDDs.map((dd: DD, i: number) => (
                <div key={i}>
                  <Connector label="คืนสินค้า" />
                  <DDCard dd={dd} items={items} onSearch={onSearch} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  if (type === "PO") {
    const dds = result.dds || []
    const items = result.dd_items || []
    return (
      <div className="flex flex-col items-stretch max-w-2xl">
        <PendingNode type="PR" code="(ยังไม่ได้ index)" />
        <Connector label="อนุมัติสั่งซื้อ" />
        <NodeCard type="PO" code={query} onSearch={onSearch}>
          <p className="text-xs text-gray-500">พบ DD รับสินค้า: {dds.length} ใบ</p>
        </NodeCard>
        {dds.length > 0 && <Connector label="รับสินค้า" />}
        {dds.map((dd: DD, i: number) => (
          <div key={i}>
            {i > 0 && <div className="h-2" />}
            <DDCard dd={dd} items={items} onSearch={onSearch} />
          </div>
        ))}
      </div>
    )
  }

  if (type === "PR") {
    const note = result.note
    const pos = result.pos || []
    const dds = result.dds || []
    return (
      <div className="flex flex-col items-stretch max-w-2xl">
        <PendingNode type="MR" code="(ยังไม่ได้ index)" />
        <Connector label="ขอซื้อ" />
        <NodeCard type="PR" code={query} onSearch={onSearch}>
          {note && <p className="text-xs text-amber-600 dark:text-amber-400">{note}</p>}
          <p className="text-xs text-gray-500">พบ PO: {pos.length} ใบ</p>
        </NodeCard>
        {pos.map((po: DD, i: number) => (
          <div key={i}>
            <Connector label="สั่งซื้อ" />
            <NodeCard type="PO" code={String(po.po_code || "")} onSearch={onSearch}>
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>รถ: {String(po.vehicle || "—")}</div>
                <div>ซัพพลายเออร์: {String(po.supplier || "—")}</div>
              </div>
            </NodeCard>
          </div>
        ))}
        {dds.length > 0 && <Connector label="รับสินค้า" />}
        {dds.map((dd: DD, i: number) => (
          <div key={i}><DDCard dd={dd} items={[]} onSearch={onSearch} /></div>
        ))}
      </div>
    )
  }

  return <p className="text-sm text-gray-500">ไม่รู้จักรูปแบบรหัส: {query}</p>
}

// ── Page ───────────────────────────────────────────────────────────────────────

const EXAMPLES = ["SBDD26060615", "SBWD26060650", "SBPO26060489", "SBMR26060269", "SBPR26060417"]

export default function ProcurementSearchPage() {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])

  const search = useCallback(async (q: string) => {
    const code = q.trim().toUpperCase()
    if (!code) return
    setLoading(true)
    setError(null)
    setResult(null)
    setInput(code)
    try {
      const res = await fetch(`/api/procurement-search?q=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      setHistory(prev => [code, ...prev.filter(h => h !== code)].slice(0, 10))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Procurement Search</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          ค้นหา MR · WD · DD · PO · PR — แสดงห่วงโซ่เชื่อมโยงทั้งหมด
        </p>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && search(input)}
            placeholder="SBMR… / SBWD… / SBDD… / SBPO… / SBPR…"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => search(input)}
          disabled={loading}
          className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          ค้นหา
        </button>
      </div>

      {/* Examples */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-400">ตัวอย่าง:</span>
        {EXAMPLES.map(ex => {
          const type = ex.includes("WD") ? "WD" : ex.includes("DD") ? "DD" : ex.includes("MR") ? "MR" : ex.match(/PO\d/) ? "PO" : "PR"
          return <CodeBadge key={ex} code={ex} type={type} onClick={search} />
        })}
      </div>

      {/* History */}
      {history.length > 1 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-400">ล่าสุด:</span>
          {history.slice(1).map(h => {
            const type = h.includes("WD") ? "WD" : h.includes("DD") ? "DD" : h.includes("MR") ? "MR" : h.match(/PO\d/) ? "PO" : "PR"
            return <CodeBadge key={h} code={h} type={type} onClick={search} />
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm font-bold ${TYPE_COLORS[result.type] || ""}`}>
              {TYPE_ICONS[result.type]} {result.type}
            </span>
            <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">{result.query}</span>
            <span className="text-xs text-gray-400">{TYPE_LABELS[result.type] || "ไม่รู้จัก"}</span>
          </div>
          <ChainView result={result} onSearch={search} />
        </div>
      )}
    </div>
  )
}
